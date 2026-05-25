# MCP Server — Information Request List Generator (BL-044)

> **Backlog initiative**: [BL-044: Information Request List — Fillable-Form Generator](BACKLOG.md#bl-044-information-request-list--fillable-form-generator)
>
> **Companion docs**:
>
> - [MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md) — read first. BL-044 consumes the article authored under BL-043 unchanged; this initiative is the fillable-form layer on top.
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture, repo placement, lifecycle.
> - [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — registered-prompt pattern, maturity bar (golden file, lastReviewedAt, orchestrates body-mention).
> - [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) — semver-as-contract log; the 0.3.5 entry documents this initiative's surface additions.
>
> **Predecessors**: BL-043 (canonical article + Resource + prompt), BL-031.75 (prompt-library maturity bar).
>
> **Sequels**: A future BL-045 candidate may add a filled-IRL ingestion prompt (`gst_intake_filled_irl`) that converts a partner's filled-in `.xlsx` into canonical inputs for `compute_techpar` / `assess_infrastructure_cost_governance` / `estimate_tech_debt_cost` / `generate_diligence_agenda`. BL-044 ships the structured response format that a future BL-045 would parse. **Explicitly out of scope for BL-044.**
>
> **Scope**: ship the fillable-form layer on three surfaces in one PR — a Hub tool at `/hub/tools/information-request-list-generator/` (client-side .xlsx download), an MCP tool `generate_information_request_list_xlsx` (server-side, Workers-compatible), and a prompt evolution from `gst_information_request_list@0.0.1` to `0.0.2` that orchestrates the new tool when called with args.
>
> **Status**: Implementation landed 2026-05-24 (`mcp-server@0.3.5`). Pending blocking gates: senior-consultant review of the live workbook ergonomics + a manual smoke test in Excel/Numbers/LibreOffice across the three readers.

---

## Three-surface design

The article authored under BL-043 is the **single source of truth**; every surface in BL-044 reads from it via the same `gst://library/information-request-list` Resource path so partner-facing text, partner-facing file, and the agent-embedded Resource never drift.

```
src/data/library/information-request-list/article.md     ← authored
                       │
                       ▼
src/utils/irl/parse-article.ts → IRLArticle AST          ← pure, deterministic
                       │
                       ▼
src/utils/irl/generate-xlsx.ts → Uint8Array (.xlsx)       ← pure, Workers + browser safe
                       │
            ┌──────────┼──────────────────────────────────┐
            ▼          ▼                                  ▼
  Hub tool         MCP tool                       gst_information_request_list v0.0.2
  (Astro page)     (Worker handler)               (prompt body Step 4 calls the tool)
  /hub/tools/...   generate_information_..._xlsx  one-shot mode only
```

### Surface 1 — Hub tool (`/hub/tools/information-request-list-generator/`)

- Slug deliberately distinct from `/hub/library/information-request-list/` (the BL-043 reference article) to avoid URI collision.
- Client-side generation: the page imports `article.md?raw`, parses + generates inside the browser, triggers a `Blob` download. Zero server round-trip per click.
- Bundle cost: `xlsx-js-style` adds ~250 KB minified (browser bundle measured at build time). Acceptable for an opt-in tool page; the same library powers the MCP-side surface so total runtime footprint is one dep.
- Optional inputs: `targetName` (text) + `transactionContext` (radio). Both write into the workbook header AND, for targetName, the filename slug.
- Card on `/hub/tools` landing index (6th card, alongside Regulatory Map / Diligence Machine / Tech Debt / ICG / TechPar).

### Surface 2 — MCP tool (`generate_information_request_list_xlsx`)

- Registered in `createServer()` ([`mcp-server/src/server.ts`](../../../mcp-server/src/server.ts)) — transport-portable; runs on both stdio and the Cloudflare Workers entrypoint.
- Pure-function pipeline: `loadLibraryByUri('gst://library/information-request-list')` → `parseIrlArticle` → `generateIrlXlsxBuffer` → chunked `btoa`.
- Returns `{ filename, base64, mimeType, byteLength, sectionCount, bulletCount, canonicalUrl }`. Claude Desktop and other MCP clients can write the file or attach it to a message.
- Input shape matches the `gst_information_request_list` prompt args (`targetName?`, `transactionContext?`, `productSummary?`) so the prompt can forward its args verbatim to the tool.

### Surface 3 — Prompt evolution (`gst_information_request_list@0.0.2`)

- Patch-style bump per the [BL-031.75 maturity bar](MCP_SERVER_PROMPTS_BL-031_75.md): same name, additive behavior, no removed orchestrations.
- One-shot body (when ANY arg is supplied) now includes a Step 4 directing the model to call `generate_information_request_list_xlsx` with the same args and attach the returned file. The partner gets a paste-ready text artifact AND a downloadable workbook in the same turn.
- Interactive body (bare invocation) UNCHANGED. Per BL-044 acceptance: "Bare invocation (interactive mode) unchanged behaviorally — still emits text-only." Catches the case where a user invokes the prompt purely for in-chat reference.
- `orchestrates` extended from `[RESOURCE_URI]` to `[RESOURCE_URI, 'generate_information_request_list_xlsx']`. The body-mention invariant is satisfied per-mode: the URI appears in both modes (embedded as second message via `embedLibraryArticle`); the tool name appears only in the one-shot body (per the additive-behavior contract).

---

## Library choice — `xlsx-js-style`

**Final pick**: [`xlsx-js-style`](https://www.npmjs.com/package/xlsx-js-style) — a maintained MIT-licensed fork of SheetJS Community that adds full style write support (font, fill, border, alignment). Pure JS, zero native deps, Workers + browser + Node compatible.

**Why not `@e965/xlsx`** (the original Phase 0 pick): `@e965/xlsx` is an auto-republish of SheetJS Community Edition, which silently drops `cell.s.font` on write. Bold + larger font on column headers and section header rows surfaced visually as plain text in Excel (live screenshot 2026-05-25). Swap to `xlsx-js-style` resolves it; the OOXML `xl/styles.xml` inside the generated file now contains real `<font><b/><sz val="13"/></font>` entries that Excel / Sheets / LibreOffice honor.

**Why not `exceljs`**: Node-only (depends on `stream`, `Buffer`, `tmp`). Incompatible with the Cloudflare Workers runtime.

**Why not stock `xlsx` from npm**: SheetJS abandoned the npm package; official install moved to a CDN-only tarball and the npm version carries unpatched CVE-2023-30533.

Verified compatibilities:

- **Workers**: `XLSX.write(wb, { type: 'array' })` returns a `Uint8Array` with no `Buffer` dep. No `nodejs_compat` flag required.
- **Browser**: same API, returns the same shape. Wrap in `new Blob([buffer])` for download.
- **Node**: works in Vitest under both `node` and `jsdom` environments (used by the unit tests).
- **Style write**: `<b/>` + `<sz val="13"/>` confirmed present in `xl/styles.xml` post-write. Verified by the OOXML-inspection unit test in `generate-irl-xlsx.test.ts`.

**Round-trip read limitation**: `xlsx-js-style`'s READ path strips `cell.s.font` metadata back to a partial shape (`{ patternType: 'none' }` only). So style verification in tests cannot use the round-trip-read pattern; we unzip the .xlsx and inspect `xl/styles.xml` directly via a small inline ZIP walker in the test file.

**Gotcha**: do not import `xlsx-js-style/dist/cpexcel` (optional codepage support) — it inflates the bundle past the free Workers tier. The core package doesn't need it for ASCII / UTF-8 IRL content.

---

## Workbook structure (BL-044 Phase 0 decision)

**One worksheet** with styled section header rows, NOT one worksheet per section. Easier to skim, easier to email-screenshot a single section in context, supports Excel row-outline grouping.

**Five columns** (Reference + Location added in post-merge follow-up; Notes added in second follow-up):

| Col | Heading         | Purpose                                                                                                                                                                                |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `Reference`     | Short ID per request, format `<sectionDigit>-<NN>` — Basics first bullet = `0-01`, Product first = `1-01`, Governance fifth = `9-05`. Quotable in conversation or VDR cross-reference. |
| B   | `Request`       | The structured information GST is asking for (bullet text from `article.md`).                                                                                                          |
| C   | `File Location` | Optional. The filename, VDR path, or share-link where the corresponding artifact lives. Can be used alongside Response, or alone.                                                      |
| D   | `Response`      | Free-text answer.                                                                                                                                                                      |
| E   | `Notes`         | Optional. Caveats, follow-ups, or context the recipient wants to flag alongside an answer (e.g., "scheduled for Q3 refresh", "confidential — discuss in call").                        |

```
Sheet 1 "Information Request List" (visible, default open view)

  Row 1   ⟨Information Request List⟩                                  <- merged A1:E1 (title)
  Row 2        Target           ⟨StoreForce⟩                          <- col B label, merged C2:E2 value
  Row 3        Engagement       ⟨Value Creation⟩                      <- col B label, merged C3:E3 value
  Row 4        Generated        ⟨2026-05-25⟩                          <- col B label, merged C4:E4 value
  Row 5        Canonical ref    ⟨https://...⟩                         <- col B label, merged C5:E5 value
  Row 6   (blank)
  Row 7   ⟨Below is information useful to...⟩                          <- merged A7:E7 (intro)
  Row 8   (blank)
  Row 9   Reference  Request   File Location  Response  Notes          <- column header (bold, sz 13)
  Row 10             00 — BASICS                                       <- section header (col B only, bold)
  Row 11  0-01       Company name (legal entity ...)
  Row 12  0-02       Engagement context: sell-side ...
  ...
  Row N              01 — PRODUCT
  Row N+1 1-01       One-paragraph product description...
  ...

Sheet 2 "Instructions" (hidden by default)

  Short usage guide for recipient — describes the 5-column layout
  including the role of File Location vs Response vs Notes.
  Senior consultant review can flip Hidden 1→0 without code change.
```

Column widths: A=10 (Reference only — narrow), B=70 (Request / metadata labels), C=25 (File Location), D=35 (Response), E=30 (Notes). Total ~170 chars wide; comfortable for landscape printing.

**Header section row strategy** — to keep col A narrow without truncating long title / metadata text:

- Title row (A1): single cell at A1, **merged A1:E1** so the title spans the visual width.
- Metadata rows (Target / Engagement context / Generated / Canonical reference): col A empty, col B = label, **C:E merged** value. Label sits in the wide col B (70 chars) so "Engagement context" (18) and "Canonical reference" (19) render fully; merged value spans 25+35+30=90 chars so URLs / long names render fully.
- Intro paragraph: single cell at column A, **merged A:E** so the long sentence spans the full width.

**Styling** — `cell.s` style blocks applied:

- Column header row (Reference / Request / File Location / Response / Notes): `{ font: { bold: true, sz: 13 } }`.
- Section header rows (e.g., "00 — BASICS"): `{ font: { bold: true } }`.

SheetJS Community Edition writes these styles into the XLSX; Excel / Google Sheets / LibreOffice all honor them on open. Vitest round-trip read may not preserve style metadata, so the test surface stays on text-position + merge-range assertions rather than style verification.

**Reference ID derivation**: section number's leading zero is stripped (so `"00"` → `0`, `"09"` → `9`, future `"10"` would stay `10`); bullet index is one-based, zero-padded to two digits. Pure function `buildReferenceId` lives in `src/utils/irl/generate-xlsx.ts`; the test `'emits per-bullet Reference IDs in the form ...'` locks the pattern.

---

## Filename convention

```
Supplied targetName:   GST-IRL-<target-slug>-<YYYY-MM-DD>.xlsx
                                   ↑                    ↑
                                   slugified            from generatedAt
                                   (NFKD, kebab)

Empty / no targetName: GST-IRL-<YYYY-MM-DD>.xlsx
```

Examples:

| Input                                          | Filename                                |
| ---------------------------------------------- | --------------------------------------- |
| `targetName: 'MedSig Health'`                  | `GST-IRL-MedSig-Health-2026-05-23.xlsx` |
| `targetName: 'Café Société'`                   | `GST-IRL-Cafe-Societe-2026-05-23.xlsx`  |
| `targetName: 'Acme & Co., Ltd.'`               | `GST-IRL-Acme-Co-Ltd-2026-05-23.xlsx`   |
| `targetName: '🚀🎯'` (slug collapses to empty) | `GST-IRL-2026-05-23.xlsx`               |
| no targetName                                  | `GST-IRL-2026-05-23.xlsx`               |

Slug rules: NFKD-normalize → strip combining diacritics (U+0300..U+036F) → replace non-`[A-Za-z0-9]+` with single hyphen → trim leading/trailing hyphens. Pure-emoji or otherwise non-ASCII names that collapse to empty gracefully degrade to the no-target form.

---

## AST shape — `IRLArticle`

```ts
interface IRLBullet {
  readonly text: string;
}

interface IRLSection {
  readonly number: string; // "00".."09", zero-padded
  readonly title: string; // "Software Architecture", etc.
  readonly intro?: string; // optional per-section prose (none today)
  readonly bullets: readonly IRLBullet[];
}

interface IRLArticle {
  readonly title: string; // H1 line
  readonly intro: string; // top-of-file prose between H1 and first §
  readonly sections: readonly IRLSection[];
  readonly footer?: string; // post-rule trailing content
}
```

**Forward-compat note**: bullets are wrapped in `{ text }` objects (not plain `string`) so the future BL-044.5 directives (e.g., `<!-- skip-if: productType=b2c -->`) can attach a `directives?: IRLDirective[]` field without churning every consumer. The cost today is one `.text` accessor per bullet; the cost saved later is touching every parser/generator/test.

The AST is the contract between the parser and every consumer. **Changes to this shape are breaking** — coordinate with the MCP tool, the Hub page, and the BL-044.5+ filter engine if added.

---

## Critical files

**New** (created in BL-044):

- [`src/utils/irl/types.ts`](../../utils/irl/types.ts) — AST type definitions (`IRLBullet`, `IRLSection`, `IRLArticle`)
- [`src/utils/irl/parse-article.ts`](../../utils/irl/parse-article.ts) — pure markdown → AST parser. No markdown library — hand-written line-mode parser for minimal deps + precise error messages.
- [`src/utils/irl/generate-xlsx.ts`](../../utils/irl/generate-xlsx.ts) — pure AST + metadata → `Uint8Array` XLSX. Also exports `buildIrlFilename` + `IRL_XLSX_MIME_TYPE`.
- [`mcp-server/src/tools/generate-information-request-list-xlsx.ts`](../../../mcp-server/src/tools/generate-information-request-list-xlsx.ts) — MCP tool wrapper around the pure functions; emits base64 + filename.
- [`src/pages/hub/tools/information-request-list-generator/index.astro`](../../pages/hub/tools/information-request-list-generator/index.astro) — Astro page + client-side download button.
- [`mcp-server/tests/unit/lib/parse-irl-article.test.ts`](../../../mcp-server/tests/unit/lib/parse-irl-article.test.ts) — parser regression test (locks article shape) + grammar acceptance + error reporting.
- [`mcp-server/tests/unit/lib/generate-irl-xlsx.test.ts`](../../../mcp-server/tests/unit/lib/generate-irl-xlsx.test.ts) — generator unit tests via round-trip read.
- [`mcp-server/tests/unit/tools/generate-information-request-list-xlsx.test.ts`](../../../mcp-server/tests/unit/tools/generate-information-request-list-xlsx.test.ts) — MCP tool wrapper tests.
- [`tests/e2e/hub-tools-irl-generator.test.ts`](../../../tests/e2e/hub-tools-irl-generator.test.ts) — Playwright E2E for the download button (run separately).

**Modified**:

- [`mcp-server/src/prompts/information-request-list.ts`](../../../mcp-server/src/prompts/information-request-list.ts) — `version` 0.0.1 → 0.0.2, `lastReviewedAt` → 2026-05-24, `orchestrates` extended, one-shot body adds Step 4.
- [`mcp-server/src/server.ts`](../../../mcp-server/src/server.ts) — register the new tool.
- [`mcp-server/src/content/library-loader.ts`](../../../mcp-server/src/content/library-loader.ts) — UNCHANGED (BL-043 already registered the article; BL-044 just consumes it).
- [`mcp-server/package.json`](../../../mcp-server/package.json) — `version` 0.3.4 → 0.3.5; later replaced `@e965/xlsx` with `xlsx-js-style@^1.2.0` for cell-style write support.
- [`package.json`](../../../package.json) — added `xlsx-js-style@^1.2.0` to root deps (for the Astro client-side bundle).
- [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) — `0.3.5` entry + manifest-hash bump.
- [`mcp-server/tests/integration/manifest-stability.test.ts`](../../../mcp-server/tests/integration/manifest-stability.test.ts) — `EXPECTED_MANIFEST_HASH` updated.
- [`mcp-server/tests/integration/prompts-registry.test.ts`](../../../mcp-server/tests/integration/prompts-registry.test.ts) — `KNOWN_TOOL_NAMES` adds the new tool.
- [`mcp-server/tests/integration/protocol-roundtrip.test.ts`](../../../mcp-server/tests/integration/protocol-roundtrip.test.ts) — expected tool list adds the new tool.
- [`mcp-server/tests/unit/prompts/information-request-list.test.ts`](../../../mcp-server/tests/unit/prompts/information-request-list.test.ts) — version + orchestrates expectations updated; new tests for the Step 4 directive + interactive-mode unchanged invariant.
- [`mcp-server/tests/examples/information-request-list.golden.md`](../../../mcp-server/tests/examples/information-request-list.golden.md) — frontmatter bumped + v0.0.2 behavior note added.
- [`src/pages/hub/tools/index.astro`](../../pages/hub/tools/index.astro) — new card + `ItemList` JSON-LD entry (numberOfItems 5 → 6).
- [`mcp-server/src/docs/library/irl-tool-input-mapping.md`](../../../mcp-server/src/docs/library/irl-tool-input-mapping.md) — adds a row documenting that the generator tool reads the article body as a structured source.
- [`src/docs/development/MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md`](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md) — Sequel front-matter cross-reference unchanged (BL-043 already pointed at BL-044).
- [`src/docs/development/BACKLOG.md`](BACKLOG.md) — BL-044 status flip Open → Done.

---

## Test surface added

| Layer        | File                                                                         | Count | Validates                                                                          |
| ------------ | ---------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| Parser       | `mcp-server/tests/unit/lib/parse-irl-article.test.ts`                        | 29    | Article structure (10 sections, 67 bullets) + grammar acceptance + error reporting |
| Generator    | `mcp-server/tests/unit/lib/generate-irl-xlsx.test.ts`                        | 19    | XLSX round-trip read + filename slug rules + Hidden Instructions sheet             |
| Tool         | `mcp-server/tests/unit/tools/generate-information-request-list-xlsx.test.ts` | 14    | Input schema + handler output shape + base64 round-trip + targetName propagation   |
| Prompt       | `mcp-server/tests/unit/prompts/information-request-list.test.ts`             | +2    | v0.0.2 invariants: Step 4 directive in one-shot, NOT in interactive                |
| Registry     | `mcp-server/tests/integration/prompts-registry.test.ts`                      | (✓)   | New tool name resolves; per-prompt body-mention satisfied per-mode                 |
| Roundtrip    | `mcp-server/tests/integration/protocol-roundtrip.test.ts`                    | (✓)   | New tool surfaces in the registered tool list over HTTP transport                  |
| Manifest     | `mcp-server/tests/integration/manifest-stability.test.ts`                    | (✓)   | Hash drift from prompt-version bump caught + remediated                            |
| Hub page E2E | `tests/e2e/hub-tools-irl-generator.test.ts`                                  | 1     | Download click triggers a file with the expected mimeType + filename pattern       |

**62 new unit tests** (29 + 19 + 14) + integration coverage already exercised by the regression suites.

---

## Validation sequence before PR

```
npx astro check                                        # 0 errors (227 files)
npm run lint                                           # 0 errors
npm run lint:css                                       # 0 errors
npm run test:run                                       # 1173/1173 pass (root)
npm -w @gst/mcp-server run test                        # 732/732 pass (mcp-server)
npm -w @gst/mcp-server run typecheck                   # 0 errors
npm audit --omit=dev                                   # 0 advisories
```

Manual smoke tests (blocking pre-merge):

- [ ] Click "Download IRL (.xlsx)" on `/hub/tools/information-request-list-generator/` with and without target name + each `transactionContext` option. Open the downloaded file in Excel / Google Sheets / LibreOffice — confirm header cells, section headers, bullet rows are legible.
- [ ] Invoke `gst_information_request_list { targetName: 'MedSig Health', transactionContext: 'buy-side' }` in Claude Desktop with the staging MCP server. Confirm the model emits the paste-ready text AND calls `generate_information_request_list_xlsx` to attach the file. Confirm the attached file opens cleanly.
- [ ] Invoke `gst_information_request_list` with no args. Confirm the model asks the interactive question and does NOT call the XLSX tool unprompted (interactive-mode invariant).
- [ ] Senior-consultant review of the open-in-Excel workbook ergonomics — toggle Instructions sheet visibility based on feedback (single flag change, see Workbook structure above).

---

## Out of scope (deferred to future initiatives)

- **Filled-IRL ingestion** (BL-045 candidate): parses a recipient-filled `.xlsx` back into canonical Hub-tool inputs. Different problem; separate design pass.
- **Subtractive content filtering** (BL-044.5): directive-based bullet/section filtering driven by `productSummary` / `transactionContext` / `productType`. Documented as a post-v1 expansion in [BACKLOG.md § "Scope expansion"](BACKLOG.md#bl-044-information-request-list--fillable-form-generator). The AST already supports the wrapping `{ text }` shape that makes this additive — no parser refactor needed when ready.
- **DOCX / PDF variants**: deferred to v2+ if recipient feedback indicates spreadsheet ergonomics are insufficient.
- **Build-time pregeneration**: rejected because every personalization input (target name, transaction context) is per-click; build-time would lose the personalization. Static "universal template" pregeneration was considered and rejected as duplicative — the runtime generator covers the same case at zero additional cost.

---

## Per-engagement IRL drift

When a specific engagement's filled IRL diverges from the canonical article (extra bullets, deleted bullets, rephrased questions, new sections), the canonical guidance for choosing the right response lives in [`mcp-server/src/docs/library/irl-tool-input-mapping.md` § "Per-engagement IRL drift — decision flow"](../../../mcp-server/src/docs/library/irl-tool-input-mapping.md#per-engagement-irl-drift--decision-flow). That section holds the situation → right-path decision table, the operator action checklist for closing any drift response, the anti-patterns to avoid, and pointers to BL-044.5 / BL-045 as the future evolution lanes.

This doc (BL-044 tracking) is the architecture + decisions for the **generator** specifically. The drift decision flow spans the whole IRL pipeline (parser, generator, MCP tool, prompt, downstream `gst_diligence_sweep` consumption) so it belongs in the cross-surface SOP, not here.

---

_Last updated: 2026-05-25 (added pointer to the "Per-engagement IRL drift" decision flow in irl-tool-input-mapping.md)._
