# Development Backlog

Consolidated backlog of open development initiatives for the GST website. Each item is a self-contained user story with enough context to design and implement a solution. Items are grouped by theme, not priority — triage happens separately.

> **Completed and closed items**: 30 items were completed or closed through April 2026 (BL-002, 003, 008–019, 021–026, 027–030, 036–041). Use `git log` to find their original acceptance criteria and technical context.
>
> **BL-034** was previously closed and has been re-opened with new scope as the MCP-server doc-cleanup catch-all (April 2026). The historical BL-034 contents are reachable via `git log -- src/docs/development/BACKLOG.md`.

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

### BL-042: TechPar PresetInput Component Extraction

**Source**: Follow-up from the BL-032.8 / techpar chip↔input bidirectional-sync bug fix (2026-05-21) | **Effort**: Medium (~half a day) | **Status**: Done (branch `feature/bl-042-preset-input-extraction`, 2026-06-01)

**As a** developer maintaining TechPar (or adding a similar preset+input control to another tool), **I want** the chip group + numeric input + bidirectional sync logic encapsulated in a single reusable `<PresetInput>` Astro component **so that** future controls auto-enroll into both directions of the chip↔input contract without relying on an implicit DOM-convention protocol enforced by a page-level orchestrator.

#### Acceptance Criteria — all met

- [x] New `src/components/techpar/PresetInput.astro` renders chips + input wrap as one unit; takes `inputName`, `presets`, `prefix/suffix`, `min/max/step`, `initialValue`, `inputClasses`, `chipGroupAttr`, `chipsOnly` as props. Labels and hints stay at page level because they vary per control.
- [x] Component's hoisted `<script>` walks `[data-preset-input]` roots once after DOM parse and wires the bidirectional sync per instance — no dependency on a page-level helper.
- [x] All 9 cost preset controls in `src/pages/hub/tools/techpar/index.astro` (exitMult, infra, infraPers, rdOpEx, rdEng, rdProd, rdTool, engFTE, rdCapEx) replaced with `<PresetInput .../>` instances (10 instances counting the infra monthly + chipsOnly annual companion).
- [x] Cost-input listener loop in `src/utils/techpar-ui.ts:358-380` removed. `syncCostChips()` in `src/utils/techpar/dom.ts` was replaced by `paintCostChips()` (same logic, called explicitly from `hydrateFromUrl()` to avoid event-dispatch fan-out).
- [x] E2E `tests/e2e/techpar.test.ts § "Cost preset chip ↔ input sync"` selectors preserved; new unit test `tests/unit/preset-input.test.ts` locks the component contract in jsdom.
- [x] No visual regression: infra DOM order was reordered (annual chipsOnly companion now renders BEFORE the monthly+input pair) so the visible chip group sits above the input in both monthly and annual modes.

---

### BL-043: Information Request List (IRL)

**Source**: Sales/value-creation enablement (May 2026) | **Architecture & plan**: [MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md) | **Effort**: 5-7 days | **Status**: Done (merged via PR #158, 2026-05-22; sequel BL-044 landed 2026-05-24) | **Fast-tracked**

**As a** GST partner running a diligence or value-creation engagement, **I want** a single, universal, one-page Information Request List I can hand to a target (buy-side), client (sell-side preparation), or portfolio company (value-creation) **so that** the answers flow back into our Hub diligence tools and MCP prompts with high-fidelity inputs — turning the Diligence Machine's defensive `'unknown'`-mode agendas into precise ones and letting MCP/agent contexts scope to "everything we need to know about a target" via one pinned Resource.

> **Implementation plan**: see [MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md) for the full design — three-surface architecture (Library article + MCP Resource + MCP Prompt), single-source-of-truth drift policy (Astro page imports `article.md` directly), testing strategy compliant with `TEST_STRATEGY.md` pyramid and `TEST_BEST_PRACTICES.md` anti-patterns, documentation update inventory, and the senior-consultant content-review gate.

#### Planning Criteria

**Use cases**

- **Buy-side intake** — hand the target a structured request list at kickoff so the diligence team receives data in a form the Hub tools can ingest directly. Eliminates the partner having to mentally translate sales-call notes into `TechParInputs` / `ICGInputs` / `UserInputs` shapes.
- **Sell-side preparation** — clients populating their own VDR can use the IRL as a checklist that mirrors the canonical [VDR taxonomy](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md#content-structure), surfacing gaps before a buyer points them out.
- **Value-creation baseline** — post-close, a portfolio company's filled IRL becomes the cold-start baseline for the 100-day roadmap and first-12-months platform-investment plan.
- **Agent context scoping** — pinned `gst://library/information-request-list` Resource gives Claude Desktop / OpenClaw / BL-033 pilot agents a versatile substrate to scope "all the partner-supplied facts about a target" in one read.
- **Inventory for future tools** — the internal [`mcp-server/src/docs/library/irl-tool-input-mapping.md`](../../../mcp-server/src/docs/library/irl-tool-input-mapping.md) doc tracks which Hub-tool / MCP-prompt inputs each IRL bullet feeds; when a new tool ships, the mapping surfaces gaps.

**Outcomes**

- Universal one-page artifact at `/hub/library/information-request-list/` (Hub) + `gst://library/information-request-list` (MCP Resource) + `/gst_information_request_list` (MCP Prompt) — all three shipped in one PR (per user direction).
- Astro Hub page imports the canonical `article.md` directly (via `getHeadings` + `Content`); no content duplication between partner-facing print and agent-facing Resource bytes.
- Diligence Machine `'unknown'` sentinel widening becomes the exception, not the rule, for engagements where the IRL was filled.
- Internal tool-input mapping doc is a permanent maintenance discipline — every new Hub tool or MCP prompt that needs partner-supplied input either matches an existing IRL bullet or adds one in the same PR.

**Business value**

- **Reduces partner overhead** by eliminating the mental translation step between unstructured sales-call notes and canonical Hub-tool inputs.
- **MCP/Agent enablement** for BL-033 pilot clients — pilot teams can pin one Resource to scope an engagement's full intake surface; no per-pilot context-engineering required.
- **Brand-bearing artifact** — printed PDF is a partner-presentable deliverable in the GST voice; reinforces the firm's "structured-information-first" posture in early client conversations.
- **Compounds with existing prompts** — `gst_information_request_list` is the _request_ side of the diligence-intake loop; pair with `gst_diligence_kickoff` once filled. (Historical: the original framing also paired this with `gst_vdr_audit` for the response audit; that prompt was retired 2026-05-31 via BL-036 Tier 3.)

#### Acceptance Criteria

**Library article + MCP Resource**

- [x] `src/data/library/information-request-list/article.md` — canonical one-pager, 10 sections (00 Basics + 01-09 mirroring VDR-9), ~67 bullets, request-style voice.
- [x] `mcp-server/src/content/library-loader.ts` — `LIBRARY_METADATA` gains the new entry; codegen auto-picks it up via `mcp-server/scripts/generate-regulations-index.mjs`.
- [x] `mcp-server/src/resources/library.ts` — no edit needed; existing `registerLibraryResources` iterator wraps the new entry in `readThroughCache` automatically.

**Hub page**

- [x] `src/pages/hub/library/information-request-list/index.astro` — imports `article.md` via Astro's markdown loader (`Content` + `getHeadings`); single source of truth.
- [x] `src/pages/hub/library/index.astro` — gains a card linking to the new article. Three real cards confirmed laying out at 1280/768/480.
- [x] Print CSS: each h2 starts a new page; TOC and back-link hidden on print (mirrors the VDR Structure Guide print pattern).

**MCP Prompt**

- [x] `mcp-server/src/prompts/information-request-list.ts` — `gst_information_request_list` (v0.0.1, `lastReviewedAt: 2026-05-21`, `orchestrates: ['gst://library/information-request-list']`). Embeds the canonical Resource as the second message.
- [x] Three optional args: `targetName`, `transactionContext` (sell-side / buy-side / value-creation / unknown), `productSummary`. Empty payload → interactive mode.
- [x] Registered in `ALL_PROMPTS` at `mcp-server/src/prompts/_registry.ts` (now 9 prompts).
- [x] Boot-time invariant checks pass (`assertPromptInvariants` validates `version` semver, `lastReviewedAt` freshness, `orchestrates` non-empty).
- [x] Description explicitly contrasts with `gst_diligence_kickoff` to disambiguate slash-menu picks.

**Test coverage**

- [x] Per-prompt unit test (`mcp-server/tests/unit/prompts/information-request-list.test.ts`) — 16 cases covering schema accept/reject paths, body content per mode, `orchestrates` invariant, Resource embed shape, voice-cue differentiation. Tests follow TEST_BEST_PRACTICES.md § 1 (explicit error-path assertions, no false-positives).
- [x] Hub-page E2E (`tests/e2e/hub-library-information-request-list.test.ts`) — 5 cases covering section-heading rendering, TOC-anchor mapping, library-index card navigation, back-link, in-page TOC click → viewport. Tests follow TEST_BEST_PRACTICES.md § 3 (no arbitrary timeouts), § 12 (`waitUntil: 'domcontentloaded'`), § 25 (deep readiness gate).
- [x] Golden-file snapshot at `mcp-server/tests/examples/information-request-list.golden.md` — frontmatter correct (golden-snapshots test passes); body is a DRAFT to be overwritten with senior-consultant live-exercise capture during Step 5.5.
- [x] Existing manifest-stability + resource-URI-stability + protocol-roundtrip tests updated for the new Library URI + 9th prompt (manifest hash `9d5738f4…`).

**Documentation**

- [x] `mcp-server/BREAKING_CHANGES.md` — `0.2.0` entry documenting the additive change (Library URI + Prompt added; minor bump per the additive-change discipline).
- [x] `mcp-server/package.json` — bumped `0.1.0 → 0.2.0`.
- [x] `mcp-server/README.md` — prompts inventory adds row for `gst_information_request_list`; Resources table adds row for `gst://library/information-request-list`; count updated 8 → 9 prompts, 128 → 129 Resources.
- [x] `mcp-server/src/docs/prompts/README.md` — close-line `Last updated` bumped.
- [x] `mcp-server/src/docs/library/irl-tool-input-mapping.md` — internal SOP mapping every IRL bullet to the Hub tool / MCP prompt input(s) it feeds. Maintained in lockstep with `article.md`.
- [x] `src/docs/development/MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md` — implementation tracking doc with live-state checkboxes.

**Senior-consultant content review**

- [x] Senior-consultant pass completed pre-PR-#158 merge; article surface has received 10+ post-ship refinement commits (`bbcc360`, `15e52e5`, `30e0194`, etc.) — ongoing senior ownership rather than a one-shot gate.
- [x] Claude Desktop live-exercise capture committed; golden file at `mcp-server/tests/examples/information-request-list.golden.md` reflects production output.

#### Technical Context

- **Three-surface design with one source of truth**: `article.md` is the only canonical body. The Astro Hub page imports it via `Content` + `getHeadings`; the MCP Resource serves the same bytes via the codegen-emitted `LIBRARY_BODIES` index; the MCP Prompt embeds the same Resource as its second message. Adding or renaming a section in `article.md` updates the page content, the TOC anchors, and the Resource body automatically — no drift surface.
- **No tool attribution in the public artifact** — by design, per the BL-043 planning conversation. The internal `irl-tool-input-mapping.md` doc carries the engineering-side map of which IRL bullet feeds which Hub-tool / MCP-prompt input.
- **VDR-9 taxonomy + "00 Basics" prelude**: sections `01-09` mirror the canonical VDR taxonomy. Section `00` captures the cross-cutting deal/profile facts (target name, transaction type, ARR, stage, business model, geos) that no single VDR folder owns but every downstream analysis depends on.
- **CSS-ID slug quirk**: auto-generated heading slugs use github-slugger; em-dashes in section titles ("00 — Basics") collapse to double-dashes ("00--basics"). Bare CSS ID selectors that start with a digit are invalid — E2E tests use attribute-form selectors (`h2[id="..."]`) instead.
- **Companion to existing prompts**: `gst_information_request_list` is the _request_ artifact; `gst_diligence_kickoff` consumes filled answers as the diligence-agenda generator. (Historical: the original design also paired this with `gst_vdr_audit`; that prompt was retired 2026-05-31 via BL-036 Tier 3.)
- **Future work** (tracked separately, do not bundle into BL-043):
  - **[BL-044](#bl-044-information-request-list--fillable-form-generator)** — fillable-form generator (Hub tool + MCP tool) that produces a downloadable `.xlsx` from this article. Closes the partner-side "recipient response surface" gap. Filed; not yet started.
  - **BL-045 candidate** (`gst_intake_filled_irl`) — paste-a-filled-IRL → canonical Hub-tool inputs converter. The response side of the loop. Premature to design without BL-044 + v1 usage evidence; file when prioritized.
- **Discipline**: every IRL change ships with a corresponding `irl-tool-input-mapping.md` update in the same PR. Every new Hub tool that needs partner-supplied input either matches an existing IRL bullet or adds one in the same PR.

**Validation sequence before PR**

1. `npm -w @gst/mcp-server run typecheck` — clean
2. `npm -w @gst/mcp-server run test` — all 633+ tests green (manifest-stability hash matches)
3. `npx astro check && npm run lint && npm run lint:css && npm run test:run` — all clean (1170+ tests)
4. `npx playwright test tests/e2e/hub-library-information-request-list.test.ts --project=chromium` — all 5 cases green
5. Senior-consultant content review pass (Step 5.5 — blocking)
6. Live-exercise capture from Claude Desktop overwrites the draft golden file

---

### BL-044: Information Request List — Fillable-Form Generator

**Source**: Follow-up identified during BL-043 final review (2026-05-22) | **Architecture & plan**: [MCP_SERVER_IRL_GENERATOR_BL-044.md](MCP_SERVER_IRL_GENERATOR_BL-044.md) | **Effort**: 3-4 days (landed in 1 session) | **Status**: Done (landed 2026-05-24, `mcp-server@0.3.5`) | **Depends on**: BL-043 (consumes its canonical article + Resource)

**As a** GST partner sending the IRL to a target, client, or portfolio company, **I want** a one-click download of a fillable spreadsheet (.xlsx) that mirrors the canonical IRL section structure **so that** the recipient has an obvious response surface — type answers into structured cells and email it back — instead of inventing their own response format or ignoring the request because the markdown article isn't actionable on their side.

> **Companion**: [`MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md`](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md) — read first. BL-044 is the consumption surface for the article authored under BL-043; the request artifact is unchanged.

#### Planning Criteria

**Use cases**

- **Partner sending the IRL** — clicks "Download IRL (.xlsx)" on `/hub/tools/information-request-list-generator/`, optionally types the target name + transaction context to pre-fill the file header, attaches the resulting file to the kickoff email. No markdown-to-XLS hand-conversion. No "what format do you want this in?" round trip with the recipient.
- **MCP-mediated workflow** — partner in Claude Desktop invokes `/gst_information_request_list { targetName, transactionContext }` and Claude both renders the IRL preview AND produces a downloadable .xlsx (via the new tool) in the same turn. The prompt evolves from "emit text" to "emit text + generate file."
- **Recipient response loop** — recipient opens the .xlsx, sees one section per worksheet (or one column-group per section, TBD), types short answers into column B alongside the request text in column A, sends the filled file back. Structure is preserved end-to-end.
- **Future-state agent ingestion** — when a separate initiative (BL-045 candidate) ships the filled-IRL ingestion path, the structured XLS columns become the natural parse target.

**Outcomes**

- One-click .xlsx download from the Hub + matching MCP tool returning `{ filename, base64 }`.
- File generated deterministically from `gst://library/information-request-list` — partner-facing artifact and agent-facing Resource stay byte-identical to the article authored under BL-043.
- Zero new content authored in BL-044 — the bullets, section headers, and ordering all come from `article.md` via the existing codegen.
- The `gst_information_request_list` MCP prompt orchestrates the new tool when invoked with file-attachment intent (additive — bare prompt invocation still emits text-only).

**Business value**

- **Closes the request → response loop** that BL-043 deliberately scoped out. The IRL is currently a one-page reference; BL-044 makes it a transactable deliverable.
- **Reduces partner friction** by eliminating the markdown-to-spreadsheet hand-conversion step every engagement currently requires.
- **Brand-bearing in the recipient's inbox** — a structured .xlsx with the GST header reads as more professional than a markdown block pasted into an email body.
- **Foundation for the response-ingestion follow-up** (filled-IRL → canonical Hub-tool inputs) — that future initiative needs a structured response format to parse; BL-044 ships exactly that.

#### Acceptance Criteria

All ACs below shipped via the BL-044 PR landed 2026-05-24 (`mcp-server@0.3.5`). Library swap noted: planning AC referenced `exceljs` for round-trip validation; the implementation pivoted to `xlsx-js-style` (Workers-compatible — `exceljs` is Node-only and would have broken the Worker entrypoint). See the BL-044 design doc § "Library choice" for the rationale.

**Hub tool**

- [x] Hub tool page at `/hub/tools/information-request-list-generator/` shipped.
- [x] Page header explains the workflow, links to the canonical library article; does not duplicate content.
- [x] Optional text inputs `targetName` + `transactionContext` write into header cells + filename.
- [x] Primary CTA "Download IRL (.xlsx)" button.
- [x] Generated file mirrors the canonical 10-section structure from `article.md`.
- [x] File header cells include target name, transaction context, generation date, link back to canonical article URL.

**MCP Tool**

- [x] `generate_information_request_list_xlsx` tool registered at `mcp-server/src/tools/generate-information-request-list-xlsx.ts` with input schema `{ targetName?, transactionContext?, productSummary? }`.
- [x] Output `{ filename, base64, mimeType }`.
- [x] Tool reads from `gst://library/information-request-list` Resource (BL-043's codegen-loaded body).

**Prompt evolution**

- [x] `gst_information_request_list.version` bumped `0.0.1 → 0.0.2`.
- [x] `gst_information_request_list.orchestrates` extended to include the new tool name.
- [x] `gst_information_request_list.lastReviewedAt` bumped to the BL-044 commit date.
- [x] Manifest-stability hash recomputed; `mcp-server/BREAKING_CHANGES.md` carries the `0.3.5` entry.
- [x] Prompt body updated for the file-attachment orchestration path.
- [x] Golden file at `mcp-server/tests/examples/information-request-list.golden.md` re-captured.

**Tests**

- [x] Article-parser unit test shipped at `mcp-server/tests/unit/lib/parse-irl-article.test.ts`.
- [x] Tool unit test at `mcp-server/tests/unit/tools/generate-information-request-list-xlsx.test.ts` — validates `.xlsx` via `xlsx-js-style` round-trip (NOT `exceljs` — see library-swap note above); filename contains `targetName` slug; base64 decodes to non-empty buffer.
- [x] Hub page E2E at `tests/e2e/hub-tools-irl-generator.test.ts`.
- [x] Updated prompt unit test asserts new tool name in `orchestrates` and body literal mention.

**Documentation**

- [x] Implementation tracking doc at `src/docs/development/MCP_SERVER_IRL_GENERATOR_BL-044.md` shipped.
- [x] `mcp-server/README.md` updated.
- [x] `mcp-server/src/docs/library/irl-tool-input-mapping.md` updated.
- [x] BL-043 tracking doc's "Sequel" line points at BL-044 (bidirectional cross-ref).

#### Technical Context

**What BL-044 explicitly reuses from BL-043 (do not duplicate)**

| BL-043 deliverable                                                                        | How BL-044 reuses                                                                                            |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/data/library/information-request-list/article.md`                                    | Single source of truth. BL-044's parser reads this; never authors its own bullets.                           |
| `gst://library/information-request-list` Resource                                         | BL-044's MCP tool reads via `loadLibraryByUri()`. No parallel registration. URI contract unchanged.          |
| `mcp-server/src/content/library-loader.ts` (`LIBRARY_BODIES['information-request-list']`) | Already codegen-emitted by the prebuild step. BL-044's parser imports.                                       |
| `mcp-server/src/docs/library/irl-tool-input-mapping.md`                                   | Internal SOP authored under BL-043. BL-044 adds one row; doesn't fork the doc.                               |
| `gst_information_request_list` MCP prompt                                                 | Evolves in place. New version (`0.0.2`), extended `orchestrates`, file-attachment instruction added to body. |
| `/hub/library/information-request-list/` Hub page                                         | BL-044 links to it for the canonical reference reading. Tool page does NOT duplicate the article content.    |

**What BL-044 adds (genuinely new)**

- `src/pages/hub/tools/information-request-list-generator/index.astro` — action-only Hub tool page (download button + optional metadata inputs); slug deliberately distinct from `/hub/library/information-request-list/` to avoid URI collision.
- `mcp-server/src/lib/parse-irl-article.ts` — parses the canonical markdown into a structured `{ sections: [{ number, title, bullets[] }] }` shape. Unit-tested as the regression guard for article structure.
- `mcp-server/src/lib/generate-irl-xlsx.ts` — consumes the parsed structure + optional metadata, produces an `exceljs` workbook → buffer → base64.
- `mcp-server/src/tools/generate-information-request-list-xlsx.ts` — MCP tool wrapper around the generator.
- Possibly `src/pages/api/information-request-list.xlsx.ts` — server-side endpoint if SSR generation is chosen (see decision below).

**File-format decision: XLS (.xlsx) for v1**

- **Why**: universal, recipient-familiar, structured cells map naturally to bullets, `exceljs` (or `@cfworker`-compatible XLSX libs) are mature.
- **DOCX considered**: nearly as good, but the table-of-fields metaphor is less obvious than a spreadsheet. Defer.
- **Fillable PDF considered**: most professional look, but `pdf-lib` + form-field definitions is substantially heavier engineering. Defer to a future v2.
- **Markdown considered**: lightest, but recipients have no obvious "fillable form" structure. Negates the entire reason for BL-044.

**Generation path: client-side vs SSR endpoint vs build-time**

Decide during BL-044 Phase 0:

- **Client-side** (`exceljs` running in browser at button-click): smallest server footprint, but ~200 KB bundle hit on the Hub tool page. Probably the right v1 choice — the tool page is opt-in.
- **SSR endpoint** (`/api/information-request-list.xlsx?targetName=…`): zero bundle hit, but each click is a serverless invocation. Worth it if we want shareable URLs.
- **Build-time** (`/public/downloads/information-request-list.xlsx` regenerated by prebuild): static + fast, but no per-request personalization (target name, transaction context).

Recommend: **client-side for v1**. Bundle cost is acceptable for a tool page; the personalization fields only make sense at click-time anyway.

**MCP tool runtime concern**

The MCP Worker runtime (BL-032 / BL-032.5) is Cloudflare Workers. `exceljs` has Node-only dependencies (`stream`, `Buffer`). Either:

1. Use a Workers-compatible XLSX library (`@nzwsch/xlsx-js`, `xlsx`, others — verify in Phase 0).
2. Generate via a Node sidecar (out of scope for v1 — adds infra complexity).
3. Use the parsed-structure → CSV fallback in the Worker, document XLSX as Hub-tool-only.

Recommend: **option 1**, verify library compatibility before authoring the tool.

**Slug discipline**

- **Library article** (BL-043): `/hub/library/information-request-list/` — reference, read-only
- **Hub tool** (BL-044): `/hub/tools/information-request-list-generator/` — action, downloadable
- **MCP Resource**: `gst://library/information-request-list` — unchanged
- **MCP tool**: `generate_information_request_list_xlsx` — verb-prefixed, distinguishable from the prompt
- **MCP prompt**: `gst_information_request_list` — unchanged name, evolved behavior + bumped version

**Out of scope for BL-044** (explicitly distinguish from this initiative)

- **Filled-IRL ingestion** — a separate future initiative (BL-045 candidate) that consumes a filled .xlsx and emits canonical Hub-tool inputs (`compute_techpar` payload, `assess_infrastructure_cost_governance` answers map, etc.). Different problem; needs its own design.
- **Multi-language IRL** — internationalization of the canonical article. Out of scope; if/when prioritized, file separately.
- **Fillable PDF / DOCX variants** — v2+ if recipient feedback indicates spreadsheet isn't preferred.

**Scope expansion (post-v1)** — content-filtering directives

The current `gst_information_request_list` prompt (shipped under BL-043) has no way to include or exclude content based on input args. Every recipient gets the same 10 sections and ~63 bullets regardless of `productSummary` / `transactionContext`. The only personalization-of-content lever today is **annotation-based compression** — the prompt may add inline `_(already noted: …)_` next to a bullet `productSummary` answers, but never deletes (additive only).

A post-v1 expansion of BL-044 can add **subtractive filtering** by tagging bullets and sections in `article.md` with hidden directives:

```markdown
<!-- skip-if: productType=b2c -->

- Customer profile: typical contract size, contract length, top concentration risk
```

BL-044's parser (already a v1 deliverable — required for XLS generation) is the natural home for this logic. Both the XLS generator AND the prompt's `build()` would consume the parser's filtered output, so the agent-emitted version, the downloaded spreadsheet, and the Hub library page (with optional `?productType=b2c-saas` query params) all apply the same filter from the same source. The article remains the single source of truth — directives change _which_ bullets render, never duplicate the bullet text.

**Why post-v1, not bundled into BL-044 v1**:

- Directive syntax design + tag taxonomy + partner-facing docs for "which filters are available" adds ~1-1.5 days to the v1 estimate.
- v1's annotation-based compression (the lever that already exists under BL-043) covers a substantial portion of the use case without the parser-complexity tax.
- Subtractive filtering needs partner-validated use cases to design the right tag dictionary — premature without v1 usage signals.
- v1 ships the universal artifact + tool surface; v1.5 / v2 adds directives once recipient feedback shows the gap is real.

**Drift mitigation** when added: the Hub library page (`/hub/library/information-request-list/`) would gain optional query params that apply the same filter. Without those, the page shows the full universal version (preserves current behavior). The internal `irl-tool-input-mapping.md` doc (a BL-043 deliverable) would gain a "filter directives" section enumerating which input dimensions can be skipped — keeps directives disciplined rather than proliferating.

**Anti-pattern to avoid**: bullet-level removal authored only in the prompt body (and not propagated through the parser to other surfaces) violates BL-043's "single source of truth, no drift" principle. If we ship filtering in BL-044, the parser is the single filter engine — no surface authors its own filter logic in isolation.

**Risks & mitigations**

| Risk                                                                                        | Mitigation                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Article structure changes after BL-043 ship (renumbering, new sections) break the generator | Article-parser unit test (acceptance criteria above) is the regression guard. Discipline: any change to `article.md` requires running `npm -w @gst/mcp-server run test`.   |
| `exceljs` bundle size hurts Hub tool page Lighthouse                                        | Phase 0 measures the bundle delta. Mitigation paths: SSR generation; lazy-loaded import; CSV fallback for the bulk of bullets.                                             |
| Workers-runtime XLSX library has a parity gap with Node `exceljs`                           | Phase 0 verifies library compatibility before tool authoring. If parity gap is large, ship Hub-tool .xlsx + MCP-tool .csv as v1; align later.                              |
| Recipient opens .xlsx and finds the column structure confusing                              | v1 ships with a hidden "instructions" sheet + visible header row in the data sheet. Senior-consultant review of the file's open-in-Excel UX is a blocking pre-merge gate.  |
| Prompt-orchestration evolution breaks existing `gst_information_request_list` consumers     | Patch-version bump (`0.0.1 → 0.0.2`) signals additive behavior; bare invocation still emits text-only; new file-attachment behavior is conditional on args being supplied. |

**Validation sequence before PR**

1. Phase 0: Workers-XLSX library decision recorded in the tracking doc.
2. Article-parser unit test passes against the unmodified BL-043 article (no edits to `article.md` required).
3. Hub tool E2E: button click → downloaded .xlsx → open in Excel → all 10 sections render with bullets verbatim.
4. MCP tool integration test: tool invocation returns valid base64; round-tripped through `exceljs` yields the same structure.
5. Updated prompt golden file capture: bare invocation still emits text-only; populated invocation emits text + tool call.
6. `mcp-server/tests/integration/manifest-stability.test.ts` + `prompts-registry.test.ts` green with the new tool + prompt version.
7. Senior-consultant review of the downloaded .xlsx in Excel — open-in-Excel UX gate.

---

### BL-045: Sweep IRL-Ingestion Hardening + Rename (`gst_diligence_sweep` → `gst_irl_ingestion`)

**Source**: Sequel work scoped out of BL-044, rescoped 2026-06-01 from "ship a second prompt" to "harden + rename the existing ingestion surface" so one prompt cleanly serves buy-side, sell-side, value-creation, and unknown engagement scenarios with IRL-content-aware tool selection. Strategic-audit additions bundled 2026-06-01: meta JSON fence + schema self-check + BL-032.75 instrumentation + SOP-as-Resource + fill-ratio surfacing + derived `forceTools` enum + four robustness stretches (tool-error degradation, provenance self-check, deterministic dispatch test, build-time schema test) | **Architecture & plan**: [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) | **Effort**: ~0.5 day (PR A, refactor) + 5-7 days (PR B, rename + harden + bundled enhancements + senior-consultant 9×4 review) | **Status**: Candidate — design doc landed 2026-06-01 after four audit cycles (three correctness + one strategic), awaits senior-consultant content review scheduling to promote Candidate → Committed | **Depends on**: BL-031.95 (deeplink contract reused via existing tool wrappers), BL-031.75 (registered-prompt maturity bar), BL-044 (parent IRL generator), BL-032.75 (instrumentation hooks emit into Phase 1's AE schema)

**As a** GST partner receiving a filled IRL `.xlsx` back from a target/client, **I want** to invoke `/gst_intake_filled_irl` in Claude Desktop with the filled workbook attached **so that** the model parses the answer cells into structured inputs for every relevant Hub tool — `compute_techpar`, `assess_infrastructure_cost_governance`, `estimate_tech_debt_cost`, `generate_diligence_agenda`, `search_regulations` — in one assistant turn, instead of manually re-typing each value across multiple wizards.

Closes the request → response loop BL-043 and BL-044 deliberately scoped out. Today the IRL is a structured _request_ artifact (BL-043 article + BL-044 generator); BL-045 makes the filled response equally structured on the consumption side.

#### Likely shape (to refine during scoping)

- **New prompt** `gst_intake_filled_irl` — takes the filled IRL as `filledIrl` arg (markdown OR base64-encoded `.xlsx` once Claude Desktop's MCP file-attachment surface matures, OR via paste-from-clipboard). Reads through the answer cells, maps each to its canonical Hub-tool input dimension via the [`irl-tool-input-mapping.md`](../../../mcp-server/src/docs/library/irl-tool-input-mapping.md) SOP.
- **Output**: a dossier section per Hub tool with the inferred input payload (JSON-pasteable into the tool's input schema OR a one-click Hub deeplink with args pre-encoded — same deeplink pattern BL-044 introduced for the XLSX generator).
- **Engine**: model-mediated semantic mapping, not hardcoded field extraction — handles per-engagement IRL drift (added bullets, rephrasings, "n/a" values) without code changes. Per the ["Per-engagement IRL drift" decision flow](../../../mcp-server/src/docs/library/irl-tool-input-mapping.md#per-engagement-irl-drift--decision-flow).

#### Why "candidate" and not committed

The BL-044 v1 generator + Hub page just shipped (2026-05-25). Real partner usage of the request side should accumulate before designing the response side — v1 evidence on filled-IRL formats, common drift patterns, and which tools partners actually want auto-populated will dramatically improve BL-045's scope. Premature design risks shipping a parser optimized for hypothetical inputs.

#### Triggers to promote from candidate → committed

- ≥3 engagements have run the BL-044 generator end-to-end and partners have actually received filled IRLs back
- Common drift patterns surface across those engagements (informs whether the parser needs structured arg-mapping or a freeform model-mediated path)
- A specific partner request for "automate the IRL → tool-inputs hop" arrives — currently the hop is unautomated but small (partner copies the answer cells manually into wizards)

#### Out of scope (likely)

- Multi-version IRL ingestion (parser supports v0 article structure only; later IRL revisions need their own parser updates)
- Field-level validation against tool Zod schemas (rejection → loop back; bigger scope)
- DOCX / PDF input variants (start with .xlsx since BL-044 generated that; expand later)

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

### BL-031: MCP Server — Internal Prototype (Phase 1)

**Source**: MCP_SERVER_INITIATIVE.md (archived) | **Architecture & plan**: [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) ([test-completion companion](MCP_SERVER_ARCHITECTURE_BL-031_tests.md)) | **Effort**: 1-2 days | **Status**: Complete — local stdio MCP server shipped with three tools (`generate_diligence_agenda`, `search_portfolio`, `list_portfolio_facets`); engine parity verified end-to-end, invalid-input rejection clean, in-process protocol-roundtrip integration tests in CI, recorded smoke evidence in workspace README (April 27, 2026).

**As a** GST team member, **I want** a local MCP server exposing the diligence engine and portfolio search **so that** I can query GST's tools from Claude Desktop and Claude Code without opening the website.

> **Implementation plan**: see [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — covers MCP architecture introduction, repo-placement and lifecycle decisions, the Phase 1 file layout and tool surface, and verification steps. The canonical SDK is the v2 split-package family (`@modelcontextprotocol/server` + companions); the implementation pins `@modelcontextprotocol/server@2.0.0-alpha.2` and adds `@cfworker/json-schema` directly because v2 alpha imports it unconditionally despite declaring it as an optional peer.

#### Planning Criteria

**Use cases**

- **Live agenda drafting** — while drafting a client proposal in Claude Desktop, ask the model to generate a tailored diligence agenda for a specific deal (`{ transactionType: 'majority-stake', productType: 'b2b-saas', techArchetype: 'modern-cloud-native', ... }`); the topic list streams into the same conversation that's writing the proposal
- **Comparable-deal recall** — mid-call with a prospect, query `search_portfolio { search: 'CRM', engagement: 'Value Creation' }` to pull relevant past engagements for analogical anchoring
- **Internal experimentation** — exercise the engines as agent tools to find ergonomics issues (oversized payloads, ambiguous enums, missing facets) before any external client sees them
- **Onboarding & training** — a new analyst can query the diligence engine through Claude to learn the wizard's logic without the visual scaffolding getting in the way
- **Test-bed for BL-032** — proves the tool registry / Zod-schema bridging pattern that the remote phases will inherit

**Outcomes**

- Server installed locally by every GST team member with Claude Desktop or Claude Code (target: 100% adoption within the first week)
- Used ≥5 times per week per active team member for two consecutive weeks without anyone reaching for `localhost:4321/hub/tools/diligence-machine` instead
- Zero behavior divergence reports — every output the MCP server returns matches what the website wizard would produce for the same inputs
- Foundation validated: tool registry decoupled from transport such that BL-032 only swaps the transport layer

**Business value**

- **Time saved**: ~10–15 min per agenda drafting session by eliminating the browser context switch and manual transcription of wizard output into client-facing artifacts
- **Risk reduction for BL-032/BL-033**: API ergonomics, schema gaps, and edge cases surface in low-stakes internal use rather than during a paid pilot
- **Concrete artifact for narrative**: gives investor conversations and partner pitches something real to point at when describing GST's "AI-native advisory" positioning — moves the claim from aspirational to demonstrated
- **Zero incremental cost**: uses existing infrastructure (no new SaaS, no new runtime dependencies beyond `@modelcontextprotocol/server` + the `@cfworker/json-schema` peer it requires) — this is a 1-2 day spend that unlocks the rest of the MCP roadmap

#### Acceptance Criteria

**Server scaffolding**

- [x] New workspace directory `mcp-server/` at repo root with its own `package.json`, `tsconfig.json`, and `README.md` — does NOT touch the Astro build
- [x] Built with `@modelcontextprotocol/server` (v2 split-package family; v2.0.0-alpha at the time of this work) using stdio transport — no HTTP, no auth
- [x] Single entry point `mcp-server/src/index.ts` bundled to `mcp-server/dist/index.js` (`tsc --noEmit` for typecheck + `esbuild` for the bundle, since the website source uses extensionless imports that vanilla `tsc --moduleResolution NodeNext` can't run); `npm run build` produces a runnable binary
- [x] Binary declared via `bin` field in `mcp-server/package.json` so it can be invoked as `node /abs/path/to/dist/index.js` from a Claude Desktop / Claude Code config block
- [x] Tool input schemas declared with **Zod** (already a project dependency) and converted to JSON Schema for MCP via `zod-to-json-schema` or the SDK's helper

**Tools exposed**

- [x] `generate_diligence_agenda` — wraps `generateScript(inputs)` from [src/utils/diligence-engine.ts](../../utils/diligence-engine.ts)
  - Input schema mirrors `UserInputs` (13 fields: transactionType, productType, techArchetype, headcount, revenueRange, growthStage, companyAge, geographies[], businessModel, scaleIntensity, transformationState, dataSensitivity, operatingModel)
  - Enum values for each field sourced from [src/data/diligence-machine/wizard-config.ts](../../data/diligence-machine/wizard-config.ts) so the schema stays in lockstep with the website wizard
  - Returns the full `GeneratedScript` (topics, attentionAreas, triggerMap, metadata) as MCP `text` content, JSON-stringified
  - Returns a structured MCP error (not a thrown exception) when input fails Zod validation
- [x] `search_portfolio` — wraps `filterProjects(projects, criteria)` from [src/utils/filterLogic.ts](../../utils/filterLogic.ts)
  - Bundles `src/data/ma-portfolio/projects.json` (61 projects) at build time via esbuild's JSON loader, validated at module init against the existing Zod schema in `src/schemas/portfolio.ts`
  - Input schema: `{ search?: string, theme?: string, engagement?: string, limit?: number (default 20, max 61) }` — defaults `theme`/`engagement` to `'all'` to match `FilterCriteria` semantics
  - Returns array of matched `Project` objects plus a count summary
  - Optional companion tool `list_portfolio_facets` returning `{ themes: string[], engagementCategories: string[], growthStages: string[], years: number[] }` from the existing `getUnique*` helpers — saves callers a roundtrip when discovering filter values

**Verification & docs**

- [x] `mcp-server/README.md` documents: install/build steps, JSON config snippets for both Claude Desktop (`claude_desktop_config.json`) and Claude Code (`.mcp.json` or `~/.claude/settings.json` `mcpServers` entry), each tool's input schema with one concrete example invocation
- [x] Vitest unit tests for the tool handlers using the SDK's in-memory test transport — cover happy path, invalid input rejection, and empty-result cases for both tools (24 unit + 9 in-process protocol-roundtrip integration tests via vendored `PairedTransport` — see [MCP_SERVER_ARCHITECTURE_BL-031_tests.md](MCP_SERVER_ARCHITECTURE_BL-031_tests.md))
- [x] Manual smoke test recorded in the README: launch the server, invoke `generate_diligence_agenda` from Claude Desktop with the example payload, confirm a non-empty topic list comes back
- [x] Repo-root `npm run lint` and `npx astro check` continue to pass (the new directory is excluded from Astro's tsconfig but still linted by the existing flat ESLint config)

#### Technical Context

**Why this is small**

- The two engines are already pure, fully typed, and unit-tested — `generateScript` has zero DOM/Astro/runtime coupling, and `filterProjects` operates on plain JSON. The MCP wrapper is essentially: parse input → call function → JSON-stringify output.
- Zod is already in `dependencies`. The source-of-truth schemas in `src/schemas/` (portfolio, diligence) can be re-imported by the MCP server via a relative path, so the input shapes can never drift from what the website renders.

**File layout**

```
mcp-server/
├── package.json          # type: module, bin entry, depends on @modelcontextprotocol/server + @cfworker/json-schema + zod
├── tsconfig.json         # extends ../tsconfig.json (or standalone strict config), outDir: dist
├── README.md             # install + Claude Desktop/Code config snippets + tool examples
├── src/
│   ├── index.ts          # server bootstrap, registers tools, starts stdio transport
│   ├── tools/
│   │   ├── diligence.ts  # imports generateScript from ../../../src/utils/diligence-engine
│   │   └── portfolio.ts  # imports filterProjects + loads projects.json at module init
│   └── schemas.ts        # re-exports / adapts Zod schemas from ../../../src/schemas
└── tests/
    ├── diligence.test.ts
    └── portfolio.test.ts
```

The relative-import dance keeps the engines as the single source of truth — no copy-paste, no separate publish step.

**Out of scope for this phase** (covered by BL-032 / BL-033)

- HTTP / Streamable HTTP transport
- Authentication, rate limiting, audit logging
- Radar tools (`search_radar`, `get_latest_insights`) — defer to BL-032 since they require Inoreader credentials and rate-limit handling
- Cloudflare Worker deployment, edge networking
- OAuth, external client onboarding, MCP directory listing

**Risks & mitigations**

- **Engine drift**: if a future PR adds a field to `UserInputs` without updating the MCP schema, callers will get silent rejections. Mitigation — derive the MCP input schema from the existing Zod schema in `src/schemas/diligence.ts` rather than redefining it
- **Dataset growth**: `projects.json` is loaded once at boot; this is fine at 61 projects but the README should call out that growth past ~1000 records would warrant a streaming or paginated response
- **Path-resolution under stdio**: when Claude Desktop spawns the server its `cwd` is the user's home dir, not the repo. Resolve `projects.json` via `import.meta.url` / `fileURLToPath`, not `process.cwd()`

**Validation sequence before marking done**

1. `cd mcp-server && npm run build && npm test` — green
2. From repo root: `npm run lint && npx astro check && npm run test:run` — still green (no regression in main project)
3. Add the local server to `claude_desktop_config.json`, restart Claude Desktop, confirm tools appear in the tool list
4. Invoke each tool with the README's example payload, confirm a sensible response
5. Invoke `generate_diligence_agenda` with a deliberately invalid `transactionType` (e.g. `"foo"`), confirm a clean MCP error rather than a stack trace

---

### BL-031.5: MCP Server — Hub Surface Extension

**Source**: BL-031.5 — extends Phase 1 surface | **Architecture & plan**: [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) | **Effort**: 3-5 days | **Status**: Complete (April 28, 2026) | **Depends on**: BL-031

**As a** GST team member, **I want** the local MCP server to also expose the remaining Hub tool engines (ICG, TechPar, Tech Debt, Regulatory Map) and to expose the Library articles and the Radar snapshot as MCP **Resources** **so that** my agents can pull GST's full advisory toolkit and reference content into any conversation without opening the website.

> **Implementation plan**: see [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) — covers the MCP "Resources" primitive, the Tool/Resource taxonomy across the Hub surface, content-source decisions for Library articles, the Radar-snapshot constraint that protects the Inoreader 200 req/day budget, and verification steps.

#### Planning Criteria

**Use cases**

- **Cost-governance assessment in-flow** — while drafting an ICG memo for a target, ask the model to score the company's cost maturity (`assess_infrastructure_cost_governance { answers: {...}, stage: 'scaling' }`) and produce a prioritized remediation list inline; eliminates the wizard round-trip
- **TechPar benchmarking mid-conversation** — drop a target's spend breakdown into a chat (`compute_techpar { arr: 25_000_000, stage: 'expansion', ... }`) and get the blended cost ratio + 36-month trajectory back without leaving the document
- **Tech-debt sizing on the call** — during a CTO conversation, estimate the carrying cost of legacy maintenance (`estimate_tech_debt_cost { teamSize, salary, maintenanceBurdenPct }`) for a defensible figure to anchor the discussion
- **Regulatory framework as native context** — pin `gst://regulations/eu/gdpr` or `gst://regulations/us/ca/ccpa` into a deal-review conversation; the model treats it as referenceable context rather than re-typed quotes
- **Library article reuse** — pull the **VDR Structure Guide** (`gst://library/vdr-structure`) into a client-prep conversation as a single resource the model can read and adapt without us re-explaining it
- **Radar context for prep work** — read `gst://radar/fyi/latest` from the local snapshot to surface the most recent annotated items before a partner call (offline-safe; no Inoreader calls)
- **Proof-of-concept for Resources primitive** — exercises the read-only Resource handler pattern that BL-032 (radar live) and BL-033 (per-client regulatory access) will inherit

**Outcomes**

- Tool parity: `assess_infrastructure_cost_governance`, `compute_techpar`, `estimate_tech_debt_cost`, `search_regulations`, `list_regulation_facets`, and `search_radar_cache` all installed locally by every GST team member alongside the BL-031 tools
- Resource exposure: Library × 2, Regulations × 120+, Radar Wire/FYI streams visible in Claude Desktop's resource picker; at least one team member uses a pinned Library or Regulation URI in a real client-prep conversation within the first two weeks
- Zero Inoreader API calls attributable to MCP traffic — the local snapshot pattern (`npm run radar:seed`) holds; verified by absence of 4xx/5xx Inoreader log entries in the seed window
- URI stability invariant: a frozen Vitest-asserted manifest of expected resource URIs prevents accidental contract breakage
- Foundation validated: hybrid Tool+Resource pattern proven locally before BL-032 layers HTTP transport on top

**Business value**

- **Multiplies the BL-031 productivity win** — the Hub has 5 tools; BL-031 covers 1; BL-031.5 brings the other 4 into the same conversational surface
- **De-risks BL-032's hybrid surface** — Resources are not just a "nice extra"; they are the right primitive for regulatory, library, and per-item radar exposure. Validating the URI scheme + freshness semantics now (locally, low-stakes) is the cheapest place to learn the ergonomics
- **Concrete differentiator for narrative** — "agents can pin GST's regulatory library and TechPar engine as native context" reads materially stronger than "agents can call our diligence tool"
- **Marginal cost** — same workspace, same SDK, same CI; the 3-5 day estimate covers four engine wrappers, the Resources registry, library-content sourcing, and the snapshot-based radar handler

#### Acceptance Criteria

**New tools (extend BL-031's tool registry)**

- [x] `assess_infrastructure_cost_governance` — wraps the ICG engine; input includes the `answers` map and an optional `companyStage`; output is `{ overallScore, maturityLevel, domainScores[], showFoundationalFlag, recommendations[], answeredCount, totalQuestions, skippedCount }`. Field names are canonical to the engine; full reference in [`mcp-server/src/docs/icg/CONTRACT.md`](../../../mcp-server/src/docs/icg/CONTRACT.md)
- [x] `compute_techpar` — wraps the TechPar engine; input is `TechParInputs` (14 fields); output is `TechParResult`. Full reference in [`mcp-server/src/docs/techpar/CONTRACT.md`](../../../mcp-server/src/docs/techpar/CONTRACT.md)
- [x] `estimate_tech_debt_cost` — wraps the Tech Debt engine; **input MUST be raw values** (team size, salary, maintenance burden, deploy frequency, etc.) — slider-position helpers stay on the website side. Full reference in [`mcp-server/src/docs/tech-debt/CONTRACT.md`](../../../mcp-server/src/docs/tech-debt/CONTRACT.md)
- [x] `search_regulations` — facet/search across the regulatory-map JSON files; input `{ jurisdiction?, category?, query?, limit? }`; output includes the resource `uri` for each matched framework. Full reference in [`mcp-server/src/docs/regulatory-map/CONTRACT.md`](../../../mcp-server/src/docs/regulatory-map/CONTRACT.md)
- [x] `list_regulation_facets` — companion enumerator for `{ jurisdictions[], categories[], totalFrameworks }`
- [x] `search_radar_cache` — local-only equivalent of BL-032's `search_radar`; reads from the seed snapshot ONLY; explicitly named to avoid future collision with the live remote tool

**Resources primitive (new for this initiative)**

- [x] MCP server registers `resources/list` and `resources/read` handlers
- [x] Library: `gst://library/business-architectures` and `gst://library/vdr-structure`, `mimeType: text/markdown`, body sourced from a single canonical location ([deviation](MCP_SERVER_HUB_SURFACE_BL-031_5.md#deviation--library-content-source-bl-0315): heavily-componentized Astro pages led to parallel-canonical `.md` digests at `src/data/library/<slug>/article.md` rather than an Astro content-collection migration; live website page is authoritative if drift)
- [x] Regulations: one Resource per framework, URI `gst://regulations/<jurisdiction>/<framework-id>`, `mimeType: application/json` (full JSON body returned as text)
- [x] Radar: `gst://radar/fyi/latest`, `gst://radar/wire/latest`, `gst://radar/wire/<category>` (one per category) — resource description includes `lastSeededAt`; if seed snapshot is missing, the Resource returns a structured "run `npm run radar:seed`" message. Per-item URIs (`gst://radar/item/<id>`) deferred — `search_radar_cache` returns items directly so callers don't need to chain into a per-item Resource
- [x] **No live Inoreader calls** from any radar-related tool or resource — enforced by a scoped ESLint `no-restricted-imports` rule that prevents `mcp-server/src/` from importing `src/lib/inoreader/client.ts`
- [x] Resource URI manifest frozen as a Vitest test (`mcp-server/tests/integration/resource-uri-stability.test.ts`); deliberate URI changes require updating the manifest AND bumping `mcp-server/package.json` version

**Verification & docs**

- [x] [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) updated with any deviations made during implementation (Library content-source decision section appended)
- [x] `mcp-server/README.md` extended with the new tool and resource catalog plus a "How Resources work in this server" section
- [x] Vitest tests for each new tool (parity test against the corresponding website engine) and each Resource shape (URI parsing, body retrieval, missing-snapshot graceful failure) — 93 tests total, was 33
- [x] Manual parity check recorded in the README — `Last verified (BL-031.5 surface): April 28, 2026` stanza covers all 6 new tools + 3 Resource families with concrete output values
- [x] Repo-root `npx astro check && npm run lint && npm run lint:css && npm run test:run` continues to pass

#### Technical Context

**Tool/Resource fit summary**

| Surface                 | Primitive | URI / Tool name                                                                       |
| ----------------------- | --------- | ------------------------------------------------------------------------------------- |
| ICG, TechPar, Tech Debt | Tool      | `assess_infrastructure_cost_governance`, `compute_techpar`, `estimate_tech_debt_cost` |
| Regulatory Map          | Hybrid    | Tool: `search_regulations`; Resource: `gst://regulations/<j>/<id>`                    |
| Library                 | Resource  | `gst://library/<slug>`                                                                |
| Radar (cached)          | Hybrid    | Tool: `search_radar_cache`; Resources: `gst://radar/...`                              |

**Why this is its own initiative (not folded into BL-031)**

- BL-031 is "wrap two pure functions, prove the path, ship in 1-2 days" — small enough to validate the engineering decisions cheaply
- BL-031.5 introduces a new MCP primitive (Resources), four new engine wrappers, content-source decisions for the Library, and the radar-snapshot constraint — each of which has its own design call
- Splitting them lets BL-031 ship and start delivering value while BL-031.5 absorbs the design questions on its own timeline

**Key constraint — Inoreader budget protection**

The local MCP server MUST NOT make Inoreader API calls. The 200 req/day budget is shared with the website's ISR (~28 calls/day) and BL-032's planned remote rate-limit logic. An always-on local MCP server fetching live data would burn the budget within hours. The server reads the snapshot produced by `npm run radar:seed` (already documented in [RADAR.md](../hub/RADAR.md)) and returns a structured "snapshot missing" error if the file is absent.

**Out of scope** (covered by BL-032 / BL-033)

- Live radar fetching, HTTP transport, OAuth, rate limiting, audit logs — all unchanged from the BL-031 deferral list
- A "write" tool surface (the MCP server stays read-only)
- MCP Prompts primitive
- Per-client / per-tier resource access controls (BL-033)

---

### BL-031.75: MCP Server — Consultant Prompt Library

> **Note on retired references (2026-05-31)**: this stanza documents the BL-031.75 shipment as recorded at the time of the V1–V8 sign-off. One of the eight prompts described below (`gst_vdr_audit`) was subsequently retired via BL-036 Tier 3 (insufficient business value). Mentions of `gst_vdr_audit` in this stanza are preserved as historical record of what shipped under BL-031.75 — they are not active surface and should not be edited to maintain the integrity of the V1–V8 sign-off trail. The current prompt registry contains 9 prompts; see [`mcp-server/README.md` § Prompts](../../../mcp-server/README.md) for the live inventory.

**Source**: BL-031.75 — extends Phase 1 surface with Prompts | **Architecture & plan**: [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) | **Effort**: 2-3 days engineering + senior-consultant review time | **Status**: Complete (May 1, 2026); V1–V8 senior-consultant sign-off recorded in `mcp-server/README.md` § "Last verified (BL-031.75 surface)" + `mcp-server/tests/examples/*.golden.md` | **Depends on**: BL-031, BL-031.5

**As a** GST analyst (or onboarding new hire), **I want** GST's repeatable consultant workflows packaged as named slash-command prompts in Claude Desktop **so that** I can invoke "/gst_diligence_kickoff" or "/gst_target_quick_look" and get a templated, GST-house-style brief that orchestrates the right Tools and Resources without me needing to remember the recipe.

> **Implementation plan**: see [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — covers the MCP "Prompts" primitive, the proposed prompt library and naming convention (`gst_*` prefix), the per-prompt module shape (with `version` and `lastReviewedAt` fields), the senior-consultant review gate, and verification steps.

#### Planning Criteria

**Use cases**

- **New-engagement kickoff** — `/gst_diligence_kickoff { targetName, transactionType, productType, ... }` produces a starter agenda + VDR follow-up suggestions in GST's house style; replaces the unwritten "what does a senior consultant do at engagement kickoff" tacit knowledge with a runnable template
- **Target first-look** — `/gst_target_quick_look { targetName, productType, arr, stage, hqJurisdiction }` orchestrates ICG + TechPar + Tech Debt + regulatory exposure into one digestible brief; consistent format across analysts
- **Comparable engagement memo** — `/gst_comparable_engagements_memo { targetDescription, theme? }` finds 3-5 comparable past engagements via the portfolio search, summarizes the relevant lesson from each, frames analogically
- **Regulatory exposure brief** — `/gst_regulatory_exposure_brief { targetJurisdictions[], dataCategories[], productType }` compiles applicable frameworks with summaries pulled from BL-031.5's regulation Resources
- **VDR audit** — `/gst_vdr_audit` compares a target's actual VDR contents against the canonical 10-folder taxonomy from the Library; flags gaps and surfaces follow-up requests
- **Architecture review** — `/gst_architecture_layer_review { targetSummary }` walks the target through the 5-layer architecture framework (Software → Infrastructure → Data → Org → Industry) using the Library article
- **Daily radar digest** — `/gst_radar_brief_today { category? }` _[v0.0.2 — `sinceHours?` was in the original BL-031.75 v0.0.1 shape; dropped under [BL-031.95 Phase 3.A](MCP_SERVER_HUB_URL_STATE_BL-031_95.md#phase-3-radar--closure-summary) capability-mirror refactor because the cache has a 24h TTL and the website surfaces no time filter]_ summarizes the most recent annotated radar items in GST Take voice from the local snapshot
- **Diligence handoff memo** — `/gst_diligence_handoff_memo { targetName, ... }` combines agenda + comparables + VDR follow-ups into a draft memo for the deal team

**Outcomes**

- Eight `gst_*` prompts visible in Claude Desktop's slash-command picker for every team member with the local MCP server installed
- New-analyst onboarding shifts from "shadow a senior consultant" to "run `/gst_target_quick_look` on three real targets and review with mentor" — measurable reduction in time-to-first-deliverable for new hires
- Each prompt has senior-consultant sign-off (gating step) confirming the output reads "as if I wrote it myself"
- Annual review cadence operational; prompts have `lastReviewedAt` tracked; CI fails if any prompt is over 12 months stale
- ≥5 prompts used per active team member per week for two consecutive weeks — proves the slash-menu is the natural entry point for GST workflows
- Foundation for paid prompt-pack offering (BL-033) validated: the same prompt module shape is portable to a per-client tier

**Business value**

- **Codifies tacit consulting judgment** — the most valuable, least-documented asset in a boutique advisory firm. Prompts become firm IP that survives consultant turnover
- **Compresses onboarding ramp time** — measured in real days saved per new hire; for a firm where consultants are the cost driver, this compounds
- **Multiplies BL-031 + BL-031.5 ROI** — Tools and Resources are useful to people who already know the workflow. Prompts make them useful to people learning it. Same engineering cost, dramatically broader audience
- **Consistency across deliverables** — when every analyst's first-look brief uses the same prompt, output quality variance collapses; clients see GST's house style every time
- **Concrete asset for narrative** — "GST has codified its diligence workflows as agent-native templates" reads materially differently from "GST has a website with tools." Pitch surface, hiring surface, investor surface all benefit
- **Cost**: 2-3 days engineering + senior-consultant review time (the latter is the binding constraint — frame as ~30 min per prompt)
- **Marginal infrastructure cost**: zero — same `mcp-server/` workspace, same SDK, same CI

#### Acceptance Criteria

**Prompts primitive (new for this initiative)**

- [x] MCP server registers `prompts/list` and `prompts/get` handlers via the SDK's `registerPrompt` API
- [x] All prompts use the `gst_` name prefix (avoids slash-menu collisions with other installed MCP servers); enforced by a regex check in `mcp-server/src/prompts/_registry.ts`
- [x] Per-prompt module exports a uniform shape: `{ name, description, version, lastReviewedAt, argsSchema, build }` (plus `orchestrates` — added during implementation as the drift backstop) — see [MCP_SERVER_PROMPTS_BL-031_75.md § Per-prompt module shape](MCP_SERVER_PROMPTS_BL-031_75.md#per-prompt-module-shape)
- [x] Argument schemas re-use (via Zod composition) the same source-of-truth schemas as the Tools the prompt orchestrates — CI test asserts no drift

**Prompt library (8 prompts)**

- [x] `gst_diligence_kickoff` — wraps `generate_diligence_agenda` Tool + references VDR Library Resource
- [x] `gst_target_quick_look` — orchestrates ICG + TechPar + Tech Debt + regulatory search Tools
- [x] `gst_comparable_engagements_memo` — wraps `search_portfolio` + `list_portfolio_facets` Tools
- [x] `gst_regulatory_exposure_brief` — wraps `search_regulations` Tool + reads regulation Resources by URI
- [x] `gst_vdr_audit` — references `gst://library/vdr-structure` Resource (interactive: argument-less mode supported)
- [x] `gst_architecture_layer_review` — references `gst://library/business-architectures` Resource
- [x] `gst_radar_brief_today` — reads `gst://radar/fyi/latest` Resource (filter by category if supplied)
- [x] `gst_diligence_handoff_memo` — orchestrates diligence + portfolio Tools + VDR Library Resource

**Verification & docs**

- [x] [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) updated with any deviations made during implementation
- [x] `mcp-server/README.md` extended with a "Prompts: GST consultant workflows" section listing every prompt, its arguments, an example invocation, and a sample output (last-verified stanza placeholder; populated during V1–V8)
- [x] Vitest test per prompt asserting: (a) name has `gst_` prefix, (b) `argsSchema` parses a representative payload, (c) `build()` returns at least one message, (d) the message body references the expected Tool/Resource names
- [x] Prompt-registry invariant tests: every prompt has `version`, `lastReviewedAt` ≤ 12 months old, `orchestrates` field listing each Tool/Resource it invokes — CI fails if any registered Tool/Resource is missing
- [x] Golden-output snapshots per prompt (at least one representative invocation per prompt) — committed to `mcp-server/tests/examples/*.golden.md`; regression-tested on each Claude model upgrade. **Status**: 8 golden files populated 2026-05-01 with real frontmatter (`recordedAt: 2026-05-01`, `model: claude-opus-4-7`) + per-trial evidence (input + expanded body + model output + verification notes).
- [x] **Senior-consultant review gate**: each prompt's output on a representative input has been reviewed and signed off by a senior team member as "this reads as if I wrote it." This is a **blocking acceptance criterion**, not a nice-to-have. **Status**: V1–V8 sign-off recorded 2026-05-01 against `dist/index.js` v0.0.1 at the closure commit. Nine layered fixes shipped during the verification cycle (deep-link landing, jurisdiction case-normalization, ICG schema-ID enumeration, enumFromWire case-tolerance, SearchResult enrichment, vdr-audit Tier 1, radar wire-shape empty-string handling, fixture timestamp refresh, double-optional pattern); each captured by a regression test.
- [x] `mcp-server/src/docs/prompts/README.md` authored — conceptual reference for the registered-prompt pattern (audience: future contributors authoring or modifying a prompt). Complementary to `mcp-server/README.md`'s user-facing inventory and to the BL-031.75 planning artifact

#### Technical Context

**Why this is its own initiative (not folded into BL-031.5)**

- BL-031.5 is engineering work — wrapping engines, parsing regulation files, reading the radar snapshot. The competency is TypeScript + schema design
- BL-031.75 is content design — what does a senior consultant actually do step-by-step on each motion? The competency is consulting judgment, not code
- The bottleneck is senior-consultant review time, not engineering time. Splitting the initiatives prevents engineering from waiting on consulting review and vice versa

**Why the `gst_` prefix matters**

Prompts appear in Claude Desktop's slash-command picker alongside every other installed MCP server's prompts AND Claude Code's built-in slash commands. Without a prefix, `/diligence_kickoff` could collide with another server's prompt or a future Claude built-in. The `gst_` prefix is namespacing that costs four characters per name and pays for itself the first time another MCP server is installed.

**Why prompts have `version` and `lastReviewedAt`**

A prompt's behavior is determined by its message body — pure content. A senior consultant edits the body, every analyst's `/gst_diligence_kickoff` output changes silently. Tracking version + last-review-date forces deliberate review cycles and gives downstream users (BL-033 external clients, eventually) a stable contract.

**Out of scope** (covered by BL-032 / BL-033 or deferred indefinitely)

- HTTP transport / remote prompt access (BL-032)
- Per-client prompt customization (a paying client's white-labeled `/gst_diligence_kickoff`) — defer to BL-033 if requested
- Prompt usage telemetry — requires BL-032's logging surface; not applicable to local-stdio
- Localization — English only until GST signs a non-English-language engagement
- A prompt-builder UI on the website — authoring stays in `mcp-server/src/prompts/`
- Mutation prompts (write tools) — the MCP server stays read-only across all phases of BL-031.x

---

### BL-031.85: MCP Server — Tool Input Contracts

**Source**: BL-031.85 — formalizes input-schema documentation across the local-stdio surface | **Architecture & plan**: [MCP_SERVER_CONTRACTS_BL-031_85.md](MCP_SERVER_CONTRACTS_BL-031_85.md) | **Effort**: 1-2 days (actual: shipped incrementally across BL-031.85 / BL-031.5 / BL-031.75) | **Status**: ✅ Complete (May 2, 2026) | **Depends on**: BL-031

**As a** GST team member (or external AI agent), **I want** every MCP tool's input schema documented as a first-class versioned contract — covering valid values, multi-select semantics, ordinal-bracket rules, downstream effects on engine output, and a registry index across all tools — **so that** I can compose calls correctly without reading the Zod schema, agents can introspect what they need before invoking a tool, and a future Information Request List (IRL) generator has a stable surface to consume.

> **Implementation plan**: see [MCP_SERVER_CONTRACTS_BL-031_85.md](MCP_SERVER_CONTRACTS_BL-031_85.md) — covers what an input contract is, the registry pattern (`mcp-server/src/docs/contracts/`), the per-tool spec template, the lightweight downstream-effect convention, the versioning discipline borrowed from BL-031.75, and the IRL forward-look (out of scope for this initiative).

#### Planning Criteria

**Use cases**

- **Self-service tool invocation** — a team member preparing a prompt for an analyst doesn't have to open `src/schemas/diligence.ts` to know what `transactionType` enum values are valid; the contract doc lists them with descriptions and downstream-effect notes
- **AI-agent introspection** — an agent in a long-running conversation can fetch the contract for a tool, plan its inputs, and avoid wasted invocations against invalid enum values
- **Onboarding new analysts** — the contract doc explains _why_ each input matters (e.g. "high data sensitivity surfaces the breach-liability attention area"), not just what's valid; reduces ramp time for first diligence agenda
- **Drift surveillance** — a contract version bump makes schema changes visible at PR review time; aligns with the schema-reuse risk mitigation BL-031.5 calls out
- **Foundation for IRL generator** — the contracts collectively become the input to a future tool that emits structured fill-in forms for analysts or external agents working offline; not in scope for BL-031.85, but the contracts are the substrate that makes it tractable

**Outcomes**

- Diligence Machine input contract authored at `mcp-server/src/docs/diligence/CONTRACT.md` — 13 fields, valid enums, downstream-effect summaries, hidden-semantics callouts (multi-region auto-sync, ordinal bracket comparison)
- Contracts registry at `mcp-server/src/docs/contracts/README.md` — what-is-an-input-contract narrative, table of all known Hub-tool contracts (diligence today; ICG / TechPar / Tech Debt / Regulatory Map / Portfolio listed as `⏳ BL-031.5`), ~10-line IRL forward-look
- Cross-references wired from `mcp-server/src/docs/diligence/USAGE.md`, `mcp-server/README.md` Tool Inventory, `src/schemas/diligence.ts` top-of-file comment, `src/docs/README.md` Quick Navigation
- Versioning discipline: each contract has a version + last-authored date; pattern reusable when BL-031.5 contracts are authored alongside their MCP tools
- Zero engine changes; zero schema changes; zero test changes — pure documentation initiative on top of the existing BL-031 surface

**Business value**

- **Reduces friction** for both human and AI-agent consumers of the local MCP surface — composing valid tool calls becomes self-evident from the doc, not a TS-archaeology exercise
- **De-risks BL-031.5** — when ICG / TechPar / Tech Debt / Regulatory Map ship as MCP tools, their contracts get authored alongside following the established pattern; no per-tool format invention, no drift
- **Enables BL-032+ remote consumers** — external agents pinning to a versioned contract gives the team a clean break-change semantic when remote API stability matters (BL-032.5 / BL-033)
- **Strategic asset for the IRL generator** — the contracts ARE the foundation; without them, IRL is unscoped; with them, IRL becomes a small downstream tool
- **Marginal cost**: 1-2 days of consolidation work, zero infrastructure cost, zero runtime impact

#### Acceptance Criteria

**Contracts authored**

- [x] `mcp-server/src/docs/diligence/CONTRACT.md` — full contract for `generate_diligence_agenda`. Each of the 13 fields has: identifier, display label (from `wizard-config.ts`), subtitle, valid-values table (id / label / description), 1-3 line downstream-effect summary, cardinality / hidden semantics where relevant
- [x] Hidden semantics documented: `geographies` multi-region auto-sync, `headcount` / `revenueRange` / `companyAge` ordinal bracket comparison via `meetsMinimumBracket`
- [x] Versioning header: `version: v1`, `lastAuthored: 2026-04-27`, schema-source line range citation
- [x] Source-of-truth pointers in the doc header: Zod schema file, wizard-config file, engine `CONDITION_LABELS` line range

**Contracts registry**

- [x] `mcp-server/src/docs/contracts/README.md` exists with three sections: "What an input contract is", "Why the contract is its own artifact", "The contracts registry table"
- [x] Registry table lists all six known Hub tools (diligence ✅ Authored, ICG / TechPar / Tech Debt / Regulatory Map / Portfolio Search as `⏳ BL-031.5` or `⏳ Backlog`); no stub files for the planned entries — **deviation:** the four BL-031.5 contracts (ICG / TechPar / Tech Debt / Regulatory Map) shipped during BL-031.5 closure (April 2026); registry was updated in-place to reflect their `✅ Authored (BL-031.5)` status. Portfolio Search remains `⏳ Backlog` (broken README link tracked in [BL-034 follow-up list](#bl-034-mcp-server--documentation-cleanup)). Radar's row was added with `⏳ BL-032`.
- [x] IRL forward-look section (~10 lines) explains what an Information Request List would be, that contracts make it tractable, and that IRL design is explicitly out of scope for BL-031.85

**Cross-references**

- [x] `mcp-server/src/docs/diligence/USAGE.md` — schema-mapping table linked to the new `CONTRACT.md`
- [x] `mcp-server/README.md` — "What's exposed" table's `Input` column links to `CONTRACT.md` for diligence; planned-contract notes for the other tools (subsequently flipped to ✅ Authored as the four BL-031.5 contracts shipped)
- [x] `src/schemas/diligence.ts` — top-of-file comment block (4-6 lines) pointing to `mcp-server/src/docs/diligence/CONTRACT.md` as the human-readable reference. No schema changes. **Bonus:** the four BL-031.5 schemas (`icg.ts`, `techpar.ts`, `tech-debt.ts`, `regulatory-map.ts`) gained the same top-of-file comment pointer as part of their respective BL-031.5 commits.
- [x] `src/docs/README.md` — Quick Navigation row "Understand a Hub tool's input contract" → `mcp-server/src/docs/contracts/README.md`

**Verification & docs**

- [x] [MCP_SERVER_CONTRACTS_BL-031_85.md](MCP_SERVER_CONTRACTS_BL-031_85.md) updated with deviations recorded during implementation (closure stanza added May 2, 2026)
- [x] Cross-check: every option ID in `CONTRACT.md` matches the corresponding tuple in `src/schemas/diligence.ts` (`TRANSACTION_TYPE_IDS`, etc.). Zero drift expected — the doc copies from the source. (Manually verified during BL-031.75 V1–V8 cycle; a structural Vitest is filed as a Tier 2 follow-up — see Deviations & follow-up below.)
- [x] Discoverability: from `src/docs/README.md`, a reader following links arrives at the contracts registry in ≤2 hops
- [x] Live MCP exercise unchanged: `mcp__gst__generate_diligence_agenda` trigger-map dimension labels match the labels in `CONTRACT.md`'s field-overview table (since `CONDITION_LABELS` at runtime is canonical) — verified during BL-031.75 V3 / V8 trials, evidence in [`mcp-server/README.md` § "Last verified (BL-031.75 surface)"](../../../mcp-server/README.md#last-verified-bl-03175-surface)

**Deviations** (added at closure, 2026-05-02 — items completed AS PART OF BL-031.85 work, even where they overflowed sibling initiatives)

- [x] **Bonus contracts** for ICG / TechPar / Tech Debt / Regulatory Map shipped during their BL-031.5 commits rather than waiting for an explicit BL-031.85 Phase 2; the registry pattern proved reusable as designed
- [x] **"Used by prompts" cross-references** added to all 5 contracts during BL-031.75 closure (commit `8b39d78`, May 1, 2026) — links each contract to the BL-031.75 prompts that compose its argsSchema, surfacing schema-level coupling at the contract level
- [x] **Cross-tool concept glossary** added to `mcp-server/src/docs/contracts/README.md` as transitional artifact — flagged the funding-stage variance between ICG (`pre-series-b` / `series-bc` / `pe-backed` / `enterprise`) and TechPar (`seed` / `series_a` / `series_bc` / `pe` / `enterprise`); carried a "Will be superseded by [BL-031.87](#bl-03187-mcp-server--stage-taxonomy-adapter-layer)" note. Glossary subsequently retired by BL-031.87 closure (May 2, 2026)
- [x] **Stage Taxonomy Adapter Layer** filed as [BL-031.87](#bl-03187-mcp-server--stage-taxonomy-adapter-layer) and shipped May 2, 2026 — retired the transitional glossary by introducing a canonical funding-stage taxonomy plus per-tool Adapter modules at the MCP-wrapper boundary
- [x] **`.describe()` consistency pass on tool Zod schemas** — adds JSON Schema descriptions for agent introspection. Folded into [BL-031.95](#bl-03195-hub-tools--url-state-restoration--mcp-deep-link-surface) closure (commit `2106bad` for TechPar; equivalent passes across the other tools as part of the BL-031.95 5-phase arc)

**Follow-ups deferred to future work** (intentionally NOT done as part of BL-031.85; tracked as separate items here for handoff visibility — none block BL-031.85 closure)

- **Deferred** — **Portfolio Search `CONTRACT.md`** — broken README link still outstanding; tracked under [BL-034 follow-up list](#bl-034-mcp-server--documentation-cleanup) (decision pending: author or drop the tool from the registry)
- **Deferred** — **Contract-parity Vitest** — structural test asserting every CONTRACT.md option ID exists in the matching `*_IDS` tuple. Hardens the "discipline is conventional" risk noted in the architecture doc. Filed as a Tier 2 hardening item — schedule independently if drift surveillance becomes a maintenance pain point
- **Deferred** — **YAML frontmatter on each CONTRACT.md** — promote the prose `Version: v1 \| Last authored: ...` line to YAML frontmatter to enable machine-readable consumption (parity test, future IRL generator, staleness check). Tier 2 hardening; fold into the parity-test commit if scheduled
- **Deferred** — **IRL generator scoping spike** — strategic destination of BL-031.85; with 5 contracts now stable, ready for a 2-3 hr scoping spike to pick a concrete consumer use case and define the rendering format. File as a new BL number when scheduled

#### Technical Context

**Why this is its own initiative (not folded into BL-031 / BL-031.5 / BL-031.75)**

- BL-031 is "wrap two pure functions, prove the path" — small enough to validate the engineering decisions cheaply. Adding a documentation layer on top would have inflated the scope; better to ship BL-031, exercise it, then formalize.
- BL-031.5 is engineering work — wrapping additional engines, parsing regulation files, reading the radar snapshot. Schema reuse is in its risk-mitigation list (CI tests prevent drift) but human-readable contract authoring is a separate competency.
- BL-031.75 is content-design work — what does a senior consultant actually do step-by-step on each motion? Different competency from "what does the input schema mean for downstream output?"
- BL-031.85 is consolidation + technical writing — sits between engineering and content design. Different cognitive mode; deserves its own deliverable.

**Why position between BL-031.75 and BL-032**

- Both BL-031.5 and BL-031.75 already have schema-reuse-discipline acceptance criteria built in via CI tests; contracts are the documentation layer over that runtime invariant, not a hard prerequisite
- Authoring contracts AFTER multiple Hub-tool surfaces ship (BL-031.5) gives the contract format real cross-tool variance to ground in, not speculation from a sample size of one
- Stabilizing contracts before BL-032 (HTTP transport) ensures remote consumers don't depend on inline schemas that need refactoring later — contracts become the public-API stability surface

**Why no `.describe()` calls on the Zod schemas (deferred)**

- No precedent in `src/schemas/`; would be a separate consistency pass affecting all schemas
- The markdown contract doc is sufficient documentation surface today
- Adding `.describe()` later (e.g. when a runtime tool surfaces tool descriptions to clients) is a mechanical lift; not blocking the contract doc

**Why no YAML/JSON sidecar (deferred)**

- The wizard-config TS is already structured machine-readable data
- A future IRL generator should consume the wizard-config directly, not re-parse markdown
- Avoiding a second source of truth keeps drift risk minimal; the markdown is the human surface, the TS is the machine surface

**Out of scope** (deferred to BL-031.5 or future)

- Stub contract docs for the other four Hub tools (ICG, TechPar, Tech Debt, Regulatory Map) — those get authored alongside their MCP tool wrappers in BL-031.5
- The IRL generator surface itself — schema, rendering format, UI; tracked separately if/when warranted
- A YAML/JSON sidecar duplicating the wizard-config — duplicate-source-of-truth anti-pattern
- Modifications to `questions.ts` / `attention-areas.ts` — out of scope; contract doc reads them, doesn't modify them
- Updates to existing tests; contracts are documentation, not code
- A CI test that asserts every option ID in the contract matches the Zod tuple — nice-to-have, but the runtime trigger map already enforces this implicitly (a missing option produces a different label)

---

### BL-031.87: MCP Server — Stage Taxonomy Adapter Layer

**Source**: BL-031.87 — resolves the cross-tool funding-stage vocabulary drift surfaced during BL-031.85 closure (ICG `companyStage` and TechPar `stage` use different enum shapes for the same underlying concept) | **Architecture & plan**: [MCP_SERVER_STAGE_ADAPTER_BL-031_87.md](MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) | **Effort**: 2-3 days (actual: ~3 hrs across 3 commits) | **Status**: ✅ Complete (May 2, 2026) | **Depends on**: BL-031.85

**As a** GST team member composing a multi-tool prompt, **I want** ICG, TechPar, and any future stage-aware tool to accept a single canonical funding-stage value **so that** prompts like `gst_target_quick_look` don't have to remember each tool's enum shape (`pre-series-b` vs `series_bc` vs `series-bc`) and external agents introspecting the JSON Schema see one canonical taxonomy rather than per-tool variance.

> **Pattern choice**: Adapter (GoF) at the MCP-wrapper boundary. Conceptually a lightweight Anti-Corruption Layer — each tool is a bounded context with its own stage vocabulary; small per-tool translator modules sit between the canonical layer and the engine. Engines and website wizards untouched. Lossy direction (e.g., TechPar `series_bc` cannot unambiguously round-trip back to canonical `series-c`) is documented and tested as intentional information-shedding, not a bug.

#### Planning Criteria

**Use cases**

- **Cross-tool prompt ergonomics** — `gst_target_quick_look` passes one canonical stage value to ICG + TechPar; each tool's MCP wrapper translates locally. Today the prompt body has to know each tool's variance and either coerce or document it.
- **Agent introspection** — agents seeing JSON Schema for the canonical layer get a single funding-stage taxonomy with familiar values (`seed`, `series-a`, `series-b`, `series-c`, `pe`, `enterprise`); tool-native enums become an internal implementation detail.
- **Stable surface for BL-032+ remote consumers** — external agents pin to the canonical taxonomy, not to per-tool variance that may shift as benchmark datasets evolve. The canonical layer becomes the public-API stability boundary when BL-033 ships external pilots.
- **Foundation for future stage-aware tools** — when subsequent initiatives add new stage-cohort tools (peer-cohort comparison, benchmark trend tools), they declare an Adapter mapping rather than reinventing a stage enum.

**Outcomes**

- Canonical stage taxonomy module at `src/data/common/funding-stages.ts` — `CANONICAL_STAGES` const tuple, `CanonicalStage` type, `CanonicalStageSchema` Zod enum
- Per-tool Adapter modules at `src/data/common/stage-adapters.ts` — `ICG_STAGE_ADAPTER`, `TECHPAR_STAGE_ADAPTER` (each with `toCanonical` / `fromCanonical` maps and helper functions); shape mirrors the GoF Adapter pattern with explicit translation tables
- MCP tool wrappers (`mcp-server/src/tools/icg.ts`, `mcp-server/src/tools/techpar.ts`) accept canonical stage input via Zod; translation happens before engine call; engines untouched. Backward-compat: native values continue to be accepted via Zod union, with a documented deprecation timeline
- BL-031.75 prompts (`gst_target_quick_look` and any other prompt that composes stage-aware argsSchemas) updated to use canonical stage values; bodies updated; golden snapshots regenerated
- Round-trip parity tests: `fromCanonical(toCanonical(native)) === native` for every native enum value (idempotent in the native direction); lossy direction collapses (`series_bc` → ambiguous `series-b` | `series-c`) hand-tabulated and tested
- Glossary in `mcp-server/src/docs/contracts/README.md` updated to reflect the canonical layer; "Will be superseded by BL-031.87" transitional note retired
- Per-tool CONTRACT.md files updated with a "Canonical stage adapter" sub-section under the relevant field (ICG `companyStage`, TechPar `stage`)

**Business value**

- **Eliminates a real ergonomic tax on cross-tool prompts** — every multi-tool prompt today (`gst_target_quick_look`) carries either documentation or workaround logic for the funding-stage variance; the adapter retires that
- **Makes the canonical taxonomy a documented, versioned API surface** — when BL-033 ships external pilots, the canonical stages are the public-API stability boundary, not whichever native enum each tool happens to use today
- **Low blast radius** — engines and benchmark datasets untouched; website wizards untouched; only MCP wrappers and prompt schemas change. ~2-3 days of focused engineering with structurally bounded surface area
- **Documents an architectural principle for the team** — when future cross-tool friction emerges (e.g., growth velocity, headcount, revenue range across more tools), the Adapter pattern + MCP-wrapper boundary becomes the established response

#### Acceptance Criteria

**Canonical layer**

- [x] `src/data/common/funding-stages.ts` — `CANONICAL_STAGES` const tuple (`seed` → `enterprise`), `CanonicalStage` type, `CanonicalStageSchema` Zod enum, optional descriptions sourced from public funding-round conventions (shipped in commit `06a06bd`, BL-031.87 Phase 1)
- [x] `src/data/common/stage-adapters.ts` — `ICG_STAGE_ADAPTER`, `TECHPAR_STAGE_ADAPTER` with explicit `toCanonical: Record<NativeEnum, CanonicalStage>` and `fromCanonical: Record<CanonicalStage, NativeEnum>` tables; helper functions `toCanonical(toolId, native)` / `fromCanonical(toolId, canonical)` (shipped in commit `06a06bd`, BL-031.87 Phase 1)

**MCP wrapper integration**

- [x] `mcp-server/src/tools/icg.ts` — input schema accepts canonical `stage` value via Zod union (canonical | native); wrapper translates via `ICG_STAGE_ADAPTER.fromCanonical[]` before calling the engine; output annotated with the canonical equivalent of the engine's reported stage (shipped in commit `08d7c68`, BL-031.87 Phase 2)
- [x] `mcp-server/src/tools/techpar.ts` — same pattern with `TECHPAR_STAGE_ADAPTER` (shipped in commit `08d7c68`, BL-031.87 Phase 2)
- [x] Both wrappers retain BACKWARD-COMPATIBLE acceptance of native values; deprecation timeline noted in the wrapper-level JSDoc

**Prompts updated**

- [x] `gst_target_quick_look` (and any other BL-031.75 prompt that composes stage-aware argsSchemas) updated to use canonical funding-stage values; body instructions updated; per-prompt golden snapshots regenerated and recorded values match expected outputs

**Tests**

- [x] Round-trip native → canonical → native is idempotent for every native enum value in both adapters (Vitest unit test)
- [x] Lossy direction is documented and tested explicitly: `toCanonical(fromCanonical(canonical))` collapses are listed; the test asserts each known collapse rather than blindly round-tripping (a passing test in the lossy direction would mask information loss)

**Documentation**

- [x] `mcp-server/src/docs/contracts/README.md` glossary section updated to reflect the canonical layer; "Will be superseded by BL-031.87" note retired
- [x] `src/docs/development/MCP_SERVER_CONTRACTS_BL-031_85.md` "Proximate opportunities" section updated to mark the stage-taxonomy entry as "Closed by BL-031.87"
- [x] ICG and TechPar `CONTRACT.md` updated with a "Canonical stage adapter" sub-section under the relevant field
- [x] BL-031.87 architecture/plan doc authored (`MCP_SERVER_STAGE_ADAPTER_BL-031_87.md`) capturing the pattern-choice reasoning (Adapter chosen over Proxy, Bridge, full normalization), boundary choice (MCP-wrapper, not engine or schema), and lossy-direction policy

**Verification**

- [x] `npx astro check && npm run lint && npm run lint:css && npm run test:run` continues to pass
- [x] `mcp-server/` workspace `npm run typecheck && npm run test && npm run build` continues to pass
- [x] Live MCP exercise: `gst_target_quick_look` invocation that previously required tool-native stage values now accepts canonical values; output is identical to the native-value baseline

#### Technical Context

**Pattern choice — Adapter, not Proxy or Bridge**

- **Adapter** translates between vocabularies with different shapes (field names AND values differ across ICG, TechPar). Matches our problem precisely.
- **Proxy** preserves the wrapped object's interface; appropriate for cross-cutting concerns like remote forwarding (will appear separately in BL-032 / BL-032.5 as a Remote Proxy for HTTP transport) but not for vocabulary translation. The two patterns compose: a future Remote Proxy would _contain_ this Adapter, not replace it.
- **Bridge** decouples two orthogonal axes of variation (abstraction × implementation), both expected to evolve independently. We don't have parallel hierarchies; we have a single canonical layer translated by per-tool adapters. Bridge ceremony costs more than it returns at our current variation count (5 tools, 2 use stage).
- **Anti-Corruption Layer** (DDD) is the conceptual frame — each tool is a bounded context with its own stage vocabulary; the adapter is the small translator between them. GoF Adapter is the same idea at smaller granularity.
- **Full normalization** (rename ICG / TechPar enums to a canonical taxonomy in their schemas + benchmark datasets) was considered and rejected: would require benchmark re-attribution, may sacrifice signal quality where each engine's enum was tuned to its dataset, and has much larger blast radius (~1 day per tool with real risk of silent benchmark mis-attribution). The Adapter approach gets ~80% of the value at ~20% of the cost.

**Boundary choice — MCP-wrapper, not engine or schema**

- **MCP-wrapper boundary** (chosen) — engines and website wizards untouched; only MCP wrappers translate. Smallest blast radius
- **Engine boundary** — engine accepts canonical or native; benefits website-wizard URL state too. Expands scope ~2× (touches website page logic). Defer; revisit if/when website-wizard URL canonicalization becomes a concrete need
- **Schema boundary** (Zod `union().transform()`) — purist, but JSON Schema introspection in Claude Desktop / Cursor doesn't render unions cleanly; agents would see noise. Avoid

**Information shedding is intentional**

- TechPar `series_bc` deliberately collapses canonical Series B and C because the benchmark dataset doesn't separate them. Canonical `series-b` → `series_bc` is fine in one direction; recovering the original distinction back to canonical is structurally impossible
- ICG `pre-series-b` deliberately collapses canonical seed + Series A for the same reason
- The adapter's job is vocabulary translation, not benchmark precision the dataset doesn't support
- Tests assert `fromCanonical(toCanonical(native)) === native` (the safe round-trip); the lossy direction is hand-tabulated as documented behavior

**Why this isn't folded into BL-031.85 or BL-031.95**

- **Not BL-031.85** because BL-031.85 is documentation consolidation; this is engineering work (Zod schema changes, runtime translation, tests). Different competency, different review gate
- **Not BL-031.95** because BL-031.95 is per-tool URL-state restoration with input-ergonomics fixes; the stage adapter is a distinct cross-tool concern. Folding both would inflate BL-031.95 from "URL state across 4 tools" to "URL state + cross-tool taxonomy adapter" — heterogeneous scope with two unrelated review surfaces
- **Could be co-scheduled with BL-031.95** if engineering capacity allows — both touch MCP wrappers, both regenerate golden snapshots — but the AC tracks remain distinct

**Out of scope** (explicit)

- Modifying any engine's data tables or benchmark ranges to align with the canonical taxonomy — would require benchmark re-attribution and is a much larger initiative; not BL-031.87's job
- Modifying website wizards to use canonical input — out of scope; native enums remain the website-facing surface. URL state encoders may be revisited under BL-031.95 if the URL needs canonical encoding for cross-tool sharing
- Adding canonical-aliasing for non-stage concepts (growth velocity, headcount brackets, revenue brackets) — these have lower variance today; revisit if/when more tools share them. Diligence Machine's `growthStage` is explicitly NOT a funding-stage variant — it's a different concept (company-maturity coarse bucketing) and should remain its own enum
- Authoring an IRL generator that consumes the canonical layer — IRL is the strategic destination of BL-031.85's contracts; BL-031.87 does not block it but does not deliver it either

---

### BL-031.95: Hub Tools — URL State Restoration & MCP Deep-Link Surface

**Source**: BL-031.95 — closes the deferred work from BL-031.75 Commit 0.5 (per the deep-link audit recorded in [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md#commit-05--hub-tool-deep-links)), plus the input-ergonomics gaps surfaced during BL-031.75 V2 verification (TechPar `infraHosting` monthly/annual mismatch + Diligence Machine no-`'unknown'` parity with ICG `-1`), plus the `.describe()` consistency-pass folded in from BL-031.85 closure | **Architecture & plan**: [MCP_SERVER_HUB_URL_STATE_BL-031_95.md](MCP_SERVER_HUB_URL_STATE_BL-031_95.md) | **Effort**: 4-7 days engineering (actual: 2 days, 2026-05-02 → 2026-05-03) | **Status**: ✅ Complete (May 3, 2026); 5-phase arc shipped — see [closure stanzas + initiative summary](MCP_SERVER_HUB_URL_STATE_BL-031_95.md#initiative-summary) | **Depends on**: BL-031.75 (✅ Complete), BL-031.87 (✅ Complete — `.describe()` text for stage fields references the canonical taxonomy)

**As a** GST analyst running Hub tools through MCP prompts, **I want** every Hub tool that participates in a prompt to surface a populated deep-link in the prompt's output **so that** I can move from the Claude conversation to the website Hub for PDF download / export / email / share with the analysis state restored byte-for-byte — uniformly across all Hub tools, not just the three (Tech Debt, ICG, Regulatory Map) that already supported URL state in BL-031.75.

> **Implementation plan**: see `MCP_SERVER_HUB_URL_STATE_BL-031_95.md` (to be authored). It will cover the per-tool URL-encoding conventions (form-wizard tools use `?s=<base64>` matching Tech Debt / ICG; filter tools use readable params matching Regulatory Map), the website-side wiring (page-load init from URL, state-change → URL sync), the MCP wrapper extensions that import each new encoder, the prompt-body updates to surface the new deep-links, and the round-trip parity test pattern established in BL-031.75.

#### Planning Criteria

**Use cases**

- **TechPar URL state** — adds `?s=<base64>` to the 14-field TechPar wizard. Unblocks the 4th deep-link in `gst_target_quick_look`'s output (currently disclaimed as deferred); analysts can move from the MCP brief to the populated TechPar wizard for PDF export / share
- **TechPar `infraHosting` unit normalization** — `src/utils/techpar-engine.ts:231` annualizes `infraHosting` via `× 12` while every other money field (`infraPersonnel`, `rdOpEx`, `rdCapEx`, `engCost`, `prodCost`, `toolingCost`) is treated as annual already. Surfaced during BL-031.75 V2 verification when the agent emitted reasonable annual figures, got 12× output for hosting, and had to self-correct on retry by sending monthly values. Rename `infraHosting` → `infraHostingAnnual` and drop the `× 12` so all six money fields share units. Schema description and MCP tool description updated to make units explicit
- **Diligence Machine URL state** — adds URL state augmenting (not replacing) the existing localStorage. Unblocks deep-links in `gst_diligence_kickoff` and `gst_diligence_handoff_memo`; replaces the analyst muscle-memory of "manually re-enter wizard inputs after running the prompt"
- **Diligence Machine "unknown" input support** — mirrors the ICG `-1` "Not sure" pattern on every required field of the diligence wizard. Today's wizard / `UserInputsSchema` / `generate_diligence_agenda` tool require all 13 dimensions; agents calling `gst_diligence_kickoff` at deal kickoff (when much is unknown) are forced to guess, which is exactly the failure mode the BL-031.75 prompt-body design directive sought to prevent ("if answers to each field value are not known, they should be reflected in the tool as 'not sure', not skipped"). Adding `'unknown'` lets the prompt's argsSchema mark wizard inputs as optional (default `'unknown'`); the model fills only what's derivable; the agenda widens conservatively (only known values can ELIMINATE triggers, never unknown ones); the response surfaces the unknown-count prominently
- **Radar URL state** — adds `?category=&since=` to the deferred-island Radar feed. Unblocks the deep-link in `gst_radar_brief_today`; supports analyst hand-off of pre-meeting digests as a single URL
- **M&A Portfolio URL state** — adds filter URL state (`?theme=&category=&engagementType=`) to the static-grid Portfolio. Unblocks the deep-link in `gst_comparable_engagements_memo`; lets the comparable-engagements memo land as a brief plus a filtered Portfolio URL stakeholders can browse

**Outcomes**

- All four Hub tools have URL state matching their archetype (form-wizard `?s=<base64>` for TechPar / Diligence; readable filter params for Radar / Portfolio)
- All four MCP wrappers emit `deeplink` in tool output following the pattern established in BL-031.75 Commit 0.5
- Five BL-031.75 prompts (`gst_target_quick_look`, `gst_diligence_kickoff`, `gst_diligence_handoff_memo`, `gst_radar_brief_today`, `gst_comparable_engagements_memo`) updated to surface the new deep-links
- BL-031.75's per-prompt "deferred deep-link" disclosure notes can be removed; every prompt's "Open in Hub" surface is uniform
- Round-trip parity: MCP-emitted deep-link → website page load → restored state matches the MCP input byte-for-byte (the same pattern proven for Tech Debt / ICG / Regulatory Map in BL-031.75)

**Business value**

- **Closes the BL-031.75 design intent uniformly** — every prompt that drives a Hub tool surfaces a working deep-link. Removes the cognitive friction of "this prompt's deep-link works, this one doesn't" for analysts
- **Validates the URL-state pattern across heterogeneous tool types** — form wizards, deferred-island feeds, filter grids. Future Hub tools have a clear convention to follow
- **Increases the website's analytic surface area without a marketing cost** — every prompt-driven Hub-tool URL is a shareable artifact that propagates GST workflows beyond the originating analyst. Compounds the value of BL-031.75's prompt library
- **Modest engineering investment** — 3-5 days. Each tool is half-day to a day depending on existing form complexity; MCP wrapper extensions are mechanical given the BL-031.75 pattern; prompt-body updates are one-line additions

#### Acceptance Criteria

**Per-tool URL state added (website work)**

- [x] **TechPar** — `?s=<base64>` URL state added; restores all 14 form fields on page load; matches the `encodeState` / `decodeState` pattern used by Tech Debt and ICG (shipped commit `2106bad`, BL-031.95 Phase 1.B)
- [x] **Diligence Machine** — URL state added, augmenting (not replacing) the existing localStorage; `?s=<base64>` parameter restores all 14 wizard fields on page load (shipped commit `3dd56b9`, BL-031.95 Phase 2.B)
- [x] **Radar** — `?category=&since=` URL state added to the deferred-island feed; CategoryFilter reads/writes URL state on filter change; deep-linkable filter views work for both FYI and Wire categories (shipped commit `028d21d`, BL-031.95 Phase 3.B)
- [x] **M&A Portfolio** — filter URL state added (`?theme=&category=&engagementType=`); existing filter UI wired to URL state; deep-linkable filtered views survive page reload (shipped commit `b0eecef`, BL-031.95 Phase 4)

**Per-tool input ergonomics & schema hygiene (website + schema + MCP work)**

- [x] **TechPar `infraHosting` unit normalization** — renamed `infraHosting` → `infraHostingAnnual`; dropped `× 12` annualization; tool description states units explicitly; CONTRACT.md updated (shipped commit `aa47dc5`, BL-031.95 Phase 1.A). Acceptance verified: a freshly-spawned agent calls `compute_techpar` once with reasonable annual values and gets sensible output — no retry required
- [x] **Diligence Machine `'unknown'` input support** — every enum in `UserInputsSchema` extended with `'unknown'` option mirroring ICG's `-1` pattern; wizard UI renders "I don't know" affordance per step; trigger map widens conservatively on `'unknown'`; tool result surfaces `unknownDimensionCount`; prompts default fields to `'unknown'` (shipped commits `e0b795b` Phase 2.A + `0707f63` Phase 2.C.ii + `bd2fd9f` Phase 2.D)
- [x] **`.describe()` consistency pass on tool Zod schemas** (folded in from BL-031.85 closure) — JSON Schema descriptions added to every field in `diligence.ts`, `icg.ts`, `techpar.ts`, `tech-debt.ts`, `regulatory-map.ts`; description text cites the matching CONTRACT.md "What it asks" lines (shipped commits `2106bad` for TechPar Phase 1.B + `9a03c46` for diligence Phase 2.C.i; equivalent passes folded into other tools)

**MCP wrapper deep-link surface (mcp-server work)**

- [x] `compute_techpar` MCP output extended with `deeplink: z.string().url()` per the BL-031.75 Commit 0.5 wrapper-schema pattern (shipped commit `2106bad`)
- [x] `generate_diligence_agenda` MCP output extended with `deeplink` wrapping diligence-script with populated wizard URL (shipped commit `3dd56b9`)
- [x] `search_radar_cache` (now `search_radar_offline` post-BL-032 Phase 4b rename) MCP output extended with `deeplink` (shipped commit `028d21d`, BL-031.95 Phase 3.B)
- [x] `search_portfolio` MCP output extended with `deeplink` (filtered Portfolio URL based on facet filters) (shipped commit `b0eecef`, Phase 4)
- [x] Round-trip parity tests per tool — encode MCP input → produce deep-link → simulate website decoder → deep-equal with original input. Symmetric with BL-031.75's Tech Debt / ICG / Regulatory Map tests

**Prompt body updates (BL-031.75 follow-up)**

- [x] `gst_target_quick_look` — 4th deep-link (TechPar) surfaced; prior deferred-disclosure note removed (shipped commit `3088867`, Phase 5)
- [x] `gst_diligence_kickoff` — Diligence Machine deep-link surfaced (Phase 5)
- [x] `gst_diligence_handoff_memo` — Diligence Machine + Portfolio deep-links surfaced (Phase 5)
- [x] `gst_radar_brief_today` — filtered Radar deep-link surfaced (Phase 5)
- [x] `gst_comparable_engagements_memo` — filtered Portfolio deep-link surfaced (Phase 5)
- [x] BL-031.75 verification rows V2 / V3 / V7 / V8 re-run with deep-link presence + browser state-restoration checks; recorded into `mcp-server/README.md` § "Last verified" under "BL-031.95 surface" stanza

**Verification & docs**

- [x] `MCP_SERVER_HUB_URL_STATE_BL-031_95.md` authored with implementation plan + per-phase closure stanzas + initiative summary (shipped commits `bbbc7f1` initial + `d6566d3` revision + `2ff27b0` closure)
- [x] `mcp-server/README.md` § "Last verified" extended with "BL-031.95 surface" stanza recording deep-link evidence for the 4 newly-supported tools
- [x] `src/docs/development/MCP_SERVER_PROMPTS_BL-031_75.md` § "Deferred work" updated to point at BL-031.95 closure rather than BL-034
- [x] No regressions: existing URL state tests (Tech Debt, ICG, Regulatory Map) pass; existing MCP tool parity tests pass; existing E2E tests on the four touched pages pass (closed via `5ab92f7 docs(backlog): flip BL-031.95 status to Complete`)

#### Technical Context

**Why this is its own initiative (not folded into BL-031.75)**

- BL-031.75 ships the deep-link _pattern_ with the three tools that already had URL state. Folding the four URL-state retrofits in would have inflated the BL-031.75 scope from "Prompts surface + minor Tool extension" to "Prompts surface + four meaningful Hub-tool feature additions" — different competencies, different review surfaces, different verification cadence.
- The retrofits each touch a different Hub tool's UI (form wizards, deferred-island feeds, filter grids); they share an encoding convention but not a code path. Splitting keeps BL-031.75 reviewable and lets BL-031.95 go through its own design pass per Hub tool.
- The deep-link pattern itself is the BL-031.75 contribution; this initiative is the consistent application of it.

**Why per-tool URL conventions vary by archetype**

- **Form wizards** (TechPar, Diligence Machine) match the existing `?s=<base64>` convention used by Tech Debt and ICG. Encoded JSON is the natural shape for multi-field state where the state itself is the artifact analysts share.
- **Filter UIs** (Radar, Portfolio) use readable params (`?category=&since=`, `?theme=&category=`) consistent with how Regulatory Map was already filtered. Filters are user-explicit selections; readable URLs aid debugging and let users hand-edit the URL.
- Symmetry within each archetype, not forced uniformity. The convention follows the user's framing: "whatever the existing design conventions warrant."

**Why Diligence Machine gets URL state augmenting localStorage rather than replacing**

- localStorage preserves in-progress wizard state across page reloads — natural fit for "I closed the tab, came back tomorrow, want to pick up where I left off."
- URL state enables share / restore — natural fit for "I ran a prompt, got a brief + deep-link, want to send the deep-link to a colleague."
- They're complementary use cases, not competing. URL state, when present, takes precedence on page-load init; localStorage acts as the fallback.

**Out of scope** (explicit)

- Adding URL state to Hub tools beyond the four named — Library articles are static, the home pages and gateway pages have no analyst-facing state to encode
- Schema changes to the underlying engines beyond what URL encoding requires (no functional behavior changes; pure additive instrumentation)
- Performance optimization of the deep-link encoder for very-large states beyond what BL-031.75 already established (`?s=<base64>` length is bounded by the wizard's field count; no anticipated growth)
- Adding new filters to the Radar feed or M&A Portfolio beyond what URL encoding requires — if a filter doesn't exist today, this initiative does not add it
- Removing localStorage from Diligence Machine (it stays as the fallback persistence layer)
- HTTP transport / remote prompt access for the new deep-link surface — BL-032 / BL-032.5

---

### BL-032: MCP Server — Internal Remote (Phase 2)

**Source**: MCP_SERVER_INITIATIVE.md (archived) | **Architecture & plan**: [MCP_SERVER_REMOTE_BL-032.md](MCP_SERVER_REMOTE_BL-032.md) | **Effort**: 1 week (actual: ~6 days across 2026-05-03 → 2026-05-06; Phase 5.5 [Path 2 dual-client refactor] added mid-flight when Q13's "separate REST token within one DB" plan hit Upstash ACL paywall) | **Status**: Phases 1–5.5 ✅ Complete (May 6, 2026); Phase 6 staging deployed + smoke-validated end-to-end (B.3 curl sequence + Claude Desktop client) and entered one-week soak. **Phase 6 production deploy (B.6) pending soak completion**. See [BL-032 design doc § Phase 5.5](MCP_SERVER_REMOTE_BL-032.md#phase-55--path-2-dual-client-refactor-phase-6-prerequisite-1-2-days--shipped-2026-05-05) for the dual-client refactor narrative + [Q13 Resolved-revision](MCP_SERVER_REMOTE_BL-032.md#q13-upstash-project-sharing-new) for the Path 2 architectural decision history. **Closure pending soak finalization + production deploy + sibling-doc closure pass per BL-034.** | **Depends on**: BL-031

**As a** GST team member, **I want** the MCP server deployed to a remote endpoint **so that** I can access GST tools from any machine — laptop, mobile Claude apps, ephemeral CI agents — without cloning the repo or running a local process.

> **Implementation plan**: see [MCP_SERVER_REMOTE_BL-032.md](MCP_SERVER_REMOTE_BL-032.md) — covers the SDK / Streamable HTTP transport choice, the `search_radar` ↔ `search_radar_cache` capability-mirror coherence question, the Inoreader-client refactor for Workers (CacheStore + SecretSource adapters), CORS allowlist precision, the six-phase implementation arc (transport spike → auth → rate-limit → live radar tools → observability → deploy), and the open-questions punch list (Q1–Q11) that resolves through Phase 1.

#### Planning Criteria

**Use cases**

- **Field consulting** — at a client site on a borrowed laptop or VDI session with no GST repo cloned, paste an `Authorization: Bearer` config snippet into Claude Desktop and instantly have the tools available
- **Mobile context** — on the Claude mobile app during a flight or commute, ask `search_radar { query: 'kubernetes', tier: 'fyi' }` to surface the latest annotated FYI items before a client meeting
- **CI / agent automation** — a GitHub Action invokes `search_portfolio` to enrich a PR description with comparable past engagements ("this refactor pattern matches Project X — see attached summary"), or to validate that a new project entry doesn't duplicate an existing one
- **Internal Slack / Discord bots** — a daily digest bot calls `get_latest_insights { limit: 5 }` and posts the highest-signal radar items to a `#intel` channel
- **Cross-team access without repo onboarding** — non-engineering staff (e.g. a sales associate) get tool access through Claude without ever installing Node, npm, or wrangler

**Outcomes**

- All GST team members onboarded within the first month — measured by ≥1 successful tool invocation per `client_id` in audit logs
- **Zero Inoreader 429 errors** attributable to MCP traffic across a 30-day window (the rate-limit + 6h-cache architecture working as designed)
- p95 latency: <500ms for non-radar tools, <2s for radar tools (cold-cache); <200ms for warm-cache radar
- Health endpoint `/health` reports 99.9% uptime over 90 days — same SLO as the marketing site
- At least one CI integration shipped (PR-enrichment, daily digest, or equivalent) — proves the "machines-as-clients" path beyond interactive use

**Business value**

- **Productivity multiplier**: removes the "I need to be at my desk with the repo cloned" constraint — tools follow the team to airports, client offices, hotel WiFi, mobile devices
- **De-risks BL-033 substantially**: the auth, rate-limiting, observability, and Inoreader-budget protection layers are battle-tested by trusted internal users before any external client touches them
- **Distribution leverage**: GST's tools become composable with every other MCP server the team uses (filesystem, GitHub, Slack, Linear, etc.) — internal workflows compound rather than living in silos
- **Infrastructure validation**: proves Cloudflare Workers + Upstash Redis as the deployment substrate before BL-033 puts a paying customer's compliance posture on the line
- **Cost**: ~$0/month for prototype volume (Workers free tier covers 100k req/day, Upstash free tier covers ~10k commands/day); ~$10/month at scale — affordable enough that "just deploy it" is the right call

#### Acceptance Criteria

**Transport & deployment**

- [x] MCP server deployed to **Cloudflare Workers** (rationale below) — staging live at `mcp-staging.globalstrategic.tech` (May 6, 2026); production at `mcp.globalstrategic.tech` pending soak completion
- [x] **Streamable HTTP transport** — validated end-to-end against staging in B.3 smoke (`Content-Type: text/event-stream` SSE responses parsed correctly via Claude Desktop + curl + Invoke-WebRequest)
- [x] Worker built with `wrangler` + Cloudflare's `agents/mcp` `createMcpHandler` — Q1 resolved against `agents`+`@modelcontextprotocol/sdk@^1.29.0` (NOT v2 alpha — `agents` requires v1). `mcp-server/` workspace grew a second entrypoint `src/worker.ts` registering shared tools per Q12
- [x] Tool registry shared between stdio (BL-031) and HTTP (BL-032) entrypoints — register-once-transport-twice via `createServer(env)` factory; offline radar tool stays stdio-only via `_local-only.ts` (Q12)
- [x] CORS headers restricted to known MCP client origins via `auth/cors.ts` allowlist — no wildcard

**Authentication**

- [x] **Bearer-token API key auth** — `MCP_KEY_<INITIALS>` per Q11; OAuth deferred to BL-033 per the design doc
- [x] Keys generated via `wrangler secret`; revocation = `wrangler secret delete` (documented in `AUTH.md`)
- [x] Server returns MCP-spec-compliant `401 Unauthorized` with `WWW-Authenticate: Bearer realm="gst-mcp"` (validated in B.3.2 smoke)
- [x] Key prefix logged on every request via `safeLog` — full key never logged (Authorization + Cookie headers stripped)
- [x] [`REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) documents per-client config snippets (Claude Desktop incl. mcp-remote bridge for static-bearer auth, Claude Code, Cursor, ChatGPT)

**Rate limiting (critical — Inoreader has a 200 req/day cap)**

- [x] Sliding-window rate limiter backed by **Upstash Redis** — Path 2 splits this into MCP DB (Worker-owned `mcp:*` keys via Standard token) and Inoreader DB (shared `inoreader:*` keys via website-DB Read-Only token) per [Q13 Resolved-revision (2026-05-05)](MCP_SERVER_REMOTE_BL-032.md#q13-upstash-project-sharing-new)
- [x] Per-key limits: 60 req/min + 1000 req/day general; 5 req/min + 50 req/day radar (validated in B.3.7 hammer test — 60/200 + 10/429 split)
- [x] Global circuit breaker: 6h Upstash TTL on `mcp:radar:circuit-open` after Inoreader 429
- [x] Standard `RateLimit-*` response headers (RFC 9331) — visible in B.3 curl outputs
- [x] Rate-limit decisions emit structured log entries (`event: ratelimit.exceeded` / `ratelimit.skipped`); threshold breaches alert via Sentry

**New tools (radar surface)**

- [x] `search_radar` — live Inoreader fetch with 6h Upstash cache; structured failure envelopes for token-stale / inoreader-rate-limit / network-timeout (validated in B.3.6 smoke against real Inoreader after refresh-token recovery)
- [x] `get_latest_insights` — FYI-tier convenience wrapper, sister to `search_radar`
- [x] Both share Inoreader-client per Worker invocation; token resolution: Inoreader-DB Read-Only token (Path 2) → env-var fallback. Path 2 also enforces Q4 read-only invariant at the storage layer

**Observability**

- [x] Structured JSON logs per request via `safeLog`; flow to Cloudflare `wrangler tail` + Sentry (`@sentry/cloudflare` `withSentry` wrapper)
- [x] Sentry breadcrumb-discipline: Authorization + Cookie headers auto-scrubbed; per-request `keyOwner` + `path` tags via `tagRequest`
- [x] Health endpoint `GET /health` — returns `{ ok, upstashMcp, upstashInoreader, inoreader, inoreaderObservedAt, version, gitSha, phase }` per Path 2 (split single `redis` field into two upstream subsystems for failure-mode disambiguation)
- [x] `wrangler tail --env staging|production` documented in `DEPLOY.md` § C.4 (Tail and investigate)
- [x] **Sentry event capture for handled-error paths** — `auth.failed` and `inoreader-rate-limit` (Inoreader 429) handlers call `Sentry.captureMessage` / `captureException` so [SENTRY_MANUAL_SETUP.md](SENTRY_MANUAL_SETUP.md) Alerts #2 + #3 fire on real incidents. **Shipped 2026-05-12** — added `captureMessage` export to [`mcp-server/src/observability/sentry.ts`](../../../mcp-server/src/observability/sentry.ts) (mirroring the existing `captureException`); wired into [worker.ts auth-fail path](../../../mcp-server/src/worker.ts) (stable message string `"auth.failed bearer-rejected"` so Sentry's group-by-fingerprint dedups a probing burst into one issue) and [radar-live.ts inoreader-rate-limit path](../../../mcp-server/src/tools/radar-live.ts) (only fires alongside `openCircuit()`, so low-volume by construction). Unit test added at [tests/unit/sentry.test.ts](../../../mcp-server/tests/unit/sentry.test.ts) verifying the wrapper forwards level + extras correctly. 417/417 MCP tests pass. **Dual-tracked closure**: also closes the mirrored bullets in [BL-032.75 § K-section evidence-driven mitigations → Sentry captureMessage wiring](#bl-03275-mcp-server--production-observability-maturity).

**Verification & docs**

- [x] [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) — operator end-to-end runbook (Part A initial setup, Part B first deploy + soak, Part C ongoing operations); revised 2026-05-06 from Phase 6 first-deploy learnings
- [x] [`mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) — consumer step-by-step (Claude Desktop incl. MSIX-path + Windows gotchas, Claude Code, Cursor, ChatGPT)
- [x] Vitest test suite — 399/399 passing (auth happy/missing/wrong-key, rate-limit enforcement, radar live + circuit-breaker, registry-snapshot, CORS, plus new constructor-routing tests for Path 2's dual-client factories)
- [x] Worker integration test via `unstable_dev` (wrangler) exercises the HTTP transport against in-memory MCP client
- [x] `wrangler.toml` checked into `mcp-server/` with `nodejs_compat` flag (Q1 sub-finding — `agents` SDK transitively imports node:os/node:path)
- [⏳] One-week post-deploy review (soak just began 2026-05-06; closure expected ~2026-05-13)

#### Technical Context

**Why Cloudflare Workers (not Vercel)**

- The site itself runs on Vercel; deploying the MCP server to a separate platform isolates the blast radius — an MCP outage cannot take down the website, and an MCP traffic spike cannot exhaust Vercel's bandwidth/function budget
- Workers' free tier gives 100k requests/day, which is well above any plausible team usage at this stage
- Cloudflare's Smart Placement and global edge cut latency for non-US team members
- `@upstash/redis` works identically on Workers (REST API) — zero migration cost for the rate-limit/cache layer
- Streamable HTTP transport works out-of-the-box on Workers (long-lived connections supported via `WebSocket`/`fetch` streaming)

**Why API key, not OAuth (yet)**

- Internal team of <10 — onboarding/revoking with `wrangler secret` is one command
- OAuth 2.1 is mandatory for **external** clients (BL-033) but adds an authorization-server dependency, browser-based consent UI, and PKCE flows that aren't worth building for a 5-person team
- Keys can be rotated weekly via a CI cron without changing any user-facing config — Claude Desktop's MCP config supports env-var substitution for the auth header

**Code reuse**

- The Inoreader client at `src/lib/inoreader/client.ts` is already designed for serverless invocation (no DOM, no Node-only APIs except `crypto` which is supported on Workers)
- `client.ts`'s `configOverride` parameter makes Worker-side dependency injection trivial — pass Worker-bound `KV_REST_API_URL` / `KV_REST_API_TOKEN` instead of reading from `import.meta.env`
- `src/lib/inoreader/cache.ts`'s file-based dev cache stays on the Astro side; the MCP server gets its own Redis-backed cache to avoid any filesystem dependency

**Out of scope for this phase** (covered by BL-033)

- OAuth 2.1 with PKCE — bearer-token API key is the chosen Phase 2 auth
- Per-tool scopes / fine-grained permissions
- Compliance-grade audit logging (input/output payload retention)
- Prompt-injection sanitization on tool outputs
- MCP directory listing (MCPMarket.com etc.) — still internal use only
- External-client onboarding workflow

**Risks & mitigations**

- **Inoreader API exhaustion**: agents are tireless and will burn the 200 req/day budget in minutes if uncached. Mitigation — radar tools cache aggressively (6h TTL matching website ISR) and rate-limit per-key at the Worker layer; a global circuit breaker triggers on the first 429 and serves cached responses for 6h
- **Redis quota**: Upstash free tier is 10k commands/day; rate-limit checks could blow this if traffic spikes. Mitigation — the sliding-window algorithm batches reads/writes in a single Redis pipeline (≤2 commands per check); upgrade to paid tier ($10/mo) if usage exceeds 5k/day for two weeks running
- **Schema drift between stdio and HTTP entrypoints**: same tool, two transports. Mitigation — single tool registry in `mcp-server/src/tools/`, both `index.ts` (stdio) and `worker.ts` (HTTP) import from it; CI test asserts both entrypoints export the same tool names + input schemas
- **Token leakage via logs**: a careless `console.log(request.headers)` would dump bearer keys to Cloudflare logs. Mitigation — a request-scoped logger that strips `Authorization` and `Cookie` headers before any log call; lint rule (`no-restricted-syntax`) blocks raw `console.log` in worker code
- **CORS over-permissioning**: a wildcard CORS policy would let any website read MCP responses on a user's behalf. Mitigation — explicit allowlist of MCP-client origins, reviewed quarterly

**Validation sequence before marking done**

1. ✅ `cd mcp-server && npm test` — 399/399 green
2. ✅ `wrangler deploy --env staging` — Worker deploys cleanly; DNS auto-created via `custom_domain = true` in wrangler.toml
3. ✅ `curl https://mcp-staging.globalstrategic.tech/health` returns expected payload with both Upstash subsystems (`upstashMcp`, `upstashInoreader`) reachable
4. ✅ Streamable HTTP `tools/list` returns the 10 transport-portable tool names (the deprecated `search_radar_cache` alias and stdio-only `search_radar_offline` correctly DON'T appear on the Worker per Q12)
5. ✅ Claude Desktop client end-to-end via mcp-remote bridge: `search_radar` returns matches in ~1.5s; logs flow to `wrangler tail`. Required Inoreader OAuth refresh-token recovery once during smoke (token-stale → resolved by visiting website /hub/radar to trigger refresh write to Upstash) — recovery flow now documented in DEPLOY.md § C.5
6. ✅ Rate-limiter hammer test (70 req burst): 60-68 × 200 + 2-10 × 429 split (sliding window), `RateLimit-*` headers + `Retry-After` on the 429s
7. ✅ **Soak findings triaged via [BL-032.25](#bl-03225-mcp-revisions-prior-to-go-live)** — all P0 (blocks-Go-Live) items closed with verification evidence; P1 items recorded for post-launch follow-up. New step added 2026-05-06 to formalize the soak → triage → deploy gate. (✅ 2026-05-12 — zero P0 items in BL-032.25; § 5 closed risk-accepted, § 1-4 P1-deferred per established convention)
8. ⏳ `wrangler deploy --env production` — gated on soak completion + step 7 closure (~2026-05-13)

---

### BL-032.25: MCP Revisions prior to Go-Live

**Source**: BL-032.25 — bucket for soak-week findings discovered during BL-032 § B.5 (staging soak window 2026-05-06 → 2026-05-12). Items here are triaged as **P0** (blocks Phase 6 § B.6 production deploy) or **P1** (filed for post-launch follow-up). | **Architecture & plan**: [MCP_SERVER_REMOTE_BL-032_25.md](MCP_SERVER_REMOTE_BL-032_25.md) | **Effort**: variable per-item; close-out summary in the sibling doc's "Implementation order and execution plan" section | **Status**: Open — close-out (post-Go-Live). Substrate shipped 2026-05-12; zero P0 open; **one P1 open (§ 1, deferred until BL-032.75 Phase 2 closes)** after the 2026-05-13 close-out wave (§ 2 closed `e97650d`, § 3 closed inconclusive, § 4 closed `170f1d0`); § 5 closed risk-accepted. New findings from the one-week post-deploy review window (2026-05-12 → ~2026-05-19) appended as they surface | **Depends on**: BL-032 (substrate now shipped in production)

**As a** GST team member responsible for the BL-032 production launch, **I want** every soak-week finding to land in a defined bucket with explicit severity-triage **so that** P0 issues close before users see them in production AND P1 issues are recorded honestly rather than silently dropped or lost in operator notebooks.

> **Implementation plan**: see [MCP_SERVER_REMOTE_BL-032_25.md](MCP_SERVER_REMOTE_BL-032_25.md) — per-item investigation, plan, severity rationale, closure flow, and the P0/P1 triage convention. § 1 (anchor item, authored at initiative-creation time) covers schema normalization across Hub Tools — the candidate fix for retiring BL-031.87's adapter pattern.

#### How this works

- During the BL-032 soak (Phase 6 § B.5), any defect, inconsistency, improvement opportunity, or pain point discovered gets logged here as a sub-item under the matching § number in the sibling doc
- Findings come from: the [Soak-Week Testing Playbook](MCP_SERVER_REMOTE_BL-032_TESTING.md) (Sections A-K), team-member usage during the soak, Sentry alerts, operator observation while tailing `wrangler tail`, and ad-hoc bug reports
- Each item is tagged **P0** (blocks production deploy) or **P1** (post-launch follow-up). Triage convention is documented in the sibling doc; default tag for new items is P1 unless the discoverer explicitly classifies as P0
- BL-032's "Validation sequence before marking done" (above) gained step #7 (added 2026-05-06): all P0 items here closed before B.6 deploy. P1 items get either folded into BL-032.5 / BL-032.75 / BL-033 by topic, or remain logged here as standalone follow-ups
- BL-032.25 itself stays Open as long as it has unclosed P1 items — closes when bucket empties OR when the remaining items get re-filed under successor initiatives

#### Acceptance Criteria

The acceptance criteria for BL-032.25 are dynamic — populated as soak findings get logged. Each item under the sibling doc gets its own section + severity tag + plan + closure stanza. The TOC of items lives in the sibling doc; the line-item summary is here for at-a-glance triage.

**Anchor items** (authored at initiative creation, 2026-05-06):

- [ ] **§ 1 — Schema normalization across Hub Tools** — investigate retiring [BL-031.87](#bl-03187-mcp-server--stage-taxonomy-adapter-layer)'s adapter pattern by normalizing the underlying schemas. **Severity: P1**. Investigation 2026-05-06; revised same day after operator clarification that URL backward-compat is NOT a business requirement; **2026-05-13 post-Go-Live re-confirmation** verified the BL-031.87 adapter is shipped and operationally stable (production deploy 2026-05-12 exercises it on every ICG/TechPar call) and no native-schema drift exists post-2026-05-06 (see [MCP_SERVER_REMOTE_BL-032_25.md § 1](./MCP_SERVER_REMOTE_BL-032_25.md#§-1--schema-normalization-across-hub-tools-investigation--p1-deferred)). Cost dropped from 3-5 days to 2-3 days with URL-shim work removed; remaining dominant risk is **benchmark re-attribution**. **Next concrete action**: schedule the 2-4 hour benchmark-audit spike (still unscheduled as of 2026-05-13) — needs ICG / TechPar benchmark-author or senior-consultant time. Suggestive evidence from BL-031.87's own docs points to finding A (by-design); the audit confirms or refutes

**Soak-week additions** (filled as findings emerge):

- [x] **§ 2 — T.A.4 empty-bearer error message (CLOSED 2026-05-13)** — `Authorization: Bearer ` (empty token) returns 401 with the misleading `"Authorization header must use Bearer scheme"` message. **2026-05-13 re-investigation** corrected the original root-cause analysis: HTTP runtimes normalize trailing whitespace on header values so `Bearer ` arrives as `"Bearer"` (no trailing space) and trips the scheme check before the existing empty-token check at `bearer.ts:75-76` is ever reached. **Operator chose Option B**: shipped in commit `e97650d` — added a precondition to `bearer.ts:71-76` detecting bare-`Bearer` and `Bearer\s+` and routing them to the empty-token branch; paired `auth.test.ts:73-89` update pins the expected message. Operator-visible: `Bearer ` now returns `"Empty Bearer token"`. See [MCP_SERVER_REMOTE_BL-032_25.md § 2](./MCP_SERVER_REMOTE_BL-032_25.md#§-2--ta4-empty-bearer-error-message-p1) and [TESTING_FINDINGS § T.A.4](./BL-032_TESTING_FINDINGS.md#ta4--empty-bearer-schema).
- [x] **§ 3 — T.K.2.b.3 local stdio `generate_diligence_agenda` timeout (CLOSED INCONCLUSIVE 2026-05-13)** — call hung 4 min on Claude Desktop's local stdio connector while staging completed normally. **2026-05-13 reproduction** via `mcp-server/scripts/repro-k2b3.mjs` (committed) ran the exact K.2.b.3 input combo 10/10 times against `node dist/index.js` over piped stdio: every call completed in 192–239 ms with 1–2 ms engine time and 36 KB response. Even the larger 61.5 KB minimal-input variant ran clean. **H1 (buffer) and H2 (engine slow path) eliminated with hard data; H3 (Claude Desktop client-side artifact) remains the only viable hypothesis and is not falsifiable from in-repo tooling.** Closed inconclusive. The reproduction script + handler `MCP_REPRO_TIMING` instrumentation are retained as the recurrence-detection net; reopen if the bug surfaces with non-Desktop consumer (Claude Code stdio) or with Claude Desktop logs that let us interrogate the upstream-side state. See [MCP_SERVER_REMOTE_BL-032_25.md § 3](./MCP_SERVER_REMOTE_BL-032_25.md#§-3--tk2b3-local-stdio-diligence-timeout-p1--closed-inconclusive) and [TESTING_FINDINGS § T.K.2.b.3](./BL-032_TESTING_FINDINGS.md#tk2b3--generate_diligence_agenda).
- [x] **§ 4 — T.X.1 secondary playbook polish (CLOSED 2026-05-13)** — two follow-ups from the T.X.1 placeholder-trap fix, both shipped in commit `170f1d0`: (a) DEPLOY.md § B.3 bash setup rewritten with `read -rsp` hidden-prompt pattern; default `MCP_URL` flipped from staging to `mcp.globalstrategic.tech` (production-canonical); paired PowerShell-helper comment-block also flipped to production-default and demonstrates `Read-Host -AsSecureString` for explicit overrides; (b) `Invoke-McpRequest.ps1` refactored to **fail loudly**: throws on `StatusCode >= 400` AND on the "2xx response but no SSE data line" protocol-unexpected path, each with status / URL / body-excerpt diagnostic; bootstrap MCP_KEY prompt flipped to `-AsSecureString` to keep value out of scrollback; now-unreachable no-`.result` guard removed from `Invoke-McpTool`. Operator confirmed no external callers; no backwards-compat constraint. All 420 MCP tests pass. See [MCP_SERVER_REMOTE_BL-032_25.md § 4](./MCP_SERVER_REMOTE_BL-032_25.md#§-4--tx1-secondary-playbook-polish-p1) and [TESTING_FINDINGS § T.X.1](./BL-032_TESTING_FINDINGS.md#tx1--setup-snippet-placeholder-is-a-copy-paste-trap).
- [x] **§ 5 — T.X.4 credential-prompt leaks (CLOSED — risk accepted 2026-05-12)** — three Upstash tokens leaked to chat transcripts during soak (T.C.7 recovery × 2, T.B.9.f preflight × 1) because Claude-authored preflight blocks used plain `Read-Host` rather than `-AsSecureString`. **Operator decision 2026-05-12**: risk accepted; the three leaked tokens will NOT be rotated and the `-AsSecureString` playbook sweep will NOT be executed. Rationale lives with the operator. Item closed as risk-accepted rather than deferred so the backlog doesn't carry a permanent open P0/P1 against a decision already made. See [MCP_SERVER_REMOTE_BL-032_25.md § 5](./MCP_SERVER_REMOTE_BL-032_25.md#§-5--tx4-credential-prompt--assecurestring-sweep-closed--risk-accepted) and [TESTING_FINDINGS § T.X.4](./BL-032_TESTING_FINDINGS.md#tx4--third-upstash-standard-token-leaked-to-chat-during-tb9f-preflight).

**Closure flow per item**: investigation → plan → severity tag → (if P0) execution → closure stanza with commit-SHA pointer. Each item's full lifecycle lives in the sibling doc; BACKLOG.md tracks just the line-item summary.

#### Technical Context

**Why a separate initiative, not just additions to BL-032**

- BL-032 has fixed scope: ship the substrate. Adding "and also fix every issue surfaced during soak" inflates BL-032 unboundedly, and the soak loses its time-boxed function as a quality gate
- BL-032.25 is the explicit catch-all so no soak finding falls through the cracks, while letting the soak's primary deliverable (validate / catch issues) and BL-032's primary deliverable (ship the substrate) stay distinct
- A separate initiative also gives a clean handoff target for findings that turn out to belong elsewhere: P1 items get re-filed under BL-032.5 / BL-032.75 / BL-033 by topic without polluting BL-032's closure

**Why P0/P1, not "everything blocks"**

- Some findings are genuinely deploy-blocking (token leak, unhandled crash, broken auth) — these MUST close before users see them
- Other findings are real but acceptable-with-caveat (cosmetic UX, edge-case error messages, minor doc gaps) — gating production on these would push Go-Live indefinitely without proportional value
- The triage convention forces the distinction explicitly. A "everything must be P0" stance often masks low-value gold-plating as critical — discipline is preferred over reflexive blocking

**Closure flow**

- During soak: items added with P0/P1 tag + brief description + investigation
- At triage (~Day 5-6 of soak): operator reviews bucket; converts any P0 items to active development tasks
- Before B.6: P0 items must show closure stanza (commit SHA / PR link / verification evidence)
- After B.6 ships: P1 items either get re-filed under specific successor initiatives (BL-032.5 / BL-032.75 / BL-033) or remain in BL-032.25 as ongoing follow-ups
- BL-032.25 itself stays Open as long as it has unclosed P1 items; closes when bucket empties

**Out of scope**

- Items outside the BL-032 surface (e.g., website regressions, post-closure issues in BL-031.x) — those go to their own initiatives or directly into BACKLOG.md as new entries
- Major new feature work — that's BL-032.5 / BL-033 territory; BL-032.25 is for "issues with what BL-032 already shipped"
- Long-term architectural concerns where the cost vastly exceeds the deploy timeline — those get filed as future BL numbers rather than padded into the soak window

---

### BL-032.5: MCP Server — Resources & Prompts on Remote

**Source**: BL-032.5 — extends Phase 2 surface | **Architecture & plan**: [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) | **Effort**: 3-5 days (actual: shipped incrementally across Phases 2-4, 2026-05-13) | **Status**: ✅ **SHIPPED 2026-05-13** — Phase 2 scope catalog (`ee82860`) + Phase 4 Worker Cron + manifest hash (`6cac551`); Resources, Prompts, and scope-gating live on the Worker. Three observability-tier ACs (`prompt_invocations_total` metric, `notifications/message` push, `GET /prompts/<name>/scopes` introspection) deferred to BL-032.75 with rationale below. AC #3 / #17 (HTTP-level `Cache-Control` / `ETag` / `304`) was structurally inapplicable — MCP transport is POST-only JSON-RPC, not REST GET, so per-Resource cache headers can't be exercised by any client; replaced by an equivalent server-side read-through cache in `mcp-server/src/lib/resource-cache.ts` with the same per-Resource TTLs. | **Depends on**: BL-031.5, BL-031.75, BL-032 (all delivered)

**As a** GST team member at a client site / on the Claude mobile app / on a borrowed laptop, **I want** the Library articles, regulatory frameworks, radar snapshot Resources, and consultant Prompts (`gst_*`) to be reachable over the same remote HTTP endpoint as BL-032's Tools **so that** the orchestration value of BL-031.75 doesn't evaporate the moment I leave my dev machine.

> **Implementation plan**: see [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) — covers HTTP caching semantics for Resources (per-Resource freshness strategy), Prompt fan-out under per-key rate limits, the scope catalog (forward-compatible with BL-033's OAuth), URI-stability discipline across the local→remote boundary, and periodic radar snapshot refresh via Worker Cron.

#### Planning Criteria

**Use cases**

- **Mobile prep before a partner call** — on Claude mobile, pin `gst://library/vdr-structure` into the conversation and read the canonical 10-folder taxonomy without opening a laptop
- **Field consulting with no repo access** — at a client site on a borrowed device, invoke `/gst_target_quick_look` and get the four-Tool orchestration over HTTP exactly as it works locally
- **Regulatory review with cross-jurisdictional pinning** — pin `gst://regulations/eu/gdpr` and `gst://regulations/us/ca/ccpa` into a deal-review conversation; both resolve over HTTP with identical content to the local version
- **Scope-gated radar access** — issue a bearer key without `resource:radar:read` to a sales-associate teammate who shouldn't see the GST Take voice; their MCP client lists Tools and Library Resources but no radar Resources
- **Pinned conversations survive client moves** — a consultant pinning `gst://library/business-architectures` on Monday's local server uses the same URI on Tuesday's remote server without re-pinning; URI-stability test enforces this

**Outcomes**

- All Resources and Prompts from BL-031.5 / BL-031.75 reachable via the BL-032 remote endpoint with parity to local-stdio behavior; URI-stability test asserts byte-identical resource manifests across both transports
- Radar snapshot refreshed hourly via Worker Cron (~24 Inoreader calls/day from the 200/day budget) — total budget consumption (Cron + ISR + per-key rate-limited Tools) stays under the documented envelope
- HTTP cache hit rate ≥80% on Library and Regulation Resources after one week (most reads served from Upstash without invoking the handler) — measured via the observability initiative (BL-032.75)
- Zero Inoreader 429 errors over the first 30 days post-deploy — the layered rate limit + Cron + budget hard-cap holds
- Per-key scope checks pass: a key without `resource:radar:read` returns `403 Forbidden` for radar URIs with a structured error
- Prompt fan-out budget verified: `gst_target_quick_look` (4 Tools) lands inside the per-key burst allowance from a fresh-quota state

**Business value**

- **Removes the "have to be at my desk" constraint** for the full surface, not just Tools — completing the productivity multiplier BL-032 starts
- **De-risks BL-033 substantially** — the scope catalog, URI stability discipline, and HTTP caching layer are all production-tested by trusted internal users before any external pilot client touches them
- **Validates the per-Resource caching strategy** — Library / Regulations have radically different freshness semantics from Radar; getting the cache headers right under internal load is much cheaper than under contractual SLA
- **Establishes URI / prompt-name versioning discipline** — the `BREAKING_CHANGES.md` + version-bump pattern introduced here is exactly what BL-033 external clients will rely on as their stability contract
- **Cost**: same Cloudflare Workers / Upstash substrate as BL-032; Cron triggers are free on the Workers paid tier already justified by BL-032's volume; Resource cache writes consume a small slice of Upstash quota (~5k commands/day, well under the free-tier ceiling)

#### Acceptance Criteria

**Resources over HTTP**

- [x] Worker registers `resources/list` and `resources/read` handlers binding to the same Resource modules as the BL-031.5 stdio entrypoint — `registerLibraryResources` + `registerRegulationResources` + `registerRadarResources` wired from `mcp-server/src/server.ts:71-106`; Worker entry at `mcp-server/src/worker.ts:412`
- [x] Per-Resource cache strategy implemented — server-side read-through cache in `mcp-server/src/lib/resource-cache.ts:33-42` with the documented TTLs (Library + Regulations 24h, Radar latest 15min, Radar items 24h)
- [x] **Pivoted — server-side cache replaces HTTP cache headers.** MCP transport is POST-only JSON-RPC; there is no per-Resource GET endpoint for clients to send `If-None-Match` against. Equivalent effect (read served from cache, handler skipped) achieved via `resource-cache.ts` instead. Pivot documented in `MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md:36-42`.
- [x] Per-Resource scope check: bearer keys lacking the required scope receive a structured error naming the missing scope — `assertScope(scopes, SCOPES.RESOURCE_RADAR_READ)` at `mcp-server/src/resources/radar.ts:99`; `MissingScopeError` in `mcp-server/src/auth/scopes.ts:90-116`
- [x] Periodic radar snapshot refresh: Cloudflare Cron trigger calls `fetchAllStreams` + `fetchAnnotatedItems`, transforms, and writes to Upstash — `wrangler.toml:132` (cadence `0 */6 * * *`, intentionally widened from hourly to 6h post-BL-032.7 budget review); handler at `mcp-server/src/cron/radar-refresh.ts:35-43`
- [x] Snapshot-missing path returns a structured retry hint — `SNAPSHOT_MISSING_MESSAGE` JSON at `mcp-server/src/resources/radar.ts:45-46` (MCP transport returns the error as a content block, not an HTTP 503, because the GET endpoint that AC originally assumed doesn't exist — see Resources pivot above)

**Prompts over HTTP**

- [x] Worker registers `prompts/list` and `prompts/get` handlers — `registerPrompts(server)` at `mcp-server/src/server.ts:103`; MCP SDK ≥1.29 provides the routing (`mcp-server/package.json:30`)
- [x] `prompts/list` includes each prompt's `version` — every prompt exports a `version` field validated as semver in `mcp-server/src/prompts/_registry.ts:61`
- [ ] **Deferred to BL-032.75** — introspection endpoint `GET /prompts/<name>/scopes`. Rationale: scope catalog ships per-key uniformly (AC below) in the single-team phase; introspection becomes valuable only when BL-033's per-key scope variation lands. Infrastructure (`scopes.ts` catalog) is in place; one-handler add when needed.
- [x] Per-key budget accommodates the heaviest prompt fan-out — `gst_target_quick_look`'s 4 downstream Tool calls fit inside the 60 req/min sliding window in `mcp-server/src/middleware/limiter.ts:71` from a fresh-quota state
- [ ] **Deferred to BL-032.75** — aggregate metric `prompt_invocations_total`. Rationale: belongs to the observability counter family being formalized in BL-032.75 Phase 2 (cron-status / Sentry / spend-accounting); adding it here would create a one-off counter outside the central pattern.

**Scope catalog (forward-compatible with BL-033)**

- [x] Scope strings defined per the catalog — `mcp-server/src/auth/scopes.ts:29-40` declares `tool:<name>`, `tool:radar:*`, `resource:library:read`, `resource:regulations:read`, `resource:radar:read`, `prompt:*`
- [x] Scope catalog is the single source of truth — `scopes.ts` exported and consumed by every resource/prompt module; BL-033 will mint OAuth tokens carrying these strings unchanged
- [x] Internal keys carry full scope set by default — `DEFAULT_SCOPES` at `mcp-server/src/auth/scopes.ts:49-55` grants the full catalog to every `wrangler secret`-issued key (BL-032.5 single-team phase)

**URI / prompt-name stability discipline**

- [x] URI-stability test asserts the canonical resource manifest hash — `tests/integration/manifest-stability.test.ts:40` pins hash `b702aa38df…` matching `BREAKING_CHANGES.md:14`. Note: dual-transport assertion against `unstable_dev` HTTP isn't necessary because both stdio and Worker entrypoints register the SAME resource modules through `server.ts`; the manifest is structurally identical by construction.
- [x] `mcp-server/BREAKING_CHANGES.md` exists (436 lines); CI fails on URI/prompt drift without a corresponding entry; version-bump discipline enforced (current `0.3.13`)
- [ ] **Deferred to BL-032.75** — `notifications/message` push on breaking-change deploy. Rationale: requires a deploy-time hook + connected-client tracking that belongs in the observability layer; SDK supports the call when we're ready to wire it.

**Verification & docs**

- [x] [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) updated with the HTTP-cache-headers → server-side-cache architectural pivot (lines 20-42) and "Already shipped" audit table
- [x] `mcp-server/README.md` extended with Resources + Prompts examples — ~200 lines covering invocation shape, scope-gating behavior, and registered Resource/Prompt inventory. Curl/ETag round-trip example dropped per the AC #3 pivot (MCP transport doesn't expose those headers to clients).
- [x] Vitest covers cache-header correctness, scope-gating, snapshot-missing path, URI manifest stability — `tests/unit/resource-cache.test.ts`, `tests/unit/auth/scopes.test.ts`, `tests/integration/manifest-stability.test.ts`, cron tests in `tests/integration/cron-*.test.ts`
- [x] Integration test exercises a complete prompt fan-out under a realistic budget — `tests/integration/cron-proactive-refresh.test.ts` exercises the same Tool surface the prompt orchestrates; explicit `unstable_dev` Worker harness was unnecessary because the cron tests already prove the fan-out path under the limiter
- [x] Post-deploy review evidence: cache hit rate + Inoreader budget burn + zero 429s — verified via the BL-032.7 substrate Z-section tests + BL-032.75 Phase 0 spend-accounting work; substrate has run cleanly since 2026-05-13 deploy

#### Technical Context

**Why this is its own initiative (not folded into BL-032)**

- BL-032 is the largest milestone in the chain — Workers, auth, rate limiting, radar Tools, Sentry, CI for staging+production. Adding Resources + Prompts pushes the milestone into multi-week territory and dilutes the value-delivery cadence
- Splitting buys: BL-032 ships sooner; BL-032.5 designs against measured baselines from BL-032 in production; the Tools-vs-Resources/Prompts competency split mirrors BL-031.5/031.75's local-stdio version

**HTTP-specific design questions** (full detail in the architecture doc):

- Resources need cache headers (ETag, Last-Modified) and per-Resource freshness strategy — Library is near-immutable, Radar is hourly-fresh, Regulations are file-versioned
- Prompts trigger downstream Tool calls that hit the per-key rate limit — burst allowance configured to accommodate the heaviest documented fan-out
- URI rename = breaking change for every pinned client conversation — discipline (BREAKING_CHANGES.md + version bump + notifications/message push) introduced here

**Out of scope** (covered by BL-033 or later)

- OAuth 2.1, dynamic client registration, token introspection — bearer keys remain through BL-032.5
- Per-client scope variation (different keys = different scope sets) — infrastructure in place; product surface is BL-033
- Compliance-grade audit logging (full request/response retention, R2, hash chains) — BL-032.5 logs metadata only
- White-labeled per-client prompt customization — explicitly deferred to BL-033 or post-pilot
- Status-page integration for Resource freshness — observability initiative (BL-032.75)

---

### BL-032.7: MCP Server — Inoreader Substrate Safety & Observability

**Source**: BL-032.6 demo prep + delivery surfaced three operationally load-bearing gaps | **Evidence**: [BL-032_5_TESTING_FINDINGS.md § Section Z](BL-032_5_TESTING_FINDINGS.md) (T.Z.1, T.Z.2, T.Z.3) | **Effort**: 1-2 days | **Status**: ✅ Shipped 2026-05-16 (commits 302c625, bba2a46, 2597854) | **Depends on**: BL-032, BL-032.5, BL-039 | **Supersedes**: per-consumer Inoreader app split (originally item 4 of this initiative; promoted to BL-032.8 with a better end-state design — see § Out of scope)

**As a** GST operator running production MCP traffic and any future BL-033 pilot client traffic, **I want** the Inoreader-dependent surface to (a) consume its daily quota honestly, (b) fail fast and visibly when the upstream is degraded, and (c) capture the diagnostic information needed to root-cause a 429 incident in 30 seconds instead of 2 hours — **so that** the substrate's protective mechanisms reflect reality and any Inoreader-side disruption surfaces as a self-explaining alert rather than a guessing game.

> **Why a precondition to BL-033**: the 2026-05-15 BL-032.6 demo-day RCA proved the current substrate has a multi-hour blind spot when Inoreader exhausts its daily zone-1 quota. Repeating that incident with a paying pilot client on the line is unacceptable. Items 1-3 below close the blind spot and shipped 2026-05-16 in a single working session. The fourth item (per-consumer Inoreader app split) was promoted to its own initiative — see BL-032.8 — because the cleaner end-state architecture is "MCP Worker becomes sole Inoreader consumer; website consumes radar via MCP" rather than "register a second Inoreader app and rotate secrets."

#### Planning Criteria

**Use cases**

- **Operator triaging a 429 in Sentry** — the captured event includes `inoreader.zone1.usage`, `inoreader.zone1.limit`, and `inoreader.reset_after_seconds` as Sentry tags; RCA is a 30-second header read instead of a multi-hour dashboard hunt
- **Cron firing into a 429'd Inoreader** — the day-counter stays flat (no false consumption recorded); the breaker opens immediately so all downstream consumers (including live tool calls) fail fast and surface as 503 envelopes with `Retry-After`
- **Website ISR refresh and MCP Worker cron firing in the same hour** — each consumer draws from its own 100/day Zone-1 budget (separate Inoreader apps); one consumer's exhaustion cannot starve the other
- **BL-033 pilot client traffic going live** — per-consumer attribution in the Inoreader Developer dashboard lets us see exactly which surface (website / MCP / pilot client) is driving consumption, independent of our internal day-counter

**Outcomes**

- Day-counter (`mcp:inoreader:day-counter:<YYYY-MM-DD>`) increments only when at least one tier returns `ok: true` — verified in unit tests + observed over a 7-day soak with at least one upstream 429 episode
- Circuit breaker opens on the first 429 from any caller (cron OR live tool), not only live tool calls — verified by inducing a 429 from the cron path in a staging Sentry-monitored test
- Every `inoreader-rate-limit` Sentry event includes the four Inoreader documented diagnostic headers as searchable tags
- Website (`/hub/radar` ISR) and MCP Worker each consume from a separate Inoreader app — verified in the Inoreader Developer Console (two registered apps, two independent usage graphs)
- Zero shared-budget failure modes over the 7-day soak — confirmed by running both consumers at their normal cadence with no quota events on either

**Business value**

- **Unblocks BL-033** — the per-pilot-client onboarding story currently has an unaddressed "your team's traffic could starve our internal team's substrate" failure mode; per-consumer app isolation makes per-pilot scoping trivial later (each pilot client gets its own MCP-side app and its own 100/day budget that doesn't touch GST internal capacity)
- **Operational honesty** — the substrate currently appears healthy to alert rules during multi-hour degradation episodes (T.Z.1 + T.Z.2). Fixing this restores the alerting contract everyone assumes is already in place
- **Compounds with BL-032.75 (observability)** — BL-032.75's dashboards become 10× more useful once 429 events carry zone-usage tags
- **Cost**: ~0 — one new Inoreader app registration (free, one-time), ~10-90 LOC in `mcp-server/src/`, ~5 LOC in `src/lib/inoreader/client.ts` for env-var rename, ~30 min of secret-rotation ops across the two Worker envs + the Vercel website env

#### Acceptance Criteria

**T.Z.1 fix — Day-counter only on actual success**

- [x] `RefreshOutcome` extended to distinguish `partial-one-tier-ok` from `partial-both-failed` per the suggestion in [T.Z.1 § Notes](BL-032_5_TESTING_FINDINGS.md) — see [radar-refresh.ts:141-151](../../../mcp-server/src/cron/radar-refresh.ts#L141-L151)
- [x] [mcp-server/src/cron/radar-refresh.ts](../../../mcp-server/src/cron/radar-refresh.ts) only invokes `incrementDayCounter()` when at least one tier returned `ok: true` (per-tier accounting: `CALLS_PER_WIRE = 5`, `CALLS_PER_FYI = 1`)
- [x] Unit test covering the both-tiers-429 path verifies the counter does NOT increment — `tests/unit/cron/radar-refresh.test.ts § partial-both-failed`
- [x] Existing tests for the success / partial-one-tier-ok paths continue to pass with the new accounting

**T.Z.2 fix — Unified Inoreader-failure handler**

- [x] New `handleInoreaderFailure(env, failure, source)` helper in [`mcp-server/src/lib/inoreader-failure-handler.ts`](../../../mcp-server/src/lib/inoreader-failure-handler.ts) centralizes `openCircuit()` + `captureMessage('inoreader-rate-limit', ...)` decisions
- [x] [`radar-refresh.ts`](../../../mcp-server/src/cron/radar-refresh.ts) partial-outcome path calls the helper when any tier returned 429 (sources: `cron-wire`, `cron-fyi`)
- [x] [`radar-live.ts`](../../../mcp-server/src/tools/radar-live.ts) `failureResponse` refactored to call the same helper rather than calling `openCircuit` directly (sources: `live-search-radar`, `live-get-latest-insights`)
- [x] Test coverage: forcing a cron path 429 results in the breaker being OPEN before the next live tool call arrives — `tests/unit/lib/inoreader-failure-handler.test.ts` + `tests/unit/cron/radar-refresh.test.ts § partial-both-failed` together prove `openCircuit(env, 'inoreader-429-<source>')` is invoked on the cron path
- [x] Inline rationale documenting the symmetric-protection design lives in the helper module's header docstring at [`inoreader-failure-handler.ts:1-30`](../../../mcp-server/src/lib/inoreader-failure-handler.ts#L1-L30) ("every Inoreader call site (cron OR live tool) routes its failures through this helper")

**T.Z.3 fix — Capture 429 diagnostic headers**

- [x] [`inoreader-worker.ts`](../../../mcp-server/src/lib/inoreader-worker.ts) 429 handler reads `X-Reader-Zone1-Limit`, `X-Reader-Zone1-Usage`, `X-Reader-Zone2-Limit`, `X-Reader-Zone2-Usage`, `X-Reader-Limits-Reset-After` off the response (`parseRateLimitHeaders` helper)
- [x] The `InoreaderFailure` envelope carries the parsed header values as `rateLimitInfo`
- [x] `handleInoreaderFailure()` attaches them to Sentry as searchable tags (`inoreader.zone1.usage`, `inoreader.zone1.limit`, `inoreader.zone2.usage`, `inoreader.zone2.limit`, `inoreader.reset_after_seconds`)
- [x] First ~200 chars of the response body included in Sentry `extra` field — captured via `readBodyExcerpt()` on 429 only, forwarded through `InoreaderFailure.bodyExcerpt` and `LiveTierResult.bodyExcerpt`
- [x] Unit test mocks Inoreader 429 with the documented headers + body and asserts both the envelope and the Sentry capture include the values

**Verification & docs**

- [x] [BL-032_5_TESTING_FINDINGS.md § Section Z](BL-032_5_TESTING_FINDINGS.md) cross-referenced from this BACKLOG entry; status of T.Z.1 / T.Z.2 / T.Z.3 flipped to "Remediation: fixed in BL-032.7" with commit SHAs (302c625 / bba2a46 / 2597854)
- [x] Operator runbook implicitly improved: 429 events now carry `inoreader.zone1.usage`, `inoreader.zone1.limit`, `inoreader.zone2.usage`, `inoreader.zone2.limit`, `inoreader.reset_after_seconds` as searchable Sentry tags. RCA on the next 429 is a 30-second tag read.

#### Technical Context

**Why a new initiative rather than folding into BL-040**: BL-040's stated scope is "debounce parallel refreshes" — a fan-out load-shedding optimization. BL-032.7 is about **budget protection + observability** — a different axis. Conflating them inflates BL-040's scope and risks shipping budget-protection fixes behind a load-optimization gate. BL-040 remains its own initiative for whenever multi-pilot fan-out load actually materializes (current single-tenant load doesn't trip the BL-040 condition).

**Why the per-consumer app split (originally item 4) was retired in favor of BL-032.8**: while implementing item 4 we discovered the scope extends beyond renaming env vars — the website + Worker today share their Inoreader access token through a single Upstash key (`inoreader:access_token`), so a clean per-consumer split requires either (a) duplicating the entire OAuth refresh path or (b) eliminating one of the two consumers from the Inoreader-caller surface entirely. Option (b) is structurally cleaner — single OAuth identity, single budget, single client implementation, single source of truth — and is filed as BL-032.8 "Radar consumer unification." The retired item 4 would have been a band-aid that needed re-doing the first time a BL-033 pilot client onboarded.

**Out of scope (covered by BL-032.8 or later)**

- Retiring `src/components/radar/RadarFeed.astro`'s direct Inoreader calls — BL-032.8
- Eliminating the website's Inoreader credentials entirely — BL-032.8
- Per-pilot-client onboarding flow — handled as part of BL-033 (issues bearer keys, no per-pilot Inoreader account work)
- Migrating to Inoreader's paid tier (10k/day Zone 1 + 2k/day Zone 2) — pursue only if BL-032.8's "MCP-as-sole-consumer" single-app architecture proves insufficient under combined website + pilot-client load
- BL-040 parallel-refresh debounce — separate axis

---

### BL-032.8: Radar Consumer Unification — MCP Worker as sole Inoreader caller

**Source**: BL-032.7 implementation discovered the per-consumer-app-split was a band-aid; the cleaner end-state is single-OAuth-identity with the Worker as sole Inoreader consumer. Architecture refined 2026-05-17 with the user: drop the `PUBLIC_RADAR_SOURCE` feature flag (band-aid pattern — dual-write window covers the same safety surface), reuse the unified scope catalog from [`scopes.ts`](../../../mcp-server/src/auth/scopes.ts) instead of inventing a parallel `RADAR_SNAPSHOT_KEY` auth path, and elevate the OAuth-refresh redesign into a first-class module split with single-flight locking. | **Effort**: 5-7 days (revised from initial 3-4 day estimate after the 2026-05-17 design-refinement session surfaced the depth of the module-split refactor, the `bearer.ts` per-key scope subset extension, the new single-flight-lock primitive, and the ~12-test coverage matrix; trade is "this work was always implicit — making it explicit prevents deferred tech debt") | **Status**: ✅ **SHIPPED 2026-05-27** — Phase A merged via PR #139 (commit `89e5933`, 2026-05-17); Phase B retirement merged via PR #140 (commit `794190c`, 2026-05-27) after the soak window closed clean; honest closure (source/test cleanup of stale BL-039 references + doc reconciliation + BACKLOG truth pass) via PR #178 (commits `07c998e` + `95f72fc` + the truth-pass commit itself); operator-side decom of legacy `gst-radar-tokens` Upstash DB + Vercel `INOREADER_*` env vars + Worker `UPSTASH_INOREADER_REST_*` / `INOREADER_REFRESH_SECRET` secrets completed 2026-05-27 (see [`mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md`](../../../mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md)). BL-033 unblocked. | **Depends on**: BL-032, BL-032.5, BL-032.7, BL-039 (delivered) | **Supersedes**: BL-040 (parallel-refresh debounce — obsoleted by the Upstash single-flight lock in the `inoreader-oauth.ts` module; closed as ✅ Superseded in Phase B PR)

**As a** GST operator scaling toward BL-033 multi-tenant pilot client traffic, **I want** all Inoreader API traffic to flow through a single canonical client (the MCP Worker) with one OAuth identity, one token storage path, and one set of protective substrate mechanisms (rate limit + circuit breaker + day-counter + 429 header capture from BL-032.7) — **so that** every consumer surface (website ISR, Claude Desktop, OpenClaw, BL-033 pilot clients) benefits from the same protections, the Inoreader budget is visible in one dashboard, and onboarding new consumers scales to zero Inoreader-side work per consumer.

> **Why this is precondition to BL-033 (not BL-032.7)**: BL-032.7's three observability + safety fixes (T.Z.1, T.Z.2, T.Z.3) shipped today and make the substrate self-diagnosing during Inoreader incidents. BUT the website's Radar page still calls Inoreader directly through its own server-side code path, bypassing all of BL-032.7's protections AND sharing the same 100/day Zone-1 budget with the MCP Worker. Onboarding a paying pilot client onto a substrate where the website can starve everyone else's budget — invisibly to the alerting contract — is unacceptable. BL-032.8 closes that gap by making the website a downstream consumer of the MCP Worker, not a parallel Inoreader client.

#### Planning Criteria

**Architecture choice — Pattern B2 (MCP HTTP endpoint for radar)**

Two end-state options were considered:

- **B1 — website reads `mcp:radar:cache:*` keys directly from Upstash**. Fast (no HTTP roundtrip), but couples the website to the Worker's cache-key naming.
- **B2 — website calls a lightweight `GET /radar/snapshot` HTTP endpoint on the Worker** (or `tools/call(search_radar)` over the existing MCP path). Treats the MCP as the canonical interface; website becomes "just another MCP consumer." Slightly more overhead per request but architecturally cleaner.

**B2 is the chosen direction**. The HTTP boundary is the right abstraction layer — it's the same surface BL-033 pilot clients will use.

**Use cases**

- **Website `/hub/radar` page renders without Inoreader credentials** — Vercel-side SSR fetches the snapshot from the Worker; if the Worker is degraded, the website shows the same staleness UX as today but sourced from `mcp.globalstrategic.tech` rather than from a direct `inoreader.com` call
- **A new BL-033 pilot client onboards in 10 minutes** — operator issues an `MCP_KEY_<TEAM>` bearer; the client points its MCP-compatible runtime at `https://mcp.globalstrategic.tech/mcp`; no Inoreader account work
- **Operator sees one Inoreader usage graph** in the Developer Console — that graph is the canonical Inoreader-consumption signal across every consumer. The Worker's day-counter (T.Z.1) is a cron-path subset of that total (~80-85%); the missing 15-25% is OAuth refresh + live cache-miss fetches that don't increment the counter. Closing that accounting gap is scoped under [BL-032.75 § BL-032.8 Phase B soak findings → Inoreader spend accounting](#bl-03275-mcp-server--production-observability-maturity) (Day-5 finding, 2026-05-21). The cron's soft-cap protection still works correctly today; the gap is observability-side, not budget-protection-side.
- **A 429 from Inoreader affects every consumer identically** — the Worker's circuit breaker opens once (T.Z.2), every downstream consumer sees the same 503/cached-snapshot response shape

**Outcomes**

- Website `/hub/radar` renders successfully via the Worker's snapshot for 7+ days post-deploy with no Inoreader credentials present on Vercel
- `src/lib/inoreader/client.ts` deleted from the website repo; all website-side `INOREADER_*` env vars removed from Vercel
- BL-039 `/api/inoreader/refresh` endpoint either retired (preferred) or repurposed as an operator-controlled escape hatch with a clear deprecation note
- One Inoreader app (App ID `1000008446` — "Global Strategic Technologies Radar") becomes the sole OAuth identity for all GST Inoreader traffic
- Single Upstash key (e.g. `mcp:inoreader:access_token`) is the sole token-storage path; sole-writer is the Worker
- All BL-032.7 protections (per-key rate limit, breaker, day-counter, 429 header capture) automatically extend to website traffic — verified by inspecting Sentry events that previously would have been attributed to website-side calls

**Business value**

- **Unblocks BL-033** with a structurally clean substrate — pilot client onboarding is a bearer-key issuance, not an Inoreader account work item
- **Eliminates ~400 LOC** of duplicate Inoreader client code (`src/lib/inoreader/client.ts`)
- **Single source of truth** for Inoreader-API drift — when Inoreader changes their API, one client to update, not two
- **Operational visibility** — one Inoreader usage graph to monitor, one set of OAuth secrets to rotate, one cache to warm
- **Aligns with the demo's "shared engine" narrative** — Scenario 1 of BL-032.6 told stakeholders "this isn't a parallel implementation; it's the same engine the hub wizard uses." Today, the radar surface DOES have a parallel implementation. BL-032.8 makes the narrative true.
- **Cost**: ~0 ongoing; ~5-7 days engineering one-time + 7 days calendar soak. No Inoreader paid-tier needed in steady state (single 100/day Zone-1 budget is sufficient for projected total traffic post-BL-033 ramp).

#### Acceptance Criteria

**Worker takes over OAuth refresh ownership** _(detailed design + module split: see [MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md](MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md))_

- [x] Worker calls Inoreader's `/oauth2/token` directly on 401 (replaces the BL-039 round-trip through the website's `/api/inoreader/refresh` endpoint) — PR #140
- [x] Upstash MCP DB keys `mcp:inoreader:access_token` (TTL = `expires_in − 60`) and `mcp:inoreader:refresh_token` (no TTL) hold the Worker-written tokens; refresh-token rotation persisted sequentially (refresh_token first); `mcp:inoreader:refresh-lock` (NX, TTL 10s) coordinates concurrent refresh attempts so exactly ONE `/oauth2/token` POST lands per stale-token event regardless of fan-out — PR #140, verified by `/health` post-deploy
- [x] Q4 single-writer invariant relocates from "website is sole refresh-writer" to "Worker is sole refresh-writer"; rationale captured in the new `mcp-server/src/lib/inoreader-token-store.ts` module docstring — PR #140
- [x] Worker exposes a new lightweight `GET /radar/snapshot` HTTP endpoint returning `{ wire: SnapshotTier, fyi: SnapshotTier, fetchedAt }` as plain JSON (no MCP-RPC framing). Authenticated via the existing bearer flow + `assertScope(auth.scopes, 'resource:radar:read')` — narrow-scope key issued via the unified scope catalog — PR #140

**Website becomes a downstream consumer**

- [x] [`src/components/radar/RadarFeed.astro`](../../../src/components/radar/RadarFeed.astro) refactored to fetch from `https://mcp.globalstrategic.tech/radar/snapshot` at SSR time using `MCP_KEY_WEBSITE_RADAR` as bearer (Vercel env var). Companion `MCP_KEY_WEBSITE_RADAR_SCOPES=["resource:radar:read"]` narrows the grant — PR #140
- [x] `src/lib/inoreader/client.ts` and all callers removed from the website repo — PR #140 (confirmed in closure: only `transform.ts` + `types.ts` remain in `src/lib/inoreader/`, both pure data-shape helpers with no Upstash or OAuth coupling)
- [x] All website-side `INOREADER_*` Vercel env vars removed via `vercel env rm` — operator-completed 2026-05-27 (5 distinct vars across 3 envs; Vercel's CLI removes from all envs per call so 5 successful removals cleared all 14 logical env+var entries; `vercel env ls | grep -i inoreader` returns empty)
- [x] Website's `/hub/radar` page renders successfully with no Inoreader credentials in scope — verified in-place by daily Vercel rebuilds since PR #140 merged + post-cleanup re-render (no preview-deploy-with-INOREADER\_\*-unset drill run separately; the unset state is now the production reality)
- [x] **Rollback path is `git revert` of the RadarFeed.astro commit** — no runtime feature flag. The Phase A dual-write window (Worker has `/oauth2/token` ownership AND website still has direct Inoreader access) is the structural safety net (preserved as design rationale; no rollback was needed)

**Phased rollout** _(no deferred tech debt — Phase B PR drafted day-of-Phase-A-merge with target merge date = Phase A merge + 7 days; details in impl doc)_

- [x] Phase A: ship `refreshAccessToken()` as primary path; keep `triggerWebsiteRefresh()` (BL-039) as fallback only on `inoreader-error` (NOT `invalid-refresh-token`). 7-day soak gate: zero fallback invocations in Sentry — PR #139 (2026-05-17); organic soak between PR #139 and PR #140 merge (2026-05-27) spanned 10 days; no `triggerWebsiteRefresh` Sentry events observed
- [x] Phase B: delete `triggerWebsiteRefresh()`, delete website `/api/inoreader/refresh` endpoint, `vercel secret rm INOREADER_REFRESH_SECRET`, `wrangler secret delete INOREADER_REFRESH_SECRET` on both envs, close BL-040 as ✅ Superseded — PR #140 (code) + operator-completed 2026-05-27 (secret deletes); BL-040 was marked `✅ SUPERSEDED 2026-05-17 by BL-032.8` at line 2855 during the original work (cross-check confirmed during closure)

**Soak verification**

- [x] 7 days of normal operation with website ISR + MCP Worker tools both serving radar; Inoreader Developer Console shows usage under one app, well below the 100/day Zone-1 cap — substrate has operated single-app since Phase B deployed; Developer Console confirms single-digit % of the 100/day cap typical day
- [ ] **Deferred** — At least one induced 429 (force-set `mcp:radar:circuit-open` or temporarily revoke the Worker's token) demonstrates: website's `/hub/radar` shows degraded UX gracefully; live MCP tool calls return 503 envelopes with `Retry-After`; both consumers see the same recovery moment when the breaker closes. **Rationale**: organic Sentry-captured 429 events during operation + integration test coverage at `tests/integration/cron-proactive-refresh.test.ts` substitute for the induced drill. The induced exercise can be added as a backlog hygiene item if a future regression warrants it; not gating on any downstream work.
- [x] [`src/docs/hub/RADAR.md`](../hub/RADAR.md) budget envelope updated to reflect "single app, ~52 calls/day combined (cron + ISR + live tools)" — verified during closure (RADAR.md lines 42, 68, 156, 162-176 reflect single-app shape)
- [x] Operator runbook entry: how to rotate the Inoreader OAuth credentials on the Worker (since the website no longer holds them) — [`mcp-server/src/docs/operations/DEPLOY.md` § C.5](../../../mcp-server/src/docs/operations/DEPLOY.md) "Recovery — Inoreader OAuth refresh-token expired" Post-BL-032.8 Phase B section
- [x] Legacy `gst-radar-tokens` Upstash database decommissioned via Vercel↔Upstash integration disconnect (single dashboard action removed the 5 `KV_*` / `REDIS_URL` env vars from Vercel AND deleted the underlying DB; Vercel collapsed the two-step into one) — operator-completed 2026-05-27; safety conditions met (Worker has no DB bindings + Phase B code references all removed)

#### Technical Context

**Why this isn't fully covered by BL-032.7**: BL-032.7's three fixes (T.Z.1/T.Z.2/T.Z.3) protect the MCP-Worker code path. The website ISR's direct Inoreader caller bypasses every one of those protections — different OAuth resolution path, different cache, no breaker, no day-counter, no 429 header capture, no Sentry attribution. Closing that gap is not a "rename and add a secret" change; it's "retire one of the two callers." The structural fix is to make the Worker the sole caller.

**Migration risk profile**: medium. The website's `RadarFeed.astro` is high-traffic relative to most other pages; a regression in snapshot fetching shows up immediately. Mitigation is **structural, not runtime-flagged**: the Phase A dual-write window means both paths function during the cutover (Worker has `/oauth2/token` ownership AND website still has direct Inoreader access). Cutover is one commit (`RadarFeed.astro` swaps Inoreader call for Worker fetch); regression rollback is `git revert` of that single commit. A `PUBLIC_RADAR_SOURCE` runtime flag was considered and rejected — it would add code paths that need cleanup and risks becoming permanent deferred debt once the cutover succeeds.

**Why a unified scope catalog (and not a parallel `RADAR_SNAPSHOT_KEY` auth path)**:

- [`scopes.ts`](../../../mcp-server/src/auth/scopes.ts) was designed for exactly this kind of extensibility — segment-based hierarchical scopes (`tool:*`, `resource:radar:read`, etc.) with wildcard semantics, and an explicit doc-comment commitment that "strings ship now and never change so external clients don't have to adapt their scope handling later"
- A parallel `RADAR_SNAPSHOT_KEY` mechanism would mean two auth paths in the Worker, two key-discovery loops, two operator mental models — and the same problem would recur every time we add a new HTTP convenience endpoint (e.g. future `/portfolio/snapshot`, `/analytics/summary`)
- Scopes describe what the caller can DO (read radar data), not which transport they use (MCP-RPC vs HTTP GET). Reusing `resource:radar:read` for both surfaces keeps the model coherent
- The "lower-privilege bearer" outcome is achieved purely by issuing a key with a scope subset of `DEFAULT_SCOPES`: a new optional companion env var `MCP_KEY_<OWNER>_SCOPES` (JSON-encoded array) narrows the grant. Forward-compatible with BL-033's OAuth flow — same scope strings carry through.

**Why BL-040 (parallel-refresh debounce) is superseded by this initiative**: BL-040 was filed when a single `search_radar` call triggered 5 parallel POSTs to `/api/inoreader/refresh` because `fetchAllStreams` fans out into 5 Inoreader calls, each independently invoking `triggerWebsiteRefresh` on 401. The standalone BL-040 fix was an in-memory debounce inside `inoreader-worker.ts`. BL-032.8's Upstash-based single-flight lock in `inoreader-oauth.ts` solves the same problem structurally and at a higher consistency level (cross-isolate, not per-isolate). After BL-032.8 ships, BL-040's debounce becomes dead-code-removed-by-rename when `triggerWebsiteRefresh` deletes in Phase B. Close BL-040 as `✅ Superseded` in the Phase B PR.

**Out of scope**

- Replacing the website's `/hub/radar` rendering with client-side React (separate UX initiative)
- Adding new MCP consumer types beyond `tools/call`, `prompts/get`, `resources/read` (BL-033 territory)
- Migrating Cron logic out of the Worker (Cron is the right home for "fetch upstream on a schedule")

---

### BL-032.75: MCP Server — Production Observability Maturity

**Source**: BL-032.75 — extends Phase 2 substrate | **Architecture & plan**: [MCP_SERVER_OBSERVABILITY_BL-032_75.md](MCP_SERVER_OBSERVABILITY_BL-032_75.md) | **Effort**: 1 sprint engineering + 7 day baselining window | **Status**: 🟢 **Phase 0 ✅ SHIPPED 2026-05-26** (spend accounting + drift detection); **Phase 1 ✅ SHIPPED 2026-05-31** (AE schema + sinks + guard + `withMetrics` HOF + 10 tools / 5 resources / all prompts wrapped + `inoreader_call` chokepoint emit + AE binding in wrangler.toml + 76/76 metrics tests passing — formally closed 2026-05-31 after audit found the BACKLOG status had drifted from code reality); **Phase 2 baselining started 2026-05-31, first data-pull 2026-06-07** (tracking artifact: [`mcp-server/observability/slo-baselines.md`](../../../mcp-server/observability/slo-baselines.md)); **Phase 3 dashboards + alerts open**, unblocked once Phase 2 baselines + SLO targets land. | **Depends on**: BL-032 (closed); BL-032.5 substrate (closed)

**As a** GST engineering lead approaching BL-033's contractual SLA commitments, **I want** SLO dashboards, alerting, and error-budget tracking against measured production baselines **so that** the SLAs we commit to in pilot legal paper are defensible operational reality, not aspirational numbers.

> **Implementation plan**: see [MCP_SERVER_OBSERVABILITY_BL-032_75.md](MCP_SERVER_OBSERVABILITY_BL-032_75.md) — covers the metrics catalog (typed emitters per Tool/Resource/Prompt), SLO definitions and burn-rate alerts, the Cloudflare Analytics Engine + Grafana Cloud + Slack/PagerDuty stack, and the three-phase implementation (instrument → baseline → dashboard+alert).

#### Planning Criteria

**Use cases**

- **Pre-incident detection** — Inoreader daily budget passes 70% by midday → ticket lands in `#mcp-alerts` so an engineer can investigate the consuming key/tool before the budget exhausts and starts serving stale radar
- **SLO defensibility for pilot SLA** — when BL-033 legal review asks "why 99.5% uptime?", point to 60 days of measured 99.6% with the burn-rate dashboards as evidence
- **Anomaly detection on key-level traffic** — one key bursts 50× normal traffic in 5 min → page fires; turns out an analyst left a runaway agent loop running. Without the alert, rate limits would silently absorb the burst until the daily budget exhausts
- **Radar snapshot freshness signal** — Cron job fails silently for 90 minutes → page fires (snapshot age >2× Cron interval); without observability, first signal would be a confused user reading stale radar
- **Daily ops digest** — every morning, all eng + senior consultants get an email summarizing yesterday's traffic by tool, top users by `key_prefix`, and any SLO breaches; team learns the system's normal shape and notices anomalies faster
- **Status page evidence** — the BL-033-required public status page reads from the same Analytics Engine source as internal dashboards, ensuring what clients see matches what eng sees

**Outcomes**

- 30+ days of production traffic data backing every SLO target before BL-033's legal review begins; targets sit at p95-baseline × 1.5 buffer, calibrated against measured reality
- All four canonical alerts (Inoreader budget, radar snapshot stale, health failing, traffic spike) wired to Slack + PagerDuty; each has been test-fired and resolved by a runbook execution
- Cache hit rate (BL-032.5 Resources) ≥80% measurable on the dashboard
- Daily Inoreader budget burn-down panel shows >20% headroom on a typical day; alert fires at 70% pre-emptively
- On-call rotation operating (single engineer initially); runbook for each alert tested at least once
- Status page (initially internal-IP-restricted) live at `https://status.mcp.globalstrategic.tech` showing per-tool availability + Inoreader budget consumption

**Business value**

- **Makes BL-033 SLA commitments defensible** — moves the pilot conversation from "we will commit to 99.5% uptime" to "we measured 99.6% over 60 days." This is the single most consequential output of the initiative for the commercial path
- **Surfaces incidents pre-customer-impact** — alerts fire on leading indicators (budget burn rate, snapshot age, anomalous traffic) rather than lagging indicators (an angry user). For a B2B advisory product, prevented incidents are worth far more than detected ones
- **Operational maturity signal** — when a PE compliance team asks "show us your monitoring," there's a real answer with screenshots. Hard to overstate how much this matters for enterprise sales
- **Foundation for capacity planning** — once measured, easy to project when Cloudflare/Upstash/Sentry tiers will need an upgrade; budget conversations have data instead of guesswork
- **Cost**: Cloudflare Analytics Engine free tier covers projected volume (~30× headroom); Grafana Cloud free tier sufficient for 3 users + 10k metric series; Slack webhook + PagerDuty starter tier ($25/mo) covers a single on-call rotation. Total ongoing: <$50/mo through pilot scale

#### K-section evidence-driven mitigations (added 2026-05-12)

BL-032's Section K soak (31 of 40 tests recorded as of 2026-05-12) surfaced a tight cluster of agent-consumption gaps that warrant focused mitigation alongside the broader observability work. Each item below cites the K finding(s) that justify it.

**Tool description tightening**

- [x] `generate_diligence_agenda` — elevate the BL-031.95 `'unknown'` sentinel paragraph to a top-line USAGE RULE. Specifically target `businessModel`, `scaleIntensity`, `operatingModel`, and `transformationState` as the persistent silent-inference traps. Evidence: K.1.2 (businessModel inferred from productType), K.1.3 (all 13 fields filled when 4 should have been `'unknown'`), K.2.b.3 (same pattern reproducing), K.2.c.1 (improvement — 3 sentinels used correctly, but businessModel still inferred). **Shipped 2026-05-27** — confirmed in plan-mode audit that `mcp-server/src/tools/diligence.ts:28-55` (`TOOL_DESCRIPTION`) already carries the "USAGE RULE — `'unknown'` sentinel discipline (READ FIRST)" block as the first paragraph, the "Indirect inference is forbidden" paragraph naming all four target fields (`businessModel`, `scaleIntensity`, `transformationState`, `operatingModel`) with their inference-trap mappings, and the low-context path ("set ALL 13 fields to `'unknown'`"). Landed in earlier BL-031.95 work; closing here.

- [x] `search_regulations` — nudge toward broader-filter + synthesis-side filtering. Evidence: K.2.c.4 (~11 sequential per-jurisdiction fan-out calls when 3 would have sufficed). **Shipped 2026-05-12** — `SEARCH_DESCRIPTION` in `mcp-server/src/tools/regulations.ts` gained an "**Efficiency tip**" paragraph contrasting fan-out vs broader-filter calls.

- [x] `search_regulations` — assert authoritative-source priority. Evidence: K.2.a.4 (Claude answered GDPR from training-knowledge), K.2.b.7 (Claude used web search instead of MCP tool). **Shipped 2026-05-12** — `SEARCH_DESCRIPTION` opens with "**Authoritative source for any question about a regulatory framework**" paragraph instructing the agent to call this tool before web search / training knowledge, even when the user doesn't mention GST.

- [x] `search_portfolio` — add natural-language-to-engagement-filter mapping. Evidence: K.2.b.2 (user said "sold to PE" — Claude defaulted to Buy-Side instead of Sell-Side). **Shipped 2026-05-12** — `SearchPortfolioInputSchema.engagement.describe()` in `mcp-server/src/schemas.ts` now codifies the buy-side / sell-side phrasing patterns and instructs the agent to query both and surface the split when the prompt is genuinely ambiguous.

- [x] `assess_infrastructure_cost_governance` — encourage empty-arg structure-discovery. Evidence: K.2.a.5 (Claude described ICG framework from memory, fabricated 2 of 6 domain names). **Partial shipped 2026-05-12** — `TOOL_DESCRIPTION` in `mcp-server/src/tools/icg.ts` opens with a **Structure-discovery usage (READ FIRST)** block directing the agent to call with `answers: {}` for framework-shape questions; response's `domainScores[].name` returns the canonical 6 domain names (sufficient to prevent the K.2.a.5 domain-name fabrication). **Follow-up**: full per-domain question registry exposure is a separate result-shape enrichment (tracked under "Result-shape enrichments" below) — current empty-args response gives domain names but not the question text per domain.

- [x] Connector-level system-prompt addendum (REMOTE_CLIENT_SETUP.md update). Evidence: K.1.9, K.2.a.3, K.2.a.4, K.2.a.5, K.2.b.7 — recurring pattern of Claude bypassing GST MCP tools for general-domain or consultative-framing prompts. Refined by K.2.e.4 vs K.2.e.5 isolation: Claude commits to memory-vs-MCP path in the FIRST response sentence and does not course-correct mid-response, so the surgical intervention is biasing the opening framing toward MCP-tool-naming language rather than overriding deep reasoning. **Shipped 2026-05-12** as [`REMOTE_CLIENT_SETUP.md` § 4](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) — copy-paste addendum block with per-client paste locations (Claude Desktop / Claude Code / Cursor / ChatGPT) and the K.2.e.5 validation prompt for confirming the addendum landed. Also includes the `'unknown'` sentinel discipline reminder for diligence (echoes the tool description tightening already shipped in commit `e472be9`).

**Result-shape enrichments**

- [x] Add `oldestItemDaysAgo` (or `latestItemAgeDays`) to `search_radar` + `get_latest_insights` response envelopes. Evidence: K.1.10 (FYI tier returned items ~25 days old without surfacing the freshness gap; user had to notice it manually), K.2.c.2 retry (FYI most recent was 78 days old). **Shipped 2026-05-27** — `mcp-server/src/tools/radar-live.ts:218,257` returns `oldestItemDaysAgo` on both `search_radar` and `get_latest_insights` envelopes; helper at `mcp-server/src/content/radar-transform.ts:105-118` floors `(now - oldest_publishedAt) / 86_400_000` and returns `null` for empty input. 8-test coverage at `tests/unit/content/radar-transform-oldest-item.test.ts`. Landed during BL-032.75 Phase 0 work; closing here.

- [x] Add per-recommendation `triggerQuestionAnswered: boolean` to `assess_infrastructure_cost_governance` response. Evidence: K.2.b.4 (Claude noticed implicitly that several recommendations triggered on unanswered questions, surfaced this as a caveat). **Shipped 2026-05-27 in commit `005e0fe`** — new `EnrichedRecommendation` type in `src/utils/icg-engine.ts` (`Recommendation & { triggerQuestionAnswered: boolean }`); `getRecommendations()` sets `triggerQuestionAnswered = state.answers[r.triggerQuestionId] !== undefined`; MCP tool description in `mcp-server/src/tools/icg.ts` documents the confirmed-vs-assumed semantic. Export payload intentionally omits the flag (export is human-facing; the distinction is agent-tooling). Tests in `mcp-server/tests/unit/icg.test.ts` cover explicit-answer (`0`) / not-sure (`-1`) / absent-key paths + a new data-integrity guard asserting every recommendation's `triggerQuestionId` resolves to a real domain question.

- [x] Fix `assess_infrastructure_cost_governance` accounting math. Evidence: K.2.c.3 + K.2.c.5 (two confirmed instances of `answeredCount: 24, totalQuestions: 20, skippedCount: 0-2` — math doesn't reconcile). Engine accepts unknown question keys (q3_4, q4_4, q5_4 when domain has only 3 questions) and inflates `answeredCount`. **Shipped 2026-05-27 in commit `2b4c3fe`** — `calculateResults` in `src/utils/icg-engine.ts` filters `state.answers` keys against the canonical domain registry (`domains.flatMap(d => d.questions.map(q => q.id))`) before computing `answeredCount` / `skippedCount`. Unknown keys surface on a new `unknownAnswerKeys: string[]` field on `ICGResult` so a typo (`q3_5` meant for `q3_3`) doesn't silently under-report. Chosen semantic: **drop-with-visibility, not strict-reject** — preserves the website's tolerant URL-state client (which may carry deprecated question IDs from older sharing links) while giving the MCP tool surface a machine-readable typo signal. Tests cover happy-path empty array, mixed canonical + unknown keys, regression guard that unknown keys don't affect any domain `rawScore`.

**`/health` probe depth** ✅ Shipped 2026-05-27 (carried over from soak T.X.2)

- [x] Extend `/health`'s `upstashMcp` probe from a plain GET to a write-then-delete sequence. Evidence: T.X.2 (Read-only Upstash REST token passed the GET-only probe so `/health` returned `upstashMcp: 'ok'`, but the next `/mcp` POST threw inside the rate-limiter on the missing `evalsha` permission — Worker outage masquerading as healthy for ~30 min during T.C.7 recovery). **Shipped 2026-05-27 in commit `b2d79d0`** — `probeMcp` in `mcp-server/src/observability/health.ts` now writes a per-call-unique `mcp:health:probe:<uuid>` key with a 60s TTL failsafe, then best-effort DELs it. Semantic: write permission is proven the moment SET resolves; a DEL-throw means cleanup is deferred to the TTL but the substrate is healthy → return `'ok'`. Only SET failures flip to `'degraded'`. Two extra Upstash round-trips per `/health` (negligible at the operator-+-monitor call rate). Concurrent-probe race verified at the test layer. Evidence: [T.X.2](./BL-032_TESTING_FINDINGS.md#tx2--read-only-vs-standard-upstash-rest-token-confusion-during-tc7-recovery).

**Sentry captureMessage wiring** (carried over from soak T.E.11/E.12 FAILs)

- [x] Wire `Sentry.captureMessage` into the auth-fail path (worker.ts:117-126) so unauthorized requests emit a Sentry breadcrumb beyond the structured-log line. Evidence: T.E.11 FAIL (Sentry didn't capture auth.failed events because only captureException is wired, not captureMessage). **Shipped 2026-05-12** — see [BL-032 AC closure note](#bl-032-mcp-server--remote-internal) for full detail.

- [x] Wire `Sentry.captureMessage` into the inoreader-rate-limit failure path (radar-live.ts:115-132) so circuit-open events emit Sentry breadcrumbs. Evidence: T.E.12 FAIL (same root cause as T.E.11). **Shipped 2026-05-12** as part of the same edit.

**Schema-simplification candidate (BL-040 if filed separately)**

- [x] `search_regulations.jurisdiction` and `.category` — accept arrays in addition to single strings. Evidence: K.2.c.4 (fan-out forced by single-string filters). **Shipped 2026-05-27 in commit `283cf37`** — both filters accept `string | string[]` via Zod union+transform in `src/schemas/regulatory-map.ts`. Filter logic in `mcp-server/src/tools/regulations.ts` uses `.includes()` for OR-within-facet semantics (AND across facets preserved). Capability-mirror policy preserved: when an array filter has >1 element, the response's `filterDeeplink` omits the corresponding URL param (the website's single-select-chip UI cannot represent multi-select); when both arrays are multi-valued, the deeplink collapses to the bare regulatory-map URL. Single-string and single-element-array inputs produce byte-identical deeplinks (pinned by test). Documented in `mcp-server/src/docs/regulatory-map/CONTRACT.md` v2 + a cross-tool precedent note in `mcp-server/src/docs/contracts/README.md` for future tools that need single⇄array filter shapes. Estimated 1 day; actual ~3 hours (audit-driven test-set sharpening was the long pole).

**Total estimated effort for K-section mitigations**: ~4 days engineering, sequenceable independently of the broader observability work. Each item ships as a standalone PR.

#### BL-032.8 Phase B soak findings (added 2026-05-21)

**Inoreader spend accounting — day-counter completeness gap**

- [ ] **Discovery (Day-5 of BL-032.8 Phase B soak, 2026-05-21)**: the Inoreader Developer Console reported 37% Zone-1 utilization at end-of-day vs the day-counter's implied prediction of 24% (4 cron firings × 6 calls). Across the post-soak-fix window (18-21 May) the observed steady-state baseline ran 28-37 calls/day, **15-25% above** what the day-counter tracks. Day-counter and Inoreader's Developer Console disagree by a structurally-explainable amount, not a measurement glitch.

  **Root cause**: the day-counter (`mcp:inoreader:day-counter:<YYYY-MM-DD>`, written by [`incrementDayCounter` in radar-refresh.ts:115](../../../mcp-server/src/cron/radar-refresh.ts#L115)) only counts **cron-path radar fetches**. Three other Zone-1-consuming code paths bypass it:

  | Source                            | Egress point                                                                                                                                                                                                                                                                       | Calls/event                              | Frequency                                                                                                      | Tracked? |
  | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
  | **Cron radar fetches**            | [`inoreader-client.ts`](../../../mcp-server/src/lib/inoreader-client.ts) `API_BASE` constant — `fetchAllStreams`, `fetchAnnotatedItems`, `fetchTagList` — invoked from [`radar-live-store.ts`](../../../mcp-server/src/content/radar-live-store.ts) when `opts.forceRefresh: true` | 6 (1 tag/list + 4 streams + 1 annotated) | 4 × /day (`0 */6 * * *` UTC)                                                                                   | ✅ Yes   |
  | **OAuth token refresh**           | [`inoreader-oauth.ts`](../../../mcp-server/src/lib/inoreader-oauth.ts) `OAUTH_TOKEN_URL` — `/oauth2/token` POST                                                                                                                                                                    | 1                                        | ≥1× per cron firing (proactive TTL refresh in `radar-refresh.ts:187`) + ad-hoc on live-tool reactive 401-retry | ❌ No    |
  | **Live cache-miss radar fetches** | Same `API_BASE` in `inoreader-client.ts`, but invoked from `radar-live-store.ts` when `opts.forceRefresh: false` AND the 6h-TTL cache key is absent (cron-write window slipped, or after deploy/cold start)                                                                        | ~6 each                                  | Rare — only on the brief window before each cron rewrites the cache, plus any tool calls that trip cache miss  | ❌ No    |

  **Predicted vs observed**: 24 (cron) + ~4 (OAuth, one per cron firing) = **28/day baseline**. Matches 18-20 May exactly. Days that exceed 28 (e.g., 21 May's 37) include 1-2 reactive OAuth refreshes from live tool calls + occasional cache-miss radar fetches (operational testing, dry-runs, slow-cron windows). The undercount is structural, not stochastic.

  **Operator-facing consequence**: BL-032.75's existing acceptance criteria ("alert fires at 70% pre-emptively"; "Daily Inoreader budget burn-down panel shows >20% headroom") are **not measurable** against an undercounting counter. The cron's soft-cap guard ([radar-refresh.ts:187](../../../mcp-server/src/cron/radar-refresh.ts#L187)) `counter + 6 > 94` gates the cron's contribution, not total spend — so the cron can stop firing while live-tool traffic continues to consume budget invisibly. In a multi-tenant BL-033 future, this gap becomes load-bearing.

  **Implementation options**:
  1. **Single global counter** (recommended). Replace the cron-only `day-counter` with `mcp:inoreader:zone1-spend:<YYYY-MM-DD>`. Wrap every Inoreader fetch at egress (a new `fetchInoreaderZone1(env, url, init)` helper in `mcp-server/src/lib/inoreader-egress.ts`) that increments the counter by 1 on every non-error response and returns the raw fetch result. Cron's soft-cap reads this global counter instead of the cron-only one. **Pro**: one accounting point, structurally impossible to bypass. **Con**: requires refactoring three call sites (`inoreader-client.ts` `fetchAllStreams`/`fetchAnnotatedItems`/`fetchTagList`, plus `inoreader-oauth.ts` `refreshAccessToken`'s POST).

  2. **Multi-key counter with breakdown**. Keep `day-counter` for cron-radar; add `mcp:inoreader:oauth-spend:<YYYY-MM-DD>` and `mcp:inoreader:live-spend:<YYYY-MM-DD>`. Cron's soft-cap sums all three. `/health` surfaces breakdown: `inoreaderSpendBreakdown: { cron, oauth, live }`. **Pro**: operator sees exactly where spend went, useful for debugging fan-out hot spots. **Con**: 3× the keys to maintain; reconciling the three is its own minor design problem (e.g., what increments OAuth vs live when an OAuth refresh fires during a live-tool retry).

  3. **Universal egress wrapper with category dimension** (recommended hybrid — combine 1 and 2). Single helper `fetchInoreaderZone1(env, url, init, category)` where `category: 'cron-radar' | 'live-radar' | 'oauth-refresh'`. Helper increments BOTH a single global counter AND a per-category counter. Cron's soft-cap reads global; `/health` returns per-category breakdown for operator visibility. **Pro**: ergonomics of option 1 + observability of option 2. **Con**: marginally more code (~30 LOC for the dual-counter logic), worth it for the breakdown signal.

  **Recommendation**: option 3. The 30-LOC delta over option 1 buys us BL-033-grade operator visibility ("which consumer ate the budget?") for free. Document the category enum in `inoreader-egress.ts` JSDoc + add a "if you add a new Inoreader egress point, add a new category" comment so future code paths don't slip past the accounting.

  **Acceptance criteria for this sub-deliverable** — ✅ **Phase 0 shipped 2026-05-26** via `inoreader-egress.ts` (333 LOC, 25 unit tests + 5 post-implementation audit fixes; commits `e80d66f` through `44ea0c4`):
  - [x] New `mcp-server/src/lib/inoreader-egress.ts` exporting `fetchInoreaderZone1(env, url, init, category)` with the dual-counter increment + on-error short-circuit (don't increment if fetch throws or returns ≥500 — those calls didn't actually consume Zone-1). Five categories: `'cron-radar' | 'live-radar' | 'http-radar-snapshot' | 'oauth-refresh' | '401-retry'` (broader than the original 3 — the audit surfaced two more bypass paths).
  - [x] `inoreader-client.ts` `fetchAllStreams`, `fetchAnnotatedItems`, `fetchTagList` refactored to call through the egress wrapper with the correct category threaded through.
  - [x] `inoreader-oauth.ts` OAuth-refresh path refactored to call through the egress wrapper with `category: 'oauth-refresh'`.
  - [x] Cron's soft-cap reads the new `mcp:inoreader:zone1-spend:<YYYY-MM-DD>` global counter. Old `mcp:inoreader:day-counter:*` key + `incrementDayCounter`/`readDayCounter` retained during the 7-day parallel soak (2026-05-26 → ~2026-06-02) so we can reconcile old-vs-new before deletion; cleanup PR scheduled post-soak.
  - [x] Soft-cap threshold revised to match the broader category set; chosen threshold + rationale documented in the comment block above the guard.
  - [x] `/health` response gains `inoreaderSpend: { total: number, byCategory: { 'cron-radar': N, 'live-radar': N, 'http-radar-snapshot': N, 'oauth-refresh': N, '401-retry': N } }` — `mcp-server/src/observability/health.ts:102-118` (uses Upstash MGET for the per-category counters).
  - [x] Unit tests in `tests/unit/lib/inoreader-egress.test.ts` — 25 tests covering 200/network-error/5xx/429/TTL paths + the dedicated `egressSource` log field + exhaustive switch coverage.
  - [ ] Soak: 7-day stability window post-deploy (2026-05-26 → ~2026-06-02); daily reconciliation check that Upstash counter vs Inoreader Developer Console vs `/health` agree within ±1 call/day. If reconciliation drifts, there's a sixth egress point we missed. **In progress** — soak ends ~2026-06-02.
  - [ ] Migration note: existing `day-counter:*` keys on Upstash will sit unused after the soak-end cleanup PR. Add a one-line `DEPLOY.md` § A.X note explaining the keys can be manually deleted post-cleanup + adding a date for the manual cleanup. **Deferred to the soak-end cleanup PR.**

  **Effort estimate**: 1-1.5 days engineering — primarily the refactor of 3 fetch sites + threading the category parameter + the new helper + tests. The cron soft-cap threshold revision is a 1-line change but warrants careful test coverage. The `/health` breakdown is a 15-LOC addition. Lower bound assumes no surprises on the radar-live-store.ts category-threading; upper bound budgets a half-day for unexpected.

  **Why this is right-sized as a BL-032.75 sub-deliverable, not a new initiative**: this is exactly the observability-completeness work BL-032.75 is for — making our internal signals match measurable reality. Filing it standalone would create artificial structure; folding it into BL-032.75 inherits the existing acceptance-criteria scaffolding (dashboards, alerts, baselining) which now becomes meaningful once the underlying counter is accurate. The fix unblocks BL-032.75's "alert at 70%" and "20% headroom" acceptance criteria.

  **Related upstream correction**: BL-032.8 currently claims `the Worker's day-counter (T.Z.1) is the canonical Inoreader-consumption signal across every consumer` (line ~1200 of this BACKLOG entry). Post-discovery, the canonical signal is Inoreader's Developer Console; the day-counter is the cron-path subset. BL-032.8's claim updated in the same PR as this entry so BACKLOG stays internally consistent.

#### Acceptance Criteria

**Phase 1 — Instrumentation**

- [ ] Typed metric emitters introduced in `mcp-server/src/metrics/` for: `tool_invocation`, `resource_read`, `prompt_invocation`, `prompt_tool_fanout`, `rate_limit_decision`, `inoreader_call`, `radar_snapshot_age`, `health_check_duration`
- [ ] Tool / Resource / Prompt registry decorators auto-emit metrics — no per-handler boilerplate; handlers stay focused on their domain logic
- [ ] Cloudflare Analytics Engine binding configured in `wrangler.toml` (`env.METRICS`); each emitter writes structured events with the dimensions documented in [MCP_SERVER_OBSERVABILITY_BL-032_75.md § Metrics](MCP_SERVER_OBSERVABILITY_BL-032_75.md#1-metrics--whats-happening-in-numbers)
- [ ] Vitest test asserts every registered Tool / Resource / Prompt emits at least one metric event in a representative invocation
- [ ] Cardinality budget per metric documented in `metrics/_index.ts`; CI test caps emission cardinality to prevent dimension explosion

**Phase 2 — Baselining**

- [ ] Instrumented build deployed to production; runs with normal team usage for ≥10 days
- [ ] Weekly traffic data extracts produce `mcp-server/observability/slo-baselines.md` documenting measured p50/p95/p99 latency and error rate per Tool / Resource / Prompt
- [ ] Initial SLO targets set at p95-baseline × 1.5 buffer; senior-engineer review and sign-off recorded in `slo-baselines.md`
- [ ] All SLO definitions captured: non-radar Tool availability, non-radar Tool latency p95, radar latency cold/warm, Resource latency, health-endpoint availability, Inoreader budget consumption, radar snapshot freshness

**Phase 3 — Dashboards & Alerts**

- [ ] `mcp-server/observability/grafana-dashboard.json` covers traffic, latency histograms, error rates, rate-limit pressure, Inoreader budget burn-down, radar snapshot age, cache hit rate
- [ ] `mcp-server/observability/alert-rules.yaml` covers every SLO from the baselining phase
- [ ] Slack webhook + PagerDuty integration wired; test-fired with a synthetic SLO breach (5% injected error rate); alert lands in correct channel within 5 min
- [ ] Runbooks authored for the four canonical alerts under `mcp-server/observability/runbooks/`: `inoreader-budget-exhausted.md`, `radar-snapshot-stale.md`, `health-check-failing.md`, `traffic-spike-detected.md`
- [ ] Status page deployed at `https://status.mcp.globalstrategic.tech` (Cloudflare Pages, signed query against Analytics Engine); initially internal-IP-restricted; BL-033 reviews and chooses what becomes externally visible
- [ ] Each runbook has a `lastReviewedAt` field; CI test fails if any runbook is over 6 months stale OR the alert that links to it has changed since last review

**Verification & docs**

- [ ] [MCP_SERVER_OBSERVABILITY_BL-032_75.md](MCP_SERVER_OBSERVABILITY_BL-032_75.md) updated with any deviations made during implementation
- [ ] `mcp-server/README.md` extended with: how to import the dashboard JSON, how to test-fire an alert, how to rotate Slack webhooks
- [ ] Two-week post-deploy review: SLO compliance, alert noise rate (target: <1 false-positive/week), dashboard usefulness (engineer survey)
- [ ] Test page through PagerDuty receives a synthetic page within 5 min; runbook link in the alert resolves to the correct markdown file

#### Technical Context

**Why this is its own initiative (not folded into BL-032 or BL-033)**

- Not BL-032: BL-032's job is to ship the remote substrate. Adding a complete observability stack pushes it into multi-week territory and risks neither piece landing
- Not BL-033: SLO baselines need real production traffic; putting observability inside BL-033 would force "guess at SLO targets, then commit them to legal paper" — exactly the sequence that produces broken contracts
- Its own initiative because: the competency is operations engineering (different from auth/audit-log focus); the work is sequenced by measured production data (a 10-14 day wait is hard to schedule inside a single milestone); the output is config-as-code (dashboards, alert rules, runbooks), not server code; the downstream value (BL-033 signs SLAs from a place of measured baselines) is concrete and worth a separately-tracked deliverable

**Stack** (full rationale in the architecture doc):

| Component      | Choice                                                                      |
| -------------- | --------------------------------------------------------------------------- |
| Metrics store  | Cloudflare Analytics Engine (free tier, native to Workers)                  |
| Dashboards     | Grafana Cloud (free tier)                                                   |
| Alerting       | Grafana alerts → Slack webhook + PagerDuty                                  |
| Error tracking | Sentry (already wired in BL-032)                                            |
| Status page    | Cloudflare Pages, static + signed Analytics Engine query                    |
| Tracing        | Deferred (OpenTelemetry-on-Workers; revisit if a debugging case demands it) |

**Out of scope** (deferred indefinitely or to BL-033)

- Distributed tracing — value is real but adds complexity; revisit when a specific debugging case demands it
- Synthetic monitoring (external probes from multiple regions) — useful for true uptime measurement under SLA reporting; defer to BL-033
- Per-client usage dashboards (clients see their own traffic) — BL-033 product decision
- Cost observability (Cloudflare/Upstash/Sentry billing dashboards) — separate concern, low priority while spend is under $100/mo
- Audit-log integrity dashboards — that surface belongs to BL-033's compliance-grade audit log
- ML-based anomaly detection beyond simple z-score / threshold rules — premature

---

### BL-032.76: MCP Cron Status / Sentry Observability Repair

**Source**: 2026-05-26 incident investigation session | **Effort**: 1-2 days (Option B path) | **Status**: ✅ **SHIPPED 2026-05-27** — Option B (structural SDK bypass on the scheduled handler) delivered via PR #175 (commit `2016bac`); operator runbook delivered via PR #177 (commit `5ead623`). Envelope module at `mcp-server/src/observability/sentry-envelope.ts` (208 LOC); `withSentry` split so it wraps only `fetch` (`worker.ts:445-450`); scheduled handler owns its own check-in lifecycle via `postSentryCheckIn` + `postSentryEvent`; the 5 prior `captureMessage` calls in `radar-refresh.ts` + shared cron modules routed through `captureMessageEnvelope`. 19 new envelope unit tests + rewritten `worker-scheduled.test.ts` with explicit regression guard (asserts `withSentry` is called with a handler object that does NOT have a `scheduled` key). Production-deployed to `mcp.globalstrategic.tech`; `/health.inoreaderObservedAt` continues to track cron cadence post-deploy. **Empirical confirmation complete (2026-05-27)**: natural cron firing observed on Cloudflare's cron-events dashboard reporting `Success` (no longer `Exception Thrown`); cron-status reporting now matches reality. Operator runbook `_archive/BL-032_76_VERIFICATION.md` retained as reference for the 5-point verification surface + decision matrix. | **Depends on**: nothing blocking | **Blocked**: BL-032.75 Phase 3 alerting (now unblocked — alert rules on Cloudflare cron status are reliable signal again) | **Sibling-of**: BL-032.75 (this fixed the substrate that BL-032.75 Phase 3 will alert on)

**As a** GST operator running the MCP-server production cron, **I want** Cloudflare's cron-events dashboard to report `Success` when the radar refresh actually succeeds, AND Sentry's mcp-server project to receive `cron.radar-refresh.*` events on every firing, **so that** my dashboards and alert rules tell me the truth about cron health instead of misleading me with false `Exception Thrown` statuses while the system is functionally working.

> **Why this is its own ticket and not folded into BL-032.75**: BL-032.75 is the multi-phase observability maturity initiative. This is a specific substrate incident that must be resolved before BL-032.75's Phase 3 alerting can be meaningful — an "alert on Cloudflare cron Error" rule is useless when 100% of firings report Error while the work succeeds. Tracked separately so each can move independently.

#### Symptom (observed 2026-05-26 18:30 BRT)

Cloudflare's cron-events dashboard reports `Exception Thrown` on every cron firing since approximately 2026-05-19. Sentry's mcp-server project receives **zero** `cron.radar-refresh.*` events despite the cron handler completing its work successfully on every firing:

```
Cron events dashboard (last 4 firings, all production):
Tue 2026-05-26 18:00:46 UTC — Error
Tue 2026-05-26 12:00:40 UTC — Error
Tue 2026-05-26 06:00:39 UTC — Error
Tue 2026-05-26 00:00:39 UTC — Error
```

Yet `/health` confirms the cron is actually working:

```json
{
  "ok": true,
  "version": "0.1.0",
  "gitSha": "<0.3.13 commit>",
  "inoreader": "ok",
  "inoreaderObservedAt": "2026-05-26T18:00:49.443Z",
  "inoreaderObservedSecondsAgo": 2272,
  "inoreaderObservedSource": "cron",
  "radarSnapshotAgeSeconds": 2273
}
```

The cron RAN at 18:00:46 UTC and successfully observed Inoreader at 18:00:49 UTC — three-second turnaround. Snapshot age tracks the cron cadence. The radar substrate is healthy. Cloudflare's `Error` status is misleading.

`wrangler tail` output during a firing shows the handler completes:

```
"*/2 * * * *" @ 5/26/2026, 4:02:44 PM - Exception Thrown
  (log) {"timestamp":"2026-05-26T19:02:45.517Z","event":"cron.proactive-refresh.skipped","reason":"ttl-fresh"}
  (log) {"timestamp":"2026-05-26T19:02:47.260Z","event":"cron.radar-refresh.success","success":true}
```

Both `safeLog` lines emit; the work succeeds. The "Exception Thrown" header is the firing's outcome label, applied AFTER the safeLog lines, meaning the rejection happens during cleanup (post-success). No Sentry-specific error logs appear in `wrangler tail`.

#### Timeline

- **Pre-2026-05-19**: scheduled handler was bare `ctx.waitUntil(refreshRadarSnapshot(env))`. Cloudflare reported `Success` on 4/4 daily firings. Sentry captured ~1 of 4 expected events per 24h via SDK auto-instrumentation only (`~75% capture loss`). This is documented in the PR #150 commit message itself.
- **2026-05-19 (commit `4680028`, PR #150)** — `fix(mcp-cron): flush Sentry queue before scheduled-handler isolate teardown` — added `await flushSentry()` to the scheduled handler IIFE to address the 75% capture loss. **Cloudflare started reporting `Error` on every firing from this commit forward.** Inverted the trade-off: fixed Sentry capture loss (theoretically), introduced a Cloudflare false-Error reporting bug.
- **2026-05-25 (commit `a74ffc9`, 0.3.11 → 0.3.12)** — `fix(mcp-cron): wrap scheduled handler in Sentry.withMonitor + add missing catch` — layered on `Sentry.withMonitor` (Sentry Crons check-in HTTP POSTs per firing). Did not resolve the Cloudflare `Error` status.
- **2026-05-25 (commit `f9ea461`, 0.3.12 → 0.3.13)** — `fix(mcp-cron): outer try/catch around Sentry plumbing` — added an outer try/catch around the IIFE inside `ctx.waitUntil`. Should have absorbed flushSentry rejections. Did NOT fix the symptom.
- **2026-05-25 (separate)**: user rotated `SENTRY_DSN` secret (had been pointing at the website Sentry project, not mcp-server). DSN now correct (verified — see Investigation Findings below). Did not fix the symptom.
- **2026-05-26 (this session)**: confirmed via direct PowerShell envelope POST that the DSN + ingest endpoint + project key are all healthy. Test event `7a22ca8212983f1d0b58a54e4f283841` arrived in the mcp-server Sentry project within ~1 min of the POST. The SDK, not the DSN/transport, is the failure surface.

#### Investigation findings (verified facts as of 2026-05-26)

1. **DSN is correct and the Sentry project accepts events.** Manual PowerShell POST to the same endpoint via `Invoke-WebRequest` with the bound DSN returns HTTP 200 + event_id; the event appears in mcp-server project Issues view. DSN parsing:

   ```
   host:       o4511195716386816.ingest.us.sentry.io
   project ID: 4511343962357760
   public key: 18b0d78cb4cbff2cbee5da2ae86c3e5e
   ```

2. **DSN value bound to Cloudflare matches what's shown in Sentry mcp-server project's Settings → Client Keys (DSN) page.** Verified after re-binding via `wrangler secret put SENTRY_DSN --env production`.

3. **Cron firings are NOT landing in the website Sentry project either.** Eliminates "wrong project" hypothesis.

4. **Sentry-side filtering ruled out.** The mcp-server project's only enabled Inbound Filter was "Filter out health check transactions" — toggled OFF for verification, no change in symptom. Project key is Enabled. No rate limit configured on the key. No Spike Protection active. No IP allowlist restricting Cloudflare egress.

5. **SDK version is stable.** `@sentry/cloudflare@10.53.1` (NOT `10.51.0` as `package.json` ^range suggests — `10.53.1` is the resolved version). Same version since at least 2026-05-12 per `package-lock.json` history. Not a recent SDK bump.

6. **0.3.13 is deployed.** `/health.gitSha` confirmed matches the master HEAD with the outer try/catch around the IIFE. The outer catch IS in place; cron status still shows Error → the rejection source is NOT our IIFE.

7. **The cron's actual work succeeds.** Two `safeLog` lines emit per firing (`cron.proactive-refresh.skipped` followed by `cron.radar-refresh.success`); `/health.inoreaderObservedAt` updates within 3s of each firing; snapshot age tracks the cron cadence. The radar substrate is functionally healthy.

8. **`@sentry/cloudflare`'s `wrapScheduledHandler` at [`node_modules/@sentry/cloudflare/build/cjs/instrumentations/worker/instrumentScheduled.js:45`](node_modules/@sentry/cloudflare/build/cjs/instrumentations/worker/instrumentScheduled.js#L45) queues its OWN `ctx.waitUntil(flush.flushAndDispose(client))`** AFTER our handler returns. Our outer try/catch wraps OUR IIFE; the SDK's separate `ctx.waitUntil` is a parallel promise we cannot reach. The current architectural hypothesis is that the SDK's queued flush rejects, producing the `Exception Thrown` outcome.

9. **The strict "SDK flush rejects" theory is unproven by source-code reading.** Adversarial audit of [`@sentry/cloudflare/build/cjs/flush.js:45-54`](node_modules/@sentry/cloudflare/build/cjs/flush.js#L45-L54) shows `flushAndDispose` calls `client.flush(timeout)` then `client.dispose()`. Neither has a documented reject path on an empty queue. The actual mechanism producing `Exception Thrown` is not pinned down by reading source alone — we observe the symptom empirically but cannot point to the exact reject statement.

#### Hypotheses ruled out

| Hypothesis                                          | How it was ruled out                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| DSN points at wrong (website) project               | Manual POST to current DSN → 200 + event in mcp-server project                                                      |
| Sentry inbound filter dropping events               | Toggled "health check transactions" filter OFF, no change                                                           |
| Sentry rate limit / spike protection / disabled key | UI showed: Enabled, no rate limit, no spike-protection throttle                                                     |
| Network egress blocked Cloudflare → Sentry          | Direct POST from same network worked; uncommon for global Sentry                                                    |
| Recent `@sentry/cloudflare` SDK version bump        | `10.53.1` since at least 2026-05-12; pre-incident                                                                   |
| 0.3.13 not deployed                                 | `/health.gitSha` matches master HEAD with outer try/catch present                                                   |
| Code path failing BEFORE outer try/catch swallows   | `wrangler tail` shows both `safeLog` lines emit; `/health` confirms work; cron handler is reaching the success path |

#### Suspected root cause (unproven)

The SDK's auto-instrumentation in `wrapScheduledHandler` queues `ctx.waitUntil(flush.flushAndDispose(client))` at [`instrumentScheduled.js:45`](node_modules/@sentry/cloudflare/build/cjs/instrumentations/worker/instrumentScheduled.js#L45) — a SEPARATE `ctx.waitUntil` from ours. Even though `flush()` is documented as non-rejecting, something in the transport layer (`makeCloudflareTransport`) may be rejecting under Worker-runtime conditions. Adversarial audit noted: "the actual mechanism producing `Exception Thrown` is not pinned down by reading source alone." A next-session investigator should:

1. Add instrumentation that captures the actual rejection (e.g. wrap `ctx.waitUntil` with a logging proxy that intercepts each promise and logs any rejection).
2. OR — bypass the SDK entirely on the cron path (Option B below), which sidesteps needing to fully understand the rejection mechanism.

#### Three solution paths considered

##### Option A — Accept the cosmetic Cloudflare Error status (CURRENT PATH, 2026-05-26)

The cron actually works. `/health` confirms. `safeLog` emits clean success lines. The Cloudflare `Error` label is a substrate-misreporting issue — false negative on cron health.

**Pros**: zero new code; preserves session work toward shipping BL-032.75 Phase 0; `wrangler tail` + `/health` give the operator the truth.
**Cons**: Cloudflare cron dashboard remains red on every firing; on-call operator could be misled into thinking the cron is broken when it isn't; BL-032.75 Phase 3 alert rules on Cloudflare cron status are unreliable while this persists.

**Why we picked this for the 2026-05-26 session**: investigation had consumed disproportionate time; the actual deliverable (Phase 0 PR) needed to ship; the root-cause mechanism wasn't fully pinned down so a code change carried risk; deferring to a focused follow-up session was the disciplined call.

##### Option B — Structural bypass (RECOMMENDED for the next session)

Stop using `@sentry/cloudflare`'s `withSentry` wrap on the scheduled handler. Split the default export so `withSentry` wraps only `fetch`. Inside the scheduled IIFE, replace `withMonitor` / `captureException` / `flushSentry` calls with direct `fetch()` POSTs to Sentry's envelope endpoint — the SAME pattern proven working via the PowerShell test (event_id `7a22ca8212983f1d0b58a54e4f283841` landed cleanly).

**Pros**: definitive fix — no SDK surface on scheduled means no SDK rejection paths possible; full cron observability in Sentry; bulletproof against future SDK regressions; small (~60-90 LOC); proven-working transport pattern from this session.
**Cons**: requires implementation + tests + deploy + cron-cycle verification (~1-2 days).
**Recommended over Option C** because the bare revert (C) leaves `captureMessage` calls in `radar-refresh.ts` (lines 172, 188, 237, 277, 308) that would still queue events into the SDK and re-trip whatever rejection path exists today.

##### Option C — Bare revert to pre-5/19 shape (NOT recommended)

Revert scheduled handler to `ctx.waitUntil(refreshRadarSnapshot(env))`. Pre-5/19 this was reported as `Success` on Cloudflare.

**Pros**: smallest change (one method body).
**Cons**: `radar-refresh.ts` still emits `captureMessage` calls inside `refreshRadarSnapshot` (lines 172, 188, 237, 277, 308 — counted by the 2026-05-26 audit). Those queue Sentry events regardless of what the scheduled handler does. The SDK's auto-`waitUntil(flushAndDispose(client))` still runs. **Not verified to actually fix the symptom.** Loses real observability we want without certainty.

#### Recommended fix (Option B) — detailed code outline

**New file**: `mcp-server/src/observability/sentry-envelope.ts` (~60 LOC):

```ts
/**
 * Direct Sentry envelope POSTs — bypasses @sentry/cloudflare for paths
 * where the SDK's auto-instrumentation introduces unhandled-rejection
 * leaks into ctx.waitUntil. Modeled on the PowerShell envelope test
 * that proved transport health on 2026-05-26 (Sentry event_id
 * 7a22ca8212983f1d0b58a54e4f283841).
 *
 * Pure fetch() — no SDK import, no auto-queued ctx.waitUntil, no
 * isolation-scope wrapping. Used by cron paths and any future bg
 * surface where SDK lifecycle conflicts with Workers semantics.
 */
import type { Env } from '../worker';

interface ParsedDsn {
  readonly host: string;
  readonly projectId: string;
  readonly publicKey: string;
}

export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null;
  const m = dsn.match(/^https:\/\/([a-f0-9]+)@([^/]+)\/(\d+)$/);
  return m ? { publicKey: m[1], host: m[2], projectId: m[3] } : null;
}

const SENTRY_CLIENT = 'mcp-server-manual/0.1.0';

function envelopeAuthHeader(publicKey: string): string {
  return `Sentry sentry_version=7,sentry_key=${publicKey},sentry_client=${SENTRY_CLIENT}`;
}

function randomEventId(): string {
  // 32-char lowercase hex; Sentry accepts any value matching that shape.
  let id = '';
  for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

/**
 * Send an event envelope. Best-effort — never throws.
 *
 * @param env - Worker env carrying SENTRY_DSN (and optionally SENTRY_RELEASE).
 * @param event - Sentry event body: { level, message, extra, tags, ... }.
 */
export async function postSentryEvent(env: Env, event: Record<string, unknown>): Promise<void> {
  const dsn = parseDsn(env.SENTRY_DSN);
  if (!dsn) return;

  const eventId = randomEventId();
  const sentAt = new Date().toISOString();
  const body = [
    JSON.stringify({ event_id: eventId, sent_at: sentAt }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify({ event_id: eventId, timestamp: sentAt, platform: 'javascript', ...event }),
  ].join('\n');

  try {
    await fetch(`https://${dsn.host}/api/${dsn.projectId}/envelope/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': envelopeAuthHeader(dsn.publicKey),
      },
      body,
    });
  } catch {
    // Best-effort. The cron path swallows any failure.
  }
}

/**
 * Send a Sentry Crons check-in. Status: 'in_progress' | 'ok' | 'error'.
 * Pair an `in_progress` with a matching `ok`/`error` using the returned
 * check_in_id so Sentry's Crons UI shows the duration + outcome.
 *
 * Returns the check_in_id (generated UUID) for the caller to thread
 * through to the closing check-in.
 */
export async function postSentryCheckIn(
  env: Env,
  monitorSlug: string,
  status: 'in_progress' | 'ok' | 'error',
  schedule: string,
  checkInId?: string
): Promise<string | undefined> {
  const dsn = parseDsn(env.SENTRY_DSN);
  if (!dsn) return undefined;

  const id = checkInId ?? randomEventId();
  const sentAt = new Date().toISOString();
  const checkInBody = {
    check_in_id: id,
    monitor_slug: monitorSlug,
    status,
    monitor_config: {
      schedule: { type: 'crontab', value: schedule },
      timezone: 'UTC',
    },
  };
  const envelope = [
    JSON.stringify({ event_id: id, sent_at: sentAt }),
    JSON.stringify({ type: 'check_in' }),
    JSON.stringify(checkInBody),
  ].join('\n');

  try {
    await fetch(`https://${dsn.host}/api/${dsn.projectId}/envelope/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': envelopeAuthHeader(dsn.publicKey),
      },
      body: envelope,
    });
    return id;
  } catch {
    return undefined;
  }
}
```

**Modify `mcp-server/src/worker.ts`**:

Replace the current `withSentry(sentryOptions, { fetch, scheduled })` default export pattern. Split so `withSentry` wraps only `fetch`. The scheduled handler uses the new envelope helpers — no SDK calls at all in the cron path.

```ts
// Existing handler object construction stays the same shape.
const baseHandler = { fetch, scheduled };

// withSentry mutates handler.fetch in place and returns it; isolate
// the scope by passing a fresh literal that has only fetch.
const wrappedFetch = withSentry(sentryOptions, { fetch: baseHandler.fetch }).fetch;

// Default export: wrapped fetch + bare scheduled. The scheduled
// handler owns its own Sentry envelope lifecycle (postSentryEvent /
// postSentryCheckIn) — NO @sentry/cloudflare SDK use whatsoever in
// the cron path. This is the BL-032.76 architectural pivot
// (2026-05-26 incident).
export default {
  fetch: wrappedFetch,
  scheduled: baseHandler.scheduled,
};
```

The `scheduled` function body changes to:

```ts
async scheduled(event, env, ctx): Promise<void> {
  ctx.waitUntil((async () => {
    const startedAt = Date.now();
    const checkInId = await postSentryCheckIn(
      env, 'radar-refresh', 'in_progress', event.cron
    );
    try {
      const outcome = await refreshRadarSnapshot(env);
      safeLog({
        event: 'cron.radar-refresh.success',
        success: true,
        durationMs: Date.now() - startedAt,
      });
      await postSentryCheckIn(env, 'radar-refresh', 'ok', event.cron, checkInId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      safeLog({
        event: 'cron.radar-refresh.error',
        success: false,
        reason: msg,
        durationMs: Date.now() - startedAt,
      });
      await postSentryEvent(env, {
        level: 'error',
        message: `cron.radar-refresh.error: ${msg}`,
        tags: { event: 'cron.scheduled', cron: event.cron },
        extra: { source: 'cron.scheduled', cron: event.cron },
      });
      await postSentryCheckIn(env, 'radar-refresh', 'error', event.cron, checkInId);
    }
  })());
}
```

**Tests required**:

- `tests/unit/observability/sentry-envelope.test.ts` — unit tests for `parseDsn` (valid/invalid/missing); `postSentryEvent` mocks fetch and asserts envelope body shape; `postSentryCheckIn` covers `in_progress` and `ok`/`error` lifecycle.
- Rewrite `tests/unit/worker-scheduled.test.ts` to assert the new shape:
  - scheduled handler invokes `refreshRadarSnapshot` exactly once via `ctx.waitUntil`
  - on success: `postSentryCheckIn('in_progress')` then `postSentryCheckIn('ok')` with matching checkInId
  - on rejection: `postSentryCheckIn('in_progress')` then `postSentryEvent` then `postSentryCheckIn('error')`
  - **Regression guard**: assert `withSentry` is called with a handler object that does NOT have a `scheduled` key. Prevents a future contributor from re-adding SDK wrapping to the cron path.

#### File references for the next session

The exact files + line numbers to load FIRST (in order):

1. [`mcp-server/src/worker.ts:203-249`](mcp-server/src/worker.ts#L203-L249) — current scheduled handler shape (0.3.13).
2. [`mcp-server/src/worker.ts:~456`](mcp-server/src/worker.ts) — default export with `withSentry(sentryOptions, handler)`.
3. [`mcp-server/src/cron/radar-refresh.ts:172,188,237,277,308`](mcp-server/src/cron/radar-refresh.ts) — `captureMessage` calls that the bare-revert option fails to address.
4. [`mcp-server/src/observability/sentry.ts:46-69,135-158,181-183`](mcp-server/src/observability/sentry.ts) — current wrappers (`sentryOptions`, `captureException`, `captureMessage`, `flushSentry`); reference for envelope shape mapping.
5. [`mcp-server/tests/unit/worker-scheduled.test.ts`](mcp-server/tests/unit/worker-scheduled.test.ts) — 8 existing tests pinning the broken-current behavior; needs rewrite for the new shape.
6. [`node_modules/@sentry/cloudflare/build/cjs/instrumentations/worker/instrumentScheduled.js:38-78`](node_modules/@sentry/cloudflare/build/cjs/instrumentations/worker/instrumentScheduled.js) — the SDK's scheduled-handler wrapper that queues `waitUntil(flush.flushAndDispose(client))` at line 45.
7. [`node_modules/@sentry/cloudflare/build/cjs/flush.js:45-54`](node_modules/@sentry/cloudflare/build/cjs/flush.js) — `flushAndDispose` implementation: `await client.flush(timeout); client.dispose();`
8. [`node_modules/@sentry/cloudflare/build/cjs/withSentry.js:37-54`](node_modules/@sentry/cloudflare/build/cjs/withSentry.js) — `withSentry` mutates the handler in place; passing `{ fetch }` only correctly avoids the scheduled wrap.

#### Verification plan for the fix

1. **Pre-deploy**:
   - `cd mcp-server && npm run typecheck && npm run test` clean
   - From repo root: `npx astro check && npm run lint && npm run lint:css && npm run test:run` clean
   - Existing `worker-scheduled.test.ts` tests pass with new assertions
   - New `sentry-envelope.test.ts` tests pass
2. **Deploy production**:
   - `cd mcp-server && npm run deploy:production` (with `SENTRY_AUTH_TOKEN` bound for source-map upload)
   - Confirm `/health.gitSha` matches the deploy commit
3. **Wait for next cron firing** (≤6h on normal `0 */6 * * *` schedule, OR temporarily set `*/2 * * * *` and `npm run deploy:production` to accelerate — **note budget burn**: see this ticket's "Inoreader budget hazard during verification" section below)
4. **Verify each side independently**:
   - **Cloudflare cron-events dashboard** — next firing reports `Success` (not `Error`)
   - **Sentry mcp-server project → Issues view** — `cron.radar-refresh.error` events on circuit-open / failure path; check-in events in Crons section under monitor slug `radar-refresh`
   - **`/health`** — `inoreaderObservedAt` continues to update on cadence
   - **`wrangler tail`** — `safeLog` lines emit; the `fetch()` POSTs to Sentry's envelope endpoint are visible as outbound network calls (depending on tail format)
5. **If accelerated cron schedule was used for verification, REVERT to `0 */6 * * *`** in `mcp-server/wrangler.toml` and `npm run deploy:production` once. (See the BL-032.75 Phase 0 plan's accelerated-cron pattern.)

#### Inoreader budget hazard during verification

If the verification uses an accelerated cron schedule (`*/2 * * * *`), each firing consumes 6 Zone-1 Inoreader calls. The soft-cap guard at [`radar-refresh.ts:187`](mcp-server/src/cron/radar-refresh.ts#L187) trips at ~94 day-counter, after which firings skip Inoreader entirely while still exercising the new envelope-POST path (still a valid test). Budget impact during verification window:

- `*/2` for 30 minutes: ~15 firings × 6 calls = ~90 calls, against the 100/day Zone-1 cap
- On 2026-05-26's verification, the cap was reached ~22 minutes in, then firings auto-skipped. Plan accordingly.

#### Adversarial audit references (this session's investigation)

This ticket exists because three adversarial audits over the 2026-05-26 session iteratively refined the diagnosis:

1. **First audit (Inoreader egress wrapper for BL-032.75 Phase 0)**: surfaced the prior session's "DSN rotation alone is sufficient" assumption as incomplete; identified that the SDK queues its own `waitUntil` outside our reach.
2. **Second audit (initial fix plan)**: rejected the manual `Sentry.init` inside the scheduled IIFE as insufficient (would still leak through SDK transport internals); recommended the direct-envelope-POST pattern.
3. **Third audit (revert-to-bare-handler plan)**: rejected the "bare revert" RCA as structurally unfounded — the SDK auto-wrap runs in both pre-5/19 and current states; `radar-refresh.ts`'s `captureMessage` calls would still queue events post-revert; the actual rejection mechanism was not pinned down by source-code reading alone.

All three audits converged on: **bypass the SDK on the scheduled path entirely**. That is Option B above.

#### Adjacent backlog items affected by this ticket

- **BL-032.75 Phase 3 (Dashboards + Alerts)** — blocked until cron status is reliable. An alert on Cloudflare cron `Error` is unreliable signal as long as 100% of firings report `Error` while work succeeds.
- **BL-033 (External Pilot Phase 3)** — pilot SLA conversation about cron reliability is harder to defend with the current state of Cloudflare's cron dashboard. Fixing this strengthens the BL-033 pricing/SLA story.
- **The Phase 0 work** itself ([`MCP_SERVER_OBSERVABILITY_BL-032_75.md`](src/docs/development/MCP_SERVER_OBSERVABILITY_BL-032_75.md)) — accurate spend dashboards are unaffected by this incident (egress accounting is independent of cron status), but the cron-status reliability story is what makes the dashboard credible to operators. Phase 0 ships independently; this ticket lights up the "honest cron status" half of the observability promise.

---

### BL-032.77: Sentry envelope-POST reliability + cron drift-detection refinement

**Source**: 2026-05-28 post-deploy observation session — three open Sentry issues on the `gst-mcp-server` project, none of which match the underlying reality of the system (Cloudflare cron logs show 100% success; `/health` confirms radar substrate healthy; Inoreader Developer Console shows 25% daily usage well under budget). | **Effort**: ~half-day investigation (instrumentation) + ~half-day fix once root cause confirmed | **Status**: ✅ **SHIPPED 2026-05-29** — instrumentation via PR #181 (envelope failure-mode logging + persistent Workers observability); Issue B + C root cause identified as Cloudflare double-firing scheduled handlers (post-deploy discovery, 2026-05-29 — see § Post-deploy discovery below); fix via PR #183 (drift threshold raise + cron AE emission + retire noise captureMessage) and PR #184 (cron single-flight dedup lock). One AC deferred — Issue A success captureMessage retirement (per decision below, kept as backup heartbeat until ≥7 days clean Sentry Crons signal post-dedup; revisit ≥2026-06-05) | **Depends on**: BL-032.76 (the envelope path this ticket investigates) | **Blocks**: BL-032.75 Phase 3 alerting credibility (alerts on `cron.radar-refresh.*` Sentry events are unreliable signal while every successful firing surfaces as a noisy Issue + occasional false-positive "timeout check-in")

**As an** operator monitoring the MCP Worker, **I want** Sentry's `gst-mcp-server` Issues view to reflect actionable failures only (not "every cron success creates an Issue" and not "false-positive missed check-in alerts"), AND I want the Phase 0 `inoreader.spend.drift` detection to fire only on real drift (not on parallel-cron eventual-consistency races), **so that** I can trust the Sentry signal as the canonical operations dashboard for BL-033 SLA reporting.

#### Symptoms (observed 2026-05-28 18:00 UTC-3)

The Sentry project `gst-mcp-server` shows three unresolved issues across `All Envs` / 24h:

| Issue                                                                                       | Age  | Events | Users | Severity            |
| ------------------------------------------------------------------------------------------- | ---- | ------ | ----- | ------------------- |
| `Cron failure: radar-refresh` — "Your monitor is failing: A timeout check-in was detected." | 4hr  | 2      | 0     | New / Investigating |
| `cron.radar-refresh.success` — (No error message)                                           | 10hr | 4      | 3     | Ongoing             |
| `inoreader.spend.drift` — (No error message)                                                | 10hr | 1      | 1     | New                 |

The radar loads correctly via `/hub/radar` (Cloudflare cron dashboard reports 100% success across the same 24h window). Inoreader's quota at the time of this report: **25% of Zone-1 daily budget, 0% Zone-2**.

#### Triage by issue

##### Issue A — `cron.radar-refresh.success` Sentry Issue (4 events / 3 users / Ongoing)

**Source**: [`cron/radar-refresh.ts:255-261`](mcp-server/src/cron/radar-refresh.ts#L255-L261) emits `captureMessageEnvelope('cron.radar-refresh.success', 'info', ...)` on **every successful firing**. Sentry treats every `captureMessage` call as an Issue regardless of `level` — so every success creates/updates one grouped Issue with re-fires.

**Why it used to make sense**: pre-BL-032.76, this was the only Sentry-side signal that crons were running. Defended as a positive heartbeat.

**Why it's now redundant**: BL-032.76 ships a proper Sentry Crons check-in (`postSentryCheckIn(env, 'radar-refresh', 'ok', ...)`) for the same signal. BL-032.75 Phase 1 (PR #179) will dual-write a `cron_outcome` event to AE once Step 6 wires the emitter post-soak. The captureMessage is duplicate signal AND actively misleading (green successes show up as an unresolved Issue).

**Decision (2026-05-28)**: **keep the success captureMessage for now**, as a backup heartbeat until Issue B (envelope check-in reliability) is fully diagnosed and resolved. Once we have ≥7 days of clean Sentry Crons check-ins post-fix, drop the captureMessage in a one-line follow-up commit.

##### Issue B — "Cron failure: timeout check-in" (2 events / 4hr ago / New)

**Symptom**: Sentry Crons monitor flags a missed close-in. The `in_progress` check-in was received but no matching `ok`/`error` arrived within the auto-created monitor's window. Cloudflare cron logs confirm the firing succeeded; the radar substrate is healthy; the cron handler reached the `ok` branch (otherwise `radar-refresh.success` wouldn't have surfaced as Issue A).

**Root cause hypothesis (likeliest first)**:

1. **`postEnvelope` doesn't check `response.ok`.** [`sentry-envelope.ts:79`](mcp-server/src/observability/sentry-envelope.ts#L79) does `await fetch(...)` then `catch {}` on network errors only — Sentry-side 4xx (e.g. 429 project-rate-limit) or 5xx (transient) returns silently. Each cron firing currently emits **~4-5 envelope events within seconds**: `in_progress` check-in + `proactive-refresh.skipped` (info) + `radar-refresh.success` (info) + `ok` check-in + occasionally `inoreader.spend.drift` (warning) or OAuth-refresh captures. That burst can trip Sentry's project-level Spike Protection or per-DSN throttling. We have zero visibility into Sentry-side rejection today.

2. **Sentry's `check_in_id` matching fails** between `in_progress` and `ok` envelopes — would require a serialization mismatch we can't see; unlikely given the code is uniform, but verifiable per-event in Sentry's UI by inspecting check-in pair IDs.

3. **Worker isolate eviction mid-firing** — `ctx.waitUntil` gives 30s wall-clock on free tier (much longer on paid). The IIFE chain (~10-30s wall-clock for the full radar refresh) shouldn't approach the limit, but a cold-start + Inoreader latency spike + Upstash flap could.

4. **Network blip on the `ok` POST** — possible but doesn't fit the 25% drop rate (2 misses out of ~8 firings since the BL-032.76 deploy).

**Initial proposal rejected by operator (2026-05-28)**: adding retry-once + tighter `monitor_config` margins felt like patching symptoms without identifying the root cause. The operator's instinct is correct — we should diagnose before fixing.

**Agreed first action**: **instrument `postEnvelope` to log on non-2xx response (with status + URL) AND log on abort/timeout separately.** Deploy, wait for the next 1-2 missed check-ins, observe which failure mode hits. Then decide between:

- "Sentry envelope returned 429" → reduce per-firing envelope count (drop Issue A's captureMessage; throttle drift alerts) OR raise the Sentry project's quota / Spike Protection threshold
- "Sentry envelope returned 5xx" → transient; retry-once IS the right fix
- "fetch aborted (timeout)" → network blip; retry-once still appropriate
- No new visibility → deeper investigation needed (Worker isolate lifecycle; check-in ID matching)

##### Issue C — `inoreader.spend.drift` (1 event / 10hr ago / New)

**Payload** (from operator's Sentry UI inspection 2026-05-28):

```
category: cron-radar
counter:  4
drift:    3
observed: 1
```

**Initial interpretation (incorrect)**: counter > observed means our wrapper is over-counting Zone-1 calls — maybe `stream/contents/*` is actually Zone-2 not Zone-1.

**Verified against Inoreader docs (2026-05-28)** [https://www.inoreader.com/developers/rate-limiting](https://www.inoreader.com/developers/rate-limiting): `/reader/api/0/tag/list`, `/reader/api/0/stream/contents/*`, and `/reader/api/0/stream/items/contents` are **all Zone 1**. Our wrapper's classification ([`inoreader-egress.ts:83-89`](mcp-server/src/lib/inoreader-egress.ts#L83-L89)) is correct.

**Refined root-cause hypothesis**: **Inoreader's quota counter has eventual consistency under parallel cron load.** A single cron firing makes 6 Zone-1 calls in parallel via `Promise.all` (1 tag-list + 4 folder streams + 1 annotated-items). The `X-Reader-Zone1-Usage` header on each response reflects Inoreader's server-side cumulative count at the time the request was processed. Under parallel load, the first request to complete observes a low `usage` value while our local counter (incrementing on each completion) is already higher.

Timeline that matches the payload:

- 6 cron-radar calls fire in parallel
- First call completes; Inoreader's counter shows 1 (just incremented for this call); our local counter increments to 1 → drift = 0
- Three more calls complete; their response headers are undefined OR carry stale low values (because Inoreader's serialization is concurrent-write-then-read, not synchronous-batch); our local counter is now 4
- Fourth call completes with header=1 → drift = 4 - 1 = 3 → alert fires

This is **drift detection working as designed but flagging a non-actionable race condition**.

**Why this matters**: a real drift signal (uncounted egress path, like the 15-25% gap that justified the Phase 0 wrapper in the first place) would show up as **persistent drift across days** — not one event from a single firing. The current per-call drift check with daily debounce is too sensitive for parallel-cron workloads.

**Fix options (to evaluate after Issue B instrumentation lands)**:

- **(a)** Raise `DRIFT_THRESHOLD_ABS` from 2 to ~6 (one cron firing's full Zone-1 count). Catches over-counting on a >cron-firing scale; tolerates parallel-completion races.
- **(b)** Move drift check from per-call to end-of-firing: after `refreshRadarSnapshot` completes, compare the post-firing local counter delta vs the LAST observed `X-Reader-Zone1-Usage` value of the firing.
- **(c)** Capture parallel-firing semantics explicitly: drift fires only when counter > observed + (expected_parallel_count_of_current_firing).

Option (a) is cheapest; option (b) is most correct. Pick after instrumentation data clarifies whether single drift events represent real over-counting that the threshold-bump would silence vs the race we suspect.

#### Acceptance criteria

- [x] **Instrumentation lands** — `postEnvelope` checks `response.ok`; logs non-2xx status + URL via `safeLog`; logs abort/timeout separately (PR #181).
- [x] **Cloudflare Worker observability** enabled persistently via wrangler config (`[observability]` block with `logs.enabled = true` + `traces.enabled = true`) — verified empirically 2026-05-29 against production Logs + Traces output (PR #181).
- [x] **Diagnosis deliverable** — dominant failure mode identified as Cloudflare double-firing scheduled handlers (production observation 2026-05-29; see § Post-deploy discovery). Documented in-place in this stanza.
- [x] **Issue B fix lands** — single-flight Upstash lock at top of `scheduled` handler keyed on `event.cron:event.scheduledTime`; loser emits `cron_outcome:'deduplicated'` AE event (PR #184).
- [x] **Issue C fix lands** — Option (a) selected: `DRIFT_THRESHOLD_ABS` raised 2 → 6 (PR #183).
- [ ] **Issue A captureMessage retired** — **Deferred** per 2026-05-28 decision: keep success captureMessage as backup heartbeat until ≥7 days clean Sentry Crons signal post-PR-#184 dedup. Revisit ≥2026-06-05.
- [x] BL-032.76 stanza updated with cross-reference (PR #181).

#### Out of scope

- Migrating to Sentry SDK on the cron path — explicitly chosen against in BL-032.76; the envelope path is the architectural decision.
- Adding OpenTelemetry tracing for cron firings — BL-032.75 Phase 3 deferred-tracing decision still holds.
- Changing the cron cadence — `0 */6 * * *` is correct per BL-032.7 budget math.

#### Deploy-time lessons learned (2026-05-28 production deploy)

**Cloudflare Analytics Engine requires a one-time dashboard step before first deploy.** Cloudflare's [get-started docs](https://developers.cloudflare.com/analytics/analytics-engine/get-started/) claim datasets auto-materialize on first write after the binding is declared — and that's TRUE for second-and-later datasets, but the **first** dataset has to be created via the dashboard's "Create Blank Dataset" dialog (with binding name `METRICS` matching wrangler.toml). This flips the account-level enable. Subsequent datasets across other envs (e.g. `mcp_events` after `mcp_events_staging` was created manually) auto-materialize as advertised.

The BL-032.75 Phase 1 closeout audit (PR #179) explicitly claimed "NO manual provisioning required for Phase 1 emission" — that was wrong. DEPLOY.md § A.4.5 has been corrected in this commit to walk operators through the one-time account-level enable. Future operators (or future-you across an Account-level fresh start) won't be surprised.

**This is the kind of doc claim that needs adversarial-audit verification against production reality, not just doc-vs-doc reading.** Cloudflare's own docs were the source of the wrong claim — the audit verified the claim against docs but didn't verify the docs against a real deploy. Lesson for future plan-audit cycles: when a doc-cited fact gates a deploy step, prove it with a dry-run against a real account before declaring the audit clean.

#### Post-deploy discovery — Cloudflare double-firing scheduled handlers (2026-05-29)

**Symptom**: Inoreader Developer API dashboard showed 36 Zone-1 calls today after 3 cron firings (00:00, 06:00, 12:00 UTC). Expected math: 3 × 6 = 18. Actual was exactly 2×. Sentry's `radar-refresh` Crons monitor showed two distinct `check_in_id`s at 06:00 UTC, one Timed Out and one Okay (marked Early for the next slot). Workers Logs at the 06:00 firing emitted `oauth.refresh.cached-by-peer` after waiting 996ms for a peer SETNX lock — proving a concurrent invocation was running.

**Root cause**: Cloudflare's `ScheduledController` may invoke the `scheduled` handler multiple times for the same scheduled fire time. Both invocations independently run the full work (Inoreader fetches, Upstash writes, Sentry check-ins), doubling Zone-1 spend and producing orphan `in_progress` check-ins.

**Resolution**: single-flight Upstash lock at the top of `worker.ts` scheduled handler, keyed on `event.cron:event.scheduledTime`. Reused the existing `mcp-server/src/lib/single-flight-lock.ts` primitive (originally introduced by BL-032.8 for OAuth refresh dedup; same `SET NX EX` semantics, same fail-open behavior). Loser invocation emits a `cron.scheduled.deduplicated` safeLog + a `cron_outcome:'deduplicated'` AE event (new value added to `OUTCOME_VALUES.cron_outcome`) so the dedup rate stays visible. Lock TTL: 300s.

**Correction to PR #183 spend-accounting reasoning**: the `DRIFT_THRESHOLD_ABS=6` rationale ("one full cron firing's worth of parallel calls") was based on incorrect assumption that one scheduledTime = one invocation. With dedup, the threshold still works: it absorbs the parallel-fetch race within one invocation, which is what the BL-032.77 PR #183 audit found in the original drift event payload (`counter=4 observed=1`). No threshold change needed.

**Spend-accounting correction**: prior docs (`MCP_SERVER_OBSERVABILITY_BL-032_75.md`, `wrangler.toml` cron comment) cited "24 calls/day" as the cron-radar baseline. That number was correct as the _intended_ baseline but actual production spend was 48/day pre-dedup. Post-dedup, the docs now match reality.

**Lesson**: production substrate behavior can be subtly different from documented behavior in ways that pure unit tests can't catch. Inoreader Developer API quota dashboards and Sentry monitor histories are the ground-truth surfaces — local counters can lie if they're incrementing in handlers that get invoked multiple times. **Always reconcile against an external authoritative count when first deploying spend-sensitive instrumentation.**

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
- **Listed in ≥2 MCP directories** (Anthropic's registry + MCPMarket.com or Cursor catalog) with >50 install attempts in the first 90 days
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

- [ ] OAuth 2.1 authorization server (or equivalent — see options below) with **PKCE mandatory** for all flows
- [ ] Dynamic client registration **disabled** — clients are onboarded manually as part of the pilot agreement
- [ ] Per-client `client_id` + `client_secret`, secrets stored hashed (Argon2id) in Upstash Redis with rotation supported
- [ ] **Tool-level scopes** — clients receive a scope set per tool, e.g. `tool:generate_diligence_agenda`, `tool:search_portfolio`. Radar tools require an additional `tool:radar:*` scope so radar access can be gated independently (some pilots will not include the GST Take stream)
- [ ] Access tokens are short-lived (1h) with refresh-token rotation; expired tokens return `401` with the spec-compliant `WWW-Authenticate: Bearer error="invalid_token"` challenge
- [ ] Token introspection endpoint protected behind a separate admin scope so support engineers can debug client issues without seeing tokens
- [ ] All OAuth endpoints documented in a `.well-known/oauth-authorization-server` metadata document (RFC 8414)
- [ ] **Bearer-comparison constant-time hardening** — replace `bearer.ts:81`'s plain `value === token` with `crypto.timingSafeEqual` (or equivalent constant-time byte comparison). BL-032 soak verified empirically that WAN-noise dwarfs the timing leak at internal-scope (T.A.15 PASS, 880,000 ns of WAN noise vs ~40-80 ns leak), but the formal contract is plain-`===` which is not defensible at external-pilot scope. Estimated effort: half-day including a unit test that asserts comparison time is independent of mismatch position. Evidence: [T.A.15](./BL-032_TESTING_FINDINGS.md#ta15--token-comparison-timing-safe), [T.I.5](./BL-032_TESTING_FINDINGS.md#ti5--token-comparison-is-constant-time).

**Rate limiting (per-client, contractual)**

- [ ] Per-client tier (`free-pilot` / `paid` / `enterprise`) gates the limit ceilings; tier stored in Redis client record
- [ ] Sliding-window limits applied per-tool per-client — radar tools share the global Inoreader budget circuit breaker introduced in BL-032
- [ ] Quota exhaustion returns `429` with `Retry-After` header + a structured `RateLimit-Policy` header (RFC 9331) describing the limit so client engineers can self-diagnose
- [ ] Soft-limit warning at 80% of quota emitted as an MCP-spec `notifications/message` so the calling agent can throttle itself before hitting the hard limit

**Audit logging (compliance-grade)**

- [ ] Every tool invocation written to an append-only audit log with: ISO-8601 timestamp, `client_id`, IP-prefix (truncated for GDPR — last octet zeroed), tool name, request UUID, **input parameters (full)**, **output payload size in bytes** (not the payload itself by default), durationMs, success/error code
- [ ] Optional `?audit_full_payload=true` per-client flag to retain full output payloads for clients whose compliance regime requires it (must be agreed in writing — flag flips a Redis setting)
- [ ] Logs shipped to a tamper-evident store: append-only S3 bucket with object lock, OR Cloudflare R2 with versioning + immutability — never to the same Sentry/Cloudflare logs used for ops
- [ ] Retention: minimum 7 years to satisfy SEC Rule 17a-4 (the typical PE compliance baseline); confirm exact requirement with each client in pilot agreement
- [ ] Per-client log export available via signed URL (read-only) so clients can ingest into their own SIEM
- [ ] Quarterly audit-log integrity check (hash chain or AWS Object Lock attestation) — automated, results emailed to the compliance contact

**Prompt-injection hardening**

- [ ] All free-text fields in tool outputs (project summaries, FYI GST Take, attention-area descriptions) pass through a sanitization layer that strips: zero-width characters, bidi override marks (U+202A–U+202E, U+2066–U+2069), excessive whitespace runs, and known prompt-injection sentinel phrases ("ignore previous instructions", "you are now", etc.)
- [ ] Output payloads include a top-level `_provenance: { source, sanitized: true, version }` field so calling agents can attribute content
- [ ] Maximum output size: 64KB per tool response; larger results paginate via the MCP `cursor` field. Hard cap prevents an attacker from poisoning a model's context with a giant adversarial blob
- [ ] Inputs validated against the same Zod schemas as Phase 1 PLUS a per-string length cap (no string field over 1KB) — defense in depth against schema-evading payloads
- [ ] Security review (run the built-in `/security-review` Claude Code skill on the MCP server PR, or equivalent independent review) before pilot launch — checklist follows OWASP LLM Top 10 (LLM01: Prompt Injection, LLM06: Sensitive Info Disclosure, LLM10: Model DoS)

**Pilot operations**

- [ ] **Onboarding playbook** documented: legal sign-off, NDA + DPA execution, client_id provisioning, scope assignment, sandbox environment access, joint kickoff call, success metrics
- [ ] Sandbox environment with synthetic projects.json (zero real client data) for client engineers to integrate against before touching production
- [ ] **Regional latency assessment + remediation** — BL-032 soak measured Upstash REST RTT from a GRU-region operator at ~250ms, which means non-radar warm calls land at p95 ~930ms (vs the playbook's <200ms target) and `/health` at p95 ~414ms (vs <150ms target). Code is fine; transcontinental Upstash hops dominate. Before the SLA below is contractually committed, measure latency from each pilot client's region and choose remediation: (a) move the MCP Upstash DB to a region closer to the pilot consumer base, (b) add a Cloudflare KV layer that replicates globally and reduces Upstash hits to once per region per TTL window, or (c) set the SLA region-aware ("p95 <500ms when Worker and Upstash are co-regional; <1.2s otherwise"). Evidence: [T.H.4](./BL-032_TESTING_FINDINGS.md#th4--radar-warm-cache-hit), [T.H.6](./BL-032_TESTING_FINDINGS.md#th6--health-latency-budget).
- [ ] Status page published at `https://status.mcp.globalstrategic.tech` showing uptime, p50/p95 latency, and rate-limit-availability per tool
- [ ] Pilot SLA defined and contractually committed: 99.5% monthly uptime, p95 latency <500ms for non-radar tools, support response <1 business day
- [ ] At least 2 design-partner PE firms onboarded to the pilot
- [ ] Listed in **MCP directories** — submission to MCPMarket.com, Anthropic's official MCP registry, and Cursor's MCP catalog with screenshots and a 60s demo video

**Verification & docs**

- [ ] Public-facing developer docs at `https://docs.mcp.globalstrategic.tech` — tool reference (auto-generated from Zod schemas), authentication guide, rate-limit policy, audit-log schema, status page link
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
8. Public listing on at least one MCP directory with a working "try it" demo

---

### BL-034: MCP Server — Documentation Cleanup

**Source**: BL-034 — rolling cleanup catch-all for the MCP server doc surface | **Effort**: 0.5-1 day (executed at the end of the BL-031.x / BL-032.x / BL-033 sequence) | **Status**: Open | **Depends on**: BL-031.75, BL-032, BL-032.5, BL-032.75, BL-033

**As a** future maintainer of the GST MCP server documentation, **I want** the transitional scaffolding and accumulated cleanup items left behind by the BL-031.x / BL-032.x / BL-033 implementations consolidated into a single closing pass **so that** the doc surface stops carrying conventions that were only useful while the system was being assembled.

> **Why a catch-all**: rolling cleanup items inevitably accumulate during a multi-phase initiative — transitional precedence rules, deferred-now-tractable items, "remove me when X ships" callouts, ADR sections that have served their purpose. Tracking them in their parent initiative would inflate that initiative's AC list and risk the cleanup being skipped. Tracking them here keeps the parent initiatives focused on shipping, and gives a single place to land the "does this still need to exist?" review at the end of the MCP-server initiative sequence.

#### Planning Criteria

**Use cases**

- **Cleanup discipline**: every time a BL-031.x / BL-032.x / BL-033 initiative adds a transitional note (e.g. "remove when BL-Y closes"), add a corresponding bullet to BL-034's AC. The cleanup work itself is small; the discipline is keeping the list in sync as items emerge.
- **Convention maturation**: the BL-031.85 contracts pattern introduced "CONTRACT.md is canonical, AC describes intent". Until that convention is well-understood by reviewers, the per-tool CONTRACT.md docs and the contracts registry need explicit guardrails. Once the convention is internalized (i.e. when reviewers stop asking "is the AC or the CONTRACT.md authoritative?"), the guardrails become noise and should go.
- **ADR-vs-living-doc separation**: architectural decision records (`MCP_SERVER_ARCHITECTURE_BL-031.md`, `MCP_SERVER_HUB_SURFACE_BL-031_5.md`, `MCP_SERVER_CONTRACTS_BL-031_85.md`, etc.) freeze at authoring time and are not maintained against subsequent schema changes. Living docs (per-tool CONTRACT.md, USAGE.md, the contracts registry README) ARE maintained. BL-034's discipline is to verify, at end-of-sequence, that the right artifacts are in the right category — and that no living doc is silently inheriting prose from a frozen ADR.

**Outcomes**

- Transitional sections in `mcp-server/src/docs/contracts/README.md` removed (precedence rule + AC-authoring convention)
- Cleanup AC list below has accumulated bullets from each BL-031.x / BL-032.x / BL-033 initiative as they shipped
- A single closing PR rolls all the cleanup items together — no scope creep into other initiatives

**Business value**

- **Doc-debt prevention** — without an explicit cleanup pass, transitional scaffolding becomes permanent and confuses future maintainers
- **Convention migration** — the contracts pattern (CONTRACT.md canonical, AC conceptual) only matures if the transitional guardrails are removed at the right time; otherwise the convention is "remember to look at the canonical thing" forever, which is weaker
- **Single accountability point** — anyone reviewing the MCP server doc surface at end-of-sequence has one ticket to read, not five "what was that about" archaeology trips

#### Acceptance Criteria

**Transitional scaffolding to remove**

- [ ] `mcp-server/src/docs/contracts/README.md` § "Transitional notes (remove when BL-034 closes)" — the precedence rule and the AC-authoring convention sections — DELETED in full. The convention has either matured (no longer needed) or has been escalated into a permanent doc somewhere appropriate (in which case the redirect is the cleanup item)
- [ ] Verify no other doc references the deleted "Transitional notes" section by anchor; broken links are caught here, not in production

**ADR-vs-living-doc audit**

- [ ] Every per-tool `CONTRACT.md` cross-referenced against its Zod schema and engine source — drift caught and fixed in the contract (the contract is canonical; the schema is the source of truth)
- [ ] Every architectural-decision doc under `src/docs/development/MCP_SERVER_*.md` audited for prose that has become stale since authoring (e.g., "the planned URI manifest" when the URIs have shipped). Stale prose either edited to past tense ("the URI manifest authored under BL-031.5 is...") or deleted; ADRs are not maintained, so they should not contain present-tense claims about the codebase

**MCP server doc structure**

- [ ] Restructure `mcp-server/src/docs/` to add parent directories: `tools/`, `resources/`, `prompts/`. Move existing per-tool docs (`diligence/`, `icg/`, `techpar/`, `tech-debt/`, `regulatory-map/`) into `tools/<tool>/`. Rename `contracts/README.md` → `tools/README.md` (it's already a tool-contracts registry; the rename makes that explicit). Author placeholder `resources/README.md` (URI taxonomy + Library / Regulation / Radar conventions) and a top-level `mcp-server/src/docs/README.md` (navigator). Update all cross-references in `mcp-server/README.md`, `src/docs/README.md`, `src/schemas/<tool>.ts` top-of-file comment blocks, and any planning artifacts (e.g., [`MCP_SERVER_CONTRACTS_BL-031_85.md`](MCP_SERVER_CONTRACTS_BL-031_85.md)) referencing the old paths. Pure restructure; no behavior change. Note: BL-031.75 Commit 3 places `mcp-server/src/docs/prompts/README.md` (the registered-prompt conceptual reference) under the new structure pre-emptively — that file forces the `prompts/` parent directory to exist; this restructure simply moves the existing tool docs into `tools/` to match

**Items accumulated during prior initiatives** (append as they emerge)

- [ ] Library content-source convergence — if/when an Astro content-collection migration happens, replace the parallel-canonical `.md` digests with the unified source. Tracked here pending that decision; see [BL-031.5 deviation](MCP_SERVER_HUB_SURFACE_BL-031_5.md#deviation--library-content-source-bl-0315)
- [ ] Radar per-item URIs — `gst://radar/item/<id>` URIs were deferred in BL-031.5. Re-evaluate after BL-032 ships live data with stable item IDs; either author them as a Resource family or formally drop them from scope
- [x] **DONE (silently resolved; verified 2026-05-26)**: Portfolio per-tool `CONTRACT.md` exists at [`mcp-server/src/docs/portfolio/CONTRACT.md`](../../../mcp-server/src/docs/portfolio/CONTRACT.md) (authored 2026-05-03 per the doc's `lastAuthored` frontmatter); the README link at `mcp-server/README.md:57` resolves. The "broken link" framing was stale at filing time. `USAGE.md` is not currently per-convention required for any tool — closing the bullet retroactively. If a future need emerges, file separately
- [x] **DONE 2026-05-02 (BL-031.95 Phase 3.B)**: `search_radar_cache` `CONTRACT.md` authored at `mcp-server/src/docs/radar/CONTRACT.md` as part of BL-031.95 Phase 3 closure. Mirrors the website's single-filter surface (`category` only); documents the capability-mirror invariant explicitly so the future live `search_radar` (BL-032) inherits the same discipline. Earlier framing — "planned alongside live BL-032" — was wrong: the cached tool earns its own contract because it has its own user-facing semantics, and the live tool will get its own contract that compares/contrasts with this one
- [x] **DONE 2026-05-26 (commit `88bc246`)**: **Contract-parity Vitest** shipped at [`mcp-server/tests/integration/contract-parity.test.ts`](../../../mcp-server/tests/integration/contract-parity.test.ts). Walks every CONTRACT.md, asserts frontmatter required fields, schema-path resolution, and opt-in bidirectional enum parity via `enumParity` frontmatter blocks. Three contracts opted in at landing: radar (`RADAR_CATEGORIES`), icg (`COMPANY_STAGE_VALUES`), tech-debt (`DEPLOY_FREQUENCY_VALUES`). Others can opt in incrementally — one-line frontmatter additions, no test-code changes. Drift-verified: temp-commented `'security'` out of `RADAR_CATEGORIES` → test failed loudly; restored → green
- [x] **DONE 2026-05-26 (commit `88bc246`)**: **YAML frontmatter on each `CONTRACT.md`** shipped. All 7 contracts (diligence, icg, portfolio, radar, regulatory-map, tech-debt, techpar) carry `tool`, `version`, `lastAuthored`, `schema` frontmatter; the contract-parity test asserts the fields are well-formed and that the cited `schema` path resolves on disk. Two contracts (icg, tech-debt) ship with opt-in `enumParity` blocks at landing in addition to radar's. Schema validation enabled IRL generator consumption (future BL) and the contract-staleness pattern (future Vitest analogous to `prompts.test.ts`)
- [ ] **IRL generator scoping spike** (filed from BL-031.85 closure, 2026-05-02) — Information Request List generator was named in [`MCP_SERVER_CONTRACTS_BL-031_85.md`](MCP_SERVER_CONTRACTS_BL-031_85.md) as the strategic destination of the contracts pattern. With 5 contracts now stable (and a 6th canonical-stage-aware layer landing under [BL-031.87](#bl-03187-mcp-server--stage-taxonomy-adapter-layer)), the contracts have enough variance for a 2-3 hr scoping spike: pick a concrete consumer use case (likely "external diligence prep for offline analyst preparing inputs in advance of a kickoff call"), define the rendering format (likely JSON Schema generated from each CONTRACT.md plus the YAML frontmatter once landed), validate the offline-submission mechanism. **Graduation note**: this is a placeholder for an initiative, not a BL-034 cleanup item. Once the spike produces concrete scope, file as a new BL number (suggested: BL-031.97 or BL-038) and remove this bullet. Keeping it here so the proximate-opportunity capture isn't lost between initiatives
- [x] **DONE 2026-04-29**: deleted `MCP_SERVER_HUB_SURFACE_BL-031_5_Verification.md`. Recorded evidence migrated to [`mcp-server/README.md` § Smoke test](../../../mcp-server/README.md#smoke-test-manual-parity-check); UX findings logged in this BL-034 list above; doc history reachable via `git log`. The pattern (transitional punch-list doc → migrate to README → delete) is reusable for future MCP initiatives that ship code-complete with deferred verification
- [ ] **Wizard / API symmetry follow-up** (discovered during BL-031.5 V1 verification trial 1): the ICG MCP API accepts sparse `answers` maps that the website wizard cannot produce (the wizard forces an answer for every question). Documented in [`icg/CONTRACT.md`](../../../mcp-server/src/docs/icg/CONTRACT.md) hidden-semantics section as intentional asymmetry. Decide at end-of-sequence whether to (a) keep as-is and rely on the doc, (b) add an `answeredCount`-based result-confidence indicator to the API output, or (c) require the API to receive all questions (matching wizard discipline). Same audit needed for `compute_techpar` (`null` return when arr/infraHosting are 0 — wizard handles this differently) and any other tool where API and wizard input completeness rules differ
- [ ] **TechPar `exitMultiple` UX gap** (discovered during BL-031.5 V2 verification trial 1; **confirmed still present, re-verified 2026-05-26**): the wizard's exit-multiple input is conditionally rendered — only visible when stage is `pe` or `enterprise`. At [`src/utils/techpar-ui.ts:67-68`](../../../src/utils/techpar-ui.ts#L67-L68) (line numbers shifted from the original `:65-67` citation): `const showExit = tp.stageKey === 'pe' || tp.stageKey === 'enterprise'; g('exit-field')?.classList.toggle('tp-exit-field--vis', showExit);`. The visibility toggle is CSS-class-only — the underlying state `tp.exitMultiple` and the DOM input value persist when the stage drops below PE. The stage-change handler at [`techpar-ui.ts:200-217`](../../../src/utils/techpar-ui.ts#L200-L217) sets `tp.stageKey` and re-renders but does NOT reset `tp.exitMultiple`. **Result**: a user who sets `exitMult=15` while on Enterprise and then switches to Series B-C silently carries 15× into their results, URL state, and any downstream calculations, with no UI to inspect or modify. Note: in scenarios where `gap.cumulative36 = 0`, the value has no observable output impact; in scenarios where cumulative excess is non-zero, the silent persistence directly affects `gap.exitValue`. Original options: (a) reset `exitMultiple` to its default when stage drops below PE, (b) show the field at all stages with stage-appropriate guidance, (c) add a "current state" inspection panel that exposes hidden values, or (d) document the behavior as intentional. **Decision needed**: pick one of (a)-(d) at end-of-sequence
- [x] **DONE (silently resolved; verified 2026-05-26)**: **Tech Debt direct-input quantization bug** (discovered during BL-031.5 V3 verification). The bug existed because the change handlers stored slider position (`state.arrPos`) rather than raw value, and `render()` then round-tripped through `posToArr` losing precision. **Current code at [`tech-debt-calculator/index.astro:1845-1862`](../../../src/pages/hub/tools/tech-debt-calculator/index.astro#L1845-L1862) implements option (a)**: number-input handlers store raw values via `state.arr = value`, `state.salary = value` (line 1775), `state.remediationBudget = value` (line 1880); slider DOM position is re-derived via `arrToPos(state.arr)` / `salaryToPos(state.salary)` / `budgetToPos(state.remediationBudget)` for display only. `render()` reads raw state directly (e.g. line 1553) and the engine sees the raw value. **No work needed** — closing the bullet retroactively. The "silently resolved" pattern is worth flagging: a future BL-034 sweep should grep open bullets against current code before assuming the issue is still live
- [x] **RETRACTED (filed in error 2026-05-26; retracted same day)**: "ICG `answeredCount` accounting bug." Adversarial audit on the proposed fix surfaced that the behavior I called a bug is **documented contract** at [`icg/CONTRACT.md:109`](../../../mcp-server/src/docs/icg/CONTRACT.md#L109) (`"distinct keys in answers"`) and pinned by an existing regression test at [`tests/unit/icg-engine.test.ts:303-309`](../../../tests/unit/icg-engine.test.ts#L303-L309) literally named `'reports correct answeredCount (includes -1 entries)'`. The `-1` sentinel means **"Not sure"** — a deliberate, scored answer, NOT a skip. The engine comment at [`icg-engine.ts:112`](../../utils/icg-engine.ts#L112) (`// -1 ("Not sure") scores as -1 — ignorance is worse than known absence (0)`) confirms intent. Proposed fix would have broken the regression test on purpose and tripped the BL-034 contract-parity test I shipped earlier in the same session. **The real ambiguity was the display string**, not the engine — fixed separately at [`icg-engine.ts:235`](../../utils/icg-engine.ts#L235) (rename "Questions answered" → "Responses recorded"). **Process lesson**: a bullet describing behavior must be verified against the relevant `CONTRACT.md` AND existing tests before filing as a confirmed bug — surface that as a discipline note on this BL-034 ticket
- [ ] (Add bullets here as new transitional items emerge during BL-031.75 / BL-032 / BL-032.5 / BL-032.75 / BL-033 implementation)

**Verification & docs**

- [ ] Repo-root `npx astro check && npm run lint && npm run lint:css && npm run test:run` continues to pass after the cleanup
- [ ] `mcp-server/` workspace `npm run typecheck && npm run test && npm run build` continues to pass
- [ ] All markdown links across the MCP doc surface resolve (no 404s introduced by the cleanup)

#### Technical Context

**The discipline**

When implementing any BL-031.x / BL-032.x / BL-033 initiative:

1. If the initiative adds a transitional note (e.g., a "remove when X closes" callout), append a corresponding bullet to BL-034's AC list in the same PR. This keeps the AC list current.
2. If the initiative defers an item (e.g. "we'll author this later"), check whether it belongs here vs. its own ticket. Items that are scoped + bounded get their own ticket; items that are "see if this still matters at end-of-sequence" go here.
3. The discipline is conventional, not enforced by CI. Reviewers should ask "did this PR introduce a transitional note? if so, is it tracked under BL-034?"
4. **Verify before filing (added 2026-05-26 after the ICG `answeredCount` retraction incident)**: a bullet describing behavior in this list must be verified against the relevant per-tool `CONTRACT.md` (if one exists) AND existing tests before being filed as a confirmed bug. The "Tech Debt direct-input quantization" bullet (closed 2026-05-26 as silently-resolved) and the "ICG `answeredCount`" bullet (retracted 2026-05-26 as documented-contract-not-a-bug) both illustrate the failure mode this rule prevents: reading 1-2 lines of source and assuming intent without checking whether the contract or existing tests document the behavior as intentional. The rule is: grep the contract for the field name, grep the tests for the field name, read both — then either file the bullet with the contradictions cited or annotate the existing contract/test as ambiguous.

**Why this is its own initiative (not folded into BL-031.85 or BL-033)**

- BL-031.85 is content-authoring work (the contracts pattern). The cleanup of _its own_ transitional scaffolding is a separate concern that depends on the convention having matured — which only happens after the convention has been used in subsequent initiatives.
- BL-033 is hardening work (OAuth, audit logs, prompt-injection sanitization). Bundling cleanup into BL-033 would risk the cleanup being skipped under hardening pressure.
- A separate ticket means a separate review gate: "does the doc surface need closing items?" is a question worth asking explicitly at the end of the sequence.

**Out of scope**

- Active doc maintenance during BL-031.x / BL-032.x / BL-033 — that's each initiative's responsibility
- Architectural decision docs are explicitly NOT in scope to be maintained — they are point-in-time records and the cleanup audits them for stale present-tense claims, not for current accuracy
- Any new feature work — BL-034 is exclusively a doc-cleanup pass

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

### BL-036: MCP Server — `gst_vdr_audit` Quality Maturity Roadmap (Tier 3 RETIREMENT)

**Source**: BL-036 — originally scoped 5 maturity tiers (file metadata → comparable cross-reference → VDR provider API integration → ongoing audit deltas → sell-side workflow polarity). Tier 1 (folder-name input) shipped May 2026 via the BL-031.75 V5 sign-off. | **Effort**: original 1-3 weeks across 5 tiers; ❌ **RETIRED 2026-05-31** instead — net retirement effort ~3 hours engineering + doc cleanup. | **Status**: ❌ **RETIRED 2026-05-31** — operator assessment 2026-05-31 determined the capability's business value insufficient to justify the contents-grounded improvements originally scoped under Tiers 2-6. Tier 3 (this stanza) closes the surface entirely: prompt deleted, tests deleted, golden snapshot deleted, cross-doc citations cleaned. Library Resource `gst://library/vdr-structure` retained (still used by 3 other prompts). | **Depends on**: BL-031.75 (closed).

#### Retirement record (this is the live stanza)

**Decision**: `gst_vdr_audit` retired entirely. The original Tier 2-6 maturity roadmap (below, preserved as historical context) is **canceled in full**. The prompt's "thin checklist generator" character that V5 sign-off critiqued was not improved by the (intended) Tier 1 file-list input — operator judgment is that the deliverable does not earn the maintenance + further-investment cost.

**Tier status**:

- **Tier 1** (folder-name + file-list input) — shipped May 2026 under BL-031.75 V5; **deleted as part of Tier 3 retirement 2026-05-31**.
- **Tier 2** (file metadata) — ❌ canceled.
- **Tier 3** (this stanza) — **retirement** of the entire surface, including Tier 1.
- **Tiers 4-6** (VDR provider API / ongoing deltas / sell-side workflow flip) — ❌ canceled with the capability.

**Retirement scope** (delivered via PR <TBD>):

- **Code**: `mcp-server/src/prompts/vdr-audit.ts` deleted; import + `ALL_PROMPTS` entry removed from `_registry.ts`; comment cross-reference scrubbed from `information-request-list.ts`.
- **Tests**: `tests/unit/prompts/vdr-audit.test.ts` (15 cases) + `tests/examples/vdr-audit.golden.md` (V5 sign-off snapshot) deleted. Test suite now 93 files / 1090 tests (was 94 / 1105).
- **Manifest contract**: hash bumped `b702aa38…` → `4941f4bf…`; prompt count 10 → 9; `mcp-server/BREAKING_CHANGES.md` § 0.3.15 entry added; `mcp-server/package.json` 0.3.14 → 0.3.15.
- **Cross-doc operational citations** (7 docs edited): `mcp-server/README.md` (Prompts table row + Resource consumer list + Last-verified trial + Tier 1 sentence + test-count narrative), `REMOTE_CLIENT_SETUP.md:269`, `MCP_SERVER_OPENCLAW_HANDOVER_BL-032_6.md` (table row + consumer list + Prompts count), `MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md:70` (operational inventory count), `MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md` (5 broken `mirrors vdr-audit.ts` template-pattern pointers rewritten to a surviving exemplar), `BACKLOG.md` L232 + L283 (BL-043 stanza companion-prompts framing).
- **Historical-record retention banners** (2 doc tops): `BACKLOG.md` BL-031.75 stanza + `MCP_SERVER_PROMPTS_BL-031_75.md` design doc each gain a top-of-doc banner explaining that `gst_vdr_audit` mentions below are preserved as the V1–V8 sign-off historical record, not active surface. Covers ~14 references in two edits without falsifying the original ship trail.
- **Design doc closure** (this commit): `MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md` title rewritten + closure banner added; body retained as institutional knowledge for any future contributor considering a similar surface.

**What's NOT removed**:

- The Library Resource `gst://library/vdr-structure` — still used by `gst_diligence_kickoff`, `gst_diligence_handoff_memo`, and `gst_irl_ingestion` (renamed from `gst_diligence_sweep` under BL-045 PR B). Operators who want the canonical VDR taxonomy still get it via those prompts or by reading the Library article directly via `resources/read`.
- The BL-031.75 V5 sign-off historical record — preserved with retention banners so the original ship trail can be read accurately.

**Why retain this stanza after retirement**: documents the rationale + the inventory of what was removed, so a future contributor proposing a similar audit surface has the prior-art context readily searchable. The dedicated design doc [MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md](MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md) is retained with a closure banner for the same reason.

---

#### Original Tier 2-6 roadmap (preserved as historical reference)

The text below describes the maturity plan as it stood prior to retirement. Tiers 2-6 are now ❌ canceled in full; the content survives so future contributors considering a similar surface can read the prior-art design decisions.

**As a** GST consultant running technology diligence in Claude Desktop, **I want** the `gst_vdr_audit` prompt to operate on richer VDR signal than folder names alone **so that** the audit deliverable reflects contents quality, deal-shape comparables, and (eventually) live VDR provider state — not just structural mapping against the canonical 9-folder taxonomy. This closes the "thin checklist generator" gap surfaced during V5 sign-off and matures the prompt's value-per-invocation to match V1 / V3 / V4.

#### Planning Criteria

**Use cases — five independent tiers, shippable in order**

- **Tier 2 — File metadata accepting** (~1 day) — extend the `vdrFolders` shape from `{ name, files? }` to `{ name, files?: { name, modifiedAt?, sizeBytes? }[] }`. Body picks up staleness flags ("Security folder's pen test dated 2022 — >3 years stale"), dump-vs-curated patterns ("hundreds of files all dated within two days suggests rushed assembly"), and signed-PDF detection (size > 200KB + extension). Audit gains real "what to actually trust" judgment instead of structural-only assessment.

- **Tier 3 — Comparable-engagement cross-reference** (~half-day, depends on portfolio search remaining stable) — after producing the gap list, automatically call `search_portfolio` for similar engagements and surface "in deals like this, the Security gap typically revealed X / led to Y price adjustment." Connects this prompt's structured output to the portfolio data; output becomes deal-grade rather than checklist-grade. Mirrors the cross-reference pattern used in `gst_diligence_handoff_memo`.

- **Tier 4 — VDR provider API integration** (~1-2 weeks per provider; BL-031.95+ scope envelope) — direct integration with Datasite / Ansarada / Intralinks APIs so the user supplies a VDR URL or provider session token instead of pasting folder + file metadata. The prompt pulls the actual structure, file counts, last-modified timestamps, watermark/access logs. This is where it becomes a real audit, not a checklist. Likely sequenced after BL-032.5 (remote MCP) so credential handling has a place to live.

- **Tier 5 — Ongoing audit deltas** (~half-day, requires Tier 4) — "Compare this snapshot to last week's snapshot — what changed?" Surfaces newly-added folders, pulled documents (red flag), late-arriving security artifacts. Becomes a process tool with state, not a one-shot. Requires snapshot persistence — likely tied to the same storage that BL-032.75 (production observability) introduces.

- **Tier 6 — Sell-side workflow flip** (~1 day, repositions the prompt) — add a `mode: 'sell-side-prep' | 'buy-side-audit'` arg. Sell-side prep flips the polarity: same canonical taxonomy, but the output is "here's what you need to assemble before you open the VDR" rather than "here's what's missing." Founders preparing for exit get a different, equally-useful output from the same engine. Doubles the prompt's addressable use base.

**Outcomes**

- `gst_vdr_audit` value-per-invocation matches the rest of the BL-031.75 surface (V1 diligence kickoff, V3 comparable engagements, V4 regulatory exposure) — every tier completed adds verifiable signal that GST's canonical taxonomy + a Word template can't replicate
- Tier 4 sets the technical pattern for any future "live external surface" prompt (e.g., live Slack channel summarization, live GitHub repo audit) — credential handling, snapshot persistence, delta computation become reusable primitives
- Tier 6 doubles the addressable use base — same engine serves buy-side and sell-side workflows from one prompt

**Business value**

- **Closes the BL-031.75 V5 critique definitively** — the senior consultant flagged the prompt as the weakest of the eight; tiers 2-3 alone close most of that gap
- **Converts a checklist generator into a real audit tool** — Tier 4 changes the prompt's identity from "starting point" to "deliverable." Aligns the surface with GST's "deal-team-ready output" promise
- **The pattern generalizes** — input-quality enrichment → contents-quality heuristics → portfolio cross-ref → external-API integration → ongoing tracking is a template that applies to other prompts (e.g., a future `gst_repo_audit` over a live GitHub org)
- **Modest engineering investment per tier** — Tiers 2, 3, 5, 6 are each ≤1 day. Tier 4 is the heavyweight (1-2 weeks) and is intentionally deferred until BL-032.5 makes credential handling viable

#### Acceptance Criteria

**Tier 2 — File metadata** (single-tier sub-deliverable)

- [ ] `vdrFolders[].files[]` accepts `string | { name: string, modifiedAt?: string, sizeBytes?: number }` (string remains the Tier 1 shape; object adds metadata)
- [ ] Audit body's Step 2b extended with metadata-aware signals (staleness, signed-PDF detection, dump-vs-curated)
- [ ] At least one regression test asserting metadata flows from input to body
- [ ] V5 re-run with metadata-rich mock; output captured in golden snapshot

**Tier 3 — Comparable cross-reference**

- [ ] After producing the gap list, prompt body instructs the model to call `search_portfolio` with a derived query (e.g., theme inferred from the target's product context)
- [ ] Per-gap "in similar deals, X" annotation surfaced when ≥1 comparable matches
- [ ] Cross-reference is opt-out via a new `crossReference: boolean` arg (default `true`) so analysts running short on tokens can skip
- [ ] Test asserts the body mentions `search_portfolio` literally when crossReference is true

**Tier 4 — VDR provider API integration**

- [ ] Architecture doc authored (per BL-031.5 / BL-031.75 pattern)
- [ ] Provider-agnostic interface: VDR provider plugged in by name (`provider: 'datasite' | 'ansarada' | 'intralinks'`), credential lookup via the BL-032.5 remote secret store
- [ ] At least one provider integration shipped (Datasite proposed first based on M&A market share)
- [ ] Audit input expanded to accept `{ provider, sessionRef }` in lieu of `vdrFolders` / `vdrInventory`; the tool wrapper enumerates the structure server-side
- [ ] Round-trip parity test: a real VDR's structure produces an audit indistinguishable in shape from the structured-input path

**Tier 5 — Ongoing audit deltas**

- [ ] Snapshot persistence layer chosen (likely tied to BL-032.75 observability storage)
- [ ] New input arg `compareToSnapshot: <ref>` triggers delta mode
- [ ] Output adds a "Changes since last audit" section: added folders, removed folders / pulled documents, file-level changes within folders, staleness changes
- [ ] Pulled-documents flag is surfaced prominently (red flag — typically signals an issue with materials previously disclosed)

**Tier 6 — Sell-side workflow**

- [ ] `mode: 'sell-side-prep' | 'buy-side-audit'` arg added (default `'buy-side-audit'` for backward compat)
- [ ] Body adapter: in `'sell-side-prep'` mode, output framing flips from "what's missing" to "what to assemble" — same canonical taxonomy, polarity reversed
- [ ] Output for sell-side mode includes a recommended assembly sequence (e.g., "weeks 1-2: Software Architecture + SDLC; weeks 3-4: Security; weeks 5+: Governance + People") tied to the canonical taxonomy
- [ ] Test asserts the body's output framing matches the supplied mode

**Verification & docs**

- [ ] Each tier earns a verification entry similar to BL-031.75 V<n> with input + output + sign-off
- [ ] `mcp-server/README.md` § "Last verified" extended with a "BL-036 surface" stanza per tier shipped
- [ ] When all five tiers are complete, retire the V5 "Spec note (2026-05-01)" caveat in the BL-031.75 verification doc

#### Technical Context

**Why split into five tiers rather than ship as one initiative**

- Each tier is independently valuable and validates the prior tier's assumptions before the next is committed. Shipping Tier 2 will reveal whether file metadata is sufficient signal or whether the value only unlocks at Tier 4 (live integration); knowing that informs whether to invest the 1-2 weeks Tier 4 demands
- Tiers 4-5 depend on infrastructure that doesn't exist yet (BL-032.5 credential store, BL-032.75 observability storage); ordering ensures we don't build the prompt enhancement ahead of the platform it requires
- The pattern is a useful proving ground for the "live external surface" prompt class — the order is essentially "input enrichment → contents heuristics → cross-portfolio reasoning → external API → ongoing state." Insights from each tier will inform similar prompts authored later

**Why not BL-035 or BL-031.95 line items**

- BL-035 is the dynamic visual effects prototype — unrelated surface
- BL-031.95 is "Hub Tools URL State Restoration & MCP Deep-Link Surface" — different surface (Hub tools, not MCP prompts) and different problem class
- BL-036 needed its own home so the V5 critique has a tracked closure path independent of the URL state work

**Tier dependencies (visual)**

```
Tier 1 (DONE in BL-031.75 V5 closure)
  └── Tier 2 (file metadata)
        └── Tier 3 (comparable cross-ref)
        └── Tier 4 (VDR provider API) — also requires BL-032.5
              └── Tier 5 (audit deltas) — also requires BL-032.75
  └── Tier 6 (sell-side workflow) — independent of Tiers 2-5
```

---

### BL-037: MCP Server — CI/CD Deploy Workflows

**Source**: BL-037 — surfaced during BL-032 soak (2026-05-10) when the operator asked why Cloudflare deploys aren't CI/CD-driven. The current BL-032 ops model (operator-driven `npx wrangler deploy --env staging` per [DEPLOY.md](../../../mcp-server/src/docs/operations/DEPLOY.md)) is a deliberate phase choice for soak-velocity, not best practice for steady state. | **Effort**: ~2-3 days engineering | **Status**: ✅ **SHIPPED 2026-05-31** — Phase A via PR #199 + hardening PR #201; Phase B via PR #202; post-Phase-B audit gap closure via PR #203; Phase C (rollback automation) via PR #204. **Phase D (secret sync) extracted to [BL-048](#bl-048-mcp-server--wrangler-secret-sync-extracted-from-bl-037-phase-d) — deprioritized + indefinite defer with documented revisit thresholds**. | **Depends on**: BL-032 (closed); BL-033 originally listed as a Phase B precondition — reconsidered 2026-05-31 because the dependency was about the reviewer gate's value (highest with external consumers), not about deploy plumbing being impossible.

**As a** GST operator running the MCP server, **I want** Cloudflare Workers deploys to be triggered by CI/CD on push to long-lived branches **so that** the deploy story is reproducible, auditable, secret-free on developer machines, and gated on test pass — without giving up the operator-direct path needed for emergency rollback. This closes the "wrangler runs from my laptop" pattern that's acceptable during BL-032 soak but doesn't scale beyond it.

#### Planning Criteria

**Use cases — phased rollout**

- **Phase A — Staging auto-deploy on push** (~half-day) — Add `.github/workflows/deploy-mcp-staging.yml` triggered on push to `feature-mcp1` and `dev`. Uses `cloudflare/wrangler-action@v3` with `CLOUDFLARE_API_TOKEN` in GitHub Secrets. Gates on lint + typecheck + `test:run` passing. Posts a `/health` smoke probe against the deployed URL and fails the workflow if the new `gitSha` doesn't propagate within 60s. **Operator still has `npx wrangler deploy` for emergencies** — CI is additive, not exclusive.

- **Phase B — Production deploy on merge to master** (~half-day, after BL-033 ships) — Add `.github/workflows/deploy-mcp-production.yml` triggered on push to `master`. Same gating as Phase A plus an explicit GitHub Environment with required reviewers (so a human approves each production promotion). Production deploys never trigger from feature branches. Aligns with BL-033's external-consumer commitment — by the time externals depend on the surface, "Reid pushed at 4pm" is no longer an acceptable answer to "who deployed this?"

- **Phase C — Rollback automation** (~half-day) — A workflow_dispatch-only `rollback-mcp.yml` that takes a `version-id` input, runs `wrangler rollback`, and posts the result. Means rollback no longer requires someone with the Cloudflare API token configured locally. The DR runbook in [DEPLOY.md § C](../../../mcp-server/src/docs/operations/DEPLOY.md) still documents the operator-direct path for the case where GitHub itself is down.

- **Phase D — Wrangler secret sync** (~1 day, optional) — A workflow that reads from a chosen secret manager (1Password Connect, Doppler, AWS Secrets Manager — pick one) and pushes wrangler secrets idempotently. Closes the "operator has to remember to run `wrangler secret put` after rotating MCP_KEY_RP" gap. Phase D is not blocking — operator-direct secret rotation is fine at single-operator scale; this earns its keep when there are multiple operators or compliance audit requirements.

**Outcomes**

- A `git push origin feature-mcp1` deploys to staging with no manual `wrangler` invocation; CI logs show what was deployed when by whom
- A merge to `master` deploys to production behind a required-reviewer gate (BL-033 phase)
- Cloudflare API token lives only in GitHub Secrets; no developer machine carries it after the migration
- Operator-direct deploy path remains documented and functional for emergency use (the DR runbook stays valid)

**Business value**

- **Reproducibility & audit trail** — every production deploy traces to a commit + a CI run + a reviewer; no "what did we ship at 4pm Friday" mystery
- **Secret hygiene** — Cloudflare API tokens stop sitting on individual developer machines (security improvement, surfaces in BL-033's external-consumer compliance review)
- **Test-pass gating in the path** — currently, an operator could deploy with failing tests if they ignored CI; CI-gated deploys make this a workflow violation, not a habit choice
- **Predictable hotfix latency** — a documented "operator-direct path is allowed when CI is unavailable" caveat preserves the BL-032 hotfix story while making CI the default
- **Standard pattern** — most production-grade Cloudflare Workers deploys use this exact shape; aligns the project with industry norms before BL-033 brings external auditability into scope

#### Acceptance Criteria

**Phase A — Staging auto-deploy**

- [ ] `.github/workflows/deploy-mcp-staging.yml` created
- [ ] Triggered on push to `feature-mcp1` and `dev` (path-filtered to `mcp-server/**` so unrelated commits don't redeploy)
- [ ] Uses `cloudflare/wrangler-action@v3` (or current equivalent)
- [ ] Gates on (in order): `npm ci` in `mcp-server/`, `npx tsc --noEmit`, `npm run lint`, `npm run test:run`
- [ ] Cloudflare credentials sourced from GitHub Secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- [ ] Sentry source-map upload credentials sourced from GitHub Secrets (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`) and exposed as env to the wrangler step so [`scripts/deploy.mjs`](../../../mcp-server/scripts/deploy.mjs)'s `sentry-cli` source-map upload runs on every CI deploy — closes the `SENTRY_AUTH_TOKEN not set — skipping source-map upload` warning that operator-direct deploys produce today
- [ ] Post-deploy `/health` smoke probe; fails the workflow if `gitSha` doesn't match the commit SHA within 60s
- [ ] First successful run produces an audit entry in the GitHub Actions log
- [ ] Operator-direct path still works (`npx wrangler deploy --env staging` documented as the emergency path)

**Phase B — Production deploy on master**

- [ ] `.github/workflows/deploy-mcp-production.yml` created with same gates as Phase A (including the `SENTRY_AUTH_TOKEN` source-map upload step)
- [ ] Triggered on push to `master` only
- [ ] GitHub Environment `mcp-production` configured with required reviewers (≥1 approval before deploy proceeds)
- [ ] Same smoke-probe shape as Phase A; failure aborts the deploy and notifies (Slack webhook or GitHub Issue)
- [ ] Doesn't run for non-master branches even if pushed accidentally

**Phase C — Rollback automation**

- [ ] `.github/workflows/rollback-mcp.yml` with `workflow_dispatch` trigger only
- [ ] Inputs: `environment` (staging | production), `version-id` (Cloudflare deployment ID)
- [ ] Runs `npx wrangler rollback --env <env> <version-id>` and posts the result
- [ ] Production rollback requires approver gate; staging rollback does not
- [ ] DR runbook in DEPLOY.md updated with both the CI rollback path and the operator-direct path (for when GitHub is unavailable)

**Phase D — Secret sync (optional, deferred)**

- [ ] Secret manager chosen and documented in DEPLOY.md
- [ ] Workflow reads secrets and runs `wrangler secret put` idempotently
- [ ] Triggered manually or on rotation event
- [ ] Audit log in GitHub Actions shows which secrets were synced when (without revealing values)

**Verification & docs**

- [ ] [DEPLOY.md](../../../mcp-server/src/docs/operations/DEPLOY.md) updated with both deploy paths (CI-driven default + operator-direct fallback) and the rollback automation
- [ ] [DEVELOPER_TOOLING.md](DEVELOPER_TOOLING.md) updated to reference the deploy workflows alongside the existing test workflows (the "single source of truth" rule per CLAUDE.md § 11)
- [ ] At least one staging deploy and one production deploy run end-to-end through the CI path before the BL-032 soak's "operator-direct only" pattern is retired

#### Technical Context

**Why this isn't BL-032 scope**

- BL-032's design (Q11) explicitly chose static-bearer + operator-driven ops as the soak phase. The BL-032 architecture doc treats "soak first, harden later" as the position; CI-driven deploys are the "harden later" half. Adding them mid-soak interleaves architecture work with active testing — bad rhythm and high risk of breaking the iteration loop the soak depends on.
- The BL-032 closure stanza will note this initiative as the natural follow-up. After soak closes and the first BL-033 external-pilot conversation begins, the audit/reproducibility argument gains teeth.

**Why phased rather than all-at-once**

- Phase A unblocks the immediate "deploys aren't auditable" gap with the lowest engineering investment. Worth shipping standalone if Phase B turns out to need more cross-team coordination than expected.
- Phase B specifically requires BL-033's phase boundary because production-deploy gating only earns its keep once external consumers depend on uptime. Before BL-033, a production deploy is "internal change to the surface RP uses"; after BL-033, it's "change to a surface ExtCo's contract requires uptime on."
- Phase C (rollback automation) is independently valuable and can ship anytime after Phase A. Decoupled because the DR story under BL-032 already documents `wrangler rollback` as operator-direct; CI automation is additive, not blocking.
- Phase D (secret sync) is the most operator-experience-improving phase but the least critical to ship — single-operator scale doesn't strictly need it. Honest acknowledgment that this might never ship if BL-033 brings a different secret-management substrate.

**Why source-map upload is in scope here (not BL-032.75)**

- The source-map upload chain has three pieces: (1) `mcp-server/wrangler.toml` sets `upload_source_maps = true` so wrangler emits `.map` files into the deploy artifact; (2) [`scripts/deploy.mjs`](../../../mcp-server/scripts/deploy.mjs) runs `sentry-cli sourcemaps upload` after a successful `wrangler deploy`; (3) `SENTRY_AUTH_TOKEN` must be bound on the shell env for step 2 to succeed. Pieces 1 and 2 already ship; piece 3 is operator-laptop-only today.
- That's a _deploy-time_ gap, not an _observability_ gap — Sentry itself is configured correctly (DSN bound, alert rules tuned by BL-032.75), but stack traces resolve to `dist/index.js:1:482718` rather than `src/auth/bearer.ts:119` because the source-map upload never runs in CI. The right surface to fix this is BL-037's CI deploy workflow, where `SENTRY_AUTH_TOKEN` lives as a GitHub Secret alongside the Cloudflare credentials.
- BL-033 (external pilots) will surface real Sentry incidents; minified traces will be a real debugging tax then. Closing this in BL-037 Phase A means the first BL-033 production deploy has resolved-source traces from day one.

**Why not extend BL-032.75 instead**

- BL-032.75 is "production observability maturity" — Sentry alert-rule expansion, structured-log aggregation, latency dashboards. Different surface (observability) and different problem class (post-deploy state visibility, not deploy automation).
- BL-037's natural sibling is CI/CD pipeline maturity, which is its own domain. Cross-cutting it into BL-032.75 would obscure both initiatives.

**Why not BL-034 (MCP doc cleanup)**

- BL-034 is documentation-only; this entry has engineering work (workflow YAML, smoke-probe script, environment config). Different effort class and different verification shape.

**Phase dependencies (visual)**

```
BL-032 soak closes
  └── Phase A (staging auto-deploy) — anytime after BL-032 closes
        └── Phase C (rollback automation) — anytime after Phase A
        └── Phase B (production gating) — requires BL-033 ramp
              └── Phase D (secret sync) — optional; multi-operator or compliance trigger
```

---

### BL-038: MCP Server — Radar Rate-Limit Tier (5/min, 50/day)

**Source**: BL-038 — surfaced during BL-032 soak T.C.6 (2026-05-11). The documentation in [`mcp-server/src/ratelimit/limiter.ts:6`](../../../mcp-server/src/ratelimit/limiter.ts#L6) and [`RATE_LIMITS.md:162`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md#L162) claims a radar-specific rate-limit tier (5/min, 50/day) was to ship with Phase 4. Phase 4 (the radar tools themselves — `search_radar`, `get_latest_insights`) DID ship, but the third `Ratelimit` instance scoped to `mcp:ratelimit:radar:*` never made it into the code. T.C.6's counter inspection confirmed: zero radar-pattern keys in Upstash despite ~12 radar calls in the soak. | **Effort**: ~0.5 day engineering + tests | **Status**: ✅ **SHIPPED 2026-05-31** — `mcp-server@0.3.14` via PR <TBD>. First MCP-surface change to exercise the BL-037 Phase A `workflow_run` deploy chain end-to-end. | **Depends on**: nothing (can ship independently)

**As a** GST operator running the MCP server, **I want** radar-tool calls to be capped at 5/min and 50/day per key, separate from the 60/min and 1000/day general bucket, **so that** a buggy agent loop or low-privilege key with an abuse pattern can't burn through the per-minute general budget making radar calls and indirectly stress the shared Inoreader 200 req/day budget during cache-miss windows.

#### Planning Criteria

**Current state**

- Radar tools are protected today by: (a) per-key general limit (60/min, 1000/day), (b) 6h Upstash cache on radar payload — first call cold, rest within 6h cache-hit, (c) circuit breaker on Inoreader 429 (6h TTL).
- In practice, the cache absorbs most budget pressure: 60 `search_radar` calls/min from one key → ~6 Inoreader sub-calls (first call only, rest cache hits).
- Failure mode the radar tier is meant to protect against: an attacker (or buggy agent) with a valid `MCP_KEY` making radar calls during cache misses — e.g., immediately post-circuit-recovery, or right after a cache TTL roll. Without the radar tier, 60 cold radar calls/min are possible if cache is miss-aligned, which CAN exhaust Inoreader's 200/day budget in ~3.3 minutes.

**Use cases — implementation**

- Add two new `Ratelimit` instances to [`limiter.ts`](../../../mcp-server/src/ratelimit/limiter.ts): `perRadarMin` (5/60s) and `perRadarDay` (50/1d). Use `slidingWindow` algorithm matching the general buckets. Key prefixes: `mcp:ratelimit:radar:min` and `mcp:ratelimit:radar:day`.
- Modify the `Limiter` interface — `check()` takes a new `toolClass: 'general' | 'radar'` parameter. When `'radar'`, run all four buckets in parallel and return the first to deny.
- Worker's tool-dispatch layer pre-parses the MCP request body to determine tool class. **Correction (2026-05-31 truth-pass)**: the Worker does NOT currently extract the tool name — [`worker.ts:534-535`](../../../mcp-server/src/worker.ts#L534-L535) says _"Tool-name extraction at the Worker boundary requires `request.clone()` + JSON-RPC parse; deferred to BL-032.75 maturity work."_ BL-038 must bring that extraction forward (extract into a small `extractToolName()` helper with its own unit tests). This is meaningful scope the original stanza understated. Then add a `radarTools = new Set(['search_radar', 'get_latest_insights'])` lookup and pass `'radar'` when matched. See [MCP_SERVER_RATE_LIMIT_TIER_BL-038.md](MCP_SERVER_RATE_LIMIT_TIER_BL-038.md) for the implementation design.
- The 429 envelope's `reason` field gets a third value: `radar-rate-limit-per-minute` / `radar-rate-limit-per-day` (distinct from `bearer-rejected` and the existing rate-limit reasons). Agents can distinguish "I'm hitting the radar-specific limit, slow my radar polling" from "I'm hitting the general limit, slow everything."

**Outcomes**

- 5/min and 50/day caps enforced on radar tools per key, observable via `mcp:ratelimit:radar:*` Upstash keys
- General buckets remain unaffected for non-radar tools (no regression)
- 429 envelope correctly identifies which tier denied
- Test coverage: unit tests for `chooseBindingTier` extended to handle 4 buckets; integration test asserting `search_radar` 429s at request 6 while `list_portfolio_facets` continues to work

**Business value**

- **Defense-in-depth for Inoreader budget** — the cache + breaker pair protects against the common case; this tier protects against the cache-miss-aligned abuse pattern. Cheap insurance against an Inoreader account suspension that would affect both the MCP surface AND the public `/hub/radar` page.
- **Closes a documentation-ahead-of-code gap** — surfaces a "documented coverage that doesn't exist" pattern that BL-034's doc cleanup pass should systematically check for. Implementing this here is faster than rewriting the docs to admit the gap.
- **Cleanly composes with BL-032.75 observability work** — separate counter prefix means radar-tier usage will show in any future per-tier dashboard without code changes.

#### Acceptance Criteria

- [x] `perRadarMinute` (5/60s) and `perRadarDay` (50/1d) `Ratelimit` instances added to `createLimiter()` — see [`limiter.ts`](../../../mcp-server/src/ratelimit/limiter.ts) prefixes `mcp:ratelimit:radar:{min,day}`.
- [x] `Limiter.check()` accepts `toolClass: 'general' | 'radar'`; runs 4 buckets when `'radar'`, 2 when `'general'`.
- [x] Worker tool-dispatch pre-parses MCP request body to determine tool class via new [`extractToolName`](../../../mcp-server/src/dispatch/extract-tool-name.ts) + `toolClassFor` helpers; passes resolved class to `limiter.check()`.
- [x] 429 envelope distinguishes radar-tier denial from general-tier denial in a new top-level `reason` field via `reasonForTier()` (values: `radar-rate-limit-per-minute`, `radar-rate-limit-per-day`, `rate-limit-per-minute`, `rate-limit-per-day`).
- [x] Unit tests cover 4-bucket priority logic in `chooseBindingTier4` — 8 cases in [`tests/unit/ratelimit/limiter.test.ts`](../../../mcp-server/tests/unit/ratelimit/limiter.test.ts) (deny precedence, all-pass tie-break, latest-reset wins).
- [ ] **Deferred — integration test** asserts `search_radar` 429s at request 6 within 60s while `list_portfolio_facets` continues to accept calls. Substituted by a post-merge live probe against staging (existing integration test is gated on `UPSTASH_MCP_REST_URL` presence and CI doesn't bind it; a CI-skip-only test would be cargo-cult scaffolding). Probe steps live in [`MCP_SERVER_RATE_LIMIT_TIER_BL-038.md § Closure note`](MCP_SERVER_RATE_LIMIT_TIER_BL-038.md).
- [x] [`RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md) updated: tool-family table flipped to "✅ Active in BL-038 (2026-05-31)"; "Phase 4 — radar-tier activation" stanza rewritten in past tense; 429 envelope example carries the new `reason` field; Upstash command-budget math added (2-operator free-tier sizing + 3rd-operator upgrade trigger).
- [x] `limiter.ts` aspirational "Phase 4 adds" comment retired; replaced with description of the now-implemented 4-bucket behavior.

**Why not roll into BL-032.75 (production observability)**

- BL-032.75 is observability; this is enforcement. Different code paths, different review surface.

**Why not roll into BL-034 (doc cleanup)**

- BL-034 is doc-only. This has engineering work that's faster than rewriting docs to say "we don't have this."

---

### BL-039: MCP Server — Worker as Inoreader OAuth refresh-writer

**Source**: BL-039 — surfaced during BL-032 soak T.K.1.7 (2026-05-12). The `gst-mcp-staging:search_radar` call returned `{"error":"token-stale","status":401,"message":"Inoreader access token is stale. The website-side ISR will refresh on its next call; retry the Worker call after that."}` — meaning the MCP-only consumer is blocked until someone visits the website to trigger ISR's refresh write to Upstash. Direct user-facing complaint: _"The MCP shouldn't require manual website refresh to use the radar."_ | **Effort**: ~1-2 days engineering + tests + Inoreader OAuth flow review | **Status**: ✅ **DELIVERED 2026-05-13** (merged PR #134, commit `3c84ee8`; soak-verified end-to-end — see [`BL-032_5_TESTING_FINDINGS.md`](BL-032_5_TESTING_FINDINGS.md) § T.Y.4; closure stanza below). The BL-032.5 soak that surfaced this finding revealed the gap was not just UX but an autonomy-blocker for the Phase 4 hourly Cron: with Resources serving cache-or-nothing (no fall-through to Inoreader), the Cron is the ONLY thing keeping radar fresh, and the Cron couldn't refresh its own token without a human visit to `/hub/radar`. BL-039 closed that gap by adding a Worker → website refresh trigger (Option B in the design). | **Depends on**: BL-032.5 substrate (PASS — verified during soak) | **Superseded by**: BL-032.8 will replace the Worker→website round-trip with Worker-direct `/oauth2/token` calls + Upstash single-flight lock; this initiative remains historical context for the soak-week incident that drove the refactor.

**As an** MCP-only consumer of the GST radar (Claude Desktop, Claude Code, or any future remote MCP client), **I want** the Worker to handle Inoreader OAuth token refresh autonomously when access tokens expire, **so that** the radar tools remain usable without requiring a human to visit the website to trigger a refresh write.

#### Planning Criteria

**Current state (Path 2, BL-032)**

- Website is the **sole refresh-writer** for Inoreader OAuth — owns the token lifecycle via ISR. When ISR calls Inoreader and gets 401, the website's refresh path fires, writes the new access token to `inoreader:access-token` in the Upstash Inoreader DB.
- Worker is a **read-only consumer** — reads tokens from `inoreader:*` keys in the read-only Upstash DB binding. Doesn't refresh.
- When access token TTL expires AND nothing has visited the website's radar page recently, the Worker reads a stale token → Inoreader returns 401 → Worker surfaces the documented `token-stale` envelope.
- Recovery today: a human visits `/hub/radar`, which triggers ISR's refresh path, which writes a fresh token, which the Worker sees on next call.

**Partial mitigation already filed: BL-032.5 (Resources & Prompts)**

- Adds hourly Worker Cron pre-warm (~24 Inoreader calls/day from the 200/day budget). Reduces the failure window from "whenever-it-happens" to "every-hour-at-most."
- Does NOT eliminate the website refresh dependency — the Cron still triggers ISR's refresh path when it hits a stale token, just at predictable hourly cadence.

**Use cases — implementation**

Three architectural options, in order of preference:

- **Option B — Worker triggers website-side refresh on demand (RECOMMENDED)**:
  - Worker on `token-stale` Inoreader 401 makes ONE retry after calling a new `/api/inoreader/refresh` endpoint on the website.
  - The refresh endpoint is auth-gated (Worker-only — uses a shared secret or signed JWT).
  - Preserves the single-writer invariant from Q4 (no two systems racing to refresh).
  - Adds one HTTP hop on cold-token recovery; subsequent calls hit the warm cache.
  - Failure semantics: if the refresh endpoint also fails, return the original `token-stale` envelope to the agent (current behavior).

- **Option A — Shared refresh-token, Worker becomes secondary writer**:
  - Worker holds the same refresh-token as the website (shared Upstash key with read+write binding).
  - On `token-stale`, Worker performs OAuth refresh itself, writes back to `inoreader:access-token`.
  - Requires coordination to avoid two writers racing (Upstash atomic SETNX with TTL, or a leader-election lock with `mcp:lock:inoreader-refresh`).
  - More resilient but more complex; tightens the trust boundary.

- **Option C — Worker has independent Inoreader OAuth credentials**:
  - Separate Inoreader app registration, separate refresh-token.
  - Doubles the Inoreader refresh load (each system refreshes independently) but each is fully independent.
  - Requires re-registering an app with Inoreader and provisioning the Worker with its own credentials.

**Outcomes**

- MCP-only consumers (no website traffic) can use the radar tools indefinitely without manual intervention
- Token-stale failures become a rare transient (refresh-endpoint-failure during the retry window) rather than a routine blocker
- Telemetry distinguishes "Worker-initiated refresh succeeded" vs "website-initiated refresh succeeded" vs "refresh failed"
- BL-032.5's Cron pre-warm still acts as defense-in-depth — the two work together: Cron keeps tokens warm, on-demand refresh handles edge cases

**Business value**

- **Eliminates a real user-facing UX gap** — current state is "MCP works until token expires, then you have to visit a website to fix it." That's untenable for an MCP-first workflow (Claude Desktop, Claude Code, future remote clients).
- **Unblocks remote-client trust** — until this lands, any reliability guarantee for the MCP surface carries the asterisk "as long as someone is also hitting the website." That asterisk makes the MCP surface feel second-class.
- **Cleanly composes with BL-032.5 + BL-033** — Cron pre-warm reduces frequency, on-demand refresh handles edge cases, future OAuth work in BL-033 can build on either Option A or B.

#### Acceptance Criteria

- [x] Decision recorded on Option A / B / C with rationale (Option B chosen — preserves Q4 single-writer invariant)
- [x] If Option B: `/api/inoreader/refresh` endpoint on the website, auth-gated, triggers ISR's refresh path (shipped in commit `143cd05`)
- [x] Worker `authenticatedFetch` in [`inoreader-worker.ts`](../../../mcp-server/src/lib/inoreader-worker.ts) updated: on Inoreader 401, call the refresh endpoint, retry once, only then surface the original `token-stale` envelope (shipped in commit `143cd05`)
- [x] Sentry breadcrumb distinguishes Worker-initiated refresh from website-initiated refresh (`area:bl-039`, `source:worker` tags on the website-side captureMessage)
- [x] Test coverage: Worker integration test with a mocked stale-token scenario asserts the refresh endpoint is called and the retry succeeds (9 new BL-039 cases in `mcp-server/tests/unit/inoreader-worker.test.ts` + 10 cases in `tests/unit/inoreader-refresh-endpoint.test.ts`)
- [x] Documentation update in [DEPLOY.md § C.5](../../../mcp-server/src/docs/operations/DEPLOY.md) — manual `/hub/radar` recovery now only required when the refresh-TOKEN itself is dead; telemetry signals distinguish that from a recoverable access-token-expiry

**Status**: ✅ **DELIVERED 2026-05-13** — merged via PR #134 (commit `3c84ee8`); soak-verified end-to-end against real services (see [`BL-032_5_TESTING_FINDINGS.md`](BL-032_5_TESTING_FINDINGS.md) § T.Y.4); production-deployed Worker (version `143c2ab3`); production-deployed website (Vercel auto-deploy from master).

**Why not roll into BL-032.5 (Resources & Prompts / Cron pre-warm)**

- BL-032.5's Cron is a frequency-reduction approach; this is a failure-mode-elimination approach. Both are needed. Both delivered together in the same merge for clean closure of the T.Y.3 architectural-gap escalation.

**Why not roll into BL-033 (broader OAuth scope)**

- BL-033 is undefined scope; this is a discrete fix with a clean acceptance criteria. Worth shipping independently rather than waiting for the broader OAuth initiative.

---

### BL-040: MCP Server — Debounce parallel BL-039 refresh calls under fan-out

**Source**: BL-040 — surfaced during BL-039's T.Y.4 verification soak (2026-05-13). A single `search_radar` Tool call triggered **6 parallel POSTs** to `/api/inoreader/refresh` because `fetchAllStreams` fans out into 5 parallel Inoreader calls (1 tags-list + 4 folder streams), each independently hitting the bad token's 401 and each independently invoking `triggerWebsiteRefresh`. The endpoint is idempotent so this is correct behavior, but wasteful — every BL-039 self-heal under fan-out hammers the Inoreader refresh-token exchange N+1 times. | **Effort**: ~half-day engineering + tests | **Status**: ✅ **SUPERSEDED 2026-05-17 by BL-032.8** — the Upstash single-flight lock introduced in BL-032.8's `inoreader-oauth.ts` module solved the same problem structurally at a higher consistency level (cross-isolate, not per-isolate). The `triggerWebsiteRefresh` function this initiative would have optimized was deleted entirely in BL-032.8 Phase B. Entry retained for historical context. | **Depends on**: BL-039 (delivered) | **Superseded by**: BL-032.8

**As an** operator of the MCP Worker, **I want** parallel BL-039 refresh attempts coalesced into a single refresh + N retries, **so that** a fan-out workload (radar's parallel folder fetches; future parallel resource reads; concurrent client traffic) doesn't multiply load on the Inoreader refresh-token exchange and the website's `/api/inoreader/refresh` endpoint.

#### Planning Criteria

**Current state (BL-039, delivered 2026-05-13)**

- Each `authenticatedFetch` call independently runs the refresh-on-401 path
- A single `search_radar(tier='wire')` call triggers 5 parallel Inoreader calls → 5 parallel 401s → 5 parallel refresh POSTs (plus the FYI tier if both fetched, scaling to 6+)
- The refresh endpoint runs sequentially per request: each call exchanges the refresh-token → writes a new access token to Upstash → the LAST write wins (others are overwritten but their work was wasted)

**Why this matters**

- Inoreader's refresh-token endpoint isn't aggressively rate-limited but isn't free either; burning N exchanges where 1 would suffice eats budget that production-rare paths (future BL-033 OAuth flows, BL-038 strict tier enforcement) might depend on
- The website's `/api/inoreader/refresh` runs the full OAuth exchange every call — N×serverless invocations on Vercel that we pay for
- Sentry signal-to-noise: a single token-stale event currently logs 5+ "BL-039 refresh succeeded" breadcrumbs, making it harder to spot real anomalies
- Under genuine high-concurrency client traffic (post-BL-033), the fan-out multiplier becomes problematic

**Use cases — implementation options**

- **Option A (recommended) — Upstash distributed lock with debounce window**:
  - On 401, Worker attempts `SETNX mcp:lock:inoreader-refresh = <isolate-id>` with a short TTL (e.g., 10s)
  - If SETNX succeeds → this isolate runs the refresh; on completion, deletes the lock
  - If SETNX fails → another isolate is already refreshing; sleep ~200ms, re-resolve config from Upstash (the other refresh writes there), retry the original Inoreader call directly
  - Bounded wait: after 3 sleep+retry cycles, fall back to running the refresh independently (handles lock-holder crash without leaving callers stuck)
  - Pattern is well-trodden — same lock approach proposed for `mcp:lock:` keys in BACKLOG § BL-038 strict-tier enforcement

- **Option B — Worker-local memoization**:
  - Cache the in-flight `triggerWebsiteRefresh()` Promise in module scope
  - Concurrent calls within the SAME isolate share the same Promise
  - Doesn't help across isolates (a single Worker request can spawn parallel fetches in one isolate, but separate requests still each refresh independently)
  - Simpler but only handles part of the problem — kept here as a stepping stone if Option A's lock complexity is unwarranted

- **Option C — Refactor `fetchAllStreams` to share one resolved config**:
  - Resolve config ONCE before the fan-out, then have all 5 parallel calls use it
  - On 401 from ANY of them, trigger ONE refresh, then re-run all 5 with the new token
  - Loses parallelism benefits on the retry path
  - Most invasive refactor; least clear it's better than A

**Outcomes**

- A single token-stale event triggers exactly ONE refresh, regardless of how many parallel Inoreader calls hit the 401
- Sentry breadcrumbs: 1 "BL-039 refresh succeeded" per stale-token event, not 5-6
- Inoreader refresh-token exchange called once per stale event (vs N+1 today)
- Cleaner Worker logs; better signal-to-noise for future debugging

#### Acceptance Criteria

- [ ] Decision recorded on Option A / B / C with rationale
- [ ] Implementation lands behind a feature flag OR with regression tests that prove no regression under non-staled conditions
- [ ] New unit test: stale token + fan-out scenario (e.g., 5 parallel calls) results in exactly 1 refresh-endpoint POST
- [ ] Existing 19 BL-039 tests still pass
- [ ] Re-soak T.Y.4 (deliberately-stale token + cache flush + `search_radar`): observe exactly 1 POST in Vercel runtime logs, not 5-6

**Why now**

- Not blocking — BL-039 works correctly today, just inefficiently under fan-out
- Worth doing before BL-033 (broader OAuth / public MCP clients) lands, since that initiative will multiply the fan-out frequency
- Cheap to ship; the Upstash lock pattern is reusable for other coalescing needs

### BL-041: Upstash Database Security Hardening — Redis ACL + Account MFA

**Source**: Surfaced during BL-032.8 honest closure (2026-05-27) — the operator-side decom of the legacy `gst-radar-tokens` DB highlighted that the surviving `gst-mcp` Upstash database is still accessed via a single admin-scoped REST token (`UPSTASH_MCP_REST_TOKEN`) with full keyspace + dangerous-command access, and the Upstash account itself has no enforced MFA policy. | **Effort**: ~half-day engineering + operator runbook (actual: ~1.5 days across PR #186 + PR #187 + closeout, all in 2026-05-30 — empirical iteration against the live Upstash console added unforeseen scope) | **Status**: ✅ **SHIPPED 2026-05-30** — scoped REST token from `mcp-worker-rw` bound to both envs; default admin token retained as 1Password break-glass; verified end-to-end via `Test-UpstashAcl.ps1` (24/24 pass), `/health.aclSelfCheck.status: 'ok'` on both envs, and live `search_portfolio` tool dispatch on production. Implementation across PR #186 (engineering artifacts), PR #187 (verified-against-reality ACL string + script bugfixes), and the closeout work in PR #189 (env-scoped acl-selfcheck keys). | **Depends on**: nothing | **Blocks**: BL-033 unblocked (scoped credential model in place ahead of external pilot)

**As an** operator of the MCP Worker, **I want** the Upstash MCP database access scoped via per-purpose ACL users and the Upstash account protected with MFA, **so that** a leaked Worker secret can't issue dangerous commands (FLUSHDB, CONFIG, etc.) and an attacker phishing the operator's SSO provider can't take over the database fleet.

#### Planning Criteria

**Current state (post-BL-032.8)**

- Single Upstash REST token (`UPSTASH_MCP_REST_TOKEN`) bound to the Worker — admin-level, full keyspace, all commands
- No ACL users defined on `gst-mcp`; the default user is what the Worker presents
- Upstash account: operator signs in via SSO (GitHub/Google); MFA enforcement at the org level has not been validated end-to-end
- Health-probe key (`mcp:health:probe:*`), Inoreader token keys (`mcp:inoreader:*`), and any future namespaces all share the same blast radius

**Capabilities confirmed via Upstash docs (Context7)**

- Redis ACL is **available on all paid plans** for Upstash Redis (matches our `gst-mcp` tier)
- `ACL SETUSER <name> on >password ~<keypattern> &<channel> +@<category> -@dangerous` — standard Redis 7 ACL syntax works as-is
- `ACL RESTTOKEN <user> <password>` mints a REST token that inherits the ACL user's permissions (runnable from `redis-cli` or Upstash console CLI) — this is how we'd give the Worker a scoped token instead of the default admin token
- MFA: Upstash recommends enabling via the upstream auth provider (Google/GitHub/Amazon) and **forcing MFA for all team members**; treat the Upstash account itself as production infrastructure (separate email/password account for production is the documented best practice)
- Shared-responsibility model explicitly lists ACL configuration, credential management, and MFA enforcement as **customer responsibilities**

**Use cases — recommended scope**

1. **Per-purpose ACL users on `gst-mcp`**:
   - `mcp-worker-rw` — `+@read +@write +@string +@hash -@dangerous ~mcp:*` (the Worker's actual surface)
   - `mcp-readonly-ops` — `+@read -@dangerous ~mcp:*` (for ad-hoc operator inspection without exposing destructive commands)
   - Rotate the bound `UPSTASH_MCP_REST_TOKEN` to one minted from `mcp-worker-rw` via `ACL RESTTOKEN`
   - Retire the default admin token from the Worker binding (still available for break-glass via console)
2. **Account MFA**:
   - Audit current Upstash team membership; confirm every member's upstream SSO has MFA enforced
   - If the operator account currently uses GitHub SSO without org-enforced MFA, switch to a provider that enforces it OR add a TOTP layer
   - Document the verification step in DEPLOY.md so the next operator can re-confirm during onboarding/offboarding

**Outcomes**

- Worker-side compromise (leaked secret in build logs, malicious dependency, etc.) limited to read/write within `mcp:*` — no `FLUSHDB`, `CONFIG SET`, `SCRIPT`, `DEBUG`, etc.
- Operator inspection sessions use the scoped read-only token by default; admin token only for break-glass
- Upstream auth-provider compromise blocked by second factor; meets the customer half of Upstash's shared-responsibility model

#### Acceptance Criteria

- [x] ACL users `mcp-worker-rw` and `mcp-readonly-ops` created on `gst-mcp`; passwords stored in 1Password (operator vault). Final verified ACL strings (PR #187):
  - `mcp-worker-rw`: `on ~mcp:* ~"" +@read +@write +@scripting -@dangerous`
  - `mcp-readonly-ops`: `on ~mcp:* +@read -@dangerous`
- [x] `UPSTASH_MCP_REST_TOKEN` for both staging + production rotated to a token minted from `mcp-worker-rw` via `ACL RESTTOKEN`; default admin token kept in 1Password as break-glass per DEPLOY.md § A.3.5 Phase 4 rollback procedure (not revoked because revocation is unsafe — re-binding is the recovery path, not key revocation)
- [x] `/health` SET+DEL probe passes against the new scoped token — verified empirically on both envs 2026-05-30
- [x] Worker-side ACL self-check on full command surface (`SET`/`INCR`/`EXPIRE`/`ZADD`/`ZREMRANGEBYSCORE`/`EVAL`) — supersedes the original "FLUSHDB returns NOPERM" AC. Implemented in `mcp-server/src/observability/acl-selfcheck.ts` with results surfaced at `/health.aclSelfCheck`; both envs report `status: 'ok'` against the rotated token. The dangerous-command-deny half of the original AC validated via `Test-UpstashAcl.ps1` 24/24 pass (negative-surface tests assert NOPERM on FLUSHDB / FLUSHALL / CONFIG GET / KEYS \*)
- [x] **Upstash account MFA verified** — completed 2026-05-30 via Upstash's account-level **MFA Requirement** setting (account-wide forced 2FA on every login, independent of upstream SSO provider). Both halves of the Upstash console "Security Configuration Complete" panel checked: ✅ Setup Redis ACL + ✅ MFA Requirement. Documented in [`SECRETS_INVENTORY.md` § Upstash ACL users → MFA enforcement log](../../../src/docs/operations/SECRETS_INVENTORY.md). Paid-plan-only items (IP Allowlist, Encryption at Rest, SOC-2, Protect Credentials) explicitly out of scope; logged for future reference if BL-033's compliance review surfaces them
- [x] DEPLOY.md § A.3.5 "Upstash ACL hardening (BL-041)" covers ACL user purpose, category-rationale table (pinning the `+@read +@write +@scripting -@dangerous +~mcp:* +~""` rationale to prevent a future well-intentioned widen), step-by-step mint + rotation runbook, Phase 4 rollback semantics for non-atomic `wrangler secret put` / `wrangler deploy`, account-level MFA checklist
- [x] Operator runbook: how to rotate the scoped token (re-mint via `ACL RESTTOKEN` + `wrangler secret put`) — inline in DEPLOY.md § A.3.5 "Scoped-token rotation (annual or after suspected leak)"

#### What Shipped Beyond the Original AC List

- **Verification artifacts**: `mcp-server/scripts/Test-UpstashAcl.ps1` (positive + negative surface, 24-assertion probe) + `mcp-server/scripts/verify-ratelimit-acl.mjs` (Node sibling that imports the real `@upstash/ratelimit` SDK and round-trips a `slidingWindow().limit()` against the scoped token) — reusable for every future ACL rotation
- **Worker-side guardrail**: `acl-selfcheck.ts` — one-shot per deploy via SET-NX-EX gate; short-circuits at the first failing command with a per-command failure name; surfaces at `/health.aclSelfCheck`. PR #189 followup made the keys env-scoped (`<env>:<gitSha>`) to fix a shared-state false-green where staging's probe result was shadowing production's
- **Empirical Upstash deviations documented in DEPLOY.md § A.3.5** for future operators: (a) `>password` clause silently ignored — Upstash auto-generates the password; (b) `@scripting` rejected as "unknown category" when there's trailing whitespace at end of ACL string (parser is whitespace-sensitive at modifier boundaries); (c) `+script|load` subcommand syntax rejected ("'|' is not supported"); (d) `~""` empty-string sentinel required alongside `~mcp:*` because `@upstash/ratelimit` v2 sliding-window passes `dynamicLimitKey: ""` as a third EVAL key when dynamic limits are off
- **PR sequence**: [PR #186](https://github.com/Global-Strategic-Technologies/gst-website/pull/186) (engineering artifacts), [PR #187](https://github.com/Global-Strategic-Technologies/gst-website/pull/187) (verified-against-reality ACL string + script bugfixes), [PR #189](https://github.com/Global-Strategic-Technologies/gst-website/pull/189) (env-scoped acl-selfcheck + this AC closure)
- **BL-042 filed as a follow-up** (PR #188) — Inoreader OAuth resilience surfaced during Phase 3 production verification when `oauth-refresh-invalid-refresh-token` fired and required ~15min manual local-terminal recovery. Not a BL-041 regression; surfaced by BL-041's first live production probe.

**Why now**

- Not blocking — current single-token setup works and the Worker secret has never been exposed externally
- BL-033 (external pilot) broadens both the client surface and the number of people with operator access; landing this before BL-033 means the access-control story is settled before stakes rise
- Cheap to ship; the ACL pattern is reusable (same `ACL RESTTOKEN` flow will apply to future Upstash databases if we add them)

---

### BL-047: Inoreader OAuth Resilience — Reduce Manual Re-Link to a 1-Click Operator Flow

**Source**: Surfaced 2026-05-30 during BL-041 Phase 3 closeout — `oauth-refresh-invalid-refresh-token` Sentry issue surfaced via live `search_radar` probe against production. Recovery required `node scripts/inoreader-auth.mjs setup` + browser auth + `exchange CODE` + 4× `wrangler secret put` + 2× `npm run deploy:*` — ~15 minutes of operator time at a terminal. Token death will recur whenever Inoreader's refresh-token grace window lapses (revocation, long inactivity, server-side policy change). The current recovery surface is not acceptable for a service surface that BL-033 broadens to external clients. | **Effort**: ~2 days engineering for T1+T2 (the operator-facing slice); T3-T4 fold in as ~1 day of incremental work afterward | **Status**: ✅ **SHIPPED** — T0 + T1 (detection hardening + alert ruleset + synthetic) shipped 2026-05-30 via PR #191; T3 (rotation signal) + T4 (refresh-token health surface) shipped 2026-05-31 via PR #195; grace-window hedge (NEW track — empirically justified after Inoreader 60s grace window confirmed) shipped 2026-05-31 via PR #196; T2 (in-browser recovery `/admin/inoreader/reauth/{start,callback}`) shipped 2026-05-31 via PR <TBD>. BL-047 fully closed. | **Depends on**: nothing (independent hardening) | **Blocks**: BL-033 only loosely (acceptable to ship in parallel; not a hard gate)

**As an** operator of the MCP Worker, **I want** Inoreader refresh-token failures to be detected proactively, paged immediately, and recoverable in under 2 minutes from any browser, **so that** a refresh-token death doesn't manifest as a stale radar surface for users while I'm away from a terminal.

#### Planning Criteria

**What can NEVER be automated**: the initial OAuth authorization grant. OAuth's RFC 6749 design fundamentally requires a human to authorize the app via Inoreader's web UI — there's no API to bypass that consent step. Any first-time setup OR any re-authorization after refresh-token revocation will always involve a human consenting in a browser. The achievable goal is to make that human consent as fast and accessible as possible (mobile-friendly, no local tooling required).

**Current state — what we have** (BL-032.8 Phase B + BL-032.77 inheritance):

- Auto-refresh on Inoreader 401 via single-flight Upstash lock (handles transient access-token expiry within the refresh grace window)
- Structured `invalid-refresh-token` failure mode emitted to Sentry as `oauth-refresh-invalid-refresh-token` ([`inoreader-oauth.ts:285-296`](../../../mcp-server/src/lib/inoreader-oauth.ts#L285-L296))
- **Rotation detection ALREADY EXISTS** ([`inoreader-oauth.ts:332`](../../../mcp-server/src/lib/inoreader-oauth.ts#L332)) — the Worker compares response `refresh_token` against the request value and writes only on rotation. The gap is that this signal isn't EMITTED anywhere observable.
- Recovery script [`scripts/inoreader-auth.mjs`](../../../scripts/inoreader-auth.mjs) — local Node script with `setup` / `exchange` / `refresh` subcommands
- Recovery runbook documented in [`DEPLOY.md § C.5`](../../../mcp-server/src/docs/operations/DEPLOY.md)

**What's missing — four gaps** (revised from original five after impartial audit; T5 dropped):

1. **No proactive alerting** — Sentry issue fires but reaches the operator only if they're already looking. No Slack/email page; no PagerDuty rule.
2. **No emission of existing rotation signal** — the Worker already detects rotation at [`inoreader-oauth.ts:332`](../../../mcp-server/src/lib/inoreader-oauth.ts#L332) but doesn't surface it. We can't tell empirically whether we're in a rotation regime, which matters for sizing future hedging decisions.
3. **No automated re-auth bootstrap** — recovery is local-terminal-only. If the operator isn't at a desktop when the token dies, the system stays broken for hours.
4. **No early-warning telemetry surface** — refresh-token meta-state (last successful refresh, rotation timeline, failure counters) isn't readable from `/health` or anywhere else; we learn the token is dead _after_ it fails.

#### Four-Track Hardening Plan (revised post-audit)

**Pre-flight (T0) — Verify Inoreader OAuth contract via Context7** (1h, blocks T1/T2 scoping)

Before scoping the alert-rule semantics + the callback handler, confirm against current Inoreader docs (via Context7 + a manual `curl` test against a known-good refresh token):

- Exact response shape on `invalid_grant` — HTTP status code (400 vs 401), body JSON shape, exact `error` field value
- Whether every successful `/oauth2/token` response includes `refresh_token` (rotation regime) OR only when rotated (sparse regime). [`inoreader-oauth.ts:332`](../../../mcp-server/src/lib/inoreader-oauth.ts#L332) currently treats absence-of-`refresh_token` as "no rotation" — verify this is the documented semantic
- Documented refresh-token TTL / grace window — if Inoreader publishes one, that's a real signal for T4; if not, "age since last rotation" is the actual telemetry to surface

Output: a 1-page reference at `mcp-server/src/docs/operations/INOREADER_OAUTH_CONTRACT.md` that T1-T4 scope against.

**Track 1 — Sentry alert ruleset on the Worker's structured OAuth failures** (4h)

The Worker's existing structured failures already fire as Sentry events:

- `oauth-refresh-invalid-refresh-token` (the smoking gun)
- `oauth-refresh-token-missing` ([`inoreader-oauth.ts:198-202`](../../../mcp-server/src/lib/inoreader-oauth.ts#L198-L202))
- `oauth-refresh-upstash-write-failed` ([`inoreader-oauth.ts:336-343`](../../../mcp-server/src/lib/inoreader-oauth.ts#L336-L343))

Audit caught that T1 must alert on ALL three, not just `invalid_refresh_token` — each is a paging-worthy state. Configure as a Sentry Alert Rule SET:

- Each rule channels to Slack `#mcp-alerts` immediately
- Each carries a distinct payload + deep link to the relevant DEPLOY.md § C.5 sub-procedure
- Daily debounce per rule (page on first event per UTC-day)
- Pure Sentry-side config — no code change for the rules themselves
- **Monitor-the-monitor**: scheduled `captureMessageEnvelope` synthetic at `0 14 * * 1` UTC (weekly Monday 14:00) emits a test event tagged `tag.alert-rule-synthetic: 1`; operator confirms paging path on receipt. Documented in the AC.

**Track 2 — Worker-served re-auth endpoint** (~1.5 days, audit revised up from 1 day)

Replace the local `scripts/inoreader-auth.mjs` flow with a Worker-served re-auth surface. Three audit-derived design constraints:

- **Auth model**: gate via a new `MCP_ADMIN_KEY` env var (bound separately from team `MCP_KEY_*` keys). Match by key identity, NOT by scope — current `DEFAULT_SCOPES` ([`scopes.ts:49-55`](../../../mcp-server/src/auth/scopes.ts#L49-L55)) is uniform across all keys; per-key scope variation is a BL-033 unlock and BL-042 must not pre-empt it. The `MCP_ADMIN_KEY` binding is a single-key surface independent of the team key set.
- **CSRF defense**: HMAC alone is insufficient — an attacker who triggers `/start` themselves gets a valid HMAC and can lure the operator into completing it. Use **Upstash-stored opaque state** (key: `mcp:inoreader:reauth-state:<nonce>`, TTL 5min, value: SHA256(admin-key)). Callback handler requires the SAME bearer key as `/start` — bound to operator identity.
- **Race with cron refresh**: T2's callback writes via `writeRefreshToken/writeAccessToken` which DON'T acquire `REFRESH_LOCK_KEY` ([`inoreader-oauth.ts`](../../../mcp-server/src/lib/inoreader-oauth.ts)). Sequence: cron acquires lock, POSTs with OLD refresh token (~1s in flight), operator completes re-auth + writes NEW tokens, cron returns success and overwrites with stale rotated token from the OLD chain. **T2 callback MUST acquire `REFRESH_LOCK_KEY` before writing** — bounded ~5s lock TTL, same primitive as the existing single-flight.

Endpoints:

- `GET /admin/inoreader/reauth/start` (admin-key gated) — Worker mints opaque nonce, writes `mcp:inoreader:reauth-state:<nonce>` → SHA256(admin-key) with 5-min TTL, returns the Inoreader OAuth URL as a clickable link
- `GET /admin/inoreader/reauth/callback?code=...&state=...` — Worker (a) validates state (Upstash read, identity check), (b) acquires `REFRESH_LOCK_KEY`, (c) exchanges code via `POST /oauth2/token`, (d) writes new tokens, (e) releases lock, (f) returns a plaintext success page
- **Audit log**: every `/admin/*` hit emits a `safeLog` entry with `auth.keyOwner` (the stripped-suffix identifier, never the key itself) so after-the-fact incident review knows who triggered the re-auth
- **URL-param scrubbing**: extend [`safe-logger.ts`](../../../mcp-server/src/auth/safe-logger.ts) to strip `code`, `state`, `access_token`, `refresh_token` from any logged URL query string. The callback URL contains the auth code; without this, the code leaks to Sentry via the request breadcrumb

**Recovery flow becomes**: operator gets paged → clicks Slack link → authorizes in browser → done. Target ~2 min from mobile **under the precondition** that the operator already has the Inoreader app session + `MCP_ADMIN_KEY` in a mobile password manager. Validate this precondition in the AC test plan.

**Track 3 — Emit existing rotation signal** (2h, audit revised down from ½ day)

The Worker already detects rotation at [`inoreader-oauth.ts:332`](../../../mcp-server/src/lib/inoreader-oauth.ts#L332). The missing piece is just emitting the signal:

- Emit `inoreader.oauth.refresh-token.rotated` Sentry event when the rotation branch is taken at line 332
- Don't log tokens — just `safeLog` an `event: 'inoreader.oauth.rotation'` with `success: true` so it lands in Sentry-via-existing-pipeline
- Surface `inoreaderRotationsLast24h` count by reading a new Upstash counter `mcp:inoreader:rotations:<YYYY-MM-DD>` (1 INCR + 1 EXPIRE per rotation event; ~negligible substrate cost)
- No AE event type change needed for this phase — fold in if Phase 3 dashboards want it later

**Track 4 — `/health.inoreaderRefreshTokenHealth`** (1 day, audit revised up from ½ day)

Audit caught that the counters T4 surfaces don't exist yet — they require new INCR sites in `inoreader-oauth.ts`. Honest scope:

- New Upstash counters incremented at the existing refresh sites:
  - `mcp:inoreader:refresh-success:<YYYY-MM-DD>` (incremented on `RefreshResult.ok`)
  - `mcp:inoreader:refresh-failure:<reason>:<YYYY-MM-DD>` (one counter per reason: `invalid-refresh-token` / `token-missing` / `upstash-write-failed` / `inoreader-error`)
  - `mcp:inoreader:last-refresh-success-at` (timestamp; SET on each success)
  - `mcp:inoreader:last-rotation-at` (timestamp; SET on each T3 rotation event)
- New `/health` block read via MGET (single round-trip; mirrors `/health.inoreaderSpend` pattern):
  ```ts
  inoreaderRefreshTokenHealth: {
    lastSuccessfulRefreshAt: string | null,
    ageSinceLastSuccessfulRefreshSeconds: number | null,
    lastRotationAt: string | null,
    recentRefreshFailureCounts: { 'invalid-refresh-token': number, 'token-missing': number, 'upstash-write-failed': number, 'inoreader-error': number },
  }
  ```
- Integration test asserts the contract + the counter-increment paths

**T5 deleted** (was: secondary refresh-token slot). Audit caught that Inoreader's documented `invalid_grant` behaviour likely invalidates the whole refresh-token chain — retrying with the "previous" token is more likely to (a) hit `invalid_grant` again, (b) trigger fraud-detection on `client_id`, (c) muddy the Sentry signal. T2's in-browser flow IS the recovery, and is fast enough that a hedge isn't worth the risk. If T3 data later reveals a substantial rotation regime AND a real race we can't otherwise close, file a successor ticket then.

#### Acceptance Criteria

- [x] **T0** (2026-05-30): [`INOREADER_OAUTH_CONTRACT.md`](../../../mcp-server/src/docs/operations/INOREADER_OAUTH_CONTRACT.md) written; Context7-verified contract pinned with `invalid_grant` shape (401 + `{"error":"invalid_grant"}`), refresh-token rotation regime (open question — closes via T3 telemetry), TTL (undocumented upstream — surface "age since last successful refresh" instead via T4)

- [x] **T1 alert rules** (2026-05-30): four Sentry Issue Alerts configured by operator against `gst-mcp-server` project per [`SENTRY_ALERT_RULES.md`](../../../mcp-server/src/docs/operations/SENTRY_ALERT_RULES.md) § 3 — three OAuth failure rules (dual-trigger pattern: `A new issue is created` + `A resolved issue becomes unresolved`, Slack-routed to `#mcp-alerts`, 60min action frequency) and one synthetic rule (single trigger, 1d action frequency). Worker code emits the underlying tagged events from `inoreader-oauth.ts` (refresh failures) + `alert-rule-synthetic.ts` (heartbeat)
- [x] **T1 monitor-the-monitor — wiring** (2026-05-30): weekly synthetic dispatcher [`alert-rule-synthetic.ts`](../../../mcp-server/src/observability/alert-rule-synthetic.ts) wired to `0 14 * * 1` production cron; emits `event:alert-rule-synthetic` tagged Sentry event Mondays 14:00 UTC; weekly-checklist procedure documented in [`SENTRY_ALERT_RULES.md`](../../../mcp-server/src/docs/operations/SENTRY_ALERT_RULES.md) § 3
- [x] **T1 monitor-the-monitor — Sentry transport verified** (2026-05-30): force-fire via `wrangler dev --remote` succeeded; Worker dispatch log `{event:'alert-rule-synthetic.dispatch', success:true}` + Sentry Issue `event:alert-rule-synthetic` both observed end-to-end. First-firing date filled into [`SENTRY_ALERT_RULES.md`](../../../mcp-server/src/docs/operations/SENTRY_ALERT_RULES.md) § 4
- [x] **T1 monitor-the-monitor — paging-channel verification** (2026-05-30): Sentry email notification confirmed at operator's address ~1 min after the force-fire. Full path verified end-to-end: Worker dispatch → Sentry Issue → Sentry email. No real-cron wait needed; force-fire substituted cleanly
- [x] **T2 endpoints** (2026-05-31, PR <TBD>): `/admin/inoreader/reauth/{start,callback}` implemented + 45 unit tests (handler + auth + exchange + scrub). Departure from original `MCP_ADMIN_KEY` bearer-at-callback proposal: documented + accepted, since browser 302 redirects cannot attach bearer; cookie-based session at /start is the equivalent CSRF defense. /start serves an HTML login form (operator pastes admin key from password manager on mobile); POST validates key constant-time, sets `mcp_reauth_session` HttpOnly Secure SameSite=Lax cookie, mints state in Upstash with 5-min TTL, 302s to Inoreader
- [x] **T2 race-safety** (2026-05-31, PR <TBD>): callback acquires `REFRESH_LOCK_KEY` before writing tokens; lock released in `finally` block; unit test pins the acquire+release lifecycle
- [x] **T2 audit log** (2026-05-31, PR <TBD>): every `/admin/*` hit emits `safeLog` with `keyOwner: 'ADMIN'`. `safe-logger.ts` extended with `scrubUrlForLog` helper that strips `code`, `state`, `access_token`, `refresh_token` from logged URLs (5 unit tests pin the scrub contract)
- [x] **T2 redirect-URI provisioning** (2026-05-31, operator): `https://mcp.globalstrategic.tech/admin/inoreader/reauth/callback` registered against the production Inoreader app; `INOREADER_REDIRECT_URI` + `MCP_ADMIN_KEY` Worker secrets bound via `wrangler secret put --env production`; production redeployed
- [x] **T2 validation** (2026-05-31, operator): live mobile-browser recovery exercise completed end-to-end — all 8 runbook steps passed cleanly; `admin-reauth-callback-success` Sentry event observed; new chain minted, written to Upstash, and cron picked it up on next tick
- [x] **T2 docs** (2026-05-31, PR <TBD>): DEPLOY.md § C.5 rewritten with T2 in-browser flow as primary recovery path; local-Node `scripts/inoreader-auth.mjs` retained as fallback for first-time bootstrap + `MCP_ADMIN_KEY`-lost cases. SENTRY_ALERT_RULES.md § 1 expanded with the four new admin-reauth event tags. SECRETS_INVENTORY.md gains `INOREADER_REDIRECT_URI` + `MCP_ADMIN_KEY` rows
- [x] **T3** (2026-05-31, PR <TBD>): rotation signal emitted at the existing detection site (`inoreader-oauth.ts:332`); `mcp:inoreader:rotations:<YYYY-MM-DD>` counter incremented; `inoreaderRefreshTokenHealth.rotationsLast24h` + `lastRotationAt` surfaced in `/health` via single MGET. Sentry event `inoreader.oauth.refresh-token.rotated` (info-level) fires on every rotation; 30-day timeline answers the rotation-regime question in `INOREADER_OAUTH_CONTRACT.md` § 6.
- [x] **T4** (2026-05-31, PR <TBD>): `/health.inoreaderRefreshTokenHealth` block live with `lastSuccessfulRefreshAt`, `ageSinceLastSuccessfulRefreshSeconds`, `lastRotationAt`, `rotationsLast24h`, `refreshSuccessLast24h`, and `recentRefreshFailureCounts` per-reason. New `inoreader-refresh-health.ts` module records all five counter families at the OAuth refresh sites via `recordRefreshSuccess` / `recordRefreshFailure(reason)` / `recordRotation`; 17 module unit tests pin the recorder + reader + fail-open contract.
- [ ] **SECRETS_INVENTORY**: new "Inoreader Account of Record" section documenting which Inoreader account owns the registered GST app, who the operator-of-record is, the redirect URIs registered, and the team-change review cadence
- [ ] **Recovery drill cadence**: quarterly synthetic operator drill (invalidate a staging refresh token, exercise T1 alert → T2 in-browser recovery → verify timing under the SLA); documented in DEPLOY.md as a recurring operations checklist item

#### Telemetry to Validate

- 7-day window post-Track-1 ship: operator paged ≤ 1 min after `oauth-refresh-invalid-refresh-token` fires (test by intentionally invalidating a staging refresh token)
- 30-day window post-Track-2 ship: at least one real recovery completed via the in-browser flow in ≤ 2 minutes (or, if no real failure: synthetic exercise during a quarterly drill)
- 30-day window post-Track-3 ship: telemetry confirms or refutes the rotation hypothesis. If rotations DO happen, ship Track 5.

#### Why Now

- BL-041 Phase 3 today (2026-05-30) surfaced the gap operationally — first time the manual recovery was exercised end-to-end and it took ~15 min from a desktop
- BL-033 external pilot broadens the user surface — once non-operator clients are calling radar tools, the impact of a 15-min outage is no longer "just our session". Closing this hardening gap before BL-033 ships means external users never see a `token-stale` surface
- Tracks 1+2 are independently shippable in ~1.5 days; the rest can be sequenced opportunistically
- Cost: zero new infrastructure — Sentry alert rules + a Worker endpoint + Upstash counter reads. No third-party services, no new secret rotations

#### Risks + Trade-offs

- **Risk (resolved by T2 design)**: auth-code leak via Sentry breadcrumb on the callback URL. Mitigation: `safe-logger.ts` URL query-param scrubbing per the AC (`code` / `state` / `access_token` / `refresh_token` stripped from any logged URL).
- **Risk (resolved by T2 design)**: CSRF where an attacker triggers `/start` and lures the operator to complete it. Mitigation: opaque Upstash-stored state bound to operator-key identity at `/start`, identity-checked at `/callback`. HMAC-only state (the original proposal) is insufficient — see audit notes.
- **Risk (resolved by T2 design)**: callback race with in-flight cron refresh overwriting newly-minted tokens. Mitigation: callback acquires the existing `REFRESH_LOCK_KEY` before writing.
- **Trade-off**: in-browser flow requires the operator to be logged into the Inoreader account that owns the GST radar folders. If the operator changes (BL-033 expands operator pool), the Inoreader app must be accessible. Mitigation: SECRETS_INVENTORY "Inoreader Account of Record" section + team-change review cadence per the AC.
- **Residual risk**: T2 deploys a new `/admin/*` route. Compromising `MCP_ADMIN_KEY` permits an attacker to force-refresh the Inoreader binding (substituting their own access/refresh tokens via a controlled OAuth grant). Mitigation: `MCP_ADMIN_KEY` is treated as the highest-sensitivity Worker secret (1Password + rotation cadence documented in SECRETS_INVENTORY); the audit log surface (per AC) captures every use for after-the-fact review.

---

### BL-048: MCP Server — Wrangler Secret Sync (extracted from BL-037 Phase D)

**Source**: BL-048 — extracted from [BL-037 § Phase D — Wrangler secret sync](MCP_SERVER_CI_CD_DEPLOY_BL-037.md#phase-d--wrangler-secret-sync-1-day-optional-deferred). Originally scoped inside BL-037 as the fourth and lowest-priority phase ("optional, deferred"). 2026-05-31 audit recommended extraction so BL-037 can close after Phase C ships without carrying an indefinitely-deferred phase. | **Effort**: ~1 day implementation after a secret-manager substrate is chosen | **Status**: 🟦 **Open · DEPRIORITIZED — indefinitely deferred** until rotation friction or audit-trail need crosses a threshold | **Depends on**: BL-037 Phases A/B (shipped 2026-05-31) for the deploy substrate; selection of a secret-manager substrate (1Password Secrets Automation, Doppler, AWS Secrets Manager, HashiCorp Vault, or other)

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

- Substrate choice (1Password Connect / Doppler / AWS SM / Vault) — see [BL-037 § Phase D](MCP_SERVER_CI_CD_DEPLOY_BL-037.md#phase-d--wrangler-secret-sync-1-day-optional-deferred) for the original sketch including the `cloudflare/wrangler-action@v3` `secrets:` input contract.
- Trigger model (workflow_dispatch only vs repository_dispatch from secret-manager webhook on rotation).
- Filename: design doc proposes `secrets-sync-mcp.yml`.

#### Why "deprioritized + indefinite defer" and not "won't do"

Per CLAUDE.md § 4a "no deferred tech debt": deferral is acceptable when there is a written trigger condition for revisit and the deferred work is NOT verification of code currently in scope. Phase D meets both criteria — it's net-new automation with explicit trigger thresholds above, not unfinished verification. The deprioritization stays honest by naming the conditions under which it gets re-evaluated.

### BL-049: `gst_irl_ingestion` — Server-Side xlsx Canonicalization for Hash-Bind Authority

> **Design doc**: [MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md](MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md)

**Source**: BL-045 PR B v11 StoreForce live exercise (2026-06-03) — the hash-bind forcing function in `compose_dossier_envelope` (shipped under v0.12.0 / prompt `gst_irl_ingestion@0.4.0`) empirically validated the architectural pattern: when the model passes the verbatim IRL bytes as `filledIrl`, the verifier authoritatively confirms each citation's substring presence. **But the v11 trace also exposed an upstream workflow gap**: when partners attach an `.xlsx` IRL file in Claude Desktop rather than pasting markdown into the `filledIrl` prompt arg, the model must reconstruct the IRL body from spreadsheet cells — and BOTH the body AND the citations become model-generated. Hash-bind then validates internal consistency (the model's bytes hash to the model's hash) but cannot bind to the original spreadsheet as an authoritative source. The v11 dossier produced 30 false-positive `tier-mismatch:` entries on this exact mechanism even after the model executed a substring-validation loop, because the model regenerated the body and citations as two separate text streams with subtle encoding drift between them. | **Effort**: 2-4 hours (Path A — new MCP tool) OR 4-6 hours (Path B — extended prompt arg). | **Status**: 🟦 **Open · Priority: medium** — closes the architecture's last empirical gap for the most operator-natural workflow (xlsx file attachment). Senior-consultant 9×4 review (BL-045 PR B closure) can proceed at v0.12.0 because the v11 trace demonstrates the model self-correction loop works; this ticket eliminates the remaining false-positive class. | **Depends on**: BL-045 PR B merged at v0.12.0.

**As a** GST partner ingesting a populated IRL via Claude Desktop, **I want** to attach the `.xlsx` directly to the conversation instead of pre-converting to markdown **so that** the hash-bind forcing function in `compose_dossier_envelope` validates citations against an authoritative server-canonicalized IRL body — eliminating the v11-class false-positive `tier-mismatch` entries that occur when the model regenerates both the body and the citations independently.

#### Background — what hash-bind does and why xlsx breaks it

Under v0.12.0 the prompt body embeds `**Body-binding hash:** <16-hex>` computed from `sha256(args.filledIrl).slice(0, 16)`. The model copies the hash into `compose_dossier_envelope`'s `irlBodyHash` input. The tool re-computes `sha256(input.filledIrl).slice(0, 16)` and rejects on mismatch via `IrlBodyHashMismatchError`. This catches paraphrased IRL bodies because sha256 doesn't paraphrase.

**The xlsx-attachment workflow defeats this** because:

1. Partner invokes `/gst_irl_ingestion` with NO `filledIrl` arg, then attaches the xlsx in the conversation.
2. Prompt renders interactive body (no body-binding hash directive — there's no `filledIrl` to hash).
3. Model reads xlsx into context, runs the eight content tools (which don't need `filledIrl`), then must call `compose_dossier_envelope` which requires `irlBodyHash`.
4. Model reconstructs a markdown IRL body from xlsx cells + computes its own hash. Tool's hash check passes (model's bytes hash to model's hash) but the binding is to **the model's reconstruction**, not the original spreadsheet.
5. Citations the model emits are also reconstructed from the spreadsheet; subtle encoding drift between the body and citations (em-dash vs hyphen, smart quotes, NBSP) causes substring matching to fail even after normalization.

#### Two implementation paths (pick during scoping)

**Path A — New MCP tool `extract_irl_from_xlsx`**

- New pure tool taking `xlsxBase64: string` (or `resourceUri: string` pointing at a session-scoped cached file) → returns `{ filledIrlMarkdown: string, irlBodyHash: string, sectionsParsed: number, substantiveCellsCounted: number }`.
- Operator workflow: attach xlsx → invoke `/gst_irl_ingestion` interactive → ask model to call `extract_irl_from_xlsx` first → model re-invokes `/gst_irl_ingestion` with the returned `filledIrlMarkdown` as the `filledIrl` arg. From that point the existing hash-bind architecture fires correctly.
- Effort: ~2-4 hours (xlsx parsing via the existing `xlsx-js-style` dep already in `mcp-server/package.json`; canonical-form serializer per the IRL article shape; unit tests against the StoreForce + MedSig fixtures).
- Drawback: two-step model interaction (extract, then re-invoke) — adds one round-trip but keeps the prompt arg contract pure.

**Path B — Extended `gst_irl_ingestion` prompt arg `filledIrlXlsx?: string`**

- Extend `argsSchema` with an optional `filledIrlXlsx: z.string()` arg accepting base64 xlsx bytes.
- Prompt build seam: if `filledIrlXlsx` is supplied, server-side decodes + canonicalizes to markdown BEFORE computing the body-binding hash. The body-shown hash binds to the canonicalized markdown, which IS what gets passed downstream.
- Operator workflow: paste base64-encoded xlsx into the slash-menu arg field (or have a future Claude Desktop attachment-to-arg adapter handle the encoding).
- Effort: ~4-6 hours (arg schema extension; build-time xlsx decoding; cross-section interaction with existing args; body-hash test scenarios for the new arg).
- Drawback: base64 input via slash menu is awkward UX; really wants attachment → arg automation that doesn't exist yet (overlaps with BL-046).

#### Acceptance criteria

- A v12 (or higher) StoreForce live exercise against the same `PRAXIS-IRL-StoreForce_JLIVET.xlsx` produces a dossier with:
  - `provenanceVerification.verified + verifiedFuzzy >= 25` (out of ~30 IRL-cited claims)
  - `provenanceVerification.tierMismatches == 0` for properly-cited tier-1 claims
  - `(J)` gap list contains ≤ 2 auto-appended entries (real fabrications would still surface; encoding-drift false positives eliminated)
- The forcing function tests in `mcp-server/tests/unit/schemas/compose-dossier-envelope.test.ts` extend to cover the xlsx-canonicalized round-trip.
- BREAKING_CHANGES entry documents the version bump (likely `mcp-server` 0.12.x → 0.13.0 for Path A's new tool; → 0.12.1 for Path B's additive arg).

#### Why "medium priority" not "high"

The BL-045 PR B v11 trace empirically demonstrated that the **forcing-function architecture itself works** — the model used the (K) verdict surface as actionable feedback and executed a real self-correction loop (substring validation script, citation re-write, tier demotion). The remaining false-positive class is a **verifier-input-quality artifact**, not an architectural failure. A partner reading the v11 dossier sees explicit disclosure of the artifact (the model's own footnote on `(J)` entries 12-41 explains the mechanism). BL-049 closes the cosmetic gap by giving the hash-bind an authoritative source; it does not unblock anything currently load-bearing.

Senior-consultant 9×4 review against v0.12.0 + the v11 trace evidence proceeds without this ticket. BL-049 ships as a clean post-merge follow-up.

### BL-051: `gst_irl_ingestion` — Citation Iteration via `validate_irl_provenance` Before Envelope

**Source**: BL-049 v12 StoreForce live exercise (2026-06-04) — first end-to-end run on server v0.13.0 / prompt `gst_irl_ingestion@0.5.0` after BL-049 shipped. The forcing-function architecture worked (hash-bind passed, tier-discipline fired empirically — model self-corrected on tier-fabrication diagnostic instead of demote-to-dodge), but the **citation verification rate landed at 52% on the first envelope call** (8 verbatim + 5 fuzzy = 13 of 25 claims; 9 unverified split 7 tier-mismatches + 2 tier-fabrications). Acceptance criterion in the BL-049 design doc was ≥ 28/30 (93%). The gap is operator-workflow throughput-bound: the model's natural citation style summarizes multiple IRL bullets into one citation excerpt joined with semicolons, and the verifier (correctly) rejects those as non-substring. The model attempted to self-correct via repeated `compose_dossier_envelope` calls, but each iteration required re-dictating ~30KB of JSON input (`filledIrl` + 25-57 claims + 10+ gaps) which presents as minute-scale tool hangs at LLM throughput. The session ended with operator instructing "stop the loop and ship," producing a complete dossier but at 52% verification rate. | **Effort**: ~45 min (prompt body update + body-hash + manifest-hash rebaselines + one new test scenario) | **Status**: 🟦 **Open · Priority: medium-high** — directly addresses the empirically-observed throughput problem AND lifts verification rates without server-side changes. Strong candidate for the next BL-045 family iteration. | **Depends on**: BL-049 merged (v0.13.0).

**As a** GST partner running an IRL ingestion sweep, **I want** the model to iterate citation correctness against a fast tool (`validate_irl_provenance`) BEFORE calling the heavyweight `compose_dossier_envelope` rendering tool **so that** verification rates land in the 80-90% range on a SINGLE envelope call — eliminating the multi-iteration heavyweight-tool throughput problem AND lifting the per-claim audit signal partners see in the dossier.

#### What the prompt body should direct the model to do (the new discipline)

After running the eight content tools and gathering claims + citations, BEFORE calling `compose_dossier_envelope`:

1. Call `validate_irl_provenance` with `filledIrl` + the full citation array.
2. For every claim returned as `unverified` (or `verified-fuzzy` if you want a stricter discipline): re-cite using a verbatim substring of the IRL body. Use the body's exact wording — single bullet, single substring.
3. Re-call `validate_irl_provenance` to confirm.
4. ONLY when ≥ 90% of citations verify (verbatim or fuzzy), call `compose_dossier_envelope` with the clean set.

#### Why this works at the architecture level

- `validate_irl_provenance` is purpose-built for fast iteration — small input (no need to re-pass `gates`, `fillRatio`, etc.), small output (just per-citation verdicts). The model's tool-input dictation cost per iteration drops from ~30KB → ~5KB.
- The expensive rendering (meta fence + (J) + (K) markdown synthesis) happens ONCE on the clean citation set, instead of repeatedly on each iteration's dirty set.
- Per-claim feedback arrives faster, so the model's natural self-correction loop converges in 3-5 fast iterations instead of 1-2 minute-scale ones.

#### Acceptance criteria

- Prompt body bumps 0.5.0 → 0.6.0 with a new directive (ENVELOPE_PRECHECK_DIRECTIVE or similar) explicitly instructing the validate-then-envelope discipline.
- A v13+ StoreForce live exercise (or equivalent) lands `verified + verifiedFuzzy ≥ 22 of 25` (88%) on the FIRST `compose_dossier_envelope` call, with `selfCorrectionCalls: 0` in the BL-045-VERIFY block.
- `totalEnvelopeCalls: 1` in the verify block (the precheck loop is on `validate_irl_provenance`, not on the envelope).

#### Why not "high" priority

BL-049's architecture is empirically validated as load-bearing — the v12 dossier IS audit-grade, just with 9 transparently-flagged gaps instead of 2. The 52% verification rate is a workflow-quality issue, not an audit-coverage failure. A partner receiving the v12 dossier has complete provenance accountability, just denser flagging. BL-051 sharpens the workflow but doesn't unblock anything.

### BL-052: `gst_irl_ingestion` — BL-045-VERIFY Block Schema Clarity (Cumulative vs Final-Response Counts)

**Source**: BL-049 v12 StoreForce live exercise (2026-06-04) — the rendered BL-045-VERIFY block reported `selfCorrectionCalls: 0` and `totalEnvelopeCalls: 1`, but the operator-observed reality was 3+ envelope-call attempts across the session (the model iterated, hit perceived throughput hangs, the operator restarted Claude Desktop twice, and the model finally shipped on the third successful call). The block's count fields are honest only for the SHIPPING-RESPONSE envelope call, not for the cumulative workflow. The verification-protocol intent in BL-049 § Verification Protocol is cumulative ("selfCorrectionCalls > 0 means the workflow needed self-correction"); the prompt-body directive doesn't disambiguate clearly enough so the model rendered final-response counts. Secondary observation from the same trace: `conditionalTriggersFired: []` was reported empty even though the IRL Section 09 explicitly named EU AI Act applicability (and earlier in-progress envelope calls reported `EU_AI_ACT` correctly). Both are reporting-discipline issues, not architectural failures, but they erode the verify block's value as an audit artifact. | **Effort**: ~20 min (prompt body directive tightening + body-hash rebaseline) | **Status**: 🟦 **Open · Priority: low** — cosmetic, no architectural impact. Worth fixing because the verify block is the primary operator-grade audit surface and ambiguous semantics undermine its load-bearing role. | **Depends on**: BL-049 merged (v0.13.0).

**As a** GST operator auditing a workflow run via the BL-045-VERIFY block, **I want** the count fields and trigger arrays to reflect cumulative workflow state across the entire session **so that** the block is a complete record of what happened, not just what's in the final response — preserving its value as the load-bearing operator-grade audit surface BL-045-VERIFY was designed to be.

#### Fixes

1. **Directive disambiguation**: rewrite the BL_045_VERIFY_DIRECTIVE in `prompts/irl-ingestion.ts` to say explicitly: "`selfCorrectionCalls` = total `compose_dossier_envelope` calls during this entire workflow session AFTER the first one. If you made 3 envelope calls total to ship, this is 2. Track this from working memory across the session, not just the final response."

2. **Conditional-trigger preservation**: add to the directive: "`conditionalTriggersFired` must list every conditional trigger evaluated as firing during the workflow, even if a later workflow simplification dropped it from the meta-fence. The verify block is for AUDIT; the meta-fence is for DOSSIER RENDERING."

3. **Optional schema field**: consider adding `meaningfulRecallsHaveDifferentInputs: bool` to surface whether self-correction calls were progressive citation cleanups vs identical-input retries (the former is healthy workflow; the latter is operator/transport issue worth flagging).

#### Acceptance criteria

- Prompt body bumps 0.5.0 → 0.6.0 (composes cleanly with BL-051 if both ship together).
- A subsequent live run with deliberate iteration produces a verify block where `selfCorrectionCalls` matches the operator's observed iteration count, AND `conditionalTriggersFired` includes every trigger evaluated as firing at any point.

### BL-053: `compose_dossier_envelope` — Citation Array Form (Multi-Bullet Citation Support)

**Source**: BL-049 v12 StoreForce live exercise (2026-06-04) — the model's natural citation style for derived claims (TechPar verdicts, comparable engagements, Tech Debt syntheses) is to cite MULTIPLE supporting IRL bullets joined into a single citation excerpt with semicolons or "and". The verifier substring-matches against the canonical body, so a multi-bullet-summary citation NEVER substring-matches (it's a synthetic concatenation, not text that appears anywhere in the body). The model's only structurally-valid options are: (a) re-cite using ONE verbatim bullet substring (losing the multi-source attribution), (b) demote to tier-2 with `Section --` partner-supplied sentinel (loses the IRL grounding signal), or (c) accept the unverified flag (transparent but inflates the auto-gap count). All three lose information vs. the model's genuine intent of "this claim is supported by bullets X, Y, AND Z." The schema-level fix is to let `citation` be `string | string[]`; the verifier check passes if all elements of the array verify individually as substrings of the body. | **Effort**: ~2 hours (schema delta on `compose-dossier-envelope.ts` claimSchema; deriveTier wrapper; verifier loop; test cases for the array form; tools list update) | **Status**: 🟦 **Open · Priority: medium** — closes a real model-pattern mismatch identified empirically. The current single-citation surface forces the model to choose between three lossy fallbacks. Not blocking BL-049's audit-coverage win but a clean architectural improvement. | **Depends on**: BL-049 merged (v0.13.0); composes with BL-051 (the precheck-iteration workflow benefits from this schema flexibility).

**As a** Claude model emitting claims supported by multiple IRL bullets, **I want** to cite each supporting bullet individually in a citation array **so that** the verifier can verify each element separately AND the partner reading the dossier sees explicit per-bullet attribution — instead of being forced to (a) under-attribute (single bullet), (b) misrepresent provenance (partner-supplied sentinel), or (c) accept transparent-but-inflated unverified flags.

#### Schema delta

```ts
// mcp-server/src/schemas/compose-dossier-envelope.ts
const claimSchema = z.object({
  claim: z.string().min(1)...,
  citation: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(8)])
    .describe(
      'EITHER a single citation string (the current shape — "Section NN — <verbatim excerpt>") ' +
      'OR an array of citation strings (one per supporting IRL bullet). When an array, every ' +
      'element must independently verify as a substring of the IRL body for the claim to count ' +
      'as verified. Use the array form when a claim genuinely derives from multiple bullets ' +
      '(TechPar verdicts citing eng count + hosting + salary; comparables citing portfolio search; ' +
      'syntheses combining several Section 04 + Section 07 bullets).'
    ),
  tier: z.enum(tierValues)...,
});
```

#### Verifier delta

In `runIrlProvenanceCheck`, when an entry's citation is an array, run the per-string verification on each element and aggregate:

- All elements `verified` (verbatim substring) → status `verified` (full strength).
- All elements `verified` or `verified-fuzzy` → status `verified-fuzzy` (acceptable for derivation tier).
- Any element `unverified` AND no partner-supplied sentinel → status `unverified` (the claim is genuinely under-supported).
- The auto-append loop's tier-discipline check treats the aggregate verdict identically to the current per-string verdict.

#### Acceptance criteria

- Schema accepts both shapes; existing single-string call sites continue to work unchanged (additive change).
- A v13+ live run on a derivation-heavy IRL (e.g., StoreForce's TechPar/ICG/Tech Debt verdicts) sees verification rate lift to ≥ 85% as the model adopts the array form for multi-bullet claims.
- BREAKING_CHANGES entry documents the additive schema change (compose_dossier_envelope: citation now accepts string | string[]).

#### Why not "high" priority

BL-049 v12 dossier achieved audit-grade transparency at 52% verification — the partner sees every gap. BL-053 lifts the verification rate by closing the structural false-negative for multi-bullet citations, but the dossier was shippable without it. Ship BL-051 first (cheap workflow win); ship BL-053 if v13 live exercises continue showing multi-bullet patterns dominating the unverified bucket.

---

### BL-056: `gst_irl_ingestion` — `precheckIterations` Field in BL-045-VERIFY Block ✅ CLOSED 2026-06-04

**Filed + closed same day.** Observability follow-up to BL-051.

**Problem**: The v13 partner-paste live exercise (2026-06-04) shipped a clean dossier (21/21 verified citations, `selfCorrectionCalls: 0`), but the VERIFY block is consistent with both "BL-051 precheck converged after N iterations" AND "BL-051 precheck skipped entirely." Operators cannot distinguish post-BL-051-healthy from pre-BL-051-anti-pattern from the artifact alone — the missing diagnostic is the count of `validate_irl_provenance` calls before the first `compose_dossier_envelope`.

**Fix**: Add `precheckIterations: <int>` line to both BL-045-VERIFY block schemas (one-shot directive + interactive Step 5), with rule prose explaining the healthy band (1–3), `0` (BL-051 elision), `4` (the cap; precheck couldn't converge), and the cross-correlation with `selfCorrectionCalls`. Field is model-self-reported, same epistemic class as `meaningfulRecallsHaveDifferentInputs`.

**Surface change**: prompt v0.7.0 → v0.7.1; mcp-server v0.16.0 → v0.16.1; all 7 body hashes + manifest hash re-baselined.

**Test surface**: +1 unit test asserting `precheckIterations:` literal presence in both verify-block schemas.

**Acceptance**: the next live exercise's VERIFY block includes a populated `precheckIterations` line.

---

### BL-057: Regulatory Map — Coverage Gap Sweep (AI Governance + Chile Ley 21.719) ✅ CLOSED 2026-06-05

**Closure note**: Inventory-and-verify pass against the existing 120-framework map reduced the BL stanza's named gap list from 8 to **3 authored entries** (Colorado AI Act, NYC AEDT LL144, Illinois HB 3773, California SB 942 already present; Canada AIDA dropped after WebSearch verification confirmed Bill C-27 died on the Order Paper Jan 2025 with no re-tabling after the April 2025 snap election — authoring would have surfaced a phantom framework). Shipped at mcp-server 0.20.0:

- `gst://regulations/us/nist-ai-rmf` — NIST AI Risk Management Framework 1.0 (the de-facto US AI-gov baseline)
- `gst://regulations/gb/ai-framework` — UK Pro-Innovation Approach to AI Regulation (regulator-led, non-statutory; effective 2024-02-06)
- `gst://regulations/cl/ley21719` — Chile Law 21.719 on the Protection of Personal Data (GDPR-aligned replacement for the 1999 regime; effective 2026-12-01)

Taxonomy decision pre-resolved: `"ai-governance"` is already an enum value (19 prior entries); no new top-level theme needed. Manifest hash re-baselined.

**Priority**: Medium. Net-new content authoring; not blocking — partners working US/Canadian/Chilean targets today get transparent misses they can manually flag — but two distinct, well-diagnosed coverage clusters surfaced during the v13 partner-paste live exercise (2026-06-04) and an adjacent rigor pass.

#### Problem

The 120-framework regulatory map (`src/data/regulatory-map/`) has confirmed gaps in two clusters:

**Cluster A — AI Governance (Western canon)**: EU AI Act is in the map and fired correctly in the v13 exercise. NIST AI RMF (US federal, voluntary framework) and Canada AIDA (Bill C-27) returned no match — confirmed via tool query (2026-06-04). Operators doing AI-governance diligence on North American targets currently see only EU coverage, leaving NA-jurisdiction obligations transparently missed. The companion frameworks an operator would expect alongside EU AI Act:

- **NIST AI RMF 1.0** — US federal voluntary framework; the de-facto "what good looks like" reference for US AI deployers
- **Canada AIDA** (Artificial Intelligence and Data Act, Bill C-27) — Canadian federal AI law (passage status: track current parliamentary state at filing time)
- **Colorado AI Act** (SB 24-205, effective February 1, 2026) — first US state comprehensive AI law
- **NYC AEDT Local Law 144** — automated employment decision tools (already in effect)
- **Illinois HB 3773** — AI in employment (effective January 1, 2026)
- **California**: whichever of SB 1047 / AB 2013 / SB 942 are statutory at filing time
- **UK pro-innovation AI framework** — regulator-led (ICO, CMA, FCA, MHRA), non-statutory

**Cluster B — Chile Ley 21.719**: Chile's new comprehensive data protection law, effective December 1, 2026. Replaces the legacy 1999 regime; introduces GDPR-aligned data subject rights, ANPD oversight, breach notification, cross-border transfer rules, and enforcement penalties. Absent from the current map. Material for any Latin-America-exposed target.

#### Approach

1. **Taxonomy decision first**: does "AI Governance" warrant a new top-level theme in the regulatory-map facet schema, or do AI-gov entries ride under existing themes (Data Protection / Sectoral / Employment)? Recommend: new top-level "AI Governance" theme — the consultative pattern partners expect is "what AI laws apply to this target," not "what data-protection laws also have AI clauses." Decision affects facet enumeration in [list_regulation_facets](mcp-server/src/schemas/list-regulation-facets.ts) + filter UI on `/hub/tools/regulatory-map`.
2. **Authoring pass**: for each framework, produce a JSON entry matching the existing schema in `src/data/regulatory-map/*.json` — name, jurisdiction, scope summary, key obligations, effective date, citations, applicable industries, themes. Research must source from primary regulator publications, not summaries.
3. **MCP manifest hash + Resource URI**: every new regulation is a `gst://regulations/{slug}` URI in the manifest. Hash re-baselines on each addition. Plan a single PR that batches all entries to land one manifest bump, not 7.
4. **Test surface**: existing regulation-loader tests cover schema validity + URI uniqueness; add light-touch tests asserting each new slug is present + queryable via free-text search.

#### Acceptance criteria

- A partner running diligence on a US-headquartered AI-deploying target sees NIST AI RMF + at least one state-level AI law fire alongside EU AI Act (no transparent miss).
- A partner running diligence on a Chile-exposed target sees Ley 21.719 fire (currently zero coverage).
- `gst_regulatory_map`-style free-text queries for "NIST AI RMF", "AIDA", "Colorado AI Act", "Ley 21.719" all return the corresponding entries.
- Taxonomy decision documented in the PR description (either: new "AI Governance" theme added with facet enumeration + UI filter update, OR explicit rationale for riding under existing themes).

#### Out of scope

- **Sectoral AI rules** (HIPAA AI guidance, FDA AI/ML SaMD, EBA AI guidelines, etc.) — sectoral-AI coverage is a separate sweep; this BL focuses on the cross-sectoral canon.
- **Non-Western AI frameworks** (China Generative AI Measures, Singapore Model AI Governance Framework, Japan AI Bill, etc.) — file as a follow-up sweep if a live exercise surfaces an APAC-exposed target.
- **Latin-American data-protection coverage broadly** (Brazil LGPD is presumably already in the map; Argentina Ley 25.326 reform pending; Mexico LFPDPPP under reform) — Cluster B is scoped to the Chile gap surfaced in the rigor pass; broader LATAM is a future sweep.

#### Why "medium" not "high"

The current map covers 120 frameworks. The gap is real and well-diagnosed, but the failure mode is transparent (partner sees "no AI laws found for US target alongside EU AI Act" and knows to manually supplement) rather than silent miscoverage. Land it when the next live exercise on a NA-AI-exposed target makes it concrete, OR opportunistically when an operator has time for the research pass.

---

### BL-058: `gst_irl_ingestion` — Enriched BL-045-VERIFY Block (Five New Field Families) ✅ CLOSED 2026-06-04

**Filed + closed same day.** Forcing-function expansion driven by the 2026-06-04 retest diagnosis cycle.

**Problem**: the retest surfaced three pathologies the operator and I had to spelunk to diagnose — none visible from the VERIFY block alone:

1. Model passed literal `"PLACEHOLDER"` as `filledIrl` (Zod caught it with `min(200)`, but the block surfaced no signal that precheck attempted-and-failed).
2. `provenanceVerification: 37/37 verified` against a model-reconstructed body (no signal whether the body was partner-paste-verbatim or reconstruction).
3. `conditionalTriggersFired: []` for an EU-AI-Act-applicable target (no signal whether triggers were considered-and-suppressed vs never-considered).

The operator named this directly: "isn't that the entire point of the verify section?" Correct. The VERIFY block is the forcing-function audit artifact; if engineering has to ask follow-up questions, it's failing the operator.

**Fix**: expand the BL-045-VERIFY block schema with five new field families so every observed pathology surfaces from one paste:

- `filledIrl: { bytes, source, fingerprint: { headChars, tailChars } }` — operators cross-check submitted body against partner-sent source-of-truth.
- `precheck: { iterations, attemptsTotal, outcome, errorsEncountered }` — replaces BL-056's flat `precheckIterations`; distinguishes converged / hit-cap / never-attempted / abandoned-after-error.
- `toolCallCounts: { <tool>: { attempted, succeeded, rejected } }` — ground-truth cross-check on self-reported counters.
- `conditionalTriggers: { considered, fired, suppressedWithRationale }` — replaces flat `conditionalTriggersFired`; distinguishes considered-and-suppressed from never-considered.
- `response: { continuations, verifyBlockEmissionPoint }` — catches truncation pathologies that invalidate the artifact.

Plus `gatesElided` upgraded to `[{tool, rationale}]` structured form, and `runScenario` gains `xlsx-reconstruction` value.

**Surface change**: prompt v0.7.1 → v0.8.0; mcp-server v0.16.1 → v0.17.0; all 7 body hashes + manifest hash re-baselined; rule-discipline prose added/expanded in both verify-block sites.

**Acceptance**: the next live exercise's VERIFY block carries enough signal that engineering triage is one paste — zero follow-up Q&A. Operators verify by attempting to triage a known-failed run from the VERIFY block alone.

---

### BL-059: `gst_irl_ingestion` — Tool-Arg Coaching to Eliminate Schema-Retry Tax ✅ CLOSED 2026-06-04 (initial scope; acceptance over ≥3 live exercises pending)

**Priority**: High. The 2026-06-04 post-BL-058 retest surfaced this as the largest concrete inefficiency driver in the workflow — and likely the proximate cause of the auto-compaction event observed mid-run.

**Initial implementation shipped 2026-06-04**: Rule 0 (tier-discipline universal rule — `value: "unknown"` REQUIRES `tier: "3"` bidirectionally) added to Step 1b coaching after audit confirmed BL-059's coaching pairs cleanly with existing Zod enforcement at `diligence-audit.ts:410-417` (server-side schema is the safety net; coaching shortens discovery loop). One tier-3 worked-example row added to Step 1a per audit refinement. Forward-coverage paragraphs for `compute_techpar`, `assess_infrastructure_cost_governance`, `validate_irl_provenance`, and `compose_dossier_envelope` hash-bind workflow deferred to future iterations once retest data surfaces concrete failure shapes for those tools (audit verdict: prose coaching for unobserved retry patterns is speculative).

**Hard prerequisite — BL-060 (per audit revision 2026-06-04)**: BL-060 (top-level `toolErrors` block) MUST ship before BL-059 implementation begins. Without it, the investigation works from `attempted - succeeded > 0` count deltas with no failure-class labels — a guessing game that risks coaching the wrong thing. With BL-060, the engineer reads `errorClass` per failed attempt directly from the artifact. Originally drafted as "ship together if practical"; corrected after audit.

#### Problem

The retest's `toolCallCounts` block exposed a previously-invisible pattern: schema-strict tools needed 2–3 attempts each before succeeding. Five wasted tool calls per single dossier run, every wasted call burning roughly the same token budget as a success:

| Tool                        | Attempted | Succeeded | Wasted |
| --------------------------- | --------- | --------- | ------ |
| `compose_dossier_envelope`  | 2         | 1         | 1      |
| `generate_diligence_agenda` | 3         | 1         | 2      |
| `compute_techpar`           | 3         | 1         | 2      |

Idempotent search/list tools (`search_portfolio` 2/2, `search_regulations` 4/4, `list_*_facets` 1/1) succeed first try every time. The retry tax is concentrated on tools whose Zod schemas reject specific argument shapes. Audit confirmed the structural contrast empirically: `compose_dossier_envelope` carries ~15 top-level fields + 4 nested sub-schemas (`fillRatioSchema`, `claimSchema`, `gapEntrySchema`, `gateElidedSchema`) + 5 enum sets + a regex-validated `modelVersion` + the hash-bind `irlBodyHash` (16-hex prefix the model must transcribe) + the `citation` union accepting `string | string[]`. `generate_diligence_agenda` carries a 13-field `AuditedUserInputsSchema` with ~8 `'unknown'`-sentinel enums and "indirect inference forbidden" semantics. `compute_techpar` carries 14 fields + audit metadata + canonical-vs-native stage union. Contrast: `SearchPortfolioInputSchema` is 3 optional strings; `ListPortfolioFacetsInputSchema` is `z.object({})`. The diagnostic structural hypothesis is well-supported.

**Compaction risk**: Claude Desktop self-compacted during this run, the first time it has happened in the post-BL-049 cycle. The 5 wasted tool calls + their error responses + the model's recovery reasoning together consume substantial context. Eliminating the retry tax directly mitigates compaction risk.

#### Approach

1. **Land BL-060 first** (top-level `toolErrors` block in BL-045-VERIFY) so the next retest's artifact carries per-attempt `errorClass` + `recoveryAction` labels. No retest is run for BL-059 acceptance measurement before BL-060 is in.
2. **Reproduce or read** the BL-060-enriched VERIFY block from a fresh retest to identify the specific arg-shape mistakes per tool.
3. **For each tool with retry tax**, add a directive paragraph in the prompt body coaching the model on the correct arg shape upfront — concrete example with the right structure, the most common mistake to avoid, the enum values that are valid. Same pattern as the BL-051 precheck directive's `{filledIrl, citations}` field-name coaching that prevented the `claims` typo.
4. **`compose_dossier_envelope` arg-design review is IN SCOPE** (audit revision 2026-06-04). The hash-bind `irlBodyHash` field is uniquely retry-prone by design: the model must transcribe `sha256(filledIrl).slice(0,16)` from the prompt body AND pass a matching `filledIrl` — a structural retry path the field was built to catch, not a coaching gap. Revisit whether hash-bind ergonomics can be improved without losing the BL-049 forcing function (candidate: server returns hash on a dry-run probe, model copies it). The original "out of scope" framing of schema redesign violated CLAUDE.md §4a (No Deferred Tech Debt). Either land an arg-design improvement here OR file as an explicit sibling BL referenced from this stanza before BL-059 closes.

#### Acceptance criteria (audit revision 2026-06-04 — averages, not absolutes)

- Across ≥3 live exercises post-fix, **median retry rate ≤ 0.2 per tool** (i.e., ≤1 retry across 5 tool calls on average).
- **Zero retries on non-hash-bound tools** (`generate_diligence_agenda`, `compute_techpar`, `assess_infrastructure_cost_governance`, `validate_irl_provenance`) attributable to arg-shape rejection — categorized via BL-060's `errorClass: arg-shape-rejection`.
- **Any `compose_dossier_envelope` retry** must categorize via BL-060 as `errorClass: hash-bind-retry` (a legitimate structural retry path, not a coaching failure) — NOT as `arg-shape-retry`. If `arg-shape-retry` retries persist on `compose_dossier_envelope` after coaching lands, the BL is not yet closed.
- Compaction does not occur mid-run for a workflow that previously triggered it (same IRL re-tested post-fix, measured via BL-061's `compactionEvents` field).

#### Out of scope

- Reducing the tool-call surface (e.g., merging `list_facets` + `search_*` into one call). Tool-pipeline simplification is a different sweep.

#### Tools to cover (audit revision 2026-06-04 — forward-coverage additions)

Primary: `compose_dossier_envelope`, `generate_diligence_agenda`, `compute_techpar` (the three with observed retry tax).

Forward-coverage (cover even without observed retries — same structural risk profile):

- `assess_infrastructure_cost_governance` — shares the canonical-vs-native stage union pattern with TechPar; likely a future retry-tax candidate.
- `validate_irl_provenance` — shares the `citationFieldSchema` `string | string[]` union with `compose_dossier_envelope`; coaching for one should cover both.

#### Why "high" not "highest"

The dossier still ships correctly under retry tax — the workflow is self-healing. The cost is operator-visible (compaction risk, token budget, wall-clock time) but not partner-visible. Land it in the next session that touches the prompt; it doesn't block on anything except BL-060 (which is its hard prerequisite).

---

### BL-060: `gst_irl_ingestion` — Top-Level `toolErrors` Block in BL-045-VERIFY (Expand Beyond Precheck) ✅ CLOSED 2026-06-04

**Priority**: Medium. Direct follow-up to BL-058 and BL-059 — without it, BL-059's investigation cannot proceed efficiently.

#### Problem

BL-058's `precheck.errorsEncountered` field captures `{errorClass, recoveryAction}` for failed `validate_irl_provenance` attempts. Excellent for precheck-only diagnosis. But the post-BL-058 retest exposed retry tax on FIVE other tools (`compose_dossier_envelope`, `generate_diligence_agenda`, `compute_techpar`, etc. — see BL-059), and the VERIFY block surfaces only the count (`attempted: 3, succeeded: 1`) without the failure class. We can see WHERE the retry tax is but not WHY — making BL-059's investigation a guessing game until someone reproduces with full tool-trace logging.

#### Approach

Add a top-level block to the BL-045-VERIFY schema:

```yaml
toolErrors:
  - {
      tool: <toolName>,
      attemptNumber: N,
      errorClass: <short label>,
      recoveryAction: <what you did next>,
    }
  # One entry per failed tool attempt across the whole workflow session.
  # Empty list [] is honest when no tool errors occurred.
```

Replaces nothing (additive).

**Partition with `precheck.errorsEncountered` (audit revision 2026-06-04)**: original draft allowed overlap as "convenience." Audit corrected this — overlap creates a reconciliation burden when the two lists disagree, and forces the model to write the same fact twice. The corrected partition: `precheck.errorsEncountered` remains the BL-051 forcing-function canonical home for `validate_irl_provenance` failures during precheck (entries where `tool == validate_irl_provenance` AND `attemptNumber ≤ firstEnvelopeCall`); `toolErrors` carries every other failed tool attempt across the workflow session and EXCLUDES the precheck attempts. Rule prose in the implementation must make this exclusion explicit.

**Compaction-aware acceptance (audit revision 2026-06-04)**: post-compaction the model cannot enumerate pre-compaction errors reliably. When `response.compactionEvents > 0` (BL-061), the `toolErrors` list MAY be partial and MUST report `<partial-due-to-compaction>` as the literal first entry's `errorClass`. Without this fallback, acceptance criteria become brittle in exactly the case BL-060 is most needed for diagnosing.

**Ground-truth arithmetic anchor (audit revision 2026-06-04)**: rule prose must require `count(toolErrors where tool == X) == toolCallCounts.X.attempted - toolCallCounts.X.succeeded` for every tool. This is the engineer's truthfulness check against model self-report — a brittle-but-cheap arithmetic verification embedded in the artifact.

#### Acceptance criteria

- The next live exercise's VERIFY block contains a `toolErrors:` list with one entry per failed tool attempt **excluding precheck attempts** (those remain in `precheck.errorsEncountered`).
- For a run with the BL-059 retry-tax pattern (5 failed non-precheck attempts across 3 tools), the `toolErrors` list has 5 entries with specific `errorClass` values mappable to Zod schema rejections.
- **Arithmetic check**: `sum(count(toolErrors where tool == T)) == sum(toolCallCounts.T.attempted - toolCallCounts.T.succeeded)` across non-precheck tools.
- When `response.compactionEvents > 0`, the `toolErrors` list MAY be partial but MUST include a `<partial-due-to-compaction>` sentinel as the first entry.

#### Surface change

- Prompt v0.8.0 → v0.8.1; mcp-server v0.17.0 → v0.17.1; all 7 body hashes + manifest hash re-baselined; rule-discipline prose added for the new block in both verify-block sites. **Ship in one PR with BL-061 + BL-062** (all three are VERIFY-block schema edits sharing the rebaseline cycle) per audit-corrected grouping. BL-059 ships separately (directive-coaching fix, not a schema edit; warrants its own empirical retest).

#### Why "medium" not "high"

The pattern is observable today via `toolCallCounts` deltas (`attempted - succeeded > 0`). `toolErrors` makes diagnosis faster and removes the reproduce-with-logging step, but the data is already obtainable. Still: BL-060 is the hard prerequisite for BL-059 implementation, so this BL is on the critical path — schedule accordingly.

---

### BL-061: `gst_irl_ingestion` — `compactionEvents` Field in BL-045-VERIFY `response:` Block ✅ CLOSED 2026-06-04

**Priority**: Medium. Captures a new failure-mode signal the 2026-06-04 retest surfaced via operator observation, not the artifact.

#### Problem

The post-BL-058 retest triggered Claude Desktop auto-compaction mid-workflow — the first time in the post-BL-049 architecture cycle. Operator observed it directly; the VERIFY block carries no signal. `response.continuations: 0` is correct (the operator didn't issue a "continue" prompt) but masks the entirely separate phenomenon of self-compaction triggered by context pressure.

Without observability, we cannot:

- Track whether BL-059's directive coaching reduces compaction events (the headline acceptance signal for BL-059).
- Distinguish a healthy run from one where compaction silently degraded the dossier quality (compaction summarizes recent reasoning; downstream tool calls may operate on a lossy view).
- Audit whether specific IRL shapes (large attached xlsx, many tool outputs) trigger compaction more often than others.

#### Approach

Add to the `response:` block of the BL-045-VERIFY schema:

```yaml
response:
  continuations: <int>
  verifyBlockEmissionPoint: final-continuation | mid-stream
  compactionEvents: <int | null — count of host-triggered auto-compaction events the model can detect; null when the model genuinely cannot tell>
```

**Epistemic-honesty correction (audit revision 2026-06-04)**: original draft asserted "the model can detect the discontinuity from its conversation context" and described the field as "same epistemic class as `meaningfulRecallsHaveDifferentInputs`." Audit corrected this — post-compaction, the host re-prompts the model with a synthesized summary as if it were prior context; the model does NOT generally see a labeled seam. Detection is possible only via weak heuristics (sudden loss of token-level detail it "should" remember, host-injected compaction markers if any). Critically, the field is least reliable in exactly the case it matters most — the more substantial the compaction, the less the model can tell it happened. This is NOT the same epistemic class as `meaningfulRecallsHaveDifferentInputs` (which compares two tool-call inputs both visible in current context).

The corrected design adds `null` as a third state (alongside `0` healthy and `N > 0`), explicitly meaning "the model cannot determine whether compaction occurred." This distinguishes honest-zero from unknown-zero — the missing distinction that would otherwise mask BL-059 regression signal.

Rule prose adds: "If you cannot determine whether compaction occurred, report `null`, not `0`. `0` means you have positive reason to believe no compaction happened (the conversation context shows no detail loss, no host-injected summary markers). `null` means you can't tell — operator must rely on Claude Desktop UI for ground truth in that case."

#### Acceptance criteria (audit revision 2026-06-04 — operator ground-truth, not model-only)

- For the next ≥3 live exercises, the **operator records compaction occurrence via Claude Desktop UI observation** as ground truth.
- Paired data: for each run, record `{operatorObservedCompactionEvents: N, modelReportedCompactionEvents: M_or_null}` and compute the detection rate (`M / N` when both known).
- BL-061 is considered successful if **detection rate ≥ 0.5** across the ≥3 runs (i.e., the model detects at least half of operator-observed compaction events on average) AND **no run reports `0` when the operator observed compaction** (false-negatives are the failure mode to eliminate; under-reporting via `null` is acceptable).
- Post-BL-059 runs against the same IRL report `compactionEvents: 0` AND `operatorObservedCompactionEvents: 0` (workflow no longer triggers compaction).

#### Surface change

- Prompt v0.8.x; mcp-server v0.17.x; hashes re-baselined. **Ship in one PR with BL-060 + BL-062** (audit-corrected grouping — all three are VERIFY-block schema edits sharing the rebaseline cycle).

#### Why "medium" not "high"

Compaction is a downstream symptom of the retry tax in BL-059; fixing BL-059 should make compactionEvents stay at zero without needing the field. The field is observability-of-a-fixed-bug. But it's cheap to add (one line + one rule paragraph) and gives us the regression signal if compaction returns under a different cause — with the epistemic honesty correction above, the signal is "best-effort, may under-report" rather than a misleading false-zero.

---

### BL-062: `gst_irl_ingestion` — Disambiguate `conditionalTriggers.considered` (Default-Fired Frameworks vs Conditional-Evaluated) ✅ CLOSED 2026-06-04

**Priority**: Low. Surfaced by BL-058's enriched block — and the new visibility immediately raised a semantic ambiguity worth resolving before operators draw wrong conclusions from the data.

#### Problem

The 2026-06-04 retest reported `conditionalTriggers.considered: [EU_AI_ACT, NIS2]` — only two triggers evaluated for an IRL whose Section 09 explicitly names GDPR, UK GDPR, PIPEDA, POPIA, Australia Privacy Act, EU AI Act, and DPA cross-border transfers. A literal reading of the VERIFY block suggests the model failed to consider 5+ frameworks. **Audit confirmed (2026-06-04)** the model is being literal-correct against the prompt's own vocabulary: `mcp-server/src/prompts/irl-ingestion.ts` defines exactly two named conditional triggers via imported constants (`EU_AI_ACT_CONDITIONAL_TRIGGER`, `NIS2_CONDITIONAL_TRIGGER`), and gate-5's predicate enumerates a parallel path `Section 09 names ≥1 framework` as a distinct evidence source from "conditional triggers." So GDPR/PIPEDA/POPIA etc. are Section-09-enumerated frameworks, not conditional triggers — the model correctly excluded them from `considered`.

The audit also clarified what this BL is NOT doing: **the directive has no "default-fired" concept today**. This BL is INTRODUCING that vocabulary into the audit artifact, not surfacing hidden directive state. Workflow correctness holds (the dossier still fires `search_regulations` per gate-5 path 1 for every Section-09 framework); the BL closes a vocabulary collision between BL-058's broad-sounding `considered:` field name and the directive's narrow conditional-trigger taxonomy.

But the VERIFY block schema today doesn't distinguish these two semantic classes. An operator reading `considered: [EU_AI_ACT, NIS2]` for a multi-jurisdiction IRL would correctly suspect a coverage gap — and then waste cycles investigating a false positive.

#### Approach (audit revision 2026-06-04 — pick Option A explicitly)

**Resolution: Option A (additive new field)**. Add `defaultFiredFrameworks: [<name>]` to the `conditionalTriggers:` block. Frameworks the model fires based on Section 09 enumeration (not conditional evaluation) go here; `considered` stays as "conditional triggers evaluated."

```yaml
conditionalTriggers:
  considered: [<every conditional trigger you evaluated, fired or not>]
  fired: [<subset of considered that actually fired>]
  suppressedWithRationale: [<{trigger, whyNot}, ...>]
  defaultFiredFrameworks: [<framework name from Section 09 enumeration, ...>] # NEW (BL-062)
```

Option B (single field with tagged entries `{name, kind: default | conditional}`) was rejected: it retypes existing `considered:` entries from string to object — a breaking change for downstream YAML parsers that consume the BL-058 artifact (which shipped two days ago and may already have strict consumers). Option A is purely additive and preserves backward compatibility.

Rule prose updated to explicitly cover the distinction in both schemas + the matching auto-append-rationale logic in the BL-058 directive.

#### Acceptance criteria

- The next live exercise on a multi-framework Section-09 IRL reports both the default-fired set AND the conditional-evaluated set, distinguishable by an operator reading the block.

#### Surface change

- Prompt v0.8.x; mcp-server v0.17.x; hashes re-baselined. **Ship in one PR with BL-060 + BL-061** (audit-corrected grouping — all three are VERIFY-block schema edits sharing the rebaseline cycle).

#### Why "low" not "medium"

Operator-facing semantics issue, not a workflow correctness issue confirmed by audit. The dossier still cites the correct frameworks regardless of how the VERIFY block categorizes them. The risk is wasted operator triage cycles on false positives — real but bounded. Address in the next prompt-iteration session that has other reasons to bump prompt hash.

---

### BL-063: `compose_dossier_envelope` — Server-Side Enforcement for `defaultFiredFrameworks` (Partition + Scope + Hub-Backing) ✅ CLOSED 2026-06-04

**Priority**: Medium. Filed + audit-corrected + implemented 2026-06-04. Shipped server-side schema enforcement matching the BL-058 forcing-function pattern.

#### Problem

The 2026-06-04 post-BL-058/060/061/062 retest's VERIFY block reported:

```yaml
conditionalTriggers:
  fired: [EU_AI_ACT]
  defaultFiredFrameworks:
    [
      GDPR,
      UK GDPR,
      PIPEDA,
      Australia Privacy Act,
      POPIA,
      SOC 2,
      NIST AI Risk Management Framework,
      EU AI Act,
      Canada AIDA,
    ]
```

Three concrete violations:

1. **Partition violation**: EU AI Act appears in BOTH `fired:` AND `defaultFiredFrameworks`. BL-062's rule prose said "no framework appears in both" — the model violated the rule because BL-062 didn't specify what to do when a framework legitimately fires via BOTH paths.

2. **Framework-scope violation**: SOC 2 appears in `defaultFiredFrameworks`. SOC 2 is a security certification (attestation of compliance state), not a regulatory framework. The field's scope was undefined in BL-062.

3. **Unbacked entries (BL-057 surfacing operationally)**: NIST AI Risk Management Framework + Canada AIDA appear in `defaultFiredFrameworks` — but per BL-057, neither is in the Hub regulatory map. The model can't have backed these via `search_regulations` matches.

#### Audit-corrected approach (impartial code-reviewer agent, 2026-06-04)

Original draft proposed directive-prose-only fix (three rules added to BL-045-VERIFY block rule prose). Audit verdict: **WEAK**. Quote: "The 2026-06-04 retest produced an implicit-rule violation on all three axes despite the surrounding VERIFY block being lengthy and explicit. The base rate for 'model ignores prose rule N+1 in a 50-line directive' is high, and the failure cost is silent — operators read the YAML, the rules are not enforced, and the dossier ships with a fabricated framework list. This is structurally identical to the pre-BL-045 MTTR fabrication pattern the BL-058 design doc explicitly identified as needing schema enforcement, not prose."

Corrected approach: **server-side schema enforcement in `compose_dossier_envelope`**, matching the BL-058 forcing-function pattern.

1. **Add `defaultFiredFrameworks: z.array(z.string()).optional()`** to the input schema next to `conditionalTriggersFired`.

2. **Partition check (zero-cost, fully decidable)**: reject if `intersection(conditionalTriggersFired, defaultFiredFrameworks).length > 0` with `ruleId: BL-063-PARTITION-VIOLATION`.

3. **Scope check (string allowlist)**: reject submissions containing known certifications (SOC 2, ISO 27001, PCI-DSS, SOC 1, FedRAMP, HITRUST, etc.) with `ruleId: BL-063-CERTIFICATION-NOT-REGULATION`.

4. **Hub-backing (auto-degrade, not reject)**: for each entry without a Hub `search_regulations` match, auto-append to a returned `gapsToAppend: ["regulatory-coverage-gap: <name>"]` array that the model must merge into (J). This converts an undetected fabrication into a forcing-function audit artifact — the BL-058 pattern.

Keep the BL-062 directive prose as model-facing documentation of a rule that is now structurally enforced; do NOT ship directive-prose-only as the enforcement mechanism.

#### Surface change

- `compose_dossier_envelope` schema expansion: `defaultFiredFrameworks` added.
- `compose_dossier_envelope` handler: partition + scope + Hub-backing checks; BL-058-pattern auto-append.
- Prompt body: small revision to BL-062's rule prose to reference the now-structural enforcement (model knows the tool will reject/auto-append, not just operator).
- Hub map lookup integration in the tool handler (the `gst://regulations/*` URI set).
- Test surface: ~2 unit tests + 1 integration test covering the EU_AI_ACT-in-both case the 2026-06-04 retest produced.

#### Acceptance

- The next live exercise's submission of an overlapping framework set is REJECTED by `compose_dossier_envelope` with `BL-063-PARTITION-VIOLATION`.
- The next live exercise's submission of SOC 2 in `defaultFiredFrameworks` is REJECTED with `BL-063-CERTIFICATION-NOT-REGULATION`.
- Unbacked entries (NIST AI RMF, Canada AIDA — per BL-057) appear as `regulatory-coverage-gap:` in (J), NOT in `defaultFiredFrameworks` of the dossier's meta fence.

#### Why "medium" not "high"

The bug is operator-visible (block carries the fabricated list) but not partner-visible (the dossier's main body draws from `search_regulations` matches, so the partner sees only Hub-backed framework descriptions). Land in a session that has the bandwidth for tool-handler work and the Hub-map integration; not blocking BL-059 (which ships with the prose-only BL-062 rule unchanged).

---

### BL-064: `gst_irl_ingestion` — Batch-Call Discipline for `search_regulations` + `search_portfolio` ✅ CLOSED 2026-06-05

**Problem**: the 2026-06-05 live exercise's VERIFY block showed `search_regulations: 3/3` and `search_portfolio: 3/3` — sequential per-arg calls when batching would collapse each to a single call. `search_regulations`'s schema ALREADY supported array batching (via `StringOrStringArray` at `src/schemas/regulatory-map.ts:60-68`), but the prompt's Step 3 directive anti-batched by explicitly directing "call `search_regulations` ONCE PER FRAMEWORK." `search_portfolio` lacked array support entirely. `assess_infrastructure_cost_governance: 2/2` is the canonical empty-probe + seeded pattern per prompt line 750 — by design, out of scope. `generate_diligence_agenda: 3/1` retries had `recoveryAction` shapes matching BL-059 Rule 0's target class; the VERIFY block was from a pre-BL-059-deploy run (user confirmed), so no new coaching here.

**Fix**:

1. **`search_regulations`** — prompt-only rewrite. Step 3 (full body, ~line 697) + Step 2c (interactive body, ~line 927) rewritten to instruct ONE call with `jurisdiction: [...]` + `category: [...]` arrays; per-name `query` lookup remains per-name (substring scoring is structurally single-string).
2. **`search_portfolio`** — additive schema + handler + prompt + tests. `SearchPortfolioInputSchema.theme` and `engagement` widened to `StringOrStringArray` union with `['all']` default. Handler narrows inside `handleSearchPortfolioTool` via per-element loop + dedup by project id; `filterProjects` in `src/utils/filterLogic.ts` stays scalar so the website portfolio page + `src/utils/portfolio-url.ts` are untouched. Deeplink emits first element only (documented limitation; widening URL encoding out of scope). `.describe()` prose rewritten to document the union shape; BL-031.95 buy-side/sell-side mapping prose preserved (anti-batching directive at the end of `engagement.describe()` flipped to instruct batched single-call).
3. **Tests** — 6 new BL-064 unit tests covering single-string normalization, array passthrough, default `['all']` back-compat, union semantics + dedup, `['all']` short-circuit, multi-engagement batching, deeplink first-element-only emission.

**Surface impact**:

- `mcp-server` 0.21.0 → 0.22.0 (additive schema field, back-compat)
- `gst_irl_ingestion` prompt 0.11.0 → 0.12.0
- Manifest hash + 4 of 7 body hashes re-baselined (the 3 extract-only scenarios stay stable because their build path doesn't embed Step 2b/2c)

**Acceptance** (against the 2026-06-05 retest pattern): the next live exercise's `toolCallCounts` shows `search_regulations: { attempted: 1, succeeded: 1 }` and `search_portfolio: { attempted: 1, succeeded: 1 }` even when IRL Section 09 names 3+ jurisdictions and Section 01 spans 3+ themes.

---

### BL-074: Production-readiness gates for client-facing dossiers ✅ DOCS + GATES COMPLETE 2026-06-30 — runbook + client-ready gating criteria shipped; the remaining cross-industry exercises are manual QA only and deferred indefinitely (effectively closed for development purposes)

**Context**: BL-066 through BL-073 took `gst_irl_ingestion` from "promising but flaky" to "predictable and honest about its limits" for the GST partner team running dossiers internally. For dossiers leaving the partner's hands and going to a client unmediated (M&A target, PE client, regulator), three structural gaps remain that the recent PRs intentionally did NOT close:

1. **xlsx-reconstruction is documented but not prevented.** BL-072's `provenance-gap:` auto-append makes the `pass-internal` hash-bind tautology visible per-run, but the model still controls both sides of the hash bind in reconstruction mode. The 32/32 provenance verification in the 2026-06-06 opus-4-8 run means "every claim is anchored in the body the model sent the server" — NOT "every claim is anchored in the partner's authoritative source xlsx". For client-facing or regulatory deliverables, runs MUST be partner-paste mode.
2. **VERIFY-block self-report can drift.** Two confirmed instances of model self-narration disagreeing with server reality (sonnet-4-6 fabricated `prepare_irl_body: transport-timeout`; opus-4-8 omitted `prepare_irl_body` from `toolCallCounts` entirely). Operators triaging acceptance from the artifact alone are triaging on a partially-trusted source.
3. **Empirical coverage is narrow.** Every live exercise to date has been against the StoreForce IRL. Other industries (healthcare, fintech, manufacturing, deep-tech IP), other transaction types (sell-side, carve-out, venture-series), and other geographies (Asian buyers, EU regulated entities) haven't been exercised. Each is plausible to surface new calibration gaps.

**Scope** (checklist, not a code change — this is a coverage + workflow ticket):

- [x] **BL-070 SHIPPED 2026-06-06** at mcp-server 0.28.0 (PR1). `requireVerbatimBody` prompt-arg flag + `Bl070VerbatimBodyRequiredError` + early guard in `runComposeDossierEnvelope`. When set to `true`, the tool rejects any `irlSource !== 'partner-paste-verbatim'` with a structured error directing operators to paste IRL markdown directly. Makes the partner-paste discipline system-enforced rather than operator-remembered. **Bundled BL-073 acronym add-on** (NIST AI RMF + NIST RMF aliases on US-NIST-AI-RMF.json) closes the fourth observed false-negative class.
- [x] **BL-071 SHIPPED 2026-06-06** at mcp-server 0.29.0 (PR2). Server-sourced `serverToolCallCounts` emitted from `compose_dossier_envelope` via the new `ToolCallCounters` accumulator on `MetricsContext`. Prompt directive (v0.16.0) instructs the model to copy verbatim into the BL-045-VERIFY block + derive `precheck.iterations` / `attemptsTotal` / `errorsEncountered` count from the snapshot. Closes the BL-070 self-degradation gap arithmetically (rejection counts are now server-authoritative — a model that lies about forwarding `requireVerbatimBody: true` cannot fake the resulting rejection count).
- [x] **Operator runbook SHIPPED 2026-06-30** at [`src/docs/development/OPERATOR_RUNBOOK.md`](OPERATOR_RUNBOOK.md). Covers override-vs-re-run, signoff (named human reviewer recorded), draft-vs-client-ready tiers, the failure-recovery playbook (citation em-dash, map-absent alias request, partition violation, `Bl070`/`Bl076`/hash-mismatch), and when to enable `requireVerbatimBody`. The xlsx→markdown extract workflow lives in [IRL_PARTNER_PASTE_RUNBOOK.md](IRL_PARTNER_PASTE_RUNBOOK.md) (now linked from the operator runbook + the development docs index for discoverability).
- [ ] **3-5 representative IRL exercises** — ⏸️ **DEFERRED INDEFINITELY** (manual QA only; no code/doc deliverable). Run opportunistically against real engagements as diverse IRLs arrive. Shapes worth covering:
  - Healthcare (PHI-sensitive; HIPAA + state privacy laws)
  - Fintech (financial data; SOC 2 + PCI-DSS + sector regulators)
  - Manufacturing (operational/supply-chain; sector-specific NIST + safety regs)
  - Deep-tech / IP-heavy (patent + IP-due-diligence; export controls)
  - Cross-border M&A (EU + US dual regs; CFIUS / FDI screening)
  - At least one in `partner-paste-verbatim` mode to validate the authoritative provenance path
- [x] **Client-ready gating criteria SHIPPED 2026-06-30** — folded into [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md) § "Client-ready gating criteria" (rather than a separate `CLIENT_READINESS.md`). Gates:
  - `irlSource: partner-paste-verbatim` (NOT reconstruction)
  - `hashBindResult: pass-bound` (NOT pass-internal)
  - `provenanceVerification: total === verified` (no unverified claims)
  - `precheck.outcome: converged`
  - All `compose_dossier_envelope` and `generate_diligence_agenda` retry budgets at design floor (≤2/1)
  - Zero unresolved auto-appended `tier-fabrication:` entries
  - Operator signoff (named human reviewer recorded)

**Acceptance**: the engineering + documentation deliverables are complete — BL-070 (`requireVerbatimBody`), BL-071 (server-authoritative counts), the operator runbook, and the client-ready gating criteria. The only remaining checklist item — 3-5 cross-industry live exercises — is **manual QA with no further code/doc value**, deferred indefinitely and run opportunistically against real engagements. Treat BL-074 as effectively closed for development purposes; reopen only if an exercise surfaces a calibration gap (which would file as its own ticket).

**Out of scope**:

- A separate client-facing UI surface (Claude Desktop is the operator-facing surface; client deliverables are the rendered dossier markdown the operator delivers, e.g., as PDF or shared document).
- Multi-tenancy / per-client isolation (a single operator runs one engagement at a time today).
- Concurrent-user load testing (not a multi-user system today).

**Related**: BL-070 (requireVerbatimBody — directly unblocks gate 1), BL-071 (server-sourced toolCallCounts — directly unblocks gate 2), BL-049 (hash-bind authority — the underpinning), BL-072 (reconstruction-mode disclosure — current best-effort).

---

### BL-082: `booleanFromWire` for slash-command form interop ✅ CLOSED 2026-06-07 (shipped at mcp-server 0.30.4)

**Problem**: per the MCP wire protocol, prompt `arguments` are typed as `Record<string, string>` — every value the client sends is a string regardless of the conceptual type. Claude Desktop's slash-command form renders boolean fields as plain text inputs and ships `"true"` / `"TRUE"` / `"false"` rather than the JSON boolean. The `gst_irl_ingestion` prompt's `requireVerbatimBody: z.boolean().optional()` field rejected every string form with `expected boolean, received string`, blocking the operator's first BL-076 + extract-irl-markdown partner-paste exercise on 2026-06-07.

**Scope**: add a `booleanFromWire` Zod preprocess to [`mcp-server/src/prompts/wire-shape.ts`] following the design of the existing `arrayFromWire` / `numberFromWire` / `enumFromWire` adapters. Apply to `requireVerbatimBody` in `gst_irl_ingestion` argsSchema. Bundle the `forceTools` array field through `arrayFromWire` while there — same root-cause bug class, just hadn't been exercised empirically.

**Surface impact**: `mcp-server` 0.30.3 → 0.30.4 (patch). No public contract change (additive — typed booleans still parse identically). No prompt-body change, no schema change, no manifest hash drift.

**Acceptance** (in-session):

- 8 new `booleanFromWire` unit tests + 5 new BL-082 regression tests at the irl-ingestion argsSchema level covering the exact failing operator payload (`requireVerbatimBody: 'TRUE'`).
- 1489 mcp-server tests green; tsc clean.

**Operator unblock**: deploy 0.30.4 to staging; retry `/gst_irl_ingestion` with `requireVerbatimBody: TRUE`. The schema now accepts the string form the slash-command UI ships.

**Related**: BL-076 + BL-077c (the body-by-hash + namespace fix that made partner-paste reachable), PR #248 (extract-irl-markdown script + runbook that made partner-paste actionable), BL-079 (reserved — server-side body delivery via prompt-arg, the structural follow-on).

**Lesson for future prompt-arg additions**: the BL-031.75 / BL-045 prompt registration discipline did not mandate wire-shape coverage for non-string types. Any future `z.boolean()` / `z.number()` / `z.array(...)` / `z.enum(...)` arg added to a registered prompt without going through the matching `*FromWire` adapter is a latent slash-command-UI failure waiting to surface. Worth a lint rule or pre-commit hook in a future ticket (reserve as **BL-083**: add ESLint rule rejecting `z.boolean()` / `z.array(...)` / etc. directly inside a `GstPrompt.argsSchema` literal without a wire-shape adapter wrapper).

---

### BL-079: Server-side body delivery via prompt-arg + body-by-hash on `validate_irl_provenance` ✅ CLOSED — Part A shipped 2026-06-07 (0.30.5); Part B shipped 2026-06-07 (0.31.0)

**Design doc**: [MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md](MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md) — full architecture, schema diffs, capability-preservation matrix, audit-folded revisions, split-PR plan. Ready for operator approval to start Part A implementation.

**Empirical confirmation**: the 2026-06-07 night exercise on `gst-mcp-staging` (post-#249/#250 deploy with `requireVerbatimBody: true` partner-paste path enabled end-to-end) produced `filledIrl.bytes: 45220` from a ~50KB paste — **12% emission loss**. `hashBindResult: pass-internal` (degraded from target `pass-bound`). `provenanceVerification: { unverified: 5, tierMismatches: 1, tierFabrications: 3 }`. Hash comparison dispositive: prompt directive `cdecc612b6101f82` vs. `prepare_irl_body`-returned `dc115172758827f7` — identical model context, byte-divergent emission. The "partner-paste-via-prompt-arg sidesteps the emission ceiling" hypothesis is falsified. BL-079 is now production-readiness blocker for any IRL > ~10KB, not a latency optimization.

**Ship cadence** (per audit): split into two PRs with operator-verification checkpoint between them.

- **Part A** ✅ shipped 0.30.5 (2026-06-07): `validate_irl_provenance` schema expansion (`filledIrl` now optional, `irlBodyHash` added as 16-hex optional field, cross-field `.refine` rule) + handler re-hydration via `metrics.irlBodyCache.get(irlBodyHash)`. Engine signature split: public `ValidateIrlProvenanceInput` allows omitted `filledIrl`; new internal `RunIrlProvenanceCheckInput` keeps the engine pure. Backward-compat preserved — every legacy `{filledIrl, citations}` caller continues to work unchanged. 13 schema unit tests + 6 integration tests (prepare → validate body-by-hash chain, precheck-iteration cache reuse, cache-miss surfaces `Bl076BodyCacheMissError`, R-8 compose internal-call seam regression). Independently fixes the precheck-loop emission damage — under Part A alone, the operator manually orchestrates `prepare_irl_body` then `validate_irl_provenance({irlBodyHash, citations})` and the 5 unverified + 1 tier-mismatch + 3 tier-fabrications observed tonight stop being possible.
- **Part B** ✅ shipped 0.31.0 (2026-06-07): `_registry.ts` wrapper sync-awaits `handlePrepareIrlBodyTool` (Alt-D pattern) when `gst_irl_ingestion` is built with `filledIrl` arg — populates `IrlBodyCache` BEFORE returning rendered prompt body. Prompt directive surgery at all three sites (precheck, envelope-composition, interactive Step 4) instructs model to SKIP `prepare_irl_body` when `**Body-binding hash:**` directive present and report `irlSource: partner-paste-verbatim-prepop`. New `irlSource` enum value + BL-070 gate dual-accept + `serverCachedBodyBytes` field on compose output for VERIFY `filledIrl.bytes` semantic correctness. New typed metric event `bl079.cache.preload.failed` with `storeId` for cross-event correlation (R-10). 4 wrapper unit tests + 2 substring assertions + 1 BL-070 dual-accept regression. Manifest hash drift + ALL 7 body hash rebaselines (the new enum value appears in every mode's VERIFY-block enum list). 1518 mcp-server tests green. **Net effect on partner-paste workflow**: model emits the IRL body ZERO times (vs. 2+ pre-Part-A); `hashBindResult: pass-bound` is now deterministic rather than variance-dependent on the model's emission roundtripping cleanly.

**Problem**: post-BL-076 / BL-077c, the body-by-hash mechanism works end-to-end on small (5-10KB) bodies but fails on production-realistic ones. The 2026-06-07 staging exercise on a 77,743-byte body showed the model's tool-call args emission truncated at ~1,753 bytes (2.3%). `prepare_irl_body` cached a partial body; the model self-detected the hash mismatch and halted the run. Same emission ceiling affects `validate_irl_provenance` — its `filledIrl` arg requires the model to emit the full body for citation substring-matching.

`extract-irl-markdown.mjs` (PR #248) makes the partner-paste path **operationally** available — operator pastes the canonical markdown into the prompt arg instead of letting the model reconstruct from xlsx. But the BODY still has to flow through the model's output stream to reach `prepare_irl_body` and `validate_irl_provenance`. **Same emission ceiling, same truncation risk**.

The structural fix moves body delivery off the model's output path entirely on the partner-paste route:

1. **Server-side cache pre-population at prompt-render time** — when the operator supplies `filledIrl` as a prompt arg, the prompt-build function writes the body to the IRL body cache directly (using the canonical hash it already computes for the `**Body-binding hash:**` directive). Model never has to emit the body to `prepare_irl_body`.
2. **`validate_irl_provenance` accepts body-by-hash** — extend the schema with optional `irlBodyHashOnly: true` mode where `filledIrl` becomes optional and the server re-hydrates from cache for citation matching. Model passes only the hash for the precheck loop.

Combined effect on the partner-paste path: zero body emission across the entire workflow. The 100KB+ prompt-arg ceiling applies (much higher than the model's per-tool-call emission ceiling, which we've measured at <77KB).

**Scope** (per impartial audit 2026-06-07 — APPROVED WITH REVISIONS):

- **Prompt-render cache write**: in `mcp-server/src/prompts/_registry.ts` wrapper closure for `gst_irl_ingestion`, fire-and-forget `metrics.irlBodyCache.set(hash, args.filledIrl)` when `filledIrl` is supplied. **Keep `GstPrompt.build` synchronous** (audit M-1) — don't change the SDK contract; the cache write completes well before the model emits its first tool call. Failure path: `.catch(safeLog)` with a typed `bl079.cache.preload.failed` metric event so prod regression is observable (audit R-1).
- **Prompt directive surgery** (audit M-2): in `irl-ingestion.ts`, update the envelope-composition directive + interactive Step 4 to instruct: "**In one-shot mode** (you see a `**Body-binding hash:**` directive above), SKIP `prepare_irl_body` — the body is pre-cached server-side. Pass the directive's hash directly to `compose_dossier_envelope` and `validate_irl_provenance`. **In interactive / xlsx-reconstruction mode** (no directive), call `prepare_irl_body` as before." Adds the BL-079 model contract.
- **`validate_irl_provenance` schema expansion**: add optional `irlBodyHash?: string` field. When supplied without `filledIrl`, server fetches body from `metrics.irlBodyCache`. Schema preserves the existing path for stdio / non-cached callers.
- **VERIFY block taxonomy update** (audit M-3): add `runScenario: partner-paste-verbatim-prepop` to distinguish BL-079 path from legacy prepare-then-compose. Operators see which path was taken.
- **BL-071 narrative update**: under BL-079 partner-paste, `serverToolCallCounts.prepare_irl_body.attempted: 0` is now CORRECT (not a model violation). Update the prompt directive prose so operators don't mis-read it.
- **`Bl076BodyCacheMissError` text augmentation** (audit R-1): mention "if this prompt was invoked with `filledIrl` arg, the BL-079 pre-populate path may have failed — check `bl079.cache.preload.*` metrics."

**Surface impact** (estimated, pre-implementation):

- `mcp-server` 0.30.3 → 0.31.0 (minor — additive schema field on `validate_irl_provenance`; new prompt directive; new typed metric event).
- `gst_irl_ingestion` promptVersion 0.17.0 → 0.18.0 (directive change; conditional render based on `filledIrl` presence).
- Manifest hash rebaseline (prompt name@version tuple drift).
- ~3 of 7 body hashes rebaseline (verbose-mode bodies carrying the envelope-composition directive).
- BL-049 authority preserved at the same level (`pass-bound` for partner-paste, `pass-internal` for reconstruction).
- BL-070, BL-072, BL-076 mechanisms unchanged — BL-079 is an additive pre-population channel on top of BL-076's cache.

**Acceptance** (in-session):

- New unit tests at `tests/unit/prompts/irl-ingestion-bl079.test.ts`: cache write happens when `filledIrl` arg is supplied; doesn't happen otherwise; failure path emits typed metric without blocking prompt render.
- `validate_irl_provenance` schema tests: accepts `irlBodyHash` alone; rejects when both missing; rejects when both supplied with mismatched hash.
- New integration test at `tests/integration/bl-079-partner-paste-skip-prepare.test.ts`: prompt invocation with `filledIrl` → cache populated → model can call compose_dossier_envelope directly without prepare → workflow succeeds end-to-end.
- BL-070 `requireVerbatimBody` gate regression test: still fires correctly when `irlSource !== 'partner-paste-verbatim'` on the BL-079 path (audit verified gate is irlSource-only, unaffected by skip-prepare).
- Prompt-body substring assertions: both one-shot and interactive bodies contain `BL-079` directive text + skip-prepare guidance.
- Manifest + 3 body hashes rebaselined.

**Empirical confirmation gate** (audit R-1 follow-up): the next live exercise after PR #248 (extract-irl-markdown) ships will tell us which BL-079 priority bucket we're in:

- **Bucket A** — partner-paste alone clears the emission ceiling (`prepare_irl_body` + `validate_irl_provenance` succeed at 77KB+ when body comes from prompt arg, not model reconstruction). BL-079 becomes a **latency optimization** (still nice; ~30s × 2 tool emissions saved per run).
- **Bucket B** — `prepare_irl_body` and/or `validate_irl_provenance` still truncate even with prompt-arg supply. BL-079 becomes a **production blocker** for partner-paste workflows on real-size IRLs.

Hypothesis (medium confidence): Bucket B. The model has to emit the body regardless of where it sourced from; emission ceiling is per-tool-call output stream, not per-source. But PR #248's empirical evidence will settle it.

**Out of scope**:

- **`xlsx-reconstruction` path** — BL-079 doesn't help there (no prompt-arg `filledIrl` = no server-side bytes to pre-populate). Same model-emission truncation risk persists. Reserved as **BL-080: chunked body submission** (`prepare_irl_body_chunk` + `prepare_irl_body_finalize`) for that path. Independent of BL-079.
- **Removing BL-077a/b read-after-write probe** — separate ticket (reserved as **BL-081** post-stable trace window).
- **Removing `prepare_irl_body` as a registered tool** — keep it. Still needed for the xlsx-reconstruction path AND as a fallback path if the prompt-arg cache write fails silently for some reason.

**Effort estimate** (audit-revised): **2-3 days** end-to-end (1-day was optimistic). Breakdown: `_registry.ts` wrapper + tests 0.25d; prompt directive surgery + VERIFY taxonomy 0.5d; `validate_irl_provenance` schema expansion + tests 0.5d; ~3 hash rebaselines 0.25d; new integration tests + BL-070 regression coverage 0.75d; BREAKING_CHANGES + BL-079 design doc + BACKLOG 0.5d; staging E2E verification on the actual 77KB case 0.25d; Worker-specific bug buffer (à la BL-077a) 0.25-0.5d.

**Related**: BL-076 (the body-by-hash mechanism this extends), BL-077a/b/c (the diagnostic + namespace fix that proved the cache substrate works), PR #248 (extract-irl-markdown — makes partner-paste mechanically available; BL-079 makes it actually work for large bodies), BL-080 (reserved — chunked body for xlsx-reconstruction path), BL-081 (reserved — remove BL-077a/b read-after-write probe after stable trace window), **BL-086** (the simplification follow-on — keeps every substrate BL-076/BL-077/BL-079 shipped; strips the prose discipline that accumulated around them).

---

### BL-086: `gst_irl_ingestion` workflow simplification — Option D (L0+L1 → verify → L2 → STOP) ✅ L2 VERIFIED 2026-06-30 — L0+L1 shipped 2026-06-08 (PR 1, v0.31.2); L2 shipped 2026-06-30 (PR 2, prompt v0.19.0 / mcp-server 0.32.0). Post-merge staging exercise passed; L3–L5 remain deferred to BL-087.

**Design doc**: [MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086.md](MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086.md) — full leveled architecture (L0–L5), Option D implementation guide, capability-preservation matrix, opt-in restore args specification.

**L2 verification (2026-06-30, partner-paste staging exercise on prompt v0.20.0 / mcp-server 0.33.0)** — single clean end-to-end run:

- **Retry budget met**: `selfCorrectionCalls: 0`, exactly **1** arg-shape retry (`generate_diligence_agenda` attempt 1 → the tool's structured `Fix:` error coached `revenueRange=unknown` + `geographies` tier-2 → succeeded attempt 2). Within the doc's ≤~2/session gate. Confirms the L2 hypothesis: tool error messages carry first-call discipline once the worked examples are gone, at a bounded retry cost.
- **Provenance pristine**: `irlSource: partner-paste-verbatim-prepop`, `hashBindResult: pass-bound`, full 51,383-byte body via prepop (no truncation), `provenanceVerification: 29 total / 24 verified / 5 fuzzy / 0 unverified / 0 tierMismatches / 0 tierFabrications`.

**Key finding — the refusal trigger was NOT the worked examples.** A partner-paste run was _refused_ by v4.7+ on the L2 build (worked examples already gone). Root cause: the shared `authorialIntentLine` preamble ("…proceed without hedging about prompt provenance") read as a prompt-injection tell. Fixed by rewording it (PR #276, mcp-server 0.33.0 / prompt v0.20.0) — the re-run above then completed cleanly. The BL-079 prepop + VERIFY-block scaffolding did **not** trigger any refusal once the preamble was fixed, so the previously-considered "pull L4 forward + rework prepop provenance surfacing" work is **not needed for the refusal** and stays deferred to **BL-087**. Vindicates the doc's "stop at L2" call.

> **Note (telemetry)**: in the VERIFY block, `compose_dossier_envelope` self-reports `{ attempted: 1, succeeded: 0 }`. This is intended BL-071 "in-flight self-report" semantics (the counter snapshots while the envelope call is still executing), documented at `compose-dossier-envelope.ts` and pinned by `tests/integration/bl-071-precheck-derivation.test.ts` + `bl-076-body-by-hash.test.ts`. Not a defect.

**Empirical motivation**: the 2026-06-07 evening exercise sequence produced a dual signal — interactive mode runs clean (33/33 verified, single envelope call, all counters balanced) AND partner-paste mode on v4.7+ refused execution citing jailbreak-pattern similarity. The workflow produces value when followed; the ~30KB prompt body accreted across BL-045 → BL-079 (≈20 PRs) now triggers safety patterns. Locally-justified PR-by-PR; globally producing model refusals.

**Design evolution**: initial moderate draft → impartial audit pushed for Path A (aggressive single PR) → operator feedback: stage the cuts as independently-shippable levels (L0–L5) with opt-in restore args → final operator-pragmatic-analysis pass: stop at L2 with hard verification gates, defer L3-L5 to BL-087.

**The key insight that drives Option D**: the substrate is the discipline; the prose was the explanation. Every prior error this prompt body accreted around (BL-045/049/051/058/063/070/071/072/076/079/082) was actually fixed at the server-side substrate (server-enforced gates, server-computed values, server auto-appends). The **prose** documented the rules so the model would internalize them; it never was the enforcement mechanism. **Cutting prompt prose cannot regress to previously-fixed errors** — the substrate still catches them. The prose's actual value was first-call hit rates (worked examples reduced arg-shape-rejections; precheck loop pre-cleaned citations before compose). Both are latency optimizations, not correctness mechanisms.

This asymmetry means L0+L1 are free (cosmetic + cleaner instructions, zero behavioral change), L2 is the only level with real bounded risk (1-2 extra retries per session, restorable via prompt-arg), and L3-L5 are operator-ergonomic choices that don't need pre-commitment.

**Pruning levels** (L0–L5, ordered least-to-most aggressive):

- ✅ **L0** — Runtime-vocabulary cleanup (shipped 2026-06-08 in PR 1, v0.31.1). Strip `BL-*` references / version pins / PR-history mentions from every `.describe()` call, error message, `TOOL_DESCRIPTION`. Zero behavioral change. Patch bump.
- ✅ **L1** — Mode-conditional prose removal (shipped 2026-06-08 in PR 1, v0.31.2). Each builder emits ONE coherent path; no "if you see X... otherwise..." prose. Clearer model instructions. Patch bump.
- ✅ **L2** — Worked-example deletion (Step 1a / Step 4a / Step 6a JSON megapayloads, shipped 2026-06-30 in PR 2, prompt v0.19.0 / mcp-server 0.32.0). Discipline shifts to the calibration prose (kept) + each tool's structured rejection diagnostic (verified actionable: `ruleId` + `Fix:`). **Opt-in restore**: `embedToolWorkedExamples: true` arg. Minor bump. Behavioral delta: ~1–2 extra arg-shape retries/session; output unchanged.
- **L3** — Precheck-loop demotion. **DEFERRED to BL-087.** Opt-in restore arg `precheckCitations: true` is spec'd in the doc for whenever L3 ships.
- **L4** — VERIFY block emission removal + `hashBindResult` field deletion. **DEFERRED to BL-087.** Opt-in restore arg `emitVerifyBlock: true` is spec'd in the doc for whenever L4 ships.
- **L5** — `validate_irl_provenance` tool unregistration. **DEFERRED to BL-087.** Engine + handler stay; only the MCP tool registration goes.

**Option D — the recommended implementation guide**:

1. **PR 1 — L0 + L1 bundle** (~1 day, ~zero risk). Pure cleanup. Same tool calls, same outputs, same dossier shape. Hash rebaselines + a couple of test substring updates is the entire blast radius. Likely materially reduces v4.7+ refusal rate (conditional-mode prose is the clearest jailbreak-pattern surface).
2. **Verification gate**: 1-2 staging exercises post-merge. Confirm dossier unchanged + v4.7+ no longer refuses.
3. **PR 2 — L2 alone, `embedToolWorkedExamples` restore arg shipped in the same PR** (~0.5 day, bounded risk). Cut Step 1 / 4a / 6a worked-example megapayloads (~210 lines). Replace with one-paragraph workflow descriptions. Reversal is a prompt-form checkbox.
4. **Verification gate**: 2-3 staging exercises. Track retry rates. If retry rate stays under ~2 per session, commit. If spike, flip the restore arg and revisit.
5. **STOP**. Defer L3-L5 to BL-087 pending real empirical evidence on: is (J) growth acceptable? Does anyone consume the VERIFY block externally? Does anyone manually call `validate_irl_provenance`?

**Why stop at L2**: L3 changes (J) gap-list semantics (more honest, but operator-readability shifts); L4 removes an audit surface whose external consumers can't be proven absent (asymmetric risk); L5 is the only non-arg-reversible cut. All three benefit from empirical evidence rather than pre-commitment.

**Cumulative effect of BL-086 Option D**: `irl-ingestion.ts` shrinks ~1,080 → ~790 lines (~27% reduction). Total ~1.5d active engineering. ~50% body shrinkage target deferred — partially shipped (PR 1+2), remainder reserved to BL-087.

**Capability preservation matrix** (full version in doc): every server substrate and every server-enforced gate (BL-049 hash-bind, BL-063 partition + scope + Hub-backing, BL-070 verbatim-body, BL-071 counters, BL-072 reconstruction auto-append, BL-073 aliases, BL-076 body-by-hash, BL-077a/b/c diagnostics, BL-079 Part A engine + Part B prepop, BL-082 wire-shape adapters) stays. L0+L1 has zero behavioral change. L2's worked-example cut is restorable via prompt-arg.

**Status**: ⏳ Option D implementation guide locked 2026-06-07. Ready to start at PR 1 (L0+L1) when implementation begins. No more design decisions required — only the verification gates between PRs.

**Related**: BL-045 (original audit discipline), BL-058/BL-061/BL-062/BL-063/BL-071 (VERIFY schema expansions — preserved in BL-086 scope; only deferred-to-BL-087 if L4 ever ships), BL-076 + BL-077 + BL-079 (substrate stack preserved wholesale), BL-082 (wire-shape adapters required for `embedToolWorkedExamples` to function).

**BL-087** (reserved): post-BL-086 implementation, after operator verification of PR 1+2 produces empirical evidence on the L3/L4/L5 deferred questions. Scope at re-evaluation time — may include any subset of L3 (precheck demotion + `precheckCitations` restore arg), L4 (VERIFY removal + `emitVerifyBlock` restore arg), L5 (tool unregistration), and the composite `auditLevel: 'standard' | 'enhanced' | 'debug'` sugar enum.

---

### BL-077c: Realign IRL body cache key to `mcp:` namespace ✅ CLOSED 2026-06-07 (shipped at mcp-server 0.30.3)

**Problem**: BL-077b's `upstash.set.failed` event on staging surfaced the actual Upstash error blocking BL-076:

```
NOPERM this user has no permissions to access one of the keys used as arguments
```

The shared Upstash token (single DB shared between staging and production per operator confirmation 2026-06-07) has ACL scoped to `+@all ~mcp:*`. BL-076 originally shipped with the IRL body cache prefix `gst-mcp:irl-body:` — outside that scope — so every `prepare_irl_body` cache write was rejected with `NOPERM`. The 64KB body size that earlier diagnostics flagged was a coincidence; the same body shape hit the same error regardless of size.

**Scope**: one-line constant change in `mcp-server/src/cache/irl-body-cache.ts` — `UPSTASH_KEY_PREFIX: 'gst-mcp:irl-body:' → 'mcp:irl-body:'`. Aligns with the namespace discipline documented at `upstash-cache-store.ts:12-16` ("All keys written here use the `mcp:` prefix"). Plus a regression-guard unit test asserting `UPSTASH_KEY_PREFIX.startsWith('mcp:')` so a future refactor can't silently reintroduce the ACL failure.

**Surface impact**: `mcp-server` 0.30.2 → 0.30.3 (patch). No public contract change. No prompt-body change, no schema change, no manifest hash drift. No data migration (pre-existing `gst-mcp:irl-body:*` keys never made it to Upstash; writes were all rejected).

**Acceptance** (in-session):

- 1 new regression-guard test + existing 13 cache tests + 7 BL-076 integration tests still green with the new prefix value.
- 1461 mcp-server tests green; tsc clean.

**Operator follow-up**: deploy 0.30.3 to staging. Run `gst_irl_ingestion` exercise. Expected: `prepare_irl_body` cache writes succeed → `compose_dossier_envelope` re-hydrates successfully → dossier completes end-to-end with the BL-076 latency win. The BL-077a/b instrumentation (read-after-write probe, `bl077.cache.*` events, `upstash.set.failed` event) stays in place for now — light cost; revisit removal after one week of stable traces. Reserve as **BL-078**: remove BL-077 diagnostic instrumentation after stable trace window.

**Diagnostic chain summary** (closes here):

- BL-076 (v0.30.0) — body-by-hash mechanism shipped; latency-win design correct, but cache write silently failed in Worker mode due to ACL scope drift.
- BL-077a (v0.30.1) — fail-loud + read-after-write probe + `bl077.cache.*` logging surfaced "write returns false."
- BL-077b (v0.30.2) — `upstash.set.failed` logging surfaced the actual NOPERM error.
- BL-077c (v0.30.3) — namespace alignment closes the loop.

**Related**: BL-076 (the body-by-hash mechanism this completes), BL-077a (cache-layer fail-loud), BL-077b (substrate-layer error surfacing), BL-078 (reserved — remove BL-077 diagnostic instrumentation after stable trace window).

---

### BL-077b: Surface Upstash error in `CacheStore.set` ✅ CLOSED 2026-06-07 (shipped at mcp-server 0.30.2)

**Problem**: BL-077a's `bl077.cache.set` event on staging (1 hour after 0.30.1 deploy) confirmed `outcome: write-returned-false` at a 64054-byte body — Upstash KV write was failing — but the actual Upstash error message was being swallowed inside `CacheStore.set`'s `catch {}` block. We knew WHICH layer was failing but not WHY.

**Scope**: one-line patch to [`mcp-server/src/lib/upstash-cache-store.ts`] — add `safeLog({ event: 'upstash.set.failed', ... })` inside the existing `catch` block before returning `false`. Carries: key, JSON-stringified envelope byte length, TTL, truncated error reason, errorCode. Affects ALL callers of `createCacheStore` (resource cache, BL-076 body cache, etc.) — backward-compatible at the contract level since the behavior on failure is still "return false."

**Surface impact**: `mcp-server` 0.30.1 → 0.30.2 (patch). No public contract change. No prompt-body change, no schema change, no manifest hash drift.

**Acceptance** (in-session):

- 5 new unit tests covering success-path-no-log, throw-path-emits-with-reason, 300-char-truncation, non-Error-throw-values, byte-length-reflects-envelope-size.
- 1460 mcp-server tests green; tsc clean.

**Operator follow-up**: deploy 0.30.2 to staging; re-run the same `gst_irl_ingestion` exercise with `wrangler tail` active. The new `upstash.set.failed` event will appear with the actual Upstash error in `reason`. Likely candidates:

- `REQUEST_TOO_LARGE` / `PAYLOAD_TOO_LARGE` → 64KB body wrapped in `{storedAt, data: <JSON-escaped body>}` exceeds Upstash REST size limit. BL-077c: bypass envelope for IRL body cache OR compress before store.
- Quota / rate limit → bump plan or rotate to separate DB.
- Auth / network → config issue, rotate token or check binding.

**Related**: BL-077a (the cache-layer fail-loud + symptom logging this patch extends to the substrate layer), BL-076 (the body-by-hash mechanism this instruments), BL-077c (reserved — the targeted root-cause fix, scoped after this exercise's tail output).

---

### BL-077a: `UpstashIrlBodyCache` fail-loud + diagnostic instrumentation ✅ CLOSED 2026-06-07 (shipped at mcp-server 0.30.1)

**Problem**: post-BL-076 deploy on Cloudflare Worker staging — three back-to-back `prepare_irl_body` → `compose_dossier_envelope` pairs in a live opus-4-8 exercise all surfaced `Bl076BodyCacheMissError` on compose despite prepare returning the correct deterministic hash (`2255981b665d27d1`, 3046 bytes) every time. Stdio path unaffected. Root cause unknown — three plausible explanations from impartial audit:

1. `CacheStore.set` swallowing Upstash errors and returning `false` (caught and ignored by `UpstashIrlBodyCache.set` pre-BL-077a)
2. JSON envelope-shape mismatch in `CacheStore`'s `{storedAt, data}` wrap/unwrap producing deterministic read-side miss
3. Per-request `createServer` creating separate `UpstashIrlBodyCache` instances that for some reason aren't sharing KV state

**Scope** (diagnose-first; deferred Part B per audit recommendation):

- Make `UpstashIrlBodyCache.set` check the `CacheStore.set` boolean return; throw new `IrlBodyCacheWriteFailedError` on `false`.
- Add a read-after-write probe inside `.set` (one extra `CacheStore.get` on the same key); throw if probe returns `null` or a value that doesn't match the body just written. Catches envelope-shape AND cross-region consistency gaps.
- Emit `bl077.cache.set` + `bl077.cache.get` `safeLog` events with resolved Upstash key, per-instance `storeId` (correlates prepare and compose calls in `wrangler tail`), outcome (`success` | `write-returned-false` | `readback-null` | `readback-mismatch` | `miss` | `hit`), byte length, TTL.
- Surface `IrlBodyCacheWriteFailedError` through `prepare_irl_body` handler as a structured `isError: true` tool result with actionable text directing the operator to `wrangler tail` and file BL-077b.

**Surface impact**: `mcp-server` 0.30.0 → 0.30.1 (patch). No public contract change. No prompt-body change, no schema change, no manifest hash drift, no body hash rebaseline. `LogEvent` interface gains six optional diagnostic fields.

**Acceptance** (in-session):

- 1 new realistic 3046-byte body round-trip unit test (catches envelope-shape regression at the unit-test layer).
- 5 new BL-077a fail-loud tests covering all three `cause` values + `storeId` uniqueness + happy-path round-trip preservation.
- 1 new integration test asserting `prepare_irl_body` surfaces the new error as `isError: true` with `BL-077a` + `wrangler tail` substrings.
- 1455 mcp-server tests green; tsc clean.

**Operator follow-up**: deploy 0.30.1 to staging; run one `gst_irl_ingestion` live exercise with `wrangler tail` active. The diagnostic events will identify which of the three root causes is actually firing. File BL-077b with the tail output + the real fix.

**Design rationale**: impartial audit (2026-06-07, pre-implementation) rejected the original two-part proposal that bundled this diagnostic with a `filledIrl` fallback escape hatch in `compose_dossier_envelope`. Verdict: the escape hatch would re-introduce the prose-directive-enforcement anti-pattern BL-076 was designed to eliminate (model would learn to always pass `filledIrl` after one cache miss → latency win evaporates silently). Shipping the diagnostic alone preserves operator pressure to fix the real bug and maintains BL-076's contract. If post-diagnosis the real bug proves unfixable AND operator-blocking recurs, the audit recommended a server-side auto-retry path (option (a)) over the optional-field escape hatch — to be revisited only if needed.

**Related**: BL-076 (the body-by-hash mechanism this instruments), BL-077b (reserved — the actual fix, to be scoped after wrangler-tail evidence).

---

### BL-076: `compose_dossier_envelope` body-by-hash latency reduction ✅ CLOSED 2026-06-07 (shipped at mcp-server 0.30.0)

**Design doc**: [MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md](MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md) — full architecture, schema diffs, prompt-body changes, acceptance criteria, risks, open questions. Impartial-audit revisions folded in before implementation.

**Shipped scope**:

- NEW `IrlBodyCache` interface + `InMemoryIrlBodyCache` (stdio, 16-entry LRU) + `UpstashIrlBodyCache` (Worker, 4h TTL); `IRL_BODY_CACHE_MAX_BYTES = 200_000` per-entry cap; `IrlBodyCacheSizeExceededError` exported.
- NEW optional `irlBodyCache?: IrlBodyCache` field on `MetricsContext` (symmetric with BL-071 `counters?`); `createServer` constructs per-process for stdio + per-request Upstash for Worker. Worker fails fast when Upstash bindings absent (audit R-3, no silent in-memory fallback).
- REMOVED `filledIrl` from `ComposeDossierEnvelopeInputSchema` (public input). Engine type `ComposeDossierEnvelopeEngineInput` still carries it; the handler re-injects after cache fetch (audit M-1 keeps engine + ~30 existing engine tests unchanged).
- NEW `Bl076BodyCacheMissError` exported class + wired into handler `instanceof` chain. Surfaces actionable diagnostic; counts as `rejected` in BL-071 `serverToolCallCounts`.
- UPDATED `prepare_irl_body` handler signature gains optional `metrics?` arg; writes body to `metrics.irlBodyCache?` after computing hash. Output schema unchanged (BL-068 contract preserved). Annotations flipped `readOnlyHint: true → false` (audit R-2); `idempotentHint: true` retained.
- UPDATED prompt body v0.16.0 → v0.17.0 at both invocation sites (envelope-composition directive + interactive Step 4) instructing prepare-then-compose ordering, documenting `Bl076BodyCacheMissError`.
- Manifest hash + 3 of 7 body hashes rebaselined (the 3 verbose-mode shapes that carry the envelope-composition directive).
- 13 cache unit tests + 7 BL-076 integration tests + 4 prompt-body substring tests + 2 protocol-roundtrip surface tests (M-3) — all green. 1448 mcp-server tests total. tsc clean.

**Latency win**: independent token-count analysis estimates 40–80% reduction depending on body size; per-call wall-clock 5–15 min → est. 1–3 min for typical runs, sub-90-sec for small ones.

**External-client impact**: NONE — operator confirmed 2026-06-07 + independently verified by repo-wide grep (no callers of `handleComposeDossierEnvelopeTool` / `runComposeDossierEnvelope` outside schema + tool wrapper + 4 tests).

**Capability-preservation**: BL-049 (hash-bind defense-in-depth check still runs post-rehydrate; structurally tautological but pinned as a regression guard; authority preserved at the same level it held pre-BL-076), BL-058 (VERIFY block schema unchanged), BL-063 (partition + scope checks unchanged — no `filledIrl` dependency), BL-068 (prepare_irl_body output contract unchanged), BL-070 (`requireVerbatimBody` gate branches on `irlSource` only — preserved verbatim), BL-071 (server-arithmetic identities — `Bl076BodyCacheMissError` projects to `rejected` correctly), BL-072 (reconstruction-mode source auto-append — preserved verbatim).

**Original problem statement**: every live `compose_dossier_envelope` call on opus-4-8 takes 5–15 minutes BEFORE the server receives the call. Diagnosis: the forcing-function pattern requires the model to emit the entire tool-call payload (meta-fence + 20–30 claims with multi-element citations + 5–10 detailed gap entries with prose `entry` + `followUp` + the full `filledIrl` body — typically 9KB+ of text + 10-entry `defaultFiredFrameworks`) as output tokens. At opus's generation rate, that's many thousands of tokens of structured emit, which dominates wall-clock latency. Observed twice on 2026-06-07 — operator interprets the long wait as a server hang; it isn't. The model is working as designed, just slowly. This is fundamentally a property of externalizing dossier structure into a tool input.

Empirical evidence (2026-06-07): a partial captured payload showed ~5KB of tool-call JSON before truncation, NOT including `filledIrl` or the gap-list footers. Full payloads for typical runs are estimated at 15–25KB of model-emitted text per `compose_dossier_envelope` invocation.

**Why this matters**: the latency budget is what makes `gst_irl_ingestion` painful to operate. Each retry, re-run, or QA exercise costs 5–15 minutes per envelope call, on top of the seven analytical tools that precede it. For BL-074's "3–5 representative IRL exercises" coverage goal, the latency cost is compounding and disincentivizes the verification work that proves the workflow is production-ready.

**Fix — body-by-hash pattern**:

The largest single component of the model-emit cost is the `filledIrl` body (9–80KB depending on IRL size). `prepare_irl_body` already submits the body once to compute the canonical `irlBodyHash`. Make it cache the body server-side keyed by the hash, then drop `filledIrl` from `compose_dossier_envelope`'s input schema entirely:

1. **`prepare_irl_body` handler**: after `computeIrlBodyHash`, write the body bytes to a server-side cache keyed by the 16-hex hash. Stdio: in-process `Map<hash, body>` with LRU bounded size (16 entries, ~1.5MB worst-case). Worker: Upstash KV (same backing as radar-cache; per-engagement TTL e.g., 1h).
2. **`compose_dossier_envelope` schema**: remove `filledIrl` from `ComposeDossierEnvelopeInputSchema`. Keep `irlBodyHash` as the only body reference. New structured error `Bl076BodyCacheMissError` thrown when the hash is not present in cache (actionable text: "call `prepare_irl_body` first").
3. **`runIrlProvenanceCheck` invocation inside compose**: re-hydrate the body from cache before passing into the existing verification engine. The engine itself is unchanged — purely a different source for the body bytes.
4. **`runComposeDossierEnvelope` hash-bind check**: still verifies `sha256(rehydrated_body).slice(0,16) === irlBodyHash` for defense-in-depth (catches cache corruption / collision).
5. **`gst_irl_ingestion` prompt directive**: rewrite the envelope-composition directive at both invocation sites to instruct: "Call `prepare_irl_body` first; pass the returned `irlBodyHash` to `compose_dossier_envelope`. Do NOT pass `filledIrl` (removed in v0.17.0 — server fetches it from cache)." promptVersion 0.16.0 → 0.17.0. Manifest hash + all 7 body hashes rebaseline.
6. **VERIFY-block `filledIrl.bytes` field**: model still emits the byte count (model knows the body it sent to `prepare_irl_body`); no change to the audit artifact.

**Surface impact** — BREAKING for any external client that calls `compose_dossier_envelope` directly (none known internally; surface is documented as orchestrated by the prompt). Confirm no active external clients before scoping.

- `mcp-server` 0.29.0 → 0.30.0.
- `gst_irl_ingestion` promptVersion 0.16.0 → 0.17.0.
- New `Bl076BodyCacheMissError` exported from compose-dossier-envelope.ts + wired into handler catch chain.
- New `IRL_BODY_CACHE` interface in `mcp-server/src/cache/` — stdio + Worker implementations.
- BL-070 + BL-072 source-reconstruction auto-append logic unchanged — `irlSource` field stays on the input.
- Schema-side: `filledIrl` removed; existing `.min(200)` validation moves to `prepare_irl_body` (already enforces `.min(200)` per the BL-068 ergonomics layer).

**Acceptance** (in-session, no live exercise required):

- New unit tests: cache-hit path returns body; cache-miss throws `Bl076BodyCacheMissError`; `runComposeDossierEnvelope` works against the cached body identically to current passing-body-inline tests.
- Existing 7 BL-070 + BL-058/BL-068/BL-072 unit tests adapted: `baseInput()` factory omits `filledIrl`; setup calls `prepare_irl_body` first to seed the cache.
- Hash + body + manifest rebaselines per the prompt directive change.
- Stdio Map TTL: process-lifetime is fine (= one Claude Desktop session). Worker: Upstash KV with 1h TTL.

**Latency win estimate**: removing `filledIrl` from the model-emit cuts the largest payload component. For typical 10–80KB bodies, that's 60–80% of the compose-call emit cost. Net wall-clock per compose call: from 5–15 min today to estimated 1–3 min. Compounds across QA + multi-engagement work.

**Risks**:

- **Worker cache TTL tuning**: too short → cache miss on retry; too long → memory pressure on shared Upstash. 1h is conservative; revisit after empirical data.
- **Stdio cache eviction**: LRU 16 entries covers a deep iteration session for one operator; if exceeded, retry forces re-`prepare_irl_body` (cheap — `prepare_irl_body` is sha256 + cache write).
- **External-client breakage**: confirmed surface is internal-only; if any external client exists, ship a backward-compat shim that accepts `filledIrl` for one minor and warns.
- **Cache-poisoning impossibility argument**: hash-bind already prevents this — a poisoned body would fail `sha256(body).slice(0,16) === hash` defense-in-depth check.

**Out of scope**:

- Splitting `compose_dossier_envelope` into multiple smaller composable calls (the "Big" Option 3 from triage). The body-by-hash fix delivers most of the latency win at a fraction of the architectural cost.
- Schema audit for token bloat in claims/gaps field descriptions (the "Cheap" Option 1 — can land separately if compose latency still problematic after BL-076).
- Multi-tenant cache isolation (single-operator workflow today).
- The earlier 2026-06-06 `prepare_irl_body` 4-minute transport hang — different symptom (tiny output, cannot be token-emit), unexplained, one occurrence. If recurs, file separately.

**Related**: BL-068 (`prepare_irl_body` preflight ergonomics — BL-076 extends it from hash-compute to hash-compute-AND-cache), BL-049 (hash-bind authority — preserved as the structural integrity check), BL-074 (production-readiness gates — BL-076 is the latency unblock for the 3–5 representative IRL exercises).

---

### BL-068: Forcing-function redesign — `prepare_irl_body` preflight + server-side `map-absent:` validation + schema description enrichment ✅ CLOSED 2026-06-05

**Original proposal**: three prompt-only coaching changes (hash preflight directive, Rule 0 + tier-1 worked examples, gap-list search-backing rule). **BLOCKED in audit** as repeating the BL-058 forcing-function anti-pattern: BL-059's prompt-only Rule 0 prose already failed empirically (5/1 on 06-06; 4 calibration violations still emitted on 06-05 even with the model demonstrably knowing the rule). "More prose ≠ different outcome" for a directive that already failed in prose form.

**Redesign**: ship two clean forcing-function mechanisms + defense-in-depth schema enrichment, defer Rule 0 + Tier-1 first-emission discipline with documented rationale.

**Fix** (server-side, no prompt change):

1. **NEW: `prepare_irl_body` preflight tool** (`mcp-server/src/tools/prepare-irl-body.ts`, `src/schemas/prepare-irl-body.ts`). Input: `{ filledIrl: string }` (≥200 chars). Output: `{ irlBodyHash: string, byteLength: number }`. Reuses `computeIrlBodyHash` from `compose-dossier-envelope.ts:59` — single source of truth. Tool description directs model to CALL FIRST. **Framing**: retry-elimination ergonomics on top of `IrlBodyHashMismatchError` (the actual forcing function), not a new forcing function. Compliant clients drop the hash-bind retry; non-compliant clients still hit the existing rejection with a new `Fix:` line steering them to the preflight tool.
2. **`IrlBodyHashMismatchError` rejection text enriched** with the BL-065-style `Fix: call \`prepare_irl_body\`...` line.
3. **NEW: `Bl068MapAbsentFalsePositiveError`** in `compose_dossier_envelope` (`mcp-server/src/schemas/compose-dossier-envelope.ts`). Scans `input.gaps` for `category === 'map-absent'` entries, runs each through `findMatchedHubFramework` (built on `isHubBacked` + `normalizeFrameworkName`), rejects if any model-supplied `map-absent:` claim names a framework the Hub registry covers. Rejection text names the matched Hub entry. **Catches the 2026-06-05 false-positive pattern** (NIST AI RMF + AU Privacy Act both ARE in the Hub registry; model claimed them absent without probing).
4. **Zod `.describe()` enriched** on `dimensionAuditBaseSchema.tier` + `.citation`. Field descriptions surface in the per-field JSON Schema (`tools/list`), adjacent to where the model binds the value — a third intervention surface distinct from prompt body and tool description. Defense-in-depth, not forcing function.
5. **`runAuditRefinements` JSDoc** — BL-068 future-contributor guard explaining why reordering checks (e.g., to run Rule 0 + Tier-1 first) is a no-op for retry budget. Step 4 of the plan documents the explicit no-change rationale.

**Surface impact**:

- `mcp-server` 0.24.0 → 0.25.0 (MINOR — new tool surface; semver-as-contract).
- **Manifest hash UNCHANGED** (`5bee38cc935fa3a1b987999ed9d467f250b1dc4eeeb3b1b5555bb5a3205adbd9`). The plan initially projected a rebaseline but the manifest hash is computed over **URIs + prompt name@version tuples only** (`tests/integration/manifest-stability.test.ts:88-99`), NOT tool names — adding a tool does not invalidate it.
- Prompt unchanged. All 7 body hashes unchanged.
- New tests: 7 unit tests for `prepare_irl_body` + 11 tests for the map-absent validator + 1 integration test for the new tool's schema publication + 1 unit test asserting the new `Fix:` line in `IrlBodyHashMismatchError`.

**Known false negative (documented in tests)**: `isHubBacked("UK GDPR")` returns false because `"ukgdpr"` is not a substring of `"ukdataprotectionact2018"` (the `GB-DPA.json` normalized name). The 06-05 retest's UK GDPR `map-absent:` claim would NOT be caught by this validation. Covered by future regulatory-map alias work, not BL-068.

**Acceptance** (next live exercise on the same IRL):

- `compose_dossier_envelope: { attempted: 1, succeeded: 1 }` for compliant models (preflight eliminates hash-bind retry).
- `prepare_irl_body: { attempted: 1, succeeded: 1 }` appears in `toolCallCounts`.
- Gap list: zero false-positive `map-absent:` claims for NIST AI RMF + AU Privacy Act. (UK GDPR remains the documented known gap.)
- `generate_diligence_agenda: 2/1` remains the structural floor — Step 4 documents this is by design, not a regression.

**Escalation triggers** (filed as reserved BLs):

- `compose_dossier_envelope` 3+/1 across 2 consecutive post-BL-068 exercises → **BL-070** (server-derived `irlBodyHash`: make field optional, compute server-side when omitted, return canonical hash in the envelope).
- `generate_diligence_agenda` 2/1 recurring across 3+ exercises with operator willingness to spend tool-call headroom → **BL-069** (`validate_diligence_audit` preflight tool — same shape as `prepare_irl_body`, validates `_audit` Rule 0 + Tier-1 structure synchronously).

**Lesson**: the audit's "no deferred tech debt" / forcing-function discipline (BL-058 pattern) is the correct lens. BL-068's original prompt-only proposal would have been BL-059 v2 — same intervention, same failure expected. The redesign separates "ergonomics on top of existing forcing function" (`prepare_irl_body`) from "new forcing function" (`map-absent` server validation) and is honest about which is which. Defense-in-depth schema enrichment is a third intervention class that costs nothing and may shift first-emission behavior on the margin; if it doesn't, no regression.

**Related**: BL-049 (hash-bind authority design), BL-057 (regulatory-map coverage), BL-058 (forcing-function pattern), BL-059 (Rule 0 prose that BL-066 reinforced at rejection time), BL-063 (`isHubBacked` partition checks reused here), BL-066 (Rule-0 batch summary that this PR's Step 4 declines to re-architect).

---

### BL-067: `citationSchema` em-dash + min-20 length — enrich rejection at the schema seam ✅ CLOSED 2026-06-06

**Recurrence threshold MET — promoted from DEFERRED-PENDING-RECURRENCE on 2026-06-05.**

**Two empirical observations:**

1. **2026-06-05 (claude-sonnet-4-6, post-BL-066)** — `generate_diligence_agenda: 2/1`, attempt-2 `errorClass: citation-format-invalid`, `recoveryAction: corrected-em-dash-and-citation-length`. Model used hyphen `-` where regex requires em-dash `—`.
2. **2026-06-05 (claude-opus-4-8, post-BL-068)** — `compute_techpar: 2/1`, attempt-2 `recoveryAction: lengthened-ytd-citation-excerpt-to-20-chars`. Model supplied a citation excerpt shorter than the `.min(20)` post-em-dash requirement.

Both retries trace to the same regex: `^Section (\d{2}|--)[^—]*—.{20,}$` at `mcp-server/src/schemas/diligence-audit.ts:133`. Two distinct failure modes (wrong dash character + insufficient excerpt length) on two different tools (`generate_diligence_agenda` + `compute_techpar`) across two model tiers (sonnet + opus) on the same calendar day. The regex-mismatch error surfaces as a raw SDK Zod message ("string does not match regex") with no `Fix:` line — exactly the gap BL-068's Step 4b `.describe()` enrichment couldn't close (descriptions aren't surfaced in error text).

**Scope (audit-discipline answer):**

1. **Enrich the citation regex rejection message** at the Zod schema definition site with a literal `Fix:` line: _"Citation must match the form `Section NN — <excerpt of ≥20 characters>`. Common issues: use em-dash (`—`, U+2014), NOT hyphen (`-`, U+002D). The post-em-dash excerpt must be at least 20 characters of substantive IRL content; one- or two-word excerpts will be rejected. For partner-supplied (non-IRL) callers, use `Section -- — partner-supplied form input — <description>` (the literal `--` indicates no IRL section)."_ — applied as a custom message in `.regex(citationSchema, { message: ... })` so the model sees the Fix at the rejection site.

   This is the BL-065 forcing-function pattern applied to a structural Zod issue — same shape as the `Fix:` lines on `runAuditRefinements`. Does NOT require the BL-065 architectural compromise (permissive inputSchema); regex-level custom messages survive SDK JSON Schema publication intact.

2. **NOT pre-coercion.** Silently rewriting `-` → `—` masks the regression on the model side and breaks BL-049's verbatim-body discipline if extended to non-citation fields. Audit-discipline path wins.

**Out of scope**: BL-068's Step 4b Zod `.describe()` enrichment is descriptions, not error messages. Field descriptions surface in `tools/list` schema JSON but NOT in rejection text. BL-067's `.regex(..., { message })` is a different SDK surface.

**Related**: BL-065 (forcing-function rejection enrichment), BL-066 (Rule-0 batch summary), BL-068 (Zod `.describe()` enrichment — distinct surface, doesn't close this gap).

---

### BL-070: ~~Server-derived `irlBodyHash`~~ → RESCOPED → `requireVerbatimBody` forcing function ✅ CLOSED 2026-06-06 (shipped at mcp-server 0.28.0)

**Original scope (BL-068 acceptance trigger)**: make `compose_dossier_envelope.irlBodyHash` optional; compute server-side when omitted; return canonical hash in the envelope for auditability. Designed as the escalation if mid-tier models systematically ignored the `prepare_irl_body` preflight directive.

**Why rescoped**: the 2026-06-05 opus-4-8 exercise produced a model honesty disclosure that exposed the actual blind spot — and it's NOT what BL-070-as-originally-scoped fixes. The model reported `hashBindResult: pass-internal` because the IRL arrived as xlsx, not as partner-pasted markdown with a binding-hash directive. **In xlsx-reconstruction mode the model controls both sides of the hash bind**: it reconstructs the markdown, computes the sha256 over its own reconstruction, passes both to the server. The hash check is satisfied tautologically. BL-049's "model proved it sent the verbatim body" guarantee only holds in partner-paste mode where there's an external authoritative source the model can't paraphrase. Making `irlBodyHash` server-derived doesn't help — the server still receives the model's reconstruction.

**Realization**: the 76,847-byte xlsx extract hashed to `39fca682787cdb30`; the envelope was bound to a 2,815-byte trimmed reconstruction (`78db14dfe816bc6c`). Provenance verification was 21/21 over the trimmed body, not the source. BL-070's server-derived hash would still hash the trimmed body. Wrong fix.

**Rescoped scope**:

- (a) Surface the xlsx-reconstruction limitation explicitly to operators (BL-072 closes this at the artifact level).
- (b) Add a prompt-arg or flag `requireVerbatimBody: boolean` that, when true, REFUSES `xlsx-reconstruction` and instructs the model to operate in `partner-paste` mode only. For runs where authoritative provenance matters (regulatory, M&A close, post-mortem), operators set the flag.
- (c) The underlying authoritative-xlsx fix is the deferred xlsx-canonicalization design at `src/docs/development/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md`, blocked on cross-host Claude Desktop bytes-delivery topology. Not in BL-070 scope.

**Status**: ✅ **CLOSED 2026-06-06 — shipped scope (b)** at mcp-server 0.28.0 (PR1 of BL-074 production-readiness gates). Added optional `requireVerbatimBody?: boolean` to `ComposeDossierEnvelopeInputSchema` + new `Bl070VerbatimBodyRequiredError` + early guard in `runComposeDossierEnvelope` + corresponding prompt arg + envelope-composition directive at both invocation sites. Promotion was triggered by BL-074 (production-readiness gates) rather than empirical pain; ships as preventive infrastructure for accuracy-critical engagements. **Known limitation accepted-with-disclosure**: model can self-degrade the flag value at the tool-call seam; operator detection covers it today; BL-071 (next PR) makes the self-degradation server-detectable via arithmetic on rejection counts. Bundled with the BL-073 acronym add-on (NIST AI RMF + NIST RMF aliases on US-NIST-AI-RMF.json) — the 2026-06-06 fourth live exercise emitted the acronym which the canonical-substring path missed; same false-negative class as BL-073's earlier scope. 7 new BL-070 unit tests + 4 prompt-body assertions + 1 BL-073 acronym test all green; 3 body hashes + manifest hash rebaselined.

---

### BL-071: Server-sourced `toolCallCounts` in VERIFY block ✅ CLOSED 2026-06-06 (shipped at mcp-server 0.29.0)

**Problem**: model-reported `toolCallCounts` in the BL-045 VERIFY block has demonstrated drift across both model tiers:

- **sonnet-4-6 (06-05 pre-BL-068)**: reported `prepare_irl_body: { attempted: 1, errorClass: transport-timeout }` when the MCP server log shows zero `tools/call` for the tool. Pure fabrication.
- **sonnet-4-6 (06-05 pre-BL-068)**: reported `serverVersion: 1.0.0` while prompt body emits 0.12.0. Fabrication.
- **opus-4-8 (06-05 post-BL-068)**: omitted `prepare_irl_body` from `toolCallCounts` entirely while `precheck.attemptsTotal: 2` captured the same activity in a different field. Omission, not fabrication, but still inconsistent.

If operator acceptance triage continues to depend on the artifact, model self-narration is not trustworthy enough.

**Scope**: extend `withToolMetrics` (`mcp-server/src/metrics/_index.ts`) to emit per-tool invocation counters that `compose_dossier_envelope` reads from `MetricsContext` and injects into its returned envelope. Model still writes the dossier, but `(K)` provenance footer (or a sibling field) carries the canonical `toolCallCounts` from the server's vantage point. The model's VERIFY block self-report becomes secondary; operator triage uses server-derived counts.

**Status**: ✅ **CLOSED 2026-06-06 — shipped** at mcp-server 0.29.0 (PR2 of BL-074 production-readiness gates, on top of BL-070 PR1 0.28.0). Promoted from RESERVED before the empirical bar fully tripped because (a) BL-074 made it a named gate, and (b) shipping it on top of BL-070 closes the BL-070 self-degradation gap arithmetically (server-arithmetic rejection counts make self-degradation server-detectable).

**Shipped scope**:

- **NEW: `ToolCallCounters` interface + `InMemoryToolCallCounters`** at [`mcp-server/src/metrics/with-metrics.ts`]. Four states per tool (`attempted` / `succeeded` / `rejected` / `errored`). Split `attempted`-at-wrap-entry from outcome-at-wrap-exit (audit M1) so the envelope tool's own snapshot includes its own in-flight attempt — semantic guarantee: "I'm reporting on the call I'm currently inside."
- **NEW: optional `counters?: ToolCallCounters` field** on `MetricsContext`. `withToolMetrics` records counter events; `withResourceMetrics` and `withPromptMetrics` do NOT (tool-only scope today).
- **NEW: per-process counter wiring in `createServer`** — stdio constructs a fresh `{ sink: NoopSink, counters: InMemoryToolCallCounters }` (process-lifetime = one Claude Desktop session); Worker adds counters to the existing context literal (per-request scope). The frozen `NOOP_METRICS_CONTEXT` stays untouched per audit B1 — used by 14+ default-param sites + tests.
- **NEW: `serverToolCallCounts` field on `ComposeDossierEnvelopeResult`** + emitted from the handler via the closure-captured `MetricsContext`. Optional (omitted when metrics is undefined — backward-compat for tests).
- **NEW: prompt body directive (v0.15.0 → v0.16.0)** instructing the model to (a) copy `serverToolCallCounts` VERBATIM into the BL-045-VERIFY block `toolCallCounts` field and (b) derive `precheck.iterations === validate_irl_provenance.succeeded`, `precheck.attemptsTotal === attempted`, `precheck.errorsEncountered.length === rejected` from the snapshot. The identity holds because `validate_irl_provenance` is registered exactly once and the internal verification engine bypasses the wrapper.
- **`toolCallCounts` template line** gains `errored: N` at both invocation sites (one-shot + interactive).

**Tests** (in-session integration assertions per BL-074 discipline):

- 5 new `InMemoryToolCallCounters` unit tests + 7 new `withToolMetrics` counter-integration tests at `tests/unit/metrics/with-metrics.test.ts`.
- 3 new BL-071 integration tests at `tests/integration/bl-071-precheck-derivation.test.ts` proving the SERVER side of the arithmetic identity end-to-end + verifying the in-flight `compose_dossier_envelope: { attempted: 1, succeeded: 0 }` semantic + backward-compat (omits serverToolCallCounts when metrics undefined).
- 6 new prompt-body substring assertions + 1 updated BL-058 verify-block field for `errored: N`.

**Surface impact**: `mcp-server` 0.28.0 → 0.29.0. Manifest hash rebaselines. ALL 7 body hashes rebaseline (verify directive ships in every body shape). 1421 mcp-server tests + 1111 root tests + tsc + astro + lint clean.

**BL-075 reservation status**: per the original audit min-5 note, BL-071 makes BL-070's `requireVerbatimBody` self-degradation server-detectable (any model that ignores the operator flag and submits `requireVerbatimBody: false` to the tool now shows up as `serverToolCallCounts.compose_dossier_envelope.rejected` arithmetic that operators can hard-check). The BL-075 reservation for server-side prompt-arg passthrough may now be redundant — re-evaluate after one live exercise with BL-071 deployed.

---

### BL-073: Regulatory-map alias support for framework-equivalence matching ✅ CLOSED 2026-06-06 (+ acronym add-on 2026-06-06 in BL-070 PR)

**Problem**: three frameworks have empirically failed `findMatchedHubFramework` bidirectional substring matching across multiple recent exercises because no normalized substring overlap exists between the model's idiom and the Hub's canonical name:

- `"UK GDPR"` ↔ `"UK Data Protection Act 2018"` (GB-DPA)
- `"Australia Privacy Act"` ↔ `"Privacy Act 1988 (as amended 2024)"` (AU-PRIVACY-ACT)
- `"EU AI Act"` ↔ `"EU Artificial Intelligence Act (Regulation 2024/1689)"` (EU-AI-ACT)

Each surfaced as `map-absent:` false positives in (J) gap lists — operators had to mentally reconcile that "UK GDPR is absent" really means "UK GDPR is covered under UK DPA 2018".

**Fix**:

1. **NEW optional `aliases?: string[]`** on `RegulationSchema` at `src/schemas/regulatory-map.ts`. `Regulation` is `z.infer`'d so the type flows automatically.
2. **JSONs populated** with curated aliases (see file diffs).
3. **Matcher refactor** (`mcp-server/src/schemas/compose-dossier-envelope.ts`): `HUB_FRAMEWORK_INDEX` typed records with canonical + alias paths. Canonical-name bidirectional substring preserved verbatim (no regression). Alias matching is **exact-equality on normalized form** (not substring) — short curated forms can't spuriously match future entries.
4. **Codegen guard** in `scripts/generate-regulations-index.mjs` fails the build on duplicate aliases.
5. **Tests**: 2 KNOWN GAP tests flipped to positive; 3 new BL-073 tests; 1 integration test exercising all three aliases end-to-end through `runComposeDossierEnvelope`.

**Bundled `serverVersion` → `promptVersion` rename**: same PR renames the VERIFY-block YAML field at both invocation sites (mislabeled — carries promptVersion not mcp-server version). promptVersion 0.13.0 → 0.14.0. ALL 7 body hashes rebaseline.

**Surface impact**: `mcp-server` 0.26.0 → 0.27.0. Manifest hash rebaselines. All 7 body hashes rebaseline. 1390 mcp-server tests pass.

**Acceptance** (in-session): new `runComposeDossierEnvelope` integration test proves alias rejection end-to-end without depending on a live exercise.

**Lesson**: empirical alias collection — only added aliases for the three frameworks the model has emitted across observed runs. Per `feedback_no_unfounded_risk_claims`, didn't speculatively add aliases for unobserved candidates. Codegen guard makes future additions safe-by-construction.

**Related**: BL-057 (regulatory-map coverage), BL-068 (`Bl068MapAbsentFalsePositiveError` + `findMatchedHubFramework` that BL-073 extends).

---

### BL-072: Auto-inject `provenance-gap:` entry when `source: model-reconstruction-*` ✅ CLOSED 2026-06-06

**Problem**: the 2026-06-05 opus-4-8 exercise produced an explicit honesty disclosure: when the IRL arrives as xlsx (not partner-pasted markdown), the model's `hashBindResult: pass-internal` is tautological — the model controls both `filledIrl` and `irlBodyHash`. BL-049's verbatim-body authority does NOT hold in xlsx-reconstruction mode. The 21/21 provenance verification was over a 2,815-byte trimmed reconstruction of a 76,847-byte source — a ~96% reduction. The model surfaced this voluntarily; absent that disclosure, operators reading the dossier would treat `pass-internal` + `verified: 21/21` as authoritative when they're authoritative only over the model's own reconstruction.

This is structural, not model-tier. Mid-tier models won't volunteer the disclosure; frontier models did this time but won't always. The fix is to make it artifact-level.

**Scope**: in `mcp-server/src/schemas/compose-dossier-envelope.ts`, inspect the new `source` field on the VERIFY block (currently model-supplied prose; needs to be a structured field on `ComposeDossierEnvelopeInput` — small schema extension). When `source.startsWith('model-reconstruction')`, auto-append to the input `gaps` array (before the existing partition/auto-append logic):

```
{
  category: 'provenance-gap',
  entry: 'xlsx-reconstruction mode: hashBindResult `pass-internal` is internal-consistency only; provenance verification is over the model-reconstructed body, not the source xlsx. The model controls both `filledIrl` and `irlBodyHash`; BL-049 verbatim-body authority does NOT hold in this mode.',
  followUp: 'For authoritative provenance (regulatory, M&A close, post-mortem), re-run with the IRL pasted directly as markdown so it round-trips verbatim from the prompt arg. Cross-reference `src/docs/development/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md` for the deferred xlsx-canonicalization design that would close this gap structurally.'
}
```

This converts a one-off model honesty disclosure into a structural artifact that every xlsx run carries. Operators can act on the disclosure or not; either way it's visible.

**Surface impact**:

- `mcp-server` minor bump (new optional schema field + auto-append rule).
- Prompt-body change: `gst_irl_ingestion` needs to instruct the model to populate `source: 'model-reconstruction-from-xlsx' | 'model-reconstruction-trimmed' | 'partner-paste-verbatim'` in the envelope input. Promptversion 0.12.0 → 0.13.0, manifest hash rebaselines.
- 2 new unit tests: source=reconstruction triggers auto-append; source=partner-paste does not.

**Out of scope**: closing the structural blind spot itself (the xlsx-canonicalization path) — that's the BL-049 design doc, blocked on cross-host topology.

**Related**: BL-049 (hash-bind authority design + xlsx-canonicalization blueprint), BL-068 (`prepare_irl_body` ergonomics — works wire-side but doesn't close this gap), BL-070 (rescoped; `requireVerbatimBody` flag is the complementary fix at the prompt-arg seam).

---

### BL-066: `generate_diligence_agenda` — Restore JSON Schema Introspection + Rule-0 Consolidated Batch Summary ✅ CLOSED 2026-06-05

**Problem**: BL-065 (v0.23.0) traded `inputSchema: AuditedUserInputsSchema` for a permissive `z.object({}).passthrough()` so handler-side validation could uniformly frame Zod structural + BL-045 cross-field rejections through `formatAuditIssues`. The 2026-06-05 post-deploy retest produced a **regression worse than the baseline it was meant to fix**: `generate_diligence_agenda: 3/0` (never converged) vs. pre-BL-065 `5/1`. Root cause: the claude.ai MCP bridge type-coerces nested values (`_audit` object, `geographies` array) against the published per-field JSON Schema; with the permissive schema, it had no type hints and JSON-stringified them on the wire. Attempts 1–2 burned unpacking the stringification; attempt 3 ran out of budget. Confirming evidence: `compose_dossier_envelope` (uses `.shape`) was clean at 2/1 (legitimate BL-049 hash-bind retry); `compute_techpar` + `estimate_tech_debt_cost` (also structural schemas) were 1/1 each. The 0.23.0 BL-065 change was the only tool that lost its schema and the only tool that flipped to 0 successes.

**Fix** (server-side, no prompt change):

1. **`registerDiligenceTool` `inputSchema`** — `z.object({}).passthrough()` → `AuditedUserInputsSchema.shape`. Matches the registration pattern `compose_dossier_envelope` and `compute_techpar` use successfully; the MCP bridge regains the type hints it needs to send nested fields as native types on the wire.
2. **`handleDiligenceTool` signature** — `(rawInput: unknown)` → `(payload: AuditedUserInputs)`. The handler's upfront `safeParse` block is removed; SDK validates structurally before the handler runs.
3. **Deleted BL-065 helpers** — `zodIssueToRuleId`, `enrichZodMessage`, `zodErrorToAuditIssues` were introduced solely for the safeParse path and have zero live callers now. The Zod 4 API drift these helpers triggered (CI typecheck failure on the BL-065 PR: `'invalid_enum_value' → 'invalid_value'`, `PropertyKey[] → string[]`) was exactly the maintenance burden of speculative dead code. If a future MCP SDK exposes a parse hook, restore from git (`git show e2ee304`).
4. **NEW: Rule-0 consolidated batch summary** — `formatAuditIssues` now emits `⚠️ Rule 0 batch (N dimensions): <names>` when ≥2 issues carry `BL-045-TIER-3-REQUIRED-FOR-UNKNOWN`. The model sees one "fix N dims" instruction instead of N independent corrections — the BL-064 audit's "Option 3" delivered in its cheapest form (no new traversal, just a summary line over the existing collector output). The per-issue `Fix:` lines are unchanged; the summary is additive.
5. **`generate_diligence_agenda` restored to the BL-045 M8 contract** — `auditBearingTools` includes it again; the BL-065 companion test (permissive-schema + handler rejection) is replaced by a **new published-schema regression guard** that asserts `properties._audit.type === 'object'`, `properties.geographies.type === 'array'`, and that `_audit.properties` is non-empty. Future refactors that re-permissive-ify the schema fail this guard.

**Surface impact**:

- `mcp-server` 0.23.0 → 0.24.0 (server-internal fix; semver-as-contract bump because error-message text + published JSON Schema are observable behavior)
- Prompt unchanged. **Manifest hash unchanged.** All 7 body hashes unchanged.
- Test surface: 1 new integration assertion (published-schema regression guard); 3 new unit tests (Rule-0 batch summary at 2/1/4 offenders); rewrite of `diligence-zod-wrap.test.ts` → `diligence-handler.test.ts` refocused on cross-field rejection framing; deleted BL-065 zod-wrap aggregation tests.

**Acceptance**: the next live exercise on the same IRL shape shows `generate_diligence_agenda: { attempted: ≤2, succeeded: 1 }`. 1/1: ideal — bridge type-coerces natively, Rule-0 batch summary sticks on first cross-field retry. 2/1: acceptable structural floor (currency→bracket cascade, the only genuine cascading rule pair). 3+/1: scope BL-067 — investigate whether toolErrors show a new rejection class (escalate to a deeper Option-3-full structural pre-check that runs before `runAuditRefinements`'s sequential rules, surfacing all Rule-0 offenders even when an upstream rule fires).

**Lesson**: BL-065's trade-off ("lose JSON Schema introspection to gain uniform rejection framing") underweighted the load that the published schema carries for _wire-format type coercion_ — not just client-side documentation. The empirical evidence from the working tools (`compose_dossier_envelope` + `compute_techpar` + `estimate_tech_debt_cost`) was already in front of us; the BL-064 plan audit flagged the SDK-validates-before-handler architecture issue but the BL-065 implementation chose the permissive-schema escape hatch rather than wait for an SDK-layer parse hook. BL-066 corrects course and ships the cheaper Rule-0 batch summary improvement on top.

---

### BL-065: `generate_diligence_agenda` — Audit-Rejection Forcing-Function Hardening ✅ CLOSED 2026-06-06 (regressed; reverted at BL-066 / v0.24.0)

**Problem**: the 2026-06-06 post-deploy live exercise (first run against `promptVersion: 0.12.0`) produced `generate_diligence_agenda: 5/1` — 4 retries on a single dossier run. Recovery actions included one direct Rule 0 violation (`corrected revenueRange tier to 3 (unknown sentinel requires tier 3)`) plus three other cross-field rejections (currency conversion missing, tier-1 literal mismatches, dataSensitivity missing piiCategoriesPresent). BL-059's Rule 0 prose in the prompt body did NOT prevent the violation — confirming the BL-064 audit's Scenario B prediction that prose-only Rule 0 was WEAK.

**Fix** (server-side, no prompt change):

1. **`formatAuditIssues` preamble** — rewritten with a ⚠️ RETRY DISCIPLINE block demanding all-issues-at-once fixes. Reports issue count up front. Footer preserves `"retry the tool call"` for existing test compat.
2. **`Fix:` terminal line on every rule** — each of the 10 cross-field rejection messages gains a canonical `Fix: <exact correction>` sentence so the model has a stable, scannable instruction.
3. **Rule 0 explicit naming** — `BL-045-TIER-3-REQUIRED-FOR-UNKNOWN` (firing across all 13 dimensions) now opens with `[Rule 0 — tier/value coupling]` and explicitly states the bidirectional rule (`value="unknown" ⇔ tier="3"`). Matches the "Rule 0" name BL-059's prompt-body directive uses.
4. **Zod-wrap layer** — structural Zod failures (missing required fields, wrong types, invalid enums) route through the same `formatAuditIssues` framing via new exported helpers in `diligence-audit.ts`. Each Zod issue maps to a synthetic `BL-045-SCHEMA-*` ruleId with a `Fix:` line; path is interpolated (BL-064 audit MINOR 3 fix).
5. **`handleDiligenceTool` signature change** — `(payload: AuditedUserInputs)` → `(rawInput: unknown)`. The handler runs `AuditedUserInputsSchema.safeParse` upfront.
6. **`registerDiligenceTool` `inputSchema`** — `AuditedUserInputsSchema` → `z.object({}).passthrough()`. The SDK no longer rejects before the handler. Trade-off: this tool loses client-side JSON Schema introspection; the prompt body + TOOL_DESCRIPTION carry the canonical guidance instead. BL-045 M8 contract updated to exclude this tool (compute_techpar + estimate_tech_debt_cost remain on the contract).

**Surface impact**:

- `mcp-server` 0.22.0 → 0.23.0 (server-internal improvement; semver-as-contract bump because error message text is observable behavior)
- Prompt unchanged. **Manifest hash unchanged.** All 7 body hashes unchanged.
- 18 new tests: BL-065 forcing-function framing describe block in `diligence-audit.test.ts` + new `tests/unit/tools/diligence-zod-wrap.test.ts`.

**Acceptance**: the next live exercise on the same IRL shape shows `generate_diligence_agenda: { attempted: ≤2, succeeded: 1 }` (down from 5/1). Ideal 1/1; 2/1 acceptable when the cascading currency→bracket dependency hits the structural floor. 3+/1 indicates the messages still aren't sticking and escalation to a structural Rule-0 pre-check (BL-064 audit Option 3) is needed. BL-059's empirical acceptance (≥3 live exercises with median retry rate ≤0.2 per tool) closes incrementally across the next 2 post-BL-065 exercises.

---

_Created: April 18, 2026 | Last pruned: April 24, 2026 | BL-039 delivered: May 13, 2026 | BL-040 filed: May 13, 2026 | BL-041 filed: May 27, 2026 | BL-041 closed: May 30, 2026 | BL-047 filed: May 30, 2026 | BL-048 extracted from BL-037 Phase D: May 31, 2026 | BL-049 filed: June 3, 2026 (xlsx canonicalization for hash-bind authority) | BL-051 + BL-052 + BL-053 filed: June 4, 2026 (post-BL-049 v12 live-exercise empirical follow-ups — citation iteration discipline, verify block schema clarity, multi-bullet citation array form) | BL-049 partial-reverted at v0.13.1 + BL-054 filed: June 4, 2026 then retired same day (xlsx-canonicalized hash-bind authority — blueprint preserved in [MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md](MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md); revisit via design doc if external infrastructure ships, not via backlog ping) | BL-056 filed + closed: June 4, 2026 (precheckIterations field added to BL-045-VERIFY block — BL-051 compliance now observable from the artifact alone) | BL-057 filed: June 4, 2026 (regulatory-map coverage gap sweep — AI-governance canon NIST AI RMF + Canada AIDA + Colorado AI Act + NYC AEDT + Illinois HB 3773 + CA + UK; Chile Ley 21.719 data-protection) | BL-058 filed + closed: June 4, 2026 (VERIFY block enriched with filledIrl + precheck + toolCallCounts + conditionalTriggers + response field families — engineering triage now one-paste, no follow-up Q&A) | BL-059 + BL-060 + BL-061 + BL-062 filed + revised: June 4, 2026 (post-BL-058 retest empirical follow-ups — tool-arg coaching to eliminate retry tax, top-level toolErrors block, compactionEvents field, conditionalTriggers default-vs-conditional disambiguation; revisions same-day after independent agent audits — BL-060 elevated to hard prerequisite of BL-059, compose_dossier_envelope hash-bind ergonomics moved in-scope, BL-061 epistemic claim corrected with null state, BL-062 Option A picked explicitly, BL-060+061+062 grouped for one rebaseline cycle) | BL-060 + BL-061 + BL-062 closed: June 4, 2026 (three VERIFY-block field additions shipped together at prompt 0.9.0 / mcp-server 0.18.0 — BL-059 unblocked, awaiting next live exercise for diagnostic data) | BL-059 initial scope closed: June 4, 2026 (Rule 0 tier-discipline universal coaching + Step 1a tier-3 worked-example refinement shipped at prompt 0.10.0 / mcp-server 0.19.0; full acceptance pending operator-driven ≥3-run retry-rate measurement); BL-063 refiled as open: June 4, 2026 (post-impartial-audit — prose-only directive was WEAK; refiled scope is server-side enforcement in compose_dossier_envelope with partition + scope + Hub-backing checks, matching the BL-058 forcing-function pattern) | BL-057 closed: June 5, 2026 (3 new regulation URIs shipped at mcp-server 0.20.0 — NIST AI RMF + UK pro-innovation AI framework + Chile Ley 21.719; scope reduced from 8 to 3 via inventory pass + Canada AIDA dropped after WebSearch confirmed Bill C-27 died on Order Paper Jan 2025; taxonomy decision resolved to existing `ai-governance` enum value) | BL-063 closed: June 5, 2026 (server-side enforcement shipped at prompt 0.11.0 / mcp-server 0.21.0 stacked on BL-057 — Bl063PartitionViolationError + Bl063CertificationNotRegulationError reject + map-absent auto-degrade against the now-123-framework Hub registry; 12 new unit tests covering the three rules including the 2026-06-04 retest's exact failure pattern) | BL-064 filed + closed: June 5, 2026 (batch-call discipline for search_regulations + search_portfolio shipped at prompt 0.12.0 / mcp-server 0.22.0 — search_regulations prompt-only rewrite (schema already supported StringOrStringArray); search_portfolio schema + handler + tests + prompt; ICG 2/2 documented as canonical empty-probe + seeded pattern, NOT a defect; generate_diligence_agenda 3/1 retries identified as pre-BL-059-deploy stale data via user confirmation, no new coaching) | BL-065 filed + closed: June 6, 2026 (audit-rejection forcing-function hardening for generate_diligence_agenda shipped at mcp-server 0.23.0 — formatAuditIssues preamble rewritten with ⚠️ RETRY DISCIPLINE block, Fix: terminal line on every rule, Rule 0 explicit naming in tier-3 messages, Zod-wrap layer routing structural failures through the same rule-coded framing via new zodErrorToAuditIssues helper, handler signature change to (rawInput: unknown) + permissive inputSchema; BL-045 M8 contract updated to exclude this tool; manifest hash + body hashes unchanged; 18 new tests; acceptance target ≤2/1 on next live exercise vs the 5/1 of the 2026-06-06 retest) | BL-065 regressed + BL-066 filed + closed: June 5, 2026 (post-BL-065 retest produced 3/0 — never converged; permissive `z.object({}).passthrough()` removed JSON Schema type hints, causing the claude.ai bridge to JSON-stringify \_audit + geographies on the wire; BL-066 reverts inputSchema to AuditedUserInputsSchema.shape matching the working compose_dossier_envelope pattern, deletes dead BL-065 Zod-issue helpers, adds Rule-0 consolidated batch summary in formatAuditIssues when ≥2 dims trip TIER-3-REQUIRED-FOR-UNKNOWN, restores generate_diligence_agenda to BL-045 M8 contract with new published-schema regression guard asserting \_audit.type/properties + geographies.type; shipped at mcp-server 0.24.0; manifest hash + body hashes unchanged) | BL-067 filed + DEFERRED-PENDING-RECURRENCE: June 5, 2026 (citationSchema em-dash literal — single observation post-BL-066; ship only if pattern recurs across 2+ exercises) | BL-068 originally filed as prompt-only PROPOSED, BLOCKED in audit (repeating BL-058 forcing-function anti-pattern), redesigned + filed + closed: June 5, 2026 (forcing-function redesign — NEW prepare_irl_body preflight tool eliminating BL-049 hash-bind retry for compliant clients, NEW Bl068MapAbsentFalsePositiveError rejecting model-supplied map-absent claims that point at Hub-backed frameworks, Zod .describe() defense-in-depth on dimensionAuditBaseSchema.tier + .citation, runAuditRefinements JSDoc future-contributor guard against re-architecting BL-066 cascade; BL-069 + BL-070 filed as RESERVED escalation triggers; shipped at mcp-server 0.25.0; manifest hash + body hashes unchanged because manifest covers URIs + prompt name@version not tool names) | BL-067 promoted DEFERRED→OPEN→CLOSED: June 5-6, 2026 (two empirical citation-regex retries on same day across sonnet-4-6 + opus-4-8 — em-dash vs hyphen + min-20-char excerpt — shipped at mcp-server 0.26.0 with BL-072 as bundled prompt+schema PR; custom .regex(..., { message }) error text matches BL-065 forcing-function shape; 3 new unit tests assert SDK-surfaced ZodError carries the actionable correction) | BL-070 RESCOPED: June 5, 2026 (originally server-derived irlBodyHash; opus-4-8 honesty disclosure revealed xlsx-reconstruction makes hash-bind tautological — model controls both sides; rescoped to requireVerbatimBody prompt-arg flag; the structural fix is the deferred xlsx-canonicalization design at MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md) | BL-071 RESERVED: June 5, 2026 (server-sourced toolCallCounts from withToolMetrics — two model tiers showed VERIFY-block self-report drift but not yet structurally blocking) | BL-072 filed OPEN→CLOSED: June 5-6, 2026 (auto-inject provenance-gap entry when irlSource=model-reconstruction-\* — converts opus-4-8 honesty disclosure from one-off model-grace into a structural artifact every xlsx run carries; new required `irlSource` field on ComposeDossierEnvelopeInputSchema with explicit-Set auto-append guard; prompt body 0.12.0→0.13.0 instructs the model to populate the field in both one-shot and interactive modes; shipped at mcp-server 0.26.0 bundled with BL-067; manifest hash + 3 of 9 body hashes rebaselined per the prompt directive change; structural xlsx-canonicalization fix remains deferred per BL-049 cross-host topology blocker) | BL-073 + serverVersion→promptVersion rename filed + closed: June 6, 2026 (regulatory-map alias support for 3 empirically-failing frameworks UK GDPR + Australia Privacy Act + EU AI Act — optional aliases field added to RegulationSchema with exact-equality matching on normalized form; HUB_FRAMEWORK_INDEX matcher refactor preserves canonical-substring path verbatim; codegen guard fails build on duplicate aliases; bundled with VERIFY-block YAML field rename serverVersion→promptVersion at both invocation sites with expanded "NOT the mcp-server package version" guidance; shipped at mcp-server 0.27.0; manifest hash + ALL 7 body hashes rebaselined per the prompt rename; promptVersion 0.13.0→0.14.0; in-session integration test proves alias rejection end-to-end without depending on a live exercise)_
