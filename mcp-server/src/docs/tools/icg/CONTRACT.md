---
tool: assess_infrastructure_cost_governance
version: v1
lastAuthored: 2026-04-28
schema: src/schemas/icg.ts
enumParity:
  - tableHeading: '`companyStage`'
    schemaExport: src/schemas/icg.ts#COMPANY_STAGE_VALUES
---

# Input Contract: `assess_infrastructure_cost_governance`

> **Tool**: `assess_infrastructure_cost_governance` — assesses a target company's Infrastructure Cost Governance maturity. Wraps the website's pure `calculateResults` + `getRecommendations` engines.
>
> **Sources of truth** (the contract cites these; it does not duplicate them):
>
> - **Validation**: [`src/schemas/icg.ts`](../../../../../src/schemas/icg.ts) — `ICGInputsSchema`, `ICGAnswerScoreSchema`, `CompanyStageSchema` (`COMPANY_STAGE_VALUES` tuple)
> - **Question and domain definitions**: [`src/data/infrastructure-cost-governance/domains.ts`](../../../../../src/data/infrastructure-cost-governance/domains.ts) — `DOMAINS` (6 domains, ~30 questions total), `ANSWER_OPTIONS` (4 maturity levels)
> - **Recommendation triggers**: [`src/data/infrastructure-cost-governance/recommendations.ts`](../../../../../src/data/infrastructure-cost-governance/recommendations.ts) — `RECOMMENDATIONS` (impact / effort / domain / threshold per record)
> - **Engine logic**: [`src/utils/icg-engine.ts`](../../../../../src/utils/icg-engine.ts) — `calculateResults` (lines 106–154), `getRecommendations` (lines 84–102), `getMaturityLevel` (lines 60–70), `MATURITY_THRESHOLDS` (line 49–53), `FOUNDATIONAL_THRESHOLD` (line 56), `BENCHMARK_RANGES` (lines 332–337)
>
> **Used by prompts** (BL-031.75): [`gst_target_quick_look`](../../../prompts/target-quick-look.ts) (first-look brief — combines ICG + TechPar + Tech Debt + regulatory exposure into one digestible page). The prompt body enumerates the 20 schema-canonical question IDs (`q1_1`–`q6_4`) inline so the model uses them verbatim rather than inventing flat IDs (which the engine silently ignores per the "Unknown keys" hidden semantic below). Schema additions to `ICGInputsSchema` should be reflected in the body's enumeration. The prompt also surfaces a `deeplink` field that opens the wizard at `currentStep: 7` (results view) — see [`tools/icg.ts`](../../../tools/icg.ts) `buildResultsState()`.
>
> **Version**: `v1` | **Last authored**: 2026-04-28
>
> **Registry**: see [`../contracts/README.md`](../README.md) for the "what is an input contract" narrative, cross-tool registry, and per-tool spec template.

---

## Field overview

The tool accepts a 2-field input. The first (`answers`) is a map keyed by question ID, not a fixed enum — it's the only contract field whose surface is variable across versions of the underlying domain definitions.

| Field          | Type                    | Cardinality | Required |
| -------------- | ----------------------- | ----------- | -------- |
| `answers`      | `Record<string, -1..3>` | map         | yes      |
| `companyStage` | enum (4 values)         | single      | no       |

**The answer scale**: `0` = "Not in place", `1` = "Ad hoc", `2` = "Established", `3` = "Optimized" — these are the four `ANSWER_OPTIONS` defined in `domains.ts`. The score `-1` is a special value meaning **"Not sure"** — the engine treats it as a score of zero for raw-score arithmetic but counts it separately for skipped-count reporting.

**`answers` is sparse**: the map need not contain every question. Missing keys are treated as zero, exactly like `0` ("Not in place"). The engine never throws on a missing question; submit only the questions you have signals for and the score reflects an honest absence of information.

---

## Per-field detail

### `answers`

- **Display label**: Domain answers
- **What it asks**: For each ICG question, your assessment of the target company's current maturity.

**Valid keys**: question IDs of the form `q<domain>_<index>` — `q1_1`, `q1_2`, `q2_1`, ..., `q6_N`. The complete set is enumerated in [`src/data/infrastructure-cost-governance/domains.ts`](../../../../../src/data/infrastructure-cost-governance/domains.ts) — 6 domains × 3–7 questions each. Unknown keys are silently ignored (not validated).

**Valid values**: integers in `-1..3`.

| Value | Label        | Maturity    | Engine effect                                                                                       |
| ----- | ------------ | ----------- | --------------------------------------------------------------------------------------------------- |
| `0`   | Not in place | Reactive    | Counts toward raw score (sum); contributes 0 points                                                 |
| `1`   | Ad hoc       | Aware       | Counts toward raw score; contributes 1 point                                                        |
| `2`   | Established  | Optimizing  | Counts toward raw score; contributes 2 points                                                       |
| `3`   | Optimized    | Strategic   | Counts toward raw score; contributes 3 points                                                       |
| `-1`  | Not sure     | (penalised) | Treated as 0 for raw arithmetic AND counted in the `skippedCount` field (visible in summary output) |

**Downstream effect**: The answers map gates **everything**. Per-domain scores are computed as a percentage of the maximum possible (`questions.length × 3`), then weighted by `domain.weight` to produce the `overallScore` (0–100). The overall score determines the `maturityLevel` via `MATURITY_THRESHOLDS` (Reactive ≤ 25, Aware ≤ 50, Optimizing ≤ 75, Strategic > 75). Below-threshold answers also drive the `recommendations[]` list — each `Recommendation` has a `triggerQuestionId` and `triggerThreshold`, surfacing when `answers[triggerQuestionId] <= triggerThreshold`. Recommendations are sorted by impact (high / medium / low), then effort (quick-win / project / initiative), then domain order.

**Hidden semantics — foundational gap**: Two of the six domains are flagged `foundational: true` in the data — `d1` (Visibility & Tagging) and `d2` (Account Structure & Attribution). If either foundational domain scores at or below `FOUNDATIONAL_THRESHOLD` (33/100), the engine sets `showFoundationalFlag: true` in the result — independent of the overall score. This catches the case where a high overall score masks a critical-domain gap.

**Hidden semantics — wizard / API asymmetry**: The website wizard at [`/hub/tools/infrastructure-cost-governance/`](https://globalstrategic.tech/hub/tools/infrastructure-cost-governance/) **forces the user to answer every question** before they can proceed past a domain — the "Next" button stays disabled until every question in the current domain has a value (one of `0`/`1`/`2`/`3`/`-1`). The wizard cannot produce a state where `answeredCount < totalQuestions`.

The MCP API has the opposite policy: a sparse `answers` map is a valid input. Missing keys are treated as `0` for raw-score arithmetic, but they are NOT counted in `skippedCount` (which only counts explicit `-1` answers). This serves agents that have direct signals for some questions but cannot assess others.

The asymmetry is intentional — different surfaces, different completion semantics. But it has two consequences worth knowing:

1. **`overallScore` interpretability differs between surfaces.** A wizard score of `25` always reflects 20 deliberate answers; an API score of `25` may reflect 8 deliberate answers + 12 absent (treated as zero). Consumers comparing the two should look at `answeredCount` to know which case they're in.
2. **Side-by-side parity testing requires picking a wizard-reachable state.** To verify MCP/wizard equivalence, the API call must include all 20 question keys (use `-1` for any question the agent genuinely cannot assess). A sparse map will produce results the wizard literally cannot reproduce.

---

### `companyStage` (optional)

- **Display label**: Company growth stage
- **What it asks**: The target's funding / growth stage, used only for benchmark contextualization.

| ID             | Label              | Benchmark range (overall score) |
| -------------- | ------------------ | ------------------------------- |
| `pre-series-b` | Pre-Series B       | 15–35                           |
| `series-bc`    | Series B–C         | 30–55                           |
| `pe-backed`    | PE-backed (2+ yrs) | 45–70                           |
| `enterprise`   | Enterprise         | 65–90                           |

**Downstream effect**: Optional. If supplied, the engine uses `contextualizeScore(score, stage)` to add a stage-specific benchmark band so the consumer can see whether the target is below / within / above the typical range for its stage. **Does not change the score itself** — it changes the narrative around the score. If omitted, the result is computed identically; the benchmark band is simply absent.

**Canonical stage adapter (BL-031.87)**: the MCP wrapper accepts `companyStage` as either a canonical funding-stage value (preferred — see [`src/data/common/funding-stages.ts`](../../../../../src/data/common/funding-stages.ts) `CANONICAL_STAGES`: `seed` | `series-a` | `series-b` | `series-c` | `pe` | `enterprise`) or one of the four ICG-native values listed above (backward-compat). Translation happens via [`ICG_STAGE_ADAPTER`](../../../../../src/data/common/stage-adapters.ts) before the engine is invoked. ICG's native enum collapses canonical seed + series-a into `pre-series-b` and canonical series-b + series-c into `series-bc` — both reflect the benchmark dataset's granularity. The MCP response includes a `stageContext: { native, canonical }` field where `canonical` is array-valued, exposing the lossy collapses honestly (e.g., `pre-series-b` → `['seed', 'series-a']`). Engine and benchmark dataset untouched. See [`mcp-server/src/docs/tools/README.md` § Cross-tool concept glossary](../README.md#funding-stage--canonical-layer--adapter-bl-03187-shipped) for the full canonical mapping table; see [ADR-0001](../../../../../src/docs/adr/0001-stage-taxonomy-adapter.md) for pattern-choice rationale.

---

## Output shape (return value)

The tool returns:

```ts
{
  overallScore: number,          // 0–100
  maturityLevel: 'Reactive' | 'Aware' | 'Optimizing' | 'Strategic',
  maturityColor: string,         // CSS variable name; ignore for non-UI consumers
  domainScores: DomainScore[],   // 6 entries, one per domain
  showFoundationalFlag: boolean,
  recommendations: Recommendation[], // sorted high→low priority
  answeredCount: number,         // distinct keys in answers
  totalQuestions: number,        // sum of questions across all domains
  skippedCount: number           // count of -1 ("Not sure") answers
}
```

`DomainScore` includes `domainId`, `name`, `score` (0–100), `rawScore`, `maxScore`, `isFoundational`, `belowFoundationalThreshold`, `skippedCount`. `Recommendation` includes `id`, `title`, `description`, `impact`, `effort`, `domain`, `triggerQuestionId`, `triggerThreshold`.

---

## Related

- Tool wrapper: [`mcp-server/src/tools/icg.ts`](../../../tools/icg.ts)
- Live website: <https://globalstrategic.tech/hub/tools/infrastructure-cost-governance>
- Architecture: [ADR-0004 — Resources surface](../../../../../src/docs/adr/0004-hub-surface-resources-import-restriction.md) · [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
