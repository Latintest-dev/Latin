# Content guide

How the Latin gets into the app, and how to add or fix it. Everything the learner sees is data in `content/`;
no content lives in the JavaScript. After any content change run `node tools/release.mjs --check`.

## Layout

    content/lexicon/index.json       the list of lexicon files (each a JSON list of word entries)
    content/lexicon/core.json        hand-made words, with forms (the ones the sentence tracks are built from)
    content/lexicon/grammar.json     words added for the Grammar track
    content/lexicon/street.json      words added for the Street Latin track
    content/lexicon/supplement.json  very common words the frequency data missed or ranked too low
    content/lexicon/band-1..5.json   word-list entries (lemma only), 1,000 ranks per file, made by tools/vocab.mjs
    content/vocab/order.json         lexicon ids in frequency order; the Word trainer's units are cut from this
    content/skills.json              skill names for the Progress screen (shared)
    content/<track>/pack.json        track name, blurb, optional "requires", optional "skillsFile", and the list of units
    content/<track>/skills.json      skills that only this track uses (optional; merged in at load)
    content/<track>/u<id>.json       a unit's sentences (hand-written, or written by the generator)
    content/<track>/gen/<id>.json    generator input for a unit (templates); only for generated units
    js/modules/registry.js           the list of tracks (one line per track)

The Word trainer has no unit files: its units and flashcards are **made when the app loads** from the lexicon and
`order.json` (50 words per unit, the last unit absorbs a short remainder).

Three rules that keep content from being duplicated and progress from being lost:

0. **A word is defined once.** Every lexicon entry has an `id` that must be unique across *all* lexicon files; the
   app (and the validator) refuse to load if two files define the same id. A skill defined by a track's own
   `skills.json` cannot repeat one in the shared `skills.json`, either.
1. **A sentence's id never changes and never disappears.** Saved progress is keyed by id. `tools/ids.mjs`
   enforces this (see "Removing a sentence" below). Word cards are keyed `vocab.<lexicon id>`, so reordering the
   word list never disturbs progress.
2. **The prompt must be unique across the whole app.** Two sentences with the same English (or the same Latin
   question, or the same Latin-plus-instruction for a "Change it" sentence) would make "the right answer"
   ambiguous. The validator checks this.

## Hand-written sentences

Add them to a unit file. Each item needs:

| field         | meaning                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| `id`          | `<track>.<unit>.<nn>`, unique and permanent                                                    |
| `en`          | the English sentence (American spelling)                                                      |
| `chunks`      | the parts of the sentence; every ordering is accepted. A chunk may offer alternatives: `["urbs magna", "magna urbs"]`. Or give `la` plus `accept` (other accepted answers) |
| `fill`        | the word blanked out in the fill-in-the-blank step; it must appear in the sentence            |
| `skills`      | skill ids from `skills.json`                                                                  |
| `tag`         | the small grammar label shown to the learner                                                  |
| `explain`     | shown after the answer; mark Latin words with `_underscores_`                                 |
| `distractors` | exactly three `[latin, why it is wrong]`; each should change one thing                        |
| `review`      | `"unreviewed"` until a Latin teacher has checked it                                           |

Optional fields:

- `sit`: an English situation shown instead of `en` ("You meet a friend. Greet him.").
- `q` (+ `cue`): a Latin question; the item is the reply and `en` holds the English of both, as `“Q” “A”`. The cue
  line under the question is `cue`, or the second quoted part of `en`.
- `dlg`, `turn`, `scene`: a turn of a conversation (see below).
- `swap: {from, change}`: a "Change it" sentence (normally generated; see below).
- `modern: true` with `modernNote`: a modern coinage, shown with a tag.
- `end`: final punctuation (default `.`).

Steps: add any new words to the lexicon, add sentences, `node tools/validate.mjs`, then release. The validator
fails when a word is not in the lexicon, a distractor is actually correct, a blank is not in the sentence, a
prompt repeats, and so on.

### Lexicon

**To add one word:** put one entry in a lexicon file (a new file listed in `index.json`, or `supplement.json`).
**To add a whole batch** (a new theme): create `content/lexicon/<theme>.json`, add its name to `index.json`, done;
nothing else needs to know. If the word should also be a flashcard, add its id to `content/vocab/order.json`
(see "The Word trainer" below).

Regular nouns, adjectives and verbs need only a stem and class (copy an existing entry). Verbs take a perfect stem
as `pf` (`"stem":"ambul","pf":"ambulāv"`); with it the generator builds present, imperfect, future and perfect
(active indicative), the infinitive and the commands. Irregular words list their forms. Nouns in -us get a vocative
automatically. Words carry tags (`person`, `edible`, `readable`, `land`, `indoor`, ...) and verbs list what they can
take (`obj`) or where they happen (`loc`), which is how generated sentences make sense ("the boy eats bread", never
"the boy eats the street").

Declension and conjugation classes the engine builds from a stem: nouns of the 1st, 2nd, 3rd (including i-stems),
**4th and 5th** declensions (`decl: "4"`, `"5"`, with `stem`), adjectives of the 1-2 and 3-2 types, verbs of the 1st,
2nd, 3rd, 3rd -iō and 4th conjugations. Anything irregular lists its `forms` (these override the generated ones), and
an indeclinable word has `form`. A word with only `lemma`, `gloss`, `parts` and `vocabOnly: true` is a **list word**:
it can be a flashcard and appears on the Words page with its principal parts, but cannot be used inside sentences
until it is given a stem and class (see "Promoting a word").

## Conversations

A conversation is a run of ordinary question items that share a `dlg` name and have turns numbered 1..n:

    { "id": "talk.1.01", "dlg": "forum", "turn": 1, "scene": "You meet your friend Marcus in the forum.",
      "q": "Salvē! Quid agis?", "la": "Bene valeō, grātiās. Et tū?", "en": "“Hello! How are you?” “I am well, thanks. And you?”", ... }

`scene` goes on turn 1 only. The app shows the scene and the earlier lines as chat bubbles above each prompt. The
unit's `"play": "dialogue"` flag gives it the **Play it** button.

## Generated sentences

Some units are built by `tools/generate.mjs` from **templates** in `content/<track>/gen/<unit>.json`, written out as
ordinary unit files. The app cannot tell the difference, so generated sentences go through the same validator and
answer checker.

    node tools/generate.mjs                    rebuild every generated unit (append-only)
    node tools/generate.mjs --sample svo 10    print 10 samples of template "svo", write nothing
    node tools/generate.mjs --fresh            throw away shipped sentences and start over (RESETS IDS; avoid)

A template names its slots and how the sentence is put together:

    "slots": { "sn": {"choice": ["sg","pl"]},
               "v": {"pos":"verb", "where":{"hasObj":true}, "form":"pres.ind.act.3{sn}"},
               "s": {"pos":"noun", "where":{"tags":["person"]}, "form":"nom.{sn}"},
               "o": {"pos":"noun", "fits":"v", "form":"acc.sg"} },
    "chunks": ["{s}", "{o}", "{v}"],  "en": "{s} {v} {o}."

The generator derives the Latin, the English, three wrong options (each changes exactly one thing, with an
explanation), and a stable id (a hash of the Latin). Slot options: `where {tags, ids, notIds, hasObj, dat, notMass,
...}`, `fits`/`fitsOn` (agreement with another slot), `differ`, `same`, `foils` (wrong forms to prefer as
distractors), `noFoil`. Unit options: `ordered` (units unlock in order), `play` (which replay button).

English pattern modes: `{v:full}` (with pronoun: "we eat") and `{v:base}`. In explanations use `{v.full}`,
`{v.base}`, `{v.label}`, `{v.lemma}`, `{o:a}` and so on.

### "Change it" frames

A template with `changes` builds one **base sentence** (its choice slots fixed by `base`) and then one sentence per
change, which are the sentences you drill:

    "base": {"pn": "1sg"},
    "changes": [ {"label": "Say it for “we”", "set": {"pn": "1pl"}}, ... ]

Each change may also override `chunks`, `en`, `end`, `explain`, `tag`, `fill`, `skills`, and add `foilsExtra`
(hand-picked wrong options `{chunks, end?, why}`, chosen before the generated ones). A frame is kept only if **every**
change works, so the changes to one base always come together; `n` counts frames, not sentences. `from` gives the
base sentence's chunk patterns when it differs from `chunks`.

### Append-only generation

Sentences already shipped keep their ids; raising `n` or adding vocabulary only appends new ones. That is why
changing a template's wording of an existing sentence will not change it. If a generated sentence is wrong, fix the
template or lexicon so it cannot recur, then either leave the shipped sentence alone (it stays as it is), or
retire it deliberately (below) if it must go.


## The Word trainer (about 5,000 words)

Flashcards for the most common Latin words, most frequent first, 50 to a unit. Each card climbs the same ladder as a
sentence: choose the Latin word, then type it with the first letter given, then type it. The wrong options are words
of nearby rank and the same part of speech, never with the same meaning. New words have their **own daily budget**
(Settings: "New words from your lessons", default 6, plus "Extra common words", default 2) so they do not crowd out
sentences; both budgets stop when more than 10 reviews are due. Word cards are left out of the speed round, which is
for sentences.

**Woven into lessons.** Continue teaches the words *of your sentences* first: the words in the sentences it is about to
teach, then words in sentences you have already met, each group in frequency order. Only then does it take a couple of
the most common words from the list that no lesson of yours uses. The link between a sentence and its words is derived
when the app loads (`engine/lessons.js`), so a new sentence needs nothing extra: write it with words from the lexicon
and its words join the lesson-word stream. `node tools/coverage.mjs 1000` shows which of the top words no sentence uses
yet (those are the best to promote and write sentences for). The word list needs no unlocking (`"open": true`).

## The plan (`content/curriculum.json`)

Twelve stages, each a title, a short blurb and a list of lessons (`"core.1"` is unit 1 of the track `core`) taken from
all the sentence tracks, so the Path shows the lessons to study together in one place. **Every lesson of every sentence
track appears in exactly one stage** (the validator and a framework test fail otherwise), in its track's own order, and
never before the lesson that gates its track. To add a lesson: unit file, a line in the track's `pack.json`, and a line
in a stage here. To add a stage: a new object in `stages`, placed where it belongs in the sequence.

### How the list is made

`node tools/vocab.mjs fetch` downloads Whitaker's Words (dictionary data with a frequency tier per entry) and the
Perseus Latin Dependency Treebank (about 45,000 running words) into `tools/.cache` (not committed); `build` turns
them into `band-*.json` and `order.json`; `report` shows counts and anything unresolved. The order is: the
hand-picked must-haves in `tools/vocab-musthave.txt`, then words seen three or more times in the treebank, then
Whitaker's tiers A, B and C.

**Be honest about what that gives you.** Only the first ~2,000 words are ranked by actual evidence. The rest are in
Whitaker's tier order, so the tail up to 5,000 is "common-ish", with some obscure words in it. The glosses are
Whitaker's, short and unreviewed. List words from the bands have no macrons. Treat the list as roughly the 5,000 most
useful words, not exact ranks.

### Adding or changing words without duplicating them

| you want to...                                         | do this                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| make a word a flashcard                                 | its id must be in `order.json` (the validator warns about list words that are not)          |
| put a word you need early in the list                   | add its lemma to `tools/vocab-musthave.txt` and rebuild (see below), or move its id in `order.json` |
| add a word the data missed                              | add an entry to `supplement.json` (`vocabOnly: true`, `pin: true`), add its id to `order.json` |
| use a list word in sentences                            | **promote** it: move its entry from the band file into a hand-made file (e.g. `core.json`) and give it a stem and class. The id stays the same, so `order.json` and saved progress are untouched, and the word still exists once |
| fix a gloss                                             | edit the `gloss` in whichever file holds the entry                                          |
| remove a word from the trainer                          | delete its id from `order.json` (the lexicon entry may stay)                                |

`order.json` is just ids, so reordering it is safe. The loader refuses an id that is in `order.json` but not in the
lexicon, and the validator refuses an id listed twice.

**A full rebuild** (`vocab.mjs build`) is append-only: it never changes or duplicates an existing entry. To change the
ranking rules and start over, clear the band files, `order.json` and the band names in `index.json`, then run `build`.
Hand-made words are kept and put in their place in the order.

## The Grammar track

Seven short units that each drill one point: the genitive of the whole, of quality and value, with adjectives and
verbs of remembering, the fourth and fifth declensions, and the pronouns for I, you and we in every case. It opens
after *Core grammar* unit 9 (*Whose is it?*), where the genitive is first met. These are ordinary hand-written
sentences; each unit file starts with an `intro` that teaches the point before the first card. To add a point, add
a unit file, list it in `content/grammar/pack.json` and add any new skills to `content/grammar/skills.json`.

## The Street Latin track

How Romans actually sounded: shouts and oaths (*ēheu*, *mehercule*, *ecastor*, *vae victīs*), graffiti, signs and
tombstone formulas from Pompeii, and famous lines from Catullus, Cicero, Horace, Martial and Vergil. Opens after
*Like a Roman* unit 3. Items are ordinary sentences with a `tag` naming the source ("Catullus 85", "Pompeii
graffito", "tombstone"). **Cite only what you are sure of**: where the exact source or number is uncertain, tag
with the author or "Pompeii graffito" and nothing more. Lines that use grammar you have not met (for example
subjunctive wishes such as *sit tibi terra levis*) are taught as whole sayings and the unit intro says so.

## Removing a sentence

Deleting a shipped sentence orphans anyone's progress on it, so it must be a decision:

    node tools/ids.mjs retire core.3.07      records the id as deliberately removed
    (then delete the sentence)

`node tools/release.mjs` refuses to run while a shipped id is missing and not retired.

## Fix loop for flagged sentences

1. In the app, **Report a problem** on a sentence you think is wrong (or "My order is valid" when a correct word
   order was rejected).
2. Settings > Export file.
3. `node tools/flags.mjs <the export>` lists what you flagged and what you keep missing, with the file to edit.
4. Fix, `node tools/release.mjs --bump patch`, upload.

## Review status

Every sentence is `"review": "unreviewed"`; word-list glosses are machine-sourced and unchecked. Drafted by Claude, checked mechanically (forms, spelling against the
lexicon), not by a Latin teacher. When a teacher or a good grammar has confirmed a sentence, change its `review` to
`"reviewed"`.
