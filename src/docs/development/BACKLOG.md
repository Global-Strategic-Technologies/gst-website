# Development Backlog

Consolidated backlog of open development initiatives for the GST website. Each item is a self-contained user story with enough context to design and implement a solution. Items are grouped by theme, not priority — triage happens separately.

> **Completed and closed items** are removed from this file once done — recover any stanza's full acceptance criteria and technical context via `git log -- src/docs/development/BACKLOG.md`, or consult the per-initiative design docs in [`_archive/`](_archive/README.md) (they are no longer kept in this directory — see the [initiative-doc lifecycle](README.md)). Four cleanup waves so far:
>
> - **April 2026**: 30 items (BL-002, 003, 008–019, 021–026, 027–030, and the _original_ BL-036–041 — those six IDs were later reused for new MCP-server initiatives, themselves now shipped and removed).
> - **2026-07-15**: 55 stanzas completed May–July 2026 (BL-005; BL-031 + the BL-031.x series; BL-032 + the BL-032.x series; the reused BL-036–045; BL-047; BL-049; and the BL-051–086 range as filed — not every ID in that range was used). Last pre-prune revision: `996b6b4c`.
> - **2026-08-09**: 9 stanzas closed 2026-07-17 → 08-06 (BL-088, BL-089, BL-091, BL-096, BL-103, BL-108, BL-109, BL-111, BL-112). Last pre-prune revision: `0f7bbec2`. Three of them carried live content that did not go with the parent: BL-091's deliberately-cut half-open recovery probe became **[BL-115](#bl-115-mcp-server--safe-half-open-recovery-probe-candidate)**, BL-111's unbuilt-and-unfiled deploy-drift detector became **[BL-117](#bl-117-mcp-server--deploy-drift-detector-candidate)**, and BL-089's deferred docs-freshness check became **[BL-118](#bl-118-docs-last-updated-freshness-check-candidate)**. A fourth piece of live content — BL-111's repo-level secret decommission — needed no rescue, already being a Pending row in [SECRETS_INVENTORY § Decommission schedule](../operations/SECRETS_INVENTORY.md). A stanza marked closed is not automatically prunable — read it for live sub-blocks first, and note that all four were found by sweeping for the pattern rather than one per review round.
> - **2026-08-22**: 1 stanza (BL-137, workers-types global shadowing) closed and pruned the same day it shipped. Last pre-prune revision: `677862fc`. Its live content — the accepted test-side residual, and the fact that a project-referenced tsconfig split was never shown to be impossible — went to [ADR-0020](../adr/0020-workers-types-global-shadowing-immunity.md) rather than staying here. The BL-136 note below linked to its anchor and was retargeted at the ADR in the same commit.
>
> **Three closed stanzas are deliberately retained, and no other closed stanza should survive a sweep** — the list is exhaustive on purpose, so an omission reads as a decision rather than an oversight:
>
> - **BL-034** (MCP-server doc-cleanup catch-all, substantially complete 2026-07-02) — a slim stub that remains the append-target for BL-033-era cleanup items.
> - **BL-098** (radar negative caching) — closed by removing the requirement rather than implementing it; its own closure note says the reasoning is the point.
> - **BL-106** (2026-07-28 spec alignment) — retained by its own in-stanza decision, because the unreproduced flake instance behind the CLAUDE.md testing rule is stanza-level evidence with no better home. [`.claude/CLAUDE.md`](../../../.claude/CLAUDE.md) and [TROUBLESHOOTING.md](../testing/TROUBLESHOOTING.md) both still cite it as open. **The 2026-08-09 wave deleted it in error and restored it** — that wave's ID list is the corrected one.

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

### BL-133: Payments Platform — automated MCP access checkout on Cloudflare

**Source**: operator directive 2026-08-15 — build the payment rail as a reusable capability, first consumer being self-serve MCP client purchase + provisioning | **Effort**: ~2–3 weeks engineering across the slices below, plus vendor/tax lead time | **Status**: Open | **Reverses**: [BL-093](#bl-093-mcp-server--commercialization-phase-4) § Out of scope, which lists "public checkout / webhook-driven tier automation" as deferred pending a volume trigger — this item is the operator go-decision that supersedes it

**As a** prospective MCP client, **I want** to buy access with a credit card and receive working credentials immediately, **so that** neither I nor the GST operator has to run an email thread to get provisioned — and **as** the GST operator, **I want** that same rail to serve every future productized good or service, **so that** the second thing GST sells does not need a second payments integration.

> **Framing**: the deliverable is a payments capability with MCP access as its first product, not an MCP feature that happens to take money. Every AC below that names MCP should be readable as "the first product wired into the rail." GST already holds a company bank account, so merchant onboarding is a KYC form rather than a corporate-formation dependency — the vendor decision turns on tax handling and hosting fit, not on banking.
>
> **Filed under Business Capabilities, not Infrastructure**, on that same framing — deliberately, even though its first product and most of its ACs live in the MCP server alongside BL-033/BL-093. Read as a filing decision, not a sweep error.

#### Acceptance Criteria

**Slice 1 — Vendor selection (decision, ships as an ADR)**

- [ ] Vendors evaluated on a written matrix: **Stripe direct** (+ Stripe Tax), and at least two merchant-of-record options (Paddle, Lemon Squeezy, Polar). Axes: who is the merchant of record for EU/UK VAT and US sales tax, fee structure at GST's expected volume, Workers/`fetch`-native SDK support (no Node built-ins), webhook signature scheme, invoicing + payment-link support for the future remediation use case, subscription/proration support, and exit cost if the rail is re-hosted later
- [ ] **The tax axis is the decision, not the fees.** Stripe direct means GST registers for and remits EU/UK VAT itself once thresholds are crossed; a merchant of record absorbs that for a higher take rate. Record which liability the operator is accepting — this is a business decision surfaced to the operator, not an engineering pick
- [ ] Decision captured as an ADR in [`src/docs/adr/`](../adr/README.md) per [TEMPLATE.md](../adr/TEMPLATE.md), including the "when would we switch" trigger
- [ ] The chosen vendor's SDK verified to run on `workerd` (Web Crypto, no `crypto`/`Buffer` polyfills) before the ADR is accepted — a vendor that only ships a Node SDK forces raw REST + hand-rolled HMAC, which is a cost the matrix must carry rather than discover

**Slice 2 — Checkout + webhook rail on the Worker**

- [ ] Checkout-session creation and webhook receipt both hosted on the existing Cloudflare Worker (`mcp-server/src/worker.ts`), added as a new path branch alongside the `/admin/inoreader/reauth/{start,callback}` pair — the standing precedent for a non-MCP, non-OAuth HTTP endpoint with its own auth semantics. Note that pair is **not** in `isRoutedPath`; it is handled ahead of the allowlist. New paths must do likewise or join the predicate, or they 404 before auth by design
- [ ] Webhook authenticated by **vendor signature verification (HMAC over the raw body, constant-time compare, timestamp window)** — explicitly NOT `validateAdminKey` (`mcp-server/src/admin/admin-auth.ts`), which is a shared-secret compare and the wrong shape. Raw body must be read before any JSON parse
- [ ] Webhook handler is **idempotent by event id** (KV or R2 dedupe) — vendors retry, and a double `checkout.completed` must not mint two clients or double-provision
- [ ] Handler returns 2xx fast and does provisioning work durably; a slow or failing downstream must not turn into a retry storm that provisions N times
- [ ] Vendor secrets (API key, webhook signing secret) added to [`SECRETS_INVENTORY.md`](../operations/SECRETS_INVENTORY.md) and set via `wrangler secret put` for staging and production separately — never inline (Directive 15). Staging points at the vendor's test mode
- [ ] Payment-event auditability decided explicitly. **The hash-chained pipeline ([ADR-0009](../adr/0009-compliance-audit-log-hash-chain.md)) is deactivated as of 2026-08-08 ([ADR-0014](../adr/0014-deactivate-audit-pipeline.md))** — writing to it today writes to a dead sink. Either re-enable it (drain the retained queues/DLQs → revert the `wrangler.toml` hunk → re-verify per [`AUDIT_LOG.md`](../../../mcp-server/src/docs/operations/AUDIT_LOG.md) § Re-enable) or record payment provenance on the client record alone and say so. Note ADR-0014's own re-enable trigger is "the first client whose contract requires compliance audit capture" — a paid tier is plausibly what creates that client, so this decision belongs here rather than drifting
- [ ] Integration tests cover: valid signature → provisioned; bad/absent signature → 401 with nothing provisioned; replayed event id → no second provision; malformed payload → 400. The signature test must be verified to fail with the check removed (a guard proven by mutation, not by passing)

**Slice 3 — Automated enablement (the part that removes the email thread)**

- [ ] Successful payment provisions an M2M client through the existing path — `createM2mClient` / `POST /admin/oauth/m2m-clients` (`mcp-server/src/oauth/m2m-clients.ts`, `mcp-server/src/admin/oauth-clients.ts`) — reusing the tier and scope guardrails already encoded in [`provision-client.mjs`](../../../mcp-server/scripts/provision-client.mjs). **Extract the shared guardrails rather than reimplementing them in the handler**: the script requires an explicit tier (the API silently resolves an absent one to `free-pilot`) and validates scopes against the catalog (the API accepts any non-empty array, so a typo provisions a client that can call nothing). A parity test already binds the script's mirrors to `src/ratelimit/tiers.ts` and `src/oauth/provider.ts` — the extraction must not break it
- [ ] **`tool:radar:*` / `resource:radar:read` stay excluded from any self-serve purchase** unless the operator explicitly configures a radar-bearing SKU — the script gates them behind `--allow-radar` because they read the Inoreader-funded snapshot, and a checkout page must not become the bypass
- [ ] **Blocker to resolve first**: the admin API is GET/POST/DELETE only — there is **no PATCH/PUT**, so a tier change today means delete-and-recreate, i.e. a new credential for the client. Renewals, upgrades, downgrades, and lapse-driven demotion all need an in-place tier mutation endpoint. Ship `PATCH /admin/oauth/m2m-clients/:id` (tier + scopes, admin-authed, audit-logged) as part of this slice
- [ ] Client secret is delivered to the buyer **exactly once**, on the post-checkout return page, over a single-use short-TTL token — never emailed, never re-retrievable, preserving the "secret exists only in the creation response" property that `provision-client.mjs` deliberately protects. The follow-up email carries setup links and the client id, not the secret
- [ ] Lifecycle events wired end to end: successful renewal keeps the tier; failed payment / cancellation / refund / chargeback demotes or revokes on a defined grace policy, and the policy is published where the buyer sees it before paying
- [ ] Every paid tier assignment remains traceable to a payment (vendor payment/invoice id recorded on the client record) — carries forward the equivalent BL-093 invoice-traceability AC
- [ ] [`PILOT_ONBOARDING.md`](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md) § 0 updated: self-serve purchase becomes the primary intake, operator-driven provisioning stays documented as the path for negotiated/enterprise deals. This also closes the 🟡 half-pending intake AC in BL-093

**Slice 4 — Website UX and integration**

- [ ] Purchase surface on the site presenting the tier table and price, built with design-system tokens only; works in light/dark and all 6 palettes; desktop-first responsive; E2E coverage per [TEST_STRATEGY.md](../testing/TEST_STRATEGY.md). Route naming consistent with `/hub/radar` and `/hub/tools/*`
- [ ] **Copy must not convert capability ceilings into a ratified SLA.** Tiers are "tunable, non-contractual capability ceilings" per [`RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md) / [ADR-0010](../adr/0010-per-client-rate-limit-tiers.md), and selling access against them is exactly where that framing is most likely to erode. SLA ratification stays deferred under [BL-033](#bl-033-mcp-server--external-pilot-phase-3); nothing on a pricing page may ratify one by implication
- [ ] **CSP updated in BOTH `vercel.json` and `src/middleware.ts`** per [SECURITY_HEADERS.md](../security/SECURITY_HEADERS.md) — the site pins `form-action 'self'` and an explicit `connect-src`, so the vendor's checkout host, JS bundle, and any embedded-payment iframe need `form-action` / `connect-src` / `script-src` / `frame-src` entries. A redirect-to-hosted-checkout flow needs strictly fewer of these than an embedded element; weigh that in Slice 1
- [ ] Whether the return/confirmation page is a Vercel on-demand route or a static page reading a Worker-issued token is decided explicitly. If an Astro API route is used: `export const prerender = false`, and keep the ISR `exclude: [/^\/api\/.+/]` regex in `astro.config.mjs` intact — without that regex, POSTs to `/api/*` return 403 through Vercel's `_isr` pipeline. **Do not reach for the `INTERNAL_ENDPOINTS` allowlist in `src/middleware.ts` for the buyer-facing page** — `isAnonymousProbe` treats any request without a `Bearer` header as a probe and 404s it before `next()`, and a buyer's browser has no bearer. That allowlist fits only a bearer-authed token-exchange route the page calls on the buyer's behalf. A working template survives in git: `git show 606f4848^:src/pages/api/inoreader/refresh.ts`
- [ ] `src/pages/privacy.astro` and `src/pages/terms.astro` updated for payment-data collection and the purchase terms (refunds, cancellation, what a tier does and does not promise). Note `src/pages/hub/index.astro` currently tells visitors the tools are free — reconcile that copy, and run the Directive-11 `grep tests/` check on every string changed
- [ ] Purchase flow passes WCAG 2.1 AA (axe-core), with graceful handling of abandoned checkout, declined card, and vendor-outage states
- [ ] GA4 purchase event consent-gated — depends on [BL-001](#bl-001-cookie-consent-and-gdpr-compliance) if analytics on the funnel are wanted; ship without funnel analytics rather than blocking on it

**Slice 5 — Rail reuse (design constraints only; no second product built here)**

- [ ] Product/SKU definition lives in one place (a typed catalog module) that maps SKU → fulfillment handler, so a future product registers a handler instead of forking the checkout route. MCP access is the first registered SKU
- [ ] **Payment links / remediation flow**: the vendor selected must support operator-generated one-off payment or invoice links, so an unpaid or lapsed client can be sent a link that, once paid, re-runs the same fulfillment handler and restores the tier — the same rail, not a parallel manual path
- [ ] Fulfillment handlers that have no credential to issue (a document, an engagement deposit, a one-off deliverable) are supported by the interface, demonstrated by a written second-product sketch — not an implementation
- [ ] "Client pays an engagement invoice through the web platform" is named as the anticipated second consumer, with the deltas it will need (larger amounts, ACH/bank transfer rather than card, purchase orders, per-client invoice identity) recorded so Slice 1's vendor matrix scores against them **now** rather than after the rail is committed

#### Technical Context

- **The substrate is already built.** Per-client tiers with Upstash-enforced sliding windows and `RateLimit-*` headers (`mcp-server/src/ratelimit/tiers.ts`, ADR-0010), M2M `client_credentials` with hashed secrets, the admin API, per-`keyOwner` Analytics Engine telemetry, and the hash-chained audit log all exist and are tested. `ASSIGNABLE_TIERS` is `['free-pilot', 'paid', 'enterprise']`; the `paid` tier has been enforceable since BL-033 slice 5. What is missing is the money and the automation around it — this item should not rebuild any of the above
- **This crosses a recorded architectural stance.** [ADR-0008](../adr/0008-mcp-oauth-embedded-authorization-server.md) commits to pre-registered clients with no dynamic client registration and no self-serve signup, and BL-093 restates "explicitly NOT self-serve credential issuance." Automated post-payment provisioning is a bounded exception — the operator's checkout is the registration authority, so it is not DCR — but it must be written down: **amend ADR-0008 (or supersede it) in the same PR as Slice 3**, rather than letting code silently contradict an accepted ADR
- **Payment is not identity.** A card charge authenticates a payment instrument, not an organization. Decide and document what a buyer must supply before credentials are minted (verified email at minimum; firm name and use case if the radar/enterprise SKUs stay operator-gated), and whether any SKU still requires operator review before fulfillment
- **Abuse surface.** A self-serve endpoint that mints credentials invites card-testing and throwaway-account farming. Rate-limit the checkout-creation endpoint, rely on the vendor's fraud tooling, and keep the low tier's ceilings low enough that a fraudulently-obtained free/entry credential is not worth farming
- **Hosting split is deliberate**: the Worker owns the money-and-credentials path because that is where `OAUTH_KV`, the audit log, the tier logic, and the admin API already live; the website owns presentation and the return page. Do not split provisioning logic across both
- **Related items**: [BL-093](#bl-093-mcp-server--commercialization-phase-4) supplies the marketing page, public developer docs, and pricing-presentation ACs this checkout links into — its deferral premise ("a front door is not the bottleneck when nobody is at the gate") is what this operator directive revisits, so re-read that stanza's reasoning before deciding how much of the front door ships alongside. [BL-004](#bl-004-email-capture-system) overlaps on form UX, the email-service choice, and the privacy disclosure — a purchase-receipt sender and a marketing-email sender may or may not be the same vendor; decide once. BL-033's independent pen test remains the hard gate on public listing, and a live payment endpoint strengthens rather than weakens the case for running it

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

### BL-135: Claude Design sync — correct it, guard it, and publish the design system rather than its content-level subset

**Source**: audit of the initial sync (`5ca4012f`, 2026-08-16) the same day it landed — three parallel checks (name accuracy, coverage, specimen fidelity + tooling), plus a read-only listing of the live project confirming remote = local `ds-bundle/` | **Effort**: Slices 1–2 Small (a session); Slice 3 Medium — it is a build-extraction script plus a card-authoring path the converter does not take today; Slice 4 Small | **Status**: **Slices 1–3 shipped 2026-08-16** — open only for the one human confirmation Slice 3 names (the pane indexing the chrome group)

**As a** user of the Claude Design project ([CLAUDE_DESIGN_SYNC.md](CLAUDE_DESIGN_SYNC.md)), **I want** the published system to be correct where it speaks, to fail CI when it goes stale, and to cover the surfaces that make a page look like GST **so that** the design agent produces on-brand output for whole pages rather than on-token cards inside chrome it invented.

**What the audit found.** The sync is well-built for what it chose to be — production-faithful flattened CSS (lightningcss + browserslist, `-webkit-backdrop-filter` intact), dark mode verified by probe, honest docs, and the "never hand-write React copies of `.astro` components" rule is the right call. Its ceiling is structural: it publishes a **content-level class vocabulary**, not the design system. Measured against the repo the day it shipped:

- **Six defects in the published artifact.** (D1) the "Idiomatic example" in [`.design-sync/conventions.md`](../../../.design-sync/conventions.md) — the single most-copyable snippet, inlined into the agent's system prompt — builds a `.brutal-stat-tile` from `.brutal-data` + `.brutal-label-small`, contradicting its own BEM table 60 lines above and every real consumer (`tiles.css` `__value`/`__label`; ICG page; `/brand`) — both classes exist, so it renders a teal, side-by-side tile instead of the stacked one DataSpecimen shows. (D2) `FormSpecimen` (+ its doc) puts `.brutal-input` inside `.brutal-field`; production and `/brand` always use `.brutal-field__input` (dashed 2px, transparent, mono — visually different), and `__input`, `__input-wrap`, `__prefix/__suffix`, `__hint`, `__req` are absent from the BEM table. (D3) `ToolShellSpecimen.md` wraps in `<section className="tool-section">` — no such class exists in `src/styles`. (D4) `--overlay (12px)` in conventions.md and FrostedSpecimen.md — actual is `blur(6px)` (`global.css`); inherited from `STYLES_GUIDE.md`, so a pre-existing doc drift now exported. (D5) the header says "`window.GST` is an **empty object** … no importable components" — false as shipped: eight `*Specimen` galleries are on `window.GST` (that is how the converter's `[BUNDLE_EXPORT]` gate is satisfied), and the boilerplate tail then says "All 8 components are the real upstream code" and shows `const { ButtonSpecimen } = window.GST` — the header should state what is true (exports exist, are galleries, must not be rendered). (D6) `CardSpecimen.tsx` puts `maxWidth` inline **on the card**, while CardSpecimen.md's last line says cards must never do that. Minor: a "Legacy CTA" row label (`.cta-button` is current); the gateway `BulletDelta` omits the `aria-hidden` / `flex-shrink:0` `DeltaIcon.astro` always emits; NOTES says React lives only in `.ds-sync/node_modules` but `react@19.2.8` is transitively in root `node_modules` (undeclared, untyped). Everything else checked out: every token named in the header exists with the exact name, every BEM modifier resolves to its block, tool-shell widths verified.
- **Coverage.** conventions.md names 101 of 356 classes defined in `src/styles` (28%); ~215 are named nowhere. The reusable ones the agent will hand-roll: the **hub-tool chrome, 39/39 untaught** (`.tool-action-bar` + `--center/--end/--bordered/--frosted/--stack`, `.tool-wizard-progress/-step/-dot`, `.tool-tab-bar/.tool-tab`, `.tool-methodology__*`, `.tool-bench-note`); blocks named **without their required children** — the exact "block alone renders unstyled" failure the header warns about (`.brutal-option-card`, `.brutal-project-card` ×12, `.brutal-search` ×13, `.brutal-breadcrumb`, `.brutal-bench-table`, `.brutal-panel`); whole families absent (`.brutal-tab/-tab-bar`, `.brutal-slider`, `.brutal-teaser-card`, `.brutal-faq`, `.brutal-shadow`, `.brutal-filter-drawer`, the entire `toc.css` root, `.brutal-stat__*`/`.brutal-cta__*`, `.brutal-btn--copied`, `.no-print`, `.skip-nav`). Tokens: ~60 of 286 named; missing families are the semantic hub colors (`--color-authority/-distinguish/-subdued`, `--hub-authority-blue`, `--color-editors-pick`), **every dataviz scale** (`--techpar-*` ×28, `--icg-*` ×6, `--dm-*` ×9, `--regmap-*`) — any chart goes off-brand without them — the dark-side literals used inside `light-dark()`, `--z-raised/-negative`, `--accent-subtle/-wash/-faint-bg`, `--color-primary-rgb`. Rules that exist only implicitly, with no token to discover them by: `border-radius: 0` everywhere (53×, never stated); the focus-ring recipe (`outline: 2px solid var(--color-primary); outline-offset: 2px`, 16 rules); the letter-spacing scale (0.04–0.12em, hardcoded ~180×); `.container` = 1600px / 3rem; the 1024px tablet tier used in 25 scoped media queries; and **no `prefers-reduced-motion` handling anywhere in `src/styles`** (only `ThemeToggleButton`). Fine to omit: regulatory-map one-offs (~50), `.legal-page-*`.
- **The structural blind spot.** 73 `.astro` files, 54 with `<style>`: **13,802 lines scoped vs 5,301 in `src/styles` — ~72% of the site's CSS is invisible to the agent**, and the site's identity lives there: `Header.astro` (sticky, 2px teal rule, nav ink in `--color-tertiary`), `Hero.astro` (the 6rem / 900 / uppercase / −0.04em / line-height 0.95 headline and gradient band — `.brutal-hero__*` in `global.css` covers only the title/description/trustline text), `Footer`, `StatsBar`, `EngagementFlow`, `WhatWeDo`, `WhoWeSupport`, `WhyClientsTrustUs` (scoped `.trust-card` beside a global `.brutal-trust-card`), `Breadcrumb.astro` (scoped `.breadcrumb__*` beside a global `.brutal-breadcrumb`), and every hub tool page layout. STYLES_GUIDE mechanism 3 legitimises specimens only for component-less classes, so **hand-ported specimens can never cover the chrome**, and hand-ported JSX is exactly the drift surface STYLES_GUIDE calls "worse than no specimen" — with no parity test possible (D2 and D6 are day-one drift).
- **Guards — every staleness risk the sync's own docs list is unguarded in-repo.** The name check NOTES/CLAUDE_DESIGN_SYNC say is "re-run each sync" lives only in the gitignored `.ds-sync/` skill; `test:docs` scans `src/docs` only. The hand-maintained `ROOTS` list in [`build-css.mjs`](../../../.design-sync/build-css.mjs) is 19/19 complete today, and a new page-imported sheet (as `toc.css` is) would ship nowhere silently. `.design-sync/**/*.tsx` pass ESLint but **`tsc`/`astro check` never see them** — TypeScript's `**/*` skips dot-directories — so the commit's "deliberately still linted" is true for lint only. Fresh-clone friction, not data loss: `.cache/review/*.grade.json` (the "8 carried forward" human verdicts) and `remote-sync.json` are gitignored, so a re-sync from a new machine is a full re-upload + re-grade; `dark-probe.mjs` hard-codes a `ds-bundle/` path and fails before a full build. The **six palettes remain asserted, not verified**.

#### Acceptance Criteria

**Slice 1 — correct and guard — ✅ shipped 2026-08-16**

- [x] D1–D6 fixed at the source (`conventions.md`, `FormSpecimen.tsx` + `.md`, `ToolShellSpecimen.md`, `CardSpecimen.tsx`), and D4 fixed in `STYLES_GUIDE.md` too, since that is where it came from; the minor items with them
- [x] A vitest under `test:docs` (beside `docs-variables-sync.test.ts`, reusing its CSS-parsing approach) asserts every `` `.class` `` / `className="…"` / `__sub` / `--modifier` / `` `--token` `` named in `conventions.md`, `specimen-docs/*.md` and `specimens/*.tsx` exists in `src/styles/**/*.css` — with an explicit allowlist for the two intentional negatives (`.brutal-card`, `.brutal-hero`) that fails when an entry becomes stale, per the `FLOOR_EXCEPTIONS` posture. It must find D3 on this branch before the fix (prove the guard probes something) — it did: the first run reported exactly `.tool-section` and nothing else; a four-way mutation (phantom class, phantom token, phantom modifier, phantom sub-element) was caught before the fixes landed. Lives in `tests/integration/design-sync-guards.test.ts`
- [x] A vitest asserts `ROOTS` in `build-css.mjs` reaches every sheet under `src/styles/**/*.css` via transitive `@import` — set equality, not subset
- [x] `.design-sync/**/*.tsx` are either type-checked (an explicit `tsconfig` include + `@types/react` as a devDependency, or a `.design-sync`-local tsconfig run from `test:docs`) or the docs stop implying they are; the eslint.config.mjs comment says which — type-checked: `.design-sync/tsconfig.json` + `@types/react` devDependency, run by the guards test (`tsc -p .design-sync`), proven to catch a `className={42}`
- [x] Palettes verified: the dark-probe pattern extended to toggle `html.palette-0…5` on a real card and print which tokens re-point; the "unverified" caveats in CLAUDE_DESIGN_SYNC.md and NOTES.md replaced by the result — `palette-probe.mjs`: palette-0 holds `#05cd99`, 1–5 re-point the token AND the painted fill
- [x] Fresh-clone path documented in NOTES.md — what a re-sync from a new machine costs (re-upload, re-grade), and that `dark-probe.mjs` needs a full `package-build` first
- [x] Re-synced; the remote project's `README.md` and `components/specimens/*` reflect the fixes (`list_files` + a `get_file` on README suffices) — 53 files written; the remote README confirmed carrying D1/D4/D5 and the `.brutal-field` row

One correction made mid-slice, recorded because it is the class of error this repo tracks: the first draft of the D2 fix described `.brutal-input` as "solid-border" — it is dashed like `.brutal-field__input`; the real differences are width, size and colour. Asserted from memory, caught by looking at the rendered card. Fixed before upload.

**Slice 2 — extend the vocabulary — ✅ shipped 2026-08-16**

- [x] conventions.md teaches the hub-tool chrome (`.tool-action-bar` family, wizard stepper, tabs, methodology, bench-note) — shown in place by a new **ToolChromeSpecimen** rather than crammed into ToolShellSpecimen (the shell card was already clipping); each row is ported from its production consumer (ICG, techpar, diligence-machine) and the source is named in the specimen's header comment
- [x] Every block named in the class table lists its required BEM children — `option-card`, `project-card`, `search`, `breadcrumb`, `bench-table`, `panel`, `field` (full set) join the table, plus `teaser-card`, `faq`, `slider`, `filter-drawer`, `brutal-tab-bar`, `tool-tab-bar`, `tool-wizard-progress`, `tool-methodology`; a new **NavigationSpecimen** shows breadcrumb, the `brutal-tab` strip, search-with-results and the detail panel
- [x] The absent reusable families are added (`brutal-tab`, `brutal-slider`, `brutal-teaser-card`, `brutal-faq`, `brutal-filter-drawer`, `toc`, `brutal-stat`/`brutal-cta`, `--copied`, `.no-print`, `.skip-nav`, `.editors-pick-tag`, the `is-*` state classes), each with a specimen row or a copyable snippet; regulatory-map one-offs excluded with a sentence saying so — and `brutal-shadow`/`brutal-transition`/`brutal-interactive`/`brutal-link-interactive`/`brutal-focus-outline` deliberately listed **with** them as `/brand`-only demo boxes rather than taught (they exist to document a rule; the rule is now written down instead)
- [x] Token table gains the semantic hub colors, every dataviz scale (techpar/icg/dm/regmap — with an explicit "never invent chart colours"), the dark-side literals and the omitted z/accent tokens; the implicit rules are written down under "Rules the CSS assumes but never states" — radius 0 (skeleton exception), elevation-by-border, the focus-ring recipe, the letter-spacing scale per class, line-heights, `.container` 1600/3rem→1.5→1, the 1024px tier as page-level only, and the reduced-motion posture: **no global rule ships; if you add motion, wrap it yourself** — that is a statement of fact, not a new ruling, and stays open for a ruling
- [x] The header stays under the 32,000-char ceiling with headroom — **it did not at first**: the extended tables prettier-padded to 31.8 KB (one 400-char dataviz cell padded every row of the token table). Converted the three big enumerations to bullet lists: same content, 16.3 KB. NOTES.md records why they must stay lists

Verification: guard green across all new names (its first run on the extended CardSpecimen.md caught nine unqualified project-card sub-elements — the doc now names the block); `tsc -p .design-sync` green; resync `validate ✓`, render check 10/10, both new cards captured and graded; 63 files uploaded, remote lists 10 specimen directories.

**Slice 3 — publish the chrome by extraction, not by hand — ✅ shipped 2026-08-16 (plan-reviewed, four rounds)**

- [x] A build step slices the production build and emits each slice as a static `@dsCard` HTML card carrying the rendered production markup plus the scoped CSS it needs — mechanism 1 by construction: nothing hand-written, nothing to drift. **As designed the AC named `/brand` (`dist/brand/index.html`); the reviewer showed that was wrong on both counts** — the path is `dist/client/…`, and several `/brand` `lib-*` groups are deliberate replicas (STYLES_GUIDE § "How a specimen relates to what ships": mechanism 2/3, inline-styled, "do NOT converge"), so slicing them would have published replicas as production markup. `.design-sync/extract-chrome.mjs` slices **production routes only** — `index.html` (header, hero, three sections, CTA, footer), `about` (breadcrumb), `ma-portfolio` (stats bar), `services` (engagement flow), `hub/tools` (tools landing section), `hub/library/vdr-structure` (TOC) — with jsdom, and filters the page CSS (linked sheets ∪ inline `<style>` — Hero and CTA rules live only inline) to the slice's `data-astro-cid-*` rules with a lightningcss visitor (browserslist targets, so media queries are not rewritten). 12 slices, 19 cards
- [x] Header / Hero / Footer / StatsBar / CTA section / Breadcrumb / the section families / hub landing / TOC are browsable under `components/chrome/` and named in conventions.md § "Site chrome — rendered production markup" as read-the-prompt-and-copy patterns (markup **and** CSS, keep the cid attributes)
- [x] **Dark-mode cards exist**: the seven home-page slices ship `…Dark` twins with `html.dark-theme` on the card's own root — both documented reasons the converter's cards cannot be dark are answered (our scaffold, root-level class). `--check` asserts `--bg-light` resolves to `#0a0a0a` on every twin
- [x] Wired and loud: runs **after** `resync.mjs` (package-build wipes `ds-bundle/`; validate must not re-run afterwards — count mismatch, documented), exits 1 on a missing build, a selector matching ≠ 1 element, an empty slice, or a cid-bearing slice with zero matched rules; `--check` renders every card with the validator's floors **plus zero pageerror / console error / failed request** (added after the reviewer found a dead `<script src="/_astro/…">` in the footer slice that 19/19 green had not caught — slices now drop `<script>`/`<link>`/`<style>` and inline `on*` handlers). Guard 4 in `design-sync-guards.test.ts` asserts every `SLICES` entry resolves to a route + exact tag/class-token (or id/attribute) in `.astro` source, per-entry, with a fixture proof that suffix renames and lookalike attributes do **not** satisfy it (the first version was `\b`-bounded and did — also a reviewer catch). CLAUDE_DESIGN_SYNC.md and NOTES.md describe the second card path, the ordering, and the manual upload step (chrome cards are outside `_ds_sync.json`, so the resync verdict cannot list them and nothing tracks their staleness — recorded under re-sync risks)
- [x] **Decision recorded — promotion declined for now.** Extraction covers the need without a website refactor: the agent gets the real Header/Hero/Footer markup and scoped CSS as production ships them. Promoting scoped chrome into global classes (Hero headline recipe, `.site-header` rules, the `.trust-card`/`.brutal-trust-card` and `.breadcrumb__*`/`.brutal-breadcrumb` duplications) is a design-system change with its own regression surface and no current consumer asking for it; the two duplications are real debt but belong to a website tidy-up, not to the sync. Revisit trigger: agent output that reproduces chrome incorrectly **despite** the cards, or a second consumer of the design system that cannot carry cid-scoped CSS

**Needs a human once**: the claude.ai/design pane compiles `_ds_manifest.json` product-side, so whether it indexes `components/chrome/*` and renders the dark twins cannot be confirmed from the repo — open the project and look for the "chrome" group. Everything else in this slice is verified: extractor `--check` 19/19 with zero page errors; guards 14/14 (mutation-proven twice); 38 chrome files uploaded and one prompt.md read back.

**Process note**: the Slice 3 implementation was written alongside the plan-review rounds rather than after approval — this session is non-interactive and the working code was used as review evidence. The reviewer flagged it (round 3, major 3); it is stated here rather than left for the diff. Two real defects were found by the reviewer _running_ that code, which is the argument for the gate's ordering.

#### Technical Context

- **Do not** relax the two non-negotiables in CLAUDE_DESIGN_SYNC.md to get coverage — the extraction path in Slice 3 exists precisely so the chrome can ship without a hand-written React copy of anything.
- The converter's `register_assets` / hand-authored `@dsCard` path (see the `DesignSync` tool description: "the Design System pane now builds its card index from each preview HTML's first-line `<!-- @dsCard group="…" -->` comment") is the delivery mechanism for Slice 3 cards; the React-specimen path stays for the class galleries.
- Astro-scoped CSS ships as `[data-astro-cid-*]`-qualified rules with hashed attributes; the slice must carry the attribute-bearing markup and the matching rules together, or the card renders unstyled. Extract from the built page, not from `.astro` source.
- `dark-probe.mjs` is the pattern for the palette probe (~10 lines of change); run it from the repo root after a full `package-build`.
- The 32,000-char header limit is documented in the skill's `lib/emit.mjs` (`emitReadme`), not in this repo — cite it in NOTES.md so the next person doesn't rediscover it.
- Related: [BL-116](#bl-116-site-wide-orphan-class-guard) (orphan classes on the site — the mirror-image guard: this item catches names the _docs_ use that CSS lacks; BL-116 catches names the _DOM_ uses that CSS lacks); [BL-020](#bl-020-design-system-package-extraction) (a packaged DS would make Slice 3 unnecessary — deferred, and this item does not wait on it).

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

### BL-140: The dossier pipeline cannot start until a third party returns a document

**Source**: operator question 2026-08-23 ("does anything populate an IRL from model context?") — the surface was swept before filing and the capability is absent: all five IRL tools, both IRL prompts, and every other prompt on the surface sit on one side of this gap | **Effort**: Medium — the fill mechanism is small; the D-cell grammar and proving conformance against a frozen downstream path are the actual work | **Status**: Open — opportunity and operator rulings recorded, ready for planning

**As a** GST partner engaged on a target that has not returned a filled IRL, **I want** to populate the IRL from evidence I already hold — a virtual data room export, documents remitted piecemeal, public filings, prior sessions, whatever is in front of the model — **so that** the dossier sweep runs in the session where the engagement starts rather than in the one after the target replies, and the rows evidence could not answer stand blank as exactly what still needs putting to the target.

**Filed under Infrastructure, not Business Capabilities** — the inverse of [BL-133](#bl-133-payments-platform--automated-mcp-access-checkout-on-cloudflare)'s filing decision and for the same reason read the other way: the deliverable is MCP-server surface living beside its siblings ([BL-123](#bl-123-gst_irl_ingestion-takes-its-inputs-and-its-own-provenance-claims-on-trust), [BL-129](#bl-129-assess_infrastructure_cost_governance-is-the-only-irl-fed-scoring-tool-with-no-_audit), [BL-130](#bl-130-fillratio-is-model-asserted-and-nothing-checks-it--not-even-against-itself)), not a commercial rail that happens to be built in TypeScript.

#### The opportunity

**Today the pipeline has a hard external dependency in the middle of it.** [`irl-pipeline/CONTRACT.md`](../../../mcp-server/src/docs/tools/irl-pipeline/CONTRACT.md) draws it as a step in the diagram — `generate_information_request_list_xlsx` (emit the ask) `→ … partner returns a populated IRL … → prepare_irl_body`. Everything downstream of that ellipsis is inert until a party GST does not control returns a document. It is the longest-latency step in the workflow, the one with the least leverage, and on some engagements it never completes at all.

**The information frequently already exists.** A data room has been opened, documents have been remitted against earlier asks, the target is a public filer, or an earlier session already extracted the shape. Nothing on the surface consumes any of it. The generator takes eight arguments and every one is scoping — `targetName`, `companyName`, `projectName`, `transactionContext`, `includeSections`, `excludeRequests`, `customRequests`, `showCanonicalReference`. There is no input path for an answer. `gst_irl_ingestion` requires `filledIrl` and only consumes; its one context-reading capability is transcription (`irlSource: model-reconstruction-from-xlsx` — reading cells someone else already filled). The single place where model context touches IRL content today is `productSummary`, which lets the model _remove_ questions it can already answer rather than answer them.

**The reframe.** The IRL is a schema for what diligence needs to know, not only a questionnaire. Once that schema can be filled from any evidence source, "send it and wait" becomes one path to a populated IRL rather than the only one. Three things follow:

1. **Time-to-first-dossier collapses** from the target's response cycle to a session.
2. **The ask that does go out gets better, at no cost.** A population pass partitions the canonical requests into answered-from-evidence and still-open, and the partially populated workbook **is** the follow-up ask — the blank rows are precisely what remains, legible to everyone without a second artifact existing.
3. **Engagements that never produce an IRL become reachable** — pre-LOI screening, competitive and market work, and sell-side prep where GST already holds the documents and the "target" is the client.

#### Where the work actually is: sourcing, not authorship

**The governing assumption has to change for this initiative, and the change is a correction rather than a concession.** The pipeline today treats a returned IRL as ground truth because a partner typed it. That is an assumption about **authorship**, and authorship was never what made the dossier defensible — it merely correlated with it while the target's reply was the only evidence the pipeline could see. Held up to the light it is weak on its own terms: a target's Response cell is an interested party's unsourced assertion, taken on faith, with the interested party being the one whose valuation depends on the answer. A row derived from `VDR/06/soc2-2025.pdf` and carrying that pointer is **more** auditable than that, not less. The axis that actually carries the weight is what a row **rests on** — and that axis already exists in this codebase as the tier 1/2/3 discipline. It simply terminates prematurely at "the IRL says so."

So the deliverable is not a hierarchy that ranks authors. It is **extending the chain's ground truth from the body to the evidence the body was drawn from**, so tier discipline can reach one step further back.

**Where the naive version genuinely does break** — and it is a mechanical defect, not a trust judgement. `validate_irl_provenance` matches each claim's excerpt against the filled body (verbatim, or ≥ 8 consecutive words fuzzy). If the model writes the body and then cites the body, verification measures nothing: it confirms the model quoted itself accurately. **Circularity is the problem, and the answer is to make every row name the document it came from — so the trail ends somewhere a reviewer can go — not to demote the author.** Three downstream surfaces looked like they would need modification; under the rulings below **none of them is touched** — the fix is placement and naming, not new machinery:

- **`irlSource` describes transport, not sourcing.** Five values — `partner-paste-verbatim`, `partner-paste-verbatim-prepop`, `model-reconstruction-from-xlsx`, `model-reconstruction-trimmed`, `placeholder` — and all five answer "how faithfully was the body carried," a question that is orthogonal to what any individual row rests on. It stays exactly as it is; per-row sourcing lives in the cells, not in the enum.
- **`fillRatio` and the inclusion gates already have the right rule; this initiative feeds it instead of changing it.** [`irl-ingestion.ts`](../../../mcp-server/src/prompts/irl-ingestion.ts) § Tool inclusion gates: a bare `(Source: VDR/03/financials.xlsx)` is _"not signal — it is a promise of signal."_ That is exactly right, and this initiative is the machinery that **delivers on the promise**: the same pointer, with the answer actually drawn from behind it and written into the answer slot, becomes signal under the existing rule with no change to the rule.
- **The `_audit` evidence enums apply unchanged.** `velocityEvidence: revenue-growth-explicit` and its siblings exist to stop an inference being asserted as a fact. An answer drawn from evidence and written into the IRL's answer slot **is** explicit in the IRL, so the frozen discipline treats it exactly as it treats a target's answer — what anchors it one step further back is the reference in D, which a reviewer can follow even though no tool checks it.

**The house pattern from [BL-123](#bl-123-gst_irl_ingestion-takes-its-inputs-and-its-own-provenance-claims-on-trust) and BL-121 — cap a model self-assertion with server-held metadata — does not govern here, and a reviewer should not restore it.** Those two work because the server holds an independent record of the same fact: it knows when it minted the body, it counts the tool calls itself, so a contradicting claim can be capped. Analytical work product has no server-side counterpart and never will; there is no second copy of the truth to cap against. The pattern is not merely undesirable here, it is **inapplicable**. The server's role is to carry, structure and expose what each row rests on so a human or a downstream tool can inspect it — not to referee a claim it has no standing to referee.

**The repo has already met the shallow version of this and recorded it as an open hole.** [UAT-07 § On pre-populated rows](../../../mcp-server/src/docs/testing/uat/UAT-07-irl-pipeline.md): _"a workbook may arrive with rows GST pre-filled from existing source documents rather than answered by the recipient. Nothing in the provenance vocabulary distinguishes the two, so a dossier counting them as partner answers makes a claim it cannot support."_ The mitigation on record is a human typing `[pre-populated, not recipient-confirmed]` into the flattened body. Separately, [ADR-0015](../adr/0015-irl-canonical-body-reads-full-workbook.md) / BL-120 discovered and documented the workflow GST partners were already running by hand — research into **Comments (E)**, source pointers into **File Location (D)**, caveats into **Notes (F)**, recipient confirms via **Status** — and taught the tooling to _read_ those columns. **The artifact shape already anticipates this initiative; the vocabulary does not, and nothing writes it.**

**A constraint that shapes every design option**: the Worker sees only its JSON input. It cannot read the operator's attachments, project knowledge, or data room, and no plausible architecture changes that. Population is therefore model-side by necessity — which is why the reference has to be written **at the moment the row is answered**, by the only participant that can see the document. Nothing downstream can reconstruct it later.

#### Decided up front — operator rulings, 2026-08-23

Recorded here so planning starts from them rather than re-opening them:

- **This is an entirely new surface — a new tool and a new prompt, both — and the entire existing path is frozen**: the five IRL tools, both IRL prompts, the `npm run irl:extract` script, and the downstream docs. Zero downstream edits of any kind. Whatever the new surface emits must behave correctly under today's rules exactly as written; conformance runs one direction only. **One deliberate reading, ruled with the production decision below: for shared modules the freeze is behavioral** — `generateIrlXlsxBuffer` ([`src/utils/irl/generate-xlsx.ts`](../../../src/utils/irl/generate-xlsx.ts), a website-workspace module the frozen generator imports) may gain an additive optional prefill parameter, because the frozen tool does not pass it and its output stays byte-identical.
- **Production is server-side, by reuse.** The new tool builds the populated workbook through the same machinery the generator uses — parse → customize → `generateIrlXlsxBuffer` — extended to accept per-row prefill (sourcing into D, the answer into E). Verified 2026-08-23 before ruling: **no existing capability edits a created IRL** — the generator is one-shot and write-only-blank (answer columns emitted empty, Status pre-filled `OPEN`), no tool accepts a workbook as input, and the server never holds the file at all (it returns `{filename, base64, mimeType}` and the client writes it). Filling therefore happens at build time, not by editing afterwards. The populated workbook is delivered exactly as the blank one is, and downstream treats it exactly like a target-returned workbook — which settles the artifact-form question: it is the `.xlsx`, and the existing reconstruction / `irl:extract` paths take it from there unchanged.
- **Sourcing is a reference, not an excerpt.** A succinct document reference plus, where one applies, a within-document locator — `TechDebtRegistryAndRoadmap.pdf` · `page 4, paragraph 2`. Nothing further travels with the row: no quoted excerpts, no confidence grades, no evidence payloads. There is no requirement for more and none should be designed in.
- **Placement: the reference and the locator both go in File Location (D); the answer goes in Comments (E).** No new column — the seven-column contract is untouched. This placement is what makes total conformance achievable (consequence 3 below).
- **Non-document origins are legitimate sources, written as a bracketed token in D** — `[User stated this Jan 4 2026 2pm in session chat]`. So is inference whose inputs are named — `[inferred from FileA.pdf + FileB.xlsx]`. What is not permitted is bare, unattributable inference: an answer the model cannot pin to anything stays unwritten.
- **Rows the evidence cannot answer are left blank.** A blank row is self-evidently unanswered, and the partially populated workbook is itself the follow-up ask. No residual artifact is generated, and none is needed.
- **Where a cell already carries content, extend rather than overwrite**, adding only what is not already present. The fill is idempotent: re-running it over an IRL it has already sourced changes nothing, so a partly-sourced IRL is safe to re-process as further documents arrive.
- **Sourcing is recorded per row**, not as a body-level grade. A real workbook is mixed — partly returned by the target, topped up from the data room — and a single enum over the whole body cannot express that.
- **The check is that the sourcing is present, and its purpose is observability.** The new tool verifies at fill time that every answered row carries a well-shaped D entry; a row carrying one was sourced by an upstream author, a row without one was not. Confirming the referenced file exists anywhere is explicitly **not** in scope — shape, not referent.
- **The new surface stops at the artifact.** It hands the operator a populated IRL; the operator reviews it and then invokes `gst_irl_ingestion` exactly as they would with a target-returned one. A human checkpoint sits between populate and sweep by design — population never auto-invokes the sweep.

Three consequences to carry into planning:

1. **The trail terminates at a document a human opens, not at something the server checks.** `validate_irl_provenance` goes on matching claims against the body, which stays mechanically circular for self-populated rows; what closes the loop is that every such row names a locatable source a reviewer can pull. This is how a diligence footnote has always worked. **Accepted trade, recorded so it is not rediscovered later as a defect.**
2. **Payload stays flat.** Two short cells per row never approaches the measured client tool-result ceiling, so [BL-113](#bl-113-mcp-server--settle-the-client-tool-result-ceiling-candidate) is not a constraint on this initiative — the question it would have bounded was retired by the ruling rather than answered.
3. **The D/E placement is what makes the total freeze workable — it dissolved what an earlier placement made this stanza's sharpest problem.** Under [ADR-0015](../adr/0015-irl-canonical-body-reads-full-workbook.md) the extractor joins **G and E** as the answer span and renders **D** inside `(Source:)`, which the pre-flight and the inclusion gates already treat as non-signal. With reference + locator in D and the answer in E, everything lands where the frozen rules already behave correctly: the sourcing is non-signal, and the answer is signal precisely because the row is genuinely answered. The contract's own edge rule composes too — "D present with no answer → `<NO RESPONSE>`" — and the fill never writes D without E, so a sourced-but-unanswered row cannot arise from the fill and reads correctly if a human later creates one. Two cautions survive: **no em-dash inside D** (the citation excerpt extractor anchors on the _last_ em-dash in a citation, so an em-dash inside `(Source: …)` collapses the excerpt to the tail), and **extending an occupied E mixes partner-authored and GST-derived text in one answer span over a single D cell** — the one place the rulings leave attribution granularity open (open question 2).

#### Acceptance Criteria

Outcome-level on purpose; the mechanism is the planning stage's job.

- [ ] An operator holding evidence but no filled IRL can produce a populated IRL and take it into the existing ingestion sweep without a round trip to the target
- [ ] Every filled row says in File Location (D) what it rests on — a document reference with a locator where one applies, a bracketed non-document origin, or a bracketed named-inputs inference — and a reviewer can go from a dossier claim to the page it came from without asking anyone. **This records what the answer is drawn from, not a rank ordering of who supplied it**
- [ ] A row the evidence cannot answer attributably stays blank — nothing is invented, and the gaps are visible in the artifact itself
- [ ] The emitted artifact is a valid input to the frozen path with zero downstream edits: sourcing renders inside `(Source:)`, answers land in the answer span, and `fillRatio`, the inclusion gates, and citation matching behave correctly without modification — **proven by running the emitted artifact through the existing extractor and pre-flight exactly as they stand**
- [ ] Re-running the fill over an already-sourced IRL changes nothing, and running it over a partially populated one extends without overwriting
- [ ] Population stops at the artifact — it never auto-invokes the sweep, and the operator reviews before ingesting
- [ ] The existing target-returns-a-filled-IRL path is byte-for-byte unchanged — including `generate_information_request_list_xlsx` output remaining byte-identical after the shared builder gains its prefill parameter
- [ ] The fill's bracket grammar does not collide with the manual UAT-07 convention `[pre-populated, not recipient-confirmed]`, which stays valid in the same cells and cannot be edited (docs are inside the freeze)

#### Open questions for planning

1. **The D-cell grammar.** One cell carries a document reference, an optional locator, and the bracketed forms for non-document origins and named-inputs inference. The new tool validates its shape at fill time (regex), the model confirms at authoring time that the reference names something actually in context — and the grammar must avoid em-dashes and stay succinct in a spreadsheet cell. What exactly does the pattern accept, given `TechDebtRegistryAndRoadmap.pdf, page 4, paragraph 2` and `[User stated this Jan 4 2026 2pm in session chat]` are very different shapes?
2. **Attribution granularity when extending an occupied answer cell.** Extending an E that already holds a partner's answer puts partner-authored and GST-derived text in one answer span over a single D cell. Does the appended portion carry its own inline marking, or is per-row granularity accepted as the floor?

#### Explicitly out of scope

- **Live data-room connectors.** No credentials, no integration, no vendor surface. Evidence arrives through the model's context, as it does today.
- **Document parsing or OCR as a server capability.** Same reason as above — the Worker cannot see the files.
- **Anything that lets a row read as what it is not.** A GST-derived row must not read as a target confirmation, and a target's unsourced assertion must not read as sourced evidence. These are the same defect in either direction — a row presenting as something it is not — and naming it is a statement about accuracy, not about which kind of row is worth more.

### BL-136: A production advisory sat red for three days because nothing is watching the audit job

**Source**: post-merge check of PR #427, 2026-08-17 | **Effort**: Small | **Status**: Recorded — **the symptom is fixed, the detection gap is not**

**What happened.** `npm audit (production dependencies only)` failed on master and on all six Dependabot branches from ~2026-08-14 to 2026-08-17 with two high advisories in production dependencies (`js-yaml`, `nanoid` — both transitive, both with an in-range patch published). The gate that [DEVELOPER_TOOLING.md § npm audit policy](DEVELOPER_TOOLING.md) calls "the enforced gate" was therefore not enforcing anything for three days, and it was found by a human glancing at a run list, not by the pipeline. The advisories themselves are cleared; **this item is about the three days, not the two packages.**

**Why nothing fired.** Three independent reasons, each sufficient on its own:

- The job is **not a required status check** (the ruleset requires E2E, Unit & Integration, Lint & Type Check, Verify doc links). A red run blocks no merge.
- It notifies **no one** — no issue, no comment, no Slack. GitHub emails the actor on a failed scheduled run, which is a weak signal buried in ordinary CI mail.
- **Dependabot could not have caught it**: neither package is a declared dependency in either workspace, so version updates never touch them, and `automated-security-fixes` — the mechanism that _does_ handle transitives — reports `{"enabled": false}` for this repo.

**Three candidate responses, not equivalent.**

1. **Turn on Dependabot security updates.** Closes the detection gap at the source and opens a PR per advisory. Cost: more PR churn, and it will open PRs against dev-only advisories too, which policy tolerates deliberately — worth checking whether that can be scoped before enabling.
2. **Make the audit job a required check.** Strongest enforcement, and the honest reading of "must stay at zero". Cost that must be accepted with open eyes: a newly-published upstream CVE then blocks _every_ PR until someone patches, including unrelated work. That is a real operational tax and the reason it is not already required.
3. **Notify on failure.** `deploy-mcp-production.yml` already carries the pattern (`issues: write`, opens an issue on failure). Cheapest, keeps merges unblocked, and converts silence into a tracked artefact — but it is a reminder, not a gate.

(1) and (3) compose well and neither taxes unrelated PRs; (2) is the operator's call about how hard the policy should bite.

**While here**: the same measurement found the doc's dev-tree ledger describing 3 advisories in one chain when the tree carried 9 in two (the `@lhci/cli → … → extract-zip` chain had drifted in unnoticed — dev-only advisories fail nothing, which is the same root cause one layer down). Corrected in the same commit; the wrangler chain has a free in-range fix left to the Dependabot dev-dependencies PR because it moves the deploy toolchain.

**Superseded twice — do not act on that last clause.** _2026-08-21_: the wrangler chain was cleared by pinning `wrangler` at an exact `4.121.0` (its miniflare resolves `undici@7.29.0`, outside the vulnerable range), **not** by merging the Dependabot dev-dependencies PR. _2026-08-22_: BL-137 ([ADR-0020](../adr/0020-workers-types-global-shadowing-immunity.md)) then lifted that pin — wrangler floats on `^4.125.0`, the undici chain was re-measured and is still clear, and the instruction to close wrangler Dependabot PRs no longer applies. See [DEVELOPER_TOOLING.md § npm audit policy](DEVELOPER_TOOLING.md) and [ADR-0020](../adr/0020-workers-types-global-shadowing-immunity.md). Through both changes, the detection gap this item is actually about remains untouched.

**Trigger**: met — this already happened once.

---

### BL-125: The prompt states none of its own run parameters

**Source**: post-deploy production testing of BL-124, 2026-08-14, plus seven rounds of design review | **Effort**: Medium | **Status**: **Implemented 2026-08-14** (prompt `0.26.0` / `0.0.9`, server `0.53.0`, [ADR-0017 amendment](../adr/0017-audit-levels-enforced-in-the-tool-response.md)) — open pending the post-deploy production confirmation, which is the only criterion a test cannot close

**As an** operator invoking `gst_irl_ingestion`, **I want** the arguments I set to actually reach the run **so that** `debug` produces a debug artifact and `requireVerbatimBody` enforces the refusal it promises.

**What it is.** The rendered body never states its own resolved `mode`, `auditLevel` or `transactionContext` — no interpolation of those values exists anywhere in the prompt. The model has to infer them from which sections appeared, and in three production runs out of three it inferred `enhanced`, including one the operator ran at `debug`. It then passed `enhanced` to `compose_dossier_envelope`, the tool withheld `metaFenceMarkdown` exactly as contracted, and `promptVersion` came back `null`. **`auditLevel: debug` is unreachable through the model even when the server renders it.**

`requireVerbatimBody` is worse: fourteen occurrences in `mcp-server/src`, **zero render-time readers**, not even a telemetry counter. The server's refusal reads the value from the tool input the model supplies, and the model has never been shown the operator's. This is the `forceTools` failure ADR-0017 line 14 records — _"the model was told to honour an override it was never shown"_ — but deletion was the right answer there and is the wrong one here, because this flag gates a refusal.

Design review of the fix surfaced two more: `build()` dispatches on body-absence before checking `mode`, so `{mode:'extract-only'}` with no body silently renders the interactive builder; and interactive discards every argument except `auditLevel`, so five supplied values are dropped and the model re-asks for what it was given.

Seven further defects — an untrimmed enum lookup that fails prompt attachment, an anti-balk clause present on 1 of 5 rendered bodies, unframed embedded resources, dangling RUN-AUDIT back-references, `enhanced` being a no-op in interactive mode, an unpopulatable `filledIrl` block in extract-only, and a schema description contradicting the BL-063 partition rule — round out the set. All were invisible while BL-123's halt blocked the paths that expose them.

#### Acceptance Criteria

- [x] Every builder states its own resolved run parameters, selected by the rule **"does this surface have a consumer for the value"** — so `auditLevel` appears in extract-only (its meta fence is model-authored, ADR-0017 line 48) while `requireVerbatimBody` does not (no envelope call, not a fence key, not a RUN-AUDIT field)
- [x] The two prose sites that consume `requireVerbatimBody` point at the stated value rather than asking the model to know an unknowable condition
- [x] Interactive receives the full argument set, and Step 1's tailoring ask is composed from the arguments genuinely absent — stating a value and then asking for it is the defect, not half of it
- [x] Interactive discloses that a supplied `mode: extract-only` was not honored
- [x] `enumFromWire` trims before lookup, matching `booleanFromWire`; the repo-wide guard is extended so no optional enum field on any prompt rejects a whitespace-padded canonical value
- [x] The anti-balk clause covers all five rendered bodies, in a form whose evidence is structural rather than hash-based — the existing clause argues from a directive three of the five never render
- [x] `enhanced` yields the same verification discipline on the interactive path as on the paste path; a (K) footer is never emitted without the blocking self-check that backs it
- [x] The body-hash suite is governed by a stated **coverage rule** — pin builder × level, plus one args-variant per builder at `standard` only — rather than a tally renegotiated per change
- [ ] **Post-deploy production confirmation**: a `debug` sweep returns a meta fence with a non-null `promptVersion`

---

### BL-126: `compute_techpar` is mode-conditional and the prompt never named a mode

**Source**: two production sweeps over the same target, 2026-08-14 | **Effort**: Medium | **Status**: **Implemented 2026-08-15** (prompt `0.27.0`, server `0.54.0`) — open pending the post-deploy determinism confirmation

**As a** partner shipping a dossier to a client, **I want** two runs over the same IRL to agree on the headline verdicts **so that** the artifact is defensible.

**What it was.** Two sweeps over identical IRL bytes produced `rdOpEx` of **$4,391,000 and $8,320,000** — and with it TechPar **32.6% "healthy"** against **47.5% "above the PE ceiling"**, an inverted partner-facing verdict.

Neither run misbehaved. `compute_techpar` computes `rdOpEx` as `engCost + prodCost + toolingCost` in `deepdive` and reads the input directly in `quick`; `mode` is a required enum with no default; and the prompt named no mode at all. Step 4 enumerated the Section-02 components — which are `deepdive` inputs — so a model that obeyed it and picked `quick` held three figures the engine discards and whose `_audit` entries the schema rejects, plus a required `rdOpEx` with no documented source. Folding the components in was the only move left. A model that picked `deepdive` found `rdOpEx` ignored and supplied it anyway, from Section 04.

**Established, and each verified against the artifact that decides:**

- `deepdive` is the only mode the canonical IRL supports: Section 02 asks for the product-personnel and tooling components directly, and supplies the FTE breakdown `engCost` derives from. **No bullet in any section asks for a total R&D OpEx figure**.
- The SOP that owns which-bullet-feeds-which-input had **zero rows** for `rdOpEx`, `rdCapEx`, `engCost` and `exitMultiple`. `engCost` carries an entire prompt rule and still had none, so the asymmetry predated the field that surfaced it.
- **An input with no row does not stay empty.** Both divergences were misroutes of bullets the SOP had _already mapped_ elsewhere — run A pulled the Section-02 `prodCost`/`toolingCost` rows into `rdOpEx`; run C pulled Section 04's `remediationBudget` row across tools entirely. Hence the anti-mappings, not just the rows.

**Not established, and deliberately not acted on**: the ICG 15-vs-3 gap (the two runs used different bodies — confounded), and that `-1` is penalised harder than `0` (it is clamped at `Math.max(0, …)`, so an all-`-1` domain scores as an all-`0` one; that claim came from a tool-description string rather than the engine).

**Withdrawn diagnoses**, recorded because the sequence is the substance: (1) _the annualization audit has an escape hatch_ — run A's `_audit` was never in hand and both candidate derivations reconcile under the proposed check; (2) _the runs cited different sections, so model variance_ — they ran under **different prompt bodies**; (3) _`rdOpEx` has no documented source_ — true but incomplete, checked against the SOP and prompt but not the engine; (4) _Section 04's R&D line is the quick-mode source_ — there is no R&D-total bullet in Section 04.

**The transferable lesson**, which is not a fact about `rdOpEx`: every withdrawal came from checking the artifact that _describes_ an input rather than the one that _decides_. The SOP, the prompt, the tool description and the schema each said something the engine did not.

#### Acceptance Criteria

- [x] `gst_irl_ingestion` names its TechPar mode in **all three** bodies — the first cut reached two, and the interactive builder calls the tool at its own Step 2d. `ENG_COST_DEDUP_RULE` is now shared with extract-only too, since the mode fix makes `engCost` load-bearing there
- [x] The SOP carries mode-conditional rows for all four previously unmapped inputs, plus explicit **anti-mappings** for the two bullet sets that were misrouted
- [x] A blank Section-02 component is surfaced in (J) rather than given invented provenance. Placement moved during review: the instruction is self-contained in `TECHPAR_MODE_RULE`, which renders in all three bodies, rather than in `GAP_LIST_DIRECTIVE`, which the interactive body never receives
- [x] The detection signal (`engPctOfRD: 100` with `prodPctOfRD: null`) is named in the SOP — **as sufficient, not exhaustive**: it fires only when both `prodCost` and `toolingCost` are zero, and a blank `toolingCost` alone leaves no KPI tell at all
- [x] **Post-deploy determinism confirmation** — two `debug` sweeps over identical Kestrel bytes, 2026-08-15. **The inversion is gone; an attributed residual remains.** Both runs chose `mode: "deepdive"` and both passed `rdOpEx: 0` with the sanctioned `Section --` placeholder, so the mode is no longer a free variable and neither run repeated the Section 04 misroute. Synthesized `rdOpEx` came to **$4,678,000 and $4,845,000 — 3.6% apart, against 89% before** ($4,391,000 vs $8,320,000; both percentages quoted against the lower run); `totalTechPct` **33.62 vs 34.32**, 0.70pp apart against 14.9pp; **zone `healthy` both times**, against `healthy` vs `above the PE ceiling`. The partner-facing verdict is stable, which is what the item existed to secure. Exact agreement was not reached and is not achievable **by the mode fix** — every remaining delta sits in a model-derived input, and all of them belong to the `annualizationSource` item below rather than to the mode. Three moved, not one: the `rdOpEx` components together (+$167,000), `infraHostingAnnual` (+$104,000) and `infraPersonnel` (−$80,000, 1,080,000 → 1,000,000). **The headline 0.70pp flatters the result** — the two infra deltas ran opposite and largely cancelled; aligned they would total ~$351,000, about 1.29pp. Verdict stability survives either way, but the gap is wider than the summary figure suggests. `infraPersonnel` is the same **class** of undeclared model derivation — run 2 declared it `estimated-from-headcount`, the same branch as `engCost` — and is not separately worked below. Its factoring is where it gets interesting: 1,080,000 is 9 × 120,000 against the IRL's 9-person infra headcount, while **1,000,000 does not resolve to nine of any round rate** — so the branch run 2 declared says headcount, and the value it supplied does not look derived that way. Either the declaration does not describe the derivation, or the rate is unround; nothing in the payload distinguishes the two. That is the defect of this whole section in miniature, on the one field where the arithmetic happens to expose it. The two-arm fallback (N `full` + N `extract-only`) is **not needed**: it existed to discover where the divergence lived, and these sweeps answer that

**Candidate with a trigger — a consequence this change creates.** Fixing the mode to `deepdive` makes the component audits mandatory, and every `_audit.annualizationSource` value asserts that a derivation happened: **there is no value meaning "the IRL does not supply this"**, and the citation regex demands a 20-character excerpt. **This is reached on every deepdive call, not on the first partly-filled Section 02.** `rdOpEx` and `_audit.rdOpEx` are required in both modes while `deepdive` discards the value, so each call must declare an annualization source for a field with none; the prompt uses `irl-annualized-stated` with a `Section --` citation saying so in words, which is a placeholder the enum forces rather than a claim. A partly-filled Section 02 makes it worse by extending the same problem to figures the engine actually uses. The fix is a TechPar absence source plus nullable money fields and an `extractionOnly` marker, mirroring `tech-debt-audit.ts` — which already solved this one tool over. **Trigger**: met on the first deepdive call after deploy; schedule with the next `compute_techpar` schema change.

**Also recorded, not fixed** — **fixed 2026-08-20, and the note's premise is superseded**: `gst_target_quick_look` is a fourth `compute_techpar` caller and also stated no mode, mentioning quick-mode audit handling only in a parenthetical. This note said its shape differs (form inputs, no IRL) so it needs its own call rather than this rule. That was right when written and is no longer: under [ADR-0019](../adr/0019-irl-extract-record-subject-indexing.md) the prompt carries `irlEvidencePrecedence()`, so there _is_ IRL-shaped evidence available to it, and the mode is now branch-conditional — `quick` with no evidence (nothing supplies the Section 02 components, so `deepdive` would sum three zeros), `deepdive` with a record present, where `TECHPAR_MODE_RULE` is imported rather than paraphrased, with an explicit adaptation note mapping its "(J)" and dossier directives onto quick-look's own disclosure output. The same pass added the `_audit` sibling `estimate_tech_debt_cost` requires — that call had been **failing validation as written** — and its `irl-absent` + null / `extractionOnly` branch. Both defects are proven by execution in `mcp-server/tests/integration/irl-extract-record-consumers.test.ts` rather than by reading, which is this stanza's own transferable lesson applied. (The BL-126 plan's claim that `gst_irl_ingestion` was the only caller leaving the mode unstated was wrong, and remains recorded as such.) And the `rdOpEx` synthesis branch is duplicated at `src/utils/techpar-engine.ts:229` and `:374-376`, so a future change to the synthesis rule has two sites. Website-workspace engine code, outside this item's surface.

**Still open, separately**: `_audit.annualizationSource`'s `estimated-from-anchor` and `estimated-from-headcount` branches require only a citation — no multiplier, no anchor, nothing the handler can check. A real hole, and **not** this divergence's cause. **Trigger**: an undeclared multiplier observed in the wild, or a new caller of those branches.

**That trigger is now met, and the two post-fix sweeps of 2026-08-15 isolate it to a single number.** Both runs took `estimated-from-headcount` for `engCost` and both applied `ENG_COST_DEDUP_RULE` correctly — 42 total engineering less the 9-person Infra/DevOps/DBA group. Both results factor cleanly — **$3,630,000 = 33 × $110,000** and **$3,795,000 = 33 × $115,000** — though the factors are inferred, not declared, which is the finding: **the branch has nowhere to declare either term.** `estimated-from-headcount` requires `annualizationSource` and a citation and nothing else, while the module JSDoc documents it as _"derived from team × salary"_ and asks for neither factor.

**A required headcount and rate would not be sufficient on their own.** IRL Section 07 states base-salary bands and says in terms _"base salary only (not fully-loaded)"_, and the audit cannot distinguish a base figure passed straight through from a base figure marked up — that indistinguishability is the defect. And the basis is stated everywhere except where it would bind. The Hub form tells the human user outright — _"Annual fully-loaded"_ on the engineering-cost input (`src/pages/hub/tools/techpar/index.astro:752-754`) — and the canonical IRL asks bullet 7-03 for _"Average fully-loaded engineering salary"_, which is the very bullet the target answered with base bands. But **`fully-loaded` appears in no schema in either workspace**: `src/schemas/techpar.ts:175` describes `engCost` in full as _"Annual engineering personnel cost (dollars). Used only in `deepdive` mode."_ — a mode note and no basis. The basis is asked for and displayed, and never reaches the wire contract, so nothing the audit sees carries it — which is why a fix needs the **basis** declared alongside the two factors. Note that the SOP is not a substitute cite: it routes _"Average fully-loaded engineering salary"_ to Tech Debt Calculator `salary`, not TechPar `engCost` (`src/data/library/irl-tool-input-mapping/article.md:117`, and its byte-identical twin), consistent with this stanza's own finding of zero `engCost` rows.

_(Two corrections in this paragraph, both the failure mode BL-126 is about. It first asserted the schema field **was** fully-loaded — reading a semantic off the artifact that describes rather than the one that decides. The correction then claimed `irl-ingestion.ts:951` was the **only** statement of the basis on the surface; the string occurs in fourteen files across `src/` and `mcp-server/src/`, twenty tracked repo-wide. An unchecked absence claim is the same error in negative form — and a count asserted inside a note about unchecked claims needs its scope stated, which the first draft of this parenthetical also omitted.)_

**DROPPED 2026-08-15 — won't-fix by operator decision, and this paragraph scopes ONLY the `engCost` disclosure gap above; the `infraHostingAnnual` finding that follows stays open.** _"No one will notice it."_ The residual is ~4% on `rdOpEx` with the zone verdict stable, and the disclosure work it would take is not worth that. Recorded so a met trigger stops reading like scheduled work — **including the "the shape of the fix is already in the file" line further down this stanza**, which describes a fix that will not be built. (Everything below about `engCost` is evidence, not a plan.)

**A second, cleaner instance on `infraHostingAnnual`, where the divergence is the method itself.** Run 1 took `ytd-annualized-with-period` (`ytdMonths: 3`, `ytdMathCheck` anchoring $292,000/mo against $850,000 YTD) and derived $850,000 ÷ 3 × 12 = **$3,400,000**. Run 2 took `monthly-x12` on the same monthly anchor: $292,000 × 12 = **$3,504,000**. Both are arithmetically exact and both cite real IRL anchors (bullet 3-02 carries the $292K/mo and the $850K YTD figures).

**A selection rule already exists, and run 2 ignored it.** Step 4 directs _"monthly hosting + infra spend (Section 03 — annualize the 3-month average)"_ — run 1 is exactly that; run 2 took the Apr-26 point figure × 12 instead. Both runs rendered the full body, so both received it — run 1's `debug` meta fence records `"mode": "full"` directly, and run 2 is established structurally rather than assumed: `build()` dispatched to the interactive builder only when `filledIrl` was absent (the dispatch rule as it stood on 2026-08-15; it consults `mode` on both branches since [ADR-0019](../adr/0019-irl-extract-record-subject-indexing.md), which does not change this inference — both runs supplied a body), both runs supplied it, and `extract-only` invokes no analysis tools while both runs returned a real `compute_techpar` `outputSummary`. `full` is the only remaining branch. So the defect is not a missing rule: it is a rule that **renders in one body only** — the string occurs exactly once in `irl-ingestion.ts`, so the extract-only and interactive builders never see it — and that **failed to bind even where it did render**. `TECHPAR_MODE_RULE` took the opposite route in BL-126: hoisted into the shared `extraction-rules` module, interpolated into all three bodies, and it bound in both runs. That contrast is the cheap fix, and a cheaper one than the schema work above.

**On audit strength**, which the pairing settles: run 1 used the strongest branch in the schema and passed its handler-verified cross-check (292,000 × 3 = 876,000 against 850,000 reported, 3.1% — inside the 10% tolerance at `techpar-audit.ts:288`). The check confirmed the arithmetic and was structurally unable to say the method was the wrong one to pick. **A cross-check validates a derivation; it cannot adjudicate between two valid derivations** — so validation is the wrong instrument here regardless of how much of it is added.

**A third instance was considered and withdrawn**, recorded because the withdrawal is the useful part. Run 2's `_audit.rdCapEx` declared `irl-annualized-stated` on a zero value under `capexView: "gaap"`, where the engine excludes the field from `total` (`src/utils/techpar-engine.ts:233-235`), and this read as the model generalizing the sanctioned `rdOpEx` placeholder to a second field. Two facts refute it outright: `_audit.rdCapEx` is `monetaryFieldAuditSchema` and **required in both modes** (`techpar-audit.ts:186`), so it was compelled rather than volunteered; and `TECHPAR_MODE_RULE` scopes its exception to _"the rule below"_, which governs `engCost` / `prodCost` / `toolingCost` — `rdCapEx` was never inside the rule allegedly generalized. A third consideration is weaker and is recorded as such: IRL bullet 3-08 (_"hosting/infrastructure is consumed as cloud opex … not capitalized"_) shows a defensible basis was **available**, but it concerns infrastructure capex while `rdCapEx` is capitalized R&D, so it does not establish which basis was actually used. The claim also rested on a pasted excerpt read as complete when `citation` is required on that schema, which is the same overclaim corrected two paragraphs up.

The same payload carries its own control: `infraHostingAnnual` used `ytd-annualized-with-period` and was therefore forced to declare `ytdMonths: 3` **and** a `ytdMathCheck` naming both the monthly anchor and the YTD reported amount — arithmetic a handler can verify. Two fields, one call, opposite audit strength. `estimated-from-headcount` is documented in the module JSDoc as _"derived from team × salary"_ and requires neither term.

This is also the residual variance source the mode fix could not reach: with `mode` pinned, `rdOpEx` is synthesized from three components, and `engCost` — the largest — remains a model derivation with two free parameters and no declaration. **The shape of the fix is already in the file**: mirror the `ytdMonths` / `ytdMathCheck` precedent with a required headcount and rate on this branch.

---

### BL-129: `assess_infrastructure_cost_governance` is the only IRL-fed scoring tool with no `_audit`

**Source**: BL-126 design review, 2026-08-15 | **Effort**: Medium | **Status**: Recorded — needs a design pass, not a schema edit

**What it is.** `generate_diligence_agenda`, `compute_techpar` and `estimate_tech_debt_cost` each carry an `_audit` sibling. ICG takes `answers` and `companyStage` and nothing else — twenty score-bearing inputs with zero provenance. This is structural and does not depend on the confounded 15-vs-3 observation.

**Three blockers a design must clear**, all found before any code was written:

- **`gst_target_quick_look` is a live caller with no IRL**, mandating a complete 20-key map where `-1` is the contractually correct "I don't know". A citation-or-silence rule is unsatisfiable there. TechPar already solved this: the `Section -- — partner-supplied form input` escape and `buildPartnerSuppliedTechParAudit()`.

  **Premise shifted 2026-08-20 ([ADR-0019](../adr/0019-irl-extract-record-subject-indexing.md)), the same way BL-126's `:620` note shifted.** "No IRL" is no longer the only state that prompt runs in: it now carries `irlEvidencePrecedence()`, so an IRL extract record can be present in its context and its TechPar and tech-debt calls are already branch-conditional on that. The blocker is **not dissolved** — the no-evidence branch still exists and a citation-or-silence rule is still unsatisfiable there — but the design question narrows: it is now "what does an ICG answer cite when evidence IS present", with the no-evidence branch keeping the `Section --` escape it already has. The adjacency blocker below is untouched and remains the harder one; ICG's Step 1a is deliberately the one quick-look step the record change left alone, for exactly that reason.

- **The dominant seeding mode is adjacency inference.** All five `ICG_SEEDING_RULES` mappings score something no bullet states, so a citation requirement is satisfiable only by citing a bullet that does not support the assertion — corrupting the signal the audit exists to create.
- **Key omission is free.** An absent key scores 0 while `-1` scores −1, so an audit on present keys makes deletion strictly dominant.

**The opening question is a design question, not a schema one**: what are the legitimate provenance modes for a seeded answer — direct citation, named adjacency inference, partner-supplied form input, genuine silence?

**Trigger**: after BL-126's post-deploy confirmation, since the same instrument measures both.

---

### BL-130: `fillRatio` is model-asserted and nothing checks it — not even against itself

**Source**: BL-126 post-deploy run, 2026-08-15 | **Effort**: Small | **Status**: **Implemented 2026-08-15** (prompt `0.28.0`, server `0.55.0`, [ADR-0018 scope amendment](../adr/0018-body-integrity-and-capped-provenance.md)) — **derived, not validated**, and narrower than "the number is now checked"

**Closed by derivation rather than the check this stanza proposed.** `percent` and `status` are pure functions of the other two fields, so `compose_dossier_envelope` recomputes them and the derived values govern the meta fence; a disagreement appends a `provenance-gap:` entry naming both figures and directing a section (A) restatement. Rejection was designed first and discarded: the pre-flight rounds before applying the thresholds, so a run at 39.6% correctly reports `40 / ok`, and a raw-ratio check would have refused that compliant run on a partner-facing path.

**Check (2) as written here is superseded.** This stanza specifies "`status` against `percent`"; the implementation anchors status to the rounded `substantiveCells / totalCells` instead, because checking a model-asserted status against a model-asserted percent lets a true 39.1% ship as `40 / ok` with both arms passing.

**Two limits, both narrower than the stanza's framing.** `metaFenceMarkdown` renders at `auditLevel: debug` only, so below that the gap entry is the entire disclosure and extract-only is uncovered (it never calls the tool). And the model took its halt/partial branch before this tool was called — derivation makes the artifact correct, it does not change the branch the run took. **Check (3) — recounting against the re-hydrated body — stays open** and is the one that would.

**One implementation note worth keeping.** The incoherent-counts guard (`substantiveCells > totalCells`, which the schema permits and which would derive >100) is carried primarily by returning `NaN`, not by the exclusive branch: a mutation removing the `else` alone leaves the suite green, because `NaN > 1` is false. Removing both is what turns it red. The code comment says so rather than claiming coverage the test lacks.

**What it is.** The meta fence's `fixtureFillRatio` is whatever the model passed in. `compose_dossier_envelope` renders `input.fillRatio.percent / 100` (`mcp-server/src/schemas/compose-dossier-envelope.ts:599`) and measures nothing.

Three checks are absent, in increasing order of cost:

1. **`percent` against `substantiveCells / totalCells`** — arithmetic on three numbers the model already supplies. The schema range-checks each field (`:129-155`) and there is **no `.refine()` or `.superRefine()` anywhere in the file**.
2. **`status` against `percent`** — the enum's own `.describe()` states the thresholds (`halt` <15, `partial` 15–40, `ok` otherwise) and nothing enforces them, so a halt-ratio run can self-report `ok` and proceed past the wrong-IRL guard.
3. **`substantiveCells` / `totalCells` against the body** — the handler already re-hydrates `filledIrl` from the cache on the BL-076 path for provenance verification, so the body is in hand at the moment the number is rendered.

**Observed.** The run reported `0.84`; counting the pasted body directly gives **115 substantive of 134 request bullets = 0.858**. The delta is judgment about `[PARTIAL]` rows rather than miscounting, and it changed no behavior (`status: ok`, `gatesElided: []`, all nine gates passed). That is precisely why it is worth recording: the field is load-bearing for the halt and partial-IRL branches and for the first sentence of (A) that the partner reads, and it currently carries no more authority than the model's word. The operator also observed it lower than a prior run over identical bytes; that prior value was not captured, so the **established** finding is the divergence from ground truth, not a run-to-run delta of known size.

Same class as BL-126: a number the model derives over bytes the server holds, with nothing positioned to catch it. Unlike `rdOpEx` the first two fixes are pure arithmetic on inputs already present.

**Trigger**: met. Checks (1) and (2) need no design pass. Check (3) does — what counts as a substantive answer span is prose judgment, per the `substantiveCells` `.describe()`, so a server-side count must reproduce the composed Response + Comments span rule or it will disagree with the model for legitimate reasons.

---

### BL-131: The prompt mandates citing article numbers the regulation data does not contain

**Source**: BL-126 post-deploy run, 2026-08-15 | **Effort**: Small | **Status**: **Implemented 2026-08-15** (prompt `0.28.0`)

**Closed by removing the instruction.** Step 3 and section (F) now direct quoting `keyRequirements` bullets verbatim and identifying each framework by name + `effectiveDate`; the do-not-invent clause — the load-bearing half, and the one the production model actually obeyed — is kept. The corpus fact is now stated inline in the prompt so a future run does not re-derive it.

**The "decide which before writing either" question below was already answered, in [BL-110](#bl-110-mcp-server--jurisdiction-filter-granularity-candidate).** `BACKLOG.md` BL-110 records both that `Article`/`Art.` appears 0 times across all 123 records — with an explicit _"do not re-derive it as a defect"_ — and why authoring citations into those records is not the durable fix: _"a model-generated article number is worse than a blank one: a blank invites verification, a wrong citation suppresses it."_ This item is a genuinely different finding (the **prompt instructing** citation, versus BL-110's **probe criterion demanding** it), so it is not a re-derivation — but **BL-110 carries an open operator action, "amend the probe's citation criterion", which fixing the prompt does NOT close.**

**What it is.** `mcp-server/src/prompts/irl-ingestion.ts:949` (Step 3) closes with _"Cite article numbers verbatim when summarizing obligations; do NOT invent citations beyond what the framework bodies return"_, and `:999` (section (F)) repeats _"citing verbatim article numbers"_.

The regulation records carry `id`, `name`, `summary`, `category`, `regions`, `effectiveDate`, `keyRequirements`, `penalties`. **No article numbers.** Zero of the 123 files under `src/data/regulatory-map/` contain a reference in any form — `Article N`, `Art. N`, or `§ N`.

So the instruction is satisfiable only by invention, sitting inside the prompt whose entire audit architecture exists to prevent invention. The two halves of the same sentence contradict each other: cite article numbers verbatim, but do not invent beyond what the bodies return — and the bodies return none.

**Observed**: the production model declined, summarised from `keyRequirements` instead, and reported the instruction as unsatisfiable. That is the correct refusal, reached unaided — but nothing makes it the likely resolution, and a run that resolves the contradiction the other way produces fabricated legal citations in a partner-facing dossier.

**Scope**: two sites, both in `irl-ingestion.ts`. `regulatory-exposure-brief.ts` does not carry the instruction, and no doc claims the dataset has article numbers.

**Two fixes, not equivalent.** Drop the instruction and cite `keyRequirements` text — cheap and honest, loses precision. Or add article numbers to the dataset — 123 files, real research, and a provenance story of its own. Decide which before writing either.

**Trigger**: met.

---

### BL-132: `search_portfolio`'s deeplink description promises fidelity the encoder deliberately withholds

**Source**: BL-126 post-deploy run, 2026-08-15 | **Effort**: Small | **Status**: Recorded

**What it is.** The tool description (`mcp-server/src/tools/portfolio.ts:56`) says the response returns _"a `deeplink` URL that opens /ma-portfolio pre-filtered to the same filter state"_. For a batched query it does not: `buildPortfolioDeeplink` passes `input.theme[0]` and `input.engagement[0]` (`:76-85`), so a four-theme two-side query yields a URL filtered to the first of each.

The collapse is deliberate and documented in the source comment (BL-064 — the website URL contract is single-value, and widening it needs coordinated changes to `src/utils/portfolio-url.ts` plus the page's hydration logic). **The defect is the description, not the encoder.** The sibling tool already gets this right: `mcp-server/src/tools/regulations.ts:40` states that when arrays carry more than one element the `filterDeeplink` **omits** that filter, and tells the caller to use single-value filters when the link must mirror the query exactly.

**Observed**: the production model passed the link through verbatim rather than hand-building a URL — correct — and flagged the mismatch itself. An agent that trusted the description would present a link narrowed to one theme as the query it actually ran.

**Fix**: state the first-element collapse in the description, mirroring the regulations wording. While there, weigh the honest alternative — omitting the filter entirely when batched, as regulations does — since a link filtered to one of four themes misleads more than a link filtered to none.

**Trigger**: none needed; a description edit.

---

### BL-134: The BL-063 partition guard catches double-listing and cannot catch mis-routing

**Source**: production `gst_irl_ingestion` run, 2026-08-15 | **Effort**: Medium | **Status**: Recorded — **trigger met**

**What it is.** `checkBl063Partition` (`mcp-server/src/schemas/compose-dossier-envelope.ts:1005`) throws when a framework appears in **both** `conditionalTriggersFired` and `defaultFiredFrameworks`. Its matching is robust — `normalizeFrameworkName` strips every non-alphanumeric, so `EU_AI_ACT` and `EU AI Act` both normalize to `euaiact` and a duplicate cannot dodge it on formatting.

But the function returns early when **either** array is empty, and more fundamentally it only ever compares the two lists to each other. **Move a framework out of `conditionalTriggersFired` into `defaultFiredFrameworks` and there is nothing to overlap**, so the call passes clean: no error, no auto-appended gap entry, no signal of any kind.

**Observed.** A production run placed `EU AI Act` in `defaultFiredFrameworks` and omitted it from `conditionalTriggersFired`. The run passed, and the model reported in its own footnote that the contract _"appears no longer to hold"_ and that default-firing was _"the more accurate representation when Section 09 names it explicitly"_. It had inferred permission from silence — reasonably, since a schema that rejects one arrangement and accepts another is making a statement.

**The contract says the opposite, in the prompt body the model was reading.** Not only the `conditionalTriggersFired` `.describe()` (`:285`) but the run's own directives: `mcp-server/src/prompts/irl-ingestion.ts:718` states _"a framework cannot appear in BOTH … When a framework is both a conditional trigger that fired AND named in Section 09, put it in `fired` only"_, and `mcp-server/src/docs/tools/irl-pipeline/CONTRACT.md:189` says the same and already names the EU AI Act as the case that hits it. **So "inferred permission from silence" understates it — there was no silence.** The model contravened an explicit directive and read the absence of _enforcement_ as evidence the directive had lapsed. (One qualification on reach: `:718` sits inside `RUN_AUDIT_DIRECTIVE` (`:625-738`) and is therefore `debug`-gated in the full body and absent from interactive, so "the prompt body the model was reading" holds only for a `debug` run and this run's `auditLevel` was not recorded. The `.describe()` at `:285` ships in the tool schema on every run regardless, so the directive reached the model on any run whose client renders schema descriptions.)

**And the corrected `:285` was live when the run happened — checked, because the alternative would have inverted this finding.** That text landed in `a36b2bba` (2026-08-14) as BL-125 #8, replacing a description that contradicted the partition rule in both clauses — _"fired DESPITE not being in Section 09"_ and _"Do NOT list frameworks that ARE in Section 09"_ (`schemas/compose-dossier-envelope.ts:278-284`). **The model's rationale is close to a restatement of that old clause**, so had it been the deployed text, this run would have been _obeying_ the description and the item would be "the BL-125 #8 fix has not reached production" instead. It had: `a36b2bba` is an ancestor of `2b2b1716`, whose production deploy **completed 2026-08-15T15:49:44Z** (started 15:38:04Z). The ordering does not rest on the run's own clock, which is just as well — `promptVersion 0.27.0` enters the tree in `01cea0d1` and reaches master only inside `2b2b1716`, so same-session sweeps reporting `0.27.0` were necessarily served by the **completed** deploy of that bundle. Two timing traps are worth spelling out, since this paragraph exists because timestamps mislead here: PR #420's own deploy of `fd21437f` was **cancelled** by latest-wins concurrency two seconds after the newer run started, so the merge carrying the `:285` fix never deployed under its own name — its content reached production inside `2b2b1716`, whose deploy **started** 68 minutes after that merge and **completed** 11 minutes after that, 79 minutes out. And that gap is the second trap: a deploy's start time is not its completion time, and pairing a start-to-start interval with a completion verb is the same conflation this paragraph is warning about. That matters for the fix: adding prompt prose would restate a rule the surface already carries three times (`:285`, `:718`, `CONTRACT.md:189`). And the split between what is _stated_ and what is _enforced_ runs right through those cites — the **routing** half ("a fired framework belongs in `fired` only") is what all three say and what the model broke, while `:1342` states only the **overlap** half, as do the `defaultFiredFrameworks` `.describe()` (`mcp-server/src/schemas/compose-dossier-envelope.ts:313`) and `CONTRACT.md:187`. Overlap is the only half the guard implements.

**A cheaper fix candidate exists, and locating it correctly depends on which surfaces actually reach the model.** Three places tell it that Section-09 frameworks belong in `defaultFiredFrameworks`, all illustrated exclusively with non-triggers, so the model's rationale — _"the more accurate representation when Section 09 names it explicitly"_ — is a syntactically valid reading of any of them: `irl-ingestion.ts:714`, the interactive copy at `:1342`, and `schemas/compose-dossier-envelope.ts:313`.

**But the prompt is not silent on the criterion, which weakens the candidate before it is credited.** The field's own template line carries a by-path exclusion: `:663` renders `defaultFiredFrameworks: [… — frameworks fired via Section-09 evidence path, **NOT conditional-trigger evaluation**…]`, and the interactive template repeats it at `:1323`. **The model wrote `EU AI Act` into a field annotated with that exclusion** — carrying the same reach caveat as everything else here, since `:663` is inside `RUN_AUDIT_DIRECTIVE` too, so the sentence holds for a `debug` run and this run's `auditLevel` was not captured. **That is settleable on the next report and should be**: for any run that produced an envelope, the RUN-AUDIT block renders at `debug` only, so a report quoting it is strong evidence the run was `debug` — evidence rather than proof, because a model can emit a block no directive rendered, which is plausible precisely because this stanza set records models following directives that do not apply to them. (The rule needs that qualifier — extract-only includes `RUN_AUDIT_DIRECTIVE` unconditionally at `:1135` and would emit the block at every level, which is BL-128's second instance two paragraphs down. It never composes, so it cannot mis-date a report about an envelope run.) This report was prose, so it does not date itself. Resolving it also retires BL-128's identical caveat.

What is missing is only the _contrastive_ half — `CONTRACT.md:187`'s _"not by whether Section 09 happens to name it"_, the clause that names the wrong criterion rather than the right one. Porting it is worth testing; if the run was `debug`, it is also evidence that a prose carve-out on a line that already excludes by path is not self-evidently sufficient.

**And the fix targeting inverts once the gating is applied.** `RUN_AUDIT_DIRECTIVE` spans `:625-738`, so `:663`, `:714`, `:717` and `:718` are **all inside it** — debug-only in the full body, unconditional in extract-only (the mode that never calls the tool), absent from interactive, whose copies at `:1323`/`:1342` sit in the equally-gated Step 5. So porting the clause into `:714`/`:1342` reaches `debug` runs only, while porting it into `schemas:313` ships in the tool schema on **every run**, to every client that renders schema descriptions. That is the same conclusion BL-128 reaches when it lands on `emitInstructions` over prompt prose, arrived at independently.

**The tidiest statement of the whole finding is a `.describe()` pair.** `:285` (routing — correct, carves the both-case) and `:313` (Section-09 framing — no carve-out) sit in the same file, ship in the tool schema on every run and to every client that renders schema descriptions — not a bare assumption: `a36b2bba` records that _"the description is served on the wire in `tools/list`, so a cold caller reads it first"_, and the BL-125 #8 comment at `schemas:278-284` attributes an observed production behaviour to that description's wording — and only one of them handles a framework that is named in Section 09 _and_ is a named trigger. That is where the clause belongs.

**Pin it with a test when it lands.** Nothing currently guards the routing rule as prose: grepping `mcp-server/tests` for the `.describe()`'s own wording returns zero hits, so `:285` — the statement this item treats as authoritative — is unprotected against drift, and a ported carve-out at `:313` would start out the same way. A one-line assertion in the existing `BL-063 defaultFiredFrameworks enforcement` block (`tests/unit/schemas/compose-dossier-envelope.test.ts:719`) pins both, and converts part of a prose-only mitigation into something a test holds.

Two caveats kept explicit. **Nothing establishes which surface the model actually read** — this is a candidate to test first, not a diagnosis. And a ported clause is still **unenforced prose**: it leaves the guard exactly as blind as this item says it is, so it is a mitigation and not a closure.

BL-063 exists because the distinction is load-bearing: a conditionally-triggered framework is one the sweep **discovered** against a partner IRL that failed to list it, and collapsing it into the default set erases exactly the finding the trigger was built to produce.

**Why this is not simply "add a stricter check."** The server cannot tell mis-routing from a legitimately-absent trigger by inspecting the two arrays — that is the information the arrays do not carry. It _could_ evaluate the trigger predicates itself: the body is already cached and re-hydrated in this handler for provenance verification, and both predicates are anchored to named IRL sections — `EU_AI_ACT` is _"Section 05 names any production ML/AI capability AND Section 00 geographies include the EU"_, `NIS2` is _"Section 00 geographies include the EU AND Section 01 **product description** names a regulated sector covered by NIS2 Annex I or II"_ (`mcp-server/src/prompts/extraction-rules.ts:117`, `:128`). Anchored is not the same as mechanical: deciding whether a product description "names a regulated sector" is judgment over free prose, so a server-side evaluator would be reproducing an inference, not reading a field. That would make the trigger set server-derived rather than model-asserted, which is the same move BL-071 made for `precheck.iterations` and the one BL-130 proposes for `fillRatio`. **The opening question is whether the predicates are cheaply evaluable server-side, or whether the fix is a narrower assertion** — e.g. requiring the model to state, per default-fired framework, that no conditional predicate applied to it.

**Trigger**: met.

---

### BL-128: The RUN-AUDIT reporting contract exists twice, and the trigger to dedupe it has fired

**Source**: BL-125 implementation + code review, 2026-08-14 | **Effort**: Medium | **Status**: **CLOSED WON'T-FIX 2026-08-15** — trigger met, cost lands on maintenance rather than on any client

**Closed by decision.** The operator's call: _"costs my time, not yours."_ The duplication is real and the trigger did fire; what it buys is not worth the change. Recorded rather than pruned because three things stay true after closing, and a future session should find them stated rather than rediscover them:

- **Production models will keep reporting the self-count shape and `countersScope: run` as defects.** Each report costs a re-derivation. Three separate runs have now done it.
- **The strongest finding here is untouched, and a merge would not have fixed it.** Both copies are `debug`-gated while the numbers ship at every level, so below `debug` the coverage gap stands: `mode: full` names the counter fields without explaining them, and interactive mentions them nowhere. The remedy this stanza itself identifies — moving the explanation into `emitInstructions` — is not a prompt change and remains available. BL-130 has since edited that exact surface, which lowers the cost of doing it.
- ~~**Instance 2 stands**: extract-only carries copy-verbatim-from-`compose_dossier_envelope` wording in a mode that never calls it. `RUN_AUDIT_DIRECTIVE`'s null-run bullet partially covers it, so it is salience rather than contradiction.~~ **Closed 2026-08-20** by the IRL extract record change (prompt `0.29.0`, [ADR-0019](../adr/0019-irl-extract-record-subject-indexing.md)), which is the "next substantive `gst_irl_ingestion` body change" this stanza scheduled it with. Reworded, never deleted, exactly as the framing note below requires: `RUN_AUDIT_DIRECTIVE` gains ONE bullet stating the extract-only value of every envelope-sourced field (`firstEnvelopeCall: null`, `countersScope: null`, `toolCallCounts: {}`, `toolErrors: []`, the precheck block zeroed, `promptVersion` from the Run parameters block, `filledIrl` still measured), plus scope qualifiers on the two inline `copy VERBATIM` comments. Thirteen conditional rewrites were rejected in favour of stating the values once. Every field is still emitted and the five BL-121 assertions still hold. **Instance 1 — the interactive body's inline Step 5 copy — is untouched and this stanza stays CLOSED WON'T-FIX for it**; so does the coverage gap below `debug`, whose remedy is `emitInstructions`, not a prompt edit.

**One framing to not carry forward.** The triage that opened this described the fix as _deleting_ the dead references. That is wrong and this stanza never said it: extract-only **emits** a RUN-AUDIT block at every level, the directive states `DO NOT omit any field. Operators parse this verbatim with field-presence assertions`, and five BL-121 assertions pin exactly that. The fields are load-bearing; only the copy-from-tool wording is wrong. A future attempt should reword, never delete.

**What it is.** `RUN_AUDIT_DIRECTIVE` and the interactive body's inline Step 5 are two renderings of one reporting contract. `irl-ingestion.ts` argues against exactly this in its own comments ("two copies of one reporting contract only drift"), and BL-125 scoped the dedupe out with the trigger _"the next edit that would have to be made twice."_

**That trigger fired inside BL-125 itself**: the null-run `filledIrl` rule was written once in the shared directive and once in the interactive copy, in the same commit that named the trigger. Recording it rather than leaving it silently unfired is the point — an unfired trigger on a met condition is how deferred work becomes invisible.

**A second instance to fix at the same time.** The extract-only body carries 13 `compose_dossier_envelope` references inside the shared RUN-AUDIT and meta-fence directives — including an instruction to copy `toolCallCounts` verbatim from that tool's output, in a mode that never calls it. That is the same defect class BL-125 closed for the run-parameter bullets (`copiesToEnvelopeCall`), left standing in the directives those bullets sit beside. Deduping the contract is what makes it fixable in one place instead of thirteen.

**A third instance — and it inverts on inspection, which is the finding.** Production models keep reporting two `serverToolCallCounts` behaviours as defects: that the envelope's own entry shows fewer successes than attempts, and that the counts reach past the current conversation. Both are correct behaviour, and **the contract already says so, in three places**:

- `mcp-server/src/prompts/irl-ingestion.ts:699` — _"Note the envelope tool itself shows `attempted: N, succeeded: N-1` in its own snapshot (in-flight while computing)"_, present since BL-071 and repeated in the interactive copy at `:1338`.
- `:698` and `:1338` — `run` is _"every call against this IRL body covered, across requests, for a 4-hour window; **keyed by the body, not by your invocation**"_.
- `mcp-server/src/docs/tools/irl-pipeline/CONTRACT.md:217`, `:219`, `:229` — both again, naming the key (`mcp:irl-run-counts:<irlBodyHash>`), the 4h TTL, and the merge semantics that produce the N−1 shape.

**But where those notes render does not match where the numbers go, and that mismatch is the actual defect.** Both live inside `RUN_AUDIT_DIRECTIVE` (`:625`), which has exactly **two** render sites: the full body at `:1024`, gated on `showRunAudit` (= `auditLevel === 'debug'`, `:847`), and extract-only at `:1135`, unconditional — the one mode that never calls the tool, which is the second instance above. Interactive does not render the const at all; it carries its own inline Step 5 copy under the same `debug` gate (`:1171`, `:1283`), which is this stanza's first instance.

The numbers ship at **every** level regardless: `serverToolCallCounts` and `countersScope` are attached with no audit-level condition (`mcp-server/src/tools/compose-dossier-envelope.ts:155-157`).

**So it is two problems stacked, not one.** At `debug`, the notes sit in the same list as the transcription instruction, so a model that misreads them was not short of proximity — a salience problem, and the harder of the two. Below `debug` it is a plain coverage gap, and it deepens by body:

- **`mode: full`** names both fields at every level via `buildEnvelopeCompositionDirective` (`:595-601`), with only the transcription rules `debug`-scoped — so the model knows the fields exist but gets neither note explaining them.
- **Interactive** is worse and is the strongest instance: `buildEnvelopeCompositionDirective` is used **only** by the full body (`:1022`), so an interactive run below `debug` receives the counters with the fields mentioned **nowhere in its body at all**.

**Three options.** The strongest is not _only_ a prompt edit: put the explanation where the numbers are, in `emitInstructions` (`mcp-server/src/schemas/compose-dossier-envelope.ts:1370`, assigned unconditionally; builder at `:687`), which reaches every audit level and every client **on every run that calls the tool** — precisely the set of runs that has counters to misread. Note it is not free: `emitInstructions` has **zero** references anywhere in `mcp-server/src/prompts/`, so nothing currently tells the model the field exists, and landing this plausibly costs one prompt clause pointing at it. Second, rename the wire label the misread turns on — `run` reads as "session" where `irl-body` would encode the derivation; it is a client-visible enum, so it costs a migration. Third and explicitly rejected: changing the self-count semantic, which `CONTRACT.md:217` argues against directly ("consumers must not correct this value"). A cheap `debug`-scoped stopgap also exists: in the RUN-AUDIT YAML template, `:650` (`countersScope`) and `:651` (`toolCallCounts`) both already carry inline `# BL-121:` / `# BL-071:` comments, and the row that would host the N−1 note — `compose_dossier_envelope` at `:653` — is the only one of the three without one. It reaches only the level that already has the notes, so it is a stopgap and not an option. Deduping is what lets any of these land once instead of twice.

_One caveat on the evidence: "models report them as bugs anyway" holds only for `debug` runs, since below that the notes are absent and there is nothing to have misread. The runs behind this stanza had no `auditLevel` recorded, and `mcp-server/src/docs/prompts/irl-ingestion.md` notes it was inferred wrong in three production runs of three — so capture the level with the next report before leaning on that inference._

> _Correction, 2026-08-15._ This paragraph previously claimed the contract "never says" these things and that the self-count shape was **always** `{attempted: 1, succeeded: 0}`. Both were wrong, and the diagnosis first offered for the second one — that it generalised from the only run then observed — was wrong too. `CONTRACT.md:229` already documented the re-call shape, and `tests/integration/bl-071-precheck-derivation.test.ts:381` has asserted `{attempted: 2, succeeded: 1}` since BL-121. The error was not over-generalising an observation; it was **asserting a repo fact without running the search**, which is the class this stanza's neighbours document. Recorded rather than quietly rewritten, because a note filed against unchecked claims that contains three of them is evidence about how easily the habit survives being named. **A fourth and a fifth followed.** The fourth claimed the notes and the transcription instruction were the same list, so a model with counts to report had necessarily just read them — checking two render sites and not the condition on either. The fifth is worse in kind: the repair for the fourth placed `RUN_AUDIT_DIRECTIVE` in the interactive body on a reviewer's say-so, when the grep already run in that same session returned exactly two sites and neither was interactive. **A claim adopted from a review is still a claim**, and this one contradicted evidence already in hand. The same repair also quoted the `:606-609` comment ("ships at every audit level") as describing `RUN_AUDIT_DIRECTIVE`; its antecedent is the envelope-composition directive, so the quote asserted the exact inverse of the gating being documented — a wrong-antecedent error, the same class as `12a31c6a` earlier in this series.

**Trigger**: met, and **discharged for instance 2 on 2026-08-20** — the IRL extract record change was that next substantive body change, and it carried the version bump and the hash rebaseline as predicted. The stanza stays CLOSED WON'T-FIX for instance 1 and for the below-`debug` coverage gap; neither acquired a new trigger.

---

### BL-124: The flattened-body refusal blocked every working path

**Source**: production runs 2026-08-14, immediately after BL-123 deployed | **Effort**: Medium | **Status**: **Implemented 2026-08-14** (prompt `0.25.0` / server `0.52.0`, [ADR-0018 § Re-validation](../adr/0018-body-integrity-and-capped-provenance.md)) — open pending the post-deploy production confirmation

**As an** operator running the IRL sweep from Claude Desktop, **I want** the prompt to accept the inputs my client actually sends **so that** I have a working path to a dossier at any IRL size.

**What it was.** BL-123 refused a body whose line breaks the client had collapsed. Within a day of deploy it emerged that the harm had been asserted, never demonstrated — `normalizeForMatching` collapses whitespace before matching, so flattening cannot change a verification verdict; nothing else reads line structure; and the hash-bind exists to catch model _paraphrase_, which flattening is not. Meanwhile the refusal fired at every realistic IRL size (smallest repo fixture 4,256 B against a 2,000 B floor), and its own remediation could not carry a large body. **Operators went from one working path to none.**

Forcing operators onto the interactive path then exposed two pre-existing defects nobody had hit while paste worked: blank form fields (`""`) failed schema validation and broke prompt attachment entirely, and a large body cannot reach `prepare_irl_body` in one turn. A third surfaced in the run logs — a client-approval failure had no sanctioned `errorClass`, so a model invented one.

**The `irlSource` cap from BL-123 is untouched** — it fixes a real hole (the model grading its own run) and its pass-through arm is production-verified.

#### Acceptance Criteria

- [x] A flattened body is processed normally at every entry point, keeping full `partner-paste-verbatim-prepop` grade
- [x] The refusal is not reinstated behind `requireVerbatimBody` — that flag's guarantee is "not a model reconstruction", which a flattened body satisfies
- [x] The newline count survives as an operator diagnostic (`serverCachedBodyNewlines` / `filledIrl.newlines`), explaining a hash that will not match a source file
- [x] Blank form fields no longer break prompt attachment, on this prompt and the one sibling with the same defect
- [x] A repo-wide guard asserts that **no optional argument on any registered prompt** either rejects or retains an empty string — the invariant, not nine one-off cases. It probes each FIELD schema rather than the whole object, so prompts carrying a required argument are covered too, and it exempts fields with a `.default(...)`, which resolve to a value by design. Zero offenders across all nine prompts; the next prompt to ship this defect fails in CI rather than in an operator's client
- [x] `stringFromWire` does not trim — a trimmed body would change the binding hash and break the very comparison the diagnostic exists to support
- [x] The interactive body sanctions splitting a large `prepare_irl_body` call into its own turn
- [x] An undelivered client call is excluded from `toolErrors` and included in `precheck.errorsEncountered`, preserving both arithmetic identities
- [x] ADR-0018 carries the reversal in its title, status and index row — not only in an appended note
- [x] **Post-deploy production confirmation**: a Desktop paste completes end-to-end and the RUN-AUDIT block shows `newlines: 0` — **confirmed 2026-08-14**. A 51,787-byte flattened paste (141 newlines collapsed, trailing one dropped) bound `740d907b75139083`, ran the full sweep at `irlSource: partner-paste-verbatim-prepop` uncapped, `hashBindResult: pass-bound`, 58/58 claims verified, 0 auto-appended provenance gaps. The same sweep surfaced the defects now tracked as [BL-125](#bl-125-the-prompt-states-none-of-its-own-run-parameters)

---

### BL-123: `gst_irl_ingestion` takes its inputs and its own provenance claims on trust

**Source**: production run 2026-08-13 (Kestrel IRL) — hash mismatch investigation | **Effort**: Medium | **Status**: **Implemented 2026-08-13; the refusal half REVERTED 2026-08-14 by [BL-124](#bl-124-the-flattened-body-refusal-blocked-every-working-path). The `irlSource` cap stands and is production-verified.** (prompt `0.24.0` / server `0.51.0`, [ADR-0018](../adr/0018-body-integrity-and-capped-provenance.md)) — open pending the post-deploy production confirmation, which is the only criterion a test cannot close

**As an** operator running the IRL sweep from a real client, **I want** the server to refuse a body the client destroyed on the way in and to compute the provenance grade itself **so that** a dossier cannot look clean while resting on mangled input or on a claim nobody checked.

**What it is.** Four findings in one surface, sharing one theme: the prompt trusts claims about its own inputs — from the client, and from the model.

1. **Claude Desktop flattens `filledIrl` and nothing notices.** Every prompt-argument field renders as a single-line `<input>`, so a pasted multi-line markdown IRL loses every newline. Reproduced against the production artifact: 141 newlines → 0, byte length −1, content differing at **140 positions**. The server hashes what it received and reports it honestly; the markdown structure the dossier depends on is simply gone. Same reader-collapse shape as the six status-page defects [BL-122](#bl-122-mcp-server--misc-ux-pass-audit-levels-prompt-doc-status-page--closed-2026-08-13) closed — a degraded input converted into a plausible success before anything downstream can see it. Repair is impossible: `\n → " "` is lossy.
2. **The provenance grade is model-asserted, and its evidence is a copyable string.** `irlSource: partner-paste-verbatim-prepop` rests on the _presence_ of the `**Body-binding hash:**` directive, which survives export — so a replayed payload asserts the strong form. Narrower than first framed: outside the 4-hour TTL a replay fails loudly, and inside it the bytes really are partner-supplied. What is forgeable is the claim that _this run_ was freshly invoked — and the fact that the grade is self-reported at all. BL-121 already did this conversion for `toolCallCounts`; `irlSource` never got it.
3. **The VDR article is embedded whole on every render** — 16.3 KB for a 9-row folder-label table.
4. **Argument descriptions bury the default past the form's truncation point.** Six of eight fields; an operator reading `requireVerbatimBody` never learns it defaults to false.

**Scope correction worth keeping.** Three further payload cuts were investigated and rejected on evidence: the workbook column contract is mandated in every body by [ADR-0015](../adr/0015-irl-canonical-body-reads-full-workbook.md) and the wrong-IRL pre-flight depends on its vocabulary; Steps 1b/4a/6a were deliberately retained by BL-086 as fabrication guards and total ~7.5 KB, not the 20.2 KB an early measurement suggested. Recorded so they are not re-proposed.

#### Acceptance Criteria

- [~] ~~A structurally destroyed body is refused at every entry point~~ — **superseded by BL-124.** It was, and it was verified in production; then the refusal was withdrawn because the harm was never demonstrated and it blocked every working path.
- [~] ~~The refusal test is narrow and certain~~ — **superseded by BL-124.** The narrowness was right; refusing at all was not.
- [x] `irlSource` is **capped** by server-held provenance metadata rather than derived from it — an asserted `-prepop` is downgraded when the metadata says otherwise, reconstruction claims pass through untouched, and nothing is ever promoted
- [x] The `requireVerbatimBody` gate still rejects a reconstruction run (the inversion an early design would have shipped)
- [x] The provenance grade stops being a claim nobody checks — an over-strong `-prepop` is caught when the server's own record contradicts it, and an unverifiable one is disclosed rather than accepted silently. **Deliberately not claimed**: a payload replayed inside the 4-hour TTL against a render-minted entry still reads `-prepop`, because the record says the render wrote those bytes and that remains true. `mintedAt` is recorded and surfaced but never compared for freshness. Closing that would need a per-render nonce, which is a separate decision — see [ADR-0018](../adr/0018-body-integrity-and-capped-provenance.md) § Context for why the replay severity is narrower than it first reads
- [x] The provenance store degrades quietly when unavailable and never falls back to in-memory on the Worker
- [x] Every argument description leads with its valid values and its default, ahead of the prose
- [x] The VDR taxonomy is inlined with a drift guard against the canonical Library article
- [x] The operator-facing newline hazard is documented in both IRL runbooks
- [x] Payload reduction measured and reported as actuals, not the estimate — **153.8 KB → 139.5 KB** on the production artifact; a refused body renders 1.8 KB in one message
- [ ] **Post-deploy production confirmation**: a fresh Desktop invocation showing the halt fires on a pasted multi-line body and the capped grade appears

---

### ~~BL-121: The server-authoritative tool-call counter could not survive the Worker~~ — CLOSED 2026-08-12

**Status**: **Closed in the session that opened it** (prompt `0.22.4` / server `0.49.3`, [ADR-0016](../adr/0016-run-scoped-durable-tool-call-counters.md)). Recorded rather than pruned because the failure mode is a repeat and the fix carries an accepted residual.

**What it was.** BL-071 made the server authoritative for tool-call counts so the `BL-045-VERIFY` block would stop depending on the model's memory of its own behaviour, and pinned the operator check `precheck.iterations === serverToolCallCounts.validate_irl_provenance.succeeded`. That identity holds on stdio. **On the remote Worker it cannot**: `createServer` runs per HTTP request, so a fresh `InMemoryToolCallCounters` is built for every call and the envelope's snapshot can only ever contain the request it is inside.

Surfaced by a production run (Kestrel IRL, 2026-08-12): the envelope reported `validate_irl_provenance` as all-`null` while the model honestly reported `precheck.iterations: 2`. The model was right to refuse to invent the numbers — which left the field as a model assertion, the exact thing BL-071 existed to eliminate, on the transport the team actually uses.

**Three compounding failures, one class — a stdio-shaped claim written as universal.** The prompt asserted the identity holds, with a reason (registered exactly once, so nothing double-counts) that is true and irrelevant to why it fails. It told operators to fail runs on drift against a check that could not pass. And `bl-071-precheck-derivation.test.ts` claimed to prove it while **sharing one counter map across handlers** — a correct stdio test read as universal. The stand-in reproduced the assumption instead of the topology, which is why production found this and the suite did not. The same file had already learned the lesson for BL-076, whose body cache moved to Upstash _because_ isolates rotate between requests; the counters were left behind.

**What shipped.** Durable per-run counters in Upstash (`mcp:irl-run-counts:<irlBodyHash>`, 4 h TTL, `HINCRBY` at wrapper exit, `retry: false`, fail-quiet), a `countersScope` field on the envelope output (`session` / `run` / `request`) so every regime that cannot support the identity says so, and a prompt (`0.22.4`) that states each identity conditionally, pins the transport-classed `errorsEncountered` labels to a closed subset, and enumerates the three causes of a short count. The Worker-topology tests drive **two `createServer` calls sharing one durable store** — hand-building two metrics contexts would have re-encoded the blind spot that hid the bug.

**Two accepted residuals, both named rather than fixed.** A write lost mid-run in an _earlier_ request under-reports while scope still reads `run` — a **false red** an operator investigates and traces to a brownout. And a repeat ingestion of **identical bytes** inside the 4h window accumulates onto the same row, so the count reads long of that invocation; making it per-invocation would need an invocation id, which is the speculative half this change declined, and would dissolve the cross-request continuity that is the point. Both are documented in the prompt, the ADR, `CONTRACT.md` and UAT-07, and the second is executed in the integration suite. The first draft enumerated three causes of a count _short_ of memory and none for a count _long_ of it — asymmetric coverage of a symmetric failure, caught in review, and the same over-claiming this ticket exists to correct.

**Verified live against production 2026-08-13** (`0.49.3` / `gitSha 4c6ec58`, prompt `0.22.4`), over the remote Worker via four separate MCP requests — `prepare_irl_body`, two `validate_irl_provenance` calls, then `compose_dossier_envelope`. This mattered because every automated test runs against a fake Redis and a _simulated_ per-request topology, and a simulation standing in for the real transport is what hid the defect in the first place.

A run against the same endpoint ~15 minutes earlier, before the production approval gate was released, captured the defect itself: `serverToolCallCounts` held only `compose_dossier_envelope: {attempted: 1, succeeded: 0}`, `validate_irl_provenance` was absent despite two verified calls moments before, and no `countersScope` field existed. After the deploy:

```json
"serverToolCallCounts": {
  "prepare_irl_body":         { "attempted": 1, "succeeded": 1 },
  "validate_irl_provenance":  { "attempted": 2, "succeeded": 2 },
  "compose_dossier_envelope": { "attempted": 1, "succeeded": 0 }
},
"countersScope": "run"
```

The BL-071 identity holds across requests, the canary row is present, and the envelope correctly reports itself in-flight. A re-call then returned `compose_dossier_envelope: {attempted: 2, succeeded: 1}` with `validate_irl_provenance` unchanged at `{2, 2}` — the merge rule adding durable counts to the in-flight attempt without double-counting, which `CONTRACT.md` and UAT-07 document and which had until then only been executed against a fake.

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

- [ ] Request-access form/CTA (name, firm, use case, email) delivering to the operator — ~~explicitly NOT self-serve credential issuance~~ and NOT a user directory (preserves ADR-0008's pre-registration / no-DCR stance). **Amended 2026-08-15**: self-serve credential issuance after payment is now in scope under [BL-133](#bl-133-payments-platform--automated-mcp-access-checkout-on-cloudflare), which amends ADR-0008 for that bounded case. The no-user-directory / no-DCR half of this AC stands
- [ ] CSP compliance: the site pins `form-action 'self'` and an explicit `connect-src` — an external form endpoint or submission API must be added to the allowlist in BOTH `vercel.json` and `src/middleware.ts`, per [`SECURITY_HEADERS.md`](../security/SECURITY_HEADERS.md)
- [ ] BL-004 coordination: the form either builds on BL-004's email-capture service selection (form UX, WCAG 2.1 AA, error states, zero client-side PII) or records the deliberate divergence here; either way `src/pages/privacy.astro` gains the data-collection disclosure (BL-004's privacy AC applies to this form too)

> 🟢 **Provisioning automation shipped 2026-08-02** as [`mcp-server/scripts/provision-client.mjs`](../../../mcp-server/scripts/provision-client.mjs) (`npm run provision:client`), with a `.d.mts` sidecar, helper + CLI-smoke suites under `mcp-server/tests/unit/scripts/`, and a parity test binding its tier/scope mirrors to `src/ratelimit/tiers.ts` and `src/oauth/provider.ts`. The wrapper exists for guardrails the admin API does not provide: it **requires** `--tier` (the API resolves an absent tier to `free-pilot` silently) and **validates scopes** (the API accepts any non-empty array, so `tool:portfolo:*` would provision a client that can call nothing). Three pre-existing runbook defects were fixed in the same change: PILOT_ONBOARDING gave the M2M revoke route as `/admin/oauth/clients/<id>` (the provider-client route — 404s for an `m2m_*` id); both it and AUTH.md still described per-client tiers as unenforced, stale since Slice 5; and § 3 promised clients that **every** tool call is audited, which contradicts this backlog's own 🟡 disposition above (capture is best-effort at the enqueue hop). The runbook and the generated email now both say "tool calls are written", with the fail-closed seam named as the lever for a client who contracts guaranteed capture.
>
> **Observation for a later slice**: the script has no `--jwks-file` flag on purpose. `createM2mClient` mints and hashes a `clientSecret` unconditionally, and `/token` takes the `private_key_jwt` branch only when a `client_assertion` is presented — so registering a JWKS does **not** disable secret auth. A flag implying otherwise would silently discard a live, unrecoverable secret. Genuinely secret-less M2M clients need a server change first; JWKS registration stays on the AUTH.md curl path until then.

- [x] One-command operator provisioning script (`mcp-server/scripts/`) wrapping the existing admin API (`POST /admin/oauth/m2m-clients` — `mcp-server/src/oauth/m2m-clients.ts`, `mcp-server/src/admin/oauth-clients.ts`): creates the client, assigns scopes + tier, and emits a ready-to-send onboarding email (credential hand-off note, REMOTE_CLIENT_SETUP link, the guarantees list from PILOT_ONBOARDING § 3) — ✅ the email deliberately **excludes** the client secret, which is printed to the terminal once instead; putting it in a mail draft would undo the "secret exists only in the creation response" property
- [x] Script defaults mirror the PILOT_ONBOARDING guardrails: minimum scopes, `tool:radar:*` excluded unless explicitly flagged, tier required, admin key via env var never inline (Directive 15) — ✅ and deliberately stricter on two counts: `resource:radar:read` is gated by `--allow-radar` too (it reads the same Inoreader-funded snapshot and sits inside the exported `DEFAULT_SCOPES`), and there is no `--admin-key` flag at all
- [~] [`PILOT_ONBOARDING.md`](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md) updated: manual curl replaced by the script; request-access intake feeds its step 0 — 🟡 **curl replaced; intake half pending**: § 0 now names the intake and what it must supply, but it describes today's operator-inbox reality. It closes when the request-access form above ships and delivers into it — **or** when [BL-133](#bl-133-payments-platform--automated-mcp-access-checkout-on-cloudflare) Slice 3 lands, whose self-serve purchase intake supersedes the form as the primary path and carries the § 0 rewrite as its own AC. Whichever ships first closes this.

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
  - **Public checkout / webhook-driven tier automation** — ~~trigger: request-access volume makes operator-driven invoicing the bottleneck~~ **no longer out of scope**: the operator made a fresh go-decision on 2026-08-15 without waiting for the volume trigger, and it is now filed as [BL-133](#bl-133-payments-platform--automated-mcp-access-checkout-on-cloudflare). The invoice-first payments ACs above stand for negotiated/enterprise deals; BL-133 owns the card-and-webhook path. Note this decision addresses only the payments bullet — self-serve _signup_/DCR, usage-metered billing, and SLA ratification all remain out of scope as recorded

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

**Standing caution**: an unreproduced single-test failure in the mcp suite, now seen **twice**, name never captured either time. It fits the documented workerd cold-start flake but that remains an explanation, not evidence.

- **2026-08-04** — `1 failed | 1973 passed`; seven other full runs green.
- **2026-08-17** — `1 failed | 2391 passed`, during the BL-136 lockfile work. Two later runs passed, **including one deliberately executed against the pre-change lockfile** (stash the lockfile, reinstall, re-run), which is what rules the dependency bump out as the cause. Not the cold-start case either: an earlier `test:mcp` the same session had already passed 2392, so the worker was warm.

**If a red mcp run appears, capture the failing test name before rerunning** — a rerun destroys it. The 2026-08-17 instance was lost a step earlier than that: the suite was run through a `| grep "Test Files|Tests "` pipe, so the name was discarded before anyone could read it. **Redirect the run to a file and grep the file.**

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

### BL-122: MCP Server — misc UX pass (audit levels, prompt doc, status page) — CLOSED 2026-08-13

**Source**: operator review of `gst_irl_ingestion` and `status.mcp.globalstrategic.tech` | **Effort**: ~1 day | **Status**: Closed — shipped at prompt 0.23.0 / server 0.50.0 | **Architecture**: [ADR-0017](../adr/0017-audit-levels-enforced-in-the-tool-response.md)

**As a** partner running an IRL ingestion, **I want** the dossier to read as a client deliverable by default and the status page to publish only numbers that mean what they say, **so that** I am not hand-stripping audit apparatus out of partner-facing output, or reading a latency panel that cannot measure latency.

**Retained rather than pruned** because three of its findings are the kind that get re-derived expensively:

1. **`verbosity: compact` was broken in the opposite direction from how it read.** It elided the _correctness_ pipeline (hash bind, provenance precheck, envelope composition) while keeping the operator artifacts on — so it disabled the provenance chain and then demanded an audit report on it. Making it the default, which is what the request originally asked for, would have shipped dossiers with provenance verification silently off. The generalisable lesson: when one switch controls three concerns, check which of them it is actually wired to before flipping its default.
2. **`forceTools` had never worked.** Its value was read once for a telemetry counter and never interpolated into the prompt body, so the model was told to honour an override it was never shown. An argument can be fully plumbed at the schema layer, fully documented, and still be inert.
3. **The status page's zeros were not missing data.** Cloudflare Workers freeze the clock outside I/O, so `Date.now() - startedAt` measures I/O wait and reports exactly `0` for any handler that performs no I/O. Ten of fifteen tools read 0 with healthy sample counts. The number is unfixable — there is no unfrozen timer in a Worker — so the panel was relabelled to what it measures and rows with no measurable wait are omitted.

#### Acceptance Criteria

- [x] `auditLevel: 'standard' | 'enhanced' | 'debug'` replaces `verbosity`, defaulting to a clean partner-facing dossier
- [x] The envelope chain runs at every audit level — no argument value can switch provenance verification off
- [x] Suppression is enforced by what `compose_dossier_envelope` returns, not by prompt prose (the mechanism this codebase already established does not work)
- [x] `extract-only` is exempt from the gate; the rule is stated on the builder axis, since `build()` dispatches on `filledIrl` absence before any mode check
- [x] `forceTools` and `embedToolWorkedExamples` removed; `forceToolsApplied` retained on the envelope input for callers that genuinely override a gate
- [x] Argument surface 10 → 8, `filledIrl` at index 0, every description leading with its valid values and naming no backlog ids
- [x] `prompts/irl-ingestion.md` rewritten so no bare backlog id carries meaning; ids confined to a closing archaeology ledger
- [x] Status page: latency panel relabelled, filtered on `p99 > 0` at render, with the two empty states distinguishable; audit panel hidden while `AUDIT_QUEUE` is unbound
- [x] Alert table gained a fourth state: a rule that could not reach its data source renders `unknown` (slate) rather than a green `ok`, so an unverified check stops looking like a passing one. Two arms that hid it behind a fabricated default were found in review — `radar-snapshot-stale` (null age) and `inoreader-budget-exhausted` (unread counters reported as `0/100`)
- [x] Operator runbooks migrated — signoff runs invoke `auditLevel: debug`

#### Technical Context

- The filter is on the **measurement**, not a tool-name allowlist: the query is `GROUP BY blob2` with no tool list in the code, so an allowlist would drift the first time a tool gained or lost an I/O path. `p99` not `p50`, so a cache-miss-only network path survives.
- It is applied at **render**, never in `computeToolLatency`: `toolLatency === []` has to keep meaning "no events in the window", or the page asserts zero invocations in a window that had hundreds.
- `BL-045-VERIFY` → `RUN-AUDIT` in live code and docs. Historical ledgers keep the old label deliberately — renaming a dated record falsifies it.

---

### BL-087: `gst_irl_ingestion` — Prompt-Shrink L3–L5 (reserved)

**Source**: reserved successor scope from BL-086 (Option D workflow simplification, L2 verified + shipped 2026-06-30 at prompt v0.19.0 / mcp-server 0.32.0). BL-086 deliberately **stopped at L2**; the three deeper cuts were deferred here pending empirical evidence. | **Architecture & plan**: [MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086.md](_archive/MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086.md) (§ L3–L5 + capability-preservation matrix) | **Status**: Reserved — do NOT start without a promotion trigger firing

**Deferred scope**:

- **L3** — (J) gap-list semantic change (more honest gap reporting; shifts operator readability). Ships with a `precheckCitations` restore arg. **Still reserved.**
- ~~**L4** — VERIFY-block removal from default output.~~ **SHIPPED under BL-122 (2026-08-13)**, together with the `auditLevel` sugar below. The asymmetric risk it flagged — "external consumers of the VERIFY audit surface can't be proven absent" — was real and materialised _internally_: `OPERATOR_RUNBOOK.md`'s client-ready gating checklist reads that block. It shipped with a coordinated migration rather than a silent removal (signoff runs invoke `auditLevel: debug`), not because the risk was absent but because it was found and paid.
- **L5** — `validate_irl_provenance` tool unregistration — the only non-arg-reversible cut. **Still reserved, and now harder**: BL-122 made the envelope precheck unconditional, so the verifier is on the critical path at every audit level. Unregistering it would remove a tool the prompt now always directs.
- ~~Sugar: collapse the restore args into an `auditLevel` enum if both L3 and L4 ship.~~ **Shipped under BL-122** — taken with L4 alone rather than waiting for L3, because the restore-arg-per-cut shape was the thing making the surface complex. Note the stated precondition (both L3 and L4) was therefore _not_ met; recorded so the deviation is visible rather than inferred.

**Promotion triggers** (any one):

- Empirical evidence that (J) gap-list growth is unacceptable in live exercises (L3)
- ~~Confirmation that no one consumes the VERIFY block externally (unlocks L4)~~ — fired 2026-08-13; see BL-122
- Evidence that nobody manually calls `validate_irl_provenance` (unlocks L5) — note this is now a higher bar, since the precheck directs it on every run

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
