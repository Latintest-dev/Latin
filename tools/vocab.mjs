// Vocabulary builder: grows the lexicon with the most frequent Latin words and records their frequency order.
//
//   node tools/vocab.mjs fetch            download the source data into tools/.cache (needs internet; not committed)
//   node tools/vocab.mjs build [--top N]  add words up to rank N (default 5000), append-only
//   node tools/vocab.mjs report           how many words, by band and part of speech, and what is unresolved
//
// What it writes (all append-only: a word that is already there is never changed or duplicated):
//   content/lexicon/band-<k>.json   new words (gloss-only entries; `vocabOnly: true`), 1000 ranks per file
//   content/lexicon/index.json      the list of lexicon files (this tool adds band files to it)
//   content/vocab/order.json        lexicon ids in frequency order: the word trainer's units are cut from this
//
// A word that already exists in the lexicon (the hand-made entries in core.json) is NOT created again: it only gets
// a place in order.json. So a word lives in exactly one entry, whether it came from this tool or from you.
//
// Sources and how the order is made
//   Whitaker's Words dictionary data (DICTLINE.GEN, INFLECTS.LAT): headwords, principal parts, English meanings, and a
//   frequency tier per entry (A very frequent, B frequent, C common ...), judged by William Whitaker from his texts.
//   Perseus Latin Dependency Treebank: lemma counts over about 45,000 running words (Caesar, Cicero, Sallust, Vergil,
//   Ovid, Phaedrus, Suetonius, Propertius, Tacitus). Too small to rank 5,000 words alone: it settles the top of the list and breaks ties.
// Order = must-haves, then words seen 3+ times in the treebank, then Whitaker's tier A, B, C; inside a tier, by treebank count (most frequent first); words the treebank never meets come last, shortest first.
// It is an approximation: use it as "roughly the 5,000 most useful words", not as exact ranks.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadLexicon } from '../js/core/content.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools', '.cache');
const RAW = 'https://raw.githubusercontent.com';
const SOURCES = {
  'DICTLINE.GEN': `${RAW}/mk270/whitakers-words/master/DICTLINE.GEN`,
  'INFLECTS.LAT': `${RAW}/mk270/whitakers-words/master/INFLECTS.LAT`,
};
const TREEBANKS = ['phi0448.phi001', 'phi0474.phi013', 'phi0631.phi001', 'phi0690.phi003', 'phi0959.phi006', 'phi0975.phi001', 'phi1348.abo012', 'phi0620.phi001', 'phi1351.phi005'];
const TB_URL = (id) => `${RAW}/PerseusDL/treebank_data/master/v2.1/Latin/texts/${id}.perseus-lat1.tb.xml`;
const BAND = 1000;
const EVIDENCE = 3;   // treebank occurrences that count as evidence a word is common

// ---------- text helpers ----------

const MACRONS = { ā: 'a', ē: 'e', ī: 'i', ō: 'o', ū: 'u', ȳ: 'y', Ā: 'A', Ē: 'E', Ī: 'I', Ō: 'O', Ū: 'U' };
const plain = (s) => s.normalize('NFC').replace(/[āēīōūȳĀĒĪŌŪ]/g, (c) => MACRONS[c]).normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
/** What two spellings of the same word share: no macrons, u/v and i/j merged, lowercase. */
export const sameKey = (s) => plain(s).toLowerCase().replace(/v/g, 'u').replace(/j/g, 'i').replace(/[^a-z]/g, '');
const slug = (s) => plain(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---------- download ----------

async function fetchAll() {
  await mkdir(CACHE, { recursive: true });
  const get = async (name, url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    await writeFile(path.join(CACHE, name), Buffer.from(await res.arrayBuffer()));
    console.log('downloaded', name);
  };
  for (const [name, url] of Object.entries(SOURCES)) await get(name, url);
  for (const id of TREEBANKS) await get(`${id}.xml`, TB_URL(id));
}

// ---------- Whitaker's inflection table (endings used to rebuild dictionary forms) ----------

/** table.get("N 1 1 NOM S M") -> [{key, ending}] (stem number and ending). */
export async function loadInflections() {
  const table = new Map();
  for (const line of (await readFile(path.join(CACHE, 'INFLECTS.LAT'), 'latin1')).split(/\r?\n/)) {
    if (!line || line.startsWith('--')) continue;
    const t = line.trim().split(/\s+/);
    const pos = t[0];
    let head, rest;
    if (pos === 'N') { head = t.slice(0, 6); rest = t.slice(6); }                  // N decl var CASE NUM GENDER
    else if (pos === 'ADJ') { head = t.slice(0, 6); rest = t.slice(7); }           // ADJ decl var CASE NUM GENDER DEGREE
    else if (pos === 'V') { head = t.slice(0, 8); rest = t.slice(8); }             // V conj var TENSE VOICE MOOD PERSON NUM
    else continue;
    if (rest.length < 2) continue;
    const key = Number(rest[0]);
    const ending = rest[1] === '0' ? '' : (rest[2] || '');
    const k = head.join(' ');
    if (!table.has(k)) table.set(k, []);
    table.get(k).push({ key, ending });
  }
  return table;
}

// ---------- Whitaker's dictionary ----------

const PRONOUN_HEADWORD = { h: 'hic', ill: 'ille', ips: 'ipse', ist: 'iste', i: 'is', qu: 'qui', aliqu: 'aliquis', idem: 'idem', ego: 'ego', tu: 'tu', n: 'nos', v: 'vos', quisquam: 'quisquam', quidam: 'quidam', quisque: 'quisque', nemo: 'nemo', nihil: 'nihil' };

const POS_NAME = { N: 'noun', V: 'verb', ADJ: 'adj', ADV: 'adv', PREP: 'prep', CONJ: 'conj', INTERJ: 'interj', PRON: 'pron', PACK: 'pron', NUM: 'num' };
const FREQ_TIER = { A: 0, B: 1, C: 2 };

export async function loadDictionary(infl) {
  const out = [];
  for (const line of (await readFile(path.join(CACHE, 'DICTLINE.GEN'), 'latin1')).split(/\r?\n/)) {
    if (line.length < 100) continue;
    const stems = [0, 19, 38, 57].map((i) => line.slice(i, i + 19).trim());
    const m = /^\s*(\S+)\s+(.*?)\s+([A-Z]) ([A-Z]) ([A-Z]) ([A-Z]) ([A-Z]) (.*)$/.exec(line.slice(76));
    if (!m) continue;
    const [, posCode, mid, age, , , freq, , meaning] = m;
    if (!(freq in FREQ_TIER) || !POS_NAME[posCode] || !'XBCD'.includes(age)) continue;   // not archaic (A), later (E), medieval (F)...
    const e = buildEntry(posCode, mid.split(/\s+/), stems.map((s) => (s === 'zzz' ? '' : s)), infl);
    if (!e) continue;
    e.tier = FREQ_TIER[freq];
    e.lemma = e.lemma.replace(/j/g, 'i'); e.parts = e.parts.replace(/j/g, 'i');   // this app writes iam, iustus
    e.gloss = cleanGloss(meaning, e.pos);
    if (!e.gloss || /^[A-Z]/.test(e.lemma) || /\babb\./.test(meaning.slice(0, 40))) continue;   // proper names, abbreviations
    out.push(e);
  }
  return dropSpellingVariants(out);
}

/**
 * Whitaker lists old and assimilated spellings as separate words (adger / agger, inpeditus / impeditus, apsolute /
 * absolute). Keep the usual one: drop a word when its assimilated spelling is also in the dictionary.
 */
/** Spellings a word would have if its prefix were assimilated (adgredior -> aggredior, conpono -> compono, inmitto -> immitto). */
function assimilated(k) {
  const out = [];
  let m;
  if ((m = /^ad([cfglnpqrst])/.exec(k))) out.push(m[1] === 'q' ? `ac${k.slice(2)}` : `a${m[1]}${k.slice(2)}`);
  if ((m = /^con([bmp])/.exec(k))) out.push(`com${k.slice(3)}`);
  if ((m = /^con([lr])/.exec(k))) out.push(`co${m[1]}${k.slice(3)}`);
  if ((m = /^in([bmp])/.exec(k))) out.push(`im${k.slice(2)}`);
  if ((m = /^in([lr])/.exec(k))) out.push(`i${m[1]}${k.slice(2)}`);
  if ((m = /^ob([cfp])/.exec(k))) out.push(`o${m[1]}${k.slice(2)}`);
  if ((m = /^sub([cfgmpr])/.exec(k))) out.push(`su${m[1]}${k.slice(3)}`);
  if (/^aps/.test(k)) out.push(`abs${k.slice(3)}`);
  return out;
}
/** Stems and prefixes Whitaker stores as entries, and verbs whose forms the endings table cannot rebuild. */
const NOT_WORDS = new Set(['num:tr', 'num:du', 'num:un', 'adv:amb', 'conj:ast', 'verb:cio', 'verb:o', 'verb:neg', 'verb:ambed', 'verb:aded', 'verb:comed', 'verb:aud', 'interj:ast']);
const ARCHAIC = /^(auors|aduors|conuors|uors|uort|uolt|uolg|uoln|uolp|cludo|quom|quoi)/;   // (u stands for v: see sameKey)
function dropSpellingVariants(list) {
  const have = new Set(list.map((e) => `${sameKey(e.lemma)}|${e.pos}`));
  return list.filter((e) => {
    const k = sameKey(e.lemma);
    if (ARCHAIC.test(k) && k !== 'uolo' && !/^uolu/.test(k)) return false;
    if (NOT_WORDS.has(e.pos + ':' + e.lemma)) return false;
    return !assimilated(k).some((alt) => have.has(`${alt}|${e.pos}`));
  });
}

// An inflection line with variant 0 applies to every variant of that conjugation or declension.
const ending = (infl, key, stem) => {
  const parts = key.split(' ');
  const rows = infl.get(key) || infl.get([parts[0], parts[1], '0', ...parts.slice(3)].join(' ')) || [];
  return rows.map((x) => (stem[x.key - 1] ?? stem[0]) + x.ending);
};

function buildEntry(posCode, f, stems, infl) {
  const s = stems;
  const pos = POS_NAME[posCode];
  if (posCode === 'N') {
    const [decl, vr, gender] = f;
    if (decl === '9') return null;
    // the row for this gender first, then the any-gender row (X: -us), and only then the common/archaic row (C: -os)
    const form = (c) => ending(infl, `N ${decl} ${vr} ${c} S ${gender}`, s)[0] ?? ending(infl, `N ${decl} ${vr} ${c} S X`, s)[0] ?? ending(infl, `N ${decl} ${vr} ${c} S C`, s)[0];
    const nom = form('NOM') ?? s[0];
    const gen = form('GEN');
    const g = { M: 'm', F: 'f', N: 'n', C: 'c', X: '' }[gender] ?? '';
    return { pos, lemma: nom, gender: g, parts: [nom, gen && gen !== nom ? gen : null].filter(Boolean).join(', ') + (g ? ` (${g})` : '') };
  }
  if (posCode === 'V') {
    const [conj, vr, kind] = f;
    const dep = kind === 'DEP';
    const voice = dep ? 'PASSIVE' : 'ACTIVE';
    if (s[0] === 'capi') return { pos, lemma: 'capio', parts: 'capio, capere, cepi, captum', kind };
    if (s[0] === 'faci') return { pos, lemma: 'facio', parts: 'facio, facere, feci, factum', kind };
    const first = ending(infl, `V ${conj} ${vr} PRES ${voice} IND 1 S`, s)[0] ?? s[0];
    const inf = ending(infl, `V ${conj} ${vr} PRES ${voice} INF 0 X`, s)[0];
    const perf = !dep && s[2] ? ending(infl, `V ${conj} ${vr} PERF ACTIVE IND 1 S`, s)[0] : null;
    const ppp = s[3] ? (dep || kind === 'SEMIDEP' ? `${s[3]}us sum` : `${s[3]}um`) : null;
    return { pos, lemma: first, parts: [first, inf, perf, ppp].filter(Boolean).join(', '), kind };
  }
  if (posCode === 'ADJ') {
    const [decl, vr, degree] = f;
    if (degree && degree !== 'POS' && degree !== 'X') return null;           // comparatives and superlatives belong to their positive
    const g = (c, gender) => ending(infl, `ADJ ${decl} ${vr} ${c} S ${gender}`, s)[0];
    const m = g('NOM', 'M'), fe = g('NOM', 'F'), n = g('NOM', 'N');
    if (m && fe && n) return { pos, lemma: m, parts: `${m}, ${fe}, ${n}` };
    const x = g('NOM', 'X') ?? g('NOM', 'M') ?? s[0];
    const gen = g('GEN', 'X') ?? g('GEN', 'M');
    // -is, -e adjectives (omnis, fortis): Whitaker keeps the bare stem as its first stem
    if (decl === '3' && gen === `${x}is` && !/(er|or|ns|x|s)$/.test(x)) return { pos, lemma: gen, parts: `${gen}, ${gen.slice(0, -2)}e` };
    return { pos, lemma: x, parts: gen ? `${x}, ${gen}` : x };
  }
  if (posCode === 'PRON' || posCode === 'PACK') {
    // Whitaker stores pronoun stems (h-, ill-, qu-), not headwords
    const lemma = PRONOUN_HEADWORD[s[0]];
    return lemma ? { pos: 'pron', lemma, parts: lemma } : null;
  }
  if (posCode === 'PREP') return { pos, lemma: s[0], parts: `${s[0]} (+${f[0] === 'ABL' ? 'abl.' : 'acc.'})` };
  return { pos, lemma: s[0], parts: s[0] };
}

/** Whitaker's meaning field -> a short English gloss: first few senses, no notes in [brackets]. */
function cleanGloss(raw, pos) {
  // drop notes meant for grammarians: (by GENDER/NUMBER), (A+G), (also DEMONST), (w/-dam)
  // (Whitaker writes a space inside a phrase as an underscore: the_other)
  let t = raw.replace(/_/g, ' ').replace(/\(\s*(?:[A-Z+\/ ]{3,}|also [A-Z]+|A\+G|w\/[^)]*)\s*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\|/g, '').replace(/\s+/g, ' ').trim().replace(/;\s*$/, '');
  const senses = t.split(/\s*;\s*/).filter(Boolean);
  let out = '';
  for (const sense of senses) {
    const next = out ? `${out}; ${sense}` : sense;
    if (next.length > 60 && out) break;
    out = next;
  }
  out = out.replace(/\s*\(\s*\)/g, '').replace(/[,.;:]+$/, '').trim();
  if (out.length > 80) out = out.slice(0, 77).replace(/[ ,;(]+\S*$/, '') + '…';
  if (pos === 'verb' && out && !/^(to |be |is )/.test(out)) out = `to ${out}`;
  return out;
}

// ---------- treebank counts ----------

async function loadCounts() {
  const counts = new Map();
  for (const id of TREEBANKS) {
    const xml = await readFile(path.join(CACHE, `${id}.xml`), 'utf8');
    for (const m of xml.matchAll(/<word\b[^>]*>/g)) {
      const lemma = /lemma="([^"]*)"/.exec(m[0])?.[1];
      const tag = /postag="([^"]*)"/.exec(m[0])?.[1] ?? '';
      if (!lemma || tag.startsWith('u') || !tag) continue;
      const k = sameKey(lemma.replace(/\d+$/, '').replace(/^-/, ''));
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return counts;
}

// ---------- building ----------

const readJsonFile = async (p, fallback) => { try { return JSON.parse(await readFile(path.join(ROOT, p), 'utf8')); } catch { return fallback; } };

export async function buildVocab({ top = 5000 } = {}) {
  const infl = await loadInflections();
  const dict = await loadDictionary(infl);
  const counts = await loadCounts();
  const lexicon = await loadLexicon((f) => readJsonFile(f));

  // merge entries that are the same word (same spelling and part of speech): senses are joined
  const merged = new Map();
  for (const e of dict) {
    const k = `${sameKey(e.lemma)}|${e.pos}`;
    const have = merged.get(k);
    if (!have) { merged.set(k, { ...e }); continue; }
    have.tier = Math.min(have.tier, e.tier);
    if (!have.gloss.includes(e.gloss) && have.gloss.length + e.gloss.length < 70) have.gloss += `; ${e.gloss}`;
  }
  // words from vocab-musthave.txt rank ahead of everything else (they sort by treebank count among themselves)
  const must = new Set((await readFile(path.join(ROOT, 'tools', 'vocab-musthave.txt'), 'utf8')).split(/\r?\n/).filter((l) => !l.startsWith('#')).join(' ').split(/\s+/).filter(Boolean).map(sameKey));
  const words = [...merged.values()].map((e) => ({ ...e, count: counts.get(sameKey(e.lemma)) || 0, tier: must.has(sameKey(e.lemma)) ? -1 : e.tier }));
  // Order: the must-haves; then words the treebank meets at least three times (real evidence, whatever Whitaker's tier says),
  // most frequent first; then everything else by Whitaker's tier. The words the treebank never meets are the weak part of
  // the list, so they go shortest first (short words are commoner: Zipf) and then in a fixed scramble, since an
  // alphabetical tie-break would cut the list off at some letter.
  const scramble = (w) => { let x = 2166136261; for (const c of sameKey(w)) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
  const group = (w) => (w.tier < 0 ? 0 : w.count >= EVIDENCE ? 1 : 2);
  words.sort((a, b) => group(a) - group(b)
    || (group(a) < 2 ? b.count - a.count : a.tier - b.tier)
    || sameKey(a.lemma).length - sameKey(b.lemma).length || scramble(a.lemma) - scramble(b.lemma));

  // Hand-made words the dictionary cannot match (irregular ones: sum, possum, eō, ferō; forms used as words: nōbīs, hoc)
  // are very common by nature, so they go first, most frequent in the treebank first. Names are not vocabulary to drill.
  const known = new Set(words.map((e) => `${sameKey(e.lemma)}|${e.pos}`));
  const isName = (e) => (e.tags || []).includes('name');
  const handMade = (e) => (!e.vocabOnly || e.pin) && !isName(e);   // supplement words (pin: true) are written by hand too
  const pinned = lexicon.filter((e) => handMade(e) && !known.has(`${sameKey(e.lemma)}|${e.pos}`))
    .map((e) => ({ id: e.id, count: counts.get(sameKey(e.lemma)) || 0 }))
    .sort((a, b) => b.count - a.count);
  const chosen = words.slice(0, Math.max(0, top - pinned.length));

  // words already in the lexicon keep their entry; the rest become new gloss-only entries
  const byKey = new Map(lexicon.map((e) => [`${sameKey(e.lemma)}|${e.pos}`, e]));
  const usedIds = new Set(lexicon.map((e) => e.id));
  const order = (await readJsonFile('content/vocab/order.json', []));
  const inOrder = new Set(order);
  const fresh = [];
  for (const p of pinned) if (!inOrder.has(p.id)) { order.push(p.id); inOrder.add(p.id); }
  for (const w of chosen) {
    const have = byKey.get(`${sameKey(w.lemma)}|${w.pos}`);
    if (have) { if (!inOrder.has(have.id)) { order.push(have.id); inOrder.add(have.id); } continue; }
    let id = slug(w.lemma), n = 1;
    if (usedIds.has(id)) id = `${slug(w.lemma)}-${w.pos}`;
    while (usedIds.has(id)) id = `${slug(w.lemma)}-${w.pos}-${++n}`;
    usedIds.add(id);
    const entry = { id, lemma: w.lemma, pos: w.pos, gloss: w.gloss, parts: w.parts, vocabOnly: true };
    if (w.gender) entry.gender = w.gender;
    entry.rank = order.length + 1;
    fresh.push(entry);
    order.push(id);
    inOrder.add(id);
  }

  // a hand-made word that fell outside the top of the list is still a word you meet in sentences: list it at the end
  for (const e of lexicon) if (handMade(e) && !inOrder.has(e.id)) { order.push(e.id); inOrder.add(e.id); }

  // write new entries into band files by rank (append to a band that already exists)
  const bands = new Map();
  for (const e of fresh) {
    const k = Math.ceil(e.rank / BAND);
    delete e.rank;
    if (!bands.has(k)) bands.set(k, []);
    bands.get(k).push(e);
  }
  const files = await readJsonFile('content/lexicon/index.json', ['core.json']);
  for (const [k, list] of bands) {
    const name = `band-${k}.json`;
    const existing = await readJsonFile(`content/lexicon/${name}`, []);
    await writeFile(path.join(ROOT, 'content/lexicon', name), JSON.stringify([...existing, ...list], null, 0).replace(/\},\{/g, '},\n{').replace(/^\[/, '[\n').replace(/\]$/, '\n]') + '\n');
    if (!files.includes(name)) files.push(name);
  }
  await writeFile(path.join(ROOT, 'content/lexicon/index.json'), JSON.stringify(files) + '\n');
  await mkdir(path.join(ROOT, 'content/vocab'), { recursive: true });
  await writeFile(path.join(ROOT, 'content/vocab/order.json'), JSON.stringify(order).replace(/","/g, '",\n"').replace(/^\[/, '[\n').replace(/\]$/, '\n]') + '\n');
  return { added: fresh.length, ordered: order.length, candidates: words.length };
}

async function report() {
  const lexicon = await loadLexicon((f) => readJsonFile(f));
  const order = await readJsonFile('content/vocab/order.json', []);
  const byId = new Map(lexicon.map((e) => [e.id, e]));
  const pos = {};
  const odd = [];
  for (const id of order) {
    const e = byId.get(id);
    pos[e.pos] = (pos[e.pos] || 0) + 1;
    if (e.pos === 'pron' || !/^[a-z]/i.test(e.lemma) || e.lemma.length < 2 && !['a', 'e', 'o'].includes(e.lemma)) odd.push(`${id}: ${e.lemma} (${e.pos})`);
  }
  const counts = await loadCounts();
  const seen = order.filter((id) => (counts.get(sameKey(byId.get(id).lemma)) || 0) >= EVIDENCE).length;
  const lastSeen = order.map((id) => (counts.get(sameKey(byId.get(id).lemma)) || 0) >= EVIDENCE).lastIndexOf(true) + 1;
  console.log(`${order.length} words in order.json, ${lexicon.length} lexicon entries.`);
  console.log(`${seen} of them are met ${EVIDENCE}+ times in the treebank (the last at rank ${lastSeen}); the rest are ordered by Whitaker's tier alone.\nBy part of speech:`, pos);
  console.log(`Check by hand (pronouns and odd spellings): ${odd.length}\n  ${odd.slice(0, 30).join('\n  ')}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'fetch') return fetchAll();
  if (cmd === 'build') {
    if (!existsSync(path.join(CACHE, 'DICTLINE.GEN'))) { console.error('Run "node tools/vocab.mjs fetch" first.'); process.exit(1); }
    const at = rest.indexOf('--top');
    const r = await buildVocab({ top: at >= 0 ? Number(rest[at + 1]) : 5000 });
    console.log(`Added ${r.added} new words; ${r.ordered} words in order.json (from ${r.candidates} candidates).`);
    return;
  }
  if (cmd === 'report') return report();
  console.error('Usage: node tools/vocab.mjs fetch | build [--top N] | report');
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
