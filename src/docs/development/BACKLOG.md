# Development Backlog

Consolidated backlog of open development initiatives for the GST website. Each item is a self-contained user story with enough context to design and implement a solution. Items are grouped by theme, not priority — triage happens separately.

> **Completed and closed items**: 31 items were completed or closed through April 2026 (BL-002, 003, 008–019, 021–026, 027–030, 034, 036–041). Use `git log` to find their original acceptance criteria and technical context.

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

**Source**: MCP_SERVER_INITIATIVE.md (archived) | **Architecture & plan**: [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) | **Effort**: 1-2 days | **Status**: Open

**As a** GST team member, **I want** a local MCP server exposing the diligence engine and portfolio search **so that** I can query GST's tools from Claude Desktop and Claude Code without opening the website.

> **Implementation plan**: see [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — covers MCP architecture introduction, repo-placement and lifecycle decisions, the Phase 1 file layout and tool surface, and verification steps. Note: that document supersedes the `@modelcontextprotocol/sdk` package reference in the acceptance criteria below — current canonical SDK is the v2 split-package family (`@modelcontextprotocol/server` + companions).

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
- **Zero incremental cost**: uses existing infrastructure (no new SaaS, no new dependencies beyond `@modelcontextprotocol/sdk`) — this is a 1-2 day spend that unlocks the rest of the MCP roadmap

#### Acceptance Criteria

**Server scaffolding**

- [ ] New workspace directory `mcp-server/` at repo root with its own `package.json`, `tsconfig.json`, and `README.md` — does NOT touch the Astro build
- [ ] Built with `@modelcontextprotocol/sdk` (latest stable) using stdio transport — no HTTP, no auth
- [ ] Single entry point `mcp-server/src/index.ts` compiled to `mcp-server/dist/index.js` via `tsc`; `npm run build` produces a runnable binary
- [ ] Binary declared via `bin` field in `mcp-server/package.json` so it can be invoked as `node /abs/path/to/dist/index.js` from a Claude Desktop / Claude Code config block
- [ ] Tool input schemas declared with **Zod** (already a project dependency) and converted to JSON Schema for MCP via `zod-to-json-schema` or the SDK's helper

**Tools exposed**

- [ ] `generate_diligence_agenda` — wraps `generateScript(inputs)` from [src/utils/diligence-engine.ts](../../utils/diligence-engine.ts)
  - Input schema mirrors `UserInputs` (13 fields: transactionType, productType, techArchetype, headcount, revenueRange, growthStage, companyAge, geographies[], businessModel, scaleIntensity, transformationState, dataSensitivity, operatingModel)
  - Enum values for each field sourced from [src/data/diligence-machine/wizard-config.ts](../../data/diligence-machine/wizard-config.ts) so the schema stays in lockstep with the website wizard
  - Returns the full `GeneratedScript` (topics, attentionAreas, triggerMap, metadata) as MCP `text` content, JSON-stringified
  - Returns a structured MCP error (not a thrown exception) when input fails Zod validation
- [ ] `search_portfolio` — wraps `filterProjects(projects, criteria)` from [src/utils/filterLogic.ts](../../utils/filterLogic.ts)
  - Loads `src/data/ma-portfolio/projects.json` once at server startup (57 projects, validated via existing Zod schema in `src/schemas/portfolio.ts`)
  - Input schema: `{ search?: string, theme?: string, engagement?: string, limit?: number (default 20, max 57) }` — defaults `theme`/`engagement` to `'all'` to match `FilterCriteria` semantics
  - Returns array of matched `Project` objects plus a count summary
  - Optional companion tool `list_portfolio_facets` returning `{ themes: string[], engagementCategories: string[], growthStages: string[], years: number[] }` from the existing `getUnique*` helpers — saves callers a roundtrip when discovering filter values

**Verification & docs**

- [ ] `mcp-server/README.md` documents: install/build steps, JSON config snippets for both Claude Desktop (`claude_desktop_config.json`) and Claude Code (`.mcp.json` or `~/.claude/settings.json` `mcpServers` entry), each tool's input schema with one concrete example invocation
- [ ] Vitest unit tests for the tool handlers using the SDK's in-memory test transport — cover happy path, invalid input rejection, and empty-result cases for both tools
- [ ] Manual smoke test recorded in the README: launch the server, invoke `generate_diligence_agenda` from Claude Desktop with the example payload, confirm a non-empty topic list comes back
- [ ] Repo-root `npm run lint` and `npx astro check` continue to pass (the new directory is excluded from Astro's tsconfig but still linted by the existing flat ESLint config)

#### Technical Context

**Why this is small**

- The two engines are already pure, fully typed, and unit-tested — `generateScript` has zero DOM/Astro/runtime coupling, and `filterProjects` operates on plain JSON. The MCP wrapper is essentially: parse input → call function → JSON-stringify output.
- Zod is already in `dependencies`. The source-of-truth schemas in `src/schemas/` (portfolio, diligence) can be re-imported by the MCP server via a relative path, so the input shapes can never drift from what the website renders.

**File layout**

```
mcp-server/
├── package.json          # type: module, bin entry, depends on @modelcontextprotocol/sdk + zod
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
- **Dataset growth**: `projects.json` is loaded once at boot; this is fine at 57 projects but the README should call out that growth past ~1000 records would warrant a streaming or paginated response
- **Path-resolution under stdio**: when Claude Desktop spawns the server its `cwd` is the user's home dir, not the repo. Resolve `projects.json` via `import.meta.url` / `fileURLToPath`, not `process.cwd()`

**Validation sequence before marking done**

1. `cd mcp-server && npm run build && npm test` — green
2. From repo root: `npm run lint && npx astro check && npm run test:run` — still green (no regression in main project)
3. Add the local server to `claude_desktop_config.json`, restart Claude Desktop, confirm tools appear in the tool list
4. Invoke each tool with the README's example payload, confirm a sensible response
5. Invoke `generate_diligence_agenda` with a deliberately invalid `transactionType` (e.g. `"foo"`), confirm a clean MCP error rather than a stack trace

---

### BL-031.5: MCP Server — Hub Surface Extension

**Source**: BL-031.5 — extends Phase 1 surface | **Architecture & plan**: [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) | **Effort**: 3-5 days | **Status**: Open | **Depends on**: BL-031

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

- [ ] `assess_infrastructure_cost_governance` — wraps the ICG engine; input includes `answers` map and `stage`; output is `{ overall, domainScores[], recommendations[] }`
- [ ] `compute_techpar` — wraps the TechPar engine; input is `TechParInputs`; output is `TechParResult`
- [ ] `estimate_tech_debt_cost` — wraps the Tech Debt engine; **input MUST be raw values** (team size, salary, maintenance burden, deploy frequency) — slider-position helpers stay on the website side
- [ ] `search_regulations` — facet/search across the regulatory-map JSON files; input `{ jurisdiction?, domain?, query?, limit? }`; output includes the resource `uri` for each matched framework
- [ ] `list_regulation_facets` — companion enumerator for `{ jurisdictions[], domains[] }`
- [ ] `search_radar_cache` — local-only equivalent of BL-032's `search_radar`; reads from the seed snapshot ONLY; explicitly named to avoid future collision with the live remote tool

**Resources primitive (new for this initiative)**

- [ ] MCP server registers `resources/list` and `resources/read` handlers
- [ ] Library: `gst://library/business-architectures` and `gst://library/vdr-structure`, `mimeType: text/markdown`, body sourced from a single canonical location (Astro content collection migration preferred; sibling `article.md` acceptable as interim — see [MCP_SERVER_HUB_SURFACE.md § Content-source question](MCP_SERVER_HUB_SURFACE.md#library--articles-that-become-mcp-resources))
- [ ] Regulations: one Resource per framework, URI `gst://regulations/<jurisdiction>/<framework-id>`, `mimeType: application/json` (or `text/markdown` if the framework has a long-form body)
- [ ] Radar: `gst://radar/fyi/latest`, `gst://radar/wire/latest`, `gst://radar/wire/<category>` (one per category), and `gst://radar/item/<itemId>` for each cached item; resource description includes `lastSeededAt`; if seed snapshot is missing, the Resource returns a structured "run `npm run radar:seed`" message
- [ ] **No live Inoreader calls** from any radar-related tool or resource — enforced by a scoped ESLint `no-restricted-imports` rule that prevents `mcp-server/src/` from importing `src/lib/inoreader/client.ts`
- [ ] Resource URI manifest frozen as a Vitest test (`tests/resource-uri-stability.test.ts`); deliberate URI changes require updating the manifest AND bumping `mcp-server/package.json` version

**Verification & docs**

- [ ] [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) updated with any deviations made during implementation
- [ ] `mcp-server/README.md` extended with the new tool and resource catalog plus a "How Resources work in this server" section
- [ ] Vitest tests for each new tool (parity test against the corresponding website engine) and each Resource shape (URI parsing, body retrieval, missing-snapshot graceful failure)
- [ ] Manual parity check recorded in the README: side-by-side outputs of the website wizard vs the MCP tool for ICG, TechPar, Tech Debt, with a representative input set, must match
- [ ] Repo-root `npx astro check && npm run lint && npm run lint:css && npm run test:run` continues to pass

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

**Source**: BL-031.75 — extends Phase 1 surface with Prompts | **Architecture & plan**: [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) | **Effort**: 2-3 days engineering + senior-consultant review time | **Status**: Open | **Depends on**: BL-031, BL-031.5

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
- **Daily radar digest** — `/gst_radar_brief_today { category?, sinceHours? }` summarizes the most recent annotated radar items in GST Take voice from the local snapshot
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

- [ ] MCP server registers `prompts/list` and `prompts/get` handlers via the SDK's `registerPrompt` API
- [ ] All prompts use the `gst_` name prefix (avoids slash-menu collisions with other installed MCP servers); enforced by a regex check in `mcp-server/src/prompts/_registry.ts`
- [ ] Per-prompt module exports a uniform shape: `{ name, description, version, lastReviewedAt, argsSchema, build }` — see [MCP_SERVER_PROMPTS_BL-031_75.md § Per-prompt module shape](MCP_SERVER_PROMPTS_BL-031_75.md#per-prompt-module-shape)
- [ ] Argument schemas re-use (via Zod composition) the same source-of-truth schemas as the Tools the prompt orchestrates — CI test asserts no drift

**Prompt library (8 prompts)**

- [ ] `gst_diligence_kickoff` — wraps `generate_diligence_agenda` Tool + references VDR Library Resource
- [ ] `gst_target_quick_look` — orchestrates ICG + TechPar + Tech Debt + regulatory search Tools
- [ ] `gst_comparable_engagements_memo` — wraps `search_portfolio` + `list_portfolio_facets` Tools
- [ ] `gst_regulatory_exposure_brief` — wraps `search_regulations` Tool + reads regulation Resources by URI
- [ ] `gst_vdr_audit` — references `gst://library/vdr-structure` Resource (interactive: argument-less mode supported)
- [ ] `gst_architecture_layer_review` — references `gst://library/business-architectures` Resource
- [ ] `gst_radar_brief_today` — reads `gst://radar/fyi/latest` Resource (filter by category if supplied)
- [ ] `gst_diligence_handoff_memo` — orchestrates diligence + portfolio Tools + VDR Library Resource

**Verification & docs**

- [ ] [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) updated with any deviations made during implementation
- [ ] `mcp-server/README.md` extended with a "Prompts: GST consultant workflows" section listing every prompt, its arguments, an example invocation, and a sample output
- [ ] Vitest test per prompt asserting: (a) name has `gst_` prefix, (b) `argsSchema` parses a representative payload, (c) `build()` returns at least one message, (d) the message body references the expected Tool/Resource names
- [ ] Prompt-registry invariant tests: every prompt has `version`, `lastReviewedAt` ≤ 12 months old, `orchestrates` field listing each Tool/Resource it invokes — CI fails if any registered Tool/Resource is missing
- [ ] Golden-output snapshots per prompt (at least one representative invocation per prompt) — committed to `mcp-server/tests/examples/*.golden.md`; regression-tested on each Claude model upgrade
- [ ] **Senior-consultant review gate**: each prompt's output on a representative input has been reviewed and signed off by a senior team member as "this reads as if I wrote it." This is a **blocking acceptance criterion**, not a nice-to-have

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

### BL-032: MCP Server — Internal Remote (Phase 2)

**Source**: MCP_SERVER_INITIATIVE.md (archived) | **Effort**: 1 week | **Status**: Open | **Depends on**: BL-031

**As a** GST team member, **I want** the MCP server deployed to a remote endpoint **so that** I can access GST tools from any machine — laptop, mobile Claude apps, ephemeral CI agents — without cloning the repo or running a local process.

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

- [ ] MCP server deployed to **Cloudflare Workers** (rationale below) at a stable subdomain such as `mcp.globalstrategic.tech`
- [ ] **Streamable HTTP transport** (not the deprecated SSE-only transport) — required for compatibility with Claude Desktop, Claude Code, mobile clients, and ChatGPT's MCP support
- [ ] Worker built with `wrangler` and `@modelcontextprotocol/sdk`; `mcp-server/` workspace from BL-031 grows a second entrypoint `src/worker.ts` that registers the same tools but binds them to the HTTP transport
- [ ] Tool registry is shared between stdio (BL-031) and HTTP (BL-032) entrypoints — register-once, transport-twice; CI guarantees they stay in sync
- [ ] CORS headers restricted to known MCP client origins (`claude.ai`, `chatgpt.com`, `cursor.sh`, etc.) — no `Access-Control-Allow-Origin: *`

**Authentication**

- [ ] **Bearer-token API key auth** — simplest scheme that keeps the bar above zero; OAuth deferred to BL-033
- [ ] Keys generated via `wrangler secret` (one secret per team member, named `MCP_KEY_<INITIALS>`); revocation = `wrangler secret delete`
- [ ] Server returns MCP-spec-compliant `401 Unauthorized` with `WWW-Authenticate` header when key is missing/invalid
- [ ] Key prefix logged on every request (e.g. `key=rp_...`) for attribution, full key never logged
- [ ] README documents the Claude Desktop / Claude Code config snippet including the `Authorization: Bearer <key>` header

**Rate limiting (critical — Inoreader has a 200 req/day cap)**

- [ ] Sliding-window rate limiter backed by **Upstash Redis** (already in use for radar token persistence — see [src/docs/hub/RADAR.md](../hub/RADAR.md#upstash-redis-persistence))
- [ ] Per-key limits: 60 req/min and 1000 req/day for non-radar tools; **5 req/min and 50 req/day for radar tools** (Inoreader budget is shared with the live site's ISR which already consumes ~28 calls/day)
- [ ] Global circuit breaker: if Inoreader returns 429, all radar tool calls return cached results for 6h before retrying — same window the website ISR uses
- [ ] Standard `RateLimit-*` response headers (RFC 9331) so clients can self-throttle
- [ ] Rate-limit decisions emit a structured log entry; threshold breaches surface in observability (see below)

**New tools (radar surface)**

- [ ] `search_radar` — full-text search over the unified Wire+FYI feed
  - Wraps `fetchAllStreams('GST-', N)` + `fetchAnnotatedItems(N)` from [src/lib/inoreader/client.ts](../../lib/inoreader/client.ts) and the merge logic from `src/lib/inoreader/transform.ts`
  - Input: `{ query?: string, category?: 'pe-ma' | 'enterprise-tech' | 'ai-automation' | 'security', tier?: 'wire' | 'fyi' | 'both', limit?: number (default 20, max 50), since?: ISO-8601 timestamp }`
  - Returns matched items with title, source, publishedAt, category, url, and (for FYI items) the highlight + GST Take
  - Results MUST go through the same 6h ISR-style cache as the website to share the API budget — implement via Upstash Redis with the radar client's existing `buildCacheKey()` strategy
- [ ] `get_latest_insights` — convenience wrapper returning the N most recent FYI items (the high-signal annotated tier)
  - Input: `{ limit?: number (default 10, max 30), category?: string }`
  - Returns FYI items sorted by `annotatedAt` descending — the same shape `RadarFeed.astro` renders
- [ ] Both new tools share a single Inoreader-client instance per worker invocation; tokens read from Upstash Redis using the existing token-resolution chain (in-memory → Redis → env vars)

**Observability**

- [ ] Every tool invocation logged as a structured JSON line: `{ timestamp, keyPrefix, tool, durationMs, success, errorCode? }` — no input/output payloads (those are reserved for BL-033's compliance audit log)
- [ ] Logs flow to Cloudflare's `tail`-able stream and are also pushed to Sentry (already configured for the site — see [src/docs/development/SENTRY_MANUAL_SETUP.md](./SENTRY_MANUAL_SETUP.md))
- [ ] Health endpoint `GET /health` returns `{ ok: true, version, gitSha, redis: 'ok' | 'degraded', inoreader: 'ok' | 'degraded' }` — uncached, no auth required
- [ ] Wrangler `wrangler tail` documented in README for live-tailing during incidents

**Verification & docs**

- [ ] `mcp-server/README.md` extended with: Cloudflare Worker deploy command, secret-management workflow, two example client configurations (Claude Desktop with HTTP transport, Claude Code), curl-based health-check command
- [ ] Vitest test suite includes: auth happy/missing/wrong-key paths, rate-limit enforcement, radar tool end-to-end with mocked Inoreader responses (reuse `tests/e2e/fixtures/radar-mock-data.ts`)
- [ ] Worker integration test using `unstable_dev` from `wrangler` exercises the HTTP transport against the in-memory MCP test client
- [ ] `wrangler.toml` checked into `mcp-server/`; production secrets never committed
- [ ] One-week post-deploy review: pull rate-limit metrics, confirm no Inoreader 429s, confirm at least one team member used it from a non-dev machine

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

1. `cd mcp-server && npm test` — green (includes new auth + rate-limit + radar tool tests)
2. `wrangler deploy --env staging` — Worker deploys without errors
3. `curl https://mcp-staging.globalstrategic.tech/health` returns `{ ok: true, ... }` with both Redis and Inoreader checks passing
4. `curl -H "Authorization: Bearer <key>" ...` against the streamable HTTP transport returns the tool list including the two new radar tools
5. From Claude Desktop pointed at staging: invoke `search_radar { query: "kubernetes" }`, confirm results return in <2s and a corresponding log entry appears in `wrangler tail`
6. Hammer the staging endpoint with 100 requests in 60s → confirm rate limiter returns 429 with `RateLimit-*` headers after the threshold
7. `wrangler deploy --env production` only after all six steps pass on staging

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

_Created: April 18, 2026 | Last pruned: April 24, 2026_
