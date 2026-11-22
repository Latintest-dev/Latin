// Loads lexicon, skills and all packs, and prepares items.
// `fetchJson(path)` is injected so the same code works in the browser (fetch) and in Node (fs).

import { buildIndex } from '../engine/latin.js';
import { prepareItem } from '../engine/items.js';
import { buildVocabUnits } from '../engine/vocab.js';

/**
 * The lexicon is a set of files listed in content/lexicon/index.json, merged into one list. A word lives in exactly
 * one of them (an id or a lemma that appears twice is an error), so adding vocabulary is adding a file or appending
 * to one, never copying a word.
 */
export async function loadLexicon(fetchJson) {
  const files = await fetchJson('content/lexicon/index.json');
  const out = [];
  const seen = new Map();
  for (const file of files) {
    for (const entry of await fetchJson(`content/lexicon/${file}`)) {
      if (seen.has(entry.id)) throw new Error(`Word id "${entry.id}" is defined twice (${seen.get(entry.id)} and ${file})`);
      seen.set(entry.id, file);
      out.push(entry);
    }
  }
  return out;
}

export async function loadContent(fetchJson, registry) {
  const lexicon = await loadLexicon(fetchJson);
  const skills = { ...(await fetchJson('content/skills.json')) };
  const index = buildIndex(lexicon);
  const packs = [];
  const itemsById = new Map();
  const unitOf = new Map();
  const packOf = new Map();

  for (const reg of registry) {
    const meta = await fetchJson(reg.path);
    const base = reg.path.replace(/[^/]*$/, '');
    // a track may carry its own skills (pack.json: "skillsFile"), so a new track never edits a shared file
    if (meta.skillsFile) {
      for (const [id, sk] of Object.entries(await fetchJson(base + meta.skillsFile))) {
        if (skills[id]) throw new Error(`Skill "${id}" is defined twice (pack ${meta.id})`);
        skills[id] = sk;
      }
    }
    const units = [];
    // A word-list track (pack.json: "vocab": {"order": "order.json", "size": 50}) has no unit files: its units are
    // cut from the lexicon in frequency order, so a word is written once and shows up here by id.
    const unitList = meta.vocab
      ? buildVocabUnits(lexicon, await fetchJson(base + meta.vocab.order), meta.vocab.size || 50, meta.vocab.evidence).map((u) => ({ ...u, raw: u.items }))
      : meta.units;
    for (const u of unitList) {
      const rawItems = u.raw || await fetchJson(base + u.file);
      const items = rawItems.map(prepareItem);
      for (const it of items) {
        if (itemsById.has(it.id)) throw new Error(`Duplicate item id ${it.id}`);
        itemsById.set(it.id, it);
        unitOf.set(it.id, u.id);
        packOf.set(it.id, meta.id);
      }
      const { raw, ...unit } = u;
      units.push({ ...unit, items });
    }
    packs.push({ ...meta, units });
  }
  // A track can wait for a unit of another track (`requires: {pack, unit}` in its pack.json).
  for (const pack of packs) {
    if (!pack.requires) continue;
    const other = packs.find((p) => p.id === pack.requires.pack);
    const unit = other?.units.find((u) => u.id === pack.requires.unit);
    if (!unit) throw new Error(`Pack ${pack.id} requires ${pack.requires.pack}.${pack.requires.unit}, which does not exist`);
    pack.gate = { unit, packName: other.name };
  }
  return { lexicon, skills, index, packs, itemsById, unitOf, packOf };
}

/** The earlier turns of the conversation an item belongs to (empty for ordinary items), in order. */
export function priorTurns(content, item) {
  if (!item.dlg) return [];
  const pack = content.packs.find((p) => p.id === content.packOf.get(item.id));
  const unit = pack.units.find((u) => u.id === content.unitOf.get(item.id));
  return unit.items.filter((o) => o.dlg === item.dlg && o.turn < item.turn).sort((a, b) => a.turn - b.turn);
}

/** The opening situation of the conversation an item belongs to ("You meet a friend in the forum."), or null. */
export function sceneOf(content, item) {
  if (!item.dlg) return null;
  if (item.scene) return item.scene;
  const pack = content.packs.find((p) => p.id === content.packOf.get(item.id));
  const unit = pack.units.find((u) => u.id === content.unitOf.get(item.id));
  return unit.items.find((o) => o.dlg === item.dlg && o.turn === 1)?.scene ?? null;
}

export const browserFetchJson = async (path) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
};
