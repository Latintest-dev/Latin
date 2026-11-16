import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFromDisk, validateContent, validateLoaded } from '../tools/validate.mjs';
import { generateForms, normLoose, normStrict, stripMacrons, featureLabel, featureDiff, parseWord } from '../js/engine/latin.js';
import { expandChunks, blankSentence, prepareItem } from '../js/engine/items.js';
import { checkText, align } from '../js/engine/checker.js';

const content = await loadFromDisk();
const { index } = content;
const forms = (id) => index.forms.get(id);

test('normalisation', () => {
  assert.equal(stripMacrons('Rōma Ītalia ā'), 'Roma Italia a');
  assert.equal(normLoose('  Ubi  est Rōma?  '), 'ubi est roma');
  assert.equal(normStrict('Ubi est Rōma?'), 'ubi est rōma');
  // decomposed macron input equals composed
  assert.equal(normStrict('Rōma'), normStrict('Rōma'));
});

test('first declension paradigm', () => {
  const f = forms('insula');
  assert.equal(f['nom.sg'], 'īnsula');
  assert.equal(f['gen.sg'], 'īnsulae');
  assert.equal(f['acc.sg'], 'īnsulam');
  assert.equal(f['abl.sg'], 'īnsulā');
  assert.equal(f['nom.pl'], 'īnsulae');
  assert.equal(f['gen.pl'], 'īnsulārum');
  assert.equal(f['abl.pl'], 'īnsulīs');
});

test('second declension paradigm incl. -er and -ius nouns', () => {
  assert.equal(forms('liber')['nom.sg'], 'liber');
  assert.equal(forms('liber')['acc.sg'], 'librum');
  assert.equal(forms('liber')['nom.pl'], 'librī');
  assert.equal(forms('fluvius')['gen.sg'], 'fluviī');
  assert.equal(forms('fluvius')['nom.pl'], 'fluviī');
  assert.equal(forms('aegyptus')['abl.sg'], 'Aegyptō');
  assert.deepEqual(Object.keys(forms('athenae')).sort(), ['abl.pl', 'acc.pl', 'dat.pl', 'gen.pl', 'nom.pl']);
});

test('adjective paradigm', () => {
  const f = forms('magnus');
  assert.equal(f['nom.sg.m'], 'magnus');
  assert.equal(f['nom.sg.f'], 'magna');
  assert.equal(f['nom.sg.n'], 'magnum');
  assert.equal(f['nom.pl.f'], 'magnae');
  assert.equal(f['nom.pl.m'], 'magnī');
  assert.equal(f['abl.sg.f'], 'magnā');
});

test('verb conjugations', () => {
  const dormio = forms('dormio');
  assert.equal(dormio['pres.ind.act.1sg'], 'dormiō');
  assert.equal(dormio['pres.ind.act.2sg'], 'dormīs');
  assert.equal(dormio['pres.ind.act.3sg'], 'dormit');
  assert.equal(dormio['pres.ind.act.3pl'], 'dormiunt');
  assert.equal(dormio['pres.inf.act'], 'dormīre');
  assert.equal(forms('edo')['pres.ind.act.1sg'], 'edō');
  assert.equal(forms('edo')['pres.ind.act.2sg'], 'edis');
  assert.equal(forms('edo')['pres.inf.act'], 'edere');
  assert.equal(forms('ambulo')['pres.ind.act.2sg'], 'ambulās');
  assert.equal(forms('ambulo')['pres.inf.act'], 'ambulāre');
  assert.equal(forms('bibo')['pres.inf.act'], 'bibere');
  assert.equal(forms('laboro')['pres.ind.act.1sg'], 'labōrō');
});

test('feature labels and diffs', () => {
  assert.equal(featureLabel('nom.sg'), 'nominative singular');
  assert.equal(featureLabel('pres.ind.act.3pl'), '3rd person plural (present)');
  assert.deepEqual(featureDiff('pres.ind.act.3sg', 'pres.ind.act.3pl'), [{ dim: 'person/number', from: '3sg', to: '3pl' }]);
  assert.deepEqual(featureDiff('nom.sg.f', 'nom.sg.m'), [{ dim: 'gender', from: 'f', to: 'm' }]);
});

test('index parses ambiguous forms', () => {
  const parses = parseWord(index, 'Italia');
  const keys = parses.map((p) => p.key).sort();
  assert.deepEqual(keys, ['abl.sg', 'nom.sg']); // macron-free nominative/ablative collide
  assert.ok(parseWord(index, 'est').some((p) => p.lexId === 'sum'));
});

test('chunk expansion and blanks', () => {
  const v = expandChunks(['Rōma', 'in Italiā', 'est']);
  assert.equal(v.length, 6);
  assert.ok(v.includes('in Italiā Rōma est.'));
  assert.ok(!v.includes('Rōma Italiā in est.')); // chunk 'in Italiā' stays intact
  const alt = expandChunks([['A b', 'b A'], 'c']);
  assert.equal(alt.length, 4);
  const it = prepareItem({ id: 'x', chunks: ['Rōma', 'in Italiā', 'est'], fill: 'Italiā' });
  assert.equal(it.la, 'Rōma in Italiā est.');
  assert.equal(blankSentence(it), 'Rōma in _____ est.');
  const q = prepareItem({ id: 'q', la: 'Ubi est Rōma?', fill: 'Rōma' });
  assert.equal(blankSentence(q), 'Ubi est _____?');
});

const item = (id) => content.itemsById.get(id);
const check = (id, input, opts = {}) => checkText(item(id).accepted, input, opts, index);

test('checker: correct answers, any order, with or without macrons', () => {
  assert.equal(check('core.1.01', 'Roma in Italia est').result, 'correct');
  assert.equal(check('core.1.01', 'est Roma in Italia.').result, 'correct');
  assert.equal(check('core.1.01', 'in Italiā Rōma est').result, 'correct');
  assert.equal(check('daily.2.07', 'Bibere volo post cibum').result, 'correct');
  assert.equal(check('daily.1.06', 'Fessa sum').result, 'correct');
  assert.equal(check('daily.1.01', 'ego esurio').result, 'correct');
});

test('checker: strict macrons gives "close", not wrong', () => {
  const r = check('core.1.01', 'Roma in Italia est', { strictMacrons: true });
  assert.equal(r.result, 'close');
  assert.equal(r.kind, 'macron');
  assert.equal(check('core.1.01', 'Rōma in Italiā est', { strictMacrons: true }).result, 'correct');
});

test('checker: same words in unlisted order is "close" (Rome/Italy swap is wrong)', () => {
  // 'Italia in Roma est' has the same macron-free words as 'Roma in Italia est' but means the opposite.
  const swapped = check('core.1.01', 'Italia in Roma est');
  assert.equal(swapped.result, 'close'); // flagged as order issue, never counted correct
  assert.equal(swapped.kind, 'order');
});

test('checker: diagnoses number, case, gender mistakes', () => {
  let r = check('core.1.07', 'Athenae in Graecia est');
  assert.equal(r.result, 'wrong');
  assert.ok(r.diag[0].msg.includes('3rd person singular'), r.diag[0].msg);
  assert.ok(r.diag[0].msg.includes('3rd person plural'));
  assert.deepEqual(r.tags, ['person/number:3sg>3pl']);

  r = check('core.3.02', 'Roma urbs magnus est');
  assert.equal(r.result, 'wrong');
  assert.deepEqual(r.tags, ['gender:m>f']);

  r = check('daily.1.04', 'Edo cibus');
  assert.equal(r.result, 'wrong');
  assert.deepEqual(r.tags, ['case:nom>acc']);

  r = check('daily.1.04', 'Edis cibum');
  assert.deepEqual(r.tags, ['person/number:2sg>1sg']);
});

test('checker: different word, unknown word, missing and extra words', () => {
  let r = check('daily.1.05', 'Edo aquam');
  assert.equal(r.result, 'wrong');
  assert.ok(r.tags[0].startsWith('word:'));
  r = check('daily.1.05', 'Bibo aqxam');
  assert.deepEqual(r.tags, ['spelling']);
  r = check('daily.1.05', 'Bibo');
  assert.ok(r.diag.some((d) => d.type === 'missing'));
  r = check('daily.1.05', 'Bibo aquam bene');
  assert.ok(r.diag.some((d) => d.type === 'extra'));
  assert.equal(check('daily.1.05', '').result, 'wrong');
});

test('align picks diagonal moves for substitutions', () => {
  const { distance, ops } = align(['a', 'x', 'c'], ['a', 'b', 'c']);
  assert.equal(distance, 1);
  assert.deepEqual(ops.map((o) => o.t), ['ok', 'sub', 'ok']);
});

test('content validates cleanly', async () => {
  const { errors } = await validateContent();
  assert.deepEqual(errors, []);
});

test('validator really catches problems', async () => {
  const broken = await loadFromDisk();
  const it = broken.itemsById.get('core.1.01');
  it.distractors[0] = ['Rōma in Italiā est.', 'same as the answer'];   // accepted answer used as distractor
  it.distractors[1] = ['Rōma in Xyzia est.', 'unknown word'];           // word not in lexicon
  it.fill = 'nonexistent';                                              // blank not in sentence
  it.skills = ['no.such.skill'];
  const { errors } = validateLoaded(broken);
  const text = errors.join('\n');
  assert.match(text, /distractor is also an accepted answer/);
  assert.match(text, /unknown word "xyzia"/);
  assert.match(text, /fill word "nonexistent" not found/);
  assert.match(text, /unknown skill no\.such\.skill/);
  assert.throws(() => generateForms({ id: 'v', pos: 'verb', conj: 9, stem: 'x' }), /Unknown conjugation/);
});
