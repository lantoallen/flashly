'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import Avatar from './Avatar';
import { Icon } from './icons';
import Modal from './Modal';
import ReportDialog from './ReportDialog';
import SocialGate from './SocialGate';
import { useSocial } from './SocialProvider';
import TagInput from './TagInput';
import { deletePost, getPost, likedPostIds, setLike, updatePost } from '@/lib/community';
import { LIMITS, nameOf, normalizeTags, timeAgo, type Post, type Visibility } from '@/lib/social';
import { saveSet } from '@/lib/storage';
import type { StudySet } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { nowMs, uid } from '@/lib/utils';

const PREVIEW = 8;

function EditDialog({ post, onClose, onSaved }: { post: Post; onClose: () => void; onSaved: () => void }) {
  const social = useSocial();
  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description);
  const [tags, setTags] = useState(post.tags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!social.client || busy || !title.trim()) return;
    setBusy(true);
    setError('');
    try {
      await updatePost(social.client, post.id, {
        title: title.trim(),
        description: description.trim(),
        tags,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit details" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="edit-title" className="text-sm font-bold">Title</label>
          <input
            id="edit-title"
            value={title}
            maxLength={LIMITS.postTitle}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="edit-desc" className="text-sm font-bold">Description</label>
          <textarea
            id="edit-desc"
            rows={3}
            value={description}
            maxLength={LIMITS.postDescription}
            onChange={(e) => setDescription(e.target.value)}
            className="input resize-y"
          />
        </div>
        <TagInput
          label="Tags"
          tags={tags}
          onChange={(t) => setTags(normalizeTags(t, LIMITS.postTags))}
          max={LIMITS.postTags}
        />
        {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function PostBody({ id }: { id: string }) {
  const social = useSocial();
  const router = useRouter();
  const client = social.client!;
  const userId = social.userId!;

  const post = useQuery<Post | null>(`post|${id}`, () => getPost(client, id));
  const likes = useQuery<Set<string>>(`like|${id}`, () => likedPostIds(client, [id]));

  const [likeOverride, setLikeOverride] = useState<boolean | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (post.loading) {
    return <div className="panel h-72 animate-pulse bg-surface-2" aria-busy="true" />;
  }
  if (post.error) {
    return <p role="alert" className="panel p-6 font-semibold text-danger">{post.error}</p>;
  }
  const p = post.data;
  if (!p) {
    return (
      <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
        <h2 className="font-display text-2xl font-extrabold">This set isn’t available</h2>
        <p className="max-w-md text-muted">
          It may have been removed, made private, or you don’t have access to it.
        </p>
        <Link href="/community" className="btn btn-primary">Back to the community</Link>
      </div>
    );
  }

  const mine = p.authorId === userId;
  const liked = likeOverride ?? likes.data?.has(p.id) ?? false;
  const likeCount = p.likeCount + (likeOverride === null ? 0 : (likeOverride ? 1 : 0) - (likes.data?.has(p.id) ? 1 : 0));
  const shown = showAll ? p.cards : p.cards.slice(0, PREVIEW);

  async function toggleLike() {
    const next = !liked;
    setLikeOverride(next);
    setError('');
    try {
      await setLike(client, userId, p!.id, next);
    } catch (err) {
      setLikeOverride(!next);
      setError(err instanceof Error ? err.message : 'Could not update your like.');
    }
  }

  function saveToLibrary() {
    const now = Date.now();
    const set: StudySet = {
      id: uid(),
      title: p!.title,
      description: p!.description || undefined,
      source: 'community',
      createdAt: now,
      updatedAt: now,
      cards: p!.cards.map((c) => ({ id: uid(), ...c })),
    };
    if (saveSet(set)) router.push(`/study/${set.id}`);
    else setError('Your browser couldn’t save this set (storage is full or blocked).');
  }

  async function setVisibility(v: Visibility) {
    setBusy(true);
    setError('');
    try {
      await updatePost(client, p!.id, { visibility: v });
      post.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change visibility.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deletePost(client, p!.id);
      router.push('/community');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this post.');
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/community" className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <Icon name="left" size={16} />
        Community
      </Link>

      {p.hidden && (
        <p className="rounded-xl border-2 border-ink bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">
          This post was hidden after being reported by other members. Only you can see it.
        </p>
      )}

      <div className="panel flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words text-3xl font-extrabold tracking-tight sm:text-4xl">{p.title}</h1>
            {p.author && (
              <Link
                href={`/u/${p.author.username}`}
                className="mt-3 inline-flex items-center gap-2 text-sm font-bold hover:text-primary-ink"
              >
                <Avatar person={p.author} size="sm" />
                {nameOf(p.author)}
                <span className="font-semibold text-muted">· {timeAgo(p.createdAt, nowMs())}</span>
              </Link>
            )}
          </div>
          {mine && (
            <span className="chip !bg-surface-2">
              <Icon name={p.visibility === 'private' ? 'lock' : 'sparkles'} size={12} />
              {p.visibility === 'private' ? 'Private' : 'Public'}
            </span>
          )}
        </div>

        {p.description && <p className="whitespace-pre-line text-muted">{p.description}</p>}

        {p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.tags.map((t) => (
              <span key={t} className="chip !border-line text-muted">#{t}</span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveToLibrary} className="btn btn-primary btn-lg">
            <Icon name="download" />
            Save to my library
          </button>
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={liked}
            aria-label={`${liked ? 'Unlike' : 'Like'} (${likeCount})`}
            className={`btn btn-lg ${liked ? 'bg-coral-soft text-danger' : 'btn-secondary'}`}
          >
            <Icon name="heart" filled={liked} />
            {likeCount}
          </button>
          {!mine && (
            <button type="button" onClick={() => setReporting(true)} className="btn btn-ghost">
              Report
            </button>
          )}
        </div>

        {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}

        {mine && (
          <div className="flex flex-wrap items-center gap-2 border-t-2 border-dashed border-line pt-4">
            <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary !py-2">
              <Icon name="edit" size={16} />
              Edit details
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setVisibility(p.visibility === 'public' ? 'private' : 'public')}
              className="btn btn-secondary !py-2"
            >
              <Icon name={p.visibility === 'public' ? 'lock' : 'sparkles'} size={16} />
              Make {p.visibility === 'public' ? 'private' : 'public'}
            </button>
            <button type="button" onClick={() => setConfirmDelete(true)} className="btn btn-danger !py-2">
              <Icon name="trash" size={16} />
              Delete
            </button>
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-3 font-display text-2xl font-extrabold">
          {p.cardCount} card{p.cardCount === 1 ? '' : 's'}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {shown.map((c, i) => (
            <li key={i} className="panel-soft flex flex-col gap-1 p-4">
              <span className="font-bold">{c.term}</span>
              <span className="text-sm text-muted">{c.definition}</span>
            </li>
          ))}
        </ol>
        {p.cards.length > PREVIEW && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="btn btn-secondary mt-4">
            {showAll ? 'Show fewer' : `Show all ${p.cards.length}`}
          </button>
        )}
      </section>

      {reporting && (
        <ReportDialog kind="post" targetId={p.id} subject="this set" onClose={() => setReporting(false)} />
      )}
      {editing && <EditDialog post={p} onClose={() => setEditing(false)} onSaved={post.reload} />}
      {confirmDelete && (
        <Modal title="Delete this post?" onClose={() => setConfirmDelete(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-muted">
              This removes it from the community for good. Copies people have already saved to
              their own libraries stay with them.
            </p>
            <div className="flex gap-3">
              <button type="button" disabled={busy} onClick={remove} className="btn btn-danger">
                {busy ? 'Deleting…' : 'Delete post'}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function PostView() {
  const { id } = useParams<{ id: string }>();
  return (
    <SocialGate>
      <PostBody id={id} />
    </SocialGate>
  );
}
