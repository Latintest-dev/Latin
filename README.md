# Latin: sentence-drill app (v0.4)

A small, offline-capable web app for learning Latin by drilling whole sentences. It runs in any
modern browser on a phone or computer, stores progress on the device, and lets you export and import
progress as a file. There is no server, no account and no tracking.

## What it does

- **Three tracks**, each with its own units and unlock order:
  - *Core grammar*: follows the order of Lingua Latina per se illustrata, starting at the very beginning
    (est/sunt and in + ablative; questions with ubi/quid; adjective agreement). Original sentences.
  - *Daily narration*: things you say to yourself through the day (hungry, thirsty, eating, "after the
    meal I want to drink", going home). First-person verbs, accusative objects, volo/nolo + infinitive,
    and now the **past** ("Yesterday I ate bread") and **future** ("Tomorrow I will walk to the forum").
  - *Like a Roman* (new in v0.2): how Romans actually said things. Greetings and manners, idioms
    (*mihi placet*, *annōs nātus sum*, *Quota hōra est?*), then a **Latin-only** unit where the question
    is in Latin and you reply in Latin.
- **Three kinds of prompt.** Plain (translate this English sentence), **situation** ("You meet a friend.
  Greet him."), and **Latin question** (answer in Latin; never asked as Latin→English). The English
  appears only after you answer.
- **Latin questions show a cue** (v0.4): because a question like *Quid edis?* has no single right answer, a small
  line under it says what to reply in English ("Reply: I eat bread"). You put that into Latin.
- **Modern coinages** are marked with a red "modern coinage" tag and a note. Roman-style content is the default.
- **Generated lessons** (v0.3, expanded in v0.4): about 700 sentences are built from templates and a tagged
  vocabulary, so practice stays varied. v0.4 adds counting and telling the hour, the genitive (*liber puerī*),
  the dative (*pater fīliō librum dat*), and a unit of new verbs. See *Generated content* below.
- **Roman lessons** (v0.4): the Roman day and meals, hospitality and manners, and 12 famous sayings
  (*Vēnī, vīdī, vīcī*; *Carpe diem*; *Mēns sāna in corpore sānō*), each with the grammar explained.
- New sentences per session are a shared budget (Settings, default 6) that the tracks take turns filling.- Each sentence climbs a ladder: **multiple choice** (English to Latin, or Latin to English), then
  **fill in the blank**, then **write the whole sentence**. A mistake drops it a level and brings it back.
- The grammar point appears only as a small tag. A short explanation shows after each answer.
- Typed answers accept every listed word order, with or without macrons. Wrong words are diagnosed
  ("*est* is 3rd person singular, but you need 3rd person plural: *sunt*"), and each mistake is logged.
- Spaced review (1, 2, 4, 8, 16, 32 days), per-skill strength, "practice weak spots" and "practice my mistakes".
- Export / import progress (JSON). Import *merges*, so you can sync phone and computer by exporting from
  one and importing into the other.

## Putting it on your phone (one-time setup, free)

A phone can only install and cache an app like this from a web address, so host the files once:

1. Create a free GitHub account and a **new public repository** (e.g. `latin`). The files contain no
   personal data; your progress never leaves your device.
2. Upload everything in this folder to the repository (drag the files and folders in, keeping the folder structure).
3. In the repository go to **Settings > Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute your app is at `https://YOUR-NAME.github.io/latin/`. Open it once while online.
5. **iPhone (Safari):** Share > *Add to Home Screen*. **Android (Chrome):** menu > *Install app*.

From then on it works fully offline. Open it on your computer at the same address.

**Back up your progress.** Browsers can clear site storage (Safari does so for sites you haven't opened
in about a week unless the app is added to the Home Screen). Use Settings > Export file regularly. The
home screen reminds you after a week.

## Updating

When app files change, `sw.js` must be regenerated so devices pick up the new version:

    node tools/build.mjs

(Updated files you receive will already include a regenerated `sw.js`.) Upload the changed files; the app
updates itself the next time it is opened with a connection.

## Project layout

    index.html, manifest.webmanifest, sw.js   app shell (sw.js is generated)
    js/engine/    Latin forms generator, form index, answer checker (pure functions)
    js/core/      storage (IndexedDB), scheduler, session runner, export/import
    js/ui/        screens: home, session, progress, settings
    js/modules/registry.js   list of content tracks
    content/lexicon.json     every word (regular words by stem; irregulars by explicit forms)
    content/skills.json      skill names for the progress screen
    content/<track>/         pack.json + unit files (u1.json, u2.json, ...)
    tools/validate.mjs       checks all content against the lexicon
    tools/generate.mjs       builds sentences from templates (content/<track>/gen/*.json)
    tools/gen/english.mjs    English renderer used by the generator
    tools/build.mjs          generates sw.js
    tests/                   unit tests (node --test) and a browser test (tests/e2e)

## Adding content

1. Add any new words to `content/lexicon.json`. Regular nouns, adjectives and verbs need only a stem and
   class (see existing entries); irregular words list their forms.
   Verbs take a perfect stem as `pf` (e.g. `"stem":"ambul","pf":"ambulāv"`); with it the generator
   builds present, imperfect, future and perfect (active indicative), the infinitive and the commands.
   Verbs without `pf` simply have no perfect forms. Nouns in -us get a vocative automatically.
2. Add sentences to a unit file. Each item needs: `en`, `chunks` (or `la` + `accept`), `fill`, `skills`,
   `tag`, `explain`, and exactly three `distractors` as `[latin, why it's wrong]`. Mark Latin words in
   explanations with `_underscores_`.
   Optional: `sit` (an English situation shown instead of `en`), or `q` (a Latin question; the item is
   then the answer and `en` holds the English gloss of both), and `modern: true` with a `modernNote`
   for modern coinages. `end` sets the final punctuation (default `.`).
   `chunks` lists the parts of the sentence; every ordering of the chunks is accepted. A chunk can offer
   alternatives, e.g. `["urbs magna", "magna urbs"]`.
3. Run `node tools/validate.mjs`. It fails if any word isn't in the lexicon, a distractor is actually a
   correct answer, a blank isn't in the sentence, and so on.
4. Run `node tools/build.mjs`, then upload.

New track: create `content/<name>/pack.json` plus unit files and add one line to `js/modules/registry.js`.

## Generated content

Some units are not written by hand. They are built by `tools/generate.mjs` from **sentence templates**
(`content/<track>/gen/<unit>.json`) and the tagged vocabulary in `content/lexicon.json`, and written out
as ordinary unit files. The app never knows the difference, so every generated sentence goes through the
same validator and answer checker as a hand-written one.

    node tools/generate.mjs                       # rebuild every generated unit (then validate + build)
    node tools/generate.mjs --sample svo 10       # print 10 samples of template "svo", write nothing
    node tools/generate.mjs --fresh               # throw away shipped sentences and regenerate from scratch (resets ids)

A template names its slots and how the sentence is put together, for example:

    "slots": { "sn": {"choice": ["sg","pl"]},
               "v": {"pos":"verb", "where":{"hasObj":true}, "form":"pres.ind.act.3{sn}"},
               "s": {"pos":"noun", "where":{"tags":["person"]}, "form":"nom.{sn}"},
               "o": {"pos":"noun", "fits":"v", "form":"acc.sg"} },
    "chunks": ["{s}", "{o}", "{v}"],  "en": "{s} {v} {o}."

From that the generator derives the Latin, the English, three wrong options (each changes exactly one
thing, such as another person of the verb, another case, another word, or another preposition) with an
explanation for each, and a stable id (a hash of the Latin, so your progress survives regeneration).

Why the sentences make sense: words carry tags (`person`, `edible`, `readable`, `land`, `indoor`, ...) and
verbs list what they can take (`obj`) or where they happen (`loc`), so "the boy eats bread" is possible
and "the boy eats the street" is not. Words also carry English forms (`en`) so the English comes out
right ("the men", "bread", "ate", "were eating").

Adding variety needs no code: add words to the lexicon with tags, and rerun the generator. Adding a
lesson means writing a new `gen/<n>.json` file. Increase a template's `n` for more sentences.

Generation is **append-only**: sentences already shipped are kept with the same ids, and raising `n` or adding
vocabulary only appends new ones, so your saved progress is never orphaned. Use `--fresh` only when you want
to start a unit over.
Read samples before you ship: generated Latin is checked mechanically, not by a teacher.

## Content review

Every sentence is marked `"review": "unreviewed"`. The sentences, macrons and explanations were drafted
by Claude and checked mechanically (forms, spelling against the lexicon), but not by a Latin teacher.
Use the **Report a problem** button in the app; flags are included in your export file.

## Tests

    node --test tests/*.test.mjs        # engine, scheduler, storage, import/export, content, generator
    node tools/validate.mjs             # content validation
    python3 tests/e2e/browser_test.py   # full browser run (needs Playwright + Chrome, app served on :8765)
    python3 tests/e2e/generated_units_test.py   # plays every generated unit type in the browser
