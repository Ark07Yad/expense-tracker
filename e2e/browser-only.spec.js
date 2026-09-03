import { expect, test } from '@playwright/test';
import { go, logEntry, settledState, startEmpty, startWithSampleData, watchForErrors } from './helpers';

/**
 * The things only a real browser can show.
 *
 * Everything here depends on a capability jsdom does not have and a unit test
 * cannot stand in for: a service worker, a file picker, a download, a real
 * IndexedDB. These are also the features where a failure is most likely to be
 * silent — an export that produces no file, an offline shell that was never
 * installed, an attachment that vanished.
 */

test.describe('offline', () => {
  test('registers a service worker and takes control of the page', async ({ page }) => {
    await startWithSampleData(page);

    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg?.active;
    }, null, { timeout: 15_000 });

    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });

    // The shell is cached, which is what makes an offline load possible.
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const shell = names.find((n) => n.startsWith('cointrack-shell'));
      if (!shell) return null;
      return (await (await caches.open(shell)).keys()).map((r) => new URL(r.url).pathname);
    });
    expect(cached).toContain('/');
  });

  test('still runs with the network cut', async ({ page, context, browserName }) => {
    // Skipped on WebKit only: reloading an offline page throws "WebKit
    // encountered an internal error" inside Playwright's build, before any app
    // code runs. The registration and caching above are asserted on all three
    // engines, so what is untested here is the harness, not the feature.
    test.skip(browserName === 'webkit', 'Playwright WebKit cannot reload while offline');

    await startWithSampleData(page);
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg?.active;
    }, null, { timeout: 15_000 });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });

    await context.setOffline(true);
    await page.reload();

    // The whole app, from cache, with no network at all.
    await expect(page.getByRole('heading', { name: /Good |Still up/ })).toBeVisible();
    await expect(page.locator('main')).toContainText('₹');

    // And the data is still there, because it never came from the network.
    await go(page, 'Ledger');
    await expect(page.locator('main')).toContainText(/entries|entry/);

    await context.setOffline(false);
  });

  test('is installable', async ({ page }) => {
    await startWithSampleData(page);
    const manifest = await page.evaluate(async () => {
      const href = document.querySelector('link[rel=manifest]')?.href;
      return href ? (await fetch(href)).json() : null;
    });
    expect(manifest).toMatchObject({ short_name: 'CoinTrack', display: 'standalone' });
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.start_url).toBe('/');
  });
});

test.describe('backup', () => {
  test('exports a real file, and restores from it after an erase', async ({ page }) => {
    // With no server, this file is the only copy that can leave the device, so
    // "the button appeared to work" is not good enough — the download has to
    // actually arrive and actually restore.
    await startEmpty(page);
    await logEntry(page, { amount: 4321, title: 'Before the backup' });
    await settledState(page, 1);

    await go(page, 'Settings');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export backup/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^cointrack-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    expect(path).toBeTruthy();

    const backup = JSON.parse(await (await import('node:fs/promises')).readFile(path, 'utf8'));
    expect(backup.app).toBe('cointrack');
    expect(backup.state.entries).toHaveLength(1);

    // Erase everything, and confirm the app really is empty.
    await page.getByRole('button', { name: /Erase everything/ }).click();
    const dialog = page.getByRole('dialog');
    // Arming relabels the button, so the confirmation is a different locator.
    await dialog.getByRole('button', { name: 'Erase everything' }).click();
    await dialog.getByRole('button', { name: /Yes, erase it/ }).click();
    await expect(page.getByRole('heading', { name: /set up your ledger/ })).toBeVisible();

    // Restore, and the entry comes back.
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByRole('button', { name: /Skip —/ }).click();
    await go(page, 'Settings');
    await page.getByRole('button', { name: /Restore from file/ }).click();
    await page.locator('input[type=file]').setInputFiles(path);

    await expect(page.getByText(/Restored 1 entries/)).toBeVisible();
    await go(page, 'Ledger');
    await expect(page.getByText('Before the backup').first()).toBeVisible();
  });
});

test.describe('CSV import', () => {
  test('reads an awkward bank export and writes the right entries', async ({ page }, testInfo) => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await mkdir(testInfo.outputDir, { recursive: true });

    // Semicolons, quoted commas, European decimals, a day above 12 to settle
    // the date order, one unreadable row, and a repeat of the first.
    const csv = [
      'Transaction Date;Description;Money Out;Money In;Balance',
      '13/08/2026;"TESCO STORES 3294, DUBLIN";31,20;;1.204,50',
      '14/08/2026;NETFLIX.COM;15,99;;1.188,51',
      '01/09/2026;MONTHLY SALARY ACME LTD;;2.500,00;3.676,11',
      'not-a-date;BROKEN ROW;10,00;;0',
      '13/08/2026;"TESCO STORES 3294, DUBLIN";31,20;;1.204,50',
    ].join('\n');
    const file = join(testInfo.outputDir, 'statement.csv');
    await writeFile(file, csv, 'utf8');

    await startEmpty(page);
    await go(page, 'Settings');
    await page.getByRole('button', { name: /Import CSV/ }).click();
    await page.getByRole('dialog').locator('input[type=file]').setInputFiles(file);

    // It works out the shape of the file and says what it found.
    await expect(page.getByText(/one of the dates could only be this way round/)).toBeVisible();
    // Twice over: the row badge, and the "skip N already in your ledger" toggle.
    await expect(page.getByText('already logged').first()).toBeVisible();
    await expect(page.getByText(/Skip 1 already in your ledger/)).toBeVisible();
    await expect(page.getByText('unreadable date')).toBeVisible();

    await page.getByRole('dialog').getByRole('button', { name: /^Import \d/ }).click();

    const state = await settledState(page, 3);
    const imported = state.entries.map((e) => `${e.date} ${e.kind} ${e.category}`).sort();
    expect(imported).toEqual([
      '2026-08-13 expense groceries',
      '2026-08-14 expense subscriptions',
      '2026-09-01 earning salary',
    ]);
  });
});

test.describe('receipts', () => {
  test('attaches a file, shows it, and reclaims it when the entry goes', async ({ page }, testInfo) => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await mkdir(testInfo.outputDir, { recursive: true });

    // A tiny real PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=',
      'base64'
    );
    const file = join(testInfo.outputDir, 'receipt.png');
    await writeFile(file, png);

    await startEmpty(page);
    await page.locator('aside').getByRole('button', { name: 'New entry' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByPlaceholder('0').first().fill('3120');
    await sheet.locator('input[type=file]').setInputFiles(file);
    await expect(sheet.getByText('receipt.png')).toBeVisible();
    await sheet.getByRole('button', { name: /^Log / }).click();

    const state = await settledState(page, 1);
    // Metadata on the entry; the bytes must not be in the state object.
    expect(state.entries[0].attachments).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain('data:image');

    // What matters is that the bytes round-tripped through IndexedDB and come
    // back as a decodable image. Asserting on the stored record's shape instead
    // would be testing the storage format, which differs by engine and has
    // already changed once.

    await go(page, 'Ledger');
    await page.getByRole('button', { name: /View 1 attached file/ }).first().click();

    /*
     * Whether the bytes can come back at all is a platform capability, so it is
     * probed rather than assumed from the browser name. Playwright's Linux
     * WebKit build cannot round-trip binary data through IndexedDB; Safari
     * proper can, and so can the macOS build. Probing means this assertion
     * starts running again by itself if that changes, and never silently passes
     * on a platform where the feature is broken for real.
     */
    const canRoundTrip = await page.evaluate(async () => {
      try {
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('probe-binary', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('x');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const written = await new Promise((res) => {
          const tx = db.transaction('x', 'readwrite');
          tx.objectStore('x').put(new Uint8Array([1, 2, 3]).buffer, 'k');
          tx.oncomplete = () => res(true);
          tx.onerror = () => res(false);
          tx.onabort = () => res(false);
        });
        const read = written
          ? await new Promise((res) => {
              const tx = db.transaction('x', 'readonly');
              const rq = tx.objectStore('x').get('k');
              rq.onsuccess = () => res(rq.result?.byteLength ?? 0);
              rq.onerror = () => res(0);
            })
          : 0;
        db.close();
        indexedDB.deleteDatabase('probe-binary');
        return read === 3;
      } catch {
        return false;
      }
    });
    test.skip(!canRoundTrip, 'this build cannot round-trip binary data through IndexedDB');

    const image = page.getByRole('dialog').locator('img');
    await expect(image).toBeVisible();
    // Visible is not enough: a broken image is still a visible element. A
    // non-zero natural width is proof the bytes survived the round trip.
    await expect
      .poll(() => image.evaluate((el) => el.naturalWidth), { timeout: 10_000 })
      .toBeGreaterThan(0);
  });
});

test.describe('recurring', () => {
  test('schedules from the composer and offers the next one', async ({ page }) => {
    const errors = watchForErrors(page);
    await startEmpty(page);

    await logEntry(page, { amount: 25500, title: 'Rent', category: 'Rent & Housing', repeat: 'Monthly' });

    // The schedule exists and is described in words.
    await go(page, 'Ledger');
    await expect(page.getByText(/Monthly on the \d+/)).toBeVisible();

    // Nothing is due yet: the entry just logged is this period's occurrence,
    // and offering it again would duplicate it on day one.
    await expect(page.getByText(/scheduled entr/)).toBeHidden();

    // Wind the schedule back so an occurrence is outstanding, then confirm it.
    // Writes are debounced, so the rule has to be on disk before it is edited.
    await expect
      .poll(async () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('cointrack.v1') || '{}').recurring?.length ?? 0)
      )
      .toBe(1);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('cointrack.v1'));
      s.recurring[0].lastResolved = null;
      s.recurring[0].anchorDate = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
      s.savedAt = Date.now() + 1000;
      localStorage.setItem('cointrack.v1', JSON.stringify(s));
    });
    await page.reload();

    // A reload lands on Home, which shows the one-line prompt; the queue itself
    // lives next to the ledger it writes into.
    await expect(page.getByText(/scheduled entr\w+ (is|are) waiting/)).toBeVisible();
    await go(page, 'Ledger');

    await expect(page.getByText(/scheduled entr\w+ due/)).toBeVisible();
    await page.getByRole('button', { name: /^Add all/ }).click();
    await expect(page.getByText(/scheduled entr\w+ due/)).toBeHidden();
    expect(errors).toEqual([]);
  });
});
