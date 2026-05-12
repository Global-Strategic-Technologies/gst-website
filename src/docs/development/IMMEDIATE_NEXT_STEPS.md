# Immediate Next Steps — BL-032 to BL-033 sequencing

> **Authored**: 2026-05-12
>
> **Purpose**: snapshot of the operational path from "BL-032 substrate is shipped" to "BL-033 first pilot client onboarded." Captures the agreed phase ordering, what closes each phase, who does what, and the cross-cutting open items along the way.
>
> **Expected to age**: each phase has its own initiative doc with deeper detail; this doc is the single-page glue. Update or supersede as phases close. The companion sources of truth (referenced throughout) carry the canonical detail.
>
> **Companion docs**:
>
> - [BACKLOG.md](./BACKLOG.md) — all open initiatives with acceptance criteria
> - [MCP_SERVER_REMOTE_BL-032.md](./MCP_SERVER_REMOTE_BL-032.md) — BL-032 architecture + phases
> - [MCP_SERVER_REMOTE_BL-032_25.md](./MCP_SERVER_REMOTE_BL-032_25.md) — soak-finding triage bucket
> - [MCP_SERVER_OBSERVABILITY_BL-032_75.md](./MCP_SERVER_OBSERVABILITY_BL-032_75.md) — production observability detail
> - [BL-032_TESTING_FINDINGS.md](./BL-032_TESTING_FINDINGS.md) — soak findings + remediation evidence
> - [`REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) — consumer setup including system-prompt addendum
> - [`DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) — operator runbook (initial setup, first deploy, ongoing operations)

## Current state (as of 2026-05-12)

- BL-032 substrate code: shipped. All 417 MCP tests pass; typecheck clean.
- Pre-production Critical-gate: empty. Both K-section entries closed with engineering remediation stanzas.
- BL-032.25 (soak-finding bucket): zero P0 items. § 5 closed risk-accepted; § 1-4 P1-deferred per established convention.
- Validation sequence step 7 (soak triage): ✅. Step 8 (`wrangler deploy --env production`): ⏳ — the only literal blocker remaining.
- Six commits on `feature-mcp1` not yet pushed (`e7a1457`, `02441fe`, `34a499e`, `02af72f`, `62d155a`, `18ddb6c`).

## The path: BL-032 → BL-032.5 + BL-032.75 → BL-033

The intended order has two parallel-feasible mid-phases between BL-032's substrate ship and BL-033's external-pilot kickoff:

```
BL-032 → production (Phase 1)
   │
   ├──► BL-032.75 instrumentation → 10-14 day baselining → dashboards/alerts (Phase 2)
   │
   └──► BL-032.5 Resources & Prompts on remote (Phase 3)
                                           │
                                           ▼
                              External-pilot readiness gate (Phase 4)
                                           │
                                           ▼
                                   BL-033 begins (Phase 5)
```

Phases 2 + 3 can run in parallel — they touch different code surfaces (observability + metric emitters vs. Resource/Prompt registration over remote HTTP). Sequential is lower context-switching cost; parallel cuts overall calendar time roughly in half.

---

## Phase 1 — BL-032 production deploy

**What it is**: cut the staging Worker over to production. Substrate, auth model, rate limit, Tools surface, and Sentry wiring carry over identically.

**Operator actions**:

1. Push the six unpushed commits to `origin/feature-mcp1` (PR route) OR merge `feature-mcp1` → `master` and deploy from there. Either path is fine; this is internal-only.
2. Run `wrangler deploy --env production` from `mcp-server/`. `wrangler.toml` already has the production stanza wired with `custom_domain = true`.
3. Smoke-test the production URL with one curl against `/health` and one MCP `tools/list`. [DEPLOY.md](../../../mcp-server/src/docs/operations/DEPLOY.md) Part B § B.5-B.6 is the authoritative runbook.
4. Update [REMOTE_CLIENT_SETUP.md](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) URLs from `mcp-staging.globalstrategic.tech` to `mcp.globalstrategic.tech` once Phase 6 wires the production hostname.
5. Re-run T.E.11 + T.E.12 against the deployed Worker with `SENTRY_DSN` bound — they flip to PASS now that captureMessage is wired (commit `62d155a`). This validates the engineering work shipped during the soak.

**One-week post-deploy review** ([BACKLOG.md:885](./BACKLOG.md)): scheduled for ~2026-05-13. Internal team uses the production Worker for a week; any new findings get filed under BL-032.25 as ongoing follow-ups. After that week, BL-032 itself can formally close.

---

## Phase 2 — BL-032.75 Production Observability Maturity (3-5 weeks)

**What it is**: instrument the Worker so SLO baselines can be measured from real traffic, then build dashboards + alerts against those baselines.

**Why it must precede BL-033**: pilot SLA paper commits to "99.5% monthly uptime, p95 <500ms" which requires measured baselines, not guesses. BL-032.75's design rationale: _"putting observability inside BL-033 would force 'guess at SLO targets, then commit them to legal paper' — exactly the sequence that produces broken contracts."_

**Why it can't precede BL-032 production deploy**: the 10-14 day baselining window requires real production traffic to set defensible numbers.

### Phase 2a — Instrumentation (1 sprint engineering)

- Typed metric emitters in `mcp-server/src/metrics/` for: `tool_invocation`, `resource_read`, `prompt_invocation`, `prompt_tool_fanout`, `rate_limit_decision`, `inoreader_call`, `radar_snapshot_age`, `health_check_duration`
- Tool / Resource / Prompt registry decorators auto-emit (no per-handler boilerplate)
- Cloudflare Analytics Engine binding in `wrangler.toml` (`env.METRICS`)
- Cardinality budget per metric documented + CI test that caps emission to prevent dimension explosion
- Vitest test asserts every Tool/Resource/Prompt emits at least one metric event in a representative invocation

### Phase 2b — Baselining (10-14 day window, mostly passive)

- Instrumented build runs with normal team usage
- Weekly traffic data extracts produce `mcp-server/observability/slo-baselines.md` with measured p50/p95/p99 per Tool/Resource/Prompt
- Senior-engineer review sets SLO targets at `p95-baseline × 1.5` buffer
- All SLO definitions captured: non-radar Tool availability, non-radar Tool latency p95, radar latency cold/warm, Resource latency, health-endpoint availability, Inoreader budget consumption, radar snapshot freshness

### Phase 2c — Dashboards, alerts, runbooks (3-5 days engineering)

- `mcp-server/observability/grafana-dashboard.json` covering traffic, latency histograms, error rates, rate-limit pressure, Inoreader budget burn-down
- `mcp-server/observability/alert-rules.yaml` covering every SLO from baselining
- Slack webhook + PagerDuty integration; test-fired with a synthetic SLO breach (5% injected error rate); alert lands within 5 min
- Runbooks for the four canonical alerts: `inoreader-budget-exhausted.md`, `radar-snapshot-stale.md`, `health-check-failing.md`, `traffic-spike-detected.md`
- Status page at `https://status.mcp.globalstrategic.tech` (Cloudflare Pages + signed Analytics Engine query) — initially internal-IP-restricted; BL-033 reviews and chooses what becomes externally visible

### Plus the K-section evidence-driven mitigations sub-section

Still open under BL-032.75 ([BACKLOG.md K-section sub-section](./BACKLOG.md)) — bite-sized work shippable independently of the broader instrumentation:

| Item                                                  | Status                      | Effort |
| ----------------------------------------------------- | --------------------------- | ------ |
| Sentry captureMessage wiring (T.E.11/E.12)            | ✅ Shipped commit `62d155a` | —      |
| `/health` write-then-delete probe (T.X.2)             | Open                        | 1 hour |
| `oldestItemDaysAgo` on radar response (T.K.1.10)      | Open                        | 30 min |
| `triggerQuestionAnswered` on ICG (T.K.2.b.4)          | Open                        | 20 min |
| ICG accounting math fix (T.K.2.c.3 + c.5)             | Open                        | 1 hour |
| BL-040 `search_regulations` array filters (candidate) | Open                        | 1 day  |

---

## Phase 3 — BL-032.5 Resources & Prompts on remote (3-5 days, parallel-feasible)

**What it is**: bring Library articles, Regulation frameworks, Radar snapshots Resources + consultant Prompts (`gst_*`) to the Cloudflare Worker. They already work on local stdio (per BL-031.5 / BL-031.75); BL-032.5 makes them work on the remote HTTP endpoint too.

**Why it must precede BL-033**: external-pilot use cases — _"Mobile prep before a partner call"_, _"Field consulting with no repo access"_, _"Regulatory review with cross-jurisdictional pinning"_ — all require Resources/Prompts reachable over remote HTTP. A pilot client on Claude mobile can't use a local stdio connector.

**Why it can run in parallel with Phase 2**: different code surfaces. Phase 2 touches `mcp-server/src/metrics/` and the registry decorators; Phase 3 touches `mcp-server/src/resources/` and `mcp-server/src/prompts/` + their Worker-side registration. No file collisions.

**Scope** ([BL-032.5 outcomes at BACKLOG.md:1019-1024](./BACKLOG.md)):

- All Resources + Prompts reachable on remote with byte-identical content vs. stdio (URI-stability test enforces this)
- Radar snapshot refreshed hourly via Worker Cron (~24 Inoreader calls/day from the 200/day budget)
- HTTP cache hit rate ≥80% on Library + Regulation Resources after one week (most reads served from Upstash without invoking the handler)
- Per-key scope checks: a key without `resource:radar:read` returns 403 for radar URIs with a structured error
- Prompt fan-out budget verified: `gst_target_quick_look` (4 Tools) lands inside the per-key burst allowance from a fresh-quota state

**Use cases that come online when this ships**:

- Pin `gst://library/vdr-structure` into a mobile Claude conversation before a partner call
- Run `/gst_target_quick_look` from a borrowed laptop at a client site
- Pin `gst://regulations/eu/gdpr` + `gst://regulations/us/ca/ccpa` in a cross-border deal review

---

## Phase 4 — External-pilot readiness gate (decision point, no engineering)

When Phases 2 + 3 are both complete (both initiatives' acceptance criteria green), the readiness gate has:

- ✅ Measured SLO baselines (defensible numbers for the pilot SLA)
- ✅ Resources + Prompts reachable over the same remote endpoint as Tools
- ✅ Dashboards + alerts + runbooks operational
- ✅ Status page live
- ✅ One-week post-deploy review of BL-032 closed
- ✅ BL-032.25 P1 items either resolved, re-filed under BL-034 doc cleanup, or formally cancelled (§ 1 schema normalization has a clean revisit-criteria path; § 2-4 are bundle-able)

This is the gate to begin BL-033 design discussions. Until this point, BL-033 is on hold — its SLA paper can't be defended without baselines, and its use cases can't be served without Resources on remote.

---

## Phase 5 — BL-033 External Pilot (2 weeks engineering + indeterminate legal/sales)

The big initiative. From [BL-033 in BACKLOG.md](./BACKLOG.md):

**Authentication & authorization rewrite** — OAuth 2.1 + PKCE replaces the bearer-token model from BL-032. Per-client `client_id` + `client_secret` with Argon2id hashing in Upstash. Tool-level scopes (`tool:generate_diligence_agenda`, etc.). Per-client rate-limit tiers. **Bearer-comparison constant-time hardening** ships here too (the T.A.15 / T.I.5 finding filed during the BL-032 soak).

**Audit logging** — compliance-grade, append-only, 7-year retention, hash-chain integrity attestation. Cloudflare Queue → R2 with object-lock. Per-client signed-URL export for SIEM ingestion.

**Prompt-injection hardening** — output sanitization for zero-width chars, bidi overrides, prompt-injection sentinels. `_provenance` field on every tool output. 64KB max output size with cursor pagination. Security review via `/security-review` or independent firm.

**Pilot operations** — onboarding playbook, sandbox environment with synthetic data, status page extension, **regional latency assessment + remediation** (the T.H.4 / T.H.6 finding filed during the soak), SLA contractually committed at 99.5% uptime / p95 <500ms.

**Sales / legal / pilot conversion** — 2 design-partner PE firms onboarded, NDAs + DPAs + SLA paper executed, listed in MCP directories (Anthropic registry, MCPMarket.com, Cursor catalog), pen test by independent firm before public listing. The legal piece is typically the long pole.

---

## Cross-cutting open items along the way

| Item                                          | When it surfaces                       | Notes                                                                                                                                                                                                                  |
| --------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BL-031.87 benchmark-audit spike**           | Post-deploy (BL-032.25 § 1 recommends) | 2-4 hours. Determines whether `pre-series-b` / `series_bc` collapses are by-design or lazy modeling. Outcome drives whether schema normalization happens (cancel § 1 if by-design; graduate to scheduled work if lazy) |
| **BL-038 radar rate-limit tier enforcement**  | Before BL-033 ships                    | Ensures per-key radar tier enforcement (5/min, 50/day separate from non-radar). Already filed in BACKLOG                                                                                                               |
| **BL-039 Worker as Inoreader refresh-writer** | Anytime; nice-to-have for BL-032.5     | Eliminates the website-side ISR dependency for radar token refresh. Filed 2026-05-12                                                                                                                                   |
| **BL-034 MCP doc cleanup**                    | End of the BL-031.x → BL-033 sequence  | Rolling consolidation of transitional scaffolding. BL-032.25 § 4 (T.X.1 polish) bundles cleanly here                                                                                                                   |
| **BL-032.25 P1 items closure**                | Anytime during baselining window       | § 2 (T.A.4 empty-bearer) and § 3 (T.K.2.b.3 stdio timeout) are small enough to bundle into Phase 2c work; § 4 (T.X.1) bundles with BL-034; § 1 (schema norm) follows benchmark-audit outcome                           |

---

## Decision points

These are the choices that gate the next move:

1. **Push the six local commits and run `wrangler deploy --env production`** — unblocks everything else
2. **Re-run T.E.11 + T.E.12** against the deployed Worker with `SENTRY_DSN` bound — closes the last two literal FAILs in the soak
3. **Timing of Phase 2a instrumentation** — start now while soak experience is fresh, or wait until BL-032's one-week post-deploy review closes (~2026-05-13)?
4. **Phase 2 + Phase 3 ordering** — parallel cuts overall calendar time roughly in half; sequential is lower context-switching cost
5. **Schedule the BL-031.87 benchmark-audit spike** — 2-4 hours of someone with ICG/TechPar dataset expertise. Outcome unblocks BL-032.25 § 1 closure either way

**Recommendation**: start Phase 2a (instrumentation) in parallel with the BL-032 one-week post-deploy review so the team is collecting baseline data from day 1 of post-deploy traffic. The instrumentation work doesn't need the review to close — it ships independently and starts paying dividends immediately.

---

_Last updated: 2026-05-12 — initial authoring at end of BL-032 staging soak + pre-production-gate closure. Update or supersede as phases close._
