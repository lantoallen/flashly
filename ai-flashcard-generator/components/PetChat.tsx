'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { ensureTerms } from '@/lib/consent';
import { appendChat, clearPetChat, usePetChat } from '@/lib/petchat';
import { uid } from '@/lib/utils';

/** Chat bubbles are plain text, so drop any markdown the model slips in. */
function plain(text: string): string {
  return text
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/__([\s\S]+?)__/g, '$1')
    .replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

const STARTERS = [
  'Quiz me on this',
  'Explain it simply',
  'Make me a study plan',
  'Motivate me!',
];

export type PetChatContext = {
  setTitle?: string;
  terms?: string[];
  level: number;
  streak: number;
  today: number;
  goal: number;
};

/** Talk to your study buddy. Replies come from the same free AI as the rest of Flashly. */
export default function PetChat({ name, context }: { name: string; context: PetChatContext }) {
  const messages = usePetChat();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, busy]);

  async function send(content: string) {
    const body = content.trim();
    if (!body || busy) return;
    // Messages go to an AI provider, like card generation.
    if (!ensureTerms(() => send(content))) return;
    setError('');
    setText('');
    appendChat({ id: uid(), role: 'user', content: body });
    setBusy(true);

    // The history now ends with the message we just added.
    const history = [
      ...messages,
      { id: 'pending', role: 'user' as const, content: body },
    ]
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/pip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, name, context }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'I couldn’t think of a reply. Try again?');
      appendChat({ id: uid(), role: 'assistant', content: String(data.reply) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'I couldn’t think of a reply. Try again?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex h-60 flex-col gap-2 overflow-y-auto rounded-xl bg-surface-2 p-3"
        aria-live="polite"
        aria-label={`Chat with ${name}`}
      >
        {messages.length === 0 && !busy ? (
          <div className="m-auto flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-semibold">Hi, I’m {name}! What shall we work on?</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="chip cursor-pointer transition-colors duration-200 hover:!bg-primary-soft"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <p
              key={m.id}
              className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'self-end rounded-br-md bg-primary text-on-primary'
                  : 'self-start rounded-bl-md bg-surface'
              }`}
            >
              {plain(m.content)}
            </p>
          ))
        )}
        {busy && (
          <p className="self-start rounded-2xl rounded-bl-md bg-surface px-3 py-2 text-sm text-muted">
            {name} is thinking…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex gap-2"
      >
        <label htmlFor="pip-chat-input" className="sr-only">
          Message {name}
        </label>
        <input
          id="pip-chat-input"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Ask ${name} anything…`}
          autoComplete="off"
          className="input !py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="btn btn-primary !px-3 !py-2"
          aria-label="Send"
        >
          <Icon name="send" size={16} />
        </button>
      </form>

      {messages.length > 0 && (
        <button
          type="button"
          onClick={() => {
            clearPetChat();
            setError('');
          }}
          className="btn btn-ghost !py-1 text-xs"
        >
          Clear chat
        </button>
      )}
    </div>
  );
}
