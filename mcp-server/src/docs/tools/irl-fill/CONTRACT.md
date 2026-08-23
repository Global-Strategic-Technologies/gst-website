---
tool: fill_information_request_list_xlsx
version: v1
lastAuthored: 2026-08-23
schema: mcp-server/src/tools/fill-information-request-list-xlsx.ts
---

# Input Contract: `fill_information_request_list_xlsx`

> **Why its own directory, when the tool is plainly IRL family**: this is forced, not chosen. [`irl-pipeline/CONTRACT.md`](../irl-pipeline/CONTRACT.md) declares itself "five tools, one family" and sits inside the BL-140 freeze — the entire pre-existing IRL path takes zero edits from this initiative. The compensating discoverability pointer for readers who land on the family contract is the IRL-family enumeration in [`ARCHITECTURE.md`](../../ARCHITECTURE.md), which names this tool and this document.
>
> **Sources of truth** (this contract cites them; it does not duplicate them):
>
> - **Validation**: [`fill-information-request-list-xlsx.ts`](../../../tools/fill-information-request-list-xlsx.ts) — `FillIrlXlsxInputSchema` and `IRL_FILE_LOCATION_PATTERN`, both inline in the tool file.
> - **Design record**: [ADR-0021](../../../../../src/docs/adr/0021-irl-fill-d-cell-sourcing-grammar.md) — the D/E placement consequence chain, the grammar's forbidden-character rationales, the per-row attribution floor, and the compositional-idempotency split.
> - **Canonical question source**: the same [`src/data/irl/information-request-list.md`](../../../../../src/data/irl/information-request-list.md) the frozen generator reads, through the same `parseIrlArticle → customizeIrlArticle → generateIrlXlsxBuffer` pipeline.
>
> **Used by prompt**: `gst_irl_fill` (see [`prompts/README.md`](../../prompts/README.md)) — evidence inventory → authored fills → this tool → **stop at the artifact**.
>
> **Acceptance walkthrough**: [`UAT-11-irl-fill.md`](../../testing/uat/UAT-11-irl-fill.md).
>
> **Version**: `v1` | **Last authored**: 2026-08-23
>
> **Registry**: see [`../README.md`](../README.md) for the "what is an input contract" narrative and the cross-tool registry.

---

## What the tool is

The dossier pipeline's hard external dependency — _a third party must return a filled workbook before anything downstream can run_ — removed for the cases where the information already exists. The model authors per-row `fills` from evidence in its context; the tool rebuilds the canonical workbook **at build time** with each fill's sourcing reference written to **File Location (D)** and its answer to **Comments (E)**. The server never holds the artifact: it returns `{ filename, base64, mimeType, … }` and the client writes the file.

**Placement is the entire design.** Under the frozen extraction rules (ADR-0015), the answer span is Response (G) + Comments (E) joined, while File Location (D) renders inside `(Source: …)` and never counts as signal. So a filled row's answer is substantive — it counts toward `fillRatio` and opens the ingestion inclusion gates — while its sourcing stays exactly where non-signal belongs, and the emitted workbook behaves downstream **identically to a target-returned one, with zero edits to any frozen surface**. Machine-proven by the conformance suite ([`fill-irl-conformance.test.ts`](../../../../tests/unit/tools/fill-irl-conformance.test.ts)), which runs the emitted artifact through the real extractor and the real provenance engine.

## Input surface

**Scoping arguments** — the frozen generator's, verbatim, minus `productSummary` (its purpose is _removing_ questions the model can answer; this tool _answers_ them): `targetName?`, `transactionContext?` (fires skip-if directives), `companyName?`, `projectName?`, `includeSections?`, `excludeRequests?` (`'NN-II'` keys), `customRequests?`, `showCanonicalReference?`.

**`fills`** — 1–200 entries of `{ ref, fileLocation, comments }`, all three required per entry:

| Field          | Constraint                                           | Meaning                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref`          | `IRL_REF_PATTERN` (`0-03` shape), unique, must exist | The workbook **Reference** column value — unpadded section digit(s) + two-digit ordinal. **NOT** the `'NN-II'` exclusion key (`00-03`). Custom-request rows are addressable (ordinals past the canonical count). |
| `fileLocation` | 1–300 chars after trim, D-cell grammar (below)       | What the answer rests on → column D. A reference, not an excerpt — no quotes, no confidence grades, no evidence payloads.                                                                                        |
| `comments`     | 1–2000 chars after trim, no control characters       | The answer itself → column E. Single-line plain prose. An entry here **is** an answer under the frozen rules — never a placeholder or a caveat.                                                                  |

**Two operator rulings are structural, not checked after the fact**: requiring both fields on every entry makes "every answered row carries a well-shaped D" and "the fill never writes D without E" unrepresentable to violate. This is the ruled fill-time verification — **shape only**; whether the referenced document exists is deliberately not checked (the Worker cannot see it; the reference exists for the human reviewer to follow).

## The D-cell sourcing grammar

```
segment   := bracketed | reference
bracketed := "[" SEG "]"
reference := SEG                      (document ref + optional comma-separated locator)
SEG       := any chars EXCEPT ] [ ( ) em-dash(U+2014) ; and control characters, 1–200
cell      := segment ("; " segment)*   (300-char cap after trim)
```

Accepted: `TechDebtRegistryAndRoadmap.pdf, page 4, paragraph 2` · `VDR/06/soc2-2025.pdf, section 3.2` · `[User stated this Jan 4 2026 2pm in session chat]` · `[inferred from FileA.pdf + FileB.xlsx]` · `[pre-populated, not recipient-confirmed]` (the UAT-07 manual token — the grammar is a superset of it) · multi-segment `10-K FY2025, Item 1A; [inferred from 10-K FY2025 + earnings call 2026-01-15]`.

Each forbidden character traces to a frozen-path mechanism:

| Forbidden               | Mechanism                                                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| em-dash (U+2014)        | `validate_irl_provenance`'s excerpt extractor anchors on the **last** em-dash in a citation; one copied from D would collapse the checked excerpt to the tail (a demonstrated wrong-vendor false verification). En-dash and hyphen stay legal. |
| `(` `)`                 | The extractor renders D inside `(Source: ${d})` paren-naively — a `)` closes the group early for every downstream reader.                                                                                                                      |
| control chars (CR/LF …) | In-cell newlines survive into the flattened markdown and detach `(Source: …)` from its bullet (the extractor's own docstring records this).                                                                                                    |
| `;` inside a segment    | Reserved as the multi-segment separator so a re-run can append sources and each stays parseable.                                                                                                                                               |
| nested/stray brackets   | Keeps bracketed origin tokens unambiguous.                                                                                                                                                                                                     |

## Failure modes

All `invalid-input`, all actionable: **duplicate refs** (named; merge sources into one entry with `; ` instead), **unknown refs** (named, with the `0-03`-vs-`00-03` hint and a reminder that excluded/skip-if rows are not in this workbook), **zero-section configuration** (same guard as the frozen generator). Grammar and pairing violations are rejected by the schema before the handler runs.

## Idempotency — split across two surfaces, deliberately

- **The tool guarantees content-level determinism**: identical `(scoping, fills)` → identical workbook content; only `generatedAt` varies (filename date slug + `Generated` header row), exactly like the frozen generator (`idempotentHint: false` for the same reason). It also dedups **exact-duplicate D segments** (first-seen order), so a re-sent union can never double-write a source. `comments` gets no dedup — the idempotency unit for E is the whole value.
- **The prompt owns carry-forward**: the server never holds a workbook, so extend-don't-overwrite is compositional — `gst_irl_fill` instructs re-runs to pass the full union (prior fills unchanged, new D segments appended with `; `, answer prose extended). Same union in → same content out; new evidence → strictly additive change.

Neither surface silently owns the other's half; both state the split.

## Output

```
{ filename, base64, mimeType, byteLength, sectionCount, bulletCount,
  filledRowCount, blankRowCount, filledRefs, canonicalUrl }
```

`filledRefs` (sorted) is the operator's review checklist; `blankRowCount` is the remaining ask. **No `downloadUrl`** — the Hub generator page produces _blank_ workbooks, and pointing at it would hand the operator the wrong artifact; the base64 payload is the delivery (v1 residual, below). Second `textOmit: ['base64']` tool by design — same channel-asymmetry rationale as the generator sibling.

## Accepted residuals — recorded so none is rediscovered as a defect

1. **Filled rows list under the extractor's `commentsSourcedAnswers` operator note.** Expected: the answers live in E by operator ruling, and the note is the frozen path's honest report of that. Pinned by conformance test C3.
2. **`irlSource` stays transport-only.** A populated workbook flattened for ingestion is `model-reconstruction-from-xlsx` under UAT-07.7's rule ("flattening a workbook IS a reconstruction") and draws the reconstruction disclosure — the accepted asymmetry; per-row sourcing lives in the cells, not the enum.
3. **Provenance verification stays mechanically circular for self-filled rows.** `validate_irl_provenance` matches claims against a body this tool's fills authored; what closes the loop is that every filled row names a locatable source in D that a human reviewer can pull — the trail terminates at a document a person opens, exactly like a diligence footnote. (BL-140 consequence 1, accepted trade.)
4. **Base64-only delivery.** No Hub surface can reconstruct a populated workbook, and Claude Desktop cannot render arbitrary-mimeType attachments (BL-046 territory). A Hub delivery surface is a recorded backlog candidate.
5. **The zip container's bytes are wall-clock dependent** (fflate stamps local-time DOS mtimes), so byte-identity statements about the frozen path are **entry-level** — sha256 over unzipped entry names + content bytes, which no clock touches. Never claim "frozen clock alone suffices" for whole-buffer comparison: the mtime is timezone-dependent too.

## The freeze this tool ships under

The five IRL pipeline tools, both prior IRL prompts, `npm run irl:extract`, and all their docs are untouched by BL-140. The one shared-module change is `generateIrlXlsxBuffer`'s **additive optional prefill parameter** — the frozen generator never passes it, and its no-prefill output is pinned byte-identical (entry-level golden captured from pre-change code in the branch's first commit).
