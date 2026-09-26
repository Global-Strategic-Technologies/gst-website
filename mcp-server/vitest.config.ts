import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // No `passWithNoTests`: a run that collects zero tests (a mistyped filter,
    // a broken include glob) must fail, not report green.
    //
    // BL-032 Phase 2: every integration file that boots the Worker with
    // wrangler's `unstable_dev` spawns a miniflare runtime in beforeAll (grep
    // `unstable_dev` under tests/ for the current set). Running several in
    // parallel causes runtime conflicts (port collisions, miniflare-state
    // cross-talk). Serializing test FILES — within-file test parallelism is
    // preserved.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      // Generated data bundles (`npm run test:docs` guards their freshness) are
      // data, not logic — instrumenting them only dilutes the line counts.
      exclude: ['src/index.ts', 'src/**/*.generated.ts'],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
      },
    },
  },
});
