/* File formats written by hand (no libraries): zip read/write, xlsx, CSV,
   and the Prompt Manager folder format. Exposes `Files`. */
'use strict';
const Files = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  function dosTime(d) {
    const t = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    const dt = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return [t, dt];
  }

  // entries: [{name, data: string|Uint8Array}] -> Uint8Array (stored, UTF-8 names)
  function zip(entries, when) {
    const [t, dt] = dosTime(when || new Date());
    const parts = [], central = [];
    let off = 0;
    for (const e of entries) {
      const name = enc.encode(e.name);
      const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
      const crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, t, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, t, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  // List entries of a zip (reads the central directory; supports zip64 offsets).
  function zipList(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This file is not a zip archive.');
    let count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    if ((count === 0xffff || cdOff === 0xffffffff) && eocd >= 20 && dv.getUint32(eocd - 20, true) === 0x07064b50) {
      const z = Number(dv.getBigUint64(eocd - 12, true));
      count = Number(dv.getBigUint64(z + 32, true)); cdOff = Number(dv.getBigUint64(z + 48, true));
    }
    const list = [];
    let p = cdOff;
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The zip directory is damaged.');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      let csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      let loff = dv.getUint32(p + 42, true);
      const nameBytes = u8.subarray(p + 46, p + 46 + nlen);
      const name = (flags & 0x0800 ? dec : new TextDecoder('utf-8')).decode(nameBytes).replace(/\\/g, '/');
      let x = p + 46 + nlen; const xe = x + xlen;
      while (x + 4 <= xe) {
        const id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true);
        if (id === 1) { let q = x + 4; if (usize === 0xffffffff) { usize = Number(dv.getBigUint64(q, true)); q += 8; } if (csize === 0xffffffff) { csize = Number(dv.getBigUint64(q, true)); q += 8; } if (loff === 0xffffffff) { loff = Number(dv.getBigUint64(q, true)); } }
        x += 4 + sz;
      }
      list.push({ name, method, csize, usize, loff });
      p += 46 + nlen + xlen + clen;
    }
    return list;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unzip compressed files. Use the folder import instead.');
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }

  async function zipRead(u8, entry) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const p = entry.loff;
    if (dv.getUint32(p, true) !== 0x04034b50) throw new Error('Damaged zip entry: ' + entry.name);
    const start = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
    const raw = u8.subarray(start, start + entry.csize);
    if (entry.method === 0) return raw.slice();
    if (entry.method === 8) return inflateRaw(raw);
    throw new Error('Unsupported compression in ' + entry.name);
  }

  // ---------------------------------------------------------------- Prompt Manager format
  const safeFolder = t => String(t).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^[ .]+|[ .]+$/g, '');

  // records: [{title, prompt, thinking, tags}] -> zip entries under prompt_repository/<title>/
  function pmEntries(records) {
    const used = new Set();
    return records.flatMap(r => {
      let base = safeFolder(r.title) || 'Untitled prompt';
      if (base.startsWith('_')) base = 'Prompt ' + base;
      let name = base, i = 2; while (used.has(name.toLowerCase())) name = `${base} (${i++})`;
      used.add(name.toLowerCase());
      const dir = `prompt_repository/${name}/`;
      return [
        { name: dir + 'prompt.txt', data: r.prompt || '' },
        { name: dir + 'thinking.txt', data: r.thinking || '' },
        { name: dir + 'metadata.json', data: JSON.stringify({ tags: r.tags || [] }, null, 2) + '\n' },
      ];
    });
  }

  // Given paths, find prompt folders: .../<folder>/(prompt|thinking).(txt|md) + metadata.json
  function pmGroups(paths) {
    const groups = new Map();
    for (const path of paths) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length < 2) continue;
      if (parts.some(s => s === '.venv' || s === 'node_modules' || s === '__pycache__' || s === '_legacy_backup' || s === '__MACOSX')) continue;
      const file = parts[parts.length - 1].toLowerCase();
      const folder = parts[parts.length - 2];
      if (folder.startsWith('_') || folder.startsWith('.')) continue;
      let role = null;
      if (file === 'prompt.txt' || file === 'prompt.md') role = 'prompt';
      else if (file === 'thinking.txt' || file === 'thinking.md') role = 'thinking';
      else if (file === 'metadata.json') role = 'meta';
      if (!role) continue;
      const key = parts.slice(0, -1).join('/');
      if (!groups.has(key)) groups.set(key, { title: folder, key });
      const g = groups.get(key);
      if (!g[role] || /\.txt$/.test(file)) g[role] = path;
    }
    return [...groups.values()].filter(g => g.prompt).sort((a, b) => a.title.localeCompare(b.title));
  }

  function parseMeta(text) {
    try { const j = JSON.parse(text); return Array.isArray(j.tags) ? j.tags.map(t => String(t).trim()).filter(Boolean) : []; } catch { return []; }
  }

  // ---------------------------------------------------------------- CSV
  function csvCell(v) { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function csv(rows) { return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; }

  // ---------------------------------------------------------------- XLSX
  const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  function colName(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  // sheets: [{name, rows:[[...]], widths:[]}] ; first row is a bold header; numbers stay numbers
  function xlsx(sheets) {
    const files = [];
    const sheetXml = sh => {
      const cols = (sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
      const rows = sh.rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
        const ref = colName(ci) + (ri + 1); const st = ri === 0 ? ' s="1"' : ' s="2"';
        if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${ri === 0 ? ' s="1"' : ''}><v>${v}</v></c>`;
        let s = v == null ? '' : String(v); if (s.length > 32760) s = s.slice(0, 32700) + ' […cut at Excel cell limit]';
        return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xmlEsc(s)}</t></is></c>`;
      }).join('') + '</row>').join('');
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols ? '<cols>' + cols + '</cols>' : ''}<sheetData>${rows}</sheetData></worksheet>`;
    };
    files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
    files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
    files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    files.push({ name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3EEEC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="0"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` });
    sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }));
    return zip(files);
  }

  // ---------------------------------------------------------------- gzip
  async function gzip(text) {
    if (typeof CompressionStream === 'undefined') return null;
    const s = new Blob([enc.encode(text)]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function gunzip(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return dec.decode(await new Response(s).arrayBuffer());
  }

  return { crc32, zip, zipList, zipRead, pmEntries, pmGroups, parseMeta, safeFolder, csv, xlsx, gzip, gunzip, enc, dec };
})();
if (typeof module !== 'undefined') module.exports = Files;
