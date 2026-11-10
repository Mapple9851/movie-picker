// Checks the picking rules. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deal, defaultTime, holidaysFor, nextHoliday, mulberry32, MOOD_IDS, TIMES, cleanDiscTitle, guessFormat, collectionStats, franchiseKey, timeById, autoMoods } from '../js/picker.js';

const movies = JSON.parse(fs.readFileSync(new URL('../data/movies.json', import.meta.url))).movies;
const at = (s) => new Date(s);
const run = (o) => deal({ movies, log: [], now: at('2026-11-10T20:00'), rng: mulberry32(o.seed || 1), ...o });

test('catalog: every movie has an id, a title and at least one known mood', () => {
  const ids = new Set();
  for (const m of movies) {
    assert.ok(m.title && m.id, 'missing title/id');
    assert.ok(!ids.has(m.id), `duplicate id ${m.id}`); ids.add(m.id);
    assert.ok(m.moods.length >= 1 && m.moods.every((x) => MOOD_IDS.includes(x)), `bad moods on ${m.title}`);
  }
});

test('deals 3 mood picks plus 1 wildcard, all inside the time window', () => {
  for (const mood of MOOD_IDS) for (const t of TIMES) for (let seed = 1; seed <= 15; seed++) {
    const r = run({ mood, time: t.id, seed });
    assert.equal(r.picks.length, 4, `${mood}/${t.id}`);
    assert.equal(r.picks.filter((p) => p.wildcard).length, 1);
    assert.ok(r.picks[3].wildcard, 'wildcard is dealt last');
    assert.equal(new Set(r.picks.map((p) => p.movie.id)).size, 4, 'no repeats');
    for (const p of r.picks.slice(0, 3)) {
      assert.ok(p.movie.moods.includes(mood), `${p.movie.title} is not ${mood}`);
      assert.ok(p.stretch || t.fits(p.movie.runtime), `${p.movie.title} (${p.movie.runtime}m) does not fit ${t.id}`);
    }
    assert.ok(!r.picks[3].movie.moods.includes(mood), 'wildcard is a different mood');
    assert.ok(t.fits(r.picks[3].movie.runtime), 'wildcard fits the time');
    assert.ok(r.picks.every((p) => p.movie.kind !== 'series'), 'no TV box sets');
  }
});

test('never deals two films from the same series in one hand', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = run({ mood: 'scary', time: 'mid', seed });
    const keys = r.picks.map((p) => franchiseKey(p.movie.title));
    assert.equal(new Set(keys).size, keys.length, keys.join(' | '));
  }
});

test('anything watched in the last 6 months is off the table', () => {
  const short = movies.filter((m) => m.moods.includes('funny') && timeById('short').fits(m.runtime));
  const keep = short.slice(0, 3).map((m) => m.id);
  const log = short.slice(3).map((m, i) => ({ id: 'e' + i, movieId: m.id, title: m.title, date: '2026-08-01' }));
  for (let seed = 1; seed <= 20; seed++) {
    const r = run({ mood: 'funny', time: 'short', log, seed });
    for (const p of r.picks.filter((p) => !p.stretch && !p.wildcard)) assert.ok(keep.includes(p.movie.id), `${p.movie.title} was watched recently`);
    assert.ok(r.picks.every((p) => !log.some((e) => e.movieId === p.movie.id)));
  }
});

test('favours movies not seen in a long time', () => {
  const pool = movies.filter((m) => m.moods.includes('intense') && timeById('mid').fits(m.runtime));
  const old = new Set(pool.slice(0, 8).map((m) => m.id));
  const log = pool.map((m, i) => ({ id: 'e' + i, movieId: m.id, title: m.title, date: old.has(m.id) ? '2021-01-01' : '2026-04-01' }));
  let oldHits = 0, total = 0;
  for (let seed = 1; seed <= 200; seed++) for (const p of run({ mood: 'intense', time: 'mid', log, seed }).picks.slice(0, 3)) { total++; if (old.has(p.movie.id)) oldHits++; }
  assert.ok(oldHits / total > (8 / pool.length) * 1.8, `long-unwatched share was only ${(oldHits / total).toFixed(2)}`);
});

test('October leans into Halloween titles; December brings out the holiday ones', () => {
  const share = (now, mood, time, vibe) => {
    let hit = 0, n = 0;
    for (let seed = 1; seed <= 200; seed++) for (const p of deal({ movies, log: [], mood, time, now: at(now), rng: mulberry32(seed) }).picks.slice(0, 3)) { n++; if (p.movie.vibes.includes(vibe)) hit++; }
    return hit / n;
  };
  assert.ok(share('2026-10-28T20:00', 'scary', 'mid', 'halloween') > share('2026-03-10T20:00', 'scary', 'mid', 'halloween') * 1.8);
  assert.ok(share('2026-12-20T20:00', 'cozy', 'mid', 'christmas') > 0.25);
  assert.ok(share('2026-07-20T20:00', 'cozy', 'mid', 'christmas') < 0.15);
});

test('weather nudges the picks', () => {
  const share = (weather) => { let hit = 0, n = 0; for (let seed = 1; seed <= 200; seed++) for (const p of run({ mood: 'scary', time: 'long', weather, seed, now: at('2026-02-10T20:00') }).picks.slice(0, 3)) { n++; if (p.movie.vibes.includes('snow')) hit++; } return hit / n; };
  assert.ok(share({ code: 73, tempF: 20 }) > share({ code: 0, tempF: 55 }) * 1.3);
});

test('"Deal again" brings fresh titles until the pile runs out', () => {
  const first = run({ mood: 'scary', time: 'mid', seed: 3 });
  const exclude = new Set(first.picks.map((p) => p.movie.id));
  const second = run({ mood: 'scary', time: 'mid', seed: 4, exclude });
  assert.ok(second.picks.every((p) => !exclude.has(p.movie.id)));
});

test('TV box sets only appear on binge night', () => {
  let seen = false;
  for (let seed = 1; seed <= 80; seed++) if (run({ mood: 'scary', time: 'long', binge: true, seed }).picks.some((p) => p.movie.kind === 'series')) seen = true;
  assert.ok(seen);
});

test('weeknights default to short, Friday and Saturday to longer', () => {
  assert.equal(defaultTime(at('2026-11-10T19:00')), 'short'); // Tuesday
  assert.equal(defaultTime(at('2026-11-13T19:00')), 'mid'); // Friday
  assert.equal(defaultTime(at('2026-11-14T19:00')), 'mid'); // Saturday
  assert.equal(defaultTime(at('2026-11-15T19:00')), 'short'); // Sunday
});

test('holiday calendar', () => {
  const h = Object.fromEntries(holidaysFor(2026).map((x) => [x.id, x.date]));
  assert.equal(h.thanksgiving.getDate(), 26); assert.equal(h.easter.getMonth(), 3); assert.equal(h.easter.getDate(), 5);
  assert.equal(h.memorial.getDate(), 25); assert.equal(h.labor.getDate(), 7);
  const n = nextHoliday(at('2026-11-10T12:00')); assert.equal(n.id, 'thanksgiving'); assert.equal(n.days, 16);
  assert.equal(nextHoliday(at('2026-12-28T12:00')).id, 'newyear');
});

test('barcode titles are cleaned up', () => {
  assert.equal(cleanDiscTitle('Re-Animator [4K Ultra HD + Blu-ray] (Limited Edition)'), 'Re-Animator');
  assert.equal(cleanDiscTitle('The Thing (4K UHD) - Collector\'s Edition'), 'The Thing');
  assert.equal(cleanDiscTitle('Jaws 4K Ultra HD Blu-ray Digital'), 'Jaws');
  assert.equal(guessFormat('Jaws 4K Ultra HD + Blu-ray'), '4K UHD'); assert.equal(guessFormat('Alien (Blu-ray)'), 'Blu-ray'); assert.equal(guessFormat('Demons DVD'), 'DVD');
  assert.deepEqual(autoMoods(['Horror', 'Comedy'], [], 90), ['scary', 'funny']);
});

test('stats: most watched, longest unwatched, dusty shelf', () => {
  const [a, b, c] = movies;
  const log = [{ id: 1, movieId: a.id, date: '2023-01-05' }, { id: 2, movieId: a.id, date: '2024-02-05' }, { id: 3, movieId: b.id, date: '2026-10-01' }, { id: 4, movieId: c.id, date: '2020-01-01', removed: true }];
  const s = collectionStats(movies, log, at('2026-11-10T12:00'));
  assert.equal(s.total, movies.length); assert.equal(s.watchedCount, 2);
  assert.equal(s.mostWatched[0].movie.id, a.id); assert.equal(s.mostWatched[0].count, 2);
  assert.equal(s.longestUnwatched[0].movie.id, a.id);
  assert.deepEqual(s.dusty.map((d) => d.movie.id), [a.id]);
});
