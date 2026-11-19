// Reads a progress export (Settings > Export file) and lists what you flagged and what you keep getting wrong,
// next to each sentence's source file, so fixing content is: export, run this, edit, release.
//
//   node tools/flags.mjs path/to/latin-progress.json
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadFromDisk } from './validate.mjs';

/** Pure part, for tests. Returns { flagged: [{item, flags[]}], trouble: [{item, misses, tags[]}], unknown: [ids] }. */
export function analyze(data, content, { minMisses = 2 } = {}) {
  const unknown = new Set();
  const look = (id) => { const it = content.itemsById.get(id); if (!it) unknown.add(id); return it; };

  const byFlag = new Map();
  for (const f of data.flags || []) {
    const it = look(f.itemId);
    if (!byFlag.has(f.itemId)) byFlag.set(f.itemId, { item: it, id: f.itemId, flags: [] });
    byFlag.get(f.itemId).flags.push({ kind: f.kind, given: f.given });
  }

  const byMiss = new Map();
  for (const m of data.mistakes || []) {
    if (!byMiss.has(m.itemId)) byMiss.set(m.itemId, { item: look(m.itemId), id: m.itemId, misses: 0, tags: new Map() });
    const rec = byMiss.get(m.itemId);
    rec.misses++;
    for (const t of m.tags || []) rec.tags.set(t, (rec.tags.get(t) || 0) + 1);
  }
  const trouble = [...byMiss.values()]
    .filter((r) => r.misses >= minMisses)
    .sort((a, b) => b.misses - a.misses)
    .map((r) => ({ ...r, tags: [...r.tags.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t) }));

  return { flagged: [...byFlag.values()], trouble, unknown: [...unknown] };
}

/** Where to edit a sentence: hand-written units are edited directly; generated ones through their template. */
export function whereToFix(content, id) {
  const packId = content.packOf.get(id);
  const unitId = content.unitOf.get(id);
  const pack = content.packs.find((p) => p.id === packId);
  const unit = pack?.units.find((u) => u.id === unitId);
  return unit?.generated
    ? `content/${packId}/gen/${unitId}.json (generated: fix the template or lexicon, then regenerate)`
    : `content/${packId}/u${unitId}.json (hand-written: edit the sentence)`;
}

function describe(it) {
  if (!it) return '(no longer in the content)';
  if (it.swap) return `${it.swap.from}  →  ${it.swap.change}  =  ${it.la}`;
  if (it.q) return `${it.q}  →  ${it.la}`;
  return `${it.en}  =  ${it.la}`;
}

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node tools/flags.mjs <progress export .json>'); process.exit(1); }
  const data = JSON.parse(await readFile(file, 'utf8'));
  if (data.app !== 'latin-app') { console.error('That is not a Latin app export.'); process.exit(1); }
  const content = await loadFromDisk();
  const { flagged, trouble, unknown } = analyze(data, content);

  console.log(`\nFlagged by you: ${flagged.length}`);
  for (const f of flagged) {
    console.log(`\n  ${f.id}   ${describe(f.item)}`);
    for (const x of f.flags) console.log(`    - ${x.kind}${x.given ? `: you wrote "${x.given}"` : ''}`);
    if (f.item) console.log(`    fix in: ${whereToFix(content, f.id)}`);
  }
  console.log(`\nMissed at least twice: ${trouble.length}  (a sentence people keep missing is either hard or badly explained)`);
  for (const r of trouble.slice(0, 25)) {
    console.log(`\n  ${r.id}   ${describe(r.item)}   [${r.misses} misses${r.tags.length ? `; ${r.tags.slice(0, 3).join(', ')}` : ''}]`);
    if (r.item) console.log(`    fix in: ${whereToFix(content, r.id)}`);
  }
  if (unknown.length) console.log(`\n${unknown.length} id(s) in the export are not in this version of the content: ${unknown.slice(0, 5).join(', ')}`);
  console.log('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
