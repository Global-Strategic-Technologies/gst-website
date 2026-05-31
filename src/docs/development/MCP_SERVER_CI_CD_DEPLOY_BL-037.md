# MCP Server — CI/CD Deploy Workflows (BL-037)

> **Backlog initiative**: [BL-037: MCP Server — CI/CD Deploy Workflows](BACKLOG.md#bl-037-mcp-server--cicd-deploy-workflows)
>
> **Companion docs**:
>
> - [DEVELOPER_TOOLING.md](DEVELOPER_TOOLING.md) — the canonical reference for the project's local + CI tooling chain. BL-037 extends this doc with a new "Deploy chain" subsection; it does NOT redefine the existing test gate (`astro check` / `lint` / `lint:css` / `test:run`), which remains intact and continues to gate deploy.
> - [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) — the current operator-direct deploy runbook. BL-037 reframes it as **CI-default + operator-emergency-fallback**, NOT a replacement. Part A (one-time setup) and Part C (ops) remain authoritative; Part B (first deploy) gains a CI-driven companion path.
> - [BL-033 stanza in BACKLOG.md](BACKLOG.md#bl-033) — Phase B's required-reviewer gate earns its keep only once external consumers depend on the surface (the BL-033 ramp).
> - [`mcp-server/scripts/deploy.mjs`](../../../mcp-server/scripts/deploy.mjs) — existing cross-platform deploy wrapper. **CI calls this script unchanged**; the workflow's job is to provide the right env vars (`SENTRY_AUTH_TOKEN`, Cloudflare credentials) and run `npm run deploy:<env>`.
>
> **Predecessors**: BL-032 soak closure (must close before Phase A ships — soak velocity depends on operator-direct iteration).
>
> **Sequels**: none filed. Phase D is in-scope-but-deferred per the BACKLOG stanza.
>
> **Scope boundary** — explicit: BL-037 covers the **MCP Worker only** (`mcp-server/**`). The GST website (Astro) is auto-deployed by Vercel on push to `master`; Vercel's preview deploys cover PR validation. **The website's deploy chain is out of scope** and BL-037 introduces no changes to it. The two surfaces remain independent.
>
> **Status**: Open · Phase A practically unblocked. **Truth-pass note 2026-05-31**: BL-032 substrate is in production (`mcp.globalstrategic.tech` live since 2026-05-12 per IMMEDIATE_NEXT_STEPS.md), and downstream Phase B/C/D dependencies on it are honored across BL-032.5/.7/.75/.76/.77/.8 (all shipped to master). The BL-032 BACKLOG stanza itself still carries "Closure pending soak finalization + production deploy + sibling-doc closure pass per BL-034" language — that's BACKLOG truth-debt to be picked up by the BL-034 doc-cleanup pass, not a real Phase-A blocker. Phase B pre-conditioned on BL-033 ramp. Phase C independent. Phase D optional / deferred.

---

## Context — why this earns an initiative

The BL-032 soak (Apr–May 2026) deliberately chose **operator-direct deploys** as the steady-state pattern: an operator runs `npm run deploy:staging` from `mcp-server/`, wrangler authenticates against the operator's local `wrangler login` session, and `scripts/deploy.mjs` handles GIT_SHA injection plus an optional source-map upload to Sentry. That choice was right for soak — iteration speed beat process maturity when the surface was being shaped weekly.

Soak is closed. The calculus changes on three axes:

1. **Auditability** — "Reid pushed at 4pm Friday" is acceptable while the only consumer is Reid. BL-033 introduces external pilot consumers; the first compliance review will ask "show me who deployed when, gated on what." A CI run + a reviewer's approval answers that; an operator's shell history does not.
2. **Secret hygiene** — the Cloudflare API token sits on every operator laptop today via `wrangler login`. Moving the production credential into GitHub Secrets shrinks the attack surface from "any compromised laptop" to "any compromised CI runner with that secret bound" — strictly smaller.
3. **Source-map upload** — `scripts/deploy.mjs` already calls `sentry-cli` to upload source maps after a successful wrangler deploy, BUT only if `SENTRY_AUTH_TOKEN` is present in the shell env. Operator-direct deploys today emit the warning `SENTRY_AUTH_TOKEN not set — skipping source-map upload`. CI runs the same script with the token bound from GitHub Secrets, so every CI-driven deploy resolves Sentry traces to readable TypeScript — a real debugging tax once BL-033 surfaces incidents.

The operator-direct path stays valid as the **emergency fallback** for the case where GitHub Actions is down or the deploy must happen with no human-in-the-loop. Every phase below acknowledges this.

---

## Decisions

| Decision                                      | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Scope boundary**                            | MCP Worker only (`mcp-server/**`). The website's Vercel auto-deploy chain is untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Operator-direct preservation**              | The `npm run deploy:staging` / `:production` scripts and the [DEPLOY.md § B](../../../mcp-server/src/docs/operations/DEPLOY.md) runbook remain valid, documented, and tested as the emergency fallback. CI is additive, not exclusive.                                                                                                                                                                                                                                                                                                                                               |
| **Sentry source-map upload site**             | Reuse `scripts/deploy.mjs` as-is. The workflow binds `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` as env on the deploy step; the script's existing branch handles the rest. **Do NOT introduce `getsentry/action-release`** — it would split source-map ownership across two surfaces and reopen drift risk.                                                                                                                                                                                                                                                                    |
| **Cloudflare credential source**              | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as repository-scoped GitHub Secrets, injected via `cloudflare/wrangler-action@v3` inputs (`apiToken`, `accountId`) **— input names verified via Context7 at design time 2026-05-30 against the action's upstream README; confirm against the pinned major version at implementation time in case the action ships a v4 with renamed inputs**. Token must carry only the **Workers Scripts: Edit** + **Account Analytics: Read** + zone-edit-for-mcp-routes scopes — narrower than the admin token a `wrangler login` session holds. |
| **wrangler-action vs raw `npm run deploy:*`** | Use `cloudflare/wrangler-action@v3` for credential injection ONLY (`apiToken`, `accountId`), then call `npm run deploy:<env>` via `command: ...`. This preserves `deploy.mjs` as the single source of truth for what "deploy" means (GIT_SHA, SENTRY_RELEASE, source-map upload). The action is a credentials bridge, not the deploy logic.                                                                                                                                                                                                                                          |
| **Required-reviewer gate trigger**            | Phase B only. Implemented via a GitHub Environment named `mcp-production` with ≥1 required reviewer. Staging does NOT require a reviewer — push to long-lived feature branches must deploy immediately to keep the inner loop fast.                                                                                                                                                                                                                                                                                                                                                  |
| **Smoke-probe timeout**                       | 60 seconds total (10 retries × 6s sleep). Failure mode = workflow fails red; deploy is NOT auto-rolled-back (operator decides — see Risks § "smoke-probe failure semantics").                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Phase D secret-manager target**             | TBD — open question. Candidates: 1Password Connect, Doppler, AWS Secrets Manager. Decision deferred until Phase D is actually scheduled.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Test gate is unchanged**                    | The existing `test.yml` workflow already runs `npx astro check && lint && lint:css && test:run` on every push. Deploy workflows MUST NOT re-run these tests — they read the merge commit's check status and gate on it. Duplication = wasted CI minutes + a path for tests to "pass on deploy but fail on PR" drift.                                                                                                                                                                                                                                                                 |

---

## Architecture — gating + deploy + smoke

```
git push origin <branch>
   │
   ▼
┌──────────────────────────────────┐
│ existing test.yml workflow        │ ← unchanged; the AUTHORITATIVE test gate
│  - astro check                    │
│  - eslint + stylelint             │
│  - vitest run                     │
│  - playwright (chromium)          │
└─────────────┬────────────────────┘
              │
              │ check status: success
              ▼
┌──────────────────────────────────┐
│ NEW: deploy-mcp-<env>.yml         │ ← waits for tests via `workflow_run`
│  trigger: push + branch + path    │   OR explicit `needs:` gate
│  filter (mcp-server/**)           │
│                                    │
│  job: deploy                       │
│   ├─ checkout                      │
│   ├─ setup-node + npm ci (root +   │
│   │  mcp-server)                   │
│   ├─ wrangler-action@v3            │
│   │   apiToken: ${{ secrets.CF_*}} │
│   │   accountId: ${{ secrets.CF_*}}│
│   │   command: run deploy:<env>    │ ← invokes scripts/deploy.mjs
│   │   workingDirectory: mcp-server │
│   │   env: SENTRY_AUTH_TOKEN …     │ ← bound for sentry-cli upload
│   ├─ smoke-probe step              │
│   │   curl /health → assert gitSha │
│   │   matches GITHUB_SHA (short)   │
│   └─ post-result (Phase B only)    │
└──────────────────────────────────┘
```

---

## Per-phase design

### Phase A — Staging auto-deploy on push (~half-day)

**Trigger**

- Event: `push`
- Branches: `feature-mcp1`, `dev` (the two long-lived branches the operator uses for staging deploys today)
- Paths: `mcp-server/**` (unrelated commits to docs / website source must not redeploy the Worker)

**Workflow structure** (skeleton; real YAML lands at implementation time)

| Step                            | Purpose                                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions/checkout@v4`           | Default fetch-depth=1 is fine; `deploy.mjs` only needs `git rev-parse --short HEAD`.                                                                                                                            |
| `actions/setup-node@v4`         | Node 22 LTS to match the engines field.                                                                                                                                                                         |
| `npm ci` (root)                 | Install root devDeps (needed because `mcp-server/` resolves some via workspace hoisting).                                                                                                                       |
| `npm ci --prefix mcp-server`    | Install mcp-server devDeps including wrangler + `@sentry/cli`.                                                                                                                                                  |
| `cloudflare/wrangler-action@v3` | Bind credentials and invoke `npm run deploy:staging` via `command`. `workingDirectory: mcp-server`. Pass `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` via the step's `env:` so `deploy.mjs` picks them up. |
| **Smoke probe**                 | Inline shell (or a small Node script) that polls `https://mcp-staging.globalstrategic.tech/health` up to 10×6s, asserts `gitSha` matches `${GITHUB_SHA::7}`. Fails the workflow if not matched within 60s.      |

**Required secrets** (under repo → Settings → Secrets and variables → Actions)

| Secret                  | Source                                                                                                                     | Purpose                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare dash → My Profile → API Tokens → custom (Workers Scripts: Edit, Workers Routes: Edit on `globalstrategic.tech`) | Wrangler auth.                                   |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dash → right sidebar of any zone                                                                                | Wrangler account binding.                        |
| `SENTRY_AUTH_TOKEN`     | sentry.io → Organization Settings → Auth Tokens (scope: project:releases, project:write)                                   | source-map upload in `deploy.mjs`.               |
| `SENTRY_ORG`            | Org slug (`gst-7o`) — could be a `vars.` not a `secrets.` since it's non-sensitive                                         | optional override; defaults inside `deploy.mjs`. |
| `SENTRY_PROJECT`        | Project slug (`gst-mcp-server`) — same non-sensitive note                                                                  | optional override; defaults inside `deploy.mjs`. |

**Smoke-probe contract**

- Endpoint: `GET /health` on the deployed URL.
- Field asserted: `gitSha` equals the first 7 chars of `GITHUB_SHA`.
- Timeout: 60s total (10 retries, 6s sleep between).
- Failure mode: workflow exits non-zero (fails red). **No auto-rollback** — see Risks.

**Rollback hook** — none in Phase A. If a staging deploy lands bad code, the operator runs `npx wrangler rollback --env staging <version-id>` directly (Phase C automates this). The staging URL is also non-customer-facing during Phase A, so the cost of a transient bad deploy is low.

---

### Phase B — Production deploy on merge to master (~half-day, shipped 2026-05-31)

**Closure note 2026-05-31**: shipped via `.github/workflows/deploy-mcp-production.yml`. The original "after BL-033 ramp" deferral was reconsidered — the BL-033 dependency was about the VALUE of the reviewer gate (highest with external consumers), not about the deploy plumbing being impossible to ship. Per CLAUDE.md § 4a "no deferred tech debt," shipped now with the reviewer gate enabled by default (single-operator approval); the gate scales naturally when BL-033 expands the reviewer pool. Without Phase B, every master merge that touches MCP source still required manual `npm run deploy:production` from the operator's laptop — that's exactly the friction BL-037 was scoped to remove.

**Trigger**

- Event: `push`
- Branches: `master` only
- Paths: `mcp-server/**`

**Workflow structure** — identical to Phase A's job graph, plus:

| Differentiating element     | Implementation                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub Environment**      | Job uses `environment: mcp-production`. The environment is configured in repo Settings with **Required reviewers** ≥ 1 (the operator pool; expand as BL-033 ramps).                                        |
| **Branch protection**       | Production workflow only runs on the `master` ref — even an accidental `push --force` to a wrong branch can't trigger it. Validate via `if: github.ref == 'refs/heads/master'` on the job.                 |
| **Notification on failure** | Failure step (`if: failure()`) posts to Slack via webhook OR opens a GitHub Issue tagged `incident:mcp-prod-deploy`. Pick one at implementation time (Slack preferred if a webhook secret already exists). |
| **Smoke probe**             | Same shape as Phase A but against `https://mcp.globalstrategic.tech/health`.                                                                                                                               |

**Required secrets** — same as Phase A. The `mcp-production` Environment can bind its OWN copies of the secrets if we want to enforce that production credentials never leak into staging logs (defense-in-depth; recommended).

**Smoke-probe contract** — same shape as Phase A. On failure, the deploy IS already in the Worker (wrangler-action's `deploy` step succeeded); workflow failure surfaces the smoke gap but does not roll back. Operator decides: re-deploy a fix or invoke `rollback-mcp.yml` (Phase C).

**Rollback hook** — production rollback is the explicit value prop of Phase C; this phase only fails-noisy.

---

### Phase C — Rollback automation (~half-day)

**Trigger**

- Event: `workflow_dispatch` only (manual trigger from Actions tab or `gh workflow run`).
- Inputs:
  - `environment` (required, choice: `staging` | `production`)
  - `version-id` (required, string — Cloudflare Worker deployment ID)
  - `reason` (optional, string — recorded in the workflow run summary for the audit trail)

**Workflow structure**

| Step                                      | Purpose                                                                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions/checkout@v4`                     | Need `wrangler.toml` + `mcp-server/` workspace.                                                                                                                                                                   |
| `actions/setup-node@v4` + `npm ci`        | Install wrangler.                                                                                                                                                                                                 |
| Echo `reason` into `$GITHUB_STEP_SUMMARY` | Audit trail.                                                                                                                                                                                                      |
| `cloudflare/wrangler-action@v3`           | `command: rollback --env ${{ inputs.environment }} ${{ inputs.version-id }}`, `workingDirectory: mcp-server`.                                                                                                     |
| Smoke probe (10× 6s)                      | Same `/health` shape as Phase A/B, asserts `gitSha` matches the rollback target's SHA (which the operator records alongside `version-id` per [DEPLOY.md § C](../../../mcp-server/src/docs/operations/DEPLOY.md)). |

**Required secrets** — `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. Sentry secrets are NOT needed — a rollback restores a prior Worker bundle whose source maps were already uploaded by the original deploy.

**Required reviewer gate** — `environment` input controls which GH Environment the job binds:

- `staging` → no environment / no reviewer.
- `production` → `environment: mcp-production-rollback`, with the same reviewer list as Phase B.

**Smoke-probe contract** — same 60s window. Failure here is louder than Phase A/B failure because rollback was the recovery path; a failed rollback means falling through to operator-direct (`wrangler rollback` from a laptop with creds).

**Rollback hook** — the workflow IS the rollback hook. The operator-direct path in [DEPLOY.md](../../../mcp-server/src/docs/operations/DEPLOY.md) remains documented for "GitHub itself is down" + "no operator has wrangler creds locally and that's a problem."

---

### Phase D — Wrangler secret sync (~1 day; **EXTRACTED 2026-05-31 → BL-048, indefinitely deprioritized**)

**2026-05-31 extraction note**: Phase D has been moved to its own backlog entry [BL-048](BACKLOG.md#bl-048-mcp-server--wrangler-secret-sync-extracted-from-bl-037-phase-d) so BL-037 can close cleanly after Phase C ships. BL-048's status is "open · deprioritized — indefinitely deferred" with written trigger thresholds for revisit (BL-033 ramp + first env-drift incident; rotation cadence exceeds monthly; compliance audit-trail mandate; operator-direct path breaks). The original implementation sketch below is retained for reference when BL-048 is eventually scheduled.

---

(Original Phase D scope, retained as design reference for BL-048):

**Trigger** — `workflow_dispatch` + (optionally) a `repository_dispatch` event from the chosen secret manager's webhook on rotation.

**Workflow structure** — depends on the chosen secret-manager substrate. Skeleton:

| Step                                                  | Purpose                                                                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticate against secret manager                   | Method varies (1Password Connect token vs Doppler service token vs AWS OIDC role). Each surface has a different credential model.        |
| Fetch the canonical list of MCP secrets               | Read names + values for `MCP_KEY_*`, `UPSTASH_MCP_REST_*`, `SENTRY_DSN`, `INOREADER_*`.                                                  |
| `cloudflare/wrangler-action@v3` with `secrets:` input | The action's `secrets:` input maps a list of names → env values, calls `wrangler secret bulk` atomically. Documented in upstream README. |
| Diff & log (non-revealing)                            | Print which secret NAMES were synced; never the values.                                                                                  |

**Required secrets** — TBD per chosen substrate. **Open question**: which secret manager.

**Smoke-probe contract** — no /health probe (this workflow doesn't change Worker code). Verification = `npx wrangler secret list --env <env>` step that confirms the expected names are present.

**Rollback hook** — re-running the workflow against a prior known-good state IS the rollback. Operator-direct `wrangler secret put` remains documented.

**Filename** — `secrets-sync-mcp.yml` (placeholder; finalize when Phase D is scheduled).

---

## Workflow file layout

| Path                                                    | Phase | Trigger summary                                                         |
| ------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| `.github/workflows/deploy-mcp-staging.yml`              | A     | push → `feature-mcp1`, `dev` · paths: `mcp-server/**`                   |
| `.github/workflows/deploy-mcp-production.yml`           | B     | push → `master` · paths: `mcp-server/**` · environment `mcp-production` |
| `.github/workflows/rollback-mcp.yml`                    | C     | workflow_dispatch · inputs: environment, version-id, reason             |
| `.github/workflows/secrets-sync-mcp.yml` (filename TBD) | D     | workflow_dispatch · TBD secret-manager event                            |

Existing untouched workflows: `test.yml` (root tests), `test-mcp-server.yml` (mcp-server tests), `lighthouse.yml`, `perf-dashboard.yml`, `test-cross-browser.yml`. None duplicated, none replaced.

---

## Test strategy

Workflows are infrastructure code — the verification shape is empirical, not unit-tested.

| Surface               | Verification                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase A first run** | First successful staging deploy through CI: `/health` returns the expected `gitSha`; Sentry shows a new release tagged with the SHA; source maps resolved (Sentry → Issues → click a synthetic test event → confirm frames show `src/worker.ts` line numbers, not minified). |
| **Phase B first run** | First production deploy waits at the reviewer gate; operator approves; deploy proceeds; `/health` on prod returns the expected `gitSha`; Slack/Issue posts on a synthetic failure (test by pointing the smoke probe at a wrong URL once).                                    |
| **Phase C first run** | Manually trigger with a known prior `version-id`; smoke probe should show the older `gitSha` after the rollback.                                                                                                                                                             |
| **Phase D first run** | Rotate a single test secret (`MCP_TEST_KEY`); confirm it appears in `wrangler secret list` and the value at runtime matches the secret-manager source.                                                                                                                       |

**Manual acceptance checklist** (first run of each phase, before retiring operator-direct as the default path):

- [ ] Workflow exists in `.github/workflows/`, lints clean (actionlint or `gh workflow view`).
- [ ] Required secrets exist in repo settings (`gh secret list`).
- [ ] First run succeeds end-to-end. Capture the run URL in the PR description.
- [ ] `/health` returns the expected `gitSha` within the 60s smoke window.
- [ ] Sentry release event appears tagged with the same SHA (Phase A & B only).
- [ ] Sentry stack traces on a synthetic error resolve to TypeScript line numbers (Phase A & B only).
- [ ] Operator-direct path STILL works (run `npm run deploy:staging` once after the first CI deploy, confirm it also produces a clean `/health`). Confirms the dual-path invariant.

**Pyramid alignment** — per [TEST_STRATEGY.md](../testing/TEST_STRATEGY.md), workflows have no unit/integration tier. They're tested by their first successful run plus the smoke probe baked into each one. Document the first-run results in the PR body.

---

## Documentation plan

| File                                                                                            | Change                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/deploy-mcp-staging.yml`                                                      | **Create** — Phase A.                                                                                                                                                                                                                                                                                                                                                                           |
| `.github/workflows/deploy-mcp-production.yml`                                                   | **Create** — Phase B (after BL-033 ramp).                                                                                                                                                                                                                                                                                                                                                       |
| `.github/workflows/rollback-mcp.yml`                                                            | **Create** — Phase C.                                                                                                                                                                                                                                                                                                                                                                           |
| `.github/workflows/secrets-sync-mcp.yml` (TBD name)                                             | **Create** — Phase D (deferred).                                                                                                                                                                                                                                                                                                                                                                |
| [`DEVELOPER_TOOLING.md`](DEVELOPER_TOOLING.md)                                                  | **Modify** — add a new "Deploy chain" subsection between "What runs automatically" and "Tools installed". Document: the four workflows, their triggers, their required secrets, the relationship to the existing `test.yml` test gate (deploys read the merge commit's check status; they do NOT re-run tests). Per CLAUDE.md § 11, this doc is authoritative and any new contributor reads it. |
| [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) | **Modify** — reframe Part B from "the deploy path" to "the operator-emergency deploy path." Add a leading callout at the top of Part B linking to the CI default. Part A (one-time setup) and Part C (ops) are unchanged. Part C § C.x — Rollback gains a CI-first variant pointing to `rollback-mcp.yml`.                                                                                      |
| `src/docs/development/MCP_SERVER_CI_CD_DEPLOY_BL-037.md`                                        | **This doc.**                                                                                                                                                                                                                                                                                                                                                                                   |
| [`BACKLOG.md`](BACKLOG.md)                                                                      | **Modify** — close BL-037 stanza on completion.                                                                                                                                                                                                                                                                                                                                                 |

**Not touched**:

- `mcp-server/scripts/deploy.mjs` — CI calls it unchanged. Any change to the script lands in a separate commit with its own justification.
- `mcp-server/wrangler.toml` — environment definitions are already correct.
- `mcp-server/package.json` — `deploy:staging` / `deploy:production` scripts unchanged.
- The website's Vercel deploy chain — explicitly out of scope.

---

## Risks & tradeoffs

| Risk                                                              | Mitigation                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`cloudflare/wrangler-action` becomes unmaintained**             | GitHub Actions in the Cloudflare org have historically been maintained (this one is on v3 with active commits as of 2026). Mitigation: pin to a major version (`@v3`), monitor Dependabot for upgrade signals, fall back to raw `npx wrangler deploy` via a plain `run:` step if the action goes stale. The action is a credentials bridge, not deploy logic — replacing it would be small. |
| **Smoke-probe failure semantics — auto-rollback or page?**        | **Choice**: page (workflow fails red, optionally notifies via Phase B's Slack/Issue), do NOT auto-rollback. Rationale: a `/health` failure can be a deploy bug OR an Upstash blip OR DNS propagation delay; auto-rollback on a noisy signal would create false-positive rollback storms. The operator decides whether to redeploy a fix or trigger `rollback-mcp.yml`.                      |
| **Production deploy with failing tests**                          | The `test.yml` workflow is already a required status check on `master` per the existing ruleset. Merges to `master` cannot land with failing tests. The deploy workflow runs on the post-merge commit, which is already validated. No additional gate needed.                                                                                                                               |
| **CLOUDFLARE_API_TOKEN over-scoped**                              | Mint the token with the narrowest necessary scopes: Workers Scripts:Edit + Workers Routes:Edit on the `globalstrategic.tech` zone. Do NOT use a token with account-wide admin. Re-mint on operator rotation.                                                                                                                                                                                |
| **Sentry source-map upload fails but deploy succeeds**            | `deploy.mjs` already handles this — wrangler exits 0, sentry-cli warns, script exits 0. The deploy is real even if source maps fail. Acceptable tradeoff (source maps are a debug-experience nicety, not a runtime gate).                                                                                                                                                                   |
| **Phase B reviewer gate blocks Dependabot bumps**                 | Open question. Two options: (a) require reviewer for every prod deploy including Dependabot; (b) auto-approve Dependabot patch bumps. Recommend (a) initially — the friction is bearable at single-operator scale and tightens audit posture. Revisit when Dependabot bump volume becomes noisy.                                                                                            |
| **BL-033 compliance hook may demand additional audit logging**    | If BL-033's external-consumer compliance review requires more than the GitHub Actions audit log (e.g., signed deploy attestations, SBOM), file that as a new BL initiative. Don't pre-build for hypothetical requirements.                                                                                                                                                                  |
| **Tree-hash dedup applied to deploy workflow**                    | `fkirc/skip-duplicate-actions` is configured on `test.yml`; NOT on the deploy workflows. Deploy must run on every qualifying push even if the tree hash matches a prior run — otherwise a re-push to fix a bad deploy could no-op.                                                                                                                                                          |
| **Smoke probe times out during DNS propagation on a fresh route** | First-deploy edge case from [DEPLOY.md § A.2](../../../mcp-server/src/docs/operations/DEPLOY.md). 60s window may be tight on a brand-new custom-domain binding. Mitigation: first-ever deploy of a brand-new env runs operator-direct (per the fallback theme); CI handles steady-state where DNS is already propagated.                                                                    |

---

## Acceptance Criteria

Verbatim from the BACKLOG stanza, organized by phase.

### Phase A — Staging auto-deploy

- [ ] `.github/workflows/deploy-mcp-staging.yml` created.
- [ ] Triggered on push to `feature-mcp1` and `dev` (path-filtered to `mcp-server/**`).
- [ ] Uses `cloudflare/wrangler-action@v3` (or current equivalent).
- [ ] Test gate satisfied **before** deploy starts — but the deploy workflow MUST NOT re-execute `npm ci` / `tsc` / `lint` / `test:run` (per Decisions row "Test gate is unchanged"). Implementation choice: trigger via `workflow_run` after `test.yml` succeeds, OR rely on branch-protection-required-status-checks ensuring `test.yml` is green on the merge commit. Decide at implementation time; document the choice in the workflow file's top comment. (BACKLOG stanza's literal "Gates on … `npm run test:run`" wording reflects intent — verify the same checks already ran on the commit; don't re-run them.)
- [ ] Cloudflare credentials sourced from GitHub Secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- [ ] Sentry source-map upload credentials sourced from GitHub Secrets (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`); `scripts/deploy.mjs`'s existing sentry-cli branch runs cleanly on every CI deploy.
- [ ] Post-deploy `/health` smoke probe; fails the workflow if `gitSha` doesn't match the commit SHA within 60s.
- [ ] First successful run produces an audit entry in the GitHub Actions log.
- [ ] Operator-direct path still works (`npx wrangler deploy --env staging` documented as the emergency path in DEPLOY.md).

### Phase B — Production deploy on master

- [ ] `.github/workflows/deploy-mcp-production.yml` created with same gates as Phase A.
- [ ] Triggered on push to `master` only.
- [ ] GitHub Environment `mcp-production` configured with required reviewers (≥1).
- [ ] Same smoke-probe shape as Phase A; failure aborts and notifies (Slack webhook or GitHub Issue).
- [ ] Doesn't run for non-master branches even if pushed accidentally.

### Phase C — Rollback automation

- [ ] `.github/workflows/rollback-mcp.yml` with `workflow_dispatch` trigger only.
- [ ] Inputs: `environment` (staging | production), `version-id` (Cloudflare deployment ID), `reason` (optional).
- [ ] Runs `npx wrangler rollback --env <env> <version-id>` and posts the result.
- [ ] Production rollback requires approver gate; staging rollback does not.
- [ ] DR runbook in DEPLOY.md updated with both the CI rollback path and the operator-direct path.

### Phase D — Secret sync (optional, deferred)

- [ ] Secret manager chosen and documented in DEPLOY.md.
- [ ] Workflow reads secrets and runs `wrangler secret put` (or `wrangler secret bulk` via the action's `secrets:` input) idempotently.
- [ ] Triggered manually or on rotation event.
- [ ] Audit log in GitHub Actions shows which secrets were synced when (names only).

### Verification & docs

- [ ] [DEPLOY.md](../../../mcp-server/src/docs/operations/DEPLOY.md) updated with both deploy paths and the rollback automation.
- [ ] [DEVELOPER_TOOLING.md](DEVELOPER_TOOLING.md) updated with a Deploy chain section.
- [ ] At least one staging deploy and one production deploy run end-to-end through the CI path before the BL-032 soak's "operator-direct only" pattern is retired.

---

## Open questions

1. **Phase B reviewer policy for Dependabot bumps** — auto-approve or require human review? Recommend require-human initially; revisit if volume becomes noisy.
2. **Phase D secret-manager substrate** — 1Password Connect vs Doppler vs AWS Secrets Manager. Likely deferred until a second operator joins or a compliance audit lands. The choice has knock-on cost (1Password Connect needs a self-hosted Connect server; Doppler is fully SaaS; AWS adds an account-and-IAM dependency).
3. **`workflow_run` vs branch-protection-as-gate** — Phase A's AC says "gates on lint + tests passing." Two implementations:
   - (a) Workflow uses `on: workflow_run: workflows: ['test'], types: [completed]` + `if: github.event.workflow_run.conclusion == 'success'`. Cleaner audit but couples the workflows.
   - (b) Deploy workflow runs on `push` independently; we rely on branch-protection-required checks meaning a push to `dev` can only happen after tests pass on the PR. Looser coupling but a force-push could bypass.
   - Decide at implementation time. Recommend (a) for explicitness.
4. **Notification channel for Phase B failures** — Slack webhook vs GitHub Issue. Pick whichever the operator currently checks fastest.
5. **Should staging deploys post to anywhere on success?** — Current proposal: no, the Actions tab is the audit surface. If operators want push-notifications, file a follow-up.
6. **Do we need a separate "test deploy" workflow for PRs that touch `mcp-server/**`?** — Currently `npx wrangler deploy --dry-run`runs in`test-mcp-server.yml`; that's probably sufficient. Confirm before Phase A ships.

---

**Plan written**: 2026-05-30. **Truth-pass**: 2026-05-31. BL-032 substrate is in production; downstream sibling tickets (BL-032.5/.7/.75/.76/.77/.8) have all shipped, indicating the soak is effectively closed in practice even if the BACKLOG BL-032 stanza retains pre-closure language pending the BL-034 doc-cleanup pass. Phase A practically unblocked; Phase B awaits BL-033 ramp; Phase C independent post-Phase-A; Phase D deferred.
