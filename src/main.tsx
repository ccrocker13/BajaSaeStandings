import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import './index.css';

/**
 * Register the offline cache. Production only — in dev it would serve stale
 * modules and be actively confusing. Failure is ignored on purpose: the site
 * works without it, and an unsupported or blocked worker must not surface an
 * error to someone just trying to read a leaderboard.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* basename keeps deep links working under the repo-name path on Pages. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
