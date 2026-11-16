// Content validator. Run:  node tools/validate.mjs
// Checks every sentence against the lexicon so mechanical mistakes are caught before review:
//   - every Latin word (answers, accepted variants, distractors, blanks) exists as a known form
//   - distractors are not accepted answers, and are distinct from each other
//   - fill words appear in the sentence, skills exist, ids/prefixes are consistent
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadContent } from '../js/core/content.js';
import { PACKS } from '../js/modules/registry.js';
import { normLoose, tokensLoose } from '../js/engine/latin.js';
import { blankSentence } from '../js/engine/items.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadFromDisk() {
  const fetchJson = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));
  return loadContent(fetchJson, PACKS);
}

export async function validateContent() {
  const content = await loadFromDisk();
  return { ...validateLoaded(content), content };
}

/** Validate already-loaded content (lets tests feed in deliberately broken content). */
export function validateLoaded(content) {
  const errors = [];
  const warnings = [];
  const { index, skills, packs } = content;
  const err = (id, msg) => errors.push(`${id}: ${msg}`);

  const checkWords = (id, label, text) => {
    if (text !== text.normalize('NFC')) err(id, `${label} is not NFC-normalised: ${text}`);
    for (const tok of tokensLoose(text)) {
      if (!index.byNorm.has(tok)) err(id, `${label}: unknown word "${tok}" in "${text}"`);
    }
  };

  for (const pack of packs) {
    const enSeen = new Set();
    pack.units.forEach((unit, ui) => {
      if (unit.items.length < 4) err(`${pack.id}.${unit.id}`, 'unit has fewer than 4 items (needed for Latin->English choices)');
      if (!unit.intro) err(`${pack.id}.${unit.id}`, 'missing unit intro');
      for (const it of unit.items) {
        const id = it.id;
        if (!id.startsWith(`${pack.id}.${unit.id}.`)) err(id, `id should start with ${pack.id}.${unit.id}.`);
        for (const f of ['en', 'la', 'tag', 'explain', 'fill']) if (!it[f]) err(id, `missing ${f}`);
        if (!it.skills?.length) err(id, 'no skills');
        for (const s of it.skills || []) if (!skills[s]) err(id, `unknown skill ${s}`);
        const enKey = it.en.toLowerCase();
        if (enSeen.has(enKey)) err(id, `duplicate English sentence: ${it.en}`);
        enSeen.add(enKey);

        it.accepted.forEach((a) => checkWords(id, 'accepted', a));
        if (it.accepted.length > 200) warnings.push(`${id}: ${it.accepted.length} accepted variants`);

        if (it.fill) {
          if (!blankSentence(it)) err(id, `fill word "${it.fill}" not found in "${it.la}"`);
          for (const f of it.fillAccepted) checkWords(id, 'fill', f);
        }

        const acceptedLoose = new Set(it.accepted.map(normLoose));
        if (it.distractors?.length !== 3) err(id, 'needs exactly 3 distractors');
        const dSeen = new Set();
        for (const d of it.distractors || []) {
          if (!Array.isArray(d) || d.length !== 2 || !d[0] || !d[1]) { err(id, 'distractor must be [latin, why]'); continue; }
          checkWords(id, 'distractor', d[0]);
          const dn = normLoose(d[0]);
          if (acceptedLoose.has(dn)) err(id, `distractor is also an accepted answer: ${d[0]}`);
          if (dSeen.has(dn)) err(id, `duplicate distractor: ${d[0]}`);
          dSeen.add(dn);
        }
        // underscores must be paired in explanations
        for (const field of ['explain', ...(it.distractors || []).map((_, i) => i)]) {
          const text = typeof field === 'number' ? it.distractors[field][1] : it[field];
          if ((text.match(/_/g) || []).length % 2) err(id, `unbalanced _ in: ${text}`);
        }
      }
    });
  }
  return { errors, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { errors, warnings, content } = await validateContent();
  const n = content.itemsById.size;
  for (const w of warnings) console.log('warning:', w);
  if (errors.length) {
    for (const e of errors) console.log('ERROR:', e);
    console.log(`\n${errors.length} error(s) in ${n} items.`);
    process.exit(1);
  }
  console.log(`OK: ${n} items in ${content.packs.length} packs, ${content.lexicon.length} lexicon entries, no errors.`);
}
