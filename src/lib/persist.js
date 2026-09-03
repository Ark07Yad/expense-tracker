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
const DB_VERSION = 2;
const STORE = 'state';
/**
 * Attachments live in their own object store, never in the state object.
 *
 * The state is serialised and written on every change, and mirrored into
 * localStorage — a single phone photo would exceed that mirror's whole quota
 * and be re-serialised on every keystroke. Keeping blobs out of it means the
 * ledger stays a few hundred kilobytes of JSON no matter how many receipts are
 * attached to it.
 */
const FILES = 'files';
const STATE_KEY = 'app';
const SNAPSHOT_KEY = 'snapshots';
const LS_KEY = 'cointrack.v1';
const MAX_SNAPSHOTS = 7;

let dbPromise = null;

/**
 * `open` can hang forever, and nothing above here expects that.
 *
 * An IndexedDB open request is not guaranteed to fire any of its events. The
 * usual cause is a `deleteDatabase` or a version change queued behind a live
 * connection: the delete waits for the connection to close, and every later
 * open waits behind the delete. No error is raised — the request simply never
 * settles, and every read and write that awaits it stalls with it for the rest
 * of the session.
 *
 * The timeout turns that into an ordinary failure, which the callers already
 * handle by falling back to the localStorage mirror. A degraded backend is
 * recoverable; a promise that never settles is not.
 */
const OPEN_TIMEOUT_MS = 5000;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));

    const timer = setTimeout(() => reject(new Error('IndexedDB open timed out')), OPEN_TIMEOUT_MS);
    const settle = (fn) => (arg) => {
      clearTimeout(timer);
      fn(arg);
    };

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    req.onsuccess = settle(() => resolve(req.result));
    req.onerror = settle(() => reject(req.error));
    req.onblocked = settle(() => reject(new Error('IndexedDB blocked')));
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function idbGet(key, store = STORE) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbSet(key, value, store = STORE) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

/* ───────────────────────────── Attachments ───────────────────────────── */

/**
 * Blobs, addressed by id.
 *
 * These deliberately have no mirror and no snapshot. A receipt is nice to have
 * and reconstructible from the paper original; the ledger is not, and spending
 * the storage budget on duplicated images at the expense of the entries would
 * be the wrong trade.
 */
export async function putFile(id, blob) {
  /*
   * Stored as an ArrayBuffer, not as the Blob itself.
   *
   * WebKit refuses to structured-clone a Blob or File into IndexedDB — the
   * transaction simply errors, with no message — so an attachment saved
   * perfectly well in Chromium failed outright in Safari, and the only sign was
   * the app's own "out of storage" message. ArrayBuffers have no such
   * restriction anywhere, and the Blob is trivially rebuilt on the way out.
   */
  const buffer = await blob.arrayBuffer();
  return idbSet(id, { buffer, type: blob.type || 'application/octet-stream', size: buffer.byteLength }, FILES);
}

export async function getFile(id) {
  try {
    const stored = await idbGet(id, FILES);
    if (!stored) return null;
    // Blobs written by an earlier version are still readable as they are.
    if (stored instanceof Blob) return stored;
    return new Blob([stored.buffer], { type: stored.type });
  } catch {
    return null;
  }
}

/** Total bytes held in attachments, for the storage panel. */
export async function fileUsage() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(FILES, 'readonly');
      const store = tx.objectStore(FILES);
      let bytes = 0;
      let count = 0;
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve({ bytes, count });
        // Either shape: the record written now, or a legacy Blob.
        bytes += c.value?.size || c.value?.buffer?.byteLength || 0;
        count += 1;
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
  } catch {
    return { bytes: 0, count: 0 };
  }
}

/**
 * Remove blobs no entry references any more.
 *
 * Deleting an entry does not reach into IndexedDB — that would make every
 * delete an async operation that can fail halfway. Instead the orphans are
 * swept up afterwards, which is safe because a blob nothing points at is
 * unreachable either way.
 */
export async function pruneFiles(keepIds) {
  try {
    const keep = new Set(keepIds);
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(FILES, 'readwrite');
      const store = tx.objectStore(FILES);
      const cursor = store.openKeyCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        if (!keep.has(c.key)) store.delete(c.key);
        c.continue();
      };
      cursor.onerror = () => resolve();
      tx.oncomplete = () => resolve();
    });
  } catch {
    /* a failed sweep only wastes space */
  }
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

/* ─────────────────────────── Cross-tab coordination ─────────────────────── */

/**
 * Every tab writes the whole state object, so without coordination two open
 * tabs silently overwrite each other: log an entry in one, and the other's next
 * save — carrying its older copy — wipes it. Nothing errors, the entry is just
 * gone.
 *
 * The channel carries only a timestamp, never the state. A tab that hears about
 * a newer write re-reads from storage and decides for itself, which keeps one
 * definition of "which copy wins" instead of two.
 */
const CHANNEL = 'cointrack.sync';

let channel = null;
function getChannel() {
  if (channel !== null) return channel;
  try {
    channel = typeof BroadcastChannel === 'undefined' ? false : new BroadcastChannel(CHANNEL);
  } catch {
    channel = false;
  }
  return channel;
}

/** The last write this tab made, so it can ignore the echo of its own message. */
let lastLocalWrite = 0;

export const lastWriteAt = () => lastLocalWrite;

/**
 * Subscribe to writes from other tabs. `onRemoteWrite(savedAt)` is called only
 * for writes newer than this tab's own.
 */
export function watchOtherTabs(onRemoteWrite) {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (event) => {
    const at = event?.data?.savedAt;
    if (typeof at === 'number' && at > lastLocalWrite) onRemoteWrite(at);
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}

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

    lastLocalWrite = payload.savedAt;
    const ch = getChannel();
    if (ch) {
      try {
        // Not Window.postMessage — a BroadcastChannel has no target origin, and
        // it is already scoped to this origin by definition.
        // eslint-disable-next-line unicorn/require-post-message-target-origin
        ch.postMessage({ savedAt: payload.savedAt });
      } catch { /* a closed channel is not worth failing a save over */ }
    }
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

/**
 * Wipe both backends.
 *
 * Bounded, and it never rejects. The mirror is removed synchronously first, so
 * the important half of the erase has already happened by the time IndexedDB is
 * asked for anything — if that side is wedged, the caller still gets a resolved
 * promise instead of waiting on a request that may never settle.
 */
export async function clearAll() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }

  try {
    await Promise.race([
      (async () => {
        await idbSet(STATE_KEY, undefined);
        await idbSet(SNAPSHOT_KEY, []);
        await pruneFiles([]); // an erase must take the receipts with it
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('clear timed out')), 4000)),
    ]);
  } catch { /* ignore — the mirror is already gone and the UI must not stall */ }
}
