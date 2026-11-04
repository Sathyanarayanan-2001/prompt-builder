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
test('zip writer: local headers, sizes and CRC at the right offsets', () => {
  const z = Files.zip([{ name: 'a.txt', data: 'abc' }]);
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(14, true), 0x352441c2); // crc32("abc"), standard value
  assert.equal(dv.getUint32(18, true), 3); assert.equal(dv.getUint32(22, true), 3);
  assert.equal(dv.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(z.length - 22 + 10, true), 1);
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

// ---------- feedback and lessons
test('diagnose: issue text and answer text each find problems', () => {
  const d = Engine.diagnose({ issues: 'It asked me too many questions and two links were broken.', response: 'Sure\n// ... rest of code\n' });
  assert.deepEqual(d.map(x => x.pattern), ['questions', 'incomplete', 'links']);
  assert.match(d.find(x => x.pattern === 'incomplete').evidence, /"\/\/ \.\.\." in the answer/);
  const q = Engine.diagnose({ response: 'Which year?\nWhich language?\nHow many?\nThanks' });
  assert.deepEqual(q.map(x => x.pattern), ['questions']);
  assert.equal(q[0].evidence, '3 questions near the start of the answer');
});
test('diagnose: unknown issue becomes a custom lesson; nothing in, nothing out', () => {
  const c = Engine.diagnose({ issues: 'The colours were purple.' });
  assert.equal(c.length, 1); assert.equal(c[0].pattern, 'custom');
  assert.equal(c[0].line, 'Avoid this problem from an earlier answer: The colours were purple.');
  assert.deepEqual(Engine.diagnose({ issues: '', response: 'All good, here is your table.' }), []);
});
test('lessons: scope by kind, everywhere or by words; step vs warning; paused ignored', () => {
  const L = [
    { id: 'a', title: 'No questions', mode: 'step', scope: 'all', line: 'Do not reply with questions.', seen: 2, issue: 'asked questions' },
    { id: 'b', title: 'Links', mode: 'warn', scope: 'type', types: ['research'], warning: 'Check links', line: 'Open every link.' },
    { id: 'c', title: 'Tamil', mode: 'step', scope: 'keywords', keywords: ['ocr'], line: 'Test with Tamil.' },
    { id: 'd', title: 'Paused', mode: 'step', scope: 'all', line: 'Never shown.', active: false },
  ];
  const app = Engine.build({ type: 'app', inputs: { title: 'X', goal: 'Scan receipts with OCR.' }, lessons: L });
  assert.match(app.prompt, /LESSONS FROM EARLIER ANSWERS \(avoid these\)\n- Do not reply with questions\.\n- Test with Tamil\.\n\n\d+\. FINAL ANSWER/);
  assert.doesNotMatch(app.prompt, /Never shown/);
  assert.deepEqual(app.warnings, []);
  const res = Engine.build({ type: 'research', inputs: { topic: 'Y' }, lessons: L });
  assert.deepEqual(res.warnings.map(w => w.id), ['b']);
  assert.doesNotMatch(res.prompt, /Test with Tamil/);
  const off = Engine.build({ type: 'app', inputs: { title: 'X', goal: 'G' }, lessons: L, options: { off: { L_a: true } } });
  assert.doesNotMatch(off.prompt, /Do not reply with questions/);
  const rev = Engine.build({ type: 'review', inputs: { title: 'R', prompt: 'Hi' }, lessons: L });
  assert.equal(rev.prompt, 'Hi'); // review prompts are never rewritten; lessons show as warnings
  assert.deepEqual(rev.warnings.map(w => w.id).sort(), ['a']);
  const th = app.thinking.additions.find(x => x.id === 'L_a');
  assert.match(th.why, /reported 2 times/);
});
test('model keeps lessons and feedback through merge and sanitize', () => {
  const a = Model.empty(); a.lessons.l1 = { id: 'l1', u: 5, title: 'x' }; a.feedback.f1 = { id: 'f1', u: 6 };
  const m = Model.merge(Model.empty(), a).data;
  assert.ok(m.lessons.l1 && m.feedback.f1);
  assert.ok(Model.sanitize(JSON.parse(JSON.stringify(m))).lessons.l1);
});

test('restore plan: adds, updates, keeps newer local, ignores backup deletions, offers to bring back local deletions', () => {
  const L = Model.empty(), B = Model.empty();
  B.builds.a = { id: 'a', u: 10, t: 'A' };   // deleted here later -> revive
  B.builds.b = { id: 'b', u: 10, t: 'B' };   // changed here later -> keep local
  B.builds.c = { id: 'c', u: 10, t: 'C' };   // missing here -> add
  B.builds.d = { id: 'd', u: 9, d: 1 };      // deletion in backup, live here -> ignore
  B.builds.e = { id: 'e', u: 12, t: 'E2' };  // newer in backup -> update
  B.builds.f = { id: 'f', u: 4, t: 'F' };    // identical -> same
  L.builds.a = { id: 'a', u: 20, d: 1 }; L.builds.b = { id: 'b', u: 30, t: 'B2' }; L.builds.d = { id: 'd', u: 3, t: 'D' };
  L.builds.e = { id: 'e', u: 11, t: 'E1' }; L.builds.f = { id: 'f', u: 4, t: 'F' };
  const plan = Model.restorePlan(L, B);
  assert.deepEqual(plan, { add: [['builds', 'c']], update: [['builds', 'e']], revive: [['builds', 'a']], ignoredDeletions: 1, keptNewer: 1, same: 1 });
  let k = 100;
  const without = Model.applyRestore(L, B, plan, false, () => ++k).builds;
  assert.equal(without.a.d, 1); assert.equal(without.c.t, 'C'); assert.equal(without.e.t, 'E2'); assert.equal(without.b.t, 'B2'); assert.equal(without.d.t, 'D');
  const withRevive = Model.applyRestore(L, B, plan, true, () => ++k).builds;
  assert.deepEqual(withRevive.a, { id: 'a', u: 101, t: 'A' }); // fresh u beats the tombstone on other devices too
  assert.equal(L.builds.c, undefined, 'local data is not mutated');
});

// ---------- reviewer panel
const Reviewers = require('../src/reviewers.js');
test('about 200 reviewers in 19 fields, unique ids, each with background, skills and checks', () => {
  assert.ok(Reviewers.LIST.length >= 195 && Reviewers.LIST.length <= 210, String(Reviewers.LIST.length));
  assert.equal(new Set(Reviewers.LIST.map(x => x.id)).size, Reviewers.LIST.length);
  assert.equal(Object.keys(Reviewers.DOMAINS).length, 19);
  for (const d of Object.keys(Reviewers.DOMAINS)) assert.ok(Reviewers.LIST.filter(x => x.domain === d).length >= 6, 'field ' + d);
  for (const x of Reviewers.LIST) {
    assert.ok(Reviewers.DOMAINS[x.domain], x.id);
    assert.ok(x.background.length > 10 && x.skills.length >= 2 && x.checks.length >= 1, x.id);
  }
});
test('every suggested line clears its own note and targets a real field', () => {
  for (const x of Reviewers.LIST) x.checks.forEach(([need, problem, line, field], i) => {
    assert.ok(need.test(line), `${x.id}#${i}: "${line}" does not satisfy its check`);
    assert.ok(Engine.F[field], `${x.id}#${i}: unknown field ${field}`);
    assert.ok(problem.length > 5);
  });
});
test('panel picks the right experts for the words used (hand-picked expectations)', () => {
  const ids = (t, type) => Reviewers.pick(t, type).map(x => x.id);
  const exp = ids('A daily expense tracker for my HDFC bank accounts with budget limits', 'app');
  assert.ok(exp.includes('ca') && exp.includes('bank') && exp.includes('bud'), exp.join());
  const gc = ids('CEA grid code fault ride-through and reactive power at the point of interconnection', 'research');
  assert.ok(gc.includes('gc'), gc.join());
  assert.ok(!gc.includes('fe') && !gc.includes('py'), 'build-only reviewers stay out of research prompts');
  const pq = ids('training handout on power quality harmonics for wind turbine technicians', 'content');
  assert.ok(pq.includes('pq') && pq.includes('ct'), pq.join());
  for (const t of ['ideas for a team outing', 'x', exp.join(' ')]) { const n = ids(t, 'brainstorm').length; assert.ok(n >= 5 && n <= 8, `${t}: ${n}`); }
});
test('the second hundred: algorithms, AI, energy, quality and modelling reviewers join the right panels', () => {
  const ids = (t, type) => Reviewers.pick(t, type).map(x => x.id);
  assert.ok(ids('Shortest path routing between sites, avoiding circular dependencies', 'app').includes('graph'));
  const ag = ids('An AI agent that reads my emails with tools and drafts replies', 'app');
  assert.ok(ag.includes('agent') && ag.includes('redteam'), ag.join());
  const en = ids('Battery storage and solar PV hybrid with wind: curtailment at the connection', 'research');
  assert.ok(en.includes('bess') && en.includes('pv') && en.includes('hyb'), en.join());
  assert.ok(ids('Monthly generation forecast with seasonality and Monte Carlo scenarios', 'analysis').includes('ts'));
  assert.ok(ids('Root cause analysis report for a turbine gearbox failure with FMEA', 'content').includes('rca'));
  assert.ok(ids('x', 'brainstorm').includes('algo'), 'the algorithmic thinker fills small panels');
});
test('panel honours added, removed and favourite reviewers', () => {
  const t = 'A daily expense tracker for my bank accounts';
  const p = Reviewers.pick(t, 'app', { add: ['pq'], remove: ['ca'], favourites: ['sec', 'gc'] }).map(x => x.id);
  assert.ok(p.includes('pq') && p.includes('sec') && p.includes('gc') && !p.includes('ca'), p.join());
  const r = Reviewers.pick(t, 'research', { favourites: ['fe'] }).map(x => x.id);
  assert.ok(!r.includes('fe'), 'a favourite joins only prompts it fits');
});
test('findings: missing items are raised once, present items are not, dismissed are flagged', () => {
  const ca = Reviewers.byId.ca;
  const all = Reviewers.findings(ca, 'Track expenses.');
  assert.deepEqual(all.map(f => f.key), ['ca:0', 'ca:1', 'ca:2']);
  const some = Reviewers.findings(ca, 'Hold money as whole paise. Reconcile monthly.', { 'ca:2': true });
  assert.deepEqual(some.map(f => [f.key, f.dismissed]), [['ca:2', true]]);
});
test('panel review prompt lists the experts and wraps the prompt', () => {
  const panel = ['ca', 'gc'].map(id => Reviewers.byId[id]);
  const t = Reviewers.panelPrompt(panel, 'Build X.', 'Build a tool or app');
  assert.match(t, /^You are a review panel of 2 experts\./);
  assert.match(t, /1\. Meera, chartered accountant\./); assert.match(t, /2\. Karthik, grid code compliance engineer\./);
  assert.match(t, /<<<PROMPT\nBuild X\.\nPROMPT>>>$/);
  assert.match(t, /\[ASSUMED\]/);
});
