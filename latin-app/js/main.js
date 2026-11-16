// Bootstrap and router.

import { openBackend } from './core/storage.js';
import { createStore } from './core/store.js';
import { loadContent, browserFetchJson } from './core/content.js';
import { PACKS } from './modules/registry.js';
import { h, clear } from './ui/dom.js';
import { renderHome } from './ui/home.js';
import { renderSession } from './ui/session.js';
import { renderProgress } from './ui/progress.js';
import { renderSettings } from './ui/settings.js';

const root = document.getElementById('app');
const nav = document.getElementById('nav');
let cleanups = [];
let pendingSession = null;

const app = {
  store: null,
  content: null,
  backend: null,
  go(route) { location.hash = `#/${route}`; },
  startSession(params) { pendingSession = params; if (location.hash === '#/session') render(); else app.go('session'); },
  onCleanup(fn) { cleanups.push(fn); },
};
window.__app = app; // handy for debugging in the browser console

const routes = {
  '': renderHome,
  progress: renderProgress,
  settings: renderSettings,
};

function render() {
  for (const fn of cleanups) fn();
  cleanups = [];
  clear(root);
  const route = location.hash.replace(/^#\/?/, '');
  const inSession = route === 'session';
  document.body.classList.toggle('in-session', inSession);
  nav.querySelectorAll('a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === `#/${route}`);
  });
  window.scrollTo(0, 0);
  try {
    if (inSession) {
      if (!pendingSession) { app.go(''); return; }
      const params = pendingSession;
      pendingSession = null;
      renderSession(root, app, params);
    } else {
      (routes[route] || renderHome)(root, app);
    }
  } catch (err) {
    console.error(err);
    root.append(h('div', { class: 'card' }, h('p', null, `Something went wrong: ${err.message}`), h('a', { class: 'btn', href: '#/' }, 'Home')));
  }
}

async function boot() {
  try {
    const [content, backend] = await Promise.all([loadContent(browserFetchJson, PACKS), openBackend()]);
    app.content = content;
    app.backend = backend;
    app.store = await createStore(backend);
  } catch (err) {
    console.error(err);
    root.textContent = `Could not start the app: ${err.message}`;
    return;
  }
  navigator.storage?.persist?.().catch(() => {});
  window.addEventListener('hashchange', render);
  render();
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed:', e));
  }
}

boot();
