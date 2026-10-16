/**
 * Language features the supported browsers actually have.
 *
 * Vite translates new *syntax* for older browsers but not new *methods* — a
 * call to `toSorted` ships as written and throws in any browser without it.
 * These arrived in 2023 (Safari 16, Chrome 110, Firefox 115), and both uses
 * that slipped in sat on paths a person reaches by typing two letters into the
 * search box or asking the AI about saving. Older iPhones stop at iOS 15.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(import.meta.dirname, '..');
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(js|jsx)$/.test(name) && !/\.test\.(js|jsx)$/.test(name) ? [path] : [];
  });

const TOO_NEW = /\.(toSorted|toReversed|toSpliced|findLast|findLastIndex)\(|\.with\(\d|Object\.groupBy\(|Map\.groupBy\(|Promise\.withResolvers\(/;

describe('app code', () => {
  it('uses no array or object methods newer than the browsers it supports', () => {
    const hits = walk(src).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => (TOO_NEW.test(line) && !line.trim().startsWith('*') && !line.trim().startsWith('//') ? `${file.slice(src.length + 1)}:${i + 1}` : null))
        .filter(Boolean)
    );
    expect(hits).toEqual([]);
  });
});
