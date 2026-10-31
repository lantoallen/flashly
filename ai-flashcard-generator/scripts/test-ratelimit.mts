// Run with: npm run test:ratelimit
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { MAX_PER_WINDOW, rateLimited, resetLocalLimiter } from '../lib/ratelimit.ts';

let n = 0;
const t = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log('  ok -', name);
};

// A tiny stand-in for Upstash's REST pipeline endpoint.
const counts = new Map<string, number>();
const keysSeen: string[] = [];
let authHeader = '';
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    authHeader = req.headers.authorization ?? '';
    const cmds = JSON.parse(body) as string[][];
    const out = cmds.map(([cmd, key]) => {
      if (cmd === 'INCR') {
        keysSeen.push(key);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return { result: counts.get(key) };
      }
      return { result: 1 };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as AddressInfo).port;

console.log('\nShared limiter (Redis)');
process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${port}/`;
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

await t(`allows ${MAX_PER_WINDOW} requests a minute, then limits`, async () => {
  for (let i = 0; i < MAX_PER_WINDOW; i++) assert.equal(await rateLimited('203.0.113.7'), false);
  assert.equal(await rateLimited('203.0.113.7'), true);
});
await t('different clients are counted separately', async () => {
  assert.equal(await rateLimited('198.51.100.1'), false);
});
await t('sends the token and never stores the raw IP', async () => {
  assert.equal(authHeader, 'Bearer test-token');
  assert.ok(keysSeen.length > 0);
  assert.ok(keysSeen.every((k) => !k.includes('203.0.113.7') && k.startsWith('flashly:rl:')));
});
await t('state is shared: a fresh in-memory limiter still sees the count', async () => {
  resetLocalLimiter();
  assert.equal(await rateLimited('203.0.113.7'), true);
});

console.log('\nFallbacks');
await t('falls back to in-memory counting when Redis is unreachable', async () => {
  server.close();
  process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:9';
  resetLocalLimiter();
  const quiet = console.error;
  console.error = () => {};
  try {
    for (let i = 0; i < MAX_PER_WINDOW; i++) assert.equal(await rateLimited('192.0.2.5'), false);
    assert.equal(await rateLimited('192.0.2.5'), true);
  } finally {
    console.error = quiet;
  }
});
await t('works with no Redis configured at all', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  resetLocalLimiter();
  assert.equal(await rateLimited('192.0.2.9'), false);
});

console.log(`\n${n} rate limiter tests passed`);
