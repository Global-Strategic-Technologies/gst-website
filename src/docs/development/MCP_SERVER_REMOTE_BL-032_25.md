# BL-032.25 — MCP Revisions prior to Go-Live: Per-Item Implementation Plan

> **Source**: BL-032.25 — bucket for soak-findings discovered during BL-032 § B.5 (staging soak window 2026-05-06 → ~2026-05-13)
>
> **BACKLOG entry**: [BL-032.25 in BACKLOG.md](./BACKLOG.md#bl-03225-mcp-revisions-prior-to-go-live)
>
> **Status**: Open — soak in progress; items added as discovered. § 1 authored at initiative-creation time as the anchor finding (schema normalization → adapter retirement question)
>
> **Companion docs**:
>
> - [BL-032 design doc](./MCP_SERVER_REMOTE_BL-032.md) — substrate this initiative responds to
> - [BL-031.87 design doc](./MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) — the original adapter-pattern decision § 1 revisits
> - [BL-032 Soak-Week Testing Playbook](./MCP_SERVER_REMOTE_BL-032_TESTING.md) — primary source of findings populating this doc

## Triage convention

Every item logged under BL-032.25 gets a **severity tag**:

| Tag    | Meaning               | Effect on production deploy                                                                                                                              |
| ------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | Blocks Go-Live        | MUST close (commit + verification) before B.6 production deploy. Counts in the BL-032 § "Validation sequence before marking done" step #7                |
| **P1** | Post-launch follow-up | Recorded honestly; doesn't block B.6. After ship, gets either re-filed under BL-032.5 / BL-032.75 / BL-033 by topic OR remains here as ongoing follow-up |

**Default tag**: P1. Promotion to P0 requires explicit justification — the bar is "user-facing harm if shipped, not just imperfection." Good P0 examples: token leaking in logs, unhandled exception storm, broken auth. Good P1 examples: edge-case error message wording, schema-cleanliness wins, doc gaps that cost ~5 min to work around.

## Item lifecycle

1. **Discovery** — testing playbook, Sentry alert, ad-hoc usage, operator observation
2. **Logging** — operator adds a § N section here with: scenario / what was observed / preliminary investigation
3. **Severity** — operator (or reviewer) tags P0 / P1 with one-sentence rationale
4. **Plan** — for P0: concrete remediation steps + verification path. For P1: deferred-but-documented analysis + revisit criteria
5. **Execution** (P0 only) — engineering work + commit-SHA pointer added below the plan
6. **Closure stanza** — once shipped (P0) or formally deferred (P1), each item gets a closure stanza matching the convention used in BL-031.85 / BL-031.87 / BL-031.95: dated, evidence linked, recommendation summary
7. **Re-filing** (P1 only, post-B.6) — if the item belongs in a successor initiative (BL-032.5 / BL-032.75 / BL-033), it gets moved with a redirect note. Otherwise stays here

---

## § 1 — Schema normalization across Hub Tools (Investigation — P1, deferred)

### Status

- **Authored**: 2026-05-06 (anchor item at initiative creation)
- **Severity**: **P1** — post-launch follow-up; does NOT block B.6 production deploy
- **Recommendation**: defer normalization; preserve [BL-031.87](./MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) adapter pattern for production launch
- **Investigation evidence**: this section
- **Closure stanza**: [pending — added when revisit criteria are met OR when this item is formally cancelled]

### What it asks

Can the BL-031.87 stage-taxonomy adapter pattern be retired by **normalizing the underlying schemas** so that ICG and TechPar share a canonical funding-stage enum directly, rather than translating between native and canonical at the MCP-wrapper boundary?

[BL-031.87](./MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) explicitly considered and rejected this option in its Technical Context, calling out benchmark re-attribution risk and URL-state migration cost. This investigation re-validates that decision against the actual code as it stands post-Phase-5.5 deploy, and confirms or revises the recommendation.

### Investigation findings

#### Variance landscape today

Schema variance across the 5 transport-portable tools, surveyed 2026-05-06:

| Tool                  | Stage enum                                                                                                                                     | Native values                                                     | Notation                  | Cross-tool overlap                                                                                                                                                                                                                                                | Benchmark dataset keyed?                                                                                                 | URL state encodes value?                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **ICG**               | `CompanyStage` ([`src/schemas/icg.ts:75-81`](../../schemas/icg.ts))                                                                            | `pre-series-b`, `series-bc`, `pe-backed`, `enterprise` (4 values) | kebab-case                | Adapter to canonical                                                                                                                                                                                                                                              | **YES** — `BENCHMARK_RANGES` in [`src/utils/icg-engine.ts:332-346`](../../utils/icg-engine.ts) is keyed by these values  | **YES** — base64 JSON `g:` field; hardcoded validation list at line 207        |
| **TechPar**           | `Stage` ([`src/schemas/techpar.ts:18-19`](../../schemas/techpar.ts))                                                                           | `seed`, `series_a`, `series_bc`, `pe`, `enterprise` (5 values)    | snake_case for multi-word | Adapter to canonical                                                                                                                                                                                                                                              | **YES** — `STAGES` record in [`src/data/techpar/stages.ts:11-95`](../../data/techpar/stages.ts) is keyed by these values | **YES** — URL search param `?s=`; hardcoded validation list at engine line 644 |
| **Tech Debt**         | (none — uses raw `teamSize` integer)                                                                                                           | n/a                                                               | n/a                       | n/a                                                                                                                                                                                                                                                               | NO                                                                                                                       | NO (raw slider values)                                                         |
| **Diligence Machine** | `growthStage` ([`src/data/diligence-machine/wizard-config.ts:45`](../../data/diligence-machine/wizard-config.ts)) — `early`/`scaling`/`mature` | 3 values                                                          | kebab-case                | **NOT** an alias for funding-stage; intentionally distinct concept (company maturity / velocity, not funding cohort). Schema comment confirms: "_Distinct from BL-031.87 funding-stage canonical taxonomy — `growthStage` captures velocity, not funding-cohort_" | NO (gates question filtering, not benchmark lookup)                                                                      | URL state encodes value                                                        |
| **Regulatory Map**    | n/a                                                                                                                                            | n/a                                                               | n/a                       | n/a                                                                                                                                                                                                                                                               | n/a                                                                                                                      | n/a                                                                            |

**Key observation**: Diligence's `growthStage` LOOKS like it might be an alias but is explicitly NOT. This was decided when BL-031.87 was authored and is documented in the schema's `.describe()` text. Trying to alias `growthStage` into the canonical funding-stage taxonomy would be a category error.

#### Other potential schema variance — none found

Surveyed for parallel enums across tools (headcount brackets, revenue brackets, company-age brackets, etc.):

- **Headcount**: Diligence uses `'1-50'` / `'51-200'` / `'201-500'` / `'500+'` for question-filtering condition gates ([`wizard-config.ts:43`](../../data/diligence-machine/wizard-config.ts)); Tech Debt uses raw integer (`teamSize`) for cost calculation. Different representations because they serve different purposes — no overlap to normalize
- **Revenue range**: Diligence uses `'0-5m'` / `'5-25m'` / `'25-100m'` / `'100m+'` for filtering; ICG and TechPar accept ARR as a raw number for benchmark lookup. Same as headcount — different purposes
- **Company age**: Diligence-only; no cross-tool overlap

**Conclusion**: stage taxonomy is the ONLY genuinely-shared concept that today has cross-tool variance. The adapter pattern's scope was correctly identified.

#### What normalization would actually require

If schema normalization were attempted (i.e., rename ICG and TechPar's native stage enums to match `CANONICAL_STAGES = ['seed', 'series-a', 'series-b', 'series-c', 'pe', 'enterprise']`):

| Surface to touch                  | Files                                                                                                                                                                            | Risk                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Engine stage type definitions** | [`src/utils/icg-engine.ts:13`](../../utils/icg-engine.ts), [`src/utils/techpar-engine.ts`](../../utils/techpar-engine.ts)                                                        | MODERATE — TypeScript enum rename, but downstream usages in benchmark validation must update simultaneously                                                                                                                                                                                                                                                                                                                                                        |
| **Zod schemas**                   | [`src/schemas/icg.ts:75-81`](../../schemas/icg.ts), [`src/schemas/techpar.ts:18-19`](../../schemas/techpar.ts)                                                                   | HIGH — validation contract; upstream callers passing native values would fail until they update                                                                                                                                                                                                                                                                                                                                                                    |
| **Benchmark data re-keying**      | [`src/utils/icg-engine.ts:332-346`](../../utils/icg-engine.ts), [`src/data/techpar/stages.ts:11-95`](../../data/techpar/stages.ts)                                               | **CRITICAL** — re-keying is mechanical, but the tradeoff is: (a) ICG's `pre-series-b` deliberately collapses canonical seed + series-a because the benchmark population doesn't separate them (small sample size at seed). After normalization to canonical-direct keys, do we duplicate the row to seed (invents precision the data doesn't support), or leave seed unbenchmarked (invalid input that previously worked)? Same for TechPar's `series_bc` collapse |
| **URL state validation**          | [`src/utils/icg-engine.ts:207-209`](../../utils/icg-engine.ts), [`src/utils/techpar-engine.ts:644`](../../utils/techpar-engine.ts)                                               | MODERATE — every shared assessment URL today encodes native values. Normalization without backward-compat shim breaks every link. With backward-compat shim, must accept BOTH old and new values for some deprecation window                                                                                                                                                                                                                                       |
| **MCP wrapper input validation**  | [`mcp-server/src/tools/icg.ts`](../../../mcp-server/src/tools/icg.ts), [`mcp-server/src/tools/techpar.ts`](../../../mcp-server/src/tools/techpar.ts)                             | LOW — adapters retire; wrappers just pass canonical values directly to the engine                                                                                                                                                                                                                                                                                                                                                                                  |
| **Website wizard UI / labels**    | [`src/pages/hub/tools/infrastructure-cost-governance/`](../../pages/hub/tools/infrastructure-cost-governance/), [`src/pages/hub/tools/techpar/`](../../pages/hub/tools/techpar/) | LOW — labels are data-driven from enum keys                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Adapter modules**               | [`src/data/common/stage-adapters.ts`](../../data/common/stage-adapters.ts)                                                                                                       | MOOT — modules become transparent pass-throughs and eventually retire                                                                                                                                                                                                                                                                                                                                                                                              |

**Engineering cost estimate**: 3-5 days, broken down:

- Day 1: ICG engine + schema + benchmark re-key + URL backward-compat shim + tests
- Day 2: TechPar engine + schema + benchmark re-key + URL backward-compat shim + tests
- Day 3: MCP wrapper updates + adapter retirement + cross-tool prompt verification
- Day 4: Website wizard QA (labels, dropdowns, URL round-trips for both tools at both new and old values)
- Day 5: Full project CI-equivalent gate, golden-snapshot regeneration for affected prompts, doc updates

**Real risks**:

1. **Silent benchmark mis-attribution** — if the re-key step gets the seed / series-a / series-b / series-c granularity wrong (e.g., copies series-a benchmarks into seed without questioning whether they apply), users see plausible-but-incorrect benchmark scores. Worse than the current adapter-collapses-to-known-coarseness behavior because at least under the adapter, the user sees the collapsed name (`pre-series-b`) and understands they're in a coarse bucket
2. **URL backward-compat lifetime** — every shared URL is potentially permanent in someone's notes/PDFs/inbox. The shim has to live "for a long time" — likely permanently or until a planned URL-format-version-bump. Code complexity persists indefinitely
3. **Wizard-page disruption during migration** — until both URL formats decode, in-flight users could see broken wizard states
4. **Re-attribution audit cost** — beyond the mechanical re-key, the right thing to do is re-audit the benchmark dataset's source (where did these numbers come from? do they actually merit splitting back to canonical granularity?). That audit is bigger than the rename itself

**Real benefit**: agents introspecting the JSON Schema for ICG's `companyStage` or TechPar's `stage` see canonical values directly rather than via Zod-union. Slightly cleaner DX for AI consumers. **No new functionality enabled**; this is purely architectural housekeeping.

#### Decision criteria checklist

A normalization initiative becomes worth doing if AND only if:

- [ ] At least one of these triggers fires:
  - **A new third tool** is being added that needs stage-cohort binning AND its dataset doesn't naturally collapse into ICG's or TechPar's native shape (i.e., a real cross-tool ergonomic tax that adapters can't sand down). **Status today: no such tool planned through BL-033**
  - **Website-wizard URL canonicalization** becomes a stated requirement (e.g., for cross-tool URL sharing — share an ICG URL → site recognizes the stage and pre-fills TechPar). **Status today: no such feature requested**
  - **External-pilot scoping (BL-033)** flags the adapter pattern as confusing for paying customers' compliance review. **Status today: speculative; will surface in BL-033's design discussion**
- [ ] **Benchmark audit completed**: someone with domain expertise has reviewed whether ICG's `pre-series-b` and TechPar's `series_bc` actually collapse for good reason (data signal) or accidentally (lazy modeling). If accidentally, normalization is more justifiable. If by-design, the adapter approach respects the data
- [ ] **URL-format versioning decision made**: separate from the normalization, the team decides whether to introduce a URL-format version field (`?v=2`) that allows clean future migrations. With this in place, normalization becomes routine; without it, every breaking change to URL formats is a major event
- [ ] **Engineering capacity allocated**: minimum 5-day uninterrupted block; not interleaved with other shipping work since the affected surface is large enough that intermediate states are fragile

If 2+ checkmarks fire, this initiative graduates from P1 to "schedule for execution" — likely under a new BL number rather than under BL-032.25.

### Recommendation

**Defer to post-launch (P1, no scheduled execution).** Reasons:

1. **The Adapter pattern shipped 2026-05-02 and is operationally stable.** The tax it imposes is conceptual (a canonical layer + adapters), not user-facing — agents see canonical input + canonical output via the MCP wrappers; the native enums are an internal implementation detail
2. **Benchmark re-attribution risk is not speculative — it's structural.** Both engines' datasets are genuinely tuned to the collapsed enums; rejecting the adapter pattern means either (a) accepting that the canonical layer's `seed` + `series-a` granularity is fictional for ICG's benchmark output (since both would resolve to the same row), or (b) committing to a benchmark audit that's its own multi-day initiative
3. **URL-state migration cost is real and persistent.** Backward-compat shims for URL parsers tend to live forever. Normalizing now adds permanent complexity to the URL parsers for purely architectural cleanliness
4. **No identified user-visible benefit.** This investigation found zero unsatisfied use cases that the adapter pattern doesn't already serve. Cross-tool prompts work, single-tool prompts work, agent introspection works (agents see the canonical taxonomy through the MCP wrappers' Zod input schemas)
5. **BL-031.87 explicitly defers, doesn't reject.** The original initiative documented the choice + the criteria for revisiting (line 137 of [`MCP_SERVER_STAGE_ADAPTER_BL-031_87.md`](./MCP_SERVER_STAGE_ADAPTER_BL-031_87.md)). Honoring that staged decision is preferable to relitigating it without new data

**What this means for B.6 production deploy**: ships with the adapter pattern intact. No code changes required for Go-Live.

**What this means for post-launch**: § 1 stays in BL-032.25 with a periodic-revisit cadence (suggested: re-evaluate at BL-033 design-doc time, when external-pilot constraints become concrete). If any of the decision-criteria triggers fires, the initiative graduates to a scheduled BL number with the plan above as a starting point.

### Closure stanza placeholder

(Closure stanza added when this item is formally resolved — either by execution after a trigger fires, or by formal cancellation if BL-033 scope confirms the adapter pattern is BL-033-acceptable too.)

---

## § 2 — TBD (next soak finding)

_(filled as soak progresses)_

Each new finding gets:

```markdown
## § N — <short title>

### Status

- Authored: <date>
- Severity: **P0** / **P1** with one-sentence rationale
- Recommendation: <execute now / defer / cancel>
- Investigation evidence: this section
- Closure stanza: [pending or linked]

### What it asks

<one paragraph framing>

### Investigation findings

<concrete code findings, file paths, observed behavior, evidence>

### Plan

- For P0: concrete remediation steps + verification path + commit-SHA placeholder
- For P1: deferred-but-documented analysis + revisit criteria

### Recommendation

<defensible recommendation with reasoning>

### Closure stanza

<filled when resolved>
```

---

_Last updated: 2026-05-06 — initial authoring at start of BL-032 staging soak. § 1 (schema normalization, P1 deferred) is the anchor finding. Soak-week additions populate § 2 onward as discovered._
