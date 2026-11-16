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
  assert.equal(featureLabel('pres.ind.act.3pl'), '3rd person plural (present tense)');
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

// ---------- tenses, commands, -ne, vocative (v0.2) ----------

test('regular verbs get imperfect, future, perfect and command forms', () => {
  const ambulo = generateForms({ id: 'a', pos: 'verb', conj: 1, stem: 'ambul', pf: 'ambulāv' });
  assert.equal(ambulo['pres.ind.act.1sg'], 'ambulō');
  assert.equal(ambulo['impf.ind.act.1sg'], 'ambulābam');
  assert.equal(ambulo['fut.ind.act.1sg'], 'ambulābō');
  assert.equal(ambulo['perf.ind.act.1sg'], 'ambulāvī');
  assert.equal(ambulo['perf.ind.act.3pl'], 'ambulāvērunt');
  assert.equal(ambulo['imp.act.2sg'], 'ambulā');
  assert.equal(ambulo['imp.act.2pl'], 'ambulāte');

  const video = generateForms({ id: 'v', pos: 'verb', conj: 2, stem: 'vid', pf: 'vīd' });
  assert.equal(video['fut.ind.act.1sg'], 'vidēbō');
  assert.equal(video['impf.ind.act.3sg'], 'vidēbat');

  const lego = generateForms({ id: 'l', pos: 'verb', conj: 3, stem: 'leg', pf: 'lēg' });
  assert.equal(lego['fut.ind.act.1sg'], 'legam');
  assert.equal(lego['fut.ind.act.2sg'], 'legēs');
  assert.equal(lego['impf.ind.act.1sg'], 'legēbam');
  assert.equal(lego['perf.ind.act.2sg'], 'lēgistī');

  const dormio = generateForms({ id: 'd', pos: 'verb', conj: 4, stem: 'dorm', pf: 'dormīv' });
  assert.equal(dormio['fut.ind.act.1sg'], 'dormiam');
  assert.equal(dormio['fut.ind.act.2sg'], 'dormiēs');
  assert.equal(dormio['impf.ind.act.1sg'], 'dormiēbam');
  assert.equal(dormio['imp.act.2sg'], 'dormī');
  assert.equal(dormio['imp.act.2pl'], 'dormīte');

  const facio = generateForms({ id: 'f', pos: 'verb', conj: '3io', stem: 'fac', pf: 'fēc' });
  assert.equal(facio['fut.ind.act.1sg'], 'faciam');
  assert.equal(facio['pres.ind.act.3pl'], 'faciunt');
  assert.equal(facio['imp.act.2sg'], 'face');
});

test('a verb without a perfect stem simply has no perfect forms', () => {
  const f = generateForms({ id: 'x', pos: 'verb', conj: 1, stem: 'am' });
  assert.ok(!('perf.ind.act.1sg' in f));
  assert.equal(f['fut.ind.act.1sg'], 'amābō');
});

test('irregular verbs: sum and eō in every tense', () => {
  const sum = content.index.forms.get('sum');
  assert.equal(sum['fut.ind.act.1sg'], 'erō');
  assert.equal(sum['perf.ind.act.1sg'], 'fuī');
  assert.equal(sum['impf.ind.act.3sg'], 'erat');
  const eo = content.index.forms.get('eo');
  assert.equal(eo['fut.ind.act.1sg'], 'ībō');
  assert.equal(eo['perf.ind.act.1sg'], 'iī');
});

test('vocative: -us nouns change, others do not gain a vocative form', () => {
  const f = content.index.forms.get('marcus');
  assert.equal(f['voc.sg'], 'Mārce');
  assert.ok(!('voc.sg' in content.index.forms.get('iulia')));
  assert.equal(featureLabel('voc.sg'), 'vocative singular');
});

test('tense labels and diffs', () => {
  assert.equal(featureLabel('perf.ind.act.1sg'), '1st person singular (perfect tense)');
  assert.equal(featureLabel('fut.ind.act.3pl'), '3rd person plural (future tense)');
  assert.equal(featureLabel('imp.act.2sg'), 'the command form (to one person)');
  assert.deepEqual(featureDiff('pres.ind.act.1sg', 'perf.ind.act.1sg'), [{ dim: 'tense', from: 'pres', to: 'perf' }]);
  assert.deepEqual(featureDiff('fut.ind.act.1sg', 'fut.ind.act.2sg'), [{ dim: 'person/number', from: '1sg', to: '2sg' }]);
});

test('question particle -ne is parsed off the word', () => {
  const p = parseWord(content.index, 'Fessusne');
  assert.ok(p.length && p.every((x) => x.enc === 'ne'));
  assert.equal(p[0].lexId, 'fessus');
  assert.ok(parseWord(content.index, 'valēsne').some((x) => x.lexId === 'valeo' && x.key === 'pres.ind.act.2sg'));
  assert.ok(parseWord(content.index, 'Esne').some((x) => x.lexId === 'sum'));
  // a real word ending in -ne is not mangled
  assert.ok(parseWord(content.index, 'bene').every((x) => !x.enc));
  assert.deepEqual(parseWord(content.index, 'xyzne'), []);
});

test('checker names tense mistakes', () => {
  const it = content.itemsById.get('daily.4.02'); // Herī pānem ēdī.
  const r = checkText(it.accepted, 'Heri panem edo', { strictMacrons: false }, content.index);
  assert.equal(r.result, 'wrong');
  assert.ok(r.tags.includes('tense:pres>perf'), r.tags.join(','));
  assert.match(r.diag[0].msg, /present tense of .*needs the perfect tense/);
});

test('checker names a missing or extra -ne', () => {
  const it = content.itemsById.get('roman.1.05'); // Fessusne es? (also accepts Esne fessus?)
  assert.equal(checkText(it.accepted, 'fessusne es', {}, content.index).result, 'correct');
  assert.equal(checkText(it.accepted, 'esne fessus?', {}, content.index).result, 'correct');
  const r = checkText(it.accepted, 'Fessus es', {}, content.index);
  assert.equal(r.result, 'wrong');
  assert.ok(r.tags.includes('question:-ne'));
  assert.match(r.diag[0].msg, /yes\/no question/);
  const r2 = checkText(['Fessus sum.'], 'Fessusne sum', {}, content.index);
  assert.ok(r2.tags.includes('question:-ne'));
});

test('future and perfect answers are told apart', () => {
  const it = content.itemsById.get('daily.5.01'); // Crās labōrābō.
  const r = checkText(it.accepted, 'Cras laboravi', {}, content.index);
  assert.equal(r.result, 'wrong');
  assert.ok(r.tags.includes('tense:perf>fut'), r.tags.join(','));
});

test('new content: situation and question items are well-formed', () => {
  const items = [...content.itemsById.values()];
  const sits = items.filter((i) => i.sit);
  const qs = items.filter((i) => i.q);
  assert.ok(sits.length >= 8 && qs.length >= 8);
  for (const i of qs) assert.ok(!i.sit && i.la && i.en);
  assert.ok(items.some((i) => i.modern && i.modernNote));
});

test('validator rejects bad new-style items', () => {
  const bad = structuredClone(content);
  const q = [...bad.itemsById.values()].find((i) => i.q);
  q.q = 'Quid xyzzy agis?';
  q.modern = true; // but no modernNote
  const { errors } = validateLoaded(bad);
  assert.ok(errors.some((e) => e.includes('unknown word "xyzzy"')));
  assert.ok(errors.some((e) => e.includes('modernNote')));
});
