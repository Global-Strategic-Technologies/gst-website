# MCP Server — User Acceptance Tests

**This is the index of every UAT document.** Each one is a start-to-finish walkthrough that a person executes against the deployed GST MCP server, recording a verdict against a build.

> **Audience**: anyone verifying that the GST MCP server does what it says — a GST team member before a release, an operator after a deploy, or a pilot evaluating the surface. Cases are written for someone **without repo access**, so nothing here assumes you can read the source.
>
> **Start here**: [`SETUP.md`](SETUP.md). Every case assumes you have completed it once.

---

## Test catalog

| UAT                                             | Covers                                                                                                                                   | Cases         | Status      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------- |
| [UAT-01 — Portfolio](UAT-01-portfolio.md)       | `search_portfolio`, `list_portfolio_facets`                                                                                              | UAT-01.1 – .3 | ✅ authored |
| UAT-02 — Regulatory map                         | `search_regulations`, `list_regulation_facets`                                                                                           | —             | ⏳ pending  |
| UAT-03 — Diligence                              | `generate_diligence_agenda`                                                                                                              | —             | ⏳ pending  |
| UAT-04 — TechPar                                | `compute_techpar`                                                                                                                        | —             | ⏳ pending  |
| UAT-05 — Tech debt                              | `estimate_tech_debt_cost`                                                                                                                | —             | ⏳ pending  |
| UAT-06 — ICG                                    | `assess_infrastructure_cost_governance`                                                                                                  | —             | ⏳ pending  |
| [UAT-07 — IRL pipeline](UAT-07-irl-pipeline.md) | `list_irl_requests`, `generate_information_request_list_xlsx`, `prepare_irl_body`, `validate_irl_provenance`, `compose_dossier_envelope` | UAT-07.1 – .6 | ✅ authored |
| UAT-08 — Radar                                  | `search_radar`, `get_latest_insights`                                                                                                    | —             | ⏳ pending  |
| UAT-09 — Prompts                                | the nine `gst_*` prompts                                                                                                                 | —             | ⏳ pending  |
| UAT-10 — Resources                              | `gst://library/`, `gst://regulations/`, `gst://radar/`                                                                                   | —             | ⏳ pending  |

Supporting documents: [`SETUP.md`](SETUP.md) (do this first) · [`TEMPLATE.md`](TEMPLATE.md) (the skeleton every case follows).

---

## Capability coverage matrix

<!-- LOAD-BEARING FORMAT. `tests/integration/mcp-uat-parity.test.ts` parses this table:
     column 1 = capability in backticks, column 3 = the UAT doc, column 4 = authored|pending.
     Every tool and prompt registered on the Worker must have a row here. Adding a tool
     without adding its row fails CI — that is the point. -->

| Capability                               | Kind     | UAT                              | Status   |
| ---------------------------------------- | -------- | -------------------------------- | -------- |
| `search_portfolio`                       | tool     | [UAT-01](UAT-01-portfolio.md)    | authored |
| `list_portfolio_facets`                  | tool     | [UAT-01](UAT-01-portfolio.md)    | authored |
| `search_regulations`                     | tool     | UAT-02                           | pending  |
| `list_regulation_facets`                 | tool     | UAT-02                           | pending  |
| `generate_diligence_agenda`              | tool     | UAT-03                           | pending  |
| `compute_techpar`                        | tool     | UAT-04                           | pending  |
| `estimate_tech_debt_cost`                | tool     | UAT-05                           | pending  |
| `assess_infrastructure_cost_governance`  | tool     | UAT-06                           | pending  |
| `list_irl_requests`                      | tool     | [UAT-07](UAT-07-irl-pipeline.md) | authored |
| `generate_information_request_list_xlsx` | tool     | [UAT-07](UAT-07-irl-pipeline.md) | authored |
| `prepare_irl_body`                       | tool     | [UAT-07](UAT-07-irl-pipeline.md) | authored |
| `validate_irl_provenance`                | tool     | [UAT-07](UAT-07-irl-pipeline.md) | authored |
| `compose_dossier_envelope`               | tool     | [UAT-07](UAT-07-irl-pipeline.md) | authored |
| `search_radar`                           | tool     | UAT-08                           | pending  |
| `get_latest_insights`                    | tool     | UAT-08                           | pending  |
| `gst_diligence_kickoff`                  | prompt   | UAT-09                           | pending  |
| `gst_target_quick_look`                  | prompt   | UAT-09                           | pending  |
| `gst_comparable_engagements_memo`        | prompt   | UAT-09                           | pending  |
| `gst_regulatory_exposure_brief`          | prompt   | UAT-09                           | pending  |
| `gst_diligence_handoff_memo`             | prompt   | UAT-09                           | pending  |
| `gst_architecture_layer_review`          | prompt   | UAT-09                           | pending  |
| `gst_radar_brief_today`                  | prompt   | UAT-09                           | pending  |
| `gst_information_request_list`           | prompt   | UAT-09                           | pending  |
| `gst_irl_ingestion`                      | prompt   | UAT-09                           | pending  |
| `gst://library/`                         | resource | UAT-10                           | pending  |
| `gst://regulations/`                     | resource | UAT-10                           | pending  |
| `gst://radar/`                           | resource | UAT-10                           | pending  |

**Not in scope**: `search_radar_offline` and `search_radar_cache` are registered only on the local stdio transport. Nobody connecting to `https://mcp.globalstrategic.tech/mcp` can reach them, so presenting them as testable would be misleading. (`search_radar_cache` is additionally a deprecated alias.)

---

## Conventions

Every case in every document obeys these, so that a reader who has run one case can run any case.

**Case IDs** are `UAT-NN.n` — document number, then case number within it. They are stable: a case that is retired keeps its number rather than letting a later case inherit it.

**Verdicts** are one of three:

| Verdict     | Meaning                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| **Pass**    | Every observation under _Expected result_ held.                                |
| **Fail**    | You ran the case and an expectation did not hold. This is a finding — file it. |
| **Blocked** | You could not run the case at all. Not a finding about the server.             |

Keeping Blocked distinct from Fail matters: a pilot credential provisioned without `--allow-radar` cannot execute UAT-08, and recording that as five failures would misreport a scope decision as a defect.

**Execution modes.** Each case states its expected tool call once; you can drive it two ways.

- **Mode A — interactive client.** A connected Claude client plus the system-prompt addendum. Tests the capability _and_ whether the model routes to it. This is the default, and it is what a human evaluator should run.
- **Mode B — wire.** The same tool and arguments issued directly with a bearer token, via `mcp-server/scripts/Invoke-McpRequest.ps1`. Tests the capability only. This is what a pilot holding M2M credentials can run, and what anyone re-checks a case with when they suspect the model rather than the server.

The two modes do not always observe the same thing — a client may surface a tool's structured payload where another shows only its prose summary. Where that matters, the case carries a **Mode differences** note. Absent that note, both modes see the same result.

**One fresh thread per case in Mode A.** Conversation state leaks: a model that already saw the answer in an earlier turn may recite instead of calling the tool, which passes a case that would otherwise fail.

**Record every run.** Each case ends with a run-log table. Fill in a row every time you execute it — date, who ran it, the server version, the mode, the verdict. A case with an empty run log has never been proven, whatever its expectations claim.

---

## How to run a cycle

1. Complete [`SETUP.md`](SETUP.md) once per machine and credential.
2. Note the running version: `GET https://mcp.globalstrategic.tech/health` → `version`. Every run-log row for this cycle carries it.
3. Pick the documents you need. UAT-01 is the shortest and confirms the connection is genuinely working; start there even when you care about something else.
4. Work each case in order. Cases within a document may depend on earlier ones — UAT-07 in particular is a chain, and skipping a step produces a real error rather than a silent one.
5. Record a verdict per case.
6. **File failures; do not fix expectations.** If a case fails, the deliverable is a backlog item quoting the case ID, the version, and what you actually saw. Editing the _Expected result_ so a run goes green destroys the only record that the behaviour changed.

---

## Adding a case or a document

- Copy [`TEMPLATE.md`](TEMPLATE.md); keep the section order.
- Write _Expected result_ from an **actual run**, never from reading a schema. An expectation nobody has observed is a guess with a checkbox next to it.
- Add the document to the Test catalog and every capability it covers to the coverage matrix. The parity guard fails if a registered tool or prompt has no row, if a catalog row points at a file that does not exist, or if a `UAT-*.md` file exists that the catalog never lists.
- Where a family already has a [`CONTRACT.md`](../../tools/README.md#the-contracts-registry), link it rather than restating its enum tables. The case shows the arguments _this_ case sends; the contract owns the full input surface.

---

_Last updated: 2026-08-10 (BL-119 — suite established; UAT-01 and UAT-07 authored, eight documents pending)_
