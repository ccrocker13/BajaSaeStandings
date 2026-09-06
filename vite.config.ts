import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://ccrocker13.github.io/bajasaestandings/, so assets need
// the repo name as a base path.
export default defineConfig({
  base: '/bajasaestandings/',
  plugins: [react()],
  build: { outDir: 'dist' },
  test: { include: ['packages/**/*.test.ts'] },
} as never);
