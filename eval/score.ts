import type { ScriptEntry } from '../src/types';
import type { ExpectedEntry } from './fixtures';

/**
 * Scores a parse against the expected entries. An entry counts as correct
 * only if its type, speakers and text all match (text compared verbatim up to
 * whitespace, speakers by name ignoring case and trailing punctuation), and
 * entries must appear in the right order (longest common subsequence).
 */

const normText = (t: string) => t.replace(/\s+/g, ' ').trim();
const normName = (n: string) => n.trim().replace(/[.:]+$/, '').toLowerCase();

function key(e: { type: string; speakers?: string[]; text: string }): string {
  const speakers = e.type === 'line' ? (e.speakers ?? []).map(normName).sort().join('+') : '';
  return `${e.type}|${speakers}|${normText(e.text)}`;
}

function lcsLength(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export interface Score {
  matched: number;
  expected: number;
  produced: number;
  /** Share of expected entries the parse got exactly right. */
  recall: number;
  /** Share of produced entries that are exactly right. */
  precision: number;
  f1: number;
}

export function scoreParse(expected: ExpectedEntry[], produced: ScriptEntry[]): Score {
  const want = expected.map(key);
  const got = produced.map((e) =>
    key({ type: e.type, speakers: e.characters ?? (e.character ? [e.character] : []), text: e.text })
  );
  const matched = lcsLength(want, got);
  const recall = want.length ? matched / want.length : 1;
  const precision = got.length ? matched / got.length : 0;
  const f1 = recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
  return { matched, expected: want.length, produced: got.length, recall, precision, f1 };
}

/** Expected entries the parse missed, as readable strings (for eyeballing failures). */
export function missedEntries(expected: ExpectedEntry[], produced: ScriptEntry[]): string[] {
  const got = new Set(
    produced.map((e) =>
      key({ type: e.type, speakers: e.characters ?? (e.character ? [e.character] : []), text: e.text })
    )
  );
  return expected.filter((e) => !got.has(key(e))).map(key);
}
