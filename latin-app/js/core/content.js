// Loads lexicon, skills and all packs, and prepares items.
// `fetchJson(path)` is injected so the same code works in the browser (fetch) and in Node (fs).

import { buildIndex } from '../engine/latin.js';
import { prepareItem } from '../engine/items.js';

export async function loadContent(fetchJson, registry) {
  const lexicon = await fetchJson('content/lexicon.json');
  const skills = await fetchJson('content/skills.json');
  const index = buildIndex(lexicon);
  const packs = [];
  const itemsById = new Map();
  const unitOf = new Map();
  const packOf = new Map();

  for (const reg of registry) {
    const meta = await fetchJson(reg.path);
    const base = reg.path.replace(/[^/]*$/, '');
    const units = [];
    for (const u of meta.units) {
      const rawItems = await fetchJson(base + u.file);
      const items = rawItems.map(prepareItem);
      for (const it of items) {
        if (itemsById.has(it.id)) throw new Error(`Duplicate item id ${it.id}`);
        itemsById.set(it.id, it);
        unitOf.set(it.id, u.id);
        packOf.set(it.id, meta.id);
      }
      units.push({ ...u, items });
    }
    packs.push({ ...meta, units });
  }
  return { lexicon, skills, index, packs, itemsById, unitOf, packOf };
}

export const browserFetchJson = async (path) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
};
