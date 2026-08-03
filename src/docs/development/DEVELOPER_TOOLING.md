# Developer Tooling

Project-specific reference for the quality tooling installed during Phase 2 of the platform-hardening initiative. Covers what runs when, how to run things manually, where the configuration lives, and how to resolve the most common failure modes.

> This is a reference, not a tutorial. If you need to learn what Prettier or ESLint _are_, read their upstream docs. This document describes how **this specific project** uses them.

---

## Quick reference

| Need                                   | Command                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Start the dev server                   | `npm run dev`                                                                |
| Run unit and integration tests (once)  | `npm run test:run`                                                           |
| Run unit and integration tests (watch) | `npm run test`                                                               |
| Run tests with coverage                | `npm run test:coverage`                                                      |
| Run the docs guards (link/anchor integrity + variables parity) | `npm run test:docs`                                  |
| Arm the Claude review gates (once/machine) | `npm run setup:claude-hooks` (see § Claude Code review gates)            |
| Seed / clear the local stdio MCP radar snapshot | `npm run radar:seed` / `npm run radar:unseed` (mock data — see [RADAR.md § Working Offline](../hub/RADAR.md)) |
| Serve a fake `/radar/snapshot` for the **website** | `npm run radar:stub` (the stdio seed above is a different consumer — the site never reads it; needed for the content-dependent radar E2E) |
| Run E2E tests                          | `npm run test:e2e` (Chromium only: `npm run test:e2e -- --project=chromium`) |
| Run accessibility scan (axe-core)      | `npm run test:a11y`                                                          |
| Type-check the website workspace       | `npx astro check` (root tsconfig `exclude`s `mcp-server`)                    |
| Type-check the **mcp-server** workspace | `npm -w @gst/mcp-server run typecheck` (`astro check` does NOT cover it — see below) |
| Lint all JS/TS/Astro                   | `npm run lint`                                                               |
| Lint and auto-fix                      | `npm run lint:fix`                                                           |
| Lint CSS and Astro scoped styles       | `npm run lint:css` (hardcoded colors are an **error**; off-scale font sizes warn — see § stylelint configuration notes) |
| Format all files                       | `npm run format`                                                             |
| Check formatting without writing       | `npm run format:check`                                                       |
| Build for production                   | `npm run build`                                                              |
| Preview the production build           | `npm run preview`                                                            |
| Run the MCP server locally (stdio)     | `cd mcp-server && npm run build` then point Claude Desktop at `dist/index.js` (see `mcp-server/README.md`) |
| Run the MCP server as a Worker locally | `cd mcp-server && npm run dev:worker` (= `wrangler dev --env staging`)        |
| Test the Worker locally (programmatic) | `cd mcp-server && npx vitest run tests/integration/worker-roundtrip.test.ts` (boots Worker via `unstable_dev`) |
| Validate Worker bundle without deploy  | `cd mcp-server && npx wrangler deploy --dry-run --env staging`                |
| Deploy MCP Worker to staging           | `cd mcp-server && npm run deploy:staging` (Phase 6 — staging URL: `mcp-staging.globalstrategic.tech`) |
| Deploy MCP Worker to production        | `cd mcp-server && npm run deploy:production` (Phase 6 — production URL: `mcp.globalstrategic.tech`) |
| Provision an MCP client credential     | `cd mcp-server && npm run provision:client -- --name "<client>" --tier free-pilot [--dry-run]` (admin key via `MCP_ADMIN_KEY` env var — never a flag; runbook: [PILOT_ONBOARDING.md](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md)) |

**Authoritative local validation sequence** (what CI runs, in the same order):

```bash
npx astro check      # type errors (website workspace)
npm run lint         # ESLint (JS/TS/Astro)
npm run lint:css     # stylelint (CSS)
npm run test:run     # Vitest unit + integration
```

If all four pass locally, CI will almost certainly pass too — **for website-only changes**.

> **If your change touches `mcp-server/`, these four are not sufficient.** `astro check` type-checks the root program, which does not pull in mcp-server's sources or tests, and Vitest transpiles without type-checking — so a type error in `mcp-server/` passes all four while failing CI. `.github/workflows/test-mcp-server.yml` runs `typecheck` and then `build` (= `tsc --noEmit && node build.mjs`); a red run there also suppresses the staging-deploy chain, which gates on `workflow_run.conclusion == 'success'`. Add:
>
> ```bash
> npm -w @gst/mcp-server run typecheck   # tsc --noEmit over mcp-server (src + tests)
> npm run test:mcp                       # Vitest, mcp-server workspace
> npm run test:docs                      # docs guards: link/anchor integrity + VARIABLES_REFERENCE parity (required check)
> ```
>
> Discovered the hard way in BL-090: a two-argument call to a one-argument constructor sat green through `astro check`, `lint`, `test:run`, `test:mcp` (1917 passing) and `test:docs`, and would have failed CI.

---

## What runs automatically

### On every `git commit`

The [husky](https://typicode.github.io/husky) pre-commit hook ([.husky/pre-commit](../../../.husky/pre-commit)) runs [lint-staged](https://github.com/lint-staged/lint-staged), which applies the configured commands **only to the files you staged** (not your whole codebase). This keeps the hook fast — typically under 2 seconds.

The flow:

```
git commit -m "..."
  │
  ├─▶ .husky/pre-commit runs: npx lint-staged
  │
  ├─▶ lint-staged reads staged files and matches them against
  │    the globs in package.json's "lint-staged" config
  │
  ├─▶ For *.{ts,tsx,mjs,cjs,js}:
  │     1. eslint --fix   (auto-fix lint violations)
  │     2. prettier --write (reformat)
  │
  ├─▶ For *.astro:
  │     1. eslint --fix    (JS/TS in frontmatter + script tags)
  │     2. stylelint --fix (scoped <style> blocks)
  │     3. prettier --write
  │
  ├─▶ For *.css:
  │     1. stylelint --fix
  │     2. prettier --write
  │
  ├─▶ For *.{json,md,yaml,yml}:
  │     1. prettier --write
  │
  ├─▶ If any command fails (e.g., ESLint finds a non-fixable error),
  │    the commit is ABORTED and lint-staged restores the original
  │    state from a stash
  │
  ├─▶ If all commands succeed, lint-staged re-stages the cleaned
  │    files so the commit captures the fixed version
  │
  └─▶ Git proceeds with the commit
```

**Important**: the hook runs **before** the commit is recorded. A file you staged with double-quotes and 4-space indent may end up in the commit with single-quotes and 2-space indent — that's Prettier doing its job between the stash and the record. If you see your commit look different than your working tree expected, that's why.

### On every push to `master`, `dev`, `feat/**`, `fix/**`, `feature/**`, `dependabot/**`, `docs/**`, `chore/**` and PRs to `master`

> **Why `dependabot/**` is in the push list.** The required CI workflows (`test.yml`, `npm-audit.yml`, `test-mcp-server.yml`) use `pull_request: types: [opened, reopened]` — deliberately **not** `synchronize` — and rely on the `push` trigger to validate each new commit on a PR branch. Dependabot **rebases/recreates** force-push to a `dependabot/**` branch, which arrives as a `synchronize` event (ignored) on a branch that was historically absent from the push list. The result: a rebased Dependabot PR kept its stale/absent required checks and was **permanently BLOCKED** — and `@dependabot rebase` could never fix it (the rebase is the very event that doesn't trigger CI). Adding `dependabot/**` to the **push** branch list of those three CI workflows gives Dependabot branches the same per-commit validation as `feat/**`/`fix/**`, without re-introducing the duplicate-run problem `synchronize` would cause. The **deploy** workflows (`deploy-mcp-staging.yml`, `deploy-mcp-production.yml`) intentionally **omit** `dependabot/**` so dependency bumps are validated but never auto-deployed. If a Dependabot PR is stuck BLOCKED on a commit that predates this fix, close+reopen it (fires `reopened`) to re-run the required suite.
>
> **Why `docs/**` and `chore/**` are in the push list (added 2026-07-15).** Same mechanism through a different door: GitHub's **"Update branch"** button pushes a merge commit to the PR branch, which arrives as `synchronize` (ignored). On a branch family absent from the push list, the updated head gets **zero check runs**, and because the master ruleset sets `strict_required_status_checks_policy: true` (branch must be up to date AND checks must pass on the current head), the PR stalls **BLOCKED** with checks stuck "expected" — observed on PR #316 (a `docs/**` branch updated after PR #315 merged). The remedy for an already-stuck PR is the same close+reopen; the fix is push-trigger parity for every branch-naming family actually used in the repo. If you introduce a new branch prefix, add it to all three CI workflows' push lists (and NOT to the deploy workflows) or its PRs will hit this trap.

The GitHub Actions workflow [.github/workflows/test.yml](../../../.github/workflows/test.yml) runs a 3-job parallel-then-gate pipeline:

```
┌───────────────────────────────────────────────────────────────┐
│                                                                │
│   changes (gate job, ~10s)                                     │
│    │                                                            │
│    │ Two independent checks gate the expensive jobs:            │
│    │  1. dorny/paths-filter@v4 — does this push/PR touch any   │
│    │     non-docs files? Outputs `code: true | false`.          │
│    │  2. fkirc/skip-duplicate-actions@v5 — has a prior run     │
│    │     already completed successfully with the same TREE     │
│    │     hash? Outputs `duplicate: true | false`. Catches       │
│    │     push→PR redundancy: push to dev passes, PR dev→master │
│    │     fires on a different commit SHA but identical tree.   │
│    │                                                            │
│    │ Combined output `should_run = code && !duplicate`.         │
│    │ Downstream jobs key off should_run.                        │
│    ▼                                                            │
│                                                                │
│   ┌─ Lint & Type Check ──────────┐                             │
│   │  astro check                  │                             │
│   │  eslint .                     │ runs in parallel            │
│   │  stylelint                    │ with the tests job          │
│   │  prettier --check <pr-diff>   │ (PR-scoped — see § Prettier │
│   │  (~30-60s when code changed)  │  idempotency + drift)       │
│   │  (npm audit moved to its own  │                             │
│   │   workflow — see § npm audit) │                             │
│   └───────────────┐                                             │
│                   │                                             │
│   ┌─ Unit & Integration Tests ─┐  │                             │
│   │  vitest run --coverage     │  │                             │
│   │  (~15-30s when code        │  │                             │
│   │   changed)                 │  │                             │
│   └────────────────┬───────────┘  │                             │
│                    │                ▼                           │
│                    └────────────────┬────────┐                  │
│                                      │        │                 │
│                                      ▼        │                 │
│                   ┌─ E2E Tests (Playwright) ──┴─┐               │
│                   │  build                        │              │
│                   │  playwright test              │              │
│                   │  (~17 minutes when code       │              │
│                   │   changed)                    │              │
│                   └───────────────────────────────┘              │
│                                                                  │
│   When should_run is false (docs-only OR duplicate run): each    │
│   job runs a trailing "Skipped" step that reports success, so    │
│   branch protection requirements are satisfied without burning   │
│   CI minutes.                                                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

All three jobs are **required status checks** on two branch rulesets:

- **`master`** (ruleset 12237842) — PRs cannot merge until all checks pass
- **`feat/**` and `fix/**`** (ruleset 15011377) — pushes to feature/fix branches are blocked until checks pass, shifting test failures left instead of deferring to PR time

#### Paths-filter syntax notes (load-bearing)

The gate job uses `dorny/paths-filter@v4` with a specific pattern that is easy to get wrong. Three gotchas surfaced during iteration:

1. **Extended-glob negation does not work**. `'!(**.md|src/docs/**|.claude/**)'` as a single filter entry is accepted by YAML but evaluated by picomatch as always-match, so the gate never fires. Use one negation per list item.
2. **Negation-only patterns need a catch-all**. With `predicate-quantifier: 'every'`, a list of only `!` patterns produces no file that satisfies "every pattern matches" — the catch-all `**` gives picomatch a positive match to start from, which the negations then whittle down.
3. **`base` must point at the pushed branch, not the default branch**. For push events, paths-filter defaults `base` to the repository default branch (`master`). A push to `dev` therefore compares `dev vs master` — the full set of unmerged commits — not just the files in that push. Every push to `dev` then looks like a full code change regardless of what it touched. Setting `base: ${{ github.ref_name }}` triggers the action's "same branch" codepath, which compares against the previous commit on the pushed branch instead.

The correct pattern (mirrors the [dorny/paths-filter README](https://github.com/dorny/paths-filter#example-of-filtering-on-file-extension) canonical example):

```yaml
base: ${{ github.ref_name }} # compare against previous commit on pushed branch
predicate-quantifier: 'every'
list-files: json # emit matched files for diagnostics
filters: |
  code:
    - '**' # positive catch-all
    - '!**/*.md' # negations
    - '!src/docs/**'
    - '!.claude/**'
```

The job also sets `permissions: { contents: read, pull-requests: read }` so paths-filter can use the GitHub API on PR events instead of falling back to git-based detection.

If the gate misbehaves, check the **"Log gate decision"** step output — it prints `code=true/false`, `duplicate=true/false`, `should_run=true/false`, and the JSON-formatted list of matched files, so you can see exactly what the gate saw without having to re-derive the evaluation. If the matched-file count looks suspiciously large (e.g. dozens of files for a single-file push), the `base` configuration is wrong — paths-filter is diffing against the default branch instead of the previous commit.

#### Duplicate-run dedup (fkirc/skip-duplicate-actions)

The gate job also runs [`fkirc/skip-duplicate-actions@v5`](https://github.com/fkirc/skip-duplicate-actions) before paths-filter, which dedupes on **tree hash** (content) rather than commit SHA. The canonical case it catches: push to `dev` passes all three checks → PR `dev→master` fires the same workflow on a synthetic merge-ref SHA whose tree is identical (since master hasn't moved), so the second run is redundant work on content that's already been validated. The action returns `should_skip=true` and the gate's `duplicate` output is `true`; each downstream job's real steps skip and the "Skipped (docs-only or duplicate run)" step runs instead, reporting success to satisfy branch protection.

Key configuration choices:

- `concurrent_skipping: 'same_content_newer'` — when push and PR events fire simultaneously on the same commit (e.g. commit to a branch that already has an open PR), the action sees two concurrent runs with identical tree hashes and skips whichever started second. Combined with the event-scoped concurrency group below, this means exactly one run does the work while the other short-circuits; neither cancels the other, so required status checks don't end up in a cancelled state.
- Workflow-level `concurrency.group` is scoped by `github.event_name` so push and pull_request runs on the same ref don't share a group — they no longer cross-cancel. Previously a push to `dev` with an open PR was cancelled the moment the PR run started, leaving branch protection with a cancelled required check even though the PR run succeeded.
- `skip_after_successful_duplicate: 'true'` (default) — only skip when the duplicate has a **successful** conclusion. A duplicate of a failed run still triggers a fresh test run.
- `do_not_skip: '["workflow_dispatch", "schedule", "merge_group"]'` — manual re-runs via the UI use `workflow_dispatch` and intentionally want to re-test; scheduled runs are cron-driven and shouldn't skip; merge-queue runs must run fresh because the queue may have updated `master` between the PR and the merge-queue entry. Notably `push` and `pull_request` are NOT in this list — they dedupe as expected.

The `actions: write` permission on the gate job is required by skip-duplicate-actions to query prior workflow runs via the REST API.

---

## Production deploy is latest-wins

[deploy-mcp-production.yml](../../../.github/workflows/deploy-mcp-production.yml) deploys the MCP Worker to production on every master merge that touches the Worker source, gated by the `mcp-production` GitHub Environment's required-reviewer approval (BL-037 Phase B).

Its concurrency is configured **latest-wins**:

```yaml
concurrency:
  group: deploy-mcp-production
  cancel-in-progress: true
```

**Why `true` and not `false`.** `wrangler deploy` publishes the **entire** Worker at a commit — it is not incremental — so deploying the newest SHA inherently includes every prior merge. There is never a reason to deploy a stale SHA once a newer one exists. `cancel-in-progress: true` means a new push **cancels the older un-deployed run** and carries the approval flag itself, so:

- An operator only ever has to approve the **latest** run, and approving it ships everything up to that SHA.
- The newest deploy is **independent of older ones** — a forgotten approval on an older run cannot block it.

**The failure this prevents (2026-07-01).** With the original `cancel-in-progress: false`, runs queued in strict arrival order — and a run parked in the environment approval `waiting` state **still occupies the group**. A June-03 production run sat un-approved in `waiting` and head-of-line-blocked **every** subsequent deploy for a month, including a radar FYI hotfix. Production silently drifted ~30 merges behind master. The fix flipped this flag; the durable lesson is that an approval gate must never be able to block newer runs behind it.

**The tradeoff `true` accepts.** If two deploys land within the ~1–2 min deploy window, the newer may cancel an in-flight `wrangler deploy`. This is safe: (a) Cloudflare version publishes are atomic — an interrupted upload doesn't half-publish, it just doesn't flip the route; (b) the cancelling run immediately redeploys the newer SHA; (c) the workflow's smoke probe verifies `/health.gitSha` matches the deployed commit before the run is green.

**Operator note.** If a production deploy is ever stuck `waiting` (approval) or `pending` (queued), do **not** approve a stale older run to "unstick" the queue — cancel it (`gh run cancel <id>`), which releases the group and lets the newest run reach its own approval gate. Verify the live Worker afterward with `curl -s https://mcp.globalstrategic.tech/health` and confirm `gitSha` matches the intended commit.

---

## Tools installed

| Tool                                                                               | Role                                                                                                                                             | Config file                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [Prettier](https://prettier.io/)                                                   | Opinionated code formatter. Normalizes whitespace, quote style, trailing commas, line wrapping. Does NOT change program behavior.                | [.prettierrc.json](../../../.prettierrc.json), [.prettierignore](../../../.prettierignore) |
| [ESLint](https://eslint.org/)                                                      | Lint JS, TS, and Astro files. Catches real bugs (unused vars, unsafe types, dead code) — not style.                                              | [eslint.config.mjs](../../../eslint.config.mjs)                                            |
| [typescript-eslint](https://typescript-eslint.io/)                                 | ESLint plugin that adds TypeScript-aware rules                                                                                                   | (extends from eslint.config.mjs)                                                           |
| [eslint-plugin-astro](https://github.com/ota-meshi/eslint-plugin-astro)            | ESLint plugin for `.astro` file parsing and rules                                                                                                | (extends from eslint.config.mjs)                                                           |
| [eslint-config-prettier](https://github.com/prettier/eslint-config-prettier)       | Disables ESLint rules that would conflict with Prettier's formatting                                                                             | (extends from eslint.config.mjs)                                                           |
| [stylelint](https://stylelint.io/)                                                 | Lint CSS files AND scoped `<style>` blocks inside `.astro` files (via postcss-html custom syntax)                                                | [.stylelintrc.json](../../../.stylelintrc.json)                                            |
| [postcss-html](https://github.com/ota-meshi/postcss-html)                          | PostCSS custom syntax used by stylelint to parse `<style>` blocks inside `.astro` files                                                          | (referenced from .stylelintrc.json `overrides`)                                            |
| [stylelint-config-html](https://github.com/ota-meshi/stylelint-config-html)        | Shared stylelint config for HTML-like files; provides the `/astro` sub-export used in the `.astro` override                                      | (referenced from .stylelintrc.json `overrides`)                                            |
| [@astrojs/check](https://docs.astro.build/en/reference/cli-reference/#astro-check) | TypeScript type-check for `.astro` files (`astro check`)                                                                                         | [tsconfig.json](../../../tsconfig.json)                                                    |
| [Lightning CSS](https://lightningcss.dev/)                                         | Vite CSS transformer: parsing, bundling, minification, autoprefixing, modern-CSS down-leveling (nesting, `oklch`, `color-mix`, `light-dark`)     | [astro.config.mjs](../../../astro.config.mjs) → `vite.css.transformer`                     |
| [browserslist](https://github.com/browserslist/browserslist)                       | Canonical browser target list. Read by LightningCSS via `browserslistToTargets()` in `astro.config.mjs`; any future CSS/JS tool respects it too. | [package.json](../../../package.json) → `"browserslist"` field                             |
| [husky](https://typicode.github.io/husky)                                          | Installs git hooks automatically on `npm install`                                                                                                | [.husky/pre-commit](../../../.husky/pre-commit)                                            |
| [lint-staged](https://github.com/lint-staged/lint-staged)                          | Scope git-hook commands to only the staged files (keeps hooks fast)                                                                              | `package.json` → `"lint-staged"`                                                           |
| [prettier-plugin-astro](https://github.com/withastro/prettier-plugin-astro)        | Prettier plugin for parsing `.astro` files                                                                                                       | (referenced from .prettierrc.json)                                                         |

---

## Configuration file locations

| File                                                              | Purpose                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [package.json](../../../package.json)                             | `scripts`, `devDependencies`, `lint-staged`, `overrides`, `prepare`                             |
| [.prettierrc.json](../../../.prettierrc.json)                     | Prettier formatting rules (2-space, single quotes, 100-char line width, etc.)                   |
| [.prettierignore](../../../.prettierignore)                       | Files and directories Prettier will not touch (generated output, lock files, hand-curated data) |
| [.gitattributes](../../../.gitattributes)                         | `* text=auto eol=lf` — forces LF in the working tree on every platform, so `prettier --check` behaves the same locally as in CI. See § Line endings |
| [eslint.config.mjs](../../../eslint.config.mjs)                   | ESLint flat config — recommended rules + overrides for tests, node scripts, and browser globals |
| [.stylelintrc.json](../../../.stylelintrc.json)                   | CSS lint rules                                                                                  |
| [tsconfig.json](../../../tsconfig.json)                           | TypeScript config, including the `@/*` → `src/*` path alias                                     |
| [.husky/pre-commit](../../../.husky/pre-commit)                                   | Single line: `npx lint-staged`                                                                  |
| [.github/workflows/test.yml](../../../.github/workflows/test.yml)                 | Website CI pipeline (3 jobs + changes gate)                                                     |
| [.github/workflows/test-mcp-server.yml](../../../.github/workflows/test-mcp-server.yml) | MCP server CI (runs in parallel to the website Test Suite)                                |
| [.github/workflows/deploy-mcp-staging.yml](../../../.github/workflows/deploy-mcp-staging.yml) | Auto-deploys the MCP Worker to staging on a green MCP test run (BL-037 Phase A)         |
| [.github/workflows/deploy-mcp-production.yml](../../../.github/workflows/deploy-mcp-production.yml) | Auto-deploys the MCP Worker to production on master merge, gated by the `mcp-production` GitHub Environment's required-reviewer approval (BL-037 Phase B). Concurrency is **latest-wins** (`cancel-in-progress: true`): a new push cancels any older un-deployed run, so an operator only ever approves the newest run and approving it ships all prior merges (`wrangler deploy` publishes the whole Worker at that SHA). See § Production deploy is latest-wins |
| [.github/workflows/rollback-mcp.yml](../../../.github/workflows/rollback-mcp.yml) | Manual `workflow_dispatch` rollback of the MCP Worker to a prior deployment ID; production rollbacks gated by the `mcp-production-rollback` environment (BL-037 Phase C) |
| [.github/workflows/npm-audit.yml](../../../.github/workflows/npm-audit.yml)       | Production-dep vuln scan — weekly cron + lockfile-change trigger                                 |
| [.github/workflows/prettier-drift-check.yml](../../../.github/workflows/prettier-drift-check.yml) | Weekly cron + manual `workflow_dispatch` — runs `prettier --check .` repo-wide; opens a `tech-debt` Issue if drift accumulates (counter-pressure for the diff-scoped PR check; see § Prettier idempotency + drift) |
| [.github/workflows/docs-integrity.yml](../../../.github/workflows/docs-integrity.yml) | Runs `npm run test:docs` — the BL-089 doc link & anchor guard plus the `VARIABLES_REFERENCE.md` ↔ `variables.css` parity guard (`tests/integration/docs-variables-sync.test.ts`) — on every PR + push to `master`. Exists as its own workflow because `test.yml`'s `changes` gate skips docs-only diffs — the exact case the guards must fire on. Its "Verify doc links" job **is a required branch-protection check** (added 2026-07-19; see CLAUDE.md § PR Requirements) |
| [.github/workflows/latency-probe.yml](../../../.github/workflows/latency-probe.yml) | BL-033 synthetic latency probe — cron (`30 */6 * * *`, 30 min after the Worker's radar-refresh cron) + manual `workflow_dispatch`; runs `mcp-server/scripts/probe-latency.mjs` against production, publishes a p50/p95 job summary + 90-day JSON artifact. Needs the `MCP_PROBE_KEY` secret. Deliberately NOT a required check — evidence collection, not a gate. See [LATENCY_PROBE.md](../../../mcp-server/src/docs/operations/LATENCY_PROBE.md) |
| [.github/dependabot.yml](../../../.github/dependabot.yml)                         | Automated dependency updates (npm + GitHub Actions)                                             |
| [.claude/hooks/hooks.config.json](../../../.claude/hooks/hooks.config.json)       | Tracked registration source for the Claude review-gate hooks (installed per-machine via `npm run setup:claude-hooks`; see § Claude Code review gates) |
| [.claude/hooks/](../../../.claude/hooks/)                                         | Gate scripts (`plan-review-gate.mjs`, `push-review-gate.mjs`) + installer (`install.mjs`) — unit-tested in `tests/unit/claude-hooks.test.ts` |

---

## Prettier style (this project)

Configured in [.prettierrc.json](../../../.prettierrc.json):

| Setting          | Value      | Effect                                                                       |
| ---------------- | ---------- | ---------------------------------------------------------------------------- |
| `singleQuote`    | `true`     | `'hello'` not `"hello"`                                                      |
| `trailingComma`  | `"es5"`    | Trailing commas where legal in ES5 (arrays, objects)                         |
| `printWidth`     | `100`      | Wraps long lines at 100 characters                                           |
| `tabWidth`       | `2`        | 2-space indentation                                                          |
| `semi`           | `true`     | Always use semicolons                                                        |
| `arrowParens`    | `"always"` | `(x) => x`, not `x => x`                                                     |
| `bracketSpacing` | `true`     | `{ a: 1 }`, not `{a: 1}`                                                     |
| `endOfLine`      | `"lf"`     | Unix line endings — enforced in the working tree by `.gitattributes`, see below |

### Line endings (`.gitattributes`)

[`.gitattributes`](../../../.gitattributes) sets `* text=auto eol=lf`, so **every text file is LF in
the working tree on every platform**, regardless of the operator's `core.autocrlf`.

This is load-bearing, not cosmetic. Prettier's `endOfLine: "lf"` means a CRLF working file fails
`prettier --check` even when its committed content is byte-correct. Before this rule, a Windows
checkout with git's default `core.autocrlf=true` left **607 files** failing `prettier --check`
locally while CI — which checks out on Linux — stayed green. (Three different denominators appear
in this section: ~873 files were CRLF on disk, 805 of them tracked-and-counted at the time of the
fix, and 607 is the subset Prettier actually checks — the rest are `.prettierignore`d or not file
types it handles.) It also made `git checkout -- <file>`
a trap: the restored file came back CRLF, prettier then failed on it, and `git status` showed
nothing wrong.

Because the index was already LF, adding the rule normalized the working tree only — no content
diff, no history rewrite. A fresh clone needs nothing. If you have a **stale clone** whose files are
still CRLF, renormalize with:

```bash
git add --renormalize .   # sanity check — stages nothing; the index is already LF

# WARNING: the next two lines discard uncommitted work. Commit or stash first.
# Between them `git status` shows every file as deleted — that is expected.
git rm --cached -r -q .   # drop the index's stat cache
git reset --hard          # re-materializes every file per .gitattributes
```

> Do **not** substitute `git checkout-index -a -f`. It skips any file whose index stat-cache entry
> still matches what is on disk — which is **exactly the stale-clone case**, because those CRLF
> files were *written by* a git checkout that recorded their stat as it went. On this repo it
> rewrote **1 of 805**, then exited 0 printing nothing. It *does* act on files that are missing or
> whose size changed since staging, so a scratch repo where you hand-write CRLF content will show
> it "working" — that is what makes it a convincing trap rather than an obviously broken command.
> Its exit code tells you nothing. The sequence above is deterministic.

`.sh` scripts and `.husky/pre-commit` *require* LF — a CRLF shebang breaks execution. The `.ps1`
scripts under `mcp-server/scripts/` are safe because **both Windows PowerShell 5.1 and PowerShell 7
parse LF-only script files**, including the here-strings in `Verify-AeEmission.ps1`; this does not
depend on which host an operator happens to use.

One consequence for macOS/Linux contributors, who were already unaffected in the working tree:
`text=auto` now also normalizes CRLF→LF **on commit**. If a fixture ever needs literal CRLF on disk,
give it an explicit `-text` override rather than relying on verbatim storage.

### What Prettier will NOT format

See [.prettierignore](../../../.prettierignore) for the full list. Notable entries:

- **Hand-curated data files**: `src/data/ma-portfolio/projects.json`, `src/data/canada-provinces.json`
- **Regulatory map content collection**: `src/data/regulatory-map/` (120 JSON files curated manually)
- **Lock files**: `package-lock.json`
- **Generated output**: `dist/`, `.astro/`, `.vercel/`, `coverage/`, `playwright-report/`, `test-results/`
- **Archived initiative docs**: `src/docs/development/_archive/` (added 2026-07-15, BL-088) — archived docs are frozen verbatim point-in-time records; letting the pre-commit hook reformat them at `git mv` time would contradict the archive-verbatim policy and bloat move diffs

## Prettier idempotency + drift detection

Four-part defense against the class of bug that surfaced in PR #207 (a markdown italic-context escape regression introduced by hand-editing in PR #206; the file landed prettier-clean at PR #206 commit time but a later prettier patch version disagreed, blocking unrelated PR #207's CI on an untouched file):

1. **Pre-commit idempotency check** (`package.json` lint-staged): every chain runs `prettier --check` immediately after `prettier --write`. If `--write`'s output isn't its own fixed point at the currently-installed prettier version, the commit is rejected locally with prettier's standard error message. Contributors see the failure at commit time, not via CI on someone else's later unrelated PR. Catches the narrow class where prettier is internally inconsistent at commit time.

2. **Prettier pinned to exact `3.8.3`** (`package.json` `devDependencies.prettier`): no caret. Every CI run installs exactly the same prettier version. Eliminates the patch-version-drift class that caused PR #207. To bump: edit `package.json` deliberately, run `npx prettier --write .` locally to flush any drift the new version surfaces, ship the bump alongside the cleanup in one PR.

3. **CI Prettier check is scoped to PR diff** (`.github/workflows/test.yml` "Prettier check (PR-diff scoped)" step): computes the changed-files list against the merge base via `git diff --name-only --diff-filter=AMRCT <base>...HEAD -- <prettier-relevant globs>` and only checks those files. Latent drift in unrelated files no longer blocks a PR. The trade-off is intentional: PRs validate their own changes, not the whole repo's hygiene.

   The `lint-and-typecheck` job's checkout uses `fetch-depth: 50` (not the default `1`) because the `push` event on a brand-new branch reports `github.event.before` as `0000…` and falls back to `git merge-base origin/master HEAD`. With a shallow HEAD that path exits 1 silently under `set -e` and prints no prettier output — making the failure look like a real lint failure when it's actually a missing-history failure. 50 covers any realistic feature-branch fork point and matches `git fetch origin master --depth=50` in the diff step. If a contributor's branch is >50 commits behind master, the step now fails loudly with a rebase-instruction error message instead of silently exiting 1.

4. **Weekly drift cron** (`.github/workflows/prettier-drift-check.yml`): runs `prettier --check .` against the whole repo every Monday 13:00 UTC (10:00 Sao Paulo). If drift exists, opens (or updates) a `tech-debt` + `prettier-drift` Issue listing the drifted files. The Issue is the visible counter-pressure that prevents latent drift from accumulating invisibly. Operator-triggerable via `workflow_dispatch` for ad-hoc validation.

**Why all four**: each layer catches a different class.
- (1) catches author-side prettier non-idempotency
- (2) closes the version-drift class at root cause
- (3) prevents one PR's latent debt from blocking another's CI
- (4) ensures the latent debt that (3) tolerates doesn't grow unbounded

If you see a `prettier-drift` Issue: run `npx prettier --write .` locally, open a cleanup PR with the resulting changes, close the Issue once merged.

---

## ESLint configuration notes

The [eslint.config.mjs](../../../eslint.config.mjs) uses the modern **flat config** format (not the legacy `.eslintrc`). Key points:

- **Strictness level**: "recommended" only — starts conservative to avoid drowning the initial rollout in violations. Stricter type-aware rules (`no-unsafe-assignment`, `strict-boolean-expressions`, etc.) can be layered on later.
- **`_`-prefixed names are allowed unused**: `const [_, value] = pair` and `function handler(_event, data)` are both fine. Matches standard Node/TS idiom.
- **Test files get `no-explicit-any: 'off'`**: test fixtures legitimately use `any` for mocks and untyped request bodies.
- **Browser globals are declared per-directory**: `window`, `document`, `navigator`, DOM types — all available in `src/**` and `tests/e2e/**` without import.
- **Node globals are declared for scripts**: `process`, `console`, `fetch`, `Buffer`, `TextDecoder`, `AbortSignal`, … — available in `scripts/**` and any `**/*.{cjs,mjs}` (which covers `mcp-server/scripts/**`), plus `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`. Import-less web-standard globals a Node 22 script legitimately uses get added to this list (`eslint.config.mjs` § Per-file overrides) rather than suppressed inline.

### Ignored files

The following files are explicitly excluded from linting:

- Build output: `dist/`, `.astro/`, `.vercel/`, `coverage/`, `playwright-report/`, `test-results/`, `.cache/`, `node_modules/`, `public/`
- Minified vendor assets: `**/*.min.js`, `**/*.min.css`
- Stale one-shot migration scripts at repo root: `abbreviate-arr.js`, `sort-projects.js` (tracked in Phase 9 backlog for deletion)
- `src/pages/hub/tools/techpar/index.astro` — `astro-eslint-parser` emits a spurious parsing error at the `<style>` block boundary on this one file. Other large `.astro` files (including the 3778-line `brand.astro`) parse cleanly. Tracked in Phase 9 backlog for investigation.

---

## stylelint configuration notes

[.stylelintrc.json](../../../.stylelintrc.json) uses a **base config** (for plain `.css` files) plus a dedicated **`.astro` override** that enables stylelint to parse `<style>` blocks inside Astro components.

### How .astro scoped-style linting works

The `.astro` override uses two packages:

- **[postcss-html](https://github.com/ota-meshi/postcss-html)** — a PostCSS custom syntax that knows how to skip frontmatter and HTML, pluck out `<style>` contents, and hand them to stylelint for parsing
- **[stylelint-config-html/astro](https://github.com/ota-meshi/stylelint-config-html)** — a shared stylelint config that registers the Astro-specific file type and wires up defaults

The override block in `.stylelintrc.json`:

```json
"overrides": [
  {
    "files": ["**/*.astro"],
    "extends": ["stylelint-config-standard", "stylelint-config-html/astro"],
    "customSyntax": "postcss-html",
    "rules": { /* same rule set as base config */ }
  }
]
```

The base rules are duplicated inside the `.astro` override because stylelint's `extends` + `overrides` interaction does not inherit rules from the parent config. Keep the two rule sets in sync when editing.

#### Design-token enforcement (added July 28, 2026)

Two rules enforce the "no hardcoded values" convention from [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md). Both are declared in **both** rule blocks (base + `.astro` override).

| Rule                                                | Properties                                                     | Severity    | Effect                                                              |
| --------------------------------------------------- | -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `scale-unlimited/declaration-strict-value`           | `/color$/`, `fill`, `stroke`, `box-shadow`, `text-shadow`      | **error**   | A hardcoded color fails `lint:css`, the pre-commit hook, and CI      |
| `declaration-property-value-allowed-list`            | `font-size`                                                     | **warning** | Off-scale font sizes are reported but do not fail the build (BL-094) |

Configuration notes — each of these is load-bearing, do not "simplify" them:

- **`expandShorthand: true`** means shorthands are checked at their color slot only. `border: 1px solid var(--x)` passes; `border: 1px solid #fff` fails. This is why `border`/`background`/`outline` are **not** listed as properties — listing them would flag the width/style tokens too.
- **`ignoreFunctions: false`** with `"/var[(]/"` in `ignoreValues` means "any value that references a token passes". That admits `light-dark(var(--a), var(--b))`, `color-mix(in srgb, var(--x) 12%, transparent)` and `rgba(var(--rgb), .5)` while still rejecting `light-dark(#fff, #000)` and `rgba(0, 0, 0, .5)`.
- Regexes in `ignoreValues` use a character class — `"/var[(]/"`. The double-backslash form (`"/var\\(/"`) also works, but the single-backslash spelling a maintainer reaches for first is **invalid JSON** and aborts stylelint with a "Bad escaped character" parse error. The character class sidesteps escaping entirely.
- `box-shadow`/`text-shadow` are not expandable shorthands, so they are listed explicitly; the numeric-length and `inset` entries in `ignoreValues` let their geometry through while the color slot is still checked.
- **Custom property declarations are never checked.** `--my-token: #c44040` is always allowed — that is how tokens are defined, and how the documented exceptions below stay legal.
- `font-size` uses the core allow-list rule rather than the strict-value plugin because the two cannot carry different severities under one rule key. `clamp(var(--a), 2vw, var(--b))` passes; `clamp(1rem, 2vw, 2rem)` warns.

**Documented exceptions** (both are deliberate, and both are recorded in STYLES_GUIDE.md):

1. **`@media print` blocks** keep literal `#000`/`#fff`/`#ccc` — paper has no theme, so the token system is meaningless there. Wrapped in `/* stylelint-disable scale-unlimited/declaration-strict-value -- … */` with a justification.
2. **R/G/B slider affordances** in `SwatchControlStyles.astro` — a red/green/blue channel control must stay red/green/blue regardless of palette. Declared once as component-local custom properties (which the rule does not check) rather than repeated inline.

#### `no-invalid-position-declaration` disabled in the `.astro` override only

The `.astro` override sets `"no-invalid-position-declaration": null`, while the base config (plain `.css`) leaves it enabled. As of stylelint 17.13.0 this rule fires false positives on HTML **inline `style="…"` attributes** in `.astro` markup (an inline style is declaration-only, so "declaration after a nested rule" is nonsensical there) — it flagged 983 such attributes across 17 components with zero real `.css` violations, and `--fix` cannot resolve them. This surfaced as a hard `lint:css` failure on every Dependabot dev-dependency bump that pulled stylelint ≥17.13 (e.g. PRs #263, #267). Suppressing it for `.astro` unblocks those bumps while keeping the rule active for real stylesheets. Re-enable once the upstream inline-style false positive is fixed.

### Running stylelint

```bash
npm run lint:css           # lint src/**/*.{css,astro}
npx stylelint "src/**/*.{css,astro}" --fix   # auto-fix what can be fixed
```

The pre-commit hook runs `stylelint --fix` on staged `.css` and `.astro` files. `.astro` files ALSO pass through `eslint --fix` and `prettier --write` in the same hook.

### `@layer` support

The base and override configs both register `layer` as an allowed at-rule (`at-rule-no-unknown: [true, { "ignoreAtRules": ["import", "layer"] }]`) so CSS cascade layer declarations parse cleanly. This supports the `@layer reset, tokens, utilities, components, theme, overrides;` scheme introduced in Phase 3 commit 0b.

### Complexity rules in the `.astro` override

Phase 3 commit 0c enabled a tighter complexity rule set in the `.astro` override only. These rules are too noisy for legacy `global.css` but are cheap wins in naturally bounded scoped blocks:

- `max-nesting-depth: [3, { ignoreAtRules: [media, supports, container] }]` — prevents deeply nested scoped rules; `@media`, `@supports`, and `@container` don't count toward the depth since they're conditional wrappers, not selector nesting
- `selector-max-compound-selectors: 4` — caps the number of compound selectors in any single selector (e.g., `.a .b .c .d .e` would fail)
- `declaration-block-no-shorthand-property-overrides` — flags patterns like `background-color: red; background: blue;` where the longhand is silently overwritten
- `shorthand-property-no-redundant-values` — flags `padding: 0 0 4px 0` (redundant trailing `0`) and similar; auto-fixable
- `declaration-block-no-redundant-longhand-properties` — flags patterns where multiple longhand declarations could be consolidated into a shorthand

Phase 9 (item #7) enabled two specificity rules at **warning** severity in both the base and `.astro` override:

- `selector-max-specificity: "0,4,1"` — caps specificity to 4 classes + 1 element. The `0,4,1` threshold accommodates `:global(html.dark-theme) .foo .bar .baz` patterns common in hub tool dark-theme overrides
- `no-descending-specificity: true` — flags selectors whose specificity is lower than a preceding selector for the same property, which often indicates unintended cascade order

**Baseline ratchet** (2026-04-13): 4 `selector-max-specificity` + 54 `no-descending-specificity` = 58 total warnings. New code must not increase this count. Existing violations should be reduced opportunistically during future refactors.

### Specimen styles in brand.astro

Brand-page specimen overrides (search, filter, modal, stats, CTA box) were moved from `global.css` into [brand.astro](../../pages/brand.astro) `<style is:global>` during Phase 9. The `stylelint-disable no-duplicate-selectors` guards were removed since the styles are now colocated with their only consumer.

---

## Accessibility testing

The project uses [axe-core](https://github.com/dequelabs/axe-core) via `@axe-core/playwright` for automated **WCAG 2.1 AA + 2.2 AA** scanning.

### Running locally

```bash
npm run test:a11y        # Scans 22 routes (Chromium, ~9 seconds)
```

This runs `tests/e2e/accessibility.test.ts`. The route list lives in that file's `PAGES` array — read it there rather than duplicating it here, because a copy in this doc rots (it did: it named 9 routes for a suite that scanned 22). It covers the marketing pages, the legal/confirmation pages, `/404`, all four `/hub/library/*`, the hub gateways and all five tool pages, plus `/brand` and `/hub/radar/`.

`/hub/radar/` waits for its `server:defer` island to resolve before scanning; with no `MCP_KEY_WEBSITE_RADAR` bound it scans the shell plus the empty state — bind `npm run radar:stub` to cover the feed items too.

The `wcag22aa` tag was added 2026-08-03 and selects exactly one rule in axe-core 4.12.1: `target-size`. It enforces the AA half of the touch-target ruling (24×24) on every scanned route; `tests/integration/touch-target-floor.test.ts` enforces the 44px AAA floor on the guarded families from source. See [BRAND_GUIDELINES § Accessibility](../styles/BRAND_GUIDELINES.md#accessibility).

### How the ratchet works

- **Critical violations**: must always be zero — blocks merge
- **Serious violations**: new violation IDs must be zero; pre-existing ones can be tracked in a `KNOWN_SERIOUS` map of per-page max node counts
- **Moderate/minor**: logged for visibility, not enforced

`KNOWN_SERIOUS` is **currently empty**, and that is the finished state rather than an unfilled one — its last 16 entries were all the same active-nav-link contrast node, closed 2026-08-03. Two guards flank it and both matter the moment anything is added: the ratchet fails on _exceeding_ a baseline, and a stale-baseline guard fails on falling _under_ one, so an entry of `n` asserts exactly `n`. Prefer deleting an entry that reaches zero over zero-valuing it — with no entry, a regression fails as an **unknown** serious violation, which is louder.

### Shared helper

`tests/e2e/helpers/a11y.ts` exports `checkA11y(page)` which returns violations categorized by severity. Import it in any E2E test:

```typescript
import { checkA11y, formatViolations } from './helpers/a11y';

const results = await checkA11y(page);
expect(results.critical).toHaveLength(0);
```

### Coverage reporting

`npm run test:coverage` reports line coverage via `@vitest/coverage-v8`. Source files under `src/utils/`, `src/data/*.ts`, and `src/scripts/` are instrumented. Current threshold: 35% lines (ratchet — can only increase).

## Lighthouse CI (performance budgets)

**See [PERFORMANCE_OBSERVABILITY.md](PERFORMANCE_OBSERVABILITY.md) — the authoritative reference for the performance observability stack** (Lighthouse CI on every PR, the historical-trend dashboard at <https://performance.globalstrategic.tech>, the GitHub Actions workflows automating both, and the supporting scripts).

In brief, only the bits a developer hitting this section likely needs:

- Configs: [`lighthouserc.cjs`](../../../lighthouserc.cjs) (desktop) and [`lighthouserc.mobile.cjs`](../../../lighthouserc.mobile.cjs) (mobile) at the repo root
- PR-time workflow: [`.github/workflows/lighthouse.yml`](../../../.github/workflows/lighthouse.yml) — runs on every PR to `master`; CLS regressions are the only assertion that fails the check
- Run locally: `npx lhci autorun --config=lighthouserc.cjs` (desktop) or `--config=lighthouserc.mobile.cjs` (mobile)
- Adjust budgets: edit `ci.assert.assertions` in the relevant config; document the why in the commit message

---

## Environment variables

All environment variables are declared in `astro.config.mjs` → `env.schema` using Astro's `envField` helper. This is the **single source of truth** for what vars the app needs, their types, defaults, and access levels.

### How to access env vars

| Context | Import from | Example |
| --- | --- | --- |
| Server-side code (`src/lib/`, `.astro` frontmatter) | `astro:env/server` | `import { INOREADER_APP_ID } from 'astro:env/server'` |
| Client-side code (`<script>`, client components) | `astro:env/client` | `import { PUBLIC_GA_MEASUREMENT_ID } from 'astro:env/client'` |
| Vite built-ins (`PROD`, `DEV`, `MODE`) | `import.meta.env` | `import.meta.env.PROD` (these are NOT custom vars) |
| Build-time config (`astro.config.mjs`) | `process.env` | Only for vars read before Astro initializes (Sentry auth token) |

### Rules

- **Never use `process.env` in `src/`** — ESLint `no-restricted-properties` enforces this. Use `astro:env/server` or `astro:env/client` instead.
- **Server secrets** (`access: "secret"`) are never inlined into the build output. They're resolved at runtime by the Vercel adapter — which is what lets a `server:defer` island like `RadarFeed.astro` read `MCP_KEY_WEBSITE_RADAR` from `astro:env/server` and fetch with it during render — including on the island's own uncached invocation, which runs per pageview rather than per ISR revalidation (see [RADAR.md § What a pageview costs](../hub/RADAR.md)).
- **Public vars** (`access: "public"`) are inlined at build time. Use the `PUBLIC_` prefix convention.
- **`.env` file** is for local development only (loaded by Astro dev server). Production vars are set in Vercel dashboard.
- **`.env.example`** documents all vars with placeholder values. Keep it in sync when adding new vars.
- **`mcp-server/src/worker.ts` and `mcp-server/src/auth/**` are blocked from raw `console.*`** by ESLint's `no-console` rule (added in BL-032 Phase 2). Use [`safeLog()`](../../../mcp-server/src/auth/safe-logger.ts) — it's the only call site permitted to invoke `console.log` directly (via a single `eslint-disable-next-line`). The reason: a careless `console.log(request.headers)` on a Worker fetch handler dumps the `Authorization` bearer token into `wrangler tail` and Sentry. The stdio entrypoint (`mcp-server/src/index.ts`) is exempt — stdio MUST use `console.error` for diagnostics; `stdout` is reserved for MCP protocol traffic.

### Testing

Vitest can't resolve `astro:env/*` virtual modules. Test stubs live at:
- `tests/__mocks__/astro-env-server.ts` — exports `undefined` for all server vars
- `tests/__mocks__/astro-env-client.ts` — exports defaults for public vars

Tests that need specific env values should use `vi.mock('astro:env/server', () => ({ ... }))` with `vi.hoisted()` for the factory object.

---

## Error monitoring (Sentry)

The site uses [@sentry/astro](https://docs.sentry.io/platforms/javascript/guides/astro/) for error monitoring, configured as an Astro integration in `astro.config.mjs`.

| Config file               | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `sentry.client.config.ts` | Client-side init — error capture + error-only replay |
| `sentry.server.config.ts` | Server-side init — SSR error capture (Radar page)    |
| `astro.config.mjs`        | Integration registration + source map upload config  |

**Key settings**: No PII (`sendDefaultPii: false`), no performance tracing (`tracesSampleRate: 0`), error-only replay (`replaysOnErrorSampleRate: 1.0`), disabled in development (`enabled: import.meta.env.PROD`). DSN is imported from `astro:env/client` (declared in env schema).

**Environment variables**:

- `PUBLIC_SENTRY_DSN` — declared in env schema, set in Vercel (Production + Preview)
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` — optional, for source map upload

**Error tags used in `captureException`**: `area:portfolio-data`, `area:regulatory-map`, `area:techpar-calculation` _(2026-07-14 audit: `area:inoreader-api` and `area:redis-connection` emit sites were deleted with the website's Inoreader client + Redis usage in BL-032.8 Phase B; `area:file-cache` / `area:palette-manager` no longer exist in source either — the list now matches a live grep of `src/`)_

**Viewing errors**: Log in to [sentry.io](https://sentry.io), select the `gst-website` project. Filter by tag (`area:regulatory-map`) to see specific subsystem failures.

### Alert rules

Configure these in the Sentry dashboard under **Alerts → Create Alert Rule** for the `gst-website` project:

| Rule                                    | Condition                                            | Action         |
| --------------------------------------- | ---------------------------------------------------- | -------------- |
| New issue                               | A new issue is created                               | Email (owner)  |
| High-volume errors                      | >10 events/hour on any page                          | Email (owner)  |
| Inoreader API failures                  | New issue with tag `area:inoreader-api`              | Email (owner)  |
| Redis connection failures               | New issue with tag `area:redis-connection`            | Email (owner)  |

These rules are configured externally in Sentry's UI, not in code. The tag filters rely on the `area` tags set in `captureException` calls throughout the codebase.

### Source map upload

Source maps enable readable stack traces in Sentry. The `sentry()` integration is conditionally included in `astro.config.mjs` — only when `SENTRY_AUTH_TOKEN` is present. This means local builds and CI have zero Sentry overhead.

When the token is set (Vercel production), `@sentry/astro` automatically:
- Enables `sourcemap: 'hidden'` for the server build
- Detects Vercel output directories (`{.vercel,dist}/**/*`)
- Uploads maps and deletes them after upload

**`vite.build.sourcemap: 'hidden'`** is set explicitly in user config because Astro's client build doesn't pick up integration config changes (only server build does). This ensures both client and server maps are generated.

**Telemetry**: Disabled (`telemetry: false`).

**Required env vars** (Production only — do NOT add to `.env` locally):

- `SENTRY_AUTH_TOKEN` — create an Organization Token at sentry.io → Settings → Developer Settings → Organization Tokens. See [SENTRY_MANUAL_SETUP.md](./SENTRY_MANUAL_SETUP.md)
- `SENTRY_ORG` — your Sentry organization slug
- `SENTRY_PROJECT` — the project slug (e.g., `gst-website`)

Add all three to **Vercel → Project Settings → Environment Variables** (Production only).

### Privacy and consent evaluation

Evaluated during Phase 9 (2026-04-13):

- **Pure error capture** (`captureException`, `captureMessage`): Classified as **legitimate interest** under GDPR — diagnostic data for maintaining service reliability. No consent required.
- **Error-only replay** (`replaysOnErrorSampleRate: 1.0`): Records DOM state only when an error occurs. Arguably still legitimate interest since it is diagnostic, not behavioral tracking. No session replay for general browsing.
- **No PII**: `sendDefaultPii: false` prevents automatic collection of user identifiers, IP addresses, or cookies.
- **Decision**: Keep current configuration as legitimate interest. Re-evaluate when [BL-001 (cookie consent)](./BACKLOG.md#bl-001-cookie-consent-and-gdpr-compliance) ships a cookie consent banner — at that point, consider gating replay behind analytics consent while keeping error capture ungated.

---

## Browser support

The project declares its supported browsers in the `"browserslist"` field of [package.json](../../../package.json):

```json
"browserslist": [
  "defaults",
  "Safari >= 14",
  "not IE 11"
]
```

- **`"defaults"`** resolves via [browserslist](https://github.com/browserslist/browserslist) to `> 0.5%, last 2 versions, Firefox ESR, not dead` — a standard modern-browser target set covering ~95%+ of global traffic.
- **`"Safari >= 14"`** is an explicit floor that keeps older Safari in the target set. This is load-bearing: without it, LightningCSS would decide the `-webkit-` prefixed form of properties like `backdrop-filter` is unnecessary and strip it, breaking legacy Safari.
- **`"not IE 11"`** is a defensive exclusion; IE is already dead in `defaults` but the explicit line documents the decision.

### How browser targets are used

Several parts of the build read from the `browserslist` field automatically:

1. **LightningCSS** (via [astro.config.mjs](../../../astro.config.mjs)) — reads browserslist at config load time via `browserslistToTargets(browserslist())`, then uses the resolved targets to:
   - Down-level modern CSS features (nesting, `oklch`, `color-mix`, `light-dark`)
   - Add vendor prefixes where needed (`-webkit-backdrop-filter`, `-moz-appearance`, etc.)
   - Strip unnecessary vendor prefixes when all targets support the unprefixed form
2. **Any future tools** that respect the [browserslist standard](https://github.com/browserslist/browserslist#shareable-configs) — autoprefixer, stylelint browser-compat rules, ESLint compat plugins, Vite's own esbuild fallback — will all read from the same source of truth without extra config.

### Vendor prefix policy (load-bearing)

**Do not manually write vendor-prefixed CSS properties** (`-webkit-backdrop-filter`, `-moz-user-select`, etc.) in source. LightningCSS is the authoritative prefix-adder, driven by the browserslist config.

If source contains BOTH a prefixed and unprefixed form of the same property with identical values, LightningCSS treats them as duplicates and ships only one (normally the one matching its internal target logic), which can silently break support in browsers that need the other form. The only safe pattern is to write the unprefixed form and let LightningCSS handle prefixes:

```css
/* Correct — LightningCSS adds -webkit- prefix for Safari 14 automatically */
.frosted {
  backdrop-filter: blur(3px);
}

/* WRONG — caused the Phase 3 regression where Firefox users lost frosted glass */
.frosted {
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px); /* don't do this */
}
```

This policy is enforced socially (code review + STYLES_GUIDE.md note) rather than mechanically. A future stylelint rule could catch it — tracked as a Phase 9 opportunity.

### Changing browser support

If you need to add or remove supported browsers:

1. Edit the `"browserslist"` field in `package.json`.
2. Run `npx browserslist` to see the resolved target list and confirm it's what you expect.
3. Run `npm run build` and eyeball the CSS output diff for any unexpected prefix additions or removals.
4. If shipping a visible behavior change, coordinate with the design review.

---

## npm audit policy

Production-dep audit lives in its own workflow at [.github/workflows/npm-audit.yml](../../../.github/workflows/npm-audit.yml). It runs on:

- **Weekly cron** (Mondays 06:00 UTC) — catches advisories published between lockfile changes.
- **Lockfile-change push or PR** — runs the moment a dependency is added, so new vulnerabilities are surfaced at the PR diff rather than at the next weekly cron tick.
- **Manual `workflow_dispatch`** — for ad-hoc verification after editing the `overrides` block.

```bash
npm audit --audit-level=moderate --omit=dev
```

Moved here from the main Test Suite (2026-05-31): the audit result is a function of the lockfile only, so running on every code push was pure waste.

**Why `--omit=dev`**: dev-only advisories (e.g., `@astrojs/check` → `yaml-language-server` → `yaml`) affect local development tooling but never reach users. Production dependencies must stay at zero advisories; dev-only moderate advisories are tolerated and revisited case-by-case.

**Current production state**: **zero vulnerabilities** on the enforced gate (`--omit=dev`), verified 2026-07-24. The **full tree (dev included) carries 6 dev-only high advisories** (tolerated per the `--omit=dev` policy above — e.g. dev `@lhci/cli → chrome-launcher → rimraf@3 → glob@7 → minimatch@3.1.5 → brace-expansion`, which cannot reach users). Restored to prod-zero on 2026-07-24 after a batch of newly-published CVEs (fleet-wide, not introduced by any single PR) regressed the tree: a non-breaking `npm audit fix` cleared the `tar`/`sharp`/`postcss`/`svgo` chains (incl. a critical `tar` node-tar advisory), and the override bumps below cleared the rest.

**Package overrides** — see [package.json](../../../package.json) `overrides` block:

- `path-to-regexp: 6.3.0` — forces the patched version across the dependency tree to close `GHSA-9wv6-86v2-598j` without a destructive `@astrojs/vercel` downgrade. Re-evaluate when `@vercel/routing-utils` ships a clean upgrade path.
- `fast-uri: 3.1.4` — patched `fast-uri` for the ajv subtree (transitive via `@modelcontextprotocol/sdk → ajv@8.20.0`, which declares `^3.0.1`), closing the host-confusion advisories `GHSA-v2hh-gcrm-f6hx` + `GHSA-4c8g-83qw-93j6` (range `3.0.0–3.1.3`). Stays on the 3.x line (`3.1.4` is the `three` dist-tag) — deliberately NOT 4.x, which would violate ajv's `^3.0.1`. Re-evaluate when ajv widens its range to `^4`.
- `@modelcontextprotocol/sdk → { hono: 4.12.32, express-rate-limit: 8.5.1 }` and `@hono/node-server → { ".": 2.0.11, hono: 4.12.32 }` (scoped) — `hono@4.12.32` closes the hono/jsx cross-request-disclosure + header advisories (`GHSA-hvrm-45r6-mjfj`, `GHSA-w62v-xxxg-mg59`, `GHSA-xgm2-5f3f-mvvc`, range `4.0.0–4.12.26`); `@hono/node-server@2.0.11` closes its own Windows serve-static path-traversal (`GHSA-frvp-7c67-39w9`, `<2.0.5`). **The `@hono/node-server` `.` self-key forces a 1.x→2.x major that is OUTSIDE the SDK's declared `^1.19.9`** — accepted because the Worker uses the Web-standard `agents/mcp` `createMcpHandler` transport, not the `@hono/node-server` Node adapter (SDK-internal, unreached), and `npm run test:mcp` (1718/1718) proves no module-load break. The flat `"hono"` form is NOT honored by npm 11 in this repo — use the parent-scoped form, and bump both `hono` entries in lockstep. `express-rate-limit: 8.5.1` closes the depends-on-vulnerable-`ip-address` advisory. Re-evaluate when the SDK declares `hono ^4.12.27+` and `@hono/node-server ^2` (drop the overrides then).
- `express-rate-limit → { ip-address: 10.2.0 }` — patched `ip-address` closing the XSS advisory `GHSA-v2v4-37r5-5v8g` (`<=10.1.0`) inside express-rate-limit's subtree. Remove when express-rate-limit ships with `ip-address >=10.2.0`.
- `esbuild: 0.28.1` — patched `esbuild` closing two high advisories (`GHSA-gv7w-rqvm-qjhr`, `GHSA-g7r4-m6w7-qqqr`, range `0.17.0–0.28.0`) — build/dev-time risks, not Vercel-runtime; Astro/Vite tolerate `0.28.1` cleanly. Remove when the tree's esbuild consumers resolve to `>=0.28.1` naturally.
- `@lhci/cli → { tmp: 0.2.7, uuid: 11.1.1 }` (scoped, added 2026-07-15) — `@lhci/cli@0.15.1` (latest) still pins `tmp@0.1.0`/`0.0.33` (`GHSA-52f5-9888-hmc6` + `GHSA-ph9p-34f9-6g65`, high) and `uuid@8.3.2` (`GHSA-w5hq-g745-h8pq`, moderate); npm audit's only suggested "fix" is a destructive downgrade to `@lhci/cli@0.1.0`. The scoped override forces the patched transitive versions inside lhci's subtree only, which also clears the dependent `external-editor`/`inquirer` advisories. Verified via `npx lhci healthcheck` + the CI lighthouse job. Remove when `@lhci/cli` ships with `tmp >=0.2.6` and `uuid >=11.1.1` (check with `npm ls tmp uuid --all` after a Dependabot lhci bump, then delete the override and re-run `npm audit`).

> **Not an override**: the prod `brace-expansion` advisory (`GHSA-3jxr-9vmj-r5cp`, `GHSA-mh99-v99m-4gvg`) reached the tree via `@astrojs/vercel → @vercel/nft → glob@13 → minimatch@10` and was cleared by a plain lockfile bump to the patched `5.0.8` (in-range for minimatch@10's `^5.0.5`) — no override needed. A flat/`minimatch`-scoped override was deliberately avoided: it would have hit the unrelated dev `minimatch@3.1.5` (which needs `brace-expansion ^1.1.7`) and forced a cross-major break.

**Automated dependency updates** — [Dependabot](../../../.github/dependabot.yml) opens PRs weekly for npm and GitHub Actions version bumps. When reviewing Dependabot PRs that update `@astrojs/vercel` or `@vercel/routing-utils`, check whether the `path-to-regexp` override can be removed by running `npm audit --omit=dev` after deleting the `overrides` block.

---

## Claude Code review gates

Two Claude Code PreToolUse hooks mechanically enforce the review directives in [CLAUDE.md](../../../.claude/CLAUDE.md) (Directives 2 and 7), so a session cannot lazily skip design or code review:

| Gate                          | Blocks                     | Requires                                                                                                                                                                     | Reviewer agent  |
| ----------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **Design Review Gate**        | `ExitPlanMode` (plan exit) | `.claude/tasks/plan-review.json` — verdict `APPROVE`/`USER_WAIVED`, `planContentSha256` matching the CURRENT plan-file bytes, `reviewedAt` < 24 h                             | `plan-reviewer` |
| **Implementation Review Gate** | any real `git push`        | `.claude/tasks/impl-review.json` — verdict `APPROVE`/`USER_WAIVED`, `headSha` equal to current `git rev-parse HEAD`                                                          | `code-reviewer` |

### Setup (once per machine/clone)

```bash
npm run setup:claude-hooks
```

This runs [.claude/hooks/install.mjs](../../../.claude/hooks/install.mjs), which idempotently merges the tracked registration source [.claude/hooks/hooks.config.json](../../../.claude/hooks/hooks.config.json) into your gitignored `.claude/settings.local.json` (preserving all other keys and any personal hooks). Hooks hot-reload — no restart. **Why an installer instead of a tracked settings file**: the harness actively writes personal permission approvals into `.claude/settings.json`, so neither settings file can be tracked without leaking per-developer allowlists; the tracked config + installer keeps the registration in the repo and the personal state out of it.

### How the handshake works

- **Content/SHA binding, not consumption**: the plan marker stores a sha256 of the plan file it reviewed; the push marker stores the HEAD sha it reviewed. Editing the plan (or adding commits) after review invalidates the marker automatically — and a user *rejection* without edits, or a *failed push retry*, does NOT burn the review.
- **Fail-open pitfall (load-bearing)**: for PreToolUse hooks, only **exit 2 blocks** — any other non-zero exit is a non-blocking error and the tool call PROCEEDS. This is why the registered commands are `$CLAUDE_PROJECT_DIR`-absolute (a relative path would "Cannot find module"-exit-1 whenever the session has `cd`'d, silently disarming the gate) and why the scripts fail CLOSED (exit 2) on missing/malformed/stale markers. Unit coverage: [tests/unit/claude-hooks.test.ts](../../../tests/unit/claude-hooks.test.ts).
- **Waivers**: only the user can waive a gate. The main agent then writes the marker with verdict `USER_WAIVED`, a `waiver` field quoting the user, and the current plan-hash/HEAD-sha. Agents must never hand-write an `APPROVE`.
- The push gate ignores everything that isn't a real push: quoted mentions (`git commit -m "about git push"`), `git stash push`, `git push --dry-run`, and all non-git traffic fast-exit clean.

### Troubleshooting

- **"Design Review Gate: … EDITED since it was reviewed"** — expected after revising a plan; send the revised plan back to `plan-reviewer`.
- **"Implementation Review Gate: … new commits exist since the review"** — expected after adding commits; re-run `code-reviewer` on the final state.
- **Gate blocks something it shouldn't** — inspect the marker (`.claude/tasks/*.json`), fix or delete it, re-run the reviewer. Markers are gitignored runtime state; deleting them is always safe (the next review recreates them).
- **Gates not firing at all** — `npm run setup:claude-hooks` hasn't been run on this machine, or `settings.local.json` was replaced; re-run the installer.

---

## Common workflows

### "I want to format the whole codebase right now"

```bash
npm run format
```

Be aware this will produce a large diff against the current state. The expected place to do this is as a single standalone commit during the Phase 9 sweep, not piecemeal during feature work.

### "`prettier --check` fails locally but CI is green"

Almost certainly line endings, and it is the harder direction to diagnose because CI never tells you
anything is wrong. Confirm with:

```bash
git ls-files --eol | grep -c "w/crlf"   # expect 0
```

Any count above zero means your working tree predates the `* text=auto eol=lf` rule (or something
rewrote files behind git's back). Fix it with the renormalization sequence in § Line endings, and
re-run the count to confirm — do not trust a command's exit code here.

### "My commit was rejected by the pre-commit hook"

1. **Read the error** — the hook shows which command failed and which file triggered it
2. **Common causes**:
   - **ESLint found a non-auto-fixable violation**: open the file, fix the violation, re-stage, re-commit
   - **Prettier failed to parse your file**: syntax error in the code, fix it
   - **stylelint found a CSS error**: same remediation as ESLint
3. **`lint-staged` has already rolled back the stash**, so your working tree is back to its pre-commit state. No changes were lost.

### "CI fails but it passes locally"

Run the exact CI sequence locally:

```bash
npm ci                   # clean install from lockfile (matches CI)
npx astro check
npm run lint
npm run lint:css
npm audit --audit-level=moderate --omit=dev
npm run test:run
```

If all six pass, the failure is likely E2E-only or environment-specific. Check:

- Playwright browser version mismatch (CI uses `npx playwright install --with-deps`)
- Timezone or locale dependency (CI runs in UTC)
- Network requests the test accidentally makes (all production traffic should be mocked)

### "My push/PR ran tests when I expected it to skip"

Open the run on the Actions tab and expand the **Detect Code Changes** job's "Log gate decision" step. It prints `code`, `duplicate`, `should_run`, and the matched file list — that's exactly what the gate saw.

- **`should_run=true`, large `matched-files` list (dozens of files for a one-file push)**: paths-filter is diffing against the wrong base. Confirm `base: ${{ github.ref_name }}` is present on the paths-filter step; without it, the action defaults to the repo's default branch (`master`) and the filter sees every unmerged commit on the current branch
- **`should_run=false` but jobs still ran full flow**: a step is missing the `if: needs.changes.outputs.should_run == 'true'` guard somewhere
- **`code=true`, sensible file list on a pure docs push**: the filter matched a file you didn't expect — inspect the list. Adjust the negations or add a new one (docs directory? config file? auto-generated artifact? lock file?)
- **`duplicate=false` when a prior successful run had the same content**: the prior run may have failed or been cancelled (only `success` conclusions dedupe), or the tree hash differs (one file changed that you didn't realize — check `git diff <prior-sha>..HEAD --stat`). Manual re-runs via the UI intentionally bypass dedup via `do_not_skip: ["workflow_dispatch", ...]`
- **`duplicate=true` but you wanted a re-run**: trigger via "Re-run all jobs" in the Actions UI (uses `workflow_dispatch`, bypasses dedup) rather than pushing a no-op commit
- **PR blocked with a cancelled push-event check alongside a successful pull_request-event check**: the workflow's concurrency group must be scoped by `github.event_name` — without it, the two events collide in the same group and `cancel-in-progress: true` cancels the first-started run. Immediate fix: `gh run rerun <cancelled-run-id>` on the cancelled run (safe because the sibling has already completed). Durable fix: confirm the workflow's `concurrency.group` includes `github.event_name`

Never remove the positive `**` catch-all when adding more negations — with `predicate-quantifier: 'every'`, a negation-only list always produces `code=false` regardless of the actual changeset.

### "I need to temporarily skip the hook"

**Don't.** The hook exists for a reason. If you genuinely have an emergency:

```bash
git commit --no-verify -m "emergency: ..."
```

Then immediately follow up with a normal commit that fixes whatever the hook would have caught. CI will still enforce everything the hook enforces, plus tests, so `--no-verify` only defers the problem by ~1 minute.

### "I need to update a dependency and the override blocks it"

The `overrides` block in `package.json` pins `path-to-regexp: 6.3.0`. If you upgrade `@astrojs/vercel` to a version whose transitive `path-to-regexp` is already 6.3.0+ or later, you can delete the override. Verify by running `npm audit --omit=dev` after the upgrade — if it stays at zero vulnerabilities, the override is safe to remove.

### "I want to run tests only for one file"

```bash
npx vitest run tests/unit/filterLogic.test.ts
```

Or pass a name pattern:

```bash
npx vitest run -t "categorizeGrowthStage"
```

### "I want to see the coverage report locally"

```bash
npm run test:coverage
# Then open coverage/index.html in a browser
```

---

## Post-merge manual steps for Phase 2

Two manual steps are required to complete Phase 2:

1. **Update branch protection ruleset** to add `Lint & Type Check` to the required-checks list on ruleset 12237842. Must happen AFTER the Phase 2 PR merges to master. Full `gh` CLI recipe in the hardening doc.
2. **Verify `astro dev` no longer emits the `[content] Content config not loaded` warning** — resolved by adding an empty `src/content.config.ts`, but only verifiable on a fresh dev server startup.

---

## Related documentation

- [TEST_STRATEGY.md](../testing/TEST_STRATEGY.md) — test patterns by component type
- [TEST_BEST_PRACTICES.md](../testing/TEST_BEST_PRACTICES.md) — E2E anti-patterns
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions (enforced by stylelint)

---

**Last Updated**: July 28, 2026 (`test:docs` now also runs the `VARIABLES_REFERENCE.md` ↔ `variables.css` parity guard; corrected the stale "not a required check" note on docs-integrity.yml)
