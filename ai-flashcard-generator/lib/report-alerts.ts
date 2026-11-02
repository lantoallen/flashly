/**
 * Emails the site owner when members report a set, a person or a message
 * (server only), so problems get seen quickly instead of waiting in the
 * reports table.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (members can't read reports), a free
 * Resend API key (RESEND_API_KEY) and REPORT_ALERT_EMAIL. Each report is
 * claimed by setting alerted_at before the email goes out, so it is sent
 * once even if several requests race; if sending fails the claim is undone
 * and a later request (or the daily cron) tries again.
 */

export type AlertConfig = {
  supabaseUrl: string;
  serviceKey: string;
  resendKey: string;
  to: string;
  from: string;
  siteUrl: string;
  resendUrl?: string;
};

type Report = {
  id: number;
  reporter_id: string;
  kind: 'post' | 'user' | 'message';
  target_id: string;
  reason: string;
  created_at: string;
};
type Profile = { id: string; username: string; display_name: string };
type Post = { id: string; title: string; author_id: string; hidden: boolean };
type Message = { id: number; sender_id: string; body: string };

/** How many reports one email lists in full. */
const MAX_LISTED = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^\d{1,18}$/;

export function reportAlertConfig(siteUrl: string, env = process.env): AlertConfig | null {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const resendKey = env.RESEND_API_KEY?.trim();
  const to = env.REPORT_ALERT_EMAIL?.trim();
  if (!supabaseUrl || !serviceKey || !resendKey || !to) return null;
  return {
    supabaseUrl,
    serviceKey,
    resendKey,
    to,
    // Resend's shared sender works without a domain, for mail to your own address.
    from: env.REPORT_ALERT_FROM?.trim() || 'Flashly <onboarding@resend.dev>',
    siteUrl,
  };
}

/** Sends one email about every report not alerted yet. Returns how many it covered. */
export async function sendReportAlerts(config: AlertConfig): Promise<number> {
  const rest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Supabase ${path.split('?')[0]}: HTTP ${res.status}`);
    const body = await res.text();
    return (body ? JSON.parse(body) : null) as T;
  };

  const claimed = await rest<Report[]>('reports?alerted_at=is.null&select=*', {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ alerted_at: new Date().toISOString() }),
  });
  if (claimed.length === 0) return 0;
  claimed.sort((a, b) => a.created_at.localeCompare(b.created_at));

  try {
    const details = await lookUp(claimed, rest).catch((err) => {
      // The email is still useful with bare ids.
      console.error('Report alert lookup failed:', err);
      return null;
    });
    const res = await fetch(config.resendUrl ?? 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.from,
        to: [config.to],
        subject: `Flashly: ${claimed.length} new report${claimed.length === 1 ? '' : 's'}`,
        text: formatEmail(claimed, details, config),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend: HTTP ${res.status} ${await res.text().catch(() => '')}`.trim());
  } catch (err) {
    // Release the claim so the next request or the daily cron tries again.
    await rest(`reports?id=in.(${claimed.map((r) => r.id).join(',')})`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ alerted_at: null }),
    }).catch(() => {});
    throw err;
  }
  return claimed.length;
}

type Details = {
  profiles: Map<string, Profile>;
  posts: Map<string, Post>;
  messages: Map<string, Message>;
  counts: Map<string, number>;
};

async function lookUp(
  reports: Report[],
  rest: <T>(path: string, init?: RequestInit) => Promise<T>
): Promise<Details> {
  // target_id is free text from the browser: only well-formed ids go into a query.
  const ids = (kind: Report['kind'], pattern: RegExp) => [
    ...new Set(reports.filter((r) => r.kind === kind && pattern.test(r.target_id)).map((r) => r.target_id)),
  ];
  // Rows of `table` whose `column` is one of `values` (none asked, none fetched).
  const where = <T>(table: string, select: string, column: string, values: string[]) =>
    values.length
      ? rest<T[]>(`${table}?select=${select}&${column}=in.(${values.join(',')})`)
      : Promise.resolve([] as T[]);

  const targets = [...new Set(reports.map((r) => r.target_id))].filter(
    (id) => UUID.test(id) || NUMBER.test(id)
  );
  const [posts, messages, counts] = await Promise.all([
    where<Post>('posts', 'id,title,author_id,hidden', 'id', ids('post', UUID)),
    where<Message>('messages', 'id,sender_id,body', 'id', ids('message', NUMBER)),
    where<{ kind: string; target_id: string }>('reports', 'kind,target_id', 'target_id', targets),
  ]);

  const people = new Set<string>();
  for (const r of reports) {
    people.add(r.reporter_id);
    if (r.kind === 'user' && UUID.test(r.target_id)) people.add(r.target_id);
  }
  for (const p of posts) people.add(p.author_id);
  for (const m of messages) people.add(m.sender_id);
  const profiles = await where<Profile>(
    'profiles',
    'id,username,display_name',
    'id',
    [...people].filter((id) => UUID.test(id))
  );

  const tally = new Map<string, number>();
  for (const c of counts) tally.set(`${c.kind}:${c.target_id}`, (tally.get(`${c.kind}:${c.target_id}`) ?? 0) + 1);
  return {
    profiles: new Map(profiles.map((p) => [p.id, p])),
    posts: new Map(posts.map((p) => [p.id, p])),
    messages: new Map(messages.map((m) => [String(m.id), m])),
    counts: tally,
  };
}

export function formatEmail(reports: Report[], details: Details | null, config: AlertConfig): string {
  const who = (id: string) => {
    const p = details?.profiles.get(id);
    return p ? `@${p.username}` : `user ${id}`;
  };
  const lines: string[] = [
    `${reports.length} new report${reports.length === 1 ? '' : 's'} on Flashly.`,
    '',
  ];

  reports.slice(0, MAX_LISTED).forEach((r, i) => {
    const total = details?.counts.get(`${r.kind}:${r.target_id}`);
    const soFar = total && total > 1 ? ` (${total} reports so far)` : '';
    if (r.kind === 'post') {
      const post = details?.posts.get(r.target_id);
      lines.push(
        post
          ? `${i + 1}. Shared set "${post.title}" by ${who(post.author_id)}${soFar}${post.hidden ? ', now hidden automatically' : ''}`
          : `${i + 1}. Shared set ${r.target_id}${soFar} (deleted, or not found)`
      );
      if (UUID.test(r.target_id)) lines.push(`   ${config.siteUrl}/community/${r.target_id}`);
    } else if (r.kind === 'user') {
      const person = details?.profiles.get(r.target_id);
      lines.push(`${i + 1}. Person ${person ? `@${person.username} (${person.display_name})` : r.target_id}${soFar}`);
      if (person) lines.push(`   ${config.siteUrl}/u/${person.username}`);
    } else {
      const message = details?.messages.get(r.target_id);
      lines.push(
        message
          ? `${i + 1}. Message from ${who(message.sender_id)}${soFar}: "${message.body.slice(0, 300)}"`
          : `${i + 1}. Message ${r.target_id}${soFar} (deleted, or not found)`
      );
    }
    lines.push(`   Reason: ${r.reason.trim() || '(none given)'}`);
    lines.push(`   Reported by ${who(r.reporter_id)} at ${r.created_at.slice(0, 16).replace('T', ' ')} UTC`);
    lines.push('');
  });
  if (reports.length > MAX_LISTED) {
    lines.push(`...and ${reports.length - MAX_LISTED} more. See the reports table for all of them.`, '');
  }

  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(config.supabaseUrl)?.[1];
  lines.push(
    'To act on a report, open the Supabase Table Editor:',
    ref ? `https://supabase.com/dashboard/project/${ref}/editor` : 'your Supabase dashboard -> Table Editor',
    'Delete a row in "posts" to remove a set, or the person in Authentication -> Users to remove an account.',
    'Set "hidden" to false in "posts" to restore a set that was hidden by mistake.'
  );
  return lines.join('\n');
}
