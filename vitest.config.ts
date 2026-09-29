import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    coverage: {
      // `src/scripts/*/logic.ts`: a tool page's DOM-free logic (ADR-0042), plus
      // TechPar's state module, which is DOM-free and unit-tested. The rest of
      // `src/scripts/` is browser-only and covered by E2E.
      include: [
        'src/utils/**',
        'src/data/**/*.ts',
        'src/scripts/*/logic.ts',
        'src/scripts/techpar/state.ts',
      ],
      exclude: [
        // Type declarations carry no runtime code; coverage's remapper cannot
        // parse `.d.mts` (e.g. src/utils/irl/extract-markdown.d.mts) as JS.
        '**/*.d.mts',
        // Browser-only modules — covered by E2E (Playwright), not unit tests.
        // These files depend on DOM APIs, Canvas, localStorage, or Clipboard
        // that vitest's node environment cannot execute.
        'src/utils/copy-feedback.ts',
        'src/utils/mcp-onboarding.ts',
        'src/utils/mcp-docs.ts',
        'src/utils/scroll-spy.ts',
      ],
      thresholds: {
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // astro:env virtual modules don't exist outside Astro's build pipeline.
      // Map them to test stubs that export undefined for all vars (tests use
      // configOverride or set values via vi.mock).
      'astro:env/server': path.resolve(__dirname, './tests/__mocks__/astro-env-server.ts'),
      'astro:env/client': path.resolve(__dirname, './tests/__mocks__/astro-env-client.ts'),
      'astro:middleware': path.resolve(__dirname, './tests/__mocks__/astro-middleware.ts'),
    },
  },
});
