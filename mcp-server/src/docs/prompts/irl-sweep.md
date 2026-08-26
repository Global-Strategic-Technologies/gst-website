# gst_irl_sweep — prompt companion

> **Audience**: anyone modifying `mcp-server/src/prompts/irl-sweep.ts` or debugging a live sweep run.
> **Status**: maintained — update alongside every prompt version bump.

## What it does

`gst_irl_sweep` ingests a populated GST IRL and drives every applicable Hub analysis tool to a unified engagement dossier. It is the **trust-the-operator successor** to `gst_irl_ingestion`: a populated IRL is ipso facto trusted input, so the prompt carries no provenance apparatus of any kind. No body hashing, no server-side caching, no citation-verification loops, no RUN-AUDIT blocks, no meta fences, no audit levels. The audit surface is one model-authored **(J) Gaps & assumptions** section. The portable extract record (v2, zero tool calls) is its **sibling prompt `gst_irl_extract`** — split out 2026-08-25 so each workflow does exactly one thing; the two share their arrival/completeness/gate/rule sections via `extraction-rules.ts`. The decision and its rationale live in the trust-the-operator ADR (written with the removal PR).

## Contract (v0.2.0 — verified against `irl-sweep.ts`)

One argument, optional:

| Arg         | Type               | Default | Purpose                                                                                                                                                               |
| ----------- | ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filledIrl` | string ≥ 200 chars | —       | The populated IRL markdown. Omit when the IRL is attached or was pasted earlier — the model uses whatever is present, and asks for a paste only when nothing arrived. |

A stale-client `mode` argument (removed in 0.2.0) is stripped by the default Zod strip mode; the run is always the full sweep.

Everything the old prompt took as arguments is **inferred**: target name from the `> Target:` header line, else row 0-01; engagement context (voice cues only) from the `> Engagement context:` line, else row 0-02 — the header line is primary because row 0-02 is absent on most pipeline-generated IRLs (the generator's skip-if removes it when a context was stated). Universal voice on an absent line or the literal `Unspecified`. Partner lead / project code name come from the conversation when stated.

## Trust model

Argument, attachment, and chat paste all proceed identically — arrival channel is never interrogated. The only halt is the blank request template (fill ratio < 5% over sections 00–09); any other ratio proceeds with the ratio stated in (A) and thin sections listed in (J). The dossier says "per the IRL" and never claims server-side verification, because there is none.

## What it keeps from its predecessor (engine behavior, not distrust)

- The **workbook column contract** (shared from `extraction-rules.ts`) for xlsx reconstruction.
- The **inclusion gates** — they encode engine null-returns (TechPar needs ARR + a cost signal; Tech Debt needs a substantive §04 row).
- The **engine-math rule constants** (v2 forms): deepdive-always TechPar with the `rdOpEx: 0` escape, MTTR P1 selection + null-when-OPEN, eng-cost dedup, ICG seeding (`-1` penalized harder than `0`), currency normalization, headcount scope.
- The **conditional regulatory triggers** (EU AI Act, NIS2) gap-filling a thin §09.
- The **deeplink discipline** and the inlined **VDR folder taxonomy** for (I) follow-ups.

Tool calls use the base schemas with **no `_audit` blocks** (optional as of server 0.60.0).

## Orchestrates

Nine tools (`generate_diligence_agenda`, `list_portfolio_facets`, `search_portfolio`, `list_regulation_facets`, `search_regulations`, `compute_techpar`, `assess_infrastructure_cost_governance`, `estimate_tech_debt_cost`, `search_radar`) + the `gst://irl/source` taxonomy embed + `gst://library/vdr-structure` (inlined table, URI as provenance caption). No `compose_dossier_envelope`, no `prepare_irl_body`, no `validate_irl_provenance`.

## Testing

Presence-assertion suite at `tests/unit/prompts/irl-sweep.test.ts` — **deliberately no body-hash suite** (byte-pinning was part of the disease the rebuild removes). Live-verification protocol: UAT-09.11.
