/**
 * Backup files: what Export writes and Restore reads.
 *
 * With no server, this file is the only copy of the data that can leave the
 * device, so it has to carry everything — receipts included. A ledger with no
 * receipts still exports as plain JSON, readable in any editor. Once there are
 * receipts it becomes a zip: the same JSON, plus every receipt as an ordinary
 * file someone can open without this app.
 *
 * Images are stored, not compressed: JPEG and PNG are compressed already, and
 * deflating them again costs time for nothing. The JSON is deflated.
 *
 * Restore trusts nothing in the file. A receipt is only taken if an entry
 * points to it, its id looks like ours, its type is one the app accepts and it
 * is within the size limit — anything else in the archive is never even
 * decompressed.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ACCEPTED, MAX_BYTES, referencedIds } from './attachments';

const JSON_NAME = 'cointrack.json';
const ID = /^att_[a-z0-9]+$/;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
const ACCEPTED_TYPES = new Set(ACCEPTED.split(','));

/** Every attachment's metadata by id, from the entries that reference it. */
const attachmentsById = (entries) =>
  new Map((entries || []).flatMap((e) => (e.attachments || []).map((a) => [a.id, a])));

/**
 * Build the file to download.
 *
 * `getFile(id)` returns the stored Blob or null. A receipt that is missing on
 * this device (a ledger restored earlier from a JSON-only backup) is left out
 * and counted, rather than failing the whole backup.
 */
export async function buildBackup(state, { getFile, date }) {
  const payload = { app: 'cointrack', version: state.version, exportedAt: new Date().toISOString(), state };
  const ids = [...new Set(referencedIds(state.entries))];
  const meta = attachmentsById(state.entries);

  const files = {};
  const receipts = {};
  let missing = 0;
  for (const id of ids) {
    const blob = ID.test(id) ? await getFile(id) : null;
    if (!blob) { missing++; continue; }
    const type = blob.type || meta.get(id)?.type;
    const path = `receipts/${id}.${EXT[type] || 'bin'}`;
    files[path] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
    receipts[id] = path;
  }

  const count = Object.keys(receipts).length;
  if (count === 0) {
    return {
      blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      filename: `cointrack-${date}.json`,
      receipts: 0,
      missing,
    };
  }

  files[JSON_NAME] = [strToU8(JSON.stringify({ ...payload, receipts }, null, 2)), { level: 6 }];
  return {
    blob: new Blob([zipSync(files)], { type: 'application/zip' }),
    filename: `cointrack-${date}.zip`,
    receipts: count,
    missing,
  };
}

const isZip = (bytes) => bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/** The state inside a parsed backup, or a bare state, or throw. */
function stateFrom(parsed) {
  const state = parsed?.state || parsed;
  if (!state || !Array.isArray(state.entries)) throw new Error('not a CoinTrack backup');
  return state;
}

/**
 * Read a backup file, JSON or zip.
 *
 * Returns the state and a Map of receipt id → Blob for the store. Throws if the
 * file is not a CoinTrack backup.
 */
export async function readBackup(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isZip(bytes)) return { state: stateFrom(JSON.parse(strFromU8(bytes))), files: new Map() };

  const head = unzipSync(bytes, { filter: (f) => f.name === JSON_NAME });
  if (!head[JSON_NAME]) throw new Error('not a CoinTrack backup');
  const parsed = JSON.parse(strFromU8(head[JSON_NAME]));
  const state = stateFrom(parsed);

  // Only what an entry points to, under the path the manifest names for it.
  const meta = attachmentsById(state.entries);
  const wanted = new Map();
  for (const [id, path] of Object.entries(parsed.receipts || {})) {
    const type = meta.get(id)?.type;
    if (ID.test(id) && typeof path === 'string' && ACCEPTED_TYPES.has(type)) wanted.set(path, { id, type });
  }
  const body = unzipSync(bytes, { filter: (f) => wanted.has(f.name) && f.originalSize <= MAX_BYTES });

  const files = new Map();
  for (const [path, data] of Object.entries(body)) {
    const { id, type } = wanted.get(path);
    files.set(id, new Blob([data], { type }));
  }
  return { state, files };
}
