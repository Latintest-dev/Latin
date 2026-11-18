import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFromDisk, validateLoaded } from '../tools/validate.mjs';
import { generateUnit, loadLexicon } from '../tools/generate.mjs';
import { prepareItem } from '../js/engine/items.js';
import { normLoose, parseWord } from '../js/engine/latin.js';
import { renderNoun, renderVerb } from '../tools/gen/english.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = await loadFromDisk();
const forms = (id) => content.index.forms.get(id);
const lexicon = JSON.parse(await readFile(path.join(ROOT, 'content/lexicon.json'), 'utf8'));
loadLexicon(lexicon);

test('third declension nouns', () => {
  assert.equal(forms('pater')['gen.sg'], 'patris');
  assert.equal(forms('pater')['acc.pl'], 'patrēs');
  assert.equal(forms('miles')['dat.pl'], 'mīlitibus');
  assert.equal(forms('civis')['gen.pl'], 'cīvium'); // i-stem
  assert.equal(forms('rex')['gen.sg'], 'rēgis');
  assert.equal(forms('mare')['nom.pl'], 'maria'); // neuter i-stem
  assert.equal(forms('mare')['abl.sg'], 'marī');
  assert.equal(forms('flumen')['nom.pl'], 'flūmina');
});

test('3-2 adjectives and numerals', () => {
  assert.equal(forms('fortis')['nom.sg.n'], 'forte');
  assert.equal(forms('fortis')['nom.sg.m'], 'fortis');
  assert.equal(forms('fortis')['nom.pl.n'], 'fortia');
  assert.equal(forms('duo')['nom.pl.f'], 'duae');
  assert.equal(forms('tres')['acc.pl.n'], 'tria');
  assert.ok(parseWord(content.index, 'quinque').length > 0);
  assert.ok(parseWord(content.index, 'pulchra').length > 0);
});

test('irregular imperatives', () => {
  assert.equal(forms('facio')['imp.act.2sg'], 'fac');
  assert.equal(forms('do')['imp.act.2sg'], 'dā');
  assert.equal(forms('eo')['imp.act.2sg'], 'ī');
  assert.equal(forms('nolo')['imp.act.2pl'], 'nōlīte');
});

test('English renderer', () => {
  const by = (id) => lexicon.find((e) => e.id === id);
  assert.equal(renderNoun(by('vir'), 'pl'), 'the men');
  assert.equal(renderNoun(by('panis'), 'sg', 'a'), 'bread');
  assert.equal(renderNoun(by('puer'), 'sg', 'a'), 'a boy');
  assert.equal(renderNoun(by('marcus'), 'sg'), 'Marcus');
  assert.equal(renderVerb(by('edo'), 'pres.ind.act.3sg'), 'eats');
  assert.equal(renderVerb(by('edo'), 'perf.ind.act.1sg', 'full'), 'I ate');
  assert.equal(renderVerb(by('edo'), 'fut.ind.act.2pl', 'full'), 'you all will eat');
  assert.equal(renderVerb(by('edo'), 'impf.ind.act.1sg', 'habitfull'), 'I used to eat');
  assert.equal(renderVerb(by('edo'), 'impf.ind.act.3pl'), 'were eating');
});

const allItems = [...content.itemsById.values()];
const genFiles = [];
for (const pack of ['core', 'daily', 'roman']) {
  for (const f of content.packs.find((p) => p.id === pack)?.units ?? []) if (f.generated) genFiles.push([pack, f.id]);
}

test('generated units exist and the whole content set validates', () => {
  assert.ok(genFiles.length >= 10, `expected generated units, found ${genFiles.length}`);
  assert.deepEqual(validateLoaded(content).errors, []);
});

test('generation is deterministic and ids are stable', async () => {
  for (const [pack, id] of genFiles.slice(0, 4)) {
    const gen = JSON.parse(await readFile(path.join(ROOT, 'content', pack, 'gen', `${id}.json`), 'utf8'));
    const a = await generateUnit(pack, gen, []);
    const b = await generateUnit(pack, gen, []);
    assert.deepEqual(a.map((i) => i.id), b.map((i) => i.id));
    assert.equal(new Set(a.map((i) => i.id)).size, a.length);
  }
});

test('every generated item accepts its own answer, rejects its distractors, and explains each', () => {
  let checked = 0;
  for (const item of allItems) {
    if (!item.gen) continue;
    const p = prepareItem(item);
    assert.ok(p.accepted.length >= 1, item.id);
    const accepted = new Set(p.accepted.map(normLoose));
    assert.equal(item.distractors.length, 3, item.id);
    for (const [text, why] of item.distractors) {
      assert.ok(!accepted.has(normLoose(text)), `${item.id}: distractor "${text}" is also accepted`);
      assert.ok(why && why.length > 8, `${item.id}: distractor "${text}" has no explanation`);
      assert.ok(!/undefined|null|NaN|\[object/.test(why), `${item.id}: bad explanation ${why}`);
    }
    assert.ok(!/undefined|null|NaN|\[object/.test(item.en + item.explain), item.id);
    checked++;
  }
  assert.ok(checked > 300, `only ${checked} generated items checked`);
});

test('no two items in a pack share English or Latin', () => {
  for (const pack of ['core', 'daily', 'roman']) {
    const seenEn = new Map();
    for (const item of allItems.filter((i) => i.id.startsWith(pack + '.'))) {
      const key = item.en.toLowerCase();
      assert.ok(!seenEn.has(key), `${pack}: "${item.en}" appears in ${seenEn.get(key)} and ${item.id}`);
      seenEn.set(key, item.id);
    }
  }
});

test('generated items can be blanked, typed, and re-ordered', async () => {
  const { blankSentence } = await import('../js/engine/items.js');
  const { checkText } = await import('../js/engine/checker.js');
  for (const item of allItems) {
    if (!item.gen) continue;
    const p = prepareItem(item);
    assert.ok(blankSentence(p), `${item.id}: fill word "${item.fill}" cannot be blanked in "${p.la}"`);
    assert.equal(checkText(p.accepted, p.la, {}, content.index).result, 'correct', item.id);
    // a reversed chunk order and a macron-less spelling are accepted too
    const reversed = [...item.chunks].reverse().map((c) => (Array.isArray(c) ? c[0] : c)).join(' ') + (item.end ?? '.');
    assert.equal(checkText(p.accepted, reversed, {}, content.index).result, 'correct', `${item.id}: ${reversed}`);
    for (const [bad] of item.distractors) {
      assert.notEqual(checkText(p.accepted, bad, {}, content.index).result, 'correct', `${item.id}: ${bad}`);
    }
  }
});

test('units are listed in numeric order, so the unlock chain follows the lessons', () => {
  for (const pack of content.packs) {
    const ids = pack.units.map((u) => Number(u.id));
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b), `${pack.id}: ${ids}`);
  }
});

test('new vocabulary: ūnus, irregular imperatives, dative flags, sayings words', () => {
  assert.equal(forms('unus')['gen.sg.m'], 'ūnīus');
  assert.equal(forms('unus')['dat.sg.f'], 'ūnī');
  assert.equal(forms('dico')['imp.act.2sg'], 'dīc');
  assert.equal(forms('duco')['imp.act.2sg'], 'dūc');
  assert.equal(forms('dies')['acc.sg'], 'diem');
  assert.equal(forms('audax')['acc.sg.m'], 'audācem');
  for (const id of ['do', 'mitto', 'monstro', 'narro', 'vendo', 'lego']) assert.ok(lexicon.find((e) => e.id === id).dat, `${id} takes a dative`);
});

test('regeneration is append-only: shipped sentences and their ids are kept; raising n only adds', async () => {
  const unitFile = path.join(ROOT, 'content/core/u9.json');
  const shipped = JSON.parse(await readFile(unitFile, 'utf8'));
  const items = shipped.items ?? shipped;
  const gen = JSON.parse(await readFile(path.join(ROOT, 'content/core/gen/9.json'), 'utf8'));
  const others = content.packs.flatMap((p) => p.units.flatMap((u) => (p.id === 'core' && u.id === '9' ? [] : u.items ?? [])));
  // same templates: nothing changes
  const again = await generateUnit('core', gen, others, items);
  assert.deepEqual(again.map((i) => i.id), items.map((i) => i.id));
  // more sentences wanted: the old ones come first, unchanged, and the extras are new
  const bigger = { ...gen, templates: gen.templates.map((t) => ({ ...t, n: t.n + 4 })) };
  const more = await generateUnit('core', bigger, others, items);
  assert.ok(more.length > items.length);
  const ids = new Set(more.map((i) => i.id));
  assert.equal(ids.size, more.length, 'ids stay unique');
  for (const old of items) assert.ok(ids.has(old.id), `${old.id} kept`);
});
