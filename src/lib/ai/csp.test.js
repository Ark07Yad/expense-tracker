/**
 * A provider missing from `connect-src` fails only in production, as a console
 * error, because the dev server and the e2e preview send no CSP at all.
 */

import { describe, expect, it } from 'vitest';
import { securityHeaders } from '../../../security-headers.js';
import { PROVIDERS } from './providers';

const csp = securityHeaders()['Content-Security-Policy'];
const directive = (name) =>
  csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `))?.split(/\s+/).slice(1) || [];

describe('content security policy', () => {
  it('allows every AI provider host, and the loopback alias of local ones', () => {
    const connect = directive('connect-src');
    for (const p of PROVIDERS) {
      const origin = new URL(p.base).origin;
      expect(connect, p.id).toContain(origin);
      if (p.local) expect(connect, p.id).toContain(origin.replace('localhost', '127.0.0.1'));
    }
  });

  it('still refuses scripts from anywhere but this site', () => {
    expect(directive('script-src')).toEqual(["'self'"]);
  });

  it('does not upgrade local model URLs to https', () => {
    expect(csp).not.toMatch(/upgrade-insecure-requests/);
  });
});
