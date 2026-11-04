// Inlines fonts, CSS and JavaScript into dist/index.html (GitHub Pages) and
// dist/artifact.html (claude.ai preview), and copies the worker, manifest and icons.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = p => readFileSync(join(root, p), 'utf8');
const b64 = p => readFileSync(join(root, p)).toString('base64');
const fonts = [400, 600].map(w => `@font-face{font-family:'IBM Plex Sans';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64(`public/ibm-plex-sans-latin-${w}-normal.woff2`)}) format('woff2')}`).join('\n');
const css = r('src/app.css');
const js = ['engine.js', 'reviewers.js', 'model.js', 'files.js', 'store.js', 'app.js'].map(f => `/* ${f} */\n` + r('src/' + f).replace(/^if \(typeof module !== 'undefined'\).*$/m, '')).join('\n');
const fill = t => t.replace('/*FONTS*/', () => fonts).replace('/*CSS*/', () => css).replace('/*JS*/', () => js.replace(/<\/script/gi, '<\\/script'));
mkdirSync(join(root, 'dist/icons'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), fill(r('src/index.html')));
writeFileSync(join(root, 'dist/artifact.html'), fill(r('src/artifact.html')));
writeFileSync(join(root, 'dist/sw.js'), r('src/sw.js'));
writeFileSync(join(root, 'dist/manifest.webmanifest'), r('src/manifest.webmanifest'));
if (existsSync(join(root, 'public/icons'))) cpSync(join(root, 'public/icons'), join(root, 'dist/icons'), { recursive: true });
writeFileSync(join(root, 'dist/.nojekyll'), '');
console.log('Built dist/index.html (' + Math.round(readFileSync(join(root, 'dist/index.html')).length / 1024) + ' KB)');
