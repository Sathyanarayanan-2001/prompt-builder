/* Data model and merge. Pure functions; exposes `Model`.
   The whole library is one object of collections; every record carries `u`
   (its last update time in ms, unique and increasing on a device). A deleted
   record becomes a tombstone {id, d:1, u} so the deletion reaches other devices. */
'use strict';
const Model = (() => {
  const COLLECTIONS = ['builds', 'versions', 'memory', 'profiles', 'cfg'];
  const APP = 'prompt-builder';
  const V = 1;

  function empty() { const d = {}; COLLECTIONS.forEach(c => (d[c] = {})); return d; }

  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  // newer u wins; exact tie -> larger canonical JSON wins (every device settles the same way)
  function pick(a, b) {
    if (!a) return b; if (!b) return a;
    if (a.u !== b.u) return a.u > b.u ? a : b;
    const ca = canon(a), cb = canon(b);
    return ca >= cb ? a : b;
  }

  function sanitize(raw) {
    const out = empty();
    if (!raw || typeof raw !== 'object') return out;
    for (const c of COLLECTIONS) {
      const src = raw[c];
      if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
      for (const [id, r] of Object.entries(src)) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
        const u = Number(r.u);
        if (!Number.isFinite(u) || u < 0) continue;
        out[c][id] = { ...r, id, u };
      }
    }
    return out;
  }

  // Returns {data, localChanged, remoteBehind}
  function merge(local, remote) {
    const data = empty();
    let localChanged = false, remoteBehind = false;
    for (const c of COLLECTIONS) {
      const A = (local && local[c]) || {}, B = (remote && remote[c]) || {};
      const ids = new Set([...Object.keys(A), ...Object.keys(B)]);
      for (const id of ids) {
        const w = pick(A[id], B[id]);
        data[c][id] = w;
        if (!A[id] || canon(A[id]) !== canon(w)) localChanged = true;
        if (!B[id] || canon(B[id]) !== canon(w)) remoteBehind = true;
      }
    }
    return { data, localChanged, remoteBehind };
  }

  let lastU = 0;
  function nextU() { const n = Date.now(); lastU = n > lastU ? n : lastU + 1; return lastU; }
  function seedU(data) { for (const c of COLLECTIONS) for (const r of Object.values(data[c] || {})) if (r.u > lastU && r.u < Date.now() + 864e5) lastU = r.u; }

  const live = coll => Object.values(coll || {}).filter(r => !r.d);
  function rid(prefix) { const a = new Uint8Array(8); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a); return prefix + Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 12); }
  function hash(s) { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; } return h1.toString(36) + h2.toString(36); }
  const memId = (field, value) => 'm_' + hash(field + '\u0000' + String(value).trim());

  function backupBlob(data) { return { app: APP, v: V, savedAt: new Date().toISOString(), data }; }
  function readBackup(obj) {
    if (!obj || obj.app !== APP) throw new Error('This is not a Prompt Builder backup file.');
    if (Number(obj.v) > V) throw new Error('This backup comes from a newer version of Prompt Builder. Update the app first.');
    return sanitize(obj.data);
  }

  return { COLLECTIONS, APP, V, empty, canon, pick, merge, sanitize, nextU, seedU, live, rid, hash, memId, backupBlob, readBackup };
})();
if (typeof module !== 'undefined') module.exports = Model;
