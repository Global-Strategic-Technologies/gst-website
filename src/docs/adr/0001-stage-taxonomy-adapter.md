# ADR-0001: Stage-taxonomy adapter at the MCP-wrapper boundary

- **Status**: Accepted (2026-05-02) — re-validated 2026-07-14 (benchmark audit, finding A)
- **Source initiative**: BL-031.87 (design doc archived at [`../development/_archive/MCP_SERVER_STAGE_ADAPTER_BL-031_87.md`](../development/_archive/MCP_SERVER_STAGE_ADAPTER_BL-031_87.md)); re-validation: BL-032.25 § 1 ([archived](../development/_archive/MCP_SERVER_REMOTE_BL-032_25.md))

## Context

Two Hub tools partition companies by funding round to select a benchmark cohort, but express that one concept with divergent enums:

- **ICG `companyStage`** — 4 values, kebab-case, no `seed` cohort: `pre-series-b` / `series-bc` / `pe-backed` / `enterprise`
- **TechPar `stage`** — 5 values, snake_case, includes `seed`: `seed` / `series_a` / `series_bc` / `pe` / `enterprise`

Different field name, different value set, different notation — same concept. Both enums are keyed directly into hand-curated benchmark datasets (ICG's `BENCHMARK_RANGES`, TechPar's `STAGES` map), so neither can be renamed in place without re-attributing benchmark data.

The variance became costly when BL-031.75's multi-tool prompts (e.g. `gst_target_quick_look`) started orchestrating both tools: Claude/MCP callers had to know each tool's vocabulary and coerce inputs per call. Agents need one stage vocabulary at the MCP surface.

(Diligence Machine's `growthStage` — `early` / `scaling` / `mature` — looks similar but is a different concept, company-maturity bucketing, and is deliberately excluded.)

## Decision

Introduce a **canonical 6-value funding-stage taxonomy** — `seed`, `series-a`, `series-b`, `series-c`, `pe`, `enterprise` ([`src/data/common/funding-stages.ts`](../../data/common/funding-stages.ts)) — plus **per-tool Adapter modules** ([`src/data/common/stage-adapters.ts`](../../data/common/stage-adapters.ts)): GoF Adapter, conceptually a lightweight anti-corruption layer between the canonical vocabulary and each tool's bounded context.

The translation lives at the **MCP-wrapper boundary** ([`mcp-server/src/schemas.ts`](../../../mcp-server/src/schemas.ts), `ICGMcpInputsSchema` / `TechParMcpInputsSchema`): each wrapper's stage field is a Zod union of canonical | native, resolved to native (`resolveIcgStageInput` / `resolveTechparStageInput`) before invoking the engine. Engines, website wizards, and benchmark datasets remain untouched — they see only native values.

### Why Adapter, not the alternatives

- **Not Proxy** — Proxy preserves the same interface and adds cross-cutting behavior (caching, auth, remote forwarding). Here the shapes differ by definition: even the field NAME differs (`stage` vs `companyStage`), and there are no access-control semantics. Interface conversion is Adapter's job. (BL-032's Remote Proxy for HTTP transport is a real Proxy and composes orthogonally _around_ this Adapter.)
- **Not Bridge** — Bridge decouples two independently-evolving axes; there is only one axis of variation here (per-tool native vocabularies against a single canonical layer).
- **Not full normalization** — renaming the native enums to the canonical taxonomy would force re-keying the benchmark datasets with real risk of silent benchmark mis-attribution, and would fabricate cohorts the data does not support (e.g. a `seed` row ICG's benchmark population cannot back). The Adapter delivers most of the value — one canonical agent-facing vocabulary — at a fraction of the cost and none of the migration risk.

### Lossy-direction policy

The Adapter is bidirectional but asymmetric:

- **Canonical → native is total** — every canonical value maps to exactly one native value; always safe.
- **Native → canonical is array-valued** — where a native value collapses canonical stages, `toCanonical` returns the full array (e.g. `series_bc` → `['series-b', 'series-c']`) rather than silently picking one. Tool responses expose this via a `stageContext { native, canonical }` output field whose `canonical` member is always an array.

The collapses are **intentional information-shedding driven by benchmark-dataset granularity**, not defects: the native enums are exactly as fine-grained as the curated data behind them. Unit tests assert both the safe round-trip and each hand-tabulated collapse.

### Re-validation (2026-07-14)

The BL-032.25 § 1 benchmark-audit spike asked whether the Adapter could be retired by normalizing the underlying schemas. It examined all **three** collapse points and judged each independently:

1. **ICG `pre-series-b` ← seed + series-a** — by-design. `BENCHMARK_RANGES` is four expert-authored maturity-score priors with no underlying per-company sample to re-cut; the 20-question instrument lacks resolution to separate seed from series-a governance maturity.
2. **ICG `series-bc` ← series-b + series-c** — by-design. Same authored dataset; splitting the band with no data behind the boundary would reduce the feature's honesty.
3. **TechPar `series_bc` ← series-b + series-c** — by-design. The published spend-benchmark corpora TechPar's bands are curated from (SaaS Capital, KeyBanc, OpenView/High Alpha, Bessemer) segment by ARR band and funding type, never Series B vs Series C as separate cohorts — there is nothing finer to split _to_.

**Verdict: finding A — all collapses are by-design; normalization rejected.** Normalizing would fabricate boundaries the source data does not contain. The Adapter is retained indefinitely; BL-031.87 remains Closed (not Superseded).

## Consequences

- Agents interact with one stable stage vocabulary; the per-tool variance disclaimer is gone from prompt bodies (`gst_target_quick_look` takes `CanonicalStageSchema` directly).
- Native values remain accepted via the Zod unions as backward compatibility, so existing callers keep working.
- Collapses are visible, not hidden: consumers receive the array-valued `stageContext.canonical` and must not assume native → canonical is single-valued.
- Code and docs that cite this decision: [`src/data/common/funding-stages.ts`](../../data/common/funding-stages.ts) and [`src/data/common/stage-adapters.ts`](../../data/common/stage-adapters.ts) (module JSDoc), and the "Canonical stage adapter (BL-031.87)" sub-sections in both `mcp-server/src/docs/tools/icg/CONTRACT.md` and `techpar/CONTRACT.md`.
- **Revisit triggers** (per the BL-032.25 closure): a third stage-cohort tool ships with genuinely finer-grained benchmark data, or BL-033 pilot feedback flags the adapter as confusing to consumers. Absent either, do not re-open — the Adapter encodes a real data limitation, and moving where that limitation lives gains nothing.
