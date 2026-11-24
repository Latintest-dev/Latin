"""Speed round, narrate, change-it drill, conversations, replay buttons, linked and paused tracks, words page, goal."""
import json
from lib import *

check = Checks()
SNAP = "() => JSON.stringify(Object.fromEntries(Object.entries(window.__app.store.state.items).map(([k,v]) => [k,[v.box,v.due]])))"

with sync_playwright() as p:
    browser, ctx, page, errors = launch(p)
    open_app(page)
    idx = Index(page)

    # --- fresh start
    txt = page.inner_text('.today')
    check('home shows today strip', '0' in txt and 'answers today' in txt and 'No streak yet' in txt, txt.replace('\n', ' | '))
    check('speed round locked at first', page.is_disabled('.btn.speed'))
    open_path(page)
    planned = page.evaluate("() => window.__app.content.stages.length")
    check('the plan lists every stage of the curriculum', page.locator('details.stage').count() == planned and planned >= 15, str(planned))
    check('every sentence track has lessons on the Path', len({c for c in page.locator('.lesson .track-chip').all_inner_texts()}) == page.evaluate("() => window.__app.content.packs.filter(p => !p.vocab).length"), str(set(page.locator('.lesson .track-chip').all_inner_texts())))
    open_app(page)
    replay_btns = '.unit-btns button:is(:has-text("Narrate it"), :has-text("Run the drill"), :has-text("Play it"))'
    check('no replay buttons before anything is learned', page.locator(replay_btns).count() == 0)

    # --- know the morning script, the first swap unit and some other sentences
    unlock(page, 'swap', '1')
    page.evaluate("""async () => { const a = window.__app, s = a.store, t = Date.now();
      const known = {lvl:2, box:3, due:t + 8*864e5, intro:true, seen:5, ok:5, bad:0, last:t, upd:t};
      const unit = (pack, n) => a.content.packs.find(p => p.id === pack).units.find(u => u.id === String(n));
      for (const [pack, n] of [['day', 1], ['swap', 1]]) for (const it of unit(pack, n).items) s.putItem(it.id, known);
      for (const it of [...a.content.itemsById.values()].filter(i => i.id.startsWith('core.1.')).slice(0, 6)) s.putItem(it.id, known);
      await s.flush(); }""")
    open_app(page)
    check('speed round unlocked', not page.is_disabled('.btn.speed'))
    open_path(page)
    check('Narrate it appears on the met script', page.locator('.unit-btns button:has-text("Narrate it")').count() == 1)
    check('Run the drill appears on the met change-it unit', page.locator('.unit-btns button:has-text("Run the drill")').count() == 1)
    check('Play it does not appear before its conversation is met', page.locator('.unit-btns button:has-text("Play it")').count() == 0)
    open_app(page)

    # --- speed round: timer; correct answers do not move the schedule
    before = json.loads(page.evaluate(SNAP))
    page.click('.btn.speed')
    page.wait_for_selector('.eyebrow')
    check('speed round shows a countdown bar', page.query_selector('.timer .timer-fill') is not None)
    check('speed eyebrow', 'speed round' in page.inner_text('.eyebrow').lower(), page.inner_text('.eyebrow'))
    answered = 0
    while screen(page) != 'done' and answered < 14:
        answer(page, idx, screen(page))
        page.wait_for_selector('.feedback'); answered += 1
        page.click('.feedback .btn.primary')
    check('speed round ends after ten', answered == 10, str(answered))
    summ = page.inner_text('.card')
    check('summary says in time', 'in time' in summ, summ.replace('\n', ' | ')[:120])
    after = json.loads(page.evaluate(SNAP))
    check('speed round left every box and due date alone', all(after[k] == before[k] for k in before))
    fast = page.evaluate("() => Object.values(window.__app.store.state.items).filter(v => v.fast).length")
    check('fast answers recorded', fast == 10, str(fast))
    check('summary shows progress toward the goal', 'Today: 10 of 20' in summ, summ.replace('\n', ' | ')[-80:])

    # --- timeout counts as a miss
    start(page, mode='speed')
    page.wait_for_selector('.timer')
    page.wait_for_selector('.feedback', timeout=40000)
    fb = page.inner_text('.feedback')
    check('running out of time is a miss with a note', 'Not quite' in fb and 'Time ran out' in fb, fb.replace('\n', ' | ')[:140])
    open_app(page)
    check('streak starts at one day', '1-day streak' in page.inner_text('.today'), page.inner_text('.today').replace('\n', ' | '))

    # --- narrate the morning (capital letters at sentence starts are fine: the paragraph is read, not matched)
    open_path(page)
    page.locator('.unit-btns button:has-text("Narrate it")').first.click()
    page.wait_for_selector('.eyebrow')
    check('narration starts at step 1 of 12', 'step 1 of 12' in page.inner_text('.eyebrow').lower(), page.inner_text('.eyebrow'))
    day = page.evaluate("() => window.__app.content.packs.find(p => p.id==='day').units[0].items.map(i => i.la)")
    for i, la in enumerate(day):
        page.wait_for_selector('.eyebrow')
        if f'step {i+1} of 12' not in page.inner_text('.eyebrow').lower():
            check(f'narration step order {i+1}', False, page.inner_text('.eyebrow')); break
        page.fill('.ans', strip(la)); page.keyboard.press('Enter')
        page.wait_for_selector('.feedback'); page.click('.feedback .btn.primary')
    page.wait_for_selector('.script')
    sc = page.inner_text('.script-la')
    check('narration ends with the full paragraph in order', sc.lower().startswith('mane surgo') and sc.rstrip().endswith('edo.'), sc[:80])
    check('paragraph has all twelve sentences', sc.count('.') == 12, str(sc.count('.')))

    # --- the "Change it" drill: grouped by base sentence, follows each sentence's own level, no schedule changes
    open_path(page)
    before = json.loads(page.evaluate(SNAP))
    page.locator('.unit-btns button:has-text("Run the drill")').first.click()
    page.wait_for_selector('.eyebrow')
    eb = page.inner_text('.eyebrow').lower()
    check('drill eyebrow counts the steps', eb.startswith('change it, 1 of '), eb)
    check('drill shows the Latin and the instruction', page.query_selector('.prompt.la') is not None and page.query_selector('.cue.change em') is not None)
    n_drill = int(eb.split(' of ')[1])
    check('drill is at least a dozen changes', n_drill >= 12, str(n_drill))
    steps = 0
    while screen(page) != 'done' and steps < 40:
        answer(page, idx, screen(page)); page.wait_for_selector('.feedback'); steps += 1
        page.click('.feedback .btn.primary')
    check('drill plays through with correct answers', steps == n_drill, f'{steps} of {n_drill}')
    check('drill ends with its own title', 'drill complete' in page.inner_text('.card.center').lower(), page.inner_text('.card.center')[:60])
    after = json.loads(page.evaluate(SNAP))
    check('drill left every box and due date alone', all(after[k] == before[k] for k in before))

    # --- conversations: locked behind the Roman track, then unlocked; transcript and bubbles; replay
    open_path(page)
    talk = page.locator('.lesson', has=page.locator('.track-chip:has-text("Conversations")'))
    check('conversation track is listed', talk.count() == 3, str(talk.count()))
    lock_txt = talk.first.locator('.lockline').inner_text() if talk.first.locator('.lockline').count() else ''
    check('conversations start locked', talk.locator('xpath=self::*[contains(@class, "locked")]').count() == 3)
    check('the lock says what to finish first', 'Like a Roman' in lock_txt and 'Meet' in lock_txt, lock_txt)
    unlock(page, 'talk', '1')
    open_app(page)
    start(page, mode='unit', scope={'packId': 'talk', 'unitId': '1'})
    page.wait_for_selector('.card .btn.primary'); page.click('.card .btn.primary')
    page.wait_for_selector('.eyebrow')
    check('first conversation line is a new question and reply', page.inner_text('.eyebrow').lower() == 'new question and reply', page.inner_text('.eyebrow'))
    check('the scene is shown before the first line', page.query_selector('.dlg .scene') is not None)
    page.click('.btn.primary:has-text("Got it")')
    page.wait_for_selector('.eyebrow')
    play(page, idx, max_steps=60)
    # play the conversation straight through: know the unit, then Play it
    open_app(page)
    know(page, "() => window.__app.content.packs.find(p => p.id === 'talk').units[0].items.map(i => i.id)")
    open_path(page)
    check('Play it appears once the conversation is met', page.locator('.unit-btns button:has-text("Play it")').count() >= 1)
    page.locator('.unit-btns button:has-text("Play it")').first.click()
    page.wait_for_selector('.eyebrow')
    check('conversation eyebrow counts the lines', page.inner_text('.eyebrow').lower().startswith('conversation, line 1 of '), page.inner_text('.eyebrow'))
    saw_bubbles = 0
    def each(kind):
        global saw_bubbles
        if page.locator('.dlg .bubble').count() >= 2: saw_bubbles += 1
    play(page, idx, max_steps=60, each=each)
    check('later lines show the lines before them as bubbles', saw_bubbles >= 3, str(saw_bubbles))
    check('conversation recap is a transcript with an English toggle', page.query_selector('.dlg-recap .bubble.them') is not None and page.query_selector('.dlg-recap details') is not None)
    check('conversation ends with its own title', 'conversation complete' in page.inner_text('.card.center').lower())

    # --- pausing a track: Settings toggle, badge on Learn, and the new-sentence rotation skips it
    page.goto(BASE + '#/settings'); page.wait_for_selector('.toggle')
    page.uncheck('input[aria-label="New sentences from Change it"]')
    page.evaluate("() => window.__app.store.flush()")
    paused = page.evaluate("() => window.__app.store.state.settings.pausedPacks")
    check('pausing a track is stored', paused == ['swap'], str(paused))
    page.goto(BASE + '#/settings'); page.wait_for_selector('.preview-line')
    check('Settings previews the next Continue', 'new sentences' in page.inner_text('.preview-line'), page.inner_text('.preview-line'))
    new_packs = lambda paused: page.evaluate("""async (paused) => { const m = await import('/js/core/modes.js'); const a = window.__app;
      const q = m.buildQueue({content: a.content, itemStates: a.store.state.items, skills: a.store.state.skills, mistakes: a.store.state.mistakes,
        now: Date.now(), mode: 'continue', follow: 'mix', newTotal: 30, paused, rng: () => 0.5});
      return [...new Set(q.filter(e => e.kind === 'new').map(e => a.content.packOf.get(e.itemId)))]; }""", paused)
    with_all, with_paused = new_packs([]), new_packs(paused)
    check('without pausing, the paused track offers new sentences', paused[0] in with_all, f'{with_all}')
    check('a paused track offers no new sentences', paused[0] not in with_paused and len(with_paused) >= 1, f'{with_paused}')
    page.evaluate("() => window.__app.store.setSetting('pausedPacks', [])")

    # --- words page
    page.goto(BASE + '#/words'); page.wait_for_selector('.tabs')
    page.click('.pill:has-text("Look up")'); page.wait_for_selector('.wordlist')
    page.fill('input[type=search]', 'wash')
    page.wait_for_selector('.word'); page.click('.word summary'); page.wait_for_selector('table.forms')
    t = page.inner_text('table.forms')
    check('verb table shows persons, tenses and English', 'lavō' in t and 'I wash' in t and 'lāvī' in t and 'lavābō' in t, t.replace('\n', ' | ')[:160])
    page.fill('input[type=search]', 'hospes'); page.wait_for_selector('.word'); page.click('.word summary'); page.wait_for_selector('table.forms')
    t = page.inner_text('table.forms')
    check('noun table shows cases', 'hospitis' in t and 'hospitibus' in t, t.replace('\n', ' | ')[:120])
    page.click('.pill:has-text("Verbs")'); page.fill('input[type=search]', '')
    check('verb filter lists many verbs', page.locator('.word').count() >= 50, str(page.locator('.word').count()))

    # --- settings goal and the export of activity
    page.goto(BASE + '#/settings'); page.wait_for_selector('select')
    page.select_option('select[aria-label="Answers per day"]', '10')
    page.goto(BASE); page.wait_for_selector('.today')
    check('goal setting changes the home strip', 'of 10 answers today' in page.inner_text('.today'), page.inner_text('.today').replace('\n', ' | '))
    snap = page.evaluate("() => window.__app.store.snapshot()")
    check('export contains activity', snap.get('activity') and sum(v['n'] for v in snap['activity'].values()) >= 22, str(snap.get('activity')))
    check('no console/page errors', not errors, str(errors[:3]))
    browser.close()
check.done()
