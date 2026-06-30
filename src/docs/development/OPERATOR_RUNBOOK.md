# `gst_irl_ingestion` Operator Runbook

> **Audience**: GST operators (consultants) running the `gst_irl_ingestion` dossier sweep in Claude Desktop against the `gst-mcp` server.
>
> **What this covers**: how to run a dossier, how to read the closing `BL-045-VERIFY` block, the gating criteria that separate an _internal draft_ from a _client-ready_ deliverable, when to re-run vs. override, the failure-recovery playbook, and the human signoff step before a dossier leaves GST's possession.
>
> **What this does NOT cover**: the mechanics of converting a partner's filled `.xlsx` into the markdown you paste — that has its own dedicated doc, [IRL_PARTNER_PASTE_RUNBOOK.md](./IRL_PARTNER_PASTE_RUNBOOK.md) (the `npm run irl:extract` workflow). This runbook tells you _when_ to use partner-paste; that one tells you _how_.
>
> **Lineage**: BL-074 (production-readiness gates). The two server-side gates that back this runbook already shipped — `requireVerbatimBody` (BL-070) and server-authoritative tool-call counts (BL-071). This doc is the operator-facing layer on top of them.

---

## TL;DR

1. **Decide the tier** — internal draft or client-ready (table below). The tier sets whether you must use partner-paste.
2. **Prepare the input** — for client-ready runs, convert the partner's `.xlsx` to markdown via [IRL_PARTNER_PASTE_RUNBOOK.md](./IRL_PARTNER_PASTE_RUNBOOK.md) and paste it into `filledIrl`; set `requireVerbatimBody: true`.
3. **Run** `/gst_irl_ingestion` in Claude Desktop.
4. **Read the `BL-045-VERIFY` block** at the end of the dossier — trust the **server-authoritative** fields over the model's prose.
5. **Apply the client-ready gate** (checklist below). If any gate fails → re-run or remediate.
6. **Sign off** — a named human records approval before the dossier leaves GST.

---

## Run tiers

| Tier               | Input path                                                                                      | `requireVerbatimBody` | Who sees the output                           |
| ------------------ | ----------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------- |
| **Internal draft** | xlsx attachment → model reconstructs, OR small paste                                            | omit (`false`)        | GST partner team only                         |
| **Client-ready**   | **partner-paste-verbatim** (see [IRL_PARTNER_PASTE_RUNBOOK.md](./IRL_PARTNER_PASTE_RUNBOOK.md)) | **`true`**            | M&A target, PE client, regulator — unmediated |

The dividing line is **does the dossier leave the partner's hands unmediated?** If yes, it's client-ready and the gates below are mandatory. If a human partner is going to rewrite/curate it first, internal-draft is fine.

---

## Preparing a client-ready run

1. Get the partner's filled canonical `.xlsx`.
2. Convert it to markdown:
   ```powershell
   cd c:\Code\gst-website\mcp-server
   npm run irl:extract -- C:\path\to\PARTNER-IRL_filled.xlsx --out C:\tmp\target-irl.md
   ```
   Full workflow, output shape, sanity checks, and edge cases: **[IRL_PARTNER_PASTE_RUNBOOK.md](./IRL_PARTNER_PASTE_RUNBOOK.md)**.
3. In Claude Desktop, invoke `/gst_irl_ingestion`. Paste the contents of `target-irl.md` into `filledIrl`, set `requireVerbatimBody: true`, and fill `targetName` / `transactionContext` / `partnerLead`. **Do not also attach the `.xlsx`** — that invites the model back into reconstruction mode for some tools.

> Why partner-paste for client-ready: only the pasted-verbatim path produces `pass-bound` hash-bind authority (the dossier's claims anchor to the partner's exact bytes). The xlsx-reconstruction path is `pass-internal` — the model controls both the body and the hash — and auto-appends a `provenance-gap:` disclosure (BL-072). Fine for drafts, not defensible for a client/regulator.

---

## Reading the `BL-045-VERIFY` block

The block is emitted at the end of every run. Some fields are **server-authoritative** (computed by the tools, cannot be faked by the model); others are model-narrated. **When the two disagree, trust the server fields** — the model's self-report has been observed to drift (BL-074 gap 2; this is exactly why BL-071 made the counts server-sourced).

| Field                                      | Source              | What it tells you                                                                                             |
| ------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `filledIrl.source`                         | server              | `partner-paste-verbatim` / `partner-paste-verbatim-prepop` = strong; `model-reconstruction-*` = draft-grade   |
| `filledIrl.bytes`                          | server              | Full body size. A value far below your pasted file size means truncation — investigate                        |
| `firstEnvelopeCall.hashBindResult`         | server              | `pass-bound` = anchored to partner bytes; `pass-internal` = model-controlled                                  |
| `firstEnvelopeCall.provenanceVerification` | server              | `{ total, verified, verifiedFuzzy, unverified, tierMismatches, tierFabrications }` — the claim-by-claim audit |
| `precheck.outcome`                         | server-derived      | `converged` = citations cleaned before compose                                                                |
| `toolCallCounts`                           | **server** (BL-071) | Per-tool `attempted/succeeded/rejected/errored`. Authoritative retry ledger                                   |
| `toolErrors`                               | server              | Each arg-shape rejection + the recovery action taken                                                          |
| `selfCorrectionCalls`                      | server              | Count of model self-corrections                                                                               |
| `conditionalTriggers`                      | model + server      | Which regulatory triggers fired/suppressed and why                                                            |

> **Known-good telemetry quirk**: `compose_dossier_envelope` self-reports `{ attempted: 1, succeeded: 0 }` in its own block. That is **intended** — the counter snapshots while the envelope call is still in-flight (BL-071 "I'm reporting on the call I'm inside"). It is not a failure; it's pinned by `tests/integration/bl-071-precheck-derivation.test.ts`.

### Worked example (clean client-ready run — StoreForce, 2026-06-30)

```
filledIrl: { bytes: 51383, source: partner-paste-verbatim-prepop }
firstEnvelopeCall: { hashBindResult: pass-bound,
  provenanceVerification: { total: 29, verified: 24, verifiedFuzzy: 5, unverified: 0, tierMismatches: 0, tierFabrications: 0 } }
precheck: { outcome: converged }
toolErrors: [{ tool: generate_diligence_agenda, errorClass: arg-shape-rejection, recoveryAction: set-revenueRange-unknown... }]
selfCorrectionCalls: 0
```

This passes every client-ready gate: verbatim source, `pass-bound`, zero unverified/fabrications, converged, 1 retry (within budget). The single `generate_diligence_agenda` retry is normal and expected (the tool's structured error coached the fix).

---

## Client-ready gating criteria

A dossier is **client-ready only if ALL of the following hold** in the `BL-045-VERIFY` block. Any failure → see "Re-run vs. override" below.

- [ ] `filledIrl.source` is `partner-paste-verbatim` or `partner-paste-verbatim-prepop` (NOT `model-reconstruction-*`)
- [ ] `firstEnvelopeCall.hashBindResult` is `pass-bound` (NOT `pass-internal`)
- [ ] `provenanceVerification.unverified` is `0` (every load-bearing claim's excerpt was found in the body)
- [ ] `provenanceVerification.tierFabrications` is `0` (no unresolved auto-appended `tier-fabrication:` entries)
- [ ] `precheck.outcome` is `converged`
- [ ] Retry budgets at/near design floor — `generate_diligence_agenda` and `compose_dossier_envelope` `rejected` counts ≤ ~2 each; no runaway self-correction loop
- [ ] **Operator signoff** recorded (see below)

`verifiedFuzzy > 0` is acceptable — fuzzy matches are real matches within the citation window, not failures. `defaultFiredFrameworks` and a populated `(J) Gap list` are expected, not defects.

---

## Re-run vs. override

**Re-run** (the run is not acceptable as-is) when:

- `hashBindResult: pass-internal` on a run you intended as client-ready → the model didn't take the verbatim path. Re-invoke with `filledIrl` pasted and no `.xlsx` attached.
- `Bl070VerbatimBodyRequiredError` was thrown → the gate is working; you set `requireVerbatimBody: true` and the model self-degraded. Re-run, don't fight it.
- `unverified > 0` on load-bearing claims, or `tierFabrications > 0` → provenance is not clean. Re-run; if it persists, the citation needs operator correction (see failure table).
- Retry budget blown (a tool's `rejected` count keeps climbing without converging) → stop, read the tool's error, and fix the input.

**Override** (accept despite a flagged item) is legitimate only for documented-benign cases, and the rationale must be recorded in signoff:

- A framework in the `(J)` gap list flagged **map-absent** that genuinely isn't in the curated Regulatory Map → it's an honest gap, not a fabrication. File a [BL-073-style alias request](./BACKLOG.md) if it's a naming mismatch; otherwise leave it as a documented follow-up.
- `verifiedFuzzy` citations → acceptable by design.

**Never override** `pass-internal`, `unverified > 0`, or `tierFabrications > 0` on a client-ready deliverable. Those are the failure modes BL-074 exists to prevent.

---

## Failure-recovery playbook

| Symptom / error class                                                                                | Cause                                                                                                                                      | Fix                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IrlBodyHashMismatchError`                                                                           | The pasted `filledIrl` doesn't match the body-binding hash (truncated clipboard, or you edited the body after the hash directive rendered) | Re-copy from the file directly (`Get-Content -Raw` / open in editor, Ctrl+A) and re-paste; don't edit between paste and compose                              |
| `Bl076BodyCacheMissError`                                                                            | `compose_dossier_envelope` was called before the body was cached                                                                           | Ensure `prepare_irl_body` ran first; in prepop mode the server pre-populates — if it's missing, re-invoke the prompt fresh                                   |
| `Bl070VerbatimBodyRequiredError`                                                                     | `requireVerbatimBody: true` but `irlSource` isn't partner-paste — the model tried to self-degrade to reconstruction                        | Re-run partner-paste; paste `filledIrl`, do not attach the `.xlsx`                                                                                           |
| `Bl063PartitionViolationError`                                                                       | A `defaultFiredFrameworks` partition/scope rule was violated                                                                               | Confirm conditional-trigger semantics; a default-fired framework must be partitioned + Hub-backed per BL-063                                                 |
| `Bl063CertificationNotRegulationError`                                                               | A certification (e.g. SOC 2) was passed where a regulation is required                                                                     | Certifications are not regulations — remove it from the regulatory framework set                                                                             |
| `Bl068MapAbsentFalsePositiveError`                                                                   | A framework that IS in the curated map was flagged map-absent (alias gap)                                                                  | File a BL-073-style alias request for the framework's name variant                                                                                           |
| `arg-shape-rejection` on `generate_diligence_agenda` / `compute_techpar` / `estimate_tech_debt_cost` | Tier/value coupling, currency basis, or MTTR/incidents null-discipline violated                                                            | **Expected, self-healing** — the tool returns a structured `Fix:` message; the model reads it and retries. ≤~2/session is normal. Only intervene if it loops |
| Citation rejected — em-dash / length                                                                 | Citation uses the wrong dash or is < 20 chars (BL-067)                                                                                     | Use a substantial verbatim excerpt in the form `Section NN — <excerpt>`                                                                                      |
| VERIFY prose disagrees with `toolCallCounts`                                                         | Model self-narration drift (BL-074 gap 2)                                                                                                  | Trust the server-sourced `toolCallCounts` / `provenanceVerification`; ignore the prose                                                                       |

---

## Signoff

A client-ready dossier **must not leave GST's possession without a named human reviewer's signoff.** Record, alongside the deliverable (or in the engagement file):

- **Reviewer name** and date.
- **`promptVersion` + `mcp-server` version** from the meta fence (so the exact prompt build is traceable).
- **Gating checklist** — all client-ready criteria confirmed pass (or each override with its rationale).

The reviewer is certifying the firm's analysis, not forwarding model output. That accountability — a person, by name — is the final gate; the server-side machinery makes it _possible_ to certify honestly, but it does not replace the human.

---

## Related docs

- [IRL_PARTNER_PASTE_RUNBOOK.md](./IRL_PARTNER_PASTE_RUNBOOK.md) — the `npm run irl:extract` xlsx→markdown workflow (how to prepare the paste).
- [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](./MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) — `gst_irl_ingestion` design context.
- [MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086.md](./MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086.md) — prompt-body simplification (L0–L2 shipped).
- [BACKLOG.md](./BACKLOG.md) — BL-074 (this runbook's parent), BL-070/071 (the server gates), BL-087 (deferred L3–L5).

---

<- Back to [Development Documentation](./README.md)
