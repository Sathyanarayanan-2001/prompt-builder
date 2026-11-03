// Tiny static server for dist/: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
const port = Number(process.argv[2] || process.env.PORT || 8124);
export const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(dist, p));
  if (!f.startsWith(dist)) { res.writeHead(403); return res.end(); }
  try { const b = await readFile(f); res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('Not found'); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(port, () => console.log(`Prompt Builder on http://localhost:${port}`));
