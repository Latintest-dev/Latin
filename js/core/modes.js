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
// ctx = { content, itemStates, skills, mistakes, now, scope, newTotal, newWords, tailWords, paused, follow, rng }
// follow = 'path' (new sentences in the order of the plan, the default) or 'mix' (the tracks take turns).
// newTotal = new sentences, newWords = new words taken from your lessons, tailWords = extra words from the frequency list.
import { MAX_DUE, exerciseTypeFor, makeEntry, shuffle, strength, dueItems, newItems, unitUnlocked } from './scheduler.js';
import { cellsOf, formSkill } from '../engine/forms.js';
import { pathNew } from './path.js';

export const SPEED_COUNT = 10;    // sentences in a speed round
export const CHAIN_COUNT = 12;    // changes in one run of a "Change it" drill
export const REPLAY_MIN = 0.8;    // share of a unit that must be met before its replay button appears
export const FORMS_COUNT = 10;    // questions in a forms practice

/** Seconds allowed for a typed answer in a speed round: generous for phone typing, tight enough to need recall. */
export function speedLimitMs(la) { return 8000 + 450 * String(la).length; }

const findUnit = (content, scope) => {
  const pack = content.packs.find((p) => p.id === scope.packId);
  return pack.units.find((u) => u.id === scope.unitId);
};


/**
 * Word cards to introduce, lesson words first: the words of the sentences about to be introduced (`newSentenceIds`),
 * then words of sentences already met, each group in frequency order. A word you have not yet met as a card but have
 * met in a sentence is exactly the word worth learning next.
 */
export function lessonWordCards(content, itemStates, newSentenceIds, limit) {
  if (limit <= 0 || !content.lesson) return [];
  const have = (w) => itemStates[`vocab.${w}`]?.intro;
  const priority = new Map();
  const add = (ids, pri) => {
    for (const id of ids) {
      for (const w of content.lesson.itemWords.get(id) || []) {
        if (!content.wordRank.has(w) || have(w)) continue;
        if (!priority.has(w) || priority.get(w) > pri) priority.set(w, pri);
      }
    }
  };
  add(newSentenceIds, 0);
  for (const [id, st] of Object.entries(itemStates)) if (st.intro && content.lesson.itemWords.has(id)) add([id], 1);
  return [...priority.entries()]
    .sort((a, b) => a[1] - b[1] || content.wordRank.get(a[0]) - content.wordRank.get(b[0]))
    .slice(0, limit)
    .map(([w]) => content.itemsById.get(`vocab.${w}`));
}

/** Words you have studied: met as a card, or used in a sentence you have met. */
export function studiedWords(content, itemStates) {
  const out = new Set();
  for (const [id, st] of Object.entries(itemStates)) {
    if (!st.intro) continue;
    if (id.startsWith('vocab.')) out.add(id.slice(6));
    for (const w of content.lesson?.itemWords.get(id) || []) out.add(w);
  }
  return out;
}

/** An entry in a drill: marked with its mode, never scheduled; the exercise type follows the sentence's own level. */
function drillEntry(item, itemStates, mode, extra = {}) {
  const lvl = itemStates[item.id]?.lvl ?? 0;
  return { itemId: item.id, lvl, learn: false, kind: mode, mode, nosched: true, type: exerciseTypeFor(lvl, () => 0, true), ...extra };
}

function buildContinue({ content, itemStates, now, newTotal = 6, newWords = 6, tailWords = 2, paused = [], follow = 'path', rng = Math.random }) {
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
  if (follow === 'path' && content.stages) {
    // follow the plan: new sentences come from the stage you are on (its lessons take turns), then the next stage
    for (const it of pathNew(content, itemStates, budget, paused)) queue.push(entryFor(it, 'new'));
  } else {
    // "mix": the open tracks take turns, one sentence each
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
  }
  // Words: first the words of this session's new sentences and of sentences you have met (lesson words), then a few
  // from the top of the frequency list (`tailWords`).
  for (const pack of open.filter((p) => p.budget === 'words')) {
    const picked = lessonWordCards(content, itemStates, queue.filter((e) => e.kind === 'new').map((e) => e.itemId), backlog ? 0 : newWords);
    for (const it of picked) queue.push(entryFor(it, 'new'));
    const taken = new Set(picked.map((it) => it.id));
    for (const it of newItems(pack, itemStates, backlog ? 0 : tailWords + picked.length).filter((it) => !taken.has(it.id)).slice(0, backlog ? 0 : tailWords)) queue.push(entryFor(it, 'new'));
  }
  if (!queue.length) {
    // nothing due, nothing new: practice ahead
    const all = content.packs.flatMap((p) => p.units.flatMap((u) => u.items)).filter((it) => itemStates[it.id]?.intro);
    for (const it of shuffle(all, rng).slice(0, 6)) queue.push(entryFor(it, 'practice'));
  }
  return queue;
}

function buildUnit({ content, itemStates, now, scope, newTotal = 6, rng = Math.random }) {
  const queue = [];
  const pack = content.packs.find((p) => p.id === scope.packId);
  const unit = pack.units.find((u) => u.id === scope.unitId);
  const entryFor = (it, kind) => {
    const lvl = itemStates[it.id]?.lvl ?? 0;
    return makeEntry(it.id, lvl, !itemStates[it.id] || lvl < 2, kind, rng, it);
  };
  for (const it of dueItems(unit.items, itemStates, now).slice(0, MAX_DUE)) queue.push(entryFor(it, 'review'));
  for (const it of newItems(pack, itemStates, newTotal, scope.unitId)) queue.push(entryFor(it, 'new'));
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

/** Practice one skill: the sentences you have met that use it, the ones you have slipped on most first. */
function buildSkill({ content, itemStates, scope = {}, rng = Math.random }) {
  const mine = [];
  for (const it of content.itemsById.values()) {
    if (it.word || !itemStates[it.id]?.intro || !it.skills.includes(scope.skill)) continue;
    mine.push(it);
  }
  mine.sort((a, b) => itemStates[b.id].bad - itemStates[a.id].bad || rng() - 0.5);
  return mine.slice(0, 8).map((it) => {
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


/** A whole stage of the plan: what is due in its units, then new sentences from its open units, in the plan's order. */
function buildStage({ content, itemStates, now, scope, newTotal = 6, rng = Math.random }) {
  const stage = content.stages.find((st) => st.id === scope.stageId);
  const entryFor = (it, kind) => {
    const lvl = itemStates[it.id]?.lvl ?? 0;
    return makeEntry(it.id, lvl, !itemStates[it.id] || lvl < 2, kind, rng, it);
  };
  const queue = [];
  const all = stage.units.flatMap((u) => u.unit.items);
  const due = dueItems(all, itemStates, now);
  for (const it of due.slice(0, MAX_DUE)) queue.push(entryFor(it, 'review'));
  if (due.length <= MAX_DUE) {
    let left = newTotal;
    for (const { pack, unit } of stage.units) {
      if (left <= 0) break;
      const fresh = newItems(pack, itemStates, left, unit.id);
      for (const it of fresh) queue.push(entryFor(it, 'new'));
      left -= fresh.length;
    }
  }
  if (!queue.length) {
    for (const it of shuffle(all.filter((it) => itemStates[it.id]?.intro), rng).slice(0, 8)) queue.push(entryFor(it, 'practice'));
  }
  return queue;
}

/** A session of word cards only: the ones due, then new lesson words, then a few from the frequency list. */
function buildWords({ content, itemStates, now, newWords = 6, tailWords = 2, rng = Math.random }) {
  const pack = content.packs.find((p) => p.budget === 'words');
  const entryFor = (it, kind) => {
    const lvl = itemStates[it.id]?.lvl ?? 0;
    return makeEntry(it.id, lvl, !itemStates[it.id] || lvl < 2, kind, rng, it);
  };
  const queue = [];
  const due = dueItems(pack.units.flatMap((u) => u.items).filter((it) => itemStates[it.id]?.intro), itemStates, now);
  for (const it of due.slice(0, MAX_DUE)) queue.push(entryFor(it, 'review'));
  if (due.length <= MAX_DUE) {
    const picked = lessonWordCards(content, itemStates, [], newWords);
    for (const it of picked) queue.push(entryFor(it, 'new'));
    const taken = new Set(picked.map((it) => it.id));
    for (const it of newItems(pack, itemStates, tailWords + picked.length).filter((it) => !taken.has(it.id)).slice(0, tailWords)) queue.push(entryFor(it, 'new'));
  }
  return queue;
}

/** Quick definition quiz: ten words you have met, asked again with no change to the schedule. */
function buildWordQuiz({ content, itemStates, rng = Math.random }) {
  const pack = content.packs.find((p) => p.budget === 'words');
  const met = pack.units.flatMap((u) => u.items).filter((it) => itemStates[it.id]?.intro);
  return shuffle(met, rng).slice(0, 10).map((it, i) => drillEntry(it, itemStates, 'wordquiz', { step: i + 1, of: Math.min(10, met.length) }));
}

/**
 * Forms practice: the genitive plural of a noun you know, the 3rd person plural of a verb you know. Cells you are weakest
 * at come first (with some chance mixed in). Practice only: skill strength and mistakes are recorded, but no schedule
 * is kept for individual forms (`nostate`).
 */
function buildForms({ content, itemStates, skills = {}, scope = {}, rng = Math.random }) {
  const words = scope.words ? new Set(scope.words) : studiedWords(content, itemStates);
  const cands = [];
  for (const w of words) {
    const e = content.index.lex.get(w);
    if (!e) continue;
    for (const cell of cellsOf(content, w)) {
      const sk = formSkill(e.pos, cell);
      if (scope.skill && sk !== scope.skill) continue;
      const str = strength(skills[sk]);
      cands.push({ w, cell, str, score: (str ?? 0.5) + rng() * 0.6 });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  const perWord = new Map();
  const picked = [];
  for (const c of cands) {
    if (picked.length >= FORMS_COUNT) break;
    if ((perWord.get(c.w) || 0) >= 2) continue;
    // a form needs three different wrong answers; a word whose table cannot supply them (a short noun) is skipped
    if (!content.itemsById.get(`form.${c.w}.${c.cell}`)) continue;
    perWord.set(c.w, (perWord.get(c.w) || 0) + 1);
    picked.push(c);
  }
  return shuffle(picked, rng).map((c, i) => {
    const lvl = c.str == null || c.str < 0.6 ? 0 : c.str < 0.85 ? 1 : 2;
    return {
      itemId: `form.${c.w}.${c.cell}`, lvl, learn: false, kind: 'forms', mode: 'forms', nosched: true, nostate: true,
      type: exerciseTypeFor(lvl, () => 0, true), step: i + 1, of: picked.length, words: [c.w],
    };
  });
}

/**
 * Sentences that use the given words (scope.words): sentences you have met are replayed as practice, and up to three
 * you have not met are taught as new. Only sentences from open units; a word no open lesson uses yet gives nothing.
 */
function buildInUse({ content, itemStates, scope, rng = Math.random }) {
  const ids = new Set();
  for (const w of scope.words || []) for (const id of content.lesson.wordItems.get(w) || []) ids.add(id);
  const open = [...ids].map((id) => content.itemsById.get(id)).filter((it) => {
    const pack = content.packs.find((p) => p.id === content.packOf.get(it.id));
    const ui = pack.units.findIndex((u) => u.id === content.unitOf.get(it.id));
    return unitUnlocked(pack, ui, itemStates);
  });
  const met = shuffle(open.filter((it) => itemStates[it.id]?.intro), rng).slice(0, 8);
  const fresh = open.filter((it) => !itemStates[it.id]?.intro).slice(0, 3);
  return [
    ...met.map((it, i) => drillEntry(it, itemStates, 'inuse', { step: i + 1, of: met.length })),
    ...fresh.map((it) => makeEntry(it.id, 0, true, 'new', rng, it)),
  ];
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
  stage: { build: buildStage },
  words: { build: buildWords },
  weak: { build: buildWeak },
  skill: { build: buildSkill },
  mistakes: { build: buildMistakes },
  speed: { drill: true, build: buildSpeed },
  wordquiz: { drill: true, build: buildWordQuiz },
  forms: { drill: true, build: buildForms },
  inuse: { drill: true, build: buildInUse },
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
