# Handoff: working on the Latin app

Read this first. Then read `docs/FRAMEWORK.md` (the extension points) before changing anything.

## What this is

A personal, offline-capable web app (vanilla JS ES modules, IndexedDB, generated service worker) for Ryan to teach
himself Latin: read, write, think in and speak it like a Roman. Hosted on GitHub Pages
(`Latintest-dev/Latin`). Progress is on-device; the app has Export/Import. No server, no accounts, no dependencies.

## How the owner works

- Prefers **complete files** over diffs, complete scripts over fragments, and wants the *reasoning* behind decisions.
- American English everywhere (text and code comments).
- Uploads to GitHub through the web uploader (fewer than 100 files per batch). So: use the release tool, and hand him
  the **changes zip** (`dist/latin-app-<version>-changes.zip`) plus `DELETE-<version>.txt` when it exists.
- All Latin content is unreviewed by a Latin teacher. Say so when adding content; never claim otherwise.

## Start of a session

    git clone / copy the repo, then, in its folder:
    node tools/validate.mjs            # content is valid
    node --test tests/*.test.mjs       # unit + framework tests
    node tools/release.mjs --check     # everything the release checks

Look at `CHANGELOG.md` (what exists), `docs/FRAMEWORK.md` (how to extend), `docs/CONTENT.md` (content formats).

## Rules (the tests enforce most of them)

1. Extend through the extension points in `docs/FRAMEWORK.md`; do not add parallel lists or hard-coded numbers.
2. A new lesson needs a row in `content/curriculum.json`; a new setting needs a row in `js/core/settings.js` and must be read.
3. Sentence ids are permanent. Never rename or delete one (`node tools/ids.mjs retire <id>` is a deliberate decision).
4. Keep start-up fast: word cards stay lazy, long lists render in pages, content stays small.
5. `engine/` and `core/` never touch the DOM.
6. After any change: unit tests, then `node tools/release.mjs --bump patch|minor` (it validates, builds `sw.js`,
   writes the full zip, the upload batches and the changes zip). Browser tests: `bash tests/e2e/run_all.sh`
   (needs Playwright and Chrome).
7. Update `CHANGELOG.md`, and the README or docs if behavior changed.

## Commands

    node tools/release.mjs [--bump minor|patch] [--check] [--e2e]
    node tools/validate.mjs            node tools/ids.mjs check|update|retire
    node tools/generate.mjs            node tools/coverage.mjs [N]       (how many top-N words appear in sentences)
    node tools/vocab.mjs               node tools/flags.mjs <export.json>
    bash tests/e2e/run_all.sh [name]

## Roadmap (suggested order)

1. Review and fix: ask Ryan to use "Report a problem"; run `tools/flags.mjs` on his export and fix what he flagged.
2. **Promote more high-frequency words** from the list files to full lexicon entries (done for about 300 in v0.9;
   `node tools/coverage.mjs 1000` shows which top words no sentence uses yet: quis, quisque, quīdam, uterque, omnis, ...).
3. More sentences for the words he is meeting; more units in Grammar focus and The Roman world.
4. Advanced grammar (v0.9 did demonstratives, relatives, reflexives, comparison, ablative uses): the subjunctive,
   participles, ablative absolute, indirect statement, indefinites (*quis, quisque, quīdam*). Each = a unit file + a
   `pack.json` line + a `curriculum.json` stage row.
5. Reading: short graded passages as a new item kind (one row in `ITEM_KINDS`).

## Honest limits

Content unreviewed; the word list is evidence-ranked only for about its first 2,000 words; glosses are terse; new
vocabulary has no macrons; list words can't appear in sentences until promoted; not tested on a physical phone;
Street Latin quotations were written from memory and must be checked against the sources.
