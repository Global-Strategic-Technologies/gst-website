# UAT-11 — IRL fill (evidence-populated workbook)

**Covers**: `fill_information_request_list_xlsx` (tool), `gst_irl_fill` (prompt).

**What this family does**: produces a _populated_ Information Request List `.xlsx` from evidence already in the model's context — sourcing reference into File Location (column D), answer into Comments (column E) — so the dossier pipeline can start before the target returns a filled workbook. Rows the evidence cannot answer stay blank: the partially populated workbook is itself the follow-up ask. The tool stops at the artifact; a human reviews it before running `gst_irl_ingestion` exactly as for a target-returned IRL.

**Contract**: `src/docs/tools/irl-fill/CONTRACT.md` owns the input surface and the D-cell sourcing grammar. The frozen five-tool pipeline family is [`irl-pipeline/CONTRACT.md`](../../tools/irl-pipeline/CONTRACT.md) — nothing in this family modifies it.

**Prerequisites**: [`SETUP.md`](SETUP.md) once; Excel or any xlsx viewer for 11.2; the repo checkout only for 11.3 (`npm run irl:extract` is a repo script — the one case here that assumes repo access, marked as such).

---

## UAT-11.1 — Populate from evidence, scratch path

**Steps**

1. Call `fill_information_request_list_xlsx` with `targetName: "UAT Eleven Corp"`, `transactionContext: "buy-side"`, and three `fills` entries addressing rows you can see in `list_irl_requests` output, e.g.:
   - `{ ref: "0-01", fileLocation: "VDR/00/entity-chart.pdf, page 1", comments: "Delaware C-corp, single operating entity." }`
   - `{ ref: "1-01", fileLocation: "[inferred from product-overview.pdf + demo session]", comments: "Single multi-tenant SaaS surface." }`
   - `{ ref: "9-01", fileLocation: "[User stated this in session chat]", comments: "Five-member board, two independent seats." }`

**Expected**

- Success payload: `filename` (`GST-IRL-UAT-Eleven-Corp-<date>.xlsx`), `base64`, `mimeType`, `filledRowCount: 3`, `blankRowCount` = `bulletCount − 3`, `filledRefs: ["0-01", "1-01", "9-01"]`.
- The summary names the blank rows as the remaining ask and tells the operator to review and then run `gst_irl_ingestion` themselves — the tool must NOT have invoked any further tool.

**If it looks wrong**

| Observation                     | Likely meaning                                    | Action                                                       |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `filledRefs` missing a sent ref | The ref addressed a row not in this configuration | Check skip-if directives for the chosen `transactionContext` |
| Any second tool call fired      | Stop-at-artifact violated                         | Fail — file it                                               |

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |

---

## UAT-11.2 — The artifact in Excel

**Steps**

1. Write the 11.1 `base64` to disk as the returned `filename` and open it.

**Expected**

- The addressed rows carry the sourcing text in **File Location (D)** and the answer in **Comments (E)**, wrapped and top-aligned; every other request row has D/E empty.
- **Status is `OPEN` on every row, filled or not** — under the column discipline Status is the _recipient-confirmation_ channel, and nothing here was recipient-confirmed.
- The manual convention `[pre-populated, not recipient-confirmed]` (UAT-07 § On pre-populated rows) typed by hand into any of the same cells remains valid alongside tool-written segments — the grammar admits it verbatim.
- No em-dash and no parentheses appear anywhere in a tool-written D cell.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |

---

## UAT-11.3 — The frozen extractor reads it correctly _(repo access required)_

**Steps**

1. `npm run irl:extract -- <path-to-11.1-file>` from `mcp-server/`.

**Expected**

- Each filled row renders `- <ref> <request> [OPEN] — <answer> (Source: <D value>)` — the answer in the answer span, the sourcing inside `(Source: …)`.
- Each blank row renders `— <NO RESPONSE>` with no suffix.
- The stderr operator notes list every filled ref under **Comments-sourced answers** (expected — the answers live in E by design; see the contract's Accepted residuals) and report **no status contradictions**.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |

---

## UAT-11.4 — Pre-flight arithmetic downstream

**Steps**

1. Take the 11.3 markdown into `gst_irl_ingestion` (or hand-apply its § Wrong-IRL detector pre-flight).

**Expected**

- `substantiveCells` equals the fill count (3): a populated E counts toward `fillRatio`; a `(Source: …)` pointer alone does not.
- With 3 of ~67 rows filled the pre-flight lands below 15% and HALTs the sweep — correct behavior for so sparse a fill, and evidence the populated workbook is graded by exactly the same rules as a target-returned one.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |

---

## UAT-11.5 — Union re-run extends without overwriting

**Steps**

1. Re-call the tool with the 11.1 `fills` UNCHANGED plus (a) one new row, and (b) row `0-01` with a second source appended: `fileLocation: "VDR/00/entity-chart.pdf, page 1; [inferred from filing history]"` and one sentence appended to its `comments`.

**Expected**

- `filledRowCount` grows by one; `0-01`'s D carries both segments joined by `; `; nothing from the first run is lost or rewritten.
- Sending the identical union again produces identical cell content (only the `Generated` header and filename date can differ).
- A `fills` entry duplicating `"VDR/00/entity-chart.pdf, page 1; VDR/00/entity-chart.pdf, page 1"` comes back as the single segment — exact-duplicate segments are dropped server-side.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |

---

## UAT-11.6 — Error paths speak the operator's language

**Steps** (each is one call; all must fail with an actionable `invalid-input` message)

1. `fills: [{ ref: "00-01", … }]` — exclusion-key shape.
2. `fills: [{ ref: "0-99", … }]` — well-shaped but not in the workbook.
3. Two entries with the same `ref`.
4. `fileLocation: "TechDebt.pdf — page 4"` (em-dash), and `"SOC 2 report (2025), page 3"` (parens).
5. A `fills` entry with `fileLocation` but no `comments`, and one with `comments` but no `fileLocation`.

**Expected**

- 1 and 2 name the offending refs and explain the `0-03`-vs-`00-03` distinction (and that excluded/skip-if rows are absent).
- 3 names the duplicated refs and says to merge sources into one entry.
- 4 and 5 are rejected by the schema before the handler runs — sourcing without an answer and an answer without sourcing are both impossible by construction.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
