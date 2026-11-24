"""The app as a whole: offline use, sessions, unlocking, macron settings, flags, export/import/reset, progress, desktop."""
import json, re
from lib import *

check = Checks()
STATE = "() => JSON.stringify({i:Object.keys(window.__app.store.state.items).length, m:window.__app.store.state.mistakes.length, s:Object.keys(window.__app.store.state.skills).length})"
MACRON = re.compile('[āēīōū]')

with sync_playwright() as p:
    browser, ctx, page, errors = launch(p, accept_downloads=True)
    open_app(page)
    idx = Index(page)

    # --- service worker and offline
    page.wait_for_function("() => navigator.serviceWorker.ready.then(() => true)")
    page.wait_for_function("() => caches.keys().then(k => k.length > 0)")
    cached = page.evaluate("async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return (await c.keys()).length; }")
    check('service worker precached the app', cached >= 40, f'{cached} files')
    page.reload(); page.wait_for_selector('h1')          # now controlled by the service worker
    ctx.set_offline(True)
    page.reload(); page.wait_for_selector('h1')
    check('app loads fully offline', page.inner_text('h1') == 'Today' and page.query_selector('.btn.big') is not None)
    page.click('.btn.big')
    n = play(page, idx)
    check('session works offline', n > 10, f'{n} steps')
    ctx.set_offline(False)

    # --- home after progress
    open_path(page)
    metas = [e.inner_text() for e in page.query_selector_all('.lesson .meta')]
    check('the Path shows progress per lesson', re.match(r'\d+/\d+ met', metas[0]) and not metas[0].startswith('0/'), metas[0])
    check('lesson 2 still locked after one session', 'locked' in page.query_selector_all('.lesson')[1].get_attribute('class'))
    check('a locked lesson says what to do', 'Meet' in page.inner_text('.lesson.locked .lockline') and 'unlock' in page.inner_text('.lesson.locked .lockline'), page.inner_text('.lesson.locked .lockline'))
    check('the Path has twelve stages', page.locator('details.stage').count() == 12)

    # --- many sessions: reviews are not due yet, new units unlock
    for _ in range(5):
        open_app(page); page.wait_for_selector('.btn.big')
        page.click('.btn.big'); play(page, idx)
    open_path(page)
    classes = [e.get_attribute('class') for e in page.query_selector_all('.lesson')]
    check('core unit 2 unlocked after unit 1 is mostly met', 'locked' not in classes[1], str([e.inner_text() for e in page.query_selector_all('.lesson .meta')][:2]))
    # --- Continue follows the Path: its new sentences come from the stage you are on
    stage_of_new = page.evaluate("""async () => { const m = await import('/js/core/modes.js'); const a = window.__app;
      const q = m.buildQueue({content: a.content, itemStates: a.store.state.items, skills: a.store.state.skills, mistakes: [], now: Date.now(), mode: 'continue', newTotal: 6, newWords: 0, tailWords: 0, rng: () => 0.5});
      const fresh = q.filter(e => e.kind === 'new');
      return [...new Set(fresh.map(e => a.content.stages.findIndex(s => s.units.some(u => u.unit.items.some(i => i.id === e.itemId)))))]; }""")
    check('Continue takes new sentences from one or two neighbouring stages', 1 <= len(stage_of_new) <= 2, str(stage_of_new))

    # --- macrons on: a teach card shows them
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.check('.toggle:has-text("Show macrons") input')
    page.evaluate("() => window.__app.store.flush()")
    open_app(page)
    page.click('.btn.big')
    txt = ''
    for _ in range(6):
        kind = screen(page)
        if kind == 'unit': page.click('.card .btn.primary'); continue
        if kind == 'teach': txt = page.inner_text('.answer')
        break
    check('macrons shown when the setting is on', MACRON.search(txt) is not None, txt)

    # --- strict macrons: a macron-less answer is "almost", with a hint
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.uncheck('.toggle:has-text("Show macrons") input')
    page.check('.toggle:has-text("Require macrons") input')
    page.evaluate("() => window.__app.store.flush()")
    open_app(page); page.click('.btn.big')
    seen_close = False
    for _ in range(150):
        kind = screen(page)
        if kind == 'done': break
        if kind == 'unit': page.click('.card .btn.primary'); continue
        if kind == 'teach': page.click('.btn.primary:has-text("Got it")'); continue
        if kind in ('fill', 'write'):
            it = idx.current(page)[0]
            want = it['fill'] if kind == 'fill' else it['la']
            if MACRON.search(want):
                page.fill('.ans', strip(want)); page.keyboard.press('Enter'); page.wait_for_selector('.feedback')
                fb = page.inner_text('.feedback')
                seen_close = 'ALMOST' in fb.upper() and 'macron' in fb.lower()
                break
        answer(page, idx, kind); page.wait_for_selector('.feedback'); page.click('.feedback .btn.primary')
    check('strict macrons: a macron-less answer is "Almost" with a macron hint', seen_close)
    page.screenshot(path=f'{SHOTS}/strict-close.png')
    page.click('.feedback .btn.ghost:has-text("Report a problem")')
    check('report-a-problem stores a flag', page.evaluate("() => window.__app.store.state.flags.length") == 1)
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.uncheck('.toggle:has-text("Require macrons") input')

    # --- export, erase, import (merge), bad import
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    with page.expect_download() as dl:
        page.click('button:has-text("Export file")')
    path = dl.value.path()
    data = json.load(open(path))
    check('export file has the expected shape', data['app'] == 'latin-app' and data['schema'] == 1 and len(data['items']) > 4, f"{len(data['items'])} items, {len(data['mistakes'])} mistakes")
    before = page.evaluate(STATE)
    page.once('dialog', lambda d: d.accept())
    page.click('button:has-text("Erase progress")')
    page.wait_for_function("() => Object.keys(window.__app.store.state.items).length === 0")
    page.reload(); page.wait_for_selector('h1')
    check('reset really erased persisted data', page.evaluate("() => Object.keys(window.__app.store.state.items).length") == 0)
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.set_input_files('input[type=file]', path)
    page.wait_for_selector('.status.good')
    check('import restores items, mistakes and skills', before == page.evaluate(STATE), f'{before} -> {page.evaluate(STATE)}')
    page.reload(); page.wait_for_selector('h1')
    check('imported data persisted across a reload', page.evaluate("() => Object.keys(window.__app.store.state.items).length") == json.loads(before)['i'])
    bad = '/tmp/bad.json'; open(bad, 'w').write('{"hello": 1}')
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.set_input_files('input[type=file]', bad)
    page.wait_for_selector('.status.bad')
    check('a bad import file is rejected with a message', 'not a Latin app export' in page.inner_text('.status'))

    # --- progress page with mistakes; practice weak spots
    page.goto(BASE + '#/progress'); page.wait_for_selector('h1')
    page.screenshot(path=f'{SHOTS}/progress.png', full_page=True)
    check('progress page has no stray object text', '[object' not in page.inner_text('body'))
    page.click('button:has-text("Practice weak spots")'); page.wait_for_selector('.eyebrow')
    n = play(page, idx)
    check('weak-spot session completes', n > 3, f'{n} steps')

    # --- desktop viewport
    page.set_viewport_size({'width': 1100, 'height': 800})
    open_app(page); page.wait_for_selector('.today')
    page.screenshot(path=f'{SHOTS}/desktop-home.png')
    check('no console/page errors', not errors, str(errors)[:300])
    browser.close()
check.done()
