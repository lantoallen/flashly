// Run with: npm run test:alerts
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { reportAlertConfig, sendReportAlerts, type AlertConfig } from '../lib/report-alerts.ts';

let n = 0;
const t = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log('  ok -', name);
};
console.error = () => {};

const MAYA = '11111111-1111-1111-1111-111111111111';
const LEO = '22222222-2222-2222-2222-222222222222';
const POST = '33333333-3333-3333-3333-333333333333';

// ---- A tiny stand-in for Supabase's REST API and Resend ----------------------
type Row = Record<string, unknown>;
let reports: Row[] = [];
const tables: Record<string, Row[]> = {
  profiles: [
    { id: MAYA, username: 'maya', display_name: 'Maya' },
    { id: LEO, username: 'leo', display_name: 'Leo' },
  ],
  posts: [{ id: POST, title: 'Cell Biology', author_id: LEO, hidden: false }],
  messages: [{ id: 7, sender_id: LEO, body: 'buy cheap followers' }],
};
const emails: { subject: string; text: string; to: string[] }[] = [];
const urls: string[] = [];
let resendStatus = 200;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url ?? '/', 'http://x');
    urls.push(decodeURIComponent(url.pathname + url.search));
    const send = (status: number, data?: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(data === undefined ? '' : JSON.stringify(data));
    };
    if (url.pathname === '/emails') {
      if (resendStatus !== 200) return send(resendStatus, { message: 'nope' });
      emails.push(JSON.parse(body));
      return send(200, { id: 'email-1' });
    }
    if (req.headers.authorization !== 'Bearer service-key') return send(401);

    const table = url.pathname.replace('/rest/v1/', '');
    // Supports the filters the alert code uses: col=is.null and col=in.(a,b).
    const filters = [...url.searchParams].filter(([k]) => k !== 'select');
    const match = (row: Row) =>
      filters.every(([col, f]) =>
        f === 'is.null'
          ? row[col] == null
          : f.startsWith('in.(')
            ? f.slice(4, -1).split(',').includes(String(row[col]))
            : true
      );
    const rows = table === 'reports' ? reports : tables[table] ?? [];
    if (req.method === 'PATCH') {
      const patch = JSON.parse(body);
      const hit = rows.filter(match);
      for (const r of hit) Object.assign(r, patch);
      return send(200, req.headers.prefer === 'return=representation' ? hit : undefined);
    }
    return send(200, rows.filter(match));
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const config: AlertConfig = {
  supabaseUrl: base,
  serviceKey: 'service-key',
  resendKey: 'resend-key',
  to: 'owner@example.com',
  from: 'Flashly <onboarding@resend.dev>',
  siteUrl: 'https://flashly.example',
  resendUrl: `${base}/emails`,
};
const report = (id: number, kind: string, target: string, reason = '') => ({
  id,
  reporter_id: MAYA,
  kind,
  target_id: target,
  reason,
  created_at: `2026-11-02T09:0${id}:00Z`,
  alerted_at: null,
});

await t('stays off until every setting is present', async () => {
  assert.equal(reportAlertConfig('https://x', {}), null);
  assert.equal(
    reportAlertConfig('https://x', {
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      RESEND_API_KEY: 'r',
    }),
    null
  );
  const c = reportAlertConfig('https://x', {
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    RESEND_API_KEY: 'r',
    REPORT_ALERT_EMAIL: 'me@example.com',
  });
  assert.equal(c?.supabaseUrl, 'https://abc.supabase.co');
  assert.equal(c?.from, 'Flashly <onboarding@resend.dev>');
});

await t('emails one summary of the new reports, with links', async () => {
  reports = [report(1, 'post', POST, 'spam'), report(2, 'user', LEO, 'rude'), report(3, 'message', '7')];
  assert.equal(await sendReportAlerts(config), 3);
  assert.equal(emails.length, 1);
  const { subject, text, to } = emails[0];
  assert.deepEqual(to, ['owner@example.com']);
  assert.equal(subject, 'Flashly: 3 new reports');
  assert.match(text, /Shared set "Cell Biology" by @leo/);
  assert.match(text, /https:\/\/flashly\.example\/community\/33333333/);
  assert.match(text, /Person @leo \(Leo\)/);
  assert.match(text, /Message from @leo: "buy cheap followers"/);
  assert.match(text, /Reason: spam/);
  assert.match(text, /Reported by @maya/);
  assert.ok(reports.every((r) => r.alerted_at), 'all reports marked as alerted');
});

await t('each report is emailed only once', async () => {
  assert.equal(await sendReportAlerts(config), 0);
  assert.equal(emails.length, 1);
});

await t('a failed email is retried later', async () => {
  reports.push(report(4, 'user', LEO));
  resendStatus = 500;
  await assert.rejects(sendReportAlerts(config));
  assert.equal(reports.find((r) => r.id === 4)?.alerted_at, null, 'claim released');
  resendStatus = 200;
  assert.equal(await sendReportAlerts(config), 1);
  assert.equal(emails.length, 2);
});

await t('odd target ids never reach a database query', async () => {
  urls.length = 0;
  reports.push(report(5, 'post', 'x),or=(id.neq.0'));
  assert.equal(await sendReportAlerts(config), 1);
  assert.ok(!urls.some((u) => u.includes('or=(')), 'hostile id kept out of queries');
  assert.match(emails[2].text, /Shared set x\),or=\(id\.neq\.0 \(deleted, or not found\)/);
});

server.close();
console.log(`${n} report alert tests passed`);
