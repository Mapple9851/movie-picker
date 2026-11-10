// Neon Shelf: where the data lives.
// The catalog and watch log are files in the GitHub repo. Changes made on the
// phone are kept in a small local "to-do" list (ops) and, when a save key is
// set, written back to the repo through GitHub's API so every device sees them.

const LS = { token: 'neonShelf.token', ops: 'neonShelf.ops', prefs: 'neonShelf.prefs', repo: 'neonShelf.repo' };
const API = 'https://api.github.com';

function lsGet(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: keep going in memory */ } }

export function repoInfo() {
  const saved = lsGet(LS.repo, null);
  if (saved && saved.owner && saved.repo) return saved;
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    return { owner: host.split('.')[0], repo: location.pathname.split('/').filter(Boolean)[0] || host, branch: 'main' };
  }
  return { owner: 'Mapple9851', repo: 'movie-picker', branch: 'main' };
}

/* ---------- pure: apply local changes on top of the repo copy ---------- */

export function applyMovieOps(movies, ops) {
  const list = movies.map((m) => ({ ...m }));
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const op of ops) {
    if (op.t === 'add' && !byId.has(op.movie.id)) { const m = { ...op.movie }; list.push(m); byId.set(m.id, m); }
    else if (op.t === 'edit' && byId.has(op.movieId)) Object.assign(byId.get(op.movieId), op.patch);
    else if (op.t === 'remove' && byId.has(op.movieId)) byId.get(op.movieId).removed = true;
  }
  return list;
}
export function applyLogOps(entries, ops) {
  const list = entries.map((e) => ({ ...e }));
  const byId = new Map(list.map((e) => [e.id, e]));
  for (const op of ops) {
    if (op.t === 'watch' && !byId.has(op.entry.id)) { const e = { ...op.entry }; list.push(e); byId.set(e.id, e); }
    else if (op.t === 'unwatch' && byId.has(op.entryId)) byId.get(op.entryId).removed = true;
  }
  return list;
}
const isMovieOp = (op) => op.t === 'add' || op.t === 'edit' || op.t === 'remove';
const isLogOp = (op) => op.t === 'watch' || op.t === 'unwatch';

/* ---------- GitHub file read/write ---------- */

function b64encode(str) {
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, '')); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function gh(path, token, init = {}) {
  const res = await fetch(API + path, {
    ...init, cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) },
  });
  if (!res.ok) { const e = new Error('GitHub said ' + res.status); e.status = res.status; throw e; }
  return res.json();
}
async function readRepoFile(file, token) {
  const { owner, repo, branch } = { branch: 'main', ...repoInfo() };
  const j = await gh(`/repos/${owner}/${repo}/contents/${file}?ref=${branch}&t=${Date.now()}`, token);
  let text;
  if (j.content) text = b64decode(j.content);
  else { // files over 1 MB come back without inline content
    const blob = await gh(`/repos/${owner}/${repo}/git/blobs/${j.sha}`, token);
    text = b64decode(blob.content);
  }
  return { sha: j.sha, json: JSON.parse(text) };
}
async function writeRepoFile(file, token, json, sha, message) {
  const { owner, repo, branch } = { branch: 'main', ...repoInfo() };
  return gh(`/repos/${owner}/${repo}/contents/${file}`, token, {
    method: 'PUT',
    body: JSON.stringify({ message, content: b64encode(JSON.stringify(json, null, 1) + '\n'), sha, branch }),
  });
}

/* ---------- the store ---------- */

export function createStore() {
  const state = {
    remoteMovies: [], remoteLog: [], config: {}, meta: {},
    ops: lsGet(LS.ops, []),
    token: lsGet(LS.token, ''),
    prefs: lsGet(LS.prefs, { binge: false }),
    sync: 'idle', // idle | saving | saved | local | error
    syncError: '',
  };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  const saveOps = () => lsSet(LS.ops, state.ops);

  async function siteJson(file) {
    const res = await fetch(`${file}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not load ${file}`);
    return res.json();
  }

  async function load() {
    const [movies, log, config] = await Promise.all([
      siteJson('data/movies.json'),
      siteJson('data/watchlog.json').catch(() => ({ entries: [] })),
      siteJson('data/config.json').catch(() => ({})),
    ]);
    state.remoteMovies = movies.movies || []; state.meta = { imports: movies.imports || [] };
    state.remoteLog = log.entries || []; state.config = config;
    emit();
    if (state.token) refreshFromRepo().then(() => sync());
    else if (state.ops.length) { state.sync = 'local'; emit(); }
  }

  // With a save key, read straight from the repo so a watch logged a minute
  // ago on another device shows up without waiting for the site to rebuild.
  async function refreshFromRepo() {
    if (!state.token) return false;
    try {
      const [m, l] = await Promise.all([readRepoFile('data/movies.json', state.token), readRepoFile('data/watchlog.json', state.token)]);
      state.remoteMovies = m.json.movies || []; state.remoteLog = l.json.entries || [];
      emit(); return true;
    } catch { return false; }
  }

  async function flush(file, mine, apply, key, describe) {
    const ops = state.ops.filter(mine);
    if (!ops.length) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await readRepoFile(file, state.token);
      cur.json[key] = apply(cur.json[key] || [], ops);
      try {
        await writeRepoFile(file, state.token, cur.json, cur.sha, describe(ops));
        if (key === 'movies') state.remoteMovies = cur.json.movies; else state.remoteLog = cur.json.entries;
        const done = new Set(ops.map((o) => o.id));
        state.ops = state.ops.filter((o) => !done.has(o.id)); saveOps();
        return;
      } catch (e) { if (e.status !== 409 || attempt === 2) throw e; } // 409 = someone else saved first; reread and retry
    }
  }

  let syncing = null;
  async function sync() {
    if (!state.ops.length) { if (state.sync !== 'error') { state.sync = state.sync === 'saving' ? 'saved' : state.sync; } emit(); return; }
    if (!state.token) { state.sync = 'local'; emit(); return; }
    if (syncing) return syncing;
    state.sync = 'saving'; emit();
    syncing = (async () => {
      try {
        await flush('data/watchlog.json', isLogOp, applyLogOps, 'entries', (ops) => {
          const w = ops.filter((o) => o.t === 'watch');
          return w.length === 1 ? `Watched: ${w[0].entry.title} (${w[0].entry.date})` : 'Update watch log';
        });
        await flush('data/movies.json', isMovieOp, applyMovieOps, 'movies', (ops) => {
          const a = ops.filter((o) => o.t === 'add');
          return a.length === 1 && ops.length === 1 ? `Add to shelf: ${a[0].movie.title}` : 'Update shelf';
        });
        state.sync = 'saved'; state.syncError = '';
      } catch (e) {
        state.sync = 'error';
        state.syncError = e.status === 401 ? 'GitHub did not accept the save key. It may have expired or been mistyped.'
          : e.status === 403 || e.status === 404 ? 'The save key cannot write to this repo. Check it has "Contents: Read and write" for movie-picker.'
          : 'Could not reach GitHub. Your change is kept on this device and will be sent next time.';
      } finally { syncing = null; emit(); }
    })();
    return syncing;
  }

  function push(op) {
    op.id = op.id || `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    state.ops.push(op); saveOps(); emit();
    return sync();
  }

  return {
    state, load, sync, refreshFromRepo,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    movies() { return applyMovieOps(state.remoteMovies, state.ops.filter(isMovieOp)).filter((m) => !m.removed); },
    log() { return applyLogOps(state.remoteLog, state.ops.filter(isLogOp)).filter((e) => !e.removed); },
    logWatch(entry) { return push({ t: 'watch', entry }); },
    undoWatch(entryId) {
      const pending = state.ops.findIndex((o) => o.t === 'watch' && o.entry.id === entryId);
      if (pending >= 0) { state.ops.splice(pending, 1); saveOps(); emit(); return Promise.resolve(); }
      return push({ t: 'unwatch', entryId });
    },
    addMovie(movie) { return push({ t: 'add', movie }); },
    editMovie(movieId, patch) { return push({ t: 'edit', movieId, patch }); },
    removeMovie(movieId) { return push({ t: 'remove', movieId }); },
    setPrefs(p) { state.prefs = { ...state.prefs, ...p }; lsSet(LS.prefs, state.prefs); emit(); },
    async setToken(token) {
      token = String(token || '').trim();
      if (!token) { state.token = ''; lsSet(LS.token, ''); state.sync = state.ops.length ? 'local' : 'idle'; emit(); return { ok: true, cleared: true }; }
      try {
        const { owner, repo } = repoInfo();
        const info = await gh(`/repos/${owner}/${repo}`, token);
        if (info.permissions && info.permissions.push === false) return { ok: false, why: 'That key can read the repo but not save to it. Recreate it with "Contents: Read and write".' };
        state.token = token; lsSet(LS.token, token);
        await refreshFromRepo(); await sync();
        return { ok: true };
      } catch (e) {
        return { ok: false, why: e.status === 401 ? 'GitHub did not recognise that key. Copy it again and paste the whole thing.' : e.status === 404 ? 'That key cannot see the movie-picker repo. When creating it, choose "Only select repositories" and pick movie-picker.' : 'Could not reach GitHub. Check your connection and try again.' };
      }
    },
  };
}
