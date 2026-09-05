import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  testDir: './tests/e2e',
  testMatch: '**/*.test.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'html',
  timeout: 45000,
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 20000,
    actionTimeout: 10000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Start dev server for E2E tests
  webServer: [
    {
      // `npx astro dev`, not `npm run dev` (which is the same command). On
      // Windows Playwright kills the process it spawned, and `npm run` puts a
      // shell between Playwright and node, so the real server outlived every
      // run, was REUSED by the next one, and twice died mid-run (connection
      // refused on 4321 for the rest of the suite). npx hands node straight to
      // Playwright.
      //
      // ONE server, deliberately. BL-153 briefly added a second `astro dev` on
      // 4326 (with `PUBLIC_I18N_LIVE_LOCALES` forcing the translations live) for
      // tests/e2e/localization.test.ts. In CI both servers boot cold and share
      // `node_modules/.vite`, and one's dependency re-optimization invalidated
      // the other's hashes: 4321 answered TechPar's `import('chart.js')` with
      // `504 Outdated Optimize Dep`, the legend rendered empty, and the suite
      // went red in two consecutive runs (2026-09-05, trace-confirmed). Never
      // run two Vite dev servers against the same checkout in one Playwright
      // run. The localization spec runs here like every other spec; `es` and
      // `pt-BR` are live in the registry, and the spec's first test fails loudly
      // if fewer than two locales are live (LOCALIZATION.md § Testing).
      command: 'npx astro dev --port 4321',
      url: 'http://localhost:4321',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      // Astro 7 backgrounds `astro dev` by default outside CI: the parent
      // process forks a daemon and exits, which Playwright reports as
      // "Process from config.webServer exited early" whenever 4321 is NOT
      // already running (a cold local start). Foreground it.
      env: { ASTRO_DEV_BACKGROUND: '0' },
    },
  ],
});
