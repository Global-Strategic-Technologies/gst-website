# Development Backlog

Consolidated backlog of all open development initiatives for the GST website. Each item is a self-contained user story with enough context to design and implement a solution. Items are grouped by theme, not priority — triage happens separately.

> **Git archaeology**: The initiative documents consolidated into this backlog were removed in the same commit that created this file. Use `git log --diff-filter=D -- src/docs/development/` to find them, then `git show <SHA>~1:src/docs/development/<FILENAME>` to view originals.

---

## Table of Contents

- [Compliance and Privacy](#compliance-and-privacy)
- [Business Capabilities](#business-capabilities)
- [Hub Tools](#hub-tools)
- [CSS and Design System](#css-and-design-system)
- [Testing and CI](#testing-and-ci)
- [Performance](#performance)
- [Infrastructure](#infrastructure)
- [Exploration](#exploration)

---

## Compliance and Privacy

### BL-001: Cookie Consent and GDPR Compliance

**Source**: BUSINESS_ENABLEMENT_V1.md | **Effort**: 2 days | **Status**: Open

**As a** site operator, **I want** a cookie consent mechanism that gates all tracking (GA4, Sentry) behind explicit user consent **so that** the site complies with GDPR for EU visitors.

#### Acceptance Criteria

- [ ] GA4 does not load until user explicitly accepts
- [ ] Error monitoring (Sentry) respects consent or runs under documented legitimate-interest config
- [ ] Consent preference persists across page loads via `localStorage('cookie-consent')`
- [ ] Banner does not appear for returning users who have already chosen
- [ ] "Cookie Preferences" link in footer allows changing choice
- [ ] Privacy policy (`src/pages/privacy.astro`) reflects the consent mechanism
- [ ] Consent banner passes WCAG 2.1 AA accessibility audit (axe-core)

#### Technical Context

- Create `src/components/CookieConsent.astro` — minimal banner in `BaseLayout.astro` (after Header, before main content), two buttons (Accept/Decline), built with existing design system (`.brutal-btn`, frosted glass, CSS variables)
- Gate GA4 via Consent Mode API: `gtag('consent', 'default', { analytics_storage: 'denied' })` on load, update to `'granted'` on acceptance. Modify `src/components/GoogleAnalytics.astro`
- Gate Sentry: modify error tracking component to respect consent, or confirm Sentry's privacy-first config (no PII, errors only) qualifies for legitimate interest
- Add "Cookie Preferences" link in `src/components/Footer.astro` to re-open the banner
- Update `src/pages/privacy.astro` cookie section with consent disclosure
- Custom implementation preferred over external libraries (Klaro, Osano) — site uses one tracking tool plus error monitoring; lightweight component is simpler
- Tests: unit (GA4 gating, persistence), E2E (banner flow), axe-core (WCAG 2.1 AA)

---

### BL-002: Sentry Source Map Upload Activation

**Source**: SENTRY_MANUAL_SETUP.md | **Effort**: 30 min | **Status**: Open

**As a** developer, **I want** Sentry source maps uploaded on production deploys **so that** error stack traces show original TypeScript source lines instead of minified output.

#### Acceptance Criteria

- [ ] Organization Auth Token created at sentry.io
- [ ] `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` environment variables set in Vercel (Production only)
- [ ] Production deploy logs show "Uploading source maps..."
- [ ] Source map artifacts appear in Sentry Releases dashboard
- [ ] Error stack traces in Sentry resolve to original source files

#### Technical Context

- Sentry is already integrated in code (`sentry.client.config.ts`, `sentry.server.config.ts`)
- Source map upload wired in `astro.config.mjs` — just needs env vars to activate
- Alert tag infrastructure in place (`area:inoreader-api`, `area:redis-connection`, etc.)
- This is a manual/ops task — create token, set env vars, trigger deploy, verify

---

### BL-003: Sentry Alert Rule Configuration

**Source**: SENTRY_MANUAL_SETUP.md | **Effort**: 30 min | **Status**: Open

**As a** site operator, **I want** Sentry alert rules configured **so that** I am notified of new errors, error spikes, and critical subsystem failures.

#### Acceptance Criteria

- [ ] "New issue" alert created (triggers on all new issues)
- [ ] "High-volume error spike" alert created (>10 events/hour)
- [ ] "Inoreader API failure" alert created (tag: `area:inoreader-api`)
- [ ] "Redis connection failure" alert created (tag: `area:redis-connection`)
- [ ] Alerts tested with a manual error trigger
- [ ] Optional: Slack or PagerDuty integration configured

#### Technical Context

- All configuration happens in the Sentry dashboard, not in code
- Alert tags are already instrumented in the codebase
- See [SENTRY_MANUAL_SETUP.md](./SENTRY_MANUAL_SETUP.md) for tag reference table, troubleshooting guide, and consent gating evaluation

---

## Business Capabilities

### BL-004: Email Capture System

**Source**: BUSINESS_ENABLEMENT_V1.md | **Effort**: 2 days | **Status**: Open

**As a** site operator, **I want** an email signup form in the footer **so that** prospects who aren't ready to book a call can express interest and I can build a contact database over time.

#### Acceptance Criteria

- [ ] Email signup form visible in footer on all pages
- [ ] Successful submissions recorded in chosen email service
- [ ] GA4 `email_signup` event fires on signup (only when consent granted — depends on BL-001)
- [ ] Privacy policy updated with email collection disclosure
- [ ] Form handles error states gracefully (network failure, API error, validation error)
- [ ] Zero PII stored in client-side code or localStorage
- [ ] Form passes WCAG 2.1 AA accessibility audit

#### Technical Context

- **Prerequisite**: BL-001 (Cookie Consent) must be implemented first — signup tracking must be consent-gated
- Choose email service: evaluate Mailchimp, ConvertKit, Buttondown, or Resend. Criteria: free tier for low volume, API-based submission (no iframes), GDPR-compliant, simple POST endpoint
- Create `src/components/EmailSignup.astro` — minimal form (email input + submit + privacy link), scoped style using design system, inline `<script>` for `fetch()` submission, states: default/submitting/success/error
- Integrate into `src/components/Footer.astro` below existing links. Brief copy, one line
- Evaluate optional placement in `src/components/CTASection.astro` as secondary action alongside CalendarBridge
- Email validation via Zod or simple regex client-side
- Tests: unit (validation, API payload), E2E (footer form, error states), axe-core (WCAG 2.1 AA)

---

### BL-005: BIMI Logo Deployment (Stages 2-3)

**Source**: BIMI_VISUAL_TRUST.md | **Effort**: 30 min code + DNS propagation | **Status**: Open

**As a** site operator, **I want** the GST delta icon displayed as the sender avatar in Gmail, Apple Mail, and Yahoo Mail **so that** recipients see a verified brand identity before opening advisory emails.

#### Acceptance Criteria

- [ ] `public/branding/logo-bimi.svg` created in SVG Tiny PS profile (1:1 square, `version="1.2"`, `baseProfile="tiny-ps"`, no `<script>`/`<style>`, under 32KB)
- [ ] `vercel.json` updated with `Content-Type: image/svg+xml` header for `/branding/logo-bimi.svg`
- [ ] `curl -I https://globalstrategic.tech/branding/logo-bimi.svg` returns HTTP 200 with correct Content-Type, no redirects
- [ ] BIMI TXT record added in Cloudflare: `default._bimi` -> `v=BIMI1; l=https://globalstrategic.tech/branding/logo-bimi.svg; a=;`
- [ ] BIMI Inspector validation passes
- [ ] Test email to Gmail shows logo in inbox

#### Technical Context

- Stage 1 (DNS hardening) already complete: DMARC `p=quarantine; pct=100`, SPF `-all`, DKIM active
- Source logo: `public/images/logo/gst-delta-icon-teal-stroke-thick.svg` (64x64, ~300 bytes)
- Conversion: scale to 512x512, add solid background (#0a0a0a) for mail client rendering, set SVG Tiny PS attributes
- DNS record is a manual step in Cloudflare (1-48h propagation)
- Validation tools: bimigroup.org/bimi-generator, mxtoolbox.com/bimi.aspx

---

### BL-006: BIMI CMC Certificate

**Source**: BIMI_VISUAL_TRUST.md | **Effort**: Purchase + config | **Status**: Deferred

**As a** site operator, **I want** a Common Mark Certificate (CMC) for BIMI **so that** the logo display is cryptographically verified and more mail clients render it.

#### Acceptance Criteria

- [ ] CMC certificate purchased from DigiCert or Entrust (~$100-300/year)
- [ ] Certificate hosted at stable HTTPS URL (e.g., `https://globalstrategic.tech/branding/gst-bimi.pem`)
- [ ] BIMI DNS record `a=` tag updated with certificate URL

#### Technical Context

- Requires 12 months of logo usage history as proof
- Updates the existing BIMI DNS record from BL-005 — adds certificate URL to the `a=` field
- Delivers 90% of the value without a trademark — logo displays in inboxes

---

### BL-007: BIMI VMC Upgrade and USPTO Trademark

**Source**: BIMI_VISUAL_TRUST.md | **Effort**: 8-12 months (trademark) + ~$1,500/year (VMC) | **Status**: Deferred

**As a** site operator, **I want** a Verified Mark Certificate (VMC) with a registered trademark **so that** the GST delta icon appears with a Gmail blue verified checkmark.

#### Acceptance Criteria

- [ ] USPTO trademark filed for GST delta icon ($250-350/class, Class 35 and/or Class 42)
- [ ] After trademark registration: VMC certificate purchased (~$1,500/year)
- [ ] BIMI DNS record updated with VMC certificate URL
- [ ] Gmail displays blue verified checkmark alongside logo

#### Technical Context

- USPTO timeline: 8-12 months from filing to registration
- Process: file application -> examiner reviews (3-4 months) -> published for opposition (30 days) -> registration issued
- Requires proof the mark is in use in commerce (website screenshots, client communications)
- Self-filing via teas.uspto.gov possible; attorney recommended ($500-1,500 for simple filing)
- Same infrastructure as BL-005/BL-006, different CA verification level

---

## Hub Tools

### BL-008: Hub Tools UX Unification Phase 1 — Quick Wins

**Source**: HUB_TOOLS_UX_UNIFICATION.md | **Effort**: Small | **Status**: Open

**As a** developer, **I want** the option card and button patterns unified across hub tools **so that** I maintain one pattern instead of three independent implementations.

#### Acceptance Criteria

- [ ] DM's `.option-card` pattern moved to `global.css` as shared class
- [ ] TechPar `.tp-stage-card` and ICG `.icg-stage-card`/`.icg-opt-btn` migrated to shared `.option-card` class with `.option-card--compact` modifier
- [ ] TechPar `.tp-btn-share/back/next` replaced with `.hub-btn--secondary`/`.cta-button`
- [ ] ICG `.icg-btn-primary/secondary` wrappers removed, uses `.hub-btn` directly
- [ ] `.no-print` utility added to `global.css`
- [ ] RegMap gets `@media print` block
- [ ] Net CSS impact: ~-60 tool-specific lines

#### Technical Context

- Divergence map: 3 independent option/stage card implementations, 3 different button approaches
- Target: DM's `.option-card` is the most complete (icon, label, description, selected state, dark theme, focus-visible)
- Files: `global.css`, TechPar page, ICG page, RegMap page
- No visual changes to end users — same appearance, shared classes
- Verification: build, unit/integration tests, visual diff at desktop/768px/480px in both themes

---

### BL-009: Hub Tools UX Unification Phase 2 — Dark Theme Variable Migration

**Source**: HUB_TOOLS_UX_UNIFICATION.md | **Effort**: Medium | **Status**: Open

**As a** developer, **I want** all hub tools to use CSS variables for dark theme instead of explicit `:global(html.dark-theme)` selectors **so that** theme changes require editing one variable, not 82 scattered overrides.

#### Acceptance Criteria

- [ ] All 82 explicit dark theme overrides audited and cataloged (DM: 27, ICG: 31, RegMap: 24)
- [ ] Missing dark-theme variables created in `variables.css` (~5-10 new vars)
- [ ] DM: 27 `:global(html.dark-theme)` selectors replaced with variable references
- [ ] ICG: 31 selectors replaced
- [ ] RegMap: 24 selectors replaced
- [ ] Zero tool-scoped `:global(html.dark-theme)` overrides remain

#### Technical Context

- TechPar already uses zero explicit dark overrides (CSS variables only) — this is the target pattern per STYLES_GUIDE.md
- TDC has only 1 override (near-complete)
- Each tool page is a single file to modify
- Verification: build, tests, visual diff in both themes across all tools

---

### BL-010: Hub Tools UX Unification Phase 3 — Navigation and Form Patterns

**Source**: HUB_TOOLS_UX_UNIFICATION.md | **Effort**: Medium | **Status**: Open

**As a** developer, **I want** navigation and form patterns extracted into shared classes **so that** new tools can reuse tab bars, progress indicators, and form fields without reimplementing them.

#### Acceptance Criteria

- [ ] TechPar `.tp-tab-bar`/`.tp-tab` extracted to shared `.tool-tabs`/`.tool-tab` in `global.css`
- [ ] DM `.wizard-progress` renamed to `.tool-wizard-progress` in global
- [ ] ICG `.icg-progress` renamed to `.tool-progress-bar` in global
- [ ] TechPar `.tp-field`/`.tp-hint`/`.tp-input-wrap` extracted to `.tool-field`/`.tool-field__hint`/`.tool-field__input`
- [ ] TDC `.calc-slider`/`.slider-row` extracted to `.tool-slider`/`.tool-slider-row`
- [ ] Tools adopt shared classes

#### Technical Context

- Three different navigation paradigms (tabs, segmented wizard, linear progress bar) for three different UX needs — they solve different problems and should not be merged, only named consistently
- Form controls: only TDC has sliders, only TechPar has text inputs — document in design system but don't force consolidation until a second tool needs them
- Estimated CSS impact: -150 tool-specific lines, +120 shared lines (net -30, major reusability gain)

---

### BL-011: Hub Tools UX Unification Phase 4 — Tool Shell Alignment

**Source**: HUB_TOOLS_UX_UNIFICATION.md | **Effort**: Small | **Status**: Open

**As a** developer, **I want** tool container naming to follow the `.tool-shell` convention **so that** the codebase uses consistent naming for layout containers.

#### Acceptance Criteria

- [ ] TechPar `.techpar-shell` renamed to `.tool-shell--fluid` (already exists in global)
- [ ] DM output wrapped in `.tool-shell--document` (800px, already exists)
- [ ] RegMap `.map-layout` unchanged (full-width map is intentional)

#### Technical Context

- TechPar, DM, and RegMap skip `.tool-shell` for valid reasons (fluid layout, wizard pattern, map visualization)
- This is a naming alignment, not a layout change — adopt `.tool-shell` naming conventions where feasible
- RegMap explicitly excluded from changes

---

### BL-012: Tech Debt Calculator — Shareable State and Export (P1)

**Source**: TECH_DEBT_CALC_ROADMAP.md | **Effort**: S-XS per item | **Status**: Open

**As a** PE advisor, **I want** to persist, share, and export calculator results **so that** I can carry outputs into diligence conversations, memos, and slide decks.

#### Acceptance Criteria

- [ ] URL-encoded state persistence: `CalcState` serialized into URL search params on every `render()`, deserialized on mount before `initSliders()`
- [ ] Copy link button: single-click copies current URL (with encoded state) to clipboard with visual confirmation
- [ ] Print stylesheet: `@media print` collapses inputs panel, expands outputs/context for clean 1-page PDF
- [ ] Plain-text export: "Copy Summary" button formats structured text block (annual cost, per-eng cost, burden level, payback) for pasting into memos

#### Technical Context

- All 4 items implementable entirely within `src/pages/hub/tools/tech-debt-calculator/index.astro` — no new files required
- URL state encoding: `URLSearchParams` + `btoa`/`atob` to stay within no-dependency constraint
- Engine: `src/utils/tech-debt-engine.ts` (pure TypeScript, 38 unit tests)
- Layout already has logical separation between `[data-calc-inputs]` and `[data-calc-outputs]`
- Highest-ROI cluster — minimal code, maximum PE workflow impact

---

### BL-013: Tech Debt Calculator — Scenario Comparison Mode (P2)

**Source**: TECH_DEBT_CALC_ROADMAP.md | **Effort**: M | **Status**: Open

**As a** PE advisor, **I want** to compare a baseline scenario against modified inputs **so that** I can model "before vs. after remediation" in a single view.

#### Acceptance Criteria

- [ ] "Set as Baseline" button freezes current `CalcResult` in memory
- [ ] Metrics bar gains delta indicators (down-arrow $X / down-arrow N%) showing change from baseline
- [ ] Baseline cleared on mode switch or explicit "Clear Baseline" action

#### Technical Context

- Engine is already stateless and pure — comparison is a UI-only addition
- Use case: model "what if we cut maint% from 50 to 25 after a $1M remediation" against original state

---

### BL-014: Tech Debt Calculator — Calculation Model Improvements (P3)

**Source**: TECH_DEBT_CALC_ROADMAP.md | **Effort**: S per item | **Status**: Open

**As a** PE advisor, **I want** more realistic calculation parameters **so that** outputs are defensible in diligence conversations.

#### Acceptance Criteria

- [ ] Partial remediation efficiency slider (0-100%, default 70%): `monthlySavings = totalMonthly * (efficiency/100)` instead of assuming 100% resolution
- [ ] Context-switch overhead toggle in Deep Dive: adds ~23% overhead to direct labor cost (Weinberg's research), displayed as separate line item
- [ ] Currency selector (USD/EUR/GBP/CAD/AUD): static multiplier applied to formatted outputs via `fmt()` and `fmtShort()` currency param

#### Technical Context

- Remediation slider replaces `monthlySavings = totalMonthly` alias — the current assumption of 100% debt resolution is unrealistic
- Currency selector requires only a `fmtCurrency(n, currency)` wrapper in `tech-debt-engine.ts` — engine math is currency-agnostic
- Context-switch overhead kept as separate line item for transparency and auditability

---

### BL-015: Tech Debt Calculator — Accessibility and CSS Hardening (P4)

**Source**: TECH_DEBT_CALC_ROADMAP.md | **Effort**: S | **Status**: Open

**As a** user with assistive technology, **I want** proper ARIA attributes on calculator controls **so that** screen readers announce input values and recalculation results.

#### Acceptance Criteria

- [ ] All `<input type="range">` elements get `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext` (updated in `render()`)
- [ ] Deploy frequency buttons get `aria-pressed` state (updated to reflect `state.deployIdx`)
- [ ] Metrics bar wrapped in `role="status" aria-live="polite" aria-atomic="false"`
- [ ] All hardcoded `rgba(5, 205, 153, ...)` replaced with `var(--color-primary-rgb)` tokens
- [ ] All bare font-size literals (`0.56rem`, `0.58rem`, etc.) replaced with typography scale variables

#### Technical Context

- CSS violations are against the project's own standards documented in STYLES_GUIDE.md and VARIABLES_REFERENCE.md
- `aria-valuetext` should reuse formatted strings already computed in `render()` (e.g., "8 engineers", "$150K salary")
- All CSS changes must be verified in both light and dark theme

---

### BL-016: Tech Debt Calculator — Executive Summary Mode (P5)

**Source**: TECH_DEBT_CALC_ROADMAP.md | **Effort**: M | **Status**: Open

**As a** PE advisor, **I want** an executive summary tab with industry archetype presets **so that** I can quickly generate a narrative output for board presentations without manually configuring sliders.

#### Acceptance Criteria

- [ ] Third tab alongside Quick / Deep Dive
- [ ] 4-5 pre-configured archetypes (SaaS Series A, SaaS Series C, PE Portfolio Co., Enterprise ISV) with preset values
- [ ] Selecting an archetype populates `state` and renders a 3-4 sentence executive narrative paragraph
- [ ] "Customize" button transitions to Deep Dive with archetype values pre-loaded
- [ ] Narrative templates are pure functions in `tech-debt-engine.ts` (testable)

#### Technical Context

- Completes the audience spectrum: Quick (napkin), Deep Dive (analyst), Executive Summary (board/memo)
- No sliders in this mode — archetypes are pre-configured input sets
- Archetype examples: SaaS Series A (8 eng, $130K, 45% maint, weekly deploys), PE Portfolio Co. (20 eng, $140K, 55% maint, monthly deploys)

---

### BL-017: Tech Debt Calculator — Diligence Machine Cross-Link (P6)

**Source**: TECH_DEBT_CALC_ROADMAP.md | **Effort**: S | **Status**: Open

**As a** PE advisor using the Diligence Machine, **I want** a contextual link to the Tech Debt Calculator when high technical debt risk is flagged **so that** I can quantify the cost without manually navigating.

#### Acceptance Criteria

- [ ] When DM output flags "high technical debt risk", a CTA card links to Tech Debt Calculator
- [ ] URL state pre-populated based on DM inputs (team size, maturity level)
- [ ] Navigation/UX change only — no new data infrastructure

#### Technical Context

- Depends on BL-012 (URL-encoded state persistence) being implemented first
- Cross-link is between two existing tools — no new APIs or data sources

---

### BL-018: Tech Debt Calculator — Architecture and Testing (P7)

**Source**: TECH_DEBT_CALC_ROADMAP.md | **Effort**: M | **Status**: Open

**As a** developer, **I want** the calculator's render layer decomposed and tested **so that** DOM-layer changes can be safely refactored.

#### Acceptance Criteria

- [ ] `render()` decomposed into sub-functions: `renderMetricsBar()`, `renderContextPanel()`, `renderPayback()`, `renderSliderDisplays()` — each takes `CalcResult` and `CalcState` as params
- [ ] DOM integration tests added (Vitest + JSDOM): mode switch, slider input, deploy button click, URL state round-trip
- [ ] `SoftwareApplication` JSON-LD structured data added to page `<head>`

#### Technical Context

- Current `render()` is a 100-line monolith with no sub-renders — hard to unit-test DOM layer
- `el()`/`getInput()` helpers cast to non-null without null guards
- JSON-LD: `name`, `description`, `applicationCategory: "BusinessApplication"`, `operatingSystem: "Web"` — zero runtime cost

---

## CSS and Design System

### BL-019: Site-Wide light-dark() CSS Migration

**Source**: BUSINESS_ENABLEMENT_V1.md, DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 1-4 days | **Status**: Blocked

**As a** developer, **I want** dark theme declarations to use CSS `light-dark()` instead of paired base-rule + override-rule **so that** each themed declaration is a single-location edit instead of two disjoint locations.

#### Acceptance Criteria

- [ ] All 51 dark-theme variable redeclarations in `variables.css` migrated to `light-dark()` at `:root` level
- [ ] Scattered `html.dark-theme` selectors in `global.css` and scoped component styles migrated to inline `light-dark()` calls
- [ ] `html.dark-theme` override block reduced from ~211 lines to <50 lines
- [ ] All 6 alternative palettes visually identical pre/post migration
- [ ] Compiled CSS output size equal or smaller
- [ ] All unit, integration, and E2E tests pass with zero assertion changes
- [ ] STYLES_GUIDE.md updated to document `light-dark()` as preferred pattern

#### Technical Context

- **Blocked on**: Hardening-2 pilot validation — `light-dark()` pilot must land and meet success signals (tests pass, visual diff zero across both themes and all 6 palettes, LightningCSS output stable)
- LightningCSS (already active as Vite CSS transformer) compiles `light-dark()` to universally compatible output
- Requires `color-scheme: light`/`color-scheme: dark` wired on `html`/`html.dark-theme`
- Implementation should proceed in 4-6 commits grouped by component area, with visual verification after each batch
- Does NOT affect the 6-palette alternative system (palettes use a different cascade mechanism)

---

### BL-020: Design System Package Extraction

**Source**: DESIGN_SYSTEM_FUTURE_INITIATIVES.md | **Effort**: Large | **Status**: Deferred

**As a** developer working on a second GST project, **I want** the design system extracted into a standalone npm package **so that** multiple projects can share the same design language with versioned releases.

#### Acceptance Criteria

- [ ] Design system CSS, tokens, and component classes packaged as standalone npm module
- [ ] Current site imports from the package with zero visual regression
- [ ] Versioned releases aid multi-developer coordination

#### Technical Context

- **Deferred indefinitely** — no current need. Re-evaluate when: a second project needs the same design language, the design system stabilizes, or the team grows beyond one person
- Single consumer (GST website only), no monorepo infrastructure exists
- Current architecture is already clean (single import through BaseLayout)
- Depends on BL-021 (global.css Split) as a prerequisite

---

### BL-021: global.css Split

**Source**: DESIGN_SYSTEM_FUTURE_INITIATIVES.md | **Effort**: Medium | **Status**: Deferred

**As a** developer preparing for package extraction, **I want** `global.css` split into `tokens.css`, `components.css`, and `layout.css` **so that** the design system's reusable parts are separated from application-specific styles.

#### Acceptance Criteria

- [ ] `tokens.css` contains CSS custom properties, reset styles, root declarations
- [ ] `components.css` contains all `.brutal-*` reusable component classes
- [ ] `layout.css` contains application-specific page layouts
- [ ] Import order preserved, no visual regressions

#### Technical Context

- **Deferred** — only needed if BL-020 (Package Extraction) becomes active
- `global.css` is currently 5,465 lines mixing tokens, components, and layout
- The split is mechanical but large — careful import order management required

---

## Testing and CI

### BL-022: Lighthouse CI for Performance Monitoring

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 2-3 hours | **Status**: Open

**As a** developer, **I want** Lighthouse CI integrated into the GitHub Actions pipeline **so that** performance regressions are caught before reaching production and performance budgets are enforced on every PR.

#### Acceptance Criteria

- [ ] `@lhci/cli` installed and configured
- [ ] GitHub Actions workflow created (`.github/workflows/lighthouse.yml`)
- [ ] Performance budgets set: LCP < 2.5s, FCP < 1.8s, CLS < 0.1, TBT < 200ms
- [ ] First baseline report generated
- [ ] Build fails if LCP degrades beyond threshold
- [ ] Developers notified of performance impact in PRs

#### Technical Context

- Current state: performance validated manually via Lighthouse reports, no automated CI checks
- Vercel Speed Insights provides post-deployment monitoring but no pre-merge gate
- Configuration in `lighthouserc.json` with `lighthouse:recommended` preset plus custom assertions
- Consider Slack notifications for failures

---

### BL-023: E2E Test for Image Loading Regression

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 30 min | **Status**: Open

**As a** developer, **I want** an E2E test verifying `fetchpriority="high"` on About page founder images **so that** LCP optimizations don't regress during refactoring.

#### Acceptance Criteria

- [ ] Test added to `tests/e2e/about-page.test.ts`
- [ ] Verifies image is not lazy-loaded
- [ ] Verifies `fetchpriority="high"` attribute present
- [ ] Verifies image dimensions are set (prevents CLS)
- [ ] Test passes on every commit with no false positives

#### Technical Context

- About page has founder images optimized with `fetchpriority="high"` — no automated regression detection if attributes are accidentally removed
- Target selector: `.founder-image`
- Expected dimensions: `width="600"`, `height="450"`

---

### BL-024: Unit Tests for Error Handling

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 1-2 hours | **Status**: Open

**As a** developer, **I want** unit tests covering error handling for localStorage, JSON parsing, and DOM element access **so that** error handling code is validated and fallback behavior is verified.

#### Acceptance Criteria

- [ ] localStorage error handling tested (ThemeToggle: unavailable storage, setItem failure in private browsing)
- [ ] JSON parsing error handling tested (Portfolio: malformed JSON, empty array fallback)
- [ ] DOM element access tested (ProjectModal: missing elements, partial element existence)
- [ ] 100% coverage of error paths
- [ ] All tests pass on every commit

#### Technical Context

- Error handling was added during Console Error Elimination (Feb 2026) but never tested
- Components: ThemeToggle.astro (localStorage), Portfolio components (JSON parsing), ProjectModal (DOM access)
- Create `tests/unit/error-handling.test.ts`

---

### BL-025: Single-Browser CI for E2E Tests

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 30 min | **Status**: Open

**As a** developer, **I want** E2E tests to run on Chromium only in the default CI pipeline **so that** CI wall-clock time drops from ~20 min to ~7 min without sacrificing cross-browser safety.

#### Acceptance Criteria

- [ ] Default CI E2E step runs `--project=chromium` only and completes in <8 minutes
- [ ] Separate GitHub Actions workflow (`test-cross-browser.yml`) runs all 3 browsers on nightly schedule, PRs targeting `master`, and manual dispatch
- [ ] Cross-browser regressions caught within 24 hours
- [ ] Zero cross-browser bugs shipped that would have been caught by old config

#### Technical Context

- Current 3-browser configuration runs every test 3 times, tripling CI wall-clock time
- Cross-browser bugs are rare for this codebase (static Astro site, no browser-specific JS APIs)
- Add a `chromium-only` project to `playwright.config.ts`
- Tag known cross-browser-sensitive tests with `@crossbrowser` annotation

---

## Performance

### BL-026: Performance Monitoring Dashboard

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 1-2 hours | **Status**: Open

**As a** site operator, **I want** a consolidated view of performance metrics **so that** I can track trends over time and communicate improvements to stakeholders.

#### Acceptance Criteria

- [ ] Monthly performance reports tracking LCP, FCP, CLS, TBT over time
- [ ] Year-over-year trend visibility
- [ ] Single source of truth for performance metrics

#### Technical Context

- Recommended starting point: lightweight markdown reports in `/docs/performance/reports/` (Option A)
- Graduate to GitHub Pages with automated Lighthouse CI summaries (Option B) if team needs historical data visualization
- Premium options (Calibre, SpeedCurve) available but not recommended initially
- Depends on BL-022 (Lighthouse CI) for automated data

---

### BL-027: Global CSS Refactoring

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 8-16 hours | **Status**: Deferred

**As a** developer, **I want** remaining component-specific styles extracted from `global.css` into scoped blocks **so that** the global stylesheet is smaller and pages load only the CSS they need.

#### Acceptance Criteria

- [ ] Component-specific styles extracted from `global.css` into scoped `<style>` blocks
- [ ] Lighthouse CSS metrics do not regress

#### Technical Context

- **Deferred** — high risk (8-16h effort), `global.css` already reduced significantly in Platform Hardening V1 Phase 3
- Only revisit if Lighthouse CSS metrics regress

---

### BL-028: CSS Code Splitting via @layer

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 4-8 hours | **Status**: Deferred

**As a** developer, **I want** non-critical CSS layers loaded with lower priority **so that** initial page render performance improves.

#### Acceptance Criteria

- [ ] Non-critical CSS layers identified and loaded with lower priority
- [ ] No visual regressions

#### Technical Context

- **Deferred** — CSS `@layer` adopted in Phase 3 for organization, but code-splitting deferred because marginal gain doesn't justify architectural complexity
- Revisit only after BL-027 (Global CSS Refactoring) is complete

---

### BL-029: Diligence Machine Wizard Lazy-Rendering

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 4-6 hours | **Status**: Deferred

**As a** developer, **I want** the Diligence Machine wizard to defer rendering of non-visible steps **so that** initial page load is faster.

#### Acceptance Criteria

- [ ] Non-visible wizard steps use `content-visibility: auto` or equivalent
- [ ] SEO and accessibility not degraded

#### Technical Context

- **Deferred** — all 10 wizard steps are server-rendered upfront; switching to client-side rendering would degrade SEO and accessibility
- Consider `content-visibility: auto` as middle-ground if Speed Insights score remains below 80

---

### BL-030: Transition Rule Consolidation

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 3-5 hours | **Status**: Deferred

**As a** developer, **I want** the 82 `transition:` declarations consolidated where possible **so that** CSS maintenance surface is reduced.

#### Acceptance Criteria

- [ ] Transition declarations consolidated where safe
- [ ] No hover/focus animation regressions

#### Technical Context

- **Deferred** — each declaration serves a specific component; consolidating risks breaking animations
- Low impact — transition declarations add negligible parse-time cost

---

## Infrastructure

### BL-031: MCP Server — Internal Prototype (Phase 1)

**Source**: MCP_SERVER_INITIATIVE.md | **Effort**: 1-2 days | **Status**: Open

**As a** GST team member, **I want** a local MCP server exposing the diligence engine and portfolio search **so that** I can query GST's tools from Claude Desktop and Claude Code without opening the website.

#### Acceptance Criteria

- [ ] Stdio transport MCP server built with TypeScript SDK
- [ ] `generate_diligence_agenda` tool exposed (wraps existing `src/utils/diligence-engine.ts`)
- [ ] `search_portfolio` tool exposed (wraps existing `src/utils/filterLogic.ts`)
- [ ] Works with Claude Desktop and Claude Code

#### Technical Context

- GST's diligence engine and filter logic are already pure functions — they port to MCP tools with minimal refactoring
- Stdio transport for local use only — no auth needed
- Use `@modelcontextprotocol/sdk` TypeScript SDK
- No changes to existing site infrastructure

---

### BL-032: MCP Server — Internal Remote (Phase 2)

**Source**: MCP_SERVER_INITIATIVE.md | **Effort**: 1 week | **Status**: Open

**As a** GST team member, **I want** the MCP server deployed to Cloudflare Workers **so that** I can access GST tools from any machine without local setup.

#### Acceptance Criteria

- [ ] MCP server deployed to Cloudflare Worker
- [ ] API key authentication for team use
- [ ] Radar intelligence tools added (`search_radar`, `get_latest_insights`)
- [ ] Global edge deployment with low latency

#### Technical Context

- Cloudflare Workers free tier handles prototype volume
- Streamable HTTP transport for remote access
- Rate limiting essential — protect Inoreader API from agent-driven traffic
- Separate infrastructure from Vercel site (recommended architecture)

---

### BL-033: MCP Server — External Pilot (Phase 3)

**Source**: MCP_SERVER_INITIATIVE.md | **Effort**: 2 weeks | **Status**: Open

**As a** PE firm client, **I want** to connect my AI tools to GST's MCP server **so that** my agents can query GST's diligence engine and portfolio data during deal evaluation.

#### Acceptance Criteria

- [ ] OAuth 2.1 with PKCE authentication for external clients
- [ ] Rate limiting and audit logging for compliance-sensitive PE clients
- [ ] Offered to select PE clients as a pilot
- [ ] Listed in MCP directories (MCPMarket.com, etc.)

#### Technical Context

- Security is critical: diligence engine and portfolio data are proprietary IP
- Tool outputs must be sanitized against prompt injection
- Audit logging every tool invocation for compliance
- This is a competitive differentiator — boutique advisory + AI-native tooling is rare in M&A advisory

---

### BL-034: GitHub Branch Protection Update

**Source**: PLATFORM_HARDENING_V1.md | **Effort**: 10 min | **Status**: Open

**As a** developer, **I want** the branch protection ruleset updated to require the `Lint & Type Check` CI job **so that** PRs cannot merge without passing lint and type checks.

#### Acceptance Criteria

- [ ] Branch protection ruleset on `master` updated to require `Lint & Type Check` status check
- [ ] PRs that fail lint or type checks are blocked from merging

#### Technical Context

- The `Lint & Type Check` job was introduced in Platform Hardening V1 Phase 2 CI restructure
- Could not be added before merge because GitHub doesn't recognize status checks that haven't run yet on the target branch
- Manual step: GitHub repository settings -> Branch protection rules -> Add `Lint & Type Check` to required status checks
- Verify `astro dev` no longer emits `[content] Content config not loaded` warning (also from Phase 2)

---

## Exploration

### BL-035: Dynamic Visual Effects Prototype

**Source**: DYNAMIC_VISUAL_EFFECTS.md | **Effort**: 2-4h prototype, 4-8h polish if approved | **Status**: Open

**As a** site visitor, **I want** subtle ambient motion in the homepage hero section **so that** the page feels alive and signals an active, technology-forward brand.

#### Acceptance Criteria

- [ ] `src/components/AmbientEffect.astro` created with top 2 candidate effects (Grid Pulse and Ambient Glow Shift)
- [ ] Rendered in Hero section only, behind all content
- [ ] `prefers-reduced-motion: reduce` disables all motion entirely
- [ ] Mobile (<768px): reduced or disabled without layout shift
- [ ] Works with both light/dark themes and all 6 palettes (uses `--color-primary`, not hardcoded)
- [ ] Lighthouse performance score does not drop more than 2 points on mobile
- [ ] Stakeholder review before proceeding to production polish

#### Technical Context

- Brand alignment concern: brutalism rejects ornament; direct port of bubble/particle effects would NOT align. Must be geometrically structured, monochrome, very restrained — closer to "data field" than "bubbles"
- Top candidates: (1) Grid Pulse — brightness pulses across existing checkerboard grid, (2) Ambient Glow Shift — slow-cycling radial gradients in hero background
- Technical constraints: max 15 animated elements, CSS animations or GPU-composited `transform`/`opacity` only, no JS animation loops, no external dependencies, `pointer-events: none`, `aria-hidden="true"`
- Evaluation criteria: brand test (technology advisory, not consumer), subtlety test (subconscious after a few seconds), performance test, theme test, reduced-motion test, mobile test
- Decision framework: Go (passes all 6 criteria) / No-go (archive, document findings) / Kill (requires external dependencies or exceeds 8h)
- This is exploratory — no commitment to ship

---

_Created: April 18, 2026_
