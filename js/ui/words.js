// "Words": everything about single words, in three tabs.
//   Meanings  learn what words mean (word cards come from your lessons first, then the frequency list)
//   Forms     how words change (the genitive plural, the 3rd person plural...), then use them in sentences
//   Look up   search any word and see its whole table
// Verbs show every person in four tenses with English.

import { h } from './dom.js';
import { generateForms, stripMacrons } from '../engine/latin.js';
import { partsOf, kindLabel } from '../engine/vocab.js';
import { summarize, strength } from '../core/scheduler.js';
import { lessonWordCards, studiedWords } from '../core/modes.js';
import { cellsOf } from '../engine/forms.js';
import { meter, lessonRow } from './parts.js';

const PRON = ['I', 'you', 'he/she', 'we', 'you all', 'they'];
const PERSONS = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
const WAS = ['was', 'were', 'was', 'were', 'were', 'were'];
const TENSES = [
  ['pres', 'Now (present)'],
  ['perf', 'Did (perfect)'],
  ['fut', 'Will (future)'],
  ['impf', 'Used to / was (imperfect)'],
];

function baseOf(e) {
  if (e.en?.base) return e.en.base;
  return String(e.gloss || '').split(',')[0].replace(/^to /, '').trim() || null;
}

const BE_NOW = ['am', 'are', 'is', 'are', 'are', 'are'];

/** English for one cell of a verb table, or '' when the lexicon does not carry the needed English form. */
export function englishCell(e, tense, i) {
  const en = e.en || {};
  const base = e.id === 'sum' ? 'be' : baseOf(e);
  if (!base || /^not /.test(base)) return '';
  // "be hungry", "be cold", "be": the verb "to be" has its own forms
  const be = /^be(?: (.+))?$/.exec(base);
  if (be) {
    const rest = be[1] ? ` ${be[1]}` : '';
    if (tense === 'pres') return `${PRON[i]} ${BE_NOW[i]}${rest}`;
    if (tense === 'fut') return `${PRON[i]} will be${rest}`;
    return `${PRON[i]} ${WAS[i]}${rest}`;
  }
  const third = i === 2;
  if (tense === 'pres') return `${PRON[i]} ${third ? (en.s || `${base}s`) : base}`;
  if (tense === 'fut') return `${PRON[i]} will ${base}`;
  if (tense === 'perf') return en.past ? `${PRON[i]} ${en.past}` : '';
  if (tense === 'impf') return en.ing ? `${PRON[i]} ${WAS[i]} ${en.ing}` : '';
  return '';
}

function verbTable(e, f) {
  const rows = [];
  for (const [tense, label] of TENSES) {
    if (!PERSONS.some((p) => f[`${tense}.ind.act.${p}`])) continue;
    rows.push(h('tr', { class: 'tense' }, h('th', { colspan: 2 }, label)));
    PERSONS.forEach((p, i) => {
      const la = f[`${tense}.ind.act.${p}`];
      if (!la) return;
      rows.push(h('tr', null, h('td', { class: 'la' }, la), h('td', { class: 'en' }, englishCell(e, tense, i))));
    });
  }
  const extra = [];
  if (f['pres.inf.act']) extra.push(['to ' + (baseOf(e) || ''), f['pres.inf.act']]);
  if (f['imp.act.2sg']) extra.push(['command (one person)', f['imp.act.2sg']]);
  if (f['imp.act.2pl']) extra.push(['command (several people)', f['imp.act.2pl']]);
  if (extra.length) rows.push(h('tr', { class: 'tense' }, h('th', { colspan: 2 }, 'Other forms')));
  for (const [en, la] of extra) rows.push(h('tr', null, h('td', { class: 'la' }, la), h('td', { class: 'en' }, en)));
  return h('table', { class: 'forms' }, rows);
}

function nounTable(f) {
  const cases = [['nom', 'subject'], ['gen', 'of'], ['dat', 'to / for'], ['acc', 'object'], ['abl', 'in / by / with']];
  const rows = [h('tr', { class: 'tense' }, h('th', null, ''), h('th', null, 'singular'), h('th', null, 'plural'))];
  for (const [c, hint] of cases) {
    if (!f[`${c}.sg`] && !f[`${c}.pl`]) continue;
    rows.push(h('tr', null, h('td', { class: 'en' }, `${c} (${hint})`), h('td', { class: 'la' }, f[`${c}.sg`] || '–'), h('td', { class: 'la' }, f[`${c}.pl`] || '–')));
  }
  return h('table', { class: 'forms' }, rows);
}

function adjTable(f) {
  const rows = [h('tr', { class: 'tense' }, h('th', null, ''), h('th', null, 'm'), h('th', null, 'f'), h('th', null, 'n'))];
  for (const [n, label] of [['sg', 'singular'], ['pl', 'plural']]) {
    rows.push(h('tr', null, h('td', { class: 'en' }, `nominative ${label}`), ['m', 'f', 'n'].map((g) => h('td', { class: 'la' }, f[`nom.${n}.${g}`] || '–'))));
  }
  return h('table', { class: 'forms' }, rows);
}

function detail(e) {
  // a word known from the vocabulary lists has its principal parts and meaning, but no built paradigm yet
  if (e.vocabOnly) {
    return h('div', null,
      h('p', { class: 'sub la' }, partsOf(e)),
      h('p', { class: 'meta' }, `${kindLabel(e)}. Its other forms are not listed here; the principal parts above give you the stems.`));
  }
  let f;
  try { f = generateForms(e); } catch { f = {}; }
  if (e.pos === 'verb') return verbTable(e, f);
  if (e.pos === 'noun') return nounTable(f);
  if (e.pos === 'adj' && f['nom.sg.m']) return adjTable(f);
  const one = f.indecl || e.lemma;
  return h('p', { class: 'sub la' }, one);
}

let tab = 'meanings';   // remembered while the app is open, so coming back to Words lands where you were
const TABS = [['meanings', 'Meanings'], ['forms', 'Forms'], ['lookup', 'Look up']];
const UNITS_PER_PAGE = 20;

export function renderWords(root, app) {
  const body = h('div', { class: 'words-body' });
  const pills = h('div', { class: 'pills tabs' }, TABS.map(([id, label]) => h('button', {
    class: `pill${id === tab ? ' on' : ''}`,
    onclick: () => { tab = id; pills.querySelectorAll('.pill').forEach((x, n) => x.classList.toggle('on', TABS[n][0] === id)); draw(); },
  }, label)));
  root.append(
    h('header', { class: 'page-head' }, h('h1', null, 'Words'),
      h('p', { class: 'sub' }, 'Learn what words mean, how they change, and how they sit in sentences.')),
    pills, body);

  function draw() {
    body.replaceChildren();
    if (tab === 'meanings') drawMeanings(body, app);
    else if (tab === 'forms') drawForms(body, app);
    else drawLookup(body, app);
  }
  draw();
}

// ---------- Meanings ----------

function drawMeanings(root, app) {
  const { store, content } = app;
  const items = store.state.items;
  const wordPack = content.packs.find((p) => p.budget === 'words');
  if (!wordPack) { root.append(h('p', { class: 'sub' }, 'There is no word list in this build.')); return; }
  let total = 0, met = 0, known = 0;
  for (const unit of wordPack.units) {
    for (const it of unit.items) {
      total++;
      const st = items[it.id];
      if (st?.intro) met++;
      if (st && st.box >= 3) known++;
    }
  }
  const waiting = lessonWordCards(content, items, [], 100000).length;
  const start = (mode) => app.startSession({ mode });

  root.append(
    h('div', { class: 'card' },
      h('div', { class: 'skill-top' }, h('span', null, 'Words met'), h('span', { class: 'meta' }, `${met} of ${total} · ${known} known`)),
      meter(met, known, total),
      waiting
        ? h('p', { class: 'meta' }, `${waiting} word${waiting === 1 ? '' : 's'} from sentences you have met are waiting to be learned. Study words takes those first.`)
        : h('p', { class: 'meta' }, 'Words are taught from your lessons first, so this fills in as you go through the Path.')),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: () => start('words') }, 'Study words'),
      h('button', { class: 'btn', disabled: met === 0, onclick: () => start('wordquiz') }, 'Quick quiz')),
    h('h2', null, 'The frequency list'),
    h('p', { class: 'sub' }, 'The most common words first, in groups. You never need to work through it in order: lesson words arrive on their own.'));

  const rows = new Map();
  for (const { pack, units } of summarize(content, items, Date.now())) {
    if (pack.id !== wordPack.id) continue;
    for (const u of units) rows.set(u.unit.id, u);
  }
  const list = h('div', null);
  const more = h('button', { class: 'btn', onclick: () => page() }, 'Show more');
  let shown = 0;
  const page = () => {
    const next = wordPack.units.slice(shown, shown + UNITS_PER_PAGE);
    list.append(...next.map((unit) => lessonRow(app, wordPack, rows.get(unit.id), { showTrack: false })));
    shown += next.length;
    more.hidden = shown >= wordPack.units.length;
  };
  root.append(list, more);
  page();
}

// ---------- Forms ----------

function drawForms(root, app) {
  const { store, content } = app;
  const s = store.state;
  const studied = [...studiedWords(content, s.items)]
    .filter((id) => cellsOf(content, id).length)
    .sort((a, b) => (content.wordRank.get(a) ?? 1e9) - (content.wordRank.get(b) ?? 1e9));

  root.append(
    h('p', { class: 'sub' }, 'Practice how words change: the genitive plural of a noun, the 3rd person plural of a verb. Only words you have already met in lessons come up.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', disabled: !studied.length, onclick: () => app.startSession({ mode: 'forms' }) }, 'Practice forms')));
  if (!studied.length) {
    root.append(h('p', { class: 'meta' }, 'Nothing to practice yet. Words with full tables appear here after you meet them in a lesson.'));
    return;
  }

  const skillRows = Object.entries(content.skills)
    .filter(([id]) => id.startsWith('form.') && s.skills[id])
    .map(([id, meta]) => ({ id, meta, str: strength(s.skills[id]), rec: s.skills[id] }))
    .sort((a, b) => a.str - b.str);
  if (skillRows.length) {
    root.append(h('h2', null, 'How your forms are going'),
      h('div', { class: 'card' }, skillRows.map((r) => h('div', { class: 'skill' },
        h('div', { class: 'skill-top' },
          h('span', null, r.meta.name),
          h('span', { class: 'meta' }, `${r.rec.c}/${r.rec.a}`),
          r.str < 0.8 ? h('button', { class: 'btn small', onclick: () => app.startSession({ mode: 'forms', scope: { skill: r.id } }) }, 'Practice') : null),
        h('div', { class: 'meter' }, h('div', { class: `meter-fill ${r.str < 0.5 ? 'low' : r.str < 0.8 ? 'mid' : 'high'}`, style: `width:${Math.max(r.str * 100, 4)}%` }))))));
  }

  root.append(h('h2', null, 'Pick a word'),
    h('p', { class: 'sub' }, 'See its whole table, drill its forms, or meet it in sentences.'));
  const list = h('div', { class: 'wordlist' });
  const search = h('input', {
    type: 'search', class: 'ans', placeholder: 'Search your words', 'aria-label': 'Search your words', autocomplete: 'off', autocapitalize: 'none',
    oninput: () => drawList(),
  });
  const drawList = () => {
    const q = stripMacrons(search.value.trim().toLowerCase());
    list.replaceChildren();
    const shown = studied.filter((id) => {
      if (!q) return true;
      const e = content.index.lex.get(id);
      return `${stripMacrons(e.lemma)} ${e.gloss || ''}`.toLowerCase().includes(q);
    });
    for (const id of shown.slice(0, 40)) {
      const e = content.index.lex.get(id);
      const uses = content.lesson.wordItems.get(id)?.length || 0;
      const d = h('details', { class: 'word' },
        h('summary', null, h('span', { class: 'la lemma' }, e.lemma), h('span', { class: 'gloss-s' }, e.gloss || '')));
      let built = false;
      d.addEventListener('toggle', () => {
        if (!d.open || built) return;
        built = true;
        const drillable = cellsOf(content, id).some((c) => content.itemsById.get(`form.${id}.${c}`));
        d.append(detail(e), h('div', { class: 'btn-row' },
          h('button', { class: 'btn small primary', disabled: !drillable, onclick: () => app.startSession({ mode: 'forms', scope: { words: [id] } }) }, 'Drill its forms'),
          h('button', { class: 'btn small', disabled: !uses, onclick: () => app.startSession({ mode: 'inuse', scope: { words: [id] } }) },
            uses ? `Use it in sentences (${uses})` : 'No sentences use it yet')));
      });
      list.append(d);
    }
    if (shown.length > 40) list.append(h('p', { class: 'meta' }, 'Keep typing to narrow the list.'));
    if (!shown.length) list.append(h('p', { class: 'meta' }, 'No match.'));
  };
  root.append(search, list);
  drawList();
}

// ---------- Look up ----------

function drawLookup(root, app) {
  const lex = app.content.lexicon.filter((e) => e.lemma);
  const kinds = [['all', 'All'], ['verb', 'Verbs'], ['noun', 'Nouns'], ['other', 'Other']];
  let kind = 'all';
  let query = '';
  const list = h('div', { class: 'wordlist' });
  const count = h('p', { class: 'meta' });

  const matches = (e) => {
    if (kind === 'verb' && e.pos !== 'verb') return false;
    if (kind === 'noun' && e.pos !== 'noun') return false;
    if (kind === 'other' && (e.pos === 'verb' || e.pos === 'noun')) return false;
    if (!query) return true;
    const hay = `${stripMacrons(e.lemma)} ${e.gloss || ''} ${e.en?.base || ''} ${e.en?.sg || ''}`.toLowerCase();
    // match the start of a word, so "eat" finds "to eat" but not "meat" or "great"
    return hay.split(/[^a-z]+/).some((w) => w.startsWith(query)) || hay.includes(` ${query}`);
  };

  function draw() {
    list.replaceChildren();
    // while searching, words that have a full forms table come first; the list-only words follow
    const rank = (e) => (query && e.vocabOnly ? 1 : 0);
    const shown = lex.filter(matches).sort((a, b) => rank(a) - rank(b) || stripMacrons(a.lemma).localeCompare(stripMacrons(b.lemma)));
    count.textContent = `${shown.length} word${shown.length === 1 ? '' : 's'}`;
    for (const e of shown.slice(0, 200)) {
      const d = h('details', { class: 'word' },
        h('summary', null, h('span', { class: 'la lemma' }, e.lemma), h('span', { class: 'gloss-s' }, e.gloss || '')));
      let built = false;
      d.addEventListener('toggle', () => { if (d.open && !built) { built = true; d.append(detail(e)); } });
      list.append(d);
    }
    if (shown.length > 200) list.append(h('p', { class: 'meta' }, 'Keep typing to narrow the list.'));
  }

  const search = h('input', {
    type: 'search', class: 'ans', placeholder: 'Search Latin or English', 'aria-label': 'Search words', autocomplete: 'off', autocapitalize: 'none',
    oninput: () => { query = stripMacrons(search.value.trim().toLowerCase()); draw(); },
  });
  const pills = h('div', { class: 'pills' }, kinds.map(([k, label]) => {
    const b = h('button', { class: `pill${k === kind ? ' on' : ''}`, onclick: () => {
      kind = k;
      pills.querySelectorAll('.pill').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    } }, label);
    return b;
  }));
  root.append(search, pills, count, list);
  draw();
}
