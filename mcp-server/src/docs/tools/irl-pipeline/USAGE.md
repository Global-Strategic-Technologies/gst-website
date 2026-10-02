# Usage — the IRL / dossier pipeline: From the Ask to the Dossier

A complete end-to-end example of driving the IRL family of the [`@gst/mcp-server`](../../../../README.md) for a real-shaped engagement: scoping an Information Request List for a buy-side target, sending it, and turning the partner's returned answers into a dossier.

This document is a **stakeholder orientation aid**. It answers "what does it actually look like to use this" without requiring the reader to read the contract first. The calls below are the ones [UAT-07](../../testing/uat/UAT-07-irl-pipeline.md) executed. Counts are deliberately not quoted here, because the canonical question source changes: `list_irl_requests` reports the live figures.

> Companion docs: [`CONTRACT.md`](./CONTRACT.md) (per-field input reference; it wins on any conflict with this walkthrough) | [`../README.md`](../README.md) (registry of all per-tool contracts) | [`../irl-fill/USAGE.md`](../irl-fill/USAGE.md) (pre-filling the workbook yourself) | [`UAT-07`](../../testing/uat/UAT-07-irl-pipeline.md) (acceptance walkthrough).

> **This walkthrough follows the path that is staying.** The family also carries three provenance tools (`prepare_irl_body`, `validate_irl_provenance`, `compose_dossier_envelope`) that serve the older `gst_irl_ingestion` prompt. They are slated for removal under [BL-143](../../../../../src/docs/development/BACKLOG.md#bl-143-trust-the-operator-irl-ingestion-rebuild-gst_irl_sweep), so they appear only under [The legacy path](#the-legacy-path) below.

---

## The scenario

A deal team is running buy-side technology diligence on **Northwind Health**. The first conversation with the target is next week, and the partner wants the information request in the target's hands before it, scoped to what this phase actually needs:

1. **Only two areas for now**: Basics and Infrastructure & Operations. The rest of the IRL comes in a later round.
2. **One question dropped**: the target's capital-expenditure detail is coming through the finance workstream, so the tech IRL should not ask for it twice.
3. **A buy-side voice**: questions written for a sell-side or value-creation engagement should not appear.

When the target returns the workbook, the same team wants every applicable Hub analysis run against the answers, in one pass.

---

## Step 1 — Find the keys you will exclude by

`list_irl_requests` takes no arguments and returns the canonical question set:

```json
{ "tool": "list_irl_requests", "arguments": {} }
```

Each entry carries a `key`, its `section` and `sectionTitle`, the question `text`, and an optional `skipIf` naming the engagement contexts that remove it automatically. You need this call for one reason: **it is the only way to turn "drop the capex question" into the key the generator accepts.** Here that key is `03-08`, the eighth question of section 03.

> **Two reference formats, not one.** `excludeRequests` takes the `NN-II` key from this tool (`03-08`). The generated workbook prints a different Reference column (`3-08` style). [`irl-fill/USAGE.md`](../irl-fill/USAGE.md) uses the workbook form. Do not carry one into the other's field.

---

## Step 2 — Emit the ask

### What you actually type

In a client with the GST connector:

> Generate the GST information request list for Northwind Health as a buy-side engagement. Only include the Basics and Infrastructure sections, and drop the capital-expenditure question.

Or, in one line, invoke the **`gst_irl_create`** prompt with the same configuration. It assembles the ask and makes this tool call for you, forwarding every option.

### The call

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

**Three independent subtractions compose here**, and each one maps to a line of the scenario:

| Scenario need               | Argument             | What it removes                                                                                                                                     |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basics + Infrastructure     | `includeSections`    | Every section not listed                                                                                                                            |
| No duplicate capex question | `excludeRequests`    | `03-08`, by key                                                                                                                                     |
| Buy-side voice              | `transactionContext` | Every question whose `skipIf` names `buy-side` (today: `00-02`, the "engagement context" question, which the context argument has already answered) |

Surviving questions keep their Reference IDs, so the target sees gaps in the numbering and reads them as deliberate. The response's `bulletCount` lets you check the arithmetic by hand: the two sections' questions, minus one exclusion, minus one skip-if. UAT-07.2 records the exact figures.

To add a question the canonical set does not ask, pass `customRequests: [{ "section": "03", "text": "…" }]`. Custom rows land at the end of their section.

### What comes back

```typescript
{
  filename: "GST-IRL-Northwind-Health-<today>.xlsx",
  base64: "…",        // the workbook bytes
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  byteLength, sectionCount, bulletCount,
  downloadUrl: "https://globalstrategic.tech/hub/tools/information-request-list-generator/?target=Northwind+Health&context=buy-side&sections=00%2C03&exclude=03-08",
  canonicalUrl: "…",  // the library article
}
```

**Send people to `downloadUrl`, not `base64`.** It opens the Hub generator with this call's configuration pre-filled, one click from the `.xlsx`. In Claude Desktop the `base64` field is replaced by a marker in the text the model sees, by design. A programmatic consumer that wants the bytes reads `structuredContent`. Two identical calls produce different filenames, because the filename carries the date. That is expected.

---

## Step 3 — The partner returns it

The target fills in the Comments and File Location columns and sends the workbook back. Your next step depends on what arrived:

- **The `.xlsx` itself.** Flatten it to the markdown body the prompts expect. You can use the browser extractor at `/hub/tools/information-request-list-extractor/`, or, with a checkout:

  ```bash
  npm -w @gst/mcp-server run irl:extract -- path/to/returned.xlsx --out northwind-irl.md
  ```

  Both produce byte-identical output. The conversion is deterministic, which is the reason to use it over asking the model to read the spreadsheet.

- **Markdown already**: use it as is.

- **Nothing yet, but you hold evidence of your own** (filings, a data-room export, earlier calls): you can pre-fill the workbook before or instead of the target's reply. That is [`fill_information_request_list_xlsx`](../irl-fill/USAGE.md), and its output feeds Step 4 exactly as a target-returned workbook does.

---

## Step 4 — Turn the answers into a dossier

### The full sweep: `gst_irl_sweep`

Invoke `/gst_irl_sweep` with the IRL in `filledIrl`, or attach it to the invoking message, or paste it in the conversation and invoke with no arguments. **All three behave identically.**

There is nothing else to configure:

- **Target and engagement context are read from the IRL**, from the `> Target:` and `> Engagement context:` lines that `irl:extract` writes under the title. Rows 0-01 (Company name) and 0-02 are the fallback, for a body that lacks those lines. The context only sets the voice and never changes which tools run. If no target can be found, the prompt asks for it.
- **How the IRL arrived never matters**, and **the only halt is a blank template.** Any other fill ratio proceeds. The ratio is stated in the dossier's first section, and thin sections are listed in its (J) Gaps & assumptions section.
- **Each Hub tool runs only when the IRL can feed it.** TechPar, for example, needs ARR and a cost signal. A tool whose inputs are absent is named in (J) with the reason, rather than run on guesses.

What you get is one dossier: each tool's section closing with its Hub deeplink, follow-up asks mapped to data-room folders, and an honest (J). The dossier says "per the IRL". It does not claim the server verified the answers, because under this prompt nothing does. A populated IRL is trusted operator input. [`prompts/irl-sweep.md`](../../prompts/irl-sweep.md) has the full contract.

### The portable record: `gst_irl_extract`

When you want the answers in a form other prompts can reuse, rather than a dossier now, invoke `/gst_irl_extract` with the same IRL. It makes **no tool calls**. It emits:

- a `record: irl-extract` fence (record v2),
- one `payload: <tool>` fence per tool the IRL can feed, holding the arguments that tool would take, and
- `elided:` lines for tools it cannot feed, naming the missing input.

Paste that record into a later conversation, for example ahead of `gst_target_quick_look`, and the consumer resolves its inputs from the record by matching each fact's request text. No mapping table is needed.

---

## The iteration pattern

1. **Second-round IRL.** When the deal moves past the first phase, re-run Step 2 with the remaining sections in `includeSections`. The Reference IDs stay stable across rounds, so answers from both rounds line up.
2. **Thin answers.** The sweep's (J) lists thin sections and tools that could not run. Turn those into a short follow-up IRL: `includeSections` for the thin sections, `excludeRequests` for questions already answered well.
3. **Re-running the sweep after more answers arrive** costs one invocation. Paste the updated IRL into a fresh conversation, so the dossier is built only from the latest answers.

---

## The legacy path

`gst_irl_ingestion` is the sweep's predecessor and still works. It routes the IRL through three provenance tools. `prepare_irl_body` caches the body and returns a hash. `validate_irl_provenance` checks citations against it. `compose_dossier_envelope` assembles the audited envelope. All three are documented in full in [`CONTRACT.md`](./CONTRACT.md) and exercised by [UAT-07.3–07.8](../../testing/uat/UAT-07-irl-pipeline.md#uat-073--seed-the-body-cache).

They coexist with `gst_irl_sweep` until its live verification (UAT-09.11 and 09.12) clears. Then BL-143's removal PR deletes them. **New work should use Step 4.** This section goes with them.

---

## Why this matters (the value summary for stakeholders)

- **The ask is scoped, not generic.** Three subtractions and custom rows let one canonical IRL fit an engagement phase, and the gaps it leaves are visible to the target as choices.
- **The download is one click.** `downloadUrl` reproduces the exact configuration on the Hub, so nobody hand-recreates it.
- **One invocation turns answers into analysis.** The sweep reads target and context from the IRL itself and runs every Hub tool the answers support.
- **Missing data is reported, not papered over.** Tools the IRL cannot feed are named with the reason, and thin sections become the next round's ask.

---

## Reproducing this walkthrough

1. Register the GST MCP server in your client ([`SETUP.md`](../../testing/uat/SETUP.md)).
2. Run Steps 1 and 2 as written. The `downloadUrl` should carry `target`, `context`, `sections` and `exclude` matching the call.
3. Fill a few rows of the downloaded workbook yourself, flatten it with `irl:extract`, and run Step 4.

The acceptance-grade version of Steps 1–2, with expected values and failure modes, is UAT-07.1 and 07.2. Step 4's are [UAT-09.11 and 09.12](../../testing/uat/UAT-09-prompts.md#uat-0911--gst_irl_sweep-trust-the-operator-ingestion).

---

## Related documentation

- [`CONTRACT.md`](./CONTRACT.md): every field, constraint and output shape for the family
- [`prompts/irl-sweep.md`](../../prompts/irl-sweep.md): the sweep and its sibling extract prompt
- [`../irl-fill/USAGE.md`](../irl-fill/USAGE.md): pre-filling the workbook from evidence you hold
- [`library/irl-tool-input-mapping.md`](../../library/irl-tool-input-mapping.md): which IRL question feeds which Hub tool input
- Live generator: <https://globalstrategic.tech/hub/tools/information-request-list-generator/>
