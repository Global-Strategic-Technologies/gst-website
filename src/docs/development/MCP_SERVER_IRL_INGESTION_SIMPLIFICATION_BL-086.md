# MCP Server — `gst_irl_ingestion` workflow simplification (BL-086)

> **Backlog initiative**: BL-086 — strip prose conditionals and version-history scar tissue from the `gst_irl_ingestion` prompt body; server-render the VERIFY block from facts the server already has; demote `validate_irl_provenance` from a workflow forcing function to a debug tool.
>
> **Companion docs**:
>
> - [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) — original `gst_irl_ingestion` design. BL-086 preserves the deliverable (partner-readable dossier + auditable artifact); replaces the forcing-function discipline with server-rendered telemetry.
> - [MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md](MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md) — the prompt-arg cache pre-pop. BL-086 keeps the substrate and removes the prose conditional that today gates whether the model uses it. The mode is selected at render time; the model gets one body, no branches.
> - [MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md](MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md) — body-by-hash mechanism. Unchanged at the substrate level; the directive prose around it gets cut.
> - [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) — semver log. BL-086 is a server **minor** bump (0.31.0 → 0.32.0): prompt body simplification + new `verifyBlockYaml` field on `compose_dossier_envelope` result + manifest hash drift + all body hashes rebaseline.
>
> **Predecessors that this initiative explicitly closes the prose-bloat tail of**: BL-045 (the original audit discipline that introduced the model-narrated VERIFY block), BL-049 (hash-bind authority — substrate stays, prose simplified), BL-051 (precheck-iteration discipline — directive removed, the tool stays registered), BL-058 (BL-045-VERIFY block schema expansion — server-rendered now), BL-070 (`requireVerbatimBody` gate — kept; prose removed), BL-071 (server-arithmetic counts — the snapshot is the source of truth that powers server-side VERIFY rendering), BL-072 (reconstruction-mode auto-append — kept), BL-073 (regulatory aliases — kept), BL-076 (body-by-hash on compose — substrate kept, prose removed), BL-077a/b/c (cache substrate diagnostics — kept), BL-079 Part A + Part B (body-by-hash on validate + prompt-render cache pre-pop — substrate kept, prose removed), BL-082 (wire-shape adapters — kept).
>
> **Reservations after this**: BL-087 — once VERIFY block is server-rendered for ≥2 weeks with no model self-narration drift signal, deprecate the per-prompt `BL-045-VERIFY` schema fields that are pure transcription and have the model just transcribe the YAML.
>
> **Scope** (one sentence): the prompt body describes ONE coherent workflow per invocation mode with NO `if/then` prose branches and NO `BL-*` version citations; mode selection happens in the builder; VERIFY block emission moves from "model narrates YAML attesting to facts" to "server returns pre-rendered YAML, model transcribes one fence."
>
> **Status**: ✏️ **Draft — awaiting operator approval.**
>
> Drafted 2026-06-07 evening, after the night's exercise sequence:
>
> 1. Operator merged BL-079 Part A (PR #252) + Part B (PR #254). Staging deployed 0.31.0.
> 2. Default interactive-mode test against the 77KB StoreForce IRL produced a clean run: `33/33 verified`, `precheck.outcome: converged` in 1 iteration, `selfCorrectionCalls: 0`, all `serverToolCallCounts` arithmetic balanced, conditional-trigger discipline held.
> 3. Earlier same evening: partner-paste path on Claude Desktop 4.7+ produced a **model refusal** — the elaborate `if BL-079... if BL-076... if you see this directive...` prose hit safety patterns. The model called `prepare_irl_body` once on the operator's direct ask, verified the substrate is real, then wrote a clean diligence synthesis without the audit machinery firing at all.
>
> **The two observations together are the empirical motivation**: the workflow produces real value (interactive run was clean; manual synthesis was clean), AND the accreted prose discipline is now actively in the way (refused execution; v4.7+ jailbreak-pattern match).

---

## At a glance

````
                            BEFORE (today, v0.31.0)
                            ──────────────────────

  Prompt body emits (rough proportions):
    ~30% — workflow narrative (read IRL, run tools, write dossier)
    ~25% — prose conditionals ("if BL-076... if BL-079 Part B...
                                if you see **Body-binding hash:**...
                                interactive / xlsx-reconstruction mode...")
    ~20% — VERIFY block schema documentation
           (every field, every value, every reporting discipline rule)
    ~15% — model-narrated calibration prose
           (BL-071 precheck-derivation identities, BL-058 fingerprint
           rules, BL-061 compaction asymmetry, BL-062/063 partition rules)
    ~10% — extraction discipline + tool input schemas

  Model behavior:
    - Parses ~30KB of prose to decide which branch applies to it
    - Narrates a YAML block attesting to facts the server already has
    - Some model versions (v4.7+) refuse the workflow because the prose
      structurally resembles a jailbreak template


                            AFTER (BL-086, v0.32.0)
                            ──────────────────────

  Prompt body emits (target proportions):
    ~50% — workflow narrative (read IRL, run tools, write dossier)
    ~0%  — prose conditionals
           (mode selection happens in the builder; rendered body
           describes ONE mode, no branches)
    ~5%  — VERIFY block transcription instruction
           ("compose returns `verifyBlockYaml`; paste it into a single
           ```BL-045-VERIFY fence at the end. Do not edit.")
    ~30% — extraction discipline + tool input schemas (unchanged)
    ~15% — model-narrated VERIFY inputs (the interpretive fields:
           conditional-trigger rationale, gate-elision rationale,
           response observation, recovery actions)

  Model behavior:
    - Reads one coherent workflow
    - Calls tools per the workflow
    - Passes the interpretive VERIFY fields to compose alongside claims/gaps
    - Transcribes the returned YAML verbatim into ONE fence
    - No prose branches to parse, no version-history vocabulary
````

---

## Why this exists

### Empirical motivation (2026-06-07 evening — the dual failure mode)

**Observation A**: the interactive/xlsx-reconstruction path on staging produced a healthy run with no operator intervention beyond pasting the IRL. Every audit metric balanced. The workflow runs.

**Observation B**: the partner-paste-prompt-arg path on Claude Desktop with the same model produced a **refusal**, with the model citing pattern-similarity to a jailbreak template: long elaborate script, anticipates resistance, scripts compliance via discipline rules. The model then volunteered a manual diligence synthesis that was **structurally better than the audited dossier**: honest about gaps, no fabricated MTTR, named the JQL query that would unblock the missing input, refused to substitute placeholders.

The cumulative state across BL-045 → BL-079 (≈ 20 PRs) is a prompt body that:

- Carries `BL-076`, `BL-079 Part A`, `BL-079 Part B` as runtime vocabulary the model has to interpret
- Encodes a decision tree in English (`if a **Body-binding hash:** directive appears above, do X; otherwise do Y`) when the server already knows which mode it rendered
- Asks the model to narrate a YAML attestation of facts the server measured directly (`serverToolCallCounts`, `hashBindResult`, `provenanceVerification`)
- Documents discipline rules (BL-058 fingerprint discipline, BL-061 compaction asymmetry, BL-063 partition rules, BL-071 precheck derivation identities) that triple in size with every PR that adds a new field

This isn't ONE bad decision; it's the accumulation of locally-justified ones. Every PR added the prose for a real-at-the-time concern: "model fabricated a tool count → tell it to copy verbatim; emission ceiling → tell it to skip prepare when directive present; new enum value → list it everywhere it appears." Each was right in isolation. The cumulative effect is the surface this PR removes.

### What stays load-bearing (don't cut)

- **`compose_dossier_envelope`** as the final composition step that renders meta + (J) + (K) markdown — the rendered output is the product
- **Internal `runIrlProvenanceCheck`** against load-bearing claims — produces the 33/33 verified figure in tonight's clean run
- **Server-arithmetic counters** (`ToolCallCounters`) — accurate and operationally useful in the dossier
- **`prepare_irl_body` body-by-hash cache** (BL-076 + BL-077c substrate) — works end-to-end, no churn
- **BL-079 Part B prompt-render cache pre-pop** — the wrapper in `_registry.ts` stays; the **prose telling the model about it** goes away (the cache is populated whether the model knows or not)
- **Conditional-trigger discipline** (EU_AI_ACT, NIS2) — produced correct considered/fired/suppressed reasoning in tonight's run
- **BL-063 partition + scope checks** at the `compose_dossier_envelope` schema seam — server-enforced, stays
- **BL-070 `requireVerbatimBody` gate** — server-enforced at the seam, stays
- **Wire-shape adapters** (BL-082) — required for slash-command-form interop, no change

### What gets cut (prose bloat with no runtime value)

- All `BL-*` citations in prompt prose. They're internal version-control identifiers; they don't belong in a model-runtime artifact.
- `ENVELOPE_PRECHECK_DIRECTIVE` (the validate-irl-provenance precheck-loop forcing function). Empirically the envelope's internal verification catches the same things; tonight's clean run did 1 precheck iteration (the minimum) and converged. The tool stays registered for debug/manual use; the workflow stops mandating it.
- The "if you see `**Body-binding hash:**` directive... otherwise..." conditional in `ENVELOPE_COMPOSITION_DIRECTIVE` and interactive Step 4. The server knows which mode it's rendering; emit one branch per rendered body.
- The 30+ lines of `BL-045-VERIFY` schema documentation in the prompt body. The server renders the block from facts it already has; the model transcribes one fence.
- The precheck-derivation identity prose (`precheck.iterations === serverToolCallCounts.validate_irl_provenance.succeeded`). Server enforces by construction now.
- The compaction-event asymmetry prose (`<int> | null` over `0`-by-default discipline). The block is server-rendered; this concern collapses.

---

## Architecture

### Principle 1 — mode selection happens in the builder, not in the prompt

The prompt body already has three builders (`buildOneShotBody`, `buildInteractiveBody` aka `INTERACTIVE_BODY` const, `buildExtractOnlyBody`). What leaks today: each builder embeds prose that branches on conditions the builder ALREADY decided. Eliminate the leak.

**Today's leak (`buildOneShotBody`)**:

```
"BL-079 Part B (v0.31.0+): if a `**Body-binding hash:**` directive appears
in this prompt body above... SKIP `prepare_irl_body`... Interactive /
xlsx-reconstruction mode (no directive present): proceed with the legacy
BL-076 path below."
```

**BL-086 (`buildOneShotBody`)**:

```
"The IRL body cache has been populated for you from the prompt arg.
Pass the `**Body-binding hash:**` value above as `irlBodyHash` to
`compose_dossier_envelope`. Set `irlSource: partner-paste-verbatim-prepop`."
```

That's it. No "if/then." The directive is unconditional because the builder only emits this body when the cache HAS been populated. The interactive builder emits the legacy "call `prepare_irl_body` first" instruction unconditionally, because the cache hasn't been populated yet.

Same pattern applied to every conditional in the prompt body.

### Principle 2 — VERIFY block is server-rendered

The VERIFY block has two classes of fields:

**Class A — server-derivable** (server has the data directly):

- `runScenario` — derivable from `irlSource`
- `filledIrl.bytes` — = `serverCachedBodyBytes` (already added in BL-079 Part B)
- `filledIrl.source` — = `irlSource` (model passes in)
- `filledIrl.fingerprint.headChars` / `tailChars` — server slices the cache-hydrated body
- `firstEnvelopeCall.irlBodyHash` — server has it (it's the input)
- `firstEnvelopeCall.hashBindResult` — derivable from the rendered prompt body's body-binding directive presence (the server knows whether it rendered one)
- `firstEnvelopeCall.provenanceVerification` — server runs `runIrlProvenanceCheck` and emits the figures
- `precheck.iterations` — = `serverToolCallCounts.validate_irl_provenance.succeeded`
- `precheck.attemptsTotal` — = `serverToolCallCounts.validate_irl_provenance.attempted`
- `toolCallCounts` — = `serverToolCallCounts` (verbatim)
- `selfCorrectionCalls` — = `serverToolCallCounts.compose_dossier_envelope.attempted - 1`
- `totalEnvelopeCalls` — = `serverToolCallCounts.compose_dossier_envelope.attempted`

**Class B — model-narrated** (interpretive; server cannot derive):

- `precheck.outcome` — operator verdict (`converged`/`hit-cap`/`never-attempted`/`abandoned-after-error`)
- `precheck.errorsEncountered[].errorClass` + `.recoveryAction` — model knows what it did
- `toolErrors[]` — same; non-precheck failed attempts
- `meaningfulRecallsHaveDifferentInputs` — interpretive
- `conditionalTriggers.considered` / `.fired` / `.suppressedWithRationale` / `.defaultFiredFrameworks` — model's regulatory reasoning
- `gatesElided[]` — model's gate evaluation
- `response.continuations` / `.verifyBlockEmissionPoint` / `.compactionEvents` — host-stream observations the server cannot make

**The schema split** lives in `ComposeDossierEnvelopeInputSchema`: a new optional `verifyBlockInputs` field carries Class B. The server merges Class A + Class B and emits `verifyBlockYaml` as a single string in the result. Model's job becomes:

> 1. Assemble Class B inputs.
> 2. Call `compose_dossier_envelope` with `{ claims, gaps, irlBodyHash, irlSource, requireVerbatimBody, verifyBlockInputs }`.
> 3. Paste `result.metaFenceMarkdown` at top of dossier.
> 4. Paste `result.gapListMarkdown` as section (J).
> 5. Paste `result.provenanceFooterMarkdown` as section (K).
> 6. Paste `result.verifyBlockYaml` inside one final \`\`\`BL-045-VERIFY fence. Do not edit it.

No YAML authoring. No precheck-derivation arithmetic. No "if pass-bound otherwise pass-internal" discipline.

### Principle 3 — `validate_irl_provenance` is a debug tool, not a workflow gate

Today the prompt mandates the precheck loop via `ENVELOPE_PRECHECK_DIRECTIVE`. Empirically:

- The clean xlsx-reconstruction run tonight: 1 precheck iteration, converged immediately. The forcing function added zero value vs. just letting compose run its internal verification.
- The 51KB partner-paste-prepop run earlier: precheck `errored: 1` on `transport-timeout`, abandoned after first attempt. The forcing function made the failure modes louder; didn't catch anything compose's internal verification wouldn't have.

The tool stays registered (Part A body-by-hash schema kept; backward-compat for any operator that wants to manually orchestrate prepare → validate-by-hash). It just stops being a step the prompt requires. Compose's internal `runIrlProvenanceCheck` (same engine) catches the same things and auto-appends `provenance-gap:` entries to (J).

**Net effect**: ~3KB of prompt body removed. Workflow shrinks from 8+ tool steps to 6. Operators with debugging needs can still call validate manually.

---

## Schema changes

### `compose_dossier_envelope` — input

**Add** optional `verifyBlockInputs` carrying the Class B (model-narrated) fields:

```ts
const verifyBlockInputsSchema = z.object({
  precheckOutcome: z
    .enum(['converged', 'hit-cap', 'never-attempted', 'abandoned-after-error'])
    .optional()
    .describe('precheck.outcome — model verdict on the precheck loop'),
  precheckErrorsEncountered: z
    .array(z.object({ errorClass: z.string(), recoveryAction: z.string() }))
    .optional()
    .default([]),
  toolErrors: z
    .array(
      z.object({
        tool: z.string(),
        attemptNumber: z.number().int().positive(),
        errorClass: z.string(),
        recoveryAction: z.string(),
      })
    )
    .optional()
    .default([]),
  meaningfulRecallsHaveDifferentInputs: z.boolean().nullable().optional(),
  conditionalTriggers: z
    .object({
      considered: z.array(z.string()),
      fired: z.array(z.string()),
      suppressedWithRationale: z.array(z.object({ trigger: z.string(), whyNot: z.string() })),
      defaultFiredFrameworks: z.array(z.string()),
    })
    .optional(),
  gatesElided: z
    .array(z.object({ tool: z.string(), rationale: z.string() }))
    .optional()
    .default([]),
  response: z
    .object({
      continuations: z.number().int().nonnegative(),
      verifyBlockEmissionPoint: z.enum(['final-continuation', 'mid-stream']),
      compactionEvents: z.number().int().nonnegative().nullable(),
    })
    .optional(),
});
```

Optional so legacy callers (and tests) continue to validate.

### `compose_dossier_envelope` — output

**Add** `verifyBlockYaml: string` on `ComposeDossierEnvelopeResult`:

````ts
/**
 * BL-086 — server-rendered YAML for the BL-045-VERIFY fence. Built from
 * server-derivable facts (toolCallCounts, irlBodyHash, hashBindResult,
 * provenanceVerification, serverCachedBodyBytes, fingerprint) merged with
 * model-supplied `verifyBlockInputs` (interpretive fields the server cannot
 * derive). Model transcribes this verbatim into a single ```BL-045-VERIFY
 * fence at the end of the dossier — does not edit, does not author any
 * of the YAML itself.
 */
verifyBlockYaml: string;
````

The render is deterministic: same `runScenario` rules + `hashBindResult` rules + arithmetic identities the prompt body documents today, executed by the server instead of the model.

### `irlSource` enum

**Unchanged**. The 5-value enum from BL-079 Part B stays exactly as-is.

### `IrlIngestionPromptArgsSchema`

**Unchanged**. The slash-command UI shape stays the same. This refactor is about prompt body, not args.

### `gst_irl_ingestion` `version`

`0.18.0` → `0.19.0` (minor — substantive prose simplification + new server-rendered field consumed by the model). `lastReviewedAt: 2026-06-07`.

---

## Capability-preservation matrix

| Capability                                                | BL-086 mechanism                                                                                                                                                              | Verdict                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **BL-045** partner-readable dossier with meta + (J) + (K) | Same — compose returns the same three markdown blocks                                                                                                                         | **Preserved verbatim**                                             |
| **BL-045-VERIFY** auditable artifact                      | Server-rendered; model transcribes one fence. Schema unchanged for operator parsers — every field still present                                                               | **Preserved; emission shifts from model to server**                |
| **BL-049** hash-bind authority                            | Substrate unchanged. `hashBindResult` computed server-side from "was a body-binding directive rendered?" — eliminates the model fabricated-`pass-bound` failure mode entirely | **Strengthened**                                                   |
| **BL-051** citation-iteration precheck                    | Tool stays registered; forcing-function directive removed. Compose's internal verification catches the same things via the same engine                                        | **Removed-as-forcing-function; substrate preserved as debug tool** |
| **BL-058** VERIFY schema expansion                        | Every field still present in the server-rendered YAML. Compaction-event asymmetry concerns collapse                                                                           | **Preserved**                                                      |
| **BL-063** partition + scope checks                       | Server-enforced at the compose schema seam; no prompt-prose dependency                                                                                                        | **Preserved verbatim**                                             |
| **BL-070** `requireVerbatimBody` gate                     | Server-enforced at the seam; dual-accept for both partner-paste variants kept                                                                                                 | **Preserved verbatim**                                             |
| **BL-071** server-arithmetic counters                     | The whole snapshot now feeds the server-side VERIFY render. Empirical drift signal (sonnet fabricated a call; opus omitted one) becomes impossible                            | **Strengthened**                                                   |
| **BL-072** reconstruction-mode auto-append                | Server-side; unchanged                                                                                                                                                        | **Preserved verbatim**                                             |
| **BL-073** regulatory aliases                             | Server-side; unchanged                                                                                                                                                        | **Preserved verbatim**                                             |
| **BL-076** body-by-hash on compose                        | Substrate unchanged. Prompt prose removed (the cache is read whether the model has prose about it or not)                                                                     | **Preserved + prose simplified**                                   |
| **BL-077a/b/c** cache substrate diagnostics               | Unchanged                                                                                                                                                                     | **Preserved verbatim**                                             |
| **BL-079 Part A** body-by-hash on validate                | Schema unchanged; tool stays registered. The precheck-loop directive that exercised it most often is removed (operator can still call manually)                               | **Preserved + decoupled from workflow**                            |
| **BL-079 Part B** prompt-render cache pre-pop             | Wrapper unchanged. The prompt body stops narrating it ("the server pre-populated... if you see directive...") because the rendered body simply uses the cache                 | **Preserved + prose simplified**                                   |
| **BL-082** wire-shape adapters                            | Required for slash-command-form interop; unchanged                                                                                                                            | **Preserved verbatim**                                             |

**Net**: every server-side substrate stays. Every operator-observable artifact (meta fence + (J) + (K) + BL-045-VERIFY) stays at byte-equivalent shape. The model's job shrinks; the server's job grows by exactly the deterministic YAML render.

---

## Acceptance criteria (in-session — no live exercise required)

1. **TypeScript clean** + **all existing tests pass** post-schema additions.
2. **New unit tests** at `mcp-server/tests/unit/schemas/compose-dossier-envelope-bl086.test.ts`:
   - `verifyBlockInputs` parses with all fields, parses with none (optional default)
   - `verifyBlockYaml` returned with every Class A field server-derived correctly (assert key strings present + the arithmetic identities)
   - Round-trip: feed a known `verifyBlockInputs` + claims set → assert the YAML output contains the expected lines verbatim
3. **Prompt body substring assertions** at `tests/unit/prompts/irl-ingestion.test.ts`:
   - Rendered one-shot body does NOT contain `'BL-'` followed by 3 digits (negative assertion — no version-history citations)
   - Rendered one-shot body does NOT contain `'if you see'` or `'if a '` followed by `**Body-binding hash:**` (no prose conditionals)
   - Rendered interactive body satisfies the same negative assertions
   - Rendered body DOES contain `'verifyBlockYaml'` substring (model knows where to get the YAML)
4. **Server-render parity test**: build a fixture session (3 validate calls + 1 compose call, mixed outcomes), run the engine, assert the server-rendered VERIFY block YAML matches what a correctly-following model would have authored byte-for-byte (per the schema in BL-058 + BL-071 expansions).
5. **Manifest + body hash rebaselines** — promptVersion `0.18.0` → `0.19.0`; ALL 7 body hashes drift (prose simplification touches every mode).
6. **Backward-compatibility test**: a legacy caller that supplies the existing input shape (without `verifyBlockInputs`) gets back a result that still has the existing 4 markdown blocks; `verifyBlockYaml` field is present but built from server-side facts only (Class B fields default to sensible "model-did-not-supply" YAML markers).

---

## Risks

- **R-1 — Operator-tooling parser regression**. Any external parser that asserts on exact `BL-045-VERIFY` block field ordering or whitespace may break if the server-render differs from the model-authored shape we've seen historically. Mitigation: golden-file the existing field ordering + whitespace from a known-good run; render to match exactly. **No parser tooling exists outside `mcp-server` per the design-doc author's knowledge** — confirm with operator before merging.
- **R-2 — Class B `verifyBlockInputs` field-drift** between what the model is told to supply and what the server expects. Mitigation: Zod schema enforces shape; missing optional fields default to documented "model did not supply" markers in the rendered YAML (e.g., `precheck.outcome: <unspecified>` rather than crashing).
- **R-3 — `validate_irl_provenance` demotion misread by operators** debugging citation issues. Mitigation: explicit mention in `BREAKING_CHANGES.md` that the tool is still registered + still works + is now operator-callable rather than workflow-mandated.
- **R-4 — Body hash rebaseline cascade size**. All 7 bodies drift. Standard rebaseline pattern; surface the new hashes in the failing test diff and paste in. Smaller per-body diff than BL-079 Part B's because the prose is shrinking, not adding enum values.
- **R-5 — Model still tries to author the VERIFY block from habit**. Some model versions may emit their own YAML based on training-data familiarity with the format. Mitigation: prompt body explicitly says "the YAML is in `verifyBlockYaml` — paste it verbatim, do not edit, do not author your own"; substring test asserts that instruction lands in every rendered body.

---

## Ship cadence

**Single PR**. The cuts and the schema additions are coupled: the prompt body assumes the new compose output field; rolling either out alone would leave the workflow in a half-state. Operator can verify by re-running the exact same interactive and partner-paste exercises against staging — expected: same dossier outcomes, simpler emission path, no model refusal on v4.7+ (the prose pattern that triggers safety stops shipping).

Version: mcp-server `0.31.0` → `0.32.0` (minor — additive schema, no public contract removal; prompt body version-bumps as a minor for substantive directive rework).

Implementation order:

1. Define `verifyBlockInputs` schema + `verifyBlockYaml` result field on `ComposeDossierEnvelopeInputSchema` / `Result`. Defaults for missing Class B inputs.
2. Implement `renderVerifyBlockYaml(serverFacts, modelInputs)` pure function in `compose-dossier-envelope.ts`. Build the YAML deterministically. Unit-test against golden output.
3. Wire `verifyBlockYaml` into `runComposeDossierEnvelope` result builder. The function already has `serverCachedBodyBytes`, `serverToolCallCounts`, `provenanceVerification` in scope; merging in `verifyBlockInputs` is a one-liner.
4. Simplify `irl-ingestion.ts` prompt body:
   - Delete `ENVELOPE_PRECHECK_DIRECTIVE` (whole constant).
   - Rewrite `ENVELOPE_COMPOSITION_DIRECTIVE` to be unconditional partner-paste-prepop in `buildOneShotBody` and unconditional legacy-prepare-first in `INTERACTIVE_BODY`.
   - Replace 30+ lines of `BL_045_VERIFY_DIRECTIVE` with ~8 lines of "compose returns `verifyBlockYaml` — paste it verbatim into a single \`\`\`BL-045-VERIFY fence at the end."
   - Delete every `BL-*` citation in prose.
   - Bump `version` 0.18.0 → 0.19.0.
5. Tests: new unit tests per acceptance criteria above. Existing tests get updated assertions where they referenced removed prose.
6. Hash rebaselines (manifest + all 7 body hashes).
7. `BREAKING_CHANGES.md` 0.32.0 stanza.
8. `BACKLOG.md` BL-086 stanza + BL-087 reservation.

**Estimated effort**: 1–1.5 days. Mostly prompt-body prose work + the deterministic YAML render + rebaselines. No new substrate, no new tool, no new wrapper.

---

## Out of scope

- **Removing `prepare_irl_body`** as a registered tool. Kept — used in interactive / xlsx-reconstruction mode where the cache isn't pre-populated.
- **Removing `validate_irl_provenance`** as a registered tool. Kept — debug tool, operator-callable, Part A body-by-hash schema retained.
- **Renaming `BL-045-VERIFY` fence label**. Backward-compat with any external parser. Defer to a future cleanup ticket.
- **Re-architecting the dossier section structure** (A through K). Out of scope — the renderable artifact shape stays exactly the same.
- **Adding new server-arithmetic identities** beyond what BL-071 already established. The render uses the existing identities; doesn't introduce new ones.

---

## Open questions

- **OQ-1**: should `verifyBlockYaml` include a leading `# Auto-generated by compose_dossier_envelope; do not edit` comment so operators reading raw dossiers know provenance at a glance? **Lean: yes.** Cheap to add; informative.
- **OQ-2**: should the server reject a `compose_dossier_envelope` call that omits `verifyBlockInputs` entirely (i.e., enforce the model supplied at least one interpretive field)? **Lean: no** — keep it optional with documented defaults. The dossier still renders cleanly with `<unspecified>` markers; partial-info VERIFY is better than refusal-to-render.
- **OQ-3**: should the `validate_irl_provenance` tool description be updated to flag that it's a debug tool now, not a workflow step? **Lean: yes, one sentence.** Operators searching the tool description should know its role shifted.

---

## Status sentinel

**This doc is draft.** Ship cadence is single-PR per the simplification principle this document is itself trying to embody. Ready for operator approval to start implementation — the design is concrete enough that the code change reads as 1–1.5 days of prose simplification + a deterministic YAML render function + rebaselines.

If approved, implementation ships as a single PR titled `feat(mcp): BL-086 — gst_irl_ingestion workflow simplification (v0.32.0)` superseding the BL-079 Part B prose directive surgery (the substrate it shipped — the registry wrapper, the cache prepop, the BL-070 dual-accept, the `serverCachedBodyBytes` field — all stay; the prompt-body prose around them gets cut).
