// Loads lexicon, skills and all packs, and prepares items.
// `fetchJson(path)` is injected so the same code works in the browser (fetch) and in Node (fs).

import { buildIndex } from '../engine/latin.js';
import { prepareItem } from '../engine/items.js';
import { buildVocabUnits } from '../engine/vocab.js';
import { indexLessonWords } from '../engine/lessons.js';
import { formItem, parseFormId, FORM_SKILLS } from '../engine/forms.js';

/**
 * The items of the app by id. Sentences and word cards are in it from the start; a forms-practice item
 * ("form.<word>.<cell>") is made the first time anything asks for it, because there are thousands of possible ones.
 */
class ItemMap extends Map {
  constructor(make) { super(); this.make = make; }
  get(id) {
    const have = super.get(id);
    if (have !== undefined || !this.make) return have;
    const made = this.make(id);
    if (made) super.set(id, made);
    return made;
  }
  has(id) { return super.has(id) || this.get(id) !== undefined; }
}

/**
 * The lexicon is a set of files listed in content/lexicon/index.json, merged into one list. A word lives in exactly
 * one of them (an id or a lemma that appears twice is an error), so adding vocabulary is adding a file or appending
 * to one, never copying a word.
 */
export async function loadLexicon(fetchJson) {
  const files = await fetchJson('content/lexicon/index.json');
  const lists = await Promise.all(files.map((file) => fetchJson(`content/lexicon/${file}`)));   // in parallel; order kept
  const out = [];
  const seen = new Map();
  for (const [n, file] of files.entries()) {
    for (const entry of lists[n]) {
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
  const itemsById = new ItemMap((id) => {
    const f = parseFormId(id);
    return f ? formItem({ index }, f.lexId, f.cell) : undefined;
  });
  const unitOf = new Map();
  const packOf = new Map();

  // Everything is fetched in parallel (about a hundred small files), then assembled in registry order.
  const [metas, curriculum] = await Promise.all([
    Promise.all(registry.map((reg) => fetchJson(reg.path))),
    fetchJson('content/curriculum.json'),
  ]);
  const loaded = await Promise.all(registry.map(async (reg, n) => {
    const meta = metas[n];
    const base = reg.path.replace(/[^/]*$/, '');
    const ownSkills = meta.skillsFile ? await fetchJson(base + meta.skillsFile) : {};
    // A word-list track (pack.json: "vocab": {"order": "order.json", "size": 50}) has no unit files: its units are
    // cut from the lexicon in frequency order, so a word is written once and shows up here by id.
    if (meta.vocab) {
      const order = await fetchJson(base + meta.vocab.order);
      return { meta, ownSkills, unitList: buildVocabUnits(lexicon, order, meta.vocab.size || 50, meta.vocab.evidence), lazy: true };
    }
    const unitList = await Promise.all(meta.units.map(async (u) => ({ ...u, raw: await fetchJson(base + u.file) })));
    return { meta, ownSkills, unitList, lazy: false };
  }));

  for (const { meta, ownSkills, unitList, lazy } of loaded) {
    // a track may carry its own skills (pack.json: "skillsFile"), so a new track never edits a shared file
    for (const [id, sk] of Object.entries(ownSkills)) {
      if (skills[id]) throw new Error(`Skill "${id}" is defined twice (pack ${meta.id})`);
      skills[id] = sk;
    }
    const units = [];
    for (const u of unitList) {
      const items = lazy ? u.items : u.raw.map(prepareItem);   // lazy word cards are already prepared
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
    pack.gate = { unit, packName: other.name, pack: other.id };
  }
  // forms practice has skills of its own (named in engine/forms.js), so Progress can show them like any other
  for (const [id, name] of Object.entries(FORM_SKILLS)) {
    if (skills[id]) throw new Error(`Skill "${id}" is defined twice (forms)`);
    skills[id] = { name, pack: 'words' };
  }
  const stages = resolveStages(curriculum, packs);
  const lesson = indexLessonWords(packs, index);
  // position of each word in the frequency list: lesson words are taught in this order
  const wordRank = new Map();
  for (const pack of packs.filter((p) => p.budget === 'words')) {
    for (const unit of pack.units) for (const it of unit.items) wordRank.set(it.word, wordRank.size);
  }
  return { lexicon, skills, index, packs, itemsById, unitOf, packOf, stages, lesson, wordRank };
}

/**
 * content/curriculum.json is the plan: an ordered list of stages, each naming units as "pack.unit". Every unit of every
 * sentence track must be in exactly one stage (the validator checks), so nothing is ever orphaned from the Path screen.
 */
export function resolveStages(curriculum, packs) {
  return curriculum.stages.map((st) => ({
    ...st,
    units: st.units.map((ref) => {
      const [packId, unitId] = ref.split('.');
      const pack = packs.find((p) => p.id === packId);
      const ui = pack ? pack.units.findIndex((u) => u.id === unitId) : -1;
      if (ui < 0) throw new Error(`curriculum stage "${st.id}" names ${ref}, which does not exist`);
      return { ref, pack, unit: pack.units[ui], ui };
    }),
  }));
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
