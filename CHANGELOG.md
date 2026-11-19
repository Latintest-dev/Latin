# Changelog

Newest first. Version numbers live in `js/version.js`.

## 0.6.0
- **Change it** track: 104 sentences that take a sentence you know and change the person, the tense, the number, or
  turn it into a question or a *not*. **Run the drill** replays a unit's changes in rapid-fire, grouped by base sentence.
- **Conversations** track: 29 turns in three conversations (meeting people; shops, streets and invitations; home,
  plans and your Latin). Earlier lines show as chat bubbles; **Play it** replays a conversation and ends with a transcript.
- Tracks can require a unit of another track (Change it opens after *Daily narration* unit 6; Conversations after *Like a
  Roman* unit 3). Any track can be paused in Settings so Continue stops adding its new sentences.
- Sentences now start with a capital letter. (Answers were already case-insensitive.)
- Progress page shows what a "Change it" mistake asked for, not just the English.
- Modes are a table (`core/modes.js` and `ui/modes.js`); the replay button and summary of a new mode need no changes
  elsewhere.
- Tooling: `tools/release.mjs` (check, build, bump, zip), `tools/ids.mjs` (sentence ids never disappear),
  `tools/flags.mjs` (export to fix list). One version source. Docs split into README, `docs/CONTENT.md`,
  `docs/ARCHITECTURE.md`. Browser tests share one bot (`tests/e2e/lib.py`) and run with `tests/e2e/run_all.sh`.

## 0.5.0
Narrate your day (scripts and **Narrate it**), speed round, daily goal and streak, Words look-up page, 930 sentences.

## 0.4.0
Latin question cues, the Roman day and meals, hospitality, famous sayings, small talk, counting and the hour,
genitive and dative, more verbs.

## 0.3.0
Generated lessons from templates and tagged vocabulary.

## 0.2.0
*Like a Roman* track and Latin-question items.

## 0.1.0
First version: core grammar, spaced review, export and import, offline use.
