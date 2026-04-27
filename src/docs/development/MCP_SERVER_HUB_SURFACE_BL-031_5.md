# MCP Server — Hub Surface Extension (BL-031.5)

> **Backlog initiative**: [BL-031.5: MCP Server — Hub Surface Extension](BACKLOG.md#bl-0315-mcp-server--hub-surface-extension)
>
> **Companion to**: [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — read that first for the overall architecture, repo-placement decision, and Phase 1/2/3 framing.
>
> **Sequels**:
>
> - [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — adds MCP **Prompts** as named consultant workflows on top of the Tools+Resources surface delivered here.
> - [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) — ports the Resources surface delivered here to the remote HTTP transport, with caching semantics, scope gating, and URI-stability discipline.
>
> **Scope**: this document covers [BL-031.5](BACKLOG.md#bl-0315-mcp-server--hub-surface-extension) — extending the local stdio MCP server (delivered in BL-031) to expose **all remaining Hub tool engines** as MCP **Tools** and the **Library** + **Radar** content as MCP **Resources**.
>
> **Status**: Open. Depends on BL-031.

---

## Context

BL-031 will deliver a local MCP server with two tools: `generate_diligence_agenda` and `search_portfolio` (plus the `list_portfolio_facets` companion). That ships the smallest viable surface and proves the engineering path. It leaves four other Hub engines, two Library articles, and the Radar feed unreachable to anything except the website UI.

The same browser context-switch tax that motivated BL-031 applies — perhaps more strongly — to these other surfaces. A consultant drafting a deliverable in Claude Desktop and reaching for the **VDR Structure Guide**, an **Infrastructure Cost Governance** assessment, or a **Tech Debt** estimate today has to: open a tab, navigate to the tool, fill a form (or scroll a long article), copy back into the document. Multiply that by every conversation in which any of these surfaces would have been useful and the cost compounds.

BL-031.5 closes that gap by completing the Phase-1 surface. Crucially, it also serves as a **proof-of-concept for the MCP "Resources" primitive** — a capability MCP affords that BL-031 deliberately does not exercise. Validating Resources end-to-end now (locally, low-stakes) is the cheapest way to learn the ergonomics, the URI semantics, and the freshness/caching constraints before BL-032 needs to expose Resources over HTTP to remote clients.

This document explains why Resources are worth a dedicated initiative, lays out the surface taxonomy (what becomes a Tool vs a Resource and why), and codifies the implementation considerations specific to this extension.

---

## What MCP "Resources" are — and why this initiative matters

[MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) introduced MCP's three primitives. BL-031 uses only **Tools**. BL-031.5 introduces **Resources**:

| Primitive    | What it is                                                                                 | Who reads it                                                            |
| ------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Tool**     | A callable function with structured input → output. The model invokes it.                  | Model decides when to call.                                             |
| **Resource** | A piece of read-only content addressable by a URI. May be text, JSON, markdown, or binary. | The user pins it into context, OR the model auto-fetches when relevant. |
| **Prompt**   | A pre-written templated message the user can invoke as a slash-command.                    | User-driven. (Out of scope here.)                                       |

A Resource in MCP has: a `uri` (e.g. `gst://library/vdr-structure`), a human-friendly `name`, an optional `description`, and a `mimeType`. The MCP client lists resources via `resources/list` and reads them via `resources/read`. Some clients render a "resources" picker; others let the model auto-discover and pull on demand.

### Why Resources earn a dedicated initiative

1. **Different ergonomics from Tools.** Tools are imperative — the model has to decide to call one. Resources are declarative — the model (or user) treats them as referenceable context that exists. For static reference content (Library articles, regulatory frameworks), Resources are a much better fit than wrapping reads in a `get_article` tool: the model sees "VDR Structure Guide" in the resource list and pulls it without us having to coach the call.
2. **URI taxonomy is a design decision.** Once we publish `gst://library/vdr-structure`, that URI is part of the contract — clients (and clients' agents) may pin it into long-running conversations. Designing the URI scheme thoughtfully now (one document, low-stakes) is much cheaper than re-doing it after BL-032/033 lock in remote-client expectations.
3. **Freshness semantics differ.** Tool outputs are recomputed on every call. Resources are snapshots — they have a freshness story (last-modified, ETag, manual refresh). Radar in particular cannot be a Resource without a clear answer to "how stale is this, and who refreshes it?"
4. **Validates the hybrid architecture.** BL-032 and BL-033 will inevitably mix Tools and Resources (e.g. a `search_radar` Tool plus per-item `gst://radar/<id>` Resources). Proving that the same `mcp-server` workspace cleanly registers both primitives with shared schemas is a Phase-2 prerequisite that's easier to validate locally first.
5. **Concrete artifact for narrative.** "Our agents have GST's regulatory framework library available as native context" reads stronger in pitches than "you can call a tool that returns regulatory text."

### How clients discover and read Resources

Resources sit alongside Tools in the same MCP connection — same stdio transport described in [MCP_SERVER_ARCHITECTURE_BL-031.md § Discovery, connection, build, and deployment](MCP_SERVER_ARCHITECTURE_BL-031.md#discovery-connection-build-and-deployment). What's new is how the client surfaces them to the user and the model:

| Client         | How Resources appear                                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Desktop | Resource picker in the conversation chrome — the user can browse `gst://library/...`, `gst://regulations/...`, `gst://radar/...` and pin specific Resources into the active conversation as referenceable context                      |
| Claude Code    | Resources are listed alongside tools; the model can pull them on demand via `resources/read`. The user can also reference a URI directly in a prompt and the client will fetch it                                                      |
| Cursor         | Similar — Resources are auto-discovered and the model decides when to pull                                                                                                                                                             |
| ChatGPT        | Local stdio not supported in this phase; Resources become reachable via HTTP in [BL-032.5](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md), where ChatGPT's connector UI surfaces them as referenceable context on the connector card |

The wire calls are:

- `resources/list` — returns the full URI manifest with `name`, `description`, `mimeType` per Resource. Called once at session start
- `resources/read { uri }` — returns `{ contents: [{ uri, mimeType, text? | blob? }] }` for the requested URI

This is the conceptual difference from Tools: a Tool is invoked by the model with arguments; a Resource is identified by a URI and read back as content. No arguments, no decision logic — the model treats it like a file. URI stability becomes a contract — once `gst://library/vdr-structure` is published, it must not move (the URI-stability invariant gets formalized for HTTP in [BL-032.5](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md), but the discipline starts here).

---

## Surface inventory and primitive choice

The Hub has **5 tool pages**, the Library has **2 articles**, and Radar has **2 content streams** (Wire and FYI). BL-031 covers Diligence Machine. BL-031.5 covers everything else.

### Hub tools — engines that become MCP **Tools**

| Tool page                          | Engine                          | Input shape (summary)                                                                                       | Output shape (summary)                                        | Source files                                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Infrastructure Cost Governance** | `src/utils/icg-engine.ts`       | `{ answers: Record<questionId, scoreLevel>, stage }`                                                        | `{ domainScores: DomainScore[], overall, recommendations[] }` | [icg-engine.ts](../../utils/icg-engine.ts), [domains.ts](../../data/infrastructure-cost-governance/domains.ts), [recommendations.ts](../../data/infrastructure-cost-governance/recommendations.ts)                                                                         |
| **TechPar**                        | `src/utils/techpar-engine.ts`   | `{ arr, stage, capexView, spendBreakdown }`                                                                 | `{ ratios, trajectory, zones, benchmarks, industryNotes }`    | [techpar-engine.ts](../../utils/techpar-engine.ts), [stages.ts](../../data/techpar/stages.ts), [recommendations.ts](../../data/techpar/recommendations.ts), [signal-copy.ts](../../data/techpar/signal-copy.ts), [industry-notes.ts](../../data/techpar/industry-notes.ts) |
| **Tech Debt Calculator**           | `src/utils/tech-debt-engine.ts` | `{ teamSize, salary, maintenanceBurdenPct, deployFrequency }` (UI exposes sliders; engine takes raw values) | `{ annualCost, breakdown, doraSignals }`                      | [tech-debt-engine.ts](../../utils/tech-debt-engine.ts)                                                                                                                                                                                                                     |
| **Regulatory Map**                 | (mostly content, not engine)    | n/a — see Resources below                                                                                   | n/a                                                           | [src/data/regulatory-map/](../../data/regulatory-map/), [fetchRegulations.ts](../../utils/fetchRegulations.ts)                                                                                                                                                             |

**Tool naming convention** for BL-031.5 (parallel to BL-031's `generate_diligence_agenda` / `search_portfolio`):

- `assess_infrastructure_cost_governance` — wraps `icg-engine`
- `compute_techpar` — wraps `techpar-engine`
- `estimate_tech_debt_cost` — wraps `tech-debt-engine`
- `search_regulations` — facet search across regulatory framework metadata (companion to the Resource exposure below)

**Important design note on the Tech Debt calculator**: the website wraps slider positions (`posToTeamSize`, `posToSalary`) around the engine for UX. The MCP Tool MUST accept the raw engine-level values directly (team size as an integer, salary as a number) — slider positions are a UI concern that has no business in an agent-facing schema. The wrapper layer in `mcp-server/src/tools/tech-debt.ts` should bypass the position helpers entirely.

### Library — articles that become MCP **Resources**

The Library has **2 articles**, both authored as Astro pages with embedded markup:

| Article                             | URL                                    | URI under MCP                          | mimeType        |
| ----------------------------------- | -------------------------------------- | -------------------------------------- | --------------- |
| Business & Technology Architectures | `/hub/library/business-architectures/` | `gst://library/business-architectures` | `text/markdown` |
| Virtual Data Room Structure Guide   | `/hub/library/vdr-structure/`          | `gst://library/vdr-structure`          | `text/markdown` |

**Content-source question (key implementation decision):** the Library articles are currently `.astro` files with hand-authored HTML/markup, not separate markdown sources. Extracting clean text for Resource exposure has three options:

| Option                                                                                                                | Pros                                                                            | Cons                                                                             |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **A. Migrate to Astro content collections** (one `.md` per article + frontmatter)                                     | Single source of truth; cleaner authoring going forward; trivial to read in MCP | Refactor work on the website; slight visual diff risk                            |
| **B. Add a sibling `article.md` per article** that the Astro page imports for body, and the MCP server reads directly | Single source of truth without forcing a migration; isolated change             | Two-file pattern is mildly awkward; future articles must follow the same pattern |
| **C. Keep duplicate text in `src/data/library/articles.ts`**                                                          | Zero website refactor                                                           | Drift risk: copy-paste between Astro page and the data module                    |

**Recommendation**: **Option A** (content collections) is the right long-term answer because the Library will grow and Astro's content API is purpose-built for this. If BL-031.5 needs to ship before that migration is feasible, **Option B** is acceptable as an interim. **Option C is rejected** — it imports the same drift risk we explicitly reject for the diligence engine schema.

The MCP Resource handler then resolves a `gst://library/<slug>` URI to the corresponding markdown body and returns it with `mimeType: 'text/markdown'`.

### Regulatory Map — content + facet tool (hybrid)

120+ JSON files under [src/data/regulatory-map/](../../data/regulatory-map/), one per framework, each with jurisdiction / domain / title / summary / obligations / effective-date / authority.

| Surface                 | Primitive                                                                                          | Why                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-framework full text | **Resource**: `gst://regulations/<jurisdiction>/<framework-id>` (e.g. `gst://regulations/eu/gdpr`) | URI-addressable, stable, model can pin a specific framework into a deal review conversation                                                                     |
| Faceted search          | **Tool**: `search_regulations` with `{ jurisdiction?, domain?, query?, limit? }`                   | Discovery — agents won't know the URI in advance; a search tool returns `{ id, uri, title, summary }` records that the agent can then read via the resource URI |
| Facet enumeration       | **Tool**: `list_regulation_facets` returning `{ jurisdictions[], domains[] }`                      | Same one-roundtrip-saver pattern as `list_portfolio_facets`                                                                                                     |

This is the hybrid pattern that BL-032/033 will inherit for radar.

### Radar — cached content as Resources (with strict freshness rules)

Radar exposes two streams:

- **Wire** — raw aggregated feed (categorized: `pe-ma`, `enterprise-tech`, `ai-automation`, `security`)
- **FYI** — annotated highlights with GST Take

**Critical constraint**: BL-031.5 is local-stdio and must NOT make fresh Inoreader API calls. The Inoreader 200 req/day budget is shared with the production website's ISR (~28 calls/day) and BL-032's planned remote rate-limit logic. An always-on local MCP server fetching live data would burn the budget within hours.

**Solution**: read **only** from the seed snapshot produced by `npm run radar:seed` (already documented in [RADAR.md](../hub/RADAR.md) and called out in CLAUDE.md). The MCP server treats the local cache file as the authoritative source. If the cache is missing, the relevant Resources return an `isError`-style empty content set with a message instructing the user to run `npm run radar:seed`.

| Surface                           | Primitive                                                                                               | URI                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Latest FYI items                  | **Resource**: `gst://radar/fyi/latest` (returns the most recent N annotated items as a single document) |                                                       |
| Latest Wire items                 | **Resource**: `gst://radar/wire/latest`                                                                 |                                                       |
| Per-category Wire                 | **Resource**: `gst://radar/wire/<category>` (e.g. `gst://radar/wire/pe-ma`)                             |                                                       |
| Per-item full body                | **Resource**: `gst://radar/item/<itemId>`                                                               |                                                       |
| Search across the cached snapshot | **Tool**: `search_radar_cache` with `{ query?, category?, tier?, since?, limit? }`                      | Local-only equivalent of BL-032's live `search_radar` |

The naming explicitly signals the snapshot-based nature (`search_radar_cache`, not `search_radar`) so that when BL-032 ships the live remote version there is no naming collision.

---

## Repo placement and lifecycle

Same answers as [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md). BL-031.5 extends the existing `mcp-server/` workspace; no repo split, no separate publishing. Engine drift remains the dominant risk, mitigated by the same single-source-of-truth pattern (relative imports into `src/utils/*-engine.ts` and `src/schemas/`).

The **only** new lifecycle wrinkle introduced by Resources is **content versioning**: a Resource URI is part of the contract. If we later rename the regulatory-map JSON for a specific framework (e.g. file rename), the URI breaks for any client that pinned it. The mitigation here is to define resource IDs **independent of file paths** — the URI uses a stable slug (`gst://regulations/eu/gdpr`), and the MCP handler resolves slug → file. URI-stability becomes a documented invariant, enforced by a Vitest test that asserts a frozen list of expected URIs.

---

## Implementation Plan

### File layout (extends BL-031's `mcp-server/`)

```
mcp-server/
├── src/
│   ├── index.ts                  # +registerHubTools(server); +registerResources(server)
│   ├── tools/
│   │   ├── diligence.ts          # (BL-031, unchanged)
│   │   ├── portfolio.ts          # (BL-031, unchanged)
│   │   ├── icg.ts                # NEW — wraps icg-engine
│   │   ├── techpar.ts            # NEW — wraps techpar-engine
│   │   ├── tech-debt.ts          # NEW — wraps tech-debt-engine
│   │   ├── regulations.ts        # NEW — search_regulations + list_regulation_facets
│   │   └── radar-cache.ts        # NEW — search_radar_cache (reads seed snapshot)
│   ├── resources/                # NEW — all Resource handlers
│   │   ├── library.ts            # gst://library/<slug>
│   │   ├── regulations.ts        # gst://regulations/<jurisdiction>/<id>
│   │   └── radar.ts              # gst://radar/...
│   ├── content/                  # NEW — content adapters (read-from-source)
│   │   ├── library-loader.ts     # resolves slug → markdown body (Option A or B)
│   │   ├── regulation-loader.ts  # resolves slug → regulation JSON
│   │   └── radar-snapshot.ts     # reads .cache/inoreader/ seed snapshot
│   └── schemas.ts                # +ICG, TechPar, TechDebt, Regulation schemas
└── tests/
    ├── icg.test.ts                            # NEW
    ├── techpar.test.ts                        # NEW
    ├── tech-debt.test.ts                      # NEW
    ├── regulations.test.ts                    # NEW (tool + resource)
    ├── library.test.ts                        # NEW (resource)
    ├── radar-cache.test.ts                    # NEW (tool + resource, mocked snapshot)
    └── resource-uri-stability.test.ts         # NEW — frozen URI list invariant
```

### Critical files to read or modify

| File                                                             | Action                                                                                                             | Why                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| [src/utils/icg-engine.ts](../../utils/icg-engine.ts)             | Read only — relative-import scoring functions                                                                      | Source of truth                          |
| [src/utils/techpar-engine.ts](../../utils/techpar-engine.ts)     | Read only — relative-import calc functions                                                                         | Source of truth                          |
| [src/utils/tech-debt-engine.ts](../../utils/tech-debt-engine.ts) | Read only — relative-import `computeDebtCost`; **bypass** `posToTeamSize`/`posToSalary`                            | Engine, minus UI helpers                 |
| [src/utils/fetchRegulations.ts](../../utils/fetchRegulations.ts) | Read only — relative-import data-load utilities                                                                    | Regulatory file enumeration              |
| [src/data/regulatory-map/\*.json](../../data/regulatory-map/)    | Read at server boot; build slug index                                                                              | Resource backing store                   |
| Library article sources                                          | Decision: Option A (preferred) — migrate to Astro content collection; OR Option B — add sibling `article.md` files | Single source of truth for Resource body |
| [src/lib/inoreader/cache.ts](../../lib/inoreader/cache.ts)       | Read only — reuse the existing `getCachedResponse` shape if compatible, or read the seed file directly             | Snapshot source for radar Resources      |
| [src/schemas/](../../schemas/)                                   | Add Zod schemas for `ICGInputs`, `TechParInputs`, `TechDebtInputs`, `RegulationFacets`                             | Reused by both website and MCP           |

### Verification (run before marking complete)

1. `cd mcp-server && npm run build && npm test` — green.
2. From repo root: `npx astro check && npm run lint && npm run lint:css && npm run test:run` — still green.
3. `npm run radar:seed` from repo root — populates the local snapshot.
4. Restart the local MCP server, confirm Claude Desktop's resource picker lists all expected URIs (Library × 2, Regulations × 120+, Radar items).
5. Pin `gst://library/vdr-structure` into a Claude Desktop conversation, confirm the model treats it as available context.
6. Invoke `assess_infrastructure_cost_governance` with a worked example, compare output to the website wizard at `/hub/tools/infrastructure-cost-governance/` for the same answers — must be identical.
7. Same parity check for `compute_techpar` and `estimate_tech_debt_cost`.
8. Invoke `search_regulations { domain: 'privacy', jurisdiction: 'eu' }`, confirm GDPR appears with a working URI; read that URI, confirm full framework body returns.
9. With the radar snapshot deleted, invoke a radar Resource — confirm a clean "snapshot missing, run `npm run radar:seed`" error rather than a stack trace.
10. Run `npx tsc --noEmit` from `mcp-server/` AND from repo root — confirm no cross-workspace type leakage.

### Risks & mitigations

| Risk                                             | Mitigation                                                                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library article migration scope creep            | Decide Option A vs B explicitly at the start of the ticket; if Option A is chosen, scope it as a co-shipped sub-PR. If schedule pressure, fall back to Option B and document the future migration.                   |
| Resource URI instability                         | Stable slugs decoupled from file paths; Vitest test asserts a frozen URI manifest. Any breaking change requires explicit URI-list update + bump in `mcp-server/package.json` `version` (semver-as-contract).         |
| Radar snapshot freshness confusion               | Resource description includes `lastSeededAt` from the snapshot file's mtime. If older than 7 days, prepend a "stale snapshot — re-seed for current data" notice in the resource body.                                |
| Inoreader budget burn from accidental live calls | The radar tools/resources MUST import from `mcp-server/src/content/radar-snapshot.ts` and never from `src/lib/inoreader/client.ts`. Enforce with an ESLint `no-restricted-imports` rule scoped to `mcp-server/src/`. |
| Schema drift across 4 new engines                | Same pattern as BL-031: derive MCP Zod schemas from the engines' canonical input types; subset-test asserts every wizard option / engine constant remains a valid input.                                             |
| Tech Debt slider-vs-raw-value confusion          | Document the input shape explicitly in the tool description; never expose `posToTeamSize`/`posToSalary` to the agent.                                                                                                |

### Out of scope (deferred to BL-032 or later)

- Live Radar calls (BL-032 with Upstash + rate limits)
- HTTP transport / remote deployment (BL-032)
- Auth, rate limiting (BL-032)
- Pen-test, audit log, prompt-injection sanitization on regulation/library text (BL-033)
- MCP Prompts primitive (deferred indefinitely; add when there's a demonstrated user demand)
- A `generate_*` write-tool surface (the MCP server stays read-only)

---

_Last updated: 2026-04-25_
