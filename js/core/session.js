// Runs one practice session: holds the queue, records results, schedules follow-ups.
// No DOM here; the UI calls record() with the outcome of each exercise.

import { applyResult, newItemState, makeEntry } from './scheduler.js';

export class SessionRunner {
  constructor({ queue, store, content, now = () => Date.now(), rng = Math.random, gap = 3 }) {
    this.queue = [...queue];
    this.pos = 0;
    this.store = store;
    this.content = content;
    this.now = now;
    this.rng = rng;
    this.gap = gap;
    this.firstTry = new Map(); // itemId -> true if first answer this session was correct
    this.answered = 0;
  }

  get current() { return this.queue[this.pos]; }
  get remaining() { return Math.max(0, this.queue.length - this.pos); }
  get done() { return this.pos >= this.queue.length; }

  stats() {
    let ok = 0;
    let bad = 0;
    const wrongItems = [];
    for (const [id, good] of this.firstTry) {
      if (good) ok++; else { bad++; wrongItems.push(id); }
    }
    return { ok, bad, wrongItems, answered: this.answered };
  }

  /**
   * outcome = { result: 'correct'|'wrong'|'close', given, expected, diag: [{msg,...}], tags: [] }
   */
  record(outcome) {
    const entry = this.current;
    const item = this.content.itemsById.get(entry.itemId);
    const t = this.now();
    const st0 = this.store.getItem(entry.itemId) || newItemState();
    const st1 = applyResult(st0, outcome.result, t);
    this.store.putItem(entry.itemId, st1);
    this.answered++;

    if (outcome.result !== 'close') {
      this.store.recordSkills(item.skills, outcome.result === 'correct');
      if (!this.firstTry.has(entry.itemId)) this.firstTry.set(entry.itemId, outcome.result === 'correct');
    }
    if (outcome.result === 'wrong') {
      this.store.addMistake({
        itemId: entry.itemId,
        type: entry.type,
        given: outcome.given,
        expected: outcome.expected,
        diag: (outcome.diag || []).map((d) => (typeof d === 'string' ? d : d.msg)),
        tags: outcome.tags || [],
        skills: item.skills,
      });
    }

    let follow = null;
    if (outcome.result === 'close') {
      follow = makeEntry(entry.itemId, st1.lvl, true, entry.kind, this.rng, item);
    } else if (outcome.result === 'wrong') {
      follow = makeEntry(entry.itemId, st1.lvl, true, entry.kind, this.rng, item);
    } else if (entry.learn && entry.lvl < 2) {
      follow = makeEntry(entry.itemId, st1.lvl, true, entry.kind, this.rng, item);
    }
    if (follow) {
      follow.taught = true; // never show the teach card again for a retry or follow-up
      const at = Math.min(this.pos + 1 + this.gap, this.queue.length);
      this.queue.splice(at, 0, follow);
    }
    return st1;
  }

  advance() { this.pos++; }
}
