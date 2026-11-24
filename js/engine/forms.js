// Forms practice: "the genitive plural of hospes?", "3rd person plural, present, of amō?".
//
// These exercises are made on the fly from the lexicon (nothing is stored per form), for words you have studied that
// have full paradigms. A form item looks like any other item (so the session screen needs no special case), with
// `form: {cell}` and `word: <lexicon id>`. They are practice only: they update skill strength and log mistakes, but are
// not scheduled one by one (that would be thousands of review cards).

import { featureLabel, normLoose } from './latin.js';

export const FORM_PREFIX = 'form.';

// The cells worth drilling for each kind of word (the endings that carry the grammar), most useful first.
const CELLS = {
  noun: ['gen.sg', 'dat.sg', 'acc.sg', 'abl.sg', 'nom.pl', 'acc.pl', 'gen.pl', 'dat.pl', 'abl.pl'],
  verb: ['pres.ind.act.2sg', 'pres.ind.act.3sg', 'pres.ind.act.1pl', 'pres.ind.act.3pl', 'perf.ind.act.1sg', 'perf.ind.act.3sg',
    'perf.ind.act.3pl', 'fut.ind.act.1sg', 'fut.ind.act.3sg', 'impf.ind.act.3sg', 'impf.ind.act.1pl', 'pres.inf.act', 'imp.act.2sg', 'imp.act.2pl'],
  adj: ['nom.sg.f', 'nom.sg.n', 'gen.sg.m', 'acc.sg.m', 'acc.sg.f', 'abl.sg.m', 'nom.pl.m', 'nom.pl.f', 'gen.pl.m'],
};

/** The skill a cell belongs to (shown on the Progress page): "form.noun.gen", "form.verb.perf"... */
export function formSkill(pos, cell) {
  if (pos === 'noun') return `form.noun.${cell.split('.')[0]}`;
  if (pos === 'adj') return `form.adj.${cell.split('.')[0]}`;
  if (cell.startsWith('pres.inf')) return 'form.verb.inf';
  if (cell.startsWith('imp.')) return 'form.verb.imp';
  return `form.verb.${cell.split('.')[0]}`;
}

export const FORM_SKILLS = {
  'form.noun.nom': 'Noun forms: nominative', 'form.noun.gen': 'Noun forms: genitive', 'form.noun.dat': 'Noun forms: dative',
  'form.noun.acc': 'Noun forms: accusative', 'form.noun.abl': 'Noun forms: ablative',
  'form.adj.nom': 'Adjective forms: nominative', 'form.adj.gen': 'Adjective forms: genitive', 'form.adj.acc': 'Adjective forms: accusative',
  'form.adj.abl': 'Adjective forms: ablative', 'form.adj.dat': 'Adjective forms: dative',
  'form.verb.pres': 'Verb forms: present', 'form.verb.impf': 'Verb forms: imperfect', 'form.verb.fut': 'Verb forms: future',
  'form.verb.perf': 'Verb forms: perfect', 'form.verb.inf': 'Verb forms: infinitive', 'form.verb.imp': 'Verb forms: commands',
};

const seeded = (s) => { let a = 0; for (const c of s) a = Math.imul(a ^ c.charCodeAt(0), 16777619); return () => { a = Math.imul(a ^ (a >>> 15), a | 1); a ^= a + Math.imul(a ^ (a >>> 7), a | 61); return ((a ^ (a >>> 14)) >>> 0) / 4294967296; }; };

/** The drillable cells of a word: those it has, whose form differs from the other cells' (so the answer is unambiguous). */
export function cellsOf(content, lexId) {
  const e = content.index.lex.get(lexId);
  const f = content.index.forms.get(lexId);
  if (!e || !f || e.vocabOnly || !CELLS[e.pos]) return [];
  const seen = new Map();
  for (const [k, v] of Object.entries(f)) { const n = normLoose(v); seen.set(n, (seen.get(n) || 0) + 1); }
  return CELLS[e.pos].filter((c) => f[c] && seen.get(normLoose(f[c])) === 1);
}

/** The id of a form item ("form.<lexicon id>.<cell>") taken apart, or null. */
export function parseFormId(id) {
  if (!id.startsWith(FORM_PREFIX)) return null;
  const rest = id.slice(FORM_PREFIX.length);
  const dot = rest.indexOf('.');
  return dot < 0 ? null : { lexId: rest.slice(0, dot), cell: rest.slice(dot + 1) };
}

/** Build the item for one cell of one word, or null if the word has no such cell. */
export function formItem(content, lexId, cell) {
  const e = content.index.lex.get(lexId);
  const f = content.index.forms.get(lexId);
  if (!e || !f || !f[cell]) return null;
  const options = cellsOf(content, lexId).filter((c) => c !== cell);
  if (!options.includes('nom.sg') && f['nom.sg'] && e.pos === 'noun') options.push('nom.sg');
  const rng = seeded(`${lexId}.${cell}`);
  const wrong = [];
  const used = new Set([normLoose(f[cell])]);
  while (wrong.length < 3 && options.length) {
    const c = options.splice(Math.floor(rng() * options.length), 1)[0];
    const n = normLoose(f[c]);
    if (!f[c] || used.has(n)) continue;
    used.add(n);
    wrong.push([f[c], `_${f[c]}_ is the ${featureLabel(c)} of _${e.lemma}_, not the ${featureLabel(cell)}.`]);
  }
  if (wrong.length < 3) return null;
  const label = featureLabel(cell);
  return {
    id: `${FORM_PREFIX}${lexId}.${cell}`,
    word: lexId,
    form: { cell },
    pos: e.pos,
    la: f[cell],
    en: `${label[0].toUpperCase()}${label.slice(1)} of ${e.lemma} (${e.gloss})`,
    accepted: [f[cell]],
    fill: f[cell],
    fillAccepted: [f[cell]],
    skills: [formSkill(e.pos, cell)],
    tag: label,
    explain: `The ${label} of _${e.lemma}_ is _${f[cell]}_.`,
    distractors: wrong,
    review: 'unreviewed',
  };
}
