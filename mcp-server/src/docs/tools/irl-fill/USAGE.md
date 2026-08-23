# Usage: `fill_information_request_list_xlsx`

> **Audience**: an operator populating an IRL from evidence they already hold — before the target has returned a filled workbook, or on engagements where no target reply will ever come (pre-LOI screening, sell-side prep, competitive work).
>
> **Contract**: [`CONTRACT.md`](CONTRACT.md) owns the input surface and the sourcing grammar. **Acceptance walkthrough**: [`UAT-11-irl-fill.md`](../../testing/uat/UAT-11-irl-fill.md).

---

## The one-line workflow

Invoke **`gst_irl_fill`** with your engagement scoping (target, context, any section configuration) while the evidence is in the conversation — attached documents, a data-room export, filings, prior-session extractions, or things you have told the model. The prompt walks the model through inventorying that evidence, authoring per-row fills under the sourcing grammar, and calling this tool. You get back a populated `.xlsx`.

Direct tool calls work identically for programmatic consumers; the prompt exists so the sourcing discipline is applied without coaching.

## What comes back, and what to do with it

- **`filledRowCount` / `filledRefs`** — your review checklist. Open the workbook: each filled row shows its answer in Comments (E) and what it rests on in File Location (D). Spot-check the D references against the actual documents — the server validates their _shape_, deliberately not their existence.
- **`blankRowCount`** — the remaining ask. The blank rows ARE the follow-up: send the same workbook to the target and every gap is visible without a second artifact.
- **Status is `OPEN` everywhere**, filled or not — Status is the _recipient-confirmation_ channel, and nothing here was recipient-confirmed. When the target reviews a pre-filled row and agrees, they flip it, exactly as UAT-07's pre-populated-rows note anticipated.
- **The base64 payload is the artifact.** Write it to disk as the returned `filename`. There is no Hub download page for populated workbooks.

## Review, then ingest — the checkpoint is yours

The tool **never** starts the dossier sweep. When you are satisfied with the fills, run `gst_irl_ingestion` on the workbook exactly as you would for a target-returned one (flatten via `npm run irl:extract`, or attach). Expect two honest signals downstream, both documented residuals: the extractor lists every filled ref under _Comments-sourced answers_ (the answers live in E by design), and a flattened populated workbook grades `irlSource: model-reconstruction-from-xlsx` (flattening is a reconstruction; the per-row D references are what carry the sourcing).

## The union re-run recipe (more evidence arrived)

1. Re-invoke with the **full union**: every previously authored fill unchanged, plus the new rows.
2. To add a second source to an already-filled row, append a segment: `fileLocation: "VDR/00/entity-chart.pdf, page 1; [inferred from filing history]"` — and extend the `comments` prose rather than rewriting it.
3. Re-sending an identical union is safe: identical content comes back (only the generation date moves), and exact-duplicate source segments are dropped server-side.

## Authoring fills that pass the first time

- Locators are comma-separated, never dashed: `report.pdf, page 4` ✓ · `report.pdf — page 4` ✗ (em-dash) · `report (final).pdf` ✗ (parens).
- Non-document origins go in brackets: `[User stated this Jan 4 2026 2pm in session chat]`, `[inferred from FileA.pdf + FileB.xlsx]`.
- `ref` is the workbook Reference (`0-03`), **not** the `'NN-II'` exclusion key (`00-03`).
- An answer you cannot pin to anything: leave the row out. Blank is the honest state and the artifact shows it.
