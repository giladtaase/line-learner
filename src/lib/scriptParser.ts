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

function isAllCapsName(name: string): boolean {
  // Hebrew has no case, so only enforce the all-caps check for latin text.
  const latinOnly = name.replace(/[^A-Za-z]/g, '');
  if (latinOnly.length === 0) return true; // Hebrew name, accept
  return latinOnly === latinOnly.toUpperCase();
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

export function parseScript(rawText: string): ParseResult {
  const language = detectLanguage(rawText);
  const lines = rawText
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const entries: ScriptEntry[] = [];
  const characterSet = new Set<string>();
  let order = 0;
  let pendingCharacter: string | null = null;

  const pushLine = (character: string, text: string) => {
    if (!text.trim()) return;
    entries.push({ id: uuid(), order: order++, type: 'line', character, text: text.trim() });
    characterSet.add(character);
  };

  const pushDirection = (text: string) => {
    if (!text.trim()) return;
    entries.push({ id: uuid(), order: order++, type: 'direction', text: text.trim() });
  };

  for (const rawLine of lines) {
    if (DIRECTION_WRAPPERS.test(rawLine)) {
      pushDirection(rawLine.replace(/^[(\[]|[)\]]$/g, ''));
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
          pushLine(name, rest);
          pendingCharacter = null;
        } else {
          pendingCharacter = name;
        }
        continue;
      }
    }

    if (pendingCharacter) {
      pushLine(pendingCharacter, rawLine);
      // Keep pendingCharacter active in case the line wraps across multiple
      // source lines (common when pasted from PDFs/docs); a new cue or
      // direction will reset it.
      continue;
    }

    // No character context yet: treat as a direction/note rather than dialogue.
    pushDirection(rawLine);
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
