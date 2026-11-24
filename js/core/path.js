// The Path: the plan in content/curriculum.json seen through the learner's progress.
// Pure functions. The Path screen draws them, and "Continue" uses pathNew() to take its new sentences from the
// stage you are on instead of hopping between tracks.

import { STRONG_BOX, UNLOCK_RATIO, unitUnlocked, introducedShare } from './scheduler.js';

/** Numbers for one stage: how much is met, known and due, whether any lesson in it is open, and whether it is finished. */
export function stageStats(stage, itemStates, now) {
  let total = 0; let introduced = 0; let strong = 0; let due = 0; let open = 0; let done = 0;
  for (const { pack, unit, ui } of stage.units) {
    const sts = unit.items.map((it) => itemStates[it.id]);
    total += unit.items.length;
    introduced += sts.filter((s) => s?.intro).length;
    strong += sts.filter((s) => s && s.box >= STRONG_BOX).length;
    due += sts.filter((s) => s?.intro && s.due <= now).length;
    if (unitUnlocked(pack, ui, itemStates)) open++;
    if (introducedShare(unit.items, itemStates) >= UNLOCK_RATIO) done++;
  }
  return { total, introduced, strong, due, open, complete: done === stage.units.length, started: introduced > 0 };
}

/** A lesson (unit) that has something new in it and can be opened, not switched off in Settings. */
const hasFresh = ({ pack, unit, ui }, itemStates, paused) =>
  !paused.includes(pack.id) && unitUnlocked(pack, ui, itemStates) && unit.items.some((it) => !itemStates[it.id]?.intro);

/** The stage you are on: the first one with a lesson that is open and has sentences you have not met. */
export function currentStage(content, itemStates, paused = []) {
  return content.stages.find((st) => st.units.some((u) => hasFresh(u, itemStates, paused))) ?? content.stages[content.stages.length - 1];
}

/** The next lesson to work on: the first open lesson of the current stage that still has new sentences. */
export function nextLesson(content, itemStates, paused = []) {
  const stage = currentStage(content, itemStates, paused);
  const found = stage.units.find((u) => hasFresh(u, itemStates, paused));
  return found ? { stage, ...found } : null;
}

/**
 * New sentences in the order of the plan. Within a stage the open lessons take turns (so a stage mixes narration,
 * phrases and conversations), and a stage is used up before the next one is started. If the stage you are on cannot
 * fill the budget (the rest of it is locked), the next stage's open lessons make up the difference.
 */
export function pathNew(content, itemStates, budget, paused = []) {
  const picked = [];
  for (const stage of content.stages) {
    if (picked.length >= budget) break;
    const lists = stage.units
      .filter((u) => hasFresh(u, itemStates, paused))
      .map((u) => u.unit.items.filter((it) => !itemStates[it.id]?.intro));
    for (let round = 0; picked.length < budget; round++) {
      let any = false;
      for (const list of lists) {
        if (round < list.length && picked.length < budget) { picked.push(list[round]); any = true; }
      }
      if (!any) break;
    }
  }
  return picked;
}
