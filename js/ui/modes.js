// How each drill mode talks to the learner: the line above the exercise and what the summary shows.
// (What a mode puts in a session lives in core/modes.js. A mode with no entry here simply uses the ordinary wording.)
import { h } from './dom.js';
import { latin } from './format.js';

/** The unique items of a drill queue, in the order they were played. */
const played = (queue, content) => [...new Set(queue.map((e) => content.itemsById.get(e.itemId)))];

/** "Narrate your day": the whole script as one Latin paragraph, with the English tucked away. */
function narrateRecap({ queue, content, settings }) {
  const script = played(queue, content);
  if (!script.length) return null;
  return h('div', { class: 'script' },
    h('p', { class: 'la script-la' }, latin(script.map((it) => it.la).join(' '), settings)),
    h('details', null, h('summary', null, 'English'), h('p', { class: 'script-en' }, script.map((it) => it.en).join(' '))),
    h('p', { class: 'sub' }, 'Now read it aloud, then tell yourself your own day the same way.'));
}

/** "Conversations": each conversation played, as a transcript to read aloud. */
function dialogueRecap({ queue, content, settings }) {
  const turns = played(queue, content).filter((it) => it.dlg);
  if (!turns.length) return null;
  const byDialogue = new Map();
  for (const it of turns) {
    if (!byDialogue.has(it.dlg)) byDialogue.set(it.dlg, []);
    byDialogue.get(it.dlg).push(it);
  }
  return h('div', { class: 'script dlg-recap' },
    [...byDialogue.values()].map((lines) => h('div', { class: 'dlg' },
      lines.flatMap((it) => [
        h('div', { class: 'bubble them' }, h('span', { class: 'la' }, latin(it.q, settings))),
        h('div', { class: 'bubble you' }, h('span', { class: 'la' }, latin(it.la, settings))),
      ]))),
    h('details', null, h('summary', null, 'English'),
      turns.map((it) => h('p', { class: 'script-en' }, it.en))),
    h('p', { class: 'sub' }, 'Read both sides aloud. Then play it again and answer without looking.'));
}

export const PRESENT = {
  speed: {
    eyebrow: () => 'Speed round: write it',
    done: 'Speed round complete',
    score: (ok, total) => `${ok} of ${total} in time`,
  },
  narrate: {
    eyebrow: (e) => `Your day, step ${e.step} of ${e.of}`,
    done: 'Your day, in Latin',
    recap: narrateRecap,
  },
  dialogue: {
    eyebrow: (e) => `Conversation, line ${e.step} of ${e.of}`,
    done: 'Conversation complete',
    recap: dialogueRecap,
  },
  swap: {
    eyebrow: (e) => `Change it, ${e.step} of ${e.of}`,
    done: 'Drill complete',
  },
};
