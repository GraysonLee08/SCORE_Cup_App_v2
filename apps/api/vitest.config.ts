import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration suites share one database and truncate tables in setup, so
    // they must not run concurrently. The migration advisory lock protects the
    // schema; this protects the data.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
