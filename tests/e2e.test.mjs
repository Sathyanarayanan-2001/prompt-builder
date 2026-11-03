// Round 2: drive the real built page (dist/index.html) in headless Chromium
// through its actual buttons. A fake shared folder stands in for OneDrive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { server } from '../scripts/serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'output'); mkdirSync(OUT, { recursive: true });
const PORT = 8131; const URL0 = `http://localhost:${PORT}/`;
let browser;
const errors = [];
const outside = [];

test.before(async () => { await new Promise(r => server.listen(PORT, r)); browser = await chromium.launch(); });
test.after(async () => { await browser.close(); server.close(); });

async function page(ctxOpts = {}, folder) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true, ...ctxOpts });
  if (folder) {
    await ctx.exposeBinding('__fs', (_s, op, name, b64) => {
      if (op === 'list') return Object.entries(folder.files).map(([n, f]) => [n, f.t, f.b.length]);
      if (op === 'read') { const f = folder.files[name]; return f ? f.b.toString('base64') : null; }
      if (op === 'write') { folder.files[name] = { b: Buffer.from(b64, 'base64'), t: Date.now() }; return true; }
      if (op === 'rm') { delete folder.files[name]; return true; }
      if (op === 'perm') return folder.perm;
    });
    await ctx.addInitScript(() => {
      const fileHandle = (name) => ({
        kind: 'file', name,
        async getFile() { const l = await window.__fs('list'); const e = l.find(x => x[0] === name); const b64 = await window.__fs('read', name); const bin = Uint8Array.from(atob(b64 || ''), c => c.charCodeAt(0)); return { lastModified: e ? e[1] : 0, size: bin.length, arrayBuffer: async () => bin.buffer }; },
        async createWritable() { let buf = new Uint8Array(0); return { async write(d) { const u = d instanceof Uint8Array ? d : new Uint8Array(await new Blob([d]).arrayBuffer()); buf = u; }, async close() { let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); await window.__fs('write', name, btoa(s)); } }; },
      });
      const dir = {
        kind: 'directory', name: 'OneDrive-Prompt Builder',
        async *entries() { for (const [n] of await window.__fs('list')) yield [n, fileHandle(n)]; },
        async getFileHandle(n) { return fileHandle(n); },
        async removeEntry(n) { await window.__fs('rm', n); },
        async queryPermission() { return await window.__fs('perm'); },
        async requestPermission() { return 'granted'; },
      };
      window.showDirectoryPicker = async () => dir;
      window.__fakeDir = dir;
    });
  }
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('request', r => { const u = r.url(); if (!u.startsWith(URL0) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u); });
  await p.goto(URL0); await p.waitForSelector('.tab');
  return { ctx, p };
}
const saveVersion = async (p, note) => { await p.locator('[data-act=save-version]').first().click(); await p.fill('#vNote', note || ''); await p.click('[data-x=yes]'); await p.waitForTimeout(150); };
let dlN = 0;
const dl = async (p, sel) => { const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]); const f = join(OUT, `${++dlN}-${d.suggestedFilename()}`); await d.saveAs(f); return f; };
const restore = async (p, file, revive = true) => {
  await p.goto(URL0 + '#setup'); await p.setInputFiles('#restoreFile', file); await p.waitForSelector('.modal');
  if (await p.locator('#rsRevive').count()) await p.locator('#rsRevive').setChecked(revive);
  if (await p.locator('.modal [data-x=yes]').count()) await p.click('.modal [data-x=yes]'); else await p.click('.modal [data-x=no]');
  await p.waitForTimeout(200);
};
const count = (p, coll) => p.evaluate(c => Object.values(PB.Store.data[c]).filter(r => !r.d).length, coll);

test('first visit opens Start and the chip says This device only', async () => {
  const { ctx, p } = await page();
  assert.equal(await p.locator('h1').first().textContent(), 'Prompt Builder');
  assert.match(await p.locator('#syncChip').textContent(), /This device only/);
  await p.screenshot({ path: join(OUT, 'start-light.png'), fullPage: true });
  await ctx.close();
});

test('build, save, remember, reuse, version history, diff, restore', async () => {
  const { ctx, p } = await page();
  await p.goto(URL0 + '#build');
  await p.fill('#f-title', 'Fuel log');
  await p.fill('#f-goal', 'A fuel and mileage tracker for my car as a static web app that works offline on my phone.');
  await p.fill('#f-role', 'Senior front-end engineer');
  await p.waitForTimeout(250);
  const prompt1 = await p.locator('#promptText').textContent();
  assert.match(prompt1, /You are a senior front-end engineer\. Build "Fuel log" end to end/);
  assert.ok(await p.locator('#promptText .add').count() > 3, 'tool additions are marked');
  await saveVersion(p, 'first');
  assert.equal(await count(p, 'builds'), 1); assert.equal(await count(p, 'versions'), 1);
  assert.ok(await count(p, 'memory') >= 3);
  // edit -> unsaved -> v2
  await p.fill('#f-need', 'I forget to log fills, so gaps must be obvious.');
  await p.waitForTimeout(250);
  assert.equal(await p.locator('.pill.warn', { hasText: 'Unsaved changes' }).count(), 1);
  await saveVersion(p, 'added need');
  await p.click('[data-tab=versions]');
  assert.equal(await p.locator('#panel .item').count(), 2);
  // compare v1 with now shows the new need line as added
  await p.locator('#panel .item').nth(1).locator('[data-act=v-diff]').click();
  assert.match(await p.locator('.diff .plus').first().textContent(), /The real need/);
  await p.click('[data-x=no]');
  // load v1 inputs -> need disappears; versions untouched
  await p.locator('#panel .item').nth(1).locator('[data-act=v-restore]').click();
  assert.equal(await p.inputValue('#f-need'), '');
  assert.equal(await count(p, 'versions'), 2);
  // new prompt: Previous shows the remembered role; Use inserts it
  await p.click('[data-act=new]'); await p.click('[data-x=yes]');
  await p.click('[data-act=mem][data-field=role]');
  await p.locator('.pop-item', { hasText: 'Senior front-end engineer' }).first().locator('[data-pop=use]').click();
  assert.equal(await p.inputValue('#f-role'), 'Senior front-end engineer');
  // untick a smart addition removes its lines
  await p.fill('#f-title', 'Budget'); await p.fill('#f-goal', 'Track my monthly budget in rupees.');
  await p.waitForTimeout(250);
  assert.match(await p.locator('#promptText').textContent(), /whole paise/);
  await p.click('[data-tab=thinking]');
  await p.click('[data-act=pack][data-pack=money]');
  await p.click('[data-tab=prompt]');
  assert.doesNotMatch(await p.locator('#promptText').textContent(), /whole paise/);
  // draft survives reload
  await p.reload(); await p.waitForSelector('#f-title');
  assert.equal(await p.inputValue('#f-title'), 'Budget');
  await p.screenshot({ path: join(OUT, 'build-light.png') });
  await ctx.close();
});

test('quality Fix jumps to the field; review type adds a line', async () => {
  const { ctx, p } = await page();
  await p.goto(URL0 + '#build');
  await p.click('[data-type=review]');
  await p.fill('#f-title', 'Quick ask'); await p.fill('#f-prompt', 'Write a nice summary of wind energy.');
  await p.waitForTimeout(250);
  await p.click('[data-tab=quality]');
  const before = Number(await p.locator('.dial .num').textContent());
  assert.ok(await p.locator('.checks .pill.warn', { hasText: 'Vague' }).count() === 1);
  await p.click('[data-act=append-fix][data-check=unsure]');
  await p.waitForTimeout(200);
  assert.match(await p.inputValue('#f-prompt'), /say you do not know/);
  assert.ok(Number(await p.locator('.dial .num').textContent()) > before);
  await ctx.close();
});

test('feedback becomes lessons: a step in future prompts and a warning', async () => {
  const { ctx, p } = await page();
  await p.goto(URL0 + '#build');
  await p.click('[data-type=research]');
  await p.fill('#f-topic', 'grid code compliance testing'); await p.waitForTimeout(200);
  await p.locator('[data-act=save-version]').first().click(); await p.click('[data-x=yes]'); await p.waitForTimeout(150);
  await p.click('[data-tab=feedback]');
  await p.fill('#fbIssues', 'It asked me questions before starting.');
  await p.fill('#fbResponse', 'Here are videos:\n| A | https://example.com/v |');
  await p.click('[data-act=fb-analyse]');
  assert.equal(await p.locator('[data-prop]').count(), 2);
  await p.locator('[data-prop="1"] input[value=warn]').check();
  await p.click('[data-act=fb-save]'); await p.waitForTimeout(150);
  assert.equal(await count(p, 'lessons'), 2); assert.equal(await count(p, 'feedback'), 1);
  // a new research prompt carries the step and shows the warning
  await p.click('[data-act=new]');
  await p.fill('#f-topic', 'tower foundation design'); await p.waitForTimeout(250);
  await p.click('[data-tab=prompt]');
  const txt = await p.locator('#promptText').textContent();
  assert.match(txt, /LESSONS FROM EARLIER ANSWERS[\s\S]*Do not reply with questions/);
  assert.equal(await p.locator('.status-line .pill', { hasText: '1 warning from past feedback' }).count(), 1);
  await p.click('[data-tab=quality]');
  await p.click('[data-act=warn-add]'); await p.waitForTimeout(150);
  assert.match(await p.inputValue('#f-extra'), /Open every link/);
  // reporting the same problem again counts it instead of duplicating
  await p.locator('[data-act=save-version]').first().click(); await p.click('[data-x=yes]'); await p.waitForTimeout(150);
  await p.click('[data-tab=feedback]');
  await p.fill('#fbIssues', 'Again it kept asking questions.');
  await p.click('[data-act=fb-analyse]');
  assert.equal(await p.locator('.pill', { hasText: 'Seen before' }).count(), 1);
  await p.click('[data-act=fb-save]'); await p.waitForTimeout(150);
  assert.equal(await count(p, 'lessons'), 2);
  assert.equal(await p.evaluate(() => Object.values(PB.Store.data.lessons).find(l => l.pattern === 'questions').seen), 2);
  // pause from Saved inputs removes the step
  await p.goto(URL0 + '#inputs');
  await p.locator('#lessons .item', { hasText: 'Asked questions' }).locator('[data-act=lesson-pause]').click();
  await p.goto(URL0 + '#build'); await p.click('[data-tab=prompt]');
  assert.doesNotMatch(await p.locator('#promptText').textContent(), /Do not reply with questions/);
  await p.goto(URL0 + '#inputs'); await p.screenshot({ path: join(OUT, 'lessons-light.png'), fullPage: true });
  await ctx.close();
});

test('backup and restore in another browser; Excel and CSV exports', async () => {
  const { ctx, p } = await page();
  await p.click('[data-act=sample-load]');
  assert.equal(await p.locator('.banner.info', { hasText: 'Sample data is loaded' }).count(), 1);
  await p.goto(URL0 + '#setup');
  const backup = await dl(p, '[data-act=backup]');
  await p.evaluate(() => PB.Store.put('lessons', { id: 'l_t', title: 'Test lesson', mode: 'step', scope: 'all', line: 'Step text', warning: '', seen: 1, active: true }));
  const xlsx = await dl(p, '[data-act=xlsx]');
  const csv = await dl(p, '[data-act=csv]');
  writeFileSync(join(OUT, 'exports.json'), JSON.stringify({ backup, xlsx, csv, builds: await count(p, 'builds'), versions: await count(p, 'versions') }));
  const counts = [await count(p, 'builds'), await count(p, 'versions'), await count(p, 'profiles')];
  const b = await page();
  await b.p.goto(URL0 + '#setup');
  await restore(b.p, backup);
  assert.deepEqual([await count(b.p, 'builds'), await count(b.p, 'versions'), await count(b.p, 'profiles')], counts);
  // restoring again changes nothing and deletes nothing
  await b.p.setInputFiles('#restoreFile', backup); await b.p.waitForSelector('.modal');
  assert.match(await b.p.locator('.modal').textContent(), /already has everything/);
  await b.p.click('[data-x=no]');
  assert.deepEqual([await count(b.p, 'builds'), await count(b.p, 'versions'), await count(b.p, 'profiles')], counts);
  // wrong file is refused with a plain message
  const bad = join(OUT, 'not-a-backup.json'); writeFileSync(bad, JSON.stringify({ app: 'expense-ledger', v: 1, data: {} }));
  await b.p.setInputFiles('#restoreFile', bad); await b.p.waitForTimeout(300);
  assert.match(await b.p.locator('#toast').textContent(), /not a Prompt Builder backup/);
  // remove sample in one tap
  await b.p.click('.banner [data-act=sample-remove]');
  assert.equal(await count(b.p, 'builds'), 0);
  assert.equal(await b.p.locator('.banner.info').count(), 0);
  await ctx.close(); await b.ctx.close();
});

test('two devices sync through a shared folder; deletions travel; late files tolerated', async () => {
  const folder = { files: {}, perm: 'granted' };
  const A = await page({}, folder), B = await page({}, folder);
  for (const d of [A, B]) { await d.p.goto(URL0 + '#setup'); await d.p.click('[data-act=sync-choose]'); await d.p.waitForTimeout(400); }
  // A adds a prompt
  await A.p.goto(URL0 + '#build');
  await A.p.fill('#f-title', 'From laptop A'); await A.p.fill('#f-goal', 'Something built on A.');
  await saveVersion(A.p);
  // B adds a prompt at the same time
  await B.p.goto(URL0 + '#build');
  await B.p.fill('#f-title', 'From phone B'); await B.p.fill('#f-goal', 'Something built on B.');
  await saveVersion(B.p);
  for (const d of [A, B]) await d.p.evaluate(() => PB.Sync.writeNow());
  for (const d of [A, B]) await d.p.evaluate(() => PB.Sync.pull());
  const titles = d => d.p.evaluate(() => Object.values(PB.Store.data.builds).filter(b => !b.d).map(b => b.title).sort());
  assert.deepEqual(await titles(A), ['From laptop A', 'From phone B']);
  assert.deepEqual(await titles(B), ['From laptop A', 'From phone B']);
  // each device writes one session file
  const names = Object.keys(folder.files);
  assert.equal(names.length, 2); assert.ok(names.every(n => /^prompt-builder-save-\d{14}-[a-z0-9]{5}\.json\.gz$/.test(n)));
  // delete on A reaches B
  await A.p.goto(URL0 + '#library');
  await A.p.locator('.item', { hasText: 'From phone B' }).locator('[data-act=del]').click();
  await A.p.click('[data-x=yes]');
  await A.p.evaluate(() => PB.Sync.writeNow());
  await B.p.evaluate(() => PB.Sync.pull());
  assert.deepEqual(await titles(B), ['From laptop A']);
  // a half-written file from a third device does not break sync
  folder.files['prompt-builder-save-20260101000000-zzzzz.json.gz'] = { b: Buffer.from([31, 139, 8, 0, 1, 2]), t: Date.now() };
  await B.p.evaluate(() => PB.Sync.pull());
  assert.equal(await B.p.evaluate(() => PB.Sync.state), 'ok');
  assert.match(await B.p.evaluate(() => PB.Sync.detail), /not ready yet/);
  // later the full file arrives and is merged
  const { gzipSync } = await import('node:zlib');
  const third = { app: 'prompt-builder', v: 1, device: 'zzzzz', data: { builds: { b_third: { id: 'b_third', u: Date.now(), title: 'From desktop C', type: 'app', tags: [], inputs: {} } } } };
  folder.files['prompt-builder-save-20260101000000-zzzzz.json.gz'] = { b: gzipSync(JSON.stringify(third)), t: Date.now() + 5 };
  await B.p.evaluate(() => PB.Sync.pull());
  assert.deepEqual(await titles(B), ['From desktop C', 'From laptop A']);
  assert.match(await B.p.locator('#syncChip').textContent(), /Synced/);
  // keeps the newest 3 of its own files
  for (let i = 0; i < 4; i++) folder.files[`prompt-builder-save-2020010100000${i}-${await B.p.evaluate(() => PB.Sync.device())}.json`] = { b: Buffer.from('{}'), t: 1 };
  await B.p.evaluate(() => PB.Sync.writeNow());
  const own = await B.p.evaluate(() => PB.Sync.device());
  assert.equal(Object.keys(folder.files).filter(n => n.includes('-' + own + '.json')).length, 3);
  // permission loss shows the Allow folder access banner
  folder.perm = 'prompt';
  const C = await page({}, folder);
  // headless Chromium cannot store a fake folder handle in IndexedDB, so hand it back the way a real browser would after a restart
  await C.p.evaluate(async () => { PB.Store.getHandle = async () => window.__fakeDir; await PB.Sync.init(); });
  await C.p.goto(URL0 + '#library'); await C.p.waitForTimeout(200);
  assert.equal(await C.p.locator('.banner', { hasText: 'Allow folder access' }).count(), 1);
  folder.perm = 'granted';
  await C.p.click('.banner [data-act=sync-allow]'); await C.p.waitForTimeout(300);
  assert.equal(await C.p.locator('.banner', { hasText: 'Allow folder access' }).count(), 0);
  assert.notEqual(await C.p.evaluate(() => PB.Sync.state), 'access');
  await C.p.goto(URL0 + '#setup'); await C.p.click('[data-act=sync-off]'); await C.p.click('[data-x=yes]'); await C.p.waitForTimeout(200);
  assert.match(await C.p.locator('#syncChip').textContent(), /This device only/);
  await A.p.screenshot({ path: join(OUT, 'sync-setup.png') });
  await A.ctx.close(); await B.ctx.close(); await C.ctx.close();
});

test('offline reload works through the service worker', async () => {
  const { ctx, p } = await page();
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForSelector('.tab');
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('.tab');
  assert.equal(await p.locator('.brand-name').textContent(), 'Prompt Builder');
  await ctx.setOffline(false);
  await ctx.close();
});

test('phone widths: no sideways scroll, tab targets at least 44 px; every page in both themes', async () => {
  for (const w of [320, 360, 390]) {
    const { ctx, p } = await page({ viewport: { width: w, height: 760 } });
    await p.click('[data-act=sample-load]');
    for (const r of ['start', 'build', 'library', 'inputs', 'setup']) {
      await p.goto(URL0 + '#' + r); await p.waitForTimeout(150);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 0, `${r} at ${w}px scrolls sideways by ${over}px`);
      const small = await p.evaluate(() => Array.from(document.querySelectorAll('.tab')).filter(t => { const b = t.getBoundingClientRect(); return b.height < 44 || b.width < 44; }).length);
      assert.equal(small, 0, `tab targets under 44px at ${w}`);
      if (w === 390) for (const theme of ['light', 'dark']) {
        await p.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
        await p.screenshot({ path: join(OUT, `phone-${r}-${theme}.png`), fullPage: r !== 'build' });
      }
    }
    await p.goto(URL0 + '#library'); await p.locator('[data-act=open]').first().click(); await p.click('[data-tab=feedback]');
    await p.fill('#fbIssues', 'It asked questions and links were broken'); await p.click('[data-act=fb-analyse]');
    const fo = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(fo <= 0, `feedback tab at ${w}px scrolls sideways by ${fo}px`);
    if (w === 320) await p.screenshot({ path: join(OUT, 'phone-feedback-320.png'), fullPage: true });
    await ctx.close();
  }
  const { ctx, p } = await page();
  await p.click('[data-act=sample-load]');
  for (const r of ['start', 'build', 'library', 'inputs', 'setup']) {
    await p.goto(URL0 + '#' + r); await p.waitForTimeout(150);
    await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await p.screenshot({ path: join(OUT, `desk-${r}-dark.png`) });
  }
  await p.goto(URL0 + '#build'); await p.click('[data-tab=thinking]');
  await p.screenshot({ path: join(OUT, 'desk-thinking-dark.png') });
  await ctx.close();
});

test('restore after deleting: deleted items come back only when asked; restore never deletes', async () => {
  const src = await page();
  await src.p.click('[data-act=sample-load]');
  await src.p.goto(URL0 + '#build'); await src.p.click('[data-type=app]');
  await src.p.fill('#f-title', 'Keep me'); await src.p.fill('#f-goal', 'A small tool.'); await src.p.fill('#f-role', 'Senior tester');
  await src.p.locator('[data-act=save-version]').first().click(); await src.p.click('[data-x=yes]'); await src.p.waitForTimeout(150);
  await src.p.goto(URL0 + '#setup');
  const file = await dl(src.p, '[data-act=backup]');
  const full = { b: await count(src.p, 'builds'), m: await count(src.p, 'memory'), p: await count(src.p, 'profiles') };
  await src.ctx.close();
  const { ctx, p } = await page();
  await restore(p, file);
  assert.deepEqual({ b: await count(p, 'builds'), m: await count(p, 'memory'), p: await count(p, 'profiles') }, full);
  // the user's scenario: delete saved entries, a profile and a prompt, then restore the same file
  await p.goto(URL0 + '#inputs');
  while (await p.locator('[data-act=mem-del]').count()) { await p.locator('[data-act=mem-del]').first().click(); await p.waitForTimeout(60); }
  await p.locator('[data-act=prof-del]').first().click(); await p.click('[data-x=yes]');
  await p.goto(URL0 + '#library');
  await p.locator('.item', { hasText: 'Keep me' }).locator('[data-act=del]').click(); await p.click('[data-x=yes]');
  assert.equal(await count(p, 'memory'), 0);
  await p.goto(URL0 + '#setup'); await p.setInputFiles('#restoreFile', file); await p.waitForSelector('.modal');
  const text = await p.locator('.modal').textContent();
  assert.match(text, /Deleted on this device:/); assert.doesNotMatch(text, /Nothing to restore/);
  await p.locator('#rsRevive').setChecked(false); await p.click('.modal [data-x=yes]'); await p.waitForTimeout(150);
  assert.equal(await count(p, 'memory'), 0, 'left unticked, deleted items stay deleted');
  await restore(p, file, true);
  assert.deepEqual({ b: await count(p, 'builds'), m: await count(p, 'memory'), p: await count(p, 'profiles') }, full);
  // a backup taken after a deletion carries a tombstone; restoring it elsewhere must not delete
  await p.goto(URL0 + '#library');
  await p.locator('.item', { hasText: 'Keep me' }).locator('[data-act=del]').click(); await p.click('[data-x=yes]');
  await p.goto(URL0 + '#setup'); const withTomb = await dl(p, '[data-act=backup]');
  const other = await page();
  await restore(other.p, file); const before = await count(other.p, 'builds');
  await other.p.goto(URL0 + '#setup'); await other.p.setInputFiles('#restoreFile', withTomb); await other.p.waitForSelector('.modal');
  assert.match(await other.p.locator('.modal').textContent(), /Deletions in the backup ignored: 2 \(restore never deletes\)/);
  await other.p.click('.modal [data-x=no]');
  assert.equal(await count(other.p, 'builds'), before);
  await ctx.close(); await other.ctx.close();
});

test('every button works: audit of all actions', async () => {
  const { ctx, p } = await page({ permissions: ['clipboard-read', 'clipboard-write'] });
  const clip = () => p.evaluate(() => navigator.clipboard.readText());
  // theme cycles system -> light -> dark -> system
  const themes = [];
  for (let i = 0; i < 3; i++) { await p.click('[data-act=theme]'); themes.push(await p.evaluate(() => document.documentElement.getAttribute('data-theme') || 'system')); }
  assert.deepEqual(themes, ['light', 'dark', 'system']);
  await p.click('[data-act=go-sync]'); await p.waitForTimeout(100);
  assert.equal(await p.evaluate(() => location.hash), '#setup');
  // profiles: new, edit, default
  await p.goto(URL0 + '#inputs');
  await p.click('[data-act=prof-new]'); await p.fill('#p-label', 'Work'); await p.fill('#p-owner', 'Tester'); await p.click('[data-x=yes]');
  await p.click('[data-act=prof-new]'); await p.fill('#p-label', 'Other'); await p.click('[data-x=yes]');
  await p.locator('.item', { hasText: 'Other' }).locator('[data-act=prof-default]').click();
  assert.equal(await p.locator('.item', { hasText: 'Other' }).locator('.pill', { hasText: 'Default' }).count(), 1);
  await p.locator('.item', { hasText: 'Work' }).locator('[data-act=prof-edit]').click(); await p.fill('#p-location', 'Chennai'); await p.click('[data-x=yes]');
  assert.match(await p.locator('.item', { hasText: 'Work' }).textContent(), /Tester, Chennai/);
  // build with profile, copy, download, save twice
  await p.goto(URL0 + '#build'); await p.click('[data-act=new]').catch(() => {}); if (await p.locator('.modal').count()) await p.click('[data-x=yes]');
  await p.selectOption('#f-profile', { label: 'Work' });
  await p.fill('#f-title', 'Audit tool'); await p.fill('#f-goal', 'Track expenses on my phone.'); await p.locator('summary', { hasText: 'Prompt options' }).click(); await p.fill('#f-tags', 'audit, test');
  await p.waitForTimeout(200);
  assert.match(await p.locator('#promptText').textContent(), /Owner: Tester, Chennai/);
  await p.click('[data-act=copy-prompt]'); assert.match(await clip(), /^ROLE AND WORKING RULES/);
  await p.click('[data-tab=thinking]'); await p.click('[data-act=copy-thinking]'); assert.match(await clip(), /How an AI will think through "Audit tool"/);
  await p.click('[data-tab=prompt]');
  const txt = await dl(p, '[data-act=dl-prompt]'); assert.match(readFileSync(txt, 'utf8'), /Build "Audit tool"/);
  await p.locator('[data-act=save-version]').first().click(); await p.click('[data-x=yes]'); await p.waitForTimeout(100);
  await p.fill('#f-need', 'Missed days.'); await p.waitForTimeout(200);
  await p.locator('[data-act=save-version]').first().click(); await p.fill('#vNote', 'second'); await p.click('[data-x=yes]'); await p.waitForTimeout(100);
  // save with no change is refused
  await p.locator('[data-act=save-version]').first().click(); assert.match(await p.locator('#toast').textContent(), /No changes/);
  // versions: view, copy
  await p.click('[data-tab=versions]');
  await p.locator('#panel .item').first().locator('[data-act=v-view]').click();
  assert.match(await p.locator('.modal').textContent(), /v2/); await p.click('.modal [data-x=no]');
  await p.locator('#panel .item').nth(1).locator('[data-act=v-copy]').click(); assert.doesNotMatch(await clip(), /Missed days/);
  // quality Fix opens the field
  await p.click('[data-tab=quality]');
  if (await p.locator('[data-act=fix][data-field=examples]').count()) { await p.click('[data-act=fix][data-field=examples]'); await p.waitForTimeout(400); assert.equal(await p.evaluate(() => document.activeElement.id), 'f-examples'); }
  // tags Previous picker offers the saved tags
  await p.keyboard.press('Escape');
  await p.click('[data-act=mem][data-field=tags]'); assert.ok(await p.locator('.pop-item', { hasText: 'audit, test' }).count() >= 1); await p.keyboard.press('Escape');
  // type switch on a saved prompt starts a new one
  await p.click('[data-type=content]'); assert.match(await p.locator('#toast').textContent(), /new prompt/);
  await p.click('[data-type=app]');
  // feedback: save a good result, then delete it
  await p.goto(URL0 + '#library'); await p.locator('.item', { hasText: 'Audit tool' }).locator('[data-act=open]').click();
  assert.match(await p.locator('.modal').textContent(), /Leave unsaved changes\?/); await p.click('[data-x=yes]'); await p.waitForTimeout(150);
  await p.click('[data-tab=feedback]'); await p.check('input[name=fbOutcome][value=good]'); await p.click('[data-act=fb-save]'); await p.waitForTimeout(100);
  assert.equal(await count(p, 'feedback'), 1);
  await p.click('[data-tab=feedback]'); await p.click('[data-act=fb-del]'); await p.click('[data-x=yes]');
  assert.equal(await count(p, 'feedback'), 0);
  // lessons: add, edit, switch mode, delete
  await p.goto(URL0 + '#inputs');
  await p.click('[data-act=lesson-new]'); await p.fill('#lTitle', 'Use rupees'); await p.fill('#lLine', 'Show money in rupees.'); await p.click('[data-x=yes]');
  await p.goto(URL0 + '#build'); await p.click('[data-tab=prompt]'); assert.match(await p.locator('#promptText').textContent(), /Show money in rupees\./);
  await p.goto(URL0 + '#inputs');
  await p.locator('#lessons .item', { hasText: 'Use rupees' }).locator('[data-act=lesson-edit]').click(); await p.fill('#lLine', 'Show money in ₹.'); await p.click('[data-x=yes]');
  await p.locator('#lessons .item', { hasText: 'Use rupees' }).locator('[data-act=lesson-mode]').click();
  assert.equal(await p.evaluate(() => Object.values(PB.Store.data.lessons)[0].mode), 'warn');
  await p.locator('#lessons .item', { hasText: 'Use rupees' }).locator('[data-act=lesson-del]').click(); await p.click('[data-x=yes]');
  assert.equal(await count(p, 'lessons'), 0);
  // saved entries: pin, edit, delete
  await p.locator('.item', { hasText: 'Audit tool' }).locator('[data-act=mem-pin]').first().click();
  assert.equal(await p.locator('.item', { hasText: 'Audit tool' }).locator('.pill', { hasText: 'Pinned' }).count(), 1);
  await p.locator('.item', { hasText: 'Audit tool' }).locator('[data-act=mem-edit]').first().click(); await p.fill('#memText', 'Audit tool v2'); await p.click('[data-x=yes]');
  assert.equal(await p.locator('.item', { hasText: 'Audit tool v2' }).count(), 1);
  await p.locator('.item', { hasText: 'Audit tool v2' }).locator('[data-act=mem-del]').click();
  assert.equal(await p.locator('.item', { hasText: 'Audit tool v2' }).count(), 0);
  await p.locator('.item', { hasText: 'Other' }).locator('[data-act=prof-del]').click(); await p.click('[data-x=yes]');
  // library: search, filters, reset, copy, duplicate, delete
  await p.goto(URL0 + '#library');
  await p.fill('#libQ', 'zzz-no-match'); assert.match(await p.locator('#libCount').textContent(), /^0 of/);
  await p.click('[data-act=lib-reset]'); assert.equal(await p.inputValue('#libQ'), '');
  await p.selectOption('#libTag', 'audit'); assert.match(await p.locator('#libCount').textContent(), /^1 of/);
  await p.selectOption('#libTag', ''); await p.selectOption('#libSort', 'title');
  await p.locator('.item', { hasText: 'Audit tool' }).locator('[data-act=lib-copy]').click(); assert.match(await clip(), /Missed days/);
  await p.locator('.item', { hasText: 'Audit tool' }).locator('[data-act=dup]').click(); await p.waitForTimeout(150);
  assert.equal(await p.inputValue('#f-title'), 'Audit tool (copy)');
  await p.goto(URL0 + '#library');
  await p.locator('.item', { hasText: 'Audit tool' }).locator('[data-act=del]').click(); await p.click('[data-x=yes]');
  assert.equal(await count(p, 'builds'), 0); assert.equal(await count(p, 'versions'), 0);
  // setup defaults apply to new prompts
  await p.goto(URL0 + '#setup');
  await p.selectOption('#setStyle', 'markdown'); await p.selectOption('#setUnclear', 'ask');
  await p.goto(URL0 + '#build'); await p.click('[data-act=new]'); if (await p.locator('.modal').count()) await p.click('[data-x=yes]');
  await p.fill('#f-title', 'Defaults'); await p.fill('#f-goal', 'Check defaults.'); await p.waitForTimeout(200);
  const t2 = await p.locator('#promptText').textContent();
  assert.match(t2, /^## Role and working rules/); assert.match(t2, /ask me up to five focused questions/);
  // CSV export, install state, sync stop
  await p.goto(URL0 + '#setup');
  const csvF = await dl(p, '[data-act=csv]'); assert.ok(readFileSync(csvF, 'utf8').startsWith('\ufeffTitle,'));
  assert.ok(await p.locator('[data-act=install]').isDisabled());
  await ctx.close();
});

test('optional: a restored backup reopens every prompt exactly as saved (set RESTORE_CHECK to a backup file)', { skip: !process.env.RESTORE_CHECK }, async () => {
  const { ctx, p } = await page();
  await p.goto(URL0 + '#setup');
  await restore(p, process.env.RESTORE_CHECK);
  const ids = await p.evaluate(() => Object.values(PB.Store.data.builds).filter(b => !b.d).map(b => b.id));
  assert.ok(ids.length > 0);
  for (const id of ids) {
    await p.goto(URL0 + '#library'); await p.locator(`[data-act=open][data-id="${id}"]`).click(); await p.waitForTimeout(250);
    assert.equal(await p.locator('.status-line .pill', { hasText: 'Unsaved changes' }).count(), 0, 'prompt differs from its saved version: ' + id);
    const same = await p.evaluate(() => { const v = Object.values(PB.Store.data.versions).filter(x => x.buildId === PB.S.draft.buildId).sort((a, b) => b.at - a.at)[0]; return v.prompt === PB.S.out.prompt; });
    assert.ok(same, 'regenerated prompt text matches the stored version for ' + id);
  }
  await p.goto(URL0 + '#library'); await p.screenshot({ path: join(OUT, 'restored-library.png'), fullPage: true });
  await p.locator('[data-act=open]').first().click(); await p.click('[data-tab=versions]');
  if (await p.locator('#panel .item').count() > 1) { // compare the original (v1) with the current prompt
    await p.locator('#panel .item').nth(1).locator('[data-act=v-diff]').click();
    assert.ok(await p.locator('.diff .plus').count() > 5);
    await p.screenshot({ path: join(OUT, 'restored-diff.png') });
  }
  await ctx.close();
});

test('no page errors and no request outside the site', () => {
  const real = errors.filter(e => !/Folder could not be remembered/.test(e));
  assert.deepEqual(real, []);
  assert.deepEqual(outside, []);
});
