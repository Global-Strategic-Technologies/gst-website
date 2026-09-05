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
      command: 'npm run dev',
      url: 'http://localhost:4321',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      // Astro 7 backgrounds `astro dev` by default outside CI: the parent
      // process forks a daemon and exits, which Playwright reports as
      // "Process from config.webServer exited early" whenever 4321 is NOT
      // already running (a cold local start). Foreground it; the daemon it
      // would otherwise leave behind is also what used to outlive every run.
      env: { ASTRO_DEV_BACKGROUND: '0' },
    },
    // Second server, forced-live locales (BL-153). The language switcher and the
    // first-visit band render only while ≥2 locales are live, which production
    // is not yet; `tests/e2e/localization.test.ts` pins its baseURL to THIS
    // server. It is never reused: the operator's own 4321 server cannot carry
    // the env var, and `reuseExistingServer` on 4321 is what keeps that server
    // untouched by every other spec. `ASTRO_DEV_BACKGROUND=0` + `--ignore-lock`
    // let a second astro dev run beside the first (see feedback memory on dev
    // servers). Astro auto-increments a BUSY port, so if 4326 is taken this
    // comes up on 4327 and the spec's pinned URL misses it: free the port.
    {
      command: 'npx astro dev --port 4326 --ignore-lock',
      url: 'http://localhost:4326',
      reuseExistingServer: false,
      timeout: 60 * 1000,
      env: {
        ASTRO_DEV_BACKGROUND: '0',
        PUBLIC_I18N_LIVE_LOCALES: 'es,pt-BR',
      },
    },
  ],
});
