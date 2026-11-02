'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import DemoButton from './DemoButton';
import { Icon } from './icons';
import { deleteSet, importSets, saveSet, useHydrated, useSets } from '@/lib/storage';
import { download } from '@/lib/export';
import { SOURCE_LABEL } from '@/lib/types';
import type { StudySet } from '@/lib/types';
import { formatDate, nowMs, uid, validCards } from '@/lib/utils';

type Sort = 'recent' | 'name' | 'size';

export default function LibraryView() {
  const hydrated = useHydrated();
  const sets = useSets();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const visible = sets
    .filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) =>
      sort === 'name'
        ? a.title.localeCompare(b.title)
        : sort === 'size'
          ? b.cards.length - a.cards.length
          : (b.lastStudied ?? b.updatedAt) - (a.lastStudied ?? a.updatedAt)
    );

  function backup() {
    download(
      `flashly-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(sets, null, 2),
      'application/json'
    );
  }

  async function restore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const added = importSets(JSON.parse(await file.text()));
      setNotice(
        added
          ? `Imported ${added} set${added === 1 ? '' : 's'}.`
          : 'No new sets found in that file.'
      );
    } catch {
      setNotice('That file isn’t a valid Flashly backup.');
    }
  }

  function duplicate(set: StudySet) {
    const now = nowMs();
    saveSet({
      ...set,
      id: uid(),
      title: `${set.title} (copy)`.slice(0, 100),
      createdAt: now,
      updatedAt: now,
      lastStudied: undefined,
      bestQuiz: undefined,
      bestMatchMs: undefined,
      // A copy starts fresh: same cards, no study progress.
      cards: set.cards.map((c) => ({
        ...c,
        id: uid(),
        known: undefined,
        box: undefined,
        due: undefined,
      })),
    });
    setNotice(`Duplicated “${set.title}”.`);
  }

  function remove(id: string, title: string) {
    if (window.confirm(`Delete “${title}”? This can’t be undone.`)) {
      deleteSet(id);
    }
  }

  if (!hydrated) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="panel h-44 animate-pulse bg-surface-2" />
        ))}
      </div>
    );
  }

  if (sets.length === 0) {
    return (
      <div className="panel flex flex-col items-center gap-4 px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-ink">
          <Icon name="library" size={28} />
        </span>
        <h2 className="text-xl font-semibold">Your library is empty</h2>
        <p className="max-w-md text-muted">
          Create your first set from notes or a topic, or open the demo to see
          how studying works.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/create" className="btn btn-primary btn-lg">
            <Icon name="sparkles" />
            Create a set
          </Link>
          <DemoButton />
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn btn-ghost"
        >
          <Icon name="upload" size={16} />
          Restore from backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={restore}
        />
        {notice && <p className="text-sm text-muted">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your sets"
            aria-label="Search your sets"
            className="input !py-2.5 pl-10"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort sets"
          className="input !w-auto !py-2.5"
        >
          <option value="recent">Recent</option>
          <option value="name">Name</option>
          <option value="size">Most cards</option>
        </select>
        <button type="button" onClick={backup} className="btn btn-secondary">
          <Icon name="download" size={16} />
          Backup
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn btn-secondary"
        >
          <Icon name="upload" size={16} />
          Restore
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={restore}
        />
      </div>
      {notice && (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="py-10 text-center text-muted">No sets match “{query}”.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => {
            const total = validCards(s.cards).length;
            const known = s.cards.filter((c) => c.known).length;
            const pct = total ? Math.round((known / total) * 100) : 0;
            return (
              <li key={s.id} className="panel flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/study/${s.id}`}
                    className="font-display line-clamp-2 text-xl font-extrabold hover:text-primary-ink"
                  >
                    {s.title}
                  </Link>
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      onClick={() => duplicate(s)}
                      className="btn btn-ghost !p-2"
                      aria-label={`Duplicate ${s.title}`}
                      title="Duplicate"
                    >
                      <Icon name="copy" size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id, s.title)}
                      className="btn btn-ghost !p-2"
                      aria-label={`Delete ${s.title}`}
                      title="Delete"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="chip">{total} cards</span>
                  <span className="chip">{SOURCE_LABEL[s.source]}</span>
                  {s.bestQuiz !== undefined && (
                    <span className="chip">Best quiz {s.bestQuiz}%</span>
                  )}
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>{known} of {total} known</span>
                    <span>{formatDate(s.updatedAt)}</span>
                  </div>
                  <div
                    className="h-3 overflow-hidden rounded-full border-2 border-ink bg-surface-2"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Mastery"
                  >
                    <div
                      className="brand-bg h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <Link href={`/study/${s.id}`} className="btn btn-primary mt-auto">
                  Study
                  <Icon name="right" size={16} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
