import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MAX_BYTES } from './attachments';
import { buildBackup, readBackup } from './backup';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 9, 9]);

const entry = (id, attachments = []) => ({
  id, date: '2026-10-01', kind: 'expense', category: 'food', title: id, amount: 10, attachments,
});
const att = (id, type) => ({ id, name: `${id}.x`, type, size: 8, at: 1 });

const ledger = (entries) => ({ version: 1, onboarded: true, entries, assets: [], profile: {} });

const store = (files) => async (id) => (files[id] ? new Blob([files[id].bytes], { type: files[id].type }) : null);

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

describe('buildBackup', () => {
  it('stays plain JSON when there are no receipts', async () => {
    const out = await buildBackup(ledger([entry('a')]), { getFile: store({}), date: '2026-10-17' });
    expect(out.filename).toBe('cointrack-2026-10-17.json');
    expect(out.blob.type).toBe('application/json');
    const parsed = JSON.parse(await out.blob.text());
    expect(parsed.app).toBe('cointrack');
    expect(parsed.state.entries).toHaveLength(1);
    expect(out).toMatchObject({ receipts: 0, missing: 0 });
  });

  it('zips the JSON with every receipt as an ordinary file', async () => {
    const state = ledger([
      entry('a', [att('att_png1', 'image/png')]),
      entry('b', [att('att_pdf1', 'application/pdf')]),
    ]);
    const getFile = store({
      att_png1: { bytes: PNG, type: 'image/png' },
      att_pdf1: { bytes: PDF, type: 'application/pdf' },
    });
    const out = await buildBackup(state, { getFile, date: '2026-10-17' });
    expect(out.filename).toBe('cointrack-2026-10-17.zip');
    expect(out.receipts).toBe(2);

    const zip = unzipSync(await bytesOf(out.blob));
    expect(Object.keys(zip).sort()).toEqual(['cointrack.json', 'receipts/att_pdf1.pdf', 'receipts/att_png1.png']);
    expect(zip['receipts/att_png1.png']).toEqual(PNG);
    const parsed = JSON.parse(new TextDecoder().decode(zip['cointrack.json']));
    expect(parsed.receipts).toEqual({ att_png1: 'receipts/att_png1.png', att_pdf1: 'receipts/att_pdf1.pdf' });
  });

  it('leaves out and counts receipts that are not on this device', async () => {
    const state = ledger([entry('a', [att('att_here', 'image/png'), att('att_gone', 'image/png')])]);
    const out = await buildBackup(state, { getFile: store({ att_here: { bytes: PNG, type: 'image/png' } }), date: 'd' });
    expect(out).toMatchObject({ receipts: 1, missing: 1 });
  });

  it('still writes JSON when every receipt is missing', async () => {
    const out = await buildBackup(ledger([entry('a', [att('att_gone', 'image/png')])]), { getFile: store({}), date: 'd' });
    expect(out.filename).toMatch(/\.json$/);
    expect(out.missing).toBe(1);
  });
});

describe('readBackup', () => {
  it('round-trips a zip: same state, same receipt bytes and types', async () => {
    const state = ledger([entry('a', [att('att_png1', 'image/png')]), entry('b', [att('att_pdf1', 'application/pdf')])]);
    const getFile = store({
      att_png1: { bytes: PNG, type: 'image/png' },
      att_pdf1: { bytes: PDF, type: 'application/pdf' },
    });
    const { blob } = await buildBackup(state, { getFile, date: 'd' });

    const back = await readBackup(blob);
    expect(back.state.entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect([...back.files.keys()].sort()).toEqual(['att_pdf1', 'att_png1']);
    expect(await bytesOf(back.files.get('att_png1'))).toEqual(PNG);
    expect(back.files.get('att_pdf1').type).toBe('application/pdf');
  });

  it('reads the JSON backups older versions wrote, and a bare state', async () => {
    const wrapped = new Blob([JSON.stringify({ app: 'cointrack', state: ledger([entry('a')]) })]);
    expect((await readBackup(wrapped)).state.entries).toHaveLength(1);
    const bare = new Blob([JSON.stringify(ledger([entry('a'), entry('b')]))]);
    const back = await readBackup(bare);
    expect(back.state.entries).toHaveLength(2);
    expect(back.files.size).toBe(0);
  });

  it('refuses files that are not a CoinTrack backup', async () => {
    await expect(readBackup(new Blob(['not json']))).rejects.toThrow();
    await expect(readBackup(new Blob([JSON.stringify({ hello: 1 })]))).rejects.toThrow(/not a CoinTrack backup/);
    const zipWithout = new Blob([zipSync({ 'other.txt': strToU8('hi') })]);
    await expect(readBackup(zipWithout)).rejects.toThrow(/not a CoinTrack backup/);
  });

  it('takes only receipts an entry points to, with an accepted type, our id shape and a sane size', async () => {
    const state = ledger([
      entry('a', [att('att_ok', 'image/png'), att('att_html', 'text/html'), att('att_big', 'image/png')]),
    ]);
    const receipts = {
      att_ok: 'receipts/att_ok.png',
      att_html: 'receipts/att_html.html', // type the app never accepts
      att_big: 'receipts/att_big.png', // over the size limit
      att_orphan: 'receipts/att_orphan.png', // no entry points to it
      '../../evil': 'receipts/evil.png', // not an id this app makes
    };
    const zip = zipSync({
      'cointrack.json': strToU8(JSON.stringify({ app: 'cointrack', state, receipts })),
      'receipts/att_ok.png': PNG,
      'receipts/att_html.html': strToU8('<script>alert(1)</script>'),
      'receipts/att_big.png': [new Uint8Array(MAX_BYTES + 1), { level: 9 }],
      'receipts/att_orphan.png': PNG,
      'receipts/evil.png': PNG,
    });
    const back = await readBackup(new Blob([zip]));
    expect([...back.files.keys()]).toEqual(['att_ok']);
  });
});
