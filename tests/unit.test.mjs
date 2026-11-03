// Round 1: expectations worked out by hand, not by calling the code under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const Engine = require('../src/engine.js');
const Model = require('../src/model.js');
const Files = require('../src/files.js');

// ---------- model
test('canon sorts keys at every depth', () => {
  assert.equal(Model.canon({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
});
test('pick: newer u wins; tie goes to larger canonical JSON', () => {
  assert.deepEqual(Model.pick({ id: 'x', u: 5, v: 'old' }, { id: 'x', u: 6, v: 'new' }).v, 'new');
  assert.deepEqual(Model.pick({ id: 'x', u: 6, v: 'b' }, { id: 'x', u: 6, v: 'a' }).v, 'b'); // "b" > "a"
  assert.deepEqual(Model.pick({ id: 'x', u: 6, v: 'a' }, { id: 'x', u: 6, v: 'b' }).v, 'b');
  assert.equal(Model.pick({ id: 'x', u: 9, d: 1 }, { id: 'x', u: 8, title: 'kept?' }).d, 1); // tombstone newer wins
});
test('merge flags: local changed and remote behind (hand case)', () => {
  const L = Model.empty(), R = Model.empty();
  L.builds.a = { id: 'a', u: 10, t: 'L' }; R.builds.a = { id: 'a', u: 20, t: 'R' };
  L.builds.b = { id: 'b', u: 5 };
  const m = Model.merge(L, R);
  assert.equal(m.data.builds.a.t, 'R'); assert.ok(m.data.builds.b);
  assert.equal(m.localChanged, true); assert.equal(m.remoteBehind, true);
  const m2 = Model.merge(m.data, m.data);
  assert.equal(m2.localChanged, false); assert.equal(m2.remoteBehind, false);
});
test('merge is commutative, associative and idempotent on randomised data', () => {
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const gen = () => { const d = Model.empty(); for (const c of Model.COLLECTIONS) for (let i = 0; i < 12; i++) if (rnd(2)) { const id = c + rnd(8); d[c][id] = rnd(4) === 0 ? { id, d: 1, u: rnd(6) } : { id, u: rnd(6), v: rnd(3), w: { k: rnd(2) } }; } return d; };
  for (let t = 0; t < 300; t++) {
    const a = gen(), b = gen(), c = gen();
    const ab = Model.merge(a, b).data, ba = Model.merge(b, a).data;
    assert.equal(Model.canon(ab), Model.canon(ba), 'commutative');
    assert.equal(Model.canon(Model.merge(Model.merge(a, b).data, c).data), Model.canon(Model.merge(a, Model.merge(b, c).data).data), 'associative');
    assert.equal(Model.canon(Model.merge(ab, ab).data), Model.canon(ab), 'idempotent');
  }
});
test('sanitize drops wrong shapes and turns u into a number', () => {
  const s = Model.sanitize({ builds: { a: { u: '12', title: 'x' }, b: 'nope', c: { title: 'no u' }, d: [1] }, versions: [1, 2], junk: { x: { u: 1 } } });
  assert.deepEqual(Object.keys(s.builds), ['a']); assert.equal(s.builds.a.u, 12); assert.equal(s.builds.a.id, 'a');
  assert.deepEqual(s.versions, {}); assert.equal(s.junk, undefined);
});
test('backup: rejects other apps and newer versions with plain messages', () => {
  assert.throws(() => Model.readBackup({ app: 'expense-ledger', v: 1, data: {} }), /not a Prompt Builder backup/);
  assert.throws(() => Model.readBackup({ app: 'prompt-builder', v: 2, data: {} }), /newer version/);
  assert.deepEqual(Object.keys(Model.readBackup({ app: 'prompt-builder', v: 1, data: { builds: { a: { u: 1 } } } }).builds), ['a']);
});
test('memId is stable and trims the value', () => {
  assert.equal(Model.memId('role', ' Senior engineer '), Model.memId('role', 'Senior engineer'));
  assert.notEqual(Model.memId('role', 'x'), Model.memId('goal', 'x'));
});
test('nextU is strictly increasing within a device', () => {
  let prev = 0; for (let i = 0; i < 1000; i++) { const u = Model.nextU(); assert.ok(u > prev); prev = u; }
});

// ---------- calendar
test('financial year labels (April to March)', () => {
  assert.equal(Engine.fyLabel(new Date(2026, 2, 31)), 'FY 2025-26');
  assert.equal(Engine.fyLabel(new Date(2026, 3, 1)), 'FY 2026-27');
  assert.equal(Engine.fyLabel(new Date(2099, 11, 31)), 'FY 2099-00');
});
test('ISO week numbers including week 53', () => {
  assert.equal(Engine.isoWeek(new Date(2026, 10, 3)), 45); // Tue 3 Nov 2026: week 1 began Mon 29 Dec 2025, +308 days = 44 full weeks
  assert.equal(Engine.isoWeek(new Date(2020, 11, 31)), 53);
  assert.equal(Engine.isoWeek(new Date(2021, 0, 3)), 53);
  assert.equal(Engine.isoWeek(new Date(2021, 0, 4)), 1);
  assert.equal(Engine.isoWeek(new Date(2025, 11, 29)), 1);
});

// ---------- text helpers and scoring
test('lines() strips bullets and numbering, drops blanks', () => {
  assert.deepEqual(Engine.lines('- a\n* b\n\n3. c\n4) d\n  e  '), ['a', 'b', 'c', 'd', 'e']);
});
test('vague words are counted as whole words only', () => {
  assert.deepEqual(Engine.vagueIn('Make it nice and fast, etc. Nicely done; fasten.'), [{ word: 'nice', n: 1 }, { word: 'fast', n: 1 }, { word: 'etc', n: 1 }]);
});
test('score: hand-worked totals', () => {
  // "Help." matches no check -> 0, Too vague
  let s = Engine.score('Help.');
  assert.equal(s.total, 0); assert.equal(s.grade, 'Too vague');
  // role only = 8 points
  s = Engine.score('You are a senior engineer.');
  assert.equal(s.total, 8);
  // role 8 + task 12 + uncertainty 8 = 28; one vague word "nice" = -2 -> 26
  s = Engine.score('You are a tester. Write a nice poem. If you are unsure, say so.');
  assert.equal(s.total, 26); assert.equal(s.penalty, 2);
  // penalty caps at 10
  s = Engine.score('nice nice nice nice nice nice You are x');
  assert.equal(s.penalty, 10); assert.equal(s.total, 0);
});

// ---------- smart packs
const inputs = { title: 'Daily Expense Ledger', goal: 'An expense tracker that works offline on my phone, published to GitHub.' };
test('packs fire only on their words', () => {
  const ids = Engine.firedPacks(inputs, 'app', null, {}).map(p => p.id).sort();
  assert.deepEqual(ids, ['calendar', 'github', 'handover', 'mobile', 'money', 'offline', 'order', 'privacy', 'verify2'].sort()); // 'Daily' triggers calendar
  assert.ok(!ids.includes('sync') && !ids.includes('python') && !ids.includes('charts'));
});
test('a user-filled field turns its default pack off', () => {
  const ids = Engine.firedPacks({ ...inputs, verify: 'Run my own checks' }, 'app', null, {}).map(p => p.id);
  assert.ok(!ids.includes('verify2'));
});
test('app prompt: sections, profile block, derived repo address, unticked pack removed', () => {
  const profile = { owner: 'Asha', location: 'Chennai', timezone: 'Asia/Calcutta', github: 'Asha-01', currency: 'Indian rupees' };
  const r = Engine.build({ type: 'app', inputs, profile, options: {}, now: '2026-11-03T10:00:00' });
  assert.match(r.prompt, /^ROLE AND WORKING RULES\n/);
  assert.match(r.prompt, /\nPROFILE \(change these lines to reuse the prompt\)\n- Owner: Asha, Chennai\. Timezone Asia\/Calcutta\./);
  assert.match(r.prompt, /Repository to create: daily-expense-ledger\. Live address: https:\/\/asha-01\.github\.io\/daily-expense-ledger\//);
  assert.match(r.prompt, /\n1\. WHAT TO BUILD\n/);
  assert.match(r.prompt, /Hold money as whole paise/);
  const off = Engine.build({ type: 'app', inputs, profile, options: { off: { money: true } } });
  assert.doesNotMatch(off.prompt, /whole paise/);
  // numbering has no gaps
  const nums = [...r.prompt.matchAll(/^(\d+)\. [A-Z]{2,}/gm)].map(m => +m[1]);
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
});
test('markdown and XML layouts', () => {
  const md = Engine.build({ type: 'research', inputs: { topic: 'X' }, options: { style: 'markdown' } }).prompt;
  assert.match(md, /^## Task\n\nResearch X\./);
  const xml = Engine.build({ type: 'research', inputs: { topic: 'X' }, options: { style: 'xml' } }).prompt;
  assert.match(xml, /^<task>\nResearch X\.[\s\S]*<\/task>/);
});
test('ask-first mode changes the working rule', () => {
  const r = Engine.build({ type: 'app', inputs: { ...inputs, unclear: 'ask' }, options: {} });
  assert.match(r.prompt, /ask me up to five focused questions/); assert.doesNotMatch(r.prompt, /Do not ask me questions/);
});
test('required fields are reported', () => {
  assert.deepEqual(Engine.build({ type: 'extend', inputs: { title: 'T' } }).missingRequired, ['What exists today', 'The change']);
});
test('review keeps the pasted prompt verbatim and keeps own thinking first', () => {
  const p = 'Act as a tester.\n\n  keep   spacing\n';
  const r = Engine.build({ type: 'review', inputs: { title: 'T', prompt: p, thinking: 'MINE' } });
  assert.equal(r.prompt, 'Act as a tester.\n\n  keep   spacing');
  assert.match(r.thinkingText, /^MINE\n\n---\nTOOL ANALYSIS/);
});
test('thinking piles count decided fields', () => {
  const r = Engine.build({ type: 'app', inputs: { title: 'A', goal: 'B', need: 'C' } });
  assert.equal(r.thinking.piles.decided.length, 3);
  assert.ok(r.thinking.piles.open.includes('Acceptance checklist'));
  assert.equal(r.thinking.steps.length, 8);
});

// ---------- files
test('crc32 standard check value', () => {
  assert.equal(Files.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
test('zip write then list/read round trip (stored)', async () => {
  const z = Files.zip([{ name: 'a/b.txt', data: 'héllo' }, { name: 'c.bin', data: new Uint8Array([0, 1, 2]) }]);
  const l = Files.zipList(z);
  assert.deepEqual(l.map(e => [e.name, e.usize]), [['a/b.txt', 6], ['c.bin', 3]]);
  assert.equal(new TextDecoder().decode(await Files.zipRead(z, l[0])), 'héllo');
});
test('reads a deflated zip written by Python and finds Prompt Manager folders', async () => {
  const u8 = new Uint8Array(readFileSync(new URL('./fixtures/pm_sample.zip', import.meta.url)));
  const l = Files.zipList(u8);
  const g = Files.pmGroups(l.map(e => e.name));
  assert.deepEqual(g.map(x => x.title), ['Alpha tool', 'Beta']);
  const byName = new Map(l.map(e => [e.name, e]));
  const txt = new TextDecoder().decode(await Files.zipRead(u8, byName.get(g[0].prompt)));
  assert.equal(txt, 'Act as a tester.\nLine two\n'.repeat(20));
  assert.deepEqual(Files.parseMeta(new TextDecoder().decode(await Files.zipRead(u8, byName.get(g[0].meta)))), ['a', 'b']);
  assert.equal(g[1].prompt.endsWith('prompt.md'), true);
});
test('Prompt Manager export: safe, unique folder names and metadata', () => {
  const e = Files.pmEntries([{ title: 'A/B: c?', prompt: 'p', thinking: 't', tags: ['x'] }, { title: 'a/b: C?', prompt: 'q' }, { title: '_hidden', prompt: 'r' }]);
  assert.deepEqual(e.map(x => x.name), [
    'prompt_repository/A_B_ c_/prompt.txt', 'prompt_repository/A_B_ c_/thinking.txt', 'prompt_repository/A_B_ c_/metadata.json',
    'prompt_repository/a_b_ C_ (2)/prompt.txt', 'prompt_repository/a_b_ C_ (2)/thinking.txt', 'prompt_repository/a_b_ C_ (2)/metadata.json',
    'prompt_repository/Prompt _hidden/prompt.txt', 'prompt_repository/Prompt _hidden/thinking.txt', 'prompt_repository/Prompt _hidden/metadata.json']);
  assert.equal(e[2].data, '{\n  "tags": [\n    "x"\n  ]\n}\n');
});
test('CSV: byte order mark, quoting, CRLF', () => {
  assert.equal(Files.csv([['a', 'b,c', 'say "hi"', 'x\ny', 12]]), '﻿a,"b,c","say ""hi""","x\ny",12\r\n');
});

test('score is held at 30 and marked Incomplete until required fields are filled', () => {
  const r = Engine.build({ type: 'app', inputs: {} });
  assert.equal(r.score.grade, 'Incomplete'); assert.ok(r.score.total <= 30);
  const full = Engine.build({ type: 'app', inputs: { title: 'T', goal: 'Build a thing that works offline on my phone.' } });
  assert.notEqual(full.score.grade, 'Incomplete');
});
