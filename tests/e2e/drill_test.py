import json, unicodedata, time
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8765/'
def strip(s):
    return unicodedata.normalize('NFC', ''.join(c for c in unicodedata.normalize('NFD', s) if c not in '̄̆'))
errors, checks = [], []
def check(name, cond, extra=''):
    checks.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))

KNOWN = "{lvl:2, box:3, due:Date.now()+8*864e5, intro:true, seen:5, ok:5, bad:0, last:Date.now(), upd:Date.now()}"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE); page.wait_for_selector('h1')

    # --- fresh start: today strip, speed round locked
    txt = page.inner_text('.today')
    check('home shows today strip', '0' in txt and 'answers today' in txt and 'No streak yet' in txt, txt.replace('\n', ' | '))
    check('speed round locked at first', page.is_disabled('.btn.speed'))
    check('four tracks listed', page.locator('section.pack').count() == 4, str(page.locator('section.pack h2').all_inner_texts()))

    # --- know the whole morning script and several other sentences
    page.evaluate("""async () => { const a = window.__app, s = a.store;
      const day = a.content.packs.find(p => p.id === 'day');
      for (const it of day.units[0].items) s.putItem(it.id, %s);
      const core = [...a.content.itemsById.values()].filter(i => i.id.startsWith('core.1.')).slice(0, 6);
      for (const it of core) s.putItem(it.id, %s); await s.flush(); }""" % (KNOWN, KNOWN))
    page.goto(BASE); page.wait_for_selector('h1')
    check('speed round unlocked', not page.is_disabled('.btn.speed'))
    narr = page.locator('.unit-btns button:has-text("Narrate it")')
    check('Narrate it appears on met scripts only', narr.count() == 1, f'{narr.count()} buttons')

    # --- speed round: timer, correct answers do not move the schedule
    before = page.evaluate("() => JSON.stringify(Object.fromEntries(Object.entries(window.__app.store.state.items).map(([k,v]) => [k,[v.box,v.due]])))")
    page.click('.btn.speed')
    page.wait_for_selector('.eyebrow')
    check('speed round shows a countdown bar', page.query_selector('.timer .timer-fill') is not None)
    check('speed eyebrow', 'speed round' in page.inner_text('.eyebrow').lower(), page.inner_text('.eyebrow'))
    items = page.evaluate("() => [...window.__app.content.itemsById.values()].map(i => ({id:i.id, la:i.la, q:i.q||'', en:i.en, prompt:i.q||i.sit||i.en}))")
    by_prompt = {}
    for i in items: by_prompt.setdefault(strip(i['prompt']), []).append(i)
    answered = 0
    while True:
        page.wait_for_selector('.eyebrow, .feedback')
        eb = page.inner_text('.eyebrow').strip().lower()
        if eb == 'speed round complete': break
        pr = strip(page.inner_text('.prompt').strip())
        cand = by_prompt[pr]
        if len(cand) > 1:  # same question, different answers: use the cue
            cue = strip(page.inner_text('.cue em')) if page.query_selector('.cue em') else ''
            cand = [c for c in cand if strip(c['en']).endswith(cue + '”')] or cand
        page.fill('.ans', strip(cand[0]['la'])); page.keyboard.press('Enter')
        page.wait_for_selector('.feedback'); answered += 1
        page.click('.feedback .btn.primary')
        if answered > 14: break
    check('speed round ends after ten', answered == 10, str(answered))
    summ = page.inner_text('.card')
    check('summary says in time', 'in time' in summ, summ.replace('\n', ' | ')[:120])
    after = page.evaluate("() => JSON.stringify(Object.fromEntries(Object.entries(window.__app.store.state.items).map(([k,v]) => [k,[v.box,v.due]])))")
    b4, af = json.loads(before), json.loads(after)
    check('speed round left every box and due date alone', all(af[k] == b4[k] for k in b4), '')
    fast = page.evaluate("() => Object.values(window.__app.store.state.items).filter(v => v.fast).length")
    check('fast answers recorded', fast == 10, str(fast))
    check('summary shows progress toward the goal', 'Today: 10 of 20' in summ, summ.replace('\n', ' | ')[-80:])

    # --- timeout counts as a miss
    page.evaluate("() => window.__app.startSession({mode:'speed'})")
    page.wait_for_selector('.timer')
    page.evaluate("() => { /* make time pass quickly */ const f = document.querySelector('.timer-fill'); }")
    page.wait_for_selector('.feedback', timeout=40000)
    fb = page.inner_text('.feedback')
    check('running out of time is a miss with a note', 'Not quite' in fb and 'Time ran out' in fb, fb.replace('\n', ' | ')[:140])
    page.goto(BASE); page.wait_for_selector('h1')

    # --- streak shows after practice
    txt = page.inner_text('.today')
    check('streak starts at one day', '1-day streak' in txt, txt.replace('\n', ' | '))

    # --- narrate the morning
    page.locator('.unit-btns button:has-text("Narrate it")').first.click()
    page.wait_for_selector('.eyebrow')
    check('narration starts at step 1 of 12', 'step 1 of 12' in page.inner_text('.eyebrow').lower(), page.inner_text('.eyebrow'))
    day = page.evaluate("() => window.__app.content.packs.find(p => p.id==='day').units[0].items.map(i => ({la:i.la, en:i.en}))")
    for i, it in enumerate(day):
        page.wait_for_selector('.eyebrow')
        check_step = f'step {i+1} of 12' in page.inner_text('.eyebrow').lower()
        if not check_step: check(f'narration step order {i+1}', False, page.inner_text('.eyebrow')); break
        page.fill('.ans', strip(it['la'])); page.keyboard.press('Enter')
        page.wait_for_selector('.feedback'); page.click('.feedback .btn.primary')
    page.wait_for_selector('.script')
    sc = page.inner_text('.script-la')
    check('narration ends with the full paragraph in order', sc.startswith('mane surgo') and sc.rstrip().endswith('edo.'), sc[:80])
    check('paragraph has all twelve sentences', sc.count('.') == 12, str(sc.count('.')))

    # --- words page
    page.goto(BASE + '#/words'); page.wait_for_selector('.wordlist')
    page.fill('input[type=search]', 'wash')
    page.wait_for_selector('.word')
    page.click('.word summary')
    page.wait_for_selector('table.forms')
    t = page.inner_text('table.forms')
    check('verb table shows persons, tenses and English', 'lavō' in t and 'I wash' in t and 'lāvī' in t and 'lavābō' in t, t.replace('\n', ' | ')[:160])
    page.fill('input[type=search]', 'hospes'); page.wait_for_selector('.word'); page.click('.word summary')
    page.wait_for_selector('table.forms')
    t = page.inner_text('table.forms')
    check('noun table shows cases', 'hospitis' in t and 'hospitibus' in t, t.replace('\n', ' | ')[:120])
    page.click('.pill:has-text("Verbs")'); page.fill('input[type=search]', '')
    check('verb filter lists many verbs', page.locator('.word').count() >= 50, str(page.locator('.word').count()))

    # --- settings goal and export of activity
    page.goto(BASE + '#/settings'); page.wait_for_selector('select')
    page.select_option('select[aria-label="Daily goal in answers"]', '10')
    page.goto(BASE); page.wait_for_selector('.today')
    check('goal setting changes the home strip', 'of 10 answers today' in page.inner_text('.today'), page.inner_text('.today').replace('\n', ' | '))
    snap = page.evaluate("() => window.__app.store.snapshot()")
    check('export contains activity', snap.get('activity') and sum(v['n'] for v in snap['activity'].values()) >= 22, str(snap.get('activity')))
    check('no console/page errors', not errors, str(errors[:3]))
ok = sum(1 for _, c in checks if c)
print(f'{ok}/{len(checks)} checks passed')
raise SystemExit(0 if ok == len(checks) else 1)
