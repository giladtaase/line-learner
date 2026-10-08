/**
 * Lenient line-matching utilities, shared by the (future) recording/typing
 * grading flow. Normalizes punctuation and, for Hebrew, strips niqqud
 * (vowel points) before comparing, then scores similarity with a
 * token-based Levenshtein ratio so minor phrasing slips aren't flagged.
 */

const NIQQUD = /[\u0591-\u05C7]/g;
const PUNCTUATION = /[.,!?;:'"\u05F3\u05F4\-—–\u2026]/g;
// Inline stage/acting directions embedded within a dialogue line, e.g.
// "(מצטרף אליהן)... עם חברים היינו שרים" or "(crossing to the window) I can't believe it.".
// These describe blocking/acting notes, not words the actor actually speaks,
// so they must be stripped before comparing to what was said aloud.
const INLINE_DIRECTIONS = /[(\[][^)\]]*[)\]]/g;

/** Removes bracketed/parenthesized inline stage directions from a line of dialogue. */
export function stripInlineDirections(text: string): string {
  return text.replace(INLINE_DIRECTIONS, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeForComparison(text: string): string {
  return stripInlineDirections(text)
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

function tokenSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

/**
 * Returns a similarity ratio between 0 (no match) and 1 (identical). Combines
 * two comparison strategies and takes the better score:
 *  - word/token-based (tolerant of small wording/order differences)
 *  - character-based with spaces removed (tolerant of words being merged or
 *    split differently between the script text and the spoken transcript —
 *    e.g. "וחבריםהיינו" vs "וחברים היינו" — which can happen due to source
 *    formatting quirks or how speech recognition breaks up words, and
 *    shouldn't be treated as a missed word).
 */
export function similarityRatio(expected: string, actual: string): number {
  const normExpected = normalizeForComparison(expected);
  const normActual = normalizeForComparison(actual);

  const tokenScore = tokenSimilarity(
    normExpected.split(' ').filter(Boolean),
    normActual.split(' ').filter(Boolean)
  );

  const charsA = normExpected.replace(/\s+/g, '').split('');
  const charsB = normActual.replace(/\s+/g, '').split('');
  const charScore = tokenSimilarity(charsA, charsB);

  return Math.max(tokenScore, charScore);
}

export function gradeAttempt(
  expected: string,
  actual: string,
  threshold: number
): { similarity: number; passed: boolean } {
  const similarity = similarityRatio(expected, actual);
  return { similarity, passed: similarity >= threshold };
}
