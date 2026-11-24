// How well do the sentences cover the word list, and does the plan place every lesson?
//
//   node tools/coverage.mjs          the top 500 words
//   node tools/coverage.mjs 2000     the top 2,000
//
// A word with no sentence can still be learned as a card, but it cannot be "used in sentences". The words listed at the
// end are the best ones to promote to full lexicon entries and write sentences for next (docs/CONTENT.md).
import { loadFromDisk } from './validate.mjs';

const top = Number(process.argv[2]) || 500;
const content = await loadFromDisk();
const wordPack = content.packs.find((p) => p.budget === 'words');
const order = wordPack.units.flatMap((u) => u.items.map((it) => it.word)).slice(0, top);

let used = 0;
const unused = [];
for (const id of order) {
  const n = content.lesson.wordItems.get(id)?.length || 0;
  if (n) used++; else unused.push(id);
}
const lex = (id) => content.index.lex.get(id);
const full = order.filter((id) => !lex(id)?.vocabOnly).length;
console.log(`Top ${order.length} words: ${used} appear in at least one sentence (${Math.round((100 * used) / order.length)}%).`);
console.log(`${full} of them have full forms tables; ${order.length - full} are list-only (principal parts and a meaning).`);
const listOnly = unused.filter((id) => lex(id)?.vocabOnly);
console.log(`\nNot in any sentence: ${unused.length} (${listOnly.length} of them list-only, so they could not appear yet).`);
console.log(`First 40, most frequent first: ${unused.slice(0, 40).map((id) => lex(id)?.lemma ?? id).join(', ')}`);

const sentences = content.packs.filter((p) => p.budget !== 'words').flatMap((p) => p.units.flatMap((u) => u.items));
const sizes = new Map();
for (const it of sentences) for (const w of content.lesson.itemWords.get(it.id) || []) sizes.set(w, (sizes.get(w) || 0) + 1);
console.log(`\n${sentences.length} sentences use ${sizes.size} different words.`);
console.log(`The plan: ${content.stages.length} stages, ${content.stages.reduce((n, s) => n + s.units.length, 0)} lessons.`);
