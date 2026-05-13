# BL-032.25 — MCP Revisions prior to Go-Live: Per-Item Implementation Plan

> **Source**: BL-032.25 — bucket for soak-findings discovered during BL-032 § B.5 (staging soak window 2026-05-06 → 2026-05-12). **As of 2026-05-12 BL-032 has shipped to production** at `mcp.globalstrategic.tech`; this initiative is now in **post-Go-Live close-out mode**, tracking the remaining P1 follow-ups + any new findings surfaced during the one-week post-deploy review window (2026-05-12 → ~2026-05-19).
>
> **BACKLOG entry**: [BL-032.25 in BACKLOG.md](./BACKLOG.md#bl-03225-mcp-revisions-prior-to-go-live)
>
> **Status**: Open — close-out. Zero P0 items (substrate shipped). **Two P1 items open** (§§ 1, 3); § 2 closed 2026-05-13 (commit `e97650d`); § 4 closed 2026-05-13 (commit `170f1d0`); § 5 closed risk-accepted 2026-05-12. New findings from the post-deploy review window will be appended under their own § numbers. § 1 authored at initiative-creation time as the anchor finding (schema normalization → adapter retirement question); §§ 2–4 filed retroactively 2026-05-12 from the soak.
>
> **Title note**: the "prior to Go-Live" phrasing in the title is now historical — Go-Live happened 2026-05-12. Title retained for backlog-ID stability; the initiative's functional role is **close-out of substrate-soak follow-ups**.
>
> **Companion docs**:
>
> - [BL-032 design doc](./MCP_SERVER_REMOTE_BL-032.md) — substrate this initiative responds to
> - [BL-031.87 design doc](./MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) — the original adapter-pattern decision § 1 revisits
> - [BL-032 Soak-Week Testing Playbook](./MCP_SERVER_REMOTE_BL-032_TESTING.md) — primary source of findings populating this doc
> - [IMMEDIATE_NEXT_STEPS.md](./IMMEDIATE_NEXT_STEPS.md) — phase ordering through BL-033 (BL-032.25 sits in the "anytime during baselining window" lane)

## Triage convention

Every item logged under BL-032.25 gets a **severity tag**:

| Tag    | Meaning               | Effect on production deploy                                                                                                                              |
| ------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | Blocks Go-Live        | MUST close (commit + verification) before B.6 production deploy. Counts in the BL-032 § "Validation sequence before marking done" step #7                |
| **P1** | Post-launch follow-up | Recorded honestly; doesn't block B.6. After ship, gets either re-filed under BL-032.5 / BL-032.75 / BL-033 by topic OR remains here as ongoing follow-up |

**Default tag**: P1. Promotion to P0 requires explicit justification — the bar is "user-facing harm if shipped, not just imperfection." Good P0 examples: token leaking in logs, unhandled exception storm, broken auth. Good P1 examples: edge-case error message wording, schema-cleanliness wins, doc gaps that cost ~5 min to work around.

## Item lifecycle

1. **Discovery** — testing playbook, Sentry alert, ad-hoc usage, operator observation
2. **Logging** — operator adds a § N section here with: scenario / what was observed / preliminary investigation
3. **Severity** — operator (or reviewer) tags P0 / P1 with one-sentence rationale
4. **Plan** — for P0: concrete remediation steps + verification path. For P1: deferred-but-documented analysis + revisit criteria
5. **Execution** (P0 only) — engineering work + commit-SHA pointer added below the plan
6. **Closure stanza** — once shipped (P0) or formally deferred (P1), each item gets a closure stanza matching the convention used in BL-031.85 / BL-031.87 / BL-031.95: dated, evidence linked, recommendation summary
7. **Re-filing** (P1 only, post-B.6) — if the item belongs in a successor initiative (BL-032.5 / BL-032.75 / BL-033), it gets moved with a redirect note. Otherwise stays here

---

## § 1 — Schema normalization across Hub Tools (Investigation — P1, deferred)

### Status

- **Authored**: 2026-05-06 (anchor item at initiative creation)
- **Severity**: **P1** — post-launch follow-up; does NOT block B.6 production deploy
- **Recommendation**: defer normalization; preserve [BL-031.87](./MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) adapter pattern for production launch
- **Investigation evidence**: this section
- **Closure stanza**: [pending — added when revisit criteria are met OR when this item is formally cancelled]

### What it asks

Can the BL-031.87 stage-taxonomy adapter pattern be retired by **normalizing the underlying schemas** so that ICG and TechPar share a canonical funding-stage enum directly, rather than translating between native and canonical at the MCP-wrapper boundary?

[BL-031.87](./MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) explicitly considered and rejected this option in its Technical Context, calling out benchmark re-attribution risk and URL-state migration cost. This investigation re-validates that decision against the actual code as it stands post-Phase-5.5 deploy, and confirms or revises the recommendation.

### Investigation findings

#### Variance landscape today

Schema variance across the 5 transport-portable tools, surveyed 2026-05-06:

| Tool                  | Stage enum                                                                                                                                     | Native values                                                     | Notation                  | Cross-tool overlap                                                                                                                                                                                                                                                | Benchmark dataset keyed?                                                                                                 | URL state encodes value?                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **ICG**               | `CompanyStage` ([`src/schemas/icg.ts:75-81`](../../schemas/icg.ts))                                                                            | `pre-series-b`, `series-bc`, `pe-backed`, `enterprise` (4 values) | kebab-case                | Adapter to canonical                                                                                                                                                                                                                                              | **YES** — `BENCHMARK_RANGES` in [`src/utils/icg-engine.ts:332-346`](../../utils/icg-engine.ts) is keyed by these values  | **YES** — base64 JSON `g:` field; hardcoded validation list at line 207        |
| **TechPar**           | `Stage` ([`src/schemas/techpar.ts:18-19`](../../schemas/techpar.ts))                                                                           | `seed`, `series_a`, `series_bc`, `pe`, `enterprise` (5 values)    | snake_case for multi-word | Adapter to canonical                                                                                                                                                                                                                                              | **YES** — `STAGES` record in [`src/data/techpar/stages.ts:11-95`](../../data/techpar/stages.ts) is keyed by these values | **YES** — URL search param `?s=`; hardcoded validation list at engine line 644 |
| **Tech Debt**         | (none — uses raw `teamSize` integer)                                                                                                           | n/a                                                               | n/a                       | n/a                                                                                                                                                                                                                                                               | NO                                                                                                                       | NO (raw slider values)                                                         |
| **Diligence Machine** | `growthStage` ([`src/data/diligence-machine/wizard-config.ts:45`](../../data/diligence-machine/wizard-config.ts)) — `early`/`scaling`/`mature` | 3 values                                                          | kebab-case                | **NOT** an alias for funding-stage; intentionally distinct concept (company maturity / velocity, not funding cohort). Schema comment confirms: "_Distinct from BL-031.87 funding-stage canonical taxonomy — `growthStage` captures velocity, not funding-cohort_" | NO (gates question filtering, not benchmark lookup)                                                                      | URL state encodes value                                                        |
| **Regulatory Map**    | n/a                                                                                                                                            | n/a                                                               | n/a                       | n/a                                                                                                                                                                                                                                                               | n/a                                                                                                                      | n/a                                                                            |

**Key observation**: Diligence's `growthStage` LOOKS like it might be an alias but is explicitly NOT. This was decided when BL-031.87 was authored and is documented in the schema's `.describe()` text. Trying to alias `growthStage` into the canonical funding-stage taxonomy would be a category error.

#### Other potential schema variance — none found

Surveyed for parallel enums across tools (headcount brackets, revenue brackets, company-age brackets, etc.):

- **Headcount**: Diligence uses `'1-50'` / `'51-200'` / `'201-500'` / `'500+'` for question-filtering condition gates ([`wizard-config.ts:43`](../../data/diligence-machine/wizard-config.ts)); Tech Debt uses raw integer (`teamSize`) for cost calculation. Different representations because they serve different purposes — no overlap to normalize
- **Revenue range**: Diligence uses `'0-5m'` / `'5-25m'` / `'25-100m'` / `'100m+'` for filtering; ICG and TechPar accept ARR as a raw number for benchmark lookup. Same as headcount — different purposes
- **Company age**: Diligence-only; no cross-tool overlap

**Conclusion**: stage taxonomy is the ONLY genuinely-shared concept that today has cross-tool variance. The adapter pattern's scope was correctly identified.

#### What normalization would actually require

If schema normalization were attempted (i.e., rename ICG and TechPar's native stage enums to match `CANONICAL_STAGES = ['seed', 'series-a', 'series-b', 'series-c', 'pe', 'enterprise']`):

| Surface to touch                  | Files                                                                                                                                                                            | Risk                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Engine stage type definitions** | [`src/utils/icg-engine.ts:13`](../../utils/icg-engine.ts), [`src/utils/techpar-engine.ts`](../../utils/techpar-engine.ts)                                                        | MODERATE — TypeScript enum rename, but downstream usages in benchmark validation must update simultaneously                                                                                                                                                                                                                                                                                                                                                        |
| **Zod schemas**                   | [`src/schemas/icg.ts:75-81`](../../schemas/icg.ts), [`src/schemas/techpar.ts:18-19`](../../schemas/techpar.ts)                                                                   | HIGH — validation contract; upstream callers passing native values would fail until they update                                                                                                                                                                                                                                                                                                                                                                    |
| **Benchmark data re-keying**      | [`src/utils/icg-engine.ts:332-346`](../../utils/icg-engine.ts), [`src/data/techpar/stages.ts:11-95`](../../data/techpar/stages.ts)                                               | **CRITICAL** — re-keying is mechanical, but the tradeoff is: (a) ICG's `pre-series-b` deliberately collapses canonical seed + series-a because the benchmark population doesn't separate them (small sample size at seed). After normalization to canonical-direct keys, do we duplicate the row to seed (invents precision the data doesn't support), or leave seed unbenchmarked (invalid input that previously worked)? Same for TechPar's `series_bc` collapse |
| **URL state validation**          | [`src/utils/icg-engine.ts:207-209`](../../utils/icg-engine.ts), [`src/utils/techpar-engine.ts:644`](../../utils/techpar-engine.ts)                                               | LOW — find/replace the hardcoded validation lists with the new canonical values. **URL backward-compat is explicitly NOT a business requirement** (operator confirmed 2026-05-06), so existing shared URLs simply become invalid. Acceptable one-time breakage; no shim or deprecation window needed. Operator-notebook entries / case-study URLs containing the old values become dead links — costed-in                                                          |
| **MCP wrapper input validation**  | [`mcp-server/src/tools/icg.ts`](../../../mcp-server/src/tools/icg.ts), [`mcp-server/src/tools/techpar.ts`](../../../mcp-server/src/tools/techpar.ts)                             | LOW — adapters retire; wrappers just pass canonical values directly to the engine                                                                                                                                                                                                                                                                                                                                                                                  |
| **Website wizard UI / labels**    | [`src/pages/hub/tools/infrastructure-cost-governance/`](../../pages/hub/tools/infrastructure-cost-governance/), [`src/pages/hub/tools/techpar/`](../../pages/hub/tools/techpar/) | LOW — labels are data-driven from enum keys                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Adapter modules**               | [`src/data/common/stage-adapters.ts`](../../data/common/stage-adapters.ts)                                                                                                       | MOOT — modules become transparent pass-throughs and eventually retire                                                                                                                                                                                                                                                                                                                                                                                              |

**Engineering cost estimate** (revised 2026-05-06 after operator confirmed URL backward-compat is NOT a business requirement): **2-3 days** (was 3-5 with shim work). Broken down:

- Day 1: ICG engine + schema + benchmark re-key + URL validation list rewrite + tests
- Day 2: TechPar engine + schema + benchmark re-key + URL validation list rewrite + tests + MCP wrapper updates + adapter retirement + cross-tool prompt verification + golden snapshot regen
- Day 3: Website wizard QA (labels, dropdowns, fresh URL round-trips), full project CI-equivalent gate, doc updates

The URL-shim work that previously dominated Day 1 + Day 2 + half of Day 4 evaporates. With backward-compat off the table, the URL validation update is a single hardcoded-list find/replace per engine.

**Real risks** (post-revision):

1. **Silent benchmark mis-attribution** ← **DOMINANT REMAINING RISK.** If the re-key step gets the seed / series-a / series-b / series-c granularity wrong (e.g., copies series-a benchmarks into seed without questioning whether they apply), users see plausible-but-incorrect benchmark scores. Worse than the current adapter-collapses-to-known-coarseness behavior because at least under the adapter, the user sees the collapsed name (`pre-series-b`) and understands they're in a coarse bucket
2. **Re-attribution audit cost** — beyond the mechanical re-key, the right thing to do is re-audit the benchmark dataset's source (where did these numbers come from? do they actually merit splitting back to canonical granularity?). The audit itself is its own multi-day initiative if done seriously
3. **Stale-URL dead-link discovery** — every previously-shared URL becomes invalid. Operator-notebook entries with shared URLs become dead. Case-study URLs become dead. **Costed-in per operator confirmation**, but worth flagging that the dead-link discovery happens over weeks (as people open old URLs), not at the moment of deploy

**Real benefit**: agents introspecting the JSON Schema for ICG's `companyStage` or TechPar's `stage` see canonical values directly rather than via Zod-union. Slightly cleaner DX for AI consumers. **No new functionality enabled**; this is purely architectural housekeeping. **However**, the cleanliness gain is real — the canonical layer becomes the actual source of truth instead of a layer that translates to a different source of truth. Conceptually clearer for everyone touching the code.

#### The benchmark-audit question (now the dominant gating factor)

With URL compat off the table, the cost analysis collapses to a single dominant question: **does the benchmark dataset actually support finer granularity than the current collapsed shape?**

There are three possible answers, each with different implications:

| Audit finding                                                                                                                                                                                         | Implication                                                                                                                                                                                                                                                     | Recommendation                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Collapses are by-design** — ICG's `pre-series-b` and TechPar's `series_bc` reflect real data-signal limits (small sample sizes at finer granularity; benchmark numbers genuinely don't separate) | Normalization preserves the collapses (e.g., canonical seed + series-a both still resolve to ICG's now-renamed-but-collapsed row). Net: ~2-3 days engineering for cosmetic rename; no functional benefit; same data limitations expressed at different boundary | **Defer indefinitely**. The adapter pattern at MCP-wrapper boundary is functionally equivalent to a collapse-aware engine; relocating the collapse logic without changing the data is pure churn |
| **B. Collapses are lazy modeling** — the dataset's source data actually supports finer granularity, but BL-031.87's predecessor work elected coarse buckets for simplicity                            | Normalization with a real benchmark audit IS the right thing — it both improves the data integrity and removes the adapter conceptual tax                                                                                                                       | **Schedule a 2-4 hour benchmark-audit spike.** If the audit confirms B, scheduling normalization (~2-3 days) becomes defensible during a future capacity window                                  |
| **C. Mixed / unclear** — some collapses are by-design, others might be lazy                                                                                                                           | Audit on a per-collapse basis; normalize what can be split, preserve what can't                                                                                                                                                                                 | **Schedule the audit anyway**; outcome will be incremental rather than wholesale                                                                                                                 |

**Audit cost**: estimated 2-4 hours of someone with domain expertise (the original ICG / TechPar benchmark authors, or a senior consultant who can speak to whether the dataset's coarseness reflects reality). Cheap.

#### Decision criteria checklist (revised)

A normalization initiative becomes worth doing if AND only if:

- [ ] **Benchmark audit completed** — answers whether the existing collapses are by-design or lazy. **This is the new dominant question.** Cheap to answer (2-4 hours); expensive to skip
- [ ] **At least one architectural trigger has fired** (any of):
  - **A new third tool** is being added that needs stage-cohort binning AND its dataset doesn't naturally collapse into ICG's or TechPar's native shape. **Status today: no such tool planned through BL-033**
  - **External-pilot scoping (BL-033)** flags the adapter pattern as confusing for paying customers' compliance review. **Status today: speculative; will surface in BL-033's design discussion**
  - **Audit comes back finding B (lazy modeling)** — in which case the cleanliness gain stacks with a real data-integrity gain, justifying the work on its own
- [ ] **Engineering capacity allocated** — minimum 2-3 day uninterrupted block (revised down from 5 with URL-shim work removed)

If audit comes back A (by-design) AND no architectural trigger has fired, the recommendation is "leave the adapter pattern alone; it's encoding a real data limitation and renaming where the limitation lives gains nothing." If audit comes back B (lazy modeling), the recommendation flips to "schedule normalization as a coordinated initiative with the benchmark audit."

### Recommendation (revised 2026-05-06 after URL-compat clarification)

**Two-step recommendation**:

**Step 1 — Defer normalization for B.6 production deploy (P1).** The Adapter pattern (BL-031.87) shipped May 2 and is operationally stable; gating Go-Live on schema cleanliness is the wrong tradeoff. The B.6 deploy ships with adapters intact.

**Step 2 — Schedule the benchmark-audit spike (2-4 hours) post-launch.** This is the cheap, high-information action. Outcome determines what BL-032.25 § 1 actually becomes:

- **If audit returns finding A (collapses are by-design)** → § 1 closes formally with "rejected — relocating the collapse logic without changing the data is pure churn"
- **If audit returns finding B (collapses are lazy modeling)** → § 1 graduates to a scheduled initiative: 2-3 days engineering + the audit-driven re-attribution + adapter retirement, all coordinated as one piece of work
- **If audit returns finding C (mixed)** → § 1 splits into per-collapse decisions; partial normalization where data supports it

**Reasons defer-for-B.6 still holds even with reduced cost**:

1. **The Adapter pattern is operationally stable** — proven through BL-031.95's 5-phase verification, BL-031.75's V8 sign-off, and now Phase 6 staging deploy
2. **Benchmark re-attribution risk is now the dominant remaining cost driver.** The benchmark-audit spike (Step 2) is the right way to clarify it. Doing the audit in-soak conflicts with the soak's primary purpose (validate the substrate, not redo Hub-tool data work)
3. **No identified user-visible benefit during BL-032 scope.** Cross-tool prompts work, single-tool prompts work, agent introspection works
4. **BL-031.87 explicitly defers.** The original initiative documented the choice + the criteria for revisiting. Honoring that staged decision is preferable to relitigating it during a deploy soak

**What this means for B.6 production deploy**: ships with the adapter pattern intact. No code changes required for Go-Live.

**What this means for post-launch**: schedule the benchmark-audit spike (2-4 hours, can be done off-soak). Outcome drives whether § 1 closes (audit finding A), graduates (B), or splits (C). The formerly-listed "URL-format versioning decision" is no longer relevant since URL backward-compat isn't a requirement.

### 2026-05-13 post-Go-Live confirmation

Re-audited the variance landscape one day post-Go-Live to confirm the 2026-05-06 investigation is still accurate:

- **Adapter pattern shipped + operationally stable**: canonical taxonomy at [`src/data/common/funding-stages.ts:19-26`](../../data/common/funding-stages.ts), adapters at [`src/data/common/stage-adapters.ts`](../../data/common/stage-adapters.ts) (ICG lines 38–54, TechPar lines 62–79), MCP wrapper integration at [`mcp-server/src/schemas.ts:166-194`](../../../mcp-server/src/schemas.ts) — all in place per BL-031.87 closure (2026-05-02). Production deploy 2026-05-12 exercises these on every ICG / TechPar tool call
- **No native-schema drift since 2026-05-06**: `git log --since="2026-05-06" -- src/data/common/* mcp-server/src/tools/* src/schemas/icg.ts src/schemas/techpar.ts src/data/techpar/* src/utils/icg-engine.ts src/utils/techpar-engine.ts` returns only description-string refinements (commit `02441fe`); no structural changes to enums, adapters, or benchmark data
- **Real-data check**: `src/data/ma-portfolio/projects.json`'s `growthStage` field uses its own 6-value vocabulary (`Early-Stage Growth`, `Scaling Growth`, `Mature Enterprise`, `Expansion Stage`, `Established Market Leader`, `Legacy System`) — no overlap with ICG / TechPar funding-stage values, confirming portfolio's `growthStage` is intentionally a distinct concept (already noted in BL-031.87 § Out of scope)
- **Collapses appear by-design**: BL-031.87 § Why we kept ICG's pre-series-b explicitly says _"ICG's `pre-series-b` deliberately collapses canonical seed + series-a because the benchmark population doesn't separate them (small sample size at seed)"_. TechPar's `series_bc` row at [`src/data/techpar/stages.ts:44-58`](../../data/techpar/stages.ts) is similarly labeled "Series B–C" with a documented convergence rationale. **This is suggestive evidence for finding A** (collapses are by-design) but is NOT a substitute for the formal benchmark-audit spike — the spike is the audit OF the dataset, not the engine's framing of it

**Status**: investigation conclusions hold. The benchmark-audit spike (2–4 hours, original ICG / TechPar benchmark authors or a senior consultant) remains the next concrete action. Spike is **not yet scheduled** as of 2026-05-13.

### Closure stanza placeholder

(Closure stanza added when this item is formally resolved — either by execution after a trigger fires, or by formal cancellation if BL-033 scope confirms the adapter pattern is BL-033-acceptable too.)

---

## § 2 — T.A.4 empty-bearer error message (P1)

### Status

- **Authored**: 2026-05-12 (filed retroactively from soak findings during BL-032.25 closure audit)
- **Re-investigated**: 2026-05-13 (post-Go-Live close-out — original root-cause analysis was incomplete; see below)
- **Severity**: **P1** — cosmetic error-disambiguation gap; correct status code returned, only the human-readable message is imprecise
- **Recommendation (revised 2026-05-13)**: close as **resolved-by-design** OR ship a 5-line surgical fix; the original "add an empty-after-trim check" plan is moot because that check already exists. See **Mitigation options** below
- **Investigation evidence**: this section
- **Closure stanza**: [pending — operator decision on mitigation option]

### What it asks

A request with `Authorization: Bearer ` (empty token after the scheme) returns `HTTP 401` with body `{"error":"unauthorized","message":"Authorization header must use Bearer scheme"}`. The status code is correct; the message is wrong — it suggests the scheme was rejected when in fact the scheme parsed fine and the token slot was empty.

### Investigation findings (revised 2026-05-13)

The **original 2026-05-12 root-cause hypothesis was wrong**. Re-reading the code:

- The empty-token check **already exists** in [`mcp-server/src/auth/bearer.ts:75-76`](../../../mcp-server/src/auth/bearer.ts):
  ```typescript
  const token = auth.slice(BEARER_PREFIX.length).trim();
  if (!token) return unauthorized('Empty Bearer token');
  ```
- That check has been present since BL-032 Phase 2 (commit `a2bf819`) — i.e., it was there when T.A.4 was tested 2026-05-09. The original plan ("trivial fix: add an empty-after-trim check") proposed adding code that was already there
- **Actual root cause**: HTTP runtimes (curl, fetch, undici, the Cloudflare Workers HTTP parser) **normalize trailing whitespace on header values**. The header `Authorization: Bearer ` arrives at the handler as the literal string `"Bearer"` (no trailing space)
- Code path under that normalization:
  1. `auth = request.headers.get('Authorization')` → `"Bearer"` (7 chars, no trailing space)
  2. `auth.startsWith('Bearer ')` (8 chars including space) → **false**
  3. Scheme-rejection branch fires → returns `"Authorization header must use Bearer scheme"`
  4. Empty-token check at line 76 is **unreachable** in this scenario
- The existing integration test [`mcp-server/tests/integration/auth.test.ts:73-89`](../../../mcp-server/tests/integration/auth.test.ts) **already documents this behavior as correct-by-design** — it explicitly does not pin the message and comments: _"HTTP runtimes may normalize trailing whitespace on header values, so 'Bearer ' can arrive as 'Bearer' — which trips the scheme check rather than the empty-token check. Both are correct rejections of 'no token provided'."_

So the T.A.4 "FAIL" was the soak's discovery of a behavior the auth-test author already knew about and accepted. The disambiguation gap is real (the message is imprecise) but the fix is not where the original plan said it was.

### Mitigation options

**Option A — Close as resolved-by-design (zero code, zero risk)**

- The existing integration test (auth.test.ts:73-89) is the canonical record that this behavior is intentional
- Update the testing-findings doc T.A.4 entry to point at this section's revised analysis (currently the T.A.4 entry just says "P1 cosmetic error-disambiguation gap; status code is correct")
- Close § 2 with a closure stanza pointing at auth.test.ts:73-89 as the by-design record
- **Effort**: 10 minutes (doc updates only)
- **Risk**: zero
- **What operators see**: unchanged — `Bearer ` still returns the scheme-rejected message. The doc record is improved

**Option B — Ship the 5-line surgical fix (cosmetic improvement)**

- Detect the bare-`Bearer` and `Bearer + only-whitespace` cases explicitly and route them to the empty-token-error branch:
  ```typescript
  // Distinguish empty-token-after-normalization from a non-Bearer scheme.
  // HTTP runtimes strip trailing whitespace on header values, so
  // `Authorization: Bearer ` arrives as `"Bearer"` (no trailing space) —
  // route those to the empty-token branch for clearer 401 messages.
  if (auth === 'Bearer' || auth.match(/^Bearer\s*$/)) {
    return unauthorized('Empty Bearer token');
  }
  if (!auth.startsWith(BEARER_PREFIX)) {
    return unauthorized('Authorization header must use Bearer scheme');
  }
  ```
- Replace the conditional in [bearer.ts:72-73](../../../mcp-server/src/auth/bearer.ts) with the above
- Update auth.test.ts:73-89 to pin the message (`expect(body.message).toMatch(/empty bearer/i)`) and remove the "Both are correct rejections" hedge
- **Effort**: 30 min including the test update + a typecheck + a `cd mcp-server && npm test`
- **Risk**: very low — the change is additive (a new precondition routes to an existing branch); no auth path widens
- **What operators see**: `Bearer ` (and `Bearer\t`, `Bearer  `, etc.) now return `"Empty Bearer token"` instead of `"Authorization header must use Bearer scheme"`. Slightly clearer debugging signal for operators who paste `Bearer ` into curl by accident

### Plan

P1 — operator picks Option A or B during execution. Default recommendation: **Option A**. Reasoning: the gap is cosmetic, the existing test already records the by-design call, and the operator-workflow signal (T.A.5 / T.A.6) proves an honest config error surfaces a clear distinct message (`Invalid Bearer token`). Option B is a fine improvement if the operator wants the polish, but it's pure aesthetics.

### Recommendation

**Option A — close as resolved-by-design**. If operator wants polish, Option B costs 30 min.

### Closure stanza

**Closed (2026-05-13)** — operator chose **Option B** (5-line surgical fix), shipped in commit `e97650d` `fix(mcp): close BL-032.25 § 2 — empty Bearer header returns clearer 401 message`. The fix adds a precondition to `mcp-server/src/auth/bearer.ts:71-76` that detects bare-`Bearer` and `Bearer\s+` (the shapes produced by HTTP-runtime whitespace normalization of `Authorization: Bearer `) and routes those cases to the empty-token branch. Paired update to `mcp-server/tests/integration/auth.test.ts:73-89` pins the expected message (`/empty bearer token/i`) and removes the prior "Both are correct rejections" hedge. All 420 MCP tests pass; typecheck clean. Operator-visible effect: `Bearer ` now returns `"Empty Bearer token"` instead of the misleading `"Authorization header must use Bearer scheme"`.

---

## § 3 — T.K.2.b.3 local stdio diligence timeout (P1)

### Status

- **Authored**: 2026-05-12 (filed retroactively from K-section soak)
- **Re-investigated**: 2026-05-13 (post-Go-Live close-out — see "Current state" below)
- **Severity**: **P1** — affects only the local stdio connector path for one tool; remote HTTP (staging at the time, production now) completed normally; Claude Desktop's transparent fallback to the remote connector recovered the user-facing workflow
- **Recommendation**: defer until the reproduction script returns a clean root-cause classification; **do not attempt a fix without a reproduction first**
- **Investigation evidence**: this section
- **Closure stanza**: [pending]

### What it asks

A Claude Desktop call to `gst:generate_diligence_agenda` over the local stdio connector hung for the full 4-minute Desktop timeout, while the same call over the remote staging connector completed in normal time. Other local stdio tool calls in the same session (`list_portfolio_facets`, `search_portfolio`) worked fine — so the defect is tool-specific, not connector-level.

### Current state (2026-05-13)

- **No post-soak code changes** in the call path: `git log --since="2026-05-10" -- mcp-server/src/index.ts mcp-server/src/tools/diligence.ts mcp-server/src/server.ts` returns only description-string refinements (commits `02441fe`, `e472be9`). The handler that timed out 2026-05-10 is byte-identical to current HEAD
- **Test coverage gap**: existing tests at [`mcp-server/tests/integration/diligence-handler.test.ts`](../../../mcp-server/tests/integration/diligence-handler.test.ts) (191 lines) and [`mcp-server/tests/unit/diligence.test.ts`](../../../mcp-server/tests/unit/diligence.test.ts) (91 lines) **do not** measure response size, exercise the worst-case all-13-fields-supplied input, or stress the stdio transport with large payloads. The bug's reproduction is not gated by anything in CI
- **Response-size estimate (refined)**: handler at [`mcp-server/src/tools/diligence.ts:87-109`](../../../mcp-server/src/tools/diligence.ts) returns both `content[0].text` (pretty-printed JSON) AND `structuredContent` (parsed object) — doubling the wire size. Estimated worst-case ~15–20 KB on the wire (twice the 5–8 KB compact-JSON estimate in the original soak finding). Still well inside a 64 KB default pipe buffer, but pretty-print + structured-content duplication makes it closer to the edge than the original finding implied
- **MCP SDK unchanged**: `@modelcontextprotocol/sdk` still pinned at `^1.29.0`. No upgrade in the post-soak window

### Investigation findings

- Reproduction: [TESTING_FINDINGS § T.K.2.b.3](./BL-032_TESTING_FINDINGS.md#tk2b3--generate_diligence_agenda)
- Three live hypotheses (refined 2026-05-13):

  | #   | Hypothesis                                                                                                                                                                                                                              | Estimated likelihood (2026-05-13)                                                                                                                                                                                                |
  | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1   | Large JSON response overflowing the stdio pipe buffer (15–20 KB doubled by content/structuredContent duplication) — Desktop's reader pauses mid-stream and the Worker's `process.stdout.write()` blocks waiting for backpressure relief | **Moderate-to-low**. 15–20 KB is well below a 64 KB pipe buffer, but the duplication is a real wart and could matter under specific Desktop reader implementations. Cheap to test by stripping the `structuredContent` duplicate |
  | 2   | `generateScript()` engine slow path triggered by the K.2.b.3 input combo (`growthStage: scaling`, `geographies: ['us', 'eu']`, `dataSensitivity: high`, all 13 fields supplied)                                                         | **Low**. No algorithmic pathologies documented; existing unit tests assert <100 ms generation. But tests use partial inputs; the all-13-fields combo is unexercised                                                              |
  | 3   | stdio child-process deadlock — Desktop's stdio reader hangs on a specific message-boundary edge case in MCP SDK 1.29.0's `StdioServerTransport`                                                                                         | **Low-moderate**. The 4-minute exactly-Desktop-timeout suggests a hung consumer rather than a hung producer. But this is an upstream SDK issue if true — not directly fixable in this repo                                       |

- **Diagnostic next step** (concrete): build + run a reproduction script that replays the K.2.b.3 input combo against the local stdio entrypoint, with timing instrumentation. The script should:

  ```powershell
  # Pseudocode — implement under mcp-server/scripts/repro-k2b3.ts (Phase 1)
  # 1. Start `node mcp-server/dist/index.js` as a child process, piping stdio
  # 2. Send the exact JSON-RPC envelope from the K.2.b.3 transcript via stdin
  # 3. Time three checkpoints:
  #    a. Engine returns (handler.ts:89 generateScript completes) — instrument with console.error
  #    b. Worker writes response to stdout — instrument before/after the write
  #    c. Desktop reader (or our script) finishes consuming the response
  # 4. Variants to try:
  #    - With and without structuredContent duplication
  #    - With and without pretty-print (JSON.stringify(p, null, 2) vs JSON.stringify(p))
  #    - Worst-case all-13-fields input vs minimal-fields input
  ```

  Classifications:
  - If (a) is slow → hypothesis 2 (engine bug) → profile the `generateScript()` hot path
  - If (a) is fast and (b–c) gap is large → hypothesis 1 or 3 → strip duplicate `structuredContent`, retest; if still slow, escalate to MCP SDK
  - If all three checkpoints fire promptly and our script returns clean → was a Desktop-specific flake; mark INCONCLUSIVE and watch for recurrence

### Plan

P1, deferred until reproduction script exists. **Estimated effort**:

- **Reproduction script**: 1 hour (write `mcp-server/scripts/repro-k2b3.ts`, parse the K.2.b.3 transcript for the exact input, run with logging)
- **Root-cause narrowing**: 1–2 hours (variants + instrumentation)
- **Fix**: 0–2 hours depending on which hypothesis fires (Hypothesis 1: 30 min strip the structured-content duplicate; Hypothesis 2: 2 hours engine profile + fix; Hypothesis 3: 0 hours in-repo, escalate)
- **Total**: 2–5 hours including the fix

### Recommendation

Defer until either (a) the reproduction script is scheduled (suggest a 2-hour timebox in Phase 2c work alongside BL-032.75 instrumentation — the metrics emitters from Phase 2a will surface a tool_invocation duration that catches recurrence cheaply), or (b) the bug reproduces on a different input / a different consumer (Claude Code, where there's no remote fallback). **Do not attempt a fix without a reproduction first** — one-instance / one-input observations are flaky-evidence territory.

### Closure stanza

(Pending — investigation-time.)

---

## § 4 — T.X.1 secondary playbook polish (P1)

### Status

- **Authored**: 2026-05-12 (filed retroactively from soak; two follow-ups noted in T.X.1's Notes that weren't formally tracked)
- **Re-investigated**: 2026-05-13 (post-Go-Live close-out — both hazards confirmed with exact line numbers; adjacent sweep clean)
- **Severity**: **P1** — both are operator-experience polish; T.X.1's primary fix (PowerShell placeholder replaced with `Read-Host`) already shipped in commit `3bacd0e`
- **Recommendation**: bundle both fixes in a single 30-min commit; clean enough to ship standalone or roll into the next operator-doc revision pass (BL-034)
- **Investigation evidence**: this section
- **Closure stanza**: [pending — fix-time]

### What it asks

T.X.1's resolution surfaced two adjacent follow-ups that didn't make the original fix:

1. The bash equivalent in [`DEPLOY.md` § B.3](../../../mcp-server/src/docs/operations/DEPLOY.md) may have the same literal-placeholder hazard the PowerShell setup snippet did; review and convert to `read -s MCP_KEY` if so
2. The `Invoke-McpRequest` helper's SSE-only parser silently returns the raw HTTP response when the body isn't SSE (e.g., a 401 returns JSON, which the parser doesn't recognize and falls through). Operators running `(call).result.foo` get `$null` with no obvious cause. Either raise a clearer error on non-2xx OR document the diagnostic incantation prominently

### Investigation findings (2026-05-13)

**(a) Bash placeholder hazard — CONFIRMED**

File: [`mcp-server/src/docs/operations/DEPLOY.md` § B.3 lines 435–438](../../../mcp-server/src/docs/operations/DEPLOY.md). Setup snippet:

```bash
export MCP_URL=https://mcp-staging.globalstrategic.tech
export MCP_KEY=<your-MCP_KEY_RP-token-value>
```

Line 437 contains the literal placeholder `<your-MCP_KEY_RP-token-value>`. An operator who copy-pastes the block verbatim sets `MCP_KEY` to the literal string and subsequent `curl` calls fail with 401 — identical hazard to the pre-T.X.1 PowerShell snippet. Fix: rewrite as a `read -s -p` prompt, mirroring the PowerShell `Read-Host` pattern:

```bash
export MCP_URL=https://mcp.globalstrategic.tech
read -rsp "MCP_KEY for $MCP_URL (input hidden): " MCP_KEY
export MCP_KEY
echo  # newline after the hidden prompt
```

Additionally: the `MCP_URL` default in line 435 still references `mcp-staging.globalstrategic.tech` — update to `mcp.globalstrategic.tech` (production-canonical, mirroring REMOTE_CLIENT_SETUP.md's 2026-05-12 flip).

**(b) SSE-parser fallthrough — CONFIRMED**

File: [`mcp-server/scripts/Invoke-McpRequest.ps1` lines 92–97](../../../mcp-server/scripts/Invoke-McpRequest.ps1). Parser:

```powershell
$dataLine = $resp.Content -split "`n" | Where-Object { $_ -like 'data:*' } | Select-Object -First 1
if (-not $dataLine) { return $resp }
return $dataLine.Substring(5).Trim() | ConvertFrom-Json
```

When the Worker returns a non-SSE response (401 JSON, 5xx JSON, network error converted to a response object), no `data:*` line matches, and the function returns the raw `Invoke-WebRequest` response object — NOT parsed JSON. An operator running `(Invoke-McpRequest …).result.foo` accesses `.result` on a response object (which has no `.result` property) and gets `$null` with no error thrown. The diagnostic incantation `$resp.GetType().FullName` + `$resp.Content.Substring(0, 200)` exposes the situation but is not documented.

**Decision (operator, 2026-05-13)**: ship the **correct fix** — replace the silent-fallthrough with explicit `throw` statements on HTTP error and on the "200 OK but no SSE data line" protocol-unexpected path. Backwards-compat for existing callers is NOT a constraint (no active external clients of `Invoke-McpRequest` outside this repo).

**Implementation**:

```powershell
# In Invoke-McpRequest, after the Invoke-WebRequest call:

if ($resp.StatusCode -ge 400) {
    $bodyExcerpt = if ($resp.Content) {
        $resp.Content.Substring(0, [Math]::Min(500, $resp.Content.Length))
    } else { '<empty body>' }
    throw "Invoke-McpRequest: HTTP $($resp.StatusCode) from $($env:MCP_URL)/mcp. Body excerpt: $bodyExcerpt"
}

$dataLine = $resp.Content -split "`n" | Where-Object { $_ -like 'data:*' } | Select-Object -First 1
if (-not $dataLine) {
    $bodyExcerpt = $resp.Content.Substring(0, [Math]::Min(500, $resp.Content.Length))
    throw "Invoke-McpRequest: 2xx response but no SSE data line in body (protocol unexpected). Body excerpt: $bodyExcerpt"
}
return $dataLine.Substring(5).Trim() | ConvertFrom-Json
```

In `Invoke-McpTool`, the `if (-not $resp.PSObject.Properties.Match('result').Count)` guard (lines 119–122) becomes unreachable — `Invoke-McpRequest` now throws on those paths — so it's removed. The `result.content[0].text` shape check stays (different concern: MCP envelope shape on a legitimate 200), and the try/catch around `ConvertFrom-Json` stays (Zod-rejection-as-text is a legitimate 200 case).

Net change: ~10 lines added, ~6 lines removed, loud failures with diagnostic context on every error path. Effort still ~30 min including verification round-trips against a 401.

### Adjacent doc-sweep findings (2026-05-13)

Swept `mcp-server/src/docs/operations/*.md` for similar placeholder hazards and stale references. Findings:

- **No stale production URL references**: REMOTE_CLIENT_SETUP.md was flipped to production-canonical in commit `6332b3c` 2026-05-12; all snippets reference `mcp.globalstrategic.tech` (staging shown as alternative for testing only)
- **`YOUR_TOKEN_HERE` markers** in REMOTE_CLIENT_SETUP.md (lines 103, 110, 150, 164, 187, 199) — all six are intentional placeholders in client-config JSON snippets; surrounding text explicitly tells the operator to replace. Not a hazard but inconsistent notation; could optionally wrap as `<YOUR_TOKEN_HERE>` for extra visual salience. Low value — defer
- **Two intentional TBD markers**: prophylactic key rotation (DEPLOY.md lines 96, 698 — deferred to BL-033) and radar-tier rate-limit enforcement (REMOTE_CLIENT_SETUP.md line 298 — deferred to BL-038). Both clearly attributed; leave as-is

### Plan

P1, ready to ship as a standalone commit (operator chose **ship separately** from § 2 in the 2026-05-13 implementation-order decision):

1. DEPLOY.md § B.3 lines 435–438: replace bash export block with `read -rsp` pattern + update default URL to production
2. DEPLOY.md elsewhere: sweep for any remaining `mcp-staging` defaults
3. Invoke-McpRequest.ps1: replace silent-fallthrough at lines 92–97 with `throw` statements on HTTP error + on no-SSE-data-line; bootstrap default at line 54 (`mcp-staging.globalstrategic.tech`) also flipped to production-canonical
4. Invoke-McpTool: remove the now-unreachable no-`.result` guard (lines 119–122)
5. Verify: `cd mcp-server && npm test` clean; manually round-trip `Invoke-McpRequest` against a 401 to confirm the throw fires with diagnostic context

### Recommendation

Standalone shippable commit. Doesn't require coordination with BL-034 unless the operator wants to batch with broader doc cleanup.

### Closure stanza

**Closed (2026-05-13)** — both follow-ups shipped in commit `170f1d0` `fix(mcp): close BL-032.25 § 4 — DEPLOY bash setup + Invoke-McpRequest fails loudly on HTTP errors`.

- **(a) DEPLOY.md § B.3** bash setup snippet rewritten to use `read -rsp "MCP_KEY (input hidden): " MCP_KEY` so the operator paste-hazard (`<your-MCP_KEY_RP-token-value>`) is gone. Default `MCP_URL` flipped from `mcp-staging.globalstrategic.tech` to `mcp.globalstrategic.tech` (production-canonical, mirroring REMOTE_CLIENT_SETUP.md's 2026-05-12 flip). PowerShell-helper comment-block at the matching location also updated to default to production + demonstrate `Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText` for explicit overrides
- **(b) Invoke-McpRequest.ps1** refactored to **fail loudly**: throws on `StatusCode >= 400` with `HTTP $status from $url. Body excerpt: ...` AND throws on "2xx response but no SSE data line" with `protocol unexpected. Body excerpt: ...`. Bootstrap MCP_KEY prompt also flipped to `Read-Host -AsSecureString` to keep the value out of scrollback. The now-unreachable `if (-not $resp.PSObject.Properties.Match('result').Count)` guard in `Invoke-McpTool` removed; the legitimate-2xx-but-Zod-rejection text-parse guard retained. Operator confirmed no external callers; no backwards-compat needed

All 420 MCP tests pass; typecheck clean.

---

## § 5 — T.X.4 credential-prompt `-AsSecureString` sweep (CLOSED — risk accepted)

### Status

- **Authored**: 2026-05-12 (filed retroactively from T.X.4)
- **Initial severity**: **P0** — token-rotation work was already blocking B.6 per T.X.4's own assessment; the process-hygiene sweep was the prevent-recurrence half of the same blocker
- **Final severity**: **Closed — risk accepted by operator 2026-05-12**
- **Recommendation**: do not execute (neither the sweep nor the rotation); item closed as risk-accepted
- **Investigation evidence**: this section
- **Closure stanza**: see below

### What it asks

Three Upstash REST tokens leaked to chat transcripts during the soak: two from T.C.7's recovery flow (Standard + Read-only candidates, see T.X.2) and one from T.B.9.f's preflight (T.X.4 itself). The root cause is the same in all three: Claude-authored PowerShell preflight blocks used plain `Read-Host "..."` rather than `Read-Host -AsSecureString`, so PowerShell echoed the typed values visibly to the terminal scrollback. The operator then pasted the post-run scrollback back to Claude to share test results, taking the secret along for the ride.

The T.X.1 fix migrated `Invoke-McpRequest.ps1`'s `MCP_KEY` prompt to a no-echo pattern in commit `3bacd0e`. Section D / T.B.9.f / T.B.10.f / T.C.7-style ad-hoc snippets were NOT migrated; the originally-proposed remediation was a single sweep through all credential-prompt patterns in the playbook to enforce `-AsSecureString` everywhere PLUS rotation of the three leaked tokens.

### Investigation findings

- Reproduction: [TESTING_FINDINGS § T.X.4](./BL-032_TESTING_FINDINGS.md#tx4--third-upstash-standard-token-leaked-to-chat-during-tb9f-preflight)
- Related: [TESTING_FINDINGS § T.X.2](./BL-032_TESTING_FINDINGS.md#tx2--read-only-vs-standard-upstash-rest-token-confusion-during-tc7-recovery) (first two leaks)
- Originally-proposed surface to sweep: [`MCP_SERVER_REMOTE_BL-032_TESTING.md`](./MCP_SERVER_REMOTE_BL-032_TESTING.md) — every `Read-Host` block prompting for a secret (UPSTASH\_\*, MCP_KEY, INOREADER\_\*, SENTRY_DSN, etc.)
- Originally-proposed pattern to enforce: `Read-Host -AsSecureString -Prompt "..."` followed by `$plain = [Net.NetworkCredential]::new('', $secure).Password`

### Plan

**Not executing.** Operator accepted the risk on 2026-05-12: the three leaked Upstash tokens will not be rotated, and the playbook `-AsSecureString` sweep will not be performed. Operator's rationale lives outside this doc; this section captures only the decision and its scope.

What this means operationally:

- The three leaked Upstash REST tokens remain live with their current permissions. They are present in Claude conversation transcripts from the soak (T.C.7 recovery sessions and the T.B.9.f preflight chat).
- Future credential-prompt blocks in the playbook will continue to use plain `Read-Host` unless individually migrated as part of unrelated work. Future tokens prompted via the unmigrated patterns are at the same risk of the same leak path.
- B.6 production deploy is no longer gated on this item. BL-032.25 now has zero P0 items in its bucket.

### Recommendation

Close as risk-accepted. Do not re-open absent new evidence (e.g., a leaked token observed being used by a third party, or an Upstash account compromise that forces rotation regardless).

### Closure stanza

**Closed (2026-05-12)** — risk accepted by operator. No rotation, no sweep. The original `Read-Host` → `-AsSecureString` migration in `Invoke-McpRequest.ps1` (commit `3bacd0e`) remains in place for the MCP_KEY prompt; ad-hoc playbook snippets continue to use the plain pattern by design. Reopening criterion: external evidence of token misuse OR Upstash account incident.

---

## Implementation order and execution plan (close-out)

This section is the operator-facing close-out plan for the four open P1 items, written 2026-05-13 after the post-Go-Live re-investigation above. **Read this section before opening a feature branch** — it captures the dependency order, risk callouts, and the questions that need an answer before each item starts.

### Effort summary

| Item | Effort                                                                                        | Risk                | Ships as                                                     | Status                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| § 2  | 30 min (Option B: 5-line surgical fix + test update)                                          | Very low            | Standalone commit                                            | **✅ Closed 2026-05-13** — commit `e97650d`                                                                  |
| § 4  | ~30 min (bundled (a) + (b): bash placeholder + URL flip + Invoke-McpRequest throw refactor)   | Low                 | Standalone commit                                            | **✅ Closed 2026-05-13** — commit `170f1d0`                                                                  |
| § 1  | 2–4 hrs benchmark-audit spike; then 0 days OR 2–3 days engineering depending on audit outcome | Schedule / data     | Deferred until BL-032.75 Phase 2 closes (~3–5 weeks)         | **Deferred** — operator chose to wait (2026-05-13). Re-surface as agenda item at Phase 2 close-out           |
| § 3  | 1 hr reproduction script + 1–2 hrs root-cause narrow + 0–2 hrs fix                            | Unknown until repro | Bundle with BL-032.75 Phase 2a/2c when instrumentation lands | **Blocked** on reproduction-script construction; suggested timing tied to BL-032.75 Phase 2a metric emitters |

### Execution plan (operator decisions, 2026-05-13)

1. **§ 2 first, standalone commit** — Option B (5-line bearer.ts surgical fix):
   - Edit `mcp-server/src/auth/bearer.ts:72-73`: prepend a bare-`Bearer` / `Bearer\s*` detection that routes those cases to the empty-token branch
   - Update `mcp-server/tests/integration/auth.test.ts:73-89`: pin the message (`expect(body.message).toMatch(/empty bearer/i)`); remove the "Both are correct rejections" hedge comment
   - Verify: `cd mcp-server && npm test` clean; typecheck clean
   - Commit message: `fix(mcp): close BL-032.25 § 2 — empty Bearer header returns clearer 401 message`
2. **§ 4 second, standalone commit** — throw-on-error refactor + bash polish:
   - DEPLOY.md § B.3 lines 435–438: replace bash export block with a hidden-prompt pattern; flip default `MCP_URL` to production
   - DEPLOY.md elsewhere: sweep for any other `mcp-staging` defaults (none expected based on the 2026-05-12 REMOTE_CLIENT_SETUP.md flip; verify during execution)
   - `mcp-server/scripts/Invoke-McpRequest.ps1`:
     - Line 54: flip the `$env:MCP_URL` default to `mcp.globalstrategic.tech`
     - Lines 85–97: keep `-SkipHttpErrorCheck`, then `throw` on `StatusCode >= 400` with `HTTP $status from $url. Body excerpt: ...` AND `throw` on no-SSE-data-line on a 2xx response with `protocol unexpected. Body excerpt: ...`
     - Lines 119–122 (`Invoke-McpTool`): remove the now-unreachable no-`.result` guard
   - Verify: `cd mcp-server && npm test` clean; manual round-trip `Invoke-McpRequest` against a known 401 to confirm the throw fires with diagnostic context
   - Commit message: `fix(mcp): close BL-032.25 § 4 — DEPLOY bash setup + Invoke-McpRequest fails loudly on HTTP errors`
3. **§ 1 deferred** until BL-032.75 Phase 2 closes — re-surface as a Phase 2 close-out agenda item; no action this cycle
4. **§ 3 deferred** until reproduction-script construction is timed with BL-032.75 Phase 2a/2c — the metric emitters from Phase 2a will give the reproduction script free recurrence detection

### Risk callouts (pre-emption)

- **§ 2 — interaction with auth.test.ts**: changing the conditional in bearer.ts requires updating the existing integration test at auth.test.ts:73-89 to pin the message. If the test update is missed, the test will still pass (current assertion `expect(body.message.length).toBeGreaterThan(0)` is satisfied by either message), creating a silent gap. Pair the bearer.ts edit with the test edit in the same commit
- **§ 4 (b) — caller audit before refactor**: any internal soak script that did `($resp = Invoke-McpRequest ...); if ($resp -is [Microsoft.PowerShell.Commands.WebResponseObject]) { ... }` (reads the raw response) breaks under the throw refactor. Audit before shipping: search `mcp-server/` and `src/docs/` for `Invoke-McpRequest` callers and review for response-type assumptions. Operator has confirmed no external callers
- **§ 4 (a) — verifying the hidden-prompt pattern**: a `read -rsp` block has subtle quoting hazards in bash vs zsh and copy-paste from PDF readers. Test the new block in a fresh shell before committing
- **§ 1 — when the audit eventually runs**: if it returns finding B (lazy modeling), BL-031.87 is no longer the canonical answer for stage taxonomy. Update BL-031.87's status from Closed to Superseded and add a redirect note. Do NOT delete BL-031.87's content — it's the historical record of why the adapter pattern was chosen
- **§ 3 — reproduction not landing in CI**: when the bug is reproduced + fixed, ADD a stdio-transport stress test under `mcp-server/tests/integration/diligence-handler.stdio.test.ts` that exercises the worst-case input combo end-to-end. Without this, the regression door stays open

---

_Last updated: 2026-05-13 — post-Go-Live re-investigation + first close-out wave. § 2 (commit `e97650d`) and § 4 (commit `170f1d0`) closed; § 1 deferred until BL-032.75 Phase 2 closes; § 3 blocked on reproduction-script construction (timed with BL-032.75 Phase 2a metric emitters). Two P1 items remain open in the bucket._
