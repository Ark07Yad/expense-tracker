/**
 * Durable on-device storage.
 *
 * localStorage on its own is the weakest place to keep a year of ledger entries: it
 * is capped around 5 MB, and browsers evict it first under storage pressure —
 * Safari in particular clears it after ~7 days of not visiting the site. That
 * is how logs get silently lost.
 *
 * So this module layers three things:
 *
 *   1. **IndexedDB** as the primary store. Much larger quota, and it is the
 *      storage type the persistence API actually protects.
 *   2. **localStorage** as a synchronous mirror, so a first paint never has to
 *      wait on IDB and there is a second copy if one backend fails.
 *   3. **navigator.storage.persist()** — the real fix. Once granted, the
 *      browser stops evicting this origin's data automatically; only the user
 *      can clear it.
 *
 * On top of that it keeps rolling snapshots, so a bad write or an accidental
 * reset can be rolled back rather than mourned.
 */

const DB_NAME = 'cointrack';
const DB_VERSION = 1;
const STORE = 'state';
const STATE_KEY = 'app';
const SNAPSHOT_KEY = 'snapshots';
const LS_KEY = 'cointrack.v1';
const MAX_SNAPSHOTS = 7;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function idbGet(key) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbSet(key, value) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

/* ───────────────────────── Eviction protection ───────────────────────── */

/**
 * Ask the browser to stop evicting this origin's data. Chrome usually grants
 * it silently once the site looks "used" (bookmarked, installed, or engaged
 * with); Firefox prompts; Safari grants on user gesture. Safe to call often.
 */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return { supported: false, persisted: false };
    if (await navigator.storage.persisted()) return { supported: true, persisted: true };
    const persisted = await navigator.storage.persist();
    return { supported: true, persisted };
  } catch {
    return { supported: false, persisted: false };
  }
}

/** Current protection state and rough disk usage, for the Settings screen. */
export async function storageStatus() {
  const out = { supported: false, persisted: false, usage: 0, quota: 0, backend: 'localStorage' };
  try {
    if (navigator.storage?.persisted) {
      out.supported = true;
      out.persisted = await navigator.storage.persisted();
    }
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      out.usage = usage;
      out.quota = quota;
    }
    await openDB();
    out.backend = 'IndexedDB + localStorage';
  } catch {
    /* IDB unavailable — the localStorage mirror still carries the data */
  }
  return out;
}

/* ─────────────────────────────── Read ─────────────────────────────── */

/** Synchronous read of the mirror, used for the very first render. */
export function loadSync() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Authoritative read. Prefers whichever backend holds the newer state, so a
 * localStorage eviction cannot roll you back to an older IndexedDB copy, and
 * vice versa.
 */
export async function load() {
  const mirror = loadSync();
  let primary = null;
  try {
    primary = await idbGet(STATE_KEY);
  } catch {
    /* fall through to the mirror */
  }

  if (!primary) return mirror;
  if (!mirror) return primary;
  return (primary.savedAt || 0) >= (mirror.savedAt || 0) ? primary : mirror;
}

/* ─────────────────────────────── Write ─────────────────────────────── */

let writeTimer = null;
let pending = null;
let lastSnapshotDay = null;

/**
 * Persist to both backends. Debounced, because state changes on every
 * keystroke and IndexedDB transactions are not free.
 */
export function save(state, { immediate = false } = {}) {
  pending = { ...state, savedAt: Date.now() };

  const flush = () => {
    const payload = pending;
    pending = null;
    writeTimer = null;
    if (!payload) return;

    // Mirror first — synchronous, so it survives an immediate tab close.
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch {
      /* quota exceeded; IndexedDB below is the larger store anyway */
    }

    idbSet(STATE_KEY, payload).catch(() => {});
    maybeSnapshot(payload);
  };

  if (immediate) {
    if (writeTimer) clearTimeout(writeTimer);
    flush();
    return;
  }
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, 400);
}

/** Force any debounced write out — used when the tab is being hidden or closed. */
export function flushNow() {
  if (pending) save(pending, { immediate: true });
}

/* ───────────────────────────── Snapshots ───────────────────────────── */

/** Keep one snapshot per day, up to a week, so mistakes are recoverable. */
async function maybeSnapshot(state) {
  const today = new Date().toISOString().slice(0, 10);
  if (lastSnapshotDay === today) return;
  lastSnapshotDay = today;
  try {
    const list = (await idbGet(SNAPSHOT_KEY)) || [];
    const next = [
      { day: today, at: Date.now(), state },
      ...list.filter((s) => s.day !== today),
    ].slice(0, MAX_SNAPSHOTS);
    await idbSet(SNAPSHOT_KEY, next);
  } catch {
    /* snapshots are a nicety, never a hard requirement */
  }
}

export async function listSnapshots() {
  try {
    const list = (await idbGet(SNAPSHOT_KEY)) || [];
    return list.map(({ day, at, state }) => ({
      day,
      at,
      entries: (state?.entries || []).length,
      assets: (state?.assets || []).length,
    }));
  } catch {
    return [];
  }
}

export async function restoreSnapshot(day) {
  const list = (await idbGet(SNAPSHOT_KEY)) || [];
  return list.find((s) => s.day === day)?.state ?? null;
}

export async function clearAll() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
  try {
    await idbSet(STATE_KEY, undefined);
    await idbSet(SNAPSHOT_KEY, []);
  } catch { /* ignore */ }
}
