import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'happy-dom',
    // Coverage floor: docs/specs/03.testing.md §4.
    coverage: {
      provider: 'v8',
      include: ['packages/host/src/**/*.ts', 'packages/shared-contracts/src/**/*.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        // 90 % lines per package src.
        'packages/host/src/**/*.ts': { lines: 90 },
        'packages/shared-contracts/src/**/*.ts': { lines: 90 },
        // 100 % branches for pure rule modules (`start`/`transition`, `parseConfig`).
        'packages/host/src/transition.ts': { branches: 100 },
        'packages/host/src/config-loader.ts': { branches: 100 },
      },
    },
  },
});
