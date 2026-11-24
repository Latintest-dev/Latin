"""Shared helpers for the browser tests (Playwright for Python, plus Chrome).

Run everything with:   bash tests/e2e/run_all.sh      (serves the app on :8765, runs every *_test.py)
Run one test with the app already being served:   python3 tests/e2e/drill_test.py

The "bot" plays the app the way a learner would, but always answers correctly (typing macron-free Latin),
so a test can walk any unit or mode from start to finish. It tells screens apart by what is on them
(options, a blank, an input), not by the wording of the heading, so new modes with their own headings
need no changes here.
"""
import os
import sys
import unicodedata
from playwright.sync_api import sync_playwright  # noqa: F401  (re-exported for the tests)

BASE = os.environ.get('LATIN_BASE', 'http://127.0.0.1:8765/')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
SHOTS = os.environ.get('SHOTS', '/tmp/latin-shots')
os.makedirs(SHOTS, exist_ok=True)

# Macrons off, as the bot types them and as the app displays by default.
_MACRONS = '̄̆'


def strip(s):
    return unicodedata.normalize('NFC', ''.join(c for c in unicodedata.normalize('NFD', s) if c not in _MACRONS))


class Checks:
    """check('what', condition, 'detail')  ...  checks.done() prints the tally and exits non-zero on any failure."""

    def __init__(self):
        self.results = []

    def __call__(self, name, cond, extra=''):
        self.results.append((name, bool(cond)))
        print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))

    def done(self):
        failed = [n for n, ok in self.results if not ok]
        print(f'{len(self.results) - len(failed)}/{len(self.results)} checks passed' + (f'  FAILED: {failed}' if failed else ''))
        sys.exit(1 if failed else 0)


def launch(p, **ctx_opts):
    """Chrome at phone size. Returns (browser, context, page, errors) where errors collects console/page errors."""
    browser = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, **ctx_opts)
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    return browser, ctx, page, errors


def open_app(page):
    page.goto(BASE)
    page.wait_for_selector('h1')


ITEMS_JS = """() => [...window.__app.content.itemsById.values()].map(i => ({
  id: i.id, en: i.en, la: i.la, fill: i.fill, q: !!i.q, swap: !!i.swap,
  prompt: i.q || (i.swap && i.swap.from) || i.sit || i.en,
  cue: i.swap ? i.swap.change : i.q ? (i.cue || ((/“[^”]*”\\s*“([^”]*)”/.exec(i.en) || [])[1] || '')) : '' }))"""


class Index:
    """What the bot needs to know about every sentence: find it from what is on the screen."""

    def __init__(self, page):
        self.items = page.evaluate(ITEMS_JS)
        self.by_prompt = {}   # (prompt, cue) -> items
        self.by_la = {}       # Latin -> items (those that can be asked Latin -> English)
        self.by_id = {i['id']: i for i in self.items}
        for i in self.items:
            self.by_prompt.setdefault(self.key(i['prompt'], i['cue']), []).append(i)
            if not i['q']:
                self.by_la.setdefault(strip(i['la']), []).append(i)

    @staticmethod
    def key(prompt, cue=''):
        return (strip(prompt.strip()) + '|' + strip((cue or '').strip())).lower()

    def current(self, page):
        """The sentence(s) the exercise on screen is about."""
        prompt = page.inner_text('.prompt').strip()
        cue = page.inner_text('.cue em').strip() if page.query_selector('.cue em') else ''
        return self.by_prompt[self.key(prompt, cue)]


def screen(page):
    """What is on screen: done | unit | teach | e2l | l2e | fill | write."""
    page.wait_for_selector('.eyebrow')
    if page.query_selector('.card.center .eyebrow'):
        return 'done'
    if page.inner_text('.eyebrow').strip().lower().endswith('new unit'):
        return 'unit'
    if page.query_selector('.btn.primary:has-text("Got it")'):
        return 'teach'
    if page.query_selector('.options'):
        return 'l2e' if page.inner_text('.eyebrow').strip().lower() == 'what does this mean?' else 'e2l'
    return 'fill' if page.query_selector('.blank') else 'write'


def click_any(page, wants, loose):
    for o in page.query_selector_all('.opt'):
        t = o.inner_text().strip()
        if any((strip(t) == strip(w)) if loose else (t == w) for w in wants):
            o.click()
            return
    raise AssertionError('option not found: ' + str(wants))


def answer(page, idx, kind):
    """Answer the exercise on screen correctly."""
    if kind == 'l2e':
        prompt = page.inner_text('.prompt').strip()
        click_any(page, [i['en'] for i in idx.by_la[strip(prompt)]], False)
        return
    cands = idx.current(page)
    if kind == 'e2l':
        click_any(page, [i['la'] for i in cands], True)
    else:
        page.fill('.ans', strip(cands[0]['fill'] if kind == 'fill' else cands[0]['la']))
        page.keyboard.press('Enter')


def play(page, idx, max_steps=300, each=None):
    """Answer everything correctly until the summary. `each(kind)` is called before every exercise. Returns the step count."""
    for steps in range(1, max_steps + 1):
        kind = screen(page)
        if kind == 'done':
            return steps
        if kind == 'unit':
            page.click('.card .btn.primary')
            continue
        if kind == 'teach':
            assert 'null' not in page.inner_text('.exercise'), 'a teach card printed "null"'
            page.click('.btn.primary:has-text("Got it")')
            continue
        if each:
            each(kind)
        answer(page, idx, kind)
        page.wait_for_selector('.feedback')
        page.click('.feedback .btn.primary')
    raise AssertionError('too many steps')


def know(page, ids_js, lvl=2, box=3, days=8):
    """Mark sentences as known (met, written, scheduled `days` ahead). `ids_js` is a JS expression giving the list of item ids."""
    page.evaluate("""async ([ids, lvl, box, days]) => { const s = window.__app.store; const t = Date.now();
      for (const id of ids) s.putItem(id, {lvl, box, due: t + days * 864e5, intro: true, seen: 5, ok: 5, bad: 0, last: t, upd: t});
      await s.flush(); }""", [page.evaluate(ids_js), lvl, box, days])


def unlock(page, pack, unit):
    """Make a unit available: every earlier unit of its track counts as known, and so does the unit its track waits for."""
    ids = page.evaluate("""([pack, unit]) => { const c = window.__app.content; const p = c.packs.find(x => x.id === pack);
      const out = []; for (const u of p.units) { if (u.id === unit) break; out.push(...u.items.map(i => i.id)); }
      if (p.gate) out.push(...p.gate.unit.items.map(i => i.id)); return out; }""", [pack, unit])
    page.evaluate("""async ([ids]) => { const s = window.__app.store; const t = Date.now() + 30 * 864e5;
      for (const id of ids) s.putItem(id, {lvl: 2, box: 4, due: t, intro: true, seen: 5, ok: 5, bad: 0, last: Date.now(), upd: Date.now()});
      await s.flush(); }""", [ids])


def start(page, **params):
    page.evaluate("(p) => window.__app.startSession(p)", params)
    page.wait_for_url('**#/session')
    page.wait_for_selector('.today, .page-head', state='detached')   # the previous screen is gone, the session is drawn


def open_path(page):
    """Go to the Path screen with every stage open, so all lessons are drawn (they are drawn lazily, when a stage opens)."""
    page.goto(BASE + '#/path')
    page.wait_for_selector('details.stage')
    page.evaluate("() => document.querySelectorAll('details.stage').forEach(d => { d.open = true; })")
    page.wait_for_function("() => document.querySelectorAll('details.stage .lesson').length >= 40")
