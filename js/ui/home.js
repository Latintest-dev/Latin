import { h } from './dom.js';
import { rich, DAYS } from './format.js';
import { buildQueue, countKinds, summarize } from '../core/scheduler.js';

export function renderHome(root, app) {
  const { store, content } = app;
  const now = Date.now();
  const s = store.state;
  const queue = buildQueue({
    content, itemStates: s.items, skills: s.skills, mistakes: s.mistakes, now,
    mode: 'continue', newTotal: s.settings.newTotal,
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

  const label = kinds.review + kinds.fresh === 0 ? 'Practise' : started ? 'Continue' : 'Start learning';
  const detail = kinds.review + kinds.fresh === 0
    ? 'Nothing is due. Revisit what you know.'
    : [kinds.review ? `${kinds.review} to review` : null, kinds.fresh ? `${kinds.fresh} new` : null].filter(Boolean).join(' · ');
  root.append(h('button', { class: 'btn primary big', onclick: () => app.startSession({ mode: 'continue' }) },
    h('span', null, label), h('small', null, detail)));

  for (const { pack, units } of summarize(content, s.items, now)) {
    root.append(h('section', { class: 'pack' },
      h('h2', null, pack.name),
      h('p', { class: 'sub' }, pack.blurb),
      units.map(({ unit, total, introduced, strong, due, unlocked }) => h('div', { class: `card unit ${unlocked ? '' : 'locked'}` },
        h('div', { class: 'unit-top' },
          h('div', null,
            h('h3', null, unit.title),
            h('p', { class: 'sub' }, rich(unit.blurb, s.settings, { macrons: true }))),
          unlocked
            ? h('button', { class: 'btn small', onclick: () => app.startSession({ mode: 'unit', scope: { packId: pack.id, unitId: unit.id } }) }, introduced ? 'Practise' : 'Start')
            : h('span', { class: 'lock', title: 'Introduce most of the previous unit first' }, '🔒')),
        h('div', { class: 'meter', 'aria-label': `${introduced} of ${total} met, ${strong} known` },
          h('div', { class: 'meter-seen', style: `width:${(introduced / total) * 100}%` }),
          h('div', { class: 'meter-strong', style: `width:${(strong / total) * 100}%` })),
        h('p', { class: 'meta' }, `${introduced}/${total} met · ${strong} known${due ? ` · ${due} due` : ''}`)))));
  }
}
