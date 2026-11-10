// Fills in posters, summaries and IMDb ratings for data/movies.json.
//   TMDB  (TMDB_API_KEY)  -> poster, summary, IMDb id, keywords
//   OMDb  (OMDB_API_KEY)  -> IMDb rating (and poster/summary if TMDB has none)
// Runs on GitHub Actions; the keys live in GitHub Secrets and never reach the app.
// It never guesses: if a title can't be matched with confidence it is flagged
// "needsMatch" and listed in the run summary.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm, normNoArticle, autoMoods, autoVibes, cleanDiscTitle, guessFormat } from '../js/picker.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.CATALOG_FILE || path.join(root, 'data', 'movies.json');
const TMDB = (process.env.TMDB_API_KEY || '').trim();
const OMDB = (process.env.OMDB_API_KEY || '').trim();
const REFRESH = process.env.REFRESH_RATINGS === '1';
const now = new Date();
const asOf = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIG = `${asOf}:${TMDB ? 't' : ''}${OMDB ? 'o' : ''}`; // which sources were tried, and when
const notes = [];

async function getJson(url, headers = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 401) throw new Error('KEY_REJECTED');
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
      if (res.status === 404) return null;
      return await res.json();
    } catch (e) {
      if (e.message === 'KEY_REJECTED') throw e;
      await sleep(1000 * (attempt + 1));
    }
  }
  return null;
}
function tmdb(pathname, params = {}) {
  const url = new URL('https://api.themoviedb.org/3' + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  const headers = { accept: 'application/json' };
  // TMDB hands out two kinds of key; accept either.
  if (TMDB.length > 60) headers.Authorization = 'Bearer ' + TMDB; else url.searchParams.set('api_key', TMDB);
  return getJson(url, headers);
}
function omdb(params) {
  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', OMDB);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return getJson(url);
}

function overlap(a, b) {
  const A = new Set(normNoArticle(a).split(' ')), B = new Set(normNoArticle(b).split(' '));
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.max(1, Math.min(A.size, B.size));
}
// Pick a search result only when we are confident it is the same film.
export function chooseMatch(results, query, year, typed) {
  const list = (results || []).map((r) => ({
    r,
    names: [r.title, r.original_title, r.name, r.original_name].filter(Boolean),
    y: +String(r.release_date || r.first_air_date || '').slice(0, 4) || null,
  }));
  const same = (c) => c.names.some((n) => normNoArticle(n) === normNoArticle(query));
  const near = (c) => !year || !c.y || Math.abs(c.y - year) <= 1;
  let hit = list.find((c) => same(c) && near(c) && (!year || c.y));
  if (hit) return hit.r;
  if (year) {
    // TMDB also searches alternate titles ("Fanatic" = "Die! Die! My Darling!").
    // Accept those only when the year matches and nothing else competes.
    const sameYear = list.filter((c) => c.y && Math.abs(c.y - year) <= 1);
    hit = sameYear.find((c) => c.names.some((n) => overlap(n, query) >= 0.6));
    if (hit) return hit.r;
    if (typed && sameYear.length === 1) return sameYear[0].r;
    return null;
  }
  // No year known (typed-in or barcode title): exact title, most popular wins.
  const exact = list.filter(same).sort((a, b) => (b.r.popularity || 0) - (a.r.popularity || 0));
  return exact[0] ? exact[0].r : null;
}

async function matchTmdb(mv) {
  const season = /^(.*?):\s*season (\d+)$/i.exec(mv.title);
  const query = mv.tmdbQuery || (season ? season[1] : mv.title);
  if (mv.tmdbId) return { id: mv.tmdbId, type: mv.tmdbType || 'movie', season: season ? +season[2] : null };
  if (mv.imdbId) {
    const f = await tmdb(`/find/${mv.imdbId}`, { external_source: 'imdb_id' });
    if (f?.movie_results?.[0]) return { id: f.movie_results[0].id, type: 'movie' };
    if (f?.tv_results?.[0]) return { id: f.tv_results[0].id, type: 'tv', season: season ? +season[2] : null };
  }
  const hinted = !!mv.tmdbQuery;
  if (!season && mv.kind !== 'series') {
    let s = await tmdb('/search/movie', { query, year: mv.year, include_adult: 'false' });
    let hit = chooseMatch(s?.results, query, mv.year, hinted);
    if (!hit && mv.year) {
      s = await tmdb('/search/movie', { query, include_adult: 'false' });
      hit = chooseMatch(s?.results, query, mv.year, hinted);
    }
    if (hit) return { id: hit.id, type: 'movie' };
  }
  // TV: for "Show: Season 3" the disc year is that season's year, so match the show by name.
  const s = await tmdb('/search/tv', { query, include_adult: 'false' });
  const hit = chooseMatch(s?.results, query, season ? null : mv.year, hinted);
  if (hit) return { id: hit.id, type: 'tv', season: season ? +season[2] : null };
  return null;
}

async function upcTitle(barcode) {
  const j = await getJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`);
  const item = j?.items?.[0];
  return item?.title ? { title: cleanDiscTitle(item.title), format: guessFormat(item.title) } : null;
}

async function enrichOne(mv) {
  mv.tried = SIG;
  // Barcode-only additions from the phone: find out what the disc is first.
  if (mv.titlePending && mv.barcode) {
    const u = await upcTitle(mv.barcode);
    if (u?.title) { mv.title = u.title; if (!mv.format && u.format) mv.format = u.format; delete mv.titlePending; }
    else { mv.needsMatch = true; mv.enrichedAt = asOf; notes.push(`Barcode ${mv.barcode}: the free barcode database doesn't know this disc. Open it in the app and type the title.`); return; }
  }
  let plot = '', poster = '';
  if (TMDB) {
    const m = await matchTmdb(mv);
    if (m) {
      const d = await tmdb(`/${m.type}/${m.id}`, { append_to_response: 'external_ids,keywords' });
      if (d) {
        mv.tmdbId = m.id; mv.tmdbType = m.type;
        mv.imdbId = mv.imdbId || d.imdb_id || d.external_ids?.imdb_id || undefined;
        plot = d.overview || ''; poster = d.poster_path || '';
        const kw = (d.keywords?.keywords || d.keywords?.results || []).map((k) => k.name);
        mv.keywords = kw.slice(0, 12);
        if (!mv.year) mv.year = +String(d.release_date || d.first_air_date || '').slice(0, 4) || null;
        if (!mv.runtime && d.runtime) mv.runtime = d.runtime;
        if (!mv.genres?.length) mv.genres = (d.genres || []).map((g) => g.name);
        if (!mv.director && d.created_by?.length) mv.director = d.created_by.map((c) => c.name).join(', ');
        if (m.season) {
          const s = await tmdb(`/tv/${m.id}/season/${m.season}`);
          if (s?.poster_path) poster = s.poster_path;
          if (s?.overview) plot = s.overview;
        }
        if (poster) mv.poster = 'https://image.tmdb.org/t/p/w500' + poster;
        if (plot) mv.summary = plot;
      }
    }
  }
  if (OMDB) {
    const o = mv.imdbId ? await omdb({ i: mv.imdbId, plot: 'short' })
      : !TMDB ? await omdb({ t: mv.tmdbQuery || mv.title.replace(/:\s*season \d+$/i, ''), y: mv.year ? String(mv.year) : '', plot: 'short' }) : null;
    if (o && o.Response === 'True') {
      mv.imdbId = mv.imdbId || o.imdbID;
      const rating = parseFloat(o.imdbRating);
      if (Number.isFinite(rating)) { mv.imdbRating = rating; mv.ratingAsOf = asOf; }
      if (!mv.poster && o.Poster && o.Poster !== 'N/A') mv.poster = o.Poster;
      if (!mv.summary && o.Plot && o.Plot !== 'N/A') mv.summary = o.Plot;
      if (!mv.runtime && parseInt(o.Runtime, 10)) mv.runtime = parseInt(o.Runtime, 10);
      if (!mv.year && parseInt(o.Year, 10)) mv.year = parseInt(o.Year, 10);
      if (!mv.genres?.length && o.Genre && o.Genre !== 'N/A') mv.genres = o.Genre.split(',').map((s) => s.trim());
    }
  }
  if (!mv.moods?.length) mv.moods = autoMoods(mv.genres, mv.keywords, mv.runtime);
  if (!mv.vibes?.length && mv.keywords?.length) mv.vibes = autoVibes(mv.keywords, mv.genres);
  if (mv.poster || mv.summary || mv.imdbRating) { delete mv.needsMatch; mv.enrichedAt = asOf; }
  else {
    mv.needsMatch = true;
    notes.push(`${mv.title}${mv.year ? ` (${mv.year})` : ''}: no confident match. Open it in the app, tap Edit, and check the title and year.`);
  }
}

async function main() {
  if (!fs.existsSync(file)) { console.log('No catalog yet.'); return; }
  const before = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(before);
  if (!TMDB && !OMDB) {
    summary(['**No API keys found yet.** Add `TMDB_API_KEY` and `OMDB_API_KEY` under Settings → Secrets and variables → Actions, then run this workflow again. The app works meanwhile, just without posters and ratings.']);
    return;
  }
  let touched = 0, rated = 0;
  try {
    for (const mv of data.movies) {
      if (mv.removed) continue;
      // New titles, titles you just edited, and (once a month) earlier misses.
      const fresh = mv.retry || (!mv.enrichedAt && mv.tried !== SIG);
      if (fresh) {
        delete mv.retry;
        await enrichOne(mv); touched++;
      } else if (OMDB && mv.imdbId && (REFRESH || !mv.ratingAsOf) && mv.ratingAsOf !== asOf) {
        const o = await omdb({ i: mv.imdbId });
        const rating = parseFloat(o?.imdbRating);
        if (Number.isFinite(rating)) { mv.imdbRating = rating; mv.ratingAsOf = asOf; rated++; }
      } else if (TMDB && !mv.tmdbId && mv.tried !== SIG) {
        await enrichOne(mv); touched++; // enriched earlier with OMDb only; upgrade now that TMDB is set
      }
    }
  } catch (e) {
    if (e.message === 'KEY_REJECTED') notes.unshift('**One of the API keys was rejected (error 401).** Check that the secrets were pasted without extra spaces. A brand-new OMDb key must be activated from the email they send.');
    else throw e;
  }
  const after = JSON.stringify(data, null, 1) + '\n';
  if (after !== before) fs.writeFileSync(file, after);
  const live = data.movies.filter((m) => !m.removed);
  summary([
    `Looked up ${touched} title(s), refreshed ${rated} rating(s).`,
    `Catalog: ${live.length} titles, ${live.filter((m) => m.poster).length} with posters, ${live.filter((m) => m.imdbRating).length} with IMDb ratings.`,
    !TMDB ? '_TMDB_API_KEY is not set, so posters and summaries came from OMDb only._' : '',
    !OMDB ? '_OMDB_API_KEY is not set, so there are no IMDb ratings yet._' : '',
    notes.length ? `\n**Needs a hand (${notes.length}):**\n` + notes.map((n) => `- ${n}`).join('\n') : 'Nothing needs attention.',
  ].filter(Boolean));
}
function summary(lines) {
  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Catalog robot\n${text}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
