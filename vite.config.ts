import { createHash } from 'node:crypto';
import { copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages serves 404.html for any path it has no file for. Making it a
 * copy of index.html is what lets a deep link like /season/2019 load directly
 * instead of 404ing when someone opens a shared URL or hits refresh.
 */
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      const out = resolve(__dirname, 'dist');
      copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html'));
    },
  };
}

/**
 * Emits a service worker that keeps the site usable on bad signal.
 *
 * Written here rather than by hand so the precache list is the real built asset
 * names and the cache version changes whenever they do — a hand-maintained list
 * silently rots and a fixed version serves last week's bundle forever.
 *
 * Deliberately narrow about what it caches. The app shell and the historical
 * season data are safe to serve stale; the live feed is not. A cached live
 * leaderboard replayed as though it were current would make the freshness badge
 * lie, which is worse than showing nothing — so the worker ignores cross-origin
 * requests entirely and the live client keeps its own last payload in memory,
 * ageing the badge honestly.
 */
function serviceWorker(base: string): Plugin {
  return {
    name: 'emit-service-worker',
    closeBundle() {
      const out = resolve(__dirname, 'dist');
      const assets = readdirSync(resolve(out, 'assets')).map((f) => `${base}assets/${f}`);
      // Hash the whole asset list, so the version changes if any one file's
      // hash does. Slicing the joined string instead would miss a change
      // confined to a file that is not at the end of it, and visitors would
      // keep a stale cache.
      const version = createHash('sha256')
        .update([...assets].sort().join('|'))
        .digest('hex')
        .slice(0, 16);
      const precache = [base, `${base}index.html`, ...assets];

      writeFileSync(
        resolve(out, 'sw.js'),
        `// Generated at build time by vite.config.ts — do not edit.
const VERSION = ${JSON.stringify(version)};
const CACHE = 'baja-' + VERSION;
const BASE = ${JSON.stringify(base)};
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cachePut(request, response) {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Cross-origin means the live feed. Never serve that from cache: a stale
  // leaderboard presented as current is worse than none at all.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE)) return;

  // Hashed asset filenames are immutable, so cache-first is safe and fast.
  if (url.pathname.startsWith(BASE + 'assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((r) => cachePut(request, r))),
    );
    return;
  }

  // Everything else — the document and the season JSON — is network-first, so a
  // reachable network always wins and the cache is purely a fallback. This is
  // what stops a stale worker pinning an old build forever.
  event.respondWith(
    fetch(request)
      .then((r) => cachePut(request, r))
      .catch(() =>
        caches.match(request).then((hit) => {
          if (hit) return hit;
          if (request.mode === 'navigate') return caches.match(BASE + 'index.html');
          return Response.error();
        }),
      ),
  );
});
`,
        'utf8',
      );
    },
  };
}

/**
 * Base path for GitHub Pages project sites: https://<user>.github.io/<repo>/.
 *
 * Derived from the repository name rather than written by hand, because that
 * path is case-sensitive and the hand-written lowercase version did not match
 * the repository's actual casing. The result was an index.html that loaded
 * while every asset under it 404'd — a page with no stylesheet and no script,
 * which renders as a black screen in dark mode and gives no clue why.
 */
const REPO = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'BajaSaeStandings';
const BASE = `/${REPO}/`;

export default defineConfig({
  base: BASE,
  plugins: [react(), spaFallback(), serviceWorker(BASE)],
  build: { outDir: 'dist' },
  test: { include: ['packages/**/*.test.ts'] },
} as never);
