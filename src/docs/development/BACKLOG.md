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
- [ ] **Regional latency assessment + remediation** — BL-032 soak measured Upstash REST RTT from a GRU-region operator at ~250ms, which means non-radar warm calls land at p95 ~930ms (vs the playbook's <200ms target) and `/health` at p95 ~414ms (vs <150ms target). Code is fine; transcontinental Upstash hops dominate. Before the SLA below is contractually committed, measure latency from each pilot client's region and choose remediation: (a) move the MCP Upstash DB to a region closer to the pilot consumer base, (b) add a Cloudflare KV layer that replicates globally and reduces Upstash hits to once per region per TTL window, or (c) set the SLA region-aware ("p95 <500ms when Worker and Upstash are co-regional; <1.2s otherwise"). Evidence: [T.H.4](./_archive/BL-032_TESTING_FINDINGS.md#th4--radar-warm-cache-hit), [T.H.6](./_archive/BL-032_TESTING_FINDINGS.md#th6--health-latency-budget). **Progress 2026-07-23 (BL-033 Slice 1)**: the measurement machinery now exists — `mcp-server/scripts/probe-latency.mjs` (client-observed p50/p95 per surface, region-labeled, runnable from any machine) + the scheduled `latency-probe.yml` workflow producing a continuous US-region baseline (see [LATENCY_PROBE.md](../../../mcp-server/src/docs/operations/LATENCY_PROBE.md)). Still open: per-pilot-region runs (needs known pilot regions) and the (a)/(b)/(c) remediation decision itself.
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
