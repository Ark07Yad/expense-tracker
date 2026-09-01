/**
 * Receipt attachments.
 *
 * Images only, downscaled before they are stored. A photo straight off a phone
 * is three to five megabytes; the same receipt at 1600px is a couple of hundred
 * kilobytes and still perfectly readable. Since everything here shares one
 * origin storage quota with the ledger itself, storing originals would mean a
 * few dozen receipts crowding out the thing the app is actually for.
 *
 * PDFs are accepted as-is — they cannot be resampled, and a PDF receipt is
 * usually small already.
 */

import * as persist from './persist';

export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_EDGE = 1600;
export const ACCEPTED = 'image/png,image/jpeg,image/webp,image/heic,application/pdf';

const uid = () => `att_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

export const formatBytes = (n) => {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Shrink an image so its longest edge is at most MAX_EDGE.
 *
 * Falls back to the original on any failure — an unreadable format, a canvas
 * the browser refuses to export. A slightly large attachment is a much better
 * outcome than an attachment that silently did not save.
 */
async function downscale(file) {
  if (!file.type.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size < 400 * 1024) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82)
    );
    // Only take the re-encode if it actually helped: a small PNG screenshot can
    // come out of a JPEG round-trip larger than it went in.
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/**
 * Store a file and return the metadata to hang on the entry.
 *
 * Throws with a message meant to be shown, because every failure here is
 * something the user can act on — a wrong file type, a file too big, or a full
 * disk.
 */
export async function attachFile(file) {
  if (file.size > MAX_BYTES) {
    throw new Error(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
  }
  if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
    throw new Error('Attach an image or a PDF.');
  }

  const blob = await downscale(file);
  const id = uid();

  try {
    await persist.putFile(id, blob);
  } catch {
    throw new Error('Could not save that — this device may be out of storage.');
  }

  return {
    id,
    name: file.name.slice(0, 60),
    type: blob.type || file.type,
    size: blob.size,
    at: Date.now(),
  };
}

/** An object URL for viewing. The caller must revoke it when finished. */
export async function openAttachment(id) {
  const blob = await persist.getFile(id);
  return blob ? URL.createObjectURL(blob) : null;
}

export const removeAttachment = (id) => persist.deleteFile(id);

/** Every attachment id still referenced by an entry — the input to a prune. */
export const referencedIds = (entries) =>
  (entries || []).flatMap((e) => (e.attachments || []).map((a) => a.id));
