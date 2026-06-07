# MCP Server — `gst_irl_ingestion` workflow simplification (BL-086)

> **Backlog initiative**: BL-086 — delete the `BL-045-VERIFY` block + unregister `validate_irl_provenance` as a workflow tool + cut all prose conditionals + strip the worked-example megapayloads from the `gst_irl_ingestion` prompt body. Aggressive simplification: remove every surface no operator actually consumes, force tool input discipline through error messages instead of pre-emptive 250-line prose.
>
> **Companion docs**:
>
> - [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) — original `gst_irl_ingestion` design. BL-086 preserves the **deliverable** (partner-readable dossier with meta + (J) + (K)) and removes the audit-narration layer that operators don't read.
> - [MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md](MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md) — BL-079 Part B substrate stays (the `_registry.ts` wrapper sync-awaits `handlePrepareIrlBodyTool`); the prose around it goes away.
> - [MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md](MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md) — body-by-hash substrate unchanged; the prompt narration around it removed.
> - [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) — semver log. BL-086 is a server **minor** bump (0.31.0 → 0.32.0): prompt body rewrite + `validate_irl_provenance` unregistered + `compose_dossier_envelope` schema simplifications + manifest hash drift + all body hashes rebaseline.
>
> **Predecessors the audit work-product changes** (substrate kept verbatim, prose discipline cut wholesale): BL-045, BL-049, BL-051, BL-058, BL-061, BL-062, BL-063, BL-070, BL-071, BL-072, BL-073, BL-076, BL-077a/b/c, BL-079 Part A + Part B, BL-082.
>
> **Reservations after this**: BL-087 reserved for any post-merge follow-on after one operator-verification window. Not pre-scoped.
>
> **Scope** (audit-revised; one sentence): delete the `BL-045-VERIFY` block entirely, unregister `validate_irl_provenance` from the workflow surface, cut every prose conditional and worked-example megapayload from the prompt body, delete the `hashBindResult` field as redundant with `irlSource`, and rely on tool error messages (not pre-emptive prose) to discipline tool-input shape.
>
> **Status**: ✏️ **Draft — audit-passed, Path A approved 2026-06-07.**
>
> Drafted after the 2026-06-07 evening exercise sequence, then audit-revised to Path A after impartial Plan-agent review pushed harder than the original draft:
>
> 1. Operator merged BL-079 Part A (PR #252) + Part B (PR #254). Staging deployed 0.31.0.
> 2. Interactive-mode test against 77KB StoreForce IRL: clean run (33/33 verified, `precheck.outcome: converged` in 1 iteration, all counters balanced). Workflow runs.
> 3. Partner-paste path on Claude Desktop v4.7+: model **refused** the workflow citing jailbreak-pattern similarity. On a narrow operator ask, it called `prepare_irl_body` once and wrote a strong diligence synthesis with NO audit machinery firing.
> 4. Plan-agent audit: pushed for more aggressive cuts than the initial draft (server-render → delete entirely; keep-as-debug → unregister; cut audit-narration → cut worked examples too). All folded in.

---

## Audit findings folded in

| Original draft (moderate)                                                            | Audit revision (Path A)                       | Reason                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-render `BL-045-VERIFY` from server facts + model-narrated `verifyBlockInputs` | **Delete the block entirely**                 | No parser outside `mcp-server` consumes it. Structured tool output (`provenanceVerification`, `serverToolCallCounts`, `serverCachedBodyBytes`) already carries every Class A fact. (J)+(K) cover human audit. The YAML fence's only real reader is the doc operator. |
| Keep `validate_irl_provenance` registered as "debug tool"                            | **Unregister from the workflow**              | No operator runbook calls it manually. The "keep for debug" framing is the same sentimentality that produced the prose accretion. Engine + internal compose call stay; tool registration goes.                                                                       |
| Trim audit-narration prose; leave worked-example megapayloads intact                 | **Cut the worked examples too**               | v4.7+ refusal was pattern-match on cumulative prose volume; audit-narration is the smaller fraction. The Step 1 / Step 4a / Step 6a worked examples (~300 lines combined) are the bigger jailbreak-pattern surface. Discipline moves to tool error messages.         |
| Server-derive `hashBindResult` from "did I render a body-binding directive?"         | **Delete the field; folded into `irlSource`** | `partner-paste-verbatim*` → pass-bound; reconstruction modes → pass-internal; mismatch → thrown error. Field encodes zero information not in `irlSource`.                                                                                                            |
| `~40%` body shrinkage claim                                                          | **~50%+ achievable under Path A**             | Rhetorical at 40% as drafted (real measurement: ~25-30% rendered body, ~16% module). 40% requires audit-narration + worked-examples cuts together.                                                                                                                   |
| Single PR, 1–1.5 days                                                                | **Single PR, 2–3 days**                       | Larger blast radius. Tool registration removal touches schemas + tests + types. Worked-example removal needs verification that tool error messages are sufficient discipline.                                                                                        |

---

## At a glance

```
                            BEFORE (today, v0.31.0)
                            ──────────────────────

  irl-ingestion.ts ~1,080 lines:
    ~30% workflow narrative
    ~30% extraction-discipline prose + worked-example megapayloads
         (Step 1 dimension audit, Step 4a TechPar audit, Step 6a MTTR-source audit)
    ~20% prose conditionals + BL-* citations
    ~15% BL-045-VERIFY schema documentation + reporting discipline rules
    ~5%  inclusion-gate + envelope-precheck directives

  Tool surface:
    compose_dossier_envelope, prepare_irl_body, validate_irl_provenance,
    generate_diligence_agenda, compute_techpar, estimate_tech_debt_cost,
    assess_infrastructure_cost_governance, search_portfolio, search_radar,
    list_portfolio_facets, list_regulation_facets, search_regulations
    (12 tools)

  Model behavior:
    - Parses ~30KB of prose to decide branch + author YAML attesting facts
    - v4.7+ refuses on jailbreak-pattern match


                            AFTER (BL-086, v0.32.0)
                            ──────────────────────

  irl-ingestion.ts target ~500-550 lines (~50% reduction):
    ~60% workflow narrative (read IRL, run tools, write dossier)
    ~30% tool-input description (tier discipline as one paragraph,
         not 5 pages of worked examples)
    ~10% mode-specific opener (one-shot vs interactive)

  Tool surface:
    compose_dossier_envelope, prepare_irl_body,
    generate_diligence_agenda, compute_techpar, estimate_tech_debt_cost,
    assess_infrastructure_cost_governance, search_portfolio, search_radar,
    list_portfolio_facets, list_regulation_facets, search_regulations
    (11 tools — validate_irl_provenance unregistered)

  Removed surfaces:
    - BL-045-VERIFY block (model no longer authors it; structured tool
      output is the audit surface)
    - hashBindResult field (folded into irlSource)
    - validate_irl_provenance tool registration (engine kept for compose internal use)
    - ENVELOPE_PRECHECK_DIRECTIVE (precheck loop removed)
    - BL_045_VERIFY_DIRECTIVE (95 lines)
    - Step 1 worked-example payload (~100 lines)
    - Step 4a worked-example payload (~80 lines)
    - Step 6a worked-example payloads (~50 lines)
    - All prose conditionals + BL-* runtime vocabulary

  Model behavior:
    - Reads one coherent workflow
    - Calls tools; first call may arg-shape-reject; reads error; retries
      (existing recovery pattern, already exercised in tonight's runs)
    - Writes dossier with meta + (A-I) + (J) + (K). No YAML attestation.
```

---

## Why this exists

### Empirical motivation

**Observation A** (2026-06-07 night): interactive run on 77KB StoreForce IRL produced clean dossier with 33/33 verified, `precheck.outcome: converged` in 1 iteration, every counter balanced, BL-063 partition discipline held. Workflow runs.

**Observation B** (same night): partner-paste path on v4.7+ refused execution, citing pattern-similarity to a jailbreak template. The model called `prepare_irl_body` once on a narrow operator ask, then wrote a manual diligence synthesis that was **structurally better than the audited dossier** (honest MTTR gap with named JQL query, refused to substitute placeholders, no fabricated audit YAML).

**Observation C** (impartial audit): the model-narrated YAML fence has no consumer outside this repo. `validate_irl_provenance` has no operator runbook. The worked examples are pattern-match surface even when locally correct. Aggressive simplification is the responsible read of the empirical signal, not just "clean up the BL-079 prose."

### What goes vs what stays — the bright lines

**Server substrate stays wholesale** — every Cloudflare Worker / Upstash KV path BL-076 / BL-077 / BL-079 shipped continues to work. The substrate produced the clean Observation A run; nothing about it needs to change.

**Server enforcement stays wholesale** — `Bl063PartitionViolationError`, `Bl068MapAbsentFalsePositiveError`, `Bl070VerbatimBodyRequiredError`, `IrlBodyHashMismatchError`, `Bl076BodyCacheMissError`, the reconstruction auto-append (BL-072), the alias matching (BL-073) — all at the compose schema seam, all preserved verbatim.

**What goes**: the model-facing surfaces that exist purely to satisfy the audit discipline loop. The VERIFY block (no external consumer). The validate tool (no manual caller). The worked examples (replaced by tool error messages, which already exist).

---

## Architecture — Path A

### 1. Delete `BL-045-VERIFY` block entirely

**Remove** from `irl-ingestion.ts`:

- `BL_045_VERIFY_DIRECTIVE` constant (~95 lines, lines 481-578)
- Every reference to the directive in `buildOneShotBody`, `buildExtractOnlyBody`, `INTERACTIVE_BODY`
- The 30+ lines of VERIFY-block reporting discipline prose in `INTERACTIVE_BODY` (precheck derivation identities, fingerprint discipline, compaction asymmetry, partition rules — all of it)

**Operator audit surface** post-BL-086:

- The structured tool output from `compose_dossier_envelope` (read via MCP protocol or via Claude Desktop's tool-result view) carries every Class A fact
- The (J) gap list carries operator-readable provenance gaps + tier mismatches + tier fabrications + reconstruction auto-appends + Hub-backing gaps
- The (K) provenance footer carries every load-bearing claim → IRL anchor
- The dossier is the artifact. The audit fence is gone.

### 2. Unregister `validate_irl_provenance` from the workflow

**In `mcp-server/src/prompts/_registry.ts`**: nothing changes (registry is for prompts, not tools).

**In `mcp-server/src/server.ts`**: remove the `registerValidateIrlProvenanceTool(server, metrics)` call. The tool stops being part of the registered surface.

**Keep**:

- `mcp-server/src/schemas/validate-irl-provenance.ts` — `runIrlProvenanceCheck` engine + `ValidateIrlProvenanceInputObject` + `RunIrlProvenanceCheckInput` + `RunIrlProvenanceCheckInput` are still imported by `compose-dossier-envelope.ts` for internal verification. Engine stays.
- `mcp-server/src/tools/validate-irl-provenance.ts` — `handleValidateIrlProvenanceTool` stays as exported function. Used by BL-071 integration tests. Just not registered with `server.registerTool`.

**In `mcp-server/src/prompts/irl-ingestion.ts`**: remove `validate_irl_provenance` from `ORCHESTRATED_TOOLS` (currently it's not there — it's used by the precheck loop directive, which goes away). Remove `ENVELOPE_PRECHECK_DIRECTIVE` constant entirely.

**Net**: one fewer registered tool. BL-079 Part A's schema becomes dead API on the public surface; the engine path stays alive via compose's internal call.

### 3. Cut the worked-example megapayloads

**Replace** Step 1 worked-example JSON payload (lines 537-580, ~80 lines of dimension-by-dimension `_audit` walkthrough) with a one-paragraph description:

> Call `generate_diligence_agenda` with the 13 dimensions extracted from the IRL plus an `_audit` sibling carrying per-dimension `{tier, citation}` plus dimension-specific calibration. The tool will reject calls that violate BL-045 calibration rules (currency basis, headcount scope, dataSensitivity bucket compatibility, growthStage velocity evidence) with a structured error citing the rule — read the error and retry with the corrected payload.

**Replace** Step 4a TechPar worked-example payload (~80 lines) with:

> Call `compute_techpar` with monetary inputs in a single declared currency basis (USD canonical) plus the `_audit` sibling declaring `monetaryBasis` + per-field `annualizationSource` (with `ytdMonths` when YTD-annualized; cross-validate against the IRL recurring-revenue anchor). The tool rejects YTD-annualized fields without `ytdMonths` with a structured error.

**Replace** Step 6a Tech Debt worked-example payloads (~50 lines) with:

> Call `estimate_tech_debt_cost` with `_audit.mttrSource` + `_audit.incidentsSource` declaring how the IRL evidences each field (`irl-stated`, `irl-open`, `irl-absent`, `irl-scope-mismatch`). When source is `irl-open` / `irl-absent` / `irl-scope-mismatch`, pass `null` for the value — the tool rejects placeholders and elides the line item from carrying-cost computation. Read the error if rejected.

**Net**: ~210 lines of pattern-match-shaped worked examples become ~15 lines of workflow narration. The discipline lives in the tool's structured error messages (which already exist; this is documented behavior at `compose-dossier-envelope.ts:Bl063PartitionViolationError`, `prepare-irl-body.ts:IrlBodyCacheSizeExceededError`, etc.). Operators see one self-correction call on first run in a session; cost is one retry, not the avoidance of it.

### 4. Delete `hashBindResult` field

In `compose_dossier_envelope` output schema, remove `hashBindResult`. The information collapses cleanly:

- `irlSource: partner-paste-verbatim` → bound (BL-079 Part B prepop substrate guarantees server rendered the directive)
- `irlSource: partner-paste-verbatim-prepop` → bound (same)
- `irlSource: model-reconstruction-from-xlsx` → internal
- `irlSource: model-reconstruction-trimmed` → internal
- Hash mismatch → `IrlBodyHashMismatchError` (already thrown)

Operators can read provenance grade off `irlSource` directly. No field deletion needed in the schema if no caller reads it — but cleaner to remove (deferred to BL-087 if it's a backwards-compat concern; in-scope for BL-086 if not).

**Decision** (lean-in): remove from the result type. Net: zero external consumers, smaller schema.

### 5. Builder-level mode selection (no prose conditionals)

`buildOneShotBody`: emits workflow that says "the IRL body cache is populated; pass the body-binding hash to compose; set `irlSource: partner-paste-verbatim-prepop`." Period. No "if directive appears... otherwise legacy..." prose. The builder ONLY runs in one-shot mode where the directive WILL be in the body.

`INTERACTIVE_BODY`: emits workflow that says "ask user to paste; when pasted, call `prepare_irl_body` to seed the cache; pass the returned hash to compose; set `irlSource: model-reconstruction-from-xlsx` or `model-reconstruction-trimmed` per how you assembled the bytes." Period. No mention of the prepop path (it doesn't apply).

`buildExtractOnlyBody`: emits the JSON-payload extraction workflow. No envelope call, no VERIFY block reference (already true; just confirm it stays clean).

**No `BL-*` runtime vocabulary in any rendered body.**

---

## Schema changes

### `compose_dossier_envelope` — input

**Unchanged** except: confirm no field references VERIFY-block authoring. The `requireVerbatimBody` gate stays (BL-070, server-enforced). The `irlSource` enum stays (BL-079 Part B). The `claims` / `gaps` arrays stay.

### `compose_dossier_envelope` — output

**Remove** from `ComposeDossierEnvelopeResult`:

- `hashBindResult` field (if it exists in the result type — verify; it lives in `firstEnvelopeCall.hashBindResult` of the VERIFY block, which is going away)

**Keep**:

- `metaFenceMarkdown`, `gapListMarkdown`, `provenanceFooterMarkdown` (the dossier deliverable)
- `provenanceVerification` (used by Claude Desktop tool-result view + operators)
- `serverToolCallCounts` (operator-readable in structured output)
- `serverCachedBodyBytes` (kept; BL-079 Part B shipped this 24 hours ago, no churn-for-churn)
- `emitInstructions` (the existing model-facing transcription guidance; simplify to remove VERIFY block reference)

**No new fields**. The BL-086 simplification is removal, not addition.

### `validate_irl_provenance` — tool registration

**Removed** from `server.ts` registration list. Schema file stays (engine is reused). Handler export stays (tests use it).

### `irl-ingestion.ts` `version`

`0.18.0` → `0.19.0`.

### Manifest hash + body hash drift

**Manifest hash drifts** (one fewer registered tool = one tuple removed from manifest input). `gst_irl_ingestion` prompt name@version tuple updates.

**ALL 7 body hashes drift** — every mode loses the VERIFY directive + every mode that had a worked example loses the worked example.

---

## Capability-preservation matrix (Path A)

| Capability                                          | BL-086 mechanism                                                                                                                                                                                                              | Verdict                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Partner-readable dossier** (meta + A-I + J + K)   | Unchanged — compose returns same three markdown blocks                                                                                                                                                                        | **Preserved**                                    |
| **Operator audit artifact**                         | Was: BL-045-VERIFY YAML fence. Now: structured tool output (`provenanceVerification`, `serverToolCallCounts`, `serverCachedBodyBytes`) + (J) + (K)                                                                            | **Different surface, equivalent operator value** |
| **BL-049 hash-bind authority**                      | Server-enforced via `IrlBodyHashMismatchError`. Result reported via `irlSource` enum. `hashBindResult` field deleted as redundant                                                                                             | **Preserved + simplified**                       |
| **BL-051 citation iteration**                       | Compose's internal `runIrlProvenanceCheck` runs the same engine; auto-appends provenance-gap to (J). Precheck loop removed; expect (J) to grow by N tier-mismatch entries instead of being pre-suppressed by N validate calls | **Substrate preserved; UX shifts**               |
| **BL-058 VERIFY schema expansion**                  | Removed (block deleted)                                                                                                                                                                                                       | **Cut**                                          |
| **BL-061 compaction asymmetry**                     | Removed (was a VERIFY-block reporting discipline)                                                                                                                                                                             | **Cut**                                          |
| **BL-062 / BL-063 partition + scope + Hub-backing** | Server-enforced at compose seam                                                                                                                                                                                               | **Preserved verbatim**                           |
| **BL-070 `requireVerbatimBody`**                    | Server-enforced at compose seam                                                                                                                                                                                               | **Preserved verbatim**                           |
| **BL-071 server-arithmetic counters**               | Snapshot returned in `serverToolCallCounts`; operators read it from structured output                                                                                                                                         | **Preserved verbatim**                           |
| **BL-072 reconstruction auto-append**               | Server-enforced at compose seam, surfaces in (J)                                                                                                                                                                              | **Preserved verbatim**                           |
| **BL-073 regulatory aliases**                       | Server-side; unchanged                                                                                                                                                                                                        | **Preserved verbatim**                           |
| **BL-076 body-by-hash on compose**                  | Substrate unchanged. Prose narration removed                                                                                                                                                                                  | **Preserved + simplified**                       |
| **BL-077a/b/c cache substrate**                     | Unchanged                                                                                                                                                                                                                     | **Preserved verbatim**                           |
| **BL-079 Part A body-by-hash on validate**          | Schema + engine stay (reused by compose internally). Tool unregistered. Schema becomes dead public API; engine path lives                                                                                                     | **Substrate preserved; tool surface cut**        |
| **BL-079 Part B prompt-render cache pre-pop**       | Wrapper unchanged. Prompt narration removed                                                                                                                                                                                   | **Preserved + simplified**                       |
| **BL-082 wire-shape adapters**                      | Required for slash-command-form interop; unchanged                                                                                                                                                                            | **Preserved verbatim**                           |

**Net**: every server substrate and every server-enforced gate stays. The cuts are: VERIFY block (no consumer), validate tool registration (no caller), worked examples (replaced by tool error messages already in place).

---

## Acceptance criteria (in-session)

1. **TypeScript clean** + **all existing tests pass** post-removal. Note: tests that asserted on VERIFY-block presence in rendered body get **deleted** (not updated), since the block is gone.
2. **`mcp-server/src/server.ts`** no longer registers `validate_irl_provenance`. Add explicit comment noting the tool is intentionally unregistered per BL-086.
3. **Manifest stability test** rebaselines (one fewer tuple in the hash input).
4. **Prompt body substring assertions** at `tests/unit/prompts/irl-ingestion.test.ts`:
   - Rendered one-shot body does NOT contain: `'BL-045-VERIFY'`, `'BL-076'`, `'BL-079'`, `'pass-bound'`, `'pass-internal'`, `'precheck.iterations'`, `'validate_irl_provenance'`
   - Rendered interactive body satisfies same negative assertions
   - Rendered body contains the workflow narrative substrings: `'gst_information_request_list'`, `'compose_dossier_envelope'`, `'prepare_irl_body'`
   - Module total line count is between 500 and 600 (lock the shrinkage at the structural level)
5. **`tests/integration/bl-079-validate-body-by-hash.test.ts`** stays green — engine is still reachable via direct handler call. The test no longer reflects production reachability (tool is unregistered) but the engine contract holds.
6. **BL-071 integration test** stays green — counters are emitted whether or not validate is workflow-registered; the test wraps the handler directly.
7. **Manifest + body hash rebaselines** — promptVersion `0.18.0` → `0.19.0`; ALL 7 body hashes drift; manifest hash drifts (one tool removed).
8. **Operator-facing surface check**: `BREAKING_CHANGES.md` 0.32.0 stanza prominently flags: VERIFY block removed (no external consumer found; audit data is in structured tool output + (J)+(K)); `validate_irl_provenance` unregistered (engine retained for internal compose use; schema becomes dead API).

---

## Risks

- **R-1 — Tool error-driven discipline regression**. Removing the Step 1/4a/6a worked examples bets that tool error messages are sufficient to discipline first-call shape. If a tool error message is ambiguous (e.g., the `generate_diligence_agenda` rejection doesn't make clear which calibration rule fired), model may loop on retries. **Mitigation**: in the same PR, audit `Bl063*Error`, `IrlBodyHashMismatchError`, `Bl070VerbatimBodyRequiredError`, `Bl076BodyCacheMissError`, and the `generate_diligence_agenda` / `compute_techpar` / `estimate_tech_debt_cost` validation errors for actionability — confirm each says "the rule you violated is X; the fix is Y." Already true for the BL-\* error classes; verify for the per-tool calibration errors.
- **R-2 — (J) gap list growth**. Without precheck loop, every tier-mismatch / tier-fabrication that today gets pre-suppressed by validate iteration now flows to (J) auto-append. Operators reading the first dossier post-merge may see noticeably more (J) entries. **Mitigation**: this is the honest output of the prior process (compose internal verification ran the same engine; precheck was just a pre-filter). Document in `BREAKING_CHANGES.md` so operators don't read growth as regression.
- **R-3 — Operator habituated to the VERIFY block**. The block's only consumer was the doc-doing operator (you). Removing it removes a familiar artifact. **Mitigation**: this is the explicit Path A decision; the structured tool output + (J) + (K) cover every operator-readable fact. If post-merge you find you actually want it back in some form, BL-087 reservation is the slot.
- **R-4 — `validate_irl_provenance` unregistration breaks future internal use**. Engine is preserved; only the registration goes. Any future code that wants to call it via MCP protocol would need to re-register. **Mitigation**: re-registration is a one-line change; not a real risk.
- **R-5 — Body hash rebaseline scale**. ALL 7 bodies drift, plus manifest. Standard pattern; surface new hashes in failing test diff and paste in.

---

## Ship cadence

**Single PR**. The cuts are coupled — half-implemented state would leave the prompt body referencing surfaces that no longer exist.

Version: mcp-server `0.31.0` → `0.32.0` (minor — substantive surface reduction + simplification; no breaking public-API removal beyond `validate_irl_provenance` tool unregistration which has no documented callers).

Implementation order:

1. Delete `BL_045_VERIFY_DIRECTIVE` constant entirely.
2. Delete `ENVELOPE_PRECHECK_DIRECTIVE` constant entirely.
3. Rewrite `ENVELOPE_COMPOSITION_DIRECTIVE` to be ~30 lines (was ~80) describing the unconditional one-shot path. Remove all "if/then" prose. Remove all `BL-*` citations.
4. Rewrite Step 1 / Step 4a / Step 6a / Step 6a sections to be ~5 lines each (was ~80-100 lines each). Tool-error-driven discipline narrative.
5. Rewrite `INTERACTIVE_BODY` to match: unconditional interactive path, no VERIFY block reference, no precheck directive reference.
6. Rewrite `buildExtractOnlyBody` to remove VERIFY-block reference (otherwise stays as-is — extract-only is a different beast).
7. Remove `validate_irl_provenance` from `server.ts` registration. Add comment explaining intentional unregistration per BL-086.
8. Remove `hashBindResult` from compose result type if present (verify).
9. Update `irl-ingestion.ts` `version` 0.18.0 → 0.19.0.
10. Update tests: delete VERIFY-block assertions; add negative assertions per acceptance criteria #4; update version assertion to 0.19.0; rebaseline manifest + 7 body hashes.
11. `BREAKING_CHANGES.md` 0.32.0 stanza with operator-facing flags per acceptance criteria #8.
12. `BACKLOG.md` BL-086 status update (OPEN → IN PROGRESS during impl; CLOSED on merge).

**Estimated effort**: **2–3 days**. Mostly prose deletion + rewrite + rebaselines. The "remove validate_irl_provenance registration" is a 5-line change. The worked-example replacement is the largest delete-and-replace surface; the rewrite is short (one paragraph per tool).

---

## Out of scope

- **Re-introducing the VERIFY block in any form**. If operator post-merge finds it useful, file BL-087.
- **Re-registering `validate_irl_provenance`**. Same — BL-087 reservation if needed.
- **Renaming `BL-045-VERIFY` fence label**. Moot; the fence is gone.
- **Re-architecting the dossier section structure (A-I)**. The renderable artifact stays exactly the same shape.
- **Touching extraction-rule constants** (`UNKNOWN_PROPAGATION_RULE`, `ENG_COST_DEDUP_RULE`, etc.). These are one-line constants imported into Step descriptions; not the worked-example megapayloads. Stay.
- **Touching `WRONG_IRL_DETECTOR_PREFLIGHT` or `INCLUSION_GATES_DIRECTIVE` or `META_JSON_FENCE_DIRECTIVE`**. These are workflow-narrative directives, not audit-narration. Stay.

---

## Open questions

- **OQ-1**: should `Bl076BodyCacheMissError` text be updated to remove the BL-079 reference (currently mentions "BL-079 Part B (v0.31.0+)..." in the error message)? **Lean: yes** — BL-\* runtime vocabulary should disappear from error messages too. Trivial change; bundle in.
- **OQ-2**: should `prepare_irl_body` description be updated to remove BL-076 references? **Lean: yes** — same reason.
- **OQ-3**: should the BREAKING*CHANGES stanza for 0.32.0 itself avoid BL-* runtime vocabulary? **Lean: no** — the changelog IS a version-control artifact; BL-\_ references are appropriate there.

---

## Status sentinel

**Path A approved by operator 2026-06-07.** Ready for implementation as single PR. Estimated 2–3 days. Supersedes the moderate draft of this doc; supersedes BL-079 Part B's prose directive surgery (the BL-079 Part B substrate — registry wrapper, cache prepop, BL-070 dual-accept, `serverCachedBodyBytes` field — all stays; the prompt-body prose around it gets cut).

Implementation can start at operator signal.
