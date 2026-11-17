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


UNITS = [('core','4'),('core','5'),('core','6'),('core','7'),('daily','6'),('daily','7'),('daily','8'),('daily','9'),('daily','10'),('roman','4'),('roman','5')]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE); page.wait_for_selector('h1')
    items = page.evaluate("() => [...window.__app.content.itemsById.values()].map(i => ({id:i.id,en:i.en,la:i.la,fill:i.fill,prompt:i.q||i.sit||i.en,q:!!i.q}))")
    by_prompt = {strip(i['prompt']): i for i in items}; by_la = {strip(i['la']): i for i in items if not i['q']}
    for pack, unit in UNITS:
        page.goto(BASE); page.wait_for_selector('h1')
        page.evaluate("""([pack,unit]) => { const a = window.__app, s = a.store; const t = Date.now() + 30*864e5;
          for (const [id, p] of a.content.packOf.entries()) { if (p !== pack) continue;
            const u = a.content.unitOf.get(id); const uid = typeof u === 'object' ? u.id : u;
            if (Number(uid) < Number(unit)) s.putItem(id, {lvl:2, box:4, due:t, intro:true, seen:5, ok:5, bad:0, last:Date.now(), upd:Date.now()}); } }""", [pack, unit])
        page.evaluate("([p,u]) => window.__app.startSession({mode:'unit', scope:{packId:p, unitId:u}})", [pack, unit])
        n = play(page, by_prompt, by_la, max_steps=120)
        check(f'{pack}.{unit} session plays to the end with correct answers', n > 6, f'{n} steps')
    check('no console/page errors', not errors, str(errors[:3]))
ok = sum(1 for _, c in checks if c)
print(f'{ok}/{len(checks)} checks passed')
raise SystemExit(0 if ok == len(checks) else 1)
