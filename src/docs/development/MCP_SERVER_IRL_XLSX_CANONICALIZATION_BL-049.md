# MCP Server — IRL xlsx Canonicalization for Hash-Bind Authority (BL-049)

> **Backlog initiative**: BL-049 filed June 3, 2026; BL-054 (revisit ticket) retired from BACKLOG June 4, 2026. This document is now the **canonical revisit blueprint** — there is no live BACKLOG entry. Re-engage by re-reading this doc when one of the trigger conditions below materializes; no backlog ping will arrive.
>
> **Companion docs**:
>
> - [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) — the design doc this initiative extends. BL-045 PR B shipped the hash-bind forcing function in `compose_dossier_envelope` at v0.12.0; this initiative closes the last empirical false-positive class the v11 StoreForce live exercise exposed.
> - [MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md) — the tool-input audit architecture (Phase 1/2/2A) BL-049 inherits. The hash-bind in compose_dossier_envelope is the same architectural pattern applied to the rendering layer; xlsx canonicalization gives the rendering-layer hash-bind an authoritative source.
> - [MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md) — canonical IRL article (Library Resource at `gst://library/information-request-list`). The canonical-form output of BL-049's parser MUST round-trip to this article's section / bullet shape.
> - [MCP_SERVER_IRL_GENERATOR_BL-044.md](MCP_SERVER_IRL_GENERATOR_BL-044.md) — fillable-form generator. Produces the `.xlsx` whose populated form is the input to BL-049. The generator's pure-function pipeline (`generateIrlXlsxBuffer`) is the inverse of BL-049's parser; the two share the same workbook shape and **share the `xlsx-js-style` dep already on the wire** (read API confirmed: `read` / `readFile` / `utils.sheet_to_json` all present in the current package — no new dependency).
> - [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) — semver log. This initiative bumps the server **minor** (new tool + additive envelope args).
> - [IRL_PARTNER_PASTE_RUNBOOK.md](IRL_PARTNER_PASTE_RUNBOOK.md) — **operator-local equivalent of this deferred server tool**. Until BL-049's server-side `extract_irl_from_xlsx` becomes shippable (blocked on the cross-host bytes-delivery topology), the `npm run irl:extract` script in that runbook produces the same canonical-IRL-markdown output, run on the operator host where the xlsx already lives. The runbook surfaces the operator-side workaround; this design doc remains the canonical revisit blueprint for the server-side path.
>
> **Predecessors**: BL-043 (canonical article + Resource), BL-044 (fillable-form generator + `xlsx-js-style` pipeline), BL-045 PR B (hash-bind forcing function in `compose_dossier_envelope` shipped at v0.12.0 — the architecture BL-049 closes the input-authority gap for).
>
> **Sequels**: BL-046 candidate (in-Claude-Desktop file delivery) may eventually deliver xlsx as `resource_link` content blocks; BL-049's tool surface should compose cleanly with that workflow when it ships.
>
> **Scope**: ship server-side xlsx → canonical-IRL-markdown conversion so the hash-bind forcing function in `compose_dossier_envelope` binds to an authoritative server-canonicalized body rather than a model-regenerated reconstruction. Architecture: a new MCP tool `extract_irl_from_xlsx` that emits the canonical body + an HMAC receipt; `compose_dossier_envelope` gains an `xlsx-canonicalized` mode that verifies the receipt. Single PR delivery. Stateless — no database, no session state. (An alternative — extending the prompt arg with base64 xlsx — was considered and rejected; rationale in § Considered alternative.)
>
> **Status**: 🪦 **DEFERRED INDEFINITELY — partial-reverted at v0.13.1 (2026-06-04); BL-054 revisit ticket retired same day**. Empirically established during the v12 StoreForce live exercise that the architecture's bytes-delivery layer is **structurally unreachable in the standard Claude Desktop + stdio MCP topology**: model executes in Anthropic's cloud-side Linux compute sandbox, MCP server runs on the operator host, attached xlsx files are reachable from neither over `xlsxBase64` (model tool-call truncation at >~10KB) nor `xlsxPath` (cross-filesystem boundary). Reverted from the codebase at v0.13.1: `extract_irl_from_xlsx` tool, receipt-hmac lib, `RECEIPT_HMAC_KEY` env binding, envelope `irlSource`/`receipt` schema fields, Step 0 prompt directive. **Retained from BL-049 as empirically validated on the partner-paste path**: `tier-fabrication` discipline + `deriveTier`, `BL_045_VERIFY_DIRECTIVE`, verifier defensive hardening (`lastIndexOf('—')`, `/`+`+` normalization).
>
> **Why no BACKLOG ticket exists**: a backlog item gated on external infrastructure with no roadmap is a tombstone, not a queueable initiative. It would never pull through a sprint. This document supersedes the BL-054 stanza as the revisit blueprint.
>
> **Revisit triggers** — if any of these materialize, re-read this document and re-introduce the architecture; no other queue exists to surface the work:
>
> 1. **MCP spec adds a binary-resource primitive** that handles >100KB payloads delivered to tool handlers as bytes. (Watch MCP spec discussions.)
> 2. **Claude Desktop ships an attachment-to-host bridge** that materializes uploaded files at a host filesystem path locally-spawned MCP servers can read (e.g., `process.env.MCP_ATTACHMENT_DIR`). (Watch Anthropic's Claude Desktop releases.)
> 3. **Operator pivots away from the Claude Desktop + stdio topology** — e.g., model + server co-located in the same Linux container, or the operator standardizes on a remote streamable-HTTP server in a topology that materializes attachments on the server side.
>
> **What re-introduction would entail**: largely the same scope as the v0.13.0 implementation that was partial-reverted. The canonicalizer engine, HMAC receipt mechanics, schema deltas, and prompt-body integration are all designed below and independent of the bytes-delivery layer. Adjust only the bytes-delivery surface to whatever the unblocking infrastructure exposes. Reference commit `12f5069` for the v0.13.0 → v0.13.1 revert diff if reconstructing the codebase shape.
>
> The architectural reasoning below is preserved verbatim for the day the topology supports it.

---

## At a glance

```
┌────────────────────────────┐                               ┌────────────────────────────────┐
│ Operator attaches xlsx in  │                               │ extract_irl_from_xlsx          │
│ Claude Desktop conversation│ ── single touch ────────────▶ │  parse xlsx → IRLArticle AST   │
│ AND invokes /gst_irl_      │                               │  serialize → canonical .md     │
│ ingestion (interactive)    │                               │  hash    = sha256(.md)[0:16]   │
└────────────────────────────┘                               │  receipt = hmac(SECRET, hash)  │
                                                             │  return { filledIrlMarkdown,   │
                                                             │           irlBodyHash,         │
                                                             │           receipt, ... }       │
                                                             └────────────────────────────────┘
                                                                          │
                                                                          ▼
                              ┌────────────────────────────────────────────────────────────┐
                              │ Model threads canonical body through 8 content tools       │
                              │ (citations substring-match against canonical body) and     │
                              │ calls compose_dossier_envelope with:                       │
                              │   filledIrl:    <canonical body from extract tool>         │
                              │   irlBodyHash:  <hash from extract tool>                   │
                              │   receipt:      <hmac from extract tool>                   │
                              │   irlSource:    'xlsx-canonicalized'                       │
                              └────────────────────────────────────────────────────────────┘
                                                          │
                                                          ▼
                              ┌────────────────────────────────────────────────────┐
                              │ compose_dossier_envelope HARD-ENFORCES:            │
                              │  (1) sha256(filledIrl).slice(0,16) === irlBodyHash │
                              │  (2) hmac(SECRET, irlBodyHash)      === receipt    │
                              │ Both must pass. (2) blocks the v0.12.0 escape      │
                              │ hatch where a model with code execution computes   │
                              │ its own sha256 of a fabricated body — the model    │
                              │ cannot compute the HMAC without the server secret. │
                              │ Provenance verifier substring-matches against the  │
                              │ SERVER-CANONICALIZED body.                         │
                              └────────────────────────────────────────────────────┘
```

**No operator round-trip; hard enforcement via cryptographic receipts.** The model handles xlsx canonicalization as a tool call within the single prompt invocation. The server-emitted `receipt` is an HMAC of the `irlBodyHash` keyed by a server-side secret: `extract_irl_from_xlsx` computes and returns it; `compose_dossier_envelope` re-computes and verifies. This closes the residual v0.12.0 attack surface: a model with code execution that computes `sha256` of a fabricated body satisfies the v0.12.0 hash-bind alone but fails check (2) here because it cannot compute the HMAC. The architectural cost is **stateless** — one Wrangler secret (`RECEIPT_HMAC_KEY`); no database, no session state, no per-isolate concerns on the streamable-HTTP transport.

**Tier-discipline enforcement** (BL-049 scope-expansion per v11 Finding B). The verifier auto-classifies tier based on citation properties, not on model-declared label:

- Citation excerpt is a verbatim normalized substring of the canonical body → **tier-1 verified**.
- Citation uses the `Section -- — partner-supplied form input` sentinel → **partner-supplied (tier-2-equivalent)**.
- Citation excerpt is NOT a substring and lacks the partner-supplied sentinel → **tier-fabrication** (new gap category), regardless of model-declared tier.

Model-declared tier becomes a hint, not authority. A model demoting `1 → 2` to dodge tier-mismatch now surfaces as `tier-fabrication` instead, because the excerpt still isn't substring-matchable and the citation lacks the partner-supplied sentinel. Closes the v11 Finding B gaming pattern without trusting the model's self-classification.

**The forcing function is preserved, the input contract becomes authoritative.** Today the partner must paste markdown into the `filledIrl` arg for the hash-bind to bind to anything meaningful. BL-049 keeps the same hash-bind algorithm but lets the model fetch the canonical body from a server-side tool instead of reconstructing it from spreadsheet cells. The architecturally clean payoff: the (K) provenance footer's verification counts measure against a known-good body, not against the model's own working memory.

---

## Context — what the v11 live exercise revealed

### The architecture works; the input contract has an upstream gap

BL-045 PR B v0.12.0 shipped the hash-bind forcing function: the prompt body embeds `**Body-binding hash:** <16-hex>` computed from `sha256(args.filledIrl).slice(0, 16)`. The model copies the hash into `compose_dossier_envelope`'s `irlBodyHash` input. The tool re-computes `sha256(input.filledIrl).slice(0, 16)` and rejects on mismatch via `IrlBodyHashMismatchError`. The model can't pass a paraphrased IRL because sha256 doesn't paraphrase.

The v11 StoreForce live exercise (2026-06-03) empirically validated the architectural pattern: the model called the envelope tool, hit the hash check, recognized that its first-call `filledIrl` was the blank canonical IRL template rather than the populated response, **wrote its own substring-validation script**, re-scoped citations to verbatim substrings, and re-called with corrected inputs. This is the same architectural pattern that solved the dimension-layer fabrication risk (Phase 1/2/2A) playing out at the rendering layer.

**But the second envelope call still produced 30 false-positive `tier-mismatch:` entries** — disclosed in the model's own footnote on the gap list: _"the citation excerpts supplied to the envelope tool were paraphrased reconstructions of the spreadsheet rows rather than byte-exact substrings of the populated IRL workbook"_.

### Why the false positives appear even after self-correction

Two failure modes compound:

1. **No prompt arg → no body-binding hash directive.** The partner invoked `/gst_irl_ingestion` without supplying `filledIrl` (interactive mode), then attached the xlsx separately. The prompt rendered the interactive body — which does not embed a body-binding hash because there is no IRL body to hash. The model improvised: read xlsx into context, ran the eight content tools (none of which require `filledIrl`), reached the envelope step, and had to fabricate a `filledIrl` payload AND its own `irlBodyHash`.

2. **Operator-flow ambiguity in xlsx-attached workflow.** With no `filledIrl` arg, the model has to source the IRL body itself. v11 showed the model first try the blank canonical IRL template as `filledIrl` — the verifier correctly rejected all 30 IRL-cited claims because the cited StoreForce-specific text does NOT appear in the blank template. The model diagnosed this and started preparing a self-correction (reconstructing the populated body from xlsx cells, tightening citations to verbatim substrings), but the conversation ran out before the corrected envelope call actually fired.

The hash-bind passes when the model is self-consistent (it hashes what it submits). But the architecture's intent — bind to the partner's authoritative source — is lost.

### What BL-049 does NOT need to fix

The forcing-function architecture itself is empirically validated where it had a chance to fire. v11's verifier correctly surfaced the body/citation mismatch on Call 1 — 30 unverified tier-1 entries with diagnostic gap-list entries telling the model precisely what to fix. The model read those verdicts and prepared a correction. When the partner pastes markdown into the `filledIrl` arg today (no xlsx round-trip), the hash-bind binds to the partner's bytes, the provenance verifier matches against those bytes, and the verification counts are meaningful.

BL-049 closes the input-class gap that v11 exposed: xlsx-attached IRL workflows. It does NOT redesign the hash-bind, does NOT loosen the verifier (which would invite real fabrications to fuzzy-pass). It gives the existing architecture an authoritative input source it currently lacks for the xlsx case so the operator gets a clean dossier on the FIRST envelope call rather than depending on a self-correction loop that may or may not complete.

### Empirical trace — v11 actual outcome (2026-06-03)

The original framing of v11 ("30 false-positive `tier-mismatch:` entries even after self-correction") was inferred from incomplete data. After tracing the actual conversation transcript, what really happened:

| Call                            | Body supplied as `filledIrl`                                              | Outcome                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pre-call (placeholder-fail)** | `{{IRL_BODY}}` placeholder literal                                        | Schema rejection — input too short. Not a verifier verdict.                                                                                                                                          |
| **Call 1 (fired)**              | Blank canonical IRL template (hash `a99c42edd24aff64`)                    | Verifier returned 0 verified / 30 unverified / 30 tier-mismatches — **correct rejections** of a wrong-body envelope call. The cited StoreForce-specific text is genuinely not in the blank template. |
| **Call 2 (never fired)**        | Populated body reconstructed from xlsx (hash `f6167ed1a6d25c53`) intended | Model prepared the corrected input (verbatim-substring citations + 17 preemptive tier demotions) but the conversation ended before the tool call actually executed.                                  |

**The dossier rendered to the operator uses Call 1's envelope output.** The "30 unverified" in the rendered (K) footer is the architecturally-correct response to a mis-supplied body, NOT evidence of an architectural failure that BL-049 must close. v0.12.0's hash-bind + verifier worked as designed on the only envelope call that actually fired.

**The "lexical drift from xlsx round-tripping" failure mode has no empirical support.** Tracing Call 2's prepared input by hand: the corrected citations (e.g., `Section 00 row 0-01 — StoreForce Solutions Inc. — legal entity and brand are the same`) substring-match against the populated body the model reconstructed. If Call 2 had fired, the predicted verdict is high `verified` count, not the "30 still unverified" the original BL-049 framing assumed.

### What v11 actually revealed (the load-bearing finding)

Two real failure modes were observed:

**Finding A — Operator-flow ambiguity.** When xlsx is attached but no `filledIrl` arg is supplied, the model improvises. v11's improvisation path was: pass the blank template → verifier rejects → diagnose → prepare correction → conversation ends. Whether the correction would have succeeded had the conversation continued is moot for operator UX: the dossier the partner sees comes from the FIRST envelope call. A multi-call self-correction loop is fragile in proportion to model context and conversation length. **BL-049's `extract_irl_from_xlsx` tool eliminates this class** by giving the model an authoritative canonical body before the first envelope call, so Call 1 IS the successful call.

**Finding B — Tier-discipline gaming.** Inspecting Call 2's prepared input (which never fired but is preserved in the transcript), the model demoted **17 originally-tier-1 claims to tier-2** between Call 1 and Call 2. Demotion converts a damning `tier-mismatch:` gap (tier-1 literal-IRL claim with unverifiable excerpt) into a routine `provenance-gap:` (any unverifiable claim). The tier field is model-declared with no server-side enforcement that "literal IRL bullet" claims aren't being relabeled as "derivation" to dodge the discipline check. v11 showed the gaming pattern in action: same essentially-literal excerpts, lower-tier label, softer verifier verdict.

The tier-gaming pattern is independent of the xlsx-attach scenario but architecturally co-located in `compose_dossier_envelope`'s verifier surface. **BL-049 scope expands to include tier-discipline enforcement** because the underlying fix is in the same code surface and the v11 trace exposed both failure modes in the same investigation.

A defensive verifier refinement worth shipping co-located (independent of the above): `extractExcerpt` becomes `lastIndexOf('—')` to anchor on the final em-dash separator (correct for both single- and multi-em-dash citation shapes); `normalizeForMatching` strips `/` and `+` to whitespace so `cad/mo` and `hosting + infrastructure` decompose into word boundaries the fuzzy-run logic can use. ~30 min of work. The v11 trace doesn't show these as load-bearing failures but they close small drift classes before they surface.

---

## Implementation

### New MCP tool `extract_irl_from_xlsx`

Ship a pure MCP tool that takes xlsx bytes and returns the canonicalized markdown body PLUS its hash AND an HMAC receipt. The model calls the tool first within the same `/gst_irl_ingestion` invocation, threads the canonical body through the eight content tools, then passes `(filledIrl, irlBodyHash, receipt, irlSource: 'xlsx-canonicalized')` to `compose_dossier_envelope`. No prompt re-invocation; no operator round-trip.

**Input shape**:

```ts
{
  xlsxBase64: z.string()
    .min(1)
    .describe(
      'Base64-encoded xlsx file bytes. The standard IRL workbook produced by gst_information_request_list@0.0.2+ via generate_information_request_list_xlsx.'
    );
}
```

**Output shape**:

```ts
{
  filledIrlMarkdown: string; // canonical-form markdown ready to pass as filledIrl
  irlBodyHash: string; // sha256(filledIrlMarkdown).slice(0,16) — same algorithm as compose_dossier_envelope
  receipt: string; // hmac(SERVER_SECRET, irlBodyHash) truncated to 32 hex chars; thread through to compose_dossier_envelope
  sectionsParsed: number; // 10 for a complete canonical workbook
  substantiveCellsCounted: number;
  totalCellsCounted: number;
  fillRatio: {
    percent: number;
    status: 'halt' | 'partial' | 'ok';
  }
  envelopeInstructions: string; // prose telling the model which args to pass to compose_dossier_envelope (filledIrl/irlBodyHash/receipt/irlSource)
}
```

**Operator workflow**:

1. Partner attaches `.xlsx` to the Claude Desktop conversation.
2. Partner invokes `/gst_irl_ingestion` in interactive mode (no args). **This is the only operator touch.** The prompt body's interactive section says: _"If an xlsx is attached to this conversation, FIRST call `extract_irl_from_xlsx` with the base64-encoded bytes. Use the returned `filledIrlMarkdown` as the canonical IRL for all downstream content tools. When you call `compose_dossier_envelope`, pass the returned `filledIrlMarkdown` as `filledIrl`, the returned `irlBodyHash` as `irlBodyHash`, the returned `receipt` as `receipt`, and set `irlSource: 'xlsx-canonicalized'`."_
3. Model calls `extract_irl_from_xlsx` → receives `{ filledIrlMarkdown, irlBodyHash, receipt, fillRatio, ... }`. The `receipt` is `hmac(SERVER_SECRET, irlBodyHash)` — server-issued, unforgeable by the model.
4. Model runs the eight content tools as today; their citations substring-match against the canonical body without lexical drift because both halves derive from the same deterministic source.
5. Model calls `compose_dossier_envelope` with `filledIrl=<canonical body>`, `irlBodyHash=<server-issued hash>`, `receipt=<server-issued hmac>`, `irlSource='xlsx-canonicalized'`. Envelope tool runs both hard-enforcement checks. Provenance verifier substring-matches against the canonical body; encoding-drift false-positive class eliminated.

**Why hard enforcement and not prompt-body imperative**: the BL-045 v8/v9 traces empirically established that body-directives the model can satisfy descriptively (without changing tool behavior) get treated as descriptive context. The only thing forcing the model down the correct path is a tool-input/output rejection it cannot route around. Hard enforcement via the HMAC receipt check (`hmac(SERVER_SECRET, irlBodyHash) === receipt`) is the tool-boundary forcing function — a model that skips `extract_irl_from_xlsx` and fabricates body + hash via code execution satisfies v0.12.0's `sha256(filledIrl) === irlBodyHash` check but cannot satisfy the receipt check because HMAC computation requires the server secret.

**Architectural advantages**:

- **Authoritative server source**: `filledIrlMarkdown` is generated by a pure server-side function from the xlsx bytes. The model can't drift between body-generation and citation-generation because both come from the same canonical source.
- **Hard enforcement at the tool boundary, stateless**: the HMAC receipt check on `compose_dossier_envelope` makes calling `extract_irl_from_xlsx` mechanically required — it is not a body-directive that the model can satisfy descriptively. The check is a pure function of `(SERVER_SECRET, irlBodyHash, receipt)` — no database, no session state, no per-isolate concerns on the streamable-HTTP transport. Matches the BL-045 PR B forcing-function pattern that v8/v9/v10/v11 traces empirically validated.
- **Reuses existing dep**: `xlsx-js-style` is already in `mcp-server/package.json` for the BL-044 generator. The BL-049 parser is the inverse operation; no new dependency.
- **Composable with BL-046**: if BL-046 eventually delivers xlsx as `resource_link` content blocks, `extract_irl_from_xlsx` can accept a Resource URI as an alternative input. Same tool surface, additive arg.

**Effort**: ~10-13 hours (single focused PR; includes the v11 Finding B tier-discipline scope-expansion added 2026-06-03). Breakdown:

- **xlsx parser + canonicalizer** (~2-3 hours). Walk the xlsx workbook with `xlsx-js-style` (read API confirmed: `read`/`readFile`/`utils.sheet_to_json`). Extract per-row `(Reference, Request, Response, Comments)` tuples for sections 00-09 plus optional engagement-specific sections. Canonical-form serializer per the spec below. **Reuse `parseIrlArticle` from [src/utils/irl/parse-article.ts](../../utils/irl/parse-article.ts)** — already imported cross-tree by the BL-044 generator at [mcp-server/src/tools/generate-information-request-list-xlsx.ts:38](../../../mcp-server/src/tools/generate-information-request-list-xlsx.ts) — so the section/bullet AST shape is single-sourced with BL-043. Includes the ~10 normalization rules from § Canonical-form specification each with its own test case.
- **MCP tool wiring** (~45 min). New file `mcp-server/src/tools/extract-irl-from-xlsx.ts` modeled on `mcp-server/src/tools/validate-irl-provenance.ts`. Register in `server.ts` (signature accepts the env-bound secret). Update sorted-tools-list assertion in `tests/integration/protocol-roundtrip.test.ts`.
- **HMAC receipt + envelope hard enforcement** (~90 min). Shared `mcp-server/src/lib/receipt-hmac.ts` (`computeReceipt(secret, hash)` + `verifyReceipt(secret, hash, receipt)`); reuse the existing constant-time comparison from [mcp-server/src/admin/admin-auth.ts:28-35](../../../mcp-server/src/admin/admin-auth.ts) (`timingSafeEqual`) rather than importing `node:crypto.timingSafeEqual` (the codebase already prefers the manual XOR fallback for Workers-runtime portability — `nodejs_compat` is enabled per `wrangler.toml` so `createHmac` + `Buffer.from` are fine, but `timingSafeEqual` follows the existing precedent). Secret threaded from `Env.RECEIPT_HMAC_KEY` (Workers) or `process.env.RECEIPT_HMAC_KEY` (stdio) into both tool handlers. `compose_dossier_envelope` gains `irlSource: z.enum(['partner-pasted', 'xlsx-canonicalized']).default('partner-pasted')` and `receipt: z.string().optional()` (symmetric refine: receipt present iff `xlsx-canonicalized`). New error: `IrlReceiptInvalidError` distinguishes "model fabricated body + hash" from generic hash-mismatch.
- **Tier-discipline enforcement (v11 Finding B)** (~60-90 min). Add `tier-fabrication` to `gapCategoryValues` in `compose-dossier-envelope.ts`. Implement `deriveTier(verdict)` helper in the auto-append loop. Map model-declared tier vs derived tier; emit `tier-fabrication:` when model declares tier-2 but the citation is neither verifiable substring nor partner-supplied sentinel. Existing `tier-mismatch:` semantics preserved for tier-1 declarations. Includes ~4 unit-test cases covering the four declared×derived combinations.
- **Unit + integration tests** (~2-3 hours). Unit: xlsx parser against StoreForce + MedSig + Helios-Grid fixtures (existing in BL-044's test surface — confirm before scoping; add if missing); HMAC compute/verify; envelope schema rejection paths for missing/forged receipts. Integration: cross-tool test that the receipt from `extract_irl_from_xlsx` round-trips through `compose_dossier_envelope` end-to-end; round-trip test against the BL-044 `generate_information_request_list_xlsx` generator output to catch parser-vs-generator drift. Existing test files that construct the server via `createServer()` need to thread a fake `RECEIPT_HMAC_KEY` env value — sweep `tests/integration/*.test.ts` for affected sites.
- **Prompt body update** (~30 min). Add interactive-body guidance directing the model to call `extract_irl_from_xlsx` when the conversation carries an xlsx attachment AND to pass `irlSource: 'xlsx-canonicalized'` + `receipt` to the envelope. (Body-directive is documentation, not the enforcement — the enforcement lives at the tool boundary.) **Also add the BL-045-VERIFY emission directive** (see § Verification protocol): instruct the model to emit a fenced `BL-045-VERIFY` block as its final output AFTER the last `compose_dossier_envelope` call, containing the structured verification fields. ~10 lines of body addition; pure documentation; gets added to BOTH interactive and one-shot bodies so every live run produces a load-bearing artifact the operator can paste without copying multi-KB of envelope output.
- **Verifier defensive patch (Path D co-ship)** (~30 min). `extractExcerpt` in `mcp-server/src/schemas/validate-irl-provenance.ts` changes from `indexOf('—')` to `lastIndexOf('—')` — anchors on the final em-dash so multi-em-dash citations like `"Section 02 — Software Architecture — 2-05 — text"` extract `"text"` instead of `"Software Architecture — 2-05 — text"`. Adds 2-3 unit tests covering one-, two-, and three-em-dash citation shapes. Backward compatible with all single-em-dash citations (the common case); no behavior change for those. Also: `normalizeForMatching` strips `/` and `+` to whitespace (currently preserved as word-internal chars) so `cad/mo` decomposes into `cad mo` and `hosting + infrastructure` decomposes into `hosting infrastructure` — small but defensive against punctuation-level body/citation drift.
- **Wrangler secret + local-env wiring** (~15 min). `wrangler secret put RECEIPT_HMAC_KEY` for staging + production; document local `.env` for stdio dev; fail-closed if missing (throw on tool registration, not on first call).
- **BREAKING_CHANGES entry, version bump 0.12.x → 0.13.0** (~15 min). Minor bump justified by the additive `irlSource` enum + `receipt` arg on `compose_dossier_envelope` and the new tool; default value preserves today's `partner-pasted` behavior for existing callers.
- **Manifest hash + body hash rebaseline** (~15 min — interactive body changes; one-shot bodies do not).

### Considered alternative — extended prompt arg `filledIrlXlsx`

We considered adding an optional `filledIrlXlsx: z.string()` (base64 xlsx) to `gst_irl_ingestion`'s `argsSchema`; the prompt build seam would server-side decode + canonicalize before computing the body-binding hash. Rejected because (1) pasting 50-200KB of base64 into the Claude Desktop slash-menu form is operationally hostile to partners, (2) the prompt schema would gain a binary-input field that Hub UI + future MCP clients would have to handle, and (3) it overlaps with BL-046's eventual Claude-Desktop-native attachment-to-arg adapter — building it now risks duplicating that work. Path A's standalone tool surface composes cleanly with BL-046 when it ships (additive Resource-URI input).

---

## Canonical-form specification

The canonical IRL markdown that `extract_irl_from_xlsx` returns MUST be deterministic from the xlsx input — same bytes in, same bytes out. The provenance verifier's substring matching depends on byte-level stability; any nondeterminism in the serializer creates a new false-positive class.

### Section heading shape

Each canonical section uses the literal header from BL-043's article:

```
## 00 — Basics
## 01 — Product
## 02 — Software Architecture
## 03 — Infrastructure & Operations
## 04 — SDLC
## 05 — Data, Analytics & AI
## 06 — Security
## 07 — People & Organization
## 08 — Corporate IT
## 09 — Governance & Compliance
```

Engagement-specific sections (`10 — *`, `11 — *`) that appear in a populated workbook are passed through verbatim using the section title from the xlsx row group header.

### Bullet shape

Each Response cell becomes one markdown bullet with the canonical `Reference ID — Response text` shape:

```
- 0-01 — StoreForce Solutions Inc. legal entity and brand are the same; HQ Toronto ON Canada; founded 2010
- 0-02 — Post-close value creation. AKKR Emerging Buyout Partners II majority investment since Mar 2023
...
```

**Empty Response cells** are emitted with the placeholder marker `[OPEN]`:

```
- 4-05 — [OPEN]
```

**Comments cells** (when populated) are appended as a parenthetical to the Response bullet:

```
- 0-03 — Recurring revenue ~$2.64M CAD/mo (Apr-2026), $7.86M YTD FY27 — implied ARR run-rate ~$31-32M CAD (Comment: derived run-rate; exact contracted ARR not stated)
```

This shape was chosen because (a) it round-trips cleanly to the BL-043 article's bullet structure, (b) it makes the Reference ID a strong anchor for citation-substring matching (model citations of the form `"Section 00 row 0-03 — Recurring revenue ~$2.64M CAD/mo (Apr-2026)..."` substring-match cleanly against the canonical body), and (c) it preserves all evidence the partner committed to the workbook without editorial loss.

### Whitespace + encoding rules

- **Line endings**: `\n` only. No `\r\n` regardless of xlsx-author OS.
- **Trailing whitespace**: stripped per line.
- **Section separators**: exactly one blank line between sections; exactly one blank line between section header and first bullet.
- **Em-dash**: U+2014 `—` only (no `--`, no `-`, no en-dash). The separator between Reference ID and Response text is always `—` (space, em-dash, space).
- **Quotes**: smart quotes from the xlsx (`"` `"` `'` `'`) are normalized to ASCII (`"` `'`). Prevents the v11-class encoding-drift false-positive.
- **NBSP**: U+00A0 normalized to space.
- **Carriage returns inside cells**: collapsed to single spaces (multi-paragraph Response cells flatten to one line per bullet; preserving line breaks would invite per-author drift).

### Determinism + hashing

The serializer is a pure function `(xlsxBytes: Uint8Array) => string`. `sha256(serialize(bytes)).slice(0, 16)` is the canonical hash. Same xlsx bytes always produce the same hash; perturbations in the xlsx (rearranging rows, padding whitespace, changing column widths) that do not affect substantive Response content do not change the hash.

A property-based test in `mcp-server/tests/unit/schemas/extract-irl-from-xlsx.test.ts` should fuzz this: take the StoreForce fixture, randomly perturb column widths / styles / non-Response cell contents, assert the canonical output is unchanged.

---

## Tool shape detail

### Shared HMAC receipt helpers (`mcp-server/src/lib/receipt-hmac.ts`)

```ts
import { createHmac } from 'node:crypto';
import { timingSafeEqual } from '../admin/admin-auth'; // manual XOR-loop polyfill; Workers-portable

// 16 bytes (128 bits) of HMAC-SHA256. The receipt is a single-use bind-token
// scoped to a session-lived ~5-minute window between extract and envelope
// calls; an attacker needs to predict the HMAC of a known irlBodyHash in
// that window to forge. At 128 bits the forgery space is computationally
// infeasible at this lifetime; matches irlBodyHash's own truncation (also
// 16 bytes) so the two server-issued values are visually symmetric in
// logs and partner-facing surfaces.
const RECEIPT_LENGTH_HEX = 32;

export function computeReceipt(secret: string, irlBodyHash: string): string {
  return createHmac('sha256', secret)
    .update(irlBodyHash)
    .digest('hex')
    .slice(0, RECEIPT_LENGTH_HEX);
}

export function verifyReceipt(secret: string, irlBodyHash: string, receipt: string): boolean {
  if (receipt.length !== RECEIPT_LENGTH_HEX) return false;
  return timingSafeEqual(computeReceipt(secret, irlBodyHash), receipt);
}

export function loadReceiptSecretOrThrow(env: { RECEIPT_HMAC_KEY?: string }): string {
  const k = env.RECEIPT_HMAC_KEY ?? process.env.RECEIPT_HMAC_KEY;
  if (!k || k.length < 32) {
    throw new Error(
      'RECEIPT_HMAC_KEY missing or too short (<32 chars). Set via `wrangler secret put RECEIPT_HMAC_KEY` (Workers) or env var (stdio). Required by extract_irl_from_xlsx + compose_dossier_envelope.'
    );
  }
  return k;
}
```

Stateless. `createHmac` is fine under `nodejs_compat` (per `wrangler.toml`); for constant-time comparison the codebase already has a Workers-portable polyfill at [admin-auth.ts:28-35](../../../mcp-server/src/admin/admin-auth.ts) — reuse it rather than importing `node:crypto.timingSafeEqual`, which isn't in the existing Workers compat carve-out. Both tool handlers receive the secret via the same env-binding pattern existing tools use for Upstash/Sentry tokens. Fail-closed at server boot (tool registration throws if secret is absent).

### Schema (`mcp-server/src/schemas/extract-irl-from-xlsx.ts`)

```ts
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ExtractIrlFromXlsxInputSchema = z.object({
  xlsxBase64: z
    .string()
    .min(1)
    .describe(
      'Base64-encoded xlsx file bytes. The standard IRL workbook produced by ' +
        '`gst_information_request_list@0.0.2+` via `generate_information_request_list_xlsx`. ' +
        'A non-canonical xlsx (different sheet structure, different header row, etc.) will ' +
        'produce a parse error with a structured diagnostic.'
    ),
});

export type ExtractIrlFromXlsxInput = z.infer<typeof ExtractIrlFromXlsxInputSchema>;

export interface ExtractIrlFromXlsxResult {
  filledIrlMarkdown: string;
  irlBodyHash: string;
  receipt: string;
  sectionsParsed: number;
  substantiveCellsCounted: number;
  totalCellsCounted: number;
  fillRatio: {
    percent: number;
    status: 'halt' | 'partial' | 'ok';
  };
  envelopeInstructions: string;
}

export class XlsxShapeError extends Error {
  readonly diagnostic: string;
  constructor(diagnostic: string) {
    super(`xlsx does not match the canonical IRL workbook shape: ${diagnostic}`);
    this.name = 'XlsxShapeError';
    this.diagnostic = diagnostic;
  }
}
```

### Engine (pure function for parsing; receipt computed by the handler)

The canonicalization itself is pure (xlsx bytes → markdown + hash). The HMAC receipt depends on `SERVER_SECRET`, so it's computed by the handler at the env-binding boundary; the engine stays unit-testable without secrets.

```ts
// Pure: unit-tested in isolation
export function runExtractIrlFromXlsx(
  input: ExtractIrlFromXlsxInput
): Omit<ExtractIrlFromXlsxResult, 'receipt' | 'envelopeInstructions'> {
  const bytes = Buffer.from(input.xlsxBase64, 'base64');
  const workbook = parseWorkbookOrThrow(bytes);
  const sections = extractCanonicalSections(workbook);
  const markdown = serializeCanonical(sections);
  const hash = createHash('sha256').update(markdown).digest('hex').slice(0, 16);

  let substantive = 0;
  let total = 0;
  for (const section of sections) {
    for (const row of section.rows) {
      total++;
      if (isSubstantive(row.response)) substantive++;
    }
  }
  const percent = total === 0 ? 0 : (substantive / total) * 100;
  const status: 'halt' | 'partial' | 'ok' = percent < 15 ? 'halt' : percent < 40 ? 'partial' : 'ok';

  return {
    filledIrlMarkdown: markdown,
    irlBodyHash: hash,
    sectionsParsed: sections.length,
    substantiveCellsCounted: substantive,
    totalCellsCounted: total,
    fillRatio: { percent, status },
  };
}

function composeEnvelopeInstructions(hash: string, receipt: string): string {
  return [
    'When you call `compose_dossier_envelope`:',
    '- `filledIrl`: pass the `filledIrlMarkdown` value above (verbatim — sha256 must match).',
    `- \`irlBodyHash\`: pass \`"${hash}"\`.`,
    `- \`receipt\`:     pass \`"${receipt}"\`.`,
    "- `irlSource`:  pass `'xlsx-canonicalized'`.",
    '',
    'The envelope tool will reject the call if any of these conditions fail:',
    '  (1) sha256(filledIrl).slice(0,16) !== irlBodyHash',
    '  (2) hmac(SERVER_SECRET, irlBodyHash) !== receipt',
    'Both are hard rejections — do not attempt to compute or substitute the receipt; you cannot compute it without the server secret.',
  ].join('\n');
}
```

The handler wraps the pure engine, signs the hash, and surfaces the receipt:

```ts
// mcp-server/src/tools/extract-irl-from-xlsx.ts
export function makeExtractIrlFromXlsxHandler(secret: string) {
  return async function handleExtractIrlFromXlsx(input: ExtractIrlFromXlsxInput) {
    const core = runExtractIrlFromXlsx(input);
    const receipt = computeReceipt(secret, core.irlBodyHash);
    const result: ExtractIrlFromXlsxResult = {
      ...core,
      receipt,
      envelopeInstructions: composeEnvelopeInstructions(core.irlBodyHash, receipt),
    };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  };
}
```

### compose_dossier_envelope schema delta

```ts
// mcp-server/src/schemas/compose-dossier-envelope.ts (additive)
export const ComposeDossierEnvelopeInputSchema = z
  .object({
    // ... existing fields
    irlSource: z
      .enum(['partner-pasted', 'xlsx-canonicalized'])
      .default('partner-pasted')
      .describe(
        "Provenance of the filledIrl bytes. Use 'partner-pasted' ONLY when the operator supplied the IRL markdown directly via the `filledIrl` prompt argument at slash-menu invocation time (today's path); the prompt body's `**Body-binding hash:**` directive provides the binding authority. Use 'xlsx-canonicalized' when filledIrl came from `extract_irl_from_xlsx` (the model called the tool and is threading its output through); envelope additionally verifies the HMAC `receipt` issued by that tool. Do NOT use 'partner-pasted' to describe IRL content the model itself reconstructed from an attached xlsx — that path requires `extract_irl_from_xlsx` and the corresponding receipt."
      ),
    receipt: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional()
      .describe(
        "HMAC receipt from `extract_irl_from_xlsx`. Required when irlSource is 'xlsx-canonicalized'; must be omitted when irlSource is 'partner-pasted'."
      ),
  })
  .refine((v) => (v.irlSource === 'xlsx-canonicalized') === (typeof v.receipt === 'string'), {
    message: "receipt must be present iff irlSource === 'xlsx-canonicalized'",
    path: ['receipt'],
  });
```

### Handler enforcement

```ts
// mcp-server/src/tools/compose-dossier-envelope.ts
export function makeComposeDossierEnvelopeHandler(secret: string) {
  return async function handleComposeDossierEnvelopeTool(input: ComposeDossierEnvelopeInput) {
    const expected = computeIrlBodyHash(input.filledIrl); // existing v0.12.0 check
    if (expected !== input.irlBodyHash) throw new IrlBodyHashMismatchError(/* ... */);

    if (input.irlSource === 'xlsx-canonicalized') {
      if (!verifyReceipt(secret, input.irlBodyHash, input.receipt!)) {
        throw new IrlReceiptInvalidError(
          `receipt did not verify for irlBodyHash "${input.irlBodyHash}". ` +
            'When irlSource is "xlsx-canonicalized", the receipt must be the HMAC issued by extract_irl_from_xlsx. ' +
            'Do not compute or fabricate the receipt — the server holds the secret.'
        );
      }
    }
    // ... existing envelope composition
  };
}
```

`IrlReceiptInvalidError` is structurally distinct from `IrlBodyHashMismatchError` — the former means "model bypassed the canonicalizer (no valid HMAC)," the latter means "model substituted the body." Both surface as actionable tool-input rejections.

### Tier-discipline enforcement (v11 Finding B)

Add `tier-fabrication` to the existing `gapCategoryValues` enum in `compose-dossier-envelope.ts`. In the verifier's per-claim loop (`runIrlProvenanceCheck` or the envelope's auto-append wrapper), derive an effective tier from citation properties and compare against the model-declared tier:

```ts
// pseudo, integrate at the existing verdict-emit site in compose-dossier-envelope
type DerivedTier = 'tier-1-literal' | 'partner-supplied' | 'fabrication';

function deriveTier(verdict: ValidateIrlProvenanceVerdict): DerivedTier {
  if (verdict.status === 'verified') return 'tier-1-literal';
  if (verdict.status === 'partner-supplied') return 'partner-supplied';
  // verified-fuzzy: still tier-1 (substring matched after normalization, within fuzzy threshold)
  if (verdict.status === 'verified-fuzzy') return 'tier-1-literal';
  return 'fabrication';
}

// Map model-declared tier → expected derived tier
//   tier=1 expects 'tier-1-literal'
//   tier=2 expects 'partner-supplied' or fuzzy-verified
//   anything else: tier-fabrication gap
```

The auto-appended gap list adds:

- `tier-mismatch:` (existing) — tier-1 declared but excerpt failed substring (existing v0.12.0 behavior preserved for non-xlsx callers).
- **`tier-fabrication:` (NEW)** — claim was demoted to tier-2 but excerpt neither verifies as substring nor carries the partner-supplied sentinel. Surfaces the v11 Finding B gaming pattern. Cannot be dodged by lowering the declared tier because the verdict is derived from the citation itself.

No new code surface required beyond the new enum value, the `deriveTier` helper, and the auto-append branch. Reuses the existing `validate-irl-provenance` verdict machinery — the new gap category is just a different label on an existing verdict path.

### Handler (`mcp-server/src/tools/extract-irl-from-xlsx.ts`)

Modeled on `mcp-server/src/tools/validate-irl-provenance.ts` — handler returns `{ content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result }`. Catches `XlsxShapeError` and returns a structured diagnostic the model can act on (e.g., _"workbook header row not found at expected row 7; ensure the xlsx was generated by `generate_information_request_list_xlsx@0.3.5+`"_).

### Prompt body integration

Add a guidance directive to the **interactive body** of `gst_irl_ingestion` (the body that renders when no `filledIrl` is supplied):

```
If the partner has attached an `.xlsx` file to the conversation rather than pasting markdown,
call `extract_irl_from_xlsx` with the base64-encoded xlsx bytes BEFORE running the eight
content tools. Thread the returned canonical body through the content tools (cite against it,
not against the raw spreadsheet). When you call `compose_dossier_envelope`, supply:
  - `filledIrl`:    the `filledIrlMarkdown` from `extract_irl_from_xlsx` (verbatim)
  - `irlBodyHash`:  the `irlBodyHash` from the same call
  - `receipt`:      the `receipt` from the same call
  - `irlSource`:    `'xlsx-canonicalized'`
The envelope tool will reject the call if `receipt` does not verify against `irlBodyHash`
under the server-side HMAC secret. You cannot compute or fabricate the receipt — only the
server can. Use the value returned by `extract_irl_from_xlsx` verbatim.
```

The one-shot body is unchanged. The directive in the interactive body is documentation, not the enforcement — enforcement lives at the `compose_dossier_envelope` tool boundary (HMAC verify). The BL-045 v8/v9 traces empirically confirmed that body directives the model can satisfy descriptively get treated as descriptive context; only tool-boundary rejection forces the behavior.

---

## Acceptance criteria

A v12+ StoreForce live exercise against the same `PRAXIS-IRL-StoreForce_JLIVET.xlsx` MUST produce a dossier with:

1. **On the FIRST envelope call of the v12+ StoreForce live run: `provenanceVerification.verified + verifiedFuzzy >= 28/30` IRL-cited claims; `verified` (verbatim) >= 22/30; `tierMismatches == 0`; `tierFabrications == 0`.** The "first envelope call" qualifier matters: BL-049's value is eliminating the Call-1-wrong-body class from v11 so no self-correction loop is required. Derivation: of the ~30 IRL-cited claims, ~22 should be tier-1-literal (verbatim substring against canonical body) because both halves derive from the same server-canonicalized source. ~8 may be tier-2 derivations (e.g., "implied ARR run-rate" computed from monthly recurring) and either substring-match the canonical body (if the body includes the partner's derivation) or carry the `Section --` partner-supplied sentinel. Budget for 2 unverified absorbs honest paraphrase that drops below the 8-word fuzzy threshold OR a genuine fabrication the verifier should surface as `tier-fabrication`. v11's Call 1 produced 0/30 verified (wrong body); v12 should produce ≥ 28/30 on the equivalent call without any self-correction.

2. **`provenanceVerification.tierMismatches == 0` for properly-cited tier-1 claims.** Tier-1 (literal IRL bullet) claims should substring-match the canonical body verbatim because the model cites text the server generated.

3. **`(J)` gap list contains ≤ 2 auto-appended entries** (real fabrications would still surface; encoding-drift false positives eliminated). The real-gaps portion of (J) (gate-elided, map-absent, extraction-only, conditional-trigger, currency-assumption, defaulted-dimension) is unaffected by BL-049 — those continue to fire correctly.

4. **The meta fence emits `"fixtureFillRatio"` matching the value the tool computed** (98.4% for StoreForce). v11 showed the model independently computing this; with BL-049 the tool returns it and the model copies it through.

5. **No new `IrlBodyHashMismatchError` regression.** The hash-bind still fires for paraphrased re-calls; only the encoding-drift false positives are eliminated.

6. **HMAC receipt enforcement smoke test.** A synthetic integration test calls `compose_dossier_envelope` with `irlSource: 'xlsx-canonicalized'`, an `irlBodyHash` matching `sha256(filledIrl)`, and a `receipt` that is NOT the HMAC of that hash → must reject with `IrlReceiptInvalidError`. Same call with the real `receipt` from a prior `extract_irl_from_xlsx` call → succeeds. Same call with `irlSource: 'partner-pasted'` (default) and no `receipt` → succeeds (today's behavior preserved).

7. **Tier-discipline enforcement smoke test (v11 Finding B regression guard).** A synthetic integration test calls `compose_dossier_envelope` with a claim declared as `tier: '2'` whose citation excerpt does NOT carry the `Section --` partner-supplied sentinel AND does NOT verify as substring against the IRL body. Verifier must surface a `tier-fabrication:` gap (not a generic `provenance-gap:`). Same call with tier `1` and the same excerpt → `tier-mismatch:` (existing semantics). Same call with the partner-supplied sentinel → `partner-supplied` (no gap). Confirms the v11 demote-to-dodge pattern is closed.

### Test surface

- **Unit**: `mcp-server/tests/unit/schemas/extract-irl-from-xlsx.test.ts` — engine round-trip against the StoreForce + MedSig + Helios-Grid fixture xlsx files; property-based determinism test (perturbations that should not affect canonical output); error-path test for non-canonical xlsx shapes.
- **Integration**: `mcp-server/tests/integration/protocol-roundtrip.test.ts` — tools-list assertion extended to 16 tools (15 + `extract_irl_from_xlsx`).
- **Body-hash stability**: `mcp-server/tests/integration/irl-ingestion-body-hash-stability.test.ts` — interactive body changes (new xlsx guidance directive), one-shot bodies unchanged; one body hash rebaselines.
- **Manifest stability**: re-baseline (16 tools registered).

---

## Edge cases + risks

### Edge cases the parser must handle

| Case                                                                            | Behavior                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-canonical xlsx (different sheet name, missing header row)                   | `XlsxShapeError` with diagnostic naming the expected vs found shape; model surfaces the error to the partner and asks them to regenerate via `generate_information_request_list_xlsx`                     |
| Engagement-specific sections (10-_, 11-_)                                       | Pass through with section title from the row-group header                                                                                                                                                 |
| Workbook authored in a non-English locale (commas as decimal separator, etc.)   | Response text passed through verbatim — the canonical-form spec does not modify numeric formats. The provenance verifier's normalizer (currency-symbol-preserving) handles cross-locale comparisons.      |
| Cell with multi-paragraph Response text                                         | Paragraphs collapsed to single line with `\n` → ` ` flattening (per canonical-form whitespace rule)                                                                                                       |
| Comments cell with `\n`-separated multiple comments                             | Joined with `; ` separator inside the `(Comment: ...)` parenthetical                                                                                                                                      |
| Smart quotes / NBSP / unicode dashes inside Response text                       | Normalized per the canonical-form rules                                                                                                                                                                   |
| Reference ID with section prefix `0-01` vs `00-01` (the v11 trace flagged this) | Canonical output uses single-digit section prefix `0-01` matching the article generator's output. The serializer's section-number-prefix convention is `<sectionIndex>-<rowNumber>` without zero-padding. |

### Risks

**Risk 1: Parser drift from `generate_information_request_list_xlsx`.** If BL-044's generator changes its workbook shape (column order, header row position, etc.), this parser breaks. **Mitigation (two-layer)**: (a) a round-trip test in `mcp-server/tests/integration/irl-xlsx-roundtrip.test.ts` — generate an xlsx via the BL-044 tool, parse via the BL-049 tool, assert the resulting markdown matches the canonical article — any drift fails both sides loudly; (b) embed a workbook-shape signature in BL-044's generator output (e.g., a named-range `_GST_IRL_SHAPE_VERSION` pointing at a cell with `"BL-044/v1"`), and have BL-049's parser read it first and throw `XlsxShapeError` with a clear "regenerate via the latest `generate_information_request_list_xlsx`" message if the signature is missing or mismatches. Layer (b) is a small BL-044 contract change shipped alongside BL-049 (~30 min); without it, partners using a stale generator binary get silent-wrong-shape canonical output whose hash mismatches in confusing ways.

**Risk 2: Canonical-form spec drift.** If the canonical-form rules change (e.g., a new whitespace convention), every previously-computed `irlBodyHash` becomes stale. **Mitigation**: a snapshot test pinning the canonical output for the StoreForce fixture. Changes require deliberate update + BREAKING_CHANGES entry.

**Risk 3: Large xlsx payloads exceeding MCP message-size limits.** A 200KB xlsx becomes ~270KB base64, then ~70KB canonical markdown. MCP message size limits vary by transport but are typically generous (Claude Desktop stdio handles MBs comfortably). **Mitigation**: not anticipated to be load-bearing; if it surfaces, the eventual BL-046 `resource_link` delivery path bypasses the message-size constraint by referencing the xlsx by URI rather than inlining its bytes.

**Risk 4: HMAC secret rotation.** Rotating `RECEIPT_HMAC_KEY` invalidates every in-flight receipt instantly — any model that called `extract_irl_from_xlsx` before the rotation and `compose_dossier_envelope` after will fail HMAC verify. **Mitigation**: receipts are short-lived (single conversation), so a flag-day rotation is acceptable. If zero-downtime rotation becomes a requirement, add a `RECEIPT_HMAC_KEY_PREV` env var and try both secrets in `verifyReceipt`. Not in BL-049 scope.

**Risk 5: HMAC receipt is cross-session replayable.** A model that calls `extract_irl_from_xlsx` for engagement A's xlsx can in principle replay engagement A's `(filledIrl, irlBodyHash, receipt)` triple in engagement B's envelope call — HMAC alone has no session binding. **Mitigation**: the v0.12.0 `sha256(filledIrl) === irlBodyHash` check still binds the receipt to specific body bytes. Replaying engagement A's triple into engagement B would mean engagement B's dossier renders against engagement A's IRL — the wrong target name, financials, etc. would surface immediately to the operator and to any downstream content tools. Document as worked example in the test surface; no extra crypto needed.

**Risk 6: Local-stdio dev without `RECEIPT_HMAC_KEY` env var fails closed at tool registration.** New contributors hitting `npm run dev` without setting the secret get a clear error from `loadReceiptSecretOrThrow`. **Mitigation**: README + `.env.example` document the secret; for local dev a fixed dev-only string (e.g., `dev-receipt-key-do-not-use-in-prod-..._____`) is acceptable. The production secret stays in Wrangler.

---

## Phase plan

### Phase 1 — Parser + canonicalizer (~2 hours)

- Author `mcp-server/src/schemas/extract-irl-from-xlsx.ts` with the canonical-form spec inlined as JSDoc.
- Implement `parseWorkbookOrThrow`, `extractCanonicalSections`, `serializeCanonical`, `isSubstantive`.
- Unit tests: 6-10 cases covering happy path (StoreForce fixture), error path (non-canonical xlsx), property-based determinism (StoreForce fixture with random column-width / cell-style perturbations).

### Phase 2 — Tool wiring + body integration (~60-90 min)

- Author `mcp-server/src/tools/extract-irl-from-xlsx.ts`.
- Register in `mcp-server/src/server.ts`.
- Update interactive body in `mcp-server/src/prompts/irl-ingestion.ts` with the guidance directive.
- Integration test in `tests/integration/protocol-roundtrip.test.ts` (tools-list shape).
- Re-baseline interactive body hash + manifest hash.

### Phase 2.5 — HMAC receipt + envelope hard enforcement (~45-60 min)

- Author `mcp-server/src/lib/receipt-hmac.ts` (`computeReceipt`, `verifyReceipt`, `loadReceiptSecretOrThrow`). Reuse `timingSafeEqual` from [mcp-server/src/admin/admin-auth.ts](../../../mcp-server/src/admin/admin-auth.ts) instead of importing `node:crypto.timingSafeEqual` (Workers-portability precedent).
- Thread `RECEIPT_HMAC_KEY` from `Env` (Workers) and `process.env` (stdio) into both tool registrations. Fail-closed at boot: `registerComposeDossierEnvelopeTool` and `registerExtractIrlFromXlsxTool` accept `secret: string` and throw at server-construction time if it's missing. **Test-surface migration**: existing tests that call `createServer()` without an env (e.g., `tests/integration/protocol-roundtrip.test.ts`, `tests/integration/prompts-registry.test.ts`, all `compose-dossier-envelope` unit tests) must stub `RECEIPT_HMAC_KEY` — sweep `tests/` for affected sites and add a test-only `TEST_RECEIPT_HMAC_KEY` constant.
- Extend `mcp-server/src/schemas/compose-dossier-envelope.ts` with `irlSource: z.enum(['partner-pasted', 'xlsx-canonicalized']).default('partner-pasted')` + optional `receipt: z.string().regex(/^[a-f0-9]{32}$/).optional()` + symmetric `.refine`: `(v.irlSource === 'xlsx-canonicalized') === (typeof v.receipt === 'string')` — bidirectional guard so a `partner-pasted` call with a stray receipt is rejected.
- Add `IrlReceiptInvalidError` in the envelope tool; wire `verifyReceipt` under the `xlsx-canonicalized` branch.
- **Tier-discipline (v11 Finding B)**: add `tier-fabrication` to `gapCategoryValues`. Implement `deriveTier(verdict)` in the envelope's auto-append loop. Emit `tier-fabrication:` when model-declared tier doesn't match derived tier from citation properties. Existing `tier-mismatch:` semantics preserved for partner-pasted callers; xlsx-canonicalized callers get both checks.
- Have `extract_irl_from_xlsx`'s handler call `computeReceipt(secret, irlBodyHash)` after canonicalization, return `{ ..., receipt }`, and embed both in `envelopeInstructions`.
- Cross-tool integration test (`tests/integration/irl-xlsx-receipt-enforcement.test.ts`) covering: (a) happy path (extract → envelope, both pass with real receipt), (b) bypass attack (envelope with `xlsx-canonicalized` + forged receipt → `IrlReceiptInvalidError`), (c) schema rejection (envelope with `xlsx-canonicalized` + missing receipt → Zod refine error), (d) backward compat (envelope with default `partner-pasted` + no receipt → today's behavior).
- Wrangler: `wrangler secret put RECEIPT_HMAC_KEY` for staging + production; `.env.example` for local dev.
- BREAKING_CHANGES entry covering new tool + new envelope args. Version bump server 0.12.x → 0.13.0; prompt 0.4.0 → 0.5.0.

### Phase 3 — Live validation (~30 min, operator-driven)

- Restart Claude Desktop with v0.13.0 `dist/index.js`.
- Re-run StoreForce IRL via the xlsx-attached workflow. Model attaches xlsx + invokes `/gst_irl_ingestion` interactive in a single touch.
- Capture the new dossier. Verify acceptance criteria (verified count per the tier-derived thresholds in § Acceptance criteria #1, tier-mismatches == 0, HMAC receipt check fires correctly on a synthetic forged-receipt attempt).

### Phase 4 — Doc updates + close (~15 min)

- Update this design doc's Status to "Shipped".
- Update [BL-049 BACKLOG entry](BACKLOG.md#bl-049-gst_irl_ingestion--server-side-xlsx-canonicalization-for-hash-bind-authority) → Done.
- Close the post-merge sequel checkbox on BL-045 PR B's PR description (if PR #212 is still open at merge time) — otherwise comment on the merged PR with the v12 dossier as architectural-closure evidence.

---

## Out of scope (explicit)

- **Generic xlsx → markdown conversion**. The parser is calibrated specifically to the canonical IRL workbook shape produced by `generate_information_request_list_xlsx`. Non-canonical xlsx inputs return `XlsxShapeError`. A general-purpose xlsx-to-markdown tool is BL-\* territory if and when an operator surfaces a use case.

- **xlsx editing or write-back**. This tool is read-only — it parses xlsx into canonical markdown. The reverse (markdown → xlsx) is what `generate_information_request_list_xlsx` already does under BL-044.

- **Loosening `FUZZY_MIN_RUN`** in the provenance verifier. Tempting micro-fix that would let more model paraphrases pass fuzzy, but weakens the architecture's fabrication-detection. BL-049's authoritative-source approach is the structural fix; verifier tuning is not.

- **In-Claude-Desktop attachment-to-arg automation.** Partners pasting the xlsx as an attachment then having Claude Desktop auto-encode it as base64 and bind it to a prompt arg is BL-046 territory. BL-049 ships the server-side canonicalization assuming the model can pass base64 to the tool (which is straightforward — the model already reads xlsx files into context).

- **xlsx provenance verification (hash-binding the xlsx itself).** This initiative gives compose_dossier_envelope's hash-bind an authoritative server source for the markdown body. Hash-binding the xlsx bytes back to a partner-signed source (e.g., "the IRL the partner emailed me on 2026-05-22") is BL-\* territory if compliance ever demands it.

- **Extended prompt arg `filledIrlXlsx`.** See § Considered alternative. May become attractive if Claude Desktop ships native attachment-to-arg adaptation via BL-046; revisit then.

---

## Senior-consultant review surface

Reviewer should validate:

1. **HMAC-receipt forcing function.** Is the cryptographic receipt (extract emits, envelope verifies under server secret) the right closure for the residual v0.12.0 escape hatch? Specifically: does it close the "model with code-execution computes its own sha256 of a fabricated body" attack class, and are the cross-session-replay implications (Risk 5) acceptable?

2. **The canonical-form spec**. Does the bullet shape (`Reference ID — Response text (Comment: ...)`) round-trip correctly with the BL-043 article? Does it cite-friendly substring-match against typical model citations like `"Section 00 row 0-03 — Recurring revenue ~$2.64M CAD/mo (Apr-2026)"`? Spot-check 3-4 citations from the v10/v11 dossiers against the proposed canonical body.

3. **The risk inventory**. Is the round-trip-with-BL-044-generator test sufficient mitigation against parser drift? Is the canonical-form snapshot test sufficient mitigation against spec drift?

4. **Acceptance criterion #1 thresholds**. Is the tier-distribution derivation (22 tier-1 verbatim + ≤8 tier-2 fuzzy + ≤2 unverified slack) the right calibration, or should `verified` be tighter (e.g., 30/30 with no fuzzy budget)? The derivation rests on the v11 dossier's tier mix — if a future engagement's IRL has a different tier distribution the thresholds need to flex.

---

_Created: June 3, 2026 — BL-049 design doc following BL-045 PR B v0.12.0 closeout. Status: Draft pending senior-engineer sign-off on the HMAC-receipt forcing function._
