import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Run with: npm run test:sql
// Loads supabase/schema.sql and supabase/community.sql into an in-process
// Postgres (PGlite) with a stand-in auth schema, then checks the security rules.
const ROOT = fileURLToPath(new URL('../supabase', import.meta.url));
const db = new PGlite();

let passed = 0;
let failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok   ', name); }
  else { failed++; console.log('  FAIL ', name); }
}
async function rejects(promise, name, match) {
  try { await promise; failed++; console.log('  FAIL ', name, '(expected an error)'); }
  catch (e) {
    const good = !match || String(e.message).toLowerCase().includes(match.toLowerCase());
    if (good) { passed++; console.log('  ok   ', name); }
    else { failed++; console.log('  FAIL ', name, '- wrong error:', e.message); }
  }
}

// ---- Minimal stand-in for Supabase's auth schema and roles ------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);

// An account that predates the community, to test the backfill.
await db.exec(`insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'old.timer@example.com');`);

// ---- Load the project's SQL (twice, to prove it is idempotent) ---------------
const schema = readFileSync(`${ROOT}/schema.sql`, 'utf8');
const community = readFileSync(`${ROOT}/community.sql`, 'utf8');
await db.exec(schema);
await db.exec(community);
await db.exec(community);
console.log('SQL loaded twice without errors');

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CARA = '33333333-3333-3333-3333-333333333333';

const as = async (uid, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const q = (sql, params) => db.query(sql, params).then((r) => r.rows);

console.log('\nAccounts and profiles');
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${ALICE}', 'alice@example.com', '{"display_name":"Alice"}'),
  ('${BOB}', 'bob@example.com', '{}'),
  ('${CARA}', 'a@example.com', '{}');`);
let profiles = await q(`select id, username, display_name from public.profiles order by username`);
ok(profiles.length === 4, 'every account got a profile (3 new + 1 backfilled)');
ok(profiles.find((p) => p.id === ALICE)?.username === 'alice', 'username generated from email');
ok(profiles.find((p) => p.id === ALICE)?.display_name === 'Alice', 'display name copied from signup');
ok(/^learner[0-9a-f]{8}$/.test(profiles.find((p) => p.id.endsWith('aa'))?.username ?? ''), 'backfilled legacy account');
ok(/^[a-z0-9_]{3,20}$/.test(profiles.find((p) => p.id === CARA)?.username), 'short email still gets a valid username');
const dmDefaults = await q(`select dm_policy from public.profiles where id in ($1, $2, $3)`, [ALICE, BOB, CARA]);
ok(dmDefaults.every((r) => r.dm_policy === 'nobody'), 'new accounts have direct messages off by default');

await as(ALICE, async () => {
  await db.query(`update public.profiles set bio='I love biology', interests=array['biology','chemistry','spanish'], dm_policy='everyone' where id=$1`, [ALICE]);
});
await as(BOB, async () => {
  await db.query(`update public.profiles set interests=array['biology','history'], dm_policy='everyone' where id=$1`, [BOB]);
});
await as(CARA, async () => {
  await db.query(`update public.profiles set interests=array['music'], dm_policy='nobody' where id=$1`, [CARA]);
});

await as(BOB, async () => {
  const rows = await q(`select count(*)::int c from public.profiles`);
  ok(rows[0].c === 4, 'signed-in users can read profiles');
  await rejects(db.query(`update public.profiles set bio='hacked' where id=$1`, [ALICE]).then(async (r) => {
    if (r.affectedRows === 0) throw new Error('no rows updated (blocked by RLS)');
  }), "cannot edit someone else's profile", 'blocked by rls');
  await rejects(db.query(`update public.profiles set username='Has Space' where id=$1`, [BOB]), 'username format enforced', 'check');
  await rejects(db.query(`update public.profiles set interests=array['Bad Tag!'] where id=$1`, [BOB]), 'interest format enforced', 'check');
  await rejects(db.query(`update public.profiles set username='alice' where id=$1`, [BOB]), 'usernames are unique', 'unique');
  await rejects(db.query(`update public.profiles set avatar='javascript:alert(1)' where id=$1`, [BOB]), 'avatar must be an image data URL', 'check');
});

console.log('\nPrivate birthday');
await as(ALICE, async () => {
  await db.query(`insert into public.profile_private (user_id, birthday) values ($1, '2000-05-01')`, [ALICE]);
  const mine = await q(`select birthday::text b from public.profile_private`);
  ok(mine.length === 1 && mine[0].b === '2000-05-01', 'owner can read their birthday');
});
await as(BOB, async () => {
  const others = await q(`select * from public.profile_private`);
  ok(others.length === 0, "nobody else can read someone's birthday");
  await rejects(db.query(`insert into public.profile_private (user_id, birthday) values ($1, current_date - interval '10 years')`, [BOB]), 'under-13 birthday refused', 'at least 13');
  await rejects(db.query(`insert into public.profile_private (user_id, birthday) values ($1, current_date + 5)`, [BOB]), 'future birthday refused', 'future');
  await rejects(db.query(`insert into public.profile_private (user_id, birthday) values ($1, '2001-01-01')`, [ALICE]), "cannot write someone else's birthday", 'row-level security');
});

console.log('\nPosts and likes');
let publicPost, privatePost;
await as(ALICE, async () => {
  const cards = JSON.stringify([{ term: 'Cell', definition: 'Basic unit of life' }, { term: 'DNA', definition: 'Genetic code' }]);
  publicPost = (await q(`insert into public.posts (author_id,title,tags,cards,visibility) values ($1,'Biology basics',array['biology'],$2::jsonb,'public') returning id, card_count, like_count`, [ALICE, cards]))[0];
  privatePost = (await q(`insert into public.posts (author_id,title,cards,visibility) values ($1,'My secret set',$2::jsonb,'private') returning id`, [ALICE, cards]))[0];
  ok(publicPost.card_count === 2, 'card_count is computed by the database');
  await rejects(db.query(`insert into public.posts (author_id,title,cards) values ($1,'x','[]'::jsonb)`, [ALICE]), 'empty sets refused', 'check');
  await rejects(db.query(`insert into public.posts (author_id,title,cards) values ($1,'x','{"a":1}'::jsonb)`, [ALICE]), 'cards must be an array', 'check');
  await rejects(db.query(`insert into public.posts (author_id,title,cards) values ($1,$2,$3::jsonb)`, [BOB, 'impersonation', cards]), 'cannot post as someone else', 'row-level security');
});
await as(BOB, async () => {
  const visible = await q(`select title from public.posts`);
  ok(visible.length === 1 && visible[0].title === 'Biology basics', 'others see public posts but not private ones');
  await db.query(`insert into public.post_likes (post_id, user_id) values ($1,$2)`, [publicPost.id, BOB]);
  const after = await q(`select like_count from public.posts where id=$1`, [publicPost.id]);
  ok(after[0].like_count === 1, 'like count goes up');
  await rejects(db.query(`insert into public.post_likes (post_id, user_id) values ($1,$2)`, [publicPost.id, BOB]), 'cannot like twice', 'duplicate');
  await rejects(db.query(`insert into public.post_likes (post_id, user_id) values ($1,$2)`, [privatePost.id, BOB]), 'cannot like a post you cannot see', 'row-level security');
  const r = await db.query(`update public.posts set title='defaced' where id=$1`, [publicPost.id]);
  ok(r.affectedRows === 0, "cannot edit someone else's post");
  const d = await db.query(`delete from public.posts where id=$1`, [publicPost.id]);
  ok(d.affectedRows === 0, "cannot delete someone else's post");
  await db.query(`delete from public.post_likes where post_id=$1 and user_id=$2`, [publicPost.id, BOB]);
  const unliked = await q(`select like_count from public.posts where id=$1`, [publicPost.id]);
  ok(unliked[0].like_count === 0, 'unliking brings the count back down');
});
await as(ALICE, async () => {
  await rejects(db.query(`update public.posts set like_count=999 where id=$1`, [publicPost.id]), 'authors cannot fake the like counter', 'permission denied');
  await rejects(db.query(`update public.posts set hidden=false where id=$1`, [publicPost.id]), 'authors cannot clear the moderation flag', 'permission denied');
  await rejects(db.query(`update public.posts set author_id=$2 where id=$1`, [publicPost.id, BOB]), 'authors cannot hand a post to someone else', 'permission denied');
  await db.query(`update public.posts set title='Biology basics (edited)' where id=$1`, [publicPost.id]);
  const t = await q(`select title from public.posts where id=$1`, [publicPost.id]);
  ok(t[0].title.endsWith('(edited)'), 'authors can still edit their content');
});

console.log('\nReports and auto-hide');
await db.exec(`insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','d@example.com'),
  ('55555555-5555-5555-5555-555555555555','e@example.com');`);
await as(BOB, async () => {
  await db.query(`insert into public.reports (reporter_id, kind, target_id, reason) values ($1,'post',$2,'spam')`, [BOB, publicPost.id]);
  await rejects(db.query(`insert into public.reports (reporter_id, kind, target_id) values ($1,'post',$2)`, [BOB, publicPost.id]), 'one report per person per target', 'duplicate');
  const rows = await q(`select * from public.reports`).catch((e) => e);
  ok(rows instanceof Error || rows.length === 0, 'reports cannot be read back by users');
});
await as('44444444-4444-4444-4444-444444444444', async () => {
  await db.query(`insert into public.reports (reporter_id, kind, target_id) values ($1,'post',$2)`, ['44444444-4444-4444-4444-444444444444', publicPost.id]);
});
let stillVisible = await as(CARA, () => q(`select id from public.posts where id=$1`, [publicPost.id]));
ok(stillVisible.length === 1, 'post stays visible with 2 reports');
await as('55555555-5555-5555-5555-555555555555', async () => {
  await db.query(`insert into public.reports (reporter_id, kind, target_id) values ($1,'post',$2)`, ['55555555-5555-5555-5555-555555555555', publicPost.id]);
});
stillVisible = await as(CARA, () => q(`select id from public.posts where id=$1`, [publicPost.id]));
ok(stillVisible.length === 0, 'post is hidden from others after 3 reporters');
stillVisible = await as(ALICE, () => q(`select id from public.posts where id=$1`, [publicPost.id]));
ok(stillVisible.length === 1, 'the author can still see their hidden post');

console.log('\nMessaging');
await as(BOB, async () => {
  await db.query(`insert into public.messages (sender_id, recipient_id, body) values ($1,$2,'Hi Alice!')`, [BOB, ALICE]);
  await rejects(db.query(`insert into public.messages (sender_id, recipient_id, body) values ($1,$2,'impersonating')`, [ALICE, BOB]), 'cannot send as someone else', 'row-level security');
  await rejects(db.query(`insert into public.messages (sender_id, recipient_id, body, read_at) values ($1,$2,'sneaky', now())`, [BOB, ALICE]), 'senders cannot pre-set read receipts', 'permission denied');
  await rejects(db.query(`insert into public.messages (sender_id, recipient_id, body) values ($1,$2,'hello')`, [BOB, CARA]), 'cannot message someone who turned DMs off', 'row-level security');
  await rejects(db.query(`insert into public.messages (sender_id, recipient_id, body) values ($1,$2,'')`, [BOB, ALICE]), 'empty messages refused', 'check');
  await rejects(db.query(`insert into public.messages (sender_id, recipient_id, body) values ($1,$2,$3)`, [BOB, ALICE, 'x'.repeat(1001)]), 'messages over 1000 characters refused', 'check');
});
await as(ALICE, async () => {
  const unread = await q(`select public.unread_total() n`);
  ok(Number(unread[0].n) === 1, 'recipient sees 1 unread');
  const convos = await q(`select partner_id, last_body, unread from public.my_conversations()`);
  ok(convos.length === 1 && convos[0].partner_id === BOB && Number(convos[0].unread) === 1, 'conversation list shows partner and unread count');
  await db.query(`select public.mark_conversation_read($1)`, [BOB]);
  const after = await q(`select public.unread_total() n`);
  ok(Number(after[0].n) === 0, 'marking read clears the badge');
  await db.query(`insert into public.messages (sender_id, recipient_id, body) values ($1,$2,'Hi Bob!')`, [ALICE, BOB]);
});
await as(CARA, async () => {
  const seen = await q(`select * from public.messages`);
  ok(seen.length === 0, 'a third person cannot read the conversation');
  const upd = await db.query(`update public.messages set body='tampered'`).catch(() => ({ affectedRows: 0 }));
  ok(upd.affectedRows === 0, 'messages cannot be edited');
});

console.log('\nBlocking');
await as(ALICE, async () => {
  await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1,$2)`, [ALICE, BOB]);
});
await as(BOB, async () => {
  await rejects(db.query(`insert into public.messages (sender_id, recipient_id, body) values ($1,$2,'still there?')`, [BOB, ALICE]), 'a blocked user cannot message the blocker', 'row-level security');
  const posts = await q(`select id from public.posts where author_id=$1`, [ALICE]);
  ok(posts.length === 0, "a blocked user no longer sees the blocker's posts");
  const people = await q(`select username from public.suggest_people(20)`);
  ok(!people.some((p) => p.username === 'alice'), 'blocker disappears from suggestions');
  const convos = await q(`select * from public.my_conversations()`);
  ok(convos.length === 0, 'blocked conversation is hidden');
});
await as(ALICE, async () => {
  await rejects(db.query(`insert into public.messages (sender_id, recipient_id, body) values ($1,$2,'hello')`, [ALICE, BOB]), 'the blocker cannot message the blocked user either', 'row-level security');
  await db.query(`delete from public.blocks where blocker_id=$1 and blocked_id=$2`, [ALICE, BOB]);
});

console.log('\nRate limiting');
await as(BOB, async () => {
  let sent = 0, stopped = false;
  for (let i = 0; i < 25; i++) {
    try { await db.query(`insert into public.messages (sender_id, recipient_id, body) values ($1,$2,$3)`, [BOB, ALICE, `spam ${i}`]); sent++; }
    catch (e) { stopped = String(e.message).includes('too quickly'); break; }
  }
  ok(stopped && sent < 25, `message flood stopped after ${sent} messages`);
});

console.log('\nFinding people');
await db.exec(`reset role`);
await as(BOB, async () => {
  const sugg = await q(`select username, shared from public.suggest_people(10)`);
  ok(sugg[0]?.username === 'alice' && sugg[0].shared === 1, 'people with shared interests rank first');
  ok(!sugg.some((p) => p.username === 'bob'), 'you are not suggested to yourself');
  const found = await q(`select username from public.search_people('ali')`);
  ok(found.some((p) => p.username === 'alice'), 'search by username');
  const byInterest = await q(`select username from public.search_people('chemistry')`);
  ok(byInterest.some((p) => p.username === 'alice'), 'search by interest');
  const wild = await q(`select username from public.search_people('%')`);
  ok(wild.length === 0, 'wildcard characters are not treated as match-everything');
});
await as(ALICE, async () => {
  await db.query(`update public.profiles set discoverable=false where id=$1`, [ALICE]);
});
await as(BOB, async () => {
  const hidden = await q(`select username from public.suggest_people(20)`);
  ok(!hidden.some((p) => p.username === 'alice'), 'non-discoverable users are not suggested');
});

console.log('\nCleanup');
await db.exec(`delete from auth.users where id='${ALICE}'`);
const left = await q(`select (select count(*) from public.profiles where id='${ALICE}')::int p, (select count(*) from public.posts where author_id='${ALICE}')::int po, (select count(*) from public.messages where sender_id='${ALICE}' or recipient_id='${ALICE}')::int m`);
ok(left[0].p === 0 && left[0].po === 0 && left[0].m === 0, 'deleting an account removes profile, posts and messages');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
