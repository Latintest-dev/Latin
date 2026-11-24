// Service worker template. `node tools/build.mjs` fills in the cache name and file list and
// writes sw.js. Every file is precached on install, so after the first load the whole app
// works offline. Changing any file changes the cache name, which installs an updated copy.

const CACHE = 'latin-898b0124c7';
const ASSETS = [
  "./",
  "content/core/pack.json",
  "content/core/u1.json",
  "content/core/u10.json",
  "content/core/u2.json",
  "content/core/u3.json",
  "content/core/u4.json",
  "content/core/u5.json",
  "content/core/u6.json",
  "content/core/u7.json",
  "content/core/u8.json",
  "content/core/u9.json",
  "content/curriculum.json",
  "content/daily/pack.json",
  "content/daily/u1.json",
  "content/daily/u10.json",
  "content/daily/u11.json",
  "content/daily/u2.json",
  "content/daily/u3.json",
  "content/daily/u4.json",
  "content/daily/u5.json",
  "content/daily/u6.json",
  "content/daily/u7.json",
  "content/daily/u8.json",
  "content/daily/u9.json",
  "content/day/pack.json",
  "content/day/u1.json",
  "content/day/u2.json",
  "content/day/u3.json",
  "content/day/u4.json",
  "content/grammar/pack.json",
  "content/grammar/skills.json",
  "content/grammar/u1.json",
  "content/grammar/u2.json",
  "content/grammar/u3.json",
  "content/grammar/u4.json",
  "content/grammar/u5.json",
  "content/grammar/u6.json",
  "content/grammar/u7.json",
  "content/lexicon/band-1.json",
  "content/lexicon/band-2.json",
  "content/lexicon/band-3.json",
  "content/lexicon/band-4.json",
  "content/lexicon/band-5.json",
  "content/lexicon/core.json",
  "content/lexicon/grammar.json",
  "content/lexicon/index.json",
  "content/lexicon/street.json",
  "content/lexicon/supplement.json",
  "content/roman/pack.json",
  "content/roman/u1.json",
  "content/roman/u2.json",
  "content/roman/u3.json",
  "content/roman/u4.json",
  "content/roman/u5.json",
  "content/roman/u6.json",
  "content/roman/u7.json",
  "content/roman/u8.json",
  "content/roman/u9.json",
  "content/skills.json",
  "content/street/pack.json",
  "content/street/skills.json",
  "content/street/u1.json",
  "content/street/u2.json",
  "content/street/u3.json",
  "content/swap/pack.json",
  "content/swap/u1.json",
  "content/swap/u2.json",
  "content/swap/u3.json",
  "content/swap/u4.json",
  "content/talk/pack.json",
  "content/talk/u1.json",
  "content/talk/u2.json",
  "content/talk/u3.json",
  "content/vocab/order.json",
  "content/vocab/pack.json",
  "content/vocab/skills.json",
  "css/app.css",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "index.html",
  "js/core/activity.js",
  "js/core/content.js",
  "js/core/context.js",
  "js/core/modes.js",
  "js/core/path.js",
  "js/core/scheduler.js",
  "js/core/session.js",
  "js/core/settings.js",
  "js/core/storage.js",
  "js/core/store.js",
  "js/core/transfer.js",
  "js/engine/checker.js",
  "js/engine/forms.js",
  "js/engine/items.js",
  "js/engine/latin.js",
  "js/engine/lessons.js",
  "js/engine/vocab.js",
  "js/main.js",
  "js/modules/registry.js",
  "js/ui/dom.js",
  "js/ui/format.js",
  "js/ui/home.js",
  "js/ui/modes.js",
  "js/ui/parts.js",
  "js/ui/path.js",
  "js/ui/progress.js",
  "js/ui/routes.js",
  "js/ui/session.js",
  "js/ui/settings.js",
  "js/ui/words.js",
  "js/version.js",
  "manifest.webmanifest"
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('latin-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
