# Neon Shelf

Personal movie picker for Ken's physical disc collection. Phone-first static web app on GitHub Pages; the catalog and watch log live in this repo. Sibling of (but separate from) `midnight-video`.

## Layout
- `index.html`, `css/app.css`, `js/app.js` — the app (vanilla JS modules, no build step).
- `js/picker.js` — all picking rules, calendar, stats. Pure functions shared by the app, the robots and the tests. Change picking behaviour here.
- `js/store.js` — data layer. Phone changes are queued as "ops" in localStorage and written to the repo through the GitHub contents API when a save key (fine-grained token) is set.
- `data/movies.json` (catalog), `data/watchlog.json` (watch history), `data/config.json` (weather location).
- `scripts/import-clz.mjs` — merges CLZ CSV files from `import/`. `scripts/mood-seed.mjs` — hand-written mood tags + title fixes.
- `scripts/enrich.mjs` — TMDB (poster, summary, IMDb id) + OMDb (IMDb rating). Never guesses a match; flags `needsMatch`.
- `.github/workflows/site.yml` — tests, import, enrich, commit, deploy to Pages. Secrets: `TMDB_API_KEY`, `OMDB_API_KEY`.

## Rules
- No API keys in the app or the repo. TMDB/OMDb keys are Actions secrets only.
- Mood tags in `data/movies.json` are Ken's content once imported: do not bulk-rewrite them.
- Original identity only: no real store names, logos or trademarked branding.
- Never invent ratings or IMDb ids. Missing data shows as missing.
- Explain anything Ken has to do in plain English; he does not write code.

## Checks before pushing
- `npm test` (picking rules + robots against stand-in APIs).
- `npm run test:app` (Playwright at 390px and 1280px; GitHub and weather are mocked).
- Test hooks: `?now=2026-10-30T20:00`, `?seed=7`, `?weather=61,41` (WMO code, °F), `?view=back`.
