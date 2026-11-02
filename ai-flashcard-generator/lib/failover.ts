/**
 * Trying AI models in turn (server only). A small circuit breaker skips a
 * provider/model that just failed, so a dead provider doesn't slow every
 * request down. A model that answered with something unusable (malformed
 * JSON, too few cards, an empty reply) gets one more try first: that's a
 * fluke of that answer, not a sign the provider is down.
 */

export type Failure = { provider: string; model: string; status?: number; retryAfter?: number };

export type Candidate<M> = { provider: string; model: string; make: () => M };

/** `provider:model` -> time until which we skip it. */
const cooldown = new Map<string, number>();

/** For tests. */
export function resetCooldowns(): void {
  cooldown.clear();
}

type AiErrorShape = {
  name?: string;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  lastError?: AiErrorShape;
  cause?: AiErrorShape;
};

/** HTTP status and a "retry after N seconds" hint from a failed AI call. */
export function aiErrorInfo(err: unknown): { status?: number; retryAfter?: number } {
  let e = err as AiErrorShape | null | undefined;
  for (let depth = 0; e && e.statusCode === undefined && depth < 3; depth++) {
    e = e.lastError ?? e.cause;
  }
  const h = e?.responseHeaders ?? {};

  let retryAfter: number | undefined;
  if (h['retry-after'] && Number.isFinite(Number(h['retry-after']))) {
    retryAfter = Number(h['retry-after']);
  } else if (h['x-ratelimit-reset-tokens']) {
    // Looks like "5.5s" or "1m26.4s".
    const m = /(?:(\d+)m)?([\d.]+)s/.exec(h['x-ratelimit-reset-tokens']);
    if (m) retryAfter = Number(m[1] ?? 0) * 60 + Number(m[2]);
  }
  return { status: e?.statusCode, retryAfter: retryAfter === undefined ? undefined : Math.ceil(retryAfter) };
}

export class AllProvidersFailed extends Error {
  failures: Failure[];
  constructor(failures: Failure[]) {
    super('All AI providers failed');
    this.failures = failures;
  }
}

/** Throw this when the model answered but the result can't be used. */
export class UnusableOutput extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnusableOutput';
  }
}

/** AI SDK errors for an answer that didn't fit the requested shape. */
const OUTPUT_ERRORS = new Set([
  'AI_NoObjectGeneratedError',
  'AI_NoContentGeneratedError',
  'AI_TypeValidationError',
  'AI_JSONParseError',
]);

/** The model answered, but not with something usable. Asking again often works. */
export function isUnusableOutput(err: unknown): boolean {
  let e = err as AiErrorShape | null | undefined;
  for (let depth = 0; e && depth < 4; depth++) {
    if (e instanceof UnusableOutput || (e.name && OUTPUT_ERRORS.has(e.name))) return true;
    // Groq checks structured output itself and answers 400 json_validate_failed.
    if (typeof e.responseBody === 'string' && e.responseBody.includes('json_validate_failed')) return true;
    e = e.lastError ?? e.cause;
  }
  return false;
}

/** Run `fn` against each candidate until one succeeds. */
export async function runInTurn<T, M>(
  all: Candidate<M>[],
  fn: (model: M) => Promise<T>
): Promise<{ value: T; provider: string; model: string }> {
  if (all.length === 0) throw new AllProvidersFailed([]);
  const tag = (c: Candidate<M>) => `${c.provider}:${c.model}`;

  const now = Date.now();
  const ready = all.filter((c) => (cooldown.get(tag(c)) ?? 0) <= now);
  const candidates = ready.length ? ready : all; // everything cooling down: try anyway

  const failures: Failure[] = [];
  for (const c of candidates) {
    for (let attempt = 1; ; attempt++) {
      try {
        const value = await fn(c.make());
        cooldown.delete(tag(c));
        return { value, provider: c.provider, model: c.model };
      } catch (err) {
        if (attempt === 1 && isUnusableOutput(err)) {
          console.warn(`AI answer unusable (${tag(c)}), asking once more:`, (err as Error).message);
          continue;
        }
        const { status, retryAfter } = aiErrorInfo(err);
        failures.push({ provider: c.provider, model: c.model, status, retryAfter });
        const seconds = status === 401 || status === 403 ? 600 : status === 429 ? (retryAfter ?? 30) : 45;
        cooldown.set(tag(c), Date.now() + seconds * 1000);
        console.error(`AI call failed (${tag(c)}, status ${status ?? 'n/a'}):`, err);
        break;
      }
    }
  }
  throw new AllProvidersFailed(failures);
}
