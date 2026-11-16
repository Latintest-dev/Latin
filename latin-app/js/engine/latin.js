// Latin text utilities, paradigm generation and the form index.
// Pure functions only: no DOM, no storage. Runs in the browser and in Node.

// ---------- Text normalisation ----------

const PUNCT = /[.,;:!?¿"'“”‘’()\[\]—–_*]/g;

/** Remove macrons (and breves) from a string. */
export function stripMacrons(s) {
  return s.normalize('NFD').replace(/[̄̆]/g, '').normalize('NFC');
}

/** Lowercase, no macrons, no punctuation, single spaces. Used for answer matching. */
export function normLoose(s) {
  return stripMacrons(s).toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
}

/** Like normLoose but keeps macrons (strict mode). */
export function normStrict(s) {
  return s.normalize('NFC').toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
}

export function tokensLoose(s) {
  const n = normLoose(s);
  return n ? n.split(' ') : [];
}

export function tokensStrict(s) {
  const n = normStrict(s);
  return n ? n.split(' ') : [];
}

// ---------- Paradigm generation ----------

const CASES = ['nom', 'gen', 'dat', 'acc', 'abl'];
const PERSONS = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];

// endings in case order: nom gen dat acc abl
const ND1 = { sg: ['a', 'ae', 'ae', 'am', 'ā'], pl: ['ae', 'ārum', 'īs', 'ās', 'īs'] };
const ND2M = { sg: ['us', 'ī', 'ō', 'um', 'ō'], pl: ['ī', 'ōrum', 'īs', 'ōs', 'īs'] };
const ND2N = { sg: ['um', 'ī', 'ō', 'um', 'ō'], pl: ['a', 'ōrum', 'īs', 'a', 'īs'] };
const ADJ = {
  m: ND2M,
  f: ND1,
  n: ND2N,
};

// present indicative active endings (1sg..3pl) and present infinitive
const CONJ = {
  1: { pres: ['ō', 'ās', 'at', 'āmus', 'ātis', 'ant'], inf: 'āre' },
  2: { pres: ['eō', 'ēs', 'et', 'ēmus', 'ētis', 'ent'], inf: 'ēre' },
  3: { pres: ['ō', 'is', 'it', 'imus', 'itis', 'unt'], inf: 'ere' },
  '3io': { pres: ['iō', 'is', 'it', 'imus', 'itis', 'iunt'], inf: 'ere' },
  4: { pres: ['iō', 'īs', 'it', 'īmus', 'ītis', 'iunt'], inf: 'īre' },
};

/**
 * Generate all forms of a lexicon entry as { featureKey: form }.
 * Regular paradigms come from rules; `forms` in the entry adds or overrides.
 *
 * Feature keys:
 *   noun        nom.sg, gen.pl, ...
 *   adjective   nom.sg.m, acc.pl.f, ...
 *   verb        pres.ind.act.1sg ... pres.inf.act
 *   indeclinable  indecl
 */
export function generateForms(e) {
  const f = {};
  if (e.pos === 'noun' && e.decl) {
    const tbl = e.decl === 1 ? ND1 : e.gender === 'n' ? ND2N : ND2M;
    const nums = e.number ? [e.number] : ['sg', 'pl'];
    for (const n of nums) CASES.forEach((c, i) => { f[`${c}.${n}`] = e.stem + tbl[n][i]; });
    if (e.nomSg && nums.includes('sg')) f['nom.sg'] = e.nomSg;
  } else if (e.pos === 'adj' && e.decl === '1-2') {
    for (const g of ['m', 'f', 'n']) {
      for (const n of ['sg', 'pl']) {
        CASES.forEach((c, i) => { f[`${c}.${n}.${g}`] = e.stem + ADJ[g][n][i]; });
      }
    }
  } else if (e.pos === 'verb' && e.conj) {
    const c = CONJ[e.conj];
    if (!c) throw new Error(`Unknown conjugation ${e.conj} for ${e.id}`);
    PERSONS.forEach((p, i) => { f[`pres.ind.act.${p}`] = e.stem + c.pres[i]; });
    f['pres.inf.act'] = e.stem + c.inf;
  }
  if (e.form) f.indecl = e.form;
  if (e.forms) Object.assign(f, e.forms);
  return f;
}

// ---------- Feature labels ----------

const LABEL = {
  nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', abl: 'ablative', loc: 'locative',
  sg: 'singular', pl: 'plural', m: 'masculine', f: 'feminine', n: 'neuter',
  '1sg': '1st person singular', '2sg': '2nd person singular', '3sg': '3rd person singular',
  '1pl': '1st person plural', '2pl': '2nd person plural', '3pl': '3rd person plural',
};

/** Human-friendly description of a feature key. */
export function featureLabel(key) {
  if (key === 'indecl') return 'an unchanging word';
  if (key === 'pres.inf.act') return 'the present infinitive';
  if (key.startsWith('pres.ind.act.')) return `${LABEL[key.slice(13)]} (present)`;
  return key.split('.').map((t) => LABEL[t] || t).join(' ');
}

/** Label for a single feature token, e.g. 'nom' -> 'nominative'. */
export function labelOf(token) {
  return LABEL[token] || token;
}

function dimOf(token) {
  if (CASES.includes(token) || token === 'loc') return 'case';
  if (token === 'sg' || token === 'pl') return 'number';
  if (token === 'm' || token === 'f' || token === 'n') return 'gender';
  if (/^[123](sg|pl)$/.test(token)) return 'person/number';
  return 'form';
}

/** Differences between two feature keys: [{dim, from, to}] (empty if shapes differ). */
export function featureDiff(a, b) {
  const x = a.split('.');
  const y = b.split('.');
  if (x.length !== y.length) return [{ dim: 'form', from: a, to: b }];
  const out = [];
  x.forEach((t, i) => { if (t !== y[i]) out.push({ dim: dimOf(t), from: t, to: y[i] }); });
  return out;
}

// ---------- Form index ----------

/**
 * Build a lookup from lexicon: normalised (macron-free, lowercase) word ->
 * [{ lexId, lemma, gloss, pos, key, form }].
 */
export function buildIndex(lexicon) {
  const lex = new Map();
  const forms = new Map();
  const byNorm = new Map();
  for (const e of lexicon) {
    if (lex.has(e.id)) throw new Error(`Duplicate lexicon id: ${e.id}`);
    lex.set(e.id, e);
    const fs = generateForms(e);
    forms.set(e.id, fs);
    for (const [key, form] of Object.entries(fs)) {
      const n = normLoose(form);
      if (!n) continue;
      const list = byNorm.get(n) || [];
      if (!list.some((x) => x.lexId === e.id && x.key === key)) {
        list.push({ lexId: e.id, lemma: e.lemma, gloss: e.gloss, pos: e.pos, key, form });
      }
      byNorm.set(n, list);
    }
  }
  return { lex, forms, byNorm };
}

/** All parses of a word (any macron/case state). */
export function parseWord(index, word) {
  return index.byNorm.get(normLoose(word)) || [];
}
