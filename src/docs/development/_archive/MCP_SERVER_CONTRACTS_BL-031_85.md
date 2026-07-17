# MCP Server — Tool Input Contracts (BL-031.85)

> **Backlog initiative**: [BL-031.85: MCP Server — Tool Input Contracts](BACKLOG.md#bl-03185-mcp-server--tool-input-contracts)
>
> **Predecessors**:
>
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture, repo placement, lifecycle. Read first.
> - [BL-031 in BACKLOG.md](BACKLOG.md#bl-031-mcp-server--internal-prototype-phase-1) — the local-stdio surface whose first tool (`generate_diligence_agenda`) gets the inaugural input contract.
> - [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) — the planned expansion to four more Hub-tool engines, whose contracts will be authored using this initiative's pattern.
> - [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — the Prompts initiative whose `argsSchema` re-use directly consumes the contracts authored here.
>
> **Sequel**: [BL-032 in BACKLOG.md](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) — the remote substrate where contract stability becomes a public-API concern (and where the IRL forward-look may eventually land).
>
> **Scope**: this document covers [BL-031.85](BACKLOG.md#bl-03185-mcp-server--tool-input-contracts) — formalizing tool input schemas as first-class versioned documentation artifacts. The diligence-machine contract is the inaugural deliverable; the registry pattern and per-tool template are reusable for the four other Hub tools that ship in BL-031.5.
>
> **Status**: ✅ Complete (closed 2026-05-02). Diligence contract + registry shipped on schedule. Four BL-031.5 contracts (ICG, TechPar, Tech Debt, Regulatory Map) shipped during their respective BL-031.5 commits — the registry pattern proved reusable as designed. "Used by prompts" cross-references added to all 5 contracts during BL-031.75 closure (commit `8b39d78`, 2026-05-01). See [Closure & deviations from plan](#closure--deviations-from-plan) and [Proximate opportunities](#proximate-opportunities) below.

---

## Closure & deviations from plan

**What shipped under BL-031.85 directly** (April 27-28, 2026)

- `mcp-server/src/docs/tools/diligence/CONTRACT.md` — inaugural per-tool contract, v1, all 13 fields, hidden semantics documented
- `mcp-server/src/docs/tools/README.md` — registry with "what is", "why", spec template, versioning discipline, IRL forward-look, transitional notes
- Cross-references: `mcp-server/src/docs/tools/diligence/USAGE.md`, `mcp-server/README.md` Tool Inventory, `src/schemas/diligence.ts` top-of-file comment, `src/docs/README.md` Quick Navigation

**What shipped during BL-031.5 closure** (rolled into the contracts pattern as designed)

- `mcp-server/src/docs/tools/icg/CONTRACT.md`, `techpar/CONTRACT.md`, `tech-debt/CONTRACT.md`, `regulatory-map/CONTRACT.md` — all four authored to the BL-031.85 spec template, each with `version: v1`, hidden-semantics callouts, source-of-truth pointers
- All four corresponding schema files (`src/schemas/icg.ts`, `techpar.ts`, `tech-debt.ts`, `regulatory-map.ts`) gained the diligence-style top-of-file comment block pointing at their CONTRACT.md
- Registry table updated in-place: each tool's status flipped from `⏳ BL-031.5` to `✅ Authored (BL-031.5)` as the contracts shipped

**What shipped during BL-031.75 closure** (May 1, 2026, commit `8b39d78`)

- "Used by prompts (BL-031.75)" callout added to all 5 contracts — links each contract to the BL-031.75 prompts that compose its `argsSchema`, surfacing schema-level coupling at the contract level. Reverse direction also wired: `mcp-server/README.md` § Resources gained a "Used by prompts" column

**Outstanding — explicitly deferred at closure**

- `mcp-server/src/docs/tools/portfolio/CONTRACT.md` — **broken README link still outstanding**; deferred to [BL-034 follow-up list](BACKLOG.md#bl-034-mcp-server--documentation-cleanup) (decision pending: author or drop the tool from the registry). The `search_portfolio` and `list_portfolio_facets` tools have shipped and are used by 2 BL-031.75 prompts but their contract was never authored
- `mcp-server/src/docs/tools/radar/CONTRACT.md` — registry status flipped from `⏳ Backlog` to `⏳ BL-032`; will be authored alongside live `search_radar` when BL-032 ships
- Contract-parity Vitest test (architecture doc § Risks listed this as a future enhancement) — see [Proximate opportunities](#proximate-opportunities)

---

## Proximate opportunities

Identified during BL-031.85 closure audit (2026-05-02). Each is a follow-on that the contracts pattern enables but doesn't itself deliver.

### Closed by their own initiative

- **Stage Taxonomy Adapter Layer** → ✅ **Closed by [BL-031.87](BACKLOG.md#bl-03187-mcp-server--stage-taxonomy-adapter-layer)** (shipped 2026-05-02). Resolves the cross-tool funding-stage vocabulary drift between ICG (`pre-series-b` / `series-bc` / `pe-backed` / `enterprise`) and TechPar (`seed` / `series_a` / `series_bc` / `pe` / `enterprise`). Pattern: Adapter (GoF) at the MCP-wrapper boundary, conceptually a lightweight Anti-Corruption Layer. Engines and website wizards untouched; per-tool translator modules sit between a canonical layer and each engine. Lossy direction (canonical `series-c` → TechPar `series_bc` cannot round-trip back unambiguously) documented as intentional information-shedding. Architecture doc: [`MCP_SERVER_STAGE_ADAPTER_BL-031_87.md`](MCP_SERVER_STAGE_ADAPTER_BL-031_87.md). Source modules: [`src/data/common/funding-stages.ts`](../../data/common/funding-stages.ts) + [`src/data/common/stage-adapters.ts`](../../data/common/stage-adapters.ts).

### Recommended for fold-in

- **`.describe()` consistency pass on tool Zod schemas** — adds JSON Schema descriptions for agent introspection. Recommended fold into [BL-031.95](BACKLOG.md#bl-03195-hub-tools--url-state-restoration--mcp-deep-link-surface) since that initiative already opens the schema files (TechPar `infraHosting` → `infraHostingAnnual` rename precedent already includes `.describe('Annual cloud hosting spend in USD')`). One-pass mechanical lift sourcing description text from each CONTRACT.md's per-field "What it asks" line

### Tier 2 hardening (schedule on demand)

- **Contract-parity Vitest** — structural test that walks every per-tool CONTRACT.md, parses the option-ID tables, and asserts each ID exists in the matching `*_IDS` tuple. Hardens the "discipline is conventional" risk noted in the architecture doc § Risks. ~1 hr / ~60 LOC. Schedule when drift surveillance becomes a maintenance pain point
- **YAML frontmatter on each CONTRACT.md** — promote prose `Version: v1 \| Last authored: ...` lines to YAML frontmatter (`---\nversion: v1\nlastAuthored: 2026-04-27\nschema: src/schemas/diligence.ts\n---`). Enables (i) the parity test above to extract metadata structurally, (ii) future IRL generator consumption, (iii) a staleness-check Vitest analogous to the BL-031.75 prompt-staleness pattern. ~30 min. Bundle with the parity test

### Strategic destination

- **IRL generator scoping spike** — the architecture doc names the Information Request List generator as the strategic destination of the contracts pattern. With 5 contracts now stable (and a 6th canonical-stage-aware layer landing under BL-031.87), the contracts have enough variance for a 2-3 hr scoping spike to: pick a concrete consumer use case (likely "external diligence prep for offline analyst"), define the rendering format (likely JSON Schema generated from each CONTRACT.md), validate that the YAML frontmatter (Tier 2) is sufficient. Even if not built, the spike sharpens contract quality by exposing what an IRL needs

### Deferred — file under BL-034 cleanup

- **Cross-tool concept glossary** in `mcp-server/src/docs/tools/README.md` — added during BL-031.85 closure as a transitional artifact with a "Will be superseded by BL-031.87" note. Once the canonical stage taxonomy ships under BL-031.87, the glossary's stage section retires; remaining content (if any) folds into the registry's main body
- **Schema-mapping table standardization across `USAGE.md` files** — diligence/USAGE.md has a "phrase → schema field" table (lines 61-77) that's brilliant for orientation; the four BL-031.5 USAGE.md files lack it. Pure doc polish; low strategic leverage; defer

---

## Context

The 13-input deal profile that drives `generate_diligence_agenda` already functions as a **de facto contract**: every option enumerates a finite set of valid values, every input gates which questions and attention areas surface, and the schema is the boundary between user input and engine output.

But that contract today is split across three files with no consolidating view:

- [`src/schemas/diligence.ts`](../../schemas/diligence.ts) — the Zod validation surface (no `.describe()` calls; validation-only)
- [`src/data/diligence-machine/wizard-config.ts`](../../data/diligence-machine/wizard-config.ts) — the user-facing labels and per-option descriptions
- [`src/utils/diligence-engine.ts`](../../utils/diligence-engine.ts) — the `CONDITION_LABELS` map (lines 333-348), the `meetsMinimumBracket` ordinal-comparison logic, and the trigger-map computation that links inputs to outputs

A consumer who wants to compose a tool call has to read three files. A new analyst onboarding to the diligence wizard has the same problem. An external AI agent introspecting the surface has only the JSON Schema — no narrative, no downstream-effect description, no hidden-semantics callouts.

This initiative consolidates those three sources into a per-tool **input contract** document — and establishes the registry pattern that the four other Hub tools (ICG, TechPar, Tech Debt, Regulatory Map) will follow when BL-031.5 ships their MCP wrappers.

There's a strategic destination: a future **Information Request List (IRL) generator** that takes a known Hub-tool contract and emits a structured fill-in-the-blanks form an analyst or external AI agent can populate offline, then submit. Not in scope for BL-031.85; the contracts are the substrate that makes IRL tractable.

---

## Why this earns its own initiative (rather than living inside BL-031, BL-031.5, or BL-031.75)

**Not BL-031** because BL-031's job was to wrap two pure functions and prove the path in 1-2 days. Adding a documentation-consolidation layer on top would have stretched it. Better to ship BL-031, exercise the surface, then formalize.

**Not BL-031.5** because BL-031.5's competency is engineering — wrapping engines, parsing regulation files, reading the radar snapshot. Schema reuse is in its risk-mitigation list (the CI test that asserts every wizard option remains a valid input), but _authoring_ the human-readable contract is a different cognitive mode from writing schema-bound code.

**Not BL-031.75** because BL-031.75 is content-design work — what does a senior consultant do step-by-step on each motion? Prompts are authored consulting assets. Contracts are technical writing about input schemas. Different audience, different competency, different review gate.

**Its own initiative** because:

1. The competency is technical writing + consolidation, not engineering or consulting judgment
2. The output is documentation artifacts (registry README, per-tool CONTRACT.md), not server code
3. The work is sequenced by **the surface having shipped**, not by code dependencies — diligence is enough to author the inaugural contract; the four other Hub tools' contracts wait for BL-031.5 to ship them as MCP tools
4. The downstream value (BL-031.5 contracts authored without inventing the format; BL-032 remote API stability; future IRL generator) is concrete and worth a separately-tracked deliverable

---

## What "good input-contract documentation" looks like

Three layers, each with a clear purpose:

### Layer 1 — Validation surface (Zod)

The runtime invariant. Already present in [`src/schemas/diligence.ts`](../../schemas/diligence.ts) as `UserInputsSchema`. The contract doc cites this as the source of truth for which fields exist and what enum values they accept; it does not duplicate the schema, it points at it.

### Layer 2 — User-facing labels and descriptions

The human-readable copy. Already present in [`src/data/diligence-machine/wizard-config.ts`](../../data/diligence-machine/wizard-config.ts) as `WizardStep` objects with per-option `label` and `description` text. The contract doc lifts this verbatim into per-field tables; no re-authoring.

### Layer 3 — Downstream effects (the new content)

What the contract doc adds that does not exist anywhere else: a **lightweight 1-3 line summary per field** describing which categories of questions or attention areas that input gates. Examples:

- For `transactionType`: "Gates carve-out and integration questions; specific values trigger different separation-readiness probes."
- For `dataSensitivity`: "When `high`, surfaces data-classification framework questions and elevates the Sensitive Data Breach Liability attention area."
- For `geographies`: "Multi-select. Selecting 2+ regions auto-syncs `multi-region`. EU triggers GDPR + EU AI Act questions; Canada triggers PIPEDA + Quebec Law 25 attention area."

Plus **hidden-semantics callouts** — facts that aren't visible from the enum list alone:

- `geographies` is multi-select; the engine auto-syncs `multi-region` when 2+ specific regions are selected
- `headcount`, `revenueRange`, `companyAge` are **ordinal** — questions can gate by minimum threshold via `meetsMinimumBracket()` (e.g. "only ask DR/RPO/RTO questions if revenue ≥ $5M")

The contract is a _consolidation_ layer. It does not invent new content beyond Layer 3; the rest is a cited reference of canonical sources.

---

## The contracts/ registry pattern

Two artifacts establish the pattern:

### `mcp-server/src/docs/tools/README.md` — registry index

Three sections:

1. **What an input contract is.** Definition (versioned description of structured input that an MCP tool accepts), the three layers (validation / labels / effects), why the registry-level doc exists separately from per-tool docs.
2. **The contracts registry table.** Lists every Hub tool, its MCP tool name, the per-tool contract path, and current status:

   | Tool                 | MCP tool name                                  | Contract doc                               | Status                  |
   | -------------------- | ---------------------------------------------- | ------------------------------------------ | ----------------------- |
   | Diligence Machine    | `generate_diligence_agenda`                    | [`../diligence/CONTRACT.md`]               | ✅ Authored (BL-031.85) |
   | ICG                  | `assess_infrastructure_cost_governance`        | (planned: `../icg/CONTRACT.md`)            | ⏳ BL-031.5             |
   | TechPar              | `compute_techpar`                              | (planned: `../techpar/CONTRACT.md`)        | ⏳ BL-031.5             |
   | Tech Debt Calculator | `estimate_tech_debt_cost`                      | (planned: `../tech-debt/CONTRACT.md`)      | ⏳ BL-031.5             |
   | Regulatory Map       | `search_regulations`, `list_regulation_facets` | (planned: `../regulatory-map/CONTRACT.md`) | ⏳ BL-031.5             |
   | Portfolio Search     | `search_portfolio`, `list_portfolio_facets`    | (planned: `../portfolio/CONTRACT.md`)      | ⏳ Backlog              |

   No stub files for the planned entries — contract docs are authored alongside their MCP tools, not in advance.

3. **The IRL forward-look** (~10 lines). What an Information Request List would be (a structured form rendered from a contract that a non-Claude consumer fills in offline), why the contracts make it possible, explicit "not in scope for BL-031.85" marker.

### Per-tool `mcp-server/src/docs/<tool>/CONTRACT.md` — full contract

The diligence contract lives at `mcp-server/src/docs/tools/diligence/CONTRACT.md` (sibling to `diligence/USAGE.md`). Future Hub-tool contracts get sibling subdirectories (`techpar/`, `icg/`, `tech-debt/`, `regulatory-map/`), each with its own `CONTRACT.md` and `USAGE.md`.

---

## Per-tool contract spec template

Every CONTRACT.md follows this structure (the diligence-machine version is the reference implementation):

1. **Header** — tool name, one-line summary, source-of-truth pointers (Zod schema file, wizard-config file, engine file with line range citations)
2. **Field overview table** — N rows × 4 columns (`field` | `type` | `multi/single` | `dimension label`). Dimension labels come from the engine's `CONDITION_LABELS` map (canonical at runtime) so the contract doc and trigger-map output stay aligned by construction
3. **Per-field detail sections** — one section per field, each containing:
   - Field identifier (e.g. `transactionType`)
   - Display label (from wizard-config: e.g. "Transaction Type")
   - Subtitle / "what this asks" (from wizard-config)
   - Valid-values table — `id | label | description` (lifted verbatim from wizard-config)
   - **Downstream effect** — 1-3 line summary (the new content)
   - Cardinality / hidden semantics where relevant (multi-region auto-sync, ordinal bracket comparison, etc.)
4. **Versioning header** — `version`, `lastAuthored` date, schema-source line range. Establishes the discipline that any change to enum values is a contract version bump and triggers a review of dependent prompts (BL-031.75)
5. **Related** — cross-references to the sibling `USAGE.md` walkthrough, the contracts registry, and the BL-031 architecture doc

The doc consumes existing structured data — no new authorship for option labels, descriptions, or enum values. The new content is the **downstream-effect summaries** and the **hidden-semantics callouts**.

---

## Versioning discipline

Borrowed from BL-031.75's prompt-versioning pattern (each prompt has `version` and `lastReviewedAt` fields, with a Vitest test that fails if any prompt is over 12 months stale).

For contracts:

- **Initial version**: `v1` for the inaugural diligence contract, dated to authoring day
- **Bump triggers**: any change to enum values (new value added, value removed, value renamed); any change to the field set (new required field, removed field); any change to the multi-select / ordinal semantics
- **Non-bump changes**: typo fixes in descriptions, expanded prose in downstream-effect summaries, restructured tables — version stays, `lastAuthored` updates
- **Cross-doc impact**: a contract version bump triggers a review of dependent prompts (BL-031.75 prompts that compose `argsSchema` from the contract). No CI test enforces this in BL-031.85; the discipline is conventional

This pattern scales: when BL-031.5 adds the four other Hub-tool contracts, each gets its own `v1` and its own version cadence.

---

## The IRL forward-look (out of scope)

An Information Request List (IRL) is the strategic destination, not part of this initiative. Sketch:

- A small downstream tool reads a contract (or a set of contracts) and emits a structured fill-in-the-blanks form — JSON, YAML, HTML, or a native MCP Resource depending on the consumer
- The form is populated offline by an analyst or external AI agent that doesn't have direct access to the GST MCP server
- The completed form is submitted to the appropriate MCP tool (or batched across tools)
- Use case: a prospect's analyst preparing for a diligence engagement can fill in the deal profile in advance; the kickoff call starts with "here's the agenda" instead of "here are the 13 questions we need to ask"

What the contracts make possible: the IRL renderer has a stable, versioned input — every field's valid values, descriptions, and required/optional status — and can produce the form mechanically. Without the contracts, IRL would have to scrape the wizard-config or read Zod schemas directly; with them, IRL is a small focused tool.

What's explicitly out of scope for BL-031.85: the IRL generator itself, the rendering format, the offline-submission mechanism, the UI. Tracked separately if/when warranted.

---

## Implementation plan

Two phases, each landing as separate commits:

### Phase 1 — Diligence contract + registry

1. Author `mcp-server/src/docs/tools/README.md` (registry index, IRL forward-look, contracts table)
2. Author `mcp-server/src/docs/tools/diligence/CONTRACT.md` (full per-field documentation for `generate_diligence_agenda`)
3. Cross-references:
   - `mcp-server/src/docs/tools/diligence/USAGE.md` schema-mapping table → links to `CONTRACT.md`
   - `mcp-server/README.md` "What's exposed" table's `Input` column → links to `CONTRACT.md`
   - `src/schemas/diligence.ts` top-of-file comment → points to `mcp-server/src/docs/tools/diligence/CONTRACT.md`
   - `src/docs/README.md` Quick Navigation row → points to the contracts registry

### Phase 2 — Verification

1. Cross-check every option ID listed in `CONTRACT.md` against the corresponding tuple in `src/schemas/diligence.ts`. Zero drift expected; the doc copies from the source.
2. Discoverability test: from `src/docs/README.md`, follow links to the registry in ≤2 hops.
3. Live MCP exercise: run `mcp__gst__generate_diligence_agenda` with the canonical 13-field payload; confirm the trigger-map dimension labels exactly match the labels in `CONTRACT.md`'s field-overview table. (The runtime `CONDITION_LABELS` is canonical; if the doc disagrees, the doc is wrong.)

The implementation is a single PR (or a small sequence of commits in the same PR) — pure documentation, no runtime impact, no test suite changes.

---

## Critical files to read or modify

| File                                                                                                    | Action                                                                                   | Why                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/schemas/diligence.ts`](../../schemas/diligence.ts)                                                | Read; small edit (top-of-file comment pointer only)                                      | Canonical Zod schema; the 13-field `UserInputsSchema` and the `*_IDS` tuples are the source for valid enum values                                         |
| [`src/data/diligence-machine/wizard-config.ts`](../../data/diligence-machine/wizard-config.ts)          | Read only                                                                                | Canonical user-facing copy: per-step labels, per-option labels, per-option descriptions. The contract lifts this verbatim                                 |
| [`src/utils/diligence-engine.ts`](../../utils/diligence-engine.ts) lines 74-87, 333-348                 | Read only                                                                                | `meetsMinimumBracket` (ordinal comparison) and `CONDITION_LABELS` (dimension-label canonical values). Cited in the contract for hidden-semantics callouts |
| `mcp-server/src/docs/tools/README.md` (new)                                                             | Create                                                                                   | Registry index, what-is-an-input-contract narrative, contracts table, IRL forward-look                                                                    |
| `mcp-server/src/docs/tools/diligence/CONTRACT.md` (new)                                                 | Create                                                                                   | The inaugural per-tool contract; reference implementation for the four other Hub-tool contracts that BL-031.5 will author                                 |
| [`mcp-server/src/docs/tools/diligence/USAGE.md`](../../../mcp-server/src/docs/tools/diligence/USAGE.md) | Edit — link the schema-mapping table to the new contract                                 | The walkthrough doc currently has the schema-mapping table in isolation; should link to the canonical reference                                           |
| [`mcp-server/README.md`](../../../mcp-server/README.md)                                                 | Edit — link the `Input` column for diligence; add planned-contract notes for other tools | The "What's exposed" table is the natural surface for tool inventory; pointing at the contract from there is high-discoverability                         |
| [`src/docs/README.md`](../README.md)                                                                    | Edit — Quick Navigation row pointing to the contracts registry                           | Site-level discoverability; cross-references workspace docs without duplicating their content                                                             |

---

## Risks & mitigations

| Risk                                                                                                            | Mitigation                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract drifts from the runtime Zod schema (someone adds a field to `UserInputs` without updating CONTRACT.md) | Future enhancement: a small Vitest test in `mcp-server/tests/unit/contract-parity.test.ts` that grep-asserts every option ID in `CONTRACT.md` exists in the corresponding `*_IDS` tuple. Out of scope for BL-031.85's first cut; the discipline is conventional and the doc cites line ranges so a reader can verify                               |
| The contracts registry grows stale as BL-031.5 ships tools but their contract docs aren't authored              | The registry table's `Status` column makes the gap visible; reviewers seeing `⏳ BL-031.5` next to a tool that's already shipping should flag it. The acceptance criteria for BL-031.5 PRs should include "author the contract doc following the BL-031.85 template"                                                                               |
| The "lightweight 1-3 line downstream-effect summary" is too vague; readers want the exact question IDs          | Trade-off chosen deliberately: tight coupling to question IDs increases drift risk (every change to `questions.ts` becomes a CONTRACT.md edit). The summary is the human-readable scaffolding; the runtime trigger map remains the precise source. If demand for exact mappings emerges, a future enhancement can add a machine-generated appendix |
| Versioning becomes ceremonial — versions get bumped without anyone re-reviewing dependent prompts               | The discipline is conventional, not enforced by CI. If this risk materializes (a prompt breaks because a contract changed silently), introduce a CI test that asserts BL-031.75 prompt argsSchemas remain compatible with the contract version they pin to. Out of scope until the failure mode is observed                                        |
| Authoring the diligence contract reveals that the wizard-config descriptions are incomplete or inconsistent     | Document the gap as a follow-up; do not gate BL-031.85 on improving wizard-config copy. The contract cites what's there; copy improvements are a separate concern owned by the wizard's UX                                                                                                                                                         |
| The IRL forward-look creates expectations the team doesn't intend to meet                                       | The forward-look section is explicit that IRL is out of scope for BL-031.85; "if/when warranted" framing prevents commitment creep. If stakeholders read it as a promise, escalate to clarify in the registry README                                                                                                                               |

---

## Out of scope (explicit)

- **Stub contract docs for the four other Hub tools** (ICG, TechPar, Tech Debt, Regulatory Map) — those get authored alongside their MCP tool wrappers in BL-031.5
- **Enriching Zod schemas with `.describe()` calls** — no precedent in `src/schemas/`; would be a separate consistency pass affecting all schemas. The markdown contract is sufficient documentation today
- **Designing the IRL generator surface** — schema, rendering format, offline-submission mechanism, UI. Mentioned as the strategic destination; not designed
- **A YAML/JSON sidecar duplicating the wizard-config** — the wizard-config TS is already structured machine-readable data; a future IRL generator should consume _that_ directly, not re-parse markdown
- **Updates to questions.ts / attention-areas.ts** — out of scope; the contract reads them, doesn't modify them
- **A CI parity test** between CONTRACT.md option IDs and Zod tuples — desirable but not blocking; can be added later if drift becomes observed
- **Contracts for non-Hub-tool surfaces** (e.g. internal scripts, CLI tools) — focused on MCP-exposed Hub tools only

---

_Last updated: 2026-05-02 (closure stanza + proximate opportunities; status flipped to ✅ Complete; first authored 2026-04-27)_
