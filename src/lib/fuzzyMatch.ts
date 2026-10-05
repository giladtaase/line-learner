/**
 * Lenient line-matching utilities, shared by the (future) recording/typing
 * grading flow. Normalizes punctuation and, for Hebrew, strips niqqud
 * (vowel points) before comparing, then scores similarity with a
 * token-based Levenshtein ratio so minor phrasing slips aren't flagged.
 */

const NIQQUD = /[\u0591-\u05C7]/g;
const PUNCTUATION = /[.,!?;:'"()\u05F3\u05F4\-—–]/g;

export function normalizeForComparison(text: string): string {
  return text
    .replace(NIQQUD, '')
    .replace(PUNCTUATION, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[a.length][b.length];
}

/** Returns a similarity ratio between 0 (no match) and 1 (identical), token-based. */
export function similarityRatio(expected: string, actual: string): number {
  const a = normalizeForComparison(expected).split(' ').filter(Boolean);
  const b = normalizeForComparison(actual).split(' ').filter(Boolean);
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

export function gradeAttempt(
  expected: string,
  actual: string,
  threshold: number
): { similarity: number; passed: boolean } {
  const similarity = similarityRatio(expected, actual);
  return { similarity, passed: similarity >= threshold };
}
