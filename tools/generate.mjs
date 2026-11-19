// Sentence generator. Run:  node tools/generate.mjs            (rebuild every generated unit)
//                           node tools/generate.mjs --sample <templateId> [n]   (print samples, write nothing)
//
// Reads  content/<pack>/gen/*.json   (a unit description plus sentence templates)
// Writes content/<pack>/u<id>.json   (ordinary unit files, exactly like hand-written ones)
//        and adds/updates the unit's entry in content/<pack>/pack.json.
//
// A template describes one sentence pattern with slots filled from the lexicon:
//   slots   pool slots   {"pos":"noun","where":{"tags":["person"]},"form":"nom.{sn}"}
//           choice slots {"choice":["sg","pl"]}  or objects: {"choice":[{"la":"ad","case":"acc","en":"to"}]}
//   chunks  Latin chunk patterns ("{t}", "ad {p}"); every ordering of the chunks is accepted
//   en      English pattern ("{t} I {v} {o:a}.")
//   Everything else (distractors, explanations, ids) is derived. See README, "Generated content".
//
// Distractors are built by changing ONE thing in the correct sentence (the form of one word, one word
// for another, a preposition) and explaining the change, so every wrong option teaches something.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateForms, normLoose, featureLabel, labelOf } from '../js/engine/latin.js';
import { prepareItem } from '../js/engine/items.js';
import { renderNoun, renderVerb, capitalise } from './gen/english.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

// ---------- small utilities ----------

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const shuffle = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- lexicon ----------

let LEX = null;
export function loadLexicon(list) {
  LEX = list.map((e) => {
    const forms = generateForms(e);
    // indeclinable words answer to any key
    const withFallback = forms.indecl === undefined ? forms
      : new Proxy(forms, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? t.indecl : undefined) });
    return { ...e, forms: withFallback };
  });
  LEX.byId = new Map(LEX.map((e) => [e.id, e]));
}

const isPluralKey = (k) => /(^|\.)pl(\.|$)/.test(k) || /pl$/.test(k);
/** Mass nouns ("bread", "money") and names have no sensible plural in English; keep them singular. */
const formOk = (e, key) => !((e.en?.mass || e.en?.name) && isPluralKey(key) && e.pos === 'noun');

const tagsOf = (e) => e.tags || [];
const anyTag = (e, tags) => tags.some((t) => tagsOf(e).includes(t));

// ---------- pattern substitution ----------

const PAT = /\{([A-Za-z0-9_]+)(?:\.([A-Za-z]+))?(?::([A-Za-z]+))?\}/g;

function meta(info, prop) {
  if (info.choice !== undefined) {
    if (typeof info.choice === 'object') return String(info.choice[prop] ?? '');
    return String(info.choice);
  }
  switch (prop) {
    case undefined: return info.la;
    case 'lemma': return info.entry.lemma;
    case 'gloss': return info.entry.gloss;
    case 'gender': return info.entry.gender ?? '';
    case 'id': return info.entry.id;
    case 'key': return info.key;
    case 'label': return featureLabel(info.key);
    case 'num': return /\.pl/.test(info.key) || /pl$/.test(info.key) ? 'plural' : 'singular';
    case 'case': return labelOf(info.key.split('.')[0]);
    case 'en': return info.en();
    case 'base': return renderVerb(info.entry, info.key, 'base');
    default: throw new Error(`unknown slot property .${prop}`);
  }
}

/** Substitute a pattern. ctx 'la' -> Latin text; 'en' -> English (with :mode); 'ex' -> Latin plus .props */
function fill(pattern, infos, ctx) {
  return pattern.replace(PAT, (_, name, prop, mode) => {
    const info = infos[name];
    if (!info) throw new Error(`pattern "${pattern}" uses unknown slot {${name}}`);
    if (ctx === 'en') return prop ? meta(info, prop) : info.en(mode);
    if (info.choice !== undefined) return meta(info, prop ?? 'la');
    return prop ? meta(info, prop) : info.la;
  });
}

// ---------- slot resolution ----------

/** Resolve a form-key / tag pattern like "nom.{sn}.{s.gender}" against slots resolved so far. */
function fillKey(pattern, infos) {
  return pattern.replace(PAT, (_, name, prop) => {
    const info = infos[name];
    if (!info) throw new Error(`key pattern "${pattern}" uses {${name}} before it is defined`);
    return info.choice !== undefined ? (typeof info.choice === 'object' ? String(info.choice[prop ?? 'value']) : String(info.choice)) : meta(info, prop);
  });
}

function makeInfo(slot, value, keyOverride, infos) {
  if (slot.choice) {
    const c = value;
    const la = typeof c === 'object' ? c.la ?? '' : String(c);
    const en = typeof c === 'object' ? c.en ?? '' : '';
    return { choice: c, la, en: () => en, key: null };
  }
  const entry = value;
  const key = keyOverride ?? fillKey(slot.form ?? 'indecl', infos);
  const la = entry.forms[key];
  if (la === undefined) return null;
  const num = /(^|\.)pl(\.|$)/.test(key) || /pl$/.test(key) ? 'pl' : 'sg';
  let en;
  if (entry.pos === 'noun' || entry.pos === 'pron') en = (mode) => renderNoun(entry, num, mode ?? slot.en ?? 'the');
  else if (entry.pos === 'verb') en = (mode) => renderVerb(entry, key, mode ?? slot.en ?? 'group');
  else en = () => (typeof entry.en === 'string' ? entry.en : entry.gloss);
  return { entry, key, la, en };
}

/** Compute every slot's info in order. `picks`: slot -> entry/choice; `over`: slot -> key override. */
function buildInfos(tpl, picks, over = {}) {
  const infos = {};
  for (const [name, slot] of Object.entries(tpl.slots)) {
    const info = makeInfo(slot, picks[name], over[name], infos);
    if (!info) return null;
    infos[name] = info;
  }
  return infos;
}

function poolFor(slot, tpl, infos, picks, { ignoreFits = false } = {}) {
  if (slot.choice) return slot.choice;
  if (slot.same) return [picks[slot.same]]; // the same word as another slot, in a different form
  const w = slot.where || {};
  const subst = (list) => (list || []).map((t) => fillKey(t, infos));
  const tags = subst(w.tags);
  const allTags = subst(w.allTags);
  const notTags = subst(w.notTags);
  let fitTags = null;
  if (slot.fits && !ignoreFits) fitTags = picks[slot.fits][slot.fitsOn || 'obj'] || [];
  const key = slot.form ? fillKey(slot.form, infos) : 'indecl';
  return LEX.filter((e) => {
    if (e.pos !== slot.pos) return false;
    if (w.ids && !w.ids.includes(e.id)) return false;
    if (tags.length && !anyTag(e, tags)) return false;
    if (allTags.length && !allTags.every((t) => tagsOf(e).includes(t))) return false;
    if (notTags.length && anyTag(e, notTags)) return false;
    if (w.decl !== undefined && ![].concat(w.decl).includes(e.decl)) return false;
    if (w.gender && e.gender !== w.gender) return false;
    if (fitTags && !anyTag(e, fitTags)) return false;
    if (slot.differ && picks[slot.differ]?.id === e.id) return false;
    if (w.notIds && w.notIds.includes(e.id)) return false;
    if (w.mass && !e.en?.mass) return false;
    if (w.hasObj && !(e.obj || []).length) return false;
    if (w.dat && !e.dat) return false;
    if (w.noObj && (e.obj || []).length) return false;
    if (e.forms[key] === undefined || !formOk(e, key)) return false;
    if (slot.pos === 'verb' && !e.en && !e.gloss) return false;
    return true;
  });
}

// ---------- rendering one assignment ----------

function renderChunks(tpl, infos, altsFor = null) {
  // each chunk pattern, or list of alternative patterns -> list of alternative strings
  return tpl.chunks.map((c) => {
    const alts = (Array.isArray(c) ? c : [c]).map((p) => fill(p, infos, 'la'));
    // slots offering alternative forms (adjective gender for a speaker, ...)
    if (altsFor) {
      for (const p of Array.isArray(c) ? c : [c]) {
        for (const name of [...p.matchAll(PAT)].map((m) => m[1])) {
          const slot = tpl.slots[name];
          for (const k of slot?.alts || []) {
            const alt = infos[name].entry?.forms[fillKey(k, infos)];
            if (alt !== undefined) alts.push(fill(p, { ...infos, [name]: { ...infos[name], la: alt } }, 'la'));
          }
        }
      }
    }
    return [...new Set(alts)];
  });
}

const canonical = (chunkAlts, end) => cap(chunkAlts.map((a) => a[0]).join(' ')) + end;

function englishOf(tpl, infos) {
  const sentence = (tpl.en ? fill(tpl.en, infos, 'en') : '').replace(/\s+/g, ' ').replace(/ ([,.!?])/g, '$1').trim();
  return cap(sentence);
}

// ---------- distractors ----------

const noStop = (t) => t.replace(/\.+$/, '');

function roleText(tpl, name, infos, goodKey) {
  const role = tpl.roles?.[name];
  if (role) return fill(role, infos, 'ex');
  return `this word needs the ${labelOf(goodKey.split('.')[0])} case`;
}

function describeKeyChange(tpl, name, infos, badInfos, goodKey, badKey) {
  const slot = tpl.slots[name];
  const good = infos[name].la;
  const bad = badInfos[name].la;
  const lemma = infos[name].entry.lemma;
  // agreement between a subject and its verb
  if (tpl.subject && infos[tpl.verb ?? 'v']) {
    const subj = tpl.subject;
    const verbSlot = tpl.verb ?? 'v';
    if (name === subj) {
      if (badKey.split('.')[0] !== goodKey.split('.')[0]) {
        return `_${bad}_ is ${featureLabel(badKey)}, but ${roleText(tpl, name, infos, goodKey)}: _${good}_.`;
      }
      return `_${bad}_ is ${featureLabel(badKey)}, but the verb _${infos[verbSlot].la}_ is ${featureLabel(infos[verbSlot].key)}: subject and verb must agree. Here the subject must be _${good}_.`;
    }
    if (name === verbSlot) {
      // same person and number, different tense or word form: not an agreement mistake
      if (badKey.split('.').pop() === goodKey.split('.').pop()) return null;
      return `_${bad}_ is ${featureLabel(badKey)}, but the subject _${infos[subj].la}_ is ${featureLabel(infos[subj].key)}: subject and verb must agree. Here you need _${good}_.`;
    }
  }
  return null;
}

function makeDistractors(tpl, picks, infos, goodEn, accepted, rng) {
  const goodLa = canonical(renderChunks(tpl, infos), tpl.end ?? '.');
  const end = tpl.end ?? '.';
  const candidates = { verb: [], noun: [], swap: [] };
  const seen = new Set([normLoose(goodLa), ...accepted]);
  const add = (group, over, newPicks, reasonFn) => {
    const bi = buildInfos(tpl, newPicks, over);
    if (!bi) return;
    const la = canonical(renderChunks(tpl, bi), end);
    const n = normLoose(la);
    if (seen.has(n)) return;
    const en = englishOf(tpl, bi);
    if (en === goodEn) {
      // same English: only a form/case mistake. Needs a role explanation, not a meaning.
    }
    candidates[group].push({ la, n, bi, en, reasonFn });
  };

  for (const [name, slot] of Object.entries(tpl.slots)) {
    if (slot.noFoil) continue;
    const info = infos[name];
    if (slot.choice) {
      // swap one choice (e.g. a different preposition), re-deriving dependent forms
      if (typeof info.choice !== 'object' || slot.swap === false) continue;
      for (const c of slot.choice) {
        if (c === info.choice) continue;
        add('swap', {}, { ...picks, [name]: c }, (bi) => `_${bi[name].la}_ means “${bi[name].en()}”, so this says “${noStop(englishOf(tpl, bi))}”.`);
      }
      continue;
    }
    const entry = info.entry;
    const keys = Object.keys(entry.forms);
    // (1) other forms of the same word
    const foilKeys = (slot.foils ? slot.foils.map((k) => fillKey(k, infos)) : defaultFoils(info.key, keys));
    for (const k of foilKeys) {
      if (k === info.key || entry.forms[k] === undefined || !formOk(entry, k)) continue;
      const group = entry.pos === 'verb' ? 'verb' : 'noun';
      add(group, { [name]: k }, picks, (bi) => {
        const agree = describeKeyChange(tpl, name, infos, bi, info.key, k);
        if (agree) return agree;
        const en = englishOf(tpl, bi);
        if (entry.pos === 'verb' && en === goodEn) {
          return `_${bi[name].la}_ is ${featureLabel(k)} of _${entry.lemma}_ (“${renderVerb(entry, k, 'full')}”), but here you need ${featureLabel(info.key)}: _${info.la}_.`;
        }
        if (entry.pos === 'verb') {
          return `_${bi[name].la}_ is ${featureLabel(k)} of _${entry.lemma}_ (“${renderVerb(entry, k, 'full')}”). That would say “${noStop(en)}” instead of “${noStop(goodEn)}”.`;
        }
        if (en !== goodEn) return `_${bi[name].la}_ is ${featureLabel(k)}, which would say “${noStop(en)}”. Here you need _${info.la}_.`;
        return `_${bi[name].la}_ is ${featureLabel(k)}, but ${roleText(tpl, name, infos, info.key)}: _${info.la}_.`;
      });
    }
    // (2) another word of the same kind
    const swapSlot = slot.swapWhere ? { ...slot, where: slot.swapWhere, fits: undefined } : { ...slot, fits: undefined };
    const others = poolFor(swapSlot, tpl, infos, picks, { ignoreFits: true }).filter((e) => e.id !== entry.id);
    for (const e of shuffle(others, rng).slice(0, 6)) {
      add('swap', {}, { ...picks, [name]: e }, (bi) => {
        const en = noStop(englishOf(tpl, bi));
        return `_${bi[name].la}_ means “${bi[name].en('bare')}”, so this says “${en}”.`;
      });
    }
  }

  // choose: one verb-form foil, one noun-form foil, one swap, then anything
  const chosen = [];
  const take = (list) => {
    const options = list.filter((c) => !chosen.some((x) => x.n === c.n));
    if (options.length) chosen.push(pick(options, rng));
  };
  take(candidates.verb);
  take(candidates.noun);
  take(candidates.swap);
  const rest = shuffle([...candidates.verb, ...candidates.noun, ...candidates.swap], rng);
  for (const c of rest) { if (chosen.length >= 3) break; if (!chosen.some((x) => x.n === c.n)) chosen.push(c); }
  if (chosen.length < 3) return null;
  return shuffle(chosen.slice(0, 3), rng).map((c) => [c.la, c.reasonFn(c.bi)]);
}

/** Sensible alternative keys to offer as wrong forms. */
function defaultFoils(key, allKeys) {
  const parts = key.split('.');
  const out = [];
  if (/^(pres|impf|fut|perf)\.ind\.act\./.test(key)) {
    const [tense, , , person] = parts;
    const p = person;
    for (const t of ['pres', 'impf', 'fut', 'perf']) if (t !== tense) out.push(`${t}.ind.act.${p}`);
    for (const q of ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl']) if (q !== p) out.push(`${tense}.ind.act.${q}`);
    return out.filter((k) => allKeys.includes(k));
  }
  if (/^imp\.act\./.test(key)) return ['imp.act.2sg', 'imp.act.2pl', 'pres.ind.act.2sg'].filter((k) => allKeys.includes(k));
  if (parts.length >= 2 && ['sg', 'pl'].includes(parts[1])) {
    const [c, n, ...rest] = parts;
    const suffix = rest.length ? '.' + rest.join('.') : '';
    for (const cc of ['nom', 'gen', 'dat', 'acc', 'abl']) if (cc !== c) out.push(`${cc}.${n}${suffix}`);
    out.push(`${c}.${n === 'sg' ? 'pl' : 'sg'}${suffix}`);
    return out.filter((k) => allKeys.includes(k));
  }
  return [];
}

// ---------- generating items ----------

const usageKey = (name, p) => `${name}:${p?.id ?? (typeof p === 'object' ? JSON.stringify(p) : p)}`;

function generateTemplate(tpl, ctx) {
  const rng = mulberry32(hash(tpl.id));
  const usage = new Map();
  const items = [];
  const n = tpl.n ?? 12;
  const names = Object.keys(tpl.slots);
  for (let attempt = 0; attempt < n * 80 && items.length < n; attempt++) {
    const picks = {};
    let infos = {};
    let ok = true;
    for (const name of names) {
      const slot = tpl.slots[name];
      const pool = poolFor(slot, tpl, infos, picks);
      if (!pool.length) { ok = false; break; }
      const cost = (c) => usage.get(usageKey(name, c)) ?? 0;
      const min = Math.min(...pool.map(cost));
      picks[name] = pick(pool.filter((c) => cost(c) === min), rng);
      const info = makeInfo(slot, picks[name], undefined, infos);
      if (!info) { ok = false; break; }
      infos[name] = info;
    }
    if (!ok) continue;

    const chunkAlts = renderChunks(tpl, infos, true);
    const end = tpl.end ?? '.';
    const la = canonical(chunkAlts, end);
    const q = tpl.q ? cap(fill(tpl.q, infos, 'la')) + (tpl.q.endsWith('?') ? '' : '?') : null;
    const dedupeKey = normLoose(la) + '|' + (q ? normLoose(q) : '');
    if (ctx.seenLa.has(dedupeKey)) continue;
    const enA = englishOf(tpl, infos);
    const enQ = tpl.enQ ? cap(fill(tpl.enQ, infos, 'en')).replace(/\s+/g, ' ') : null;
    const enFull = q ? `“${enQ}” “${enA}”` : enA;
    if (ctx.seenEn.has(enFull.toLowerCase())) continue;

    const raw = { chunks: chunkAlts.map((a) => (a.length > 1 ? a : a[0])), end };
    const accepted = prepareItem({ id: 'x', ...raw, la: undefined }).accepted.map(normLoose);
    const distractors = makeDistractors(tpl, picks, infos, enA, new Set(accepted), rng);
    if (!distractors) continue;

    // choose the blank
    const fills = [].concat(tpl.fill ?? tpl.verb ?? 'v');
    const fillName = fills[items.length % fills.length];
    // a verb with -ne attached ("Edisne") is blanked as one word
    const neSlots = new Set(tpl.chunks.flat().flatMap((pt) => [...pt.matchAll(/\{(\w+)\}ne\b/g)].map((m) => m[1])));
    const fillWord = infos[fillName].la + (neSlots.has(fillName) ? 'ne' : '');
    if (/\s/.test(fillWord) || !la.toLowerCase().includes(fillWord.toLowerCase())) continue;

    const item = { id: null, review: 'unreviewed', gen: tpl.id };
    if (q) item.q = q;
    if (tpl.sit) item.sit = fill(tpl.sit, infos, 'en');
    item.en = enFull;
    item.chunks = raw.chunks;
    if (end !== '.') item.end = end;
    item.fill = fillWord;
    const altForms = (tpl.slots[fillName].alts || []).map((k) => infos[fillName].entry?.forms[fillKey(k, infos)]).filter((x) => x && x !== fillWord);
    if (altForms.length) item.fillAlt = altForms;
    item.skills = tpl.skills;
    item.tag = fill(tpl.tag, infos, 'ex');
    item.explain = fill(tpl.explain, infos, 'ex');
    item.distractors = distractors;
    if (tpl.modern) { item.modern = true; item.modernNote = tpl.modernNote; }

    ctx.seenLa.add(dedupeKey);
    ctx.seenEn.add(enFull.toLowerCase());
    for (const [name, p] of Object.entries(picks)) usage.set(usageKey(name, p), (usage.get(usageKey(name, p)) ?? 0) + 1);
    item._la = la;
    items.push(item);
  }
  if (items.length < Math.min(n, tpl.minItems ?? 4)) {
    throw new Error(`template ${tpl.id}: could only build ${items.length} of ${n} items`);
  }
  return items;
}

function interleave(lists) {
  const out = [];
  const max = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

/**
 * Build one unit. `kept` are sentences already shipped from an earlier run: they are never changed or dropped
 * (so saved progress stays valid), and templates only generate the sentences still missing to reach their `n`.
 */
export async function generateUnit(packId, gen, otherItems, kept = []) {
  const laOf = (i) => normLoose(i.la ?? i.chunks?.map((c) => (Array.isArray(c) ? c[0] : c)).join(' ') + (i.end ?? '.')) + '|' + (i.q ? normLoose(i.q) : '');
  const ctx = {
    seenLa: new Set([...otherItems, ...kept].map(laOf)),
    seenEn: new Set([...otherItems, ...kept].map((i) => i.en.toLowerCase())),
  };
  const tplIds = new Set(gen.templates.map((t) => t.id));
  const keep = kept.filter((i) => tplIds.has(i.gen));
  const have = (id) => keep.filter((i) => i.gen === id).length;
  const lists = gen.templates.map((tpl) => (tpl.n - have(tpl.id) > 0 ? generateTemplate({ ...tpl, n: tpl.n - have(tpl.id) }, ctx) : []));
  // an ordered unit (a narration script) keeps its templates in the order written; others are mixed
  const fresh = gen.unit.ordered ? lists.flat() : interleave(lists);
  const usedIds = new Set(keep.map((i) => i.id));
  fresh.forEach((it) => {
    let h = hash(normLoose(it._la) + (it.q ? normLoose(it.q) : '')).toString(36).padStart(6, '0').slice(0, 6);
    while (usedIds.has(`${packId}.${gen.unit.id}.${h}`)) h = hash(h + 'x').toString(36).slice(0, 6);
    it.id = `${packId}.${gen.unit.id}.${h}`;
    usedIds.add(it.id);
    delete it._la;
  });
  const all = [...keep, ...fresh];
  if (gen.unit.ordered) {
    const rank = (it) => gen.templates.findIndex((t) => t.id === it.gen);
    return all.map((it, i) => ({ it, i })).sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i).map((x) => x.it);
  }
  return all;
}

// ---------- command line ----------

async function main() {
  loadLexicon(await readJson('content/lexicon.json'));
  const args = process.argv.slice(2);
  const sampleAt = args.indexOf('--sample');
  const packs = (await readdir(path.join(ROOT, 'content'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  let total = 0;
  for (const packId of packs) {
    const genDir = path.join(ROOT, 'content', packId, 'gen');
    let files;
    try { files = (await readdir(genDir)).filter((f) => f.endsWith('.json')).sort(); } catch { continue; }
    const packPath = `content/${packId}/pack.json`;
    const pack = await readJson(packPath);
    // items from all other (hand-written or generated) units of the pack, for de-duplication
    const readUnitItems = async (file) => { try { return await readJson(`content/${packId}/${file}`); } catch { return []; } };
    for (const f of files) {
      const gen = JSON.parse(await readFile(path.join(genDir, f), 'utf8'));
      const unitFile = `u${gen.unit.id}.json`;
      const others = [];
      for (const u of pack.units) if (u.file !== unitFile) others.push(...(await readUnitItems(u.file)));
      if (sampleAt >= 0) {
        const want = args[sampleAt + 1];
        const t = gen.templates.find((x) => x.id === want);
        if (!t) continue;
        const count = Number(args[sampleAt + 2] ?? 8);
        const items = await generateUnit(packId, { ...gen, templates: [{ ...t, n: count }] }, others);
        for (const it of items) {
          console.log((it.q ? `${it.q}  ->  ` : '') + it.chunks.map((c) => (Array.isArray(c) ? c[0] : c)).join(' ') + (it.end ?? '.') + '\n   EN: ' + it.en + `\n   fill: ${it.fill}   tag: ${it.tag}\n   explain: ${it.explain}`);
          for (const d of it.distractors) console.log(`   x ${d[0]}   (${d[1]})`);
        }
        return;
      }
      let kept = [];
      if (!args.includes('--fresh')) kept = await readUnitItems(unitFile);
      const items = await generateUnit(packId, gen, others, kept);
      await writeFile(path.join(ROOT, 'content', packId, unitFile), '[\n' + items.map((i) => '  ' + JSON.stringify(i)).join(',\n') + '\n]\n');
      const entry = { id: gen.unit.id, file: unitFile, title: gen.unit.title, blurb: gen.unit.blurb, intro: gen.unit.intro, generated: true, ...(gen.unit.narrate ? { narrate: true } : {}) };
      const at = pack.units.findIndex((u) => u.id === gen.unit.id);
      if (at >= 0) pack.units[at] = entry; else pack.units.push(entry);
      console.log(`${packId}.${gen.unit.id} ${gen.unit.title}: ${items.length} sentences (${items.length - kept.filter((k) => gen.templates.some((t) => t.id === k.gen)).length} new)`);
      total += items.length;
    }
    // units are taught in numeric order, whatever order the files were read in
    pack.units.sort((a, b) => Number(a.id) - Number(b.id));
    if (sampleAt < 0) await writeFile(path.join(ROOT, packPath), JSON.stringify(pack, null, 2) + '\n');
  }
  if (sampleAt >= 0) console.log('no such template');
  else console.log(`generated ${total} sentences`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
