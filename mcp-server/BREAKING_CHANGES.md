# Breaking changes — `@gst/mcp-server`

> **Discipline introduced under [BL-032](../src/docs/development/MCP_SERVER_REMOTE_BL-032.md) Phase 4b**.
>
> Tool names, prompt names, and Resource URIs are part of the package's public contract — pinned client conversations, agent code, and external clients (BL-033) all reference them by name. A rename or removal here is a breaking change for every consumer.
>
> **Every entry in this file ships with a corresponding `version` bump in [`package.json`](./package.json) and is mirrored in the [BL-032 architecture doc](../src/docs/development/MCP_SERVER_REMOTE_BL-032.md) Q-section that triggered it.** BL-032.5 Phase 4 formalizes the discipline with the **manifest-hash test** at [`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts) — the hash is computed over the registered Library/Regulation/Radar URIs + prompt `name@version` tuples; any drift fails the test and surfaces the new hash in the error message.

---

## Current manifest hash

```
b702aa38df95e959bbf6f9f8ffac27460f0bbb7e3511c4253eb1781692d1a84d
```

Computed over (sorted):

- 3 Library URIs (`gst://library/business-architectures`, `gst://library/vdr-structure`, `gst://library/information-request-list`)
- 120 Regulation URIs (`gst://regulations/<jurisdiction>/<framework-id>`)
- 6 Radar URIs (FYI latest + Wire latest + 4 Wire categories)
- 10 prompt `name@version` tuples (`gst_*`) — `gst_information_request_list` at `0.0.4` (Claude Desktop redirect) + `gst_diligence_sweep` at `0.0.5`

If this hash differs from the value in
[`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts) → `EXPECTED_MANIFEST_HASH`,
the test will fail with a remediation message. Update **both** values
in lockstep when the registry shape changes.

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

**Architecture context**: BL-044 post-merge polish (live screenshot 2026-05-25 surfaced the styling no-op). Library-choice rationale + Workers-compatibility verification documented in [`MCP_SERVER_IRL_GENERATOR_BL-044.md` § "Library choice"](../src/docs/development/MCP_SERVER_IRL_GENERATOR_BL-044.md#library-choice--xlsx-js-style).

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

**Architecture context**: [BL-044 in BACKLOG.md](../src/docs/development/BACKLOG.md#bl-044-information-request-list--fillable-form-generator). Tracking doc at [`src/docs/development/MCP_SERVER_IRL_GENERATOR_BL-044.md`](../src/docs/development/MCP_SERVER_IRL_GENERATOR_BL-044.md) (added in this release).

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

**Architecture context**: Findings from a 4-agent parallel audit of the post-demo Scenario 7 sweep output, with full audit transcripts retained in conversation context. The audit identified that the v0.0.3 dedup, deeplink, and sentinel-discipline patches partially landed but with three material residual errors; v0.0.4 closes the residuals. [BL-032.6 demo Scenario 7](../src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7).

---

## 0.3.3 — 2026-05-22 — `compute_techpar` deeplink emits `b=annual` (wizard hydration fix)

**Theme**: fix the TechPar wizard hydrating MCP-generated deeplinks at ~7× the correct `totalTechPct` due to a missing URL-state flag.

### Changed

- **Tool**: `compute_techpar` deeplink now includes `b=annual` as a URL param. Behavior change to the tool's response shape (`deeplink` field); no schema change.

**Why**: BL-031.95 standardized the TechPar tool API on annual units — the `infraHostingAnnual` field carries an annual value, and `serializeToParams` writes it to URL key `h` as-is. The website's TechPar wizard, however, has two infra-cost-period modes (monthly / annual) and **defaults `infraPeriod` to `'monthly'`** ([`src/utils/techpar/state.ts:35`](../src/utils/techpar/state.ts#L35)). In monthly mode, the wizard's `buildInputs()` multiplies the field's DOM value by 12 before sending to the engine ([`src/utils/techpar/dom.ts:569`](../src/utils/techpar/dom.ts#L569)). The wizard's own URL writer sets `b=annual` only when the user has manually toggled to annual mode ([`src/utils/techpar/dom.ts:597`](../src/utils/techpar/dom.ts#L597)); the MCP-side `buildTechparDeeplink` was not setting `b` at all.

Effect on partner experience: clicking the "Open TechPar Wizard" link from the `gst_diligence_sweep` dossier loaded a wizard view that **multiplied the already-annualized hosting figure by 12**, producing a wildly-inflated total tech / ARR ratio (live finding 2026-05-22: a healthcare-RCM target at $23.4M annual hosting / $45.2M ARR restored as **655.6% vs the correct 92.4%**).

Fix: one-line addition in [`buildTechparDeeplink`](./src/tools/techpar.ts#L26) — `params.set('b', 'annual')` after the existing `serializeToParams` call. Preserves the wizard's existing in-wizard URL-writing behavior; aligns the MCP-side deeplink with the unit convention the tool already uses internally.

**Operator semantics**: patch bump per the discipline (tool response-shape change with no name/schema change → patch bump). Pinned conversations continue to resolve `compute_techpar` identically; the only behavior change is one URL param appended to the `deeplink` field.

**Architecture context**: [BL-032.6 demo Scenario 7](../src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7) — surfaced when the post-demo TechPar wizard click-through showed implausible numbers.

---

## 0.3.2 — 2026-05-22 — `gst_diligence_sweep` v0.0.3 body refinements (second live-exercise + post-demo)

**Theme**: close the two findings from the second live exercise that the v0.0.2 deploy didn't fix at the prompt-body level. Both fixes were held until after the BL-032.6 demo to keep the deployed contract stable; demo ran clean; shipping the patches now.

### Changed

- **Prompt body**: `gst_diligence_sweep` bumped `0.0.2 → 0.0.3`. Two body refinements:
  - **Deeplink directive verb strengthened**: Steps 3-7 now use `Surface ... in the dossier` (output verb) instead of `Capture ...` (working-memory verb). The v0.0.2 live exercise showed the model honored "Surface" (sections B Agenda + G Comparables — using v0.0.1 phrasing) but silently dropped "Capture" for the new v0.0.2-added directives (sections C TechPar / D ICG / E Tech Debt / F Regulatory / H Radar) — leaving 5/7 sections without their Open-in-Hub link. v0.0.3 mirrors the v0.0.1 phrasing literally across all five new directives. Step 8's section descriptions (C/D/E/F/G/H) also hoist the `**MUST close with [Open X Wizard](deeplink)** — this is non-optional` directive to the **first sentence** so the model attends to it before the freeform-writing guidance.
  - **TechPar engCost / infraPersonnel dedup guard**: Step 4 now carries explicit guidance: `engCost` covers R&D engineering headcount NOT also booked as infra personnel. The v0.0.2 live exercise had the model pass all 58 engineers into `engCost` AND 8 SRE into `infraPersonnel`, double-counting the SRE headcount (once in synthesized R&D OpEx, once standalone) and inflating total tech / ARR by ~4 points (92.4% reported vs ~88% corrected). v0.0.3 explicitly instructs the partition (e.g., "58 total — 38 product + 8 SRE + 3 security + 7 data + 2 platform DX" → 8 in `infraPersonnel`, remaining 50 in `engCost`).

**Operator semantics**: patch bump per the discipline (prompt `version` field bump with same name → patch). Behavior change without surface-area change; pinned conversations continue to resolve `gst_diligence_sweep` to the (now-newer) prompt.

**Architecture context**: live-exercise findings captured in [`mcp-server/tests/examples/diligence-sweep.golden.md`](./tests/examples/diligence-sweep.golden.md) § v0.0.3 candidate patches (now shipped). [BL-032.6 demo Scenario 7](../src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7) demo invocation directive (`Surface each GST Hub Tool deeplink at the close of its corresponding section`) was the front-line workaround that masked the deeplink regression during the demo; v0.0.3 makes that workaround unnecessary at the prompt-body level.

---

## 0.3.1 — 2026-05-22 — `gst_diligence_sweep` v0.0.2 body refinements (live-exercise driven)

**Theme**: sharpen the sweep prompt body based on live-exercise findings against the MedSig populated-IRL fixture.

### Changed

- **Prompt body**: `gst_diligence_sweep` bumped `0.0.1 → 0.0.2`. Three body refinements:
  - **Portfolio-facet literalness** (Step 2): the model now uses theme / industry names returned by `list_portfolio_facets` verbatim — the live exercise surfaced a retry where the model guessed `Healthcare Tech` when the canonical theme is `Healthcare`.
  - **EU AI Act conditional** (Step 3): when Section 05 names production ML/AI AND Section 00 geographies include the EU, add an EU AI Act `search_regulations` call (healthcare-domain decision-support ML typically classifies as Annex III high-risk; the IRL itself is often silent on this exposure).
  - **Deeplink coverage across every section** (Steps 3-7 + dossier sections C/D/E/F/H): v0.0.1 only surfaced the "Open in Hub" deeplink for sections (B) Agenda and (G) Comparables. v0.0.2 wires the deeplink from every tool that returns one — `compute_techpar` (TechPar wizard), `assess_infrastructure_cost_governance` (ICG wizard), `estimate_tech_debt_cost` (Tech Debt Calculator), `search_regulations` (Regulatory Map, one per framework), `search_radar` (Radar feed). The deeplinks open the corresponding Hub surface with state pre-populated, bridging the read-only dossier to the partner-refinable interactive tool. **The live-exercise transcript triggered the gap** — when only 2/7 sections carried Open-in-Hub links, the dossier lost its bridge back to the interactive Hub for the bulk of the analysis.

**Operator semantics**: patch bump per the discipline (prompt `version` field bump with same name → patch). Behavior change without surface-area change; pinned conversations continue to resolve `gst_diligence_sweep` to the (now-newer) prompt.

**Architecture context**: [BL-032.6 demo Scenario 7](../src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7) + live-exercise transcript captured in [`mcp-server/tests/examples/diligence-sweep.golden.md`](./tests/examples/diligence-sweep.golden.md).

---

## 0.3.0 — 2026-05-22 — BL-032.6 Scenario 7 — `gst_diligence_sweep`

**Theme**: ship the bookend to `gst_information_request_list`. The IRL prompt emits the _request_ artifact; the new sweep prompt ingests a _populated_ IRL and uses the full content to drive every Hub tool surface and downstream prompt artifact — the "high-fidelity intake → full platform sweep" workflow.

### Added

- **MCP Prompt**: `gst_diligence_sweep` (v0.0.1) — bookend to `gst_information_request_list`. Takes the populated IRL the target returns plus optional `targetName` / `transactionContext` / `partnerLead` / `projectCodeName` framing. Orchestrates 9 tools (`generate_diligence_agenda`, `list_portfolio_facets`, `search_portfolio`, `list_regulation_facets`, `search_regulations`, `compute_techpar`, `assess_infrastructure_cost_governance`, `estimate_tech_debt_cost`, `search_radar`) and embeds two Library resources (`gst://library/information-request-list` for taxonomy reference, `gst://library/vdr-structure` for synthesis follow-ups). Output is a unified nine-section dossier with no `'unknown'` defensive widening.

**Operator semantics**: this is an **additive** change — no URIs or prompt names were renamed or removed. Per the discipline above (prompt-name addition → minor bump), `mcp-server/package.json` bumps `0.2.0 → 0.3.0`.

**Pinned conversation impact**: none. Existing pinned URIs and prompt names continue to resolve.

**Architecture context**: [BL-032.6 demo Scenario 7](../src/docs/development/MCP_SERVER_DEMO_SCRIPT_BL-032_6.md#scenario-7).

---

## 0.2.0 — 2026-05-22 — BL-043 Information Request List

**Theme**: ship the Information Request List as a Library article + MCP Resource + MCP Prompt.

### Added

- **Library article + Resource**: `gst://library/information-request-list` — universal one-page intake checklist organized by VDR taxonomy (00 Basics + sections 01-09 mirroring VDR-9). Codegen auto-picked up via `mcp-server/scripts/generate-regulations-index.mjs`.
- **MCP Prompt**: `gst_information_request_list` (v0.0.1) — assembles the input-gathering ask GST hands to a target/client before running diligence tools. Embeds the canonical Resource as the second message; supports optional `targetName`, `transactionContext`, and `productSummary` args for light personalization.

**Operator semantics**: this is an **additive** change — no URIs or prompt names were renamed or removed. Per the discipline above (URI / prompt-name addition → minor bump), `mcp-server/package.json` bumps `0.1.0 → 0.2.0`.

**Pinned conversation impact**: none. Existing pinned URIs and prompt names continue to resolve.

**Architecture context**: [BL-043 design doc](../src/docs/development/MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md).

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

**Architecture context**: [BL-032.5 design doc § Repo placement and lifecycle](../src/docs/development/MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md#repo-placement-and-lifecycle).

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

**Architecture context**: [BL-032 Q2](../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited) records the three options considered (rename + alias / coexist / drop offline) and the decision to rename + alias.

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
