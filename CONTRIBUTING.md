# Contributing to Flashly

Thanks for helping! Flashly is a free study app, and contributions of all
sizes are welcome: bug reports, fixes, new study modes, accessibility
improvements, translations and docs.

## Getting set up

```bash
cd ai-flashcard-generator
npm install
cp .env.example .env.local   # add a free GROQ_API_KEY for AI features
npm run dev                  # http://localhost:3000
```

Everything except AI generation works without any keys. To try the community
features without Supabase, run `NEXT_PUBLIC_MOCK_BACKEND=1 npm run dev` (see
the app README).

## Before you open a pull request

Run the same checks as CI:

```bash
npm run lint
npm run typecheck
npm test
npm run build && npm run test:e2e   # first time: npx playwright install chromium
```

- Keep pull requests focused on one change, with a clear description.
- Add or update tests when you change behaviour.
- Check both light and dark mode, and a phone-width screen.
- Don't commit secrets. `.env*` files are ignored, except `.env.example`.

## Good first contributions

- Accessibility fixes (keyboard use, screen-reader labels, contrast).
- More browser tests in `e2e/` for flows that aren't covered yet.
- Improving the wording or translations of the interface.

## Reporting problems

Open an issue with steps to reproduce, what you expected, and what happened.
Issues are public: never include personal details, and report people or
content inside the app with the Report button instead.

## Security

If you find a security problem, please don't open a public issue. Use
GitHub's private vulnerability reporting on this repository (Security tab →
Report a vulnerability).
