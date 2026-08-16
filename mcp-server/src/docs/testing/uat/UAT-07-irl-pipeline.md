# UAT-07 — IRL / dossier pipeline

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`irl-pipeline/CONTRACT.md`](../../tools/irl-pipeline/CONTRACT.md)

Five tools that carry an engagement from "we need to ask the target for information" to "we have a provenance-checked dossier envelope". A full pass proves the thing no single-tool case can: that **state passes correctly between calls**. A hash minted by one tool is consumed by two others, and the last tool fails outright if the write that seeded it never happened.

This is the longest document in the suite and the one most worth running after any change to the IRL surface. Cases must be run **in order** — 07.5 depends on 07.3 having run in the same session.

> **Verified in production where it counts.** 07.7 ran on `0.48.1` (cycle 3), and 07.5 plus **07.6 — the last case in the suite to execute** — on `0.49.0` (cycle 5). The deployed Upstash-backed body cache is therefore exercised, which is the difference that matters here against the in-process LRU on stdio. 07.1–07.4 remain `local stdio` recordings: they prove the hash contract and the handler chain, not the deployed cache.
>
> **07.6 needs Claude Desktop, and its client constraints are load-bearing** — read them under that case before attempting it. Neither client handles a real-size IRL body cleanly, and the failure modes are silent rather than loud.

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

1. Call with the hash from UAT-07.3, `mode: "full"`, `auditLevel: "debug"`, `transactionContext: "buy-side"`, a `fillRatio` of `{ percent: 24, substantiveCells: 16, totalCells: 67, status: "partial" }`, two `gatesPassed`, one `gatesElided`, empty arrays for the other two, three `claims` (two tier-1, one tier-2), and one `extraction-only` gap.

**Expected result**

- Three markdown blocks come back: `metaFenceMarkdown`, `gapListMarkdown`, `provenanceFooterMarkdown`. **`debug` is deliberate here** — this case exists to prove the emitted envelope, and it is the only level that returns all three. At `enhanced` the meta fence is absent; at `standard` so is the provenance footer. That is the feature, not a failure: re-run at `debug` before filing.
- In the meta fence, `fixtureFillRatio` is **`0.24`** — `percent: 24` is rendered as a 0–1 fraction, not echoed as `24`.
- `promptVersion` appears in the fence with a **server-derived** value regardless of what you passed. Do not assert a specific version number here; assert only that it is present and semver-shaped.
- `provenanceVerification` reports `verified: 3, unverified: 0` for the three real claims, with `autoAppendedGaps: 0`.
- The tier-2 claim (a derivation — an annualised figure computed from a monthly one) verifies against the same bullet as its tier-1 source. Tier is a discipline label, not a different matching rule.
- `serverCachedBodyBytes` equals UAT-07.3's `byteLength` (**826**) — the cache round-trip, proven end to end.
- `provenanceFooterMarkdown` renders one line per claim, each ending `[✓ verified]`.
- `emitInstructions` names exactly the blocks this response carried — three, at `debug` — tells the caller to transcribe them verbatim, states that a block not listed was withheld deliberately and must not be reconstructed, and says not to hand-edit auto-appended gaps.
- `serverToolCallCounts.compose_dossier_envelope` reads **`attempted: 1, succeeded: 0`**. **This is correct and is not a defect.** The counter records `attempted` at wrapper entry and `succeeded` at wrapper exit, and this tool snapshots the counters from inside its own handler — so at snapshot time it genuinely has not returned yet. The semantic is deliberate ("I am reporting on the call I am currently inside"); the alternative would show `attempted: 0` for the tool doing the reporting. Every **other** tool in the snapshot reports normally. Testers filed this as a defect in three consecutive cycles, which is why it is written down here.
- **Read `countersScope` before judging any count (BL-121, prompt `0.22.4`).** The envelope now returns it alongside `serverToolCallCounts`, and it states how far back the snapshot reaches: `session` (stdio), `run` (remote + the durable run-scoped store live — every call against this IRL body, across requests), `request` (remote with no readable store — only the envelope's own request). **Against the remote Worker, expect `run`.** The BL-071 precheck identities (`iterations === succeeded`, and the two reconciliations that replaced the flat `attemptsTotal`/`errorsEncountered` equalities) are checkable under `session` and `run` only; under `request` they are not, and a VERIFY block showing a visible gap there is the **correct** output — a model that closed the gap fabricated it.
- **`attempted: 2, succeeded: 1` on a re-called envelope is the merge rule working, not a double count.** The first call completes and lands `{1,1}` in the durable row; the second reads that back and adds its own in-flight attempt. Executed in `tests/integration/bl-071-precheck-derivation.test.ts` → "cross-request re-call merges to {attempted: 2, succeeded: 1}", not just asserted here.
- **Re-running the SAME IRL within 4 hours makes the counts read LONG, and that is expected.** The durable row is keyed by the IRL body and lives 4h, so a second ingestion of unchanged bytes accumulates onto the first run's row — `precheck.iterations` is per-invocation while the server count is per-bytes-per-window. **This bites UAT specifically**, because re-running a case is the normal tester move. It is not a defect and not grounds to fail the run: confirm a prior ingestion of the same bytes, expect the model to report the served numbers with a note rather than subtracting, and use a modified body (or wait out the TTL) when you need a clean count.
- **A count SHORT of what the transcript shows has exactly three causes** — `request` scope, the model validating a **different body** than it composed (durable counts are keyed by the IRL body itself; this one is a real audit finding, not a counter fault), or a lost write during an Upstash brownout. Two discriminators: an absent tool entry differs from a zeroed one, and a `prepare_irl_body` row proves the store was live — except on the pre-populated path, where the model correctly never calls it.

**Then prove the framework-recognition path both ways.** A `map-absent` gap entry that fails to appear is ambiguous on its own: it is equally consistent with "the framework was recognised" and with "the check stopped firing for anything". Only a negative control separates them.

Re-run the call with `defaultFiredFrameworks` carrying **one framework the regulatory map covers and one that cannot exist** — e.g. `["Colorado AI Act", "Atlantis Algorithmic Fairness Directive 2031"]`:

- **Exactly one** `map-absent` gap entry is auto-appended, naming the invented framework, with follow-up prose directing a coverage request.
- `autoAppendedGaps` is **1**, not 0 and not 2.
- The real framework is **retained** in the meta fence's `defaultFiredFrameworks` and generates **no** gap entry — matching is by name against the map, not a blanket accept.

Both behaviours must appear in the **same response**. One without the other proves nothing: all-absent means recognition is broken, none-absent means the check is disabled. This control is why cycle 5's Task C result is trustworthy — the tester added it unprompted after noticing the ambiguity.

**Then prove the body-binding failure path.** Re-run the identical call with `irlBodyHash` set to `0000000000000000`:

- The call **fails** with a body-cache-miss error naming the missing key.
- The message directs the caller to `prepare_irl_body` and explains the two ways an entry can vanish — LRU eviction on stdio, TTL expiry on the Worker.
- The remedy is always to re-seed with `prepare_irl_body`, never to retry the same call.

**Failure modes**

| Symptom                                           | Means                                         | Do                                                                         |
| ------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| Validation error naming an array field            | You omitted a required-but-may-be-empty array | Send `[]`; not a defect                                                    |
| `modelVersion` rejected                           | You sent `unknown` or a shape with no digits  | Send a real model id; not a defect                                         |
| Body-cache miss on the **first** call             | UAT-07.3 was skipped or its entry expired     | Re-run UAT-07.3 and retry                                                  |
| The bogus hash **succeeds**                       | The body binding is not enforced              | **Fail — escalate.** The provenance guarantee is void                      |
| `serverCachedBodyBytes` ≠ UAT-07.3's `byteLength` | The hash resolved to a different body         | Fail                                                                       |
| No `map-absent` for the **invented** framework    | Recognition accepts anything                  | **Fail — escalate.** Every future run's clean gap list becomes meaningless |
| `map-absent` for the **real** framework           | Recognition is not resolving names to the map | Fail — this is the cycle-3 false positive returning                        |
| `succeeded: 0` for `compose_dossier_envelope`     | Nothing. In-flight snapshot, by design        | **Not a defect.** See the expected-result note above                       |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-10 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 3/3 verified, `fixtureFillRatio` 0.24, 826 bytes echoed; bogus-hash path errored correctly                                                                                                                                                                                                                                                                                                       |
| 2026-08-12 | Cowork | prod        | 0.49.0  | B    | Pass    | Cycle-5 Task C — closed the cycle-3 loop. Envelope naming the Colorado AI Act produced **no** spurious `map-absent` (`autoAppendedGaps: 0`), framework retained in the meta fence, 3/3 claims verified. Tester added a negative control unprompted — a real + an invented framework in one call produced exactly one `map-absent`, for the invention — which is now a standing part of this case |

---

## UAT-07.6 — The prompt as the one-shot alternative

**Goal**: Proves that the supported end-to-end path exists and produces the same envelope discipline as driving 07.2–07.5 by hand — which is what an operator actually uses.

**Input**

`gst_irl_ingestion` takes `filledIrl` (≥ 200 chars), `targetName`, `transactionContext`, `partnerLead`, `projectCodeName`, `mode`, `auditLevel`, `requireVerbatimBody` — all optional, and rendered in that order by the client form. See [`prompts/irl-ingestion.md`](../../prompts/irl-ingestion.md).

**`auditLevel` decides what the dossier carries.** `standard` (the default) is a clean partner-facing document — no meta fence, no `(K)` footer, no `RUN-AUDIT` block. `enhanced` adds `(K)` and the per-section audit fences. `debug` adds the meta fence and the run-audit block. Provenance verification runs identically at every level, so a `standard` dossier is fully verified but not self-evidencing. **Run this case at `debug`** — its expectations below read the audit surface.

**Steps**

1. Open a fresh thread and invoke the `gst_irl_ingestion` prompt with the UAT-07.3 body as `filledIrl`, `transactionContext: "buy-side"`, `mode: "full"`, `auditLevel: "debug"`.

**Expected result**

- The run orchestrates the tools itself; you should see `compose_dossier_envelope` called at the end, not fabricated in prose.
- The dossier carries the meta fence as its first content, a `(J)` gap list, and a `(K)` provenance footer as its last section.
- When `filledIrl` arrives as a prompt argument, the body cache is pre-populated at render time — `prepare_irl_body` need not be called separately, and `irlSource` is a `partner-paste-verbatim` variant rather than a reconstruction.
- Claims in `(K)` carry tier labels and verification marks, exactly as in UAT-07.5.
- **`irlSource` reads `partner-paste-verbatim-prepop`, and that is the strongest form, not a weaker one.** It means the server hashed and cached the operator's bytes at render time, so the body never round-tripped through model emission. Two independent signals should agree with it: `hashBindResult: pass-bound` (the model copied the hash from the server's `**Body-binding hash:**` directive rather than computing one), and **no `provenance-gap` entry in (J)** — that auto-append fires only for `model-reconstruction-*` sources, so its absence is the server's own gap logic concurring. A `-prepop` label with a `provenance-gap` beside it would be a contradiction worth escalating — **except** for the one BL-123 introduced deliberately: if (J) carries an `irlSource downgraded by the server` entry, the server's own record says the body was written by `prepare_irl_body` rather than by the render, and the capped `partner-paste-verbatim` is the honest reading. That combination is a finding about the run, not about the server.

  > **What this case does and does not settle.** Passing it establishes that when the operator pastes a **genuine verbatim body**, the `-prepop` label is honest — server-witnessed at the argument boundary, not a bare restatement of how the bytes travelled. It does **not** settle whether a _reconstructed_ body supplied through the same argument would also be labelled `-prepop`, because this case never supplies one. That remains open and is described under UAT-07.7; the two are complementary, and only the 07.7-shaped run can close it.

- **Do not expect an unanswered IRL cell to appear in (J).** The gap list records _analysis_ gaps — defaulted dimensions, extraction-only omissions, currency assumptions — not cells the partner left blank. A `<NO RESPONSE>` bullet that no tool needed produces no entry; the fill ratio is what accounts for it. (Recorded because it was predicted wrongly during the first execution.)

> **Compare `filledIrl.bytes` against the source file's real size, every time.** Under prepop this figure is the server's own `serverCachedBodyBytes` measurement of the cache entry, not a model self-report, which makes it the one trustworthy integrity check available to an operator. The first execution came back **56,906** against a **56,907**-byte source.
>
> **That one-byte gap is systematic, not a one-off.** UAT-07.7 recorded "byte-exact 56906" for the same engagement IRL the day before, through a completely different submission path. Two independent paths landing on the same figure points at the **file or read boundary** — the local copy being one byte larger than what both runs saw — rather than at any one client's clipboard. It was chased and not localized: ruled out were every newline variant, eleven encoding and normalization forms, every truncation prefix, all ~56,600 single-character deletions, and equal-width dash substitutions. A plain trailing-newline drop produces the right byte count but the wrong hash. What remains is either a length-reducing **substitution** — a multi-byte character replaced by a shorter one, which the deletion sweep does not cover — or two or more edits netting minus one. Do not search only for pairs. **Open.**
>
> The run remains valid — head/tail fingerprints matched, fill ratio matched an independent count, and 37/37 claims verified against the cached body — but **a larger drift would mean the dossier is bound to bytes that are not the partner's**, and neither the hash-bind nor `requireVerbatimBody` would catch it. The hash binds whatever arrives; the gate checks the label. This field is the only thing that checks the content.
>
> **Threshold**: the submitted body being **up to 2 bytes smaller** on a body over 10KB is a recording matter — note it and continue. Anything larger, any delta at all on a body of 10KB or smaller, and any delta whose sign is positive (the submitted body being _larger_ than source, which no known transformation produces) is a **Fail**: stop and identify the difference before the dossier is used.

**Mode differences**

Mode A only. Invoking a prompt is a client-side capability; there is no Mode B equivalent, so record Mode B as **Blocked** rather than Failed for this case.

**Client constraints — read before attempting.** This case pastes a large body into a prompt-argument form, and no client handles that cleanly at real IRL size:

| Client             | Behaviour at ~57KB                                                                                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude.ai **web**  | Refuses the attach outright — _"Failed to attach prompt."_ No request reaches the server (verified: zero Sentry events). At small sizes the same prompt attaches but the field is a single-line input that **strips newlines**, which nothing downstream catches |
| Claude **Desktop** | Accepts the paste and renders correctly, but delivers the expansion as an **attached document** rather than conversation turns. The model then reports it has no bound `filledIrl` argument and may decline to proceed                                           |

The Desktop path still works — the render fires, the server pre-populates the cache, and the hash in the rendered body is live (confirmable by calling `validate_irl_provenance` with the hash and no body). **As of prompt `0.22.2` / server `0.49.1` the body tells the model this itself**, so a balk is now a **finding** rather than the expected behaviour it was on `0.49.0` and earlier — record it, then tell it to proceed on the directive's hash and **not** to reconstruct or re-submit the body. A fallback to `prepare_irl_body` would degrade `irlSource` to `partner-paste-verbatim` and stop the case from testing the prepop path at all.

> **Attribution corrected in BL-125.** Four balks were observed across three surfaces on 2026-08-14, and they were not the client's doing. The `0.22.2` clause existed on **one of the five rendered bodies** — the one-shot path — because its argument is the `**Body-binding hash:**` directive, which only that body renders. Extract-only, the interactive path and both `gst_information_request_list` branches had no such clause, and the one surface that carried it recovered on its own while the two without it stopped and asked the operator. A structural variant now covers all five. A balk remains a finding; from `0.26.0` it is a finding about the clause, not about the client.

**Where this leaves the one-shot workflow**: for bodies at real IRL size the operator-side path in [`IRL_PARTNER_PASTE_RUNBOOK.md`](../../../../../src/docs/development/IRL_PARTNER_PASTE_RUNBOOK.md) is the supported route, and this prompt is best reserved for smaller ones.

**Failure modes**

| Symptom                                                                               | Means                                                                        | Do                                                                                                                               |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| The dossier has no meta fence / (J) / (K)                                             | The envelope tool was not called — the failure it exists to prevent          | Fail — quote the run                                                                                                             |
| A reconstruction `irlSource` despite pasting                                          | The pre-population write did not land                                        | Fail; the operator runbook has the recovery                                                                                      |
| The run stops early citing fill ratio                                                 | Expected when the IRL is too sparse — a `halt` status                        | Not a defect; use a fuller body                                                                                                  |
| `filledIrl.bytes` ≠ the source file's size                                            | The body was altered between the file and the server — see the note above    | Within the threshold above: record and continue. Outside it: **Fail** — the dossier is bound to bytes that are not the partner's |
| `toolErrors` shows an `arg-shape-rejection` that then **succeeded on identical args** | The client called the tool before loading its schema — deferred tool loading | Not a server defect. It lands in `toolErrors` where it reads like our tool rejecting valid input; note it and move on            |
| The model reports a hash from an earlier attempt                                      | Stale context after restarting a run in the same thread                      | Start a **fresh** thread. Cross-check any hash against the `**Body-binding hash:**` directive in the current render              |

**Further reading**: [`OPERATOR_RUNBOOK.md`](../../../../../src/docs/development/OPERATOR_RUNBOOK.md) for run tiers, reading the VERIFY block, client-ready gating and failure recovery; [`IRL_PARTNER_PASTE_RUNBOOK.md`](../../../../../src/docs/development/IRL_PARTNER_PASTE_RUNBOOK.md) for turning a partner's filled `.xlsx` into the markdown body this case pastes.

**Run log**

| Date       | Tester   | Env  | Version | Mode | Verdict | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | -------- | ---- | ------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-12 | Cowork   | prod | 0.48.2  | A    | Blocked | Attempted in production; could not execute. The case needs Claude Desktop's prompt-argument field — claude.ai web renders `filledIrl` as `<input type="text">` and strips newlines (re-verified: `"A\nB\nC"` read back as `"ABC"`), and the tester's session automates Chrome only. Body staged and hash-verified; feeding a knowingly newline-stripped body would answer a different question. The `-prepop` mislabel question stays open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-12 | Operator | prod | 0.49.0  | A    | Pass    | **First execution in any environment.** `irlSource: partner-paste-verbatim-prepop` — the prompt-argument paste yields server-witnessed provenance, answering the question open since cycle 3. `hashBindResult: pass-bound`; **37/37 claims verified**, 0 unverified / 0 tierMismatches / 0 tierFabrications; precheck converged in 2 iterations; `gatesElided: []`. (J) carried **no `map-absent`** (closing the cycle-3 false positive on a real dossier) and **no `provenance-gap`** — the latter is the server independently agreeing this was a verbatim run. `filledIrl.bytes` 56,906 against a 56,907-byte source: a 1-byte drift the field exists to surface, unexplained — see the note under this case                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-14 | Operator | prod | 0.52.0  | A    | Pass    | **Closes the case on its intended `-prepop` path for the first time since BL-122.** A 51,787-byte **flattened** paste (141 newlines collapsed by the Desktop form, trailing one dropped) bound `740d907b75139083` and ran the full sweep: `irlSource: partner-paste-verbatim-prepop` **uncapped**, `hashBindResult: pass-bound`, **58/58 claims verified**, 0 unverified / 0 tierMismatches / 0 tierFabrications, 0 auto-appended provenance gaps, `gatesElided: []`. `filledIrl.newlines: 0` — the BL-124 diagnostic doing its job: the body will not hash-match the operator source file, and the field says why. Byte delta is source−1, exactly the trailing newline the form drops. **Counters came back long** (6 validate / 2 envelope against the model own 2 / 1) under `countersScope: run`; the model reported the served numbers unchanged and named a prior ingestion of identical bytes inside the 4h window — the BL-121 benign-long-count path, first exercised in production. Ran at `enhanced` rather than the requested `debug`: the model self-reported the level because no body stated it, which is BL-125 #1. |

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

**The body shape is now specified, and the prompt states it (BL-120, prompt `0.22.3`).** Every filled row renders as `- <ref> <request> [<STATUS>] — <answer> (Source: <D>) (Note: <F>)`, where `<answer>` is **Response and Comments joined into one contiguous unlabelled span**, Response first. Source and Note stay **outside** the answer slot, so a row whose only content is a file pointer reads `— <NO RESPONSE> (Source: …)` and must not be counted as answered. A reconstruction that drops D/E/F is now a **failure of this case**, not a stylistic difference: on the first real workbook measured, doing so discarded 45.2% of the authored characters and rendered 17 answered rows as unanswered. Count the fill ratio over the composed answer span, not over column G alone. See [ADR-0015](../../../../../src/docs/adr/0015-irl-canonical-body-reads-full-workbook.md).

**Re-extracting a workbook processed before 0.49.2 now yields a materially larger body** — expect roughly a 50% increase where Comments was populated (51,788 → 79,079 bytes on the measured sample), which can push it past the ~57KB ceiling claude.ai web will accept as a prompt argument. Use Claude Desktop.

**Expected result — `requireVerbatimBody` omitted**

- The chain succeeds and `serverCachedBodyBytes` equals `prepare_irl_body`'s `byteLength`.
- The server **auto-appends a `provenance-gap:` entry** to `(J)` naming the reconstruction limitation and stating that verbatim-body authority does not hold in this mode. You do not author that category — the tool owns it.
- `autoAppendedGaps` is ≥ 1.

**Expected result — `requireVerbatimBody: true`**

- The identical call is **rejected**, naming the cause, the remedy (paste the IRL as markdown so the bytes round-trip verbatim) and the escape hatch (omit the flag for drafting runs).
- A success here is high-severity: the gate exists so an accuracy-critical deliverable cannot rest on a body the model assembled.

**The accept-set, if you probe it**: `requireVerbatimBody: true` accepts **both** `partner-paste-verbatim` and `partner-paste-verbatim-prepop`, and rejects every reconstruction mode. The field description names only the first; the dual-accept is deliberate (a `-prepop` body is still a verbatim round-trip, pre-populated at prompt-render time).

**Why the pairing matters.** Because `-prepop` is inside the accept-set, a run that mislabels a reconstruction as `-prepop` would pass a gate it should fail **and** skip the provenance-gap disclosure the manual path correctly emits. Whether the prompt path can produce that mislabel — by recording how the bytes reached the tool rather than where they came from — is **still open**. Closing it needs one run of `gst_irl_ingestion` with a reconstructed body supplied as the `filledIrl` argument, from a client whose prompt-argument field preserves newlines (a single-line input silently joins the body and answers a different question).

**Failure modes**

| Symptom                                       | Means                                          | Do                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `provenance-gap` entry on a reconstruction | The disclosure is not firing                   | **Fail — escalate.** The dossier overstates its provenance                                                                                                                                                                                                                                                                                                           |
| `requireVerbatimBody: true` **succeeds**      | The gate is not enforcing                      | **Fail — escalate**                                                                                                                                                                                                                                                                                                                                                  |
| `fillRatio` over 100%                         | You divided by 67 against an extended workbook | Not a defect — see the note below. Since BL-130 the fence carries the **server-derived** figure. Counts that cannot yield a percentage (numerator above denominator) are NOT overridden — the fence still shows the figure the run reported, and the inconsistency is disclosed in (J). A fence percent above 100 is therefore still possible and still not a defect |

**On `fillRatio`**: the denominator is the rows **actually present in sections 00–09**, not the canonical 67. Workbooks are often _extended_ with engagement-specific sections (10, 11), which the prompt contract excludes from the pre-flight, and may carry more canonical rows than the base list. Dividing by 67 against an extended workbook yields a nonsensical percentage.

**On pre-populated rows**: a workbook may arrive with rows GST pre-filled from existing source documents rather than answered by the recipient. Nothing in the provenance vocabulary distinguishes the two, so a dossier counting them as partner answers makes a claim it cannot support. Mark them inline when you flatten (e.g. `[pre-populated, not recipient-confirmed]`) and say so in your report.

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                                                                  |
| ---------- | ------ | ---- | ------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | 134/134 rows; byte-exact 56906; `autoAppendedGaps: 2` (provenance-gap + an unprompted `map-absent` on Colorado AI Act) |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | `requireVerbatimBody: true` rejected the reconstruction; accept-set probe confirmed the dual-accept                    |

---

_Last updated: 2026-08-11 (BL-119 — 07.1–07.5 authored against local stdio; 07.7 added and executed against production in cycle 3. 07.6 still requires an interactive client whose prompt-argument field preserves newlines.)_
