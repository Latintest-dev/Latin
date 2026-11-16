import json, re, unicodedata, os
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8765/'
def strip(s):
    return unicodedata.normalize('NFC', ''.join(c for c in unicodedata.normalize('NFD', s) if c not in '̄̆'))
errors = []
checks = []
def check(name, cond, extra=''):
    checks.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))

def classify(eb):
    eb = eb.strip().lower()
    if eb == 'session complete': return 'done'
    if eb.endswith('new unit'): return 'unit'
    if eb in ('new sentence', 'new situation', 'new question and reply'): return 'teach'
    if eb == 'what does this mean?': return 'l2e'
    if eb.startswith('choose the') or eb == 'what would you say?': return 'e2l'
    if 'fill in the blank' in eb: return 'fill'
    if 'write it in latin' in eb or eb == 'reply in latin': return 'write'
    raise SystemExit('unknown eyebrow: ' + eb)

def click_option(page, want, loose):
    for o in page.query_selector_all('.opt'):
        t = o.inner_text().strip()
        if (strip(t) == strip(want)) if loose else (t == want): o.click(); return
    raise SystemExit('option not found: ' + want)

def answer_mc(page, kind, prompt, by_prompt, by_la):
    if kind == 'e2l':
        click_option(page, by_prompt[strip(prompt)]['la'], True)
    else:
        click_option(page, by_la[strip(prompt)]['en'], False)

def play(page, by_prompt, by_la, max_steps=300):
    """Bot: answers everything correctly (typing macron-free Latin) until the summary."""
    steps = 0
    while steps < max_steps:
        steps += 1
        page.wait_for_selector('.eyebrow')
        kind = classify(page.inner_text('.eyebrow'))
        if kind == 'done': return steps
        if kind == 'unit': page.click('.card .btn.primary'); continue
        if kind == 'teach':
            assert 'null' not in page.inner_text('.exercise'), 'teach card printed null'
            page.click('.btn.primary:has-text("Got it")'); continue
        prompt = page.inner_text('.prompt').strip()
        if kind in ('e2l', 'l2e'):
            answer_mc(page, kind, prompt, by_prompt, by_la)
        elif kind == 'fill':
            page.fill('.ans', strip(by_prompt[strip(prompt)]['fill'])); page.keyboard.press('Enter')
        else:
            page.fill('.ans', strip(by_prompt[strip(prompt)]['la'])); page.keyboard.press('Enter')
        page.wait_for_selector('.feedback')
        page.click('.feedback .btn.primary')
    raise SystemExit('too many steps')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE); page.wait_for_selector('h1')
    items = page.evaluate("() => [...window.__app.content.itemsById.values()].map(i => ({id:i.id,en:i.en,la:i.la,fill:i.fill,prompt:i.q||i.sit||i.en,q:!!i.q}))")
    by_prompt = {strip(i['prompt']): i for i in items}; by_la = {strip(i['la']): i for i in items if not i['q']}

    # --- service worker + offline -------------------------------------------------
    page.wait_for_function("() => navigator.serviceWorker.ready.then(() => true)")
    page.wait_for_function("() => caches.keys().then(k => k.length > 0)")
    cached = page.evaluate("async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return (await c.keys()).length; }")
    check('service worker precached the app', cached >= 30, f'{cached} files')
    page.reload(); page.wait_for_selector('h1')   # now controlled by the SW
    ctx.set_offline(True)
    page.reload(); page.wait_for_selector('h1')
    check('app loads fully offline', page.inner_text('h1') == 'Latin' and page.query_selector('.btn.big') is not None)
    # play a short session offline
    page.click('.btn.big')
    n = play(page, by_prompt, by_la)
    check('session works offline', n > 10, f'{n} steps')
    ctx.set_offline(False)

    # --- home after progress: unit counts, locked units ------------------------------
    page.goto(BASE); page.wait_for_selector('.unit')
    metas = [e.inner_text() for e in page.query_selector_all('.unit .meta')]
    check('home shows progress per unit', metas[0].startswith('2/11 met'), metas[0])
    check('unit 2 still locked', page.query_selector_all('.unit')[1].get_attribute('class').find('locked') >= 0)

    # --- many sessions: reviews not due yet, unit unlock ----------------------------
    for _ in range(5):
        page.goto(BASE); page.wait_for_selector('.btn.big')
        page.click('.btn.big'); play(page, by_prompt, by_la)
    page.goto(BASE); page.wait_for_selector('.unit')
    metas = [e.inner_text() for e in page.query_selector_all('.unit .meta')]
    classes = [e.get_attribute('class') for e in page.query_selector_all('.unit')]
    print('   unit meters:', metas)
    check('core unit 2 unlocked after unit 1 mostly met', 'locked' not in classes[1], metas[0])

    # --- settings: macron display + strict mode ---------------------------------------
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.check('.toggle:has-text("Show macrons") input')
    page.evaluate("() => window.__app.store.flush()")
    page.goto(BASE + '#/progress'); page.wait_for_selector('h1')
    page.goto(BASE); page.click('.btn.big')
    page.wait_for_selector('.eyebrow')
    txt = ''
    for _ in range(6):
        kind = classify(page.inner_text('.eyebrow'))
        if kind == 'unit': page.click('.card .btn.primary'); continue
        if kind == 'teach':
            txt = page.inner_text('.answer'); break
        break
    check('macrons shown when setting is on', re.search('[āēīōū]', txt) is not None, txt)
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.uncheck('.toggle:has-text("Show macrons") input')
    page.check('.toggle:has-text("Require macrons") input')
    page.evaluate("() => window.__app.store.flush()")   # let the write finish before navigating away
    # play until we meet a typed exercise and type without macrons -> "Almost"
    page.goto(BASE); page.click('.btn.big')
    seen_close = False
    for _ in range(120):
        page.wait_for_selector('.eyebrow'); kind = classify(page.inner_text('.eyebrow'))
        if kind == 'done': break
        if kind == 'unit': page.click('.card .btn.primary'); continue
        if kind == 'teach': page.click('.btn.primary:has-text("Got it")'); continue
        prompt = page.inner_text('.prompt').strip()
        if kind in ('fill', 'write'):
            it = by_prompt[strip(prompt)]
            txt = it['fill'] if kind == 'fill' else it['la']
            if re.search('[āēīōū]', txt):
                page.fill('.ans', strip(txt)); page.keyboard.press('Enter'); page.wait_for_selector('.feedback')
                fb = page.inner_text('.feedback')
                seen_close = 'ALMOST' in fb.upper() and 'macron' in fb.lower()
                break
            page.fill('.ans', strip(txt)); page.keyboard.press('Enter'); page.wait_for_selector('.feedback'); page.click('.feedback .btn.primary'); continue
        answer_mc(page, kind, prompt, by_prompt, by_la)
        page.wait_for_selector('.feedback'); page.click('.feedback .btn.primary')
    check('strict macrons: macron-less answer is "Almost" with a macron hint', seen_close)
    page.screenshot(path='/home/claude/e2e/shots/08-strict-close.png')
    # flag a problem
    page.click('.feedback .btn.ghost:has-text("Report a problem")')
    nflags = page.evaluate("() => window.__app.store.state.flags.length")
    check('report-a-problem stores a flag', nflags == 1)
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.uncheck('.toggle:has-text("Require macrons") input')

    # --- export / import / reset ---------------------------------------------------------
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    with page.expect_download() as dl:
        page.click('button:has-text("Export file")')
    path = dl.value.path()
    data = json.load(open(path))
    check('export file has expected shape', data['app'] == 'latin-app' and data['schema'] == 1 and len(data['items']) > 4, f"{len(data['items'])} items, {len(data['mistakes'])} mistakes")
    before = page.evaluate("() => JSON.stringify({i:Object.keys(window.__app.store.state.items).length, m:window.__app.store.state.mistakes.length, s:Object.keys(window.__app.store.state.skills).length})")
    page.once('dialog', lambda d: d.accept())
    page.click('button:has-text("Erase progress")')
    page.wait_for_function("() => Object.keys(window.__app.store.state.items).length === 0")
    page.reload(); page.wait_for_selector('h1')
    zero = page.evaluate("() => Object.keys(window.__app.store.state.items).length")
    check('reset really erased persisted data', zero == 0)
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.set_input_files('input[type=file]', path)
    page.wait_for_selector('.status.good')
    after = page.evaluate("() => JSON.stringify({i:Object.keys(window.__app.store.state.items).length, m:window.__app.store.state.mistakes.length, s:Object.keys(window.__app.store.state.skills).length})")
    check('import restores items/mistakes/skills', before == after, f'{before} -> {after}')
    print('   status:', page.inner_text('.status'))
    page.reload(); page.wait_for_selector('h1')
    persisted = page.evaluate("() => Object.keys(window.__app.store.state.items).length")
    check('imported data persisted across reload', persisted == json.loads(before)['i'])
    # bad import
    bad = '/tmp/bad.json'; open(bad, 'w').write('{"hello": 1}')
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.set_input_files('input[type=file]', bad)
    page.wait_for_selector('.status.bad')
    check('bad import file is rejected with a message', 'not a Latin app export' in page.inner_text('.status'))

    # --- progress page with mistakes -----------------------------------------------------
    page.goto(BASE + '#/progress'); page.wait_for_selector('h1')
    page.screenshot(path='/home/claude/e2e/shots/09-progress.png', full_page=True)
    check('progress page has no stray object text', '[object' not in page.inner_text('body'))
    # weak-spot session starts
    page.click('button:has-text("Practise weak spots")'); page.wait_for_selector('.eyebrow')
    check('weak-spot session runs', page.query_selector('.exercise') is not None or page.query_selector('.card') is not None)
    n = play(page, by_prompt, by_la)
    check('weak-spot session completes', n > 3, f'{n} steps')

    # --- desktop viewport screenshot ---------------------------------------------------------
    page.set_viewport_size({'width': 1100, 'height': 800})
    page.goto(BASE); page.wait_for_selector('.unit')
    page.screenshot(path='/home/claude/e2e/shots/10-desktop-home.png')
    check('no console/page errors', not errors, str(errors)[:300])
    b.close()

failed = [n for n, ok in checks if not ok]
print(f'\n{len(checks)-len(failed)}/{len(checks)} checks passed', '' if not failed else f'FAILED: {failed}')
