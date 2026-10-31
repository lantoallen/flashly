'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import AccentPicker from './AccentPicker';
import Avatar from './Avatar';
import { Icon } from './icons';
import { useSocial } from './SocialProvider';
import TagInput from './TagInput';
import {
  fetchBirthday,
  isUsernameFree,
  listBlocked,
  saveBirthday,
  unblockUser,
} from '@/lib/community';
import { ImageError, resizeToAvatar } from '@/lib/image';
import {
  AVATAR_COLORS,
  ageFromBirthday,
  birthdayProblem,
  LIMITS,
  normalizeTags,
  normalizeUsername,
  usernameProblem,
  type DmPolicy,
  type PublicProfile,
} from '@/lib/social';
import { setAccent, useAccent } from '@/lib/theme';

const INTEREST_IDEAS = [
  'biology', 'chemistry', 'physics', 'math', 'history', 'literature',
  'spanish', 'french', 'programming', 'music', 'art', 'medicine',
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="font-display text-xl font-extrabold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function ProfileEditor() {
  const social = useSocial();
  const profile = social.profile!;
  const accent = useAccent();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [interests, setInterests] = useState(profile.interests);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor);
  const [dmPolicy, setDmPolicy] = useState<DmPolicy>(profile.dmPolicy);
  const [discoverable, setDiscoverable] = useState(profile.discoverable);
  const [birthday, setBirthday] = useState('');
  const [savedBirthday, setSavedBirthday] = useState('');
  const [birthdayLoaded, setBirthdayLoaded] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle');
  const [blocked, setBlocked] = useState<PublicProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [photoError, setPhotoError] = useState('');

  const client = social.client;
  const userId = social.userId;

  // Private details and the blocked list live in other tables.
  useEffect(() => {
    if (!client || !userId) return;
    let cancelled = false;
    Promise.all([fetchBirthday(client, userId), listBlocked(client, userId)])
      .then(([b, list]) => {
        if (cancelled) return;
        setBirthday(b);
        setSavedBirthday(b);
        setBlocked(list);
        setBirthdayLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setBirthdayLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client, userId]);

  // Is the chosen username available?
  const usernameIssue = usernameProblem(username);
  useEffect(() => {
    if (!client || !userId) return;
    if (username === profile.username || usernameProblem(username)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setNameStatus('checking');
      try {
        const free = await isUsernameFree(client, username, userId);
        if (!cancelled) setNameStatus(free ? 'free' : 'taken');
      } catch {
        if (!cancelled) setNameStatus('idle');
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, userId, username, profile.username]);

  const bdProblem = birthdayProblem(birthday);
  const age = birthday ? ageFromBirthday(birthday) : null;
  const usernameChanged = username !== profile.username;
  const nameBlocked = usernameChanged && (usernameIssue !== null || nameStatus === 'taken');

  const dirty =
    displayName !== profile.displayName ||
    username !== profile.username ||
    bio !== profile.bio ||
    avatar !== profile.avatar ||
    avatarColor !== profile.avatarColor ||
    dmPolicy !== profile.dmPolicy ||
    discoverable !== profile.discoverable ||
    interests.join('|') !== profile.interests.join('|') ||
    birthday !== savedBirthday;

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    try {
      setAvatar(await resizeToAvatar(file));
    } catch (err) {
      setPhotoError(err instanceof ImageError ? err.message : 'Could not use that picture.');
    }
  }

  function onBirthday(value: string) {
    setBirthday(value);
    const a = value ? ageFromBirthday(value) : null;
    // Be protective by default for under-18s: turn direct messages off.
    if (a !== null && a >= LIMITS.minAge && a < 18 && dmPolicy === 'everyone') {
      setDmPolicy('nobody');
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!client || !userId || saving || nameBlocked || bdProblem) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await social.saveProfile({
        username,
        displayName: displayName.trim(),
        bio: bio.trim(),
        interests,
        avatar,
        avatarColor,
        dmPolicy,
        discoverable,
      });
      if (!res.ok) {
        setMessage({ kind: 'error', text: res.error });
        return;
      }
      if (birthday !== savedBirthday) {
        await saveBirthday(client, userId, birthday);
        setSavedBirthday(birthday);
      }
      setMessage({ kind: 'ok', text: 'Profile saved.' });
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not save your profile.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function unblock(p: PublicProfile) {
    if (!client || !userId) return;
    try {
      await unblockUser(client, userId, p.id);
      setBlocked((list) => list.filter((x) => x.id !== p.id));
    } catch {
      setMessage({ kind: 'error', text: 'Could not unblock that person.' });
    }
  }

  const preview: PublicProfile = {
    id: profile.id,
    username,
    displayName,
    avatar,
    avatarColor,
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      {/* Header card */}
      <div className="panel flex flex-wrap items-center gap-5 bg-primary-soft p-5 sm:p-6">
        <Avatar person={preview} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display break-words text-3xl font-extrabold">
            {displayName.trim() || `@${username}`}
          </h1>
          <p className="text-sm font-semibold text-muted">@{username}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-secondary !py-2">
              <Icon name="upload" size={16} />
              {avatar ? 'Change photo' : 'Upload photo'}
            </button>
            {avatar && (
              <button type="button" onClick={() => setAvatar(null)} className="btn btn-ghost !py-2">
                Remove
              </button>
            )}
            <Link href={`/u/${profile.username}`} className="btn btn-ghost !py-2">
              View public profile
            </Link>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPhoto}
          />
          {photoError && (
            <p role="alert" className="mt-2 text-sm font-semibold text-danger">
              {photoError}
            </p>
          )}
        </div>
      </div>

      <Section title="Avatar color" description="Used when you don’t have a photo.">
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Avatar color">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={avatarColor === c.id}
              aria-label={c.label}
              title={c.label}
              onClick={() => setAvatarColor(c.id)}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105"
              style={{
                background: c.bg,
                color: c.fg,
                border: '2px solid var(--ink)',
                boxShadow: avatarColor === c.id ? '0 0 0 3px var(--sun)' : undefined,
              }}
            >
              {avatarColor === c.id && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      </Section>

      <Section title="About you">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="display-name" className="text-sm font-bold">
              Display name
            </label>
            <input
              id="display-name"
              value={displayName}
              maxLength={LIMITS.displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should people call you?"
              className="input"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="username" className="text-sm font-bold">
              Username
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted">
                @
              </span>
              <input
                id="username"
                value={username}
                maxLength={LIMITS.username.max}
                onChange={(e) => {
                  setNameStatus('idle');
                  setUsername(normalizeUsername(e.target.value));
                }}
                autoComplete="off"
                aria-invalid={nameBlocked}
                aria-describedby="username-help"
                className="input !pl-9"
              />
            </div>
            <p
              id="username-help"
              className={`text-xs font-semibold ${
                nameBlocked ? 'text-danger' : nameStatus === 'free' ? 'text-success' : 'text-muted'
              }`}
            >
              {usernameChanged && usernameIssue
                ? usernameIssue
                : usernameChanged && nameStatus === 'taken'
                  ? 'That username is already taken.'
                  : usernameChanged && nameStatus === 'checking'
                    ? 'Checking…'
                    : usernameChanged && nameStatus === 'free'
                      ? 'Available!'
                      : `3–${LIMITS.username.max} letters, numbers or underscores.`}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="bio" className="text-sm font-bold">
            Bio <span className="font-normal text-muted">({bio.length}/{LIMITS.bio})</span>
          </label>
          <textarea
            id="bio"
            value={bio}
            maxLength={LIMITS.bio}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            placeholder="What are you studying? What do you enjoy?"
            className="input resize-y"
          />
        </div>

        <TagInput
          label="Interests"
          tags={interests}
          onChange={(t) => setInterests(normalizeTags(t, LIMITS.interests))}
          max={LIMITS.interests}
          suggestions={INTEREST_IDEAS}
          placeholder="e.g. biology, guitar, spanish"
          hint="We use these to suggest people and sets you might like."
        />
      </Section>

      <Section
        title="Privacy"
        description="You’re in control of who can find and contact you."
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="birthday" className="text-sm font-bold">
            Birthday <span className="font-normal text-muted">(optional, only you can see it)</span>
          </label>
          <input
            id="birthday"
            type="date"
            value={birthday}
            max={new Date().toISOString().slice(0, 10)}
            disabled={!birthdayLoaded}
            onChange={(e) => onBirthday(e.target.value)}
            aria-invalid={Boolean(bdProblem)}
            className="input max-w-xs"
          />
          {bdProblem ? (
            <p role="alert" className="text-xs font-semibold text-danger">{bdProblem}</p>
          ) : age !== null && age < 18 ? (
            <p className="text-xs font-semibold text-muted">
              Because you’re under 18, direct messages are off by default. You can change
              this below.
            </p>
          ) : (
            <p className="text-xs text-muted">
              Never shown to anyone else. It’s only used to keep the community age-appropriate.
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold">Who can message you?</legend>
          <p className="text-xs text-muted">
            Messages are off until you turn them on. You can block or report anyone at any time.
          </p>
          <div className="grid max-w-md grid-cols-2 gap-2">
            {(
              [
                ['everyone', 'Anyone signed in'],
                ['nobody', 'Nobody'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={dmPolicy === value}
                onClick={() => setDmPolicy(value)}
                className={`btn !py-2.5 ${dmPolicy === value ? 'btn-primary' : 'btn-secondary'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={discoverable}
            onChange={(e) => setDiscoverable(e.target.checked)}
            className="mt-1 h-5 w-5 accent-[var(--primary)]"
          />
          <span>
            <span className="block text-sm font-bold">Show me in “People you may like”</span>
            <span className="block text-xs text-muted">
              When off, you won’t appear in suggestions or search. Your posts are still public if
              you published them.
            </span>
          </span>
        </label>

        {blocked.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold">Blocked people</p>
            <ul className="flex flex-col gap-2">
              {blocked.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-line p-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar person={p} size="sm" />
                    <span className="truncate text-sm font-bold">@{p.username}</span>
                  </span>
                  <button type="button" onClick={() => unblock(p)} className="btn btn-secondary !py-1.5">
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Appearance" description="Your color is saved with your account.">
        <AccentPicker value={accent} onChange={setAccent} />
      </Section>

      <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_var(--shadow-color)]">
        <button
          type="submit"
          disabled={!dirty || saving || nameBlocked || Boolean(bdProblem)}
          className="btn btn-primary"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && !saving && (
          <span className="text-sm font-semibold text-muted">You have unsaved changes.</span>
        )}
        {message && (
          <span
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={`text-sm font-bold ${message.kind === 'error' ? 'text-danger' : 'text-success'}`}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
