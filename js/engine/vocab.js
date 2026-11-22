// The word trainer's data: turns the lexicon plus a frequency order into units of word items.
//
// Nothing here is stored twice. A word lives in the lexicon (content/lexicon/*.json); the order of the most useful
// words is a list of lexicon ids (content/vocab/order.json); the units and the items are cut from those two at load
// time. Add a word to the lexicon and put its id in order.json, and it has a flashcard.
//
// A word item is an ordinary item (so it climbs the same ladder, is scheduled and diagnosed the same way) with
//   word: <lexicon id>      marks it as a word, not a sentence
//   la: the Latin headword  en: the English meaning
//   distractors             three other words of the same kind, chosen from words of similar rank
// The steps are: choose the meaning, or choose the Latin; then the Latin with its first letter given; then type it.

import { generateForms } from './latin.js';

const GENDER = { m: 'masculine', f: 'feminine', n: 'neuter', c: 'masculine or feminine' };
const KIND = { noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', conj: 'conjunction', pron: 'pronoun', interj: 'interjection', num: 'number' };
const SKILL = { noun: 'vocab.noun', verb: 'vocab.verb', adj: 'vocab.adj', adv: 'vocab.adv' };
export const skillOf = (pos) => SKILL[pos] || 'vocab.function';

/** "noun, feminine", "verb", "preposition": what kind of word it is, for the chip and the explanation. */
export function kindLabel(e) {
  const k = KIND[e.pos] || e.pos;
  return e.pos === 'noun' && GENDER[e.gender] ? `${k}, ${GENDER[e.gender]}` : k;
}

/** Principal parts to show: stored by the vocabulary tool, or worked out from a hand-made entry's forms. */
export function partsOf(e) {
  if (e.parts) return e.parts;
  let f = {};
  try { f = generateForms(e); } catch { return e.lemma; }
  if (e.pos === 'noun' && f['gen.sg']) return `${e.lemma}, ${f['gen.sg']}${e.gender ? ` (${e.gender})` : ''}`;
  if (e.pos === 'verb' && f['pres.inf.act']) return [e.lemma, f['pres.inf.act'], f['perf.ind.act.1sg']].filter(Boolean).join(', ');
  if (e.pos === 'adj' && f['nom.sg.m']) return `${f['nom.sg.m']}, ${f['nom.sg.f']}, ${f['nom.sg.n']}`;
  return e.lemma;
}

const hash = (s) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
/** A small deterministic random generator, so the same word always gets the same wrong options. */
function seeded(seed) {
  let a = seed || 1;
  return () => { a = Math.imul(a ^ (a >>> 15), a | 1); a ^= a + Math.imul(a ^ (a >>> 7), a | 61); return ((a ^ (a >>> 14)) >>> 0) / 4294967296; };
}

const STOP = new Set(['to', 'be', 'a', 'an', 'the', 'of', 'or', 'and', 'in', 'on', 'with', 'for', 'by', 'from', 'one', 'who', 'that', 'it', 'if', 'as', 'is', 'at', 'so']);
export const contentWords = (gloss) => new Set(String(gloss).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1 && !STOP.has(w)));

/** Do two meanings share a word? (Then one could be mistaken for the other, so neither is offered as a wrong option.) */
export const overlaps = (a, b) => {
  if (String(a).toLowerCase() === String(b).toLowerCase()) return true;
  const x = contentWords(a);
  return [...contentWords(b)].some((w) => x.has(w));
};

/**
 * One item per word. `near` is the list of words of similar rank (the options are drawn from it).
 * `sameMeaning` are other lemmas with the very same meaning and kind (accepted too, since the prompt cannot tell them apart).
 */
export function wordItem(e, near, sameMeaning = []) {
  const rng = seeded(hash(e.id));
  const pool = near.filter((o) => o.id !== e.id && o.lemma !== e.lemma && !overlaps(o.gloss, e.gloss));
  const same = pool.filter((o) => o.pos === e.pos);
  const pick = [];
  for (const list of [same, pool]) {
    const left = list.filter((o) => !pick.includes(o));
    while (pick.length < 3 && left.length) pick.push(left.splice(Math.floor(rng() * left.length), 1)[0]);
  }
  const parts = partsOf(e);
  const label = kindLabel(e);
  return {
    id: `vocab.${e.id}`,
    word: e.id,
    pos: e.pos,
    la: e.lemma,
    en: e.gloss,
    parts,
    accept: sameMeaning.map((o) => o.lemma),
    fill: e.lemma,
    fillAlt: sameMeaning.map((o) => o.lemma),
    skills: [skillOf(e.pos)],
    tag: label,
    explain: `_${parts}_ is a ${label}: ${e.gloss}.`,
    // [Latin, why it is wrong, its meaning]: the meaning is what the Latin-to-English choice offers
    distractors: pick.map((o) => [o.lemma, `_${o.lemma}_ means “${o.gloss}”.`, o.gloss]),
    review: 'unreviewed',
  };
}

/**
 * Units of `size` words, in frequency order. Returns [{ id, title, blurb, intro, items }].
 * `evidence` is how many words at the top of the list are ranked by real counts; later units say their order is looser.
 * `order` is a list of lexicon ids; ids that are not in the lexicon are an error (the validator reports them).
 */
export function buildVocabUnits(lexicon, order, size = 50, evidence = Infinity) {
  const byId = new Map(lexicon.map((e) => [e.id, e]));
  const words = order.map((id) => {
    const e = byId.get(id);
    if (!e) throw new Error(`content/vocab/order.json names "${id}", which is not in the lexicon`);
    return e;
  });
  const meaningKey = (e) => `${e.pos}|${String(e.gloss).toLowerCase()}`;
  const groups = new Map();
  for (const e of words) { const k = meaningKey(e); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  const units = [];
  // a short remainder joins the last unit instead of standing alone
  const starts = [];
  for (let at = 0; at < words.length; at += size) starts.push(at);
  if (starts.length > 1 && words.length - starts[starts.length - 1] < size / 2) starts.pop();
  for (const start of starts) {
    const slice = words.slice(start, start === starts[starts.length - 1] ? words.length : start + size);
    const first = start + 1;
    const last = start + slice.length;
    const items = slice.map((e, j) => {
      const i = start + j;
      const near = words.slice(Math.max(0, i - 150), i + 150);
      return wordItem(e, near, groups.get(meaningKey(e)).filter((o) => o.id !== e.id));
    });
    units.push({
      id: String(units.length + 1),
      title: `Words ${first}–${last}`,
      blurb: slice.slice(0, 5).map((e) => e.lemma).join(', ') + ' …',
      intro: `Words ${first} to ${last} of the roughly ${words.length} most useful Latin words, most frequent first. `
        + 'Each word is a card: first choose its meaning or the Latin, then type it with its first letter given, then type it from the English alone. '
        + 'Principal parts and the genitive appear on the card, since you need them to use the word.'
        + (start >= evidence ? ' Past about the first ' + evidence.toLocaleString('en-US') + ' words the order is looser: these are common words, but where one falls in the list is a guess.' : ''),
      items,
    });
  }
  return units;
}
