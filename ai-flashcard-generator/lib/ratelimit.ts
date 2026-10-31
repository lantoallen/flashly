import { createHash } from 'node:crypto';

/**
 * Per-IP rate limiting for the API routes (server only).
 *
 * With UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set, counts are
 * shared by every server instance (a free Upstash database is plenty).
 * Without them, or if Redis is unreachable, each instance counts on its own,
 * which still stops a single client from hammering one instance.
 */

export const WINDOW_MS = 60_000;
export const MAX_PER_WINDOW = 20;

const hits = new Map<string, number[]>();

/** In-memory sliding window, used when Redis isn't configured or fails. */
export function localLimited(id: string, now = Date.now()): boolean {
  const recent = (hits.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(id, recent);
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

export function resetLocalLimiter(): void {
  hits.clear();
}

/** Don't store raw IP addresses in Redis. */
function hashId(id: string): string {
  return createHash('sha256').update(`flashly:${id}`).digest('hex').slice(0, 32);
}

type RedisConfig = { url: string; token: string };

function redisConfig(): RedisConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

/** Fixed-window counter in Redis: INCR the window's key and let it expire. */
async function redisCount(cfg: RedisConfig, id: string, now: number): Promise<number> {
  const key = `flashly:rl:${hashId(id)}:${Math.floor(now / WINDOW_MS)}`;
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, String(Math.ceil(WINDOW_MS / 1000) + 10)],
    ]),
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string }[];
  const count = Number(data?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error(data?.[0]?.error ?? 'Unexpected Redis reply');
  return count;
}

export async function rateLimited(id: string): Promise<boolean> {
  const cfg = redisConfig();
  const now = Date.now();
  if (cfg) {
    try {
      return (await redisCount(cfg, id, now)) > MAX_PER_WINDOW;
    } catch (err) {
      console.error('Rate limiter: Redis unavailable, using in-memory fallback.', err);
    }
  }
  return localLimited(id, now);
}
