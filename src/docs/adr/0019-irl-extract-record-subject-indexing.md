# ADR-0019: The IRL extract is indexed by SUBJECT, travels in context, and is never retained server-side

- **Status**: Accepted 2026-08-20 (prompt `gst_irl_ingestion` 0.29.0 + six consumer prompts to 0.1.0 / server 0.56.0)
- **Source initiative**: closes BL-127 ("Interactive mode silently ignores `mode: extract-only`"), whose trigger fired on the first operator report of an ignored `extract-only`. No separate initiative doc exists, and deliberately: this ADR is the durable home for the endgame decisions, because the design has no future slices for such a doc to guide (see § Decision 2).

## Context

An operator invoked `gst_irl_ingestion` with `mode: extract-only`, pasted the filled IRL into the **chat** as an attached `.md` rather than into the `filledIrl` prompt argument, then invoked `gst_target_quick_look` against the same target and expected it to reuse what the ingestion pass had extracted. Neither happened, and both failures had the same root.

**Symptom 1 — `extract-only` was unreachable.** `build()` branched on `!args.filledIrl` _before_ it looked at `mode`, so the interactive builder rendered and hard-stamped `effectiveMode: 'full'` plus a disclosure reading _"cannot honor — there is no body to extract from until they paste one."_ True at render time, false one turn later. And because the run-parameters block says _"Copy this value … do not re-derive it"_, the model correctly refused to switch when the body arrived.

**Symptom 2 — nothing downstream could consume the extract.** Extract-only's spine was `payload: <tool-name>` fences, one per tool _the ingestion prompt itself_ orchestrates. Reusability was bounded by that one prompt's tool list; every other consumer had to reverse-engineer facts out of argument bundles shaped for someone else's schema.

That second property is the root cause, and it explains both symptoms: the artifact was **indexed by consumer**, not by subject. `gst_target_quick_look` could not consume it, and it was not a durable representation of the target.

Two adjacent defects were established by execution while the fix was designed, both on `gst_target_quick_look`:

- `compute_techpar.mode` is a required enum with no default ([`src/schemas/techpar.ts:125`](../../schemas/techpar.ts)) and the prompt named none — the exact condition that produced a 1.9× `rdOpEx` divergence and an inverted zone verdict on another caller. The call was **rejected**, not defaulted.
- `estimate_tech_debt_cost` was called without its required `_audit` sibling. The call **failed validation as written**, and the guard is unsatisfiable by norm-synthesis on principle: the source enum is `irl-stated | irl-open | irl-absent | irl-scope-mismatch`, and all three non-`irl-stated` values force the value to `null`. There is no honest enum value for "synthesized from stage norms".

Both are proven by execution in [`tests/integration/irl-extract-record-consumers.test.ts`](../../../mcp-server/tests/integration/irl-extract-record-consumers.test.ts) rather than by reading, because the artifact that _describes_ an input and the artifact that _decides_ have disagreed before in this exact family.

## Decision

### 1. The extract is indexed by SUBJECT — one JSON document describing the target

Extract-only's primary output becomes the **IRL extract record**: one `record: irl-extract` JSON fence, keyed by the canonical IRL taxonomy, carrying every answered row. Per fact: the workbook `Reference`, the **verbatim IRL request text**, the workbook `Status`, a capped verbatim answer-slot excerpt, an optional normalized scalar with its conversion basis, and an extraction-side tier. Schema: [`mcp-server/src/schemas/irl-extract-record.ts`](../../../mcp-server/src/schemas/irl-extract-record.ts).

**The record carries its own semantics — there is no lookup step.** An earlier draft told consumers to resolve `ref → my input` by reading `gst://library/irl-tool-input-mapping`. [`prompts/embed.ts`](../../../mcp-server/src/prompts/embed.ts) refutes that mechanism in writing: the model can only `resources/read` URIs the user has pinned, so a body saying "read `gst://library/vdr-structure`" gets a training-data substitute instead — measured in V1 as a generic 10-folder taxonomy replacing the canonical one. Embedding the 260-line SOP into every consumer is the other direction, and is the weight BL-123 removed. So `request` is the verbatim IRL request text, carried with every fact, and a consumer matches on it directly. Adding consumer #11 needs no edit to the producer and no mapping table to keep in sync.

**Request-text matching is a convenience layer, not the correctness mechanism.** BL-126 records misroutes that happened _with the SOP already present_ — one run pulled the Section-02 `prodCost`/`toolingCost` rows into `rdOpEx`, another pulled Section 04's `remediationBudget` across tools entirely. Text similarity is weaker than the table that already failed, and a `request` string structurally cannot encode a **negative**, which is precisely what BL-126's shipped remedy added. The anti-mappings therefore stay inline in [`extraction-rules.ts`](../../../mcp-server/src/prompts/extraction-rules.ts). The record makes the right mapping easy to find; the rule constants make the wrong one refused. Both, not either.

**The `ref` is the workbook `Reference` column verbatim, and only that.** `buildReferenceId` ([`src/utils/irl/generate-xlsx.ts`](../../../src/utils/irl/generate-xlsx.ts)) composes the section digit — leading zero stripped — with the bullet's _authored_ ordinal, so ARR is `0-03`. Three sibling builders interpolate `sectionNumber` raw and produce `00-03`, the `NN-II` exclusion key; `list_irl_requests` hands models exactly that key. **Picking wrong fails silently**: a record keyed `00-03` parses, looks canonical, and never matches the reference the target quoted. `buildReferenceId` was not exported; it is now, and the record schema reuses it rather than writing a fifth copy. `_meta.refFormat` names the vocabulary explicitly so a model holding both artifacts does not conflate two identifiers for one bullet.

**Normalization is to units and scalars, never to a consumer's enums.** USD-normalized money with the conversion basis recorded, ISO dates, integer counts, verbatim excerpt. Mapping a fact onto `generate_diligence_agenda`'s 13-dimension enum set would be indexing by a consumer's schema — the root cause restated. That mapping stays in the `payload: <tool>` fences, which are explicitly consumer-shaped and always were; **they stay, demoted to a derived projection of the record**, which also preserves the full-mode parity the existing tests pin.

**Coverage is per-workbook, not per-constant.** "Every answered row" counts against the rows present in _that_ workbook. `skip-if` removals, `excludeRequests`, `customRequests` and the optional engagement sections all move the denominator, so there is no fixed number to reconcile to — which dissolves the 67-vs-134 question rather than answering it. The record's coverage claim and the fill-ratio denominator must be the same set.

**Rejected: keying the record off the Library article.** The two IRL sources are deliberately separate. `src/data/irl/information-request-list.md` drives the `.xlsx` the target actually fills and is what `gst_irl_ingestion` embeds as `gst://irl/source`; `src/data/library/information-request-list/article.md` drives the Library page. Measured, they diverge by exactly two Section 00 rows. The record keys off the **generator**, because that is the taxonomy the answers came back against.

### 2. Transport: the record is context-borne. There is no addressable server copy

The record travels by being present in the conversation — model output, operator paste — and downstream prompts consume it from context. It is a self-contained JSON document an operator can save, paste, or pipe.

Three constraints, settled by the operator, make this the endgame architecture rather than a stepping stone:

1. **Multi-session engagements are normal.** The record will routinely cross sessions. This is the _normal case_, not a trigger for building something else.
2. **The model stays the resolver.** Deterministic server-side record→input projection is a non-goal, permanently — not "for now".
3. **The record is strictly IRL-only.** A general target-evidence envelope (which would subsume `gst_diligence_handoff_memo`'s `agendaJson`/`comparablesJson` paste-backs) is a separate artifact if it ever exists, not an extension of this schema.

**Consequence, designed in rather than left implicit.** A travelling artifact must date and version _itself_, because nothing server-side can do it later: `_meta.generatedAt`, `_meta.generatedAtSource` and `_meta.promptVersion` exist for that reason and no other.

### 3. Retention: no durable server-side storage of target / IRL evidence data

Operator decision, 2026-08-20, quoted verbatim:

> we do not want server-side data retention. no data persisted on the GST MCP server - it is not a requirement. the MCP should be returning data (after processing) that is then re-consumed downstream by the model and any subsequent GST MCP prompts/tools etc (using the ingested/extracted IRL information).

**Scope, with two fences.** This decision is scoped to **target / IRL evidence artifacts**. It is not a blanket "the server persists nothing", and stated as one it would contradict three maintained docs.

**Fence (a) — the three ephemeral caches are untouched.** `mcp:irl-body:*` ([ADR-0002](0002-irl-body-by-hash-cache.md)), `mcp:irl-body-prov:*` ([ADR-0018](0018-body-integrity-and-capped-provenance.md)) and `mcp:irl-run-counts:*` ([ADR-0016](0016-run-scoped-durable-tool-call-counters.md)) are within-run transport and verification plumbing, all at 4-hour TTLs. **Stated plainly rather than euphemized**: the body cache holds the full partner body — up to `IRL_BODY_CACHE_MAX_BYTES = 200_000` — in third-party managed Redis for four hours. That is transient processing, not retention, and the distinction is the TTL plus the absence of any read path that outlives the run.

**Fence (b) — the compliance audit capability is a separate surface, governed by its own ADRs.** The hash-chained R2 log with its 7-year bucket lock and TTL-less chain-tip keys ([ADR-0009](0009-compliance-audit-log-hash-chain.md), currently deactivated per [ADR-0014](0014-deactivate-audit-pipeline.md) with a written re-engage trigger, and sold as re-enableable in `PILOT_ONBOARDING.md`) is unaffected here. The one place the two decisions meet is **ADR-0009's full-payload-retention revisit trigger**: if that trigger ever fires for target-bearing payloads, it must be evaluated against this decision rather than in isolation. Retaining request/response payloads that contain IRL evidence would cross this fence; retaining the metadata-only audit envelope does not.

### 4. Considered and rejected — an addressable record store

The alternative was a `mcp:irl-extract:<hash>` store mirroring [`irl-body-provenance.ts`](../../../mcp-server/src/cache/irl-body-provenance.ts), plus a `gst://irl/extract/{irlBodyHash}` `ResourceTemplate` (SDK-supported; zero uses in this repo today).

**Rejected on the retention policy above, not on feasibility.** The feasibility notes are preserved here so a future session does not re-derive them, and they carry **no trigger**: the obvious one — a second consumer needing the record across sessions — is already the _normal case_ under Decision 2.1, and was rejected as a build reason anyway.

Known frictions, had it been built:

- `computeManifestHash()` has no template slot, and it lives in [`manifest-stability.test.ts`](../../../mcp-server/tests/integration/manifest-stability.test.ts) — a test, not `src`.
- The stdio `_local-only.ts` radar path passes no `metrics`.
- The scope catalog needs additions in three places — `SCOPES`, `DEFAULT_SCOPES`, `SCOPE_DESCRIPTIONS` in [`auth/scopes.ts`](../../../mcp-server/src/auth/scopes.ts).
- Sibling 4-hour TTLs mean the record could not outlive the body it describes — which is precisely the property Decision 2 makes irrelevant, since the record travels in context and the body does not.

### 5. Cross-session re-verification: re-seed first, validate by hash second

In a later session the record's `_meta.irlBodyHash` no longer resolves, and `validate_irl_provenance` (hash form) **fails** with `toolFail('cache-miss')`. It does not degrade to per-citation verdicts. Two branches follow, neither depending on hash equality:

- **Primary: re-seed, then validate by hash.** Call `prepare_irl_body` with the paired body once, then `validate_irl_provenance` in its hash form. This is primary because the body-direct (`filledIrl`) form re-emits the full body per call — the exact production damage recorded at [`validate-irl-provenance.ts:12-19`](../../../mcp-server/src/tools/validate-irl-provenance.ts) (a 50 KB body emitted twice per precheck iteration, ~12 % byte loss) — and real bodies run 60–80 KB, above the emission ceiling ([ADR-0003](0003-irl-xlsx-canonicalization-hash-bind.md)). Body-direct is the **small-body fallback**, not the lead.
- **Hash equality attests IDENTITY, not verifiability.** Hashing is byte-for-byte sha256 with no normalization, and paste paths can legitimately alter bytes (the BL-124 flattened-paste case). The comparison mechanism is stated because hand-computing is forbidden by `prepare_irl_body`'s own contract: **the session-2 hash comes from `prepare_irl_body`'s result**, compared against the record's `_meta.irlBodyHash`. Same hash → the exact body the record was extracted from. Different hash → verification still runs against the supplied bytes, but the output must disclose that the body is not byte-identical to the record's minted source. The byte-reproducible producer is the operator-local `npm run irl:extract` over the same workbook, not a re-paste.

The record and the filled IRL therefore **travel together as a pair when full provenance matters**; a record alone still resolves inputs, with citations carried as asserted-not-verified.

### 6. Provenance for the deferred path: one `prepare_irl_body` call

Promoting extract-only's output to a travelling artifact raises the bar on where its bytes came from. On the deferred arm the BL-079 render-time pre-population never fires (it is gated on `args?.filledIrl`), so without a call there is no server-witnessed body and no hash bind — against ADR-0003/ADR-0018 making the hash bind the provenance authority. The deferred arm therefore calls `prepare_irl_body` **once** after the paste, purely to mint the hash and the provenance record.

**The rule was never "no tool invocations"; it is "no ANALYSIS tool invocations".** `prepare_irl_body` and `validate_irl_provenance` are transport and verification helpers that sit outside the gate surface and compute nothing about the target. Seeding the body cache is not a sweep. Five sites that stated the absolute were reworded in the same change rather than left to collide at render time. The rule is **not** weakened to "minimize tool calls": every orchestrated Hub tool stays forbidden outright.

`prepare_irl_body` now returns an optional `mintedAt` — **the STORED value, not the call's clock**. The provenance store is first-write-wins and `record()` returned `void`, so the timestamp computed at the call site can differ from the one the store kept (reachably: the render-time prepop may have minted first, and repeat calls inside the 4-hour window hit the same path). `record()` was widened to return the effective entry (`existing ?? entry`, `null` on the swallowed-error path) — both impls already read the key inside `record()`, so this costs **zero added round trips**, where a post-write `read()` would add one to a path ARCHITECTURE.md flags as cost-sensitive. Only under that stored-value return is the `server-witnessed` label honest; over-claiming provenance is the failure class ADR-0018 exists to prevent. On `null` the field is omitted and the consumer falls back to model-asserted.

The one-shot extract-only arm copies the render-time prepop's `**Body-binding hash:**` directive instead — the stronger grade. Its `generatedAt` is model-asserted: the witness exists (the prepop mints provenance) but is **unreachable in-band**, because the registry discards the handler result. `_meta.generatedAtSource` carries the discriminator — the `mintedBy` precedent — so a reader knows which they have.

**Never render a server clock into a prompt body.** `irl-ingestion-body-hash-stability.test.ts` hashes whole rendered bodies, so a render-time timestamp would destabilize every `EXPECTED_HASH_*` constant on every run.

### 7. Which prompts consume evidence is DECLARED, not inferred

A third shared clause joins `authorialIntentLine()` (all prompts) and `deliveredAsDocumentClause()` (two, deliberately): `irlEvidencePrecedence()` — resolve every input from canonical target evidence before synthesizing, matching on the IRL request text each fact carries; cite the reference; say what you synthesized; never overwrite a stated figure with a norm. It also carries the staleness caveat, which is what gives `_meta.generatedAt` and `_meta.promptVersion` a reader on the consumer side.

No `GstPrompt` property expressed "takes target inputs", and the repo already solved this shape: `needsFyiSnapshot` exists because _"a `prompt.name === '…'` check in the registry is a special case at one, a pattern at two"_. `consumesTargetEvidence?: true` is added to `GstPrompt` — the literal type, matching that precedent exactly, so there is no third `false` state for the guard to define. The guard asserts **clause-present ⇔ flag-set** across `ALL_PROMPTS`, so prompt #10 must make a choice rather than silently opting out.

**Opt-in set: six.** `gst_target_quick_look`, `gst_diligence_kickoff`, `gst_diligence_handoff_memo`, `gst_architecture_layer_review`, `gst_comparable_engagements_memo`, `gst_regulatory_exposure_brief`. **Excluded, each for a stated reason**: `gst_radar_brief_today` (no target inputs), `gst_information_request_list` (produces the blank IRL), `gst_irl_ingestion` (produces the record — resolving inputs from an artifact it is writing would be circular).

## Consequences

**What cites this decision** (keep current):

- [`mcp-server/src/schemas/irl-extract-record.ts`](../../../mcp-server/src/schemas/irl-extract-record.ts) — the schema and the body directive, which interpolate the same cap and floor constants so prose and validation cannot state different numbers.
- [`mcp-server/src/prompts/irl-ingestion.ts`](../../../mcp-server/src/prompts/irl-ingestion.ts) — `extractOnlyProcedureSections()`, the two extract-only arms, and the dispatch that consults `mode` on both branches.
- [`mcp-server/src/prompts/embed.ts`](../../../mcp-server/src/prompts/embed.ts) — `irlEvidencePrecedence()`.
- [`mcp-server/src/docs/ARCHITECTURE.md`](../../../mcp-server/src/docs/ARCHITECTURE.md) § Persistence posture — the STATE counterpart to this decision, per the division this index records (state lives in the maintained reference, decisions in ADRs).
- [`mcp-server/src/docs/prompts/irl-ingestion.md`](../../../mcp-server/src/docs/prompts/irl-ingestion.md) — the execution model, the cold-cache posture, and the ledger.

**Accepted trade-offs and operational edges:**

- **The excerpt is capped at 240 characters, with a hard floor of 20 and word-boundary truncation.** Settled by measurement, not preference. Record bytes ≈ rows × (≈207 B of ref/request/status/tier overhead + min(answerChars, cap)); a real 60–80 KB body with ~67 answered rows averages ~1,000 chars of answer per row, so an uncapped record lands near the body's own size on top of the worksheet fence and up to eight `payload:` fences, while this cap holds it near 30 KB and roughly flat as bodies grow. The floor exists because [`diligence-audit.ts`](../../../mcp-server/src/schemas/diligence-audit.ts) requires a post-em-dash excerpt of ≥ 20 characters and, for tier 1, requires it to contain the dimension's enum value as a whole-token literal (`BL-045-TIER-1-LITERAL-MISMATCH`). **A byte-only cap that severs that token silently demotes every tier-1 citation to tier 2** — defeating the reason the excerpt is kept — so truncation is on a word boundary and a truncated excerpt is flagged rather than passed off as complete.
- **Full provenance costs a re-paste of the pair.** Body + record, recurring across an engagement's sessions. Record-only remains a legitimate mode; the excerpt is what makes it citable at all.
- **The extract-only bodies now render the literal prompt version**, so a version-only bump rebaselines their hash constants where previously it did not. That is the intended trade — the deferred arm has no envelope call to supply `promptVersion` — and it is recorded in the hash suite's ledger so a future rebaseline with no visible body diff is not a mystery to re-derive.
- **`Bl076BodyCacheMissError` is worded tool-neutrally.** Two tools raise it, and under this design the operator who most often meets it is one re-validating a travelling record in a later session through `validate_irl_provenance` — not composing a dossier.

**Revisit triggers:**

- **Decision 3 has one intersection to watch**: ADR-0009's full-payload-retention revisit trigger. If it fires for target-bearing payloads, evaluate it against this decision rather than in isolation.
- **Decision 1's ref grammar** is coupled to `buildReferenceId`. A change to the workbook `Reference` format is a coordinated migration of every record already in the wild — and records travel in operator files, so there is no server-side inventory to migrate. Treat the format as published.
- **Decision 4 carries no trigger by design.** Re-opening the addressable store is an operator policy reversal, not an engineering threshold.

**References:**

- Concept diagram of the record flow (extraction → record → consumer prompts → cross-session re-verification): <https://claude.ai/code/artifact/99be16be-e090-44a8-8185-dab4f49ce407>. Carried here from BL-127's stanza when that stanza was pruned at implementation. **Refresh the diagram if the record design changes.** It doubles as a candidate visual for future site marketing.
