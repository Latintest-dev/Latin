// What a session needs to know, gathered in one place.
//
// Today, Settings (the preview), the Words hub and the session screen all ask "what would a session contain?"; they all
// build the answer from here, so a setting can never be read in one place and forgotten in another.

import { SETTINGS, settingValue } from './settings.js';

/** The settings that shape a session's queue, by the names `buildQueue` uses. */
export function queueSettings(settings) {
  return {
    newTotal: settingValue(settings, 'newTotal'),
    newWords: settingValue(settings, 'newWords'),
    tailWords: settingValue(settings, 'tailWords'),
    follow: settingValue(settings, 'follow'),
    paused: settingValue(settings, 'pausedPacks') || [],
  };
}

/** Everything `buildQueue` takes, from the running app and the request (`{ mode, scope }`). */
export function queueContext(app, params = {}, now = Date.now()) {
  const s = app.store.state;
  return {
    content: app.content,
    itemStates: s.items,
    skills: s.skills,
    mistakes: s.mistakes,
    now,
    ...queueSettings(s.settings),
    ...params,
  };
}

export { SETTINGS };
