---
promptName: gst_irl_extract
version: 0.1.0
recordedAt: 2026-08-25
model: claude-fable-5
---

# Worked example output for `gst_irl_extract`

> **Status: DRAFT — no live run captured yet.** The frontmatter records authorship of this document, not a recording; the body below is design intent.

V1 draft (extract-only split out of `gst_irl_sweep`, operator ruling 2026-08-25).

## Input

```json
{
  "filledIrl": "<the populated IRL markdown — all 10 sections>"
}
```

## Expected behavior (design intent, pending live capture)

1. **Zero tool invocations, zero questions.** The model computes the fill ratio (halting only on the blank template), then emits the artifacts directly.
2. **The extract record v2** — `recordVersion: "2.0"`, six-field identityless `_meta` (self-dating via `generatedAt` + `promptVersion`, no hash, no source grade), one fact per answered row keyed by the workbook `Reference` column with the verbatim request text.
3. **Per-tool `payload:` fences** for each gate-passing tool (base schemas, no `_audit`), `elided:` lines for gate-failing ones.
4. **(J) Gaps & assumptions** closing the output.
