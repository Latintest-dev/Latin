// Practice modes: what goes into a session. Pure functions; no DOM, no storage.
//
// A mode is one entry in MODES with a `build(ctx)` that returns a list of queue entries.
//   drill: true   its correct answers never move review dates (they count as practice only, see session.js);
//                 a wrong answer still counts, because a slip is real information.
//   replay: '…'   a unit with `play: "<mode>"` in its pack.json entry shows a button with this label once most of
//                 it has been met; pressing it starts the mode on that unit.
//
// To add a mode: write a builder here, add one line to MODES, and (for its own wording and summary) one entry in
// ui/modes.js. Nothing else in the session screen needs to know about it.
//
// ctx = { content, itemStates, skills, mistakes, now, scope, newTotal, newWords, paused, rng }
import { MAX_DUE, exerciseTypeFor, makeEntry, shuffle, strength, dueItems, newItems } from './scheduler.js';

export const SPEED_COUNT = 10;    // sentences in a speed round
export const CHAIN_COUNT = 12;    // changes in one run of a "Change it" drill
export const REPLAY_MIN = 0.8;    // share of a unit that must be met before its replay button appears

/** Seconds allowed for a typed answer in a speed round: generous for phone typing, tight enough to need recall. */
export function speedLimitMs(la) { return 8000 + 450 * String(la).length; }

const findUnit = (content, scope) => {
  const pack = content.packs.find((p) => p.id === scope.packId);
  return pack.units.find((u) => u.id === scope.unitId);
};

/** An entry in a drill: marked with its mode, never scheduled; the exercise type follows the sentence's own level. */
function drillEntry(item, itemStates, mode, extra = {}) {
  const lvl = itemStates[item.id]?.lvl ?? 0;
  return { itemId: item.id, lvl, learn: false, kind: mode, mode, nosched: true, type: exerciseTypeFor(lvl, () => 0, true), ...extra };
}

function buildContinue({ content, itemStates, now, newTotal = 6, newWords = 6, paused = [], rng = Math.random }) {
  const queue = [];
  const entryFor = (it, kind) => {
    const st = itemStates[it.id];
    const lvl = st ? st.lvl : 0;
    return makeEntry(it.id, lvl, !st || lvl < 2, kind, rng, it);
  };
  const due = [];
  for (const pack of content.packs) due.push(...dueItems(pack.units.flatMap((u) => u.items), itemStates, now));
  due.sort((a, b) => itemStates[a.id].due - itemStates[b.id].due);
  for (const it of due.slice(0, MAX_DUE)) queue.push(entryFor(it, 'review'));
  // Hold back new material when there is a big review backlog; otherwise share the session's new-sentence
  // budget between the tracks that are switched on, one at a time, so adding tracks never makes sessions longer.
  // (Reviews always include every track, switched on or not.)
  const backlog = due.length > MAX_DUE;
  const budget = backlog ? 0 : newTotal;
  // a word track (pack.json: "budget": "words") keeps a budget of its own, so thousands of words never crowd out sentences
  const open = content.packs.filter((p) => !paused.includes(p.id));
  const lists = open.filter((p) => p.budget !== 'words').map((pack) => newItems(pack, itemStates, budget));
  for (let round = 0, taken = 0; taken < budget; round++) {
    let any = false;
    for (const list of lists) {
      if (round < list.length && taken < budget) {
        queue.push(entryFor(list[round], 'new'));
        taken++;
        any = true;
      }
    }
    if (!any) break;
  }
  for (const pack of open.filter((p) => p.budget === 'words')) {
    for (const it of newItems(pack, itemStates, backlog ? 0 : newWords)) queue.push(entryFor(it, 'new'));
  }
  if (!queue.length) {
    // nothing due, nothing new: practice ahead
    const all = content.packs.flatMap((p) => p.units.flatMap((u) => u.items)).filter((it) => itemStates[it.id]?.intro);
    for (const it of shuffle(all, rng).slice(0, 6)) queue.push(entryFor(it, 'practice'));
  }
  return queue;
}

function buildUnit({ content, itemStates, now, scope, rng = Math.random }) {
  const queue = [];
  const pack = content.packs.find((p) => p.id === scope.packId);
  const unit = pack.units.find((u) => u.id === scope.unitId);
  const entryFor = (it, kind) => {
    const lvl = itemStates[it.id]?.lvl ?? 0;
    return makeEntry(it.id, lvl, !itemStates[it.id] || lvl < 2, kind, rng, it);
  };
  for (const it of dueItems(unit.items, itemStates, now).slice(0, MAX_DUE)) queue.push(entryFor(it, 'review'));
  for (const it of newItems(pack, itemStates, 4, scope.unitId)) queue.push(entryFor(it, 'new'));
  if (!queue.length) {
    const seen = unit.items.filter((it) => itemStates[it.id]?.intro);
    for (const it of shuffle(seen, rng).slice(0, 8)) queue.push(entryFor(it, 'practice'));
  }
  return queue;
}

function buildWeak({ content, itemStates, skills, rng = Math.random }) {
  const scored = [];
  for (const it of content.itemsById.values()) {
    if (!itemStates[it.id]?.intro) continue;
    const ss = it.skills.map((s) => strength(skills[s])).filter((x) => x != null);
    const worst = ss.length ? Math.min(...ss) : 1;
    scored.push({ it, score: worst - Math.min(itemStates[it.id].bad, 5) * 0.02 });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 8).map(({ it }) => {
    const lvl = itemStates[it.id].lvl;
    return makeEntry(it.id, lvl, lvl < 2, 'practice', rng, it);
  });
}

function buildMistakes({ content, itemStates, mistakes, rng = Math.random }) {
  const ids = [];
  for (let i = mistakes.length - 1; i >= 0 && ids.length < 8; i--) {
    const id = mistakes[i].itemId;
    if (!ids.includes(id) && content.itemsById.has(id)) ids.push(id);
  }
  return ids.map((id) => {
    const lvl = itemStates[id]?.lvl ?? 0;
    return makeEntry(id, lvl, !itemStates[id] || lvl < 2, 'practice', rng, content.itemsById.get(id));
  });
}

/** Automaticity drill: sentences you can already write. Those you have answered fast least often come first. */
function buildSpeed({ content, itemStates, rng = Math.random }) {
  // (single words are not speed-round material: the round is for whole sentences you can say without thinking)
  const all = [...content.itemsById.values()].filter((it) => !it.word);
  const known = all.filter((it) => itemStates[it.id]?.intro && itemStates[it.id].lvl >= 2);
  const pool = known.length >= 4 ? known : all.filter((it) => itemStates[it.id]?.intro);
  const ranked = shuffle(pool, rng).sort((a, b) => (itemStates[a.id].fast || 0) - (itemStates[b.id].fast || 0));
  return ranked.slice(0, SPEED_COUNT).map((it) => ({
    itemId: it.id, lvl: 2, learn: false, kind: 'speed', mode: 'speed', type: 'write', nosched: true, timed: true,
  }));
}

/** Retell a whole script in order (a unit of the "Narrate your day" track). */
function buildNarrate({ content, itemStates, scope }) {
  const seen = findUnit(content, scope).items.filter((it) => itemStates[it.id]?.intro);
  return seen.map((it, i) => ({
    itemId: it.id, lvl: 2, learn: false, kind: 'narrate', mode: 'narrate', type: 'write', nosched: true, step: i + 1, of: seen.length,
  }));
}

/** Play the met turns of a conversation unit in order, with the earlier lines of each conversation on screen. */
function buildDialogue({ content, itemStates, scope }) {
  const seen = findUnit(content, scope).items.filter((it) => itemStates[it.id]?.intro);
  return seen.map((it, i) => drillEntry(it, itemStates, 'dialogue', { step: i + 1, of: seen.length }));
}

/**
 * A run of a "Change it" unit: a few base sentences, each changed in every way the learner has met
 * (we, they, yesterday, ...), one base after another so the same sentence is turned over and over.
 */
function buildSwap({ content, itemStates, scope, rng = Math.random }) {
  const met = findUnit(content, scope).items.filter((it) => it.swap && itemStates[it.id]?.intro);
  const bases = new Map();
  for (const it of met) {
    if (!bases.has(it.swap.from)) bases.set(it.swap.from, []);
    bases.get(it.swap.from).push(it);
  }
  const picked = [];
  for (const group of shuffle([...bases.values()], rng)) {
    if (picked.length >= CHAIN_COUNT) break;
    picked.push(...group);
  }
  return picked.map((it, i) => drillEntry(it, itemStates, 'swap', { step: i + 1, of: picked.length }));
}

export const MODES = {
  continue: { build: buildContinue },
  unit: { build: buildUnit },
  weak: { build: buildWeak },
  mistakes: { build: buildMistakes },
  speed: { drill: true, build: buildSpeed },
  narrate: { drill: true, replay: 'Narrate it', build: buildNarrate },
  dialogue: { drill: true, replay: 'Play it', build: buildDialogue },
  swap: { drill: true, replay: 'Run the drill', build: buildSwap },
};

export function buildQueue(ctx) {
  const mode = MODES[ctx.mode];
  if (!mode) throw new Error(`Unknown practice mode: ${ctx.mode}`);
  return mode.build(ctx);
}

/** The mode a unit's replay button starts, or null. */
export function replayMode(unit) {
  return unit.play && MODES[unit.play]?.replay ? unit.play : null;
}
