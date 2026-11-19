// Content tracks ("packs"). To add a new area of focus, create a folder under /content
// with a pack.json and unit files, then add one line here.
//
// Each pack is independent: its own units, its own unlock order. They share the lexicon
// (content/lexicon.json) and the skill list (content/skills.json).

export const PACKS = [
  { id: 'core', path: 'content/core/pack.json' },
  { id: 'daily', path: 'content/daily/pack.json' },
  { id: 'roman', path: 'content/roman/pack.json' },
  { id: 'day', path: 'content/day/pack.json' },
  { id: 'swap', path: 'content/swap/pack.json' },
  { id: 'talk', path: 'content/talk/pack.json' },
];
