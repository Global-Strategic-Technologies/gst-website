# UAT-09 — Prompts

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`prompts/README.md`](../../prompts/README.md); for the largest, [`prompts/irl-ingestion.md`](../../prompts/irl-ingestion.md)

Nine `gst_*` prompts — typed, versioned macros that orchestrate tools and resources into a finished work product. A full pass proves the thing tool-level cases cannot: that a **published workflow** runs end to end and produces the document a partner expects, in the right structure, with its provenance intact.

> **Mode A only.** Invoking a prompt is a client-side capability; there is no wire equivalent, so `Invoke-McpRequest.ps1` cannot drive these. Record Mode B as **Blocked** for every case here rather than Fail.

> **No runs recorded yet.** Every case below is authored but unexecuted, because this document cannot be exercised from a headless session. This is the one family whose verification genuinely requires a human at an interactive client.

## What "correct output" means here

Do **not** invent expectations for these. Each prompt has a recorded worked example at `mcp-server/tests/examples/<slug>.golden.md`, captured against a named model at a named version, and CI already asserts that every registered prompt has one with valid frontmatter. Those goldens are the reference for what good output looks like.

Two consequences for a tester:

- **Structure is assertable; prose is not.** A prompt is not deterministic. Judge section presence, ordering, and whether the underlying tools were actually called — not whether the wording matches the golden.
- **A structural gap is a finding; a stylistic difference is not.** If the golden has a provenance footer and your run does not, that is a Fail. If your run phrases a heading differently, that is the model.

## Scope

| Capability                        | Kind   | Cases    | Reference golden                        |
| --------------------------------- | ------ | -------- | --------------------------------------- |
| `gst_information_request_list`    | prompt | UAT-09.1 | `information-request-list.golden.md`    |
| `gst_target_quick_look`           | prompt | UAT-09.2 | `target-quick-look.golden.md`           |
| `gst_comparable_engagements_memo` | prompt | UAT-09.3 | `comparable-engagements-memo.golden.md` |
| `gst_regulatory_exposure_brief`   | prompt | UAT-09.4 | `regulatory-exposure-brief.golden.md`   |
| `gst_diligence_kickoff`           | prompt | UAT-09.5 | `diligence-kickoff.golden.md`           |
| `gst_diligence_handoff_memo`      | prompt | UAT-09.6 | `diligence-handoff-memo.golden.md`      |
| `gst_architecture_layer_review`   | prompt | UAT-09.7 | `architecture-layer-review.golden.md`   |
| `gst_radar_brief_today`           | prompt | UAT-09.8 | `radar-brief-today.golden.md`           |
| `gst_irl_ingestion`               | prompt | UAT-09.9 | `irl-ingestion.golden.md`               |

---

## UAT-09.0 — Discovery

**Goal**: Proves all nine prompts are advertised to the client before any of them is invoked.

**Steps**

1. Open the client's prompt picker (in Claude Desktop, the "+" menu under the GST connector).

**Expected result**

- Exactly **nine** `gst_*` prompts are listed, matching the Scope table.
- Each shows its arguments; required arguments are marked.
- No prompt appears twice, and no non-`gst_` prompt appears under this connector.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

## UAT-09.1 — `gst_information_request_list`

**Goal**: Proves the intake prompt emits both halves of its job — an in-chat preview plus the attachable workbook.

**Input**: `targetName`, `companyName`, `projectName`, `transactionContext`, `includeSections` (comma string), `customRequests` (newline-separated `NN: text`). All optional.

**Expected result**

- The prompt calls `generate_information_request_list_xlsx` itself rather than describing what the workbook would contain.
- Output carries the recipient framing plus a preview of the requests.
- The workbook is surfaced via `downloadUrl` — see [UAT-07.2](UAT-07-irl-pipeline.md) for why the base64 is not the download path.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

## UAT-09.2 — `gst_target_quick_look`

**Goal**: Proves the snapshot prompt composes portfolio and regulatory context rather than answering from the argument values alone.

**Input**: `targetName`, `productType`, `arr`, `stage` (canonical), `hqJurisdiction`.

**Expected result**

- At least one GST tool is called — a quick look that cites no tool output is the model writing from priors.
- Any named comparable engagement traces to a `search_portfolio` result. Codenames are anonymised and look plausible when invented, so an uncited one is the highest-value thing to catch here.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

## UAT-09.3 — `gst_comparable_engagements_memo`

**Goal**: Proves the memo is built from real portfolio rows and links back to the filtered view.

**Input**: `targetDescription`, optional `theme`, optional `engagementCategory`.

**Expected result**

- `search_portfolio` is called **once** with a batched theme array where several themes apply — not once per theme.
- Every cited engagement appears in that result.
- The memo ends with an "Open in Hub" footer listing the `deeplink` for each filter combination explored, labelled by filter.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

## UAT-09.4 — `gst_regulatory_exposure_brief`

**Goal**: Proves the brief is grounded in the regulatory corpus rather than in training knowledge — the single highest fabrication risk in the whole surface.

**Input**: `targetJurisdictions[]`, `dataCategories[]`, `productType`.

**Expected result**

- `search_regulations` is called; every framework named appears in its results.
- Obligations trace to `keyRequirements` on the matched records (see [UAT-02.2](UAT-02-regulatory-map.md)).
- No framework is named that the corpus does not contain. A confidently-described regulation that is not in the results is the defining failure for this case.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

## UAT-09.5 — `gst_diligence_kickoff`

**Goal**: Proves the kickoff prompt maps loose sales notes onto the thirteen dimensions without inventing values.

**Input**: `targetName` plus the 13 dimensions (the wire layer is case-tolerant).

**Expected result**

- `generate_diligence_agenda` is called.
- Dimensions the notes do not state are passed as `unknown` — **not** inferred. Indirect inference is explicitly forbidden: product type must not imply business model, growth stage must not imply scale intensity.
- The agenda widens where inputs are unknown, exactly as in [UAT-03.1](UAT-03-diligence.md).

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

## UAT-09.6 — `gst_diligence_handoff_memo`

**Goal**: Proves the prompt composes prior tool output into a buy-side/sell-side memo instead of re-deriving it.

**Input**: `targetName`, the 13 dimensions, optional `agendaJson`, optional `comparablesJson`.

**Expected result**

- Supplied `agendaJson` / `comparablesJson` are used rather than regenerated.
- The memo separates findings from recommendations and states the transaction side.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

## UAT-09.7 — `gst_architecture_layer_review`

**Goal**: Proves the review uses the canonical five-layer taxonomy from the Library rather than a plausible substitute.

**Input**: `targetSummary`.

**Expected result**

- Layers are **Software → Operational → Product → Organizational → Industry & Regulatory**, verbatim. An earlier verification recorded a stale set (Software → Infrastructure → Data → Organizational → Industry) that had to be reconciled — if a run produces those names, the prompt has regressed to them.
- The review reads down the cascade, not as five disconnected sections.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

## UAT-09.8 — `gst_radar_brief_today`

**Goal**: Proves the briefing renders on the remote transport and carries the human-review caveat.

**Input**: optional `category`. Declares `needsFyiSnapshot: true`.

**Expected result**

- The prompt renders and calls the radar tools. Its remote rendering was specifically fixed once; a template error here is a regression, not a configuration problem.
- The brief is in GST Take voice and carries the caveat from [UAT-08.3](UAT-08-radar.md): aggregated third-party content, not verified reporting, not to be auto-actioned.
- **Blocked** if the credential lacks radar scope or the upstream budget is exhausted.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

## UAT-09.9 — `gst_irl_ingestion`

**Goal**: Proves the largest published workflow runs end to end. This is the same run as [UAT-07.6](UAT-07-irl-pipeline.md); recorded in both places because it is both the prompt family's hardest case and the IRL pipeline's one-shot path.

**Input**: `targetName`, `filledIrl` (≥ 200 chars), `transactionContext`, `partnerLead`, `projectCodeName`, `mode`, `verbosity`, `forceTools`, `requireVerbatimBody`.

**Expected result**

- `compose_dossier_envelope` is called at the end — not fabricated in prose.
- The dossier opens with the meta fence and closes with `(J)` gap list and `(K)` provenance footer.
- Passing `filledIrl` as a prompt argument pre-populates the body cache at render time, so `irlSource` is a `partner-paste-verbatim` variant rather than a reconstruction.
- Claims in `(K)` carry tier labels and verification marks.

**Further reading**: [`OPERATOR_RUNBOOK.md`](../../../../../src/docs/development/OPERATOR_RUNBOOK.md) for run tiers, the VERIFY block, and client-ready gating.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

_Last updated: 2026-08-11 (BL-119 — initial authoring. All cases unexecuted: prompt invocation requires an interactive client.)_
