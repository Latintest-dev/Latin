// "Words": look up any word you have met and see how it changes, so you can build your own sentences
// (for example to narrate your real day). Verbs show every person in four tenses with English.

import { h } from './dom.js';
import { generateForms, stripMacrons } from '../engine/latin.js';
import { partsOf, kindLabel } from '../engine/vocab.js';

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

export function renderWords(root, app) {
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

  root.append(
    h('header', { class: 'page-head' }, h('h1', null, 'Words'),
      h('p', { class: 'sub' }, 'Look up a word to see all its forms in every person and tense. Use them to tell yourself about your real day.')),
    search, pills, count, list);
  draw();
}
