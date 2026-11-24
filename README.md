# Latin: sentence-drill app (v0.8)

A small, offline-capable web app for learning Latin by drilling whole sentences, aimed at reading, writing,
thinking in and speaking Latin the way a Roman would. It runs in any modern browser on a phone or computer,
stores progress on the device, and lets you export and import progress as a file. There is no server, no
account and no tracking.

Where to look:

| You want to...                               | Read                      |
| -------------------------------------------- | ------------------------- |
| Use the app, put it on your phone            | this file                 |
| Add or fix Latin content, run the generator  | `docs/CONTENT.md`         |
| Change how the app works, add a mode or track| `docs/ARCHITECTURE.md`    |
| Know where any new feature must go           | `docs/FRAMEWORK.md`       |
| Start a new Claude session on the app        | `CLAUDE.md`               |
| See what changed in each version             | `CHANGELOG.md`            |

## What it does

Everything is a whole sentence. Each sentence climbs a ladder: **multiple choice** (English to Latin, or
Latin to English), then **fill in the blank**, then **write the whole sentence**. A mistake drops it a level
and brings it back. Typed answers accept every listed word order, with or without macrons, and wrong words are
diagnosed ("*est* is 3rd person singular, but you need 3rd person plural: *sunt*"); every mistake is logged.
Review is spaced (1, 2, 4, 8, 16, 32 days) with per-skill strength, "practice weak spots" and "practice my mistakes".

### Nine tracks

- **Core grammar**: follows the order of *Lingua Latina per se illustrata*, from *est/sunt* and *in* + ablative
  to the genitive, dative, numbers and telling the hour.
- **Daily narration**: what you say to yourself through the day, in the present, the past ("Yesterday I ate
  bread") and the future ("Tomorrow I will walk to the forum").
- **Like a Roman**: how Romans actually said things: greetings, idioms, hospitality, famous sayings, and a
  Latin-only unit where the question is in Latin and you reply in Latin.
- **Narrate your day**: first-person scripts for a whole day, built to be retold in order.
- **Change it** (v0.6): take a sentence you know and change one thing: who does it ("say it for *we*"), when
  (yesterday, tomorrow), how many, or turn it into a question or a *not*. This is what makes endings automatic.
- **Conversations** (v0.6): short exchanges where you play one side. You see the earlier lines as chat bubbles
  and reply in Latin. Opens after *Like a Roman* unit 3.
- **Grammar focus** (v0.7): short drills on one point at a time. Four units on the genitive (of the whole, of
  quality and value, with adjectives, with *meminī*), then the fourth and fifth declensions and the pronouns *I, you,
  we* in every case. Opens after *Core grammar* unit 9.
- **Street Latin** (v0.7): how Romans really sounded. Shouts and oaths (*mehercule*, *ecastor*, *vae victīs*),
  graffiti, signs and tombstones from Pompeii, and famous lines from Catullus, Cicero, Horace, Martial and Vergil.
  Opens after *Like a Roman* unit 3.
- **Word trainer** (v0.7): about 5,000 of the most common Latin words as flashcards, most frequent first, 50 to a
  unit. Each word climbs choose, then type with the first letter given, then type. New words have their own daily
  budget (default 6), separate from sentences. The ranking is evidence-based for roughly the first 2,000 words and
  approximate after that (see `docs/CONTENT.md`).

### The screens

- **Today**: one big **Continue** button, today's meter, the lesson Continue is on, what is due, and buttons for the
  speed round, weak spots and your mistakes.
- **Path**: the plan, in fifteen stages (First steps, I want / I do, Yesterday and tomorrow, ... Latin on the wall,
  This, that, who, Himself, better, by means, The Roman world). You are here is open; each stage lists its lessons from every track in the order to study them.
  A locked lesson says exactly what to do ("Meet 3 more sentences in "X" (Core grammar) to unlock this") with a
  **Go there** button.
- **Words**: *Meanings* (word cards: your lesson words first, then the frequency list, plus a quick quiz),
  *Forms* (practice the genitive plural, the 3rd person plural and so on for words you have met, then use the same words
  in sentences), and *Look up* (every verb in four tenses and six persons with English, nouns by case).
- **Progress**: skills, your most common slips and recent mistakes, with a **Practice** button on any weak skill.
- **Settings**: a live preview of what your next Continue will contain.

### What Continue does

1. Reviews that are due (at most 10; with more than 10 due, nothing new is added until you catch up).
2. New sentences (default 6) from the **stage you are on**, so you follow the Path. (Setting: *Mix all tracks* takes turns
   between tracks instead.)
3. New words (default 6) taken from the sentences you are learning and have met, then a couple (default 2) of the most
   common words from the frequency list.

### Other ways to practice

- **Study this stage / Start / Practice** on the Path (settings for new sentences apply).
- **Speed round**: ten sentences you can already write, typed against a countdown. Never moves your review dates.
- **Replay buttons** appear on a unit once you have met 80% of it. They never change your review schedule
  (a wrong answer still counts as a mistake): **Narrate it**, **Run the drill**, **Play it**.
- **Forms practice** and **Use it in sentences** (Words screen) are practice only: they update your skill bars and log
  mistakes without scheduling every form.
- **Daily goal and streak** on Today. Many short days beat a few long ones.

### Settings worth knowing

Each setting says what it affects, and the Settings screen previews your next Continue so you can see it work.

- **Show macrons** (off by default) and **Require macrons** (typed answers).
- **New sentences per session**, **New words from your lessons**, **Extra common words**, and **New sentences come from**
  (Follow the Path / Mix all tracks). These change Continue; the first also sets the size of a lesson or stage session.
- **Daily goal**.
- **Tracks**: untick a track to stop it adding new sentences to Continue while you focus on another. You still
  review what you have already met, and you can open any lesson yourself from the Path. Some tracks open only after a
  unit of another (the lock line says which).
- **Export / Import**: import *merges*, so you can sync phone and computer by exporting from one and importing
  into the other.

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

## Updating (the routine)

    node tools/release.mjs --bump minor     # or patch; checks everything, rebuilds sw.js, writes the zips in dist/

Besides the full zip, the release writes:

- `dist/latin-app-<version>-changes.zip`: **only the files that changed since the last release**, plus
  `release-manifest.json`. After the first full upload, this is all you upload (unzip, drag the contents into GitHub,
  keeping folders). If files were removed, `dist/DELETE-<version>.txt` lists them to delete on GitHub.
- `dist/latin-app-<version>-upload-N-of-M.zip`: the whole app in batches of at most 90 files, for a fresh upload
  (GitHub's web uploader takes fewer than 100 files at a time).

Then reload the app twice on each device. The release command stops before writing anything if content fails
validation, a sentence id that was shipped before has disappeared (which would orphan your saved progress), a
structure test fails (docs/FRAMEWORK.md), or any test fails.

If you ever skip an upload, upload the full batches next time instead of the changes zip.

Useful commands (`npm run <name>` works too):

    node tools/release.mjs --check          just the checks
    node tools/release.mjs --e2e            also run the browser tests (needs Python + Playwright + Chrome)
    node tools/flags.mjs my-progress.json   what you flagged and keep missing, with the file to fix each in
    node tools/generate.mjs --sample <id> 10   preview generated sentences without writing anything
    node tools/coverage.mjs 1000            how many of the top 1,000 words appear in sentences yet

## Content review

Every sentence is marked `"review": "unreviewed"`. The sentences, macrons and explanations were drafted by
Claude and checked mechanically (forms, spelling against the lexicon), but not by a Latin teacher. The word-list
meanings come from Whitaker's Words and are short and unreviewed; the new list words have no macrons. Use the
**Report a problem** button in the app; flags are included in your export file, and `tools/flags.mjs` turns
an export into a fix list.

## Tests

    node --test tests/*.test.mjs        # engine, scheduler, modes, storage, import/export, generator, tooling, framework
    node tools/validate.mjs             # content validation
    bash tests/e2e/run_all.sh           # every browser test (serves the app itself)
