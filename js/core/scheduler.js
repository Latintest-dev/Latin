// Scheduling: the learning ladder, review intervals, skill strength, unit unlocking.
// Pure functions (state in, state out). No DOM, no storage.
// Practice modes (what a session contains) live in modes.js and build on the helpers here.
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

export function exerciseTypeFor(lvl, rng = Math.random, noL2E = false) {
  if (lvl <= 0) return noL2E || rng() < 0.5 ? 'mc_e2l' : 'mc_l2e';
  if (lvl === 1) return 'fill';
  return 'write';
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeEntry(itemId, lvl, learn, kind, rng = Math.random, item = null) {
  return { itemId, lvl, learn, kind, type: exerciseTypeFor(lvl, rng, !!item?.q) };
}

/** Share (0..1) of a list of items that the learner has met. */
export function introducedShare(items, itemStates) {
  if (!items.length) return 1;
  return items.filter((it) => itemStates[it.id]?.intro).length / items.length;
}

/**
 * Is unit number `ui` of a pack unlocked, given item states?
 * The first unit of a pack opens at once, unless the pack names a unit of another track that must come first
 * (`requires` in pack.json, resolved to `pack.gate` when the content is loaded).
 */
export function unitUnlocked(pack, ui, itemStates) {
  if (ui === 0) return !pack.gate || introducedShare(pack.gate.unit.items, itemStates) >= UNLOCK_RATIO;
  return introducedShare(pack.units[ui - 1].items, itemStates) >= UNLOCK_RATIO;
}

/** What to tell the learner when a unit is locked. */
export function lockReason(pack, ui) {
  if (ui === 0 && pack.gate) return `Introduce most of “${pack.gate.unit.title}” (${pack.gate.packName}) first`;
  return 'Introduce most of the previous unit first';
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
        lock: unitUnlocked(pack, ui, itemStates) ? null : lockReason(pack, ui),
      };
    }),
  }));
}

export function dueItems(items, itemStates, now) {
  return items
    .filter((it) => itemStates[it.id]?.intro && itemStates[it.id].due <= now)
    .sort((a, b) => itemStates[a.id].due - itemStates[b.id].due);
}

export function newItems(pack, itemStates, limit, onlyUnit) {
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

export function countKinds(queue) {
  return {
    review: queue.filter((e) => e.kind === 'review').length,
    fresh: queue.filter((e) => e.kind === 'new').length,
    practice: queue.filter((e) => e.kind === 'practice').length,
  };
}
