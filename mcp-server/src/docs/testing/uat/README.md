# MCP Server — User Acceptance Tests

**This is the index of every UAT document.** Each one is a start-to-finish walkthrough that a person executes against the deployed GST MCP server, recording a verdict against a build.

> **Audience**: anyone verifying that the GST MCP server does what it says — a GST team member before a release, an operator after a deploy, or a pilot evaluating the surface. Cases are written for someone **without repo access**, so nothing here assumes you can read the source.
>
> **Start here**: [`SETUP.md`](SETUP.md). Every case assumes you have completed it once.

---

## Test catalog

| UAT                                                 | Covers                                                                                                                                   | Cases         | Status      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------- |
| [UAT-01 — Portfolio](UAT-01-portfolio.md)           | `search_portfolio`, `list_portfolio_facets`                                                                                              | UAT-01.1 – .3 | ✅ authored |
| [UAT-02 — Regulatory map](UAT-02-regulatory-map.md) | `search_regulations`, `list_regulation_facets`                                                                                           | UAT-02.1 – .4 | ✅ authored |
| [UAT-03 — Diligence](UAT-03-diligence.md)           | `generate_diligence_agenda`                                                                                                              | UAT-03.1 – .3 | ✅ authored |
| [UAT-04 — TechPar](UAT-04-techpar.md)               | `compute_techpar`                                                                                                                        | UAT-04.1 – .2 | ✅ authored |
| [UAT-05 — Tech debt](UAT-05-tech-debt.md)           | `estimate_tech_debt_cost`                                                                                                                | UAT-05.1 – .3 | ✅ authored |
| [UAT-06 — ICG](UAT-06-icg.md)                       | `assess_infrastructure_cost_governance`                                                                                                  | UAT-06.1 – .2 | ✅ authored |
| [UAT-07 — IRL pipeline](UAT-07-irl-pipeline.md)     | `list_irl_requests`, `generate_information_request_list_xlsx`, `prepare_irl_body`, `validate_irl_provenance`, `compose_dossier_envelope` | UAT-07.1 – .7 | ✅ authored |
| [UAT-08 — Radar](UAT-08-radar.md)                   | `search_radar`, `get_latest_insights`                                                                                                    | UAT-08.1 – .3 | ✅ authored |
| [UAT-09 — Prompts](UAT-09-prompts.md)               | the nine `gst_*` prompts                                                                                                                 | UAT-09.0 – .9 | ✅ authored |
| [UAT-10 — Resources](UAT-10-resources.md)           | `gst://library/`, `gst://regulations/`, `gst://radar/`                                                                                   | UAT-10.1 – .4 | ✅ authored |

Supporting documents: [`SETUP.md`](SETUP.md) (do this first) · [`TEMPLATE.md`](TEMPLATE.md) (the skeleton every case follows).

---

## Capability coverage matrix

<!-- LOAD-BEARING FORMAT. `tests/integration/mcp-uat-parity.test.ts` parses this table:
     column 1 = capability in backticks, column 3 = the UAT doc, column 4 = authored|pending.
     Every tool and prompt registered on the Worker must have a row here. Adding a tool
     without adding its row fails CI — that is the point. -->

| Capability                               | Kind     | UAT                                | Status   |
| ---------------------------------------- | -------- | ---------------------------------- | -------- |
| `search_portfolio`                       | tool     | [UAT-01](UAT-01-portfolio.md)      | authored |
| `list_portfolio_facets`                  | tool     | [UAT-01](UAT-01-portfolio.md)      | authored |
| `search_regulations`                     | tool     | [UAT-02](UAT-02-regulatory-map.md) | authored |
| `list_regulation_facets`                 | tool     | [UAT-02](UAT-02-regulatory-map.md) | authored |
| `generate_diligence_agenda`              | tool     | [UAT-03](UAT-03-diligence.md)      | authored |
| `compute_techpar`                        | tool     | [UAT-04](UAT-04-techpar.md)        | authored |
| `estimate_tech_debt_cost`                | tool     | [UAT-05](UAT-05-tech-debt.md)      | authored |
| `assess_infrastructure_cost_governance`  | tool     | [UAT-06](UAT-06-icg.md)            | authored |
| `list_irl_requests`                      | tool     | [UAT-07](UAT-07-irl-pipeline.md)   | authored |
| `generate_information_request_list_xlsx` | tool     | [UAT-07](UAT-07-irl-pipeline.md)   | authored |
| `prepare_irl_body`                       | tool     | [UAT-07](UAT-07-irl-pipeline.md)   | authored |
| `validate_irl_provenance`                | tool     | [UAT-07](UAT-07-irl-pipeline.md)   | authored |
| `compose_dossier_envelope`               | tool     | [UAT-07](UAT-07-irl-pipeline.md)   | authored |
| `search_radar`                           | tool     | [UAT-08](UAT-08-radar.md)          | authored |
| `get_latest_insights`                    | tool     | [UAT-08](UAT-08-radar.md)          | authored |
| `gst_diligence_kickoff`                  | prompt   | [UAT-09](UAT-09-prompts.md)        | authored |
| `gst_target_quick_look`                  | prompt   | [UAT-09](UAT-09-prompts.md)        | authored |
| `gst_comparable_engagements_memo`        | prompt   | [UAT-09](UAT-09-prompts.md)        | authored |
| `gst_regulatory_exposure_brief`          | prompt   | [UAT-09](UAT-09-prompts.md)        | authored |
| `gst_diligence_handoff_memo`             | prompt   | [UAT-09](UAT-09-prompts.md)        | authored |
| `gst_architecture_layer_review`          | prompt   | [UAT-09](UAT-09-prompts.md)        | authored |
| `gst_radar_brief_today`                  | prompt   | [UAT-09](UAT-09-prompts.md)        | authored |
| `gst_information_request_list`           | prompt   | [UAT-09](UAT-09-prompts.md)        | authored |
| `gst_irl_ingestion`                      | prompt   | [UAT-09](UAT-09-prompts.md)        | authored |
| `gst://library/`                         | resource | [UAT-10](UAT-10-resources.md)      | authored |
| `gst://regulations/`                     | resource | [UAT-10](UAT-10-resources.md)      | authored |
| `gst://radar/`                           | resource | [UAT-10](UAT-10-resources.md)      | authored |

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

**Record the environment, not just the version.** Run logs carry an `Env` column with one of:

| `Env`         | Means                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `prod`        | `https://mcp.globalstrategic.tech/mcp` — the only environment a Pass can be claimed against      |
| `staging`     | `https://mcp-staging.globalstrategic.tech/mcp` — validates a build, not the production config    |
| `local stdio` | A locally-built `mcp-server/dist/index.js`. Same handlers, different bindings and possibly stale |

The distinction is load-bearing rather than bookkeeping. A local stdio build has no Inoreader credentials and an in-process cache instead of Upstash, so radar cases cannot pass there at all and cache-backed cases prove the handler rather than the deployment. It can also be **behind master** — `dist/` is built on demand, so a run against a week-old build is testing week-old code under a current-looking version string. When recording `local stdio`, note the build date.

**Record every run.** Each case ends with a run-log table. Fill in a row every time you execute it — date, tester, environment, version, mode, verdict. A case with an empty run log has never been proven, whatever its expectations claim.

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

## Verification status

All ten documents are authored, and **every family has production evidence**. As of cycle 5, **UAT-07.6 / 09.9 is the only case never executed anywhere.**

> **The run logs are the source of truth, not this section.** A document is production-verified exactly when one of its run-log rows carries `Env: prod` — nothing here overrides that. `tests/integration/mcp-uat-parity.test.ts` derives the answer from those tables and fails if this prose disagrees, because three successive edits to this section drifted out of step with them and each was caught only in review.
>
> **The guard is family-granular, not case-granular.** One `Env: prod` row anywhere in a document flips that whole family to ✅, so a family can be marked verified while one of its cases has never run — the state UAT-07 and UAT-09 are in. Per-case gaps live in **Outstanding** below and are only ever caught by reading, never by CI.

| Family                      | Production evidence                                                                |
| --------------------------- | ---------------------------------------------------------------------------------- |
| UAT-01 – 06 (tool families) | ✅ all cases — cycle 4 on `0.48.2`; UAT-02 re-swept and 02.4 first-run on `0.49.0` |
| UAT-07 (IRL pipeline)       | ✅ 07.7 (cycle 3) and 07.5 (cycle 5) — **07.6 outstanding**                        |
| UAT-08 (radar)              | ✅ 08.1 – 08.3, cycle 4 — first live-dependency pass                               |
| UAT-09 (prompts)            | ✅ 09.0 – 09.8, cycles 2 and 4 — **09.9 outstanding** (same run as 07.6)           |
| UAT-10 (resources)          | ✅ 10.2 – 10.4, cycle 2                                                            |

Cycle 4 closed the standing gap: **20 cases passed against production `0.48.2`**, converting six tool families from "authored against local stdio" to proven on the Worker, and executing UAT-04.2 for the first time in any environment.

> **On the cycle-4 headline.** The report's summary line reads "18 Pass"; its own verdict table and per-case evidence log carry **20**. The run-log rows below follow the per-case evidence, which is why twenty `prod` rows sit behind a report that says eighteen.

Each cycle has paid for itself, and the pattern is worth naming: **every real defect so far has been a claim that was true in our documentation and false in an executable surface.** Cycle 2 found `gst_radar_brief_today` republishing aggregated third-party reporting with no provenance framing — a requirement written down in three internal places and present in no shipped surface, including the recorded golden, so every comparison against it agreed. Cycle 4 found `search_regulations` never reading the curated `aliases` field: the data was added in BL-073 for `compose_dossier_envelope` and wired into exactly one consumer, so `"Colorado AI Act"` returned a voluntary federal framework in place of a statute carrying $20,000 per violation. Both were invisible to the test suite because the tests encoded the same omission.

Cycle 1's two reported findings both dissolved on investigation — the ICG aggregation gap was two different answer maps (now published in UAT-06.2), and radar annotation staleness is editorial supply, operator-confirmed. Cycle 3 exercised the IRL reconstruction path (UAT-07.7) and confirmed the provenance machinery self-labels correctly. Cycle 4's other four observations were suite gaps rather than server defects, and are closed in the cases themselves.

**Cycle 5 was the acceptance test for the alias fix, and it passed** — 8 Pass, 0 Fail, 1 Blocked on `0.49.0`. The jurisdiction-scoped step of UAT-02.4 returned `totalMatched: 1` where the identical call returned `[]` on `0.48.2`, which is what distinguishes "the alias is now in the index" from "the ranking happened to improve".

It also produced the sharpest piece of testing this exercise has seen. Asked to confirm that a spurious `map-absent` entry had stopped appearing, the tester observed that an absence is consistent with two different worlds — the framework is now recognised, or the check no longer fires for anything — and invented a framework name to separate them. That control is now part of UAT-07.5, and the same reasoning is why UAT-02.4 records `totalMatched` bounds rather than ordering alone: **a positive assertion cannot detect a check that has been switched off.** Cycle 5's other two observations were suite gaps and are closed in the cases; the third (`serverToolCallCounts` reporting `succeeded: 0`) was a non-defect that had been filed three cycles running, now documented in UAT-07.5 and the IRL contract so it stops.

**Outstanding — one case:**

- **UAT-07.6 / UAT-09.9** (the same run, recorded in both). It needs **Claude Desktop**. claude.ai web renders `filledIrl` as a single-line input that strips newlines, and above roughly 57KB refuses the attach entirely — see [`SETUP.md` § 1a](SETUP.md). Until it runs, whether a prompt-argument paste self-labels `partner-paste-verbatim` or `-prepop` stays open, and that distinction decides whether the label records where bytes came from or merely how they arrived.

---

_Last updated: 2026-08-12 (BL-119 cycle 5 — the `0.49.0` alias fix passed its acceptance test, UAT-02 is fully verified, and the cycle-3 dossier loop is closed with a negative control. One case outstanding: UAT-07.6 / 09.9, which needs Claude Desktop. Production status is derived from the run logs by the parity guard rather than asserted here by hand.)_
