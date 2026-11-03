/* Storage on this device (IndexedDB, memory fallback) and OneDrive-folder sync.
   Exposes `Store` and `Sync`. Depends on Model, Files. */
'use strict';
const Prefs = (() => {
  const P = 'prompt-builder.';
  return {
    get(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* preference only */ } },
    del(k) { try { localStorage.removeItem(P + k); } catch { /* ignore */ } },
  };
})();

const Store = (() => {
  let db = null, mode = 'idb', data = Model.empty();
  const listeners = new Set();
  let saveErr = null;

  function openDB() {
    return new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB unavailable'));
      const r = indexedDB.open('prompt-builder', 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); if (!d.objectStoreNames.contains('handles')) d.createObjectStore('handles'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('IndexedDB failed to open'));
      r.onblocked = () => rej(new Error('IndexedDB is blocked by another tab'));
    });
  }
  function tx(store, fn, rw) {
    return new Promise((res, rej) => {
      const t = db.transaction(store, rw ? 'readwrite' : 'readonly');
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
    });
  }

  async function init() {
    try {
      db = await openDB();
      const raw = await tx('kv', s => s.get('data'));
      data = Model.sanitize(raw);
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* optional */ }
    } catch (e) {
      mode = 'memory';
      data = Model.empty();
    }
    Model.seedU(data);
    return data;
  }

  async function persist() {
    if (mode !== 'idb') return;
    try { await tx('kv', s => s.put(data, 'data'), true); saveErr = null; }
    catch (e) { saveErr = e; emit('save-error', e); }
  }

  function emit(kind, info) { listeners.forEach(fn => { try { fn(kind, info); } catch (e) { console.error(e); } }); }

  // change(coll, rec) — rec gets a fresh u
  function put(coll, rec, opts) {
    const r = { ...rec, u: Model.nextU() };
    data[coll][r.id] = r;
    if (!(opts && opts.batch)) commit();
    return r;
  }
  function remove(coll, id, opts) { data[coll][id] = { id, d: 1, u: Model.nextU() }; if (!(opts && opts.batch)) commit(); }
  function commit(fromSync) { persist(); emit('change', { fromSync }); }
  function replace(next, fromSync) { data = next; Model.seedU(data); commit(fromSync); }

  async function getHandle() { if (mode !== 'idb') return null; try { return await tx('handles', s => s.get('dir')); } catch { return null; } }
  async function setHandle(h) { if (mode !== 'idb') return; await tx('handles', s => (h ? s.put(h, 'dir') : s.delete('dir')), true); }

  return {
    init, put, remove, commit, replace, getHandle, setHandle,
    get data() { return data; }, get mode() { return mode; }, get saveErr() { return saveErr; },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

const Sync = (() => {
  const RE = /^prompt-builder-save-(\d{14})-([a-z0-9]{5})\.json(\.gz)?$/;
  const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  let dir = null, state = 'off', detail = '', sessionFile = null, timer = null, writing = null, pulling = null;
  const seen = new Map();
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());
  const set = (s, d) => { state = s; detail = d || ''; emit(); };

  function device() {
    let id = Prefs.get('device');
    if (!/^[a-z0-9]{5}$/.test(id || '')) { id = Math.random().toString(36).slice(2, 7).padEnd(5, '0'); Prefs.set('device', id); }
    return id;
  }
  function stamp(d) { const p = n => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`; }

  async function init() {
    if (!supported) { set('unsupported'); return; }
    const h = await Store.getHandle();
    if (!h) { set('off'); return; }
    dir = h;
    if (!sessionFile) sessionFile = `prompt-builder-save-${stamp(new Date())}-${device()}.json${typeof CompressionStream !== 'undefined' ? '.gz' : ''}`;
    let perm = 'prompt';
    try { perm = await dir.queryPermission({ mode: 'readwrite' }); } catch { perm = 'prompt'; }
    if (perm !== 'granted') { set('access'); return; }
    await pull();
  }

  async function choose() {
    const h = await window.showDirectoryPicker({ id: 'prompt-builder-sync', mode: 'readwrite' });
    dir = h;
    try { await Store.setHandle(h); } catch (e) { console.warn('Folder could not be remembered; you will be asked again next time.', e); }
    sessionFile = `prompt-builder-save-${stamp(new Date())}-${device()}.json${typeof CompressionStream !== 'undefined' ? '.gz' : ''}`;
    seen.clear();
    Prefs.set('unsaved', true); // a new folder must receive this device's entries
    await pull();
    await writeNow();
  }
  async function allow() {
    if (!dir) return;
    const p = await dir.requestPermission({ mode: 'readwrite' });
    if (p === 'granted') { await pull(); if (Prefs.get('unsaved', false)) schedule(0); } else set('access');
  }
  async function disconnect() { dir = null; await Store.setHandle(null); set('off'); }

  async function readFile(fh) {
    const f = await fh.getFile();
    const key = `${f.lastModified}:${f.size}`;
    if (seen.get(fh.name) === key) return null;
    const buf = new Uint8Array(await f.arrayBuffer());
    const text = fh.name.endsWith('.gz') ? await Files.gunzip(buf) : Files.dec.decode(buf);
    const obj = JSON.parse(text);
    if (!obj || obj.app !== Model.APP) { seen.set(fh.name, key); return null; }
    if (Number(obj.v) > Model.V) throw new Error(`${fh.name} comes from a newer app version`);
    seen.set(fh.name, key);
    return Model.sanitize(obj.data);
  }

  async function pull() {
    if (!dir) return;
    if (pulling) return pulling;
    pulling = (async () => {
      if (writing) { try { await writing; } catch { /* reported by write */ } }
      try {
        let merged = Store.data, changed = false, skipped = 0;
        for await (const [name, fh] of dir.entries()) {
          if (fh.kind !== 'file' || !RE.test(name) || name === sessionFile) continue;
          try {
            const remote = await readFile(fh);
            if (!remote) continue;
            const m = Model.merge(merged, remote);
            if (m.localChanged) { merged = m.data; changed = true; }
          } catch (e) { skipped++; seen.delete(name); }
        }
        if (changed) Store.replace(merged, true);
        Prefs.set('lastPull', Date.now());
        if (Prefs.get('unsaved', false)) set('waiting'); else set('ok', skipped ? `${skipped} file${skipped > 1 ? 's' : ''} not ready yet, will retry` : '');
      } catch (e) {
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) set('access');
        else set('problem', e && e.message);
      }
    })();
    try { await pulling; } finally { pulling = null; }
  }

  function schedule(ms) {
    Prefs.set('unsaved', true);
    if (!dir || state === 'access') { if (dir) set('access'); emit(); return; }
    set('waiting');
    clearTimeout(timer);
    timer = setTimeout(() => { writeNow(); }, ms == null ? 3000 : ms);
  }

  async function writeNow() {
    clearTimeout(timer); timer = null;
    if (!dir) return;
    if (writing) { await writing.catch(() => {}); if (Prefs.get('unsaved', false)) return writeNow(); return; }
    writing = (async () => {
      set('saving');
      Prefs.set('unsaved', false);
      const snap = JSON.stringify({ app: Model.APP, v: Model.V, device: device(), savedAt: new Date().toISOString(), data: Store.data });
      try {
        const bytes = sessionFile.endsWith('.gz') ? await Files.gzip(snap) : Files.enc.encode(snap);
        const fh = await dir.getFileHandle(sessionFile, { create: true });
        const w = await fh.createWritable();
        await w.write(bytes); await w.close();
        Prefs.set('lastSync', Date.now());
        await prune();
        set(Prefs.get('unsaved', false) ? 'waiting' : 'ok');
      } catch (e) {
        Prefs.set('unsaved', true);
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) set('access'); else set('problem', e && e.message);
        throw e;
      }
    })();
    try { await writing; } catch { /* state shows the problem */ } finally { writing = null; }
    if (Prefs.get('unsaved', false) && state !== 'access' && state !== 'problem') schedule();
  }

  async function prune() {
    const mine = [];
    for await (const [name, fh] of dir.entries()) { const m = RE.exec(name); if (fh.kind === 'file' && m && m[2] === device()) mine.push(name); }
    mine.sort().reverse();
    for (const name of mine.slice(3)) { try { await dir.removeEntry(name); } catch { /* another app may hold it */ } }
  }

  function label() {
    const ago = t => { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
    return {
      off: ['This device only', ''], unsupported: ['This device only', ''], access: ['Allow folder access', 'bad'],
      waiting: ['Changes waiting to save', 'busy'], saving: ['Saving', 'busy'], problem: ['Sync problem', 'bad'],
      ok: ['Synced ' + ago(Prefs.get('lastSync') || Prefs.get('lastPull')), 'ok'],
    }[state] || ['This device only', ''];
  }

  return { init, choose, allow, disconnect, pull, schedule, writeNow, label, supported, RE,
    get state() { return state; }, get detail() { return detail; }, get dir() { return dir; }, get sessionFile() { return sessionFile; },
    on(fn) { listeners.add(fn); }, device };
})();
