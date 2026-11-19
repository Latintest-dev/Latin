// Id guard. Your saved progress is keyed by sentence id, so an id that disappears (or is renamed) silently
// orphans what you learned about that sentence. This keeps a list of every id ever shipped and fails if one is missing.
//
//   node tools/ids.mjs check     fail if any shipped id is gone from the content (run before every release)
//   node tools/ids.mjs update    add new ids to tools/ids.lock (run when you release; the list only ever grows)
//   node tools/ids.mjs retire <id> [<id>...]   deliberately give up an id (you decided to delete that sentence)
//
// Retired ids are kept in the lock file with a note, so removing a sentence is always a decision, never an accident.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadFromDisk } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.join(ROOT, 'tools', 'ids.lock');

export async function readLock() {
  try {
    const raw = JSON.parse(await readFile(LOCK, 'utf8'));
    return { shipped: raw.shipped || [], retired: raw.retired || [] };
  } catch {
    return { shipped: [], retired: [] };
  }
}

export async function currentIds() {
  const content = await loadFromDisk();
  return [...content.itemsById.keys()];
}

/** Pure part, for tests: which locked ids are missing from the current ids, and which ids are new. */
export function compareIds(lock, current) {
  const now = new Set(current);
  const retired = new Set(lock.retired);
  const missing = lock.shipped.filter((id) => !now.has(id) && !retired.has(id));
  const known = new Set(lock.shipped);
  const added = current.filter((id) => !known.has(id));
  return { missing, added };
}

async function write(lock) {
  const sorted = (a) => [...new Set(a)].sort();
  await writeFile(LOCK, JSON.stringify({
    note: 'Every sentence id ever shipped. Progress is saved by id, so ids must not disappear. Edit with tools/ids.mjs, not by hand.',
    shipped: sorted(lock.shipped),
    retired: sorted(lock.retired),
  }, null, 1) + '\n');
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const lock = await readLock();
  const current = await currentIds();
  const { missing, added } = compareIds(lock, current);
  if (cmd === 'check') {
    if (!lock.shipped.length) { console.log('No tools/ids.lock yet: run "node tools/ids.mjs update" once.'); process.exit(1); }
    if (missing.length) {
      console.error(`${missing.length} shipped sentence id(s) are missing from the content:\n  ${missing.slice(0, 20).join('\n  ')}${missing.length > 20 ? '\n  ...' : ''}`);
      console.error('If you removed them on purpose:  node tools/ids.mjs retire <id> ...   Otherwise restore them (generation is append-only; --fresh resets ids).');
      process.exit(1);
    }
    console.log(`ids OK: ${lock.shipped.length} shipped, ${added.length} new since the last release.`);
  } else if (cmd === 'update') {
    if (missing.length) { console.error(`Refusing to update: ${missing.length} shipped id(s) are missing. Run "check" for details.`); process.exit(1); }
    await write({ shipped: [...lock.shipped, ...added], retired: lock.retired });
    console.log(`tools/ids.lock updated: ${lock.shipped.length + added.length} ids (${added.length} added).`);
  } else if (cmd === 'retire') {
    if (!rest.length) { console.error('Give the id(s) to retire.'); process.exit(1); }
    await write({ shipped: lock.shipped, retired: [...lock.retired, ...rest] });
    console.log(`Retired: ${rest.join(', ')}`);
  } else {
    console.error('Usage: node tools/ids.mjs check | update | retire <id>...');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
