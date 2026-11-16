import re
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8765/'
res=[]
def check(n,c,extra=''):
    res.append(c); print(('PASS ' if c else 'FAIL ')+n+(f'  [{extra}]' if extra else ''))
errors=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':390,'height':844}); page=ctx.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.goto(BASE); page.wait_for_selector('h1')
    page.evaluate("""()=>{const s=window.__app.store; const far=Date.now()+30*86400000;
      for (const it of window.__app.content.itemsById.values())
        if (it.id.startsWith('roman.1.')||it.id.startsWith('roman.2.'))
          s.putItem(it.id,{lvl:2,box:4,due:far,intro:true,seen:5,ok:5,bad:0,last:Date.now(),upd:Date.now()});}""")
    # 1. Latin-question item: teach card, then reply choices
    page.evaluate("()=>window.__app.startSession({mode:'unit',scope:{packId:'roman',unitId:'3'}})")
    page.wait_for_selector('.card .btn.primary'); page.click('.card .btn.primary')   # unit intro
    page.wait_for_selector('.eyebrow')
    eb=page.inner_text('.eyebrow').lower()
    check('question teach card', eb=='new question and reply', eb)
    check('teach card shows the Latin question as prompt', page.inner_text('.prompt').strip()=='Quid agis?')
    check('teach card shows English gloss', 'How are you' in page.inner_text('.gloss'))
    page.screenshot(path='/home/claude/e2e/shots/11-q-teach.png')
    page.click('.btn.primary:has-text("Got it")')
    eb=page.inner_text('.eyebrow').lower()
    check('first exercise is "Choose the reply"', eb=='choose the reply', eb)
    opts=[o.inner_text() for o in page.query_selector_all('.opt')]
    check('reply options are Latin (4 of them)', len(opts)==4 and all(re.search('[A-Za-z]',o) for o in opts), str(opts))
    page.screenshot(path='/home/claude/e2e/shots/12-q-mc.png')
    # pick a wrong one
    for o in page.query_selector_all('.opt'):
        if o.inner_text().strip()=='Bene vales.': o.click(); break
    page.wait_for_selector('.feedback')
    fb=page.inner_text('.feedback')
    check('wrong reply explains why', 'you are well' in fb.lower(), fb[:200].replace('\n',' | '))
    # 2. typed wrong answers with diagnosis. Force levels via the store.
    page.goto(BASE); page.wait_for_selector('h1')
    page.evaluate("""()=>{const s=window.__app.store; const t=Date.now()-1000;
      for (const id of ['roman.3.09','roman.1.05','daily.4.02','roman.1.01'])
        s.putItem(id,{lvl:2,box:1,due:t,intro:true,seen:3,ok:3,bad:0,last:t,upd:t});
      s.putItem('roman.1.05',{lvl:1,box:0,due:t,intro:true,seen:2,ok:2,bad:0,last:t,upd:t});}""")
    page.evaluate("()=>window.__app.startSession({mode:'continue'})")
    seen={}
    for _ in range(12):
        page.wait_for_selector('.eyebrow'); eb=page.inner_text('.eyebrow').lower()
        if eb=='session complete': break
        if eb.endswith('new unit'): page.click('.card .btn.primary'); continue
        if eb.startswith('new '): page.click('.btn.primary:has-text("Got it")'); continue
        prompt=page.inner_text('.prompt').strip()
        if 'reply in latin' in eb or 'write it in latin' in eb or 'fill in the blank' in eb:
            seen[prompt]=eb
            wrong={'Quid herī ēgistī?':'Heri domi laboro','Quid heri egisti?':'Heri domi laboro',
                   'Yesterday I ate bread.':'Heri panem edo','Ask your friend whether he is tired.':'Fessus'}.get(prompt)
            if wrong is None:
                page.fill('.ans','x'); 
            else: page.fill('.ans',wrong)
            page.keyboard.press('Enter'); page.wait_for_selector('.feedback')
            fb=page.inner_text('.feedback'); print('   ',eb,'|',prompt,'->',fb.replace('\n',' | ')[:230])
            seen[prompt]=(eb,fb)
            page.click('.feedback .btn.primary')
            continue
        # mc: just click first option
        page.click('.opt'); page.wait_for_selector('.feedback'); page.click('.feedback .btn.primary')
    q=[v for k,v in seen.items() if 'ēgistī' in k or 'egisti' in k]
    check('question item typed: tense diagnosis shown', q and 'present tense' in q[0][1], str(q)[:200])
    check('question prompt eyebrow is "Reply in Latin"', q and q[0][0].startswith('reply in latin'), str(q[0][0] if q else ''))
    sit=[v for k,v in seen.items() if k.startswith('Ask your friend whether')]
    check('situation item shown with situation prompt', bool(sit), str(list(seen)))
    if sit: check('situation typed: missing -ne diagnosed', 'yes/no' in sit[0][1].lower(), sit[0][1][:200])
    page.goto(BASE+'#/progress'); page.wait_for_selector('h1')
    body=page.inner_text('body')
    check('progress lists tense / -ne slips', ('tense' in body.lower()) and ('-ne' in body), body[body.find('common slips'):body.find('common slips')+300].replace('\n',' | '))
    page.screenshot(path='/home/claude/e2e/shots/13-progress-new.png',full_page=True)
    check('no console errors', not errors, str(errors)[:300])
    b.close()
print(f'{sum(res)}/{len(res)}')
