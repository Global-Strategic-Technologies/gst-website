# IRL Partner-Paste-Verbatim Operator Runbook

> **Audience**: GST operators (consultants) preparing a `gst_irl_ingestion` run for a client-facing or regulatory deliverable.
>
> **What this covers**: how to convert a partner's filled `.xlsx` IRL into canonical markdown and paste it into the `gst_irl_ingestion` prompt's `filledIrl` argument so the run produces a `partner-paste-verbatim` dossier with the strongest BL-049 hash-bind authority.
>
> **Why this path exists**: by default the model parses the `.xlsx` attachment and reconstructs markdown in memory (`model-reconstruction-from-xlsx`). That path produces useful drafts but has two structural weaknesses for large IRLs:
>
> 1. **BL-049 authority is `pass-internal`** — the model controls both the body and the hash, so the hash-bind doesn't anchor to the partner's authoritative source.
> 2. **Model output-stream emission ceiling** — for large IRLs (~60-80KB), the model truncates the body when emitting it as tool args to `prepare_irl_body` / `validate_irl_provenance`. Empirically observed 2026-06-07 on a 77,743-byte body: only 1,753 bytes were cached (hash mismatch self-detected and the run halted).
>
> The partner-paste path moves both responsibilities to the operator: you produce the markdown bytes once, paste them into the prompt arg, and the BL-076 hash-bind anchors to those exact bytes. The model never has to reconstruct.
>
> **Companion docs**:
>
> - [the `gst_irl_ingestion` companion doc](../../../mcp-server/src/docs/prompts/irl-ingestion.md) — contract + execution model + enforcement design.
> - [ADR-0003 — xlsx canonicalization (deferred)](../adr/0003-irl-xlsx-canonicalization-hash-bind.md) — the deferred server-side `extract_irl_from_xlsx` design. This runbook's `npm run irl:extract` script is the **operator-local equivalent** of that tool: same conversion, runs on the operator host instead of on the server.
> - [ADR-0002 — IRL body-by-hash cache](../adr/0002-irl-body-by-hash-cache.md) — the mechanism that makes the paste actually cheap.
> - [the IRL mapping SOP § Design provenance](../../../mcp-server/src/docs/library/irl-tool-input-mapping.md) — canonical IRL article + Resource.
> - [MCP_SERVER_IRL_GENERATOR_BL-044.md](_archive/MCP_SERVER_IRL_GENERATOR_BL-044.md) — `.xlsx` generator. The extract script is its structural inverse.

---

## Quick reference

```powershell
# From the repo root:
cd c:\Code\gst-website\mcp-server
npm run irl:extract -- ..\path\to\PRAXIS-IRL-Acme_filled.xlsx --out c:\tmp\acme-irl.md
```

Then in Claude Desktop, invoke `/gst_irl_ingestion` and paste the contents of `c:\tmp\acme-irl.md` into the `filledIrl` argument. Done.

The rest of this doc explains the why, the validation, and the edge cases.

---

## When to use partner-paste-verbatim

| Scenario                      | Path                                                   | Why                                                                           |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Internal draft / sanity check | xlsx attachment → model reconstructs                   | Fast, model handles the work, body is small                                   |
| Partner-internal use          | xlsx attachment → model reconstructs                   | Same; the `provenance-gap:` auto-append (BL-072) makes the limitation visible |
| Client-facing deliverable     | **the `filledIrl` prompt ARGUMENT**                    | Strong BL-049 authority; no model emission ceiling                            |
| Regulatory submission         | **`filledIrl` ARGUMENT + `requireVerbatimBody: true`** | BL-070 gate enforces the verbatim discipline at the server seam               |
| M&A close / post-mortem       | **`filledIrl` ARGUMENT + `requireVerbatimBody: true`** | Same                                                                          |

> **The route, not the grade.** These rows used to name `partner-paste-verbatim`, which is the `irlSource` GRADE. Since prompt 0.30.0 that grade is also earned by a chat paste and by a `.md` ATTACHED to the invoking message, neither of which yields `pass-bound` — so naming the grade here would point an operator at a route that cannot satisfy the client-ready checklist. What these tiers need is the `filledIrl` prompt ARGUMENT specifically. See [OPERATOR_RUNBOOK.md](./OPERATOR_RUNBOOK.md) — two gates, two axes.

If the IRL is under ~5KB-10KB and you trust the model's reconstruction, the xlsx-attachment path is fine. The partner-paste path is for **size-or-stakes-driven runs**.

---

## Step-by-step

### Step 1 — Get the filled `.xlsx`

The partner returns the `.xlsx` GST generated for them via `generate_information_request_list_xlsx` (the BL-044 generator). It has the same shape we ship:

- Sheet 1 ("Information Request List"): 7-column layout — `Reference | Request | Status | File Location | Comments | Notes | Response`
- Header rows: target name, engagement context, generated date, canonical URL
- One row per section header (uppercased), optional section intro, then bullet rows for each request
- Status column pre-fills `OPEN`; partner promotes to `PARTIAL` or `CLOSED` and fills the Response column
- **All four content columns — File Location, Comments, Notes and Response — are read into the body** (BL-120). GST pre-populates research into Comments, sources into File Location and caveats into Notes; the recipient confirms via Status. Comments is treated as an answer, not a side channel — see [ADR-0015](../adr/0015-irl-canonical-body-reads-full-workbook.md)

If you received a different workbook layout, **stop and re-issue the canonical `.xlsx`** via `generate_information_request_list_xlsx`. The extract script targets the canonical shape; arbitrary partner spreadsheets won't parse.

### Step 2 — Convert to canonical markdown

From the repo root in PowerShell or any shell:

```powershell
cd c:\Code\gst-website\mcp-server
npm run irl:extract -- C:\path\to\PRAXIS-IRL-Acme_filled.xlsx --out C:\tmp\acme-irl.md
```

Or directly from any directory:

```powershell
node c:\Code\gst-website\mcp-server\scripts\extract-irl-markdown.mjs C:\path\to\PRAXIS-IRL-Acme_filled.xlsx --out C:\tmp\acme-irl.md
```

To pipe to stdout instead of writing to a file:

```powershell
node c:\Code\gst-website\mcp-server\scripts\extract-irl-markdown.mjs C:\path\to\PRAXIS-IRL-Acme_filled.xlsx | clip
```

(`| clip` puts the markdown directly in your clipboard on Windows. macOS/Linux: `| pbcopy` / `| xclip -selection clipboard`.)

#### Script output shape

The script emits:

```markdown
# Information Request List — Acme Co (filled)

> Engagement context: Value Creation
> Generated: 2026-05-23
> Canonical reference: https://globalstrategic.tech/hub/library/information-request-list/

- 0-01 Company name [CLOSED] — Acme Solutions Inc. (Delaware C-corp)
- 0-02 Engagement context [CLOSED] — value-creation, post-close
- 0-03 Annual recurring revenue [CLOSED] — $45.2M USD (FY26 actual). Excludes the two acquisitions closed in Q4 (Source: VDR/03-Financials/arr-bridge.xlsx) (Note: unaudited)
- 1-01 One-paragraph product description [CLOSED] — B2B SaaS for retail workforce mgmt
- 1-03 Product roadmap snapshot [OPEN] — <NO RESPONSE> (Source: VDR/01-Product/roadmap-FY27.pdf)
- 10-01 Deal team contacts [CLOSED] — Phil Cunningham (MD), Nishant Patel (Principal)
```

- Title line: `# Information Request List — <Target> (filled)` — matches the model's reconstruction-mode preamble.
- Metadata block: YAML-style blockquotes for engagement context / generated date / canonical reference.
- Bullet rows: flat list. `- <ref> <request> [<STATUS>] — <answer> (Source: <D>) (Note: <F>)`.
- **The answer is Response and Comments joined into one contiguous span**, Response first, with a period inserted unless Response already ends in `.` `?` `!` `:` `;` `,` `…` or a dash — tested after any closing brackets and quotes are peeled off, so `…weekly,"` continues the clause rather than gaining a stray period. Never labelled: a label between the halves breaks any citation reading across the boundary. `0-03` above shows the join.
- **Source and Note stay outside the answer.** A row whose only content is a file pointer renders `— <NO RESPONSE> (Source: …)`, as `1-03` shows — so a filename can never make a row read as answered, inflate the fill ratio, or open an inclusion gate.
- Rows with nothing in D/E/F/G emit `— <NO RESPONSE>`. This is a human-readable marker only: no server code parses it and it does **not** become a (J) gap entry — the fill ratio is what accounts for unanswered rows.

#### Sanity-check the output before pasting

Quick checks (the script's stderr already reports bullet count + sections):

```powershell
# Byte size — should be in the 5-150KB range for a typical IRL.
(Get-Item C:\tmp\acme-irl.md).Length

# Section coverage — should include every section that had partner responses.
Get-Content C:\tmp\acme-irl.md | Select-String -Pattern '^- (\d+)-' | ForEach-Object { ($_ -split '-')[0] } | Sort-Object -Unique

# Spot-check the head and tail (matches `filledIrl.fingerprint.headChars`
# / `tailChars` you'll see in the RUN-AUDIT block).
Get-Content C:\tmp\acme-irl.md | Select-Object -First 5
Get-Content C:\tmp\acme-irl.md | Select-Object -Last 5
```

**Read the script's stderr — it prints two ref lists and a size note, and this is the one moment you can still open the workbook and check.**

- **"took their answer from Comments because Response was empty"** — these rows' answers came from Comments alone. Comments is read as an answer, but workbooks filled before BL-120 were told Comments was also for caveats, so a caveat can masquerade as _the_ answer here. Once extracted, the two are indistinguishable. Skim these rows in the xlsx before the body goes into a client-facing deliverable. Rows where Response was non-empty are not listed: there, Comments rides alongside a real answer and the row is answered either way.
- **"claim a Status of CLOSED/PARTIAL but every content column is empty"** — a genuine contradiction. Either the answer never landed, or it is somewhere the script does not read. These render `<NO RESPONSE>`.
- **A note when the body exceeds ~57KB** — scoped to one thing: **claude.ai web refuses a prompt argument that size outright; use Claude Desktop.** Nothing else is affected (the server body cache accepts 200KB, and the Desktop → prepop path never emits the body). Bodies in the 5–150KB range are normal.

### Step 3 — Invoke `gst_irl_ingestion` in Claude Desktop

Open the slash-command form for `gst_irl_ingestion`. Fill these fields:

| Field                 | Value                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filledIrl`           | **paste the contents of `C:\tmp\acme-irl.md`** (Ctrl+A then Ctrl+C in your editor, Ctrl+V into the form field) |
| `targetName`          | The target's name (e.g. `Acme Co`)                                                                             |
| `transactionContext`  | `value-creation` / `buy-side` / `sell-side` / `unknown`                                                        |
| `partnerLead`         | Your name                                                                                                      |
| `projectCodeName`     | Optional internal code name                                                                                    |
| `requireVerbatimBody` | **`true`** for client-facing / regulatory / M&A close runs; omit (defaults to `false`) for drafts              |

> ℹ️ **Your paste will probably lose its line breaks, and that is fine.**
>
> Claude Desktop renders each prompt argument as a single-line input, so a multi-line paste arrives with every newline collapsed to a space. Every word survives in order; the document becomes one long line.
>
> **The run works normally.** Citation verification collapses whitespace before matching, so it cannot tell the difference, and nothing downstream reads line structure. A run on a flattened body is a valid run at full `partner-paste-verbatim-prepop` grade.
>
> **The one consequence**: the body will not hash-match the file on your disk, because the bytes genuinely differ. The `RUN-AUDIT` block reports `filledIrl.newlines: 0` so you can see why in one line rather than investigating a hash mismatch.
>
> (BL-123 briefly refused these runs outright. That was withdrawn in BL-124 — the harm was asserted rather than demonstrated, and the refusal left no working path at any realistic IRL size.)

**Do NOT also attach the xlsx.** With `filledIrl` supplied, the model uses the paste; attaching the xlsx in addition would invite the model to choose reconstruction mode for some tools, defeating the point of the paste.

### Step 4 — Validate the run

Watch for these signals in the dossier and the closing `RUN-AUDIT` block. **The block is emitted at `auditLevel: debug` only** — invoke the prompt at that level when the run needs to be signed off; a `standard` run is a draft and produces no block to read.

- **`filledIrl.source: partner-paste-verbatim`** — confirms the paste was taken, not reconstruction.
- **`firstEnvelopeCall.hashBindResult: pass-bound`** — the strong BL-049 form. (`pass-internal` here would mean the model didn't see the `**Body-binding hash:**` directive from the rendered prompt body; investigate.)
- **`firstEnvelopeCall.provenanceVerification: { unverified: 0 }`** ideally — every load-bearing claim's excerpt was found in the body you pasted.
- **`(J) Gap list` does NOT carry a reconstruction-mode `provenance-gap:` entry** — that auto-append (BL-072) is reserved for `model-reconstruction-*` runs.
- **`precheck.outcome: converged`** in one iteration — typical for a clean partner-paste.

If `requireVerbatimBody: true` was set and the model self-degraded to a reconstruction `irlSource`, the server (BL-070) rejects the `compose_dossier_envelope` call with a structured `Bl070VerbatimBodyRequiredError`. That's the gate working; re-invoke and don't let the model deviate.

---

## Edge cases

### Multi-line responses

Partners sometimes paste multi-line text into the Response column. The script preserves the cell content verbatim — the resulting bullet may carry embedded newlines. This matches the model's reconstruction behavior and the `validate_irl_provenance` engine handles it via fuzzy-window citation matching.

If you need a strictly single-line bullet, edit the markdown post-extract before pasting.

### Status column shows non-standard values

The script passes Status through verbatim. If the partner introduced custom values (e.g. `DEFERRED`, `N/A`), they'll appear in the bullet as `[DEFERRED]`. The downstream prompt doesn't care — Status is informational for the gap-list emitter, not a validation rule.

### Workbook is not the canonical shape

If the script extracts 0 bullets, it exits non-zero with a warning. Common causes:

- The partner replied with a free-form Word doc instead of editing the `.xlsx` we sent — convert manually
- The partner re-formatted the workbook (added/removed columns, deleted the header rows) — re-issue a fresh `.xlsx` and ask them to fill it in place
- You pointed at the empty template, not the filled return — check the file modification date

### Body is larger than the prompt-arg ceiling

Claude Desktop's prompt-arg field has a practical paste ceiling (much higher than the model's tool-call args ceiling, but not unlimited). If your extracted markdown is > 500KB, you've likely got a partner who pasted attachments into Response cells; trim them out manually and re-extract.

For a normal-sized IRL with normal-sized responses, the 100–150KB range is typical and well within Claude Desktop's paste capacity.

---

## What the script does NOT do

- **It does not parse partner attachments or hyperlinked content.** Response cells are taken as literal text only.
- **It does not validate the IRL is "complete."** That's the prompt's job (`fillRatio` pre-flight). The script extracts whatever's there.
- **It does not redact PII.** What the partner wrote is what you paste. Use judgment if the IRL contains employee names, customer references, or sensitive figures.
- **It does not handle non-canonical workbooks.** If the layout differs from the BL-044 generator output, re-issue or convert manually.

---

## Troubleshooting

| Symptom                              | Likely cause                                                            | Fix                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Warning: extracted 0 bullet rows`   | Non-canonical workbook OR pointing at the empty template                | Re-issue via `generate_information_request_list_xlsx`; ask partner to fill                                                        |
| Output is much smaller than expected | Most cells are still `OPEN` with no Response — partner didn't fill them | Confirm with partner; proceed with what you have (gap list will flag)                                                             |
| Bullets are missing Status tags      | Partner deleted the Status column                                       | Script normalizes empty Status to `OPEN`; safe to proceed                                                                         |
| Hash mismatch after paste            | You pasted partial content (clipboard truncated)                        | Re-copy from the file directly (`Get-Content -Raw`) or use `--out` to write to a file you can open in an editor and Ctrl+A select |
| `Cannot find module 'xlsx-js-style'` | Running from outside `mcp-server/` without npm-installed deps           | `cd mcp-server && npm install` first                                                                                              |
| Script reports an unknown sheet name | Workbook came from a different generator                                | Re-issue via `generate_information_request_list_xlsx`                                                                             |

---

## Round-trip integrity

The script is unit-tested at [`mcp-server/tests/unit/scripts/extract-irl-markdown.test.ts`] against the `generateIrlXlsxBuffer` generator. Coverage includes:

- Every bullet survives the round-trip with reference / request / status / response intact
- Rows with nothing in File Location, Comments, Notes **or** Response emit `— <NO RESPONSE>`
- Metadata header rows populate the YAML preamble
- Section header rows + intros are correctly filtered (canonical body is a flat bullet stream, matching the model's reconstruction shape)
- PARTIAL / OPEN / CLOSED status values pass through verbatim
- Workbooks with zero bullets fail gracefully (CLI exits 1; library function returns `{ bulletCount: 0 }`)
- **BL-120**: Comments becomes the answer when Response is empty; the two join contiguously when both are present (against a Response ending in a letter, in terminal punctuation, and in a comma); Source/Note render as suffixes; and a row carrying only a File Location or only a Note still reads `<NO RESPONSE>`
- **BL-120**: a citation spanning the Response→Comments boundary **with the joining period dropped** verifies through `validate_irl_provenance` — the regression that killed the first, labelled version of this format ([ADR-0015](../adr/0015-irl-canonical-body-reads-full-workbook.md))

The generator is the single source of truth for the workbook shape. If a future canonical-article edit changes the layout, the round-trip tests catch the drift before the extract script ships.

`mcp-server/tests/fixtures/northwind-workbook-columns-filled-irl.md` is verbatim output of this script over a synthetic 7-column workbook, exercised through the **prompt** path in `tests/integration/irl-ingestion-fixtures.test.ts` — that pairing is what would catch the operator path and the model path drifting apart.
