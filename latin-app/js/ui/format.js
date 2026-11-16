import { stripMacrons } from '../engine/latin.js';

/** Latin text as displayed: macrons only if the setting is on. */
export const latin = (s, settings) => (settings.showMacrons ? s : stripMacrons(s));

/**
 * Text with _Latin_ spans -> a fragment where those spans are italic Latin
 * (and obey the macron setting, unless `macrons: true` forces them: used for explanations,
 * where the long vowels are often the whole point).
 */
export function rich(text, settings, { macrons = false } = {}) {
  const frag = document.createDocumentFragment();
  for (const part of String(text).split(/(_[^_]+_)/g)) {
    if (/^_[^_]+_$/.test(part)) {
      const i = document.createElement('i');
      i.className = 'la';
      i.textContent = macrons ? part.slice(1, -1) : latin(part.slice(1, -1), settings);
      frag.append(i);
    } else if (part) {
      frag.append(part);
    }
  }
  return frag;
}

export function fmtDate(t) {
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const DAYS = 86400000;
