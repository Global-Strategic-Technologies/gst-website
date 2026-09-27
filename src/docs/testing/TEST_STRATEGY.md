# GST Website - Test Strategy

What to test at each tier, and how. Commands, the CI pipeline and the required checks live in [DEVELOPER_TOOLING.md](../development/DEVELOPER_TOOLING.md); what CI runs for tests is summarized in [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md); E2E anti-patterns are catalogued in [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md).

The site is mostly static Astro with vanilla TypeScript interactivity, plus one on-demand SSR route (`/hub/radar`). That shape drives the tiers below.

---

## 1. TESTING APPROACH & PHILOSOPHY

### Test Pyramid for Static Sites

```
         E2E Tests
       (UI/UX/Journey)
        /           \
       /   15-20%   \
      /_______________\
     /                  \
    / Integration Tests   \
   /   (Component Flow)   \
  / _____________________  \
 /                         \
/   Unit Tests (60-70%)     \
/__________________________\
```

For **Astro static sites**, the pyramid is inverted from traditional SPAs:

- **60-70% Unit Tests:** Utility functions, data transformations, component logic
- **15-20% Integration Tests:** Component interactions, filtering logic, event handling
- **10-15% E2E Tests:** Critical user journeys (search, filter, modal interactions)

### Why This Approach for Astro?

1. **Components are pure HTML at runtime** - No framework lifecycle to test
2. **Complex logic is in JavaScript modules** - Unit test the logic separately
3. **Interactions are DOM-based** - Need integration tests for event handling
4. **Static rendering is reliable** - Less need for E2E snapshot testing
5. **Build-time safety is high** - TypeScript catches many errors early

The practical rule that follows: **logic that can be a pure function should be one**, exported from `src/utils/` (or `src/data/`) and tested at the unit tier. An inline predicate inside an `.astro` `<script>` can only be reached by E2E, which is the slowest and least precise place to pin a truth table.

---

## 2. TOOLCHAIN

| Tool                       | Used for                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vitest**                 | Unit and integration tiers. Vite-native, TypeScript without extra config. `globals: true` supplies `describe`/`it`/`expect`/`vi`; value imports from `'vitest'` are lint-banned |
| **`@vitest/coverage-v8`**  | Line coverage over `src/utils/**` and `src/data/**/*.ts` (threshold in `vitest.config.ts`)                                                                                      |
| **Playwright**             | E2E tier — chromium, firefox and webkit projects against a dev server                                                                                                           |
| **`@axe-core/playwright`** | Accessibility scans inside the E2E tier (§ 3.3)                                                                                                                                 |
| **No Testing Library**     | Astro components render to static HTML, so there is no component runtime to mount; Playwright locators cover the DOM                                                            |

---

## 3. TEST COVERAGE BY TIER

### 3.1 Unit Tests (Utilities & Helpers)

**What belongs here:** pure functions and data. Engines (`techpar-engine`, `icg-engine`, `tech-debt-engine`, `diligence-engine`), URL-state encoders (`diligence-url`, `radar-url`), filtering (`filterLogic`), data validation of the JSON under `src/data/` (`data-validation`, `regulatory-map-data`, `palettes-data`), i18n helpers, and the Claude review-gate hooks (`claude-hooks`). Mock anything with I/O.

**Examples from the suite:**

```typescript
// tests/unit/filterLogic.test.ts — globals, no vitest import
import { categorizeGrowthStage } from '@/utils/filterLogic';

describe('categorizeGrowthStage', () => {
  it('buckets a scaling-stage label as growth', () => {
    expect(categorizeGrowthStage('Scale-up')).toBe('growth');
  });
});

// tests/unit/techpar-engine.test.ts
describe('compute() null guards', () => {
  it('returns null when arr is 0', () => {
    // ...
  });
});
```

Engines that a browser-only module wraps (`techpar-ui.ts`, `techpar/chart.ts`, `techpar/dom.ts`, …) are excluded from coverage in `vitest.config.ts` and covered by E2E instead.

---

### 3.2 Integration Tests (Guards & Contracts)

**What belongs here:** tests that read **real files** and assert a contract between two of them, or between a file and a rule. Most are guards: they fail when two sources that must agree drift apart, and nothing else would notice.

| Family                    | Examples                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Docs                      | `docs-link-integrity`, `docs-variables-sync`, `design-sync-guards` (these run as `npm run test:docs`, a required check)                   |
| Design tokens and CSS     | `spacing-token-floor`, `spacing-lint-rule`, `touch-target-floor`, `ink-token-contrast`, `frost-token-floor`, `font-token-pin`             |
| CI workflows              | `workflow-chain-integrity`, `workflow-paths-parity`, `workflow-secret-scope`, `workflow-parse-guards`, `await-mcp-test-run`               |
| MCP server ↔ website      | `mcp-*-parity`, `mcp-published-tool-count`, `mcp-generated-bundle-freshness`, `mcp-root-program-boundary`, `techpar-mcp-wizard-roundtrip` |
| Component data contracts  | `toc-component`, `filter-drawer-data-contract`, `portfolio-filter-pipeline`, `irl-pipeline`, `diligence-wizard-navigation`                |
| Dependencies, i18n, other | `overrides-honoured`, `i18n-catalog-parity`, `google-analytics-wiring`, `announcement-anchor`                                             |

**Shared helpers** live in `tests/integration/helpers/` — `astro-markup` (reduce an `.astro` file to its rendered markup), `css-parse` (CSS-source parsers), `mcp-registry` (what the server registers), `workflow-parse` (hand parsers for `.github/workflows/*.yml`). A new guard reuses them; **no test imports another test file**, because importing a `*.test.ts` registers its suite twice.

Astro components cannot be rendered in Vitest. When a component's data contract matters, either test the source file as text (as the markup-parity guards do) or mirror its serialization logic in the test and say so in the header (as `toc-component` does), with the E2E spec proving the rendered result.

**A good guard** fails with a message that names the file and the fix, proves by mutation (or a known-present case) that it can fail at all, and asserts exact matches — `=== 1`, not "at least one".

---

### 3.3 E2E Tests (User Journeys)

**What belongs here:** journeys a visitor takes, and anything that needs a real browser — layout, focus, scroll, theme, storage. One spec file per page or feature, under `tests/e2e/`. Read [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md) before writing or fixing one.

| Area                    | Specs                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing pages         | `homepage`, `about-page`, `terms-page`, `404-page`, `booking-confirmed`, `cta-section`, `stats-bar-fit`, `announcement-sash`                             |
| Portfolio               | `portfolio-filtering`, `project-details`, `portfolio-drawer-scroll`, `filter-drawer-layering`                                                            |
| Hub tools               | `techpar`, `diligence-machine`, `infrastructure-cost-governance`, `tech-debt-calculator`, `regulatory-map*`, `hub-tools-irl-*`, `hub-gateway-grid`       |
| Hub library, MCP, radar | `hub-library-*`, `hub-mcp-*`, `radar-page`, `radar-noindex`                                                                                              |
| Theme, palette, look    | `theme-toggle`, `theme-toggle-easter-egg`, `palette-panel*`, `daily-look`, `ambient-motion`, `hover-ink-invariance`, `frosted-glass`, `storage-baseline` |
| Chrome and layout       | `mobile-navigation`, `narrow-viewport-chrome`, `table-of-contents`, `print-chrome`, `brand-page`                                                         |
| Cross-cutting           | `accessibility`, `analytics`, `localization`                                                                                                             |

Shared helpers are in `tests/e2e/helpers/` — use `theme.ts` to read or change the theme (four states on `<html>`, ADR-0038), `palette.ts` for palettes, `a11y.ts` for axe, `radar.ts` for the radar content gate. Every context starts from the baseline `storageState` (`helpers/storage-baseline.ts`); a spec that tests the date-driven or first-visit defaults opts out explicitly.

#### Dual-Control Synchronization

Any UI surface that exposes **two** controls representing the same state — preset chip group + manual numeric input, segmented control + free-text override, slider + number input — forms a sync contract. Tests must cover **both** directions of the contract, because the forward path (the one the developer was thinking about while writing the feature) almost always works, and the reverse path (manual override → reconcile the chip/slider/toggle group) is the one that quietly rots.

**Affected surfaces in this codebase:**

- TechPar cost preset chips + numeric inputs (`data-preset-for` + `data-input`)
- ARR quick-select chips + ARR input
- Industry / currency / period segmented controls (toggle-group form)

**Why the reverse direction breaks:** the chip-click handler updates state and synchronously toggles the chip's `active` class. The input-typed handler usually updates state too — but a missing input-event listener for the same group leaves stale chip selections in place, telling the user "the preset is still in effect" when the actual submitted value is whatever they typed.

**Required test cases per dual-control pair:**

1. Forward — clicking control A updates control B and marks A active
2. Reverse — editing control B to a non-preset value deactivates A
3. Reverse-rematch — editing control B to match a different chip's value activates that chip and deactivates the prior
4. Clear — emptying control B deactivates every chip in the group
5. Idempotent re-type — re-typing the active chip's exact value leaves A active

See [TEST_BEST_PRACTICES.md § 27 — Dual-Control UI Where Only One Direction of Sync Is Tested](./TEST_BEST_PRACTICES.md) for the anti-pattern that motivates this subsection, and the `TechPar - Cost preset chip ↔ input sync` block in `tests/e2e/techpar.test.ts` for the reference implementation, parameterized over every TechPar cost control.

**Coverage Target:** 100% of dual-control pairs covered by all five cases.

#### Accessibility scans (axe)

`tests/e2e/accessibility.test.ts` scans every `PAGES` route with `checkA11y` (`tests/e2e/helpers/a11y.ts`):

- **Both themes (BL-162).** Each route runs once in light and once in dark, and the dark test is named `<name> (dark)`. The theme is applied as a real load and asserted before scanning; see [TEST_BEST_PRACTICES #29](./TEST_BEST_PRACTICES.md#29--toggling-htmldark-theme-to-measure-dark-colours). The orphan-class check runs in light only, because it does not depend on theme.
- **Decorative backgrounds are hidden during the scan.** Axe cannot judge contrast over a background image, so the body checkerboard left most text INCOMPLETE rather than failing it. The helper hides every selector in `DECORATIVE_BACKGROUNDS` for the scan only, then removes the style tag. Instrument tests prove it: injected low-contrast text fails with the checkerboard hidden and is INCOMPLETE with it visible. Pass `hideDecorativeBackground: false` to opt out.
- **Brand-teal text is exempt, by ruling.** `--color-primary` text sits below AA in light theme on purpose ([ADR-0035 § 1](../adr/0035-ink-tokens-for-text-on-light-surfaces.md)). `checkA11y` drops `color-contrast` nodes whose computed text colour is the page's resolved brand teal. It matches by colour, not selector or count, so new teal elements never need an entry, and it applies only down to 1.5:1 (shipped teal measures as low as 1.71:1), so near-invisible teal still fails. The instrument test proves teal passes, a one-channel-off teal fails, and faint teal fails. Do not "fix" teal text or baseline it.
- **`KNOWN_SERIOUS` is a ratchet keyed by test name.** An entry is an exact node count, enforced from both sides, and needs a reason comment. Fix at the token level first (ADR-0035 ink tokens).

A new page is added to the `PAGES` array in the same PR (CLAUDE.md § Adding a New Page).

---

## 4. TEST FILE ORGANIZATION

```
tests/
├── unit/                  # § 3.1 — pure functions and data
│   └── irl/               #   IRL article parsing parity
├── integration/           # § 3.2 — guards and contracts over real files
│   └── helpers/           #   astro-markup, css-parse, mcp-registry, workflow-parse
├── e2e/                   # § 3.3 — Playwright specs, one per page or feature
│   ├── helpers/           #   a11y, theme, palette, storage-baseline, radar, …
│   ├── global-setup.ts    #   no-op placeholders (the radar cache seed was retired)
│   └── global-teardown.ts
└── __mocks__/             # astro:env/server, astro:env/client, astro:middleware stubs
vitest.config.ts           # unit + integration (excludes tests/e2e/**)
playwright.config.ts       # e2e
```

There is no `tests/fixtures/` or `tests/visual/`; test data is built inline or read from `src/data/`. The MCP server's suite is separate — see [mcp-server/src/docs/testing/README.md](../../../mcp-server/src/docs/testing/README.md).

---

## 5. CONFIGURATION FILES

### 5.1 vitest.config.ts

```typescript
// Abridged — see the file for the coverage exclusions and alias reasoning.
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true, // supplies describe/it/expect/vi — never value-import them (TEST_BEST_PRACTICES pitfall 9)
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    coverage: {
      include: ['src/utils/**', 'src/data/**/*.ts'],
      thresholds: { lines: 70 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // astro:env / astro:middleware virtual modules → tests/__mocks__/ stubs
    },
  },
});
```

There is no `setupFiles`: each test sets up what it needs.

### 5.2 playwright.config.ts

```typescript
// Abridged — the file itself carries the reasoning for each setting.
import { defineConfig, devices } from '@playwright/test';
import { baselineStorageState } from './tests/e2e/helpers/storage-baseline';

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
    // Palette 0, light, picked today; ambient motion off (ADR-0039, ADR-0040).
    storageState: baselineStorageState({ ambient: 'off' }),
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'npx astro dev --port 4321',
      url: 'http://localhost:4321',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      env: { ASTRO_DEV_BACKGROUND: '0' },
    },
  ],
});
```

The baseline `storageState` keeps every spec off the date-driven default look; see [TEST_BEST_PRACTICES § 29](TEST_BEST_PRACTICES.md#29--toggling-htmldark-theme-to-measure-dark-colours).

---

## 6. ANALYTICS TESTS

GA4 is covered at all three tiers: `tests/unit/analytics.test.ts` and `tool-analytics.test.ts`, `tests/integration/google-analytics-wiring.test.ts`, and `tests/e2e/analytics.test.ts`.
What each covers, and how to debug event tracking, is in [ANALYTICS_TESTING.md](../analytics/ANALYTICS_TESTING.md).
