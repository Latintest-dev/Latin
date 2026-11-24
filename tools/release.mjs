// One command from "I changed something" to "a zip I can upload":
//
//   node tools/release.mjs                  check everything, rebuild sw.js, write dist/latin-app-<version>.zip
//   node tools/release.mjs --bump minor     also raise the version first (patch | minor | major | x.y.z)
//   node tools/release.mjs --e2e            also run the browser tests (needs Playwright and Chrome)
//   node tools/release.mjs --check          only the checks; writes nothing except regenerated content
//
// Each release also writes dist/latin-app-<version>-changes*.zip: only the files that differ from the previous release
// (tracked in release-manifest.json, which is part of the app and uploaded with it), plus DELETE.txt naming files to
// remove from GitHub. After the first full upload, updates are usually a handful of files.
//
// Order matters: generate (append-only) -> validate content -> ids guard -> unit tests -> [browser tests] ->
// version -> build sw.js -> record new ids -> zip. Any failure stops the release before anything is written.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = path.join(ROOT, 'js', 'version.js');

export function bumpVersion(current, how) {
  if (/^\d+\.\d+\.\d+$/.test(how)) return how;
  const [a, b, c] = current.split('.').map(Number);
  if (how === 'major') return `${a + 1}.0.0`;
  if (how === 'minor') return `${a}.${b + 1}.0`;
  if (how === 'patch') return `${a}.${b}.${c + 1}`;
  throw new Error(`Unknown version "${how}": use patch, minor, major or x.y.z`);
}

export async function readVersion() {
  const m = /APP_VERSION\s*=\s*'([^']+)'/.exec(await readFile(VERSION_FILE, 'utf8'));
  if (!m) throw new Error('js/version.js has no APP_VERSION');
  return m[1];
}

function step(name, cmd, args, opts = {}) {
  console.log(`\n== ${name}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`\nStopped: "${name}" failed. Nothing was released.`);
    process.exit(r.status || 1);
  }
}

const MANIFEST = 'release-manifest.json';

/** Pure part, for tests: what changed between two { path: hash } maps. */
export function diffManifests(previous = {}, next = {}) {
  const changed = Object.keys(next).filter((f) => previous[f] !== next[f]).sort();
  const removed = Object.keys(previous).filter((f) => !(f in next)).sort();
  return { changed, removed };
}

async function hashFiles(files) {
  const out = {};
  for (const f of files.filter((x) => x !== MANIFEST).sort()) out[f] = createHash('sha256').update(await readFile(path.join(ROOT, f))).digest('hex').slice(0, 16);
  return out;
}

const SKIP = new Set(['dist', 'node_modules', '.git', '__pycache__', '.cache']);   // .cache = downloaded vocabulary sources (large, re-creatable)
const UPLOAD_LIMIT = 90;   // GitHub's web uploader refuses more than 100 files at a time

async function listFiles(dir = '') {
  const out = [];
  for (const e of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await listFiles(rel));
    else out.push(rel);
  }
  return out;
}

/** Pure part, for tests: split files into groups of at most `limit`, keeping each top-level folder together where it fits. */
export function uploadBatches(files, limit = UPLOAD_LIMIT) {
  const groups = new Map();
  for (const f of files) {
    const top = f.includes('/') ? f.split('/')[0] : '(root files)';
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top).push(f);
  }
  const pieces = [];
  for (const [top, list] of groups) {
    // a folder bigger than the limit is split by its sub-folders, then by plain chunks as a last resort
    if (list.length <= limit) { pieces.push({ name: top, files: list }); continue; }
    const sub = new Map();
    for (const f of list) { const k = f.split('/').slice(0, 2).join('/'); if (!sub.has(k)) sub.set(k, []); sub.get(k).push(f); }
    for (const [k, l] of sub) for (let i = 0; i < l.length; i += limit) pieces.push({ name: k, files: l.slice(i, i + limit) });
  }
  pieces.sort((a, b) => b.files.length - a.files.length);
  const batches = [];
  for (const piece of pieces) {
    const home = batches.find((b) => b.files.length + piece.files.length <= limit);
    if (home) { home.files.push(...piece.files); home.names.push(piece.name); }
    else batches.push({ files: [...piece.files], names: [piece.name] });
  }
  return batches;
}

async function main() {
  const args = process.argv.slice(2);
  const bumpAt = args.indexOf('--bump');
  const checkOnly = args.includes('--check');

  step('Generate content from templates (append-only)', 'node', ['tools/generate.mjs']);
  step('Validate content', 'node', ['tools/validate.mjs']);
  step('Check that no shipped sentence id disappeared', 'node', ['tools/ids.mjs', 'check']);
  const unitTests = (await readdir(path.join(ROOT, 'tests'))).filter((f) => f.endsWith('.test.mjs')).map((f) => `tests/${f}`);
  step('Unit tests', 'node', ['--test', ...unitTests]);
  if (args.includes('--e2e')) step('Browser tests', 'bash', ['tests/e2e/run_all.sh']);
  if (checkOnly) { console.log('\nAll checks passed.'); return; }

  let version = await readVersion();
  if (bumpAt >= 0) {
    version = bumpVersion(version, args[bumpAt + 1] || '');
    await writeFile(VERSION_FILE, `export const APP_VERSION = '${version}';\n`);
    console.log(`\nVersion is now ${version}`);
  }
  step('Build service worker (and sync package.json version)', 'node', ['tools/build.mjs']);
  step('Record new sentence ids', 'node', ['tools/ids.mjs', 'update']);

  // changes since the last release: new and edited files, and a list of files to delete
  let previous = {};
  try { previous = JSON.parse(await readFile(path.join(ROOT, MANIFEST), 'utf8')).files; } catch { /* first release with a manifest */ }
  const next = await hashFiles(await listFiles());
  const { changed, removed } = diffManifests(previous, next);
  await writeFile(path.join(ROOT, MANIFEST), JSON.stringify({ version, files: next }, null, 1) + '\n');
  await mkdir(path.join(ROOT, 'dist'), { recursive: true });
  const zip = path.join('dist', `latin-app-${version}.zip`);
  step('Zip', 'zip', ['-rq', zip, '.', '-x', 'dist/*', 'node_modules/*', '.git/*', 'tests/e2e/__pycache__/*']);

  // GitHub's web uploader takes at most 100 files per upload, so also write the same files as a few small zips
  const batches = uploadBatches(await listFiles());
  const parts = [];
  for (const [i, b] of batches.entries()) {
    const name = path.join('dist', `latin-app-${version}-upload-${i + 1}-of-${batches.length}.zip`);
    await rm(path.join(ROOT, name), { force: true });
    step(`Zip upload ${i + 1} of ${batches.length}`, 'zip', ['-q', name, ...b.files]);
    parts.push(`  ${name}  (${b.files.length} files: ${b.names.join(', ')})`);
  }
  const send = [...new Set([...changed, MANIFEST])];
  const deleteNote = removed.length > 0;
  if (deleteNote) await writeFile(path.join(ROOT, 'dist', `DELETE-${version}.txt`), `Delete these files from the GitHub repository (they no longer exist in the app):\n${removed.join('\n')}\n`);
  const changeParts = [];
  const chunks = uploadBatches(send);
  for (const [i, b] of chunks.entries()) {
    const name = path.join('dist', `latin-app-${version}-changes${chunks.length > 1 ? `-${i + 1}-of-${chunks.length}` : ''}.zip`);
    await rm(path.join(ROOT, name), { force: true });
    step(`Zip changes ${i + 1} of ${chunks.length}`, 'zip', ['-q', name, ...b.files]);
    changeParts.push(`  ${name}  (${b.files.length} files)`);
  }
  console.log(`\nChanged since the last release: ${changed.length} files${removed.length ? `, ${removed.length} to delete (see dist/DELETE-${version}.txt)` : ''}.\nIf your GitHub repo already has the previous release, upload only:\n${changeParts.join('\n')}`);
  console.log(`\nReady: ${zip} (everything, ${(await listFiles()).length} files)\nFor GitHub's web uploader (max 100 files at a time), upload these one after another, unzipped, keeping the folders:\n${parts.join('\n')}\nThen reload the app twice on each device to pick up the new version.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
