// Service worker template. `node tools/build.mjs` fills in the cache name and file list and
// writes sw.js. Every file is precached on install, so after the first load the whole app
// works offline. Changing any file changes the cache name, which installs an updated copy.

const CACHE = 'latin-c8b2e3b9d5';
const ASSETS = [
  "./",
  "content/core/pack.json",
  "content/core/u1.json",
  "content/core/u2.json",
  "content/core/u3.json",
  "content/daily/pack.json",
  "content/daily/u1.json",
  "content/daily/u2.json",
  "content/daily/u3.json",
  "content/lexicon.json",
  "content/skills.json",
  "css/app.css",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "index.html",
  "js/core/content.js",
  "js/core/scheduler.js",
  "js/core/session.js",
  "js/core/storage.js",
  "js/core/store.js",
  "js/core/transfer.js",
  "js/engine/checker.js",
  "js/engine/items.js",
  "js/engine/latin.js",
  "js/main.js",
  "js/modules/registry.js",
  "js/ui/dom.js",
  "js/ui/format.js",
  "js/ui/home.js",
  "js/ui/progress.js",
  "js/ui/session.js",
  "js/ui/settings.js",
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
