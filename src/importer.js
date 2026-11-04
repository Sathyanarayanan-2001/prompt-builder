/* Importer: takes the answer from a real-AI panel review (or any improved prompt)
   and maps it back onto the template fields, so the fields stay the source of truth.
   1. A ```json block {"fields": {...}} is used when present.
   2. Otherwise the improved prompt is split into sections and each is compared,
      line by line, with the same section of the current prompt: new lines go into
      the matching field, removed lines leave it, unchanged lines are ignored.
   Lines the tool adds itself (smart additions, lessons, working rules) never land
   in your fields; if the panel removed one, that addition is switched off.
   Pure functions; exposes `Importer`. */
'use strict';
const Importer = ((Engine) => {
  const str = v => (v == null ? '' : String(v));
  const norm = l => str(l).trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').replace(/[.;]$/, '').toLowerCase();
  const strip = l => str(l).trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '').trim();
  const fieldKeys = type => Engine.T[type].groups.flatMap(g => g[1]);

  // ---------------------------------------------------------------- JSON block
  function findJson(text) {
    const blocks = [];
    const re = /```(?:json)?\s*\n([\s\S]*?)```/gi;
    let m; while ((m = re.exec(text))) blocks.push(m[1]);
    const bare = text.match(/\{\s*["“]fields["”]\s*:\s*\{[\s\S]*\}\s*\}/);
    if (bare) blocks.push(bare[0]);
    for (const b of blocks.reverse()) {
      const cleaned = b.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1');
      if (!/"fields"\s*:/.test(cleaned)) continue;
      try { const j = JSON.parse(cleaned); if (j && typeof j.fields === 'object' && !Array.isArray(j.fields)) return j.fields; } catch { /* try the next block */ }
    }
    return null;
  }

  // ---------------------------------------------------------------- sections
  const HEAD_PLAIN = /^(?:\d+\.\s+)?([A-Z][A-Z0-9 ,&'/-]{2,}[A-Z0-9)])(\s*\([^)]*\))?\s*:?$/;
  function headingOf(line) {
    const t = line.trim();
    let m;
    if ((m = t.match(/^#{1,4}\s+(.+?)\s*#*$/))) return m[1].replace(/\*\*/g, '');
    if ((m = t.match(/^\*\*(.+?)\*\*:?$/))) return m[1];
    if ((m = t.match(/^<([a-z][a-z0-9_]*)>$/i))) return m[1].replace(/_/g, ' ');
    if ((m = t.match(HEAD_PLAIN)) && (m[1].match(/[A-Z]/g) || []).length >= 3 && !/[a-z]/.test(m[1])) return t;
    return null;
  }
  function parseSections(text) {
    text = str(text).replace(/\r\n?/g, '\n');
    // prefer the fenced block that holds the most headings (the improved prompt), never the JSON block
    const fences = [];
    const re = /```([a-z]*)\s*\n([\s\S]*?)```/gi;
    let m; while ((m = re.exec(text))) if (!/^json$/i.test(m[1]) && !/^\s*\{/.test(m[2])) fences.push(m[2]);
    const count = t => t.split('\n').filter(l => headingOf(l)).length;
    let body = text.replace(/```json[\s\S]*?```/gi, '');
    const best = fences.sort((a, b) => count(b) - count(a))[0];
    if (best && count(best) >= 2) body = best;
    const out = []; let cur = null;
    for (const raw of body.split('\n')) {
      const line = raw.replace(/\s+$/, '');
      if (/^<\/[a-z][a-z0-9_]*>$/i.test(line.trim())) { cur = null; continue; }
      const h = headingOf(line);
      if (h) { cur = { title: h, lines: [] }; out.push(cur); continue; }
      if (cur && line.trim()) cur.lines.push(line.trim());
    }
    return out;
  }
  const normTitle = t => str(t).toLowerCase().replace(/^\d+\.\s*/, '').replace(/\([^)]*\)/g, '').replace(/[_:*#]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const IDS = [
    [/^role|role and working rules/, 'role'], [/^working rules$/, 'workrules'], [/^profile/, 'profile'], [/^task$/, 'task'],
    [/^what to build/, 'build'], [/^stack|tech stack/, 'stack'], [/pages|features/, 'features'], [/^data model/, 'data'],
    [/example to follow/, 'example'], [/examples/, 'examples'], [/^rules|exact rules/, 'rules'],
    [/^storage/, 'storage'], [/^sync/, 'sync'], [/^offline/, 'offline'], [/^design/, 'design'], [/^repositor/, 'repo'],
    [/security|privacy/, 'privacy'], [/^verif/, 'verify'], [/pitfalls/, 'pitfalls'], [/acceptance/, 'acceptance'],
    [/build order/, 'buildorder'], [/final answer|^delivery/, 'delivery'], [/lessons/, 'lessons'],
    [/what exists/, 'existing'], [/^the change|^change$/, 'change'], [/preserve/, 'preserve'], [/^constraints/, 'constraints'],
    [/^scope/, 'scope'], [/^sources/, 'sources'], [/^output/, 'output'], [/audience/, 'audience'],
    [/answer these questions|^questions/, 'questions'], [/citation/, 'citations'], [/^structure/, 'structure'],
    [/key metrics|^metrics/, 'metrics'], [/^visuals?/, 'visuals'], [/assumptions/, 'assumptions'], [/what i need/, 'whatineed'],
    [/^format/, 'output'], [/tone/, 'tone'], [/^length/, 'length'], [/^ending|call to action/, 'cta'],
    [/^also|anything else|additional/, 'extra'],
  ];
  const sectionId = t => { const n = normTitle(t); for (const [re, id] of IDS) if (re.test(n)) return id; return null; };

  function targetField(id, type) {
    const keys = fieldKeys(type);
    if (keys.includes(id)) return id;
    if (['rules', 'pitfalls', 'privacy', 'design', 'storage', 'data', 'repo', 'offline', 'sync', 'workrules', 'assumptions'].includes(id) && keys.includes('constraints')) return 'constraints';
    return keys.includes('extra') ? 'extra' : null;
  }

  // ---------------------------------------------------------------- task paragraphs
  const ROLE_RE = /(?:You are|Act as)\s+(?:an?\s+|the\s+)?(.+?)\.(?:\s|$)/i;
  function taskValues(type, text) {
    const v = {};
    const r = text.match(ROLE_RE); if (r) v.role = r[1].trim();
    let m;
    if (type === 'app' && (m = text.match(/Build "(.+?)" end to end/))) v.title = m[1];
    if (type === 'extend' && (m = text.match(/Extend my existing "(.+?)"/))) v.title = m[1];
    if (type === 'research') {
      if ((m = text.match(/Research (.+?)(?: and give me the best (.+?) results)?\.(?:\s|$)/))) { v.topic = m[1]; if (m[2]) v.count = m[2]; }
      if ((m = text.match(/How I will use it: (.+)$/m))) v.purpose = m[1].trim();
    }
    if (type === 'document' || type === 'analysis') if ((m = text.match(/I've attached "(.+?)"/))) v[type === 'document' ? 'docname' : 'dataset'] = m[1];
    if (type === 'document') {
      if ((m = text.match(/focusing on: (.+?)(?= Length and structure:|$)/m))) v.focus = m[1].trim();
      if ((m = text.match(/Length and structure: (.+?)\.?$/m))) v.length = m[1].trim();
    }
    if (type === 'analysis' && (m = text.match(/Context: (.+)$/m))) v.context = m[1].trim();
    if (type === 'brainstorm') {
      if ((m = text.match(/brainstorm (.+?)\.(?: Context:|$)/))) v.topic = m[1];
      if ((m = text.match(/Context: (.+)$/m))) v.context = m[1].trim();
    }
    if (type === 'content' && (m = text.match(/^Write (.+?)(?: about (.+?))?\.$/m))) { v.piecetype = m[1]; if (m[2]) v.topic = m[2]; }
    if (v.role && /^(a|an)\s/i.test(v.role)) v.role = v.role.replace(/^(a|an)\s/i, '');
    return v;
  }
  const isBullet = l => /^(?:[-*•]|\d+[.)])\s+/.test(l.trim());

  // ---------------------------------------------------------------- main
  function importText(text, ctx) {
    const type = ctx.type;
    const cur = Engine.build({ type, inputs: ctx.inputs, options: ctx.options, profile: ctx.profile, lessons: ctx.lessons, now: ctx.now });
    const packLine = new Map();
    for (const p of cur.packs) for (const arr of Object.values(p.add)) for (const l of arr) packLine.set(norm(typeof l === 'function' ? l(cur.now) : l), p);
    const inputs = { ...ctx.inputs };
    const off = new Set(); const notes = []; const changedOpts = {};
    const lists = {}; // field -> array of lines (working copy)
    const get = f => (lists[f] = lists[f] || str(inputs[f]).split('\n').map(s => s.trim()).filter(Boolean).map(l => (Engine.F[f] && Engine.F[f].kind === 'list' ? strip(l) : l)));
    const isTool = l => packLine.has(norm(l));
    const addTo = (f, line) => { if (!f || !line) return; const L = get(f); if (!L.some(x => norm(x) === norm(line))) L.push(line); };
    const removeFrom = (f, line) => { const L = get(f); const i = L.findIndex(x => norm(x) === norm(line)); if (i >= 0) { L.splice(i, 1); return true; } return false; };

    if (type === 'review') {
      return { source: 'review', inputs: { ...inputs, prompt: str(text).trim() }, changed: ['prompt'], off: [], notes: ['A reviewed prompt replaces the pasted prompt text.'], options: {} };
    }

    // 1. explicit fields
    const J = findJson(str(text));
    if (J) {
      const keys = fieldKeys(type);
      const ignored = [];
      for (const [k, raw] of Object.entries(J)) {
        if (!keys.includes(k)) { ignored.push(k); continue; }
        let v = Array.isArray(raw) ? raw.map(str).join('\n') : str(raw);
        if (k === 'unclear') { if (Engine.UNCLEAR[v]) inputs.unclear = v; continue; }
        if (Engine.F[k].kind === 'list' || Engine.F[k].kind === 'text') {
          const kept = v.split('\n').filter(l => !l.trim() || !isTool(l) || norm(l) === '');
          if (kept.length !== v.split('\n').length) notes.push(`${Engine.F[k].label}: lines the tool adds itself were left out of the field.`);
          v = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        }
        inputs[k] = v.trim();
      }
      if (ignored.length) notes.push('Ignored unknown fields: ' + ignored.join(', ') + '.');
      return finish('json');
    }

    // 2. sections compared with the current prompt
    const newS = parseSections(text);
    const curS = parseSections(cur.prompt);
    const curById = new Map(); for (const s of curS) { const id = sectionId(s.title); if (id) curById.set(id, s); }
    let matched = 0; const seen = new Set();
    for (const s of newS) {
      const id = sectionId(s.title);
      if (id === 'profile' || id === 'lessons') { if (id === 'profile' && curById.has('profile')) seen.add(id); continue; }
      const c = id && curById.get(id);
      if (id) seen.add(id);
      if (c) matched++;
      const curLines = c ? c.lines : [];
      const curSet = new Set(curLines.map(norm));
      const newSet = new Set(s.lines.map(norm));
      const added = s.lines.filter(l => !curSet.has(norm(l)));
      const removed = curLines.filter(l => !newSet.has(norm(l)));
      if (!added.length && !removed.length) continue;

      if (id === 'role' || id === 'task') {
        const para = l => !isBullet(l);
        const was = taskValues(type, curLines.filter(para).join('\n')), now = taskValues(type, s.lines.filter(para).join('\n'));
        for (const [k, v] of Object.entries(now)) if (v && v !== was[k] && fieldKeys(type).includes(k)) inputs[k] = v;
        const addB = added.filter(isBullet).map(strip), remB = removed.filter(isBullet).map(strip);
        for (const l of addB) {
          if (/ask me up to five focused questions/i.test(l)) inputs.unclear = 'ask';
          else if (/^make reasonable decisions yourself/i.test(l)) inputs.unclear = 'irreversible';
          else if (/^do not ask me questions/i.test(l)) inputs.unclear = 'decide';
          else if (/send the files one at a time/i.test(l)) changedOpts.chatOnly = true;
          else addTo(targetField(type === 'extend' ? 'constraints' : 'extra', type), l);
        }
        for (const l of remB) {
          if (/send the files one at a time/i.test(l)) changedOpts.chatOnly = false;
          else if (!removeFrom('extra', l) && !(fieldKeys(type).includes('constraints') && removeFrom('constraints', l)) && !/questions|decisions yourself|unsure about a fact|verify everything twice|inspect the complete|surgical changes|real data while testing/i.test(l)) notes.push(`Kept a standard working rule the panel dropped: "${l}"`);
        }
        continue;
      }
      if (id === 'build') {
        for (const l of added) {
          let m;
          if ((m = l.match(/^The real need:\s*(.+)$/i))) inputs.need = m[1].trim();
          else if ((m = l.match(/^Who uses it:\s*(.+)$/i))) inputs.users = m[1].trim();
          else addTo('goal', strip(l));
        }
        for (const l of removed) { if (/^(The real need|Who uses it):/i.test(l)) { if (!added.some(a => a.split(':')[0] === l.split(':')[0])) inputs[/^The real need/i.test(l) ? 'need' : 'users'] = ''; } else removeFrom('goal', strip(l)); }
        continue;
      }
      if (id === 'whatineed' && type === 'brainstorm') {
        for (const l of added.map(strip)) { let m; if ((m = l.match(/^Suggest (.+?) ideas/i))) inputs.count = m[1]; else if ((m = l.match(/best for: (.+?)\.?$/i))) lists.categories = m[1].split(';').map(x => x.trim()).filter(Boolean); else addTo('extra', l); }
        continue;
      }
      const f = id ? targetField(id, type) : (fieldKeys(type).includes('extra') ? 'extra' : null);
      if (!f) { notes.push(`Section "${s.title}" has no matching field and was left out.`); continue; }
      if (!c) {
        // a new section: keep it, with its heading if it lands in Anything else
        const body = s.lines.map(strip).filter(l => !isTool(l));
        if (f === 'extra' && id !== 'extra') addTo('extra', `${s.title.replace(/^\d+\.\s*/, '')}: ${body.shift() || ''}`.trim());
        body.forEach(l => addTo(f, l));
        if (!id) notes.push(`New section "${s.title}" went into Anything else.`);
        continue;
      }
      const conv = l => { let x = strip(l); if (id === 'acceptance') x = x.split(/\s*→\s*/).join(' | '); return x; };
      const fieldFor = l => (id === 'verify' && /^Test:\s*/i.test(strip(l)) ? 'tests' : f);
      const clean = l => strip(l).replace(/^Test:\s*/i, '');
      // a field that was empty and showed tool defaults takes the whole edited section
      if (!str(inputs[f]).trim() && !['verify', 'rules', 'pitfalls', 'storage', 'sync', 'offline', 'design', 'repo', 'privacy', 'constraints', 'delivery', 'buildorder'].includes(id) && curLines.length && curLines.every(l => !isTool(l))) {
        lists[f] = s.lines.map(conv).filter(Boolean); continue;
      }
      for (const l of removed) {
        const tf = fieldFor(l), raw = clean(l);
        if (removeFrom(tf, id === 'acceptance' ? conv(l) : raw)) continue;
        const p = packLine.get(norm(raw)) || packLine.get(norm(l));
        if (p) { off.add(p.id); notes.push(`The panel removed a line added by "${p.name}", so that addition is switched off.`); }
        else notes.push(`Could not remove "${raw}" (it is generated by the tool, not a field).`);
      }
      for (const l of added) { const tf = fieldFor(l), raw = clean(l); if (isTool(raw)) continue; addTo(tf, id === 'acceptance' ? conv(l) : raw); }
    }
    // an addition switched off loses all its lines; keep the ones the panel kept, now as your own
    if (off.size) {
      const where = new Map(); for (const ns of newS) for (const l of ns.lines) where.set(norm(strip(l).replace(/^Test:\s*/i, '')), { id: sectionId(ns.title), line: l });
      for (const p of cur.packs) if (off.has(p.id)) for (const arr of Object.values(p.add)) for (const l0 of arr) {
        const l = typeof l0 === 'function' ? l0(cur.now) : l0; const w = where.get(norm(l)); if (!w) continue;
        const f = w.id === 'verify' && /^Test:/i.test(strip(w.line)) ? 'tests' : targetField(w.id, type); if (f) addTo(f, l);
      }
    }
    for (const [id, c] of curById) if (!seen.has(id) && !['lessons', 'profile'].includes(id) && c.lines.length) notes.push(`The pasted prompt has no "${c.title.replace(/^\d+\.\s*/, '')}" section; that part is unchanged.`);
    if (!matched) return { source: 'none', inputs: ctx.inputs, changed: [], off: [], notes: ['No sections matched this kind of prompt. You can store the text as a Review prompt instead.'], options: {} };
    return finish('sections');

    function finish(source) {
      for (const [f, L] of Object.entries(lists)) {
        const kind = Engine.F[f] && Engine.F[f].kind;
        inputs[f] = (kind === 'list' ? L : L).join('\n');
      }
      const changed = Object.keys({ ...inputs, ...ctx.inputs }).filter(k => str(inputs[k]).trim() !== str(ctx.inputs[k]).trim());
      const options = { ...changedOpts };
      if (off.size) options.off = Object.fromEntries([...off].map(k => [k, true]));
      return { source, inputs, changed, off: [...off], notes, options };
    }
  }

  // the field list the panel prompt asks Claude to return
  function fieldSpec(type, inputs) {
    return fieldKeys(type).map(k => ({ key: k, label: Engine.F[k].label, kind: Engine.F[k].kind, value: str((inputs || {})[k]), options: Engine.F[k].options ? Object.keys(Engine.F[k].options) : null }));
  }

  return { importText, parseSections, sectionId, findJson, fieldSpec, normTitle };
})(typeof Engine !== 'undefined' ? Engine : require('./engine.js'));
if (typeof module !== 'undefined') module.exports = Importer;
