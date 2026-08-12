# ADR-0015: The canonical IRL body reads all seven workbook columns; Comments is an answer

- **Status**: Accepted 2026-08-12 (prompt `0.22.3`, server `0.49.2`)
- **Source initiative**: BL-120 (see the stanza in [`BACKLOG.md`](../development/BACKLOG.md); extends [ADR-0003](0003-irl-xlsx-canonicalization-hash-bind.md), which named `extract-irl-markdown.mjs` as the canonicalizer)

## Context

The IRL workbook that [`generate-xlsx.ts`](../../utils/irl/generate-xlsx.ts) produces has seven columns:

```
A Reference | B Request | C Status | D File Location | E Comments | F Notes | G Response
```

`npm run irl:extract` — the operator path [`IRL_PARTNER_PASTE_RUNBOOK.md`](../development/IRL_PARTNER_PASTE_RUNBOOK.md) recommends for **client-facing and regulatory** deliverables — read four of them (A/B/C/G) and discarded D, E and F as "partner-supplied side channels".

Measured against a real filled workbook (outside the repo):

- **26,221 of 57,992 authored characters — 45.2% — were dropped.**
- 73 of 134 rows carried Comments; 60 carried File Location; 58 carried Notes.
- **18 rows had a Status claiming an answer with an empty Response. In 17 of them the answer was sitting in Comments** (none were File-Location- or Notes-only). Exactly one row — `5-13` — was genuinely unanswered.

The dropped content was not metadata. One `[CLOSED]` row's Comments read _"B2B SaaS (retail workforce management + retail execution platform)"_ — the answer to the question asked. A dossier built the recommended way told a recipient they had never answered questions they had answered. Same class as the BL-119 alias defect that preceded it: confidently wrong output, in front of a partner.

The cause was a workflow the tooling never learned. GST pre-populates research into **Comments**, source pointers into **File Location** and caveats into **Notes**; the recipient confirms by setting **Status**. Nothing in the extractor, the prompt, or the workbook's own Instructions sheet described that.

**A second defect surfaced while fixing the first**: [`irl-ingestion.ts`](../../../mcp-server/src/prompts/irl-ingestion.ts) contained **no xlsx-reading guidance at all**. The model-reconstruction path and the extractor agreed only by coincidence — and the extractor's own comment claiming its omission matched "the same shape the model uses in reconstruction" was false; the one observed reconstruction captured Comments.

## Decision

**1. The canonical body reads all seven columns.** Each filled row renders as:

```
- <ref> <request> [<STATUS>] — <answer> (Source: <D>) (Note: <F>)
```

**2. Comments is an answer, not a caveat, and is not labelled as unconfirmed.** `<answer>` is column G and column E joined into **one contiguous span**, G first, separated by a single space, with a period inserted **unless G already ends in `.` `?` `!` `:` `;` `,` `…` or a dash**, tested after any closing brackets and quotes are peeled off. Status does not gate inclusion.

_Rejected: a labelled separator_ (`| Comments: <E>`). `validate_irl_provenance` matches citation excerpts by normalized substring with an 8-word contiguous-run fallback; `normalizeForMatching` strips punctuation but not pipes, and does not strip an injected label word. A citation spanning the G→E boundary with the separator dropped scored a longest run of **6** against `FUZZY_MIN_RUN = 8` — **unverified**, which auto-appends `provenance-gap:` to section (J) of a partner-facing dossier. Cross-boundary citations are the _expected_ shape once answers live partly in each column, so the separator had to vanish under normalization. A period does; a label does not. The counterfactual is executable, at `tests/unit/schemas/validate-irl-provenance.test.ts` → _"would NOT verify that citation under a labelled separator"_.

_Also rejected: patching the matcher_ to tolerate the separator. It couples a hardened shared verifier to a body-format choice — and it would not have worked anyway, since flattening the pipe still leaves the label word inside the span.

_Also rejected: labelling Comments-sourced answers as unconfirmed in the body._ The operator decision is that Comments is a normal answer. Instead the extractor **enumerates the affected refs to the operator at extract time** (see Consequences), which changes no bytes, no hash and nothing a client sees.

**3. File Location and Notes stay outside the answer slot.** A row whose only content is a VDR filename renders `— <NO RESPONSE> (Source: …)`.

This is what keeps the fill ratio honest. The prompt's pre-flight **HALTs the entire run below 15%** substantive cells, shifts framing at 40%, and several inclusion gates test bare non-emptiness. Had `Source: VDR/03/overview.pdf` landed in the answer slot, a row carrying only a filename would read as answered — inflating the ratio across both boundaries and opening gates 2, 4 and 6. `UAT-07` reached the same conclusion from the other direction: an extractor mis-reading the layout "would publish source-document filenames as the recipient's answers."

**4. Both paths are taught the same contract.** The prompt gains a **workbook column contract** section in every served body — interactive included, because its own VERIFY block admits `xlsx-reconstruction`. It states the seven columns, the composition rule, the instruction to **trust the data sheet's header row and never the Instructions sheet** (workbooks in the wild document a stale five-column layout with Response in column D), the fill-ratio counting order (**compose the answer span first, then count**), and citation hygiene.

**5. The verifier is deliberately left uncoupled from the body format.** See the residual below.

## Consequences

**Cites this decision**: `mcp-server/scripts/extract-irl-markdown.mjs` (module docstring + `joinAnswerSpan`), `mcp-server/src/prompts/irl-ingestion.ts` (`WORKBOOK_COLUMN_CONTRACT`), `mcp-server/BREAKING_CHANGES.md` § 0.49.2, `mcp-server/src/docs/prompts/irl-ingestion.md`, `src/docs/development/IRL_PARTNER_PASTE_RUNBOOK.md`.

**Bodies get materially larger.** The measured workbook went from 51,788 to 79,079 bytes. Nothing breaks server-side (`IRL_BODY_CACHE_MAX_BYTES` is 200KB) and the supported Desktop → prompt-arg → prepop path never emits the body — but **claude.ai web refuses a prompt argument above ~57KB outright**. The extractor prints a note scoped strictly to that, rather than a general "large body" warning that would fire on essentially every real workbook.

**Two operator-facing ref lists**, returned from the pure function and printed by the CLI:

- **Status contradictions** — Status is `CLOSED`/`PARTIAL` with every content column empty. A real contradiction, previously silent.
- **Comments-sourced answers** — Response empty, Comments populated, so the body's answer came from Comments alone. This is the precise legacy-risk set: where Response is non-empty, Comments rides alongside a real answer and the row is answered either way. On the measured workbook that is 18 rows rather than all 73.

  **These are also 18 rows, but not the same 18** as the Context section above, and the coincidence is worth naming so a future reader does not treat one number as evidence for the other. The Comments-sourced set drops `5-13` (Status claims an answer, but nothing is anywhere) and adds `2-15` (marked **OPEN** while carrying 400+ characters of Comments). The predicates differ deliberately: the ref list keys on Response-empty ∧ Comments-present precisely because **Status is the unreliable field here** — it is what was wrong on both of those rows.

**Accepted residual — a filename can verify.** Column D was never in the haystack before; now it is. A claim citing `VDR/03-Product/product-overview-2026.pdf`, or a Note tail like `pending partner confirmation`, **verifies** — and therefore gets **no** auto-appended `provenance-gap:`. The dossier reports it as anchored. A filename is not evidence for a number, and this is the initiative's own "confidently wrong in front of a partner" class arriving through a new door.

The only mechanical fix would teach `validate_irl_provenance` to reject excerpts matching solely inside a `(Source: …)` span — the exact matcher/format coupling rejected above. So this is handled **by directive** (the prompt's citation-hygiene rule: cite from the answer slot only) and pinned by a test that asserts the residual _does_ verify, so a future reader meets it deliberately rather than discovering it in a client dossier.

**Accepted residual — pre-change workbooks are ambiguous, and the ambiguity reaches the fill ratio.** Workbooks filled under the old Instructions, which invited caveats into Comments — with the literal examples _"scheduled for Q3 refresh"_ and _"confidential, discuss in call"_ — legitimately mix GST research with recipient remarks.

This is not only a readability problem. On a legacy workbook those strings now land **unlabelled in the answer slot**. They are not blank and they are not one of the placeholder forms the substantive test excludes (`n/a` / `not yet tracked` / `open` / `--` / `TBD` / one-character), so they **count as substantive**: they inflate the fill ratio and can open inclusion gates 2, 4 and 6 — the exact property this ADR argues Source/Note placement protects, arriving through column E instead of D. Keeping D and F out of the answer slot handles filenames and caveats; nothing mechanical handles a non-answer that a recipient was _told_ to put in Comments. The forward fix is the Instructions change below; for workbooks already filled, the Comments-sourced ref list is the control. Stated precisely: the separation is lost **in the extracted body**, not absolutely. The workbook still holds all seven columns and an operator can open it, and the Comments-sourced ref list names exactly which rows to check. `generate-xlsx.ts` now tells recipients that D/E/F are read into the deliverable and routes non-answers ("scheduled for Q3 refresh", "confidential, discuss in call") to **Notes**, so the ambiguity does not accumulate going forward.

**How the join rule was re-validated.** The rule was rewritten once under code review (the first phrasing — "add a period when G ends in an alphanumeric or a closing bracket" — silently omitted the period after `14%` or `$4.15M +`, and could not see through a closing quote, so `"we ship weekly,"` produced the `,".` artifact the comma rule exists to prevent). Re-extracting the reference workbook after that rewrite produced byte-identical output, which is a stronger coincidence than it sounds: it holds because **55 rows carry both Response and Comments — the only rows the rule touches — and the old and new rules were executed against all 55 and disagreed on none.** No cell in that set ends in a percent, a plus, a curly quote, a quoted comma, or a bracketed period. Recorded because "byte-identical" alone would be exactly the kind of claim this ADR is about.

**Cosmetic edge, not special-cased**: peeling closing quotes means a Response ending `…this."` is correctly read as already terminated — but one ending `…the rating engine”`, where the quoted content does _not_ terminate, gains its period **after** the closing quote. Putting it inside would need a parser this does not want, and the normalizer flattens quotes and periods alike, so nothing downstream sees either.

**Revisit triggers**: a client asks for Comments-sourced answers to be visually distinguished in the dossier; or `validate_irl_provenance` gains a span-aware matching mode for reasons of its own, at which point the filename residual becomes cheap to close.
