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
| Run the docs guards (link/anchor integrity + variables parity + design-sync name/ROOTS parity + published tool counts + generated-bundle freshness + i18n catalog parity/staleness) | `npm run test:docs` |
| Stamp translation catalogs against the current English (after review) / check for stale ones | `npm run i18n:stamp [locale] [ns]` / `npm run i18n:check` (see [LOCALIZATION.md](LOCALIZATION.md)) |
| Check the committed mcp-server bundles match their sources | `node mcp-server/scripts/generate-regulations-index.mjs --check` (renders in memory, writes nothing; drop `--check` to regenerate) |
| Arm the Claude review gates (once/machine) | `npm run setup:claude-hooks` (see § Claude Code review gates)            |
| Seed / clear the local stdio MCP radar snapshot | `npm run radar:seed` / `npm run radar:unseed` (mock data — see [RADAR.md § Working Offline](../hub/RADAR.md)) |
| Serve a fake `/radar/snapshot` for the **website** | `npm run radar:stub` (the stdio seed above is a different consumer — the site never reads it; needed for the content-dependent radar E2E) |
| Re-render the OAuth consent-page still for `/hub/mcp/get-started/` | `npm run media:consent-still` (esbuild + Playwright chromium + ffmpeg; write-once, see [MCP_ONBOARDING.md § Media catalog](../hub/MCP_ONBOARDING.md#media-catalog)) |
| Run E2E tests                          | `npm run test:e2e` (Chromium only: `npm run test:e2e -- --project=chromium`) |
| Run accessibility scan (axe-core)      | `npm run test:a11y`                                                          |
| Type-check the website workspace       | `npx astro check` (root tsconfig `exclude`s `mcp-server`)                    |
| Type-check the **mcp-server** workspace | `npm -w @gst/mcp-server run typecheck` (`astro check` does NOT cover it — see below) |
| Lint all JS/TS/Astro                   | `npm run lint`                                                               |
| Lint and auto-fix                      | `npm run lint:fix`                                                           |
| Lint CSS and Astro scoped styles       | `npm run lint:css` (hardcoded colors **and on-scale spacing literals** are an **error**; off-scale font sizes warn — see § stylelint configuration notes) |
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
| Purge leaked audit seqof keys (ADR-0014) | `cd mcp-server && npm run purge:audit-seqof [-- --execute]` (dry-run by default; creds via `UPSTASH_MCP_REST_URL`/`UPSTASH_MCP_REST_TOKEN` env vars — never flags; runbook: [AUDIT_LOG.md § Deactivation](../../../mcp-server/src/docs/operations/AUDIT_LOG.md)) |

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
> npm run test:docs                      # docs guards: link/anchor integrity + VARIABLES_REFERENCE parity + design-sync parity + published tool counts + generated-bundle freshness + i18n catalog parity (required check)
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

> **`test-mcp-server.yml` fires on a `paths` allowlist — keep it covering the website modules the Worker bundles.** Unlike `test.yml` (no trigger-level `paths` filter; it decides via the in-workflow `dorny/paths-filter` gate), this workflow's push and pull_request triggers both filter on paths. A PR touching only an uncovered file runs **no MCP tests at all** — and a workflow that never fires reports nothing, so the gap is silent. It is not a required branch-protection check (see the workflow's own header note), but its green run **does** gate the staging-deploy chain (`deploy-mcp-staging.yml` keys on `workflow_run.conclusion == 'success'` **plus** `event == 'push'` and a same-repository check — BL-111 defect 2; a fork `pull_request` run must never reach a secret-bearing deploy), so a silent skip stalls deploys rather than failing loudly.
>
> **BL-109 replaced the hand-maintained enumeration with directory globs** (`src/utils/**`, `src/schemas/**`, `src/data/common/**`, …) because the list had drifted twice: `src/utils/radar-url.ts` had been missing since it was introduced, and BL-109 was about to add three more entries one at a time while leaving ~10 others (the ICG / TechPar / tech-debt engines, the URL encoders, the stage adapters, the wizard config) equally unlisted. If you add a **new top-level directory** under `src/` that the Worker imports at runtime, add a glob for it.

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
│    │  2. `skip_dup` — a hand-rolled `gh api` query: does any   │
│    │     of the last 10 SUCCESSFUL runs of this workflow have  │
│    │     the same TREE hash? Outputs `duplicate: true|false`.  │
│    │     Catches push→PR redundancy: push to a branch passes,  │
│    │     the PR fires on a different commit SHA but identical  │
│    │     tree.                                                  │
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

All three of these jobs are **required status checks** on the `master` ruleset (12237842) — PRs cannot merge until they pass, and `strict_required_status_checks_policy: true` additionally requires the branch to be up to date. A fourth required context, **Verify doc links**, comes from [docs-integrity.yml](../../../.github/workflows/docs-integrity.yml) rather than `test.yml` (see the config table below), so the ruleset lists four contexts while `test.yml` supplies three of them.

> **A second ruleset used to exist and no longer does.** This section previously documented ruleset `15011377` covering `feat/**` and `fix/**`, which blocked pushes to feature branches until checks passed — shifting test failures left instead of deferring them to PR time. `GET /repos/{owner}/{repo}/rulesets` now returns only `12237842`. Whether that was removed deliberately is **not recorded anywhere**, so this note states the observation rather than a conclusion: if you want push-time gating on feature branches back, it has to be re-created, and if it was retired on purpose, replace this paragraph with that decision.

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

The job sets `permissions: { contents: read, pull-requests: read, actions: read }`. The first two let paths-filter use the GitHub API on PR events instead of falling back to git-based detection; `actions: read` is what the duplicate-run query below needs to list prior runs of this workflow.

If the gate misbehaves, check the **"Log gate decision"** step output — it prints `code=true/false`, `duplicate=true/false`, `should_run=true/false`, and the JSON-formatted list of matched files, so you can see exactly what the gate saw without having to re-derive the evaluation. If the matched-file count looks suspiciously large (e.g. dozens of files for a single-file push), the `base` configuration is wrong — paths-filter is diffing against the default branch instead of the previous commit.

#### Duplicate-run dedup (hand-rolled tree-hash query)

The gate job's `skip_dup` step dedupes on **tree hash** (content) rather than commit SHA. The canonical case it catches: a push to a branch passes all three checks → the PR fires the same workflow on a synthetic merge-ref SHA whose tree is identical (since `master` hasn't moved), so the second run is redundant work on content that's already been validated. When a match is found the gate's `duplicate` output is `true`; each downstream job's real steps skip and the "Skipped (docs-only or duplicate run)" step runs instead, reporting success to satisfy branch protection.

> **This used to be [`fkirc/skip-duplicate-actions@v5`](https://github.com/fkirc/skip-duplicate-actions)** and is now about 20 lines of shell — the action pinned Node 20, which GitHub deprecated. The replacement is deliberately dumber than what it replaced, and the differences below are behavioural, not cosmetic.

What the shell version actually does ([test.yml](../../../.github/workflows/test.yml), step `skip_dup`): query `actions/workflows/test.yml/runs?status=success&per_page=10`, fetch each run's commit tree hash, and compare against `git rev-parse HEAD^{tree}`. That is the whole mechanism. Consequences worth knowing:

- **No concurrency awareness.** The old `concurrent_skipping: 'same_content_newer'` option deduped two _in-flight_ runs against each other. An in-flight run is never `status=success`, so the shell version cannot see one. Simultaneous push and PR events on the same commit now both do the work. What keeps them from cross-cancelling is the workflow-level `concurrency.group`, which is scoped by `github.event_name` — that is still in force ([test.yml](../../../.github/workflows/test.yml)) and is what stopped a push to a branch with an open PR being cancelled the moment the PR run started, leaving branch protection with a cancelled required check.
- **Only successful runs dedupe** — the `status=success` filter. A duplicate of a failed run still triggers a fresh run. (The old `skip_after_successful_duplicate: 'true'` gave the same behaviour; the option is gone, the behaviour isn't.)
- **No event exemptions.** The old `do_not_skip: '["workflow_dispatch", "schedule", "merge_group"]'` list does not exist. Nothing is specially exempt now, including manual re-runs — see the troubleshooting section for what that does and does not imply.
- **Only the last 10 successful runs are examined.** An older duplicate outside that window is simply not found.

Note the archived initiative doc [`_archive/MCP_SERVER_CI_CD_DEPLOY_BL-037.md`](_archive/MCP_SERVER_CI_CD_DEPLOY_BL-037.md) still describes the `fkirc` action. That is **intentional** — archived docs are kept verbatim as a record of what was true when the initiative closed. Do not "correct" them.

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

**Operator note.** Since BL-111 the production deploy's first step *waits* for the MCP suite (up to 5 min) rather than failing immediately, so a run sitting in that step for a minute or two is expected, not stuck. If a production deploy is genuinely stuck `waiting` (approval) or `pending` (queued), do **not** approve a stale older run to "unstick" the queue — cancel it (`gh run cancel <id>`), which releases the group and lets the newest run reach its own approval gate. Verify the live Worker afterward with `curl -s https://mcp.globalstrategic.tech/health` and confirm `gitSha` matches the intended commit.

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
| [.github/workflows/deploy-mcp-staging.yml](../../../.github/workflows/deploy-mcp-staging.yml) | Auto-deploys the MCP Worker to staging on a green MCP test run from a same-repo push (fork PRs refused, BL-111) (BL-037 Phase A). Binds the `mcp-staging` GitHub Environment — no protection rules, purely so the deploy credentials are environment-scoped instead of readable by every job in the repo (BL-111). Not to be confused with `[env.staging]` in `wrangler.toml`, which is a Cloudflare Worker environment |
| [.github/workflows/deploy-mcp-production.yml](../../../.github/workflows/deploy-mcp-production.yml) | Auto-deploys the MCP Worker to production on master merge, gated by the `mcp-production` GitHub Environment's required-reviewer approval (BL-037 Phase B). Concurrency is **latest-wins** (`cancel-in-progress: true`): a new push cancels any older un-deployed run, so an operator only ever approves the newest run and approving it ships all prior merges (`wrangler deploy` publishes the whole Worker at that SHA). See § Production deploy is latest-wins |
| [.github/workflows/rollback-mcp.yml](../../../.github/workflows/rollback-mcp.yml) | Manual `workflow_dispatch` rollback of the MCP Worker to a prior deployment ID; production rollbacks gated by the `mcp-production-rollback` environment's required reviewer (BL-037 Phase C). The staging arm binds `mcp-staging` — no reviewer, still self-service; it binds an environment purely so its Cloudflare credentials are environment-scoped rather than repository-scoped (BL-111). **Has never executed** — worth a low-stakes staging drill before an incident forces the first run |
| [.github/workflows/npm-audit.yml](../../../.github/workflows/npm-audit.yml)       | Production-dep vuln scan — weekly cron + lockfile-change trigger                                 |
| [.github/workflows/prettier-drift-check.yml](../../../.github/workflows/prettier-drift-check.yml) | Weekly cron + manual `workflow_dispatch` — runs `prettier --check .` repo-wide; opens a `tech-debt` Issue if drift accumulates (counter-pressure for the diff-scoped PR check; see § Prettier idempotency + drift) |
| [.github/workflows/docs-integrity.yml](../../../.github/workflows/docs-integrity.yml) | Runs `npm run test:docs` — the BL-089 doc link & anchor guard plus the `VARIABLES_REFERENCE.md` ↔ `variables.css` parity guard (`tests/integration/docs-variables-sync.test.ts`) plus the claude.ai/design sync guards (`tests/integration/design-sync-guards.test.ts`, BL-135: every class/token the `.design-sync/` docs name exists in `src/styles`; `build-css.mjs` ROOTS reaches every sheet; the specimens type-check via `tsc -p .design-sync`; every chrome slice in `extract-chrome.mjs` still resolves to a route + tag/hook in `.astro` source; `conventions.md` stays under the 28,000-char guard for the consumer's 32,000-char README truncation) plus the published-tool-count guard (`tests/integration/mcp-published-tool-count.test.ts`: the ten tool counts published across `ARCHITECTURE.md`, `BREAKING_CHANGES.md`, `mcp-server/README.md` and `mcp-server/src/docs/testing/README.md`, on three different bases, bound to what `server.ts` / `tools/_local-only.ts` register) and the generated-bundle freshness guard (`tests/integration/mcp-generated-bundle-freshness.test.ts`: spawns `mcp-server/scripts/generate-regulations-index.mjs --check`, which re-renders the three committed `*.generated.ts` bundles in memory and diffs them against disk, catching one committed stale) and the i18n catalog guard (`tests/integration/i18n-catalog-parity.test.ts`, BL-153: every locale's `src/i18n/<locale>/<ns>.json` has exactly the English key set, its `.source.json` sidecar hashes match the current English so a translation cannot silently go stale, only the `tHtml` tag allowlist appears in strings, no empty strings). **The bundle-freshness guard makes this job spawn mcp-server tooling that loads prettier from the root `node_modules`** — covered by the existing root `npm ci` and cache paths, but a surprising dependency for a job named "Verify doc links". Runs on every PR + push to `master`. It exists as its own workflow because what these guards protect is markdown, so the commits that break them are docs-only diffs — the exact case `test.yml`'s `changes` gate skips. Its "Verify doc links" job **is a required branch-protection check** (added 2026-07-19; see CLAUDE.md § PR Requirements) |
| [.github/workflows/latency-probe.yml](../../../.github/workflows/latency-probe.yml) | BL-033 synthetic latency probe — cron (`30 */6 * * *`, 30 min after the Worker's radar-refresh cron) + manual `workflow_dispatch`; runs `mcp-server/scripts/probe-latency.mjs` against production, publishes a p50/p95 job summary + 90-day JSON artifact. Needs the `MCP_PROBE_KEY` secret. Deliberately NOT a required check — evidence collection, not a gate. See [LATENCY_PROBE.md](../../../mcp-server/src/docs/operations/LATENCY_PROBE.md) |
| [scripts/await-mcp-test-run.sh](../../../scripts/await-mcp-test-run.sh)           | The production deploy's pre-flight guard (BL-111) — polls the GitHub API for an MCP Server Test Suite verdict on the exact SHA being deployed, and refuses the deploy without one. Its **exit code is the contract** (0–6, table in the script header); the incident Issue body renders that table for the operator. Lives at repo root, not `mcp-server/scripts/`, because `mcp-server/**` is the first entry of both the test and production `paths` allowlists — a CI helper there would run the full MCP suite and queue a production approval on every edit. Guarded by `tests/integration/await-mcp-test-run.test.ts` (there is no shell lint in this repo) |
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
- **Regulatory map content collection**: `src/data/regulatory-map/` (123 JSON files curated manually)
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
- **Node globals are declared for scripts**: `process`, `console`, `fetch`, `Buffer`, `TextDecoder`, `AbortSignal`, … — available in `scripts/**` and any `**/*.{cjs,mjs}` (which covers `mcp-server/scripts/**`), plus `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`. **This does not contradict § Banned globals in mcp-server below**: that ban is scoped to `mcp-server/src/**` and `mcp-server/tests/**` `.ts`/`.mts` files, which none of these globs reach. Plain scripts keep bare `process` and `Buffer`. Import-less web-standard globals a Node 22 script legitimately uses get added to this list (`eslint.config.mjs` § Per-file overrides) rather than suppressed inline.

### Import bans (`no-restricted-imports`)

Two config objects set this rule, both scoped to mcp-server source. **They overlap deliberately, and the overlap is load-bearing**: in flat config, when a later object sets the same rule id for a file the earlier object also matched, the later object's options **replace** the earlier ones rather than merging. A narrower block that lists only its own pattern therefore *deletes* the broader ban for the files it matches.

| Scope                        | Bans                            | Why                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp-server/src/**`          | the live Inoreader client       | Radar reads come from the cached snapshot; a live call burns the shared upstream budget. ADR-0004 / BL-031.5.                                                                                                                                                   |
| Worker-reachable modules — `mcp-server/src/prompts/**`, `src/resources/**`, `server.ts`, `worker.ts`, `content/radar-snapshot-reader-worker.ts` | `content/radar-snapshot` — **plus a restatement of the Inoreader ban** | That module is `node:fs`-backed and resolves its cache dir from `import.meta.url`, which is `undefined` in the Worker bundle. `prompts/embed.ts` imported it, so every remote `prompts/get gst_radar_brief_today` failed with JSON-RPC `-32603` while stdio worked. Fixed in mcp-server 0.48.0. `tools/_local-only.ts` and `tools/radar-offline.ts` are deliberately excluded — they are the stdio-only surface and importing it is their job. |

The shared Inoreader pattern lives in a top-level `INOREADER_CLIENT_PATTERN` const referenced by both blocks, so the mandatory duplication can't drift. If you add a third scoped block, restate every pattern that applies to its files and add it to the const rather than copying the literal.

The radar pattern is anchored to the exact module (`**/content/radar-snapshot`, `…/radar-snapshot.ts`) — a bare `radar-snapshot*` glob would also match `radar-snapshot-reader`, which prompt code legitimately imports for the `SnapshotReader` type.

### Banned globals in mcp-server (`no-restricted-globals` + `no-restricted-syntax`)

Added by BL-137 ([ADR-0020](../adr/0020-workers-types-global-shadowing-immunity.md)), scoped to `mcp-server/src/**` and `mcp-server/tests/**`. Bare `Buffer`, `process` and `global` are errors.

`mcp-server/src/worker.ts` line 1 references `@cloudflare/workers-types`, whose `index.d.ts` is a global **script** declaring those three names at global scope (two of them `any`). A type-library reference is program-wide, so a bare use anywhere in the workspace silently loses its `@types/node` typing. The ban is what keeps the reference directive — which cannot be removed, see ADR-0020 — from mattering.

**Two rules, and both are required.** `no-restricted-globals` covers value positions ONLY; its implementation deliberately skips any reference whose parent is a type node. Run alone over `tests/integration/oauth-flow.test.ts`, whose `function b64url(buf: Buffer)` was one of the originally-broken sites, it reports nothing. The companion `no-restricted-syntax` rule uses a `TSTypeReference > Identifier[name='…']` selector to cover type positions.

Practical consequence when you hit one: for a **value** use, import it (`import { Buffer } from 'node:buffer'`, `import process from 'node:process'`) — but see ADR-0020 § Consequences, because the import alone resolves to `any` and the `process` sites need an explicit `NodeJS.Process` annotation. For a **type** use, annotate `Uint8Array` instead of `Buffer`; an import does not and should not silence the type rule. For byte length, prefer [`utf8ByteLength()`](../../../mcp-server/src/lib/utf8-bytes.ts).

Known holes, recorded rather than papered over — neither has a usage today, both were checked when the rules were written. The type-node skip list also covers `TSTypeQuery` and `TSQualifiedName`, so `typeof process.env` escapes both rules; and `globalThis.process` / `globalThis.Buffer` escape them too, since member access on `globalThis` is neither a restricted name nor a `TSTypeReference`. That second one is the obvious workaround for someone who hits the rule without reading its message.

### Ignored files

The following files are explicitly excluded from linting:

- Build output: `dist/`, `.astro/`, `.vercel/`, `coverage/`, `playwright-report/`, `test-results/`, `.cache/`, `node_modules/`, `public/`
- **`**/.wrangler/**`** (added 2026-08-04, BL-108) — Wrangler's build cache. The Worker integration tests use `unstable_dev`, which writes bundled Worker output here, so **after any `npm run test:mcp` these generated files added ~2,650 errors to `npm run lint`**. That matters more than it sounds: `lint` is one of the four authoritative validation commands, and the noise is not cosmetic — it buried a genuine one-line error in `mcp-server/src/schemas.ts` that only surfaced by grepping the output. If you see `lint` suddenly report thousands of errors in files you did not write, check for a newly generated directory rather than a newly broken rule.
- **`ds-bundle/**` and `.ds-sync/**`** (added 2026-08-16) — claude.ai/design sync artifacts, and the same failure mode as `.wrangler` above. `ds-bundle/` is the converter's generated output; it embeds a vendored React UMD build that alone contributed **~1,980 errors to `npm run lint`**, enough to make the command unusable. `.ds-sync/` is the skill's staged scripts plus their isolated dep tree. Both are gitignored and regenerated on every sync. The **authored** sources under `.design-sync/` are deliberately NOT excluded — they are hand-written, committed, and should be linted. See [CLAUDE_DESIGN_SYNC.md](./CLAUDE_DESIGN_SYNC.md).
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

The base rules are duplicated inside the `.astro` override. **The reason previously given here — that stylelint's `extends` + `overrides` interaction does not inherit rules from the parent config — is wrong**, corrected 2026-09-02 by running it: a rule declared ONLY in the base block fires on a `.astro` file (and one declared only in the override does NOT fire on `.css`, which is the direction that matters). So the duplication is belt-and-braces, not load-bearing — but keep the two rule sets in sync anyway, because a rule added only to the override silently skips every plain stylesheet.

#### Design-token enforcement (added July 28, 2026)

Two rules enforce the "no hardcoded values" convention from [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md). Both are declared in **both** rule blocks (base + `.astro` override).

| Rule                                                | Properties                                                     | Severity    | Effect                                                              |
| --------------------------------------------------- | -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `scale-unlimited/declaration-strict-value`           | `/color$/`, `fill`, `stroke`, `box-shadow`, `text-shadow`      | **error**   | A hardcoded color fails `lint:css`, the pre-commit hook, and CI      |
| `declaration-property-value-allowed-list`            | `font-size`                                                     | **warning** | Off-scale font sizes are reported but do not fail the build (BL-094) |
| `declaration-property-value-disallowed-list`         | `padding`, `margin`, `gap`, `inset`, `top`/`right`/`bottom`/`left`, `outline-offset` and their longhands | **error**   | A rem spacing literal that has an exact token fails `lint:css` (ADR-0029) |

Configuration notes — each of these is load-bearing, do not "simplify" them:

- **`expandShorthand: true`** means shorthands are checked at their color slot only. `border: 1px solid var(--x)` passes; `border: 1px solid #fff` fails. This is why `border`/`background`/`outline` are **not** listed as properties — listing them would flag the width/style tokens too.
- **`ignoreFunctions: false`** with `"/var[(]/"` in `ignoreValues` means "any value that references a token passes". That admits `light-dark(var(--a), var(--b))`, `color-mix(in srgb, var(--x) 12%, transparent)` and `rgba(var(--rgb), .5)` while still rejecting `light-dark(#fff, #000)` and `rgba(0, 0, 0, .5)`.
- Regexes in `ignoreValues` use a character class — `"/var[(]/"`. The double-backslash form (`"/var\\(/"`) also works, but the single-backslash spelling a maintainer reaches for first is **invalid JSON** and aborts stylelint with a "Bad escaped character" parse error. The character class sidesteps escaping entirely.
- `box-shadow`/`text-shadow` are not expandable shorthands, so they are listed explicitly; the numeric-length and `inset` entries in `ignoreValues` let their geometry through while the color slot is still checked.
- **Custom property declarations are never checked.** `--my-token: #c44040` is always allowed — that is how tokens are defined, and how the documented exceptions below stay legal.
- **The spacing rule is a DIFFERENT rule on purpose, and this is the one thing not to "simplify".** Adding `padding`/`margin`/`gap` to `scale-unlimited/declaration-strict-value` is the obvious move and a **silent no-op**: that rule's `ignoreValues` carries `/^-?[0-9.]+(px|rem|em|%)?,?$/`, which matches any bare number-plus-unit, so `padding: 1.5rem` is ignored by construction. `declaration-property-value-disallowed-list` is a core rule with no `ignoreValues` of its own, which is how it evades the trap instead of fighting it. It lists the ten on-scale rem values longest-first (so `1.5rem` cannot match as `1` plus a failed `rem`), with a leading `(?!.*calc\()` that preserves ADR-0028's ruling that a value inside `calc()` is a derived constant, and a `(?<![\w.-])` lookbehind so `21rem`, `12.5rem` and `-0.25rem` do not match. Its property list mirrors `spacing-token-floor.test.ts`'s `SPACING_PROPS` exactly — divergence would mean `top: 1rem` failing one instrument and passing the other. `tests/integration/spacing-lint-rule.test.ts` proves it fires by mutation and binds its value list to `variables.css`; **off-scale** spacing values are governed by `spacing-token-floor.test.ts`'s residual table, not by lint.
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

The base and override configs both register `layer` as an allowed at-rule (`at-rule-no-unknown: [true, { "ignoreAtRules": ["import", "layer"] }]`) so CSS cascade layer declarations parse cleanly if one is ever introduced.

**No CSS under `src/styles` uses the at-rule.** This section previously described a live `@layer reset, tokens, utilities, components, theme, overrides;` scheme; no such scheme exists, and the cascade is plain source order throughout. That matters — source order at equal specificity is exactly what made `.container`'s responsive gutter rules sit dead in `components/buttons.css` for months, shadowed by the base rule that `global.css` declares after importing it. Introducing layers would be a real architectural decision needing its own ADR; permitting the at-rule in lint config is not that decision.

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
npm run test:a11y        # Scans 32 routes (Chromium)
```

This runs `tests/e2e/accessibility.test.ts`. The route list lives in that file's `PAGES` array — read it there rather than duplicating it here, because a copy in this doc rots (it did: it named 9 routes for a suite that scanned 22). It covers the marketing pages, the legal/confirmation pages, `/404`, all four `/hub/library/*`, the hub gateways and all seven tool pages, the five `/hub/mcp/*` pages, `/brand` and `/hub/radar/`, plus the Spanish and Portuguese About routes (BL-153). **Routes, not pages**: `/hub/mcp/docs/` is scanned three times, so those five pages are seven entries. Count the array when you change this number rather than incrementing it; every stale value this line has carried came from adding a route and adjusting the count by memory.

`/hub/radar/` waits for its `server:defer` island to resolve before scanning; with no `MCP_KEY_WEBSITE_RADAR` bound it scans the shell plus the empty state — bind `npm run radar:stub` to cover the feed items too.

The `wcag22aa` tag was added 2026-08-03 and selects exactly one rule in axe-core 4.12.1: `target-size`. It enforces the AA half of the touch-target ruling (24×24) on every scanned route; `tests/integration/touch-target-floor.test.ts` enforces the 44px AAA floor on the guarded families from source. See [BRAND_GUIDELINES § Accessibility](../styles/BRAND_GUIDELINES.md#accessibility).

### How the ratchet works

- **Critical violations**: must always be zero — blocks merge
- **Serious violations**: new violation IDs must be zero; pre-existing ones can be tracked in a `KNOWN_SERIOUS` map of max node counts, keyed by route NAME rather than path (of the three entries under `/hub/mcp/docs/`, two share the bare path — the Jobs lens collapsed and expanded — and see different node counts; the third carries a hash)
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

- **Never use `process.env` in `src/`** — ESLint `no-restricted-properties` enforces this. Use `astro:env/server` or `astro:env/client` instead. **One recorded exception**: `src/i18n/locales.ts` reads `PUBLIC_I18N_LIVE_LOCALES` from `process.env` under an inline `eslint-disable-next-line`, because `astro.config.mjs` imports that module before Astro's env layer exists (same reason the config itself uses `process.env`). It is a build/dev-server input, never read by page scripts — see [LOCALIZATION.md § Testing](LOCALIZATION.md#testing).
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

**Why `--omit=dev`**: dev-only advisories (e.g., `@astrojs/check` → `yaml-language-server` → `yaml`) affect local development tooling but never reach users. **Production dependencies must stay at zero advisories — that is the enforced gate.** Dev-only advisories are tolerated **at any severity, including high**, and revisited case-by-case; the deciding question is reachability, not the CVSS band, because a flaw in a CLI that runs on a developer's machine or in CI has a different threat model from one in code served to users.

Two consequences worth stating, since the severity-blind rule is easy to misread as laxness:

- **Tolerated is not ignored.** Each dev-only advisory should have a named chain and a reason it cannot reach users (see the current state below). An advisory nobody can explain is a finding, whatever the tool says.
- **The gate is severity-based (`--audit-level=moderate`) but the _policy_ is not.** The flag exists so the command exits non-zero on anything that matters in production; it is not a statement that dev-only highs are acceptable and dev-only moderates are not.

_(This paragraph previously read "dev-only **moderate** advisories are tolerated", which never matched practice — the tree has carried tolerated dev-only highs continuously. Corrected 2026-08-04.)_

**Current production state** (re-measured 2026-09-03 after the `fast-uri` / `qs` override bumps, wrangler `4.127.1`): **zero vulnerabilities** on the enforced gate (`--omit=dev`).

The **full tree, dev included, carries 6 dev-only advisories** (all high) in **one** chain, tolerated per the policy above with a named reachability argument:

- `@lhci/cli → @lhci/utils → lighthouse → puppeteer-core → @puppeteer/browsers → extract-zip` (6 entries, all high, all rooted in one advisory — `extract-zip` unvalidated symlink path traversal) — Lighthouse CI runs only in the CI performance job; the archive it extracts is the Chrome build puppeteer fetches from Google's CDN, not attacker-supplied input. **No non-destructive fix**: npm's only offer is `@lhci/cli@0.12.0`, a semver-major downgrade — the same shape as the `tmp`/`uuid` situation the override list below already describes for lhci.

The `wrangler → miniflare → undici` chain this section tracked from 2026-08-04 is **cleared, and stayed clear when wrangler was unpinned**. It first cleared 2026-08-21 at the exact `4.121.0` the Dependabot batch landed on; BL-137 lifted that pin on 2026-08-22 and re-measured at `^4.125.0` — still outside the vulnerable range, and the six dev-only advisories below are the whole of the full-tree result, with no `wrangler`/`miniflare`/`undici` entry among them. That re-measurement is what allowed the pin to go: the clearance was never wrangler-version-specific. `@sentry/cli`'s separate `undici@6.28.0` node, cleared by hand on 2026-08-17, remains clean. Verified with `npm audit --json`. **Check the `via` field, not the node paths** — only two of the six entries are `@lhci/*`-rooted (`node_modules/@lhci/cli`, `node_modules/@lhci/utils`); the other four sit at `node_modules/lighthouse`, `node_modules/puppeteer-core`, `node_modules/@puppeteer/browsers` and `node_modules/extract-zip`, hoisted to the root where their paths no longer name the chain that reached them. All six trace through the single direct dependency `@lhci/cli` to one `extract-zip` advisory, and `via` is what shows that.

> **Superseded 2026-08-22 (BL-137).** This blockquote used to read "Do not merge [#419](https://github.com/Global-Strategic-Technologies/gst-website/pull/419), or any Dependabot PR raising `wrangler` past `4.121.0`", because such a PR would drag `@cloudflare/workers-types` into the range the held pins excluded. **That instruction is now wrong in both halves**: the pins are lifted, wrangler is on `^4.125.0`, and `workers-types` global shadowing no longer breaks anything (see [ADR-0020](../adr/0020-workers-types-global-shadowing-immunity.md)). Wrangler Dependabot PRs are ordinary reviews again.

_(This paragraph read "3 dev-only advisories … all one chain" from 2026-08-04 until 2026-08-17, when it was measured again and found to be describing a third of the tree; it then read "9 … in two chains" until 2026-08-21, when the wrangler chain cleared. Re-measured 2026-08-22 on the unpinned wrangler: still 6, still one chain; and again 2026-09-03 on wrangler `4.127.1`: still 6, still the one `extract-zip` chain. Dev-only advisories fail nothing, so this paragraph only ever matches reality when someone re-measures it — do that before citing it.)_

History, most recent first:

- **2026-09-04 (#447)** — follow-on to the entry below, merged after it: the same override fix had been prepared on a second branch, and the review of that branch asked for something the required suite would catch, so it added the overrides guard (`tests/integration/overrides-honoured.test.ts`). The guard's first run retired three entries the tree had already resolved past (`hono`, `@hono/node-server`, the SDK-scoped `express-rate-limit`); the audit stayed at zero and no installed version changed (guard authored and entries removed 2026-09-03; merged the next day). The branch also carried the eighteen wrangler-subtree `devOptional` normalisations a plain `npm install` had been rewriting since #438, but #449 landed the same flips first, so the merged PR changes no lockfile line.
- **2026-09-04** — red on master since 2026-09-03 (three runs) with **4 production advisories** (1 high, 3 moderate), all published against already-pinned versions in the `agents → @modelcontextprotocol/sdk` tree: `fast-uri@3.1.5` (four host-confusion / SSRF advisories via URI normalization, `GHSA-5jgf-p345-68v8`, `GHSA-f65p-4m7j-42xc`, `GHSA-fph4-wmhf-6fwf`, `GHSA-jqff-g426-hqxp`; vulnerable `3.0.0–3.1.5`, so the override that closed the August advisory was itself the flagged version) and `qs@6.15.3` (array-limit bypass `GHSA-x5fp-wj9c-mxmx` + isBuffer DoS `GHSA-4mjr-xmp4-gh2g`; vulnerable `2.2.5–6.15.3`), the latter also surfacing `body-parser` and `express` as depends-on-vulnerable findings. Cleared by advancing the `fast-uri` override to `3.1.7` and adding a flat `qs: 6.16.0` override; both in range, lockfile diff exactly the two entries, `test:run` and `test:mcp` green on the bumped tree. Found because the branch it was fixed on happened to touch the lockfile (the audit workflow's push trigger) — the BL-136 observation stands: nothing reports a red audit on master.
- **2026-08-17** — the gate had been red on master and on every branch since ~2026-08-14 with **2 production highs**, both transitive, both with a published in-range patch: `js-yaml` 4.3.0 → 4.3.1 (`GHSA-5p4m-2wfm-xmqj`, quadratic CPU in `!!omap` resolution; via `astro` and `@astrojs/internal-helpers`) and `nanoid` 3.3.16 → 3.3.18 (`GHSA-2v37-7h3g-55p8`, custom generators loop forever at size 0; via `vite → postcss`). Cleared by `npm update js-yaml nanoid --package-lock-only` — no override, no `package.json` change, nine lockfile lines. The same update carried the v3-legacy `js-yaml` 3.15.0 → 3.15.1 under `@lhci/utils`, which independently cleared the dev-tree copy. **Nothing in the pipeline reported this for three days** — the audit job is not a required check, so a red run blocks nothing and notifies no one; Dependabot could not have caught it either, since neither package is a declared dependency and security updates (the mechanism that does handle transitives) are switched off for this repo. See BL-136. The same session also bumped the dev-only `undici` 6.27.0 → 6.28.0 under `mcp-server`'s `@sentry/cli` (in range at `^6.22.0`) — not required by the gate, done because the alternative was documenting a free fix and declining it; `@sentry/cli` is the release/sourcemap-upload CLI and runs on a developer machine or the CI runner only. That `npm update undici` also carried jsdom's node 8.9.0 → 8.10.0 (in range at `^8.9.0`, neither version in any advisory range) — which is why the lockfile diff is larger than two entries.
- **2026-08-04 (BL-106)** — the gate had regressed to **8 production advisories** (4 moderate, 4 high) from newly-published CVEs against already-pinned versions: `hono@4.12.32`, `fast-uri@3.1.4`, `ip-address@10.2.0`, `brace-expansion@5.0.8`. Fleet-wide drift, not introduced by a PR. Cleared by advancing each pin to its patched release, all within the same major. The `@lhci/cli → chrome-launcher → rimraf@3 → glob@7 → minimatch@3.1.5 → brace-expansion` chain cited here for months is **no longer a finding** — it resolves `brace-expansion@1.1.18` and is clean.
- **2026-07-24** — restored to prod-zero after an earlier batch of newly-published CVEs regressed the tree: a non-breaking `npm audit fix` cleared the `tar`/`sharp`/`postcss`/`svgo` chains (including a critical node-tar advisory), and the override bumps below cleared the rest.

**Package overrides** — see [package.json](../../../package.json) `overrides` block. Every entry is checked against the lockfile by [`tests/integration/overrides-honoured.test.ts`](../../../tests/integration/overrides-honoured.test.ts) (part of `npm run test:run`, a required check): an override is a security **floor**, so the guard fails when any copy an override governs resolves *below* its pin, or when the override names a package the tree no longer contains — the failure the dead-scoped-key episode below had nothing to catch it with. It deliberately does NOT fail on a copy *above* the pin: that is npm resolving past a floor that no longer binds, which is the doc's exit condition for deleting the entry, not a vulnerability. The first run of the guard (2026-09-03) found three entries in exactly that state and they were removed the same day (see the struck entries below).

- `path-to-regexp: 6.3.0` — forces the patched version across the dependency tree to close `GHSA-9wv6-86v2-598j` without a destructive `@astrojs/vercel` downgrade. **Still load-bearing, re-verified 2026-09-03**: deleting it resolves `@vercel/routing-utils`'s copy back to the vulnerable `6.1.0`. The tree also carries an un-overridden `path-to-regexp@8.4.2` under `router` (`express@5` inside the SDK) — above the floor, not a finding. Re-evaluate when `@vercel/routing-utils` ships a clean upgrade path.
- `fast-uri: 3.1.7` — patched `fast-uri` for the ajv subtree (transitive via `@modelcontextprotocol/sdk → ajv@8.20.0`, which declares `^3.0.1`), closing the host-confusion advisories `GHSA-v2hh-gcrm-f6hx` + `GHSA-4c8g-83qw-93j6`, the backslash-authority-introducer advisory from 2026-08 (vulnerable `3.0.0–3.1.4`), and the four 2026-09 SSRF / host-confusion advisories (vulnerable `3.0.0–3.1.5`). Stays on the 3.x line — deliberately NOT 4.x, which would violate ajv's `^3.0.1`. Re-evaluate when ajv widens its range to `^4`.
- `qs: 6.16.0` (**top-level**, added 2026-09-04 in #449) — closes `GHSA-x5fp-wj9c-mxmx` + `GHSA-4mjr-xmp4-gh2g` (vulnerable `<=6.15.3`). The tree holds a single `node_modules/qs` node, reached through `agents → @modelcontextprotocol/sdk → express@5` / `body-parser@2` (declaring `^6.14.0` / `^6.15.2`), through `express-rate-limit → express@4` / `body-parser@1` inside the SDK (both `~6.15.1`), and through the dev-only `@lhci/cli → express@4`; only the `~6.15.1` consumers are materially bound by the floor, which lifts them one minor. Remove when express 4 / body-parser 1 ship declaring `qs >=6.16.0`, or when the SDK drops `express-rate-limit` (check with `npm ls qs --all`).
- ~~`hono: 4.12.34`~~ (**top-level**) — **removed 2026-09-03.** It closed the hono/jsx cross-request-disclosure + header advisories and the CORS-middleware ReDoS (vulnerable `<4.12.34`). The first run of the overrides guard showed the tree resolving `hono@4.13.3` on its own (`@hono/node-server@2.1.1` peers on `^4`), so the pin governed nothing; deleted per its own exit condition, and `npm audit --omit=dev` stayed at zero. The BL-106 history stays instructive: this entry was previously scoped under `@modelcontextprotocol/sdk` and `@hono/node-server`, and **path-scoped override keys stop resolving when the parent moves in the tree** — once BL-106 dropped the SDK as a direct dependency (it is now only an `agents` peer), both scoped keys silently went dead, npm reporting `invalid: "4.12.34" from …` while leaving `4.12.32` installed. Prefer the flat form for packages that appear once in the tree; reserve scoped keys for genuine subtree-only pins (`@lhci/cli` below). Re-add if a future resolution drops `hono` below `4.12.34`.
- ~~`@modelcontextprotocol/sdk → { express-rate-limit: 8.5.1 }` and `@hono/node-server → { ".": 2.0.11 }`~~ (scoped) — **removed 2026-09-03**, both on the exit condition named here ("re-evaluate when the SDK declares `@hono/node-server ^2`"): `@modelcontextprotocol/sdk@1.30.0` now declares `^1.19.9 || ^2.0.5` and resolves `@hono/node-server@2.1.1` and `express-rate-limit@8.6.2` unaided, above both pins, so the guard reported the entries as governing nothing. History: `@hono/node-server@2.0.11` closed its Windows serve-static path-traversal (`GHSA-frvp-7c67-39w9`, `<2.0.5`) and the `.` self-key forced a 1.x→2.x major outside the SDK's then-declared `^1.19.9`, accepted because the Worker uses the Web-standard `createMcpHandler` transport, not the Node adapter; `express-rate-limit: 8.5.1` closed the depends-on-vulnerable-`ip-address` advisory, which the flat `ip-address` pin below still covers.
- `ip-address: 10.3.1` (**top-level**, promoted from `express-rate-limit`-scoped in BL-106 for the same path-scoping reason as `hono`) — closes three SSRF / trust-boundary-bypass advisories: leading-zero octet decoding (vulnerable `<=10.3.0`), CIDR-suffix suppression of special-use classification, and IPv4-mapped/NAT64 misclassification. Remove when express-rate-limit ships with `ip-address >10.3.0`.
- ~~`esbuild: 0.28.1`~~ — **removed 2026-08-21**, on the exit condition this entry itself named ("remove when the tree's esbuild consumers resolve to `>=0.28.1` naturally"). That condition is now met — but **by resolution, not by declared floors, and the distinction matters to anyone re-auditing this.** Several declared ranges still floor *inside* the vulnerable `0.17.0–0.28.0` window — `astro` and `@astrojs/vercel` both declare a dependency on `^0.28.0`, and `vite@8` declares an *optional peer* on `^0.27.0 || ^0.28.0` (peer, not dependency: vite ships no `dependencies.esbuild` entry at all). What has changed is that npm's highest-satisfying resolution now lands every one of them on `0.28.1` or above, and the committed lockfile holds that. Two consumers do floor above it on their own (`agents` at `^0.28.1`, `mcp-server` at `^0.28.2`), and `wrangler` pins an exact `0.28.1`. The override was also about to become actively wrong rather than merely redundant: being flat, it *would have* forced `mcp-server`'s newly-raised `^0.28.2` **down** to `0.28.1`, so the manifest would ask for one version and the tree install another — on master, where `mcp-server` declared `^0.28.0`, the override was still satisfiable and that conflict did not exist. Verified after removal with `npm ls esbuild --all` (no `invalid`, nothing below `0.28.1`), a clean `npm ci --dry-run`, and `npm audit --audit-level=moderate --omit=dev` → 0 vulnerabilities. **Re-add the override if a future resolution drops any consumer back to `<=0.28.0`** — the declared floors do not prevent it.
- `@lhci/cli → { tmp: 0.2.7, uuid: 11.1.1 }` (scoped, added 2026-07-15) — `@lhci/cli@0.15.1` (latest) still pins `tmp@0.1.0`/`0.0.33` (`GHSA-52f5-9888-hmc6` + `GHSA-ph9p-34f9-6g65`, high) and `uuid@8.3.2` (`GHSA-w5hq-g745-h8pq`, moderate); npm audit's only suggested "fix" is a destructive downgrade to `@lhci/cli@0.1.0`. The scoped override forces the patched transitive versions inside lhci's subtree only, which also clears the dependent `external-editor`/`inquirer` advisories. Verified via `npx lhci healthcheck` + the CI lighthouse job. Remove when `@lhci/cli` ships with `tmp >=0.2.6` and `uuid >=11.1.1` (check with `npm ls tmp uuid --all` after a Dependabot lhci bump, then delete the override and re-run `npm audit`).

> **Not an override** (re-confirmed 2026-08-04): the prod `brace-expansion` advisories — `GHSA-3jxr-9vmj-r5cp`, `GHSA-mh99-v99m-4gvg`, and the 2026-08 DoS bypassing the CVE-2026-14257 mitigation (vulnerable `4.0.0–5.0.8`) — reach the tree via `@astrojs/vercel → @vercel/nft → glob@13 → minimatch@10` and are cleared by a plain lockfile bump to the patched `5.0.9`, which is in range for minimatch@10's `^5.0.5`. No override is needed or wanted.
>
> A flat `"brace-expansion"` override was tried during BL-106 and **reverted the same session**: it forces v5 onto the dev `minimatch@3.1.5` (which declares `^1.1.7`), whose CJS build exports a named `expand`, so `glob@7`'s `braceExpand` dies with `TypeError: expand is not a function` — reproducible via `node -e "require('./node_modules/rimraf/node_modules/glob').hasMagic('C:/tmp/{a,b}.txt')"`. The 2026-07 note predicting exactly this cross-major break was right; the BL-106 entry that briefly claimed "that risk did not materialise" was wrong and is deleted. If a pin ever becomes genuinely necessary, scope it under `@vercel/nft` rather than flat.

> **Lockfile caution (learned in BL-106).** Editing `overrides` alone is not always enough: npm can keep a stale transitive pinned and report `invalid: "<wanted>" from …` while installing the old version. Do **not** hand-delete the offending `package-lock.json` entry — npm then treats the package as unnecessary and drops it from the tree entirely, which passes `npm audit` for the wrong reason. Verify with `npm ls <pkg>` (the version must not say `invalid`) and, if the pin is stubborn, confirm the intended resolution by regenerating a lockfile from scratch in a throwaway worktree before touching the committed one.

**Held version pins** — none currently. This slot previously held exact pins on `@cloudflare/workers-types` (`5.20260804.1`) and `wrangler` (`4.121.0`), added 2026-08-21 and **lifted 2026-08-22 by BL-137**. Both are back on caret ranges (`^5.20260822.1` / `^4.125.0`).

Why they existed, and why they no longer need to: from `5.20260807.2`, workers-types' `index.d.ts` declares `Buffer`, `process` and `global` at global scope. That file is a global SCRIPT, and [mcp-server/src/worker.ts](../../../mcp-server/src/worker.ts) line 1 references it, so the shadowing applied program-wide — silently, because two of the three are `any`. The pins held the shadowing out. BL-137 removed the _dependence_ instead: `mcp-server/src` no longer touches either global, ESLint forbids reintroducing them in value or type position, and a curated declaration-name allowlist test fails on any future release that adds a global we would care about. Full rationale, including what was rejected: [ADR-0020](../adr/0020-workers-types-global-shadowing-immunity.md).

> The old entry said **"patching the three call sites was rejected"**, because patching them would paper over a program-wide `any` regression while leaving the shadowing in place. That reasoning was sound, and is **not** what BL-137 did — the call sites were removed rather than patched, so the shadowing is inert rather than hidden. Note also a fact the old entry could not have known: importing from `node:process` / `node:buffer` does **not** on its own restore `@types/node` typing, because those modules export the very global binding that got redeclared. Explicit `NodeJS.Process` annotations are load-bearing at the three `process` sites — see ADR-0020 § Consequences before "simplifying" them away.

**If a future pin is needed here**, note the shape the old ones had: an exact version (not a caret) on a **direct** dependency in [mcp-server/package.json](../../../mcp-server/package.json), because a floating range re-resolves to the broken version on any lockfile regeneration — which is exactly how Dependabot proposes updates. And `wrangler` cannot be pinned independently of `@cloudflare/workers-types`: it declares the types package as a peer and raises that floor almost every release (`4.125.0` peers `^5.20260820.1`), so npm fails with `ERESOLVE` rather than warning if the two disagree.

**Automated dependency updates** — [Dependabot](../../../.github/dependabot.yml) opens PRs weekly for npm and GitHub Actions version bumps. When reviewing Dependabot PRs that update `@astrojs/vercel` or `@vercel/routing-utils`, check whether the `path-to-regexp` override can be removed by running `npm audit --omit=dev` after deleting the `overrides` block. `@cloudflare/workers-types` and `wrangler` used to carry `ignore` entries in that config to hold them below the pins above; **both were deleted together on 2026-08-22** when BL-137 lifted the pins (deleting only one would have re-created the `ERESOLVE` the pair prevented). There is no `ignore` block in the config now. A workers-types release that adds a global shadowing `@types/node` fails [`workers-types-globals.test.ts`](../../../mcp-server/tests/integration/workers-types-globals.test.ts) on the Dependabot PR itself, which is the signal the blanket ignore used to suppress — see [ADR-0020](../adr/0020-workers-types-global-shadowing-immunity.md) for how to triage such a failure (curate the allowlist; do not regenerate it).

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
- **`duplicate=false` when a prior successful run had the same content**: the prior run may have failed or been cancelled (only `success` conclusions dedupe), or the tree hash differs (one file changed that you didn't realize — check `git diff <prior-sha>..HEAD --stat`), or the matching run has fallen outside the 10 most recent successful runs the query examines
- **`duplicate=true` but you wanted a re-run**: there is **no event exemption any more.** The `do_not_skip` list belonged to `fkirc/skip-duplicate-actions` and did not survive the move to the hand-rolled query, so nothing — including "Re-run all jobs" — is specially exempt. What a UI re-run does is therefore not a special case, it is the ordinary rule applied again: the step re-queries the last 10 successful runs and skips only if one of them still carries this tree hash. Do not assume either outcome; read the `duplicate=` line in the re-run's own gate log. If you need the work to definitely happen, change the tree (this is the one case where a no-op commit is the honest tool, not a workaround)
- **PR blocked with a cancelled push-event check alongside a successful pull_request-event check**: the workflow's concurrency group must be scoped by `github.event_name` — without it, the two events collide in the same group and `cancel-in-progress: true` cancels the first-started run. Immediate fix: `gh run rerun <cancelled-run-id>` on the cancelled run (safe because the sibling has already completed). Durable fix: confirm the workflow's `concurrency.group` includes `github.event_name`

Never remove the positive `**` catch-all when adding more negations — with `predicate-quantifier: 'every'`, a negation-only list always produces `code=false` regardless of the actual changeset.

### "There are cancelled MCP staging deploys on every PR"

**They are almost certainly `skipped`, not `cancelled`.** GitHub draws both with a grey circle-slash icon and they are indistinguishable at list density. Check before diagnosing:

```bash
gh api "repos/:owner/:repo/actions/workflows/deploy-mcp-staging.yml/runs?per_page=20" \
  --jq '.workflow_runs[] | "#\(.run_number) \(.conclusion)"'
```

As of 2026-08-16 that workflow has **0 cancelled runs in 339**, and 21 skipped. (Cancelled runs on `deploy-mcp-production.yml` are a different, expected thing — see § Production deploy is latest-wins.)

A skipped run means one clause of the job `if:` in [deploy-mcp-staging.yml](../../../.github/workflows/deploy-mcp-staging.yml) was false. It is a **three-clause AND**, and the arms are not equally benign:

- **`event == 'push'` failed** — the upstream run was a `pull_request` event. Routine: the MCP suite fires on both `push` and `pull_request`, both runs are named `MCP Server Test Suite`, and `workflow_run` has no filter for the triggering run's event type, so GitHub creates the consumer run and the job `if:` (BL-111 fork-trust guard) then skips it. Nothing deployed because nothing should have.
- **`conclusion == 'success'` failed** — and this is **not one thing**. `failure` means the MCP suite went red and the deploy was correctly withheld: that is a real signal, not noise. `cancelled` is benign when it occurs — [test-mcp-server.yml](../../../.github/workflows/test-mcp-server.yml) runs `cancel-in-progress: true`, so a superseded run is cancelled and the *winning* push deploys (verified empirically 2026-05-31). `timed_out` and `action_required` land on the same arm; treat the list as open, not closed. For calibration: of the 21 skips to date, 15 are the `pull_request` arm and 6 are `failure` — **none has yet come from a cancellation**, so do not assume that reading.
- **`head_repository` failed** — a fork. Unexercised; the repo has no forks.

**Do not diagnose from the consumer run alone.** Its own conclusion is just `skipped`, and you cannot cross-reference by SHA: a `workflow_run` consumer is attributed to the **default branch**, so its `head_sha` and `head_branch` are master's, not the triggering run's (the real SHA is read from the event payload at the checkout step). Read the *triggering* run:

```bash
gh api "repos/:owner/:repo/actions/runs/<consumer-run-id>" \
  --jq '.referenced_workflows, .triggering_actor.login'
gh api "repos/:owner/:repo/actions/workflows/test-mcp-server.yml/runs?per_page=20" \
  --jq '.workflow_runs[] | "\(.created_at) ev=\(.event) concl=\(.conclusion) br=\(.head_branch)"'
```

and match on timestamp — the consumer is created 1–3 seconds after the run that triggered it.

**A `branches:` mismatch is not a skip cause.** If the triggering branch isn't in the consumer's `branches:` list, GitHub creates **no run record at all** — there is nothing grey to see. Positive evidence: `dependabot/**`, `docs/**` and `chore/**` upstream runs, including failed ones, produce zero staging rows because those families are deliberately absent from the consumer's list. A silent absence is the failure mode to worry about here, which is why `tests/integration/workflow-chain-integrity.test.ts` asserts `master` is in both branch lists.

### "A check never finishes — no logs, or no job at all"

Distinct from the gate-decision symptoms above: the check does not report a wrong _answer_, it reports **no** answer. Check [githubstatus.com](https://www.githubstatus.com) before investigating anything in this repo — during an Actions incident no config change helps.

Full triage (step-name vs step-count, the three job shapes, and why re-running during an incident is counterproductive) lives in [TROUBLESHOOTING.md § "A check is stuck"](../testing/TROUBLESHOOTING.md#a-check-is-stuck--running-for-minutes-with-no-logs-or-queued-with-no-job-at-all).

**This is not the `gh run rerun` case above.** That remedy applies to a check that ran and was _cancelled by a concurrency collision_, where a sibling run has already completed. A run wedged by an incident may instead report contradictory states to `gh run list` / `cancel` / `rerun` and be unrecoverable — there, close+reopen the PR is the remedy, since `reopened` creates fresh runs.

### "I need to temporarily skip the hook"

**Don't.** The hook exists for a reason. If you genuinely have an emergency:

```bash
git commit --no-verify -m "emergency: ..."
```

Then immediately follow up with a normal commit that fixes whatever the hook would have caught. CI will still enforce everything the hook enforces, plus tests, so `--no-verify` only defers the problem by ~1 minute.

### "I need to update a dependency and the override blocks it"

The `overrides` block in `package.json` pins `path-to-regexp: 6.3.0`. If you upgrade `@astrojs/vercel` to a version whose transitive `path-to-regexp` is already 6.3.0+ or later, you can delete the override. Verify by running `npm audit --omit=dev` after the upgrade — if it stays at zero vulnerabilities, the override is safe to remove.

### "The localization E2E spec cannot reach its server" (BL-153)

`playwright.config.ts` boots **two** dev servers. The first is the usual one on 4321 (reused locally if you already have one running), started as `npx astro dev --port 4321` rather than `npm run dev`: on Windows the `npm run` shell sat between Playwright and node, so the server outlived every run, was reused by the next, and twice died mid-suite. The second is `astro dev --port 4326 --ignore-lock` with `PUBLIC_I18N_LIVE_LOCALES=es,pt-BR` and `ASTRO_DEV_BACKGROUND=0`, never reused, and `tests/e2e/localization.test.ts` pins its `baseURL` to it. It exists because the language switcher and the first-visit band render only while ≥2 locales are **live**, which production is not yet, and the override is a build/dev-server input that a reused 4321 server cannot carry — so it gets a server of its own, and your 4321 server is never touched. The spec asserts first that the served page reports ≥2 live locales, so a mis-wired server fails loudly rather than passing against a page with no switcher.

Astro auto-increments a busy port: if something already holds 4326 the second server comes up on 4327 and the pinned URL misses it. Free 4326 (kill by port) rather than moving the pin. In CI nothing holds the port, so both servers boot cold. Details: [LOCALIZATION.md § Testing](LOCALIZATION.md#testing).

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

**Last Updated**: August 16, 2026 (MCP deploy-chain integrity asserted in `tests/integration/workflow-chain-integrity.test.ts`; the duplicate-run dedup section corrected to describe the hand-rolled tree-hash query that replaced `fkirc/skip-duplicate-actions`; ruleset `15011377` recorded as no longer existing; new troubleshooting entry for skipped-vs-cancelled staging deploys)
