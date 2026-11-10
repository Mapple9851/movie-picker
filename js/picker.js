// Neon Shelf: the picking rules. Pure functions only, so the same file runs
// in the phone app and in the robots/tests on GitHub.

export const MOODS = [
  { id: 'cozy', label: 'Cozy' },
  { id: 'scary', label: 'Scary' },
  { id: 'intense', label: 'Intense' },
  { id: 'funny', label: 'Funny' },
  { id: 'epic', label: 'Epic' },
  { id: 'weird', label: 'Weird' },
  { id: 'cult', label: 'Cult trash' },
  { id: 'deep', label: 'Thoughtful' },
];
export const MOOD_IDS = MOODS.map((m) => m.id);
export const moodLabel = (id) => (MOODS.find((m) => m.id === id) || { label: 'Surprise me' }).label;

export const TIMES = [
  { id: 'short', label: 'Under 90', long: 'under 90 min', fits: (r) => r > 0 && r <= 90 },
  { id: 'mid', label: '90 – 2 hrs', long: '90 min to 2 hrs', fits: (r) => r >= 90 && r <= 120 },
  { id: 'long', label: '2 hrs +', long: 'over 2 hrs', fits: (r) => r > 120 },
];
export const timeById = (id) => TIMES.find((t) => t.id === id) || TIMES[0];

export const RECENT_DAYS = 183; // "watched in the last 6 months" = off the table
const DAY = 86400000;

/* ---------- small helpers ---------- */

export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export function normNoArticle(s) {
  return norm(s).replace(/^(the|a|an) /, '');
}
export function slug(title, year) {
  const base = norm(title).replace(/ /g, '-').slice(0, 60) || 'untitled';
  return year ? `${base}-${year}` : base;
}
// "A Nightmare on Elm Street 3: Dream Warriors" -> "nightmare on elm street"
export function franchiseKey(title) {
  let t = String(title || '').split(':')[0];
  t = normNoArticle(t)
    .replace(/\b(part )?(\d+|ii|iii|iv|v|vi)\b.*$/, '')
    .trim();
  return t || normNoArticle(title);
}
export function isoDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
export function daysBetween(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / DAY);
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- watch history ---------- */

// log entries: { id, movieId, title, date:'YYYY-MM-DD', removed? }
export function watchStats(entries) {
  const last = new Map(), count = new Map();
  for (const e of entries || []) {
    if (!e || e.removed || !e.movieId || !e.date) continue;
    count.set(e.movieId, (count.get(e.movieId) || 0) + 1);
    if (!last.has(e.movieId) || e.date > last.get(e.movieId)) last.set(e.movieId, e.date);
  }
  return { last, count };
}
export function agoText(dateStr, now) {
  const d = parseDate(dateStr);
  if (!d) return 'Never logged';
  const days = daysBetween(d, now);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const when = `${names[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  let ago;
  if (days <= 0) ago = 'today';
  else if (days === 1) ago = 'yesterday';
  else if (days < 60) ago = `${days} days ago`;
  else if (days < 730) ago = `${Math.round(days / 30.4)} months ago`;
  else ago = `${Math.floor(days / 365)} years ago`;
  return `${when} (${ago})`;
}

/* ---------- calendar ---------- */

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
function nthWeekday(y, month, weekday, n) {
  const first = new Date(y, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(y, month, 1 + offset + (n - 1) * 7);
}
function lastWeekday(y, month, weekday) {
  const last = new Date(y, month + 1, 0);
  return new Date(y, month, last.getDate() - ((last.getDay() - weekday + 7) % 7));
}
export function holidaysFor(y) {
  return [
    { id: 'newyear', name: "New Year's", short: 'NEW YEAR', date: new Date(y, 0, 1) },
    { id: 'valentine', name: "Valentine's Day", short: 'VALENTINE', date: new Date(y, 1, 14) },
    { id: 'stpat', name: "St. Patrick's Day", short: 'ST PAT', date: new Date(y, 2, 17) },
    { id: 'easter', name: 'Easter', short: 'EASTER', date: easter(y) },
    { id: 'memorial', name: 'Memorial Day', short: 'MEMORIAL', date: lastWeekday(y, 4, 1) },
    { id: 'july4', name: 'the 4th of July', short: 'JULY 4', date: new Date(y, 6, 4) },
    { id: 'labor', name: 'Labor Day', short: 'LABOR DAY', date: nthWeekday(y, 8, 1, 1) },
    { id: 'halloween', name: 'Halloween', short: 'HALLOWEEN', date: new Date(y, 9, 31) },
    { id: 'thanksgiving', name: 'Thanksgiving', short: 'T-GIVING', date: nthWeekday(y, 10, 4, 4) },
    { id: 'christmas', name: 'Christmas', short: 'XMAS', date: new Date(y, 11, 25) },
  ];
}
export function nextHoliday(now) {
  const all = [...holidaysFor(now.getFullYear()), ...holidaysFor(now.getFullYear() + 1)];
  for (const h of all.sort((a, b) => a.date - b.date)) {
    const days = daysBetween(now, h.date);
    if (days >= 0) return { ...h, days };
  }
  return null;
}
function daysTo(now, id) {
  const all = [...holidaysFor(now.getFullYear()), ...holidaysFor(now.getFullYear() + 1)].filter((h) => h.id === id);
  for (const h of all) { const d = daysBetween(now, h.date); if (d >= 0) return d; }
  return 999;
}
export function defaultTime(now) {
  const d = now.getDay(); // Fri + Sat nights get the longer default
  return d === 5 || d === 6 ? 'mid' : 'short';
}

/* ---------- weather ---------- */

// Open-Meteo "weather_code" (WMO) -> plain category
export function weatherKind(code) {
  if (code == null) return null;
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 2) return 'cloudy';
  return 'clear';
}
export const WEATHER_WORD = { storm: 'STORM', snow: 'SNOW', rain: 'RAIN', fog: 'FOG', cloudy: 'CLOUDY', clear: 'CLEAR' };

/* ---------- reading the room ---------- */

// Returns a list of "boost rules" for tonight. Each rule: { why, test(movie) -> points }
export function tonightRules(now, weather) {
  const rules = [];
  const m = now.getMonth(), day = now.getDate();
  const has = (movie, list, v) => (movie[list] || []).includes(v);
  const add = (why, test) => rules.push({ why, test });

  // Season + holidays
  const toHalloween = daysTo(now, 'halloween');
  if (m === 9 || (m === 8 && day >= 20)) {
    const late = m === 9 && day >= 20;
    add(m === 9 ? (toHalloween === 0 ? "It's Halloween" : `${toHalloween} days to Halloween`) : 'Spooky season is close',
      (mv) => (has(mv, 'vibes', 'halloween') ? (late ? 7 : 4) : 0) + (has(mv, 'moods', 'scary') ? (m === 9 ? (late ? 4 : 3) : 1.5) : 0));
  }
  const toXmas = daysTo(now, 'christmas');
  const toThanks = daysTo(now, 'thanksgiving');
  if (m === 11 && day <= 25) {
    add(toXmas === 0 ? "It's Christmas" : `${toXmas} days to Christmas`,
      (mv) => (has(mv, 'vibes', 'christmas') ? (day >= 15 ? 9 : 6) : 0) + (has(mv, 'moods', 'cozy') ? 1.5 : 0));
  } else if (m === 10 && toThanks > 300) { // the days right after Thanksgiving
    add('Holiday season is here', (mv) => (has(mv, 'vibes', 'christmas') ? 3 : 0));
  }
  if (toThanks <= 4) {
    add(toThanks === 0 ? "It's Thanksgiving" : 'Thanksgiving week',
      (mv) => (has(mv, 'moods', 'cozy') ? 2 : 0) + (has(mv, 'moods', 'epic') ? 1 : 0));
  }
  if (m === 1 && day >= 8 && day <= 14) {
    add("Valentine's week", (mv) => ((mv.genres || []).includes('Romance') || has(mv, 'vibes', 'romance') ? 4 : 0));
  }
  const toEaster = daysTo(now, 'easter');
  if (toEaster <= 6) add('Easter week', (mv) => (has(mv, 'vibes', 'easter') ? 6 : 0));
  if (m >= 5 && m <= 7) {
    const fourth = m === 6 && day <= 4;
    add(fourth ? '4th of July week' : 'Summer night', (mv) => (has(mv, 'vibes', 'summer') ? (fourth ? 4 : 2) : 0));
  }
  if (m === 11 || m <= 1) add('Deep winter', (mv) => (has(mv, 'vibes', 'snow') ? 1.5 : 0));
  if (now.getDay() === 5 && day === 13) add('Friday the 13th', (mv) => (has(mv, 'moods', 'scary') ? 3 : 0));

  // Weather
  if (weather) {
    const kind = weatherKind(weather.code);
    const t = weather.tempF;
    if (kind === 'rain') add('Rain outside', (mv) => (has(mv, 'vibes', 'rain') ? 3 : 0) + (has(mv, 'moods', 'cozy') ? 1.5 : 0) + (has(mv, 'moods', 'deep') ? 1 : 0));
    if (kind === 'storm') add('Thunderstorm outside', (mv) => (has(mv, 'moods', 'scary') ? 3 : 0) + (has(mv, 'vibes', 'rain') ? 2 : 0));
    if (kind === 'snow') add('Snowing outside', (mv) => (has(mv, 'vibes', 'snow') ? 5 : 0) + (has(mv, 'moods', 'cozy') ? 2 : 0));
    if (kind === 'fog') add('Foggy night', (mv) => (has(mv, 'moods', 'scary') ? 2 : 0));
    if (typeof t === 'number' && t >= 90) add(`${Math.round(t)}° heat`, (mv) => (has(mv, 'vibes', 'heat') ? 3 : 0) + (has(mv, 'vibes', 'summer') ? 2 : 0));
    if (typeof t === 'number' && t <= 25 && kind !== 'snow') add(`${Math.round(t)}° and freezing`, (mv) => (has(mv, 'vibes', 'snow') ? 3 : 0) + (has(mv, 'moods', 'cozy') ? 1 : 0));
  }
  return rules;
}
function roomBoost(movie, rules) {
  let score = 0; const why = [];
  for (const r of rules) { const p = r.test(movie); if (p > 0) { score += p; why.push(r.why); } }
  return { score, why };
}

/* ---------- the deal ---------- */

// opts: { movies, log, mood (id or null = surprise), time, now, weather, binge, exclude:Set, rng }
export function deal(opts) {
  const now = opts.now || new Date();
  const rng = opts.rng || Math.random;
  const time = timeById(opts.time);
  const mood = MOOD_IDS.includes(opts.mood) ? opts.mood : null;
  const exclude = opts.exclude || new Set();
  const { last } = watchStats(opts.log);
  const rules = tonightRules(now, opts.weather);

  const info = new Map();
  for (const mv of opts.movies) {
    if (mv.removed) continue;
    if (mv.kind === 'series' && !opts.binge) continue;
    const lw = last.get(mv.id) || null;
    const days = lw ? daysBetween(parseDate(lw), now) : null;
    if (days !== null && days < RECENT_DAYS) continue; // watched in the last 6 months
    const years = days === null ? 3 : days / 365;
    const room = roomBoost(mv, rules);
    info.set(mv.id, {
      movie: mv, lastWatched: lw,
      stale: Math.min(6, years * 2),
      room,
      fits: time.fits(mv.runtime || 0),
      match: mood ? (mv.moods || []).includes(mood) : true,
      primary: mood ? (mv.moods || [])[0] === mood : false,
    });
  }
  const all = [...info.values()];
  const picks = [];
  const usedIds = new Set(), usedFranchise = new Set();
  const take = (c, extra) => {
    picks.push({ ...extra, movie: c.movie, lastWatched: c.lastWatched, reasons: reasonsFor(c, mood, time, extra) });
    usedIds.add(c.movie.id); usedFranchise.add(franchiseKey(c.movie.title));
  };
  const free = (c) => !usedIds.has(c.movie.id) && !usedFranchise.has(franchiseKey(c.movie.title));
  const rank = (list, scoreFn) => list.map((c) => ({ c, s: scoreFn(c) })).sort((a, b) => b.s - a.s).map((x) => x.c);
  const moodScore = (c) => (mood ? 10 + (c.primary ? 2 : 0) : 0) + c.stale + c.room.score + rng() * 5;

  // 3 mood picks: fresh ones first, then ones already dealt this session
  let pool = all.filter((c) => c.fits && c.match);
  for (const c of [...rank(pool.filter((c) => !exclude.has(c.movie.id)), moodScore), ...rank(pool.filter((c) => exclude.has(c.movie.id)), moodScore)]) {
    if (picks.length >= 3) break;
    if (free(c)) take(c, { wildcard: false });
  }
  // Not enough in this time window: borrow the right mood from another window
  let note = null;
  if (picks.length < 3 && mood) {
    const stretch = rank(all.filter((c) => !c.fits && c.match && (c.movie.runtime || 0) > 0), (c) => moodScore(c) - Math.abs((c.movie.runtime || 0) - (time.id === 'short' ? 90 : time.id === 'mid' ? 105 : 130)) / 6);
    for (const c of stretch) { if (picks.length >= 3) break; if (free(c)) take(c, { wildcard: false, stretch: true }); }
    note = `Only a few ${moodLabel(mood).toLowerCase()} picks fit ${time.long}, so some run a little outside it.`;
  }
  // Wildcard: a different mood that still fits the time, favouring the dustiest
  const wildScore = (c) => c.stale * 1.5 + c.room.score * 1.5 + rng() * 6;
  let wild = rank(all.filter((c) => c.fits && (mood ? !c.match : true) && free(c) && !exclude.has(c.movie.id)), wildScore)[0]
    || rank(all.filter((c) => c.fits && free(c)), wildScore)[0]
    || rank(all.filter((c) => free(c) && (c.movie.runtime || 0) > 0), wildScore)[0];
  if (wild) take(wild, { wildcard: true });

  if (!picks.length) note = 'Nothing on the shelf fits. Try another mood or a longer time window.';
  return { picks, note, rules: rules.map((r) => r.why), mood, time: time.id };
}

function reasonsFor(c, mood, time, extra) {
  const out = [];
  if (extra.wildcard) out.push(mood ? `Wildcard: not ${moodLabel(mood).toLowerCase()}, but worth a look` : 'Wildcard from the far end of the shelf');
  else if (mood) out.push(`Matches ${moodLabel(mood)}`);
  if (extra.stretch) out.push(`Runs outside your ${time.long} window`);
  else if (c.fits) out.push(`Fits ${time.long}`);
  for (const w of c.room.why) out.push(w);
  out.push(c.lastWatched ? "You haven't played it in a while" : 'Never logged as watched');
  return out;
}

/* ---------- stats ---------- */

export function collectionStats(movies, log, now) {
  const live = movies.filter((m) => !m.removed);
  const { last, count } = watchStats(log);
  const byId = new Map(live.map((m) => [m.id, m]));
  const watched = live.filter((m) => last.has(m.id));
  const formats = {};
  for (const m of live) { const f = m.format || 'Unknown'; formats[f] = (formats[f] || 0) + 1; }
  const mostWatched = [...count.entries()].filter(([id]) => byId.has(id)).sort((a, b) => b[1] - a[1] || (last.get(b[0]) > last.get(a[0]) ? 1 : -1))
    .slice(0, 5).map(([id, n]) => ({ movie: byId.get(id), count: n }));
  const longestUnwatched = watched.map((m) => ({ movie: m, date: last.get(m.id), days: daysBetween(parseDate(last.get(m.id)), now) }))
    .sort((a, b) => b.days - a.days).slice(0, 5);
  // Dusty: last played 2+ years ago, or owned 1+ year and never logged
  const dusty = live.map((m) => {
    const lw = last.get(m.id);
    if (lw) { const d = daysBetween(parseDate(lw), now); return d >= 730 ? { movie: m, days: d, never: false } : null; }
    const added = parseDate(m.addedAt);
    const d = added ? daysBetween(added, now) : 0;
    return d >= 365 ? { movie: m, days: d, never: true } : null;
  }).filter(Boolean).sort((a, b) => b.days - a.days);
  const minutes = (log || []).filter((e) => !e.removed && byId.has(e.movieId)).reduce((s, e) => s + (byId.get(e.movieId).runtime || 0), 0);
  return { total: live.length, watchedCount: watched.length, neverLogged: live.length - watched.length, formats, mostWatched, longestUnwatched, dusty, minutes, nights: (log || []).filter((e) => !e.removed).length };
}

/* ---------- adding discs ---------- */

// "Re-Animator [4K Ultra HD + Blu-ray] (Limited Edition)" -> "Re-Animator"
export function cleanDiscTitle(raw) {
  let t = String(raw || '');
  t = t.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ');
  t = t.replace(/\b(4k|uhd|ultra hd|blu-?ray|bluray|dvd|digital( copy| hd| code)?|steelbook|collector'?s edition|limited edition|special edition|anniversary edition|remastered|widescreen|full ?screen|combo pack|slipcover|import|region (free|a|b|1|2))\b/gi, ' ');
  t = t.replace(/\s[-–+/|,:]+\s*$/g, ' ').replace(/[\s+/|,-]+$/g, '').replace(/^\s*[-–+/|,:]+/, '');
  return t.replace(/\s{2,}/g, ' ').trim();
}
export function guessFormat(raw) {
  const s = String(raw || '').toLowerCase();
  if (/4k|uhd|ultra hd/.test(s)) return '4K UHD';
  if (/blu-?ray/.test(s)) return 'Blu-ray';
  if (/\bdvd\b/.test(s)) return 'DVD';
  return '';
}
// Rough mood guess for new purchases, from genres + TMDB keywords. Editable in the app.
export function autoMoods(genres, keywords, runtime) {
  const g = new Set((genres || []).map((x) => String(x).toLowerCase()));
  const k = (keywords || []).join(' ').toLowerCase();
  const out = [];
  const put = (m) => { if (!out.includes(m)) out.push(m); };
  if (g.has('horror')) put('scary');
  if (g.has('comedy')) put('funny');
  if (g.has('family') || g.has('animation') || g.has('romance') || g.has('musical') || g.has('music')) put('cozy');
  if (g.has('thriller') || g.has('crime') || g.has('action') || g.has('war')) put('intense');
  if ((g.has('adventure') || g.has('fantasy') || g.has('history') || g.has('western') || g.has('war')) && (runtime || 0) >= 125) put('epic');
  if (/surreal|cult film|body horror|experimental|absurd|psychedelic/.test(k)) put('weird');
  if (/b movie|cult film|troma|exploitation|splatter/.test(k)) put('cult');
  if (!out.length || (g.has('drama') && out.length === 0)) put('deep');
  if (g.has('drama') && g.size === 1) put('deep');
  return out.slice(0, 3);
}
export function autoVibes(keywords, genres) {
  const k = (keywords || []).join(' ').toLowerCase();
  const v = [];
  if (/halloween/.test(k)) v.push('halloween');
  if (/christmas|holiday season/.test(k)) v.push('christmas');
  if (/snow|blizzard|winter|arctic|antarctic/.test(k)) v.push('snow');
  if (/summer|beach|vacation/.test(k)) v.push('summer');
  if (/desert|heat wave/.test(k)) v.push('heat');
  if (/neo-noir|film noir|rain/.test(k)) v.push('rain');
  if ((genres || []).includes('Romance')) v.push('romance');
  return v;
}
