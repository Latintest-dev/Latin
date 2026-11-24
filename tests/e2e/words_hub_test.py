"""The Words screen (Meanings, Forms, Look up), forms practice, use-it-in-sentences, lesson words, practice-a-weak-skill."""
import json
from lib import *

check = Checks()
FORM_ITEM = "([w, cell]) => { const i = window.__app.content.itemsById.get(`form.${w}.${cell}`); return i ? {en: i.en, la: i.la, fill: i.fill} : null; }"


def play_forms(page, words, wrong_all=False):
    """Play a forms session correctly (or with every answer wrong); returns the number of questions."""
    lookup = {}
    for w in words:
        for cell in page.evaluate("async (w) => (await import('/js/engine/forms.js')).cellsOf(window.__app.content, w)", w):
            it = page.evaluate(FORM_ITEM, [w, cell])
            if it:
                lookup[strip(it['en']).lower()] = it
    n = 0
    while True:
        page.wait_for_selector('.eyebrow')
        if page.query_selector('.card.center .eyebrow'):
            return n
        if page.query_selector('.btn.primary:has-text("Got it")'):
            page.click('.btn.primary:has-text("Got it")'); continue
        prompt = strip(page.inner_text('.prompt').strip()).lower()
        it = lookup[prompt]
        if page.query_selector('.options'):
            if wrong_all and n < 6:
                for o in page.query_selector_all('.opt'):
                    if strip(o.inner_text().strip()) != strip(it['la']):
                        o.click(); break
            else:
                click_any(page, [it['la']], True)
        else:
            page.fill('.ans', 'x' if (wrong_all and n < 6) else strip(it['fill'])); page.keyboard.press('Enter')
        page.wait_for_selector('.feedback')
        page.click('.feedback .btn.primary')
        n += 1


with sync_playwright() as p:
    browser, ctx, page, errors = launch(p)
    open_app(page)
    idx = Index(page)

    # --- fresh: tabs exist, forms have nothing to practice yet, Practice is disabled and says why
    page.goto(BASE + '#/words'); page.wait_for_selector('.tabs')
    check('three tabs', page.locator('.tabs .pill').all_inner_texts() == ['Meanings', 'Forms', 'Look up'])
    page.click('.pill:has-text("Forms")')
    check('nothing to practice before any lesson', page.is_disabled('button:has-text("Practice forms")') and 'Nothing to practice yet' in page.inner_text('.words-body'))

    # --- meet the first stage: now words with tables can be practiced
    unlock(page, 'core', '4')
    open_app(page)
    page.goto(BASE + '#/words'); page.wait_for_selector('.tabs'); page.click('.pill:has-text("Forms")')
    check('Practice forms is on once words are met', not page.is_disabled('button:has-text("Practice forms")'))
    studied = page.evaluate("async () => { const m = await import('/js/core/modes.js'); const a = window.__app; return [...m.studiedWords(a.content, a.store.state.items)]; }")
    check('studied words come from the sentences met', len(studied) > 20, str(len(studied)))

    # --- the Meanings tab counts the words waiting from lessons
    page.click('.pill:has-text("Meanings")')
    check('Meanings says how many lesson words are waiting', 'waiting to be learned' in page.inner_text('.words-body'), page.inner_text('.words-body')[:200].replace('\n', ' | '))

    # --- a session of word cards starts with lesson words, not just the top of the list
    lesson_words = page.evaluate("""async () => { const m = await import('/js/core/modes.js'); const a = window.__app;
      const q = m.buildQueue({content: a.content, itemStates: a.store.state.items, skills: {}, mistakes: [], now: Date.now() + 40*864e5, mode: 'words', newWords: 6, tailWords: 0, rng: () => 0.5});
      return q.filter(e => e.kind === 'new').map(e => a.content.itemsById.get(e.itemId).word).map(w => a.content.lesson.wordItems.has(w)); }""")
    check('new word cards are words your lessons use', len(lesson_words) == 6 and all(lesson_words), str(lesson_words))

    # --- forms practice: correct answers; no per-form schedule; skills recorded; summary offers sentences
    before_items = page.evaluate("() => Object.keys(window.__app.store.state.items).length")
    page.click('.pill:has-text("Forms")')
    page.click('button:has-text("Practice forms")')
    page.wait_for_selector('.eyebrow')
    check('forms eyebrow counts the questions', page.inner_text('.eyebrow').lower().startswith('forms, 1 of '), page.inner_text('.eyebrow'))
    n = play_forms(page, studied)
    check('forms practice plays to the end', 1 <= n <= 10, str(n))
    state = page.evaluate("() => ({items: Object.keys(window.__app.store.state.items).filter(k => k.startsWith('form.')).length, skills: Object.keys(window.__app.store.state.skills).filter(k => k.startsWith('form.'))})")
    check('forms leave no per-form schedule', state['items'] == 0 and page.evaluate("() => Object.keys(window.__app.store.state.items).length") == before_items)
    check('forms record skills', len(state['skills']) >= 1, str(state['skills']))
    check('forms summary has its title', 'forms practice complete' in page.inner_text('.card.center').lower())
    follow = page.locator('.card.center button:has-text("Use these words in sentences")')
    check('summary offers the same words in sentences', follow.count() == 1)

    # --- use them in sentences: met sentences are replayed, all answerable with the normal bot
    follow.click()
    page.wait_for_selector('.eyebrow')
    if page.inner_text('.eyebrow').strip().lower().endswith('new unit'):
        page.click('.card .btn.primary'); page.wait_for_selector('.eyebrow')
    check('in-use session is labelled', 'sentence' in page.inner_text('.eyebrow').lower(), page.inner_text('.eyebrow'))
    n = play(page, idx, max_steps=40)
    check('in-use session plays to the end', n >= 2, str(n))

    # --- a word: its table, Drill its forms, Use it in sentences
    page.goto(BASE + '#/words'); page.wait_for_selector('.tabs'); page.click('.pill:has-text("Forms")')
    page.wait_for_selector('.word summary'); page.locator('.word summary').first.click()
    page.wait_for_selector('.word[open] table.forms')
    check('a studied word shows its table and two actions', page.locator('.word[open] .btn-row button').count() == 2)
    page.locator('.word[open] button:has-text("Drill its forms")').click()
    page.wait_for_selector('.eyebrow')
    check('one word drill only uses that word', page.inner_text('.eyebrow').lower().startswith('forms, 1 of '))
    page.goto(BASE); page.wait_for_selector('.today')

    # --- a slip makes the forms skill weak, and Progress offers Practice on it
    page.goto(BASE + '#/words'); page.wait_for_selector('.tabs'); page.click('.pill:has-text("Forms")')
    studied = page.evaluate("async () => { const m = await import('/js/core/modes.js'); const a = window.__app; return [...m.studiedWords(a.content, a.store.state.items)]; }")
    page.click('button:has-text("Practice forms")'); page.wait_for_selector('.eyebrow')
    play_forms(page, studied, wrong_all=True)
    page.goto(BASE + '#/progress'); page.wait_for_selector('.skill')
    weak = page.locator('.skill:has(button:has-text("Practice"))')
    check('Progress offers Practice on a weak skill', weak.count() >= 1)
    check('forms skills have names, not ids', 'form.' not in page.inner_text('body'))
    weak.first.locator('button').click()
    page.wait_for_selector('.eyebrow')
    check('practicing a weak forms skill starts a forms session', 'forms' in page.inner_text('.eyebrow').lower() or page.query_selector('.card.center'))
    page.goto(BASE); page.wait_for_selector('.today')

    # --- practice one sentence skill (a 'skill' session over the sentences that use it)
    skill = page.evaluate("""() => { const a = window.__app; const st = a.store.state.items;
      for (const it of a.content.itemsById.values()) { if (it.word || !st[it.id]?.intro) continue; if (it.skills?.[0]) return it.skills[0]; } return null; }""")
    page.evaluate("(s) => window.__app.startSession({mode: 'skill', scope: {skill: s}})", skill)
    page.wait_for_selector('.eyebrow')
    n = play(page, idx, max_steps=40)
    check('a skill session plays to the end', n >= 1, f'{skill}: {n} steps')

    # --- the sentence count on Progress counts sentences only
    page.goto(BASE + '#/progress'); page.wait_for_selector('h1')
    sub = page.inner_text('.page-head .sub')
    total = page.evaluate("() => window.__app.content.packs.filter(p => p.budget !== 'words').flatMap(p => p.units.flatMap(u => u.items)).length")
    check('Progress counts sentences only', f'of {total} sentences' in sub, sub)
    check('no console/page errors', not errors, str(errors[:3]))
    browser.close()
check.done()
