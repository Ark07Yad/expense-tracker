/**
 * The Paper style, enforced.
 *
 * The look lives in the theme tokens and the shared primitives, which is what
 * let one change restyle the whole app. That only holds while components keep
 * to the vocabulary: the moment one reaches for `bg-rose-500` or `#38bdf8`, it
 * stops following the theme, and the app drifts screen by screen until it needs
 * another sweep. This test fails on that drift instead.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const components = readdirSync(join(root, 'components'))
  .filter((f) => f.endsWith('.jsx') && !f.includes('.test.'))
  .map((f) => join('components', f));
const files = [...components, 'App.jsx'].map((rel) => ({ rel, text: readFileSync(join(root, rel), 'utf8') }));

/** The solved Paper palette (see the note above CATEGORIES in lib/data.js). */
const PALETTE = new Set([
  '#b16248', '#b95963', '#a76837', '#977026', '#737d35', '#657f4b', '#4f8260', '#3c855b',
  '#4a8172', '#398282', '#4f7ba7', '#6a73b2', '#9168a4', '#98698d', '#b25d71', '#7c776c',
]);

const offenders = (pattern, allow = () => false) =>
  files.flatMap(({ rel, text }) =>
    text.split('\n').flatMap((line, i) =>
      [...line.matchAll(pattern)].map((m) => m[0]).filter((hit) => !allow(hit, line)).map((hit) => `${rel}:${i + 1}  ${hit}`)
    )
  );

describe('components keep to the Paper vocabulary', () => {
  it('use theme tokens, not raw Tailwind colours', () => {
    // Only where a class can actually start — after a space, a quote, a
    // backtick or a variant's colon — so prose like "amber-to-red" in a
    // comment is not mistaken for one.
    const raw = /(?<=[\s"'`:])(?:bg|text|border|ring|fill|stroke|decoration|outline|shadow|from|to|via)-(?:emerald|rose|amber|sky|violet|purple|indigo|green|red|blue|yellow|orange|pink|teal|cyan|lime|fuchsia|slate|gray|zinc|neutral|stone|black|white)(?:-\d{2,3})?(?:\/\d+)?\b/g;
    expect(offenders(raw)).toEqual([]);
  });

  it('use only Paper palette colours where a literal colour is unavoidable', () => {
    const hex = /#[0-9a-fA-F]{6}\b/g;
    expect(offenders(hex, (hit) => PALETTE.has(hit.toLowerCase()))).toEqual([]);
  });

  it('do not bring back blur, gradients or heavy shadows', () => {
    const decoration = /\b(?:backdrop-blur[\w-]*|bg-gradient[\w-]*|blur-(?:sm|md|lg|xl|2xl|3xl)|shadow-(?:sm|md|lg|xl|2xl)|drop-shadow[\w-]*)\b/g;
    expect(offenders(decoration)).toEqual([]);
  });

  it('set headings in the serif, unless they are small-capital captions', () => {
    const heading = /<h[1-4][^>]*className=(?:"[^"]*"|\{`[^`]*`\})/g;
    const fine = (hit) => /\bdisplay\b/.test(hit) || /\buppercase\b/.test(hit);
    expect(offenders(heading, fine)).toEqual([]);
  });
});

describe('the stylesheet has no colour from an earlier design', () => {
  const css = readFileSync(join(root, 'index.css'), 'utf8');

  it('carries none of the old violets or the old near-black', () => {
    for (const old of ['118 69 245', '142 107 255', '#8e6bff', '#7645f5', '#0a0912', '#0a0a0b']) {
      expect(css.includes(old), `index.css still contains ${old}`).toBe(false);
    }
  });
});

describe('the icons and page shell match Paper too', () => {
  const site = join(root, '..');
  const shell = ['index.html', 'public/icon.svg', 'public/icon-maskable.svg', 'public/manifest.webmanifest']
    .map((rel) => ({ rel, text: readFileSync(join(site, rel), 'utf8').toLowerCase() }));

  it('carry none of the old violet icon colours', () => {
    for (const { rel, text } of shell) {
      for (const old of ['#8e6bff', '%238e6bff', '#5f2fd0', '#b79bff', '#120a26', 'lineargradient']) {
        expect(text.includes(old), `${rel} still contains ${old}`).toBe(false);
      }
    }
  });

  it('draw the icons in ink on ivory', () => {
    for (const rel of ['public/icon.svg', 'public/icon-maskable.svg']) {
      const text = shell.find((f) => f.rel === rel).text;
      expect(text, rel).toContain('fill="#f5f2ec"');
      expect(text, rel).toContain('stroke="#1d1c1a"');
    }
  });

  it('list a PNG for every place an SVG icon is not enough', () => {
    const manifest = JSON.parse(shell.find((f) => f.rel === 'public/manifest.webmanifest').text);
    const pngs = manifest.icons.filter((i) => i.type === 'image/png');
    expect(pngs.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const { src } of pngs) expect(readdirSync(join(site, 'public'))).toContain(src.slice(1));
    expect(shell[0].text).toContain('href="/apple-touch-icon.png"');
  });
});
