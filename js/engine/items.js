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

/** Adds `la` (canonical) and `accepted` (all accepted full sentences) to an item. */
export function prepareItem(raw) {
  const it = { ...raw };
  const end = it.end ?? '.';
  if (it.chunks) {
    const canonical = it.chunks.map((c) => (Array.isArray(c) ? c[0] : c)).join(' ') + end;
    it.la = canonical;
    it.accepted = unique([canonical, ...expandChunks(it.chunks, end), ...(it.accept || [])]);
  } else {
    if (!it.la) throw new Error(`Item ${it.id} has neither chunks nor la`);
    it.accepted = unique([it.la, ...(it.accept || [])]);
  }
  it.fillAccepted = it.fill ? unique([it.fill, ...(it.fillAlt || [])]) : [];
  return it;
}

/** The canonical sentence with the `fill` word replaced by a blank. */
export function blankSentence(item, blank = '_____') {
  if (!item.fill) return null;
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
 */
export function promptKind(item) {
  if (item.q) return 'question';
  if (item.sit) return 'situation';
  return 'plain';
}

/** The text shown as the prompt (English for plain/situation items, Latin for questions). */
export function promptText(item) {
  return item.q || item.sit || item.en;
}

/** Can this item be asked as "what does this Latin mean?" */
export function allowsL2E(item) {
  return !item.q;
}
