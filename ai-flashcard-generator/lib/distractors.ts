/**
 * Choosing wrong answers for multiple choice so the right one doesn't stand
 * out by its length. AI-written wrong answers tend to be shorter than the
 * real definition, which made "pick the longest option" a winning strategy.
 */

/** Preferred candidates (the AI's distractors) may be this much further off in length and still win. */
const PREFERRED_SLACK = 0.15;

/**
 * Returns up to `count` candidates whose length is closest to the answer's.
 * `preferred` are written to be tricky, so they win ties and win unless
 * they're clearly off in length; `others` (e.g. other cards' definitions)
 * fill in.
 * Candidates within about 10% of each other count as equally good and come
 * out in random order, so repeated rounds don't always show the same ones.
 */
export function pickSimilarLength(
  answer: string,
  preferred: readonly string[],
  others: readonly string[],
  count: number,
  random: () => number = Math.random
): string[] {
  const target = Math.max(answer.length, 1);
  const gap = (text: string) => Math.abs(text.length - target) / target;
  const scored = [
    ...preferred.map((text) => ({ text, preferred: true, gap: gap(text) - PREFERRED_SLACK })),
    ...others.map((text) => ({ text, preferred: false, gap: gap(text) })),
  ].map((c) => ({ ...c, bucket: Math.round(c.gap * 10), tiebreak: random() }));
  scored.sort(
    (a, b) =>
      a.bucket - b.bucket ||
      Number(b.preferred) - Number(a.preferred) ||
      a.tiebreak - b.tiebreak
  );
  return scored.slice(0, count).map((c) => c.text);
}
