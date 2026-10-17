import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './lib/store';
import App from './App';
// Fonts are bundled, not fetched from Google: they land in /assets/ beside the
// app, so the service worker caches them for offline use and no request leaves
// the site. Geist is one variable file for every weight; the serif is only ever
// set at 400, upright and italic.
import '@fontsource-variable/geist';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>
);

/*
 * Offline shell, production only.
 *
 * A service worker in development caches the very files Vite is trying to
 * replace, which turns every edit into a debugging session about why nothing
 * changed. Registration also waits for load: it is not on the critical path
 * for anything the user is waiting to see.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* An unavailable worker only costs offline support, never the app. */
    });
  });
}
