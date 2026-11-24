// Today: what to do now. One big button, today's progress, the next lesson, and a few shortcuts.
// (The plan itself is on the Path screen; the settings that shape a session are on Settings.)
import { h } from './dom.js';
import { DAYS } from './format.js';
import { countKinds, dueItems, MAX_DUE } from '../core/scheduler.js';
import { buildQueue } from '../core/modes.js';
import { queueContext } from '../core/context.js';
import { currentStage, nextLesson, stageStats } from '../core/path.js';
import { streak, today } from '../core/activity.js';

export function renderHome(root, app) {
  const { store, content } = app;
  const now = Date.now();
  const s = store.state;
  const ctx = queueContext(app, { mode: 'continue' }, now);
  const queue = buildQueue(ctx);
  const kinds = countKinds(queue);
  const started = Object.values(s.items).some((x) => x.intro);
  const dueAll = content.packs.flatMap((p) => dueItems(p.units.flatMap((u) => u.items), s.items, now)).length;
  const held = dueAll > MAX_DUE;

  root.append(h('header', { class: 'page-head' }, h('h1', null, 'Today')));

  if (app.backend.kind !== 'idb') {
    root.append(h('div', { class: 'banner warn' }, 'Your browser is not letting this app save data, so progress will be lost when you close the page. Try a normal (non-private) window.'));
  } else if (started && (!s.meta.lastExport || now - s.meta.lastExport > 7 * DAYS)) {
    root.append(h('a', { class: 'banner', href: '#/settings' },
      s.meta.lastExport ? 'It has been over a week since your last backup. Export your progress →' : 'Back up your progress: export a file in Settings →'));
  }

  const goal = s.settings.dailyGoal || 20;
  const n = today(s.activity || {}, now).n;
  const run = streak(s.activity || {}, now);
  root.append(h('div', { class: 'today', 'aria-label': 'Today' },
    h('div', { class: 'today-top' },
      h('span', null, h('strong', null, String(n)), ` of ${goal} answers today`),
      h('span', { class: run ? 'streak on' : 'streak' }, run ? `${run}-day streak` : 'No streak yet')),
    h('div', { class: 'meter' }, h('div', { class: n >= goal ? 'meter-strong' : 'meter-seen', style: `width:${Math.min(100, (n / goal) * 100)}%` }))));

  // Continue says where it is going, so it never feels like it jumps somewhere unannounced
  const stage = currentStage(content, s.items, ctx.paused);
  const label = kinds.review + kinds.fresh === 0 ? 'Practice' : started ? 'Continue' : 'Start learning';
  const parts = kinds.review + kinds.fresh === 0
    ? 'Nothing is due. Revisit what you know.'
    : [kinds.review ? `${kinds.review} to review` : null, kinds.fresh ? `${kinds.fresh} new` : null].filter(Boolean).join(' · ');
  const where = ctx.follow === 'path' && kinds.fresh ? `${parts} · stage ${content.stages.indexOf(stage) + 1}: ${stage.title}` : parts;
  root.append(h('button', { class: 'btn primary big', onclick: () => app.startSession({ mode: 'continue' }) }, h('span', null, label), h('small', null, where)));
  if (held) {
    root.append(h('p', { class: 'hold' }, `New material is paused while ${dueAll} reviews are due (it resumes at ${MAX_DUE} or fewer). Each Continue works through ${MAX_DUE} of them.`));
  }

  // the next lesson of the plan
  const next = nextLesson(content, s.items, ctx.paused);
  if (next) {
    const st = stageStats(next.stage, s.items, now);
    root.append(h('div', { class: 'card next' },
      h('p', { class: 'eyebrow' }, `Up next · stage ${content.stages.indexOf(next.stage) + 1} of ${content.stages.length}`),
      h('h3', null, next.unit.title),
      h('p', { class: 'sub' }, `${next.pack.name}. ${st.introduced}/${st.total} of “${next.stage.title}” met.`),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small primary', onclick: () => app.startSession({ mode: 'unit', scope: { packId: next.pack.id, unitId: next.unit.id } }) }, 'Start this lesson'),
        h('a', { class: 'btn small', href: '#/path' }, 'See the Path'))));
  }

  const knownCount = Object.entries(s.items).filter(([id, x]) => x.intro && x.lvl >= 2 && !content.itemsById.get(id)?.word).length;
  root.append(h('button', {
    class: 'btn big speed', disabled: knownCount < 4, onclick: () => app.startSession({ mode: 'speed' }),
  }, h('span', null, 'Speed round'), h('small', null, knownCount < 4 ? 'Unlocks once you can write four sentences' : 'Ten sentences you know, against the clock')));

  root.append(h('div', { class: 'btn-row' },
    h('button', { class: 'btn', disabled: !started, onclick: () => app.startSession({ mode: 'weak' }) }, 'Weak spots'),
    h('button', { class: 'btn', disabled: !s.mistakes.length, onclick: () => app.startSession({ mode: 'mistakes' }) }, `My mistakes${s.mistakes.length ? ` (${Math.min(s.mistakes.length, 99)})` : ''}`)));
}
