"""Every unit that is not covered by the hand-written scenarios plays from start to finish with correct answers."""
from lib import *

UNITS = ([('core', str(n)) for n in range(4, 11)] + [('daily', str(n)) for n in range(6, 12)]
         + [('roman', str(n)) for n in range(4, 10)] + [('day', str(n)) for n in range(1, 5)]
         + [('swap', str(n)) for n in range(1, 5)] + [('talk', str(n)) for n in range(1, 4)]
         + [('grammar', str(n)) for n in range(1, 8)] + [('street', str(n)) for n in range(1, 4)]
         + [('vocab', '1'), ('vocab', '2'), ('vocab', '100')])

check = Checks()
with sync_playwright() as p:
    browser, ctx, page, errors = launch(p)
    open_app(page)
    idx = Index(page)
    for pack, unit in UNITS:
        open_app(page)
        unlock(page, pack, unit)
        start(page, mode='unit', scope={'packId': pack, 'unitId': unit})
        n = play(page, idx, max_steps=150)
        check(f'{pack}.{unit} plays to the end with correct answers', n > 6, f'{n} steps')
    check('no console/page errors', not errors, str(errors[:3]))
    browser.close()
check.done()
