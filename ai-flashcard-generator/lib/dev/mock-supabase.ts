/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DEVELOPMENT ONLY. A small in-browser stand-in for the parts of Supabase that
 * Flashly uses (auth, tables, RPCs, realtime), so the community UI can be tried
 * without a Supabase project. Data lives in localStorage; each browser tab has
 * its own signed-in user (sessionStorage), so two tabs can chat with each other.
 *
 * Enabled by NEXT_PUBLIC_MOCK_BACKEND=1 and never in a production build.
 * It mirrors the visible rules of supabase/community.sql; the SQL itself is
 * what actually protects real data and is covered by its own tests.
 */

type Row = Record<string, any>;
type Db = { users: Row[]; tables: Record<string, Row[]>; seq: number };

const DB_KEY = 'flashly:mock-db:v1';
const SESSION_KEY = 'flashly:mock-session:v1';
const CHANNEL = 'flashly-mock-realtime';

// ---- Storage ----------------------------------------------------------------

function load(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* fall through to a fresh database */
  }
  const db = seed();
  save(db);
  return db;
}

function save(db: Db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* quota: ignore in dev */
  }
}

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const now = () => new Date().toISOString();

function seed(): Db {
  const people = [
    ['maya', 'Maya', 'Pre-med student who turns everything into flashcards.', ['biology', 'chemistry', 'anatomy'], 'mint'],
    ['leo', 'Leo', 'Learning Spanish and French. Always up for a language swap.', ['spanish', 'french', 'languages'], 'coral'],
    ['nora', 'Nora', 'Piano, theory and a little too much jazz.', ['music', 'piano', 'history'], 'sun'],
    ['sam', 'Sam', 'Self-taught developer. Algorithms are my cardio.', ['javascript', 'python', 'algorithms'], 'sky'],
  ] as const;

  const db: Db = {
    users: [],
    seq: 1,
    tables: {
      profiles: [], profile_private: [], posts: [], post_likes: [], blocks: [],
      reports: [], messages: [], user_data: [],
    },
  };
  const ids: Record<string, string> = {};
  for (const [username, name, bio, interests, color] of people) {
    const id = uuid();
    ids[username] = id;
    db.users.push({ id, email: `${username}@example.com`, password: 'password', meta: { display_name: name }, created_at: now() });
    db.tables.profiles.push({
      id, username, display_name: name, bio, avatar: null, avatar_color: color,
      interests, accent: null, dm_policy: 'everyone', discoverable: true, created_at: now(), updated_at: now(),
    });
  }

  const cards = (pairs: [string, string][]) => pairs.map(([term, definition]) => ({ term, definition }));
  const post = (author: string, title: string, description: string, tags: string[], c: [string, string][], visibility = 'public', likes = 0) =>
    db.tables.posts.push({
      id: uuid(), author_id: ids[author], title, description, tags, cards: cards(c),
      card_count: c.length, visibility, like_count: likes, hidden: false,
      created_at: new Date(Date.now() - Math.random() * 6 * 864e5).toISOString(), updated_at: now(),
    });

  post('maya', 'Cell Biology Basics', 'The organelles you always forget, in plain English.', ['biology', 'cells'], [
    ['Mitochondria', 'Organelle that makes most of the cell’s ATP.'],
    ['Ribosome', 'Builds proteins by reading messenger RNA.'],
    ['Golgi apparatus', 'Sorts, modifies and ships proteins.'],
    ['Lysosome', 'Contains enzymes that break down waste.'],
    ['Nucleus', 'Holds the cell’s DNA and controls its activity.'],
  ], 'public', 7);
  post('maya', 'Organic Chemistry Functional Groups', 'Quick drill for the exam.', ['chemistry'], [
    ['Hydroxyl', '–OH group, found in alcohols.'],
    ['Carbonyl', 'C=O group, found in ketones and aldehydes.'],
    ['Carboxyl', '–COOH group, found in acids.'],
    ['Amino', '–NH2 group, found in amines.'],
  ], 'public', 3);
  post('maya', 'My private exam notes', 'Only I can see this one.', ['biology'], [['ATP', 'Energy currency of the cell.'], ['Enzyme', 'Biological catalyst.']], 'private');
  post('leo', 'Spanish Travel Phrases', 'Survive your next trip.', ['spanish', 'travel'], [
    ['¿Dónde está el baño?', 'Where is the bathroom?'],
    ['La cuenta, por favor', 'The check, please'],
    ['Quisiera un café', 'I would like a coffee'],
    ['¿Cuánto cuesta?', 'How much does it cost?'],
  ], 'public', 12);
  post('nora', 'Music Theory 101', 'Intervals and scales.', ['music', 'theory'], [
    ['Major third', 'Interval spanning four semitones.'],
    ['Perfect fifth', 'Interval spanning seven semitones.'],
    ['Tritone', 'Interval spanning six semitones.'],
  ], 'public', 5);
  post('sam', 'JavaScript Array Methods', 'map, filter, reduce and friends.', ['javascript', 'programming'], [
    ['map', 'Returns a new array with each item transformed.'],
    ['filter', 'Returns a new array with items that pass a test.'],
    ['reduce', 'Folds an array into a single value.'],
    ['some', 'True if any item passes a test.'],
  ], 'public', 9);

  db.tables.messages.push({
    id: db.seq++, sender_id: ids.maya, recipient_id: ids.sam, body: 'Hey! Saw your JS set. Want to swap decks?',
    created_at: now(), read_at: null,
  });
  return db;
}

// ---- Auth -------------------------------------------------------------------

type Listener = (event: string, session: any) => void;
const authListeners = new Set<Listener>();

function currentUserId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function sessionFor(userId: string | null): any {
  if (!userId) return null;
  const u = load().users.find((x) => x.id === userId);
  if (!u) return null;
  return {
    access_token: `mock-${u.id}`,
    refresh_token: 'mock',
    user: { id: u.id, email: u.email, user_metadata: u.meta ?? {}, created_at: u.created_at },
  };
}

function setSession(userId: string | null, event: string) {
  try {
    if (userId) sessionStorage.setItem(SESSION_KEY, userId);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  const s = sessionFor(userId);
  authListeners.forEach((cb) => cb(event, s));
}

function makeProfile(db: Db, user: Row) {
  if (db.tables.profiles.some((p) => p.id === user.id)) return;
  let base = (user.email.split('@')[0] as string).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 14);
  if (base.length < 3) base = 'learner';
  let username = base;
  while (db.tables.profiles.some((p) => p.username === username)) {
    username = base + Math.floor(1000 + Math.random() * 9000);
  }
  db.tables.profiles.push({
    id: user.id, username, display_name: String(user.meta?.display_name ?? '').slice(0, 40), bio: '',
    avatar: null, avatar_color: 'violet', interests: [], accent: null, dm_policy: 'nobody',
    discoverable: true, created_at: now(), updated_at: now(),
  });
}

const auth = {
  async getSession() {
    return { data: { session: sessionFor(currentUserId()) }, error: null };
  },
  onAuthStateChange(cb: Listener) {
    authListeners.add(cb);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const u = load().users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u || u.password !== password) {
      return { data: { session: null }, error: { message: 'Invalid login credentials' } };
    }
    setSession(u.id, 'SIGNED_IN');
    return { data: { session: sessionFor(u.id) }, error: null };
  },
  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Row } }) {
    const db = load();
    if (db.users.some((x) => x.email.toLowerCase() === email.toLowerCase())) {
      return { data: { session: null }, error: { message: 'User already registered' } };
    }
    if (password.length < 6) {
      return { data: { session: null }, error: { message: 'Password should be at least 6 characters.' } };
    }
    const user = { id: uuid(), email, password, meta: options?.data ?? {}, created_at: now() };
    db.users.push(user);
    makeProfile(db, user);
    save(db);
    setSession(user.id, 'SIGNED_IN');
    return { data: { session: sessionFor(user.id) }, error: null };
  },
  async signOut() {
    setSession(null, 'SIGNED_OUT');
    return { error: null };
  },
  async updateUser({ data, password }: { data?: Row; password?: string }) {
    const id = currentUserId();
    const db = load();
    const u = db.users.find((x) => x.id === id);
    if (!u) return { data: { user: null }, error: { message: 'Not signed in' } };
    if (data) u.meta = { ...(u.meta ?? {}), ...data };
    if (password) u.password = password;
    save(db);
    authListeners.forEach((cb) => cb('USER_UPDATED', sessionFor(id)));
    return { data: { user: sessionFor(id).user }, error: null };
  },
  async resetPasswordForEmail() {
    return { data: {}, error: null };
  },
};

// ---- Realtime ---------------------------------------------------------------

type Handler = { table: string; event: string; cb: (payload: { new: Row }) => void };
const channels = new Set<{ handlers: Handler[] }>();
let bus: BroadcastChannel | null = null;

function deliver(table: string, event: string, row: Row) {
  channels.forEach((ch) =>
    ch.handlers.forEach((h) => {
      if (h.table === table && (h.event === '*' || h.event === event)) h.cb({ new: row });
    })
  );
}

function broadcast(table: string, event: string, row: Row) {
  deliver(table, event, row);
  try {
    bus ??= new BroadcastChannel(CHANNEL);
    bus.postMessage({ table, event, row });
  } catch {
    /* ignore */
  }
}

function listenForOtherTabs() {
  try {
    bus ??= new BroadcastChannel(CHANNEL);
    bus.onmessage = (e) => deliver(e.data.table, e.data.event, e.data.row);
  } catch {
    /* ignore */
  }
}

// ---- Query engine -----------------------------------------------------------

class DbError extends Error {
  code: string;
  constructor(message: string, code = 'P0001') {
    super(message);
    this.code = code;
  }
}

function blockedBetween(db: Db, a: string, b: string) {
  return db.tables.blocks.some(
    (x) => (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a)
  );
}

function visible(db: Db, table: string, row: Row, me: string | null): boolean {
  if (!me) return false;
  switch (table) {
    case 'profiles':
      return true;
    case 'profile_private':
    case 'user_data':
    case 'post_likes':
      return row.user_id === me;
    case 'blocks':
      return row.blocker_id === me;
    case 'messages':
      return row.sender_id === me || row.recipient_id === me;
    case 'posts':
      return (
        row.author_id === me ||
        (row.visibility === 'public' && !row.hidden && !blockedBetween(db, me, row.author_id))
      );
    default:
      return false;
  }
}

/** Split on commas that are not inside parentheses. */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function likeToRegex(pattern: string): RegExp {
  const esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}

function evalCond(cond: string, row: Row): boolean {
  const and = /^and\((.*)\)$/.exec(cond);
  if (and) return splitTop(and[1]).every((c) => evalCond(c, row));
  const m = /^([a-z_]+)\.(eq|neq|ilike|is)\.(.*)$/.exec(cond);
  if (!m) return false;
  const [, col, op, val] = m;
  const v = row[col];
  if (op === 'eq') return String(v) === val;
  if (op === 'neq') return String(v) !== val;
  if (op === 'ilike') return likeToRegex(val).test(String(v ?? ''));
  if (op === 'is') return String(v === null) === String(val === 'null');
  return false;
}

type Filter = (row: Row) => boolean;

class Query implements PromiseLike<{ data: any; error: any; count?: number | null }> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private from_ = 0;
  private mode: 'single' | 'maybe' | null = null;
  private cols = '*';
  private returning = false;
  private conflict: string | undefined;

  constructor(private table: string) {}

  select(cols = '*') {
    if (this.op === 'select') this.cols = cols;
    else {
      this.returning = true;
      this.cols = cols;
    }
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert';
    this.payload = rows;
    this.conflict = opts?.onConflict;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, val: any) { this.filters.push((r) => r[col] === val); return this; }
  neq(col: string, val: any) { this.filters.push((r) => r[col] !== val); return this; }
  in(col: string, vals: any[]) { this.filters.push((r) => vals.includes(r[col])); return this; }
  contains(col: string, vals: any[]) {
    this.filters.push((r) => Array.isArray(r[col]) && vals.every((v) => r[col].includes(v)));
    return this;
  }
  ilike(col: string, pattern: string) { this.filters.push((r) => likeToRegex(pattern).test(String(r[col] ?? ''))); return this; }
  or(expr: string) {
    const conds = splitTop(expr);
    this.filters.push((r) => conds.some((c) => evalCond(c, r)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(from: number, to: number) { this.from_ = from; this.lim = to - from + 1; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  then<R1 = any, R2 = never>(
    onfulfilled?: ((v: { data: any; error: any }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((e: any) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<{ data: any; error: any }> {
    try {
      const db = load();
      const me = currentUserId();
      const rows = db.tables[this.table];
      if (!rows) throw new DbError(`relation "${this.table}" does not exist`, '42P01');
      if (!me) throw new DbError('permission denied', '42501');

      let result: Row[];
      if (this.op === 'insert' || this.op === 'upsert') {
        result = this.runInsert(db, rows, me);
        save(db);
        if (!this.returning) return this.finish(db, [], true);
      } else if (this.op === 'update') {
        result = this.matching(db, rows, me);
        this.checkUpdate(db, result, me);
        for (const r of result) Object.assign(r, this.payload);
        this.afterWrite(db, result);
        save(db);
        if (!this.returning) return this.finish(db, [], true);
      } else if (this.op === 'delete') {
        const doomed = this.matching(db, rows, me).filter((r) => this.canWrite(this.table, r, me));
        db.tables[this.table] = rows.filter((r) => !doomed.includes(r));
        if (this.table === 'posts') {
          db.tables.post_likes = db.tables.post_likes.filter((l) => !doomed.some((d) => d.id === l.post_id));
        }
        save(db);
        return this.finish(db, [], true);
      } else {
        result = this.matching(db, rows, me);
      }
      return this.finish(db, result, false);
    } catch (e) {
      const err = e as DbError;
      return { data: null, error: { message: err.message, code: err.code ?? 'P0001' } };
    }
  }

  private matching(db: Db, rows: Row[], me: string | null) {
    return rows.filter((r) => visible(db, this.table, r, me) && this.filters.every((f) => f(r)));
  }

  private canWrite(table: string, row: Row, me: string): boolean {
    const owner =
      table === 'profiles' ? row.id
      : table === 'posts' ? row.author_id
      : table === 'blocks' ? row.blocker_id
      : row.user_id;
    return owner === me;
  }

  private checkUpdate(db: Db, rows: Row[], me: string) {
    const patch = this.payload as Row;
    if (this.table === 'posts') {
      const allowed = ['title', 'description', 'tags', 'cards', 'visibility'];
      if (Object.keys(patch).some((k) => !allowed.includes(k))) {
        throw new DbError('permission denied for table posts', '42501');
      }
    }
    for (const r of rows) {
      if (!this.canWrite(this.table, r, me)) throw new DbError('new row violates row-level security policy', '42501');
    }
    if (this.table === 'profiles') this.validateProfile(db, { ...rows[0], ...patch }, rows[0]?.id);
  }

  private validateProfile(db: Db, p: Row, selfId: string) {
    if (!/^[a-z0-9_]{3,20}$/.test(p.username)) throw new DbError('violates check constraint "profiles_username_format"', '23514');
    if (db.tables.profiles.some((x) => x.username === p.username && x.id !== selfId)) {
      throw new DbError('duplicate key value violates unique constraint "profiles_username_key"', '23505');
    }
    if ((p.bio ?? '').length > 280) throw new DbError('violates check constraint "profiles_bio_len"', '23514');
    if (p.avatar && !String(p.avatar).startsWith('data:image/')) throw new DbError('violates check constraint "profiles_avatar_ok"', '23514');
  }

  private runInsert(db: Db, rows: Row[], me: string): Row[] {
    const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
    const out: Row[] = [];
    for (const input of list) {
      const row: Row = { ...input };
      switch (this.table) {
        case 'profiles': {
          if (row.id !== me) throw new DbError('new row violates row-level security policy', '42501');
          const existing = rows.find((r) => r.id === row.id);
          if (existing) throw new DbError('duplicate key value violates unique constraint', '23505');
          Object.assign(row, {
            display_name: '', bio: '', avatar: null, avatar_color: 'violet', interests: [], accent: null,
            dm_policy: 'nobody', discoverable: true, created_at: now(), updated_at: now(), ...row,
          });
          this.validateProfile(db, row, row.id);
          break;
        }
        case 'profile_private': {
          if (row.user_id !== me) throw new DbError('new row violates row-level security policy', '42501');
          if (row.birthday) {
            const b = new Date(row.birthday);
            const min = new Date();
            min.setFullYear(min.getFullYear() - 13);
            if (b > new Date()) throw new DbError('Birthday cannot be in the future');
            if (b > min) throw new DbError('You must be at least 13 to use the community');
          }
          const i = rows.findIndex((r) => r.user_id === row.user_id);
          if (i >= 0) {
            rows[i] = { ...rows[i], ...row, updated_at: now() };
            out.push(rows[i]);
            continue;
          }
          row.updated_at = now();
          break;
        }
        case 'user_data': {
          if (row.user_id !== me) throw new DbError('new row violates row-level security policy', '42501');
          const i = rows.findIndex((r) => r.user_id === row.user_id);
          if (i >= 0) {
            rows[i] = { ...rows[i], ...row };
            out.push(rows[i]);
            continue;
          }
          break;
        }
        case 'posts': {
          if (row.author_id !== me) throw new DbError('new row violates row-level security policy', '42501');
          if (!Array.isArray(row.cards) || row.cards.length < 1 || row.cards.length > 300) {
            throw new DbError('violates check constraint "posts_cards_ok"', '23514');
          }
          Object.assign(row, {
            id: uuid(), description: '', tags: [], visibility: 'public', like_count: 0, hidden: false,
            card_count: row.cards.length, created_at: now(), updated_at: now(), ...row,
          });
          row.like_count = 0;
          row.hidden = false;
          row.card_count = row.cards.length;
          break;
        }
        case 'post_likes': {
          if (row.user_id !== me) throw new DbError('new row violates row-level security policy', '42501');
          const post = db.tables.posts.find((p) => p.id === row.post_id);
          if (!post || !visible(db, 'posts', post, me)) throw new DbError('new row violates row-level security policy', '42501');
          if (rows.some((r) => r.post_id === row.post_id && r.user_id === me)) {
            throw new DbError('duplicate key value violates unique constraint', '23505');
          }
          post.like_count += 1;
          row.created_at = now();
          break;
        }
        case 'blocks': {
          if (row.blocker_id !== me) throw new DbError('new row violates row-level security policy', '42501');
          if (rows.some((r) => r.blocker_id === row.blocker_id && r.blocked_id === row.blocked_id)) {
            throw new DbError('duplicate key value violates unique constraint', '23505');
          }
          row.created_at = now();
          break;
        }
        case 'reports': {
          if (row.reporter_id !== me) throw new DbError('new row violates row-level security policy', '42501');
          if (rows.some((r) => r.reporter_id === me && r.kind === row.kind && r.target_id === row.target_id)) {
            throw new DbError('duplicate key value violates unique constraint', '23505');
          }
          row.id = db.seq++;
          row.created_at = now();
          rows.push(row);
          if (row.kind === 'post') {
            const n = new Set(rows.filter((r) => r.kind === 'post' && r.target_id === row.target_id).map((r) => r.reporter_id)).size;
            if (n >= 3) {
              const p = db.tables.posts.find((x) => x.id === row.target_id);
              if (p) p.hidden = true;
            }
          }
          out.push(row);
          continue;
        }
        case 'messages': {
          if (row.sender_id !== me) throw new DbError('new row violates row-level security policy', '42501');
          const target = db.tables.profiles.find((p) => p.id === row.recipient_id);
          if (!target || target.dm_policy !== 'everyone' || row.recipient_id === me || blockedBetween(db, me, row.recipient_id)) {
            throw new DbError('new row violates row-level security policy for table "messages"', '42501');
          }
          const body = String(row.body ?? '');
          if (body.length < 1 || body.length > 1000) throw new DbError('violates check constraint "messages_body_len"', '23514');
          const recent = rows.filter((m) => m.sender_id === me && Date.now() - new Date(m.created_at).getTime() < 60_000).length;
          if (recent >= 20) throw new DbError('You are sending messages too quickly. Please wait a moment.');
          row.id = db.seq++;
          row.created_at = now();
          row.read_at = null;
          break;
        }
        default:
          throw new DbError(`permission denied for table ${this.table}`, '42501');
      }
      rows.push(row);
      out.push(row);
      if (this.table === 'messages') broadcast('messages', 'INSERT', row);
    }
    return out;
  }

  private afterWrite(db: Db, changed: Row[]) {
    if (this.table === 'posts') {
      for (const r of changed) {
        r.card_count = Array.isArray(r.cards) ? r.cards.length : 0;
        r.updated_at = now();
      }
    }
    if (this.table === 'profiles') for (const r of changed) r.updated_at = now();
    void db;
  }

  /** Apply column selection (including `alias:table(cols)` embeds), ordering and paging. */
  private finish(db: Db, rows: Row[], empty: boolean) {
    if (empty) {
      return { data: this.mode ? null : [], error: null };
    }
    let out = [...rows];
    for (const { col, asc } of [...this.orders].reverse()) {
      out.sort((a, b) => {
        const x = a[col];
        const y = b[col];
        if (x === y) return 0;
        return (x > y ? 1 : -1) * (asc ? 1 : -1);
      });
    }
    if (this.from_ || this.lim !== null) {
      out = out.slice(this.from_, this.lim === null ? undefined : this.from_ + this.lim);
    }
    const projected = out.map((r) => this.project(db, r));

    if (this.mode === 'single') {
      if (projected.length !== 1) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      }
      return { data: projected[0], error: null };
    }
    if (this.mode === 'maybe') return { data: projected[0] ?? null, error: null };
    return { data: projected, error: null };
  }

  private project(db: Db, row: Row): Row {
    if (this.cols === '*') return { ...row };
    const out: Row = {};
    for (const part of splitTop(this.cols)) {
      const embed = /^([a-z_]+):([a-z_]+)\((.*)\)$/.exec(part);
      if (embed) {
        const [, alias, table, inner] = embed;
        const fk = table === 'profiles' ? row.author_id : undefined;
        const target = db.tables[table]?.find((r) => r.id === fk);
        out[alias] = target ? pick(target, splitTop(inner)) : null;
      } else if (part === '*') {
        Object.assign(out, row);
      } else {
        out[part] = row[part];
      }
    }
    return out;
  }
}

function pick(row: Row, cols: string[]): Row {
  const out: Row = {};
  for (const c of cols) out[c] = row[c];
  return out;
}

// ---- RPCs -------------------------------------------------------------------

function rpc(name: string, args: Row = {}) {
  return Promise.resolve().then(() => {
    const db = load();
    const me = currentUserId();
    if (!me) return { data: null, error: { message: 'permission denied', code: '42501' } };
    const mine = db.tables.profiles.find((p) => p.id === me);
    const myInterests: string[] = mine?.interests ?? [];
    const pub = (p: Row) => ({ ...p, shared: p.interests.filter((i: string) => myInterests.includes(i)).length });
    const others = () =>
      db.tables.profiles.filter((p) => p.id !== me && p.discoverable && !blockedBetween(db, me, p.id));

    switch (name) {
      case 'suggest_people': {
        const rows = others().map(pub).sort((a, b) => b.shared - a.shared);
        return { data: rows.slice(0, args.max_results ?? 12), error: null };
      }
      case 'search_people': {
        const term = String(args.term ?? '').replace(/%/g, '').trim().toLowerCase();
        if (!term) return { data: [], error: null };
        const rows = others()
          .filter((p) => p.username.includes(term) || p.display_name.toLowerCase().includes(term) || p.interests.includes(term))
          .map(pub)
          .sort((a, b) => b.shared - a.shared);
        return { data: rows.slice(0, args.max_results ?? 24), error: null };
      }
      case 'my_conversations': {
        const msgs = db.tables.messages.filter((m) => m.sender_id === me || m.recipient_id === me);
        const by = new Map<string, Row[]>();
        for (const m of msgs) {
          const partner = m.sender_id === me ? m.recipient_id : m.sender_id;
          if (blockedBetween(db, me, partner)) continue;
          by.set(partner, [...(by.get(partner) ?? []), m]);
        }
        const rows = [...by.entries()].map(([partner, list]) => {
          list.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id));
          return {
            partner_id: partner,
            last_body: list[0].body,
            last_at: list[0].created_at,
            last_from_me: list[0].sender_id === me,
            unread: list.filter((m) => m.recipient_id === me && !m.read_at).length,
          };
        });
        rows.sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
        return { data: rows, error: null };
      }
      case 'mark_conversation_read': {
        for (const m of db.tables.messages) {
          if (m.recipient_id === me && m.sender_id === args.partner && !m.read_at) m.read_at = now();
        }
        save(db);
        return { data: null, error: null };
      }
      case 'unread_total': {
        const n = db.tables.messages.filter(
          (m) => m.recipient_id === me && !m.read_at && !blockedBetween(db, me, m.sender_id)
        ).length;
        return { data: n, error: null };
      }
      default:
        return { data: null, error: { message: `function ${name} does not exist`, code: '42883' } };
    }
  });
}

// ---- Client -----------------------------------------------------------------

export function createMockClient(): unknown {
  if (typeof window !== 'undefined') listenForOtherTabs();
  return {
    auth,
    from: (table: string) => new Query(table),
    rpc,
    channel() {
      const ch = { handlers: [] as Handler[] };
      const api = {
        on(_type: string, filter: { table: string; event: string }, cb: Handler['cb']) {
          ch.handlers.push({ table: filter.table, event: filter.event, cb });
          return api;
        },
        subscribe(cb?: (status: string) => void) {
          channels.add(ch);
          cb?.('SUBSCRIBED');
          return api;
        },
        _ch: ch,
      };
      return api;
    },
    removeChannel(api: { _ch?: { handlers: Handler[] } }) {
      if (api._ch) channels.delete(api._ch);
      return Promise.resolve('ok');
    },
  };
}

/** Wipe the fake database (used by the "reset demo data" button in dev). */
export function resetMockDb() {
  try {
    localStorage.removeItem(DB_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
