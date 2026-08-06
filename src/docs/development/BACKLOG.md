# Development Backlog

Consolidated backlog of open development initiatives for the GST website. Each item is a self-contained user story with enough context to design and implement a solution. Items are grouped by theme, not priority — triage happens separately.

> **Completed and closed items** are removed from this file once done — recover any stanza's full acceptance criteria and technical context via `git log -- src/docs/development/BACKLOG.md`, or consult the per-initiative design docs in [`_archive/`](_archive/README.md) (they are no longer kept in this directory — see the [initiative-doc lifecycle](README.md)). Two cleanup waves so far:
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

**Source**: split out of the `--touch-target-min` change 2026-07-29, which fixed the button classes and deliberately stopped there | **Effort**: Medium — mostly design calls on space-constrained controls | **Status**: **CLOSED 2026-08-03.** Every AC delivered across two slices. The § Still owed list is empty and the AA half of the ruling is now machine-enforced rather than asserted

**As a** mobile user, **I want** every interactive control to be comfortably tappable **so that** I am not missing small targets on the tool pages.

#### Acceptance Criteria

- [x] **Ruling first** — **operator ruling 2026-08-03, NARROWED the same day after measurement: 44px is guaranteed and enforced on the guarded families; everywhere else the bar is AA 2.5.8 (24×24), which is already met.** The first ruling was site-wide-with-exceptions; applying it meant visibly rebuilding dense UI for a AAA figure, and an axe `target-size` probe (which implements 2.5.8 _including_ its spacing exception) came back clean on 9 of 10 routes at 390px — so the exceptions would have swallowed the rule. Original ruling text and reasoning: Recorded canonically in BRAND_GUIDELINES § Accessibility and made enforceable rather than left as prose: `FLOOR_EXCEPTIONS` in `touch-target-floor.test.ts` carries each exception with a reason, and a **stale entry fails the suite**, so an exception cannot outlive the control it excuses. A second, load-bearing clarification came out of it: 2.5.5 measures the **target**, not the element, so a small control inside a clickable label already passes — check for a larger clickable ancestor before raising anything
- [x] Audit and resolve the known sub-44 interactive controls. **Done 2026-08-03 for every control the guard can see** — the widened scan found exactly 7 declarations and all 7 are resolved: `.filter-button` (base `min-height: 38px` in `filter.css` **and** `height: 38px` in `PortfolioHeader`), `.modal-close` in `ProjectModal`, `.theme-toggle`, plus two in `PortfolioGrid` deleted as dead (below). Three corrections to this AC's original wording, found by doing it:
  - `.filter-button` was 38px **everywhere**, not only at 480px — `filter.css:82` carried the base.
  - `PortfolioGrid`'s `.modal-close` rules were **dead CSS**, not a missing base rule. That file's `<style>` is Astro-scoped and it renders no modal markup — the only `.modal-close` in the repo is `ProjectModal.astro:11` — so both media blocks were deleted rather than fixed. Found because two of them surfaced as touch-target violations.
  - `StickyControls.astro:126` already declared the token; the audit listed it in error.
  - `.brutal-quick-zoom` stays at 32px as a documented exception, so `regulatory-map-mobile.test.ts:97-106` (a `>= 32` floor) keeps passing unmodified.
    The rest — filter chips, nav and footer links — are padding-derived with no declaration to scan, and are closed under § Out of scope, along with TOC links. The palette-panel affordances are the exception: the rail tabs turned out to be a genuine **AA** failure and were fixed to 24px (see the correction in that section), not left at AAA-aspiration.
- [x] **Done 2026-08-03 — 9 routes → 22** (13 added; 9 of them needed a baseline). Added `/privacy/`, `/terms/`, `/booking-confirmed/`, `/404` (reached via a bogus URL, as `404-page.test.ts` does), all four `/hub/library/*`, `/hub/tools/`, and the four tool pages. Excluded by design: `/colors` (a bare 301), the four `/brand/responsive-frame/*` (chrome-less iframe partials, already covered by an exclusion on `/brand`), and the JSON endpoints.
      The **dev-only gateway cards** on `/hub/library` and `/hub/tools` are deliberately **not excluded** — asserting zero is honest, whereas a violation in markup that never ships would become a baseline CI can never clear. They came back clean.
      The 9 baselines are uniform at 1 node, and it is the same node every time: the header's active nav link. `/privacy/`, `/terms/`, `/booking-confirmed/` and `/404` have no active nav link and are clean.
      **This is what the AC was for.** The new routes surfaced three real findings nobody was watching: two on the regulatory map (filed as BL-102) and a scrollable region with no keyboard access (`#timelineScroll`), which was **partly fixed here** — the region is now scrollable by keyboard (WCAG 2.1.1, Level A; one attribute, no visual change), but the entries inside remain non-focusable `<div>`s with a delegated handler, so a keyboard user still cannot _open_ a regulation from the timeline. axe cannot see that, so it would never reach the ratchet: filed as **BL-104**.
      Note for CI: the required check runs chromium only, so the cost is 22 routes on one engine rather than three — but 22 routes at Playwright's worker count is real concurrent load on one dev server, so the five heaviest use `waitFor` + `domcontentloaded` rather than blocking on `load`. One transient failure was seen locally while the server was recompiling; two consecutive clean full runs after.
- [x] **Dead rule resolved 2026-08-03** — deleted. `.map-controls` is `display: none` below 1023px, so the `@media (max-width: 767px)` sizing could never paint. The controls were **not** made reachable on mobile: `regulatory-map-mobile.test.ts:89-95` is a hard equality pin and that is a feature change. What the dead rule was masking is now its own item — see BL-101
- [x] **Frame-clipping measurement — resolved 2026-08-02 by BL-097, and now permanently guarded.** The concern was that the 33→44px button growth could overflow the fixed frames (600×200 / 384×350 / 240×400, `body { overflow: hidden }`, so cropping is invisible). With all four groups finally rendering, measured content at 600px is `cards` 113px, `form` **139px**, `shell` 168px against a 200px frame — nothing clips, in either axis, at any of the three widths. Rather than record a number that rots, `tests/e2e/brand-page.test.ts` now asserts per frame that `documentElement.scrollHeight/scrollWidth` fit `clientHeight/clientWidth`. Note the instrument: measuring `body` instead would be **vacuous** — `<html>` is `overflow: visible`, so body's `overflow: hidden` propagates to the viewport, body's own overflow resolves to `visible`, and with `height: auto` it grows to fit, making `body.scrollHeight === body.clientHeight` regardless of cropping. That vacuity is **height-specific**: body's used overflow resolves to `visible`, so `body.scrollWidth` still reflects horizontal overflow — measuring `body` would silently lose the vertical finding while keeping the horizontal one
- [x] **Ratcheted 2026-08-03 — `/brand` went 13 → 0** and its `KNOWN_SERIOUS` entry was removed entirely rather than zeroed, so a new violation there now fails as an _unknown_ serious rather than sitting under a baseline. One principle covered all 13: **non-interactive labels move the semantic colour to the border/accent and take a readable text token; interactive buttons promote the compliant filled treatment their own `:hover` already defined.**
  - The 8 `.a11y-badge` chips: text → `--text-primary`, border keeps pass/fail. The lever this AC originally proposed — fill the badge with dark ink — was **rejected on evidence**: `/brand` is the one page with a runtime palette switcher, palettes override `--color-error`, and `#000` on palette 4's `#9f1239` is 2.5:1. axe scans only the default palette, so that regression would never have been caught.
  - `.brutal-tab--active` (**not** `.brutal-tab__label`, which declares no colour at all) and `.brand-tag` → `--color-tertiary`, matching `.brand-tag--theme` which already measured ~5.2:1.
  - `.brutal-reg-card__scope` → `--color-tertiary`. It has no `:hover` to promote and is not interactive, so the label treatment applied.
  - `.brutal-map-tap-bar__action` → filled by default, promoting its own hover pair.
  - `.project-card__cta` → **deleted with its specimen.** `.project-card` is the live production card, but PortfolioGrid binds its click handler to the whole card, so no CTA button is ever rendered — the `/brand` specimen was documenting a control production does not have.
  - **Four other baselines had rotted into slack** and were re-measured in the same pass: techpar 4 → 1, tech-debt-calculator 14 → 1, ma-portfolio 2 → 1, radar 2 → 1. A ratchet nobody re-measures stops being a ratchet.
  - What remained after that slice was **one node per route, and it was the same node**: the header's active nav link at 1.88:1. Closed in the second slice — see § Still owed, which is now empty. `KNOWN_SERIOUS` holds nothing at all.

- [x] **Done 2026-08-03.** BRAND_GUIDELINES § Accessibility now carries the ruling, the guarded families, the `min-height`-not-`min-width` rule, both documented exceptions with their bases, and the correction that nav/footer/TOC links are **not** covered by 2.5.5's Inline exception (which is "in a sentence or block of text" — the line-height clause belongs to 2.5.8). STYLES_GUIDE and the rendered `/brand` prose in `BrandAccessibility.astro` were brought into line

#### Out of scope, by operator decision 2026-08-03

Not deferred — **decided**. Recorded so nobody re-derives the sweep from first principles and reopens it.

The trigger was asking whether the remaining work actually changed the product. It did: filter chips (`.brutal-filter-chip` ~21px) would more than double, header and footer links would grow on every page and need their active underline rebuilt as an `::after`, and the PalettePanel rail would widen fixed chrome site-wide. All to clear **AAA**.

The measurement settled it. An axe `target-size` probe — that rule implements AA 2.5.8 _including_ its spacing exception, which is the part that cannot be hand-computed — came back **clean on 9 of 10 routes at 390px**, covering every one of those controls. They meet AA; only the AAA figure is unmet.

So: **filter chips, segmented controls, drawer/search closes, header nav links, footer links, TOC links and the PalettePanel rail are closed as out of scope.** 44px stays welcome where it costs nothing; it is not a reason to rebuild working UI. See BRAND_GUIDELINES § Accessibility for the narrowed ruling.

> **One clause of that probe was wrong, corrected 2026-08-03 in the second slice.** It reported the **palette rail tabs** clean. They are not: the probe ran only at 390px, where `.palette-panel__edge` is `display: none` and the tabs measure `0×0`, so "clean" meant "not rendered". At desktop they are 32×22 and fail `target-size` on both size and spacing. Fixed to a 24px AA floor — which does **not** reopen the decision above, since that closed the rail at 44px/AAA on the grounds it would widen fixed chrome, and this changes 2px of height and no width at all.
>
> The transferable lesson, and the reason this is kept rather than quietly edited: **a single-viewport probe reports absence as compliance.** Probe every viewport a control actually renders at. Both are probed now, and the standing `target-size` guard scans at the suite's desktop viewport, so this specific blind spot cannot recur silently.

#### Still owed — nothing. Closed out 2026-08-03 (second slice)

- [x] **The active nav link at 1.88:1** — closed. `--color-primary` (#05cd99) on #f5f5f5 at 14px/700; bold 14px is 10.5pt, under the 14pt-bold large-text threshold, so the bar was 4.5:1 and it was failing at under half. Ink moved to `--color-tertiary` — 5.47:1 in light, byte-identical in dark, where the token's dark value already _is_ #05cd99. Verified across all six palettes rather than assumed (5.47 / 9.50 / 8.24 / 8.32 / 7.05 / 8.36 on #f5f5f5, and no palette overrides `--bg-light-alt`), because the first slice was nearly caught out by exactly that with `--color-error`.
      Four rules carried the ink, not one: Header's `.active` **and** `:hover` (leaving hover would have made hovering the active link _lower_ its contrast), plus `typography.css`'s `.nav-link.active` and `.nav-link:hover` — a utility with no production consumer that renders only as a `/brand` specimen. A fifth carrier, the inline replica in `BrandUILibrary.astro`, is why there is a new test: the existing parity guard compares `.first()` on both sides, which is the **non-active** link, so the drift was invisible to it. The new guard reads two pages, because `/brand` has no active nav link to compare against — which is why the original settled for `.first()` in the first place.
      **`KNOWN_SERIOUS` is now empty.** All 16 entries were this one node; the suite passing 22/22 with the map emptied is the proof that they were.
- [x] **`wcag22aa` / `target-size` as a standing guard** — enabled. The prediction that it would "hard-fail until BL-103 is resolved" was pessimistic: measured, **21 of 22 routes were already clean** and `/brand` was the sole failure. **Verified** — not pinned — at axe-core 4.12.1, where the tag selects exactly one rule (`target-size`). `package.json` carries a caret, so a future bump can widen the tag; `helpers/a11y.ts` says what to do if an unfamiliar rule appears.
- [x] **Under-collected** — recorded in BRAND_GUIDELINES § Accessibility rather than left as a list here: `.brutal-search__result` and `.modal__close` render only after an interaction, so no scanned route reaches them; `.brutal-option-card` passes by padding and must not be trimmed.

#### Technical Context

- The floor itself is done: `--touch-target-min` exists, `.brutal-btn` / `.brutal-choice-btn` / `.cta-button` clear it, and `tests/integration/touch-target-floor.test.ts` fails any rule that resolves a button below it — including inside Astro scoped `<style>` blocks, where one of the two real regressions was hiding.
- 2.5.5 is **Level AAA**, so for most of the audit this was an enhancement rather than a compliance gap — worth stating plainly before anyone treats the 32px zoom control as a defect. **Corrected 2026-08-03**: the original wording here was "the AA criterion is 24×24, which every control above already passes", and that turned out to be false in two places. `/brand`'s swatch sliders (137 nodes) and the palette rail tabs (6) were genuine **AA** failures — see BL-103. AA is no longer taken on trust anywhere: axe's `target-size` enforces it on all 22 scanned routes.
- The `/brand` axe entry added with that change uses **both** instruments, deliberately: `checkA11y`'s `exclude` for the two things that are not debt (12 lazy same-origin iframes, whose load state at scan time would make the count nondeterministic; and the `[data-demo-state="hover"]` specimens, which are low-contrast on purpose and must never "improve"), plus — at the time — a `KNOWN_SERIOUS` baseline of 13 for contrast findings that genuinely were debt. That baseline is **gone**: `/brand` went to zero and the entry was removed rather than zeroed. The split judgement is what generalises, not the number — exclude what must not change, baseline what should decrease, and never widen the exclusions to make a number go away.

---

### BL-102: Regulatory map — how is the map exposed to assistive tech?

**Source**: surfaced 2026-08-03 the moment `/hub/tools/regulatory-map/` joined the axe sweep (BL-096 AC3) | **Effort**: Small to change, gated on one design call | **Status**: Open — needs the ruling first

**As a** screen-reader user of the regulatory map, **I want** the map to expose either its countries or itself, unambiguously **so that** I am not handed 110 labels that may or may not be announced.

**Two findings, one question.** Both are `serious`, both are excluded (not baselined) in `accessibility.test.ts` with a pointer here:

- **`aria-prohibited-attr`, 110 nodes.** Every `.country-path` carries **both** `role="presentation"` and `aria-label="<country>"`. A global ARIA attribute suppresses the presentation role, so it is genuinely ambiguous whether 110 country names are announced or silent — the markup asks for both.
- **`nested-interactive`, 1 node.** `#mapSvg` is `role="img"` — "treat this as a single image" — while holding focusable descendants.

**The call to make**: is the map a single image with a text alternative (drop the per-path `aria-label`s, keep the SVG's `role="img"`, and rely on the search + compliance panel for country access), or a navigable structure (drop `role="presentation"`, give the paths real roles, and accept 110 nodes in the a11y tree)? Both are defensible; they produce opposite experiences, and neither should be picked inside a route addition.

**Why excluded rather than baselined**: the 110 tracks the number of country paths in the topojson, so a baseline would be a data-derived number that breaks the day the map data changes — the same fixture-count trap that nearly shipped on the radar feed (see BL-095's note).

#### Acceptance Criteria

- [ ] A ruling on which model the map presents, recorded here
- [ ] `aria-prohibited-attr` and `nested-interactive` are zero on the route with `#mapSvg` back in scope
- [ ] The `#mapSvg` exclusion is removed from `accessibility.test.ts`, not merely lowered

---

### BL-103: `/brand`'s palette editor fails AA target size — 137 nodes at 6px

**Source**: an axe `target-size` probe run under BL-096, 2026-08-03 | **Effort**: Small | **Status**: **CLOSED 2026-08-03**, same day, as BL-096's final blocker

**As a** keyboard or touch user editing a palette on `/brand`, **I want** the RGB sliders to be reachable **so that** I can actually use the editor.

**What it is.** `.swatch-slider` (`SwatchControlStyles.astro`) renders a **131.6 × 6px** track. `target-size` reports **137 such nodes**, all on `/brand`. Unlike everything else BL-096 measured, these get **no relief from 2.5.8's spacing exception** — so this is a genuine **AA** failure, not the AAA gap the rest of the audit turned out to be. It is the only one found across 10 routes.

**Why it matters more than the count suggests**: `/brand` is the page that teaches the design system. A control there failing AA is a worked example of the wrong thing.

**A second offender, found on the way in**: `.palette-panel__tab` at **32×22**, 6 nodes. Not in the original count because this ticket's 137 came from a 390px probe, where the rail is `display: none`. See the correction under BL-096 § Out of scope.

#### Acceptance Criteria

- [x] **`.swatch-slider` clears 24×24 with the 6px paint intact.** The input goes `height: var(--touch-target-min-aa)` and `background: transparent`; the track pseudo-elements carry the paint. This is the recipe `.brutal-slider__input` already ships in `form.css:387-438` — which is also why the tech-debt calculator's range inputs already passed — so it was reused rather than derived, bringing its `light-dark()` track colour with it (`--border-light` alone is `rgba(26,26,26,0.1)`, near-invisible on the dark panel, and once the input is transparent that 6px track is the only paint).
      **Two rejected alternatives, recorded because both look right.** (1) The hit-area trick this ticket proposed — 6px paint plus a compensating negative margin, as `.theme-toggle` used — fails here: the rows sit at a ~15.5px pitch, so 24px boxes overlap by ~9px and the middle slider steals its neighbours' clicks. `.theme-toggle` worked only because it had no stacked neighbours. (2) Grouping the two vendor track pseudo-elements into one selector list; kept separate, matching `form.css`, because a browser drops the whole list on the pseudo-element it does not recognise.
- [x] **`target-size` reports zero on `/brand`** — measured at **both 1280 and 390**, which is the check this ticket's own scoping error argues for. Page growth: +399px desktop, +808px mobile, well under the ~1440px estimated from swatch count. Deliberately not pinned in a test — a page-height constant is the kind of measured number that rots.
- [x] `wcag22aa` enabled as a standing guard (BL-096), which this was blocking

**Correction to this ticket's own note**: it said to check `palette-panel-controls.test.ts` because it "drives sliders by coordinate". It does not — the only coordinate work there is the **resize handle**; every slider interaction sets `.value` and dispatches an event. There was no geometry coupling to break.

---

### BL-105: Hub gateway indexes wasted 60% of every row

**Source**: operator request 2026-08-03 — "the different cards should span multiple columns to make use of the entire page" | **Effort**: Small | **Status**: **CLOSED 2026-08-03**

**As a** desktop visitor to the Hub, **I want** the tool and library cards to use the width of the page **so that** I can see what is on offer without scrolling past one card at a time.

**What it was.** `.brutal-gateway-card` set `max-width: 600px; margin: 0 auto` on itself and neither `/hub/tools/` nor `/hub/library/` had a grid, so the cards stacked in one centred column. Measured against `.container`'s 1504px of content: **60% of every row unused** at ≥1600px, 49% at 1280, 35% at 1024, and `/hub/tools/` **4795px tall** — identical at every desktop width, because the card never reflowed.

**`/hub/` itself was already correct** and was left alone: `.hub-cards` has been `repeat(3, 1fr)` with 1024→2 and 768→1 all along. Its remaining 800px blocks (`.hub-intro p`, `.brutal-faq`, `.cta-box`) are reading measures on prose, and widening running text to 1504px would make it harder to read.

#### Acceptance Criteria

- [x] **Cards span multiple columns on desktop.** `.brutal-gateway-grid` in `cards.css`, following the pairing `PortfolioGrid.astro` already uses (`.grid` / `.project-card`) rather than a bespoke idiom: `repeat(auto-fill, minmax(420px, 1fr))` with a 768px `1fr` fallback. Measured after: **3 columns at 1504px** (469px each, matching `.hub-cards`' 475px), 2 at 1184/928. `/hub/tools/` **4795px → 2274px**.
      Fixed columns were rejected on measurement: `.container` is a flat `max-width: 1600px` with no responsive override, so `repeat(3, 1fr)` gives 368px cards at 1280 and 283px at 1025 — narrower than the same card on a 375px phone.
- [x] **The card stops positioning itself.** `max-width` / `margin` removed; the grid owns layout. Recorded in STYLES_GUIDE § Card grids as the general rule, since this is the second component to hit it.
- [x] **Mobile unchanged.** The 768px block reverts `display`, `max-width` and `margin` — verified at 375/480/768 across four properties, because a card-width check is blind to every failure mode here. It must stay _after_ the base rules: `> .brutal-gateway-card` ties them on specificity (0,2,0) and wins on source order alone.
- [x] **Equal-height rows without redesigning the CTA.** `flex-grow: 1` on the feature list, not `margin-top: auto` on the CTA — the tallest card in each row resolves an auto margin to 0 and would silently lose the gap above its CTA. `align-self: center` on the CTA and badge, because flex blockifies `inline-block` and `align-items: stretch` would have turned the "Planned" badge into a full-width bar.
- [x] **Regression guard**: `tests/e2e/hub-gateway-grid.test.ts`, there being no E2E file for either gateway index before this. Asserts relationships, never pixel constants — the row spans the full grid, CTAs bottom-align, the CTA stays narrower than its card, and mobile is one capped `block` column.
- [x] **`/brand` specimen** wrapped in the grid and moved out of `.brand-component-row`. Both that row and `.brand-component-item` are shrink-to-fit flex containers, so a grid inside them gets an indefinite inline size and `auto-fill` collapses to a single max-content track — the specimen would have documented a width nothing renders. `.brand-card-grid` sits at section level for the same reason. No second replica was added, per BL-095's note that the gateway card wants a real component first.
- [x] **Free cleanup** (Directive 6): the inert `.primary` / `.secondary` classes recorded in this file were stripped from both pages — 9 occurrences. Nothing in `tests/` selects them.

**Two things worth carrying forward.** The specimen documents the grid's _behaviour_ — equal-height rows, bottom-aligned CTA, one surviving empty track — not a width; `/brand`'s content column is `.brand-layout` (`280px 1fr`, capped 1400px), not `.container`, so its cards are a different size from the hub pages' by design and no number there is "the" gateway width. And `auto-fit` would have been wrong for exactly that reason: it collapses the empty track and stretches the lone specimen across the whole row.

---

### BL-104: Regulatory map — timeline entries are not keyboard-operable

**Source**: the scope limit of BL-096's `#timelineScroll` fix, 2026-08-03 | **Effort**: Small | **Status**: Open

**As a** keyboard user, **I want** to open a regulation from the timeline **so that** the timeline is a control rather than a picture.

**What it is.** BL-096 made `#timelineScroll` focusable so the region can be _scrolled_ by keyboard (WCAG 2.1.1, Level A). The entries inside it are still plain `<div>`s carrying `data-reg-id`, opened by a delegated click handler (`regulatory-map/index.astro` ~:1477) — **no `tabindex`, no role, no key handler**. So a keyboard user can scroll the timeline and still cannot open anything in it. That is the more serious half of the same 2.1.1 failure.

**Why it will not surface on its own**: axe cannot flag a `<div>` with a delegated listener — there is nothing in the markup that says it is interactive. It will never reach the ratchet, which is exactly why it is filed rather than left to be rediscovered.

**Remedy**: make each entry a `<button>`, or give it `tabindex="0"`, a role and Enter/Space handling. Prefer the former — it gets focus, semantics and keys for free.

#### Acceptance Criteria

- [ ] Every timeline entry is reachable by Tab and openable by Enter/Space
- [ ] Focus is visible against the timeline's own background, per the repo's 2px `--color-primary` convention
- [ ] The delegated click handler still works, or is replaced deliberately

---

### BL-101: Regulatory map — no single-pointer way back to the world view

**Source**: surfaced 2026-08-03 by BL-096's dead-rule deletion, which had been masking it | **Effort**: Small — one button | **Status**: Open

**As a** mobile visitor to the regulatory map, **I want** a single-pointer way to zoom back out **so that** I am not stranded in a region view unless I can perform a pinch gesture.

**What it is.** Below 1023px `.map-controls` (`#zoomIn` / `#zoomOut` / `#zoomReset`) is `display: none`, and the only zoom affordance is `.brutal-quick-zoom` — four **region presets** (AMR / EUR / APAC / MEA), not incremental controls. So once you are zoomed into a region, the only way back to the world view is **pinch**, which is multipoint.

**Why the framing matters.** "No incremental zoom on mobile" names the wrong defect and invites a `+`/`−` design that is not what is missing — the presets _are_ single-pointer zoom. The gap is specifically the **zoom-out / reset** direction. That makes it a candidate **WCAG 2.5.1 Pointer Gestures (AA)** failure rather than a UX nicety: 2.5.1 exempts user-agent gestures, but this is a d3 zoom behaviour on an SVG, i.e. author-implemented, so the exemption likely does not reach it.

**Remedy**: one more `.brutal-quick-zoom` with `data-region="world"` in the same `#mapQuickZoom` div, wired to the existing `REGION_VIEWS` lookup. Do **not** un-hide `.map-controls` — `regulatory-map-mobile.test.ts:89-95` pins its `display: none` and that is a feature change.

#### Acceptance Criteria

- [ ] A single-pointer control returns the map to the world view at mobile widths
- [ ] `regulatory-map-mobile.test.ts:77-87` (which asserts exactly 4 quick-zoom buttons) is updated deliberately, not incidentally
- [ ] The conformance question is settled either way in the commit body — defect closed, or exemption argued

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
  - **Not converted by operator ruling 2026-08-02**: `radar/FyiItem` nests its article `<a>` inside the `<details>` `<summary>`, which axe rates `nested-interactive` / serious. **Updated 2026-08-02 (later the same day)**: `/hub/radar` IS now in the axe route list, so the finding is live on a scanned route — though still invisible to CI, which binds no `MCP_KEY_WEBSITE_RADAR` and therefore renders no FYI items (reproduce with `npm run radar:stub`). Per this ruling it is handled in `accessibility.test.ts` by **excluding** `.fyi-item__header` — the documented instrument for "must not change", as opposed to a `KNOWN_SERIOUS` baseline, which is for debt that should decrease. Rendering the component on `/brand` would import the same finding. Probed behaviour is sound — the link is keyboard-reachable, Enter navigates without toggling, and the mouse case is handled by a `stopPropagation` — and no screen-reader harm was reproduced, so the operator ruled the component works as intended and is not to be changed. The specimen stays a replica
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
- **`.primary` / `.secondary` are inert everywhere.** `buttons.css` defines exactly one CTA appearance (`.cta-button`); the bare `primary` / `secondary` tokens seen in `class="cta-button primary"` match no rule in the repo. They were removed from the `/brand` specimens 2026-07-29 (and the CTA Buttons group collapsed from two identical specimens to one truthful `.cta-button`), and the 9 on the two hub gateway indexes went with BL-105 on 2026-08-03. **10 remain**, counted rather than estimated: `Hero.astro` (2), the three `hub/library/*` article pages, `hub/radar/`, three tool pages' back-links, and the IRL generator's submit button (`information-request-list-generator/index.astro:272`) — the one that is not a back-link. Stripping them is mechanical and behaviour-free; **defining** them is not — `.cta-button.secondary` would restyle every "Back to …" link at once and needs a design decision first. Bare unnamespaced globals are also a collision hazard: prefer `.brutal-btn--primary` / `--secondary` when a real two-variant pair is wanted.
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

### ~~BL-098: Radar negative caching — a failed revalidation is cached as a 200~~ — CLOSED 2026-08-02

**Status**: **Closed by removing the requirement**, not by implementing the acceptance criteria below. Recorded rather than pruned because the reasoning is the interesting part.

**What it was.** Inlining the Radar feed (`bbd96fbf`, 2026-07-31) moved the MCP fetch inside the ISR entry, so a failed revalidation cached the empty state as a `200` for up to 6h. The `server:defer` island it replaced did not have this problem — `@astrojs/vercel` routes `/_server-islands/*` to the uncached render function, so a failed fetch self-healed on the next request.

**Why it is closed.** The inlining was reverted. It had been done to make the page indexable, and it succeeded at that while buying nothing rankable: `/hub/radar` rotates wholly every 6h and has no per-item permalinks, so there is no durable document for an index to hold. The page is now `noindex` by classification ([ADR-0012](../adr/0012-rotating-feeds-are-noindex.md)), which makes deferring its primary content free — and the island brings the self-healing back with it. The defect required the fetch to live inside a cached entry; it no longer does.

The original acceptance criteria are moot, and the last one — _"`/hub/radar` still ships its feed in the initial HTML"_ — is now the **opposite** of the intended behaviour. `tests/e2e/radar-page.test.ts` asserts the island marker is present, not absent.

**What was NOT closed, and is worth knowing.** The island costs one Worker call per pageview instead of ~4–28/day. That call is cache-first against Upstash (6h TTL, cron-warmed), so it is normally two Redis reads rather than an Inoreader fetch — but there is no single-flight lock on the cache-miss path, so concurrent requests in the window between TTL expiry and cron re-warm each fall through to a real fetch. Bounded by `INTERNAL_TIER` (60/min, 1000/day), with the burst ceiling binding first. Accepted at current traffic; the numbers live in [RADAR.md § What a pageview costs](../hub/RADAR.md).

**If this reopens.** Only a change that puts the feed fetch back inside a cached entry can resurrect it. Before doing that for SEO reasons, read ADR-0012 — that path has been walked once already.

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

### BL-106: MCP Server — 2026-07-28 spec alignment ✅ CLOSED 2026-08-04

**Source**: gap analysis of the deployed server against MCP spec revision `2026-07-28` | **Shipped**: `@gst/mcp-server` 0.44.0 (PR #382), **partially reverted in 0.44.1** | **Outcome**: the server speaks `2026-07-28`; **both** transports serve the legacy era too | **Decisions**: [ADR-0013](../adr/0013-mcp-2026-07-28-modern-only-worker.md) | **Full analysis**: [`_archive/MCP_SERVER_SPEC_2026_07_28_ALIGNMENT_BL-106.md`](_archive/MCP_SERVER_SPEC_2026_07_28_ALIGNMENT_BL-106.md)

> ⚠️ **Post-merge incident, 2026-08-04.** The Worker shipped modern-only (`legacy: 'reject'`) and broke every Claude Desktop tool call within about an hour of the production deploy — Claude Desktop speaks `2025-11-25`, so its `initialize` was refused with `-32022`. It surfaced as "failed to call tool `list_portfolio_facets`" because the client still showed a cached tool list, so the symptom pointed at a tool rather than the handshake. Reverted in 0.44.1 (`legacy: 'stateless'`, both eras served).
>
> The evidence was right and the question was wrong: "no external clients" was verified, but what governs is _what protocol version the client software speaks_. This stanza's own decision to keep **stdio** on its legacy lane made exactly that argument, and it was not applied to the Worker — the team points Claude Desktop at the remote surface too. The `era` telemetry that would have shown this in one log line was an AC of this initiative that was silently dropped during implementation; it ships in 0.44.1. Full account: [ADR-0013](../adr/0013-mcp-2026-07-28-modern-only-worker.md) § Amendment 2026-08-04.

Retained rather than pruned — not because its findings lack a home (both are distilled into `ARCHITECTURE.md` and the code they describe), but because the unreproduced instance behind the [`CLAUDE.md`](../../../.claude/CLAUDE.md) flake rule is stanza-level evidence with no better home, and because BL-088 and BL-091 set the precedent for a closed stanza carrying forward what a `git log` excavation would bury.

**What shipped**: migration to `@modelcontextprotocol/server@2.0.0`; `Mcp-Method` / `Mcp-Name` through the CORS preflight; `ttlMs` / `cacheScope` published on library and regulation reads; `cors.ts` promoted to sole origin authority; production `npm audit` restored to zero (it was already failing on `master`).

**Verified in production 2026-08-04**: `/health` reports `0.44.0` at `gitSha ace6c7c`; the CORS preflight returns `204` allowing `Mcp-Method` / `Mcp-Name` with `Access-Control-Allow-Origin: https://claude.ai` and no wildcard. The authenticated modern round-trip was **not** exercised from here — it needs a bearer token — so that half rests on `tests/integration/protocol-era-worker.test.ts` plus any client session since the deploy.

**Two findings worth remembering** (both cost real time to discover, and neither was predicted by the analysis):

1. The SDK v2 handler runs its **own** Host/Origin gate. Left at its default the accepted set is the localhost trio, so on a custom domain every request carrying `Origin: https://claude.ai` gets a **403** — the exact browser clients the allowlist exists for, and a failure mode the legacy handler did not have. `tests/integration/protocol-era-worker.test.ts` guards it and is verified to fail without the fix.
2. `with-metrics.ts` located its notifier by duck-typing on a field v2 renamed, and the function is contractually non-throwing — so the rate-limit warning would have died **silently**, with the soft-limit tests staying green against their own fake. Both the production view and the fake are now bound to the SDK's `ServerContext` so a rename is a compile error.

**Standing caution**: an unreproduced single-test failure in the mcp suite (`1 failed | 1973 passed`, once, name never captured; seven other full runs green). It fits the documented workerd cold-start flake but that remains an explanation, not evidence. **If a red mcp run appears, capture the failing test name before rerunning** — a rerun destroys it.

**Deferred work extracted to [BL-107](#bl-107-mcp-server--tasks-extension-and-mrtr-candidate)** so it stays visible in the backlog rather than only inside a closed stanza. Declined outright: `x-mcp-header` mirroring; replacing the body-parse rate-limit dispatch with `Mcp-Name` (base64-sentinel values would let an encoded `search_radar` escape the radar tier); dropping the `agents` dependency. RFC 9207 `iss` closed — reasoning distilled into ADR-0013.

---

### BL-108: MCP Server — restore the serialized-JSON text block ✅ CLOSED 2026-08-04

**Source**: a live Claude Desktop session reporting `search_portfolio` "only returning match counts, not the project rows or the deeplink its schema promises" | **Shipped**: `@gst/mcp-server` 0.45.0 | **Decisions**: [ADR-0011](../adr/0011-tool-response-channel-policy.md) § Amendment 2026-08-04

**The defect**: since 0.43.0 (BL-090), `toolOk` put the payload in `structuredContent` and a one-line caption in `content`. **Claude Desktop reads `content`.** For three weeks it received `"11 portfolio matches."` with no rows, and `"15 themes, 2 engagement categories, 6 growth stages, 5 years."` with no values — the literal caption strings from `portfolio.ts:123,140`. The user reported a broken tool; the tool was working exactly as designed.

**Not a regression from the 0.44.x deploy**, which is where the investigation would naturally have started. The era axis was the leading alternative — Desktop speaks `2025-11-25` — and it was tested and cleared: `appendTextFallbackForNonObject` is era-agnostic and the rev2025 `{result:…}` wrap fires only for non-object `structuredContent`, so both eras are identity for our payloads. Claude Code, on the same build, returned all 11 rows. The difference was the client, not the transport.

**What shipped**: `content` is now `[caption, compact serialized JSON]`, per the spec's backwards-compatibility clause that ADR-0011 recorded itself as knowingly deviating from. Plus `toolOk`'s one exception, `textOmit`, used solely to keep a 17 KB base64 `.xlsx` (~4,500-6,000 tokens) out of the model channel.

**Wire cost, measured** — accepted by the operator on the basis that a 61 KB response the model cannot read is worth less than a 127 KB one it can:

| tool                        | before   | after     |       |
| --------------------------- | -------- | --------- | ----- |
| `search_portfolio` (all 65) | 61,529 B | 127,599 B | ×2.07 |
| `compose_dossier_envelope`  | 16,581 B | 33,290 B  | ×2.01 |
| `list_portfolio_facets`     | 597 B    | 1,105 B   | ×1.85 |

**The second defect, which cost the same session real calls**: the tool descriptions advertised theme values that **do not exist** — `"Healthcare Tech"` and `"Financial Services"` in `tools/portfolio.ts`, and `"Life Sciences"` in `schemas.ts:150`, the description shipped in `tools/list` and therefore the only portfolio vocabulary a cold LLM call can see. Desktop dutifully tried them and got zero matches, then "probed theme names by trial". The theme list and project count are now **derived from `projects.json`**, so the vocabulary cannot drift from the data again. The `gst_irl_ingestion` prompt carried the same two invented values inside a directive telling the model _not_ to guess at labels; corrected there by hand (interpolating into a prompt body would couple its committed hashes to the dataset, reddening CI on a routine portfolio edit).

**Findings worth remembering**:

1. **BL-090's evidence generalised from n=1 client.** The probe was real, correctly executed, and its conclusion true — of the one client it ran through. The AC demanded "evidence, not assumption" and was satisfied in form. A single client cannot establish a cross-client fact.
2. **The tripwire was set on the wrong event.** ADR-0011 predicted this failure mode precisely, then scoped it to "the moment a first external pilot connects". It needed no pilot: an internal client, on a modern revision, that renders the other channel. The same "no external clients" answer had already mis-scoped [BL-106](#bl-106-mcp-server--2026-07-28-spec-alignment--closed-2026-08-04) a day earlier — twice in two days, a contract question answered where a software question was asked.
3. **Nothing asserted the model-visible channel carried data.** A three-week outage sat under a fully green suite. `protocol-era-worker.test.ts` now pins `content.length === 2` and block-1/`structuredContent` agreement on a **legacy-era** call; `protocol-roundtrip.test.ts` enforces it for every tool it exercises.
4. **`generate_information_request_list_xlsx` is again the only channel-asymmetric tool** — the exact property that made it BL-090's probe target. Recorded in the ADR and at the call site: do not run the next which-channel probe there.

**Unblocked, not undertaken**: [BL-092](#bl-092-mcp-server--declare-outputschema-on-the-tool-surface-candidate)'s blocker is retired by SDK v2. It stays separate — it would not have fixed this bug, and it turns on Desktop behaviour still unverified.

**Verified in production 2026-08-05** — `/health` reports `0.45.0` at `gitSha 1c63043`, and a real Claude Desktop call returned all 11 Healthcare engagements with codenames, ARR, industries, engagement categories and the `deeplink`, against the "11 portfolio matches." it had been returning. It also resolved `theme=Healthcare` on the first attempt with no trial-and-error, which is the second defect closing.

This is the verification that mattered, and it is the one neither CI nor the author could perform: every one of the 1,986 tests, and the live stdio probe taken during implementation, runs through a client that reads `structuredContent` — i.e. a client that was never broken. The bug was only ever visible from the surface that reads `content`.

---

### BL-109: MCP Server — radar display bound + two payload defects ✅ CLOSED 2026-08-05

**Source**: the first structured client-acceptance probe, run from a second client (Claude Desktop "Cowork") after BL-108 shipped | **Shipped**: `@gst/mcp-server` 0.46.0 | **Decisions**: [ADR-0005](../adr/0005-hub-url-state-deeplink-contract.md) § Note 2026-08-05

The probe passed P1–P4 and P7 — confirming BL-108's channel fix on a **second** client — and surfaced three defects. **One was introduced by BL-108 and its risk was framed wrongly.**

**D1 — `search_radar` exceeded a client's tool-result ceiling.** 143,027 characters; the probe's harness spilled to a file and recovered, but a client without a filesystem fallback hard-fails. BL-108's risk note called the doubling _wire cost_ — bytes and audit `outputBytes`. The real failure mode is **crossing client tool-result ceilings, which makes the tool unusable**, the very class BL-108 existed to fix.

The fix is **not** what it first appeared to be. The initial plan re-added a `limit` input and argued it was a justified reversal of the capability-mirror invariant. That rested on a false premise: `/hub/radar` does **not** render all 61 items — it caps wire at `MAX_WIRE = 30` with a `MIN_PER_CATEGORY = 3` quota and FYI at `FYI_MAX_COUNT = 15`, so **≤45**. The tool applied no wire bound at all. **The mirror was already broken in the tool's favour; bounding it restores the mirror rather than reversing it** — no input change, no ADR reversal, and the two lockout tests that exist to keep `limit` out keep passing untouched.

Measured on a production-shaped corpus: 134,370 → 78,737 chars (**−41.4%**), of which the count bound is 25.7 points and stripping raw HTML out of `summary` is the rest. **The bound alone (99,834) would likely not have cleared the ceiling** — `summary` carried Inoreader's raw untruncated HTML on every item, where the page renders none for wire and stripped text for FYI. FYI is untouched, so every `gstTake` survives.

**D2 — the IRL download URL never reached the payload.** `generate_information_request_list_xlsx` built the Hub _generator_ URL with the caller's args pre-filled and used it **only in the caption string**; the payload carried `canonicalUrl`, the library _article_ page. A payload-reading client got the wrong URL for the tool's entire purpose. BL-108's defect class one layer down.

**D3 — `search_radar` advertised `search_radar_offline`**, which is stdio-only and absent from the remote surface.

**Findings worth remembering**

1. **A capability mirror has two halves.** "Does the tool accept only what the page offers?" was enforced; "does the tool return only what the page shows?" was not, and `radar/CONTRACT.md` documented the discrepancy _as the reason for a decision_ rather than catching it as a defect. A **shared implementation** is what makes the second half hold — two code paths agree only on the day they are written.
2. **The CI `paths` allowlist would have hidden the guard.** `test-mcp-server.yml` fires on an explicit allowlist of website files the Worker bundles. The new shared leaves were not on it, so a future PR editing only the bounder would have run **no** MCP tests — the guard silently absent on exactly the change it exists to catch, on a required check gating the staging deploy. `src/utils/radar-url.ts` had been missing since it was introduced; all three are now listed.
3. **Ordering is load-bearing in two places**, and only one is obvious: dedupe against FYI → bound **globally** → merge → apply the category filter. Bounding after the category filter returns up to `MAX_WIRE` items of one category where the page shows a handful — a bug invisible on the unfiltered call, i.e. on the first test anyone would write.
4. **`RadarFeed.astro`'s call site remains uncovered**, before and after. Astro components cannot be imported by vitest; the guards are `astro check`, the deletion of the inline block, and review. Stated rather than implied.

**Open, for the operator**: moved to **BL-113**. It sat here inside a closed stanza, and closed stanzas get pruned — so a live task was queued for silent deletion. Rescued by BL-112; the work itself is unchanged.

---

### BL-111: CI — three defects in the MCP deploy chain ✅ CLOSED 2026-08-05

**Source**: two consecutive production deploy failures, on unrelated commits | **Shipped**: CI only, no `@gst/mcp-server` version change (a commit count sat here and went stale twice under review — the branch is the scope)

**D1 — the production guard raced the test suite and lost.** It queried the API once, with no wait and no retry, and treated "not yet" as "never". Both workflows fire on the same push and start in the same second: `8f5a9112` failed 74 s before the suite went green, `b450ff9b` 78 s before. Masked for months because approving `mcp-production` usually takes longer than the ~2 min the suite needs; the operator now approves promptly, so it failed every time. Replaced with a bounded poll on an exact `head_sha` query, extracted to `scripts/await-mcp-test-run.sh`.

**D2 — the staging chain trusted fork-triggered runs (security).** `test-mcp-server.yml` fires on `pull_request` including from forks; `deploy-mcp-staging.yml` chained off it with `workflow_run`, which executes in the base repo with `CLOUDFLARE_API_TOKEN` and `SENTRY_AUTH_TOKEN` in scope, gated only on `conclusion == 'success'` and a `branches:` filter that matches the _fork's_ branch name. Two escalations beyond "deploys to staging": the deploy step runs `npm run deploy:staging` = `node scripts/deploy.mjs staging`, a fork-controlled file, in the step holding both tokens — arbitrary code _with_ the credentials, not just a deployed artifact, and unconditional; plus a narrower one, on a cache **miss** `npm ci` runs the fork's root lifecycle scripts and saves under the shared `nm-v1-…` key `test.yml` and `test-mcp-server.yml` restore (lockfile-hashed, so it bites on a changed `package.json` script, not a changed dependency); and staging binds no environment, so the Cloudflare token resolves at repository level — the same one production uses. Closed with `event == 'push'` plus a same-repository check.

**D3 — the deploy-failure notification had never fired, once.** `gh issue create --label` errors on a label that does not exist; `incident`, `mcp-prod-deploy`, `mcp-rollback` and `P1` were never created. The repo has one Issue (#96, 2026-04-19) despite repeated deploy failures, and run `30975740442` shows `failure` on the notifier step itself. Audit gap #10's remedy was inert from the day it shipped. `rollback-mcp.yml` — the _recovery_ path — was mute for the same reason.

**Findings worth remembering**

1. **"Approve and run workflows" on a fork PR silently approves a deploy.** The GitHub control cannot express "run the tests but do not deploy"; only the workflow's own `if` can. The approval-mode setting narrows _who reaches the button_ and lapses after a contributor's first merge — it was never the control.
2. **Three diagnoses of mine were wrong and were corrected by measurement, not argument.** The race mechanism (the run was absent from the query, not merely unconcluded — `'not-found'` comes from an empty-value default, whereas an in-progress run renders `null`); the timeout claim (a 5-min poll would "run at the ceiling" of a 10-min budget — the last successful deploy took **37 seconds**); and the label fix (dropping `--label` was strictly worse than the `--force` precedent already in `prettier-drift-check.yml`).
3. **The same predicate bug appeared four times in four different costumes** — `head -1` selecting a `cancelled` run ahead of a `success`; a loop exiting as soon as _any_ run completed; error-into-absence laundering at the cap; and a `count` surviving from an earlier attempt, so a since-dead API could report "no run ever appeared" — the one code whose operator action is `workflow_dispatch`. Each fix created the next. The repo has no shellcheck, so the script's only pre-merge guard is `tests/integration/await-mcp-test-run.test.ts`, which drives the real script against a stubbed `gh` and asserts exit **codes**, never message text. Mutating the loop predicate turns three of its cases red — checked, not assumed.
4. **A requirement outgrew its mechanism silently.** "Branch the incident guidance on the exit code" was unimplementable: the guard step has no `id:` and a failing `run:` exports nothing. It only became load-bearing when the guidance went from one paragraph to a branch per code. Resolved with a static decision table keyed on the code the runner already prints.
5. **D3's shape reappeared inside D3's own fix — a control documented as existing while being inert.** The stub matrix was described in this stanza as the script's pre-merge guard while living only in a scratch directory; code review caught it. And the label step, added to stop `gh issue create --label` erroring, was written inline above that command under `bash -e` — so a transient label failure aborted the step _before_ the Issue was attempted, muting the notification in exactly the case it exists to report. Both now degrade instead: label creation warns and continues, and a labeled `gh issue create` falls back to an unlabeled one. **Filing beats routing.** `prettier-drift-check.yml` — the precedent D3's fix was copied _from_ — carried the same defect in its two-step form and was fixed here too (Directive 6), along with its `gh issue list` lookup, where a transient failure aborts the step through a command substitution; it now degrades to filing a duplicate rather than to silence.
6. **I asserted a reason I had not executed, inside the fix for a defect about asserting things that were not true.** The `|| true` on that lookup was justified in a comment as "`gh issue list --label` errors on a missing label". It does not — gh 2.86.0 exits 0 with empty output, checked against this repo after review pushed back. The guard was right for a different reason (transient failure), so the code stayed and the comment changed. A plausible mechanism is not a verified one, and a wrong reason in a comment outlives the change it explains.
7. **The inventory could not see the secret, which is why nobody saw the secret.** `SECRETS_INVENTORY.md` declared its own scope as "Vercel, Cloudflare Workers, or Upstash" — so the CI/CD deploy credentials were inventoried **nowhere**, and a production-capable Cloudflare token sat at repository level, readable by every job in the repo, through every prior security pass. The document that exists to make secrets visible had a blind spot exactly the shape of the finding. Closed by adding a GitHub Actions store, rows in the at-a-glance matrix (the artifact people actually scan), source-of-truth entries, and a decommission row. **An audit is bounded by its stated scope, and the scope line is the part nobody re-reads.**
8. **A one-line deletion can silently reopen it, so it is now a test — and the first version of that test failed open three ways.** Removing an `environment:` key makes `secrets.*` resolve at repository scope with no warning, no annotation, and a deploy that keeps working; it reads as tidying in review. `tests/integration/workflow-secret-scope.test.ts` closes that. But as first written its hand parser ignored `.yaml` files, silently `continue`d past any workflow whose `jobs:` line was not byte-exact (`jobs: # comment` dropped the whole file), and checked environment names by reading only _quoted_ literals — so the two deploy jobs, which write the name bare, were never inspected and a typo'd `mcp-stagng` passed green. Review proved all three by dropping a rogue workflow holding an unbound deploy secret and watching the suite stay green — then found **two more in the fix**: the job-header regex had kept the same byte-exact shape, and its miss path was worse (`  rogue: # note` didn't match, so the rogue job's body was appended to the _preceding_ job and inherited its binding — invisible to the paired positive assertions, because the rogue never became a job); and the new workflow-level `env:` check sliced everything above `jobs:`, while YAML mapping keys are unordered, so a top-level `env:` written _below_ it stayed outside the parse window. A third round found two more: the `secrets: inherit` guard _added to close the second round_ shipped without a trailing-comment allowance — 177 lines below the docstring rule stating that trailing comments are legal everywhere, and 35 below the nearest in-code restatement — and the membership test read only `secrets.NAME`, so `secrets['NAME']`, valid expression syntax, hid an unbound job holding the production token. A fourth round found three more, including the `secrets[<expr>]` guard from round three scanning job bodies only and not the `outside` complement — the workflow-level blind spot recurring inside its own round's fix. **Ten fail-open paths across four rounds, in the guard whose whole purpose is stopping things from failing open.** The rules that finally held, each bought with a green mutation: never skip, throw; compute by complement, never by position; match every syntax the _platform_ accepts rather than the one this repo happens to use; assert absent what cannot be resolved (`secrets: inherit`, `secrets[<expr>]`) instead of assuming it away; and pair every negative assertion with a positive one — while knowing that pairing is **necessary, not sufficient**, since both the absorbed-job and index-form rogues satisfied it. Equivalence is now checked rather than argued: across all 12 workflows the hand parser and the real `yaml` parser agree exactly — 15 jobs, identical bindings, identical references.
9. **The same shape landed seven times, and every recurrence was born inside the previous fix.** A control that appears to exist and does not: the stub matrix documented as a pre-merge guard while living in a scratch directory; the label step that aborted before the notification it protected; the inventory whose scope line excluded the store holding the exposed credential; the test written _specifically to stop controls failing open_, which failed open three ways; the fix for that test, which failed open two more; and the fix for _that_, which shipped a new guard carrying the exact trailing-comment bug the same file's docstring had just named as a rule. Every one caught by review, none by the suite. And a seventh: **the recurrence did not stop when I named it** — a fourth round found three more fail-open paths, one of them the exact position-versus-complement shape this very sentence describes. Writing the rule down does not apply it — the sixth instance shipped **177 lines** below the docstring rule stating it, and 35 below the nearest in-code restatement (measured at `3c4d73e4`, not estimated; an earlier draft said "a dozen lines", a number nothing supported). What eventually worked was not vigilance but a **differential check**: running the hand parser against a real YAML parser across every workflow and diffing the results, which converts "I believe this is equivalent" into a fact and would have caught several of the ten immediately. _(This sentence said "seven **paths**" when there were ten, through a round that updated the count elsewhere in the same finding — finding 10's pattern, caught by review, in the paragraph describing the pattern. Note the header's "seven" is a different referent: seven **instances of the shape**, ten **fail-open paths**.)_ The transferable rule remains that **a guard must assert it found its subject** — "no violations" and "nothing examined" are the same green — with the sharpened caveat that this is _necessary but not sufficient_: content absorbed into a legitimate subject, or written in a syntax the guard doesn't match, satisfies it.
10. **A claim repeated in three places gets corrected in two.** "BL-037 Phase A will add `SENTRY_AUTH_TOKEN`" survived nine weeks past shipping in the at-a-glance row, the decommission row, and the § Sentry paragraph. Round one fixed the decommission row; round two fixed the at-a-glance row; round three found the paragraph. Nothing about the first two fixes surfaced the third — grep found the strings, but each copy was worded differently enough to read as a separate statement. **Correcting the copies you can see is the normal outcome, not the unlucky one**; the durable fix is one authoritative statement and pointers, which is what the § GitHub Actions section now is.
11. **Each fix to the cap's decision arm introduced the next defect, three times, and only the last shape was safe.** Aggregate flags let a stale `count` report "no run ever appeared" — exit 4, the one code that authorises `workflow_dispatch`. Replacing them with per-attempt state closed that and opened the mirror: a late API blip outranked a run already seen in flight, reporting exit 5 ("do not re-run, fix the credential") when re-running was the remedy. Remembering one fact across attempts — that a run was _seen_ — closed that, and left one arm still non-monotone: a live final `count == 0` could still erase an earlier sighting and reach exit 4. What finally settled it was not another case fix but an **invariant**: a remembered sighting can only ever route to 3, where being wrong costs a re-run, and exit 4 requires both a live observation _and_ no sighting anywhere in the window. State the invariant and the arms follow; patch the arms and the next asymmetry is already waiting.

**Operator actions — both taken during this PR, so the structural half of D2 shipped with it.** Fork-PR approval was switched to "all external contributors". And the `mcp-staging` GitHub Environment was created (no protection rules — required reviewers would defeat an unattended post-merge deploy) with all three secrets on it, so the staging deploy and the staging rollback now bind an environment instead of falling back to repository level. That closes the part the `if:` cannot: the `if:` governs which _runs_ may deploy and depends on one boolean staying correct; environment scoping governs which _jobs can read the credential at all_ and depends on nothing.

**Remaining operator step, deferred until a green staging deploy**: delete the repository-level `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `SENTRY_AUTH_TOKEN`. Until that happens this PR adds a second copy and closes nothing — the deletion is the whole point. (Keep `MCP_PROBE_KEY`; the latency probe legitimately needs it repo-level.) Recorded in [SECRETS_INVENTORY § Decommission schedule](../operations/SECRETS_INVENTORY.md) rather than only here, since this stanza is prunable and that table is the doc operators actually check.

**Why wait, precisely** — an earlier draft of this said the repo-level copies were a fallback, which is wrong in the obvious reading. Once a job binds an environment, the environment copy **shadows** the repository copy; the repo copy is inert, not a safety net, so deleting it cannot break a bound job. It is a fallback only in the compound case: a bad secret _value_ (invisible from outside — the API confirms a name exists, never that the token behind it is write-scoped) forces reverting the binding, and the repo copy is what the reverted workflow lands on. That is the scenario the wait protects, and it is worth one green deploy.

**What is _not_ achievable, checked rather than assumed**: a staging-only Cloudflare token. `Workers Scripts: Edit` is scoped per **account** with no per-script granularity, so the staging token can deploy the production Worker. Minting a _separate_ token for `mcp-staging` still buys independent revocation, and that is the whole of what it buys — the blast radius is unchanged.

**Noted, not built and not filed**: a scheduled `/health.gitSha` vs master-HEAD drift detector. It would catch silent production staleness from any cause — the class behind both D1 and the month-behind incident of 2026-06. Recorded here only; there is no issue or backlog entry for it, and this stanza is prunable, so it needs filing if it is wanted.

---

### BL-112: MCP Server — tool-response size is measured ✅ CLOSED 2026-08-06

**Source**: asked "what is the radar truncation?", which turned out to be the wrong question | **Shipped**: `@gst/mcp-server` 0.47.0, prompt `gst_irl_ingestion` 0.22.0

**The question behind it.** Two tools had shipped broken to real users while CI was green — BL-108 (counts, no rows) and BL-109 (143,027 characters, past a client's ceiling) — and **both were found by the operator in Claude Desktop**. Every test in the suite called a handler and inspected the return value; none asked the question that had actually broken twice: _can a client consume this?_

**What that blindness was hiding.** `gst_irl_ingestion` Step 3 instructed a single batched `search_regulations` call with a worked example of `limit: 50`. Measured: **~153,200 characters — 1.07× the response that had already exceeded a client's ceiling** — in a client-facing dossier workflow. `search_regulations`' own description called the full-corpus response one that "fits comfortably in context"; at its schema max it is ~355,700 characters. Both now state measured sizes. The corpus was also documented as 120 frameworks while being 123 — ~31 statements across 20 files, from the MCP tool description through the regulatory map page’s own JSON-LD. The plan said "ten sites"; the sweep found three times that.

**The guard**: `tool-response-budget.test.ts` measures every registered tool, enumerated from a live `tools/list` on the stdio surface (the Worker registers 15 of 17). A tool with no budget entry fails the suite.

**Findings worth remembering**

1. **The bound could not be derived, and that was the finding.** Two drafts centred on bounding `search_regulations` by the capability mirror, the way BL-109 bounded radar. The page renders one region at a time and the largest holds **10** frameworks — _below the existing default of 20_, so `.max(10).default(20)` is an incoherent contract. No client ceiling is documented either. The blocker was never that a tool is unbounded; it is that **nobody has a defensible number and the repo produced no data to get one**. So the work became the measurement.
2. **A budget set at the failing observation cannot prevent the failure.** 143,027 is the size that _broke_ a client; the true ceiling is unknown and strictly below it. Budgets are therefore policy — today's measurement plus headroom — and say so in the constants, or they become a number that looks like evidence and is an assumption.
3. **Per-item width, not absolute bytes, for data-scaling tools.** An absolute budget on `search_portfolio` reddens after ~13 routine portfolio additions on a data-only PR, and its natural fix ("bump the number") ratifies whatever happened — TEST_BEST_PRACTICES §6. Width is flat under growth and moves only on shape, and it is what BL-109's defect actually was.
4. **The guard did not catch the defect it was built for, on the first try.** Reverting BL-109's `stripHtml` left it green: the fixture wrapped clean prose in one `<p>`, so stripping was nearly free. That is the "fixture too small to see the bug" failure BL-109's own test header records — reproduced inside the guard written to prevent it, and found only by running the mutation rather than trusting the design. With production markup density the same mutation takes `search_radar` from 114,815 B to 258,505 B and reddens all four radar budgets. **A guard is a hypothesis until a mutation kills it.**
5. **ADR-0011's `127,599 B` was characters.** Measured: 127,709 bytes, 127,599 chars. The chars/bytes conflation recurred four times while planning this, including in a paragraph claiming to have just corrected it. Left in place in the ADR with a note, because the mislabelling is the more useful record.

**Open items moved out, not held here.** This stanza is closed and closed stanzas get pruned — which is exactly how BL-109 orphaned its operator probe. Keeping BL-109's loop _inside_ another closed stanza would have rebuilt that trap one stanza down. So the live work is filed as **BL-113** (candidate) and the standing decisions are recorded where they belong: bounding `search_regulations` in [ADR-0011's 2026-08-06 note](../adr/0011-tool-response-channel-policy.md) and this tool's [CONTRACT.md](../../../mcp-server/src/docs/tools/regulatory-map/CONTRACT.md); bounding `search_portfolio` under ADR-0005, with the guard making its growth visible. BL-110 remains a live coupling: it would change what `jurisdiction: "eu"` resolves to and therefore every number recorded here.

---

### BL-113: MCP Server — settle the client tool-result ceiling (candidate)

**Source**: BL-109's acceptance probe, orphaned inside its closed stanza and rescued by BL-112 | **Effort**: small (one probe run) | **Status**: Candidate · deferred with triggers · **lower bound raised 2026-08-06** — see the run record below

⏸️ **Do not pick this up because it is "unblocked".** It needs a specific client and a specific person, not an available afternoon.

**The task**: rerun the acceptance probe's **P5 and P7**. P7 is only settled by **a client that previously hit its ceiling** — it re-runs `search_radar` and reports whether the result still writes to a file instead of inlining (the observable recorded at BL-109's D1). The probe's acceptance criteria are **held by the operator and were deliberately not committed to this repo**, so ask rather than hunt for them.

**Run record — 2026-08-06T15:04Z, against 0.47.0.** Client: **Claude Desktop "Cowork"** — per the operator's probe header, which this stanza notes is deliberately uncommitted, so the identity is attested rather than reproducible from this repo. That is the same harness that produced BL-109's D1 spill-to-file, so P7's precondition ("a client that previously hit its ceiling") is met **on identity**. It is _not_ established on **invariance**: a ceiling is a property of the client build and its context configuration, both unrecorded and unversioned, so this assumes Cowork's ceiling is unchanged since 2026-08-05. The client side has the same `NOT VISIBLE` problem as the backend below — and unlike the backend, no artifact in this record can ever close it. Both target probes passed. **P5** returned the xlsx envelope (13,059 B, 10 sections / 67 bullets). **P7** returned 32 items — `degraded: false`, `wireCacheHit: true` — with no spill to a file. The same run re-raised the citation criterion as a FAIL; that is recorded in [BL-110](#bl-110-mcp-server--jurisdiction-filter-granularity-candidate), not here, so this record is not a clean sweep.

The run landed **~3 minutes after the production deploy finished** (deploy run `31113193707` completed 15:00:42Z; staging landed 14:57:26Z, both carrying `7e5d4268`), so the probe's own `environment: NOT VISIBLE` caveat does not weaken it: either backend was 0.47.0.

**What it settles, and what it does not.** 32 items is **not** the worst case — `MAX_WIRE = 30` plus `FYI_MAX_COUNT = 15` allows 45, and only 2 FYI items cleared the freshness gate that day. That gap is a scheduling accident, not headroom by design.

**The byte figure is derived, and cannot be firmed up from this run.** The probe reported item counts, `degraded` and `wireCacheHit` — **never a byte size**. Applying BL-112's measured per-item widths to this run's 30-wire/2-FYI mix, it carried roughly **80,000 B** against a **114,815 B** worst case.

Two derivations bracket that, and the spread between them is a difference of **method**, not of envelope overhead (which is second-order here):

| method             | arithmetic           | result    |
| ------------------ | -------------------- | --------- |
| blended per-item   | 32 × 2,551           | ~81,600 B |
| decomposed by tier | 114,815 − 13 × 2,681 | ~80,000 B |

**Take 80,000 as the floor — a lower bound must round down.** Two traps for whoever redoes this arithmetic: **2,551 B is the _blended_ average across both tiers** (`114,815 / 45`, which is what BL-112 measured), _not_ the wire width — the implied wire tier is ~2,487 B and is measured nowhere, so reusing 2,551 as a wire figure overstates a 30-item response by ~1,900 B. And **2,681 B is measured on `get_latest_insights`' own envelope**, so it carries that tool's fixed overhead and slightly over-subtracts here — which pushes the floor down, the safe direction.

So the ceiling is now bounded below at **~80,000 B — derived, not measured** — the first evidence that post-`stripHtml` radar is consumable end-to-end on the client that previously failed, and enough to retire BL-109's specific failure. It is **not** evidence that the full 45-item response clears. **Remaining work: one P7 run on a day the FYI tier fills.** Until then every budget in `tool-response-budget.test.ts` stays policy, and the two bounding decisions below stay open.

**Why it still matters after BL-112.** BL-112 measured every tool, but a measurement is not a limit: **no client ceiling is documented anywhere in this repo**. The one empirical datum — 143,027 characters — is an observation _of a failure_, so the true ceiling is unknown and strictly below it. Every budget shipped in `tool-response-budget.test.ts` is therefore policy. This probe is the only thing that could turn "a client's ceiling" into a number, and two open bounding decisions wait on it: `search_regulations` (355,728 B at its schema max, ~2.5× the failing observation) and `search_portfolio` (127,709 B and unbounded by ADR-0005).

**Also open, related**: `search_radar_cache` is documented as "removed in mcp-server@0.2.0" and is still registered at 0.47.0 — a deprecated alias that BL-112 had to budget precisely because the coverage rule keys on what is registered rather than on what ought to exist.

---

### BL-110: MCP Server — `jurisdiction` filter granularity (candidate)

**Source**: BL-109 client-acceptance probe | **Effort**: small | **Status**: Candidate · **operator action: amend the probe's citation criterion** (see the recurrence note below)

**As an** analyst asking for "EU data-privacy frameworks", **I want** member-state law surfaced alongside EU-level instruments **so that** a jurisdiction query does not silently omit the national implementations that actually bind the target.

**What**: `search_regulations` with `jurisdiction: "eu"` + `category: "data-privacy"` returns `totalMatched: 1` — GDPR alone — against 70 data-privacy records. Regulation records carry ISO region codes (`['DEU']`, `['GBR']`, …), so `eu` plausibly resolves to EU-_level_ instruments only and correctly excludes Germany's BDSG and friends. That may be exactly right as semantics and still wrong as ergonomics.

**Investigate first**: read the jurisdiction→region mapping before changing anything; the answer may be a description fix rather than a filter change.

**Recorded from the same probe**: the probe's own acceptance criterion demanded article-number citations from `search_regulations`. `Article`/`Art.` appears **0 times** across all 123 regulation records — the data has never carried them. The server was correct and the criterion was invented; do not re-derive it as a defect.

**It recurred on 2026-08-06** — in the run recorded at [BL-113](#bl-113-mcp-server--settle-the-client-tool-result-ceiling-candidate), the same criterion failed the same probe again, and the finding was re-derived from scratch by an agent that had this stanza available. Re-deriving it costs a corpus grep every run and reliably produces a FAIL against a bar the tool never claimed: the shipped description enumerates exactly `scope`, `keyRequirements`, and `penalties`, and advertises no citation field. **The durable fix is to amend the probe's criteria, which are held by the operator** — not to author citations into 123 records. Authoring them is a sourcing project, not a code change, and a model-generated article number is worse than a blank one: a blank invites verification, a wrong citation suppresses it. Do not open that project on the strength of a probe criterion alone; it needs a client asking for it.

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

**Spec revision `2026-07-28` does NOT move this** — recorded here so it is not re-derived. SEP-2106 loosens the permitted `inputSchema` / `outputSchema` keywords, which reads like an unblock but is orthogonal: the blocker below is a _validation-trigger_ problem (the client validates whenever `structuredContent` is present, with no `isError` guard), not a keyword-strictness one. Established under [BL-106](#bl-106-mcp-server--2026-07-28-spec-alignment--closed-2026-08-04).

**~~Blocked-by constraint~~ — RETIRED 2026-08-04 (BL-108).** The blocker read: the SDK client validates `structuredContent` **whenever present, with no `isError` guard** (v1 `client/index.js`, contradicting its own adjacent comment), so with ADR-0011 Invariant 1 putting `structuredContent` on error results, declaring an `outputSchema` would throw `McpError` client-side on every failure.

**SDK v2 fixed it.** `@modelcontextprotocol/client` now guards _both_ branches with `&& !result.isError` (`dist/index.cjs:4155-4156` — the missing-structured throw and the validation call), and the server mirrors it (`if (result.isError) return` in `validateToolOutput`). Error results are simply not validated against `outputSchema`. No workaround, no success-shape scoping, no `suppressStructured` is required. Verified against the installed 2.0.0 packages while diagnosing BL-108.

**New constraint inherited from BL-108 — keep output schemas OBJECT-ROOTED, and beware unions.** The rev2025 codec wraps `structuredContent` as `{ result: … }` when the advertised `outputSchema`'s root `type` is not `"object"` — the predicate is literally `json["type"] !== "object"`, so it fires on a root that omits `type` at all, not just on arrays and primitives. Measured against the installed Zod: `z.object` → `type:"object"` (safe); **`z.union` → `anyOf` root and `z.discriminatedUnion` → `oneOf` root, both typeless, both wrap**; `z.array` wraps. A discriminated union of result shapes is the natural thing to reach for when authoring 16 output schemas, and it is exactly what would make `structuredContent` **era-sensitive on the 2025 wire** — the era Claude Desktop speaks. This arm is dormant today only because nothing declares an `outputSchema`, which is precisely why BL-108's era analysis came out identity. See [ADR-0011](../adr/0011-tool-response-channel-policy.md).

**Weigh honestly before building**: 16 hand-authored Zod output schemas can drift from the handlers that build the payloads, which is _more_ cognitive load unless derived — and TypeScript types do not survive to runtime. The win is client-side validation, not model comprehension. Deferred from BL-090 for exactly this reason.

**Acceptance criteria**

- [ ] Error-result interaction resolved and tested against a real client round-trip before any schema ships
- [ ] Schemas derived or generated where possible, not hand-maintained in parallel with the handlers
- [ ] `contract-parity` coverage so a schema and its CONTRACT.md cannot drift

---

### BL-107: MCP Server — Tasks extension and MRTR (candidate)

**Source**: extracted from [BL-106](#bl-106-mcp-server--2026-07-28-spec-alignment--closed-2026-08-04) on its closure (2026-08-04) so the deferral stays discoverable in the backlog rather than surviving only inside a closed stanza and [ADR-0013](../adr/0013-mcp-2026-07-28-modern-only-worker.md) | **Effort**: unscoped — size it when a trigger fires | **Status**: Candidate · deferred with triggers | **Depends on**: BL-106 (shipped — the server speaks `2026-07-28`, which is what makes either of these available)

**As a** consumer running a long GST workflow, **I want** long-running tools to report progress instead of blocking, and tools to ask a clarifying question mid-call **so that** a dossier build neither times out silently nor fails on an input the server could simply have asked for.

> ⏸️ **DEFERRED — do not pick this up because it is "unblocked".** Both are real fits with no consuming client, which is the test [BL-093](#bl-093-mcp-server--commercialization-phase-4) was deferred on (2026-08-02) and the same test BL-106 applied per-slice. Being newly _possible_ is not a reason; a consumer is.

#### Acceptance Criteria

- [ ] **Tasks extension** (`io.modelcontextprotocol/tasks`) — poll-based `tasks/get` + `tasks/update`, fitting the long-running `compose_dossier_envelope` and `generate_information_request_list_xlsx` paths. **Triggers**: a client hits a timeout on a long-running tool, or a design partner appears
- [ ] **MRTR** (Multi Round-Trip Requests) — server returns `InputRequiredResult`, client retries with `inputResponses`; would let a diligence tool ask for a missing input mid-call instead of failing. **Triggers**: as above

#### Technical Context

- **Reversibility note carried from BL-106**: if Tasks activates, long-running Workers jobs want Durable Objects or Workflows — which is `agents`' actual competence. That is the trigger to reconsider ADR-0013 decision 4 (keeping `agents` as a thin adapter rather than dropping it)
- **Not blocked by anything technical.** The server is on `@modelcontextprotocol/server@2.0.0` and both features are available today; the only thing missing is someone to use them
- Full spec-delta analysis, including why these two were the only deltas worth deferring rather than declining outright: [`_archive/MCP_SERVER_SPEC_2026_07_28_ALIGNMENT_BL-106.md`](_archive/MCP_SERVER_SPEC_2026_07_28_ALIGNMENT_BL-106.md)

---
