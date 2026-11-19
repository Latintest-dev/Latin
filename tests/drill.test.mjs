import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFromDisk } from '../tools/validate.mjs';
import { createMemoryBackend } from '../js/core/storage.js';
import { createStore } from '../js/core/store.js';
import { buildQueue, newItemState, speedLimitMs, SPEED_COUNT, DAY } from '../js/core/scheduler.js';
import { SessionRunner } from '../js/core/session.js';
import { dayKey, bump, streak, mergeActivity, today } from '../js/core/activity.js';
import { mergeData } from '../js/core/transfer.js';
import { cueText } from '../js/engine/items.js';

const content = await loadFromDisk();
let clock = new Date(2026, 10, 19, 12).getTime();
const now = () => clock;
const mkStore = async () => createStore(createMemoryBackend(), { now });
const known = { ...newItemState(), intro: true, lvl: 2, box: 2, due: clock + DAY };

test('streak counts consecutive days and survives a not-yet-practiced today', () => {
  let a = {};
  for (const d of [-3, -2, -1]) a = bump(a, clock + d * DAY, true);
  assert.equal(streak(a, clock), 3, 'today empty, yesterday counts');
  a = bump(a, clock, false);
  assert.equal(streak(a, clock), 4);
  assert.deepEqual(today(a, clock), { n: 1, ok: 0 });
  assert.equal(streak({}, clock), 0);
  const gap = bump(bump({}, clock - 3 * DAY, true), clock, true);
  assert.equal(streak(gap, clock), 1, 'a missed day breaks the run');
});

test('activity merges by taking the larger count for each day, so a day is not double counted', () => {
  const k = dayKey(clock);
  const m = mergeActivity({ [k]: { n: 5, ok: 4 } }, { [k]: { n: 8, ok: 3 }, '2026-01-01': { n: 2, ok: 2 } });
  assert.deepEqual(m[k], { n: 8, ok: 4 });
  assert.deepEqual(m['2026-01-01'], { n: 2, ok: 2 });
});

test('activity is recorded by the store, exported, and merged on import', async () => {
  const a = await mkStore();
  a.recordActivity(true); a.recordActivity(false);
  assert.equal(today(a.state.activity, clock).n, 2);
  const snap = a.snapshot();
  assert.equal(snap.activity[dayKey(clock)].n, 2);
  const b = await mkStore();
  await b.importData(snap);
  assert.equal(today(b.state.activity, clock).n, 2);
  const { data } = mergeData({ items: {}, skills: {}, mistakes: [], flags: [], settings: {}, activity: {} }, snap);
  assert.equal(data.activity[dayKey(clock)].ok, 1);
});

test('a drill answer (practiceok) counts as practice but never moves the review schedule', async () => {
  const store = await mkStore();
  const id = [...content.itemsById.keys()][0];
  store.putItem(id, { ...known, box: 3, due: clock + 8 * DAY, fast: 1 });
  const runner = new SessionRunner({ queue: [{ itemId: id, lvl: 2, learn: false, kind: 'speed', type: 'write', speed: true }], store, content, now });
  runner.record({ result: 'practiceok', fast: true, given: 'x', expected: 'x' });
  const st = store.getItem(id);
  assert.equal(st.box, 3); assert.equal(st.due, clock + 8 * DAY);
  assert.equal(st.fast, 2); assert.equal(st.ok >= 1, true);
  assert.equal(runner.queue.length, 1, 'no follow-up is scheduled');
  assert.equal(runner.stats().ok, 1);
  assert.equal(today(store.state.activity, clock).ok, 1);
});

test('speed round: ten known sentences, write level, those answered fast least often come first', async () => {
  const store = await mkStore();
  const ids = [...content.itemsById.keys()].slice(0, 30);
  ids.forEach((id, i) => store.putItem(id, { ...known, fast: i < 20 ? 3 : 0 }));
  const q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'speed' });
  assert.equal(q.length, SPEED_COUNT);
  assert.ok(q.every((e) => e.speed && e.type === 'write' && !e.learn));
  const fastNever = new Set(ids.slice(20));
  assert.ok(q.every((e) => fastNever.has(e.itemId)), 'the ten never-fast sentences are chosen');
  assert.ok(speedLimitMs('Māne surgō.') > 8000);
});

test('speed round needs nothing but met sentences; with fewer than four it uses what is there', async () => {
  const store = await mkStore();
  const ids = [...content.itemsById.keys()].slice(0, 2);
  ids.forEach((id) => store.putItem(id, { ...known, lvl: 1 }));
  const q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'speed' });
  assert.deepEqual(q.map((e) => e.itemId).sort(), ids.sort());
});

test('narrate: the met sentences of a script, in order, without scheduling', async () => {
  const store = await mkStore();
  const pack = content.packs.find((p) => p.id === 'day');
  const unit = pack.units[0];
  assert.ok(unit.narrate, 'the morning script is flagged as narratable');
  unit.items.slice(0, 5).forEach((it) => store.putItem(it.id, { ...known }));
  const q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'narrate', scope: { packId: 'day', unitId: unit.id } });
  assert.deepEqual(q.map((e) => e.itemId), unit.items.slice(0, 5).map((i) => i.id));
  assert.ok(q.every((e, i) => e.nosched && e.type === 'write' && e.step === i + 1 && e.of === 5));
});

test('the day scripts keep the order they were written in', () => {
  const pack = content.packs.find((p) => p.id === 'day');
  const firstWords = pack.units[0].items.map((i) => i.la.split(' ')[0].toLowerCase());
  assert.equal(firstWords[0], 'māne');
  assert.ok(pack.units.every((u) => u.narrate));
  assert.deepEqual(pack.units.map((u) => u.id), ['1', '2', '3', '4']);
});

test('a Latin question shows the English answer as its cue', () => {
  const q = content.itemsById.get('roman.9.01');
  assert.equal(cueText(q), 'I am from Rome.');
  assert.equal(cueText({ q: 'Quid?', en: '“What?” “Nothing.”', cue: 'Say nothing.' }), 'Say nothing.');
  assert.equal(cueText({ en: 'Hello.' }), null);
});
