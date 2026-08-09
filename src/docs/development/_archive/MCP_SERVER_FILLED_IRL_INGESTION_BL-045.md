# MCP Server — IRL Ingestion (BL-045)

> **Backlog initiative**: [BL-045: Sweep IRL-Ingestion Hardening + Rename](BACKLOG.md#bl-045-sweep-irl-ingestion-hardening--rename-gst_diligence_sweep--gst_irl_ingestion--shipped-2026-06-03)
>
> **Companion docs**:
>
> - [MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md) — canonical article + Resource + request-side prompt (`gst_information_request_list`). The IRL artifact this prompt ingests.
> - [MCP_SERVER_IRL_GENERATOR_BL-044.md](MCP_SERVER_IRL_GENERATOR_BL-044.md) — fillable-form generator. Produces the `.xlsx` that the partner sends to a target/client; the target's filled-in response is what this prompt consumes.
> - [IRL_PARTNER_PASTE_RUNBOOK.md](IRL_PARTNER_PASTE_RUNBOOK.md) — operator runbook for the partner-paste-verbatim path. Includes the `npm run irl:extract` script that converts the partner's filled `.xlsx` back to canonical markdown ready to paste into the `filledIrl` prompt arg. **Use this for client-facing deliverables, regulatory submissions, M&A close, and any IRL larger than ~10KB** — the model-reconstruction-from-xlsx path empirically truncates at the model's tool-call args emission ceiling (~60-80KB).
> - [`mcp-server/src/docs/library/irl-tool-input-mapping.md`](../../../mcp-server/src/docs/library/irl-tool-input-mapping.md) — per-section bullet → tool-input mapping SOP. Human-readable rule documentation. Machine-shared rule text lives in `mcp-server/src/prompts/extraction-rules.ts` (created under § Pre-implementation refactor).
> - [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — registered-prompt maturity bar (golden file, `lastReviewedAt`, `orchestrates` body-mention, semver-as-contract).
> - [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) — semver log. This initiative bumps the server **minor** (rename + behavior expansion) and the prompt resets to `0.1.0`.
>
> **Predecessors**: BL-043 (canonical article), BL-044 (fillable-form generator), BL-031.75 (prompt-library maturity), BL-031.95 (URL state restoration — Hub-tool deeplink contract every output relies on), BL-032.6 (the original `gst_diligence_sweep` this initiative renames and hardens).
>
> **Scope**: rename `gst_diligence_sweep` → `gst_irl_ingestion`, harden its IRL-extraction surface, and make tool selection IRL-content-aware so the prompt fits all engagement scenarios (buy-side, sell-side, value-creation, unknown) — not just buy-side diligence. **One ingestion surface**; no new sibling prompt. Six concrete changes detailed below. **15 internal files** carry the old name today and migrate in PR B (verified by `grep -rln gst_diligence_sweep c:/Code/gst-website --exclude=MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md` on 2026-06-01).
>
> **Status**: ✅ **SHIPPED 2026-06-03** (status truth-passed 2026-07-15; previously read "Draft" — stale). PR A (extraction-rules refactor) landed 2026-06-01 at mcp-server 0.3.16; PR B (rename + args + body rewrite + fill-ratio pre-flight + `forceTools` + meta JSON fence + 0.4.0 tool-schema enforcement) merged 2026-06-03 via [PR #212](https://github.com/Global-Strategic-Technologies/gst-website/pull/212) at mcp-server 0.13.1. The prompt has since iterated to v0.21.1 (mcp-server 0.39.0) through the BL-05x/06x/07x/08x + BL-086 cascade. **Honest deviation**: the senior-consultant 36-cell sign-off gating promotion (decision 2 below) was never delivered — no sign-off comment exists on PR #212; validation happened empirically (live SanFran client IRL 2026-06-02 → the 0.4.0 enforcement pivot; the BL-058→062 retest cascade; BL-074 client-ready gates 2026-06-30). The [review packet](MCP_SERVER_FILLED_IRL_INGESTION_BL-045_REVIEW_PACKET.md) remains available if a formal content review is ever scheduled.
>
> _Original 2026-06-01 record_: design doc authored 2026-06-01; supersedes the prior two-prompt design (which proposed a separate `gst_intake_filled_irl`). **Four audit cycles** incorporated (three correctness + one strategic). Operator decisions recorded 2026-06-01: (1) ship rename + behavior + bundled enhancements together, no deferral — per CLAUDE.md § 4a; (2) senior-consultant review covers the full 9 × 4 gate-scenario matrix; (3) bundle all six strategic-audit candidates (meta fence, schema self-check, BL-032.75 instrumentation, SOP-as-Resource, fill-ratio surface, derived `forceTools` enum) plus four robustness stretches (tool-error degradation, provenance self-check, deterministic dispatch test, build-time schema test); (4) Option α on Phase 2 baseline timing — accept ~30-day gap rather than splitting instrumentation into a pre-merge patch PR. PR B effort expanded to 5-7 days. Promotion from BL-045 candidate to committed pending senior-consultant review scheduling + content sign-off.

---

## At a glance

```
┌───────────────────────────┐   ┌──────────────────────────────────┐   ┌──────────────────────────┐
│ Filled IRL                │   │ gst_irl_ingestion                │   │ Output (single turn)     │
│ (markdown paste)          │   │  ─────────────────────────────   │   │  ────────────────────    │
│ Buy-side / Sell-side /    │ ─▶│  1. Wrong-IRL pre-flight check   │ ─▶│  (A) Engagement snapshot │
│  Value-creation / Unknown │   │  2. Extract rules (shared module)│   │  (B-…) Per-tool sections │
│ ~10 sections · ~67 bullets│   │  3. Per-tool inclusion gates     │   │   - extraction JSON      │
└───────────────────────────┘   │  4. Mode-aware execution:        │   │   - synthesis prose      │
                                │     · extract-only  → JSON only  │   │   - provenance footer    │
                                │     · full          → invoke +   │   │   - deeplink             │
                                │                       synthesize │   │  (J) Gap list            │
                                └──────────────────────────────────┘   └──────────────────────────┘
                                            ▲                                       │
                                            │                                       ▼
                              Voice cues by transactionContext       partner inspects, edits, audits,
                              (sell · buy · value-creation ·         shares deeplinks, or feeds JSON
                                  unknown)                           to individual tools downstream
```

**Two modes, one surface, scenario-aware**. `mode: 'extract-only'` skips tool invocations and synthesis (cheap, fast, audit-focused). `mode: 'full'` invokes only the tools whose inclusion gates the IRL satisfies (no more 9-tool fan-out for sparse IRLs). The transaction-context arg drives both voice cues and tool selection (e.g., value-creation engagements weight Tech Debt and ICG higher than Regulatory).

---

## Context — what changes and why

### What's wrong with the prompt today

`gst_diligence_sweep@0.0.5` was authored under BL-032.6 with a buy-side diligence framing baked into the name and the body. In production it has accumulated three structural problems:

1. **Diligence-coded name doesn't match the actual surface**. Sell-side prep, value-creation engagements, and post-close hardening all use the same IRL and want the same fan-out — but partners hesitate to invoke "diligence_sweep" outside a buy-side context, and external clients reading the prompt list misread the intent. The `transactionContext` enum already covers `sell-side | value-creation`, but the prompt name fights it.
2. **9-tool unconditional fan-out**. Sweep invokes every Hub tool regardless of whether the IRL provides usable inputs for it. A filled IRL with empty Section 04 (Tech Debt fields) still gets a Tech Debt invocation with most fields `'unknown'`; a value-creation engagement that won't touch comparables still gets a `search_portfolio` call. Wasteful (~9 tool calls × ~30s each), noisy (the dossier carries placeholder narratives for unfunded sections), and confusing to partners (`'unknown'` propagation rules force `null`-heavy dossier sections that look like extraction failures but aren't).
3. **No extract-only path**. A partner who wants to (a) inspect the model's extraction before committing to ~5 min and ~9 tool calls, (b) audit a contested numeric value's IRL provenance, (c) get JSON payloads for downstream automation, or (d) refresh a single section without re-running the whole sweep — must either over-invoke sweep or hand-transcribe. The original BL-045 proposal was a **second prompt** (`gst_intake_filled_irl`) to fill this gap; the rescope merges the capability into sweep as a mode flag.

Layered on top: the extraction rules live as long template-literal paragraphs mixed with sweep orchestration framing (`diligence-sweep.ts:123`, `:127`, `:129`, `:131`, `:133`), so any future rule edit touches sweep's body directly and any other prompt that wants the same rules (e.g., the originally-proposed sibling) would have to duplicate them — guaranteed drift.

### What this initiative ships

Six changes, one ingestion surface:

1. **Rename**: `gst_diligence_sweep` → `gst_irl_ingestion`. Public-surface breaking change at the prompt level. Old name retired (no compat shim).
2. **Pre-implementation refactor**: extract rule text into `mcp-server/src/prompts/extraction-rules.ts` shared constants. Future rule additions edit one file; the body interpolates. (Lands as PR A before any new behavior.)
3. **Engagement-scenario reframing**: prompt name, description, and body language become scenario-neutral. Voice cues per `transactionContext` stay and expand to cover the value-creation-100-day-plan + sell-side-defensible-story framings already in code, plus a more explicit unknown-context handling rule.
4. **IRL-content-aware tool selection**: every tool has an explicit inclusion gate — a boolean over which IRL sections must provide signal. In `mode: 'full'`, tools whose gate fails are elided from the fan-out. The dossier shrinks to what the IRL actually supports.
5. **JSON extraction surface in every section**: each emitted tool section carries a `json` code fence with the inputs the prompt extracted, alongside the existing synthesis prose. Auditability and downstream consumption.
6. **Provenance footer + gap list (J)**: each non-`'unknown'` field cites the IRL section/bullet that justified it; a closing § Gap list enumerates what was unsupplied. Forces grounded extraction and makes "ask the target a follow-up" an explicit deliverable.

Plus: **new `mode` arg** (`extract-only` | `full`, default `full`) and **new `verbosity` arg** (`compact` | `verbose`, default `verbose`).

---

## Business value framing

Engineering work needs to pass a business-value test, not just a correctness test. BL-045's value to GST is three-layered:

### Layer 1 — Scenario reach (the highest-ROI claim)

The `gst_diligence_sweep` name has implicitly capped invocation outside buy-side engagements. The renamed `gst_irl_ingestion` + expanded per-`transactionContext` voice cues let the prompt serve sell-side prep, value-creation engagements, and post-close work as first-class scenarios. Conservative estimate: if GST runs ~80% buy-side / 20% other today, the rename + voice-cue work unlocks an additional **5-10 sell-side or value-creation engagements per year** that currently route around the prompt because partners hesitate to invoke "diligence sweep" outside an active deal-evaluation context. **This is the real ROI** — not the wall-time savings below.

### Layer 2 — Partner-time savings per engagement

Current end-to-end IRL → dossier flow today (`gst_diligence_sweep`, 9-tool unconditional fan-out):

- Tool fan-out wall time: ~9 calls × ~30s = **4-5 minutes**
- Partner read + sift-out-placeholder-sections: **10-15 minutes** (the `'unknown'`-heavy sections from sparse IRLs require attention to discard)
- Re-run of corrected tools when extraction surfaces errors: **5+ minutes**
- **Total partner attention: 15-25 minutes per engagement**

Post-BL-045 estimate (median IRL with ~6 of 9 inclusion gates passing):

- Tool fan-out wall time: ~6 calls × ~30s = **~3 minutes**
- Partner read: **5-8 minutes** (elision removes placeholder sections; gap list (J) replaces sift-and-discard with structured "what's missing")
- Re-run via `forceTools` or `mode: 'extract-only'` audit: **~1 minute**
- **Total partner attention: 8-12 minutes per engagement**

Net: **~10-15 minutes saved per engagement**. At ~30 engagements/year, that's **5-7.5 hours/year of senior-partner time** — modest in absolute terms, but compounded by scenario reach (Layer 1).

### Layer 3 — Dossier quality

Beyond partner time, the rewritten output produces higher-fidelity artifacts the partner ships to clients:

- **JSON fences** make extracted inputs auditable and replayable (today the partner re-reads prose to understand which value the model used for `engCost`).
- **Provenance footers** let partners defend contested numbers in client conversations ("`arr ← Section 00 bullet 3 ($45.2M)`" beats "the model thought $45.2M").
- **Gap list (J)** turns "ask the target a follow-up" from implicit to explicit — currently partners reverse-engineer this from `'unknown'`-heavy synthesis prose.
- **Wrong-IRL structural detector** prevents the cascade where a mistakenly-pasted unfilled IRL produces a hallucinated all-`'unknown'` dossier (the doc's most catastrophic failure mode pre-BL-045).

### Counterfactual — what if BL-045 doesn't ship

Sweep keeps working for buy-side. The cost of _not_ shipping is small for buy-side existing engagements, real for sell-side / value-creation adoption (Layer 1), and meaningful for dossier defensibility (Layer 3).

### Honest weakness

No formal partner-time measurement exists today. The estimates above are author-derived from reading the current prompt body + the IRL fixtures. Pre-deploy validation: senior-consultant review against the three fixtures (per § Senior-consultant review gate) records actual time-to-review per scenario, calibrating Layer 2. Post-deploy: BL-032.75 instrumentation (per § Decisions row "Observability hooks") captures real distribution of mode usage, gate elisions, and re-run rates.

---

## Pre-implementation refactor — extract shared rule constants

**This lands in its own PR (PR A) before any rename or behavior change.** Sweep's rendered output is character-identical post-refactor; the only purpose is to make the rule text a reusable module so future evolution (BL-044.5, a new Hub tool, etc.) edits one place.

| Step | File                                                    | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | `mcp-server/src/prompts/extraction-rules.ts`            | **NEW.** Export named string constants for each load-bearing rule: `UNKNOWN_PROPAGATION_RULE`, `ENG_COST_DEDUP_RULE`, `ICG_SEEDING_RULES`, `MTTR_P1_RULE`, `NIS2_CONDITIONAL_TRIGGER`, `EU_AI_ACT_CONDITIONAL_TRIGGER`. Each constant is the rule sentence(s) without orchestration framing. JSDoc above each cites the irl-tool-input-mapping.md SOP section it derives from.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| R2   | `mcp-server/src/prompts/diligence-sweep.ts`             | MODIFY (no rename yet). Replace the rule prose at lines 123, 127, 129, 131, 133 with `${EXTRACTION_RULES.*}` interpolations. Sweep-specific framing (`invoke generate_diligence_agenda`, `Surface the resulting deeplink`, etc.) stays around the interpolated rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R3   | `mcp-server/tests/unit/prompts/diligence-sweep.test.ts` | MODIFY. Add a single test asserting each named constant appears in the rendered sweep body.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| R4   | `mcp-server/tests/examples/diligence-sweep.golden.md`   | RE-RECORD with an **intentional, bounded diff**. Sweep's existing rule paragraphs (`diligence-sweep.ts:123/127/129/131/133`) fuse rule prose with sweep-specific orchestration inside single template literals — verified by reading those lines on 2026-06-01. Extracting clean reusable rule constants WILL shift sentence boundaries (e.g., "the tool's USAGE RULE on the `'unknown'` sentinel is strict and indirect inference is forbidden" sits mid-paragraph with the surrounding "Because the IRL is filled..." opener and the closing "Surface the resulting agenda topics..." both being sweep-specific). The post-refactor diff captures sentence-boundary cleanup only; no semantic or behavioral change. PR A reviewer's job: confirm the diff is structural (whitespace, sentence joins, punctuation reshuffling) and that no rule's _meaning_ shifts. |
| R5   | `mcp-server/BREAKING_CHANGES.md`                        | Add entry: "no surface change — internal refactor".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

PR A is ~0.5 day. Lands first, on its own.

---

## Decisions

| Decision | Rationale |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename `gst_diligence_sweep` → `gst_irl_ingestion`, no compat alias | Diligence-coded name fights the actual surface. A compat alias would carry forward the old framing in prompts/list and confuse external clients. The migration cost is bounded (16 internal references; see § Critical files) and the rename happens in one PR. |
| Server bumps **minor** (next `0.4.0`); new prompt at `0.1.0` | Per SemVer rule applied to the prompt's public-surface contract: a rename is removal-of-old-name + addition-of-new-name, which is compatibility-breaking for any client pinning the old name. Minor is the right server bump (vs. patch). Precedents (`0.3.5` additive patch for BL-044, `0.3.15` patch for `gst_vdr_audit` retirement) don't cover rename — neither was a public-surface contract break with new behavior, so the bump tier is justified by the SemVer rule, not the precedents. The prompt's own version resets to `0.1.0` to signal substantive rescope distinct from sweep's `0.0.5` history. |
| One prompt, two modes (`extract-only` / `full`) | The originally-proposed sibling `gst_intake_filled_irl` would have duplicated the ingestion entry point and forced partners to pick between paths. A mode flag on a single ingestion surface is lower architectural surface and lets partners stay in the same prompt for both use cases. Discussed at length in the prior design-doc revision; the rescope absorbs that work. |
| IRL-content-aware tool selection via per-tool inclusion gates | The current 9-tool unconditional fan-out wastes calls on sparse IRLs and pollutes the dossier with placeholder sections. Inclusion gates (boolean over which IRL sections must provide signal) elide unfunded tools in `mode: 'full'`. In `mode: 'extract-only'` the same gates drive which sections emit JSON. |
| Scenario reframing: the body becomes engagement-context-agnostic, voice cues per `transactionContext` stay | The `transactionContext` enum already covers `sell-side                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | buy-side | value-creation | unknown` and sweep already varies voice cues per value. The rename surfaces that scenario-handling at the prompt name. No new enum values; expand the per-context voice-cue prose so each scenario gets a meaningful sweep posture (sell-side defensibility, buy-side risk-confirmation, value-creation 100-day-plan). |
| Extraction-rule source-of-truth: `extraction-rules.ts` shared constants | The SOP (`irl-tool-input-mapping.md`) is the human-readable rule documentation; the constants module is the machine-shared rule text. The SOP file is NOT a registered Library MCP Resource (verified — not in `mcp-server/src/resources/library.ts`). Rule text reaches the prompt via constant interpolation. |
| JSON extraction surface + provenance footer + gap list ship in BOTH modes | These are quality improvements to the ingestion contract, not mode-specific features. Even partners running `mode: 'full'` benefit from JSON visibility + audit trails. The mode flag toggles tool invocation + synthesis, not the extraction quality surface. |
| Hub deeplinks come from the tools' wrappers, not hand-crafted in the prompt body | `buildTechparDeeplink` at `mcp-server/src/tools/techpar.ts:27` and analogous emitters in the other four tools own the deeplink URL contract. In `mode: 'full'`, sweep already gets deeplinks for free from the tool responses. In `mode: 'extract-only'`, no deeplinks are emitted; partners feed the JSON to whichever tool they want to obtain its deeplink. |
| No tool schema changes | All target tools have stable Zod input schemas as of BL-031.95. The intake payloads fit inside them with the partial-IRL caveat (`'unknown'` literal OR field-omitted) in § Acceptance Criteria. |
| One-shot vs interactive modes (mirror BL-043/044 pattern) | If `filledIrl` is supplied → run; if omitted → render an interactive body asking the partner to paste. Mirrors `gst_information_request_list` and the prior sweep behavior. |
| Top-of-dossier `meta` JSON fence in every emitted dossier (both modes) | Structured `{mode, verbosity, scenario, fixtureFillRatio, gatesPassed, gatesElided, conditionalTriggersFired, promptVersion, modelVersion}` block at the top of (A). Turns every dossier into an auditable artifact, enables cross-run comparison, makes BL-032.75 telemetry meaningful at the partner-output layer. |
| Schema-validated JSON-fence self-check directive (verbose mode only) | After each per-tool JSON fence is emitted, the model is directed to re-read it and confirm every field validates against the tool's Zod schema OR is literal `'unknown'` OR is omitted. Catches the most common model error class (wrong enum, wrong type) before partner consumes the JSON downstream. |
| BL-032.75 instrumentation hooks at `build()` time | Emit AE events for `prompt_invocation{mode, verbosity, scenario}`, `gate_elided{tool, reason}`, `wrong_irl_detected{ratio}`, `force_tools_used{names}`. Lands in PR B (Option α — accepts Phase 2's first ~30 days of baselines miss this signal; re-baseline post-merge). See § Risks. |
| Promote `irl-tool-input-mapping.md` to a registered MCP Library Resource at `gst://library/irl-tool-input-mapping` | Renamed prompt embeds the SOP via `embedLibraryArticle` as a third Library Resource. Model has SOP at attention rather than rule-prose inference. Structurally addresses body-bloat risk by relocating mapping verbosity to a Resource. |
| Section-fill ratio surfaced in (A) snapshot | The wrong-IRL detector already computes the ratio for the <15% halt threshold. Surface it as `IRL completeness: N% (X of 10 sections filled)`. Cheap signal; foundation for cross-engagement IRL-completeness comparison. |
| `forceTools` accepted-value enum derived from `orchestrates` array at build time | Rather than hand-maintain the enum, derive it. Prevents drift when a new tool is added to `orchestrates` but missed in `forceTools`. |
| Graceful tool-error degradation directive in the body | Explicit: if a tool invocation errors mid-sweep, emit the error verbatim, mark the section `extraction-only`, continue. Do NOT swallow or paraphrase. Meaningful predictability win for ~5 lines of body addition. |
| Self-check pass on extraction-provenance citations (verbose mode only) | After emitting the provenance footer, the model is directed to verify each `<field> ← Section N bullet M` citation contains the extracted value. Catches the "cited bullet doesn't support claimed value" failure mode. Verbose-mode only. |
| Deterministic mode-dispatch unit test | Assert the three-builder dispatch (`buildInteractiveBody` / `buildFullBody` / `buildExtractOnlyBody`) is total over the input domain `(filledIrl-present? × mode × verbosity)`. Insurance against future bugs where a new arg silently changes builder selection. |
| Build-time tool-schema awareness unit test | Fail CI if any field name referenced in the prompt body is absent from the orchestrated tools' Zod schemas. Catches silent schema renames that would rot the prompt's accuracy. |

---

## Tool inclusion gates

Each tool the prompt orchestrates carries an explicit gate: a predicate over which IRL sections must provide non-empty signal. In `mode: 'full'`, the tool is invoked only if its gate passes (or `forceTools` overrides — see below); otherwise the tool's dossier section is elided (with a note in (A) and in the gap list (J)). In `mode: 'extract-only'`, the same gate decides whether to emit the section's JSON payload.

**`transactionContext` is advisory only** — scenarios (`buy-side | sell-side | value-creation | unknown`) modulate the **voice cue** the synthesis prose uses but **do NOT** modulate the gate predicates. The same gates apply across all scenarios. Per-scenario weighting is captured in the synthesis directives, not in the inclusion logic. Rationale: gating-by-scenario is a quality multiplier with high false-negative risk (a sell-side engagement may still benefit from `search_portfolio`); v1 keeps gates IRL-content-driven and revisits scenario-aware gating after real engagement evidence accumulates.

**Escape hatch — `forceTools?: string[]` arg**: an explicit override that bypasses inclusion gates for the listed tool names. Useful when (a) the partner wants a tool's output despite sparse IRL signal, or (b) the partner is iterating on a refinement of a single section. Default `[]`; gates fully apply when empty.

| Tool                                    | Inclusion gate (passes if any clause is true)                                                                                                                                                                                                              | Notes                                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generate_diligence_agenda`             | **Always pass** — every dimension can default to `'unknown'`; the agenda is still useful as a "what's known vs not" inventory.                                                                                                                             | Strictest gate; never elides.                                                                                                                                                  |
| `compute_techpar`                       | **(Section 00 ARR > 0) AND** (Section 02 engineering-cost signal **OR** Section 03 hosting signal). Section 07 avg salary is a refinement that improves accuracy when both halves of the gate already pass — NOT a sufficient trigger on its own.          | Tightened: TechPar engine returns `null` if either `arr` or `infraHostingAnnual` is zero, so gate must require BOTH a denominator (ARR) AND a numerator (eng-cost OR hosting). |
| `assess_infrastructure_cost_governance` | **Always pass** — `companyStage` from Section 00 + seven seeding rules each have fallback-to-`-1` semantics; the dossier section is the value even when most answers default.                                                                              | If Section 00 stage is also missing, the model passes `'unknown'`; ICG still runs.                                                                                             |
| `estimate_tech_debt_cost`               | Section 04 (technical-debt assessment) has ≥1 non-empty Response cell.                                                                                                                                                                                     | Section 04 is the canonical Tech Debt input section.                                                                                                                           |
| `search_regulations`                    | Section 09 names ≥1 framework **OR** EU AI Act conditional trigger fires (Section 05 ML/AI + Section 00 EU geography) **OR** NIS2 conditional trigger fires (Section 00 EU + Section 01 named regulated sector).                                           | Conditional triggers documented in `NIS2_CONDITIONAL_TRIGGER` and `EU_AI_ACT_CONDITIONAL_TRIGGER` constants.                                                                   |
| `search_portfolio`                      | Section 00 (productType-like signal) present **OR** Section 01 (industry / competitive landscape) present.                                                                                                                                                 | Gate passes for any non-trivial IRL; portfolio is the comparables corpus.                                                                                                      |
| `search_radar`                          | **Always pass** — any non-trivial IRL provides at least a product description or geography that maps to a Radar category. Prior draft's "Section 01 OR Section 00 geographies" predicate was effectively always-true and added body bloat for no behavior. | Synthesis directives still weight radar output as supplementary context, not load-bearing for the dossier's spine.                                                             |
| `list_portfolio_facets`                 | Inherits from `search_portfolio`.                                                                                                                                                                                                                          | Called as preface to obtain canonical facet values.                                                                                                                            |
| `list_regulation_facets`                | Inherits from `search_regulations`.                                                                                                                                                                                                                        | Called as preface to obtain canonical facet values.                                                                                                                            |

The body specifies these gates as numbered predicates so the model evaluates each explicitly before invoking. Senior-consultant review of gates is part of the BLOCKING review surface in § Senior-consultant review gate.

---

## Body rendering strategy

`build()` dispatches to one of three body builders based on `argsSchema`:

| Args                                        | Builder                  | Body shape                                                                                                                            |
| ------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `filledIrl` absent                          | `buildInteractiveBody()` | Paste-the-IRL ask. No tool-name body-mentions; no JSON templates.                                                                     |
| `filledIrl` present, `mode: 'full'`         | `buildFullBody()`        | Pre-flight + extraction directives + inclusion gates + tool-invocation directives + synthesis directives + voice cues + gap list.     |
| `filledIrl` present, `mode: 'extract-only'` | `buildExtractOnlyBody()` | Pre-flight + extraction directives + inclusion gates + JSON-emission directives + gap list. **No** tool-invocation, **no** synthesis. |

`buildFullBody` and `buildExtractOnlyBody` share helper functions for the wrong-IRL pre-flight paragraph, the per-tool inclusion-gate text, the per-scenario voice cue, the rule-constant interpolations, and the gap-list directives. Mode-specific text (invocation/synthesis vs. JSON-emission) is the only divergence. Helpers live alongside the builders in `irl-ingestion.ts`; if any helper grows to ~30 LOC consider a `body-helpers.ts` extraction (out of scope for v1 — defensible to ship inline).

**Mode × verbosity matrix — design note**: the `(extract-only, compact)` cell strips both synthesis prose AND provenance footers, leaving JSON fences + gap list only. Defensible: serves the "audit-trail JSON dump for downstream automation" use case (script ingestion, spreadsheet paste, MCP-client-to-MCP-client handoff). Future contributors should not collapse this cell away as redundant — its consumer is automation, not the human reading the dossier.

**Golden snapshot convention**: the registry-walker's `golden-snapshots.test.ts` enforces strict `<slug>.golden.md` (verified at `mcp-server/tests/integration/golden-snapshots.test.ts:53-65`). The canonical golden is `irl-ingestion.golden.md` against `mode: 'full'` (the default mode). Extract-only golden lives at `mcp-server/tests/examples/extras/irl-ingestion-extract-only.golden.md` outside the walker's strict directory and is asserted by a dedicated unit test (`tests/unit/prompts/irl-ingestion-extract-only-golden.test.ts`). Same recording discipline (recordedAt, model, args, full output) applies to both.

**Body-hash stability test** hashes both modes' rendered bodies separately to lock both branches.

---

## Output structure

The prompt returns one assistant turn. Sections in order; each per-tool section may be elided per its inclusion gate.

### Top-of-dossier `meta` JSON fence (always emitted)

Before (A). Single ` ```json ` fence with the structured run metadata:

```json
{
  "promptName": "gst_irl_ingestion",
  "promptVersion": "0.1.0",
  "modelVersion": "<model id at invocation time>",
  "mode": "full|extract-only",
  "verbosity": "verbose|compact",
  "transactionContext": "buy-side|sell-side|value-creation|unknown",
  "fixtureFillRatio": 0.58,
  "fixtureFillRatioStatus": "ok|partial|halt",
  "gatesPassed": ["generate_diligence_agenda", "compute_techpar", "..."],
  "gatesElided": [{ "tool": "estimate_tech_debt_cost", "reason": "Section 04 silent" }, "..."],
  "conditionalTriggersFired": ["EU_AI_ACT", "NIS2"],
  "forceToolsApplied": []
}
```

Turns every dossier into an auditable artifact. Cross-run comparison (same args produce same `gatesPassed`?), telemetry consumption (downstream scripts parse the fence), and partner debugging ("which gates fired this time") all key off this block. Field-omission rules: present in extract-only and full modes alike; emitted before (A).

### (A) Engagement snapshot

Two-to-three sentences. Identifies the target, the engagement context, and which Hub-tool sections are emittable (per the gates). **Surfaces the fill ratio as a human-readable sentence** (e.g., "IRL completeness: 58% (8 of 10 sections filled)") so the partner sees the structural quality signal without parsing the meta fence. Closes with a "how to use this" line tailored to the mode:

- `mode: 'full'` — "Invoked tools: [list]. Elided per inclusion gate: [list with reason]. Refine by re-running with edited args."
- `mode: 'extract-only'` — "No tools invoked; feed any section's JSON to its tool to obtain analysis + deeplink. Re-run with `mode: 'full'` for the synthesized dossier."

### (B) - (…) Per-tool sections

Each section gets the same shape — **always** in `mode: 'extract-only'`; **always** in `mode: 'full'` plus the synthesis prose and tool-emitted deeplink:

````
### (X) <tool name> — extraction
```json
{
  "<field>": "<value or 'unknown' or omitted>",
  ...
}
````

[mode: 'full' only — synthesis prose paragraphs]

[mode: 'full' only — "Open <Tool> Wizard" link (tool's own deeplink, not hand-crafted)]

Provenance (when verbosity: 'verbose'):

- `arr ← Section 00, bullet 3 ($45.2M)`
- `engFTEs ← Section 02, bullet 4 (58 total)`
- `engCost ← Section 02 bullets 4 + Section 07 bullet 2 (58 − 8 SRE = 50 × $185K salary, see ENG_COST_DEDUP_RULE)`
- ...

````

Field-value semantics: any field with no IRL signal carries the literal string `'unknown'` (enum fields) or is **omitted** from the payload (numeric fields).

**Tool-error degradation (mode: `full` only)**: if a tool invocation errors mid-sweep, the section emits the error verbatim (no paraphrase), marks the section as `extraction-only` (JSON fence + provenance only, no synthesis prose), and the sweep continues to the next gate-passing tool. The error appears verbatim in the meta fence's `gatesPassed` list — entries become `{tool, errorVerbatim}` rather than the tool name alone. Partner sees what failed and can re-run that tool directly with the JSON fence's payload.

**Self-check pass on JSON fence (verbose mode only)**: after emitting each per-tool JSON fence, the model is directed to re-read it field-by-field and confirm every field either validates against the tool's Zod schema (type + enum + range) OR is the literal `'unknown'` OR is omitted from the payload. If any field fails, the model rewrites the value to `'unknown'` and adds a provenance line `<field> ← self-check: original value <X> failed schema, downgraded to 'unknown'`. This catches the model-mediated extraction's most common error class (wrong enum, wrong type, out-of-range numeric) before the partner ships the JSON downstream.

**Self-check pass on provenance citations (verbose mode only)**: after the provenance footer is emitted, the model verifies each `<field> ← Section N bullet M` citation actually contains the extracted value. If a citation doesn't support the value (the bullet's text doesn't contain or imply the claimed number/enum), the model rewrites that field to `'unknown'` and amends the provenance line to `<field> ← self-check: citation Section N bullet M does not support <value>, downgraded to 'unknown'`. Catches the failure mode where the model invents a plausible citation for a value it actually inferred indirectly.

### (J) Gap list

Always emitted. Bulleted enumeration of:

- Dimensions that defaulted to `'unknown'` across the diligence-agenda payload
- ICG questions that defaulted to `-1` (with the IRL section that would have justified seeding if filled)
- Hub-tool sections that elided entirely (with the inclusion gate that failed)
- Conditional triggers that fired without explicit Section 09 backing (e.g., "NIS2 added because EU geography + regulated sector — partner should confirm with target")

This is the highest-leverage diligence-prep deliverable: the "ask the target a follow-up" checklist.

---

## Critical files

| File                                                          | Action                                  | Notes                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp-server/src/prompts/extraction-rules.ts`                  | **NEW (PR A — refactor)**               | Shared rule-text constants. Lands before BL-045's behavior changes.                                                                                                                                                                                                                                                               |
| `mcp-server/src/resources/library.ts`                         | MODIFY (PR B)                            | Register `gst://library/irl-tool-input-mapping` as a Library Resource. Source: `mcp-server/src/docs/library/irl-tool-input-mapping.md` (moved or symlinked to the canonical `src/data/library/...` location per BL-043 pattern).                                                                                                |
| `src/data/library/irl-tool-input-mapping/article.md`          | **NEW (PR B)** (move from mcp-server/src/docs/library/) | Canonical location for the SOP as a Library Resource per BL-043's `LIBRARY_METADATA` pattern. The existing `mcp-server/src/docs/library/irl-tool-input-mapping.md` becomes a stub or is deleted; the new path is the source of truth.                                                                                              |
| `mcp-server/src/observability/metrics.ts`                     | MODIFY (PR B)                            | Add typed emitters for the four new BL-032.75 events: `prompt_invocation`, `gate_elided`, `wrong_irl_detected`, `force_tools_used`. Follows the existing `withMetrics` HOF pattern.                                                                                                                                                |
| `mcp-server/src/prompts/diligence-sweep.ts`                   | MODIFY (PR A) → DELETE (PR B)           | PR A: interpolate constants. PR B: file is git-mv'd to `irl-ingestion.ts` and reworked.                                                                                                                                                                                                                                          |
| `mcp-server/src/prompts/irl-ingestion.ts`                     | **NEW (PR B)** (git-mv from above)      | Renamed prompt. New `PROMPT_NAME = 'gst_irl_ingestion'`. Adds `mode` + `verbosity` args. Implements inclusion gates as numbered predicates. Body imports each `extraction-rules.ts` constant.                                                                                                                                       |
| `mcp-server/src/prompts/_registry.ts`                         | MODIFY (PR B)                           | Update import path + registry entry. Old name removed.                                                                                                                                                                                                                                                                            |
| `mcp-server/tests/unit/prompts/diligence-sweep.test.ts`       | RENAME → `irl-ingestion.test.ts` (PR B) | Rename + extend with mode-flag, inclusion-gate, JSON-fence, gap-list, and shared-import tests.                                                                                                                                                                                                                                    |
| `mcp-server/tests/integration/diligence-sweep-body-hash-stability.test.ts` | RENAME → `irl-ingestion-body-hash-stability.test.ts` (PR B) | Rename. Re-baseline hash to the post-rename rendered body.                                                                                                                                                                                                                                                                       |
| `mcp-server/tests/examples/diligence-sweep.golden.md`         | RENAME → `irl-ingestion.golden.md` (PR B) | Canonical golden — re-record against MedSig at `mode: 'full'` (the default). Registry walker requires `<slug>.golden.md`.                                                                                                                                                                                                                                          |
| `mcp-server/tests/examples/extras/irl-ingestion-extract-only.golden.md` | **NEW (PR B)**                | Extract-only golden, kept outside the registry-walker's strict directory. Asserted by dedicated unit test in `tests/unit/prompts/irl-ingestion-extract-only-golden.test.ts`.                                                                                                                                                                                       |
| `mcp-server/tests/fixtures/medsig-health-filled-irl.md`       | _unchanged_                             | Existing buy-side-framed fixture; reused as the canonical full-mode golden's source.                                                                                                                                                                                                                                              |
| `mcp-server/tests/fixtures/<TBD>-sell-or-vc-filled-irl.md`    | **NEW (PR B)**                          | Second fixture covering either sell-side or value-creation framing. Required because the rescope's headline claim is scenario-neutrality; recording all goldens against a buy-side fixture leaves three of four `transactionContext` voice cues unverified at merge time. Authoring effort: ~1 hour borrowing the MedSig structure with a different context bullet + minor section adjustments. |
| `mcp-server/tests/fixtures/sparse-partial-filled-irl.md`      | **NEW (PR B)**                          | Third fixture: a deliberately partial IRL (Sections 00-02 filled, 03-09 silent or "n/a"). Required to exercise inclusion-gate elisions across multiple gates simultaneously and to lock the (J) gap-list behavior.                                                                                                                |
| `mcp-server/src/docs/library/irl-tool-input-mapping.md`       | MODIFY                                   | Body-mentions of `gst_diligence_sweep` → `gst_irl_ingestion`. **Read the SOP body during PR B** — any worked example that assumes the prior 9-tool unconditional fan-out behavior gets updated to reflect inclusion-gate behavior. Add § "Consumers of this SOP" listing the renamed prompt + the `extraction-rules.ts` module. Update § "Future evolution lanes" — strike the BL-045 line, mark as the in-progress rescope.                                                                  |
| `mcp-server/BREAKING_CHANGES.md`                              | MODIFY                                   | Add entries for PR A (no surface change) and PR B (prompt rename + new args + new behavior). PR B's entry is the load-bearing migration doc — server `0.4.0`, prompt `gst_irl_ingestion@0.1.0`, `gst_diligence_sweep` retired with NO compat alias.                                                                          |
| `mcp-server/README.md`                                        | MODIFY                                   | Prompts table: replace row. "Last verified" stanza: 2026-06-01 entry. **Plus** a one-line callout for the new `mode` arg + a worked-example invocation showing `mode: 'extract-only'` (otherwise the mode flag is invisible to new partners who don't read BREAKING_CHANGES).                                                       |
| `mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md`       | MODIFY                                   | Replace any `gst_diligence_sweep` invocation example with the new name + a short note about modes.                                                                                                                                                                                                                                |
| `src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md` | **NEW** (this document, replaces prior draft) | The doc you're reading.                                                                                                                                                                                                                                                                                                          |
| `src/docs/development/MCP_SERVER_IRL_GENERATOR_BL-044.md`     | MODIFY                                   | `> **Sequels**` line: replace the speculative BL-045 line with "✅ Shipped — see BL-045 design doc". Replace any in-text references to `gst_diligence_sweep` with `gst_irl_ingestion`.                                                                                                                                          |
| `src/docs/development/MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md` | MODIFY                                   | Same rename + sequels-line update.                                                                                                                                                                                                                                                                                                |
| `src/docs/development/MCP_SERVER_OPENCLAW_HANDOVER_BL-032_6.md`  | MODIFY                                   | Historical doc — add an "as of BL-045 (2026-06-NN), this prompt was renamed to `gst_irl_ingestion`" note. Leave the historical references intact for archival fidelity.                                                                                                                                                            |
| `src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md`     | MODIFY                                   | Same as above.                                                                                                                                                                                                                                                                                                                    |
| `src/docs/development/MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md`   | MODIFY                                   | Replace any `gst_diligence_sweep` mention with the new name + a footnote citing the rename.                                                                                                                                                                                                                                       |
| `src/docs/development/BACKLOG.md`                             | MODIFY                                   | BL-045 stanza: Candidate → Committed at design-doc landing → Done at PR B merge. Update title to "Sweep IRL-Ingestion Hardening + Rename." Promote acceptance criteria from this doc.                                                                                                                                          |
| `src/docs/development/DEVELOPER_TOOLING.md`                   | MODIFY (PR B)                            | Per CLAUDE.md § 11 — document `npm run lint:no-old-prompt-names`: what it checks, when it fires (inside `npm run lint`), how to extend the BL-032.6 archival-doc allow-list when new historical docs land.                                                                                                                       |
| `package.json`                                                | MODIFY (PR B)                            | Add `lint:no-old-prompt-names` script; wire into `lint` aggregate.                                                                                                                                            |
| `tests/integration/techpar-mcp-wizard-roundtrip.test.ts`      | _unchanged_                              | Tests the `compute_techpar` deeplink path, not the prompt name. References `gst_diligence_sweep` only in a comment (verify; if so leave; if it's a code reference, update).                                                                                                                                                       |
| `mcp-server/src/schemas.ts`                                   | _unchanged_                              | Tool schemas stable.                                                                                                                                                                                                                                                                                                              |

---

## Acceptance Criteria

Promoted verbatim into BACKLOG.md when this design doc lands.

- [ ] **PR A merged first**: `extraction-rules.ts` exists, exports six named constants. `diligence-sweep.ts` interpolates them. `diligence-sweep.golden.md` is re-recorded with a structural-only diff (sentence-boundary cleanup, no semantic or behavioral change) and the diff is reviewer-approved as such.
- [ ] **PR B — rename**: `mcp-server/src/prompts/irl-ingestion.ts` exists with `PROMPT_NAME = 'gst_irl_ingestion'` and `version: '0.1.0'`. `mcp-server/src/prompts/diligence-sweep.ts` is deleted. The registry surfaces only the new name; `prompts/list` over MCP transport returns `gst_irl_ingestion` and not `gst_diligence_sweep`.
- [ ] All 15 referencing files updated (per § Critical files). No `gst_diligence_sweep` literal survives in `mcp-server/src` or in any current-state doc under `src/docs/development`. Historical docs (BL-032.6 OpenClaw, BL-032.6 Demo, BL-036 — subjects of the BL-032.6-era state, not the current state) carry a "renamed as of BL-045" footnote but retain the old name for archival fidelity. (Rule: docs whose subject is the BL-032.6-era state get footnotes; docs whose subject is the current state get literal renames.)
- [ ] **`mode` arg** with default `'full'` and `'extract-only'` alternative; **`verbosity` arg** with default `'verbose'` and `'compact'` alternative; **`forceTools?: string[]` arg** with default `[]` (when non-empty, bypasses inclusion gates for the listed tool names).
- [ ] **Inclusion gates**: each tool has a documented inclusion predicate (per § Tool inclusion gates). In `mode: 'full'`, the rendered body instructs the model to evaluate each gate before invoking the tool. In `mode: 'extract-only'`, the same gates drive section emission.
- [ ] **JSON code fence per emitted section**: every `(B)`-`(…)` section in both modes contains a ` ```json ` fence whose content parses as valid JSON (regression-lockable in unit tests). Every field value either validates against the tool's Zod schema OR is the literal `'unknown'` OR is omitted from the payload.
- [ ] **Provenance footer**: per-section provenance lines under `verbosity: 'verbose'`; elided under `'compact'`. Each non-`'unknown'`/non-omitted field cites an IRL section bullet.
- [ ] **Gap list (J)**: always emitted in both modes; enumerates `'unknown'` dimensions, ICG `-1`s, elided sections + reasons, conditional triggers fired without Section 09 backing.
- [ ] **Wrong-IRL detector — structural + semantic**: the pre-flight paragraph instructs the model to compute a Response-cell-fill ratio (non-empty / total Response cells across all sections) BEFORE extraction. If the ratio is <15%, the model halts extraction, surfaces "this looks like an unfilled request IRL or a substantially-empty filled IRL — confirm before proceeding" in (A), and emits NO per-tool sections. If the ratio is 15-40%, the model proceeds but flags partial-IRL status in (A) and tightens elision (skip any section whose source-IRL sections are all empty). The 15% threshold is a v1 calibration; revisit after senior-consultant review against the three fixtures. Pure model-mediated judgement (no structural check) was inadequate — the cascade from missed detector → all-`'unknown'` dossier is severe.
- [ ] **Scenario-aware voice cues**: per-`transactionContext` voice cues expanded to give meaningful posture for each of `sell-side | buy-side | value-creation | unknown`. No scenario falls back to a sweep-only buy-side framing.
- [ ] **Goldens** (three minimum): (1) canonical `irl-ingestion.golden.md` (registry-walker-discoverable) recorded against MedSig at `mode: 'full', transactionContext: 'buy-side'`; (2) extract-only artifact at `tests/examples/extras/irl-ingestion-extract-only.golden.md` recorded against the sparse-partial fixture at `mode: 'extract-only'` (locks elision + gap-list behavior simultaneously); (3) scenario artifact at `tests/examples/extras/irl-ingestion-scenario.golden.md` recorded against the sell-or-vc fixture at `mode: 'full', transactionContext: <sell-side|value-creation>` (locks voice-cue variation). Each records `recordedAt`, `model`, args, full assistant output. The "scenario-neutrality" claim is unverified at merge time without all three.
- [ ] **All existing `diligence-sweep.test.ts` cases preserved through the rename.** The ~54 target in § Testing strategy is **additive on top of** the existing ~21 sweep cases that carry over; no existing case is deleted unless it's tied to a removed behavior (call out any such removal explicitly in PR B's commit message).
- [ ] **Top-of-dossier `meta` JSON fence** — every emitted dossier (both modes) leads with the structured `{promptName, promptVersion, modelVersion, mode, verbosity, transactionContext, fixtureFillRatio, fixtureFillRatioStatus, gatesPassed, gatesElided, conditionalTriggersFired, forceToolsApplied}` JSON block. Field shape locked in unit tests; canonical golden contains a populated example.
- [ ] **Schema-validated JSON-fence self-check directive** (verbose mode only) present in body; unit-test asserts the directive text appears in `buildFullBody` and `buildExtractOnlyBody` rendered output under `verbosity: 'verbose'` and is absent under `verbosity: 'compact'`.
- [ ] **BL-032.75 instrumentation hooks** — `build()` emits AE events `prompt_invocation{mode, verbosity, scenario}`, `gate_elided{tool, reason}`, `wrong_irl_detected{ratio}`, `force_tools_used{names}`. Integration test asserts the events surface in the `withMetrics` test harness. **Risk-accepted under Option α**: the first ~30 days of Phase 2 baselines do not include these signals; re-baseline post-merge.
- [ ] **SOP promoted to Library Resource** at `gst://library/irl-tool-input-mapping`; renamed prompt embeds it via `embedLibraryArticle` as the third Library Resource (after `gst://library/information-request-list` and `gst://library/vdr-structure`). `orchestrates: [...]` array includes the new URI; body-mention invariant enforces the URI's appearance in the rendered body.
- [ ] **Section-fill ratio surfaced in (A) snapshot** as a human-readable sentence (e.g., `IRL completeness: 58% (8 of 10 sections filled)`); the structured value lives in the meta fence's `fixtureFillRatio`.
- [ ] **`forceTools` enum derived from `orchestrates`** at build time (not hand-maintained). Unit test asserts adding a tool to `orchestrates` immediately expands the accepted `forceTools` enum.
- [ ] **Graceful tool-error degradation directive** present in `buildFullBody` rendered output. Unit test asserts the directive text appears verbatim. Integration-test-level (E2E if practical): simulate a tool error and verify the dossier section emits the error verbatim + marks the section `extraction-only` + the sweep continues.
- [ ] **Self-check pass on provenance citations** directive present in `buildFullBody` and `buildExtractOnlyBody` under `verbosity: 'verbose'`; absent under `verbosity: 'compact'`.
- [ ] **Deterministic mode-dispatch test** — assertion that the three-builder dispatch is total over the input domain `(filledIrl-present? × mode × verbosity × forceTools-non-empty?)`. Total cells: 2 × 2 × 2 × 2 = 16; test enumerates each cell and asserts the expected builder fires.
- [ ] **Build-time tool-schema awareness test** — fails CI if any field name referenced in the rendered prompt body is absent from the orchestrated tools' Zod schemas. Extracted field names appear in JSON-fence templates; test parses the JSON templates and cross-references against the Zod schemas.
- [ ] **Shared-import enforcement**: static AST-level test asserts `irl-ingestion.ts` imports each of the six constants from `extraction-rules.ts`. No character-diff approach (structurally infeasible — see § Pre-implementation refactor).
- [ ] **`mcp-server/BREAKING_CHANGES.md`**: entries for both PR A and PR B. PR B's entry is the canonical migration doc — names the new prompt, the new args, the elided behavior surface, the lack of compat alias, and the recommended client-side migration step ("update `prompts/get gst_diligence_sweep` → `prompts/get gst_irl_ingestion`").
- [ ] **Senior-consultant content review** of the renamed prompt's body, the inclusion gates, the wrong-IRL detector paragraph, and the per-scenario voice cues **before** PR B merges. § "Senior-consultant review gate" specifies the surface.
- [ ] **BACKLOG.md BL-045 stanza** updated: Candidate → Committed at design-doc landing; Committed → Done at PR B merge. Title updated to "Sweep IRL-Ingestion Hardening + Rename".

---

## Testing strategy

Mirrors BL-043 / BL-044 test pyramid. Reuses existing infrastructure; adds no new test runners.

### Unit tests (`mcp-server/tests/unit/prompts/irl-ingestion.test.ts` — renamed + extended)

- **Schema validation** (~10 cases): valid full args, valid minimal args (`filledIrl` only), interactive mode (no args), `mode` defaults to `'full'`, `mode: 'extract-only'` is accepted, `verbosity` defaults to `'verbose'`, `forceTools` defaults to `[]`, `forceTools` accepts a known tool name, `forceTools` rejects an unknown tool name (strict enum), rejects `filledIrl` shorter than 200 chars.
- **One-shot body invariants** (~12 cases): contains the new `PROMPT_NAME`; contains all orchestrated tool names; references each of the six `extraction-rules.ts` constants; references each tool's inclusion gate by tool name; references each of the four `transactionContext` voice cues; references the wrong-IRL detector paragraph; references the gap list (J) section by name; references the `forceTools` override semantics; mode-aware text (`mode: 'full'` body contains "invoke", `mode: 'extract-only'` body does NOT).
- **Mode × verbosity matrix** (~4 cases — the full coverage matrix): (full, verbose), (full, compact), (extract-only, verbose), (extract-only, compact). At minimum a body-substring check per cell: verbose includes "Provenance:" markers; compact does not. Full includes "invoke"; extract-only does not.
- **JSON-fence shape** (~5 cases): for each emittable tool section, the rendered body contains a ` ```json ` fence and its content (with placeholder values substituted out) parses as valid JSON via `JSON.parse`. Prompt-body shape regression-lock, NOT model-output assertion.
- **Inclusion gates — positive + negative per gate** (~18 cases): for each of the 9 gates, one case asserts the gate-pass directive is present in the body, one case asserts the gate-fail elision directive is present. Replaces the prior draft's ~5-case coverage (insufficient for 9 gates).
- **`forceTools` gate-bypass behavior** (~2 cases): when `forceTools: ['compute_techpar']` is passed and TechPar's gate would fail (Section 00 ARR absent), the rendered body contains the TechPar invocation directive rather than the elision directive. Negative: when `forceTools` is empty AND the gate fails, body contains elision directive.
- **Interactive body** (~3 cases): paste-the-IRL instruction present; does NOT contain tool-name body-mentions; does NOT contain JSON payload templates.
- **Shared-import enforcement** (~1 case): AST-level test asserts `irl-ingestion.ts` imports each of the six constants.
- **`lastReviewedAt` freshness** (~1 case): frontmatter field present and within the 12-month freshness window.

- **Meta JSON fence** (~4 cases): fence is emitted in both modes; contains all 12 documented fields; field types match the documented shape; `gatesElided` entries have `{tool, reason}` structure.
- **Tool-error degradation** (~3 cases): directive text present in `buildFullBody`; not present in `buildExtractOnlyBody`; integration scenario asserts simulated tool error produces verbatim-error section + continues sweep.
- **Self-check directives** (~4 cases): JSON-fence self-check directive in verbose body, absent in compact body; provenance-citation self-check directive in verbose body, absent in compact body.
- **Deterministic dispatch** (~1 case, 16-cell assertion table): every `(filledIrl-present? × mode × verbosity × forceTools-non-empty?)` cell dispatches to the expected builder.
- **Build-time tool-schema awareness** (~1 case, walks all extracted JSON-template field names): every field referenced in a JSON template exists in the corresponding tool's Zod schema.
- **`forceTools` enum derivation** (~2 cases): adding a tool to a stub `orchestrates` array expands the enum; removing one shrinks it.
- **BL-032.75 metrics emission** (~4 cases, integration-level): each of the four AE events fires under its triggering condition in the `withMetrics` test harness.

Target: ~73 cases. Substantially higher than `information-request-list.test.ts` (21) and the prior sweep test surface (~21) — covers mode-flag, the 9 inclusion gates with positive/negative coverage, the 4-cell mode×verbosity matrix, the `forceTools` escape hatch, the meta fence, tool-error degradation, the two self-check directives, deterministic dispatch, build-time schema awareness, derived `forceTools` enum, and BL-032.75 metric emission. The existing sweep invariants are preserved through rename.

### Integration tests (`mcp-server/tests/integration/`)

- **`prompts-registry.test.ts`** auto-picks the renamed prompt; auto-validates name uniqueness, `orchestrates` body-mention, version semver, `lastReviewedAt` freshness. **Existing test, no new file**; pickup is automatic on the registry walker.
- **`protocol-roundtrip.test.ts`** auto-asserts `gst_irl_ingestion` surfaces in `prompts/list` and `gst_diligence_sweep` does NOT.
- **`irl-ingestion-body-hash-stability.test.ts`** (renamed from `diligence-sweep-body-hash-stability.test.ts`): re-baselined hash; locks the rendered body against accidental drift.
- **`manifest-stability.test.ts`**: server bumps to `0.4.0`; the manifest hash drift is expected and the test's expected-hash is updated in the same PR.

### Golden snapshots

Two files at `mcp-server/tests/examples/`:

- `irl-ingestion-full.golden.md` — `mode: 'full'`, MedSig fixture, full dossier including invocations, synthesis prose, deeplinks. Lock includes at least one elided section (for inclusion-gate behavior).
- `irl-ingestion-extract-only.golden.md` — `mode: 'extract-only'`, same fixture, JSON + provenance + gap list only. Lock includes at least one `'unknown'` propagation.

### E2E

None. Discoverability via the prompts picker is covered by registry tests. Tool invocations + deeplinks are covered by each tool's own E2E (BL-031.95).

### Anti-patterns the tests must NOT regress into

- **No mocking of the model** — golden tests run against the recorded fixture; pull a fresh recording when intentional changes ship.
- **No regex-validation of extracted JSON values** — the value of unit tests is locking the prompt body + registry contract, not asserting model output. Golden snapshots are the regression-lock on output shape.
- **No body-mention checks against the SOP body** — checks are against tool names, constant text, and inclusion-gate predicates. The SOP's prose is engineering-internal documentation, not embedded.

---

## Senior-consultant review gate

**BLOCKING before PR B merge.** The renamed prompt's body contains domain-load-bearing prose. The reviewer's task is wider than the prior sweep-level review surface because two new behavior axes are introduced:

1. **Rule fidelity post-rename**: read the new body side-by-side with sweep's pre-refactor body. The five rule-citation paragraphs are now constant interpolations from `extraction-rules.ts`; confirm the surrounding orchestration framing in the new body remains substantively correct for each rule's intent. Any deliberate deviation flagged and discussed.
2. **Inclusion-gate appropriateness — full 9 × 4 matrix**: walk through each of the nine inclusion gates across each of the four `transactionContext` scenarios (`buy-side`, `sell-side`, `value-creation`, `unknown`) — 36 cells total. For each cell: does the gate predicate plus the scenario voice cue produce the dossier section the partner would actually want? Per CLAUDE.md § 4a (no deferred tech debt), this matrix is reviewed in full at v1 rather than ship-then-fix; the PR B effort estimate (4-5 days) is sized to accommodate this. Reviewer's deliverable: a 36-cell sign-off table, attached to the PR as the merge gate.
3. **Voice-cue completeness**: read each of the four per-`transactionContext` voice cues. Does each give the model meaningful posture? Specifically: does the value-creation cue say enough that the dossier centers the 100-day plan, the sell-side cue enough that the dossier sharpens the defensible story, the unknown cue enough that the dossier reads as universal?
4. **Wrong-IRL detector calibration**: walk through the detector paragraph against (a) a correctly filled IRL, (b) an unfilled request IRL, (c) a half-filled IRL (Sections 00-02 only). The detector should warn on (b), proceed on (a), and proceed with a partial-IRL note on (c). No false positives on legitimate partial IRLs.
5. **Naming + framing**: confirm `gst_irl_ingestion` is the right verb and that the prompt's `description` field reflects the scenario-neutral surface (no buy-side framing remnant). Update before merge based on the review.

Pattern reference: BL-043 Step 5.5 (the BLOCKING content-review gate that gated `gst_information_request_list@0.0.1`); BL-044's manual smoke tests at § "Validation sequence before PR".

---

## Risks & mitigations

| Risk                                                                                                                                                                  | Severity                | Mitigation                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External clients have `gst_diligence_sweep` pinned                                                                                                                    | **Unknown blast radius** | No formal census of external clients exists as of 2026-06-01. Internal blast radius is bounded (15 references, all migrated in PR B). Operator decision recorded 2026-06-01: ship the rename without a compat alias, citing the framing-removal goal. If a client surfaces during the senior-consultant review or post-deploy with a `prompts/get gst_diligence_sweep` "not found" error, a 30-day compat alias is a ~10-LOC `_registry.ts` change as a hotfix. The doc does NOT claim the risk is Medium because no evidence supports that calibration; the operator accepted unknown-blast-radius shipping. |
| Extraction-rule drift between intake (old design) and sweep — obviated by rescope                                                                                     | **Low** (post-rescope)  | The rescope folds intake into the single renamed prompt; there is no second copy of rule text. The shared-import test enforces both that the constants exist and that they're imported.                                                                                                                                                                                  |
| Inclusion gates elide a tool the partner expected                                                                                                                     | Low                     | Three layers: (1) `forceTools?: string[]` arg lets the partner override gates explicitly without editing the IRL; (2) (A) snapshot enumerates which gates passed/failed and why; (3) (J) gap list re-states the elision with the IRL bullet that would have satisfied the gate. Partner can also re-run with the IRL section completed if the source data has since arrived.                                                                |
| The partner pastes the **request** IRL instead of the **filled** IRL                                                                                                  | Low                     | Structural + semantic detector ships in v1 (see Acceptance Criteria "Wrong-IRL detector"). The model computes a Response-cell-fill ratio before extraction: <15% halts with a "confirm" message; 15-40% proceeds with partial-IRL flag; >40% proceeds normally. The 15% threshold is calibrated against the three fixtures during senior-consultant review. Cascade-to-meaningless-dossier is structurally prevented rather than relying on model judgement alone. |
| Partial IRL — partner pastes Sections 00-02 only because the rest isn't back                                                                                          | Medium                  | Inclusion gates handle this gracefully. (B), (C), (E) emit with the available signal; (D), (F) elide; (J) gap list shows what's missing. (A) snapshot acknowledges the partial input explicitly.                                                                                                                                                                       |
| The SOP grows new bullets (BL-044.5-style canonical edits) and the prompt body's section-anchor references go stale                                                    | Medium                  | The body refers to sections by **name** (Section 04 — SDLC) not by line number. SOP edits that don't rename sections don't break the prompt. Section renames trigger a `lastReviewedAt` review.                                                                                                                                                                          |
| A new Hub tool ships (BL-04N) with inputs the IRL covers but the prompt's tool list ossifies                                                                          | Medium                  | "Add a section (…) + an inclusion gate" is a one-version-bump change. The tool list is a literal enumeration, not generated; additions are deliberate and senior-reviewed.                                                                                                                                                                                              |
| Rewritten body grows past attention-effective length                                                                                                                  | Medium                  | Sweep's pre-rewrite body is ~3500 tokens rendered. Adding wrong-IRL pre-flight + 9 inclusion-gate predicates + provenance directives + per-mode branching + 4-scenario voice cues could push the rendered body past Claude Desktop's prompt-render budget OR degrade model attention on late-body directives. Mitigations: (1) `mode: 'extract-only'` ships a substantially shorter body (no synthesis directives needed); (2) `verbosity: 'compact'` elides provenance directive paragraphs from the body; (3) benchmark rendered token count before/after as part of PR B verification. If full-mode body exceeds ~5000 rendered tokens, extract gate-evaluation logic into a separate Resource embedded via `embedLibraryArticle` rather than inlined. |
| Mode-aware body branching introduces test-surface drift                                                                                                                | Medium                  | Canonical golden (full) + extras-directory golden (extract-only) + mode-specific unit invariants + dedicated body-hash-stability hashes per mode. Drift in either mode surfaces independently in CI.                                                                                                                                                                       |
| Scenario reframing under-serves a transactionContext value                                                                                                            | Medium                  | Senior-consultant gate covers per-scenario voice-cue review explicitly. The `'unknown'` cue is the safety net for engagement contexts that don't fit cleanly.                                                                                                                                                                                                            |
| BL-032.75 Phase 2 baselines miss the first ~30 days of prompt-level metrics (Option α)                                                                                | **Accepted**            | Phase 2 baselining started 2026-05-31 with first data pull 2026-06-07. BL-045 (with instrumentation hooks) cannot ship before that date — PR A + PR B = 5+ days minimum. Operator decision recorded 2026-06-01: accept the gap rather than split instrumentation into a pre-merge patch PR. Mitigation: once BL-045 merges, the next data-pull cycle re-baselines with prompt-level metrics included. Cost: ~30 days of Phase 2's window passes without the highest-leverage signal; the SLO targets that emerge from Phase 2 baseline data may need post-merge recalibration. |
| Server minor bump invalidates manifest-stability test cache                                                                                                            | Low                     | Expected; the test's expected-hash is updated in PR B.                                                                                                                                                                                                                                                                                                                  |
| Provenance footer in verbose mode is too long                                                                                                                          | Low                     | `verbosity: 'compact'` arg elides. Default verbose for audit defensibility.                                                                                                                                                                                                                                                                                              |

---

## Implementation steps

Atomic commits across two PRs. PR A is the refactor; PR B is the rename + behavior expansion. PR A merges first; PR B branches from post-PR-A master.

### PR A — Extraction-rule refactor (~0.5 day)

1. Land `mcp-server/src/prompts/extraction-rules.ts` with the six constants.
2. Update `diligence-sweep.ts` to interpolate constants. Render diff is empty.
3. Add the constant-presence test in `diligence-sweep.test.ts`.
4. Re-record `diligence-sweep.golden.md`. Diff must be empty; if not, tighten constants until it is.
5. Add BREAKING_CHANGES entry (no surface change). Bump `mcp-server` patch.
6. Merge.

### PR B — Rename + harden + bundled enhancements (~5-7 days)

**Effort expanded from a prior 4-5 day estimate** to accommodate the bundled BL-045 audit-cycle additions:

- Top-of-dossier `meta` JSON fence (~0.5 day body + tests)
- Schema-validated JSON-fence self-check directive (~0.5 day body + tests)
- BL-032.75 instrumentation hooks (~0.5 day metrics + tests)
- Promote SOP to Library Resource + relocate to `src/data/library/` (~0.5 day)
- Section-fill ratio in (A) snapshot (~0.25 day)
- `forceTools` enum derivation + test (~0.25 day)
- Graceful tool-error degradation directive + integration test (~0.5 day)
- Self-check pass on provenance citations (~0.25 day body + tests)
- Deterministic mode-dispatch test (~0.25 day)
- Build-time tool-schema awareness test (~0.5 day)

Plus the original PR B work: rename + the six base hardening changes + the senior-consultant 9×4 review (which now covers the new bundled directives too).

The senior-consultant review block must be **pre-scheduled** before PR B starts; otherwise PR B blocks on reviewer availability.

1. `git mv mcp-server/src/prompts/diligence-sweep.ts mcp-server/src/prompts/irl-ingestion.ts`.
2. Inside the renamed file: rename `PROMPT_NAME`, bump prompt version to `0.1.0`, update description for scenario-neutrality.
3. Add `mode` and `verbosity` args to `argsSchema`. Default `mode: 'full'`, `verbosity: 'verbose'`.
4. Rewrite the body around the six changes: wrong-IRL detector pre-flight, per-tool inclusion gates as numbered predicates, JSON code fences per section, provenance footer (verbose only), gap list (J), mode-aware execution directives, expanded per-scenario voice cues.
5. `git mv` the test, golden, and body-hash-stability files. Update registry import path. Extend the body-hash-stability scenarios: add `(extract-only, minimal)` and `(extract-only, full-args)` so both mode branches are hash-locked; raises scenario count from 3 to 5. Re-baseline expected hashes.
6. Extend unit tests with mode + inclusion-gate + JSON-fence + shared-import cases.
7. Record both golden snapshots (`irl-ingestion-full.golden.md`, `irl-ingestion-extract-only.golden.md`).
8. Senior-consultant content review (BLOCKING). Address comments; re-record goldens if body changes materially.
9. Update all 15 referencing files per § Critical files. Verify with `grep -rn 'gst_diligence_sweep' mcp-server src` returns zero (excluding archival-footnote contexts in historical docs). Add an `npm run lint:no-old-prompt-names` script that runs the same grep with explicit allow-list of the BL-032.6 historical doc paths; wire it into the existing `npm run lint` aggregate so future drift is caught in CI.
10. Update `BREAKING_CHANGES.md` with PR B's migration entry; update `mcp-server/README.md` prompts table + last-verified stanza. Update `irl-tool-input-mapping.md`'s SOP body-mentions and § "Consumers of this SOP".
11. Update `MCP_SERVER_IRL_GENERATOR_BL-044.md`, `MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md`, and the BL-032.6 archival docs.
12. Bump `mcp-server/package.json` to `0.4.0`. Update the manifest-stability test's expected-hash to the post-rename rendered value. Update the "prompt name@version tuples" enumeration in `BREAKING_CHANGES.md` (currently lists `gst_diligence_sweep@0.0.5`; replace with `gst_irl_ingestion@0.1.0`).
13. Final acceptance pass: `npx astro check`, `npm run lint`, `npm run lint:css`, `npm -w @gst/mcp-server run test`, `npm run test:run`. All pass. Update BACKLOG.md BL-045 stanza Committed → Done.
14. Merge.

---

## Verification

End-to-end smoke checklist for PR B's merge gate:

1. `prompts/list` over the production MCP transport returns `gst_irl_ingestion@0.1.0` with the scenario-neutral description and NOT `gst_diligence_sweep`.
2. `prompts/get gst_irl_ingestion` with full MedSig args + `mode: 'full'` returns a body containing all orchestrated tool names, all six rule constants, and inclusion-gate predicates.
3. `prompts/get gst_irl_ingestion` with `mode: 'extract-only'` returns a body containing JSON fences, provenance directives, gap list — and NO invocation directives.
4. `prompts/get gst_irl_ingestion` with no args returns the interactive body.
5. Both golden snapshots have empty diffs against fresh recordings (model-and-version pinned).
6. The shared-import test passes — `irl-ingestion.ts` imports each of the six constants.
7. Manifest-stability test passes against the new `0.4.0` hash.
8. `grep -rn 'gst_diligence_sweep' mcp-server/src src/docs/development` returns only the archival-footnote contexts in BL-032.6 OpenClaw + Demo Script + BL-036; no live code or current-doc references.
9. Live Claude Desktop session: invoke with the MedSig fixture in `mode: 'extract-only'` — per emitted section, the `json` block validates against the tool's Zod schema OR uses literal `'unknown'` OR omits the field. Re-invoke with `mode: 'full'` — dossier composes cleanly, elided sections explained in (A), gap list (J) populated. Verbosity toggle produces expected output-size difference.

---

## Out of scope (deferred — explicit)

- **xlsx upload as input** — blocked on BL-046 (Claude Desktop file delivery). When BL-046 ships, `argsSchema` extends additively with `filledIrlXlsxBase64?: string` parsed via the BL-044 generator's read-back path.
- **Field-level validation against tool Zod schemas inside the prompt** — the tool's own validation at invocation time is the right surface.
- **Multi-version IRL ingestion** — the prompt assumes the v1 article structure. Major article restructurings get a prompt major bump, not a multi-version parser.
- **DOCX / PDF input variants** — markdown is the IRL's canonical form.
- **A Hub-page surface** — no `/hub/tools/irl-ingestion/` page. The deliverable is a Claude-Desktop-facing prompt.
- **Per-tool telemetry on extraction quality** — provenance footer is the partner's audit trail; structural telemetry waits for BL-032.75 observability scope.
- **Auto-registration of new tools into the inclusion-gate list** — adding a Hub tool to the prompt is a deliberate edit with senior-consultant review.
- **A "diff this engagement's IRL against canonical" mode** — interesting future feature, not v1.
- **Backward-compat alias `gst_diligence_sweep` → `gst_irl_ingestion`** — explicitly rejected; the rename's purpose is removing the old framing. External pins fail loudly via `prompts/get` "not found", which is the correct signal to migrate. Operator may revisit if a real external client surfaces post-deploy (a ~10-LOC `_registry.ts` hotfix).
- **Frozen historical chat transcripts** — existing engagements have `gst_diligence_sweep` references saved in Claude Desktop conversations. Those are immutable artifacts; the rename only affects new invocations. No migration touches them.

---

## Extensibility flags

- New scenario value in `transactionContext` (e.g., `'restructuring'`, `'pre-LOI'`) → add to the enum, author a voice cue, senior-consultant review. Patch or minor depending on scope.
- New Hub tool (BL-04N) → add inclusion gate + section letter, update constants if new rule text needed, senior review, minor bump.
- New SOP rule (BL-044.5 subtractive-filtering or otherwise) → add constant to `extraction-rules.ts`, both prompts (intake-style + ingestion) gain it via import. Today there's only one consumer (ingestion); if a sibling prompt ships later, the shared module is the join point.
- xlsx upload (post-BL-046) → additive `filledIrlXlsxBase64?` arg; parser reads back through the generator's existing test path; minor bump.

---

## Open items

The following items are **explicit gates** for the Candidate → Committed promotion. None are speculative.

- **PR A merges first** — `extraction-rules.ts` must exist before PR B's body can import constants.
- **Senior-consultant content review** of the new body, inclusion gates, voice cues, and wrong-IRL detector — BLOCKING for PR B merge.
- **Inclusion-gate calibration evidence** — the per-scenario tool-weight notes in § Tool inclusion gates reflect operator judgment; if any gate produces a counter-intuitive elision in the senior-consultant review or in a real engagement, recalibrate before PR B merges.
<!-- Compat-alias decision moved to § Decisions row 1 (it's a closed decision, not an open gate). -->
- **Body-token-bloat benchmark** — § Risks "Rewritten body grows past attention-effective length" mitigation calls for benchmarking rendered token count before/after. Add to PR B verification as an explicit go/no-go: if full-mode body exceeds 5000 rendered tokens, restructure (gate-evaluation logic moves to an embedded Resource) before merging.

If any open item changes the design materially, update this doc in the same PR that addresses it.

---

**Last Updated**: 2026-06-01 (rewrite + post-audit revision)
````
