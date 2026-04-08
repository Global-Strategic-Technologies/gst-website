# GitHub Actions + Vercel Setup Guide

## What Just Happened?

Three GitHub Actions workflow files have been created in `.github/workflows/`:

1. **test.yml** - Runs on every push and PR
   - Unit & Integration tests (2 Node versions: 18.x, 20.x)
   - E2E tests with Playwright
   - Build verification
   - Coverage upload to Codecov

2. **deploy-preview.yml** - Runs on PRs
   - Posts test results as PR comment
   - Tells you when to expect Vercel preview

3. **deployment-status.yml** - Listens for Vercel deployments
   - Posts preview URL to PR comment
   - Links to the deployed preview

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

### On Push to Main

```
git push master
    ↓
GitHub Actions starts tests
└─ Unit/Integration tests (Node 18 & 20)
└─ E2E tests
└─ Build verification
    ↓
Vercel webhook triggered (separate, simultaneous)
└─ Builds site
└─ Deploys to production
    ↓
Both complete independently
```

**Timeline:**
- Tests start: ~5 seconds after push
- Tests complete: ~8-10 minutes
- Vercel build: ~3-5 minutes
- Vercel deployment: ~1-2 minutes

You get **immediate feedback** in GitHub Actions even if Vercel hasn't finished building.

### On Pull Request

```
Create/update PR
    ↓
GitHub Actions tests run immediately
    ↓
Tests pass/fail?
├─ PASS → PR shows ✅ "Ready to merge"
└─ FAIL → PR shows ❌ "Changes requested"
    ↓
Vercel preview deployment (simultaneous)
└─ Creates preview URL
└─ Posts to PR comment
    ↓
You review:
1. Test results (always first)
2. Code changes
3. Live preview (Vercel)
4. Merge when ready (if tests pass)
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
3. Look for **Codecov** step
4. Visit codecov.io (if setup) for detailed report

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

### Scenario 5: Node 18 Passes But Node 20 Fails

Tests run on both versions - sometimes one breaks compatibility.

**What to do:**
1. Run locally with both versions:
   ```bash
   nvm use 18
   npm test
   nvm use 20
   npm test
   ```
2. Fix compatibility issue
3. Push and re-run tests

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

### Optional: Codecov Setup

For better coverage reporting:

1. Go to [codecov.io](https://codecov.io)
2. Sign in with GitHub
3. Select your repo
4. Follow setup (usually auto-connects)
5. Codecov badge can be added to README

Not required - works without it, just nicer with it.

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

#### Codecov not uploading
- Not critical - tests still work
- Check codecov.io token if configured
- Can disable if causing issues

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

### Files Created
```
.github/
└── workflows/
    ├── test.yml                    # Main test workflow
    ├── deploy-preview.yml          # PR comments
    └── deployment-status.yml       # Deployment status
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

**Last Updated:** 2026-01-28
**Status:** Ready to use
**Questions?** Check TEST_STRATEGY.md for detailed documentation
