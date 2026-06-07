# MCP Server — `gst_irl_ingestion` workflow simplification (BL-086)

> **Backlog initiative**: BL-086 — staged simplification of the `gst_irl_ingestion` prompt body and tool surface, structured as five independently-shippable pruning levels (L0–L5) ordered from least to most aggressive. Each level is a discrete PR. Most levels (L2, L3, L4) are reversible via opt-in prompt arguments, so operators can A/B-test the cut against the restored capability without code changes.
>
> **Companion docs**:
>
> - [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) — original `gst_irl_ingestion` design.
> - [MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md](MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md) — BL-079 Part B substrate stays at every level.
> - [MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md](MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md) — body-by-hash substrate unchanged at every level.
> - [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) — semver log. Each level is a separate minor or patch bump.
>
> **Status**: ✏️ **Draft — leveled design 2026-06-07 evening.** Supersedes the earlier monolithic-Path-A draft after operator feedback that staged ship cadence + opt-in restore args are preferable to a single 2.5–3.5 day all-or-nothing PR.

---

## Why leveled

Tonight's evidence is dual:

- **Observation A** — interactive run on 77KB IRL produced clean dossier (33/33 verified, `precheck.outcome: converged` in 1 iteration). The workflow runs.
- **Observation B** — partner-paste path on Claude Desktop v4.7+ **refused** the workflow citing jailbreak-pattern similarity. Manual synthesis was strong without any audit machinery firing.
- **Observation C** — impartial audit found no external parser consumes the VERIFY block; no operator runbook calls `validate_irl_provenance` manually; worked-example megapayloads are the bulk of prose-bloat surface area.

The first instinct was to ship every cut at once (Path A — 2.5–3.5 days). Better design: stage the cuts. Each level ships independently. Levels that affect operator-observable behavior (L2 worked examples → retry cost; L3 precheck loop → (J) honesty; L4 VERIFY block → audit ergonomics) get **opt-in restore args** so the prior behavior is one prompt-arg flip away. Operators can ship L0 today, observe, ship L1, observe, etc. — never committing to a downstream level until the upstream one is verified.

This trades total ship time (more PRs, more rebaselines) for de-risked operator verification (each level isolates one variable).

---

## Pruning levels — L0 through L5

Ordered from least aggressive (zero behavioral change) to most aggressive (tool unregistration). Each row independently shippable; later levels assume earlier levels merged.

| Level  | Scope                                                                                                                                                                                                                                                                                                                                                          | Behavioral delta                                                                                                                                                                                     | Reversible via arg?                                                                                           | Effort | Version bump            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ | ----------------------- |
| **L0** | Runtime-vocabulary cleanup. Strip `BL-*` references, version pins (`v0.30.0+`), and PR-history mentions from every `.describe()` call, `super(...)` error message, and `TOOL_DESCRIPTION` constant in `mcp-server/src/schemas/*` + `tools/*` + `cache/*`. Internal `instanceof` class names + typed `wrangler tail` metric event names stay.                   | Zero behavioral change. Pure cosmetic in model-runtime artifacts.                                                                                                                                    | N/A (no behavior cut)                                                                                         | ~0.5d  | patch (0.31.0 → 0.31.1) |
| **L1** | Mode-conditional prose removal. Each rendered prompt body describes ONE coherent path. `buildOneShotBody` emits unconditional prepop workflow. `INTERACTIVE_BODY` emits unconditional legacy workflow. No "if `**Body-binding hash:**` appears... otherwise..." prose anywhere. Builder-level mode selection only.                                             | Model gets clearer instructions; expected modest reduction in v4.7+ refusal rate (partial — full reduction depends on L2 + L4). No tool-call-shape change.                                           | N/A (improvement; nothing to restore)                                                                         | ~0.5d  | patch (0.31.1 → 0.31.2) |
| **L2** | Worked-example deletion. Cut Step 1 dimension audit payload (~80 lines), Step 4a TechPar audit payload (~80 lines), Step 6a MTTR-source audit payloads (~50 lines). Replace with one-paragraph workflow descriptions. Discipline shifts to tool error messages (already exist: `Bl063*`, `Bl070*`, `Bl076*`, per-tool calibration rejections).                 | ~1–2 self-correction retries per session on first tool calls (today: 0–1). Latency cost ~10–30s. Final output unchanged after retry.                                                                 | **YES** — `embedToolWorkedExamples: true` arg restores the payloads                                           | ~0.5d  | minor (0.31.2 → 0.32.0) |
| **L3** | Precheck-loop demotion. Delete `ENVELOPE_PRECHECK_DIRECTIVE` constant. `validate_irl_provenance` stays registered but the prompt body no longer mandates calling it before compose. Compose's internal `runIrlProvenanceCheck` runs the same engine on the same body.                                                                                          | (J) gap list may show more entries on first compose call (no pre-filter). Model may make 1 extra compose call to correct. `selfCorrectionCalls` rises 0→1 in some sessions. Dossier prose unchanged. | **YES** — `precheckCitations: true` arg re-emits the precheck directive                                       | ~0.25d | minor (0.32.0 → 0.33.0) |
| **L4** | VERIFY block emission removal. Delete `BL_045_VERIFY_DIRECTIVE` constant + all schema-documentation prose in `INTERACTIVE_BODY`. Delete `hashBindResult` field as redundant with `irlSource`. Operator audit shifts from YAML transcription to structured tool output (`provenanceVerification`, `serverToolCallCounts`, `serverCachedBodyBytes`) + (J) + (K). | Operator loses single-fence YAML audit artifact. Same information density via Claude Desktop tool-result viewer. Dossier sections (A–I) and (J)+(K) unchanged.                                       | **YES** — `emitVerifyBlock: true` arg re-emits the directive                                                  | ~0.5d  | minor (0.33.0 → 0.34.0) |
| **L5** | `validate_irl_provenance` tool unregistration. Remove `registerValidateIrlProvenanceTool(server, metrics)` call in `server.ts`. Engine + handler stay (compose internal use, BL-071 integration test). BL-079 Part A public schema becomes dead API.                                                                                                           | Operators that have memorized the tool stop seeing it in tool-search. Internal compose verification unchanged.                                                                                       | **NO** — code change required to reverse. Less common operator-visible surface; arg restoration not worth it. | ~0.25d | minor (0.34.0 → 0.35.0) |

**Cumulative line-count target** (`irl-ingestion.ts`):

| After level | Line count                        | % reduction vs L0 baseline (~1,080) |
| ----------- | --------------------------------- | ----------------------------------- |
| L0          | ~1,070 (cosmetic only)            | ~1%                                 |
| L1          | ~1,000 (conditionals deleted)     | ~7%                                 |
| L2          | ~790 (worked examples gone)       | ~27%                                |
| L3          | ~760 (precheck directive gone)    | ~30%                                |
| L4          | ~610 (VERIFY directive gone)      | ~43%                                |
| L5          | ~600 (one tool reference deleted) | ~44%                                |

The ~50% claim in earlier drafts is achievable only with L1+L2+L4 together. Each level's contribution is measurable.

---

## Opt-in restore args (the safety net)

Three new prompt-arg fields on `gst_irl_ingestion`'s `argsSchema`. All default `false` (the BL-086 simplification is the default). All are boolean and use `booleanFromWire(z.boolean().optional()).optional()` per the BL-082 wire-shape pattern.

### `embedToolWorkedExamples: boolean` (optional, default false)

Restores the worked-example megapayloads (Step 1 / Step 4a / Step 6a) that L2 removed. When true, the rendered prompt body includes the full JSON payload examples for `generate_diligence_agenda._audit`, `compute_techpar._audit`, and `estimate_tech_debt_cost._audit`. Operators set this when running against an unfamiliar model that has higher arg-shape-rejection rates without the examples in-prompt.

**Implementation**: stash the worked-example string constants behind a feature flag in the builder. The builder concatenates them only when `args.embedToolWorkedExamples` is truthy.

### `precheckCitations: boolean` (optional, default false)

Restores the `ENVELOPE_PRECHECK_DIRECTIVE` that L3 removed. When true, the rendered one-shot body includes the BL-051 forcing-function directive instructing the model to iterate citation correctness on `validate_irl_provenance` before calling `compose_dossier_envelope`. Operators set this for accuracy-critical runs where pre-cleaned citations are preferable to post-compose (J) entries.

**Implementation**: builder includes the directive only when `args.precheckCitations` is truthy. `validate_irl_provenance` must be registered (L5 unregistration is a hard floor — if L5 has shipped, this arg becomes inert with a warning).

### `emitVerifyBlock: boolean` (optional, default false)

Restores the `BL_045_VERIFY_DIRECTIVE` that L4 removed. When true, the rendered body instructs the model to emit a `BL-045-VERIFY` fence at the end of the response. Operators set this when they need the single-fence audit artifact (e.g., for offline downstream parsers, pre-merge regression comparisons, batch audit tooling).

**Implementation**: builder includes the directive only when `args.emitVerifyBlock` is truthy.

### Composite shorthand (consider adding to L4 or as a follow-on)

A single `auditLevel: 'standard' | 'enhanced' | 'debug'` enum could replace the three booleans:

- `standard` (default) — no restore. Plain BL-086 simplified workflow.
- `enhanced` — emits VERIFY block (`emitVerifyBlock: true` equivalent).
- `debug` — emits VERIFY block + restores precheck loop + restores worked examples (all three true).

Cleaner UX (one arg) but reduces flexibility (can't enable just precheck without worked examples). Decision deferred: ship the three booleans first; add the composite as a sugar enum in a follow-on if operators ask for it.

### What stays NOT opt-in

- **L0 vocabulary cleanup** — pure cosmetic; no reason to restore `BL-*` runtime vocabulary
- **L1 mode-conditional prose** — clean improvement; rendering the same body in multiple modes is structurally worse
- **L5 tool unregistration** — reversing requires re-registering in `server.ts` (code change). The opt-in arg pattern doesn't suit "register a tool"

---

## Capability preservation matrix (per level)

Substrate stays at every level. The matrix shows what each level cuts from default behavior and whether it can be restored via arg.

| Capability                                       | L0  | L1  | L2  | L3  | L4  | L5          | Restore arg                                    |
| ------------------------------------------------ | --- | --- | --- | --- | --- | ----------- | ---------------------------------------------- |
| Partner-readable dossier (A–I + J + K)           | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | always present                                 |
| BL-049 hash-bind authority                       | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | server-enforced                                |
| BL-051 citation iteration (precheck)             | ✅  | ✅  | ✅  | ❌  | ❌  | ❌          | `precheckCitations: true`                      |
| BL-058 VERIFY schema (model-narrated)            | ✅  | ✅  | ✅  | ✅  | ❌  | ❌          | `emitVerifyBlock: true`                        |
| BL-063 partition + scope + Hub-backing           | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | server-enforced                                |
| BL-070 `requireVerbatimBody` gate                | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | server-enforced                                |
| BL-071 server-arithmetic counts                  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | always emitted via structured tool output      |
| BL-072 reconstruction auto-append                | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | server-enforced                                |
| BL-073 regulatory aliases                        | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | server-side                                    |
| BL-076 body-by-hash on compose                   | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | substrate                                      |
| BL-077a/b/c cache substrate diagnostics          | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | substrate                                      |
| BL-079 Part A body-by-hash on validate (schema)  | ✅  | ✅  | ✅  | ✅  | ✅  | engine only | tool surface gone at L5; engine reused         |
| BL-079 Part B prompt-render cache pre-pop        | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | substrate                                      |
| BL-082 wire-shape adapters                       | ✅  | ✅  | ✅  | ✅  | ✅  | ✅          | required for opt-in args to work               |
| Worked-example megapayloads (Step 1/4a/6a)       | ✅  | ✅  | ❌  | ❌  | ❌  | ❌          | `embedToolWorkedExamples: true`                |
| `hashBindResult` field on result                 | ✅  | ✅  | ✅  | ✅  | ❌  | ❌          | not restored — info collapses into `irlSource` |
| `BL-*` runtime vocabulary in tool descriptions   | ✅  | ❌  | ❌  | ❌  | ❌  | ❌          | not restored (L0 cosmetic only)                |
| `validate_irl_provenance` registered as MCP tool | ✅  | ✅  | ✅  | ✅  | ✅  | ❌          | not restored (L5 = code-change to reverse)     |

**Net**: every server-enforced gate and every substrate path stays at every level. The arg-restorable capabilities (precheck, VERIFY block, worked examples) are exactly the surfaces operators might want to A/B-test. The non-restorable cuts (L0 cosmetic, L1 cleaner instructions, L5 tool surface) are the ones with zero operator-observable downside.

---

## Recommended ship cadence

Three honest options:

### Option A — Maximum staging (5 PRs)

L0 → L1 → L2 → L3 → L4 → L5 each as a separate PR. Each merged + verified before the next opens. Total elapsed time: 1–2 weeks (depends on operator-verification windows between PRs). Total effort: ~2.5–3.5d. Smallest blast radius per PR.

**Use when**: any individual level scares you, or you want clean isolated empirical evidence per level.

### Option B — Pair cosmetic + structural (3 PRs)

- **PR 1** — L0 + L1 bundle. Cosmetic cleanup + mode prose. Zero behavioral change. Ship effort ~1d.
- **PR 2** — L2 + L3 bundle. Worked examples gone + precheck demoted, with both restore args (`embedToolWorkedExamples`, `precheckCitations`). Ship effort ~1d.
- **PR 3** — L4 + L5 bundle. VERIFY block gone + validate tool unregistered, with restore arg (`emitVerifyBlock`). Ship effort ~1d.

**Use when**: you want fewer PRs but still want an operator-verification gate between behavioral classes (no-change → discipline-shift → audit-surface-shift).

### Option C — Single PR (the prior Path A draft)

All levels in one PR. Effort ~2.5–3.5d. Highest blast radius, fastest total ship.

**Use when**: you trust the doc + tests + your own verification, and you'd rather do one rebaseline cascade instead of three.

**Recommended default: Option B.** Three PRs, each ~1 day, clean operator-verification windows between behavioral classes. The L0+L1 bundle is risk-free (cosmetic) and a good warm-up. The L2+L3 bundle exposes the discipline-shift cost (retries, (J) growth) with restore args available. The L4+L5 bundle is the cleanup tail.

---

## Implementation order (per-level breakdown)

### L0 — vocabulary cleanup (cosmetic)

1. `grep -rn "BL-0\|BL-07" mcp-server/src/schemas mcp-server/src/tools mcp-server/src/cache` — enumerate every `BL-*` reference in `.describe()`, error-message strings, tool descriptions.
2. For each site: replace `BL-076 (v0.17.0+): now the SOLE body reference on this tool...` with `The canonical 16-hex hash of the IRL body. Call prepare_irl_body first; it caches the body and returns this hash.` (descriptive, no PR-citation).
3. Tests: substring assertions in `tests/unit/schemas/*` may need updating if they assert on `'BL-076'` text. Update or delete those assertions.
4. `BREAKING_CHANGES.md` patch stanza: 0.31.0 → 0.31.1. Describe as cosmetic; no manifest hash drift; no body hash drift.

### L1 — mode-conditional prose removal

1. In `buildOneShotBody`: replace "if `**Body-binding hash:**` directive appears above..." prose with unconditional "the cache is populated; pass `irlBodyHash: <the directive value>` to compose."
2. In `INTERACTIVE_BODY`: replace "if appears above... otherwise..." prose with unconditional "call `prepare_irl_body` to seed the cache; pass returned hash to compose."
3. `ENVELOPE_COMPOSITION_DIRECTIVE`: strip every "if/then" branch; keep one coherent path.
4. Tests: prompt-body substring assertions — add negative assertions for `'if you see'`, `'otherwise'`, the conditional vocabulary. Body hash rebaseline (3 of 7 — the verbose-mode bodies).
5. `BREAKING_CHANGES.md` patch stanza: 0.31.1 → 0.31.2.

### L2 — worked-example deletion + `embedToolWorkedExamples` arg

1. Move the Step 1 / Step 4a / Step 6a worked-example string blocks into separate exported constants (`STEP_1_WORKED_EXAMPLE`, `STEP_4A_WORKED_EXAMPLE`, `STEP_6A_WORKED_EXAMPLE`) so they survive the cut as static-importable strings.
2. In `buildOneShotBody`: remove the inline worked-example megapayloads. Replace with one-paragraph workflow descriptions per Path A draft.
3. Add to `argsSchema`: `embedToolWorkedExamples: booleanFromWire(z.boolean().optional()).optional().describe('Restore the inline worked-example payloads for generate_diligence_agenda / compute_techpar / estimate_tech_debt_cost. Use for unfamiliar models with high arg-shape-rejection rates without in-prompt examples.')`.
4. In `buildOneShotBody`: conditionally concatenate the constants when `args.embedToolWorkedExamples` is truthy.
5. Tests: substring assertions + body hash rebaseline (all 7 bodies drift — extract-only also references these payloads). Add positive-conditional test: when `args.embedToolWorkedExamples: true`, body contains the worked-example string.
6. `BREAKING_CHANGES.md` minor stanza: 0.31.2 → 0.32.0. promptVersion 0.18.0 → 0.19.0. Manifest hash drift (the new prompt arg becomes part of the manifest input).

### L3 — precheck-loop demotion + `precheckCitations` arg

1. Move `ENVELOPE_PRECHECK_DIRECTIVE` from inline usage to a conditional include.
2. Add to `argsSchema`: `precheckCitations: booleanFromWire(z.boolean().optional()).optional().describe('Restore the BL-051 citation-iteration precheck loop on validate_irl_provenance before calling compose_dossier_envelope. Use for accuracy-critical runs where pre-cleaned citations are preferable to post-compose (J) gap entries.')`.
3. In `buildOneShotBody`: include the directive only when `args.precheckCitations` is truthy.
4. Tests: substring + body hash rebaseline + positive-conditional. promptVersion 0.19.0 → 0.20.0. Manifest hash drift.
5. `BREAKING_CHANGES.md` minor stanza: 0.32.0 → 0.33.0.

### L4 — VERIFY block emission removal + `emitVerifyBlock` arg + `hashBindResult` field deletion

1. Move `BL_045_VERIFY_DIRECTIVE` to a conditional include.
2. Add to `argsSchema`: `emitVerifyBlock: booleanFromWire(z.boolean().optional()).optional().describe('Restore the BL-045-VERIFY YAML fence at the end of the response. Use when downstream batch tooling needs the single-fence audit artifact.')`.
3. In `buildOneShotBody` + `INTERACTIVE_BODY`: include the directive + the schema-discipline prose only when `args.emitVerifyBlock` is truthy.
4. Delete `hashBindResult` from `ComposeDossierEnvelopeResult`. Update any test that reads the field.
5. Tests: substring + body hash rebaseline + positive-conditional. promptVersion 0.20.0 → 0.21.0. Manifest hash drift.
6. `BREAKING_CHANGES.md` minor stanza: 0.33.0 → 0.34.0.

### L5 — `validate_irl_provenance` tool unregistration

1. Remove `registerValidateIrlProvenanceTool(server, metrics)` from `server.ts`. Add explanatory comment.
2. Confirm `runIrlProvenanceCheck` still imported by `compose-dossier-envelope.ts`; engine path intact.
3. `precheckCitations: true` arg becomes a no-op (the directive renders, but the model can't call the tool). Add a runtime warning in the builder: if `precheckCitations: true` AND L5 has shipped, embed a one-line "note: `validate_irl_provenance` is no longer registered; this arg has no effect" in the rendered body.
4. Tests: manifest stability test rebaseline (one fewer tool tuple); remove tool-registration assertion if any.
5. `BREAKING_CHANGES.md` minor stanza: 0.34.0 → 0.35.0.

---

## Acceptance criteria (per level)

Each level's PR must satisfy:

1. **TypeScript clean** + **all existing tests pass** post-change.
2. **Level-specific substring assertions** at `tests/unit/prompts/irl-ingestion.test.ts` (negative for the cut prose; positive for opt-in arg restore where applicable).
3. **Body hash rebaselines** — varies per level (L0: none; L1: 3 of 7; L2-L4: all 7).
4. **Manifest hash rebaseline** — L2/L3/L4 each (new arg added; tuple changes). L5 (one tool removed). L0+L1 no manifest drift.
5. **`BREAKING_CHANGES.md` stanza** — per-level operator-facing description of what changed + what restore arg (if any) is available.
6. **`BACKLOG.md` BL-086 status update** — per level: tick the checkbox.
7. **No new substrate, no new tool, no new wrapper** at any level. Pure prose cuts + arg additions + (L4) one field removal + (L5) one registration removal.

---

## Risks (per level)

- **L0 — Test surface breakage.** Some tests may assert on `'BL-076'` substring text in error messages or descriptions. **Mitigation**: grep for `'BL-0'` in tests; update or delete. Cosmetic.
- **L1 — None substantive.** Builders already select mode; prose change is a no-op for the runtime. Risk: hash rebaseline cascade.
- **L2 — Tool error-driven discipline regression.** Removing worked examples bets that tool error messages are sufficient to discipline first-call shape. **Mitigation**: `embedToolWorkedExamples: true` arg available as immediate restore. Plus: in same PR, audit each per-tool calibration-error message for actionability — confirm each says "rule violated is X; fix is Y." Already true for `Bl063*Error`, `Bl070VerbatimBodyRequiredError`, `Bl076BodyCacheMissError`; verify for `generate_diligence_agenda` / `compute_techpar` / `estimate_tech_debt_cost` validation errors.
- **L3 — (J) gap list growth + `selfCorrectionCalls` rise.** Operators may misread growth as regression. **Mitigation**: `precheckCitations: true` arg available. Document in `BREAKING_CHANGES.md`: "(J) growth is honest reporting of issues that were previously pre-suppressed by validate iteration."
- **L4 — Operator audit ergonomic loss.** Single-fence YAML artifact gone; replaced by structured tool output viewing. **Mitigation**: `emitVerifyBlock: true` arg available. If post-merge you find you actually rely on the fence shape, the arg restores it.
- **L5 — Operator habit / runbook breakage.** Operators that have memorized `validate_irl_provenance` as a tool stop seeing it. **Mitigation**: documented in `BREAKING_CHANGES.md`. Less of a real risk — no operator runbook actually documents calling it manually.
- **Cross-level — Body hash rebaseline fatigue.** Five PRs each potentially rebaselining body hashes. **Mitigation**: this is the cost of staging. The alternative (Option C single PR) rebaselines once; Option A rebaselines five times; Option B rebaselines three times. Operator picks the trade.

---

## Out of scope (all levels)

- **Re-introducing the VERIFY block as a server-rendered artifact** (the moderate-draft proposal). Moot — the restore arg makes the block opt-in model-rendered; no operator value lost.
- **Renaming `BL-045-VERIFY` fence label**. Backward-compat with the restore arg; the fence stays named the same when opted in.
- **Re-architecting the dossier section structure** (A through K). Out of scope.
- **Touching extraction-rule constants** (`UNKNOWN_PROPAGATION_RULE`, `ENG_COST_DEDUP_RULE`, etc.). Stay.
- **Touching `WRONG_IRL_DETECTOR_PREFLIGHT` or `INCLUSION_GATES_DIRECTIVE` or `META_JSON_FENCE_DIRECTIVE`**. These are workflow-narrative; stay at every level.
- **`compose_dossier_envelope` schema or output shape changes** beyond `hashBindResult` deletion at L4. The substrate is the substrate.

---

## Status sentinel

**Draft 2026-06-07 evening.** Supersedes the earlier monolithic-Path-A draft. Awaiting operator approval of:

1. **Ship cadence**: Option A (5 PRs), Option B (3 PRs, recommended), or Option C (1 PR / prior Path A).
2. **Opt-in restore args**: confirm the three booleans (`embedToolWorkedExamples`, `precheckCitations`, `emitVerifyBlock`) are the right shape. Optional `auditLevel` composite enum can be added later.
3. **L5 inclusion** in the BL-086 scope, or defer L5 to a follow-on BL-087 ticket. L5 is the most reversibility-unfriendly cut.

Once approved, implementation can start at the chosen first level (typically L0 + L1 as a warm-up).
