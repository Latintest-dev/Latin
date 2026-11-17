// English rendering for the sentence generator.
// Lexicon entries carry an optional `en` object:
//   noun   { sg:"boy", pl:"boys" (default sg+s), mass:true, name:true, art:"an" }
//   verb   { base:"eat", past:"ate", ing:"eating", s:"eats" } (everything but base is guessed if missing)
//   other  a plain string
// Nothing here is shipped to the browser: it is only used by tools/generate.mjs.

const VOWELS = /^[aeiou]/i;

function plural(sg) {
  if (/[^aeiou]y$/i.test(sg)) return sg.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(sg)) return sg + 'es';
  return sg + 's';
}

export function nounForms(entry) {
  const en = entry.en || {};
  const sg = en.sg ?? entry.gloss;
  return { sg, pl: en.pl ?? plural(sg), mass: !!en.mass, name: !!en.name, art: en.art ?? (VOWELS.test(sg) ? 'an' : 'a') };
}

/**
 * Render a noun. num: 'sg' | 'pl'. mode:
 *   the (default)  the boy / the boys / Marcus
 *   a              a boy / boys / bread / Marcus
 *   bare           boy / boys
 *   poss           the boy's / the boys' / Marcus's
 */
export function renderNoun(entry, num, mode = 'the') {
  const n = nounForms(entry);
  const word = num === 'pl' ? n.pl : n.sg;
  if (n.name) return mode === 'poss' ? `${word}'s` : word;
  switch (mode) {
    case 'the': return `the ${word}`;
    case 'a': return num === 'pl' || n.mass ? word : `${n.art} ${word}`;
    case 'bare': return word;
    case 'poss': return num === 'pl' && word.endsWith('s') ? `the ${word}'` : `the ${word}'s`;
    default: throw new Error(`unknown noun mode ${mode}`);
  }
}

export function verbForms(entry) {
  const en = entry.en || {};
  const base = en.base ?? entry.gloss.replace(/^to /, '');
  const e = base.endsWith('e');
  const y = /[^aeiou]y$/.test(base);
  return {
    base,
    s: en.s ?? (y ? base.slice(0, -1) + 'ies' : /(s|x|z|ch|sh|o)$/.test(base) ? base + 'es' : base + 's'),
    past: en.past ?? (e ? base + 'd' : y ? base.slice(0, -1) + 'ied' : base + 'ed'),
    ing: en.ing ?? (e && !base.endsWith('ee') ? base.slice(0, -1) + 'ing' : base + 'ing'),
  };
}

const PRON = { '1sg': 'I', '2sg': 'you', '3sg': 'he', '1pl': 'we', '2pl': 'you all', '3pl': 'they' };
const BE = {
  pres: { '1sg': 'am', '2sg': 'are', '3sg': 'is', '1pl': 'are', '2pl': 'are', '3pl': 'are' },
  past: { '1sg': 'was', '2sg': 'were', '3sg': 'was', '1pl': 'were', '2pl': 'were', '3pl': 'were' },
};

/**
 * Render a verb for a Latin feature key.
 * mode: group (default, no subject) | full (with I/you/he/we/you all/they) | habit | inf | base
 */
export function renderVerb(entry, key, mode = 'group') {
  const v = verbForms(entry);
  if (mode === 'inf') return `to ${v.base}`;
  if (mode === 'base') return v.base;
  if (key === 'pres.inf.act') return `to ${v.base}`;
  const imp = key.match(/^imp\.act\.2(sg|pl)$/);
  if (imp) return v.base;
  const m = key.match(/^(pres|impf|fut|perf)\.ind\.act\.(\dsg|\dpl)$/);
  if (!m) throw new Error(`cannot render verb key ${key}`);
  const [, tense, person] = m;
  const isBe = entry.id === 'sum';
  let group;
  if (isBe) {
    group = tense === 'pres' ? BE.pres[person]
      : tense === 'perf' ? BE.past[person]
      : tense === 'impf' ? (mode.startsWith('habit') ? `used to be` : BE.past[person])
      : 'will be';
  } else if (tense === 'pres') group = person === '3sg' ? v.s : v.base;
  else if (tense === 'perf') group = v.past;
  else if (tense === 'fut') group = `will ${v.base}`;
  else group = mode.startsWith('habit') ? `used to ${v.base}` : `${BE.past[person]} ${v.ing}`;
  return mode === 'full' || mode === 'habitfull' ? `${PRON[person]} ${group}` : group;
}

export function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
