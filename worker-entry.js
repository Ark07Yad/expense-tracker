import { securityHeaders } from './security-headers.js';

/**
 * Static-asset entry point.
 *
 * Exists for one reason: a blanket single-page-application fallback answers
 * *every* miss with index.html and a 200, including a missing hashed asset.
 * The browser then reports "Expected a JavaScript-or-Wasm module script but the
 * server responded with a MIME type of text/html", which says nothing about the
 * actual problem — the file is simply not there. That happens for real during a
 * deploy, when a client still holding the previous index.html requests a bundle
 * that has just been replaced.
 *
 * So: real 404s for assets, app shell for client routes.
 */

/*
 * Assets are covered by the generated `_headers` file — the asset server
 * answers those without invoking this Worker at all. What is left for us is the
 * SPA fallback and the asset 404, and they get the same headers from the same
 * module so the two cannot drift.
 */
function withSecurity(res) {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);

  /* 204/304 and friends must be given a null body — handing the Response
     constructor a body with one of those statuses throws, which would turn a
     routine conditional request into a 500. ASSETS returns 304 whenever a
     client revalidates, so this is the common path, not an edge case. */
  const bodyless =
    res.status === 101 || res.status === 204 || res.status === 205 || res.status === 304;

  return new Response(bodyless ? null : res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const res = await env.ASSETS.fetch(request);

    if (res.status !== 404) return withSecurity(res);

    // A hashed bundle that is not there is a genuine 404. Say so, and tell a
    // stale client to reload rather than leaving it wedged.
    if (url.pathname.startsWith('/assets/')) {
      return withSecurity(
        new Response(
          `Asset not found: ${url.pathname}\n\nThis usually means the page was loaded before a deploy. Reload to pick up the current build.`,
          {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
          }
        )
      );
    }

    // Anything else is a client-side route — serve the app shell so a refresh
    // on a deep link still works.
    return withSecurity(await env.ASSETS.fetch(new Request(new URL('/', url), request)));
  },
};
