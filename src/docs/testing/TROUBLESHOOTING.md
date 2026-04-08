# Testing & CI/CD Troubleshooting Guide

Solutions to common problems when running tests locally and in CI/CD.

## Local Testing Issues

### "Tests work locally but fail in GitHub Actions"

**Possible causes:**
1. **Node version mismatch** - CI runs Node 18 and 20, you might have a different version
2. **Missing environment variables** - Check `.env` file is not committed
3. **Flaky timing in E2E tests** - Your machine is faster than CI
4. **Platform differences** - You're on Windows, CI runs on Linux

**Solution:**
```bash
# Check your Node version
node --version

# Run tests with CI-like conditions
npm run test:all  # Simulates CI test run

# Check what CI actually runs
cat .github/workflows/test.yml
```

### "npm run test:all hangs or times out"

**Possible causes:**
1. **E2E tests waiting too long** - Playwright timeouts too aggressive
2. **Resource exhaustion** - Too many tests running at once
3. **Stale Playwright cache** - Outdated browser binaries

**Solution:**
```bash
# Clear Playwright cache
rm -rf ~/.cache/ms-playwright
npx playwright install

# Run E2E tests with longer timeout
npx playwright test --timeout=60000

# Run tests sequentially (slower, but helps debug)
npx playwright test --workers=1
```

### "Single test fails randomly (flaky test)"

**Likely cause:** Race condition or timing-dependent assertion

**Solution:**
1. **Use proper waits, not arbitrary timeouts**
   ```typescript
   // ❌ Bad - arbitrary wait
   await page.waitForTimeout(1000);

   // ✅ Good - wait for state change
   await page.waitForFunction(() => {
     return document.body.classList.contains('dark-theme');
   });
   ```

2. **Reference:** [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md) - Red flags section

3. **Run test multiple times to confirm:**
   ```bash
   npx playwright test -g "test name" --repeat-each=5
   ```

### "Coverage report is missing"

**Solution:**
```bash
# Coverage is only generated with Vitest (unit/integration)
npm run test:coverage

# View report
open coverage/index.html
```

---

## GitHub Actions / CI/CD Issues

### "Workflow shows red X but tests passed locally"

**Possible causes:**
1. **Branch protection rules blocking merge** - Even though tests passed
2. **Other status checks failing** - Not just tests
3. **Tests didn't actually run** - Check workflow logs

**Solution:**
```bash
# Check GitHub Actions logs
# 1. Go to repository → Actions tab
# 2. Find the failing workflow run
# 3. Click it to see logs
# 4. Expand "test" step to see test output

# Or verify locally
npm run test:all
```

### "GitHub Actions test.yml not running on my branch"

**Possible causes:**
1. **Workflow not triggered on your branch** - Only runs on master/dev
2. **Branch protection requires different branch** - Check repository settings
3. **Workflow file has syntax error** - YAML parsing failed

**Solution:**
```bash
# Check workflow file
cat .github/workflows/test.yml

# Trigger manually in GitHub UI:
# 1. Go to repository → Actions tab
# 2. Select "Test" workflow
# 3. Click "Run workflow" → select your branch
```

### "Tests pass locally but fail in CI on specific browser (Firefox or Safari)"

**Possible causes:**
1. **Browser-specific CSS behavior** - margin/padding calculations differ
2. **JavaScript timing differences** - Animation frame ordering varies
3. **CSS vendor prefixes missing** - Autoprefixer not running

**Solution:**
```bash
# Run E2E tests on specific browser locally
npx playwright test --project=firefox
npx playwright test --project=webkit

# Generate debugging info
npx playwright test --debug  # Step through in Playwright Inspector

# View headed browser
npx playwright test --headed --project=firefox
```

### "Vercel deployment fails after tests pass"

**Possible causes:**
1. **Build command failing** - `npm run build` works locally but not in CI
2. **Environment variables not set in Vercel** - Check Vercel dashboard
3. **Node version mismatch** - Vercel using different Node than GitHub Actions

**Solution:**
```bash
# Simulate Vercel build locally
npm run build

# Check Vercel environment variables:
# 1. Go to Vercel project settings
# 2. Check "Environment Variables" section
# 3. Verify GA_MEASUREMENT_ID and other required vars are set

# Check Node version
cat .nvmrc  # Expected version
node --version  # Your version
```

---

## Branch Protection & PR Workflow

### "I can't merge my PR even though all checks pass"

**Possible causes:**
1. **Branch not up to date with master** - Need to rebase/merge
2. **Code review required but not completed** - Waiting for approval
3. **Branch protection rule not satisfied** - Outdated protection settings

**Solution:**
```bash
# Update your branch with latest master
git fetch origin
git rebase origin/master
git push -f origin your-branch

# Or merge master into your branch
git pull origin master
git push origin your-branch
```

Then refresh GitHub PR page to re-run tests.

---

## Test Output & Debugging

### "Test failure shows cryptic error message"

**Solution:**

1. **Read full error context**
   ```bash
   # Run with verbose output
   npx playwright test -g "test name" --verbose
   ```

2. **Save debug output**
   ```bash
   # Generate video and trace files
   npx playwright test --trace on --video on

   # View trace in Playwright Inspector
   npx playwright show-trace trace.zip
   ```

3. **Check screenshot** - GitHub Actions automatically saves on failure
   ```
   # In GitHub Actions UI:
   # 1. Click failing job
   # 2. Scroll to "Artifacts" section
   # 3. Download test-results folder
   ```

### "How do I debug a specific E2E test?"

**Solution:**
```bash
# Method 1: Interactive debugger
npx playwright test --debug -g "test name"
# Then use Playwright Inspector to step through

# Method 2: Headed browser (watch it run)
npx playwright test --headed --project=chromium -g "test name"

# Method 3: Add debug statements
// In test file
await page.pause();  // Pauses execution, opens inspector

// Run test
npx playwright test -g "test name"
```

---

## Performance & Resource Issues

### "Tests running slowly locally"

**Solutions:**
```bash
# Run in parallel (faster, default)
npm run test:all

# Check which tests are slowest
npm run test:all --reporter=verbose

# Profile test execution
npx playwright test --trace on --timeout=60000
```

### "CI tests timing out (20 minute limit)"

**Solution:**
1. **Optimize slow E2E tests**
   ```bash
   # Run just E2E tests
   npm run test:e2e

   # Check which are slowest
   npx playwright test --reporter=list
   ```

2. **Split test runs** - Consider splitting into multiple jobs in workflow

3. **Reference:** [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) - E2E timeout configuration

---

## Analytics Testing Issues

### "Google Analytics events not tracking in tests"

**Causes:**
1. **GA requests blocked by test setup** - Playwright blocks external requests
2. **gtag not initialized yet** - Tests running before GA loads
3. **Events not properly tracked** - Check event name/parameters

**Solution:**
```bash
# Run analytics tests specifically
npx playwright test analytics.test.ts

# Debug event tracking
// In test
await page.on('console', msg => {
  if (msg.text().includes('gtag')) {
    console.log('GA Event:', msg.text());
  }
});

// Reference
cat src/docs/analytics/ANALYTICS_TESTING.md
```

---

## Configuration Issues

### "vitest.config.ts errors when running tests"

**Possible causes:**
1. **TypeScript compilation error** - Check for type errors in config
2. **Missing @vitest/ui** - If using `npm run test:ui`
3. **Coverage provider not installed** - Using undefined coverage option

**Solution:**
```bash
# Install missing dependencies
npm install @vitest/ui

# Validate config syntax
npx vitest --inspect --help  # Shows validation errors

# Check config file
cat vitest.config.ts
```

### "Playwright browsers not installed"

**Solution:**
```bash
# Install Playwright browsers
npx playwright install

# Reinstall all browsers (if corrupted)
npx playwright install --with-deps
```

---

## Still Stuck?

1. **Check test logs** - GitHub Actions shows full output
2. **Review [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md)** - Common patterns and anti-patterns
3. **Search closed GitHub issues** - Likely someone has seen this before
4. **Run with --debug flag** - Most test runners have debugging mode
5. **Ask for help** - Document what you tried and what happened

---

## Quick Reference

| Problem | Command |
|---------|---------|
| Run all tests | `npm run test:all` |
| Run specific test | `npx playwright test -g "test name"` |
| Debug test | `npx playwright test --debug` |
| View headed | `npx playwright test --headed` |
| Check coverage | `npm run test:coverage` |
| Clear Playwright | `rm -rf ~/.cache/ms-playwright` |
| Run on Firefox | `npx playwright test --project=firefox` |

See [README.md](./README.md) for more commands.
