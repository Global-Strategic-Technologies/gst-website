# UAT-09 — Prompts

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`prompts/README.md`](../../prompts/README.md); for the largest, [`prompts/irl-ingestion.md`](../../prompts/irl-ingestion.md)

Nine `gst_*` prompts — typed, versioned macros that orchestrate tools and resources into a finished work product. A full pass proves the thing tool-level cases cannot: that a **published workflow** runs end to end and produces the document a partner expects, in the right structure, with its provenance intact.

> **Mode A only.** Invoking a prompt is a client-side capability; there is no wire equivalent, so `Invoke-McpRequest.ps1` cannot drive these. Record Mode B as **Blocked** for every case here rather than Fail.

> **Requires an interactive client.** These cases cannot be exercised from a headless or proxied session — see [`SETUP.md` § 3](SETUP.md), which now checks for that before you start. The addendum is **not** required; installing it is neither necessary nor expected.

> **Argument fields are single-line in most web clients.** `customRequests` on UAT-09.1 is documented as newline-separated `NN: text` lines, but a client rendering every argument as a text input cannot express a newline — two requests silently concatenate into one run-on entry. That is a client limitation, not a server defect. Pass a single request, or use a client that supports multi-line arguments; note which you did.

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

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                   |
| ---------- | ------ | ---- | ------- | ---- | ------- | ------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | 9 `gst_*` prompts, no duplicates, no non-`gst_` entries |

---

## UAT-09.1 — `gst_information_request_list`

**Goal**: Proves the intake prompt emits both halves of its job — an in-chat preview plus the attachable workbook.

**Input**: `targetName`, `companyName`, `projectName`, `transactionContext`, `includeSections` (comma string), `customRequests` (newline-separated `NN: text`). All optional.

**Expected result**

- The prompt calls `generate_information_request_list_xlsx` itself rather than describing what the workbook would contain.
- Output carries the recipient framing plus a preview of the requests.
- The workbook is surfaced via `downloadUrl` — see [UAT-07.2](UAT-07-irl-pipeline.md) for why the base64 is not the download path.

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                                            |
| ---------- | ------ | ---- | ------- | ---- | ------- | ------------------------------------------------------------------------------------------------ |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | Tool invoked not described; `downloadUrl` surfaced, no base64 in chat; 10 sections / 67 requests |

---

## UAT-09.2 — `gst_target_quick_look`

**Goal**: Proves the snapshot prompt composes portfolio and regulatory context rather than answering from the argument values alone.

**Input**: `targetName`, `productType`, `arr`, `stage` (canonical), `hqJurisdiction`.

**Expected result**

- At least one GST tool is called — a quick look that cites no tool output is the model writing from priors.
- Any named comparable engagement traces to a `search_portfolio` result. Codenames are anonymised and look plausible when invented, so an uncited one is the highest-value thing to catch here.
- **If the output surfaces any radar-derived material**, it carries the provenance framing described in [UAT-08.3](UAT-08-radar.md) — aggregated third-party reporting, not independently verified. If it surfaces none, this assertion does not apply. (Added after a cycle-2 finding against `gst_radar_brief_today`: the requirement is family-wide, but only one case was checking it.)

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                            |
| ---------- | ------ | ---- | ------- | ---- | ------- | -------------------------------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | All four orchestrated tools ran; no uncited codenames; 4 parameterised deeplinks |

---

## UAT-09.3 — `gst_comparable_engagements_memo`

**Goal**: Proves the memo is built from real portfolio rows and links back to the filtered view.

**Input**: `targetDescription`, optional `theme`, optional `engagementCategory`.

**Expected result**

- `search_portfolio` is called **once per filter combination**, with a batched theme array where several themes apply — not once per theme. Expect roughly one to three calls, plus a `list_portfolio_facets` enumeration first.

  The point of the assertion is that batching happens, not that a specific count is hit. The prompt body budgets "1–3 times"; the recorded golden shows up to six on one run and notes the body was deliberately left unchanged because output quality was good. If you see one call per theme, that is the anti-pattern; a handful of calls across distinct filter combinations is not.

- Every cited engagement appears in that result.
- The memo ends with an "Open in Hub" footer listing the `deeplink` for each filter combination explored, labelled by filter.

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                                          |
| ---------- | ------ | ---- | ------- | ---- | ------- | ---------------------------------------------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | Arrow/Atlas/Tempo/Oktoberfest all real; Open-in-Hub footer resolves; 3 calls (see budget note) |

---

## UAT-09.4 — `gst_regulatory_exposure_brief`

**Goal**: Proves the brief is grounded in the regulatory corpus rather than in training knowledge — the single highest fabrication risk in the whole surface.

**Input**: `targetJurisdictions[]`, `dataCategories[]`, `productType`.

**Expected result**

- `search_regulations` is called; every framework named appears in its results.
- Obligations trace to `keyRequirements` on the matched records (see [UAT-02.2](UAT-02-regulatory-map.md)).
- No framework is named that the corpus does not contain. A confidently-described regulation that is not in the results is the defining failure for this case.

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                                    |
| ---------- | ------ | ---- | ------- | ---- | ------- | ---------------------------------------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | 6 frameworks named, all in corpus; 2 empty jurisdictions reported as gaps, none invented |

---

## UAT-09.5 — `gst_diligence_kickoff`

**Goal**: Proves the kickoff prompt maps loose sales notes onto the thirteen dimensions without inventing values.

**Input**: `targetName` plus the 13 dimensions (the wire layer is case-tolerant).

**Expected result**

- `generate_diligence_agenda` is called.
- Dimensions the notes do not state are passed as `unknown` — **not** inferred. Indirect inference is explicitly forbidden: product type must not imply business model, growth stage must not imply scale intensity.
- The agenda widens where inputs are unknown, exactly as in [UAT-03.1](UAT-03-diligence.md).

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                          |
| ---------- | ------ | ---- | ------- | ---- | ------- | -------------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | 10 of 13 unknown; `b2b-saas` did not leak into `businessModel` |

---

## UAT-09.6 — `gst_diligence_handoff_memo`

**Goal**: Proves the prompt composes prior tool output into a buy-side/sell-side memo instead of re-deriving it.

**Input**: `targetName`, the 13 dimensions, optional `agendaJson`, optional `comparablesJson`.

**Expected result**

- Supplied `agendaJson` / `comparablesJson` are used rather than regenerated. The sharpest way to test this is to plant tracer values that exist nowhere in the GST corpus — an invented codename and ARR figure — and confirm they appear verbatim while zero tool calls fire.
- The memo separates findings from recommendations and states the transaction side.
- **If the memo surfaces any radar-derived material**, it carries the [UAT-08.3](UAT-08-radar.md) provenance framing. Same family-wide requirement as UAT-09.2.

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                                    |
| ---------- | ------ | ---- | ------- | ---- | ------- | ---------------------------------------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | Synthetic tracers reused verbatim, zero tool calls; deeplinks omitted with stated reason |

---

## UAT-09.7 — `gst_architecture_layer_review`

**Goal**: Proves the review uses the canonical five-layer taxonomy from the Library rather than a plausible substitute.

**Input**: `targetSummary`.

**Expected result**

- Layers are **Software → Operational → Product → Organizational → Industry & Regulatory**, verbatim. An earlier verification recorded a stale set (Software → Infrastructure → Data → Organizational → Industry) that had to be reconciled — if a run produces those names, the prompt has regressed to them.
- The review reads down the cascade, not as five disconnected sections.

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                                 |
| ---------- | ------ | ---- | ------- | ---- | ------- | ------------------------------------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | Canonical five layers in order under infra/data-heavy bait; 30 cross-layer references |

---

## UAT-09.8 — `gst_radar_brief_today`

**Goal**: Proves the briefing renders on the remote transport and carries the human-review caveat.

**Input**: optional `category`. Declares `needsFyiSnapshot: true`.

**Expected result**

- The prompt renders. It does **not** call `search_radar` or `get_latest_insights` — it declares `needsFyiSnapshot`, and the registry resolves `gst://radar/fyi/latest` into the second message before the body is built. Watching for a radar tool call and filing its absence is a false Fail. Remote rendering was fixed once specifically, so a template error here is a regression, not a configuration problem.
- The brief is in GST Take voice and closes with a **provenance caveat** after the "Open in Hub" footer: aggregated third-party reporting with GST annotation, not independently verified, confirm against sources before acting or sharing. This is Step 7 of the prompt body as of `0.0.5`.

  > Prompt versions through `0.0.4` emitted no caveat at all, because the body never instructed one — the requirement lived in the backlog, the operator runbook and the marketing copy, and in no executable surface. Found by a cycle-2 production run and fixed in `0.0.5`. A run against `0.0.4` or earlier will legitimately lack it; check the version before filing.

- Prompts are covered by `prompt:*`, not the radar tool scopes, so a credential without radar tool access can still run this. An exhausted budget or empty cache yields the degraded-text branch Step 2 handles — surfaced verbatim, not an error. **Blocked** only if the prompt cannot be invoked at all.

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                                                                                                                                                                                                         |
| ---------- | ------ | ---- | ------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Fail    | v0.0.4 — no provenance caveat in any form (6 markers absent). Fixed in 0.0.5; re-run required                                                                                                                                                                 |
| 2026-08-12 | Cowork | prod | 0.48.2  | A    | Pass    | **First execution of `0.0.5` anywhere.** Caveat present at char 3031, immediately after the "Open in Hub" footer at 2978 with nothing between them; all four required elements present. Closes the cycle-2 Fail. Zero radar tool calls, as the case now warns |

---

## UAT-09.9 — `gst_irl_ingestion`

**Goal**: Proves the largest published workflow runs end to end. This is the same run as [UAT-07.6](UAT-07-irl-pipeline.md); recorded in both places because it is both the prompt family's hardest case and the IRL pipeline's one-shot path.

**Input**: `filledIrl` (≥ 200 chars), `targetName`, `transactionContext`, `partnerLead`, `projectCodeName`, `mode`, `auditLevel`, `requireVerbatimBody`. **Run at `auditLevel: "debug"`** — the expectations below read the audit surface, which `standard` deliberately omits.

**Expected result**

- `compose_dossier_envelope` is called at the end — not fabricated in prose.
- At `auditLevel: "debug"` the dossier opens with the meta fence and closes with `(J)` gap list, `(K)` provenance footer and the `RUN-AUDIT` block.
- **Level check** (worth one extra run): at `standard` the same invocation produces a dossier with `(J)` but **no** meta fence, `(K)` or run-audit block — and `compose_dossier_envelope` is still called. A `standard` run that skips the envelope is a Fail; a `standard` run that omits those three sections is a Pass.
- Passing `filledIrl` as a prompt argument pre-populates the body cache at render time, so `irlSource` is a `partner-paste-verbatim` variant rather than a reconstruction.
- Claims in `(K)` carry tier labels and verification marks.

**Further reading**: [`OPERATOR_RUNBOOK.md`](../../../../../src/docs/development/OPERATOR_RUNBOOK.md) for run tiers, the `RUN-AUDIT` block, and client-ready gating (which requires `auditLevel: debug`).

**Run log**

| Date       | Tester   | Env  | Version | Mode | Verdict | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------- | ---- | ------- | ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-12 | Operator | prod | 0.49.0  | A    | Pass    | **First execution in any environment.** `irlSource: partner-paste-verbatim-prepop` — the prompt-argument paste yields server-witnessed provenance, answering the question open since cycle 3. `hashBindResult: pass-bound`; **37/37 claims verified**, 0 unverified / 0 tierMismatches / 0 tierFabrications; precheck converged in 2 iterations; `gatesElided: []`. (J) carried **no `map-absent`** (closing the cycle-3 false positive on a real dossier) and **no `provenance-gap`** — the latter is the server independently agreeing this was a verbatim run. `filledIrl.bytes` 56,906 against a 56,907-byte source: a 1-byte drift the field exists to surface, unexplained — see the note under this case. Recorded in both places — same run as UAT-07.6 |

---

_Last updated: 2026-08-11 (BL-119 cycle 2 — 09.0–09.8 executed against production; 09.8 failed and drove the `gst_radar_brief_today` 0.0.5 fix. 09.9 still held for a markdown IRL.)_
