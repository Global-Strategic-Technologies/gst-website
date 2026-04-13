# Quick Reference Card - CI/CD & Testing

## What Was Created

| File                                              | Purpose               | Status  |
| ------------------------------------------------- | --------------------- | ------- |
| `TEST_STRATEGY.md`                                | Complete strategy     | ✅ Done |
| `GITHUB_ACTIONS_SETUP.md`                         | Quick start guide     | ✅ Done |
| `BRANCH_PROTECTION_CONFIG.md`                     | Branch rules          | ✅ Done |
| `GITHUB_ACTIONS_SETUP.md` § Pipeline Architecture | Architecture overview | ✅ Done |
| `vitest.config.ts`                                | Unit test config      | ✅ Done |
| `playwright.config.ts`                            | E2E test config       | ✅ Done |

## Setup Status

```
✅ Test dependencies installed
✅ Vitest & Playwright configured
✅ Unit/Integration tests (22 files)
✅ E2E tests (24 files × 3 browsers)
✅ All tests passing
```

## Available Commands

```bash
# Run tests
npm test                # Watch mode (re-runs on file changes)
npm run test:run       # Single run (unit + integration)
npm run test:coverage  # With coverage report
npm run test:e2e       # E2E tests only
npm run test:all       # Everything (unit + integration + E2E)

# Interactive UI - browse test results in browser
npm run test:ui        # Vitest UI → http://localhost:XXXX/__vitest__/
npm run test:e2e:ui    # Playwright UI → interactive test dashboard
npm run test:e2e:debug # Playwright debug → step through E2E tests
```

## Development Workflow

### Before Pushing Code

```
1. Make your changes
2. Run npm run test:all locally
3. Wait for all tests to pass
4. Only then push to remote
```

### After Pushing to Remote

```
1. Vercel automatically deploys master branch
2. Preview builds created for PRs
3. Code is live after merge to master
```

## File Structure to Create

```
tests/
├── setup.ts                    (test setup)
├── unit/
│   ├── data-validation.test.ts
│   ├── abbreviate.test.ts
│   └── ...
├── integration/
│   ├── portfolio-filtering.test.ts
│   ├── portfolio-grid.test.ts
│   └── ...
├── e2e/
│   ├── discover-project.test.ts
│   ├── view-project-details.test.ts
│   └── ...
└── fixtures/
    ├── mock-projects.ts
    └── test-data.ts

Config files:
├── vitest.config.ts
└── playwright.config.ts
```

## Key Commands

```bash
# Development
npm run dev          # Start dev server

# Testing
npm test            # Watch mode
npm run test:run    # Single run all
npm run test:coverage # With coverage report
npm run test:e2e    # E2E tests only
npm run test:all    # Everything (CI command)

# Building
npm run build       # Build for production
npm run preview     # Preview production build

# CI/CD
npm run test:ui    # Visual test UI
npm run test:e2e:ui # E2E visual UI
npm run test:e2e:debug # Debug E2E
```

## Testing Quick Reference

### Unit Test Template

```typescript
import { describe, it, expect } from 'vitest';

describe('My Function', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

### Integration Test Template

```typescript
import { test, expect, Page } from '@playwright/test';

test('should filter results', async ({ page }) => {
  await page.goto('/ma-portfolio');
  await page.fill('[data-testid="search"]', 'term');
  const results = page.locator('[data-testid="result"]');
  expect(await results.count()).toBeGreaterThan(0);
});
```

### E2E Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('User Journey', () => {
  test('should complete task', async ({ page }) => {
    // Arrange
    await page.goto('/');

    // Act
    await page.click('[data-testid="button"]');

    // Assert
    await expect(page.locator('[data-testid="result"]')).toBeVisible();
  });
});
```

## Component Data-TestID Examples

```html
<!-- Search -->
<input data-testid="search-input" />
<button data-testid="search-clear" />

<!-- Filters -->
<button data-testid="filter-growth" />
<button data-testid="filter-mature" />
<button data-testid="filter-clear-all" />

<!-- Grid -->
<div data-testid="project-card" />
<div data-testid="project-card-123" />

<!-- Modal -->
<dialog data-testid="project-modal" />
<button data-testid="modal-close" />

<!-- Other -->
<button data-testid="theme-toggle" />
<div data-testid="sticky-controls" />
```

## Accessing Test UIs

### Vitest UI (Unit/Integration Tests)

```bash
npm run test:ui
# Opens interactive dashboard at http://localhost:XXXX/__vitest__/
# Shows:
# - 174 unit and integration tests
# - Real-time pass/fail status
# - Test file tree
# - Individual test details
# - Auto-reload when files change
```

### Playwright UI (E2E Tests)

```bash
npm run test:e2e:ui
# Opens interactive test dashboard
# Shows:
# - 207 E2E tests
# - Video playback of each test
# - Network traces
# - Screenshots on failure
# - Can filter by test name or status
```

### Playwright Debug (Step Through Tests)

```bash
npm run test:e2e:debug
# Opens Playwright Inspector
# Shows:
# - Step through each action
# - Inspect DOM at each step
# - Resume/pause execution
# - Great for debugging flaky tests
```

## Local Testing (Before Push)

Run these commands locally before pushing:

```bash
# Run all tests
npm run test:all

# Expected results:
# ✅ 174 unit/integration tests passing
# ✅ 207 E2E tests passing (across chromium, firefox, webkit)
# ✅ 0 failures

# If tests fail:
→ Fix and re-run locally
→ Only push when all tests pass
```

## Coverage Targets

| Category            | Target |
| ------------------- | ------ |
| Overall             | 70%    |
| Critical Components | 85-95% |
| Utility Functions   | 90%+   |
| Portfolio Filtering | 85%    |
| Modals              | 85%    |
| Theme Toggle        | 95%    |

## Viewing Results

### Command Line

| Command            | Shows                                     |
| ------------------ | ----------------------------------------- |
| `npm run test:run` | Unit/integration test results in terminal |
| `npm run test:e2e` | E2E test results + Playwright report URL  |
| `npm run test:all` | Both combined                             |

### Browser UI (Interactive)

| Command                  | Opens Browser                     | Shows                                       |
| ------------------------ | --------------------------------- | ------------------------------------------- |
| `npm run test:ui`        | http://localhost:XXXX/**vitest**/ | 174 unit/integration tests, live reload     |
| `npm run test:e2e:ui`    | Playwright UI                     | 207 E2E tests, video playback, traces       |
| `npm run test:e2e:debug` | Playwright Inspector              | Step through E2E tests one action at a time |

### Reports

| File/Folder           | Access                | Shows                                      |
| --------------------- | --------------------- | ------------------------------------------ |
| `coverage/index.html` | Open in browser       | Line-by-line code coverage                 |
| `test-results/`       | Playwright report URL | Screenshots, video, traces (after E2E run) |

## Troubleshooting

### Tests fail locally

```bash
# Try clean install
rm -rf node_modules package-lock.json
npm ci

# Check Node version
node --version  # Should be 18.x or 20.x

# Run specific test
npm run test tests/unit/my.test.ts
```

### Build fails

```bash
# Clean build
npm run build

# Check what broke
npm run build -- --verbose
```

### E2E tests timeout

Edit `playwright.config.ts`:

```typescript
use: {
  timeout: 30000,  // Increase from default
}
```

### Tests pass locally but fail in CI

- Check Node version matches
- Try `npm ci` (not `npm install`)
- Add explicit waits (not sleeps)
- Use `data-testid` (not selectors)

## Vercel Integration

**Deployment:** Vercel auto-deploys master on push
**Testing:** Run tests locally before pushing

```
Test locally first:
- Run npm run test:all
- Fix any failures
- Push only when green

Vercel deployment:
- Automatic on push to master
- Preview builds on PRs
- No test blocking needed
- You maintain quality gate locally
```

## Team Workflow

```
Developer:
1. Create feature branch
2. Make changes locally
3. Run npm run test:all
4. Fix any test failures
5. Push to remote when all tests pass
6. Create PR if needed

Reviewer:
1. Review code on PR
2. Try Vercel preview
3. Approve when satisfied
4. Merge PR

After Merge:
1. Code is deployed to master
2. Vercel handles deployment
3. All tests passed locally before merge
4. Done!
```

## If Tests Fail Before Push

```bash
# Run locally to see what's failing
npm run test:all

# Or run specific test file
npm run test:run -- tests/unit/analytics.test.ts

# Debug E2E tests with UI
npm run test:e2e:debug

# Fix the issues, then commit and push
# (Only push when all tests pass)
```

## Documentation

- **Test Strategy:** `TEST_STRATEGY.md` - Complete testing approach
- **Analytics Guide:** `analytics/ANALYTICS_TESTING.md` - GA4 event testing
- **Analytics Summary:** `analytics/TESTING_SUMMARY.md` - Coverage stats
- **This Document:** `QUICK_REFERENCE.md` - Quick reference

## Current Test Coverage

- **Unit & Integration Tests:** 174 tests, 100% passing
- **E2E Tests:** 207 tests (all browsers), 100% passing
- **Total:** 381 tests, 0 failures
- **Time:** ~2 min (local), ~1-2 hours (all browsers)

## Common Patterns

### Testing filtering logic

```typescript
it('should filter by search term', async () => {
  // Arrange
  const page = await browser.newPage();
  await page.goto('/ma-portfolio');

  // Act
  await page.fill('[data-testid="search"]', 'tech');
  await page.waitForTimeout(400); // Wait for debounce

  // Assert
  const count = await page.locator('[data-testid="result"]').count();
  expect(count).toBeLessThan(51);
});
```

### Testing modals

```typescript
it('should open modal on click', async () => {
  await page.click('[data-testid="project-card"]');
  const modal = page.locator('[data-testid="project-modal"]');
  await expect(modal).toBeVisible();

  // Close
  await page.click('[data-testid="modal-close"]');
  await expect(modal).not.toBeVisible();
});
```

### Testing theme toggle

```typescript
it('should toggle theme', async () => {
  const isDark = await page.evaluate(() => document.body.classList.contains('dark-theme'));

  await page.click('[data-testid="theme-toggle"]');

  const isDarkAfter = await page.evaluate(() => document.body.classList.contains('dark-theme'));

  expect(isDarkAfter).toBe(!isDark);
});
```

---

**Last Updated:** 2026-01-30
**Status:** All 381 tests passing ✅
**Ready for:** Production use
