import { h } from './dom.js';
import { fmtDate } from './format.js';
import { APP_VERSION } from '../version.js';
import { SETTINGS, settingValue } from '../core/settings.js';
import { buildQueue } from '../core/modes.js';
import { queueContext } from '../core/context.js';
import { countKinds, dueItems, MAX_DUE } from '../core/scheduler.js';

export { APP_VERSION };

export function renderSettings(root, app) {
  const { store } = app;
  const s = store.state;
  const msg = h('p', { class: 'status', role: 'status' });
  const say = (text, bad = false) => { msg.textContent = text; msg.className = `status ${bad ? 'bad' : 'good'}`; };

  const toggle = (key, title, desc) => {
    const input = h('input', { type: 'checkbox', checked: !!s.settings[key], onchange: () => store.setSetting(key, input.checked) });
    return h('label', { class: 'toggle' },
      h('span', null, h('strong', null, title), h('small', null, desc)),
      input);
  };

  const stamp = () => new Date().toISOString().slice(0, 10);
  const download = () => {
    const json = JSON.stringify(store.snapshot(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `latin-progress-${stamp()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    store.markExported();
    say('Exported. Keep the file somewhere safe (or send it to your other device).');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(store.snapshot()));
      store.markExported();
      say('Copied to the clipboard. Paste it into Import on your other device.');
    } catch {
      say('Could not copy. Use "Export file" instead.', true);
    }
  };

  const doImport = async (text) => {
    try {
      const sum = await store.importData(JSON.parse(text));
      say(`Imported: ${sum.items} sentences, ${sum.skills} skills, ${sum.mistakes} mistakes updated or added.`);
    } catch (e) {
      say(`Import failed: ${e.message}`, true);
    }
  };
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async () => { const f = fileInput.files[0]; if (f) await doImport(await f.text()); fileInput.value = ''; },
  });
  const paste = h('textarea', { rows: 3, placeholder: 'Paste exported progress here', class: 'paste', 'aria-label': 'Paste exported progress' });

  // which tracks bring in new sentences (reviews of anything already met always come up)
  const trackToggle = (pack) => {
    const input = h('input', {
      type: 'checkbox', checked: !(store.state.settings.pausedPacks || []).includes(pack.id), 'aria-label': `New sentences from ${pack.name}`,
      onchange: () => {
        const paused = new Set(store.state.settings.pausedPacks || []);
        if (input.checked) paused.delete(pack.id); else paused.add(pack.id);
        changed('pausedPacks', [...paused]);
      },
    });
    return h('label', { class: 'toggle' }, h('span', null, h('strong', null, pack.name), h('small', null, pack.blurb)), input);
  };

  // What the next Continue would hold, recomputed whenever a setting changes, so every change has a visible effect.
  const preview = h('div', { class: 'card preview' });
  const drawPreview = () => {
    const now = Date.now();
    const q = buildQueue(queueContext(app, { mode: 'continue' }, now));
    const k = countKinds(q);
    const isWord = (e) => app.content.itemsById.get(e.itemId).word;
    const newWords = q.filter((e) => e.kind === 'new' && isWord(e)).length;
    const newSent = q.filter((e) => e.kind === 'new' && !isWord(e)).length;
    const dueAll = app.content.packs.flatMap((p) => dueItems(p.units.flatMap((u) => u.items), store.state.items, now)).length;
    preview.replaceChildren(
      h('p', { class: 'eyebrow' }, 'Your next Continue'),
      h('p', { class: 'preview-line' }, `${k.review} to review · ${newSent} new sentences · ${newWords} new words`),
      ...(dueAll > MAX_DUE
        ? [h('p', { class: 'hold' }, `New material is paused while ${dueAll} reviews are due, so the settings below cannot add anything yet. Catch up to ${MAX_DUE} or fewer and they apply.`)]
        : []));
  };
  const changed = (key, value) => { store.setSetting(key, value); drawPreview(); };

  const control = (def) => {
    if (def.type === 'toggle') {
      const input = h('input', { type: 'checkbox', checked: !!settingValue(s.settings, def.key), onchange: () => changed(def.key, input.checked) });
      return h('label', { class: 'toggle' }, h('span', null, h('strong', null, def.label), h('small', null, def.help)), input);
    }
    if (def.type === 'choice') {
      const opts = def.options.map((o) => (Array.isArray(o) ? o : [o, String(o)]));
      const cur = settingValue(s.settings, def.key);
      const sel = h('select', { 'aria-label': def.label, onchange: () => changed(def.key, typeof def.default === 'number' ? Number(sel.value) : sel.value) },
        opts.map(([v, text]) => h('option', { value: v, selected: v === cur }, text)));
      return h('label', { class: 'toggle' }, h('span', null, h('strong', null, def.label), h('small', null, def.help)), sel);
    }
    return null;
  };
  const groups = [...new Set(SETTINGS.map((d) => d.group))];

  root.append(
    h('header', { class: 'page-head' }, h('h1', null, 'Settings')),
    preview,
    ...groups.flatMap((g) => {
      const defs = SETTINGS.filter((d) => d.group === g);
      if (defs[0].type === 'tracks') {
        return [h('h2', null, g),
          h('div', { class: 'card' },
            h('p', { class: 'sub' }, defs[0].help),
            ...app.content.packs.filter((p) => p.budget !== 'words').map(trackToggle))];
      }
      return [h('h2', null, g), h('div', { class: 'card' }, defs.map(control))];
    }),

    h('h2', null, 'Your data'),
    h('div', { class: 'card' },
      h('p', { class: 'sub' }, 'Progress is stored only on this device. Export a file to back it up or move it to another device; importing merges it with what is already here.'),
      h('p', { class: 'meta' }, s.meta.lastExport ? `Last export: ${fmtDate(s.meta.lastExport)}` : 'You have not exported yet.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', onclick: download }, 'Export file'),
        h('button', { class: 'btn', onclick: copy }, 'Copy export')),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import file'),
        fileInput),
      paste,
      h('button', { class: 'btn', onclick: () => doImport(paste.value) }, 'Import pasted text'),
      msg),

    h('h2', null, 'Reviewing content'),
    h('div', { class: 'card' },
      h('p', { class: 'sub' }, `You have flagged ${s.flags.length} item${s.flags.length === 1 ? '' : 's'}. Flags are included in your export, so you can send them back for fixing.`)),

    h('h2', null, 'Reset'),
    h('div', { class: 'card' },
      h('button', { class: 'btn danger', onclick: async () => {
        if (confirm('Erase all progress and mistakes on this device? Export first if you might want it back.')) {
          await store.reset();
          say('Progress erased.');
        }
      } }, 'Erase progress')),
    h('p', { class: 'meta center' }, `Latin app v${APP_VERSION}`));
  drawPreview();
}
