# Breaking changes — `@gst/mcp-server`

> **Discipline introduced under [BL-032](../src/docs/development/MCP_SERVER_REMOTE_BL-032.md) Phase 4b**.
>
> Tool names, prompt names, and Resource URIs are part of the package's public contract — pinned client conversations, agent code, and external clients (BL-033) all reference them by name. A rename or removal here is a breaking change for every consumer.
>
> **Every entry in this file ships with a corresponding `version` bump in [`package.json`](./package.json) and is mirrored in the [BL-032 architecture doc](../src/docs/development/MCP_SERVER_REMOTE_BL-032.md) Q-section that triggered it.** BL-032.5 Phase 4 formalizes the discipline with the **manifest-hash test** at [`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts) — the hash is computed over the registered Library/Regulation/Radar URIs + prompt `name@version` tuples; any drift fails the test and surfaces the new hash in the error message.

---

## Current manifest hash

```
2b3250feee6b075dda89105e14dc65ba704af7c68cfc4397cd59be7068345c58
```

Computed over (sorted):

- **4** Library URIs (`gst://library/business-architectures`, `gst://library/vdr-structure`, `gst://library/information-request-list`, `gst://library/irl-tool-input-mapping`).
- 120 Regulation URIs.
- 6 Radar URIs.
- **15** tool names (BL-049's `extract_irl_from_xlsx` partial-reverted at v0.13.1).
- **9** prompt `name@version` tuples — `gst_information_request_list` at `0.0.4` + `gst_irl_ingestion` at `0.7.1` (BL-056: `precheckIterations` field added to BL-045-VERIFY block — operator can distinguish "precheck converged after N iterations" from "precheck skipped entirely" from the artifact alone).

If this hash differs from the value in
[`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts) → `EXPECTED_MANIFEST_HASH`,
the test will fail with a remediation message. Update **both** values
in lockstep when the registry shape changes.

---

## 0.16.1 — 2026-06-04 — BL-056 — `precheckIterations` field added to BL-045-VERIFY block

**Theme**: the v13 partner-paste live exercise (2026-06-04) shipped a clean dossier (21/21 verified citations, 0 unverified, 0 fabrications, `selfCorrectionCalls: 0`), but the VERIFY block is consistent with both "precheck converged after N iterations" AND "precheck not run at all." Operators reading the artifact alone cannot distinguish post-BL-051-healthy from pre-BL-051-anti-pattern. The missing diagnostic is the count of `validate_irl_provenance` calls before `compose_dossier_envelope`.

**Surface impact** (minor — additive field on the verification artifact):

- **Both BL-045-VERIFY schemas** (one-shot at the body-rewrite directive, interactive at Step 5) gain a `precheckIterations: <int>` line under `firstEnvelopeCall` / above `selfCorrectionCalls`.
- **One rule bullet** appended to the one-shot rules list explaining: healthy band is 1–3 on a thorough partner-paste IRL; `0` means BL-051 elision; `4` (the cap) means precheck could not converge; high count + `selfCorrectionCalls: 0` is the healthy post-BL-051 pattern; low count + high `selfCorrectionCalls` is the pre-BL-051 anti-pattern resurfaced.
- **One reporting-discipline paragraph** added to the interactive Step 5 directive mirroring the one-shot rule.
- No tool schema change. No engine/runtime change. Field is model-self-reported (same epistemic class as `meaningfulRecallsHaveDifferentInputs`).

**Acceptance criterion**: the next live exercise's VERIFY block includes a populated `precheckIterations` line. Pattern audit: if `0` shows up consistently, BL-051 directive needs reinforcement; if `4` shows up, the 0.90 stopping threshold is too aggressive for real IRL coverage and we re-tune.

**Versioning**: `mcp-server` 0.16.0 → 0.16.1 (minor — additive observability field; no behavior change for any tool, schema, or directive other than the verify-block itself); `gst_irl_ingestion` prompt 0.7.0 → 0.7.1. Manifest hash + all 7 body hashes re-baselined (verify-block schema appears in every body path).

**Test surface**: existing test count + 1 unit test asserting `precheckIterations:` literal presence in both verify-block schemas.

**Filed under**: BL-056 — observability follow-up to BL-051/052/053.

---

## 0.16.0 — 2026-06-04 — BL-053 follow-up — array-form coaching in precheck directive + tier-discipline message branching + array-form integration test

**Theme**: a code-review pass after the BL-051 + BL-053 + BL-052 PRs surfaced three follow-up improvements (all minor severity individually; collectively they finish making BL-053 a first-class citizen of the precheck workflow):

1. **The precheck directive never told the model the array form exists.** A model optimizing for BL-051's 90% stopping threshold has a perverse incentive to demote a multi-bullet claim into N single-string entries — same number of unverified verdicts, but it lies about how many distinct claims the dossier rests on AND dodges BL-053's strict any-unverified-wins aggregation. The fix coaches the model: use array form for genuine multi-bullet derivations; do NOT split arrays into singles to dodge aggregation.
2. **Tier-discipline auto-append messages were misleading for the partner-supplied + array cases.** A declared-tier-1 + all-partner-supplied array fires `tier-mismatch:` with the message _"the citation excerpt is not a substring of the IRL body"_ — false; the citation IS anchored, just to a partner-form input. Array-form failures said "the citation excerpt" singular giving the model no signal which element of N failed.
3. **No integration test exercised the array form through the MCP transport.** All 16 BL-053 unit tests run against the engine directly. Zod `z.union([string, array(string)])` is a known MCP-client serialization edge case (some clients flatten union types to `any`).

**Surface impact** (minor — additive prompt-body coaching + engine-message branching + integration test):

- **`ENVELOPE_PRECHECK_DIRECTIVE`** gains a "Multi-bullet claims (BL-053 array form)" paragraph explaining the array form's aggregation rule, when to use it, when NOT to use it, and the demote-to-singles anti-pattern.
- **`INTERACTIVE_BODY` Step 3a** gains a single-sentence array-form mention for symmetry with the standalone directive.
- **`runComposeDossierEnvelope` auto-append messages** (`tier-mismatch` and `tier-fabrication`) branch on derived tier:
  - `derived === 'partner-supplied'` → message states "the citation is partner-supplied (`Section --` sentinel), not a literal IRL bullet" and the follow-up surfaces tier-2-with-partner-supplied as an acceptable resolution.
  - Array form → message appends element count ("citation is a 3-element array — at least one element did not anchor in the IRL").
- **`tests/integration/protocol-roundtrip.test.ts`** gains a new test that calls `validate_irl_provenance` through the SDK + protocol layer with a mixed payload (single-string entry + 2-element verified array + 2-element one-fabricated array) and asserts the verdict echoes back the original citation shape unchanged (catches the flatten-to-any failure mode at the transport layer).
- No tool schema change.

**Acceptance criterion**: a v13+ live exercise on a derivation-heavy IRL sees the model adopt the array form for genuine multi-bullet claims (`(K)` provenance footer shows `[N citations]` entries) AND tier-mismatch failures surface accurate diagnostics that point the model to the correct corrective action.

**Versioning**: `mcp-server` 0.15.2 → 0.16.0 (minor — additive directive paragraph + auto-append message refinements that lift the user-facing diagnostic quality; BL-053 is now first-class in the precheck workflow); `gst_irl_ingestion` prompt 0.6.2 → 0.7.0. Manifest hash + 3 body hashes re-baselined (INTERACTIVE, ONESHOT_MINIMAL, ONESHOT_FULL).

**Test surface**: 1261 mcp-server tests pass (+1 new integration test; existing engine unit tests for tier-mismatch/tier-fabrication continue to pass — the message branching is additive within the same auto-append logic).

**Filed under**: BL-053 follow-up code-review findings (no separate BACKLOG entry — improvements are documented inline in the BREAKING_CHANGES theme above).

---

## 0.15.2 — 2026-06-04 — BL-051 post-PR bugfix — precheck directive `{filledIrl, claims}` → `{filledIrl, citations}` + schema-prompt consistency regression guard

**Theme**: a code-review pass after the BL-051 + BL-053 + BL-052 PRs merged surfaced a blocker-severity bug: the BL-051 precheck directive instructed the model to call `validate_irl_provenance` with `{filledIrl, claims}` at both prompt-body sites (`ENVELOPE_PRECHECK_DIRECTIVE` line 397 used by `buildOneShotBody`; `INTERACTIVE_BODY` Step 3a line 866). The actual schema field is `citations`. On the first BL-051 precheck call in production the model would have issued `claims:`, received Zod schema rejection, and burned the precheck iteration budget on a schema-mismatch loop — bypassing the entire BL-051 architecture. The bug shipped in PR #220 and went unnoticed because the prompt-body hash-stability tests lock the literal string but no test cross-references the literal against the schema.

**Surface impact** (patch — prompt-body string fix + regression-guard test addition):

- `mcp-server/src/prompts/irl-ingestion.ts` — both sites corrected to `{filledIrl, citations}` with a brief shape-clarification phrase ("pass each claim as a `{path, citation}` entry in the `citations` array").
- `mcp-server/tests/unit/prompts/irl-ingestion.test.ts` — new `describe('BL-051 schema-prompt consistency: precheck directive references real schema fields')` block with three tests:
  1. One-shot body contains `{filledIrl, citations}` and NOT the historical `{filledIrl, claims}` bug.
  2. Interactive body Step 3a contains `{filledIrl, citations}` and NOT the historical bug.
  3. The field name in the rendered body's `{filledIrl, X}` pattern matches `Object.keys(ValidateIrlProvenanceInputSchema.shape)` — locks the prompt-body field-naming to the schema's source of truth, so any future schema rename (e.g., `citations` → `entries`) forces the prompt body to be updated in lockstep.
- No tool schema change. No engine change.

**Versioning**: `mcp-server` 0.15.1 → 0.15.2 (patch — bug fix + regression guard); `gst_irl_ingestion` prompt 0.6.1 → 0.6.2. Manifest hash + 3 body hashes re-baselined (INTERACTIVE, ONESHOT_MINIMAL, ONESHOT_FULL — the 3 envelope-bearing verbose body shapes that include the precheck directive); extract-only + compact paths unchanged.

**Test surface**: 1260 mcp-server tests pass (+3 new regression-guard tests).

**Filed under**: BL-051 post-PR bugfix (no separate BACKLOG entry — bug-class is documented inline in the BREAKING_CHANGES theme above).

---

## 0.15.1 — 2026-06-04 — BL-052 — BL-045-VERIFY block clarity (transport-vs-iteration discriminator)

**Theme**: post-BL-051 the envelope-precheck workflow targets `selfCorrectionCalls: 0` as the healthy state (the model converges citation correctness on the cheap verifier; the envelope is called once on the clean set). When `selfCorrectionCalls > 0`, operators currently cannot distinguish two qualitatively different scenarios:

1. **Healthy in-flight refinement** — the model called the envelope multiple times AND each call had progressively cleaner inputs (claims tightened, gaps revised, citations re-anchored). Legitimate iteration.
2. **Transport thrash** — the model called the envelope multiple times with identical or near-identical inputs (timeout retried, response not received, tool-error retry loop). Operator/transport issue worth flagging — the model did the work twice, not better twice.

The BL-045-VERIFY block lacked the signal to disambiguate. BL-052 adds it.

**Surface impact** (patch — prompt-body directive only):

- BL_045_VERIFY_DIRECTIVE (standalone, used by `buildOneShotBody` + `buildExtractOnlyBody`) gains a new field: `meaningfulRecallsHaveDifferentInputs: <bool — true | false | null>`. Semantics fully documented in the directive's Rules block, including post-BL-051 healthy-target framing.
- INTERACTIVE_BODY's inline Step 5 BL-045-VERIFY block schema gains the same field with the same semantics.
- All 7 prompt-body shapes re-baselined (directive appears in every body shape via the standalone constant + the inline Step 5 stanza).
- No tool schema change. The verify block is operator-grade YAML inside the model's response text — adding a field to the schema documentation in the prompt body is a clarity tightening, not a load-bearing behavior change.

**Acceptance criterion**: a subsequent live exercise with deliberate iteration produces a verify block where `selfCorrectionCalls` matches the operator's observed iteration count AND `meaningfulRecallsHaveDifferentInputs` correctly disambiguates healthy iteration (`true`) from transport thrash (`false`). When `selfCorrectionCalls: 0`, the field is `null`.

**Versioning**: `mcp-server` 0.15.0 → 0.15.1 (patch — additive prompt-body directive field); `gst_irl_ingestion` prompt 0.6.0 → 0.6.1. Manifest hash + all 7 body hashes re-baselined.

**Test surface**: 1257 mcp-server tests pass (no test additions — the change is prose-only directive expansion).

**Filed under**: BL-052 (`src/docs/development/BACKLOG.md`).

---

## 0.15.0 — 2026-06-04 — BL-053 — citation array form on `compose_dossier_envelope` + `validate_irl_provenance` (multi-bullet claim support)

**Theme**: pre-BL-053 the verifier rejected multi-bullet claims as non-substring even when every supporting bullet existed in the IRL — the model's natural citation style joins multiple supporting bullets with semicolons but the substring check then fails the aggregate. The structural false-negative forced the model into bad workarounds: under-attribute (cite only the first bullet), misrepresent provenance (drop to `Section --` partner-supplied sentinel), or accept inflated `unverified` flags. BL-053 closes the gap at the schema layer.

**Surface impact** (minor — additive schema change; backward-compatible):

- **`compose_dossier_envelope.claims[].citation`**: now `string | string[]` (1-8 elements). String form unchanged; array form is verified per-element with strict aggregation.
- **`validate_irl_provenance.citations[].citation`**: same union shape, same per-element + aggregation behavior. Lets the BL-051 envelope-precheck workflow exercise multi-bullet claims on the fast verifier consistently.
- **Aggregation rule** (per-claim verdict from per-element verdicts):
  - ANY element `unverified` → aggregate `unverified` (weakest verdict dominates failure).
  - ALL elements `partner-supplied` → `partner-supplied`.
  - ALL elements `verified` verbatim → `verified`.
  - Mixed `verified` + `partner-supplied` (no fuzzy, no unverified) → `verified`.
  - Any `verified-fuzzy` in the mix → `verified-fuzzy`.
- **Tier-discipline preserved**: declared tier-1 + any element fails substring → `tier-mismatch:` auto-append (existing rule, now element-aware). Declared tier-2 + derived fabrication → `tier-fabrication:` (BL-049 v11 Finding B closure, now element-aware).
- **`(K)` provenance footer rendering**: array-form citations render as `[N citations] elem1 ; elem2 ; …` so partners see at a glance which claims rest on multi-bullet derivations.
- **`ValidateIrlProvenanceVerdict.citation`**: type widened to `string | string[]` (echoes back the original shape so callers can attribute verdicts to their emitted citation structure unchanged).

**Acceptance criterion**: a v13+ live exercise on a derivation-heavy IRL (TechPar/ICG/Tech Debt verdicts that cite multiple supporting bullets) should see verification rate lift to ≥85% as the model adopts the array form for multi-bullet claims that previously rode the structural false-negative.

**Versioning**: `mcp-server` 0.14.0 → 0.15.0 (minor — additive schema change; existing single-string call sites unchanged). Prompt body NOT bumped — no prompt-body change required to make the array form available, although future prompt-body work could direct the model to prefer the array form for multi-bullet claims. Manifest hash + all body hashes unchanged (no prompt name/version drift).

**Test surface**: 1257 mcp-server tests pass (+16 new BL-053 tests covering aggregation rule cases, schema acceptance/rejection, tier-discipline interaction, mixed-shape calls, and footer rendering).

**Filed under**: BL-053 (`src/docs/development/BACKLOG.md`).

---

## 0.14.0 — 2026-06-04 — BL-051 — envelope precheck via `validate_irl_provenance` (citation iteration on the fast tool before the heavyweight one)

**Theme**: the v12 StoreForce live exercise empirically established that the `compose_dossier_envelope` tool's input dictation cost (~30KB of claims + gaps + filledIrl + meta JSON) is the workflow throughput bottleneck. When the model iterates citation correctness directly on the envelope, each correction round re-dictates the entire input — minutes per cycle for a per-claim verdict refinement that is fundamentally small. BL-051 redirects the convergence loop to `validate_irl_provenance` (the purpose-built fast verifier — minimal input, per-claim verdict output), then calls the envelope ONCE on the clean set. Net effect: 1 envelope call instead of 2-5, verification rate lifts (each unverified claim got a real correction opportunity), workflow ships minutes faster.

**Surface impact** (minor — additive prompt-body directive; no schema/code change):

- **Prompt body**:
  - NEW `ENVELOPE_PRECHECK_DIRECTIVE` constant in `prompts/irl-ingestion.ts` — instructs the model to call `validate_irl_provenance` BEFORE `compose_dossier_envelope`, iterate citation corrections on the cheap verifier until `(verified + verifiedFuzzy + partnerSupplied) / total ≥ 0.90` OR 4 precheck iterations (whichever comes first), then call the envelope ONCE on the clean set.
  - Wired into `buildOneShotBody` (verbose mode) between `bodyBindingDirective` and `ENVELOPE_COMPOSITION_DIRECTIVE`.
  - `INTERACTIVE_BODY` gains an inline Step 3a equivalent immediately before the existing Step 4 mandatory envelope call.
  - Extract-only bodies are NOT touched (no envelope call there).
- **No schema/code change**: `validate_irl_provenance` and `compose_dossier_envelope` schemas + tool handlers are unchanged. Both tools already exist and are registered. The change is purely a workflow-discipline directive.
- **Acceptance criterion**: a v13+ live exercise on a derivation-heavy IRL should land `(verified + verifiedFuzzy + partnerSupplied) / total ≥ 0.88` on the FIRST `compose_dossier_envelope` call, with `selfCorrectionCalls: 0` and `totalEnvelopeCalls: 1` in the BL-045-VERIFY block.

**Versioning**: `mcp-server` 0.13.1 → 0.14.0 (minor — additive prompt directive lifts a load-bearing workflow property: throughput + verification-rate band on the first envelope call); `gst_irl_ingestion` prompt 0.5.3 → 0.6.0. Manifest hash + 3 body hashes (interactive, oneshot-minimal, oneshot-full) re-baselined; extract-only + compact-oneshot hashes unchanged (precheck is gated on verbose envelope-bearing bodies only).

**Test surface**: 1241 mcp-server tests pass. Existing `validate_irl_provenance` and `compose_dossier_envelope` tests continue to cover the tool behavior the directive instructs the model to invoke.

**Filed under**: BL-051 (`src/docs/development/BACKLOG.md`).

---

## 0.13.1 — 2026-06-04 — BL-049 partial revert — strand the unreachable xlsx/HMAC infrastructure; preserve the empirically-validated pieces

**Theme**: the BL-049 v12 StoreForce live exercise (2026-06-04) revealed that the **HMAC-receipt + xlsx-canonicalized branch is structurally unreachable in the standard Claude Desktop + stdio topology**. The model executes in Anthropic's cloud-side Linux compute sandbox; the MCP server runs on the operator's host (Windows in this run). Attached files live in the model's sandbox at paths like `/mnt/user-data/uploads/...` that the host MCP server cannot read. Both delivery paths the BL-049 design assumed fail:

- `xlsxBase64`: the model's tool-call construction truncates strings >~10KB; ~65KB workbooks fail with `Bad compressed size` ZIP errors.
- `xlsxPath`: the cross-host filesystem boundary — the Windows server cannot resolve a Linux sandbox path.

This is not a Windows-specific problem — it's the default Claude Desktop topology, period. Without an MCP spec primitive for binary resource delivery OR a Claude Desktop attachment-to-host bridge (neither exists; no public roadmap), the receipt-mediated xlsx-canonicalized path has no operator-reachable form. The empirically-shipped v12 dossier ran on the partner-pasted path; the HMAC infrastructure never fired.

**Surface impact** (patch — additive removals; backward-compatible reduction to v0.12.0-shaped envelope with v11 Finding B closure retained):

- **Reverted**:
  - `extract_irl_from_xlsx` tool + schema + handler (file delete)
  - `mcp-server/src/lib/receipt-hmac.ts` (file delete)
  - `RECEIPT_HMAC_KEY` env binding in `worker.ts:Env`
  - `irlSource` + `receipt` schema fields on `compose_dossier_envelope`
  - `IrlReceiptInvalidError`, `IrlReceiptShapeError`, `assertReceiptSymmetry`, HMAC verify branch in the envelope engine
  - Step 0 xlsx-ingestion directive in `prompts/irl-ingestion.ts` interactive body
  - `irlSource` / `receipt` mentions in `ENVELOPE_COMPOSITION_DIRECTIVE`
  - Server registers 15 tools again (down from 16); `RECEIPT_HMAC_KEY` no longer in `Env`
- **Retained from BL-049** (empirically validated on the v12 partner-paste live exercise 2026-06-04):
  - `tier-fabrication` gap category + `deriveTier(verdict)` helper + tier-fabrication auto-append in `compose_dossier_envelope`'s engine. The v12 trace showed the model reading the verifier's tier-fabrication diagnostic and choosing to re-cite rather than demote — empirical evidence the v11 Finding B closure works on real model behavior.
  - `BL_045_VERIFY_DIRECTIVE` on every prompt body — the operator-grade audit artifact that made the v12 diagnostic workflow tractable.
  - `extractExcerpt` anchors on `lastIndexOf('—')` (BL-049 defensive hardening).
  - `normalizeForMatching` strips `/` and `+` to whitespace (BL-049 defensive hardening).
  - BL-052 tightening on the BL-045-VERIFY directive: cumulative-across-session count semantics + conditional-trigger preservation rules made explicit.

**Versioning**: `mcp-server` 0.13.0 → 0.13.1 (patch — additive removals; envelope schema reduces to v0.12.0 shape + tier-fabrication count field); `gst_irl_ingestion` prompt 0.5.0 → 0.5.1 (Step 0 directive removed, BL-045-VERIFY directive tightened). Manifest hash + all 7 body hashes re-baselined.

**Test deltas**: 1278 → 1241 (-37). Removed: receipt-hmac unit tests (15), extract-irl-from-xlsx parser tests (9), cross-tool integration tests (13). Updated: existing tests rebaselined for the 15-tool count + 0.5.1 prompt version + new body hashes. **Tier-discipline tests preserved** — the v11 Finding B closure remains under test coverage.

**Deferred work**: the xlsx-canonicalized hash-bind authority path is deferred indefinitely. BL-054 was filed and retired same-day on 2026-06-04 — a backlog item gated on external infrastructure with no public roadmap is a tombstone, not a queueable initiative. The architecture survives as a revisit blueprint at [`src/docs/development/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md`](../src/docs/development/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md); re-engage by re-reading that doc when an MCP spec primitive ships for binary-resource delivery OR Claude Desktop ships an attachment-to-host bridge OR the topology pivots away from Claude Desktop + stdio.

**Also in 0.13.1** — **BL-055 — hash-bind discipline split** (live-exercise empirical fix, 2026-06-04):

The v12 partner-paste live exercise surfaced a pre-existing structural gap in interactive-mode invocations: the prompt body has no `**Body-binding hash:**` directive (it can't — there's no `filledIrl` arg at prompt-build time), so the model has no authoritative external hash to copy. Pre-BL-055, the only legal `hashBindResult` values were `pass` (which falsely implied authoritative binding) and `IrlBodyHashMismatchError`. The model in v12 correctly refused to claim `pass` without a real directive, which manifested as a hard workflow blocker.

The fix distinguishes the two functions hash-bind actually serves:

- **`pass-bound`** — supplied `irlBodyHash` was copied verbatim from the prompt body's `**Body-binding hash:**` directive (one-shot mode where `filledIrl` was a partner-supplied arg). Hash binds to bytes the prompt SERVER computed from the partner's authoritative paste. Audit grade: high. Closes both v10's "model paraphrases body" failure mode AND function 2 ("bind to authoritative external source").
- **`pass-internal`** — no directive existed in the prompt body (interactive-mode invocation), so the model computed `sha256(filledIrl).slice(0,16)` itself from the body it intends to submit. Hash confirms internal consistency between body and citations the model submits — function 1 of hash-bind ("catch paraphrase between body and citations") still applies and is still valuable. Audit grade: medium (partner sees that the IRL bytes came from model reconstruction, not partner-pasted markdown). Crucially, this is the HONEST report for interactive-mode runs — it's not a fabricated authoritative bind, and the partner reading the dossier sees the provenance limit transparently.
- **`IrlBodyHashMismatchError`** — unchanged; the envelope rejected the call because `irlBodyHash` doesn't match `sha256(filledIrl)`. Re-cite or re-submit.

Surface impact (additive prompt-body directive expansion, no schema/code change):

- BL_045_VERIFY_DIRECTIVE: `hashBindResult` enum expanded; reporting-discipline rules added (don't claim `pass-bound` without a directive to copy from).
- Inline Step 5 verify block in INTERACTIVE_BODY: same enum + discipline.
- ENVELOPE_COMPOSITION_DIRECTIVE: annotated to explain one-shot vs interactive sourcing.

Prompt: 0.5.2 → 0.5.3 (patch — additive directive clarity, no contract change). Server stays at 0.13.1. Body hashes + manifest hash rebaselined.

**Theme**: closes the two real failure modes the v11 StoreForce live exercise empirically exposed (after re-grounding the original "30 false-positive tier-mismatch" thesis against the actual transcript — see [`src/docs/development/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md`](../src/docs/development/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md) § "Empirical trace — v11 actual outcome"):

- **Finding A — operator-flow ambiguity.** When xlsx is attached but no `filledIrl` arg is supplied, the model improvises a body. v11's Call 1 passed the blank canonical IRL template; verifier correctly rejected 30 IRL-cited claims. Call 2 (self-correction with the populated body) was prepared but never fired. **Closed by `extract_irl_from_xlsx`** — gives the model an authoritative canonical body so Call 1 IS the successful call.
- **Finding B — tier-discipline gaming.** Inspecting Call 2's prepared input revealed the model demoted **17 originally-tier-1 claims to tier-2** between calls — converting damning `tier-mismatch:` gaps into routine `provenance-gap:` ones. The tier field was model-declared with no server enforcement. **Closed by `tier-fabrication:` auto-append** — the verifier derives effective tier from citation properties (substring → tier-1-literal; `Section --` sentinel → partner-supplied; neither → fabrication); demoting to tier-2 with a non-substring excerpt now produces `tier-fabrication:` instead of being silently absorbed.

**Surface impact** (minor — additive schema + new tool):

- **New tool `extract_irl_from_xlsx`** — base64 xlsx in, deterministic canonical-form markdown + `irlBodyHash` + HMAC `receipt` + `fillRatio` out. Reuses `parseIrlArticle` cross-tree from `src/utils/irl/parse-article.ts` (BL-044's canonical AST) so the section/bullet shape is single-sourced.
- **HMAC receipt** — new `mcp-server/src/lib/receipt-hmac.ts` (`computeReceipt`, `verifyReceipt`, `loadReceiptSecretOrThrow`). Reuses the existing constant-time `timingSafeEqual` polyfill from `admin/admin-auth.ts` for Workers-runtime portability. Truncated HMAC-SHA256 to 16 bytes (32 hex chars) — 128 bits of unforgeable receipt scoped to a single conversation. New Wrangler secret `RECEIPT_HMAC_KEY` (min 32 chars); fail-closed on tool invocation (not boot) so existing tests / callers without xlsx workflow keep working.
- **`compose_dossier_envelope` schema** — additive optional `irlSource: 'partner-pasted' | 'xlsx-canonicalized'` (default `'partner-pasted'` preserves today's behavior) + optional `receipt: /^[a-f0-9]{32}$/`. Engine enforces symmetric receipt presence at call time (`assertReceiptSymmetry`); xlsx-canonicalized branch additionally verifies the HMAC under the server secret. New errors: `IrlReceiptInvalidError` (model fabricated body + computed sha256 but lacks HMAC) + `IrlReceiptShapeError` (asymmetric receipt + irlSource).
- **`tier-fabrication` gap category (BL-049 v11 Finding B)** — added to `gapCategoryValues` enum. `deriveTier(verdict)` helper classifies effective tier from citation properties. Result includes `tierFabrications` count alongside `tierMismatches`.
- **Verifier defensive hardening** — `extractExcerpt` anchors on `lastIndexOf('—')` (handles multi-em-dash citations cleanly); `normalizeForMatching` strips `/` and `+` to whitespace so `cad/mo` and `hosting + infrastructure` decompose into word boundaries the fuzzy-run logic can use.
- **New env var `RECEIPT_HMAC_KEY`** in `worker.ts:Env` interface, threaded into `registerComposeDossierEnvelopeTool(server, metrics, secret)` and `registerExtractIrlFromXlsxTool(server, secret, metrics)`.

**Body changes** (prompt `gst_irl_ingestion` 0.4.0 → 0.5.0):

- Interactive body: new `## Step 0 — xlsx ingestion path` directing the model to call `extract_irl_from_xlsx` BEFORE the partner-paste request when an `.xlsx` is attached; threads its outputs through `compose_dossier_envelope` with `irlSource: 'xlsx-canonicalized'` + `receipt`.
- One-shot body: `ENVELOPE_COMPOSITION_DIRECTIVE` documents the new `irlSource` + `receipt` input contract.
- New `BL_045_VERIFY_DIRECTIVE` appended to all bodies (interactive, one-shot, extract-only — both verbose and compact). Instructs the model to emit a single fenced `BL-045-VERIFY` block as the final content of every response, with a fixed YAML schema. Operator-grade verification artifact: ≤ 500 bytes, never truncates, single-block copy-paste. Replaces transcript archaeology.

**Versioning**: `mcp-server` 0.12.0 → 0.13.0 (minor — new tool + additive schema fields); `gst_irl_ingestion` prompt 0.4.0 → 0.5.0. Manifest hash + all 7 body hashes re-baselined.

**Test deltas**: 1241 → 1278 (+37). New: 15 receipt-hmac unit cases, 9 extract-irl-from-xlsx parser cases, 13 cross-tool integration cases (happy path, bypass attack, schema-shape, backward compat, tier-discipline regression). Updated: 4 existing cases (extractExcerpt last-em-dash semantics, tier-2 fabrication now surfaces tier-fabrication, tools list grew to 16).

---

## 0.12.0 — 2026-06-03 — BL-045 PR B audit-2 tightening — hash-bind forcing function + schema enum hardening

**Theme**: closes the v10 dossier compliance gaps and the impartial code-review audit-2 findings (1 BLOCKER + 6 MAJORS + 3 ALTERNATIVES). The previous v0.11.0 commit got the model to call `compose_dossier_envelope` and emit the meta fence + (J) + (K) — but the meta fence had hallucinated `promptVersion: "0.0.2"`, the `conditionalTriggersFired` array was over-populated with 7 entries (only `EU_AI_ACT` qualifies), and 25 of 29 claims came back as false-positive `unverified` because the model passed a paraphrased IRL as `filledIrl` rather than the verbatim bytes.

**Surface impact** (minor — schema-breaking on `compose_dossier_envelope` inputs):

- **Hash-bind forcing function (BL-2 via ALT-1)** — schema requires a new `irlBodyHash` field; prompt body embeds `**Body-binding hash:** <16hex>` directive (sha256 of args.filledIrl, first 16 hex chars). The tool computes `sha256(input.filledIrl).slice(0,16)` and rejects on mismatch via `IrlBodyHashMismatchError`. **Architecturally identical to the dimension-layer schema enforcement**: the model can't pass a paraphrased filledIrl because sha256 doesn't paraphrase.
- **Server-derived `promptVersion` (BL-1)** — schema field is now optional; tool handler reads canonical version from `irlIngestionPrompt.version` (leaf module, no circular-dep risk). Meta-fence rendering ignores whatever the model passes.
- **`conditionalTriggersFired` enum tightened (BL-3)** — `z.enum(CONDITIONAL_TRIGGER_NAMES)` where the const is exported from `extraction-rules.ts`. Future trigger additions are a single-edit-in-lockstep. Schema rejects `"GDPR"` / `"PIPEDA"` / etc. (v10 over-population mode).
- **`gatesPassed` + `forceToolsApplied` enums tightened (MA-5)** — `z.enum(ORCHESTRATED_TOOLS)`. Same maintenance-debt-elimination principle.
- **`modelVersion` regex (MA-2)** — `^[a-z][a-z0-9_-]*\d[a-z0-9_-]*$` rejects sentinel hallucinations (`""`, `"x"`, `"claude"`, `"unknown"`). Accepts canonical shapes (`claude-opus-4-7`, `gpt-4-turbo`).
- **Tier-mismatch surface (MA-6)** — tier-1 claim returning `unverified` is now its own gap category `tier-mismatch:` (structurally more damning than generic `provenance-gap:` because the model declared verbatim IRL bullet but cited a paraphrase or fabrication). Returns `tierMismatches` count in `provenanceVerification`.
- **Deterministic meta-fence key order (MI-1)** — manual line-by-line concat replaces `JSON.stringify`, making key order a property of source rather than V8 implementation.

**Body changes**:

- New `## Body-binding hash` directive in `buildOneShotBody` verbose mode.
- `ENVELOPE_COMPOSITION_DIRECTIVE` updated to reference the body-binding hash.

**Versioning**: `mcp-server` 0.11.0 → 0.12.0 (minor — schema-breaking inputs); `gst_irl_ingestion` prompt 0.3.0 → 0.4.0. Manifest hash + 6 of 7 body hashes re-baselined (interactive unchanged).

**Test deltas**: existing 12 tests for the envelope tool refactored for new signature + server context; +13 new tests covering hash-bind happy path / mismatch / IRL paraphrase rejection / schema enum rejection / modelVersion regex / promptVersion override; 1208 → 1238 test count after rebuild.

---

## 0.11.0 — 2026-06-03 — BL-045 PR B post-audit forcing-function tightening — `compose_dossier_envelope` tool

**Theme**: closes the dossier-rendering compliance gap empirically exposed by the v8 + v9 StoreForce live runs. v9 produced A-grade content but no top-of-dossier meta JSON fence, no per-section `audit:` fences, and no `(K)` provenance footer — the verbose-mode body-rewrite 2/N + 3/N rendering directives were treated as descriptive context, not as a procedure. **Same finding the v2/v3/v4 dimension-layer traces produced**, now at the rendering layer.

**The fix** — apply the architectural pattern that solved the dimension-layer fabrication risk: externalize the structure into a tool input. The model can't compose the dossier without the envelope because the envelope IS what the model has to call the tool to produce.

**Surface impact**: **Additive — one new MCP tool + one new prompt-body directive.**

- New tool `compose_dossier_envelope` — pure (no engine, no Hub deeplink). Input: structured envelope inputs (meta-fence fields + categorized `gaps` + `claims` with per-claim citations + `filledIrl`). Output: three markdown blocks (`metaFenceMarkdown`, `gapListMarkdown`, `provenanceFooterMarkdown`) the model transcribes verbatim into the dossier, plus a `provenanceVerification` summary.
- **Internal provenance enforcement**: the tool calls `runIrlProvenanceCheck` against every claim's citation; unverified claims auto-append `provenance-gap:` entries to the (J) gap list. The provenance-citation self-check fires as a side-effect of calling the tool rather than relying on the model to remember the directive.
- New prompt-body directive `ENVELOPE_COMPOSITION_DIRECTIVE` — verbose-mode + full-mode only. Marks the tool call as BLOCKING and non-optional; specifies the transcription discipline (meta fence first, (J) before (K), (K) last).
- Interactive body gains a Step 4 mention of the tool so the orchestrates body-mention invariant holds across both interactive and one-shot bodies.

**Why this is the forcing function**: the BLOCKING-marked body directives in 2/N and 3/N (`META_JSON_FENCE_DIRECTIVE`, `PER_SECTION_JSON_FENCE_DIRECTIVE`, `PROVENANCE_FOOTER_DIRECTIVE`, `PROVENANCE_CITATION_SELF_CHECK_DIRECTIVE`) all still ship, but they're now supplemented by a tool call that PRODUCES the structural markdown. The model can ignore the directive prose, but it can't ignore a tool whose return value the body says to paste verbatim.

**Versioning**: `mcp-server` 0.10.1 → 0.11.0. `gst_irl_ingestion` prompt 0.2.0 → 0.3.0 (body materially changed; orchestrates extended). Manifest hash re-baselined (prompt version contributes to the manifest set). Body hashes re-baselined across all 7 scenarios.

**Test deltas**: +12 unit cases for the new tool's render functions and engine; tools-list assertion extended to 15 tools; prompts-registry KNOWN_TOOL_NAMES extended; orchestrates body-mention test passes for both interactive and one-shot bodies. All 1225 mcp-server tests pass.

---

## 0.10.1 — 2026-06-03 — BL-045 PR B audit remediation

**Theme**: impartial code-review pass identified 1 BLOCKER + 4 substantive MAJORS + 2 MINORS in the BL-045 PR B work. This commit lands the in-scope fixes per CLAUDE.md § 4a (no deferred tech debt).

**Surface impact**: **None — additive test coverage + bug-fix on an internal refinement rule.** No tool surface changed, no prompt body changed.

**Correctness fixes**:

- **B1 — Tier-1 literal-substring rule (`diligence-audit.ts:393-405`)**. The pre-fix check ran `citation.toLowerCase().includes(value.toLowerCase())` against the FULL citation. Two false-positive paths: (a) section-header prefixes (e.g., `Section 02 row 201-500 — …`) trivially matched the value, (b) short tokens like `"us"` matched as a substring of unrelated words (`"explicitly"`, `"businessmodel"`). Fix: new `citationContainsValueLiteral` helper extracts the post-em-dash excerpt and uses a non-alphanumeric-boundary regex, permitting internal hyphens so hyphen-bearing enum values (`b2b-saas`, `modern-cloud-native`, `customer-pii-at-scale`) still match.
- **M2 — Tier-1 rule extension to `geographies` array**. The pre-fix scalar loop skipped the array dimension entirely. A model could claim `tier=1` for `geographies: ["us","eu","uk"]` while citing only `"US"`. Fix: explicit loop validating every supplied geography appears as a literal token in the citation excerpt.
- **m1 — dead `HEADCOUNT_IDS` import** removed; `REVENUE_RANGE_IDS` retained as it's referenced via `(typeof REVENUE_RANGE_IDS)[number]`.

**Coverage additions**:

- **M1 — body-hash test extended with 2 compact-verbosity scenarios** (`tests/integration/irl-ingestion-body-hash-stability.test.ts`). Pre-fix all 5 scenarios used default verbosity; compact-mode bodies could silently regress into emitting verbose-only directives. Now hash-locked.
- **M6 — SOP dual-source drift guard** (`tests/integration/sop-dual-source-drift-guard.test.ts`). `src/data/library/irl-tool-input-mapping/article.md` and `mcp-server/src/docs/library/irl-tool-input-mapping.md` are byte-identical today; this test fails fast on drift with operator instructions for the intentional-divergence escape hatch.
- **M8 — `tools/list` round-trip assertion** (`tests/integration/protocol-roundtrip.test.ts`). The whole architectural justification for landing calibration refinements in handler bodies (rather than `.superRefine`) rests on the SDK publishing `_audit` in the JSON Schema. New test introspects the published schema for `generate_diligence_agenda` + `compute_techpar` + `estimate_tech_debt_cost`, asserts `_audit` appears in `properties` AND `required`. If any future refactor accidentally wraps the schema in `ZodEffects` the audit architecture silently degrades — this test catches that.
- **M3 — partner-supplied coupling guard** (`tests/unit/schemas/validate-irl-provenance.test.ts`). Pins the dependency between `buildPartnerSuppliedAudit` citation prose and the `isPartnerSupplied` dual-marker classifier. If a future kickoff/handoff prompt rev shortens the citation to omit `partner-supplied form input`, this test fails before partner-form citations start mis-classifying as `unverified`.
- **m2 — hyphen-in-enum normalization pin** added to the Tier-1 rule test surface.

**Explicitly deferred**:

- M4 unicode coverage (Turkish-i, German ß) — real but low-impact; live exercise will surface it if it bites in practice.
- M4 huge-IRL perf bound on `longestContiguousRun` — quadratic but at typical IRL sizes (~10k words) the bound is well under MCP tool timeout.
- M7 `any`-typed registry wrap — consistent with the pre-existing `ALL_PROMPTS: ReadonlyArray<GstPrompt<any>>` pattern; no regression.

**Manifest-hash impact**: unchanged.
**Body-hash impact**: unchanged.
**Test deltas**: +11 cases (1213 total, +0.9% from prior baseline).

---

## 0.10.0 — 2026-06-03 — BL-045 PR B Phase 2B — `validate_irl_provenance` tool

**Theme**: closes the M6 residual-fabrication gap honestly scoped during Phase 1/2. Structural audit refinements verify citation shape; this tool verifies citation truthfulness against the supplied IRL body.

**Surface impact**: **Additive**. One new MCP tool registered at server boot; no existing tool changed.

- New tool `validate_irl_provenance` — pure function (no engine call, no Hub deeplink). Input: `{ filledIrl, citations: [{ path, citation }] }`. Output: per-citation verdict bucketed into `verified` / `verified-fuzzy` / `partner-supplied` / `unverified` plus aggregate counts.
- Matching engine in `src/schemas/validate-irl-provenance.ts` exposes pure `runIrlProvenanceCheck(input)` for unit testing in isolation from the MCP transport. Algorithm: normalize both texts (lowercase, strip markdown noise, flatten dashes, collapse whitespace), test verbatim substring → `verified`. On miss, find the longest contiguous-word run from the excerpt that appears in the IRL; if ≥ `FUZZY_MIN_RUN` (8) → `verified-fuzzy`. Otherwise `unverified`. The 8-word threshold is empirically calibrated from the StoreForce v5+ runs (real paraphrasings ≥12; fabrications ≤4).
- `Section --` + `partner-supplied form input` dual-marker discipline classifies kickoff/handoff partner-form citations as `partner-supplied` (no IRL anchor expected).

**Intended caller**: the model invokes this during its (K) provenance footer + provenance-citation self-check pass, supplying the load-bearing citations from `_audit` blocks. Unverified verdicts feed (J) gap-list `provenance-gap:` entries — the model either removes the dossier claim or honestly marks it open.

**Client migration**: none. Existing callers continue to work; new callers gain the tool.

**Manifest-hash impact**: unchanged (prompts list + Library/Regulation/Radar URIs unchanged; manifest hash does NOT include tool names).

**Body-hash impact**: unchanged.

**Test deltas**: 17 new unit cases in `tests/unit/schemas/validate-irl-provenance.test.ts` covering normalization round-trips, excerpt extraction, verbatim match, fuzzy boundary at FUZZY_MIN_RUN, partner-supplied dual-marker discipline, true-fabrication rejection, aggregate counts across mixed inputs. `tests/integration/protocol-roundtrip.test.ts` tools-list assertion extended to 14 tools.

---

## 0.9.0 — 2026-06-03 — BL-045 PR B — SOP promoted to Library Resource

**Theme**: the IRL → Hub Tool Input Mapping SOP (engineering-internal at `mcp-server/src/docs/library/irl-tool-input-mapping.md`) is promoted to a fourth Library Resource at `gst://library/irl-tool-input-mapping` so the model can fetch it via the standard MCP `resources/read` interface during IRL ingestion.

**Surface impact**: **Additive**. One new Library URI; no existing URI changed.

- New Resource: `gst://library/irl-tool-input-mapping` — engineering SOP body served at `text/markdown`, ~14KB.
- The SOP body is now codegenned from `src/data/library/irl-tool-input-mapping/article.md` into `src/content/library-data.generated.ts` at prebuild/pretest time, matching the existing Library article shape.
- `irlIngestionPrompt`'s `orchestrates` array is intentionally NOT extended in this commit — the model already embeds the IRL + VDR articles; the mapping SOP is reachable on-demand via `resources/read` rather than being force-embedded into every prompt body. (Body-embedding can be added in a follow-up if the model consistently misses the mapping cues without it.)

**Client migration**: none. Existing callers continue to work.

**Manifest-hash impact**: changed — new URI `gst://library/irl-tool-input-mapping` enters the sorted-URI set the manifest hash is computed over.

**Body-hash impact**: unchanged (irlIngestionPrompt's body did not change in this commit).

**Test deltas**: existing length-assertions in `tests/unit/library.test.ts`, `tests/integration/protocol-roundtrip.test.ts`, `tests/integration/resource-uri-stability.test.ts` updated from 3→4 Library URIs.

---

## 0.8.0 — 2026-06-03 — BL-045 PR B body rewrite (3/N): per-section JSON fences + (K) provenance footer + provenance-citation self-check

**Theme**: continues the body-rewrite work past `0.7.0`. This commit lands the three verbose-mode directives that close the design doc's "Body rendering strategy" scope: per-section audit JSON fences after each tool-backed dossier section, a (K) provenance footer mapping every load-bearing claim to its IRL anchor, and a final provenance-citation self-check that surfaces gaps in (J) rather than silently dropping them.

**Surface impact**: **None — additive prompt-body change**. Behavior added (verbose mode only — the default):

- `PER_SECTION_JSON_FENCE_DIRECTIVE` — full-mode only. Each tool-backed dossier section (C/D/E/F/G/H) now closes with a JSON code fence `audit: <letter>` carrying `{ tool, inputPayload, outputSummary, deeplink }` plus a self-check line. Failures surface in (J), not silently overwritten. (F) regulatory subsections emit one fence per framework.
- `PROVENANCE_FOOTER_DIRECTIVE` — both modes. New `(K) Provenance footer` section after (J), listing every load-bearing claim (monetary, headcount, regulatory framework, paradigm verdict, ICG maturity score, comparable engagement) with its IRL anchor in `Section NN row M: "<verbatim excerpt>" (tier T)` shape.
- `PROVENANCE_CITATION_SELF_CHECK_DIRECTIVE` — both modes. Final BLOCKING pass before emit: every (C)-(I) claim cross-checked against (K) anchors; unanchored claims become numbered `provenance-gap:` entries in (J). Common patterns called out: tool-output verbatims without (K) anchors, conditional-trigger frameworks without trigger-predicate anchors, comparables without dimension-justification anchors.

**Wiring**: `verbosity` arg threaded into `buildOneShotBody` + `buildExtractOnlyBody`. Compact mode elides all three directives (use case: piping the dossier JSON downstream to automation that doesn't need the audit prose).

**Client migration**: none. No new args. Existing callers benefit automatically (default `verbosity: verbose`).

**Manifest-hash impact**: changed (prompt version bumped `0.1.0` → `0.2.0`).

**Body-hash impact**: 4 of 5 scenarios re-baselined (interactive unchanged).

**Reference**: [design doc § Body rendering strategy, § Output structure (K)](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md).

---

## 0.7.0 — 2026-06-03 — BL-045 PR B body rewrite (2/N): 9 inclusion gates + meta JSON fence + tool-error degradation + 4-scenario voice cues

**Theme**: continues the body-rewrite work past `0.6.0`. This commit closes four design-doc directives that were specified but not yet body-rendered: numbered inclusion gates the model evaluates before each tool, a top-of-dossier meta JSON fence that turns every dossier into an auditable artifact, a tool-error degradation directive that prevents premature sweep abort on a single tool failure, and per-scenario voice cues with meaningful posture for each of buy-side / sell-side / value-creation / unknown.

**Surface impact**: **None — additive prompt-body change**. Behavior added:

- `INCLUSION_GATES_DIRECTIVE` — 9 numbered tool-gate predicates emitted in both full + extract-only bodies. The model evaluates each gate before its corresponding step.
- `META_JSON_FENCE_DIRECTIVE` — required JSON code fence at the top of every dossier with 12 structured fields (promptName, promptVersion, modelVersion, mode, verbosity, transactionContext, fixtureFillRatio, fixtureFillRatioStatus, gatesPassed, gatesElided, conditionalTriggersFired, forceToolsApplied). Downstream automation parses this fence first; cross-run comparison keys off this block.
- `TOOL_ERROR_DEGRADATION_DIRECTIVE` — full-mode-only. If a tool errors mid-sweep, emit the error verbatim, mark the section extraction-only, continue. The meta fence's `gatesPassed` entry for the failing tool becomes `{tool, errorVerbatim}` instead of the bare name.
- Expanded `VOICE_CUES` — each of the four `transactionContext` cues now carries 3 sentences with meaningful, distinct posture (sell-side credibility / buy-side confirmation / value-creation work-plan / unknown balanced-read).

**Client migration**: none. No new args. Existing callers benefit automatically.

**Manifest-hash impact**: unchanged.

**Body-hash impact**: 4 of 5 scenarios re-baselined (interactive unchanged).

**Reference**: [design doc § Tool inclusion gates, § Output structure, § Decisions](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md).

---

## 0.6.0 — 2026-06-03 — BL-045 PR B body rewrite (1/N): wrong-IRL detector pre-flight + (J) gap list + extract-only mode dispatch

**Theme**: with the audit architecture empirically validated across 7 StoreForce runs, BL-045 PR B's remaining work is the design doc's body-rewrite scope. This commit lands the first batch: a structural fill-ratio pre-flight that fires BEFORE any extraction, a (J) gap-list directive emitted in every dossier, and a working `mode: 'extract-only'` dispatch through a new `buildExtractOnlyBody`.

**Surface impact**: **None — additive prompt-body change**. Behavior:

- `mode: 'full'` (default) — unchanged dossier flow, but now leads with the wrong-IRL pre-flight directive (model computes fill ratio; <15% halts, 15-40% partial-flag, ≥40% proceeds) and closes with the (J) gap list before voice/format directives.
- `mode: 'extract-only'` — NEW dispatch path. Emits worksheet + per-tool audited input-payload JSON fences + (J) gap list. NO tool invocations, NO synthesis prose. Use case: audit-trail JSON dump for downstream automation; partner inspection of model extraction before committing to a full sweep; single-section refinement.
- `mode` interactive (no `filledIrl`) — unchanged.

Specific changes:

- NEW `WRONG_IRL_DETECTOR_PREFLIGHT` constant — structural fill-ratio detector with 15%/40% thresholds; emitted at the top of both `buildOneShotBody` (renamed conceptually to `buildFullBody`) and `buildExtractOnlyBody`.
- NEW `GAP_LIST_DIRECTIVE` constant — categorizes gaps the dossier must surface (unknown dimensions, extraction-only fields, elided tools, conditional triggers, currency/annualization assumptions, map-absent regulatory items).
- NEW `buildExtractOnlyBody` function — full extraction discipline + per-tool JSON-fence emission, no tool invocations, no synthesis.
- UPDATED `build()` dispatch — three-way: interactive (no `filledIrl`) / extract-only (`mode: 'extract-only'`) / full (default).
- UPDATED body-hash stability test from 3 scenarios to 5 (interactive + 2× full + 2× extract-only) per design doc § Body rendering strategy.

**Client migration**: none. Callers that didn't supply `mode` continue to get full-mode behavior. The new extract-only mode is opt-in via `mode: 'extract-only'`.

**Manifest-hash impact**: unchanged.

**Reference**: [design doc § Output structure + § Body rendering strategy](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md).

---

## 0.5.1 — 2026-06-02 — BL-045 PR B Phase 2A: TechPar YTD arithmetic-consistency refinement

**Theme**: the StoreForce v6 dossier (post-`0.5.0`) showed `compute_techpar`'s currency + per-field-annualization audit forces declaration but doesn't enforce that the declared period is _correct_. Model declared `ytdMonths: 4` for StoreForce's Apr-2026 board view (assumed calendar-fiscal Jan-Apr); the IRL's recurring-revenue math (`$2.64M CAD/mo × 3 = $7.92M ≈ $7.86M YTD stated`) implies 3 months. Result: TechPar landed at 38.8% "Healthy, just under the 40% PE ceiling" when the math-correct ytdMonths=3 puts it at ~46% "Above zone, every point compresses EBITDA and exit value." A partner-misleading inversion hidden inside one declared field.

**Surface impact**: **ADDITIVE-required** when `annualizationSource: "ytd-annualized-with-period"`. Adds a required `ytdMathCheck` field to the per-monetary-field audit. Callers that already use the default `irl-annualized-stated` source (the partner-supplied path, including `gst_target_quick_look`) are unaffected.

For `compute_techpar`:

- New required field `_audit.{field}.ytdMathCheck` when `annualizationSource: "ytd-annualized-with-period"`:
  - `monthlyAnchorAmount` — the monthly anchor from the IRL the YTD claim should reconcile against (e.g., recurring revenue per month).
  - `monthlyAnchorCitation` — IRL citation for the anchor.
  - `ytdActualReportedAmount` — what the IRL says YTD is.
  - `ytdActualReportedCitation` — IRL citation for the reported YTD.
- New handler refinement: `Math.abs(monthlyAnchor × ytdMonths − ytdActualReported) / ytdActualReported` must be ≤ 10%. Rejection diagnostic includes a hinted `ytdMonths` value that would balance the math.
- For StoreForce: model attempts `ytdMonths: 4` with anchors `$2.64M/mo`, `$7.86M YTD` → handler computes `$10.56M expected vs $7.86M reported, 34% off` → REJECT with hint `ytdMonths = 3 would balance` → model corrects → `$2.64M × 3 = $7.92M ≈ $7.86M, 0.7% off` → ACCEPT → R&D becomes the math-correct $9.68M → TechPar reports ~46% Above zone.

**Client migration**:

- `gst_irl_ingestion` Step 4 body updated — worked StoreForce-shape `_audit` example now includes `ytdMathCheck` showing the IRL anchors that balance the math.
- `gst_target_quick_look` Step 2 body unaffected — `irl-annualized-stated` defaults don't trip the new refinement.
- External consumers using `ytd-annualized-with-period` must add `ytdMathCheck`.

**Manifest-hash impact**: unchanged.

**Closes the structural-math gap**: with `0.5.1`, the same fixture should now produce the same TechPar number across runs because the audit metadata both declares the period AND verifies its arithmetic consistency. Cross-run reproducibility becomes empirically testable on the next StoreForce re-test.

**Residual fabrication risk**: model can still fabricate the `monthlyAnchorAmount` value if the citation isn't grounded in the actual IRL body. Phase 2B (`validate_irl_provenance` tool per spec § M6) addresses this — substring-verifies citations against the IRL body. Tracked as the next escalation if v7 reveals citation truthfulness as the remaining failure mode.

**Reference**: [spec § M6](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md).

---

## 0.5.0 — 2026-06-02 — BL-045 PR B Phase 2: `compute_techpar` audit (currency + per-field annualization)

**Theme**: the StoreForce v5 dossier validated `0.4.0`'s schema enforcement for diligence-agenda + tech-debt — model corrected on first rejection and proceeded with calibrated inputs. But `compute_techpar` was still called with ad-hoc judgments: model converted CAD→USD without declaring a basis, and annualized R&D OpEx from a YTD figure using a different multiplier on each run (v2 ×4 = $9.68M, v3 ×1.2 = $2.9M, v5 ad-hoc = $3.2M — same fixture, three different R&D-as-%-of-ARR readings, swung TechPar zone classification). Per CLAUDE.md § 4a (no deferred tech debt), this is addressed in PR B, not tracked.

**Surface impact**: **BREAKING** for any consumer that called `compute_techpar` with the legacy input shape. The tool now requires a sibling `_audit` field carrying currency-basis declaration + per-monetary-field annualization provenance.

For `compute_techpar`:

- New required field `_audit` (sibling of the engine inputs). See [`mcp-server/src/schemas/techpar-audit.ts`](./src/schemas/techpar-audit.ts).
- `_audit.monetaryBasis`:
  - `currency` (enum: USD / CAD / EUR / GBP / AUD / JPY / CHF / CNY / INR / BRL / MXN / OTHER) — the currency ALL monetary inputs are denominated in. The engine's percentage calculations only make sense within a single currency.
  - `conversionRate` (number, USD rate) — REQUIRED when `currency != USD`. Approximate is fine.
  - `citation` (regex-enforced shape).
- Per-monetary-field audit (`arr`, `infraHostingAnnual`, `infraPersonnel`, `rdOpEx`, `rdCapEx`, plus `engCost`/`prodCost`/`toolingCost` for deepdive mode):
  - `annualizationSource` (enum: `irl-annualized-stated` / `monthly-x12` / `ytd-annualized-with-period` / `estimated-from-headcount` / `estimated-from-anchor`).
  - `ytdMonths` (1-11) — REQUIRED when `annualizationSource = "ytd-annualized-with-period"`. This closes the root cause of cross-run TechPar swings: the model must commit to a YTD period rather than guessing implicitly.
  - `citation` (regex-enforced shape).
- Cross-field refinements run in the handler body (same SDK-shape pattern as 0.4.0). Refinement failures return `isError: true` with structured BL-045 rule citations.
- Tool response payload now includes `monetaryBasis` (currency + conversionRate) so the dossier rendering step can quote dollar figures with explicit currency provenance.

**Client migration**:

- `gst_irl_ingestion` Step 4 body migrated — directs the model to supply a worked StoreForce-shape `_audit` example showing CAD→USD conversion + per-field annualization with `ytdMonths`.
- `gst_target_quick_look` Step 2 body migrated — directs the model to supply Tier-3 partner-supplied defaults (`monetaryBasis.currency: USD`, `annualizationSource: irl-annualized-stated` for fields sourced from form input).
- External consumers calling `compute_techpar` directly must upgrade their payloads.

**Helper**: [`buildPartnerSuppliedTechParAudit(mode)`](./src/schemas/techpar-audit.ts) — Tier-3 audit defaults for non-IRL callers + tests.

**Manifest-hash impact**: unchanged (prompt name@version tuples + URI sets — neither changes here).

**Why now, not later**: empirically, the v5 dossier explicitly noted: _"the 'ahead' (under-band) R&D reading is sensitive to (a) the CAD→USD conversion and (b) whether the YTD R&D figure was correctly annualized"_ — the model was self-aware about the uncertainty but had no enforcement mechanism. Same architectural pattern as 0.4.0 applies. The TechPar swings across runs are exactly the failure mode the audit pattern was designed to close.

**Reference**: [spec](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md), [parent design doc](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md).

---

## 0.4.0 — 2026-06-02 — BL-045 PR B Option A′: tool-schema enforcement of calibration clauses

**Theme**: three rounds of body-level enforcement (v2/v3/v4) failed to make the model apply BL-045's calibration clauses (currency normalization, headcount scope, dataSensitivity bucket boundaries, growthStage Tier discipline, MTTR-OPEN guard). Real-world testing against a client IRL (StoreForce, 2026-06-02) showed the model treats prompt-body directives as descriptive context, not as a procedure to execute. This PR moves enforcement from prompt body to the tool-input-schema layer, where MCP-SDK rejection of malformed payloads forces the model to retry with conformant inputs.

**Surface impact**: **BREAKING** for any consumer that called `generate_diligence_agenda` or `estimate_tech_debt_cost` with the legacy input shape. Both tools now require a sibling `_audit` field carrying per-dimension provenance + calibration metadata.

For `generate_diligence_agenda`:

- New required field `_audit` (sibling of the 13 dimension fields). See [`mcp-server/src/schemas/diligence-audit.ts`](./src/schemas/diligence-audit.ts) — the schema is published in `tools/list` so clients see the full shape.
- Per-dimension entries carry `tier` (1/2/3) + `citation` (regex-enforced shape "Section NN — <≥20 char excerpt>") plus dimension-specific fields:
  - `revenueRange._audit.nativeCurrency` + `currencyConversion`
  - `headcount._audit.scope` (`engineering-only` required for non-`'unknown'` values)
  - `growthStage._audit.velocityEvidence`
  - `dataSensitivity._audit.piiCategoriesPresent`
- Cross-field refinements run in the handler body (not via `.superRefine` — that wrapper breaks MCP-SDK JSON Schema publication). Refinement failures return `{ isError: true }` with structured diagnostics citing the BL-045 rule ID and the corrective action.

For `estimate_tech_debt_cost`:

- New required field `_audit` with `mttrSource` and `incidentsSource` (enum: `irl-stated` / `irl-open` / `irl-absent` / `irl-scope-mismatch`).
- `mttrHours` and `incidents` schema fields become nullable.
- For OPEN-source declarations, the corresponding numeric field MUST be null — placeholder substitution is rejected.
- Tool response now includes `extractionOnly: ['mttrHours', 'incidents']?` so the prompt body can render the section correctly.

**Client migration**:

- All three GST prompt callers (`gst_irl_ingestion`, `gst_diligence_kickoff`, `gst_diligence_handoff_memo`) are migrated in this PR. Their bodies direct the model to supply the audit shape.
- Non-IRL prompt callers populate the audit with Tier-3 defaults (`citation: "Section -- — partner-supplied form input — …"`).
- External consumers calling the tools directly must upgrade their payloads.

**Manifest-hash impact**: unchanged at `84fd0dbd66ea7a78b2de516b0c7f8f7abe5a68eb1f1f99360aaa45145231647e` (prompt `name@version` tuples + URI sets — neither changes here). Tool input schemas changed but they don't contribute to the manifest hash.

**Behavior verification**: see [BL-045 PR B Option A′ spec](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md) for the empirical hypothesis being tested. Re-test against the StoreForce IRL in Claude Desktop expected to show:

- revenueRange = `5-25m` (CAD→USD conversion forced)
- headcount = `1-50` (engineering-only scope forced)
- dataSensitivity = `low` (bucket boundary forced)
- Tech Debt MTTR = field omitted with extractionOnly response (placeholder substitution forced to null)

**Reference**: [spec](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md), [parent design doc](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md), [review packet](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_REVIEW_PACKET.md).

---

## 0.3.16 — 2026-06-01 — BL-045 PR A: extraction-rule constants extracted (no surface change)

**Theme**: BL-045 PR A — pre-implementation refactor for the upcoming `gst_diligence_sweep` → `gst_irl_ingestion` rename + harden initiative. The load-bearing IRL→tool-input rule prose currently fused inline with sweep orchestration at `diligence-sweep.ts:123/127/129/131/133` is extracted into a shared module at [`src/prompts/extraction-rules.ts`](./src/prompts/extraction-rules.ts) exporting six named constants (`UNKNOWN_PROPAGATION_RULE`, `EU_AI_ACT_CONDITIONAL_TRIGGER`, `NIS2_CONDITIONAL_TRIGGER`, `ENG_COST_DEDUP_RULE`, `ICG_SEEDING_RULES`, `MTTR_P1_RULE`). Sweep imports each constant and interpolates them back at the same body positions.

**Surface impact**: **None — internal refactor.** The rendered prompt body is character-identical pre- and post-refactor (verified by the existing `diligence-sweep-body-hash-stability` integration test: all three scenario hashes unchanged). All 29 existing unit tests pass without modification; a new constant-presence test (test #30) locks the single-source-of-truth invariant. `gst_diligence_sweep` prompt version stays at `0.0.5`; no change to `argsSchema`, `orchestrates`, or `description`.

**Client impact**: None.

**Manifest-hash impact**: Unchanged at `4941f4bface7f2cddf28ed7abe34912a14f5072d8d3ce7595e9d721c1a7edb9a` (prompt `name@version` tuple unchanged; Library/Regulation/Radar URI sets unchanged).

**Why this is its own PR**: per BL-045's design doc, the refactor lands first so PR B (the rename + behavior expansion) starts from a clean shared-constants foundation. Future ingestion-style prompts (the renamed sweep, any subsequent BL-04N sibling) import the same constants — no duplication.

**Reference**: [BL-045 design doc](../src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) § Pre-implementation refactor.

---

## 0.3.15 — 2026-05-31 — BL-036 Tier 3: `gst_vdr_audit` Prompt retired

**Theme**: BL-036 Tier 3 retires the `gst_vdr_audit` Prompt entirely. Tier 1 (folder-name input) shipped May 2026; Tiers 2-6 (file-contents enhancements and downstream maturity) are canceled — operator assessment 2026-05-31 determined the capability's business value insufficient to justify continued maintenance or further investment in the contents-grounded improvements originally scoped.

**Surface impact**: **BREAKING** for any consumer that invokes `gst_vdr_audit` directly. The Prompt is removed from the registry; an MCP `prompts/get` for `gst_vdr_audit` returns "prompt not found." `prompts/list` returns 9 prompts instead of 10.

**Mitigation**: no successor. The Library Resource `gst://library/vdr-structure` remains (still used by `gst_diligence_kickoff`, `gst_diligence_handoff_memo`, and `gst_diligence_sweep`), so any consumer that wants the canonical VDR taxonomy can still embed the article directly or invoke one of those prompts.

**Manifest-hash impact**: hash changes from `b702aa38…` to `4941f4bf…` (9 prompts post-retirement, was 10). Library/Regulation/Radar URI sets unchanged. Updated in `tests/integration/manifest-stability.test.ts` and the "Current manifest hash" section above.

**Reference**: [BACKLOG.md § BL-036](../src/docs/development/BACKLOG.md#bl-036), [design doc](../src/docs/development/MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md) (retained with closure banner — preserves the original tier sketches as institutional reference for any future contributor considering a similar surface).

---

## 0.3.14 — 2026-05-31 — BL-038: `Limiter.check()` signature widening (internal-only)

**Theme**: BL-038 ships the radar-tier rate limit (5/min, 50/day) by widening `Limiter.check(keyOwner)` to `Limiter.check(keyOwner, toolClass: 'general' | 'radar')`. `CheckResult.tier` widens from `'minute' | 'day'` to `'minute' | 'day' | 'radar-minute' | 'radar-day'`. 429 envelope adds a new top-level `reason` field via `reasonForTier(tier)`; existing fields preserved.

**Surface impact**: **None — internal only.** Limiter is consumed only by the Worker `fetch` handler at the single call site `worker.ts:482`. No MCP-protocol surface changes; no Tool/Prompt/Resource registry shape changes. Manifest-hash unchanged (`b702aa38df95e959bbf6f9f8ffac27460f0bbb7e3511c4253eb1781692d1a84d`).

**Client impact**: 429 response bodies gain a new top-level `reason` field. Existing consumers reading `tier`, `limit`, `retryAfterSeconds`, `message`, or `error` are unaffected — additive change.

**Behavior change visible to operators**: radar tools (`search_radar`, `get_latest_insights`) now consume from `mcp:ratelimit:radar:{min,day}` Upstash keys in addition to the existing `mcp:ratelimit:gen:{min,day}` keys. A key making 6+ radar calls in <60s will see a 429 with `reason: 'radar-rate-limit-per-minute'` while general-tool calls continue to flow against the unchanged 60/min general budget.

**Reference**: [BL-038 design doc](../src/docs/development/MCP_SERVER_RATE_LIMIT_TIER_BL-038.md); [BACKLOG.md BL-038](../src/docs/development/BACKLOG.md#bl-038-mcp-server--radar-rate-limit-tier-5min-50day).

---

## 0.3.13 — 2026-05-25 — scheduled handler: outer catch around Sentry plumbing (Cloudflare `outcome:exception` regression)

**Theme**: 0.3.12 added a `catch` for `refreshRadarSnapshot` rejections, but `await flushSentry()` in the `finally` block and the Sentry SDK internals invoked by `withMonitor` were still unguarded. When a flush rejected (Sentry ingest network blip, quota, internal SDK error) or `withMonitor`'s check-in HTTP traffic threw, the exception escaped the IIFE → `ctx.waitUntil` rejected → Cloudflare reported `outcome:exception` even on firings where the radar work succeeded.

**Evidence**: 2026-05-25 18:00 UTC firing post-0.3.12-deploy. `/health.inoreaderObservedAt` updated cleanly (cron succeeded end-to-end on the radar side), but Cloudflare's cron dashboard still reported Error. Same pattern persisted across every firing since May 19 — the 0.3.12 fix moved the throw point inside the Sentry stack but didn't close the Cloudflare-visibility gap.

**Fix**: belt-and-suspenders outer try/catch around the entire IIFE body in `worker.ts:scheduled`. Inner try/catch/finally still does the useful capture-and-flush work on the happy and partial-failure paths; the outer catch is a last-resort drop that ensures `ctx.waitUntil` resolves cleanly regardless of which sub-system fails. Two new regression tests in `tests/unit/worker-scheduled.test.ts` simulate `flushSentry` rejection and `captureException` throw — both must leave `Promise.all(waitUntilPromises)` resolved.

**Not a behavior change for the happy path**: when Sentry is reachable and operating normally, captures still fire, flushes still complete, no observable change. The fix only affects the failure modes where the SDK itself misbehaves.

---

## 0.3.12 — 2026-05-25 — scheduled handler: add missing `catch` + wrap in `Sentry.withMonitor` (cron failures now visible in Sentry)

**Theme**: production showed 13 cron `outcome: exception` events on the Cloudflare dashboard in 24h while Sentry's Issues view showed zero corresponding events. Root cause: the scheduled handler's payload was `try { await refreshRadarSnapshot(env); } finally { await flushSentry(); }` — **no `catch` clause**. Exceptions escaped `ctx.waitUntil`'s promise without ever being captured by Sentry; `flushSentry` ran on an empty queue. `withSentry`'s auto-capture is anchored on the fetch handler's Response — scheduled handlers in `ctx.waitUntil` aren't covered.

### Changed

- **`worker.ts` scheduled handler** rewritten to mirror Sentry's reference `instrumentCron` pattern:
  1. **`Sentry.withMonitor('radar-refresh', () => refreshRadarSnapshot(env), { schedule, … })`** — sends `in_progress` / `ok` / `error` check-ins to Sentry Crons. Auto-creates the monitor on first check-in via `upsertMonitorConfig`. Enables missed-firing alerts on the Sentry Crons dashboard.
  2. **Outer `try/catch`** — `withMonitor` re-throws on callback rejection (only marks the check-in; does NOT call `captureException` itself). The catch calls `captureException` for the stack trace, then swallows so `ctx.waitUntil` resolves cleanly.
  3. **`finally { await flushSentry() }`** — unchanged from the prior shape; documented in the original 4680028 commit (BL-032.8 Phase B soak Day 3).
- **`observability/sentry.ts`** — re-exports `withMonitor` from `@sentry/cloudflare` with a docstring explaining the re-throw contract and the three-layer pattern the scheduled handler relies on. Future cron handlers should follow the same shape.
- **`worker.ts`** now also exports `handler` as a named export so the scheduled-handler error path is directly testable. The default export (`withSentry(sentryOptions, handler)`) is unchanged.

### Tests

New regression suite at `mcp-server/tests/unit/worker-scheduled.test.ts` (6 cases) explicitly exercises:

- `captureException` is called with the rejection AND the `{ source: 'cron.scheduled', cron }` context
- `flushSentry` is always called (success + failure paths)
- No `captureException` on the success path (no double-reporting)
- No `captureException` when `refreshRadarSnapshot` returns a non-error envelope (e.g. `partial-both-failed`) — that path is already captured by the inner `captureMessage` call
- `withMonitor` is invoked with the runtime `event.cron` (not a hardcoded constant), so a `wrangler.toml` schedule edit doesn't desync from Sentry's monitor config
- **Load-bearing assertion**: `Promise.all(ctx.waitUntil promises).resolves` — if a future regression removes the catch, this test fails loudly because the IIFE's promise rejects.

**Coverage gap closed**: prior to this commit, zero tests exercised `worker.ts`'s scheduled handler. The cron-handler suite (`tests/unit/cron/radar-refresh.test.ts`) covers `refreshRadarSnapshot` in isolation; it never asked "what does the worker do if `refreshRadarSnapshot` rejects?" That gap is why the 2026-05-25 incident wasn't caught by CI.

### Why patch and not minor

Bug fix to a tooling code path that was silently failing. No tool / prompt / URI surface change. No new dependencies. Operationally identical for any caller that doesn't read Sentry — the only behavior change is that Sentry now sees what Cloudflare's dashboard was reporting.

**Operator semantics**: patch bump per the discipline. The first cron firing after deploy will auto-create the `radar-refresh` monitor on Sentry's Crons dashboard (Sentry Crons is available on all plans including Free, with a monthly check-in quota; the 4/day cadence is well within limits).

**Architecture context**: 2026-05-25 incident RCA. Impartial-agent review confirmed the diagnosis and recommended `withMonitor` as the proper structural fix (vs. the interim "just add a catch" patch I'd initially considered) since it bundles the catch + the Sentry Crons check-in + missed-firing alerts in one wrapper designed for the scheduled-handler shape. The 4680028 commit (BL-032.8 Phase B soak Day 3) explicitly flagged this approach as "strictly better long-term shape" and punted; this incident is the trigger that took it off the punt list.

---

## 0.3.11 — 2026-05-25 — stdio binary `createRequire` banner shim (unblocks `xlsx-js-style` runtime startup)

**Theme**: surfaced by CI on PR #162 (2026-05-25). The "Smoke test compiled binary" step (`node mcp-server/dist/index.js < /dev/null`) failed with:

```
Error: Dynamic require of "stream" is not supported
  at make_xlsx_lib (.../mcp-server/dist/index.js:...)
  at xlsx-js-style/dist/xlsx.min.js (.../mcp-server/dist/index.js:...)
```

`xlsx-js-style` does `require('stream')` at module-load time. esbuild's default ESM emit replaces dynamic `require()` calls inside bundled CJS deps with a stub that throws at runtime. The unit + integration tests passed locally because Vitest imports the source directly (no bundle); the smoke test catches what the test suite misses.

### Changed

- **`mcp-server/build.mjs`** — esbuild `banner.js` now injects a CJS-style `require` shim via `createRequire(import.meta.url)`. The bundled CJS deps' dynamic require calls resolve through Node's built-in module resolver. Canonical esbuild ESM-with-CJS-deps pattern.
- **No code changes** — build-config only. Source files, tests, and runtime contracts are unchanged.

### Why patch and not minor

Build-config fix to a bug introduced in 0.3.7 (the `xlsx-js-style` swap). The deployed Worker binary is unaffected (wrangler uses its own bundler; staging `0.3.10` deploy worked fine — this is stdio-only). Tool/prompt/URI surfaces unchanged.

### Test impact

`node mcp-server/dist/index.js < /dev/null` now exits 0 with `[gst-mcp] connected on stdio`. The CI "Smoke test compiled binary" step will pass on re-run.

**Operator semantics**: patch bump per the discipline. Stdio binary correctness fix; no runtime API change.

**Architecture context**: BL-044 PR #162 CI failure. 0.3.7 introduced `xlsx-js-style`; 0.3.11 fixes the build emit to support its CJS-style dynamic requires.

---

## 0.3.10 — 2026-05-25 — `generate_information_request_list_xlsx` deeplink encodes args (Hub form pre-fills on landing)

**Theme**: 0.3.9 had the tool emit a static URL to the Hub page. User feedback (2026-05-25): "the hyperlink doesn't add any value — it does not reflect the input arguments to the tool at all, it simply links to it. A user could go directly there, instead." Correct critique — the MCP path delivered zero value over a bookmark. This release aligns the IRL generator with the deeplink pattern every other Hub tool already uses (TechPar, ICG, Tech Debt, Diligence Machine, Regulatory Map, Radar all serialize args into URL query params).

### Changed

- **`generate_information_request_list_xlsx`**: the Hub URL in the tool's text summary now encodes `?target=<name>&context=<ctx>` when those args are supplied. Empty args produce a clean URL with no query string (universal landing).
- **Hub page** (`/hub/tools/information-request-list-generator/`): added URL-query-param hydration on mount. `?target=...` pre-fills the target name input; `?context=...` selects the matching radio (defensive — unknown values fall through to the "Unspecified" default). One-click landing reproduces the same file the MCP path would have generated.

### Why this matters for the MCP value-add

Without arg-passing, the MCP path was "type prompt args → read text → click link → re-enter the same args on the Hub page → download." With it: "type prompt args → read text → click link → already filled → download." The friction reduction is what makes the MCP path's existence worth justifying over a bookmark.

This is the same deeplink pattern from BL-031.95 (other Hub tools); the IRL generator was the outlier with a static URL.

### Test impact

- `generate-information-request-list-xlsx.test.ts`: two new regression tests asserting (a) the deeplink encodes `target` + `context` query params when args supplied, (b) the URL is clean (no query string) when no args. Locks the contract so a future accidental revert can't silently break the MCP value prop.
- `hub-tools-irl-generator.test.ts` (E2E): two new tests asserting (a) the form pre-fills from URL params, (b) unknown context values are defensively ignored (form falls back to default).

**Operator semantics**: patch bump per the discipline (text content change on tool output + Hub page hydration — no surface-area change). No manifest hash drift (prompt versions unchanged; tool name + schema + structuredContent shape unchanged).

**Architecture context**: BL-044 post-staging-feedback polish. The 0.3.8 → 0.3.9 → 0.3.10 trio is one logical arc: 0.3.8 tried the canonical resource-block pattern, 0.3.9 reverted after Claude Desktop's renderer limitation was confirmed, 0.3.10 invests in the Hub-page-as-canonical-download-surface story by closing the arg-passing gap that made the redirect feel valueless.

---

## 0.3.9 — 2026-05-25 — `generate_information_request_list_xlsx` reverts the `resource` content block; `gst_information_request_list` v0.0.3 → v0.0.4 redirects to the Hub page

**Theme**: 0.3.8 added a `resource` content block carrying the .xlsx as a blob — the canonical MCP "tool produced a binary" pattern. Staging round-trip test (2026-05-25) confirmed Claude Desktop's tool-result renderer **routes `resource` content blocks by mimeType prefix** (`image/*` → image renderer, anything else → red "unsupported format" error block). The blob was correctly delivered on the wire; Claude Desktop just refused to render anything that wasn't an image.

### Changed

- **Tool response shape**: `generate_information_request_list_xlsx` reverts to a single text content block (no resource block). `structuredContent` retained verbatim — programmatic API consumers that read `.base64` continue to work. The text summary now includes the Hub page URL (`/hub/tools/information-request-list-generator/`) so the model can direct users to the canonical download surface.
- **Prompt body**: `gst_information_request_list` bumped `0.0.3 → 0.0.4`. Step 4 of the one-shot body updated:
  - **DOES** still call `generate_information_request_list_xlsx` (the tool returns useful `structuredContent` — filename, counts — that the model uses in its reply).
  - **DOES NOT** promise an attachment in chat (the previous "attach the file to your reply" directive was unfulfillable in Claude Desktop).
  - **DOES** explicitly redirect the partner to `https://globalstrategic.tech/hub/tools/information-request-list-generator/` for the actual download. The Hub page runs the same generator client-side with the same target/context personalization.
- **Description**: clarified that the prompt "directs the partner to the Hub page" rather than "emits a downloadable fillable .xlsx".

### Why patch and not major

The tool's input schema, name, registered orchestrates list, and `structuredContent` shape are unchanged. The only externally-visible change is the removal of a content block that Claude Desktop rejected anyway — the surface that worked still works, the surface that errored is gone. No client breakage.

### Test impact

- `generate-information-request-list-xlsx.test.ts`: removed the two regression tests asserting the resource block + base64 blob (they validated a contract that's no longer the right pattern). Replaced with one test asserting the text summary contains the Hub page URL.
- `information-request-list.test.ts`: version assertion bumped `0.0.3 → 0.0.4`; the "one-shot body calls the XLSX tool" test extended to also assert the Hub page URL appears AND the "do not promise an attachment" directive appears literally in the body.
- Manifest hash recomputed.

### Follow-up — BL-046 candidate (file-delivery surface for Claude Desktop)

Proper file-delivery in Claude Desktop requires one of:

1. Claude Desktop renderer support for arbitrary-mimeType `resource` content (waiting on client maturity)
2. `resource_link` + ephemeral Worker-hosted Resources (~4-6 hours: KV/R2 storage, per-call resource registration, TTL, resources/read handler integration)
3. Signed HTTP download URL on the Worker (~3-4 hours: KV cache, route, expiry, signature scheme)

Filing as BL-046 when prioritized. Until then, the Hub page is the canonical download surface and the tool's text summary names it explicitly.

**Operator semantics**: patch bump per the discipline (response-shape revert + prompt patch — no surface-area change). Pinned MCP conversations resolve everything identically; the only behavior change is that the model now correctly directs users to a working download path instead of an unfulfillable attachment.

**Architecture context**: BL-044 staging round-trip test (2026-05-25). The 0.3.8 → 0.3.9 pair is one logical fix arc: 0.3.8 attempted the canonical MCP pattern; 0.3.9 reverts to an honest Claude-Desktop-compatible shape after the renderer limitation was confirmed empirically.

---

## 0.3.8 — 2026-05-25 — `generate_information_request_list_xlsx` emits a `resource` content block (Claude Desktop download surface)

**Theme**: the previous response shape returned the .xlsx only in `structuredContent.base64` — a metadata field the model reasons about but Claude Desktop doesn't render as a downloadable attachment. Live exercise on staging (2026-05-25) confirmed: the model successfully called the tool, wrote a confirmation paragraph, but the user got no clickable file. The base64 was on the wire; the client just had no UI hook to surface it.

### Changed

- **Tool response shape**: `generate_information_request_list_xlsx` now returns `content[]` with TWO blocks instead of one:
  - `content[0]`: existing text summary (unchanged — "Generated IRL workbook for X (N sections, M requests). Filename: ..."`).
  - `content[1]`: **new** `resource` content block with `uri: gst://generated/irl/<filename>`, `mimeType: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `blob: <base64>`. This is the canonical MCP "tool produced a binary file" pattern; Claude Desktop / Cursor / other MCP clients render it as a downloadable attachment.
- **`structuredContent` retained verbatim**: `{ filename, base64, mimeType, byteLength, sectionCount, bulletCount, canonicalUrl }`. API clients that piped the base64 from `structuredContent.base64` continue to work; no integration break.

### Why patch and not minor

Additive: existing `content[0]` text and `structuredContent` shape are unchanged. Old callers that read either path see no difference. New callers (Claude Desktop UI rendering) gain the file-download affordance. No removed names, no renamed fields, no schema changes.

### Test impact

`generate-information-request-list-xlsx.test.ts` adds one regression test asserting the resource block is present, the MIME type matches, the URI follows the `gst://generated/irl/<filename>` pattern, and the blob decodes to a workbook with ZIP magic bytes `PK\x03\x04` at offset 0. The pre-existing structuredContent shape tests are unchanged and continue to pass — proving the additive nature of the change.

**Operator semantics**: patch bump per the discipline (response-shape addition with no surface-area change → patch). Pinned MCP conversations continue to resolve the tool identically; the only behavior change is that Claude Desktop users now actually get the file.

**Architecture context**: BL-044 staging round-trip test (2026-05-25) — first invocation of the v0.0.3 prompt in Claude Desktop surfaced the missing-attachment bug. Fix is in-scope for BL-044 since the prompt's Step 4 directive promises "attach the file to your reply" — without the resource content block, that promise was unfulfillable.

---

## 0.3.7 — 2026-05-25 — XLSX library swap (`@e965/xlsx` → `xlsx-js-style`) for cell-style write support

**Theme**: the generated IRL `.xlsx` workbook needs visible bold + larger-font styling on column headers and section header rows for readability. `@e965/xlsx` (SheetJS Community auto-republish) silently drops `cell.s.font` on write — the styling logic in our code was being applied to a no-op write path, so Excel rendered everything as plain text.

### Changed

- **Runtime dependency**: `@e965/xlsx@^0.20.3` removed; `xlsx-js-style@^1.2.0` added in both `mcp-server/package.json` and root `package.json`. Drop-in API replacement (same `XLSX.utils.aoa_to_sheet`, same `XLSX.write` shape, same return types).
- **Generated workbook bytes change**: the binary output of `generate_information_request_list_xlsx` now includes a non-empty `xl/styles.xml` with real `<font><b/></font>` and `<sz val="13"/>` entries. Excel / Google Sheets / LibreOffice render bold column headers and bold section header rows accordingly.
- **No tool / prompt / URI surface change**: tool name, input schema, output shape (`{ filename, base64, mimeType, byteLength, sectionCount, bulletCount, canonicalUrl }`), and prompt versions are all unchanged. Pinned conversations continue to resolve the prompt + tool identically.

### Test impact

The `xlsx-js-style` READ path strips style metadata back to a partial shape, so style verification cannot use the round-trip-read pattern. The unit test (`generate-irl-xlsx.test.ts`) now unzips the generated `.xlsx` (small inline ZIP walker) and inspects `xl/styles.xml` directly. This proves the bytes shipped to Excel actually carry the styling, regardless of the library's read-side behavior.

**Operator semantics**: patch-style bump (runtime behavior change without surface-area change → patch bump per the discipline). Pinned conversations continue to resolve everything identically; the only behavior change is the visual styling Excel applies on open.

**Architecture context**: BL-044 post-merge polish (live screenshot 2026-05-25 surfaced the styling no-op). Library-choice rationale + Workers-compatibility verification documented in [`MCP_SERVER_IRL_GENERATOR_BL-044.md` § "Library choice"](../src/docs/development/MCP_SERVER_IRL_GENERATOR_BL-044.md#library-choice--xlsx-js-style).

---

## 0.3.6 — 2026-05-24 — `gst_information_request_list` v0.0.3 + `gst_diligence_sweep` v0.0.5 voice-cue accuracy patch

**Theme**: tighten the `transactionContext`-driven voice cues in both prompts. Two specific inaccuracies and one alignment with the BL-044 UI label change.

### Changed

- **`gst_information_request_list` bumped `0.0.2 → 0.0.3`** (same name, patch — body change only, behavior unchanged):
  - `VOICE_CUES['buy-side']`: removed "GST is underwriting this transaction" (GST supports a buyer's evaluation; does not underwrite) AND "before the LOI" (buy-side engagements can be pre-LOI OR LOI-stage). New text frames GST's role as "supporting your evaluation" and explicitly notes "(whether pre-LOI or LOI-stage)".
  - `VOICE_CUES['value-creation']`: removed the "post-close" qualifier on GST's role to align with the BL-044 UI label change from "Post-close value creation" → "Value Creation". The "100-day roadmap" terminology (industry-standard) is retained without explicit "post-close" framing of GST's involvement.
- **`gst_diligence_sweep` bumped `0.0.4 → 0.0.5`** (same name, patch — body change only): the same two voice-cue edits applied to its `VOICE_CUES` map. The dossier-output hash for the `one-shot full` scenario shifted as a result; the interactive + one-shot-minimal hashes are unchanged (they don't reference voice cues).

**Operator semantics**: patch bumps per the discipline (body changes that steer model output → patch bump). Pinned conversations continue to resolve both prompts to the (now-newer) versions; no schema changes; no behavior changes to the artifact structure or sweep coverage.

**Architecture context**: voice-cue accuracy is partner-facing brand integrity — the previous "underwriting" framing materially miscast GST's role in buy-side engagements, and the "post-close" qualifier created label drift after the BL-044 "Value Creation" UI cleanup. Caught during BL-044 post-merge cleanup review.

---

## 0.3.5 — 2026-05-24 — `gst_information_request_list` v0.0.2 + `generate_information_request_list_xlsx` tool (BL-044)

**Theme**: close the IRL request → response loop by shipping a fillable `.xlsx` generator. The recipient now has an obvious structured response surface (one row per request, with an empty answer cell beside) instead of having to invent a response format from the markdown article.

### Added

- **Tool**: `generate_information_request_list_xlsx` — pure-function pipeline (library load → markdown parse → XLSX render → base64). Returns `{ filename, base64, mimeType, byteLength, sectionCount, bulletCount, canonicalUrl }`. Reads from the same `gst://library/information-request-list` Resource the prompt embeds, so the partner-facing text and the partner-facing file stay byte-identical. The new tool name was added to `KNOWN_TOOL_NAMES` in [`tests/integration/prompts-registry.test.ts`](./tests/integration/prompts-registry.test.ts).

### Changed

- **Prompt body**: `gst_information_request_list` bumped `0.0.1 → 0.0.2`. Additive behavior: when **any** arg is supplied, the one-shot body now instructs the model to also call `generate_information_request_list_xlsx` so the partner receives a downloadable workbook alongside the paste-ready text. Bare invocation (interactive mode) is unchanged — still emits text-only. `orchestrates` extended from `[RESOURCE_URI]` to `[RESOURCE_URI, 'generate_information_request_list_xlsx']`.
- **Description**: clarified that the prompt now generates a downloadable file when called with args; pairing with `gst_diligence_kickoff` is unchanged.

### Dependencies

- Added `@e965/xlsx@^0.20.3` to `mcp-server/package.json` — community-maintained auto-republish of SheetJS, pure JS, Workers + Node + browser compatible, zero runtime deps. Avoids the stale + CVE-laden `xlsx` npm package and the Node-only `exceljs`. Verified compatible with the Cloudflare Workers runtime — no `nodejs_compat` flag needed, no `Buffer` polyfill required (uses `type: 'array'` output + chunked `btoa` for base64).

**Operator semantics**: minor bump per the discipline (additive tool + additive prompt behavior + new dependency → `0.3.4 → 0.3.5` minor, NOT major; pinned conversations resolve `gst_information_request_list` to the newer prompt with the additive file-attachment behavior; no removed names; no schema changes to existing tools).

**Architecture context**: [BL-044 in BACKLOG.md](../src/docs/development/BACKLOG.md#bl-044-information-request-list--fillable-form-generator). Tracking doc at [`src/docs/development/MCP_SERVER_IRL_GENERATOR_BL-044.md`](../src/docs/development/MCP_SERVER_IRL_GENERATOR_BL-044.md) (added in this release).

---

## 0.3.4 — 2026-05-22 — `gst_diligence_sweep` v0.0.4 body refinements (post-demo audit)

**Theme**: close five accuracy gaps surfaced by a 4-agent parallel audit of the post-demo Scenario 7 sweep output. The v0.0.3 patches landed but the model still produced material errors on three of the four tool surfaces (TechPar engCost partial-dedup, Tech Debt MTTR-not-P1, ICG under-seeding + q5_3 over-credit, Diligence Wizard sentinel-discipline regression on bm and om, NIS2 coverage gap).

### Changed

- **Prompt body**: `gst_diligence_sweep` bumped `0.0.3 → 0.0.4`. Five body refinements, each targeted at a specific failure mode observed in the post-demo live exercise:
  1. **Step 1 — Sentinel-discipline anti-examples for `businessModel` and `operatingModel`**: v0.0.3 had the model fill `bm=productized-platform` (forbidden inference from `b2b-saas`; the IRL said "per-claim transactional uplift" which signals usage-based) and `om=product-aligned-teams` (forbidden — "squad model" is a colloquialism, not a literal one-to-one enum mapping; the tool's USAGE RULE explicitly says "do NOT infer operatingModel from anything"). v0.0.4 names these two canonical forbidden patterns explicitly, plus calls out that `transformationState: actively-modernizing` IS a literal mapping when the IRL names an in-flight rewrite (closes the v0.0.3 over-conservatism on that dimension).

  2. **Step 3 — NIS2 conditional alongside the existing EU AI Act conditional**: when Section 00 includes EU geography AND Section 01 names a regulated sector covered by NIS2 Annex I/II (healthcare among them), the sweep now adds an NIS2 search. The audit found NIS2 absent from the post-demo dossier despite MedSig serving EU healthcare — same gap-fill pattern as the EU AI Act conditional, just for cybersecurity.

  3. **Step 4 — TechPar engCost dedup with worked math example**: v0.0.3 added dedup guidance but the model still partially mis-applied it ($12.76M = 55 × salary, having subtracted 3 security engineers instead of the 8 SRE that belong in `infraPersonnel`). v0.0.4 spells out the math with an explicit example matching the IRL fixture's wording: "58 total — 38 product + 8 SRE + 3 security + 7 data + 2 platform DX → infraPersonnel = 8 × salary; engCost = (58 − 8) × salary = 50 × salary. Do NOT subtract security, data, or DX."

  4. **Step 5 — ICG seeding-signal mapping table + tenure caveat for `q5_3`**: v0.0.3 was directionally clean but produced a 2/100 Reactive score where ~26-30/100 Aware was defensible. The engine penalizes `-1` ("Not sure") more harshly than `0` ("Not in place"), so over-conservatism is mechanically worse than calibrated seeding. v0.0.4 includes a short signal → seed-level mapping table (IaC + per-service Datadog → `q1_1` tagging at 2; named FinOps lead + monthly spend tracking → `q1_2` + `q1_3` at 2; multi-region with isolation + gated staging → `q2_1` at 2; production serverless / managed-ML → `q5_2` at 2). Plus an explicit tenure caveat: a hired-and-named FinOps lead is `q5_3` level 2 (Established), NOT level 3 (Strategic) — level 3 requires evidence of a _practice_ (wins shipped, architectural influence) that a `<12-month` hire typically does not yet exhibit.

  5. **Step 6 — Tech Debt MTTR explicit P1 guidance**: v0.0.3 didn't specify which MTTR to use when the IRL lists P0 and P1 separately. The post-demo run used `mttr=3` (midway between P0=2.4h and P1=7.8h), understating the carrying-cost calc by ~62% on its linear component. v0.0.4 hard-codes: "Use P1 (the workhorse number). Do NOT use P0, do NOT use a midpoint, do NOT use an average." Also tightens the incidents-per-month guidance to use the most-recent quarter's monthly equivalent (avoiding the round-up to 2/month when the IRL trends down to ~1.3/month).

**Operator semantics**: patch bump per the discipline (prompt `version` field bump with same name → patch). Behavior change without surface-area change; pinned conversations continue to resolve `gst_diligence_sweep` to the (now-newer) prompt.

**Architecture context**: Findings from a 4-agent parallel audit of the post-demo Scenario 7 sweep output, with full audit transcripts retained in conversation context. The audit identified that the v0.0.3 dedup, deeplink, and sentinel-discipline patches partially landed but with three material residual errors; v0.0.4 closes the residuals. [BL-032.6 demo Scenario 7](../src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7).

---

## 0.3.3 — 2026-05-22 — `compute_techpar` deeplink emits `b=annual` (wizard hydration fix)

**Theme**: fix the TechPar wizard hydrating MCP-generated deeplinks at ~7× the correct `totalTechPct` due to a missing URL-state flag.

### Changed

- **Tool**: `compute_techpar` deeplink now includes `b=annual` as a URL param. Behavior change to the tool's response shape (`deeplink` field); no schema change.

**Why**: BL-031.95 standardized the TechPar tool API on annual units — the `infraHostingAnnual` field carries an annual value, and `serializeToParams` writes it to URL key `h` as-is. The website's TechPar wizard, however, has two infra-cost-period modes (monthly / annual) and **defaults `infraPeriod` to `'monthly'`** ([`src/utils/techpar/state.ts:35`](../src/utils/techpar/state.ts#L35)). In monthly mode, the wizard's `buildInputs()` multiplies the field's DOM value by 12 before sending to the engine ([`src/utils/techpar/dom.ts:569`](../src/utils/techpar/dom.ts#L569)). The wizard's own URL writer sets `b=annual` only when the user has manually toggled to annual mode ([`src/utils/techpar/dom.ts:597`](../src/utils/techpar/dom.ts#L597)); the MCP-side `buildTechparDeeplink` was not setting `b` at all.

Effect on partner experience: clicking the "Open TechPar Wizard" link from the `gst_diligence_sweep` dossier loaded a wizard view that **multiplied the already-annualized hosting figure by 12**, producing a wildly-inflated total tech / ARR ratio (live finding 2026-05-22: a healthcare-RCM target at $23.4M annual hosting / $45.2M ARR restored as **655.6% vs the correct 92.4%**).

Fix: one-line addition in [`buildTechparDeeplink`](./src/tools/techpar.ts#L26) — `params.set('b', 'annual')` after the existing `serializeToParams` call. Preserves the wizard's existing in-wizard URL-writing behavior; aligns the MCP-side deeplink with the unit convention the tool already uses internally.

**Operator semantics**: patch bump per the discipline (tool response-shape change with no name/schema change → patch bump). Pinned conversations continue to resolve `compute_techpar` identically; the only behavior change is one URL param appended to the `deeplink` field.

**Architecture context**: [BL-032.6 demo Scenario 7](../src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7) — surfaced when the post-demo TechPar wizard click-through showed implausible numbers.

---

## 0.3.2 — 2026-05-22 — `gst_diligence_sweep` v0.0.3 body refinements (second live-exercise + post-demo)

**Theme**: close the two findings from the second live exercise that the v0.0.2 deploy didn't fix at the prompt-body level. Both fixes were held until after the BL-032.6 demo to keep the deployed contract stable; demo ran clean; shipping the patches now.

### Changed

- **Prompt body**: `gst_diligence_sweep` bumped `0.0.2 → 0.0.3`. Two body refinements:
  - **Deeplink directive verb strengthened**: Steps 3-7 now use `Surface ... in the dossier` (output verb) instead of `Capture ...` (working-memory verb). The v0.0.2 live exercise showed the model honored "Surface" (sections B Agenda + G Comparables — using v0.0.1 phrasing) but silently dropped "Capture" for the new v0.0.2-added directives (sections C TechPar / D ICG / E Tech Debt / F Regulatory / H Radar) — leaving 5/7 sections without their Open-in-Hub link. v0.0.3 mirrors the v0.0.1 phrasing literally across all five new directives. Step 8's section descriptions (C/D/E/F/G/H) also hoist the `**MUST close with [Open X Wizard](deeplink)** — this is non-optional` directive to the **first sentence** so the model attends to it before the freeform-writing guidance.
  - **TechPar engCost / infraPersonnel dedup guard**: Step 4 now carries explicit guidance: `engCost` covers R&D engineering headcount NOT also booked as infra personnel. The v0.0.2 live exercise had the model pass all 58 engineers into `engCost` AND 8 SRE into `infraPersonnel`, double-counting the SRE headcount (once in synthesized R&D OpEx, once standalone) and inflating total tech / ARR by ~4 points (92.4% reported vs ~88% corrected). v0.0.3 explicitly instructs the partition (e.g., "58 total — 38 product + 8 SRE + 3 security + 7 data + 2 platform DX" → 8 in `infraPersonnel`, remaining 50 in `engCost`).

**Operator semantics**: patch bump per the discipline (prompt `version` field bump with same name → patch). Behavior change without surface-area change; pinned conversations continue to resolve `gst_diligence_sweep` to the (now-newer) prompt.

**Architecture context**: live-exercise findings captured in [`mcp-server/tests/examples/diligence-sweep.golden.md`](./tests/examples/diligence-sweep.golden.md) § v0.0.3 candidate patches (now shipped). [BL-032.6 demo Scenario 7](../src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7) demo invocation directive (`Surface each GST Hub Tool deeplink at the close of its corresponding section`) was the front-line workaround that masked the deeplink regression during the demo; v0.0.3 makes that workaround unnecessary at the prompt-body level.

---

## 0.3.1 — 2026-05-22 — `gst_diligence_sweep` v0.0.2 body refinements (live-exercise driven)

**Theme**: sharpen the sweep prompt body based on live-exercise findings against the MedSig populated-IRL fixture.

### Changed

- **Prompt body**: `gst_diligence_sweep` bumped `0.0.1 → 0.0.2`. Three body refinements:
  - **Portfolio-facet literalness** (Step 2): the model now uses theme / industry names returned by `list_portfolio_facets` verbatim — the live exercise surfaced a retry where the model guessed `Healthcare Tech` when the canonical theme is `Healthcare`.
  - **EU AI Act conditional** (Step 3): when Section 05 names production ML/AI AND Section 00 geographies include the EU, add an EU AI Act `search_regulations` call (healthcare-domain decision-support ML typically classifies as Annex III high-risk; the IRL itself is often silent on this exposure).
  - **Deeplink coverage across every section** (Steps 3-7 + dossier sections C/D/E/F/H): v0.0.1 only surfaced the "Open in Hub" deeplink for sections (B) Agenda and (G) Comparables. v0.0.2 wires the deeplink from every tool that returns one — `compute_techpar` (TechPar wizard), `assess_infrastructure_cost_governance` (ICG wizard), `estimate_tech_debt_cost` (Tech Debt Calculator), `search_regulations` (Regulatory Map, one per framework), `search_radar` (Radar feed). The deeplinks open the corresponding Hub surface with state pre-populated, bridging the read-only dossier to the partner-refinable interactive tool. **The live-exercise transcript triggered the gap** — when only 2/7 sections carried Open-in-Hub links, the dossier lost its bridge back to the interactive Hub for the bulk of the analysis.

**Operator semantics**: patch bump per the discipline (prompt `version` field bump with same name → patch). Behavior change without surface-area change; pinned conversations continue to resolve `gst_diligence_sweep` to the (now-newer) prompt.

**Architecture context**: [BL-032.6 demo Scenario 7](../src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7) + live-exercise transcript captured in [`mcp-server/tests/examples/diligence-sweep.golden.md`](./tests/examples/diligence-sweep.golden.md).

---

## 0.3.0 — 2026-05-22 — BL-032.6 Scenario 7 — `gst_diligence_sweep`

**Theme**: ship the bookend to `gst_information_request_list`. The IRL prompt emits the _request_ artifact; the new sweep prompt ingests a _populated_ IRL and uses the full content to drive every Hub tool surface and downstream prompt artifact — the "high-fidelity intake → full platform sweep" workflow.

### Added

- **MCP Prompt**: `gst_diligence_sweep` (v0.0.1) — bookend to `gst_information_request_list`. Takes the populated IRL the target returns plus optional `targetName` / `transactionContext` / `partnerLead` / `projectCodeName` framing. Orchestrates 9 tools (`generate_diligence_agenda`, `list_portfolio_facets`, `search_portfolio`, `list_regulation_facets`, `search_regulations`, `compute_techpar`, `assess_infrastructure_cost_governance`, `estimate_tech_debt_cost`, `search_radar`) and embeds two Library resources (`gst://library/information-request-list` for taxonomy reference, `gst://library/vdr-structure` for synthesis follow-ups). Output is a unified nine-section dossier with no `'unknown'` defensive widening.

**Operator semantics**: this is an **additive** change — no URIs or prompt names were renamed or removed. Per the discipline above (prompt-name addition → minor bump), `mcp-server/package.json` bumps `0.2.0 → 0.3.0`.

**Pinned conversation impact**: none. Existing pinned URIs and prompt names continue to resolve.

**Architecture context**: [BL-032.6 demo Scenario 7](../src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7).

---

## 0.2.0 — 2026-05-22 — BL-043 Information Request List

**Theme**: ship the Information Request List as a Library article + MCP Resource + MCP Prompt.

### Added

- **Library article + Resource**: `gst://library/information-request-list` — universal one-page intake checklist organized by VDR taxonomy (00 Basics + sections 01-09 mirroring VDR-9). Codegen auto-picked up via `mcp-server/scripts/generate-regulations-index.mjs`.
- **MCP Prompt**: `gst_information_request_list` (v0.0.1) — assembles the input-gathering ask GST hands to a target/client before running diligence tools. Embeds the canonical Resource as the second message; supports optional `targetName`, `transactionContext`, and `productSummary` args for light personalization.

**Operator semantics**: this is an **additive** change — no URIs or prompt names were renamed or removed. Per the discipline above (URI / prompt-name addition → minor bump), `mcp-server/package.json` bumps `0.1.0 → 0.2.0`.

**Pinned conversation impact**: none. Existing pinned URIs and prompt names continue to resolve.

**Architecture context**: [BL-043 design doc](../src/docs/development/MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md).

---

## 0.1.0 — 2026-05-13 — BL-032.5 Phase 4 manifest-hash discipline

**Theme**: formalize the URI / prompt-name stability discipline that
BL-032 Phase 4b introduced informally.

**What changed**:

- New CI test at [`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts)
  computes a sha256 over the sorted Library / Regulation / Radar URIs +
  prompt `name@version` tuples. Fails when the registry shape drifts
  from the value committed here.
- `BREAKING_CHANGES.md` gains a `## Current manifest hash` section
  (above) that operators update in lockstep with the test constant
  when a manifest-affecting change ships.

**Operator semantics**:

- URI / prompt-name **rename** or **removal** → major bump (breaks pinned conversations)
- URI / prompt-name **addition** → minor bump
- prompt **`version` field** bump (same name, behavior change) → patch bump

**Architecture context**: [BL-032.5 design doc § Repo placement and lifecycle](../src/docs/development/MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md#repo-placement-and-lifecycle).

This is not a breaking change in itself (no Tool / prompt / Resource was renamed); it's documented here so the discipline's introduction is auditable.

---

## 0.1.0 — 2026-05-04

**Theme**: BL-032 Phase 4b — `search_radar_cache` rename.

### Tool: `search_radar_cache` → `search_radar_offline`

The Phase 1 / BL-031.5 name `search_radar_cache` predicted a future split between a snapshot tool and a live tool (the live tool ships under BL-032 Phase 4c as `search_radar`). Reviewed during BL-032 Q2 — `_offline` more accurately describes what the tool does (offline-from-Inoreader; reads a frozen snapshot). The `_cache` framing also confused the relationship with the upcoming Worker-side ISR cache (`mcp:radar:cache:*` Upstash keys), which is a different cache layer entirely.

**What changed**:

- `mcp-server/src/tools/radar-cache.ts` → `mcp-server/src/tools/radar-offline.ts`
- Tool name registered in MCP: `search_radar_cache` → `search_radar_offline`
- Exported function names: `handleRadarCacheTool` → `handleRadarOfflineTool`; `registerRadarCacheTool` → `registerRadarOfflineTool`; `SearchRadarCacheInputSchema` → `SearchRadarOfflineInputSchema`
- Test files renamed: `radar-cache.test.ts` → `radar-offline.test.ts`, `radar-cache-handler.test.ts` → `radar-offline-handler.test.ts`

**Migration**: deprecated alias `search_radar_cache` registered alongside `search_radar_offline` for one release. Calling the alias:

- Tail-calls the same handler (no functional difference)
- Emits `[gst-mcp] DEPRECATION: search_radar_cache renamed to search_radar_offline ...` to stderr on each invocation
- Will be **removed in `mcp-server@0.2.0`** — update your client config / agent code before then

**Affected surfaces**: pinned conversations referencing `search_radar_cache`, agent code calling the tool by name, prompts orchestrating it (none currently — verified during the rename).

**Architecture context**: [BL-032 Q2](../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited) records the three options considered (rename + alias / coexist / drop offline) and the decision to rename + alias.

---

## How to use this file

When making a contract-breaking change to a tool / prompt / Resource:

1. Add an entry above the previous entries (newest at the top)
2. Bump `version` in `package.json` per semver:
   - **Rename or alias-only deprecation** (no functional change to callers honoring the deprecation): minor bump (`0.X.0`)
   - **Remove a deprecated alias**: major bump (`X.0.0`)
   - **Schema-incompatible change to an existing tool/prompt** (e.g. removing a field that callers depend on): major bump
3. Cross-reference the BL- doc / Q-section in the entry body so future readers can trace the reasoning
4. If the change ships with an alias for a deprecation window, name the version that retires the alias in the entry

The file goes BACKWARD chronologically (newest at top) so a reader scanning for "what's the most recent breaking change" sees it first.
