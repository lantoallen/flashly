import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

/** Helpers shared by the API routes (server only). */

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

export { rateLimited } from './ratelimit';

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

// ---------------------------------------------------------------------------
// AI providers with automatic failover
// ---------------------------------------------------------------------------

type ProviderDef = {
  id: string;
  label: string;
  /** Environment variables that may hold the key, in order of preference. */
  envKeys: string[];
  /** Default models, best first. Override with `<ID>_MODELS=a,b`. */
  models: string[];
  make: (key: string, model: string) => LanguageModel;
  /** Returns the ids of models this key can use (throws on a rejected key). */
  list: (key: string) => Promise<string[]>;
};

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { statusCode: res.status });
  return res.json();
}

const idsOf = (json: { data?: { id: string }[] }) => (json.data ?? []).map((m) => m.id);

/**
 * Providers are tried in this order. Only those with a key configured are used,
 * so adding a free key for any of them gives you another safety net.
 */
const PROVIDERS: ProviderDef[] = [
  {
    id: 'groq',
    label: 'Groq',
    envKeys: ['GROQ_API_KEY'],
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    make: (key, model) => createGroq({ apiKey: key })(model),
    list: async (key) =>
      idsOf(await getJson('https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${key}` })),
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    envKeys: ['CEREBRAS_API_KEY'],
    models: ['gpt-oss-120b', 'llama3.1-8b'],
    make: (key, model) =>
      createOpenAICompatible({
        name: 'cerebras',
        baseURL: 'https://api.cerebras.ai/v1',
        apiKey: key,
        supportsStructuredOutputs: true,
      })(model),
    list: async (key) =>
      idsOf(await getJson('https://api.cerebras.ai/v1/models', { Authorization: `Bearer ${key}` })),
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    make: (key, model) => createGoogleGenerativeAI({ apiKey: key })(model),
    list: async (key) => {
      const json = (await getJson(
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
        { 'x-goog-api-key': key }
      )) as { models?: { name: string }[] };
      return (json.models ?? []).map((m) => m.name.replace(/^models\//, ''));
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    envKeys: ['OPENROUTER_API_KEY'],
    models: ['openai/gpt-oss-20b:free', 'meta-llama/llama-3.3-70b-instruct:free'],
    make: (key, model) =>
      createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: key,
      })(model),
    list: async (key) => {
      await getJson('https://openrouter.ai/api/v1/auth/key', { Authorization: `Bearer ${key}` });
      return idsOf(await getJson('https://openrouter.ai/api/v1/models'));
    },
  },
];

/** Tolerate common copy/paste mistakes in hosting dashboards: quotes, spaces, "NAME=" prefix. */
function cleanKey(raw: string | undefined, envName: string): string {
  return (raw ?? '')
    .trim()
    .replace(new RegExp(`^${envName}\\s*=\\s*`, 'i'), '')
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

function keyFor(p: ProviderDef): string {
  for (const name of p.envKeys) {
    const key = cleanKey(process.env[name], name);
    if (key) return key;
  }
  return '';
}

function modelsFor(p: ProviderDef): string[] {
  const override = process.env[`${p.id.toUpperCase()}_MODELS`];
  const list = override ? override.split(',').map((s) => s.trim()).filter(Boolean) : p.models;
  return list.length ? list : p.models;
}

/** Providers with a key, in priority order (override with AI_PROVIDER_ORDER=gemini,groq). */
function configuredProviders(): ProviderDef[] {
  const order = (process.env.AI_PROVIDER_ORDER ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const rank = (p: ProviderDef) => {
    const i = order.indexOf(p.id);
    return i === -1 ? order.length + PROVIDERS.indexOf(p) : i;
  };
  return PROVIDERS.filter((p) => keyFor(p)).sort((a, b) => rank(a) - rank(b));
}

export function aiConfigured(): boolean {
  return configuredProviders().length > 0;
}

export const NOT_CONFIGURED =
  'The AI service is not set up on this server yet (no API key is configured).';

// ---- Failover with a small circuit breaker ----------------------------------

type Failure = { provider: string; model: string; status?: number; retryAfter?: number };

/** `provider:model` -> time until which we skip it. */
const cooldown = new Map<string, number>();

type AiErrorShape = {
  statusCode?: number;
  responseHeaders?: Record<string, string>;
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

/**
 * Run `fn` against each configured provider/model until one succeeds.
 * Providers that just failed are skipped for a short while, so a dead
 * provider doesn't slow every request down.
 */
export async function withFallback<T>(
  fn: (model: LanguageModel) => Promise<T>
): Promise<{ value: T; provider: string; model: string }> {
  const all = configuredProviders().flatMap((p) =>
    modelsFor(p).map((model) => ({ p, model, key: keyFor(p), tag: `${p.id}:${model}` }))
  );
  if (all.length === 0) throw new AllProvidersFailed([]);

  const now = Date.now();
  const ready = all.filter((c) => (cooldown.get(c.tag) ?? 0) <= now);
  const candidates = ready.length ? ready : all; // everything cooling down: try anyway

  const failures: Failure[] = [];
  for (const c of candidates) {
    try {
      const value = await fn(c.p.make(c.key, c.model));
      cooldown.delete(c.tag);
      return { value, provider: c.p.id, model: c.model };
    } catch (err) {
      const { status, retryAfter } = aiErrorInfo(err);
      failures.push({ provider: c.p.id, model: c.model, status, retryAfter });
      const seconds = status === 401 || status === 403 ? 600 : status === 429 ? (retryAfter ?? 30) : 45;
      cooldown.set(c.tag, Date.now() + seconds * 1000);
      console.error(`AI call failed (${c.tag}, status ${status ?? 'n/a'}):`, err);
    }
  }
  throw new AllProvidersFailed(failures);
}

/** Standard JSON response for a failed AI call, without leaking internals. */
export function aiFailure(err: unknown) {
  const failures = err instanceof AllProvidersFailed ? err.failures : [];
  const rateLimits = failures.filter((f) => f.status === 429);
  const allRejected =
    failures.length > 0 && failures.every((f) => f.status === 401 || f.status === 403);

  if (allRejected) {
    return Response.json(
      { error: 'The AI service rejected this server’s API key. Check the key in the hosting settings.' },
      { status: 502 }
    );
  }
  if (rateLimits.length > 0) {
    const waits = rateLimits.map((f) => f.retryAfter).filter((n): n is number => n !== undefined);
    return Response.json(
      {
        error: 'The AI service is busy right now. Please try again in a few seconds.',
        retryAfter: waits.length ? Math.min(...waits) : undefined,
      },
      { status: 429 }
    );
  }
  return Response.json(
    { error: 'Could not reach the AI service right now. Please try again in a moment.' },
    { status: 502 }
  );
}

/** Keep reasoning short so models spend their budget on the answer. */
export const AI_OPTIONS = {
  groq: { reasoningEffort: 'low' as const },
};

// ---- Health -------------------------------------------------------------------

export type ProviderHealth = {
  id: string;
  label: string;
  configured: boolean;
  keyOk?: boolean;
  models?: { id: string; available: boolean }[];
  message?: string;
};

export async function checkProviders(): Promise<ProviderHealth[]> {
  return Promise.all(
    PROVIDERS.map(async (p): Promise<ProviderHealth> => {
      const key = keyFor(p);
      if (!key) {
        return { id: p.id, label: p.label, configured: false };
      }
      try {
        const available = new Set(await p.list(key));
        return {
          id: p.id,
          label: p.label,
          configured: true,
          keyOk: true,
          models: modelsFor(p).map((id) => ({ id, available: available.has(id) })),
        };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // Gemini reports an invalid key as HTTP 400.
        const rejected = status === 400 || status === 401 || status === 403;
        return {
          id: p.id,
          label: p.label,
          configured: true,
          // A provider-side error (5xx, timeout) says nothing about the key itself.
          keyOk: rejected ? false : undefined,
          message: rejected
            ? 'The provider rejected this API key.'
            : status === 429
              ? 'The provider is rate limiting this key right now.'
              : 'Could not verify: the provider’s model list is not responding. Generation may still work.',
        };
      }
    })
  );
}
