# CI for Tests

What GitHub Actions runs for this repo, which of it gates a merge, and what the E2E job does. The pipeline's mechanics — the change-detection gate, duplicate-run dedup, the prettier diff check, the branch-family push triggers — are documented in [DEVELOPER_TOOLING.md § What runs automatically](../development/DEVELOPER_TOOLING.md#what-runs-automatically); this page does not repeat them. Vercel deploys the website independently of all of this (a preview per PR, production on merge to `master`).

## Workflows

All in [`.github/workflows/`](../../../.github/workflows/).

| File                        | Jobs (check names)                                                                                                | Triggers                                                                                                                       | Required                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `test.yml` — Test Suite     | Detect Code Changes → **Lint & Type Check**, **Unit & Integration Tests** (parallel) → **E2E Tests (Playwright)** | Push to `master`, `feat/**`, `fix/**`, `feature/**`, `dependabot/**`, `docs/**`, `chore/**`; PR to `master` (opened, reopened) | Yes — the three bold jobs                          |
| `docs-integrity.yml`        | **Verify doc links** (runs `npm run test:docs`)                                                                   | Every PR; push to `master`; manual                                                                                             | Yes                                                |
| `lighthouse.yml`            | Detect Performance-Relevant Changes → **lighthouse** (blocks on CLS > 0.1)                                        | PR to `master`; manual                                                                                                         | Once added in the ruleset UI                       |
| `test-mcp-server.yml`       | Typecheck, Build & Test (the `mcp-server` workspace)                                                              | Push and PR, on a `paths` allowlist of Worker source                                                                           | No — but a green push run gates the staging deploy |
| `test-cross-browser.yml`    | E2E Tests (chromium / firefox / webkit matrix)                                                                    | Manual only                                                                                                                    | No                                                 |
| `npm-audit.yml`             | npm audit (production dependencies only)                                                                          | Lockfile changes on push or PR; weekly cron; manual                                                                            | No                                                 |
| `prettier-drift-check.yml`  | Run `prettier --check` against the whole repo; opens an Issue on drift                                            | Weekly cron; manual                                                                                                            | No                                                 |
| `perf-dashboard.yml`        | Collects Lighthouse history for the performance dashboard                                                         | Weekly cron; manual                                                                                                            | No                                                 |
| `latency-probe.yml`         | MCP Worker latency probe against production                                                                       | Every 6 hours; manual                                                                                                          | No                                                 |
| `deploy-mcp-staging.yml`    | Deploy the MCP Worker to staging                                                                                  | After a green `test-mcp-server.yml` push run                                                                                   | No                                                 |
| `deploy-mcp-production.yml` | Deploy the MCP Worker to production (`mcp-production` approval)                                                   | Push to `master` touching Worker source; manual                                                                                | No                                                 |
| `rollback-mcp.yml`          | Roll back the MCP Worker                                                                                          | Manual                                                                                                                         | No                                                 |

## What the E2E job does

The required **E2E Tests (Playwright)** job in `test.yml` runs after both Lint & Type Check and Unit & Integration Tests pass. It:

1. installs Playwright browsers (cached per Playwright version);
2. runs `npm run build`;
3. starts the radar snapshot stub (`scripts/radar-stub.mjs`) and points `MCP_RADAR_SNAPSHOT_URL` at it, so the `/hub/radar` content tests run instead of skipping ([RADAR.md § E2E Test Mocking](../hub/RADAR.md#e2e-test-mocking));
4. runs `npx playwright test --project=chromium` — chromium only, with 1 retry and 2 workers under `CI`, inside a 30-minute job timeout;
5. uploads `playwright-report/` as the `playwright-report` artifact (kept 7 days), pass or fail.

To see a failure: open the run, download the `playwright-report` artifact, extract it and open `index.html`. Traces are recorded on the first retry.

Firefox and webkit run only when someone dispatches `test-cross-browser.yml` (Actions tab → Cross-Browser E2E Tests → Run workflow). It runs the same build-and-stub steps once per browser.

## Skipped runs still report success

Every job in `test.yml` checks the Detect Code Changes gate. When a push or PR changes only docs (`**/*.md`, `src/docs/**`, `.claude/**`), or its tree is identical to one that already passed, each job skips its real steps and runs a "Skipped (docs-only or duplicate run)" step that reports **success**. That is what lets a docs-only PR satisfy the required checks. `lighthouse.yml` does the same for PRs that cannot move a performance score. `docs-integrity.yml` has no such gate — it runs on every PR, because docs-only diffs are exactly what it checks.

## Branch Protection Rules

The `master` branch ruleset, its required checks and the strict up-to-date policy are recorded in [CLAUDE.md § PR Requirements](../../../.claude/CLAUDE.md) and, with the reasoning, in [DEVELOPER_TOOLING.md § What runs automatically](../development/DEVELOPER_TOOLING.md#on-every-push-to-master-feat-fix-feature-dependabot-docs-chore-and-prs-to-master) (the ruleset paragraph after the pipeline diagram). In short: **E2E Tests (Playwright)**, **Unit & Integration Tests**, **Lint & Type Check** and **Verify doc links** must pass on the current head, the branch must be up to date with `master`, and `lighthouse` joins them once it is added in the ruleset UI.

A PR stuck BLOCKED after "Update branch", or with a check that never reports, is covered in [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#a-check-is-stuck--running-for-minutes-with-no-logs-or-queued-with-no-job-at-all).
