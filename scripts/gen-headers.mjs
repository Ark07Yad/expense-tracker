/**
 * Writes dist/_headers after a build.
 *
 * Cloudflare's asset server applies this file to every asset it serves, which
 * is the only way to get headers onto the actual page — a Worker is not invoked
 * for requests that match a built file. Without this, the security headers in
 * worker-entry.js would cover the 404 path and nothing a real visitor loads.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { securityHeaders } from '../security-headers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const headers = securityHeaders();
const body = ['/*', ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`), ''].join('\n');

writeFileSync(resolve(root, 'dist/_headers'), body);

console.log(`Wrote dist/_headers (${Object.keys(headers).length} headers)`);
