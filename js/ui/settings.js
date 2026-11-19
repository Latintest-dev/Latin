import { h } from './dom.js';
import { fmtDate } from './format.js';
import { APP_VERSION } from '../version.js';

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

  const newSel = h('select', { onchange: () => store.setSetting('newTotal', Number(newSel.value)), 'aria-label': 'New sentences per session' },
    [3, 4, 6, 8, 10, 12].map((n) => h('option', { value: n, selected: n === s.settings.newTotal }, String(n))));

  const goalSel = h('select', { onchange: () => store.setSetting('dailyGoal', Number(goalSel.value)), 'aria-label': 'Daily goal in answers' },
    [10, 20, 30, 50, 80].map((n) => h('option', { value: n, selected: n === (s.settings.dailyGoal || 20) }, String(n))));

  // which tracks bring in new sentences (reviews of anything already met always come up)
  const trackToggle = (pack) => {
    const input = h('input', {
      type: 'checkbox', checked: !(store.state.settings.pausedPacks || []).includes(pack.id), 'aria-label': `New sentences from ${pack.name}`,
      onchange: () => {
        const paused = new Set(store.state.settings.pausedPacks || []);
        if (input.checked) paused.delete(pack.id); else paused.add(pack.id);
        store.setSetting('pausedPacks', [...paused]);
      },
    });
    return h('label', { class: 'toggle' }, h('span', null, h('strong', null, pack.name), h('small', null, pack.blurb)), input);
  };

  root.append(
    h('header', { class: 'page-head' }, h('h1', null, 'Settings')),
    h('div', { class: 'card' },
      toggle('showMacrons', 'Show macrons', 'Display long vowels (ā ē ī ō ū) in Latin sentences. Explanations always show them.'),
      toggle('strictMacrons', 'Require macrons in answers', 'When on, answers typed without the right macrons count as "almost".'),
      h('label', { class: 'toggle' },
        h('span', null, h('strong', null, 'New sentences per session'), h('small', null, 'Shared between your tracks, taking turns. Reviews always come first.')),
        newSel),
      h('label', { class: 'toggle' },
        h('span', null, h('strong', null, 'Daily goal'), h('small', null, 'Answers per day that make a full day. A little every day beats a lot once a week.')),
        goalSel)),

    h('h2', null, 'Tracks'),
    h('div', { class: 'card' },
      h('p', { class: 'sub' }, 'Untick a track to stop it adding new sentences to Continue while you focus on another. You still review what you have already met, and you can open any unit from the Learn page.'),
      ...app.content.packs.map(trackToggle)),

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
}
