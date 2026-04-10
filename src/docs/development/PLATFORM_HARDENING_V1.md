# Platform Hardening V1

A 10-phase initiative to harden the GST website platform for the next 6 months of business growth. Addresses data validation, CI/CD, code structure, test coverage, accessibility, SEO, GDPR compliance, analytics, lead capture, error monitoring, security, and documentation.

**Status**: Proposed
**Created**: April 9, 2026
**Priority**: High
**Effort**: ~28-33 working days across 10 phases
**Goal**: Create a V1 platform that supports immediate business needs without structural friction

---

## Table of Contents

1. [Data Integrity Layer](#phase-1-data-integrity-layer)
2. [CI/CD & Developer Guardrails](#phase-2-cicd--developer-guardrails)
3. [Code Structure & CSS Architecture](#phase-3-code-structure--css-architecture)
4. [Test Coverage & Accessibility](#phase-4-test-coverage--accessibility)
5. [SEO Hardening](#phase-5-seo-hardening)
6. [Cookie Consent & GDPR Compliance](#phase-6-cookie-consent--gdpr-compliance)
7. [Hub Tool Analytics Standardization](#phase-7-hub-tool-analytics-standardization)
8. [Email Capture](#phase-8-email-capture)
9. [Client-Side Error Monitoring](#phase-9-client-side-error-monitoring)
10. [Astro Platform Alignment, Security & Documentation](#phase-10-astro-platform-alignment-security--documentation)
11. [Summary Timeline](#summary-timeline)
12. [Key Design Decisions](#key-design-decisions)
13. [Commit Strategy](#commit-strategy)
14. [Related Documentation](#related-documentation)

---

## Phase 1: Data Integrity Layer

**Status**: Proposed
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

**Status**: Proposed
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
- **500 error page** — create `src/pages/500.astro` (only 404 exists; Radar SSR route has no branded error page)

### Commits

```
chore(lint): add ESLint flat config with typescript-eslint and astro plugin
chore(lint): add Prettier configuration
chore(lint): fix existing lint violations across codebase
chore(hooks): add husky pre-commit hooks with lint-staged
ci: restructure pipeline to 3-job parallel-then-gate architecture
feat(error): add branded 500 error page
```

### Success Criteria

- CI rejects lint/type/style/audit failures before E2E starts
- Pre-commit hooks prevent unformatted commits
- 500 page renders correctly in both themes
- Total pipeline wall-clock time increases by ≤1 minute

---

## Phase 3: Code Structure & CSS Architecture

**Status**: Proposed
**Priority**: High
**Effort**: 5-6 days
**Dependencies**: Phase 2 (linting catches regressions during refactoring)

### Problem

`global.css` is 5,511 lines mixing genuinely global concerns with component-specific styles. Large components (`brand.astro` 3,778 lines, `PortfolioHeader.astro` 869, `StickyControls.astro` 785, `techpar-ui.ts` 1,473) make code review painful and merge conflicts likely. Duplicated patterns exist across 9 pages (print report header) and 3 files (card markup).

### CSS Strategy

**Follow Astro conventions: scoped `<style>` tags.** The project already uses Astro scoped styles in 23 components and 18 pages. CSS custom properties defined in `variables.css` cascade into scoped `<style>` blocks because Astro uses generated class attributes (not shadow DOM). Benefits over `@import` splitting:
- Automatic dead CSS elimination (Astro only ships styles for rendered components)
- Co-located discoverability (styles live with their component)
- Collision safety (scoped by default, explicit via `:global()` when needed)
- Deleting a component automatically removes its styles

### Scope

- **Slim down `global.css` to genuinely global concerns** (~200-300 lines):
  - Keep: reset/box-sizing, skip-nav, body/html base styles, checkerboard `body::before`, container/layout utilities, `html.dark-theme` variable overrides
  - Move to scoped component styles: `.site-header` rules → `Header.astro`, `.tool-methodology` → tool pages or shared component, hero styles → `Hero.astro`, portfolio grid styles → portfolio components
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
- **Extract shared portfolio filter logic** — `PortfolioHeader.astro` re-implements keyword arrays and filtering that `StickyControls.astro` already imports from `filterLogic.ts`; align PortfolioHeader to use the same centralized utilities (~25 lines removed)
- **Extract `<PrintReportHeader />` component** — identical 17-line block repeated across 9 pages; create `src/components/PrintReportHeader.astro` with a `title` prop (~118 lines saved)
- **Extract `<Card />` component with variants** — near-identical card markup across `services.astro` (6 cards), `WhyClientsTrustUs.astro` (4 cards), `hub/index.astro` (3 cards); create `src/components/Card.astro` with `variant` prop (~44 lines saved)
- **Decompose `brand.astro`** — split 3,778-line page into sub-components (some already exist in `src/components/brand/`)
- **Modularize `techpar-ui.ts`** — split 1,473 lines into:
  - `src/utils/techpar/chart.ts` — Chart.js config, dataset builders
  - `src/utils/techpar/dom.ts` — DOM manipulation, event binding
  - `src/utils/techpar/state.ts` — state management, input parsing
  - `src/utils/techpar-ui.ts` — thin re-export barrel
- **Extract magic numbers** — maturity thresholds (25, 50, 75), z-index values, modal ID suffixes into named constants

### Commits

```
refactor(css): move header styles from global.css to Header.astro scoped styles
refactor(css): move hero styles from global.css to Hero.astro scoped styles
refactor(css): move portfolio styles from global.css to portfolio components
refactor(css): move tool styles from global.css to tool page scoped styles
refactor(css): add z-index scale variables and replace magic values
refactor(portfolio): align PortfolioHeader filter logic with filterLogic.ts
feat(components): extract PrintReportHeader shared component
feat(components): extract Card component with variants
refactor(brand): decompose brand.astro into sub-components
refactor(techpar): modularize techpar-ui.ts into chart, dom, state modules
refactor: extract magic numbers into named constants
```

### Success Criteria

- `global.css` reduced to ≤300 lines of genuinely global styles
- No component >500 lines (tool pages may be ~800 with inline scripts)
- All E2E tests pass without regressions
- Stylelint passes

---

## Phase 4: Test Coverage & Accessibility

**Status**: Proposed
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

**Status**: Proposed
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

## Phase 6: Cookie Consent & GDPR Compliance

**Status**: Proposed
**Priority**: High
**Effort**: 2 days
**Dependencies**: Phase 2 (linting/CI catches regressions in analytics code)

### Problem

GA4 currently loads unconditionally via `src/components/GoogleAnalytics.astro` — EU visitors are tracked without explicit consent. The privacy policy (`src/pages/privacy.astro`) mentions cookies and GDPR rights but provides no consent mechanism. This must be resolved *before* expanding analytics coverage (Phase 7).

### Scope

- **Create `src/components/CookieConsent.astro`**:
  - Minimal banner rendered in `BaseLayout.astro` (after Header, before main content)
  - Two buttons: "Accept" and "Decline"
  - Built with existing design system (`.brutal-btn`, frosted glass, CSS variables) — no external dependency
  - Stores preference in `localStorage('cookie-consent')`: `'accepted'` | `'declined'`
  - Banner re-appears if no stored preference
- **Gate GA4 on consent** — modify `GoogleAnalytics.astro`:
  - Check `localStorage('cookie-consent')` before loading gtag script
  - Implement GA4 Consent Mode: `gtag('consent', 'default', { analytics_storage: 'denied' })` on page load; update to `'granted'` on acceptance
  - If declined: GA4 does not load
- **Update privacy policy** — expand `src/pages/privacy.astro` (cookie section, lines 67-71): consent banner explanation, what "Accept" enables, how to change preference
- **Footer preference link** — add "Cookie Preferences" link in `src/components/Footer.astro` that re-opens the consent banner
- **Tests**:
  - Unit: GA4 does not fire events when consent declined; consent state persists
  - E2E: banner appears on first visit, disappears after choice, does not reappear; GA4 loads only after acceptance

**Not pursuing**: Heavy cookie consent libraries (Klaro, Osano, CookieConsent.js) — one tracking tool (GA4), no ad cookies; custom component is simpler and avoids external dependency.

### Commits

```
feat(consent): add CookieConsent component with accept/decline
feat(consent): gate GA4 loading on cookie consent via Consent Mode API
docs(privacy): update privacy policy with consent mechanism disclosure
feat(consent): add Cookie Preferences link to footer
test(consent): add unit and E2E tests for consent flow
```

### Success Criteria

- GA4 does not load until user explicitly accepts
- Consent preference persists across page loads
- Banner does not appear for returning users who have chosen
- "Cookie Preferences" link in footer allows changing choice
- Privacy policy reflects the consent mechanism

---

## Phase 7: Hub Tool Analytics Standardization

**Status**: Proposed
**Priority**: Medium
**Effort**: 2 days
**Dependencies**: Phase 6 (consent must gate all tracking before adding more events)

### Problem

Tool analytics coverage is uneven. Diligence Machine has 8 tracked events, ICG has 11, Tech Debt Calculator has 6, but TechPar has **zero interaction events** and Regulatory Map has **partial coverage with unnamed events**. This makes tools incomparable and prevents funnel analysis.

### Current Coverage

| Tool | Page View | Interaction Events | Gap |
|------|-----------|-------------------|-----|
| Diligence Machine | Yes | 8 (dm_edit, dm_step_advance, dm_generate, dm_copy, dm_print, dm_restart, dm_go_back, calendly) | Adequate |
| ICG | Yes | 11 (icg_assessment_start/advance/complete, icg_review, icg_start_over, icg_send_email, icg_print, icg_export_json, icg_copy_summary/link, icg_recommendation_toggle) | Adequate |
| Tech Debt Calculator | Yes | 6 (tdc_slider_change, tdc_deploy_frequency, tdc_advanced_toggle, tdc_currency_change, tdc_export_pdf, tdc_copy_link/summary) | Adequate |
| TechPar | Yes | **0** | No interaction tracking |
| Regulatory Map | Yes | **Partial** (quick_zoom + unnamed events at lines 454, 726, 856, 981, 1008, 1258, 1344) | Inconsistent naming |

### Scope

- **Standardize TechPar events** — add to `src/pages/hub/tools/techpar/index.astro` and `src/utils/techpar-ui.ts`:
  - `tp_calculate`, `tp_scenario_save`, `tp_scenario_load`, `tp_chart_toggle`, `tp_input_change` (with parameter name), `tp_copy_summary`, `tp_print`, `tp_export`
- **Standardize Regulatory Map events** — audit and name unnamed `trackEvent` calls in `src/pages/hub/tools/regulatory-map/index.astro`:
  - `rm_region_select`, `rm_regulation_view`, `rm_filter_change`, `rm_bookmark_toggle`, `rm_timeline_filter`, `rm_search`
- **Add funnel events to all 5 tools** — ensure these milestones exist: `<tool>_start` (first interaction), `<tool>_complete` (meaningful output), `<tool>_export` (copy/print/share)
- **Extend `EventCategory` type** — add `'tool'` to the union in `src/utils/analytics.ts`
- **Tests**:
  - Unit: mock `window.gtag`, verify event names and parameters for each new event
  - E2E: add tool interaction tracking verification to existing tool E2E tests

### Commits

```
feat(analytics): add tool event category to analytics type system
feat(analytics): add interaction tracking to TechPar tool
refactor(analytics): standardize Regulatory Map event naming
feat(analytics): add start/complete/export funnel events to all tools
test(analytics): add unit and E2E tests for tool event tracking
```

### Success Criteria

- All 5 tools have consistent `<tool_code>_<interaction>` event naming
- All 5 tools track start/complete/export funnel milestones
- TechPar has ≥6 interaction events
- Regulatory Map has zero unnamed events
- All events respect cookie consent (Phase 6)

---

## Phase 8: Email Capture

**Status**: Proposed
**Priority**: Medium
**Effort**: 2 days
**Dependencies**: Phase 6 (consent for tracking signup events), Phase 1 (Zod for validation if used client-side)

### Problem

No lead capture mechanism exists beyond Calendly. For PE firms, many decision-makers want to evaluate GST before committing to a calendar slot. Currently they either book or bounce — no middle ground.

### Scope

- **Choose email service** — evaluate Mailchimp, ConvertKit, Buttondown, or Resend:
  - Selection criteria: free tier adequate for low volume, API-based submission (no embed iframes), GDPR-compliant, simple POST endpoint
  - Document the decision
- **Create `src/components/EmailSignup.astro`**:
  - Minimal form: email input + submit button + privacy link
  - Scoped `<style>` following design system (`.brutal-btn`, `--color-primary`, frosted glass)
  - Inline `<script>` handles submission via `fetch()` to email service API
  - States: default, submitting (disabled button), success, error
  - No full name required — minimize friction
- **Integrate into Footer** — add `<EmailSignup />` to `src/components/Footer.astro` below existing links. Brief copy: "Get GST insights delivered" or similar
- **Evaluate CTA section integration** — optionally add to `CTASection.astro` as secondary action. Decision depends on whether dual CTAs dilute primary conversion
- **Track signups** — `trackEvent({ event: 'email_signup', category: 'engagement', source: 'footer' | 'cta-section' })`
- **Update privacy policy** — add email collection disclosure: what's collected (email only), usage (periodic updates), unsubscribe, storage service
- **Validation** — email format validation client-side (Zod or simple regex)
- **Tests**:
  - Unit: form validation (empty, invalid email, valid email)
  - E2E: form renders in footer, submit shows success, error state on network failure

### Commits

```
docs(email): document email service evaluation and selection
feat(email): add EmailSignup component with form validation
feat(email): integrate EmailSignup into Footer
feat(analytics): add email_signup event tracking
docs(privacy): add email collection disclosure to privacy policy
test(email): add unit and E2E tests for email signup flow
```

### Success Criteria

- Email signup form visible in footer on all pages
- Successful submissions recorded in email service
- GA4 event fires on signup (when consent granted)
- Privacy policy updated
- Form handles error states gracefully
- Zero PII stored in client-side code or localStorage

---

## Phase 9: Client-Side Error Monitoring

**Status**: Proposed
**Priority**: Medium
**Effort**: 2 days
**Dependencies**: Phase 6 (consent gating), Phase 2 (CI catches instrumentation regressions)

### Problem

If a tool calculation fails or the Inoreader API errors, it's completely invisible. The codebase uses defensive null-checks and try-catch with silent fallbacks (good for UX, bad for observability). Only 5 files have try-catch, and only 3 log to `console.error`. No error tracking service exists.

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
  - Respects cookie consent (or uses privacy-first config: no PII, no session replay, errors only)
- **Instrument existing silent failures** — add `Sentry.captureException()` alongside existing graceful fallbacks:
  - `src/lib/inoreader/client.ts` — API fetch failures, token refresh, timeouts
  - `src/lib/inoreader/cache.ts` — Redis connection failures
  - `src/scripts/palette-manager.ts` — localStorage access failures
  - `src/utils/techpar-ui.ts` — Chart.js rendering errors
  - Tool page inline scripts — calculation errors
- **Global error boundary** — `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)` in ErrorTracking.astro
- **Alert rules** (documentation only) — recommended alerts: >10 errors/hour on tool pages, any Radar SSR error, any Redis failure
- **Tests**:
  - Unit: Sentry not initialized when consent declined; `captureException` called on instrumented paths
  - E2E: error tracking loads in production; no errors on clean page loads (baseline)

**Not pursuing**: Session replay (LogRocket, Sentry Replay) — adds significant bundle size and privacy complexity for a low-traffic advisory site.

### Commits

```
docs(monitoring): document error monitoring service evaluation
feat(monitoring): add ErrorTracking component with Sentry integration
feat(monitoring): instrument Inoreader client and cache error paths
feat(monitoring): instrument palette-manager and techpar-ui error paths
feat(monitoring): add global error boundary for uncaught exceptions
test(monitoring): add unit and E2E tests for error tracking
docs(monitoring): document recommended Sentry alert rules
```

### Success Criteria

- Client-side JavaScript errors surfaced in Sentry dashboard
- Silent failures in Inoreader client, palette manager, and tool scripts report to Sentry
- Error monitoring respects cookie consent
- Zero increase in console errors visible to users
- Sentry DSN configured via environment variable (not hardcoded)

---

## Phase 10: Astro Platform Alignment, Security & Documentation

**Status**: Proposed
**Priority**: Low
**Effort**: 3 days
**Dependencies**: Phase 1 (Zod schemas for content collections), Phase 5 (sitemap integration), Phase 6 (security headers account for scripts from Phases 7-9)

### Problem

Developer experience gaps (manual sitemap, no content collections, no security headers) and documentation inconsistencies (2 of 6 doc directories have no entry point, 8+ orphaned docs, ~60% content overlap between CI_CD_SUMMARY and GITHUB_ACTIONS_SETUP) create friction that compounds over time.

### Scope

- **Astro content collections for regulatory-map** — migrate 120 JSON files from `src/data/regulatory-map/` to `src/content/regulatory-map/` with Astro's built-in collection validation. Replaces manual `import.meta.glob` + Zod in `fetchRegulations.ts`. No `src/content/` directory exists yet.
- **Security headers** — `vercel.json` with CSP, X-Frame-Options (`DENY`), X-Content-Type-Options (`nosniff`), Referrer-Policy (`strict-origin-when-cross-origin`), Permissions-Policy (disable camera, microphone, geolocation). Astro middleware (`src/middleware.ts`) for SSR routes (Radar).
- **Evaluate `client:visible` for Chart.js** — chart.js is ~200KB; wrapping TechPar chart init in an island could defer loading. Document the decision even if skipped.
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

## Summary Timeline

| Phase | Scope | Effort | Cumulative | Category |
|-------|-------|--------|------------|----------|
| 1 | Data Integrity (Zod, `any` elimination) | 3-4 days | Week 1-2 | Platform |
| 2 | CI/CD & Developer Guardrails | 3 days | Week 2-3 | Platform |
| 3 | Code Structure & CSS Architecture | 5-6 days | Week 3-5 | Platform |
| 4 | Test Coverage & Accessibility | 5 days | Week 5-7 | Platform |
| 5 | SEO Hardening | 1-2 days | Week 7 | Platform |
| 6 | Cookie Consent & GDPR Compliance | 2 days | Week 7-8 | Business |
| 7 | Hub Tool Analytics Standardization | 2 days | Week 8-9 | Business |
| 8 | Email Capture | 2 days | Week 9-10 | Business |
| 9 | Client-Side Error Monitoring | 2 days | Week 10 | Business |
| 10 | Astro Alignment, Security & Docs | 3 days | Week 11-12 | Platform |
| | **Total** | **28-33 days** | **~12 weeks at 50% allocation** | |

---

## Key Design Decisions

1. **Zod schemas in `src/schemas/`, not alongside data** — avoids circular dependencies; single source of truth for data contracts importable by both production code and tests

2. **CSS architecture follows Astro scoped styles convention** — 23 components + 18 pages already use scoped `<style>` tags; `global.css` slimmed to genuinely global concerns (~200-300 lines); CSS custom properties cascade into scoped styles because Astro uses class-based scoping, not shadow DOM; co-location means deleting a component removes its styles automatically

3. **Content collections only for regulatory-map** — other data sources are TypeScript modules with computed values; converting them to content collections would lose type-safe imports for no benefit

4. **No framework adoption** — site works well with inline scripts; no React/Vue/Svelte except possibly a thin Chart.js island

5. **Accessibility ratchet** — axe-core allowlist starts with current violations, must only shrink; prevents new regressions while fixing existing violations incrementally

6. **ESLint flat config** — modern format, works with Astro plugin, avoids deprecated `.eslintrc`

7. **Custom cookie consent, no external library** — site uses one tracking tool (GA4) with no ad cookies; a custom Astro component is simpler and faster than Klaro/Osano/CookieConsent.js; uses GA4 Consent Mode API for standards-compliant gating

8. **Tool analytics follow existing naming convention** — 3 of 5 tools already use `<tool_code>_<interaction>` pattern (dm_, tdc_, icg_); standardize the remaining 2 (tp_, rm_) rather than introducing a new pattern

9. **Email capture in footer, not modal/popup** — always visible, zero-friction, no interruption; avoids aggressive popup patterns that conflict with the professional PE advisory brand

10. **Sentry for error monitoring, not LogRocket/FullStory** — error tracking only, no session replay; minimizes bundle size and privacy surface; `@sentry/astro` provides first-class Astro integration

---

## Commit Strategy

Each phase should produce **atomic commits** — one logical change per commit, independently reviewable and revertable. The commit lists in each phase section above are the recommended granularity.

### Conventions

- **Format**: `type(scope): description` per [Conventional Commits](https://www.conventionalcommits.org/)
- **Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`
- **Scope**: component or area affected (e.g., `schemas`, `css`, `consent`, `analytics`, `seo`, `monitoring`)
- **Body**: explain *why*, not *what* (the diff shows what)

### Principles

1. **One concern per commit** — don't mix a CSS refactor with a new component extraction. If a phase has 5 deliverables, it should have ≥5 commits.
2. **Tests travel with the code they test** — a new component and its tests should be in the same commit, or the test commit immediately follows.
3. **Refactors should not change behavior** — a `refactor()` commit must pass all existing tests with zero changes to test assertions. If tests need updating, that's a signal the commit is doing more than refactoring.
4. **Infrastructure before features** — within a phase, commit configuration/tooling changes before the code that depends on them (e.g., ESLint config before lint-fix commit).
5. **Each commit should build** — never commit code that breaks the build. If a migration requires multiple steps, structure commits so intermediate states still compile.

### Example: Phase 3 commit sequence

```
# Infrastructure first
refactor(css): add z-index scale variables to variables.css

# Component extractions (each independently useful)
feat(components): extract PrintReportHeader shared component
feat(components): extract Card component with variants

# CSS migration (one domain at a time, each commit passes E2E)
refactor(css): move header styles from global.css to Header.astro
refactor(css): move hero styles from global.css to Hero.astro
refactor(css): move portfolio styles from global.css to portfolio components
refactor(css): move tool styles from global.css to tool page scoped styles

# Logic deduplication
refactor(portfolio): align PortfolioHeader filter logic with filterLogic.ts

# Large decompositions
refactor(brand): decompose brand.astro into sub-components
refactor(techpar): modularize techpar-ui.ts into chart, dom, state modules

# Constants cleanup
refactor: extract magic numbers into named constants
```

---

## Related Documentation

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
