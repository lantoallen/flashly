-- Flashly community: profiles, shared sets, likes, messages, blocks and reports.
--
-- Run this once in Supabase (SQL Editor -> New query -> paste -> Run), AFTER
-- supabase/schema.sql. It is safe to run again: everything is idempotent.
--
-- Security model
--   * Row Level Security is on for every table. The browser only ever holds the
--     public "anon" key, so these policies are the real protection.
--   * Birthdays live in a separate table that only their owner can read.
--   * Messages can only be read by the two people in the conversation, and the
--     database itself refuses messages from or to a blocked user.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A list of short lowercase tags (interests, post tags).
create or replace function public.valid_tags(tags text[])
returns boolean
language sql
immutable
as $$
  select coalesce(
    bool_and(t is not null and t ~ '^[a-z0-9][a-z0-9 +#&._-]*$' and char_length(t) <= 24),
    true
  )
  from unnest(tags) as t
$$;

-- ---------------------------------------------------------------------------
-- Profiles (public within the app) and private profile details
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null,
  display_name text not null default '',
  bio          text not null default '',
  -- Small square image stored inline as a data URL (the app resizes it to ~160px).
  avatar       text,
  avatar_color text not null default 'violet',
  interests    text[] not null default '{}',
  accent       text,
  -- Direct messages are opt-in: new accounts can't be messaged until they choose to.
  dm_policy    text not null default 'nobody',
  discoverable boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_username_key unique (username),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (char_length(display_name) <= 40),
  constraint profiles_bio_len check (char_length(bio) <= 280),
  constraint profiles_avatar_ok check (
    avatar is null or (avatar like 'data:image/%' and char_length(avatar) <= 60000)
  ),
  constraint profiles_interests_ok check (
    cardinality(interests) <= 10 and public.valid_tags(interests)
  ),
  constraint profiles_dm_policy_ok check (dm_policy in ('everyone', 'nobody')),
  constraint profiles_accent_ok check (
    accent is null or accent ~ '^(#[0-9a-fA-F]{6}|[a-z]{3,12})$'
  )
);

create table if not exists public.profile_private (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  birthday   date,
  updated_at timestamptz not null default now(),
  constraint profile_private_birthday_range check (
    birthday is null or birthday >= date '1900-01-01'
  )
);

-- Refuse birthdays that are in the future or make someone younger than 13.
create or replace function public.check_birthday()
returns trigger
language plpgsql
as $$
begin
  if new.birthday is not null then
    if new.birthday > current_date then
      raise exception 'Birthday cannot be in the future';
    end if;
    if new.birthday > (current_date - interval '13 years')::date then
      raise exception 'You must be at least 13 to use the community';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profile_private_check on public.profile_private;
create trigger profile_private_check
  before insert or update on public.profile_private
  for each row execute function public.check_birthday();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Databases created with the old default ('everyone') get the safer default for new accounts.
alter table public.profiles alter column dm_policy set default 'nobody';

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;

drop policy if exists "Signed-in users can read profiles" on public.profiles;
drop policy if exists "Users create their own profile"    on public.profiles;
drop policy if exists "Users update their own profile"    on public.profiles;
drop policy if exists "Users delete their own profile"    on public.profiles;

create policy "Signed-in users can read profiles"
  on public.profiles for select to authenticated using (true);
create policy "Users create their own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users delete their own profile"
  on public.profiles for delete to authenticated using (auth.uid() = id);

drop policy if exists "Own private profile: read"   on public.profile_private;
drop policy if exists "Own private profile: insert" on public.profile_private;
drop policy if exists "Own private profile: update" on public.profile_private;
drop policy if exists "Own private profile: delete" on public.profile_private;

create policy "Own private profile: read"
  on public.profile_private for select to authenticated using (auth.uid() = user_id);
create policy "Own private profile: insert"
  on public.profile_private for insert to authenticated with check (auth.uid() = user_id);
create policy "Own private profile: update"
  on public.profile_private for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own private profile: delete"
  on public.profile_private for delete to authenticated using (auth.uid() = user_id);

-- Every new account gets a profile with a generated username. This must never
-- block sign-up, so any failure is swallowed (the app creates one on demand).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  tries int := 0;
begin
  base := regexp_replace(lower(split_part(coalesce(new.email, ''), '@', 1)), '[^a-z0-9_]', '', 'g');
  if char_length(base) < 3 then
    base := 'learner';
  end if;
  base := left(base, 14);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) and tries < 25 loop
    tries := tries + 1;
    candidate := base || (floor(random() * 9000) + 1000)::int::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40))
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for accounts that existed before the community was added.
insert into public.profiles (id, username, display_name)
select u.id,
       'learner' || substr(md5(u.id::text), 1, 8),
       left(coalesce(u.raw_user_meta_data ->> 'display_name', ''), 40)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Blocks and reports
-- ---------------------------------------------------------------------------

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

drop policy if exists "Users see their own blocks"  on public.blocks;
drop policy if exists "Users create their own blocks" on public.blocks;
drop policy if exists "Users remove their own blocks" on public.blocks;

create policy "Users see their own blocks"
  on public.blocks for select to authenticated using (auth.uid() = blocker_id);
create policy "Users create their own blocks"
  on public.blocks for insert to authenticated with check (auth.uid() = blocker_id);
create policy "Users remove their own blocks"
  on public.blocks for delete to authenticated using (auth.uid() = blocker_id);

-- True if either person has blocked the other.
create or replace function public.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  kind        text not null,
  target_id   text not null,
  reason      text not null default '',
  created_at  timestamptz not null default now(),
  constraint reports_kind_ok check (kind in ('post', 'user', 'message')),
  constraint reports_reason_len check (char_length(reason) <= 500),
  constraint reports_once unique (reporter_id, kind, target_id)
);

-- When the site owner was emailed about this report (set by the server with
-- the service key, see /api/report-alert; members can't see or set it).
alter table public.reports add column if not exists alerted_at timestamptz;
create index if not exists reports_unalerted_idx on public.reports (created_at)
  where alerted_at is null;

alter table public.reports enable row level security;

-- Members can file a report, nothing more.
revoke insert, update on public.reports from anon, authenticated;
grant insert (reporter_id, kind, target_id, reason) on public.reports to authenticated;

drop policy if exists "Users can file reports" on public.reports;
-- There is deliberately no select policy: reports are for moderators, who read
-- them in the Supabase dashboard (Table Editor -> reports).
create policy "Users can file reports"
  on public.reports for insert to authenticated with check (auth.uid() = reporter_id);

-- ---------------------------------------------------------------------------
-- Community posts (shared study sets)
-- ---------------------------------------------------------------------------

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  -- References profiles (which in turn cascade from auth.users) so feeds can
  -- join each post to its author's profile in one query.
  author_id   uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  description text not null default '',
  tags        text[] not null default '{}',
  cards       jsonb not null,
  card_count  int not null default 0,
  visibility  text not null default 'public',
  like_count  int not null default 0,
  -- Set automatically when several people report a post; owner still sees it.
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint posts_title_len check (char_length(title) between 1 and 100),
  constraint posts_description_len check (char_length(description) <= 500),
  constraint posts_tags_ok check (cardinality(tags) <= 8 and public.valid_tags(tags)),
  constraint posts_cards_ok check (
    case when jsonb_typeof(cards) = 'array'
      then jsonb_array_length(cards) between 1 and 300 and octet_length(cards::text) <= 400000
      else false
    end
  ),
  constraint posts_visibility_ok check (visibility in ('public', 'private'))
);

create index if not exists posts_feed_idx on public.posts (visibility, hidden, created_at desc);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_tags_idx on public.posts using gin (tags);

create or replace function public.prepare_post()
returns trigger
language plpgsql
as $$
begin
  if jsonb_typeof(new.cards) = 'array' then
    new.card_count := jsonb_array_length(new.cards);
  else
    new.card_count := 0;
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.like_count := 0;
    new.hidden := false;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_prepare on public.posts;
create trigger posts_prepare
  before insert or update on public.posts
  for each row execute function public.prepare_post();

-- Users may only write the content columns. Counters and the moderation flag
-- are changed by trusted database functions, never by the browser.
revoke insert, update on public.posts from anon, authenticated;
grant insert (author_id, title, description, tags, cards, visibility)
  on public.posts to authenticated;
grant update (title, description, tags, cards, visibility)
  on public.posts to authenticated;

alter table public.posts enable row level security;

drop policy if exists "Read public posts and your own" on public.posts;
drop policy if exists "Authors create posts"            on public.posts;
drop policy if exists "Authors update their posts"      on public.posts;
drop policy if exists "Authors delete their posts"      on public.posts;

create policy "Read public posts and your own"
  on public.posts for select to authenticated
  using (
    author_id = auth.uid()
    or (visibility = 'public' and not hidden and not public.blocked_between(auth.uid(), author_id))
  );
create policy "Authors create posts"
  on public.posts for insert to authenticated with check (author_id = auth.uid());
create policy "Authors update their posts"
  on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "Authors delete their posts"
  on public.posts for delete to authenticated using (author_id = auth.uid());

-- Likes ---------------------------------------------------------------------

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;

drop policy if exists "Users see their own likes"  on public.post_likes;
drop policy if exists "Users like posts"           on public.post_likes;
drop policy if exists "Users remove their likes"   on public.post_likes;

create policy "Users see their own likes"
  on public.post_likes for select to authenticated using (user_id = auth.uid());
-- You can only like a post you are allowed to see.
create policy "Users like posts"
  on public.post_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id)
  );
create policy "Users remove their likes"
  on public.post_likes for delete to authenticated using (user_id = auth.uid());

create or replace function public.sync_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count
  after insert or delete on public.post_likes
  for each row execute function public.sync_like_count();

-- Hide a post automatically once three different people have reported it.
create or replace function public.auto_hide_reported()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'post'
     and (select count(distinct reporter_id) from public.reports
          where kind = 'post' and target_id = new.target_id) >= 3 then
    update public.posts set hidden = true where id::text = new.target_id;
  end if;
  return null;
end;
$$;

drop trigger if exists reports_auto_hide on public.reports;
create trigger reports_auto_hide
  after insert on public.reports
  for each row execute function public.auto_hide_reported();

-- ---------------------------------------------------------------------------
-- Direct messages
-- ---------------------------------------------------------------------------

create table if not exists public.messages (
  id           bigint generated always as identity primary key,
  sender_id    uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  body         text not null,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint messages_body_len check (char_length(body) between 1 and 1000),
  constraint messages_not_self check (sender_id <> recipient_id)
);

create index if not exists messages_recipient_idx on public.messages (recipient_id, created_at desc);
create index if not exists messages_pair_idx on public.messages (sender_id, recipient_id, created_at desc);

-- Can the signed-in user message this person right now?
create or replace function public.can_message(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and target <> auth.uid()
     and exists (select 1 from public.profiles p where p.id = target and p.dm_policy = 'everyone')
     and not public.blocked_between(auth.uid(), target)
$$;

-- At most 20 messages per minute per sender.
create or replace function public.limit_message_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.messages
      where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'You are sending messages too quickly. Please wait a moment.';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_rate on public.messages;
create trigger messages_rate
  before insert on public.messages
  for each row execute function public.limit_message_rate();

-- Senders choose only who and what; timestamps and read receipts are not theirs.
revoke insert, update, delete on public.messages from anon, authenticated;
grant insert (sender_id, recipient_id, body) on public.messages to authenticated;

alter table public.messages enable row level security;

drop policy if exists "Read your own conversations" on public.messages;
drop policy if exists "Send messages"               on public.messages;

create policy "Read your own conversations"
  on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy "Send messages"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_message(recipient_id));
-- No update or delete policies: read receipts go through mark_conversation_read().

create or replace function public.mark_conversation_read(partner uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages
  set read_at = now()
  where recipient_id = auth.uid() and sender_id = partner and read_at is null
$$;

create or replace function public.unread_total()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.messages m
  where m.recipient_id = auth.uid()
    and m.read_at is null
    and not public.blocked_between(auth.uid(), m.sender_id)
$$;

-- One row per conversation partner: latest message and unread count.
create or replace function public.my_conversations()
returns table (
  partner_id   uuid,
  last_body    text,
  last_at      timestamptz,
  last_from_me boolean,
  unread       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select m.*,
           case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as partner
    from public.messages m
    where m.sender_id = auth.uid() or m.recipient_id = auth.uid()
  ),
  latest as (
    select distinct on (partner) partner, body, created_at, sender_id = auth.uid() as from_me
    from mine
    order by partner, created_at desc, id desc
  )
  select l.partner, l.body, l.created_at, l.from_me,
         (select count(*) from mine x
          where x.partner = l.partner and x.recipient_id = auth.uid() and x.read_at is null)
  from latest l
  where not public.blocked_between(auth.uid(), l.partner)
  order by l.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Finding people
-- ---------------------------------------------------------------------------

-- People ranked by how many interests they share with you.
create or replace function public.suggest_people(max_results int default 12)
returns table (
  id uuid, username text, display_name text, bio text, avatar text,
  avatar_color text, interests text[], shared int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.bio, p.avatar, p.avatar_color, p.interests,
         (select count(*)::int from unnest(p.interests) i
          where i = any (coalesce((select interests from public.profiles where id = auth.uid()), '{}'::text[]))) as shared
  from public.profiles p
  where p.id <> auth.uid()
    and p.discoverable
    and not public.blocked_between(auth.uid(), p.id)
  order by shared desc, p.created_at desc
  limit greatest(1, least(max_results, 50))
$$;

-- Search by username, display name or an interest.
create or replace function public.search_people(term text, max_results int default 24)
returns table (
  id uuid, username text, display_name text, bio text, avatar text,
  avatar_color text, interests text[], shared int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.bio, p.avatar, p.avatar_color, p.interests,
         (select count(*)::int from unnest(p.interests) i
          where i = any (coalesce((select interests from public.profiles where id = auth.uid()), '{}'::text[]))) as shared
  from public.profiles p
  where p.id <> auth.uid()
    and p.discoverable
    and not public.blocked_between(auth.uid(), p.id)
    and char_length(btrim(replace(term, '%', ''))) > 0
    and (
      p.username ilike '%' || replace(replace(replace(term, '\', '\\'), '%', ''), '_', '\_') || '%'
      or p.display_name ilike '%' || replace(replace(replace(term, '\', '\\'), '%', ''), '_', '\_') || '%'
      or lower(term) = any (p.interests)
    )
  order by shared desc, p.username
  limit greatest(1, least(max_results, 50))
$$;

-- ---------------------------------------------------------------------------
-- Realtime: push new messages to open conversations (optional).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
