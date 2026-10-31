import { generateText } from 'ai';
import {
  AI_OPTIONS,
  aiConfigured,
  aiFailure,
  clientIp,
  jsonError,
  NOT_CONFIGURED,
  rateLimited,
  withFallback,
} from '@/lib/server';

// Allow AI calls to run longer than a host's default function timeout.
export const maxDuration = 30;

const clip = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

export async function POST(req: Request) {
  if (!aiConfigured()) return jsonError(NOT_CONFIGURED, 503);
  if (await rateLimited(clientIp(req))) {
    return jsonError('Too many requests. Please wait a minute and try again.', 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid request.', 400);
  }

  const term = clip(body.term, 200);
  const definition = clip(body.definition, 600);
  const subject = clip(body.subject, 120);
  if (!term || !definition) {
    return jsonError('A term and definition are required.', 400);
  }

  const prompt = `You are a friendly tutor. A student is studying${
    subject ? ` "${subject}"` : ''
  } and wants help with this flashcard.

Term: ${term}
Definition: ${definition}

Explain it in plain language in 2-3 short sentences, then give one concrete example or analogy that makes it stick. Do not use markdown headings or bullet points. Keep it under 90 words.`;

  try {
    const { value } = await withFallback(async (model) => {
      const { text } = await generateText({ model, prompt, providerOptions: AI_OPTIONS });
      const explanation = text.trim();
      if (!explanation) throw new Error('Empty explanation');
      return explanation;
    });
    return Response.json({ explanation: value });
  } catch (err) {
    return aiFailure(err);
  }
}
