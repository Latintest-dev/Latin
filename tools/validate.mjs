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
import { normLoose, tokensLoose, isKnownWord } from '../js/engine/latin.js';
import { blankSentence, promptKey } from '../js/engine/items.js';
import { MODES } from '../js/core/modes.js';

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

  // Conversations: each turn is a Latin question (what the other person says) with your reply; turns are numbered 1..n.
  const checkDialogues = (pack, unit) => {
    const byDlg = new Map();
    for (const it of unit.items) {
      if (!it.dlg) continue;
      if (!it.q) err(it.id, 'a conversation turn needs q (what the other person says)');
      if (!Number.isInteger(it.turn)) err(it.id, 'a conversation turn needs a whole-number turn');
      if (!byDlg.has(it.dlg)) byDlg.set(it.dlg, []);
      byDlg.get(it.dlg).push(it);
    }
    for (const [dlg, turns] of byDlg) {
      const nums = turns.map((t) => t.turn);
      if (nums.some((n, i) => n !== i + 1)) err(`${pack.id}.${unit.id}`, `conversation "${dlg}": turns must be 1, 2, 3... in order (found ${nums.join(',')})`);
      if (!turns[0].scene) err(turns[0].id, `conversation "${dlg}": turn 1 needs a scene (the situation, in English)`);
    }
    if (unit.play === 'dialogue' && !byDlg.size) err(`${pack.id}.${unit.id}`, 'a unit with play: "dialogue" has no conversations');
  };

  const checkWords = (id, label, text) => {
    if (text !== text.normalize('NFC')) err(id, `${label} is not NFC-normalised: ${text}`);
    for (const tok of tokensLoose(text)) {
      if (!isKnownWord(index, tok)) err(id, `${label}: unknown word "${tok}" in "${text}"`);
    }
  };

  // Prompts are unique across the whole app: the same prompt with two different Latin answers would be ambiguous.
  // (A prompt is the English sentence, or for a "change it" item its Latin sentence plus its instruction.)
  const promptSeen = new Set();
  for (const pack of packs) {
    pack.units.forEach((unit, ui) => {
      if (unit.items.length < 4) err(`${pack.id}.${unit.id}`, 'unit has fewer than 4 items (needed for Latin->English choices)');
      if (!unit.intro) err(`${pack.id}.${unit.id}`, 'missing unit intro');
      if (unit.play && !MODES[unit.play]?.replay) err(`${pack.id}.${unit.id}`, `play: "${unit.play}" is not a mode with a replay button`);
      checkDialogues(pack, unit);
      for (const it of unit.items) {
        const id = it.id;
        // a word card's id follows its word, not its place in the list, so reordering never loses anyone's progress
        if (it.word) {
          if (id !== `${pack.id}.${it.word}`) err(id, `a word card's id should be ${pack.id}.${it.word}`);
          const e = content.index.lex.get(it.word);
          if (!e) err(id, `word "${it.word}" is not in the lexicon`);
          else if (e.lemma !== it.la) err(id, `card shows "${it.la}" but the lexicon lemma is "${e.lemma}"`);
        } else if (!id.startsWith(`${pack.id}.${unit.id}.`)) err(id, `id should start with ${pack.id}.${unit.id}.`);
        for (const f of ['en', 'la', 'tag', 'explain', 'fill']) if (!it[f]) err(id, `missing ${f}`);
        if (it.q) checkWords(id, 'question', it.q);
        if (it.q && it.sit) err(id, 'an item has either q (Latin question) or sit (situation), not both');
        if (it.swap) {
          if (it.q || it.sit) err(id, 'a swap item cannot also have q or sit');
          if (!it.swap.from || !it.swap.change) err(id, 'swap needs from (the Latin base sentence) and change (the instruction)');
          else checkWords(id, 'swap.from', it.swap.from);
        }
        if (it.modern && !it.modernNote) err(id, 'modern items need a modernNote saying where the word comes from');
        if (!it.skills?.length) err(id, 'no skills');
        for (const s of it.skills || []) if (!skills[s]) err(id, `unknown skill ${s}`);
        const key = promptKey(it);
        if (promptSeen.has(key)) err(id, `duplicate prompt: ${it.swap ? `${it.swap.from} (${it.swap.change})` : it.en}`);
        promptSeen.add(key);

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
          if (!Array.isArray(d) || d.length !== (it.word ? 3 : 2) || d.some((x) => !x)) { err(id, it.word ? 'a word distractor must be [latin, why, meaning]' : 'distractor must be [latin, why]'); continue; }
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

  // Word lists: a word is listed once, every listed id exists, and nothing in the lexicon is waiting unlisted.
  for (const pack of packs.filter((p) => p.vocab)) {
    const ids = pack.units.flatMap((u) => u.items.map((it) => it.word));
    const seen = new Set();
    for (const w of ids) { if (seen.has(w)) err(`${pack.id}`, `word "${w}" is listed twice in the order file`); seen.add(w); }
    const unlisted = content.lexicon.filter((e) => e.vocabOnly && !seen.has(e.id));
    if (unlisted.length) warnings.push(`${unlisted.length} lexicon words are marked vocabOnly but not in ${pack.id}'s order file (e.g. ${unlisted.slice(0, 5).map((e) => e.id).join(', ')})`);
  }

  // The curriculum (content/curriculum.json): every unit of every sentence track is in exactly one stage, in an order
  // the unlock rules allow, so the Path screen never hides a unit and never offers one that cannot open yet.
  if (content.stages) {
    const where = new Map();   // "pack.unit" -> position in the whole plan
    let pos = 0;
    const stageIds = new Set();
    for (const st of content.stages) {
      if (stageIds.has(st.id)) err(`curriculum ${st.id}`, 'stage id used twice');
      stageIds.add(st.id);
      if (!st.units.length) err(`curriculum ${st.id}`, 'a stage needs at least one unit');
      for (const u of st.units) {
        if (where.has(u.ref)) err(`curriculum ${st.id}`, `${u.ref} is listed twice`);
        where.set(u.ref, pos++);
      }
    }
    for (const pack of packs.filter((p) => p.budget !== 'words')) {
      let last = -1;
      for (const unit of pack.units) {
        const at = where.get(`${pack.id}.${unit.id}`);
        if (at === undefined) { err(`curriculum`, `${pack.id}.${unit.id} (“${unit.title}”) is in no stage`); continue; }
        if (at < last) err('curriculum', `${pack.id}.${unit.id} comes before an earlier unit of its own track; units open in order`);
        last = at;
      }
      if (pack.gate) {
        const first = where.get(`${pack.id}.${pack.units[0].id}`);
        const gate = where.get(`${pack.gate.pack}.${pack.gate.unit.id}`);
        if (first !== undefined && gate !== undefined && gate > first) err('curriculum', `${pack.id} opens only after ${pack.gate.pack}.${pack.gate.unit.id}, which the plan puts later`);
      }
    }
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
