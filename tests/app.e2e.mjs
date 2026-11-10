// Drives the real app in a browser at phone and desktop size. Run with: npm run test:app
// GitHub and the weather service are replaced with stand-ins, so nothing real is touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 4179, BASE = `http://localhost:${PORT}/`;
const server = await serve(PORT);
const browser = await chromium.launch();
const shots = process.env.SHOTS_DIR;
let failed = 0;

async function newPage(width, height, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: opts.scale || 1 });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
  // A pretend GitHub that stores files in memory
  const repo = { 'data/movies.json': fs.readFileSync(new URL('../data/movies.json', import.meta.url), 'utf8'), 'data/watchlog.json': '{"version":1,"entries":[]}' };
  const commits = [];
  await page.route(/^https?:\/\/(?!localhost)/, async (route) => {
    const url = new URL(route.request().url()); const req = route.request();
    if (url.hostname === 'api.open-meteo.com') return route.fulfill({ json: { current: { temperature_2m: 41, weather_code: 61 } } });
    if (url.hostname === 'api.upcitemdb.com') return route.fulfill({ json: { items: [{ title: 'Heat [4K Ultra HD + Blu-ray]' }] }, headers: { 'access-control-allow-origin': '*' } });
    if (url.hostname === 'api.github.com') {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (!/Bearer good-key/.test(req.headers().authorization || '')) return route.fulfill({ status: 401, json: {}, headers: cors });
      const m = /\/contents\/(.+)$/.exec(url.pathname);
      if (!m) return route.fulfill({ json: { permissions: { push: true } }, headers: cors });
      if (req.method() === 'GET') return route.fulfill({ json: { sha: 'sha' + commits.length, content: Buffer.from(repo[m[1]]).toString('base64') }, headers: cors });
      const body = JSON.parse(req.postData()); repo[m[1]] = Buffer.from(body.content, 'base64').toString('utf8'); commits.push({ file: m[1], message: body.message });
      return route.fulfill({ json: { content: {} }, headers: cors });
    }
    return route.abort();
  });
  return { page, errors, repo, commits, ctx };
}
async function check(name, fn) {
  try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').slice(0, 6).join('\n     ')); }
}
const noSideScroll = async (page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page scrolls sideways');

for (const [label, w, h] of [['phone', 390, 844], ['desktop', 1280, 800]]) {
  const { page, errors, repo, commits } = await newPage(w, h, { scale: shots ? 2 : 1 });
  await check(`${label}: opens on the chooser with weeknight default`, async () => {
    await page.goto(BASE + '?now=2026-11-10T20:00&seed=7');
    await page.waitForSelector('.mood');
    assert.equal(await page.locator('.mood').count(), 9);
    assert.equal(await page.locator('#times [aria-checked="true"]').innerText(), 'UNDER 90');
    assert.match(await page.locator('#osd').innerText(), /TUE NOV 10/);
    await page.waitForFunction(() => /41° RAIN/.test(document.getElementById('osd').innerText));
    assert.match(await page.locator('#osd').innerText(), /T-GIVING 16D/);
    await noSideScroll(page);
    if (shots) await page.screenshot({ path: `${shots}/${label}-1-chooser.png` });
  });
  await check(`${label}: deals 3 scary picks and a wildcard`, async () => {
    await page.click('.mood[data-mood="scary"]');
    await page.click('#dealBtn');
    await page.waitForSelector('#shelf .pick');
    assert.equal(await page.locator('#shelf .pick').count(), 4);
    assert.equal(await page.locator('#shelf .wild').count(), 1);
    await page.waitForTimeout(2600); // let the deal animation land
    for (const p of await page.locator('#shelf .pick').all()) {
      assert.ok(await p.locator('.fmt').count(), 'format badge'); assert.ok((await p.locator('.seen').innerText()).length, 'last watched');
      assert.ok(await p.locator('.tags li').count(), 'tags'); assert.ok((await p.locator('h3').innerText()).length);
      const box = await p.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= w + 1, 'card inside the screen');
    }
    await noSideScroll(page);
    if (shots) await page.screenshot({ path: `${shots}/${label}-2-dealt.png`, fullPage: true });
  });
  await check(`${label}: deal again brings four different titles`, async () => {
    const before = await page.locator('#shelf h3').allInnerTexts();
    await page.click('#redealBtn'); await page.waitForTimeout(300);
    const after = await page.locator('#shelf h3').allInnerTexts();
    assert.equal(after.length, 4); assert.ok(after.every((t) => !before.includes(t)), `${before} vs ${after}`);
  });
  let watched;
  await check(`${label}: detail sheet, then "We watched this" logs today`, async () => {
    watched = await page.locator('#shelf .pick h3').first().innerText();
    await page.locator('#shelf .pick').first().click();
    await page.waitForSelector('#detailDlg[open]');
    assert.match(await page.locator('#detailBody').innerText(), /LAST WATCHED: NEVER LOGGED/);
    assert.match(await page.locator('#detailBody').innerText(), /WHY TONIGHT/i);
    await page.waitForTimeout(350);
    if (shots) await page.screenshot({ path: `${shots}/${label}-3-detail.png` });
    await page.click('#detailWatched');
    await page.waitForSelector('.toast.on');
    assert.match(await page.locator('#toastText').innerText(), /Logged:/);
    const ops = await page.evaluate(() => JSON.parse(localStorage.getItem('neonShelf.ops')));
    assert.equal(ops.length, 1); assert.equal(ops[0].entry.date, '2026-11-10');
    assert.match(await page.locator('#syncPill').innerText(), /1 SAVED ON THIS DEVICE ONLY/);
  });
  await check(`${label}: the watched movie drops out of future deals and shows in the back room`, async () => {
    await page.reload(); await page.waitForSelector('.mood');
    for (let i = 0; i < 12; i++) {
      await page.click(i ? '#redealBtn' : '#dealBtn'); await page.waitForTimeout(60);
      assert.ok(!(await page.locator('#shelf h3').allInnerTexts()).includes(watched), 'watched movie was dealt again');
    }
    await page.click('#backBtn');
    assert.equal(await page.locator('#tiles .tile b').nth(1).innerText(), '1');
    assert.match(await page.locator('#recent').innerText(), new RegExp(watched.slice(0, 8).replace(/[^\w ]/g, '.'), 'i'));
    assert.match(await page.locator('#mostWatched').innerText(), /1×/);
    await noSideScroll(page);
    if (shots) await page.screenshot({ path: `${shots}/${label}-4-backroom.png` });
  });
  await check(`${label}: log a different title, on and off the shelf`, async () => {
    await page.click('#logAnyBtn'); await page.fill('#logSearch', 'big leb');
    await page.locator('#logResults .row').first().click();
    await page.click('#logAnyBtn'); await page.fill('#logSearch', 'Some Rental We Borrowed');
    await page.locator('#logResults .row[data-free]').click();
    const ops = await page.evaluate(() => JSON.parse(localStorage.getItem('neonShelf.ops')));
    assert.equal(ops.length, 3); assert.equal(ops[1].entry.movieId, 'the-big-lebowski-1998'); assert.equal(ops[2].entry.movieId, null);
    assert.equal(await page.locator('#tiles .tile b').nth(1).innerText(), '2');
  });
  await check(`${label}: add a movie by typing, and by barcode number`, async () => {
    await page.click('#typeBtn'); await page.fill('#addName', 'Heat'); await page.fill('#addYear', '1995'); await page.selectOption('#addFormat', 'Blu-ray'); await page.click('#addSave');
    assert.equal(await page.locator('#tiles .tile b').first().innerText(), '228');
    await page.click('#typeBtn'); await page.fill('#addBarcode', '024543000000'); await page.locator('#addBarcode').blur();
    await page.waitForFunction(() => document.getElementById('addName').value === 'Heat');
    assert.equal(await page.inputValue('#addFormat'), '4K UHD');
    await page.click('#addSave'); assert.match(await page.locator('#addStatus').innerText(), /already on your shelf/);
    await page.click('[data-close] >> visible=true');
    await page.fill('#shelfSearch', 'heat'); assert.match(await page.locator('#allList').innerText(), /Heat/);
  });
  await check(`${label}: edit moods and format`, async () => {
    await page.fill('#shelfSearch', 'they live'); await page.locator('#allList .row').first().click();
    await page.click('#detailEdit'); await page.selectOption('#editFormat', '4K UHD'); await page.click('#editMoods [data-mood="cozy"]'); await page.click('#editSave');
    const mv = await page.evaluate(() => JSON.parse(localStorage.getItem('neonShelf.ops')).filter((o) => o.t === 'edit')[0]);
    assert.equal(mv.patch.format, '4K UHD'); assert.deepEqual(mv.patch.moods, ['intense', 'funny', 'cult', 'cozy']); assert.equal(mv.patch.retry, undefined);
  });
  await check(`${label}: a bad save key is refused; a good one sends everything to GitHub`, async () => {
    await page.click('#settingsBtn'); await page.fill('#tokenInput', 'nope'); await page.click('#tokenSave');
    await page.waitForFunction(() => /did not recognise/.test(document.getElementById('tokenStatus').innerText));
    await page.fill('#tokenInput', 'good-key'); await page.click('#tokenSave');
    await page.waitForFunction(() => /Key works/.test(document.getElementById('tokenStatus').innerText));
    assert.equal(commits.length, 2);
    const log = JSON.parse(repo['data/watchlog.json']).entries; assert.equal(log.length, 3);
    const movies = JSON.parse(repo['data/movies.json']).movies; assert.equal(movies.length, 228);
    assert.equal(movies.find((m) => m.id === 'they-live-1988').format, '4K UHD'); assert.ok(movies.find((m) => m.id === 'heat-1995'));
    assert.equal(await page.evaluate(() => localStorage.getItem('neonShelf.ops')), '[]');
    assert.ok(await page.locator('#syncPill').isHidden());
    await page.click('#settingsDlg [data-close]');
    await page.reload(); await page.waitForSelector('.mood'); await page.click('#backBtn');
    await page.waitForFunction(() => document.querySelector('#tiles .tile b')?.innerText === '228');
    assert.equal(await page.locator('#tiles .tile b').nth(1).innerText(), '2');
  });
  await check(`${label}: undo a logged watch`, async () => {
    await page.locator('#recent [data-undo]').first().click();
    await page.waitForFunction(() => document.querySelectorAll('#recent .row').length === 2);
    await page.waitForFunction(() => localStorage.getItem('neonShelf.ops') === '[]');
    assert.equal(JSON.parse(repo['data/watchlog.json']).entries.filter((e) => !e.removed).length, 2);
  });
  await check(`${label}: no script errors`, async () => assert.deepEqual(errors, []));
  await page.context().close();
}

{
  const { page, errors } = await newPage(390, 844);
  await check('shortcut link deals straight away', async () => {
    await page.goto(BASE + '?deal=1&mood=Funny&time=Medium&now=2026-11-14T20:00');
    await page.waitForSelector('#shelf .pick');
    assert.equal(await page.locator('#dealMood').innerText(), 'FUNNY'); assert.match(await page.locator('#dealTime').innerText(), /90 - 2 HRS/);
    assert.equal(await page.locator('#shelf .pick').count(), 4);
    await page.click('#changeBtn'); assert.equal(await page.locator('.mood[aria-checked="true"]').getAttribute('data-mood'), 'funny');
  });
  await check('weekend default, cult link, surprise link', async () => {
    await page.goto(BASE + '?now=2026-11-14T20:00'); await page.waitForSelector('.mood');
    assert.equal(await page.locator('#times [aria-checked="true"]').getAttribute('data-time'), 'mid');
    await page.goto(BASE + '?deal=1&mood=Cult&time=Short'); await page.waitForSelector('#shelf .pick'); assert.equal(await page.locator('#dealMood').innerText(), 'CULT TRASH');
    await page.goto(BASE + '?deal=1&mood=Surprise&time=Long'); await page.waitForSelector('#shelf .pick'); assert.equal(await page.locator('#dealMood').innerText(), 'SURPRISE ME');
  });
  await check('barcode scanner opens the camera without errors', async () => {
    await page.context().grantPermissions(['camera']).catch(() => {});
    await page.goto(BASE + '?view=back'); await page.waitForSelector('#scanBtn'); await page.click('#scanBtn');
    await page.waitForFunction(() => document.getElementById('addStatus').innerText.length > 0 && !/Starting/.test(document.getElementById('addStatus').innerText), null, { timeout: 15000 });
    console.log('     scanner status: ' + await page.locator('#addStatus').innerText());
    assert.ok(await page.evaluate(() => typeof window.Html5Qrcode === 'function'));
    assert.deepEqual(errors, []);
  });
  await page.context().close();
}
await browser.close(); server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll app checks passed');
process.exit(failed ? 1 : 0);
