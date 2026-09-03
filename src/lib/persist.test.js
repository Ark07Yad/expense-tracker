/**
 * @vitest-environment jsdom
 */

/**
 * Attachment storage.
 *
 * The sweep is the part worth pinning. A receipt is attached *before* the entry
 * that references it exists, so while the form is open it is legitimately an
 * orphan — and a sweep that does not know that deletes it, the entry saves
 * pointing at nothing, and the loss surfaces later as a receipt that will not
 * open.
 *
 * That happened. It passed every local run and failed on CI, which is the
 * signature of a race rather than a platform difference: the sweep is scheduled
 * four seconds after an entries change, so it only bites when composing takes
 * longer than that.
 *
 * Backed by a real in-memory IndexedDB rather than a hand-rolled stub, so the
 * test is about the sweep rather than about the fake.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

let persist;

beforeEach(async () => {
  vi.resetModules();
  // A fresh database per test; persist caches its connection at module scope.
  globalThis.indexedDB = new IDBFactory();
  persist = await import('./persist');
});

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

describe('files', () => {
  it('round-trips the bytes and the type', async () => {
    // Stored as an ArrayBuffer because WebKit will not clone a Blob into
    // IndexedDB at all — the transaction errors with no message.
    await persist.putFile('r', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    const back = await persist.getFile('r');
    expect(back.type).toBe('image/jpeg');
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('returns null for something that was never stored', async () => {
    expect(await persist.getFile('nope')).toBeNull();
  });

  it('deletes a single file on request', async () => {
    await persist.putFile('gone', png());
    await persist.deleteFile('gone');
    expect(await persist.getFile('gone')).toBeNull();
  });

  it('reports usage', async () => {
    await persist.putFile('a', png());
    await persist.putFile('b', png());
    const usage = await persist.fileUsage();
    expect(usage.count).toBe(2);
    expect(usage.bytes).toBe(8);
  });
});

describe('pruneFiles', () => {
  it('leaves a freshly attached blob alone even though nothing references it', async () => {
    // The regression. During compose the blob is an orphan by design.
    await persist.putFile('new', png());
    await persist.pruneFiles([]);
    expect(await persist.getFile('new')).not.toBeNull();
  });

  it('removes an unreferenced blob once it is past the grace period', async () => {
    await persist.putFile('old', png());
    await persist.pruneFiles([], { graceMs: 0 });
    expect(await persist.getFile('old')).toBeNull();
  });

  it('keeps a referenced blob whatever its age', async () => {
    await persist.putFile('kept', png());
    await persist.pruneFiles(['kept'], { graceMs: 0 });
    expect(await persist.getFile('kept')).not.toBeNull();
  });

  it('sweeps only the orphans, leaving the rest', async () => {
    await persist.putFile('keep', png());
    await persist.putFile('drop', png());
    await persist.pruneFiles(['keep'], { graceMs: 0 });
    expect(await persist.getFile('keep')).not.toBeNull();
    expect(await persist.getFile('drop')).toBeNull();
  });

  it('is safe to run when there is nothing to sweep', async () => {
    await expect(persist.pruneFiles([])).resolves.toBeUndefined();
  });
});
