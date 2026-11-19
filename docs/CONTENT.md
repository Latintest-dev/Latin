# Content guide

How the Latin gets into the app, and how to add or fix it. Everything the learner sees is data in `content/`;
no content lives in the JavaScript. After any content change run `node tools/release.mjs --check`.

## Layout

    content/lexicon.json     every word (regular words by stem; irregulars by explicit forms)
    content/skills.json      skill names for the Progress screen
    content/<track>/pack.json    track name, blurb, optional "requires", and the list of units
    content/<track>/u<id>.json   a unit's sentences (hand-written, or written by the generator)
    content/<track>/gen/<id>.json   generator input for a unit (templates); only for generated units
    js/modules/registry.js   the list of tracks (one line per track)

Two rules that keep progress safe:

1. **A sentence's id never changes and never disappears.** Saved progress is keyed by id. `tools/ids.mjs`
   enforces this (see "Removing a sentence" below).
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

Regular nouns, adjectives and verbs need only a stem and class (copy an existing entry). Verbs take a perfect stem
as `pf` (`"stem":"ambul","pf":"ambulāv"`); with it the generator builds present, imperfect, future and perfect
(active indicative), the infinitive and the commands. Irregular words list their forms. Nouns in -us get a vocative
automatically. Words carry tags (`person`, `edible`, `readable`, `land`, `indoor`, ...) and verbs list what they can
take (`obj`) or where they happen (`loc`), which is how generated sentences make sense ("the boy eats bread", never
"the boy eats the street").

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

Every sentence is `"review": "unreviewed"`. Drafted by Claude, checked mechanically (forms, spelling against the
lexicon), not by a Latin teacher. When a teacher or a good grammar has confirmed a sentence, change its `review` to
`"reviewed"`.
