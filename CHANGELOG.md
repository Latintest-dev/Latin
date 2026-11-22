# Changelog

Newest first. Version numbers live in `js/version.js`.

## 0.7.0
- **Word trainer**: about 5,000 common Latin words as flashcards in 100 units, most frequent first (roughly: first
  2,000 ranked from a treebank plus a dictionary's tiers, the rest from the tiers). Choose, then type with a
  hint, then type. Own daily budget ("New words per session"), left out of the speed round.
- **Grammar focus** track: 7 units, 66 sentences. The genitive in four units (of the whole, of quality and
  value, with adjectives, with *meminī*), the fourth and fifth declensions, and *ego, tū, nōs, vōs* in every case.
- **Street Latin** track: 30 sentences. Shouts and oaths, Pompeii graffiti and tombstone formulas, and famous
  lines from Catullus, Cicero, Horace, Martial, Plautus and Vergil.
- Engine: fourth and fifth declension nouns are generated from a stem.
- **Modular content**: the lexicon is a list of files (`content/lexicon/index.json`) merged at load, with a hard
  error on a duplicate id. Tracks may bring their own `skills.json`. Word units are made at load from the lexicon and
  a frequency list of ids, so adding a word never means editing a unit. A list word is "promoted" to a full entry by
  moving it between files with the same id. See `docs/CONTENT.md`.
- Words page: search shows words with full forms first; list words show their principal parts.
- Grammar and Street Latin open after *Core grammar* unit 9 and *Like a Roman* unit 3, so new learners are not
  spread across every track on day one.
- Release also writes upload-sized zips (at most 90 files each) because GitHub's web upload takes fewer than 100.
- Tooling: `tools/vocab.mjs` (fetch, build, report) builds the word list; the validator checks word cards, unlisted
  list words and duplicate ids.

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
