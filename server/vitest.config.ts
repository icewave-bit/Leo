import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    fileParallelism: false,
    pool: 'forks',
    singleFork: true,
    include: ['src/**/*.test.ts', '../client/src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30000,
  },
});
