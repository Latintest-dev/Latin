// In-memory app state with write-through persistence to a storage backend.
// All getters/setters are synchronous; persistence happens in a queued background chain.
// Call `await store.flush()` when you need to be sure everything is written.

import { buildExport, mergeData, MAX_MISTAKES } from './transfer.js';

export const DEFAULT_SETTINGS = {
  showMacrons: false,    // display macrons on Latin text
  strictMacrons: false,  // require macrons in typed answers
  newTotal: 6,           // new sentences introduced per session, shared between tracks
  upd: 0,
};

let idCounter = 0;
export function makeId(prefix, now) {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}${now.toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function createStore(backend, { now = () => Date.now() } = {}) {
  const raw = await backend.loadAll();
  let pending = Promise.resolve();
  const queue = (fn) => {
    pending = pending.then(fn).catch((e) => console.warn('Storage write failed:', e));
  };
  const put = (s, k, v) => queue(() => backend.put(s, k, v));
  const del = (s, k) => queue(() => backend.del(s, k));

  const fresh = () => ({
    settings: { ...DEFAULT_SETTINGS },
    items: {},
    skills: {},
    mistakes: [],
    flags: [],
    meta: {},
  });

  let state = fresh();
  state.settings = { ...DEFAULT_SETTINGS, ...(raw.meta?.settings || {}) };
  state.items = raw.items || {};
  state.skills = raw.skills || {};
  state.mistakes = (raw.mistakes || []).sort((a, b) => a.t - b.t);
  state.flags = (raw.flags || []).sort((a, b) => a.t - b.t);
  state.meta = { created: raw.meta?.created, lastExport: raw.meta?.lastExport };
  if (!state.meta.created) {
    state.meta.created = now();
    put('meta', 'created', state.meta.created);
  }

  const api = {
    get state() { return state; },
    backend,
    flush: () => pending,

    getItem: (id) => state.items[id],
    putItem(id, st) {
      const rec = { ...st, upd: now() };
      state.items[id] = rec;
      put('items', id, rec);
      return rec;
    },

    /** Record a correct/incorrect attempt against each skill id. */
    recordSkills(ids, ok) {
      const t = now();
      for (const id of ids) {
        const cur = state.skills[id] || { a: 0, c: 0, r: [], last: 0, upd: 0 };
        const rec = {
          a: cur.a + 1,
          c: cur.c + (ok ? 1 : 0),
          r: [...cur.r, ok ? 1 : 0].slice(-12),
          last: t,
          upd: t,
        };
        state.skills[id] = rec;
        put('skills', id, rec);
      }
    },

    addMistake(m) {
      const rec = { ...m, id: m.id || makeId('m', now()), t: m.t || now() };
      state.mistakes.push(rec);
      put('mistakes', rec.id, rec);
      while (state.mistakes.length > MAX_MISTAKES) {
        const old = state.mistakes.shift();
        del('mistakes', old.id);
      }
      return rec;
    },

    addFlag(f) {
      const rec = { ...f, id: f.id || makeId('f', now()), t: f.t || now() };
      state.flags.push(rec);
      put('flags', rec.id, rec);
      return rec;
    },

    setSetting(key, value) {
      state.settings = { ...state.settings, [key]: value, upd: now() };
      put('meta', 'settings', state.settings);
    },

    markExported() {
      state.meta.lastExport = now();
      put('meta', 'lastExport', state.meta.lastExport);
    },

    snapshot: () => buildExport(state, now()),

    async importData(data) {
      const { data: merged, summary } = mergeData(state, data);
      state.items = merged.items;
      state.skills = merged.skills;
      state.mistakes = merged.mistakes;
      state.flags = merged.flags;
      state.settings = { ...DEFAULT_SETTINGS, ...merged.settings };
      // rewrite everything (data is small)
      await pending;
      await backend.clear();
      for (const [k, v] of Object.entries(state.items)) put('items', k, v);
      for (const [k, v] of Object.entries(state.skills)) put('skills', k, v);
      for (const m of state.mistakes) put('mistakes', m.id, m);
      for (const f of state.flags) put('flags', f.id, f);
      put('meta', 'settings', state.settings);
      put('meta', 'created', state.meta.created);
      if (state.meta.lastExport) put('meta', 'lastExport', state.meta.lastExport);
      await pending;
      return summary;
    },

    async reset() {
      await pending;
      await backend.clear();
      const keepSettings = state.settings;
      state = fresh();
      state.settings = keepSettings;
      state.meta.created = now();
      put('meta', 'created', state.meta.created);
      put('meta', 'settings', state.settings);
      await pending;
    },
  };
  return api;
}
