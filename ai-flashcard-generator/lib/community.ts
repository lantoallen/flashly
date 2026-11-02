import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Conversation,
  Message,
  Person,
  Post,
  PostCard,
  PostSummary,
  Profile,
  PublicProfile,
  Visibility,
} from './social';

/**
 * Everything the community UI needs from the database, in one place.
 * Every function takes the Supabase client, so the same code runs against the
 * real service or the in-browser development stand-in.
 */

// ---- Errors -----------------------------------------------------------------

export class CommunityError extends Error {
  /** True when the community tables have not been created yet. */
  notSetUp: boolean;
  constructor(message: string, notSetUp = false) {
    super(message);
    this.notSetUp = notSetUp;
  }
}

type DbError = { message?: string; code?: string; details?: string } | null;

function fail(error: DbError, fallback: string): never {
  const msg = error?.message ?? '';
  // Postgres "undefined_table" / PostgREST "table not in schema cache".
  if (error?.code === '42P01' || error?.code === 'PGRST205' || /schema cache|does not exist/i.test(msg)) {
    throw new CommunityError(
      'The community isn’t set up on this server yet. Run supabase/community.sql in Supabase.',
      true
    );
  }
  if (error?.code === '23505') throw new CommunityError('That is already taken.');
  if (/too quickly/i.test(msg)) throw new CommunityError('You’re sending messages too quickly. Please wait a moment.');
  if (/at least 13/i.test(msg)) throw new CommunityError('You need to be at least 13 to use the community.');
  if (error?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    throw new CommunityError('You can’t do that. The other person may have blocked you or turned messages off.');
  }
  throw new CommunityError(fallback);
}

// ---- Row mapping ------------------------------------------------------------

type Row = Record<string, unknown>;

const PUBLIC_COLS = 'id,username,display_name,avatar,avatar_color';
const PROFILE_COLS = `${PUBLIC_COLS},bio,interests,accent,dm_policy,discoverable,created_at`;

function toPublic(r: Row): PublicProfile {
  return {
    id: String(r.id),
    username: String(r.username),
    displayName: String(r.display_name ?? ''),
    avatar: (r.avatar as string | null) ?? null,
    avatarColor: String(r.avatar_color ?? 'violet'),
  };
}

function toProfile(r: Row): Profile {
  return {
    ...toPublic(r),
    bio: String(r.bio ?? ''),
    interests: (r.interests as string[] | null) ?? [],
    accent: (r.accent as string | null) ?? null,
    dmPolicy: r.dm_policy === 'nobody' ? 'nobody' : 'everyone',
    discoverable: r.discoverable !== false,
    createdAt: String(r.created_at ?? ''),
  };
}

function toPerson(r: Row): Person {
  return { ...toProfile(r), shared: Number(r.shared ?? 0) };
}

function toSummary(r: Row): PostSummary {
  const author = r.author as Row | Row[] | null | undefined;
  const a = Array.isArray(author) ? author[0] : author;
  return {
    id: String(r.id),
    authorId: String(r.author_id),
    author: a ? toPublic(a) : null,
    title: String(r.title),
    description: String(r.description ?? ''),
    tags: (r.tags as string[] | null) ?? [],
    cardCount: Number(r.card_count ?? 0),
    visibility: r.visibility === 'private' ? 'private' : 'public',
    likeCount: Number(r.like_count ?? 0),
    hidden: r.hidden === true,
    createdAt: String(r.created_at),
  };
}

/** Map a raw `messages` row (e.g. from a realtime payload) to a Message. */
export function toMessage(r: Row): Message {
  return {
    id: Number(r.id),
    senderId: String(r.sender_id),
    recipientId: String(r.recipient_id),
    body: String(r.body),
    createdAt: String(r.created_at),
    readAt: (r.read_at as string | null) ?? null,
  };
}

/** Make free text safe to put inside a PostgREST `or(...)` filter. */
function filterText(text: string): string {
  return text.replace(/[,()%*\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// ---- Profiles ---------------------------------------------------------------

export async function fetchProfile(sb: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await sb.from('profiles').select(PROFILE_COLS).eq('id', userId).maybeSingle();
  if (error) fail(error, 'Could not load your profile.');
  return data ? toProfile(data as Row) : null;
}

export async function fetchProfileByUsername(
  sb: SupabaseClient,
  username: string
): Promise<Profile | null> {
  const { data, error } = await sb
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('username', username.toLowerCase())
    .maybeSingle();
  if (error) fail(error, 'Could not load that profile.');
  return data ? toProfile(data as Row) : null;
}

/** Create the profile if the sign-up trigger did not (older accounts, or a trigger failure). */
export async function ensureProfile(
  sb: SupabaseClient,
  userId: string,
  email: string,
  displayName: string
): Promise<Profile> {
  const existing = await fetchProfile(sb, userId);
  if (existing) return existing;

  const base =
    email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 14) || 'learner';
  const stem = base.length >= 3 ? base : 'learner';

  for (let attempt = 0; attempt < 6; attempt++) {
    const username = attempt === 0 ? stem : `${stem}${Math.floor(1000 + Math.random() * 9000)}`;
    const { error } = await sb.from('profiles').insert({
      id: userId,
      username,
      display_name: displayName.slice(0, 40),
    });
    if (!error) break;
    if (error.code === '23505') {
      // Either the username is taken (try another) or the profile now exists.
      const again = await fetchProfile(sb, userId);
      if (again) return again;
      continue;
    }
    fail(error, 'Could not create your profile.');
  }
  const created = await fetchProfile(sb, userId);
  if (!created) throw new CommunityError('Could not create your profile.');
  return created;
}

export type ProfilePatch = Partial<{
  username: string;
  displayName: string;
  bio: string;
  avatar: string | null;
  avatarColor: string;
  interests: string[];
  accent: string | null;
  dmPolicy: 'everyone' | 'nobody';
  discoverable: boolean;
}>;

export async function updateProfile(
  sb: SupabaseClient,
  userId: string,
  patch: ProfilePatch
): Promise<Profile> {
  const row: Row = {};
  if (patch.username !== undefined) row.username = patch.username;
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.bio !== undefined) row.bio = patch.bio;
  if (patch.avatar !== undefined) row.avatar = patch.avatar;
  if (patch.avatarColor !== undefined) row.avatar_color = patch.avatarColor;
  if (patch.interests !== undefined) row.interests = patch.interests;
  if (patch.accent !== undefined) row.accent = patch.accent;
  if (patch.dmPolicy !== undefined) row.dm_policy = patch.dmPolicy;
  if (patch.discoverable !== undefined) row.discoverable = patch.discoverable;

  const { data, error } = await sb
    .from('profiles')
    .update(row)
    .eq('id', userId)
    .select(PROFILE_COLS)
    .single();
  if (error) {
    if (error.code === '23505') throw new CommunityError('That username is already taken.');
    fail(error, 'Could not save your profile.');
  }
  return toProfile(data as Row);
}

export async function isUsernameFree(
  sb: SupabaseClient,
  username: string,
  exceptUserId: string
): Promise<boolean> {
  const { data, error } = await sb.from('profiles').select('id').eq('username', username).maybeSingle();
  if (error) fail(error, 'Could not check that username.');
  return !data || (data as Row).id === exceptUserId;
}

export async function fetchBirthday(sb: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await sb
    .from('profile_private')
    .select('birthday')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail(error, 'Could not load your birthday.');
  return ((data as Row | null)?.birthday as string | null) ?? '';
}

export async function saveBirthday(
  sb: SupabaseClient,
  userId: string,
  birthday: string
): Promise<void> {
  const { error } = await sb
    .from('profile_private')
    .upsert({ user_id: userId, birthday: birthday || null }, { onConflict: 'user_id' });
  if (error) fail(error, 'Could not save your birthday.');
}

// ---- People -----------------------------------------------------------------

export async function suggestPeople(sb: SupabaseClient, max = 12): Promise<Person[]> {
  const { data, error } = await sb.rpc('suggest_people', { max_results: max });
  if (error) fail(error, 'Could not load suggestions.');
  return ((data as Row[] | null) ?? []).map(toPerson);
}

export async function searchPeople(sb: SupabaseClient, term: string, max = 24): Promise<Person[]> {
  const clean = filterText(term);
  if (!clean) return [];
  const { data, error } = await sb.rpc('search_people', { term: clean, max_results: max });
  if (error) fail(error, 'Could not search people.');
  return ((data as Row[] | null) ?? []).map(toPerson);
}

// ---- Posts ------------------------------------------------------------------

const SUMMARY_COLS = `id,author_id,title,description,tags,card_count,visibility,like_count,hidden,created_at,author:profiles(${PUBLIC_COLS})`;

export type FeedOptions = {
  search?: string;
  tag?: string;
  sort?: 'new' | 'popular';
  limit?: number;
  offset?: number;
};

export async function listFeed(sb: SupabaseClient, opts: FeedOptions = {}): Promise<PostSummary[]> {
  const limit = opts.limit ?? 24;
  const offset = opts.offset ?? 0;
  let q = sb.from('posts').select(SUMMARY_COLS).eq('visibility', 'public').eq('hidden', false);

  const text = opts.search ? filterText(opts.search) : '';
  if (text) q = q.or(`title.ilike.%${text}%,description.ilike.%${text}%`);
  if (opts.tag) q = q.contains('tags', [opts.tag]);

  q =
    opts.sort === 'popular'
      ? q.order('like_count', { ascending: false }).order('created_at', { ascending: false })
      : q.order('created_at', { ascending: false });

  const { data, error } = await q.range(offset, offset + limit - 1);
  if (error) fail(error, 'Could not load the community feed.');
  return ((data as Row[] | null) ?? []).map(toSummary);
}

export async function listPostsBy(
  sb: SupabaseClient,
  authorId: string,
  opts: { includePrivate: boolean }
): Promise<PostSummary[]> {
  let q = sb.from('posts').select(SUMMARY_COLS).eq('author_id', authorId);
  if (!opts.includePrivate) q = q.eq('visibility', 'public').eq('hidden', false);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
  if (error) fail(error, 'Could not load posts.');
  return ((data as Row[] | null) ?? []).map(toSummary);
}

export async function getPost(sb: SupabaseClient, id: string): Promise<Post | null> {
  const { data, error } = await sb
    .from('posts')
    .select(`${SUMMARY_COLS},cards`)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    // A malformed id is simply "not found".
    if (error.code === '22P02') return null;
    fail(error, 'Could not load that post.');
  }
  if (!data) return null;
  return { ...toSummary(data as Row), cards: ((data as Row).cards as PostCard[]) ?? [] };
}

export type PostInput = {
  title: string;
  description: string;
  tags: string[];
  cards: PostCard[];
  visibility: Visibility;
};

export async function createPost(
  sb: SupabaseClient,
  authorId: string,
  input: PostInput
): Promise<string> {
  const { data, error } = await sb
    .from('posts')
    .insert({
      author_id: authorId,
      title: input.title,
      description: input.description,
      tags: input.tags,
      cards: input.cards,
      visibility: input.visibility,
    })
    .select('id')
    .single();
  if (error) fail(error, 'Could not publish your set.');
  return String((data as Row).id);
}

export async function updatePost(
  sb: SupabaseClient,
  id: string,
  patch: Partial<Pick<PostInput, 'title' | 'description' | 'tags' | 'visibility'>>
): Promise<void> {
  const { error } = await sb.from('posts').update(patch).eq('id', id);
  if (error) fail(error, 'Could not update that post.');
}

export async function deletePost(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('posts').delete().eq('id', id);
  if (error) fail(error, 'Could not delete that post.');
}

export async function likedPostIds(sb: SupabaseClient, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data, error } = await sb.from('post_likes').select('post_id').in('post_id', postIds);
  if (error) return new Set(); // likes are a nicety; never block the page on them
  return new Set(((data as Row[] | null) ?? []).map((r) => String(r.post_id)));
}

export async function setLike(
  sb: SupabaseClient,
  userId: string,
  postId: string,
  liked: boolean
): Promise<void> {
  const { error } = liked
    ? await sb.from('post_likes').insert({ post_id: postId, user_id: userId })
    : await sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
  // Liking twice is harmless.
  if (error && error.code !== '23505') fail(error, 'Could not update your like.');
}

/** Most-used tags among public posts, for the filter chips. */
export async function popularTags(sb: SupabaseClient): Promise<string[]> {
  const { data, error } = await sb
    .from('posts')
    .select('tags')
    .eq('visibility', 'public')
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return [];
  const counts = new Map<string, number>();
  for (const r of (data as Row[] | null) ?? []) {
    for (const t of (r.tags as string[] | null) ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t]) => t);
}

// ---- Safety -----------------------------------------------------------------

export async function report(
  sb: SupabaseClient,
  reporterId: string,
  kind: 'post' | 'user' | 'message',
  targetId: string,
  reason: string
): Promise<void> {
  const { error } = await sb
    .from('reports')
    .insert({ reporter_id: reporterId, kind, target_id: targetId, reason: reason.slice(0, 500) });
  // Reporting the same thing twice is fine from the reporter's point of view.
  if (error && error.code !== '23505') fail(error, 'Could not send your report.');
  // Let the site owner know straight away (the daily cron catches any misses).
  if (!error) void fetch('/api/report-alert', { method: 'POST' }).catch(() => {});
}

export async function blockUser(sb: SupabaseClient, blockerId: string, blockedId: string): Promise<void> {
  const { error } = await sb.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error && error.code !== '23505') fail(error, 'Could not block that person.');
}

export async function unblockUser(sb: SupabaseClient, blockerId: string, blockedId: string): Promise<void> {
  const { error } = await sb.from('blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  if (error) fail(error, 'Could not unblock that person.');
}

export async function listBlocked(sb: SupabaseClient, blockerId: string): Promise<PublicProfile[]> {
  const { data: blocks, error } = await sb.from('blocks').select('blocked_id').eq('blocker_id', blockerId);
  if (error) fail(error, 'Could not load your blocked list.');
  const ids = ((blocks as Row[] | null) ?? []).map((b) => String(b.blocked_id));
  if (ids.length === 0) return [];
  const { data, error: e2 } = await sb.from('profiles').select(PUBLIC_COLS).in('id', ids);
  if (e2) fail(e2, 'Could not load your blocked list.');
  return ((data as Row[] | null) ?? []).map(toPublic);
}

export async function isBlockedByMe(
  sb: SupabaseClient,
  blockerId: string,
  otherId: string
): Promise<boolean> {
  const { data } = await sb
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', otherId)
    .maybeSingle();
  return Boolean(data);
}

// ---- Messages ---------------------------------------------------------------

export async function sendMessage(
  sb: SupabaseClient,
  senderId: string,
  recipientId: string,
  body: string
): Promise<Message> {
  const { data, error } = await sb
    .from('messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, body: body.trim() })
    .select('id,sender_id,recipient_id,body,created_at,read_at')
    .single();
  if (error) fail(error, 'Could not send your message.');
  return toMessage(data as Row);
}

export async function listThread(
  sb: SupabaseClient,
  me: string,
  partnerId: string,
  limit = 100
): Promise<Message[]> {
  const { data, error } = await sb
    .from('messages')
    .select('id,sender_id,recipient_id,body,created_at,read_at')
    .or(
      `and(sender_id.eq.${me},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${me})`
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) fail(error, 'Could not load the conversation.');
  return ((data as Row[] | null) ?? []).map(toMessage).reverse();
}

export async function listConversations(sb: SupabaseClient): Promise<Conversation[]> {
  const { data, error } = await sb.rpc('my_conversations');
  if (error) fail(error, 'Could not load your messages.');
  const rows = (data as Row[] | null) ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => String(r.partner_id));
  const { data: profs, error: e2 } = await sb.from('profiles').select(PUBLIC_COLS).in('id', ids);
  if (e2) fail(e2, 'Could not load your messages.');
  const byId = new Map(((profs as Row[] | null) ?? []).map((p) => [String(p.id), toPublic(p)]));

  const out: Conversation[] = [];
  for (const r of rows) {
    const partner = byId.get(String(r.partner_id));
    if (!partner) continue;
    out.push({
      partner,
      lastBody: String(r.last_body),
      lastAt: String(r.last_at),
      lastFromMe: r.last_from_me === true,
      unread: Number(r.unread ?? 0),
    });
  }
  return out;
}

export async function markRead(sb: SupabaseClient, partnerId: string): Promise<void> {
  await sb.rpc('mark_conversation_read', { partner: partnerId });
}

export async function unreadTotal(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb.rpc('unread_total');
  if (error) return 0;
  return Number(data ?? 0);
}
