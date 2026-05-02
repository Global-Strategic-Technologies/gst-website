# MCP Server — Stage Taxonomy Adapter Layer (BL-031.87)

> **Backlog initiative**: [BL-031.87: MCP Server — Stage Taxonomy Adapter Layer](BACKLOG.md#bl-03187-mcp-server--stage-taxonomy-adapter-layer)
>
> **Predecessors**:
>
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture, repo placement, lifecycle. Read first.
> - [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) — shipped the four Hub-tool MCP wrappers (ICG, TechPar, Tech Debt, Regulatory Map) whose schemas this initiative touches.
> - [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — shipped the prompt library that orchestrates ICG + TechPar + Tech Debt; `gst_target_quick_look` is the primary consumer of the canonical layer this initiative introduces.
> - [MCP_SERVER_CONTRACTS_BL-031_85.md](MCP_SERVER_CONTRACTS_BL-031_85.md) — formalized the per-tool `CONTRACT.md` registry; surfaced the cross-tool funding-stage drift this initiative resolves. Closure stanza files BL-031.87 as the concrete follow-up.
>
> **Sequels**:
>
> - [BL-032 in BACKLOG.md](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) — the remote substrate where a Remote Proxy will eventually compose with this initiative's Adapter (Remote Proxy for HTTP transport _around_ the Adapter for vocabulary translation; orthogonal axes).
> - [`MCP_SERVER_CONTRACTS_BL-031_85.md` § Proximate opportunities](MCP_SERVER_CONTRACTS_BL-031_85.md#proximate-opportunities) — the IRL generator forward-look, which will consume the canonical stage taxonomy when scoped.
>
> **Scope**: this document covers [BL-031.87](BACKLOG.md#bl-03187-mcp-server--stage-taxonomy-adapter-layer) — introducing a canonical funding-stage taxonomy plus per-tool **Adapter** modules at the MCP-wrapper boundary. ICG and TechPar engines remain untouched; their MCP wrappers learn to translate between a canonical stage value and each tool's tuned native enum.
>
> **Status**: ✅ Complete (closed 2026-05-02). Three-phase implementation shipped across commits `06a06bd` (canonical layer + adapters + 22 unit tests), `08d7c68` (MCP wrapper integration with Zod-union backward-compat), and the closure commit (prompt update + docs). All 270 mcp-server tests pass; both typechecks clean; mcp-server build clean. The cross-tool funding-stage variance is resolved at the MCP-wrapper boundary; engines and benchmark datasets remain untouched.

---

## Context

[BL-031.85](MCP_SERVER_CONTRACTS_BL-031_85.md)'s closure audit (2026-05-02) confirmed all five Hub-tool MCP wrappers ship with canonical input contracts. It also surfaced a real variance:

- **ICG `companyStage`** — 4 values: `pre-series-b` / `series-bc` / `pe-backed` / `enterprise` (kebab-case, no `seed`)
- **TechPar `stage`** — 5 values: `seed` / `series_a` / `series_bc` / `pe` / `enterprise` (snake_case, includes `seed`)
- **Diligence `growthStage`** — 3 values: `early` / `scaling` / `mature` — **a different concept** (company-maturity coarse bucketing, not a funding-stage cohort label)

ICG and TechPar both partition the company population by funding round to select a benchmark cohort. Same concept. Different shape — different field name, different value set, different notation. Today, agents composing multi-tool prompts (the BL-031.75 `gst_target_quick_look` is the canonical example) have to know each tool's variance and either coerce inputs or document the mismatch in the prompt body. That's a real ergonomic tax with a clean architectural fix.

This initiative is **not** a normalization. It does not rename ICG's enum to align with TechPar's, or vice versa. Both engines' enums are coupled to their benchmark datasets — ICG's `BENCHMARK_RANGES` is keyed by `pre-series-b`; TechPar's `STAGES` map is keyed by `series_a`. Renaming either in-place would require benchmark re-attribution and risk silent mis-attribution. Instead, the initiative introduces a small canonical layer with per-tool **Adapter** modules that translate between the canonical taxonomy and each engine's native vocabulary at the MCP-wrapper boundary. Engines and benchmark datasets stay untouched.

---

## Why this earns its own initiative (rather than living inside BL-031.85, BL-031.95, or BL-031.5)

**Not BL-031.85** because BL-031.85 is documentation consolidation — its competency is technical writing about input schemas. This initiative is engineering work: a new shared module under `src/data/common/`, Zod schema changes, runtime translation, parity tests, prompt-body updates. Folding it into BL-031.85 would have inflated scope across two cognitive modes (writing vs. coding) with different review gates.

**Not BL-031.95** because BL-031.95's job is per-tool URL-state restoration plus targeted input-ergonomics fixes (`infraHosting` rename, Diligence `'unknown'` parity). The stage adapter is a distinct cross-tool concern with its own pattern-choice reasoning. Folding both would inflate BL-031.95 from "URL state across 4 tools" to "URL state + cross-tool taxonomy adapter" — heterogeneous scope, two unrelated review surfaces. The two initiatives _can_ co-schedule if engineering capacity allows (both touch MCP wrappers; both regenerate prompt golden snapshots), but the AC tracks remain distinct.

**Not BL-031.5** because BL-031.5 already shipped. The variance was visible in BL-031.5's per-tool contracts but cross-tool friction only became real when BL-031.75 prompts started orchestrating multiple tools — at which point BL-031.85's closure audit was the natural surfacing moment.

**Its own initiative** because:

1. The competency is **engineering with explicit pattern choice** — Adapter (GoF) at a chosen boundary (MCP-wrapper), with a documented rejection of alternatives (Proxy, Bridge, full normalization). The pattern selection itself deserves the design-review surface that an initiative provides.
2. The output is a **shared module** (`src/data/common/funding-stages.ts` + `stage-adapters.ts`) that becomes a precedent for any future cross-tool concept-aliasing work. Codifying its shape in a dedicated initiative makes the precedent reviewable.
3. The work is sequenced by **the variance becoming costly**, not by code dependencies. ICG and TechPar shipped six months apart with no awareness of each other's stage enum because no consumer crossed both. BL-031.75's `gst_target_quick_look` is the first consumer that crosses; BL-031.87 is the right response.
4. The downstream value (BL-032+ remote-API stability, IRL generator's canonical input shape, future stage-aware tools) is concrete and warrants a separately-tracked deliverable.

---

## Pattern choice: Adapter (GoF), conceptually a lightweight Anti-Corruption Layer

The problem is **vocabulary translation across heterogeneous shapes**:

```
canonical:    { stage: 'series-b' }
TechPar:      { stage: 'series_bc' }              // value differs
ICG:          { companyStage: 'pre-series-b' }    // FIELD NAME differs too
Diligence:    no funding stage at all              // different concept entirely
```

That's interface conversion — Adapter's whole job. Several alternative patterns were considered and explicitly rejected.

### Why not Proxy

| Adapter                                                                           | Proxy                                                             |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Different** input/output shapes                                                 | **Same** interface preserved                                      |
| Translates vocabulary                                                             | Adds cross-cutting behavior to the same interface                 |
| Caller cannot substitute Adapter ↔ real subject (interfaces differ by definition) | Caller can substitute Proxy ↔ real subject (Liskov-substitutable) |

Our use case is squarely "different shapes" — the field name itself differs (`stage` vs. `companyStage`). A Proxy would by definition expose the same interface as its wrapped subject and add cross-cutting concerns (caching, lazy loading, access control, remote forwarding). It does not translate vocabulary. Using Proxy here would mislead future readers into looking for access-control behavior that isn't there.

**Where Proxy WILL legitimately enter our story** (later, separately): when [BL-032](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) ships HTTP transport, each tool gets fronted by a **Remote Proxy** — same interface as the local-stdio tool, but the proxy forwards over HTTP and may add auth / rate-limit / cache. That's a real Proxy use case, and it's _orthogonal_ to the vocabulary problem. The two patterns compose:

```
caller → [RemoteProxy: HTTP forwarding + auth] → [Adapter: canonical → native] → engine
```

Proxy answers "where does the call go and who can make it." Adapter answers "what shape does the call take." Different axes; coexist cleanly.

### Why not Bridge

Bridge decouples two orthogonal axes of variation (abstraction × implementation), both expected to evolve independently. Classic example: `Shape × RenderingEngine` with `Circle / Square` evolving as the abstraction and `RasterRenderer / VectorRenderer` evolving as the implementation, separately and without coupling.

Our situation has _one_ axis of variation — the per-tool native vocabularies. The canonical layer doesn't itself vary along an axis orthogonal to the per-tool enums; it's a single canonical layer that all tools translate from. Bridge ceremony costs more than it returns at our current variation count (5 tools, 2 use stage). Bridge becomes interesting only if we anticipate (a) the canonical taxonomy versioning independently along a new axis, or (b) many more tools with stage-cohort variants joining. Neither is true today.

### Why not full normalization

Full normalization would mean renaming ICG's enum and TechPar's enum to match a canonical taxonomy directly in their schemas and benchmark datasets. Every `pre-series-b` row in ICG's `BENCHMARK_RANGES` becomes (e.g.) `series-a` plus, ambiguously, a phantom seed entry; every `series_bc` row in TechPar's `STAGES` map gets split or duplicated.

This was considered and rejected because:

- **Benchmark datasets are tuned to the existing enum.** ICG's `pre-series-b` deliberately collapses canonical seed + Series A because the benchmark population doesn't separate them (small sample size at seed; no signal). Forcing `seed` into ICG's enum either gives every seed company an empty benchmark or sets a precedent that the data doesn't support.
- **Migration risk is real.** Re-keying benchmark datasets, regenerating any user-facing wizard URLs that encode the stage, updating all tests, and validating that the new attribution is correct is ~1 day of work per tool with a real risk of silent benchmark mis-attribution if the migration is sloppy.
- **The Adapter approach gets ~80% of the value at ~20% of the cost.** Cross-tool prompts work in canonical terms; engines stay untouched; benchmark precision unchanged; the lossy direction (canonical `series-c` → TechPar `series_bc` cannot round-trip back) is documented as intentional information-shedding driven by dataset granularity, not as a defect to fix.

### Anti-Corruption Layer (DDD framing)

[Anti-Corruption Layer](https://www.domainlanguage.com/ddd/) is the Domain-Driven Design term for the same idea at service-architecture granularity: each tool is a bounded context with its own stage vocabulary; a small translator module sits between the canonical layer and each context, preventing each context's vocabulary from corrupting the others. GoF Adapter is the same pattern at object granularity. We use the GoF name because the implementation is a small TypeScript module with translation tables, not a service.

---

## Boundary choice: MCP-wrapper, not engine, not schema

Three options were considered for where the translation happens:

### MCP-wrapper boundary (chosen)

```
mcp-server/src/tools/icg.ts    ← Adapter lives here
mcp-server/src/tools/techpar.ts  ← Adapter lives here

caller → MCP wrapper (translates canonical → native) → engine
```

The wrapper accepts a Zod union of `{ canonical | native }` input; the wrapper resolves to native before invoking the engine. Engine sees only native values. Website wizard sees only native values. Both surfaces are unchanged.

**Pros**: smallest blast radius. Pure additive change in the MCP-server workspace; no website-side modifications; no engine touches; no benchmark-dataset changes.

**Cons**: only MCP callers see the canonical layer. The website wizard, if a user manually constructs a URL state link that's later shared with an MCP-aware tool, still encodes native values.

### Engine boundary (rejected)

```
src/utils/icg-engine.ts        ← Adapter lives here
src/utils/techpar-engine.ts     ← Adapter lives here
```

Engine itself accepts canonical or native; both surfaces (website wizard and MCP wrapper) benefit.

**Pros**: website-wizard URL state could canonicalize, enabling cross-tool sharing of state URLs.

**Cons**: ~2× the scope. Touches website page logic, all engine tests, possibly the URL state encoder. Spreads the canonical vocabulary into the website surface, which has not asked for it. The cross-tool URL-sharing use case is theoretical today.

**Decision**: defer. Revisit if/when website-wizard URL canonicalization becomes a concrete need. The MCP-wrapper boundary's structure is reusable: the same Adapter modules can be lifted to engine-level later by changing the import location.

### Schema boundary (rejected)

```
src/schemas/icg.ts             ← Zod union with .transform() lives here
src/schemas/techpar.ts          ← Zod union with .transform() lives here
```

The Zod schema becomes a union (`canonical | native`) with a `.transform()` that resolves to native. Translation happens during schema parsing.

**Pros**: purist; the schema itself becomes the translation point.

**Cons**: JSON Schema introspection in Claude Desktop / Cursor (which is what agents see when listing tools) doesn't render Zod unions cleanly. Agents would see noisy schemas that include both canonical and native enum values, with no way to distinguish "the canonical taxonomy you should use" from "a legacy native value you can also pass." Defeats one of the primary goals of the initiative (clean canonical surface for agent introspection).

**Decision**: avoid. Schema layer should advertise the canonical taxonomy; the MCP-wrapper layer translates.

---

## Lossy-direction policy

The Adapter is **bidirectional but asymmetric**:

- **Canonical → native is always safe.** Every canonical value maps to exactly one native value (modulo the collapses below). `series-c` → TechPar `series_bc` is fine in this direction.
- **Native → canonical is sometimes lossy.** Where a native enum collapses canonical values (TechPar's `series_bc` collapses canonical `series-b` and `series-c`; ICG's `pre-series-b` collapses canonical `seed` and `series-a`), the native → canonical direction cannot unambiguously recover the original canonical value.

The adapter modules expose this honestly:

```typescript
// src/data/common/stage-adapters.ts (illustrative)

export const TECHPAR_STAGE_ADAPTER = {
  // canonical → native: total function (every canonical value has a native target)
  fromCanonical: {
    seed: 'seed',
    'series-a': 'series_a',
    'series-b': 'series_bc', // collapse
    'series-c': 'series_bc', // collapse — same target as series-b
    pe: 'pe',
    enterprise: 'enterprise',
  } as const satisfies Record<CanonicalStage, TechParStage>,

  // native → canonical: returns an array because of collapses
  toCanonical: {
    seed: ['seed'],
    series_a: ['series-a'],
    series_bc: ['series-b', 'series-c'], // ambiguous; document, don't pick
    pe: ['pe'],
    enterprise: ['enterprise'],
  } as const satisfies Record<TechParStage, readonly CanonicalStage[]>,
};
```

**Tests assert two things:**

1. `fromCanonical(toCanonical(native)[0]) === native` for every native value — the safe round-trip; never lossy.
2. The lossy direction is **documented per-collapse**, not blindly round-tripped. A test that asserts `toCanonical(fromCanonical('series-c'))` returns the array `['series-b', 'series-c']` proves the collapse is honest. A passing test that ignored the collapse and returned only `'series-b'` would mask the information loss.

**Information shedding is intentional, not a bug.** The Adapter doc and the per-tool CONTRACT.md updates make this explicit so future readers don't try to "fix" the collapse by introducing speculative benchmarks the dataset can't support.

---

## Implementation plan

Three phases, each landing as a separate commit (or a small sequence of commits in the same PR).

### Phase 1 — Canonical layer + Adapter modules

1. Author `src/data/common/funding-stages.ts`:
   - `CANONICAL_STAGES = ['seed', 'series-a', 'series-b', 'series-c', 'pe', 'enterprise'] as const`
   - `CanonicalStage` type
   - `CanonicalStageSchema = z.enum(CANONICAL_STAGES)`
   - JSDoc with stage definitions sourced from public funding-round conventions
2. Author `src/data/common/stage-adapters.ts`:
   - `ICG_STAGE_ADAPTER` with `fromCanonical` (total) and `toCanonical` (array-valued)
   - `TECHPAR_STAGE_ADAPTER` with the same shape
   - Helper functions `toCanonicalSafe(toolId, native)` (returns array) and `fromCanonical(toolId, canonical)` (returns native, throws on unknown canonical)
3. Vitest unit tests:
   - `tests/unit/funding-stages.test.ts` — round-trip native → canonical → native is idempotent for every native value in both adapters
   - Lossy-direction collapses hand-tabulated and asserted (the test enumerates every known collapse explicitly)

### Phase 2 — MCP wrapper integration

1. `mcp-server/src/tools/icg.ts`:
   - Input schema accepts `{ stage: CanonicalStageSchema | ICGNativeStage }` via Zod union
   - Wrapper resolves canonical to native via `ICG_STAGE_ADAPTER.fromCanonical[]` before calling the engine
   - Output annotated with the canonical equivalent of the engine's reported stage (using `toCanonicalSafe` and either picking the lossless direction or returning the array honestly)
   - Tool description updated to advertise the canonical input as preferred
2. `mcp-server/src/tools/techpar.ts` — same pattern with `TECHPAR_STAGE_ADAPTER`
3. Backward compatibility: native values continue to be accepted via the Zod union; deprecation timeline noted in JSDoc

### Phase 3 — Prompts + docs

1. BL-031.75 prompts updated:
   - `gst_target_quick_look` argsSchema uses `CanonicalStageSchema`
   - Body instructions updated to use canonical stage values; the per-tool variance disclaimer removed
   - Other stage-aware prompts (audit by grep for `companyStage` / `stage` in `mcp-server/src/prompts/`) updated as needed
   - Per-prompt golden snapshots regenerated and recorded values match expected outputs
2. Docs updated:
   - `mcp-server/src/docs/contracts/README.md` glossary section updated to reflect the canonical layer; "Will be superseded by BL-031.87" transitional note retired
   - `src/docs/development/MCP_SERVER_CONTRACTS_BL-031_85.md` "Proximate opportunities" → mark the stage-taxonomy entry as "Closed by BL-031.87"
   - `mcp-server/src/docs/icg/CONTRACT.md` and `techpar/CONTRACT.md` — each gains a "Canonical stage adapter" sub-section under the relevant field (`companyStage` / `stage`) documenting the canonical mapping, the lossy direction, and the rationale
3. This architecture doc updated with any deviations made during implementation

---

## Critical files to read or modify

| File                                                                                                                        | Action                                                                             | Why                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/common/funding-stages.ts` (new)                                                                                   | Create                                                                             | Canonical stage taxonomy + Zod schema + types                                                                                    |
| `src/data/common/stage-adapters.ts` (new)                                                                                   | Create                                                                             | Per-tool Adapter modules with `fromCanonical` / `toCanonical` translation tables                                                 |
| [`src/schemas/icg.ts`](../../schemas/icg.ts)                                                                                | Read; minor edit                                                                   | Source of `COMPANY_STAGE_VALUES` tuple — `ICG_STAGE_ADAPTER` references this exact tuple to stay in lock-step. No schema change. |
| [`src/schemas/techpar.ts`](../../schemas/techpar.ts)                                                                        | Read; minor edit                                                                   | Source of `STAGE_KEYS` tuple — `TECHPAR_STAGE_ADAPTER` references this exact tuple. No schema change.                            |
| [`mcp-server/src/tools/icg.ts`](../../../mcp-server/src/tools/icg.ts)                                                       | Edit — input Zod union; translation before engine call                             | The adapter integration point; primary work                                                                                      |
| [`mcp-server/src/tools/techpar.ts`](../../../mcp-server/src/tools/techpar.ts)                                               | Edit — same as icg.ts                                                              | Same pattern                                                                                                                     |
| [`mcp-server/src/prompts/target-quick-look.ts`](../../../mcp-server/src/prompts/target-quick-look.ts)                       | Edit — argsSchema uses canonical; body updated                                     | The primary canonical-layer consumer                                                                                             |
| `mcp-server/tests/unit/funding-stages.test.ts` (new)                                                                        | Create                                                                             | Round-trip parity + collapse documentation                                                                                       |
| [`mcp-server/src/docs/contracts/README.md`](../../../mcp-server/src/docs/contracts/README.md) § Cross-tool concept glossary | Edit — retire "Will be superseded" note; update content to reflect canonical layer | Glossary becomes a navigational pointer to the canonical taxonomy rather than a transitional artifact                            |
| [`mcp-server/src/docs/icg/CONTRACT.md`](../../../mcp-server/src/docs/icg/CONTRACT.md) `companyStage` field                  | Edit — add "Canonical stage adapter" sub-section                                   | Documents the canonical mapping and lossy direction                                                                              |
| [`mcp-server/src/docs/techpar/CONTRACT.md`](../../../mcp-server/src/docs/techpar/CONTRACT.md) `stage` field                 | Edit — add "Canonical stage adapter" sub-section                                   | Same                                                                                                                             |
| [`MCP_SERVER_CONTRACTS_BL-031_85.md`](MCP_SERVER_CONTRACTS_BL-031_85.md) § Proximate opportunities                          | Edit — mark stage-taxonomy entry as "Closed by BL-031.87"                          | Closure traceability                                                                                                             |

---

## Risks & mitigations

| Risk                                                                                                                                                       | Mitigation                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter introduces a translation step where there was none, adding a class of bug (translation correctness)                                                | Vitest unit test asserts round-trip parity for every native value in both adapters; CI runs on every PR. The tables are small (≤6 entries each); review surface is trivial.                                                                                                               |
| Lossy direction (`series_bc` → ambiguous) is silently picked by the wrapper, causing surprising attribution in agent outputs                               | Wrapper output exposes the lossy direction honestly — when a tool's native value collapses canonical values, the canonical annotation in the response is an array (`['series-b', 'series-c']`) or a "best-guess + alternatives" structure. Adapter doc and tool docs document the policy. |
| Backward-compatible Zod union (`canonical \| native`) makes JSON Schema noisy; agents see redundant enum members                                           | Mitigated by ordering the union with canonical first and clear `.describe()` text; the contract doc declares canonical as the preferred input and native as a deprecation-grace acceptance. Reassess after one release: if the noise is real, drop native acceptance behind a flag.       |
| Future tool ships with a third stage enum shape, not Adapter-compatible                                                                                    | Adapter is a per-tool pattern; new tools declare a new `<TOOL>_STAGE_ADAPTER` following the same shape. The pattern is composable, not centralizing — drift is bounded. The cross-tool glossary in `contracts/README.md` flags new stage-aware tools when they land.                      |
| Prompt body update breaks downstream consumers who pinned to the old prompt's argsSchema (BL-031.75 versioning)                                            | Prompt version bumps to v2; argsSchema accepts both canonical and native (Zod union) for one release; deprecation timeline documented in the prompt's JSDoc. Mirror the BL-031.75 prompt-versioning discipline.                                                                           |
| The website wizard's URL state encoder still produces native values; an analyst sharing a URL across surfaces sees an apparent canonical → native demotion | Out of scope for BL-031.87 (engine-boundary deferred). Document explicitly: URL-state values are tool-native; canonical is an MCP-surface convenience. If URL canonicalization becomes a concrete need, schedule as engine-boundary follow-up.                                            |

---

## Out of scope (explicit)

- **Modifying any engine's data tables or benchmark ranges to align with the canonical taxonomy** — would require benchmark re-attribution and is a much larger initiative; not BL-031.87's job. Engines and benchmark datasets stay untouched.
- **Modifying website wizards to use canonical input** — out of scope; native enums remain the website-facing surface. URL state encoders may be revisited under BL-031.95 if the URL needs canonical encoding for cross-tool sharing; not promised here.
- **Adding canonical-aliasing for non-stage concepts** — growth velocity, headcount brackets, revenue brackets, geography. These have lower variance today; the cross-tool glossary in `contracts/README.md` catalogues them for future Adapter follow-ups if/when more tools share them.
- **Diligence Machine's `growthStage`** — this is a different concept (company-maturity coarse bucketing: `early` / `scaling` / `mature`), not a funding-stage variant. It will remain its own enum in `src/schemas/diligence.ts` with no canonical aliasing. The cross-tool glossary documents the distinction explicitly.
- **Authoring an IRL generator that consumes the canonical layer** — IRL is the strategic destination of BL-031.85's contracts; BL-031.87 enables the canonical input that IRL would consume but does not build IRL. File as a separate initiative when scoped (see [`MCP_SERVER_CONTRACTS_BL-031_85.md` § Proximate opportunities](MCP_SERVER_CONTRACTS_BL-031_85.md#proximate-opportunities)).
- **Engine-level Adapter integration** — deferred to a future initiative if/when the website-wizard URL state needs to canonicalize. The MCP-wrapper boundary's Adapter modules are reusable: lifting them to engine-level is a 1-day job changing import locations, not a redesign.
- **Schema-level Adapter integration via Zod `union().transform()`** — explicitly rejected on JSON Schema introspection grounds (see [Boundary choice](#boundary-choice-mcp-wrapper-not-engine-not-schema)).
- **A Remote Proxy for HTTP transport** — separate concern handled by [BL-032](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2). Remote Proxy and stage Adapter compose orthogonally; both can ship independently.

---

## Closure summary

Three commits, all-green verification:

1. **`06a06bd`** — Phase 1: canonical layer + adapters + 22 unit tests. New modules `src/data/common/funding-stages.ts` (`CANONICAL_STAGES`, `CanonicalStageSchema`, `CANONICAL_STAGE_DESCRIPTIONS`) and `src/data/common/stage-adapters.ts` (`ICG_STAGE_ADAPTER`, `TECHPAR_STAGE_ADAPTER`, helper functions, `isCanonicalStage` type guard, `resolveIcgStageInput` / `resolveTechparStageInput` resolvers). Tests cover total coverage, safe-direction round-trip, hand-tabulated lossy collapses, helper-function parity, and cross-adapter invariants.

2. **`08d7c68`** — Phase 2: MCP wrapper integration. `mcp-server/src/schemas.ts` re-exports the canonical layer + adapters and defines `ICGMcpInputsSchema` / `TechParMcpInputsSchema` (Zod union of canonical | native). `mcp-server/src/tools/icg.ts` and `mcp-server/src/tools/techpar.ts` swap to the new schemas, resolve canonical-or-native at the handler boundary, and emit a `stageContext: { native, canonical }` field in the response (canonical is array-valued, exposing lossy collapses honestly). Tool descriptions updated to advertise canonical preference.

3. **closure commit** — Phase 3: prompt update + docs. `gst_target_quick_look` v0.0.2 — `argsSchema.stage` swapped from `GrowthStageSchema` (portfolio enum) to `CanonicalStageSchema`; body no longer instructs the model to translate to ICG's native cohort labels (the wrapper does it). Golden snapshot updated to match. Cross-tool concept glossary in `mcp-server/src/docs/contracts/README.md` retired the "Will be superseded" transitional note and now documents the canonical layer as the public-facing taxonomy. ICG and TechPar `CONTRACT.md` files gained "Canonical stage adapter (BL-031.87)" sub-sections under their stage fields. BL-031.85 architecture doc's "Proximate opportunities" entry flipped to "✅ Closed by BL-031.87." BACKLOG status flipped.

**Deviations from plan**: none material. The original plan's `toCanonical(toolId, native)` and `fromCanonical(toolId, canonical)` helpers were implemented as per-tool functions (`icgFromCanonical`, `techparFromCanonical`, etc.) instead of generic `toolId`-keyed helpers — the per-tool form gives the type system exact knowledge of which keys exist and avoids unsafe runtime lookups. The `stageContext.canonical` field is always array-valued (per the lossy-direction policy); single-value canonical responses are wrapped in a one-element array for shape consistency.

**Live MCP exercise**: the running mcp-server subprocess is started at Claude session start from `dist/index.js` and cannot be reloaded with newly-built code mid-session — a real infrastructure constraint, not deferred work. Engineering correctness is verified by [`mcp-server/tests/integration/icg-handler.test.ts`](../../../mcp-server/tests/integration/icg-handler.test.ts), which exercises the post-BL-031.87 wrapper handler with canonical / native / omitted `companyStage` inputs and asserts the `stageContext` mapping plus the engine output shape. UI-level verification through Claude Desktop lands naturally the next time the MCP server restarts (next Claude session); it is not tracked as deferred work because it adds no engineering surface beyond what the integration test already covers.

---

_Last updated: 2026-05-02 (closure stanza added; first authored 2026-05-02)_
