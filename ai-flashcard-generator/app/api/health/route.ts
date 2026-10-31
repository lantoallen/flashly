import { checkProviders, clientIp, jsonError, rateLimited } from '@/lib/server';

export const maxDuration = 20;

/**
 * Deployment self-check: which AI providers have a key, does each provider
 * accept it, and are the configured models available? Never returns a key.
 */
export async function GET(req: Request) {
  if (await rateLimited(clientIp(req))) {
    return jsonError('Too many requests. Please wait a minute and try again.', 429);
  }

  const providers = await checkProviders();
  const ready = providers.filter(
    (p) => p.keyOk && p.models?.some((m) => m.available)
  );
  const configured = providers.filter((p) => p.configured);
  const unverified = configured.filter((p) => p.keyOk === undefined);

  let message: string;
  if (configured.length === 0) {
    message =
      'No AI provider key is set. Add GROQ_API_KEY (or CEREBRAS_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY) in your hosting settings, then redeploy.';
  } else if (ready.length === 0 && unverified.length > 0) {
    message =
      'Keys are set, but the providers’ model lists are not responding, so they could not be verified. Generation may still work.';
  } else if (ready.length === 0) {
    message =
      'A key is set, but no provider accepted it or has the configured models. Check the details below.';
  } else if (ready.length === 1) {
    message = `AI is ready via ${ready[0].label}. Add a second provider key for automatic backup.`;
  } else {
    message = `AI is ready with ${ready.length} providers, so requests fail over automatically.`;
  }

  return Response.json(
    {
      ok: ready.length > 0 || unverified.length > 0,
      readyProviders: ready.length,
      message,
      providers,
    },
    { status: ready.length > 0 || unverified.length > 0 ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
