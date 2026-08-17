# Tool Input Contracts — Registry

This directory is the **registry index** for the per-tool input contracts that document every MCP tool exposed by the `@gst/mcp-server` workspace.

The per-tool contracts live in per-tool subdirectories of this `tools/` directory — e.g. `diligence/CONTRACT.md` for the diligence machine, `techpar/CONTRACT.md` for TechPar, etc. This registry doc tracks them all, defines the pattern, and explains why input contracts are their own first-class artifact.

> **Initiative tracking**: BL-031.85 — MCP Server Tool Input Contracts (completed; pruned from BACKLOG) | **Origin**: [MCP_SERVER_CONTRACTS_BL-031_85.md](../../../../src/docs/development/_archive/MCP_SERVER_CONTRACTS_BL-031_85.md) (archived — the still-relevant design rationale is folded into this README; the archive retains initiative history only)

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

The downstream-effect summaries are deliberately loose — 1–3 lines, no exact question/output IDs. Coupling the contract to individual output IDs would turn every content edit into a contract edit and multiply drift risk; the summary is human-readable scaffolding, and the runtime trigger map (or equivalent engine output) remains the precise source. Where doc and runtime disagree, the doc is wrong.

---

## Why the contract is its own artifact

- **Self-service tool invocation.** A team member composing a prompt for an analyst doesn't need to grep `src/schemas/` to know what enum values are valid; the contract lists them with descriptions and downstream-effect notes.
- **AI-agent introspection.** An agent in a long-running conversation can fetch the contract for a tool, plan its inputs deliberately, and avoid wasted invocations against invalid enum values.
- **Onboarding.** New analysts get a "why each input matters" narrative — not just a list of valid values.
- **Drift surveillance at PR review.** A contract version bump makes schema changes visible at PR review time. It adds a human-visible layer on top of the code-level mitigation (MCP Zod schemas derive from each engine's canonical input types, with a subset-test asserting every wizard option remains a valid tool input): the reviewer sees _that_ the input surface changed, not just that a test still passes.
- **Foundation for prompt argsSchema reuse.** [BL-031.75](../../../../src/docs/adr/0007-registered-prompt-pattern.md) prompts compose `argsSchema` from tool input schemas; the contract gives that composition a stable, versioned reference.
- **Foundation for the IRL generator** (see below).

---

## The contracts registry

| Tool                   | MCP tool name                                                                                                                            | Contract doc                                                                                   | Status                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diligence Machine      | `generate_diligence_agenda`                                                                                                              | [`diligence/CONTRACT.md`](diligence/CONTRACT.md)                                               | ✅ Authored (BL-031.85)                                                                                                                                 |
| ICG                    | `assess_infrastructure_cost_governance`                                                                                                  | [`icg/CONTRACT.md`](icg/CONTRACT.md)                                                           | ✅ Authored (BL-031.5)                                                                                                                                  |
| TechPar                | `compute_techpar`                                                                                                                        | [`techpar/CONTRACT.md`](techpar/CONTRACT.md)                                                   | ✅ Authored (BL-031.5)                                                                                                                                  |
| Tech Debt Calculator   | `estimate_tech_debt_cost`                                                                                                                | [`tech-debt/CONTRACT.md`](tech-debt/CONTRACT.md)                                               | ✅ Authored (BL-031.5)                                                                                                                                  |
| Regulatory Map         | `search_regulations`, `list_regulation_facets`                                                                                           | [`regulatory-map/CONTRACT.md`](regulatory-map/CONTRACT.md)                                     | ✅ Authored (BL-031.5)                                                                                                                                  |
| Portfolio Search       | `search_portfolio`, `list_portfolio_facets`                                                                                              | [`portfolio/CONTRACT.md`](portfolio/CONTRACT.md)                                               | ✅ Authored (BL-031.95)                                                                                                                                 |
| Radar (offline)        | `search_radar_offline` (renamed from `search_radar_cache` in BL-032 Phase 4b; alias retained one release)                                | [`radar/CONTRACT.md`](radar/CONTRACT.md)                                                       | ✅ Authored (BL-031.95); rename recorded BL-032 Phase 4b                                                                                                |
| Radar (live)           | `search_radar`, `get_latest_insights`                                                                                                    | [`radar/CONTRACT.md` § Live tool surface](radar/CONTRACT.md#live-tool-surface-bl-032-phase-4c) | ✅ Authored (BL-032 Phase 4c)                                                                                                                           |
| IRL / dossier pipeline | `list_irl_requests`, `generate_information_request_list_xlsx`, `prepare_irl_body`, `validate_irl_provenance`, `compose_dossier_envelope` | [`irl-pipeline/CONTRACT.md`](irl-pipeline/CONTRACT.md)                                         | ✅ Authored (BL-119); ⚠️ `USAGE.md` pending — the [acceptance walkthrough](../testing/uat/UAT-07-irl-pipeline.md) carries the worked examples meanwhile |

Contract docs are authored alongside their MCP tool wrappers. The diligence contract is the inaugural reference implementation — see `diligence/CONTRACT.md` for the template. The four BL-031.5 contracts (ICG, TechPar, Tech Debt, Regulatory Map) follow it; Radar (BL-031.95 Phase 3.A) and Portfolio Search (BL-031.95 Phase 4.B) followed under the same template once their MCP tools became capability-mirror aligned with their respective website pages.

### The CONTRACT.md / USAGE.md two-file convention

Each per-tool subdirectory pairs two documents with deliberately different jobs:

- **`CONTRACT.md`** — the input reference: what can I send and what does it do. Technical writing about the schema; versioned; reviewed when the input surface changes.
- **`USAGE.md`** — the walkthrough: how a consultant or agent actually drives the tool through a motion. Content-design writing; reviewed when the workflow changes.

They stay separate because they serve different audiences and change on different cadences — an enum bump must not force a walkthrough rewrite, and a workflow rewrite must not trigger a contract version bump.

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

Pattern borrowed from the prompt-versioning approach ([ADR-0007](../../../../src/docs/adr/0007-registered-prompt-pattern.md)). Each contract carries its own `v1` and its own version cadence.

Two hardening steps are on the shelf if conventional discipline proves insufficient (deliberately deferred until the failure mode is actually observed):

- **Contract-parity test** — a Vitest that walks each CONTRACT.md's option-ID tables and asserts every ID exists in the matching `*_IDS` tuple in `src/schemas/<tool>.ts`. Until then, the line-range citations in each contract's source-of-truth header let a reviewer verify by hand.
- **Prompt-compat test** — a CI assertion that dependent prompt `argsSchema`s remain compatible with the contract version they pin to, to be added if a prompt ever breaks because a contract changed silently.

---

## The IRL generator (the forward-look that shipped)

An **Information Request List** (IRL) is the strategic destination, not part of BL-031.85. Sketch:

A small downstream tool reads a contract (or a set of contracts) and emits a structured fill-in-the-blanks form — JSON, YAML, HTML, or a native MCP Resource depending on the consumer. The form is populated **offline** by an analyst or external AI agent that does not have direct access to the GST MCP server. The completed form is submitted to the appropriate MCP tool (or batched across tools).

Use case: a prospect's analyst preparing for a diligence engagement could fill in the deal profile in advance; the kickoff call starts with "here's the agenda" instead of "here are the 13 questions we need to ask."

What the contracts make possible: the IRL renderer has a stable, versioned input — every field's valid values, descriptions, and required/optional status — and can produce the form mechanically. Without the contracts, IRL would have to scrape the wizard-config or read Zod schemas directly; with them, IRL becomes a small focused tool.

What is explicitly out of scope for BL-031.85: the IRL generator itself, the rendering format, the offline-submission mechanism, the UI. Tracked separately if and when warranted.

---

## Cross-tool concept glossary

Some concepts appear in multiple tools' input contracts under different shapes. Two cases worth distinguishing — one is _same concept, different shape_ (resolved by Adapter modules — see BL-031.87 below); the other is _different concept, similar name_ (stays as separate enums; documented for clarity).

### Funding stage — canonical layer + Adapter (BL-031.87, shipped)

ICG and TechPar both partition the company population by funding round to select a benchmark cohort. Their **native enum shapes differ** (different field names, different value sets, different notation), but the **canonical layer** introduced in BL-031.87 ([ADR-0001](../../../../src/docs/adr/0001-stage-taxonomy-adapter.md)) is the public-facing taxonomy:

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

**Lossy direction:** canonical → tool-native is always safe (e.g., canonical `series-c` → TechPar `series_bc`). Tool-native → canonical is lossy where the native enum collapses canonical values (e.g., TechPar `series_bc` → ambiguous `['series-b', 'series-c']`). Tool responses include a `stageContext: { native, canonical: readonly CanonicalStage[] }` field that exposes the lossy direction honestly with an array — see [ADR-0001 § Lossy-direction policy](../../../../src/docs/adr/0001-stage-taxonomy-adapter.md#lossy-direction-policy) for full rationale.

**Why the variance exists** (and why the Adapter is the right response): each tool's native enum is **coupled to its benchmark dataset** — ICG's `BENCHMARK_RANGES` is keyed by ICG's enum, TechPar's `STAGES` map is keyed by TechPar's enum. Renaming either to a canonical taxonomy in-place would require benchmark re-attribution and risk silent mis-attribution. The Adapter approach keeps engines and benchmark datasets untouched; only the MCP-wrapper boundary translates.

### Growth velocity vs. funding stage — _different concept, similar name_

[Diligence Machine](diligence/CONTRACT.md)'s `growthStage` field (`early` / `scaling` / `mature`) is **not** a funding-stage variant. It captures **company-maturity coarse bucketing** — `early` includes both seed and Series A pre-product-market-fit; `mature` includes Series C, PE-backed, and public companies. The diligence engine's trigger map gates on this differently than ICG / TechPar gate on funding stage. **`growthStage` will not be canonicalized into the BL-031.87 funding-stage taxonomy** — it should remain its own enum because the concept itself is different.

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

**Capability-mirror policy for multi-value**: if the corresponding website UI is single-select, the tool's response must NOT emit a misleading single-value URL when the agent passed an array — drop the URL param instead. See [`regulatory-map/CONTRACT.md`](regulatory-map/CONTRACT.md) § "Multi-value filters" for the canonical example + rationale.

### Other shared concepts (no current variance)

The following concepts appear in only one contract today — included here so future tools that share them know to pick the existing shape rather than reinvent:

| Concept        | Tool      | Contract reference                               | Pattern                                                              |
| -------------- | --------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `headcount`    | Diligence | [`diligence/CONTRACT.md`](diligence/CONTRACT.md) | Ordinal enum: `1-50` / `51-200` / `201-500` / `500+`                 |
| `revenueRange` | Diligence | [`diligence/CONTRACT.md`](diligence/CONTRACT.md) | Ordinal enum: `0-5m` / `5-25m` / `25-100m` / `100m+`                 |
| `companyAge`   | Diligence | [`diligence/CONTRACT.md`](diligence/CONTRACT.md) | Ordinal enum: `under-2yr` → `20yr+` (5 brackets)                     |
| `engFTE`       | TechPar   | [`techpar/CONTRACT.md`](techpar/CONTRACT.md)     | Raw integer headcount (different shape from diligence's `headcount`) |

If a second tool starts using one of these concepts, file an Adapter follow-up in the same shape as BL-031.87 rather than carrying drift.

---

## How to add a new per-tool contract

When BL-031.5 (or any future initiative) ships a new MCP tool:

1. Create a per-tool subdirectory `mcp-server/src/docs/tools/<tool>/` if one does not exist
2. Author `mcp-server/src/docs/tools/<tool>/CONTRACT.md` following the [per-tool spec template](#per-tool-contract-spec-template). The reference implementation at `diligence/CONTRACT.md` is your guide
3. Update this registry's table — change the tool's status row from `⏳ BL-031.5` to `✅ Authored (<initiative-id>)` and replace the `(planned: ...)` placeholder with the actual relative link
4. Add a one-line top-of-file comment to the tool's Zod schema in `src/schemas/<tool>.ts` pointing to the contract (matches the diligence pattern)
5. Link the contract from `mcp-server/README.md` "What's exposed" table's `Input` column for that tool

That's the entire ceremony. No new files invented, no new conventions; the pattern is reusable and additive.
