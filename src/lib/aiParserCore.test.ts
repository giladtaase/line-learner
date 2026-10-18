import { describe, it, expect } from 'vitest';
import {
  AiParseSchema,
  buildParseResult,
  formatNumberedLines,
  lastBlockStart,
  sourceLines,
  type AiParse
} from './aiParserCore';
import { AppError } from './errors';

const SCRIPT = `THE GARDEN PARTY
CAST: MARGARET, TOM
SCENE 1
A garden. Afternoon.
MARGARET
Tom, you're late again.
TOM: I brought flowers. (beat) Doesn't that count?
- 2 -
And I baked a cake.
She laughs.
MARG. You baked?
MARGARET and TOM: Cake!`;

const lines = sourceLines(SCRIPT);

const characters: AiParse['characters'] = [
  { name: 'MARGARET', aliases: ['MARG.'] },
  { name: 'TOM', aliases: [] }
];

function block(start: number, kind: AiParse['blocks'][number]['kind'], speakers: number[] = [], cue = '') {
  return { start, kind, speakers, cue };
}

const parse: AiParse = {
  characters,
  blocks: [
    block(1, 'skip'),
    block(3, 'scene'),
    block(4, 'direction'),
    block(5, 'line', [0], 'MARGARET'),
    block(7, 'line', [1], 'TOM:'),
    block(8, 'skip'),
    block(9, 'line', [1]),
    block(10, 'direction'),
    block(11, 'line', [0], 'MARG.'),
    block(12, 'line', [0, 1], 'MARGARET and TOM:')
  ]
};

describe('sourceLines / formatNumberedLines', () => {
  it('numbers trimmed, non-empty lines from 1', () => {
    expect(formatNumberedLines(sourceLines('  A: hi \n\n B: yo'))).toBe('[1] A: hi\n[2] B: yo');
  });
});

describe('buildParseResult', () => {
  const result = buildParseResult(lines, parse);
  const summary = result.entries.map((e) => [e.type, e.characters ?? null, e.text]);

  it('rebuilds entries from the original text, dropping skipped lines', () => {
    expect(summary).toEqual([
      ['scene', null, 'SCENE 1'],
      ['direction', null, 'A garden. Afternoon.'],
      ['line', ['MARGARET'], "Tom, you're late again."],
      // Rejoined across the page number; inline acting note kept.
      ['line', ['TOM'], "I brought flowers. (beat) Doesn't that count? And I baked a cake."],
      ['direction', null, 'She laughs.'],
      // Alias cue resolved to the canonical name.
      ['line', ['MARGARET'], 'You baked?'],
      ['line', ['MARGARET', 'TOM'], 'Cake!']
    ]);
  });

  it('lists speaking characters and numbers entries in order', () => {
    expect(result.characters).toEqual(['MARGARET', 'TOM']);
    expect(result.entries.map((e) => e.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.language).toBe('en');
  });

  it('keeps the whole first line when the cue does not match it', () => {
    const r = buildParseResult(['ROMEO: Hi'], {
      characters: [{ name: 'ROMEO', aliases: [] }],
      blocks: [block(1, 'line', [0], 'JULIET:')]
    });
    expect(r.entries[0].text).toBe('ROMEO: Hi');
  });

  it('does not merge a continuation across a stage direction', () => {
    const r = buildParseResult(['A: one', '(pause)', 'two'], {
      characters: [{ name: 'A', aliases: [] }],
      blocks: [block(1, 'line', [0], 'A:'), block(2, 'direction'), block(3, 'line', [0])]
    });
    expect(r.entries.map((e) => e.text)).toEqual(['one', 'pause', 'two']);
  });

  it('treats a dialogue block without speakers as a direction', () => {
    const r = buildParseResult(['Somebody shouts offstage.'], {
      characters: [],
      blocks: [block(1, 'line', [], '')]
    });
    expect(r.entries[0].type).toBe('direction');
  });

  it('handles Hebrew cues and detects the language', () => {
    const r = buildParseResult(['רינה: שלום.', 'רינה וסבתא: יואב!'], {
      characters: [
        { name: 'רינה', aliases: [] },
        { name: 'סבתא', aliases: [] }
      ],
      blocks: [block(1, 'line', [0], 'רינה:'), block(2, 'line', [0, 1], 'רינה וסבתא:')]
    });
    expect(r.language).toBe('he');
    expect(r.entries.map((e) => [e.characters, e.text])).toEqual([
      [['רינה'], 'שלום.'],
      [['רינה', 'סבתא'], 'יואב!']
    ]);
  });

  it.each([
    ['out of order', [block(2, 'skip'), block(1, 'skip')]],
    ['past the last line', [block(1, 'skip'), block(99, 'skip')]],
    ['unknown speaker', [block(1, 'line', [5], 'X:')]],
    ['empty', []],
    ['all skipped', [block(1, 'skip')]]
  ])('rejects blocks that are %s', (_label, blocks) => {
    expect(() => buildParseResult(lines, { characters, blocks })).toThrow(AppError);
  });
});

describe('lastBlockStart', () => {
  it('finds the last complete block start in a streamed chunk', () => {
    expect(lastBlockStart('{"characters":[{"name":"A","aliases":[]}],"blocks":[')).toBeNull();
    expect(lastBlockStart('"start":3,"kind":"line"},{"start": 17,"kind":"skip"')).toBe(17);
  });
});

describe('AiParseSchema', () => {
  it('accepts a well-formed response and rejects an unknown kind', () => {
    expect(AiParseSchema.safeParse(parse).success).toBe(true);
    expect(
      AiParseSchema.safeParse({ characters, blocks: [{ ...block(1, 'skip'), kind: 'song' }] }).success
    ).toBe(false);
  });
});
