import { h } from './dom.js';
import { rich, DAYS } from './format.js';
import { countKinds, summarize } from '../core/scheduler.js';
import { buildQueue, MODES, REPLAY_MIN, replayMode } from '../core/modes.js';
import { streak, today } from '../core/activity.js';

export function renderHome(root, app) {
  const { store, content } = app;
  const now = Date.now();
  const s = store.state;
  const queue = buildQueue({
    content, itemStates: s.items, skills: s.skills, mistakes: s.mistakes, now,
    mode: 'continue', newTotal: s.settings.newTotal, newWords: s.settings.newWords, paused: s.settings.pausedPacks || [],
  });
  const kinds = countKinds(queue);
  const started = Object.values(s.items).some((x) => x.intro);

  root.append(h('header', { class: 'page-head' }, h('h1', null, 'Latin'), h('p', { class: 'sub' }, 'Sentences first, grammar as a side note.')));

  if (app.backend.kind !== 'idb') {
    root.append(h('div', { class: 'banner warn' }, 'Your browser is not letting this app save data, so progress will be lost when you close the page. Try a normal (non-private) window.'));
  } else if (started && (!s.meta.lastExport || now - s.meta.lastExport > 7 * DAYS)) {
    root.append(h('a', { class: 'banner', href: '#/settings' },
      s.meta.lastExport ? 'It has been over a week since your last backup. Export your progress →' : 'Back up your progress: export a file in Settings →'));
  }

  // today's practice and streak
  const goal = s.settings.dailyGoal || 20;
  const n = today(s.activity || {}, now).n;
  const run = streak(s.activity || {}, now);
  root.append(h('div', { class: 'today', 'aria-label': 'Today' },
    h('div', { class: 'today-top' },
      h('span', null, h('strong', null, String(n)), ` of ${goal} answers today`),
      h('span', { class: run ? 'streak on' : 'streak' }, run ? `${run}-day streak` : 'No streak yet')),
    h('div', { class: 'meter' }, h('div', { class: n >= goal ? 'meter-strong' : 'meter-seen', style: `width:${Math.min(100, (n / goal) * 100)}%` }))));

  const label = kinds.review + kinds.fresh === 0 ? 'Practice' : started ? 'Continue' : 'Start learning';
  const detail = kinds.review + kinds.fresh === 0
    ? 'Nothing is due. Revisit what you know.'
    : [kinds.review ? `${kinds.review} to review` : null, kinds.fresh ? `${kinds.fresh} new` : null].filter(Boolean).join(' · ');
  root.append(h('button', { class: 'btn primary big', onclick: () => app.startSession({ mode: 'continue' }) },
    h('span', null, label), h('small', null, detail)));

  const knownCount = Object.entries(s.items).filter(([id, x]) => x.intro && x.lvl >= 2 && !content.itemsById.get(id)?.word).length;
  root.append(h('button', {
    class: 'btn big speed', disabled: knownCount < 4, onclick: () => app.startSession({ mode: 'speed' }),
  }, h('span', null, 'Speed round'), h('small', null, knownCount < 4 ? 'Unlocks once you can write four sentences' : 'Ten sentences you know, against the clock')));

  // one unit as a card: title, a meter, and the buttons for it
  const unitCard = (pack, { unit, total, introduced, strong, due, unlocked, lock }) => h('div', { class: `card unit ${unlocked ? '' : 'locked'}` },
    h('div', { class: 'unit-top' },
      h('div', null,
        h('h3', null, unit.title),
        h('p', { class: 'sub' }, rich(unit.blurb, s.settings, { macrons: true }))),
      unlocked
        ? h('div', { class: 'unit-btns' },
          h('button', { class: 'btn small', onclick: () => app.startSession({ mode: 'unit', scope: { packId: pack.id, unitId: unit.id } }) }, introduced ? 'Practice' : 'Start'),
          replayMode(unit) && introduced / total >= REPLAY_MIN
            ? h('button', { class: 'btn small primary', onclick: () => app.startSession({ mode: unit.play, scope: { packId: pack.id, unitId: unit.id } }) }, MODES[unit.play].replay)
            : null)
        : h('span', { class: 'lock', title: lock }, '🔒')),
    h('div', { class: 'meter', 'aria-label': `${introduced} of ${total} met, ${strong} known` },
      h('div', { class: 'meter-seen', style: `width:${(introduced / total) * 100}%` }),
      h('div', { class: 'meter-strong', style: `width:${(strong / total) * 100}%` })),
    h('p', { class: 'meta' }, `${introduced}/${total} met · ${strong} known${due ? ` · ${due} due` : ''}`));

  for (const { pack, units } of summarize(content, s.items, now)) {
    const paused = (s.settings.pausedPacks || []).includes(pack.id);
    const heading = [
      h('h2', null, pack.name, paused ? h('span', { class: 'paused' }, 'paused') : null),
      h('p', { class: 'sub' }, pack.blurb),
    ];
    if (!pack.vocab) {
      root.append(h('section', { class: 'pack' }, ...heading, units.map((u) => unitCard(pack, u))));
      continue;
    }
    // A word list has dozens of units: show the whole-list totals and the unit you are on, and keep the rest folded.
    const total = units.reduce((n, u) => n + u.total, 0);
    const met = units.reduce((n, u) => n + u.introduced, 0);
    const known = units.reduce((n, u) => n + u.strong, 0);
    const due = units.reduce((n, u) => n + u.due, 0);
    const current = units.find((u) => u.unlocked && u.introduced < u.total) || units[units.length - 1];
    root.append(h('section', { class: 'pack' }, ...heading,
      h('div', { class: 'card' },
        h('div', { class: 'meter', 'aria-label': `${met} of ${total} words met, ${known} known` },
          h('div', { class: 'meter-seen', style: `width:${(met / total) * 100}%` }),
          h('div', { class: 'meter-strong', style: `width:${(known / total) * 100}%` })),
        h('p', { class: 'meta' }, `${met} of ${total} words met · ${known} known${due ? ` · ${due} due` : ''}`)),
      unitCard(pack, current),
      h('details', { class: 'all-units' },
        h('summary', null, `All ${units.length} word units`),
        units.filter((u) => u !== current).map((u) => unitCard(pack, u)))));
  }
}
