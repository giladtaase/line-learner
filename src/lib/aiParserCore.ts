import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { AppError } from './errors';
import { detectLanguage, type ParseResult } from './scriptParser';
import type { ScriptEntry } from '../types';

/**
 * The model-facing half of AI parsing, kept free of the API client so it can
 * be unit-tested. The model never writes script text: it only labels ranges
 * of numbered source lines, and entries are rebuilt from the original lines,
 * so dialogue reaches the actor exactly as written.
 */

export const AiParseSchema = z.object({
  characters: z
    .array(
      z.object({
        name: z.string().describe('The character name as the script usually writes it'),
        aliases: z
          .array(z.string())
          .describe('Other spellings or abbreviations used in cues, e.g. "MARG." or "Margaret"')
      })
    )
    .describe('Every distinct character who speaks, once each'),
  blocks: z
    .array(
      z.object({
        start: z.number().int().describe('Number of the first line in this block'),
        kind: z.enum(['line', 'direction', 'scene', 'skip']),
        speakers: z
          .array(z.number().int())
          .describe('For "line": indices into characters of everyone speaking. Otherwise []'),
        cue: z
          .string()
          .describe(
            'For "line": the speaker label exactly as written at the start of the first line, or "" if it has none'
          )
      })
    )
    .describe('Consecutive blocks covering every line in order')
});

export type AiParse = z.infer<typeof AiParseSchema>;

export const AI_PARSER_SYSTEM_PROMPT = `You segment play scripts for an app that helps actors memorize their lines.

The script arrives as numbered source lines: "[n] text". Divide all of them, in order, into consecutive blocks. A block starts at a line number and runs until the next block starts, so give only each block's first line number.

Block kinds:
- "line": dialogue spoken by one or more characters. Keep a whole speech in one block, even when it continues over several source lines. If a speech is interrupted by a stage direction or a page break and then continues, the continuation is a new "line" block with the same speakers and an empty cue.
- "direction": stage directions and descriptions that are not spoken, with or without brackets.
- "scene": scene or act headings.
- "skip": anything that is not part of the performed play: title page, author credit, cast or character lists, page numbers, running headers and footers, notes about the document, editing or revision notes (such as "[[הערת עריכה: ...]]" or "עדכונים 11.10.26").

For "line" blocks:
- speakers: indices into "characters" of everyone who speaks it. A joint cue such as "ALON and OREN" or "אלון ואורן" lists both.
- cue: the speaker label exactly as it appears at the start of the block's first line, copied character for character with its punctuation (for example "ROMEO:", "MARG.", "רינה:"). When the label stands on a line of its own, the block starts at that line and the cue is the whole line. Use "" when the first line has no label.

characters: each speaking character once. "name" is the form the script uses most for that character; "aliases" are any other spellings or abbreviations used in cues.

Never rewrite, translate or correct the text: you only label line numbers. Bracketed acting notes inside a speech, like "(laughing)", stay part of the speech. If you cannot tell whether a line is spoken, label it "direction".`;

/** The script's non-empty lines, trimmed: the units the model labels by number. */
export function sourceLines(rawText: string): string[] {
  return rawText
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function formatNumberedLines(lines: string[]): string {
  return lines.map((line, i) => `[${i + 1}] ${line}`).join('\n');
}

/** Prefix for the numbered lines naming characters the play already has, or "" if none. */
export function formatKnownCharacters(names: string[]): string {
  if (names.length === 0) return '';
  return (
    'These scenes belong to a longer play. Its characters so far are listed below; ' +
    'when a cue refers to one of them (including by a nickname or another spelling), ' +
    'use the listed name exactly as "name".\n' +
    names.map((n) => `- ${n}`).join('\n') +
    '\n\nThe script:\n'
  );
}

/** Sent with the numbered lines when the PDF they were extracted from is attached. */
export const PDF_CONTEXT_NOTE = `The attached PDF is the file these lines were extracted from. Use it to see how each line looks on the page:
- Label "skip" any line that is crossed out (strikethrough), and editing or revision notes, which are often in a different color.
- When part of a cue is crossed out and replaced (for example "אימא 2: 1:" with "2:" crossed out), the speakers are the ones not crossed out; the cue is still the whole label as it appears in the line.

`;

const BLOCK_START = /"start"\s*:\s*(\d+)/g;

/**
 * The start line of the last block in a chunk of the model's streamed JSON,
 * or null if it has none. Blocks arrive in line order, so this over the line
 * count tells how far through the script the model is.
 */
export function lastBlockStart(jsonChunk: string): number | null {
  let last: number | null = null;
  for (const match of jsonChunk.matchAll(BLOCK_START)) last = Number(match[1]);
  return last;
}

function invalid(detail: string): AppError {
  return new AppError('aiInvalidResponse', `The AI returned an unusable result: ${detail}`, {
    detail
  });
}

const CUE_SEPARATOR = /^[\s:.\-–—]+/;
const WRAPPED = /^[(\[](.*)[)\]]$/s;

/**
 * Rebuilds script entries from the model's labels, using only the original
 * lines. Throws AppError('aiInvalidResponse') when the labels can't be
 * trusted (blocks out of order or out of range, unknown speakers).
 */
export function buildParseResult(lines: string[], parse: AiParse): ParseResult {
  const { characters, blocks } = parse;
  if (blocks.length === 0) throw invalid('no blocks');

  let previousStart = 0;
  for (const block of blocks) {
    if (block.start <= previousStart || block.start > lines.length) {
      throw invalid(`block start ${block.start} is out of order or past the last line`);
    }
    previousStart = block.start;
    for (const s of block.speakers) {
      if (!characters[s]) throw invalid(`unknown speaker index ${s}`);
    }
  }

  const entries: ScriptEntry[] = [];
  const speaking = new Set<string>();
  // Index of the last dialogue entry, while only skipped lines (page numbers,
  // headers) have followed it, so a speech split by a page break rejoins.
  let continuable: number | null = null;

  // Lines before the first block are dropped: they can only be front matter.
  blocks.forEach((block, b) => {
    const end = (blocks[b + 1]?.start ?? lines.length + 1) - 1;
    const blockLines = lines.slice(block.start - 1, end);

    if (block.kind === 'skip') return;

    if (block.kind === 'line' && block.speakers.length > 0) {
      const names = block.speakers.map((s) => characters[s].name);
      const [first, ...rest] = blockLines;
      const cue = block.cue.trim();
      const firstText =
        cue && first.startsWith(cue) ? first.slice(cue.length).replace(CUE_SEPARATOR, '') : first;
      const text = [firstText, ...rest].filter(Boolean).join(' ').trim();
      if (!text) return;

      const previous = continuable === null ? undefined : entries[continuable];
      if (
        !cue &&
        previous &&
        previous.characters?.length === names.length &&
        previous.characters.every((n, i) => n === names[i])
      ) {
        previous.text = `${previous.text} ${text}`;
        return;
      }

      names.forEach((n) => speaking.add(n));
      entries.push({
        id: uuid(),
        order: entries.length,
        type: 'line',
        character: names.join(' & '),
        characters: names,
        text
      });
      continuable = entries.length - 1;
      return;
    }

    // Directions (and dialogue the model couldn't attribute) and scene headings.
    const joined = blockLines.join(' ').trim();
    const type = block.kind === 'scene' ? 'scene' : 'direction';
    const text = type === 'direction' ? (joined.match(WRAPPED)?.[1].trim() ?? joined) : joined;
    if (!text) return;
    entries.push({ id: uuid(), order: entries.length, type, text });
    continuable = null;
  });

  // A lazy response can label the whole script "skip"; don't hand back an empty script.
  if (entries.length === 0) throw invalid('every line was skipped');

  return {
    language: detectLanguage(lines.join('\n')),
    entries,
    characters: Array.from(speaking).sort((a, b) => a.localeCompare(b))
  };
}
