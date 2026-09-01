import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './lib/store';
import App from './App';
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
