// Practice modes added in v0.6: conversations, "change it" drills, linked tracks, paused tracks.
import { loadLexicon as loadLexiconFiles } from '../js/core/content.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFromDisk, validateLoaded } from '../tools/validate.mjs';
import { generateUnit, loadLexicon } from '../tools/generate.mjs';
import { createMemoryBackend } from '../js/core/storage.js';
import { createStore } from '../js/core/store.js';
import { newItemState, summarize, unitUnlocked, DAY } from '../js/core/scheduler.js';
import { buildQueue, MODES, replayMode, CHAIN_COUNT } from '../js/core/modes.js';
import { SessionRunner } from '../js/core/session.js';
import { priorTurns, sceneOf } from '../js/core/content.js';
import { promptKind, promptText, cueText, promptKey } from '../js/engine/items.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = await loadFromDisk();
loadLexicon(await loadLexiconFiles(async (f) => JSON.parse(await readFile(path.join(ROOT, f), 'utf8'))));
let clock = new Date(2026, 10, 19, 12).getTime();
const now = () => clock;
const mkStore = async () => createStore(createMemoryBackend(), { now });
const known = { ...newItemState(), intro: true, lvl: 2, box: 2, due: clock + DAY };
const pack = (id) => content.packs.find((p) => p.id === id);
const meet = (store, items, st = known) => items.forEach((it) => store.putItem(it.id, { ...st }));

test('a track can wait for a unit of another track, and says which', async () => {
  const store = await mkStore();
  const swap = pack('swap');
  assert.ok(swap.gate, 'the swap track names a unit it waits for');
  assert.equal(unitUnlocked(swap, 0, store.state.items), false);
  const lock = summarize(content, store.state.items, clock).find((s) => s.pack.id === 'swap').units[0].lock;
  assert.match(lock, new RegExp(swap.gate.unit.title));
  meet(store, swap.gate.unit.items.slice(0, Math.ceil(swap.gate.unit.items.length * 0.8)));
  assert.equal(unitUnlocked(swap, 0, store.state.items), true);
  assert.equal(unitUnlocked(pack('talk'), 0, {}), false, 'conversations wait for the Latin-only unit');
});

test('Continue draws new sentences only from tracks that are open and switched on', async () => {
  const store = await mkStore();
  const base = { content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'continue', newTotal: 8 };
  const all = buildQueue(base);
  const packsIn = (q) => new Set(q.map((e) => content.packOf.get(e.itemId)));
  assert.ok(!packsIn(all).has('swap') && !packsIn(all).has('talk'), 'locked tracks add nothing');
  const noCore = buildQueue({ ...base, paused: ['core'] });
  assert.ok(!packsIn(noCore).has('core') && packsIn(noCore).size >= 2, 'a paused track adds no new sentences');
  // ...but its reviews still come up
  const id = pack('core').units[0].items[0].id;
  store.putItem(id, { ...known, lvl: 2, due: clock - DAY });
  const q = buildQueue({ ...base, paused: ['core'] });
  assert.ok(q.some((e) => e.itemId === id && e.kind === 'review'));
});

test('"change it" items are Latin prompts with an instruction, and carry their own cue', () => {
  const it = pack('swap').units[0].items[0];
  assert.equal(promptKind(it), 'swap');
  assert.equal(promptText(it), it.swap.from);
  assert.equal(cueText(it), it.swap.change);
  assert.notEqual(it.la, it.swap.from, 'the answer differs from the sentence you were given');
  assert.match(promptKey(it), /\|/);
});

test('each base sentence comes with all its changes, together and in order', () => {
  const want = { 1: 5, 2: 2, 3: 3, 4: 2 };
  for (const unit of pack('swap').units) {
    const groups = new Map();
    unit.items.forEach((it) => groups.set(it.swap.from, [...(groups.get(it.swap.from) || []), it]));
    assert.ok(groups.size >= 7, `unit ${unit.id} has ${groups.size} base sentences`);
    for (const g of groups.values()) assert.equal(g.length, want[unit.id], `unit ${unit.id}: ${g[0].swap.from}`);
    // grouped consecutively in the unit
    const seq = unit.items.map((it) => it.swap.from);
    assert.equal(new Set(seq.map((f, i) => (f === seq[i - 1] ? null : f)).filter(Boolean)).size, groups.size);
  }
});

test('a run of "change it" takes whole bases, one after another, and never schedules', async () => {
  const store = await mkStore();
  const unit = pack('swap').units[0];
  meet(store, unit.items);
  const q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'swap', scope: { packId: 'swap', unitId: unit.id } });
  assert.ok(q.length >= CHAIN_COUNT && q.length < CHAIN_COUNT + 5);
  assert.ok(q.every((e, i) => e.mode === 'swap' && e.nosched && e.step === i + 1 && e.of === q.length));
  const froms = q.map((e) => content.itemsById.get(e.itemId).swap.from);
  assert.ok(froms.every((f, i) => i === 0 || f === froms[i - 1] || !froms.slice(0, i - 1).includes(f)), 'a base is never revisited later in the run');
  // only what has been met is asked
  const store2 = await mkStore();
  meet(store2, unit.items.slice(0, 5));
  const q2 = buildQueue({ content, itemStates: store2.state.items, skills: {}, mistakes: [], now: clock, mode: 'swap', scope: { packId: 'swap', unitId: unit.id } });
  assert.deepEqual(q2.map((e) => e.itemId), unit.items.slice(0, 5).map((i) => i.id));
});

test('drill entries follow the sentence\'s own level: choose, then fill, then write', async () => {
  const store = await mkStore();
  const unit = pack('talk').units[0];
  const [a, b, c] = unit.items;
  store.putItem(a.id, { ...known, lvl: 0 });
  store.putItem(b.id, { ...known, lvl: 1 });
  store.putItem(c.id, { ...known, lvl: 2 });
  const q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'dialogue', scope: { packId: 'talk', unitId: unit.id } });
  assert.deepEqual(q.map((e) => e.type), ['mc_e2l', 'fill', 'write']);
});

test('conversations: turns in order, each with the lines before it and the scene', async () => {
  const unit = pack('talk').units[0];
  const first = unit.items[0];
  const third = unit.items[2];
  assert.equal(third.dlg, first.dlg);
  assert.deepEqual(priorTurns(content, third).map((t) => t.turn), [1, 2]);
  assert.match(sceneOf(content, third), /Marcus/);
  assert.deepEqual(priorTurns(content, first), []);
  assert.equal(sceneOf(content, pack('core').units[0].items[0]), null);
  const store = await mkStore();
  meet(store, unit.items);
  const q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'dialogue', scope: { packId: 'talk', unitId: unit.id } });
  assert.deepEqual(q.map((e) => e.itemId), unit.items.map((i) => i.id));
});

test('every replay button maps to a real mode, and units only name modes that exist', () => {
  for (const p of content.packs) for (const u of p.units) {
    if (u.play) assert.ok(MODES[u.play]?.replay, `${p.id}.${u.id} plays "${u.play}"`);
  }
  assert.equal(replayMode(pack('day').units[0]), 'narrate');
  assert.equal(replayMode(pack('talk').units[0]), 'dialogue');
  assert.equal(replayMode(pack('swap').units[0]), 'swap');
  assert.equal(replayMode(pack('core').units[0]), null);
});

test('in a drill a right answer leaves the schedule alone but a wrong one counts, and its retry is ordinary practice', async () => {
  const store = await mkStore();
  const unit = pack('talk').units[0];
  const [a, b] = unit.items;
  store.putItem(a.id, { ...known, box: 3, due: clock + 8 * DAY });
  store.putItem(b.id, { ...known, box: 3, due: clock + 8 * DAY });
  const entry = (it, step) => ({ itemId: it.id, lvl: 2, learn: false, kind: 'dialogue', mode: 'dialogue', nosched: true, type: 'write', step, of: 2 });
  const runner = new SessionRunner({ queue: [entry(a, 1), entry(b, 2)], store, content, now });
  runner.record({ result: 'correct', given: 'x', expected: 'x' });
  assert.equal(store.getItem(a.id).box, 3);
  assert.equal(store.getItem(a.id).due, clock + 8 * DAY);
  assert.equal(runner.queue.length, 2);
  runner.advance();
  runner.record({ result: 'wrong', given: 'y', expected: 'x' });
  assert.equal(store.getItem(b.id).box, 1, 'a miss cuts the box as usual');
  assert.equal(store.getItem(b.id).lvl, 1);
  const retry = runner.queue[runner.queue.length - 1];
  assert.equal(retry.itemId, b.id);
  assert.equal(retry.kind, 'practice');
  assert.equal(retry.mode, undefined, 'the retry is not a drill step');
  assert.equal(store.state.mistakes.length, 1);
});

test('the new content passes the validator, and the validator catches broken conversations and changes', () => {
  assert.deepEqual(validateLoaded(content).errors, []);
  const broken = structuredClone(content);
  broken.packs = broken.packs.map((p) => ({ ...p, units: p.units.map((u) => ({ ...u, items: u.items.map((i) => ({ ...i })) })) }));
  const talk = broken.packs.find((p) => p.id === 'talk').units[0];
  talk.items[1].turn = 5;                 // out of order
  delete talk.items[0].scene;             // no scene
  talk.play = 'nonsense';
  const swap = broken.packs.find((p) => p.id === 'swap').units[0];
  swap.items[1].swap = { ...swap.items[0].swap }; // the same prompt twice
  swap.items[2].swap = { from: 'Xyzzy.', change: 'Say it' };
  const text = validateLoaded(broken).errors.join('\n');
  assert.match(text, /turns must be 1, 2, 3/);
  assert.match(text, /turn 1 needs a scene/);
  assert.match(text, /not a mode with a replay button/);
  assert.match(text, /duplicate prompt/);
  assert.match(text, /unknown word "xyzzy"/);
});

test('"change it" generation is append-only: a frame is never split, and raising n only adds frames', async () => {
  const gen = JSON.parse(await readFile(path.join(ROOT, 'content/swap/gen/2.json'), 'utf8'));
  const shipped = JSON.parse(await readFile(path.join(ROOT, 'content/swap/u2.json'), 'utf8'));
  const bigger = structuredClone(gen);
  bigger.templates[0].n += 3;
  const again = await generateUnit('swap', bigger, [], shipped);
  assert.deepEqual(again.slice(0, shipped.length).map((i) => i.id), shipped.map((i) => i.id), 'shipped items keep their ids and places');
  assert.ok(again.length > shipped.length && (again.length - shipped.length) % 2 === 0, 'new frames come with both changes');
  const same = await generateUnit('swap', gen, [], shipped);
  assert.equal(same.length, shipped.length, 'nothing is added when nothing was asked for');
});

test('sentences made from chunks start with a capital letter', () => {
  const lower = content.itemsById.get(pack('day').units[2].items[0].id);
  assert.match(lower.la, /^[A-ZĀĒĪŌŪ]/);
  assert.ok(lower.accepted.every((a) => /^[A-ZĀĒĪŌŪ]/.test(a)));
});
