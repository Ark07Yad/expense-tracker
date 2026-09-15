/**
 * Security headers, defined once.
 *
 * They have to be applied in two places, which is the whole reason this file
 * exists as a module rather than a literal in the Worker. Cloudflare's asset
 * server answers requests that match a built file *without* invoking the
 * Worker, so headers set in `worker-entry.js` never reach the actual page —
 * only the SPA fallback and 404s would get them, which looks like protection
 * while the thing being protected is uncovered. Assets are covered by a
 * generated `_headers` file instead, and the Worker covers what it still
 * handles itself. Both read from here, so the two cannot drift.
 *
 * The directive doing real work is `script-src 'self'`. This app keeps a
 * complete personal financial history on the device — every entry, every
 * holding, income, budgets — in IndexedDB and localStorage, all of it readable
 * by any script that manages to run on the page. Refusing to execute anything
 * but our own bundle is what makes that hard.
 *
 * `style-src` keeps 'unsafe-inline' deliberately. Recharts and the animation
 * code set element styles at runtime, and inline *style* injection is a far
 * weaker attack than script injection — it cannot read storage or make
 * requests. Dropping it would break the UI to close a much smaller hole.
 *
 * `connect-src` lists exactly the AI providers someone can choose under
 * "Ask AI", and nothing else: no backend, no analytics, no price feed. Those
 * calls only happen when the person asks, with their own key, after seeing
 * what will be sent. The local ports are Ollama (11434) and LM Studio (1234)
 * on the person's own machine. Anything not listed fails in the console, so a
 * new provider has to be added here too — `ai/csp.test.js` checks the two
 * lists agree.
 *
 * No `upgrade-insecure-requests`: every asset is already same-origin or https,
 * and the directive can rewrite the http://localhost model URLs to https, which
 * nothing is listening on.
 *
 * `worker-src` and `manifest-src` are what let the offline shell install at
 * all — without them the service worker registration and the install prompt
 * both fail with a console error and no visible symptom.
 */
export function securityHeaders() {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      // Google Fonts serves the stylesheet from googleapis and the font files
      // from gstatic; both are needed or the type falls back to system sans.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // data: for the inline SVG favicon, blob: for the JSON backup export.
      "img-src 'self' data: blob:",
      [
        "connect-src 'self'",
        'https://openrouter.ai',
        'https://generativelanguage.googleapis.com',
        'https://api.groq.com',
        'https://api.openai.com',
        'https://api.anthropic.com',
        'http://localhost:11434',
        'http://127.0.0.1:11434',
        'http://localhost:1234',
        'http://127.0.0.1:1234',
      ].join(' '),
      // The offline shell in public/sw.js, and the install manifest.
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",          // stops an injected <base> retargeting URLs
      "form-action 'self'",
      "frame-ancestors 'none'",   // clickjacking
    ].join('; '),

    // For older browsers that ignore frame-ancestors.
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Nothing here uses any of these; refusing them costs nothing.
    'Permissions-Policy':
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    // No includeSubDomains and no preload: this is a shared workers.dev name,
    // and neither is ours to assert for anything but this host.
    'Strict-Transport-Security': 'max-age=31536000',
  };
}
