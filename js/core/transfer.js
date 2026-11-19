// Export / import of progress. Pure functions.
//
// Export file = one JSON object. Import MERGES rather than replaces, so you can export from
// your phone, export from your computer, and import each into the other without losing either.
//   items, skills : the record with the newer `upd` timestamp wins
//   mistakes/flags : union by id
//   settings       : newer `upd` wins

import { mergeActivity } from './activity.js';

export const APP_ID = 'latin-app';
export const SCHEMA = 1;
export const MAX_MISTAKES = 500;

export function buildExport(state, now) {
  return {
    app: APP_ID,
    schema: SCHEMA,
    exportedAt: now,
    settings: state.settings,
    items: state.items,
    skills: state.skills,
    mistakes: state.mistakes,
    flags: state.flags,
    activity: state.activity || {},
  };
}

export function validateExport(d) {
  if (!d || typeof d !== 'object' || d.app !== APP_ID) throw new Error('This is not a Latin app export file.');
  if (typeof d.schema !== 'number' || d.schema > SCHEMA) {
    throw new Error('This export was made by a newer version of the app. Update the app first.');
  }
}

function newer(a, b) {
  return (a?.upd || 0) > (b?.upd || 0);
}

export function mergeData(state, incoming) {
  validateExport(incoming);
  const data = {
    items: { ...state.items },
    skills: { ...state.skills },
    settings: state.settings,
    mistakes: [...state.mistakes],
    flags: [...state.flags],
    activity: mergeActivity(state.activity || {}, incoming.activity || {}),
  };
  const summary = { items: 0, skills: 0, mistakes: 0, flags: 0, settings: false };

  for (const [id, st] of Object.entries(incoming.items || {})) {
    if (!data.items[id] || newer(st, data.items[id])) { data.items[id] = st; summary.items++; }
  }
  for (const [id, st] of Object.entries(incoming.skills || {})) {
    if (!data.skills[id] || newer(st, data.skills[id])) { data.skills[id] = st; summary.skills++; }
  }

  const mIds = new Set(data.mistakes.map((m) => m.id));
  for (const m of incoming.mistakes || []) {
    if (m && m.id && !mIds.has(m.id)) { data.mistakes.push(m); mIds.add(m.id); summary.mistakes++; }
  }
  data.mistakes.sort((a, b) => a.t - b.t);
  if (data.mistakes.length > MAX_MISTAKES) data.mistakes = data.mistakes.slice(-MAX_MISTAKES);

  const fIds = new Set(data.flags.map((f) => f.id));
  for (const f of incoming.flags || []) {
    if (f && f.id && !fIds.has(f.id)) { data.flags.push(f); fIds.add(f.id); summary.flags++; }
  }
  data.flags.sort((a, b) => a.t - b.t);

  if (incoming.settings && newer(incoming.settings, state.settings)) {
    data.settings = { ...state.settings, ...incoming.settings };
    summary.settings = true;
  }
  return { data, summary };
}
