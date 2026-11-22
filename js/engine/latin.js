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

// Verb endings per conjugation. Present: 1sg..3pl. Imperfect and future are built from a
// "thematic" stem part plus an ending; the perfect uses the verb's own perfect stem (`pf`).
const BAM = ['bam', 'bās', 'bat', 'bāmus', 'bātis', 'bant'];
const BO = ['bō', 'bis', 'bit', 'bimus', 'bitis', 'bunt'];
const AM = ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'];
const PERF = ['ī', 'istī', 'it', 'imus', 'istis', 'ērunt'];
const CONJ = {
  1: { pres: ['ō', 'ās', 'at', 'āmus', 'ātis', 'ant'], inf: 'āre', impf: BAM.map((x) => 'ā' + x), fut: BO.map((x) => 'ā' + x), imp: ['ā', 'āte'] },
  2: { pres: ['eō', 'ēs', 'et', 'ēmus', 'ētis', 'ent'], inf: 'ēre', impf: BAM.map((x) => 'ē' + x), fut: BO.map((x) => 'ē' + x), imp: ['ē', 'ēte'] },
  3: { pres: ['ō', 'is', 'it', 'imus', 'itis', 'unt'], inf: 'ere', impf: BAM.map((x) => 'ē' + x), fut: AM, imp: ['e', 'ite'] },
  '3io': { pres: ['iō', 'is', 'it', 'imus', 'itis', 'iunt'], inf: 'ere', impf: BAM.map((x) => 'iē' + x), fut: AM.map((x) => 'i' + x), imp: ['e', 'ite'] },
  4: { pres: ['iō', 'īs', 'it', 'īmus', 'ītis', 'iunt'], inf: 'īre', impf: BAM.map((x) => 'iē' + x), fut: AM.map((x) => 'i' + x), imp: ['ī', 'īte'] },
};

/**
 * Generate all forms of a lexicon entry as { featureKey: form }.
 * Regular paradigms come from rules; `forms` in the entry adds or overrides.
 *
 * Feature keys:
 *   noun        nom.sg, gen.pl, ...   (decl 1, 2, 3 with `stem`/`nomSg`, 4 and 5)
 *   adjective   nom.sg.m, acc.pl.f, ...
 *   verb        pres.ind.act.1sg ... pres.inf.act
 *   indeclinable  indecl
 */
export function generateForms(e) {
  const f = {};
  if (e.pos === 'noun' && (e.decl === 4 || e.decl === 5)) {
    // 4th declension (fructus, -ūs) and 5th declension (diēs, -ēī / -eī): `stem` is what stays (fructū- is built from fruct-)
    const nums = e.number ? [e.number] : ['sg', 'pl'];
    // 5th: after a vowel the genitive and dative are -ēī (diēī, faciēī); after a consonant -eī (reī, speī, fideī)
    const eI = /[aeiouāēīōū]$/.test(e.stem) ? 'ēī' : 'eī';
    const t = e.decl === 4
      ? { sg: ['us', 'ūs', 'uī', 'um', 'ū'], pl: ['ūs', 'uum', 'ibus', 'ūs', 'ibus'] }
      : { sg: ['ēs', eI, eI, 'em', 'ē'], pl: ['ēs', 'ērum', 'ēbus', 'ēs', 'ēbus'] };
    for (const n of nums) CASES.forEach((c, i) => { f[`${c}.${n}`] = e.stem + t[n][i]; });
  } else if (e.pos === 'noun' && e.decl && (e.decl !== 3 || e.stem)) {
    const nums = e.number ? [e.number] : ['sg', 'pl'];
    if (e.decl === 3) {
      // 3rd declension: `stem` is the genitive stem (rēg-), `nomSg` the nominative (rēx).
      // istem: true gives -ium / -ia (and -ī in the ablative of neuters).
      const neut = e.gender === 'n';
      const sg = [e.nomSg, e.stem + 'is', e.stem + 'ī', neut ? e.nomSg : e.stem + 'em', e.stem + (neut && e.istem ? 'ī' : 'e')];
      const pl = neut
        ? [e.stem + (e.istem ? 'ia' : 'a'), e.stem + (e.istem ? 'ium' : 'um'), e.stem + 'ibus', e.stem + (e.istem ? 'ia' : 'a'), e.stem + 'ibus']
        : [e.stem + 'ēs', e.stem + (e.istem ? 'ium' : 'um'), e.stem + 'ibus', e.stem + 'ēs', e.stem + 'ibus'];
      for (const n of nums) CASES.forEach((c, i) => { f[`${c}.${n}`] = (n === 'sg' ? sg : pl)[i]; });
    } else {
      const tbl = e.decl === 1 ? ND1 : e.gender === 'n' ? ND2N : ND2M;
      for (const n of nums) CASES.forEach((c, i) => { f[`${c}.${n}`] = e.stem + tbl[n][i]; });
      if (e.nomSg && nums.includes('sg')) f['nom.sg'] = e.nomSg;
      // vocative: only -us masculine nouns differ from the nominative (amīcus -> amīce)
      if (e.decl === 2 && e.gender === 'm' && nums.includes('sg') && !e.nomSg) f['voc.sg'] = e.stem + 'e';
    }
  } else if (e.pos === 'adj' && e.decl === '1-2') {
    for (const g of ['m', 'f', 'n']) {
      for (const n of ['sg', 'pl']) {
        CASES.forEach((c, i) => { f[`${c}.${n}.${g}`] = e.stem + ADJ[g][n][i]; });
      }
    }
    if (e.nomSgM) f['nom.sg.m'] = e.nomSgM; // pulcher, noster, miser
  } else if (e.pos === 'adj' && e.decl === '3-2') {
    // two-termination 3rd-declension adjective: trīstis (m/f), trīste (n)
    const st = e.stem;
    const sgMF = [st + 'is', st + 'is', st + 'ī', st + 'em', st + 'ī'];
    const sgN = [st + 'e', st + 'is', st + 'ī', st + 'e', st + 'ī'];
    const plMF = [st + 'ēs', st + 'ium', st + 'ibus', st + 'ēs', st + 'ibus'];
    const plN = [st + 'ia', st + 'ium', st + 'ibus', st + 'ia', st + 'ibus'];
    CASES.forEach((c, i) => {
      f[`${c}.sg.m`] = f[`${c}.sg.f`] = sgMF[i]; f[`${c}.sg.n`] = sgN[i];
      f[`${c}.pl.m`] = f[`${c}.pl.f`] = plMF[i]; f[`${c}.pl.n`] = plN[i];
    });
  } else if (e.pos === 'verb' && e.conj) {
    const c = CONJ[e.conj];
    if (!c) throw new Error(`Unknown conjugation ${e.conj} for ${e.id}`);
    PERSONS.forEach((p, i) => {
      f[`pres.ind.act.${p}`] = e.stem + c.pres[i];
      f[`impf.ind.act.${p}`] = e.stem + c.impf[i];
      f[`fut.ind.act.${p}`] = e.stem + c.fut[i];
      if (e.pf) f[`perf.ind.act.${p}`] = e.pf + PERF[i];
    });
    f['pres.inf.act'] = e.stem + c.inf;
    f['imp.act.2sg'] = e.stem + c.imp[0];
    f['imp.act.2pl'] = e.stem + c.imp[1];
  }
  if (e.form) f.indecl = e.form;
  if (e.forms) Object.assign(f, e.forms);
  // The dictionary form is always a known form of its word, even when no paradigm is built (a word known only from
  // the vocabulary lists) or the paradigm leaves it out (grātia is only used in the plural, salveō only as salvē).
  if (!Object.values(f).includes(e.lemma)) f.lemma = e.lemma;
  return f;
}

// ---------- Feature labels ----------

const LABEL = {
  nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', abl: 'ablative', loc: 'locative', voc: 'vocative',
  pres: 'present', impf: 'imperfect', fut: 'future', perf: 'perfect',
  sg: 'singular', pl: 'plural', m: 'masculine', f: 'feminine', n: 'neuter',
  '1sg': '1st person singular', '2sg': '2nd person singular', '3sg': '3rd person singular',
  '1pl': '1st person plural', '2pl': '2nd person plural', '3pl': '3rd person plural',
};

const TENSES = ['pres', 'impf', 'fut', 'perf'];

/** Human-friendly description of a feature key. */
export function featureLabel(key) {
  if (key === 'indecl') return 'an unchanging word';
  if (key === 'lemma') return 'the dictionary form';
  if (key === 'pres.inf.act') return 'the present infinitive';
  if (key === 'imp.act.2sg') return 'the command form (to one person)';
  if (key === 'imp.act.2pl') return 'the command form (to several people)';
  const m = key.match(/^(pres|impf|fut|perf)\.ind\.act\.(.+)$/);
  if (m) return `${LABEL[m[2]]} (${LABEL[m[1]]} tense)`;
  return key.split('.').map((t) => LABEL[t] || t).join(' ');
}

/** Label for a single feature token, e.g. 'nom' -> 'nominative'. */
export function labelOf(token) {
  return LABEL[token] || token;
}

function dimOf(token) {
  if (TENSES.includes(token)) return 'tense';
  if (CASES.includes(token) || token === 'loc' || token === 'voc') return 'case';
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

/**
 * All parses of a word (any macron/case state).
 * A word ending in the question particle -ne (valēsne, fessusne) is parsed as the word without it,
 * with `enc: 'ne'` set on each parse.
 */
export function parseWord(index, word) {
  const n = normLoose(word);
  const direct = index.byNorm.get(n);
  if (direct) return direct;
  if (n.length > 3 && n.endsWith('ne')) {
    const base = index.byNorm.get(n.slice(0, -2));
    if (base) return base.map((p) => ({ ...p, enc: 'ne' }));
  }
  return [];
}

/** Is this word (after stripping macrons) something the lexicon can produce? */
export function isKnownWord(index, word) {
  return parseWord(index, word).length > 0;
}
