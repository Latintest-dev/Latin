"""Latin-question items and situation items: teach card, reply choices, typed diagnosis, and the slips shown on Progress."""
import re
from lib import *

check = Checks()
WRONG = {'Quid herī ēgistī?': 'Heri domi laboro', 'Quid heri egisti?': 'Heri domi laboro',
         'Yesterday I ate bread.': 'Heri panem edo', 'Ask your friend whether he is tired.': 'Fessus'}

with sync_playwright() as p:
    browser, ctx, page, errors = launch(p)
    open_app(page)
    unlock(page, 'roman', '3')

    # 1. a Latin question: teach card, then reply choices
    start(page, mode='unit', scope={'packId': 'roman', 'unitId': '3'})
    page.wait_for_selector('.card .btn.primary'); page.click('.card .btn.primary')
    page.wait_for_selector('.eyebrow')
    check('question teach card', page.inner_text('.eyebrow').lower() == 'new question and reply', page.inner_text('.eyebrow'))
    check('teach card shows the Latin question as the prompt', page.inner_text('.prompt').strip() == 'Quid agis?')
    check('teach card shows the English gloss', 'How are you' in page.inner_text('.gloss'))
    page.screenshot(path=f'{SHOTS}/q-teach.png')
    page.click('.btn.primary:has-text("Got it")')
    check('first exercise is "Choose the reply"', page.inner_text('.eyebrow').lower() == 'choose the reply', page.inner_text('.eyebrow'))
    opts = [o.inner_text() for o in page.query_selector_all('.opt')]
    check('reply options are Latin (4 of them)', len(opts) == 4 and all(re.search('[A-Za-z]', o) for o in opts), str(opts))
    for o in page.query_selector_all('.opt'):
        if o.inner_text().strip() == 'Bene vales.': o.click(); break
    page.wait_for_selector('.feedback')
    check('a wrong reply explains why', 'you are well' in page.inner_text('.feedback').lower(), page.inner_text('.feedback')[:200].replace('\n', ' | '))

    # 2. typed wrong answers get a diagnosis (forced into review at the right level via the store)
    open_app(page)
    page.evaluate("""()=>{const s=window.__app.store; const t=Date.now()-1000;
      for (const id of ['roman.3.09','roman.1.05','daily.4.02','roman.1.01']) s.putItem(id,{lvl:2,box:1,due:t,intro:true,seen:3,ok:3,bad:0,last:t,upd:t});
      s.putItem('roman.1.05',{lvl:1,box:0,due:t,intro:true,seen:2,ok:2,bad:0,last:t,upd:t});}""")
    start(page, mode='continue')
    seen = {}
    for _ in range(14):
        kind = screen(page)
        if kind == 'done': break
        if kind == 'unit': page.click('.card .btn.primary'); continue
        if kind == 'teach': page.click('.btn.primary:has-text("Got it")'); continue
        if kind in ('fill', 'write'):
            eb = page.inner_text('.eyebrow').lower(); prompt = page.inner_text('.prompt').strip()
            page.fill('.ans', WRONG.get(prompt, 'x')); page.keyboard.press('Enter'); page.wait_for_selector('.feedback')
            seen[prompt] = (eb, page.inner_text('.feedback'))
            page.click('.feedback .btn.primary'); continue
        page.click('.opt'); page.wait_for_selector('.feedback'); page.click('.feedback .btn.primary')
    q = [v for k, v in seen.items() if 'ēgistī' in k or 'egisti' in k]
    check('question item typed: tense diagnosis shown', q and 'present tense' in q[0][1], str(q)[:200])
    check('question prompt eyebrow is "Reply in Latin"', q and q[0][0].startswith('reply in latin'), str(q[0][0] if q else ''))
    sit = [v for k, v in seen.items() if k.startswith('Ask your friend whether')]
    check('situation item shown with a situation prompt', bool(sit), str(list(seen)))
    if sit: check('situation typed: missing -ne diagnosed', 'yes/no' in sit[0][1].lower(), sit[0][1][:200])
    page.goto(BASE + '#/progress'); page.wait_for_selector('h1')
    body = page.inner_text('body')
    check('progress lists tense and -ne slips', 'tense' in body.lower() and '-ne' in body)
    page.screenshot(path=f'{SHOTS}/progress-new.png', full_page=True)

    # 3. a change-it item typed wrong: the slip names the right ending, and Progress shows what was asked
    open_app(page)
    unlock(page, 'swap', '1')
    start(page, mode='unit', scope={'packId': 'swap', 'unitId': '1'})
    page.wait_for_selector('.card .btn.primary'); page.click('.card .btn.primary')
    page.wait_for_selector('.eyebrow')
    check('change-it teach card says "New change"', page.inner_text('.eyebrow').lower() == 'new change', page.inner_text('.eyebrow'))
    check('change-it teach card shows the Latin and the instruction', page.query_selector('.prompt.la') is not None and page.query_selector('.cue.change em') is not None)
    open_app(page)
    page.evaluate("""async () => { const a = window.__app, s = a.store, t = Date.now() - 1000;   // three change-it sentences due at the typing level
      for (const it of a.content.packs.find(p => p.id === 'swap').units[0].items.slice(0, 3)) s.putItem(it.id, {lvl: 1, box: 0, due: t, intro: true, seen: 2, ok: 2, bad: 0, last: t, upd: t});
      await s.flush(); }""")
    start(page, mode='unit', scope={'packId': 'swap', 'unitId': '1'})
    swap_fb = ''
    for _ in range(40):
        kind = screen(page)
        if kind == 'unit': page.click('.card .btn.primary'); continue
        if kind == 'teach': page.click('.btn.primary:has-text("Got it")'); continue
        if kind in ('fill', 'write'):
            page.fill('.ans', 'x'); page.keyboard.press('Enter'); page.wait_for_selector('.feedback')
            swap_fb = page.inner_text('.feedback'); break
        page.click('.opt'); page.wait_for_selector('.feedback'); page.click('.feedback .btn.primary')
    check('wrong change-it answer shows the right sentence', 'Correct answer' in swap_fb or 'correct answer' in swap_fb.lower(), swap_fb[:160].replace('\n', ' | '))
    page.goto(BASE + '#/progress'); page.wait_for_selector('h1')
    ask = page.query_selector('.mistake .swap-ask')
    check('progress shows what was asked for a change-it slip, not only the English', ask is not None and ' → ' in ask.inner_text(), ask.inner_text() if ask else 'none')
    check('no console errors', not errors, str(errors)[:300])
    browser.close()
check.done()
