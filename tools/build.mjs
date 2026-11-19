// Generates sw.js (precache list + content hash) from sw.template.js.
// Run after changing ANY app file:   node tools/build.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE_DIRS = ['js', 'css', 'content', 'icons'];
const INCLUDE_FILES = ['index.html', 'manifest.webmanifest'];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'gen') out.push(...await walk(rel)); }   // generator templates are build inputs, not app files
    else out.push(rel);
  }
  return out;
}

const files = [...INCLUDE_FILES];
for (const d of INCLUDE_DIRS) files.push(...await walk(d));
files.sort();

const hash = createHash('sha256');
for (const f of files) {
  hash.update(f);
  hash.update(await readFile(path.join(ROOT, f)));
}
const cache = `latin-${hash.digest('hex').slice(0, 10)}`;
const assets = ['./', ...files];

const tpl = await readFile(path.join(ROOT, 'sw.template.js'), 'utf8');
const out = tpl.replace('__CACHE__', cache).replace('__ASSETS__', JSON.stringify(assets, null, 2));
await writeFile(path.join(ROOT, 'sw.js'), out);
// one place for the version: js/version.js (package.json just follows it)
const version = /APP_VERSION\s*=\s*'([^']+)'/.exec(await readFile(path.join(ROOT, 'js/version.js'), 'utf8'))[1];
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
if (pkg.version !== version) { pkg.version = version; await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n'); }
console.log(`sw.js written: cache ${cache}, ${assets.length} files precached.`);
