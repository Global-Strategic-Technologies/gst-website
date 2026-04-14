import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    coverage: {
      include: ['src/utils/**', 'src/data/**/*.ts'],
      exclude: [
        // Browser-only modules — covered by E2E (Playwright), not unit tests.
        // These files depend on DOM APIs, Canvas, localStorage, or Clipboard
        // that vitest's node environment cannot execute.
        'src/utils/techpar-ui.ts',
        'src/utils/techpar/chart.ts',
        'src/utils/techpar/dom.ts',
        'src/utils/techpar/state.ts',
        'src/utils/breadcrumbs.ts',
        'src/utils/copy-feedback.ts',
        'src/utils/analytics.ts',
        'src/utils/fetchRegulations.ts',
        'src/utils/validateData.ts',
      ],
      thresholds: {
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
