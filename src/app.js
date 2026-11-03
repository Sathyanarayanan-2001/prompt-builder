/* Prompt Builder UI. Depends on Engine, Model, Files, Prefs, Store, Sync. */
'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const D = () => Store.data;
  const live = c => Model.live(D()[c]);
  const fmtDate = t => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  const stampName = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
  const words = s => (String(s).match(/\S+/g) || []).length;
  const ROUTES = ['start', 'build', 'library', 'inputs', 'setup'];
  const ICON = {
    start: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5zM14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14z"/>',
    build: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
    library: '<path d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 5l3.8-1 2.7 15.5-3.8 1z"/>',
    inputs: '<path d="M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4"/>',
    setup: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  };
  const svg = (k, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra || ''}>${ICON[k]}</svg>`;
  const TAB_NAMES = { start: 'Start', build: 'Build', library: 'Library', inputs: 'Saved inputs', setup: 'Setup' };

  // ---------------------------------------------------------------- state
  const S = {
    route: 'start',
    draft: null,
    out: null,
    otab: Prefs.get('otab', 'prompt'),
    lib: { q: '', type: '', tag: '', sort: 'updated' },
    mem: { q: '', field: '' },
    deferredInstall: null,
  };

  function settings() { return Object.assign({ style: 'plain', unclear: 'decide', profileId: '' }, (D().cfg.settings && !D().cfg.settings.d) ? D().cfg.settings : {}); }
  function saveSettings(patch) { const cur = settings(); const next = { ...cur, ...patch, id: 'settings' }; if (Model.canon({ ...cur, u: 0 }) === Model.canon({ ...next, u: 0 })) return; Store.put('cfg', next); }

  function newDraft(type) {
    const st = settings();
    return { buildId: null, baseVersion: null, type: type || 'app', tags: [], inputs: { unclear: st.unclear }, options: { style: st.style, useProfile: true, chatOnly: false, off: {} }, profileId: st.profileId || (live('profiles')[0] || {}).id || '' };
  }
  function loadDraft() {
    const d = Prefs.get('draft', null);
    if (d && Engine.T[d.type]) return Object.assign(newDraft(d.type), d);
    return newDraft('app');
  }
  let draftTimer = null;
  function saveDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(() => Prefs.set('draft', S.draft), 250); }

  const profileOf = id => { const p = D().profiles[id]; return p && !p.d ? p : null; };
  function compute() {
    const d = S.draft;
    S.out = Engine.build({ type: d.type, inputs: d.inputs, options: { ...d.options, defaultUnclear: settings().unclear }, profile: profileOf(d.profileId) });
    S.out.added = Engine.addedLines(S.out.packs);
    return S.out;
  }
  function normOpts(o) { o = o || {}; const off = {}; Object.keys(o.off || {}).filter(k => o.off[k]).sort().forEach(k => (off[k] = true)); return { style: o.style || 'plain', useProfile: o.useProfile !== false, chatOnly: !!o.chatOnly, off }; }
  function snapshotOf(d) { return Model.canon({ type: d.type, tags: d.tags || [], inputs: clean(d.inputs), options: normOpts(d.options), profileId: d.profileId || '' }); }
  function clean(inp) { const o = {}; for (const [k, v] of Object.entries(inp || {})) if (String(v == null ? '' : v).trim()) o[k] = v; return o; }
  function latestVersion(buildId) { return live('versions').filter(v => v.buildId === buildId).sort((a, b) => b.at - a.at || b.n - a.n)[0] || null; }
  function versionsOf(buildId) { return live('versions').filter(v => v.buildId === buildId).sort((a, b) => b.at - a.at || b.n - a.n); }
  function isDirty() {
    const d = S.draft; if (!d.buildId) return Object.keys(clean(d.inputs)).filter(k => k !== 'unclear').length > 0;
    const v = latestVersion(d.buildId); if (!v) return true;
    return snapshotOf(d) !== snapshotOf({ type: v.type, tags: v.tags || [], inputs: v.inputs, options: v.options, profileId: v.profileId });
  }

  // ---------------------------------------------------------------- ui helpers
  let toastTimer = null;
  function toast(msg) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }
  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove(); toast(ok ? `${what} copied` : 'Copy was blocked. Select the text and press Ctrl+C.');
    }
  }
  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Downloading ${name}`);
  }
  function modal(html, opts) {
    closeModal();
    const sh = document.createElement('div'); sh.className = 'shade'; sh.id = 'shade';
    sh.innerHTML = `<div class="modal${opts && opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    sh.addEventListener('click', e => { if (e.target === sh) closeModal(); });
    document.body.appendChild(sh);
    const f = $('input,textarea,select,button.primary', sh); if (f) f.focus();
    return sh;
  }
  function closeModal() { const m = $('#shade'); if (m) m.remove(); }
  function confirmBox(title, text, okLabel, fn, danger) {
    const sh = modal(`<h2>${esc(title)}</h2><p>${text}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-x="no">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-x="yes">${esc(okLabel)}</button></div>`);
    $('[data-x=no]', sh).onclick = closeModal;
    $('[data-x=yes]', sh).onclick = () => { closeModal(); fn(); };
  }

  // ---------------------------------------------------------------- shell
  function shell() {
    $('#app').innerHTML = `
<header class="top"><div class="top-in">
  <a class="brand" href="#start"><span class="brand-mark">&gt;_</span><span class="brand-name">Prompt Builder</span></a>
  <nav class="tabs" aria-label="Pages">${ROUTES.map(r => `<a class="tab" href="#${r}" data-route="${r}">${svg(r)}<span>${TAB_NAMES[r]}</span></a>`).join('')}</nav>
  <div class="top-tools"><button class="chip" id="syncChip" data-act="go-sync"><span class="dot"></span><span class="lbl">This device only</span></button>
  <button class="icon-btn" id="themeBtn" data-act="theme" aria-label="Theme"></button></div>
</div></header>
<main id="main"></main>`;
    paintTheme(); paintChip();
  }
  function paintTheme() {
    const t = Prefs.get('theme', 'system');
    if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    const b = $('#themeBtn'); if (b) { b.innerHTML = svg(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'auto'); b.title = `Theme: ${t} (click to change)`; b.setAttribute('aria-label', `Theme: ${t}. Change theme`); }
  }
  function paintChip() {
    const c = $('#syncChip'); if (!c) return;
    const [l, cls] = Sync.label();
    c.className = 'chip ' + cls; $('.lbl', c).textContent = l; c.title = Sync.detail || l;
  }

  function banners() {
    const out = [];
    if (Store.mode === 'memory') out.push(`<div class="banner bad"><span><b>This browser is not keeping data.</b> Storage is blocked here (private window or blocked site data), so everything is lost when you close the tab. Download a backup before leaving.</span><button class="btn sm" data-act="backup">Download backup</button></div>`);
    if (Store.saveErr) out.push(`<div class="banner bad"><span><b>Your last change was not saved on this device.</b> ${esc(Store.saveErr.message || '')} Free some space, then make any edit to try again.</span></div>`);
    if (Sync.state === 'access') out.push(`<div class="banner warn"><span><b>Allow folder access</b> so this device can read and write the sync folder. Browsers need a click for this.</span><button class="btn sm primary" data-act="sync-allow">Allow folder access</button></div>`);
    if (Sync.state === 'problem') out.push(`<div class="banner bad"><span><b>Sync problem.</b> ${esc(Sync.detail || 'The folder could not be read or written.')}</span><button class="btn sm" data-act="sync-retry">Try again</button></div>`);
    const samples = Object.values(D().builds).filter(b => !b.d && b.sample).length;
    if (samples) out.push(`<div class="banner info"><span><b>Sample data is loaded</b> (${samples} example prompts marked "Sample"). It is not yours; remove it when you have seen how things work.</span><button class="btn sm" data-act="sample-remove">Remove sample data</button></div>`);
    return out.join('');
  }

  // ---------------------------------------------------------------- routing
  function route() {
    const h = location.hash.replace('#', '');
    S.route = ROUTES.includes(h) ? h : (live('builds').length ? 'build' : 'start');
    $$('.tab').forEach(t => t.setAttribute('aria-current', t.dataset.route === S.route ? 'page' : 'false'));
    renderPage();
  }
  function renderPage() {
    closePop();
    const m = $('#main');
    const y = window.scrollY;
    ({ start: pStart, build: pBuild, library: pLibrary, inputs: pInputs, setup: pSetup })[S.route](m);
    if (S.keepScroll) { window.scrollTo(0, y); S.keepScroll = false; }
    document.title = `${TAB_NAMES[S.route]} · Prompt Builder`;
  }
  function rerender() { S.keepScroll = true; renderPage(); }

  // ---------------------------------------------------------------- START
  function pStart(m) {
    const builds = live('builds');
    const hasVersion = live('versions').length > 0;
    const todo = [
      [live('profiles').length > 0, 'Add your profile in Saved inputs (name, currency, financial year)'],
      [builds.length > 0, 'Build your first prompt and press Save version'],
      [builds.some(b => b.imported), 'Bring in your Prompt Manager library (Library, Import from Prompt Manager)'],
      [live('memory').length >= 5, 'Reuse a previous entry with a field\'s "Previous" button'],
      [Sync.state === 'ok' || Sync.state === 'waiting' || Sync.state === 'saving', 'Connect a sync folder in Setup (laptops and phone)'],
      [!!Prefs.get('lastBackup'), 'Download a backup once from Setup'],
    ];
    const fresh = Sync.state === 'off' || Sync.state === 'unsupported';
    m.innerHTML = `<div class="page narrow">${banners()}
<section class="hero"><span class="eyebrow">Start here</span><h1>Prompt Builder</h1>
<p>Describe what you need once, field by field. Prompt Builder turns it into a copy-ready prompt for Claude, shows how an AI will think it through, scores it against the prompting guide, and keeps every entry and every version for next time.</p>
<div class="row"><a class="btn primary" href="#build">Build a prompt</a><button class="btn" data-act="sample-load">See it filled in</button></div></section>

<details class="card" ${fresh ? 'open' : ''}><summary><h2 style="display:inline">Set up each device, once</h2></summary>
<div class="two">
<div class="stack"><h3>Laptops (Chrome or Edge)</h3><ol class="stack" style="margin:0;padding-left:20px">
<li>Open the live page and press <b>Install app</b> in Setup, so it opens like a program.</li>
<li>In Setup, press <b>Choose sync folder</b> and pick a folder inside OneDrive, for example <code>OneDrive/Prompt Builder</code>.</li>
<li>On the second laptop, choose the same folder. Each laptop writes its own save file there and reads the others.</li></ol></div>
<div class="stack"><h3>Android phone (Chrome 132 or later)</h3><ol class="stack" style="margin:0;padding-left:20px">
<li>The OneDrive app does not keep a real folder on the phone, so install a two-way sync app (for example OneSync) and mirror the OneDrive folder to a phone folder.</li>
<li>Install this page to the home screen first; installed apps keep folder permission.</li>
<li>In Setup, press <b>Choose sync folder</b> and pick the mirrored phone folder.</li></ol>
<p class="small muted">iPhone, Firefox and Safari cannot open folders. Use <b>Download backup</b> and <b>Restore from backup</b> instead.</p></div>
</div>
<div class="stack"><h3>Moving your Prompt Manager library across</h3><p>In Library, press <b>Import from Prompt Manager</b> and choose your <code>Prompting.zip</code> or the <code>prompt_repository</code> folder. Every prompt arrives with its thinking and tags. Press <b>Export to Prompt Manager</b> to send prompts back as folders that the desktop app reads.</p></div>
</details>

<section class="card"><h2>How it works, in seven steps</h2><ol class="steps-start">
<li><h3>Set your profile once</h3><p>In <b>Saved inputs</b>, add a profile: your name, city, timezone, money format, financial year and GitHub account. It becomes the PROFILE block, the one part you change to reuse a prompt for someone else.</p></li>
<li><h3>Pick the kind of request</h3><p>On <b>Build</b>, choose Build a tool, Extend or fix a tool, Research, Document, Data analysis, Brainstorming, Content, or Review an existing prompt. Each has its own template.</p></li>
<li><h3>Fill only what you know</h3><p>Type into the fields, or press <b>Previous</b> beside a field to pick something you entered before (or a suggestion). Empty fields are fine; the tool fills sensible defaults and tells you which.</p></li>
<li><h3>Read the prompt as it forms</h3><p>The prompt sheet updates as you type. Lines on a green band were <b>added by the tool</b> because of words you used, such as "expense" or "phone". Switch any of them off in the <b>Thinking</b> tab.</p></li>
<li><h3>See how an AI will think it through</h3><p>The amber <b>Thinking</b> tab walks through the AI's reasoning step by step: the real need, what you decided, what was defaulted, what is still open, how it will verify, and what it cannot prove.</p></li>
<li><h3>Close the gaps the score shows</h3><p><b>Quality</b> scores the prompt out of 100 against the prompting guide. Each missing item has a <b>Fix</b> button that takes you to the right field.</p></li>
<li><h3>Copy, save, reuse</h3><p>Press <b>Copy prompt</b> and paste it into Claude. Press <b>Save version</b> to keep it in the Library with its thinking; every save is a new version, so nothing is overwritten. Every value you typed is remembered for next time.</p></li>
</ol></section>

<div class="two">
<section class="card"><h2>Quick start checklist</h2><ul class="todo">${todo.map(([d, t]) => `<li class="${d ? 'done' : ''}"><span class="box">${d ? '✓' : ''}</span><span>${esc(t)}</span></li>`).join('')}</ul></section>
<section class="card"><h2>How the numbers work</h2><dl class="defs">
<dt>Quality score (0 to 100)</dt><dd>Eleven checks from the prompting guide, weighted: task stated up front, role, context, specific numbers, examples, output structure, steps, uncertainty, verification, must-nots and a definition of done. Vague words such as "nice" or "fast" take off 2 points each, at most 10.</dd>
<dt>Ready, Good, Needs detail, Too vague</dt><dd>85 and above, 65 to 84, 40 to 64, below 40. Until the required fields (marked *) are filled the score is held at 30 and shows Incomplete, because the tool's own defaults would otherwise flatter an empty form.</dd>
<dt>Decided, defaulted, open</dt><dd>Fields you filled; smart additions the tool made; important fields still empty.</dd>
</dl></section></div>

<section class="card"><h2>If something looks wrong</h2><dl class="defs">
<dt>A line I did not write is in my prompt</dt><dd>It is on a green band, so the tool added it. Open <b>Thinking</b>, find it under "Added by Prompt Builder", and untick it.</dd>
<dt>The sync chip says Allow folder access</dt><dd>The browser forgot its permission after a restart. Press <b>Allow folder access</b> in the banner.</dd>
<dt>A change from my other laptop has not arrived</dt><dd>OneDrive may not have delivered the file yet. Switch back to this tab after a minute; Prompt Builder reads new saves whenever the page becomes visible.</dd>
<dt>Import found nothing</dt><dd>Choose the zip or folder that contains <code>prompt_repository</code>. Each prompt must sit in its own folder with a <code>prompt.txt</code>.</dd>
<dt>Downloads do nothing</dt><dd>Some embedded previews block downloads. Open the live GitHub Pages address instead.</dd>
</dl></section></div>`;
  }

  // ---------------------------------------------------------------- BUILD
  function pBuild(m) {
    const d = S.draft;
    const T = Engine.T[d.type];
    const b = d.buildId ? D().builds[d.buildId] : null;
    const profiles = live('profiles').sort((a, z) => String(a.label).localeCompare(z.label));
    m.innerHTML = `<div class="page">${banners()}
<div class="row spread"><div class="stack" style="gap:2px;min-width:0"><span class="eyebrow">${b ? 'Editing saved prompt' : 'New prompt'}</span><h1 id="bTitle" style="overflow-wrap:anywhere">${esc(d.inputs.title || d.inputs.topic || d.inputs.docname || d.inputs.dataset || d.inputs.piecetype || 'Untitled prompt')}</h1></div>
<div class="row"><button class="btn" data-act="new">New prompt</button><button class="btn primary" data-act="save-version">Save version</button></div></div>
<div class="types" role="group" aria-label="Kind of request">${Engine.TYPE_ORDER.map(t => `<button class="type" data-act="type" data-type="${t}" aria-pressed="${t === d.type}">${esc(Engine.T[t].name)}</button>`).join('')}</div>
<div class="bench">
<form class="inputs" id="form" autocomplete="off" onsubmit="return false">
${T.profile ? `<div class="card" style="gap:10px"><div class="row spread"><h3>Profile</h3><a class="small" href="#inputs">Manage profiles</a></div>
<div class="row"><select id="f-profile" data-opt="profileId" style="flex:1;min-width:180px"><option value="">No profile</option>${profiles.map(p => `<option value="${esc(p.id)}"${p.id === d.profileId ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
<label class="check"><input type="checkbox" id="f-useProfile" data-opt="useProfile"${d.options.useProfile !== false ? ' checked' : ''}> Include in prompt</label></div>
${profiles.length ? '' : '<p class="small muted">No profile yet. Add one in Saved inputs so your name, currency and financial year go in automatically.</p>'}</div>` : ''}
${T.groups.map(([g, keys], gi) => `<details class="group" ${gi === 0 || keys.some(k => String(d.inputs[k] || '').trim() && k !== 'unclear') ? 'open' : ''}><summary><span>${esc(g)}</span><span class="count">${keys.filter(k => String(d.inputs[k] || '').trim() && k !== 'unclear').length} of ${keys.length} filled</span></summary><div class="group-body">${keys.map(k => fieldHTML(k, T)).join('')}</div></details>`).join('')}
<details class="group"><summary><span>Prompt options</span><span class="count">${esc(Engine.STYLES[d.options.style] || 'Plain headings')}</span></summary><div class="group-body">
<label class="f"><span class="f-head"><span class="f-name">Prompt layout</span></span><select id="f-style" data-opt="style">${Object.entries(Engine.STYLES).map(([k, v]) => `<option value="${k}"${d.options.style === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select><span class="f-hint">Plain headings match your ledger prompts; XML tags suit long prompts with several parts.</span></label>
${d.type === 'app' || d.type === 'extend' ? `<label class="check"><input type="checkbox" id="f-chatOnly" data-opt="chatOnly"${d.options.chatOnly ? ' checked' : ''}> Add the chat-only fallback (send files one at a time and wait for "continue")</label>` : ''}
<label class="f"><span class="f-head"><span class="f-name">Tags</span><button type="button" class="mem-btn" data-act="mem" data-field="tags">Previous</button></span><input id="f-tags" data-opt="tags" value="${esc((d.tags || []).join(', '))}" placeholder="finance, web-app, github"><span class="f-hint">Comma separated. Used to filter the Library and exported to Prompt Manager.</span></label>
</div></details>
</form>
<aside class="out" id="out"></aside>
</div></div>`;
    paintOut();
  }

  function fieldHTML(k, T) {
    const f = Engine.F[k]; const d = S.draft; const v = d.inputs[k] == null ? '' : d.inputs[k];
    const req = T.required.includes(k) ? '<span class="req" title="Required">*</span>' : '';
    const n = memFor(k).length + (f.sug ? f.sug.length : 0);
    const memBtn = f.kind === 'select' ? '' : `<button type="button" class="mem-btn" data-act="mem" data-field="${k}" aria-label="Previous entries for ${esc(f.label)}">Previous${n ? ' (' + n + ')' : ''}</button>`;
    let ctl;
    if (f.kind === 'select') ctl = `<select id="f-${k}" data-field="${k}">${Object.entries(f.options).map(([o, l]) => `<option value="${o}"${(v || settings().unclear) === o ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (f.kind === 'line') ctl = `<input id="f-${k}" data-field="${k}" value="${esc(v)}" placeholder="${esc(f.ph || '')}">`;
    else ctl = `<textarea id="f-${k}" data-field="${k}" rows="${f.big ? 12 : f.kind === 'list' ? 4 : 3}" class="${f.big ? 'big' : ''}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea>`;
    return `<label class="f" for="f-${k}"><span class="f-head"><span class="f-name">${esc(f.label)}${req}</span>${memBtn}</span>${ctl}<span class="f-hint">${esc(f.hint || '')}</span></label>`;
  }

  function paintOut() {
    const o = $('#out'); if (!o) return;
    const r = compute();
    const d = S.draft;
    const vs = d.buildId ? versionsOf(d.buildId) : [];
    const dirty = isDirty();
    const sc = r.score;
    const cls = sc.capped ? 'bad' : sc.total >= 85 ? 'good' : sc.total >= 65 ? 'warn' : 'bad';
    o.innerHTML = `<div class="status-line"><span class="pill ${cls}">${sc.total} · ${esc(sc.grade)}</span><span class="num">${sc.words.toLocaleString('en-IN')} words</span>
${vs.length ? `<span>v${vs[0].n} saved ${esc(fmtDate(vs[0].at))}</span>` : '<span>Not saved yet</span>'}${dirty && vs.length ? '<span class="pill warn">Unsaved changes</span>' : ''}
${r.missingRequired.length ? `<span class="pill bad">Fill: ${esc(r.missingRequired.join(', '))}</span>` : ''}</div>
<div class="otabs" role="tablist">${[['prompt', 'Prompt'], ['thinking', 'Thinking'], ['quality', 'Quality ' + sc.total], ['versions', 'Versions' + (vs.length ? ' ' + vs.length : '')]].map(([k, l]) => `<button class="otab" role="tab" data-act="otab" data-tab="${k}" aria-selected="${S.otab === k}">${esc(l)}</button>`).join('')}</div>
<div class="panel ${S.otab === 'thinking' ? 'thinking' : ''}" id="panel">${({ prompt: outPrompt, thinking: outThinking, quality: outQuality, versions: outVersions })[S.otab](r, vs)}</div>`;
    const t = $('#bTitle'); if (t) t.textContent = d.inputs.title || d.inputs.topic || d.inputs.docname || d.inputs.dataset || d.inputs.piecetype || 'Untitled prompt';
  }

  function outPrompt(r) {
    const added = r.added;
    const html = r.prompt ? r.prompt.split('\n').map(l => {
      const bare = l.replace(/^\s*(?:- |\d+\. |Test: )/, '').replace(/^Test: /, '');
      if (/^(#{1,3} |<\/?[a-z_]+>$|[0-9]+\. [A-Z][A-Z0-9 ,&()'-]+$|[A-Z][A-Z ,&-]{3,}( \(.*\))?$)/.test(l)) return `<span class="h">${esc(l)}</span>`;
      if (added.has(bare)) return `<span class="add" title="Added by Prompt Builder">${esc(l)}</span>`;
      return esc(l) + '\n';
    }).join('') : '<span class="muted">Start typing on the left. The prompt forms here.</span>';
    return `<div class="toolbar"><button class="btn primary" data-act="copy-prompt">Copy prompt</button><button class="btn" data-act="dl-prompt">Download .txt</button><button class="btn" data-act="pm-one">Export to Prompt Manager</button></div>
${added.size ? '<div class="legend"><span><i style="background:var(--added);box-shadow:inset 3px 0 0 var(--added-line)"></i>Added by Prompt Builder</span><span><i style="background:var(--accent)"></i>Section heading</span></div>' : ''}
<pre class="sheet" id="promptText">${html}</pre>`;
  }

  function outThinking(r) {
    const th = r.thinking;
    const own = S.draft.type === 'review' && String(S.draft.inputs.thinking || '').trim();
    return `<div class="toolbar"><button class="btn primary" data-act="copy-thinking">Copy thinking</button><span class="small" style="align-self:center">Saved as thinking.txt beside the prompt.</span></div>
<div class="think-body">
${own ? `<section class="stack"><h3>Your thinking notes</h3><p style="white-space:pre-wrap">${esc(own)}</p></section>` : ''}
<section class="stack"><h3>How an AI will think it through</h3><ol class="steps">${th.steps.map(s => `<li><b>${esc(s.t)}</b><span>${esc(s.b)}</span></li>`).join('')}</ol></section>
${S.draft.type !== 'review' ? `<section class="stack"><h3>Three piles</h3><div class="piles">
<div class="pile"><strong>${th.piles.decided.length}</strong>Decided by you</div>
<div class="pile"><strong>${th.piles.defaulted.length}</strong>Defaulted by the tool</div>
<div class="pile"><strong>${th.piles.open.length}</strong>Still open${th.piles.open.length ? ': ' + esc(th.piles.open.join(', ')) : ''}</div></div></section>` : ''}
${th.additions.length ? `<section class="stack"><h3>Added by Prompt Builder</h3><p class="small">Untick any addition you do not want; the prompt updates at once.</p>${th.additions.map(a => `<label class="addition"><input type="checkbox" data-act="pack" data-pack="${a.id}"${a.off ? '' : ' checked'}><b>${esc(a.name)}${a.matched ? ` <span class="small" style="font-weight:400">(you wrote "${esc(a.matched)}")</span>` : ''}</b><span></span><span class="small">${esc(a.why)}</span></label>`).join('')}</section>` : ''}
${th.eight.length ? `<section class="stack"><h3>Eight questions the AI asks itself</h3><ol class="kv" style="padding-left:18px;list-style:decimal">${th.eight.map(([q, a]) => `<li><span class="q">${esc(q)}</span><span>${esc(a)}</span></li>`).join('')}</ol></section>` : ''}
${th.map.length ? `<section class="stack"><h3>Why each section is there</h3><ul class="kv">${th.map.map(([s, w]) => `<li><span class="q">${esc(s)}</span><span>${esc(w)}</span></li>`).join('')}</ul></section>` : ''}
</div>`;
  }

  function outQuality(r) {
    const sc = r.score; const color = sc.total >= 85 ? 'var(--good)' : sc.total >= 65 ? 'var(--warn)' : 'var(--bad)';
    const review = S.draft.type === 'review';
    return `<div class="score-head"><div class="dial" style="--p:${sc.total};--dial:${color}"><span class="num">${sc.total}</span></div>
<div class="stack" style="gap:4px;min-width:0;flex:1"><h2>${esc(sc.grade)}</h2><p class="small muted">${sc.capped ? 'Held at 30 until the required fields are filled. ' : ''}Scored against the prompting guide. ${sc.rows.filter(x => x.status === 'pass').length} of ${sc.rows.length} checks pass${sc.penalty ? `; vague words cost ${sc.penalty} points` : ''}.</p></div></div>
<ul class="checks">${sc.rows.map(x => `<li><span class="pill ${x.status === 'pass' ? 'good' : x.status === 'partial' ? 'warn' : 'bad'}">${x.status === 'pass' ? 'Pass' : x.status === 'partial' ? 'Partial' : 'Missing'}</span><b>${esc(x.name)} <span class="small muted num">(${x.w} pts)</span></b>
${x.status !== 'pass' ? (review ? `<button class="btn sm" data-act="append-fix" data-check="${x.id}">Add a line</button>` : (Engine.T[S.draft.type].groups.some(g => g[1].includes(x.field)) ? `<button class="btn sm" data-act="fix" data-field="${x.field}">Fix</button>` : '<span></span>')) : '<span></span>'}
<span class="why">${esc(x.tip)}${x.status !== 'pass' ? ' ' + esc(x.fix) : ''}</span></li>`).join('')}
${sc.vague.length ? `<li><span class="pill warn">Vague</span><b>Words that hide a decision</b><span></span><span class="why">${sc.vague.map(v => `"${esc(v.word)}"${v.n > 1 ? ' ×' + v.n : ''}`).join(', ')}. Replace each with a number or a check you could run, for example "loads in under 2 seconds" instead of "fast".</span></li>` : ''}</ul>`;
  }

  function outVersions(r, vs) {
    if (!vs.length) return `<div class="empty"><p>No versions yet. Press <b>Save version</b> to keep this prompt, its thinking and its inputs in the Library. Each save adds a version; nothing is overwritten.</p><button class="btn primary" data-act="save-version">Save version</button></div>`;
    return `<div class="list" style="border:0;border-radius:0">${vs.map((v, i) => `<div class="item"><div class="stack" style="gap:4px;min-width:0"><h3>v${v.n}${i === 0 ? ' <span class="pill plain">Latest</span>' : ''}</h3>
<div class="meta"><span>${esc(fmtDate(v.at))}</span><span class="num">Score ${v.score}</span><span class="num">${words(v.prompt).toLocaleString('en-IN')} words</span>${v.device ? `<span>from device ${esc(v.device)}</span>` : ''}</div>${v.note ? `<p class="small">${esc(v.note)}</p>` : ''}</div>
<div class="row"><button class="btn sm" data-act="v-view" data-id="${v.id}">View</button><button class="btn sm" data-act="v-diff" data-id="${v.id}">Compare with now</button><button class="btn sm" data-act="v-restore" data-id="${v.id}">Load inputs</button><button class="btn sm" data-act="v-copy" data-id="${v.id}">Copy</button></div></div>`).join('')}</div>`;
  }

  // field memory
  function memFor(field) { return live('memory').filter(m => m.field === field).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.last - a.last); }
  function remember(field, value, batch) {
    const v = String(value == null ? '' : value).trim(); if (!v || v.length > 20000) return;
    const id = Model.memId(field, v); const cur = D().memory[id];
    Store.put('memory', { id, field, value: v, uses: (cur && !cur.d ? cur.uses || 0 : 0) + 1, last: Date.now(), pinned: !!(cur && !cur.d && cur.pinned), first: cur && !cur.d && cur.first ? cur.first : Date.now() }, { batch });
  }

  let popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  function openPop(btn, field) {
    closePop();
    const f = field === 'tags' ? { label: 'Tags', kind: 'line' } : Engine.F[field];
    const prev = memFor(field);
    const sug = (f.sug || []).filter(s => !prev.some(p => p.value === s));
    const multi = f.kind === 'list' || field === 'tags';
    popEl = document.createElement('div'); popEl.className = 'pop'; popEl.setAttribute('role', 'dialog'); popEl.setAttribute('aria-label', 'Previous entries');
    const item = (txt, src, id) => `<div class="pop-item" data-src="${src}"${id ? ` data-id="${esc(id)}"` : ''}><span class="txt">${esc(txt)}</span><span class="acts"><button class="btn sm primary" data-pop="use">Use</button>${multi ? '<button class="btn sm" data-pop="add">Add</button>' : ''}</span></div>`;
    const paint = q => {
      const ql = q.toLowerCase();
      const P = prev.filter(p => p.value.toLowerCase().includes(ql)), G = sug.filter(s => s.toLowerCase().includes(ql));
      $('.pop-list', popEl).innerHTML = (P.length ? `<div class="pop-sec">Your previous entries</div>` + P.map(p => item(p.value, 'mem', p.id)).join('') : '') + (G.length ? `<div class="pop-sec">Suggested</div>` + G.map(s => item(s, 'sug')).join('') : '') + (!P.length && !G.length ? '<div class="empty small">Nothing saved for this field yet. Values are remembered each time you save a version.</div>' : '');
    };
    popEl.innerHTML = `<div class="pop-head"><b>${esc(f.label)}</b><input type="search" placeholder="Search entries" aria-label="Search entries"></div><div class="pop-list"></div>`;
    document.body.appendChild(popEl);
    paint('');
    const r = btn.getBoundingClientRect();
    const w = popEl.offsetWidth;
    popEl.style.top = (window.scrollY + r.bottom + 6) + 'px';
    popEl.style.left = Math.max(16, Math.min(window.scrollX + r.right - w, window.scrollX + document.documentElement.clientWidth - w - 16)) + 'px';
    const s = $('input', popEl); s.focus(); s.addEventListener('input', () => paint(s.value));
    popEl.addEventListener('click', e => {
      const b = e.target.closest('[data-pop]'); if (!b) return;
      const it = b.closest('.pop-item'); const txt = $('.txt', it).textContent;
      if (field === 'tags') {
        const cur = S.draft.tags || []; const add = txt.split(',').map(t => t.trim()).filter(Boolean);
        S.draft.tags = b.dataset.pop === 'add' ? Array.from(new Set(cur.concat(add))) : add;
        $('#f-tags').value = S.draft.tags.join(', ');
      } else {
        const el = $('#f-' + field);
        const cur = String(S.draft.inputs[field] || '').trim();
        const val = b.dataset.pop === 'add' && cur ? cur + '\n' + txt : txt;
        S.draft.inputs[field] = val; el.value = val;
      }
      saveDraft(); paintOut(); closePop(); toast('Entry inserted');
    });
  }

  // ---------------------------------------------------------------- save / versions
  function saveVersion() {
    const d = S.draft; const r = compute();
    const T = Engine.T[d.type];
    if (r.missingRequired.length) { toast('Fill ' + r.missingRequired.join(', ') + ' first'); const k = T.required.find(k => !String(d.inputs[k] || '').trim()); const el = $('#f-' + k); if (el) el.focus(); return; }
    if (d.buildId && !isDirty()) { toast('No changes since the last version'); return; }
    const sh = modal(`<h2>Save version</h2><p class="muted">Keeps this prompt, its thinking and every input. Earlier versions stay in history.</p>
<label class="f"><span class="f-name">What changed? (optional)</span><input id="vNote" placeholder="e.g. added sync rules"></label>
<div class="row" style="justify-content:flex-end"><button class="btn" data-x="no">Cancel</button><button class="btn primary" data-x="yes">Save version</button></div>`);
    $('[data-x=no]', sh).onclick = closeModal;
    const go = () => {
      const note = $('#vNote').value.trim(); closeModal();
      const title = d.inputs.title || d.inputs.topic || d.inputs.docname || d.inputs.dataset || d.inputs.piecetype || 'Untitled prompt';
      const now = Date.now();
      let b = d.buildId ? D().builds[d.buildId] : null;
      const n = (d.buildId ? versionsOf(d.buildId).reduce((m, v) => Math.max(m, v.n || 0), 0) : 0) + 1;
      const buildRec = { id: b && !b.d ? b.id : Model.rid('b_'), title: String(title).trim(), type: d.type, tags: d.tags || [], inputs: clean(d.inputs), options: d.options, profileId: d.profileId || '', created: b && b.created ? b.created : now, latest: { n, score: r.score.total, words: r.score.words, at: now } };
      if (b && b.imported) buildRec.imported = 1;
      if (b && b.sample) buildRec.sample = 1;
      Store.put('builds', buildRec, { batch: true });
      const prof = profileOf(d.profileId);
      Store.put('versions', { id: Model.rid('v_'), buildId: buildRec.id, n, at: now, note, type: d.type, tags: d.tags || [], prompt: r.prompt, thinking: r.thinkingText, score: r.score.total, inputs: clean(d.inputs), options: d.options, profileId: d.profileId || '', profile: prof ? { ...prof } : null, device: Sync.device(), sample: buildRec.sample || undefined }, { batch: true });
      for (const [k, v] of Object.entries(clean(d.inputs))) if (k !== 'unclear' && k !== 'prompt' && k !== 'thinking') remember(k, v, true);
      if ((d.tags || []).length) remember('tags', d.tags.join(', '), true);
      Store.commit();
      d.buildId = buildRec.id; saveDraft();
      toast(`Saved v${n} of "${buildRec.title}"`);
      rerender();
    };
    $('[data-x=yes]', sh).onclick = go;
    $('#vNote').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  function lineDiff(a, b) {
    const A = a.split('\n'), B = b.split('\n');
    if (A.length * B.length > 4e6) return `<span class="muted">Too long to compare line by line.</span>`;
    const n = A.length, m = B.length; const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0; const out = []; let same = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push(esc(A[i]) + '\n'); i++; j++; same++; }
      else if (L[i + 1][j] >= L[i][j + 1]) out.push(`<span class="minus">${esc(A[i++])}</span>`);
      else out.push(`<span class="plus">${esc(B[j++])}</span>`);
    }
    while (i < n) out.push(`<span class="minus">${esc(A[i++])}</span>`);
    while (j < m) out.push(`<span class="plus">${esc(B[j++])}</span>`);
    return out.join('');
  }

  // ---------------------------------------------------------------- LIBRARY
  function pLibrary(m) {
    const all = live('builds');
    const tags = Array.from(new Set(all.flatMap(b => b.tags || []))).sort((a, b) => a.localeCompare(b));
    const q = S.lib.q.toLowerCase();
    let list = all.filter(b => (!S.lib.type || b.type === S.lib.type) && (!S.lib.tag || (b.tags || []).includes(S.lib.tag)));
    if (q) list = list.filter(b => { const v = latestVersion(b.id); return [b.title, (b.tags || []).join(' '), v ? v.prompt : '', v ? v.thinking : ''].join(' ').toLowerCase().includes(q); });
    list.sort(S.lib.sort === 'title' ? (a, b) => a.title.localeCompare(b.title) : S.lib.sort === 'score' ? (a, b) => ((b.latest || {}).score || 0) - ((a.latest || {}).score || 0) : (a, b) => b.u - a.u);
    m.innerHTML = `<div class="page narrow">${banners()}
<div class="row spread"><div class="stack" style="gap:2px"><span class="eyebrow">Library</span><h1>${all.length} saved prompt${all.length === 1 ? '' : 's'}</h1></div>
<div class="row"><button class="btn" data-act="pm-import">Import from Prompt Manager</button><button class="btn" data-act="pm-all"${all.length ? '' : ' disabled'}>Export all to Prompt Manager</button></div></div>
<div class="filters"><input type="search" id="libQ" placeholder="Search titles, tags, prompt and thinking" value="${esc(S.lib.q)}" aria-label="Search library">
<select id="libType" aria-label="Kind"><option value="">All kinds</option>${Engine.TYPE_ORDER.map(t => `<option value="${t}"${S.lib.type === t ? ' selected' : ''}>${esc(Engine.T[t].name)}</option>`).join('')}</select>
<select id="libTag" aria-label="Tag"><option value="">All tags</option>${tags.map(t => `<option${S.lib.tag === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
<select id="libSort" aria-label="Sort"><option value="updated"${S.lib.sort === 'updated' ? ' selected' : ''}>Recently changed</option><option value="title"${S.lib.sort === 'title' ? ' selected' : ''}>Title</option><option value="score"${S.lib.sort === 'score' ? ' selected' : ''}>Score</option></select></div>
<p class="small muted" id="libCount">${list.length} of ${all.length} shown</p>
${list.length ? `<div class="list">${list.map(libItem).join('')}</div>` : `<div class="card empty">${all.length ? '<p>No prompt matches these filters.</p><button class="btn" data-act="lib-reset">Reset filters</button>' : '<p>Nothing saved yet. Build a prompt and press Save version, bring in your Prompt Manager library, or load the sample.</p><div class="row" style="justify-content:center"><a class="btn primary" href="#build">Build a prompt</a><button class="btn" data-act="pm-import">Import from Prompt Manager</button><button class="btn" data-act="sample-load">Load sample data</button></div>'}</div>`}
</div>`;
  }
  function libItem(b) {
    const v = latestVersion(b.id); const n = versionsOf(b.id).length;
    return `<div class="item"><div class="stack" style="gap:6px;min-width:0"><h3 style="overflow-wrap:anywhere">${esc(b.title)}${b.sample ? ' <span class="pill plain">Sample</span>' : ''}${b.imported ? ' <span class="pill plain">Imported</span>' : ''}</h3>
<div class="meta"><span>${esc(Engine.T[b.type] ? Engine.T[b.type].name : b.type)}</span><span>${n} version${n === 1 ? '' : 's'}</span>${v ? `<span class="num">Score ${v.score}</span><span class="num">${words(v.prompt).toLocaleString('en-IN')} words</span>` : ''}<span>Changed ${esc(fmtDate(b.u))}</span>${(b.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
<div class="row"><button class="btn sm primary" data-act="open" data-id="${b.id}">Open</button><button class="btn sm" data-act="lib-copy" data-id="${b.id}"${v ? '' : ' disabled'}>Copy prompt</button><button class="btn sm" data-act="dup" data-id="${b.id}">Duplicate</button><button class="btn sm" data-act="pm-build" data-id="${b.id}"${v ? '' : ' disabled'}>Prompt Manager</button><button class="btn sm danger" data-act="del" data-id="${b.id}">Delete</button></div></div>`;
  }

  function openBuild(id) {
    const b = D().builds[id]; if (!b || b.d) return;
    const go = () => {
      S.draft = { buildId: b.id, type: b.type, tags: b.tags || [], inputs: { ...b.inputs }, options: { style: 'plain', useProfile: true, chatOnly: false, off: {}, ...(b.options || {}) }, profileId: b.profileId || '' };
      saveDraft(); location.hash = '#build'; if (S.route === 'build') renderPage();
    };
    if (isDirty() && S.draft.buildId !== id) confirmBox('Leave unsaved changes?', 'The prompt on Build has changes that are not saved as a version. Open this one anyway? Your unsaved inputs will be replaced.', 'Open anyway', go);
    else go();
  }

  // ---------------------------------------------------------------- Prompt Manager import / export
  function pmRecords(builds) {
    return builds.map(b => { const v = latestVersion(b.id); return v ? { title: b.title, prompt: v.prompt, thinking: v.thinking, tags: b.tags || [] } : null; }).filter(Boolean);
  }
  function pmExport(builds, name) {
    const recs = pmRecords(builds); if (!recs.length) { toast('Save a version first'); return; }
    download(name, new Blob([Files.zip(Files.pmEntries(recs))], { type: 'application/zip' }));
  }

  function pmImportDialog() {
    const sh = modal(`<h2>Import from Prompt Manager</h2><p>Choose your <code>Prompting.zip</code>, or the <code>prompt_repository</code> folder itself. Every prompt folder with a <code>prompt.txt</code> comes in with its <code>thinking.txt</code> and tags. Nothing is saved until you press Import.</p>
<div class="row"><label class="btn primary" for="pmZip">Choose zip file</label><input type="file" id="pmZip" accept=".zip,application/zip" hidden>
<label class="btn" for="pmDir">Choose folder</label><input type="file" id="pmDir" webkitdirectory multiple hidden></div>
<div id="pmStatus" class="small muted"></div><div id="pmPreview"></div>
<div class="row" style="justify-content:flex-end"><button class="btn" data-x="no">Close</button></div>`, { wide: true });
    $('[data-x=no]', sh).onclick = closeModal;
    $('#pmZip').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      $('#pmStatus').textContent = `Reading ${f.name} (${(f.size / 1048576).toFixed(1)} MB)…`;
      try {
        const u8 = new Uint8Array(await f.arrayBuffer());
        const list = Files.zipList(u8);
        const byName = new Map(list.map(x => [x.name, x]));
        const groups = Files.pmGroups(list.map(x => x.name));
        const read = async p => p ? Files.dec.decode(await Files.zipRead(u8, byName.get(p))) : '';
        const items = [];
        for (const g of groups) items.push({ title: g.title, prompt: await read(g.prompt), thinking: await read(g.thinking), tags: g.meta ? Files.parseMeta(await read(g.meta)) : [] });
        pmPreview(items, `${list.length.toLocaleString('en-IN')} files scanned in ${f.name}.`);
      } catch (err) { $('#pmStatus').textContent = 'Could not read this zip: ' + err.message; }
    };
    $('#pmDir').onchange = async e => {
      const files = Array.from(e.target.files || []);
      const map = new Map(files.map(f => [f.webkitRelativePath || f.name, f]));
      const groups = Files.pmGroups([...map.keys()]);
      const read = async p => p ? await map.get(p).text() : '';
      const items = [];
      for (const g of groups) items.push({ title: g.title, prompt: await read(g.prompt), thinking: await read(g.thinking), tags: g.meta ? Files.parseMeta(await read(g.meta)) : [] });
      pmPreview(items, `${files.length.toLocaleString('en-IN')} files scanned.`);
    };
  }
  function pmStatusOf(it) {
    const same = live('builds').filter(b => b.title.toLowerCase() === it.title.toLowerCase());
    for (const b of same) { const v = latestVersion(b.id); if (v && v.prompt === it.prompt && (v.thinking || '') .includes((it.thinking || '').trim())) return { s: 'Already stored', b }; }
    if (same.length) return { s: 'New version', b: same[0] };
    return { s: 'New' };
  }
  function pmPreview(items, msg) {
    $('#pmStatus').textContent = `${msg} Found ${items.length} prompt${items.length === 1 ? '' : 's'}.`;
    if (!items.length) { $('#pmPreview').innerHTML = '<p>No prompt folders were found. Choose the zip or folder that contains <code>prompt_repository</code>.</p>'; return; }
    const rows = items.map(it => ({ it, st: pmStatusOf(it) }));
    $('#pmPreview').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Prompt</th><th>Tags</th><th>Words</th><th>Thinking</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.it.title)}</td><td>${esc(r.it.tags.join(', '))}</td><td class="num">${words(r.it.prompt).toLocaleString('en-IN')}</td><td>${r.it.thinking.trim() ? 'Yes' : 'No'}</td><td><span class="pill ${r.st.s === 'New' ? 'good' : r.st.s === 'New version' ? 'warn' : 'plain'}">${r.st.s}</span></td></tr>`).join('')}</tbody></table></div>
<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn primary" id="pmGo"${rows.some(r => r.st.s !== 'Already stored') ? '' : ' disabled'}>Import ${rows.filter(r => r.st.s !== 'Already stored').length}</button></div>`;
    $('#pmGo').onclick = () => {
      let n = 0;
      for (const { it, st } of rows) {
        if (st.s === 'Already stored') continue;
        const now = Date.now();
        const inputs = { title: it.title, prompt: it.prompt, thinking: it.thinking };
        const r = Engine.build({ type: 'review', inputs, options: {} });
        const id = st.b ? st.b.id : Model.rid('b_');
        const vn = st.b ? versionsOf(id).reduce((m, v) => Math.max(m, v.n || 0), 0) + 1 : 1;
        Store.put('builds', { id, title: it.title, type: 'review', tags: it.tags, inputs, options: { style: 'plain', off: {} }, profileId: '', imported: 1, created: st.b ? st.b.created : now, latest: { n: vn, score: r.score.total, words: r.score.words, at: now } }, { batch: true });
        Store.put('versions', { id: Model.rid('v_'), buildId: id, n: vn, at: now, note: 'Imported from Prompt Manager', type: 'review', tags: it.tags, prompt: it.prompt, thinking: it.thinking.trim() ? it.thinking : r.thinkingText, score: r.score.total, inputs, options: { style: 'plain', off: {} }, profileId: '', device: Sync.device() }, { batch: true });
        n++;
      }
      Store.commit(); closeModal(); toast(`Imported ${n} prompt${n === 1 ? '' : 's'}`); S.route === 'library' ? rerender() : (location.hash = '#library');
    };
  }

  // ---------------------------------------------------------------- SAVED INPUTS
  function pInputs(m) {
    const profiles = live('profiles').sort((a, b) => String(a.label).localeCompare(b.label));
    const mem = live('memory');
    const fields = Array.from(new Set(mem.map(x => x.field))).sort((a, b) => label(a).localeCompare(label(b)));
    const q = S.mem.q.toLowerCase();
    const shown = mem.filter(x => (!S.mem.field || x.field === S.mem.field) && (!q || x.value.toLowerCase().includes(q)));
    const groups = fields.filter(f => shown.some(x => x.field === f));
    m.innerHTML = `<div class="page narrow">${banners()}
<div class="stack" style="gap:2px"><span class="eyebrow">Saved inputs</span><h1>Profiles and previous entries</h1><p class="muted">Everything you type is remembered when you save a version, so next time you pick it instead of typing it. Pin what you use most.</p></div>
<section class="card"><div class="row spread"><h2>Profiles</h2><button class="btn primary" data-act="prof-new">Add profile</button></div>
<p class="small muted">A profile becomes the PROFILE block of Build and Extend prompts. Change the profile to reuse a prompt for someone else.</p>
${profiles.length ? `<div class="list">${profiles.map(p => `<div class="item"><div class="stack" style="gap:4px;min-width:0"><h3>${esc(p.label)}${settings().profileId === p.id ? ' <span class="pill plain">Default</span>' : ''}</h3><p class="small muted" style="white-space:pre-wrap">${esc(Engine.profileLines(p).join('\n'))}</p></div>
<div class="row"><button class="btn sm" data-act="prof-edit" data-id="${p.id}">Edit</button><button class="btn sm" data-act="prof-default" data-id="${p.id}">Make default</button><button class="btn sm danger" data-act="prof-del" data-id="${p.id}">Delete</button></div></div>`).join('')}</div>` : '<div class="empty"><p>No profile yet.</p></div>'}</section>
<section class="card"><h2>Previous entries <span class="muted small num">(${mem.length})</span></h2>
<div class="filters" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)"><input type="search" id="memQ" placeholder="Search entries" value="${esc(S.mem.q)}" aria-label="Search entries"><select id="memF" aria-label="Field"><option value="">All fields</option>${fields.map(f => `<option value="${f}"${S.mem.field === f ? ' selected' : ''}>${esc(label(f))}</option>`).join('')}</select></div>
${groups.length ? groups.map(f => `<div class="stack"><h3>${esc(label(f))}</h3><div class="list">${shown.filter(x => x.field === f).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.last - a.last).map(x => `<div class="item"><div class="stack" style="gap:4px;min-width:0"><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(x.value.length > 600 ? x.value.slice(0, 600) + '…' : x.value)}</p><div class="meta"><span class="num">Used ${x.uses || 1}×</span><span>Last ${esc(fmtDate(x.last))}</span>${x.pinned ? '<span class="pill plain">Pinned</span>' : ''}</div></div>
<div class="row"><button class="btn sm" data-act="mem-pin" data-id="${x.id}">${x.pinned ? 'Unpin' : 'Pin'}</button><button class="btn sm" data-act="mem-edit" data-id="${x.id}">Edit</button><button class="btn sm danger" data-act="mem-del" data-id="${x.id}">Delete</button></div></div>`).join('')}</div></div>`).join('') : `<div class="empty"><p>${mem.length ? 'No entry matches.' : 'Nothing remembered yet. Save a version on Build and its inputs appear here.'}</p></div>`}
</section></div>`;
  }
  const label = f => f === 'tags' ? 'Tags' : (Engine.F[f] ? Engine.F[f].label : f);

  function profileDialog(p) {
    p = p || { id: Model.rid('p_'), label: '', owner: '', location: '', timezone: 'Asia/Calcutta', github: '', currency: 'Indian rupees with lakh grouping (1,23,456.78)', fiscal: '1 April to 31 March, labelled ' + Engine.fyLabel(new Date()), weeks: 'ISO calendar weeks, Monday to Sunday, labelled CW' + Engine.isoWeek(new Date()), dates: 'Day first (28/10); 24-hour times', extra: '' };
    const fld = (k, l, h) => `<label class="f"><span class="f-name">${l}</span>${k === 'extra' ? `<textarea id="p-${k}" rows="3">${esc(p[k] || '')}</textarea>` : `<input id="p-${k}" value="${esc(p[k] || '')}">`}${h ? `<span class="f-hint">${h}</span>` : ''}</label>`;
    const sh = modal(`<h2>${p.label ? 'Edit profile' : 'Add profile'}</h2>
${fld('label', 'Profile name', 'For you only, e.g. "Me, personal projects".')}${fld('owner', 'Owner name')}${fld('location', 'City')}${fld('timezone', 'Timezone')}${fld('github', 'GitHub account', 'Used to work out the repository and live address.')}${fld('currency', 'Money format')}${fld('fiscal', 'Financial year')}${fld('weeks', 'Weeks')}${fld('dates', 'Dates and times')}${fld('extra', 'Other profile lines', 'One per line, e.g. "Default accounts: HDFC, UCO Bank, Indian Bank and Cash wallet".')}
<div class="row" style="justify-content:flex-end"><button class="btn" data-x="no">Cancel</button><button class="btn primary" data-x="yes">Save profile</button></div>`);
    $('[data-x=no]', sh).onclick = closeModal;
    $('[data-x=yes]', sh).onclick = () => {
      const rec = { ...p }; ['label', 'owner', 'location', 'timezone', 'github', 'currency', 'fiscal', 'weeks', 'dates', 'extra'].forEach(k => (rec[k] = $('#p-' + k).value.trim()));
      if (!rec.label) rec.label = rec.owner || 'My profile';
      Store.put('profiles', rec); if (!settings().profileId) saveSettings({ profileId: rec.id });
      if (!S.draft.profileId) { S.draft.profileId = rec.id; saveDraft(); }
      closeModal(); toast('Profile saved'); rerender();
    };
  }

  // ---------------------------------------------------------------- SETUP
  function pSetup(m) {
    const st = settings();
    const profiles = live('profiles');
    const installed = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    m.innerHTML = `<div class="page narrow">${banners()}
<div class="stack" style="gap:2px"><span class="eyebrow">Setup</span><h1>Setup</h1></div>
<section class="card" id="syncCard"><h2>Sync between devices</h2>
${Sync.supported ? `<p>Pick a folder inside OneDrive. This device writes one save file per session there (<code>prompt-builder-save-…json.gz</code>), keeps its newest 3, and reads every other device's saves when the page opens or becomes visible again. Each record keeps the newest change, and deletions travel too.</p>
<p class="small muted">Status: <b>${esc(Sync.label()[0])}</b>${Sync.detail ? ' · ' + esc(Sync.detail) : ''}${Sync.dir ? ` · folder <code>${esc(Sync.dir.name)}</code>` : ''} · this device's id <code>${esc(Sync.device())}</code></p>
<div class="row"><button class="btn primary" data-act="sync-choose">${Sync.dir ? 'Choose a different folder' : 'Choose sync folder'}</button>${Sync.dir ? '<button class="btn" data-act="sync-retry">Sync now</button><button class="btn" data-act="sync-off">Stop syncing on this device</button>' : ''}</div>`
  : `<p>This browser cannot open folders (Firefox, Safari and every iPhone browser). Use <b>Download backup</b> here and <b>Restore from backup</b> on the other device; restore merges and never deletes.</p>`}
</section>
<section class="card"><h2>Your data</h2>
<div class="row"><button class="btn" data-act="backup">Download backup</button><label class="btn" for="restoreFile">Restore from backup</label><input type="file" id="restoreFile" accept=".json,application/json" hidden></div>
<p class="small muted">Restore merges a backup into this device: newer records win, nothing is deleted.</p>
<div class="row"><button class="btn" data-act="xlsx">Export everything to Excel</button><button class="btn" data-act="csv">Export library to CSV</button><button class="btn" data-act="pm-all">Export all to Prompt Manager</button><button class="btn" data-act="pm-import">Import from Prompt Manager</button></div>
<div class="row"><button class="btn" data-act="sample-load">Load sample data</button><button class="btn" data-act="sample-remove">Remove sample data</button></div>
<p class="small muted">Stored on this device in ${Store.mode === 'idb' ? 'browser storage (IndexedDB)' : '<b>memory only</b>; download a backup before closing'}: ${live('builds').length} prompts, ${live('versions').length} versions, ${live('memory').length} saved entries, ${profiles.length} profiles.</p>
</section>
<section class="card"><h2>Defaults for new prompts</h2>
<div class="filters" style="grid-template-columns:repeat(3,minmax(0,1fr))">
<label class="f"><span class="f-name">Prompt layout</span><select id="setStyle">${Object.entries(Engine.STYLES).map(([k, v]) => `<option value="${k}"${st.style === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
<label class="f"><span class="f-name">When something is unclear</span><select id="setUnclear">${Object.entries(Engine.UNCLEAR).map(([k, v]) => `<option value="${k}"${st.unclear === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
<label class="f"><span class="f-name">Default profile</span><select id="setProfile"><option value="">None</option>${profiles.map(p => `<option value="${p.id}"${st.profileId === p.id ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label></div></section>
<section class="card"><h2>This device</h2>
<div class="row"><button class="btn" data-act="install"${S.deferredInstall ? '' : ' disabled'}>${installed ? 'Installed' : 'Install app'}</button>
<label class="f" style="min-width:200px"><span class="f-name">Appearance</span><select id="setTheme"><option value="system">Follow system</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
${S.deferredInstall || installed ? '' : '<p class="small muted">No install prompt from this browser. In Chrome on Android use the menu, then Add to Home screen; in Edge use Apps, then Install this site as an app.</p>'}
</section></div>`;
    $('#setTheme').value = Prefs.get('theme', 'system');
  }

  // ---------------------------------------------------------------- data tools
  function doBackup() { download(`Prompt_Builder_Backup_${stampName()}.json`, JSON.stringify(Model.backupBlob(D()), null, 1), 'application/json'); Prefs.set('lastBackup', Date.now()); }
  async function doRestore(file) {
    try {
      const obj = JSON.parse(await file.text());
      const inc = Model.readBackup(obj);
      const m = Model.merge(D(), inc);
      if (m.localChanged) { Store.replace(m.data); Sync.schedule(); }
      toast(m.localChanged ? 'Backup merged into this device' : 'Nothing new in that backup');
      rerender();
    } catch (e) { toast(e instanceof SyntaxError ? 'That file is not valid JSON.' : e.message); }
  }
  function libraryRows() {
    return live('builds').sort((a, b) => a.title.localeCompare(b.title)).map(b => { const v = latestVersion(b.id) || {}; return [b.title, Engine.T[b.type] ? Engine.T[b.type].name : b.type, (b.tags || []).join(', '), versionsOf(b.id).length, v.score == null ? '' : v.score, v.prompt ? words(v.prompt) : 0, fmtDate(b.u), v.prompt || '', v.thinking || '']; });
  }
  const LIB_HEAD = ['Title', 'Kind', 'Tags', 'Versions', 'Latest score', 'Words', 'Last changed', 'Latest prompt', 'Thinking'];
  function doXlsx() {
    const vers = live('versions').map(v => { const b = D().builds[v.buildId]; return b && !b.d ? [b.title, v.n, fmtDate(v.at), v.note || '', v.score, words(v.prompt), v.prompt] : null; }).filter(Boolean).sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
    const mem = live('memory').sort((a, b) => label(a.field).localeCompare(label(b.field)) || b.last - a.last).map(x => [label(x.field), x.value, x.uses || 1, fmtDate(x.last), x.pinned ? 'Yes' : '']);
    const bytes = Files.xlsx([
      { name: 'Library', rows: [LIB_HEAD].concat(libraryRows()), widths: [34, 22, 22, 10, 12, 10, 20, 80, 80] },
      { name: 'Versions', rows: [['Title', 'Version', 'Saved', 'Note', 'Score', 'Words', 'Prompt']].concat(vers), widths: [34, 9, 20, 30, 8, 8, 100] },
      { name: 'Saved inputs', rows: [['Field', 'Value', 'Uses', 'Last used', 'Pinned']].concat(mem), widths: [26, 90, 8, 20, 8] },
    ]);
    download(`Prompt_Builder_All_${stampName()}.xlsx`, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  function doCsv() { download(`Prompt_Builder_Library_${stampName()}.csv`, Files.csv([LIB_HEAD].concat(libraryRows())), 'text/csv;charset=utf-8'); }

  function loadSample() {
    const now = Date.now();
    for (const s of SAMPLES) {
      const id = 'b_sample_' + s.key;
      const r = Engine.build({ type: s.type, inputs: s.inputs, options: { style: 'plain', off: {} }, profile: SAMPLE_PROFILE });
      Store.put('builds', { id, sample: 1, title: s.inputs.title || s.inputs.topic, type: s.type, tags: s.tags, inputs: s.inputs, options: { style: 'plain', useProfile: true, off: {} }, profileId: 'p_sample', created: now, latest: { n: 1, score: r.score.total, words: r.score.words, at: now } }, { batch: true });
      Store.put('versions', { id: 'v_sample_' + s.key, sample: 1, buildId: id, n: 1, at: now, note: 'Sample', type: s.type, tags: s.tags, prompt: r.prompt, thinking: r.thinkingText, score: r.score.total, inputs: s.inputs, options: { style: 'plain', useProfile: true, off: {} }, profileId: 'p_sample', device: Sync.device() }, { batch: true });
    }
    Store.put('profiles', { ...SAMPLE_PROFILE, sample: 1 }, { batch: true });
    Store.commit(); toast('Sample data loaded'); rerender();
  }
  function removeSample() {
    let n = 0;
    for (const c of ['builds', 'versions', 'profiles', 'memory']) for (const r of Object.values(D()[c])) if (!r.d && r.sample) { Store.remove(c, r.id, { batch: true }); n++; }
    if (S.draft.buildId && D().builds[S.draft.buildId] && D().builds[S.draft.buildId].d) { S.draft = newDraft(S.draft.type); saveDraft(); }
    if (S.draft.profileId === 'p_sample') { S.draft.profileId = ''; saveDraft(); }
    Store.commit(); toast(n ? 'Sample data removed' : 'No sample data to remove'); rerender();
  }
  const SAMPLE_PROFILE = { id: 'p_sample', label: 'Sample profile', owner: 'Asha (sample)', location: 'Chennai', timezone: 'Asia/Calcutta', github: 'asha-sample', currency: 'Indian rupees with lakh grouping (1,23,456.78)', fiscal: '1 April to 31 March', weeks: 'ISO calendar weeks, labelled CW44', dates: 'Day first; 24-hour times', extra: '' };
  const SAMPLES = [
    { key: 'habit', type: 'app', tags: ['sample', 'web-app'], inputs: { title: 'Water and walk log', role: 'Senior front-end engineer', goal: 'A small habit tracker for water glasses and daily walks, as a static single-page web app on GitHub Pages that works offline on a phone.', need: 'Missing a day should be visible at a glance, not silently counted as zero.', users: 'One user on an Android phone, a few taps a day, for years.', features: 'Today: two big buttons, +1 glass and Log walk (minutes)\nWeek: a 7-day strip with totals per day\nSettings: daily targets, backup and restore', data: 'Entry: date, kind (water or walk), amount, note', rules: 'A day meets the water target when glasses >= target\nStreak = consecutive days meeting both targets, ending yesterday or today', examples: '3 glasses with a target of 8 shows 3 of 8\nA walk of 25 minutes with a 30-minute target shows 83%', unclear: 'decide', acceptance: 'Offline | Reload in airplane mode | Entries remain\nStreak | Meet both targets two days running | Streak shows 2' } },
    { key: 'pq', type: 'research', tags: ['sample', 'research', 'wind'], inputs: { topic: 'power quality testing of wind turbines under IEC 61400-21-1', role: 'expert technical research assistant', purpose: 'To build a reading list for a two-hour training session for test engineers.', scope: 'Published 2019 or later; English; standards bodies, test labs and manufacturers.', sources: 'Official standards bodies, accredited test labs and manufacturer documentation first; no forums as sole sources.', output: 'An on-screen Markdown table and a downloadable .csv with the same columns.', columns: 'Title\nPublisher\nYear\nLink\nKey takeaway (2 sentences)', count: '10', unclear: 'decide' } },
  ];

  // ---------------------------------------------------------------- events
  function onInput(e) {
    const t = e.target;
    if (t.matches('[data-field]') && S.route === 'build') {
      S.draft.inputs[t.dataset.field] = t.value; saveDraft(); clearTimeout(S.outTimer); S.outTimer = setTimeout(paintOut, 120);
    } else if (t.matches('[data-opt]')) {
      const k = t.dataset.opt;
      if (k === 'tags') S.draft.tags = t.value.split(',').map(s => s.trim()).filter(Boolean);
      else if (k === 'useProfile' || k === 'chatOnly') S.draft.options[k] = t.checked;
      else if (k === 'style') S.draft.options.style = t.value;
      else if (k === 'profileId') S.draft.profileId = t.value;
      saveDraft(); paintOut();
    } else if (t.id === 'libQ') { S.lib.q = t.value; const pos = t.selectionStart; rerender(); const n = $('#libQ'); n.focus(); n.setSelectionRange(pos, pos); }
    else if (t.id === 'memQ') { S.mem.q = t.value; const pos = t.selectionStart; rerender(); const n = $('#memQ'); n.focus(); n.setSelectionRange(pos, pos); }
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'libType') { S.lib.type = t.value; rerender(); }
    else if (t.id === 'libTag') { S.lib.tag = t.value; rerender(); }
    else if (t.id === 'libSort') { S.lib.sort = t.value; rerender(); }
    else if (t.id === 'memF') { S.mem.field = t.value; rerender(); }
    else if (t.id === 'setStyle') { saveSettings({ style: t.value }); toast('Default layout saved'); }
    else if (t.id === 'setUnclear') { saveSettings({ unclear: t.value }); toast('Default saved'); }
    else if (t.id === 'setProfile') { saveSettings({ profileId: t.value }); toast('Default profile saved'); }
    else if (t.id === 'setTheme') { Prefs.set('theme', t.value); paintTheme(); }
    else if (t.id === 'restoreFile' && t.files[0]) { doRestore(t.files[0]); t.value = ''; }
    else if (t.matches('[data-act=pack]')) { S.draft.options.off = { ...(S.draft.options.off || {}) }; if (t.checked) delete S.draft.options.off[t.dataset.pack]; else S.draft.options.off[t.dataset.pack] = true; saveDraft(); paintOut(); }
    else if (t.matches('select[data-field]') && S.route === 'build') { S.draft.inputs[t.dataset.field] = t.value; saveDraft(); paintOut(); }
  }

  const ACT = {
    'theme'() { const order = ['system', 'light', 'dark']; const cur = Prefs.get('theme', 'system'); Prefs.set('theme', order[(order.indexOf(cur) + 1) % 3]); paintTheme(); if (S.route === 'setup') $('#setTheme').value = Prefs.get('theme'); },
    'go-sync'() { if (Sync.state === 'access') return Sync.allow().then(rerender); location.hash = '#setup'; setTimeout(() => { const c = $('#syncCard'); if (c) c.scrollIntoView({ block: 'start' }); }, 30); },
    'type'(b) {
      const t = b.dataset.type; if (t === S.draft.type) return;
      S.draft.type = t; if (S.draft.buildId) { S.draft.buildId = null; toast('Kind changed: this will save as a new prompt'); }
      saveDraft(); rerender();
    },
    'new'() {
      const go = () => { S.draft = newDraft(S.draft.type); S.otab = 'prompt'; Prefs.set('otab', 'prompt'); saveDraft(); rerender(); const f = $('#form input,#form textarea'); if (f) f.focus(); };
      if (isDirty()) confirmBox('Start a new prompt?', 'The current inputs have changes that are not saved as a version. They will be cleared.', 'Start new', go); else go();
    },
    'save-version'() { saveVersion(); },
    'otab'(b) { S.otab = b.dataset.tab; Prefs.set('otab', S.otab); paintOut(); },
    'copy-prompt'() { copy(S.out.prompt, 'Prompt'); },
    'copy-thinking'() { copy(S.out.thinkingText, 'Thinking'); },
    'dl-prompt'() { download(`${Files.safeFolder(S.draft.inputs.title || 'prompt') || 'prompt'}.txt`, S.out.prompt, 'text/plain;charset=utf-8'); },
    'pm-one'() {
      const r = S.out; const title = S.draft.inputs.title || S.draft.inputs.topic || 'Untitled prompt';
      download(`${Files.safeFolder(title)}_PromptManager.zip`, new Blob([Files.zip(Files.pmEntries([{ title, prompt: r.prompt, thinking: r.thinkingText, tags: S.draft.tags || [] }]))], { type: 'application/zip' }));
    },
    'mem'(b) { if (popEl && popEl.dataset.field === b.dataset.field) return closePop(); openPop(b, b.dataset.field); popEl.dataset.field = b.dataset.field; },
    'fix'(b) {
      const k = b.dataset.field; const det = $('#f-' + k) && $('#f-' + k).closest('details'); if (det) det.open = true;
      const el = $('#f-' + k); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus(); const mb = el.closest('label').querySelector('.mem-btn'); if (mb && !String(S.draft.inputs[k] || '').trim()) setTimeout(() => ACT.mem(mb), 350); }
    },
    'append-fix'(b) {
      const c = Engine.CHECKS.find(x => x.id === b.dataset.check);
      const add = { task: 'Your task: [state exactly what to produce, in one sentence].', role: 'You are a [specific expert role].', context: 'Context: the goal is [why], so that [what success looks like].', specific: '[Add numbers: counts, sizes, limits, dates.]', examples: 'Example: [input] → [expected result].', structure: 'Deliver the result as [format: sections / a table with columns … / a file].', steps: 'Work step by step: first [ ], then [ ], then [ ].', unsure: 'If you are unsure about something, say you do not know instead of guessing.', verify: 'Before answering, verify your result by [method] and tell me what you could not check.', limits: 'Do not [ ]. Never [ ]. Only [ ].', done: 'Done when: [check] → [what a pass looks like].' }[c.id];
      S.draft.inputs.prompt = String(S.draft.inputs.prompt || '').replace(/\s*$/, '') + '\n\n' + add; $('#f-prompt').value = S.draft.inputs.prompt; saveDraft(); paintOut(); toast('Line added; fill in the brackets');
    },
    'v-view'(b) { const v = D().versions[b.dataset.id]; const sh = modal(`<div class="row spread"><h2>v${v.n} · ${esc(fmtDate(v.at))}</h2><button class="btn" data-x="no">Close</button></div>${v.note ? `<p>${esc(v.note)}</p>` : ''}<div class="row"><button class="btn sm primary" data-x="cp">Copy prompt</button><button class="btn sm" data-x="ct">Copy thinking</button></div><div class="table-wrap"><pre class="sheet">${esc(v.prompt)}</pre></div><h3>Thinking</h3><div class="table-wrap thinking"><pre class="sheet" style="font-family:var(--f-body)">${esc(v.thinking)}</pre></div>`, { wide: true }); $('[data-x=no]', sh).onclick = closeModal; $('[data-x=cp]', sh).onclick = () => copy(v.prompt, 'Prompt'); $('[data-x=ct]', sh).onclick = () => copy(v.thinking, 'Thinking'); },
    'v-diff'(b) { const v = D().versions[b.dataset.id]; const sh = modal(`<div class="row spread"><h2>v${v.n} compared with now</h2><button class="btn" data-x="no">Close</button></div><p class="small muted">Struck-through red lines were in v${v.n}; green lines are new now.</p><div class="table-wrap"><pre class="diff" style="padding:14px">${lineDiff(v.prompt, S.out.prompt)}</pre></div>`, { wide: true }); $('[data-x=no]', sh).onclick = closeModal; },
    'v-restore'(b) { const v = D().versions[b.dataset.id]; const go = () => { S.draft = { ...S.draft, type: v.type, tags: v.tags || [], inputs: { ...v.inputs }, options: { style: 'plain', off: {}, ...(v.options || {}) }, profileId: v.profileId || '' }; saveDraft(); rerender(); toast(`Inputs from v${v.n} loaded. Save a version to keep them as the latest.`); }; if (isDirty()) confirmBox('Load these inputs?', 'Your current unsaved inputs will be replaced. Saved versions are not touched.', 'Load inputs', go); else go(); },
    'v-copy'(b) { copy(D().versions[b.dataset.id].prompt, 'Prompt'); },
    'open'(b) { openBuild(b.dataset.id); },
    'lib-copy'(b) { const v = latestVersion(b.dataset.id); if (v) copy(v.prompt, 'Prompt'); },
    'dup'(b) { const src = D().builds[b.dataset.id]; const go = () => { S.draft = { buildId: null, type: src.type, tags: src.tags || [], inputs: { ...src.inputs, title: (src.inputs.title || src.title) + ' (copy)' }, options: { style: 'plain', off: {}, ...(src.options || {}) }, profileId: src.profileId || '' }; saveDraft(); location.hash = '#build'; toast('Copy opened on Build. Save a version to keep it.'); }; if (isDirty()) confirmBox('Replace unsaved inputs?', 'Build has unsaved changes. Duplicate anyway?', 'Duplicate', go); else go(); },
    'del'(b) { const x = D().builds[b.dataset.id]; confirmBox('Delete this prompt?', `"${esc(x.title)}" and its ${versionsOf(x.id).length} version(s) will be deleted on every synced device. Download a backup first if you may want it back.`, 'Delete', () => { versionsOf(x.id).forEach(v => Store.remove('versions', v.id, { batch: true })); Store.remove('builds', x.id, { batch: true }); Store.commit(); if (S.draft.buildId === x.id) { S.draft.buildId = null; saveDraft(); } toast('Deleted'); rerender(); }, true); },
    'lib-reset'() { S.lib = { q: '', type: '', tag: '', sort: 'updated' }; rerender(); },
    'pm-build'(b) { const x = D().builds[b.dataset.id]; pmExport([x], `${Files.safeFolder(x.title)}_PromptManager.zip`); },
    'pm-all'() { pmExport(live('builds'), `Prompt_Manager_repository_${stampName()}.zip`); },
    'pm-import'() { pmImportDialog(); },
    'prof-new'() { profileDialog(null); },
    'prof-edit'(b) { profileDialog({ ...D().profiles[b.dataset.id] }); },
    'prof-default'(b) { saveSettings({ profileId: b.dataset.id }); toast('Default profile set'); rerender(); },
    'prof-del'(b) { const p = D().profiles[b.dataset.id]; confirmBox('Delete this profile?', `"${esc(p.label)}" will be removed from every synced device. Saved versions keep their own copy.`, 'Delete', () => { Store.remove('profiles', p.id); if (settings().profileId === p.id) saveSettings({ profileId: '' }); if (S.draft.profileId === p.id) { S.draft.profileId = ''; saveDraft(); } rerender(); }, true); },
    'mem-pin'(b) { const x = D().memory[b.dataset.id]; Store.put('memory', { ...x, pinned: !x.pinned }); rerender(); },
    'mem-del'(b) { Store.remove('memory', b.dataset.id); toast('Entry deleted'); rerender(); },
    'mem-edit'(b) {
      const x = D().memory[b.dataset.id];
      const sh = modal(`<h2>Edit entry</h2><p class="small muted">${esc(label(x.field))}</p><textarea id="memText" rows="8">${esc(x.value)}</textarea><div class="row" style="justify-content:flex-end"><button class="btn" data-x="no">Cancel</button><button class="btn primary" data-x="yes">Save</button></div>`);
      $('[data-x=no]', sh).onclick = closeModal;
      $('[data-x=yes]', sh).onclick = () => { const v = $('#memText').value.trim(); closeModal(); if (!v || v === x.value) return; const id = Model.memId(x.field, v); Store.remove('memory', x.id, { batch: true }); const cur = D().memory[id]; Store.put('memory', { id, field: x.field, value: v, uses: (x.uses || 1) + (cur && !cur.d ? cur.uses || 0 : 0), last: x.last, pinned: x.pinned, first: x.first }, { batch: true }); Store.commit(); rerender(); };
    },
    'backup'() { doBackup(); },
    'xlsx'() { doXlsx(); },
    'csv'() { doCsv(); },
    'sample-load'() { loadSample(); },
    'sample-remove'() { removeSample(); },
    'sync-choose'() { Sync.choose().then(() => { toast('Sync folder connected'); rerender(); }).catch(e => { if (e && e.name !== 'AbortError') toast('Could not use that folder: ' + e.message); }); },
    'sync-allow'() { Sync.allow().then(rerender); },
    'sync-retry'() { Sync.pull().then(() => Sync.writeNow()).then(rerender); },
    'sync-off'() { confirmBox('Stop syncing on this device?', 'This device stops reading and writing the folder. Nothing is deleted, here or in the folder.', 'Stop syncing', () => Sync.disconnect().then(rerender)); },
    'install'() { if (!S.deferredInstall) return; S.deferredInstall.prompt(); S.deferredInstall.userChoice.finally(() => { S.deferredInstall = null; rerender(); }); },
  };
  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (popEl && !e.target.closest('.pop') && !(b && b.dataset.act === 'mem')) closePop();
    if (!b || b.matches('input[type=checkbox]')) return;
    const fn = ACT[b.dataset.act]; if (fn) { e.preventDefault(); fn(b); }
  }

  // ---------------------------------------------------------------- boot
  async function boot() {
    shell();
    await Store.init();
    S.draft = loadDraft();
    if (S.draft.buildId && (!D().builds[S.draft.buildId] || D().builds[S.draft.buildId].d)) S.draft.buildId = null;
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePop(); closeModal(); } });
    window.addEventListener('hashchange', route);
    Store.on((kind, info) => {
      if (kind === 'change' && !(info && info.fromSync)) Sync.schedule();
      if (kind === 'change' && info && info.fromSync) { if (S.route !== 'build') rerender(); else paintOut(); }
      if (kind === 'save-error') { toast('Could not save on this device'); rerender(); }
    });
    let lastAlert = '';
    Sync.on(() => {
      paintChip();
      const a = ['access', 'problem'].includes(Sync.state) ? Sync.state : '';
      if (a !== lastAlert) { lastAlert = a; if (!document.activeElement || !document.activeElement.matches('input,textarea')) rerender(); }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { if (Prefs.get('unsaved', false) && Sync.dir) Sync.writeNow(); }
      else if (Sync.dir) Sync.pull();
    });
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.deferredInstall = e; if (S.route === 'setup') rerender(); });
    setInterval(paintChip, 30000);
    route();
    Sync.init().then(paintChip).catch(() => {});
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.__PB_NO_SW) {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* preview hosts may refuse; the app still works */ });
    }
  }
  window.PB = { S, boot, Store, Sync, Engine, Model, Files, ACT };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
