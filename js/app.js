// Neon Shelf: the screens.
import {
  MOODS, TIMES, moodLabel, timeById, defaultTime, deal, watchStats, agoText, nextHoliday, weatherKind, WEATHER_WORD,
  collectionStats, isoDate, parseDate, norm, slug, cleanDiscTitle, guessFormat, mulberry32,
} from './picker.js';
import { createStore } from './store.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const store = createStore();

// For tests and screenshots: ?now=2026-10-30T20:00 pins the clock, ?seed=7 pins the shuffle.
const fixedNow = params.get('now') ? new Date(params.get('now')) : null;
const now = () => (fixedNow && !isNaN(fixedNow) ? new Date(fixedNow) : new Date());
const rng = params.get('seed') ? mulberry32(+params.get('seed')) : Math.random;

const ui = {
  view: 'tonight', mood: null, time: defaultTime(now()), timeTouched: false,
  weather: null, result: null, dealtIds: new Set(), detailId: null, editId: null, lastLogId: null,
};

/* ---------- formatting ---------- */
const fmtRuntime = (min) => (!min ? '' : min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`);
function fmtBadge(format) {
  const f = format || '';
  const cls = /4k/i.test(f) ? '' : /blu/i.test(f) ? 'bd' : /dvd/i.test(f) ? 'dvd' : 'none';
  const label = /4k/i.test(f) ? '4K' : f || 'Format?';
  return `<span class="fmt ${cls}">${esc(label)}</span>`;
}
function fmtAsOf(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(s || '');
  return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${m[1]}` : '';
}
function shortSeen(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return 'Never logged';
  return `Last: ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;
}
function shortSummary(mv) {
  const s = (mv.summary || '').trim();
  if (!s) return mv.director ? `Directed by ${mv.director}.` : '';
  if (s.length <= 170) return s;
  const cut = s.slice(0, 170); const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return stop > 70 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
function posterHTML(mv) {
  // Stand-in tape cover: each title gets its own tint and light position so a shelf of them isn't uniform.
  let h = 0; for (const ch of mv.id || mv.title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const look = `--hue:${(h % 70) - 35}deg;--gx:${20 + (h >> 3) % 60}%;--gy:${18 + (h >> 7) % 30}%;--gw:${60 + (h >> 11) % 50}%;--gh:${38 + (h >> 13) % 30}%`;
  const cover = `<div class="cover ${esc((mv.moods || [])[0] || 'deep')}" style="${look}"><b>${esc(mv.title)}</b><u>${esc(mv.year || '')}</u></div>`;
  if (!mv.poster) return cover;
  return `${cover}<img src="${esc(mv.poster)}" alt="Poster for ${esc(mv.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" crossorigin="anonymous" style="position:absolute;inset:0">`;
}
function tagsHTML(mv, max) {
  const moods = (mv.moods || []).map((m) => `<li class="mood-tag">${esc(moodLabel(m).toLowerCase())}</li>`);
  const genres = (mv.genres || []).map((g) => `<li>${esc(g.toLowerCase())}</li>`);
  return `<ul class="tags">${[...moods, ...genres].slice(0, max).join('')}</ul>`;
}
// Posters throw their own colour onto the shelf. Falls back quietly if the image can't be read.
function wirePosters(rootEl) {
  rootEl.querySelectorAll('.case img').forEach((img) => {
    img.addEventListener('error', () => {
      if (img.crossOrigin) { const again = img.cloneNode(); again.removeAttribute('crossorigin'); again.addEventListener('error', () => again.remove()); img.replaceWith(again); }
      else img.remove();
    });
    img.addEventListener('load', () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 6;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 6, 6);
        const d = g.getImageData(0, 0, 6, 6).data; let r = 0, gr = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4, boost = (v) => Math.min(255, Math.round((v / n) * 1.5 + 40));
        img.closest('.pick, .detail')?.style.setProperty('--glow', `rgba(${boost(r)},${boost(gr)},${boost(b)},.55)`);
      } catch { /* cross-origin image without permission: keep the default glow */ }
    });
  });
}

/* ---------- top read-out ---------- */
function renderOsd() {
  const d = now();
  $('osdDate').textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '').toUpperCase();
  const w = ui.weather;
  $('osdWeather').textContent = w ? `${Math.round(w.tempF)}° ${WEATHER_WORD[weatherKind(w.code)] || ''}` : '';
  const h = nextHoliday(d);
  $('osdHoliday').textContent = h ? (h.days === 0 ? `${h.short} TODAY` : `${h.short} ${h.days}D`) : '';
}
async function loadWeather() {
  const c = store.state.config || {};
  if (params.get('weather')) { const [code, t] = params.get('weather').split(','); ui.weather = { code: +code, tempF: +t }; renderOsd(); return; }
  if (typeof c.lat !== 'number') return;
  try {
    const cached = JSON.parse(sessionStorage.getItem('neonShelf.weather') || 'null');
    if (cached && Date.now() - cached.at < 30 * 60000) { ui.weather = cached.w; renderOsd(); return; }
  } catch { /* ignore */ }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=${encodeURIComponent(c.tz || 'auto')}`;
    const j = await (await fetch(url)).json();
    if (j.current) {
      ui.weather = { tempF: j.current.temperature_2m, code: j.current.weather_code };
      try { sessionStorage.setItem('neonShelf.weather', JSON.stringify({ at: Date.now(), w: ui.weather })); } catch { /* ignore */ }
      renderOsd();
    }
  } catch { /* no weather tonight: the picker simply skips that rule */ }
}

/* ---------- chooser ---------- */
function renderChooser() {
  const movies = store.movies().filter((m) => m.kind !== 'series' || store.state.prefs.binge);
  const count = (id) => movies.filter((m) => (m.moods || []).includes(id)).length;
  $('moods').innerHTML = MOODS.map((m) =>
    `<button type="button" class="mood" role="radio" data-mood="${m.id}" aria-checked="${ui.mood === m.id}">${esc(m.label)} <i>${count(m.id)}</i></button>`).join('') +
    `<button type="button" class="mood wide" role="radio" data-mood="" aria-checked="${!ui.mood}">Surprise me</button>`;
  $('times').innerHTML = TIMES.map((t) => `<button type="button" role="radio" data-time="${t.id}" aria-checked="${ui.time === t.id}">${esc(t.label)}</button>`).join('');
  const day = now().getDay();
  $('timeHint').textContent = ui.timeTouched ? '' : (day === 5 || day === 6 ? 'WEEKEND: LONGER ONES PRE-SELECTED' : 'WEEKNIGHT: SHORT ONES PRE-SELECTED');
}

/* ---------- dealing ---------- */
function runDeal() {
  const movies = store.movies();
  ui.result = deal({ movies, log: store.log(), mood: ui.mood, time: ui.time, now: now(), weather: ui.weather, binge: store.state.prefs.binge, exclude: ui.dealtIds, rng });
  const fresh = ui.result.picks.filter((p) => !ui.dealtIds.has(p.movie.id)).length;
  if (!fresh) ui.dealtIds = new Set(); // been through the whole pile: start over
  ui.result.picks.forEach((p) => ui.dealtIds.add(p.movie.id));
  renderDealt(true);
  window.scrollTo({ top: 0 });
}
function pickHTML(p, i) {
  const mv = p.movie;
  const meta = [mv.year, fmtRuntime(mv.runtime), typeof mv.imdbRating === 'number' ? `<span class="rate">IMDb ${mv.imdbRating.toFixed(1)}</span>` : ''].filter(Boolean)
    .map((x) => (String(x).startsWith('<') ? x : `<span>${esc(x)}</span>`)).join('');
  const sum = shortSummary(mv);
  return `<article class="pick" tabindex="0" role="button" data-id="${esc(mv.id)}" style="--i:${i}" aria-label="${esc(mv.title)}${p.wildcard ? ', wildcard pick' : ''}. Open details.">
    ${p.wildcard ? '<span class="wild">WILDCARD</span>' : ''}
    <div class="case">${posterHTML(mv)}</div><div class="board"></div>
    <h3>${esc(mv.title)}</h3>
    <div class="m">${meta}</div>
    <div class="m">${fmtBadge(mv.format)}<span class="seen">${esc(shortSeen(p.lastWatched))}</span></div>
    ${tagsHTML(mv, 3)}
    ${sum ? `<p class="sum">${esc(sum)}</p>` : ''}
  </article>`;
}
function renderDealt(animate) {
  const r = ui.result;
  const has = !!r;
  $('chooser').hidden = has; $('dealt').hidden = !has; $('dock').hidden = !has || ui.view !== 'tonight';
  if (!has) return;
  $('dealMood').textContent = (r.mood ? moodLabel(r.mood) : 'Surprise me').toUpperCase();
  $('dealTime').textContent = timeById(r.time).label.toUpperCase().replace('–', '-');
  const shelf = $('shelf');
  shelf.classList.remove('dealing');
  shelf.innerHTML = r.picks.map(pickHTML).join('') || '<p class="loading">THE SHELF IS EMPTY</p>';
  wirePosters(shelf);
  if (animate) { void shelf.offsetWidth; shelf.classList.add('dealing'); }
  const bits = [...r.rules];
  $('dealNote').textContent = r.note || (bits.length ? bits.join(' · ').toUpperCase() : 'NOTHING HERE WATCHED IN THE LAST 6 MONTHS');
}

/* ---------- detail sheet ---------- */
function openDetail(id) {
  const mv = store.movies().find((m) => m.id === id);
  if (!mv) return;
  ui.detailId = id;
  const { last, count } = watchStats(store.log());
  const pick = ui.result?.picks.find((p) => p.movie.id === id);
  const lw = last.get(id);
  const rating = typeof mv.imdbRating === 'number'
    ? `<span class="rate">IMDb ${mv.imdbRating.toFixed(1)}</span>${fmtAsOf(mv.ratingAsOf) ? `<span>as of ${fmtAsOf(mv.ratingAsOf)}</span>` : ''}`
    : '<span>Rating not fetched yet</span>';
  $('detailBody').innerHTML = `
    <div class="detail">
      <div class="pick"><div class="case">${posterHTML(mv)}</div><div class="board"></div></div>
      <div class="info">
        <h2 class="neon-amber">${esc(mv.title)}</h2>
        <div class="m">${[mv.year, fmtRuntime(mv.runtime)].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}</div>
        <div class="m">${rating}</div>
        <div class="m">${fmtBadge(mv.format)}${mv.kind === 'series' ? '<span class="fmt none">Box set</span>' : ''}</div>
        ${mv.director ? `<div class="m"><span>Dir. ${esc(mv.director)}</span></div>` : ''}
      </div>
    </div>
    ${tagsHTML(mv, 9)}
    <p class="sum full">${esc(mv.summary || (mv.needsMatch ? "The robot couldn't match this title. Tap Edit and check the title and year." : 'Summary and poster appear once the catalog robot has run.'))}</p>
    <div class="last">LAST WATCHED: ${esc(agoText(lw, now()).toUpperCase())}${count.get(id) > 1 ? ` · ${count.get(id)}× TOTAL` : ''}</div>
    ${pick ? `<h3 class="lbl">Why tonight</h3><ul class="reasons">${pick.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="btnrow"><button class="b2" type="button" data-close>Back to shelf</button><button class="b2 hot" type="button" id="detailWatched">We watched this</button></div>
    <div class="links">
      ${mv.imdbId ? `<a href="https://www.imdb.com/title/${encodeURIComponent(mv.imdbId)}/" target="_blank" rel="noopener noreferrer">View on IMDb</a>` : ''}
      <button type="button" id="detailPast">Log a past date</button>
      <button type="button" id="detailEdit">Edit</button>
    </div>`;
  wirePosters($('detailBody'));
  $('detailWatched').onclick = () => { closeAll(); logWatch(mv, isoDate(now())); };
  $('detailPast').onclick = () => { closeAll(); openLog(mv); };
  $('detailEdit').onclick = () => { closeAll(); openEdit(mv.id); };
  show('detailDlg');
}

/* ---------- logging a watch ---------- */
function logWatch(mv, date, freeTitle) {
  const entry = { id: `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, movieId: mv ? mv.id : null, title: mv ? mv.title : freeTitle, date };
  ui.lastLogId = entry.id;
  store.logWatch(entry);
  toast(`Logged: ${entry.title}. Enjoy the show.`, () => store.undoWatch(entry.id));
}
function openLog(preselect) {
  $('logDate').value = isoDate(now()); $('logDate').max = isoDate(now());
  $('logSearch').value = preselect ? preselect.title : '';
  const picks = preselect ? [] : (ui.result?.picks || []);
  $('logPicks').innerHTML = picks.map((p) => `<button class="b2" type="button" data-id="${esc(p.movie.id)}">${esc(p.movie.title)}</button>`).join('');
  $('logPicks').hidden = !picks.length;
  renderLogResults();
  show('logDlg');
}
function renderLogResults() {
  const q = norm($('logSearch').value);
  const box = $('logResults');
  if (!q) { box.innerHTML = ''; return; }
  const hits = store.movies().filter((m) => norm(m.title).includes(q)).slice(0, 7);
  const exact = hits.some((m) => norm(m.title) === q);
  box.innerHTML = hits.map((m) => `<button class="row" type="button" data-id="${esc(m.id)}"><span class="t">${esc(m.title)} <small>${esc(m.year || '')}</small></span><span class="r">LOG IT</span></button>`).join('') +
    (exact ? '' : `<button class="row" type="button" data-free="1"><span class="t">“${esc($('logSearch').value.trim())}” <small>not on my shelf</small></span><span class="r">LOG IT</span></button>`);
}
function logFromDialog(target) {
  const date = $('logDate').value || isoDate(now());
  const id = target.dataset.id;
  if (id) logWatch(store.movies().find((m) => m.id === id), date);
  else if (target.dataset.free) logWatch(null, date, $('logSearch').value.trim());
  else return;
  closeAll();
}

/* ---------- adding a movie ---------- */
let scanner = null;
function setAddStatus(text, cls) { const el = $('addStatus'); el.textContent = text; el.className = 'status ' + (cls || ''); }
function openAdd(scan) {
  $('addName').value = ''; $('addYear').value = ''; $('addBarcode').value = ''; $('addFormat').value = '4K UHD';
  setAddStatus(scan ? '' : 'Type the title. Posters and ratings fill in by themselves a couple of minutes after you add it.');
  $('scanRow').hidden = false; $('reader').hidden = true;
  show('addDlg');
  if (scan) startScan();
}
function loadScannerLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/vendor/html5-qrcode.min.js'; s.onload = res; s.onerror = () => rej(new Error('scanner failed to load')); document.head.appendChild(s); });
}
async function startScan() {
  setAddStatus('Starting the camera…');
  try {
    await loadScannerLib();
    $('reader').hidden = false; $('scanRow').hidden = true;
    const F = window.Html5QrcodeSupportedFormats;
    scanner = new window.Html5Qrcode('reader', { formatsToSupport: [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8], verbose: false, useBarCodeDetectorIfSupported: true });
    await scanner.start({ facingMode: 'environment' }, { fps: 12, qrbox: (w, h) => ({ width: Math.round(w * 0.86), height: Math.round(Math.min(h, w) * 0.42) }) },
      (code) => { onBarcode(code); }, () => {});
    setAddStatus('Point the camera at the barcode on the back of the case.');
  } catch (e) {
    await stopScan();
    setAddStatus(/Permission|NotAllowed/i.test(String(e)) ? 'The camera is blocked. Allow camera access for this site in Settings → Safari → Camera, or type the barcode numbers below.' : 'Could not start the camera here. Type the title or the barcode numbers instead.', 'bad');
  }
}
async function stopScan() {
  const s = scanner; scanner = null;
  try { if (s) { await s.stop(); s.clear(); } } catch { /* already stopped */ }
  $('reader').hidden = true; $('scanRow').hidden = false;
}
async function onBarcode(code) {
  if (!scanner) return;
  await stopScan();
  $('addBarcode').value = code;
  if (navigator.vibrate) navigator.vibrate(60);
  await lookupBarcode(code);
}
async function lookupBarcode(code) {
  setAddStatus(`Got ${code}. Looking it up…`);
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`);
    const item = (await res.json()).items?.[0];
    if (item?.title) {
      $('addName').value = cleanDiscTitle(item.title);
      const f = guessFormat(item.title); if (f) $('addFormat').value = f;
      setAddStatus('Found it. Check the title and format, then tap Add to shelf.', 'good');
      return;
    }
    setAddStatus("That barcode isn't in the free database. Type the title and it'll be added just the same.", 'bad');
  } catch {
    setAddStatus("Couldn't look the barcode up from this phone. Type the title, or just tap Add and the robot will try to identify it.", 'bad');
  }
}
function saveAdd() {
  const title = $('addName').value.trim(), barcode = $('addBarcode').value.replace(/\D/g, ''), year = parseInt($('addYear').value, 10) || null;
  if (!title && !barcode) { setAddStatus('Type a title or scan a barcode first.', 'bad'); return; }
  const have = title && store.movies().find((m) => norm(m.title) === norm(title) && (!year || !m.year || m.year === year));
  if (have && !$('addSave').dataset.confirm) { setAddStatus(`"${have.title}" is already on your shelf. Tap Add again to add a second copy.`, 'bad'); $('addSave').dataset.confirm = '1'; return; }
  delete $('addSave').dataset.confirm;
  let id = title ? slug(title, year) : `disc-${barcode}`; const ids = new Set(store.movies().map((m) => m.id)); let n = 2; const base = id;
  while (ids.has(id)) id = `${base}-${n++}`;
  const mv = { id, title: title || `Scanned disc ${barcode}`, year, runtime: 0, genres: [], director: '', format: $('addFormat').value, distributor: '', addedAt: isoDate(now()), kind: /:\s*season \d+/i.test(title) ? 'series' : 'movie', moods: [], vibes: [] };
  if (barcode) mv.barcode = barcode;
  if (!title) mv.titlePending = true;
  store.addMovie(mv);
  closeAll();
  toast(`Added: ${mv.title}`);
  render();
}

/* ---------- editing ---------- */
function openEdit(id) {
  const mv = store.movies().find((m) => m.id === id); if (!mv) return;
  ui.editId = id;
  $('editName').value = mv.title; $('editYear').value = mv.year || ''; $('editRuntime').value = mv.runtime || ''; $('editFormat').value = mv.format || '';
  $('editMoods').innerHTML = MOODS.map((m) => `<button type="button" class="mood" role="checkbox" data-mood="${m.id}" aria-checked="${(mv.moods || []).includes(m.id)}">${esc(m.label)}</button>`).join('');
  delete $('editRemove').dataset.confirm; $('editRemove').textContent = 'Remove from my shelf';
  show('editDlg');
}
function saveEdit() {
  const mv = store.movies().find((m) => m.id === ui.editId); if (!mv) return;
  const order = [...(mv.moods || [])];
  const checked = [...$('editMoods').querySelectorAll('[aria-checked="true"]')].map((b) => b.dataset.mood);
  const moods = [...order.filter((m) => checked.includes(m)), ...checked.filter((m) => !order.includes(m))];
  const patch = { title: $('editName').value.trim() || mv.title, year: parseInt($('editYear').value, 10) || null, runtime: parseInt($('editRuntime').value, 10) || 0, format: $('editFormat').value, moods };
  if (patch.title !== mv.title || patch.year !== (mv.year || null)) { patch.retry = true; patch.titlePending = false; patch.tmdbId = null; patch.imdbId = null; } // ask the robot to look it up again
  store.editMovie(mv.id, patch);
  closeAll(); toast('Saved'); render();
}

/* ---------- back room ---------- */
function rowsOrEmpty(rows, empty) { return rows.length ? rows.join('') : `<p class="empty">${esc(empty)}</p>`; }
function renderBack() {
  const movies = store.movies(), log = store.log(), d = now();
  const s = collectionStats(movies, log, d);
  $('tiles').innerHTML = `<div class="tile"><b class="neon-pink">${s.total}</b><span>on the shelf</span></div>
    <div class="tile"><b class="neon-cyan">${s.watchedCount}</b><span>watched</span></div>
    <div class="tile"><b class="neon-amber">${s.neverLogged}</b><span>never logged</span></div>`;
  const order = ['4K UHD', 'Blu-ray', 'DVD', 'Unknown'];
  $('formats').textContent = Object.entries(s.formats).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([f, n]) => `${n} ${f === 'Unknown' ? 'NO FORMAT' : f.toUpperCase()}`).join(' · ')
    + (s.nights ? ` · ${s.nights} MOVIE NIGHT${s.nights === 1 ? '' : 'S'} · ${Math.round(s.minutes / 60)} HRS WATCHED` : '');
  const mrow = (mv, right) => `<button class="row" type="button" data-id="${esc(mv.id)}"><span class="t">${esc(mv.title)} <small>${esc(mv.year || '')}</small></span><span class="r">${right}</span></button>`;
  $('mostWatched').className = 'rowlist tappable'; $('longest').className = 'rowlist tappable';
  $('mostWatched').innerHTML = rowsOrEmpty(s.mostWatched.map((x) => mrow(x.movie, `${x.count}×`)), 'Log a few movie nights and your favourites show up here.');
  $('longest').innerHTML = rowsOrEmpty(s.longestUnwatched.map((x) => mrow(x.movie, esc(sinceText(x.days)))), `Nothing logged yet. ${s.neverLogged} titles are waiting for their first night.`);
  $('dusty').innerHTML = s.dusty.length
    ? s.dusty.slice(0, 24).map((x) => `<article class="pick" tabindex="0" role="button" data-id="${esc(x.movie.id)}" aria-label="${esc(x.movie.title)}"><div class="case">${posterHTML(x.movie)}</div><div class="m"><span>${esc(x.never ? 'never played' : sinceText(x.days))}</span></div></article>`).join('')
    : '<p class="empty">Nothing dusty yet. Movies land here after two years unplayed, or a year on the shelf without a single watch.</p>';
  wirePosters($('dusty'));
  const byId = new Map(movies.map((m) => [m.id, m]));
  const recent = [...log].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 8);
  $('recent').innerHTML = rowsOrEmpty(recent.map((e) => `<div class="row"><span class="t">${esc((byId.get(e.movieId) || e).title)} <small>${esc(agoText(e.date, d))}</small></span><button class="x" type="button" data-undo="${esc(e.id)}" aria-label="Remove this entry">✕</button></div>`), 'No movie nights logged yet.');
  const needs = movies.filter((m) => m.needsMatch || m.titlePending);
  $('needsHand').hidden = !needs.length;
  $('needsList').className = 'rowlist tappable';
  $('needsList').innerHTML = needs.map((m) => mrow(m, 'FIX')).join('');
  renderAllList();
}
function sinceText(days) {
  if (days < 60) return `${days} DAYS`;
  if (days < 730) return `${Math.round(days / 30.4)} MONTHS`;
  const y = Math.floor(days / 365), mo = Math.floor((days - y * 365) / 30.4);
  return `${y} YRS${mo ? ` ${mo} MO` : ''}`;
}
function renderAllList() {
  const q = norm($('shelfSearch').value);
  const { last } = watchStats(store.log());
  const list = store.movies().filter((m) => !q || norm(m.title).includes(q) || norm(m.director).includes(q));
  $('allList').innerHTML = list.slice(0, q ? 60 : 400).map((m) =>
    `<button class="row" type="button" data-id="${esc(m.id)}"><span class="t">${esc(m.title)} <small>${esc([m.year, fmtRuntime(m.runtime)].filter(Boolean).join(' · '))}</small></span><span class="r">${last.has(m.id) ? '<span class="seen" style="color:var(--green)">✓</span>' : ''}${fmtBadge(m.format)}</span></button>`).join('')
    || '<p class="empty">Nothing on the shelf matches that.</p>';
}

/* ---------- settings ---------- */
function openSettings() {
  $('tokenInput').value = '';
  const st = $('tokenStatus');
  st.className = 'status ' + (store.state.token ? 'good' : '');
  st.textContent = store.state.token ? 'A save key is set on this device. Watches and new movies save to GitHub.' : 'No save key on this device. Picks work, but anything you log stays on this device only.';
  $('bingeToggle').checked = !!store.state.prefs.binge;
  const c = store.state.config || {};
  $('placeLine').textContent = c.place ? `Weather for ${c.place}.` : '';
  show('settingsDlg');
}

/* ---------- plumbing ---------- */
function show(id) { const d = $(id); if (!d.open) d.showModal(); d.scrollTop = 0; }
function closeAll() { stopScan(); document.querySelectorAll('dialog[open]').forEach((d) => d.close()); }
let toastTimer = null;
function toast(text, undo) {
  $('toastText').textContent = text;
  const u = $('toastUndo'); u.hidden = !undo; u.onclick = undo ? () => { undo(); $('toast').classList.remove('on'); render(); } : null;
  $('toast').classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('on'), undo ? 6000 : 2200);
}
function renderSync() {
  const s = store.state, pill = $('syncPill');
  const pending = s.ops.length;
  if (s.sync === 'saving') { pill.hidden = false; pill.className = 'syncpill'; pill.textContent = 'SAVING…'; }
  else if (s.sync === 'error') { pill.hidden = false; pill.className = 'syncpill warn'; pill.textContent = 'NOT SAVED TO GITHUB · TAP'; pill.title = s.syncError; }
  else if (pending && !s.token) { pill.hidden = false; pill.className = 'syncpill warn'; pill.textContent = `${pending} SAVED ON THIS DEVICE ONLY`; }
  else pill.hidden = true;
}
function setView(v) {
  ui.view = v;
  $('viewTonight').hidden = v !== 'tonight'; $('viewBack').hidden = v !== 'back';
  $('backBtn').setAttribute('aria-pressed', String(v === 'back'));
  $('backBtn').textContent = v === 'back' ? 'Tonight' : 'Back room';
  render(); window.scrollTo({ top: 0 });
}
function render() {
  renderOsd(); renderSync();
  if (ui.view === 'tonight') { if (!ui.result) renderChooser(); renderDealt(false); }
  else { $('dock').hidden = true; renderBack(); }
}

function activate(el, fn) {
  el.addEventListener('click', fn);
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[role="button"]')) { e.preventDefault(); fn(e); } });
}
function wire() {
  $('moods').addEventListener('click', (e) => { const b = e.target.closest('.mood'); if (!b) return; ui.mood = b.dataset.mood || null; renderChooser(); });
  $('times').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ui.time = b.dataset.time; ui.timeTouched = true; renderChooser(); });
  $('dealBtn').addEventListener('click', runDeal);
  $('redealBtn').addEventListener('click', runDeal);
  $('changeBtn').addEventListener('click', () => { ui.result = null; render(); });
  $('watchedBtn').addEventListener('click', () => openLog());
  $('logAnyBtn').addEventListener('click', () => openLog());
  $('homeBtn').addEventListener('click', () => { ui.result = null; setView('tonight'); });
  $('backBtn').addEventListener('click', () => setView(ui.view === 'back' ? 'tonight' : 'back'));
  const openFrom = (e) => { const p = e.target.closest('[data-id]'); if (p) openDetail(p.dataset.id); };
  activate($('shelf'), openFrom); activate($('dusty'), openFrom);
  for (const id of ['mostWatched', 'longest', 'allList', 'needsList']) $(id).addEventListener('click', openFrom);
  $('recent').addEventListener('click', (e) => { const b = e.target.closest('[data-undo]'); if (b) { store.undoWatch(b.dataset.undo); render(); toast('Removed from your log'); } });
  $('shelfSearch').addEventListener('input', renderAllList);
  $('logSearch').addEventListener('input', renderLogResults);
  $('logPicks').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) logFromDialog(b); });
  $('logResults').addEventListener('click', (e) => { const b = e.target.closest('.row'); if (b) logFromDialog(b); });
  $('scanBtn').addEventListener('click', () => openAdd(true));
  $('typeBtn').addEventListener('click', () => openAdd(false));
  $('startScan').addEventListener('click', startScan);
  $('addSave').addEventListener('click', saveAdd);
  $('addBarcode').addEventListener('change', () => { const c = $('addBarcode').value.replace(/\D/g, ''); if (c.length >= 8 && !$('addName').value.trim()) lookupBarcode(c); });
  $('editMoods').addEventListener('click', (e) => { const b = e.target.closest('.mood'); if (b) b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')); });
  $('editSave').addEventListener('click', saveEdit);
  $('editRemove').addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Tap again to remove it for good'; return; }
    store.removeMovie(ui.editId); closeAll(); toast('Removed from your shelf'); render();
  });
  $('settingsBtn').addEventListener('click', openSettings);
  $('syncPill').addEventListener('click', () => { if (store.state.sync === 'error') { toast(store.state.syncError); store.sync(); } else openSettings(); });
  $('tokenSave').addEventListener('click', async () => {
    const st = $('tokenStatus'); st.className = 'status'; st.textContent = 'Checking the key with GitHub…';
    const r = await store.setToken($('tokenInput').value);
    st.className = 'status ' + (r.ok ? 'good' : 'bad');
    st.textContent = r.ok ? (r.cleared ? 'Key removed.' : 'Key works. Everything you log now saves to GitHub.') : r.why;
    if (r.ok) $('tokenInput').value = '';
  });
  $('tokenClear').addEventListener('click', async () => { await store.setToken(''); openSettings(); });
  $('bingeToggle').addEventListener('change', (e) => store.setPrefs({ binge: e.target.checked }));
  document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeAll(); });
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d) closeAll(); }); // tap outside the sheet
    d.addEventListener('close', () => stopScan());
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderOsd(); store.sync(); } });
  store.subscribe(() => { renderSync(); if (ui.view === 'back') renderBack(); });
}

// The iPhone Shortcut opens  ...?deal=1&mood=Scary&time=Short
function readLink() {
  const m = norm(params.get('mood') || '');
  const moodHit = MOODS.find((x) => x.id === m || norm(x.label) === m || norm(x.label).split(' ')[0] === m);
  if (moodHit) ui.mood = moodHit.id;
  const t = norm(params.get('time') || '');
  const timeMap = { short: 'short', under90: 'short', 'under 90': 'short', medium: 'mid', mid: 'mid', long: 'long' };
  if (timeMap[t]) { ui.time = timeMap[t]; ui.timeTouched = true; }
  return params.get('deal') === '1';
}

async function start() {
  wire(); renderOsd();
  $('moods').innerHTML = '<p class="loading" style="grid-column:1/-1">STOCKING THE SHELVES…</p>';
  try { await store.load(); }
  catch { $('moods').innerHTML = '<p class="loading" style="grid-column:1/-1">TAPE JAMMED. CHECK YOUR CONNECTION AND RELOAD.</p>'; return; }
  const autoDeal = readLink();
  render();
  const weather = loadWeather();
  if (autoDeal) { await Promise.race([weather, new Promise((r) => setTimeout(r, 1500))]); runDeal(); }
  if (params.get('view') === 'back') setView('back');
}
start();
