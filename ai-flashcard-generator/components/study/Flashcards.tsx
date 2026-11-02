'use client';

import { useEffect, useMemo, useState } from 'react';
import Confetti from '@/components/Confetti';
import { Icon } from '@/components/icons';
import { logActivity } from '@/lib/activity';
import { ensureTerms } from '@/lib/consent';
import { petReact } from '@/lib/pet';
import { resetProgress, touchProgress, updateCard } from '@/lib/storage';
import { shuffle } from '@/lib/utils';
import {
  filterCards,
  isTypingTarget,
  ProgressBar,
  SourcePicker,
  type ModeProps,
  type SourceFilter,
} from './shared';

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

type Explain = { status: 'loading' | 'done' | 'error'; text: string };

export default function Flashcards({ setId, title, cards, goTo }: ModeProps) {
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [order, setOrder] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [definitionFirst, setDefinitionFirst] = useState(false);
  const [explains, setExplains] = useState<Record<string, Explain>>({});

  const deck = useMemo(() => {
    const base = filterCards(cards, filter);
    if (!order) return base;
    const pos = new Map(order.map((id, i) => [id, i]));
    return [...base].sort(
      (a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity)
    );
  }, [cards, filter, order]);

  const done = deck.length === 0 || index >= deck.length;
  const card = done ? null : deck[index];
  const knownCount = cards.filter((c) => c.known).length;

  function go(delta: number) {
    setFlipped(false);
    setIndex((i) => Math.max(0, Math.min(deck.length, i + delta)));
  }

  function mark(known: boolean) {
    if (!card) return;
    updateCard(setId, card.id, { known });
    logActivity(1);
    if (known) petReact('cheer');
    else petReact('oops', 'Practice makes perfect!');
    setFlipped(false);
    // In "still learning" mode a known card leaves the deck, so the index already points at the next one.
    if (!(filter === 'learning' && known)) setIndex((i) => i + 1);
  }

  async function explain() {
    if (!card || explains[card.id]?.status === 'loading') return;
    if (!ensureTerms(explain)) return;
    const id = card.id;
    setExplains((m) => ({ ...m, [id]: { status: 'loading', text: '' } }));
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: card.term,
          definition: card.definition,
          subject: title,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not explain this card.');
      setExplains((m) => ({ ...m, [id]: { status: 'done', text: data.explanation } }));
    } catch (err) {
      setExplains((m) => ({
        ...m,
        [id]: {
          status: 'error',
          text: err instanceof Error ? err.message : 'Could not explain this card.',
        },
      }));
    }
  }

  function toggleStar() {
    if (card) updateCard(setId, card.id, { starred: !card.starred });
  }

  function restart(next?: SourceFilter) {
    if (next) setFilter(next);
    setIndex(0);
    setFlipped(false);
  }

  function doShuffle() {
    setOrder(shuffle(cards.map((c) => c.id)));
    restart();
  }

  // Study counts as progress once you flip a card.
  function flip() {
    if (!flipped) touchProgress(setId, {});
    setFlipped(!flipped);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const target = e.target as HTMLElement;
      const onControl = target.closest?.('button, a, summary');
      // After clicking "Got it" or an arrow, focus stays on that button; Space
      // should still flip the card rather than press the button again.
      const spaceFlips = !onControl || target.closest?.('[data-space-flips]');
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFlipped(false);
        setIndex((i) => Math.min(deck.length, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFlipped(false);
        setIndex((i) => Math.max(0, i - 1));
      } else if ((e.key === ' ' && spaceFlips) || (e.key === 'Enter' && !onControl)) {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deck.length]);

  const front = card ? (definitionFirst ? card.definition : card.term) : '';
  const back = card ? (definitionFirst ? card.term : card.definition) : '';
  const longText = (flipped ? back : front).length > 120;

  return (
    <div className="flex flex-col gap-5">
      <div className="panel flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-[14rem] flex-1">
          <SourcePicker
            cards={cards}
            value={filter}
            onChange={(f) => restart(f)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={doShuffle} className="btn btn-secondary">
            <Icon name="shuffle" size={16} />
            Shuffle
          </button>
          <button
            type="button"
            onClick={() => {
              setDefinitionFirst((d) => !d);
              setFlipped(false);
            }}
            className="btn btn-secondary"
            aria-pressed={definitionFirst}
          >
            <Icon name="refresh" size={16} />
            {definitionFirst ? 'Definition first' : 'Term first'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="shrink-0 tabular-nums">
          {done ? deck.length : index + 1} / {deck.length}
        </span>
        <ProgressBar value={knownCount} max={cards.length} />
        <span className="shrink-0 tabular-nums">
          {knownCount}/{cards.length} known
        </span>
      </div>

      {card ? (
        <>
          <div className="flip-scene h-60 sm:h-64">
            <div
              className="flip-card cursor-pointer"
              data-flipped={flipped}
              onClick={flip}
              role="button"
              tabIndex={0}
              aria-label={`Flashcard. ${flipped ? 'Showing the back' : 'Showing the front'}. Press space to flip.`}
            >
              {[
                { text: front, label: definitionFirst ? 'Definition' : 'Term', cls: 'flip-front' },
                { text: back, label: definitionFirst ? 'Term' : 'Definition', cls: 'flip-back' },
              ].map((face) => (
                <div
                  key={face.cls}
                  className={`flip-face ${face.cls} panel flex flex-col items-center justify-center gap-3 overflow-auto p-8 text-center`}
                  aria-hidden={face.cls === 'flip-front' ? flipped : !flipped}
                >
                  <span className="absolute left-5 top-4 text-xs font-semibold uppercase tracking-wide text-muted">
                    {face.label}
                  </span>
                  <p
                    className={`font-semibold leading-snug ${
                      longText ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl'
                    }`}
                  >
                    {face.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-y-2">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={toggleStar}
                className={`btn btn-ghost !p-2.5 ${card.starred ? '!text-warn' : ''}`}
                aria-label={card.starred ? 'Remove star' : 'Star this card'}
                aria-pressed={!!card.starred}
              >
                <Icon name="star" filled={!!card.starred} />
              </button>
              <button
                type="button"
                onClick={() => speak(flipped ? back : front)}
                className="btn btn-ghost !p-2.5"
                aria-label="Read aloud"
              >
                <Icon name="volume" />
              </button>
              <button
                type="button"
                onClick={explain}
                disabled={explains[card.id]?.status === 'loading'}
                className="btn btn-ghost !px-3 !py-2"
              >
                <Icon name="sparkles" size={16} />
                {explains[card.id]?.status === 'loading' ? 'Thinking…' : 'Explain'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={index === 0}
                data-space-flips
                className="btn btn-secondary !p-2.5"
                aria-label="Previous card"
              >
                <Icon name="left" />
              </button>
              <button type="button" onClick={flip} className="btn btn-secondary" data-space-flips>
                Flip
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                data-space-flips
                className="btn btn-secondary !p-2.5"
                aria-label="Next card"
              >
                <Icon name="right" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => mark(false)}
              data-space-flips
              className="btn btn-lg bg-warn-soft text-warn hover:brightness-95"
            >
              Still learning
            </button>
            <button
              type="button"
              onClick={() => mark(true)}
              data-space-flips
              className="btn btn-lg bg-success-soft text-success hover:brightness-95"
            >
              <Icon name="check" />
              Got it
            </button>
          </div>
          {explains[card.id] && explains[card.id].status !== 'loading' && (
            <div
              role="status"
              className={`pop rounded-2xl border-2 border-ink p-4 ${
                explains[card.id].status === 'error' ? 'bg-danger-soft' : 'bg-sky-soft'
              }`}
            >
              <p className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted">
                <Icon name="sparkles" size={14} />
                {explains[card.id].status === 'error' ? 'Oops' : 'AI tutor'}
              </p>
              <p className="whitespace-pre-line">{explains[card.id].text}</p>
            </div>
          )}
          <p className="hidden text-center text-xs text-muted sm:block">
            Shortcuts: <kbd>Space</kbd> flip · <kbd>←</kbd> <kbd>→</kbd> navigate
          </p>
        </>
      ) : (
        <div className="panel flex flex-col items-center gap-4 px-6 py-14 text-center">
          {deck.length > 0 && <Confetti />}
          <span className="pop flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-ink bg-mint text-[#1b1033]">
            <Icon name="check" size={28} />
          </span>
          <h2 className="text-2xl font-semibold">
            {deck.length === 0 ? 'Nothing in this deck' : 'You made it through the deck!'}
          </h2>
          <p className="text-muted">
            {deck.length === 0
              ? 'Star some cards or switch the filter above.'
              : `${knownCount} of ${cards.length} cards marked as known.`}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {cards.some((c) => !c.known) && filter !== 'learning' && (
              <button
                type="button"
                onClick={() => restart('learning')}
                className="btn btn-primary"
              >
                Study what I’m still learning
              </button>
            )}
            <button type="button" onClick={() => restart()} className="btn btn-secondary">
              <Icon name="refresh" size={16} />
              Restart
            </button>
            <button type="button" onClick={() => goTo('quiz')} className="btn btn-secondary">
              Take a quiz
            </button>
            {knownCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  resetProgress(setId);
                  restart('all');
                }}
                className="btn btn-ghost"
              >
                Reset progress
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
