# ADR-0021: The IRL fill writes answers into E and sourcing into D under a grammar the frozen path cannot misread

- **Status**: Accepted 2026-08-23 (BL-140, server 0.59.0; tool `fill_information_request_list_xlsx`, prompt `gst_irl_fill@0.1.0`)
- **Source initiative**: BL-140 (the BACKLOG stanza it replaces — including the 2026-08-23 operator rulings this ADR distills — is recoverable via `git log -- src/docs/development/BACKLOG.md`)

## Context

The dossier pipeline had a hard external dependency in its middle: nothing on the surface could populate an IRL until the target returned a filled workbook, even when the evidence already sat in the model's context (a data-room export, remitted documents, public filings, prior sessions). BL-140 adds the missing capability — one new tool + one new prompt — under a total freeze of the existing path: the five IRL tools, both prior IRL prompts, `npm run irl:extract`, and their docs take **zero edits**, and whatever the new surface emits must behave correctly under today's rules exactly as written.

The constraint that shapes everything: the Worker sees only its JSON input. It cannot read the operator's attachments or data room, so population is model-side by necessity, and the sourcing reference must be written **at the moment the row is answered** by the only participant that can see the document.

## Decision

### 1. Placement: answer → Comments (E), sourcing → File Location (D); no new column

Under the frozen extraction rules (ADR-0015) the answer span is Response (G) + Comments (E) joined, and File Location (D) renders inside `(Source: …)`, which the pre-flight and inclusion gates already treat as non-signal. Writing the answer to E and the reference to D therefore lands everything where the frozen rules already behave correctly: the answer is substantive (counts toward `fillRatio`, opens gates) precisely because the row is genuinely answered, and the sourcing is non-signal precisely because a pointer is "a promise of signal", as the ingestion prompt has always ruled. The seven-column contract is untouched. Conformance is machine-proven by running the emitted artifact through the **real** extractor and provenance engine (`mcp-server/tests/unit/tools/fill-irl-conformance.test.ts`).

### 2. The D-cell grammar

One cell = one or more segments joined by `"; "`; a segment is a document reference with an optional comma-separated locator, or a bracketed non-document origin (`[User stated this Jan 4 2026 2pm in session chat]`, `[inferred from FileA.pdf + FileB.xlsx]`). Bare unattributable inference stays unwritten — the row stays blank, and the partially populated workbook is itself the follow-up ask. Every forbidden character traces to a frozen-path mechanism, not to taste:

- **em-dash (U+2014)** — `validate_irl_provenance`'s excerpt extractor anchors on the _last_ em-dash in a citation; an em-dash copied from a rendered D into a citation collapses the checked excerpt to the tail (a demonstrated wrong-vendor false verification). En-dash and hyphen stay legal: normalization flattens all three in the haystack; only the citation-side anchor is em-dash-specific.
- **`(` `)`** — the extractor renders D inside `(Source: ${d})` paren-naively.
- **control characters** — in-cell newlines survive into the flattened markdown and detach `(Source: …)` from its bullet.
- **`;` inside a segment** — reserved as the separator so re-runs can append sources and each segment stays parseable.
- **nested/stray brackets** — keeps bracketed origin tokens unambiguous.

The manual UAT-07 convention `[pre-populated, not recipient-confirmed]` parses as a valid bracketed segment — the grammar is a superset of it, reserving no bracket prefix of its own.

**Two rulings are structural**: every `fills` entry requires _both_ `fileLocation` and `comments`, so "every answered row carries a well-shaped D" and "the fill never writes D without E" cannot be violated, only rejected. The check is shape-only by ruling — whether the referenced document exists is deliberately unverified (the Worker cannot see it; the reference exists for a human reviewer to follow). Provenance verification therefore stays mechanically circular for self-filled rows; the trail terminates at a document a person opens, like a diligence footnote. Accepted trade, recorded here so it is not rediscovered as a defect.

### 3. Attribution granularity: per-row floor

No inline markers inside E. Under the v1 answers-from-scratch scope every E byte is GST-authored (the tool carries no partner-content fields), so a mixed partner/GST span cannot arise from it; inline markers would sit inside the answer span, break ≥8-word contiguous citation runs, and inflate `fillRatio` with non-answer bytes. The genuinely mixed workbook (target partially returned + GST top-up) is a recorded backlog candidate — additive `response`/`status`/`notes` fields on the same `fills` entries.

### 4. Idempotency is split compositionally

The server never retains a workbook (consistent with ADR-0019's no-retention posture), so extend-don't-overwrite cannot be a server edit. The **tool** guarantees content-level determinism (identical inputs → identical cell content; only `generatedAt` varies) and dedups exact-duplicate D segments; the **prompt** owns carry-forward (re-runs pass the full union, appending segments and extending prose). Same union in → same content out; the ruling's "re-running changes nothing" holds at the artifact level. Both surfaces state the split so neither silently owns the other's half.

### 5. The freeze exception, and what "byte-identical" means

`generateIrlXlsxBuffer` gained an additive optional `prefill` parameter (rows stay 3-element arrays on the no-prefill path; prefill lands by index assignment so absent cells stay holes, never `''`; a wrap-alignment style object is created only for prefilled cells). The frozen generator never passes it, and its output is pinned by a golden captured from **pre-change code** in the branch's first commit. The golden is **entry-level** — sha256 over the unzipped entries' sorted names + content bytes — because fflate's `zipSync` stamps each entry's DOS mtime from _local-time_ wall-clock getters: whole-buffer bytes vary with clock **and timezone** (verified empirically; frozen clock alone does not suffice). No entry _content_ depends on the clock — xlsx-js-style writes no dcterms timestamps, and the only workbook date is the explicit `generatedAt` parameter.

Also additive: `enumerateWorkbookRefs(article)`, flat-mapping the same module-private per-section walk `buildPrimarySheet` consumes — one `ordinal ?? dense-counter` walk for both the sheet and the fill tool's ref validation, closing the workbook-ref-vs-`NN-II`-key drift class the builder's own docstring warns about.

### 6. What was deliberately not built

- **No `irlSource` change** — the enum grades transport, not sourcing; a flattened populated workbook is `model-reconstruction-from-xlsx` and draws the reconstruction disclosure (accepted asymmetry; per-row sourcing lives in the cells).
- **No server-held cap** on the fills — the BL-121/BL-123 cap-a-self-assertion pattern requires a server-side copy of the same fact, and analytical work product has none; the server carries and structures what each row rests on, it does not referee it.
- **No auto-ingestion** — the tool and prompt both stop at the artifact; a human review checkpoint sits between fill and ingest. This is also why `gst_irl_fill` is excluded from `consumesTargetEvidence`: that clause's mandatory upgrade path instructs the sweep tools.
- **No Hub delivery surface, no live data-room connectors, no server-side document parsing** — the first is a recorded backlog candidate; the others are out of scope by ruling (evidence arrives through model context).

## Consequences

Time-to-first-dossier collapses from the target's response cycle to a session; the ask that does go out improves for free (blank rows are the follow-up, legible in the artifact itself); engagements that never produce a returned IRL become reachable. Future surfaces touching IRL cells must not break the D-cell grammar — in particular, nothing may introduce em-dashes into D or make `(Source: …)` rendering paren-aware without revisiting this ADR.
