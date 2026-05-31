# MCP Server — `gst_vdr_audit` Quality Maturity Roadmap (BL-036, Tiers 2–6)

> **Backlog initiative**: [BL-036: MCP Server — `gst_vdr_audit` Quality Maturity Roadmap (Tiers 2–6)](BACKLOG.md#bl-036-mcp-server--gst_vdr_audit-quality-maturity-roadmap-tiers-26)
>
> **Companion docs**:
>
> - [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — registered-prompt pattern; the V5 verification stanza records the critique this initiative closes. Load-bearing: `gst_vdr_audit` is one of the eight prompts shipped under BL-031.75 and the only one with an open quality caveat.
> - [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) — Library-Resource pattern. Tier 4's snapshot-cache strategy may borrow the `readThroughCache` shape used by Library Resources.
> - [MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md) — the request side of the diligence intake loop; `gst_vdr_audit` is the response audit. Tier 6's sell-side flip parallels the IRL's transactionContext arg.
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture and lifecycle.
> - [`mcp-server/src/docs/prompts/README.md`](../../../mcp-server/src/docs/prompts/README.md) — durable conceptual reference for the registered-prompt pattern (orchestrates body-mention invariant, golden-file maturity bar).
>
> **Predecessors**: BL-031.75 (V5 closed shipping Tier 1 — structured file-list input). Tier 4 also depends on BL-032.5 (remote transport / credential surface). Tier 5 also depends on BL-032.75 (production observability storage).
>
> **Sequels**: none. This initiative closes the V5 critique. Once all five tiers ship, the V5 "Spec note (2026-05-01)" caveat in the BL-031.75 verification doc retires.
>
> **Scope**: mature `gst_vdr_audit` from a structural-mapping prompt into a contents-grounded audit tool across five independently shippable tiers — file metadata, comparable cross-reference, live VDR provider integration, ongoing audit deltas, and a sell-side workflow flip.
>
> **Status**: Open · Tier 1 shipped in BL-031.75 V5 closure (commit recorded in `mcp-server/README.md § Last verified`). Tiers 2–6 unscheduled; sequence Tier 2 → Tier 3 → Tier 4 → Tier 5; Tier 6 independent of the others.

---

## Context — why this earns an initiative

During BL-031.75's V5 sign-off the senior consultant flagged `gst_vdr_audit` as the weakest of the eight shipped prompts: it produces a structured deliverable but operates on **weak input signal** — folder names alone — so most of the output is the canonical 9-folder taxonomy elaborated against training, not a contents-grounded audit of the target's actual VDR. The critique was captured in the V5 stanza with a "Spec note (2026-05-01)" caveat and shipping was unblocked on the strength of a roadmap to close the gap (this initiative).

The remaining seven prompts in the BL-031.75 surface each clear a higher value bar:

- `gst_diligence_kickoff` orchestrates `generate_diligence_agenda` against a fully-typed input schema
- `gst_target_quick_look` fan-outs to ICG / TechPar / Tech Debt and emits three Hub deep-links
- `gst_comparable_engagements_memo` reaches across the 57-project portfolio
- `gst_regulatory_exposure_brief` reads per-framework Resources and emits a filtered Regulatory Map deep-link
- `gst_radar_brief_today` consumes a live cached snapshot
- `gst_diligence_handoff_memo` composes agenda + comparables + VDR follow-ups
- `gst_architecture_layer_review` walks five layers against the business-architectures Library article

`gst_vdr_audit` alone reads as a **thin checklist generator** at parity with what a Word template plus the canonical taxonomy could produce — it does not earn its slot. The five tiers below progressively widen the input signal (Tier 2 → Tier 3 → Tier 4) and the output framing (Tier 5 → Tier 6) until value-per-invocation matches the other seven.

The pattern is also a **proving ground** for the "live external surface" prompt class. The order — input enrichment → contents heuristics → cross-portfolio reasoning → external API → ongoing state — is a template that will apply to any future `gst_repo_audit` (live GitHub org) or `gst_slack_summary` (live channel) prompt the firm might author.

---

## Decisions

Confirmed at planning (carried forward from the BL-036 BACKLOG stanza authored 2026-05-DD):

| Decision                                      | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Five tiers, each independently shippable**  | Each tier earns its own PR + golden-file regeneration + V5.n verification stanza. Shipping Tier 2 validates whether file metadata is sufficient signal before Tier 4's 1–2 week investment is committed.                                                                                                                                                                                                                                                                                               |
| **Tier 4 needs a credential-store substrate** | **Truth-pass 2026-05-31**: BL-032.5 shipped 2026-05-13 but shipped Resources + Prompts on remote HTTP — NOT a per-provider credential store. Worker today has flat `wrangler secret` bindings (Upstash / Inoreader / Sentry / MCP bearer keys), no dynamic per-customer-session credential layer. Tier 4 kickoff must (a) design that credential layer as a Tier-4 prerequisite, or (b) bind to whatever BL-033 external-pilot architecture decides about customer credentials. Not a free dependency. |
| **Tier 5 needs durable snapshot storage**     | BL-032.75 Phase 1 (typed AE emission) shipped 2026-05-28; Phase 2 baselining + Phase 3 dashboards still **Open** as of 2026-05-31. Phase 2 introduces a baselines.md artifact, not a generic snapshot store. Tier 5 kickoff must confirm whether BL-032.75 ships a reusable snapshot primitive, or whether Tier 5 ships its own (Upstash MCP DB under `mcp:vdr-snapshot:*` is a low-cost candidate already covered by BL-041's `~mcp:*` ACL).                                                          |
| **Default polarity stays buy-side**           | Tier 6 introduces `mode: 'buy-side-audit' \| 'sell-side-prep'` with `'buy-side-audit'` as the default. Backward-compatible for every existing V5 invocation pattern.                                                                                                                                                                                                                                                                                                                                   |
| **Golden-file as the regression gate**        | Each tier ships a regenerated `mcp-server/tests/examples/vdr-audit.golden.md` capturing a representative input that exercises the new tier's signal. Tiers 4–5 require **two** goldens: one structured-input parity case and one live-API / delta case. Golden regeneration is a CI gate, not advisory.                                                                                                                                                                                                |
| **Provider sequencing for Tier 4**            | Datasite first based on M&A market share; Ansarada and Intralinks queued behind the first integration's lessons. Provider plugin interface authored at Tier 4 kickoff so the second and third providers are additive, not refactoring.                                                                                                                                                                                                                                                                 |
| **`orchestrates` array stays minimal**        | Tier 3 adds `search_portfolio` to `orchestrates`. Tier 4 adds `gst://vdr/snapshot/<sessionRef>` (or equivalent provider URI scheme — to be confirmed at Tier 4 kickoff). Tier 5 reuses the Tier 4 URI scheme. Tier 6 adds nothing — same orchestration, polarity-reversed body.                                                                                                                                                                                                                        |
| **Tier 2 wire-shape compatibility**           | `files[]` widens from `string[]` to `(string \| { name, modifiedAt?, sizeBytes? })[]`. String form remains Tier 1's shape — no breaking change for existing callers. Mirrored via `arrayFromWire` helper already used in `vdr-audit.ts`.                                                                                                                                                                                                                                                               |
| **No new prompt name**                        | All five tiers ship under `gst_vdr_audit`. Version bumps follow the [BL-031.75 maturity bar](MCP_SERVER_PROMPTS_BL-031_75.md): Tier 2 → `0.1.0`, Tier 3 → `0.2.0`, Tier 4 → `0.3.0`, Tier 5 → `0.4.0`, Tier 6 → `0.5.0`. Additive behavior throughout; no `orchestrates` entry is ever removed.                                                                                                                                                                                                        |

---

## Per-tier design

### Tier 2 — File metadata accepting

**Purpose**: extend the structured `vdrFolders` input so file entries can carry `modifiedAt` + `sizeBytes`. The audit body picks up staleness flags, dump-vs-curated patterns, and signed-PDF detection — gaining real "what to actually trust" judgment instead of structural-only assessment.

**Input shape change** (extends the Tier 1 `VdrFolderSchema` in `mcp-server/src/prompts/vdr-audit.ts`):

```typescript
const VdrFileSchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    modifiedAt: z.string().datetime().optional(), // ISO 8601
    sizeBytes: z.number().int().nonnegative().optional(),
  }),
]);

const VdrFolderSchema = z.object({
  name: z.string().min(1),
  files: z.array(VdrFileSchema).optional(),
});
```

The union with `z.string()` preserves Tier 1's wire shape so existing callers never break.

**Body adaptation**: the `ONE_SHOT_BODY` Step 2b expands. The current Step 2b lists name-only heuristics (stale versioning suffixes like `_v17`, single-file folders, generic placeholders). Tier 2 adds:

- **Staleness flag**: any file where `modifiedAt` is older than 12 months → annotate "stale (modified YYYY-MM)". Security-folder pen tests older than 24 months get a "critical staleness" flag.
- **Dump-vs-curated pattern**: when ≥10 files in one folder share a `modifiedAt` within a 48-hour window, annotate "rushed assembly — files appear bulk-uploaded".
- **Signed-PDF heuristic**: any `.pdf` with `sizeBytes > 200_000` is a candidate signed document (vs. a watermarked or scanned page-image); annotate when material to the folder's canonical purpose (e.g., a Security folder lacking any `>200KB` PDF likely lacks signed attestations).
- **Empty-folder flag**: any folder where `files: []` but the canonical taxonomy expects content → annotate as "structurally present, contents missing".

The `hasFileLevelDetail` branch in `vdr-audit.ts` already gates Step 2b; Tier 2 extends the gate to a new `hasFileMetadata` flag (any file is the object form, not a string) and conditionally appends the four bullets above. The `Quality flag` column header in the mapping table widens to include "Staleness / Curation / Attestation".

**Test plan**:

- Unit: extend `mcp-server/tests/unit/prompts/vdr-audit.test.ts` with cases asserting the schema accepts both string and object file entries; that `modifiedAt < 12mo` triggers a "stale" mention in the body; that bulk-upload pattern triggers the "rushed assembly" phrase; that `sizeBytes` flows through. Each assertion targets a **specific literal phrase** in the rendered body (per [TEST_BEST_PRACTICES § 1](../testing/TEST_BEST_PRACTICES.md#1--false-positive-assertions)).
- Golden-file delta: regenerate `mcp-server/tests/examples/vdr-audit.golden.md` with a metadata-rich mock (representative target: ~9 folders, ~40 files spanning fresh, stale, signed-PDF, and bulk-upload patterns).

**Dependencies**: none beyond Tier 1. Independently shippable.

**Effort**: ~1 day. Pure prompt + schema change; no external surface.

---

### Tier 3 — Comparable-engagement cross-reference

**Purpose**: after the audit produces the gap list, automatically call `search_portfolio` for engagements that share the target's theme / growth-stage / industry, and surface "in deals like this, the Security gap typically revealed X" annotations per gap. Output becomes deal-grade — anchored against GST's portfolio of 57 validated projects — rather than checklist-grade. Mirrors the cross-reference pattern in `gst_diligence_handoff_memo`.

**Input shape change**: a new arg `crossReference: boolean` (default `true`) at the top level of `argsSchema`. Analysts running short on tokens or wanting a vanilla audit can opt out.

```typescript
crossReference: z.boolean().default(true).describe(
  "When true (default), after producing the gap list, call search_portfolio for similar engagements and annotate each gap with patterns from comparable deals. Set false to suppress portfolio cross-reference."
),
```

**Body adaptation**:

- `orchestrates` array gains `'search_portfolio'`.
- New Step 4 instructs the model: derive a portfolio query from the target context (theme inferred from `productSummary` if present, or asked of the user in interactive mode; growth-stage / industry inferred from the structural mapping where possible), call `search_portfolio` once with that query, and for each gap in Step 3, scan the returned engagements for analogous-folder findings and append a one-line "In similar deals (e.g., codename `X`), the comparable gap typically surfaced: …" annotation.
- The literal string `search_portfolio` must appear in the body (registry invariant).
- When `crossReference: false`, Step 4 is omitted from `ONE_SHOT_BODY` and the interactive body skips the portfolio prompt.

**Test plan**:

- Unit: schema accepts `crossReference: true | false | undefined` (default `true`); body literally contains `search_portfolio` when `crossReference` resolves truthy; body does NOT contain `search_portfolio` when `crossReference: false`; `orchestrates` is `['gst://library/vdr-structure', 'search_portfolio']` in the prompt module.
- Integration: existing `mcp-server/tests/integration/prompts-registry.test.ts` automatically asserts the `search_portfolio` body-mention invariant against the live tool registry — no edit needed.
- Golden-file delta: regenerate with `crossReference: true` and capture the portfolio-anchored annotations; add a second short golden invocation with `crossReference: false` to demonstrate the opt-out path.

**Dependencies**: portfolio search remains stable. No infrastructure dependency.

**Effort**: ~half-day.

---

### Tier 4 — VDR provider API integration

**Purpose**: connect the prompt to **live VDR provider state**. The user supplies a VDR URL or provider session token; the prompt pulls actual folder structure, file counts, last-modified timestamps, and (where available) watermark / access-log metadata. This is where `gst_vdr_audit` stops being a checklist and becomes an audit deliverable.

**Input shape change**: a new branch in `argsSchema` accepts a provider session reference in lieu of `vdrFolders` / `vdrInventory`:

```typescript
provider: z.enum(['datasite', 'ansarada', 'intralinks']).optional().describe(
  "VDR provider name. When supplied with sessionRef, the prompt pulls the actual VDR structure server-side instead of accepting pasted folder metadata."
),
sessionRef: z.string().min(1).optional().describe(
  "Opaque reference resolved server-side via the BL-032.5 credential store to a provider session token. Never accepts a raw token over the wire."
),
```

Precedence rule: `provider + sessionRef` > `vdrFolders` > `vdrInventory` > interactive. Validation rejects `provider` without `sessionRef` and vice versa.

**Body adaptation**:

- A new server-side wrapper enumerates the VDR structure (folders + file listing with `modifiedAt`, `sizeBytes`, and provider-specific metadata where present) and renders it into the same wire shape Tier 2 introduced. The audit body itself reuses the Tier 2 + Tier 3 `ONE_SHOT_BODY` unchanged — the enumeration happens before `build()` is called.
- A new top-of-body note acknowledges the live-pull provenance: "Audit input pulled live from `<provider>` session `<sessionRef hash>` at `<ISO timestamp>`. Treat enumerated metadata as authoritative."
- `orchestrates` gains a provider-snapshot URI scheme (working name `gst://vdr/snapshot/<provider>/<sessionRef hash>`); the exact scheme is confirmed at Tier 4 kickoff once the credential-store / observability-store URI patterns are nailed down by BL-032.5.

**Provider-agnostic interface**: a `VdrProviderClient` interface in `mcp-server/src/vdr-providers/` with per-provider implementations (`datasite.ts`, `ansarada.ts`, `intralinks.ts`). Each implementation exports a single `enumerate(sessionRef): Promise<EnumeratedVdr>` function. Credential lookup is delegated to the BL-032.5 store via a single `resolveCredentials(provider, sessionRef)` helper — no provider implementation touches raw secrets directly.

**External-API research**: Datasite, Ansarada, and Intralinks each publish varying degrees of public API surface — Datasite has a documented REST API for some enterprise customers, Ansarada exposes a limited API for integrations, and Intralinks' surface is partner-gated. **Confirm the exact API contracts at Tier 4 kickoff** rather than baking assumptions in here; Context7 / vendor docs may not cover these as comprehensively as more mainstream SaaS.

**Test plan**:

- Unit: schema accepts and rejects the new arg combinations per the precedence rule; the rendering function (mocked enumerator) produces a body indistinguishable in shape from a Tier 2 structured-input invocation.
- Integration: at least one provider exercised against a recorded fixture (no live API hit in CI). The fixture lives under `mcp-server/tests/fixtures/vdr-providers/<provider>.json` and is regenerated by hand against a real session when material API changes ship.
- Golden-file delta: a new golden capturing the live-pull provenance note + an enumerated structure that triggers Tier 2 staleness flags + Tier 3 portfolio cross-refs.

**Dependencies**:

- **BL-032.5 (remote transport)** — required. Credential resolution has no safe home on local stdio.
- Per-provider rate-limit + retry policy (confirmed at kickoff; likely per-tenant token bucket).

**Effort**: ~1–2 weeks per provider; Datasite first.

---

### Tier 5 — Ongoing audit deltas

**Purpose**: "compare this snapshot to last week's snapshot — what changed?" Surfaces newly-added folders, **pulled documents** (a known red flag — typically signals an issue with previously-disclosed materials), late-arriving security artifacts, and staleness-flag changes. Converts the prompt from a one-shot to a process tool with state.

**Input shape change**:

```typescript
compareToSnapshot: z.string().min(1).optional().describe(
  "Reference to a prior snapshot captured by this prompt under the same sessionRef. When supplied alongside provider+sessionRef, the body emits a delta report instead of (or alongside) the full audit."
),
```

When `compareToSnapshot` is set, Tier 5 also requires `provider + sessionRef` (validated at schema level).

**Body adaptation**:

- A new Step 5 section: "Changes since last audit (snapshot `<ref>`, captured `<timestamp>`)". Sub-bullets: **added folders**, **removed folders / pulled documents** (this gets a prominent red-flag annotation), **file-level changes within folders** (added / removed / modified-since-last), **staleness changes** (files that became stale since the prior audit).
- The full audit (Tiers 1–4 sections) still renders unless a future arg suppresses it — sequenced for analyst convenience (audit then delta).

**Snapshot persistence**: reuse BL-032.75's observability storage. Snapshots are keyed by `(provider, sessionRef hash, capturedAt)`; the body fetches the prior snapshot by ref. **Retention policy and rotation cadence to be confirmed at Tier 5 kickoff** — likely tied to BL-032.75's overall retention story.

**Test plan**:

- Unit: schema requires `provider + sessionRef` when `compareToSnapshot` is set; body literally mentions "Changes since last audit" only in delta mode; pulled-document red-flag annotation appears when the test fixture removes a file.
- Integration: fixture-based prior-snapshot lookup; assert delta computation correctness (added, removed, modified counts).
- Golden-file delta: a new golden exercising a contrived delta (one folder added, one document pulled from Security, one stale-flag flip).

**Dependencies**:

- **Tier 4** — delta computation only makes sense over live enumerations.
- **BL-032.75 (production observability storage)** — snapshot persistence layer.

**Effort**: ~half-day on top of Tier 4 + BL-032.75.

---

### Tier 6 — Sell-side workflow flip

**Purpose**: a new `mode` arg flips the audit polarity. Same canonical taxonomy, same enumeration heuristics — but in `'sell-side-prep'` mode the output reframes from "here's what's missing" to "here's what you need to assemble before opening the VDR", with a recommended sequencing plan tied to the canonical taxonomy. Founders preparing for exit get a different-but-equally-useful output from the same engine; doubles the prompt's addressable use base.

**Input shape change**:

```typescript
mode: z.enum(['buy-side-audit', 'sell-side-prep']).default('buy-side-audit').describe(
  "Polarity. 'buy-side-audit' produces gap analysis vs the canonical taxonomy. 'sell-side-prep' produces an assembly plan from the same taxonomy — what to build, in what order, before opening the VDR."
),
```

Default preserves Tier 1–5 behavior for every existing invocation pattern.

**Body adaptation**: a new `SELL_SIDE_BODY` constant mirrors `ONE_SHOT_BODY`'s structure but flips:

- **Step 2** becomes "for each canonical folder, list the artifacts you should assemble" (using the same taxonomy verbatim).
- **Step 3** becomes the recommended assembly sequence — phased by canonical-folder priority (e.g., "weeks 1–2: Software Architecture + SDLC; weeks 3–4: Security; weeks 5+: Governance + People"). The sequence reflects GST's empirical view of which folders most often block a transaction when thin.
- **Cross-reference** (Tier 3): if `crossReference: true` and `mode: 'sell-side-prep'`, the portfolio call returns "in similar deals, founders most commonly underprepared X" — same data, polarity-reversed framing.
- Tier 4–5 (live integration + deltas) work in either mode; sell-side prep over a partially-assembled VDR is a useful real workflow (founder builds, runs audit, identifies remaining gaps, iterates).

**Test plan**:

- Unit: schema defaults to `'buy-side-audit'`; body contains "gap" framing in buy-side mode and "assemble" framing in sell-side mode (assert on specific literal phrases, not length); sell-side output includes a phased assembly sequence string.
- Golden-file delta: a new golden invocation in `'sell-side-prep'` mode against the same metadata-rich mock used in Tier 2.

**Dependencies**: none — independent of Tiers 2–5. Could ship before Tier 4 or after Tier 5; sequence by priority not technical dependency.

**Effort**: ~1 day.

---

## Test strategy

Aligns with [TEST_STRATEGY.md § Test Pyramid](../testing/TEST_STRATEGY.md#test-pyramid-for-static-sites) and the existing `mcp-server/tests/` structure (already exercised under BL-031.75).

### Unit tests (~60-70% of new coverage)

All extensions live in `mcp-server/tests/unit/prompts/vdr-audit.test.ts`. Each tier adds a new `describe()` block — one per tier — with the per-tier cases listed above. Schema cases use `safeParse` with explicit `result.error.issues[0].path` assertions (per [TEST_BEST_PRACTICES § 1](../testing/TEST_BEST_PRACTICES.md#1--false-positive-assertions)).

**Anti-patterns to avoid**:

- [§ 1](../testing/TEST_BEST_PRACTICES.md#1--false-positive-assertions) — assert on specific literal phrases the new tier introduces, not `toBeGreaterThan(0)` on body length.
- [§ 9](../testing/TEST_BEST_PRACTICES.md#9--explicit-vitest-imports-when-globals-true-is-enabled) — existing file uses explicit `vitest` imports because `globals: false` for `mcp-server` (verify before adding new cases; if globals are enabled in the meantime, drop the imports).

### Integration tests (existing, no new file)

- `mcp-server/tests/integration/prompts-registry.test.ts` — auto-asserts every `orchestrates` entry appears literally in the rendered body. Tier 3 (`search_portfolio`) and Tier 4 (provider snapshot URI) extend the array; no edit to the integration test needed.
- `mcp-server/tests/integration/golden-snapshots.test.ts` — auto-picks up the regenerated golden file.

### Golden-file regression strategy

The golden file `mcp-server/tests/examples/vdr-audit.golden.md` is the binding regression gate. Each tier ships a regeneration:

| Tier | Golden invocation                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------- |
| 2    | Metadata-rich `vdrFolders` mock (~9 folders, ~40 files spanning fresh / stale / signed-PDF / bulk).     |
| 3    | Same mock + `crossReference: true` (captures portfolio annotations).                                    |
| 4    | Live-enumeration fixture from Datasite (or recorded fixture if no test tenancy); provenance note shown. |
| 5    | Tier 4 fixture + a contrived prior-snapshot fixture (one added folder, one pulled document, one flip).  |
| 6    | Tier 2 metadata-rich mock invoked with `mode: 'sell-side-prep'`.                                        |

Regeneration procedure: after the per-tier prompt + tests pass locally, restart Claude Desktop (or run the unit-test golden capture), invoke the prompt with the representative inputs, copy the rendered output into the golden file with frontmatter `promptName` / `version` / `recordedAt` / `model`. CI runs `golden-snapshots.test.ts` and fails on any drift; intentional updates are the regeneration commit's diff.

### E2E

`gst_vdr_audit` has no Hub page; no new E2E tests are needed. Live-API tests (Tier 4) stay out of CI — fixture-driven only.

### Test execution gate (per-tier PR)

```powershell
npm -w @gst/mcp-server run typecheck
npm -w @gst/mcp-server run test
```

Tiers 4–5 additionally require the per-provider fixture to be regenerated when the provider's API contract changes — this is a hand-driven step, documented at the top of `mcp-server/tests/fixtures/vdr-providers/<provider>.json`.

---

## Documentation plan

Touched per-tier (each tier ships its own docs delta in the same PR as the code):

| Path                                                         | Change per tier                                                                                                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp-server/src/prompts/vdr-audit.ts`                        | Module body changes — schema widening, `ONE_SHOT_BODY` adaptation, version bump, `orchestrates` extension where applicable.                                      |
| `mcp-server/tests/examples/vdr-audit.golden.md`              | Regenerated per the tier's golden invocation (see Test strategy).                                                                                                |
| `mcp-server/README.md` § "Last verified (BL-031.75 surface)" | Append a `V5.<tier>` stanza per tier shipped (≤6 lines). Closes when V5.6 ships; at that point the original V5 "Spec note (2026-05-01)" caveat retires.          |
| `mcp-server/src/docs/prompts/README.md`                      | Close-line `Last updated:` bump per tier. No per-prompt enumeration lives here, so no list edit needed.                                                          |
| `src/docs/development/MCP_SERVER_PROMPTS_BL-031_75.md`       | When all five tiers ship: retire the V5 Spec note caveat (BACKLOG AC).                                                                                           |
| `src/docs/development/MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md`  | This file — keep "Status" line current, append per-tier closure notes.                                                                                           |
| `mcp-server/BREAKING_CHANGES.md`                             | One entry per minor-version bump documenting the additive surface (none of these tiers is breaking by design; the log nonetheless tracks the contract widening). |
| `mcp-server/src/vdr-providers/README.md` (new at Tier 4)     | Provider-plugin interface, credential-resolution contract, fixture-regeneration procedure.                                                                       |

---

## Risks & tradeoffs

| Risk                                                                                                         | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tier 4 reveals file-metadata enrichment isn't sufficient signal — the real lift only comes live.**         | This is the central wager of the tier ordering. Tier 2 is intentionally cheap (~1 day) precisely so we can answer this question before committing 1–2 weeks to Tier 4. If Tier 2's golden output reads materially better to the senior consultant than Tier 1 did, Tier 4 is justified; if it's only marginally better, reconsider whether Tier 4's effort buys enough vs. just shipping Tier 6. **The user explicitly flagged this concern in the BL-036 stanza**; treat Tier 2's V5.2 verification as the go/no-go on Tier 4. |
| **VDR provider APIs are narrower than expected; can't enumerate file metadata at the depth Tier 2 assumes.** | Tier 4 falls back to whatever metadata the provider exposes (often folder structure + file counts + last-modified is the floor; signed-document detection may not be reachable via API). Tier 2's heuristics degrade gracefully — staleness flags work with any `modifiedAt`, dump-vs-curated needs only timestamps, signed-PDF detection is the one heuristic that may not survive the live-enumeration path.                                                                                                                  |
| **Provider rate limits cap real-world usability.**                                                           | Per-provider rate-limit policy confirmed at kickoff. The snapshot store from Tier 5 doubles as a rate-limit shield — re-runs read from the snapshot rather than re-enumerating.                                                                                                                                                                                                                                                                                                                                                 |
| **Sell-side and buy-side bodies drift; Tier 6 ships an asymmetric heuristic surface.**                       | Both bodies share the same enumeration + same canonical taxonomy + same Tier 2 metadata flags. Only Step 2/3's framing flips. Unit tests assert that both modes consume identical input shapes and that the staleness / curation flags fire identically.                                                                                                                                                                                                                                                                        |
| **Golden file thrash — five regenerations in flight.**                                                       | Each tier ships its own golden regeneration commit. The file moves forward monotonically. No tier holds back another's golden; the V5.n stanzas in README serve as the per-tier acceptance record.                                                                                                                                                                                                                                                                                                                              |
| **Credential rotation cadence unknown.**                                                                     | Defer to BL-032.5's overall credential-store rotation policy. If BL-032.5 ships without a defined rotation cadence, raise it at Tier 4 kickoff as a blocking prerequisite.                                                                                                                                                                                                                                                                                                                                                      |
| **Schema widening surprises a consumer who relied on `files: string[]` runtime type.**                       | The Tier 2 union is strict superset; existing string-form callers keep working. The internal `formatStructuredInventory` helper normalizes both shapes. No internal consumer except the prompt body itself.                                                                                                                                                                                                                                                                                                                     |

---

## Acceptance criteria

Surfaces every AC from the BL-036 BACKLOG stanza, organized by tier, plus design-doc-surfaced additions.

### Tier 2 — File metadata

- [ ] `vdrFolders[].files[]` accepts `string | { name: string, modifiedAt?: string, sizeBytes?: number }` (string remains Tier 1's shape; object adds metadata).
- [ ] Audit body's Step 2b extended with the four metadata-aware signal bullets (staleness, dump-vs-curated, signed-PDF, empty-folder).
- [ ] At least one regression test asserting metadata flows from input to body via a specific literal phrase (anti-pattern § 1).
- [ ] Golden snapshot regenerated with metadata-rich mock; V5.2 stanza added to `mcp-server/README.md`.
- [ ] Prompt version bumped to `0.1.0`; `BREAKING_CHANGES.md` records the additive widening.

### Tier 3 — Comparable cross-reference

- [ ] After Step 3 (gaps), prompt body instructs the model to call `search_portfolio` with a derived query.
- [ ] Per-gap "in similar deals, X" annotation surfaces when ≥1 comparable matches.
- [ ] `crossReference: boolean` arg (default `true`) gates the cross-reference Step.
- [ ] Test asserts the body literally mentions `search_portfolio` iff `crossReference` is truthy.
- [ ] `orchestrates` array extended to include `'search_portfolio'`; integration registry test passes automatically.
- [ ] Golden regenerated with `crossReference: true`; V5.3 stanza added.
- [ ] Prompt version bumped to `0.2.0`.

### Tier 4 — VDR provider API integration

- [ ] Architecture doc authored (this file's per-tier section satisfies the BL-031.5 / BL-031.75 pattern; expand with provider-plugin README at `mcp-server/src/vdr-providers/README.md`).
- [ ] Provider-agnostic interface plugged in by name (`provider: 'datasite' | 'ansarada' | 'intralinks'`); credential lookup via the BL-032.5 remote secret store.
- [ ] At least one provider integration shipped (Datasite first).
- [ ] Audit input accepts `{ provider, sessionRef }` in lieu of `vdrFolders` / `vdrInventory`; the tool wrapper enumerates the structure server-side.
- [ ] Round-trip parity test: a real VDR's structure produces an audit indistinguishable in shape from the structured-input path.
- [ ] Provider fixture lives at `mcp-server/tests/fixtures/vdr-providers/datasite.json`; regeneration procedure documented at the top of the file.
- [ ] Golden regenerated with the live-enumeration provenance note; V5.4 stanza added.
- [ ] Prompt version bumped to `0.3.0`.

### Tier 5 — Ongoing audit deltas

- [ ] Snapshot persistence layer tied to BL-032.75 observability storage.
- [ ] `compareToSnapshot: <ref>` arg triggers delta mode; schema requires `provider + sessionRef` alongside.
- [ ] Output adds a "Changes since last audit" section: added folders, removed folders / pulled documents, file-level changes, staleness changes.
- [ ] **Pulled-documents flag is surfaced prominently** (red flag — typically signals an issue with previously-disclosed materials).
- [ ] Golden regenerated with a contrived delta; V5.5 stanza added.
- [ ] Prompt version bumped to `0.4.0`.

### Tier 6 — Sell-side workflow

- [ ] `mode: 'buy-side-audit' | 'sell-side-prep'` arg added (default `'buy-side-audit'` for backward compat).
- [ ] Body adapter: in `'sell-side-prep'` mode, output framing flips from "what's missing" to "what to assemble" — same canonical taxonomy, polarity reversed.
- [ ] Sell-side output includes a phased assembly sequence (e.g., "weeks 1–2: Software Architecture + SDLC; weeks 3–4: Security; weeks 5+: Governance + People") tied to the canonical taxonomy.
- [ ] Test asserts the body's output framing matches the supplied mode (specific phrase per anti-pattern § 1).
- [ ] Golden regenerated in sell-side mode; V5.6 stanza added.
- [ ] Prompt version bumped to `0.5.0`.

### Verification & docs (closure-level)

- [ ] Each tier earns a `V5.<n>` verification entry in `mcp-server/README.md` with input + output + sign-off.
- [ ] When all five tiers complete, the V5 "Spec note (2026-05-01)" caveat in [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) retires.
- [ ] Golden-file regeneration is a CI gate (`golden-snapshots.test.ts` fails on drift; intentional updates ship as their own commit).

---

## Open questions

Genuinely unknown at design time; resolve at the relevant tier's kickoff rather than guessing here:

1. **Which VDR provider has the broadest M&A market share in 2026?** Datasite is the working assumption per the BACKLOG stanza, but the landscape shifts. Confirm at Tier 4 kickoff against current deal-volume signal before committing the first integration.
2. **What is the actual public-API surface of each provider?** Datasite, Ansarada, and Intralinks have varying degrees of public documentation. Tier 4 kickoff should confirm: (a) does authenticated REST enumeration of folder structure exist? (b) at what granularity — folder-only, folder + file list, or folder + file + metadata? (c) what are the rate limits per tenant? (d) is there a sandbox / test-tenancy program?
3. **What credential rotation cadence does Tier 4 need?** Defer to BL-032.5's overall credential-store design. If BL-032.5 ships without an explicit rotation policy, raise at Tier 4 kickoff as a blocker.
4. **What snapshot retention policy does Tier 5 need?** Tied to BL-032.75's overall retention story. Confirm at Tier 5 kickoff. Reasonable starting position: 30 days per `(provider, sessionRef)` pair, weekly snapshots automatic; raise if observability-store costs make this untenable.
5. **Does the Tier 2 metadata enrichment alone close the V5 critique enough to defer Tiers 4–5?** Answered empirically by V5.2 verification. If the senior consultant signs off Tier 2's output as "now reads like a real audit," Tiers 4–5 sequence may stretch — Tier 6 may jump the queue.
6. **Tier 4 input-shape compatibility for BL-033 pilots** — at Tier 4 implementation time, confirm with whichever pilot orchestrators are live whether they pin to the structured-input shape. The union with the live-pull branch keeps that path working unchanged by design, but explicit confirmation closes the loop. (Today: zero external clients — codebase is internal-only.)

---

_Plan written: 2026-05-30. Tier 1 shipped in BL-031.75 V5 closure (2026-05-01). Tiers 2–6 unscheduled. Sequencing intent: Tier 2 → V5.2 verification → go/no-go on Tier 4 → Tier 3 (parallel-shippable) → Tier 6 (independent) → Tier 4 (when BL-032.5 lands) → Tier 5 (when BL-032.75 lands)._
