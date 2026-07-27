# @gst/mcp-server

Local-stdio Model Context Protocol server that exposes GST's pure-engine utilities to MCP-aware clients (Claude Desktop, Claude Code, Cursor).

> **Architecture and rationale**: [`src/docs/ARCHITECTURE.md`](src/docs/ARCHITECTURE.md) (maintained; initiative history archived at [`src/docs/development/_archive/`](../src/docs/development/_archive/README.md)). Sibling initiatives (BL-031.5 Resources, BL-031.75 Prompts, BL-032/.5/.75 Remote, BL-033 Hardening) are tracked in [`BACKLOG.md`](../src/docs/development/BACKLOG.md).

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

> **Want to see one of these scenarios end-to-end?** [`src/docs/tools/diligence/USAGE.md`](src/docs/tools/diligence/USAGE.md) walks through scenario #1 (live agenda drafting) for a hypothetical PE majority-stake TDD — full prose prompt, schema mapping, engine output, trigger map, comparable engagements, and iteration patterns. Each per-tool directory under `src/docs/<tool>/` ships its own `USAGE.md` walkthrough.

---

## What's exposed

### Tools (16; counting the deprecated `search_radar_cache` alias retained one release)

| Tool                                                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Transport      | Input                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate_diligence_agenda`                             | Wraps `generateScript` — Inquisitor's Script for a deal profile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | both           | 13-field `UserInputs` payload — full reference in [`src/docs/tools/diligence/CONTRACT.md`](src/docs/tools/diligence/CONTRACT.md)                                                                                                                        |
| `search_portfolio`                                      | Wraps `filterProjects` — searches the 61-project anonymized M&A dataset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | both           | `{ search?, theme? = 'all', engagement? = 'all', limit? = 20 }` (max 61) — see [`src/docs/tools/portfolio/CONTRACT.md`](src/docs/tools/portfolio/CONTRACT.md)                                                                                           |
| `list_portfolio_facets`                                 | Deduplicated themes / engagement categories / growth stages / years                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | both           | `{}` — see [`src/docs/tools/portfolio/CONTRACT.md`](src/docs/tools/portfolio/CONTRACT.md)                                                                                                                                                               |
| `assess_infrastructure_cost_governance`                 | Wraps `calculateResults` — ICG maturity scoring + recommendations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | both           | `{ answers, companyStage? }` — see [`src/docs/tools/icg/CONTRACT.md`](src/docs/tools/icg/CONTRACT.md)                                                                                                                                                   |
| `compute_techpar`                                       | Wraps `compute` — TechPar benchmark, zone, KPIs, 36-month gap projection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | both           | 14-field `TechParInputs` — see [`src/docs/tools/techpar/CONTRACT.md`](src/docs/tools/techpar/CONTRACT.md)                                                                                                                                               |
| `estimate_tech_debt_cost`                               | Wraps `calculateFromRawInputs` — annual / monthly debt-carrying cost (raw values)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | both           | `{ teamSize, salary, maintenanceBurdenPct, deployFrequency, ... }` — see [`src/docs/tools/tech-debt/CONTRACT.md`](src/docs/tools/tech-debt/CONTRACT.md)                                                                                                 |
| `search_regulations`                                    | Faceted search across the 120-framework Regulatory Map; returns the resolved Resource URI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | both           | `{ jurisdiction?, category?, query?, limit? = 20 }` — see [`src/docs/tools/regulatory-map/CONTRACT.md`](src/docs/tools/regulatory-map/CONTRACT.md)                                                                                                      |
| `list_regulation_facets`                                | Distinct jurisdictions and categories present in the Regulatory Map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | both           | `{}` — see [`src/docs/tools/regulatory-map/CONTRACT.md`](src/docs/tools/regulatory-map/CONTRACT.md)                                                                                                                                                     |
| **`search_radar`** _(BL-032 Phase 4c)_                  | **Live** Radar search — calls Inoreader with a 6h Upstash cache. Sister to `search_radar_offline` (same shape; different source). Per-key 5/min, 50/day budget; circuit breaker opens on Inoreader 429 and, while open, serves the cached snapshot flagged `liveInfo.degraded` rather than failing.                                                                                                                                                                                                                                                                                                                                                                        | **both**       | `{ category? }` — see [`src/docs/tools/radar/CONTRACT.md` § Live tool surface](src/docs/tools/radar/CONTRACT.md#live-tool-surface-bl-032-phase-4c)                                                                                                      |
| **`get_latest_insights`** _(BL-032 Phase 4c)_           | Convenience wrapper — N most recent FYI items (annotated tier). Same Inoreader budget + cache as `search_radar`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **both**       | `{ limit? = 10, category? }` (limit 1-30) — see [`src/docs/tools/radar/CONTRACT.md` § Live tool surface](src/docs/tools/radar/CONTRACT.md#live-tool-surface-bl-032-phase-4c)                                                                            |
| `search_radar_offline`                                  | Snapshot-only Radar search — mirrors `/hub/radar`; never makes live Inoreader calls. **Stdio-only** (BL-032 Q12 — uses `node:fs`/`node:crypto`). Renamed from `search_radar_cache` in [BL-032 Phase 4b](../src/docs/development/_archive/MCP_SERVER_REMOTE_BL-032.md#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited); deprecated `search_radar_cache` alias retained one release per [BREAKING_CHANGES.md](BREAKING_CHANGES.md).                                                                                                                                                                                            | **stdio-only** | `{ category? }` — see [`src/docs/tools/radar/CONTRACT.md`](src/docs/tools/radar/CONTRACT.md). BL-031.95 Phase 3.A capability-mirror invariant; cache TTL 24h.                                                                                           |
| **`generate_information_request_list_xlsx`** _(BL-044)_ | Generates the canonical GST Information Request List as a downloadable fillable `.xlsx`. Pure-function pipeline: generator-source load → markdown parse → customize (skip-if directives + section filter + per-question exclusion + custom requests) → XLSX render → base64. Returns `{ filename, base64, mimeType, byteLength, sectionCount, bulletCount, canonicalUrl }`. Reads the decoupled generator source (`src/data/irl/…`) — the same content the prompt embeds; with no configuration args the file is the universal template. `transactionContext` fires authored skip-if directives (BL-044.5); every removal leaves Reference-ID **gaps**, never renumbering. | **both**       | `{ targetName?, transactionContext?, productSummary?, companyName?, projectName?, includeSections?, excludeRequests?, customRequests?, showCanonicalReference? }` (all optional; `excludeRequests` = `'NN-II'` keys — discover via `list_irl_requests`) |
| **`list_irl_requests`** _(per-question removal)_        | Key-discovery companion: every canonical IRL question as `{ key, section, sectionTitle, text, skipIf? }` — maps natural language ("drop the competitive-landscape question") to the exact `excludeRequests` key, and shows which questions each `transactionContext` auto-skips. Read-only, idempotent, parses the same bundled generator source the generate tool renders.                                                                                                                                                                                                                                                                                                | **both**       | `{}`                                                                                                                                                                                                                                                    |

### Resources (~129)

| URI pattern                              | What it is                                                                            | mimeType           | Count | Used by prompts (BL-031.75)                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ------------------ | ----- | ------------------------------------------------------------------------------------------------------------- |
| `gst://library/business-architectures`   | GST Library reference: 5-layer business & technology architecture                     | `text/markdown`    | 1     | `gst_architecture_layer_review` (embedded as second message; layers used verbatim)                            |
| `gst://library/vdr-structure`            | GST Library reference: canonical VDR folder taxonomy                                  | `text/markdown`    | 1     | `gst_diligence_kickoff`, `gst_diligence_handoff_memo`, `gst_irl_ingestion` (folder labels)                    |
| `gst://library/information-request-list` | GST one-page intake checklist (VDR-9 + Basics prelude)                                | `text/markdown`    | 1     | `gst_information_request_list` (embedded as second message; bullets reproduced verbatim)                      |
| `gst://regulations/<jurisdiction>/<id>`  | Regulatory Map frameworks — one per JSON file                                         | `application/json` | 120   | (analyst-pinnable; not embedded — see `gst_regulatory_exposure_brief` for grounding via search-result fields) |
| `gst://radar/fyi/latest`                 | Latest annotated FYI items from the seeded snapshot                                   | `application/json` | 1     | `gst_radar_brief_today` (embedded as second message; items grouped + summarized)                              |
| `gst://radar/wire/latest`                | Latest items across all categories (merged Wire feed, snapshot)                       | `application/json` | 1     | (analyst-pinnable)                                                                                            |
| `gst://radar/wire/<category>`            | Category-filtered Wire feed (`pe-ma`, `enterprise-tech`, `ai-automation`, `security`) | `application/json` | 4     | (analyst-pinnable)                                                                                            |

URI stability is enforced by [`tests/integration/resource-uri-stability.test.ts`](tests/integration/resource-uri-stability.test.ts) — deliberate URI changes require updating the manifest and bumping `mcp-server/package.json` version (semver-as-contract).

**Resource embedding pattern** (V1 finding, fixed in Commit 5): MCP Resources are not model-fetchable from prompt expansion in Claude Desktop — they're surfaced through the connectors UX as user-pinnable references. Prompts that need a Resource's body inline (canonical taxonomies, snapshots) ship it as an `EmbeddedResource` content block (second message in `build()`'s output), implemented in [`src/prompts/embed.ts`](src/prompts/embed.ts) — `embedLibraryArticle()` and `embedFyiRadarSnapshot()`. The 120-framework `gst://regulations/...` set is too large to embed; instead, the search-result `summary` / `scope` / `keyRequirements` / `penalties` fields ground the `gst_regulatory_exposure_brief` body's per-framework prose. URI changes to these patterns require updating the corresponding prompt's `orchestrates` field (the registry-invariant test catches drift).

Same engines, same outputs as the website — calling via MCP eliminates the browser round-trip. Remote HTTP transport, OAuth, and Workers deployment are tracked separately as BL-032 / BL-032.5 / BL-032.75 / BL-033.

Per-tool input contracts live alongside their domain in [`src/docs/<tool>/CONTRACT.md`](src/docs/tools/README.md). The contracts registry at [`src/docs/tools/README.md`](src/docs/tools/README.md) tracks all of them and explains the pattern.

### Prompts (9): GST consultant workflows

Prompts ([ADR-0007](../src/docs/adr/0007-registered-prompt-pattern.md)) package GST's repeatable consulting motions as named slash-command templates. They appear in Claude Desktop's `/` picker as `/gst_*`; the user explicitly opts into a workflow at a known starting point, the prompt expands into one or more user-facing messages, and the model executes the prompt's instructions — calling Tools and reading Resources by name. The conceptual pattern reference lives at [`src/docs/prompts/README.md`](src/docs/prompts/README.md).

| Prompt                            | Args                                                                                                                                                                                                                                                                                                 | Orchestrates                                                                                                                                                                                                                                                                                                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gst_diligence_kickoff`           | full `UserInputs` payload + `targetName`                                                                                                                                                                                                                                                             | `generate_diligence_agenda` + `gst://library/vdr-structure`                                                                                                                                                                                                                                                        | Starter agenda for a new engagement — 4-section one-page memo (context, agenda, attention areas, VDR).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `gst_target_quick_look`           | `{ targetName, productType, arr, stage, hqJurisdiction }`                                                                                                                                                                                                                                            | ICG + TechPar + Tech Debt + `search_regulations`                                                                                                                                                                                                                                                                   | First-look brief — combines all four reads into one digestible page with Open-in-Hub deep-links.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `gst_comparable_engagements_memo` | `{ targetDescription, theme?, engagementCategory? }`                                                                                                                                                                                                                                                 | `search_portfolio` + `list_portfolio_facets`                                                                                                                                                                                                                                                                       | 3–5 comparable past engagements with one-paragraph framing each + cross-shortlist synthesis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `gst_regulatory_exposure_brief`   | `{ targetJurisdictions[], dataCategories[], productType }`                                                                                                                                                                                                                                           | `search_regulations` + `gst://regulations/...` Resource bodies                                                                                                                                                                                                                                                     | Per-jurisdiction breakdown + cross-jurisdictional themes; product-type-tailored obligation summaries.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `gst_architecture_layer_review`   | `{ targetSummary }`                                                                                                                                                                                                                                                                                  | `gst://library/business-architectures`                                                                                                                                                                                                                                                                             | Per-layer analysis (Software / Infra / Data / Org / Industry) + cross-layer patterns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `gst_radar_brief_today`           | `{ category?, sinceHours? = 24 }`                                                                                                                                                                                                                                                                    | `gst://radar/fyi/latest`                                                                                                                                                                                                                                                                                           | Daily / pre-meeting digest of recent annotated FYI items in the GST Take voice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `gst_diligence_handoff_memo`      | full `UserInputs` payload + `targetName` + optional `agendaJson` / `comparablesJson`                                                                                                                                                                                                                 | `generate_diligence_agenda` + `search_portfolio` + `gst://library/vdr-structure`                                                                                                                                                                                                                                   | Single coherent handoff memo — engagement context, agenda, attention areas, comparables, VDR follow-ups.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `gst_information_request_list`    | `{ targetName?, companyName?, projectName?, transactionContext?, includeSections?, excludeRequests?, customRequests?, showCanonicalReference?, productSummary? }` (all optional; wire-string args coerced via `arrayFromWire` / `booleanFromWire`; `excludeRequests` = comma-separated `NN-II` keys) | `gst://irl/source` + `generate_information_request_list_xlsx` _(BL-044)_                                                                                                                                                                                                                                           | Paste-ready one-page intake checklist (VDR-9 taxonomy + Basics prelude), **configurable to full parity with the Hub generator** (company/project title, section pick-list, per-question removal, custom per-section requests, canonical-row toggle). `transactionContext` fires authored skip-if directives; the one-shot body server-computes the omission list so the in-chat text matches the workbook. When called with args, **also emits a downloadable fillable `.xlsx`** via the orchestrated tool (forwarding the exact configuration). Pair with `gst_diligence_kickoff` once filled. |
| `gst_irl_ingestion`               | `{ targetName?, filledIrl?, transactionContext?, partnerLead?, projectCodeName?, mode?, verbosity?, forceTools? }` _(BL-032.6 → BL-045 PR B; renamed from `gst_diligence_sweep`)_                                                                                                                    | `generate_diligence_agenda` + `compute_techpar` + `assess_infrastructure_cost_governance` + `estimate_tech_debt_cost` + `search_regulations` + `search_radar` + `search_portfolio` + `list_portfolio_facets` + `list_regulation_facets` + `gst://library/information-request-list` + `gst://library/vdr-structure` | One-IRL → full diligence dossier (scenario-neutral: buy-side / sell-side / value-creation / unknown). Parallel fan-out across 9 tools + 2 Library Resources behind explicit inclusion gates; emits an auditable dossier with meta JSON fence, per-section audit fences, (J) gap list, (K) provenance footer, and Open-in-Hub deeplinks. Supports `extract-only` mode (JSON payloads only, no synthesis) and `compact` verbosity for downstream automation.                                                                                                                                      |

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

Expands into a templated user message instructing the model to (1) call `assess_infrastructure_cost_governance` with a full 20-answer payload — using `-1` ("Not sure") for any unknown — and disclose every assumption-driven `-1` in the output; (2) call `compute_techpar` with the supplied ARR + stage; (3) call `estimate_tech_debt_cost` with synthesized raw inputs from product-type + stage norms; (4) call `search_regulations` filtered to `us-ca` per relevant data category; (5) frame the four reads as one digestible page with Open-in-Hub deep-links for ICG + Tech Debt + Regulatory Map (TechPar deep-link deferred to [ADR-0005 — hub URL-state deep-link contract](../src/docs/adr/0005-hub-url-state-deeplink-contract.md)).

#### Authoring & versioning

Each prompt module under [`src/prompts/`](src/prompts/) exports a uniform shape — `name`, `description`, `version`, `lastReviewedAt`, `orchestrates`, `argsSchema`, `build`. Adding a prompt: write a new TS file, add it to `ALL_PROMPTS` in [`_registry.ts`](src/prompts/_registry.ts), copy the unit-test shape from [`tests/unit/prompts/diligence-kickoff.test.ts`](tests/unit/prompts/diligence-kickoff.test.ts), add a frontmatter-only golden file at `tests/examples/<slug>.golden.md`. The registry-invariant test asserts every entry's `orchestrates` resolves to a registered Tool name or known Resource URI scheme prefix; a Vitest test fails when any prompt's `lastReviewedAt` is more than 12 months old (forces a senior-consultant review cadence). Body changes that alter outputs bump the prompt's `version` field. Senior-consultant sign-off is the binding acceptance criterion for new prompts — golden snapshots regression-test on each Claude model upgrade.

#### Last verified (BL-031.75 surface)

> **Last verified (BL-031.75 surface)**: May 1, 2026 — eight prompts exercised end-to-end against Claude Desktop (model: `claude-opus-4-7`). Each invocation produced a deliverable a senior consultant signed off as "reads as if I wrote it." (One of those eight, `gst_vdr_audit`, was retired entirely 2026-05-31 via BL-036 Tier 3 — see [archived BL-036 record](../src/docs/development/_archive/MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md); the V5 trial described below is now historical record of what was shipped at the V5 sign-off, not a current surface.) Recorded outputs (real values, not approximations):
>
> - **`gst_diligence_kickoff`** with the canonical Helios Health UserInputs payload (majority-stake, b2b-saas, 51-200 headcount, 25-100m revenue, scaling, 5-10yr, ["us","eu"], productized-platform, moderate, mid-migration, high data sensitivity, product-aligned-teams): produced a four-section memo (target context, prioritized agenda, attention areas, suggested VDR requests). `generate_diligence_agenda` called once; `gst://library/vdr-structure` embedded inline (Commit 5 / V1 finding 1) — model used the canonical 9-folder taxonomy verbatim (`02 — Software Architecture` through `09 — Governance & Compliance`) with no PE-diligence taxonomy substitution.
> - **`gst_target_quick_look`** with `{ targetName: "Helios Health", productType: "b2b-saas", arr: 25000000, stage: "Scaling Growth", hqJurisdiction: "us-ca" }`: invoked all four orchestrated tools (ICG, TechPar, Tech Debt, search_regulations); produced a 5-section quick-look brief with Open-in-Hub deep-links restoring state byte-identically — ICG → `currentStep: 7` (results view, not landing); Tech Debt → all 10 inputs slider-restored; Reg Map → `?region=US-CA&filter=data-privacy` page-canonical case. The schema-canonical `q1_1`–`q6_4` IDs (20 total) were used for ICG; "Assumptions / unknowns" listed every `-1` answer.
> - **`gst_comparable_engagements_memo`** with two trials. Run 1 (no hints) on a PE-sponsored bolt-on of vertical SaaS in industrial supply chain: `list_portfolio_facets` ×1 + `search_portfolio` 6× → 5-comparable shortlist (Onfray, Chariot, Wolverine, Knapsack, Regatta) with two-tier scope synthesis (pre-LOI Regatta-shaped + post-LOI Onfray/Chariot-shaped). Run 2 (deliberately mismatched `theme: 'Healthcare'` hint): 4 comparables (Atlas, Wellness, Tempo, Oktoberfest) chosen on analogical axes; model surfaced the domain mismatch in both the search-basis preamble and closing synthesis.
> - **`gst_regulatory_exposure_brief`** with `{ targetJurisdictions: ["eu","us-ca"], dataCategories: ["data-privacy","ai-governance"], productType: "b2b-saas" }`: 4 `search_regulations` calls (one per jurisdiction × category combination), no `resources/read` calls. Penalty bands cited verbatim from the enriched `SearchResult.penalties` field — GDPR `4% global turnover or €20M`, EU AI Act `€35M / 7%` (prohibited) / `€15M / 3%` (high-risk) / `€7.5M / 1%` (misinformation), CCPA `$7,500 intentional / $2,500 unintentional + $100–$750 private right`, SB 942 `$5,000 per violation per day`. Cross-jurisdictional Theme 3 ("Enforcement scales with revenue in the EU and with volume in California") was a concrete penalty-regime comparison, not generic prose.
> - **`gst_architecture_layer_review`** with a $40M ARR healthcare RCM SaaS target summary (AWS-native, Postgres+Redis, microservices on EKS, two unintegrated tuck-ins on .NET/SQL Server and Python/Mongo, PE-owned since 2023): walked all 5 canonical layers verbatim from the embedded `gst://library/business-architectures` Library article (Software → Operational → Product → Organizational → Industry & Regulatory). 3 concrete-liability risks per layer (15 total); 2 investigation handles per layer (10 total). Closing "Cross-layer patterns" section produced 3 patterns spanning multiple layers; Pattern 1's framing — _"the unintegrated acquired stacks are not a Layer-1 problem to be solved by engineering. They are the visible symptom of a Layer-3 product strategy executed through a Layer-4 organizational structure that produces exactly the Layer-1 outcome observed"_ — is the strongest sentence in the deliverable.
> - **`gst_radar_brief_today`** with three trials. (a) `category: "enterprise-tech"`: filtered the embedded FYI snapshot to enterprise-tech, surfaced 2 items (every available item in the fixture for that category, not padded), GST Take voice, "what to watch" closings, "GST Take across the brief" synthesis. (b) Both args blank (defaults): 4-category brief (PE/M&A, Enterprise Tech, AI/Automation, Security), 1–2 items per category, cross-brief synthesis ("discipline arbitrage"). (c) Cache-missing: `Radar snapshot not found. Run `npm run radar:seed` from the gst-website repo root to populate the local cache.` surfaced verbatim, no fabricated items, no stack trace — the BL-031.5 structured-error path firing as designed.
> - **`gst_diligence_handoff_memo`** with two trials on the Helios Health payload. Trial 1 (full orchestration): produced a 6-section handoff memo (engagement context, prioritized agenda, attention areas cross-referenced to comparables, comparable engagement library, prioritized VDR follow-ups, open questions) — `generate_diligence_agenda` ×1 + `search_portfolio` 2-3× (with self-correction) + canonical VDR folder labels in section 5. Trial 2 (pre-supplied `agendaJson` + `comparablesJson`): NEITHER `generate_diligence_agenda` NOR `search_portfolio` called — model used the supplied JSON byte-for-byte; output contained exactly the 8 questions from the supplied agenda and exactly the 5 codeNames from the supplied comparables. Closing decision in section 6 ("Anchor on Gazelle if the IC wants the regulated-data scope-expansion precedent, or Inspire if the IC wants the carve-out plus IAM-remediation cost envelope") converted the shortlist into an IC-narrative recommendation. Per-comparable anchor URLs (`https://globalstrategic.tech/ma-portfolio/#<codeName>`) emitted per the V8 sign-off contract.
>
> **Verification cycle findings closed in-branch**: nine layered fixes shipped during V1–V8 verification, each captured by a regression test. The wire-shape preprocessors (`arrayFromWire` / `numberFromWire` / `enumFromWire` in [`src/prompts/wire-shape.ts`](src/prompts/wire-shape.ts)) handle three distinct Claude Desktop wire-protocol shapes (typed values, JSON-encoded strings, comma-separated bare strings) AND the empty-string-to-undefined path for unfilled optional fields. The double-optional pattern (`enumFromWire(X.optional()).optional()`) reconciles the inner-Zod parse path with the outer JSON-Schema introspection used by Claude Desktop's form renderer — documented in [`radar-brief-today.ts`](src/prompts/radar-brief-today.ts) as the canonical pattern for any future optional wire-shape arg. SearchResult enrichment ([`tools/regulations.ts`](src/tools/regulations.ts)) exposes `scope` / `keyRequirements` / `penalties` so prompts source per-framework prose from authored bullets rather than training. The `gst_vdr_audit` Tier 1 expansion (structured `vdrFolders` with optional file lists) addressed the V5 critique that folder-name-only input produced a "checklist generator" rather than a real audit; the prompt and Tiers 2-6 were retired entirely 2026-05-31 via BL-036 Tier 3 (insufficient business value) — see [archived BL-036 record](../src/docs/development/_archive/MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md).
>
> **Investigation tip**: Claude Desktop's _"Failed to attach prompt. You can try again."_ error collapses the underlying JSON-RPC `-32602` "invalid params" message. Tail `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\logs\mcp-server-gst.log` (Windows) or the equivalent on macOS to surface the specific field-level mismatch (e.g., enum value typo, wire-shape preprocess miss).
>
> Continuous regression coverage: 222 vitest cases running on every push that touches `mcp-server/**` (was 237 prior to BL-036 Tier 3 retirement of `gst_vdr_audit`, which removed ~15 unit cases). Seven golden snapshots committed at [`tests/examples/*.golden.md`](tests/examples/) capture the surviving prompt invocation outputs for cross-Claude-model regression diffing (was 8 — `vdr-audit.golden.md` removed with the Tier 3 retirement).

#### Last verified (BL-031.95 surface)

> **Last verified (BL-031.95 surface)**: May 3, 2026 — five prompt body updates + four URL-state surfaces shipped across Phases 1–5 of the [Hub Tools URL State Restoration & MCP Deep-Link Surface](../src/docs/adr/0005-hub-url-state-deeplink-contract.md) initiative (design doc archived). Engineering correctness verified by 317 mcp-server vitest cases + 1101 project vitest cases (mcp-server typecheck + project astro check + project lint clean). The five updated prompts are at v0.0.3 (`gst_target_quick_look`, `gst_diligence_kickoff`, `gst_diligence_handoff_memo`, `gst_radar_brief_today`) and v0.0.2 (`gst_comparable_engagements_memo`).
>
> **What this initiative changed end-to-end**:
>
> - **Phase 1 — TechPar.** `infraHosting` → `infraHostingAnnual` rename + drop `× 12` annualization across schema / engine / wizard DOM helper / MCP wrapper. MCP `compute_techpar` now emits `deeplink` via the existing readable-params encoder. `.describe()` pass on every TechPar schema field.
> - **Phase 2 — Diligence Machine.** Schema gained the `'unknown'` sentinel on every UserInputs field; engine widens conservatively when an input is `'unknown'`; MCP wrapper emits `deeplink` (readable-params encoder under `src/utils/diligence-url.ts`) and surfaces `unknownDimensionCount`. Wizard gained the "Not sure" affordance per step. Both diligence prompts (`gst_diligence_kickoff` v0.0.2, `gst_diligence_handoff_memo` v0.0.2) made every field optional with default `'unknown'` and added a low-confidence callout when ≥ 7 of 13 dimensions are unknown.
> - **Phase 3 — Radar.** Capability-mirror refactor: dropped `query` / `tier` / `since` / `limit` from `search_radar_offline` to mirror the website's single category-pill filter (the cache itself has a 24h TTL, so a `since` filter would have been redundant against the website UX). `gst_radar_brief_today` lost its `sinceHours` argument in v0.0.2. URL state added to `/hub/radar` page via `src/utils/radar-url.ts`; MCP wrapper emits `deeplink`. Authored `src/docs/tools/radar/CONTRACT.md` + `src/docs/tools/radar/USAGE.md`.
> - **Phase 4 — M&A Portfolio.** Capability-mirror refactor: dropped `limit` from `search_portfolio` to mirror the website's render-all-61 behaviour. URL state added to `/ma-portfolio` page via `src/utils/portfolio-url.ts`; MCP wrapper emits `deeplink`. `.describe()` pass on every `ProjectSchema` field. Authored `src/docs/tools/portfolio/CONTRACT.md` + `src/docs/tools/portfolio/USAGE.md` (closes the BL-034 broken-link follow-up for the missing portfolio contract pair).
> - **Phase 5 — Prompt body updates** (this stanza's authoring trigger): all five prompts that consume URL-stateful tools now surface the `deeplink` field as an "Open in Hub" link in their closing memo. The V8-era per-codeName static anchor URL pattern in `gst_diligence_handoff_memo` was retired (the website has no codeName-level anchor handler; the canonical click-through is the filtered-grid deeplink from `search_portfolio`). Stale "TechPar deep-link will be added when the page supports URL state" disclaimer in `gst_target_quick_look` was retired.
>
> **Live V-trial re-runs against the new prompt versions**: per CLAUDE.md § 4a (no deferred tech debt), the running mcp-server subprocess in any given Claude Desktop session is started from `dist/index.js` at session start and cannot be reloaded with newly-built code mid-session — a real infrastructure constraint. Engineering correctness for the new prompt body shapes is verified by the per-prompt unit tests (which exercise `build()` against valid argsSchema input and assert deeplink-surface contracts at the body string level) plus the prompt-staleness Vitest catching version drift. UI-level verification on Claude Desktop lands naturally on the next MCP-server restart and is **not** tracked as deferred work; the eight golden snapshots in `tests/examples/*.golden.md` carry forward from their pre-Phase-5 V-trial baselines with frontmatter-only version bumps until a fresh round of senior-consultant V-trial sign-offs is recorded.

---

## How Resources work in this server

[BL-031.5](../src/docs/adr/0004-hub-surface-resources-import-restriction.md) introduced MCP Resources alongside the existing Tools. Three operational rules apply:

### URI taxonomy

- `gst://library/<slug>` — Library articles. Slugs are stable identifiers (`business-architectures`, `vdr-structure`, `information-request-list`).
- `gst://regulations/<jurisdiction>/<framework-id>` — Regulatory Map frameworks. Jurisdictions are 2-letter ISO codes (`eu`, `gb`, `us`, `ca`) or 2-segment sub-regions (`us-ca`, `ca-qc`, `ca-ab`). Framework IDs are short slugs (`gdpr`, `ccpa`, `dpa`).
- `gst://radar/fyi/latest`, `gst://radar/wire/latest`, `gst://radar/wire/<category>` — snapshot-backed Radar tiers. Per-item URIs (`gst://radar/item/<id>`) are NOT pre-registered; use `search_radar_offline` to fetch items directly.

### Snapshot semantics (Radar only)

The local server reads exclusively from `<repo>/.cache/inoreader/`, populated by `npm run radar:seed` from the repo root (deterministic mock fixtures; clear with `npm run radar:unseed`). **No live Inoreader API calls are made** — the shared 200 req/day budget is protected. The ESLint `no-restricted-imports` rule on `mcp-server/src/**` enforces this structurally: importing the live client (`src/lib/inoreader/client`) fails lint.

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

### Remote (BL-032 — bearer-token auth, in progress)

Once BL-032 ships to production, the same surface is reachable over HTTPS at `mcp.globalstrategic.tech` with a per-team-member bearer token — no clone, no `npm run build`, no `dist/index.js` path. Useful for: borrowed laptops, mobile, ephemeral CI agents, Slack/Discord bots.

**Phase 2 status (2026-05-04)**: bearer-token auth + CORS substrate is in place; `wrangler dev` works locally; production URL goes live in [deploy topology](src/docs/ARCHITECTURE.md#auth-cors--deploy-topology).

For team members configuring a remote client (per-client snippets, troubleshooting, rate-limit etiquette): see [`src/docs/operations/REMOTE_CLIENT_SETUP.md`](src/docs/operations/REMOTE_CLIENT_SETUP.md).

For operators issuing or rotating bearer keys: see [`src/docs/operations/AUTH.md`](src/docs/operations/AUTH.md).

For deploy/incident runbook: see [`src/docs/operations/DEPLOY.md`](src/docs/operations/DEPLOY.md).

### Health endpoint (BL-032 Phase 5)

The Worker exposes `GET /health` as an unauthenticated, CORS-enabled probe. Response shape:

```json
{
  "ok": true,
  "version": "0.1.0",
  "gitSha": "deadbeef1234",
  "phase": "BL-032 Phase 5 (observability)",
  "redis": "ok",
  "inoreader": "ok",
  "inoreaderObservedAt": "2026-05-04T18:30:00.000Z"
}
```

Field semantics:

- **`ok`**: aggregate signal — `true` when both `redis === 'ok'` AND `inoreader !== 'degraded'`. Note: `inoreader === 'unknown'` does NOT flip `ok` to false (unknown means no recent traffic, not failure).
- **`redis`**: `'ok'` if a single Upstash GET succeeds; `'degraded'` if it throws or creds aren't bound.
- **`inoreader`**: `'ok'` / `'degraded'` / `'unknown'`, read from a 5-minute-TTL cache key (`mcp:inoreader:last-status`) that the radar-live tools update as a side-effect of normal traffic. **The health endpoint does NOT make a live Inoreader call** — Q8 in the BL-032 doc explicitly forbids that, since uptime monitors hammer health endpoints and would burn the 200/day Inoreader budget.
- **`inoreaderObservedAt`**: ISO timestamp of the last cached Inoreader status, or `null` if no recent traffic. A monitoring dashboard can alert on stale values (e.g. older than 30 minutes during business hours).
- **`gitSha`**: commit SHA injected at deploy time via `wrangler deploy --var GIT_SHA=...`; defaults to `'unknown'` locally.

Example probe:

```bash
curl https://mcp.globalstrategic.tech/health | jq
```

The endpoint always returns HTTP 200 — degraded subsystems flip the `ok` field to `false` and surface their state, but a degraded Worker is still reachable. Only an actual Worker crash returns 5xx; treat 5xx from `/health` as the page-oncall signal, `ok: false` with subsystem detail as a non-pageable degraded signal.

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
> - `generate_diligence_agenda` (canonical 13-field payload from this README, with `geographies: ["us", "eu"]`): returned **20 questions across 4 topics**, **4 attention areas** (3 high-relevance: Cross-Border Data Compliance, AI Commodity Risk, Sensitive Data Breach Liability; 1 medium-relevance: Data Classification Maturity Gap), complete `triggerMap` with dimension labels matching [`src/docs/tools/diligence/CONTRACT.md`](src/docs/tools/diligence/CONTRACT.md) field-overview, full `metadata.inputSummary` echo. `topics[]` non-empty.
> - `search_portfolio { search: "platform", limit: 3 }`: returned `totalMatched: 42, returned: 3` — top three matches **Voss** (Cross-Border Payments, Sell-Side, $156M ARR), **Ecological Eagle** (Government Affairs, Buy-Side, $74M ARR), **Atlas** (Healthcare RCM, Buy-Side, $67M ARR).
> - `list_portfolio_facets {}`: returned **15 themes**, **2 engagement categories** (`Buy-Side`, `Sell-Side`), **6 growth stages**, years **2022-2026**.
> - Invalid-input rejection (`generate_diligence_agenda` with `transactionType: "blow-job"`): clean `Input validation error: Invalid arguments for tool generate_diligence_agenda: transactionType: Invalid option: expected one of "full-acquisition"|"majority-stake"|"business-integration"|"carve-out"|"venture-series"` — no stack trace, valid options listed inline.
> - Binary smoke (`node mcp-server/dist/index.js < /dev/null`): printed `[gst-mcp] connected on stdio` to stderr, exited cleanly when stdin closed.

> **Last verified (BL-031.5 surface)**: April 29, 2026 — six new tools and three Resource families exercised end-to-end against Claude Desktop with the gst MCP server registered via `claude_desktop_config.json`. Side-by-side wizard parity confirmed for every Tool; Resources confirmed reachable via the connectors UX. Recorded outputs (real values, not approximations):
>
> - **`assess_infrastructure_cost_governance`** with the canonical 20-answer payload (10 deliberate scores + 3 "Not sure" + 7 zero-answer at `companyStage: "series-bc"`): MCP returned `overallScore: 32, maturityLevel: "Aware"`, all 6 domain scores (33/42/56/0/33/25), `showFoundationalFlag: true` (d1 "Visibility and Tagging" at threshold), `answeredCount: 20, skippedCount: 3`, **13 recommendations in deterministic priority order**. Website wizard at `/hub/tools/infrastructure-cost-governance/` produced **byte-for-byte identical output** for the same answer map.
> - **`compute_techpar`** with `arr: 25M, stage: series_bc, infraHostingAnnual: 960K, infraPersonnel: 600K, rdOpEx: 4M, rdCapEx: 500K, engFTE: 25` (Cash basis, Quick mode, 30% growth): MCP returned `total: $6,060,000, totalTechPct: 24.24, zone: "ahead"`, all 4 per-category zones and benchmarks, `gap.underinvestGap: $12.14M`. Website wizard produced **byte-for-byte identical output** (display rounding aside). _Original BL-031.5 verification was recorded with the pre-BL-031.95 field name `infraHosting: 80K/mo`; the value above (`infraHostingAnnual: 960K = 80K × 12`) reproduces the same engine output under the renamed field._
> - **`estimate_tech_debt_cost`** with `teamSize: 8, salary: $150K, maintenanceBurdenPct: 25, deployFrequency: "Bi-weekly", incidents: 3, mttrHours: 4, remediationBudget: $522K, arr: $10.3M, remediationPct: 70, contextSwitchOn: false` (slider-quantized values; see BL-034 cleanup item on direct-input quantization): MCP returned `annualCost: $340,384.62, totalMonthly: $28,365.38, debtPctArr: 3.3047%, paybackMonths: 26.29, doraLabel: "High", V: 1.1, hoursLostPerEng: 10`. Website wizard produced **byte-for-byte identical output** (URL-fragment audit confirmed input identity by construction).
> - **`search_regulations { jurisdiction: "eu", category: "data-privacy" }`**: returned matches including GDPR with `uri: gst://regulations/eu/gdpr`. Subsequent `resources/read gst://regulations/eu/gdpr` returned the full Regulation JSON (regions array, effective date 2018-05-25, 7 keyRequirements, penalty text).
> - **`list_regulation_facets {}`**: returned **38 jurisdictions**, **4 categories** (`ai-governance`, `cybersecurity`, `data-privacy`, `industry-compliance`), `totalFrameworks: 120`.
> - **`resources/list`** at server startup (per Claude Desktop MCP log): **128 Resources** — Library × 2 + Regulations × 120 + Radar × 6. Frozen-manifest URI-stability test passes against the same set.
> - **`gst://library/vdr-structure`** brought into a Claude Desktop conversation via the connectors UX: model returned all 9 folder categories (Product, Software Architecture, Infrastructure & Operations, SDLC, Data/Analytics/AI, Security, People & Organization, Corporate IT, Governance & Compliance) in exact order with no paraphrasing or hallucination.
> - **`gst://regulations/eu/gdpr`** brought into a Claude Desktop conversation: model cited both factual checks verbatim — `72 hours` breach notification window and `Up to 4% of annual global turnover or EUR 20 million, whichever is greater` penalty.
> - **`search_radar_offline { }`** with `.cache/inoreader/` moved aside: returned the structured `isError: true` envelope with text exactly `Radar snapshot not found. Run \`npm run radar:seed\` from the gst-website repo root to populate the local cache.`— no stack trace, no exception leak. Re-seeded; subsequent invocation returned normal data. _Original BL-031.5 verification was recorded with the pre-Phase-3.A`tier: "fyi"`argument; the empty-input form`{}` reproduces the same error path under the refactored capability-mirror schema.\_
>
> **Two intentional surface differences confirmed in passing**: (1) the ICG MCP API accepts sparse `answers` maps that the wizard cannot produce — see [`icg/CONTRACT.md`](src/docs/tools/icg/CONTRACT.md) hidden semantics; (2) the Tech Debt MCP API accepts truly raw values where the wizard quantizes through slider positions — see BL-034 cleanup item.
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
| BL-031.75 | Prompts primitive (`gst_*` slash-commands)                                                   | `mcp-server/src/prompts/`, `mcp-server/tests/prompts/`                                                                            | ✅ Done |
| BL-031.85 | Tool Input Contracts (registry + per-tool CONTRACT.md docs)                                  | `mcp-server/src/docs/tools/`, `mcp-server/src/docs/<tool>/CONTRACT.md`                                                            | ✅ Done |
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

## Observability (BL-032.75)

- **Live status**: `https://mcp.globalstrategic.tech/status` — health substrate + last SLO alert evaluation, refreshed by the `*/15` evaluator cron. JSON detail on `/health`.
- **Alert rules**: [`src/observability/alert-rules.ts`](src/observability/alert-rules.ts) (7 canonical rules; thresholds cite the signed-off [`observability/slo-baselines.md`](observability/slo-baselines.md)). Breaches → fingerprinted Sentry issue events → email (rules per [`SENTRY_ALERT_RULES.md § 5`](src/docs/operations/SENTRY_ALERT_RULES.md)).
- **Runbooks**: [`observability/runbooks/`](observability/runbooks/) — one per rule; `runbook-freshness.test.ts` fails CI when one goes >6 months unreviewed.
- **Test-fire an alert**: `npx wrangler dev --env production --remote --test-scheduled` then `curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"` — full procedure + expectations in SENTRY_ALERT_RULES.md § 5.
- **Re-pull SLO baselines**: `npm run ae:baseline -- --env production` (needs `CF_AE_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` env vars; DEPLOY.md § C.X).

---

## Build pipeline

`npm run build` runs two steps:

1. `tsc --noEmit` — strict type-check across the whole import graph (mcp-server src + the website schemas/utils it pulls in).
2. `node build.mjs` — esbuild bundles `src/index.ts` into a single `dist/index.js`. The MCP SDK and zod stay external (resolved from `node_modules` at runtime); everything else is inlined, including the 61-row `projects.json`.

Why bundle instead of vanilla `tsc`? The website source uses extensionless imports (Astro convention). Plain `tsc --moduleResolution NodeNext` rejects those at runtime. Bundling sidesteps the resolution issue cleanly.

---

## Documentation map

**Operator runbooks (current)** — `src/docs/operations/`

- [DEPLOY.md](src/docs/operations/DEPLOY.md) — deploy + secret binding + recovery
- [AUTH.md](src/docs/operations/AUTH.md) — bearer-token issuance + rotation
- [RATE_LIMITS.md](src/docs/operations/RATE_LIMITS.md) — per-key budgets + 429 envelope
- [REMOTE_CLIENT_SETUP.md](src/docs/operations/REMOTE_CLIENT_SETUP.md) — Claude Desktop client config
- [SENTRY_ALERT_RULES.md](src/docs/operations/SENTRY_ALERT_RULES.md) — operator paging configuration (BL-047 T1)
- [INOREADER_OAUTH_CONTRACT.md](src/docs/operations/INOREADER_OAUTH_CONTRACT.md) — verified upstream OAuth contract
- [\_archive/](src/docs/operations/_archive/) — closed-initiative runbooks, historical reference

**Cross-cutting secrets** — [`../src/docs/operations/SECRETS_INVENTORY.md`](../src/docs/operations/SECRETS_INVENTORY.md)

**Per-tool docs** — `src/docs/<tool>/` each contains a `CONTRACT.md` (input schema + downstream effects) and `USAGE.md` (operator-facing how-to):

- Contracts: [diligence/CONTRACT.md](src/docs/tools/diligence/CONTRACT.md) · [portfolio/CONTRACT.md](src/docs/tools/portfolio/CONTRACT.md) · [icg/CONTRACT.md](src/docs/tools/icg/CONTRACT.md) · [techpar/CONTRACT.md](src/docs/tools/techpar/CONTRACT.md) · [tech-debt/CONTRACT.md](src/docs/tools/tech-debt/CONTRACT.md) · [regulatory-map/CONTRACT.md](src/docs/tools/regulatory-map/CONTRACT.md) · [radar/CONTRACT.md](src/docs/tools/radar/CONTRACT.md)
- Registries / indexes: [contracts/](src/docs/tools/) (per-tool input contract registry) · [library/](src/docs/library/) · [prompts/](src/docs/prompts/)

**Architecture / design** — `../src/docs/development/MCP_SERVER_*.md` (22 docs spanning BL-031 → BL-048). Master index: [BACKLOG.md](../src/docs/development/BACKLOG.md).

**Observability** — `observability/`

- [slo-baselines.md](observability/slo-baselines.md) — Phase 2 baselining in progress (first data-pull 2026-06-07)
- Architecture: [`src/docs/ARCHITECTURE.md` § Observability](src/docs/ARCHITECTURE.md#observability); design + closure history: [archived initiative doc](../src/docs/development/_archive/MCP_SERVER_OBSERVABILITY_BL-032_75.md)

---

_Last updated: 2026-05-31 — BL-034 documentation cleanup pass_
