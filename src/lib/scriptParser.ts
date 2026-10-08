import { v4 as uuid } from 'uuid';
import type { ScriptEntry, Language } from '../types';

/**
 * Heuristic play-script parser.
 *
 * Supports common script conventions in both English and Hebrew:
 *   - "NAME:" or "NAME." at the start of a line, followed by the line text
 *     either on the same line or the lines after it.
 *   - A standalone line that is ALL CAPS (English) or short and followed by
 *     a colon is treated as a character cue.
 *   - Lines wrapped in parentheses / brackets, or starting with common stage
 *     direction markers, are treated as stage directions rather than dialogue.
 */

const DIRECTION_WRAPPERS = /^[(\[].*[)\]]$/;

// A character cue line looks like "ROMEO:", "JULIET.", "יוליה:", "רומיאו." etc.
// Allow letters (incl. Hebrew), spaces, dots, numbers (e.g. "GUARD 1"), and hyphens in the name.
const CUE_LINE = /^([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF '.-]{0,40}?)\s*[:.]\s*(.*)$/;

// Candidate split points for a joint character cue like "ALON and OREN",
// "אלון ואורן", "אלון, אורן ודנה", or "ALON & OREN". These are only ever
// applied speculatively (see resolveCueCharacters below): a cue is actually
// split into separate characters only if every resulting part also appears
// elsewhere in the script as its own standalone cue — otherwise it's kept as
// one single (compound) character name, since e.g. a name could legitimately
// contain "and"-like substrings or only ever appear jointly.
const JOINT_SEPARATORS = /\s*(?:,|&|\band\b)\s*/gi;
// Hebrew "and" is the letter vav (ו) prefixed directly onto the next word (e.g.
// "אלון ואורן"). Only split there when it's preceded by whitespace (a separate
// word boundary), never mid-word, so names that happen to contain a vav
// internally (e.g. "דוד", "רוני") are left intact.
const HEBREW_VAV_AND = /(?<=\s)\u05D5(?=[\u0590-\u05FF])/g;

/** Splits a cue string into candidate individual names, without validating them. */
function splitJointCandidates(cue: string): string[] {
  const trimmed = cue.trim();
  if (!trimmed) return [];
  const withVavSplit = trimmed.replace(HEBREW_VAV_AND, '\u0000');
  const parts = withVavSplit
    .split(JOINT_SEPARATORS)
    .join('\u0000')
    .split('\u0000')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

/**
 * Resolves a raw cue (e.g. "אלון ואורן") into the individual character names
 * it should count as, given the full set of names that appear as their own
 * standalone cue elsewhere in the script. Only splits when every candidate
 * part is independently confirmed as a real character name this way.
 */
export function resolveCueCharacters(cue: string, standaloneNames: ReadonlySet<string>): string[] {
  const candidates = splitJointCandidates(cue);
  if (candidates.length <= 1) return [cue.trim()];
  const allConfirmed = candidates.every((c) => standaloneNames.has(c));
  return allConfirmed ? candidates : [cue.trim()];
}

/** Re-derives the `characters` list for every entry and the script-level `characters`
 *  set, given the current (possibly manually edited) entries. Used after edits in the
 *  script review/correction screen so joint-cue splitting stays correct. */
export function recomputeEntryCharacters(entries: ScriptEntry[]): {
  entries: ScriptEntry[];
  characters: string[];
} {
  const standaloneNames = new Set<string>();
  for (const e of entries) {
    if (e.type !== 'line' || !e.character) continue;
    if (splitJointCandidates(e.character).length === 1) {
      standaloneNames.add(e.character.trim());
    }
  }
  const characterSet = new Set<string>();
  const nextEntries = entries.map((e) => {
    if (e.type !== 'line' || !e.character) return e;
    const resolved = resolveCueCharacters(e.character, standaloneNames);
    resolved.forEach((c) => characterSet.add(c));
    return { ...e, characters: resolved };
  });
  return {
    entries: nextEntries,
    characters: Array.from(characterSet).sort((a, b) => a.localeCompare(b))
  };
}

const JOINING_WORDS = new Set(['and', '&']);

function isAllCapsName(name: string): boolean {
  // Check case per word so joint cues like "ALON and OREN" are still accepted:
  // the lowercase joining word "and" doesn't break the all-caps requirement
  // for the actual name words. Hebrew has no case, so any word containing
  // only Hebrew letters (or digits/punctuation) is accepted as-is.
  const words = name.split(/\s+/).filter(Boolean);
  return words.every((word) => {
    if (JOINING_WORDS.has(word.toLowerCase())) return true;
    const latinOnly = word.replace(/[^A-Za-z]/g, '');
    if (latinOnly.length === 0) return true; // Hebrew/numeric/punctuation word, accept
    return latinOnly === latinOnly.toUpperCase();
  });
}

function detectLanguage(text: string): Language {
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const latinChars = (text.match(/[A-Za-z]/g) || []).length;
  return hebrewChars > latinChars ? 'he' : 'en';
}

export interface ParseResult {
  language: Language;
  entries: ScriptEntry[];
  characters: string[];
}

/** First pass: walk the text and pull out every raw cue name + its inline text, without resolving joint cues yet. */
function extractRawCues(lines: string[]): { rawName: string; text: string; isDirection: boolean }[] {
  const result: { rawName: string; text: string; isDirection: boolean }[] = [];
  let pendingCharacter: string | null = null;

  for (const rawLine of lines) {
    if (DIRECTION_WRAPPERS.test(rawLine)) {
      result.push({ rawName: '', text: rawLine.replace(/^[(\[]|[)\]]$/g, ''), isDirection: true });
      pendingCharacter = null;
      continue;
    }

    const cueMatch = rawLine.match(CUE_LINE);
    if (cueMatch) {
      const name = cueMatch[1].trim();
      const rest = cueMatch[2];
      const looksLikeName = name.split(/\s+/).length <= 4 && isAllCapsName(name);
      if (looksLikeName) {
        if (rest.length > 0) {
          result.push({ rawName: name, text: rest, isDirection: false });
          pendingCharacter = null;
        } else {
          pendingCharacter = name;
        }
        continue;
      }
    }

    if (pendingCharacter) {
      result.push({ rawName: pendingCharacter, text: rawLine, isDirection: false });
      continue;
    }

    result.push({ rawName: '', text: rawLine, isDirection: true });
  }

  return result;
}

export function parseScript(rawText: string): ParseResult {
  const language = detectLanguage(rawText);
  const lines = rawText
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rawCues = extractRawCues(lines);

  // Build the set of names that appear as their own standalone cue anywhere
  // in the script (i.e. cues with no "and"/","/"&" in them), so joint cues
  // can be validated against real, independently-confirmed character names.
  const standaloneNames = new Set<string>();
  for (const cue of rawCues) {
    if (cue.isDirection || !cue.rawName) continue;
    if (splitJointCandidates(cue.rawName).length === 1) {
      standaloneNames.add(cue.rawName);
    }
  }

  const entries: ScriptEntry[] = [];
  const characterSet = new Set<string>();
  let order = 0;

  for (const cue of rawCues) {
    if (cue.isDirection) {
      if (cue.text.trim()) {
        entries.push({ id: uuid(), order: order++, type: 'direction', text: cue.text.trim() });
      }
      continue;
    }
    if (!cue.text.trim()) continue;
    const resolvedCharacters = resolveCueCharacters(cue.rawName, standaloneNames);
    resolvedCharacters.forEach((c) => characterSet.add(c));
    entries.push({
      id: uuid(),
      order: order++,
      type: 'line',
      character: cue.rawName,
      characters: resolvedCharacters,
      text: cue.text.trim()
    });
  }

  return {
    language,
    entries,
    characters: Array.from(characterSet).sort((a, b) => a.localeCompare(b))
  };
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
  // Plain text (.txt) and anything else: read as UTF-8 text.
  return file.text();
}
