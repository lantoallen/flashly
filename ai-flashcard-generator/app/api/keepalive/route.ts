import { reportAlertConfig, sendReportAlerts } from '@/lib/report-alerts';
import { clientIp, jsonError, rateLimited } from '@/lib/server';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * Called once a day by Vercel Cron (see vercel.json) so a free Supabase
 * project never sits idle long enough to be paused. Makes one tiny read that
 * row-level security answers with no rows. Returns nothing sensitive.
 *
 * It also sends any report alerts that didn't go out when the report was
 * filed (for example if the reporter closed the tab straight away).
 *
 * If CRON_SECRET is set, Vercel sends it as a bearer token and only those
 * calls are accepted.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      return jsonError('Unauthorized', 401);
    }
  } else if (await rateLimited(clientIp(req))) {
    return jsonError('Too many requests.', 429);
  }

  const alerts = reportAlertConfig(SITE_URL);
  if (alerts) {
    await sendReportAlerts(alerts).catch((err) => console.error('Report alert failed:', err));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    return Response.json({ ok: true, supabase: 'not configured' });
  }

  try {
    const res = await fetch(`${url}/rest/v1/user_data?select=user_id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    return Response.json(
      { ok: res.ok, supabase: res.ok ? 'awake' : `HTTP ${res.status}` },
      { status: res.ok ? 200 : 502 }
    );
  } catch {
    return Response.json({ ok: false, supabase: 'unreachable' }, { status: 502 });
  }
}
