# ADR-0017: Audit levels are a display axis, enforced in the tool response

- **Status**: Accepted (2026-08-13, mcp-server 0.50.0 / prompt 0.23.0)
- **Source initiative**: BL-122 (consumes the `auditLevel` "sugar" reserved under BL-087)

## Context

`gst_irl_ingestion` carried a `verbosity: 'verbose' | 'compact'` argument that conflated three separable concerns on one switch, and got the polarity backwards.

`compact` elided the **correctness** pipeline — the body-binding hash directive, the `validate_irl_provenance` precheck, and the `compose_dossier_envelope` composition directive — because all three sat inside the `isVerbose` branch. Meanwhile the meta JSON fence and the `BL-045-VERIFY` block sat _outside_ it and shipped unconditionally. So `compact` disabled the provenance chain and then demanded an audit report on it, naming fields (`firstEnvelopeCall.irlBodyHash`, `hashBindResult`, `precheck.iterations`) that describe calls the mode had just told the model not to make. The model's only options were to fabricate them or null them out.

The mode was never exercised: no UAT covers it, no production run is recorded with it, and the only tests asserted two string absences. Meanwhile the _default_ (`verbose`) put three operator artifacts into every partner-facing dossier — the meta fence before section (A), the (K) provenance footer, and the run-audit block after it.

Separately, `forceTools` was **inert**. `args.forceTools` was read in exactly one place — a telemetry counter at the prompt-registry seam — and no builder ever interpolated its value into the body. Every `forceTools` mention in the prompt was static prose: the model was told to honour an override it was never shown. Its description also published none of its ten legal values, so a client could not have used it even in principle.

## Decision

**Delete `verbosity` rather than repair `compact`, and replace it with `auditLevel: 'standard' | 'enhanced' | 'debug'` defaulting to `standard`.** The three levels separate display from machinery:

| Level                | (K) footer, per-section fences, self-check | Meta fence | `RUN-AUDIT` block |
| -------------------- | ------------------------------------------ | ---------- | ----------------- |
| `standard` (default) | no                                         | no         | no                |
| `enhanced`           | yes                                        | no         | no                |
| `debug`              | yes                                        | yes        | yes               |

**The envelope chain runs at every level.** It stops being a user-selectable option — that is the defect `compact` shipped with, and no argument value should be able to switch off provenance verification.

**Enforcement lives in the tool response, not in prompt prose.** `compose_dossier_envelope` omits `metaFenceMarkdown` below `debug` and `provenanceFooterMarkdown` below `enhanced`, and `emitInstructions` names only the blocks actually returned.

_Rejected: a prompt-body clause instructing the model not to transcribe them._ This tool exists **because** three body-rewrite rounds against a real client IRL established that the model treats body directives as descriptive context and only tool output as procedure. Suppressing via prose would have staked the primary fix on the one signal already proven to lose.

**Fields are omitted, never set to `undefined`.** `tsconfig` does not enable `exactOptionalPropertyTypes`, so `metaFenceMarkdown?: string` accepts an explicit `undefined` and would type-check. But `structuredContent` is returned **by reference** while the text mirror is built through `JSON.stringify`, which drops undefined-valued keys — the machine channel would carry the key present-but-undefined and the model channel would not carry it at all. Build with a conditional spread.

**The scope rule is stated on the _builder_ axis, not the mode axis.** `build()` dispatches on `filledIrl` **absence first**, before any mode check, so `{ mode: 'extract-only' }` with no body renders the _interactive_ builder while `mode === 'extract-only'`. A mode-phrased rule would leave that case ungated — and the shared test helpers register exactly that shape as this prompt's minimal args.

**`buildExtractOnlyBody` is exempt from the gate entirely.** It emits no partner-facing dossier, its own `mode` description promises "JSON payloads + provenance + a gap list", and downstream automation parses its meta fence first. In a machine-fed artifact the provenance _is_ payload.

**`forceTools` is removed**, along with `embedToolWorkedExamples` and the `force_tools_used` metric event. _Retained deliberately_: `forceToolsApplied` on the envelope input — required, and `[]` from this prompt — so a caller that genuinely does override a gate still has a declared place to record it.

**Renames**: `verbosity` → `auditLevel` on the envelope tool input (sharing one exported enum with the prompt rather than a hand-maintained parallel literal), and the `BL-045-VERIFY` block → `RUN-AUDIT`. Historical ledger entries keep the old label — renaming a dated record falsifies it.

## Consequences

**A `standard` run is a draft.** The client-ready gating checklist in `OPERATOR_RUNBOOK.md` reads the run-audit block, so signoff and client-ready runs invoke `auditLevel: debug`. Both operator runbooks and `uat/SETUP.md` ship that migration with this change. A `standard` dossier is not less _verified_ — verification runs identically at every level — it is less _evidenced_.

**At `standard` and `enhanced` the envelope still receives `auditLevel`, but its only rendering surface is deliberately suppressed.** The field is a server-side run record at those levels, not a display switch — which is why the tool takes a display-level argument whose display may not appear.

**The meta fence has two provenances**: server-rendered wherever an envelope call happens, and model-authored in `extract-only`, which makes no envelope call at all. That is why the model-facing template in the prompt body must be hand-maintained in lockstep with `renderMetaFence` — and while writing this, the two were found already out of step (the renderer emitted `defaultFiredFrameworks`; the template did not, and the key-order test pinned only 12 of the 13 emitted keys). Both closed here.

**This design depends on there being no `outputSchema`.** None is registered anywhere under `mcp-server/src`, so the SDK performs no structured-content validation against a declared shape — which is what makes omitting fields at some levels a free choice rather than a validation failure. If BL-092 (declare `outputSchema` on the tool surface) is ever picked up, that interaction has to be resolved; recorded here so it is found by reading rather than by a red test.

**In-flight clients break.** `auditLevel` is required on the tool input with no alias, so a conversation holding a `0.22.4`-rendered body fails validation against a `0.50.0` server. Re-invoke the prompt. Acceptable at single-operator scale, stated rather than left to be discovered.

**The manifest-hash guard does not cover this.** Input and output _shape_ changes leave the registry hash untouched — it moves only on the prompt `name@version` tuple — so the `BREAKING_CHANGES.md` stanza is the only durable record of the meta-fence key rename.

**Response-size budget**: `tool-response-budget.test.ts` bounds the envelope with a two-sided band whose **floor** (`minEnvelopeBytes`) exists to catch hollowing. Its fixture is pinned to `debug` because a size budget must bound the largest shape. **Do not lower that floor** to accommodate a smaller `standard` response — hollowing the envelope is precisely the mutation the floor exists to catch.

**Cites this decision**: `mcp-server/src/prompts/irl-ingestion.ts` (the three-layer split and the builder-axis scope), `mcp-server/src/schemas/compose-dossier-envelope.ts` (`auditLevelValues` import, conditional spread, `buildEmitInstructions`), `mcp-server/src/docs/prompts/irl-ingestion.md` § Audit levels.
