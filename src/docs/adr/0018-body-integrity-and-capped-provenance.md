# ADR-0018: Cap the provenance grade rather than derive it (the flattened-body refusal was withdrawn)

- **Status**: **Partially accepted** — Decision 2 (cap, not derive) Accepted 2026-08-13 and production-verified, **scope clarified 2026-08-15** (BL-130 — see the amendment at the foot: cap what you can only bound, derive what you can compute). **Decision 1 (refuse a flattened body) REVERTED 2026-08-14** (BL-124, prompt `0.25.0` / server `0.52.0`) — see the re-validation at the foot.
- **Source initiative**: BL-123 — opened by a production run of `gst_irl_ingestion` (Kestrel IRL, 2026-08-13)

## Context

A production run through Claude Desktop produced a dossier whose body-binding hash did not match the source file the operator had pasted. Investigating that mismatch surfaced two independent defects with a shared shape — **the prompt took claims about its own inputs on trust**, once from the client and once from the model.

### The client silently destroys the body

Claude Desktop renders every prompt argument as a single-line `<input>`. Pasting a multi-line markdown IRL collapses every newline to a space before the argument reaches the server. Reproduced exactly against the artifact:

```
kestrel-fresh.md as-is (LF)            79c7e6a31fcdd65a   79,079 B   141 newlines
kestrel-fresh.md, \n → " ", trimmed    42c7530fd8bb7f26   79,078 B     0 newlines
                                       ^ the hash the production run reported
```

The byte-length delta is **−1** while the content differs at **140 positions**: 140 newlines became spaces (no length change each) and the trailing one was trimmed. That coincidence made the failure read like an off-by-one and misdirected the first diagnosis — it is total loss of document structure.

Nothing detected it. The server hashed what it received, cached it, and reported the hash honestly, so the run completed looking clean while the section headers, blockquotes and per-item boundaries the dossier cites were gone. This is the reader-collapse defect class [ADR-0017](0017-audit-levels-enforced-in-the-tool-response.md) closed six instances of on the status page: a degraded input converted into a plausible success before anything downstream can see it.

### The provenance grade was self-reported

`irlSource: partner-paste-verbatim-prepop` is the strongest provenance form the pipeline recognises — "the body never round-tripped through model emission". Its entire evidence was that a `**Body-binding hash:**` directive appeared in the prompt body. The presence of a string survives serialization, so an exported-and-replayed payload carries the same evidence a fresh invocation does.

The severity is narrower than it first appears, and the narrowing matters: outside the 4-hour cache TTL a replay fails loudly with `Bl076BodyCacheMissError`, and inside it the bytes genuinely _are_ operator-supplied. What is forgeable is the narrower claim that **this run** was freshly invoked — plus the fact that the grade was model-asserted at all.

The prompt did carry an escape hatch, a `validate_irl_provenance` probe, but framed it as optional (_"If you want to confirm the cache is live…"_) immediately after a much louder _"proceed anyway — do NOT reconstruct."_

## Decision

### 1. Detect total collapse and refuse; never attempt repair

> **REVERTED 2026-08-14 (BL-124) — see [§ Re-validation](#re-validation--2026-08-14-bl-124-decision-1-is-withdrawn) at the foot.** The refusal below was withdrawn one day after it shipped: the harm was asserted rather than demonstrated, and the halt blocked every working path. The detection survives as a diagnostic; nothing refuses. The text is kept unedited because a decision record that quietly rewrites itself is worth less than one that shows the correction.

`assessIrlBodyStructure` ([`mcp-server/src/lib/irl-body-structure.ts`](../../../mcp-server/src/lib/irl-body-structure.ts)) flags a body with **zero newline characters and more than 2,000 bytes**. Enforced at all four surfaces a body can arrive through: the prompt render (a full-body halt, one message, no resource embeds), `prepare_irl_body`, `validate_irl_provenance`, and the registry prepop.

**Repair was rejected outright.** `\n → " "` is lossy — in a 79KB body there is no way to tell which of ~13,000 spaces used to be line breaks. A plausible reconstruction would be indistinguishable from real structure to every downstream check, converting a detected failure into an undetectable one.

**A bytes-per-line ratio heuristic was rejected.** A real filled IRL already runs ~560 bytes/line because individual answers are long prose paragraphs, so a threshold tight enough to catch partial mangling would false-positive on legitimate bodies and block an operator mid-engagement with no override. The check tests for _total_ collapse, which is unambiguous: a multi-kilobyte body claiming to be a ten-section markdown document cannot have zero line breaks. Certainty over cleverness.

**The refusal cannot live only in the tool handler.** The prepop call site catches every handler failure into a non-fatal `safeLog` by design, so that a cache problem never breaks a render — meaning a throw there would be swallowed and the render would continue. The prompt-render halt is what the operator actually sees; the registry skip is defence-in-depth plus a `wrangler tail` signal.

### 2. Cap `irlSource` against server-held provenance — do **not** derive it

A companion store ([`mcp-server/src/cache/irl-body-provenance.ts`](../../../mcp-server/src/cache/irl-body-provenance.ts)) records `{ mintedBy, mintedAt, byteLength, newlineCount }` per body hash. `compose_dossier_envelope` then applies a **monotone downgrade**:

- derived = asserted, **capped** to `partner-paste-verbatim` when the metadata says `prepare-tool`
- **never upgraded** — metadata alone cannot promote a claim
- reconstruction and `placeholder` assertions **pass through untouched**
- the gap list discloses a cap, and separately discloses an unverifiable `-prepop`

**Full derivation was designed, reviewed, and rejected — it would have inverted a working safety gate.** `mintedBy: 'prepare-tool'` is produced identically by an interactive partner paste relayed through `prepare_irl_body` and by a model reconstruction from xlsx; the server never sees where the model got the bytes. A derived value could therefore never be `model-reconstruction-from-xlsx`, so **every reconstruction run would have derived to a partner-paste form and passed the `requireVerbatimBody` gate that exists to catch reconstructions** — the outcome UAT-07.6 classifies as _"the gate is not enforcing → Fail — escalate"_. The server can disprove the strongest claim; it cannot substantiate the weaker ones.

**Making the probe mandatory in prompt prose was rejected.** This codebase established empirically that body directives read as descriptive context while tool output reads as procedure — the reason `compose_dossier_envelope` exists at all. A louder directive stakes the fix on the signal already proven to lose. The precedent taken instead is [ADR-0016](0016-run-scoped-durable-tool-call-counters.md), which moved `toolCallCounts` from model narration to server authority for the same stated reason: self-narration drifts.

### 3. Store shape from the body cache, failure semantics from the counters

Two implementations selected by transport, like `IrlBodyCache` — on stdio the render and the compose share one process, so an in-memory map makes the cap fully work locally and testable without Upstash. But the body cache's **fail-fast posture is deliberately not inherited**: it throws when Upstash is unbound because a missing body corrupts the dossier, whereas a missing provenance record only weakens an audit claim. An unbound or unreadable provenance store degrades quietly to the metadata-absent path. **Never in-memory on the Worker** — isolates rotate, so the render's write would be invisible to the compose and every honest prepop run would silently downgrade.

**First-write-wins lives in the store, not the callers.** A render prepop followed by the model calling `prepare_irl_body` is documented benign behaviour (BL-119 cycle 5), so last-write-wins would downgrade an honest run for a recovery the prompt itself anticipates. The Upstash implementation's read-then-write is not atomic; the race requires two writers for the same body hash in one round trip, both writing the same bytes, so a lost race degrades a grade and cannot corrupt a body.

### 4. Inline the VDR taxonomy; keep the other three payload cuts out

The prompt embedded the whole 16.3KB `gst://library/vdr-structure` article as a third message on every render to supply a nine-row folder-label table. The table is now inlined and the embed dropped: **153.8 KB → 139.5 KB** measured on the production artifact.

Dropping to a bare URI reference was rejected — [`embed.ts`](../../../mcp-server/src/prompts/embed.ts) records the measured defect that produced the embed: given only a URI the model usually cannot read it and falls back to training, substituting a generic PE-diligence taxonomy for the canonical GST one. The labels must be _in_ the body; only the surrounding article need not be. The URI stays as a provenance caption, which also satisfies the orchestrates→body invariant.

**Three further cuts were investigated and rejected on evidence** — recorded so they are not re-proposed:

| Candidate                | Size    | Why it stays                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workbook column contract | 4.0 KB  | [ADR-0015](0015-irl-canonical-body-reads-full-workbook.md) Decision 4 mandates it in every served body; the wrong-IRL pre-flight depends on its vocabulary to define the cells it counts; nine test blocks pin it across all modes. Its opening "skip this section" line is an instruction to the model, not evidence it is unused. |
| Steps 1b / 4a / 6a       | ~7.5 KB | Deliberately retained by BL-086 with a pinning test. They are fabrication guards, not shape descriptions — a fabricated MTTR "passes through the engine's linear multiplier and produces an unrecoverable false carrying-cost number."                                                                                              |

An early measurement put these three at 20.2 KB by splitting the _rendered_ body on `**Step ` boundaries, which absorbed trailing content into each section. Source-region measurement is authoritative.

## Consequences

- ~~**Operator-facing**: pasting a multi-line IRL into a single-line client field now halts the run~~ — **reverted 2026-08-14.** The paste completes normally; the runbooks now say so.
- ~~**The halt is cheap**: 1.8 KB in one message~~ — **reverted 2026-08-14.** Cheap to render, but it cost the operator every working path, which is the cost that mattered.
- **`irlSource` on the envelope input remains model-asserted**; both internal consumers read the capped value, and the (J) gap-list text is what reports it. The result object carries no `irlSource` field of its own — the disclosure entry is the output surface. `Bl070VerbatimBodyRequiredError` therefore quotes the capped value in its operator-facing message.
- **The cap is behaviour-neutral for existing callers.** The `requireVerbatimBody` gate accepts both partner-paste forms, so capping between them never changes a gate outcome — it is visible only as a gap-list entry.
- **The absent-metadata marker is scoped to `-prepop` assertions only.** Marking every metadata-absent run would append a line to every rendered gap list in the suite, including engine-level fixtures that have no store — a suite-wide rebaseline in place of an additive change. An additivity guard pins this.
- **`hashBindResult` is not capped.** It exists only as a model-authored RUN-AUDIT line, so there is no asserted value at the tool boundary to compare against; its RUN-AUDIT prose was aligned instead: the `irlSource` input bullet now states that the server may cap the claim and that a capped run must report the capped value in `filledIrl.source`, and a new bullet separates the two questions (`hashBindResult` is about which hash you supplied; `filledIrl.source` is about where the bytes came from, and only the second is server-checked). Without that, a capped run at `auditLevel: debug` would render a RUN-AUDIT block asserting `-prepop` while (J) said the server had downgraded it.
- **A second copy of canonical Library content now exists.** [`vdr-taxonomy-drift-guard.test.ts`](../../../mcp-server/tests/integration/vdr-taxonomy-drift-guard.test.ts) pins the inlined table against the article, with the same deliberate-retirement discipline as the SOP guard.
- **Stdio is not a degrade path** for the cap, unlike the durable run counters. The pre-deploy gap on Upstash is self-closing: four hours after deploy every live entry carries metadata.
- ~~**Revisit trigger**: … the byte floor is the knob~~ — **reverted 2026-08-14.** There is no byte floor any more; it was deleted with the refusal, because a threshold nobody consults is an invitation to reinstate the gate.

---

## Re-validation — 2026-08-14 (BL-124): Decision 1 is withdrawn

**Decision 1 above — refuse a body whose line breaks the client destroyed — was wrong and is reverted.** Decision 2 (cap `irlSource`, never derive it) stands and is unaffected; production confirmed its pass-through arm on 2026-08-14.

### What the original decision got wrong

It asserted that a dossier built on a flattened body "cites a structure that no longer exists". That was reasoned from first principles and never tested. Checked afterwards:

- **Citation verification cannot tell the difference.** [`normalizeForMatching`](../../../mcp-server/src/schemas/validate-irl-provenance.ts) applies `.replace(/\s+/g, ' ')` before both the substring check and the word-run tokenizer — the exact transformation the client performs. Flattening is a provable no-op for the only check the provenance chain runs.
- **No consumer of line structure exists.** The only `split(/\r?\n/)` sites in the workspace parse the IRL _generator source_ and a different prompt's `customRequests` arg. The extractor produces bodies and never consumes one; the fill-ratio pre-flight keys on `N-NN` reference ids.
- **Byte-identity was the wrong proxy.** The hash-bind exists to catch the model substituting a condensed **paraphrase**. Flattening is not paraphrase — every word survives, in order.
- **A real production run on a flattened body produced a sound dossier**, with a correct 121/122 fill ratio and no reported content defect.

### What it cost

The refusal fired at **every realistic IRL size** — the smallest fixture in the repo is 4,256 B against a 2,000 B floor — and its own remediation was unreachable: interactive mode requires the model to emit the whole body as a tool argument (~21k output tokens for an 80KB IRL), and a production run correctly declined rather than crowd out the dossier. Operators were left with **no completing path at all**, in exchange for protecting a property nothing consumed.

### What replaced it

The measurement, as a diagnostic. `serverCachedBodyNewlines` on the envelope response and `filledIrl.newlines` in the RUN-AUDIT block. `newlines: 0` on a multi-kilobyte body says the client collapsed the paste and the body will not hash-match the file on the operator's disk — which is the one genuinely useful fact, and the thing that cost a full session of forensics to establish the first time. Nothing refuses on it.

**Not gated on `requireVerbatimBody` either.** That flag guarantees "partner-supplied rather than a model reconstruction", and a flattened body satisfies it: the bytes are the operator's, and no model reconstructed them.

### The transferable lesson

The harm was asserted, not demonstrated, and a gate was built around the assertion. Before refusing a run, demonstrate the harm against an artifact.

---

## Scope amendment — 2026-08-15 (BL-130): why `fillRatio` is derived, not capped

Decision 2 is titled "cap, not derive" and governs `compose_dossier_envelope`. BL-130 gives the **same tool** a field the server now **derives** and overrides. That looks like a reversal and is not, so the distinction is recorded here rather than left for a future reader to infer.

**The two decisions turn on whether the server can compute the answer.**

- **`irlSource` is a grade the server can only _bound_.** It asserts how the bytes were assembled — whether an operator pasted them into a prompt argument, or a model reconstructed them from an xlsx. The server holds the bytes and a provenance record, but the assembly history is not recoverable from either; it can prove an assertion is _too strong_ and cap it, and cannot compute what the honest value would have been. Deriving there would mean inventing.
- **`fillRatio.percent` and `.status` are arithmetic.** They are pure functions of `substantiveCells` and `totalCells` — two integers the model supplies in the same payload. The server is not estimating; it is doing the division the model was asked to do, and the result is checkable.

**So the rule Decision 2 actually stands for is: cap what you can only bound, derive what you can compute, and disclose either way.** Both halves of BL-130 obey it — including the one that declines to derive. Where `substantiveCells > totalCells` there is no percentage to compute (the schema permits the shape; no cross-field refinement is possible without publishing an empty input schema to clients), so the tool keeps the caller's range-checked values and discloses the inconsistency, rather than emitting a figure above the `.max(100)` the same field enforces.

**Decision 2's second rationale does not transfer, and that is what makes this safe.** It also rejected full derivation because a derived value would have inverted the `requireVerbatimBody` gate. Nothing equivalent applies here: **no gate reads `fillRatio` at all.** The run takes its halt / partial-IRL branch from the pre-flight, before this tool is called, so deriving the figure changes the artifact and never the control flow. That is also the honest limit of BL-130 — it makes the record correct, not the decision.

**What carries across unchanged** is the disclosure discipline, which is the part of ADR-0018 that generalises: a server correction the partner never sees is worth little. Every `fillRatio` disagreement appends a `provenance-gap:` entry naming both figures, and — because the envelope is called before the dossier prose — directs restating section (A) so the document does not carry two different completeness numbers.

**And the reason it is a disclosure rather than a rejection** is Decision 1's lesson applied in advance. The pre-flight directive has the model round before applying the halt/partial/ok thresholds, so a run at 39.6% correctly reports `40 / ok`. A check anchored on the raw ratio would have refused that compliant run on a partner-facing path — the harm asserted rather than demonstrated, one more time.
