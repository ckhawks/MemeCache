import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Builds a fresh memecache_test database once per run (needs `npm run dev:up`).
    globalSetup: './tests/global-setup.ts',
    setupFiles: ['./tests/env.ts'],
    // Test files share one database and truncate it between tests.
    fileParallelism: false,
  },
});
