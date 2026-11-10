// Reads every CLZ Movies export (.csv) in the import/ folder and merges it into
// data/movies.json. Safe to run over and over:
//  - a file that was already imported is skipped
//  - movies already in the catalog are left alone (your edits and tags survive)
//  - movies you removed in the app stay removed
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { norm, slug, autoMoods, isoDate } from '../js/picker.js';
import { seedFor, FIXES } from './mood-seed.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogFile = path.join(root, 'data', 'movies.json');
const importDir = path.join(root, 'import');

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

// CLZ lets you choose columns, so accept a few spellings for each.
const COLS = {
  title: ['title'],
  year: ['release date', 'release year', 'year', 'movie release date', 'movie release year'],
  genres: ['genres', 'genre'],
  runtime: ['runtime', 'running time', 'length'],
  director: ['director', 'directors'],
  format: ['format', 'formats'],
  distributor: ['distributor', 'studio', 'studios'],
  added: ['added date', 'date added', 'added'],
  barcode: ['barcode', 'upc', 'upc (barcode)'],
  imdb: ['imdb url', 'imdb id', 'imdb number', 'imdb'],
  seen: ['viewing date', 'seen date', 'last viewed', 'date seen', 'seen when'],
};
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function toIso(s) {
  s = String(s || '').trim();
  let m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}
function tidyFormat(f) {
  const s = String(f || '').toLowerCase();
  if (/4k|uhd/.test(s)) return '4K UHD';
  if (/blu/.test(s)) return 'Blu-ray';
  if (/dvd/.test(s)) return 'DVD';
  return String(f || '').trim();
}

export function rowsToMovies(rows) {
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const [key, names] of Object.entries(COLS)) idx[key] = head.findIndex((h) => names.includes(h));
  if (idx.title < 0) throw new Error('This CSV has no "Title" column. In CLZ, include the Title column in the export.');
  const get = (r, k) => (idx[k] >= 0 ? (r[idx[k]] || '').trim() : '');
  const out = [];
  for (const r of rows.slice(1)) {
    const clzTitle = get(r, 'title');
    if (!clzTitle) continue;
    const fix = FIXES[clzTitle] || {};
    const title = fix.title || clzTitle;
    const year = fix.year || +(/\d{4}/.exec(get(r, 'year')) || [0])[0] || null;
    const runtime = fix.runtime || parseInt(get(r, 'runtime'), 10) || 0;
    const genres = fix.genres || get(r, 'genres').split('|').map((s) => s.trim()).filter(Boolean);
    const seed = seedFor(clzTitle) || seedFor(title);
    const isSeries = fix.kind === 'series' || /:\s*(season|series|volume) \d+/i.test(title) || /complete series/i.test(title);
    const imdb = (/tt\d{6,}/.exec(get(r, 'imdb')) || [])[0];
    const mv = {
      id: slug(title, year), title, year, runtime, genres,
      director: fix.director || get(r, 'director').split('|').map((s) => s.trim()).filter(Boolean).join(', '),
      format: tidyFormat(get(r, 'format')),
      distributor: get(r, 'distributor'),
      addedAt: toIso(get(r, 'added')) || isoDate(new Date()),
      kind: isSeries ? 'series' : 'movie',
      moods: seed ? seed.moods : autoMoods(genres, [], runtime),
      vibes: seed ? seed.vibes : [],
    };
    if (get(r, 'barcode')) mv.barcode = get(r, 'barcode').replace(/\D/g, '');
    if (imdb) mv.imdbId = imdb;
    if (fix.tmdbQuery) mv.tmdbQuery = fix.tmdbQuery;
    const seen = toIso(get(r, 'seen'));
    if (seen) mv._seen = seen;
    out.push(mv);
  }
  return out;
}

export function mergeMovies(catalog, incoming) {
  const key = (m) => `${norm(m.title)}|${m.year || ''}`;
  const have = new Map(catalog.movies.map((m) => [key(m), m]));
  const ids = new Set(catalog.movies.map((m) => m.id));
  let added = 0, dupes = 0;
  for (const mv of incoming) {
    const k = key(mv);
    if (have.has(k)) {
      const old = have.get(k);
      // fill blanks only; never overwrite what is already there
      for (const f of ['format', 'distributor', 'barcode', 'director']) if (!old[f] && mv[f]) old[f] = mv[f];
      dupes++;
      continue;
    }
    let id = mv.id, n = 2;
    while (ids.has(id)) id = `${mv.id}-${n++}`;
    mv.id = id; ids.add(id); have.set(k, mv);
    catalog.movies.push(mv); added++;
  }
  catalog.movies.sort((a, b) => norm(a.title).replace(/^(the|a|an) /, '').localeCompare(norm(b.title).replace(/^(the|a|an) /, '')) || (a.year || 0) - (b.year || 0));
  return { added, dupes };
}

function main() {
  const catalog = fs.existsSync(catalogFile) ? JSON.parse(fs.readFileSync(catalogFile, 'utf8')) : { version: 1, imports: [], movies: [] };
  catalog.imports ||= [];
  const logFile = path.join(root, 'data', 'watchlog.json');
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : { version: 1, entries: [] };
  const files = fs.existsSync(importDir) ? fs.readdirSync(importDir).filter((f) => f.toLowerCase().endsWith('.csv')).sort() : [];
  let changed = false, logChanged = false;
  for (const f of files) {
    const text = fs.readFileSync(path.join(importDir, f), 'utf8');
    const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
    if (catalog.imports.some((i) => i.hash === hash)) continue;
    const incoming = rowsToMovies(parseCsv(text));
    const seen = incoming.filter((m) => m._seen).map((m) => ({ title: m.title, year: m.year, date: m._seen }));
    incoming.forEach((m) => delete m._seen);
    const { added, dupes } = mergeMovies(catalog, incoming);
    // If the export carries viewing dates, bring them into the watch log once.
    for (const s of seen) {
      const mv = catalog.movies.find((m) => norm(m.title) === norm(s.title) && (m.year || null) === (s.year || null));
      if (mv && !log.entries.some((e) => e.movieId === mv.id && e.date === s.date)) {
        log.entries.push({ id: `clz-${mv.id}-${s.date}`, movieId: mv.id, title: mv.title, date: s.date });
        logChanged = true;
      }
    }
    catalog.imports.push({ file: f, hash, date: isoDate(new Date()), rows: incoming.length, added });
    console.log(`Imported ${f}: ${incoming.length} rows, ${added} new, ${dupes} already on the shelf.`);
    changed = true;
  }
  if (!changed) { console.log('No new CLZ files to import.'); return; }
  fs.mkdirSync(path.dirname(catalogFile), { recursive: true });
  fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 1) + '\n');
  if (logChanged) fs.writeFileSync(logFile, JSON.stringify(log, null, 1) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
