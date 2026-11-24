// Pieces of screen used in more than one place: a progress meter, a lesson row, the lock line.
import { h } from './dom.js';
import { MODES, REPLAY_MIN, replayMode } from '../core/modes.js';

/** A bar showing how much has been met (light) and how much is known well (dark). */
export const meter = (introduced, strong, total, label) => h('div', { class: 'meter', 'aria-label': label || `${introduced} of ${total} met, ${strong} known` },
  h('div', { class: 'meter-seen', style: `width:${total ? (introduced / total) * 100 : 0}%` }),
  h('div', { class: 'meter-strong', style: `width:${total ? (strong / total) * 100 : 0}%` }));

/**
 * One lesson as a compact row: title, which track it is from, a meter, and what you can do with it.
 * `u` is a row from summarize(): { unit, total, introduced, strong, due, unlocked, lock }.
 */
export function lessonRow(app, pack, u, { showTrack = true } = {}) {
  const { unit, total, introduced, strong, due, unlocked, lock } = u;
  const noun = pack.budget === 'words' ? 'words' : 'sentences';
  const start = (mode, scope) => app.startSession({ mode, scope });
  const row = h('div', { class: `lesson${unlocked ? '' : ' locked'}` },
    h('div', { class: 'lesson-main' },
      h('div', { class: 'lesson-title' }, unit.title, showTrack ? h('span', { class: 'track-chip' }, pack.name) : null),
      unlocked
        ? h('div', { class: 'meta' }, introduced === 0 ? `${total} ${noun} · not started` : `${introduced}/${total} met · ${strong} known${due ? ` · ${due} due` : ''}`)
        : null),
    unlocked
      ? h('div', { class: 'unit-btns' },
        h('button', { class: 'btn small', onclick: () => start('unit', { packId: pack.id, unitId: unit.id }) }, introduced ? 'Practice' : 'Start'),
        replayMode(unit) && introduced / total >= REPLAY_MIN
          ? h('button', { class: 'btn small primary', onclick: () => start(unit.play, { packId: pack.id, unitId: unit.id }) }, MODES[unit.play].replay)
          : null)
      : null);
  if (unlocked) row.append(meter(introduced, strong, total));
  else { const line = lockLine(app, lock); if (line) row.append(line); }
  return row;
}

/** Why a lesson is locked, in words, with a button to the lesson that unlocks it (when that one can be opened). */
export function lockLine(app, lock) {
  if (!lock) return null;
  return h('div', { class: 'lockline' },
    h('span', { class: 'lock' }, '🔒'),
    h('span', null, lock.text),
    lock.open
      ? h('button', { class: 'btn small', onclick: () => app.startSession({ mode: 'unit', scope: { packId: lock.packId, unitId: lock.unitId } }) }, 'Go there')
      : null);
}
