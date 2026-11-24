// The Path: the plan (content/curriculum.json) as a short list of stages, with the stage you are on open.
import { h } from './dom.js';
import { meter, lessonRow, lockLine } from './parts.js';
import { summarize, lockInfo } from '../core/scheduler.js';
import { stageStats, currentStage } from '../core/path.js';
import { queueSettings } from '../core/context.js';

export function renderPath(root, app) {
  const { store, content } = app;
  const s = store.state;
  const now = Date.now();
  const paused = queueSettings(s.settings).paused;
  const here = currentStage(content, s.items, paused);
  const rows = new Map();   // "pack.unit" -> its summarize() row, so a lesson row shows what the Learn screen used to
  for (const { pack, units } of summarize(content, s.items, now)) for (const u of units) rows.set(`${pack.id}.${u.unit.id}`, u);

  root.append(h('header', { class: 'page-head' }, h('h1', null, 'Path'),
    h('p', { class: 'sub' }, 'The plan, in order. Continue follows it; use this screen to see where you are or jump to a lesson.')));

  content.stages.forEach((stage, n) => {
    const st = stageStats(stage, s.items, now);
    const isHere = stage === here;
    const locked = st.open === 0;
    const state = locked ? 'Locked' : st.complete ? 'Done' : isHere ? 'You are here' : st.started ? 'Started' : 'Open';
    const details = h('details', { class: `stage${locked ? ' locked' : ''}${isHere ? ' here' : ''}`, open: isHere });
    details.append(h('summary', null,
      h('div', { class: 'stage-top' },
        h('span', { class: 'stage-title' }, h('span', { class: 'stage-n' }, String(n + 1)), stage.title),
        h('span', { class: `stage-state ${isHere ? 'here' : ''}` }, state)),
      meter(st.introduced, st.strong, st.total),
      h('div', { class: 'meta' }, `${st.introduced}/${st.total} met · ${st.strong} known${st.due ? ` · ${st.due} due` : ''} · ${stage.units.length} lessons`)));
    details.append(h('p', { class: 'sub' }, stage.blurb));
    if (locked) {
      const first = stage.units[0];
      const line = lockLine(app, lockInfo(first.pack, first.ui, s.items, content.packs));
      if (line) details.append(line);
    } else {
      details.append(h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary small', onclick: () => app.startSession({ mode: 'stage', scope: { stageId: stage.id } }) }, st.introduced ? 'Study this stage' : 'Start this stage')));
    }
    // lessons are drawn when the stage is opened, so a closed stage costs almost nothing on screen
    let drawn = false;
    const draw = () => {
      if (drawn) return;
      drawn = true;
      details.append(...stage.units.map(({ pack, unit }) => lessonRow(app, pack, rows.get(`${pack.id}.${unit.id}`))));
    };
    if (isHere) draw();
    details.addEventListener('toggle', () => { if (details.open) draw(); });
    root.append(details);
  });
  // (the word list is not part of the plan: it lives on the Words screen)
}
