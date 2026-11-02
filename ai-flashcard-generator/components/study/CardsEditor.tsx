'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CardRow, { type RowField } from '@/components/CardRow';
import { Icon } from '@/components/icons';
import { ensureTerms } from '@/lib/consent';
import { petReact } from '@/lib/pet';
import { updateSet } from '@/lib/storage';
import type { Card, StudySet } from '@/lib/types';
import { parseCards, uid } from '@/lib/utils';

type ApiCard = { term: string; definition: string; distractors?: string[] };

const PAGE = 100; // rows rendered at a time, so very large sets stay fast
const SAVE_DELAY = 400;

export default function CardsEditor({ set }: { set: StudySet }) {
  // Edit a local copy and save it shortly after typing stops. That keeps typing
  // snappy even in sets with thousands of cards.
  const [cards, setCards] = useState<Card[]>(set.cards);
  const [title, setTitle] = useState(set.title);
  const [description, setDescription] = useState(set.description ?? '');
  const [visible, setVisible] = useState(PAGE);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreText, setMoreText] = useState('5');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const latest = useRef({ cards, title, description });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setId = set.id;

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    const { cards, title, description } = latest.current;
    updateSet(setId, {
      cards,
      title: title.trim() ? title : 'Untitled set',
      description: description.trim() ? description : undefined,
    });
  }, [setId]);

  // Apply a change to local state and schedule a save.
  const commit = useCallback(
    (next: Partial<{ cards: Card[]; title: string; description: string }>) => {
      latest.current = { ...latest.current, ...next };
      if (next.cards) setCards(next.cards);
      if (next.title !== undefined) setTitle(next.title);
      if (next.description !== undefined) setDescription(next.description);
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY);
    },
    [flush]
  );

  // Don't lose edits when leaving the tab or closing the page.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  const incomplete = cards.filter((c) => !c.term.trim() || !c.definition.trim()).length;

  const onChange = useCallback(
    (id: string, field: RowField, value: string) => {
      const next = latest.current.cards.map((c) =>
        c.id === id
          ? // Old AI distractors no longer fit an edited definition.
            field === 'definition'
            ? { ...c, definition: value, distractors: undefined }
            : { ...c, term: value }
          : c
      );
      commit({ cards: next });
    },
    [commit]
  );

  const onDelete = useCallback(
    (id: string) => commit({ cards: latest.current.cards.filter((c) => c.id !== id) }),
    [commit]
  );

  const onMove = useCallback(
    (id: string, dir: -1 | 1) => {
      const list = [...latest.current.cards];
      const i = list.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      commit({ cards: list });
    },
    [commit]
  );

  const onToggleStar = useCallback(
    (id: string) =>
      commit({
        cards: latest.current.cards.map((c) => (c.id === id ? { ...c, starred: !c.starred } : c)),
      }),
    [commit]
  );

  const addCard = useCallback(() => {
    const card: Card = { id: uid(), term: '', definition: '' };
    const next = [...latest.current.cards, card];
    setVisible((v) => Math.max(v, next.length));
    setFocusId(card.id);
    commit({ cards: next });
  }, [commit]);

  function addBulk() {
    const parsed = parseCards(bulkText);
    if (parsed.length === 0) {
      setMessage({
        kind: 'error',
        text: 'No cards found. Put one card per line, with the term and definition separated by a tab, “ - ”, a comma or a colon.',
      });
      return;
    }
    const next = [...latest.current.cards, ...parsed.map((p) => ({ id: uid(), ...p }))];
    commit({ cards: next });
    setBulkText('');
    setBulkOpen(false);
    setMessage({ kind: 'ok', text: `Added ${parsed.length} cards.` });
  }

  const moreRaw = Math.round(Number(moreText));
  const more = Number.isFinite(moreRaw) ? Math.min(25, Math.max(1, moreRaw)) : 5;

  async function generateMore() {
    if (!ensureTerms(generateMore)) return;
    setBusy(true);
    setMessage(null);
    petReact('think');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: title.trim() || 'General knowledge',
          count: more,
          // Recent terms are enough to avoid repeats and keep the request small.
          exclude: latest.current.cards
            .map((c) => c.term)
            .filter((t) => t.trim())
            .slice(-150),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: 'error', text: data.error || 'Something went wrong.' });
        return;
      }
      const added: ApiCard[] = data.cards ?? [];
      if (added.length === 0) {
        setMessage({ kind: 'error', text: 'The AI had nothing new to add. Try again.' });
        return;
      }
      const next = [...latest.current.cards, ...added.map((c) => ({ id: uid(), ...c }))];
      setVisible((v) => Math.max(v, next.length));
      commit({ cards: next });
      flush();
      petReact('party', `Added ${added.length} new card${added.length === 1 ? '' : 's'}!`);
      setMessage({
        kind: 'ok',
        text: `Added ${added.length} new card${added.length === 1 ? '' : 's'} at the bottom.`,
      });
    } catch {
      setMessage({ kind: 'error', text: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  const shown = cards.slice(0, visible);

  return (
    <div className="flex flex-col gap-6">
      <div className="panel flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="set-title" className="text-sm font-bold">
            Title
          </label>
          <input
            id="set-title"
            value={title}
            maxLength={100}
            onChange={(e) => commit({ title: e.target.value })}
            onBlur={flush}
            className="input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="set-desc" className="text-sm font-bold">
            Description <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="set-desc"
            value={description}
            maxLength={200}
            onChange={(e) => commit({ description: e.target.value })}
            onBlur={flush}
            className="input"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl font-extrabold">
          Terms and definitions{' '}
          <span className="text-base font-bold text-muted">({cards.length})</span>
        </h3>
        <button
          type="button"
          onClick={() => setBulkOpen((o) => !o)}
          aria-expanded={bulkOpen}
          className="btn btn-secondary !py-2"
        >
          <Icon name="list" size={16} />
          Paste many
        </button>
      </div>

      {bulkOpen && (
        <div className="panel-soft flex flex-col gap-3 p-4">
          <label htmlFor="bulk-edit" className="text-sm font-bold">
            One card per line
          </label>
          <textarea
            id="bulk-edit"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={'mitochondria - powerhouse of the cell\nnucleus, holds the DNA'}
            className="input resize-y font-mono text-sm"
          />
          <div className="flex gap-2">
            <button type="button" onClick={addBulk} className="btn btn-primary !py-2">
              Add {parseCards(bulkText).length || ''} cards
            </button>
            <button type="button" onClick={() => setBulkOpen(false)} className="btn btn-ghost !py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {incomplete > 0 && (
        <p className="rounded-xl border-2 border-ink bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">
          {incomplete} card{incomplete === 1 ? ' is' : 's are'} missing a term or
          definition and will be skipped when studying.
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {shown.map((c, i) => (
          <CardRow
            key={c.id}
            id={c.id}
            index={i}
            term={c.term}
            definition={c.definition}
            starred={c.starred}
            showStar
            isFirst={i === 0}
            isLast={i === cards.length - 1}
            focusTerm={focusId === c.id}
            onChange={onChange}
            onDelete={onDelete}
            onMove={onMove}
            onToggleStar={onToggleStar}
            onAddAfter={addCard}
          />
        ))}
      </ol>

      {cards.length > visible && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE)}
          className="btn btn-secondary"
        >
          Show {Math.min(PAGE, cards.length - visible)} more ({cards.length - visible} hidden)
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={addCard} className="btn btn-secondary btn-lg">
          <Icon name="plus" />
          Add a card
        </button>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="more-count">
            How many cards to add
          </label>
          <input
            id="more-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={25}
            value={moreText}
            onChange={(e) => setMoreText(e.target.value)}
            onBlur={() => setMoreText(String(more))}
            className="input !w-20 text-center font-bold"
          />
          <button
            type="button"
            onClick={generateMore}
            disabled={busy}
            className="btn btn-accent btn-lg min-w-0 flex-1"
          >
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Thinking…
              </>
            ) : (
              <>
                <Icon name="sparkles" />
                Add {more} more with AI
              </>
            )}
          </button>
        </div>
      </div>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`text-sm font-semibold ${
            message.kind === 'error' ? 'text-danger' : 'text-success'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
