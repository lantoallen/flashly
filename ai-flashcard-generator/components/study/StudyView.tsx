'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Icon, type IconName } from '@/components/icons';
import PublishDialog from '@/components/PublishDialog';
import { download, safeFileName, toCsv, toText } from '@/lib/export';
import { deleteSet, useHydrated, useSet } from '@/lib/storage';
import { SOURCE_LABEL } from '@/lib/types';
import { encodeSet } from '@/lib/share';
import { isDue } from '@/lib/srs';
import { nowMs, validCards } from '@/lib/utils';
import CardsEditor from './CardsEditor';
import Flashcards from './Flashcards';
import Match from './Match';
import Quiz from './Quiz';
import Review from './Review';
import Test from './Test';
import { type Tab } from './shared';
import Write from './Write';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'flashcards', label: 'Flashcards', icon: 'layers' },
  { id: 'review', label: 'Review', icon: 'repeat' },
  { id: 'quiz', label: 'Quiz', icon: 'quiz' },
  { id: 'test', label: 'Test', icon: 'list' },
  { id: 'write', label: 'Write', icon: 'type' },
  { id: 'match', label: 'Match', icon: 'grid' },
  { id: 'cards', label: 'Edit cards', icon: 'edit' },
];

export default function StudyView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const auth = useAuth();
  const [publishing, setPublishing] = useState(false);
  const hydrated = useHydrated();
  const set = useSet(id);
  const [tab, setTab] = useState<Tab | null>(null);
  const [copied, setCopied] = useState<'text' | 'link' | null>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [menuAlignRight, setMenuAlignRight] = useState(false);

  const cards = useMemo(() => (set ? validCards(set.cards) : []), [set]);

  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6" aria-busy="true">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-surface-2" />
        <div className="mt-8 h-80 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    );
  }

  if (!set) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Set not found</h1>
        <p className="text-muted">
          It may have been deleted, or it was created in a different browser.
        </p>
        <div className="flex gap-3">
          <Link href="/library" className="btn btn-primary">
            My library
          </Link>
          <Link href="/create" className="btn btn-secondary">
            Create a set
          </Link>
        </div>
      </div>
    );
  }

  const active: Tab = tab ?? (cards.length === 0 ? 'cards' : 'flashcards');
  const known = cards.filter((c) => c.known).length;

  const dueCount = cards.filter((c) => c.due !== undefined && isDue(c, nowMs())).length;

  const modeProps = {
    setId: set.id,
    title: set.title,
    cards,
    bestQuiz: set.bestQuiz,
    bestMatchMs: set.bestMatchMs,
    goTo: setTab,
  };

  function closeMenu() {
    menuRef.current?.removeAttribute('open');
  }

  async function copyText() {
    if (!set) return;
    try {
      await navigator.clipboard.writeText(toText(set));
      setCopied('text');
      setTimeout(() => setCopied(null), 2500);
    } catch {
      /* clipboard blocked */
    }
    closeMenu();
  }

  async function copyLink() {
    if (!set) return;
    try {
      const url = `${window.location.origin}/shared#${await encodeSet(set)}`;
      await navigator.clipboard.writeText(url);
      setCopied('link');
      setTimeout(() => setCopied(null), 2500);
    } catch {
      /* clipboard blocked */
    }
    closeMenu();
  }

  function remove() {
    if (set && window.confirm(`Delete “${set.title}”? This can’t be undone.`)) {
      deleteSet(set.id);
      router.push('/library');
    }
  }

  return (
    <>
    <div className="no-print mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/library"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"
      >
        <Icon name="left" size={16} />
        My library
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display break-words text-3xl font-extrabold tracking-tight sm:text-4xl">
            {set.title || 'Untitled set'}
          </h1>
          {set.description && <p className="mt-1 text-muted">{set.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="chip">{cards.length} cards</span>
            {cards.length > 0 && (
              <span className={`chip tabular-nums ${known === cards.length ? '!bg-success-soft !text-success' : ''}`}>
                {known}/{cards.length} known
              </span>
            )}
            <span className="chip">{SOURCE_LABEL[set.source]}</span>
            {set.bestQuiz !== undefined && (
              <span className="chip">Best quiz {set.bestQuiz}%</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <details
            ref={menuRef}
            className="relative"
            onToggle={(e) => {
              // Open towards the side with room, so the menu never runs off the screen.
              const el = e.currentTarget;
              if (!el.open) return;
              const left = el.getBoundingClientRect().left;
              setMenuAlignRight(left + 224 > window.innerWidth - 8);
            }}
          >
            <summary className="btn btn-secondary list-none">
              <Icon name="download" size={16} />
              Export
              <Icon name="chevron" size={14} />
            </summary>
            <div className={`panel absolute z-20 mt-2 flex w-56 flex-col p-1.5 shadow-lg ${menuAlignRight ? 'right-0' : 'left-0'}`}>
              <button
                type="button"
                className="btn btn-ghost !justify-start"
                onClick={() => {
                  download(`${safeFileName(set.title)}.csv`, toCsv(set), 'text/csv');
                  closeMenu();
                }}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="btn btn-ghost !justify-start"
                onClick={() => {
                  download(
                    `${safeFileName(set.title)}.json`,
                    JSON.stringify([set], null, 2),
                    'application/json'
                  );
                  closeMenu();
                }}
              >
                Download backup (JSON)
              </button>
              <button type="button" className="btn btn-ghost !justify-start" onClick={copyLink}>
                <Icon name="link" size={16} />
                Copy share link
              </button>
              <button
                type="button"
                className="btn btn-ghost !justify-start"
                onClick={() => {
                  closeMenu();
                  window.print();
                }}
              >
                <Icon name="download" size={16} />
                Print / save as PDF
              </button>
              <button type="button" className="btn btn-ghost !justify-start" onClick={copyText}>
                <Icon name="copy" size={16} />
                Copy as text
              </button>
            </div>
          </details>
          {auth.enabled && (
            <button
              type="button"
              onClick={() => {
                if (auth.status === 'signedIn') setPublishing(true);
                else router.push('/account');
              }}
              className="btn btn-secondary"
              title={
                auth.status === 'signedIn'
                  ? 'Share this set with the community'
                  : 'Sign in to share this set'
              }
            >
              <Icon name="upload" size={16} />
              Share
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            className="btn btn-danger !p-2.5"
            aria-label="Delete set"
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>
      {copied !== null && (
        <p role="status" className="mt-3 text-sm font-medium text-success">
          {copied === 'link'
            ? 'Share link copied. Anyone with it can add this set to their library.'
            : 'Copied to clipboard. Paste into Quizlet, Anki or Sheets.'}
        </p>
      )}


      <div
        role="tablist"
        aria-label="Study mode"
        className="mt-6 grid grid-cols-4 gap-1 rounded-2xl border-2 border-ink bg-surface-2 p-1 sm:flex sm:overflow-x-auto"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold leading-tight transition-colors sm:shrink-0 sm:flex-1 sm:flex-row sm:gap-2 sm:whitespace-nowrap sm:px-4 sm:py-2.5 sm:text-sm ${
              active === t.id
                ? 'bg-ink text-bg'
                : 'text-muted hover:text-fg'
            }`}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
            {t.id === 'review' && dueCount > 0 && (
              <span className="rounded-full bg-coral px-1.5 text-xs font-extrabold text-[#1b1033]">
                {dueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-6">
        {active === 'flashcards' &&
          (cards.length > 0 ? (
            <Flashcards {...modeProps} />
          ) : (
            <EmptyCards onEdit={() => setTab('cards')} />
          ))}
        {active === 'review' && <Review {...modeProps} />}
        {active === 'quiz' && <Quiz {...modeProps} />}
        {active === 'test' && <Test {...modeProps} />}
        {active === 'write' && <Write {...modeProps} />}
        {active === 'match' && <Match {...modeProps} />}
        {active === 'cards' && <CardsEditor set={set} />}
      </div>
    </div>
    <PrintSheet title={set.title} cards={cards} />
    {publishing && <PublishDialog set={set} onClose={() => setPublishing(false)} />}
    </>
  );
}

/** Only visible when printing (or saving as PDF). */
function PrintSheet({ title, cards }: { title: string; cards: { id: string; term: string; definition: string }[] }) {
  return (
    <section className="print-only mx-auto max-w-3xl p-6">
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{title || 'Flashcards'}</h1>
      <p style={{ marginBottom: '1rem' }}>{cards.length} cards · made with Flashly</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ width: '34%', textAlign: 'left', borderBottom: '2px solid #000', padding: '6px' }}>Term</th>
            <th style={{ textAlign: 'left', borderBottom: '2px solid #000', padding: '6px' }}>Definition</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id} style={{ breakInside: 'avoid' }}>
              <td style={{ verticalAlign: 'top', borderBottom: '1px solid #bbb', padding: '6px', fontWeight: 700 }}>{c.term}</td>
              <td style={{ verticalAlign: 'top', borderBottom: '1px solid #bbb', padding: '6px' }}>{c.definition}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function EmptyCards({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-lg font-semibold">This set has no complete cards yet</p>
      <button type="button" onClick={onEdit} className="btn btn-primary">
        <Icon name="edit" size={16} />
        Edit cards
      </button>
    </div>
  );
}
