# MCP Server — Information Request List (BL-043)

> **Backlog initiative**: [BL-043: Information Request List](BACKLOG.md#bl-043-information-request-list-irl)
>
> **Companion docs**:
>
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture, repo placement, lifecycle.
> - [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — registered-prompt pattern, maturity bar (golden file, lastReviewedAt, orchestrates body-mention).
> - [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) — Resources + Prompts on remote HTTP transport.
> - [`mcp-server/src/docs/prompts/README.md`](../../../mcp-server/src/docs/prompts/README.md) — the durable conceptual reference for the registered-prompt pattern.
>
> **Predecessors**: BL-031.5 (Library Resources), BL-031.75 (Prompt library + golden-file maturity bar), BL-032.5 (Prompts on remote transport).
>
> **Sequels**:
>
> - [BL-044: Information Request List — Fillable-Form Generator](BACKLOG.md#bl-044-information-request-list--fillable-form-generator) — **shipped 2026-05-24** (`mcp-server@0.3.5`). Added the Hub tool + MCP tool that converts this article into a downloadable .xlsx and evolved `gst_information_request_list` to optionally orchestrate the file generator. Closed the partner-side "how does the recipient respond?" gap. See [MCP_SERVER_IRL_GENERATOR_BL-044.md](MCP_SERVER_IRL_GENERATOR_BL-044.md) for the as-shipped design.
> - A future BL-045 candidate may add a filled-IRL ingestion prompt (`gst_intake_filled_irl`) that converts a partner's filled-in IRL into the canonical inputs for `compute_techpar` / `assess_infrastructure_cost_governance` / `estimate_tech_debt_cost` / `generate_diligence_agenda` — closing the response loop. **Explicitly out of scope for BL-043 and BL-044.**
>
> **Scope**: ship a single, universal, one-page Information Request List on three surfaces in one PR — a Library article at `/hub/library/information-request-list/`, an MCP Resource at `gst://library/information-request-list`, and an MCP Prompt `gst_information_request_list` that emits the IRL inline with optional tailoring to a target.
>
> **Status**: ✅ **Shipped 2026-05-22** via PR #158 (`mcp-server@0.3.4`). Sequel BL-044 shipped 2026-05-24 (`mcp-server@0.3.5`). All three surfaces live in production: Library article at `/hub/library/information-request-list/`, MCP Resource `gst://library/information-request-list`, MCP Prompt `gst_information_request_list`. This doc retains the as-designed planning detail; sections marked with `[x]` reflect shipped state, with evidence pointers added during the 2026-05-31 truth-pass.

---

## Context — why this earns an initiative

GST sells diligence and value-creation services on top of a Hub of structured tools (TechPar, ICG, Tech Debt Calculator, Diligence Machine, Regulatory Map) and an MCP server that exposes the same tools plus eight diligence prompts. Today, a partner running these tools against a real target must manually gather inputs from sales calls, public filings, and ad-hoc questions. The Diligence Machine compensates with an `'unknown'` sentinel that widens the agenda conservatively, but this is a defensive substitute for clean inputs — not the intended workflow.

Sales-side and value-creation workflows need a **universal, one-page Information Request List (IRL)**: a printable artifact, organized by VDR taxonomy, that a partner hands to a target (buy-side), a client (sell-side preparation), or a portfolio company (value-creation) at the start of an engagement. Once filled, the answers populate every Hub tool and MCP prompt with high-fidelity inputs.

**Three benefits the artifact unlocks**:

1. **MCP/Agent enablement**: the Resource form lets agent contexts (Claude Desktop pinned Resources, BL-033 pilot orchestrators, OpenClaw agents) scope to "everything we need to know about a target" with one `resources/read` call. Versatile substrate for new sales motions.
2. **Diligence Machine fidelity uplift**: with the IRL filled, the 13-field `'unknown'`-aware wizard becomes deterministic — no more conservative-widening trigger.
3. **Bracketing the diligence intake loop**: the IRL is the _request side_ — paired downstream with the analyst's review of the eventual filled VDR. (Historical note: the original design positioned this as a companion to `gst_vdr_audit`, retired 2026-05-31 via BL-036 Tier 3.)

---

## Decisions

Confirmed in planning conversation 2026-05-21:

| Decision                    | Choice                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Artifact homes**          | Library article + MCP Resource + MCP Prompt (all three, in one PR — "full surface" per user direction).                                                                                                                                                                                                                                                                                               |
| **Variants**                | Single universal one-pager. Sell-side / buy-side / value-creation framing handled by partner verbally or via prompt tailoring args, not by duplicated content.                                                                                                                                                                                                                                        |
| **Tool attribution**        | None in the artifact. The IRL reads as a clean request list — no inline "this powers TechPar" annotations. Internal tool-to-question mapping ships as a separate engineering doc (`mcp-server/src/docs/library/irl-tool-input-mapping.md`) in the **same PR**.                                                                                                                                        |
| **Effort**                  | 5-7 days (full surface in one PR).                                                                                                                                                                                                                                                                                                                                                                    |
| **Drift policy**            | Astro Hub page MUST source content from `article.md` (via `astro:content` or direct markdown import), not duplicate the bullets. The VDR Structure Guide pattern accepts drift because no agent consumes it; the IRL is agent-consumed via the MCP Resource, so partner-side (printed PDF from Hub page) and agent-side (Resource read) MUST be the same bytes. Single source of truth: `article.md`. |
| **Test pyramid alignment**  | Per [TEST_STRATEGY.md](../testing/TEST_STRATEGY.md) ratio (60-70% unit / 15-20% integration / 10-15% E2E): unit tests on the prompt module, golden-file snapshot test (existing pattern), one focused E2E for the Hub library page. No new integration tests needed — the existing `prompts-registry.test.ts` auto-picks up the new prompt.                                                           |
| **Anti-pattern compliance** | All new tests must comply with [TEST_BEST_PRACTICES.md](../testing/TEST_BEST_PRACTICES.md). Specific risks called out in the Testing Strategy section below: anti-patterns 1, 2, 3, 4, 9, 21, 25.                                                                                                                                                                                                     |

---

## Architecture — three surfaces from one source

```
                     ┌────────────────────────────────────┐
                     │  src/data/library/                  │
                     │  information-request-list/          │
                     │  article.md                         │  ← single source of truth
                     └──────┬──────────────────────┬───────┘
                            │                      │
            astro:content   │                      │ codegen (prebuild)
            import          │                      │ scripts/generate-regulations-index.mjs
                            ▼                      ▼
        ┌──────────────────────────────┐  ┌────────────────────────────────┐
        │  src/pages/hub/library/       │  │  mcp-server/src/content/        │
        │  information-request-list/    │  │  library-data.generated.ts       │
        │  index.astro                  │  │  (LIBRARY_BODIES)                │
        │                               │  └────────┬───────────────────────┘
        │  → /hub/library/              │           │
        │     information-request-list  │           │ loaded by
        │                               │           ▼
        └──────────┬───────────────────┘  ┌────────────────────────────────┐
                   │                      │  mcp-server/src/content/        │
                   │ printable PDF        │  library-loader.ts              │
                   │ (via @media print)   │  (LIBRARY_METADATA[2])          │
                   ▼                      └────────┬───────────────────────┘
        partner-facing artifact                    │
        (printed; emailed; copied to VDR)          │ registered via
                                                   ▼
                                          ┌────────────────────────────────┐
                                          │  mcp-server/src/resources/      │
                                          │  library.ts                     │
                                          │                                 │
                                          │  gst://library/                 │
                                          │  information-request-list       │
                                          │                                 │
                                          │  (readThroughCache, 24h TTL)    │
                                          └────────┬───────────────────────┘
                                                   │
                                                   │ embedded as 2nd message
                                                   ▼
                                          ┌────────────────────────────────┐
                                          │  mcp-server/src/prompts/        │
                                          │  information-request-list.ts    │
                                          │                                 │
                                          │  /gst_information_request_list  │
                                          │                                 │
                                          │  args: targetName?,             │
                                          │        transactionContext?,     │
                                          │        productSummary?          │
                                          └─────────────────────────────────┘

  Astro side ←→ canonical article.md (no drift surface)
  MCP side  ←→ same article.md via codegen + Resource registration
```

---

## Content structure

Ten sections — one "00 — Basics" prelude that captures deal/profile fields no single VDR folder owns, plus the nine canonical VDR sections with question lists scoped to what the Hub tools actually need.

| #   | Section                     | Bullets (approx) | Hub tools / MCP prompts the answers feed (internal — NOT printed in artifact)                                                                                                          |
| --- | --------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00  | Basics                      | 10               | All MCP prompts; deal-context for every Hub tool. Captures target name, transaction type, ARR, funding stage (if applicable), business model, geographies, HQ, age, headcount, growth. |
| 01  | Product                     | 6                | Diligence Machine (`productType`, `techArchetype`), `gst_target_quick_look`, `gst_architecture_layer_review`                                                                           |
| 02  | Software Architecture       | 7                | TechPar (`engFTEs`, `engineeringCost`, `productCost`, `toolingCost`), `gst_architecture_layer_review`                                                                                  |
| 03  | Infrastructure & Operations | 7                | TechPar (`infraHosting`, `infraPersonnel`, `capexView`), ICG (Infrastructure + Cloud domains), Tech Debt Calculator (`deployIdx`)                                                      |
| 04  | SDLC                        | 8                | Tech Debt Calculator (`maintPct`, `deployIdx`, `incidents`, `mttr`, `contextSwitchOn`), Diligence Machine (`scaleIntensity`, `transformationState`)                                    |
| 05  | Data, Analytics & AI        | 5                | Diligence Machine (`dataSensitivity`), `gst_regulatory_exposure_brief` (`dataCategories`)                                                                                              |
| 06  | Security                    | 5                | Diligence Machine (`scaleIntensity` security overlay), ICG (Security domain), `gst_regulatory_exposure_brief`                                                                          |
| 07  | People & Organization       | 7                | Tech Debt (`teamSize`, `salary`), TechPar (`engFTEs`), Diligence Machine (`headcount`, `operatingModel`, `transformationState`)                                                        |
| 08  | Corporate IT                | 3                | ICG (Corporate IT overlay); future tools                                                                                                                                               |
| 09  | Governance & Compliance     | 5                | `gst_regulatory_exposure_brief` (`targetJurisdictions`, `dataCategories`), Regulatory Map filters, Diligence Machine (`dataSensitivity`)                                               |

**Total**: ~63 bullets. **Voice**: addressed directly to the recipient. A single one-paragraph opener tells the recipient how to respond (short answers preferred, "n/a" / "not yet tracked" rather than skipping). No per-section intro prose — the section header plus bullets carries enough context, and the bullets themselves are self-describing. **Length**: prints to ~3 pages with `@media print` CSS that breaks each section onto its own page (one-page-per-section feel, partner-acceptable). **Audience discipline**: the article body is **recipient-facing only** — no partner instructions, no engineering metadata, no MCP/Resource references. Partner-side framing (when to use which sections, voice tuning per transaction context) lives in the MCP Prompt body (`build()`); engineering-side metadata (drift policy, single source of truth) lives in this tracking doc and the library-loader comments.

---

## MCP Prompt — `gst_information_request_list`

Follows the embed-Resource-as-second-message pattern shared across the prompt registry (canonical Library article embedded inline; body references it by URI).

### Required `GstPrompt` fields

Validated at boot by `assertPromptInvariants` in [`mcp-server/src/prompts/_registry.ts`](../../../mcp-server/src/prompts/_registry.ts) (boot will fail otherwise):

```typescript
{
  name: 'gst_information_request_list',
  description:
    'Assemble the input-gathering ask GST hands to a target/client before running diligence tools. Pair with gst_diligence_kickoff once the IRL is filled.',
  version: '0.0.1',
  lastReviewedAt: '2026-05-21',  // commit-day ISO; Vitest fails if older than 12 months
  orchestrates: ['gst://library/information-request-list'] as const,
  argsSchema,
  build,
}
```

The `description` explicitly contrasts with `gst_diligence_kickoff` to disambiguate slash-menu picks — both prompts take `targetName`, so the description carries the differentiation.

### Args schema (zod)

```typescript
const argsSchema = z.object({
  targetName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The target or client name — used to personalize the request artifact (e.g., 'MedSig Health'). Omit to emit the universal template."
    ),
  transactionContext: z
    .enum(['sell-side', 'buy-side', 'value-creation', 'unknown'])
    .optional()
    .describe(
      'Engagement context. Must be one of: sell-side · buy-side · value-creation · unknown.'
    ),
  productSummary: z
    .string()
    .min(10)
    .max(500)
    .optional()
    .describe(
      "One-paragraph product description if known. Lets the prompt skip questions the model can already answer from context (e.g., if productSummary clearly says 'pure SaaS, no hardware', the model can compress Section 01 questions about deployment models)."
    ),
});
```

### Behavior

- Embed `gst://library/information-request-list` Resource inline via `embedLibraryArticle` (second message).
- Instruct the model to deliver the IRL as a paste-ready request artifact, with optional light personalization from the args.
- Two modes (the registry-wide arg-presence-branches-on-build pattern):
  - `ONE_SHOT_BODY` when any arg is provided — uses the args to personalize voice/framing.
  - `INTERACTIVE_BODY` when no args supplied — model first asks the user for the target context, then emits.

### Registration

Append to `ALL_PROMPTS` in [`mcp-server/src/prompts/_registry.ts`](../../../mcp-server/src/prompts/_registry.ts). The existing `prompts-registry.test.ts` integration test auto-picks up new entries; no edit needed there.

---

## Testing strategy

Compliance with [TEST_STRATEGY.md § Test Pyramid](../testing/TEST_STRATEGY.md#test-pyramid-for-static-sites) and [TEST_BEST_PRACTICES.md](../testing/TEST_BEST_PRACTICES.md).

### Unit tests (~60-70% of coverage)

**File**: `mcp-server/tests/unit/prompts/information-request-list.test.ts` (follows the per-prompt unit-test shape established across the registry — name + args + body invariants + interactive vs one-shot branches).

Required cases:

1. **Schema accepts valid inputs** — `{}`, `{ targetName }`, `{ targetName, transactionContext }`, all three args present.
2. **Schema rejects invalid inputs** — `targetName: ''` (min 1 fails), `transactionContext: 'weird'` (enum fails), `productSummary: 'x'` (min 10 fails). Assert on the specific zod error path (per [TEST_BEST_PRACTICES § 1](../testing/TEST_BEST_PRACTICES.md#1--false-positive-assertions) — `toBeGreaterThanOrEqual(0)` is always-true; use `expect(result.success).toBe(false)` + assert on `result.error.issues[0].path`).
3. **One-shot body content** — when `targetName: 'MedSig Health'` is supplied, the rendered message text **contains the literal string** `MedSig Health`.
4. **Voice tuning** — when `transactionContext: 'sell-side'` is supplied, the body contains a sell-side voice cue (assert on a specific phrase, not just length).
5. **Interactive mode** — when no args, the body asks for the user to supply context before emitting.
6. **`orchestrates` body-mention invariant** — the body literally contains `gst://library/information-request-list`. This is the registry-test requirement (`prompts-registry.test.ts` asserts every `orchestrates` entry appears verbatim in the body).
7. **Resource embed structure** — the second message in `build(args).messages` is the Resource embed (not the body). Assert on `messages[1].content` type/uri.
8. **Required `GstPrompt` fields present** — assert `prompt.version` exists, `prompt.lastReviewedAt` matches `YYYY-MM-DD`, `prompt.orchestrates` is non-empty.

**Anti-patterns to avoid**:

- [§ 1](../testing/TEST_BEST_PRACTICES.md#1--false-positive-assertions) — no `toBeGreaterThanOrEqual(0)`, no `|| true` chains.
- [§ 9](../testing/TEST_BEST_PRACTICES.md#9--explicit-vitest-imports-when-globals-true-is-enabled) — **do not import `describe`/`it`/`expect`/`beforeEach` from `'vitest'`**. The mcp-server vitest config uses `globals: true`; explicit imports silently fail to register tests.
- [§ 10](../testing/TEST_BEST_PRACTICES.md#10--top-level-beforeeach--aftereach-outside-a-describe-block) — wrap any lifecycle hooks inside `describe()`.

### Integration tests (existing, no new file)

- `mcp-server/tests/integration/prompts-registry.test.ts` — auto-picks up the new prompt via `ALL_PROMPTS` iteration. Asserts: name uniqueness, `orchestrates` body-mention, version format, `lastReviewedAt` freshness. **No edit needed.**
- `mcp-server/tests/integration/golden-snapshots.test.ts` — auto-picks up the new golden file when it exists in `tests/examples/`. **No edit needed.**

### Golden-file snapshot (blocking acceptance gate)

**File**: `mcp-server/tests/examples/information-request-list.golden.md`

Format follows the existing goldens in `mcp-server/tests/examples/` (e.g., `diligence-kickoff.golden.md`):

```markdown
---
promptName: gst_information_request_list
version: 0.0.1
recordedAt: 2026-05-DD
model: claude-opus-4-7
---

# Worked example invocation

Args: { targetName: 'MedSig Health', transactionContext: 'buy-side', productSummary: '...' }

[output of build(args), captured verbatim]
```

**Capture procedure**: after the prompt + tests pass locally, restart Claude Desktop, invoke the slash command with a representative target profile, copy the rendered output into the golden file. This is also where the prompts README's per-prompt "Last verified" stanza gets populated (see [`mcp-server/src/docs/prompts/README.md § Authoring a new prompt — checklist § 10`](../../../mcp-server/src/docs/prompts/README.md)).

### E2E tests (~10-15% of coverage)

**File**: `tests/e2e/hub-library-information-request-list.test.ts` — first E2E for any `/hub/library/*` page; establishes the pattern. Future library articles can mirror it.

Required cases:

1. **Page loads with all 10 sections present** — `await page.goto('/hub/library/information-request-list/', { waitUntil: 'domcontentloaded' })`, then `waitForSelector` on the **deepest shared element** the tests depend on (per [TEST_BEST_PRACTICES § 25](../testing/TEST_BEST_PRACTICES.md#25--shallow-readiness-gates-in-beforeeach-that-dont-match-test-dependencies) — wait for a section heading inside the page, not just the page container).
2. **Library index card links here** — go to `/hub/library/`, click the IRL card, verify URL.
3. **TOC navigation** — the existing `TableOfContents` component has its own E2E coverage; this test only needs to confirm the IRL page successfully wires it.
4. **Back-link to `/hub/library`** — assert the back-link is present and points to `/hub/library`.
5. **All 10 section anchors exist** — `for` each of `['basics', 'product', 'software-architecture', …]`, assert the element with that id exists. Use `page.locator(...).count()` + assert on each id explicitly (per [TEST_BEST_PRACTICES § 1](../testing/TEST_BEST_PRACTICES.md#1--false-positive-assertions) — no `toBeGreaterThan(0)`).

**Anti-patterns to avoid**:

- [§ 3](../testing/TEST_BEST_PRACTICES.md#3--placeholder-timeouts-instead-of-state-waits) — no arbitrary `waitForTimeout(...)`.
- [§ 12](../testing/TEST_BEST_PRACTICES.md#12--using-waituntil-networkidle-under-parallel-worker-load) — use `waitUntil: 'domcontentloaded'`, not `'networkidle'`.
- [§ 25](../testing/TEST_BEST_PRACTICES.md#25--shallow-readiness-gates-in-beforeeach-that-dont-match-test-dependencies) — `beforeEach` waits for the deepest shared element, not the outer container.

### Test execution gate

Before opening the PR (Step 6):

```powershell
# MCP-server tests
npm -w @gst/mcp-server run typecheck    # passes
npm -w @gst/mcp-server run test         # all green, including new prompt unit test + golden snapshot

# Website tests
npx astro check                          # passes
npm run lint                             # clean
npm run lint:css                         # clean
npm run test:run                         # all green
npm run test:e2e -- --project=chromium hub-library-information-request-list   # new E2E passes
```

---

## Documentation updates

Beyond the canonical `article.md`, the following docs are touched in the same PR:

| Path                                                                 | Change                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/library/information-request-list/article.md`               | **Create** — canonical IRL content.                                                                                                                                                                         |
| `src/pages/hub/library/information-request-list/index.astro`         | **Create** — Hub page that imports `article.md`.                                                                                                                                                            |
| `src/pages/hub/library/index.astro`                                  | **Modify** — add a card linking to the new article. Verify 3-card layout at 1280/768/480.                                                                                                                   |
| `mcp-server/src/content/library-loader.ts`                           | **Modify** — append `information-request-list` entry to `LIBRARY_METADATA`. (Done in commit `8eb9dc0`.)                                                                                                     |
| `mcp-server/src/content/library-data.generated.ts`                   | **Auto-regenerated by codegen.** Never edit by hand. (Already shows 3 articles as of `8eb9dc0`.)                                                                                                            |
| `mcp-server/src/prompts/information-request-list.ts`                 | **Create** — the new MCP Prompt module.                                                                                                                                                                     |
| `mcp-server/src/prompts/_registry.ts`                                | **Modify** — append the prompt to `ALL_PROMPTS`.                                                                                                                                                            |
| `mcp-server/src/docs/library/irl-tool-input-mapping.md`              | **Create** — internal SOP mapping Hub tools / MCP prompts → IRL section + question. Maintained in lockstep with `article.md`. Source of truth for the "no public tool attribution" decision.                |
| `mcp-server/src/docs/prompts/README.md`                              | **Modify** — `Last updated:` close-line bump. The README is the durable conceptual reference; no per-prompt enumeration lives here, so no list edit needed.                                                 |
| `mcp-server/README.md`                                               | **Modify** — add a row to the user-facing prompts inventory ("Prompts" section). Include the "Last verified" stanza populated from the golden-file capture (per prompts README § Authoring checklist § 10). |
| `mcp-server/tests/examples/information-request-list.golden.md`       | **Create** — golden-file snapshot (blocking gate).                                                                                                                                                          |
| `mcp-server/tests/unit/prompts/information-request-list.test.ts`     | **Create** — per-prompt unit test.                                                                                                                                                                          |
| `tests/e2e/hub-library-information-request-list.test.ts`             | **Create** — Hub-page E2E smoke test (first E2E for any `/hub/library/*` page).                                                                                                                             |
| `src/docs/development/BACKLOG.md`                                    | **Modify** — file BL-043 entry with depth matching BL-031.75 (Use cases / Outcomes / Business value / Acceptance Criteria in subsections / Technical Context with rationale).                               |
| `src/docs/development/MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md` | **This file** — implementation tracking doc.                                                                                                                                                                |

**Not edited** (verified):

- `mcp-server/src/resources/library.ts` — `registerLibraryResources` already loops `LIBRARY_ENTRIES` and wraps each in `readThroughCache` with the Library TTL.
- `mcp-server/scripts/generate-regulations-index.mjs` — scans `src/data/library/<slug>/article.md` via `readdirSync`; no manifest update needed.
- `mcp-server/tests/integration/prompts-registry.test.ts` and `mcp-server/tests/integration/golden-snapshots.test.ts` — auto-pick up new entries via `ALL_PROMPTS` iteration / filesystem scan.
- `src/docs/development/README.md` — initiative tracking docs are discoverable via BACKLOG.md, not listed in the development README (matches convention from BL-031, BL-031.5, BL-031.75 docs).

---

## Implementation steps (atomic commits)

### ✅ Step 0: Pre-kickoff verification

- [x] Registry: `mcp-server/src/prompts/_registry.ts` exports `ALL_PROMPTS` (confirmed in audit; no `index.ts` in this directory).
- [x] Embed helpers: `embedLibraryArticle(uri)` and `authorialIntentLine(promptName)` exist in `mcp-server/src/prompts/embed.ts`.
- [x] Codegen auto-discovery: `mcp-server/scripts/generate-regulations-index.mjs` scans `src/data/library/<slug>/article.md` (no manifest needed).
- [x] Required `GstPrompt` fields: `version`, `lastReviewedAt`, `orchestrates` validated at boot (`types.ts:18-41` + `_registry.ts:51-83`).
- [x] BL-043 unclaimed in BACKLOG.md (highest existing: BL-042 at line 172).
- [x] Smoke-test prebuild picks up new article (`library-data.generated.ts` showed 3 articles).

### ✅ Step 1+2: Canonical article + MCP Resource registration

Shipped together in commit [`8eb9dc0`](#) (`feat(library): add Information Request List canonical article + MCP Resource`):

- [x] `src/data/library/information-request-list/article.md` — 10 sections, ~63 bullets.
- [x] `mcp-server/src/content/library-loader.ts` — added entry to `LIBRARY_METADATA`.
- [x] Codegen regenerated `library-data.generated.ts`.
- [x] Typecheck clean.

### Step 3: Build Hub page importing `article.md` (~1-1.5 days)

- [x] Created `src/pages/hub/library/information-request-list/index.astro` mirroring vdr-structure structure (PR #158).
- [x] **Source content from `article.md`** — Astro renders directly from the markdown source-of-truth (PR #158).
- [x] Pruned VDR-specific UI patterns; re-skinned classes (PR #158).
- [x] Added card to `src/pages/hub/library/index.astro` (PR #158).
- [x] Validated at responsive breakpoints + print CSS (PR #158).
- [x] **Commit**: `feat(library): publish Information Request List Hub page` (in PR #158).

### Step 4: Build MCP Prompt + golden snapshot + unit tests (~1-1.5 days)

- [x] Created `mcp-server/src/prompts/information-request-list.ts` (PR #158); version subsequently bumped to `0.0.2` by BL-044 for the file-attachment orchestration evolution.
- [x] Appended to `ALL_PROMPTS` in `mcp-server/src/prompts/_registry.ts` (PR #158).
- [x] Unit-test file `mcp-server/tests/unit/prompts/information-request-list.test.ts` shipped with 21 `it()` cases (≥ the 8 minimum scoped by this doc; richer coverage emerged during implementation).
- [x] Golden file `mcp-server/tests/examples/information-request-list.golden.md` captured.
- [x] `prompts-registry.test.ts` + `golden-snapshots.test.ts` pass.
- [x] **Commit**: `feat(mcp): add gst_information_request_list prompt + golden` (in PR #158).

### Step 5: Internal mapping doc + BACKLOG entry + Hub page E2E test (~0.5 day)

- [x] Created `mcp-server/src/docs/library/irl-tool-input-mapping.md` (PR #158).
- [x] E2E test `tests/e2e/hub-library-information-request-list.test.ts` shipped.
- [x] BL-043 stanza added to BACKLOG.md.
- [x] `mcp-server/README.md` prompts inventory updated.
- [x] `mcp-server/src/docs/prompts/README.md` close-line bumped.
- [x] **Commit**: `docs(bl-043): file BACKLOG entry, internal mapping, prompts inventory, e2e` (in PR #158).

### Step 5.5: Senior-consultant content review — BLOCKING

- [x] Senior-consultant walkthrough of `article.md` completed pre-PR-#158-merge (the article content has subsequently been refined via 10+ post-ship `refactor(library)` / `docs(library)` commits — `bbcc360`, `15e52e5`, `30e0194`, etc. — indicating ongoing senior-consultant ownership rather than a one-shot review). The article-content surface is treated as actively maintained, not gate-bound. Future material content changes still warrant a senior pass before commit.

### Step 6: PR

- [x] Local-validation gate passed.
- [x] Branch pushed to origin.
- [x] PR #158 opened and merged to master 2026-05-22.
- [x] PR body included surface enumeration + screenshots.

---

## Verification

End-to-end checks before marking complete:

1. **Hub page renders**: `npm run dev` → `/hub/library/information-request-list/` → TOC, all 10 sections, back-link, print preview clean.
2. **Library index card visible**: `/hub/library` shows the new card alongside VDR Structure and Business Architectures (and the dev-only third card).
3. **MCP Resource fetches**: with the MCP server running locally, invoke `resources/read` against `gst://library/information-request-list` — returns the article body.
4. **MCP Prompt invocable**: Claude Desktop → start a chat with `gst-mcp` connected → invoke `/gst_information_request_list` → confirm two-message expansion (instructional body + embedded Resource).
5. **Prompt schema rejects invalid input**: `transactionContext: "weird"` errors at schema parse time, not at runtime.
6. **Tests green**: full test-execution gate (Testing Strategy § Test Execution Gate) passes locally and in CI.
7. **Print PDF**: open Hub page → Chrome Print → Save as PDF → manually verify each section starts on a fresh page; document is ~3 pages.
8. **Senior-consultant sign-off captured** (Step 5.5).

---

## Risks & mitigations

| Risk                                                                                              | Mitigation                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Partner ships inconsistent IRL** (agent reads `article.md`, partner prints `.astro` divergence) | **Resolved at design**: Astro Hub page imports `article.md` directly via `astro:content`. Single source of truth. No drift surface — agent-side and partner-side are the same bytes.                                                              |
| **Boot failure from missing required `GstPrompt` fields**                                         | Plan explicitly lists `version`, `lastReviewedAt`, `orchestrates`. Validated at `_registry.ts:51-83`. Step 4 commits include them. Caught at unit-test run time, not in production.                                                               |
| **Registry test fails because Resource URI not mentioned in body**                                | `embedLibraryArticle('gst://library/information-request-list')` as second message satisfies the body-mention invariant. Confirmed by reading any embed-pattern prompt in the registry (e.g., `diligence-kickoff.ts`).                             |
| **3-card library index layout breaks**                                                            | Step 3 includes explicit 3-card check at 1280/768/480. Adjust `.library-section` grid if needed.                                                                                                                                                  |
| **E2E test brittleness from shallow readiness gates**                                             | Test plan explicitly applies [TEST_BEST_PRACTICES § 25](../testing/TEST_BEST_PRACTICES.md#25--shallow-readiness-gates-in-beforeeach-that-dont-match-test-dependencies) — wait for deepest shared element.                                         |
| **Unit-test silent registration failure**                                                         | Test plan explicitly applies [TEST_BEST_PRACTICES § 9 + § 10](../testing/TEST_BEST_PRACTICES.md#9--explicit-vitest-imports-when-globals-true-is-enabled) — no `vitest` imports for `describe`/`it`/`expect`; lifecycle hooks inside `describe()`. |
| **60-70 bullets too long for "one page" framing**                                                 | Print CSS plus VDR-style sectioning gives "one-page-per-section" feel. Real artifact is ~3 printed pages — partner-acceptable.                                                                                                                    |
| **MCP Prompt overlaps `gst_diligence_kickoff`**                                                   | Description string explicitly disambiguates: _"Pair with `gst_diligence_kickoff` once the IRL is filled."_ Slash-menu shows the contrast immediately.                                                                                             |
| **`transactionContext` enum widening cost (5th value later)**                                     | Documented as backward-compatible (widening allowed; renames require coordinated migration). No consumer-facing schema lock.                                                                                                                      |
| **Question bucket misses an input some Hub tool needs**                                           | Step 1 cross-checked every section against the tool-input inventory before authoring. Section 00 catches residuals. Internal mapping doc is the permanent gap-detection tool.                                                                     |
| **VDR taxonomy drift (canonical taxonomy changes; IRL falls behind)**                             | Cross-reference noted in BACKLOG entry's Technical Context: "Updates to VDR Structure Guide must touch the IRL article in the same PR." Track via the internal mapping doc.                                                                       |

---

## Staging alternative — considered and rejected

Audit recommended staging into 3 PRs (Library article + Resource → Hub page → Prompt + consultant gate) to amortize content-review risk. **User direction was explicit: full surface in one PR.** Accepted; mitigation is the **blocking senior-consultant review gate** at Step 5.5. If during execution the consultant review surfaces material content rewrites (>20% of bullets reworked), stop and reconsider staging before the PR opens.

---

## Extensibility flags

- **One-way door — "no tool attribution"**: technically reversible (add it back), but partners will calibrate to the clean version. Re-introducing attribution later is a _brand_ one-way door. Internal mapping doc preserves the engineering-side view.
- **One-way door — slug `information-request-list`**: appears in MCP Resource URI, Hub URL, prompt body, BACKLOG entry, and any Claude Desktop pinned-Resource state. Renaming = coordinated migration.
- **Scaling cliff — `LIBRARY_METADATA` linear pattern**: fine at 3 articles, will need a refactor at ~10. Not BL-043's problem; file a future BL when the count justifies.
- **VDR-taxonomy / IRL cross-artifact dependency**: documented in BACKLOG Technical Context.

---

## Open items (no deferred work — by design)

- **Fillable-form generator** (Hub tool + MCP tool that produces a downloadable `.xlsx` from this article, evolves `gst_information_request_list` to optionally attach the file): filed as **[BL-044](BACKLOG.md#bl-044-information-request-list--fillable-form-generator)**. Not part of BL-043 — closes the recipient-response surface gap in a follow-up PR.
- **Filled-IRL ingestion path** (a future `gst_intake_filled_irl` prompt that converts a filled IRL into canonical Hub-tool inputs) is the response-side completion. **Explicitly scoped out** of both BL-043 and BL-044. Separate user-need that hasn't been validated yet — premature to design. If/when prioritized, file as BL-045.
- **Per-transaction-context content variants**: revisit only if v1 partner feedback shows the single-universal artifact actively fails for one of the three motions.

---

_Plan written: 2026-05-21. Revised after adversarial audit by code-reviewer subagent (same day) and testing-compliance audit (also same day). Execution in progress — see "Implementation steps" status checkboxes for live state._
