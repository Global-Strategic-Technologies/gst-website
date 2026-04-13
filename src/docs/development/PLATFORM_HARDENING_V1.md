# Platform Hardening V1

A 9-phase initiative to harden the GST website platform for the next 6 months of business growth. Addresses data validation, CI/CD, code structure, test coverage, accessibility, SEO, tool analytics, error monitoring, security, documentation, and a rolling miscellaneous-cleanup bucket for small drift items discovered along the way.

**Status**: Complete
**Created**: April 9, 2026
**Completed**: April 13, 2026
**Last Updated**: April 13, 2026
**Priority**: High
**Effort**: ~25-30 working days across 9 phases
**Goal**: Create a V1 platform that supports immediate business needs without structural friction

**Next Steps**: See [BUSINESS_ENABLEMENT_V1.md](./BUSINESS_ENABLEMENT_V1.md) for the follow-on initiative covering Cookie Consent / GDPR compliance and Email Capture.

---

## Table of Contents

1. [Data Integrity Layer](#phase-1-data-integrity-layer)
2. [CI/CD & Developer Guardrails](#phase-2-cicd--developer-guardrails)
3. [Code Structure & CSS Architecture](#phase-3-code-structure--css-architecture)
4. [Test Coverage & Accessibility](#phase-4-test-coverage--accessibility)
5. [SEO Hardening](#phase-5-seo-hardening)
6. [Hub Tool Analytics Standardization](#phase-6-hub-tool-analytics-standardization)
7. [Client-Side Error Monitoring](#phase-7-client-side-error-monitoring)
8. [Astro Platform Alignment, Security & Documentation](#phase-8-astro-platform-alignment-security--documentation)
9. [Miscellaneous Cleanup Bucket](#phase-9-miscellaneous-cleanup-bucket)
10. [Summary Timeline](#summary-timeline)
11. [Key Design Decisions](#key-design-decisions)
12. [Commit Strategy](#commit-strategy)
13. [Next Steps](#next-steps)
14. [Related Documentation](#related-documentation)

---

## Phase 1: Data Integrity Layer

**Status**: Complete
**Priority**: Critical
**Effort**: 3-4 days
**Dependencies**: None — this is the foundation

### Problem

Data correctness is the highest-ROI foundation. Every new project, regulation, or engine configuration change is a potential silent regression. Zod 4.3.6 is installed and proven for regulatory-map (120 JSON files validated at build time via `src/utils/fetchRegulations.ts`), but the other 5 data sources rely only on TypeScript interfaces — no runtime validation. Additionally, 19 instances of `any` type weaken type safety, most critically in filter logic and type guard functions.

### Scope

- **Zod schemas for all 6 data sources** — create `src/schemas/` directory:
  - `src/schemas/portfolio.ts` — schema for `Project`, replacing manual type guards (`isCurrency`, `isEngagementType`, etc.) in `src/types/portfolio.ts:119-148`
  - `src/schemas/techpar.ts` — schemas for stages, recommendations, signal-copy, industry-notes
  - `src/schemas/diligence.ts` — schemas for questions (952 lines), attention-areas, wizard-config
  - `src/schemas/icg.ts` — schemas for domains, recommendations
  - `src/schemas/index.ts` — barrel export
- **Build-time validation utility** — `src/utils/validateData.ts` with generic `validateDataSource<T>(schema, data, label)` modeled on `src/utils/fetchRegulations.ts:28-38`
- **Eliminate `as any` casts** — 19 instances in `src/`:
  - `src/utils/filterLogic.ts:99,104` — use type-safe `includes` helper instead of `as any`
  - `src/types/portfolio.ts:119,128,137,146` — type guard parameters
  - `src/utils/techpar-ui.ts` — Chart.js callback types (use proper `chart.js` types)
  - Remaining instances in analytics, abbreviate utilities
- **Tighten `GrowthStage` type** — `src/types/portfolio.ts:26` currently `GrowthStage = typeof GROWTH_STAGE_VALUES[number] | string` (the `| string` union defeats type safety)
- **Migrate `tests/unit/data-validation.test.ts`** — replace manual interface checks with Zod `schema.safeParse()` validation

### Commits

```
feat(schemas): add Zod schemas for portfolio data
feat(schemas): add Zod schemas for techpar, diligence, ICG data
feat(schemas): add build-time validation utility
refactor(types): eliminate as-any casts in filterLogic and portfolio types
refactor(types): tighten GrowthStage type to remove string escape hatch
refactor(types): replace any types in techpar-ui Chart.js callbacks
test(data): migrate data-validation tests to Zod-based validation
```

### Success Criteria

- `any` count in `src/` drops from 19 to ≤5
- All 6 data sources validated by Zod schemas at build time
- Build fails immediately on malformed data with human-readable error messages
- Existing tests continue to pass

---

## Phase 2: CI/CD & Developer Guardrails

**Status**: Complete
**Priority**: High
**Effort**: 3 days
**Dependencies**: Phase 1 (`any` elimination required before strict lint rules pass)

### Problem

The existing CI pipeline runs tests but has no linting, no type-checking beyond TypeScript compilation, no dependency auditing, and stylelint is configured but not wired into CI. No pre-commit hooks exist. This means debt can grow unchecked between phases.

### Scope

- **ESLint + Prettier** — no config exists today:
  - Install `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-astro`, `prettier`, `eslint-config-prettier`
  - Create `eslint.config.mjs` (flat config) with strict TypeScript rules
  - Create `.prettierrc` matching existing code style
  - Add `"lint"` and `"format"` scripts to `package.json`
- **Pre-commit hooks**:
  - Install `husky` + `lint-staged`
  - Configure lint-staged for `.ts`, `.astro`, `.css` files
  - Wire existing `stylelint` into hooks
- **Restructure CI pipeline** — 3-job parallel-then-gate structure in `.github/workflows/test.yml`:

  ```
  Lint & Type Check (~30-60s)  ──┐
                                  ├──> E2E Tests + axe (~17 min)
  Unit & Integration Tests (~14s) ──┘
  ```

  - **Job 1: Lint & Type Check** (new) — `astro check`, `npm run lint`, `npm run lint:css`, `npm audit --audit-level=moderate`
  - **Job 2: Unit & Integration Tests** (existing) — unchanged, runs in parallel with Job 1
  - **Job 3: E2E Tests** (existing) — `needs: [lint-and-typecheck, unit-and-integration]`
  - Net impact: ~1 minute added to total wall-clock time; lint failure surfaces in ~30-60s

- **Fix the `paths-ignore` / required-checks deadlock** — the current workflow uses `paths-ignore` for `**.md`, `src/docs/**`, and `.claude/**`, so docs-only PRs do not trigger any runs. But the master branch ruleset (`Protect master branch`, ID `12237842`) requires `Unit & Integration Tests` and `E2E Tests (Playwright)` to report success. When no run executes, no status is reported, and the PR is permanently blocked in "Expected — Waiting for status to be reported" state. **Observed during PR #78** (docs-only merge), requiring a temporary ruleset disable/re-enable to unblock. **Fix**: replace `paths-ignore` with the _dummy skip job_ pattern using `dorny/paths-filter@v3`:

  ```yaml
  jobs:
    changes:
      runs-on: ubuntu-latest
      outputs:
        code: ${{ steps.filter.outputs.code }}
      steps:
        - uses: actions/checkout@v5
        - uses: dorny/paths-filter@v3
          id: filter
          with:
            filters: |
              code:
                - '!(**.md|src/docs/**|.claude/**)'

    unit-and-integration:
      needs: changes
      runs-on: ubuntu-latest
      steps:
        - if: needs.changes.outputs.code == 'true'
          run: npm ci && npm run test:coverage
        - if: needs.changes.outputs.code != 'true'
          run: echo "Skipped — docs-only change"
  ```

  This keeps the required job names visible to branch protection (so they always report a status), while skipping the expensive work for docs-only changes. Same pattern applied to `lint-and-typecheck` and `e2e-tests`. Remove the `paths-ignore` blocks entirely from the `on:` section.

- **500 error page** — create `src/pages/500.astro` (only 404 exists; Radar SSR route has no branded error page)

### Commits

```
chore(lint): add ESLint flat config with typescript-eslint and astro plugin
chore(lint): add Prettier configuration
chore(lint): fix existing lint violations across codebase
chore(hooks): add husky pre-commit hooks with lint-staged
ci: restructure pipeline to 3-job parallel-then-gate architecture
ci: fix paths-ignore / required-checks deadlock with dummy skip jobs
feat(error): add branded 500 error page
```

### Success Criteria

- CI rejects lint/type/style/audit failures before E2E starts
- Pre-commit hooks prevent unformatted commits
- 500 page renders correctly in both themes
- Total pipeline wall-clock time increases by ≤1 minute
- Docs-only PRs merge cleanly without bypassing branch protection (verified by creating a test docs-only PR and confirming required checks report success within ~5s)

### Post-Merge Manual Steps

**⚠️ REQUIRED — do not skip.** These steps cannot be automated via commits because they depend on GitHub API state that only exists after merge to master.

#### 1. Update branch protection ruleset to require `Lint & Type Check`

**Why this is manual**: The `Lint & Type Check` status check didn't exist on `master` before Phase 2's CI restructure merged. Adding it to the required-checks list _before_ merge would block every PR waiting for a check GitHub doesn't yet recognize. Adding it _during_ merge would race against the first workflow run. The only safe ordering is: **merge the Phase 2 PR first, wait for at least one successful run of the new job on `master`, then update the ruleset.**

**When to execute**: After the first successful run of `Lint & Type Check` on `master` (typically within minutes of the Phase 2 PR merging). Check the Actions tab and confirm the job appears and succeeds.

**How to execute** (via `gh` CLI):

```bash
# 1. Fetch the current ruleset JSON and write it to a file
gh api /repos/reidperyam/gst-website/rulesets/12237842 > /tmp/ruleset.json

# 2. Edit /tmp/ruleset.json and add this entry to the
#    rules[].parameters.required_status_checks array inside the
#    `required_status_checks` rule object (the same array that already
#    contains "E2E Tests (Playwright)" and "Unit & Integration Tests"):
#
#    {
#      "context": "Lint & Type Check",
#      "integration_id": 15368
#    }
#
#    integration_id 15368 is GitHub Actions — use the same value as the
#    existing entries in the array.

# 3. PATCH the ruleset with the updated JSON
gh api --method PATCH /repos/reidperyam/gst-website/rulesets/12237842 \
  --input /tmp/ruleset.json
```

**Verification** (blocking — do not consider Phase 2 complete without this):

1. **Create a test docs-only PR**: touch any file under `src/docs/**` (e.g., a trailing whitespace change to a README), commit, push, open a PR to `master`.
2. **Confirm all three required checks appear** on the PR within ~10 seconds: `Lint & Type Check`, `Unit & Integration Tests`, `E2E Tests (Playwright)`.
3. **Confirm all three report success** (not "Expected — Waiting for status to be reported"). This proves both the ruleset update AND the skip-job pattern from Commit 10 work together.
4. **Merge or close the test PR**.

**If verification fails**: The ruleset update and the skip-job pattern are independent fixes. If checks hang in "Expected — Waiting" state, the skip-job pattern isn't working (investigate `dorny/paths-filter@v3` output). If checks never appear on the PR, the ruleset update didn't take effect (re-run the PATCH call, then re-check the ruleset via `gh api /repos/reidperyam/gst-website/rulesets/12237842`).

#### 2. Verify `Content config not loaded` warning is silenced

**Why this is manual**: This is a dev-server-only warning (not a CI check), so it has no automated test. Astro 6 requires `src/content.config.ts` even when no collections are defined. Phase 2 creates a minimal empty file, but the warning only disappears on a fresh `astro dev` startup — no commit can verify it.

**How to verify**:

```bash
# Kill any running dev server, then restart
npm run dev
```

Confirm the startup output does NOT include:

```
[WARN] [content] Content config not loaded
```

If it still appears, confirm `src/content.config.ts` exists and exports `export const collections = {}`. This file will be populated by Phase 8's regulatory-map content collection migration.

---

## Phase 3: Code Structure & CSS Architecture

**Status**: Complete
**Priority**: High
**Effort**: 6-7 days
**Dependencies**: Phase 2 (linting catches regressions during refactoring)

### Problem

`global.css` is 5,511 lines mixing genuinely global concerns with component-specific styles. Large components (`brand.astro` 3,778 lines, `PortfolioHeader.astro` 869, `StickyControls.astro` 785, `techpar-ui.ts` 1,473) make code review painful and merge conflicts likely. Duplicated patterns exist across 10 pages (print report header) and 3+ files (card markup).

A **critical tooling gap** also exists: the current stylelint configuration only lints `src/styles/*.css` and does not parse `<style>` blocks inside `.astro` files. After this phase migrates ~4,600 lines of component CSS into scoped blocks, those styles would become a linting blind spot — this must be fixed **before** the migration begins.

### CSS Strategy

**Follow Astro conventions: scoped `<style>` tags.** The project already uses Astro scoped styles in 41 components and pages (23 components + 18 pages). CSS custom properties defined in `variables.css` cascade into scoped `<style>` blocks because Astro uses generated class attributes (not shadow DOM). Benefits over `@import` splitting:

- Automatic dead CSS elimination (Astro only ships styles for rendered components)
- Co-located discoverability (styles live with their component)
- Collision safety (scoped by default, explicit via `:global()` when needed)
- Deleting a component automatically removes its styles

**Three foundation tooling changes land first** (commits 0a–0d) to make the migration safe and turn Phase 3 discipline into permanent guardrails:

1. **stylelint coverage for `.astro` scoped styles** via `postcss-html` + `stylelint-config-html/astro` — closes the linting blind spot before it opens
2. **CSS `@layer` cascade layers** (`reset, tokens, utilities, components, theme, overrides`) — establishes a declarative ordering scheme for cascade management within `global.css`. **Correction to original research claim**: unlayered rules (including Astro scoped `<style>` blocks) beat ALL layered rules per CSS Cascading Level 5, so the earlier assertion that "theme layers cleanly win over unlayered scoped rules" was backwards. Palette and dark-theme overrides continue to work via CSS custom property redefinition (`html.dark-theme { --color-foo: bar; }`), which cascades through property inheritance and does not depend on selector specificity or layer membership at all. Layer adoption is therefore **progressive and organizational**: commit 0b reserves the layer names via a top-of-file `@layer` declaration; subsequent commits 5-10c wrap sections of `global.css` in their appropriate layers as part of the scoped-style migration. Baseline High since Sept 2024; 95%+ global support
3. **Complexity rules for scoped styles only** — re-enable `no-descending-specificity`, `max-nesting-depth: 3`, `selector-max-compound-selectors: 4`, and `selector-max-specificity: "0,3,0"` in an `.astro`-only stylelint override (these are too noisy globally but cheap wins in naturally bounded scoped blocks)
4. **LightningCSS as the Vite CSS transformer** — replaces esbuild's default CSS pipeline with a single Rust-based tool that handles autoprefixing, minification, modern-CSS down-leveling (nesting, `oklch()`, `color-mix()`, `light-dark()`), and stricter syntax validation. Opt-in via one line in `astro.config.mjs`; reversible in seconds. Gives legacy cruft in `global.css` a free cleanup as a side effect of every subsequent Phase 3 commit.

A **final guardrail commit** (commit 14) adopts `stylelint-declaration-strict-value` for colors to mechanically enforce the "no hardcoded colors" rule from CLAUDE.md on every future commit.

### Scope

**Foundation tooling (commits 0a–0d, land first):**

- **Add stylelint coverage for `.astro` scoped styles** — install `postcss-html` and `stylelint-config-html`; add an `overrides` block in `.stylelintrc.json` that applies `stylelint-config-html/astro` + `customSyntax: "postcss-html"` to `**/*.astro`; update `lint:css` script glob to `src/**/*.{css,astro}`; update `lint-staged` entry; update [DEVELOPER_TOOLING.md](DEVELOPER_TOOLING.md) per directive #12
- **Introduce CSS `@layer` cascade layers** — add `@layer reset, tokens, utilities, components, theme, overrides;` to `global.css`; wrap existing globals (`variables.css` in `tokens`, `typography.css` + `interactions.css` in `utilities`, `palettes.css` in `theme`, `html.dark-theme` overrides in `theme`) in their respective layers; scoped component styles stay unlayered so theme/overrides layers cleanly win without specificity escalation. **No style value changes** — this commit is pure organization.
- **Enable complexity rules for `.astro` override only** — in the new `.astro` stylelint override block, turn on `no-descending-specificity: true`, `max-nesting-depth: [3, { ignoreAtRules: [media, supports, container] }]`, `selector-max-compound-selectors: 4`, `selector-max-specificity: "0,3,0"`, `declaration-block-no-shorthand-property-overrides: true`, `shorthand-property-no-redundant-values: true`, `declaration-block-no-redundant-longhand-properties: true`. Scoped blocks are naturally bounded, so these rules cost little and catch the exact drift that made `global.css` unmanageable.
- **Opt into LightningCSS** via `vite.css.transformer: "lightningcss"` in `astro.config.mjs`; `npm install --save-dev lightningcss`. Verify `npm run build` output diff is clean and bundle size trends down. Reversible in one line.

**Code structure scope:**

- **Slim down `global.css` to genuinely global concerns** (~300 lines):
  - Keep: reset/box-sizing, skip-nav, body/html base styles, checkerboard `body::before`, container/layout utilities, `html.dark-theme` variable overrides, global responsive breakpoints for container utilities, print base rules
  - Move to scoped component styles: `.site-header` rules → `Header.astro`, `.tool-methodology` → tool pages or shared component, hero styles → `Hero.astro`, portfolio grid/filter styles → portfolio components, tool-specimen block → `brand.astro` scoped (split into 3 sub-commits by section for safer review and rollback)
- **Keep `variables.css`, `typography.css`, `interactions.css`, `palettes.css` as global imports** — design tokens and utility classes that genuinely need global scope
- **Use `:global()` sparingly** — only for parent→slotted-child styling; `is:global` only for `<html>`/`<body>` (like ThemeToggle)
- **Create z-index scale** in `variables.css`:
  ```css
  --z-base: 1;
  --z-sticky: 10;
  --z-dropdown: 20;
  --z-overlay: 50;
  --z-modal: 1000;
  --z-modal-overlay: 1001;
  --z-skip-nav: 10000;
  ```
  Replace raw values (current chaos includes 9999, 10001, 10000, 1002, 60, 30, 8, 5 across multiple files) with these tokens in the same commit.
- **Extract shared portfolio filter logic** — `PortfolioHeader.astro` inlines keyword arrays (`growthKeywords`, `matureKeywords`, `valueCreationTypes`, `technicalDiligenceTypes`) that duplicate what `StickyControls.astro` already imports from `filterLogic.ts`; align PortfolioHeader to use the same centralized utilities (~25 lines removed). Diff arrays for behavior parity before switching.
- **Extract `<PrintReportHeader />` component** — identical 17-line block repeated across **10 pages** (about, privacy, terms, services, ma-portfolio, hub/library/business-architectures, hub/library/vdr-structure, hub/radar, hub/tools/regulatory-map, hub/tools/tech-debt-calculator); create `src/components/PrintReportHeader.astro` with a `title` prop; move the ~30-line CSS block from `global.css` into the component (~140 lines saved)
- **Extract `<Card />` component with deep variant unification** — consolidate near-identical card patterns via base class `<Card variant="service|audience|trust|hub">` across `services.astro` (7 cards: 3 service-card + 4 audience-card), `WhyClientsTrustUs.astro` (4 trust-cards), `hub/index.astro` (3 hub-cards). Base component owns the shared `brutal-frosted` shell; variants own top-border vs left-border accents and icon/CTA shape differences. ~60+ lines saved.
- **Decompose `brand.astro`** — split 3,778-line page (~3,600 inline lines after existing extractions) into ~6-8 sub-components under `src/components/brand/` (sections: brand identity, colors, typography, spacing, shadows, transitions, components, states)
- **Modularize `techpar-ui.ts`** — split 1,474 lines into:
  - `src/utils/techpar/chart.ts` — Chart.js config, dataset builders, trajectory computation & rendering
  - `src/utils/techpar/dom.ts` — DOM manipulation, event binding, tab navigation, copy/export utilities
  - `src/utils/techpar/state.ts` — state management, input parsing, scenario management, URL state hydration
  - `src/utils/techpar-ui.ts` — thin re-export barrel preserving all public names used by `hub/tools/techpar/index.astro`
- **Extract magic numbers** — maturity thresholds (25, 50, 75), z-index values, modal ID suffixes into named constants

**Final guardrail (commit 14):**

- **Adopt `stylelint-declaration-strict-value`** for color enforcement — `npm install --save-dev stylelint-declaration-strict-value`; add rule `"scale-unlimited/declaration-strict-value": [["/color$/", "fill", "stroke", "background", "/^border/"], { "ignoreVariables": true, "ignoreValues": ["transparent", "inherit", "currentColor", "none", "unset", "initial", "0"], "severity": "warning" }]`. Start at `warning` severity for a week of real commits, then promote to `error`. Spacing/typography enforcement via `expandShorthand` deferred to Phase 9 backlog — it needs a larger allowlist and shouldn't block the refactor.

### Commits

```
# Foundation tooling (must land before any style migration)
chore(lint): add stylelint coverage for .astro scoped styles via postcss-html           # 0a ✓
refactor(css): introduce @layer cascade layer scheme in global.css                      # 0b ✓
chore(lint): disable stylelint whitespace rules that fight Prettier                     # 0b.1 ✓
chore(lint): enable complexity rules for .astro scoped styles                           # 0c ✓
chore(build): opt into LightningCSS via Vite transformer                                # 0d ✓
fix(build): restore frosted glass — wire LightningCSS to browserslist                   # 0e ✓

# Infrastructure before migration
refactor(css): add z-index scale variables and replace magic values                     # 1 ✓

# Logic deduplication (small, self-contained)
refactor(portfolio): sync PortfolioHeader filter logic with filterLogic.ts              # 2 ✓

# Shared component extractions
feat(components): extract PrintReportHeader shared component                            # 3 ✓
# Card component extraction skipped — cards are already well-scoped,                    # 4 SKIP
# abstraction adds indirection with minimal CSS reduction (~40 lines)

# CSS migration (one domain at a time, each commit passes build + unit tests)
refactor(css): move header styles to Header.astro scoped                                # 5 ✓
refactor(css): move hero styles to Hero.astro scoped                                    # 6 ✓
refactor(css): remove dead services/about styles from global.css                        # 7 ✓
refactor(css): move stats/CTA/footer styles to scoped components                        # 8 ✓
# Portfolio filter migration skipped — styles are correctly shared between              # 9 SKIP
# PortfolioHeader and StickyControls (comment in global.css confirms)
refactor(css): move theme-toggle styles to ThemeToggle.astro scoped                     # 9a ✓

# Brand specimen migration deferred — analysis showed most brutalist CSS                # 10a-c DEFER
# classes are genuinely shared across the site (used by 10+ files), not
# brand-page-only. Will be addressed when brand.astro is decomposed.

# Large decompositions
refactor(brand): decompose brand.astro into section sub-components                      # 11 ✓
refactor(techpar): modularize techpar-ui.ts into chart, dom, state modules              # 12 ✓
fix(techpar): infra value corruption, tab-done/badge UX, regression tests              # 12a-d ✓

# Constants cleanup
refactor(icg): extract maturity magic numbers into named constants                      # 13 ✓

# Final guardrail — turn refactor discipline into permanent rule
chore(lint): enable strict-value color token enforcement (warning severity)             # 14 ✓
```

### Success Criteria

- `global.css` reduced to ≤300 lines of genuinely global styles
- No component >500 lines (tool pages may be ~800 with inline scripts)
- `npm run lint:css` covers `.astro` scoped styles (no linting blind spot)
- Stylelint complexity rules active in `.astro` override (no-descending-specificity, max-nesting-depth: 3, selector-max-compound-selectors: 4)
- `stylelint-declaration-strict-value` enforces var() for color properties (warning severity ready for promotion to error)
- `@layer` cascade lanes declared in `global.css`; palette and dark-theme overrides live in `theme`/`overrides` layers
- LightningCSS active as Vite CSS transformer; `npm run build` succeeds with no regression
- All unit and integration tests pass with zero assertion changes (refactor invariant)
- All existing E2E tests continue to pass when run at phase end (run explicitly, not per commit)

---

## Phase 4: Test Coverage & Accessibility

**Status**: Complete
**Priority**: High
**Effort**: 5 days
**Dependencies**: Phase 3 (decomposed components are easier to test)

### Problem

10 of 34 components have zero test coverage (Hero, CTASection, WhatWeDo, WhoWeSupport, WhyClientsTrustUs, StatsBar, EngagementFlow, PortfolioSummary, CompositeLogo, SEO). No automated accessibility testing exists — no axe-core in CI, and 10 components lack ARIA attributes or semantic landmarks.

### Scope

- **Unit tests for 10 untested components**:
  - `Hero.astro` — prop defaults and CTA rendering logic
  - `CTASection.astro` — link generation
  - `WhatWeDo.astro`, `WhoWeSupport.astro`, `WhyClientsTrustUs.astro` — data-driven rendering
  - `StatsBar.astro` — stat computation
  - `EngagementFlow.astro` — flow data
  - `PortfolioSummary.astro` — summary calculations
  - `CompositeLogo.astro` — basic render test
  - `SEO.astro` — JSON-LD output structure
- **Error path testing**:
  - Malformed input to engine `compute()` functions
  - Empty/null data arrays in filter functions
  - Network failures in `src/lib/inoreader/client.ts` and `cache.ts`
  - localStorage quota exceeded in theme/palette persistence
- **axe-core integration**:
  - Install `@axe-core/playwright`
  - Create shared `checkA11y()` helper in `tests/e2e/helpers/`
  - Run against 5 critical pages: homepage, portfolio, tool hub, one tool page, about
  - WCAG 2.1 AA enforcement with shrinking violations allowlist (ratchet)
- **ARIA attribute audit**:
  - Add `aria-live="polite"` to portfolio filter result counts
  - Add `aria-expanded` to collapsible sections
  - Add `aria-hidden="true"` to decorative DeltaIcon usage
  - Add missing landmark roles to Hero, CTASection, HubHeader
- **New `tests/e2e/accessibility.test.ts`** — axe scan of every page route; violations can only decrease

### Commits

```
test(unit): add tests for Hero, CTASection, homepage section components
test(unit): add tests for SEO component JSON-LD output
test(unit): add tests for PortfolioSummary and StatsBar
test(unit): add error path tests for engines and API clients
feat(a11y): integrate axe-core into Playwright E2E tests
fix(a11y): add ARIA attributes to 10 components missing landmarks
test(e2e): add accessibility test suite with violation ratchet
```

### Success Criteria

- Unit test files increase from 20 to 28+
- 70%+ coverage maintained with broader file coverage
- Zero critical/serious WCAG 2.1 AA violations on key pages
- axe-core integrated into CI pipeline

---

## Phase 5: SEO Hardening

**Status**: Complete
**Priority**: Medium
**Effort**: 1-2 days
**Dependencies**: Phase 2 (CI catches regressions), Phase 4 (heading fixes align with accessibility)

### Problem

The SEO foundation is strong (JSON-LD, canonical URLs, unique meta descriptions on all 16 pages, Open Graph + Twitter Cards), but concrete gaps affect social sharing quality and crawl signals. The sitemap is manually maintained (106-line XML), which risks stale `lastmod` dates.

### Scope

- **Fix Open Graph metadata across 10 pages** (~30 min) — only `services.astro` passes `ogImageAlt`; `about.astro` passes zero OG props. Add `ogTitle`, `ogDescription`, `ogImageAlt` to: index, about, hub/index, hub/tools/index, all 5 tool pages, hub/library/index
- **Fix hub/index.astro heading hierarchy** (~5 min) — jumps H1 → H3; add H2 wrappers for Tools, Library, Radar sections
- **Integrate `@astrojs/sitemap`** (~1 hour) — `site` property already set in `astro.config.mjs`; add integration, configure filter (exclude brand/responsive-frame), delete manual `public/sitemap.xml`
- **Font loading optimization** (~10 min) — add `font-display: swap` to `typography.css`; add `<link rel="preload">` for primary font in `BaseLayout.astro`
- **Preconnect to Calendly** (~2 min) — add `<link rel="preconnect" href="https://calendly.com">` in `BaseLayout.astro`
- **Evaluate Astro `<Image>` component** — only ~5 `<img>` tags across the site; adopt if straightforward, document decision if skipped

**Not pursuing** (documented decisions):

- **ViewTransitions** — UX enhancement, not SEO; adds complexity for minimal navigation
- **RSS feed** — Radar sources from Inoreader; would duplicate the source feed
- **`getStaticPaths`** — no dynamic collections; all routes are static

### Commits

```
fix(seo): add Open Graph metadata to 10 pages missing ogImageAlt
fix(seo): fix heading hierarchy on hub index page (H1 -> H2 -> H3)
feat(seo): integrate @astrojs/sitemap and remove manual sitemap.xml
perf(seo): add font-display swap and preconnect to Calendly
```

### Success Criteria

- All main pages pass custom OG metadata (verify with LinkedIn Post Inspector, Twitter Card Validator)
- Heading hierarchy validates with no H-level skips
- Sitemap auto-generates on build with correct URLs
- Lighthouse SEO score ≥ 95 on all pages

---

## Phase 6: Hub Tool Analytics Standardization

**Status**: Complete
**Priority**: Medium
**Effort**: 2 days
**Dependencies**: Phase 2 (CI catches regressions in analytics code)

### Problem

Tool analytics coverage was uneven. Diligence Machine had 8 tracked events, ICG had 11, Tech Debt Calculator had 6, but TechPar had **zero interaction events** and Regulatory Map used inconsistent naming without the standard `<tool>_<action>` prefix convention. This made tools incomparable and prevented funnel analysis.

### What Was Done

1. **Added `'tool'` to `EventCategory` type** — new tool events use `category: 'tool'` for independent GA4 filtering; existing events keep `'engagement'` for data continuity
2. **TechPar: 11 new events** — `tp_start`, `tp_tab_change`, `tp_mode_change`, `tp_stage_select`, `tp_baseline_set`, `tp_scenario_save`, `tp_complete` (with zone + tech_pct), `tp_copy_link`, `tp_copy_summary`, `tp_export_pdf`, `tp_reset`
3. **Regulatory Map: renamed 7 events** to `rm_` prefix — `rm_region_zoom`, `rm_region_select`, `rm_filter_change`, `rm_search_result_click`, `rm_search`, `rm_timeline_click`, `rm_faq_toggle`; added `rm_start` and `rm_complete` funnel events
4. **DM and TDC funnel events** — added `dm_start`, `tdc_start`, `tdc_complete`
5. **16 unit tests** — static analysis tests verify naming convention, prefix consistency, funnel event presence, and snake_case compliance across all 5 tools

### Post-Phase Coverage

| Tool                 | Prefix | Events | Funnel (start/complete/export)  |
| -------------------- | ------ | ------ | ------------------------------- |
| TechPar              | `tp_`  | 11     | Yes (start/complete/export)     |
| Regulatory Map       | `rm_`  | 9      | Yes (start/complete)            |
| Diligence Machine    | `dm_`  | 8      | Yes (start/generate/copy+print) |
| Tech Debt Calculator | `tdc_` | 9      | Yes (start/complete/export)     |
| ICG                  | `icg_` | 13     | Yes (start/complete/export)     |

### Commits

```
feat(analytics): add tool event category to analytics type system
feat(analytics): add interaction tracking to TechPar tool
refactor(analytics): standardize Regulatory Map event naming
feat(analytics): add start/complete funnel events to DM and TDC
test(analytics): add naming convention tests for all hub tool events
docs(analytics): update hardening plan and analytics docs for Phase 6
```

### Notes

- All events will be retroactively gated on cookie consent by the follow-on [BUSINESS_ENABLEMENT_V1.md](./BUSINESS_ENABLEMENT_V1.md) initiative; this phase does not worsen the existing GDPR gap (GA4 already loads unconditionally) but does not close it either
- Existing DM/ICG/TDC events retain `category: 'engagement'` for GA4 data continuity
- RegMap old event names (`quick_zoom`, `region_selected`, etc.) will stop appearing in GA4; new `rm_` names start fresh

---

## Phase 7: Client-Side Error Monitoring

**Status**: Complete
**Priority**: Medium
**Effort**: 2 days
**Dependencies**: Phase 2 (CI catches instrumentation regressions)

### Problem

Tool calculation failures, Inoreader API errors, and localStorage failures were completely invisible. The codebase used defensive null-checks and try-catch with silent fallbacks (good for UX, bad for observability).

### Why not Vercel?

Vercel's existing observability stack (Web Analytics, Speed Insights, Runtime Logs) does **not** cover this gap. Here's the breakdown:

| Vercel Product                   | What it tracks                                  | Covers client-side errors?                                      |
| -------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Web Analytics (already enabled)  | Page views, visitor counts                      | No                                                              |
| Speed Insights (already enabled) | Core Web Vitals (LCP, CLS, FCP, TTFB)           | No — performance only                                           |
| Runtime Logs                     | Server-side `console.log/error` from SSR routes | Partial — only the Radar SSR route, not anything in the browser |
| Observability / Log Drains       | Pipes server logs to external services          | No — same scope as Runtime Logs                                 |

**The critical gap**: Vercel monitors the server side. GST is almost entirely static HTML + client-side JavaScript — all tool calculations happen in the user's browser, not on Vercel's servers. When those fail, Vercel never sees them. Sentry fills this gap; the two are complementary, not overlapping.

### Manual setup (one-time, ~15 minutes, performed by a human before implementation begins)

These steps must be completed **before** the implementation commits can be merged, because the code requires `PUBLIC_SENTRY_DSN` to be configured in Vercel. Claude cannot perform these steps.

1. **Create a Sentry account**
   - Sign up at https://sentry.io (free tier: 5K errors/month, no credit card required)
   - Create an organization, e.g., `global-strategic-technologies`

2. **Create a Sentry project**
   - Click "Create Project"
   - Platform: select **Astro** (first-class integration via `@sentry/astro`)
   - Project name: `gst-website`
   - Alert frequency: "Alert me on every new issue" (can be tuned later)
   - Copy the **DSN** shown on the setup page — it looks like `https://abc123@o456789.ingest.sentry.io/1234567`
   - The DSN is a public identifier (safe to expose in client-side code); it only grants permission to _send_ errors to your project, not read or modify them

3. **Add the DSN to Vercel environment variables**
   - Go to Vercel dashboard → `gst-website` project → Settings → Environment Variables
   - Add a new variable:
     - **Name**: `PUBLIC_SENTRY_DSN`
     - **Value**: the DSN from step 2
     - **Environments**: check "Production" and "Preview"; leave "Development" unchecked (local dev should not send errors)
   - The `PUBLIC_` prefix is required so Astro exposes the variable to the client-side bundle (see [Astro env vars docs](https://docs.astro.build/en/guides/environment-variables/))

4. **Configure Sentry alert rules** (optional but recommended — can be done after deployment)
   - In Sentry: Alerts → Create Alert → Issue Alert
   - Recommended rules:
     - "When a new issue is first seen" → notify email
     - "When >10 events in 1 hour on tag `area:techpar-calculation`" → notify email
     - "When any event occurs with tag `area:inoreader-api`" → notify email
     - "When any event occurs with tag `area:redis-connection`" → notify email
   - Tags are set in the `Sentry.captureException()` calls during implementation

5. **Optional: configure source maps upload**
   - If stack traces in the Sentry dashboard show minified code, add a Sentry auth token to Vercel (`SENTRY_AUTH_TOKEN`) and enable source map upload in `astro.config.mjs` per the `@sentry/astro` docs
   - Can be deferred until first error is debugged

**Verification**: After setup, the Vercel project should have `PUBLIC_SENTRY_DSN` listed in environment variables, and Sentry should show an empty "gst-website" project waiting for its first event.

### Scope

- **Evaluate and integrate Sentry**:
  - `@sentry/astro` provides first-class Astro integration (auto-instruments page loads, errors, performance)
  - Alternative: lightweight `@sentry/browser` if full integration is too heavy
  - Selection criteria: free tier (5K errors/month), Astro plugin, source map support, Vercel compatible
  - Document the decision
- **Create `src/components/ErrorTracking.astro`**:
  - Loaded in `BaseLayout.astro` head (before `GoogleAnalytics.astro`)
  - DSN from environment variable (`PUBLIC_SENTRY_DSN`)
  - Disabled in development
  - Use **privacy-first config**: no PII, no session replay, errors only. This allows Sentry to run pre-consent under legitimate-interest basis (error monitoring is not tracking). The follow-on [BUSINESS_ENABLEMENT_V1.md](./BUSINESS_ENABLEMENT_V1.md) initiative will evaluate whether to additionally gate Sentry on consent once the banner ships.
- **Instrument existing silent failures** — add `Sentry.captureException()` alongside existing graceful fallbacks:
  - `src/lib/inoreader/client.ts` — API fetch failures, token refresh, timeouts
  - `src/lib/inoreader/cache.ts` — Redis connection failures
  - `src/scripts/palette-manager.ts` — localStorage access failures
  - `src/utils/techpar-ui.ts` — Chart.js rendering errors
  - Tool page inline scripts — calculation errors
- **Global error boundary** — `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)` in ErrorTracking.astro
- **Alert rules** (documentation only) — recommended alerts: >10 errors/hour on tool pages, any Radar SSR error, any Redis failure
- **Tests**:
  - Unit: verify privacy-first config (no PII fields captured); `captureException` called on instrumented paths
  - E2E: error tracking loads in production; no errors on clean page loads (baseline)

**Not pursuing**: Session replay (LogRocket, Sentry Replay) — adds significant bundle size and privacy complexity for a low-traffic advisory site.

### What Was Done

1. **Installed `@sentry/astro`** — official Astro integration via `astro.config.mjs`, auto-handles client+server
2. **Privacy-first client config** (`sentry.client.config.ts`): `sendDefaultPii: false`, `tracesSampleRate: 0`, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0` (error replay only), `beforeSend` filter for browser noise (ResizeObserver, localStorage SecurityError)
3. **Server config** (`sentry.server.config.ts`): error-only, no tracing
4. **Source map upload slot** wired up in astro.config.mjs — activate by adding `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` to Vercel
5. **Instrumented 15 error paths**: 9 in Inoreader client (area:inoreader-api, area:redis-connection), 2 in file cache (area:file-cache), 3 in palette-manager (area:palette-manager), 2 in TechPar chart rendering (area:techpar-calculation)
6. **20 unit tests** verifying config policy and instrumentation coverage

### Commits

```
feat(monitoring): add Sentry integration with error replay
feat(monitoring): instrument Inoreader client and cache error paths
feat(monitoring): instrument client-side error paths
test(monitoring): add Sentry instrumentation verification tests
docs(monitoring): update hardening plan and developer tooling for Phase 7
```

### Success Criteria

- Client-side JavaScript errors surfaced in Sentry dashboard ✓
- Silent failures in Inoreader client, palette manager, and tool scripts report to Sentry ✓
- Privacy-first Sentry config verified (no PII, error-only replay, no tracing) ✓
- Zero increase in console errors visible to users ✓
- Sentry DSN configured via environment variable (not hardcoded) ✓

---

## Phase 8: Astro Platform Alignment, Security & Documentation

**Status**: Complete
**Priority**: Low
**Effort**: 3 days
**Dependencies**: Phase 1 (Zod schemas for content collections), Phase 5 (sitemap integration), Phases 6-7 (security headers should account for new analytics and error monitoring scripts)

### Problem

Developer experience gaps (manual sitemap, no content collections, no security headers) and documentation inconsistencies (2 of 6 doc directories have no entry point, 8+ orphaned docs, ~60% content overlap between CI_CD_SUMMARY and GITHUB_ACTIONS_SETUP) create friction that compounds over time.

### Scope

- **Astro content collections for regulatory-map** — migrate 120 JSON files from `src/data/regulatory-map/` to `src/content/regulatory-map/` with Astro's built-in collection validation. Replaces manual `import.meta.glob` + Zod in `fetchRegulations.ts`. No `src/content/` directory exists yet.
- **Security headers** — `vercel.json` with CSP, X-Frame-Options (`DENY`), X-Content-Type-Options (`nosniff`), Referrer-Policy (`strict-origin-when-cross-origin`), Permissions-Policy (disable camera, microphone, geolocation). Astro middleware (`src/middleware.ts`) for SSR routes (Radar).
- **Evaluate `client:visible` for Chart.js** — **Evaluated and deferred**. `client:visible` requires framework components (React/Vue/Svelte); TechPar uses vanilla JS scripts, so the directive doesn't apply. Dynamic import (`import('chart.js')`) is the alternative but adds async complexity for marginal gain — Chart.js only loads on the TechPar page and Vite already code-splits it into a separate chunk. No action needed.
- **Documentation restructure** — normalize all 6 doc directories:

  **Standard structure** (every directory follows the same pattern):

  ```
  src/docs/
  ├── README.md                ← master index linking all directories
  ├── {area}/
  │   ├── README.md            ← REQUIRED: overview, doc table, use-case routing
  │   └── {CONTENT}.md         ← content docs (no INDEX.md, no redundant entry points)
  ```

  **Standard README template** (4 sections):
  1. Title & one-line purpose
  2. Doc table — every file with purpose, read time, audience
  3. Use-case routing — "I need to do X → go here"
  4. Quick facts — key metrics or status

  **Specific changes**:
  - `src/docs/README.md` (new) — master index
  - `hub/README.md` (new) — maps tools to their 4 orphaned technical docs
  - `styles/README.md` (new) — entry point for 5 style docs
  - `testing/README.md` (update) — merge INDEX.md content; delete INDEX.md
  - `seo/INDEX.md` (rename) — rename to README.md
  - `analytics/README.md` (update) — fix root README to point here
  - `development/README.md` (update) — list all docs with status badges
  - Consolidate CI_CD_SUMMARY.md into GITHUB_ACTIONS_SETUP.md (~60% overlap)
  - Fix broken link to archived DESIGN_SYSTEM_COMPLETENESS.md
  - Update CLAUDE.md for renamed paths

### Commits

```
feat(astro): migrate regulatory-map data to Astro content collections
feat(security): add vercel.json with security headers
feat(security): add Astro middleware for SSR route security headers
docs: add master docs README and normalize directory entry points
docs: consolidate CI_CD_SUMMARY into GITHUB_ACTIONS_SETUP
docs: update development README with complete initiative listing
docs: fix broken references and update CLAUDE.md paths
```

### Success Criteria

- Regulatory map served via content collections with zero behavior change
- Security headers on all responses (securityheaders.com B+ or better)
- No performance regression
- Every doc directory has exactly one README.md following the standard template
- Zero orphaned docs; zero broken cross-references

---

## Phase 9: Miscellaneous Cleanup Bucket

**Status**: Complete
**Priority**: Low
**Effort**: ~1 day (grows during execution; cap at 1 day before deferring overflow to a follow-on initiative)
**Dependencies**: All prior phases complete — Phase 9 is the final sweep of the hardening initiative
**Execution**: Independent standalone phase, executed after Phase 8 completes. Each backlog item becomes its own commit so revert is granular.

### Purpose

Earlier phases routinely surface small drift items — outdated counts in docs, legacy field names, dead helpers, comment-vs-code mismatches — that don't fit any single phase's theme but are too small to warrant their own initiative. Without a designated home, these get noted in commit messages or PR descriptions and forgotten. This phase is the bucket.

**Pattern for adding items**: When you find a small, isolated cleanup during Phase 1-8 work that you choose not to fix in scope, add it to the [Backlog](#backlog) below with: a one-sentence description, the file/location, the discovery context (which phase, which commit if relevant), and an effort estimate. Do NOT fix it in the unrelated commit. The whole point of this bucket is to keep phase commits focused.

**Criteria for inclusion**:

- ✅ Small (≤30 lines changed)
- ✅ Isolated (no cross-cutting impact)
- ✅ Mechanical (no design decisions required)
- ✅ Discovered as a side effect of other work
- ❌ Not a security issue (those go to Phase 8 directly)
- ❌ Not a behavior change (those need their own commit/PR with justification)
- ❌ Not an architecture decision (those need a Key Design Decision entry)

If a single item exceeds 30 lines or touches multiple unrelated areas, promote it to its own phase scope item or its own follow-on initiative.

### Backlog

Items are added here as they're discovered. Each entry should link back to the discovering commit or phase so reviewers can understand the original context.

#### Discovered during Phase 1 (Data Integrity)

1. **ICG `Recommendation` legacy `threshold` → `triggerThreshold` field rename**
   - **File**: [src/data/infrastructure-cost-governance/recommendations.ts](../../data/infrastructure-cost-governance/recommendations.ts)
   - **Effort**: ~25 lines (mechanical find/replace + delete `.map()` shim)
   - **Context**: The file's 22 literal records use `threshold:` while the public type, schema, and engine use `triggerThreshold:`. A trailing `.map()` translates between them. Discovered during Phase 1 Commit 3 (`feat(schemas): add Zod schemas for techpar, diligence, ICG data`); the schema validates the post-map shape so it's not blocking. The fix is to rename `threshold:` → `triggerThreshold:` in all 22 records and delete the `.map()` shim entirely. Pure mechanical change with zero functional impact.

2. **Project count drift in documentation (51 vs 57)**
   - **Files**: [.claude/CLAUDE.md](../../../.claude/CLAUDE.md), [src/docs/development/PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md), [src/pages/ma-portfolio.astro](../../pages/ma-portfolio.astro) (page meta description)
   - **Effort**: ~5 line changes across 3 files
   - **Context**: Both CLAUDE.md and the Phase 1 problem statement in this doc say "51 projects" but `projects.json` actually contains 57. The page meta description also says "51 M&A advisory and implementation projects." Discovered during Phase 1 Commit 2 (`feat(schemas): add Zod schemas for portfolio data`) when running the pre-flight parse check. Sweep all references to a single accurate count (or replace literal numbers with `${projects.length}` in places where it's templated).

#### Discovered during Phase 2 (CI/CD & Developer Guardrails)

3. **Full-codebase Prettier sweep**
   - **Scope**: Run `npm run format` (`prettier --write .`) on the entire codebase once and commit the result. Then add `npm run format:check` back into the `lint-and-typecheck` CI job.
   - **Effort**: ~1 commit, large diff (estimate: ~50-80 files reformatted, pure whitespace/quote changes). Review burden is the main cost; functional risk is near zero.
   - **Context**: Phase 2 Commit 4 added `.prettierrc.json` but deliberately did NOT run `prettier --write` on the codebase to avoid a large, review-expensive diff with no functional value. Instead, lint-staged formats files incrementally as they're touched via the pre-commit hook (Phase 2 Commit 7). Phase 2 Commit 9 adds `npm audit` + `astro check` + ESLint + stylelint to CI but omits `prettier --check` because it would fail on the legacy files. Once enough of the codebase has been organically formatted (or when a dedicated sweep is convenient), run the full `prettier --write`, commit, and re-enable `format:check` in `.github/workflows/test.yml`.

4. **`techpar/index.astro` astro-eslint-parser failure**
   - **File**: [src/pages/hub/tools/techpar/index.astro](../../pages/hub/tools/techpar/index.astro)
   - **Effort**: Investigation only; fix depends on root cause.
   - **Context**: `astro-eslint-parser` fails on this file with `Parsing error: Declaration or statement expected` at the `<style>` block boundary (line 601). Other large `.astro` files including `brand.astro` (3778 lines) and `hub/tools/diligence-machine/index.astro` parse correctly. Prettier's Astro parser handles the file fine. As a workaround, Phase 2 Commit 5 added the file to the ESLint ignore list. Investigate whether the file contains an unusual construct the parser doesn't handle, or whether this is a bug in `astro-eslint-parser` worth filing upstream. Either fix the file or upgrade/patch the parser, then remove the ignore.

5. **Stale one-shot migration scripts at repo root**
   - **Files**: [abbreviate-arr.js](../../../abbreviate-arr.js), [sort-projects.js](../../../sort-projects.js)
   - **Effort**: ~2 line changes (file deletions).
   - **Context**: Two one-shot data migration scripts left over from 2026-02 commits (`eb18718` and the projects.json move). Neither has imports anywhere in the codebase; the only remaining reference is a historical mention in `src/docs/testing/TEST_STRATEGY.md`. Phase 2 Commit 5 added them to the ESLint ignore list to unblock the baseline. Delete both files and remove the corresponding entries from `eslint.config.mjs` ignores.

#### Discovered during Phase 3 (Code Structure & CSS Architecture)

6. **Remove remaining manual vendor-prefix declarations from CSS source** (follow-on to Phase 3 commit 0e)
   - **Files**: [src/styles/global.css](../../styles/global.css) (user-select, appearance, line-clamp, box-orient, mask, slider-thumb pairs), various `.astro` files that use `-webkit-user-select`, `-moz-user-select`, `-ms-user-select`, `-webkit-appearance`, etc.
   - **Effort**: ~1 hour, mostly mechanical find/replace with build-diff verification
   - **Context**: Phase 3 commit 0e removed all manual `-webkit-backdrop-filter` declarations because LightningCSS was deduplicating them against the unprefixed form and shipping only one (which broke Firefox). Other paired prefixes (user-select, appearance, line-clamp, box-orient, mask, slider-thumb) were left in place for this commit because they did NOT exhibit the same dedupe bug — LightningCSS correctly auto-adds the prefixes it needs. However, they're still tech debt: LightningCSS would add them automatically based on the `browserslist` config, so the manual source declarations are redundant maintenance burden. Sweep them out in a dedicated commit after Phase 3 main migration completes, when source CSS has been reorganized into scoped blocks. Verification per change: run `npm run build` and diff the compiled CSS output to confirm the removed manual prefix is re-added automatically by LightningCSS.

7. **Tighten stylelint complexity rules: `selector-max-specificity` and `no-descending-specificity`**
   - **Files**: [.stylelintrc.json](../../../.stylelintrc.json) (rule config), plus ~100 call sites across [src/pages/hub/tools/techpar/index.astro](../../pages/hub/tools/techpar/index.astro), [src/pages/hub/tools/diligence-machine/index.astro](../../pages/hub/tools/diligence-machine/index.astro), [src/pages/hub/tools/infrastructure-cost-governance/index.astro](../../pages/hub/tools/infrastructure-cost-governance/index.astro)
   - **Effort**: ~1 day (many mechanical fixes; some require actual restructuring)
   - **Context**: Phase 3 commit 0c enabled 5 complexity rules in the `.astro` stylelint override (`max-nesting-depth: 3`, `selector-max-compound-selectors: 4`, and three shorthand/longhand declaration rules). Two additional rules from the original plan — `selector-max-specificity: "0,3,0"` and `no-descending-specificity: true` — were deliberately deferred because they surfaced 126 pre-existing violations. `selector-max-specificity: 0,3,0` is too tight for the codebase's `:global(html.dark-theme) .foo .bar` pattern which naturally reaches specificity (0,4,1); `no-descending-specificity` surfaces real ordering drift but requires coordinated hand-fixes across multiple hub tool files. Ship hardening first; revisit both rules once Phase 3's main migration (commits 5-10c) has relocated most of the offending selectors out of these monolithic files. Options for tightening: (a) raise specificity threshold to `0,4,1` and enable as-is, (b) enable with `severity: warning` initially and promote to error after violations fall below N, (c) leave disabled and rely on scoped-style migration to reduce specificity naturally.

8. **`light-dark()` single-declaration theme switching — bounded pilot**
   - **Files**: [src/styles/global.css](../../styles/global.css) (one section of the `html.dark-theme` override block), plus one themed component's scoped styles as pilot target
   - **Effort**: ~25-30 lines modified, time-boxed to one commit. **Explicit non-goal: full sweep of the 211-line dark-theme override block** (that exceeds Phase 9's ≤30 line criterion and is logged as a follow-on opportunity — see below).
   - **Context**: Discovered during Phase 3 research on LightningCSS capabilities. The current dark-theme pattern requires two rules per themeable declaration — a base rule plus an `html.dark-theme` override selector — and the override block is ~211 lines (`global.css` lines 900-1110). CSS's `light-dark()` function collapses this into a single declaration:

     ```css
     /* Current pattern (two rules, in different blocks) */
     .button {
       background: var(--color-surface-light);
       color: var(--color-text-light);
     }
     html.dark-theme .button {
       background: var(--color-surface-dark);
       color: var(--color-text-dark);
     }

     /* With light-dark() (one rule, co-located) */
     .button {
       background: light-dark(var(--color-surface-light), var(--color-surface-dark));
       color: light-dark(var(--color-text-light), var(--color-text-dark));
     }
     ```

     Browser support is partial in 2026, but **LightningCSS (adopted in Phase 3 commit 0d) compiles `light-dark()` to a `@media (prefers-color-scheme)` + CSS variable trick that works in every browser with custom-property support** — so the source can use the modern syntax and the output stays universally compatible.

   - **Pilot scope**: Choose one small, self-contained themed surface (recommended: button declarations, or one card variant) and migrate its light/dark values to `light-dark()`. Verify visually in both themes and in one alternative palette (e.g., palette-3). Document the before/after diff and the LightningCSS-compiled output for future reference.
   - **Pre-requisite**: The project must set `color-scheme: light` on `<html>` and `color-scheme: dark` on `html.dark-theme` so `light-dark()` resolves against the class-driven theme rather than the OS preference. Verify this is wired up before starting the pilot (it is not today — adding the two declarations is part of this commit).
   - **Why pilot and not sweep**: A full sweep of the dark-theme override block is a behavior-equivalent refactor that touches 200+ lines, which exceeds Phase 9's inclusion criteria (≤30 lines, isolated, mechanical). The pilot proves the pattern works with LightningCSS compilation and the existing palette system; a broader sweep is deferred to [DEVELOPMENT_OPPORTUNITIES.md](./DEVELOPMENT_OPPORTUNITIES.md) as a follow-on initiative entry.
   - **Success signal for promoting to a broader sweep**: pilot commit passes all tests, visual regression check shows zero diff in both themes across all 6 palettes, and LightningCSS output is confirmed stable.

9. **Migrate brand-page specimen styles from global.css to brand.astro scoped** (deferred Phase 3 commits 10a/10b/10c)
   - **Files**: [src/styles/global.css](../../styles/global.css) (lines ~4049-4430, guarded by `stylelint-disable no-duplicate-selectors`), [src/pages/brand.astro](../../pages/brand.astro) (`<style is:global>` block)
   - **Effort**: ~2-3 hours across 3 sub-commits (colors, typography, components)
   - **Context**: Phase 3 analysis revealed that most brutalist component CSS classes (`.brutal-btn`, `.brutal-frosted`, `.brutal-heading-*`, etc.) are genuinely shared across the site (used by 10+ files), not brand-page-only. The specimen blocks in global.css duplicate some of these selectors for the brand-page style guide. The planned 10a/10b/10c commits were deferred because moving them requires merging with the brand.astro `<style is:global>` block rather than simple cut-paste. The `stylelint-disable` comment at global.css line 4049 tracks this.

10. **`@layer` declaration — wrap sections or remove** (deferred Phase 3 commit 0b)
    - **Files**: [src/styles/global.css](../../styles/global.css) line 35
    - **Effort**: ~10 min to remove, ~2 hours to actually wrap sections
    - **Context**: Phase 3 commit 0b added the `@layer` declaration (`reset, tokens, utilities, components, theme, overrides`) as a progressive step, but no CSS rules were wrapped in `@layer` blocks because unlayered rules beat layered rules for normal declarations — the original plan to wrap was based on a cascade-direction misconception. The declaration is currently a no-op. Either wrap at least the reset/tokens sections to prove the pattern, or remove the declaration to avoid dead code.

11. **Enable CI/CD on feature branches (not just PRs to master)**
    - **Files**: [.github/workflows/test.yml](../../../.github/workflows/test.yml), GitHub repository settings (branch rulesets)
    - **Effort**: ~30 min (workflow trigger change + optional branch ruleset)
    - **Context**: The `test.yml` workflow currently triggers on `push` to `master` and on `pull_request` to `master`. Feature branches like `feat/platform-hardening` run no CI until a PR is opened. This means test failures accumulate undetected across many commits and are only discovered at PR time (or locally if the developer remembers to run the full suite). Enabling CI on feature branch pushes surfaces failures early — before they compound.
    - **Options**:
      - **(a) Workflow trigger change**: Add `push: branches: ['feat/**', 'fix/**', 'dev']` to `test.yml`'s `on:` block. Cheapest option; runs lint + unit tests on every push to any feature branch. E2E can be limited to PR-only to save CI minutes.
      - **(b) Branch ruleset**: Create a GitHub branch ruleset matching `feat/**` that requires the `Unit & Integration Tests` check. This prevents pushing commits that break tests but adds friction for WIP branches. Better suited for team environments.
      - **(c) Hybrid**: Workflow triggers on all branches (option a), but only `master` branch ruleset blocks merge. Feature branch CI is advisory (failures visible but non-blocking).
    - **Recommendation**: Option (c) — maximum visibility, minimum friction. Developers see CI status on every push without being blocked on WIP branches.

12. ~~**Fix tsconfig.json `baseUrl` deprecation warning**~~ — **Done** (Phase 6). Removed `baseUrl`, updated `paths` to `"./src/*"`.

13. **Fix Vite dual-import warning for diligence-engine.ts**
    - **Files**: [src/pages/hub/tools/diligence-machine/index.astro](../../pages/hub/tools/diligence-machine/index.astro)
    - **Effort**: ~10 min
    - **Context**: Build warns that `diligence-engine.ts` is both statically and dynamically imported by the same file. Consolidate to one import style.

14. **Configure Sentry alert rules**
    - **Files**: Sentry dashboard (no code changes)
    - **Effort**: ~15 min
    - **Context**: Phase 7 deferred alert rule setup. Recommended rules: "New issue" → email, "10+ events/hour on tool pages" → email, "Any event with area:inoreader-api" → email, "Any event with area:redis-connection" → email. See Phase 7 manual setup docs for details.

15. **Enable Sentry source map upload**
    - **Files**: Vercel environment variables (add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`)
    - **Effort**: ~10 min
    - **Context**: Phase 7 wired up the `sourceMapsUploadOptions` config slot in `astro.config.mjs` but left it disabled (`enabled: !!process.env.SENTRY_AUTH_TOKEN`). Adding the auth token to Vercel activates readable stack traces in Sentry. Generate an auth token at sentry.io → Settings → Auth Tokens.

16. **Evaluate Sentry consent gating**
    - **Files**: `sentry.client.config.ts`, cookie consent integration
    - **Effort**: ~2-4 hours (depends on consent banner implementation)
    - **Context**: Phase 7 runs Sentry under legitimate-interest basis (error monitoring, not user tracking). The follow-on [BUSINESS_ENABLEMENT_V1.md](./BUSINESS_ENABLEMENT_V1.md) initiative will ship a cookie consent banner — at that point, evaluate whether to additionally gate Sentry on consent or keep it under legitimate interest. Error-only replay (`replaysOnErrorSampleRate: 1.0`) is the main consideration; pure error capture is generally accepted as legitimate interest under GDPR.

#### Documentation Organization Initiative (discovered during Phase 8 planning)

17. **Consolidate development initiative docs into a combined roadmap**
    - **Files**: `src/docs/development/` (PLATFORM_HARDENING_V1.md, BUSINESS_ENABLEMENT_V1.md, DEVELOPMENT_OPPORTUNITIES.md, PERFORMANCE_FUTURE_INITIATIVES.md)
    - **Effort**: ~2-4 hours
    - **Context**: Four separate initiative documents with overlapping scope and cross-references. Evaluate consolidating into a single roadmap view. Archive completed initiatives to reduce active file count. Assess which docs are still active vs. historical.

18. **Prune outdated or low-value documentation**
    - **Files**: All 41 markdown files in `src/docs/`
    - **Effort**: ~2-3 hours (audit + deletions)
    - **Context**: Audit for staleness, accuracy, and ongoing utility. Delete docs that duplicate information better maintained elsewhere (e.g., CI_CD_SUMMARY.md vs GITHUB_ACTIONS_SETUP.md). Remove docs for completed one-time tasks that have no reference value.

19. **Optimize documentation content and structure**
    - **Files**: `src/docs/` (multiple directories)
    - **Effort**: ~2-3 hours
    - **Context**: Merge related docs that are split unnecessarily (e.g., testing has 8 files — some could combine). Ensure every doc has a clear audience, purpose, and is reachable from a parent README. Reduce total file count where consolidation improves discoverability without losing information.

<!-- Add new items below as Phase 2-8 work uncovers them. Use the same format. -->

### Commits

Commits in this phase use the `chore(cleanup):` prefix to distinguish them from substantive refactors. Each backlog item gets its own commit so revert is granular.

```
chore(cleanup): rename ICG threshold → triggerThreshold and drop map shim
chore(cleanup): correct portfolio project count references (51 → 57)
chore(cleanup): run full-codebase Prettier sweep and re-enable format:check in CI
chore(cleanup): investigate/fix techpar-eslint parser failure
chore(cleanup): delete stale one-shot migration scripts
refactor(css): remove remaining manual vendor-prefix declarations
chore(lint): tighten selector-max-specificity and enable no-descending-specificity
refactor(css): pilot light-dark() single-declaration theme switching
```

### Success Criteria

- Every backlog item is either resolved or explicitly deferred with rationale
- No backlog item carries over to the post-hardening BUSINESS_ENABLEMENT_V1 initiative
- Phase 9 effort stays ≤1 day; if the bucket grows past that during Phases 1-8 execution, surface to the project owner before Phase 9 begins so we can decide what to defer to a follow-on initiative

### What does NOT belong here

- **Security findings** → fix immediately or escalate to Phase 8 security headers work
- **Failing tests** → fix in the discovering commit; never punt
- **Performance regressions** → fix immediately; track in [PERFORMANCE_FUTURE_INITIATIVES.md](./PERFORMANCE_FUTURE_INITIATIVES.md) if structural
- **Anything visible to users** (broken UI, copy errors, accessibility violations) → fix in the appropriate phase, not here
- **Items requiring a design decision** → these need stakeholder input, not bucket cleanup; create a separate doc or Key Design Decision entry
- **Items discovered during Phase 9 itself** → Phase 9 is not self-feeding. If Phase 9 execution surfaces new drift, log it in [DEVELOPMENT_OPPORTUNITIES.md](./DEVELOPMENT_OPPORTUNITIES.md) for a future initiative

---

## Summary Timeline

| Phase | Scope                                   | Effort         | Cumulative                      |
| ----- | --------------------------------------- | -------------- | ------------------------------- |
| 1     | Data Integrity (Zod, `any` elimination) | 3-4 days       | Week 1-2                        |
| 2     | CI/CD & Developer Guardrails            | 3 days         | Week 2-3                        |
| 3     | Code Structure & CSS Architecture       | 6-7 days       | Week 3-5                        |
| 4     | Test Coverage & Accessibility           | 5 days         | Week 5-7                        |
| 5     | SEO Hardening                           | 1-2 days       | Week 7                          |
| 6     | Hub Tool Analytics Standardization      | 2 days         | Week 7-8                        |
| 7     | Client-Side Error Monitoring            | 2 days         | Week 8-9                        |
| 8     | Astro Alignment, Security & Docs        | 3 days         | Week 9-11                       |
| 9     | Miscellaneous Cleanup Bucket            | ~1 day         | Week 11                         |
|       | **Total**                               | **26-31 days** | **~11 weeks at 50% allocation** |

After Phase 9 completes, proceed to [BUSINESS_ENABLEMENT_V1.md](./BUSINESS_ENABLEMENT_V1.md) for Cookie Consent / GDPR and Email Capture (~4 additional days).

---

## Key Design Decisions

1. **Zod schemas in `src/schemas/`, not alongside data** — avoids circular dependencies; single source of truth for data contracts importable by both production code and tests

2. **CSS architecture follows Astro scoped styles convention** — 41 components and pages (23 components + 18 pages) already use scoped `<style>` tags; `global.css` slimmed to genuinely global concerns (~300 lines); CSS custom properties cascade into scoped styles because Astro uses class-based scoping, not shadow DOM; co-location means deleting a component removes its styles automatically. **Cascade control** is organized via CSS `@layer` lanes (`reset, tokens, utilities, components, theme, overrides`) declared at the top of `global.css`. Note that palette and dark-theme overrides do NOT require layers to win — they work via CSS custom property redefinition, which cascades through property inheritance independent of selector specificity or layer membership. Layer adoption is therefore primarily organizational rather than cascade-resolving, and progressive: subsequent Phase 3 commits wrap sections of `global.css` in their appropriate layers as they migrate. Astro scoped `<style>` blocks remain unlayered and naturally win over global rules (as is correct behavior: scoped styles should override globals). Design token discipline is enforced mechanically via `stylelint-declaration-strict-value` rather than by code review alone.

2a. **LightningCSS as the Vite CSS transformer** (Phase 3) — replaces Astro's default esbuild CSS pipeline with a single Rust-based tool that handles autoprefixing, minification, modern-CSS down-leveling (CSS nesting, `oklch()`, `color-mix()`, `light-dark()`), vendor-prefix management, and stricter syntax validation. Chosen over a hand-rolled PostCSS plugin chain because it's one dependency vs. six, is configured in a few lines, and gives legacy cruft in the existing `global.css` a free cleanup as a side effect of every build. Orthogonal to stylelint (which enforces style rules; LightningCSS only transforms output) and to `@layer` (which LightningCSS has first-class support for). **Wired to the project's `browserslist` field via `browserslistToTargets(browserslist())` in `astro.config.mjs`** — this is load-bearing: without explicit targets, LightningCSS picks up Vite's default `'modules'` resolution (Firefox 78, Safari 14), causing it to strip unprefixed `backdrop-filter` declarations as "redundant" and breaking frosted glass for Firefox users (regression introduced and fixed during Phase 3 commit 0d/0e). **Vendor prefix policy**: source code writes only unprefixed CSS properties; LightningCSS adds vendor prefixes automatically based on browserslist targets. Manually paired prefix declarations in source cause the deduplication bug that led to the Phase 3 regression.

2b. **stylelint coverage extended to `.astro` scoped styles** (Phase 3) — via `postcss-html` + `stylelint-config-html/astro`; closes the linting blind spot that would otherwise swallow 4,600+ lines of CSS migrated into scoped blocks. Complexity rules (`no-descending-specificity`, `max-nesting-depth: 3`, `selector-max-compound-selectors: 4`, `selector-max-specificity: "0,3,0"`) are applied in the `.astro` override only — too noisy for legacy `global.css` but cheap wins inside naturally bounded scoped blocks.

3. **Content collections only for regulatory-map** — other data sources are TypeScript modules with computed values; converting them to content collections would lose type-safe imports for no benefit

4. **No framework adoption** — site works well with inline scripts; no React/Vue/Svelte except possibly a thin Chart.js island

5. **Accessibility ratchet** — axe-core allowlist starts with current violations, must only shrink; prevents new regressions while fixing existing violations incrementally

6. **ESLint flat config** — modern format, works with Astro plugin, avoids deprecated `.eslintrc`

7. **Tool analytics follow existing naming convention** — 3 of 5 tools already use `<tool_code>_<interaction>` pattern (dm*, tdc*, icg*); standardize the remaining 2 (tp*, rm\_) rather than introducing a new pattern

8. **Sentry for error monitoring, not LogRocket/FullStory** — error tracking only, no session replay; privacy-first config (no PII) allows running pre-consent; minimizes bundle size and privacy surface; `@sentry/astro` provides first-class Astro integration

9. **Scope separation: platform vs. business** — Cookie Consent and Email Capture were originally scoped as Phases 6 and 8 of this initiative but have been refactored into a separate [BUSINESS_ENABLEMENT_V1.md](./BUSINESS_ENABLEMENT_V1.md) initiative. Rationale: infrastructure hardening is distinct from net-new business capabilities that require vendor selection, legal review, and focused stakeholder conversations. Mixing them dilutes both.

---

## Commit Strategy

Each phase should produce **atomic commits** — one logical change per commit, independently reviewable and revertable. The commit lists in each phase section above are the recommended granularity.

### Conventions

- **Format**: `type(scope): description` per [Conventional Commits](https://www.conventionalcommits.org/)
- **Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`
- **Scope**: component or area affected (e.g., `schemas`, `css`, `analytics`, `seo`, `monitoring`, `a11y`)
- **Body**: explain _why_, not _what_ (the diff shows what)

### Principles

1. **One concern per commit** — don't mix a CSS refactor with a new component extraction. If a phase has 5 deliverables, it should have ≥5 commits.
2. **Tests travel with the code they test** — a new component and its tests should be in the same commit, or the test commit immediately follows.
3. **Refactors should not change behavior** — a `refactor()` commit must pass all existing tests with zero changes to test assertions. If tests need updating, that's a signal the commit is doing more than refactoring.
4. **Infrastructure before features** — within a phase, commit configuration/tooling changes before the code that depends on them (e.g., ESLint config before lint-fix commit).
5. **Each commit should build** — never commit code that breaks the build. If a migration requires multiple steps, structure commits so intermediate states still compile.

### Example: Phase 3 commit sequence

```
# Foundation tooling (must land before any style migration)
chore(lint): add stylelint coverage for .astro scoped styles via postcss-html
refactor(css): introduce @layer cascade layer scheme in global.css
chore(lint): enable complexity rules for .astro scoped styles
chore(build): opt into LightningCSS via Vite transformer

# Infrastructure first
refactor(css): add z-index scale variables and replace magic values

# Logic deduplication (small, self-contained)
refactor(portfolio): sync PortfolioHeader filter logic with filterLogic.ts

# Component extractions (each independently useful)
feat(components): extract PrintReportHeader shared component
feat(components): extract Card base with service/audience/trust/hub variants

# CSS migration (one domain at a time, each commit passes build + unit tests)
refactor(css): move header styles to Header.astro scoped
refactor(css): move hero styles to Hero.astro scoped
refactor(css): move services + about styles to scoped
refactor(css): move stats-bar, CTA, and remaining page-level styles to scoped
refactor(css): move portfolio filter-control styles to portfolio components

# Tool-specimen block split for safer review and rollback
refactor(css): move tool-specimen colors section to brand.astro scoped
refactor(css): move tool-specimen typography section to brand.astro scoped
refactor(css): move tool-specimen components section to brand.astro scoped

# Large decompositions
refactor(brand): decompose brand.astro into section sub-components
refactor(techpar): modularize techpar-ui.ts into chart, dom, state modules

# Constants cleanup
refactor: extract magic numbers into named constants

# Final guardrail — turn refactor discipline into permanent rule
chore(lint): enable strict-value color token enforcement (warning severity)
```

---

## Next Steps

After all 9 phases of this initiative are complete, proceed to:

### [BUSINESS_ENABLEMENT_V1.md](./BUSINESS_ENABLEMENT_V1.md)

A 2-initiative follow-on (~4 days total) covering business-facing capabilities deferred from this hardening plan:

1. **Cookie Consent & GDPR Compliance** — custom consent banner with GA4 Consent Mode integration; gates GA4 and optionally Sentry error monitoring; updates privacy policy; adds footer preference link
2. **Email Capture** — minimal email signup form in footer with Zod validation, email service integration, GA4 event tracking, and privacy policy updates

Both benefit from the hardened foundation: CI pipeline (Phase 2), refactored components (Phase 3), accessibility testing (Phase 4), Zod schemas (Phase 1), and error monitoring (Phase 7) must all be in place.

---

## Related Documentation

- [BUSINESS_ENABLEMENT_V1.md](./BUSINESS_ENABLEMENT_V1.md) — **Next steps** post-hardening initiative (Cookie Consent + Email Capture)
- [DEVELOPMENT_OPPORTUNITIES.md](./DEVELOPMENT_OPPORTUNITIES.md) — Performance monitoring initiatives (Lighthouse CI, E2E tests)
- [DESIGN_SYSTEM_FUTURE_INITIATIVES.md](./DESIGN_SYSTEM_FUTURE_INITIATIVES.md) — Deferred design system enhancements
- [HUB_TOOLS_UX_UNIFICATION.md](./HUB_TOOLS_UX_UNIFICATION.md) — Cross-tool UX patterns
- [PERFORMANCE_FUTURE_INITIATIVES.md](./PERFORMANCE_FUTURE_INITIATIVES.md) — Deferred performance optimizations
- [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) — Brand voice and design philosophy
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and patterns
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — Design token catalog
- [TEST_STRATEGY.md](../testing/TEST_STRATEGY.md) — Test patterns by component type
- [TEST_BEST_PRACTICES.md](../testing/TEST_BEST_PRACTICES.md) — E2E anti-patterns
- [GOOGLE_ANALYTICS.md](../analytics/GOOGLE_ANALYTICS.md) — GA4 integration guide
- [SEO_IMPLEMENTATION.md](../seo/SEO_IMPLEMENTATION.md) — SEO architecture

---

**Created**: April 9, 2026
**Completed**: April 13, 2026
**Last Updated**: April 13, 2026 (all 9 phases complete; initiative marked done)
