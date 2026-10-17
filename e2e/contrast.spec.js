import { expect, test } from '@playwright/test';
import { go, startWithSampleData } from './helpers';

/**
 * Every piece of text on every screen, measured against what is actually
 * behind it, in both themes.
 *
 * The Paper palette is quiet on purpose: faint captions, hairlines, warm greys.
 * That is the look most likely to drift below a readable contrast one token
 * tweak at a time, and no one notices until someone squints. So the audit that
 * was run by hand while designing it runs here, on every CI build.
 *
 * WCAG AA: 4.5:1 for body text, 3:1 for large text (24px, or 18.66px bold).
 * The background is found by walking up the tree and compositing each
 * translucent layer until an opaque one. The selected pill of a segmented
 * control is a sibling of its label rather than an ancestor, so that text is
 * measured against the pill.
 */

const SCREENS = ['Home', 'Ledger', 'Trends', 'Invest', 'Advice', 'Settings'];

test.use({ reducedMotion: 'reduce' });

function audit(rootSelector) {
  const parse = (c) => {
    if (!c) return null;
    let m = c.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [r, g, b, a];
    }
    m = c.match(/^color\(srgb ([^)]+)\)$/);
    if (m) {
      const [r, g, b, a = 1] = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return [r * 255, g * 255, b * 255, a];
    }
    // color-mix() in oklab serialises as oklab(); convert it to sRGB.
    m = c.match(/^ok(lab|lch)\(([^)]+)\)$/);
    if (m) {
      const num = (v, pct = 1) => (v === 'none' ? 0 : v.endsWith('%') ? (parseFloat(v) / 100) * pct : parseFloat(v));
      const [p0, p1, p2, alpha] = m[2].split(/[\s/]+/).filter(Boolean);
      const L = num(p0);
      let A = num(p1, 0.4);
      let B = num(p2, 0.4);
      if (m[1] === 'lch') {
        const h = (num(p2) * Math.PI) / 180;
        [A, B] = [A * Math.cos(h), A * Math.sin(h)];
      }
      const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
      const mm = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
      const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
      const enc = (v) => 255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
      return [
        enc(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s),
        enc(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
        enc(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s),
        alpha === undefined ? 1 : num(alpha),
      ];
    }
    return null;
  };
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const luminance = ([r, g, b]) => {
    const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const unknown = new Set();

  /** The colour behind `el`, compositing translucent layers down to an opaque one. */
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      // A selected tab's pill sits behind it as a sibling, not an ancestor.
      if (n.matches('[role="tab"][aria-selected="true"]')) {
        const pill = n.closest('[role="tablist"]')?.querySelector('.thumb');
        if (pill) layers.push(getComputedStyle(pill).backgroundColor);
      }
      const bg = getComputedStyle(n).backgroundColor;
      layers.push(bg);
      if (parse(bg)?.[3] === 1) break;
    }
    // Paint from the opaque layer at the bottom up to the element itself.
    let colour = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const c = parse(layer);
      if (!c) { unknown.add(layer); continue; }
      if (c[3] > 0) colour = over(c, colour);
    }
    return colour;
  };

  const failures = [];
  let checked = 0;
  const root = document.querySelector(rootSelector);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!t.textContent.trim() || seen.has(el)) continue;
    seen.add(el);
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width <= 1 || rect.height <= 1 || style.visibility === 'hidden' || style.display === 'none') continue;
    if (el.closest('[aria-hidden="true"]')) continue;

    // SVG text (chart axes and labels) paints with fill, not color.
    const paint = el instanceof SVGElement ? style.fill : style.color;
    const fg = parse(paint);
    if (!fg) { unknown.add(paint); continue; }
    const bg = backdrop(el);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(over(fg, bg), bg);
    checked++;
    if (got < need) {
      failures.push(`${got.toFixed(2)}:1 < ${need} "${t.textContent.trim().slice(0, 40)}" (${paint} on rgb(${bg.slice(0, 3).map(Math.round).join(' ')}), ${size}px)`);
    }
  }
  return { checked, failures, unknown: [...unknown] };
}

async function auditEveryScreen(page) {
  for (const screen of SCREENS) {
    await go(page, screen);
    await expect(page.locator('main h1').first()).toBeVisible();
    // Charts and lists render after the heading; let layout settle before reading.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    await expectReadable(page, 'main', screen);
  }

  // Sheets sit on their own surface, and the Ask AI one only exists once opened.
  await go(page, 'Invest');
  await page.getByRole('button', { name: /Ask AI/ }).click();
  await expect(page.getByRole('dialog').getByRole('group', { name: 'Provider' })).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await expectReadable(page, '[role="dialog"]', 'Ask AI sheet');
}

async function expectReadable(page, root, where) {
  const { checked, failures, unknown } = await page.evaluate(audit, root);
  expect(unknown, `${where}: colours the audit could not read`).toEqual([]);
  expect(checked, `${where}: no text was measured`).toBeGreaterThan(10);
  expect(failures, `${where}: text below WCAG AA`).toEqual([]);
}

test('every screen meets WCAG AA contrast in the light theme', async ({ page }) => {
  await startWithSampleData(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await auditEveryScreen(page);
});

test('every screen meets WCAG AA contrast in the dark theme', async ({ page }) => {
  await startWithSampleData(page);
  // The toggle cycles Dark → Bright → Auto; tap it until it says Dark.
  const toggle = page.locator('aside').getByRole('button', { name: /^Theme:/ });
  for (let i = 0; i < 3 && !(await toggle.getAttribute('aria-label')).startsWith('Theme: Dark'); i++) await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await auditEveryScreen(page);
});
