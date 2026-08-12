# UAT-07 — IRL / dossier pipeline

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`irl-pipeline/CONTRACT.md`](../../tools/irl-pipeline/CONTRACT.md)

Five tools that carry an engagement from "we need to ask the target for information" to "we have a provenance-checked dossier envelope". A full pass proves the thing no single-tool case can: that **state passes correctly between calls**. A hash minted by one tool is consumed by two others, and the last tool fails outright if the write that seeded it never happened.

This is the longest document in the suite and the one most worth running after any change to the IRL surface. Cases must be run **in order** — 07.5 depends on 07.3 having run in the same session.

> **Recorded runs are `local stdio`, not production.** One difference is load-bearing here: the body cache backing 07.3 → 07.5 is an in-process LRU on stdio and Upstash on the Worker. The recorded Pass therefore proves the hash contract and the handler chain, **not** the deployed cache. A production run is outstanding, and it is the run that matters for this family.

## Scope

| Capability                               | Kind   | Cases    | Contract                                                   |
| ---------------------------------------- | ------ | -------- | ---------------------------------------------------------- |
| `list_irl_requests`                      | tool   | UAT-07.1 | [CONTRACT.md](../../tools/irl-pipeline/CONTRACT.md)        |
| `generate_information_request_list_xlsx` | tool   | UAT-07.2 | [CONTRACT.md](../../tools/irl-pipeline/CONTRACT.md)        |
| `prepare_irl_body`                       | tool   | UAT-07.3 | [CONTRACT.md](../../tools/irl-pipeline/CONTRACT.md)        |
| `validate_irl_provenance`                | tool   | UAT-07.4 | [CONTRACT.md](../../tools/irl-pipeline/CONTRACT.md)        |
| `compose_dossier_envelope`               | tool   | UAT-07.5 | [CONTRACT.md](../../tools/irl-pipeline/CONTRACT.md)        |
| `gst_irl_ingestion`                      | prompt | UAT-07.6 | [prompts/irl-ingestion.md](../../prompts/irl-ingestion.md) |
| the reconstruction path + verbatim gate  | chain  | UAT-07.7 | [CONTRACT.md](../../tools/irl-pipeline/CONTRACT.md)        |

---

## UAT-07.1 — Canonical question set

**Goal**: Proves the question source is served rather than assumed, and gives you the `NN-II` keys the next case needs to exclude a question by name.

**Input**

| Field | Required | Value for this case | Constraint a tester must respect |
| ----- | -------- | ------------------- | -------------------------------- |
| —     | —        | `{}`                | The tool accepts no arguments    |

**Steps**

1. Open a fresh thread.
2. Paste: _Using the GST connector, list the canonical IRL requests._
   Mode B: call `list_irl_requests` with `{}`.

**Expected call**

```json
{ "tool": "list_irl_requests", "arguments": {} }
```

**Expected result**

- `sectionCount` is **10** and `bulletCount` is **67**.
- Every entry carries `key`, `section`, `sectionTitle`, `text`. Keys are `NN-II` — e.g. `02-03` is the third question of section 02.
- Sections run `00` Basics through `09` Governance & Compliance.
- **Exactly one** question carries a `skipIf` directive: `00-02` ("Engagement context…"), tagged for all three of `sell-side`, `buy-side`, `value-creation`. This is the question UAT-07.2 will auto-remove.
- Section `00` holds 10 questions (`00-01`…`00-10`); section `03` holds 8 (`03-01`…`03-08`).

**Failure modes**

| Symptom                       | Means                                 | Do                                                        |
| ----------------------------- | ------------------------------------- | --------------------------------------------------------- |
| `bulletCount` differs from 67 | The canonical source changed          | Not a defect — re-derive UAT-07.2's arithmetic and update |
| No `skipIf` anywhere          | Skip-if directives lost in the source | Fail — UAT-07.2 cannot prove its third subtraction        |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                             |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ------------------------------------------------- |
| 2026-08-10 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 10 sections / 67 bullets; only `00-02` has skipIf |

---

## UAT-07.2 — Generate the workbook, with all three subtractions

**Goal**: Proves the three independent ways of removing questions compose correctly — section selection, explicit exclusion, and context-driven skip-if — by making the resulting count arithmetic checkable by hand.

**Input**

| Field                | Required | Value for this case  | Constraint a tester must respect                         |
| -------------------- | -------- | -------------------- | -------------------------------------------------------- |
| `targetName`         | no       | `"Northwind Health"` | Non-empty; appears in the header and filename slug       |
| `transactionContext` | no       | `"buy-side"`         | One of `sell-side`/`buy-side`/`value-creation`/`unknown` |
| `includeSections`    | no       | `["00", "03"]`       | Two-digit strings; omit for all sections                 |
| `excludeRequests`    | no       | `["03-08"]`          | `NN-II` keys, max 100; discover them via UAT-07.1        |

**Steps**

1. Open a fresh thread.
2. Paste: _Generate the GST information request list for Northwind Health as a buy-side engagement. Only include the Basics and Infrastructure sections, and drop the capital-expenditure question._
   Mode B: call `generate_information_request_list_xlsx` with
   `{ "targetName": "Northwind Health", "transactionContext": "buy-side", "includeSections": ["00","03"], "excludeRequests": ["03-08"] }`.

**Expected call**

```json
{
  "tool": "generate_information_request_list_xlsx",
  "arguments": {
    "targetName": "Northwind Health",
    "transactionContext": "buy-side",
    "includeSections": ["00", "03"],
    "excludeRequests": ["03-08"]
  }
}
```

**Expected result**

- `sectionCount` is **2**.
- `bulletCount` is **16**, and the arithmetic is checkable: section 00 (10) + section 03 (8) = 18, minus `03-08` excluded (1), minus `00-02` auto-skipped by the buy-side context (1) = **16**. All three subtractions fired.
- `filename` matches `GST-IRL-Northwind-Health-<today>.xlsx` with today's date.
- `downloadUrl` is the Hub generator with this call's arguments pre-filled — it contains `target=Northwind+Health`, `context=buy-side`, `sections=00%2C03`, and `exclude=03-08`.
- `mimeType` is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

**Mode differences**

This is the one tool in the server whose two response channels deliberately differ, so what you observe depends on your client.

- **Mode B / programmatic clients** read `structuredContent` and see the full payload including the `base64` workbook bytes.
- **Mode A / Claude Desktop** shows a prose caption plus a payload block in which `base64` has been replaced by a marker. This is deliberate — the blob is omitted from the text channel to save tokens, and Claude Desktop cannot render an `.xlsx` blob as a file anyway.

**Do not treat `base64` as the download path, and do not ask a tester to decode it in a client.** The download surface is `downloadUrl`. Also: do not use this tool to investigate which channel a client reads. It is the single tool whose channels disagree, and generalising from it produced a three-week regression once already — any other tool is a valid subject for that question.

**Failure modes**

| Symptom                                      | Means                                          | Do                                                 |
| -------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `bulletCount` is 17                          | The skip-if directive did not fire             | Fail — `transactionContext` is not driving removal |
| `bulletCount` is 18                          | Neither the exclusion nor the skip-if fired    | Fail — quote both arguments as sent                |
| Two identical calls give different filenames | Expected: the filename embeds the current date | Not a defect                                       |
| No `base64` visible in Mode A                | Expected — see Mode differences                | Not a defect                                       |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                        |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ------------------------------------------------------------ |
| 2026-08-10 | BL-119 | local stdio | 0.48.1  | B    | Pass    | `bulletCount` 16 — 18 − 1 excluded − 1 skip-if, as predicted |

---

## UAT-07.3 — Seed the body cache

**Goal**: Proves the hash step works and, critically, that it **writes server state** the two downstream cases depend on. This is the only tool in the family that is not read-only.

**Input**

| Field       | Required | Value for this case              | Constraint a tester must respect                   |
| ----------- | -------- | -------------------------------- | -------------------------------------------------- |
| `filledIrl` | **yes**  | A populated IRL body (see below) | **≥ 200 characters** — shorter bodies are rejected |

Use a short populated IRL. The one below is what the recorded run used; any body over 200 characters works, but reuse this one if you want the recorded hash to match.

> **The body ends with a trailing newline, and that matters.** The fenced block below is 825 bytes without it and hashes to `6713e3e9a3bd6888`; with it the body is **826 bytes** and hashes to the documented `7aa62168e54409bb`. Hashing is byte-for-byte with no normalisation, so a tester who copies the fence contents literally gets a "wrong" hash and — per the failure table below — goes hunting for smart quotes. Append the newline.

```markdown
## Section 00 — Basics

- Company name: Northwind Health Systems, Inc. (brand: Northwind)
- Annual recurring revenue: $18.4M ARR as of Q2 2026
- Business model: B2B SaaS sold to regional hospital networks
- Geographies of operation: United States and Canada
- Headquarters jurisdiction: Delaware C-corp, operating from Boston, MA
- Company age: founded 2016; pivoted from claims processing to care coordination in 2019
- Total headcount: 142 today, 118 twelve months ago
- Year-over-year growth rate: 31% revenue growth

## Section 03 — Infrastructure & Operations

- Hosting model: AWS us-east-1 primary with us-west-2 warm standby
- Monthly hosting spend: $61,000 average across the last three months
- Headcount dedicated to infrastructure operations: 6 FTE
- Deployment frequency to production: multiple times per day
```

**Steps**

1. Paste the body above and ask: _Using the GST connector, prepare this IRL body and give me the body hash._
   Mode B: call `prepare_irl_body` with `{ "filledIrl": "<the body above>" }`.

**Expected result**

- `irlBodyHash` is exactly **16 lowercase hex characters**.
- `byteLength` is the UTF-8 length of the body you sent — **826** for the body above.
- Calling twice with the identical body returns the **identical** hash. No normalisation is applied; it is byte-for-byte, so a single changed space produces a different hash.
- With the body above verbatim, the hash is `7aa62168e54409bb`.

Keep the hash. UAT-07.4 and UAT-07.5 both need it.

**Failure modes**

| Symptom                              | Means                                                 | Do                                                  |
| ------------------------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| Validation error on `filledIrl`      | Body is under 200 characters                          | Lengthen it; not a defect                           |
| Hash differs from `7aa62168e54409bb` | Your body differs — trailing whitespace, smart quotes | Not a defect unless you are certain the bytes match |
| Same body, two different hashes      | Hashing is not deterministic                          | Fail — this breaks the whole pipeline               |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                         |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ----------------------------- |
| 2026-08-10 | BL-119 | local stdio | 0.48.1  | B    | Pass    | `7aa62168e54409bb`, 826 bytes |

---

## UAT-07.4 — Catch a fabricated citation

**Goal**: Proves the fabrication guard actually works — that a citation which sounds plausible but does not appear in the IRL is reported as unverified rather than accepted. This is the case that protects a client deliverable.

**Input**

| Field         | Required  | Value for this case    | Constraint a tester must respect    |
| ------------- | --------- | ---------------------- | ----------------------------------- |
| `irlBodyHash` | see below | The hash from UAT-07.3 | 16 lowercase hex                    |
| `filledIrl`   | see below | _omitted_              | ≥ 200 chars when used               |
| `citations`   | **yes**   | Three entries (below)  | Min 1; each is `{ path, citation }` |

**At least one of `filledIrl` / `irlBodyHash` is required** — supplying neither fails. Passing the hash alone is the point of this case: it proves UAT-07.3's cache write landed, since the server has to re-hydrate the body to check anything.

Send three citations — two real, one invented:

```json
[
  {
    "path": "_audit.arr.citation",
    "citation": "Section 00 — Annual recurring revenue: $18.4M ARR as of Q2 2026"
  },
  {
    "path": "_audit.infraHostingAnnual.citation",
    "citation": "Section 03 — Monthly hosting spend: $61,000 average across the last three months"
  },
  {
    "path": "section-F.headline",
    "citation": "Section 06 — SOC 2 Type 2 certified since 2021 with zero exceptions"
  }
]
```

**Steps**

1. Ask: _Validate these citations against the IRL body I just prepared, using the body hash._
   Mode B: call `validate_irl_provenance` with `{ "irlBodyHash": "<hash>", "citations": [...] }`.

**Expected result**

- `total` is 3, `verified` is **2**, `unverified` is **1**.
- The two real citations come back `status: "verified"`, each with a `matchedSpan` showing the normalised text that matched — lowercased and punctuation-stripped, e.g. `annual recurring revenue $18 4m arr as of q2 2026`.
- The third comes back `status: "unverified"` with **no** `matchedSpan`. The IRL never mentions SOC 2; the citation is fabricated and the tool says so.
- Verdicts are returned in the order the citations were sent, each echoing its `path`.
- The call succeeds **without** `filledIrl` — proof the body was re-hydrated from the cache UAT-07.3 seeded.

**Failure modes**

| Symptom                                    | Means                                              | Do                                                          |
| ------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------- |
| The fabricated citation returns `verified` | The guard is not working                           | **Fail — escalate.** This is the highest-severity case here |
| Body-cache miss                            | UAT-07.3 was skipped, or its entry expired         | Re-run UAT-07.3, then retry                                 |
| All three `unverified`                     | Wrong hash, or the body differs from the citations | Confirm the hash before filing                              |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                  |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ---------------------------------------------------------------------- |
| 2026-08-10 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 2 verified / 1 unverified; hash-only mode confirmed cache re-hydration |

---

## UAT-07.5 — Compose the envelope

**Goal**: Proves the pipeline's terminus assembles a complete, provenance-checked envelope — and that it refuses to run when the body cache was never seeded.

**Input**

The largest input surface in the server; the full field list is in the [contract](../../tools/irl-pipeline/CONTRACT.md#compose_dossier_envelope--field-overview). The constraints that trip a first call:

| Field                                                                         | Required | Note                                                                                                                   |
| ----------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `promptName`                                                                  | yes      | Literal `"gst_irl_ingestion"` — nothing else is accepted                                                               |
| `modelVersion`                                                                | yes      | Vendor-family-version shape, e.g. `claude-opus-5`. Bare `unknown` is rejected                                          |
| `irlSource`                                                                   | yes      | Enum; `partner-paste-verbatim` for a body the operator pasted                                                          |
| `irlBodyHash`                                                                 | yes      | From UAT-07.3 — the **only** way to reference the body                                                                 |
| `fillRatio`                                                                   | yes      | `{ percent, substantiveCells, totalCells, status }`                                                                    |
| `claims`                                                                      | yes      | Min 1; each `{ claim, citation, tier }` with tier `"1"`/`"2"`/`"3"`                                                    |
| `gatesPassed`, `gatesElided`, `conditionalTriggersFired`, `forceToolsApplied` | yes      | **Required but may be empty.** Omitting one is an error; `[]` is fine                                                  |
| `gaps`                                                                        | yes      | May be empty. Do **not** pre-populate `provenance-gap` / `tier-mismatch` / `tier-fabrication` — the tool appends those |

Those four array fields are the most common first-call mistake: they are required, and passing `[]` is how you say "none".

**Steps**

1. Call with the hash from UAT-07.3, `mode: "full"`, `verbosity: "compact"`, `transactionContext: "buy-side"`, a `fillRatio` of `{ percent: 24, substantiveCells: 16, totalCells: 67, status: "partial" }`, two `gatesPassed`, one `gatesElided`, empty arrays for the other two, three `claims` (two tier-1, one tier-2), and one `extraction-only` gap.

**Expected result**

- Three markdown blocks come back: `metaFenceMarkdown`, `gapListMarkdown`, `provenanceFooterMarkdown`.
- In the meta fence, `fixtureFillRatio` is **`0.24`** — `percent: 24` is rendered as a 0–1 fraction, not echoed as `24`.
- `promptVersion` appears in the fence with a **server-derived** value regardless of what you passed. Do not assert a specific version number here; assert only that it is present and semver-shaped.
- `provenanceVerification` reports `verified: 3, unverified: 0` for the three real claims, with `autoAppendedGaps: 0`.
- The tier-2 claim (a derivation — an annualised figure computed from a monthly one) verifies against the same bullet as its tier-1 source. Tier is a discipline label, not a different matching rule.
- `serverCachedBodyBytes` equals UAT-07.3's `byteLength` (**826**) — the cache round-trip, proven end to end.
- `provenanceFooterMarkdown` renders one line per claim, each ending `[✓ verified]`.
- `emitInstructions` tells the caller to transcribe the three blocks verbatim and not to hand-edit auto-appended gaps.

**Then prove the failure path.** Re-run the identical call with `irlBodyHash` set to `0000000000000000`:

- The call **fails** with a body-cache-miss error naming the missing key.
- The message directs the caller to `prepare_irl_body` and explains the two ways an entry can vanish — LRU eviction on stdio, TTL expiry on the Worker.
- The remedy is always to re-seed with `prepare_irl_body`, never to retry the same call.

**Failure modes**

| Symptom                                           | Means                                         | Do                                                    |
| ------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| Validation error naming an array field            | You omitted a required-but-may-be-empty array | Send `[]`; not a defect                               |
| `modelVersion` rejected                           | You sent `unknown` or a shape with no digits  | Send a real model id; not a defect                    |
| Body-cache miss on the **first** call             | UAT-07.3 was skipped or its entry expired     | Re-run UAT-07.3 and retry                             |
| The bogus hash **succeeds**                       | The body binding is not enforced              | **Fail — escalate.** The provenance guarantee is void |
| `serverCachedBodyBytes` ≠ UAT-07.3's `byteLength` | The hash resolved to a different body         | Fail                                                  |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                      |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ------------------------------------------------------------------------------------------ |
| 2026-08-10 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 3/3 verified, `fixtureFillRatio` 0.24, 826 bytes echoed; bogus-hash path errored correctly |

---

## UAT-07.6 — The prompt as the one-shot alternative

**Goal**: Proves that the supported end-to-end path exists and produces the same envelope discipline as driving 07.2–07.5 by hand — which is what an operator actually uses.

**Input**

`gst_irl_ingestion` takes `targetName`, `filledIrl` (≥ 200 chars), `transactionContext`, `partnerLead`, `projectCodeName`, `mode`, `verbosity`, `forceTools`, `requireVerbatimBody` — all optional. See [`prompts/irl-ingestion.md`](../../prompts/irl-ingestion.md).

**Steps**

1. Open a fresh thread and invoke the `gst_irl_ingestion` prompt with the UAT-07.3 body as `filledIrl`, `transactionContext: "buy-side"`, `mode: "full"`.

**Expected result**

- The run orchestrates the tools itself; you should see `compose_dossier_envelope` called at the end, not fabricated in prose.
- The dossier carries the meta fence as its first content, a `(J)` gap list, and a `(K)` provenance footer as its last section.
- When `filledIrl` arrives as a prompt argument, the body cache is pre-populated at render time — `prepare_irl_body` need not be called separately, and `irlSource` is a `partner-paste-verbatim` variant rather than a reconstruction.
- Claims in `(K)` carry tier labels and verification marks, exactly as in UAT-07.5.

**Mode differences**

Mode A only. Invoking a prompt is a client-side capability; there is no Mode B equivalent, so record Mode B as **Blocked** rather than Failed for this case.

**Failure modes**

| Symptom                                      | Means                                                               | Do                                          |
| -------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| The dossier has no meta fence / (J) / (K)    | The envelope tool was not called — the failure it exists to prevent | Fail — quote the run                        |
| A reconstruction `irlSource` despite pasting | The pre-population write did not land                               | Fail; the operator runbook has the recovery |
| The run stops early citing fill ratio        | Expected when the IRL is too sparse — a `halt` status               | Not a defect; use a fuller body             |

**Further reading**: [`OPERATOR_RUNBOOK.md`](../../../../../src/docs/development/OPERATOR_RUNBOOK.md) for run tiers, reading the VERIFY block, client-ready gating and failure recovery; [`IRL_PARTNER_PASTE_RUNBOOK.md`](../../../../../src/docs/development/IRL_PARTNER_PASTE_RUNBOOK.md) for turning a partner's filled `.xlsx` into the markdown body this case pastes.

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

## UAT-07.7 — The reconstruction path and the verbatim gate

**Goal**: Proves the pipeline labels a body it did not receive verbatim, and that the accuracy-critical gate refuses to certify one. This is the path an operator takes when the partner returns a filled `.xlsx` rather than markdown, and it is where provenance is easiest to overstate.

**Input**

Flatten a filled IRL workbook to markdown yourself, then run the UAT-07.3 → 07.4 → 07.5 chain over it. Two fields carry the whole case:

| Field                 | Value for this case                | Constraint a tester must respect                                                                                |
| --------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `irlSource`           | `"model-reconstruction-from-xlsx"` | Flattening a workbook **is** a reconstruction. Labelling it as a paste is the failure this case exists to catch |
| `requireVerbatimBody` | `false`, then `true`               | Run it both ways — the second run is the gate test                                                              |

**Extraction is your step, and it contaminates everything downstream.** The workbook's canonical layout is seven columns — `A Reference · B Request · C Status · D File Location · E Comments · F Notes · G Response`. **Trust the header row, never an Instructions sheet**: real-world workbooks predate the current generator, and one sample was found documenting a five-column layout with Response in D. An extractor following it would publish source-document filenames as the recipient's answers. Reconcile your row count against the workbook before proceeding, and state any judgement call you made.

**Expected result — `requireVerbatimBody` omitted**

- The chain succeeds and `serverCachedBodyBytes` equals `prepare_irl_body`'s `byteLength`.
- The server **auto-appends a `provenance-gap:` entry** to `(J)` naming the reconstruction limitation and stating that verbatim-body authority does not hold in this mode. You do not author that category — the tool owns it.
- `autoAppendedGaps` is ≥ 1.

**Expected result — `requireVerbatimBody: true`**

- The identical call is **rejected**, naming the cause, the remedy (paste the IRL as markdown so the bytes round-trip verbatim) and the escape hatch (omit the flag for drafting runs).
- A success here is high-severity: the gate exists so an accuracy-critical deliverable cannot rest on a body the model assembled.

**The accept-set, if you probe it**: `requireVerbatimBody: true` accepts **both** `partner-paste-verbatim` and `partner-paste-verbatim-prepop`, and rejects every reconstruction mode. The field description names only the first; the dual-accept is deliberate (a `-prepop` body is still a verbatim round-trip, pre-populated at prompt-render time).

**Why the pairing matters.** Because `-prepop` is inside the accept-set, a run that mislabels a reconstruction as `-prepop` would pass a gate it should fail **and** skip the provenance-gap disclosure the manual path correctly emits. Whether the prompt path can produce that mislabel — by recording how the bytes reached the tool rather than where they came from — is still open; see the note under UAT-07.6.

**Failure modes**

| Symptom                                       | Means                                          | Do                                                         |
| --------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| No `provenance-gap` entry on a reconstruction | The disclosure is not firing                   | **Fail — escalate.** The dossier overstates its provenance |
| `requireVerbatimBody: true` **succeeds**      | The gate is not enforcing                      | **Fail — escalate**                                        |
| `fillRatio` over 100%                         | You divided by 67 against an extended workbook | Not a defect — see the note below                          |

**On `fillRatio`**: the denominator is the rows **actually present in sections 00–09**, not the canonical 67. Workbooks are often _extended_ with engagement-specific sections (10, 11), which the prompt contract excludes from the pre-flight, and may carry more canonical rows than the base list. Dividing by 67 against an extended workbook yields a nonsensical percentage.

**On pre-populated rows**: a workbook may arrive with rows GST pre-filled from existing source documents rather than answered by the recipient. Nothing in the provenance vocabulary distinguishes the two, so a dossier counting them as partner answers makes a claim it cannot support. Mark them inline when you flatten (e.g. `[pre-populated, not recipient-confirmed]`) and say so in your report.

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                                                                  |
| ---------- | ------ | ---- | ------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | 134/134 rows; byte-exact 56906; `autoAppendedGaps: 2` (provenance-gap + an unprompted `map-absent` on Colorado AI Act) |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | `requireVerbatimBody: true` rejected the reconstruction; accept-set probe confirmed the dual-accept                    |

---

_Last updated: 2026-08-11 (BL-119 — 07.1–07.5 authored against local stdio; 07.7 added and executed against production in cycle 3. 07.6 still requires an interactive client whose prompt-argument field preserves newlines.)_
