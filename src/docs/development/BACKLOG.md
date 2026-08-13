# Development Backlog

Consolidated backlog of open development initiatives for the GST website. Each item is a self-contained user story with enough context to design and implement a solution. Items are grouped by theme, not priority — triage happens separately.

> **Completed and closed items** are removed from this file once done — recover any stanza's full acceptance criteria and technical context via `git log -- src/docs/development/BACKLOG.md`, or consult the per-initiative design docs in [`_archive/`](_archive/README.md) (they are no longer kept in this directory — see the [initiative-doc lifecycle](README.md)). Three cleanup waves so far:
>
> - **April 2026**: 30 items (BL-002, 003, 008–019, 021–026, 027–030, and the _original_ BL-036–041 — those six IDs were later reused for new MCP-server initiatives, themselves now shipped and removed).
> - **2026-07-15**: 55 stanzas completed May–July 2026 (BL-005; BL-031 + the BL-031.x series; BL-032 + the BL-032.x series; the reused BL-036–045; BL-047; BL-049; and the BL-051–086 range as filed — not every ID in that range was used). Last pre-prune revision: `996b6b4c`.
> - **2026-08-09**: 9 stanzas closed 2026-07-17 → 08-06 (BL-088, BL-089, BL-091, BL-096, BL-103, BL-108, BL-109, BL-111, BL-112). Last pre-prune revision: `0f7bbec2`. Three of them carried live content that did not go with the parent: BL-091's deliberately-cut half-open recovery probe became **[BL-115](#bl-115-mcp-server--safe-half-open-recovery-probe-candidate)**, BL-111's unbuilt-and-unfiled deploy-drift detector became **[BL-117](#bl-117-mcp-server--deploy-drift-detector-candidate)**, and BL-089's deferred docs-freshness check became **[BL-118](#bl-118-docs-last-updated-freshness-check-candidate)**. A fourth piece of live content — BL-111's repo-level secret decommission — needed no rescue, already being a Pending row in [SECRETS_INVENTORY § Decommission schedule](../operations/SECRETS_INVENTORY.md). A stanza marked closed is not automatically prunable — read it for live sub-blocks first, and note that all four were found by sweeping for the pattern rather than one per review round.
>
> **Three closed stanzas are deliberately retained, and no other closed stanza should survive a sweep** — the list is exhaustive on purpose, so an omission reads as a decision rather than an oversight:
>
> - **BL-034** (MCP-server doc-cleanup catch-all, substantially complete 2026-07-02) — a slim stub that remains the append-target for BL-033-era cleanup items.
> - **BL-098** (radar negative caching) — closed by removing the requirement rather than implementing it; its own closure note says the reasoning is the point.
> - **BL-106** (2026-07-28 spec alignment) — retained by its own in-stanza decision, because the unreproduced flake instance behind the CLAUDE.md testing rule is stanza-level evidence with no better home. [`.claude/CLAUDE.md`](../../../.claude/CLAUDE.md) and [TROUBLESHOOTING.md](../testing/TROUBLESHOOTING.md) both still cite it as open. **This wave deleted it in error and restored it** — the ID list above is the corrected one.

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

### BL-102: Regulatory map — how is the map exposed to assistive tech?

**Source**: surfaced 2026-08-03 the moment `/hub/tools/regulatory-map/` joined the axe sweep (BL-096 AC3) | **Effort**: Small to change, gated on one design call | **Status**: Open — needs the ruling first

**As a** screen-reader user of the regulatory map, **I want** the map to expose either its countries or itself, unambiguously **so that** I am not handed 110 labels that may or may not be announced.

**Two findings, one question.** Both are `serious`, both are excluded (not baselined) in `accessibility.test.ts` with a pointer here:

- **`aria-prohibited-attr`, 110 nodes.** Every `.country-path` carries **both** `role="presentation"` and `aria-label="<country>"`. A global ARIA attribute suppresses the presentation role, so it is genuinely ambiguous whether 110 country names are announced or silent — the markup asks for both.
- **`nested-interactive`, 1 node.** `#mapSvg` is `role="img"` — "treat this as a single image" — while holding focusable descendants.

**The call to make**: is the map a single image with a text alternative (drop the per-path `aria-label`s, keep the SVG's `role="img"`, and rely on the search + compliance panel for country access), or a navigable structure (drop `role="presentation"`, give the paths real roles, and accept 110 nodes in the a11y tree)? Both are defensible; they produce opposite experiences, and neither should be picked inside a route addition.

**Why excluded rather than baselined**: the 110 tracks the number of country paths in the topojson, so a baseline would be a data-derived number that breaks the day the map data changes — the fixture-count trap: a pinned count that mirrors data (not behaviour) fails on every data refresh, which nearly shipped on the radar feed under BL-095.

#### Acceptance Criteria

- [ ] A ruling on which model the map presents, recorded here
- [ ] `aria-prohibited-attr` and `nested-interactive` are zero on the route with `#mapSvg` back in scope
- [ ] The `#mapSvg` exclusion is removed from `accessibility.test.ts`, not merely lowered

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

### BL-114: Strip the 10 inert `.primary` / `.secondary` class tokens

**Source**: relocated from BL-095's technical context when that initiative closed (2026-08-08) — the record predates the closeout and remains a real obligation | **Effort**: Small (the strip); the _define_ path needs a design decision first | **Status**: **CLOSED 2026-08-09** — stripped, not defined

**As a** developer reading page markup, **I want** every class on an element to do something **so that** markup doesn't teach phantom variants.

#### Acceptance Criteria

- [x] The 10 remaining bare `primary` / `secondary` tokens are stripped (or deliberately defined — see below). Counted rather than estimated, as of 2026-08-08: `Hero.astro` (2), the three `hub/library/*` article pages, `hub/radar/`, three tool pages' back-links, and the IRL generator's submit button (`information-request-list-generator/index.astro:272`) — the one that is not a back-link. **Done 2026-08-09**: the inventory was exact — all 10 found where predicted, stripped, none defined.
  - **An 11th was found and fixed, outside the count**: [STYLES_REMEDIATION_ROADMAP.md § 7](../styles/STYLES_REMEDIATION_ROADMAP.md) carried `class="cta-button secondary"` inside a **prescriptive** template for future tool pages. The stanza only ever counted rendered markup, but a doc that tells the next author to write the phantom variant is the same defect one step upstream — and it would have regrown the count.
  - **Verified inert before deleting, not assumed**: no rule in `src/styles/**` or any Astro scoped `<style>` selects `.primary` / `.secondary`, and nothing in `tests/` selects them (the one hit is prose in a `brand-page.test.ts` docblock describing this exact debt). So the strip is provably a no-op on rendered appearance.
  - **Not built**: a repo-wide every-class-has-a-rule guard — filed as [BL-116](#bl-116-site-wide-orphan-class-guard) rather than left in this stanza, which is on a prune path.
  - **A caption on `/brand` had to move with the markup.** `BrandComponents.astro`'s `.cta-button` code label read "the `primary` / `secondary` words **seen in page markup** are inert" — true when written, false the moment the last occurrence went. `/brand` is the in-repo control surface, so a caption keeping the phantom names alive in the present tense is the same defect the roadmap fix addressed, one step upstream. Reworded to the past tense.

#### Technical Context

- `buttons.css` defines exactly one CTA appearance (`.cta-button`); the bare `primary` / `secondary` tokens seen in `class="cta-button primary"` match no rule in the repo. The `/brand` specimens shed theirs 2026-07-29, and the 9 on the two hub gateway indexes went 2026-08-03.
- **Stripping is mechanical and behaviour-free; _defining_ them is not** — `.cta-button.secondary` would restyle every "Back to …" link at once and needs a design decision first. Bare unnamespaced globals are also a collision hazard: prefer `.brutal-btn--primary` / `--secondary` when a real two-variant pair is wanted.

---

### BL-116: Site-wide orphan-class guard

**Source**: split out of [BL-114](#bl-114-strip-the-10-inert-primary--secondary-class-tokens) on its closure 2026-08-09 — the observation was written inside a stanza already marked CLOSED, where the next prune wave would have deleted it | **Effort**: Small-Medium — the guard is a port; the per-route JS-hook allowlist is the work | **Status**: Open

**As a** developer reading page markup anywhere on the site, **I want** a class with no rule behind it to fail CI **so that** phantom variants are caught when written rather than by a live DOM audit three months later.

**Why it is filed rather than done.** The same defect has now been found and hand-fixed **three times**: 28 orphan classes on `/brand` (2026-07-29, which also surfaced a live TechPar defect from the identical cause), the 9 on the two hub gateway indexes (BL-105, 2026-08-03), and BL-114's 10 across 8 page files plus a prescriptive doc template (2026-08-09). A defect class that recurs on that cadence is a guard's job, not an audit's.

**Prior art to port, not re-derive**: `tests/e2e/brand-page.test.ts`'s "No orphan classes" check already does this for `/brand`, with an `ALLOWED_UNSTYLED` list for classes that are genuinely JS hooks. Adding to that list is deliberately an explicit act.

#### Acceptance Criteria

- [ ] Every class in the rendered DOM of each scanned route has a CSS rule behind it, or sits in a per-route allowlist with a stated reason
- [ ] The allowlist follows `ALLOWED_UNSTYLED`'s posture — a JS-hook declaration, not a place to silence findings — and a stale entry fails the suite, per the `FLOOR_EXCEPTIONS` precedent from BL-096
- [ ] Route coverage is stated, and whatever is excluded says why

#### Technical Context

- **Carry forward the existing guard's documented precision limit**: it counts a class as defined if the name appears in any selector anywhere, including as a descendant qualifier. A site-wide version inherits that, so it will not catch a class defined only under a parent it never actually sits inside.
- Scope question to settle first: reuse the 22-route axe list from BL-096, or scan a narrower set. The 22 routes are already paid for as a Playwright fixture.
- **Count files, then count routes — they diverge.** BL-114's 10 tokens sat in 8 files, but one was `Hero.astro`, a shared component rendering on five routes (`index`, `about`, `services`, `404`, `500`). A file-count reading of that recurrence understates the reach, and this guard is scoped by route, not by file.

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

### ~~BL-121: The server-authoritative tool-call counter could not survive the Worker~~ — CLOSED 2026-08-12

**Status**: **Closed in the session that opened it** (prompt `0.22.4` / server `0.49.3`, [ADR-0016](../adr/0016-run-scoped-durable-tool-call-counters.md)). Recorded rather than pruned because the failure mode is a repeat and the fix carries an accepted residual.

**What it was.** BL-071 made the server authoritative for tool-call counts so the `BL-045-VERIFY` block would stop depending on the model's memory of its own behaviour, and pinned the operator check `precheck.iterations === serverToolCallCounts.validate_irl_provenance.succeeded`. That identity holds on stdio. **On the remote Worker it cannot**: `createServer` runs per HTTP request, so a fresh `InMemoryToolCallCounters` is built for every call and the envelope's snapshot can only ever contain the request it is inside.

Surfaced by a production run (Kestrel IRL, 2026-08-12): the envelope reported `validate_irl_provenance` as all-`null` while the model honestly reported `precheck.iterations: 2`. The model was right to refuse to invent the numbers — which left the field as a model assertion, the exact thing BL-071 existed to eliminate, on the transport the team actually uses.

**Three compounding failures, one class — a stdio-shaped claim written as universal.** The prompt asserted the identity holds, with a reason (registered exactly once, so nothing double-counts) that is true and irrelevant to why it fails. It told operators to fail runs on drift against a check that could not pass. And `bl-071-precheck-derivation.test.ts` claimed to prove it while **sharing one counter map across handlers** — a correct stdio test read as universal. The stand-in reproduced the assumption instead of the topology, which is why production found this and the suite did not. The same file had already learned the lesson for BL-076, whose body cache moved to Upstash _because_ isolates rotate between requests; the counters were left behind.

**What shipped.** Durable per-run counters in Upstash (`mcp:irl-run-counts:<irlBodyHash>`, 4 h TTL, `HINCRBY` at wrapper exit, `retry: false`, fail-quiet), a `countersScope` field on the envelope output (`session` / `run` / `request`) so every regime that cannot support the identity says so, and a prompt (`0.22.4`) that states each identity conditionally, pins the transport-classed `errorsEncountered` labels to a closed subset, and enumerates the three causes of a short count. The Worker-topology tests drive **two `createServer` calls sharing one durable store** — hand-building two metrics contexts would have re-encoded the blind spot that hid the bug.

**Accepted residual**: a write lost mid-run in an _earlier_ request under-reports while scope still reads `run` — a **false red** an operator investigates and traces to a brownout. Narrow, now that a failed read downgrades to `request`, and the correct direction to fail. A false green never is.

**Verification still owed to a human**: re-run the Kestrel IRL through Claude Desktop against production after deploy and confirm the VERIFY block carries `countersScope: run` with `validate_irl_provenance` matching `precheck.iterations`. Every automated test here runs against a fake Redis and a _simulated_ per-request topology — a simulation standing in for the real transport is what hid this in the first place.

---

### ~~BL-120: The canonical IRL body discarded 45% of the workbook~~ — CLOSED 2026-08-12

**Status**: **Closed in the session that opened it** (prompt `0.22.3` / server `0.49.2`). Recorded rather than pruned because the failure mode generalizes and the fix carries two accepted residuals.

**What it was.** `npm run irl:extract` — the operator path the runbook recommends for client-facing and regulatory deliverables — read four of the workbook's seven columns (A/B/C/G) and discarded **D File Location**, **E Comments** and **F Notes** as "partner-supplied side channels". Measured against a real filled workbook: **26,221 of 57,992 authored characters (45.2%) dropped**; 73 of 134 rows carried Comments, 60 carried File Location, 58 carried Notes; **18 rows had a Status claiming an answer with an empty Response, and in 17 the answer was sitting in a discarded column**. One `[CLOSED]` row's Comments read "B2B SaaS (retail workforce management + retail execution platform)" — the answer. The dossier told the recipient they had never answered it.

The cause was a workflow the tooling never learned: GST pre-populates research into Comments, sources into File Location and caveats into Notes; the recipient confirms by setting Status. Nothing — extractor, prompt, or the workbook's own Instructions sheet — described that.

**Second defect, found while fixing the first.** `irl-ingestion.ts` carried **no xlsx-reading guidance at all**, so the model-reconstruction path and the extractor agreed only by coincidence. The extractor's comment claiming its omission matched "the shape the model uses in reconstruction" was never verified and was false.

**What shipped.** The canonical bullet became `- <ref> <request> [<STATUS>] — <answer> (Source: <D>) (Note: <F>)`, where `<answer>` is Response and Comments joined into one contiguous **unlabelled** span; Source/Note stay outside the answer slot so a filename can never make a row read as answered. The prompt gained a workbook column contract in every served body (interactive included), the fill-ratio counting order, substantive-answer wording on inclusion gates 2/4/6, and a citation-hygiene rule. `generate-xlsx.ts` now tells recipients D/E/F are published and routes non-answers to Notes. Rationale, rejected alternatives and both residuals: [ADR-0015](../adr/0015-irl-canonical-body-reads-full-workbook.md).

**The generalizable lesson.** Both defects, and the BL-119 alias defect before them, were **a docstring asserting a fact nobody had executed**. "The same shape the model uses in reconstruction" and "aliases are consumed by `findMatchedHubFramework`" were each written in good faith, each wrong, and each load-bearing for a later decision that trusted them. A comment that claims what another system does is a claim, not documentation.

**What is NOT closed.** Two residuals are accepted and documented rather than fixed — a citation matching only inside a `(Source: …)` span verifies and raises no gap; and workbooks filled before this change legitimately mix research with caveats in Comments (recoverable from the xlsx, and the extractor enumerates the affected refs). Reopen only on the triggers listed in ADR-0015.

---

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
>
> ⏸️ **Pipeline DEACTIVATED 2026-08-08 ([ADR-0014](../adr/0014-deactivate-audit-pipeline.md))** — no consuming client, and the `seqof` ledger was the sole unbounded Upstash key family. Config-only unbind; code, tests, queues, R2 history, and chain-tip keys retained. **Re-enable trigger: the first client whose contract requires compliance audit capture** (config revert + AUDIT_LOG.md § Re-enable, before kickoff). The shipped ✅/🟡 dispositions below describe the retained capability, not live capture.

- [~] Every tool invocation written to an append-only audit log with: ISO-8601 timestamp, `client_id`, IP-prefix (truncated for GDPR — last octet zeroed), tool name, request UUID, **input parameters (full)**, **output payload size in bytes** (not the payload itself by default), durationMs, success/error code — 🟡 **best-effort, not fully met**: the record shape + every field ship (`client_id` = the PII-free `keyOwner`; gated to `tool_invocation` this slice), but "**every** invocation written" is best-effort at the enqueue hop (documented first-hop loss window; the fail-closed `writeAndAwait` seam is the recorded revisit trigger for a client that contracts guaranteed capture — ADR-0009). **Capture deactivated 2026-08-08 (ADR-0014)**
- [ ] Optional `?audit_full_payload=true` per-client flag to retain full output payloads for clients whose compliance regime requires it (must be agreed in writing — flag flips a Redis setting) — **deferred** (pairs with the fail-closed per-client posture)
- [x] Logs shipped to a tamper-evident store: append-only S3 bucket with object lock, OR Cloudflare R2 with versioning + immutability — never to the same Sentry/Cloudflare logs used for ops — ✅ Cloudflare R2, one immutable hash-chained object per entry, on a SEPARATE path from AE/Sentry/CF logs (full input params never reach the ops sinks). **Capture deactivated 2026-08-08 (ADR-0014); R2 history + buckets retained**
- [x] Retention: minimum 7 years to satisfy SEC Rule 17a-4 (the typical PE compliance baseline); confirm exact requirement with each client in pilot agreement — ✅ **as an operator dashboard step** (R2 **Bucket Lock** rule — Cloudflare's object-lock — at 7-yr retention, documented in AUDIT_LOG.md — a bucket config, not code); confirm the exact figure per pilot contract. **Bucket Lock + existing records unaffected by the ADR-0014 deactivation**
- [ ] Per-client log export available via signed URL (read-only) so clients can ingest into their own SIEM — **deferred** (next slice; the seam is clean — records carry `keyOwner`)
- [~] Quarterly audit-log integrity check (hash chain or AWS Object Lock attestation) — automated, results emailed to the compliance contact — 🟡 **hash chain shipped, automation deferred**: each R2 record carries `seq` + `prevHash` + `entryHash` (crash-safe linear chain, ADR-0009), so a verifiable chain exists now (the historical chain remains verifiable after the ADR-0014 deactivation); the scheduled re-walk + email automation is the deferred slice

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
- **Audit-log cost**: at high volume, log storage + egress could exceed pilot revenue. Mitigation — default retention is metadata-only (no payloads); full-payload retention is an upsell tied to a higher tier. **Dormant — pipeline deactivated 2026-08-08 ([ADR-0014](../adr/0014-deactivate-audit-pipeline.md)); the risk re-arms on re-enable**
- **OAuth-flow misconfiguration**: implementing OAuth from scratch is the most common source of CVEs in MCP-adjacent projects. Mitigation — use Cloudflare Access for SaaS or another battle-tested IdP, do not roll your own
- **Prompt-injection via radar content**: third-party article text is the highest-risk surface. Mitigation — sanitization layer + size cap + provenance metadata; document for clients that radar output should not be auto-actioned by their agents without human review
- **Pilot client churn**: PE firms have long sales cycles; pilots may stall on legal review. Mitigation — start legal review (NDA + DPA + SLA template) in parallel with engineering work, not after; have at least one warm design partner identified before kickoff
- **Reputational risk on outage**: a stale `_provenance` field or hallucinated diligence question reaching a client's investment committee is a brand event. Mitigation — sandbox-first onboarding, explicit "human in the loop" language in the developer docs, status page transparency

**Validation sequence before pilot launch**

1. All BL-032 acceptance criteria still passing in production
2. OAuth flow end-to-end tested against a real client SDK (Claude Desktop's MCP HTTP+OAuth path) — token issuance, refresh, revocation
3. Penetration test report received and all High/Critical findings remediated
4. Audit-log integrity check produces a verifiable hash chain after a synthetic 1000-event burst — **contingent on re-enabling the audit pipeline first ([ADR-0014](../adr/0014-deactivate-audit-pipeline.md), deactivated 2026-08-08)**
5. Sandbox client successfully exercises every tool from a non-GST IP, with the corresponding audit entries visible in the per-client export — **contingent on re-enabling the audit pipeline first (ADR-0014); the export itself is also still a deferred slice**
6. Two pilot agreements signed (legal + technical) — engineering does not "soft launch" without paper
7. Status page live, on-call rotation defined, incident response runbook in place
8. Public listing on at least one MCP directory with a working "try it" demo — **superseded 2026-07-27: listing moved to [BL-093](#bl-093-mcp-server--commercialization-phase-4) as a candidate gated on the pen test + a promotion trigger (e.g. first paying client live), so it no longer gates pilot launch**

---

### BL-034: MCP Server — Documentation Cleanup (rolling catch-all, stub)

**Source**: rolling cleanup catch-all for the MCP-server doc surface | **Status**: ✅ Substantially complete 2026-07-02 (doc restructure, transitional-scaffolding delete, ADR audit, enumParity 7/7, accumulated-bullet resolution, TechPar `exitMultiple` fix via PR #287 all shipped) — full acceptance-criteria history via `git log -- src/docs/development/BACKLOG.md` (pre-prune revision `996b6b4c`)

**Why this stub survives the 2026-07-15 prune**: BL-034 is the standing append-target — any BL-033-era initiative that leaves transitional scaffolding, stale doc references, or cleanup debt behind appends a bullet here in the same PR, and a closing pass executes the accumulated list when the initiative sequence ends.

**Open contingent items**:

- [ ] Library content-source convergence (single source of truth for `gst://library/*` article bodies) — contingent, re-verified still-deferred 2026-07-02; execute if/when the library surface is next touched
- [ ] **`mcp-server/README.md` "Last verified" stanza drift** (appended 2026-08-07 by the 0.48.0 radar-prompt fix): the April/May 2026 verification stanzas carry counts that a live production probe on 2026-08-07 disproved — resource total is now **133** (4 library + 123 regulations + 6 radar) against the recorded 128, framework count **123** against 120, jurisdictions **73** against 38, and the `search_portfolio "platform"` figure has moved from 42 to 46 as the dataset grew. The 0.48.0 PR fixed only the **live instructions** (worked examples, smoke-test steps, the invalid `stage: "Scaling Growth"` value) and annotated the historical `limit: 3` recording rather than rewriting an observation that genuinely happened. Deciding what a dated verification stanza should say once its numbers rot — refresh in place, annotate, or move to an archive — is a documentation-policy call, not a bug fix, which is why it is here rather than in that PR
- [x] **Dead `npm run radar:seed` instruction in live surfaces** (discovered 2026-07-19 during the CLAUDE.md accuracy audit; **✅ RESOLVED 2026-07-21 — Option A, faithful restore**): commit `606f4848` (BL-032.8 Phase B) had removed the `radar:seed`/`radar:unseed` root scripts while ~15 live surfaces (incl. `SNAPSHOT_MISSING_MESSAGE`, the `gst_radar_brief_today` prompt body, tool descriptions, ARCHITECTURE.md, CONTRACT/USAGE) still instructed users to run them. Operator decision: restore the seeder rather than sweep the messages. Shipped: `mcp-server/scripts/seed-radar-cache.mjs` + restored root scripts (plain Node, no tsx), fixture converted to `radar-mock-data.mjs` + `.d.mts` sidecar (single source of truth for seeder + unit suite), round-trip drift-guard test (`radar-seed-roundtrip.test.ts` — seeder output read back through the real reader), and the offline-workflow docs (RADAR.md § Working Offline stdio subsection + cross-links). Every pre-existing reference is accurate again with zero message/golden churn

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

### BL-113: MCP Server — settle the client tool-result ceiling (candidate)

**Source**: BL-109's acceptance probe, orphaned inside its closed stanza and rescued by BL-112 | **Effort**: small (one probe run) | **Status**: Candidate · deferred with triggers · **lower bound raised 2026-08-06** — see the run record below

⏸️ **Do not pick this up because it is "unblocked".** It needs a specific client and a specific person, not an available afternoon.

**The task**: rerun the acceptance probe's **P5 and P7**. P7 is only settled by **a client that previously hit its ceiling** — it re-runs `search_radar` and reports whether the result still writes to a file instead of inlining (the observable recorded at BL-109's D1). The probe's acceptance criteria are **held by the operator and were deliberately not committed to this repo**, so ask rather than hunt for them.

**Run record — 2026-08-06T15:04Z, against 0.47.0, from Claude Desktop "Cowork".** Both target probes passed. **P5** returned the xlsx envelope (13,059 B, 10 sections / 67 bullets). **P7** returned 32 items — `degraded: false`, `wireCacheHit: true` — with no spill to a file. The same run re-raised the citation criterion as a FAIL; that is recorded in [BL-110](#bl-110-mcp-server--jurisdiction-filter-granularity-candidate), not here, so this record is not a clean sweep.

**On P7's precondition** — "a client that previously hit its ceiling". Cowork is the same harness that produced BL-109's D1 spill-to-file **one day earlier**, so the precondition is met **on identity**, attested by the operator's probe header (which this stanza notes is deliberately uncommitted) rather than reproducible from this repo. It is _not_ established on **invariance**: a ceiling is a property of the client build and its context configuration, both unrecorded and unversioned, so this assumes Cowork's ceiling did not move across that one day. The client side has the same `NOT VISIBLE` problem as the backend below — and unlike the backend, no artifact in this record can ever close it.

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

### BL-119: MCP Server — User Acceptance Test Suite

**Source**: operator directive 2026-08-10 — pre-GTM capability verification | **Effort**: Medium — catalog complete 2026-08-11; remaining work is a production run, not authoring | **Status**: Open

**As a** person evaluating or operating the GST MCP server, **I want** a start-to-finish acceptance walkthrough for every published capability **so that** I can prove the server works from a real client before we take it to market, without reverse-engineering input shapes from the Zod schemas.

> **This is not a BL-093 slice and does not reopen one.** [BL-093](#bl-093-mcp-server--commercialization-phase-4) remains ⏸️ DEFERRED under the standing "the next BL-093 action is a decision about the premise, not a slice pick" instruction. BL-119 is internal verification. That its walkthroughs would also be usable source material for a future public docs surface is an observation about reuse, not a claim on that slice.

**What shipped**: the suite at [`mcp-server/src/docs/testing/uat/`](../../../mcp-server/src/docs/testing/uat/README.md) — a TOC/index, a shared `SETUP.md` covering both credential paths, a case `TEMPLATE.md`, and **all ten family documents** (2026-08-10: scaffolding + UAT-01 and UAT-07; 2026-08-11: the remaining eight). Every expected result was written from an executed run rather than from reading schemas.

> ✅ **Fully production-verified (2026-08-12, cycles 4 and 5).** Every family has production evidence and **every case in the suite has now been executed at least once** — UAT-07.6 / 09.9 was the last, closed on a real 57KB body in Claude Desktop. Cycle 4 ran **20 cases against production `0.48.2`**, converting the six remaining tool families from local-stdio authoring runs to proven on the Worker and executing UAT-04.2 for the first time in any environment. Cycle 5 then ran the acceptance test for the `0.49.0` alias fix — **8 Pass, 0 Fail, 1 Blocked** — and closed the cycle-3 dossier loop. The authoring runs had been local stdio (a `dist/` build 24 commits behind master), which is why every run log carries an `Env` column.
>
> **Note on the cycle-4 headline**: the report's summary line reads "18 Pass" while its own verdict table and per-case evidence log carry **20**. The run logs follow the per-case evidence, so twenty `prod` rows sit behind a report that says eighteen.
>
> **Three genuine defects across five cycles, all the same shape: a claim that was true in our documentation and false in an executable surface.**
>
> - **Cycle 2** — `gst_radar_brief_today` emitted deal-team-facing prose over aggregated third-party reporting with no provenance framing. The requirement existed in the BL-033 risk line, [`OPERATOR_RUNBOOK.md`](OPERATOR_RUNBOOK.md) and the `/hub/mcp/` marketing copy, and in **no executable surface** — including the recorded golden, which encoded the same omission so every comparison against it agreed. Fixed in prompt `0.0.5` / server `0.48.2`, re-run and confirmed in cycle 4.
> - **Cycle 4** — `search_regulations` never read the curated `aliases` field, so `"Colorado AI Act"` returned `us-nist-ai-rmf` (a voluntary federal framework with no statutory penalties) in place of a statute carrying $20,000 per violation, and `"EU AI Act"` returned the Korean AI Basic Act. The data had been added in BL-073 for `compose_dossier_envelope` and wired into that one consumer; the search index was a second consumer nobody connected, and **a cycle-3 fix of mine closed only the first half**. The website's regulatory-map search was a third. Fixed in `0.49.0` across both surfaces, with UAT-02.4 added as the free-text disambiguation case whose absence let it ship, and verified in production by cycle 5.
> - **Cycle 5** — `gst_irl_ingestion` had no instruction for the case where a client delivers the expanded prompt as an attached document rather than conversation turns. The model then concludes it holds no bound arguments and offers to call `prepare_irl_body` with the body text it can see — a recovery that **completes**, and silently downgrades `irlSource` from server-witnessed `partner-paste-verbatim-prepop` to model-asserted `partner-paste-verbatim`, past a `requireVerbatimBody` gate that accepts both labels. The dossier looks identical and the audit grade is weaker. Not a broken run — a careful model talked out of the strong path, invisibly. Fixed in prompt `0.22.2` / server `0.49.1`, pinned by a unit assertion.
>
> **Cycle 5 also contributed methodologically, and it changed two cases.** Asked to confirm a spurious `map-absent` entry had stopped appearing, the tester noted that an absence is equally consistent with "the framework is recognised" and "the check no longer fires for anything", and invented a framework name to separate them — producing both behaviours in one response. That control is now a standing part of UAT-07.5, and the same reasoning added `totalMatched` bounds to UAT-02.4: **a positive assertion cannot detect a check that has been switched off.** A third observation (`serverToolCallCounts` reporting `succeeded: 0` for the envelope) was a non-defect — the tool snapshots the counters from inside its own handler, so it has not returned yet — but it had been filed in three consecutive cycles because the explanation lived only in a source comment. Now documented in UAT-07.5 and the IRL contract.
>
> Cycle 1's two reported findings dissolved on investigation — the ICG aggregation gap was two different answer maps, and the map's absence from the case was the real defect (now published in UAT-06.2); radar annotation staleness is editorial supply, operator-confirmed. Cycle 4's other four observations were suite gaps rather than server defects (one was a tester misreading `_audit.engCost` for the top-level `engCost`, since fixed at the schema's own `.describe()` strings) and are closed in the cases themselves.

#### Acceptance Criteria

**Shared scaffolding**

- [x] A single TOC document indexes every UAT — ✅ `uat/README.md`, carrying a reader-facing Test catalog and a machine-checked capability coverage matrix
- [x] Setup written once and referenced, never repeated per case — ✅ `uat/SETUP.md`; each case opens with a one-line prerequisite
- [x] Setup covers obtaining a credential, connecting a client, and the first verified tool call — ✅ both paths: internal `MCP_KEY_*` consent flow and pilot M2M (`client_secret` and `private_key_jwt`)
- [x] Uniform conventions across cases — ✅ case IDs, three verdicts (Pass/Fail/**Blocked**), two execution modes, run-log columns, all defined once in the README

**Exemplar cases**

- [x] Simplest family authored and executed — ✅ UAT-01, three cases, all Pass (local stdio 0.48.1)
- [x] Hardest family authored and executed — ✅ UAT-07; 07.1–07.5 Pass (local stdio 0.48.1), including the negative body-cache-miss path
- [~] UAT-09 (the nine prompts) — 🟡 09.0–09.8 executed against production in cycles 2 and 4; **09.9 not run** — see below
- [x] **A production cycle** — ✅ **complete (cycle 4, 2026-08-12, `0.48.2`)**. All eight tool families plus prompts, resources and the IRL chain now carry `Env: prod` run-log rows; the parity guard derives the README's status table from them
- [x] **UAT-09.8 re-run against `0.0.5`** — ✅ Pass. The caveat lands immediately after the "Open in Hub" footer with nothing between them, carrying all four required elements. The unit assertion proved the instruction was in the body; this proves the model follows it
- [x] **UAT-04.2** (TechPar deep-dive) — ✅ Pass, first execution in any environment. R&D re-based from the three sub-costs (`rdOpEx` ignored, not averaged), zone moved `ahead` → `healthy`, and the deepdive-only ratios populated where quick mode returns null
- [x] **UAT-02.4** — ✅ Pass on `0.49.0` (cycle 5). The acceptance test for the alias fix: the jurisdiction-scoped step returned `totalMatched: 1` where the identical call returned `[]` on `0.48.2`, which is what separates "the alias is in the index" from "the ranking improved"
- [x] **UAT-07.6 / UAT-09.9** — ✅ Pass on `0.49.0`, the last case in the suite to run. `irlSource: partner-paste-verbatim-prepop` with `hashBindResult: pass-bound` and 37/37 claims verified; no `map-absent` and no `provenance-gap` in (J). Settles **half** of the cycle-3 question: `-prepop` is the strongest provenance form, not a loophole — the server hashes and caches the operator bytes at render time, and its own gap logic concurs by not auto-appending a reconstruction entry. **Still open**: whether a _reconstructed_ body through the same argument would also be labelled `-prepop`. This case pasted a verbatim body and cannot answer that by construction; it needs the UAT-07.7-shaped run

**Tool contracts**

- [x] The five undocumented IRL/dossier tools gain an input contract — ✅ one family contract at [`tools/irl-pipeline/CONTRACT.md`](../../../mcp-server/src/docs/tools/irl-pipeline/CONTRACT.md), picked up automatically by `contract-parity.test.ts`
- [x] Registry updated — ✅ row added to [`tools/README.md`](../../../mcp-server/src/docs/tools/README.md)
- [ ] `USAGE.md` for the IRL/dossier family — the only tool family shipping without one; UAT-07 carries the worked examples meanwhile, and the gap is flagged in the registry Status column so it is visible where authors look

**Family coverage** (one document each; the coverage matrix tracks them and CI fails if a registered capability has no row) — **complete 2026-08-11; no `pending` rows remain in the matrix**

- [x] UAT-02 — Regulatory map — ✅ 73 jurisdictions / 123 frameworks discoverable; multi-value filtering documented alongside its deeplink trade-off
- [x] UAT-03 — Diligence — ✅ the all-`unknown` low-context case (28 attention areas) paired against a specified target (4), plus the currency-conversion audit rejection
- [x] UAT-04 — TechPar — ✅ every headline figure re-derived by hand; `cash` vs `gaap` proven to differ by exactly `rdCapEx`
- [x] UAT-05 — Tech debt — ✅ the honest-null path and the guard that rejects a placeholder, reporting both violations in one response
- [x] UAT-06 — ICG — ✅ empty-map structure discovery (the documented remedy for fabricated domain names) contrasted with a scored run; `triggerQuestionAnswered` separates confirmed from assumed gaps
- [x] UAT-08 — Radar — ✅ authored, and all three cases Pass in production (cycle 4) after being **Blocked** on local stdio (`config-missing`); the three legitimate non-Pass outcomes stay tabulated so none is misfiled as a defect, and UAT-08.1 now records that its ~115 KB response is the expected envelope rather than a fault
- [x] UAT-09 — the nine `gst_*` prompts — ✅ authored Mode-A-only, with `mcp-server/tests/examples/*.golden.md` named as the reference and the structure-vs-prose judging rule stated
- [x] UAT-10 — Resources — ✅ 133 resources (4 + 123 + 6); the tool→resource traceability loop closed via a `uri` from UAT-02.2

**Drift guard**

- [x] A registered tool or prompt with no UAT row fails CI — ✅ [`tests/integration/mcp-uat-parity.test.ts`](../../../tests/integration/mcp-uat-parity.test.ts)
- [x] Bidirectional catalog integrity — ✅ a row pointing at a missing file fails, and so does a `UAT-*.md` the index never lists
- [x] stdio-only tools stay out of the matrix — ✅ asserted; they are unreachable over the Worker
- [x] Registry readers have one definition — ✅ [`tests/integration/helpers/mcp-registry.ts`](../../../tests/integration/helpers/mcp-registry.ts), with a sole-definition assertion that goes red when the BL-093 marketing branch lands its own copy, making that rewire mandatory rather than remembered

#### Technical Context

- **Location**: `mcp-server/src/docs/testing/uat/`, nested under testing rather than a new top-level category. `testing/README.md` already arbitrates testing-surface boundaries (its § Integration coverage exists to say what does _not_ live there), so adding a second band continues that file's job. `operations/` was the live alternative — every file there is a human-executed runbook and `LATENCY_PROBE.md` is already a verification procedure — settled by the discriminator that **operations docs are about running the service; UAT is about verifying capability**
- **Not enum parity**: the guard deliberately does not bind documented enum values to Zod schemas. That mechanism already exists opt-in via `CONTRACT.md` frontmatter (`enumParity`) in `contract-parity.test.ts`, and most of the IRL tuples are module-private — wiring them would mean exporting from server source purely to satisfy a doc test. UAT cases therefore show only the arguments a case sends and link the contract as authority
- **Excluded**: `search_radar_offline` and `search_radar_cache` are registered only on stdio (`tools/_local-only.ts`), so no remote client can reach them; presenting them as testable would mislead. `search_radar_cache` is additionally a deprecated alias
- **Cross-links closed**: `PILOT_ONBOARDING.md` § 2 previously stated that the provisioning script's generated email was the only thing sendable to an M2M pilot — true until `SETUP.md` § 0b/1b landed. That paragraph, the email itself (`provision-client.mjs`), and `REMOTE_CLIENT_SETUP.md` now point at the suite; the email pointer carries a unit assertion so it cannot be dropped silently
- **`mcp-server/README.md` § Smoke test** keeps its heading verbatim and its dated stanzas intact — `_archive/MCP_SERVER_HUB_SURFACE_BL-031_5.md` links that anchor as closure evidence, and the doc-link guard skips `_archive/` as a scan source, so renaming it would break the citation on a green run. A pointer was added above the stanzas instead. Related: the [BL-034 open item](#bl-034-mcp-server--documentation-cleanup-rolling-catch-all-stub) on what a dated verification stanza should say once its numbers rot is now partly answered — new verification goes in the UAT run logs, which carry a version column precisely so they can age without lying
- **Branch note**: cut from `master` in parallel with the unmerged BL-093 marketing branch, so `mcp-marketing-parity.test.ts`'s private registry readers could not be extracted. The shared helper was written fresh with identical signatures; the sole-definition assertion above is what forces the rewire when both have landed

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

Per CLAUDE.md Directive 6 "No Deferred Tech Debt" (numbered § 4a when this stanza was written): deferral is acceptable when there is a written trigger condition for revisit and the deferred work is NOT verification of code currently in scope. Phase D meets both criteria — it's net-new automation with explicit trigger thresholds above, not unfinished verification. The deprioritization stays honest by naming the conditions under which it gets re-evaluated.

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

### BL-118: Docs "Last Updated" freshness check (candidate)

**Source**: BL-089's Notes recorded it as a "deferred follow-up (not this item)"; surfaced by the 2026-08-09 prune sweep, which is the only reason it did not go with the stanza | **Effort**: small — the same shape as the guard BL-089 already shipped | **Status**: Candidate

**As a** reader of a doc carrying a "Last Updated" date, **I want** that date to be false-negative-proof **so that** a stale date does not lend confidence to content that has since moved.

**What**: flag docs whose stated "Last Updated" predates their last `git` commit.

**Why it is weaker than the other rescued orphans, recorded so nobody over-invests**: unlike BL-111's drift detector, this carried no promotion trigger and no self-declared prune warning — it was one line of deferral. It is filed rather than dropped because the prune wave that found it also established the rule that a closed stanza gets read for live content first, and dropping this one silently would contradict that in the same commit.

**Prior art**: `tests/integration/docs-link-integrity.test.ts` (BL-089's own guard) already walks both doc trees with an `_archive/` exclusion policy — the traversal is done, and a freshness rule is a second pass over the same file list rather than new machinery.

#### Acceptance Criteria

- [ ] A doc whose "Last Updated" predates its last content commit is flagged
- [ ] `_archive/` is exempt — frozen-verbatim docs are supposed to have old dates
- [ ] Formatting-only commits (the prettier hook rewrites files on every commit) do not trip it

---

### BL-117: MCP Server — deploy-drift detector (candidate)

**Source**: BL-111 recorded this as "**noted, not built and not filed**", observing that its own stanza was prunable and so the idea needed filing if it was wanted. It was not filed; the 2026-08-09 prune wave is what forced the issue | **Effort**: small — one scheduled workflow | **Status**: Candidate

**As an** operator, **I want** production's deployed sha checked against master's HEAD on a schedule **so that** silent production staleness is caught by a machine rather than by someone noticing.

**What**: a scheduled comparison of `/health.gitSha` against master HEAD, filing an Issue on drift.

**Why it is worth filing rather than dropping**: it catches the _class_ behind two real incidents, not one mechanism — BL-111's D1, and the month-behind production incident of 2026-06. Every fix so far has addressed a specific way the deploy chain can stall; this detects the outcome regardless of cause.

**Prior art in-repo**: `prettier-drift-check.yml` is the closest shape, and BL-111 fixed two defects in it worth not reintroducing — a label-creation failure that aborted the step before the Issue was attempted, and a `gh issue list` lookup whose transient failure aborted through a command substitution. Both now degrade to filing rather than to silence. **Filing beats routing.**

#### Acceptance Criteria

- [ ] A scheduled job detects that production is running an older Worker than it should be, and files an Issue
- [ ] Every failure mode degrades toward filing an Issue, never toward silence
- [ ] The cadence is stated with its reasoning, not inherited by copy

**Do not write AC1 as "compare `/health.gitSha` to master HEAD"** — the obvious phrasing, and wrong. `gitSha` only advances when a deploy runs, and the production workflow is **paths-filtered**, so a legitimately-behind `gitSha` is the **normal** state after any master merge that misses those paths — which is most of them. That AC would fire constantly and be muted within a week. The comparison needs a baseline that moves only when a deploy should have happened: the last commit touching the deploy-triggering paths, not HEAD.

**Read the filter from `deploy-mcp-production.yml`, do not assume it.** It is **twelve globs plus one negation**, not the `mcp-server/**` you would guess: it also covers `src/utils/**`, `src/schemas/**`, five `src/data/` entries (four trees plus `ma-portfolio/projects.json`), `src/lib/inoreader/types.ts`, both package manifests, and `test-mcp-server.yml` — the website modules the Worker value-imports at runtime. A baseline computed from `mcp-server/**` alone would miss every deploy triggered by a website glob and report drift that isn't there, which is a smaller version of the same false-positive bug this note exists to prevent. `tests/integration/workflow-paths-parity.test.ts` asserts that **production's paths are a subset of the MCP test-suite's** (not a staging relation — `deploy-mcp-staging.yml` is driven by `workflow_run` and has no consumer-side paths filter), so the production list can widen without any warning appearing here — which is the reason to read it rather than copy it.

Recorded because this stanza shipped with the wrong AC phrasing for one commit, and with the abbreviated filter description for two, and because the repo has been bitten before by a requirement outgrowing its mechanism (BL-111 finding #4).

---

### BL-115: MCP Server — safe half-open recovery probe (candidate)

**Source**: designed during BL-091 (circuit-breaker-open serves cached radar; closed 2026-07-27, mcp-server 0.42.0) and **deliberately cut** there; promoted from a sub-block to its own stanza when BL-091 was pruned 2026-08-09 | **Effort**: ~1 day | **Status**: Candidate · **do NOT implement the naive version**

**As a** radar consumer, **I want** a breaker-open window to end as soon as Inoreader actually recovers **so that** the stale-radar window is no longer than the outage that caused it.

**Inherited context**: BL-091 made a breaker-open window serve the cached snapshot flagged `liveInfo.degraded: true` rather than fail. Its **accepted trade-off** is the gap this item would close — nothing repopulates the radar cache while the breaker is open (the cron already skipped, and no read fetches either), so an early Inoreader recovery is not detected automatically and manual reset is the documented lever. Decision record: [ADR-0006 § Amendment 2026-07-27](../adr/0006-inoreader-zone1-budget-protection.md). Contract: [`RATE_LIMITS.md` § Circuit breaker](../../../mcp-server/src/docs/operations/RATE_LIMITS.md).

**Why it was cut rather than shipped**: a naive probe can _extend_ an outage. It can succeed on the last unit of Zone-1 headroom, the follow-on wire refill (`CALLS_PER_WIRE` calls) then 429s, and `openCircuit` **resets the full 6h TTL** rather than preserving the original expiry — so a 30-minute probe loop can hold the breaker open longer than doing nothing. Ceilings quoted in probe-call counts also under-measure: they ignore the multi-call refill a successful probe authorizes.

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
