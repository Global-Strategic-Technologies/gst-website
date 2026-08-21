---
tool: compose_dossier_envelope
version: v1
lastAuthored: 2026-08-21
schema: mcp-server/src/schemas/compose-dossier-envelope.ts
---

# Input Contract: the IRL / dossier pipeline

> **Tools** (five, one family): `list_irl_requests` · `generate_information_request_list_xlsx` · `prepare_irl_body` · `validate_irl_provenance` · `compose_dossier_envelope`.
>
> **Why one contract for five tools**: they are a pipeline, not a menu. A hash produced by `prepare_irl_body` is consumed by the two tools after it, and `compose_dossier_envelope` fails outright if the preceding cache write never happened. Splitting the family across five documents would put the ordering constraint in none of them. `portfolio/` (two tools) and `radar/` (four names) set the family-scoped precedent.
>
> **Frontmatter anchor**: `tool:` names `compose_dossier_envelope` because it is the pipeline's terminus and by far its largest input surface — the one a reader most needs a contract for. The companion walkthrough opens at `list_irl_requests` instead, because a _tester_ starts where the work starts; this document anchors where the complexity is.
>
> **Sources of truth** (this contract cites them; it does not duplicate them):
>
> - **Validation**: [`mcp-server/src/schemas/compose-dossier-envelope.ts`](../../../schemas/compose-dossier-envelope.ts) · [`prepare-irl-body.ts`](../../../schemas/prepare-irl-body.ts) · [`validate-irl-provenance.ts`](../../../schemas/validate-irl-provenance.ts). The remaining two tools declare their schemas inline in the tool file: [`generate-information-request-list-xlsx.ts`](../../../tools/generate-information-request-list-xlsx.ts) (`GenerateIrlXlsxInputSchema`) and [`list-irl-requests.ts`](../../../tools/list-irl-requests.ts) (zero-arg).
> - **Canonical question source**: [`src/data/irl/information-request-list.md`](../../../../../src/data/irl/information-request-list.md) — what the generator and `list_irl_requests` actually read (67 bullets). **Not** the `gst://library/information-request-list` Resource, which is a separate Library-surface article (65 bullets) that the loader's own docstring says is deliberately decoupled and expected to diverge: edit the former to change the workbook, the latter to change the published article.
> - **Cross-tool SOP**: [`library/irl-tool-input-mapping.md`](../../library/irl-tool-input-mapping.md) — which IRL bullet feeds which Hub tool input.
>
> **Used by prompts**: [`gst_information_request_list`](../../prompts/README.md) (emits the intake ask) and [`gst_irl_ingestion`](../../prompts/irl-ingestion.md) (ingests a populated IRL and orchestrates the full dossier sweep).
>
> **Version**: `v1` | **Last authored**: 2026-08-21
>
> **Registry**: see [`../README.md`](../README.md) for the "what is an input contract" narrative and the cross-tool registry.

---

## Pipeline order

```
list_irl_requests            (discovery — optional, zero-arg)
        │
generate_information_request_list_xlsx   (emit the ask; partner fills it in)
        │
        ▼   … partner returns a populated IRL …
prepare_irl_body             (REQUIRED FIRST — seeds the body cache, returns irlBodyHash)
        │
        ├──▶ validate_irl_provenance     (accepts the hash OR the raw body)
        │
        └──▶ compose_dossier_envelope    (accepts ONLY the hash; hard-fails without the cache write)
```

`prepare_irl_body` is the only tool in the family that writes server state (`readOnlyHint: false`). Everything downstream of it depends on that write.

---

## `list_irl_requests` — field overview

Zero arguments. Returns the canonical question set:

```typescript
{
  requests: Array<{
    key: string,              // "NN-II" — section + 1-based ordinal, e.g. "02-03"
    section: string,          // "00".."09"
    sectionTitle: string,
    text: string,
    skipIf?: { context: string[] },   // engagement contexts that auto-remove this question
  }>,
  sectionCount: number,
  bulletCount: number,
}
```

Call it before `excludeRequests` — it is the only way to map "drop the competitive-landscape question" onto the exact key the generator accepts.

---

## `generate_information_request_list_xlsx` — field overview

Every field is optional; `{}` produces the full canonical workbook.

| Field                    | Type                                                          | Required | Default  |
| ------------------------ | ------------------------------------------------------------- | -------- | -------- |
| `targetName`             | string (non-empty)                                            | no       | _absent_ |
| `companyName`            | string (non-empty)                                            | no       | _absent_ |
| `projectName`            | string (non-empty)                                            | no       | _absent_ |
| `transactionContext`     | `sell-side` \| `buy-side` \| `value-creation` \| `unknown`    | no       | _absent_ |
| `productSummary`         | string, 10–500 chars                                          | no       | _absent_ |
| `includeSections`        | array (min 1) of `/^\d{2}$/`                                  | no       | all      |
| `excludeRequests`        | array (1–100) of `/^\d{2}-\d{2}$/`                            | no       | _none_   |
| `customRequests`         | array (max 50) of `{ section: /^\d{2}$/, text: 1–500 chars }` | no       | _none_   |
| `showCanonicalReference` | boolean                                                       | no       | `false`  |

**Sections**: `00` Basics · `01` Product · `02` Software Architecture · `03` Infrastructure & Operations · `04` SDLC · `05` Data, Analytics & AI · `06` Security · `07` People & Organization · `08` Corporate IT · `09` Governance & Compliance.

**Three independent subtractions compose.** `includeSections` keeps whole sections; `excludeRequests` removes individual questions by key; `transactionContext` fires the source's authored skip-if directives, auto-removing every question tagged for that context. Surviving questions keep their Reference IDs, so the gaps are visible and read as deliberate. `productSummary` is accepted for shape parity with the `gst_information_request_list` prompt and has no effect on the workbook.

### Output shape

```typescript
{
  filename: string,        // "GST-IRL-<slug>-<YYYY-MM-DD>.xlsx"
  base64: string,          // the workbook bytes
  mimeType: string,        // application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  byteLength: number,
  sectionCount: number,
  bulletCount: number,
  downloadUrl: string,     // the Hub generator, with this call's args pre-filled
  canonicalUrl: string,    // the library article
}
```

**`downloadUrl` is the download surface, not `base64`.** The tool returns `structuredContent` carrying the full payload and a two-block `content` whose second block replaces `base64` with a marker (`textOmit`). Claude Desktop's renderer cannot present the blob, so a human is directed to `downloadUrl`; a programmatic consumer reads `structuredContent`. `annotations.idempotentHint` is `false` — the filename embeds the current date, so two identical calls differ.

> **Do not use this tool for which-channel-does-the-client-read probes.** It is the one tool whose two channels deliberately differ, and generalising from it is what produced three weeks of count-only tool results under BL-090. Any other tool is a valid probe subject; this one is not.

---

## `prepare_irl_body` — field overview

| Field       | Type                       | Required | Constraint  |
| ----------- | -------------------------- | -------- | ----------- |
| `filledIrl` | string (markdown IRL body) | **yes**  | ≥ 200 chars |

Returns `{ irlBodyHash: string /* 16 lowercase hex */, byteLength: number, mintedAt?: string /* ISO-8601 */ }`.

The hash is `sha256(filledIrl).slice(0, 16)` with **no normalization** — byte-for-byte. Same body in, same hash out. Do not hand-compute it: `compose_dossier_envelope` accepts only the value this tool returns, and a guessed hash produces a cache miss rather than a mismatch you can debug.

### `mintedAt` — the STORED timestamp, and why it is optional

`mintedAt` is the ISO-8601 time the server holds in the body-provenance record for this hash (`mcp:irl-body-prov:<irlBodyHash>`, 4 h). It is **not this call's clock**: the store is first-write-wins, so a repeat call inside the window — or a call following the prompt-render prepop, which mints first on the one-shot path — returns the **original** mint time. That is the point. The value is what makes `server-witnessed` an honest label on an IRL extract record's `_meta.generatedAt`; a caller reporting its own clock would be asserting a witness the server never made.

The field is **absent** when no provenance record landed: the store swallows its own failures by design (a missing provenance record only weakens an audit claim, while a missing body corrupts the dossier — [ADR-0016](../../../../../src/docs/adr/0016-run-scoped-durable-tool-call-counters.md)'s trade), and it is never bound in-memory on the Worker. On absence, fall back to your own timestamp and report `generatedAtSource: "model-asserted"`. Do not invent a value and do not claim a witness you were not given — over-claiming provenance is the failure class [ADR-0018](../../../../../src/docs/adr/0018-body-integrity-and-capped-provenance.md) exists to prevent.

Mechanically, this costs nothing: the provenance store's `record()` returns the effective entry (`existing ?? entry`, `null` on the swallowed-error path) and both impls already read the key inside `record()`, so no round trip was added to a path this document flags as cost-sensitive.

### Worked acceptance: minting provenance for a travelling extract record

`gst_irl_ingestion` in `mode: extract-only`, deferred arm (no `filledIrl` argument; the operator pastes the body in reply):

```jsonc
// 1. The ONLY tool call this mode makes. It computes nothing about the target.
prepare_irl_body({ "filledIrl": "<the pasted body, verbatim>" })
// → { "irlBodyHash": "9f2c0a71b3d84e56", "byteLength": 61_204,
//     "mintedAt": "2026-08-20T09:14:02.118Z" }

// 2. Those two values go straight into the record's `_meta`.
{
  "_meta": {
    "irlBodyHash": "9f2c0a71b3d84e56",
    "generatedAt": "2026-08-20T09:14:02.118Z",
    "generatedAtSource": "server-witnessed",
    "irlSource": "partner-paste-verbatim"
    // …recordVersion, refFormat, promptVersion, excerptCapChars, coverage
  },
  "facts": [ /* one per answered row */ ]
}
```

**Session 2, the same record, a cold cache.** The record travels in the conversation; the cache entry does not survive 4 h. `validate_irl_provenance({ irlBodyHash, citations })` then **fails** with `cache-miss` — it does not degrade to per-citation verdicts. Recovery, in this order:

```jsonc
// 1. Re-seed FIRST. Body-direct validation would re-emit the whole body per
//    call — 60–80 KB, above the emission ceiling — which is the damage the
//    body-by-hash path exists to remove.
prepare_irl_body({ "filledIrl": "<the paired body>" })
// → { "irlBodyHash": "9f2c0a71b3d84e56", ... }

// 2. Compare THAT hash against the record's `_meta.irlBodyHash`. Equal → the
//    exact bytes the record was extracted from. Different → verification still
//    runs against the bytes you supplied, but the output must disclose that the
//    body is not byte-identical to the record's minted source (hashing is
//    byte-for-byte with no normalization, and a re-paste can legitimately
//    alter bytes).

// 3. Only now does the hash form resolve.
validate_irl_provenance({ "irlBodyHash": "9f2c0a71b3d84e56", "citations": [ ... ] })
```

Full decision record: [ADR-0019](../../../../../src/docs/adr/0019-irl-extract-record-subject-indexing.md).

---

## `validate_irl_provenance` — field overview

| Field         | Type                                  | Required        |
| ------------- | ------------------------------------- | --------------- |
| `filledIrl`   | string, ≥ 200 chars                   | see cross-field |
| `irlBodyHash` | string, `/^[a-f0-9]{16}$/`            | see cross-field |
| `citations`   | array (min 1) of `{ path, citation }` | **yes**         |

**Cross-field rule**: at least one of `filledIrl` / `irlBodyHash` must be supplied. This is enforced by a `superRefine` on the composed object, not by either field's own shape — so a call omitting both parses at the field level and fails at the object level. `filledIrl` wins when both are present.

`citation` is either a single string or an array of 1–8 strings. The array form is for a claim genuinely synthesised from multiple bullets; the verifier checks each element and aggregates conservatively (any element unverified → the whole citation is unverified).

### Verdict buckets

| Status             | Meaning                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `verified`         | The excerpt after the em-dash is a substring of the normalized IRL             |
| `verified-fuzzy`   | Not verbatim, but ≥ 8 consecutive words match — tolerates light paraphrase     |
| `partner-supplied` | The `Section --` sentinel form; no IRL to verify against, so none is expected  |
| `unverified`       | Neither verbatim nor fuzzy. Treat as fabrication: pull the claim or re-cite it |

---

## `compose_dossier_envelope` — field overview

The pipeline terminus and the largest input surface in the family. Every field below is required unless marked otherwise.

| Field                      | Type                                                            | Notes                                                                                       |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `promptName`               | literal `"gst_irl_ingestion"`                                   | the only shape supported today                                                              |
| `promptVersion`            | `/^\d+\.\d+\.\d+$/` — **optional**                              | server overrides it from the registry; not load-bearing                                     |
| `modelVersion`             | `/^[a-z][a-z0-9_-]*\d[a-z0-9_-]*$/`                             | e.g. `claude-opus-5`; bare `unknown` is rejected                                            |
| `mode`                     | `full` \| `extract-only`                                        |                                                                                             |
| `auditLevel`               | `standard` \| `enhanced` \| `debug`                             | Selects which markdown blocks come back — see Output                                        |
| `transactionContext`       | `sell-side` \| `buy-side` \| `value-creation` \| `unknown`      |                                                                                             |
| `fillRatio`                | `{ percent 0–100, substantiveCells ≥0, totalCells ≥1, status }` | `status`: `halt` \| `partial` \| `ok`. **`percent` + `status` are server-derived** (BL-130) |
| `gatesPassed`              | array of the orchestrated-tool enum                             | may be empty                                                                                |
| `gatesElided`              | array of `{ tool, reason, irlSection }`                         | may be empty                                                                                |
| `conditionalTriggersFired` | array of `EU_AI_ACT` \| `NIS2`                                  | may be empty                                                                                |
| `defaultFiredFrameworks`   | array of string — **optional**, default `[]`                    | frameworks only; certifications rejected                                                    |
| `forceToolsApplied`        | array of the orchestrated-tool enum                             | may be empty                                                                                |
| `claims`                   | array (min 1) of `{ claim, citation, tier: "1"\|"2"\|"3" }`     | every load-bearing claim the dossier will make                                              |
| `gaps`                     | array of `{ category, entry, irlSection?, followUp? }`          | may be empty                                                                                |
| `irlBodyHash`              | `/^[a-f0-9]{16}$/`                                              | from `prepare_irl_body`; the sole body reference                                            |
| `irlSource`                | see enum below                                                  |                                                                                             |
| `requireVerbatimBody`      | boolean — **optional**, default `false`                         | `true` rejects a MODEL-RECONSTRUCTED `irlSource`; both partner-paste forms pass             |

**The four array fields are required but may be empty.** `gatesPassed`, `gatesElided`, `conditionalTriggersFired` and `forceToolsApplied` all have to be present; omitting one is a validation error, passing `[]` is not. This is the most common first-call mistake.

**`gaps` categories**: `defaulted-dimension` · `extraction-only` · `gate-elided` · `conditional-trigger` · `currency-assumption` · `map-absent` · `provenance-gap` · `tier-mismatch` · `tier-fabrication`. Do **not** pre-populate the last three — the tool appends them itself from the internal verification pass.

**`irlSource`**: `partner-paste-verbatim` · `partner-paste-verbatim-prepop` · `model-reconstruction-from-xlsx` · `model-reconstruction-trimmed` · `placeholder`. The two reconstruction modes auto-append a `provenance-gap:` entry, because in those modes the model controls both the body and its hash — the hash-bind guarantees nothing about fidelity to a partner source.

**`irlSource` is CAPPED by the server, not taken at face value (BL-123).** The value you pass is an assertion; the tool checks it against a server-held provenance record for the body hash and applies a **monotone downgrade** before anything reads it:

- An asserted `partner-paste-verbatim-prepop` is capped to `partner-paste-verbatim` when the record shows the body was written by `prepare_irl_body` rather than by the prompt render. A `provenance-gap:` entry discloses the cap.
- If no record is readable (absent, expired, or the store is unavailable), a `-prepop` assertion stands but is disclosed as unverified. Other assertions get no marker.
- **Nothing is ever promoted**, and reconstruction / `placeholder` assertions pass through untouched — the server can disprove the strongest claim but cannot substantiate the weaker ones, since it never sees where the model obtained bytes it merely relayed.

Both internal consumers — the `requireVerbatimBody` gate and the reconstruction disclosure — read the **capped** value, so `Bl070VerbatimBodyRequiredError` quotes the capped value in its message rather than what you asserted. Because a cap only weakens and the gate accepts both partner-paste forms, capping never changes a gate outcome. See [ADR-0018](../../../../../src/docs/adr/0018-body-integrity-and-capped-provenance.md).

**The gate sorts on AUTHORSHIP, not on delivery route.** It accepts both `partner-paste-verbatim` and `partner-paste-verbatim-prepop` and refuses only the two `model-reconstruction-*` values, because what it buys is "operator-supplied, not model-reconstructed". Since prompt 0.30.0 a partner `.md` ATTACHED to the invoking message grades `partner-paste-verbatim` exactly as a chat paste does — the server cannot distinguish them (both mint via `prepare-tool`) and no honest grade separates them — so an attachment run passes this gate. It does not thereby become client-ready: `hashBindResult: pass-bound` is a separate axis that only the `filledIrl` prompt argument can produce. See [OPERATOR_RUNBOOK.md](../../../../../src/docs/development/OPERATOR_RUNBOOK.md) — passing one gate does not satisfy the other.

**A body whose line breaks the client destroyed is processed normally (BL-124).** BL-123 briefly refused these; the refusal was withdrawn a day later because citation verification normalises whitespace away before matching, so flattening cannot affect the only check that runs, and the refusal blocked every realistic IRL size with no working alternative. What remains is the measurement: `serverCachedBodyNewlines` below. See [ADR-0018](../../../../../src/docs/adr/0018-body-integrity-and-capped-provenance.md) § Re-validation.

**`defaultFiredFrameworks` must not overlap `conditionalTriggersFired`.** The partition is by **how the framework was reached**, not by whether Section 09 happens to name it: `conditionalTriggersFired` holds what a named trigger predicate fired, `defaultFiredFrameworks` holds what came in through the Section-09 evidence path and nothing else.

**A framework that fires AND is enumerated in Section 09 goes in `conditionalTriggersFired` only** — the conditional-trigger path wins, and the framework must be removed from `defaultFiredFrameworks`. This is the common case rather than an edge one (a production run hit it with the EU AI Act, which is both an `EU_AI_ACT` trigger and a Section 09 entry on any EU-exposed target). Corrected in BL-125: this line previously described the second list as "fired despite not being enumerated", which read as excluding exactly that case and contradicted `Bl063PartitionViolationError`'s own remediation text.

### Output shape

```typescript
{
  // BL-122 — the two optional blocks are OMITTED (key absent, never `undefined`)
  // at levels that must not render them. `emitInstructions` names exactly the
  // blocks the response carried; a block that is absent was withheld
  // deliberately and must not be reconstructed.
  metaFenceMarkdown?: string,        // auditLevel 'debug' only — dossier's first content
  gapListMarkdown: string,           // every level — paste verbatim as section (J)
  provenanceFooterMarkdown?: string, // 'enhanced' and above — paste verbatim as section (K)
  provenanceVerification: { total, verified, verifiedFuzzy, partnerSupplied,
                            unverified, autoAppendedGaps, tierMismatches, tierFabrications },
  serverCachedBodyBytes: number,    // echoes prepare_irl_body's byteLength — cache round-trip proof
  serverCachedBodyNewlines: number, // BL-124 — newline count of the same body. `0` on a multi-KB
                                    // body means the client collapsed a multi-line paste, so it
                                    // will not hash-match the operator's source file. Diagnostic
                                    // only; nothing refuses on it and it is not an error.
  emitInstructions: string,
  serverToolCallCounts: Record<string, { attempted, succeeded, rejected, errored }>,
  countersScope?: 'session' | 'run' | 'request',  // BL-121 — how far back the counts reach
}
```

**`percent` and `status` are server-derived (BL-130).** The tool recomputes them from `substantiveCells` / `totalCells`, rounded to the nearest integer, and the DERIVED value is what reaches the meta fence as a 0–1 fraction (`24` → `"fixtureFillRatio": 0.24`). The caller's values are the assertion compared against: a disagreement beyond 1 percentage point, or on `status`, appends a `provenance-gap:` entry naming both figures and directing a section (A) restatement — a disclosure, never a rejection. Rounding happens before the threshold comparison, matching the pre-flight directive, so a run at 39.6% correctly resolves to `ok`. Where `substantiveCells > totalCells` no percentage can be derived: the caller's range-checked values are kept, the inconsistency is disclosed, and no restatement is directed.

**`serverToolCallCounts` reports this tool as `attempted: 1, succeeded: 0`, and that is correct.** `attempted` is recorded at wrapper entry and `succeeded` at wrapper exit ([`metrics/with-metrics.ts`](../../../metrics/with-metrics.ts)), and this tool reads the snapshot from **inside its own handler** — so it has not returned yet at the moment it reports. The semantic is deliberate: "I am reporting on the call I am currently inside." The alternative (snapshotting before recording the attempt) would show `attempted: 0` for the tool doing the reporting, which is worse. Every other tool in the snapshot reports normally, and the `precheck.iterations === validate_irl_provenance.succeeded` identity the prompt relies on is unaffected because that is a different tool's row. Consumers must not "correct" this value; BL-119 testers filed it as a defect in three consecutive cycles before it was written down here.

**`countersScope` states how far back `serverToolCallCounts` reaches, and it is not cosmetic (BL-121).** `createServer` runs **per HTTP request** on the Worker, so a fresh `InMemoryToolCallCounters` is built for every call — the in-process map alone can never contain an earlier request's `validate_irl_provenance` calls, and the BL-071 identity was structurally unsatisfiable there until this field existed. The three IRL-pipeline tools now also accumulate durably in Upstash under `mcp:irl-run-counts:<irlBodyHash>` (TTL 4h, matched to the body cache):

| value     | condition                                          | the precheck identities |
| --------- | -------------------------------------------------- | ----------------------- |
| `session` | stdio — one process, one map, whole session        | hold                    |
| `run`     | Worker, Upstash bound, **snapshot read succeeded** | hold                    |
| `request` | Worker unbound, **or the read failed**             | do not hold             |

The read-failure downgrade is load-bearing: reporting `run` over request-scoped numbers would claim the identity holds while every earlier row is missing. Consumers must branch on this value rather than assuming session scope, and must **not** reconcile a `request`-scoped snapshot against their own record of the run — the visible gap is the information.

**Merge semantics under `run`**: outcomes (`succeeded`/`rejected`/`errored`) come from the durable row; `attempted` is the durable `attempted` plus the in-flight delta from the per-request map (1 for the call inside the wrapper, 0 for completed ones). So a first envelope call in a fresh run reads `{attempted: 1, succeeded: 0}` as documented above, and a **re-call** reads `{attempted: 2, succeeded: 1}` — the first call having completed and landed `{1,1}` durably. Both shapes are executed in `tests/integration/bl-071-precheck-derivation.test.ts`, not merely asserted here.

**Two scope caveats consumers must not read past.** The row is keyed by the IRL body and lives 4h, so (a) a validate call carrying an inline `filledIrl` is counted against **those** bytes, not the bound hash — disagreement means it verified something other than what compose submits, and the count correctly comes up short; and (b) a **repeat ingestion of identical bytes inside the window accumulates onto the same row**, so the count reads long of any single invocation. `precheck.iterations` is per-invocation; durable `succeeded` is per-bytes-per-window. Under `run`, the identity holds for the first ingestion of a given body in the window.

The counters fail **quiet** by design (a counter fault must not fail a tool call), which is the opposite posture from the body cache — a missing body corrupts the dossier, a missing counter only weakens a report. See [ADR-0016](../../../../../src/docs/adr/0016-run-scoped-durable-tool-call-counters.md).

---

## Hidden semantics

- **`compose_dossier_envelope` hard-fails without the cache write.** A hash that is well-formed but not in the cache returns `Bl076BodyCacheMissError` naming the missing key and directing the caller to `prepare_irl_body`. The cache is an LRU on stdio and TTL-bounded on the Worker, so a long-running session can lose an entry it seeded earlier; the fix is always to re-seed, never to retry the same call.
- **`validate_irl_provenance` and `compose_dossier_envelope` both need Upstash on the Worker.** They resolve their bindings lazily, so an unbound deployment still lists and serves every other tool — the failure is scoped to these two rather than to `tools/list`.
- **Provenance verification is not advisory.** `compose_dossier_envelope` runs the same engine `validate_irl_provenance` exposes, over every entry in `claims`, and appends what it finds to the gap list. Calling `validate_irl_provenance` first is a way to see the verdicts before they are written into the deliverable, not a way to avoid the check.

---

## Related

- Tool wrappers: [`generate-information-request-list-xlsx.ts`](../../../tools/generate-information-request-list-xlsx.ts) · [`list-irl-requests.ts`](../../../tools/list-irl-requests.ts) · [`prepare-irl-body.ts`](../../../tools/prepare-irl-body.ts) · [`validate-irl-provenance.ts`](../../../tools/validate-irl-provenance.ts) · [`compose-dossier-envelope.ts`](../../../tools/compose-dossier-envelope.ts)
- Prompt reference: [`prompts/irl-ingestion.md`](../../prompts/irl-ingestion.md)
- Acceptance walkthrough: [`testing/uat/UAT-07-irl-pipeline.md`](../../testing/uat/UAT-07-irl-pipeline.md)
- Operator runbooks: [`OPERATOR_RUNBOOK.md`](../../../../../src/docs/development/OPERATOR_RUNBOOK.md) · [`IRL_PARTNER_PASTE_RUNBOOK.md`](../../../../../src/docs/development/IRL_PARTNER_PASTE_RUNBOOK.md)
- Live generator: <https://globalstrategic.tech/hub/tools/information-request-list-generator/>

> **`USAGE.md` is not yet authored for this family** — the acceptance walkthrough above carries the worked examples in the meantime. Every other tool family ships both files; this one is the exception, recorded in the [registry Status column](../README.md#the-contracts-registry) and tracked under BL-119.
