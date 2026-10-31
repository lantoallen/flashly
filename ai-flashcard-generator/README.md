# Flashly – AI flashcards & quizzes

Turn pasted notes or any topic into flashcards and quizzes, then study them six
different ways. Free to run, no accounts, no database.

## Features

- **Build cards by hand**: a Quizlet-style builder with title, description and
  term/definition rows. No card limit (the editor renders large sets in pages),
  Tab adds the next card, paste many at once, autosaved draft.
- **AI generation** from pasted notes (up to 8,000 characters), an uploaded
  document, or a topic, with any card count from 3 to 200 (generated in
  batches) and a difficulty level. Documents are read **in your browser**
  (nothing is uploaded): PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx),
  OpenDocument (.odt, .odp), RTF, HTML, EPUB, CSV and plain text, with a
  page/slide/section range picker for long files.
- **Automatic AI failover**: configure more than one provider and requests
  quietly switch to a backup if one is busy, rate-limited or down.
- **Study buddy**: a mascot that reacts to your answers, levels up as you
  study, and **chats** with you (quiz me, explain it, plan my week). Rename it
  or hide it.
- **Community** (needs accounts): publish sets publicly or privately, browse and
  search others' sets, like them and save a copy to your library.
- **Profiles**: photo, username, bio, interests and a private birthday, plus
  privacy controls (who can message you, hide from discovery, block people).
- **People and messages**: find learners by shared interests and chat with them.
  Includes reporting, blocking, rate limits and automatic hiding of sets that
  several members report.
- **Colors**: 12 accent colors plus a custom picker, light/dark mode; your
  choice follows your account.
- **Optional accounts** (Supabase): sign in to sync sets, progress and streaks
  across devices, with explicit agreement to the Terms and Privacy Policy.
- **Terms and cookie notice** on first visit, plus full Terms and Privacy pages.
- **Six study modes**
  - *Flashcards*: flip, shuffle, star, “Got it / Still learning”, read aloud,
    keyboard shortcuts, and an **AI “Explain”** button for any card.
  - *Review*: **spaced repetition** (Leitner boxes) that schedules each card
    just before you'd forget it.
  - *Quiz*: multiple choice using AI-written distractors, review of every miss,
    retry only the missed questions, best score tracking.
  - *Test*: a practice exam mixing multiple choice, true/false and written
    questions, graded when you submit.
  - *Write*: type answers from memory; typos and punctuation are forgiven,
    and a Hint button reveals letters.
  - *Match*: timed pairing game with best-time tracking.
- **Progress**: adjustable daily goal, study streak and a 7-day chart on the
  Library page.
- **Share a set with a link**: the set is compressed into the URL hash, so
  there is no server-side storage.
- **Library**: sets are stored in the browser (localStorage), with search, sort,
  and JSON backup/restore.
- **Edit** any card, add your own, have the AI **add 5 more cards**, or
  **import** a list (paste it or upload a CSV/TXT file).
- **Duplicate** sets in the library.
- **Export** to CSV, JSON or plain text (paste into Quizlet, Anki, Sheets), or
  **print / save as PDF** a study sheet.
- Light/dark mode and five accent colors, responsive layout, confetti, and a
  built-in demo set that works without the AI.

## Getting started

```bash
npm install
```

Create `.env.local` with a free API key from [console.groq.com](https://console.groq.com):

```
GROQ_API_KEY=your_key_here
```

Then run:

```bash
npm run dev
```

Open <http://localhost:3000>.

## How it works

| Piece | Where |
| --- | --- |
| AI providers, failover, rate limit | `lib/server.ts` |
| Generation, explain, health, account-delete endpoints | `app/api/*/route.ts` |
| Accounts, sync and merge | `components/AuthProvider.tsx`, `lib/cloud.ts`, `lib/merge.ts`, `supabase/schema.sql` |
| Consent (terms + storage notice) | `lib/consent.ts`, `components/ConsentGate.tsx`, `app/terms`, `app/privacy` |
| Study buddy and its chat | `components/Pet.tsx`, `components/PetChat.tsx`, `app/api/pip/route.ts`, `lib/pet.ts` |
| Community, profiles, messages | `supabase/community.sql`, `lib/community.ts`, `components/Community*.tsx`, `ProfileEditor.tsx`, `Messenger.tsx` |
| Pages: landing, create, library, study, about | `app/` |
| Study modes | `components/study/` |
| Local persistence (`useSyncExternalStore` over localStorage) | `lib/storage.ts`, `lib/activity.ts` |
| Spaced repetition and share links | `lib/srs.ts`, `lib/share.ts` |
| Theme and accent colors | `lib/theme.ts`, `app/globals.css` |
| Quiz building and typed-answer checking | `lib/quiz.ts`, `lib/utils.ts` |

## AI providers and failover

Set a key for any of these (all have free tiers). Providers with a key are
tried in this order, and a failure moves on to the next automatically:

| Provider | Variable | Default models |
| --- | --- | --- |
| Groq | `GROQ_API_KEY` | `openai/gpt-oss-120b`, `openai/gpt-oss-20b` |
| Cerebras | `CEREBRAS_API_KEY` | `gpt-oss-120b`, `llama3.1-8b` |
| Google Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash`, `gemini-2.5-flash-lite` |
| OpenRouter | `OPENROUTER_API_KEY` | `openai/gpt-oss-20b:free`, `meta-llama/llama-3.3-70b-instruct:free` |

Override the order with `AI_PROVIDER_ORDER=gemini,groq` or a provider's models
with e.g. `GROQ_MODELS=model-a,model-b`. Providers retire models from time to
time, so use `/api/health` to see what is available.

## Accounts (optional)

Accounts need a free [Supabase](https://supabase.com) project:

1. Create a project, then open **SQL Editor** and run `supabase/schema.sql`,
   then `supabase/community.sql` (profiles, posts, messages and their
   security rules). Both can be re-run safely.
2. In **Authentication → Providers**, keep Email enabled. For easiest testing
   you can switch off "Confirm email".
3. In **Authentication → URL Configuration**, add your site URL (and
   `http://localhost:3000` for development) to the allowed redirect URLs.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from
   **Project Settings → API**) in `.env.local` and in your hosting settings.
5. Optional: set `SUPABASE_SERVICE_ROLE_KEY` (server only) to enable the
   "Delete my account" button. Without it users can still delete their cloud
   data.

Without these variables the account UI explains that accounts are off and the
app works exactly as before. Sets sync as one JSON row per user, protected by
row-level security, and merge by last-modified time with deletion tracking so
nothing is lost between devices (`npm run test:merge` covers the merge rules).

## Community

The community uses the same Supabase project as accounts. After running
`supabase/community.sql`:

- Profiles are created automatically for new accounts (and backfilled for
  existing ones). Pictures are resized in the browser to a small square and
  stored with the profile, so no file storage is needed.
- Moderation: members can report sets and people. Reports land in the
  `reports` table (Supabase **Table Editor**). A set reported by three
  different members is hidden automatically. To remove a person or a set,
  delete the row in the dashboard.
- Realtime message delivery uses Supabase Realtime (enabled by the SQL). The
  app also polls every few seconds, so chat works even without it.

### Try it without Supabase (development only)

```bash
NEXT_PUBLIC_MOCK_BACKEND=1 npm run dev
```

This swaps in an in-browser stand-in with a few fake people (sign in as
`maya@example.com`, `leo@example.com`, `nora@example.com` or `sam@example.com`
with the password `password`). Each browser tab keeps its own signed-in user, so
two tabs can chat with each other. It is never included in production builds.

### Tests

```bash
npm run test:sql     # row-level security, blocking, privacy, rate limits
npm run test:merge   # offline/cloud merge rules
```

`test:sql` runs the real SQL files in an in-process Postgres (PGlite).

## Legal text

`app/terms` and `app/privacy` describe how this app works in plain language.
They are a starting point, not legal advice. Review them (and update the
contact details) before running your own public copy, and bump
`TERMS_VERSION` in `lib/terms.ts` when you change them so users are asked to
accept again.

## Checking a deployment

`GET /api/health` reports, for each AI provider, whether a key is set, whether
the provider accepts it, and which configured models are available. It never
returns a key.

## Deploying

Works on any Next.js host. On Vercel's free Hobby plan, add `GROQ_API_KEY` as an
environment variable.

**Rate limiting.** Each visitor gets 20 AI requests a minute. Set
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (from a free
[Upstash](https://upstash.com) Redis database) so every server instance shares
the same count. Without them each instance counts on its own, and if Redis is
unreachable the app falls back to that automatically. IP addresses are hashed
before they are stored.

## Privacy

Without an account, sets, progress and streaks never leave the browser. Only
the text you submit for generation or explanation is sent to an AI provider.
With an account, your library is also stored in your Supabase project. Share
links carry the set in the URL hash, which browsers don't send to servers.
