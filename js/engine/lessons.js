// Which words each lesson sentence uses, and which sentences use each word.
//
// This is what weaves vocabulary into the lessons: a word you have met in a sentence comes up as a word card before
// words that appear in no lesson of yours, and "use it in sentences" finds the sentences that contain a word.
// Everything is derived from the lexicon and the sentences when the app loads (no extra data files).

import { normLoose, parseWord } from './latin.js';

const tokens = (la) => normLoose(la).split(/[^a-z]+/).filter(Boolean);

/**
 * The lexicon ids a sentence uses. A form that several words share ("est" is a form of sum and of edo) counts for
 * the words that have full entries before the lemma-only list words, so a sentence is not credited with unrelated words.
 */
export function wordsOf(index, item) {
  const out = new Set();
  for (const t of tokens(item.la)) {
    const parses = parseWord(index, t);
    if (!parses.length) continue;
    const full = parses.filter((p) => !index.lex.get(p.lexId)?.vocabOnly);
    for (const p of (full.length ? full : parses)) out.add(p.lexId);
  }
  return [...out];
}

/** { itemWords: Map(sentence id -> [lexicon id]), wordItems: Map(lexicon id -> [sentence id]) } for every sentence item. */
export function indexLessonWords(packs, index) {
  const itemWords = new Map();
  const wordItems = new Map();
  for (const pack of packs) {
    if (pack.budget === 'words') continue;
    for (const unit of pack.units) {
      for (const item of unit.items) {
        const ids = wordsOf(index, item);
        itemWords.set(item.id, ids);
        for (const w of ids) {
          if (!wordItems.has(w)) wordItems.set(w, []);
          wordItems.get(w).push(item.id);
        }
      }
    }
  }
  return { itemWords, wordItems };
}
