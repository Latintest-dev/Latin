import { h } from './dom.js';
import { latin, rich, fmtDate } from './format.js';
import { strength } from '../core/scheduler.js';
import { labelOf } from '../engine/latin.js';

function tagLabel(tag, content) {
  if (tag === 'spelling') return 'Misspelled word';
  if (tag === 'extra-word') return 'Extra word';
  if (tag === 'missing-word') return 'Missing word';
  if (tag === 'question:-ne') return 'Yes/no question ending -ne';
  const [kind, rest] = tag.split(':');
  if (kind === 'word') {
    const [a, b] = rest.split('>');
    const la = content.index.lex.get(a)?.lemma ?? a;
    const lb = content.index.lex.get(b)?.lemma ?? b;
    return `Wrong word: ${la} instead of ${lb}`;
  }
  const [from, to] = rest.split('>');
  return `${kind}: ${labelOf(from)} instead of ${labelOf(to)}`;
}

export function renderProgress(root, app) {
  const { store, content } = app;
  const s = store.state;
  const settings = s.settings;
  const intro = Object.values(s.items).filter((x) => x.intro).length;
  const strong = Object.values(s.items).filter((x) => x.box >= 3).length;

  root.append(h('header', { class: 'page-head' }, h('h1', null, 'Progress'),
    h('p', { class: 'sub' }, `${intro} of ${content.itemsById.size} sentences met · ${strong} known well`)));

  root.append(h('div', { class: 'btn-row' },
    h('button', { class: 'btn', disabled: intro === 0, onclick: () => app.startSession({ mode: 'weak' }) }, 'Practise weak spots'),
    h('button', { class: 'btn', disabled: s.mistakes.length === 0, onclick: () => app.startSession({ mode: 'mistakes' }) }, 'Practise my mistakes')));

  // skills
  const rows = Object.entries(content.skills)
    .map(([id, meta]) => ({ id, meta, rec: s.skills[id], str: strength(s.skills[id]) }))
    .filter((r) => r.str != null)
    .sort((a, b) => a.str - b.str);
  root.append(h('h2', null, 'Skills'));
  if (!rows.length) {
    root.append(h('p', { class: 'sub' }, 'Skills appear here once you have answered a few exercises.'));
  } else {
    root.append(h('div', { class: 'card' }, rows.map((r) => h('div', { class: 'skill' },
      h('div', { class: 'skill-top' },
        h('span', null, rich(r.meta.name, settings)),
        h('span', { class: 'meta' }, `${r.rec.c}/${r.rec.a}`)),
      h('div', { class: 'meter' },
        h('div', { class: `meter-fill ${r.str < 0.5 ? 'low' : r.str < 0.8 ? 'mid' : 'high'}`, style: `width:${Math.max(r.str * 100, 4)}%` }))))));
    root.append(h('p', { class: 'sub' }, 'Bars show your last 12 answers for each skill, weakest first.'));
  }

  // mistake patterns
  const counts = new Map();
  for (const m of s.mistakes) for (const t of m.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  const patterns = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (patterns.length) {
    root.append(h('h2', null, 'Your most common slips'),
      h('div', { class: 'card' }, patterns.map(([t, n]) => h('div', { class: 'skill-top' },
        h('span', null, tagLabel(t, content)), h('span', { class: 'meta' }, `×${n}`)))));
  }

  // recent mistakes
  root.append(h('h2', null, 'Recent mistakes'));
  const recent = [...s.mistakes].reverse().slice(0, 15);
  if (!recent.length) {
    root.append(h('p', { class: 'sub' }, 'No mistakes recorded yet.'));
  } else {
    root.append(...recent.map((m) => {
      const it = content.itemsById.get(m.itemId);
      const mc = m.type?.startsWith('mc_');
      return h('div', { class: 'card mistake' },
        h('div', { class: 'meta' }, fmtDate(m.t)),
        h('div', { class: 'gloss' }, it ? it.en : m.itemId),
        h('div', null, 'You chose/wrote: ', h('i', { class: 'la' }, mc && m.type === 'mc_e2l' ? latin(m.given, settings) : m.given)),
        h('div', null, 'Correct: ', h('i', { class: 'la' }, mc && m.type === 'mc_l2e' ? m.expected : latin(m.expected, settings))),
        (m.diag || []).slice(0, 2).map((d) => h('p', { class: 'explain' }, rich(d, settings, { macrons: true }))));
    }));
  }
}
