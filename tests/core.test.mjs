import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFromDisk } from '../tools/validate.mjs';
import { createMemoryBackend } from '../js/core/storage.js';
import { createStore } from '../js/core/store.js';
import { applyResult, newItemState, buildQueue, summarize, unitUnlocked, strength, DAY, countKinds, makeEntry } from '../js/core/scheduler.js';
import { SessionRunner } from '../js/core/session.js';
import { buildExport, mergeData, validateExport } from '../js/core/transfer.js';

const content = await loadFromDisk();
let clock = 1_700_000_000_000;
const now = () => clock;
const mkStore = async (backend = createMemoryBackend()) => createStore(backend, { now });

test('ladder: correct answers climb, then enter spaced review', () => {
  let s = newItemState();
  s = applyResult(s, 'correct', clock); assert.equal(s.lvl, 1); assert.equal(s.box, 0);
  s = applyResult(s, 'correct', clock); assert.equal(s.lvl, 2); assert.equal(s.box, 0);
  s = applyResult(s, 'correct', clock); assert.equal(s.lvl, 2); assert.equal(s.box, 1);
  assert.equal(s.due, clock + 1 * DAY);
  s = applyResult(s, 'correct', clock); assert.equal(s.box, 2); assert.equal(s.due, clock + 2 * DAY);
  s = applyResult(s, 'wrong', clock);
  assert.equal(s.lvl, 1); assert.equal(s.box, 0); assert.equal(s.due, clock);
  assert.equal(s.bad, 1);
  const c = applyResult(s, 'close', clock);
  assert.equal(c.lvl, s.lvl); assert.equal(c.seen, s.seen);
});

test('a brand-new session shares its new-sentence budget between tracks, first at MC level', async () => {
  const store = await mkStore();
  const q = buildQueue({ content, itemStates: store.state.items, skills: store.state.skills, mistakes: [], now: clock, mode: 'continue', newTotal: 4 });
  assert.equal(q.length, 4);
  // taking turns: one from each track, then the next round starts over
  const packs = q.map((e) => content.packOf.get(e.itemId));
  assert.deepEqual(packs, ['core', 'daily', 'roman', 'day']);
  assert.deepEqual(q.map((e) => e.itemId), ['core.1.01', 'daily.1.01', 'roman.1.01', q[3].itemId]);
  assert.ok(q[3].itemId.startsWith('day.1.'));
  assert.ok(q.every((e) => e.lvl === 0 && e.learn && e.kind === 'new' && e.type.startsWith('mc_')));
});

test('the new-sentence budget is a total, not per track', async () => {
  const store = await mkStore();
  const six = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'continue', newTotal: 6 });
  const two = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'continue', newTotal: 2 });
  assert.equal(six.length, 6);
  assert.equal(two.length, 2);
});

test('Latin-question items are never asked as Latin -> English', async () => {
  const store = await mkStore();
  const qItems = [...content.itemsById.values()].filter((it) => it.q);
  assert.ok(qItems.length >= 5);
  for (let i = 0; i < 40; i++) {
    const e = makeEntry(qItems[0].id, 0, true, 'new', Math.random, qItems[0]);
    assert.equal(e.type, 'mc_e2l');
  }
});

test('session runner: a new sentence is drilled up the ladder within the session', async () => {
  const store = await mkStore();
  const q = buildQueue({ content, itemStates: store.state.items, skills: store.state.skills, mistakes: [], now: clock, mode: 'unit', scope: { packId: 'daily', unitId: '1' }, newTotal: 4 });
  const runner = new SessionRunner({ queue: q, store, content, now });
  const id0 = runner.current.itemId;
  const seenLevels = [];
  let guard = 0;
  while (!runner.done && guard++ < 100) {
    const e = runner.current;
    if (e.itemId === id0) seenLevels.push(e.lvl);
    runner.record({ result: 'correct', given: 'x', expected: 'x' });
    runner.advance();
  }
  assert.deepEqual(seenLevels, [0, 1, 2]);
  const st = store.getItem(id0);
  assert.equal(st.box, 1);
  assert.ok(st.due > clock);
  assert.ok(Object.keys(store.state.skills).length > 0);
  assert.equal(runner.stats().bad, 0);
});

test('session runner: a wrong answer is logged, drops a level and comes back', async () => {
  const store = await mkStore();
  const q = [{ itemId: 'core.1.07', lvl: 0, learn: true, kind: 'new', type: 'mc_e2l' }];
  const runner = new SessionRunner({ queue: q, store, content, now });
  runner.record({ result: 'wrong', given: 'Athēnae in Graeciā est.', expected: 'Athēnae in Graeciā sunt.', diag: [{ msg: 'plural!' }], tags: ['person/number:3sg>3pl'] });
  runner.advance();
  assert.equal(store.state.mistakes.length, 1);
  assert.deepEqual(store.state.mistakes[0].diag, ['plural!']);
  assert.deepEqual(store.state.mistakes[0].skills, ['prep.in.abl', 'sum.3pl', 'vocab.geography']);
  assert.equal(runner.queue.length, 2); // retry queued
  assert.equal(runner.current.itemId, 'core.1.07');
  const sk = store.state.skills['sum.3pl'];
  assert.equal(sk.a, 1); assert.equal(sk.c, 0);
  assert.equal(strength(sk), 0);
  assert.deepEqual(runner.stats().wrongItems, ['core.1.07']);
});

test('due items come back after their interval; backlog holds back new material', async () => {
  const store = await mkStore();
  const first = content.packs[0].units[0].items[0];
  store.putItem(first.id, { ...newItemState(), intro: true, lvl: 2, box: 1, due: clock + DAY });
  let q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock, mode: 'continue', newTotal: 4 });
  assert.ok(!q.some((e) => e.itemId === first.id)); // not yet due
  q = buildQueue({ content, itemStates: store.state.items, skills: {}, mistakes: [], now: clock + 2 * DAY, mode: 'continue', newTotal: 4 });
  assert.equal(q[0].itemId, first.id);
  assert.equal(q[0].kind, 'review');
  assert.equal(q[0].lvl, 2);
  assert.equal(q[0].type, 'write');
  // 12 due items -> only 10 reviews and no new material
  const store2 = await mkStore();
  content.packs[0].units[0].items.concat(content.packs[0].units[1].items.slice(0, 1)).forEach((it) => {
    store2.putItem(it.id, { ...newItemState(), intro: true, lvl: 2, box: 1, due: clock - 1000 });
  });
  q = buildQueue({ content, itemStates: store2.state.items, skills: {}, mistakes: [], now: clock, mode: 'continue', newTotal: 4 });
  const kinds = countKinds(q);
  assert.equal(kinds.review, 10);
  assert.equal(kinds.fresh, 0);
});

test('units unlock after 80% of the previous unit is introduced', async () => {
  const store = await mkStore();
  const pack = content.packs[0];
  assert.equal(unitUnlocked(pack, 1, store.state.items), false);
  const u1 = pack.units[0].items;
  const need = Math.ceil(u1.length * 0.8);
  u1.slice(0, need).forEach((it) => store.putItem(it.id, { ...newItemState(), intro: true }));
  assert.equal(unitUnlocked(pack, 1, store.state.items), true);
  const sum = summarize(content, store.state.items, clock);
  assert.equal(sum[0].units[0].introduced, need);
  assert.equal(sum[0].units[1].unlocked, true);
  assert.equal(sum[0].units[2].unlocked, false);
});

test('weak-spot and mistake modes pick sensible items', async () => {
  const store = await mkStore();
  const [a, b] = content.packs[0].units[0].items;
  store.putItem(a.id, { ...newItemState(), intro: true, bad: 3 });
  store.putItem(b.id, { ...newItemState(), intro: true });
  store.recordSkills(a.skills, false);
  store.recordSkills(b.skills.filter((s) => !a.skills.includes(s)), true);
  let q = buildQueue({ content, itemStates: store.state.items, skills: store.state.skills, mistakes: [], now: clock, mode: 'weak' });
  assert.equal(q[0].itemId, a.id);
  store.addMistake({ itemId: b.id, given: 'x', expected: 'y', diag: [], tags: [], skills: b.skills });
  q = buildQueue({ content, itemStates: store.state.items, skills: store.state.skills, mistakes: store.state.mistakes, now: clock, mode: 'mistakes' });
  assert.deepEqual(q.map((e) => e.itemId), [b.id]);
});

test('storage round-trip: a second store on the same backend sees everything', async () => {
  const backend = createMemoryBackend();
  const s1 = await mkStore(backend);
  s1.putItem('core.1.01', { ...newItemState(), intro: true, lvl: 1 });
  s1.recordSkills(['sum.3sg'], true);
  s1.addMistake({ itemId: 'core.1.01', given: 'a', expected: 'b', diag: [], tags: [], skills: [] });
  s1.addFlag({ itemId: 'core.1.01', kind: 'problem' });
  s1.setSetting('showMacrons', true);
  await s1.flush();
  const s2 = await mkStore(backend);
  assert.equal(s2.getItem('core.1.01').lvl, 1);
  assert.equal(s2.state.skills['sum.3sg'].c, 1);
  assert.equal(s2.state.mistakes.length, 1);
  assert.equal(s2.state.flags.length, 1);
  assert.equal(s2.state.settings.showMacrons, true);
  assert.equal(s2.state.settings.strictMacrons, false); // default kept
});

test('export / import merges by timestamp and unions mistakes', async () => {
  const phone = await mkStore();
  const laptop = await mkStore();
  clock += 1000;
  phone.putItem('core.1.01', { ...newItemState(), intro: true, lvl: 2, box: 1 });
  phone.putItem('core.1.02', { ...newItemState(), intro: true, lvl: 1 });
  phone.addMistake({ itemId: 'core.1.01', given: 'p', expected: 'q', diag: [], tags: [], skills: [] });
  clock += 1000;
  laptop.putItem('core.1.02', { ...newItemState(), intro: true, lvl: 2, box: 2 }); // newer on laptop
  laptop.addMistake({ itemId: 'core.1.02', given: 'l', expected: 'm', diag: [], tags: [], skills: [] });
  laptop.setSetting('strictMacrons', true);
  const fromPhone = JSON.parse(JSON.stringify(phone.snapshot()));
  const summary = await laptop.importData(fromPhone);
  assert.equal(laptop.getItem('core.1.01').box, 1); // new from phone
  assert.equal(laptop.getItem('core.1.02').box, 2); // laptop's newer record kept
  assert.equal(laptop.state.mistakes.length, 2);
  assert.equal(summary.mistakes, 1);
  assert.equal(laptop.state.settings.strictMacrons, true);
  // idempotent
  const again = await laptop.importData(fromPhone);
  assert.deepEqual([again.items, again.mistakes], [0, 0]);
  // and the other direction converges
  await phone.importData(JSON.parse(JSON.stringify(laptop.snapshot())));
  assert.equal(phone.getItem('core.1.02').box, 2);
  assert.equal(phone.state.mistakes.length, 2);
});

test('import rejects foreign or newer files', async () => {
  assert.throws(() => validateExport({ app: 'other' }), /not a Latin app/);
  assert.throws(() => validateExport({ app: 'latin-app', schema: 99 }), /newer version/);
  const s = await mkStore();
  await assert.rejects(() => s.importData({ hello: 1 }));
  assert.doesNotThrow(() => mergeData({ items: {}, skills: {}, mistakes: [], flags: [], settings: { upd: 0 } }, buildExport({ items: {}, skills: {}, mistakes: [], flags: [], settings: { upd: 0 } }, 1)));
});

test('reset clears progress but keeps settings', async () => {
  const backend = createMemoryBackend();
  const s = await mkStore(backend);
  s.setSetting('showMacrons', true);
  s.putItem('core.1.01', { ...newItemState(), intro: true });
  await s.reset();
  assert.deepEqual(s.state.items, {});
  assert.equal(s.state.settings.showMacrons, true);
  const s2 = await mkStore(backend);
  assert.deepEqual(s2.state.items, {});
  assert.equal(s2.state.settings.showMacrons, true);
});
