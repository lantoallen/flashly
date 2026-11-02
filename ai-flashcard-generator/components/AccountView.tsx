'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Icon } from './icons';
import PetFigure from './PetFigure';
import { acceptTerms, hasAcceptedTerms, useConsent } from '@/lib/consent';
import { download } from '@/lib/export';
import { levelOf, usePet } from '@/lib/pet';
import { useHydrated, useSets } from '@/lib/storage';
import { formatDate } from '@/lib/utils';

type Mode = 'signin' | 'signup' | 'reset';

export default function AccountView() {
  const auth = useAuth();
  const hydrated = useHydrated();

  if (!hydrated || auth.status === 'loading') {
    return <div className="panel h-72 animate-pulse bg-surface-2" aria-busy="true" />;
  }

  if (!auth.enabled) return <NotEnabled />;
  if (auth.recovering && auth.status === 'signedIn') return <NewPassword />;
  if (auth.status === 'signedIn') return <Profile />;
  return <SignInForm />;
}

function NotEnabled() {
  return (
    <div className="panel flex flex-col gap-4 p-7">
      <span className="eyebrow w-fit bg-sun">Accounts</span>
      <h1 className="text-4xl font-extrabold tracking-tight">Accounts aren’t switched on here</h1>
      <p className="text-muted">
        You can use every feature of Flashly without an account. Your sets are
        saved in this browser, and you can back them up from the Library page.
      </p>
      <details className="panel-soft p-4 text-sm">
        <summary className="cursor-pointer font-bold">Running this site? Turn accounts on</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted">
          <li>Create a free project at supabase.com.</li>
          <li>Run <code>supabase/schema.sql</code> in the SQL editor.</li>
          <li>
            Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your hosting settings, then redeploy.
          </li>
        </ol>
      </details>
      <Link href="/library" className="btn btn-primary w-fit">
        Go to my library
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SignInForm() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  // Never pre-ticked: the box also confirms the minimum age, which the
  // terms dialog doesn't ask about.
  const [agreed, setAgreed] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const pwOk = password.length >= 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');

    if (!emailOk) return setError('Enter a valid email address.');
    if (mode !== 'reset' && !pwOk) return setError('Your password must be at least 8 characters.');
    if (mode === 'signup' && !agreed) {
      return setError('Please agree to the Terms and Privacy Policy to create an account.');
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const r = await auth.signIn(email.trim(), password);
        if (!r.ok) setError(r.error);
      } else if (mode === 'signup') {
        const r = await auth.signUp(email.trim(), password, name);
        if (!r.ok) return setError(r.error);
        acceptTerms();
        if (r.needsConfirmation) {
          setNotice(
            'Almost there! We sent a confirmation link to your email. Open it to finish creating your account.'
          );
        }
      } else {
        const r = await auth.sendReset(email.trim());
        if (!r.ok) return setError(r.error);
        setNotice('If an account exists for that email, a reset link is on its way.');
      }
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="eyebrow bg-mint">Optional</span>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted">
          An account saves your sets, progress and streak, so they follow you to
          any device. Flashly works fine without one.
        </p>
      </div>

      <form onSubmit={submit} className="panel flex flex-col gap-5 p-6" noValidate>
        {mode !== 'reset' && (
          <div
            role="tablist"
            aria-label="Sign in or create an account"
            className="grid grid-cols-2 gap-1 rounded-xl border-2 border-ink bg-surface-2 p-1"
          >
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError('');
                  setNotice('');
                }}
                className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                  mode === m ? 'bg-ink text-bg' : 'text-muted hover:text-fg'
                }`}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>
        )}

        {mode === 'signup' && (
          <div className="flex flex-col gap-2">
            <label htmlFor="acct-name" className="font-bold">
              Display name <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="acct-name"
              value={name}
              maxLength={40}
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="acct-email" className="font-bold">
            Email
          </label>
          <input
            id="acct-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
          />
        </div>

        {mode !== 'reset' && (
          <div className="flex flex-col gap-2">
            <label htmlFor="acct-password" className="font-bold">
              Password
            </label>
            <div className="relative">
              <input
                id="acct-password"
                type={showPw ? 'text' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input !pr-20"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-muted hover:text-fg"
                aria-pressed={showPw}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
            {mode === 'signup' && (
              <p className="text-xs text-muted">At least 8 characters.</p>
            )}
          </div>
        )}

        {mode === 'signup' && (
          <label className="flex items-start gap-3 rounded-xl border-2 border-ink bg-sun-soft p-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
            />
            <span>
              I’m at least 13 and I agree to the{' '}
              <Link href="/terms" target="_blank" className="font-bold text-primary-ink underline">
                Terms and Conditions
              </Link>{' '}
              and the{' '}
              <Link href="/privacy" target="_blank" className="font-bold text-primary-ink underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-xl border-2 border-ink bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl border-2 border-ink bg-success-soft px-4 py-3 text-sm font-semibold text-success">
            {notice}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn btn-primary btn-lg">
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>

        <div className="flex flex-wrap justify-between gap-2 text-sm">
          {mode === 'reset' ? (
            <button type="button" onClick={() => setMode('signin')} className="font-bold text-primary-ink underline">
              Back to sign in
            </button>
          ) : mode === 'signin' ? (
            <button type="button" onClick={() => setMode('reset')} className="font-bold text-primary-ink underline">
              Forgot your password?
            </button>
          ) : null}
        </div>
      </form>

      <p className="text-center text-sm text-muted">
        Your sets stay on this device until you sign in.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function NewPassword() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Your password must be at least 8 characters.');
    setBusy(true);
    const r = await auth.setNewPassword(password);
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  return (
    <form onSubmit={submit} className="panel flex flex-col gap-5 p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Choose a new password</h1>
      <div className="flex flex-col gap-2">
        <label htmlFor="new-password" className="font-bold">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          minLength={8}
          required
        />
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function Profile() {
  const auth = useAuth();
  const user = auth.user!;
  const sets = useSets();
  const pet = usePet();
  const lvl = levelOf(pet.xp);
  const consent = useConsent();
  const [name, setName] = useState(user.name);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const cards = sets.reduce((n, s) => n + s.cards.length, 0);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const r = await auth.updateName(name);
    setMessage(r.ok ? { kind: 'ok', text: 'Name updated.' } : { kind: 'error', text: r.error });
  }

  function exportAll() {
    download(
      `flashly-account-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(sets, null, 2),
      'application/json'
    );
  }

  async function removeCloud() {
    if (
      !window.confirm(
        'Delete everything stored in your account? Your sets stay on this device, but they will no longer sync. This can’t be undone.'
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await auth.deleteCloudData();
    setBusy(false);
    if (!r.ok) setMessage({ kind: 'error', text: r.error });
  }

  async function removeAccount() {
    if (
      !window.confirm(
        'Permanently delete your account and all cloud data? Your sets stay on this device. This can’t be undone.'
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await auth.deleteAccount();
    setBusy(false);
    if (!r.ok) setMessage({ kind: 'error', text: r.error });
  }

  const sync = auth.sync;

  return (
    <div className="flex flex-col gap-6">
      <div className="panel flex flex-col items-center gap-4 bg-primary-soft p-7 text-center sm:flex-row sm:text-left">
        <PetFigure size={96} level={lvl.level} mood="happy" />
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Signed in</p>
          <h1 className="font-display break-words text-3xl font-extrabold">{user.name}</h1>
          <p className="break-all text-muted">{user.email}</p>
          <p className="mt-1 text-sm font-semibold text-muted">
            {sets.length} set{sets.length === 1 ? '' : 's'} · {cards} cards · {pet.name} is level {lvl.level}
          </p>
        </div>
      </div>

      {/* Sync */}
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink ${
              sync.state === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
            }`}
          >
            <Icon name={sync.state === 'error' ? 'x' : sync.state === 'syncing' ? 'refresh' : 'check'} />
          </span>
          <div>
            <p className="font-bold">
              {sync.state === 'syncing'
                ? 'Syncing…'
                : sync.state === 'saved'
                  ? 'Saved to your account'
                  : sync.state === 'error'
                    ? 'Couldn’t sync'
                    : 'Ready'}
            </p>
            <p className="text-sm text-muted">
              {sync.state === 'saved'
                ? `Up to date at ${new Date(sync.at).toLocaleTimeString()}`
                : sync.state === 'error'
                  ? sync.message
                  : 'Changes sync automatically.'}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => auth.syncNow()} className="btn btn-secondary">
          <Icon name="refresh" size={16} />
          Sync now
        </button>
      </div>

      {/* Profile */}
      <form onSubmit={saveName} className="panel flex flex-col gap-3 p-5">
        <label htmlFor="profile-name" className="font-bold">Display name</label>
        <div className="flex gap-2">
          <input
            id="profile-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>

      {/* Agreements */}
      <div className="panel flex flex-col gap-2 p-5">
        <h2 className="font-display text-xl font-extrabold">Agreements</h2>
        <p className="text-sm text-muted">
          {user.termsVersion
            ? `You accepted the Terms and Privacy Policy (version ${user.termsVersion})${
                user.termsAt ? ` on ${formatDate(user.termsAt)}` : ''
              }.`
            : 'No agreement is recorded for this account yet.'}
        </p>
        <div className="flex flex-wrap gap-3 text-sm font-bold">
          <Link href="/terms" className="text-primary-ink underline">Terms and Conditions</Link>
          <Link href="/privacy" className="text-primary-ink underline">Privacy Policy</Link>
        </div>
      </div>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`text-sm font-semibold ${message.kind === 'error' ? 'text-danger' : 'text-success'}`}
        >
          {message.text}
        </p>
      )}

      {/* Data & sign out */}
      <div className="panel flex flex-col gap-4 p-5">
        <h2 className="font-display text-xl font-extrabold">Your data</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={exportAll} className="btn btn-secondary">
            <Icon name="download" size={16} />
            Export everything
          </button>
          <button type="button" onClick={() => auth.signOut(false)} className="btn btn-secondary">
            Sign out
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Sign out and remove all sets from this device? They stay in your account.')) {
                auth.signOut(true);
              }
            }}
            className="btn btn-secondary"
          >
            Sign out &amp; clear this device
          </button>
        </div>
        <div className="flex flex-wrap gap-3 border-t-2 border-dashed border-line pt-4">
          <button type="button" onClick={removeCloud} disabled={busy} className="btn btn-danger">
            <Icon name="trash" size={16} />
            Delete my cloud data
          </button>
          <button type="button" onClick={removeAccount} disabled={busy} className="btn btn-danger">
            <Icon name="trash" size={16} />
            Delete my account
          </button>
        </div>
      </div>

      {!hasAcceptedTerms(consent) && (
        <p className="text-sm text-warn">You haven’t accepted the current terms on this device yet.</p>
      )}
    </div>
  );
}
