# Development Backlog

Consolidated backlog of open development initiatives for the GST website. Each item is a self-contained user story with enough context to design and implement a solution. Items are grouped by theme, not priority — triage happens separately.

> **Completed and closed items** are removed from this file once done — recover any stanza's full acceptance criteria and technical context via `git log -- src/docs/development/BACKLOG.md`, or consult the per-initiative design docs in this directory, which remain in place. Two cleanup waves so far:
>
> - **April 2026**: 30 items (BL-002, 003, 008–019, 021–026, 027–030, and the _original_ BL-036–041 — those six IDs were later reused for new MCP-server initiatives, themselves now shipped and removed).
> - **2026-07-15**: 55 stanzas completed May–July 2026 (BL-005; BL-031 + the BL-031.x series; BL-032 + the BL-032.x series; the reused BL-036–045; BL-047; BL-049; and the BL-051–086 range as filed — not every ID in that range was used). Last pre-prune revision: `996b6b4c`.
>
> **BL-034** (MCP-server doc-cleanup catch-all, substantially complete 2026-07-02) survives below as a slim stub — it remains the append-target for BL-033-era cleanup items.

---

## Table of Contents

- [Compliance and Privacy](#compliance-and-privacy)
- [Business Capabilities](#business-capabilities)
- [CSS and Design System](#css-and-design-system)
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

### BL-006: BIMI CMC Certificate

**Source**: BIMI_VISUAL_TRUST.md | **Effort**: Purchase + config | **Status**: Deferred

**As a** site operator, **I want** a Common Mark Certificate (CMC) for BIMI **so that** the logo display is cryptographically verified and more mail clients render it.

#### Acceptance Criteria

- [ ] CMC certificate purchased from DigiCert or Entrust (~$100-300/year)
- [ ] Certificate hosted at stable HTTPS URL (e.g., `https://globalstrategic.tech/branding/gst-bimi.pem`)
- [ ] BIMI DNS record `a=` tag updated with certificate URL
- [ ] **Test email to Gmail shows logo in inbox** (moved from BL-005 — this is the criterion the cert unblocks)

#### Technical Context

- Requires 12 months of logo usage history as proof — **note: this may gate purchase timing; confirm eligibility before budgeting**
- Updates the existing BIMI DNS record from BL-005 — adds certificate URL to the `a=` field. The record, SVG, and DMARC alignment are already live and validating (BL-005, 2026-07-02), so this is the _only_ remaining step to inbox rendering
- Delivers 90% of the value without a trademark — a CMC (not just VMC) satisfies Gmail's PEM-certificate requirement, so the logo renders in Gmail inboxes (without the blue verified checkmark, which is VMC-only per BL-007)

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

### BL-096: Site-wide touch-target audit (AAA) + axe route coverage

**Source**: split out of the `--touch-target-min` change 2026-07-29, which fixed the button classes and deliberately stopped there | **Effort**: Medium — mostly design calls on space-constrained controls | **Status**: Open — needs a ruling before any code moves

**As a** mobile user, **I want** every interactive control to be comfortably tappable **so that** I am not missing small targets on the tool pages.

#### Acceptance Criteria

- [ ] **Ruling first**: is WCAG 2.5.5 (AAA, 44×44) a site-wide goal or a guarantee scoped to the button component classes? Everything below depends on the answer, which is why nothing was swept pre-emptively
- [ ] Audit and resolve the known sub-44 interactive controls: `.brutal-quick-zoom` (32px, pinned by `regulatory-map-mobile.test.ts:97-106`), `.filter-button` in `PortfolioHeader.astro` (`height: 38px` beside a `min-width` that now uses the token), the modal close buttons in `ProjectModal.astro` (around :323-329) and `PortfolioGrid.astro` (around :315-321) which both drop to 40px inside a media query, TOC links, filter chips, palette-panel affordances, nav links
- [ ] Extend the axe route list beyond its current 8 — `src/pages` holds 25 `.astro` files that emit 28 routes, ~22 of them real routes once the four `brand/responsive-frame/<group>` iframe partials (BL-097 split the single query-param route into one page per group, from one `[group].astro` file) and the two error pages are set aside
- [ ] **Dead rule to resolve**: `MapVisualizer.astro`'s `.brutal-map-control { width/height: var(--touch-target-min) }` sits in a `@media (max-width: 767px)` block, but `.map-controls` is `display: none` below 1024px (:122-127, pinned by `regulatory-map-mobile.test.ts:89-95`) — so the mobile zoom sizing never applies. It was tokenised in the 2026-07-29 sweep for consistency (value-identical), but either the controls should be reachable on mobile or the rule should go
- [x] **Frame-clipping measurement — resolved 2026-08-02 by BL-097, and now permanently guarded.** The concern was that the 33→44px button growth could overflow the fixed frames (600×200 / 384×350 / 240×400, `body { overflow: hidden }`, so cropping is invisible). With all four groups finally rendering, measured content at 600px is `cards` 113px, `form` **139px**, `shell` 168px against a 200px frame — nothing clips, in either axis, at any of the three widths. Rather than record a number that rots, `tests/e2e/brand-page.test.ts` now asserts per frame that `documentElement.scrollHeight/scrollWidth` fit `clientHeight/clientWidth`. Note the instrument: measuring `body` instead would be **vacuous** — `<html>` is `overflow: visible`, so body's `overflow: hidden` propagates to the viewport, body's own overflow resolves to `visible`, and with `height: auto` it grows to fit, making `body.scrollHeight === body.clientHeight` regardless of cropping. That vacuity is **height-specific**: body's used overflow resolves to `visible`, so `body.scrollWidth` still reflects horizontal overflow — measuring `body` would silently lose the vertical finding while keeping the horizontal one
- [ ] **Ratchet down `/brand`'s 13 `color-contrast` nodes** (`KNOWN_SERIOUS` in `accessibility.test.ts`). 8 are the `.a11y-badge` pass/fail chips, and they are page-local, so this is fixable without touching the site. What will NOT fix it is inverting the badge: contrast is symmetric, so a filled badge with page-background text is the same colour pair and the same 4.25:1. Three real levers — (a) fill the badge and pick a _different_ foreground (`#000` on `#2e8b57` measures 4.95:1, and the dark-theme pair is already 6.60:1), which needs an ink token since bare hex is lint-blocked; (b) change the `--color-success` / `--color-error` light values, which is site-wide; (c) clear WCAG's large-text threshold — **18.66px bold** (14pt), not 14px, so `--text-2xs` is nowhere near it. The remaining 5 are `.brutal-tab__label`, `.brand-tag`, `.project-card__cta`, `.brutal-reg-card__scope`, `.brutal-map-tap-bar__action`
- [ ] If the ruling is site-wide, `.a11y-badge--fail`-style documented exceptions in BRAND_GUIDELINES § Accessibility are updated or removed accordingly

#### Technical Context

- The floor itself is done: `--touch-target-min` exists, `.brutal-btn` / `.brutal-choice-btn` / `.cta-button` clear it, and `tests/integration/touch-target-floor.test.ts` fails any rule that resolves a button below it — including inside Astro scoped `<style>` blocks, where one of the two real regressions was hiding.
- 2.5.5 is **Level AAA**. The AA criterion (2.2 SC 2.5.8) is 24×24, which every control above already passes — so this is an enhancement, not a compliance gap. Worth stating plainly before anyone treats the 32px zoom control as a defect.
- The `/brand` axe entry added with that change uses **both** instruments, deliberately: `checkA11y`'s `exclude` for the two things that are not debt (12 lazy same-origin iframes, whose load state at scan time would make the count nondeterministic; and the `[data-demo-state="hover"]` specimens, which are low-contrast on purpose and must never "improve"), plus a `KNOWN_SERIOUS` baseline of 13 for contrast findings that genuinely are debt. Any route added here needs the same split judgement — exclude what must not change, baseline what should decrease, and never widen the exclusions to make a number go away.

---

### BL-095: Brand-page specimens — replace hand-rolled replicas with real components

**Source**: operator review of `/brand` 2026-07-28 — reported the logo lockup not matching the site header, the delta too small on both the logo and theme-toggle specimens, and broken spacing in several component demos. Root-caused to two mechanisms; the code-split-CSS half was fixed immediately (see Technical Context), this stanza covers the durable half | **Effort**: Medium — ~900 lines of `BrandUILibrary.astro`, convertible incrementally | **Status**: Open

**As a** developer using `/brand` as the design-system control example, **I want** each specimen to render the real production component **so that** what I copy is what ships, and a specimen cannot drift from the component it documents.

#### Acceptance Criteria

- [~] Specimens render the real component wherever it is renderable in isolation (cards, buttons, form controls, chips, tool shells, breadcrumbs, tiles, tables) — **slice 1 shipped 2026-08-02**: `Breadcrumb` (gained `crumbs?` + `ariaLabel?` props), `StatsBar` and `WireItem` now render the real component; `TableOfContents` and the logo components already did. The rest are deferred with reasons below — AC-1 is **not** met for them, and the sync comments added alongside are harm reduction, not AC-2 being satisfied
  - **Verified drift the slice removed** (each measured against production before the change): breadcrumb links `--color-primary` vs `--color-tertiary`; `.stat-value` `2.5rem`/`--bg-dark` vs `3.5rem`/`light-dark(…)`; `.stat-label`/`.stat-item` sizes and padding; the wire-item category dot hardcoded to `--color-primary` instead of the `CATEGORIES` colour; nav links `0.9rem` and footer links `0.85rem` vs `--text-sm`; nav list gap `2rem` vs `3rem`. Four of these were wrong in dark theme (the replicas dropped `light-dark()`)
  - **A live production defect the conversion surfaced**, in the spirit of the TechPar find below: `radar/WireItem.astro` shipped `.wire-item__content` and `.date` — class names with no CSS rule anywhere in the repo. Removed
  - **Deferred, singleton DOM id** (cannot render twice; these keep replicas + parity guards + sync comments): `Header` / `ThemeToggle` (need AC-2's presentational-inner extraction), `CTASection` (`id="contact"`, `CTASection.astro:24` — note its inline `trackCTA` onclick is a real click-time side effect but is _not_ the disqualifier), `ProjectModal` (19 ids), `PortfolioHeader` (22 `getElementById` lookups, owns the filter runtime), `StickyControls`, `FilterDrawer` (6 ids)
  - **Deferred, `PortfolioGrid` is riskier than it looks**: its inline script binds `document.querySelectorAll('.project-card')` globally, so rendering it on `/brand` binds a portfolio handler to a documentation specimen
  - **Deferred, granularity**: `WhyClientsTrustUs` / `EngagementFlow` / `WhoWeSupport` / `WhatWeDo` are isolation-safe but each renders a whole `<section>` with heading and 4-card grid where the specimen slot wants one card; their headings would also pollute `/brand`'s TOC, which builds from `h3[id]`. Needs a ruling on whether `/brand` embeds full sections
  - **Deferred, no component exists**: service card, founder bio, hub gateway card, legal typography replicate `pages/*.astro` markup — converting means _creating_ components first
  - **Not converted by operator ruling 2026-08-02**: `radar/FyiItem` nests its article `<a>` inside the `<details>` `<summary>`, which axe rates `nested-interactive` / serious. `/hub/radar` is not in the axe route list, so this does not fail CI today; rendering the component on `/brand` (which is scanned) would import the finding. Probed behaviour is sound — the link is keyboard-reachable, Enter navigates without toggling, and the mouse case is handled by a `stopPropagation` — and no screen-reader harm was reproduced, so the operator ruled the component works as intended and is not to be changed. The specimen stays a replica
- [ ] For components that genuinely cannot be rendered twice on a page — `Header.astro` and `ThemeToggle.astro` both carry singleton `id`s (`#themeToggle`) and a bound script — either extract a presentational inner component the page and the specimen both use, or keep the replica **with** the parity E2E guard added 2026-07-28 in `brand-page.test.ts` (which compares the specimen's size, colour and gap against the live component on the same page) and a comment naming the file to keep it in sync with
- [ ] No specimen re-implements a design-system treatment inline (the frosted-glass demo hand-rolled `rgba(255,255,255,0.75)` + `blur(12px)` — wrong colour in dark theme and the wrong blur — until it was fixed in the token sweep)
- [~] Specimen labels continue to name the class actually rendered (17 mismatches were corrected in the token sweep; converting to real components removes the failure mode entirely) — slice 1 also deleted the **FAQ Accordion** specimen, whose caption documented `.faq-item`, a class that exists nowhere in the repo, and which claimed a delta-icon rotation that never happened; the real `.brutal-faq__item` pattern already has a correct specimen. Same treatment as the three dead legacy specimens removed 2026-07-29. And fixed `class="footer-links"` sitting on an `<a>` where production has it on the container div
- [x] Resolve the ~28 class names present in the `/brand` DOM with **no CSS rule anywhere** in the repo (`brand-metric`, `brand-tag`, `rec-badge--effort`, `colors-status-chip--success`, `tool-wizard-dot--even`, …) — surfaced by a live DOM audit 2026-07-28. **Done 2026-07-29**: 28 → 5, and the 5 that remain are legitimate JS hooks with no visual role (`swatch-slider-{r,g,b,a}`, `palette-panel__popout-label`). Three dead legacy specimens (`.teaser-card`, `.rec-card`, `.attention-card` — zero production usage) were deleted with their CSS and demo JS; the rest were either repointed at the real class or given the missing rule as a documented `.brand-*` replica in `brand.astro`. The audit also exposed a live TechPar defect — `utils/techpar/chart.ts` emitted `bench-row--active` / `bench-label*`, names no rule defines, against a table styled with `.brutal-bench-table__active` / `__label*` — now fixed
- [ ] **Two items deliberately deferred out of the 2026-07-29 sweep** (recorded so they don't evaporate):
  - The `.brand-*` card replicas in `brand.astro` omit their originals' `@media (max-width: 480px)` overrides — `PortfolioGrid.astro` shrinks `.metric-value` and `.metric-value.arr` there (~:271, :275), the replicas do not. Scope is narrow: the 768px block touches nothing a replica mirrors, and `ProjectModal`'s media blocks override no replicated selector at all, so the modal replicas have no responsive gap. Only matters if the specimens are ever viewport-demoed directly; the Responsive Behavior iframes already cover that job for the components they frame.
  - **Two competing `.project-card` definitions**: `cards.css` uses `var(--bg-light)` while `PortfolioGrid.astro`'s scoped rule uses `light-dark(…, var(--bg-dark-secondary))`, so the `/brand` specimen renders `rgb(12,12,12)` in dark theme against production's `rgb(26,26,26)`. Pre-existing production debt — deliberately not folded into a brand-page branch, since resolving it means changing which definition wins for the live portfolio grid

#### Technical Context

- **Two distinct causes produced the reported symptoms.** (1) **Code-split CSS** — `filter.css`, `map.css`, `portfolio.css` and `progress.css` load only on the pages that use them, so their specimens rendered as raw unstyled markup on `/brand`. **Fixed 2026-07-28** by importing all four in `brand.astro`, with E2E assertions so it cannot regress. (2) **Replica drift** — this stanza. The logo specimen passed no `size` prop to `DeltaIcon` (defaulting to 14px) where `Header.astro` renders 32px; the theme-toggle specimen was 14px against production's ~54px and used the wrong colour token.
- **Why replicas exist**: several specimens need page context (sticky positioning, scroll state, data props) that a bare render does not supply. Convert the ones that don't first — that is most of them.
- **Why this matters more than it looks**: STYLES_GUIDE § In-repo Control Examples now instructs every session to copy from these specimens. A drifted specimen actively teaches the wrong thing, which is worse than having no specimen at all.
- **`.primary` / `.secondary` are inert everywhere.** `buttons.css` defines exactly one CTA appearance (`.cta-button`); the bare `primary` / `secondary` tokens seen in `class="cta-button primary"` match no rule in the repo. They were removed from the `/brand` specimens 2026-07-29 (and the CTA Buttons group collapsed from two identical specimens to one truthful `.cta-button`), but ~20 inert occurrences remain in production markup — `Hero.astro`, `hub/tools/index.astro`, `hub/library/index.astro`, the tool back-links. Stripping them is mechanical and behaviour-free; **defining** them is not — `.cta-button.secondary` would restyle every "Back to …" link at once and needs a design decision first. Bare unnamespaced globals are also a collision hazard: prefer `.brutal-btn--primary` / `--secondary` when a real two-variant pair is wanted.
- Related: [STYLES_REMEDIATION_ROADMAP.md § 13](../styles/STYLES_REMEDIATION_ROADMAP.md) (the token sweep that surfaced the label mismatches), BL-094 (the off-scale font sizes still present in these same replica blocks).

---

### BL-094: Off-scale font-size literals — type-scale ruling + sweep (deferred)

**Source**: split out of the design-token lint enforcement initiative (2026-07-28) — see [STYLES_REMEDIATION_ROADMAP.md § 14](../styles/STYLES_REMEDIATION_ROADMAP.md) for the full analysis, which is the authoritative record | **Effort**: Medium-Large — 150 judgement calls across ~31 files + per-page visual review | **Status**: **Deferred** — visible as lint warnings in every run; do NOT bulk-snap (see why below)

**As a** developer changing type sizes, **I want** every `font-size` to come from the `--text-*` scale **so that** typography is consistent and a size change is a token change — but not at the cost of an unreviewed layout regression.

#### Acceptance Criteria

- [ ] A type-scale ruling recorded in [TYPOGRAPHY_REFERENCE.md](../styles/TYPOGRAPHY_REFERENCE.md): do the off-scale sizes snap to the nearest existing token, or does the scale gain steps (the `0.6rem`/`0.7rem` cluster is the strongest candidate for a new tier)?
- [ ] The 150 remaining literals resolved per that ruling, with the affected pages visually reviewed at desktop/768/480 in both themes (or visual-regression coverage standing in for the human pass)
- [ ] `declaration-property-value-allowed-list` for `font-size` flipped from `warning` to `error` in `.stylelintrc.json` in the same change that clears the last literal
- [ ] `@media print` font-sizes remain exempt — `pt` units are correct for paper

#### Technical Context

- **Why this is deferred and not swept** (operator directive 2026-07-28): unlike the color sweep that shipped alongside it, these are **not** same-value substitutions. Snapping a size changes rendered type, risking line-wrap points, control heights and table fit — and the repo has **no visual-regression coverage** to catch a mistake. The 95 literals that were byte-equal to an existing token were already tokenized; what remains is precisely the set needing human judgement.
- **Promotion trigger** (both required): the type-scale ruling exists, AND per-page visual review is affordable for the pages being changed.
- Largest clusters: `0.7rem` ×16, `0.85rem` ×11, `2.5rem` ×9, `0.6rem` ×9, `9px` ×9, `0.9rem` ×8, `0.8rem` ×7, `10px` ×6.
- Current scale for reference: `--text-2xs` 0.65rem · `--text-xs` 0.75rem · `--text-sm` 0.875rem · `--text-base` 1rem · `--text-lg` 1.1rem · `--text-xl` 1.25rem · `--text-2xl` 1.5rem · `--text-3xl` 2rem.

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
- Prerequisite: global.css split (BL-021, complete) already done

---

### BL-046: In-Claude-Desktop File Delivery for MCP Tools (candidate)

**Source**: BL-044 staging round-trip surfaced Claude Desktop's MCP renderer limitation (2026-05-25) — `resource` content blocks with non-image MIME types are rejected as "unsupported format". The current workaround (Hub deeplink with arg-encoded query params) closes the immediate value gap but doesn't deliver files _inside_ the Claude Desktop chat. | **Effort**: 4-6 hours (`resource_link` + ephemeral Worker-hosted Resources path) OR 3-4 hours (signed HTTP URL path); pick during scoping | **Status**: Candidate · **Low priority** — deeplink+pre-fill closes the arg-passing gap; this is incremental polish for in-chat file UX | **Depends on**: BL-044 (the .xlsx generator is the producer)

**As a** GST partner using Claude Desktop to draft engagement outreach, **I want** the `.xlsx` produced by `generate_information_request_list_xlsx` (and any future binary-producing MCP tool) to appear inline as a downloadable attachment in the chat **so that** I can forward the file from the same draft without leaving the Claude Desktop window to fetch it from the Hub page.

#### Three implementation paths (pick during scoping)

**Path A — `resource_link` + ephemeral Worker-hosted Resources**

- Generated file lands in Upstash KV (or R2) keyed by a synthetic ULID + TTL
- Tool returns a `resource_link` content block pointing at `gst://generated/irl/<id>`
- MCP `resources/read` handler on the Worker looks up the cached blob and returns the binary body
- Claude Desktop sees the resource_link, fetches via `resources/read`, renders as attachment
- Effort: ~4-6 hours (KV/R2 storage, per-call resource registration, TTL cleanup, resources/read handler wiring, bearer-auth on the resource path)

**Path B — Signed HTTP URL on the Worker**

- Generated file lands in KV/R2 with a signed URL (HMAC of `{ id, expires_at, scope }`)
- Tool returns a plain text content block with the URL embedded
- User clicks the link → Worker `/files/:id?sig=...` route validates signature, returns the blob with `Content-Disposition: attachment`
- Effort: ~3-4 hours (KV/R2 cache, route handler, HMAC signing/validation, expiry logic)
- Drawback: requires the partner to click an external link (same as current Hub deeplink); less "inline" than Path A

**Path C — Wait for Claude Desktop renderer support**

- The MCP spec already allows arbitrary-mimeType `resource` content blocks with `blob`. Claude Desktop's renderer just doesn't honor them today.
- Effort: 0 hours for us; unknown timeline on the Claude Desktop side
- Right path if the Anthropic-side fix lands within a reasonable window — file the issue upstream and revisit BL-046 quarterly

#### Why "low priority"

The BL-044 deeplink+pre-fill (`?target=…&context=…`) reduces the friction of "leaving the chat to get the file" to one click on a Hub page that's already pre-filled with the args. For the partner-handing-off-to-recipient workflow, that's reasonable. BL-046's incremental value is mostly for:

- Email/chat composition flows where the partner wants the file as a draft attachment without context-switching
- Future agent workflows (BL-033) where automated pipelines pass files as part of programmatic steps and can't tolerate a "human clicks a link" hop
- Pure-chat workflows where leaving Claude Desktop is itself the friction

None of these are currently load-bearing for active partners. Revisit when (a) Claude Desktop's renderer ships support natively, OR (b) BL-033 surfaces a concrete need for inline file delivery, OR (c) a partner specifically requests "I want the file IN the chat, not a link out."

#### Triggers to promote from candidate → committed

- Claude Desktop ships native renderer support for `resource`-with-blob in tool results (Path C resolves itself)
- BL-033 pilot needs inline file delivery for an automated workflow
- Direct partner feedback that the Hub-page hop is friction worth removing

---

## Infrastructure

### BL-098: Radar negative caching — a failed revalidation is cached as a 200

**Source**: accepted trade-off of inlining the Radar feed (2026-07-31, `fix/seo-indexability-radar-ssr`) | **Effort**: Medium — the naive fix is worse than the problem | **Status**: Open, do not implement without the trigger

**As a** visitor to `/hub/radar`, **I want** a transient failure of the MCP Worker not to leave the feed empty for hours **so that** a 30-second outage doesn't become a 6-hour one.

**What changed.** The feed used to be a `server:defer` island, and `@astrojs/vercel` routes `/_server-islands/*` to the uncached render function — so a failed fetch self-healed on the very next request. Inlining the feed (required: crawlers were judging the shell and the page sat unindexed) moved the fetch inside the ISR entry, where a failed revalidation is cached as a `200` with the empty state for up to 6h.

**Why the obvious fixes are wrong.** Vercel prerender functions take no per-response TTL, so "refuse to cache a failed fetch" realistically means throwing a 5xx — trading a graceful empty state for an error page for every visitor during the outage, _plus_ a live MCP fetch per request while the breaker is open, which is the exact Zone-1 budget pressure [ADR-0006](../adr/0006-inoreader-zone1-budget-protection.md) exists to prevent. **Do not reintroduce the server island**: that reopens the indexability defect this was fixed to close. Note also that BL-091 does not cover this — breaker-open is cache-only, so a cold cache still renders empty.

**Prerequisite for any fix**: the code cannot currently tell a _failed_ fetch from a _legitimately empty_ feed — both render `.radar-empty`. That distinction has to exist first.

**Trigger**: a Search Console or operator report of a stale-empty radar window causing real harm. Until then the trade-off is accepted.

**Worth recording on the other side of the ledger**: the same change dropped Worker load from per-pageview to per-revalidation. The cost is staleness — nominal worst-case visitor-visible age ~12h (6h ISR on top of the 6h cron). Do not read that as "within the `snapshot age ≤ 12h` SLO": that SLO is `2 × cron-interval`, an alerting threshold that tolerates one missed cron, and it governs the Worker's snapshot rather than the website's cache. When both slip, visitor-visible age can reach ~18h.

#### Acceptance Criteria

- [ ] A failed `/radar/snapshot` fetch is distinguishable from an empty feed at the render site
- [ ] A revalidation failure does not persist an empty feed for the full ISR window
- [ ] No 5xx is served to visitors for a feed-fetch failure, and no per-request MCP fetch is introduced while the breaker is open
- [ ] `/hub/radar` still ships its feed in the initial HTML — verified by the existing raw-HTML E2E, not re-litigated

---

### BL-033: MCP Server — External Pilot (Phase 3)

**Source**: MCP_SERVER_INITIATIVE.md (archived) | **Effort**: 2 weeks engineering + indeterminate legal/sales lead time | **Status**: Open | **Depends on**: BL-032, BL-032.7 (substrate safety + observability — shipped 2026-05-16), **BL-032.8** (radar consumer unification — precondition; eliminates the website's direct Inoreader caller so all consumers — including pilot clients — go through the same canonical MCP path with the BL-032.7 protections)

**As a** PE firm client, **I want** to connect my AI tools to GST's MCP server **so that** my agents can query GST's diligence engine and portfolio data during deal evaluation, with the security and audit guarantees my compliance team requires.

#### Planning Criteria

**Use cases**

- **Deal-screening agent (PE deal team)** — during initial screening of a potential investment, an analyst's agent calls `generate_diligence_agenda` with the target's profile to produce a starter agenda the IC memo can be built around; saves 2–4 hours per screened deal
- **Portfolio monitoring (PE platform team)** — a daily-running agent at a portfolio-services group polls `search_radar { category: 'enterprise-tech', since: 'yesterday' }` and surfaces relevant items into the platform-wide knowledge base
- **Pitch prep (investment banker / corp dev)** — a banker prepping a sell-side pitch uses Claude with GST's MCP enabled to triangulate comparable transactions: "what GST engagements involved B2B SaaS targets between $25–100M ARR with carve-out transaction types?"
- **Vendor-evaluation agent (enterprise procurement)** — a CIO's procurement agent calls `search_portfolio` during RFP review to find GST case studies relevant to a vendor under consideration
- **Knowledge-base augmentation (research / content)** — an analyst uses GST's tools as a structured-knowledge layer alongside their own document store, blending GST's diligence framework with their proprietary deal flow data
- **Programmatic access for technical clients** — a client's internal tooling (Retool, Slack bot, custom dashboard) calls the MCP server directly, treating GST's tools as a managed API rather than a website

**Outcomes**

- **2 design-partner PE firms** in active production use within 90 days of GA launch — not just signed paper, but logs showing ≥100 tool invocations/month per client
- **Zero security incidents** over the first 6 months: no unauthorized access, no data exfiltration, no successful prompt-injection exploit found in pen test or in production
- **At least 1 pilot client converts to a paid tier** within 6 months, validating willingness-to-pay
- **Listed in ≥2 MCP directories** (Anthropic's registry + MCPMarket.com or Cursor catalog) with >50 install attempts in the first 90 days (listing execution tracked under BL-093)
- Audit-log integrity check passes every quarterly review for the first year (hash chain or R2 object-lock attestation)
- Pilot SLA met every month: 99.5% uptime, p95 <500ms non-radar, support response <1 business day

**Business value**

- **First product line with programmatic pricing** — moves GST beyond pure project-based advisory revenue into a recurring, per-seat or usage-priced product surface; opens a revenue stream that scales without proportional consultant time
- **Competitive moat in M&A advisory** — boutique advisory + AI-native tooling is rare; concrete differentiator for sales conversations against larger firms whose AI story is "we use ChatGPT internally"
- **Category positioning** — GST is one of the first M&A advisory firms with a public MCP server; captures inbound discovery from agent-curious PE/VC funds searching MCP directories without sales outreach
- **Diligence engine as licensable IP** — converts a website utility into a productized capability with a clear commercial story, increasing the implied valuation of the firm's intellectual property
- **Direct sales channel via MCP directories** — bypasses the traditional advisory-firm sales motion (introductions, conference networking) for technically-sophisticated buyers who self-discover and self-onboard
- **Compliance posture as moat-builder** — clients who require SEC 17a-4-grade audit logs and SOC 2 / pen-test evidence cannot easily switch to a competitor without re-doing that compliance work; the audit infrastructure built here is itself a defensible asset
- **Costs**: ~~2 weeks engineering for the runtime + ongoing hosting (~~$50–200/month for R2 storage, Workers paid tier, Upstash, Cloudflare Access per-user) + indeterminate legal review (NDA / DPA / SLA template — front-loaded, amortized across pilots)
- **Risk-adjusted upside**: even one Series A-tier PE client paying $2k/month covers all hosting + amortizes the engineering spend within 2 quarters; two pilot conversions clear the legal cost as well

#### Acceptance Criteria

**Authentication & authorization (OAuth 2.1)**

> ✅ **This AC block shipped 2026-07-24 as BL-033 Slice 2** (embedded authorization server via `@cloudflare/workers-oauth-provider`, dual-auth alongside static keys, M2M client_credentials). Decision record incl. rejected alternatives + deferred triggers: [ADR-0008](../adr/0008-mcp-oauth-embedded-authorization-server.md). Operator runbooks: `mcp-server/src/docs/operations/AUTH.md` § OAuth. Per-AC dispositions below.

- [x] OAuth 2.1 authorization server with **PKCE mandatory** — ✅ embedded AS on the Worker; PKCE S256-only (`allowPlainPKCE: false`), pinned by the RFC 8414 metadata integration test
- [x] Dynamic client registration **disabled** — ✅ no `registration_endpoint` (metadata test asserts its absence); clients are pre-registered via `MCP_ADMIN_KEY`-gated admin endpoints, or arrive as CIMD clients (the MCP spec has since demoted DCR to MAY and prefers exactly this pre-registration + CIMD shape)
- [x] Per-client `client_id` + `client_secret`, secrets stored hashed, rotation supported — ✅ **with two recorded deviations from this AC's letter**: (a) **Argon2id → SHA-256** — secrets are 32-byte random values, not human passwords, so a memory-hard KDF buys nothing; SHA-256 matches the library's own storage model for its tokens/secrets; (b) **Upstash → Cloudflare KV** as the storage substrate — the library requires KV, and splitting auth state across two stores would be worse than the substrate swap (single OAuth substrate; recorded in ADR-0008)
- [x] **Tool-level scopes** with independent `tool:radar:*` gating — ✅ **satisfied-by-mechanism**: the advertised catalog stays wildcard-coarse (`tool:*`, `prompt:*`, per-family resource reads + `tool:radar:*`), and per-tool granularity is delivered by the wildcard-aware `hasScope` checker + per-client `allowedScopes` narrowing (an M2M client granted `tool:search_portfolio` gets exactly that) rather than enumerating every tool in `scopes_supported`. Radar is independently gateable and deliberately excluded from typical pilot grants (integration-tested: non-radar client → 403 `missingScope`)
- [x] 1h access tokens + refresh rotation + spec 401 challenge — ✅ `accessTokenTTL: 3600` (asserted in the flow test), rotating 30-day refresh tokens (library; brief two-token grace window recorded in ADR-0008), and 401s on presented-token failures carry `WWW-Authenticate: Bearer error="invalid_token", resource_metadata=...` (RFC 9728 discovery pointer — strictly more than this AC asked)
- [x] Token introspection behind admin protection — ✅ `POST /oauth/introspect` (RFC 7662; no-oracle `active:false` on every token failure; M2M revocation cross-check). **Interpretation note**: "a separate admin scope" maps to the existing distinct `MCP_ADMIN_KEY` credential family rather than an OAuth scope — support engineers never see token internals without it
- [x] RFC 8414 metadata — ✅ `/.well-known/oauth-authorization-server` + RFC 9728 `/.well-known/oauth-protected-resource` (the spec's MUST that postdates this AC), both shape-pinned by `tests/integration/oauth-metadata.test.ts`
- [x] **Bearer-comparison constant-time hardening** — ✅ **Resolved 2026-07-23 (BL-033 Slice 1)**: `bearer.ts`'s plain `value === token` (the finding's `bearer.ts:81` reference had gone stale; the line lived at `:126` by resolution time) now runs through the shared constant-time XOR comparator, extracted from `admin/admin-auth.ts` to `src/auth/timing-safe-equal.ts` and reused by both auth paths. Behavioral unit spec at `tests/unit/auth/bearer-constant-time.test.ts` (near-miss prefix, length-mismatch, `_SCOPES`-skip, scope resolution). **Recorded deviation from this AC's wording**: no wall-clock "comparison time is independent of mismatch position" assertion was written — CI-runner jitter dwarfs nanosecond XOR deltas, making such a test the flaky-test family this repo bans; the constant-time property is structural (single XOR loop, no data-dependent branch, pinned by the comparator's own spec). Original evidence: [T.A.15](./_archive/BL-032_TESTING_FINDINGS.md#ta15--token-comparison-timing-safe), [T.I.5](./_archive/BL-032_TESTING_FINDINGS.md#ti5--token-comparison-is-constant-time).

**Rate limiting (per-client, contractual)**

> ✅ **This AC block shipped 2026-07-26 as BL-033 Slice 5** (per-client tier-aware ceilings, `RateLimit-Policy` header, 80% soft-limit `notifications/message`). Decision record incl. tier-in-token vs KV re-fetch + the SSE notification-transport analysis: [ADR-0010](../adr/0010-per-client-rate-limit-tiers.md). Contract: [`RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md). Per-AC dispositions below.

- [x] Per-client tier (`free-pilot` / `paid` / `enterprise`) gates the limit ceilings; tier stored in Redis client record — ✅ **with a recorded deviation**: the ceilings are now tier-aware (`ratelimit/tiers.ts` → `resolveTierLimits(auth.tier)` → `createLimiter(env, limits)`), but the `tier` field is stored in **Cloudflare KV** (the M2M client record's substrate per ADR-0008), NOT Redis, and travels in the self-contained token claim so the limiter reads it with no KV round-trip on the hot path (ADR-0010 §1). Static `MCP_KEY_*` + OAuth human-consent carry no tier → the `internal` default = the pre-Slice-5 60/1000/5/50 (no regression). **Numbers are tunable, non-contractual capability ceilings, not SLA quotas** (operator directive)
- [x] Sliding-window limits applied per-tool per-client — radar tools share the global Inoreader budget circuit breaker introduced in BL-032 — ✅ shipped BL-032 Phase 3 + BL-038; Slice 5 makes the ceilings tier-aware. (Radar caps are per-client fairness + cache-cold defense-in-depth; the circuit breaker — wired into the radar tool path — is the real Inoreader-budget guard, since radar calls are ~99% cache hits)
- [x] Quota exhaustion returns `429` with `Retry-After` header + a structured `RateLimit-Policy` header (RFC 9331) describing the limit so client engineers can self-diagnose — ✅ `Retry-After` shipped in Phase 3; `RateLimit-Policy` added in Slice 5 (quoted-policy form, on every authenticated 200 AND 429 — the transport-agnostic throttle signal)
- [x] Soft-limit warning at 80% of quota emitted as an MCP-spec `notifications/message` so the calling agent can throttle itself before hitting the hard limit — ✅ emitted from the tool-metrics wrapper on the request's SSE stream when any bucket is ≥80% consumed. **Best-effort** (a client that doesn't parse interim SSE frames won't see it; the `RateLimit-*`/`RateLimit-Policy` headers are the guaranteed fallback) — requires the `logging` server capability (now declared). Transport analysis: ADR-0010 §2

**Audit logging (compliance-grade)**

> 🟡 **Emission + durable-store half shipped 2026-07-26 as BL-033 Slice 3a** (audit path off the `withMetricsCore` chokepoint → Cloudflare Queue → hash-chained, R2-immutable store; input params never reach the ops sinks). Decision record incl. crash-safety proof + rejected alternatives: [ADR-0009](../adr/0009-compliance-audit-log-hash-chain.md). Operator runbook: [`../../../mcp-server/src/docs/operations/AUDIT_LOG.md`](../../../mcp-server/src/docs/operations/AUDIT_LOG.md). Per-AC dispositions below.

- [~] Every tool invocation written to an append-only audit log with: ISO-8601 timestamp, `client_id`, IP-prefix (truncated for GDPR — last octet zeroed), tool name, request UUID, **input parameters (full)**, **output payload size in bytes** (not the payload itself by default), durationMs, success/error code — 🟡 **best-effort, not fully met**: the record shape + every field ship (`client_id` = the PII-free `keyOwner`; gated to `tool_invocation` this slice), but "**every** invocation written" is best-effort at the enqueue hop (documented first-hop loss window; the fail-closed `writeAndAwait` seam is the recorded revisit trigger for a client that contracts guaranteed capture — ADR-0009)
- [ ] Optional `?audit_full_payload=true` per-client flag to retain full output payloads for clients whose compliance regime requires it (must be agreed in writing — flag flips a Redis setting) — **deferred** (pairs with the fail-closed per-client posture)
- [x] Logs shipped to a tamper-evident store: append-only S3 bucket with object lock, OR Cloudflare R2 with versioning + immutability — never to the same Sentry/Cloudflare logs used for ops — ✅ Cloudflare R2, one immutable hash-chained object per entry, on a SEPARATE path from AE/Sentry/CF logs (full input params never reach the ops sinks)
- [x] Retention: minimum 7 years to satisfy SEC Rule 17a-4 (the typical PE compliance baseline); confirm exact requirement with each client in pilot agreement — ✅ **as an operator dashboard step** (R2 **Bucket Lock** rule — Cloudflare's object-lock — at 7-yr retention, documented in AUDIT_LOG.md — a bucket config, not code); confirm the exact figure per pilot contract
- [ ] Per-client log export available via signed URL (read-only) so clients can ingest into their own SIEM — **deferred** (next slice; the seam is clean — records carry `keyOwner`)
- [~] Quarterly audit-log integrity check (hash chain or AWS Object Lock attestation) — automated, results emailed to the compliance contact — 🟡 **hash chain shipped, automation deferred**: each R2 record carries `seq` + `prevHash` + `entryHash` (crash-safe linear chain, ADR-0009), so a verifiable chain exists now; the scheduled re-walk + email automation is the deferred slice

**Prompt-injection hardening**

> ⏸️ **DEFERRED (operator, 2026-07-26).** **Re-engage trigger: a pilot's security/infosec review is scheduled, or a pilot requests it.** Planned + design-reviewed 2026-07-26, then deferred: the MCP exposes only GST-authored/public data with no client-specific store, and **there are no consuming clients yet** — so building now is pre-building for a pilot that doesn't exist (per "don't build what no client asked for"). The analysis below is captured so it isn't re-derived when the trigger fires.
>
> **Reframed threat model (GST-as-conduit):** GST holds no secrets to exfiltrate; the only adversary-controlled surface is **third-party Inoreader radar content** (served via the radar tools, `gst://radar/*` Resources, and `/radar/snapshot`) flowing into a _pilot's_ agent. Base-model resistance is probabilistic and the consuming model isn't GST's to assume hardened.
>
> **De-theatered reduced scope (when re-engaged):** (1) **Radar third-party sanitization** at the shared `toSnapshotItem` (`mcp-server/src/content/radar-transform.ts`) — strip HTML/zero-width/bidi + ~4KB summary truncation on `title`/`source`/`summary`, leaving GST `annotation.*`; covers tools + resources + snapshot + website in one place, and is **the one piece with standalone value even pre-pilot** (raw third-party HTML reaches clients + the site today). (2) **Provenance labels** (`_meta.provenance` + `structuredContent._provenance`) at the `withMetricsCore` chokepoint (tool + resource) + `/radar/snapshot` JSON — `trust: untrusted` for radar, else `trusted`; a label the _client_ acts on, so value is gated on a consuming client existing. (3) **Radar item-count cap** on `search_radar` (envelope already carries `returned`/`totalMatched`) for model-processability. (4) **OWASP-LLM-Top-10 self-review doc** (`src/docs/security/`) + ADR — the pilot-security-review deliverable.
>
> **Rejected controls (do NOT re-propose):** the **sentinel-phrase blocklist** in the first AC below (trivially bypassed = theater); a **byte size-cap / DoS backstop** (AC 3 below — real regression risk near `compose_dossier_envelope`'s known large-payload history, for zero protection of _trusted_ content; the injection surface is untrusted radar, already bounded at its source by sanitization + the item-count cap); **multi-tenant isolation** (single shared dataset, out of scope).

- [ ] All free-text fields in tool outputs (project summaries, FYI GST Take, attention-area descriptions) pass through a sanitization layer that strips: zero-width characters, bidi override marks (U+202A–U+202E, U+2066–U+2069), excessive whitespace runs, and known prompt-injection sentinel phrases ("ignore previous instructions", "you are now", etc.)
- [ ] Output payloads include a top-level `_provenance: { source, sanitized: true, version }` field so calling agents can attribute content
- [ ] Maximum output size: 64KB per tool response; larger results paginate via the MCP `cursor` field. Hard cap prevents an attacker from poisoning a model's context with a giant adversarial blob
- [ ] Inputs validated against the same Zod schemas as Phase 1 PLUS a per-string length cap (no string field over 1KB) — defense in depth against schema-evading payloads
- [ ] Security review (run the built-in `/security-review` Claude Code skill on the MCP server PR, or equivalent independent review) before pilot launch — checklist follows OWASP LLM Top 10 (LLM01: Prompt Injection, LLM06: Sensitive Info Disclosure, LLM10: Model DoS)

**Pilot operations**

> 🟡 **Observability + onboarding half shipped 2026-07-26 as BL-033 Slice 4** — `/status` gains per-tool p50/p95 + audit-log health, the `status.` subdomain, the `/health` version fix, and an onboarding playbook. Deliberately NO SLA ratification / perf optimization (operator directive). Runbooks: [`STATUS_PAGE.md`](../../../mcp-server/src/docs/operations/STATUS_PAGE.md), [`PILOT_ONBOARDING.md`](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md). Per-AC dispositions below.

- [x] **Onboarding playbook** documented: legal sign-off, NDA + DPA execution, client_id provisioning, scope assignment, sandbox environment access, joint kickoff call, success metrics — ✅ [`PILOT_ONBOARDING.md`](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md) stitches the shipped provisioning mechanics (M2M `client_id` + scope/tier assignment, REMOTE_CLIENT_SETUP hand-off, audit guarantees, success metrics); legal/NDA/DPA/kickoff flagged as business steps
- [ ] Sandbox environment with synthetic projects.json (zero real client data) for client engineers to integrate against before touching production — **deferred**: portfolio JSON is `import`-inlined at build, so a synthetic dataset needs a separate Worker env/build (own route + KV) — a substantial standalone slice, not folded into observability
- [ ] **Regional latency assessment + remediation** — BL-032 soak measured Upstash REST RTT from a GRU-region operator at ~250ms, which means non-radar warm calls land at p95 ~930ms (vs the playbook's <200ms target) and `/health` at p95 ~414ms (vs <150ms target). Code is fine; transcontinental Upstash hops dominate. Before the SLA below is contractually committed, measure latency from each pilot client's region and choose remediation: (a) move the MCP Upstash DB to a region closer to the pilot consumer base, (b) add a Cloudflare KV layer that replicates globally and reduces Upstash hits to once per region per TTL window, or (c) set the SLA region-aware ("p95 <500ms when Worker and Upstash are co-regional; <1.2s otherwise"). Evidence: [T.H.4](./_archive/BL-032_TESTING_FINDINGS.md#th4--radar-warm-cache-hit), [T.H.6](./_archive/BL-032_TESTING_FINDINGS.md#th6--health-latency-budget). **Progress 2026-07-23 (BL-033 Slice 1)**: the measurement machinery now exists — `mcp-server/scripts/probe-latency.mjs` (client-observed p50/p95 per surface, region-labeled, runnable from any machine) + the scheduled `latency-probe.yml` workflow producing a continuous US-region baseline (see [LATENCY_PROBE.md](../../../mcp-server/src/docs/operations/LATENCY_PROBE.md)). Still open: per-pilot-region runs (needs known pilot regions) and the (a)/(b)/(c) remediation decision itself.
- [~] Status page published at `https://status.mcp.globalstrategic.tech` showing uptime, p50/p95 latency, and rate-limit-availability per tool — 🟡 **mostly shipped**: `status.mcp.globalstrategic.tech` subdomain live + per-tool **server-side p50/p95** and audit-log health added ([STATUS_PAGE.md](../../../mcp-server/src/docs/operations/STATUS_PAGE.md)), rendered as **plain observability (no SLA badges)** per the operator directive. **Per-tool rate-limit-availability panel deferred** (pairs with the per-client rate-limit-tiers slice). Latency is surfaced, NOT ratified as an SLA
- [ ] Pilot SLA defined and contractually committed: 99.5% monthly uptime, p95 latency <500ms for non-radar tools, support response <1 business day — **deferred (operator directive)**: don't ratify SLA numbers no client has contracted
- [ ] At least 2 design-partner PE firms onboarded to the pilot
- [ ] Listed in **MCP directories** — submission to MCPMarket.com, Anthropic's official MCP registry, and Cursor's MCP catalog with screenshots and a 60s demo video — **moved to [BL-093](#bl-093-mcp-server--commercialization-phase-4) 2026-07-27** (candidate sub-block with hard gate + promotion triggers; the pen-test AC below remains the hard gate)

**Verification & docs**

- [ ] Public-facing developer docs at `https://docs.mcp.globalstrategic.tech` — tool reference (auto-generated from Zod schemas), authentication guide, rate-limit policy, audit-log schema, status page link — **moved to [BL-093](#bl-093-mcp-server--commercialization-phase-4) 2026-07-27** (its § Public developer documentation block carries the full scope, now sourced from the CONTRACT/USAGE corpus)
- [ ] Penetration test by an independent firm focused on the OAuth flow, prompt-injection surface, and audit-log integrity — findings remediated before public listing
- [ ] Load test demonstrates the system handles the contracted SLA at 10× expected pilot volume without degradation
- [ ] Final compliance review with each pilot client's information-security team — signed-off before they switch from sandbox to production tokens

#### Technical Context

**Why this is a separate phase, not an extension of BL-032**

- Phase 2 is "trusted internal users on a shared key" — security model is closed-network
- Phase 3 is "untrusted external agents acting on behalf of compliance-sensitive clients" — every assumption changes: input is hostile, audit is contractual, downtime is breach-of-contract
- Mixing the two in one milestone causes scope creep that delays both: do BL-032 first, prove the runtime, then layer hostile-environment hardening on top

**OAuth 2.1 implementation options**

| Option                                | Pros                                                                     | Cons                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Build on Cloudflare Workers (custom)  | Full control, single-platform, no vendor lock-in beyond Cloudflare       | OAuth is easy to implement insecurely; takes ~1 week of careful work + security review |
| Cloudflare Access for SaaS            | Managed OAuth, integrates with Cloudflare Zero Trust, audit log built-in | Per-user pricing, less customization on scope semantics                                |
| Auth0 / WorkOS / Clerk (external IdP) | Battle-tested, dev-friendly SDKs, certified for SOC 2                    | Adds a vendor + cost; introduces a third-party dependency in the auth path             |

Recommendation: start with **Cloudflare Access for SaaS** — fastest path to a defensible auth surface, and the per-user cost is easily absorbed by pilot revenue. Re-evaluate in 6 months if scope semantics become a constraint.

**Audit-log architecture**

```
MCP Worker ──► Cloudflare Queue ──► Worker consumer ──► R2 bucket (immutable, versioned)
                                                  └──► Per-client signed URL endpoint
```

- Queue decouples request latency from log write latency (audit must be durable but must not slow the tool call)
- R2 is cheaper than S3 for the egress patterns expected here, and Cloudflare's object-lock equivalent satisfies tamper-evidence
- Hash chain: each log entry includes the SHA-256 of the previous entry, so post-hoc tampering is detectable

**Prompt-injection threat model**

The diligence engine takes structured enum inputs only — low risk. The portfolio search returns project summaries authored by GST staff — moderate risk (a malicious staff member could plant an injection, but that's an insider-threat problem outside MCP scope). The radar tools return third-party content from Inoreader — **highest risk**, since adversaries control the source. Sanitization MUST be strongest on the radar surface, weaker on the diligence/portfolio surfaces, and inputs MUST be schema-validated everywhere.

**Out of scope**

- Multi-tenant data isolation per client (each client sees the same projects.json — there's no client-specific data store yet)
- Client-supplied custom tools (write surface) — read-only by design
- Federated search across multiple GST environments
- Real-time streaming notifications (e.g. webhook on new FYI item) — defer until at least one pilot client requests it

**Risks & mitigations**

- **Compliance scope creep**: PE clients may request SOC 2 Type II, ISO 27001, or specific contractual indemnities. Mitigation — define a "minimum viable compliance" baseline before pilot recruitment; route requests above the baseline to a separate enterprise tier with separate pricing
- **Audit-log cost**: at high volume, log storage + egress could exceed pilot revenue. Mitigation — default retention is metadata-only (no payloads); full-payload retention is an upsell tied to a higher tier
- **OAuth-flow misconfiguration**: implementing OAuth from scratch is the most common source of CVEs in MCP-adjacent projects. Mitigation — use Cloudflare Access for SaaS or another battle-tested IdP, do not roll your own
- **Prompt-injection via radar content**: third-party article text is the highest-risk surface. Mitigation — sanitization layer + size cap + provenance metadata; document for clients that radar output should not be auto-actioned by their agents without human review
- **Pilot client churn**: PE firms have long sales cycles; pilots may stall on legal review. Mitigation — start legal review (NDA + DPA + SLA template) in parallel with engineering work, not after; have at least one warm design partner identified before kickoff
- **Reputational risk on outage**: a stale `_provenance` field or hallucinated diligence question reaching a client's investment committee is a brand event. Mitigation — sandbox-first onboarding, explicit "human in the loop" language in the developer docs, status page transparency

**Validation sequence before pilot launch**

1. All BL-032 acceptance criteria still passing in production
2. OAuth flow end-to-end tested against a real client SDK (Claude Desktop's MCP HTTP+OAuth path) — token issuance, refresh, revocation
3. Penetration test report received and all High/Critical findings remediated
4. Audit-log integrity check produces a verifiable hash chain after a synthetic 1000-event burst
5. Sandbox client successfully exercises every tool from a non-GST IP, with the corresponding audit entries visible in the per-client export
6. Two pilot agreements signed (legal + technical) — engineering does not "soft launch" without paper
7. Status page live, on-call rotation defined, incident response runbook in place
8. Public listing on at least one MCP directory with a working "try it" demo — **superseded 2026-07-27: listing moved to [BL-093](#bl-093-mcp-server--commercialization-phase-4) as a candidate gated on the pen test + a promotion trigger (e.g. first paying client live), so it no longer gates pilot launch**

---

### BL-034: MCP Server — Documentation Cleanup (rolling catch-all, stub)

**Source**: rolling cleanup catch-all for the MCP-server doc surface | **Status**: ✅ Substantially complete 2026-07-02 (doc restructure, transitional-scaffolding delete, ADR audit, enumParity 7/7, accumulated-bullet resolution, TechPar `exitMultiple` fix via PR #287 all shipped) — full acceptance-criteria history via `git log -- src/docs/development/BACKLOG.md` (pre-prune revision `996b6b4c`)

**Why this stub survives the 2026-07-15 prune**: BL-034 is the standing append-target — any BL-033-era initiative that leaves transitional scaffolding, stale doc references, or cleanup debt behind appends a bullet here in the same PR, and a closing pass executes the accumulated list when the initiative sequence ends.

**Open contingent items**:

- [ ] Library content-source convergence (single source of truth for `gst://library/*` article bodies) — contingent, re-verified still-deferred 2026-07-02; execute if/when the library surface is next touched
- [x] **Dead `npm run radar:seed` instruction in live surfaces** (discovered 2026-07-19 during the CLAUDE.md accuracy audit; **✅ RESOLVED 2026-07-21 — Option A, faithful restore**): commit `606f4848` (BL-032.8 Phase B) had removed the `radar:seed`/`radar:unseed` root scripts while ~15 live surfaces (incl. `SNAPSHOT_MISSING_MESSAGE`, the `gst_radar_brief_today` prompt body, tool descriptions, ARCHITECTURE.md, CONTRACT/USAGE) still instructed users to run them. Operator decision: restore the seeder rather than sweep the messages. Shipped: `mcp-server/scripts/seed-radar-cache.mjs` + restored root scripts (plain Node, no tsx), fixture converted to `radar-mock-data.mjs` + `.d.mts` sidecar (single source of truth for seeder + unit suite), round-trip drift-guard test (`radar-seed-roundtrip.test.ts` — seeder output read back through the real reader), and the offline-workflow docs (RADAR.md § Working Offline stdio subsection + cross-links). Every pre-existing reference is accurate again with zero message/golden churn

---

### BL-088: Development-Docs Distillation & Cleanse ✅ CLOSED 2026-07-17 (all 5 waves)

**Source**: operator directive 2026-07-15 — `src/docs/development/` had accumulated 39 flat files (~2.4 MB) where 32 closed-initiative narratives drowned the 7 living reference docs, while load-bearing design rationale existed only inside those frozen narratives (cited by ~100 path-bearing references from live code/config/tests/docs) | **Architecture & plan**: [MCP_DOCS_DISTILLATION_BL-088.md](_archive/MCP_DOCS_DISTILLATION_BL-088.md) (archived at closure per its own lifecycle) — disposition table, link policies, PR ledger | **Effort**: ~7-9 days estimated; landed in 5 PR waves over 3 days | **Status**: ✅ **CLOSED 2026-07-17** — PR 1 (archive wave, 2026-07-15: `_archive/` scaffolding + 16 archive-only docs + ~30 refs + lifecycle convention); PR 2 (`mcp-server/src/docs/ARCHITECTURE.md` + 42 refs), PR 3a (ADR-0001/2/3 + 19 refs), PR 3b (ADR-0004–0007 + 27 refs), PR 4 (doc folds + `prompts/irl-ingestion.md` + 22 refs), and PR 5 (closure sweep — final grep clean; the initiative doc archived itself) all 2026-07-17. Net: 32 closed-initiative narratives (~2.3 MB) distilled into 1 maintained ARCHITECTURE.md + 7 ADRs + 3 doc folds + 1 prompt companion doc, with ~140 references repointed; `src/docs/development/` now contains only the 7 living references

**As a** developer or agent looking for authoritative context in `src/docs/development/`, **I want** closed-initiative narratives distilled into maintained documentation (a living `mcp-server/src/docs/ARCHITECTURE.md`, lightweight ADRs under `src/docs/adr/`, folds into existing tool/prompt docs) with the originals archived under a documented convention **so that** the directory contains only living documents, every code-comment rationale pointer resolves to a maintained doc, and future initiative docs follow a distill-then-archive lifecycle instead of accumulating.

#### Acceptance Criteria

- [x] PR 1 — `_archive/` scaffolding (criteria + index + frozen-links policy), 16 archive-only docs moved, ~30 living refs repointed, dead BREAKING_CHANGES anchors fixed, lifecycle convention codified in README.md + CLAUDE.md cross-link (2026-07-15)
- [x] PR 2 — `mcp-server/src/docs/ARCHITECTURE.md` distilled from the 5 BL-031/032.x design docs (5 parallel distillation agents, each verified against shipped code); sources archived; 42 refs repointed; 2 stale claims fixed (DEPLOY.md Q4 supersession, PERFORMANCE_OBSERVABILITY "not yet shipped" row) (2026-07-17)
- [x] PR 3a — `src/docs/adr/` scaffolding (README + TEMPLATE) + ADR-0001 (stage adapter, incl. the 2026-07-14 benchmark-audit re-validation), ADR-0002 (body-by-hash), ADR-0003 (xlsx canonicalization + deferral triggers); 3 sources archived; 19 refs repointed (2026-07-17)
- [x] PR 3b — ADR-0004 (Resources surface + ESLint-enforced Inoreader import restriction), ADR-0005 (URL-state deeplink contract + capability-mirror + no-URL-back-compat), ADR-0006 (Zone-1 budget protection + circuit breaker, soak-derived), ADR-0007 (registered-prompt pattern + maturity bar); 4 sources archived; 27 refs repointed incl. the active eslint.config.mjs message (2026-07-17)
- [x] PR 4 — contracts-pattern rationale folded into `tools/README.md`; BL-043 rationale folded into the dual-sourced irl-tool-input-mapping SOP (§ Design provenance, byte-identical both copies + prebuild regen); NEW `mcp-server/src/docs/prompts/irl-ingestion.md` (first per-prompt companion doc — contract/execution/enforcement/evolution, verified against v0.21.1 code); 4 sources archived; 22 refs repointed (2026-07-17)
- [x] PR 5 — final sweep grep clean (sole exception: intentional provenance banners in distilled docs); closure stanza; the initiative's own design doc archived per the lifecycle it created (2026-07-17)

---

### BL-089: Documentation Link & Anchor Integrity Guard

**Source**: docs-wiring audit 2026-07-18 | **Effort**: ~0.5–1 day | **Status**: ✅ **CLOSED 2026-07-19** — guard shipped as [`tests/integration/docs-link-integrity.test.ts`](../../../tests/integration/docs-link-integrity.test.ts) (root project → runs under `npm run test:run`), a `test:docs` npm script, and the [`docs-integrity.yml`](../../../.github/workflows/docs-integrity.yml) CI workflow. On first run it surfaced **21 pre-existing broken links/anchors** (BACKLOG anchors orphaned by the July prune, references to the April-removed `PLATFORM_HARDENING_V1.md`/`BUSINESS_ENABLEMENT_V1.md`, reworded-heading anchor drift, and an emoji-in-anchor mismatch) — all fixed in the same PR, repointed to their distilled homes (ADR-0005, ARCHITECTURE.md anchors, `_archive/`).

**As a** developer or agent relying on documentation cross-references, **I want** an automated test that verifies every relative markdown link target — and every load-bearing `#anchor` cited from code comments and cross-doc links — still resolves, **so that** the BL-088 distillation investment (ARCHITECTURE.md anchors, ADR pointers, dual-source SOPs) cannot silently rot when a file is renamed or a heading is reworded.

#### Acceptance Criteria

- [x] A repo-local Vitest test (self-contained, no new external dependency — GitHub slugifier hand-rolled inline per the repo's `contract-parity.test.ts` no-dep precedent, unit-tested against 6 real headings this repo cites):
  - [x] Resolves every relative markdown link target across both doc trees (`src/docs/**`, `mcp-server/src/docs/**`), the root/`mcp-server` READMEs, `.claude/CLAUDE.md` (root-relative), and `observability/slo-baselines.md` — including ~170 links to non-`.md` source files
  - [x] Resolves every `#anchor` on a link to a `.md` file to a real heading (GitHub slug rules; skips external URLs, images, fenced + inline code)
  - [x] Resolves the load-bearing **code → doc-anchor** citations by scanning source for `*.md#anchor` (auto-covers `inoreader-egress.ts` + `_local-only.ts`); path-only citations (e.g. `eslint.config.mjs` → ADR-0004) covered by an explicit list
- [x] Excludes `_archive/` docs as scan **sources** (frozen-verbatim policy) while still verifying links/anchors that point **into** the archive
- [x] Wired into local validation (`test:run`) and CI (dedicated `docs-integrity.yml`, documented in `DEVELOPER_TOOLING.md` per Directive 14 — the developer-tooling directive, numbered 11 at ship time)
- [x] A `mkdtemp` fixture proves the guard fails on a broken file + broken anchor and passes valid/external/fenced cases (red-then-green)

#### Notes

- **Slugifier is hand-rolled, not a dependency**: investigation confirmed no slug/markdown library exists in either `package.json`; adding one for ~10 lines would break the repo's established no-new-dep norm. Validated against golden cases (`&` → `--`, emoji stripped, `(Q12)` → `q12`, etc.).
- **Not a required check by default**: `docs-integrity.yml` runs on every PR but is advisory until "Verify doc links" is added to branch-protection required checks (operator action).
- **Deferred follow-up** (not this item): a "Last Updated" freshness check flagging docs whose stated date predates their last `git` commit.

---

### BL-093: MCP Server — Commercialization (Phase 4)

**Source**: operator directive 2026-07-27 — proactive positioning: build the commercial front door (public developer docs, website marketing, invoice-first payments, request-access + provisioning automation) ahead of demand; absorbs BL-033's two go-to-market ACs (MCP-directory listing → candidate sub-block here; public developer docs → first AC block). SLA ratification and perf promises stay deferred in [BL-033](#bl-033-mcp-server--external-pilot-phase-3) per "don't ratify SLA numbers no client has contracted" — this item is onboarding/capability infrastructure, which proceeds as roadmap work | **Effort**: ~2–4 weeks engineering across independently-shippable slices + content/legal lead time | **Status**: ⏸️ **DEFERRED (operator, 2026-08-02)** after slice 1 — see below | **Depends on**: BL-033 Slices 1–5 (shipped 2026-07-23→26 — OAuth 2.1 embedded AS [ADR-0008](../adr/0008-mcp-oauth-embedded-authorization-server.md), hash-chained audit log [ADR-0009](../adr/0009-compliance-audit-log-hash-chain.md), per-client rate-limit tiers [ADR-0010](../adr/0010-per-client-rate-limit-tiers.md), status page, [`PILOT_ONBOARDING.md`](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md))

**As a** prospective MCP client (PE deal team, corp-dev, procurement engineer) who discovers GST's MCP server, **I want** public developer docs, a website front door with a request-access path, and an invoice-backed paid tier **so that** I can evaluate, request access, get provisioned, and pay without GST inventing the commercial motion per-client.

> ⏸️ **DEFERRED (operator, 2026-08-02), after slice 1 shipped.** **Re-engage triggers (any one): a warm design partner is identified, a specific prospect asks for one of these surfaces by name, or the operator makes a fresh go-decision on building the front door ahead of demand.**
>
> The premise in **Source** above — "proactive positioning: build the commercial front door ahead of demand" — is the thing deferred, not any individual slice. It failed the same test [BL-033 § Prompt-injection hardening](#bl-033-mcp-server--external-pilot-phase-3) applies one stanza up: **there are no consuming clients yet** (BL-033's "2 design-partner PE firms onboarded" is unticked, its pen test deferred), so every remaining slice here is pre-building for a pilot that doesn't exist. BL-093's own MCP-directory analysis already concedes the counterweight — "PE-firm buyers don't shop developer registries; the near-term sales motion is relationship-driven; a listing amplifies an offer, it doesn't originate one" — which generalizes past the listing to the docs site and marketing page too. A front door is not the bottleneck when nobody is at the gate.
>
> **Slice 1 (provisioning automation) shipped anyway and stays** — see its ✅ ACs below. Honest framing: the script itself is inventory until there is someone to provision. What it delivered that pays off regardless was incidental to it — three pre-existing runbook defects found and fixed en route, one of which (an audit-guarantee overclaim) was headed into client-facing email.
>
> **Do not resume slice-by-slice.** The next BL-093 action is a decision about the premise, not a slice pick. Selecting the next-unblocked slice is what produced inventory the first time: the three remaining slices are blocked on operator decisions precisely because they are the ones that touch the market. All AC detail below is preserved so it isn't re-derived when a trigger fires.

#### Acceptance Criteria

**Public developer documentation** (absorbed from BL-033 § Verification & docs, 2026-07-27)

- [ ] Public developer docs published at `https://docs.mcp.globalstrategic.tech` — tool reference, authentication guide (M2M `client_credentials` + how to request access), rate-limit policy, audit-log guarantees, status-page link (the original BL-033 scope, carried verbatim)
- [ ] Tool reference derives from the existing per-tool-family `CONTRACT.md`/`USAGE.md` corpus (`mcp-server/src/docs/tools/{icg,portfolio,regulatory-map,tech-debt,diligence,radar,techpar}/`), already drift-guarded by `mcp-server/tests/integration/contract-parity.test.ts` — a publication pipeline over that corpus, NOT a parallel hand-written or separately-generated reference (avoids a third description of every tool)
- [ ] Consumer quickstart derived from [`REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) — its audience header currently says "GST team member (consumer)"; split or re-audience for external clients without breaking the internal doc
- [ ] Rate-limit page carries the "tunable, non-contractual capability ceilings — NOT ratified SLA quotas" framing from [`RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md) / ADR-0010 — no published doc may imply a ratified SLA
- [ ] Published set reviewed against [`AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md) / [`DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) so operator-only material (admin endpoints, key rotation, Upstash) stays private

**Website marketing surface**

- [ ] Dedicated page under `/hub` (route naming consistent with `/hub/radar`, `/hub/tools/*`): what the server is, the BL-033 use cases, tier table, links to the public docs + status page, request-access CTA
- [ ] MCP offer section on `src/pages/services.astro` (zero MCP marketing exists site-wide today) + cross-link from `src/pages/hub/index.astro`
- [ ] Page meets the existing hub-page bar: design-system tokens only, works in light/dark themes and all 6 palettes, desktop-first responsive; E2E coverage per [`TEST_STRATEGY.md`](../testing/TEST_STRATEGY.md); if any existing copy strings change, the Directive-11 `grep tests/` check applies
- [ ] Copy includes the human-in-the-loop caveat for radar content (per BL-033 § Risks & mitigations: radar output should not be auto-actioned by client agents)

**Request-access front door + provisioning automation**

- [ ] Request-access form/CTA (name, firm, use case, email) delivering to the operator — explicitly NOT self-serve credential issuance and NOT a user directory (preserves ADR-0008's pre-registration / no-DCR stance)
- [ ] CSP compliance: the site pins `form-action 'self'` and an explicit `connect-src` — an external form endpoint or submission API must be added to the allowlist in BOTH `vercel.json` and `src/middleware.ts`, per [`SECURITY_HEADERS.md`](../security/SECURITY_HEADERS.md)
- [ ] BL-004 coordination: the form either builds on BL-004's email-capture service selection (form UX, WCAG 2.1 AA, error states, zero client-side PII) or records the deliberate divergence here; either way `src/pages/privacy.astro` gains the data-collection disclosure (BL-004's privacy AC applies to this form too)

> 🟢 **Provisioning automation shipped 2026-08-02** as [`mcp-server/scripts/provision-client.mjs`](../../../mcp-server/scripts/provision-client.mjs) (`npm run provision:client`), with a `.d.mts` sidecar, helper + CLI-smoke suites under `mcp-server/tests/unit/scripts/`, and a parity test binding its tier/scope mirrors to `src/ratelimit/tiers.ts` and `src/oauth/provider.ts`. The wrapper exists for guardrails the admin API does not provide: it **requires** `--tier` (the API resolves an absent tier to `free-pilot` silently) and **validates scopes** (the API accepts any non-empty array, so `tool:portfolo:*` would provision a client that can call nothing). Three pre-existing runbook defects were fixed in the same change: PILOT_ONBOARDING gave the M2M revoke route as `/admin/oauth/clients/<id>` (the provider-client route — 404s for an `m2m_*` id); both it and AUTH.md still described per-client tiers as unenforced, stale since Slice 5; and § 3 promised clients that **every** tool call is audited, which contradicts this backlog's own 🟡 disposition above (capture is best-effort at the enqueue hop). The runbook and the generated email now both say "tool calls are written", with the fail-closed seam named as the lever for a client who contracts guaranteed capture.
>
> **Observation for a later slice**: the script has no `--jwks-file` flag on purpose. `createM2mClient` mints and hashes a `clientSecret` unconditionally, and `/token` takes the `private_key_jwt` branch only when a `client_assertion` is presented — so registering a JWKS does **not** disable secret auth. A flag implying otherwise would silently discard a live, unrecoverable secret. Genuinely secret-less M2M clients need a server change first; JWKS registration stays on the AUTH.md curl path until then.

- [x] One-command operator provisioning script (`mcp-server/scripts/`) wrapping the existing admin API (`POST /admin/oauth/m2m-clients` — `mcp-server/src/oauth/m2m-clients.ts`, `mcp-server/src/admin/oauth-clients.ts`): creates the client, assigns scopes + tier, and emits a ready-to-send onboarding email (credential hand-off note, REMOTE_CLIENT_SETUP link, the guarantees list from PILOT_ONBOARDING § 3) — ✅ the email deliberately **excludes** the client secret, which is printed to the terminal once instead; putting it in a mail draft would undo the "secret exists only in the creation response" property
- [x] Script defaults mirror the PILOT_ONBOARDING guardrails: minimum scopes, `tool:radar:*` excluded unless explicitly flagged, tier required, admin key via env var never inline (Directive 15) — ✅ and deliberately stricter on two counts: `resource:radar:read` is gated by `--allow-radar` too (it reads the same Inoreader-funded snapshot and sits inside the exported `DEFAULT_SCOPES`), and there is no `--admin-key` flag at all
- [~] [`PILOT_ONBOARDING.md`](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md) updated: manual curl replaced by the script; request-access intake feeds its step 0 — 🟡 **curl replaced; intake half pending**: § 0 now names the intake and what it must supply, but it describes today's operator-inbox reality. It closes when the request-access form above ships and delivers into it.

**Payments & invoicing (invoice-first, operator-driven)**

- [ ] Stripe Invoicing/Billing configured for the `paid`/`enterprise` tiers — **no payment code on the website or the Worker** (none exists today; this stanza keeps it that way)
- [ ] Operator payments runbook (new operations doc or PILOT_ONBOARDING extension): contract signed → invoice sent → payment confirmed → tier assigned (the tier flip is the existing admin-API step, now via the provisioning script above)
- [ ] Every `paid`/`enterprise` tier assignment traceable to a paid invoice (invoice ID recorded alongside the client record)
- [ ] Pricing presentation decided and published on the marketing page + docs site; ceilings remain non-contractual per ADR-0010

**MCP directory listing** (candidate sub-block; absorbed from BL-033 § Pilot operations, 2026-07-27) — **Status**: Candidate · do NOT submit before the hard gate + a promotion trigger

Benefit analysis, condensed from BL-033 § Business value (whose original bullets remain there — the restatement is deliberate so this candidate stays self-contained): inbound discoverability from agent-curious PE/VC funds, category positioning ("one of the first M&A advisory firms with a public MCP server"), and a direct sales channel that bypasses the traditional advisory motion. Honest counterweight: PE-firm buyers don't shop developer registries — the near-term sales motion is relationship-driven; a listing amplifies an offer, it doesn't originate one.

- [ ] Submission to MCPMarket.com, Anthropic's official MCP registry, and Cursor's MCP catalog with screenshots and a 60s demo video (the original BL-033 AC, verbatim)
- [ ] `/.well-known/mcp` + `server.json` registry metadata published on the Worker (neither exists today; only the two OAuth well-knowns are served)

**Hard gate** (regardless of triggers): BL-033's independent pen test passed with findings remediated — that AC stays in [BL-033](#bl-033-mcp-server--external-pilot-phase-3) and already reads "remediated before public listing".

**Promotion triggers** (any one, after the hard gate):

- Request-access flow (above) live, so inbound install attempts can be absorbed
- First paying client live — validates the offer before amplifying it
- Explicit operator go-decision after the marketing surface ships

#### Technical Context

- **Existing assets to build on**: the M2M admin API + [`AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md) runbook; [`PILOT_ONBOARDING.md`](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md); [`REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) as quickstart raw material; the CONTRACT/USAGE corpus + contract-parity guard; the tier system (ADR-0010, [`RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md)); per-`keyOwner` Analytics Engine telemetry + the status page ([`STATUS_PAGE.md`](../../../mcp-server/src/docs/operations/STATUS_PAGE.md)) giving per-client usage visibility at invoice time; the hash-chained audit log (ADR-0009, [`AUDIT_LOG.md`](../../../mcp-server/src/docs/operations/AUDIT_LOG.md)) as the compliance sales asset
- **Sequencing**: docs site and marketing page parallelize; request-access ships with/before the marketing page (a front door needs a doorbell); payments runbook before the first paid conversion; registry listing stays candidate
- **Relationship to BL-033**: Phase 3 = pilot capability + trust infrastructure (retains pen test, load test, sandbox env, design-partner recruitment, regional latency, SLA — deferred, prompt-injection hardening — deferred). Phase 4 = the commercial front door
- **Out of scope** (each with where the decision lives + the revisit trigger):
  - **Self-serve signup / user directory / dynamic client registration** — [ADR-0008](../adr/0008-mcp-oauth-embedded-authorization-server.md) records the stance and its revisit triggers; identity remains delegation over pre-registered clients
  - **Usage-metered billing** — tiers are capability ceilings ([ADR-0010](../adr/0010-per-client-rate-limit-tiers.md)). Trigger: a client asks for usage-based pricing, or invoice disputes require per-call metering (the per-`keyOwner` telemetry is the seam)
  - **SLA ratification** — stays deferred under BL-033 (operator directive); nothing in this stanza may ratify one by implication
  - **Public checkout / webhook-driven tier automation** — trigger: request-access volume makes operator-driven invoicing the bottleneck

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

### BL-048: MCP Server — Wrangler Secret Sync (extracted from BL-037 Phase D)

**Source**: BL-048 — extracted from [BL-037 § Phase D — Wrangler secret sync](_archive/MCP_SERVER_CI_CD_DEPLOY_BL-037.md#phase-d--wrangler-secret-sync-1-day-extracted-2026-05-31--bl-048-indefinitely-deprioritized). Originally scoped inside BL-037 as the fourth and lowest-priority phase ("optional, deferred"). 2026-05-31 audit recommended extraction so BL-037 can close after Phase C ships without carrying an indefinitely-deferred phase. | **Effort**: ~1 day implementation after a secret-manager substrate is chosen | **Status**: 🟦 **Open · DEPRIORITIZED — indefinitely deferred** until rotation friction or audit-trail need crosses a threshold | **Depends on**: BL-037 Phases A/B (shipped 2026-05-31) for the deploy substrate; selection of a secret-manager substrate (1Password Secrets Automation, Doppler, AWS Secrets Manager, HashiCorp Vault, or other)

**As a** GST operator running the MCP server, **I want** Cloudflare Worker secrets (`MCP_KEY_*`, `UPSTASH_MCP_REST_*`, `SENTRY_DSN`, `INOREADER_*`, `MCP_ADMIN_KEY`) to sync from a single canonical secret manager into Cloudflare via CI/CD **so that** secret rotation becomes a one-click operation, every rotation has an audit trail, and staging/production stay in lockstep without manual paste from my laptop.

#### Why deprioritized

- **Rotation cadence is low** — current secret families rotate quarterly at most (BL-047 INOREADER OAuth bindings on token death; team-key rotation on operator turnover). At that frequency the per-rotation friction (~5-15 min of laptop paste) does not compound the way per-merge deploy friction compounded under BL-037 Phase A/B.
- **Multi-environment consistency risk is currently low** — single-operator scale + the SECRETS_INVENTORY.md audit at PR #186 demonstrated env-binding parity. Risk grows with BL-033 (external pilot expands operator pool).
- **Material upstream decision required** — picking the secret-manager substrate (1Password vs Doppler vs AWS SM vs Vault) is a multi-quarter commitment with material per-month cost. Should not be made under deploy-automation pressure.
- **Operator-direct path remains documented** — `wrangler secret put` from a laptop with creds works fine. DEPLOY.md § C is the canonical reference and stays current.

#### Trigger thresholds — revisit when

- BL-033 external pilot ramps (multiple operators) AND first incident occurs where staging/prod secret drift is the root cause.
- Routine secret rotation cadence exceeds monthly for any single secret family.
- A compliance/audit requirement explicitly mandates per-rotation audit-trail records.
- Operator-direct rotation path breaks (e.g., Cloudflare API changes; `wrangler secret put` is deprecated).

#### Out of scope for this stanza — but documented for revisit

- Substrate choice (1Password Connect / Doppler / AWS SM / Vault) — see [BL-037 § Phase D](_archive/MCP_SERVER_CI_CD_DEPLOY_BL-037.md#phase-d--wrangler-secret-sync-1-day-extracted-2026-05-31--bl-048-indefinitely-deprioritized) for the original sketch including the `cloudflare/wrangler-action@v3` `secrets:` input contract.
- Trigger model (workflow_dispatch only vs repository_dispatch from secret-manager webhook on rotation).
- Filename: design doc proposes `secrets-sync-mcp.yml`.

#### Why "deprioritized + indefinite defer" and not "won't do"

Per CLAUDE.md § 4a "no deferred tech debt": deferral is acceptable when there is a written trigger condition for revisit and the deferred work is NOT verification of code currently in scope. Phase D meets both criteria — it's net-new automation with explicit trigger thresholds above, not unfinished verification. The deprioritization stays honest by naming the conditions under which it gets re-evaluated.

---

### BL-087: `gst_irl_ingestion` — Prompt-Shrink L3–L5 (reserved)

**Source**: reserved successor scope from BL-086 (Option D workflow simplification, L2 verified + shipped 2026-06-30 at prompt v0.19.0 / mcp-server 0.32.0). BL-086 deliberately **stopped at L2**; the three deeper cuts were deferred here pending empirical evidence. | **Architecture & plan**: [MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086.md](_archive/MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086.md) (§ L3–L5 + capability-preservation matrix) | **Status**: Reserved — do NOT start without a promotion trigger firing

**Deferred scope**:

- **L3** — (J) gap-list semantic change (more honest gap reporting; shifts operator readability). Ships with a `precheckCitations` restore arg.
- **L4** — VERIFY-block removal from default output. Ships with an `emitVerifyBlock` restore arg. Asymmetric risk: external consumers of the VERIFY audit surface can't be proven absent.
- **L5** — `validate_irl_provenance` tool unregistration — the only non-arg-reversible cut.
- Sugar: collapse the restore args into an `auditLevel: 'standard' | 'enhanced' | 'debug'` enum if both L3 and L4 ship.

**Promotion triggers** (any one):

- Empirical evidence that (J) gap-list growth is unacceptable in live exercises
- Confirmation that no one consumes the VERIFY block externally (unlocks L4)
- Evidence that nobody manually calls `validate_irl_provenance` (unlocks L5)

---

### BL-091: MCP Server — Circuit-breaker open serves cached radar ✅ CLOSED 2026-07-27

**Source**: operator question 2026-07-27 — "why doesn't the breaker just feed from the cache instead of failing the client call?" | **Effort**: ~1 day | **Status**: ✅ **CLOSED 2026-07-27** (mcp-server 0.42.0)

**As a** radar consumer (MCP client, `gst://radar/*` reader, or the `/hub/radar` website), **I want** a breaker-open window to serve the cached snapshot rather than a hard failure **so that** an Inoreader budget incident degrades gracefully instead of blanking radar for up to 6 hours.

**What shipped**

- **Tools stopped over-applying the breaker.** `search_radar` / `get_latest_insights` checked `isCircuitOpen` as their first statement and returned 503 _before reading the cache_ — a warm 6h snapshot went unserved. They now read cache-only and serve it flagged `liveInfo.degraded: true`; the 503 envelope (shape unchanged) is the last resort, only when nothing is cached.
- **Resources and `/radar/snapshot` stopped under-applying it.** Neither had any breaker check, so on a cold cache during an open window they fetched Inoreader live — leaking the exact budget the breaker protects. Both now switch to cache-only reads. `/radar/snapshot` can additionally now **open** the breaker (it was the highest-volume consumer and the one surface that could absorb a 429 without tripping it).
- **Structural enforcement**: a second reader family (`readWireCached` / `readFyiCached`) whose `cache-empty` failure is deliberately not assignable to `InoreaderFailure`, so a cache miss can never reach `openCircuit`. Plus a frozen-call-site test (`tests/integration/radar-store-callers-breaker-gated.test.ts`) that fails CI if any module imports the fetch-capable readers without importing `isCircuitOpen` — this defect had already occurred twice, so the _class_ is now guarded, not just the instances.
- Resource bodies flagged `noStore` are no longer cached for 15 min (the "snapshot not populated" placeholder outlived its cause). `circuitOpen` added to `/health` + `/status`, deliberately **not** wired into `health.ok`.
- Decision record: [ADR-0006 § Amendment 2026-07-27](../adr/0006-inoreader-zone1-budget-protection.md). Contract: [`RATE_LIMITS.md` § Circuit breaker](../../../mcp-server/src/docs/operations/RATE_LIMITS.md).

**Accepted trade-off**: nothing repopulates the radar cache while the breaker is open (the cron already skipped, and now no read fetches either), so an early Inoreader recovery is not detected automatically — manual reset is the documented lever.

#### Follow-up (candidate): safe half-open recovery probe

**Status**: Candidate · **do NOT implement the naive version**

A trial fetch to detect early Inoreader recovery was designed during BL-091 and **deliberately cut** because a naive probe can _extend_ an outage: it can succeed on the last unit of Zone-1 headroom, the follow-on wire refill (`CALLS_PER_WIRE` calls) then 429s, and `openCircuit` **resets the full 6h TTL** rather than preserving the original expiry — so a 30-minute probe loop can hold the breaker open longer than doing nothing. Ceilings quoted in probe-call counts also under-measure: they ignore the multi-call refill a successful probe authorizes.

A safe implementation requires all of: **(a)** Zone-1 spend-headroom gating before closing, **(b)** a TTL-preserving re-arm (not a full 6h reset) when the post-close refill fails, **(c)** compare-and-delete on close so a concurrent `openCircuit` isn't erased, **(d)** `forceRefresh` so "success" is genuine upstream evidence rather than a cache hit, and **(e)** a single-flight lock via the existing `lib/single-flight-lock.ts`. Budget the ceiling against `ZONE1_DAILY_HARD_CAP`, counting the refill.

**Promotion trigger**: a breaker-open incident where Inoreader demonstrably recovered early and the stale-radar window caused real harm.

---

### BL-092: MCP Server — declare `outputSchema` on the tool surface (candidate)

**Source**: split out of BL-090 (shipped 0.43.0, 2026-07-27) | **Effort**: medium | **Status**: Candidate

**As a** consumer of the GST MCP server, **I want** each tool to declare an `outputSchema` **so that** my client can validate `structuredContent` rather than trusting it — the natural completion of ADR-0011's "structuredContent is canonical".

**What**: no tool declares an `outputSchema` today (verified), which is why `structuredContent` is transmitted but unvalidated. Adding one per tool means authoring output schemas for 16 tools.

**Blocked-by constraint — read before starting.** The SDK client validates `structuredContent` **whenever present, with no `isError` guard** (`client/index.js`, contradicting its own adjacent comment). ADR-0011 Invariant 1 puts `structuredContent` on error results too. So the day any tool declares an `outputSchema`, its error results would throw `McpError` client-side. Any implementation MUST either scope schemas to the success shape only, or exempt error results (the `toolFail` `suppressStructured` option exists for a related contingency). Do not pick this up without resolving that first.

**Weigh honestly before building**: 16 hand-authored Zod output schemas can drift from the handlers that build the payloads, which is _more_ cognitive load unless derived — and TypeScript types do not survive to runtime. The win is client-side validation, not model comprehension. Deferred from BL-090 for exactly this reason.

**Acceptance criteria**

- [ ] Error-result interaction resolved and tested against a real client round-trip before any schema ships
- [ ] Schemas derived or generated where possible, not hand-maintained in parallel with the handlers
- [ ] `contract-parity` coverage so a schema and its CONTRACT.md cannot drift

---
