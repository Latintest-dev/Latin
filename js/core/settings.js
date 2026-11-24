// The settings, declared once.
//
// Every setting the app has is a row here. The Settings screen is drawn from this table, the defaults come from it,
// and `affects` says which parts of the app read the setting, so the screen can show what a change will do and a test
// can fail when a setting is declared that nothing reads (or read that nobody declared).
//
//   key      the name stored in progress and exports
//   type     'toggle' | 'choice' | 'tracks'
//   options  for 'choice': the values on offer
//   affects  where it takes effect: 'continue' (the Continue button), 'lesson' (a lesson or stage session),
//            'words' (word practice), 'display' (how Latin is shown), 'answers' (how typed answers are judged),
//            'today' (the Today screen), 'plan' (which tracks the plan draws new sentences from)
//   group    the heading it is shown under

export const SETTINGS = [
  { key: 'showMacrons', group: 'Reading and writing', type: 'toggle', default: false, affects: ['display'],
    label: 'Show macrons', help: 'Show long vowels (ā ē ī ō ū) in Latin. Explanations always show them.' },
  { key: 'strictMacrons', group: 'Reading and writing', type: 'toggle', default: false, affects: ['answers'],
    label: 'Require macrons in answers', help: 'When on, an answer typed without the right macrons counts as “almost”.' },

  { key: 'follow', group: 'What Continue does', type: 'choice', default: 'path', affects: ['continue'],
    options: [['path', 'Follow the Path'], ['mix', 'Mix all tracks']],
    label: 'New sentences come from', help: '“Follow the Path” takes them from the stage you are on. “Mix all tracks” takes turns between every open track.' },
  { key: 'newTotal', group: 'What Continue does', type: 'choice', default: 6, affects: ['continue', 'lesson'], options: [3, 4, 6, 8, 10, 12],
    label: 'New sentences per session', help: 'Used by Continue and by Start/Practice on a lesson or stage. Reviews always come first.' },
  { key: 'newWords', group: 'What Continue does', type: 'choice', default: 6, affects: ['continue', 'words'], options: [0, 2, 3, 4, 6, 8, 10, 15],
    label: 'New words from your lessons', help: 'Words used in the sentences you are learning, taught as word cards. 0 turns them off.' },
  { key: 'tailWords', group: 'What Continue does', type: 'choice', default: 2, affects: ['continue', 'words'], options: [0, 1, 2, 3, 5, 8],
    label: 'Extra common words', help: 'A few words from the top of the frequency list that no lesson of yours uses yet. 0 turns them off.' },

  { key: 'dailyGoal', group: 'Daily goal', type: 'choice', default: 20, affects: ['today'], options: [10, 20, 30, 50, 80],
    label: 'Answers per day', help: 'What makes a full day on the Today screen. A little every day beats a lot once a week.' },

  { key: 'pausedPacks', group: 'Tracks', type: 'tracks', default: [], affects: ['continue', 'plan'],
    label: 'Tracks', help: 'Untick a track to stop it adding new sentences. You still review what you have met, and you can open any lesson yourself.' },
];

export const SETTING_KEYS = SETTINGS.map((s) => s.key);

/** The defaults a new device starts with (the store adds its own bookkeeping field `upd`). */
export const DEFAULT_SETTINGS = { ...Object.fromEntries(SETTINGS.map((s) => [s.key, s.default])), upd: 0 };

/** The value to use for a setting, falling back to its default (older saved progress may not have it). */
export const settingValue = (settings, key) => settings?.[key] ?? SETTINGS.find((s) => s.key === key).default;
