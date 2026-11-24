// Architecture guards. These fail when the app grows in a way that breaks the framework (docs/FRAMEWORK.md):
// a setting nothing reads, a mode with no presenter wording for its lesson button, a screen with no tab, a content
// folder nobody registered, a start-up that has become slow. Add a feature through its extension point and these stay green.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFromDisk } from '../tools/validate.mjs';
import { loadContent } from '../js/core/content.js';
import { PACKS } from '../js/modules/registry.js';
import { SETTINGS, DEFAULT_SETTINGS } from '../js/core/settings.js';
import { MODES, FORMS_COUNT, lessonWordCards, studiedWords, buildQueue } from '../js/core/modes.js';
import { PRESENT } from '../js/ui/modes.js';
import { ROUTES } from '../js/ui/routes.js';
import { ITEM_KINDS } from '../js/engine/items.js';
import { FORM_SKILLS, cellsOf } from '../js/engine/forms.js';
import { stageStats, currentStage, nextLesson, pathNew } from '../js/core/path.js';
import { lockInfo, unitUnlocked, newItemState, DAY } from '../js/core/scheduler.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fetchJson = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));
const content = await loadFromDisk();
const clock = new Date(2026, 10, 24, 12).getTime();

async function walk(dir, out = []) {
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    if ((await stat(p)).isDirectory()) await walk(p, out); else out.push(p);
  }
  return out;
}
const jsSources = async () => Promise.all((await walk(path.join(ROOT, 'js'))).filter((f) => f.endsWith('.js')).map(async (f) => [f, await readFile(f, 'utf8')]));

test('every setting is declared completely, has a default, and is read by something other than its own declaration', async () => {
  const files = (await jsSources()).filter(([f]) => !f.endsWith(path.join('core', 'settings.js')));
  for (const s of SETTINGS) {
    assert.ok(s.key && s.label && s.help && s.group, `${s.key}: key, label, help and group are required`);
    assert.ok(Array.isArray(s.affects) && s.affects.length, `${s.key}: say what it affects`);
    assert.ok(s.key in DEFAULT_SETTINGS, `${s.key}: missing from DEFAULT_SETTINGS`);
    if (s.type === 'choice') assert.ok(s.options.some((o) => (Array.isArray(o) ? o[0] : o) === s.default), `${s.key}: default is not one of its options`);
    assert.ok(files.some(([, src]) => src.includes(s.key)), `${s.key}: nothing reads this setting`);
  }
  assert.equal(new Set(SETTINGS.map((s) => s.key)).size, SETTINGS.length, 'a setting key is declared twice');
});

test('every mode a lesson can play exists, and every presenter belongs to a mode', () => {
  for (const pack of content.packs) for (const unit of pack.units) {
    if (unit.play) assert.ok(MODES[unit.play]?.replay, `${pack.id}.${unit.id}: play "${unit.play}" is not a replayable mode`);
  }
  for (const id of Object.keys(PRESENT)) assert.ok(MODES[id], `presenter "${id}" has no mode`);
  for (const [id, m] of Object.entries(MODES)) assert.equal(typeof m.build, 'function', `${id}: build is missing`);
  // a drill mode talks to the learner in its own words
  for (const [id, m] of Object.entries(MODES)) if (m.drill) assert.ok(PRESENT[id], `drill mode "${id}" needs a presenter in ui/modes.js`);
});

test('every screen is a route with a tab and a render function, and routes are unique', () => {
  assert.equal(new Set(ROUTES.map((r) => r.path)).size, ROUTES.length);
  for (const r of ROUTES) {
    assert.ok(r.tab, `route "${r.path}" has no tab label`);
    assert.equal(typeof r.render, 'function');
  }
  assert.ok(ROUTES.length <= 6, 'a bottom tab bar holds at most six tabs; fold new screens into an existing one');
});

test('every kind of item has all of its wording', () => {
  for (const [kind, k] of Object.entries(ITEM_KINDS)) {
    for (const slot of ['teach', 'mc', 'fill', 'write']) assert.ok(k[slot], `${kind}.${slot} is missing`);
    assert.ok(k.placeholder?.fill && k.placeholder?.write, `${kind}: placeholders are missing`);
  }
});

test('every content folder is a registered track, and every registered track has its folder', async () => {
  const dirs = [];
  for (const name of await readdir(path.join(ROOT, 'content'))) if ((await stat(path.join(ROOT, 'content', name))).isDirectory() && name !== 'lexicon') dirs.push(name);
  assert.deepEqual(dirs.sort(), PACKS.map((p) => p.id).sort(), 'content/ folders and js/modules/registry.js disagree');
});

test('every lexicon file named in the index exists and nothing in content/lexicon is unlisted', async () => {
  const index = await fetchJson('content/lexicon/index.json');
  const listed = (index.files || index).map((f) => (typeof f === 'string' ? f : f.file || f.path)).map((f) => path.basename(f));
  const onDisk = (await readdir(path.join(ROOT, 'content/lexicon'))).filter((f) => f !== 'index.json');
  assert.deepEqual(onDisk.sort(), listed.sort());
});

test('the plan places every lesson of every sentence track exactly once, and forms skills have names', () => {
  const seen = new Map();
  for (const st of content.stages) for (const { pack, unit } of st.units) {
    const key = `${pack.id}.${unit.id}`;
    assert.ok(!seen.has(key), `${key} is in two stages`);
    seen.set(key, st.id);
  }
  for (const pack of content.packs.filter((p) => p.budget !== 'words')) {
    for (const unit of pack.units) assert.ok(seen.has(`${pack.id}.${unit.id}`), `${pack.id}.${unit.id} is in no stage (content/curriculum.json)`);
  }
  for (const id of Object.keys(FORM_SKILLS)) assert.ok(content.skills[id], `${id} is not in content.skills`);
});

test('start-up stays fast and light: lazy word cards, content size and load time within budget', async () => {
  const t0 = performance.now();
  const again = await loadContent(fetchJson, PACKS);
  const ms = performance.now() - t0;
  assert.ok(ms < 2500, `loadContent took ${Math.round(ms)} ms (budget 2500 ms in Node)`);
  const pack = again.packs.find((p) => p.budget === 'words');
  const desc = Object.getOwnPropertyDescriptor(pack.units[0].items[0], 'la');
  assert.equal(typeof desc.get, 'function', 'word cards must stay lazy (built when first read)');
  const files = await walk(path.join(ROOT, 'content'));
  let bytes = 0;
  for (const f of files) bytes += (await stat(f)).size;
  assert.ok(bytes < 8 * 1024 * 1024, `content is ${(bytes / 1048576).toFixed(1)} MB (budget 8 MB, it is cached on the phone)`);
  assert.ok(files.length < 200, `${files.length} content files (the service worker caches each one)`);
});

// ---------- the Path, lock lines and forms ----------

const meet = (units, states = {}) => {
  for (const { unit } of units) for (const it of unit.items) states[it.id] = { ...newItemState(), intro: true, box: 3, due: clock + DAY, lvl: 1 };
  return states;
};

test('a new learner is on stage 1, and finishing a stage moves the Path on', () => {
  const first = content.stages[0];
  assert.equal(currentStage(content, {}, []).id, first.id);
  assert.equal(nextLesson(content, {}, []).unit.id, first.units.find((u) => unitUnlocked(u.pack, u.ui, {})).unit.id);
  assert.ok(stageStats(first, {}, clock).open >= 1);
  assert.equal(stageStats(first, {}, clock).complete, false);
  const done = meet(first.units);
  assert.equal(stageStats(first, done, clock).complete, true);
  assert.notEqual(currentStage(content, done, []).id, first.id);
});

test('Path new sentences come from the current stage and respect the budget', () => {
  const picked = pathNew(content, {}, 6, []);
  assert.equal(picked.length, 6);
  const stageOf = (it) => content.stages.find((st) => st.units.some((u) => u.unit.items.includes(it)))?.id;
  assert.equal(new Set(picked.map(stageOf)).size, 1, 'a fresh learner is taught from one stage');
  assert.equal(pathNew(content, {}, 6, content.packs.map((p) => p.id)).length, 0, 'paused tracks add nothing');
});

test('a locked lesson says how many sentences to meet, where, and whether you can go there', () => {
  const pack = content.packs.find((p) => p.id === 'core');
  const info = lockInfo(pack, 1, {}, content.packs);
  assert.match(info.text, /^Meet \d+ more sentences? in “.+” to unlock this\.$/);
  assert.equal(info.packId, 'core');
  assert.equal(info.unitId, pack.units[0].id);
  assert.equal(info.open, true);
  const gated = content.packs.find((p) => p.gate);
  const g = lockInfo(gated, 0, {}, content.packs);
  assert.ok(g.text.includes(gated.gate.packName));
});

test('lesson words come before frequency words, and forms practice only uses words you have met', () => {
  const core1 = content.packs.find((p) => p.id === 'core').units[0];
  const ids = core1.items.slice(0, 3).map((it) => it.id);
  const cards = lessonWordCards(content, {}, ids, 5);
  const inLessons = new Set(ids.flatMap((id) => content.lesson.itemWords.get(id) || []));
  assert.ok(cards.length > 0 && cards.every((c) => inLessons.has(c.word) || content.lesson.wordItems.has(c.word)));
  assert.deepEqual(buildQueue({ mode: 'forms', content, itemStates: {}, skills: {}, scope: {} }), [], 'nothing met means nothing to drill');
  const states = meet(content.stages[0].units);
  const studied = studiedWords(content, states);
  const q = buildQueue({ mode: 'forms', content, itemStates: states, skills: {}, scope: {}, rng: () => 0.5 });
  assert.ok(q.length > 0 && q.length <= FORMS_COUNT);
  for (const e of q) {
    assert.ok(studied.has(e.words[0]), 'forms practice must only use studied words');
    assert.ok(content.itemsById.get(e.itemId), `${e.itemId} must build`);
    assert.ok(cellsOf(content, e.words[0]).length);
  }
});
