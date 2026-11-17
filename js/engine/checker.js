// Answer checking with diagnostics.
//
// checkText() compares a typed answer against a list of accepted answers and, when it is
// wrong, uses the form index to say *what kind* of mistake it was (wrong number, wrong case,
// wrong word...). Messages mark Latin words with _underscores_; the UI renders those in
// italics and applies the macron setting.

import { normLoose, normStrict, tokensLoose, tokensStrict, parseWord, featureLabel, featureDiff, labelOf } from './latin.js';

/** Word-level edit alignment between user tokens u and expected tokens e. */
export function align(u, e) {
  const n = u.length;
  const m = e.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (u[i - 1] === e[j - 1] ? 0 : 1),
      );
    }
  }
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (u[i - 1] === e[j - 1] ? 0 : 1)) {
      ops.push({ t: u[i - 1] === e[j - 1] ? 'ok' : 'sub', ui: i - 1, ei: j - 1 });
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ t: 'ins', ui: i - 1 });
      i--;
    } else {
      ops.push({ t: 'del', ei: j - 1 });
      j--;
    }
  }
  return { distance: d[n][m], ops: ops.reverse() };
}

function diagnoseSub(index, uNorm, eNorm, uShown, eShown) {
  const cu = parseWord(index, uNorm);
  const ce = parseWord(index, eNorm);
  let best = null;
  for (const a of cu) {
    for (const b of ce) {
      if (a.lexId !== b.lexId) continue;
      const diff = featureDiff(a.key, b.key);
      if (!best || diff.length < best.diff.length) best = { a, b, diff };
    }
  }
  if (best && !best.diff.length && (best.a.enc || '') !== (best.b.enc || '')) {
    const askedForNe = !!best.b.enc;
    return {
      type: 'enclitic',
      user: uShown,
      expected: eShown,
      msg: askedForNe
        ? `This is a yes/no question, so the question particle _-ne_ is added to the first word: _${eShown}_.`
        : `_-ne_ turns a sentence into a yes/no question. Here you need a plain statement: _${eShown}_.`,
      tags: ['question:-ne'],
    };
  }
  if (best && best.diff.length === 1 && best.diff[0].dim === 'tense') {
    const [d] = best.diff;
    return {
      type: 'form',
      user: uShown,
      expected: eShown,
      msg: `_${uShown}_ is the ${labelOf(d.from)} tense of _${best.a.lemma}_, but this sentence needs the ${labelOf(d.to)} tense: _${eShown}_.`,
      tags: [`tense:${d.from}>${d.to}`],
    };
  }
  if (best && best.diff.length) {
    return {
      type: 'form',
      user: uShown,
      expected: eShown,
      msg: `_${uShown}_ is ${featureLabel(best.a.key)} of _${best.a.lemma}_, but here you need ${featureLabel(best.b.key)}: _${eShown}_.`,
      tags: best.diff.map((x) => `${x.dim}:${x.from}>${x.to}`),
    };
  }
  if (cu.length && ce.length) {
    const a = cu[0];
    const b = ce[0];
    return {
      type: 'word',
      user: uShown,
      expected: eShown,
      msg: `_${uShown}_ is a form of _${a.lemma}_ ("${a.gloss}"), but this sentence needs _${eShown}_ (${b.gloss ? `"${b.gloss}"` : b.lemma}).`,
      tags: [`word:${a.lexId}>${b.lexId}`],
    };
  }
  return {
    type: 'unknown',
    user: uShown,
    expected: eShown,
    msg: `_${uShown}_ isn't a word I recognize. Check the spelling. The word needed was _${eShown}_.`,
    tags: ['spelling'],
  };
}

function sortedKey(tokens) {
  return [...tokens].sort().join(' ');
}

/**
 * @param accepted  array of accepted answers (strings, with macrons)
 * @param input     what the user typed
 * @param opts      { strictMacrons: boolean }
 * @param index     form index from buildIndex()
 * @returns { result: 'correct'|'wrong'|'close', kind?, best, diag: [...], tags: [...], note? }
 */
export function checkText(accepted, input, opts, index) {
  const uLoose = normLoose(input);
  if (!uLoose) {
    return { result: 'wrong', kind: 'empty', best: accepted[0], diag: [], tags: [] };
  }
  const aLoose = accepted.map(normLoose);
  const hit = aLoose.indexOf(uLoose);
  if (hit >= 0) {
    if (opts?.strictMacrons) {
      const uStrict = normStrict(input);
      const strictSet = accepted.map(normStrict);
      if (!strictSet.includes(uStrict)) {
        return {
          result: 'close',
          kind: 'macron',
          best: accepted[hit],
          diag: [],
          tags: [],
          note: 'Right words. Check the macrons (long vowels) in your answer.',
        };
      }
    }
    return { result: 'correct', best: accepted[hit], matched: accepted[hit], diag: [], tags: [] };
  }

  const uTokens = tokensLoose(input);

  // Same words, different order -> not wrong, just not on the accepted list.
  if (uTokens.length > 1) {
    const key = sortedKey(uTokens);
    const j = aLoose.findIndex((a) => sortedKey(a.split(' ')) === key);
    if (j >= 0) {
      return {
        result: 'close',
        kind: 'order',
        best: accepted[j],
        diag: [],
        tags: [],
        note: "Right words, but in an order that isn't on my accepted list. Word order changes emphasis (and sometimes meaning) in Latin. If you think yours is valid, flag it.",
      };
    }
  }

  // Wrong: find the closest accepted answer and diagnose differences.
  let bestIdx = 0;
  let bestAlign = null;
  aLoose.forEach((a, i) => {
    const al = align(uTokens, a.split(' '));
    if (!bestAlign || al.distance < bestAlign.distance) { bestAlign = al; bestIdx = i; }
  });
  const best = accepted[bestIdx];
  const eStrictTokens = tokensStrict(best);
  const uStrictTokens = tokensStrict(input);
  const eLooseTokens = aLoose[bestIdx].split(' ');
  const diag = [];
  for (const op of bestAlign.ops) {
    if (op.t === 'sub') {
      diag.push(diagnoseSub(index, uTokens[op.ui], eLooseTokens[op.ei], uStrictTokens[op.ui] ?? uTokens[op.ui], eStrictTokens[op.ei]));
    } else if (op.t === 'ins') {
      diag.push({ type: 'extra', user: uTokens[op.ui], msg: `Extra word: _${uStrictTokens[op.ui] ?? uTokens[op.ui]}_.`, tags: ['extra-word'] });
    } else if (op.t === 'del') {
      const exp = eLooseTokens[op.ei];
      const p = parseWord(index, exp)[0];
      diag.push({
        type: 'missing',
        expected: eStrictTokens[op.ei],
        msg: `Missing word: _${eStrictTokens[op.ei]}_${p?.gloss ? ` ("${p.gloss}")` : ''}.`,
        tags: ['missing-word'],
      });
    }
  }
  return { result: 'wrong', best, diag, tags: [...new Set(diag.flatMap((d) => d.tags))] };
}
