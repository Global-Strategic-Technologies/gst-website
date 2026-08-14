# Breaking changes — `@gst/mcp-server`

> **Discipline introduced under [BL-032](../src/docs/development/_archive/MCP_SERVER_REMOTE_BL-032.md) Phase 4b**.
>
> Tool names, prompt names, and Resource URIs are part of the package's public contract — pinned client conversations, agent code, and external clients (BL-033) all reference them by name. A rename or removal here is a breaking change for every consumer.
>
> **Scope widened under BL-106 (2026-08-03)**: the **protocol revision a transport serves** is also part of that contract. Dropping an era is breaking for any client speaking it, even when no tool, prompt, or Resource URI moves — and such a change leaves the manifest hash below untouched, so that guard will not catch it. Entries of this kind must say which transport changed and how to roll it back.
>
> **Every entry in this file ships with a corresponding `version` bump in [`package.json`](./package.json) and is mirrored in the [archived BL-032 initiative doc](../src/docs/development/_archive/MCP_SERVER_REMOTE_BL-032.md) Q-section that triggered it (entries after 2026-07-17 cite the maintained [`ARCHITECTURE.md`](./src/docs/ARCHITECTURE.md) instead).** BL-032.5 Phase 4 formalizes the discipline with the **manifest-hash test** at [`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts) — the hash is computed over the registered Library/Regulation/Radar URIs + prompt `name@version` tuples; any drift fails the test and surfaces the new hash in the error message.

> **Prompt-version bumps vs. in-place hash rebaselines** (recorded 2026-08-12, BL-120): bump the prompt `version` when the **previous body bytes have been served**; rebaseline the `EXPECTED_HASH_*` constants in place when they have not. A prompt version is a _published_ identity — it is what this file's manifest hash binds and what the dossier meta fence reports as `promptVersion` for run auditability, and both consumers only ever see served bytes. Minting a version for a byte-state no client ever received manufactures history for exactly the reader the version exists to serve. BL-120 moved all 7 body hashes **three times** inside `0.22.3` on that basis, with each move recorded in the ledger comment in `tests/integration/irl-ingestion-body-hash-stability.test.ts`.
>
> The edge that makes this checkable: **staging auto-deploys on a green MCP test run from a same-repo push.** So an unpushed branch is still free to rebaseline in place; the moment it is pushed those bytes are served, and any further body change owes a version bump.

---

## Current manifest hash

```
274afb116524bddc880df730c1441fc7f10b4c64f58405fc9481fae54a041586
```

Computed over (sorted):

- **4** Library URIs (`gst://library/business-architectures`, `gst://library/vdr-structure`, `gst://library/information-request-list`, `gst://library/irl-tool-input-mapping`).
- 123 Regulation URIs (BL-057: +3 — NIST AI RMF, UK pro-innovation AI framework, Chile Ley 21.719). Aliases (BL-073 + BL-073 acronym add-on `NIST AI RMF` / `NIST RMF` on `US-NIST-AI-RMF.json`; BL-119 `Colorado AI Act` / `CAIA` / `SB 24-205` on `US-CO-AI-ACT.json`) are NOT in the manifest hash inputs — they're an additive matching layer, not a registry shape change. As of 0.49.0 they have **two** consumers: `compose_dossier_envelope`'s server-side validation (exact-equality on normalized form) and `search_regulations` free-text ranking (normalized substring, folded into the name bucket). Assuming a single consumer is what let the BL-119 cycle-3 alias fix land half-done.
- 6 Radar URIs.
- **16** tool names (`list_irl_requests` added by the 0.37.0 per-question-removal work; tool names are NOT manifest-hash inputs — the count here is descriptive).
- **9** prompt `name@version` tuples — `gst_information_request_list` at `0.0.8` (per-question removal + BL-044.5 directives — see the 0.37.0 stanza below), `gst_irl_ingestion` at `0.25.0` (capped `irlSource`, inlined VDR taxonomy, blank-field handling — the flattened-body refusal was withdrawn; see the 0.52.0 stanza below), and `gst_radar_brief_today` at `0.0.5` (provenance caveat added — see the 0.48.2 stanza below).

If this hash differs from the value in
[`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts) → `EXPECTED_MANIFEST_HASH`,
the test will fail with a remediation message. Update **both** values
in lockstep when the registry shape changes.

---

## 0.52.0 — 2026-08-14 — the flattened-body refusal is withdrawn (`0.24.0` → `0.25.0`)

**Behaviour-restoring on the prompt render; additive everywhere else.** No input is removed, no output shape narrows. Manifest hash moves on three prompt tuples.

**What 0.51.0 got wrong.** It refused any `filledIrl` arriving with zero newlines — the signature of a client collapsing a multi-line paste — on the argument that the resulting dossier "cites a structure that no longer exists". That was reasoned from first principles and never tested against an artifact. Checked afterwards:

- `normalizeForMatching` applies `.replace(/\s+/g, ' ')` **before** both the substring check and the word-run tokenizer. Flattening is the same transformation, so it is a provable no-op for the only check the provenance chain runs.
- Nothing reads line structure. The only `split(/\r?\n/)` sites parse the IRL generator source and a different prompt's arg; the extractor produces bodies and never consumes one.
- The hash-bind exists to catch a model substituting a condensed **paraphrase**. Flattening is not paraphrase — every word survives, in order.
- A real production run on a flattened body produced a sound dossier with a correct 121/122 fill ratio.

**And the cost was total.** The smallest IRL fixture in this repo is 4,256 B against a 2,000 B floor, so the refusal fired at every realistic size — and its own remediation, interactive mode, cannot carry a large body, because that path needs the model to emit the whole thing as a tool argument (~21k output tokens for an 80KB IRL). Operators were left with **no completing path**.

**What changed.**

- **The refusal is gone from all four sites** — the prompt render, `prepare_irl_body`, `validate_irl_provenance`, and the registry prepop. A flattened body is cached, minted `prompt-render`, and keeps full `partner-paste-verbatim-prepop` grade. Not gated on `requireVerbatimBody` either: that flag guarantees "partner-supplied rather than model-reconstructed", which a flattened body satisfies.
- **The measurement survives as a diagnostic.** New `serverCachedBodyNewlines` on the envelope response, and `filledIrl.newlines` in the RUN-AUDIT block. `newlines: 0` on a multi-kilobyte body means the client collapsed the paste and the body will not hash-match the operator's source file — the one real consequence, and the thing that cost a full session of forensics to establish. Output-shape **addition**; the manifest hash does not see output shape, so this stanza is the only record.
- **Blank form fields no longer break prompt attachment.** Claude Desktop ships an unfilled field as `""`, so `filledIrl: ""` failed `.min(200)` and the whole `prompts/get` returned `-32602` — surfaced by the client as "Failed to attach prompt" with no diagnostic, which made interactive mode unreachable. A new `stringFromWire` adapter reads `""` as "not supplied", and the three enums now reuse the existing `enumFromWire` (which also brings case-folding). **`stringFromWire` deliberately does not trim its output** — trimming would change `computeIrlBodyHash` and silently break the operator's file comparison.
- **Same fix on two sibling prompts**: `gst_information_request_list` `0.0.7` → `0.0.8` (`productSummary`, identical `-32602`) and `gst_comparable_engagements_memo` `0.0.2` → `0.0.3` (its two arguments had **no `.describe()` at all**, so Desktop rendered blank uninterpretable fields; the empty-string handling there was already correct and is hygiene only).
- **The interactive body sanctions splitting a large `prepare_irl_body` call into its own turn.** A production run stalled rather than emit ~21k tokens of body alongside the dossier, and correctly refused to write audit blocks for a call that never happened — it simply had no sanctioned way to split the work.
- **A tool call the client never delivered** (approval denied or unanswered) is now explicitly excluded from `toolErrors`, whose identity has no transport-subtraction term, and explicitly **included** in `precheck.errorsEncountered`, which is defined as the attempts that never reached the server. A run had invented an out-of-contract `errorClass` because neither block sanctioned it.

**Rollout is order-free in both directions.** Every new input is optional, every new output additive.

---

## 0.51.0 — 2026-08-13 — a flattened IRL body is refused, and `irlSource` is capped by the server (`0.23.0` → `0.24.0`)

**Additive on the tool surfaces; behaviour-changing on the prompt render.** Manifest hash moves on the prompt tuple. Nothing is removed from any input schema.

**What was wrong.** Two defects, one shape — the prompt took claims about its own inputs on trust.

First, **Claude Desktop renders every prompt argument as a single-line input**, so pasting a multi-line markdown IRL collapses every newline to a space before the server sees it. Measured on the production artifact that surfaced this: 141 newlines became 0, the byte length moved by −1, and the content differed at 140 positions. Nothing detected it — the server hashed what it received, cached it and reported the hash honestly, so the run produced a dossier citing a document structure that no longer existed. The −1 delta made it read like an off-by-one; it is total loss of line structure.

Second, **`irlSource: partner-paste-verbatim-prepop` was a model assertion whose only evidence was a copyable string** — the presence of the `**Body-binding hash:**` directive, which survives export. Narrower than it sounds: outside the 4-hour TTL a replay fails loudly, and inside it the bytes really are operator-supplied. What was forgeable is the claim that _this run_ was freshly invoked, plus the fact that the grade was self-reported at all.

**What changed.**

- **A body with zero newlines and more than 2,000 bytes is refused** at all four surfaces it can arrive through: the prompt render halts with an explanation in a single 1.8 KB message (no resource embeds beside a refusal), and `prepare_irl_body`, `validate_irl_provenance` and the registry prepop each reject it. Repair is impossible — `
 → " "` is lossy — so refusal is the only correct response. The check tests for _total_ collapse deliberately: a real IRL already runs ~560 bytes/line, so a ratio heuristic would false-positive on legitimate bodies.
- **`irlSource` is now CAPPED against server-held provenance, never derived.** A new `mcp:irl-body-prov:<irlBodyHash>` record (first-write-wins, 4 h) says whether the prompt render or `prepare_irl_body` wrote the body. An asserted `-prepop` is capped to `partner-paste-verbatim` when the record says `prepare-tool`; nothing is ever promoted; reconstruction and `placeholder` assertions pass through untouched. **Full derivation was rejected** — it would have handed every xlsx-reconstruction run a partner-paste grade and inverted the `requireVerbatimBody` gate that exists to catch reconstructions.
- **New output on the envelope**: a gap-list entry disclosing a cap, and separately one disclosing a `-prepop` claim that could not be verified. This is an **output-shape addition**, and the manifest hash does not see input/output shape — so this ledger entry is the only record. The unverified marker fires **only** for `-prepop` assertions; marking every metadata-absent run would have grown every rendered gap list in the suite.
- **The 16.3 KB `gst://library/vdr-structure` embed is gone**, replaced by the nine-row folder table it existed to supply. A rendered `standard` payload measured on the production artifact goes **153.8 KB → 139.5 KB**, and builds now return two messages rather than three. The URI stays in the body as a provenance caption; a drift guard pins the inlined table against the canonical article.
- **Every argument description leads with its valid values and its default.** Six of eight previously buried the default past the form's truncation point — an operator reading `requireVerbatimBody` saw "Set true for accuracy-critical work — a regulatory deliverable," and never learned it defaults to false.

**Rollout is order-free in both directions.** Every new input is optional and every new output additive; a `0.50.0` client against a `0.51.0` server sees a slightly longer gap list and nothing else. Provenance records minted before deploy do not exist, so runs in the first four hours take the metadata-absent path and carry the model's assertion labelled unverified — self-closing once the TTL turns over.

**Operator impact.** The newline hazard is now documented in both IRL runbooks: a paste into a single-line client field will be refused, and the fix is to attach the file and use interactive mode.

---

## 0.50.0 — 2026-08-13 — audit levels replace the verbosity axis (`0.22.4` → `0.23.0`)

**Breaking on three surfaces**: the prompt's argument list, the `compose_dossier_envelope` input schema, and that tool's **output shape**. Manifest hash moves on the prompt tuple.

**What was wrong.** `verbosity: 'verbose' | 'compact'` conflated three separable concerns on one switch, and had the polarity backwards. `compact` elided the _correctness_ pipeline — the body-binding hash directive, the `validate_irl_provenance` precheck and the `compose_dossier_envelope` composition directive — while leaving the meta fence and the run-audit block on. So it disabled the provenance chain and then demanded an audit report on it, naming fields (`firstEnvelopeCall.irlBodyHash`, `hashBindResult`, `precheck.iterations`) describing calls the mode had just told the model not to make. No UAT exercised it and no production run is recorded with it. Separately, `forceTools` was **inert**: its value was read once for a telemetry counter and never reached the prompt body, so the model was told to honour an override it was never shown.

**What changed.**

- **`auditLevel: 'standard' | 'enhanced' | 'debug'`** replaces `verbosity`, defaulting to `standard`. `standard` is a clean partner-facing dossier; `enhanced` adds the (K) provenance footer, the per-section audit fences and the citation self-check; `debug` adds the run-audit block and the meta fence. **The envelope chain runs at every level** — it stopped being a user-selectable option.
- **The suppression lives in the tool response, not in prompt prose.** `compose_dossier_envelope` now omits `metaFenceMarkdown` (below `debug`) and `provenanceFooterMarkdown` (below `enhanced`) from its result entirely, and `emitInstructions` names only the blocks actually returned. Both fields are therefore **optional** on `ComposeDossierEnvelopeResult`, and are _omitted_ rather than set to `undefined` — the text mirror is built with `JSON.stringify`, which drops undefined-valued keys, so an explicit `undefined` would diverge the two response channels. A prompt-body "do not transcribe" clause would not have worked: this tool exists because the model treats body directives as descriptive context and only tool output as procedure.
- **`verbosity` → `auditLevel` on the tool input**, sharing one exported enum with the prompt rather than a hand-maintained parallel literal. This renames a **meta-fence key**, which is an output-shape change: note the manifest-hash guard does not see input/output shape, so this ledger entry is the only record.
- **`forceTools`, `embedToolWorkedExamples` and the `force_tools_used` metric event are removed.** `forceToolsApplied` stays on the envelope input — required, and `[]` from this prompt — so a caller that does override a gate still has a declared place to record it.
- The prompt's argument surface goes 10 → 8, `filledIrl` moves to index 0, and every description leads with its valid values and names no backlog ids.
- The `BL-045-VERIFY` block is renamed **`RUN-AUDIT`**. Historical ledger entries (including the stanzas below) keep the old label deliberately — renaming a dated record falsifies it.

**Rollout is order-free for the running server, but not for an in-flight conversation.** `auditLevel` is required on the tool input with no alias, so a conversation holding a `0.22.4`-rendered body fails validation against a `0.50.0` server; re-invoke the prompt. Acceptable at single-operator scale, stated rather than left to be discovered.

**Operator impact.** A `standard` run emits no run-audit block, and the client-ready gating checklist reads that block — so signoff runs now invoke `auditLevel: 'debug'`. `OPERATOR_RUNBOOK.md` and `IRL_PARTNER_PASTE_RUNBOOK.md` ship the migration with this change.

---

## 0.49.3 — 2026-08-12 — the server-authoritative counter survives the Worker (`0.22.3` → `0.22.4`)

**Prompt body change + a new Upstash key family.** No tool, argument, or Resource URI changes; the manifest hash moves solely on that prompt's `name@version` tuple. Output-shape change is **additive**: `compose_dossier_envelope` now returns `countersScope` alongside `serverToolCallCounts`.

**What was wrong.** BL-071 made the server authoritative for tool-call counts so the BL-045-VERIFY block would stop depending on the model's memory of its own behaviour, and pinned the operator check `precheck.iterations === serverToolCallCounts.validate_irl_provenance.succeeded`. That identity holds on stdio, where `createServer` runs once per process. **On the remote Worker it cannot**: `createServer` runs per HTTP request, so a fresh `InMemoryToolCallCounters` is built for every call and the envelope's snapshot can only ever contain the request it is inside. Observed on the 2026-08-12 Kestrel production run — the envelope reported `validate_irl_provenance` as all-`null` while the model honestly reported `precheck.iterations: 2`. The prompt was directing operators to fail runs on a check that could not pass, on the transport the team actually uses.

**What changed.**

- Counts for the three IRL-pipeline tools (`validate_irl_provenance`, `compose_dossier_envelope`, `prepare_irl_body`) now accumulate in Upstash under `mcp:irl-run-counts:<irlBodyHash>`, TTL 4h (matched to the BL-076 body cache, so a counter never outlives the body it counts).
- `compose_dossier_envelope` returns **`countersScope`**: `session` (stdio), `run` (Worker + durable store read successfully), `request` (no store bound, or the read failed). Every regime that cannot support the identities now says so rather than reporting a false green.
- The prompt states each identity conditionally, pins the transport-classed `errorsEncountered` subset closed (`transport-timeout`, `transport-disconnect`), and replaces the `attemptsTotal === attempted` equality with a reconciliation that stays arithmetic: durable writes happen at wrapper exit, so an attempt that never reached the server was never countable.

**Rollout is order-free.** A 0.22.3 client reading a 0.49.3 server sees one unknown field it ignores; a 0.22.4 client reading a 0.49.2 server gets no `countersScope` and is told to report `null` rather than infer one.

**Failure posture is quiet** — a counter fault never fails a run (`retry: false` on its Redis client keeps a brownout off the response path). Consequence, accepted deliberately: a write lost mid-run under-reports while scope still reads `run`, which is a false red an operator investigates. False greens are what this change refuses.

**Rollback**: revert the commit and restore the prior hashes. The Upstash keys expire on their own; nothing reads them after a revert.

**Version discipline — the first exercise of the rule recorded in this file's header.** `0.22.3` shipped in PR #414 and staging auto-deployed on the green test run, so those bytes have been **served**. That makes this a version **bump**, not an in-place rebaseline — unlike the three moves BL-120 made inside `0.22.3` while it was still unpushed.

---

## 0.49.2 — 2026-08-12 — the canonical IRL body reads the whole workbook (`0.22.2` → `0.22.3`)

**Prompt body change only.** No tool, argument, or Resource URI changes; the manifest hash moves solely on that prompt's `name@version` tuple. The companion change to `scripts/extract-irl-markdown.mjs` is operator tooling, not a served contract.

**Who this affects**: every consumer of an IRL dossier built from a filled workbook — which is the client-facing and regulatory path the runbook recommends. Nobody's inputs change. What changes is which of the recipient's words reach the deliverable.

**Why**: the IRL workbook has seven columns — `A Reference | B Request | C Status | D File Location | E Comments | F Notes | G Response`. `npm run irl:extract` read four of them (A/B/C/G) and discarded D, E and F as "partner-supplied side channels". Measured against a real filled workbook: **26,221 of 57,992 authored characters — 45.2% — were dropped.** 73 of 134 rows carried Comments, 60 carried File Location, 58 carried Notes. Eighteen rows had a Status claiming an answer with an empty Response; in seventeen of them the answer was sitting in a discarded column. Only one row was genuinely unanswered.

The dropped content was not metadata. One `[CLOSED]` row's Comments read _"B2B SaaS (retail workforce management + retail execution platform)"_ — the answer to the question. A dossier built the recommended way told the recipient they had never answered questions they had answered. Same class as the 0.49.0 alias defect: confidently wrong output, in front of a partner.

The cause is a workflow the tooling never learned: GST pre-populates research into Comments, source pointers into File Location and caveats into Notes; the recipient confirms by setting Status.

**Second defect, found while fixing the first**: this prompt contained **no xlsx-reading guidance at all**. The model-reconstruction path and the extractor agreed only by coincidence — and the extractor's own comment claiming its omission matched "the shape the model uses in reconstruction" was false; the observed reconstruction captured Comments.

**What changed**: a **workbook column contract** section in every served body (interactive included — its VERIFY block admits `xlsx-reconstruction`), stating:

- all seven columns, with the warning to **trust the data sheet's header row and never the Instructions sheet** — workbooks in the wild predate the current generator and one documents a five-column layout with Response in column D, which a model following it would publish as the recipient's answers;
- the composition rule: `- <ref> <request> [<STATUS>] — <answer> (Source: <D>) (Note: <F>)`, where `<answer>` is **G and E joined into one contiguous unlabelled span**. A labelled separator injects a token into the middle of every citation reading across the boundary and drops the provenance matcher below its contiguous-run floor — the committed counterfactual measures a longest run of **5** against a floor of 8, i.e. a faithful citation marked unverified and a `provenance-gap:` auto-appended to a partner-facing dossier;
- **Source and Note stay outside the answer slot**, so a row whose only content is a VDR filename renders `— <NO RESPONSE> (Source: …)` and cannot inflate the fill ratio or open an inclusion gate;
- the fill ratio is counted over the **composed answer span**, explicitly after composition — counting column G alone puts the two paths on different numbers;
- inclusion gates 2, 4 and 6 now require a **substantive answer** rather than a non-empty row;
- **citation hygiene as an audit rule**: cite from the answer slot only, never from `(Source:)` or `(Note:)`.

**Known residual, accepted deliberately**: columns D and F are now inside the body the verifier matches against, so a claim citing a VDR path or a note tail **verifies and raises no `provenance-gap:`**. The mechanical fix would teach `validate_irl_provenance` to reject excerpts matching only inside a `(Source: …)` span — coupling a hardened shared matcher to the body format. That coupling is refused; the prompt handles it by directive, and a unit test pins the residual so a future reader meets it deliberately. See [ADR-0015](../src/docs/adr/0015-irl-canonical-body-reads-full-workbook.md).

**Manifest-hash impact**: rebaselined to `f61390ec…6247`. Tool names and Resource URIs are untouched. **All 7 prompt-body hashes drift** — the contract is unconditional by design, so a partial drift signature would mean it failed to reach a served body.

**Rollback**: revert the commit and restore the prior hashes. No data, transport, or schema implications — but note that bodies extracted under 0.49.2 are materially larger than the same workbook under 0.49.1, so a rollback silently narrows what a re-extraction contains.

---

## 0.49.1 — 2026-08-12 — `gst_irl_ingestion` proceeds when it doubts its own invocation (`0.22.1` → `0.22.2`)

**Prompt body change only.** No tool, argument, or Resource URI changes; the manifest hash moves solely on that prompt's `name@version` tuple.

**Who this affects**: anyone running the one-shot IRL ingestion with a real-size body. Nobody's inputs change; the model's behaviour under one specific ambiguity does.

**Why**: BL-119 cycle 5 executed this prompt against a genuine 56,907-byte engagement IRL in Claude Desktop — the first real-size run in any environment. It succeeded (37/37 claims verified, `pass-bound`, `irlSource: partner-paste-verbatim-prepop`), but only after operator intervention. Above some size the client delivers the expanded prompt as an **attached document** rather than conversation turns, so the model concluded it was _reading_ a render rather than _holding_ bound arguments, and stopped to ask whether it should continue.

The instinct is correct — it declined to act on provenance it could not account for. The problem is the recovery it proposed: call `prepare_irl_body` with the body text it can see. That path **completes successfully** and silently downgrades `irlSource` from server-witnessed `partner-paste-verbatim-prepop` to model-asserted `partner-paste-verbatim`. The dossier looks identical and carries a weaker audit grade. An operator who does not know the difference will accept it, and `requireVerbatimBody` will not object because both labels sit inside its accept-set.

So the failure mode is not a broken run. It is **a good model being talked out of the strong path, invisibly.**

**What changed**: a directive telling the model that the attached-document appearance is a client rendering artifact and says nothing about whether the render occurred; that the `**Body-binding hash:**` directive is itself the evidence it did; and that if it wants confirmation it should probe with `validate_irl_provenance` using the hash and no body rather than reconstruct. It falls back to `prepare_irl_body` only on a genuine cache miss, and reports `partner-paste-verbatim` honestly if it does.

This is the same shape as the 0.48.2 radar caveat: behaviour that was correct, known, and written down in no executable surface.

**Manifest-hash impact**: rebaselined to `cbb14874…a1d7`. Tool names and Resource URIs are untouched.

**Rollback**: revert the commit and restore the prior hash; no data, transport, or schema implications.

---

## 0.49.0 — 2026-08-12 — `search_regulations` matches curated aliases

**No tool, prompt, or Resource URI changes.** Ranking behaviour only, plus a `SEARCH_DESCRIPTION` rewrite.

**Who this affects**: anyone who asks `search_regulations` for a framework by its **common short form** rather than its formal title — which is nearly everyone, since formal titles read like "Colorado Artificial Intelligence Act (SB 24-205)" and people write "Colorado AI Act". Also the `/hub/tools/regulatory-map/` page, fixed in the same commit.

**Why**: `scoreQuery` scored free-text against `id`, `name` and `summary` only. It never read `aliases`, and **ten of the twelve aliases in the corpus returned nothing or the wrong record**. The two that worked did so by unrelated accidents rather than by design: `SB 24-205` is the one alias that appears verbatim in its own record's formal title, and `UK GDPR` resolved only because `gb-dpa`'s summary happens to mention it — a 5-point hit, the same mechanism that produced the wrong answers below. Because a summary mention scores 5 and a non-match scores 0, a framework that merely _named_ another one in its prose outranked the framework itself. Measured against the real corpus before the fix:

| query                   | returned                                           |
| ----------------------- | -------------------------------------------------- |
| `Colorado AI Act`       | `us-nist-ai-rmf` — wrong answer, and the only one  |
| `EU AI Act`             | `kr-ai-basic-act` — wrong answer, and the only one |
| `Australia Privacy Act` | nothing                                            |
| `NIST AI RMF`           | nothing                                            |
| `CAIA`                  | nothing                                            |

The Colorado case is the sharp one: a voluntary federal framework carrying no statutory penalties was returned in place of a state statute carrying **$20,000 per violation**, to an agent composing a partner-facing dossier. A confident wrong answer is worse than the `map-absent` gap entry it replaced, because that at least told the partner the framework was missing.

**Why it went unnoticed**: `aliases` was added in BL-073 for `compose_dossier_envelope`, and the field's own docstring names that consumer. A BL-119 cycle-3 fix added the Colorado aliases and tested them against exactly that consumer. Search was a second index against the same data that nobody had wired up, and no test or UAT case covered free-text disambiguation. Found by the BL-119 cycle-4 UAT run, which probed one record five ways.

**What changed**: aliases are folded into the existing **name** bucket, scored as the best match across the record's aliases (not the sum), reusing the same 80/40/20 weights. They compare on **normalized** form via `normalizeFrameworkName` — the semantic their docstring defines — so `SB 24-205`, `SB24205` and en-dash variants all resolve. A normalized query shorter than `HUB_MATCH_MIN_LENGTH` (4, now exported from `compose-dossier-envelope.ts`) skips the alias bucket, because an all-punctuation query normalizes to `''` and would otherwise prefix-match every alias — `query: "-"` legitimately matches all 123 ids and must not be hijacked.

Weights were ratified by a before/after ranking diff over the whole corpus rather than by hand: **15 top-hit changes, every one a resolution of a previously wrong or absent result, and no demotions**. `gdpr` still returns `eu-gdpr` first (`gb-dpa`'s alias is literally "UK GDPR", which is why aliases sit in the name bucket rather than above it), `ccpa` and `privacy act` are unchanged, and punctuation-only queries are unchanged.

**Manifest-hash impact: none.** Tool names, prompt names and Resource URIs are untouched, and aliases have never been hash inputs (see § Current manifest hash).

**Rollback**: revert the commit. No data, transport, or schema implications — the corpus JSON is unchanged and `aliases` was already being served in full via `resources/read`.

---

## 0.48.2 — 2026-08-11 — `gst_radar_brief_today` labels its own provenance (`0.0.4` → `0.0.5`)

**`gst_radar_brief_today` 0.0.4 → 0.0.5.** No tool, Resource URI or input-schema changes; the manifest hash moves solely on that prompt's `name@version` tuple.

**Who this affects**: anyone who forwards a radar brief. The brief is deal-team-facing prose that reads as finished analysis, and every item in it is third-party reporting GST aggregated and annotated — not reporting GST verified. Through 0.0.4 the output carried no framing of that at all, so a partner could paste it into a client email with nothing marking where it came from or that it needs confirming.

**Why it went unnoticed for four versions.** The requirement was real and written down — in the BL-033 risk line, [`OPERATOR_RUNBOOK.md`](../src/docs/development/OPERATOR_RUNBOOK.md), and the `/hub/mcp/` marketing copy on the then-unmerged `feat/mcp-website-marketing` branch, whose parity test asserts the page tells prospects radar content "should not be auto-actioned". It existed in **no** surface that actually emitted the content: not this prompt body, not any of the other eight, not a tool description, and not the recorded golden. The golden encoded the same omission, so every comparison against it agreed. Found by the BL-119 cycle-2 UAT run, which tested the requirement rather than the recorded output.

**What changed**: a Step 7 instructing a one-line provenance caveat after the "Open in Hub" footer — aggregated third-party reporting with GST annotation, not independently verified, confirm against sources before acting or sharing. It is a numbered step rather than a note in the Voice paragraph because the 0.0.4 run followed all seven of its steps faithfully and still emitted nothing: the model does what the numbered steps say.

**Rollback**: revert the commit and restore the prior manifest hash; no data or transport implications.

## 0.48.1 — 2026-08-08 — worked-example client deidentified as SanFran

**`gst_irl_ingestion` 0.22.0 → 0.22.1.** No directive, gate, argument, tool, or Resource URI changes; the manifest hash moves solely on that prompt's `name@version` tuple.

**Who this affects**: no one behaviorally. The engagement previously named as the worked-example client throughout prompt bodies, tool-schema `.describe()` examples, source comments, and docs is a real client, and the name (with associated revenue figures and board-report citations) was being served over the wire in `prompts/get` bodies and `tools/list` schema descriptions. All occurrences repo-wide are renamed to the engagement code name **SanFran**; the figures and citations themselves are unchanged, so every empirical rationale those examples document still holds.

**Why a version bump for a rename**: the prompt-body hash guard is deliberately byte-brittle, and the rename changes body bytes in the Step 3 worked examples and extraction-rules directives. Per the BL-032/BL-043 prompt-iteration discipline, any body change lands with a version bump and lockstep hash updates (`irl-ingestion-body-hash-stability.test.ts` six scenario hashes + the manifest hash above).

**Rollback**: revert the commit; no data or transport implications.

## 0.48.0 — 2026-08-07 — `gst_radar_brief_today` renders on the Worker, and its degraded path stops giving remote clients local advice

**`gst_radar_brief_today` 0.0.3 → 0.0.4.** No tool, Resource URI or input schema changes; the manifest hash moves solely on that prompt's `name@version` tuple.

**Who this affects**: every remote client. The prompt did not work at all over HTTP — `prompts/get` returned JSON-RPC `-32603` on production, 100% of the time, while the same prompt worked correctly on local stdio.

**Why.** `prompts/embed.ts` called `readFyiSnapshot()` from `content/radar-snapshot.ts`, which resolves its cache directory from `fileURLToPath(import.meta.url)`. In the Worker bundle `import.meta.url` is `undefined`, so the call threw `The "path" argument must be of type string or an instance of URL. Received undefined`. Lazily — the module imported cleanly and only threw when a model actually expanded the prompt, which is why nothing surfaced at boot.

Nothing caught it because **no test in this package issued a `prompts/get` on any transport**: `prompts-args-shape.test.ts` stops at `prompts/list`, and the Worker suite covered tools and Resources. The May 2026 senior-consultant V-trial that signed the prompt off ran against Claude Desktop on stdio, where the reader is correct. Both surfaces were verified; the combination never was.

**What changed.**

- The snapshot is now injected. `_registry.ts` resolves the block and hands it to `build`, because only the registry knows the transport — and therefore which reader and which degraded wording apply. `embedFyiRadarSnapshot` takes an already-read tier instead of reading one.
- **Step 2 of the body no longer keys on a phrase.** It said to look for a text block containing `Radar snapshot not found` — the stdio message. That phrase does not appear in the Worker's degraded text, so the stop-and-surface instruction would have failed silently on the transport where the snapshot is most often unavailable, leaving the model free to fabricate items. It now keys on the block being TEXT rather than an embedded resource, which holds regardless of wording. **This is the change that moves the version.**
- The body's `npm run radar:seed` remediation is gone. A remote user has no repo to run it in. Degraded text is now transport-specific (`content/radar-messages.ts`), and distinguishes a cold cache from a curated tier that has simply aged out under the 30-day freshness gate.
- On the Worker the prompt reads through a **cache-only** reader (`createWorkerCachedSnapshotReader`). A prompt expansion is model-initiated, so it must not be able to spend the shared Inoreader budget on a cold cache — the prompt's own docstring has always promised it never makes live calls.

**Accepted tradeoff**: the cache-only reader has no repopulation path and the Cron cadence equals the 6h cache TTL, so there is a window where `prompts/get` renders degraded while `resources/read` of the same URI would have refilled live. The two surfaces can disagree. That is the price of not handing the model an egress lever.

**Manifest-hash impact**: hash changes from `e8d76ac0…` to `ccda7822…` — solely the `gst_radar_brief_today` name@version tuple. Updated in `tests/integration/manifest-stability.test.ts` and the "Current manifest hash" section above.

---

## 0.47.0 — 2026-08-06 — BL-112 — `gst_irl_ingestion` stops instructing a call that exceeds a client's ceiling

**`gst_irl_ingestion` 0.21.1 → 0.22.0.** No tool, Resource URI or input schema changes; the manifest hash moves solely on that prompt's `name@version` tuple.

**Who this affects**: anyone pinned to `gst_irl_ingestion@0.21.1`. Step 3's guidance changed, not its shape — the batched-array directive is preserved.

**Why.** Step 3's worked example specified `limit: 50` on `search_regulations` while instructing a single batched call across every jurisdiction in IRL Section 09. Measured against the real 123-record corpus, that returns **~153,200 characters** — **1.07×** the 143,027-character response that had already exceeded a real client's tool-result ceiling in 0.46.0. The prompt was steering a client-facing dossier workflow into a call that lands past a known failure point.

Measured, `search_regulations` envelope (both channels, real data):

| `limit`                 | envelope chars | vs the 143,027 that failed |
| ----------------------- | -------------- | -------------------------- |
| 20 (default)            | ~61,300        | 0.43×                      |
| **50 (was instructed)** | **~153,200**   | **1.07×**                  |
| 120 (schema max)        | ~355,700       | 2.49×                      |

**What changed.** The worked example moves to `limit: 20`, and Step 3 gains two directives: keep `limit` at or near its default, and on `returned < totalMatched` **narrow by category and issue a second batched call rather than raising `limit`**. That recovery path supersedes the previous absolute "batched into a single call" — new semantics, which is why the version moves rather than holding steady as the BL-108 rebaseline did.

`search_regulations`' own description carried the same false steer — _"the full 120-framework response fits comfortably in context"_ — and now states the measured sizes instead. **The tool's inputs are unchanged**: no bound was added, because the mirror cannot supply one (the page renders a single region, whose largest holds 10 frameworks — below the existing default of 20) and no client ceiling is documented. That decision is deliberately open; see BL-113 (BL-112 measured the sizes and was pruned 2026-08-09; BL-113 carries the open bounding decision).

**Also corrected**: the corpus is **123** frameworks, not 120. ~31 statements across 20 files said otherwise, including `list_regulation_facets`' own contract while the tool returned 123 at runtime. Note the consequence, unchanged by this release: with 123 records and `limit` capped at 120, `search_regulations` cannot return the full dataset in one call.

**Manifest-hash impact**: hash changes from `26dce144…` to `e8d76ac0…` — solely the `gst_irl_ingestion` name@version tuple. Updated in `tests/integration/manifest-stability.test.ts` and the "Current manifest hash" section above.

---

## 0.46.0 — 2026-08-05 — BL-109 — the radar tools apply the website's display bound

**`search_radar` and `search_radar_offline` return fewer items, and a smaller `summary`.** Both changes make the tools match `/hub/radar`, which they had never done on output.

**Who this affects**: anyone reading every element of `matches`. `totalMatched` now reports the pre-bound count while `returned` reports the post-bound one, so truncation is visible in the payload and in the caption (`"30 of 46 radar items"`). Consumers reading `summary` as HTML get plain text instead — nothing in this repo did.

**Why.** `/hub/radar` caps the wire tier at `MAX_WIRE = 30` (with a `MIN_PER_CATEGORY = 3` quota) and FYI at `FYI_MAX_COUNT = 15`, so it renders **≤45 items**. `search_radar` applied **no** wire bound and returned 61. Under 0.45.0's two-channel response that produced a **143,027-character** result which exceeded a real client's tool-result ceiling — the tool became unusable, not merely large. 0.45.0's risk note framed the doubling as wire cost; this is the failure mode it missed.

Two levers, both "mirror what the page does". Measured on a production-shaped corpus (15 FYI + 46 wire, realistic HTML summaries):

|                             | chars      |            |
| --------------------------- | ---------- | ---------- |
| before (61 items, raw HTML) | 134,370    |            |
| + wire bound only           | 99,834     | −25.7%     |
| **+ HTML strip (shipped)**  | **78,737** | **−41.4%** |

The bound alone would likely not have cleared the ceiling. `summary` carried Inoreader's **raw untruncated HTML** on every item — the page renders no summary at all for wire items and stripped-and-truncated text for FYI — so stripping markup is the larger lever and costs no meaning. It is **not** truncated: unlike the page's 250-char display cut, feed prose has analytical value to an LLM.

**FYI is untouched**, so every `gstTake` survives. The strip happens at the **tool boundary only** — `/radar/snapshot`, the `gst://radar/*` Resources and the cron cache still carry raw source bytes.

**No input change.** No `limit` was re-added; ADR-0005's capability-mirror decision stands. This is that invariant being enforced on _output_ for the first time — see its 2026-08-05 note. The bound now lives in [`src/utils/radar-feed-bounds.ts`](../src/utils/radar-feed-bounds.ts), called by both the website page and the tools, so the two cannot drift.

**Also in this release**: `generate_information_request_list_xlsx` gains **`downloadUrl`** on its payload — the Hub _generator_ URL with the caller's args pre-filled. It previously existed only inside the caption string while the payload carried `canonicalUrl` (the library _article_ page), so a payload-reading client was handed the wrong URL for the tool's entire purpose. `canonicalUrl` is unchanged. And `search_radar`'s description now marks `search_radar_offline` **stdio-only** — it was advertising a tool the remote surface does not register.

`get_latest_insights` gets the same `summary` projection — the two radar tools are a documented capability mirror, and a model composing across them would otherwise see one FYI item as plain text from one and raw HTML from the other.

`gst_information_request_list`'s body now names `structuredContent.downloadUrl` as the link to relay, replacing "the Hub download link in its text summary" — the channel D2 showed to be insufficient. Directive intent is unchanged (direct the partner to the Hub generator page), only the field it names, so **`promptVersion` stays at `0.0.7`** and the manifest hash is unaffected.

**No manifest change** — tool names, prompt names and Resource URIs are untouched.

---

## 0.45.0 — 2026-08-04 — BL-108 — tool results carry the payload in `content` again

**Every successful tool response changes shape.** `content` goes from one block to two: `content[0].text` is the same one-line caption as before, byte-identical, and **`content[1].text` is the compact serialized payload**. `structuredContent` is unchanged and remains canonical. Failure results are untouched — still a single block carrying the verbatim message.

**Who this affects**: any consumer that assumed `content` had exactly one element. Within this repo that was five test assertions, plus the caption-extractor in `tests/integration/tool-result-constructors.test.ts` (which took "everything after the first comma" and so silently swallowed the new third argument); `scripts/Invoke-McpRequest.ps1` and the smoke commands below read `structuredContent` and are unaffected. Consumers reading `content[0].text` for the caption are also unaffected — index 0 did not move.

**Why.** Between 0.43.0 and this release, `content` carried a caption and nothing else. **Claude Desktop reads `content`**, so for three weeks it received `"11 portfolio matches."` with no rows and `"15 themes, 2 engagement categories, 6 growth stages, 5 years."` with no values, and reported `search_portfolio` as broken. The MCP spec has a clause for exactly this — _"a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block"_ — which [ADR-0011](../src/docs/adr/0011-tool-response-channel-policy.md) recorded itself as knowingly deviating from. The serialization is **compact**, never pretty-printed: the indentation was BL-090's real finding, the duplication was not.

**Measured wire cost** — `search_portfolio` (all 65) 61,529 → 127,599 B (×2.07); `compose_dossier_envelope` 16,581 → 33,290 B (×2.01); `list_portfolio_facets` 597 → 1,105 B (×1.85). Against the 143,403 B pre-BL-090 baseline this lands ~11% below where BL-090 started, not back at it. The audit stream's `outputBytes` will step up accordingly — expected, not a regression signal.

**One exception**: `generate_information_request_list_xlsx` omits its base64 blob from `content[1]` only, replacing it with a marker string; `structuredContent.base64` is untouched. ~17 KB of base64 is ~4,500-6,000 tokens the model cannot use, of a payload Claude Desktop cannot render (see 0.3.9 below). Note this makes it the sole tool whose two channels differ — the property that produced BL-090's wrong generalisation.

**Not a `content[1]` precedent**: 0.3.8 below also used a `content[1]`, but for a **`resource`** block carrying the .xlsx as a blob, reverted in 0.3.9. Unrelated mechanism, unrelated payload.

**Also in this release**: the `search_portfolio` theme vocabulary is now derived from `projects.json` rather than hand-written. The descriptions had been advertising `"Healthcare Tech"`, `"Financial Services"` and `"Life Sciences"` — none of which are real themes — including in the `tools/list` argument description, which is the only portfolio vocabulary a cold LLM call can see. The `gst_irl_ingestion` body carried the same two invented values; corrected in place.

**No manifest change.** Tool names, prompt names and Resource URIs are untouched, and `gst_irl_ingestion` stays at `0.21.1` — the prompt edit replaced illustrative data values inside directives whose semantics and structure are unchanged, which is the BL-086 L0/L1 no-bump class. (Contrast BL-064, which _introduced_ that Step 2 batching directive and did bump.) The three one-shot body hashes in `tests/integration/irl-ingestion-body-hash-stability.test.ts` are rebaselined; the manifest hash above is unchanged.

---

## 0.44.1 — 2026-08-04 — BL-106 — **REVERTED**: the Worker serves both protocol eras again

**This undoes the breaking change in 0.44.0, roughly an hour after it reached production, because it broke production.** 0.44.0 deployed at 17:56 UTC on 2026-08-04 (the stanza below is dated 08-03, when the change was written). The remote Worker serves protocol `2025-11-25` again alongside `2026-07-28` (`legacy: 'stateless'`).

0.44.0's stanza said "who this affects: nobody known at ship time." That was wrong within the hour. **Claude Desktop speaks `2025-11-25`** — the spec revision was a week old and its client had not moved — so its `initialize` was refused with `-32022` and every tool call failed. It presented as `failed to call tool list_portfolio_facets`, not as a connection error, because the client still displayed its cached tool list; the symptom pointed at a tool rather than at the handshake.

The error was in the question asked, not the evidence gathered. "No external clients" was verified and true; what mattered was _what protocol version the client software speaks_, which is a different question whenever the consumers are your own team using third-party tools.

Also shipped here: the `era` discriminator (`mcp.request.era`, `legacy` / `modern`), which was specified for 0.44.0, dropped during implementation, and whose absence meant this had to be diagnosed by reproducing symptoms instead of reading a log. Plus two regression tests pinning the legacy handshake and the exact `tools/call` that failed.

See [ADR-0013](../src/docs/adr/0013-mcp-2026-07-28-modern-only-worker.md) § Amendment 2026-08-04. **No manifest change** — tool names, prompt names and Resource URIs are untouched, so the manifest hash is unchanged and could not have caught this.

---

## 0.44.0 — 2026-08-03 — BL-106 — the remote Worker serves protocol `2026-07-28` only

**Breaking, transport-scoped.** The Worker at `mcp.globalstrategic.tech` no longer serves protocol revision `2025-11-25`: a client opening with an `initialize` handshake is answered with the unsupported-protocol-version error naming the modern revisions. **stdio is unaffected** and continues to serve the legacy era — see [ADR-0013](../src/docs/adr/0013-mcp-2026-07-28-modern-only-worker.md) for why the two transports differ.

No tool name, prompt name, or Resource URI changed, so **the manifest hash above is unchanged** — the guard that normally catches breaking changes cannot see this one, which is why the file's scope note was widened in the same commit.

Who this affects: nobody known at ship time. The website consumes `GET /radar/snapshot` over plain HTTP rather than MCP RPC, and no M2M or OAuth clients are provisioned. The change exists because `agents` deprecated the SDK-v1 handler path we were on, with removal in its next major.

**Rollback**: set `legacy: 'stateless'` on the `createMcpHandler` options in `src/pipeline/handle-authenticated.ts`. Note stdio's equivalent token is `'serve'`, not `'stateless'` — the two enums differ.

Shipped alongside (non-breaking): `Mcp-Method` / `Mcp-Name` added to the CORS preflight allowlist; `ttlMs` / `cacheScope` published on library and regulation resource reads; migration from `@modelcontextprotocol/sdk@1.30.0` to `@modelcontextprotocol/server@2.0.0`.

---

## 0.43.0 — 2026-07-27 — BL-090 — tool responses stop sending the payload twice; failures gain a structured channel

**Theme**: `structuredContent` is now the canonical machine channel on **every** path and `content[0].text` is the model channel — a one-line caption on success, the verbatim message on failure. Every tool result is built by `toolOk()` / `toolFail()` in `src/tools/_result.ts`; nothing hand-rolls the literal. Decision record: [`src/docs/adr/0011-tool-response-channel-policy.md`](../src/docs/adr/0011-tool-response-channel-policy.md). **Manifest hash unchanged** — no tool, prompt, or Resource URI added, renamed, or removed, and no prompt body reworded.

**Why**: every tool that returned data sent it twice — pretty-printed into `content[0].text` AND as the object in `structuredContent`. On a full `search_portfolio` that is ~143 KB where ~61 KB suffices (the escaped text copy is the larger of the two, 81,826 B vs 61,439 B). A live probe against production confirmed clients read `structuredContent` and discard `content` when both are present, so the duplicate reached nobody. Meanwhile **no** error return carried `structuredContent` at all, and two hand-`JSON.stringify`d a structured error into the text channel.

**Behavior change (client-visible)**:

- **Success**: `content[0].text` is no longer a JSON dump of the payload. It is a one-line human caption (e.g. `"61 portfolio matches."`). The payload is unchanged and still in `structuredContent`. **Any consumer parsing `content[0].text` as JSON must switch to `structuredContent`.** Both known consumers were migrated in this release (see below).
- **Failure**: `isError: true` results now ALSO carry `structuredContent` — `{ error, message, ...detail }`. Callers can branch on `error` instead of substring-matching prose. `content[0].text` is unchanged and byte-for-byte verbatim, which the `gst_irl_ingestion` retry directives depend on.

**Renames on the radar failure envelope** (released by operator confirmation that no external client is live — see ADR-0011 § "expiry condition"):

- `error: "service_unavailable"` → **`error: "service-unavailable"`**, the one snake_case outlier in an otherwise kebab-case vocabulary.
- The circuit-open envelope's inner `reason` field → **`cause`**. Under `{ error, ... }` two different meanings shared the word "reason".
- The other six radar reasons (`config-missing`, `token-missing`, `token-stale`, `inoreader-rate-limit`, `upstream-error`, `network-timeout`) are **unchanged**; the granularity `search_radar`'s description advertises is preserved deliberately.

**Internal consumers migrated in this release** (no action for operators beyond re-dot-sourcing):

- `scripts/Invoke-McpRequest.ps1` — `Invoke-McpTool` returns `result.structuredContent`; it no longer `ConvertFrom-Json`s the text block.
- `src/docs/operations/DEPLOY.md` B.3 smoke commands — the triple-`jq` unwrap collapses to `jq '.result.structuredContent.matches | length'`.

**Not a context-window change**: the model never received the duplicate, so this does not increase what Claude can process. It is a wire-size and code-simplicity change.

**Constrains a future `outputSchema`**: the SDK client validates `structuredContent` whenever present with no `isError` guard, so declaring an `outputSchema` on any tool would make error results throw client-side. See ADR-0011.

---

## 0.42.0 — 2026-07-27 — BL-091 — circuit-breaker open now serves cached radar instead of hard-failing (behavior change + additive `liveInfo` fields)

**Theme**: while the Inoreader circuit breaker is open, every radar read surface serves the cached snapshot instead of erroring, and no surface calls Inoreader. Implements the second clause of ADR-0006 § Decision 2, which had never been wired up, and narrows the 503 to the cache-empty case. Decision record: `src/docs/adr/0006-inoreader-zone1-budget-protection.md` § Amendment 2026-07-27. **Manifest hash unchanged** — no tool, prompt, or Resource URI added, renamed, or removed.

**Behavior change (client-visible, not a rename)**:

- `search_radar` / `get_latest_insights` previously returned `isError: true` + `error: 'service_unavailable'`, `status: 503` for the _entire_ breaker window. They now return a **normal success payload** built from the cached snapshot, with `liveInfo.degraded: true`. The 503 envelope is unchanged in shape but now appears **only when nothing is cached**. Clients branching on the 503 keep working; clients that treated a breaker window as "radar is down" will now receive data.
- `/radar/snapshot` (website SSR) stays HTTP 200 throughout, as before, and gains `degraded` / `retryAfterSeconds` in the body. It can now also OPEN the breaker on a 429 (previously the only Inoreader consumer that could not).
- `gst://radar/*` Resources no longer fetch Inoreader on a cold cache during an open window (previously an unguarded budget leak); the "snapshot not populated" body is also no longer cached for 15 minutes.

**Additive fields** (no removals):

- `liveInfo.degraded: boolean` — always present on both radar tools; `false` on the normal path.
- `liveInfo.retryAfterSeconds?: number` — present only when degraded.
- `liveInfo.{wire,fyi}FetchedAt` / `{wire,fyi}CacheHit` **widen to nullable** — a tier with nothing cached reports `null` rather than a fabricated timestamp/flag. Consumers reading these must tolerate `null`.
- `/health` gains `circuitOpen: boolean` (informational; deliberately not folded into `ok`), mirrored as a `/status` Substrate row.

**Removed (internal only, no consumers)**: `circuitOpenResponse()` from `src/ratelimit/circuit-breaker.ts` — dead since the tools hand-roll their MCP envelope; no callers, tests, or docs referenced it.

---

## 0.41.0 — 2026-07-26 — BL-033 Slice 5 — per-client rate-limit tiers (backfilled stanza)

**Backfilled 2026-07-27**: 0.41.0 shipped without an entry, breaking the unbroken 0.28.0→0.40.0 run. Recorded here for continuity. **Manifest hash unchanged** — no tool/prompt/Resource change.

Per-client rate-limit tiers (`free-pilot` / `paid` / `enterprise` / `internal`) became load-bearing: the ceiling is selected from the client's tier (carried on the M2M token claim) instead of flat hardcoded constants. Static `MCP_KEY_*` keys and OAuth human-consent sessions resolve to `internal`, which equals the previous constants exactly — **no regression for existing callers**. Additive response surface: `RateLimit-Policy` on every authenticated 200 and 429, plus a best-effort `notifications/message` soft-limit warning at ≥80% consumption (required declaring the server `logging` capability). Decision record: `src/docs/adr/0010-per-client-rate-limit-tiers.md`.

---

## 0.40.0 — 2026-07-24 — BL-033 Slice 2 — OAuth 2.1 embedded authorization server + M2M client_credentials (new routes, new KV binding, new secret, additive 401 header)

**Theme**: the Worker becomes its own OAuth 2.1 authorization server (`@cloudflare/workers-oauth-provider`, exact-pinned 0.8.2, mounted as a sub-router) with dual cheap-first validation — static `MCP_KEY_*` keys are byte-identical and NOT deprecated. Decision record: `src/docs/adr/0008-mcp-oauth-embedded-authorization-server.md` (website tree). Unlocks Claude's native Connectors UI (the `mcp-remote` bridge becomes a legacy path, still supported).

**New public surface** (routes are not manifest-hash inputs; no tool/prompt/resource change — manifest hash unchanged):

- **`GET|POST /authorize`** — server-rendered consent page. Identity = delegation over the key roster: the user authenticates with their `MCP_KEY_*` value; granted scopes = requested ∩ key scopes; grants carry `keyOwner OAUTH:<owner>`.
- **`POST /token`** — library grants (`authorization_code` + PKCE S256-only, `refresh_token` with rotation, 1h access tokens) PLUS our own `grant_type=client_credentials` branch (the library has none): RFC 7523 `private_key_jwt` or hashed-secret client auth → self-contained HS256 `mcp_m2m_*` JWTs (1h, audience-bound, no refresh token).
- **`/.well-known/oauth-authorization-server`** (RFC 8414) + **`/.well-known/oauth-protected-resource`** (RFC 9728) — DCR deliberately absent; CIMD advertised.
- **`POST /oauth/introspect`** (RFC 7662, `MCP_ADMIN_KEY`-gated) — M2M tokens cross-check the client record so revoked clients report inactive.
- **`/admin/oauth/clients*` + `/admin/oauth/m2m-clients*`** — `MCP_ADMIN_KEY`-gated client CRUD (runbooks: `operations/AUTH.md` § OAuth).
- **Additive 401 header change on `/mcp` + `/radar/snapshot`**: when a bearer was presented but rejected, `WWW-Authenticate` now reads `Bearer realm="gst-mcp", error="invalid_token", resource_metadata="<origin>/.well-known/oauth-protected-resource"`. The JSON 401 body is unchanged; missing/empty-bearer challenges are unchanged.

**New infrastructure**: `OAUTH_KV` namespace binding per env (staging `580b8f1f…`, production `13c9e9f5…` — created 2026-07-24); new Worker secret `OAUTH_M2M_SIGNING_KEY` (staging bound 2026-07-24; **production must be bound before the first production deploy of this version** — without it M2M issuance 503s while everything else works); `global_fetch_strictly_public` compatibility flag (SSRF defense for CIMD metadata fetches).

**Internal restructuring** (no behavior change on the static path): post-auth pipeline extracted from `worker.ts` to `src/pipeline/handle-authenticated.ts` (shared by all three auth paths via the `AuthSuccess` contract); `matchToken` core extracted from `authenticate()`; `htmlShell`/`escapeHtml` extracted from `admin/inoreader-reauth.ts` to `src/lib/html-shell.ts` — this supersedes older entries' references to the constant-time comparator living in `admin/admin-auth.ts` (it moved to `src/auth/timing-safe-equal.ts` in 0.39.x / Slice 1).

**New keyOwner values in telemetry**: `OAUTH:<user>` and `M2M:<NAME>` join the static suffixes in AE blob3 / rate-limit buckets / safeLog. A new keyOwner's first busy hour can fire the traffic-spike ticket once (no trailing mean) — expected onboarding behavior.

---

## 0.39.0 — 2026-07-14 — BL-032.75 Phase 3 — SLO alert evaluator cron + `/status` page (new route, new cron, new optional secrets)

**Theme**: the account-free half of BL-032.75 Phase 3 ships — a scheduled SLO alert evaluator + public status surface, calibrated from the Phase 2 baselines signed off 2026-07-14 (`observability/slo-baselines.md`). Grafana dashboards remain deferred (Grafana Cloud account is the explicit trigger).

**New public surface**:

- **`GET /status`** — unauthenticated server-rendered HTML (health payload + last alert-evaluation summary). Same auth posture as `/health` (which exposes strictly more); 60s edge cache. NOT a manifest-hash input (routes aren't hashed).
- **Third production cron `*/15 * * * *`** — the alert evaluator (`src/observability/alert-evaluator.ts`): evaluates the 7 canonical rules (`alert-rules.ts`, config-as-code in TS — recorded deviation from the design doc's YAML, since the rules execute in the Worker), posts fingerprinted Sentry issue events (`event: slo-alert`, fingerprint `['slo-alert', ruleId, severity, utcDate]`, cooldowns page 2h / ticket 6h), writes the summary for `/status`, and emits its own `cron_outcome` AE event (`NAME_VALUES.cron_outcome` gains `'alert-evaluator'`). Worker scheduled dispatch restructured to explicit per-cron matching with an unknown-cron fall-through.
- **New OPTIONAL Worker secrets `CF_AE_TOKEN` + `CF_ACCOUNT_ID`** (AE SQL reads for the traffic-spike / scope-403 / oauth-failure-rate rules; mint per DEPLOY.md § C.X Worker-secret variant). Unbound → those rules fail open; Upstash/health rules still run. **Set before deploying this version** or accept the reduced rule set.
- `postSentryEvent` gains optional `fingerprint`; `postEnvelope` now records ok/fail delivery day-counters (`mcp:sentry-envelope:{ok,fail}:<date>`, TTL 48h) — the `sentry-envelope-post-failure-rate` rule's data source.

**Operator actions** (see SENTRY_ALERT_RULES.md § 5): create the two `slo-alert` email rules (page/ticket), set the two Worker secrets, run the force-fire acceptance test, record the first verified firing.

**Free-tier constraints honored**: evaluator never posts Crons check-ins (the single free monitor belongs to radar-refresh); email-only notifications; worst-case ≈840 events/mo vs the 5k budget.

**Manifest hash: UNCHANGED** — no Resource URIs or prompt versions touched. `/health.version` re-synced to package.json (was stale at `0.1.0` since BL-032 Phase 4b).

---

## 0.38.0 — 2026-07-09 — BL-049 closeout hardening — `normalizeForMatching` curly-quote flattening + meta-fence stale version literal (`gst_irl_ingestion` v0.21.0 → v0.21.1)

**Theme**: closes out BL-049 (BACKLOG truth-pass landed in the same PR — the stanza's "Open" status was a month stale; the server-side xlsx path stays deferred indefinitely per the [revisit blueprint](../src/docs/development/_archive/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md)). Two code remnants ship:

**1. Curly-quote flattening in `normalizeForMatching`** (`src/schemas/validate-irl-provenance.ts`): U+2018 U+2019 U+201C U+201D join the punctuation-to-space class, symmetric with the existing straight-quote handling. This closes the last encoding-drift class from BL-049's original problem statement — em-dashes were already flattened, and NBSP variants (U+00A0/U+202F) were already covered because JS `\s` matches all Unicode space separators (now locked with regression tests).

- **Dossier impact (verdict-widening only)**: citations that previously landed `unverified` purely on curly-vs-straight quote drift between citation and body now verify. The transform is symmetric on needle and haystack, so nothing previously verified can regress. `compose_dossier_envelope` inherits transitively via `runIrlProvenanceCheck`.
- No contract shape change: no tool/prompt/Resource names or schemas touched by this part.

**2. Meta-fence stale version literal** (`gst_irl_ingestion` **v0.21.0 → v0.21.1**): the `META_JSON_FENCE_DIRECTIVE` example JSON hardcoded `"promptVersion": "0.4.0"` (five months stale). Replaced with a self-explaining placeholder — `compose_dossier_envelope` server-derives `promptVersion` from the prompt registry and overrides whatever the model emits, so the literal was cosmetic; the placeholder now says so. Deliberately NOT interpolating the live version constant: that would drift the body hashes on every future version bump and destroy the hash-stability test's attribution value.

- **Hash fan-out**: the directive appears only in the one-shot and extract-only bodies, so **6 of 7** `irl-ingestion-body-hash-stability` hashes rebaseline (interactive unchanged). Manifest hash rebaselines from the single `gst_irl_ingestion@0.21.1` tuple: `6105444438c74a28…` → `26dce144d2cc433b…`.

---

## 0.37.0 — 2026-07-07 — Per-question removal + BL-044.5 directive engine (`gst_information_request_list` v0.0.6 → v0.0.7; new tool `list_irl_requests`)

**Theme**: the IRL generator surfaces gained bullet-level configurability, twice over. (1) **Manual per-question removal** — `excludeRequests` (`"NN-II"` keys: two-digit section + two-digit canonical ordinal) on the `generate_information_request_list_xlsx` tool, the `gst_information_request_list` prompt (comma-separated wire string), and the Hub generator's context panes (delta-chevron toggles in the pinned ⓘ pane; `?exclude=` deeplink param). (2) **BL-044.5 directive engine, shipped** — authored `<!-- skip-if: context=… -->` comments in the generator source auto-remove tagged questions when the matching `transactionContext` is supplied. One tag ships (the `00` "Engagement context" question — redundant once context is a known input); the dictionary is registry-enforced (`context` only in v1).

**Behavioral change (intended)**: `transactionContext` was previously cosmetic (header label only). It now ALSO fires skip-if directives — a context-supplied generation differs from the universal artifact (today by exactly one question: bulletCount 67 → 66). No-context calls remain byte-identical universal. Pinned workflows supplying a context will observe the count change.

**Reference-ID stability**: every removal mechanism (manual keys, directives, and the existing section pick-list) preserves surviving questions' Reference IDs — removals leave intentional GAPS (`2-01, 2-02, 2-04…`) instead of renumbering, keeping recipient-quoted refs and the filled-IRL ingestion round-trip stable. Custom requests number from the section's canonical count, so they can never collide with a removed question's ID.

**What changed**

- `gst_information_request_list` **v0.0.6 → v0.0.7**: new `excludeRequests` wire arg; the one-shot body server-computes the combined omission list (directive diff via the shared `applyDirectives` + manual keys) and instructs the model to omit exactly those without renumbering. The prompt authors no filter logic (BL-044.5 single-filter-engine rule).
- **New tool `list_irl_requests`** (16th tool): read-only key-discovery — every canonical question as `{ key, section, sectionTitle, text, skipIf? }`, so a model maps natural language to exclusion keys without hand-counting the source. Not a manifest-hash input (tools aren't hashed).
- `embedIrlGeneratorSource` **strips directive comment lines** at the embed boundary — both prompts (`gst_information_request_list`, `gst_irl_ingestion`) and both modes receive a comment-free body. The strip restores the pre-tag bytes, so the new skip-if tag itself does not change the ingestion body (locked by the prompt's embed-strip unit test) and `gst_irl_ingestion` needs no version bump. **However**, this change also cleaned up a stale, CRLF-contaminated committed generator-source bundle (a prior Windows regen; CI regenerates deterministic LF via the codegen's `\r\n`→`\n` normalization). Committing the clean LF bundle rebaselined all 7 `irl-ingestion-body-hash-stability` hashes to the values CI produces — line-ending hygiene, not a body-semantics change.
- Parser grammar extension: `<!-- skip-if: <dim>=<v1>[,<v2>…] -->` directive lines (registry-validated; any other comment anywhere, including the footer, is a parse error); bullets carry `ordinal`, sections carry `canonicalBulletCount`. Authoring + extension guide at `src/data/irl/README.md`.

**Manifest-hash impact**: hash changes from `0b6868c2…` to `61054444…` — solely the `gst_information_request_list` name@version tuple. Updated in `tests/integration/manifest-stability.test.ts` and the "Current manifest hash" section above.

## 0.36.0 — 2026-07-04 — `gst_irl_ingestion` IRL taxonomy embed decoupled onto the generator source (v0.20.0 → v0.21.0)

**Theme**: follow-on to 0.35.0. The library article (`/hub/library/information-request-list/`) gained human-facing content that does not belong in a machine taxonomy — a cross-link + description of the Hub IRL generator tool. Because `gst_irl_ingestion` embedded the **library article** as its filled-IRL reconciliation taxonomy, that prose was leaking into the ingestion prompt. Repointed the ingestion prompt's IRL taxonomy embed onto the decoupled generator source (`gst://irl/source` → `src/data/irl/…`), the same clean canonical list the generator renders. The VDR embed (`gst://library/vdr-structure`) is unchanged.

**What changed**

- `gst_irl_ingestion` **v0.20.0 → v0.21.0**: its second (IRL taxonomy) message now embeds the generator source under label `gst://irl/source` instead of `gst://library/information-request-list`. `orchestrates` swapped the IRL library URI for `gst://irl/source`; the "embedded for taxonomy reference" provenance sentences were reworded. No arg/output shape change.
- Re-baselined all 7 `irl-ingestion-body-hash-stability` hashes (the IRL embed block is present in every body shape) and the manifest hash (one prompt `name@version` tuple).

**Contract impact**: **none for existing Resources.** `gst://library/information-request-list` remains a registered Library Resource (now serving the free-form article, including the new tool cross-link). `gst://irl/source` is an inline prompt-embed label, not a listable Resource. Manifest drift is solely the one prompt tuple bump. The ingestion taxonomy content is byte-identical to the pre-0.35.0 article, so ingestion behavior is unchanged apart from no longer inheriting future library-page prose edits.

## 0.35.0 — 2026-07-04 — IRL generator source decoupled from the library article (`gst_information_request_list` v0.0.5 → v0.0.6)

**Theme**: the Information Request List `.xlsx` generators (Hub tool + `generate_information_request_list_xlsx` + `gst_information_request_list` prompt) now read a **dedicated generator source** (`src/data/irl/information-request-list.md`) instead of the `gst://library/information-request-list` article. There is no business requirement that the human library article match the generated list, so the two are now free to vary independently: edit the generator source to change the `.xlsx`; edit the library article to change the `/hub/library/information-request-list/` page.

**What changed**

- **New source of truth for the generators**: `src/data/irl/information-request-list.md` (seeded as a byte-identical copy of the article, so output is unchanged at cutover). The library article stays put as free-form prose and is no longer bound by the strict `parseIrlArticle` grammar.
- **Codegen**: `scripts/generate-regulations-index.mjs` now also emits `src/content/irl-source-data.generated.ts` (`IRL_SOURCE_BODY`), consumed via the new `loadIrlSourceBody()`. The tool, the section catalog, and the prompt embed all read this — never the library loader.
- **Prompt** `gst_information_request_list` **v0.0.5 → v0.0.6**: the second (embedded) message is now the generator source, embedded inline under the label `gst://irl/source` (a NEW inline embed identifier — **not** a listable Resource). `orchestrates` changed from `[gst://library/information-request-list, generate_information_request_list_xlsx]` to `[gst://irl/source, generate_information_request_list_xlsx]`. No arg/output shape change.

**Contract impact**: **none for existing Resources.** `gst://library/information-request-list` remains a registered Library Resource serving the (now free-form) article — its URI, count, and manifest membership are unchanged. `gst://irl/source` is an inline prompt-embed label only; it is not registered in `resources/list`, so the Library/Regulation/Radar URI sets are untouched. Manifest drift is solely the one prompt `name@version` tuple bump. Seed content is identical, so generated `.xlsx` output is byte-unchanged at this release.

## 0.34.0 — 2026-07-02 — `gst_information_request_list` configurability parity (v0.0.4 → v0.0.5)

**Theme**: the IRL prompt reached full configuration parity with the Hub generator and the `generate_information_request_list_xlsx` tool. It gained four optional args on top of the existing `targetName` / `transactionContext` / `productSummary`:

- `companyName` / `projectName` — composed into the workbook title (`{Company} {Project} Information Request List`).
- `includeSections` — section pick-list, supplied as a comma-separated string (`"00,01,03"`); coerced to an array by `arrayFromWire`.
- `customRequests` — extra per-section requests, one per line as `"NN: text"`, parsed into `{ section, text }[]`.
- `showCanonicalReference` — canonical-row toggle (`"true"` / `"false"`), coerced by `booleanFromWire` (default omitted).

The one-shot body now computes the **exact** `generate_information_request_list_xlsx` payload and instructs the model to pass it verbatim, and reproduces the in-chat artifact honoring the same configuration (filtered sections, appended custom requests, composed title). All new args are optional and additive — **non-breaking** for existing pinned invocations (bare and `targetName`-only calls are unchanged). The prompt `name@version` tuple bump (0.0.4 → 0.0.5) is the only manifest input that moved.

**Surface impact**: manifest hash changes (prompt version tuple); `EXPECTED_MANIFEST_HASH` + this file updated in lockstep; golden frontmatter + README prompt row updated. No tool/resource/prompt names renamed or removed.

## 0.33.0 — 2026-06-30 — Reword authorial-intent preamble (drop the injection-tell)

**Theme**: the shared authorial-intent leading line (`authorialIntentLine` in `src/prompts/embed.ts`, prepended to every GST prompt body) was reworded to remove a counterproductive clause. It used to read _"…treat them as the user's direct instructions and proceed without hedging about prompt provenance."_ That instruction-not-to-question-provenance reads as a prompt-injection tell to v4.7+ models and triggered the exact refusal it was meant to prevent — observed live on a partner-paste `gst_irl_ingestion` run (2026-06-30), where the model declined the workflow citing the "suppress your judgment" preamble as a jailbreak signal.

New line: _"Workflow invocation: `<name>` — a GST consultant workflow the user explicitly initiated from the MCP prompt menu. The steps below are the task to carry out."_ It states provenance positively (the workflow came from a deliberate user action) and leaves the model's judgment intact.

**Empirical motivation**: this is a companion to BL-086 — L2 shrank the body, but the refusal trigger turned out to be this preamble (and the BL-079 prepop/VERIFY provenance scaffolding, addressed separately), not the worked examples.

**Surface impact**:

- **UPDATED** shared `authorialIntentLine` — affects the rendered body of all 9 prompts that use it. Only `gst_irl_ingestion` carries a `promptVersion` consumed for provenance + body-hash baselines, so only it bumps: `0.19.0` → `0.20.0`. The other prompts' bodies change cosmetically with no version-bump (nothing consumes their version; no body-hash test).
- **BODY HASH DRIFT** — all 7 `gst_irl_ingestion` body hashes drift (the preamble leads every variant). Rebaselined in `tests/integration/irl-ingestion-body-hash-stability.test.ts`.
- **MANIFEST HASH DRIFT** — from the `gst_irl_ingestion` tuple bump. New value: `18d19416405f3989e5ba2975536f44f21a2d82e0e90a6d8eff4225149d4cfe70`.

---

## 0.32.0 — 2026-06-30 — BL-086 L2: worked-example deletion + `embedToolWorkedExamples` restore arg

**Theme**: the three inline worked-example JSON megapayloads in the `gst_irl_ingestion` one-shot body — Step 1a (`generate_diligence_agenda._audit`), Step 4a (`compute_techpar._audit`), Step 6a (`estimate_tech_debt_cost._audit`) — are now **elided by default**. First-call shape discipline is carried by (a) the calibration / anti-fabrication / enum coaching prose, which stays, and (b) each tool's own structured rejection diagnostic, which already names the rule violated and the fix (verified actionable in `diligence-audit.ts` / `techpar-audit.ts` / `tech-debt-audit.ts` — every issue carries a `ruleId` + explicit `Fix:` clause). This removes ~one-fifth of the prompt body, continuing the BL-086 effort to shrink the body below the v4.7+ jailbreak-similarity refusal threshold.

**Empirical motivation**: per the BL-086 design doc, the worked examples were a first-call-hit-rate latency optimization, never a correctness mechanism — the server substrate catches the same errors with or without them. The 2026-06-07 exercise showed 1 arg-shape retry _with_ the examples in place, so they were not the perfect prophylactic. Expected behavioral delta: ~1–2 self-correction retries per session on first tool calls (was 0–1); final dossier output unchanged.

**Restore arg**: set `embedToolWorkedExamples: true` to inline the full worked-example payloads again — recommended for unfamiliar models with high arg-shape-rejection rates. Boolean, defaults to false (examples elided). Same `booleanFromWire` wire-shape handling as `requireVerbatimBody` (accepts `true`/`false` and string forms from Claude Desktop's slash-command form).

**Surface impact**:

- **UPDATED** `gst_irl_ingestion` prompt body — Steps 1a/4a/6a JSON examples now gated behind `embedToolWorkedExamples`; promptVersion `0.18.0` → `0.19.0`.
- **NEW** `embedToolWorkedExamples` prompt arg (optional boolean).
- **BODY HASH DRIFT** — the 3 one-shot body hashes (minimal, full, full-compact) drift; interactive + extract-only unchanged. Rebaselined in `tests/integration/irl-ingestion-body-hash-stability.test.ts`.
- **MANIFEST HASH DRIFT** — from the `gst_irl_ingestion` name@version tuple bump. New value: `5ee20ef3c3b6c17cf4f740867917c27a964b7e28dbbbb2dae194d3aaa82f8194`.

**Post-merge verification** (per design doc): run 2–3 staging partner-paste exercises tracking retry counts. If per-session retries stay under ~2 → commit. If they spike → flip `embedToolWorkedExamples: true` and revisit whether the tool errors need sharpening.

---

## 0.31.2 — 2026-06-08 — BL-086 L1: mode-conditional prose removal

**Theme**: each rendered `gst_irl_ingestion` body now describes ONE coherent path — no more "if `**Body-binding hash:**` directive appears... otherwise..." conditional prose in the model-runtime artifacts. `buildOneShotBody` (verbose) emits unconditional prepop-workflow prose (the directive is always present, the model is told to SKIP `prepare_irl_body`); `INTERACTIVE_BODY` emits unconditional legacy-workflow prose (call `prepare_irl_body` to seed the cache, no SKIP directive). The shared `ENVELOPE_PRECHECK_DIRECTIVE` + `ENVELOPE_COMPOSITION_DIRECTIVE` are now scoped to the verbose one-shot path (the only site that includes them), so the "interactive / xlsx-reconstruction mode" branches in those directives are deleted as dead prose.

**Empirical motivation**: tonight's audit found the conditional "if directive appears above... otherwise..." prose was the structural source of model confusion in the v4.7+ refusal-pattern observation. Builder-level mode selection already routes the body — duplicating that routing inside the directive prose is redundant and weakens the instruction.

**Surface impact**:

- **UPDATED** `gst_irl_ingestion` prompt body at `mcp-server/src/prompts/irl-ingestion.ts`:
  - `ENVELOPE_PRECHECK_DIRECTIVE` — dropped the "interactive / xlsx-reconstruction mode" branch (only verbose one-shot uses this directive, where the directive is always present).
  - `ENVELOPE_COMPOSITION_DIRECTIVE` — collapsed the prepop / xlsx-reconstruction conditional into one prepop-only path. Body-submission / `irlBodyHash` / `irlSource` / `requireVerbatimBody` bullets now describe the prepop workflow unconditionally.
  - Interactive Step 4 — dropped the "if directive appears" conditional; the model is told unconditionally to call `prepare_irl_body` first and pass `irlBodyHash` to compose.
  - `promptVersion` unchanged at `0.18.0` (per BL-086 doc: L0/L1 do not bump promptVersion; L2 will be the first to bump it).
- **NO** schema change, no argsSchema change, no tool registration change, no behavioral change at the tool-call layer.
- **NO** manifest hash drift (the prompt `name@version` tuple is unchanged because promptVersion stays at 0.18.0).
- **BODY HASH REBASELINE** — 3 of 7 body shapes drift (the verbose-mode bodies: interactive + one-shot minimal + one-shot full). The 4 compact + extract-only paths skip the envelope-composition directive entirely per its `BLOCKING — full mode + verbosity verbose only` header, so their hashes are unchanged.

**Acceptance** (in-session):

- All 1517 mcp-server tests pass.
- Test substring assertions updated: BL-076 / BL-079 Part B prompt-body assertions rewritten as negative assertions for the conditional prose AND positive assertions for the new unconditional prose.
- Verified the directive no longer contains `if you see`, `Interactive / xlsx-reconstruction mode`, `if a \`**Body-binding hash:**\`` strings.

---

## 0.31.1 — 2026-06-08 — BL-086 L0: runtime-vocabulary cleanup

**Theme**: strip `BL-*` references, version pins (`v0.30.0+`, `(v0.17.0+):`), and PR-history mentions from every model-runtime artifact — `.describe()` calls in IRL-surface schemas, `super(...)` error-message prose, `TOOL_DESCRIPTION` constants. Pure cosmetic cleanup; zero behavioral change. The model-visible runtime no longer carries internal substrate vocabulary; operators / downstream parsers reading the rule prose see what each rule does, not which ticket introduced it.

**What stayed**:

- `instanceof` class names (`Bl063PartitionViolationError`, `Bl070VerbatimBodyRequiredError`, `Bl076BodyCacheMissError`, etc.) — those are code symbols.
- `ruleId:` short-code identifiers in audit issues (`BL-045-CURRENCY-CONVERSION-REQUIRED`, `BL-045-TIER-3-REQUIRED-FOR-UNKNOWN`, etc.) — those are stable machine-readable error identifiers downstream tooling matches on.
- Error-code identifier strings in error message preambles (`BL-063-PARTITION-VIOLATION`, `BL-063-CERTIFICATION-NOT-REGULATION`) — same rationale; stable error IDs.
- Typed metric event names (`bl077.cache.set`, `bl079.cache.preload.failed`) consumed by `wrangler tail`.
- `BL-*` references in `mcp-server/src/docs/**`, `src/docs/**`, this file (operator-facing docs and the historical change log).
- Code comments (`//` and JSDoc) referencing BL-\* tickets — those are author-facing.

**Surface impact**:

- **UPDATED** describe-call prose + super-message prose in:
  - `mcp-server/src/schemas/compose-dossier-envelope.ts` (irlBodyHash / irlSource / requireVerbatimBody / promptVersion describes; `Bl070VerbatimBodyRequiredError` / `Bl076BodyCacheMissError` / `Bl068MapAbsentFalsePositiveError` / `IrlBodyHashMismatchError` messages; auto-appended `tier-fabrication` and `xlsx-reconstruction` gap-list entry text).
  - `mcp-server/src/schemas/validate-irl-provenance.ts` (filledIrl / irlBodyHash / cross-field refine messages).
  - `mcp-server/src/schemas/diligence-audit.ts` (tier coupling describe, dimension audit describes, `Per BL-045 ...` message preambles, batch summary footer).
  - `mcp-server/src/schemas/techpar-audit.ts` (annualizationSource describe, monetaryBasis describe, format-issues header, `Per BL-045 ...` message preambles).
  - `mcp-server/src/schemas/tech-debt-audit.ts` (audit metadata describe, mttrHours / incidents describes, format-issues header).
  - `mcp-server/src/cache/irl-body-cache.ts` (`IrlBodyCacheSizeExceededError`, `IrlBodyCacheWriteFailedError` messages).
- **UPDATED** `TOOL_DESCRIPTION` constants in:
  - `mcp-server/src/tools/compose-dossier-envelope.ts` (the `irlBodyHash` bullet — `sha256(filledIrl)` → `sha256(cachedBody)`).
  - `mcp-server/src/tools/validate-irl-provenance.ts` (Why call + Inputs prose).
- **NO** manifest hash drift, **NO** body hash drift on its own (the prompt body L0 edits are bundled into L1 above).
- **NO** schema change, no tool registration change, no behavioral change.

**Acceptance** (in-session):

- TypeScript clean (`npx tsc --noEmit`).
- Test substring assertions updated for each renamed prose: ~12 assertions across `tests/unit/schemas/{compose-dossier-envelope-gap-validation,diligence-audit,tech-debt-audit,techpar-audit,validate-irl-provenance-bl079}.test.ts`, `tests/unit/tools/diligence-handler.test.ts`, `tests/unit/cache/irl-body-cache.test.ts`, `tests/integration/{bl-071-precheck-derivation,bl-076-body-by-hash,bl-079-validate-body-by-hash}.test.ts`.

---

## 0.31.0 — 2026-06-07 — BL-079 Part B: prompt-render cache pre-pop + skip-prepare directive

**Theme**: closes the model output stream emission ceiling on the partner-paste path entirely. Pre-0.31.0, the model emitted the IRL body twice (once to `prepare_irl_body`, once per `validate_irl_provenance` iteration). Part A (0.30.5) eliminated the validate-iteration emissions via body-by-hash. Part B (this patch) eliminates the `prepare_irl_body` emission too by pre-populating the cache at prompt-render time from the operator's `filledIrl` prompt arg. Combined effect: the model emits ZERO body bytes across the entire partner-paste workflow.

**Empirical motivation**: tonight's 51KB partner-paste exercise (post-0.30.5 deploy) confirmed the legacy `prepare_irl_body` emission still surfaces stream-ceiling variance — this run happened to round-trip cleanly (`hashBindResult: pass-bound`, `34/34 verified`) but the 2026-06-07 day exercise at 77KB truncated to 1,753 bytes, and the night exercise at 50KB shed 12% of bytes. The prepop path takes the body off the emission stream entirely so outcome variance collapses.

**Surface impact**:

- **NEW** prompt-build wrapper at `mcp-server/src/prompts/_registry.ts` — when `gst_irl_ingestion` is built with `args.filledIrl`, the wrapper sync-awaits `handlePrepareIrlBodyTool` (Alt-D pattern: reuses BL-077a/b/c diagnostics) BEFORE returning the rendered prompt body. Failure emits `bl079.cache.preload.failed` safeLog event with `storeId` for `wrangler tail` correlation; failure is non-fatal — model falls through to legacy `prepare_irl_body` path on cache miss.
- **UPDATED** `compose_dossier_envelope` schema at `mcp-server/src/schemas/compose-dossier-envelope.ts`:
  - **NEW** `irlSource` enum value: `partner-paste-verbatim-prepop` — operator-supplied bytes that never round-tripped through model emission (strongest provenance form).
  - **UPDATED** BL-070 gate dual-accept: both `partner-paste-verbatim` AND `partner-paste-verbatim-prepop` pass the `requireVerbatimBody: true` check.
  - **NEW** `serverCachedBodyBytes` field on `ComposeDossierEnvelopeResult` — server-authoritative UTF-8 byte length of the cache-hydrated body. Under prepop the model has no emission to self-measure; this is the source of truth for VERIFY-block `filledIrl.bytes`.
  - **UPDATED** `Bl076BodyCacheMissError` message — mentions BL-079 prepop path + suggests checking `wrangler tail` for `bl079.cache.preload.failed` event.
- **UPDATED** `gst_irl_ingestion` prompt body at `mcp-server/src/prompts/irl-ingestion.ts`:
  - Promptversion `0.17.0` → `0.18.0`.
  - Precheck directive (one-shot path) gains "if `**Body-binding hash:**` directive present → SKIP `prepare_irl_body`, pass `irlBodyHash` to validate + compose, report `irlSource: partner-paste-verbatim-prepop`" guidance.
  - Envelope-composition directive (one-shot path) gains the same skip-prepare guidance + `serverCachedBodyBytes` → `filledIrl.bytes` mapping.
  - Interactive Step 4 gains the prepop conditional.
  - VERIFY-block `filledIrl.source` enum list updated (4 → 5 values) in both verbose + compact + extract-only paths.
- **MANIFEST HASH DRIFT** — manifest hash changes due to prompt `name@version` tuple. New value: `f341908c909a54cb9946ddc07b187b578d0a1fc1a3e279beb43d29be8a29fa24`.
- **BODY HASH REBASELINE** — ALL 7 body shapes drift (the new `partner-paste-verbatim-prepop` enum value appears in the VERIFY-block enum list emitted by every mode).
- **NEW** typed metric event `bl079.cache.preload.failed` for `wrangler tail` correlation across BL-077 / BL-079 events.

**Acceptance** (in-session):

- 4 wrapper unit tests at `tests/unit/prompts/bl-079-prompt-render-cache-prepop.test.ts`: cache populated when filledIrl supplied; cache untouched in interactive mode; build succeeds without cache wiring; cache key matches the prompt body's `**Body-binding hash:**` directive.
- 2 prompt-body substring assertions (one-shot + interactive both contain `BL-079 Part B`, `partner-paste-verbatim-prepop`, `SKIP \`prepare_irl_body\``).
- 1 BL-070 dual-accept regression — `requireVerbatimBody: true` + `irlSource: partner-paste-verbatim-prepop` passes the gate.
- Manifest + body hash rebaselines committed in lockstep.
- 1518 mcp-server tests green; `tsc --noEmit` clean.

**Expected post-merge operator-exercise diff vs. 0.30.5 tonight (51KB partner-paste)**:

| Field                             | 0.30.5 tonight         | 0.31.0 expected                                |
| --------------------------------- | ---------------------- | ---------------------------------------------- |
| `prepare_irl_body.attempted`      | 1                      | 0 (model SKIPS)                                |
| `validate_irl_provenance.errored` | 1 (transport-timeout)  | 0                                              |
| `precheck.outcome`                | abandoned-after-error  | converged                                      |
| `runScenario`                     | partner-paste          | partner-paste-verbatim-prepop                  |
| `irlSource`                       | partner-paste-verbatim | partner-paste-verbatim-prepop                  |
| `filledIrl.bytes` source          | model self-narrated    | `serverCachedBodyBytes` (server-authoritative) |
| `hashBindResult`                  | pass-bound (variance)  | pass-bound (deterministic)                     |

---

## 0.30.5 — 2026-06-07 — BL-079 Part A: `validate_irl_provenance` body-by-hash

**Theme**: closes the precheck-loop emission damage observed on the 2026-06-07 night staging exercise. Operator paste of a ~50KB IRL body produced `provenanceVerification: { total: 19, verified: 14, unverified: 5, tierMismatches: 1, tierFabrications: 3 }` because `validate_irl_provenance` required the model to re-emit the full body alongside the citations on every precheck iteration — the model's output stream silently dropped ~12% of bytes, and the citation substring matcher then ran against the lossy reconstruction. Part A lets the model pass the canonical 16-hex `irlBodyHash` instead; the server re-hydrates the operator-supplied bytes from the shared `IrlBodyCache` (BL-076 substrate, BL-077c namespace) for matching. The model emits the body to `prepare_irl_body` ONCE per session instead of once per precheck iteration.

Independently fixes the precheck-iteration emission damage — Part B (prompt-render cache pre-pop) is the larger sequel that takes the body off the emission path entirely. See `src/docs/development/_archive/MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md` for the full design.

**Surface impact**:

- **UPDATED** `validate_irl_provenance` input schema at [`mcp-server/src/schemas/validate-irl-provenance.ts`]:
  - `filledIrl`: now **optional** (`z.string().min(200).optional()`). Legacy callers that pass it directly continue to work unchanged.
  - **NEW** `irlBodyHash`: optional 16-hex hash field (same format as `compose_dossier_envelope.irlBodyHash`). When supplied, the server re-hydrates from `metrics.irlBodyCache` for citation matching.
  - **NEW** cross-field `.refine` rule: at least one of `filledIrl` / `irlBodyHash` MUST be supplied. The MCP SDK validates only the per-field shape, so the handler enforces this invariant explicitly via a structured `isError: true` response.
- **UPDATED** handler signature: `handleValidateIrlProvenanceTool(payload, metrics?)`. `metrics` defaults to `NOOP_METRICS_CONTEXT` — existing call sites that pass only the payload continue to work unchanged.
- **UPDATED** `registerValidateIrlProvenanceTool` now threads its `metrics` argument into the handler so the registered tool can resolve `irlBodyHash` against the shared `IrlBodyCache`. The `MetricsContext.irlBodyCache` plumbing (added in 0.30.0 / BL-076) is the same surface — no new wiring.
- **NEW** export `RunIrlProvenanceCheckInput` — the engine-internal input type with `filledIrl: string` (required). Distinct from the public `ValidateIrlProvenanceInput` (where `filledIrl` is optional). The handler is the single resolution point: schema parses, handler resolves the body from either source, engine consumes the resolved string.
- **NEW** export `ValidateIrlProvenanceInputObject` — the underlying ZodObject (no `.refine`) used by `registerTool` for `.shape` exposure. The full schema with `.refine` is still exported as `ValidateIrlProvenanceInputSchema` for explicit parsing in tests.
- **No prompt-body change**, no manifest hash drift, no body hash rebaseline. Part A is a tool-schema additive expansion only; the prompt directive update lands in Part B (0.31.0).
- **No public contract removal**. Every legacy `{ filledIrl, citations }` call shape continues to parse + execute identically.

**Acceptance** (in-session):

- 13 new BL-079 schema unit tests at [`tests/unit/schemas/validate-irl-provenance-bl079.test.ts`]: refine rule (all 5 cases per design doc), regex shape (3 cases), per-field optionality on `.shape`, handler cache-hit / cache-miss / both-fields precedence / neither-field defense-in-depth, `Bl076BodyCacheMissError` instanceof contract.
- 6 new integration tests at [`tests/integration/bl-079-validate-body-by-hash.test.ts`] exercising the `prepare_irl_body → validate_irl_provenance` chain end-to-end: cache write-then-resolve, precheck iteration re-use of the same cached body, cache-miss surfacing `Bl076BodyCacheMissError`, legacy path backward-compat, R-8 compose internal-call seam regression, hash format invariant.
- 1511 mcp-server tests green; `npx tsc --noEmit` clean.

**What Part B will add** (separate PR, 0.31.0): prompt-render-time cache pre-population (wrapper calls `handlePrepareIrlBodyTool` synchronously from `_registry.ts` when the operator supplied `filledIrl` as a prompt arg), `partner-paste-verbatim-prepop` runScenario taxonomy, BL-070 gate dual-accept, prompt directive surgery instructing the model to skip `prepare_irl_body` entirely when it sees the `**Body-binding hash:**` directive. The model will emit the body ZERO times across the entire partner-paste workflow once Part B ships.

---

## 0.30.4 — 2026-06-07 — BL-082 `booleanFromWire` for slash-command form interop

**Theme**: closes a structural bug in prompt-argument validation. Per the MCP wire protocol, prompt `arguments` are typed as `Record<string, string>` — every value the client sends is a string regardless of the conceptual type. Claude Desktop's slash-command form renders boolean fields as plain text inputs and ships `"true"` / `"TRUE"` / `"false"` rather than the JSON boolean. Pre-0.30.4, the `gst_irl_ingestion` prompt's `requireVerbatimBody: z.boolean().optional()` field rejected every string form with `expected boolean, received string`. The `arrayFromWire` / `numberFromWire` / `enumFromWire` adapters already existed at [`mcp-server/src/prompts/wire-shape.ts`] for the array / number / enum cases; the boolean case was missing.

Operator hit this on 2026-06-07 when invoking `/gst_irl_ingestion` from Claude Desktop with the SanFran partner-paste body:

```
Message from server: { error: { code: -32602,
  message: "MCP error -32602: Invalid arguments for prompt gst_irl_ingestion: [
    { expected: 'boolean', code: 'invalid_type',
      path: ['requireVerbatimBody'],
      message: 'Invalid input: expected boolean, received string' } ]"
}}
```

**Surface impact**:

- **NEW** `booleanFromWire` exported from `mcp-server/src/prompts/wire-shape.ts`. Mirrors the design of the existing `arrayFromWire` / `numberFromWire` / `enumFromWire` adapters. Accepts: typed booleans (forward-compat), case-insensitive `'true' / 'false'`, and ergonomic alternates `'yes' / 'no' / 'y' / 'n' / '1' / '0' / 'on' / 'off'`. Empty / whitespace-only strings normalize to `undefined` (unfilled-form-field convention shared with the other adapters). Garbage strings fall through to Zod for structured rejection.
- **UPDATED** `gst_irl_ingestion` prompt argsSchema at [`mcp-server/src/prompts/irl-ingestion.ts`]:
  - `requireVerbatimBody`: `z.boolean().optional()` → `booleanFromWire(z.boolean().optional())`
  - `forceTools`: `z.array(z.enum(ORCHESTRATED_TOOLS)).optional()` → `arrayFromWire(z.array(z.enum(ORCHESTRATED_TOOLS)).optional())` (same root-cause bug class — array fields ship as strings from the slash-command form; the bug just hadn't been exercised empirically because no operator had used `forceTools` from the UI before)
- **No public contract change**. The accepted JSON-boolean / JSON-array values still parse identically; the change is additive — the schema now also accepts the string forms the wire protocol actually delivers.
- **No prompt-body change**, no schema change, no manifest hash drift, no body hash rebaseline.

**Acceptance** (in-session):

- 8 new `booleanFromWire` unit tests at [`tests/unit/prompts/wire-shape.test.ts`]: forward-compat boolean pass-through; canonical `'true'`/`'false'` parsing; case-insensitive (`'TRUE'` / `'False'` / `'TrUe'`); whitespace trimming; ergonomic alternates (yes/no/y/n/1/0/on/off); garbage rejection; non-boolean non-string rejection; empty/whitespace as not-supplied.
- 5 new BL-082 regression tests at [`tests/unit/prompts/irl-ingestion.test.ts`]: full argsSchema accepts `requireVerbatimBody: 'true'` / `'TRUE'` / `'false'`; treats `''` as not-supplied; rejects `'definitely'`.
- 1489 mcp-server tests green; tsc clean.

**Operator unblock**: deploy 0.30.4 to staging; retry `/gst_irl_ingestion` with `requireVerbatimBody: TRUE`. The schema now accepts the string form the slash-command UI ships.

**Risks**: minimal. The wire-shape adapter pattern is established and tested; this just fills the boolean gap. The change is additive (typed booleans still work), so any future MCP client that sends typed values experiences zero behavior difference.

---

## 0.30.3 — 2026-06-07 — BL-077c realign IRL body cache key to `mcp:` namespace

**Theme**: closes the BL-076 staging incident. BL-077b's `upstash.set.failed` event captured the actual Upstash error on the next staging exercise:

```
NOPERM this user has no permissions to access one of the keys used as arguments
```

The shared Upstash token has ACL scoped to `+@all ~mcp:*` (single DB shared between staging and production, confirmed 2026-06-07). BL-076 originally shipped with the prefix `gst-mcp:irl-body:` — outside that scope — so every `prepare_irl_body` call's cache write was rejected with `NOPERM`. The 64KB body size that looked like a smoking gun was a coincidence; the same body shape hit the same error regardless of size.

**Surface impact**:

- **CHANGED** `UPSTASH_KEY_PREFIX` in [`mcp-server/src/cache/irl-body-cache.ts`] from `'gst-mcp:irl-body:'` to `'mcp:irl-body:'`. Aligns with the namespace discipline documented at [`upstash-cache-store.ts:12-16`] ("All keys written here use the `mcp:` prefix").
- **NEW** regression-guard unit test asserting `UPSTASH_KEY_PREFIX.startsWith('mcp:')` so a future refactor can't silently reintroduce the ACL failure.
- **No public contract change.** No prompt-body change, no schema change, no manifest hash drift.
- **No data migration**: pre-existing `gst-mcp:irl-body:*` keys never made it to Upstash (writes were rejected). No stale entries to clean up.

**Acceptance** (in-session):

- 1 new regression-guard unit test + existing 13 cache tests + 7 BL-076 integration tests still green with the new prefix value.
- 1461 mcp-server tests green; tsc clean.

**Operator follow-up** (the diagnostic chain closes here):

1. Deploy 0.30.3 to staging.
2. Operator re-runs the same `gst_irl_ingestion` exercise that produced the `NOPERM` event.
3. `prepare_irl_body` writes succeed → `compose_dossier_envelope` re-hydrates successfully → dossier completes end-to-end with the BL-076 latency win.
4. BL-077a/b diagnostic instrumentation (read-after-write probe, `bl077.cache.*` events, `upstash.set.failed` event) stays in place for now — light cost; revisit removal after one week of stable production traces. The read-after-write probe in particular adds ~50–100ms to every `prepare_irl_body` call and should come out once the substrate is proven stable.

**Risks**: minimal. The prefix change is a one-line constant. No callers outside this module reference the prefix. The Upstash ACL accepts `mcp:irl-body:*` writes — confirmed by inference from existing `mcp:resource:*`, `mcp:ratelimit:*`, `mcp:circuit:*` traffic which succeeds today.

**Diagnostic chain summary** (for the operator runbook):

- BL-076 (v0.30.0) — body-by-hash mechanism shipped; latency-win design correct, but cache write silently failed in Worker mode due to ACL scope drift.
- BL-077a (v0.30.1) — fail-loud + read-after-write probe + `bl077.cache.*` logging surfaced "write returns false."
- BL-077b (v0.30.2) — `upstash.set.failed` logging surfaced the actual NOPERM error.
- BL-077c (v0.30.3 — this release) — namespace alignment closes the loop.

---

## 0.30.2 — 2026-06-07 — BL-077b surface Upstash error in `CacheStore.set`

**Theme**: continuation of BL-077a diagnostic chain. BL-077a's `bl077.cache.set` event on staging confirmed `outcome: write-returned-false` at a 64KB body — the underlying Upstash write was failing — but the actual Upstash error was being swallowed inside `CacheStore.set`'s `catch {}` block. Pre-BL-077b, we could see WHICH layer was failing but not WHY. This patch adds one `safeLog` line inside the catch so `wrangler tail` captures the actual Upstash error message in the next exercise.

**Surface impact**:

- **NEW** `upstash.set.failed` `safeLog` event emitted at [`mcp-server/src/lib/upstash-cache-store.ts`] whenever `redis.set` throws. Carries: `key` (the Upstash key being written), `byteLength` (size of the JSON-stringified `{storedAt, data}` envelope — the actual byte count Upstash received), `ttlSeconds`, `reason` (truncated to 300 chars), `errorCode: 'upstash-set-threw'`.
- **No public contract change.** No prompt-body change, no schema change, no manifest hash drift, no body hash rebaseline.
- **Affects ALL callers of `createCacheStore`**, not just BL-076's `UpstashIrlBodyCache`. Other consumers (`resource-cache.ts`, etc.) also gain the visibility — backward-compatible at the contract level since the behavior on failure is still "return false."

**Acceptance** (in-session):

- 5 new unit tests at [`tests/unit/lib/upstash-cache-store-error-logging.test.ts`]: success path does NOT emit the failure event; throw path returns false AND emits with the actual error message; reason is truncated to 300 chars; non-Error throw values are handled; byte-length field is the JSON-wrapped envelope size (not just the raw value).
- 1460 mcp-server tests green; tsc clean.

**Operator follow-up**:

1. Deploy 0.30.2 to staging.
2. Operator re-runs the same `gst_irl_ingestion` exercise that produced the BL-077a `outcome: write-returned-false` event with `wrangler tail` active.
3. The new `upstash.set.failed` event appears with the actual Upstash error in `reason`. Three most-likely:
   - `REQUEST_TOO_LARGE` / `PAYLOAD_TOO_LARGE` → 64KB body wrapped in `{storedAt, data: <JSON-escaped body>}` exceeds Upstash REST request size limit. BL-077c fix: bypass the envelope for IRL body cache, OR compress the body before storing.
   - `MAX_DAILY_REQUEST_SIZE_LIMIT_EXCEEDED` / quota error → staging Upstash plan quota hit. BL-077c fix: bump plan or rotate to a separate DB.
   - `WRONGTYPE` / `NOAUTH` / network error → auth / config issue. BL-077c fix: rotate token or check binding.
4. Paste the `upstash.set.failed` event back; file BL-077c with the targeted root-cause fix.

**Risks**: low. One extra `safeLog` call per failed Upstash write; no behavior change on the success path. Existing log volume on staging is bounded since failed writes are the exception, not the rule.

---

## 0.30.1 — 2026-06-07 — BL-077a `UpstashIrlBodyCache` fail-loud + diagnostic instrumentation

**Theme**: post-BL-076 staging incident — three back-to-back `prepare_irl_body` → `compose_dossier_envelope` pairs all surfaced `Bl076BodyCacheMissError` on compose despite prepare returning the correct deterministic hash each time. Underlying `CacheStore.set` swallows Upstash write failures and returns `false`; pre-BL-077a, `UpstashIrlBodyCache.set` ignored the return value, so failed writes silently surfaced as confusing downstream cache misses. **No public contract change** — this is a patch release that converts the silent failure into an actionable structured error AT the moment of failure + emits diagnostic `safeLog` events that `wrangler tail` captures for root-cause analysis (see BL-077b follow-up for the actual fix once diagnosis lands).

**Surface impact**:

- **NEW: `IrlBodyCacheWriteFailedError`** exported class with `cause: 'write-returned-false' | 'readback-null' | 'readback-mismatch'`. Thrown by `UpstashIrlBodyCache.set` when either (a) the underlying `CacheStore.set` returns `false`, OR (b) the new read-after-write probe finds the just-written value isn't readable, OR (c) the read-back value doesn't match what was written. Surfaced through `prepare_irl_body`'s handler as `{ isError: true, content: [<BL-077a diagnostic>] }`.
- **NEW: read-after-write probe** in `UpstashIrlBodyCache.set` — one extra `CacheStore.get` immediately after the write to confirm the value is readable. Diagnostic-only; remove after BL-077b ships the root-cause fix. Cost: ~50–100ms extra per `prepare_irl_body` call.
- **NEW: `bl077.cache.set` + `bl077.cache.get` `safeLog` events** at every `UpstashIrlBodyCache` operation. Carries `storeId` (per-instance counter so cross-isolate correlation works — audit alt root cause #1), resolved Upstash key, outcome (`success` | `write-returned-false` | `readback-null` | `readback-mismatch` | `miss` | `hit`), body byte length, and TTL. All non-PII (key is `gst-mcp:irl-body:<16-hex-hash>`; bytes are structural).
- **NEW: `LogEvent` fields** `outcome` / `storeId` / `key` / `byteLength` / `readbackByteLength` / `ttlSeconds` (optional, additive — no other call sites affected).
- **`stdio` path unaffected**: `InMemoryIrlBodyCache` doesn't go through `CacheStore`, so neither the new throws nor the probe fire there.
- **No prompt-body, schema, or manifest hash changes.** Patch-level fix, no rebaseline.

**Acceptance** (in-session — no live exercise required):

- 1 new realistic-body round-trip test (3046-byte body matching the 2026-06-07 staging failure payload — catches envelope-shape regressions at unit-test time).
- 5 new BL-077a unit tests: `set` throws `IrlBodyCacheWriteFailedError(cause='write-returned-false' | 'readback-null' | 'readback-mismatch')`; `storeId` is unique per instance; happy-path round-trip still works through the new probe path.
- 1 new BL-076 integration test: `prepare_irl_body` surfaces the new error as `{ isError: true }` with `BL-077a` + `wrangler tail` substrings in the diagnostic.
- 1455 mcp-server tests green; tsc clean.

**Operator follow-up** (this is the whole point):

1. Deploy 0.30.1 to staging.
2. Operator runs `wrangler tail` against the staging Worker and triggers one `gst_irl_ingestion` exercise.
3. The `bl077.cache.set` / `bl077.cache.get` events expose the actual failure mode. One of three outcomes:
   - `outcome=write-returned-false` → Upstash auth/rate-limit/quota issue. Fix the Upstash binding or quota.
   - `outcome=readback-null` → envelope-shape mismatch in `CacheStore` wrap/unwrap, OR cross-region consistency gap. Fix the substrate.
   - `outcome=readback-mismatch` → serialization corruption. Inspect the byte-level diff.
4. File BL-077b with the tail output; ship the real fix.

**Risks**: low. Read-after-write probe adds one Upstash round-trip per `prepare_irl_body` call (~50-100ms). Acceptable diagnostic cost; intentionally removed in BL-077b. No schema or prompt changes; no manifest drift.

---

## 0.30.0 — 2026-06-07 — BL-076 `compose_dossier_envelope` body-by-hash latency reduction

**Theme**: cut model-emit latency on `compose_dossier_envelope` calls from 5–15 minutes to an estimated 1–3 minutes by removing the IRL body from the public tool input. The body now flows in through `prepare_irl_body` (which caches it server-side keyed by its canonical hash) and `compose_dossier_envelope` re-hydrates from the cache. Architecturally identical lever as BL-070 / BL-071: shift human-discipline / token-emit cost into system enforcement. **BREAKING** under [BL-032 § Q12 contract](../src/docs/development/_archive/MCP_SERVER_REMOTE_BL-032.md) but **operator-confirmed no external clients of `compose_dossier_envelope` exist** (2026-06-07); migration is internal-only (prompt body + tests).

**Surface impact**:

- **REMOVED**: `filledIrl` field from `ComposeDossierEnvelopeInputSchema` (public input). The engine-internal type `ComposeDossierEnvelopeEngineInput` still carries `filledIrl` for the engine's `runIrlProvenanceCheck` call — the handler re-injects the body after fetching from cache (audit M-1 — keeps the engine pure + ~30 existing engine tests unchanged).
- **NEW: `IrlBodyCache` interface + `InMemoryIrlBodyCache` + `UpstashIrlBodyCache`** at [`mcp-server/src/cache/irl-body-cache.ts`]. Stdio gets in-memory LRU (16 entries cap, process-lifetime); Worker gets Upstash KV (`gst-mcp:irl-body:<16hex>` prefix, 4h TTL). Per-entry size cap `IRL_BODY_CACHE_MAX_BYTES = 200000` enforced on `.set()` via `IrlBodyCacheSizeExceededError`. Worker path **FAILS FAST at server-construction time** when Upstash bindings are absent (audit R-3 — no silent in-memory fallback; isolate rotation would otherwise cause silent cache misses).
- **NEW: optional `irlBodyCache?: IrlBodyCache` field** on `MetricsContext` (symmetric with BL-071 `counters?`). Tests can inject directly via `ctx.irlBodyCache` on `createServer` ctx; production code uses the auto-construction logic.
- **NEW: `Bl076BodyCacheMissError`** exported class + wired into `compose_dossier_envelope` handler `instanceof` chain. Surfaces actionable diagnostic ("call `prepare_irl_body({ filledIrl })` first") when the model bypasses prepare. Counts as `rejected` in `serverToolCallCounts` (BL-071 identity preserved).
- **UPDATED**: `prepare_irl_body` handler signature gains optional `metrics?: MetricsContext` (matches the BL-071 compose handler signature pattern); writes body to `metrics.irlBodyCache?` after computing hash. Output schema (`{ irlBodyHash, byteLength }`) **unchanged** — BL-068 model-facing contract preserved.
- **UPDATED**: `prepare_irl_body` MCP annotations flipped `readOnlyHint: true → false` (audit R-2 — cache write is a side effect). `idempotentHint: true` stays (same body in → same cache state by construction).
- **UPDATED prompt body (v0.16.0 → v0.17.0)**: envelope-composition directive + interactive Step 4 rewritten to instruct prepare-then-compose ordering. Both bodies now reference `BL-076`, `prepare_irl_body` as a precursor call, and document `Bl076BodyCacheMissError` as the cache-miss diagnostic.
- **Manifest hash rebaseline**: `7344f75e…` → `0e6c4e22…` (prompt `name@version` tuple drift; tool roster unchanged).
- **Body hash rebaseline**: 3 of 7 hash-stability scenarios drift (verbose-mode bodies that ship the envelope-composition directive: interactive, one-shot minimal, one-shot full). Compact + extract-only scenarios skip the directive per its header (`BLOCKING — full mode + verbose verbosity only`) and remain unchanged.

**External-client impact**: **NONE — operator confirmed 2026-06-07** no external callers of `compose_dossier_envelope` exist; surface is prompt-orchestrated. The `filledIrl` removal does not need a backward-compat shim.

**Acceptance** (in-session — no live exercise required):

- 13 new `InMemoryIrlBodyCache` + `UpstashIrlBodyCache` unit tests (round-trip, LRU eviction, recency reordering, per-entry size cap, custom TTL forwarding, fake-store Upstash impl).
- 7 new BL-076 integration tests at [`tests/integration/bl-076-body-by-hash.test.ts`]: prepare-then-compose chain works end-to-end; cache miss surfaces `Bl076BodyCacheMissError` with actionable text; cache miss counts as `rejected` in BL-071 server-arithmetic counters; hash-bind defense-in-depth post-rehydrate.
- 4 new prompt-body substring assertions (one-shot + interactive each) — `prepare_irl_body`, `BL-076`, `Bl076BodyCacheMissError`.
- 2 new protocol-roundtrip surface assertions (audit M-3): `compose_dossier_envelope.inputSchema` no longer publishes `filledIrl`; `prepare_irl_body.annotations` shows `readOnlyHint:false + idempotentHint:true`.
- BL-071 `bl-071-precheck-derivation.test.ts` adapted: backward-compat test repurposed to assert the new cache-miss behavior (BL-076 changes the legacy semantic — no cache → structured rejection, not silent envelope).

**Latency win**: independent token-count analysis estimates 40–80% reduction depending on body size — ~33–70% for typical 10–20KB bodies, ~75–85% for the 80KB bodies driving BL-074's representative-IRL exercises. Net per-call wall-clock: 5–15 min today → est. 1–3 min for typical runs, sub-90-sec for small ones.

**Risks accepted**:

- Worker 4h TTL — operator pauses > 4h surface confusing cache-miss errors; recovery is cheap (re-call prepare_irl_body). Tunable via env-binding.
- Stdio LRU=16 — operator iterating > 16 distinct IRL bodies in a session evicts oldest; recovery is cheap.
- Hash-bind post-rehydrate is structurally tautological (cache keyed by hash); defense-in-depth check remains as a future-cache-collision regression guard. BL-049 authority is preserved at the same level it held pre-BL-076 (`pass-bound` for `partner-paste-verbatim`, `pass-internal` for reconstruction modes).

---

## 0.29.0 — 2026-06-06 — BL-071 server-sourced `toolCallCounts` (closes BL-074 gate 2)

**Theme**: closes the second production-readiness gate from BL-074 — converts the model self-narrated `toolCallCounts` block (which has empirically drifted: sonnet-4-6 fabricated a `prepare_irl_body: transport-timeout` row when the tool was never called; opus-4-8 omitted `prepare_irl_body` from its self-report; a third run reported the same retry event inconsistently across two YAML surfaces) into a server-arithmetic snapshot the model copies verbatim. Same architectural lever as BL-070: shift human-discipline into system-enforcement.

**Surface impact**:

- **NEW: `ToolCallCounters` interface + `InMemoryToolCallCounters` default** at [`mcp-server/src/metrics/with-metrics.ts`]. Tracks four states per tool — `attempted` (at wrap entry), `succeeded` / `rejected` / `errored` (at wrap exit) — keyed by tool name. Backward-compatible: when `MetricsContext.counters` is undefined (legacy tests, NOOP path), `withToolMetrics` behaves exactly as before.
- **NEW: optional `counters?: ToolCallCounters` field** on `MetricsContext`. `withToolMetrics` records counter events on every wrap. `withResourceMetrics` and `withPromptMetrics` do NOT touch counters (tool-only scope today).
- **NEW: per-process counter wiring in `createServer`** — stdio path constructs a fresh `{ sink: NoopSink, counters: InMemoryToolCallCounters }` per server instance (process-lifetime scope = one Claude Desktop session); Worker path adds `counters: new InMemoryToolCallCounters()` to the existing context literal (per-request scope, correct for short-lived Worker isolates). The frozen `NOOP_METRICS_CONTEXT` singleton stays untouched — used by default-param slots in 14+ `register*` sites + tests.
- **NEW: `serverToolCallCounts` field on `ComposeDossierEnvelopeResult`** (and the structured/text tool output). Snapshot read at envelope-build time via `metrics.counters?.snapshot()` and embedded in the dossier output for the model to copy verbatim. The envelope tool itself appears in its own snapshot as `attempted: N, succeeded: N-1` (in-flight while computing — intentional, audit M1).
- **NEW: prompt body directive (v0.15.0 → v0.16.0)** instructs the model to (a) copy `serverToolCallCounts` VERBATIM into the BL-045-VERIFY block `toolCallCounts` field and (b) derive `precheck.iterations` (== `validate_irl_provenance.succeeded`), `precheck.attemptsTotal` (== `attempted`), and the count of `precheck.errorsEncountered` (== `rejected`) from the snapshot. The arithmetic identity holds because `validate_irl_provenance` is registered exactly once and the internal verification engine bypasses the wrapper (no spurious counter ticks). `toolCallCounts` template line gains the `errored: N` field at both invocation sites.
- **BL-070 self-degradation gap → server-detectable**: `Bl070VerbatimBodyRequiredError` rejections now appear in `serverToolCallCounts.compose_dossier_envelope.rejected`. A model that ignores the operator's `requireVerbatimBody: true` flag (passes false to the tool) cannot also fabricate the resulting rejection count in the server-arithmetic snapshot. The BL-075 reservation for server-side prompt-arg passthrough may now be redundant — re-evaluate after one live exercise.
- **Manifest hash rebaseline**: `e0642ea3…` → `7344f75e…` (prompt `name@version` tuple drift: 0.15.0 → 0.16.0).
- **Body hash rebaseline**: ALL 7 hash-stability scenarios drift — the `toolCallCounts` schema line lives in the BL-045-VERIFY directive which ships in every body shape (interactive + one-shot minimal + one-shot full + extract-only minimal + extract-only full + 2 compact variants).

**Acceptance** (in-session — no live exercise required):

- 5 new `InMemoryToolCallCounters` unit tests (aggregation, distinct-tool isolation, defensive-copy snapshot).
- 7 new `withToolMetrics` counter-integration tests (attempted-before-inner, success / rejected / errored outcomes, mid-flight snapshot semantics, arithmetic identity `attempted === succeeded + rejected + errored`, backward-compat when counters undefined, tool-only scope verification).
- 3 new BL-071 integration tests (`bl-071-precheck-derivation.test.ts`): counter increments survive end-to-end through `withToolMetrics` → handler; `compose_dossier_envelope` emits the snapshot in `serverToolCallCounts` with the in-flight `compose_dossier_envelope: { attempted: 1, succeeded: 0, ... }` shape; legacy call without `metrics` arg omits the field (backward-compat).
- 6 new prompt-body substring assertions (one-shot + interactive each): `serverToolCallCounts`, `precheck.iterations`, `errored: N`.
- BL-058 verify-block schema test updated for new `errored: N` field on `validate_irl_provenance` template line.

**Risks**: low. The counter scope is process-lifetime in stdio and per-request in Worker — both correct for BL-045-VERIFY semantics ("this session"). Map mutations are safe because (a) stdio = single JS event loop, (b) Worker counters are per-request — no cross-request contention. The snapshot read inside the envelope handler is not racing the `attempted`-at-wrap-entry record (same event loop).

---

## 0.28.0 — 2026-06-06 — BL-070 `requireVerbatimBody` forcing function + BL-073 NIST AI RMF acronym add-on

**Theme**: closes the first production-readiness gate from BL-074 — converts the "operator must remember to use partner-paste mode for accuracy-critical engagements" discipline into a system-enforced refusal. Bundles a small BL-073 add-on that surfaced empirically the same day (the 2026-06-06 fourth live exercise emitted `"NIST AI RMF"` as an acronym which the canonical-substring path missed; same false-negative class as UK GDPR / Australia Privacy Act that BL-073 already aliased).

**Surface impact**:

- **NEW: optional `requireVerbatimBody?: boolean` field** on `ComposeDossierEnvelopeInputSchema`. Defaults to `false`. When `true`, `runComposeDossierEnvelope` rejects any `irlSource !== 'partner-paste-verbatim'` with `Bl070VerbatimBodyRequiredError` (new exported class), surfacing a structured message directing operators to re-invoke with the IRL pasted as markdown into the `filledIrl` prompt arg.
- **NEW: `requireVerbatimBody?: boolean` prompt arg** on `gst_irl_ingestion`. Operators set it once per engagement; the model is instructed to forward it verbatim to `compose_dossier_envelope`. Self-degradation (model lying about the flag value) becomes operator-detectable from the VERIFY block — and will become server-detectable once BL-071 ships server-sourced `toolCallCounts.compose_dossier_envelope.rejected`.
- **NEW: prompt body directive** at both invocation sites (`ENVELOPE_COMPOSITION_DIRECTIVE` line 416 + interactive Step 4 line 939) explaining when to set the flag and how the model must forward it.
- **BL-073 acronym add-on**: `"aliases": ["NIST AI RMF", "NIST RMF"]` added to `src/data/regulatory-map/US-NIST-AI-RMF.json` — closes the fourth observed false-negative class. Codegen + duplicate-alias guard (already on master from BL-073) automatically validate. **Aliases are NOT in the manifest hash inputs**; no rebaseline driven by the alias change.
- **Manifest hash rebaseline**: `ba0f55ec…` → `e0642ea3…` (prompt `name@version` tuple drift: 0.14.0 → 0.15.0).
- **Body hash rebaseline**: 3 of 9 hash-stability scenarios drift (verbose-mode bodies that include `ENVELOPE_COMPOSITION_DIRECTIVE`). Compact + extract-only scenarios skip the directive per its header (`BLOCKING — full mode + verbose verbosity only`) and remain unchanged.

**Acceptance** (in-session — no live exercise required):

- 7 new BL-070 unit tests cover the gate: rejection on all three reconstruction-mode variants (xlsx + trimmed + placeholder), pass-through on partner-paste-verbatim, pass-through on omitted-default-false AND explicit-false, rejection text contains the offending `irlSource` + `BL-070` + `partner-paste-verbatim` directive.
- 1 new BL-073 acronym add-on test asserts `findFalsePositiveMapAbsentClaims` catches `"NIST AI RMF"` via the new alias on US-NIST-AI-RMF.
- 4 new prompt-body substring assertions verify `requireVerbatimBody` lands in both one-shot and interactive bodies, AND the prompt argsSchema accepts both `true` and `false`.

**Known limitation** (accepted-with-disclosure): model could self-degrade and pass `requireVerbatimBody: false` to the tool even when the operator set it to true at invocation. Mitigations: (1) prompt directive treats this as a violation, (2) operator detects from VERIFY block, (3) **once BL-071 ships** (next PR), server-sourced rejection counts make the self-degradation server-detectable arithmetic-wise. BL-075 reserved for server-side prompt-arg passthrough if empirical drift recurs.

---

## 0.27.0 — 2026-06-06 — BL-073 + `serverVersion`→`promptVersion` rename

**Theme**: two small unrelated cleanups bundled for operator-merge efficiency, both addressing empirical pain from the 2026-06-06 post-BL-067+BL-072 live exercise:

- **BL-073** — three frameworks have empirically failed the `findMatchedHubFramework` bidirectional substring match across multiple recent exercises (no normalized substring overlap exists between the model idiom and the Hub's canonical name): `"UK GDPR"` ↔ `"UK Data Protection Act 2018"`, `"Australia Privacy Act"` ↔ `"Privacy Act 1988 (as amended 2024)"`, `"EU AI Act"` ↔ `"EU Artificial Intelligence Act (Regulation 2024/1689)"`. Added optional `aliases?: string[]` field to `RegulationSchema` at `src/schemas/regulatory-map.ts`, populated curated aliases on the three failing JSONs, extended the matcher with a new `HUB_FRAMEWORK_INDEX` + `matchesEntry` design. Alias matching is **exact-equality on normalized form** (not substring) to avoid spurious matches on short curated forms; canonical-name bidirectional substring path is preserved verbatim so no current match regresses. Codegen guard in `scripts/generate-regulations-index.mjs` fails the build if any normalized alias appears in two entries (closes the only structural safety concern about alias collisions).
- **`serverVersion` → `promptVersion` rename** — the BL-045-VERIFY block template instructed the model to emit `serverVersion: <semver from the meta fence promptVersion family>` at both invocation sites. The field is mislabeled — it carries promptVersion, not the mcp-server package version. Operators were confused twice (sonnet-4-6 hallucinated `1.0.0`, opus correctly echoed `0.13.0` but the field name still implied mcp-server). Renamed the YAML key at both sites + expanded inline guidance ("NOT the mcp-server package version"). The JSON meta-fence already emits `promptVersion` separately so this creates one consistent value across both surfaces.

**Surface impact**:

- **NEW: `aliases?: string[]` on `RegulationSchema`** — optional field, additive. Populated on `GB-DPA.json` (`["UK GDPR", "UK General Data Protection Regulation"]`), `AU-PRIVACY-ACT.json` (`["Australia Privacy Act", "Australia Privacy Act 1988", "Australian Privacy Act"]`), `EU-AI-ACT.json` (`["EU AI Act", "EU AI Regulation"]` — bare `"AI Act"` explicitly NOT added; would be a foot-gun for any future entry whose normalized canonical name contains `"aiact"`).
- **`HUB_FRAMEWORK_INDEX` matcher refactor** at `mcp-server/src/schemas/compose-dossier-envelope.ts` — preserves canonical-substring semantics for all 123 existing entries; adds alias exact-equality as an additive net. `findMatchedHubFramework` returns the canonical name regardless of which match path fired.
- **Codegen duplicate-alias guard** at `mcp-server/scripts/generate-regulations-index.mjs` — fails the build if any two entries share a normalized alias.
- **VERIFY-block YAML field rename** at `mcp-server/src/prompts/irl-ingestion.ts:459,946` — `serverVersion` → `promptVersion` with expanded inline guidance. promptVersion 0.13.0 → 0.14.0.
- **2 existing "KNOWN GAP" tests flipped** to positive matches via aliases; 3 new BL-073 tests added (EU AI Act match, alias exact-equality lock-in, canonical-substring regression guard); 1 new integration test covers end-to-end alias rejection through `runComposeDossierEnvelope`.

**Manifest hash rebaseline**: `47f2ec348037b90b279fa9d181068e1f87154baeff2e873009a37307d34ee375` → `ba0f55ece3a6fe6618af556f80bf6224292c2d7806cea40ef4537b0628b949cb` (prompt `name@version` tuple drift — aliases are NOT in the manifest hash inputs).

**Body hash rebaseline**: ALL 7 hash-stability scenarios drift this PR (vs. only 3 in the BL-067+BL-072 rebaseline) — the VERIFY-block directive ships in every body shape, so the field rename affects interactive + 3 one-shot variants + 2 extract-only + 2 compact variants:

- `EXPECTED_HASH_INTERACTIVE`: `557886…` → `681aac607179e8963ac590f042fb4619f4cb7bbd8300d5b282ec8355e8d8b5e5`
- `EXPECTED_HASH_ONESHOT_MINIMAL`: `500f06…` → `a32ca2c2fd1e3811f37852116b0dbb39bf9cbeb75172640a5350bf051129b419`
- `EXPECTED_HASH_ONESHOT_FULL`: `564e4b…` → `bd383c5274d72a6ea5aa4a230a0489416ad4b712b8e9a17379adc7e5cfb3e190`
- `EXPECTED_HASH_EXTRACT_ONLY_MINIMAL`: `fdcbe2…` → `91c0ba7f2af9bba7785a495e72da2dd8f759f0a775e5262eed805a6c0f67151a`
- `EXPECTED_HASH_EXTRACT_ONLY_FULL`: `295834…` → `8ae7233f48dc054db7e89b74d5d842df31f529ca79b1d654e605358d66ed0f9b`
- `EXPECTED_HASH_ONESHOT_FULL_COMPACT`: `65d157…` → `ca28dad47ed8056bd6a3d02cef5241770f16e9394a66d8a1de89b2bee257e669`
- `EXPECTED_HASH_EXTRACT_ONLY_FULL_COMPACT`: `c064e9…` → `114d59487290d10f81e6bea895f1f266023264252978091523bbb5c04d874e81`

**Acceptance** (in-session — does not depend on a live exercise):

- New integration test `BL-073 — end-to-end alias rejection through runComposeDossierEnvelope` constructs a payload with all three alias false-positives in `gaps[]` and asserts `Bl068MapAbsentFalsePositiveError` lists all three offenders with the matched canonical Hub names. Proves the alias work flows from JSON → codegen → schema → matcher → rejection end-to-end without a live retest.
- Body-hash + manifest-stability tests green with the new constants.

---

## 0.26.0 — 2026-06-06 — BL-067 + BL-072 — citation regex enrichment + xlsx-reconstruction provenance-gap auto-append

**Theme**: two empirically-justified, structurally-small server-side improvements bundled because both surface findings from the 2026-06-05 post-BL-068 live exercises:

- **BL-067**: the citation regex `^Section (\d{2}|--)[^—]*—.{20,}$` at `mcp-server/src/schemas/diligence-audit.ts:133-138` produced retries on two distinct tools across two model tiers on the same day — `generate_diligence_agenda` 2/1 on sonnet-4-6 (wrong dash character) and `compute_techpar` 2/1 on opus-4-8 (insufficient excerpt length). Custom regex message rewritten with the BL-065-style forcing-function format (explicit em-dash vs hyphen guidance + length explanation + `Fix:` line) so the SDK-surfaced Zod error carries actionable correction instead of the generic "string does not match regex" default.
- **BL-072**: the opus-4-8 run produced a model honesty disclosure — in xlsx-reconstruction mode, `hashBindResult: pass-internal` is tautological because the model controls both `filledIrl` and `irlBodyHash` (the 2,815-byte trimmed reconstruction passed the hash check trivially against a 76,847-byte source xlsx). New required `irlSource` enum field on `ComposeDossierEnvelopeInputSchema` + explicit-Set auto-append in `runComposeDossierEnvelope` surface this disclosure as a structural artifact every reconstruction run carries, converting one-off model honesty into a per-run gap-list entry.

**Surface impact**:

- **`citationSchema` custom message rewritten** at `mcp-server/src/schemas/diligence-audit.ts:133-138`. No schema shape change; only the regex error string. Zero existing tests assert on the old message text. 3 new BL-067 unit tests assert the new message on hyphen-instead-of-em-dash + under-20-char failures.
- **NEW: `irlSource` required field** on `ComposeDossierEnvelopeInputSchema` with the same 4 enum values the prompt's VERIFY-block sketches already list at `src/prompts/irl-ingestion.ts:462,949` (single source of truth between prompt and schema): `partner-paste-verbatim | model-reconstruction-from-xlsx | model-reconstruction-trimmed | placeholder`.
- **NEW: BL-072 auto-append** in `runComposeDossierEnvelope` — when `irlSource` matches an explicit reconstruction set (`new Set(['model-reconstruction-from-xlsx', 'model-reconstruction-trimmed'])`), append a `provenance-gap:` entry to (J) naming the BL-049 hash-bind tautology. Explicit Set (not a `startsWith` prefix check) so a future enum addition forces a conscious decision rather than silently inheriting the auto-append.
- **Prompt body changes** — `ENVELOPE_COMPOSITION_DIRECTIVE` (line 416, shared constant covering all one-shot mode) and interactive mode's Step 4 (line 937) both get an `irlSource` directive instructing the model to populate the new field. promptVersion 0.12.0 → 0.13.0.
- **`IrlBodyHashMismatchError` rejection text** — new test asserts the BL-068 `Fix:` line referencing `prepare_irl_body`. (Existing behavior; new test only.)

**Manifest hash rebaseline**: `5bee38cc935fa3a1b987999ed9d467f250b1dc4eeeb3b1b5555bb5a3205adbd9` → `47f2ec348037b90b279fa9d181068e1f87154baeff2e873009a37307d34ee375` (prompt `name@version` tuple drift).

**Body hash rebaseline**: 3 of 9 hash-stability scenarios drift (only the verbose-mode bodies that include `ENVELOPE_COMPOSITION_DIRECTIVE`). Compact and extract-only bodies skip the directive per its header (`BLOCKING — full mode + verbose verbosity only`) and remain unchanged:

- `EXPECTED_HASH_INTERACTIVE`: `bf7a70d…` → `55788619032fa2979ba673f5ab5be1f090dafdef6d2b46cdfffa8708a57e2bfd`
- `EXPECTED_HASH_ONESHOT_MINIMAL`: `c84440cd…` → `500f065e3f758e6751d86ca45190e0e6be13c6f4ae379224a16ae1d7af806e4b`
- `EXPECTED_HASH_ONESHOT_FULL`: `8f126e4d…` → `564e4bbeeedba66f04922e6f2e38f6bd3a3746290b9cf1f4625e706ec6ee89ce`

**Acceptance** (next live exercise on the same IRL):

- `generate_diligence_agenda` and `compute_techpar` retries that previously cited "citation-format-invalid" or "lengthened-citation-excerpt" should drop. Target ≤1 retry per tool from this rule class.
- Any xlsx-reconstruction run produces a `provenance-gap:` entry in (J) naming the BL-049 hash-bind tautology — visible in the dossier markdown without depending on the model to volunteer it.
- Partner-paste runs continue to NOT show the BL-072 gap entry.

---

## 0.25.0 — 2026-06-05 — BL-068 — forcing-function redesign (prepare_irl_body preflight + map-absent server validation + schema description enrichment)

**Theme**: the original BL-068 proposal (prompt-only coaching) was BLOCKED in audit as repeating the BL-059 anti-pattern (prompt-only Rule 0 directive already failed empirically). The redesign ships two clean forcing-function mechanisms — a `prepare_irl_body` preflight tool to eliminate the BL-049 hash-bind retry, and server-side validation rejecting model-supplied `map-absent:` claims that point at Hub-backed frameworks — plus defense-in-depth Zod `.describe()` enrichment on the audit tier/citation fields. Rule 0 + Tier-1 first-emission discipline is **explicitly not addressed** in this PR; rationale documented inline at `runAuditRefinements` (reordering checks is a no-op for retry budget because BL-066's existing single-batch rejection already consolidates everything).

**Surface impact** (server-internal — no manifest hash change, no prompt change, no body hash change):

- **NEW: `prepare_irl_body` tool** — single-purpose preflight. Input: `{ filledIrl: string }` (≥200 chars). Output: `{ irlBodyHash: string, byteLength: number }`. Reuses `computeIrlBodyHash` from `compose-dossier-envelope.ts:59` — single source of truth for sha256+slice(0,16). Tool description directs the model to call this FIRST before `compose_dossier_envelope`. **Framing**: this is retry-elimination ergonomics on top of the existing `IrlBodyHashMismatchError` forcing function, NOT a new forcing function. Compliant models drop the hash-bind retry; non-compliant clients still hit the existing rejection (now with a `Fix:` line steering them to the preflight).
- **`IrlBodyHashMismatchError` rejection text enriched** — appended `Fix: call \`prepare_irl_body\`...` line so the rejection itself directs the model to the new tool.
- **NEW: `Bl068MapAbsentFalsePositiveError`** in `compose_dossier_envelope` — rejects calls when any model-supplied `gaps[*].category === 'map-absent'` entry names a framework the Hub registry covers (per `isHubBacked` substring matching). Rejection text names the matched Hub framework so the model can correct. The 2026-06-05 retest produced 4 model-supplied `map-absent:` claims with 2 confirmed false positives (NIST AI RMF + Australia Privacy Act, both in the Hub registry). Documented known false-negative: UK GDPR ↔ UK Data Protection Act 2018 equivalence is NOT caught (substring rule doesn't reach through); covered by future regulatory-map alias work.
- **Zod `.describe()` enriched** on `dimensionAuditBaseSchema.tier` and `.citation` (`mcp-server/src/schemas/diligence-audit.ts`). Field descriptions surface in `tools/list` per-field JSON Schema, adjacent to where the model binds the value — a third intervention surface distinct from prompt body (BL-059 anti-pattern) and tool description. Defense-in-depth coaching, NOT a forcing function.
- **`runAuditRefinements` JSDoc** — added a BL-068 future-contributor guard explaining that reordering checks (e.g., to run Rule 0 + Tier-1 first as a "structural pre-check") is a no-op for retry budget because the existing single-batch rejection already consolidates via `formatAuditIssues` + the BL-066 Rule-0 batch summary. The only first-emission improvement available is a separate preflight validator tool (reserved as BL-069).

**Manifest hash unchanged**: `5bee38cc935fa3a1b987999ed9d467f250b1dc4eeeb3b1b5555bb5a3205adbd9`. The plan initially projected a rebaseline (tool count 15 → 16), but the manifest hash is computed over **URIs + prompt name@version tuples only** (see `tests/integration/manifest-stability.test.ts:88-99`), NOT tool names. Adding a tool surface is a semver-as-contract change reflected in the version bump, but does not invalidate the manifest hash.

**Acceptance** (next live exercise on the same IRL):

- `compose_dossier_envelope: { attempted: 1, succeeded: 1 }` for compliant models (preflight eliminates hash-bind retry).
- New tool surface: `prepare_irl_body: { attempted: 1, succeeded: 1 }` appears in `toolCallCounts`.
- Gap list: zero false-positive `map-absent:` claims for NIST AI RMF and AU Privacy Act (UK GDPR remains the documented known gap).
- `generate_diligence_agenda: 2/1` remains the structural floor.

**Escalation triggers**:

- `compose_dossier_envelope` 3+/1 across 2 consecutive post-BL-068 exercises → BL-070 (server-derived `irlBodyHash`).
- `generate_diligence_agenda` 2/1 recurring across 3+ exercises with operator willingness to spend tool-call headroom → BL-069 (`validate_diligence_audit` preflight tool).

---

## 0.24.0 — 2026-06-05 — BL-066 — restore JSON Schema introspection + Rule-0 consolidated batch summary

**Theme**: BL-065 (v0.23.0) shipped server-side rejection-message enrichment for `generate_diligence_agenda` and traded `inputSchema` from `AuditedUserInputsSchema` to a permissive `z.object({}).passthrough()` so the handler could uniformly frame all rejections through `formatAuditIssues`. The 2026-06-05 post-deploy retest produced a **regression worse than the baseline it tried to fix**: `generate_diligence_agenda: 3/0` (zero successes) vs. the pre-BL-065 `5/1`. Root cause: the claude.ai MCP bridge type-coerces nested values (`_audit` object, `geographies` array) against the published per-field JSON Schema; with no per-field schema published, the bridge JSON-stringified them on the wire and the model could never recover the structural shape across three retries.

This release reverts the schema decision and ships the BL-064 audit's Option 3 in its cheapest form — a consolidated Rule-0 batch summary that fires when ≥2 Rule-0 offenders trip simultaneously, consolidating N independent `Fix:` repetitions into one pattern instruction.

**Surface impact** (server-internal — no manifest hash change, no prompt change, no body hash change):

- **`registerDiligenceTool` `inputSchema`** — `z.object({}).passthrough()` → `AuditedUserInputsSchema.shape`. The published JSON Schema now exposes the full 13-dimension shape + nested `_audit.properties` per-dimension structure, matching the registration pattern `compose_dossier_envelope` and `compute_techpar` use successfully. The MCP bridge regains the type hints it needs to send `_audit` as an object and `geographies` as an array on the wire.
- **`handleDiligenceTool` signature** — `(rawInput: unknown)` → `(payload: AuditedUserInputs)`. The handler's upfront `AuditedUserInputsSchema.safeParse` block is removed; structural validation happens at the SDK boundary before the handler runs. Only the BL-045 cross-field refinements remain in the handler body.
- **Removed dead helpers**: `zodIssueToRuleId`, `enrichZodMessage`, `zodErrorToAuditIssues` (introduced under BL-065 solely for the safeParse path). The BL-065 PR's CI typecheck failure (`'invalid_enum_value' → 'invalid_value'`, `PropertyKey[] → string[]`) was exactly the maintenance cost of keeping dead exported code typechecking against a moving Zod minor. If a future MCP SDK exposes a parse-error hook, restore from git (`git show e2ee304`).
- **NEW: Rule-0 consolidated batch summary** — `formatAuditIssues` now emits a `⚠️ Rule 0 batch (N dimensions): <names>` line when ≥2 issues carry `BL-045-TIER-3-REQUIRED-FOR-UNKNOWN`. The model sees one "fix N dims" instruction instead of N independent corrections, reducing the retry tax when Rule 0 fires broadly. The existing per-issue `Fix:` lines are unchanged.
- **`generate_diligence_agenda` restored to the BL-045 M8 contract** — the integration test `auditBearingTools` includes it again; the BL-065 companion test (asserting permissive schema + handler rejection) is replaced by a **new published-schema regression guard** that asserts `properties._audit.type === 'object'`, `properties.geographies.type === 'array'`, and that `_audit.properties` is non-empty — the load-bearing regression guard for BL-066. Future refactors that re-permissive-ify the schema fail this test.

**Manifest hash unchanged**: `5bee38cc935fa3a1b987999ed9d467f250b1dc4eeeb3b1b5555bb5a3205adbd9`. No URI or prompt `name@version` change.

**Acceptance** (next live exercise on the same IRL): `generate_diligence_agenda: { attempted: ≤2, succeeded: 1 }`. 1/1: ideal (bridge type-coerced natively, Rule-0 batch summary stuck on first retry). 2/1: acceptable structural floor (currency→bracket cascade). 3+/1: escalate to a deeper Option-3 structural pre-check that runs before `runAuditRefinements`'s sequential rules.

---

## 0.23.0 — 2026-06-06 — BL-065 — audit-rejection forcing-function hardening for `generate_diligence_agenda` (regressed; reverted at 0.24.0)

**Theme**: the 2026-06-06 post-deploy live exercise (the first run against `promptVersion: 0.12.0`, post-BL-064) produced `generate_diligence_agenda: 5/1` — 4 retries on a single dossier run. The recoveryActions included one direct Rule 0 violation (`corrected revenueRange tier to 3 (unknown sentinel requires tier 3)`) plus three other cross-field rejections (currency conversion missing, tier-1 literal mismatches, dataSensitivity missing piiCategoriesPresent). BL-059's Rule 0 prose in the prompt body did NOT prevent the violation — this is Scenario B from the BL-064 audit (Rule 0 as prose is WEAK). This release implements the audit-prescribed Option 1: server-side rejection-message enrichment that makes the rule self-documenting at the failure site.

**Surface impact** (server-internal — no manifest hash change, no prompt change, no body hash change):

- **`formatAuditIssues` preamble** — rewritten to demand all-issues-at-once fixes with a ⚠️ RETRY DISCIPLINE block. Tells the model that partial fixes will not converge and lists the issue count up front. Footer preserves the existing `"retry the tool call"` phrase the BL-045 M3 contract test asserts on.
- **`Fix:` terminal line on every rule** — each of the 10 cross-field rejection messages gains a canonical `Fix: <exact correction>` sentence so the model has a stable scannable instruction. The model recovers from explicit "do this" prose much faster than from "here's what's wrong" prose.
- **Rule 0 explicit naming** — the `BL-045-TIER-3-REQUIRED-FOR-UNKNOWN` consolidated message (firing across all 13 dimensions) now opens with `[Rule 0 — tier/value coupling]` and explicitly states the bidirectional rule (`value="unknown" ⇔ tier="3"`). Matches the "Rule 0" name BL-059's prompt-body Step 1b directive uses, so the model pattern-matches across attempts.
- **Zod-wrap layer** — structural Zod failures (missing required fields, wrong types, invalid enums) are now routed through the same `formatAuditIssues` framing as cross-field refinements via the new exported helpers `zodIssueToRuleId`, `enrichZodMessage`, `zodErrorToAuditIssues` in `diligence-audit.ts`. Each Zod issue maps to a synthetic ruleId (`BL-045-SCHEMA-INVALID-TYPE`, `BL-045-SCHEMA-INVALID-ENUM`, `BL-045-SCHEMA-MISSING-FIELD`, etc.) and gets a terminal `Fix:` sentence with the path interpolated. Previously the first retry — most often a structural failure — surfaced as a raw ZodError with no `Fix:` line and no Rule 0 awareness.
- **`handleDiligenceTool` signature change** — was `(payload: AuditedUserInputs)`; now `(rawInput: unknown)`. The handler runs `AuditedUserInputsSchema.safeParse(rawInput)` upfront and returns the rule-coded rejection on failure.
- **`registerDiligenceTool` `inputSchema` change** — was `AuditedUserInputsSchema`; now `z.object({}).passthrough()`. The SDK no longer rejects malformed payloads before the handler runs (the SDK validation was the layer producing the un-enriched first-retry rejection). Trade-off: this tool loses client-side JSON Schema introspection; agents are guided by the prompt body + TOOL_DESCRIPTION instead, which has always been the canonical guidance layer.
- **BL-045 M8 contract update** — `generate_diligence_agenda` is intentionally excluded from the `tools/list publishes _audit` test. The exclusion is documented inline; `compute_techpar` and `estimate_tech_debt_cost` remain on the M8 contract.

**Cascading-rule note (for post-deploy interpretation)**: the only genuine structural-floor case is `currency → bracket` — Rule 1 (`CURRENCY-CONVERSION-REQUIRED`) MUST be satisfied before Rule 2 (`REVENUE-BRACKET-MISMATCH`) or Rule 3 (`REVENUE-BRACKET-BOUNDARY`) can fire. A post-deploy run that fixes Rule 1 in retry-1 may surface Rule 2 or 3 in retry-2; this is the achievable minimum (2/1). DataSensitivity buckets are mutually exclusive (no cascade). Tier-1 ↔ Tier-3 share a field but operate on opposing values (no cascade). The BL-065 retry-rate acceptance target is `≤2/1` on the same IRL shape the 2026-06-06 retest used; `3+/1` indicates the messages still aren't sticking and escalation to a structural Rule-0 pre-check (BL-064 audit Option 3) is needed.

**Hash unchanged**: this is a server-internal improvement. Tool name, prompt name, prompt version, and Resource URIs are all unchanged. **Manifest hash stays `5bee38cc935fa3a1b987999ed9d467f250b1dc4eeeb3b1b5555bb5a3205adbd9`**; all 7 body hashes stay unchanged. The `manifest-stability` and `irl-ingestion-body-hash-stability` tests remain GREEN without any rebaseline — verified in the BL-065 PR CI.

**Test surface**: 18 new tests across `diligence-audit.test.ts` (BL-065 forcing-function framing describe block — preamble + per-rule `Fix:` lines + Rule 0 naming for both scalar and geographies) and the new `diligence-zod-wrap.test.ts` (handler-layer Zod-wrap path — garbage input, empty payload, null, wrong-typed field, multi-issue aggregation, no `<path>` placeholder leak, downstream cross-field layering preserved).

**Filed under**: BL-065 (closed via this PR). BL-059's empirical acceptance (≥3 live exercises) closes incrementally; this BL is acceptance data point #1's structural response.

---

## 0.22.0 — 2026-06-05 — BL-064 — batch-call discipline for `search_regulations` + `search_portfolio`

**Theme**: the 2026-06-05 live exercise's VERIFY block exposed redundant tool-call patterns. `search_regulations` 3/3, `search_portfolio` 3/3 — both sequential per-arg calls when batching would collapse to 1 call each. `search_regulations`'s schema ALREADY supported array batching (via the `StringOrStringArray` transform shipped with the regulatory-map schema); only the prompt was anti-batching by directing "ONCE PER FRAMEWORK." `search_portfolio` lacked the array support entirely. ICG 2/2 is the canonical empty-probe + seeded pattern per prompt line 750 — out of scope. `generate_diligence_agenda` 3/1 retries had `recoveryAction` shapes that match BL-059 Rule 0's target class; the VERIFY block was from a pre-BL-059-deploy run (user confirmed); no new coaching here.

**Surface impact** (minor — additive schema field + prompt-directive rewrite; back-compat preserved):

- **`SearchPortfolioInputSchema`** — `theme` and `engagement` widened from `z.string().default('all')` to a `StringOrStringArray` union (`z.string() | z.array(z.string())`) that transforms to `string[]` with default `['all']`. Mirrors the pattern at `src/schemas/regulatory-map.ts:60-68`. Back-compat: callers passing a scalar string (or omitting the field) get the same behavior they had before.
- **`handleSearchPortfolioTool`** — narrows the new array semantics inside the MCP boundary. `filterProjects` in `src/utils/filterLogic.ts` is shared with the website's portfolio page + `src/utils/portfolio-url.ts`; widening it to arrays would break both. Instead, the handler loops over each (theme, engagement) cartesian pair, calls the shared scalar `filterProjects` per pair, unions the results, and deduplicates by project id. `['all']` short-circuits to the scalar `'all'` "no filter" sentinel. Zero website touches.
- **`buildPortfolioDeeplink`** — emits the FIRST element of each array as the deeplink's `theme` and `engagement` URL params. The website's portfolio URL contract is single-value; multi-value batching is a server-side optimization, not a deeplink primitive. Documented limitation; widening the URL encoding is out of scope.
- **`.describe()` prose** — both `theme` and `engagement` rewritten to document the union shape so MCP introspection guides agents correctly. The BL-031.95 buy-side/sell-side natural-language mapping prose is preserved; the "run TWO separate searches" anti-batching directive at the end of `engagement.describe()` was rewritten to "pass BOTH in a single call as `engagement: ['Buy-Side', 'Sell-Side']`."
- **Prompt body** — both `buildFullBody` (Step 2 + Step 3) and the interactive body Step 2b + Step 2c are rewritten to instruct ONE batched call with array filters; both directives include a worked example. The extract-only build path does not embed Step 2b/2c bullets — verified by the body-hash test (only 4 of 7 scenarios drift: interactive + 3 one-shot variants; the 3 extract-only variants are unchanged).

**Out of scope**:

- **ICG empty-probe elimination** — by design per prompt line 750; baking the 20-question schema shape into prompt prose would create drift risk.
- **`generate_diligence_agenda` retry coaching** — pre-BL-059-deploy stale data; BL-059's Rule 0 has shipped but is empirically unverified. Next post-deploy exercise is acceptance data point #1.
- **Per-framework `query` batching** — `search_regulations`'s `query` field is structurally per-name (substring scoring); only `jurisdiction` + `category` are batchable. Documented in the directive.

**Versioning**: `mcp-server` 0.21.0 → 0.22.0 (additive schema field, back-compat); `gst_irl_ingestion` prompt 0.11.0 → 0.12.0. Manifest hash + 4 of 7 body hashes re-baselined (the 3 extract-only scenarios stay stable because their build path doesn't embed Step 2b/2c).

**Test surface**: 6 new BL-064 unit tests in `tests/integration/portfolio-handler.test.ts` covering: single-string→array normalization; multi-element array passthrough; default `['all']` back-compat; union semantics + dedup for multi-theme calls; `['all']` short-circuit equivalence; multi-side `engagement` ambiguity-friendly batching; deeplink first-element-only emission. Existing `SearchPortfolioInputSchema` defaults test updated for the new `['all']` shape.

**Filed under**: BL-064 (closed via this PR).

---

## 0.21.0 — 2026-06-05 — BL-063 — server-side enforcement of `defaultFiredFrameworks` at `compose_dossier_envelope`

**Theme**: the 2026-06-04 post-BL-058/060/061/062 retest exposed three implicit-rule violations in the model's `defaultFiredFrameworks` reporting (EU_AI_ACT in both `fired` and `defaultFiredFrameworks`; SOC 2 listed as a "default-fired framework" despite being a certification; NIST AI RMF + Canada AIDA listed despite absence from the Hub regulatory map per BL-057). Initial directive-prose-only response (BL-063 v1) was assessed by an impartial code-reviewer audit as WEAK — prose rules added to an already-lengthy verify-block directive are unlikely to change behavior when the failure mode is silent. This release implements the audit-recommended approach: server-side enforcement at the tool seam, matching the BL-058 forcing-function pattern.

**Surface impact** (minor — additive schema field + handler rejection + meta-fence carrier; no behavior change for pre-BL-063 callers omitting the new field):

- **`ComposeDossierEnvelopeInputSchema`** gains `defaultFiredFrameworks: z.array(z.string()).optional().default([])` next to `conditionalTriggersFired`. Back-compat: omitting the field is accepted.
- **Three server-side rules in `runComposeDossierEnvelope`**:
  - **Partition rejection** — `Bl063PartitionViolationError` thrown when any framework appears in both `conditionalTriggersFired` and `defaultFiredFrameworks` (normalized matching so case + whitespace + punctuation differences don't dodge the check).
  - **Scope rejection** — `Bl063CertificationNotRegulationError` thrown when any entry matches the certification blocklist (SOC 2 / SOC 1 / ISO 27001 / ISO 27002 / ISO 27017 / ISO 27018 / ISO 27701 / PCI-DSS / FedRAMP / HITRUST / CSA STAR / Cyber Essentials, all normalized).
  - **Hub-backing auto-degrade** — entries without a matching Hub regulatory-map record (via the `gst://regulations/*` registry) are STRIPPED from the rendered meta fence AND auto-appended to (J) as `map-absent:` gap entries with a follow-up pointing to BL-057's coverage-gap sweep. Not a rejection — the dossier still ships, but the partner sees the coverage gap transparently.
- **`renderMetaFence`** emits `defaultFiredFrameworks: [...]` carrying only Hub-backed entries.
- **Tool handler** (`tools/compose-dossier-envelope.ts`) maps the two new error classes to `isError: true` MCP responses with the diagnostic message verbatim, matching how `IrlBodyHashMismatchError` is surfaced.
- **Prompt body BL-062 directive prose** at the verify-block site is rewritten in both one-shot and interactive paths to document the now-structural enforcement (model knows the tool will reject/auto-append non-compliant submissions). Per the audit recommendation: "Keep the directive prose, but as model-facing documentation of a rule that is now structurally enforced."

**BL-057 interaction (post-rebase)**: BL-057 shipped 3 new regulatory entries (NIST AI RMF, UK pro-innovation AI framework, Chile Ley 21.719) immediately before this PR. The Hub-backing auto-degrade now matches those entries via `isHubBacked()`'s bidirectional substring matcher — the retest's NIST AI RMF + UK + Chile entries will partition as `backed` rather than auto-degrading. Canada AIDA remains map-absent (BL-057 dropped it after WebSearch confirmed Bill C-27 died on the Order Paper); any future `defaultFiredFrameworks: ["AIDA"]` entry will still auto-degrade.

**Acceptance criterion**: the next live exercise's `compose_dossier_envelope` call either passes the three checks OR is rejected with one of `BL-063-PARTITION-VIOLATION` / `BL-063-CERTIFICATION-NOT-REGULATION`. The retest's exact failure pattern (EU_AI_ACT in both + SOC 2 in defaultFiredFrameworks + NIST AI RMF + Canada AIDA) reproduces as: 2 rejections (partition + scope) → model corrects → 1 entry (AIDA only, since NIST AI RMF is now Hub-backed) auto-degrades to `map-absent:` in (J).

**Versioning**: `mcp-server` 0.20.0 → 0.21.0 (additive schema + handler; no behavior change for pre-BL-063 callers); `gst_irl_ingestion` prompt 0.10.0 → 0.11.0. Manifest hash + all 7 body hashes re-baselined (BL-062 directive prose lives in both verify-block sites, so every body path drifts).

**Test surface**: existing tests + 12 new unit tests covering the three rules (partition: 3 normalization-edge cases + non-overlap happy path; scope: 7 certification cases + similar-name happy path; Hub-backing: NIST AI RMF case + meta-fence stripping + Hub-backed happy path; back-compat: empty list + omitted field).

**Filed under**: BL-063 (closed via this PR). BL-059 acceptance over ≥3 live exercises remains operator-driven; BL-058's enriched VERIFY block carries the diagnostic data.

---

## 0.20.0 — 2026-06-05 — BL-057 — regulatory-map coverage-gap sweep (AI governance + Chile data protection)

**Theme**: BL-057 was filed 2026-06-04 against gaps surfaced by the v13 partner-paste live exercise: NA AI-governance diligence saw EU AI Act fire but no NA-jurisdiction analogue, and Chile-exposed targets saw only the legacy 1999 Law 19.628 (CL-LAW19628). Inventory pass against the existing 120-framework map reduced the BL stanza's named gap list of 8 to 4 (Colorado AI Act, NYC AEDT LL144, Illinois HB 3773, California SB 942 already covered). Authoring then dropped to 3 after WebSearch verification of Canada AIDA's status (see scope-reduction note below).

**Surface impact** (additive — 3 new `gst://regulations/*` URIs; no tool/schema/runtime change):

- `gst://regulations/us/nist-ai-rmf` — **NIST AI Risk Management Framework 1.0** (US federal voluntary framework; the de-facto compliance baseline for US AI deployers, increasingly cited by state laws like Colorado AI Act).
- `gst://regulations/gb/ai-framework` — **UK Pro-Innovation Approach to AI Regulation** (regulator-led, non-statutory; effective date `2024-02-06` = government White Paper response publication).
- `gst://regulations/cl/ley21719` — **Chile Law 21.719 on the Protection of Personal Data** (comprehensive GDPR-aligned replacement for the 1999 regime; effective `2026-12-01`; creates the Agencia de Protección de Datos Personales with administrative fining powers).

**Scope reduction — Canada AIDA dropped**: BL-057 stanza named Canada AIDA (Bill C-27) as a missing AI-gov entry. WebSearch verification confirmed Bill C-27 died on the Order Paper when Parliament was prorogued in January 2025, and the April 2025 snap election did not re-table the bill — Canada has no federal AI framework in force or in active passage as of mid-2026. Authoring `CA-AIDA.json` would surface a phantom framework to operators. NA AI-gov coverage for Canadian targets continues via `CA-QC-LAW25` (Quebec Law 25, which has AI clauses) and the new `US-NIST-AI-RMF` for cross-border alignment. This matches the `verify-against-reality-not-docs` discipline: doc-vs-doc rigor would have authored the entry; live verification caught the staleness.

**Taxonomy decision**: `"ai-governance"` is already an enum value in `RegulationCategorySchema` with 19 prior entries; no new top-level theme added. AI-gov entries ride under the existing theme. The BL stanza's open taxonomy question resolved to "ride under existing" because inventory confirmed the theme is established.

**Acceptance**:

- A partner running diligence on a US-headquartered AI-deploying target now sees `US-NIST-AI-RMF` fire alongside EU AI Act + state-level laws (`US-CO-AI-ACT`, `US-IL-AI-EMPLOYMENT`, `US-NY-LL144`) — no transparent miss on US AI-gov coverage. ✓
- A partner running diligence on a Chile-exposed target sees `CL-LEY21719` fire — the new comprehensive data-protection law previously absent from the map. ✓
- A partner running diligence on a UK-exposed target sees `GB-AI-FRAMEWORK` fire — closing the previously-unbacked UK AI surface. ✓
- Free-text queries via `search_regulations`: `"NIST AI RMF"` → `us-nist-ai-rmf`; `"Ley 21.719"` → `cl-ley21719`; `"UK AI"` → `gb-ai-framework`. ✓
- BL-063 Hub-backing: `defaultFiredFrameworks: ["NIST AI Risk Management Framework", "Chile Ley 21.719", "UK Pro-Innovation AI"]` now substring-match the new entries via `isHubBacked()` — previously gap-degraded as map-absent. ✓ (Once BL-063 lands; BL-063 PR not yet merged at the time of this BL-057 PR.)

**Versioning**: `mcp-server` 0.19.0 → 0.20.0 (additive Resource URIs are a contract surface per BL-032.5 Phase 4 discipline). Prompt versions unchanged. Manifest hash re-baselined. Regulation count 120 → 123.

**Filed under**: BL-057 (closed 2026-06-05).

---

## 0.19.0 — 2026-06-04 — BL-059 — Rule 0 tier-discipline coaching for `generate_diligence_agenda` (audit-corrected scope)

**Theme**: the 2026-06-04 post-BL-058/060/061/062 retest produced the diagnostic data BL-059 was waiting on. `toolErrors` carried two `arg-shape-rejection` entries for `generate_diligence_agenda` (3 attempted / 1 succeeded), with concrete recovery actions naming the failure shape: `rebucketed-revenue-to-unknown-datasens-to-low-and-downgraded-tier1-derivations-to-tier2` and `set-revenueRange-tier-to-3-for-unknown-sentinel`. The dominant retry-tax cause is tier/value coupling — the model didn't know upfront that `value: "unknown"` REQUIRES `tier: "3"` (the schema at `diligence-audit.ts:410-417` enforces this and rejects clearly).

**Surface impact** (minor — additive directive prose + one worked-example row change; no tool/schema/runtime change):

- **Rule 0 (`generate_diligence_agenda` Step 1b)**: new universal rule documenting the tier/value coupling across all 13 dimensions. Pairs with the existing server-side Zod enforcement — the schema is the safety net, the coaching shortens the discovery loop. Audit verdict: EFFECTIVE.
- **Step 1a worked example refinement**: `operatingModel` changed from `tier: "2"` + value `"centralized-eng"` to `tier: "3"` + value `"unknown"` per impartial-audit refinement (the existing example showed only tier-1/tier-2 rows; adding the tier-3 case demonstrates the coupling that drove ~2 retries per call).

**Audit-corrected scope (per impartial code-reviewer agent, 2026-06-04)**:

- **BL-063 directive changes (partition + scope + Hub-backing rules for `defaultFiredFrameworks`) initially in this PR were REVERTED**. Audit verdict: WEAK as prose-only. The 2026-06-04 retest produced implicit-rule violations on all three axes without any directive prose; explicit directive prose is unlikely to change behavior because the model already had similar implicit signals in the surrounding directive. The correct lever is server-side schema enforcement in `compose_dossier_envelope` (partition check via set intersection, scope check via certification allowlist, Hub-backing auto-degrade via `gapsToAppend` array). Refiled as open BL-063 for the schema-expansion implementation; this BL-058-style forcing function is the right architectural pattern, not prose.
- **BL-059 forward-coverage paragraphs** (for `compute_techpar`, `assess_infrastructure_cost_governance`, `validate_irl_provenance`, `compose_dossier_envelope` hash-bind) **deferred** to future iterations once retest data surfaces concrete failure shapes for those tools. Audit verdict: prose coaching for unobserved retry patterns is speculative; ship coaching against evidence, not hypothesis.

**Acceptance criterion** (audit revision — averages over ≥3 live exercises): median retry rate ≤ 0.2 per tool; zero `arg-shape-rejection` retries on `generate_diligence_agenda` driven by tier/value coupling violations; any `compose_dossier_envelope` retry must categorize as `hash-bind-retry` (legitimate structural retry path), not `arg-shape-rejection`.

**Versioning**: `mcp-server` 0.18.0 → 0.19.0 (additive directive prose, no behavior change for any tool); `gst_irl_ingestion` prompt 0.9.0 → 0.10.0. Manifest hash + 3 of 7 body hashes re-baselined (interactive + 2 extract-only paths unchanged because Step 1a/1b lives only in `buildFullBody`).

**Filed under**: BL-059 (initial scope shipped; full acceptance pending operator-driven ≥3-run measurement). BL-063 refiled as open with server-side enforcement scope.

---

## 0.18.0 — 2026-06-04 — BL-060 + BL-061 + BL-062 — three VERIFY-block field additions per audit-corrected grouping

**Theme**: the 2026-06-04 post-BL-058 retest produced a clean enriched VERIFY block — and immediately exposed three follow-up gaps the new observability surface let us see. BL-058 carried the diagnosis-cycle win; this release carries the corrections the live data revealed. All three changes are VERIFY-block schema edits sharing one rebaseline cycle. Each was reviewed by an independent code-reviewer agent before implementation and revised per audit findings.

**Surface impact** (additive YAML in the verification artifact; no tool/schema/runtime change):

- **`toolErrors` block (BL-060, new top-level list)**: per-attempt diagnostic detail for the failed-attempt counts in `toolCallCounts`. Shape: `[{tool, attemptNumber, errorClass, recoveryAction}]`. **Partitioned from `precheck.errorsEncountered`** (per audit revision — original draft allowed overlap as "convenience"; corrected to strict partition where precheck failures stay in the precheck-specific list and `toolErrors` excludes them). Defined `errorClass` vocabulary: `arg-shape-rejection`, `hash-bind-retry` (legitimate compose_dossier_envelope structural retry path, not a coaching gap), `transport-timeout`, `transport-disconnect`, `tool-internal-error`. **Arithmetic ground-truth check**: `count(toolErrors where tool == T) MUST equal toolCallCounts.T.attempted - toolCallCounts.T.succeeded` for every tool — operators verify this arithmetic to detect model self-report under-reporting. **Compaction fallback**: if `response.compactionEvents > 0`, the list MAY be partial with `<partial-due-to-compaction>` as the first entry's `errorClass`.

- **`response.compactionEvents` (BL-061, new field in existing `response:` block)**: `<int | null>` three-state field for host-triggered auto-compaction observability. **Epistemic-honesty correction** (per audit revision — original draft asserted "model can detect the discontinuity"; audit corrected because post-compaction the host re-prompts with a synthesized summary as if it were prior context, no labeled seam). Three valid states with strict semantics: `<int > 0>` (positive reason to believe N events occurred), `0` (positive reason to believe none), `null` (genuinely cannot tell — preferable to `0` under uncertainty). The asymmetry is documented in the rule prose: false-negatives defeat the field's purpose; `null` is always preferable to `0` when uncertain.

- **`conditionalTriggers.defaultFiredFrameworks` (BL-062, new field in existing block)**: `[<framework name>]` for Section-09-enumerated frameworks fired via the gate-5 evidence path (GDPR, UK GDPR, PIPEDA, POPIA, Australia Privacy Act, etc.). **Resolves the BL-058 vocabulary collision**: the directive defines exactly EU_AI_ACT and NIS2 as conditional triggers (named constants `EU_AI_ACT_CONDITIONAL_TRIGGER` and `NIS2_CONDITIONAL_TRIGGER`); Section-09 frameworks are a parallel evidence path, not triggers. BL-058's broad-sounding `considered:` field name suggested operators should expect all applicable frameworks there — they shouldn't. The two lists now partition cleanly. **Option A picked explicitly** (per audit revision — additive field, no breaking change to BL-058 consumers; Option B's `{name, kind}` tagged-entry approach was rejected as a breaking change to downstream YAML parsers).

**Acceptance criterion**: the next live exercise's VERIFY block carries `toolErrors`, `compactionEvents`, and `defaultFiredFrameworks` populated correctly. Specifically: `toolErrors` arithmetic check passes against `toolCallCounts`; `compactionEvents` reports `null` honestly when uncertain rather than defaulting to `0`; `defaultFiredFrameworks` lists every framework named in IRL Section 09.

**Versioning**: `mcp-server` 0.17.0 → 0.18.0 (additive observability surface); `gst_irl_ingestion` prompt 0.8.0 → 0.9.0. Manifest hash + all 7 body hashes re-baselined.

**Filed under**: BL-060 + BL-061 + BL-062 — three independent BLs filed and audit-corrected same day, then implemented as one PR per audit-corrected grouping. BL-059 (tool-arg coaching) ships separately as the directive-behavior fix that uses BL-060's `errorClass` data as its diagnostic input.

---

## 0.17.0 — 2026-06-04 — BL-058 — enriched BL-045-VERIFY block (five new field families) for self-sufficient diagnosis

**Theme**: the 2026-06-04 retest exposed a diagnosis-cycle anti-pattern. A live exercise surfaced three distinct pathologies (model passed literal `"PLACEHOLDER"` as `filledIrl`; provenance check showed 37/37 verified against a model-reconstructed body; `conditionalTriggersFired: []` for an EU-AI-Act-applicable target) — but the operator-engineering exchange to triage required several follow-up paste cycles to get the body source, the precheck attempt outcome, the continuation context, and the trigger consideration set. The VERIFY block is supposed to be the single artifact that makes engineering Q&A unnecessary. It wasn't carrying enough signal. The operator named this directly: "isn't that the entire point of the verify section?" Correct. This release enriches the schema to carry every signal needed for self-sufficient triage.

**Surface impact** (minor — additive YAML in the verification artifact; no tool/schema/runtime change):

- **`filledIrl` block** (new): `bytes` + `source` (`partner-paste-verbatim` | `model-reconstruction-from-xlsx` | `model-reconstruction-trimmed` | `placeholder`) + `fingerprint.headChars` / `tailChars` (first/last 120 chars, newlines escaped as `⏎`). Operators cross-check the submitted body against the partner-sent source-of-truth. Catches reconstruction drift + placeholder bypasses without engineering Q&A.
- **`precheck` block** (BL-058 expansion of BL-056): `iterations` (successful calls only) + `attemptsTotal` (including failures) + `outcome` (`converged` | `hit-cap` | `never-attempted` | `abandoned-after-error`) + `errorsEncountered: [{errorClass, recoveryAction}]`. Replaces flat `precheckIterations` line.
- **`toolCallCounts` block** (new): per-tool `{attempted, succeeded, rejected}` ground-truth cross-check on self-reported counters. Catches model self-report unreliability — operators compare `validate_irl_provenance.succeeded` against `precheck.iterations`.
- **`conditionalTriggers` block** (BL-058 expansion): `considered` + `fired` + `suppressedWithRationale: [{trigger, whyNot}]`. Replaces flat `conditionalTriggersFired` list. Empty `considered` for an AI-deploying target is itself a red flag.
- **`gatesElided` block** (BL-058 expansion): structured `[{tool, rationale}]` form replacing the deprecated bare list-of-strings.
- **`response` block** (new): `continuations` + `verifyBlockEmissionPoint` (`final-continuation` | `mid-stream`). Catches truncation pathologies that invalidate the audit artifact.
- **`runScenario`**: new `xlsx-reconstruction` value joins the existing `partner-paste` | `interactive-paste-request`.
- Rule-discipline prose for every block added/expanded in both schemas (one-shot directive + interactive Step 5).

**Acceptance criterion**: the next live exercise's VERIFY block carries enough signal that the engineering triage cycle is one paste — no follow-up Q&A on body source, precheck attempt outcome, trigger consideration, or continuation context. Operators verify by attempting to triage a known-failed run from the VERIFY block alone.

**Versioning**: `mcp-server` 0.16.1 → 0.17.0 (minor — additive observability surface; no behavior change for any tool, schema, or directive other than the verify-block schema itself); `gst_irl_ingestion` prompt 0.7.1 → 0.8.0. Manifest hash + all 7 body hashes re-baselined.

**Test surface**: existing 1264 tests + new field-presence unit tests for each new field across both verify-block sites (~40 new assertions).

**Filed under**: BL-058 — VERIFY-block forcing-function expansion driven by 2026-06-04 retest diagnosis cycle.

---

## 0.16.1 — 2026-06-04 — BL-056 — `precheckIterations` field added to BL-045-VERIFY block

**Theme**: the v13 partner-paste live exercise (2026-06-04) shipped a clean dossier (21/21 verified citations, 0 unverified, 0 fabrications, `selfCorrectionCalls: 0`), but the VERIFY block is consistent with both "precheck converged after N iterations" AND "precheck not run at all." Operators reading the artifact alone cannot distinguish post-BL-051-healthy from pre-BL-051-anti-pattern. The missing diagnostic is the count of `validate_irl_provenance` calls before `compose_dossier_envelope`.

**Surface impact** (minor — additive field on the verification artifact):

- **Both BL-045-VERIFY schemas** (one-shot at the body-rewrite directive, interactive at Step 5) gain a `precheckIterations: <int>` line under `firstEnvelopeCall` / above `selfCorrectionCalls`.
- **One rule bullet** appended to the one-shot rules list explaining: healthy band is 1–3 on a thorough partner-paste IRL; `0` means BL-051 elision; `4` (the cap) means precheck could not converge; high count + `selfCorrectionCalls: 0` is the healthy post-BL-051 pattern; low count + high `selfCorrectionCalls` is the pre-BL-051 anti-pattern resurfaced.
- **One reporting-discipline paragraph** added to the interactive Step 5 directive mirroring the one-shot rule.
- No tool schema change. No engine/runtime change. Field is model-self-reported (same epistemic class as `meaningfulRecallsHaveDifferentInputs`).

**Acceptance criterion**: the next live exercise's VERIFY block includes a populated `precheckIterations` line. Pattern audit: if `0` shows up consistently, BL-051 directive needs reinforcement; if `4` shows up, the 0.90 stopping threshold is too aggressive for real IRL coverage and we re-tune.

**Versioning**: `mcp-server` 0.16.0 → 0.16.1 (minor — additive observability field; no behavior change for any tool, schema, or directive other than the verify-block itself); `gst_irl_ingestion` prompt 0.7.0 → 0.7.1. Manifest hash + all 7 body hashes re-baselined (verify-block schema appears in every body path).

**Test surface**: existing test count + 1 unit test asserting `precheckIterations:` literal presence in both verify-block schemas.

**Filed under**: BL-056 — observability follow-up to BL-051/052/053.

---

## 0.16.0 — 2026-06-04 — BL-053 follow-up — array-form coaching in precheck directive + tier-discipline message branching + array-form integration test

**Theme**: a code-review pass after the BL-051 + BL-053 + BL-052 PRs surfaced three follow-up improvements (all minor severity individually; collectively they finish making BL-053 a first-class citizen of the precheck workflow):

1. **The precheck directive never told the model the array form exists.** A model optimizing for BL-051's 90% stopping threshold has a perverse incentive to demote a multi-bullet claim into N single-string entries — same number of unverified verdicts, but it lies about how many distinct claims the dossier rests on AND dodges BL-053's strict any-unverified-wins aggregation. The fix coaches the model: use array form for genuine multi-bullet derivations; do NOT split arrays into singles to dodge aggregation.
2. **Tier-discipline auto-append messages were misleading for the partner-supplied + array cases.** A declared-tier-1 + all-partner-supplied array fires `tier-mismatch:` with the message _"the citation excerpt is not a substring of the IRL body"_ — false; the citation IS anchored, just to a partner-form input. Array-form failures said "the citation excerpt" singular giving the model no signal which element of N failed.
3. **No integration test exercised the array form through the MCP transport.** All 16 BL-053 unit tests run against the engine directly. Zod `z.union([string, array(string)])` is a known MCP-client serialization edge case (some clients flatten union types to `any`).

**Surface impact** (minor — additive prompt-body coaching + engine-message branching + integration test):

- **`ENVELOPE_PRECHECK_DIRECTIVE`** gains a "Multi-bullet claims (BL-053 array form)" paragraph explaining the array form's aggregation rule, when to use it, when NOT to use it, and the demote-to-singles anti-pattern.
- **`INTERACTIVE_BODY` Step 3a** gains a single-sentence array-form mention for symmetry with the standalone directive.
- **`runComposeDossierEnvelope` auto-append messages** (`tier-mismatch` and `tier-fabrication`) branch on derived tier:
  - `derived === 'partner-supplied'` → message states "the citation is partner-supplied (`Section --` sentinel), not a literal IRL bullet" and the follow-up surfaces tier-2-with-partner-supplied as an acceptable resolution.
  - Array form → message appends element count ("citation is a 3-element array — at least one element did not anchor in the IRL").
- **`tests/integration/protocol-roundtrip.test.ts`** gains a new test that calls `validate_irl_provenance` through the SDK + protocol layer with a mixed payload (single-string entry + 2-element verified array + 2-element one-fabricated array) and asserts the verdict echoes back the original citation shape unchanged (catches the flatten-to-any failure mode at the transport layer).
- No tool schema change.

**Acceptance criterion**: a v13+ live exercise on a derivation-heavy IRL sees the model adopt the array form for genuine multi-bullet claims (`(K)` provenance footer shows `[N citations]` entries) AND tier-mismatch failures surface accurate diagnostics that point the model to the correct corrective action.

**Versioning**: `mcp-server` 0.15.2 → 0.16.0 (minor — additive directive paragraph + auto-append message refinements that lift the user-facing diagnostic quality; BL-053 is now first-class in the precheck workflow); `gst_irl_ingestion` prompt 0.6.2 → 0.7.0. Manifest hash + 3 body hashes re-baselined (INTERACTIVE, ONESHOT_MINIMAL, ONESHOT_FULL).

**Test surface**: 1261 mcp-server tests pass (+1 new integration test; existing engine unit tests for tier-mismatch/tier-fabrication continue to pass — the message branching is additive within the same auto-append logic).

**Filed under**: BL-053 follow-up code-review findings (no separate BACKLOG entry — improvements are documented inline in the BREAKING_CHANGES theme above).

---

## 0.15.2 — 2026-06-04 — BL-051 post-PR bugfix — precheck directive `{filledIrl, claims}` → `{filledIrl, citations}` + schema-prompt consistency regression guard

**Theme**: a code-review pass after the BL-051 + BL-053 + BL-052 PRs merged surfaced a blocker-severity bug: the BL-051 precheck directive instructed the model to call `validate_irl_provenance` with `{filledIrl, claims}` at both prompt-body sites (`ENVELOPE_PRECHECK_DIRECTIVE` line 397 used by `buildOneShotBody`; `INTERACTIVE_BODY` Step 3a line 866). The actual schema field is `citations`. On the first BL-051 precheck call in production the model would have issued `claims:`, received Zod schema rejection, and burned the precheck iteration budget on a schema-mismatch loop — bypassing the entire BL-051 architecture. The bug shipped in PR #220 and went unnoticed because the prompt-body hash-stability tests lock the literal string but no test cross-references the literal against the schema.

**Surface impact** (patch — prompt-body string fix + regression-guard test addition):

- `mcp-server/src/prompts/irl-ingestion.ts` — both sites corrected to `{filledIrl, citations}` with a brief shape-clarification phrase ("pass each claim as a `{path, citation}` entry in the `citations` array").
- `mcp-server/tests/unit/prompts/irl-ingestion.test.ts` — new `describe('BL-051 schema-prompt consistency: precheck directive references real schema fields')` block with three tests:
  1. One-shot body contains `{filledIrl, citations}` and NOT the historical `{filledIrl, claims}` bug.
  2. Interactive body Step 3a contains `{filledIrl, citations}` and NOT the historical bug.
  3. The field name in the rendered body's `{filledIrl, X}` pattern matches `Object.keys(ValidateIrlProvenanceInputSchema.shape)` — locks the prompt-body field-naming to the schema's source of truth, so any future schema rename (e.g., `citations` → `entries`) forces the prompt body to be updated in lockstep.
- No tool schema change. No engine change.

**Versioning**: `mcp-server` 0.15.1 → 0.15.2 (patch — bug fix + regression guard); `gst_irl_ingestion` prompt 0.6.1 → 0.6.2. Manifest hash + 3 body hashes re-baselined (INTERACTIVE, ONESHOT_MINIMAL, ONESHOT_FULL — the 3 envelope-bearing verbose body shapes that include the precheck directive); extract-only + compact paths unchanged.

**Test surface**: 1260 mcp-server tests pass (+3 new regression-guard tests).

**Filed under**: BL-051 post-PR bugfix (no separate BACKLOG entry — bug-class is documented inline in the BREAKING_CHANGES theme above).

---

## 0.15.1 — 2026-06-04 — BL-052 — BL-045-VERIFY block clarity (transport-vs-iteration discriminator)

**Theme**: post-BL-051 the envelope-precheck workflow targets `selfCorrectionCalls: 0` as the healthy state (the model converges citation correctness on the cheap verifier; the envelope is called once on the clean set). When `selfCorrectionCalls > 0`, operators currently cannot distinguish two qualitatively different scenarios:

1. **Healthy in-flight refinement** — the model called the envelope multiple times AND each call had progressively cleaner inputs (claims tightened, gaps revised, citations re-anchored). Legitimate iteration.
2. **Transport thrash** — the model called the envelope multiple times with identical or near-identical inputs (timeout retried, response not received, tool-error retry loop). Operator/transport issue worth flagging — the model did the work twice, not better twice.

The BL-045-VERIFY block lacked the signal to disambiguate. BL-052 adds it.

**Surface impact** (patch — prompt-body directive only):

- BL_045_VERIFY_DIRECTIVE (standalone, used by `buildOneShotBody` + `buildExtractOnlyBody`) gains a new field: `meaningfulRecallsHaveDifferentInputs: <bool — true | false | null>`. Semantics fully documented in the directive's Rules block, including post-BL-051 healthy-target framing.
- INTERACTIVE_BODY's inline Step 5 BL-045-VERIFY block schema gains the same field with the same semantics.
- All 7 prompt-body shapes re-baselined (directive appears in every body shape via the standalone constant + the inline Step 5 stanza).
- No tool schema change. The verify block is operator-grade YAML inside the model's response text — adding a field to the schema documentation in the prompt body is a clarity tightening, not a load-bearing behavior change.

**Acceptance criterion**: a subsequent live exercise with deliberate iteration produces a verify block where `selfCorrectionCalls` matches the operator's observed iteration count AND `meaningfulRecallsHaveDifferentInputs` correctly disambiguates healthy iteration (`true`) from transport thrash (`false`). When `selfCorrectionCalls: 0`, the field is `null`.

**Versioning**: `mcp-server` 0.15.0 → 0.15.1 (patch — additive prompt-body directive field); `gst_irl_ingestion` prompt 0.6.0 → 0.6.1. Manifest hash + all 7 body hashes re-baselined.

**Test surface**: 1257 mcp-server tests pass (no test additions — the change is prose-only directive expansion).

**Filed under**: BL-052 (`src/docs/development/BACKLOG.md`).

---

## 0.15.0 — 2026-06-04 — BL-053 — citation array form on `compose_dossier_envelope` + `validate_irl_provenance` (multi-bullet claim support)

**Theme**: pre-BL-053 the verifier rejected multi-bullet claims as non-substring even when every supporting bullet existed in the IRL — the model's natural citation style joins multiple supporting bullets with semicolons but the substring check then fails the aggregate. The structural false-negative forced the model into bad workarounds: under-attribute (cite only the first bullet), misrepresent provenance (drop to `Section --` partner-supplied sentinel), or accept inflated `unverified` flags. BL-053 closes the gap at the schema layer.

**Surface impact** (minor — additive schema change; backward-compatible):

- **`compose_dossier_envelope.claims[].citation`**: now `string | string[]` (1-8 elements). String form unchanged; array form is verified per-element with strict aggregation.
- **`validate_irl_provenance.citations[].citation`**: same union shape, same per-element + aggregation behavior. Lets the BL-051 envelope-precheck workflow exercise multi-bullet claims on the fast verifier consistently.
- **Aggregation rule** (per-claim verdict from per-element verdicts):
  - ANY element `unverified` → aggregate `unverified` (weakest verdict dominates failure).
  - ALL elements `partner-supplied` → `partner-supplied`.
  - ALL elements `verified` verbatim → `verified`.
  - Mixed `verified` + `partner-supplied` (no fuzzy, no unverified) → `verified`.
  - Any `verified-fuzzy` in the mix → `verified-fuzzy`.
- **Tier-discipline preserved**: declared tier-1 + any element fails substring → `tier-mismatch:` auto-append (existing rule, now element-aware). Declared tier-2 + derived fabrication → `tier-fabrication:` (BL-049 v11 Finding B closure, now element-aware).
- **`(K)` provenance footer rendering**: array-form citations render as `[N citations] elem1 ; elem2 ; …` so partners see at a glance which claims rest on multi-bullet derivations.
- **`ValidateIrlProvenanceVerdict.citation`**: type widened to `string | string[]` (echoes back the original shape so callers can attribute verdicts to their emitted citation structure unchanged).

**Acceptance criterion**: a v13+ live exercise on a derivation-heavy IRL (TechPar/ICG/Tech Debt verdicts that cite multiple supporting bullets) should see verification rate lift to ≥85% as the model adopts the array form for multi-bullet claims that previously rode the structural false-negative.

**Versioning**: `mcp-server` 0.14.0 → 0.15.0 (minor — additive schema change; existing single-string call sites unchanged). Prompt body NOT bumped — no prompt-body change required to make the array form available, although future prompt-body work could direct the model to prefer the array form for multi-bullet claims. Manifest hash + all body hashes unchanged (no prompt name/version drift).

**Test surface**: 1257 mcp-server tests pass (+16 new BL-053 tests covering aggregation rule cases, schema acceptance/rejection, tier-discipline interaction, mixed-shape calls, and footer rendering).

**Filed under**: BL-053 (`src/docs/development/BACKLOG.md`).

---

## 0.14.0 — 2026-06-04 — BL-051 — envelope precheck via `validate_irl_provenance` (citation iteration on the fast tool before the heavyweight one)

**Theme**: the v12 SanFran live exercise empirically established that the `compose_dossier_envelope` tool's input dictation cost (~30KB of claims + gaps + filledIrl + meta JSON) is the workflow throughput bottleneck. When the model iterates citation correctness directly on the envelope, each correction round re-dictates the entire input — minutes per cycle for a per-claim verdict refinement that is fundamentally small. BL-051 redirects the convergence loop to `validate_irl_provenance` (the purpose-built fast verifier — minimal input, per-claim verdict output), then calls the envelope ONCE on the clean set. Net effect: 1 envelope call instead of 2-5, verification rate lifts (each unverified claim got a real correction opportunity), workflow ships minutes faster.

**Surface impact** (minor — additive prompt-body directive; no schema/code change):

- **Prompt body**:
  - NEW `ENVELOPE_PRECHECK_DIRECTIVE` constant in `prompts/irl-ingestion.ts` — instructs the model to call `validate_irl_provenance` BEFORE `compose_dossier_envelope`, iterate citation corrections on the cheap verifier until `(verified + verifiedFuzzy + partnerSupplied) / total ≥ 0.90` OR 4 precheck iterations (whichever comes first), then call the envelope ONCE on the clean set.
  - Wired into `buildOneShotBody` (verbose mode) between `bodyBindingDirective` and `ENVELOPE_COMPOSITION_DIRECTIVE`.
  - `INTERACTIVE_BODY` gains an inline Step 3a equivalent immediately before the existing Step 4 mandatory envelope call.
  - Extract-only bodies are NOT touched (no envelope call there).
- **No schema/code change**: `validate_irl_provenance` and `compose_dossier_envelope` schemas + tool handlers are unchanged. Both tools already exist and are registered. The change is purely a workflow-discipline directive.
- **Acceptance criterion**: a v13+ live exercise on a derivation-heavy IRL should land `(verified + verifiedFuzzy + partnerSupplied) / total ≥ 0.88` on the FIRST `compose_dossier_envelope` call, with `selfCorrectionCalls: 0` and `totalEnvelopeCalls: 1` in the BL-045-VERIFY block.

**Versioning**: `mcp-server` 0.13.1 → 0.14.0 (minor — additive prompt directive lifts a load-bearing workflow property: throughput + verification-rate band on the first envelope call); `gst_irl_ingestion` prompt 0.5.3 → 0.6.0. Manifest hash + 3 body hashes (interactive, oneshot-minimal, oneshot-full) re-baselined; extract-only + compact-oneshot hashes unchanged (precheck is gated on verbose envelope-bearing bodies only).

**Test surface**: 1241 mcp-server tests pass. Existing `validate_irl_provenance` and `compose_dossier_envelope` tests continue to cover the tool behavior the directive instructs the model to invoke.

**Filed under**: BL-051 (`src/docs/development/BACKLOG.md`).

---

## 0.13.1 — 2026-06-04 — BL-049 partial revert — strand the unreachable xlsx/HMAC infrastructure; preserve the empirically-validated pieces

**Theme**: the BL-049 v12 SanFran live exercise (2026-06-04) revealed that the **HMAC-receipt + xlsx-canonicalized branch is structurally unreachable in the standard Claude Desktop + stdio topology**. The model executes in Anthropic's cloud-side Linux compute sandbox; the MCP server runs on the operator's host (Windows in this run). Attached files live in the model's sandbox at paths like `/mnt/user-data/uploads/...` that the host MCP server cannot read. Both delivery paths the BL-049 design assumed fail:

- `xlsxBase64`: the model's tool-call construction truncates strings >~10KB; ~65KB workbooks fail with `Bad compressed size` ZIP errors.
- `xlsxPath`: the cross-host filesystem boundary — the Windows server cannot resolve a Linux sandbox path.

This is not a Windows-specific problem — it's the default Claude Desktop topology, period. Without an MCP spec primitive for binary resource delivery OR a Claude Desktop attachment-to-host bridge (neither exists; no public roadmap), the receipt-mediated xlsx-canonicalized path has no operator-reachable form. The empirically-shipped v12 dossier ran on the partner-pasted path; the HMAC infrastructure never fired.

**Surface impact** (patch — additive removals; backward-compatible reduction to v0.12.0-shaped envelope with v11 Finding B closure retained):

- **Reverted**:
  - `extract_irl_from_xlsx` tool + schema + handler (file delete)
  - `mcp-server/src/lib/receipt-hmac.ts` (file delete)
  - `RECEIPT_HMAC_KEY` env binding in `worker.ts:Env`
  - `irlSource` + `receipt` schema fields on `compose_dossier_envelope`
  - `IrlReceiptInvalidError`, `IrlReceiptShapeError`, `assertReceiptSymmetry`, HMAC verify branch in the envelope engine
  - Step 0 xlsx-ingestion directive in `prompts/irl-ingestion.ts` interactive body
  - `irlSource` / `receipt` mentions in `ENVELOPE_COMPOSITION_DIRECTIVE`
  - Server registers 15 tools again (down from 16); `RECEIPT_HMAC_KEY` no longer in `Env`
- **Retained from BL-049** (empirically validated on the v12 partner-paste live exercise 2026-06-04):
  - `tier-fabrication` gap category + `deriveTier(verdict)` helper + tier-fabrication auto-append in `compose_dossier_envelope`'s engine. The v12 trace showed the model reading the verifier's tier-fabrication diagnostic and choosing to re-cite rather than demote — empirical evidence the v11 Finding B closure works on real model behavior.
  - `BL_045_VERIFY_DIRECTIVE` on every prompt body — the operator-grade audit artifact that made the v12 diagnostic workflow tractable.
  - `extractExcerpt` anchors on `lastIndexOf('—')` (BL-049 defensive hardening).
  - `normalizeForMatching` strips `/` and `+` to whitespace (BL-049 defensive hardening).
  - BL-052 tightening on the BL-045-VERIFY directive: cumulative-across-session count semantics + conditional-trigger preservation rules made explicit.

**Versioning**: `mcp-server` 0.13.0 → 0.13.1 (patch — additive removals; envelope schema reduces to v0.12.0 shape + tier-fabrication count field); `gst_irl_ingestion` prompt 0.5.0 → 0.5.1 (Step 0 directive removed, BL-045-VERIFY directive tightened). Manifest hash + all 7 body hashes re-baselined.

**Test deltas**: 1278 → 1241 (-37). Removed: receipt-hmac unit tests (15), extract-irl-from-xlsx parser tests (9), cross-tool integration tests (13). Updated: existing tests rebaselined for the 15-tool count + 0.5.1 prompt version + new body hashes. **Tier-discipline tests preserved** — the v11 Finding B closure remains under test coverage.

**Deferred work**: the xlsx-canonicalized hash-bind authority path is deferred indefinitely. BL-054 was filed and retired same-day on 2026-06-04 — a backlog item gated on external infrastructure with no public roadmap is a tombstone, not a queueable initiative. The architecture survives as a revisit blueprint at [`src/docs/development/_archive/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md`](../src/docs/development/_archive/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md); re-engage by re-reading that doc when an MCP spec primitive ships for binary-resource delivery OR Claude Desktop ships an attachment-to-host bridge OR the topology pivots away from Claude Desktop + stdio.

**Also in 0.13.1** — **BL-055 — hash-bind discipline split** (live-exercise empirical fix, 2026-06-04):

The v12 partner-paste live exercise surfaced a pre-existing structural gap in interactive-mode invocations: the prompt body has no `**Body-binding hash:**` directive (it can't — there's no `filledIrl` arg at prompt-build time), so the model has no authoritative external hash to copy. Pre-BL-055, the only legal `hashBindResult` values were `pass` (which falsely implied authoritative binding) and `IrlBodyHashMismatchError`. The model in v12 correctly refused to claim `pass` without a real directive, which manifested as a hard workflow blocker.

The fix distinguishes the two functions hash-bind actually serves:

- **`pass-bound`** — supplied `irlBodyHash` was copied verbatim from the prompt body's `**Body-binding hash:**` directive (one-shot mode where `filledIrl` was a partner-supplied arg). Hash binds to bytes the prompt SERVER computed from the partner's authoritative paste. Audit grade: high. Closes both v10's "model paraphrases body" failure mode AND function 2 ("bind to authoritative external source").
- **`pass-internal`** — no directive existed in the prompt body (interactive-mode invocation), so the model computed `sha256(filledIrl).slice(0,16)` itself from the body it intends to submit. Hash confirms internal consistency between body and citations the model submits — function 1 of hash-bind ("catch paraphrase between body and citations") still applies and is still valuable. Audit grade: medium (partner sees that the IRL bytes came from model reconstruction, not partner-pasted markdown). Crucially, this is the HONEST report for interactive-mode runs — it's not a fabricated authoritative bind, and the partner reading the dossier sees the provenance limit transparently.
- **`IrlBodyHashMismatchError`** — unchanged; the envelope rejected the call because `irlBodyHash` doesn't match `sha256(filledIrl)`. Re-cite or re-submit.

Surface impact (additive prompt-body directive expansion, no schema/code change):

- BL_045_VERIFY_DIRECTIVE: `hashBindResult` enum expanded; reporting-discipline rules added (don't claim `pass-bound` without a directive to copy from).
- Inline Step 5 verify block in INTERACTIVE_BODY: same enum + discipline.
- ENVELOPE_COMPOSITION_DIRECTIVE: annotated to explain one-shot vs interactive sourcing.

Prompt: 0.5.2 → 0.5.3 (patch — additive directive clarity, no contract change). Server stays at 0.13.1. Body hashes + manifest hash rebaselined.

**Theme**: closes the two real failure modes the v11 SanFran live exercise empirically exposed (after re-grounding the original "30 false-positive tier-mismatch" thesis against the actual transcript — see [`src/docs/development/_archive/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md`](../src/docs/development/_archive/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md) § "Empirical trace — v11 actual outcome"):

- **Finding A — operator-flow ambiguity.** When xlsx is attached but no `filledIrl` arg is supplied, the model improvises a body. v11's Call 1 passed the blank canonical IRL template; verifier correctly rejected 30 IRL-cited claims. Call 2 (self-correction with the populated body) was prepared but never fired. **Closed by `extract_irl_from_xlsx`** — gives the model an authoritative canonical body so Call 1 IS the successful call.
- **Finding B — tier-discipline gaming.** Inspecting Call 2's prepared input revealed the model demoted **17 originally-tier-1 claims to tier-2** between calls — converting damning `tier-mismatch:` gaps into routine `provenance-gap:` ones. The tier field was model-declared with no server enforcement. **Closed by `tier-fabrication:` auto-append** — the verifier derives effective tier from citation properties (substring → tier-1-literal; `Section --` sentinel → partner-supplied; neither → fabrication); demoting to tier-2 with a non-substring excerpt now produces `tier-fabrication:` instead of being silently absorbed.

**Surface impact** (minor — additive schema + new tool):

- **New tool `extract_irl_from_xlsx`** — base64 xlsx in, deterministic canonical-form markdown + `irlBodyHash` + HMAC `receipt` + `fillRatio` out. Reuses `parseIrlArticle` cross-tree from `src/utils/irl/parse-article.ts` (BL-044's canonical AST) so the section/bullet shape is single-sourced.
- **HMAC receipt** — new `mcp-server/src/lib/receipt-hmac.ts` (`computeReceipt`, `verifyReceipt`, `loadReceiptSecretOrThrow`). Reuses the existing constant-time `timingSafeEqual` polyfill from `admin/admin-auth.ts` for Workers-runtime portability. Truncated HMAC-SHA256 to 16 bytes (32 hex chars) — 128 bits of unforgeable receipt scoped to a single conversation. New Wrangler secret `RECEIPT_HMAC_KEY` (min 32 chars); fail-closed on tool invocation (not boot) so existing tests / callers without xlsx workflow keep working.
- **`compose_dossier_envelope` schema** — additive optional `irlSource: 'partner-pasted' | 'xlsx-canonicalized'` (default `'partner-pasted'` preserves today's behavior) + optional `receipt: /^[a-f0-9]{32}$/`. Engine enforces symmetric receipt presence at call time (`assertReceiptSymmetry`); xlsx-canonicalized branch additionally verifies the HMAC under the server secret. New errors: `IrlReceiptInvalidError` (model fabricated body + computed sha256 but lacks HMAC) + `IrlReceiptShapeError` (asymmetric receipt + irlSource).
- **`tier-fabrication` gap category (BL-049 v11 Finding B)** — added to `gapCategoryValues` enum. `deriveTier(verdict)` helper classifies effective tier from citation properties. Result includes `tierFabrications` count alongside `tierMismatches`.
- **Verifier defensive hardening** — `extractExcerpt` anchors on `lastIndexOf('—')` (handles multi-em-dash citations cleanly); `normalizeForMatching` strips `/` and `+` to whitespace so `cad/mo` and `hosting + infrastructure` decompose into word boundaries the fuzzy-run logic can use.
- **New env var `RECEIPT_HMAC_KEY`** in `worker.ts:Env` interface, threaded into `registerComposeDossierEnvelopeTool(server, metrics, secret)` and `registerExtractIrlFromXlsxTool(server, secret, metrics)`.

**Body changes** (prompt `gst_irl_ingestion` 0.4.0 → 0.5.0):

- Interactive body: new `## Step 0 — xlsx ingestion path` directing the model to call `extract_irl_from_xlsx` BEFORE the partner-paste request when an `.xlsx` is attached; threads its outputs through `compose_dossier_envelope` with `irlSource: 'xlsx-canonicalized'` + `receipt`.
- One-shot body: `ENVELOPE_COMPOSITION_DIRECTIVE` documents the new `irlSource` + `receipt` input contract.
- New `BL_045_VERIFY_DIRECTIVE` appended to all bodies (interactive, one-shot, extract-only — both verbose and compact). Instructs the model to emit a single fenced `BL-045-VERIFY` block as the final content of every response, with a fixed YAML schema. Operator-grade verification artifact: ≤ 500 bytes, never truncates, single-block copy-paste. Replaces transcript archaeology.

**Versioning**: `mcp-server` 0.12.0 → 0.13.0 (minor — new tool + additive schema fields); `gst_irl_ingestion` prompt 0.4.0 → 0.5.0. Manifest hash + all 7 body hashes re-baselined.

**Test deltas**: 1241 → 1278 (+37). New: 15 receipt-hmac unit cases, 9 extract-irl-from-xlsx parser cases, 13 cross-tool integration cases (happy path, bypass attack, schema-shape, backward compat, tier-discipline regression). Updated: 4 existing cases (extractExcerpt last-em-dash semantics, tier-2 fabrication now surfaces tier-fabrication, tools list grew to 16).

---

## 0.12.0 — 2026-06-03 — BL-045 PR B audit-2 tightening — hash-bind forcing function + schema enum hardening

**Theme**: closes the v10 dossier compliance gaps and the impartial code-review audit-2 findings (1 BLOCKER + 6 MAJORS + 3 ALTERNATIVES). The previous v0.11.0 commit got the model to call `compose_dossier_envelope` and emit the meta fence + (J) + (K) — but the meta fence had hallucinated `promptVersion: "0.0.2"`, the `conditionalTriggersFired` array was over-populated with 7 entries (only `EU_AI_ACT` qualifies), and 25 of 29 claims came back as false-positive `unverified` because the model passed a paraphrased IRL as `filledIrl` rather than the verbatim bytes.

**Surface impact** (minor — schema-breaking on `compose_dossier_envelope` inputs):

- **Hash-bind forcing function (BL-2 via ALT-1)** — schema requires a new `irlBodyHash` field; prompt body embeds `**Body-binding hash:** <16hex>` directive (sha256 of args.filledIrl, first 16 hex chars). The tool computes `sha256(input.filledIrl).slice(0,16)` and rejects on mismatch via `IrlBodyHashMismatchError`. **Architecturally identical to the dimension-layer schema enforcement**: the model can't pass a paraphrased filledIrl because sha256 doesn't paraphrase.
- **Server-derived `promptVersion` (BL-1)** — schema field is now optional; tool handler reads canonical version from `irlIngestionPrompt.version` (leaf module, no circular-dep risk). Meta-fence rendering ignores whatever the model passes.
- **`conditionalTriggersFired` enum tightened (BL-3)** — `z.enum(CONDITIONAL_TRIGGER_NAMES)` where the const is exported from `extraction-rules.ts`. Future trigger additions are a single-edit-in-lockstep. Schema rejects `"GDPR"` / `"PIPEDA"` / etc. (v10 over-population mode).
- **`gatesPassed` + `forceToolsApplied` enums tightened (MA-5)** — `z.enum(ORCHESTRATED_TOOLS)`. Same maintenance-debt-elimination principle.
- **`modelVersion` regex (MA-2)** — `^[a-z][a-z0-9_-]*\d[a-z0-9_-]*$` rejects sentinel hallucinations (`""`, `"x"`, `"claude"`, `"unknown"`). Accepts canonical shapes (`claude-opus-4-7`, `gpt-4-turbo`).
- **Tier-mismatch surface (MA-6)** — tier-1 claim returning `unverified` is now its own gap category `tier-mismatch:` (structurally more damning than generic `provenance-gap:` because the model declared verbatim IRL bullet but cited a paraphrase or fabrication). Returns `tierMismatches` count in `provenanceVerification`.
- **Deterministic meta-fence key order (MI-1)** — manual line-by-line concat replaces `JSON.stringify`, making key order a property of source rather than V8 implementation.

**Body changes**:

- New `## Body-binding hash` directive in `buildOneShotBody` verbose mode.
- `ENVELOPE_COMPOSITION_DIRECTIVE` updated to reference the body-binding hash.

**Versioning**: `mcp-server` 0.11.0 → 0.12.0 (minor — schema-breaking inputs); `gst_irl_ingestion` prompt 0.3.0 → 0.4.0. Manifest hash + 6 of 7 body hashes re-baselined (interactive unchanged).

**Test deltas**: existing 12 tests for the envelope tool refactored for new signature + server context; +13 new tests covering hash-bind happy path / mismatch / IRL paraphrase rejection / schema enum rejection / modelVersion regex / promptVersion override; 1208 → 1238 test count after rebuild.

---

## 0.11.0 — 2026-06-03 — BL-045 PR B post-audit forcing-function tightening — `compose_dossier_envelope` tool

**Theme**: closes the dossier-rendering compliance gap empirically exposed by the v8 + v9 SanFran live runs. v9 produced A-grade content but no top-of-dossier meta JSON fence, no per-section `audit:` fences, and no `(K)` provenance footer — the verbose-mode body-rewrite 2/N + 3/N rendering directives were treated as descriptive context, not as a procedure. **Same finding the v2/v3/v4 dimension-layer traces produced**, now at the rendering layer.

**The fix** — apply the architectural pattern that solved the dimension-layer fabrication risk: externalize the structure into a tool input. The model can't compose the dossier without the envelope because the envelope IS what the model has to call the tool to produce.

**Surface impact**: **Additive — one new MCP tool + one new prompt-body directive.**

- New tool `compose_dossier_envelope` — pure (no engine, no Hub deeplink). Input: structured envelope inputs (meta-fence fields + categorized `gaps` + `claims` with per-claim citations + `filledIrl`). Output: three markdown blocks (`metaFenceMarkdown`, `gapListMarkdown`, `provenanceFooterMarkdown`) the model transcribes verbatim into the dossier, plus a `provenanceVerification` summary.
- **Internal provenance enforcement**: the tool calls `runIrlProvenanceCheck` against every claim's citation; unverified claims auto-append `provenance-gap:` entries to the (J) gap list. The provenance-citation self-check fires as a side-effect of calling the tool rather than relying on the model to remember the directive.
- New prompt-body directive `ENVELOPE_COMPOSITION_DIRECTIVE` — verbose-mode + full-mode only. Marks the tool call as BLOCKING and non-optional; specifies the transcription discipline (meta fence first, (J) before (K), (K) last).
- Interactive body gains a Step 4 mention of the tool so the orchestrates body-mention invariant holds across both interactive and one-shot bodies.

**Why this is the forcing function**: the BLOCKING-marked body directives in 2/N and 3/N (`META_JSON_FENCE_DIRECTIVE`, `PER_SECTION_JSON_FENCE_DIRECTIVE`, `PROVENANCE_FOOTER_DIRECTIVE`, `PROVENANCE_CITATION_SELF_CHECK_DIRECTIVE`) all still ship, but they're now supplemented by a tool call that PRODUCES the structural markdown. The model can ignore the directive prose, but it can't ignore a tool whose return value the body says to paste verbatim.

**Versioning**: `mcp-server` 0.10.1 → 0.11.0. `gst_irl_ingestion` prompt 0.2.0 → 0.3.0 (body materially changed; orchestrates extended). Manifest hash re-baselined (prompt version contributes to the manifest set). Body hashes re-baselined across all 7 scenarios.

**Test deltas**: +12 unit cases for the new tool's render functions and engine; tools-list assertion extended to 15 tools; prompts-registry KNOWN_TOOL_NAMES extended; orchestrates body-mention test passes for both interactive and one-shot bodies. All 1225 mcp-server tests pass.

---

## 0.10.1 — 2026-06-03 — BL-045 PR B audit remediation

**Theme**: impartial code-review pass identified 1 BLOCKER + 4 substantive MAJORS + 2 MINORS in the BL-045 PR B work. This commit lands the in-scope fixes per CLAUDE.md § 4a (no deferred tech debt).

**Surface impact**: **None — additive test coverage + bug-fix on an internal refinement rule.** No tool surface changed, no prompt body changed.

**Correctness fixes**:

- **B1 — Tier-1 literal-substring rule (`diligence-audit.ts:393-405`)**. The pre-fix check ran `citation.toLowerCase().includes(value.toLowerCase())` against the FULL citation. Two false-positive paths: (a) section-header prefixes (e.g., `Section 02 row 201-500 — …`) trivially matched the value, (b) short tokens like `"us"` matched as a substring of unrelated words (`"explicitly"`, `"businessmodel"`). Fix: new `citationContainsValueLiteral` helper extracts the post-em-dash excerpt and uses a non-alphanumeric-boundary regex, permitting internal hyphens so hyphen-bearing enum values (`b2b-saas`, `modern-cloud-native`, `customer-pii-at-scale`) still match.
- **M2 — Tier-1 rule extension to `geographies` array**. The pre-fix scalar loop skipped the array dimension entirely. A model could claim `tier=1` for `geographies: ["us","eu","uk"]` while citing only `"US"`. Fix: explicit loop validating every supplied geography appears as a literal token in the citation excerpt.
- **m1 — dead `HEADCOUNT_IDS` import** removed; `REVENUE_RANGE_IDS` retained as it's referenced via `(typeof REVENUE_RANGE_IDS)[number]`.

**Coverage additions**:

- **M1 — body-hash test extended with 2 compact-verbosity scenarios** (`tests/integration/irl-ingestion-body-hash-stability.test.ts`). Pre-fix all 5 scenarios used default verbosity; compact-mode bodies could silently regress into emitting verbose-only directives. Now hash-locked.
- **M6 — SOP dual-source drift guard** (`tests/integration/sop-dual-source-drift-guard.test.ts`). `src/data/library/irl-tool-input-mapping/article.md` and `mcp-server/src/docs/library/irl-tool-input-mapping.md` are byte-identical today; this test fails fast on drift with operator instructions for the intentional-divergence escape hatch.
- **M8 — `tools/list` round-trip assertion** (`tests/integration/protocol-roundtrip.test.ts`). The whole architectural justification for landing calibration refinements in handler bodies (rather than `.superRefine`) rests on the SDK publishing `_audit` in the JSON Schema. New test introspects the published schema for `generate_diligence_agenda` + `compute_techpar` + `estimate_tech_debt_cost`, asserts `_audit` appears in `properties` AND `required`. If any future refactor accidentally wraps the schema in `ZodEffects` the audit architecture silently degrades — this test catches that.
- **M3 — partner-supplied coupling guard** (`tests/unit/schemas/validate-irl-provenance.test.ts`). Pins the dependency between `buildPartnerSuppliedAudit` citation prose and the `isPartnerSupplied` dual-marker classifier. If a future kickoff/handoff prompt rev shortens the citation to omit `partner-supplied form input`, this test fails before partner-form citations start mis-classifying as `unverified`.
- **m2 — hyphen-in-enum normalization pin** added to the Tier-1 rule test surface.

**Explicitly deferred**:

- M4 unicode coverage (Turkish-i, German ß) — real but low-impact; live exercise will surface it if it bites in practice.
- M4 huge-IRL perf bound on `longestContiguousRun` — quadratic but at typical IRL sizes (~10k words) the bound is well under MCP tool timeout.
- M7 `any`-typed registry wrap — consistent with the pre-existing `ALL_PROMPTS: ReadonlyArray<GstPrompt<any>>` pattern; no regression.

**Manifest-hash impact**: unchanged.
**Body-hash impact**: unchanged.
**Test deltas**: +11 cases (1213 total, +0.9% from prior baseline).

---

## 0.10.0 — 2026-06-03 — BL-045 PR B Phase 2B — `validate_irl_provenance` tool

**Theme**: closes the M6 residual-fabrication gap honestly scoped during Phase 1/2. Structural audit refinements verify citation shape; this tool verifies citation truthfulness against the supplied IRL body.

**Surface impact**: **Additive**. One new MCP tool registered at server boot; no existing tool changed.

- New tool `validate_irl_provenance` — pure function (no engine call, no Hub deeplink). Input: `{ filledIrl, citations: [{ path, citation }] }`. Output: per-citation verdict bucketed into `verified` / `verified-fuzzy` / `partner-supplied` / `unverified` plus aggregate counts.
- Matching engine in `src/schemas/validate-irl-provenance.ts` exposes pure `runIrlProvenanceCheck(input)` for unit testing in isolation from the MCP transport. Algorithm: normalize both texts (lowercase, strip markdown noise, flatten dashes, collapse whitespace), test verbatim substring → `verified`. On miss, find the longest contiguous-word run from the excerpt that appears in the IRL; if ≥ `FUZZY_MIN_RUN` (8) → `verified-fuzzy`. Otherwise `unverified`. The 8-word threshold is empirically calibrated from the SanFran v5+ runs (real paraphrasings ≥12; fabrications ≤4).
- `Section --` + `partner-supplied form input` dual-marker discipline classifies kickoff/handoff partner-form citations as `partner-supplied` (no IRL anchor expected).

**Intended caller**: the model invokes this during its (K) provenance footer + provenance-citation self-check pass, supplying the load-bearing citations from `_audit` blocks. Unverified verdicts feed (J) gap-list `provenance-gap:` entries — the model either removes the dossier claim or honestly marks it open.

**Client migration**: none. Existing callers continue to work; new callers gain the tool.

**Manifest-hash impact**: unchanged (prompts list + Library/Regulation/Radar URIs unchanged; manifest hash does NOT include tool names).

**Body-hash impact**: unchanged.

**Test deltas**: 17 new unit cases in `tests/unit/schemas/validate-irl-provenance.test.ts` covering normalization round-trips, excerpt extraction, verbatim match, fuzzy boundary at FUZZY_MIN_RUN, partner-supplied dual-marker discipline, true-fabrication rejection, aggregate counts across mixed inputs. `tests/integration/protocol-roundtrip.test.ts` tools-list assertion extended to 14 tools.

---

## 0.9.0 — 2026-06-03 — BL-045 PR B — SOP promoted to Library Resource

**Theme**: the IRL → Hub Tool Input Mapping SOP (engineering-internal at `mcp-server/src/docs/library/irl-tool-input-mapping.md`) is promoted to a fourth Library Resource at `gst://library/irl-tool-input-mapping` so the model can fetch it via the standard MCP `resources/read` interface during IRL ingestion.

**Surface impact**: **Additive**. One new Library URI; no existing URI changed.

- New Resource: `gst://library/irl-tool-input-mapping` — engineering SOP body served at `text/markdown`, ~14KB.
- The SOP body is now codegenned from `src/data/library/irl-tool-input-mapping/article.md` into `src/content/library-data.generated.ts` at prebuild/pretest time, matching the existing Library article shape.
- `irlIngestionPrompt`'s `orchestrates` array is intentionally NOT extended in this commit — the model already embeds the IRL + VDR articles; the mapping SOP is reachable on-demand via `resources/read` rather than being force-embedded into every prompt body. (Body-embedding can be added in a follow-up if the model consistently misses the mapping cues without it.)

**Client migration**: none. Existing callers continue to work.

**Manifest-hash impact**: changed — new URI `gst://library/irl-tool-input-mapping` enters the sorted-URI set the manifest hash is computed over.

**Body-hash impact**: unchanged (irlIngestionPrompt's body did not change in this commit).

**Test deltas**: existing length-assertions in `tests/unit/library.test.ts`, `tests/integration/protocol-roundtrip.test.ts`, `tests/integration/resource-uri-stability.test.ts` updated from 3→4 Library URIs.

---

## 0.8.0 — 2026-06-03 — BL-045 PR B body rewrite (3/N): per-section JSON fences + (K) provenance footer + provenance-citation self-check

**Theme**: continues the body-rewrite work past `0.7.0`. This commit lands the three verbose-mode directives that close the design doc's "Body rendering strategy" scope: per-section audit JSON fences after each tool-backed dossier section, a (K) provenance footer mapping every load-bearing claim to its IRL anchor, and a final provenance-citation self-check that surfaces gaps in (J) rather than silently dropping them.

**Surface impact**: **None — additive prompt-body change**. Behavior added (verbose mode only — the default):

- `PER_SECTION_JSON_FENCE_DIRECTIVE` — full-mode only. Each tool-backed dossier section (C/D/E/F/G/H) now closes with a JSON code fence `audit: <letter>` carrying `{ tool, inputPayload, outputSummary, deeplink }` plus a self-check line. Failures surface in (J), not silently overwritten. (F) regulatory subsections emit one fence per framework.
- `PROVENANCE_FOOTER_DIRECTIVE` — both modes. New `(K) Provenance footer` section after (J), listing every load-bearing claim (monetary, headcount, regulatory framework, paradigm verdict, ICG maturity score, comparable engagement) with its IRL anchor in `Section NN row M: "<verbatim excerpt>" (tier T)` shape.
- `PROVENANCE_CITATION_SELF_CHECK_DIRECTIVE` — both modes. Final BLOCKING pass before emit: every (C)-(I) claim cross-checked against (K) anchors; unanchored claims become numbered `provenance-gap:` entries in (J). Common patterns called out: tool-output verbatims without (K) anchors, conditional-trigger frameworks without trigger-predicate anchors, comparables without dimension-justification anchors.

**Wiring**: `verbosity` arg threaded into `buildOneShotBody` + `buildExtractOnlyBody`. Compact mode elides all three directives (use case: piping the dossier JSON downstream to automation that doesn't need the audit prose).

**Client migration**: none. No new args. Existing callers benefit automatically (default `verbosity: verbose`).

**Manifest-hash impact**: changed (prompt version bumped `0.1.0` → `0.2.0`).

**Body-hash impact**: 4 of 5 scenarios re-baselined (interactive unchanged).

**Reference**: [design doc § Body rendering strategy, § Output structure (K)](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md).

---

## 0.7.0 — 2026-06-03 — BL-045 PR B body rewrite (2/N): 9 inclusion gates + meta JSON fence + tool-error degradation + 4-scenario voice cues

**Theme**: continues the body-rewrite work past `0.6.0`. This commit closes four design-doc directives that were specified but not yet body-rendered: numbered inclusion gates the model evaluates before each tool, a top-of-dossier meta JSON fence that turns every dossier into an auditable artifact, a tool-error degradation directive that prevents premature sweep abort on a single tool failure, and per-scenario voice cues with meaningful posture for each of buy-side / sell-side / value-creation / unknown.

**Surface impact**: **None — additive prompt-body change**. Behavior added:

- `INCLUSION_GATES_DIRECTIVE` — 9 numbered tool-gate predicates emitted in both full + extract-only bodies. The model evaluates each gate before its corresponding step.
- `META_JSON_FENCE_DIRECTIVE` — required JSON code fence at the top of every dossier with 12 structured fields (promptName, promptVersion, modelVersion, mode, verbosity, transactionContext, fixtureFillRatio, fixtureFillRatioStatus, gatesPassed, gatesElided, conditionalTriggersFired, forceToolsApplied). Downstream automation parses this fence first; cross-run comparison keys off this block.
- `TOOL_ERROR_DEGRADATION_DIRECTIVE` — full-mode-only. If a tool errors mid-sweep, emit the error verbatim, mark the section extraction-only, continue. The meta fence's `gatesPassed` entry for the failing tool becomes `{tool, errorVerbatim}` instead of the bare name.
- Expanded `VOICE_CUES` — each of the four `transactionContext` cues now carries 3 sentences with meaningful, distinct posture (sell-side credibility / buy-side confirmation / value-creation work-plan / unknown balanced-read).

**Client migration**: none. No new args. Existing callers benefit automatically.

**Manifest-hash impact**: unchanged.

**Body-hash impact**: 4 of 5 scenarios re-baselined (interactive unchanged).

**Reference**: [design doc § Tool inclusion gates, § Output structure, § Decisions](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md).

---

## 0.6.0 — 2026-06-03 — BL-045 PR B body rewrite (1/N): wrong-IRL detector pre-flight + (J) gap list + extract-only mode dispatch

**Theme**: with the audit architecture empirically validated across 7 SanFran runs, BL-045 PR B's remaining work is the design doc's body-rewrite scope. This commit lands the first batch: a structural fill-ratio pre-flight that fires BEFORE any extraction, a (J) gap-list directive emitted in every dossier, and a working `mode: 'extract-only'` dispatch through a new `buildExtractOnlyBody`.

**Surface impact**: **None — additive prompt-body change**. Behavior:

- `mode: 'full'` (default) — unchanged dossier flow, but now leads with the wrong-IRL pre-flight directive (model computes fill ratio; <15% halts, 15-40% partial-flag, ≥40% proceeds) and closes with the (J) gap list before voice/format directives.
- `mode: 'extract-only'` — NEW dispatch path. Emits worksheet + per-tool audited input-payload JSON fences + (J) gap list. NO tool invocations, NO synthesis prose. Use case: audit-trail JSON dump for downstream automation; partner inspection of model extraction before committing to a full sweep; single-section refinement.
- `mode` interactive (no `filledIrl`) — unchanged.

Specific changes:

- NEW `WRONG_IRL_DETECTOR_PREFLIGHT` constant — structural fill-ratio detector with 15%/40% thresholds; emitted at the top of both `buildOneShotBody` (renamed conceptually to `buildFullBody`) and `buildExtractOnlyBody`.
- NEW `GAP_LIST_DIRECTIVE` constant — categorizes gaps the dossier must surface (unknown dimensions, extraction-only fields, elided tools, conditional triggers, currency/annualization assumptions, map-absent regulatory items).
- NEW `buildExtractOnlyBody` function — full extraction discipline + per-tool JSON-fence emission, no tool invocations, no synthesis.
- UPDATED `build()` dispatch — three-way: interactive (no `filledIrl`) / extract-only (`mode: 'extract-only'`) / full (default).
- UPDATED body-hash stability test from 3 scenarios to 5 (interactive + 2× full + 2× extract-only) per design doc § Body rendering strategy.

**Client migration**: none. Callers that didn't supply `mode` continue to get full-mode behavior. The new extract-only mode is opt-in via `mode: 'extract-only'`.

**Manifest-hash impact**: unchanged.

**Reference**: [design doc § Output structure + § Body rendering strategy](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md).

---

## 0.5.1 — 2026-06-02 — BL-045 PR B Phase 2A: TechPar YTD arithmetic-consistency refinement

**Theme**: the SanFran v6 dossier (post-`0.5.0`) showed `compute_techpar`'s currency + per-field-annualization audit forces declaration but doesn't enforce that the declared period is _correct_. Model declared `ytdMonths: 4` for SanFran's Apr-2026 board view (assumed calendar-fiscal Jan-Apr); the IRL's recurring-revenue math (`$2.64M CAD/mo × 3 = $7.92M ≈ $7.86M YTD stated`) implies 3 months. Result: TechPar landed at 38.8% "Healthy, just under the 40% PE ceiling" when the math-correct ytdMonths=3 puts it at ~46% "Above zone, every point compresses EBITDA and exit value." A partner-misleading inversion hidden inside one declared field.

**Surface impact**: **ADDITIVE-required** when `annualizationSource: "ytd-annualized-with-period"`. Adds a required `ytdMathCheck` field to the per-monetary-field audit. Callers that already use the default `irl-annualized-stated` source (the partner-supplied path, including `gst_target_quick_look`) are unaffected.

For `compute_techpar`:

- New required field `_audit.{field}.ytdMathCheck` when `annualizationSource: "ytd-annualized-with-period"`:
  - `monthlyAnchorAmount` — the monthly anchor from the IRL the YTD claim should reconcile against (e.g., recurring revenue per month).
  - `monthlyAnchorCitation` — IRL citation for the anchor.
  - `ytdActualReportedAmount` — what the IRL says YTD is.
  - `ytdActualReportedCitation` — IRL citation for the reported YTD.
- New handler refinement: `Math.abs(monthlyAnchor × ytdMonths − ytdActualReported) / ytdActualReported` must be ≤ 10%. Rejection diagnostic includes a hinted `ytdMonths` value that would balance the math.
- For SanFran: model attempts `ytdMonths: 4` with anchors `$2.64M/mo`, `$7.86M YTD` → handler computes `$10.56M expected vs $7.86M reported, 34% off` → REJECT with hint `ytdMonths = 3 would balance` → model corrects → `$2.64M × 3 = $7.92M ≈ $7.86M, 0.7% off` → ACCEPT → R&D becomes the math-correct $9.68M → TechPar reports ~46% Above zone.

**Client migration**:

- `gst_irl_ingestion` Step 4 body updated — worked SanFran-shape `_audit` example now includes `ytdMathCheck` showing the IRL anchors that balance the math.
- `gst_target_quick_look` Step 2 body unaffected — `irl-annualized-stated` defaults don't trip the new refinement.
- External consumers using `ytd-annualized-with-period` must add `ytdMathCheck`.

**Manifest-hash impact**: unchanged.

**Closes the structural-math gap**: with `0.5.1`, the same fixture should now produce the same TechPar number across runs because the audit metadata both declares the period AND verifies its arithmetic consistency. Cross-run reproducibility becomes empirically testable on the next SanFran re-test.

**Residual fabrication risk**: model can still fabricate the `monthlyAnchorAmount` value if the citation isn't grounded in the actual IRL body. Phase 2B (`validate_irl_provenance` tool per spec § M6) addresses this — substring-verifies citations against the IRL body. Tracked as the next escalation if v7 reveals citation truthfulness as the remaining failure mode.

**Reference**: [spec § M6](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md).

---

## 0.5.0 — 2026-06-02 — BL-045 PR B Phase 2: `compute_techpar` audit (currency + per-field annualization)

**Theme**: the SanFran v5 dossier validated `0.4.0`'s schema enforcement for diligence-agenda + tech-debt — model corrected on first rejection and proceeded with calibrated inputs. But `compute_techpar` was still called with ad-hoc judgments: model converted CAD→USD without declaring a basis, and annualized R&D OpEx from a YTD figure using a different multiplier on each run (v2 ×4 = $9.68M, v3 ×1.2 = $2.9M, v5 ad-hoc = $3.2M — same fixture, three different R&D-as-%-of-ARR readings, swung TechPar zone classification). Per CLAUDE.md § 4a (no deferred tech debt), this is addressed in PR B, not tracked.

**Surface impact**: **BREAKING** for any consumer that called `compute_techpar` with the legacy input shape. The tool now requires a sibling `_audit` field carrying currency-basis declaration + per-monetary-field annualization provenance.

For `compute_techpar`:

- New required field `_audit` (sibling of the engine inputs). See [`mcp-server/src/schemas/techpar-audit.ts`](./src/schemas/techpar-audit.ts).
- `_audit.monetaryBasis`:
  - `currency` (enum: USD / CAD / EUR / GBP / AUD / JPY / CHF / CNY / INR / BRL / MXN / OTHER) — the currency ALL monetary inputs are denominated in. The engine's percentage calculations only make sense within a single currency.
  - `conversionRate` (number, USD rate) — REQUIRED when `currency != USD`. Approximate is fine.
  - `citation` (regex-enforced shape).
- Per-monetary-field audit (`arr`, `infraHostingAnnual`, `infraPersonnel`, `rdOpEx`, `rdCapEx`, plus `engCost`/`prodCost`/`toolingCost` for deepdive mode):
  - `annualizationSource` (enum: `irl-annualized-stated` / `monthly-x12` / `ytd-annualized-with-period` / `estimated-from-headcount` / `estimated-from-anchor`).
  - `ytdMonths` (1-11) — REQUIRED when `annualizationSource = "ytd-annualized-with-period"`. This closes the root cause of cross-run TechPar swings: the model must commit to a YTD period rather than guessing implicitly.
  - `citation` (regex-enforced shape).
- Cross-field refinements run in the handler body (same SDK-shape pattern as 0.4.0). Refinement failures return `isError: true` with structured BL-045 rule citations.
- Tool response payload now includes `monetaryBasis` (currency + conversionRate) so the dossier rendering step can quote dollar figures with explicit currency provenance.

**Client migration**:

- `gst_irl_ingestion` Step 4 body migrated — directs the model to supply a worked SanFran-shape `_audit` example showing CAD→USD conversion + per-field annualization with `ytdMonths`.
- `gst_target_quick_look` Step 2 body migrated — directs the model to supply Tier-3 partner-supplied defaults (`monetaryBasis.currency: USD`, `annualizationSource: irl-annualized-stated` for fields sourced from form input).
- External consumers calling `compute_techpar` directly must upgrade their payloads.

**Helper**: [`buildPartnerSuppliedTechParAudit(mode)`](./src/schemas/techpar-audit.ts) — Tier-3 audit defaults for non-IRL callers + tests.

**Manifest-hash impact**: unchanged (prompt name@version tuples + URI sets — neither changes here).

**Why now, not later**: empirically, the v5 dossier explicitly noted: _"the 'ahead' (under-band) R&D reading is sensitive to (a) the CAD→USD conversion and (b) whether the YTD R&D figure was correctly annualized"_ — the model was self-aware about the uncertainty but had no enforcement mechanism. Same architectural pattern as 0.4.0 applies. The TechPar swings across runs are exactly the failure mode the audit pattern was designed to close.

**Reference**: [spec](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md), [parent design doc](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md).

---

## 0.4.0 — 2026-06-02 — BL-045 PR B Option A′: tool-schema enforcement of calibration clauses

**Theme**: three rounds of body-level enforcement (v2/v3/v4) failed to make the model apply BL-045's calibration clauses (currency normalization, headcount scope, dataSensitivity bucket boundaries, growthStage Tier discipline, MTTR-OPEN guard). Real-world testing against a client IRL (SanFran, 2026-06-02) showed the model treats prompt-body directives as descriptive context, not as a procedure to execute. This PR moves enforcement from prompt body to the tool-input-schema layer, where MCP-SDK rejection of malformed payloads forces the model to retry with conformant inputs.

**Surface impact**: **BREAKING** for any consumer that called `generate_diligence_agenda` or `estimate_tech_debt_cost` with the legacy input shape. Both tools now require a sibling `_audit` field carrying per-dimension provenance + calibration metadata.

For `generate_diligence_agenda`:

- New required field `_audit` (sibling of the 13 dimension fields). See [`mcp-server/src/schemas/diligence-audit.ts`](./src/schemas/diligence-audit.ts) — the schema is published in `tools/list` so clients see the full shape.
- Per-dimension entries carry `tier` (1/2/3) + `citation` (regex-enforced shape "Section NN — <≥20 char excerpt>") plus dimension-specific fields:
  - `revenueRange._audit.nativeCurrency` + `currencyConversion`
  - `headcount._audit.scope` (`engineering-only` required for non-`'unknown'` values)
  - `growthStage._audit.velocityEvidence`
  - `dataSensitivity._audit.piiCategoriesPresent`
- Cross-field refinements run in the handler body (not via `.superRefine` — that wrapper breaks MCP-SDK JSON Schema publication). Refinement failures return `{ isError: true }` with structured diagnostics citing the BL-045 rule ID and the corrective action.

For `estimate_tech_debt_cost`:

- New required field `_audit` with `mttrSource` and `incidentsSource` (enum: `irl-stated` / `irl-open` / `irl-absent` / `irl-scope-mismatch`).
- `mttrHours` and `incidents` schema fields become nullable.
- For OPEN-source declarations, the corresponding numeric field MUST be null — placeholder substitution is rejected.
- Tool response now includes `extractionOnly: ['mttrHours', 'incidents']?` so the prompt body can render the section correctly.

**Client migration**:

- All three GST prompt callers (`gst_irl_ingestion`, `gst_diligence_kickoff`, `gst_diligence_handoff_memo`) are migrated in this PR. Their bodies direct the model to supply the audit shape.
- Non-IRL prompt callers populate the audit with Tier-3 defaults (`citation: "Section -- — partner-supplied form input — …"`).
- External consumers calling the tools directly must upgrade their payloads.

**Manifest-hash impact**: unchanged at `84fd0dbd66ea7a78b2de516b0c7f8f7abe5a68eb1f1f99360aaa45145231647e` (prompt `name@version` tuples + URI sets — neither changes here). Tool input schemas changed but they don't contribute to the manifest hash.

**Behavior verification**: see [BL-045 PR B Option A′ spec](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md) for the empirical hypothesis being tested. Re-test against the SanFran IRL in Claude Desktop expected to show:

- revenueRange = `5-25m` (CAD→USD conversion forced)
- headcount = `1-50` (engineering-only scope forced)
- dataSensitivity = `low` (bucket boundary forced)
- Tech Debt MTTR = field omitted with extractionOnly response (placeholder substitution forced to null)

**Reference**: [spec](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md), [parent design doc](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md), [review packet](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_REVIEW_PACKET.md).

---

## 0.3.16 — 2026-06-01 — BL-045 PR A: extraction-rule constants extracted (no surface change)

**Theme**: BL-045 PR A — pre-implementation refactor for the upcoming `gst_diligence_sweep` → `gst_irl_ingestion` rename + harden initiative. The load-bearing IRL→tool-input rule prose currently fused inline with sweep orchestration at `diligence-sweep.ts:123/127/129/131/133` is extracted into a shared module at [`src/prompts/extraction-rules.ts`](./src/prompts/extraction-rules.ts) exporting six named constants (`UNKNOWN_PROPAGATION_RULE`, `EU_AI_ACT_CONDITIONAL_TRIGGER`, `NIS2_CONDITIONAL_TRIGGER`, `ENG_COST_DEDUP_RULE`, `ICG_SEEDING_RULES`, `MTTR_P1_RULE`). Sweep imports each constant and interpolates them back at the same body positions.

**Surface impact**: **None — internal refactor.** The rendered prompt body is character-identical pre- and post-refactor (verified by the existing `diligence-sweep-body-hash-stability` integration test: all three scenario hashes unchanged). All 29 existing unit tests pass without modification; a new constant-presence test (test #30) locks the single-source-of-truth invariant. `gst_diligence_sweep` prompt version stays at `0.0.5`; no change to `argsSchema`, `orchestrates`, or `description`.

**Client impact**: None.

**Manifest-hash impact**: Unchanged at `4941f4bface7f2cddf28ed7abe34912a14f5072d8d3ce7595e9d721c1a7edb9a` (prompt `name@version` tuple unchanged; Library/Regulation/Radar URI sets unchanged).

**Why this is its own PR**: per BL-045's design doc, the refactor lands first so PR B (the rename + behavior expansion) starts from a clean shared-constants foundation. Future ingestion-style prompts (the renamed sweep, any subsequent BL-04N sibling) import the same constants — no duplication.

**Reference**: [BL-045 design doc](../src/docs/development/_archive/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) § Pre-implementation refactor.

---

## 0.3.15 — 2026-05-31 — BL-036 Tier 3: `gst_vdr_audit` Prompt retired

**Theme**: BL-036 Tier 3 retires the `gst_vdr_audit` Prompt entirely. Tier 1 (folder-name input) shipped May 2026; Tiers 2-6 (file-contents enhancements and downstream maturity) are canceled — operator assessment 2026-05-31 determined the capability's business value insufficient to justify continued maintenance or further investment in the contents-grounded improvements originally scoped.

**Surface impact**: **BREAKING** for any consumer that invokes `gst_vdr_audit` directly. The Prompt is removed from the registry; an MCP `prompts/get` for `gst_vdr_audit` returns "prompt not found." `prompts/list` returns 9 prompts instead of 10.

**Mitigation**: no successor. The Library Resource `gst://library/vdr-structure` remains (still used by `gst_diligence_kickoff`, `gst_diligence_handoff_memo`, and `gst_diligence_sweep`), so any consumer that wants the canonical VDR taxonomy can still embed the article directly or invoke one of those prompts.

**Manifest-hash impact**: hash changes from `b702aa38…` to `4941f4bf…` (9 prompts post-retirement, was 10). Library/Regulation/Radar URI sets unchanged. Updated in `tests/integration/manifest-stability.test.ts` and the "Current manifest hash" section above.

**Reference**: [BACKLOG.md § BL-036](../src/docs/development/BACKLOG.md), [design doc](../src/docs/development/_archive/MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md) (retained with closure banner — preserves the original tier sketches as institutional reference for any future contributor considering a similar surface).

---

## 0.3.14 — 2026-05-31 — BL-038: `Limiter.check()` signature widening (internal-only)

**Theme**: BL-038 ships the radar-tier rate limit (5/min, 50/day) by widening `Limiter.check(keyOwner)` to `Limiter.check(keyOwner, toolClass: 'general' | 'radar')`. `CheckResult.tier` widens from `'minute' | 'day'` to `'minute' | 'day' | 'radar-minute' | 'radar-day'`. 429 envelope adds a new top-level `reason` field via `reasonForTier(tier)`; existing fields preserved.

**Surface impact**: **None — internal only.** Limiter is consumed only by the Worker `fetch` handler at the single call site `worker.ts:482`. No MCP-protocol surface changes; no Tool/Prompt/Resource registry shape changes. Manifest-hash unchanged (`b702aa38df95e959bbf6f9f8ffac27460f0bbb7e3511c4253eb1781692d1a84d`).

**Client impact**: 429 response bodies gain a new top-level `reason` field. Existing consumers reading `tier`, `limit`, `retryAfterSeconds`, `message`, or `error` are unaffected — additive change.

**Behavior change visible to operators**: radar tools (`search_radar`, `get_latest_insights`) now consume from `mcp:ratelimit:radar:{min,day}` Upstash keys in addition to the existing `mcp:ratelimit:gen:{min,day}` keys. A key making 6+ radar calls in <60s will see a 429 with `reason: 'radar-rate-limit-per-minute'` while general-tool calls continue to flow against the unchanged 60/min general budget.

**Reference**: [BL-038 design doc](../src/docs/development/_archive/MCP_SERVER_RATE_LIMIT_TIER_BL-038.md); [BACKLOG.md BL-038](../src/docs/development/BACKLOG.md).

---

## 0.3.13 — 2026-05-25 — scheduled handler: outer catch around Sentry plumbing (Cloudflare `outcome:exception` regression)

**Theme**: 0.3.12 added a `catch` for `refreshRadarSnapshot` rejections, but `await flushSentry()` in the `finally` block and the Sentry SDK internals invoked by `withMonitor` were still unguarded. When a flush rejected (Sentry ingest network blip, quota, internal SDK error) or `withMonitor`'s check-in HTTP traffic threw, the exception escaped the IIFE → `ctx.waitUntil` rejected → Cloudflare reported `outcome:exception` even on firings where the radar work succeeded.

**Evidence**: 2026-05-25 18:00 UTC firing post-0.3.12-deploy. `/health.inoreaderObservedAt` updated cleanly (cron succeeded end-to-end on the radar side), but Cloudflare's cron dashboard still reported Error. Same pattern persisted across every firing since May 19 — the 0.3.12 fix moved the throw point inside the Sentry stack but didn't close the Cloudflare-visibility gap.

**Fix**: belt-and-suspenders outer try/catch around the entire IIFE body in `worker.ts:scheduled`. Inner try/catch/finally still does the useful capture-and-flush work on the happy and partial-failure paths; the outer catch is a last-resort drop that ensures `ctx.waitUntil` resolves cleanly regardless of which sub-system fails. Two new regression tests in `tests/unit/worker-scheduled.test.ts` simulate `flushSentry` rejection and `captureException` throw — both must leave `Promise.all(waitUntilPromises)` resolved.

**Not a behavior change for the happy path**: when Sentry is reachable and operating normally, captures still fire, flushes still complete, no observable change. The fix only affects the failure modes where the SDK itself misbehaves.

---

## 0.3.12 — 2026-05-25 — scheduled handler: add missing `catch` + wrap in `Sentry.withMonitor` (cron failures now visible in Sentry)

**Theme**: production showed 13 cron `outcome: exception` events on the Cloudflare dashboard in 24h while Sentry's Issues view showed zero corresponding events. Root cause: the scheduled handler's payload was `try { await refreshRadarSnapshot(env); } finally { await flushSentry(); }` — **no `catch` clause**. Exceptions escaped `ctx.waitUntil`'s promise without ever being captured by Sentry; `flushSentry` ran on an empty queue. `withSentry`'s auto-capture is anchored on the fetch handler's Response — scheduled handlers in `ctx.waitUntil` aren't covered.

### Changed

- **`worker.ts` scheduled handler** rewritten to mirror Sentry's reference `instrumentCron` pattern:
  1. **`Sentry.withMonitor('radar-refresh', () => refreshRadarSnapshot(env), { schedule, … })`** — sends `in_progress` / `ok` / `error` check-ins to Sentry Crons. Auto-creates the monitor on first check-in via `upsertMonitorConfig`. Enables missed-firing alerts on the Sentry Crons dashboard.
  2. **Outer `try/catch`** — `withMonitor` re-throws on callback rejection (only marks the check-in; does NOT call `captureException` itself). The catch calls `captureException` for the stack trace, then swallows so `ctx.waitUntil` resolves cleanly.
  3. **`finally { await flushSentry() }`** — unchanged from the prior shape; documented in the original 4680028 commit (BL-032.8 Phase B soak Day 3).
- **`observability/sentry.ts`** — re-exports `withMonitor` from `@sentry/cloudflare` with a docstring explaining the re-throw contract and the three-layer pattern the scheduled handler relies on. Future cron handlers should follow the same shape.
- **`worker.ts`** now also exports `handler` as a named export so the scheduled-handler error path is directly testable. The default export (`withSentry(sentryOptions, handler)`) is unchanged.

### Tests

New regression suite at `mcp-server/tests/unit/worker-scheduled.test.ts` (6 cases) explicitly exercises:

- `captureException` is called with the rejection AND the `{ source: 'cron.scheduled', cron }` context
- `flushSentry` is always called (success + failure paths)
- No `captureException` on the success path (no double-reporting)
- No `captureException` when `refreshRadarSnapshot` returns a non-error envelope (e.g. `partial-both-failed`) — that path is already captured by the inner `captureMessage` call
- `withMonitor` is invoked with the runtime `event.cron` (not a hardcoded constant), so a `wrangler.toml` schedule edit doesn't desync from Sentry's monitor config
- **Load-bearing assertion**: `Promise.all(ctx.waitUntil promises).resolves` — if a future regression removes the catch, this test fails loudly because the IIFE's promise rejects.

**Coverage gap closed**: prior to this commit, zero tests exercised `worker.ts`'s scheduled handler. The cron-handler suite (`tests/unit/cron/radar-refresh.test.ts`) covers `refreshRadarSnapshot` in isolation; it never asked "what does the worker do if `refreshRadarSnapshot` rejects?" That gap is why the 2026-05-25 incident wasn't caught by CI.

### Why patch and not minor

Bug fix to a tooling code path that was silently failing. No tool / prompt / URI surface change. No new dependencies. Operationally identical for any caller that doesn't read Sentry — the only behavior change is that Sentry now sees what Cloudflare's dashboard was reporting.

**Operator semantics**: patch bump per the discipline. The first cron firing after deploy will auto-create the `radar-refresh` monitor on Sentry's Crons dashboard (Sentry Crons is available on all plans including Free, with a monthly check-in quota; the 4/day cadence is well within limits).

**Architecture context**: 2026-05-25 incident RCA. Impartial-agent review confirmed the diagnosis and recommended `withMonitor` as the proper structural fix (vs. the interim "just add a catch" patch I'd initially considered) since it bundles the catch + the Sentry Crons check-in + missed-firing alerts in one wrapper designed for the scheduled-handler shape. The 4680028 commit (BL-032.8 Phase B soak Day 3) explicitly flagged this approach as "strictly better long-term shape" and punted; this incident is the trigger that took it off the punt list.

---

## 0.3.11 — 2026-05-25 — stdio binary `createRequire` banner shim (unblocks `xlsx-js-style` runtime startup)

**Theme**: surfaced by CI on PR #162 (2026-05-25). The "Smoke test compiled binary" step (`node mcp-server/dist/index.js < /dev/null`) failed with:

```
Error: Dynamic require of "stream" is not supported
  at make_xlsx_lib (.../mcp-server/dist/index.js:...)
  at xlsx-js-style/dist/xlsx.min.js (.../mcp-server/dist/index.js:...)
```

`xlsx-js-style` does `require('stream')` at module-load time. esbuild's default ESM emit replaces dynamic `require()` calls inside bundled CJS deps with a stub that throws at runtime. The unit + integration tests passed locally because Vitest imports the source directly (no bundle); the smoke test catches what the test suite misses.

### Changed

- **`mcp-server/build.mjs`** — esbuild `banner.js` now injects a CJS-style `require` shim via `createRequire(import.meta.url)`. The bundled CJS deps' dynamic require calls resolve through Node's built-in module resolver. Canonical esbuild ESM-with-CJS-deps pattern.
- **No code changes** — build-config only. Source files, tests, and runtime contracts are unchanged.

### Why patch and not minor

Build-config fix to a bug introduced in 0.3.7 (the `xlsx-js-style` swap). The deployed Worker binary is unaffected (wrangler uses its own bundler; staging `0.3.10` deploy worked fine — this is stdio-only). Tool/prompt/URI surfaces unchanged.

### Test impact

`node mcp-server/dist/index.js < /dev/null` now exits 0 with `[gst-mcp] connected on stdio`. The CI "Smoke test compiled binary" step will pass on re-run.

**Operator semantics**: patch bump per the discipline. Stdio binary correctness fix; no runtime API change.

**Architecture context**: BL-044 PR #162 CI failure. 0.3.7 introduced `xlsx-js-style`; 0.3.11 fixes the build emit to support its CJS-style dynamic requires.

---

## 0.3.10 — 2026-05-25 — `generate_information_request_list_xlsx` deeplink encodes args (Hub form pre-fills on landing)

**Theme**: 0.3.9 had the tool emit a static URL to the Hub page. User feedback (2026-05-25): "the hyperlink doesn't add any value — it does not reflect the input arguments to the tool at all, it simply links to it. A user could go directly there, instead." Correct critique — the MCP path delivered zero value over a bookmark. This release aligns the IRL generator with the deeplink pattern every other Hub tool already uses (TechPar, ICG, Tech Debt, Diligence Machine, Regulatory Map, Radar all serialize args into URL query params).

### Changed

- **`generate_information_request_list_xlsx`**: the Hub URL in the tool's text summary now encodes `?target=<name>&context=<ctx>` when those args are supplied. Empty args produce a clean URL with no query string (universal landing).
- **Hub page** (`/hub/tools/information-request-list-generator/`): added URL-query-param hydration on mount. `?target=...` pre-fills the target name input; `?context=...` selects the matching radio (defensive — unknown values fall through to the "Unspecified" default). One-click landing reproduces the same file the MCP path would have generated.

### Why this matters for the MCP value-add

Without arg-passing, the MCP path was "type prompt args → read text → click link → re-enter the same args on the Hub page → download." With it: "type prompt args → read text → click link → already filled → download." The friction reduction is what makes the MCP path's existence worth justifying over a bookmark.

This is the same deeplink pattern from BL-031.95 (other Hub tools); the IRL generator was the outlier with a static URL.

### Test impact

- `generate-information-request-list-xlsx.test.ts`: two new regression tests asserting (a) the deeplink encodes `target` + `context` query params when args supplied, (b) the URL is clean (no query string) when no args. Locks the contract so a future accidental revert can't silently break the MCP value prop.
- `hub-tools-irl-generator.test.ts` (E2E): two new tests asserting (a) the form pre-fills from URL params, (b) unknown context values are defensively ignored (form falls back to default).

**Operator semantics**: patch bump per the discipline (text content change on tool output + Hub page hydration — no surface-area change). No manifest hash drift (prompt versions unchanged; tool name + schema + structuredContent shape unchanged).

**Architecture context**: BL-044 post-staging-feedback polish. The 0.3.8 → 0.3.9 → 0.3.10 trio is one logical arc: 0.3.8 tried the canonical resource-block pattern, 0.3.9 reverted after Claude Desktop's renderer limitation was confirmed, 0.3.10 invests in the Hub-page-as-canonical-download-surface story by closing the arg-passing gap that made the redirect feel valueless.

---

## 0.3.9 — 2026-05-25 — `generate_information_request_list_xlsx` reverts the `resource` content block; `gst_information_request_list` v0.0.3 → v0.0.4 redirects to the Hub page

**Theme**: 0.3.8 added a `resource` content block carrying the .xlsx as a blob — the canonical MCP "tool produced a binary" pattern. Staging round-trip test (2026-05-25) confirmed Claude Desktop's tool-result renderer **routes `resource` content blocks by mimeType prefix** (`image/*` → image renderer, anything else → red "unsupported format" error block). The blob was correctly delivered on the wire; Claude Desktop just refused to render anything that wasn't an image.

### Changed

- **Tool response shape**: `generate_information_request_list_xlsx` reverts to a single text content block (no resource block). `structuredContent` retained verbatim — programmatic API consumers that read `.base64` continue to work. The text summary now includes the Hub page URL (`/hub/tools/information-request-list-generator/`) so the model can direct users to the canonical download surface.
- **Prompt body**: `gst_information_request_list` bumped `0.0.3 → 0.0.4`. Step 4 of the one-shot body updated:
  - **DOES** still call `generate_information_request_list_xlsx` (the tool returns useful `structuredContent` — filename, counts — that the model uses in its reply).
  - **DOES NOT** promise an attachment in chat (the previous "attach the file to your reply" directive was unfulfillable in Claude Desktop).
  - **DOES** explicitly redirect the partner to `https://globalstrategic.tech/hub/tools/information-request-list-generator/` for the actual download. The Hub page runs the same generator client-side with the same target/context personalization.
- **Description**: clarified that the prompt "directs the partner to the Hub page" rather than "emits a downloadable fillable .xlsx".

### Why patch and not major

The tool's input schema, name, registered orchestrates list, and `structuredContent` shape are unchanged. The only externally-visible change is the removal of a content block that Claude Desktop rejected anyway — the surface that worked still works, the surface that errored is gone. No client breakage.

### Test impact

- `generate-information-request-list-xlsx.test.ts`: removed the two regression tests asserting the resource block + base64 blob (they validated a contract that's no longer the right pattern). Replaced with one test asserting the text summary contains the Hub page URL.
- `information-request-list.test.ts`: version assertion bumped `0.0.3 → 0.0.4`; the "one-shot body calls the XLSX tool" test extended to also assert the Hub page URL appears AND the "do not promise an attachment" directive appears literally in the body.
- Manifest hash recomputed.

### Follow-up — BL-046 candidate (file-delivery surface for Claude Desktop)

Proper file-delivery in Claude Desktop requires one of:

1. Claude Desktop renderer support for arbitrary-mimeType `resource` content (waiting on client maturity)
2. `resource_link` + ephemeral Worker-hosted Resources (~4-6 hours: KV/R2 storage, per-call resource registration, TTL, resources/read handler integration)
3. Signed HTTP download URL on the Worker (~3-4 hours: KV cache, route, expiry, signature scheme)

Filing as BL-046 when prioritized. Until then, the Hub page is the canonical download surface and the tool's text summary names it explicitly.

**Operator semantics**: patch bump per the discipline (response-shape revert + prompt patch — no surface-area change). Pinned MCP conversations resolve everything identically; the only behavior change is that the model now correctly directs users to a working download path instead of an unfulfillable attachment.

**Architecture context**: BL-044 staging round-trip test (2026-05-25). The 0.3.8 → 0.3.9 pair is one logical fix arc: 0.3.8 attempted the canonical MCP pattern; 0.3.9 reverts to an honest Claude-Desktop-compatible shape after the renderer limitation was confirmed empirically.

---

## 0.3.8 — 2026-05-25 — `generate_information_request_list_xlsx` emits a `resource` content block (Claude Desktop download surface)

**Theme**: the previous response shape returned the .xlsx only in `structuredContent.base64` — a metadata field the model reasons about but Claude Desktop doesn't render as a downloadable attachment. Live exercise on staging (2026-05-25) confirmed: the model successfully called the tool, wrote a confirmation paragraph, but the user got no clickable file. The base64 was on the wire; the client just had no UI hook to surface it.

### Changed

- **Tool response shape**: `generate_information_request_list_xlsx` now returns `content[]` with TWO blocks instead of one:
  - `content[0]`: existing text summary (unchanged — "Generated IRL workbook for X (N sections, M requests). Filename: ..."`).
  - `content[1]`: **new** `resource` content block with `uri: gst://generated/irl/<filename>`, `mimeType: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `blob: <base64>`. This is the canonical MCP "tool produced a binary file" pattern; Claude Desktop / Cursor / other MCP clients render it as a downloadable attachment.
- **`structuredContent` retained verbatim**: `{ filename, base64, mimeType, byteLength, sectionCount, bulletCount, canonicalUrl }`. API clients that piped the base64 from `structuredContent.base64` continue to work; no integration break.

### Why patch and not minor

Additive: existing `content[0]` text and `structuredContent` shape are unchanged. Old callers that read either path see no difference. New callers (Claude Desktop UI rendering) gain the file-download affordance. No removed names, no renamed fields, no schema changes.

### Test impact

`generate-information-request-list-xlsx.test.ts` adds one regression test asserting the resource block is present, the MIME type matches, the URI follows the `gst://generated/irl/<filename>` pattern, and the blob decodes to a workbook with ZIP magic bytes `PK\x03\x04` at offset 0. The pre-existing structuredContent shape tests are unchanged and continue to pass — proving the additive nature of the change.

**Operator semantics**: patch bump per the discipline (response-shape addition with no surface-area change → patch). Pinned MCP conversations continue to resolve the tool identically; the only behavior change is that Claude Desktop users now actually get the file.

**Architecture context**: BL-044 staging round-trip test (2026-05-25) — first invocation of the v0.0.3 prompt in Claude Desktop surfaced the missing-attachment bug. Fix is in-scope for BL-044 since the prompt's Step 4 directive promises "attach the file to your reply" — without the resource content block, that promise was unfulfillable.

---

## 0.3.7 — 2026-05-25 — XLSX library swap (`@e965/xlsx` → `xlsx-js-style`) for cell-style write support

**Theme**: the generated IRL `.xlsx` workbook needs visible bold + larger-font styling on column headers and section header rows for readability. `@e965/xlsx` (SheetJS Community auto-republish) silently drops `cell.s.font` on write — the styling logic in our code was being applied to a no-op write path, so Excel rendered everything as plain text.

### Changed

- **Runtime dependency**: `@e965/xlsx@^0.20.3` removed; `xlsx-js-style@^1.2.0` added in both `mcp-server/package.json` and root `package.json`. Drop-in API replacement (same `XLSX.utils.aoa_to_sheet`, same `XLSX.write` shape, same return types).
- **Generated workbook bytes change**: the binary output of `generate_information_request_list_xlsx` now includes a non-empty `xl/styles.xml` with real `<font><b/></font>` and `<sz val="13"/>` entries. Excel / Google Sheets / LibreOffice render bold column headers and bold section header rows accordingly.
- **No tool / prompt / URI surface change**: tool name, input schema, output shape (`{ filename, base64, mimeType, byteLength, sectionCount, bulletCount, canonicalUrl }`), and prompt versions are all unchanged. Pinned conversations continue to resolve the prompt + tool identically.

### Test impact

The `xlsx-js-style` READ path strips style metadata back to a partial shape, so style verification cannot use the round-trip-read pattern. The unit test (`generate-irl-xlsx.test.ts`) now unzips the generated `.xlsx` (small inline ZIP walker) and inspects `xl/styles.xml` directly. This proves the bytes shipped to Excel actually carry the styling, regardless of the library's read-side behavior.

**Operator semantics**: patch-style bump (runtime behavior change without surface-area change → patch bump per the discipline). Pinned conversations continue to resolve everything identically; the only behavior change is the visual styling Excel applies on open.

**Architecture context**: BL-044 post-merge polish (live screenshot 2026-05-25 surfaced the styling no-op). Library-choice rationale + Workers-compatibility verification documented in [`MCP_SERVER_IRL_GENERATOR_BL-044.md` § "Library choice"](../src/docs/development/_archive/MCP_SERVER_IRL_GENERATOR_BL-044.md#library-choice--xlsx-js-style).

---

## 0.3.6 — 2026-05-24 — `gst_information_request_list` v0.0.3 + `gst_diligence_sweep` v0.0.5 voice-cue accuracy patch

**Theme**: tighten the `transactionContext`-driven voice cues in both prompts. Two specific inaccuracies and one alignment with the BL-044 UI label change.

### Changed

- **`gst_information_request_list` bumped `0.0.2 → 0.0.3`** (same name, patch — body change only, behavior unchanged):
  - `VOICE_CUES['buy-side']`: removed "GST is underwriting this transaction" (GST supports a buyer's evaluation; does not underwrite) AND "before the LOI" (buy-side engagements can be pre-LOI OR LOI-stage). New text frames GST's role as "supporting your evaluation" and explicitly notes "(whether pre-LOI or LOI-stage)".
  - `VOICE_CUES['value-creation']`: removed the "post-close" qualifier on GST's role to align with the BL-044 UI label change from "Post-close value creation" → "Value Creation". The "100-day roadmap" terminology (industry-standard) is retained without explicit "post-close" framing of GST's involvement.
- **`gst_diligence_sweep` bumped `0.0.4 → 0.0.5`** (same name, patch — body change only): the same two voice-cue edits applied to its `VOICE_CUES` map. The dossier-output hash for the `one-shot full` scenario shifted as a result; the interactive + one-shot-minimal hashes are unchanged (they don't reference voice cues).

**Operator semantics**: patch bumps per the discipline (body changes that steer model output → patch bump). Pinned conversations continue to resolve both prompts to the (now-newer) versions; no schema changes; no behavior changes to the artifact structure or sweep coverage.

**Architecture context**: voice-cue accuracy is partner-facing brand integrity — the previous "underwriting" framing materially miscast GST's role in buy-side engagements, and the "post-close" qualifier created label drift after the BL-044 "Value Creation" UI cleanup. Caught during BL-044 post-merge cleanup review.

---

## 0.3.5 — 2026-05-24 — `gst_information_request_list` v0.0.2 + `generate_information_request_list_xlsx` tool (BL-044)

**Theme**: close the IRL request → response loop by shipping a fillable `.xlsx` generator. The recipient now has an obvious structured response surface (one row per request, with an empty answer cell beside) instead of having to invent a response format from the markdown article.

### Added

- **Tool**: `generate_information_request_list_xlsx` — pure-function pipeline (library load → markdown parse → XLSX render → base64). Returns `{ filename, base64, mimeType, byteLength, sectionCount, bulletCount, canonicalUrl }`. Reads from the same `gst://library/information-request-list` Resource the prompt embeds, so the partner-facing text and the partner-facing file stay byte-identical. The new tool name was added to `KNOWN_TOOL_NAMES` in [`tests/integration/prompts-registry.test.ts`](./tests/integration/prompts-registry.test.ts).

### Changed

- **Prompt body**: `gst_information_request_list` bumped `0.0.1 → 0.0.2`. Additive behavior: when **any** arg is supplied, the one-shot body now instructs the model to also call `generate_information_request_list_xlsx` so the partner receives a downloadable workbook alongside the paste-ready text. Bare invocation (interactive mode) is unchanged — still emits text-only. `orchestrates` extended from `[RESOURCE_URI]` to `[RESOURCE_URI, 'generate_information_request_list_xlsx']`.
- **Description**: clarified that the prompt now generates a downloadable file when called with args; pairing with `gst_diligence_kickoff` is unchanged.

### Dependencies

- Added `@e965/xlsx@^0.20.3` to `mcp-server/package.json` — community-maintained auto-republish of SheetJS, pure JS, Workers + Node + browser compatible, zero runtime deps. Avoids the stale + CVE-laden `xlsx` npm package and the Node-only `exceljs`. Verified compatible with the Cloudflare Workers runtime — no `nodejs_compat` flag needed, no `Buffer` polyfill required (uses `type: 'array'` output + chunked `btoa` for base64).

**Operator semantics**: minor bump per the discipline (additive tool + additive prompt behavior + new dependency → `0.3.4 → 0.3.5` minor, NOT major; pinned conversations resolve `gst_information_request_list` to the newer prompt with the additive file-attachment behavior; no removed names; no schema changes to existing tools).

**Architecture context**: [BL-044 in BACKLOG.md](../src/docs/development/BACKLOG.md). Tracking doc at [`src/docs/development/_archive/MCP_SERVER_IRL_GENERATOR_BL-044.md`](../src/docs/development/_archive/MCP_SERVER_IRL_GENERATOR_BL-044.md) (added in this release).

---

## 0.3.4 — 2026-05-22 — `gst_diligence_sweep` v0.0.4 body refinements (post-demo audit)

**Theme**: close five accuracy gaps surfaced by a 4-agent parallel audit of the post-demo Scenario 7 sweep output. The v0.0.3 patches landed but the model still produced material errors on three of the four tool surfaces (TechPar engCost partial-dedup, Tech Debt MTTR-not-P1, ICG under-seeding + q5_3 over-credit, Diligence Wizard sentinel-discipline regression on bm and om, NIS2 coverage gap).

### Changed

- **Prompt body**: `gst_diligence_sweep` bumped `0.0.3 → 0.0.4`. Five body refinements, each targeted at a specific failure mode observed in the post-demo live exercise:
  1. **Step 1 — Sentinel-discipline anti-examples for `businessModel` and `operatingModel`**: v0.0.3 had the model fill `bm=productized-platform` (forbidden inference from `b2b-saas`; the IRL said "per-claim transactional uplift" which signals usage-based) and `om=product-aligned-teams` (forbidden — "squad model" is a colloquialism, not a literal one-to-one enum mapping; the tool's USAGE RULE explicitly says "do NOT infer operatingModel from anything"). v0.0.4 names these two canonical forbidden patterns explicitly, plus calls out that `transformationState: actively-modernizing` IS a literal mapping when the IRL names an in-flight rewrite (closes the v0.0.3 over-conservatism on that dimension).

  2. **Step 3 — NIS2 conditional alongside the existing EU AI Act conditional**: when Section 00 includes EU geography AND Section 01 names a regulated sector covered by NIS2 Annex I/II (healthcare among them), the sweep now adds an NIS2 search. The audit found NIS2 absent from the post-demo dossier despite MedSig serving EU healthcare — same gap-fill pattern as the EU AI Act conditional, just for cybersecurity.

  3. **Step 4 — TechPar engCost dedup with worked math example**: v0.0.3 added dedup guidance but the model still partially mis-applied it ($12.76M = 55 × salary, having subtracted 3 security engineers instead of the 8 SRE that belong in `infraPersonnel`). v0.0.4 spells out the math with an explicit example matching the IRL fixture's wording: "58 total — 38 product + 8 SRE + 3 security + 7 data + 2 platform DX → infraPersonnel = 8 × salary; engCost = (58 − 8) × salary = 50 × salary. Do NOT subtract security, data, or DX."

  4. **Step 5 — ICG seeding-signal mapping table + tenure caveat for `q5_3`**: v0.0.3 was directionally clean but produced a 2/100 Reactive score where ~26-30/100 Aware was defensible. The engine penalizes `-1` ("Not sure") more harshly than `0` ("Not in place"), so over-conservatism is mechanically worse than calibrated seeding. v0.0.4 includes a short signal → seed-level mapping table (IaC + per-service Datadog → `q1_1` tagging at 2; named FinOps lead + monthly spend tracking → `q1_2` + `q1_3` at 2; multi-region with isolation + gated staging → `q2_1` at 2; production serverless / managed-ML → `q5_2` at 2). Plus an explicit tenure caveat: a hired-and-named FinOps lead is `q5_3` level 2 (Established), NOT level 3 (Strategic) — level 3 requires evidence of a _practice_ (wins shipped, architectural influence) that a `<12-month` hire typically does not yet exhibit.

  5. **Step 6 — Tech Debt MTTR explicit P1 guidance**: v0.0.3 didn't specify which MTTR to use when the IRL lists P0 and P1 separately. The post-demo run used `mttr=3` (midway between P0=2.4h and P1=7.8h), understating the carrying-cost calc by ~62% on its linear component. v0.0.4 hard-codes: "Use P1 (the workhorse number). Do NOT use P0, do NOT use a midpoint, do NOT use an average." Also tightens the incidents-per-month guidance to use the most-recent quarter's monthly equivalent (avoiding the round-up to 2/month when the IRL trends down to ~1.3/month).

**Operator semantics**: patch bump per the discipline (prompt `version` field bump with same name → patch). Behavior change without surface-area change; pinned conversations continue to resolve `gst_diligence_sweep` to the (now-newer) prompt.

**Architecture context**: Findings from a 4-agent parallel audit of the post-demo Scenario 7 sweep output, with full audit transcripts retained in conversation context. The audit identified that the v0.0.3 dedup, deeplink, and sentinel-discipline patches partially landed but with three material residual errors; v0.0.4 closes the residuals. [BL-032.6 demo Scenario 7](../src/docs/development/_archive/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7).

---

## 0.3.3 — 2026-05-22 — `compute_techpar` deeplink emits `b=annual` (wizard hydration fix)

**Theme**: fix the TechPar wizard hydrating MCP-generated deeplinks at ~7× the correct `totalTechPct` due to a missing URL-state flag.

### Changed

- **Tool**: `compute_techpar` deeplink now includes `b=annual` as a URL param. Behavior change to the tool's response shape (`deeplink` field); no schema change.

**Why**: BL-031.95 standardized the TechPar tool API on annual units — the `infraHostingAnnual` field carries an annual value, and `serializeToParams` writes it to URL key `h` as-is. The website's TechPar wizard, however, has two infra-cost-period modes (monthly / annual) and **defaults `infraPeriod` to `'monthly'`** ([`src/utils/techpar/state.ts:35`](../src/utils/techpar/state.ts#L35)). In monthly mode, the wizard's `buildInputs()` multiplies the field's DOM value by 12 before sending to the engine ([`src/utils/techpar/dom.ts:569`](../src/utils/techpar/dom.ts#L569)). The wizard's own URL writer sets `b=annual` only when the user has manually toggled to annual mode ([`src/utils/techpar/dom.ts:597`](../src/utils/techpar/dom.ts#L597)); the MCP-side `buildTechparDeeplink` was not setting `b` at all.

Effect on partner experience: clicking the "Open TechPar Wizard" link from the `gst_diligence_sweep` dossier loaded a wizard view that **multiplied the already-annualized hosting figure by 12**, producing a wildly-inflated total tech / ARR ratio (live finding 2026-05-22: a healthcare-RCM target at $23.4M annual hosting / $45.2M ARR restored as **655.6% vs the correct 92.4%**).

Fix: one-line addition in [`buildTechparDeeplink`](./src/tools/techpar.ts#L26) — `params.set('b', 'annual')` after the existing `serializeToParams` call. Preserves the wizard's existing in-wizard URL-writing behavior; aligns the MCP-side deeplink with the unit convention the tool already uses internally.

**Operator semantics**: patch bump per the discipline (tool response-shape change with no name/schema change → patch bump). Pinned conversations continue to resolve `compute_techpar` identically; the only behavior change is one URL param appended to the `deeplink` field.

**Architecture context**: [BL-032.6 demo Scenario 7](../src/docs/development/_archive/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7) — surfaced when the post-demo TechPar wizard click-through showed implausible numbers.

---

## 0.3.2 — 2026-05-22 — `gst_diligence_sweep` v0.0.3 body refinements (second live-exercise + post-demo)

**Theme**: close the two findings from the second live exercise that the v0.0.2 deploy didn't fix at the prompt-body level. Both fixes were held until after the BL-032.6 demo to keep the deployed contract stable; demo ran clean; shipping the patches now.

### Changed

- **Prompt body**: `gst_diligence_sweep` bumped `0.0.2 → 0.0.3`. Two body refinements:
  - **Deeplink directive verb strengthened**: Steps 3-7 now use `Surface ... in the dossier` (output verb) instead of `Capture ...` (working-memory verb). The v0.0.2 live exercise showed the model honored "Surface" (sections B Agenda + G Comparables — using v0.0.1 phrasing) but silently dropped "Capture" for the new v0.0.2-added directives (sections C TechPar / D ICG / E Tech Debt / F Regulatory / H Radar) — leaving 5/7 sections without their Open-in-Hub link. v0.0.3 mirrors the v0.0.1 phrasing literally across all five new directives. Step 8's section descriptions (C/D/E/F/G/H) also hoist the `**MUST close with [Open X Wizard](deeplink)** — this is non-optional` directive to the **first sentence** so the model attends to it before the freeform-writing guidance.
  - **TechPar engCost / infraPersonnel dedup guard**: Step 4 now carries explicit guidance: `engCost` covers R&D engineering headcount NOT also booked as infra personnel. The v0.0.2 live exercise had the model pass all 58 engineers into `engCost` AND 8 SRE into `infraPersonnel`, double-counting the SRE headcount (once in synthesized R&D OpEx, once standalone) and inflating total tech / ARR by ~4 points (92.4% reported vs ~88% corrected). v0.0.3 explicitly instructs the partition (e.g., "58 total — 38 product + 8 SRE + 3 security + 7 data + 2 platform DX" → 8 in `infraPersonnel`, remaining 50 in `engCost`).

**Operator semantics**: patch bump per the discipline (prompt `version` field bump with same name → patch). Behavior change without surface-area change; pinned conversations continue to resolve `gst_diligence_sweep` to the (now-newer) prompt.

**Architecture context**: live-exercise findings captured in [`mcp-server/tests/examples/diligence-sweep.golden.md`](./tests/examples/diligence-sweep.golden.md) § v0.0.3 candidate patches (now shipped). [BL-032.6 demo Scenario 7](../src/docs/development/_archive/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7) demo invocation directive (`Surface each GST Hub Tool deeplink at the close of its corresponding section`) was the front-line workaround that masked the deeplink regression during the demo; v0.0.3 makes that workaround unnecessary at the prompt-body level.

---

## 0.3.1 — 2026-05-22 — `gst_diligence_sweep` v0.0.2 body refinements (live-exercise driven)

**Theme**: sharpen the sweep prompt body based on live-exercise findings against the MedSig populated-IRL fixture.

### Changed

- **Prompt body**: `gst_diligence_sweep` bumped `0.0.1 → 0.0.2`. Three body refinements:
  - **Portfolio-facet literalness** (Step 2): the model now uses theme / industry names returned by `list_portfolio_facets` verbatim — the live exercise surfaced a retry where the model guessed `Healthcare Tech` when the canonical theme is `Healthcare`.
  - **EU AI Act conditional** (Step 3): when Section 05 names production ML/AI AND Section 00 geographies include the EU, add an EU AI Act `search_regulations` call (healthcare-domain decision-support ML typically classifies as Annex III high-risk; the IRL itself is often silent on this exposure).
  - **Deeplink coverage across every section** (Steps 3-7 + dossier sections C/D/E/F/H): v0.0.1 only surfaced the "Open in Hub" deeplink for sections (B) Agenda and (G) Comparables. v0.0.2 wires the deeplink from every tool that returns one — `compute_techpar` (TechPar wizard), `assess_infrastructure_cost_governance` (ICG wizard), `estimate_tech_debt_cost` (Tech Debt Calculator), `search_regulations` (Regulatory Map, one per framework), `search_radar` (Radar feed). The deeplinks open the corresponding Hub surface with state pre-populated, bridging the read-only dossier to the partner-refinable interactive tool. **The live-exercise transcript triggered the gap** — when only 2/7 sections carried Open-in-Hub links, the dossier lost its bridge back to the interactive Hub for the bulk of the analysis.

**Operator semantics**: patch bump per the discipline (prompt `version` field bump with same name → patch). Behavior change without surface-area change; pinned conversations continue to resolve `gst_diligence_sweep` to the (now-newer) prompt.

**Architecture context**: [BL-032.6 demo Scenario 7](../src/docs/development/_archive/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7) + live-exercise transcript captured in [`mcp-server/tests/examples/diligence-sweep.golden.md`](./tests/examples/diligence-sweep.golden.md).

---

## 0.3.0 — 2026-05-22 — BL-032.6 Scenario 7 — `gst_diligence_sweep`

**Theme**: ship the bookend to `gst_information_request_list`. The IRL prompt emits the _request_ artifact; the new sweep prompt ingests a _populated_ IRL and uses the full content to drive every Hub tool surface and downstream prompt artifact — the "high-fidelity intake → full platform sweep" workflow.

### Added

- **MCP Prompt**: `gst_diligence_sweep` (v0.0.1) — bookend to `gst_information_request_list`. Takes the populated IRL the target returns plus optional `targetName` / `transactionContext` / `partnerLead` / `projectCodeName` framing. Orchestrates 9 tools (`generate_diligence_agenda`, `list_portfolio_facets`, `search_portfolio`, `list_regulation_facets`, `search_regulations`, `compute_techpar`, `assess_infrastructure_cost_governance`, `estimate_tech_debt_cost`, `search_radar`) and embeds two Library resources (`gst://library/information-request-list` for taxonomy reference, `gst://library/vdr-structure` for synthesis follow-ups). Output is a unified nine-section dossier with no `'unknown'` defensive widening.

**Operator semantics**: this is an **additive** change — no URIs or prompt names were renamed or removed. Per the discipline above (prompt-name addition → minor bump), `mcp-server/package.json` bumps `0.2.0 → 0.3.0`.

**Pinned conversation impact**: none. Existing pinned URIs and prompt names continue to resolve.

**Architecture context**: [BL-032.6 demo Scenario 7](../src/docs/development/_archive/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7).

---

## 0.2.0 — 2026-05-22 — BL-043 Information Request List

**Theme**: ship the Information Request List as a Library article + MCP Resource + MCP Prompt.

### Added

- **Library article + Resource**: `gst://library/information-request-list` — universal one-page intake checklist organized by VDR taxonomy (00 Basics + sections 01-09 mirroring VDR-9). Codegen auto-picked up via `mcp-server/scripts/generate-regulations-index.mjs`.
- **MCP Prompt**: `gst_information_request_list` (v0.0.1) — assembles the input-gathering ask GST hands to a target/client before running diligence tools. Embeds the canonical Resource as the second message; supports optional `targetName`, `transactionContext`, and `productSummary` args for light personalization.

**Operator semantics**: this is an **additive** change — no URIs or prompt names were renamed or removed. Per the discipline above (URI / prompt-name addition → minor bump), `mcp-server/package.json` bumps `0.1.0 → 0.2.0`.

**Pinned conversation impact**: none. Existing pinned URIs and prompt names continue to resolve.

**Architecture context**: [BL-043 design doc](../src/docs/development/_archive/MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md).

---

## 0.1.0 — 2026-05-13 — BL-032.5 Phase 4 manifest-hash discipline

**Theme**: formalize the URI / prompt-name stability discipline that
BL-032 Phase 4b introduced informally.

**What changed**:

- New CI test at [`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts)
  computes a sha256 over the sorted Library / Regulation / Radar URIs +
  prompt `name@version` tuples. Fails when the registry shape drifts
  from the value committed here.
- `BREAKING_CHANGES.md` gains a `## Current manifest hash` section
  (above) that operators update in lockstep with the test constant
  when a manifest-affecting change ships.

**Operator semantics**:

- URI / prompt-name **rename** or **removal** → major bump (breaks pinned conversations)
- URI / prompt-name **addition** → minor bump
- prompt **`version` field** bump (same name, behavior change) → patch bump

**Architecture context**: [BL-032.5 design doc § Repo placement and lifecycle](../src/docs/development/_archive/MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md#repo-placement-and-lifecycle).

This is not a breaking change in itself (no Tool / prompt / Resource was renamed); it's documented here so the discipline's introduction is auditable.

---

## 0.1.0 — 2026-05-04

**Theme**: BL-032 Phase 4b — `search_radar_cache` rename.

### Tool: `search_radar_cache` → `search_radar_offline`

The Phase 1 / BL-031.5 name `search_radar_cache` predicted a future split between a snapshot tool and a live tool (the live tool ships under BL-032 Phase 4c as `search_radar`). Reviewed during BL-032 Q2 — `_offline` more accurately describes what the tool does (offline-from-Inoreader; reads a frozen snapshot). The `_cache` framing also confused the relationship with the upcoming Worker-side ISR cache (`mcp:radar:cache:*` Upstash keys), which is a different cache layer entirely.

**What changed**:

- `mcp-server/src/tools/radar-cache.ts` → `mcp-server/src/tools/radar-offline.ts`
- Tool name registered in MCP: `search_radar_cache` → `search_radar_offline`
- Exported function names: `handleRadarCacheTool` → `handleRadarOfflineTool`; `registerRadarCacheTool` → `registerRadarOfflineTool`; `SearchRadarCacheInputSchema` → `SearchRadarOfflineInputSchema`
- Test files renamed: `radar-cache.test.ts` → `radar-offline.test.ts`, `radar-cache-handler.test.ts` → `radar-offline-handler.test.ts`

**Migration**: deprecated alias `search_radar_cache` registered alongside `search_radar_offline` for one release. Calling the alias:

- Tail-calls the same handler (no functional difference)
- Emits `[gst-mcp] DEPRECATION: search_radar_cache renamed to search_radar_offline ...` to stderr on each invocation
- Will be **removed in `mcp-server@0.2.0`** — update your client config / agent code before then

**Affected surfaces**: pinned conversations referencing `search_radar_cache`, agent code calling the tool by name, prompts orchestrating it (none currently — verified during the rename).

**Architecture context**: [BL-032 Q2](../src/docs/development/_archive/MCP_SERVER_REMOTE_BL-032.md#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited) records the three options considered (rename + alias / coexist / drop offline) and the decision to rename + alias.

---

## How to use this file

When making a contract-breaking change to a tool / prompt / Resource:

1. Add an entry above the previous entries (newest at the top)
2. Bump `version` in `package.json` per semver:
   - **Rename or alias-only deprecation** (no functional change to callers honoring the deprecation): minor bump (`0.X.0`)
   - **Remove a deprecated alias**: major bump (`X.0.0`)
   - **Schema-incompatible change to an existing tool/prompt** (e.g. removing a field that callers depend on): major bump
3. Cross-reference the BL- doc / Q-section in the entry body so future readers can trace the reasoning
4. If the change ships with an alias for a deprecation window, name the version that retires the alias in the entry

The file goes BACKWARD chronologically (newest at top) so a reader scanning for "what's the most recent breaking change" sees it first.
