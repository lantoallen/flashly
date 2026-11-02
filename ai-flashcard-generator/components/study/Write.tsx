'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { logActivity } from '@/lib/activity';
import { petReact } from '@/lib/pet';
import type { Side } from '@/lib/quiz';
import { touchProgress } from '@/lib/storage';
import type { Card } from '@/lib/types';
import { checkTyped, shuffle, type AnswerResult } from '@/lib/utils';
import {
  filterCards,
  NeedMore,
  ProgressBar,
  Results,
  Segmented,
  SourcePicker,
  type ModeProps,
  type ReviewItem,
  type SourceFilter,
} from './shared';

type Run = {
  deck: Card[];
  side: Side;
  idx: number;
  input: string;
  feedback: AnswerResult | null;
  hints: number;
  results: (ReviewItem & { cardId: string })[];
  done: boolean;
};

/** Reveal the first `n` letters of each word and mask the rest, e.g. "Ch_______". */
function maskAnswer(answer: string, n: number): string {
  return answer
    .split(' ')
    .map((word) =>
      [...word].map((ch, i) => (i < n || !/[\p{L}\p{N}]/u.test(ch) ? ch : '_')).join('')
    )
    .join(' ');
}

export default function Write({ setId, cards, goTo }: ModeProps) {
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [side, setSide] = useState<Side>('definition');
  const [size, setSize] = useState(10);
  const [run, setRun] = useState<Run | null>(null);

  const eligible = filterCards(cards, filter);

  function start(pool: Card[], count: number) {
    setRun({
      deck: shuffle(pool).slice(0, count),
      side,
      idx: 0,
      input: '',
      feedback: null,
      hints: 0,
      results: [],
      done: false,
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!run || run.done) return;
    const card = run.deck[run.idx];
    const prompt = run.side === 'definition' ? card.definition : card.term;
    const answer = run.side === 'definition' ? card.term : card.definition;

    if (run.feedback === null) {
      const result = checkTyped(run.input, answer);
      logActivity(1);
      petReact(result === 'wrong' ? 'oops' : 'cheer');
      setRun({
        ...run,
        feedback: result,
        results: [
          ...run.results,
          { cardId: card.id, prompt, answer, yourAnswer: run.input.trim(), correct: result !== 'wrong' },
        ],
      });
      return;
    }

    if (run.idx + 1 < run.deck.length) {
      setRun({ ...run, idx: run.idx + 1, input: '', feedback: null, hints: 0 });
    } else {
      touchProgress(setId, {});
      setRun({ ...run, done: true });
    }
  }

  function overrideCorrect() {
    setRun((r) =>
      r
        ? {
            ...r,
            feedback: 'correct',
            results: r.results.map((x, i) =>
              i === r.results.length - 1 ? { ...x, correct: true } : x
            ),
          }
        : r
    );
  }

  if (cards.length < 2) return <NeedMore min={2} goTo={goTo} />;

  if (run?.done) {
    const correct = run.results.filter((r) => r.correct).length;
    const missed = new Set(run.results.filter((r) => !r.correct).map((r) => r.cardId));
    return (
      <Results
        correct={correct}
        total={run.results.length}
        items={run.results}
        onRetryMissed={() => start(cards.filter((c) => missed.has(c.id)), missed.size)}
        onNew={() => setRun(null)}
      />
    );
  }

  if (run) {
    const card = run.deck[run.idx];
    const prompt = run.side === 'definition' ? card.definition : card.term;
    const answer = run.side === 'definition' ? card.term : card.definition;
    const fb = run.feedback;
    return (
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="shrink-0 tabular-nums">
            {run.idx + 1} / {run.deck.length}
          </span>
          <ProgressBar value={run.idx + (fb ? 1 : 0)} max={run.deck.length} />
          <button type="button" onClick={() => setRun(null)} className="btn btn-ghost !px-2 !py-1">
            Quit
          </button>
        </div>

        <div className="panel p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {run.side === 'definition' ? 'Type the term' : 'Type the definition'}
          </p>
          <p className="mt-3 text-xl font-semibold leading-snug sm:text-2xl">{prompt}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="typed" className="sr-only">
            Your answer
          </label>
          {run.side === 'term' ? (
            <textarea
              // A new element per card, so autoFocus puts the cursor back in the box.
              key={run.idx}
              id="typed"
              rows={3}
              autoFocus
              disabled={fb !== null}
              value={run.input}
              onChange={(e) => setRun({ ...run, input: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Type your answer… (Enter to check)"
              className="input"
            />
          ) : (
            <input
              key={run.idx}
              id="typed"
              autoFocus
              autoComplete="off"
              disabled={fb !== null}
              value={run.input}
              onChange={(e) => setRun({ ...run, input: e.target.value })}
              placeholder="Type your answer…"
              className="input"
            />
          )}
        </div>

        {fb && (
          <div
            aria-live="polite"
            className={`rounded-xl p-4 ${
              fb === 'wrong' ? 'bg-danger-soft' : 'bg-success-soft'
            }`}
          >
            <p className={`font-semibold ${fb === 'wrong' ? 'text-danger' : 'text-success'}`}>
              {fb === 'correct'
                ? 'Correct!'
                : fb === 'close'
                  ? 'Close enough, small typo.'
                  : 'Not quite.'}
            </p>
            {fb !== 'correct' && (
              <p className="mt-1">
                <span className="text-sm text-muted">Answer: </span>
                {answer}
              </p>
            )}
            {fb === 'wrong' && (
              <button
                type="button"
                onClick={overrideCorrect}
                className="btn btn-secondary mt-3 !py-1.5"
              >
                I was right
              </button>
            )}
          </div>
        )}

        {fb === null && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setRun({ ...run, hints: Math.min(run.hints + 1, 4) })}
              disabled={run.hints >= 4}
              className="btn btn-secondary !py-2"
            >
              <Icon name="sparkles" size={16} />
              {run.hints === 0 ? 'Hint' : 'Another hint'}
            </button>
            {run.hints > 0 && (
              <p className="font-mono text-lg font-bold tracking-widest" aria-live="polite">
                {maskAnswer(answer, run.hints)}
              </p>
            )}
          </div>
        )}

        {fb === null ? (
          <button
            key="check"
            type="submit"
            disabled={!run.input.trim()}
            className="btn btn-primary btn-lg w-fit"
          >
            Check
          </button>
        ) : (
          <button key="next" type="submit" autoFocus className="btn btn-primary btn-lg w-fit">
            {run.idx + 1 < run.deck.length ? 'Next' : 'See results'}
            <Icon name="right" size={16} />
          </button>
        )}
      </form>
    );
  }

  const maxQ = eligible.length;
  const sizes = [5, 10, 20].filter((n) => n < maxQ);
  return (
    <div className="panel flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-xl font-semibold">Write</h2>
        <p className="mt-1 text-sm text-muted">
          Recall beats recognition. Type each answer from memory. Capitalization,
          punctuation and tiny typos are forgiven.
        </p>
      </div>
      <SourcePicker cards={cards} value={filter} onChange={setFilter} />
      <Segmented
        label="Prompt with"
        value={side}
        onChange={setSide}
        options={[
          { value: 'definition', label: 'Definition → type term' },
          { value: 'term', label: 'Term → type definition' },
        ]}
      />
      <Segmented
        label="Number of cards"
        value={String(Math.min(size, maxQ))}
        onChange={(v) => setSize(Number(v))}
        options={[
          ...sizes.map((n) => ({ value: String(n), label: String(n) })),
          { value: String(maxQ), label: `All (${maxQ})` },
        ]}
      />
      <button
        type="button"
        disabled={maxQ < 1}
        onClick={() => start(eligible, Math.min(size, maxQ))}
        className="btn btn-primary btn-lg w-fit"
      >
        Start writing
        <Icon name="right" />
      </button>
    </div>
  );
}
