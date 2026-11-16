// Storage backends. Both expose the same small async API:
//   loadAll() -> { items, skills, mistakes[], flags[], meta }
//   put(store, key, value), del(store, key), clear()
// The app uses IndexedDB; the memory backend is for tests and as a fallback when
// IndexedDB is unavailable (e.g. some private-browsing modes).

const STORES = ['items', 'skills', 'mistakes', 'flags', 'meta'];

export function createMemoryBackend() {
  const data = Object.fromEntries(STORES.map((s) => [s, new Map()]));
  return {
    kind: 'memory',
    async loadAll() {
      return {
        items: Object.fromEntries(data.items),
        skills: Object.fromEntries(data.skills),
        mistakes: [...data.mistakes.values()],
        flags: [...data.flags.values()],
        meta: Object.fromEntries(data.meta),
      };
    },
    async put(store, key, value) { data[store].set(key, structuredClone(value)); },
    async del(store, key) { data[store].delete(key); },
    async clear() { for (const s of STORES) data[s].clear(); },
  };
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function createIdbBackend(idb = globalThis.indexedDB, name = 'latin-app') {
  const db = await new Promise((resolve, reject) => {
    const open = idb.open(name, 1);
    open.onupgradeneeded = () => { for (const s of STORES) open.result.createObjectStore(s); };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  const store = (s, mode) => db.transaction(s, mode).objectStore(s);
  return {
    kind: 'idb',
    async loadAll() {
      const out = {};
      for (const s of STORES) {
        const st = store(s, 'readonly');
        const keys = await req(st.getAllKeys());
        const vals = await req(st.getAll());
        out[s] = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
      }
      return {
        items: out.items,
        skills: out.skills,
        mistakes: Object.values(out.mistakes),
        flags: Object.values(out.flags),
        meta: out.meta,
      };
    },
    async put(s, key, value) { await req(store(s, 'readwrite').put(value, key)); },
    async del(s, key) { await req(store(s, 'readwrite').delete(key)); },
    async clear() { for (const s of STORES) await req(store(s, 'readwrite').clear()); },
  };
}

/** Try IndexedDB, fall back to memory. */
export async function openBackend() {
  try {
    if (!globalThis.indexedDB) throw new Error('no indexedDB');
    return await createIdbBackend();
  } catch (err) {
    console.warn('Falling back to in-memory storage:', err);
    const b = createMemoryBackend();
    b.fallbackReason = String(err?.message || err);
    return b;
  }
}
