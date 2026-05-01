# BL-031.75 Verification Punch-List (V1–V8)

> **Status**: Open · **Started**: 2026-05-01 · **Owner**: senior consultant (the user) — this is the binding AC gate for BL-031.75 closure.
>
> **Architecture & punch-list spec**: [`MCP_SERVER_PROMPTS_BL-031_75.md` § Verification punch-list (V1–V8 — one per prompt)](MCP_SERVER_PROMPTS_BL-031_75.md#verification-punch-list-v1v8--one-per-prompt). The architecture doc is the source of truth for what each V<n> verifies; this doc is the working surface where evidence is captured **before being migrated** to the durable home.
>
> **End state** (lesson learned BL-031.5):
>
> - Recorded outputs migrate into `mcp-server/README.md` § "Last verified (BL-031.75 surface)" (≤ 6 lines per prompt) and the corresponding `mcp-server/tests/examples/<slug>.golden.md` (full input + expanded body + model output).
> - Once V1–V8 are recorded and the senior consultant has signed off, this doc is **deleted** in the closure commit. Doc history reachable via `git log`.
> - Two AC items in [`BACKLOG.md` § BL-031.75](BACKLOG.md#bl-03175-mcp-server--consultant-prompt-library) are gated on this doc:
>   - Golden-output snapshots per prompt — populated during V1–V8.
>   - Senior-consultant review gate.
>
> Mirrors the BL-031.5 V1–V7 closure (commit `1ad2ba5`).

---

## Prerequisites (one-time, before V1)

- [ ] **0.1 — Working tree clean.** `git status` shows no uncommitted changes on `feature-mcp1`. The five BL-031.75 commits are present (`cadb2fb` → `e095f50`).
- [ ] **0.2 — `mcp-server` built.** `npm -w @gst/mcp-server run build` from repo root. Output reports `[gst-mcp] built dist/index.js (v0.0.1)`. The wire-protocol version is 0.0.1 per the pre-commit chore.
- [ ] **0.3 — Tests green.** `npm -w @gst/mcp-server run test` reports `172 passed`. Repo-root `npx astro check && npm run lint && npm run lint:css && npm run test:run` all green.
- [ ] **0.4 — Claude Desktop configured.** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%\Claude\claude_desktop_config.json` (Windows) registers the GST MCP server pointing at `<repo>/mcp-server/dist/index.js`. See [`mcp-server/README.md` § Configure clients → Claude Desktop](../../../mcp-server/README.md#claude-desktop) for the exact JSON snippet.
- [ ] **0.5 — Restart Claude Desktop.** Quit fully, relaunch. The MCP indicator should show "gst" as connected.
- [ ] **0.6 — Connection sanity.** Open the connectors UX in Claude Desktop and confirm the GST server lists 9 Tools, 128 Resources, **8 Prompts** (the new surface). The eight prompts should appear in the slash-menu picker when you type `/` in chat — names start with `gst_`.
- [ ] **0.7 — Radar cache seeded.** From repo root: `npm run radar:seed`. The `.cache/inoreader/` directory must exist before V7 runs (one of V7's trials deliberately deletes it; seed first).

If any prereq fails: fix before proceeding. Server-boot failures usually surface at the `assertPromptInvariants` check in `_registry.ts` — read the thrown message and fix the offender.

---

## V1 — `gst_diligence_kickoff`

**Procedure**

1. In Claude Desktop, type `/` to open the slash-menu. Select `gst_diligence_kickoff`.
2. Fill the form with a real or representative target. Required fields: `targetName` + the 13 `UserInputs` enums + `geographies` array.
3. Submit. Observe the model: it should call `generate_diligence_agenda` exactly once, then reference `gst://library/vdr-structure` (either by reading it or by naming it in the output).

**Pass criteria**

- [ ] Memo has 4 sections: target context, prioritized agenda, attention areas, suggested VDR requests.
- [ ] `generate_diligence_agenda` is called once.
- [ ] `gst://library/vdr-structure` is referenced (read or cited).
- [ ] Senior-consultant sign-off: "reads as if I wrote it."

**Evidence (paste raw output here; will migrate to README + golden file)**

<details>
<summary>V1 input + output</summary>

```
Input args:
  TBD

Model output:
  TBD
```

</details>

---

## V2 — `gst_target_quick_look`

**Procedure**

1. Slash-menu → `gst_target_quick_look`. Fill: `{ targetName, productType, arr, stage, hqJurisdiction }`.
2. Pick a target where SOME inputs are derivable and OTHERS are explicitly unknown — V2's whole point is exercising the ICG `-1` ("Not sure") fallback workflow.
3. Submit. The model invokes 4 tools (ICG, TechPar, Tech Debt, search_regulations).
4. **Click each surfaced "Open in Hub" deep-link in a browser** to verify state restoration:
   - ICG link → wizard opens with all 20 answers pre-populated.
   - Tech Debt link → calculator opens with all 10 inputs restored (subject to slider quantization).
   - Regulatory Map link → opens filtered to the supplied `hqJurisdiction`.

**Pass criteria**

- [ ] Output is one digestible page (header + 5 content sections + Open-in-Hub).
- [ ] ICG, TechPar, Tech Debt called once each; `search_regulations` called for the supplied jurisdiction.
- [ ] Regulatory frameworks named for the supplied jurisdiction.
- [ ] **3 deep-links present and restore state** (ICG + Tech Debt + Regulatory Map).
- [ ] **TechPar deferred-deep-link disclosure note appears** (BL-031.95 reference).
- [ ] Assumptions / unknowns subsection lists every ICG question answered as `-1`.
- [ ] Senior-consultant sign-off.

**Evidence**

<details>
<summary>V2 input + output</summary>

```
TBD
```

</details>

---

## V3 — `gst_comparable_engagements_memo`

**Procedure**

1. Slash-menu → `gst_comparable_engagements_memo`. Fill `targetDescription` (free text); optionally `theme` and `engagementCategory`.
2. Submit. The model should call `list_portfolio_facets` first, then 1–3× `search_portfolio` to find a useful match set.

**Pass criteria**

- [ ] 3–5 comparable engagements named (codeName + 1-line context + lesson per match).
- [ ] Lessons framed analogically as guidance for the current target, not retrospective narrative.
- [ ] Closing 2–3 sentence cross-shortlist synthesis present.
- [ ] Senior-consultant sign-off.

**Evidence**

<details>
<summary>V3 input + output</summary>

```
TBD
```

</details>

---

## V4 — `gst_regulatory_exposure_brief`

**Procedure**

1. Slash-menu → `gst_regulatory_exposure_brief`. Fill: `{ targetJurisdictions: ['eu', 'us-ca'], dataCategories: ['data-privacy', 'ai-governance'], productType: <e.g. 'b2b-saas'> }`.
2. Submit. The model calls `search_regulations` per jurisdiction × category and reads each match's Resource body via `resources/read`.
3. **Click the surfaced filtered Regulatory Map deep-link** in a browser to verify `?region=&filter=` filter restoration.

**Pass criteria**

- [ ] `search_regulations` called for each jurisdiction × category combination.
- [ ] Per-framework Resources read by URI (look for the model invoking `resources/read gst://regulations/...`).
- [ ] Brief assembled with: per-jurisdiction breakdown + cross-jurisdictional themes + Open-in-Hub.
- [ ] **Per-framework anchor URLs present** in the output.
- [ ] **Filtered Regulatory Map deep-link** restores `?region=&filter=` filters byte-identically.
- [ ] Obligation summaries are tailored to the supplied `productType` (not generic).
- [ ] Senior-consultant sign-off.

**Evidence**

<details>
<summary>V4 input + output</summary>

```
TBD
```

</details>

---

## V5 — `gst_vdr_audit` (TWO trials: one-shot + interactive)

**Procedure (a) — one-shot mode**

1. Slash-menu → `gst_vdr_audit`. Fill `vdrInventory` with a representative list (e.g., copy from a real VDR you have access to, or simulate with 5–10 folders).
2. Submit. The model reads `gst://library/vdr-structure` and produces the audit immediately.

**Procedure (b) — interactive mode**

1. Slash-menu → `gst_vdr_audit`. Leave `vdrInventory` empty / omitted.
2. Submit. The model should ask you to paste your VDR list before proceeding.
3. Paste the same list as (a) (or a different one to exercise variation). The model produces the audit.

**Pass criteria (both modes)**

- [ ] Mapping table (canonical folder × target folder × Direct/Partial/Gap status).
- [ ] Gaps flagged with 2–3 concrete document requests each.
- [ ] Out-of-scope content surfaced with recommendations.
- [ ] Prioritized follow-up request list (top 5–7).
- [ ] Senior-consultant sign-off on BOTH modes.

**Evidence**

<details>
<summary>V5(a) input + output</summary>

```
TBD
```

</details>

<details>
<summary>V5(b) input + output</summary>

```
TBD
```

</details>

---

## V6 — `gst_architecture_layer_review`

**Procedure**

1. Slash-menu → `gst_architecture_layer_review`. Fill `targetSummary` (free text, ≥ 20 chars).
2. Submit. The model reads `gst://library/business-architectures` and walks all 5 layers.

**Pass criteria**

- [ ] All 5 layers walked in order: Software → Infrastructure → Data → Organizational → Industry.
- [ ] 2–3 architectural risks per layer, phrased as concrete liabilities (not generic concerns).
- [ ] 1–2 investigation handles per layer.
- [ ] Closing "Cross-layer patterns" section with 2–3 patterns spanning multiple layers.
- [ ] `gst://library/business-architectures` referenced.
- [ ] Senior-consultant sign-off.

**Evidence**

<details>
<summary>V6 input + output</summary>

```
TBD
```

</details>

---

## V7 — `gst_radar_brief_today` (TWO trials + cache-missing path)

**Procedure (a) — category filter**

1. Confirm `.cache/inoreader/` is seeded (`npm run radar:seed` from repo root if not).
2. Slash-menu → `gst_radar_brief_today`. Fill `category: 'enterprise-tech'`. Leave `sinceHours` at default (24).
3. Submit. The model reads `gst://radar/fyi/latest`, filters to enterprise-tech, summarizes.

**Procedure (b) — defaults (all categories)**

1. Slash-menu → `gst_radar_brief_today`. Leave both args empty.
2. Submit. The model produces a brief across all four categories.

**Procedure (c) — snapshot-missing**

1. Delete the cache: `rm -rf .cache/inoreader/` (or platform equivalent).
2. Restart Claude Desktop (or wait for the MCP server to re-read on next invocation).
3. Slash-menu → `gst_radar_brief_today`. Submit with any args.
4. Confirm the model surfaces the snapshot-missing structured error verbatim and **does not fabricate items**.
5. **Important**: re-seed (`npm run radar:seed`) when V7 is done so subsequent verification (or normal use) works.

**Pass criteria**

- [ ] (a) and (b): FYI snapshot read; items grouped by category; 3–5 items per category; GST Take voice; "GST Take across the brief" closing paragraph.
- [ ] (c): structured error wired in BL-031.5 fires cleanly; no fabricated items; no stack trace.
- [ ] Senior-consultant sign-off on all three trials.

**Evidence**

<details>
<summary>V7(a), (b), (c) — input + output</summary>

```
TBD
```

</details>

---

## V8 — `gst_diligence_handoff_memo`

**Procedure**

1. Slash-menu → `gst_diligence_handoff_memo`. Fill the full `UserInputs` payload + `targetName`.
2. Optional variant: also supply `agendaJson` from a previous V1 run to exercise the "use pre-generated artifact" branch.
3. Submit. The model orchestrates `generate_diligence_agenda` (or uses the supplied JSON) + `search_portfolio` + reads `gst://library/vdr-structure`.

**Pass criteria**

- [ ] Single coherent memo (not stitched-together tool outputs).
- [ ] All sections present: engagement context, agenda, attention areas (cross-referenced to comparables), comparable engagement library, prioritized VDR follow-ups, open questions / next steps.
- [ ] Per-portfolio-match anchor URLs to `/ma-portfolio` rows present (static `/#<id>` anchors; not stateful — keep simple per the deep-link table).
- [ ] When `agendaJson` is supplied, the model uses it directly instead of re-calling `generate_diligence_agenda`.
- [ ] Senior-consultant sign-off.

**Evidence**

<details>
<summary>V8 input + output</summary>

```
TBD
```

</details>

---

## Closure procedure (after V1–V8 all signed off)

In a single closure commit:

1. **Migrate the recorded evidence** from this doc's `<details>` blocks into:
   - **`mcp-server/README.md` § "Last verified (BL-031.75 surface)"** — replace the placeholder with V1–V8 excerpts (≤ 6 lines per prompt; pattern parallels the BL-031.5 stanza in commit `1ad2ba5`).
   - **`mcp-server/tests/examples/<slug>.golden.md`** — replace each placeholder with the full recorded input + expanded body + model output. Update the frontmatter `recordedAt` (ISO date) and `model` (e.g., `claude-opus-4-7`).
2. **Update `BACKLOG.md` § BL-031.75**:
   - Tick the two pending AC items: "Golden-output snapshots per prompt" and "**Senior-consultant review gate**".
   - Update the Status line: `Code-complete (April 30, 2026); closure pending V1–V8 verification + senior-consultant sign-off` → `Complete (May <DD>, 2026)`.
3. **Delete this verification doc** (`git rm src/docs/development/MCP_SERVER_PROMPTS_BL-031_75_Verification.md`). Doc history is in `git log`.
4. **Validate**: `npm -w @gst/mcp-server run typecheck && build && test` green; repo-root `npx astro check && npm run lint && npm run lint:css && npm run test:run` green. The golden-snapshots integration test now validates the recorded frontmatter (real `recordedAt` + `model` values).
5. **Commit** with message:
   ```
   docs(mcp): close BL-031.75 — V1-V8 land, README has real recorded values
   ```
6. **Push only on user direction.** Standing rule from CLAUDE.md.

---

_Last updated: 2026-05-01_
