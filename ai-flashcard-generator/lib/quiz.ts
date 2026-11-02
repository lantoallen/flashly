import { pickSimilarLength } from './distractors';
import type { Card } from './types';
import { shuffle } from './utils';

/** Which side of the card is shown as the prompt. */
export type Side = 'term' | 'definition';
export type Direction = Side | 'mixed';

export type QuizQuestion = {
  cardId: string;
  side: Side;
  prompt: string;
  answer: string;
  options: string[];
};

function unique(values: string[], exclude: string): string[] {
  const seen = new Set([exclude.trim().toLowerCase()]);
  const out: string[] = [];
  for (const v of values) {
    const k = v.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(v.trim());
    }
  }
  return out;
}

export function buildQuestion(
  card: Card,
  pool: Card[],
  side: Side
): QuizQuestion | null {
  const others = pool.filter((c) => c.id !== card.id);
  let prompt: string;
  let answer: string;
  let wrong: string[];

  if (side === 'term') {
    // Show the term, pick the definition. AI-written distractors are
    // preferred, but every option should be about as long as the answer.
    prompt = card.term;
    answer = card.definition;
    const fromAi = unique(card.distractors ?? [], answer);
    const fromCards = unique(
      others.map((c) => c.definition),
      answer
    ).filter((d) => !fromAi.some((a) => a.toLowerCase() === d.toLowerCase()));
    wrong = pickSimilarLength(answer, fromAi, fromCards, 3);
  } else {
    // Show the definition, pick the term.
    prompt = card.definition;
    answer = card.term;
    wrong = pickSimilarLength(answer, [], unique(others.map((c) => c.term), answer), 3);
  }

  if (wrong.length === 0) return null;
  return {
    cardId: card.id,
    side,
    prompt,
    answer,
    options: shuffle([answer, ...wrong]),
  };
}

export function buildQuiz(
  cards: Card[],
  pool: Card[],
  count: number,
  direction: Direction
): QuizQuestion[] {
  const picked = shuffle(cards).slice(0, count);
  const questions: QuizQuestion[] = [];
  for (const card of picked) {
    const side: Side =
      direction === 'mixed'
        ? Math.random() < 0.5
          ? 'term'
          : 'definition'
        : direction;
    const q = buildQuestion(card, pool, side);
    if (q) questions.push(q);
  }
  return questions;
}
