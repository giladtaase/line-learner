import { describe, it, expect } from 'vitest';
import {
  stripInlineDirections,
  normalizeForComparison,
  similarityRatio,
  gradeAttempt
} from './fuzzyMatch';

describe('stripInlineDirections', () => {
  it('removes parenthesized directions', () => {
    expect(stripInlineDirections("(crossing to the window) I can't believe it.")).toBe(
      "I can't believe it."
    );
  });

  it('removes bracketed directions in the middle of a line', () => {
    expect(stripInlineDirections('Hello [beat] world')).toBe('Hello world');
  });

  it('removes Hebrew inline directions', () => {
    expect(stripInlineDirections('(מצטרף אליהן)... עם חברים היינו שרים')).toBe(
      '... עם חברים היינו שרים'
    );
  });

  it('removes multiple directions and collapses whitespace', () => {
    expect(stripInlineDirections('(sighs)  Well,   (pause) fine.')).toBe('Well, fine.');
  });

  it('leaves text without directions unchanged', () => {
    expect(stripInlineDirections('Just a line.')).toBe('Just a line.');
  });
});

describe('normalizeForComparison', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeForComparison('Hello, World! How are you?')).toBe('hello world how are you');
  });

  it('strips Hebrew niqqud', () => {
    expect(normalizeForComparison('שָׁלוֹם עוֹלָם')).toBe('שלום עולם');
  });

  it('strips Hebrew geresh/gershayim and dashes', () => {
    expect(normalizeForComparison('צה״ל — ג׳ירפה')).toBe('צהל גירפה');
  });

  it('strips inline directions before comparing', () => {
    expect(normalizeForComparison('(angrily) Get OUT!')).toBe('get out');
  });

  it('returns an empty string for direction-only text', () => {
    expect(normalizeForComparison('(exits)')).toBe('');
  });
});

describe('similarityRatio', () => {
  it('returns 1 for identical text', () => {
    expect(similarityRatio('To be or not to be', 'To be or not to be')).toBe(1);
  });

  it('ignores punctuation, case and inline directions', () => {
    expect(similarityRatio('(softly) To be, or not to be?', 'to be or not to be')).toBe(1);
  });

  it('ignores Hebrew niqqud', () => {
    expect(similarityRatio('שָׁלוֹם לְךָ', 'שלום לך')).toBe(1);
  });

  it('tolerates words merged in the script text', () => {
    expect(similarityRatio('וחבריםהיינו שרים', 'וחברים היינו שרים')).toBe(1);
  });

  it('tolerates words split by speech recognition', () => {
    expect(similarityRatio('everybody', 'every body')).toBe(1);
  });

  it('returns 1 when both are empty', () => {
    expect(similarityRatio('', '')).toBe(1);
  });

  it('returns 0 when only one side is empty', () => {
    expect(similarityRatio('Hello there', '')).toBe(0);
  });

  it('returns 0 for completely different text', () => {
    expect(similarityRatio('apple', 'zzzzz')).toBe(0);
  });

  it('gives a partial score for a missing word', () => {
    // token score: 1 edit over 4 words = 0.75 (beats the char-based score)
    expect(similarityRatio('the cat sat down', 'the cat sat')).toBeCloseTo(0.75);
  });

  it('is always within [0, 1]', () => {
    const pairs: [string, string][] = [
      ['a b c', 'x y z w v'],
      ['long line of dialogue here', 'short'],
      ['שלום', 'hello']
    ];
    for (const [a, b] of pairs) {
      const r = similarityRatio(a, b);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});

describe('gradeAttempt', () => {
  it('passes when similarity meets the threshold', () => {
    const result = gradeAttempt('the cat sat down', 'the cat sat', 0.55);
    expect(result.passed).toBe(true);
    expect(result.similarity).toBeCloseTo(0.75);
  });

  it('fails when similarity is below the threshold', () => {
    expect(gradeAttempt('the cat sat down', 'the cat sat', 0.8).passed).toBe(false);
  });

  it('passes when similarity exactly equals the threshold', () => {
    expect(gradeAttempt('the cat sat down', 'the cat sat', 0.75).passed).toBe(true);
  });

  it('fails a completely wrong attempt', () => {
    expect(gradeAttempt('Romeo, Romeo, wherefore art thou', 'pizza', 0.55).passed).toBe(false);
  });
});
