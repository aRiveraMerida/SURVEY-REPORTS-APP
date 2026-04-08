import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Our business-logic tests run in plain Node (no browser/jsdom).
    // PDF generation with Puppeteer is slow on the first launch
    // (loads Chromium); bump the default timeout generously.
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    // Match the `@/` alias used throughout the app so tests can
    // import from '@/lib/...'.
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
