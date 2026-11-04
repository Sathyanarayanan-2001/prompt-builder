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
const openGroups = p => p.evaluate(() => document.querySelectorAll('details.mem-group').forEach(d => { d.open = true; }));
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
    await p.goto(URL0 + '#library'); await p.locator('[data-act=open]').first().click(); await p.click('[data-act=mview][data-v=output]'); await p.click('[data-tab=feedback]');
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
  await p.goto(URL0 + '#inputs'); await openGroups(p);
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
  // saved entries: pin, edit, delete (groups are collapsed until opened)
  await openGroups(p);
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

test('reviewer panel: notes, add to prompt, dismiss, change panel, favourites, panel prompt', async () => {
  const { ctx, p } = await page({ permissions: ['clipboard-read', 'clipboard-write'] });
  await p.goto(URL0 + '#build');
  await p.fill('#f-title', 'Expense ledger'); await p.fill('#f-goal', 'A daily expense tracker for my HDFC bank accounts with monthly budget limits.');
  await p.waitForTimeout(250);
  await p.click('[data-tab=reviewers]');
  const panel = await p.evaluate(() => PB.S.out.panel.map(x => x.id));
  assert.ok(panel.length >= 5 && panel.length <= 8 && panel.includes('ca'), panel.join());
  // the accountant's reconciliation note: add it, the line lands in the field and the note goes away
  const card = p.locator('.rv-card', { hasText: 'Chartered accountant' });
  const li = card.locator('li', { hasText: 'No reconciliation' });
  const line = await li.locator('.rv-line').textContent();
  const before = await p.evaluate(() => PB.S.out.openNotes);
  await li.locator('[data-act=rv-add]').click(); await p.waitForTimeout(150);
  assert.match(await p.inputValue('#f-rules'), new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const afterAdd = await p.evaluate(() => PB.S.out.openNotes);
  assert.ok(afterAdd <= before - 1, 'one line can satisfy several reviewers');
  assert.match(await p.locator('#toast').textContent(), /Added to Exact rules/);
  // dismiss and restore
  await p.click('[data-tab=reviewers]');
  const firstKey = await p.locator('[data-act=rv-dismiss]').first().getAttribute('data-key');
  await p.locator('[data-act=rv-dismiss]').first().click();
  assert.equal(await p.evaluate(() => PB.S.out.openNotes), afterAdd - 1);
  await p.click('[data-act=rv-showdis]'); await p.click(`[data-act=rv-undismiss][data-key="${firstKey}"]`);
  assert.equal(await p.evaluate(() => PB.S.out.openNotes), afterAdd);
  // panel prompt copies the panel and the prompt
  await p.click('[data-act=rv-copy]');
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /^You are a review panel of \d experts/); assert.match(clip, /Meera, chartered accountant/); assert.match(clip, /<<<PROMPT\nROLE AND WORKING RULES/);
  // change panel: add the grid code engineer, remove the accountant, star a favourite
  await p.click('[data-act=rv-panel]');
  await p.fill('#dirQ', 'grid code');
  await p.locator('.dir-item', { hasText: 'Grid code compliance engineer' }).locator('[data-act=rv-toggle]').click();
  await p.fill('#dirQ', 'chartered');
  await p.locator('.dir-item', { hasText: 'Chartered accountant' }).locator('[data-act=rv-toggle]').click();
  await p.fill('#dirQ', ''); await p.selectOption('#dirDom', 'software');
  await p.locator('.dir-item', { hasText: 'Security engineer' }).locator('[data-act=rv-fav]').click();
  assert.equal(await p.locator('.dir-item', { hasText: 'Security engineer' }).locator('[data-act=rv-fav]').getAttribute('aria-pressed'), 'true');
  await p.click('.modal [data-x=no]');
  const p2 = await p.evaluate(() => PB.S.out.panel.map(x => x.id));
  assert.ok(p2.includes('gc') && p2.includes('sec') && !p2.includes('ca'), p2.join());
  // panel choices are not prompt changes, and favourites apply to new prompts
  await p.click('[data-act=new]'); if (await p.locator('.modal').count()) await p.click('[data-x=yes]');
  await p.fill('#f-title', 'Login page'); await p.fill('#f-goal', 'A web page with a login form.'); await p.waitForTimeout(200);
  assert.ok((await p.evaluate(() => PB.S.out.panel.map(x => x.id))).includes('sec'));
  await p.goto(URL0 + '#setup'); assert.match(await p.locator('.set-row', { hasText: 'Reviewers' }).textContent(), /1 favourite/);
  await ctx.close();
});

test('real-AI panel answer: paste, preview, apply to fields, save, reopen with matching fields', async () => {
  const { ctx, p } = await page({ permissions: ['clipboard-read', 'clipboard-write'] });
  await p.goto(URL0 + '#build');
  await p.fill('#f-title', 'Expense ledger'); await p.fill('#f-goal', 'A daily expense tracker for my bank accounts, offline on my phone.'); await p.fill('#f-rules', 'Savings = income - expense');
  await p.locator('[data-act=save-version]').first().click(); await p.click('[data-x=yes]'); await p.waitForTimeout(150);
  await p.click('[data-tab=reviewers]'); await p.click('[data-act=rv-copy]');
  const pp = await p.evaluate(() => navigator.clipboard.readText());
  assert.match(pp, /FINALLY, RETURN THE FIELDS/); assert.match(pp, /- rules \| Exact rules and formulas \| list \| "Savings = income - expense"/);
  // 1. an answer with a fields block
  const answer = 'Panel notes.\n```json\n' + JSON.stringify({ fields: { goal: 'A daily expense and budget tracker for my HDFC and UCO accounts, offline on my Android phone.', rules: 'Savings = income - expense\nReconcile each account against the bank balance at every month end.', need: 'A missed day must show as a gap, never as zero.' } }) + '\n```';
  await p.click('[data-act=rv-paste]'); await p.fill('#paIn', answer); await p.click('#paRead');
  assert.match(await p.locator('#paOut').textContent(), /Read the fields block in the answer\. 3 fields would change\./);
  await p.locator('.paPick[value=need]').uncheck(); // the user can leave a change out
  await p.click('#paApply'); await p.waitForTimeout(150);
  assert.equal(await p.inputValue('#f-goal'), 'A daily expense and budget tracker for my HDFC and UCO accounts, offline on my Android phone.');
  assert.equal(await p.inputValue('#f-need'), '');
  assert.equal(await p.locator('.f-changed').count(), 2);
  assert.equal(await p.locator('.status-line .pill', { hasText: 'Unsaved changes' }).count(), 1);
  // the user edits a field before saving; the final prompt carries both
  await p.fill('#f-goal', (await p.inputValue('#f-goal')) + ' It works on two laptops too.'); await p.waitForTimeout(200);
  assert.match(await p.locator('#promptText').textContent(), /Reconcile each account[\s\S]*/);
  await p.locator('[data-act=save-version]').first().click();
  assert.equal(await p.inputValue('#vNote'), 'After real-AI panel review'); await p.click('[data-x=yes]'); await p.waitForTimeout(150);
  const v = await p.evaluate(() => Object.values(PB.Store.data.versions).sort((a, b) => b.at - a.at)[0]);
  assert.match(v.panelReview, /Panel notes/); assert.match(v.prompt, /two laptops too/); assert.match(v.prompt, /Reconcile each account/);
  // reopen: the fields match what was saved
  await p.click('[data-act=new]'); if (await p.locator('.modal').count()) await p.click('[data-x=yes]');
  await p.goto(URL0 + '#library'); await p.locator('[data-act=open]').first().click(); await p.waitForTimeout(150);
  assert.match(await p.inputValue('#f-goal'), /HDFC and UCO accounts, offline on my Android phone\. It works on two laptops too\.$/);
  assert.equal(await p.inputValue('#f-rules'), 'Savings = income - expense\nReconcile each account against the bank balance at every month end.');
  assert.equal(await p.locator('.status-line .pill', { hasText: 'Unsaved changes' }).count(), 0);
  await p.click('[data-tab=versions]'); assert.equal(await p.locator('#panel .pill', { hasText: 'Panel reviewed' }).count(), 1);
  // 2. an answer with only the improved prompt: sections are matched
  const cur = await p.evaluate(() => PB.S.out.prompt);
  const improved = cur.replace(/(\n\d+\. KNOWN PITFALLS \(avoid them\)\n)/, '$1- Never store card PINs.\n');
  await p.click('[data-tab=reviewers]'); await p.click('[data-act=rv-paste]'); await p.fill('#paIn', 'Improved prompt:\n```\n' + improved + '\n```'); await p.click('#paRead');
  assert.match(await p.locator('#paOut').textContent(), /Matched the improved prompt's sections/);
  await p.click('#paApply'); await p.waitForTimeout(150);
  assert.match(await p.inputValue('#f-pitfalls'), /Never store card PINs\./);
  // 3. unrelated text can be stored as a Review prompt
  await p.click('[data-tab=reviewers]'); await p.click('[data-act=rv-paste]'); await p.fill('#paIn', 'Some unrelated notes about lunch.'); await p.click('#paRead');
  await p.click('#paReview'); await p.waitForTimeout(200);
  assert.ok(await p.evaluate(() => Object.values(PB.Store.data.builds).some(b => !b.d && b.type === 'review' && /panel review/.test(b.title))));
  await ctx.close();
});

test('layout rules: aligned controls, labelled inputs, AA contrast, 44 px touch targets', async () => {
  const audit = async p => p.evaluate(() => {
    const out = { misaligned: [], unlabelled: [], lowContrast: [] };
    const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const bgOf = el => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(.*, 0\)|transparent/.test(c)) return c; el = el.parentElement; } return getComputedStyle(document.body).backgroundColor; };
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    // controls placed side by side in one row share their bottom edge
    for (const row of document.querySelectorAll('.set-ctl, .form-row:not(.form-row-check), .modal-foot, .acts')) {
      const ctl = [...row.querySelectorAll(':scope > .btn, :scope > select, :scope > .f select, :scope > .f input, :scope > .seg-field .seg')].filter(vis);
      const byLine = {}; ctl.forEach(c => { const r = c.getBoundingClientRect(); const k = Math.round(r.top / 30); (byLine[k] = byLine[k] || []).push(r.bottom); });
      for (const b of Object.values(byLine)) if (Math.max(...b) - Math.min(...b) > 2) out.misaligned.push(row.className + ' ' + (row.closest('[id],section')?.querySelector('h2,h3')?.textContent || ''));
    }
    // every visible form control has an accessible name
    for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')) {
      if (!vis(el) && el.type !== 'radio') continue;
      const named = el.labels?.length || el.getAttribute('aria-label') || el.closest('label');
      if (!named) out.unlabelled.push(el.id || el.name || el.outerHTML.slice(0, 60));
    }
    // text contrast: 4.5:1 for body-size text
    for (const el of document.querySelectorAll('p, span, label, h1, h2, h3, .btn, .tab, .otab, td, th, .pill, .set-hint, .f-hint, .meta, .mem-btn')) {
      if (!vis(el) || !el.textContent.trim() || el.closest('[disabled], .btn:disabled, .shade')) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 1) continue;
      const a = lum(cs.color), b = lum(bgOf(el)); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 4.5) out.lowContrast.push(`${ratio.toFixed(2)} ${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 30)}"`);
    }
    return out;
  });
  { // the checks themselves must catch planted faults
    const { ctx, p } = await page();
    await p.goto(URL0 + '#setup');
    await p.evaluate(() => {
      const ctl = document.querySelector('.set-ctl'); const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Off'; b.style.marginBottom = '12px'; ctl.appendChild(b);
      const i = document.createElement('input'); i.id = 'naked'; document.querySelector('.settings').appendChild(i);
      const q = document.createElement('p'); q.textContent = 'faint text'; q.style.color = '#cfd6d4'; document.querySelector('.settings').appendChild(q);
    });
    const a = await audit(p);
    assert.equal(a.misaligned.length, 1); assert.deepEqual(a.unlabelled, ['naked']); assert.equal(a.lowContrast.length, 1);
    await ctx.close();
  }
  for (const [vp, extra] of [[{ width: 1360, height: 900 }, {}], [{ width: 390, height: 844 }, { hasTouch: true, isMobile: true }]]) {
    for (const theme of ['light', 'dark']) {
      const { ctx, p } = await page({ viewport: vp, ...extra });
      await p.click('[data-act=sample-load]');
      await p.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      const views = [['start'], ['library'], ['inputs'], ['setup'], ['build', 'prompt'], ['build', 'quality'], ['build', 'reviewers'], ['build', 'feedback']];
      for (const [r, tab] of views) {
        await p.goto(URL0 + '#' + r); await p.waitForTimeout(120);
        await p.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
        if (r === 'build' && tab) {
          if (await p.locator('.mview').isVisible()) await p.click('[data-act=mview][data-v=output]');
          if (tab === 'feedback') { await p.goto(URL0 + '#library'); await p.locator('[data-act=open]').first().click(); if (await p.locator('.mview').isVisible()) await p.click('[data-act=mview][data-v=output]'); }
          await p.click(`[data-tab=${tab}]`); await p.waitForTimeout(80);
        }
        if (tab === 'reviewers') { await p.click('[data-act=rv-paste]'); await p.fill('#paIn', '```json\n{"fields": {"extra": "One more line"}}\n```'); await p.click('#paRead'); await p.waitForTimeout(80); const pa = await audit(p); assert.deepEqual([pa.misaligned, pa.unlabelled, pa.lowContrast], [[], [], []], 'paste dialog at ' + vp.width + ' ' + theme); await p.click('.modal [data-x=back]'); await p.click('.modal [data-x=no]'); }
        if (tab === 'reviewers') { await p.click('[data-act=rv-panel]'); await p.waitForTimeout(80); const d = await audit(p); assert.deepEqual([d.misaligned, d.unlabelled], [[], []], 'reviewer directory at ' + vp.width); await p.click('.modal [data-x=no]'); }
        const a = await audit(p);
        const where = `${r}${tab ? '/' + tab : ''} at ${vp.width}px ${theme}`;
        assert.deepEqual(a.misaligned, [], 'misaligned controls on ' + where);
        assert.deepEqual(a.unlabelled, [], 'unlabelled inputs on ' + where);
        assert.deepEqual(a.lowContrast, [], 'low contrast on ' + where);
        if (extra.hasTouch) {
          const small = await p.evaluate(() => [...document.querySelectorAll('.btn:not(.sm), .tab, .otab, select, input[type=search]')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height && b.height < 44; }).map(e => e.textContent.trim().slice(0, 20) || e.id));
          assert.deepEqual(small, [], 'touch targets under 44 px on ' + where);
        }
      }
      await ctx.close();
    }
  }
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
