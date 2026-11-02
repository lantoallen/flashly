import { reportAlertConfig, sendReportAlerts } from '@/lib/report-alerts';
import { clientIp, jsonError, rateLimited } from '@/lib/server';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * The app calls this right after someone files a report. It emails the site
 * owner about any reports not alerted yet (see lib/report-alerts.ts). Anyone
 * may call it: it only ever sends real, pending reports, each once, and its
 * answer says nothing about whether there were any.
 */
export async function POST(req: Request) {
  if (await rateLimited(clientIp(req))) {
    return jsonError('Too many requests.', 429);
  }
  const config = reportAlertConfig(SITE_URL);
  if (config) {
    try {
      await sendReportAlerts(config);
    } catch (err) {
      console.error('Report alert failed:', err);
    }
  }
  return Response.json({ ok: true });
}
