// Scheduling: the learning ladder, review intervals, skill strength, session queue building.
// Pure functions (state in, state out). No DOM, no storage.
//
// Ladder (per sentence):
//   lvl 0  multiple choice (English -> Latin, or Latin -> English)
//   lvl 1  fill in the blank
//   lvl 2  write the whole sentence
// A correct answer climbs one level (the next appearance comes later in the same session).
// A correct answer at level 2 moves the sentence into spaced review (box 1..6).
// A wrong answer drops one level and cuts the box.

export const DAY = 86400000;
export const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32];
export const STRONG_BOX = 3;      // box at/above which a sentence counts as "known"
export const UNLOCK_RATIO = 0.8;  // share of previous unit that must be introduced
export const MAX_DUE = 10;

export function newItemState() {
  return { lvl: 0, box: 0, due: 0, intro: false, seen: 0, ok: 0, bad: 0, last: 0, upd: 0 };
}

export function applyResult(st, result, now) {
  if (result === 'close') return { ...st, intro: true };
  const s = { ...st, intro: true, seen: st.seen + 1, last: now };
  if (result === 'correct') {
    s.ok = st.ok + 1;
    if (st.lvl < 2) {
      s.lvl = st.lvl + 1;
      s.due = now;
    } else {
      s.box = Math.min(st.box + 1, INTERVAL_DAYS.length - 1);
      s.due = now + INTERVAL_DAYS[s.box] * DAY;
    }
  } else {
    s.bad = st.bad + 1;
    s.lvl = Math.max(0, st.lvl - 1);
    s.box = Math.max(0, st.box - 2);
    s.due = now;
  }
  return s;
}

export function strength(skill) {
  if (!skill || !skill.r || !skill.r.length) return null;
  return skill.r.reduce((a, b) => a + b, 0) / skill.r.length;
}

export function exerciseTypeFor(lvl, rng = Math.random) {
  if (lvl <= 0) return rng() < 0.5 ? 'mc_e2l' : 'mc_l2e';
  if (lvl === 1) return 'fill';
  return 'write';
}

function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeEntry(itemId, lvl, learn, kind, rng = Math.random) {
  return { itemId, lvl, learn, kind, type: exerciseTypeFor(lvl, rng) };
}

/** Is unit number `ui` of a pack unlocked, given item states? */
export function unitUnlocked(pack, ui, itemStates) {
  if (ui === 0) return true;
  const prev = pack.units[ui - 1].items;
  const intro = prev.filter((it) => itemStates[it.id]?.intro).length;
  return intro / prev.length >= UNLOCK_RATIO;
}

/** Per-pack / per-unit progress numbers for the UI. */
export function summarize(content, itemStates, now) {
  return content.packs.map((pack) => ({
    pack,
    units: pack.units.map((unit, ui) => {
      const total = unit.items.length;
      const sts = unit.items.map((it) => itemStates[it.id]);
      return {
        unit,
        total,
        introduced: sts.filter((s) => s?.intro).length,
        strong: sts.filter((s) => s && s.box >= STRONG_BOX).length,
        due: sts.filter((s) => s?.intro && s.due <= now).length,
        unlocked: unitUnlocked(pack, ui, itemStates),
      };
    }),
  }));
}

function dueItems(items, itemStates, now) {
  return items
    .filter((it) => itemStates[it.id]?.intro && itemStates[it.id].due <= now)
    .sort((a, b) => itemStates[a.id].due - itemStates[b.id].due);
}

function newItems(pack, itemStates, limit, onlyUnit) {
  const out = [];
  for (let ui = 0; ui < pack.units.length && out.length < limit; ui++) {
    if (onlyUnit && pack.units[ui].id !== onlyUnit) continue;
    if (!unitUnlocked(pack, ui, itemStates)) break;
    for (const it of pack.units[ui].items) {
      if (!itemStates[it.id]?.intro) out.push(it);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Build the list of exercises for a session.
 * modes: 'continue' (all tracks), 'unit' (scope {packId, unitId}), 'weak', 'mistakes'
 */
export function buildQueue({ content, itemStates, skills, mistakes, now, mode, scope, newPerPack = 2, rng = Math.random }) {
  const queue = [];
  const entryFor = (it, kind) => {
    const st = itemStates[it.id];
    const lvl = st ? st.lvl : 0;
    const learn = !st || lvl < 2;
    return makeEntry(it.id, lvl, learn, kind, rng);
  };

  if (mode === 'continue') {
    const due = [];
    for (const pack of content.packs) {
      due.push(...dueItems(pack.units.flatMap((u) => u.items), itemStates, now));
    }
    due.sort((a, b) => itemStates[a.id].due - itemStates[b.id].due);
    const dueTaken = due.slice(0, MAX_DUE);
    for (const it of dueTaken) queue.push(entryFor(it, 'review'));
    // hold back new material when there is a big review backlog
    const perPack = due.length > MAX_DUE ? 0 : newPerPack;
    for (const pack of content.packs) {
      for (const it of newItems(pack, itemStates, perPack)) queue.push(entryFor(it, 'new'));
    }
    if (!queue.length) {
      // nothing due, nothing new: practise ahead
      const all = content.packs.flatMap((p) => p.units.flatMap((u) => u.items)).filter((it) => itemStates[it.id]?.intro);
      for (const it of shuffle(all, rng).slice(0, 6)) queue.push(entryFor(it, 'practice'));
    }
  } else if (mode === 'unit') {
    const pack = content.packs.find((p) => p.id === scope.packId);
    const unit = pack.units.find((u) => u.id === scope.unitId);
    const due = dueItems(unit.items, itemStates, now).slice(0, MAX_DUE);
    for (const it of due) queue.push(entryFor(it, 'review'));
    for (const it of newItems(pack, itemStates, 4, scope.unitId)) queue.push(entryFor(it, 'new'));
    if (!queue.length) {
      const seen = unit.items.filter((it) => itemStates[it.id]?.intro);
      for (const it of shuffle(seen, rng).slice(0, 8)) queue.push(entryFor(it, 'practice'));
    }
  } else if (mode === 'weak') {
    const scored = [];
    for (const it of content.itemsById.values()) {
      if (!itemStates[it.id]?.intro) continue;
      const ss = it.skills.map((s) => strength(skills[s])).filter((x) => x != null);
      const worst = ss.length ? Math.min(...ss) : 1;
      const bad = itemStates[it.id].bad;
      scored.push({ it, score: worst - Math.min(bad, 5) * 0.02 });
    }
    scored.sort((a, b) => a.score - b.score);
    for (const { it } of scored.slice(0, 8)) queue.push(entryFor(it, 'practice'));
  } else if (mode === 'mistakes') {
    const ids = [];
    for (let i = mistakes.length - 1; i >= 0 && ids.length < 8; i--) {
      const id = mistakes[i].itemId;
      if (!ids.includes(id) && content.itemsById.has(id)) ids.push(id);
    }
    for (const id of ids) queue.push(entryFor(content.itemsById.get(id), 'practice'));
  }
  return queue;
}

export function countKinds(queue) {
  return {
    review: queue.filter((e) => e.kind === 'review').length,
    fresh: queue.filter((e) => e.kind === 'new').length,
    practice: queue.filter((e) => e.kind === 'practice').length,
  };
}
