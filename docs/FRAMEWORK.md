# The framework

This is the contract that keeps the app usable as it grows. Every kind of growth has **one extension point**, and
`tests/framework.test.mjs` fails when something is added around it instead of through it.

## The idea in one picture

    CONTENT (data)          what to learn            content/<track>/…  content/lexicon/…  content/curriculum.json
        │
    ENGINE (pure)           how Latin works          js/engine/   forms, checker, items, vocab, lessons
        │
    CORE (pure)             what happens when        js/core/     scheduler, path, modes, settings, context, content
        │
    UI (drawing only)       how it looks             js/ui/       routes → screens; modes.js → wording

`engine/` and `core/` never touch the DOM (they run in Node tests); `ui/` only draws what they return.

## What the learner sees (and where each screen's logic lives)

| Screen   | Purpose                                                        | Reads                                   |
| -------- | -------------------------------------------------------------- | --------------------------------------- |
| Today    | One button: Continue. Today's meter, what's next, what's weak. | `path.nextLesson`, `settings`, `summarize` |
| Path     | The plan: every stage of the curriculum, you are here, lessons, locks explained.   | `content.stages`, `stageStats`, `lockInfo` |
| Words    | Meanings (word cards), Forms (+ use in sentences), Look up.    | lexicon, `lessonWordCards`, forms skills |
| Progress | Skills, slips, mistakes; Practice on any weak skill.           | `content.skills`, `state.skills`         |
| Settings | Everything configurable, with a live "your next Continue".     | `SETTINGS`                               |

## Extension points: "to add X, touch exactly these files"

| To add…                         | Touch                                                                                          | Guard |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ----- |
| Sentences to an existing lesson | the unit's JSON (or its `tools/gen` template). Nothing else.                                    | validator, ids.lock |
| A new lesson                    | unit file + one line in that track's `pack.json` + **one line in `content/curriculum.json`**    | validator ("in no stage") |
| A new track                     | `content/<name>/` (`pack.json`, units) + one line in `js/modules/registry.js` + stage rows      | framework test (folder ↔ registry) |
| New words                       | a row in a `content/lexicon/*.json` file + its id in `content/vocab/order.json`                 | validator (duplicate ids) |
| A new lexicon file              | the file + one line in `content/lexicon/index.json`                                             | framework test |
| A word's full forms             | move its row from the list file to a full file with the **same id** ("promote")                 | validator |
| A setting                       | one row in `js/core/settings.js` (`affects` says what it changes) + read it where it matters    | framework test (declared and read) |
| A screen                        | a render function + one row in `js/ui/routes.js` (max 6 tabs: fold new things into a screen)    | framework test |
| A practice mode                 | a builder + one line in `MODES` (`core/modes.js`) + a presenter in `js/ui/modes.js`             | framework test |
| A kind of exercise item         | one row in `ITEM_KINDS` (`engine/items.js`) with all its wording                                | framework test |
| A skill                         | `content/skills.json` (or the track's own `skillsFile`); forms skills in `engine/forms.js`      | validator, framework test |
| A stage (a chapter of the plan) | `content/curriculum.json`. Order must respect each track's own order and its gates.             | validator |

If your change needs a file that isn't in this table's row, stop: either the framework is missing an extension
point (add one, and a row here), or the change belongs somewhere else.

## Rules that keep it fast

- **Start-up budget.** Loading must stay well under a second on a phone. Word cards are *lazy* (built on first read:
  `lazyWordItem` in `engine/vocab.js`); never loop over all word items eagerly at load. The framework test checks that
  word cards stay lazy, content stays under 8 MB and under 200 files.
- **Screens draw only what is visible.** Path stages draw their lessons when opened; the Words frequency list draws 20
  units at a time; lookup lists cap at 200 rows. A new screen with a long list must do the same.
- **Content is data, never code.** Latin lives in JSON; the engine derives forms, variants and word cards from it.

## Rules that keep it coherent

- **One place for each thing.** Defaults live in `settings.js`, wording in `ITEM_KINDS` and `ui/modes.js`, routes in
  `routes.js`, the plan in `curriculum.json`. If you find yourself copying a list, you are adding a second place.
- **Settings must do something visible.** `affects` names where each applies; the Settings screen previews your next
  Continue so a change shows up immediately. A setting nothing reads fails the test.
- **A lock always explains itself.** `lockInfo` gives the sentence ("Meet 3 more sentences in “X” to unlock this"),
  where, and whether you can go there now. New gates use it automatically.
- **Words and sentences are woven, not separate.** New word cards come from the sentences you are learning (lesson
  words), then a small tail from the frequency list. A sentence's words are found by `engine/lessons.js`.
- **Never lose progress.** Sentence ids are permanent (`tools/ids.mjs`); progress is keyed by id; import merges.

## How Continue decides (so it never feels random)

1. Reviews that are due (most overdue first, at most 10).
2. If more than 10 reviews are due: stop there (nothing new until you catch up).
3. New sentences, *New sentences per session*, from the stage you are on (**Follow the Path**), or turn by turn
   between tracks (**Mix all tracks**).
4. Word cards: words in those sentences (and in sentences you have met) first, *New words from your lessons*, then
   *Extra common words* from the frequency list.

## Updating the app without re-uploading everything

`node tools/release.mjs --bump minor` writes, besides the full zip:

- `dist/latin-app-<version>-changes.zip`: only new and edited files (plus `release-manifest.json`, which records what
  every file looked like at the last release). Upload just these to GitHub, unzipped, keeping folders.
- `dist/DELETE-<version>.txt` when files were removed: delete those on GitHub by hand.

The manifest travels with the app, so each release is compared with the one before it. If you skip an upload, the next
changes zip will not include what you skipped: upload the full zip (or both changes zips) instead.

## Starting a new Claude session to work on the app

See `CLAUDE.md` at the repo root: it tells a fresh session what the app is, the rules, the commands and the roadmap.
