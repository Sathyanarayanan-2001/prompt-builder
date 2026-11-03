/* Prompt Builder engine: templates, smart rule packs, prompt assembly,
   quality scoring and the "how the AI will think" explanation.
   Pure functions only, no DOM. Loaded as a plain script; exposes `Engine`. */
'use strict';
const Engine = (() => {

  // ---------------------------------------------------------------- fields
  const UNCLEAR = {
    decide: 'Decide, build, then list my choices',
    ask: 'Ask focused questions first',
    irreversible: 'Ask only before irreversible steps',
  };
  const STYLES = { plain: 'Plain headings', markdown: 'Markdown', xml: 'XML tags' };

  const F = {
    title: { label: 'Name', kind: 'line', hint: 'What the tool or task is called.', ph: 'Daily expense ledger' },
    role: { label: 'Role for the AI', kind: 'line', hint: 'A specific expert role sharpens judgement (guide tip 6).', ph: 'Senior full-stack engineer who also thinks like an accountant',
      sug: ['Senior full-stack engineer who also thinks like an accountant', 'Senior front-end engineer', 'Principal Python desktop application engineer and UI/UX expert', 'Principal system architect, UI/UX expert and applied AI engineer', 'Expert technical research assistant', 'Seasoned financial analyst', 'Senior technical writer', 'Experienced trainer in the Indian onshore wind sector'] },
    goal: { label: 'What to build', kind: 'text', hint: 'One paragraph: what it is, what it does, where it runs.', ph: 'A personal daily, monthly and yearly expense tracker, built as a static single-page web app that runs on my phone and laptops.' },
    need: { label: 'The real need', kind: 'text', hint: 'What failure looks like. The AI designs against this.', ph: 'The real enemy is the missed day: an empty day must mean forgotten, never zero.' },
    users: { label: 'Who uses it, where, how often', kind: 'text', hint: 'Devices, browsers, frequency, years of use.', ph: 'One user, two Windows laptops (Chrome, Edge) and an Android phone; 20+ entries a day, for years.' },
    stack: { label: 'Tech stack and platform', kind: 'text', hint: 'Languages, libraries, hosting. Say what is not allowed too.',
      sug: ['Static single-page web app on GitHub Pages: plain HTML, CSS and JavaScript (ES2022), no framework, no CDN, everything inlined into one index.html.', 'Python 3.10+ desktop app with Tkinter/ttk, object-oriented, runs on Windows first.', 'Python 3.10+ with PyQt6, SQLite and openpyxl; Windows, macOS and Linux.', 'Excel workbook with formulas only, no macros.'] },
    features: { label: 'Pages and features', kind: 'list', hint: 'One per line. Name every page and what is on it.', ph: 'Start: a guide that uses the exact button names\nAdd: date, slot, amount (accepts 120+80), category\nDashboard: period selector and seven cards' },
    data: { label: 'Data model', kind: 'list', hint: 'One record type per line with its fields.', ph: 'Entry: date, slot, account, category, amount, notes, group' },
    rules: { label: 'Exact rules and formulas', kind: 'list', hint: 'Write each rule as a formula. These become tests.', ph: 'Savings = income - needs - wants\nSavings rate = savings / income, or none when income is zero' },
    examples: { label: 'Worked examples', kind: 'list', hint: 'Input and the expected result (guide tip 2).', ph: '"120+80" is saved as ₹200\n"2-3:30 CEA report" means 14:00 to 15:30' },
    storage: { label: 'Storage', kind: 'text', hint: 'Where data lives and how it survives.', sug: ['IndexedDB on each device; localStorage only for small preferences with a unique key prefix. Backup file restore merges and never deletes.', 'Hidden SQLite database next to the app, auto-created on first run, with a styled Excel copy kept in step.'] },
    sync: { label: 'Sync between devices', kind: 'text', hint: 'Leave empty if one device.', sug: ['Sync through a OneDrive folder chosen with showDirectoryPicker: each session writes one gzip JSON save file, keeps the newest 3, and merges every other device\'s saves per record.'] },
    offline: { label: 'Offline and install', kind: 'text', hint: 'PWA, service worker, installers.', sug: ['Installs as an app and works offline: service worker (network first, cached copy offline) and a web manifest.'] },
    design: { label: 'Design and theme', kind: 'text', hint: 'Look, density, fonts, light/dark, phone layout.', sug: ['Calm, dense tool for daily use. Light and dark themes following the system first. IBM Plex Sans embedded. Sentence case labels, tabular numbers, visible focus.'] },
    repo: { label: 'Repository and CI', kind: 'text', hint: 'Folders, documents, GitHub Actions.', sug: ['Follow GitHub best practice: src, scripts, tests, docs, .github; README, CHANGELOG, CONTRIBUTING, SECURITY, MIT LICENSE; Actions test then deploy to Pages.'] },
    privacy: { label: 'Security and privacy', kind: 'text', hint: 'What must never leave the device or reach the repo.', sug: ['No accounts, analytics or outside requests. No personal data, real entries or backups may ever be committed.'] },
    unclear: { label: 'When something is unclear', kind: 'select', options: UNCLEAR, hint: 'Guide: let the AI say it does not know instead of guessing.' },
    verify: { label: 'How to verify (two methods)', kind: 'list', hint: 'Two different routes, so the code never marks its own homework.' },
    tests: { label: 'Must-pass test cases', kind: 'list', hint: 'Concrete inputs and results.' },
    pitfalls: { label: 'Known pitfalls', kind: 'list', hint: 'Mistakes seen before; each one saves a debugging session.' },
    acceptance: { label: 'Acceptance checklist', kind: 'list', hint: 'One per line: check | how | pass looks like.', ph: 'Offline | Reload, then airplane mode | Entries remain and the page opens' },
    buildorder: { label: 'Build order', kind: 'list', hint: 'Stages, lowest layer first (guide tip 3).' },
    delivery: { label: 'Delivery and final answer', kind: 'text', hint: 'What you get back and what the last message says.' },
    existing: { label: 'What exists today', kind: 'text', hint: 'Where the code is, its stack and how it is organised.', ph: 'My AI Prompt Manager: prompt_manager.py, Tkinter, prompts stored in prompt_repository/<title>/' },
    change: { label: 'The change', kind: 'text', hint: 'Exactly what to add or fix.', ph: 'Add a Duplicate Prompt button next to Edit Prompt.' },
    preserve: { label: 'Behaviour to preserve', kind: 'list', hint: 'What must not change.' },
    constraints: { label: 'Constraints', kind: 'list', hint: 'Limits and must-nots.' },
    topic: { label: 'Topic', kind: 'line', hint: 'The subject, as specific as you can.', ph: 'IEC 61400-21-1 power quality testing for wind turbines' },
    purpose: { label: 'Purpose: how you will use it', kind: 'text', hint: 'Guide tip 5: say how the answer will be used.' },
    scope: { label: 'Scope', kind: 'text', hint: 'Include, exclude, time range, regions.' },
    sources: { label: 'Sources', kind: 'text', hint: 'Preferred and avoided sources.', sug: ['Official standards bodies, regulators (CEA, CERC, MNRE) and manufacturer documentation first; no forums as sole sources.', 'Top-rated YouTube tutorials, official masterclasses and community developer guides.'] },
    output: { label: 'Output format', kind: 'text', hint: 'Table, sections, file type, length.', sug: ['An on-screen Markdown table and a downloadable .csv file with the same columns.', 'Headings with bullet points; a one-paragraph summary at the top.'] },
    columns: { label: 'Columns or fields', kind: 'list', hint: 'One per line.' },
    count: { label: 'How many', kind: 'line', hint: 'A number makes the scope testable.', ph: '10' },
    docname: { label: 'Document name', kind: 'line', hint: 'Refer to the attachment by name (guide).', ph: 'CEA Technical Standards for Connectivity (2023).pdf' },
    focus: { label: 'What to focus on', kind: 'text', hint: 'The aspects you care about.' },
    questions: { label: 'Questions to answer', kind: 'list', hint: 'One per line; they will be numbered.' },
    length: { label: 'Length and structure', kind: 'line', hint: 'e.g. a 2-paragraph summary.', ph: 'A 2-paragraph summary, then numbered answers' },
    citations: { label: 'Citations', kind: 'line', hint: 'Ask for section or page references.', sug: ['Cite the section number or page for every answer.'] },
    audience: { label: 'Audience', kind: 'text', hint: 'Who reads it and what they already know.' },
    dataset: { label: 'Dataset', kind: 'line', hint: 'File name and what one row is.', ph: 'Expense_Ledger_All_2026-11.xlsx, one row per entry' },
    context: { label: 'Context', kind: 'text', hint: 'The decision this supports.' },
    structure: { label: 'Structure of the answer', kind: 'list', hint: 'Sections in order.' },
    metrics: { label: 'Key metrics', kind: 'list', hint: 'One per line.' },
    visuals: { label: 'Visuals', kind: 'text', hint: 'Charts or tables wanted.' },
    categories: { label: 'Group ideas by', kind: 'list', hint: 'Categories for the ideas.' },
    piecetype: { label: 'What to write', kind: 'line', hint: 'Blog post, email, training handout…', ph: 'A training handout' },
    tone: { label: 'Tone and voice', kind: 'line', hint: 'Guide: define the tone and style.', sug: ['Professional but engaging', 'Plain and direct, no jargon', 'Friendly and slightly humorous'] },
    example: { label: 'Example to imitate', kind: 'text', hint: 'Paste a similar piece you liked (guide tip 2).' },
    cta: { label: 'Call to action / ending', kind: 'line', hint: 'How it should end.' },
    prompt: { label: 'Prompt text', kind: 'text', hint: 'Paste a prompt to score it and see how an AI will read it.', big: true },
    thinking: { label: 'Your own thinking notes (optional)', kind: 'text', hint: 'Kept as-is; the tool adds its own analysis beside it.' },
    extra: { label: 'Anything else', kind: 'list', hint: 'Extra lines appended to the prompt.' },
  };

  // ---------------------------------------------------------------- templates
  const T = {
    app: { name: 'Build a tool or app', short: 'Build', profile: true, groups: [
      ['Core', ['title', 'role', 'goal', 'need', 'users', 'stack', 'features', 'data', 'rules', 'examples']],
      ['Engineering', ['storage', 'sync', 'offline', 'design', 'repo', 'privacy']],
      ['Quality', ['unclear', 'verify', 'tests', 'pitfalls', 'acceptance', 'buildorder', 'delivery']],
      ['More', ['extra']]], required: ['title', 'goal'] },
    extend: { name: 'Extend or fix a tool', short: 'Extend', profile: true, groups: [
      ['Core', ['title', 'role', 'existing', 'change', 'preserve', 'stack', 'constraints']],
      ['Quality', ['unclear', 'verify', 'tests', 'pitfalls', 'delivery']], ['More', ['extra']]], required: ['title', 'existing', 'change'] },
    research: { name: 'Research', short: 'Research', groups: [
      ['Core', ['topic', 'role', 'purpose', 'scope', 'sources']], ['Output', ['output', 'columns', 'count', 'unclear', 'verify']], ['More', ['extra']]], required: ['topic'] },
    document: { name: 'Document summary and Q&A', short: 'Document', groups: [
      ['Core', ['docname', 'role', 'focus', 'audience']], ['Output', ['length', 'questions', 'citations']], ['More', ['extra']]], required: ['docname', 'focus'] },
    analysis: { name: 'Data analysis', short: 'Analysis', groups: [
      ['Core', ['dataset', 'role', 'context', 'metrics']], ['Output', ['structure', 'visuals', 'unclear']], ['More', ['extra']]], required: ['dataset'] },
    brainstorm: { name: 'Brainstorming', short: 'Ideas', groups: [
      ['Core', ['topic', 'context', 'constraints']], ['Output', ['count', 'categories', 'output']], ['More', ['extra']]], required: ['topic'] },
    content: { name: 'Content creation', short: 'Content', groups: [
      ['Core', ['piecetype', 'topic', 'audience', 'tone']], ['Output', ['structure', 'length', 'example', 'cta']], ['More', ['extra']]], required: ['piecetype'] },
    review: { name: 'Review an existing prompt', short: 'Review', groups: [['Prompt', ['title', 'prompt', 'thinking']]], required: ['title', 'prompt'] },
  };
  const TYPE_ORDER = ['app', 'extend', 'research', 'document', 'analysis', 'brainstorm', 'content', 'review'];

  // ---------------------------------------------------------------- helpers
  const str = v => (v == null ? '' : String(v));
  const has = v => str(v).trim().length > 0;
  const lines = v => str(v).split(/\r?\n/).map(s => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  const firstSentence = v => { const s = str(v).trim().replace(/\s+/g, ' '); const m = s.match(/^(.{10,220}?[.!?])(\s|$)/); return m ? m[1] : s.slice(0, 220); };
  const slug = s => str(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;

  function fyLabel(d) {
    const y = d.getFullYear(), m = d.getMonth();
    const s = m >= 3 ? y : y - 1;
    return `FY ${s}-${String((s + 1) % 100).padStart(2, '0')}`;
  }
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  }

  // ---------------------------------------------------------------- smart packs
  // Each pack fires on words in your inputs and adds rules the AI would otherwise guess.
  const PACKS = [
    { id: 'money', name: 'Exact money', types: ['app', 'extend', 'analysis'],
      re: /\b(expenses?|budgets?|money|rupees?|inr|salary|invoices?|bank|ledger|finance|financial|payments?|prices?|costs?)\b|₹/i,
      why: 'You mentioned money. Floating-point rupees drift by a paisa over thousands of entries, so the AI is told to hold whole paise.',
      add: { rules: ['Hold money as whole paise (integers). Never add floating-point rupees; every total is exact.', 'Show rupees with lakh grouping (1,23,456.78).'],
        pitfalls: ['Keep bank reference numbers as text everywhere; Excel turns long numbers into 6.27E+11 and the digits cannot be recovered.'],
        tests: ['Totals worked out by hand match the tool to the paisa.'] } },
    { id: 'calendar', name: 'Indian calendar conventions', types: ['app', 'extend', 'analysis'],
      re: /\b(weeks?|weekly|months?|monthly|years?|yearly|fy|financial year|daily|dates?|calendar|cw\d*|quarters?)\b/i,
      why: 'You mentioned periods. Week numbering and the financial year differ by country, and an AI defaults to the US convention unless told.',
      add: { rules: [d => `Financial year runs 1 April to 31 March, labelled ${fyLabel(d)}. Weeks are ISO calendar weeks, Monday to Sunday, labelled CW${isoWeek(d)}. Month, week and financial year are derived from the date, never typed in.`, 'Typed dates are day first (28/10); times are 24-hour on screen.'],
        tests: ['ISO week 53 and the financial-year boundary (31 March to 1 April) land in the right period.'] } },
    { id: 'sync', name: 'Multi-device merge', types: ['app', 'extend'],
      re: /\b(onedrive|google drive|dropbox|several devices|multiple devices|two laptops|other devices|across devices|between devices|sync(ing|ed)? (between|across) (devices|laptops)|laptops? and (an? )?(android )?phone)\b/i,
      why: 'You need several devices to agree. Without exact merge rules an AI writes "last file wins", which silently loses entries.',
      add: { sync: ['Merge per record: the newer update time u wins; on an exact tie the larger canonical JSON text (keys sorted) wins, so every device settles the same way.', 'A deletion becomes a tombstone {d:1, u} so it reaches the other devices.', 'Write about 3 seconds after a change and when the page is hidden; never rely on writing at tab close.', 'Skip a save file that cannot be read yet (sync apps deliver files late) and retry next time; it must not stop sync.', 'Show the sync state at all times: saved, saving, changes waiting, folder access needed, sync problem.'],
        tests: ['Two simulated devices add entries at the same time; both end with both entries, and a deletion on one reaches the other.', 'merge() is commutative, associative and idempotent on randomised data.'],
        pitfalls: ['Compare records by canonical JSON, not raw JSON text, because key order differs.', 'A pull must wait for a write that is still running.'] } },
    { id: 'offline', name: 'Offline web app', types: ['app'],
      re: /\b(offline|installable|installs? as an app|pwa|github pages|static (?:site|page|web)|no server|serverless)\b/i,
      why: 'It must work offline from a static host, which decides caching, install files and storage before any screen is drawn.',
      add: { offline: ['Service worker: network first for the page, cached copy when offline. Register only on http or https.', 'Web manifest with 192 px, 512 px and maskable icons so it installs as an app.', 'A Content-Security-Policy meta tag so the page loads only its own files.'],
        pitfalls: ['Use a unique localStorage key prefix and cache-name prefix, because every project on one github.io account shares a browser origin.'],
        tests: ['Reload, then switch on airplane mode: the data remains and the page still opens.'] } },
    { id: 'mobile', name: 'Phone layout', types: ['app', 'extend'],
      re: /\b(phones?|mobile|android|iphone|tablets?|responsive)\b/i,
      why: 'It runs on a phone. Without numbers, "responsive" passes on a laptop and breaks at 320 px.',
      add: { design: ['On a phone: bottom tab bar, tables become cards, touch targets at least 44 px, and nothing scrolls sideways at 320 px.'],
        tests: ['Phone layout at 320, 360 and 390 px: no sideways scroll, touch targets of 44 px or more.'] } },
    { id: 'excel', name: 'Excel and CSV', types: ['app', 'extend', 'analysis'],
      re: /\b(excel|xlsx|csv|spreadsheets?|imports?|exports?)\b/i,
      why: 'Files leave and come back. A round-trip test is the only proof nothing is lost on the way.',
      add: { rules: ['CSV uses UTF-8 with a byte order mark and quotes fields that need it.', 'Import finds the header row after any preamble lines, matches columns by name with aliases, shows a preview with a status per row, and saves nothing until I press Import.'],
        tests: ['Round trip: export everything, import into an empty copy, and the counts and totals match.'] } },
    { id: 'charts', name: 'Readable charts', types: ['app'],
      re: /\b(charts?|graphs?|visuali[sz]ations?|plots?)\b(?!\s*motif)/i,
      why: 'Charts hide exact numbers. A table toggle keeps every figure checkable.',
      add: { design: ['Every chart has a Chart and Table toggle so the numbers are always readable as text. Colour follows the category, never its rank; one axis; recessive grid.'],
        tests: ['Every dashboard figure is checked against a number computed separately.'] } },
    { id: 'github', name: 'GitHub hygiene', types: ['app', 'extend'],
      re: /\b(github|git repo(sitory)?|github actions|ci\/cd)\b/i,
      why: 'It ships as a repository. A named file list stops the AI from delivering code without docs, tests or CI.',
      add: { repo: ['README (live link, screenshot, features, privacy, getting started), CHANGELOG, CONTRIBUTING, SECURITY, MIT LICENSE, docs/SETUP.md, docs/ARCHITECTURE.md, .gitignore, .editorconfig.', 'GitHub Actions: test on every push and pull request; deploy to Pages from main with read-only default permissions.', 'Pin dependency versions and commit the lock file.'],
        delivery: ['If you cannot push to the repository, hand back a zip with upload steps, and tell me to set Settings, Pages, Source to GitHub Actions.'] } },
    { id: 'privacy', name: 'Personal data', types: ['app', 'extend'],
      re: /\b(personal|private|bank|health|salary|medical|passwords?|diary|journal|expenses?)\b/i,
      why: 'The data is personal. The AI must keep it on the device and out of any public repository.',
      add: { privacy: ['No accounts, analytics or network calls for user data.', 'The .gitignore blocks backup and save files so personal data can never be committed.', 'Tests use made-up descriptions and amounts only.'] } },
    { id: 'python', name: 'Python desktop', types: ['app', 'extend'],
      re: /\b(python|tkinter|pyqt\d?|desktop app|\.exe|windows app)\b/i,
      why: 'Desktop Python breaks on paths, optional packages and frozen windows unless told otherwise.',
      add: { rules: ['Use pathlib or os.path for every path so it runs on Windows, macOS and Linux.', 'Optional dependencies fail gracefully with a usable fallback. Never swallow errors silently; show a readable message.'],
        pitfalls: ['On Windows set the AppUserModelID before creating the window so the taskbar icon is right.', 'Keep long-running work (network, OCR, file scans) off the UI thread so the window never freezes.'] } },
    { id: 'network', name: 'Network calls', types: ['app', 'extend'],
      re: /\b(scrap(?:e|er|ing)|crawl|apis?|fetch(?:es|ing)?|web search|downloads?|rate limit)\b/i,
      why: 'It talks to the network, which fails, slows and rate-limits.',
      add: { pitfalls: ['Wrap every network call with a timeout and retry with backoff; a failed call must not freeze or crash the tool.'] } },
    { id: 'time', name: 'Time tracking', types: ['app', 'extend'],
      re: /\b(time ?track\w*|timers?|pomodoro|timesheets?|log time|time logs?|hours and minutes|minutes logged)\b/i,
      why: 'Time entries overlap and cross midnight; both need a rule or totals double-count.',
      add: { rules: ['An entry that crosses midnight splits into one entry per day.', 'Overlaps are detected before saving; nothing is overwritten silently.'],
        tests: ['A 5-minute break inside a 2-hour task leaves 115 minutes.'] } },
    { id: 'database', name: 'Database safety', types: ['app', 'extend'],
      re: /\b(sqlite|database|postgres|mysql|indexeddb)\b/i,
      why: 'A database outlives the code; the first run and every schema change must be safe.',
      add: { storage: ['Create the database and folders on first run (a zero-state start).', 'Take an automatic backup before any schema change.'] } },
    { id: 'ocr', name: 'OCR and images', types: ['app', 'extend'],
      re: /\b(ocr|scan(?:ned|s)?|receipts?|photos?)\b/i,
      why: 'Heavy OCR engines lack wheels for the newest Python, so the AI needs a fallback.',
      add: { pitfalls: ['Make the OCR engine optional with a lighter fallback, because heavy engines lack wheels for the newest Python.'] } },
    { id: 'links', name: 'Real links only', types: ['research'], always: true,
      why: 'Research answers are only useful if every link and figure can be checked.',
      add: { verify: ['Every link is a real, working URL you opened, never a placeholder.', 'If a detail cannot be verified, mark it Unverified rather than guess.'] } },
    { id: 'verify2', name: 'Verify twice, two methods', types: ['app', 'extend'], always: true, onlyIfEmpty: 'verify',
      why: 'A second pass that repeats the first proves little, so the default asks for two different routes.',
      add: { verify: ['Round 1: unit tests whose expected numbers you worked out by hand, not by calling the code under test.', 'Round 2: drive the real built tool through its actual buttons (a real browser or the real window), and look at screenshots in light and dark.', 'Fix every failure, rerun both rounds, report the counts, and say plainly what you could not test.'] } },
    { id: 'order', name: 'Layered build order', types: ['app'], always: true, onlyIfEmpty: 'buildorder',
      why: 'Building pure logic first means a failure shows up at the lowest layer, where it is cheapest to fix.',
      add: { buildorder: ['Plan the files in one short list.', 'Core logic and calculations, with unit tests passing.', 'Storage (and sync), with tests.', 'Pages and styles.', 'Import and export.', 'Documents and CI files.', 'Second verification round, then commit.'] } },
    { id: 'handover', name: 'Clear handover', types: ['app', 'extend'], always: true, onlyIfEmpty: 'delivery',
      why: 'The last message decides whether you can act without reading code.',
      add: { delivery: ['Final answer: what exists, the verification counts for each round, the choices you made where this prompt was silent, and my next step. Do not paste code in the final answer.'] } },
  ];

  // ---------------------------------------------------------------- assembly
  function userText(inp, type, profile) {
    const t = T[type]; const keys = t.groups.flatMap(g => g[1]);
    return keys.map(k => str(inp[k])).join('\n') + (t.profile && profile ? '\n' + profileLines(profile).join('\n') : '');
  }

  function firedPacks(inp, type, profile, off) {
    const text = userText(inp, type, profile);
    off = off || {};
    return PACKS.filter(p => p.types.includes(type) && (p.always ? (!p.onlyIfEmpty || !has(inp[p.onlyIfEmpty])) : p.re.test(text)))
      .map(p => ({ ...p, off: !!off[p.id], matched: p.always ? null : ((text.match(p.re) || [])[0] || '').trim() }));
  }

  function profileLines(p) {
    if (!p) return [];
    const out = [];
    if (has(p.owner)) out.push(`Owner: ${p.owner}${has(p.location) ? ', ' + p.location : ''}.${has(p.timezone) ? ' Timezone ' + p.timezone + '.' : ''}`);
    if (has(p.github)) out.push(`GitHub account: ${p.github}.`);
    if (has(p.currency)) out.push(`Money: ${p.currency}.`);
    if (has(p.fiscal)) out.push(`Financial year: ${p.fiscal}.`);
    if (has(p.weeks)) out.push(`Weeks: ${p.weeks}.`);
    if (has(p.dates)) out.push(`Dates and times: ${p.dates}.`);
    lines(p.extra).forEach(l => out.push(l));
    return out;
  }

  function workingRules(mode, type, opts) {
    const r = [];
    if (mode === 'ask') r.push('Before you start, ask me up to five focused questions about anything that would change the result, each with your recommended answer. After my reply, work without further questions.');
    else if (mode === 'irreversible') r.push('Make reasonable decisions yourself and list them at the end. Stop and ask only before an action that cannot be undone, such as deleting data or publishing.');
    else r.push('Do not ask me questions. Every decision is made in this prompt. Where something is genuinely unspecified, choose the simplest default, carry on, and list your choices at the end. Stop and ask only before an action that cannot be undone.');
    if (type === 'app' || type === 'extend') {
      r.push('Verify everything twice, by two different methods. Never report a check you did not run, and never say a result is verified from memory.');
      if (opts.chatOnly) r.push('If you cannot run code or write files, send the files one at a time in the build order and wait for me to say continue.');
    }
    r.push('If you are unsure about a fact, say you do not know instead of guessing.');
    return r;
  }

  function render(style, sections) {
    let n = 0;
    const out = [];
    for (const s of sections) {
      const body = [];
      if (s.text) body.push(...str(s.text).trim().split(/\n/));
      if (s.lines && s.lines.length) s.lines.forEach((l, i) => body.push((s.numbered ? `${i + 1}. ` : '- ') + l));
      if (!body.length) continue;
      const label = s.num === false ? s.title : `${++n}. ${s.title}`;
      if (style === 'markdown') out.push(`## ${label}\n\n${body.join('\n')}`);
      else if (style === 'xml') { const tag = slug(s.title).replace(/-/g, '_') || 'section'; out.push(`<${tag}>\n${body.join('\n')}\n</${tag}>`); }
      else { const i = label.indexOf(' ('); out.push(`${i > 0 ? label.slice(0, i).toUpperCase() + label.slice(i) : label.toUpperCase()}\n${body.join('\n')}`); }
    }
    return out.join('\n\n');
  }

  function collect(inp, key, packs, now) {
    const own = lines(inp[key]);
    const added = [];
    for (const p of packs) {
      if (p.off || !p.add[key]) continue;
      for (let l of p.add[key]) { l = typeof l === 'function' ? l(now) : l; if (!own.some(o => o.toLowerCase() === l.toLowerCase())) added.push(l); }
    }
    return own.concat(added);
  }

  function build(input) {
    const type = T[input.type] ? input.type : 'app';
    const inp = input.inputs || {};
    const opts = input.options || {};
    const style = STYLES[opts.style] ? opts.style : 'plain';
    const now = input.now ? new Date(input.now) : new Date();
    const profile = T[type].profile && opts.useProfile !== false ? input.profile : null;
    const L = applyLessons(input.lessons, inp, type, profile, opts.off);
    const packs = firedPacks(inp, type, profile, opts.off).concat(L.packs);
    const live = packs.filter(p => !p.off);
    const warnings = L.warnings;
    const mode = UNCLEAR[inp.unclear] ? inp.unclear : (opts.defaultUnclear || 'decide');
    const S = [];
    let role = has(inp.role) ? inp.role.trim().replace(/\.$/, '') : '';
    if (/^(Senior|Principal|Expert|Experienced|Seasoned|Lead|Staff|Junior|Professional|Technical|Chief|Skilled)\b/.test(role)) role = role[0].toLowerCase() + role.slice(1);
    const article = w => (/^[aeiou]/i.test(w) ? 'an' : 'a');
    const roleLine = role ? (/^(you are|act as)/i.test(role) ? role + '.' : `You are ${/^(a|an|the)\s/i.test(role) ? '' : article(role) + ' '}${role}.`) : '';
    const title = str(inp.title).trim();

    if (type === 'review') {
      const prompt = str(inp.prompt).replace(/\s+$/, '');
      return finish({ type, prompt, sections: [], packs: [], inp, mode, profile, style, now, title, warnings: L.warnings.concat(L.packs.map(p => ({ id: p.lessonId, title: p.lessonTitle, warning: p.add.lessons[0], asStep: true }))) });
    }

    if (type === 'app') {
      S.push({ title: 'Role and working rules', num: false, text: [roleLine, `Build ${title ? '"' + title + '"' : 'the tool below'} end to end, test it, and hand it over finished.`].filter(Boolean).join(' '), lines: workingRules(mode, type, opts) });
      const pl = profileLines(profile);
      if (live.some(p => p.id === 'github') && profile && has(profile.github) && title) {
        const acct = profile.github.trim();
        pl.push(`Repository to create: ${slug(title)}. Live address: https://${acct.toLowerCase()}.github.io/${slug(title)}/`);
      }
      if (pl.length) S.push({ title: 'Profile (change these lines to reuse the prompt)', num: false, lines: pl });
      S.push({ title: 'What to build', text: [str(inp.goal).trim(), has(inp.need) ? 'The real need: ' + str(inp.need).trim() : '', has(inp.users) ? 'Who uses it: ' + str(inp.users).trim() : ''].filter(Boolean).join('\n') });
      S.push({ title: 'Stack', text: inp.stack });
      S.push({ title: 'Pages and features', lines: lines(inp.features) });
      S.push({ title: 'Data model', lines: lines(inp.data) });
      S.push({ title: 'Rules (exact)', lines: collect(inp, 'rules', live, now) });
      S.push({ title: 'Worked examples', lines: lines(inp.examples) });
      S.push({ title: 'Storage', text: inp.storage, lines: collect({}, 'storage', live, now) });
      S.push({ title: 'Sync', text: inp.sync, lines: collect({}, 'sync', live, now) });
      S.push({ title: 'Offline and install', text: inp.offline, lines: collect({}, 'offline', live, now) });
      S.push({ title: 'Design', text: inp.design, lines: collect({}, 'design', live, now) });
      S.push({ title: 'Repository', text: inp.repo, lines: collect({}, 'repo', live, now) });
      S.push({ title: 'Security and privacy', text: inp.privacy, lines: collect({}, 'privacy', live, now) });
      S.push({ title: 'Verify twice, by two methods', lines: collect(inp, 'verify', live, now).concat(collect(inp, 'tests', live, now).map(t => 'Test: ' + t)) });
      S.push({ title: 'Known pitfalls (avoid them)', lines: collect(inp, 'pitfalls', live, now) });
      S.push({ title: 'Acceptance checklist', lines: lines(inp.acceptance).map(l => l.split('|').map(s => s.trim()).filter(Boolean).join(' → ')) });
      S.push({ title: 'Build order', lines: collect(inp, 'buildorder', live, now), numbered: true, text: '' });
      const del = collect(inp, 'delivery', live, now);
      S.push({ title: 'Final answer', lines: del.length > 1 ? del : [], text: del.length === 1 ? del[0] : '' });
      S.push({ title: 'Also', lines: lines(inp.extra) });
    } else if (type === 'extend') {
      S.push({ title: 'Role and working rules', num: false, text: [roleLine, `Extend my existing ${title ? '"' + title + '"' : 'tool'} with the change described below. Make the change directly; do not stop at a plan.`].filter(Boolean).join(' '),
        lines: ['First inspect the complete, current code and project files. Follow the existing architecture and conventions rather than assuming the code matches an earlier version.', 'Make surgical changes. Preserve unrelated behaviour, data, layout and settings; avoid unrelated refactors.', 'Do not modify or delete my real data while testing. Use an isolated temporary copy.'].concat(workingRules(mode, type, opts)) });
      const pl = profileLines(profile);
      if (pl.length) S.push({ title: 'Profile (change these lines to reuse the prompt)', num: false, lines: pl });
      S.push({ title: 'What exists today', text: inp.existing });
      S.push({ title: 'Stack', text: inp.stack });
      S.push({ title: 'The change', text: inp.change });
      S.push({ title: 'Behaviour to preserve', lines: lines(inp.preserve) });
      S.push({ title: 'Constraints', lines: collect(inp, 'constraints', live, now).concat(collect({}, 'rules', live, now)) });
      S.push({ title: 'Verify twice, by two methods', lines: collect(inp, 'verify', live, now).concat(collect(inp, 'tests', live, now).map(t => 'Test: ' + t)) });
      S.push({ title: 'Known pitfalls (avoid them)', lines: collect(inp, 'pitfalls', live, now) });
      const del = collect(inp, 'delivery', live, now);
      S.push({ title: 'Final answer', lines: del.length > 1 ? del : [], text: del.length === 1 ? del[0] : '' });
      S.push({ title: 'Also', lines: lines(inp.extra) });
    } else if (type === 'research') {
      const topic = str(inp.topic).trim();
      S.push({ title: 'Task', num: false, text: [role ? (/^(you are|act as)/i.test(role) ? role + '.' : `Act as ${article(role)} ${role}.`) : '', `Research ${topic || 'the topic below'}${has(inp.count) ? ` and give me the best ${str(inp.count).trim()} results` : ''}.`, has(inp.purpose) ? 'How I will use it: ' + str(inp.purpose).trim() : ''].filter(Boolean).join(' '), lines: workingRules(mode, type, opts) });
      S.push({ title: 'Scope', text: inp.scope });
      S.push({ title: 'Sources', text: inp.sources });
      S.push({ title: 'Output', text: inp.output, lines: lines(inp.columns).length ? ['Columns: ' + lines(inp.columns).join('; ')] : [] });
      S.push({ title: 'Verification', lines: collect(inp, 'verify', live, now) });
      S.push({ title: 'Also', lines: lines(inp.extra) });
    } else if (type === 'document') {
      S.push({ title: 'Task', num: false, text: [`I've attached ${has(inp.docname) ? '"' + str(inp.docname).trim() + '"' : 'a document'}.`, role ? (/^(you are|act as)/i.test(role) ? role + '.' : `Act as ${article(role)} ${role}.`) : '', has(inp.focus) ? `Summarise it, focusing on: ${str(inp.focus).trim()}` : 'Summarise it.', has(inp.length) ? `Length and structure: ${str(inp.length).trim()}.` : ''].filter(Boolean).join(' ') });
      S.push({ title: 'Audience', text: inp.audience });
      S.push({ title: 'Then answer these questions', lines: lines(inp.questions), numbered: true });
      S.push({ title: 'Citations', text: has(inp.citations) ? inp.citations : 'Cite the section or page for every answer.' });
      S.push({ title: 'Working rules', lines: ['Use only the attached document unless I say otherwise; say clearly when the document does not answer a question.', 'If you are unsure about something, say you do not know instead of guessing.'] });
      S.push({ title: 'Also', lines: lines(inp.extra) });
    } else if (type === 'analysis') {
      S.push({ title: 'Task', num: false, text: [`I've attached ${has(inp.dataset) ? '"' + str(inp.dataset).trim() + '"' : 'a dataset'}.`, role ? (/^(you are|act as)/i.test(role) ? role + '.' : `Act as ${article(role)} ${role}.`) : '', 'Analyse it and present the findings in the structure below.', has(inp.context) ? 'Context: ' + str(inp.context).trim() : ''].filter(Boolean).join(' '), lines: workingRules(mode, type, opts) });
      S.push({ title: 'Structure', lines: lines(inp.structure).length ? lines(inp.structure) : ['Executive summary (2-3 sentences)', 'Key metrics', 'Trends, each with a brief explanation', 'Recommendations, each with its rationale'], numbered: true });
      S.push({ title: 'Key metrics', lines: lines(inp.metrics) });
      S.push({ title: 'Rules', lines: collect({}, 'rules', live, now) });
      S.push({ title: 'Visuals', text: has(inp.visuals) ? inp.visuals : 'After the analysis, suggest three visualisations that would communicate these findings.' });
      S.push({ title: 'Assumptions', text: 'State every assumption and interpretation you make, with your reasoning. Run the numbers in code rather than estimating them.' });
      S.push({ title: 'Also', lines: lines(inp.extra) });
    } else if (type === 'brainstorm') {
      const c = has(inp.count) ? str(inp.count).trim() : '10';
      S.push({ title: 'Task', num: false, text: `Help me brainstorm ${str(inp.topic).trim() || 'ideas'}.${has(inp.context) ? ' Context: ' + str(inp.context).trim() : ''}` });
      S.push({ title: 'Constraints', lines: lines(inp.constraints) });
      S.push({ title: 'What I need', numbered: true, lines: [`Suggest ${c} ideas.`, 'For each, explain in one line why it works.'].concat(lines(inp.categories).length ? ['Indicate which ideas are best for: ' + lines(inp.categories).join('; ') + '.'] : []).concat(['Suggest one low-cost option and one premium option.']) });
      S.push({ title: 'Format', text: has(inp.output) ? inp.output : 'A numbered list, then a table comparing the top five.' });
      S.push({ title: 'Also', lines: lines(inp.extra) });
    } else if (type === 'content') {
      S.push({ title: 'Task', num: false, text: `Write ${str(inp.piecetype).trim() || 'a piece'}${has(inp.topic) ? ' about ' + str(inp.topic).trim() : ''}.` });
      S.push({ title: 'Audience', text: inp.audience });
      S.push({ title: 'Tone and style', text: inp.tone });
      S.push({ title: 'Structure', lines: lines(inp.structure), numbered: true });
      S.push({ title: 'Length', text: inp.length });
      S.push({ title: 'Example to follow', text: has(inp.example) ? 'Follow the tone and structure of this example:\n"""\n' + str(inp.example).trim() + '\n"""' : '' });
      S.push({ title: 'Ending', text: inp.cta });
      S.push({ title: 'Also', lines: lines(inp.extra) });
    }
    const lessonLines = collect({}, 'lessons', live, now);
    if (lessonLines.length) {
      let at = S.findIndex(x => x.title === 'Final answer');
      if (at < 0) at = S.findIndex(x => x.title === 'Also');
      if (at < 0) at = S.length;
      S.splice(at, 0, { title: 'Lessons from earlier answers (avoid these)', lines: lessonLines });
    }
    const prompt = render(style, S);
    return finish({ type, prompt, sections: S, packs, inp, mode, profile, style, now, title, warnings });
  }

  // ---------------------------------------------------------------- quality
  const VAGUE = ['better', 'nice', 'good', 'simple', 'easy', 'user-friendly', 'user friendly', 'modern', 'beautiful', 'fast', 'quickly', 'some', 'etc', 'stuff', 'things', 'properly', 'robust', 'clean', 'intuitive', 'seamless', 'optimal', 'appropriate', 'various', 'improve', 'professional-looking', 'awesome', 'best possible'];
  const CHECKS = [
    { id: 'task', name: 'Task stated up front', w: 12, tip: 'Guide tip 1: clearly state your task at the beginning.', field: 'goal',
      fix: 'Start with one sentence that says exactly what to produce.',
      test: (p) => /\b(build|write|create|analy[sz]e|summari[sz]e|research|find|compare|draft|design|extend|fix|search|generate|help me|prepare|review|plan)\b/i.test(p.slice(0, 400)) ? 1 : 0 },
    { id: 'role', name: 'Role assigned', w: 8, tip: 'Guide tip 6: a specific role brings that expert\'s judgement.', field: 'role',
      fix: 'Add a role, e.g. "You are a senior full-stack engineer who also thinks like an accountant."',
      test: (p) => /\b(you are|act as|as an? (senior|expert|principal|seasoned|experienced))\b/i.test(p) ? 1 : 0 },
    { id: 'context', name: 'Context and real need', w: 10, tip: 'Guide tip 5: say how the result will be used and why.', field: 'need',
      fix: 'Say what failure looks like or how you will use the result.',
      test: (p) => { const n = (p.match(/\b(because|so that|real need|goal|purpose|how i will use|context|audience|who uses|the reason)\b/gi) || []).length; return n >= 2 ? 1 : n ? 0.5 : 0; } },
    { id: 'specific', name: 'Specific numbers', w: 10, tip: 'Guide tip 1: details such as counts, sizes and limits remove guesses.', field: 'rules',
      fix: 'Replace adjectives with numbers: sizes, counts, limits, dates.',
      test: (p) => { const n = (p.match(/\d+/g) || []).length; return n >= 8 ? 1 : n >= 3 ? 0.5 : 0; } },
    { id: 'examples', name: 'Examples given', w: 10, tip: 'Guide tip 2: show an example of the output or input you mean.', field: 'examples',
      fix: 'Add one or two worked examples: an input and the expected result.',
      test: (p) => { const n = (p.match(/\b(e\.g\.|for example|example|such as|sample|like this)\b|→|"[^"\n]{2,40}"/gi) || []).length; return n >= 3 ? 1 : n ? 0.5 : 0; } },
    { id: 'structure', name: 'Output structure defined', w: 10, tip: 'Guide: define the output structure (sections, table, file).', field: 'delivery',
      fix: 'Say what comes back: sections, a table with named columns, files, length.',
      test: (p) => { const n = (p.match(/\b(format|table|columns?|sections?|markdown|csv|xlsx|file|json|deliver\w*|final answer|bullet|paragraphs?|headings?)\b/gi) || []).length; return n >= 4 ? 1 : n ? 0.5 : 0; } },
    { id: 'steps', name: 'Step-by-step thinking', w: 8, tip: 'Guide tip 3: break complex tasks into steps.', field: 'buildorder',
      fix: 'List the stages in order, lowest layer first.',
      test: (p) => { const n = (p.match(/\b(step|stage|first|then|order|phase|before|after each)\b/gi) || []).length; return n >= 4 ? 1 : n ? 0.5 : 0; } },
    { id: 'unsure', name: 'Uncertainty handled', w: 8, tip: 'Guide: allow the AI to say it does not know.', field: 'unclear',
      fix: 'Add: "If you are unsure, say you do not know instead of guessing."',
      test: (p) => /\b(unsure|don't know|do not know|not sure|unverified|if something is unclear|genuinely unspecified|ask me)\b/i.test(p) ? 1 : 0 },
    { id: 'verify', name: 'Verification asked for', w: 12, tip: 'Guide: ask for checks and citations; a second method catches what the first misses.', field: 'verify',
      fix: 'Ask for two different checks and an honest report of what was not tested.',
      test: (p) => { const n = (p.match(/\b(verify|verified|test|tests|check|checks|validate|cite|citations?|prove|confirm)\b/gi) || []).length; return n >= 4 ? 1 : n ? 0.5 : 0; } },
    { id: 'limits', name: 'Constraints and must-nots', w: 6, tip: 'Decisions, not wishes: say what is not allowed.', field: 'constraints',
      fix: 'Add what must never happen (no CDN, never overwrite, no personal data…).',
      test: (p) => { const n = (p.match(/\b(do not|don't|never|must|only|avoid|no)\b/gi) || []).length; return n >= 5 ? 1 : n >= 2 ? 0.5 : 0; } },
    { id: 'done', name: 'Definition of done', w: 6, tip: 'Acceptance checks let you judge the answer without trusting it.', field: 'acceptance',
      fix: 'Add an acceptance checklist: check, how, what a pass looks like.',
      test: (p) => /\b(acceptance|done when|pass(es)? (looks|when)|success criteria|checklist|final answer)\b/i.test(p) ? 1 : 0 },
  ];

  function vagueIn(text) {
    const found = [];
    const low = ' ' + str(text).toLowerCase() + ' ';
    for (const w of VAGUE) {
      const re = new RegExp('(^|[^a-z-])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (w === 'clean' ? '(?! ?up)' : '') + '(?=[^a-z-]|$)', 'g');
      const n = (low.match(re) || []).length;
      if (n) found.push({ word: w, n });
    }
    return found;
  }

  function score(prompt, ownText) {
    const rows = CHECKS.map(c => { const v = c.test(prompt); return { id: c.id, name: c.name, w: c.w, v, status: v >= 1 ? 'pass' : v > 0 ? 'partial' : 'missing', tip: c.tip, fix: c.fix, field: c.field }; });
    let total = rows.reduce((s, r) => s + r.w * r.v, 0);
    const vague = vagueIn(ownText == null ? prompt : ownText);
    const penalty = Math.min(10, vague.reduce((s, v) => s + v.n * 2, 0));
    total = Math.max(0, Math.round(total - penalty));
    const words = (prompt.match(/\S+/g) || []).length;
    const grade = total >= 85 ? 'Ready' : total >= 65 ? 'Good, a few gaps' : total >= 40 ? 'Needs detail' : 'Too vague';
    return { total, grade, rows, vague, penalty, words };
  }

  // ---------------------------------------------------------------- thinking
  function piles(type, inp, packs) {
    const t = T[type]; const keys = t.groups.flatMap(g => g[1]).filter(k => k !== 'extra');
    const decided = keys.filter(k => k !== 'unclear' && has(inp[k])).map(k => F[k].label);
    const defaulted = packs.filter(p => !p.off).map(p => p.name);
    const important = { app: ['need', 'users', 'stack', 'features', 'rules', 'examples', 'acceptance'], extend: ['preserve', 'tests'], research: ['purpose', 'scope', 'output', 'count'], document: ['questions', 'audience'], analysis: ['context', 'metrics'], brainstorm: ['constraints', 'count'], content: ['audience', 'tone', 'length'], review: [] }[type] || [];
    const open = important.filter(k => !has(inp[k])).map(k => F[k].label);
    return { decided, defaulted, open };
  }

  const ARCS = {
    research: ['Intent deconstruction', 'Retrieval and validation', 'Synthesis', 'Formatting', 'Self-check'],
  };

  function thinkingFor(ctx) {
    const { type, inp, packs, mode, profile, prompt } = ctx;
    const live = packs.filter(p => !p.off);
    const P = piles(type, inp, packs);
    const steps = [];
    const modeText = { decide: 'it will not ask you anything; it picks the simplest default and lists its choices at the end', ask: 'it will first ask up to five questions, each with a recommendation, then work without interrupting', irreversible: 'it decides small things itself and stops only before something that cannot be undone' }[mode];
    const add = (t, b) => steps.push({ t, b });
    const n = arr => arr.length;
    const sc = score(prompt, userTextOnly(type, inp));

    if (type === 'app' || type === 'extend') {
      if (type === 'app') {
        add('Read for the need behind the words', !has(inp.goal) ? 'Nothing is described yet. Fill "What to build" first; every later step depends on it.' : has(inp.need)
          ? `The AI takes "${firstSentence(inp.goal) || 'the request'}" and judges every later choice against your real need: "${firstSentence(inp.need)}"`
          : `Only the goal is given ("${firstSentence(inp.goal) || 'nothing yet'}"), so the AI has to infer what failure looks like. Fill "The real need" to steer the design.`);
      } else {
        add('Inspect before touching anything', `The AI reads the existing ${str(inp.title).trim() || 'tool'} first${has(inp.existing) ? ' (' + firstSentence(inp.existing) + ')' : ''} and follows its conventions rather than an earlier version it imagines.`);
      }
      add('Sort the unknowns into three piles', `Decided by you: ${n(P.decided)} field${n(P.decided) === 1 ? '' : 's'}. Defaulted by this tool: ${n(P.defaulted) ? P.defaulted.join(', ') : 'nothing'}. Still open: ${n(P.open) ? P.open.join(', ') : 'nothing important'}. For anything still open, ${modeText}.`);
      const shape = [];
      if (has(inp.users)) shape.push('who uses it (' + firstSentence(inp.users).replace(/[.!?]$/, '') + ')');
      if (has(inp.stack)) shape.push('the stack (' + firstSentence(inp.stack).replace(/[.!?]$/, '') + ')');
      if (live.some(p => p.id === 'offline')) shape.push('offline from a static host');
      if (live.some(p => p.id === 'sync')) shape.push('several devices that must agree');
      if (live.some(p => p.id === 'mobile')) shape.push('a phone screen');
      add('Let the constraints pick the shape', shape.length ? `The architecture follows from ${shape.join('; ')}. The AI picks storage, layout and file structure to fit these before writing any screen.` : 'No devices, users or stack are named, so the AI will choose an architecture freely. Name them to stop it guessing.');
      const rl = lines(inp.rules).length + live.reduce((s, p) => s + (p.add.rules ? p.add.rules.length : 0), 0);
      if (type === 'app') add('Make correctness provable before making it pretty', rl ? `${plural(rl, 'rule')} ${rl === 1 ? 'is' : 'are'} written as exact statements${lines(inp.examples).length ? ' and ' + plural(lines(inp.examples).length, 'worked example') + (lines(inp.examples).length === 1 ? ' gives an expected answer' : ' give expected answers') : ''}. Each becomes a test with an answer worked out by hand, so the code never marks its own homework.` : 'No exact rules are stated, so the AI invents its own formulas. Write the important ones under "Exact rules and formulas".');
      else add('Map what must not change', lines(inp.preserve).length ? `${plural(lines(inp.preserve).length, 'behaviour')} to preserve ${lines(inp.preserve).length === 1 ? 'is' : 'are'} listed; the AI treats each as a regression test.` : 'Nothing is listed to preserve, so the AI relies on "avoid unrelated refactors". List the behaviours you depend on.');
      const bo = collect(inp, 'buildorder', live, ctx.now);
      add(type === 'app' ? 'Build in layers' : 'Make the change surgically', type === 'app' ? (bo.length ? `It works in ${bo.length} stages, starting with "${bo[0]}", so a failure shows up at the lowest layer, where it is cheapest to fix.` : 'No order is given; the AI chooses one.') : `The change ("${firstSentence(inp.change) || 'not stated'}") is made in the active code with minimal edits.`);
      const vf = collect(inp, 'verify', live, ctx.now);
      add('Verify a second time by a different route', vf.length ? `${plural(vf.length, 'verification line')} and ${plural(collect(inp, 'tests', live, ctx.now).length, 'must-pass test')}. A second pass that repeats the first proves little, so the two rounds use different methods.` : 'No verification is asked for; the AI may report success without running anything.');
      const gaps = [];
      const all = userTextOnly(type, inp) + ' ' + (profile ? profileLines(profile).join(' ') : '');
      if (/\b(phone|android|iphone|mobile)\b/i.test(all)) gaps.push('a real phone');
      if (/\b(onedrive|google drive|dropbox|sync)\b/i.test(all)) gaps.push('your real sync folder');
      if (/\b(install|pwa)\b/i.test(all)) gaps.push('installing the app');
      if (/\b(github|push|repo)\b/i.test(all)) gaps.push('pushing to your GitHub account');
      if (/\b(windows|\.exe|taskbar)\b/i.test(all)) gaps.push('a real Windows desktop');
      add('Say exactly what was not proven', gaps.length ? `A sandbox cannot reach ${gaps.join(', ')}. The prompt asks the AI to name these gaps and give you a short test, rather than claim a result it never saw.` : 'The AI must separate what it tested, what it tested only with stand-ins, and what it could not test.');
      const dl = collect(inp, 'delivery', live, ctx.now);
      const fa = dl.find(l => /^final answer/i.test(l)) || dl[0];
      add('Hand over something that works without it', dl.length ? `The final message is fixed in advance. ${firstSentence(fa)}` : 'No handover is described; the AI decides what to send back.');
    } else if (type === 'research') {
      add('Intent deconstruction', `Goal: curated, checkable material on ${str(inp.topic).trim() || 'the topic'}.${has(inp.purpose) ? ' Purpose: ' + firstSentence(inp.purpose) : ''} Constraints it notes: ${[has(inp.count) ? inp.count + ' results' : '', has(inp.scope) ? 'the scope you set' : '', lines(inp.columns).length ? lines(inp.columns).length + ' fixed columns' : ''].filter(Boolean).join(', ') || 'none stated, so it will choose its own scope'}.`);
      add('Retrieval and validation', `It searches ${has(inp.sources) ? 'the sources you prefer (' + firstSentence(inp.sources).replace(/[.!?]$/, '') + ')' : 'widely, since no sources are named'}, opens each page, and checks that links are alive and match their titles, so nothing is hallucinated.`);
      add('Synthesis', 'Instead of copying descriptions, it condenses what each source actually teaches into a short, high-density summary.');
      add('Formatting', has(inp.output) ? `It lays the result out as you asked: ${firstSentence(inp.output)}` : 'No format is given, so it picks one. Name a table and its columns to make results comparable.');
      add('Self-check', 'Before answering, it removes placeholders and marks anything it could not verify, as the prompt instructs.');
    } else if (type === 'document') {
      add('Locate and frame', `It treats "${str(inp.docname).trim() || 'the attachment'}" as the only source and reads with your focus in mind: ${firstSentence(inp.focus) || 'none stated'}.`);
      add('Read for the asked aspects', 'It skims structure first (headings, tables, annexes), then reads closely only where your focus and questions point.');
      add('Answer each question with a citation', lines(inp.questions).length ? `${plural(lines(inp.questions).length, 'numbered question')}, each answered separately with a section or page reference.` : 'No questions are listed, so it writes a general summary.');
      add('Fit the length', has(inp.length) ? `It keeps to "${str(inp.length).trim()}".` : 'No length is set; summaries tend to run long without one.');
      add('Flag what the document does not say', 'Where the document is silent, it says so instead of filling in from general knowledge.');
    } else if (type === 'analysis') {
      add('Understand the decision', has(inp.context) ? `It reads the data in light of: ${firstSentence(inp.context)}` : 'No context is given, so it cannot tell which findings matter most.');
      add('Inspect the data first', `It checks ${str(inp.dataset).trim() || 'the file'} for blank rows, duplicates, units and date formats before computing anything.`);
      add('Compute in code', lines(inp.metrics).length ? `It computes ${lines(inp.metrics).join(', ')} with code rather than estimating in prose.` : 'With no metrics named, it picks the obvious totals and trends.');
      add('Structure the findings', 'It follows the section order in the prompt, summary first.');
      add('Recommend and state assumptions', 'Each recommendation carries its rationale, and every assumption is written down so you can challenge it.');
    } else if (type === 'brainstorm') {
      add('Frame the constraints', lines(inp.constraints).length ? `It keeps ${plural(lines(inp.constraints).length, 'constraint')} in view so ideas stay usable.` : 'With no constraints, ideas will be broad and generic.');
      add('Diverge', `It generates ${str(inp.count).trim() || '10'} ideas, deliberately varied in cost and effort.`);
      add('Explain each', 'One line per idea on why it works, so you can judge without guessing.');
      add('Categorise', lines(inp.categories).length ? `It tags ideas by ${lines(inp.categories).join(', ')}.` : 'No categories are set; it may group ideas its own way.');
      add('Converge', 'It finishes with a low-cost and a premium option and a compact comparison.');
    } else if (type === 'content') {
      add('Model the reader', has(inp.audience) ? `It writes for ${firstSentence(inp.audience).replace(/\.$/, '')}.` : 'No audience is named, so it writes for a general reader.');
      add('Set the voice', has(inp.tone) ? `Tone: ${inp.tone}.` : 'No tone given; it defaults to neutral.');
      add('Imitate the example', has(inp.example) ? 'It mirrors the structure and rhythm of your example without copying its content.' : 'No example to imitate; adding one is the fastest way to get your style.');
      add('Draft to structure and length', lines(inp.structure).length ? `It follows ${plural(lines(inp.structure).length, 'section')} in order${has(inp.length) ? ', within ' + inp.length : ''}.` : 'No structure is given; it chooses one.');
      add('Close deliberately', has(inp.cta) ? `It ends with: ${inp.cta}.` : 'No ending is specified.');
    } else if (type === 'review') {
      const p = str(inp.prompt);
      const first = firstSentence(p);
      const musts = (p.match(/\b(must|never|do not|don't|always|only)\b/gi) || []).length;
      add('What the AI reads first', first ? `"${first}" This sets the frame for everything after it.` : 'The prompt is empty.');
      add('The role it takes', /\b(you are|act as)\b/i.test(p) ? `It adopts the role: "${(p.match(/(?:you are|act as)[^.\n]{0,120}/i) || [''])[0].trim()}".` : 'No role is given, so it answers as a generalist.');
      add('Rules it will obey', `${plural(musts, 'hard constraint')} (must, never, only…). ${musts >= 5 ? 'These narrow its choices well.' : 'Few hard rules means more guessing.'}`);
      const miss = sc.rows.filter(r => r.status !== 'pass').map(r => r.name.toLowerCase());
      add('Where it will have to guess', miss.length ? `It has to assume: ${miss.join(', ')}.` : 'Nothing major; the prompt answers the usual questions.');
      add('How it will check and hand back', sc.rows.find(r => r.id === 'verify').status === 'pass' ? 'It is told to verify, so it will run or cite checks before answering.' : 'It is not asked to verify, so expect an unchecked answer.');
    }

    const eight = (type === 'app' || type === 'extend') ? [
      ['What result would make you say it is done?', lines(inp.acceptance).length ? plural(lines(inp.acceptance).length, 'acceptance check') + ' answer this.' : 'Not stated. Add an acceptance checklist.'],
      ['Where will it be used, on which device, and who else reads it?', has(inp.users) ? firstSentence(inp.users) : 'Not stated.'],
      ['What is expensive or impossible to undo?', mode === 'decide' || mode === 'irreversible' ? 'The prompt tells it to stop before irreversible actions.' : 'It asks first anyway.'],
      ['What is known, what must be checked, and what only you can decide?', `${n(P.decided)} decided, ${n(P.defaulted)} defaulted, ${n(P.open)} open.`],
      ['What could be silently wrong, and how would it notice?', collect(inp, 'tests', live, ctx.now).length ? plural(collect(inp, 'tests', live, ctx.now).length, 'must-pass test') + ' catch it.' : 'Nothing is set to catch it.'],
      ['What is the smallest test of the riskiest assumption?', (collect(inp, 'tests', live, ctx.now)[0]) || 'Not stated.'],
      ['What would a demanding expert attack first?', (collect(inp, 'pitfalls', live, ctx.now)[0]) || 'No pitfalls listed.'],
      ['What is your next step, and can it be a single step?', (collect(inp, 'delivery', live, ctx.now).find(l => /^final answer/i.test(l)) || collect(inp, 'delivery', live, ctx.now)[0]) || 'Not stated.'],
    ] : [];

    const map = [];
    for (const s of ctx.sections) {
      if (!(has(s.text) || (s.lines && s.lines.length))) continue;
      const tl = s.title.toLowerCase();
      const why = /role/.test(tl) ? 'Role-play plus working rules: who the AI is and how it handles doubt (guide tips 6 and "acknowledge uncertainty").'
        : /profile/.test(tl) ? 'Context in one swappable block, so the same prompt can be reused for someone else.'
        : /what to build|task|what exists|the change/.test(tl) ? 'The task stated at the beginning (guide tip 1).'
        : /example/.test(tl) ? 'Examples show the exact behaviour you expect (guide tip 2).'
        : /rule|constraint|assumption/.test(tl) ? 'Decisions, not wishes: each line removes a question the AI would otherwise ask or guess.'
        : /verif|citation|test/.test(tl) ? 'Ask for checks and citations to minimise hallucination.'
        : /lessons from earlier/.test(tl) ? 'Mistakes from earlier AI answers, recorded through your feedback, so they are not repeated.'
        : /pitfall/.test(tl) ? 'Known mistakes listed up front save a debugging round.'
        : /order|structure|what i need/.test(tl) ? 'Breaking the task into ordered steps (guide tip 3).'
        : /final|deliver|output|format|length|ending/.test(tl) ? 'A defined output structure (guide: define output structure).'
        : /pages and features/.test(tl) ? 'Every page named, so nothing is skipped or invented.'
        : /storage|sync|offline|data model|stack/.test(tl) ? 'Engineering decisions made up front, so the AI cannot pick an architecture that fails later.'
        : /design/.test(tl) ? 'Design stated with numbers, so "looks good" becomes something it can check.'
        : /repository|privacy|security/.test(tl) ? 'What ships and what must never ship, decided before code exists.'
        : /audience|tone/.test(tl) ? 'Audience and tone (guide: content creation tips 1 and 2).'
        : /acceptance/.test(tl) ? 'A definition of done you can check without trusting the AI.'
        : 'Specific detail that narrows the answer.';
      map.push([s.title, why]);
    }

    return { steps, piles: P, eight, map, additions: packs.map(p => ({ id: p.id, name: p.name, why: p.why, matched: p.matched, off: p.off })) };
  }

  function userTextOnly(type, inp) {
    const t = T[type]; return t.groups.flatMap(g => g[1]).filter(k => k !== 'unclear').map(k => str(inp[k])).join('\n');
  }

  function thinkingText(th, title, ownThinking) {
    const out = [];
    if (has(ownThinking)) { out.push(str(ownThinking).trim(), '', '---', 'TOOL ANALYSIS', ''); }
    out.push(`How an AI will think through${title ? ' "' + title + '"' : ' this prompt'}`, '');
    th.steps.forEach((s, i) => out.push(`${i + 1}. ${s.t}`, `   ${s.b}`, ''));
    if (th.additions.filter(a => !a.off).length) {
      out.push('Added by Prompt Builder');
      th.additions.filter(a => !a.off).forEach(a => out.push(`- ${a.name}${a.matched ? ' (you wrote "' + a.matched + '")' : ''}: ${a.why}`));
      out.push('');
    }
    if (th.eight.length) {
      out.push('Eight questions the AI asks itself');
      th.eight.forEach(([q, a], i) => out.push(`${i + 1}. ${q} ${a}`));
      out.push('');
    }
    if (th.map.length) {
      out.push('Why each section is there');
      th.map.forEach(([s, w]) => out.push(`- ${s}: ${w}`));
    }
    return out.join('\n').trim() + '\n';
  }

  function finish(ctx) {
    const own = userTextOnly(ctx.type, ctx.inp);
    const sc = score(ctx.prompt, ctx.type === 'review' ? ctx.prompt : own);
    const th = thinkingFor(ctx);
    const missingRequired = T[ctx.type].required.filter(k => !has(ctx.inp[k])).map(k => F[k].label);
    if (missingRequired.length) { sc.total = Math.min(sc.total, 30); sc.grade = 'Incomplete'; sc.capped = true; }
    return { type: ctx.type, prompt: ctx.prompt, score: sc, thinking: th, thinkingText: thinkingText(th, ctx.title, ctx.type === 'review' ? ctx.inp.thinking : ''), missingRequired, packs: ctx.packs, warnings: ctx.warnings || [] };
  }

  // ---------------------------------------------------------------- lessons from feedback
  function lessonApplies(l, inp, type, profile) {
    if (!l || l.d || l.active === false) return false;
    if (l.scope === 'type' && !(l.types || []).includes(type)) return false;
    if (l.scope === 'keywords') {
      const kws = (l.keywords || []).map(k => String(k).trim().toLowerCase()).filter(Boolean);
      if (!kws.length) return false;
      const text = userText(inp, type, profile).toLowerCase();
      if (!kws.some(k => text.includes(k))) return false;
    }
    return true;
  }
  function applyLessons(lessons, inp, type, profile, off) {
    const packs = [], warnings = [];
    for (const l of (lessons || [])) {
      if (!lessonApplies(l, inp, type, profile)) continue;
      const seen = l.seen > 1 ? ` (reported ${l.seen} times)` : '';
      if (l.mode === 'step' && has(l.line)) {
        packs.push({ id: 'L_' + l.id, lessonId: l.id, lessonTitle: l.title, name: 'Lesson: ' + l.title, types: [type], always: true, lesson: true,
          why: `From your feedback${seen}: ${has(l.issue) ? '"' + firstSentence(l.issue).replace(/^"|"$/g, '') + '"' : l.title}.`, add: { lessons: [l.line.trim()] }, off: !!(off || {})['L_' + l.id], matched: null });
      } else if (has(l.warning) || has(l.line)) {
        warnings.push({ id: l.id, title: l.title, warning: has(l.warning) ? l.warning : l.line, line: l.line, seen: l.seen || 1 });
      }
    }
    return { packs, warnings };
  }

  // Each pattern reads your description of what went wrong (issue) and the AI's answer (response).
  const ISSUES = [
    { id: 'questions', name: 'Asked questions instead of working',
      issue: /\b(asked (me )?(too many |a lot of |lots of )?questions|kept asking|clarifying questions|asked for clarification|wouldn't start|did not start)\b/i,
      resp: r => { const q = r.split(/\n/).map(x => x.trim()).filter(Boolean).slice(0, 20).filter(x => /\?\s*$/.test(x)).length; return q >= 3 ? `${q} questions near the start of the answer` : ''; },
      line: 'Do not reply with questions. Make each decision yourself, do the work, and list your assumptions at the end.',
      warn: 'An earlier answer asked questions instead of working. Say whether the AI may ask, and decide the open points in the prompt.' },
    { id: 'incomplete', name: 'Incomplete or placeholder output',
      issue: /\b(incomplete|truncated|cut off|stopped (half ?way|midway|early)|partial (code|answer)|placeholders?|todo|left out|omitted|rest of the code|not complete|unfinished)\b/i,
      resp: r => { const m = r.match(/(\/\/|#)\s*\.\.\.|\.\.\.\s*(rest|remaining|existing)|\bTODO\b|rest of (the )?(code|file)|remains? (the same|unchanged)|\[insert[^\]]*\]|lorem ipsum/i); if (m) return `"${m[0]}" in the answer`; return (r.match(/```/g) || []).length % 2 ? 'the answer ends inside a code block' : ''; },
      line: 'Deliver complete files and complete answers. Never use placeholders such as "...", TODO or "rest unchanged". If the output is too long, split it into numbered parts and stop at a clean boundary, saying which part comes next.',
      warn: 'An earlier answer came back incomplete or with placeholders. Ask for complete files, split into parts if long.' },
    { id: 'links', name: 'Broken or invented links and facts',
      issue: /\blinks? (were|was|are|is) (broken|dead|fake|wrong|invalid)\b|\b(broken links?|fake links?|dead links?|404|hallucinat\w*|made[- ]up|invented|doesn't exist|does not exist|wrong (link|url|source|reference)s?|not real)\b/i,
      resp: r => { const m = r.match(/https?:\/\/(www\.)?(example\.(com|org)|[^\s]*placeholder[^\s]*)|youtube\.com\/watch\?v=(x{3,}|X{3,}|abc\w{0,6}|12345\w*)\b|\[(link|url)\]/i); return m ? `"${m[0]}" looks like a placeholder link` : ''; },
      line: 'Open every link and check that it works and matches its title before you include it. Never invent a source, figure or reference; mark anything you could not check as Unverified.',
      warn: 'An earlier answer had broken or invented links or facts. Require opened, working links and an Unverified mark.' },
    { id: 'untested', name: 'Claimed it works without testing',
      issue: /\b(not tested|didn'?t test|did not test|untested|claimed (it )?work|said it works?|doesn'?t (work|run|compile)|does not (work|run|compile)|crash(es|ed)?|error(s)? (on|when|at)|throws?|traceback|bug(s|gy)?|failed to (run|start|compile))\b/i,
      resp: r => /\b(this (should|will) work|should work now|works now|fully (working|tested)|all tests pass(ed)?)\b/i.test(r) && !/```[\s\S]*?(passed|failed|ok \d|✓)/i.test(r) ? 'claims it works but shows no test output' : '',
      line: 'Run the code and the tests before you say it works, and show the actual output. List anything you could not run.',
      warn: 'An earlier answer claimed success without running anything. Ask for real test output.' },
    { id: 'format', name: 'Ignored the requested format',
      issue: /\b(wrong|missing|ignored|didn'?t follow|did not follow|not in|messy|broken) (the )?(format|table|columns?|structure|layout|csv|markdown|order|template|headings?)\b|\b(format|table|columns?) (was |were )?(wrong|missing|ignored)\b/i,
      line: 'Follow the output format in this prompt exactly: the same sections, columns and order. Check the answer against it before sending.',
      warn: 'An earlier answer ignored the requested format. Spell out the exact columns or sections and ask for a check.' },
    { id: 'long', name: 'Too long or wordy',
      issue: /\b(too long|too verbose|verbose|wordy|lengthy|rambl\w*|too much text|filler|preamble)\b/i,
      resp: r => /\bas an ai( language model)?\b|\bi hope this helps\b|\bcertainly! here\b/i.test(r) ? 'filler phrases in the answer' : '',
      line: 'Start with the result. No preamble, disclaimers or recap; keep each section as short as it can be while complete.',
      warn: 'An earlier answer was too long. Set a length limit and ask for no preamble.' },
    { id: 'shallow', name: 'Too generic or shallow',
      issue: /\b(too (short|generic|vague|shallow|basic)|generic|superficial|not (detailed|specific|deep) enough|lacks? (detail|depth|specifics)|surface[- ]level)\b/i,
      line: 'Be specific: give numbers, names, units and one concrete example for every point. Skip anything you cannot make specific.',
      warn: 'An earlier answer was generic. Add numbers, examples and the depth you expect.' },
    { id: 'outdated', name: 'Outdated versions or information',
      issue: /\b(outdated|out of date|old version|deprecated|obsolete|stale|no longer (works|exists|supported))\b/i,
      line: 'Check current documentation and versions before using any library, API or rule; state the version or date you relied on.',
      warn: 'An earlier answer used outdated information. Ask the AI to check current versions and state them.' },
    { id: 'india', name: 'Wrong local conventions',
      issue: /\b(mm\/dd|dollars?|usd|\$|wrong (currency|date format|financial year|week number)|us (date|format)|calendar year instead)\b/i,
      line: 'Use Indian conventions: rupees with lakh grouping (1,23,456.78), dates day first (dd/mm/yyyy), financial year April to March, ISO week numbers.',
      warn: 'An earlier answer used the wrong local conventions. Put currency, date and financial-year rules in the profile.' },
    { id: 'deps', name: 'Unwanted dependencies',
      issue: /\b(unwanted|extra|too many|heavy|new) (librar(y|ies)|dependenc(y|ies)|packages?)\b|\b(cdn|pip install|npm install) (failed|not allowed|blocked)\b|\bfailed to install\b/i,
      line: 'Add no new dependency unless this prompt names it; prefer the standard library, and explain any dependency you think is unavoidable before using it.',
      warn: 'An earlier answer added unwanted dependencies. List the allowed libraries.' },
    { id: 'regression', name: 'Broke or removed something that worked',
      issue: /\b(broke|broken (the )?(existing|old)|regression|removed (a |the |my )?(feature|button|function)|lost (my )?(data|feature|work)|overwr(ote|itten)|deleted my|stopped working)\b/i,
      line: 'Before changing anything, list the existing behaviours that must keep working and re-check every one after the change. Never delete or overwrite my data.',
      warn: 'An earlier change broke something that worked. List behaviours to preserve and ask for a regression check.' },
    { id: 'rewrite', name: 'Rewrote instead of a small change',
      issue: /\b(rewrote|rewritten|re-?wrote|changed everything|whole file|refactor(ed)? (everything|the whole)|unrelated changes)\b/i,
      line: 'Make surgical edits only. Do not rewrite or reformat working files, and do not make unrelated changes.',
      warn: 'An earlier answer rewrote too much. Ask for surgical edits only.' },
    { id: 'ui', name: 'Layout or theme problems',
      issue: /\b(overlap\w*|layout|misaligned|clipped|cut off on (phone|mobile)|sideways scroll|horizontal scroll|dark mode|light mode|contrast|unreadable|ugly|cramped)\b/i,
      line: 'Before finishing, look at screenshots at 320 px, 390 px and desktop width in light and dark themes, and fix overlaps, clipping, sideways scroll and low contrast.',
      warn: 'An earlier answer had layout or theme problems. Ask for screenshots at phone and desktop widths in both themes.' },
    { id: 'slow', name: 'Slow or freezing',
      issue: /\b(slow|freez(es|ing)|froze|hangs?|hanging|not responding|lag(gy|s)?|stuck)\b/i,
      line: 'Keep long-running work off the UI thread, show progress, and measure the slow step before and after your fix.',
      warn: 'An earlier answer produced a slow or freezing tool. Ask for background work and a measurement.' },
    { id: 'encoding', name: 'Garbled text or encoding',
      issue: /\b(encoding|unicode|garbled|mojibake|utf-?8|tamil (text )?(broken|garbled)|question marks instead)\b/i,
      line: 'Read and write every file as UTF-8, keep non-Latin text intact, and test with a Tamil sample.',
      warn: 'An earlier answer garbled non-English text. Require UTF-8 and a Tamil test.' },
    { id: 'refused', name: 'Said it could not do something',
      issue: /\b(refused|said it (can'?t|cannot|could not)|unable to|won'?t do|declined)\b/i,
      resp: r => { const m = r.match(/\bI (can't|cannot|am unable to|don't have (access|the ability))[^.\n]{0,80}/i); return m ? `"${m[0]}"` : ''; },
      line: 'If a step is impossible here, name that step and why, do everything else, and give me the closest workable route for the missing step.',
      warn: 'An earlier answer stopped at a limitation. Ask it to name the blocked step and finish the rest.' },
    { id: 'ignored', name: 'Ignored part of the prompt',
      issue: /\b(ignored|didn'?t follow|did not follow|forgot|skipped|missed (some|a|the) (instruction|section|requirement|step)|not what i asked)\b/i,
      line: 'Before you finish, go through every numbered section of this prompt and confirm each one is done, in a short checklist at the end.',
      warn: 'An earlier answer skipped parts of the prompt. Ask for a closing checklist against every section.' },
  ];

  function diagnose(fb) {
    const issue = str(fb.issues), resp = str(fb.response);
    const out = [];
    for (const p of ISSUES) {
      const byIssue = has(issue) && p.issue.test(issue);
      const ev = resp && p.resp ? p.resp(resp) : '';
      if (byIssue || ev) out.push({ pattern: p.id, title: p.name, line: p.line, warning: p.warn, evidence: [byIssue ? 'your description' : '', ev].filter(Boolean).join('; ') });
    }
    if (!out.length && has(issue)) {
      const s = firstSentence(issue).replace(/[.!?]$/, '');
      out.push({ pattern: 'custom', title: s.length > 60 ? s.slice(0, 57) + '…' : s, line: `Avoid this problem from an earlier answer: ${s}.`, warning: `An earlier answer had this problem: ${s}.`, evidence: 'your description' });
    }
    return out;
  }

  function addedLines(packs, now) {
    const set = new Set();
    for (const p of packs) if (!p.off) for (const arr of Object.values(p.add)) for (const l of arr) set.add(typeof l === 'function' ? l(now || new Date()) : l);
    return set;
  }

  return { diagnose, ISSUES, applyLessons, lessonApplies, addedLines, F, T, TYPE_ORDER, PACKS, CHECKS, UNCLEAR, STYLES, build, score, vagueIn, lines, profileLines, fyLabel, isoWeek, slug, firedPacks };
})();
if (typeof module !== 'undefined') module.exports = Engine;
