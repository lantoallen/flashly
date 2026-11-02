'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import PetChat from './PetChat';
import PetFigure from './PetFigure';
import { DAILY_GOAL, lastDays, streakOf, useActivity, useGoal } from '@/lib/activity';
import {
  levelOf,
  onPetReact,
  renamePet,
  setPetHidden,
  TIPS,
  usePet,
  type Mood,
  type Reaction,
} from '@/lib/pet';
import { useHydrated, useSets } from '@/lib/storage';
import { nowMs } from '@/lib/utils';

/** Floating study buddy. Reacts to what you do and levels up as you study. */
export default function Pet() {
  const hydrated = useHydrated();
  const pet = usePet();
  const days = useActivity();
  const goal = useGoal();
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [open, setOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [tab, setTab] = useState<'buddy' | 'chat'>('buddy');
  const pathname = usePathname();
  const sets = useSets();
  const [draftName, setDraftName] = useState('');
  const draftRef = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // On phones the buddy slides out of the way while you scroll down, so it
  // doesn't sit on top of buttons, and comes back when you scroll up.
  const [tucked, setTucked] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 8) return;
      setTucked(y > lastY && y > 80);
      lastY = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const off = onPetReact((r) => {
      setReaction(r);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setReaction(null), 3200);
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Save a typed name even if the panel is closed without leaving the field first.
  const commitName = useCallback(() => {
    const name = draftRef.current.trim();
    if (name) renamePet(name);
    draftRef.current = '';
    setDraftName('');
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        commitName();
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        commitName();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, commitName]);

  if (!hydrated) return null;

  const now = nowMs();
  const today = lastDays(days, 1, now)[0].count;
  const streak = streakOf(days, now);
  const lvl = levelOf(pet.xp);

  const studyId = /^\/study\/([^/]+)/.exec(pathname)?.[1];
  const studying = studyId ? sets.find((x) => x.id === studyId) : undefined;
  const chatContext = {
    setTitle: studying?.title,
    terms: studying?.cards.map((c) => c.term).filter((t) => t.trim()).slice(0, 12),
    level: lvl.level,
    streak,
    today,
    goal,
  };

  // Resting mood from how today is going; reactions override it briefly.
  const resting: Mood = today >= goal ? 'excited' : today > 0 ? 'happy' : streak > 0 ? 'sleepy' : 'happy';
  const mood: Mood = reaction?.mood ?? resting;
  const bubble =
    reaction?.text ??
    (open ? undefined : undefined);

  if (pet.hidden) {
    return (
      <button
        type="button"
        onClick={() => setPetHidden(false)}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-surface shadow-[3px_3px_0_var(--shadow-color)] hover:scale-105"
        aria-label={`Show ${pet.name}, your study buddy`}
        title={`Show ${pet.name}`}
      >
        <PetFigure size={30} level={lvl.level} animate={false} />
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`no-print fixed bottom-3 right-3 z-40 flex flex-col items-end gap-2 transition duration-300 motion-reduce:transition-none sm:bottom-4 sm:right-4 ${
        tucked && !open
          ? 'max-sm:pointer-events-none max-sm:translate-y-[150%] max-sm:opacity-0 max-sm:focus-within:pointer-events-auto max-sm:focus-within:translate-y-0 max-sm:focus-within:opacity-100'
          : ''
      }`}
    >
      {/* speech bubble for reactions */}
      {bubble && !open && (
        <div
          role="status"
          className="pop relative max-w-[14rem] rounded-2xl border-2 border-ink bg-surface px-3 py-2 text-sm font-bold shadow-[3px_3px_0_var(--shadow-color)]"
        >
          {bubble}
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={`${pet.name}, your study buddy`}
          className="panel pop w-[min(22rem,calc(100vw-2rem))] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-xl font-extrabold">{pet.name}</p>
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                Level {lvl.level} · {lvl.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                commitName();
                setOpen(false);
              }}
              className="btn btn-ghost !p-1.5"
              aria-label="Close"
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div
            role="tablist"
            aria-label={`${pet.name} sections`}
            className="mt-3 grid grid-cols-2 gap-1 rounded-xl border-2 border-ink bg-surface-2 p-1"
          >
            {(
              [
                ['buddy', 'Buddy'],
                ['chat', 'Chat'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors duration-200 ${
                  tab === id ? 'bg-ink text-bg' : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'chat' ? (
            <div className="mt-3">
              <PetChat name={pet.name} context={chatContext} />
            </div>
          ) : (
            <>
          <div className="mt-3">
            <div
              className="h-3 overflow-hidden rounded-full border-2 border-ink bg-surface-2"
              role="progressbar"
              aria-label="Progress to the next level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(lvl.progress * 100)}
            >
              <div className="brand-bg h-full" style={{ width: `${lvl.progress * 100}%` }} />
            </div>
            <p className="mt-1 text-xs font-semibold text-muted">
              {lvl.next
                ? `${pet.xp} / ${lvl.next.at} cards to ${lvl.next.title}`
                : `${pet.xp} cards studied. Max level!`}
            </p>
          </div>

          <p className="mt-3 rounded-xl bg-sun-soft p-3 text-sm font-semibold">
            {today >= goal
              ? `Daily goal done (${today}/${goal || DAILY_GOAL}). I’m so proud!`
              : TIPS[tipIndex % TIPS.length]}
          </p>

          <div className="mt-3 flex flex-col gap-2">
            <label className="text-xs font-bold text-muted" htmlFor="pet-name">
              Buddy’s name
            </label>
            <div className="flex gap-2">
              <input
                id="pet-name"
                value={draftName || pet.name}
                maxLength={16}
                onChange={(e) => {
                  draftRef.current = e.target.value;
                  setDraftName(e.target.value);
                }}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="input !py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipIndex((i) => i + 1)}
                className="btn btn-secondary !py-1.5 text-xs"
              >
                <Icon name="sparkles" size={14} />
                New tip
              </button>
              <button
                type="button"
                onClick={() => {
                  commitName();
                  setOpen(false);
                  setPetHidden(true);
                }}
                className="btn btn-ghost !py-1.5 text-xs"
              >
                Hide buddy
              </button>
            </div>
          </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (open) commitName();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-label={`${pet.name}, level ${lvl.level} study buddy. Open menu`}
        className="relative rounded-full transition-transform hover:scale-105 focus-visible:outline-offset-4"
      >
        {/* A real smaller size on phones (not a scale), so the tap area matches what you see. */}
        <PetFigure mood={mood} level={lvl.level} size={76} className="block max-sm:h-14 max-sm:w-14" />
        <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-ink bg-sun px-1 text-[11px] font-extrabold text-[#1b1033]">
          {lvl.level}
        </span>
      </button>
    </div>
  );
}
