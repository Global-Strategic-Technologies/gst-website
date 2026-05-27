# Tool Input Contracts — Registry

This directory is the **registry index** for the per-tool input contracts that document every MCP tool exposed by the `@gst/mcp-server` workspace.

The per-tool contracts themselves live alongside their domain in sibling directories — e.g. `../diligence/CONTRACT.md` for the diligence machine, future `../techpar/CONTRACT.md` for TechPar, etc. This registry doc tracks them all, defines the pattern, and explains why input contracts are their own first-class artifact.

> **Initiative tracking**: [BL-031.85: MCP Server — Tool Input Contracts](../../../../src/docs/development/BACKLOG.md#bl-03185-mcp-server--tool-input-contracts) | **Architecture**: [MCP_SERVER_CONTRACTS_BL-031_85.md](../../../../src/docs/development/MCP_SERVER_CONTRACTS_BL-031_85.md)

---

## What an input contract is

A versioned, human-readable description of the structured input that an MCP tool accepts. Every contract has three layers, each citing a canonical source that already exists in the codebase:

| Layer                  | What it documents                                                                                                                                                      | Canonical source                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Validation surface** | Field set, required vs optional, multi-select vs single-select, valid enum values                                                                                      | `src/schemas/<tool>.ts` (Zod schema)                                      |
| **User-facing labels** | Human-readable label, subtitle, per-option description                                                                                                                 | `src/data/<tool>/wizard-config.ts` (or equivalent)                        |
| **Downstream effects** | 1–3 line summary per field describing what categories of output the input gates; hidden-semantics callouts (multi-select auto-syncs, ordinal bracket comparison, etc.) | New content authored in the contract — the only layer not already in code |

Together these three answer "what can I send and what does it do?" without forcing the reader to read three TypeScript files.

A contract is NOT a copy of the Zod schema or the wizard-config — it cites them. Its job is consolidation plus the downstream-effect narrative that does not exist anywhere else.

---

## Why the contract is its own artifact

- **Self-service tool invocation.** A team member composing a prompt for an analyst doesn't need to grep `src/schemas/` to know what enum values are valid; the contract lists them with descriptions and downstream-effect notes.
- **AI-agent introspection.** An agent in a long-running conversation can fetch the contract for a tool, plan its inputs deliberately, and avoid wasted invocations against invalid enum values.
- **Onboarding.** New analysts get a "why each input matters" narrative — not just a list of valid values.
- **Drift surveillance at PR review.** A contract version bump makes schema changes visible at PR review time; aligns with the schema-reuse risk mitigation [BL-031.5](../../../../src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md) calls out.
- **Foundation for prompt argsSchema reuse.** [BL-031.75](../../../../src/docs/development/MCP_SERVER_PROMPTS_BL-031_75.md) prompts compose `argsSchema` from tool input schemas; the contract gives that composition a stable, versioned reference.
- **Foundation for the IRL generator** (see below).

---

## The contracts registry

| Tool                 | MCP tool name                                                                                             | Contract doc                                                                                         | Status                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Diligence Machine    | `generate_diligence_agenda`                                                                               | [`../diligence/CONTRACT.md`](../diligence/CONTRACT.md)                                               | ✅ Authored (BL-031.85)                                  |
| ICG                  | `assess_infrastructure_cost_governance`                                                                   | [`../icg/CONTRACT.md`](../icg/CONTRACT.md)                                                           | ✅ Authored (BL-031.5)                                   |
| TechPar              | `compute_techpar`                                                                                         | [`../techpar/CONTRACT.md`](../techpar/CONTRACT.md)                                                   | ✅ Authored (BL-031.5)                                   |
| Tech Debt Calculator | `estimate_tech_debt_cost`                                                                                 | [`../tech-debt/CONTRACT.md`](../tech-debt/CONTRACT.md)                                               | ✅ Authored (BL-031.5)                                   |
| Regulatory Map       | `search_regulations`, `list_regulation_facets`                                                            | [`../regulatory-map/CONTRACT.md`](../regulatory-map/CONTRACT.md)                                     | ✅ Authored (BL-031.5)                                   |
| Portfolio Search     | `search_portfolio`, `list_portfolio_facets`                                                               | [`../portfolio/CONTRACT.md`](../portfolio/CONTRACT.md)                                               | ✅ Authored (BL-031.95)                                  |
| Radar (offline)      | `search_radar_offline` (renamed from `search_radar_cache` in BL-032 Phase 4b; alias retained one release) | [`../radar/CONTRACT.md`](../radar/CONTRACT.md)                                                       | ✅ Authored (BL-031.95); rename recorded BL-032 Phase 4b |
| Radar (live)         | `search_radar`, `get_latest_insights`                                                                     | [`../radar/CONTRACT.md` § Live tool surface](../radar/CONTRACT.md#live-tool-surface-bl-032-phase-4c) | ✅ Authored (BL-032 Phase 4c)                            |

Contract docs are authored alongside their MCP tool wrappers. The diligence contract is the inaugural reference implementation — see `../diligence/CONTRACT.md` for the template. The four BL-031.5 contracts (ICG, TechPar, Tech Debt, Regulatory Map) follow it; Radar (BL-031.95 Phase 3.A) and Portfolio Search (BL-031.95 Phase 4.B) followed under the same template once their MCP tools became capability-mirror aligned with their respective website pages.

---

## Per-tool contract spec template

Every per-tool `CONTRACT.md` follows this structure (the diligence-machine version is the reference implementation):

1. **Header** — tool name, one-line summary, source-of-truth pointers (Zod schema file, wizard-config file, engine file with line-range citations)
2. **Field overview table** — one row per input field with `field` / `type` / `multi or single` / `dimension label`. Dimension labels come from the engine's `CONDITION_LABELS` map (canonical at runtime) so the contract and trigger-map output stay aligned by construction
3. **Per-field detail sections** — one section per field, each with the field identifier, display label, subtitle, valid-values table (id / label / description), 1–3 line downstream-effect summary, cardinality / hidden-semantics callout where relevant
4. **Versioning header** — `version`, `lastAuthored` date, schema-source line range
5. **Related** — cross-references to the sibling `USAGE.md` walkthrough (if present), this registry, and the BL-031 architecture doc

---

## Versioning discipline

Each contract carries a `version` (semver-style integer or `vN`) and a `lastAuthored` date. The discipline:

- **Initial version**: `v1`, dated to authoring day
- **Bump triggers**: any change to enum values (added / removed / renamed); any change to the field set (new required field, removed field); any change to multi-select / ordinal semantics
- **Non-bump changes**: typo fixes in descriptions, expanded prose in downstream-effect summaries, restructured tables — version stays, `lastAuthored` updates
- **Cross-doc impact**: a contract version bump should trigger a review of dependent prompts (BL-031.75 prompts that compose `argsSchema` from the contract). Convention, not CI-enforced today

Pattern borrowed from the prompt-versioning approach in [MCP_SERVER_PROMPTS_BL-031_75.md](../../../../src/docs/development/MCP_SERVER_PROMPTS_BL-031_75.md). When BL-031.5 ships its four other Hub-tool contracts, each gets its own `v1` and its own version cadence.

---

## The IRL generator forward-look (out of scope today)

An **Information Request List** (IRL) is the strategic destination, not part of BL-031.85. Sketch:

A small downstream tool reads a contract (or a set of contracts) and emits a structured fill-in-the-blanks form — JSON, YAML, HTML, or a native MCP Resource depending on the consumer. The form is populated **offline** by an analyst or external AI agent that does not have direct access to the GST MCP server. The completed form is submitted to the appropriate MCP tool (or batched across tools).

Use case: a prospect's analyst preparing for a diligence engagement could fill in the deal profile in advance; the kickoff call starts with "here's the agenda" instead of "here are the 13 questions we need to ask."

What the contracts make possible: the IRL renderer has a stable, versioned input — every field's valid values, descriptions, and required/optional status — and can produce the form mechanically. Without the contracts, IRL would have to scrape the wizard-config or read Zod schemas directly; with them, IRL becomes a small focused tool.

What is explicitly out of scope for BL-031.85: the IRL generator itself, the rendering format, the offline-submission mechanism, the UI. Tracked separately if and when warranted.

---

## Cross-tool concept glossary

Some concepts appear in multiple tools' input contracts under different shapes. Two cases worth distinguishing — one is _same concept, different shape_ (resolved by Adapter modules — see BL-031.87 below); the other is _different concept, similar name_ (stays as separate enums; documented for clarity).

### Funding stage — canonical layer + Adapter (BL-031.87, shipped)

ICG and TechPar both partition the company population by funding round to select a benchmark cohort. Their **native enum shapes differ** (different field names, different value sets, different notation), but the **canonical layer** introduced in [BL-031.87](../../../../src/docs/development/MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) is the public-facing taxonomy:

```
canonical: 'seed' | 'series-a' | 'series-b' | 'series-c' | 'pe' | 'enterprise'
```

Source: [`src/data/common/funding-stages.ts`](../../../../src/data/common/funding-stages.ts) — `CANONICAL_STAGES`, `CanonicalStage`, `CanonicalStageSchema`. Per-tool Adapter modules in [`src/data/common/stage-adapters.ts`](../../../../src/data/common/stage-adapters.ts) translate canonical → native at the MCP-wrapper boundary; engines and benchmark datasets are untouched.

| Canonical value | ICG `companyStage` (native) | TechPar `stage` (native) | Notes                                                               |
| --------------- | --------------------------- | ------------------------ | ------------------------------------------------------------------- |
| `seed`          | `pre-series-b`              | `seed`                   | ICG benchmark dataset doesn't separate seed from Series A           |
| `series-a`      | `pre-series-b`              | `series_a`               | ICG collapses seed + Series A into `pre-series-b`                   |
| `series-b`      | `series-bc`                 | `series_bc`              | Both tools collapse B + C — benchmark dataset doesn't separate them |
| `series-c`      | `series-bc`                 | `series_bc`              | (same as `series-b` for these two tools)                            |
| `pe`            | `pe-backed`                 | `pe`                     | Naming variance only — same cohort                                  |
| `enterprise`    | `enterprise`                | `enterprise`             | Aligned                                                             |

**MCP-wrapper input contract:** ICG and TechPar tool inputs accept canonical values (preferred) OR tool-native values (backward-compat). A Zod union renders both options in the JSON Schema; the wrapper resolves canonical to native via `resolveIcgStageInput` / `resolveTechparStageInput` before invoking the engine. Native values continue to work for one release; canonical is the going-forward public API.

**Lossy direction:** canonical → tool-native is always safe (e.g., canonical `series-c` → TechPar `series_bc`). Tool-native → canonical is lossy where the native enum collapses canonical values (e.g., TechPar `series_bc` → ambiguous `['series-b', 'series-c']`). Tool responses include a `stageContext: { native, canonical: readonly CanonicalStage[] }` field that exposes the lossy direction honestly with an array — see [BL-031.87 architecture doc § Lossy-direction policy](../../../../src/docs/development/MCP_SERVER_STAGE_ADAPTER_BL-031_87.md#lossy-direction-policy) for full rationale.

**Why the variance exists** (and why the Adapter is the right response): each tool's native enum is **coupled to its benchmark dataset** — ICG's `BENCHMARK_RANGES` is keyed by ICG's enum, TechPar's `STAGES` map is keyed by TechPar's enum. Renaming either to a canonical taxonomy in-place would require benchmark re-attribution and risk silent mis-attribution. The Adapter approach keeps engines and benchmark datasets untouched; only the MCP-wrapper boundary translates.

### Growth velocity vs. funding stage — _different concept, similar name_

[Diligence Machine](../diligence/CONTRACT.md)'s `growthStage` field (`early` / `scaling` / `mature`) is **not** a funding-stage variant. It captures **company-maturity coarse bucketing** — `early` includes both seed and Series A pre-product-market-fit; `mature` includes Series C, PE-backed, and public companies. The diligence engine's trigger map gates on this differently than ICG / TechPar gate on funding stage. **`growthStage` will not be canonicalized into the BL-031.87 funding-stage taxonomy** — it should remain its own enum because the concept itself is different.

If a future tool needs both funding-stage cohort AND growth-velocity bucketing, it should declare both as separate fields with separate enums.

### Single-value or array — multi-value-filter pattern (regulations v2)

Tools whose faceted-search inputs (e.g. `jurisdiction`, `category`) might reasonably accept either a single value or several should follow the **union+transform pattern** established by `search_regulations` v2:

```ts
const StringOrStringArray = z
  .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .optional();
```

**Why union+transform (and NOT `z.preprocess`)**:

- Surfaces a clearer parse error on garbage input — `{field: 42}` reports `invalid_union` with both arm errors, instead of a single "expected array" message
- Gives the handler sharp `string[] | undefined` TS inference (no `unknown` cast)
- The `invalid_union` error code is itself pinned by a test, so a future refactor to `z.preprocess` breaks CI

**Required companion contracts**:

- **`.min(1)` on the array arm** — empty array is ambiguous with "no filter" and must reject
- **Array arm validates each element** against the same schema as the string arm — closes a smuggling path where invalid enum values inside an array would bypass validation that the string arm rejects
- **Backward compatibility** — existing single-string callsites must continue to work unchanged; the transform normalizes both shapes to an array internally
- **Byte-identical guarantee for derived URLs / deeplinks** — `{filter: 'eu'}` and `{filter: ['eu']}` must produce identical downstream output for single-value callsites. Pin with a unit test.

**Capability-mirror policy for multi-value**: if the corresponding website UI is single-select, the tool's response must NOT emit a misleading single-value URL when the agent passed an array — drop the URL param instead. See [`../regulatory-map/CONTRACT.md`](../regulatory-map/CONTRACT.md) § "Multi-value filters" for the canonical example + rationale.

### Other shared concepts (no current variance)

The following concepts appear in only one contract today — included here so future tools that share them know to pick the existing shape rather than reinvent:

| Concept        | Tool      | Contract reference                                     | Pattern                                                              |
| -------------- | --------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| `headcount`    | Diligence | [`../diligence/CONTRACT.md`](../diligence/CONTRACT.md) | Ordinal enum: `1-50` / `51-200` / `201-500` / `500+`                 |
| `revenueRange` | Diligence | [`../diligence/CONTRACT.md`](../diligence/CONTRACT.md) | Ordinal enum: `0-5m` / `5-25m` / `25-100m` / `100m+`                 |
| `companyAge`   | Diligence | [`../diligence/CONTRACT.md`](../diligence/CONTRACT.md) | Ordinal enum: `under-2yr` → `20yr+` (5 brackets)                     |
| `engFTE`       | TechPar   | [`../techpar/CONTRACT.md`](../techpar/CONTRACT.md)     | Raw integer headcount (different shape from diligence's `headcount`) |

If a second tool starts using one of these concepts, file an Adapter follow-up in the same shape as BL-031.87 rather than carrying drift.

---

## How to add a new per-tool contract

When BL-031.5 (or any future initiative) ships a new MCP tool:

1. Create a sibling directory `mcp-server/src/docs/<tool>/` if one does not exist
2. Author `mcp-server/src/docs/<tool>/CONTRACT.md` following the [per-tool spec template](#per-tool-contract-spec-template). The reference implementation at `../diligence/CONTRACT.md` is your guide
3. Update this registry's table — change the tool's status row from `⏳ BL-031.5` to `✅ Authored (<initiative-id>)` and replace the `(planned: ...)` placeholder with the actual relative link
4. Add a one-line top-of-file comment to the tool's Zod schema in `src/schemas/<tool>.ts` pointing to the contract (matches the diligence pattern)
5. Link the contract from `mcp-server/README.md` "What's exposed" table's `Input` column for that tool

That's the entire ceremony. No new files invented, no new conventions; the pattern is reusable and additive.

---

## Transitional notes (remove when [BL-034](../../../../src/docs/development/BACKLOG.md#bl-034-mcp-server--documentation-cleanup) closes)

> **These two notes are temporary scaffolding** that exists while we transition from "AC text owns field names" (the BL-031 / BL-031.5 baseline) to "CONTRACT.md owns field names, AC describes intent" (the going-forward convention). Once every active MCP-server initiative has been authored under the new convention and the precedence is well-understood by reviewers, **delete this entire section as part of [BL-034](../../../../src/docs/development/BACKLOG.md#bl-034-mcp-server--documentation-cleanup)**. The notes are guardrails, not durable rules.

### Precedence rule (transitional)

If the AC text in [`BACKLOG.md`](../../../../src/docs/development/BACKLOG.md) disagrees with a per-tool `CONTRACT.md` on field names, **the contract is canonical**. The AC describes intent; the contract describes the actual shape, derived from the canonical Zod schema. AC text is authored at planning time and is treated as a frozen architectural decision record after the initiative ships — it is not maintained against subsequent schema changes.

### AC-authoring convention (transitional)

When authoring AC for a future initiative that adds an MCP tool surface, write at the **conceptual level** rather than the literal-name level. Example:

> ❌ Don't: `assess_infrastructure_cost_governance` — input includes `answers` map and `stage`
>
> ✅ Do: `assess_infrastructure_cost_governance` — input includes the answers map and an optional company-stage field. Full reference in [`../icg/CONTRACT.md`](../icg/CONTRACT.md).

This way the AC commits only to the _concept_, and the CONTRACT.md (which is maintained) commits to the field names. Drift becomes structurally impossible because the AC isn't claiming any specific identifier.
