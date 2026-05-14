# MCP Server — OpenClaw Integration Handover (BL-032.6)

> **Audience**: implementing team building the **OpenClaw multi-agent integration** against the GST MCP server (BL-032.6 scenarios 3 + 5 per [`MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md`](./MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md)).
>
> **Purpose**: a self-contained technical reference covering everything the OpenClaw team needs to connect, authenticate, discover the capability surface, and orchestrate GST consultant workflows from OpenClaw agents — without requiring them to read the full BL-032 architecture corpus.
>
> **Scope**: this is an _integration_ handover, not a substrate design doc. Where deeper detail is needed (OAuth refresh internals, Cron substrate, manifest-hash discipline, etc.), this doc points at the canonical references in [`mcp-server/src/docs/`](../../../mcp-server/src/docs/) rather than duplicating them.
>
> **Authored**: 2026-05-13 alongside the BL-032.6 spec lockdown (Rev 7).
>
> **Companion docs (canonical, in order of usefulness for OpenClaw work)**:
>
> - [`mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) — generic remote-client setup (Claude Desktop, Cursor, ChatGPT). OpenClaw config is analogous; differences flagged in § 1 below
> - [`mcp-server/src/docs/operations/AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md) — bearer-key model, scope catalog (BL-032.5)
> - [`mcp-server/src/docs/operations/RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md) — per-key budgets, RFC 9331 response headers, circuit-breaker semantics
> - [`mcp-server/src/docs/radar/USAGE_REMOTE.md`](../../../mcp-server/src/docs/radar/USAGE_REMOTE.md) — radar tool walkthrough with cache-hit semantics
> - [`mcp-server/src/docs/prompts/README.md`](../../../mcp-server/src/docs/prompts/README.md) — registered-prompt architecture (how `gst_*` prompts work mechanically)
> - [`mcp-server/src/docs/radar/CONTRACT.md`](../../../mcp-server/src/docs/radar/CONTRACT.md) — radar Tools input/output schema
> - [`MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md`](./MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md) — the demo design this implementation supports

---

## 1. Connection setup — endpoint, transport, auth

### 1.1 Public endpoint

The GST MCP server has two deployed environments, both with custom domains over Cloudflare Workers:

| Environment                           | Endpoint URL                                   | When to use                                                                       |
| ------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| **Staging** (BL-032.6 work uses this) | `https://mcp-staging.globalstrategic.tech/mcp` | All OpenClaw integration work, demo dry-runs, soak testing                        |
| Production                            | `https://mcp.globalstrategic.tech/mcp`         | Live demo day (after staging integration is validated); pilot clients post-BL-033 |

**Health-check endpoint** (uncached, no auth required, returns JSON):

```
GET https://mcp-staging.globalstrategic.tech/health
```

Useful for: connectivity smoke tests, verifying the substrate is responding, checking radar snapshot freshness via `radarSnapshotAgeSeconds` (BL-032.5 Phase 4 deliverable).

### 1.2 Transport model — Streamable HTTP

The MCP server uses **Streamable HTTP** (MCP spec's evolution of SSE), implemented via Cloudflare's `agents/mcp` package on the Worker side. This is the same transport class that OpenClaw [documents native support for](https://docs.openclaw.ai/cli/mcp) ("HTTP streaming for bidirectional communication with remote MCP servers").

Key transport facts for OpenClaw integration:

- **POST `/mcp`** is the JSON-RPC ingress; responses stream back as Server-Sent Events (`event: message\ndata: {...}\n\n`)
- **No persistent socket** — each request is a discrete HTTP POST; statefulness lives client-side
- **Bearer auth via HTTP header** — no OAuth flow yet (BL-033 is when that ships)
- **CORS-enabled** for browser-based clients; not relevant to OpenClaw's server-side runtime but documented for completeness

### 1.3 Authentication — private shared bearer tokens

The GST MCP server uses **per-operator bearer tokens** issued by initials. The OpenClaw team will be issued a private shared token for their use:

```
MCP_KEY_<INITIALS>
```

Example existing keys (illustrative; not actual values): `MCP_KEY_RP` (operator Reid Peryam), `MCP_KEY_WM` (operator W. Mendes), etc.

**Process for the OpenClaw team to receive a key**:

1. OpenClaw integrator confirms a 2-letter initials code with the GST operator (RP); avoid collisions with existing keys
2. GST operator issues the key via `wrangler secret put MCP_KEY_<INITIALS> --env staging` (and `--env production` later if/when applicable)
3. Key value is delivered out-of-band via the team's agreed secure channel (1Password share, encrypted message, etc.) — **never via email plaintext, never in this repo**
4. OpenClaw integrator stores the value in their team's password manager + injects into OpenClaw's per-server config at runtime

**Authorization header shape** for every MCP request (post-handshake):

```
Authorization: Bearer [TO_BE_PROVIDED_BY_GST_OPERATOR]
```

Wrong/missing token → HTTP 401 with a JSON-RPC error envelope. Empty `Bearer ` (with trailing space) is explicitly handled (BL-032.25 close-out — see [`mcp-server/src/auth/bearer.ts`](../../../mcp-server/src/auth/bearer.ts)).

> **Key rotation note**: per the BL-032 Q11 model, keys are rotated on a 90-day cadence OR immediately on suspected compromise. The OpenClaw team will be notified of any rotation with ≥ 7 days lead time. See [`AUTH.md` § Rotate a key](../../../mcp-server/src/docs/operations/AUTH.md) for the rotation process.

### 1.4 OpenClaw configuration

The canonical command per [OpenClaw's MCP documentation](https://docs.openclaw.ai/cli/mcp):

```bash
openclaw mcp set gst-mcp '{
  "transport": "streamable-http",
  "url": "https://mcp-staging.globalstrategic.tech/mcp",
  "headers": {
    "Authorization": "Bearer [TO_BE_PROVIDED]"
  }
}'
```

After registration, verify discovery:

```bash
openclaw mcp inspect gst-mcp
```

Expected output: surface enumeration showing **12+ Tools, 6 Resources (radar URIs), 120+ Resources (regulations), 2 Resources (Library), 8 Prompts**. If any of these are missing, the connector handshake didn't complete — check the bearer header + URL + `wrangler tail --env staging` for server-side rejection logs.

### 1.5 First request smoke test

Before wiring up agents, validate the connection with a raw curl:

```bash
curl -s -X POST https://mcp-staging.globalstrategic.tech/mcp \
  -H "Authorization: Bearer [TO_BE_PROVIDED]" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: SSE response with a `data:` line containing a JSON-RPC envelope listing all available tools. If you get HTTP 401, the bearer is wrong/missing. If you get HTTP 200 with no `data:` line, the transport handshake hit a layer below the application code (rare — likely a Cloudflare-edge issue; check `/health` first).

---

## 2. Capability inventory — what the MCP server exposes

The GST MCP server provides three distinct capability classes per the [MCP specification](https://spec.modelcontextprotocol.io/):

### 2.0 Known consumer compatibility — read first

**OpenClaw's MCP client consumes Tools ONLY — neither Prompts nor Resources are supported.** The OpenClaw client tooling (`mcporter`) implements `tools/list`+`tools/call`, but does NOT implement `prompts/*` or `resources/*` JSON-RPC methods. This was confirmed empirically during BL-032.6 scenario-5 wiring (see DEMO doc Rev 10). Earlier desk research had suggested mcporter 0.10.0+ supported Resources; hands-on integration proved otherwise. Two upstream feature requests asking for full primitive parity were filed and closed stale ([openclaw#8188](https://github.com/openclaw/openclaw/issues/8188), [openclaw#29053](https://github.com/openclaw/openclaw/issues/29053)).

**What this means for OpenClaw agent design**:

- ✅ **Tools** in § 2.1 — fully consumable; invoke via `mcporter call gst-mcp.<tool_name>` or natively from agent context
- ❌ **Resources** in § 2.3 — **not consumable** from OpenClaw. To get equivalent content, call the structured-query Tool family (e.g. `search_regulations({ jurisdiction: '...' })` returns the same canonical content the `gst://regulations/<jurisdiction>/<framework>` Resource would have served, just as a structured response instead of a pinnable URI).
- ❌ **Prompts** in § 2.2 — **not invokable** from OpenClaw. The 8 `gst_*` Prompts are server-side templates that an OpenClaw agent cannot call directly.

**Workaround: Tools-only system-prompt composition**. Each `gst_*` Prompt's `orchestrates: [...]` manifest lists the Tools + Resources it expects the model to use. An OpenClaw agent reproduces the workflow by composing the corresponding Tool calls in its own system prompt — and substituting `tools/call` for any `resources/read` the Prompt would have orchestrated. Example: instead of invoking `gst_regulatory_exposure_brief` (which would pin `gst://regulations/*` Resources), an OpenClaw agent calls `search_regulations({ jurisdiction: 'eu' })`, then `search_regulations({ jurisdiction: 'us-ca' })`, etc., and synthesizes the cross-jurisdictional matrix from the tool responses. The Prompt source files in § 2.2 remain the canonical reference for _what_ each workflow does — read the `build()` function and translate its instructions into agent system-prompt language using Tools-only invocations.

**Optional operator-side shim**: a Prompt-as-Tool wrapper (`composeBrief(args) → { messages: [...] }`) is technically possible and would let an OpenClaw agent invoke a Prompt-equivalent workflow via a single `tools/call`. Not currently shipped; ask for `MCP_KEY_OC`-level work prioritization if needed.

**For prompt-orchestrated AND Resource-pinning workflows**, Claude Desktop remains the better surface — its MCP client implements all three primitives. BL-032.6 reflects this: scenarios 1 (Prompts), 2 (Resources), and 4 (everything) route through Claude Desktop; scenarios 3 and 5 (Tools-only) route through OpenClaw. The Tools-only constraint is actually a portability feature for scenario 5: Tools is the lowest-common-denominator MCP primitive that every client supports today, so the agent design ports unchanged to any other agent framework.

### 2.1 Tools (12+) — single-purpose pure-engine callables

Tools are stateless, typed function calls. Each Tool has a Zod-defined input schema and returns structured JSON. Useful when an agent needs to **invoke a specific engine** with concrete inputs.

| Tool name                               | Source file                                                                               | Purpose                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `search_portfolio`                      | [`mcp-server/src/tools/portfolio.ts`](../../../mcp-server/src/tools/portfolio.ts)         | Search the GST M&A portfolio (57 anonymized engagements) by industry/theme/stage/year                  |
| `list_portfolio_facets`                 | [`mcp-server/src/tools/portfolio.ts`](../../../mcp-server/src/tools/portfolio.ts)         | Discover available filter dimensions (themes, engagement categories, growth stages, years)             |
| `search_radar`                          | [`mcp-server/src/tools/radar-live.ts`](../../../mcp-server/src/tools/radar-live.ts)       | Live market-intelligence search across radar Wire (broad) + FYI (curated) tiers                        |
| `get_latest_insights`                   | [`mcp-server/src/tools/radar-live.ts`](../../../mcp-server/src/tools/radar-live.ts)       | Most-recent FYI items only (convenience surface for daily briefings)                                   |
| `search_radar_cache`                    | [`mcp-server/src/tools/radar-live.ts`](../../../mcp-server/src/tools/radar-live.ts)       | Cache-only fast path; never hits Inoreader. Returns `null` on cache miss instead of fetching           |
| `search_regulations`                    | [`mcp-server/src/tools/regulations.ts`](../../../mcp-server/src/tools/regulations.ts)     | Search the 120-framework regulatory corpus by jurisdiction/sector/keyword                              |
| `list_regulation_facets`                | [`mcp-server/src/tools/regulations.ts`](../../../mcp-server/src/tools/regulations.ts)     | Discover regulation taxonomy dimensions                                                                |
| `assess_infrastructure_cost_governance` | [`mcp-server/src/tools/icg.ts`](../../../mcp-server/src/tools/icg.ts)                     | ICG framework assessment — produces recommendations across 20 domains                                  |
| `compute_techpar`                       | [`mcp-server/src/tools/techpar.ts`](../../../mcp-server/src/tools/techpar.ts)             | Technology paradigm assessment for a target's stack                                                    |
| `estimate_tech_debt_cost`               | [`mcp-server/src/tools/tech-debt.ts`](../../../mcp-server/src/tools/tech-debt.ts)         | Tech-debt cost estimation given architecture inputs                                                    |
| `generate_diligence_agenda`             | [`mcp-server/src/tools/diligence.ts`](../../../mcp-server/src/tools/diligence.ts)         | Generate a topic-grouped due-diligence agenda from 13 typed dimensions                                 |
| `search_radar_offline`                  | [`mcp-server/src/tools/radar-offline.ts`](../../../mcp-server/src/tools/radar-offline.ts) | **stdio-only** — local snapshot fallback when remote/Inoreader unavailable. Not exposed on the Worker. |

Each Tool's input/output contract is documented in `mcp-server/src/docs/<tool-family>/CONTRACT.md` (e.g., [`portfolio/CONTRACT.md`](../../../mcp-server/src/docs/portfolio/CONTRACT.md), [`radar/CONTRACT.md`](../../../mcp-server/src/docs/radar/CONTRACT.md)).

### 2.2 Prompts (8) — versioned consultant workflows

> ⚠️ **Not directly consumable by OpenClaw** — see § 2.0. The 8 `gst_*` Prompts below are the canonical reference for the consultant workflows an OpenClaw agent should _replicate_ via system-prompt composition. Treat this section as the "what each named workflow does" specification — read each Prompt's `build()` function in the linked source file and translate its instructions into your agent's system prompt.

Prompts are **typed, versioned macros** that orchestrate one or more Tools and Resources in a specific consultant-workflow sequence. Each prompt has an `argsSchema` (Zod-validated input form), a `build(args)` function that generates the prompt template, and an `orchestrates: [...]` manifest declaring which Tools + Resources it expects the model to use.

**See [`mcp-server/src/docs/prompts/README.md`](../../../mcp-server/src/docs/prompts/README.md) for the full architecture.** Quick inventory:

| Prompt name (slash command)       | Internal orchestration                                         | Source file                                                                                                               |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `gst_target_quick_look`           | 4 tools: ICG, TechPar, tech-debt, regulations                  | [`mcp-server/src/prompts/target-quick-look.ts`](../../../mcp-server/src/prompts/target-quick-look.ts)                     |
| `gst_diligence_kickoff`           | `generate_diligence_agenda` + VDR Library Resource             | [`mcp-server/src/prompts/diligence-kickoff.ts`](../../../mcp-server/src/prompts/diligence-kickoff.ts)                     |
| `gst_diligence_handoff_memo`      | `generate_diligence_agenda` + `search_portfolio` + VDR Library | [`mcp-server/src/prompts/diligence-handoff-memo.ts`](../../../mcp-server/src/prompts/diligence-handoff-memo.ts)           |
| `gst_architecture_layer_review`   | `gst://library/business-architectures` Resource                | [`mcp-server/src/prompts/architecture-layer-review.ts`](../../../mcp-server/src/prompts/architecture-layer-review.ts)     |
| `gst_vdr_audit`                   | `gst://library/vdr-structure` Resource                         | [`mcp-server/src/prompts/vdr-audit.ts`](../../../mcp-server/src/prompts/vdr-audit.ts)                                     |
| `gst_radar_brief_today`           | `gst://radar/fyi/latest` Resource                              | [`mcp-server/src/prompts/radar-brief-today.ts`](../../../mcp-server/src/prompts/radar-brief-today.ts)                     |
| `gst_regulatory_exposure_brief`   | `search_regulations` + `gst://regulations/*`                   | [`mcp-server/src/prompts/regulatory-exposure-brief.ts`](../../../mcp-server/src/prompts/regulatory-exposure-brief.ts)     |
| `gst_comparable_engagements_memo` | `search_portfolio` + `list_portfolio_facets`                   | [`mcp-server/src/prompts/comparable-engagements-memo.ts`](../../../mcp-server/src/prompts/comparable-engagements-memo.ts) |

**Why this matters for OpenClaw agent design** (revised given § 2.0 constraint): each Prompt is a **named, versioned consultant workflow specification** that an OpenClaw agent should reproduce via system-prompt composition. The `orchestrates: [...]` manifest is the canonical "which Tools to call in what order" map. Read the source file, lift the Tool sequence + the response-shaping instructions out of `build()`, and bake them into your agent's system prompt. Each Prompt's source file is short (typically <120 LOC) and documents the exact sequence inline.

**BL-032.6 scenario 5 mapping** (cloud-models pivot, per the demo design doc Rev 8): each specialist agent's system prompt composes the same Tool sequence the Prompt would have orchestrated. The Prompt source files remain authoritative for "what the workflow is supposed to do" — they're just consulted at agent-design time rather than invoked at run-time.

- Target-fit agent → composes 4-tool sequence per `gst_target_quick_look` (ICG + TechPar + tech-debt + regulations)
- Comparable-engagements agent → composes 2-tool sequence per `gst_comparable_engagements_memo` (`search_portfolio` + `list_portfolio_facets`)
- Regulatory-exposure agent → composes multi-jurisdiction `search_regulations` Tool sequence per `gst_regulatory_exposure_brief` (one Tool call per jurisdiction the target operates in; Resource pinning of `gst://regulations/*` is NOT used — OpenClaw can't consume Resources, see § 2.0)

### 2.3 Resources (~130 total) — pinnable read-only content

Resources are URI-addressable read-only content. Three families:

#### Library Resources (`gst://library/<slug>`)

GST Library articles — canonical taxonomies and reference content baked into the Worker bundle at build time:

| URI                                    | Content                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `gst://library/vdr-structure`          | The canonical 10-folder VDR taxonomy used by `gst_vdr_audit` and `gst_diligence_kickoff` |
| `gst://library/business-architectures` | Business-architecture taxonomy used by `gst_architecture_layer_review`                   |

#### Regulation Resources (`gst://regulations/<jurisdiction>/<framework>`)

120+ regulatory frameworks across global jurisdictions. URIs follow a hierarchical structure:

- `gst://regulations/eu/gdpr`
- `gst://regulations/us-ca/ccpa`
- `gst://regulations/uk/dpa-2018`
- `gst://regulations/apac/<framework>`
- etc.

Discover the full URI list via `resources/list` on the connector.

#### Radar Resources (`gst://radar/<tier>/<filter>`)

6 URIs covering the radar substrate — see § 4 below for the full radar deep-dive.

| URI                                | Content                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `gst://radar/fyi/latest`           | Most-recent FYI tier (curated PE/M&A-relevant items with GST Take annotations) |
| `gst://radar/wire/latest`          | Most-recent Wire tier (broader market coverage across 4 categories)            |
| `gst://radar/wire/pe-ma`           | Wire items filtered to PE/M&A category                                         |
| `gst://radar/wire/enterprise-tech` | Wire items filtered to enterprise-tech                                         |
| `gst://radar/wire/ai-automation`   | Wire items filtered to AI/automation                                           |
| `gst://radar/wire/security`        | Wire items filtered to security                                                |

**Resource caching**: Library + Regulation Resources are wrapped in `readThroughCache` (BL-032.5 Phase 1) with 24h TTL. Radar Resources are populated by the hourly Worker Cron (BL-032.5 Phase 4) and served at sub-100ms latency. **Resources cost ~0 Inoreader budget — they read from cache**, so an agent pinning a radar Resource doesn't consume the per-key 5/min radar tool budget. This is important for OpenClaw agent design: prefer Resources when the agent needs to read radar context; use Tools only when you need a structured search.

---

## 3. Hub integration — how MCP links to website tools

The GST MCP server is the **conversational surface** of the same engines that power the [GST website hub tools](https://globalstrategic.tech/hub). MCP doesn't replace the hub — it augments it. Three hub tools are the most-relevant integration touchpoints:

### 3.1 Diligence Machine ↔ `generate_diligence_agenda` + `gst_diligence_kickoff`

- **Hub UI**: [`globalstrategic.tech/hub/tools/diligence-machine`](https://globalstrategic.tech/hub/tools/diligence-machine) — 13-dimension wizard producing topic-grouped diligence agendas
- **MCP equivalents**:
  - `generate_diligence_agenda` Tool — same engine, same 13-dimension input schema (`UserInputsSchema`)
  - `gst_diligence_kickoff` Prompt — wraps the Tool + adds the VDR-folder Library Resource for grounded VDR requests
- **Deeplink continuity** (BL-031.95 deliverable): every `generate_diligence_agenda` Tool response includes a `deeplink` field — a clickable URL that opens the hub's Diligence Machine pre-populated with the same dimensions. Any dimension passed as `'unknown'` lands as the wizard's "Not sure" affordance. **OpenClaw agents should surface this deeplink in their output** — the user can click through and continue editing the agenda in the hub UI

### 3.2 Radar ↔ `search_radar` + `get_latest_insights` + 6 Radar Resources

- **Hub UI**: [`globalstrategic.tech/hub/radar`](https://globalstrategic.tech/hub/radar) — Wire + FYI tiers with category filtering, GST Take voice annotations, library article browse
- **MCP equivalents**:
  - `search_radar` Tool — same data source (Inoreader → Worker cache), same item shape
  - `get_latest_insights` Tool — FYI-only convenience surface
  - 6 Radar Resources — pinnable snapshots, refreshed hourly by Worker Cron
  - `gst_radar_brief_today` Prompt — generates a daily briefing from `gst://radar/fyi/latest`
- **Continuity**: both surfaces read from the same Upstash MCP DB cache (`mcp:radar:cache:wire` + `mcp:radar:cache:fyi`). A radar refresh triggered by the website's hub page or by the Worker Cron is visible to both surfaces immediately. **The full radar deep-dive is § 4 below.**

### 3.3 TechPar ↔ `compute_techpar`

- **Hub UI**: [`globalstrategic.tech/hub/tools/techpar`](https://globalstrategic.tech/hub/tools/techpar) — Technology Paradigm assessment producing a multi-dimensional fit score
- **MCP equivalent**: `compute_techpar` Tool — same engine, same input schema (industry, stack, scale, etc.)
- **Used by**: `gst_target_quick_look` Prompt invokes this as part of its 4-tool sub-fan-out

### 3.4 ICG (Infrastructure Cost Governance) ↔ `assess_infrastructure_cost_governance`

- **Hub UI**: [`globalstrategic.tech/hub/tools/icg`](https://globalstrategic.tech/hub/tools/icg) — 20-domain ICG framework with attention areas + recommendations
- **MCP equivalent**: `assess_infrastructure_cost_governance` Tool — same engine, same `companyStage` + `infrastructureType` + scoring inputs
- **Used by**: `gst_target_quick_look` Prompt (in the 4-tool sub-fan-out)

### 3.5 Tech Debt ↔ `estimate_tech_debt_cost`

- **Hub UI**: [`globalstrategic.tech/hub/tools/tech-debt`](https://globalstrategic.tech/hub/tools/tech-debt)
- **MCP equivalent**: `estimate_tech_debt_cost` Tool
- **Used by**: `gst_target_quick_look` Prompt (in the 4-tool sub-fan-out)

### 3.6 Regulatory Map ↔ `search_regulations` + `gst://regulations/*` Resources

- **Hub UI**: [`globalstrategic.tech/hub/tools/regulatory-map`](https://globalstrategic.tech/hub/tools/regulatory-map) — interactive map of 120 jurisdictional regulatory frameworks
- **MCP equivalents**:
  - `search_regulations` Tool — keyword/jurisdiction/sector search
  - `list_regulation_facets` Tool — discover taxonomy
  - 120+ `gst://regulations/<jurisdiction>/<framework>` Resources — full text of each framework
- **Used by**: `gst_regulatory_exposure_brief` Prompt

### 3.7 General continuity principle

For every hub tool, there's a corresponding MCP surface (Tool, Prompt, or Resource family) that backs to the same engine. An OpenClaw agent's output should — wherever applicable — link back to the corresponding hub URL so a user can continue work in the rich UI. The Diligence Machine deeplink is the most explicit example, but the same pattern applies to radar (link to `globalstrategic.tech/hub/radar?category=<cat>`), portfolio (link to `globalstrategic.tech/ma-portfolio?theme=<theme>`), etc.

---

## 4. Radar deep-dive — most operationally complex surface

The radar system is the most architecturally involved part of the MCP server because it has the most moving parts: real-time data ingestion, multi-tier caching, autonomous OAuth refresh, daily-budget governance, and dual-DB Upstash architecture. OpenClaw integration for radar (scenarios 3 + 5 in BL-032.6) needs to understand the full picture.

### 4.1 Two tiers — Wire and FYI

The radar surface is split into two semantic tiers, both backed by the same Inoreader account but distinguished by curation level:

| Tier     | What it is                                                                                                                                     | Volume                                 | Curation                                                                                                                   | Tool surface                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Wire** | Broad market coverage across 4 GST-curated Inoreader folders                                                                                   | ~50-80 items/day across all categories | Folder-level — GST team places sources in the relevant Inoreader folder (PE/M&A, Enterprise-Tech, AI-Automation, Security) | `search_radar` (with category filter), Resources `gst://radar/wire/*`                                                               |
| **FYI**  | High-signal annotated items — Reid highlights specific items in Inoreader and adds the "GST Take" voice annotation directly in the feed reader | ~5-20 items/day                        | Item-level — every FYI item carries `annotation.highlightedText` + `annotation.gstTake`                                    | `get_latest_insights`, `search_radar` (filtered to `tier:'fyi'`), Resource `gst://radar/fyi/latest`, Prompt `gst_radar_brief_today` |

**The FYI tier is the demo-valuable one** — items carry the GST Take voice (direct, claim-first, no-hedge), which is the signature consultant signal. Generic radar consumption (Wire) doesn't have this. OpenClaw agents producing user-facing radar content should preferentially use FYI when the use case is "what does GST think?"

### 4.2 Tools vs Resources for radar — when to use which

| Use case                                                                 | Recommended surface                                                               | Why                                                                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Pin a fresh radar snapshot into an agent's context for reasoning         | `gst://radar/fyi/latest` or `gst://radar/wire/<category>` Resource                | Resources read from cache; **cost ~0 Inoreader budget**; sub-100ms latency                       |
| Search radar with a keyword across both tiers                            | `search_radar` Tool with `query` arg                                              | Tool path includes free-text search logic Resources don't                                        |
| Get the top N FYI items for a daily briefing                             | `get_latest_insights` Tool with `limit: N`                                        | Convenience surface; same cache, optimized response shape                                        |
| Filter by category                                                       | `search_radar` Tool with `category` arg OR `gst://radar/wire/<category>` Resource | Resource is faster (pre-filtered cache); Tool is more flexible (combinable with `tier`, `query`) |
| Build a radar Resource ONCE and reference it across multiple agent turns | Resource pinning (Claude Desktop) / MCP `resources/read` cache (OpenClaw)         | Resources are immutable per snapshot — pin once, reference many times                            |

**General rule for agent design**: **prefer Resources for context-anchoring; use Tools for active search**. Resources are cheaper, faster, and more cacheable. Reserve Tools for cases where the agent needs to interpret a user query and translate it into a structured search.

### 4.3 Cache architecture (BL-032.5 Phase 4)

The radar cache lives in **Upstash MCP DB** (the Worker-owned `gst-mcp` Redis instance — see [`MCP_SERVER_REMOTE_BL-032.md` § Q13](./MCP_SERVER_REMOTE_BL-032.md) for the two-DB design rationale). Two cache keys back the entire radar surface:

| Cache key              | Content                                                                                            | TTL | Refresh trigger                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------- |
| `mcp:radar:cache:wire` | Pre-fetched Wire tier items (all 4 categories, deduplicated by canonical URL, sorted newest-first) | 24h | Hourly Worker Cron + on-demand cache-miss from `search_radar` |
| `mcp:radar:cache:fyi`  | Pre-fetched FYI tier items (annotated stream)                                                      | 24h | Same                                                          |

**Why 24h TTL when the Cron refreshes hourly?** Defense in depth — if the Cron stops firing for any reason, the cache is still good for up to 24h. The hourly Cron just keeps the cache "warm" within that window.

**Two refresh mechanisms working together**:

1. **Hourly Worker Cron** (BL-032.5 Phase 4) — `0 * * * *` schedule on both staging + production. Force-refreshes both tiers regardless of cache state. Soft-capped at 180 Inoreader calls/day to leave headroom in the 200/day budget.
2. **On-demand cache-miss** — if a Tool call hits an expired cache OR a deleted key (rare), it falls through to Inoreader and re-populates. Same code path as the Cron, just triggered reactively.

### 4.4 Autonomous OAuth refresh (BL-039)

The Inoreader OAuth access token used by both refresh paths above expires periodically. The Worker is read-only on the `inoreader:access_token` Upstash key (architectural invariant per Q4); the **website is the sole refresh-writer**.

Before BL-039 (shipped 2026-05-13), this dependency was operationally fragile — if the token expired between human visits to the website's `/hub/radar` page, radar would go cold. BL-039 closes this gap:

- On any Inoreader 401 (token-stale), the Worker calls a new website endpoint `POST https://globalstrategic.tech/api/inoreader/refresh` with a shared secret
- The website endpoint runs the OAuth refresh, writes the new token to Upstash
- The Worker retries the original Inoreader call once with the freshly-written token
- If the retry succeeds, the agent's MCP call succeeds — the entire refresh happens in ~3 seconds, invisible to the agent

**OpenClaw implication**: an agent should NEVER see a `token-stale` error envelope in normal operation. If one does surface, it means BL-039's recovery path itself failed — usually because the Inoreader refresh-token (separate from the access token) has been revoked or never set up. Operator action required.

### 4.5 Rate limits + circuit breaker

**Per-key rate-limit budgets** (see [`RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md) for full details):

| Tool family                                                                   | Per-minute | Per-day |
| ----------------------------------------------------------------------------- | ---------- | ------- |
| General tools (portfolio, regulations, ICG, TechPar, tech-debt, diligence)    | 60         | 1000    |
| **Radar tools** (`search_radar`, `get_latest_insights`, `search_radar_cache`) | **5**      | **50**  |

**Important for OpenClaw multi-agent design**: if scenario 5's safe variant (2 specialist agents) each invokes a Prompt that internally fan-outs to multiple tools, **each tool call still counts against the radar bucket if it's a radar tool**. In practice:

- `gst_target_quick_look` Prompt → 4 tool calls (ICG + TechPar + tech-debt + regulations) — **0 radar-tier consumption** because none of these are radar tools
- `gst_comparable_engagements_memo` Prompt → 2 tool calls (portfolio search + facets) — **0 radar-tier consumption**
- A radar-using prompt → would consume the radar bucket per call

So BL-032.6 scenario 5's design is naturally low on radar budget. Scenario 3 (single OpenClaw radar agent) consumes 1-2 radar tool calls per pull (most served from cache after the first).

**Radar circuit breaker** (`mcp:radar:circuit-open` Upstash key): if Inoreader returns 429 (their 200/day budget exhausted), the first radar tool to see it sets a 6h breaker flag. All subsequent radar tool calls return `503 Service Unavailable` with `Retry-After` until the breaker auto-closes. Non-radar tools are unaffected. **Agents should treat `503 + retry-after` as "wait, don't retry"** — repeated retries during breaker-open just waste budget on the next cycle.

### 4.6 Response shape (radar Tools)

```typescript
{
  matches: Array<{
    id: string; // stable Inoreader item ID
    title: string;
    url: string; // canonical URL (deduplicated)
    source: string; // publisher name
    category: 'pe-ma' | 'enterprise-tech' | 'ai-automation' | 'security' | null;
    publishedAt: string; // ISO 8601
    summary: string;
    annotation?: {
      // FYI tier only
      highlightedText: string;
      gstTake: string; // the GST Take voice — direct, claim-first
    };
    tier: 'wire' | 'fyi';
  }>;
  totalMatched: number;
  returned: number;
  liveInfo: {
    wireFetchedAt: string; // ISO 8601 of last Wire cache write
    wireCacheHit: boolean; // false = just hit Inoreader; true = served from cache
    fyiFetchedAt: string;
    fyiCacheHit: boolean;
  }
  deeplink: string; // hub URL to continue in the radar page UI
}
```

The `liveInfo.cacheHit` flags let an agent reason about freshness. The `deeplink` field is the same continuity affordance as the diligence Tool — surface it in agent output for hub-handoff.

### 4.7 Radar Resource response shape

```typescript
{
  tier: 'wire' | 'fyi';
  uri: string;              // the requested gst://radar/... URI
  lastSeededAt: string;     // ISO 8601 — when the Cron last wrote this cache entry
  itemCount: number;
  items: SnapshotItem[];    // same item shape as Tool matches
}
```

Or, on a cold-cache scenario (rare; only between deploy and first Cron tick):

```typescript
{
  error: 'Radar snapshot is not yet populated. ...';
  uri: string;
}
```

---

## 5. Client interaction patterns — best practices

### 5.1 System-prompt addendum for agents (load-bearing)

Every OpenClaw agent talking to the GST MCP should have the **system-prompt addendum** baked in. Without it, agents frequently substitute training knowledge or web search for MCP tool calls (this was observed extensively in the BL-032 staging soak, recorded in [`BL-032_TESTING_FINDINGS.md`](./BL-032_TESTING_FINDINGS.md) § K).

The canonical addendum is in [`REMOTE_CLIENT_SETUP.md` § 4](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) — copy it verbatim into each agent's system prompt. Key behavioral rules it enforces:

1. **Opening-sentence bias**: agents MUST name the MCP tool they intend to call in their first sentence. Without this rule, agents often default to "I'll search past conversations" or "Based on what I know about..." — both off-MCP paths.
2. **MCP-first defaults**: agents MUST call the GST tool first, even when prompts don't explicitly mention GST
3. **'unknown' sentinel for diligence**: when the diligence-agenda dimensions can't be derived from user input, pass `'unknown'` rather than guessing
4. **No training-knowledge substitution** for GST-domain content (portfolio, radar, ICG, TechPar, regulations)

### 5.2 Failure modes — what to handle

The MCP server returns structured error envelopes for known failure modes. Agents should branch on the `error` field:

| Error envelope                                              | Meaning                                                 | Agent action                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `error: "rate_limit_exceeded", tier: "minute"`              | Per-minute budget hit                                   | Sleep `retryAfterSeconds`, retry                                                                   |
| `error: "rate_limit_exceeded", tier: "day"`                 | Per-day budget hit                                      | Stop trying for that key — could be hours-to-tomorrow. Switch keys if pool, or escalate            |
| `error: "service_unavailable", status: 503` (radar circuit) | Radar circuit breaker open                              | Sleep `retryAfterSeconds`. Do NOT use radar tools until breaker closes. Non-radar tools still work |
| `error: "token-stale"`                                      | Inoreader token expired AND BL-039 recovery also failed | Escalate — operator needs to mint new OAuth credentials                                            |
| `error: "Unknown library URI"`, JSON-RPC code `-32602`      | Resource URI typo                                       | Fix the URI — check `resources/list` for the canonical set                                         |
| HTTP 401                                                    | Bearer auth rejected                                    | Check the `Authorization` header; the key may have been rotated                                    |
| HTTP 5xx                                                    | Worker-side crash                                       | Check Sentry for the specific request ID; retry once after 30s                                     |

All envelopes include a `message` field with human-readable detail — use for logging, not for branching logic.

### 5.3 Recommended agent design patterns

#### Pattern A — One agent = one Prompt (BL-032.6 scenario 5)

Each specialist agent invokes exactly one GST Prompt. The Prompt orchestrates its underlying Tools and Resources internally. The OpenClaw agent's job is just to:

1. Take user input as the agent's task
2. Translate input into the Prompt's `argsSchema` (defaulting to `'unknown'` where input is ambiguous)
3. Call the Prompt via MCP `prompts/get`
4. Return the Prompt's output to the orchestrator (or directly to user)

**Pros**: simple, leverages GST's versioning + senior-consultant sign-off baked into each Prompt. Architecturally cleanest.
**Cons**: depends on having an appropriate Prompt for the task. New use cases may require new Prompts (a GST-side workflow, not OpenClaw-side).

#### Pattern B — One agent = one Tool (BL-032.6 scenario 3)

Simpler than Pattern A — the agent directly invokes one Tool with a structured input. No Prompt layer.

**Pros**: simplest possible agent; useful for narrow tasks
**Cons**: agent must construct the Tool's input schema correctly; no prompt-template scaffolding

#### Pattern C — Fan-out + Synthesis (BL-032.6 scenario 5 multi-agent)

Multiple specialist agents (Pattern A) run in parallel; a Synthesis agent combines their outputs. The synthesis agent typically has NO MCP access — it operates purely on the specialist outputs.

**Pros**: shows multi-agent orchestration cleanly; mirrors human partner workflows ("what does each specialist say?")
**Cons**: parallel agent runtimes consume RAM; coordination overhead

### 5.4 Resource pinning vs Tool invocation

For long-running agent conversations where the agent needs to repeatedly reference the same radar snapshot or Library article, **pin the Resource once at conversation start** rather than re-calling the Tool every turn. This:

- Saves rate-limit budget (Resources don't count against the per-key Tool budget)
- Ensures consistent reference (the same snapshot across all turns, not a moving target)
- Reduces latency (Resources are pre-cached)

### 5.5 Diagnostic + observability hooks

The MCP server emits structured logs that operators can read via `wrangler tail --env staging`. For OpenClaw-side debugging:

- Every authenticated request logs `keyOwner` (your `MCP_KEY_<INITIALS>` minus the prefix) so the GST operator can filter to your traffic
- Failed requests log the failure reason (e.g., `auth.failed bearer-rejected`, `ratelimit.exceeded`)
- Sentry breadcrumbs for `area:bl-039` (refresh events) and `area:inoreader-api` (Inoreader-side errors)

If OpenClaw-side debugging needs more visibility, GST operator can grant temporary access to the relevant Sentry project (`gst-7o/gst-mcp-server`).

---

## 6. Reference doc index

Quick-reference list of canonical docs by topic. Read these in order if onboarding from scratch:

| Doc                                                                                                                       | Purpose                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`mcp-server/README.md`](../../../mcp-server/README.md)                                                                   | Consumer-facing entry point with example scenarios + per-tool walkthroughs        |
| [`mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) | Per-client setup with the system-prompt addendum (load-bearing for agent quality) |
| [`mcp-server/src/docs/operations/AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md)                               | Bearer key model, scope catalog, rotation cadence                                 |
| [`mcp-server/src/docs/operations/RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md)                 | Rate-limit budgets, RFC 9331 headers, circuit-breaker semantics                   |
| [`mcp-server/src/docs/radar/CONTRACT.md`](../../../mcp-server/src/docs/radar/CONTRACT.md)                                 | Radar Tool input/output schemas                                                   |
| [`mcp-server/src/docs/radar/USAGE_REMOTE.md`](../../../mcp-server/src/docs/radar/USAGE_REMOTE.md)                         | Radar Tool walkthrough with cache semantics                                       |
| [`mcp-server/src/docs/prompts/README.md`](../../../mcp-server/src/docs/prompts/README.md)                                 | Registered-prompt architecture                                                    |
| [`mcp-server/src/docs/diligence/CONTRACT.md`](../../../mcp-server/src/docs/diligence/CONTRACT.md)                         | Diligence agenda Tool schema (13 dimensions)                                      |
| [`MCP_SERVER_REMOTE_BL-032.md`](./MCP_SERVER_REMOTE_BL-032.md)                                                            | Full BL-032 substrate architecture                                                |
| [`BL-032_5_TESTING_FINDINGS.md`](./BL-032_5_TESTING_FINDINGS.md)                                                          | Soak evidence — what we verified works in production                              |
| [`MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md`](./MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md)                                          | The demo design this handover supports                                            |

---

## 7. Quick-reference cheat sheet (for the OpenClaw integrator)

```
ENDPOINT     https://mcp-staging.globalstrategic.tech/mcp
TRANSPORT    Streamable HTTP (POST + SSE response)
AUTH         Authorization: Bearer [TO_BE_PROVIDED — MCP_KEY_<INITIALS>]
HEALTH       https://mcp-staging.globalstrategic.tech/health
DISCOVER     openclaw mcp inspect gst-mcp
SMOKE TEST   curl POST /mcp with {"jsonrpc":"2.0","id":1,"method":"tools/list"}

RATE LIMIT   60/min, 1000/day general tools
             5/min, 50/day radar tools
             Watch RateLimit-* response headers

SURFACE      12+ Tools, 8 Prompts, ~130 Resources
             Tools = single-purpose engine calls
             Prompts = versioned consultant workflows
             Resources = pinnable read-only content (Library, Regulations, Radar)

DEMO         BL-032.6 scenario 3 → single radar agent
             BL-032.6 scenario 5 → 2-3 specialist agents + Synthesis
             Each specialist invokes one GST Prompt

GOTCHAS      System-prompt addendum is load-bearing (REMOTE_CLIENT_SETUP.md § 4)
             Resources are cheaper than Tools — pin for context-anchoring
             Radar tier counts against a separate (smaller) budget
             token-stale errors should never reach the agent (BL-039 covers); if they do, escalate
```

---

_Authored 2026-05-13 (BL-032.6 Rev 7). Update when the OpenClaw integration ships or when any of the referenced substrate behaviors change._
