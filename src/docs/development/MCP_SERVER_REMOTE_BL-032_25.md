# BL-032.25 — MCP Revisions prior to Go-Live: Per-Item Implementation Plan

> **Source**: BL-032.25 — bucket for soak-findings discovered during BL-032 § B.5 (staging soak window 2026-05-06 → ~2026-05-13)
>
> **BACKLOG entry**: [BL-032.25 in BACKLOG.md](./BACKLOG.md#bl-03225-mcp-revisions-prior-to-go-live)
>
> **Status**: Open — soak in progress; items added as discovered. § 1 authored at initiative-creation time as the anchor finding (schema normalization → adapter retirement question)
>
> **Companion docs**:
>
> - [BL-032 design doc](./MCP_SERVER_REMOTE_BL-032.md) — substrate this initiative responds to
> - [BL-031.87 design doc](./MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) — the original adapter-pattern decision § 1 revisits
> - [BL-032 Soak-Week Testing Playbook](./MCP_SERVER_REMOTE_BL-032_TESTING.md) — primary source of findings populating this doc

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

### Closure stanza placeholder

(Closure stanza added when this item is formally resolved — either by execution after a trigger fires, or by formal cancellation if BL-033 scope confirms the adapter pattern is BL-033-acceptable too.)

---

## § 2 — T.A.4 empty-bearer error message (P1)

### Status

- **Authored**: 2026-05-12 (filed retroactively from soak findings during BL-032.25 closure audit)
- **Severity**: **P1** — cosmetic error-disambiguation gap; correct status code returned, only the human-readable message is imprecise
- **Recommendation**: defer; ship B.6 as-is; revisit if external pilot (BL-033) compliance review flags the message
- **Investigation evidence**: this section
- **Closure stanza**: [pending]

### What it asks

A request with `Authorization: Bearer ` (empty token after the scheme) returns `HTTP 401` with body `{"error":"unauthorized","message":"Authorization header must use Bearer scheme"}`. The status code is correct; the message is wrong — it suggests the scheme was rejected when in fact the scheme parsed fine and the token slot was empty.

### Investigation findings

- Reproduction: [TESTING_FINDINGS § T.A.4](./BL-032_TESTING_FINDINGS.md#ta4--empty-bearer-schema)
- Likely site of fix: [`mcp-server/src/auth/bearer.ts`](../../../mcp-server/src/auth/bearer.ts) — the scheme-validation branch fires on empty token because the value-extraction step probably returns the empty string for `Bearer ` (single trailing space) and an earlier check rejects the falsy value
- No leak / no auth bypass surfaced — the 401 is returned correctly, only the disambiguation in the response body is off

### Plan

P1, deferred. Trivial fix: add an empty-after-trim check between the scheme-parse and the token-lookup so the empty case returns `"Authorization header has empty Bearer token"` (or similar). Estimated effort: 30 min including a unit test. Not blocking B.6.

### Recommendation

Defer. The defect is cosmetic — an attacker probing with `Bearer ` learns the same thing they learn from `Bearer wrong-value` (the request was rejected). The message imprecision only matters for legitimate operators debugging their config, and the operator workflow already proves itself out in T.A.5 / T.A.6.

### Closure stanza

(Pending — fix-time.)

---

## § 3 — T.K.2.b.3 local stdio diligence timeout (P1)

### Status

- **Authored**: 2026-05-12 (filed retroactively from K-section soak)
- **Severity**: **P1** — affects only the local stdio connector path for one tool; staging (remote HTTP) completed normally; Claude Desktop's transparent fallback recovered the user-facing workflow
- **Recommendation**: defer; schedule an investigation when stdio-only consumption becomes a higher-volume path
- **Investigation evidence**: this section
- **Closure stanza**: [pending]

### What it asks

A Claude Desktop call to `gst:generate_diligence_agenda` over the local stdio connector hung for the full 4-minute Desktop timeout, while the same call over the remote staging connector completed in normal time. Other local stdio tool calls in the same session (`list_portfolio_facets`, `search_portfolio`) worked fine — so the defect is tool-specific, not connector-level.

### Investigation findings

- Reproduction: [TESTING_FINDINGS § T.K.2.b.3](./BL-032_TESTING_FINDINGS.md#tk2b3--generate_diligence_agenda)
- Three live hypotheses:
  1. Large JSON response (20 questions × full-text rationale + 4 attention areas + trigger map ≈ 5-8 KB serialized) overflowing the stdio buffer in `mcp-server/dist/index.js` or in Desktop's stdio reader
  2. `generateScript()` engine has a slow path triggered by the specific input combo used in K.2.b.3 (`growthStage: scaling, geographies: ['us', 'eu'], dataSensitivity: high` etc.)
  3. stdio child-process deadlock — Worker or Desktop reads/writes blocking on each other for this response shape
- Diagnostic next step: rerun the same call directly via `node mcp-server/dist/index.js` with the exact JSON request body from the K.2.b.3 transcript, instrumented for engine-side timing. If the engine returns fast, the issue is stdio transport; if the engine itself hangs, it's a logic bug

### Plan

P1, deferred. Stdio-only consumers exist (Claude Code, single-machine workflows) but Claude Desktop's transparent fallback to the remote staging connector makes this latent for Desktop users. Investigation effort estimated 2-4 hours including narrowing to root cause; remediation depends on which hypothesis fires.

### Recommendation

Defer. Two reasons: (1) the user-facing workflow recovered via Desktop's fallback, and (2) the K-section soak captured only one instance — possible flake, possible specific-input-only. Re-prioritize if the bug reproduces on a different input, or if Claude Code (no fallback) usage of `generate_diligence_agenda` increases.

### Closure stanza

(Pending — investigation-time.)

---

## § 4 — T.X.1 secondary playbook polish (P1)

### Status

- **Authored**: 2026-05-12 (filed retroactively from soak; two follow-ups noted in T.X.1's Notes that weren't formally tracked)
- **Severity**: **P1** — both are operator-experience polish; T.X.1's primary fix (PowerShell placeholder replaced with `Read-Host`) already shipped in commit `3bacd0e`
- **Recommendation**: defer until next operator-facing doc revision pass
- **Investigation evidence**: this section
- **Closure stanza**: [pending]

### What it asks

T.X.1's resolution surfaced two adjacent follow-ups that didn't make the original fix:

1. The bash equivalent in [`DEPLOY.md` § B.3](../../../mcp-server/src/docs/operations/DEPLOY.md) may have the same literal-placeholder hazard the PowerShell setup snippet did; review and convert to `read -s MCP_KEY` if so
2. The `Invoke-McpRequest` helper's SSE-only parser silently returns the raw HTTP response when the body isn't SSE (e.g., a 401 returns JSON, which the parser doesn't recognize and falls through). Operators running `(call).result.foo` get `$null` with no obvious cause. Either raise a clearer error on non-2xx OR document the diagnostic incantation (`$resp.GetType()` + `$resp.Content.Substring(0,200)`) prominently in the playbook's "How to use this doc" section

### Investigation findings

- Source: [TESTING_FINDINGS § T.X.1](./BL-032_TESTING_FINDINGS.md#tx1--setup-snippet-placeholder-is-a-copy-paste-trap), Notes section, points 1 and 2
- Both items are doc / helper changes, not server-side code

### Plan

P1, deferred. Each item ~15-30 min on its own. Best bundled with the next operator-doc revision pass.

### Recommendation

Defer. Bundle with BL-034 (MCP doc cleanup) if convenient.

### Closure stanza

(Pending — fix-time.)

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

_Last updated: 2026-05-12 — soak findings § 2–§ 5 filed during BL-032.25 closure audit. § 1 (schema normalization, P1 deferred) remains the anchor finding._
