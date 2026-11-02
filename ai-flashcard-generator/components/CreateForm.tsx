'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './icons';
import ManualBuilder from './ManualBuilder';
import { ensureTerms } from '@/lib/consent';
import { petReact } from '@/lib/pet';
import { saveSet } from '@/lib/storage';
import type { SetSource, StudySet } from '@/lib/types';
import { ACCEPT, type DocUnit } from '@/lib/docs';
import { FileReadError, joinPages, pagesThatFit, readDocument } from '@/lib/pdf';
import { parseCards, uid } from '@/lib/utils';

type Tab = 'notes' | 'topic' | 'manual' | 'import';
type Level = 'beginner' | 'intermediate' | 'advanced';
type NewCard = { term: string; definition: string; distractors?: string[] };

const TABS: { id: Tab; label: string; icon: 'edit' | 'search' | 'upload' | 'plus' }[] = [
  { id: 'notes', label: 'Paste notes', icon: 'edit' },
  { id: 'topic', label: 'Enter a topic', icon: 'search' },
  { id: 'manual', label: 'Type your own', icon: 'plus' },
  { id: 'import', label: 'Import list', icon: 'upload' },
];

const LEVELS: { id: Level; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

const IDEAS = [
  'Photosynthesis',
  'The French Revolution',
  'Big-O notation',
  'World War II causes',
  'The human heart',
  'Basic Spanish verbs',
];

const PRESETS = [5, 10, 20, 30, 50, 100, 200];
const MIN_CARDS = 3;
const MAX_CARDS = 200;
const BATCH = 10; // cards per AI request; bigger sets are generated in several requests
const MAX_RETRIES = 3;
const MAX_NOTES = 8000;
const MAX_TOPIC = 200;
const MAX_FILE_BYTES = 1_000_000;

export default function CreateForm() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('notes');
  const [notes, setNotes] = useState('');
  const [topic, setTopic] = useState('');
  const [importText, setImportText] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [countText, setCountText] = useState('10');
  const [level, setLevel] = useState<Level>('intermediate');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [waiting, setWaiting] = useState('');
  const [error, setError] = useState('');
  const [partial, setPartial] = useState<{ title: string; cards: NewCard[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const notesFileRef = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<{ name: string; pages: string[]; unit: DocUnit } | null>(null);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [reading, setReading] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const typed = Number(countText);
  const countValid =
    countText.trim() !== '' && Number.isInteger(typed) && typed >= MIN_CARDS && typed <= MAX_CARDS;
  const count = countValid ? typed : 10;

  const parsed = tab === 'import' ? parseCards(importText) : [];
  const canGenerate =
    tab === 'notes'
      ? notes.trim().length >= 20 && countValid
      : tab === 'topic'
        ? topic.trim().length > 0 && countValid
        : parsed.length >= 2;

  function finish(title: string, source: SetSource, cards: NewCard[]) {
    const now = Date.now();
    const set: StudySet = {
      id: uid(),
      title,
      source,
      createdAt: now,
      updatedAt: now,
      cards: cards.map((c) => ({ id: uid(), ...c })),
    };
    if (!saveSet(set)) {
      setError(
        'Your browser couldn’t save this set (storage is full or blocked). Delete old sets or allow site storage.'
      );
      return;
    }
    router.push(`/study/${set.id}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canGenerate || loading) return;
    setError('');
    setPartial(null);

    if (tab === 'import') {
      finish(importTitle.trim() || 'Imported set', 'import', parsed);
      return;
    }

    // The text is about to be sent to an AI provider: make sure terms are accepted.
    if (!ensureTerms(() => submit(e))) return;

    setLoading(true);
    petReact('think');
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;

    let all: NewCard[] = [];
    let title = '';
    try {
      // Request in batches, then top up any shortfall (duplicates get dropped).
      let requests = 0;
      const maxRequests = Math.ceil(count / BATCH) + 2;
      while (all.length < count && requests < maxRequests) {
        requests++;
        const size = Math.min(BATCH, count - all.length);
        const body = JSON.stringify({
          ...(tab === 'notes' ? { notes } : { topic }),
          count: size,
          level,
          exclude: all.slice(-150).map((c) => c.term),
        });

        let res: Response;
        let data: { error?: string; retryAfter?: number; title?: string; cards?: NewCard[] };
        for (let attempt = 0; ; attempt++) {
          res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: controller.signal,
          });
          data = await res.json().catch(() => ({}));
          // Rate limits and the AI's occasional empty answers are worth retrying.
          const retryable = res.status === 429 || res.status === 502;
          if (res.ok || !retryable || attempt >= MAX_RETRIES) break;
          const seconds = Math.min(20, Math.max(3, data.retryAfter ?? 4)) + 1;
          setWaiting(
            res.status === 429
              ? `The AI is catching its breath. Continuing in ${seconds}s…`
              : 'Trying that batch again…'
          );
          await new Promise((r) => setTimeout(r, seconds * 1000));
          setWaiting('');
        }

        if (!res.ok) {
          const message = data.error || 'Something went wrong. Please try again.';
          if (all.length === 0) {
            setError(message);
          } else {
            // Keep what we already have instead of throwing it away.
            setPartial({ title: title || topic || 'Untitled set', cards: all });
            setError(`${message} We generated ${all.length} of ${count} cards.`);
          }
          return;
        }

        // Drop anything we already have (case-insensitive), then cap at the request.
        const have = new Set(all.map((c) => c.term.trim().toLowerCase()));
        const fresh = (data.cards ?? []).filter((c) => {
          const key = c.term.trim().toLowerCase();
          if (!key || have.has(key)) return false;
          have.add(key);
          return true;
        });
        all = [...all, ...fresh].slice(0, count);
        if (!title) title = data.title ?? '';
        setProgress(all.length);
        if (fresh.length === 0) break; // nothing new to add, so stop asking
      }
      petReact('party', `${all.length} cards ready!`);
      finish(title || topic || 'Untitled set', tab, all);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        if (all.length) setPartial({ title: title || topic || 'Untitled set', cards: all });
        return;
      }
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
      setWaiting('');
      abortRef.current = null;
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is too large. Please use a file under 1 MB.');
      return;
    }
    setError('');
    const text = await file.text();
    setImportText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${text}` : text));
    if (!importTitle.trim()) {
      setImportTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 100));
    }
  }

  function applyRange(pages: string[], a: number, b: number) {
    const last = pages.length;
    const f = Math.min(Math.max(1, a), last);
    const t = Math.min(Math.max(f, b), last);
    setFrom(f);
    setTo(t);
    const { text, truncated: cut } = joinPages(pages, f, t, MAX_NOTES);
    setNotes(text);
    setTruncated(cut);
  }

  async function onNotesFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setReading(true);
    try {
      const { pages, unit } = await readDocument(file);
      setDoc({ name: file.name, pages, unit });
      applyRange(pages, 1, pagesThatFit(pages, MAX_NOTES));
    } catch (err) {
      setDoc(null);
      setError(err instanceof FileReadError ? err.message : 'That file couldn’t be read.');
    } finally {
      setReading(false);
    }
  }

  function startBlank() {
    finish('Untitled set', 'manual', [
      { term: '', definition: '' },
      { term: '', definition: '' },
      { term: '', definition: '' },
    ]);
  }

  return (
    <div className="panel flex flex-col gap-6 p-5 sm:p-7">
      <div
        role="tablist"
        aria-label="How do you want to start?"
        className="grid grid-cols-2 gap-1 rounded-xl border-2 border-ink bg-surface-2 p-1 sm:grid-cols-4"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setError('');
              setPartial(null);
            }}
            className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-sm font-bold transition-colors ${
              tab === t.id ? 'bg-ink text-bg' : 'text-muted hover:text-fg'
            }`}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'manual' ? (
        <ManualBuilder />
      ) : (
      <form onSubmit={submit} className="flex flex-col gap-6">
      {tab === 'notes' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="notes" className="font-bold">
              Your notes
            </label>
            <button
              type="button"
              onClick={() => notesFileRef.current?.click()}
              disabled={reading}
              className="btn btn-secondary !py-1.5"
            >
              <Icon name="upload" size={16} />
              {reading ? 'Reading file…' : 'Upload a document'}
            </button>
            <input
              ref={notesFileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={onNotesFile}
            />
          </div>

          {doc && (
            <div className="flex flex-col gap-2 rounded-xl border-2 border-line bg-surface-2 p-3 text-sm">
              <p className="font-semibold">
                <span className="break-all">{doc.name}</span>
                <span className="text-muted">
                  {' '}
                  · {doc.pages.length} {doc.unit}{doc.pages.length === 1 ? '' : 's'}
                </span>
              </p>
              {doc.pages.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="page-from" className="font-bold">Use {doc.unit}s</label>
                  <input
                    id="page-from"
                    type="number"
                    min={1}
                    max={doc.pages.length}
                    value={from}
                    onChange={(e) => applyRange(doc.pages, Number(e.target.value) || 1, Math.max(to, Number(e.target.value) || 1))}
                    className="input !w-20 !py-1.5 text-center"
                  />
                  <span>to</span>
                  <input
                    aria-label={`Last ${doc.unit}`}
                    type="number"
                    min={from}
                    max={doc.pages.length}
                    value={to}
                    onChange={(e) => applyRange(doc.pages, from, Number(e.target.value) || from)}
                    className="input !w-20 !py-1.5 text-center"
                  />
                </div>
              )}
              <p className={truncated ? 'font-semibold text-warn' : 'text-muted'}>
                {truncated
                  ? `That's more than the ${MAX_NOTES.toLocaleString()} character limit, so only the start is used. Pick fewer ${doc.unit}s for the rest.`
                  : 'The text is filled in below. You can edit it before generating.'}
              </p>
            </div>
          )}
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setTruncated(false);
            }}
            maxLength={MAX_NOTES}
            rows={10}
            placeholder="Paste lecture notes, a textbook section, an article…"
            className="input resize-y"
          />
          <p className="text-right text-xs text-muted">
            {notes.length.toLocaleString()} / {MAX_NOTES.toLocaleString()}
          </p>
        </div>
      )}

      {tab === 'topic' && (
        <div className="flex flex-col gap-3">
          <label htmlFor="topic" className="font-bold">
            What do you want to learn?
          </label>
          <input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={MAX_TOPIC}
            placeholder="e.g. Photosynthesis, The French Revolution, Big-O notation"
            className="input"
          />
          <div className="flex flex-wrap gap-2">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setTopic(idea)}
                className="chip cursor-pointer transition-colors hover:bg-primary-soft"
              >
                {idea}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'import' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="import-title" className="font-bold">
              Set title
            </label>
            <input
              id="import-title"
              value={importTitle}
              onChange={(e) => setImportTitle(e.target.value)}
              maxLength={100}
              placeholder="Imported set"
              className="input"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="import-text" className="font-bold">
                Your cards
              </label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="btn btn-secondary !py-1.5"
              >
                <Icon name="upload" size={16} />
                Upload .csv / .txt
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
                className="hidden"
                onChange={onFile}
              />
            </div>
            <textarea
              id="import-text"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={9}
              placeholder={'One card per line:\nmitochondria - powerhouse of the cell\nnucleus, holds the DNA'}
              className="input resize-y font-mono text-sm"
            />
            <p className="text-sm text-muted">
              Separate the term and definition with a tab, “ - ”, a comma, a
              semicolon or a colon. Flashly CSV exports import cleanly too.{' '}
              <strong className={parsed.length >= 2 ? 'text-success' : ''}>
                {parsed.length} card{parsed.length === 1 ? '' : 's'} detected.
              </strong>
            </p>
          </div>
          <button type="button" onClick={startBlank} className="btn btn-ghost w-fit">
            <Icon name="plus" size={16} />
            Or start with a blank set
          </button>
        </div>
      )}

      {tab !== 'import' && (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <label htmlFor="count" className="font-bold">
              Number of cards
            </label>
            <div className="flex items-center gap-3">
              <input
                id="count"
                type="number"
                inputMode="numeric"
                min={MIN_CARDS}
                max={MAX_CARDS}
                value={countText}
                onChange={(e) => setCountText(e.target.value)}
                onBlur={() => {
                  // Snap to a valid number when leaving the field.
                  const n = Math.round(Number(countText));
                  setCountText(
                    String(Number.isFinite(n) ? Math.min(MAX_CARDS, Math.max(MIN_CARDS, n)) : 10)
                  );
                }}
                aria-invalid={!countValid}
                className="input !w-24 text-center font-bold"
              />
              <input
                type="range"
                aria-label="Number of cards slider"
                min={MIN_CARDS}
                max={MAX_CARDS}
                value={count}
                onChange={(e) => setCountText(e.target.value)}
                className="min-w-0 flex-1 accent-[var(--primary)]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCountText(String(p))}
                  aria-pressed={count === p && countValid}
                  className={`chip cursor-pointer transition-colors ${
                    count === p && countValid ? '!bg-ink !text-bg' : 'hover:bg-primary-soft'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className={`text-xs ${countValid ? 'text-muted' : 'font-bold text-danger'}`}>
              {countValid
                ? count > 100
                  ? 'Very large sets are built in many steps and can take a few minutes. You can cancel and keep what is ready.'
                  : count > BATCH
                    ? 'Larger sets are generated in several steps, so they take a little longer.'
                    : `Pick any number from ${MIN_CARDS} to ${MAX_CARDS}.`
                : `Enter a whole number from ${MIN_CARDS} to ${MAX_CARDS}.`}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <span className="font-bold" id="level-label">
              Difficulty
            </span>
            <div
              role="radiogroup"
              aria-labelledby="level-label"
              className="grid grid-cols-3 gap-1 rounded-xl border-2 border-ink bg-surface-2 p-1"
            >
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={level === l.id}
                  onClick={() => setLevel(l.id)}
                  className={`rounded-lg px-0.5 py-2 text-[11px] font-bold transition-colors min-[360px]:text-xs sm:px-2 sm:text-sm ${
                    level === l.id ? 'bg-ink text-bg' : 'text-muted hover:text-fg'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border-2 border-ink bg-danger-soft px-4 py-3 text-sm font-semibold text-danger"
        >
          <p>{error}</p>
          {partial && (
            <button
              type="button"
              onClick={() => finish(partial.title, tab, partial.cards)}
              className="btn btn-primary !py-2"
            >
              <Icon name="check" size={16} />
              Save the {partial.cards.length} cards I have
            </button>
          )}
        </div>
      )}

      {loading && (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="text-sm font-bold">
            Generating cards… {progress} of {count}
          </p>
          {waiting && <p className="text-sm font-semibold text-warn">{waiting}</p>}
          <div
            className="h-3 overflow-hidden rounded-full border-2 border-ink bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={count}
            aria-valuenow={progress}
          >
            <div
              className="brand-bg h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(6, (progress / count) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!canGenerate || loading}
          aria-describedby={!canGenerate && !loading ? 'generate-hint' : undefined}
          className="btn btn-primary btn-lg"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Generating…
            </>
          ) : tab === 'import' ? (
            <>
              <Icon name="check" />
              Create set
            </>
          ) : (
            <>
              <Icon name="sparkles" />
              Generate {count} cards
            </>
          )}
        </button>
        {loading && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="btn btn-ghost"
          >
            Cancel
          </button>
        )}
        {!loading && !canGenerate && (
          <p id="generate-hint" className="text-sm font-semibold text-muted">
            {tab === 'notes' && notes.trim().length < 20
              ? 'Paste at least a couple of sentences, or upload a file, to continue.'
              : tab === 'topic' && topic.trim().length === 0
                ? 'Type a topic to continue.'
                : tab === 'import'
                  ? 'Add at least 2 cards (one per line) to continue.'
                  : `Choose between ${MIN_CARDS} and ${MAX_CARDS} cards.`}
          </p>
        )}
      </div>
      </form>
      )}
    </div>
  );
}
