// Turns raw sentence items from the content files into ready-to-use items.
//
// An item can define its accepted answers in two ways (or both):
//   chunks: ["Rōma", "in Italiā", "est"]  -> all orderings of the chunks are accepted.
//           A chunk may be a list of alternatives: [["urbs magna", "magna urbs"], ...]
//           The first alternative of each chunk, in the order given, is the canonical answer.
//   la + accept: one canonical sentence plus an explicit list of other accepted sentences.

const MAX_VARIANTS = 400;

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((x, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([x, ...p]);
  });
  return out;
}

function product(lists) {
  return lists.reduce((acc, list) => acc.flatMap((a) => list.map((x) => [...a, x])), [[]]);
}

export function expandChunks(chunks, end = '.') {
  const alts = chunks.map((c) => (Array.isArray(c) ? c : [c]));
  const seen = new Set();
  const out = [];
  for (const choice of product(alts)) {
    for (const perm of permutations(choice)) {
      const s = perm.join(' ') + end;
      if (!seen.has(s)) { seen.add(s); out.push(s); }
      if (out.length > MAX_VARIANTS) throw new Error(`Too many variants for chunks ${JSON.stringify(chunks)}`);
    }
  }
  return out;
}

export function unique(list) {
  return [...new Set(list)];
}

const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Adds `la` (canonical) and `accepted` (all accepted full sentences) to an item.
 * Sentences built from chunks start with a capital letter, as a written sentence should (answers are checked
 * without regard to case, so this is only how they look).
 */
export function prepareItem(raw) {
  const it = { ...raw };
  const end = it.end ?? '.';
  if (it.chunks) {
    const canonical = capFirst(it.chunks.map((c) => (Array.isArray(c) ? c[0] : c)).join(' ') + end);
    it.la = canonical;
    it.accepted = unique([canonical, ...expandChunks(it.chunks, end).map(capFirst), ...(it.accept || [])]);
  } else {
    if (!it.la) throw new Error(`Item ${it.id} has neither chunks nor la`);
    it.accepted = unique([it.la, ...(it.accept || [])]);
  }
  it.fillAccepted = it.fill ? unique([it.fill, ...(it.fillAlt || [])]) : [];
  return it;
}

/** "amō" -> "a__": the first letter, then one underscore per remaining letter (spaces and hyphens kept). */
export function wordHint(la) {
  const chars = [...String(la).normalize('NFC')];
  return chars.map((c, i) => (i === 0 || /[\s\-']/u.test(c) ? c : '_')).join('');
}

/** The canonical sentence with the `fill` word replaced by a blank. */
export function blankSentence(item, blank = '_____') {
  if (!item.fill) return null;
  // a word card gives its first letter and the length, so the step between choosing and typing is a real step
  if (item.word) return wordHint(item.la);
  const target = item.fill.normalize('NFC').toLowerCase();
  const toks = item.la.normalize('NFC').split(' ');
  const i = toks.findIndex((t) => {
    const m = t.match(/^([^\p{L}\p{M}]*)(.*?)([^\p{L}\p{M}]*)$/u);
    return m[2].toLowerCase() === target;
  });
  if (i < 0) return null;
  const m = toks[i].match(/^([^\p{L}\p{M}]*)(.*?)([^\p{L}\p{M}]*)$/u);
  toks[i] = m[1] + blank + m[3];
  return toks.join(' ');
}

/**
 * How an item is put to the learner.
 *   plain      the English sentence is the prompt (translate it)
 *   situation  item.sit describes a situation in English ("Greet your friend"); answer in Latin
 *   question   item.q is a Latin question; answer in Latin (no Latin->English multiple choice)
 *   swap       item.swap = {from, change}: a Latin sentence and an instruction ("Say it for “we”"); answer in Latin
 *   word       item.word = the lexicon id of a single word; the English meaning is the prompt
 */
export function promptKind(item) {
  if (item.word) return 'word';
  if (item.q) return 'question';
  if (item.swap) return 'swap';
  if (item.sit) return 'situation';
  return 'plain';
}

/** The text shown as the prompt (English for plain/situation items, Latin for questions and swaps). */
export function promptText(item) {
  return item.q || item.swap?.from || item.sit || item.en;
}

/**
 * The line under a Latin prompt.
 * For a Latin question, the answer is usually a fact the question cannot tell you ("What are you eating?"
 * has no single right reply), so the learner is told what to say in English and puts it into Latin.
 * `item.cue` wins; otherwise it is the second quoted part of the English gloss: “Q” “A”.
 * For a swap it is the instruction ("Say it for “we”").
 */
export function cueText(item) {
  if (item.swap) return item.swap.change;
  if (!item.q) return null;
  if (item.cue) return item.cue;
  const m = /“[^”]*”\s*“([^”]*)”/.exec(item.en || '');
  return m ? m[1] : null;
}

/**
 * What makes an item's prompt unique. English prompts must not repeat across the app (two different Latin answers to
 * the same English would be ambiguous); a swap is identified by its Latin sentence and its instruction instead.
 */
export function promptKey(item) {
  if (item.word) return `word:${item.word}`; // two words may share a meaning; the id tells them apart
  if (item.swap) return `${item.swap.from}|${item.swap.change}`.toLowerCase();
  return item.en.toLowerCase();
}

/** Can this item be asked as "what does this Latin mean?" */
export function allowsL2E(item) {
  return !item.q;
}
