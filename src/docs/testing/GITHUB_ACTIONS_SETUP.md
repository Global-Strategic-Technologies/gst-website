# GitHub Actions + Vercel Setup Guide

## What Just Happened?

One GitHub Actions workflow file in `.github/workflows/`:

1. **test.yml** - Runs on push to `master`/`dev` and PRs to `master`
   - Unit & Integration tests (Node 22.x)
   - E2E tests with Playwright
   - Build verification
   - Coverage summary in GitHub Actions step summary
   - Concurrency group deduplicates when both push and PR fire for the same branch

Vercel handles deployments independently (preview on PR, production on `master` merge).

## Quick Start (5 minutes)

### Step 1: Commit the Workflow Files

```bash
git add .github/workflows/
git commit -m "Add GitHub Actions CI/CD pipeline with test automation"
git push origin master
```

### Step 2: Enable Branch Protection (Recommended)

Go to your GitHub repo:

1. **Settings** → **Branches**
2. Click **Add rule** (if not already created for master)
3. Branch name: `master`
4. Check these options:
   - ✅ **Require status checks to pass before merging**
   - ✅ **Require branches to be up to date before merging**
5. Select required status checks:
   - ✅ Unit & Integration Tests (all variants)
   - ✅ Build Verification
   - ⚠️ E2E Tests (optional - takes longer)
6. Click **Create** or **Save changes**

**Result:** PRs can't be merged unless tests pass.

### Step 3: That's It!

Your CI/CD is now set up. Vercel continues to work exactly as before.

---

## How the Workflow Runs

### On Push to `dev` (No PR Open)

```
git push dev
    ↓
GitHub Actions starts tests (shift-left)
└─ Unit/Integration tests (Node 22.x)
└─ E2E tests (if unit passes)
    ↓
Immediate feedback before PR is created
```

### On Push to `dev` (PR Open to `master`)

```
git push dev
    ↓
Both push and pull_request events fire
    ↓
Concurrency group cancels the earlier run
    ↓
Only one run completes (no duplication)
    ↓
Vercel preview deployment (simultaneous, independent)
```

### On Merge to `master`

```
Merge PR
    ↓
GitHub Actions runs tests (post-merge verification)
    ↓
Vercel deploys to production (simultaneous, independent)
```

**Tests MUST pass to merge to master** (enforced by branch protection).

---

## Key Differences from Before

### Before (Vercel Only)

```
git push master → Vercel deploys → Hope nothing broke
```

### After (Tests + Vercel)

```
git push master → Tests run → Vercel deploys → Proof it works
```

### Before (PR Workflow)

```
Create PR → Vercel preview → Review → Merge
                                        ↓
                            (Hope tests would catch issues)
```

### After (PR Workflow)

```
Create PR → Tests run → Vercel preview → Review → Merge
              ↓
        (Tests block bad PRs)
```

---

## Viewing Test Results

### GitHub Actions Tab

1. Go to your repo
2. Click **Actions** tab
3. See all workflow runs
4. Click a run to see details
5. Click a job to see logs

### PR Comments

Tests automatically post results to PRs:

- ✅ Pass: "All tests passed!"
- ❌ Fail: Lists what failed
- 🚀 Deploy: "Preview Deployed - [View Preview]"

### Playwright Report

If E2E tests fail:

1. Go to **Actions** tab
2. Click the failed run
3. Scroll to **Artifacts**
4. Download `playwright-report.zip`
5. Extract and open `index.html`
6. View screenshots and traces

### Coverage Report

Unit test coverage:

1. Go to **Actions** tab
2. Click a test run
3. Expand the **Unit & Integration Tests** job
4. Coverage summary table is in the step summary

---

## Common Scenarios

### Scenario 1: I Push to Main and Tests Fail

Tests fail but Vercel still deploys (because they run in parallel).

**What to do:**

1. Check GitHub Actions tab for error
2. Fix code locally
3. Commit and push again
4. Tests re-run automatically
5. Monitor Actions tab

No need to revert - you can always rollback later.

### Scenario 2: I Create a PR and Tests Fail

PR is marked "Changes Required" and you can't merge.

**What to do:**

1. See test failure in PR comment
2. Fix code locally
3. Push to same branch
4. Tests auto-rerun
5. Once pass, PR becomes mergeable

### Scenario 3: E2E Tests Are Flaky

Sometimes they pass, sometimes fail randomly.

**What to do:**

1. Look at Playwright report
2. Increase timeouts: `await page.waitForTimeout(1000)`
3. Use better selectors: `[data-testid="..."]` not text
4. Re-run from Actions: **Re-run failed jobs**

### Scenario 4: Tests Pass But Build Fails

Unit tests pass but Astro build errors.

**What to do:**

1. Run locally: `npm run build`
2. Fix build error
3. Push, tests auto-rerun
4. Check build verification job

---

## Configuration

### Test Scripts Required

Make sure `package.json` has these scripts:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:all": "npm run test:run && npm run test:e2e",
    "build": "astro build",
    "dev": "astro dev"
  }
}
```

If any are missing, add them before committing.

---

## Monitoring & Troubleshooting

### Check Workflow Status

```bash
# List recent workflow runs
gh run list

# Check specific run
gh run view <run-id> --log

# View in browser
# Actions tab → Recent runs
```

### Common Issues

#### Tests pass locally but fail in CI

- Check Node version: `node --version`
- Run with CI env: `CI=true npm test`
- Timing issues? Add explicit waits
- File paths? Use absolute paths with `__dirname`

#### Build fails in CI but passes locally

- Try: `npm ci` instead of `npm install`
- Same Node version? `nvm use 20`
- Check for hardcoded paths or env vars

#### E2E tests timeout

- Increase timeout in `playwright.config.ts`
- Use explicit waits instead of sleeps
- Check if dev server is running

---

## Next Steps

### 1. Install Test Dependencies

```bash
npm install --save-dev \
  vitest \
  playwright \
  @playwright/test \
  jsdom \
  @vitest/ui \
  @vitest/coverage-v8
```

### 2. Create vitest and Playwright Config

Copy from TEST_STRATEGY.md sections 5.1 and 5.2

### 3. Add data-testid Attributes

Instrument components with test selectors (TEST_STRATEGY.md section 8)

### 4. Write Tests

Start with unit tests (TEST_STRATEGY.md section 3.1)

### 5. Monitor First Run

Push a test commit and watch Actions tab

---

## Quick Reference

### Commands

```bash
# Run all tests locally
npm test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run everything
npm run test:all

# View coverage report
open coverage/index.html
```

### Files

```
.github/
└── workflows/
    └── test.yml                    # Test workflow (unit, integration, E2E)
```

### GitHub Actions Links

- [Workflow runs](https://github.com/YOUR_ORG/gst-website/actions)
- [Branch protection rules](https://github.com/YOUR_ORG/gst-website/settings/branches)
- [Secrets & variables](https://github.com/YOUR_ORG/gst-website/settings/secrets/actions)

---

## Support

### If something breaks:

1. Check Actions tab for error logs
2. Run tests locally to reproduce
3. Review test output
4. Check test documentation (TEST_STRATEGY.md)

### If you need to disable:

1. Rename `.github/workflows/*.yml` to `*.yml.bak`
2. Push to disable workflows
3. Tests won't run (but Vercel still deploys)

---

## Pipeline Architecture

```
git push / PR opened
        ↓
  ┌─────────────────────┐
  │ Unit & Integration  │  Node 22.x
  │ Tests + Coverage    │  timeout: 10 min
  └─────────┬───────────┘
            ↓ (must pass)
  ┌─────────────────────┐
  │ E2E Tests           │  Playwright (3 browsers)
  │ + Build Verify      │  timeout: 20 min
  └─────────────────────┘

  Vercel deploys simultaneously (independent)
```

### Concurrency Deduplication

When a PR is open and you push to the branch, both `push` and `pull_request` events fire. Both resolve to the same concurrency group, so the earlier run is cancelled — only one completes.

| Scenario                   | Events fired            | Runs to completion    |
| -------------------------- | ----------------------- | --------------------- |
| Push to branch, no PR open | `push`                  | 1                     |
| Push to branch, PR open    | `push` + `pull_request` | 1 (earlier cancelled) |
| Merge to `master`          | `push`                  | 1                     |

---

## Branch Protection Rules

### What This Does

Prevents merging PRs to `master` unless:

- All tests pass
- Branch is up to date with master
- At least one approval (optional)

### Configuration

**URL:** `https://github.com/YOUR_ORG/gst-website/settings/branches`

1. Go to repo **Settings** -> **Branches**
2. Add or edit the `master` rule
3. Enable these settings:

| Setting                                | Value    | Why                                                   |
| -------------------------------------- | -------- | ----------------------------------------------------- |
| Require a pull request before merging  | Yes      | Forces all changes through PR review                  |
| Require approvals                      | 1        | Prevents mistakes, catches edge cases                 |
| Dismiss stale approvals on new commits | Yes      | New code must be re-approved                          |
| Require status checks to pass          | Yes      | Broken tests = blocked merge                          |
| Require branches to be up to date      | Yes      | Prevents conflicts, ensures tests pass on latest code |
| Require conversation resolution        | Optional | Ensures comments are addressed                        |

4. Select required status checks:
   - `Unit & Integration Tests` (required)
   - `Lint & Type Check` (required)
   - `Build Verification` (required)
   - `E2E Tests` (optional — takes longer, can skip for emergency hotfixes)

### Typical PR Workflow

```
1. Create PR (from feature branch)
   ↓
2. GitHub Actions tests start
   ↓
3. While tests run: assign reviewers, review code
   ↓
4. Tests complete (5-10 min)
   ├─ Pass? → ✅ Merge button enabled
   └─ Fail? → ❌ Must fix before merge
   ↓
5. Reviewer approves
   ↓
6. Merge → Vercel deploys master automatically
```

### Emergency: Bypassing Checks

Admin override is available but rarely needed. Better option: create a hotfix PR, get quick approval, merge normally (tests usually pass in under 10 minutes).

### Branch Protection Troubleshooting

| Symptom                             | Fix                                                      |
| ----------------------------------- | -------------------------------------------------------- |
| "Some checks haven't completed yet" | Tests still running (5-10 min) — wait and refresh        |
| "X check failed"                    | Click the failed check to see error; fix and push        |
| "Can't merge due to conflicts"      | Click "Update branch" to rebase                          |
| "Protection rule mismatch"          | Go to Actions tab, get exact check name, update the rule |

---

**Last Updated:** 2026-04-18
**Status:** Ready to use
**Questions?** Check TEST_STRATEGY.md for detailed documentation
