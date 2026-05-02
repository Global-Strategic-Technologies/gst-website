# Hub Tools — URL State Restoration & MCP Deep-Link Surface (BL-031.95)

> **Backlog initiative**: [BL-031.95: Hub Tools — URL State Restoration & MCP Deep-Link Surface](BACKLOG.md#bl-03195-hub-tools--url-state-restoration--mcp-deep-link-surface)
>
> **Predecessors**:
>
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture, repo placement, lifecycle. Read first.
> - [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) — shipped URL state for Tech Debt, ICG, and Regulatory Map. Established the encoder pattern and the MCP-wrapper-emits-deeplink convention. The four tools this initiative touches were deferred from that initiative's scope.
> - [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — shipped the prompt library that consumes the deep-links. Five prompts in particular currently emit "deep-link will be added when…" disclaimers that this initiative retires.
> - [MCP_SERVER_CONTRACTS_BL-031_85.md](MCP_SERVER_CONTRACTS_BL-031_85.md) — formalized the per-tool `CONTRACT.md` registry. The `.describe()` consistency pass under this initiative sources its description text from the contracts.
> - [MCP_SERVER_STAGE_ADAPTER_BL-031_87.md](MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) — shipped the canonical funding-stage taxonomy. The `.describe()` text for `companyStage` / `stage` fields can now reference the canonical layer; the deep-link encoders for ICG and TechPar URL state must accept canonical-or-native input through the same Adapter pathway.
>
> **Sequels**:
>
> - [BL-032 in BACKLOG.md](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) — when MCP tools serve over HTTP, the deep-links remain in the same emitted shape; the Remote Proxy in front of each tool composes orthogonally with the URL encoders this initiative adds.
> - [BL-031.95.5 (TBD)](#) — if a future initiative wants to canonicalize URL-state payloads (so a URL produced by one surface can be loaded by another), the encoders gain canonical-aware variants. Out of scope today.
>
> **Scope**: this document covers [BL-031.95](BACKLOG.md#bl-03195-hub-tools--url-state-restoration--mcp-deep-link-surface) — closing the deferred work from BL-031.75 by adding URL state restoration to the four remaining Hub tools (TechPar, Diligence Machine, Radar, M&A Portfolio), wiring corresponding `deeplink` fields into their MCP tool wrappers, and updating the BL-031.75 prompts that surface the new deep-links. Two input-ergonomics fixes surfaced during BL-031.75 V2 verification land in the same initiative because they touch the same schema and wrapper files. A `.describe()` consistency pass on tool Zod schemas is folded in (originally filed under BL-031.85 closure).
>
> **Status**: Open. Depends on BL-031.75 (already complete) and BL-031.87 (already complete — the `.describe()` text for stage fields references the canonical taxonomy). Co-scheduling with BL-031.87 was considered and rejected (different review surfaces).

---

## Context

[BL-031.75](MCP_SERVER_PROMPTS_BL-031_75.md) shipped the consultant prompt library — eight named workflows orchestrating the Tools and Resources delivered in BL-031 and BL-031.5. As part of that initiative's "Commit 0.5," three Hub tools (Tech Debt, ICG, Regulatory Map) gained the ability to emit a `deeplink` field in their MCP responses — a populated URL that opens the website's wizard with the analysis state restored byte-for-byte. Analysts moving from a Claude conversation to the website Hub for PDF download / export / email / share could pick up exactly where the MCP tool left off.

That worked for three of the seven active MCP tools. The other four — `compute_techpar`, `generate_diligence_agenda`, `search_radar_cache`, `search_portfolio` — could not emit working deep-links because their corresponding Hub pages had no URL-state restoration. The tools' MCP responses either omitted the `deeplink` field or emitted a placeholder URL that landed on the page's intro state with no analysis context. Five of the eight BL-031.75 prompts (`gst_target_quick_look`, `gst_diligence_kickoff`, `gst_diligence_handoff_memo`, `gst_radar_brief_today`, `gst_comparable_engagements_memo`) carry "deep-link will be added when the page supports URL state (tracked under BL-031.95)" disclaimers in their bodies as a result.

This initiative closes that gap. It also handles two input-ergonomics fixes surfaced during BL-031.75 V2 verification — both inflict their pain at the same schema-and-wrapper boundary URL state restoration touches, so folding them in saves a third pass over the same files:

1. **TechPar `infraHosting` unit normalization.** The engine annualizes `infraHosting` via `× 12` (`src/utils/techpar-engine.ts:231`) while every other money field is annual. An agent emitting reasonable annual figures gets 12× output for hosting and has to retry. A clean rename to `infraHostingAnnual` plus dropping the multiplier eliminates the trial-and-error.
2. **Diligence Machine `'unknown'` parity with ICG `-1`.** Today the diligence wizard requires every dimension. ICG is more honest — `-1` ("Not sure") is a first-class value that widens the agenda conservatively. Mirroring that on diligence lets `gst_diligence_kickoff` work at deal kickoff (when much is unknown) without the model being forced to guess.

The `.describe()` consistency pass on tool Zod schemas (originally filed under BL-031.85 closure as a Tier 2 hardening item) is also folded in. BL-031.95 already opens every relevant schema file for the URL-state and ergonomics work; adding `.describe()` calls in the same commits avoids a third schema-touching pass.

---

## What "good URL state restoration" looks like — by archetype

[BL-031.5](MCP_SERVER_HUB_SURFACE_BL-031_5.md) established two URL-encoding archetypes for Hub tools, each suited to a different UX. BL-031.95 applies the same archetypes to the four remaining tools.

### Form-wizard archetype — `?s=<base64>` (compact JSON)

**Used by**: Tech Debt Calculator (BL-031.5), ICG (BL-031.5), and **TechPar / Diligence Machine** (this initiative).

The encoder serializes a compact key map of all wizard inputs as JSON, base64-encodes the result, and writes it as a single `?s=<base64>` parameter. The decoder reverses: parses the base64, JSON-decodes, validates each field (silently dropping invalid values), and returns a `Partial<State>`. The page-load init reads the URL, applies the partial state on top of defaults, and renders the wizard at its terminal step (results view).

**Why base64**: multi-field wizards encode state that's the artifact analysts share — losing one field corrupts the share. Base64 produces a single opaque blob that survives copy-paste, social-share unfurls, and URL escaping; the user never reads it. The encoders trade readability for transport robustness.

**Compact key map**: the encoder shortens field names to single letters (`s` for currentStep, `a` for answers, etc.) so a 14-field state stays under typical URL length limits. The decoder's parsing is the source of truth for the compact-to-full mapping.

**Reference implementations**: [`src/utils/icg-engine.ts`](../../utils/icg-engine.ts) `encodeState` / `decodeState` (lines 160–225); [`src/utils/tech-debt-engine.ts`](../../utils/tech-debt-engine.ts) `encodeState` / `decodeState` (lines 186–230).

### Filter-grid archetype — readable query parameters

**Used by**: Regulatory Map (BL-031.5), and **Radar / M&A Portfolio** (this initiative).

The encoder writes each filter as a separate readable query parameter (`?category=ai-governance&since=72`). The decoder uses `URLSearchParams`, validates each filter against a known set, and silently drops unknowns. No base64; no compaction.

**Why readable**: filter UIs reflect user-explicit selections (one or two values out of a small finite set). Readable URLs aid debugging — analysts can hand-edit `?category=` to test a different filter without round-tripping through the wizard. The URLs are also more discoverable: a teammate seeing `?theme=Cloud%20Migration` understands what's filtered without decoding.

**Reference implementation**: [`src/utils/regulatory-map-url.ts`](../../utils/regulatory-map-url.ts) `encodeFilters` / `decodeFilters`.

### Per-tool archetype assignments

| Tool                  | Archetype                   | Encoder file                       | Why                                                                                                                                |
| --------------------- | --------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **TechPar**           | Form-wizard `?s=<base64>`   | `src/utils/techpar-url.ts` (new)   | 14-field wizard; state is the artifact analysts share                                                                              |
| **Diligence Machine** | Form-wizard `?s=<base64>`   | `src/utils/diligence-url.ts` (new) | 13-field wizard; state is the artifact analysts share. URL augments existing localStorage (URL takes precedence on page-load init) |
| **Radar**             | Filter-grid readable params | `src/utils/radar-url.ts` (new)     | 2 filters today (`category`, `since`); user-explicit selections; readable URLs aid debugging                                       |
| **M&A Portfolio**     | Filter-grid readable params | `src/utils/portfolio-url.ts` (new) | 3 filters today (`theme`, `category`, `engagementType`); same rationale                                                            |

**Why two new files for the form-wizard archetype** (vs. extending the existing `*-engine.ts` files like ICG and Tech Debt did): cleaner separation of concerns. URL encoders are pure serialization concerns with no engine logic; isolating them in `*-url.ts` files makes the dependency direction explicit (URL encoder imports engine types; engine never imports URL encoder). For consistency, the BL-031.5 Tech Debt / ICG encoders would migrate too — out of scope for this initiative, but flagged for [BL-034](BACKLOG.md#bl-034-mcp-server--documentation-cleanup) doc-cleanup if/when the inconsistency becomes a maintenance friction point.

---

## Why this earns its own initiative (rather than folding in elsewhere)

**Not BL-031.5** because BL-031.5 already shipped. The four deferred Hub tools were left out of BL-031.5's scope intentionally — the URL-state pattern was the deliverable, not its uniform application across every tool. Applying the pattern to four more tools is a follow-on, not a continuation.

**Not BL-031.75** because BL-031.75's competency is content design — what does a senior consultant actually do step-by-step on a recurring motion. Folding URL-state engineering work into a content-design initiative would have inflated scope across two cognitive modes with different review gates. BL-031.75 wisely shipped the deep-link _pattern_ with the three tools that already had URL state and deferred the retrofits.

**Not BL-031.85** because BL-031.85 is documentation consolidation. The `.describe()` AC item that landed in BL-031.85's closure list is a schema-hygiene pass (code, not docs); it folds into BL-031.95 because BL-031.95 already opens those schema files.

**Not BL-031.87** because BL-031.87 is a focused, single-pattern initiative (Adapter at the MCP-wrapper boundary for funding-stage vocabulary translation). Folding URL state in would have inflated it from "one pattern, two tools, ~3 hrs" to "one pattern, two tools, plus URL state across four tools, plus two ergonomics fixes" — heterogeneous scope, two unrelated review surfaces.

**Its own initiative** because:

1. The competency is **product engineering across four heterogeneous Hub tools** — form wizards, deferred-island feeds, filter grids. Each tool is a half-day to a day depending on existing state-management complexity; the surface is wide enough that the design pass benefits from explicit treatment.
2. The output is **a uniform deep-link surface** across every prompt-driven Hub-tool URL — closes the BL-031.75 design intent that "every prompt's Open-in-Hub link should restore state byte-for-byte." Deferred work has a real ergonomic cost (analysts learn that some prompts' deep-links work and some don't); closing it uniformly is a separately-trackable deliverable.
3. The work is sequenced by **the prompts being in production**, not by code dependencies. With BL-031.75 shipped and the prompts in active use, the deferred deep-links become visible friction; BL-031.95 is the right response.
4. The downstream value (BL-032+ remote consumers see uniform deep-link emission across tools; future Hub tools have a clear convention; the four input-ergonomics retrofits ship together) is concrete and worth a separately-tracked deliverable.

---

## Implementation plan

Five phases, each landing as a separate commit (or a small sequence of commits in the same PR). Phases 1–4 are independent and could co-schedule; phase 5 (verification + docs) runs at the end.

### Phase 1 — TechPar URL state + `infraHosting` rename + `.describe()` pass on TechPar schema

The TechPar work bundles together because all three changes touch `src/schemas/techpar.ts`, `src/utils/techpar-engine.ts`, and `mcp-server/src/tools/techpar.ts`.

1. **`infraHosting` → `infraHostingAnnual` rename.** Rename the field in `src/schemas/techpar.ts`; drop the `× 12` annualization at `src/utils/techpar-engine.ts:231`; update the website page's form labels and any inline references; update `mcp-server/src/tools/techpar.ts` tool description; update `mcp-server/src/docs/techpar/CONTRACT.md`; update existing TechPar tests to send annual values.
2. **URL encoder.** Author `src/utils/techpar-url.ts` with `encodeState(state: TechParInputs): string` and `decodeState(encoded: string): Partial<TechParInputs> | null`. Compact key map; base64-encoded JSON; field-level validation in the decoder.
3. **Page wiring.** Update `src/pages/hub/tools/techpar/index.astro` to call `decodeState` on page-load init, apply the partial state on top of defaults, and call `encodeState` on every state change to write the URL via `history.replaceState`.
4. **MCP wrapper deep-link.** Extend `mcp-server/src/tools/techpar.ts` to emit `deeplink: z.string().url()` per the BL-031.75 wrapper-schema pattern; the wrapper imports `encodeState` from `src/utils/techpar-url.ts`.
5. **`.describe()` pass on `src/schemas/techpar.ts`.** Add JSON Schema descriptions to every field, sourcing text from `mcp-server/src/docs/techpar/CONTRACT.md`. The `stage` field's `.describe()` references the canonical funding-stage taxonomy from BL-031.87.
6. **Round-trip parity test.** Vitest unit test asserting `decodeState(encodeState(input)) === input` for representative TechPar payloads; symmetric with the BL-031.5 Tech Debt / ICG tests.

**Acceptance**: a freshly-spawned agent calls `compute_techpar` once with reasonable annual values and gets sensible output; the response's `deeplink` opens the TechPar wizard with all 14 inputs restored; no trial-and-error retry needed.

### Phase 2 — Diligence Machine URL state + `'unknown'` input support + `.describe()` pass on diligence schema

Larger phase because `'unknown'` parity ripples through the engine, the wizard UI, the MCP tool, and two prompts.

1. **`'unknown'` enum extension.** Extend each enum in `src/schemas/diligence.ts` `UserInputsSchema` with an `'unknown'` option (mirroring ICG `-1` "Not sure" pattern). Update `src/data/diligence-machine/wizard-config.ts` to include the new option label/description.
2. **Wizard UI.** Update `src/pages/hub/tools/diligence-machine/` to render an "I don't know" affordance on every step.
3. **Engine trigger map.** Update `src/utils/diligence-engine.ts` so `'unknown'` answers do NOT eliminate triggers (only known values can — agenda widens conservatively when input is incomplete).
4. **MCP tool.** Update `mcp-server/src/tools/diligence.ts` tool description to call out the new option. Tool result surfaces an `unknownDimensionCount` field so deliverables can lead with a low-confidence callout when ≥7 of 13 are unknown (parallels the ICG ≥10/20 threshold in `gst_target_quick_look`).
5. **URL encoder + page wiring.** Author `src/utils/diligence-url.ts`. URL state augments (does NOT replace) the existing localStorage layer. Page-load init: URL state takes precedence; localStorage is the fallback for "I closed the tab, came back tomorrow." Update `src/pages/hub/tools/diligence-machine/` to wire encode/decode.
6. **MCP wrapper deep-link.** Extend `mcp-server/src/tools/diligence.ts` to emit `deeplink` (wraps the diligence-script result with a populated wizard URL).
7. **Prompt argsSchemas.** Mark the 13 wizard fields as optional with default `'unknown'` in `gst_diligence_kickoff` and `gst_diligence_handoff_memo`. Update prompt bodies to instruct the model to use `'unknown'` when inputs aren't derivable.
8. **`.describe()` pass on `src/schemas/diligence.ts`.** As with Phase 1.
9. **Round-trip parity test.**

**Acceptance**: a `gst_diligence_kickoff` invocation with only `targetName` supplied parses and produces a coherent, intentionally-broad agenda; the response's `deeplink` opens the diligence wizard with the supplied dimensions populated and all unsupplied dimensions defaulted to `'unknown'`.

### Phase 3 — Radar URL state

Smaller phase; deferred-island feed, two filters.

1. **URL encoder.** Author `src/utils/radar-url.ts` with `encodeFilters` / `decodeFilters` (filter-grid archetype). Filters: `category` (RADAR_CATEGORIES enum) and `since` (hours, integer 1–168).
2. **Component wiring.** Update `src/components/radar/CategoryFilter.tsx` (or equivalent) to read URL state on mount and write URL state on filter change. Deep-linkable filter views work for both FYI and Wire categories.
3. **MCP wrapper deep-link.** Extend `mcp-server/src/tools/radar-cache.ts` to emit `deeplink` (filtered Radar URL based on `category` / `sinceHours` inputs).
4. **`.describe()` pass on `src/schemas/regulatory-map.ts`** (Radar shares the regulatory-map schema for category typing — confirm during implementation; if Radar has its own schema, add `.describe()` there instead).
5. **Round-trip parity test.**

**Acceptance**: a `gst_radar_brief_today` invocation with `category: 'ai-governance'` produces a `deeplink` that opens the Radar feed pre-filtered to that category.

### Phase 4 — M&A Portfolio URL state + `.describe()` pass on portfolio schema

1. **URL encoder.** Author `src/utils/portfolio-url.ts` with `encodeFilters` / `decodeFilters`. Filters: `theme`, `category` (engagement category), `engagementType`.
2. **Component wiring.** Update `src/components/portfolio/` filter UI to read URL state on mount and write URL state on filter change.
3. **MCP wrapper deep-link.** Extend `mcp-server/src/tools/portfolio.ts` to emit `deeplink`.
4. **`.describe()` pass on `src/schemas/portfolio.ts`.**
5. **Round-trip parity test.**

**Acceptance**: a `gst_comparable_engagements_memo` invocation produces a `deeplink` that opens the Portfolio grid pre-filtered to the matched engagements.

### Phase 5 — Prompt body updates + verification + docs

1. **Prompt body updates** (5 prompts): `gst_target_quick_look`, `gst_diligence_kickoff`, `gst_diligence_handoff_memo`, `gst_radar_brief_today`, `gst_comparable_engagements_memo`. Each gains the new `deeplink` surface and retires the "deep-link will be added when the page supports URL state" disclaimer. Per-prompt golden snapshots regenerated.
2. **Verification re-run.** Re-run BL-031.75 V2 / V3 / V7 / V8 trials with deep-link presence + browser state-restoration checks. Recorded into `mcp-server/README.md` § "Last verified" under a new "BL-031.95 surface" stanza.
3. **Doc updates.** `MCP_SERVER_PROMPTS_BL-031_75.md` § "Deferred work" updated to point at BL-031.95 closure rather than BL-034 (the deferred work has its own initiative now). This architecture doc updated with any deviations made during implementation.

---

## Critical files to read or modify

| File                                                                                                                                                         | Action                                                                                       | Why                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/schemas/techpar.ts`                                                                                                                                     | Edit — rename `infraHosting` → `infraHostingAnnual`; add `.describe()` to every field        | Schema is canonical; the website wizard and MCP tool both validate against it |
| [`src/utils/techpar-engine.ts:231`](../../utils/techpar-engine.ts#L231)                                                                                      | Edit — drop `× 12` annualization                                                             | The math change that makes the rename meaningful                              |
| `src/utils/techpar-url.ts` (new)                                                                                                                             | Create                                                                                       | Form-wizard URL encoder; imported by both website page and MCP wrapper        |
| `src/pages/hub/tools/techpar/index.astro`                                                                                                                    | Edit — wire encode/decode                                                                    | Page-load init + state-change → URL sync                                      |
| `mcp-server/src/tools/techpar.ts`                                                                                                                            | Edit — emit `deeplink`; update tool description                                              | The MCP wrapper that now surfaces the URL                                     |
| `src/schemas/diligence.ts`                                                                                                                                   | Edit — add `'unknown'` enum value to every UserInput field; add `.describe()` to every field | Mirrors ICG `-1` parity                                                       |
| `src/data/diligence-machine/wizard-config.ts`                                                                                                                | Edit — add `'unknown'` option label/description per field                                    | UI source of truth                                                            |
| `src/utils/diligence-engine.ts`                                                                                                                              | Edit — trigger map: `'unknown'` does not eliminate triggers                                  | The semantics that make `'unknown'` useful                                    |
| `src/utils/diligence-url.ts` (new)                                                                                                                           | Create                                                                                       | Form-wizard URL encoder; URL augments existing localStorage                   |
| `src/pages/hub/tools/diligence-machine/`                                                                                                                     | Edit — wire URL state alongside localStorage                                                 | URL takes precedence on page-load init                                        |
| `mcp-server/src/tools/diligence.ts`                                                                                                                          | Edit — emit `deeplink`; surface `unknownDimensionCount`                                      | Wrapper-level instrumentation                                                 |
| `src/utils/radar-url.ts` (new)                                                                                                                               | Create                                                                                       | Filter-grid encoder for Radar                                                 |
| `src/components/radar/CategoryFilter.tsx` (or equivalent)                                                                                                    | Edit — wire URL state                                                                        | Component-level integration                                                   |
| `mcp-server/src/tools/radar-cache.ts`                                                                                                                        | Edit — emit `deeplink`                                                                       | Wrapper                                                                       |
| `src/utils/portfolio-url.ts` (new)                                                                                                                           | Create                                                                                       | Filter-grid encoder for Portfolio                                             |
| `src/components/portfolio/` filter UI                                                                                                                        | Edit — wire URL state                                                                        | Component-level integration                                                   |
| `mcp-server/src/tools/portfolio.ts`                                                                                                                          | Edit — emit `deeplink`                                                                       | Wrapper                                                                       |
| `src/schemas/portfolio.ts`, `src/schemas/icg.ts`, `src/schemas/tech-debt.ts`, `src/schemas/regulatory-map.ts`                                                | Edit — `.describe()` pass                                                                    | Schema-hygiene; sources text from each per-tool CONTRACT.md                   |
| `mcp-server/src/prompts/target-quick-look.ts`, `diligence-kickoff.ts`, `diligence-handoff-memo.ts`, `radar-brief-today.ts`, `comparable-engagements-memo.ts` | Edit — body updates surfacing new deep-links; retire disclaimers                             | Prompt bodies that consumed the deferred deep-links                           |
| `mcp-server/tests/examples/*.golden.md`                                                                                                                      | Edit — regenerate snapshots for the 5 updated prompts                                        | V verification trail                                                          |
| `mcp-server/README.md` § "Last verified"                                                                                                                     | Edit — add "BL-031.95 surface" stanza                                                        | Verification evidence trail (matches BL-031.75 closure pattern)               |

---

## Risks & mitigations

| Risk                                                                                                                                   | Mitigation                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TechPar `infraHosting` rename breaks production users with bookmarked wizard URLs**                                                  | TechPar has no URL state today, so there's no production URL state to migrate. The wizard form gets a one-line label change. The schema rename is a Zod-level breaking change; existing tests update in the same commit.                                         |
| **Diligence Machine `'unknown'` extension breaks existing trigger-map behavior**                                                       | Comprehensive engine test refresh in Phase 2: `'unknown'` answers must not eliminate any trigger that a missing answer would have eliminated; ≥7-of-13 unknowns must NOT silently produce a degenerate "no triggers" output.                                     |
| **URL state takes precedence over localStorage in Diligence — silently overwrites in-progress wizard state**                           | Page-load init explicitly checks for URL state first; if no `?s=` parameter is present, falls through to localStorage. Documented in the encoder JSDoc and in [`mcp-server/src/docs/diligence/CONTRACT.md`](../../../mcp-server/src/docs/diligence/CONTRACT.md). |
| **Two new URL-encoder files (`techpar-url.ts`, `diligence-url.ts`) inconsistent with BL-031.5's pattern of extending the engine file** | Documented in this doc § "Per-tool archetype assignments" as an intentional choice. BL-031.5 Tech Debt / ICG migration to the same pattern flagged for BL-034 if it becomes a friction point.                                                                    |
| **`.describe()` text sourced from CONTRACT.md becomes stale when CONTRACT.md updates**                                                 | The contract is canonical; `.describe()` text cites the contract. A future BL-034 contract-parity Vitest (Tier 2 hardening) would catch drift; today the discipline is conventional.                                                                             |
| **Prompt body updates ripple through to existing pinned prompts in long-running conversations**                                        | All five updated prompts bump version (e.g., `0.0.2` → `0.0.3`); the lastReviewedAt date updates; the BL-031.75 prompt-staleness Vitest catches future drift. Prior versions remain reachable via `git log`.                                                     |
| **Five prompt golden snapshots regenerated at once — risk of accepting a degraded output as the new baseline**                         | Each regeneration recorded with senior-consultant verdict in the snapshot's body (matches the BL-031.75 V<n> evidence pattern); diff vs prior baseline reviewed at PR time.                                                                                      |
| **Five tools' MCP wrappers gain `deeplink` emission simultaneously — risk of inconsistent shape**                                      | The wrapper-schema pattern (`*MCPResultSchema`) is established in BL-031.75 Commit 0.5; phases 1–4 each follow it. A unit test per tool asserts the `deeplink` field shape at the wrapper level.                                                                 |
| **Live MCP exercise window (re-run V2/V3/V7/V8) deferred**                                                                             | Documented as deferred to next out-of-band model run, mirroring BL-031.87 closure pattern. Unit test coverage + round-trip parity tests substitute structurally for the live verification.                                                                       |

---

## Out of scope (explicit)

- **Adding URL state to Hub tools beyond the four named** — Library articles are static; the home pages and gateway pages have no analyst-facing state to encode. If a future tool surfaces analytical state, it picks a BL-031.5/BL-031.95 archetype based on its UX.
- **Schema changes to underlying engines beyond what URL encoding requires** — no functional behavior changes; pure additive instrumentation. The `'unknown'` extension to diligence is the one engine-touching change, and it's a conservative widening (only known values eliminate triggers; missing values were already treated similarly).
- **Performance optimization of the deep-link encoder for very-large states** — `?s=<base64>` length is bounded by the wizard's field count; no anticipated growth. If the URL exceeds typical browser limits in the future (~2000 chars), revisit with a server-side state-storage layer.
- **Adding new filters to Radar or M&A Portfolio beyond what URL encoding requires** — if a filter doesn't exist in the UI today, this initiative does not add it.
- **Removing localStorage from Diligence Machine** — it stays as the fallback persistence layer for "closed the tab, came back tomorrow." URL state is the share/restore layer; both serve.
- **HTTP transport / remote prompt access for the new deep-link surface** — BL-032 / BL-032.5 own the remote substrate. Deep-links continue to be HTTP URLs to `globalstrategic.tech/hub/...` regardless of the MCP transport.
- **Canonical-aware URL state across tools** — a TechPar URL state encoded on the website would still encode the native `stage` value (not the canonical equivalent), because the URL state is the engine's input shape. If cross-tool URL sharing becomes a concrete need (TechPar URL → ICG URL with the same canonical stage), a future initiative gains canonical-aware encoders. Not promised here.
- **Migration of Tech Debt / ICG encoders from `*-engine.ts` into sibling `*-url.ts` files** — flagged for [BL-034](BACKLOG.md#bl-034-mcp-server--documentation-cleanup) if pattern inconsistency becomes a friction point.
- **An IRL generator that consumes the URL-state encoders** — IRL is BL-031.85's strategic destination; URL state is independent. The encoders may be useful to a future IRL implementation but BL-031.95 does not deliver IRL.

---

_Last updated: 2026-05-02_
