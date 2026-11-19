// Practice session screen: teach card -> multiple choice -> fill in the blank -> write.

import { h, clear } from './dom.js';
import { latin, rich } from './format.js';
import { buildQueue, speedLimitMs } from '../core/scheduler.js';
import { SessionRunner } from '../core/session.js';
import { checkText } from '../engine/checker.js';
import { today as todayCount0 } from '../core/activity.js';
const todayCount = (activity, now) => todayCount0(activity, now).n;
import { blankSentence, promptKind, promptText, allowsL2E, cueText } from '../engine/items.js';

function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const words = (s) => new Set(s.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean));

/** Build (and cache on the entry) the four options for a multiple-choice exercise. */
export function mcOptions(entry, item, content, rng = Math.random) {
  if (entry.opts) return entry.opts;
  let opts;
  if (entry.type === 'mc_e2l') {
    opts = [
      { text: item.la, correct: true },
      ...item.distractors.map(([la, why]) => ({ text: la, correct: false, why })),
    ];
  } else {
    const packId = content.packOf.get(item.id);
    const unitId = content.unitOf.get(item.id);
    const sibs = [...content.itemsById.values()].filter(
      (o) => o.id !== item.id && allowsL2E(o) && content.packOf.get(o.id) === packId && o.en.toLowerCase() !== item.en.toLowerCase(),
    );
    const sameUnit = sibs.filter((o) => content.unitOf.get(o.id) === unitId);
    const pool = sameUnit.length >= 3 ? sameUnit : sibs;
    const mine = words(item.en);
    const scored = pool
      .map((o) => ({ o, s: [...words(o.en)].filter((w) => mine.has(w)).length + rng() * 0.5 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 6);
    const picked = shuffle(scored, rng).slice(0, 3).map((x) => x.o);
    opts = [
      { text: item.en, correct: true },
      ...picked.map((o) => ({ text: o.en, correct: false, why: `That means “${o.en}” (_${o.la}_).` })),
    ];
  }
  entry.opts = shuffle(opts, rng);
  return entry.opts;
}

export function renderSession(root, app, params) {
  const { store, content } = app;
  const st = () => store.state.settings;

  const queue = buildQueue({
    content,
    itemStates: store.state.items,
    skills: store.state.skills,
    mistakes: store.state.mistakes,
    now: Date.now(),
    mode: params.mode,
    scope: params.scope,
    newTotal: st().newTotal,
  });

  if (!queue.length) {
    root.append(h('div', { class: 'card center' },
      h('p', null, 'Nothing to practice here yet.'),
      h('a', { class: 'btn primary', href: '#/' }, 'Back')));
    return;
  }

  // unit intro cards for units the learner is about to meet for the first time
  const introUnits = [];
  for (const e of queue) {
    if (e.kind !== 'new') continue;
    const pack = content.packs.find((p) => p.id === content.packOf.get(e.itemId));
    const unit = pack.units.find((u) => u.id === content.unitOf.get(e.itemId));
    const started = unit.items.some((it) => store.state.items[it.id]?.intro);
    if (!started && !introUnits.some((x) => x.unit === unit)) introUnits.push({ pack, unit });
  }

  const runner = new SessionRunner({ queue, store, content });
  let keyHandler = null;
  let enterTimer = null;
  // Only one Enter-key handler exists at a time. Any pending (not yet armed) handler is cancelled
  // whenever the screen changes, so a quick tap on Continue can't leave a stale handler behind.
  const setKey = (fn) => {
    clearTimeout(enterTimer);
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = fn;
    if (fn) document.addEventListener('keydown', fn);
  };
  app.onCleanup(() => setKey(null));
  // Armed after a short delay so the Enter press that submitted an answer doesn't also continue.
  const onEnter = (fn) => {
    setKey(null);
    enterTimer = setTimeout(() => setKey((ev) => {
      if (ev.key === 'Enter' && !ev.repeat) { ev.preventDefault(); fn(); }
    }), 60);
  };

  const chip = (text) => h('span', { class: 'chip' }, text);
  const chips = (item) => h('div', { class: 'chips' }, chip(item.tag), item.modern ? h('span', { class: 'chip modern' }, 'modern coinage') : null);
  const promptNode = (item) => {
    const kind = promptKind(item);
    const cue = cueText(item);
    return kind === 'question'
      ? h('div', { class: 'prompt-wrap' }, h('div', { class: 'prompt la' }, latin(item.q, st())), cue ? h('div', { class: 'cue' }, 'Reply: ', h('em', {}, cue)) : null)
      : h('div', { class: `prompt${kind === 'situation' ? ' situation' : ''}` }, promptText(item));
  };
  const EYEBROW = {
    mc_e2l: { plain: 'Choose the Latin', situation: 'What would you say?', question: 'Choose the reply' },
    fill: { plain: 'Fill in the blank', situation: 'What would you say? Fill in the blank', question: 'Reply in Latin: fill in the blank' },
    write: { plain: 'Write it in Latin', situation: 'What would you say? Write it in Latin', question: 'Reply in Latin' },
  };

  function header() {
    const pct = Math.round((runner.pos / runner.queue.length) * 100);
    return h('div', { class: 'sess-head' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'End session' }, '✕'),
      h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${pct}%` })),
      h('span', { class: 'left' }, `${runner.remaining} left`));
  }

  function showIntros(i = 0) {
    setKey(null);
    clear(root);
    if (i >= introUnits.length) return next();
    const { pack, unit } = introUnits[i];
    root.append(
      h('div', { class: 'card' },
        h('p', { class: 'eyebrow' }, `${pack.name} · new unit`),
        h('h2', null, unit.title),
        h('p', { class: 'intro' }, rich(unit.intro, st(), { macrons: true })),
        h('button', { class: 'btn primary', onclick: () => showIntros(i + 1) }, 'Start')));
    onEnter(() => showIntros(i + 1));
  }

  function next() {
    setKey(null);
    clear(root);
    if (runner.done) return summary();
    const entry = runner.current;
    const item = content.itemsById.get(entry.itemId);
    const body = h('div', { class: 'exercise' });
    root.append(header(), body);
    if (entry.kind === 'new' && entry.lvl === 0 && !entry.taught) {
      entry.taught = true;
      return teach(body, entry, item);
    }
    if (entry.type.startsWith('mc_')) showMc(body, entry, item);
    else showText(body, entry, item);
  }

  function teach(body, entry, item) {
    const kind = promptKind(item);
    // (native append() would print the word "null" for a missing piece, so filter first)
    body.append(...[
      h('p', { class: 'eyebrow' }, kind === 'question' ? 'New question and reply' : kind === 'situation' ? 'New situation' : 'New sentence'),
      promptNode(item),
      h('div', { class: 'answer la' }, latin(item.la, st())),
      kind === 'plain' ? null : h('div', { class: 'gloss' }, item.en),
      chips(item),
      item.modern && item.modernNote ? h('p', { class: 'note' }, rich(item.modernNote, st(), { macrons: true })) : null,
      h('p', { class: 'explain' }, rich(item.explain, st(), { macrons: true })),
      h('button', { class: 'btn primary', onclick: showFirst }, 'Got it'),
    ].filter(Boolean));
    function showFirst() {
      setKey(null);
      clear(root);
      const b = h('div', { class: 'exercise' });
      root.append(header(), b);
      if (entry.type.startsWith('mc_')) showMc(b, entry, item);
      else showText(b, entry, item);
    }
    onEnter(showFirst);
  }

  function showMc(body, entry, item) {
    const e2l = entry.type === 'mc_e2l';
    const opts = mcOptions(entry, item, content);
    body.append(
      h('p', { class: 'eyebrow' }, e2l ? EYEBROW.mc_e2l[promptKind(item)] : 'What does this mean?'),
      e2l ? promptNode(item) : h('div', { class: 'prompt' }, h('span', { class: 'la' }, latin(item.la, st()))),
      chips(item));
    const list = h('div', { class: 'options' });
    const buttons = opts.map((o) => {
      const b = h('button', { class: 'opt', onclick: () => choose(o, b) },
        e2l ? h('span', { class: 'la' }, latin(o.text, st())) : o.text);
      return b;
    });
    buttons.forEach((b) => list.append(b));
    body.append(list);

    function choose(o, b) {
      buttons.forEach((x) => { x.disabled = true; });
      const correctText = opts.find((x) => x.correct).text;
      b.classList.add(o.correct ? 'right' : 'wrong');
      if (!o.correct) buttons[opts.findIndex((x) => x.correct)].classList.add('right');
      finish(body, entry, item, {
        result: o.correct ? 'correct' : 'wrong',
        given: o.text,
        expected: correctText,
        diag: o.correct ? [] : [{ msg: o.why }],
        tags: [],
      });
    }
  }

  function showText(body, entry, item) {
    const fill = entry.type === 'fill';
    const eyebrow = entry.speed ? 'Speed round: write it'
      : entry.kind === 'narrate' ? `Your day, step ${entry.step} of ${entry.of}`
        : EYEBROW[fill ? 'fill' : 'write'][promptKind(item)];
    body.append(h('p', { class: 'eyebrow' }, eyebrow), promptNode(item));
    if (fill) body.append(h('div', { class: 'blank la' }, latin(blankSentence(item), st())));
    body.append(chips(item));

    const input = h('input', {
      type: 'text', class: 'ans', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off',
      spellcheck: false, lang: 'la', placeholder: fill ? 'missing word' : 'type the whole sentence',
      'aria-label': 'Your answer',
    });
    const go = h('button', { class: 'btn primary', disabled: true, onclick: submit }, 'Check');
    const insert = (ch) => {
      input.setRangeText(ch, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end');
      input.dispatchEvent(new Event('input'));
      input.focus();
    };
    const macrons = h('div', { class: 'macrons', 'aria-label': 'Macron keys' },
      ['ā', 'ē', 'ī', 'ō', 'ū'].map((ch) => h('button', {
        type: 'button', class: 'mac', onmousedown: (ev) => ev.preventDefault(), onclick: () => insert(ch),
      }, ch)));
    input.addEventListener('input', () => { go.disabled = !input.value.trim(); });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); if (!go.disabled) submit(); }
    });
    body.append(input, macrons, go);
    setTimeout(() => input.focus(), 50);

    // speed round: a bar runs down; when it empties the answer is checked as it stands
    let ticker = null;
    if (entry.speed) {
      const limit = speedLimitMs(item.la);
      const t0 = Date.now();
      const fillBar = h('div', { class: 'timer-fill' });
      body.insertBefore(h('div', { class: 'timer', 'aria-label': 'Time left' }, fillBar), input);
      ticker = setInterval(() => {
        const left = 1 - (Date.now() - t0) / limit;
        fillBar.style.width = `${Math.max(0, left * 100)}%`;
        if (left <= 0) submit(true);
      }, 100);
      app.onCleanup(() => clearInterval(ticker));
    }

    function submit(late = false) {
      clearInterval(ticker);
      if (late === true && input.disabled) return;
      input.disabled = true;
      go.disabled = true;
      macrons.remove();
      go.remove();
      const accepted = fill ? item.fillAccepted : item.accepted;
      const r = checkText(accepted, input.value, { strictMacrons: st().strictMacrons }, content.index);
      const timedOut = late === true;
      // in a speed round, running out of time means the sentence is not automatic yet
      const result = timedOut && r.result === 'close' ? 'wrong' : r.result;
      input.classList.add(result === 'correct' ? 'right' : result === 'close' ? 'close' : 'wrong');
      finish(body, entry, item, {
        result,
        given: input.value.trim() || '(no answer)',
        expected: fill ? item.la : r.best,
        diag: timedOut && result !== 'correct' ? [{ msg: 'Time ran out. Say it again until it comes without thinking.' }, ...(r.diag || [])] : r.diag,
        tags: r.tags,
        note: r.note,
        kind: r.kind,
        late: timedOut,
      });
    }
  }

  function finish(body, entry, item, out) {
    // drills that must not move the review schedule record a right answer as 'practiceok'
    const drill = entry.speed || entry.nosched;
    runner.record({
      result: drill && out.result === 'correct' ? 'practiceok' : out.result,
      fast: !!entry.speed && !out.late,
      given: out.given, expected: out.expected, diag: out.diag, tags: out.tags,
    });
    const s = st();
    const title = { correct: 'Correct!', wrong: 'Not quite', close: 'Almost' }[out.result];
    const panel = h('div', { class: `feedback ${out.result}`, role: 'status' }, h('h3', null, title));

    if (out.result === 'correct') {
      panel.append(h('div', { class: 'answer la' }, latin(item.la, s)), h('div', { class: 'gloss' }, item.en));
    } else {
      if (out.kind !== 'macron' && entry.type !== 'fill' && !entry.type.startsWith('mc_')) {
        panel.append(h('p', { class: 'yours' }, 'You wrote: ', h('i', { class: 'la' }, out.given)));
      }
      panel.append(h('p', { class: 'label' }, out.result === 'close' ? 'Accepted answer:' : 'Correct answer:'),
        h('div', { class: 'answer la' }, latin(out.expected, s)));
      if (out.note) panel.append(h('p', { class: 'note' }, out.note));
      if (out.diag?.length) {
        panel.append(h('ul', { class: 'diag' }, out.diag.map((d) => h('li', null, rich(d.msg ?? d, s, { macrons: true })))));
      }
    }
    if (out.result === 'correct') {
      panel.append(h('details', null, h('summary', null, 'Why?'), h('p', { class: 'explain' }, rich(item.explain, s, { macrons: true }))));
    } else {
      panel.append(h('p', { class: 'explain' }, rich(item.explain, s, { macrons: true })));
    }

    const row = h('div', { class: 'btn-row' });
    const flag = (kind, label) => {
      const b = h('button', { class: 'btn small ghost', onclick: () => {
        store.addFlag({ itemId: item.id, kind, given: out.given });
        b.textContent = 'Flagged ✓';
        b.disabled = true;
      } }, label);
      return b;
    };
    row.append(h('button', { class: 'btn primary', onclick: proceed }, 'Continue'));
    if (out.kind === 'order') row.append(flag('valid-variant', 'My order is valid'));
    row.append(flag('problem', 'Report a problem'));
    panel.append(row);
    body.append(panel);
    panel.scrollIntoView?.({ block: 'nearest' });
    onEnter(proceed);
  }

  function proceed() {
    runner.advance();
    next();
  }

  function summary() {
    setKey(null);
    const { ok, bad, wrongItems } = runner.stats();
    const total = ok + bad;
    const s = st();
    const speed = params.mode === 'speed';
    const narrate = params.mode === 'narrate';
    const script = narrate ? [...new Set(queue.map((e) => content.itemsById.get(e.itemId)))] : [];
    const goal = s.dailyGoal;
    const doneToday = todayCount(store.state.activity, Date.now());
    root.append(h('div', { class: 'card center' },
      h('p', { class: 'eyebrow' }, speed ? 'Speed round complete' : narrate ? 'Your day, in Latin' : 'Session complete'),
      h('h2', null, !total ? 'Done' : speed ? `${ok} of ${total} in time` : narrate ? `${ok} of ${total} right first time` : `${ok} of ${total} right first time`),
      narrate && script.length
        ? h('div', { class: 'script' },
          h('p', { class: 'la script-la' }, latin(script.map((it) => it.la).join(' '), s)),
          h('details', null, h('summary', null, 'English'), h('p', { class: 'script-en' }, script.map((it) => it.en).join(' '))),
          h('p', { class: 'sub' }, 'Now read it aloud, then tell yourself your own day the same way.'))
        : null,
      h('p', { class: 'meta' }, `Today: ${doneToday} of ${goal} answers`),
      wrongItems.length
        ? h('div', { class: 'tricky' },
          h('p', { class: 'label' }, 'Worth another look:'),
          wrongItems.map((id) => {
            const it = content.itemsById.get(id);
            return h('div', { class: 'tricky-item' }, h('div', { class: 'gloss' }, it.en), h('div', { class: 'la' }, latin(it.la, s)));
          }))
        : h('p', null, 'No slips this time.'),
      h('div', { class: 'btn-row center' },
        h('button', { class: 'btn primary', onclick: () => app.startSession({ mode: 'continue' }) }, 'Keep going'),
        h('a', { class: 'btn', href: '#/' }, 'Home'))));
  }

  showIntros(0);
}
