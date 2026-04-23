# Development Backlog

Consolidated backlog of open development initiatives for the GST website. Each item is a self-contained user story with enough context to design and implement a solution. Items are grouped by theme, not priority — triage happens separately.

> **Completed and closed items**: 27 items were completed or closed through April 2026 (BL-002, 003, 008–019, 021, 023–025, 027–030, 034, 036–039). Use `git log` to find their original acceptance criteria and technical context.

---

## Table of Contents

- [Compliance and Privacy](#compliance-and-privacy)
- [Business Capabilities](#business-capabilities)
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

## CSS and Design System

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
- Prerequisite: global.css split (BL-021, complete) already done

---

## Testing and CI

### BL-022: Lighthouse CI for Performance Monitoring

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 2-3 hours | **Status**: Complete

**As a** developer, **I want** Lighthouse CI integrated into the GitHub Actions pipeline **so that** performance regressions are caught before reaching production and performance budgets are enforced on every PR.

#### Acceptance Criteria

- [x] `@lhci/cli` installed and configured
- [x] GitHub Actions workflow created (`.github/workflows/lighthouse.yml`)
- [x] Performance budgets set: LCP < 2.5s, FCP < 1.8s, CLS < 0.1, TBT < 200ms
- [x] First baseline report generated
- [x] Build fails if LCP degrades beyond threshold
- [x] Developers notified of performance impact in PRs

#### Technical Context

- Lighthouse CI runs on every PR to `master` and via manual dispatch
- Configuration in `lighthouserc.cjs` with desktop preset, 10 audited pages
- Step summary renders full scores table (Performance, FCP, LCP, TBT, CLS) with report links
- CLS assertion set to `error` (blocks merge); other metrics set to `warn`
- Reports uploaded to temporary-public-storage for review

---

## Performance

### BL-026: Performance Monitoring Dashboard

**Source**: DEVELOPMENT_OPPORTUNITIES.md | **Effort**: 1-2 hours | **Status**: Complete

**As a** site operator, **I want** a consolidated view of performance metrics **so that** I can track trends over time and communicate improvements to stakeholders.

#### Acceptance Criteria

- [x] Monthly performance reports tracking LCP, FCP, CLS, TBT over time
- [x] Year-over-year trend visibility
- [x] Single source of truth for performance metrics

#### Technical Context

- Static HTML + Chart.js dashboard deployed to GitHub Pages via `gh-pages` branch
- Weekly cron (`perf-dashboard.yml`) runs Lighthouse CI, appends scores to `data/lighthouse-history.json`
- Dashboard URL: `global-strategic-technologies.github.io/gst-website/`
- Brutalist dark theme with frosted-glass panels matching the main site aesthetic
- Scripts on `master`: `scripts/extract-lighthouse-metrics.mjs`, `scripts/merge-lighthouse-history.mjs`
- Dashboard templates on `master`: `scripts/dashboard/` (seeded to `gh-pages` on each run)

---

### BL-040: Desktop Performance — Regulatory Map and Radar Speed Improvements

**Source**: Vercel Speed Insights (April 2026) | **Effort**: M (4-8 hours) | **Status**: Open

**As a** desktop user, **I want** the Regulatory Map and Radar pages to load faster **so that** I don't experience jank or delays when using the most data-heavy hub tools.

#### Current Metrics (Vercel Speed Insights — Desktop, Last 7 Days)

| Route                       | Score | Issue             |
| --------------------------- | ----- | ----------------- |
| `/hub/tools/regulatory-map` | 78    | Needs Improvement |
| `/hub/radar`                | 78    | Needs Improvement |

Site-wide desktop: FCP 0.94s, LCP 0.94s, INP 48ms, CLS 0, TTFB 0.4s — overall score 100. These two pages are the only desktop outliers.

#### Acceptance Criteria

- [ ] `/hub/tools/regulatory-map` desktop score ≥ 90 in Vercel Speed Insights
- [ ] `/hub/radar` desktop score ≥ 90 in Vercel Speed Insights
- [ ] No regressions on other pages (all currently ≥ 90)
- [ ] Lighthouse desktop audit confirms improvements

#### Investigation Areas

- **Regulatory Map**: loads 120 regulation JSON files + TopoJSON map data + D3 rendering. Profile for: large JS bundle (D3), blocking data fetches, render-blocking map initialization, timeline DOM size
- **Radar**: fetches Inoreader API feed via serverless function + renders feed items. Profile for: API response time (Inoreader → KV cache → client), large DOM from feed items, client-side filtering/rendering cost
- Common patterns to evaluate: lazy-load below-fold content, defer non-critical JS, reduce initial DOM size, optimize data fetching (prefetch vs. on-demand)

---

### BL-041: Mobile Performance — Brand, Portfolio, and Diligence Machine Optimization

**Source**: Vercel Speed Insights (April 2026) | **Effort**: M-L (6-12 hours) | **Status**: Open

**As a** mobile user, **I want** the Brand, M&A Portfolio, and Diligence Machine pages to load and respond faster **so that** the experience on phones and tablets matches the desktop quality.

#### Current Metrics (Vercel Speed Insights — Mobile, Last 7 Days)

| Route                          | Score | Issue                     |
| ------------------------------ | ----- | ------------------------- |
| `/brand`                       | 22    | Needs Improvement (worst) |
| `/hub/tools/diligence-mach...` | 56    | Needs Improvement         |
| `/ma-portfolio`                | 75    | Needs Improvement         |
| `/services`                    | 54    | Needs Improvement         |

Site-wide mobile: FCP 1.08s, LCP 1.1s, INP 136ms, CLS 0, TTFB 0.43s — overall score 100. These pages drag down the per-route mobile experience.

#### Acceptance Criteria

- [ ] `/brand` mobile score ≥ 50 (from 22 — largest improvement target)
- [ ] `/hub/tools/diligence-machine` mobile score ≥ 70 (from 56)
- [ ] `/ma-portfolio` mobile score ≥ 85 (from 75)
- [ ] `/services` mobile score ≥ 70 (from 54)
- [ ] INP ≤ 100ms on all target pages (currently 136ms site-wide)
- [ ] No regressions on pages currently scoring well

#### Investigation Areas

- **Brand page** (score 22): massive DOM — renders every design system component as a showcase. Profile for: total DOM nodes, unused CSS loaded for specimens, image/SVG weight, consider lazy-loading sections below the fold or paginating component groups
- **Diligence Machine** (score 56): 10 wizard steps server-rendered upfront. Profile for: total DOM size (all steps rendered but hidden), JS initialization cost for wizard logic, form input event handling overhead
- **M&A Portfolio** (score 75): 57 project cards + filter drawer + modal. Profile for: initial card render count (consider virtual scrolling or progressive loading), filter chip interaction cost (INP), modal pre-rendering overhead
- **Services page** (score 54): profile for image weight, animation cost on mobile, DOM complexity
- Cross-cutting: mobile INP at 136ms suggests event handler overhead — audit `touchstart`/`click` handlers for expensive synchronous work, consider `requestAnimationFrame` deferral

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

_Created: April 18, 2026 | Last pruned: April 21, 2026_
