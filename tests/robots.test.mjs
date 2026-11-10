// Checks the import and catalog robots, using stand-in APIs (no real keys needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCsv, rowsToMovies, mergeMovies } from '../scripts/import-clz.mjs';
import { chooseMatch } from '../scripts/enrich.mjs';
import { applyMovieOps, applyLogOps } from '../js/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const csv = fs.readFileSync(path.join(here, '..', 'import', 'clz-export-2026-11-10.csv'), 'utf8');

test('CLZ import: reads the export, fixes the odd rows, and is safe to repeat', () => {
  const incoming = rowsToMovies(parseCsv(csv));
  assert.equal(incoming.length, 228);
  const cat = { movies: [] };
  assert.equal(mergeMovies(cat, incoming).added, 227); // A Fistful of Dollars is listed twice
  assert.equal(mergeMovies(cat, rowsToMovies(parseCsv(csv))).added, 0);
  const find = (t) => cat.movies.find((m) => m.title === t);
  assert.equal(find('Vampires').year, 1998);
  assert.equal(find('The Good, the Bad and the Ugly').runtime, 178);
  assert.deepEqual(find('Aladdin').genres.slice(0, 2), ['Adventure', 'Animation']);
  assert.equal(find('Stranger Things: Season 2').kind, 'series');
  assert.equal(cat.movies.filter((m) => m.title === 'Pet Sematary').length, 2);
  assert.equal(find('Enter the Void').director, 'Gaspar Noé');
});

test('CLZ import: removed movies stay removed, edits survive, other column layouts work', () => {
  const cat = { movies: [] };
  mergeMovies(cat, rowsToMovies(parseCsv(csv)));
  cat.movies.find((m) => m.title === 'Troll 2').removed = true;
  cat.movies.find((m) => m.title === 'Jaws').moods = ['cozy'];
  const other = 'Title,Release Year,Format,Barcode,IMDb Url,Genre\n"Jaws",1975,Blu-ray,0123,https://www.imdb.com/title/tt0073195/,Thriller\n"Troll 2",1990,DVD,,,Horror\n"Heat",1995,4K UHD,88392,,Crime | Drama\n';
  const r = mergeMovies(cat, rowsToMovies(parseCsv(other)));
  assert.equal(r.added, 1);
  assert.ok(cat.movies.find((m) => m.title === 'Troll 2').removed);
  assert.deepEqual(cat.movies.find((m) => m.title === 'Jaws').moods, ['cozy']);
  assert.equal(cat.movies.find((m) => m.title === 'Jaws').barcode, '0123');
  assert.equal(cat.movies.find((m) => m.title === 'Heat').barcode, '88392');
});

test('matching never guesses', () => {
  const r = (title, year) => ({ title, original_title: title, release_date: year ? `${year}-01-01` : '', popularity: 1 });
  assert.equal(chooseMatch([r('Pet Sematary', 2019), r('Pet Sematary', 1989)], 'Pet Sematary', 1989).release_date, '1989-01-01');
  assert.equal(chooseMatch([r('Halloween', 2018), r('Halloween', 2007)], 'Halloween', 1978), null);
  assert.equal(chooseMatch([r('Something Else Entirely', 1985)], 'Demons', 1985), null);
  assert.equal(chooseMatch([r('Howling II: Stirba - Werewolf Bitch', 1985)], 'Howling II: ... Your Sister Is a Werewolf', 1985).release_date, '1985-01-01');
  assert.equal(chooseMatch([r('Fanatic', 1965)], 'Fanatic', 1965, true).title, 'Fanatic');
  assert.equal(chooseMatch([{ ...r('Heat', 1995), popularity: 50 }, { ...r('Heat', 1986), popularity: 3 }], 'Heat', null).release_date, '1995-01-01');
});

test('catalog robot: fills posters, summaries and ratings; flags what it cannot match', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-'));
  const file = path.join(dir, 'movies.json');
  const base = { runtime: 0, genres: [], director: '', format: '4K UHD', kind: 'movie', moods: [], vibes: [] };
  fs.writeFileSync(file, JSON.stringify({ version: 1, movies: [
    { ...base, id: 'the-thing-1982', title: 'The Thing', year: 1982, moods: ['scary'] },
    { ...base, id: 'die', title: 'Die! Die! My Darling!', year: 1965, tmdbQuery: 'Fanatic', moods: ['scary'] },
    { ...base, id: 'pet-1989', title: 'Pet Sematary', year: 1989, moods: ['scary'] },
    { ...base, id: 'st2', title: 'Stranger Things: Season 2', year: 2017, kind: 'series', moods: ['scary'] },
    { ...base, id: 'nope', title: 'Totally Unknown Film', year: 1999, moods: ['weird'] },
    { ...base, id: 'disc-111', title: 'Scanned disc 111', year: null, barcode: '111', titlePending: true, format: '' },
    { ...base, id: 'disc-222', title: 'Scanned disc 222', year: null, barcode: '222', titlePending: true },
    { ...base, id: 'gone', title: 'Jaws 2', year: 1978, removed: true },
  ] }));
  const run = (env) => execFileSync(process.execPath, ['--import', path.join(here, 'mock-apis.mjs'), path.join(here, '..', 'scripts', 'enrich.mjs')], { env: { ...process.env, CATALOG_FILE: file, GITHUB_STEP_SUMMARY: '', ...env }, encoding: 'utf8' });
  const out = run({ TMDB_API_KEY: 'k', OMDB_API_KEY: 'k' });
  const m = Object.fromEntries(JSON.parse(fs.readFileSync(file, 'utf8')).movies.map((x) => [x.id, x]));
  assert.equal(m['the-thing-1982'].poster, 'https://image.tmdb.org/t/p/w500/thing.jpg');
  assert.equal(m['the-thing-1982'].imdbRating, 8.2); assert.equal(m['the-thing-1982'].imdbId, 'tt0084787');
  assert.match(m['the-thing-1982'].summary, /Antarctic/); assert.equal(m['the-thing-1982'].runtime, 109);
  assert.deepEqual(m['the-thing-1982'].moods, ['scary']); assert.ok(m['the-thing-1982'].vibes.includes('snow'));
  assert.equal(m.die.imdbId, 'tt0059163'); assert.equal(m.die.title, 'Die! Die! My Darling!');
  assert.equal(m['pet-1989'].imdbId, 'tt0098084');
  assert.equal(m.st2.poster, 'https://image.tmdb.org/t/p/w500/st-s2.jpg'); assert.equal(m.st2.imdbRating, 8.6); assert.equal(m.st2.summary, 'Season two overview.');
  assert.equal(m.nope.needsMatch, true); assert.equal(m.nope.poster, undefined);
  assert.equal(m['disc-111'].title, 'Jaws'); assert.equal(m['disc-111'].format, '4K UHD'); assert.equal(m['disc-111'].imdbRating, 8.1); assert.deepEqual(m['disc-111'].moods, ['intense']);
  assert.equal(m['disc-222'].needsMatch, true);
  assert.equal(m.gone.poster, undefined);
  assert.match(out, /Needs a hand \(2\)/);
  // Second run the same month: nothing left to do, file untouched.
  const before = fs.readFileSync(file, 'utf8');
  assert.match(run({ TMDB_API_KEY: 'k', OMDB_API_KEY: 'k' }), /Looked up 0 title/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('catalog robot: works with only an OMDb key, and says so when there are no keys', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-'));
  const file = path.join(dir, 'movies.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, movies: [{ id: 'jaws', title: 'Jaws', year: 1975, runtime: 124, genres: ['Thriller'], moods: ['intense'], vibes: ['summer'], kind: 'movie' }] }));
  const run = (env) => execFileSync(process.execPath, ['--import', path.join(here, 'mock-apis.mjs'), path.join(here, '..', 'scripts', 'enrich.mjs')], { env: { ...process.env, CATALOG_FILE: file, GITHUB_STEP_SUMMARY: '', TMDB_API_KEY: '', OMDB_API_KEY: '', ...env }, encoding: 'utf8' });
  assert.match(run({}), /No API keys found yet/);
  run({ OMDB_API_KEY: 'k' });
  let j = JSON.parse(fs.readFileSync(file, 'utf8')).movies[0];
  assert.equal(j.imdbRating, 8.1); assert.equal(j.poster, 'https://img.example/jaws.jpg'); assert.equal(j.summary, 'Shark.');
  run({ OMDB_API_KEY: 'k', TMDB_API_KEY: 'k' }); // TMDB key added later: upgrades the poster
  j = JSON.parse(fs.readFileSync(file, 'utf8')).movies[0];
  assert.equal(j.poster, 'https://image.tmdb.org/t/p/w500/jaws.jpg'); assert.match(j.summary, /shark/i);
});

test('phone changes layer cleanly over the repo copy', () => {
  const movies = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const ops = [{ t: 'add', movie: { id: 'c', title: 'C' } }, { t: 'add', movie: { id: 'c', title: 'C again' } }, { t: 'edit', movieId: 'a', patch: { format: 'DVD' } }, { t: 'remove', movieId: 'b' }];
  const out = applyMovieOps(movies, ops);
  assert.equal(out.length, 3); assert.equal(out[0].format, 'DVD'); assert.equal(out[1].removed, true); assert.equal(out[2].title, 'C');
  assert.equal(movies[0].format, undefined, 'original untouched');
  const log = applyLogOps([{ id: 'x', movieId: 'a', date: '2026-01-01' }], [{ t: 'watch', entry: { id: 'y', movieId: 'a', date: '2026-11-10' } }, { t: 'watch', entry: { id: 'y', movieId: 'a', date: '2026-11-10' } }, { t: 'unwatch', entryId: 'x' }]);
  assert.equal(log.length, 2); assert.equal(log[0].removed, true);
});
