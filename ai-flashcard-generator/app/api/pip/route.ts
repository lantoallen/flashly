import { generateText } from 'ai';
import {
  AI_OPTIONS,
  aiConfigured,
  aiFailure,
  clientIp,
  jsonError,
  NOT_CONFIGURED,
  rateLimited,
  UnusableOutput,
  withFallback,
} from '@/lib/server';

export const maxDuration = 30;

const MAX_MESSAGES = 12;
const MAX_CONTENT = 600;

const clip = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

type Turn = { role: 'user' | 'assistant'; content: string };

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

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const turns: Turn[] = raw
    .map((m): Turn | null => {
      const r = m as { role?: unknown; content?: unknown };
      const content = typeof r.content === 'string' ? r.content.trim().slice(0, MAX_CONTENT) : '';
      if (!content || (r.role !== 'user' && r.role !== 'assistant')) return null;
      return { role: r.role, content };
    })
    .filter((t): t is Turn => t !== null)
    .slice(-MAX_MESSAGES);

  // The conversation has to start and end with the student.
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return jsonError('Say something to chat.', 400);
  }

  const name = clip(body.name, 16) || 'Pip';
  const ctx = (body.context ?? {}) as Record<string, unknown>;
  const setTitle = clip(ctx.setTitle, 100);
  const terms = Array.isArray(ctx.terms)
    ? ctx.terms.map((t) => clip(t, 60)).filter(Boolean).slice(0, 12)
    : [];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
  const level = num(ctx.level);
  const streak = num(ctx.streak);
  const today = num(ctx.today);
  const goal = num(ctx.goal);

  const facts = [
    setTitle ? `They are studying a set called "${setTitle}".` : '',
    terms.length ? `Some of its terms: ${terms.join('; ')}.` : '',
    level !== null ? `You are level ${level}.` : '',
    streak !== null ? `Their study streak is ${streak} day${streak === 1 ? '' : 's'}.` : '',
    today !== null && goal !== null ? `Today they studied ${today} of ${goal} cards.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const system = `You are ${name}, a friendly study-buddy mascot inside Flashly, a flashcard app. You chat with students.
- Be warm, encouraging and concise: usually 1 to 4 short sentences (under 70 words). Plain language.
- Write plain text only. Do not use markdown symbols such as ** or # or backticks, and avoid long lists.
- You can explain a concept simply, quiz the student ONE question at a time (then wait for their answer), suggest study strategies, help plan a short study session, or cheer them on.
- Stay kind and school-appropriate. You are an AI buddy, not a person; never claim to be human.
- Do not give medical, legal or financial advice. If the student seems upset or unsafe, respond with care and encourage them to talk to a trusted adult or a professional.
- Never ask for personal details such as full names, addresses, phone numbers or passwords.
- If asked about something unrelated to learning, answer briefly and steer back to studying.
${facts ? `Context: ${facts}` : ''}`;

  try {
    const { value } = await withFallback(async (model) => {
      const { text } = await generateText({
        model,
        system,
        messages: turns,
        maxOutputTokens: 400,
        providerOptions: AI_OPTIONS,
      });
      const reply = text.trim();
      if (!reply) throw new UnusableOutput('Empty reply');
      return reply;
    });
    return Response.json({ reply: value });
  } catch (err) {
    return aiFailure(err);
  }
}
