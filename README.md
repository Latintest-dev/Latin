# Latin: sentence-drill app (v0.6)

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
| See what changed in each version             | `CHANGELOG.md`            |

## What it does

Everything is a whole sentence. Each sentence climbs a ladder: **multiple choice** (English to Latin, or
Latin to English), then **fill in the blank**, then **write the whole sentence**. A mistake drops it a level
and brings it back. Typed answers accept every listed word order, with or without macrons, and wrong words are
diagnosed ("*est* is 3rd person singular, but you need 3rd person plural: *sunt*"); every mistake is logged.
Review is spaced (1, 2, 4, 8, 16, 32 days) with per-skill strength, "practice weak spots" and "practice my mistakes".

### Six tracks

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

### Ways to practice

- **Continue**: reviews that are due, then new sentences (a shared budget, default 6 per session, taking turns
  between tracks). Reviews of every track always come up.
- **Speed round**: ten sentences you can already write, typed against a countdown. Never moves your review dates,
  so it is safe to do as often as you like.
- **Replay buttons** appear on a unit once you have met 80% of it. They never change your review schedule
  (a wrong answer still counts as a mistake):
  - **Narrate it**: retell a whole day in order, then read it back as one paragraph.
  - **Run the drill**: the "Change it" sentences in rapid-fire, grouped by base sentence.
  - **Play it**: the conversation from the top, at each line's own level.
- **Daily goal and streak** on the Learn page. Many short days beat a few long ones.
- **Words**: every verb in four tenses and six persons with English, nouns by case, for building sentences about
  your real day.

### Settings worth knowing

- **Show macrons** (off by default) and **Require macrons**. Explanations always show macrons.
- **New sentences per session** and **Daily goal**.
- **Tracks**: untick a track to stop it adding new sentences to Continue while you focus on another. You still
  review what you have already met, and you can open any unit from the Learn page. Some tracks open only after a
  unit of another (the lock icon says which).
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

    node tools/release.mjs --bump minor     # or patch; checks everything, rebuilds sw.js, writes dist/latin-app-<version>.zip

Then upload the contents of the zip to the GitHub repository (replace the files) and reload the app twice
on each device. The release command stops before writing anything if content fails validation, a sentence id
that was shipped before has disappeared (which would orphan your saved progress), or a test fails.

Useful commands (`npm run <name>` works too):

    node tools/release.mjs --check          just the checks
    node tools/release.mjs --e2e            also run the browser tests (needs Python + Playwright + Chrome)
    node tools/flags.mjs my-progress.json   what you flagged and keep missing, with the file to fix each in
    node tools/generate.mjs --sample <id> 10   preview generated sentences without writing anything

## Content review

Every sentence is marked `"review": "unreviewed"`. The sentences, macrons and explanations were drafted by
Claude and checked mechanically (forms, spelling against the lexicon), but not by a Latin teacher. Use the
**Report a problem** button in the app; flags are included in your export file, and `tools/flags.mjs` turns
an export into a fix list.

## Tests

    node --test tests/*.test.mjs        # engine, scheduler, modes, storage, import/export, generator, tooling
    node tools/validate.mjs             # content validation
    bash tests/e2e/run_all.sh           # every browser test (serves the app itself)
