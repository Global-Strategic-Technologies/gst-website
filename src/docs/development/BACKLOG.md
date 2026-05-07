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
7. ⏳ **Soak findings triaged via [BL-032.25](#bl-03225-mcp-revisions-prior-to-go-live)** — all P0 (blocks-Go-Live) items closed with verification evidence; P1 items recorded for post-launch follow-up. New step added 2026-05-06 to formalize the soak → triage → deploy gate
8. ⏳ `wrangler deploy --env production` — gated on soak completion + step 7 closure (~2026-05-13)

---

### BL-032.25: MCP Revisions prior to Go-Live

**Source**: BL-032.25 — bucket for soak-week findings discovered during BL-032 § B.5 (staging soak window 2026-05-06 → ~2026-05-13). Items here are triaged as **P0** (blocks Phase 6 § B.6 production deploy) or **P1** (filed for post-launch follow-up). | **Architecture & plan**: [MCP_SERVER_REMOTE_BL-032_25.md](MCP_SERVER_REMOTE_BL-032_25.md) | **Effort**: variable per-item; total scoped at triage | **Status**: Open — soak in progress | **Depends on**: BL-032 (Phase 6 staging deployed and entered B.5)

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

- [ ] **§ 1 — Schema normalization across Hub Tools** — investigate retiring [BL-031.87](#bl-03187-mcp-server--stage-taxonomy-adapter-layer)'s adapter pattern by normalizing the underlying schemas. **Severity: P1**. Investigation completed 2026-05-06; revised same day after operator clarification that URL backward-compat is NOT a business requirement (see [MCP_SERVER_REMOTE_BL-032_25.md § 1](./MCP_SERVER_REMOTE_BL-032_25.md#§-1--schema-normalization-across-hub-tools-investigation--p1-deferred)). Cost dropped from 3-5 days to 2-3 days with URL-shim work removed; remaining dominant risk is **benchmark re-attribution**. Two-step recommendation: (1) ship B.6 with adapter pattern intact; (2) schedule a 2-4 hour benchmark-audit spike post-launch to determine if collapses (`pre-series-b`, `series_bc`) are by-design (then close § 1 as rejected) or lazy modeling (then graduate § 1 to scheduled normalization with audit + 2-3 day engineering)

**Soak-week additions** (filled as findings emerge):

- [ ] **§ 2** — TBD (next soak finding)

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

**Source**: BL-032.5 — extends Phase 2 surface | **Architecture & plan**: [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) | **Effort**: 3-5 days | **Status**: Open | **Depends on**: BL-031.5, BL-031.75, BL-032

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

- [ ] Worker registers `resources/list` and `resources/read` handlers binding to the same Resource modules as the BL-031.5 stdio entrypoint
- [ ] Per-Resource cache strategy implemented per the strategy table in [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md § Resources](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md#resources--the-design-questions-http-forces): Library + Regulations strong cache (24h), Radar latest weak cache (15min), Radar items strong cache (24h immutable)
- [ ] `Cache-Control`, `ETag`, and `Last-Modified` headers set per Resource; `If-None-Match` requests return `304 Not Modified` when the ETag matches
- [ ] Per-Resource scope check: bearer keys lacking the required scope receive `403 Forbidden` with a structured error and the missing-scope name
- [ ] Periodic radar snapshot refresh: Cloudflare Cron trigger every hour calls `fetchAllStreams` + `fetchAnnotatedItems`, transforms, and writes to Upstash
- [ ] Snapshot-missing path returns `503 Service Unavailable` with a structured retry hint (Cron will repopulate within the next interval)

**Prompts over HTTP**

- [ ] Worker registers `prompts/list` and `prompts/get` handlers binding to the same Prompt modules as the BL-031.75 stdio entrypoint
- [ ] `prompts/list` includes each prompt's `version` so clients can detect drift after server upgrades
- [ ] New introspection endpoint `GET /prompts/<name>/scopes` returns the prompt's required scope set (derived from its `orchestrates: [...]` field) so clients can pre-flight against their key
- [ ] Per-key burst allowance configured to accommodate the heaviest prompt fan-out (4 Tool calls in `gst_target_quick_look`) without false 429 from a fresh-quota state
- [ ] New aggregate metric `prompt_invocations_total` (incremented per `prompts/get`, independent of downstream Tool fan-out) — observable via BL-032.75 dashboards

**Scope catalog (forward-compatible with BL-033)**

- [ ] Scope strings defined per the catalog table in [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md § Scope catalog](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md#critical-cross-cutting-decisions): `tool:<name>`, `tool:radar:*`, `resource:library:read`, `resource:regulations:read`, `resource:radar:read`, `prompt:*`
- [ ] Scope catalog implemented in `mcp-server/src/auth/scopes.ts` as the single source of truth; BL-033 reuses these strings unchanged via OAuth tokens
- [ ] `wrangler secret`-issued internal keys carry the full scope set by default (per-key scope variation is BL-033's product surface; the infrastructure is in place here)

**URI / prompt-name stability discipline**

- [ ] URI-stability test extended to run against both stdio and HTTP transports (`unstable_dev` from `wrangler`); identical resource manifests required
- [ ] `mcp-server/BREAKING_CHANGES.md` introduced; CI test fails if a URI or prompt name changes without a corresponding entry AND a `version` bump in `mcp-server/package.json`
- [ ] On first deploy after a breaking change, server emits a `notifications/message` push to all connected clients describing the change

**Verification & docs**

- [ ] [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) updated with any deviations made during implementation
- [ ] `mcp-server/README.md` extended with: Resources-over-HTTP example (curl + ETag round-trip), Prompts-over-HTTP example, scope-failure example
- [ ] Vitest tests cover: cache-header correctness per Resource, scope-gating per Resource and per Prompt, snapshot-missing path returns 503 not 500, URI manifest stability across transports, breaking-change discipline
- [ ] Worker integration test using `unstable_dev` exercises a complete prompt fan-out (`gst_target_quick_look` → 4 downstream Tool calls) under a realistic per-key budget
- [ ] One-week post-deploy review: cache hit rate, Inoreader budget burn, zero 429s confirmed

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

### BL-032.75: MCP Server — Production Observability Maturity

**Source**: BL-032.75 — extends Phase 2 substrate | **Architecture & plan**: [MCP_SERVER_OBSERVABILITY_BL-032_75.md](MCP_SERVER_OBSERVABILITY_BL-032_75.md) | **Effort**: 1 sprint engineering + 10-14 day baselining window | **Status**: Open | **Depends on**: BL-032 (BL-032.5 strongly preferred for full surface coverage)

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

### BL-033: MCP Server — External Pilot (Phase 3)

**Source**: MCP_SERVER_INITIATIVE.md (archived) | **Effort**: 2 weeks engineering + indeterminate legal/sales lead time | **Status**: Open | **Depends on**: BL-032

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
- **Costs**: ~2 weeks engineering for the runtime + ongoing hosting (~$50–200/month for R2 storage, Workers paid tier, Upstash, Cloudflare Access per-user) + indeterminate legal review (NDA / DPA / SLA template — front-loaded, amortized across pilots)
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
- [ ] Portfolio per-tool `CONTRACT.md` and `USAGE.md` — Portfolio Search is `⏳ Backlog` in the contracts registry. The `mcp-server/README.md` Tools table links to `mcp-server/src/docs/portfolio/CONTRACT.md`, but the directory does not exist (broken link, pre-dates BL-031.75 and surfaced again during its closure audit). The `search_portfolio` / `list_portfolio_facets` ↔ `gst_comparable_engagements_memo` / `gst_diligence_handoff_memo` cross-reference is currently only discoverable via the README's Prompts table — authoring the missing CONTRACT.md (or dropping the tool from the registry) would close the loop. Decide at end-of-sequence whether to author the docs or drop the tool from the registry; either path resolves the broken link
- [x] **DONE 2026-05-02 (BL-031.95 Phase 3.B)**: `search_radar_cache` `CONTRACT.md` authored at `mcp-server/src/docs/radar/CONTRACT.md` as part of BL-031.95 Phase 3 closure. Mirrors the website's single-filter surface (`category` only); documents the capability-mirror invariant explicitly so the future live `search_radar` (BL-032) inherits the same discipline. Earlier framing — "planned alongside live BL-032" — was wrong: the cached tool earns its own contract because it has its own user-facing semantics, and the live tool will get its own contract that compares/contrasts with this one
- [ ] **Contract-parity Vitest** (filed from BL-031.85 closure, 2026-05-02) — structural test that walks every per-tool `mcp-server/src/docs/<tool>/CONTRACT.md`, parses the option-ID tables, and asserts each ID exists in the matching `*_IDS` tuple in the corresponding `src/schemas/<tool>.ts`. Hardens the "discipline is conventional" risk noted in [`MCP_SERVER_CONTRACTS_BL-031_85.md`](MCP_SERVER_CONTRACTS_BL-031_85.md) § Risks. ~1 hr / ~60 LOC. Schedule independently if drift surveillance becomes a maintenance pain point — not a blocker today. **Bundle hint**: pair with the YAML frontmatter item below; both want a small contract-metadata parser, and shipping them in one commit avoids duplicating the parsing scaffolding
- [ ] **YAML frontmatter on each `CONTRACT.md`** (filed from BL-031.85 closure, 2026-05-02) — promote the prose `Version: v1 \| Last authored: <date>` line in each per-tool CONTRACT.md to YAML frontmatter (`---\nversion: v1\nlastAuthored: 2026-04-27\nschema: src/schemas/<tool>.ts\n---`). Enables (a) the contract-parity test above to extract metadata structurally, (b) future IRL generator consumption, (c) a contract-staleness Vitest analogous to the BL-031.75 prompt-staleness pattern (`prompts.test.ts`). ~30 min mechanical edit across 5 contracts. Bundle with the parity test when scheduled
- [ ] **IRL generator scoping spike** (filed from BL-031.85 closure, 2026-05-02) — Information Request List generator was named in [`MCP_SERVER_CONTRACTS_BL-031_85.md`](MCP_SERVER_CONTRACTS_BL-031_85.md) as the strategic destination of the contracts pattern. With 5 contracts now stable (and a 6th canonical-stage-aware layer landing under [BL-031.87](#bl-03187-mcp-server--stage-taxonomy-adapter-layer)), the contracts have enough variance for a 2-3 hr scoping spike: pick a concrete consumer use case (likely "external diligence prep for offline analyst preparing inputs in advance of a kickoff call"), define the rendering format (likely JSON Schema generated from each CONTRACT.md plus the YAML frontmatter once landed), validate the offline-submission mechanism. **Graduation note**: this is a placeholder for an initiative, not a BL-034 cleanup item. Once the spike produces concrete scope, file as a new BL number (suggested: BL-031.97 or BL-038) and remove this bullet. Keeping it here so the proximate-opportunity capture isn't lost between initiatives
- [x] **DONE 2026-04-29**: deleted `MCP_SERVER_HUB_SURFACE_BL-031_5_Verification.md`. Recorded evidence migrated to [`mcp-server/README.md` § Smoke test](../../../mcp-server/README.md#smoke-test-manual-parity-check); UX findings logged in this BL-034 list above; doc history reachable via `git log`. The pattern (transitional punch-list doc → migrate to README → delete) is reusable for future MCP initiatives that ship code-complete with deferred verification
- [ ] **Wizard / API symmetry follow-up** (discovered during BL-031.5 V1 verification trial 1): the ICG MCP API accepts sparse `answers` maps that the website wizard cannot produce (the wizard forces an answer for every question). Documented in [`icg/CONTRACT.md`](../../../mcp-server/src/docs/icg/CONTRACT.md) hidden-semantics section as intentional asymmetry. Decide at end-of-sequence whether to (a) keep as-is and rely on the doc, (b) add an `answeredCount`-based result-confidence indicator to the API output, or (c) require the API to receive all questions (matching wizard discipline). Same audit needed for `compute_techpar` (`null` return when arr/infraHosting are 0 — wizard handles this differently) and any other tool where API and wizard input completeness rules differ
- [ ] **TechPar `exitMultiple` UX gap** (discovered during BL-031.5 V2 verification trial 1): the wizard's exit-multiple input is conditionally rendered — only visible when stage is `pe` or `enterprise` (see [`techpar-ui.ts:65-67`](../../../src/utils/techpar-ui.ts#L65-L67)). At earlier stages (Seed / Series A / Series B–C) the field is hidden, but its underlying state value persists across stage changes — meaning a user who set it to (e.g.) 15× while on Enterprise and then switched to Series B–C silently carries that 15× value into their results, the URL state, and any downstream calculations, with no UI to inspect or modify. Decide at end-of-sequence whether to (a) reset `exitMultiple` to its default when stage drops below PE, (b) show the field at all stages with stage-appropriate guidance, (c) add a "current state" inspection panel that exposes hidden values, or (d) document the behavior as intentional. Note: in scenarios where `gap.cumulative36 = 0`, the exit-multiple value has no observable output impact — but in scenarios where cumulative excess is non-zero, the silent persistence directly affects `gap.exitValue`
- [ ] **Tech Debt direct-input quantization bug** (discovered during BL-031.5 V3 verification): the wizard exposes number-input fields next to the sliders (data-direct="arr", "budget", "salary", etc.) that LOOK like free-text entry but silently quantize the user's typed value to the nearest slider position. Specifically, [`tech-debt-calculator/index.astro:1697-1714`](../../../src/pages/hub/tools/tech-debt-calculator/index.astro#L1697-L1714) — the `arr` handler does `state.arrPos = arrToPos(clamped)` and the next `render()` call computes `posToArr(state.arrPos)`, which round-trips the user's value through the slider's coarse $100K granularity (so $10,000,000 becomes $10,300,000). Same pattern for the `budget` handler ($500K becomes $522K via $1K slider granularity) and `salary` handler. The numeric input field is misleading — it suggests precision the engine can't honor through the slider domain. Decide at end-of-sequence whether to (a) make the direct inputs truly free-form by storing raw values in state and only using slider position for the slider's display, (b) add a visible "snapped to nearest slider stop" indicator after the user types, (c) increase slider granularity (more positions, finer steps), or (d) remove the number-input fields and document sliders as the only input path. Option (a) is the cleanest — it would also resolve the corresponding MCP-vs-wizard parity friction (the MCP API accepts truly raw values; matching that on the wizard side eliminates surprise)
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

### BL-036: MCP Server — `gst_vdr_audit` Quality Maturity Roadmap (Tiers 2–6)

**Source**: BL-036 — surfaces the substantive critique recorded during BL-031.75 V5 sign-off (`gst_vdr_audit` produces structured output but operates on weak input signal — folder names alone — so most of the deliverable is the canonical taxonomy elaborated against training, not contents-grounded audit). | **Effort**: 1-3 weeks engineering across the five tiers (each is independently shippable) | **Status**: Open · Tier 1 (file-list input) shipped in the BL-031.75 V5 sign-off commit | **Depends on**: BL-031.75 (closed); some tiers depend on BL-031.95 (URL state) and on portfolio search

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

_Created: April 18, 2026 | Last pruned: April 24, 2026_
