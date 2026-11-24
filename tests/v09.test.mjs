// v0.9: the promoted vocabulary, the new pronoun and comparison paradigms, and the new tracks stay in good shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFromDisk } from '../tools/validate.mjs';
import { generateForms } from '../js/engine/latin.js';

const content = await loadFromDisk();
const byId = new Map(content.lexicon.map((e) => [e.id, e]));
const forms = (id) => generateForms(byId.get(id));
const cell = (id, key) => forms(id)[key];

test('hic, ille, is, īdem, ipse and quī decline in full, with the irregular cells where Latin has them', () => {
  assert.equal(cell('hic', 'nom.sg.m'), 'hic');
  assert.equal(cell('hic', 'gen.sg.f'), 'huius');
  assert.equal(cell('hic', 'dat.pl.n'), 'hīs');
  assert.equal(cell('ille', 'gen.sg.m'), 'illīus');
  assert.equal(cell('ille', 'dat.sg.f'), 'illī');
  assert.equal(cell('is', 'acc.sg.m'), 'eum');
  assert.equal(cell('idem', 'acc.sg.m'), 'eundem');
  assert.equal(cell('ipse', 'nom.sg.n'), 'ipsum');
  assert.equal(cell('qui', 'gen.sg.m'), 'cuius');
  assert.equal(cell('qui', 'acc.pl.f'), 'quās');
  for (const id of ['hic', 'ille', 'is', 'idem', 'ipse', 'qui']) {
    const f = forms(id);
    for (const c of ['nom', 'gen', 'dat', 'acc', 'abl']) for (const n of ['sg', 'pl']) for (const g of 'mfn') assert.ok(f[`${c}.${n}.${g}`], `${id} ${c}.${n}.${g}`);
  }
});

test('the reflexive and the possessive have the forms the lessons teach', () => {
  assert.equal(cell('se', 'dat'), 'sibi');
  assert.equal(cell('se', 'abl.cum'), 'sēcum');
  assert.equal(cell('suus', 'acc.sg.f'), 'suam');
  assert.equal(cell('suus', 'acc.pl.m'), 'suōs');
});

test('comparatives and superlatives are spelled the Latin way (maior, minor, peius, optimus)', () => {
  assert.equal(cell('melior', 'nom.sg.n'), 'melius');
  assert.equal(cell('maior-adj', 'nom.sg.m'), 'maior');
  assert.equal(cell('maior-adj', 'acc.sg.m'), 'maiōrem');
  assert.equal(cell('minor-adj', 'nom.sg.m'), 'minor');
  assert.equal(cell('minor-adj', 'gen.sg.m'), 'minōris');
  assert.equal(cell('peior', 'nom.sg.n'), 'peius');
  assert.equal(cell('optimus', 'nom.sg.f'), 'optima');
  assert.equal(cell('maximus', 'acc.sg.m'), 'maximum');
});

test('irregular verbs and the pairs of homographs behave', () => {
  assert.equal(cell('fero', 'pres.ind.act.3sg'), 'fert');
  assert.equal(cell('fero', 'perf.ind.act.1sg'), 'tulī');
  assert.equal(cell('adsum', 'pres.ind.act.2sg'), 'ades');
  assert.equal(cell('abeo', 'pres.ind.act.3pl'), 'abeunt');
  assert.equal(cell('iter', 'gen.sg'), 'itineris');
  assert.equal(cell('dea', 'dat.pl'), 'deābus');
  assert.equal(cell('vis', 'acc.sg'), 'vim');
});

test('no word is defined twice, and every promoted word is no longer a list-only entry', () => {
  const ids = content.lexicon.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  const full = content.lexicon.filter((e) => !e.vocabOnly).length;
  assert.ok(full > 700, `only ${full} full entries`);
  for (const id of ['hic', 'quī'.normalize() && 'qui', 'causa', 'pono', 'genus', 'melior', 'prior']) assert.ok(!byId.get(id).vocabOnly, id);
});

test('the new tracks and lessons are in the plan, in order, and open after the same gate as the other grammar', () => {
  const world = content.packs.find((p) => p.id === 'world');
  assert.equal(world.units.length, 8);
  assert.deepEqual(world.requires, { pack: 'core', unit: '9' });
  const grammar = content.packs.find((p) => p.id === 'grammar');
  assert.equal(grammar.units.length, 15);
  const sentences = content.packs.flatMap((p) => p.vocab ? [] : p.units.flatMap((u) => u.items));
  assert.ok(sentences.length > 1300, `${sentences.length} sentences`);
});
