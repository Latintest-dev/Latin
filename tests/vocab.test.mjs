// The word trainer (v0.7): word cards cut from the lexicon, their own daily budget, no duplication across files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFromDisk } from '../tools/validate.mjs';
import { loadLexicon, loadContent } from '../js/core/content.js';
import { buildVocabUnits, wordItem, overlaps } from '../js/engine/vocab.js';
import { blankSentence, wordHint, promptKind, promptKey } from '../js/engine/items.js';
import { PACKS } from '../js/modules/registry.js';
import { createMemoryBackend } from '../js/core/storage.js';
import { createStore } from '../js/core/store.js';
import { newItemState, DAY } from '../js/core/scheduler.js';
import { buildQueue } from '../js/core/modes.js';
import { mcOptions } from '../js/ui/session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fetchJson = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));
const content = await loadFromDisk();
const vocab = content.packs.find((p) => p.id === 'vocab');
const words = vocab.units.flatMap((u) => u.items);
const clock = new Date(2026, 10, 22, 12).getTime();
const mkStore = async () => createStore(createMemoryBackend(), { now: () => clock });

test('the word list covers about 5,000 words, 50 to a unit (a short remainder joins the last), each word once', () => {
  assert.ok(words.length >= 5000 && words.length < 5100);
  assert.equal(vocab.units.length, 100);
  assert.ok(vocab.units.every((u) => u.items.length >= 50 && u.items.length < 75));
  assert.equal(new Set(words.map((w) => w.word)).size, words.length);
});

test('a word card is an ordinary item with a stable id that follows the word, not its place in the list', () => {
  const w = words[0];
  assert.equal(w.id, `vocab.${w.word}`);
  assert.equal(promptKind(w), 'word');
  assert.equal(promptKey(w), `word:${w.word}`);
  // the same words in the opposite order give the very same ids: reordering the list never loses anyone's progress
  const reversed = buildVocabUnits(content.lexicon, words.map((x) => x.word).reverse(), 50).flatMap((u) => u.items);
  assert.deepEqual(new Set(reversed.map((i) => i.id)), new Set(words.map((i) => i.id)));
});

test('wrong options are other words of the same kind with a different meaning, never the answer', () => {
  for (const w of words.slice(0, 600)) {
    assert.equal(w.distractors.length, 3, w.id);
    const lemmas = new Set([w.la, ...w.distractors.map((d) => d[0])]);
    assert.equal(lemmas.size, 4, `${w.id}: options must be four different words`);
    for (const [, , gloss] of w.distractors) assert.ok(!overlaps(gloss, w.en), `${w.id}: "${gloss}" could be mistaken for "${w.en}"`);
  }
});

test('the options are the same every time, so a word does not change under you', () => {
  const lex = content.lexicon;
  const e = lex.find((x) => x.id === words[7].word);
  const near = lex.slice(0, 200);
  assert.deepEqual(wordItem(e, near).distractors, wordItem(e, near).distractors);
});

test('Latin-to-English and English-to-Latin choices both use the card’s own options', () => {
  const w = words[3];
  const e2l = mcOptions({ type: 'mc_e2l' }, w, content);
  assert.deepEqual(e2l.filter((o) => o.correct).map((o) => o.text), [w.la]);
  const l2e = mcOptions({ type: 'mc_l2e' }, w, content);
  assert.deepEqual(l2e.filter((o) => o.correct).map((o) => o.text), [w.en]);
  assert.equal(l2e.length, 4);
});

test('the typing hint gives the first letter and the length', () => {
  assert.equal(wordHint('amō'), 'a__');
  assert.equal(wordHint('Rōma'), 'R___');
  assert.equal(blankSentence(words[0]), wordHint(words[0].la));
});

test('words that mean the same are all accepted when typing from English', () => {
  const by = new Map();
  for (const w of words) { const k = `${w.pos}|${w.en.toLowerCase()}`; by.set(k, [...(by.get(k) || []), w]); }
  const group = [...by.values()].find((g) => g.length > 1);
  assert.ok(group, 'the list has words that share a meaning');
  for (const w of group) for (const o of group) if (o !== w) assert.ok(w.accepted.includes(o.la), `${w.id} should accept ${o.la}`);
});

test('Continue gives sentences and words separate budgets, and holds both back under a review backlog', async () => {
  const store = await mkStore();
  const base = { content, skills: {}, mistakes: [], now: clock, mode: 'continue', newTotal: 6 };
  const isWord = (e) => content.itemsById.get(e.itemId).word;
  // words from the lessons (newWords) and extra frequency words (tailWords) are counted separately
  const lessonOnly = buildQueue({ ...base, itemStates: store.state.items, newWords: 4, tailWords: 0 });
  assert.equal(lessonOnly.filter((e) => e.kind === 'new' && isWord(e)).length, 4);
  assert.ok(lessonOnly.filter((e) => e.kind === 'new' && !isWord(e)).length <= 6);
  const tailOnly = buildQueue({ ...base, itemStates: store.state.items, newWords: 0, tailWords: 3 });
  assert.equal(tailOnly.filter((e) => e.kind === 'new' && isWord(e)).length, 3);
  // a big backlog: nothing new at all
  const due = { ...newItemState(), intro: true, lvl: 2, box: 2, due: clock - DAY };
  content.packs[0].units[0].items.concat(content.packs[1].units[0].items).slice(0, 14).forEach((it) => store.putItem(it.id, { ...due }));
  const held = buildQueue({ ...base, itemStates: store.state.items, newWords: 4, tailWords: 2 });
  assert.equal(held.filter((e) => e.kind === 'new').length, 0);
});

test('lesson words come first: a new sentence brings the words it uses, in frequency order, before the frequency tail', async () => {
  const store = await mkStore();
  const q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'continue', newTotal: 6, newWords: 6, tailWords: 0 });
  const sentenceIds = q.filter((e) => e.kind === 'new' && !content.itemsById.get(e.itemId).word).map((e) => e.itemId);
  const used = new Set(sentenceIds.flatMap((id) => content.lesson.itemWords.get(id)));
  const cards = q.filter((e) => e.kind === 'new' && content.itemsById.get(e.itemId).word);
  assert.ok(cards.length > 0);
  for (const e of cards) assert.ok(used.has(content.itemsById.get(e.itemId).word), `${e.itemId} is not a word of the new sentences`);
  const ranks = cards.map((e) => content.wordRank.get(content.itemsById.get(e.itemId).word));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'in frequency order');
});

test('a word card already met is not offered again as a lesson word', async () => {
  const store = await mkStore();
  const first = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'continue', newTotal: 6, newWords: 6, tailWords: 0 })
    .filter((e) => e.kind === 'new' && content.itemsById.get(e.itemId).word);
  first.forEach((e) => store.putItem(e.itemId, { ...newItemState(), intro: true, lvl: 2, box: 1, due: clock + DAY }));
  const again = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'continue', newTotal: 6, newWords: 6, tailWords: 0 })
    .filter((e) => e.kind === 'new' && content.itemsById.get(e.itemId).word);
  for (const e of again) assert.ok(!first.some((f) => f.itemId === e.itemId));
});

test('a paused word track adds no new words, but its reviews still come up', async () => {
  const store = await mkStore();
  store.putItem(words[0].id, { ...newItemState(), intro: true, lvl: 2, box: 1, due: clock - DAY });
  const q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'continue', newTotal: 6, newWords: 4, paused: ['vocab'] });
  assert.ok(!q.some((e) => e.kind === 'new' && content.itemsById.get(e.itemId).word));
  assert.ok(q.some((e) => e.itemId === words[0].id && e.kind === 'review'));
});

test('the speed round is for sentences, not single words', async () => {
  const store = await mkStore();
  const sentences = content.packs[0].units[0].items.slice(0, 4);
  [...sentences, ...words.slice(0, 20)].forEach((it) => store.putItem(it.id, { ...newItemState(), intro: true, lvl: 2, box: 3, due: clock + DAY }));
  const q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'speed' });
  assert.ok(q.length && q.every((e) => !content.itemsById.get(e.itemId).word));
});

test('a word is defined once: a duplicate id across lexicon files is refused', async () => {
  const files = { 'content/lexicon/index.json': ['a.json', 'b.json'], 'content/lexicon/a.json': [{ id: 'x', lemma: 'x' }], 'content/lexicon/b.json': [{ id: 'x', lemma: 'x' }] };
  await assert.rejects(loadLexicon(async (p) => files[p]), /defined twice/);
});

test('a track’s own skills file cannot redefine a skill another file already has', async () => {
  const real = fetchJson;
  const fake = async (p) => (p === 'content/vocab/skills.json' ? { 'prep.in.abl': { name: 'again', pack: 'vocab' } } : real(p));
  await assert.rejects(loadContent(fake, PACKS), /defined twice/);
});

test('an order file that names a word the lexicon lacks is an error, not a silent gap', async () => {
  const real = fetchJson;
  const fake = async (p) => (p === 'content/vocab/order.json' ? ['no-such-word'] : real(p));
  await assert.rejects(loadContent(fake, PACKS), /not in the lexicon/);
});

// ---- v0.7: fourth and fifth declension, the grammar track and the street track ----

test('fourth declension: senātus and exercitus decline with -ūs, -uī, -um, -ū, -uum, -ibus', () => {
  const f = content.index.forms.get('senatus');
  assert.equal(f['nom.sg'], 'senātus');
  assert.equal(f['gen.sg'], 'senātūs');
  assert.equal(f['dat.sg'], 'senātuī');
  assert.equal(f['acc.sg'], 'senātum');
  assert.equal(f['abl.sg'], 'senātū');
  assert.equal(f['gen.pl'], 'senātuum');
  assert.equal(f['dat.pl'], 'senātibus');
  assert.equal(content.index.forms.get('exercitus')['abl.pl'], 'exercitibus');
});

test('fifth declension: rēs and fidēs decline with -ēī/-eī, -em, -ē, -ērum, -ēbus', () => {
  const r = content.index.forms.get('res');
  assert.equal(r['gen.sg'], 'reī');
  assert.equal(r['acc.sg'], 'rem');
  assert.equal(r['abl.sg'], 'rē');
  assert.equal(r['gen.pl'], 'rērum');
  assert.equal(r['dat.pl'], 'rēbus');
  assert.equal(content.index.forms.get('fides')['gen.sg'], 'fideī'); // short -e- after a consonant
});

test('the grammar track exists, has genitive units, and every item names real skills', () => {
  const g = content.packs.find((p) => p.id === 'grammar');
  assert.ok(g && g.units.length >= 7);
  assert.ok(g.units.reduce((n, u) => n + u.items.length, 0) >= 60);
  assert.ok(g.units.slice(0, 4).every((u) => u.items.some((i) => i.skills.some((k) => /^gen\./.test(k)))), 'the first four units are genitive work');
  for (const it of g.units.flatMap((u) => u.items)) for (const s of it.skills) assert.ok(content.skills[s], `${it.id}: unknown skill ${s}`);
});

test('the street track has shouts, graffiti and authors, and tags each author line with its source', () => {
  const s = content.packs.find((p) => p.id === 'street');
  assert.equal(s.units.length, 3);
  const items = s.units.flatMap((u) => u.items);
  assert.ok(items.length >= 30);
  assert.ok(items.some((i) => /Catullus/.test(i.tag)) && items.some((i) => /Pompeii/.test(i.tag)) && items.some((i) => /Cicero/.test(i.tag)));
  assert.ok(items.every((i) => i.distractors.length === 3));
});

test('every id in the order file is a lexicon entry, and every word card has a lexicon entry (nothing defined twice, nothing orphaned)', async () => {
  const lex = await loadLexicon(fetchJson);
  const order = await fetchJson('content/vocab/order.json');
  const have = new Set(lex.map((e) => e.id));
  assert.equal(have.size, lex.length);
  assert.ok(order.every((id) => have.has(id)));
  assert.equal(new Set(order).size, order.length);
});
