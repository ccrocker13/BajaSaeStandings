import { copyFileSync } from 'node:fs';
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

// Served from https://ccrocker13.github.io/bajasaestandings/, so assets need
// the repo name as a base path.
export default defineConfig({
  base: '/bajasaestandings/',
  plugins: [react(), spaFallback()],
  build: { outDir: 'dist' },
  test: { include: ['packages/**/*.test.ts'] },
} as never);
