import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    passWithNoTests: true,
    // BL-032 Phase 2: integration tests using `unstable_dev` from wrangler
    // (auth.test.ts, cors.test.ts, worker-roundtrip.test.ts) each spawn a
    // miniflare runtime in beforeAll. Running multiple of these in parallel
    // causes runtime conflicts (port collisions, miniflare-state cross-talk).
    // Serializing test FILES — within-file test parallelism is preserved.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
      },
    },
  },
});
