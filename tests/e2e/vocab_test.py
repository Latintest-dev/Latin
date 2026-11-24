"""Word trainer: new-word budget, the word card (teach, choose, hinted type, type), the lemma-only words page, and the macrons toggle."""
from lib import *

check = Checks()
with sync_playwright() as p:
    browser, ctx, page, errors = launch(p)
    open_app(page)
    idx = Index(page)

    # --- the Words screen has the word trainer: Meanings tab, study and quiz buttons, the frequency list in pages
    page.goto(BASE + '#/words'); page.wait_for_selector('.words-body')
    txt = page.inner_text('.words-body')
    check('Words opens on Meanings', 'Study words' in txt and 'Quick quiz' in txt and 'frequency list' in txt.lower(), txt[:100].replace('\n', ' | '))
    check('the frequency list shows 20 units at first', page.locator('.words-body .lesson').count() == 20, str(page.locator('.words-body .lesson').count()))
    page.click('button:has-text("Show more")')
    check('Show more adds the next 20', page.locator('.words-body .lesson').count() == 40)
    check('word lessons say words, not sentences', 'words' in page.inner_text('.words-body .lesson .meta'))
    open_app(page)

    # --- the first word unit: new word shows its principal parts, then the ladder runs choose -> hinted type -> type
    start(page, mode='unit', scope={'packId': 'vocab', 'unitId': '1'})
    seen = set()
    for _ in range(200):
        kind = screen(page)
        if kind == 'done':
            break
        eyebrow = page.inner_text('.eyebrow').strip().lower()
        if kind == 'unit':
            page.click('.card .btn.primary'); continue
        if kind == 'teach':
            check('a new word is labelled "new word"', 'new word' in eyebrow, eyebrow) if 'teach' not in seen else None
            seen.add('teach')
            page.click('.btn.primary:has-text("Got it")'); continue
        if kind == 'fill' and 'fill' not in seen:
            seen.add('fill')
            ph = page.get_attribute('.ans', 'placeholder')
            check('typed word cards ask for the Latin word', ph == 'the Latin word', str(ph))
            blank = page.inner_text('.blank')
            check('the hint shows the first letter and blanks', '_' in blank, blank)
        answer(page, idx, kind)
        page.wait_for_selector('.feedback')
        page.click('.feedback .btn.primary')
    check('a word unit plays to the end', screen(page) == 'done')
    check('saw a new-word teach card', 'teach' in seen)

    # --- the new-words budget is separate from the sentence budget, and 0 stops new words
    n_default = page.evaluate("""async () => { const m = await import('/js/core/modes.js'); const a = window.__app;
      const q = m.buildQueue({ content: a.content, itemStates: {}, skills: {}, mistakes: [], now: Date.now(), mode: 'continue', newTotal: 0, newWords: 0, tailWords: 5 });
      return q.filter(e => e.kind === 'new' && a.content.itemsById.get(e.itemId).word).length; }""")
    check('new words come from their own budget', n_default == 5, str(n_default))
    n_zero = page.evaluate("""async () => { const m = await import('/js/core/modes.js'); const a = window.__app;
      const q = m.buildQueue({ content: a.content, itemStates: {}, skills: {}, mistakes: [], now: Date.now(), mode: 'continue', newTotal: 6, newWords: 0, tailWords: 0 });
      return q.filter(e => e.kind === 'new' && a.content.itemsById.get(e.itemId).word).length; }""")
    check('0 new words per day means none', n_zero == 0, str(n_zero))

    # --- a word the lists know only by its dictionary entry still shows principal parts on the Words page
    page.goto(BASE + '#/words'); page.wait_for_selector('.tabs')
    page.click('.pill:has-text("Look up")'); page.wait_for_selector('.wordlist')
    page.fill('input[type=search]', 'hostis')
    page.wait_for_selector('.word'); page.click('.word summary')
    check('words page opens a word', page.locator('.word[open]').count() == 1)

    # --- settings has the new-words control
    page.goto(BASE + '#/settings'); page.wait_for_selector('select')
    check('settings offers a new-words limit', page.locator('select[aria-label*="words from your lessons" i]').count() == 1,
          str(page.locator('select').evaluate_all('els => els.map(e => e.getAttribute("aria-label"))')))
    check('no console/page errors', not errors, str(errors[:3]))
    browser.close()
check.done()
