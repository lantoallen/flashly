'use client';

import { Icon } from './icons';
import {
  GOAL_OPTIONS,
  lastDays,
  setGoal,
  streakOf,
  useActivity,
  useGoal,
} from '@/lib/activity';
import { isDue } from '@/lib/srs';
import { useHydrated, useSets } from '@/lib/storage';
import { nowMs } from '@/lib/utils';

/** Streak, daily goal ring, mastery and due-for-review at a glance. */
export default function Dashboard() {
  const hydrated = useHydrated();
  const days = useActivity();
  const sets = useSets();
  const goal = useGoal();

  // Nothing to show before the first set exists.
  if (!hydrated || sets.length === 0) return null;

  const now = nowMs();
  const week = lastDays(days, 7, now);
  const today = week[week.length - 1].count;
  const streak = streakOf(days, now);
  const studiedThisWeek = week.reduce((n, d) => n + d.count, 0);
  const max = Math.max(goal, ...week.map((d) => d.count));

  const cards = sets.flatMap((s) => s.cards.filter((c) => c.term.trim() && c.definition.trim()));
  const mastered = cards.filter((c) => c.known).length;
  const due = cards.filter((c) => c.due !== undefined && isDue(c, now)).length;

  const pct = Math.min(1, today / goal);
  const R = 34;
  const C = 2 * Math.PI * R;

  return (
    <section aria-labelledby="progress-title" className="mt-12 grid gap-4 md:grid-cols-[1.2fr_1fr_1fr]">
      <h2 id="progress-title" className="font-display text-2xl font-extrabold md:col-span-3">
        Your progress
      </h2>
      {/* Daily goal */}
      <div className="panel flex items-center gap-5 bg-sun-soft p-5">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 80 80" className="-rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r={R} fill="none" stroke="var(--line)" strokeWidth="9" />
            <circle
              cx="40"
              cy="40"
              r={R}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <Icon
            name={pct >= 1 ? 'check' : 'target'}
            size={22}
            className="absolute inset-0 m-auto text-primary-ink"
          />
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Today</p>
          <p className="font-display text-3xl font-extrabold">
            {today}
            <span className="text-lg text-muted"> / {goal}</span>
          </p>
          <p className="text-sm font-semibold text-muted">
            {pct >= 1 ? 'Goal reached. Nice!' : `${goal - today} to hit your daily goal`}
          </p>
          <label className="mt-1 flex items-center gap-2 text-xs font-bold text-muted">
            Daily goal
            <select
              value={GOAL_OPTIONS.includes(goal) ? goal : ''}
              onChange={(e) => setGoal(Number(e.target.value))}
              className="rounded-lg border-2 border-ink bg-surface px-1.5 py-0.5 text-xs font-bold text-fg"
              aria-label="Daily goal in cards"
            >
              {!GOAL_OPTIONS.includes(goal) && <option value="">{goal}</option>}
              {GOAL_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g} cards
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Streak */}
      <div className="panel flex items-center gap-4 bg-coral-soft p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-ink bg-surface text-coral">
          <Icon name="flame" size={28} />
        </span>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Streak</p>
          <p className="font-display text-3xl font-extrabold">
            {streak}
            <span className="text-lg text-muted"> day{streak === 1 ? '' : 's'}</span>
          </p>
          <p className="text-sm font-semibold text-muted">
            {streak === 0 ? 'Study a card to start one' : 'Keep it going tomorrow'}
          </p>
        </div>
      </div>

      {/* Mastery + due */}
      <div className="panel grid grid-cols-2 gap-3 bg-mint-soft p-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Known</p>
          <p className="font-display text-3xl font-extrabold">{mastered}</p>
          <p className="text-sm font-semibold text-muted">of {cards.length} cards</p>
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Due</p>
          <p className="font-display text-3xl font-extrabold">{due}</p>
          <p className="text-sm font-semibold text-muted">to review</p>
        </div>
      </div>

      {/* 7-day chart */}
      <div className="panel bg-surface p-5 md:col-span-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-extrabold">Last 7 days</h2>
          <p className="text-sm font-semibold text-muted">
            {studiedThisWeek} card{studiedThisWeek === 1 ? '' : 's'} studied
          </p>
        </div>
        <ul className="mt-4 flex h-24 items-end gap-2 sm:gap-4" aria-label="Cards studied per day">
          {week.map((d, i) => (
            <li key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div
                className={`w-full max-w-10 rounded-t-lg border-2 border-ink ${
                  i === week.length - 1 ? 'bg-primary' : 'bg-primary-soft'
                }`}
                style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%` }}
                title={`${d.count} cards`}
              />
              <span className="text-xs font-bold text-muted">{d.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
