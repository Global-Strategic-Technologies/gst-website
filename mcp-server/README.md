# @gst/mcp-server

Local-stdio Model Context Protocol server that exposes GST's pure-engine utilities to MCP-aware clients (Claude Desktop, Claude Code, Cursor).

> **Architecture and rationale**: [`src/docs/development/MCP_SERVER_ARCHITECTURE_BL-031.md`](../src/docs/development/MCP_SERVER_ARCHITECTURE_BL-031.md). Sibling initiatives (BL-031.5 Resources, BL-031.75 Prompts, BL-032/.5/.75 Remote, BL-033 Hardening) are tracked in [`BACKLOG.md`](../src/docs/development/BACKLOG.md).

---

## Why this exists (use cases)

You already have the same engines on the website — what does the MCP server give you that opening `globalstrategic.tech/hub/tools/diligence-machine` doesn't? **It puts those engines inside the conversation you're already having with Claude.** No browser tab switch, no copy-paste from wizard output into a draft, no re-typing inputs to iterate. You describe the deal in prose and the engine output streams into the same thread that's writing your proposal, prepping your call notes, or summarizing the dataset for a prospect.

Three canonical scenarios drive the design:

### 1. Live agenda drafting

You're prepping for a partner meeting on a real opportunity. Type the deal description in natural language:

> "Generate a diligence agenda. Target is a B2B SaaS company, ~$30M ARR, ~150 employees, modern cloud-native (AWS, K8s), 8 years old, scaling stage, US + EU footprint, productized platform, moderate scale intensity, actively modernizing a legacy section, high data sensitivity (handles PII), product-aligned eng teams. We're considering a majority stake."

Claude calls `generate_diligence_agenda` with the right enums extracted from the prose, returns topic-grouped questions plus attention-area summaries plus a trigger map showing which input dimensions caused which questions to surface. You iterate in the same thread: _"now regenerate it for a carve-out instead of majority-stake, same other inputs"_ — same engine, instant re-run, no wizard restart.

**Time saved per session**: 10–15 minutes of browser-tab juggling and manual transcription per agenda draft.

### 2. Comparable-deal recall (mid-call analogical anchoring)

You're on a call with a prospect or partner and want to reference relevant past engagements without breaking flow:

> "Pull GST's past Buy-Side engagements in healthcare. Anything that touched RCM or PHI handling specifically?"

Claude calls `search_portfolio` with the right filter combination, returns codenames, ARRs, tech stacks, challenge / solution paragraphs — content you can read aloud or paste into the chat to ground the analogy. Combine free-text search with `theme` and `engagement` filters in plain English; Claude maps your phrasing to the schema.

### 3. Pitch / scope mapping

You're explaining GST's coverage to a new prospect, partner, or analyst onboarding:

> "What industries and engagement types are represented across our portfolio? Show me the rough distribution."

Claude calls `list_portfolio_facets` to get the deduplicated themes / engagement categories / growth stages / years, then optionally layers in `search_portfolio` counts for depth. Useful when composing an introductory email, building a pitch deck, or briefing someone on what kinds of deals GST is positioned for.

### What it does NOT replace

- The website wizard's visual scaffolding remains the right surface for stakeholders who want to _see_ the question hierarchy and tweak inputs interactively. The MCP path is for users already in a Claude conversation who'd rather not leave it.
- This is an internal tool today — no client-facing endpoints. Remote HTTP, OAuth, and rate-limiting are tracked under BL-032 / BL-033.

> **Want to see one of these scenarios end-to-end?** [`src/docs/diligence/USAGE.md`](src/docs/diligence/USAGE.md) walks through scenario #1 (live agenda drafting) for a hypothetical PE majority-stake TDD — full prose prompt, schema mapping, engine output, trigger map, comparable engagements, and iteration patterns. Each per-tool directory under `src/docs/<tool>/` ships its own `USAGE.md` walkthrough.

---

## What's exposed

### Tools (9)

| Tool                                    | Purpose                                                                                   | Input                                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate_diligence_agenda`             | Wraps `generateScript` — Inquisitor's Script for a deal profile                           | 13-field `UserInputs` payload — full reference in [`src/docs/diligence/CONTRACT.md`](src/docs/diligence/CONTRACT.md)                              |
| `search_portfolio`                      | Wraps `filterProjects` — searches the 61-project anonymized M&A dataset                   | `{ search?, theme? = 'all', engagement? = 'all', limit? = 20 }` (max 61) — see [`src/docs/portfolio/CONTRACT.md`](src/docs/portfolio/CONTRACT.md) |
| `list_portfolio_facets`                 | Deduplicated themes / engagement categories / growth stages / years                       | `{}` — see [`src/docs/portfolio/CONTRACT.md`](src/docs/portfolio/CONTRACT.md)                                                                     |
| `assess_infrastructure_cost_governance` | Wraps `calculateResults` — ICG maturity scoring + recommendations                         | `{ answers, companyStage? }` — see [`src/docs/icg/CONTRACT.md`](src/docs/icg/CONTRACT.md)                                                         |
| `compute_techpar`                       | Wraps `compute` — TechPar benchmark, zone, KPIs, 36-month gap projection                  | 14-field `TechParInputs` — see [`src/docs/techpar/CONTRACT.md`](src/docs/techpar/CONTRACT.md)                                                     |
| `estimate_tech_debt_cost`               | Wraps `calculateFromRawInputs` — annual / monthly debt-carrying cost (raw values)         | `{ teamSize, salary, maintenanceBurdenPct, deployFrequency, ... }` — see [`src/docs/tech-debt/CONTRACT.md`](src/docs/tech-debt/CONTRACT.md)       |
| `search_regulations`                    | Faceted search across the 120-framework Regulatory Map; returns the resolved Resource URI | `{ jurisdiction?, category?, query?, limit? = 20 }` — see [`src/docs/regulatory-map/CONTRACT.md`](src/docs/regulatory-map/CONTRACT.md)            |
| `list_regulation_facets`                | Distinct jurisdictions and categories present in the Regulatory Map                       | `{}` — see [`src/docs/regulatory-map/CONTRACT.md`](src/docs/regulatory-map/CONTRACT.md)                                                           |
| `search_radar_cache`                    | Snapshot-only Radar search (FYI + Wire). Never makes live Inoreader calls.                | `{ query?, category?, tier?, since?, limit? = 20 }` — _contract: planned alongside live BL-032 `search_radar`_                                    |

### Resources (~128)

| URI pattern                             | What it is                                                                            | mimeType           | Count |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ------------------ | ----- |
| `gst://library/<slug>`                  | GST Library reference articles (parallel to the live website pages)                   | `text/markdown`    | 2     |
| `gst://regulations/<jurisdiction>/<id>` | Regulatory Map frameworks — one per JSON file                                         | `application/json` | 120   |
| `gst://radar/fyi/latest`                | Latest annotated FYI items from the seeded snapshot                                   | `application/json` | 1     |
| `gst://radar/wire/latest`               | Latest items across all categories (merged Wire feed, snapshot)                       | `application/json` | 1     |
| `gst://radar/wire/<category>`           | Category-filtered Wire feed (`pe-ma`, `enterprise-tech`, `ai-automation`, `security`) | `application/json` | 4     |

URI stability is enforced by [`tests/integration/resource-uri-stability.test.ts`](tests/integration/resource-uri-stability.test.ts) — deliberate URI changes require updating the manifest and bumping `mcp-server/package.json` version (semver-as-contract).

Same engines, same outputs as the website — calling via MCP eliminates the browser round-trip. Remote HTTP transport, OAuth, and Workers deployment are tracked separately as BL-032 / BL-032.5 / BL-032.75 / BL-033.

Per-tool input contracts live alongside their domain in [`src/docs/<tool>/CONTRACT.md`](src/docs/contracts/README.md). The contracts registry at [`src/docs/contracts/README.md`](src/docs/contracts/README.md) tracks all of them and explains the pattern.

### Prompts (8): GST consultant workflows

Prompts ([BL-031.75](../src/docs/development/MCP_SERVER_PROMPTS_BL-031_75.md)) package GST's repeatable consulting motions as named slash-command templates. They appear in Claude Desktop's `/` picker as `/gst_*`; the user explicitly opts into a workflow at a known starting point, the prompt expands into one or more user-facing messages, and the model executes the prompt's instructions — calling Tools and reading Resources by name. The conceptual pattern reference lives at [`src/docs/prompts/README.md`](src/docs/prompts/README.md).

| Prompt                            | Args                                                                                 | Orchestrates                                                                     | Purpose                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `gst_diligence_kickoff`           | full `UserInputs` payload + `targetName`                                             | `generate_diligence_agenda` + `gst://library/vdr-structure`                      | Starter agenda for a new engagement — 4-section one-page memo (context, agenda, attention areas, VDR).   |
| `gst_target_quick_look`           | `{ targetName, productType, arr, stage, hqJurisdiction }`                            | ICG + TechPar + Tech Debt + `search_regulations`                                 | First-look brief — combines all four reads into one digestible page with Open-in-Hub deep-links.         |
| `gst_comparable_engagements_memo` | `{ targetDescription, theme?, engagementCategory? }`                                 | `search_portfolio` + `list_portfolio_facets`                                     | 3–5 comparable past engagements with one-paragraph framing each + cross-shortlist synthesis.             |
| `gst_regulatory_exposure_brief`   | `{ targetJurisdictions[], dataCategories[], productType }`                           | `search_regulations` + `gst://regulations/...` Resource bodies                   | Per-jurisdiction breakdown + cross-jurisdictional themes; product-type-tailored obligation summaries.    |
| `gst_vdr_audit`                   | `{ vdrInventory? }` (interactive when omitted)                                       | `gst://library/vdr-structure`                                                    | Mapping table + gaps + prioritized follow-up requests against the canonical 10-folder taxonomy.          |
| `gst_architecture_layer_review`   | `{ targetSummary }`                                                                  | `gst://library/business-architectures`                                           | Per-layer analysis (Software / Infra / Data / Org / Industry) + cross-layer patterns.                    |
| `gst_radar_brief_today`           | `{ category?, sinceHours? = 24 }`                                                    | `gst://radar/fyi/latest`                                                         | Daily / pre-meeting digest of recent annotated FYI items in the GST Take voice.                          |
| `gst_diligence_handoff_memo`      | full `UserInputs` payload + `targetName` + optional `agendaJson` / `comparablesJson` | `generate_diligence_agenda` + `search_portfolio` + `gst://library/vdr-structure` | Single coherent handoff memo — engagement context, agenda, attention areas, comparables, VDR follow-ups. |

#### Worked invocation: `/gst_target_quick_look`

```
/gst_target_quick_look {
  "targetName": "Acme Corp",
  "productType": "b2b-saas",
  "arr": 25000000,
  "stage": "Scaling Growth",
  "hqJurisdiction": "us-ca"
}
```

Expands into a templated user message instructing the model to (1) call `assess_infrastructure_cost_governance` with a full 20-answer payload — using `-1` ("Not sure") for any unknown — and disclose every assumption-driven `-1` in the output; (2) call `compute_techpar` with the supplied ARR + stage; (3) call `estimate_tech_debt_cost` with synthesized raw inputs from product-type + stage norms; (4) call `search_regulations` filtered to `us-ca` per relevant data category; (5) frame the four reads as one digestible page with Open-in-Hub deep-links for ICG + Tech Debt + Regulatory Map (TechPar deep-link deferred to [BL-031.95](../src/docs/development/BACKLOG.md#bl-03195-hub-tools--url-state-restoration--mcp-deep-link-surface)).

#### Authoring & versioning

Each prompt module under [`src/prompts/`](src/prompts/) exports a uniform shape — `name`, `description`, `version`, `lastReviewedAt`, `orchestrates`, `argsSchema`, `build`. Adding a prompt: write a new TS file, add it to `ALL_PROMPTS` in [`_registry.ts`](src/prompts/_registry.ts), copy the unit-test shape from [`tests/unit/prompts/diligence-kickoff.test.ts`](tests/unit/prompts/diligence-kickoff.test.ts), add a frontmatter-only golden file at `tests/examples/<slug>.golden.md`. The registry-invariant test asserts every entry's `orchestrates` resolves to a registered Tool name or known Resource URI scheme prefix; a Vitest test fails when any prompt's `lastReviewedAt` is more than 12 months old (forces a senior-consultant review cadence). Body changes that alter outputs bump the prompt's `version` field. Senior-consultant sign-off is the binding acceptance criterion for new prompts — golden snapshots regression-test on each Claude model upgrade.

#### Last verified (BL-031.75 surface)

> _V1–V8 evidence will be recorded here during senior-consultant verification (each ≤ 6 lines per prompt). The verification punch-list lives in the architecture doc at [`MCP_SERVER_PROMPTS_BL-031_75.md` § Verification punch-list](../src/docs/development/MCP_SERVER_PROMPTS_BL-031_75.md#verification-punch-list-v1v8--one-per-prompt)._

---

## How Resources work in this server

[BL-031.5](../src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md) introduced MCP Resources alongside the existing Tools. Three operational rules apply:

### URI taxonomy

- `gst://library/<slug>` — Library articles. Slugs are stable identifiers (`business-architectures`, `vdr-structure`).
- `gst://regulations/<jurisdiction>/<framework-id>` — Regulatory Map frameworks. Jurisdictions are 2-letter ISO codes (`eu`, `gb`, `us`, `ca`) or 2-segment sub-regions (`us-ca`, `ca-qc`, `ca-ab`). Framework IDs are short slugs (`gdpr`, `ccpa`, `dpa`).
- `gst://radar/fyi/latest`, `gst://radar/wire/latest`, `gst://radar/wire/<category>` — snapshot-backed Radar tiers. Per-item URIs (`gst://radar/item/<id>`) are NOT pre-registered; use `search_radar_cache` to fetch items directly.

### Snapshot semantics (Radar only)

The local server reads exclusively from `<repo>/.cache/inoreader/`, populated by `npm run radar:seed` from the repo root. **No live Inoreader API calls are made** — the shared 200 req/day budget is protected. The ESLint `no-restricted-imports` rule on `mcp-server/src/**` enforces this structurally: importing the live client (`src/lib/inoreader/client`) fails lint.

If the snapshot is missing, Radar Resources return a structured error with the message: `Radar snapshot not found. Run `npm run radar:seed` from the gst-website repo root to populate the local cache.` Tools return the same error shape with `isError: true`.

### Content sources

- **Library articles** live at [`src/data/library/<slug>/article.md`](../src/data/library/) as parallel-canonical digests of the live website pages. Each article is ~25–33% of the original Astro page; the live page is authoritative if the two drift. See the article frontmatter for the full policy.
- **Regulations** are sourced verbatim from [`src/data/regulatory-map/*.json`](../src/data/regulatory-map/) — one Resource per file. The `id` field is parsed into `<jurisdiction>/<framework-id>` for the URI; URIs are decoupled from filenames so renames don't break clients.
- **Radar** items come from the seeded snapshot only; the snapshot's `lastSeededAt` mtime is included in every Resource response so consumers can decide whether to re-seed.

---

## Install & build

| Step                  | Where to run it                                                                                                                                                                                                                                       | Command                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Install dependencies  | **Repo root** (`<repo>/`) — the `workspaces` field is in the root `package.json`, so install must run there. It installs root + `mcp-server` deps in one pass and hoists shared packages (zod, typescript, vitest) into the top-level `node_modules`. | `npm install`                                                                                                         |
| Build the server      | **Either** the workspace dir **or** the root via `npm -w`.                                                                                                                                                                                            | `cd mcp-server && npm run build`<br>— or —<br>`npm -w @gst/mcp-server run build`                                      |
| Smoke-test the binary | **Repo root** (path is repo-relative).                                                                                                                                                                                                                | `node mcp-server/dist/index.js < /dev/null`<br>→ prints `[gst-mcp] connected on stdio` and exits because stdin closed |

`npm run build` runs `tsc --noEmit && node build.mjs` — see [Build pipeline](#build-pipeline) below for what each step does and why bundling.

When stdin is open (a real MCP client connection), the process stays alive and speaks JSON-RPC over stdout.

---

## Configure clients

Replace `<ABSOLUTE_PATH_TO_REPO>` with the absolute path to your local clone (e.g. `/Users/you/code/gst-website` or `C:\\Code\\gst-website`).

### Claude Code

The repo ships an [`.mcp.json`](../.mcp.json) at the root that auto-registers this server when you open the project in Claude Code. **No manual configuration required** — just `npm run build` once and the tools become available.

If you want the server available outside this repo, add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "gst": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/mcp-server/dist/index.js"]
    }
  }
}
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "gst": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. The `gst` server should appear in the tool picker.

### Cursor

Edit `~/.cursor/mcp.json` (or use Cursor Settings → MCP):

```json
{
  "mcpServers": {
    "gst": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/mcp-server/dist/index.js"]
    }
  }
}
```

---

## Worked examples

### `generate_diligence_agenda`

Sample call (paste into a Claude conversation that has `gst` enabled — Claude figures out tool invocation from natural language; this is roughly the schema):

```json
{
  "transactionType": "majority-stake",
  "productType": "b2b-saas",
  "techArchetype": "modern-cloud-native",
  "headcount": "51-200",
  "revenueRange": "5-25m",
  "growthStage": "scaling",
  "companyAge": "5-10yr",
  "geographies": ["us", "eu"],
  "businessModel": "productized-platform",
  "scaleIntensity": "moderate",
  "transformationState": "actively-modernizing",
  "dataSensitivity": "high",
  "operatingModel": "product-aligned-teams"
}
```

Returns a `GeneratedScript` with `topics[]`, `attentionAreas[]`, `triggerMap`, and `metadata`. See [`src/utils/diligence-engine.ts`](../src/utils/diligence-engine.ts) for the full output shape.

### `search_portfolio`

```json
{ "search": "platform", "limit": 3 }
```

Returns `{ matches: Project[], totalMatched: number, returned: number }` — the `"platform"` query currently surfaces 42 matches across the dataset; tighten with `theme` or `engagement` (`"Buy-Side"` / `"Sell-Side"`) to narrow.

### `list_portfolio_facets`

```json
{}
```

Returns `{ themes, engagementCategories, growthStages, years }` — a snapshot of every distinct value present in the dataset, useful before composing a `search_portfolio` query.

---

## Smoke test (manual parity check)

> **Last verified (BL-031 surface)**: April 27, 2026 — all three BL-031 tools invoked from Claude Code with `gst` server registered via [`.mcp.json`](../.mcp.json). Recorded outputs:
>
> - `generate_diligence_agenda` (canonical 13-field payload from this README, with `geographies: ["us", "eu"]`): returned **20 questions across 4 topics**, **4 attention areas** (3 high-relevance: Cross-Border Data Compliance, AI Commodity Risk, Sensitive Data Breach Liability; 1 medium-relevance: Data Classification Maturity Gap), complete `triggerMap` with dimension labels matching [`src/docs/diligence/CONTRACT.md`](src/docs/diligence/CONTRACT.md) field-overview, full `metadata.inputSummary` echo. `topics[]` non-empty.
> - `search_portfolio { search: "platform", limit: 3 }`: returned `totalMatched: 42, returned: 3` — top three matches **Voss** (Cross-Border Payments, Sell-Side, $156M ARR), **Ecological Eagle** (Government Affairs, Buy-Side, $74M ARR), **Atlas** (Healthcare RCM, Buy-Side, $67M ARR).
> - `list_portfolio_facets {}`: returned **15 themes**, **2 engagement categories** (`Buy-Side`, `Sell-Side`), **6 growth stages**, years **2022-2026**.
> - Invalid-input rejection (`generate_diligence_agenda` with `transactionType: "blow-job"`): clean `Input validation error: Invalid arguments for tool generate_diligence_agenda: transactionType: Invalid option: expected one of "full-acquisition"|"majority-stake"|"business-integration"|"carve-out"|"venture-series"` — no stack trace, valid options listed inline.
> - Binary smoke (`node mcp-server/dist/index.js < /dev/null`): printed `[gst-mcp] connected on stdio` to stderr, exited cleanly when stdin closed.

> **Last verified (BL-031.5 surface)**: April 29, 2026 — six new tools and three Resource families exercised end-to-end against Claude Desktop with the gst MCP server registered via `claude_desktop_config.json`. Side-by-side wizard parity confirmed for every Tool; Resources confirmed reachable via the connectors UX. Recorded outputs (real values, not approximations):
>
> - **`assess_infrastructure_cost_governance`** with the canonical 20-answer payload (10 deliberate scores + 3 "Not sure" + 7 zero-answer at `companyStage: "series-bc"`): MCP returned `overallScore: 32, maturityLevel: "Aware"`, all 6 domain scores (33/42/56/0/33/25), `showFoundationalFlag: true` (d1 "Visibility and Tagging" at threshold), `answeredCount: 20, skippedCount: 3`, **13 recommendations in deterministic priority order**. Website wizard at `/hub/tools/infrastructure-cost-governance/` produced **byte-for-byte identical output** for the same answer map.
> - **`compute_techpar`** with `arr: 25M, stage: series_bc, infraHosting: 80K/mo, infraPersonnel: 600K, rdOpEx: 4M, rdCapEx: 500K, engFTE: 25` (Cash basis, Quick mode, 30% growth): MCP returned `total: $6,060,000, totalTechPct: 24.24, zone: "ahead"`, all 4 per-category zones and benchmarks, `gap.underinvestGap: $12.14M`. Website wizard produced **byte-for-byte identical output** (display rounding aside).
> - **`estimate_tech_debt_cost`** with `teamSize: 8, salary: $150K, maintenanceBurdenPct: 25, deployFrequency: "Bi-weekly", incidents: 3, mttrHours: 4, remediationBudget: $522K, arr: $10.3M, remediationPct: 70, contextSwitchOn: false` (slider-quantized values; see BL-034 cleanup item on direct-input quantization): MCP returned `annualCost: $340,384.62, totalMonthly: $28,365.38, debtPctArr: 3.3047%, paybackMonths: 26.29, doraLabel: "High", V: 1.1, hoursLostPerEng: 10`. Website wizard produced **byte-for-byte identical output** (URL-fragment audit confirmed input identity by construction).
> - **`search_regulations { jurisdiction: "eu", category: "data-privacy" }`**: returned matches including GDPR with `uri: gst://regulations/eu/gdpr`. Subsequent `resources/read gst://regulations/eu/gdpr` returned the full Regulation JSON (regions array, effective date 2018-05-25, 7 keyRequirements, penalty text).
> - **`list_regulation_facets {}`**: returned **38 jurisdictions**, **4 categories** (`ai-governance`, `cybersecurity`, `data-privacy`, `industry-compliance`), `totalFrameworks: 120`.
> - **`resources/list`** at server startup (per Claude Desktop MCP log): **128 Resources** — Library × 2 + Regulations × 120 + Radar × 6. Frozen-manifest URI-stability test passes against the same set.
> - **`gst://library/vdr-structure`** brought into a Claude Desktop conversation via the connectors UX: model returned all 9 folder categories (Product, Software Architecture, Infrastructure & Operations, SDLC, Data/Analytics/AI, Security, People & Organization, Corporate IT, Governance & Compliance) in exact order with no paraphrasing or hallucination.
> - **`gst://regulations/eu/gdpr`** brought into a Claude Desktop conversation: model cited both factual checks verbatim — `72 hours` breach notification window and `Up to 4% of annual global turnover or EUR 20 million, whichever is greater` penalty.
> - **`search_radar_cache { tier: "fyi" }`** with `.cache/inoreader/` moved aside: returned the structured `isError: true` envelope with text exactly `Radar snapshot not found. Run \`npm run radar:seed\` from the gst-website repo root to populate the local cache.` — no stack trace, no exception leak. Re-seeded; subsequent invocation returned normal data.
>
> **Two intentional surface differences confirmed in passing**: (1) the ICG MCP API accepts sparse `answers` maps that the wizard cannot produce — see [`icg/CONTRACT.md`](src/docs/icg/CONTRACT.md) hidden semantics; (2) the Tech Debt MCP API accepts truly raw values where the wizard quantizes through slider positions — see BL-034 cleanup item.
>
> Continuous regression coverage: 93 vitest cases (24 unit + 9 integration BL-031 + 14 unit BL-031.5 + 22 unit + 5 URI-stability + 2 expanded protocol-roundtrip cases for Resources) running on every push that touches `mcp-server/**` (see [`.github/workflows/test-mcp-server.yml`](../.github/workflows/test-mcp-server.yml)).

After a build, with a real MCP client connected:

1. Run `generate_diligence_agenda` with the example payload above. Compare the topic list to `https://globalstrategic.tech/hub/tools/diligence-machine` filled with the same answers — outputs should be byte-identical.
2. Run `search_portfolio` with `{ "search": "platform", "limit": 3 }`. Compare to `https://globalstrategic.tech/ma-portfolio` with "platform" in the search box — the first 3 matches should align (current dataset returns 42 total matches).
3. Run `list_portfolio_facets` — themes/years should match the M&A portfolio page's filter chips.

> **Note on free-text search behavior**: `search` is a substring match across `codeName`, `industry`, `summary`, and `technologies`. Combining it with an `engagement` filter applies AND semantics, so a narrow term (e.g. `"CRM"`) paired with the wrong engagement may legitimately return zero — verify against `list_portfolio_facets` and the unfiltered count first.

Engine parity with zero behavioral divergence is the explicit BL-031 outcome.

---

## How this fits with sibling initiatives

| BL        | Adds                                                                                         | File-system footprint                                                                                                             | Status  |
| --------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------- |
| BL-031    | Local stdio + diligence + portfolio tools                                                    | `mcp-server/src/{index,schemas}.ts`, `mcp-server/src/tools/*`                                                                     | ✅ Done |
| BL-031.5  | Hub Surface Extension — ICG/TechPar/Tech Debt tools, Library + Regulations + Radar Resources | `mcp-server/src/resources/`, `mcp-server/src/content/`, `mcp-server/src/tools/{icg,techpar,tech-debt,regulations,radar-cache}.ts` | ✅ Done |
| BL-031.75 | Prompts primitive (`gst_*` slash-commands)                                                   | `mcp-server/src/prompts/`, `mcp-server/tests/prompts/`                                                                            | Backlog |
| BL-031.85 | Tool Input Contracts (registry + per-tool CONTRACT.md docs)                                  | `mcp-server/src/docs/contracts/`, `mcp-server/src/docs/<tool>/CONTRACT.md`                                                        | ✅ Done |
| BL-032    | HTTP transport on Cloudflare Workers                                                         | `mcp-server/src/worker.ts`, `mcp-server/src/auth/`                                                                                | Backlog |
| BL-032.5  | Remote Resources + Prompts, scope catalog, Worker Cron for radar refresh                     | `mcp-server/src/cache/`, `mcp-server/src/cron/`                                                                                   | Backlog |
| BL-032.75 | Production observability maturity (SLOs, dashboards, alerts)                                 | `mcp-server/src/metrics/`, `mcp-server/observability/`                                                                            | Backlog |
| BL-033    | OAuth, audit logs, prompt-injection hardening                                                | `mcp-server/src/auth/oauth/`                                                                                                      | Backlog |

The `src/` layout is additive — sibling work drops in alongside `tools/` without restructuring.

---

## Troubleshooting

- **Server won't start under Claude Desktop.** Logs are stderr-only — stdout is reserved for the MCP protocol. Check the desktop client's MCP log panel or run `node mcp-server/dist/index.js` standalone to see startup output.
- **Tool changes not appearing.** Claude Desktop caches the server tool list. Quit and relaunch the app (not just close the window).
- **`generate_diligence_agenda` returns "validation failed".** The 13-field input must use the exact enum values from [`src/data/diligence-machine/wizard-config.ts`](../src/data/diligence-machine/wizard-config.ts) — `TRANSACTION_TYPE_IDS`, `PRODUCT_TYPE_IDS`, etc. Run the website wizard at `/hub/tools/diligence-machine` to inspect valid IDs.
- **Stale data after `projects.json` edit.** Portfolio data is bundled at build time — re-run `npm run build` in `mcp-server/` after editing `src/data/ma-portfolio/projects.json`.
- **`@cfworker/json-schema` not found.** v2 alpha SDK quirk — the pkg is declared as an optional peer but imported unconditionally. Resolved by adding it as a direct dep of `@gst/mcp-server`. Already in `mcp-server/package.json`.

---

## Build pipeline

`npm run build` runs two steps:

1. `tsc --noEmit` — strict type-check across the whole import graph (mcp-server src + the website schemas/utils it pulls in).
2. `node build.mjs` — esbuild bundles `src/index.ts` into a single `dist/index.js`. The MCP SDK and zod stay external (resolved from `node_modules` at runtime); everything else is inlined, including the 61-row `projects.json`.

Why bundle instead of vanilla `tsc`? The website source uses extensionless imports (Astro convention). Plain `tsc --moduleResolution NodeNext` rejects those at runtime. Bundling sidesteps the resolution issue cleanly.

---

_Last Updated: 2026-04-29_
