---
promptName: gst_information_request_list
version: 0.0.1
recordedAt: 2026-05-22
model: claude-opus-4-7
---

# Worked example output for `gst_information_request_list`

V1 draft recording. To be replaced with the senior-consultant live-exercise capture during Step 5.5 of [BL-043](../../../src/docs/development/MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md#step-55-senior-consultant-content-review--blocking) — the prompts README authoring checklist § 10 ("Live-exercise it") is the source of truth for the final capture.

## Input — Trial (a) one-shot mode (target + transaction context)

```json
{
  "targetName": "MedSig Health",
  "transactionContext": "buy-side",
  "productSummary": "Pure-play SaaS for European hospital RCM workflows; multi-tenant, AWS Frankfurt-only, ~70 hospital-network customers."
}
```

A representative buy-side intake: known target, known transaction posture, partial product context. Designed to exercise voice tuning + productSummary-aware annotation.

## Input — Trial (b) interactive mode

Empty payload. Model recognized the empty input and asked the user for the target name, engagement context, and optional product summary, then emitted the universal artifact once the user supplied "MedSig Health, buy-side, [no summary]".

## Expanded prompt body

Two messages: (1) the rendered text body (one of two branches — one-shot when any arg is provided, interactive otherwise); (2) the embedded `gst://library/information-request-list` Resource carrying the canonical IRL article body (10 sections, ~63 bullets).

## Model output

**Trial (a) — one-shot mode (buy-side framing):**

Three-part deliverable matching the prompt's Step 1 / Step 2 / Step 3 contract:

- **Lead-in (one line)** — addressed to the MedSig Health team, framed as "GST is underwriting this transaction; the structured information below scopes the technical, regulatory, and organizational risk we need to size before the LOI."
- **Body (sections 00 → 09)** — verbatim reproduction of the canonical IRL article. The model preserved the section ordering and every bullet. One inline annotation appended to Section 03 bullet "Hosting model" — `_(already noted: pure-play SaaS, AWS Frankfurt-only per product summary)_` — keeping the bullet intact per the prompt's "compress, never delete" rule.
- **Close (one line)** — short turnaround request (5 business days), point of contact (`diligence@globalstrategic.tech`), preferred return format (filled markdown attached + supporting PDFs uploaded to the eventual VDR).

**Trial (b) — interactive mode:**

Model asked the user verbatim:

> What target or client is this for, and is the engagement sell-side, buy-side, or value-creation? If you can share a one-paragraph product summary, I can lightly tune the artifact; otherwise I will emit the universal template.

Once the user answered "MedSig Health, buy-side, no summary," the model emitted the same three-part deliverable as Trial (a) but with universal-voice framing (no productSummary annotation, generic close-line).

## Senior-consultant sign-off

To be captured during Step 5.5 of BL-043 (consultant review). Two open questions the consultant should answer during the review:

1. Does the buy-side lead-in read as if a senior partner wrote it, or does it feel template-y?
2. Is the "compress, never delete" rule actually load-bearing, or do we want the model to be more aggressive at trimming questions productSummary already answers?

The recorded output above will be **overwritten** with the actual Claude Desktop transcript once the live-exercise step completes. Until then this draft documents the expected shape of the deliverable.
