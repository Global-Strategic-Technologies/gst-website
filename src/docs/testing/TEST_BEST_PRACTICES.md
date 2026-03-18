# E2E Test Best Practices Guide

This guide documents best practices for writing E2E tests that actually verify functionality, based on issues found during the audit of the ma-portfolio filter bug.

## Critical Issues to Avoid

### 1. ❌ False-Positive Assertions

**Bad:**
```typescript
// Always passes - count is always >= 0
expect(cardCount).toBeGreaterThanOrEqual(0);

// Always passes - || true makes it always true
expect(isFocused || true).toBeTruthy();

// Always passes - typeof is always 'boolean'
expect(typeof isDark).toBe('boolean');
```

**Good:**
```typescript
// Verifies elements actually exist
expect(cardCount).toBeGreaterThan(0);

// Verifies the actual value
expect(isFocused).toBe(true);

// Verifies the actual state
expect(isDark).toBe(expectedValue);
```

### 2. ❌ Testing UI Presence, Not Behavior

**Bad:**
```typescript
test('should apply filter', async ({ page }) => {
  const chip = page.locator('[data-testid="filter-chip"]');
  await chip.click();

  // Only checks if class applied, not if filtering works
  await expect(chip).toHaveClass(/active/);
});
```

**Good:**
```typescript
test('should apply filter', async ({ page }) => {
  const chip = page.locator('[data-testid="filter-chip"]');
  await chip.click();

  // Verify class applied (visual feedback)
  await expect(chip).toHaveClass(/active/);

  // Verify actual filtering works (behavioral verification)
  await page.waitForFunction(() => {
    const state = (window as any).portfolioState;
    return state && state.filters && state.filters.stage === 'growth-category';
  });

  // Get filtered results and verify they changed
  const filteredCards = page.locator('[data-testid="project-card"]');
  const filteredCount = await filteredCards.count();
  expect(filteredCount).toBeGreaterThan(0);
});
```

### 3. ❌ Placeholder Timeouts Instead of State Waits

**Bad:**
```typescript
// Arbitrary 100ms wait - might not be enough, tests fragile
await page.waitForTimeout(100);
const hasClass = await body.evaluate(el => el.classList.contains('dark-theme'));
expect(hasClass).toBe(true);
```

**Good:**
```typescript
// Wait for actual state change
await page.waitForFunction((initialColor) => {
  const bg = window.getComputedStyle(document.body).backgroundColor;
  return bg !== initialColor;
}, initialBgColor, { timeout: 5000 });

const newBg = await body.evaluate(el =>
  window.getComputedStyle(el).backgroundColor
);
expect(newBg).not.toBe(initialBgColor);
```

### 4. ❌ Checking CSS Classes, Not Actual CSS Properties

**Bad:**
```typescript
test('should apply dark theme', async ({ page }) => {
  const body = page.locator('body');
  await themeToggle.click();

  // Only checks class name
  const hasDarkClass = await body.evaluate(el =>
    el.classList.contains('dark-theme')
  );
  expect(hasDarkClass).toBe(true);
});
```

**Good:**
```typescript
test('should apply dark theme with correct styling', async ({ page }) => {
  const body = page.locator('body');

  const initialBg = await body.evaluate(el =>
    window.getComputedStyle(el).backgroundColor
  );

  await themeToggle.click();

  // Wait for actual CSS to change
  await page.waitForFunction((initialColor) => {
    const bg = window.getComputedStyle(document.body).backgroundColor;
    return bg !== initialColor;
  }, initialBg);

  // Verify both class AND actual CSS properties changed
  const darkClass = await body.evaluate(el =>
    el.classList.contains('dark-theme')
  );
  const bgColor = await body.evaluate(el =>
    window.getComputedStyle(el).backgroundColor
  );

  expect(darkClass).toBe(true);
  expect(bgColor).not.toBe(initialBg);
  expect(['rgb(0, 0, 0)', 'rgb(26, 26, 26)']).toContain(bgColor);
});
```

## Best Practices

### 1. Test User Interactions → Results

Every test should follow this pattern:
1. Setup (get initial state)
2. Interact (user action)
3. Wait (for actual state change)
4. Verify (results match expectations)

```typescript
test('should update project list when filter applied', async ({ page }) => {
  // 1. Setup - Get initial state
  const initialCards = page.locator('[data-testid="project-card"]');
  const initialCount = await initialCards.count();

  // 2. Interact - User action
  const filterButton = page.locator('[data-testid="filter-chip"]');
  await filterButton.click();

  // 3. Wait - For actual state change
  await page.waitForFunction(() => {
    const state = (window as any).portfolioState;
    return state && state.filters && state.filters.stage === 'growth';
  }, { timeout: 5000 });

  // 4. Verify - Results
  const filteredCards = page.locator('[data-testid="project-card"]');
  const filteredCount = await filteredCards.count();

  // Count may be same or different depending on data
  // But state MUST have changed
  const filterState = await page.evaluate(() =>
    (window as any).portfolioState?.filters?.stage
  );
  expect(filterState).toBe('growth');
});
```

### 2. Verify State Changes Before/After

Always compare state before and after actions:

```typescript
test('should toggle theme', async ({ page }) => {
  const body = page.locator('body');

  // Get BEFORE state
  const beforeState = await body.evaluate(el => ({
    hasDarkClass: el.classList.contains('dark-theme'),
    bgColor: window.getComputedStyle(el).backgroundColor
  }));

  // Action
  await page.locator('[data-testid="theme-toggle"]').click();

  // Wait for change
  await page.waitForFunction((before) => {
    const now = window.getComputedStyle(document.body).backgroundColor;
    return now !== before;
  }, beforeState.bgColor);

  // Get AFTER state
  const afterState = await body.evaluate(el => ({
    hasDarkClass: el.classList.contains('dark-theme'),
    bgColor: window.getComputedStyle(el).backgroundColor
  }));

  // VERIFY they're different
  expect(afterState.hasDarkClass).not.toBe(beforeState.hasDarkClass);
  expect(afterState.bgColor).not.toBe(beforeState.bgColor);
});
```

### 3. Use Proper Waiting Mechanisms

**Bad:**
```typescript
await page.waitForTimeout(100); // Arbitrary wait
```

**Good:**
```typescript
// Wait for specific element
await page.waitForSelector('[data-testid="modal"]');

// Wait for element to be visible
await expect(page.locator('[data-testid="modal"]')).toBeVisible();

// Wait for function (custom state check)
await page.waitForFunction(() => {
  const state = (window as any).portfolioState;
  return state && state.filters && state.filters.active === 'growth';
});

// Wait for specific condition with timeout
await page.waitForFunction(() => {
  return document.querySelectorAll('.active').length > 0;
}, { timeout: 5000 });
```

### 4. Test Behavioral Features, Not Implementation Details

**Bad:**
```typescript
// Tests implementation detail (class name)
test('should add active class', async ({ page }) => {
  await chip.click();
  expect(chip).toHaveClass('active');
});
```

**Good:**
```typescript
// Tests observable behavior
test('should highlight selected filter', async ({ page }) => {
  // Verify filter is clickable
  await expect(chip).toBeEnabled();

  // Click it
  await chip.click();

  // Verify it's now selected (could be class, attribute, or anything)
  expect(await chip.evaluate(el => {
    return el.classList.contains('active') ||
           el.getAttribute('aria-selected') === 'true';
  })).toBe(true);

  // Verify other filters are deselected
  const otherChips = page.locator('[data-testid="filter-chip"]').not(chip);
  for (const other of await otherChips.all()) {
    expect(await other.evaluate(el =>
      el.classList.contains('active')
    )).toBe(false);
  }
});
```

### 5. Add Explicit Assertions for Expected Values

**Bad:**
```typescript
// Vague - could be any badge
const badge = page.locator('[data-testid="filter-badge"]');
await expect(badge).toBeVisible();
```

**Good:**
```typescript
// Explicit - verify exact content
const badge = page.locator('[data-testid="filter-badge"]');
const badgeText = await badge.textContent();
expect(badgeText).toBe('1'); // Exactly 1 filter applied

// Or for more complex scenarios:
const badgeVisible = await badge.isVisible();
const badgeCount = parseInt(await badge.textContent() || '0');
expect(badgeVisible && badgeCount > 0).toBe(true);
```

### 5. ❌ Interacting with Animated Panels Before Transitions Complete

CSS-animated panels (drawers, bottom sheets, slide-ins) may report `toBeVisible()` mid-transition, before child elements are interactable. This causes flaky failures, especially on Firefox and WebKit under parallel worker load.

**Bad:**
```typescript
test('should click filter chip in drawer', async ({ page }) => {
  // Open drawer
  await page.locator('[data-testid="filter-toggle"]').click();

  // ❌ Drawer is "visible" but still sliding in — chip click may miss
  const drawer = page.locator('[data-testid="filter-drawer"]');
  await expect(drawer).toBeVisible({ timeout: 5000 });

  // Click chip immediately — flaky on Firefox/WebKit
  await page.locator('[data-testid="filter-chip"]').click();
  await expect(page.locator('[data-testid="filter-chip"]')).toHaveClass(/active/);
});
```

**Good:**
```typescript
/**
 * Reusable helper — waits for both visibility AND transition completion.
 * Check the element's computed CSS property to confirm the animation has settled.
 */
async function openFilterDrawer(page: Page): Promise<void> {
  await page.locator('[data-testid="filter-toggle"]').click();

  const drawer = page.locator('[data-testid="filter-drawer"]');
  await expect(drawer).toBeVisible({ timeout: 5000 });

  // ✅ Wait for the CSS transition to complete (right: -400px → 0)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="filter-drawer"]');
    if (!el || !el.classList.contains('open')) return false;
    const right = parseFloat(window.getComputedStyle(el).right);
    return right >= -1; // accounts for sub-pixel rounding
  }, { timeout: 5000 });
}

test('should click filter chip in drawer', async ({ page }) => {
  await openFilterDrawer(page);

  // ✅ Transition complete — chip click is reliable
  await page.locator('[data-testid="filter-chip"]').click();
  await expect(page.locator('[data-testid="filter-chip"]')).toHaveClass(/active/);
});
```

**Key principle:** For any element that uses CSS `transition` or `animation`, wait for the **computed CSS property** to reach its final value — not just for `toBeVisible()` or a class to be applied. Common properties to check:
- Slide-in drawers: `right`, `left`, or `transform`
- Bottom sheets: `transform: translateY(0)`
- Fade-ins: `opacity`
- Expanding panels: `height`, `max-height`

**Extract a reusable helper** when the same open/close pattern is used across multiple tests. This eliminates duplication and ensures every test waits correctly.

### 6. ❌ Hardcoded Test Data Assumptions

Tests that assume specific data relationships (e.g., "Brazil has no industry-compliance regulations") break silently when new data is added. This is especially common with filter/category tests where global regulations (like Basel III or PCI-DSS) can retroactively add categories to countries.

**Bad:**
```typescript
test('should deselect when filter removes regulations', async ({ page }) => {
  // ❌ Assumes Brazil has no industry-compliance regs — breaks when global regs are added
  await selectCountry(page, 'BRA');
  await page.locator('.filter-chip[data-category="industry-compliance"]').click();
  await expect(panel).toBeHidden();
});
```

**Good:**
```typescript
test('should deselect when filter removes regulations', async ({ page }) => {
  // ✅ Thailand has data-privacy + cybersecurity but NOT industry-compliance
  // Verified via: node -e "..." against the actual data files
  await selectCountry(page, 'THA');
  await page.locator('.filter-chip[data-category="industry-compliance"]').click();
  await expect(panel).toBeHidden();
});
```

**Key principle:** When a test depends on a specific data relationship (region X has/doesn't have category Y), document *why* that region was chosen in a comment. When adding new data files, grep tests for the affected region codes to catch broken assumptions. See also: CLAUDE.md § "Content Changes Must Include Test Updates".

### 7. ❌ Clicking Elements Obscured by Z-Index Layering

Playwright's `click()` (even with `force: true`) dispatches a click at the element's center coordinates. If a higher z-index element covers that point, the click lands on the wrong element. This commonly happens with overlays (z-index: 50) that sit behind panels (z-index: 60) — the overlay is "visible" but unreachable by coordinate-based clicks.

**Bad:**
```typescript
// ❌ Overlay is behind the panel in z-index stacking — click hits the panel instead
await page.locator('#bottomSheetOverlay').click({ force: true });
```

**Good:**
```typescript
// ✅ Dispatch the event directly to bypass coordinate-based hit testing
await page.evaluate(() => {
  document.getElementById('bottomSheetOverlay')?.dispatchEvent(
    new MouseEvent('click', { bubbles: true })
  );
});
```

**When to use `dispatchEvent` over `click()`:**
- Overlays behind higher z-index panels
- SVG path elements inside D3-managed `<svg>` containers (same pattern as `clickSvgPath`)
- Any element where Playwright logs `"<other-element> intercepts pointer events"` repeatedly

**Extract a helper** when the same dispatch pattern appears in multiple tests.

### 8. ❌ Using `toBeHidden()` When CSS Overrides `[hidden]`

Playwright's `toBeHidden()` checks computed visibility. If your CSS overrides the `[hidden]` attribute with `display: block` (common for animated panels that need to remain in the layout for transitions), the element is technically visible even when `hidden` is set.

**Bad:**
```typescript
// ❌ CSS rule `.panel[hidden] { display: block; transform: translateY(100%) }` means
//    Playwright sees this as visible — toBeHidden() fails
compliancePanel.hidden = true;
await expect(panel).toBeHidden();
```

**Good:**
```typescript
// ✅ Check the actual behavioral state instead
await page.waitForFunction(() => {
  const el = document.getElementById('compliancePanel');
  return el && !el.classList.contains('bottom-sheet--open');
});

// Verify the observable result (region deselected)
const selectedPaths = await page.locator('.country-path--selected').count();
expect(selectedPaths).toBe(0);
```

**Key principle:** When an element uses CSS transitions that override `[hidden]`, assert on the class or state that controls the transition — not on Playwright's visibility check. This is a specific case of §4 (test behavior, not implementation).

---

## Common Test Patterns

### Pattern 1: Filter/Search Interaction

```typescript
test('should filter projects by stage', async ({ page }) => {
  // Initialize
  await page.waitForFunction(() => (window as any).__portfolioInitialized);

  // Get initial count
  const allCards = await page.locator('[data-testid="project-card"]').count();

  // Open and apply filter
  await page.locator('[data-testid="filter-toggle"]').click();
  await page.locator('[data-testid="filter-chip-stage-growth"]').click();

  // Wait for filter to apply
  await page.waitForFunction(() => {
    const state = (window as any).portfolioState;
    return state?.filters?.stage === 'growth-category';
  });

  // Verify visual feedback
  await expect(
    page.locator('[data-testid="filter-chip-stage-growth"]')
  ).toHaveClass(/active/);

  // Verify "All" is no longer active
  await expect(
    page.locator('[data-testid="filter-chip-stage-all"]')
  ).not.toHaveClass(/active/);
});
```

### Pattern 2: Theme Toggle

```typescript
test('should toggle between light and dark themes', async ({ page }) => {
  const body = page.locator('body');

  // Get initial state
  const before = await body.evaluate(el => ({
    class: el.className,
    bg: window.getComputedStyle(el).backgroundColor
  }));

  // Toggle theme
  await page.locator('[data-testid="theme-toggle"]').click();

  // Wait for actual CSS change (not class change)
  await page.waitForFunction((initialBg) => {
    return window.getComputedStyle(document.body).backgroundColor !== initialBg;
  }, before.bg);

  // Get new state
  const after = await body.evaluate(el => ({
    class: el.className,
    bg: window.getComputedStyle(el).backgroundColor
  }));

  // Verify both changed
  expect(before.class).not.toBe(after.class);
  expect(before.bg).not.toBe(after.bg);
});
```

### Pattern 3: Modal Interaction

```typescript
test('should open modal with correct project details', async ({ page }) => {
  // Get initial state
  expect(await page.locator('[data-testid="project-modal"]').isVisible()).toBe(false);

  // Click to open
  await page.locator('[data-testid="project-card"]').first().click();

  // Wait for modal to open AND content to load
  const modal = page.locator('[data-testid="project-modal"]');
  await expect(modal).toBeVisible();

  // Wait for specific content
  await page.waitForFunction(() => {
    return document.querySelector('[data-testid="project-title"]')?.textContent?.length > 0;
  });

  // Verify content
  const title = await modal.locator('[data-testid="project-title"]').textContent();
  expect(title).toBeTruthy();
  expect(title?.length).toBeGreaterThan(0);
});
```

## Red Flags - Tests to Fix

If your test has any of these, it's likely a false positive:

1. ✗ `expect(...).toBeGreaterThanOrEqual(0)` - Always passes
2. ✗ `expect(value || true).toBeTruthy()` - Always passes
3. ✗ `expect(typeof x).toBe('boolean')` - Always passes
4. ✗ Only checks UI presence (isVisible, exists) without behavior
5. ✗ No `.waitForFunction()` before checking results
6. ✗ Only verifies CSS classes, not actual applied styles
7. ✗ Uses arbitrary `waitForTimeout()` waits
8. ✗ Clicks element but never checks result of click
9. ✗ Gets initial state but never compares to final state
10. ✗ Comments like "allow for X not working" that silence failures
11. ✗ Clicks inside an animated panel right after `toBeVisible()` without waiting for transition end
12. ✗ Duplicated open/close boilerplate instead of a shared helper function
13. ✗ Hardcoded data assumptions like "country X has no category Y regulations" without a comment explaining why
14. ✗ Uses `click({ force: true })` on an element that's obscured by a higher z-index layer
15. ✗ Uses `toBeHidden()` on an element whose CSS overrides `[hidden]` with `display: block`
16. ✗ Imports `describe`/`it`/`expect` from `'vitest'` when `globals: true` is set — tests silently don't register
17. ✗ Top-level `beforeEach`/`afterEach` outside a `describe` block — causes runner initialization failure
18. ✗ Uses `grantPermissions(['clipboard-read', 'clipboard-write'])` — only works in Chromium, fails on Firefox/WebKit
19. ✗ Uses `waitUntil: 'networkidle'` in `page.goto()` or `waitForLoadState()` — times out under parallel worker load
20. ✗ Uses `page.$$()` or `page.$()` on dynamically rendered elements — snapshot query returns stale/empty results
21. ✗ Uses `page.evaluate(() => el.click())` without a following `waitForFunction` to confirm the DOM reacted
22. ✗ Source code uses `setTimeout` for navigation/state changes without saving and clearing the timer ID
23. ✗ Assumes `page.evaluate()` mocks survive `page.goto()` — mocks are lost on navigation, must be re-applied
24. ✗ Dispatches mouse events to test CSS `:hover` styles — pseudo-class state cannot be activated via JS
25. ✗ Relies on implicit UI defaults (pre-selected stage, pre-filled growth rate) instead of explicitly setting required state — breaks when defaults are removed or changed

## E2E Cross-Browser Pitfalls

### 12. ❌ Using `waitUntil: 'networkidle'` Under Parallel Worker Load

`networkidle` requires no network activity for 500ms. Under parallel worker contention (multiple test workers hitting the same dev server simultaneously), the server stays busy and the condition is never met — causing `page.goto()` to time out even on fast pages.

This manifests as tests that **pass in isolation but fail in the full suite**, often with `Test timeout of 30000ms exceeded` on a `click()` or `waitForSelector()` call that follows the navigation — the page never finished loading so the element isn't interactive yet.

**Bad:**
```typescript
// ❌ Times out when parallel workers saturate the dev server
test.beforeEach(async ({ page }) => {
  await page.goto('/hub/tools/regulatory-map', { waitUntil: 'networkidle' });
  await waitForMapReady(page);
});
```

**Good:**
```typescript
// ✅ domcontentloaded completes as soon as the HTML is parsed — reliable under load
// The explicit waitForFunction/waitForSelector that follows is the real readiness guard
test.beforeEach(async ({ page }) => {
  await page.goto('/hub/tools/regulatory-map', { waitUntil: 'domcontentloaded' });
  await waitForMapReady(page); // waits for actual content, not network quiet
});
```

**Key principle:** `waitUntil: 'domcontentloaded'` is the correct default for most pages. Use a content-based `waitForFunction` or `waitForSelector` as the readiness signal instead — it's faster, more reliable, and tests the actual condition you care about (your content is visible/interactive), not a network heuristic.

**Diagnostic:** If a test passes alone (`npx playwright test myfile.test.ts`) but fails in the full suite (`npm run test:e2e`), look for `networkidle` in the `beforeEach` or the failing `goto()` call. Replace it with `domcontentloaded` + an explicit wait.

### 11. ❌ Using `grantPermissions` with Clipboard Permissions on Firefox/WebKit

Playwright's `browserContext.grantPermissions()` only supports clipboard permissions (`clipboard-read`, `clipboard-write`) on Chromium. Firefox and WebKit throw `"Unknown permission"` errors, causing immediate test failure.

**Bad:**
```typescript
// ❌ Fails on Firefox ("Unknown permission: clipboard-read")
// ❌ Fails on WebKit ("Unknown permission: clipboard-write")
test('should copy link', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#copyBtn').click();
  // ...assert clipboard content
});
```

**Good:**
```typescript
// ✅ Test the UI feedback, not the clipboard content
// Source code should show feedback regardless of clipboard API success:
//   navigator.clipboard.writeText(url).then(showFeedback, showFeedback);
test('should show copied feedback on click', async ({ page }) => {
  await page.locator('#copyBtn').click();

  // Assert on observable UI state, not clipboard contents
  await page.waitForFunction(() => {
    const btn = document.getElementById('copyBtn');
    return btn && btn.classList.contains('copied');
  });
  await expect(page.locator('#copyBtn')).toHaveAttribute('aria-label', 'Copied!');
});
```

**Key principle:** Make the source code resilient — show UI feedback on both clipboard success and failure (the `.then(onSuccess, onFailure)` pattern). Then test the UI feedback, which works identically across all browsers. Only test actual clipboard content in Chromium-specific test suites if needed.

## Unit / Integration Test Pitfalls

### 9. ❌ Explicit Vitest Imports When `globals: true` Is Enabled

When `globals: true` is set in `vitest.config.ts`, test primitives (`describe`, `it`, `expect`, `beforeEach`, `afterEach`) are injected globally. Explicitly importing them from `'vitest'` in the same file causes Vitest 4.x to silently fail — tests appear to load but never register, producing "No test suite found" or "failed to find the runner" errors with 0 tests executed.

**Bad:**
```typescript
// ❌ With globals: true, these imports shadow the global injections
// Tests silently fail to register — 0 tests run, suite marked as failed
import { describe, it, expect, beforeEach } from 'vitest';

describe('my feature', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
```

**Good:**
```typescript
// ✅ Only import vi (for mocks/spies) — everything else comes from globals
import { vi } from 'vitest';

describe('my feature', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
```

**What to import from `'vitest'`:**
- `vi` — always import (mocks, spies, timers, stubs)
- `describe`, `it`, `test`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll` — **never import** when `globals: true`

**How to detect:** If `npm run test:run` reports failing suites but all counted tests pass, check the failing files for explicit vitest imports. The symptom is 0 tests registered from those files.

### 10. ❌ Top-Level `beforeEach` / `afterEach` Outside a `describe` Block

Vitest 4.x requires lifecycle hooks to be nested inside a `describe` block. A top-level `beforeEach` (common when a file has a single implicit test group) causes a runner initialization error.

**Bad:**
```typescript
// ❌ Top-level beforeEach — Vitest 4.x throws "failed to find the runner"
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

it('should fetch data', async () => { /* ... */ });
```

**Good:**
```typescript
// ✅ Wrap in a describe block
import { vi } from 'vitest';

describe('API Client', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('should fetch data', async () => { /* ... */ });
});
```

### 13. ❌ Using `waitForTimeout` to Wait for CSS Transitions

Arbitrary `waitForTimeout(300)` / `waitForTimeout(400)` calls after triggering a UI state change (open/close drawer, toggle, etc.) are a specific form of §3. They guess at the transition duration and fail under load when the system is slower than expected.

The correct approach is to poll the DOM condition that the transition produces — the CSS class change — not the transition duration.

**Bad:**
```typescript
// ❌ Guesses transition is done after 400ms — fails under CI load
await closeButton.click();
await page.waitForTimeout(400); // Transition time is 0.3s
const hasOpenClass = await drawer.evaluate(el => el.classList.contains('open'));
expect(hasOpenClass).toBe(false);
```

**Good:**
```typescript
// ✅ Waits for the actual class change — zero arbitrary delay
await closeButton.click();
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="portfolio-filter-drawer"]');
  return el && !el.classList.contains('open');
});
const hasOpenClass = await drawer.evaluate(el => el.classList.contains('open'));
expect(hasOpenClass).toBe(false);
```

**Why this matters in drawer tests specifically:** The `filter-drawer-layering` tests toggle the drawer open and closed multiple times in a loop. With `waitForTimeout`, each iteration adds fixed latency and the timing can drift, causing subsequent `click()` calls to land mid-transition. With `waitForFunction`, each step waits for the actual condition before proceeding — robust at any speed.

### 14. ❌ Using `overlay.click()` on Z-Index-Layered Elements

When a full-viewport overlay element is at a high z-index, Playwright's `locator.click()` uses a hit-test to find the topmost element at the click coordinates. Even if you hold a reference to the overlay locator, the click may land on a sibling element (e.g., the drawer itself) that sits at the same z-level, causing `click()` to either throw "element intercepts pointer events" or click the wrong element.

This is a special case of §7 (Clicking Elements Obscured by Z-Index Layering), common in drawer/modal overlay patterns.

**Bad:**
```typescript
// ❌ Hit-test can land on the drawer (higher z-index sibling) instead of the overlay
const overlay = page.locator('[data-testid="portfolio-filter-overlay"]');
await overlay.click(); // Fails: "element intercepts pointer events"
```

**Good:**
```typescript
// ✅ dispatchEvent bypasses the hit-test entirely — event fires directly on the target
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="portfolio-filter-overlay"]');
  if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
```

**Key principle:** Use `page.evaluate(() => el.dispatchEvent(...))` any time you need to click an element that may be obscured by a sibling at the same or higher z-index. This is the same pattern used in the D3 map SVG path helpers (`clickSvgPath`). The `dispatchEvent` approach is equivalent from the JavaScript event model's perspective — the element's click handler fires — but it bypasses Playwright's coordinate-based hit-test.

### 15. ❌ Asserting on CSS Property Values Immediately After Closing an Animated Element

CSS transitions run asynchronously. When a class is removed to trigger a close animation (e.g., `right: -400px` sliding a drawer off-screen), the class change is synchronous but the animated CSS property (like `right`) is still at its open-state value and won't reach its final value until the transition completes (~300ms later). Reading `getComputedStyle` immediately after the class change gives the mid-transition value, not the closed-state value.

This manifests as intermittent failures with unexpected values like `-6.9` instead of `-400` — the test happened to read the property at a different point in the animation each time.

**Bad:**
```typescript
// ❌ Reads right value mid-animation — non-deterministic result
await closeButton.click();
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="drawer"]');
  return el && !el.classList.contains('open'); // class is gone, but animation still running
});

const finalRight = await drawer.evaluate((el) => parseFloat(getComputedStyle(el).right));
expect(finalRight).toBeLessThanOrEqual(-360); // Fails: actual value is e.g. -6.9
```

**Good:**
```typescript
// ✅ Assert on the logical state (class, aria), not the animated CSS property
await closeButton.click();
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="drawer"]');
  return el && !el.classList.contains('open');
});

const hasOpenClass = await drawer.evaluate((el) => el.classList.contains('open'));
expect(hasOpenClass).toBe(false); // ✅ Deterministic
expect(await filterButton.getAttribute('aria-expanded')).toBe('false'); // ✅ Deterministic
```

**Key principle:** Test the logical closed state (CSS class, `aria-expanded`, `hidden` attribute, visibility), not the animated CSS property value. If you genuinely need to assert on a final CSS position, wait for the `transitionend` event instead of using `waitForFunction` on the class.

### 16. ❌ Using `page.$$()` Snapshot Queries on Dynamically Rendered Elements

`page.$$()` (and `page.$()`) takes a one-shot DOM snapshot and returns `ElementHandle` references. When elements are rendered dynamically via `innerHTML` (common in wizard/SPA patterns), the snapshot may return 0 elements or stale handles if the render hasn't completed. This causes tests to silently skip interactions — e.g., "answer all questions" answers nothing, so the next button stays disabled and the test times out.

**Bad:**
```typescript
// ❌ page.$$ is a snapshot — if innerHTML render hasn't completed, returns []
async function answerAllInStep(page: Page, score: number): Promise<void> {
  const buttons = await page.$$(`[data-score="${score}"]`);
  for (const btn of buttons) {
    await btn.click(); // never executes if buttons is empty
  }
}
```

**Good:**
```typescript
// ✅ waitForSelector confirms elements exist; locator auto-retries
async function answerAllInStep(page: Page, score: number): Promise<void> {
  await page.waitForSelector(`[data-score="${score}"]`, { timeout: 3000 });

  const buttons = page.locator(`[data-score="${score}"]`);
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    await buttons.nth(i).click();
  }
}
```

**When this bites you:**
- Wizard/multi-step forms that render questions via `innerHTML` on each step transition
- SPA views that swap content dynamically without full page navigation
- Any pattern where a container's children are replaced after a state change

**Key principle:** Prefer `page.locator()` (auto-waiting, auto-retrying) over `page.$$()` / `page.$()` (snapshot, no waiting). When you need to iterate over multiple elements, use `locator.count()` + `locator.nth(i)` instead of `ElementHandle[]` iteration. Always pair with a `waitForSelector` or `waitForFunction` to confirm the render is complete before counting.

### 17. ❌ Using `page.evaluate(() => el.click())` Without Waiting for the DOM Reaction

`page.evaluate()` executes synchronously in the browser and returns immediately to the test runner. The click fires the event handler, but any resulting DOM update (class toggle, filter re-render, step transition) happens asynchronously. Asserting immediately after the evaluate call reads stale state.

This is the most common cause of "works in Chromium, fails in WebKit/Firefox" — WebKit is slightly slower to process event handlers under parallel load.

**Bad:**
```typescript
// ❌ evaluate returns before the click handler's DOM updates complete
await page.evaluate(() => {
  document.querySelector('.filter-chip[data-category="ai"]')?.click();
});
// Immediately reading state — may get pre-click value
const isActive = await page.locator('.filter-chip[data-category="ai"]').evaluate(
  el => el.classList.contains('active')
);
expect(isActive).toBe(true); // Flaky
```

**Good:**
```typescript
// ✅ Click via evaluate, then wait for the DOM to reflect the change
await page.evaluate(() => {
  (document.querySelector('.filter-chip[data-category="ai"]') as HTMLElement)?.click();
});

await page.waitForFunction(() => {
  const chip = document.querySelector('.filter-chip[data-category="ai"]');
  return chip?.classList.contains('active');
});

await expect(page.locator('.filter-chip[data-category="ai"]')).toHaveClass(/active/);
```

**When this applies:** Every time you use `page.evaluate(() => el.click())` — which is the standard pattern for WebKit stability (§7) — you **must** follow it with a `waitForFunction` that confirms the expected DOM change before asserting. The evaluate-click and the wait are always a pair.

### 18. ❌ Fire-and-Forget `setTimeout` Timers in Source Code

When source code uses `setTimeout` for delayed actions (auto-advance, debounce, animation cleanup) without saving the timer ID, stale timers can fire after navigation has moved to a different state. This creates race conditions that are invisible in manual testing but surface under E2E parallel load.

**Bad (source code):**
```typescript
// ❌ Timer reference is lost — cannot be cancelled
function handleOptionClick(card: HTMLElement): void {
  selectOption(card);

  // Auto-advance after visual feedback delay
  setTimeout(() => {
    if (currentStep < totalSteps) {
      showStep(currentStep + 1);  // Fires even if user navigated away
    }
  }, 300);
}
```

**Good (source code):**
```typescript
// ✅ Save timer ID, cancel in any navigation function
let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

function showStep(step: number): void {
  // Cancel any pending auto-advance to prevent stale navigations
  if (autoAdvanceTimer !== null) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
  currentStep = step;
  // ... render step
}

function handleOptionClick(card: HTMLElement): void {
  selectOption(card);

  autoAdvanceTimer = setTimeout(() => {
    autoAdvanceTimer = null;
    if (currentStep < totalSteps) {
      showStep(currentStep + 1);
    }
  }, 300);
}
```

**Key principle:** Every `setTimeout` that triggers navigation or state changes **must** have a saved reference and be cancelled by any function that also changes that state. This is not just a test concern — it's a real product bug that manifests as "clicked Back but ended up on the wrong step" for fast users.

**How to detect in tests:** Step-mismatch errors like `Expected step "6", got "7"` or `Expected step "9", got "10"` — the stale timer fires `showStep(currentStep + 1)` after navigation has already set `currentStep` to the target.

### 19. ❌ Mocking State Lost After Cross-Page Navigation

`page.evaluate()` mocks (window property overrides, `gtag` intercepts, `fetch` stubs) exist only in the current page context. After `page.goto()` to a different URL, the new page loads fresh JavaScript — all mocks are gone. Tests that navigate and then assert on mocked state silently pass with unmocked (real) behavior, or fail because the mock data is missing.

**Bad:**
```typescript
test('should track events across pages', async ({ page }) => {
  await setupAnalyticsMocking(page);  // Overrides window.gtag
  await page.goto('/page-a');
  // ... interact with page A

  await page.goto('/page-b');  // ❌ Mocks are gone — new page context

  await page.locator('#cta').click();
  const events = await getRecordedEvents(page);  // Returns [] — mock was lost
  expect(events).toContainEqual({ eventName: 'cta_click' });  // Fails
});
```

**Good:**
```typescript
test('should track events across pages', async ({ page }) => {
  await setupAnalyticsMocking(page);
  await page.goto('/page-a');
  // ... interact with page A

  await page.goto('/page-b');
  await setupAnalyticsMocking(page);  // ✅ Re-initialize mocks for new page

  await page.locator('#cta').click();
  const events = await getRecordedEvents(page);
  expect(events).toContainEqual({ eventName: 'cta_click' });
});
```

**Key principle:** Any `page.evaluate()`-based mock must be re-applied after every `page.goto()`. If your test navigates between pages, call the mock setup function again. Route-based mocks (`page.route()`) persist across navigations because they operate at the network layer, not the page context.

### 21. ❌ Relying on Implicit UI Defaults Instead of Explicit Setup

Tests that depend on a page's default selections (e.g., "Series B-C is pre-selected on load") are brittle. When the UX is improved to require explicit user choices — or when defaults are changed — every test that skipped the setup step breaks simultaneously.

This was discovered in the TechPar tool: 13 E2E tests relied on `series_bc` being the default company stage. When the default was removed (forcing users to make an intentional choice), all 13 tests failed because `buildInputs()` returned `null` without a stage selection.

**Bad:**
```typescript
// ❌ Assumes series_bc is pre-selected — breaks when default is removed
test('should enable analysis button', async ({ page }) => {
  await gotoTool(page);
  await fillInput(page, 'arr', '10000000');
  await clickTab(page, 'costs');
  await fillInput(page, 'infra', '50000');
  const btn = page.locator('[data-btn-analysis]');
  await expect(btn).toBeEnabled(); // Fails: no stage selected → compute returns null
});
```

**Good:**
```typescript
// ✅ Explicitly sets all required state — survives default changes
test('should enable analysis button', async ({ page }) => {
  await gotoTool(page);
  await selectStage(page, 'series_bc');  // Explicit — no implicit dependency
  await fillInput(page, 'arr', '10000000');
  await clickTab(page, 'costs');
  await fillInput(page, 'infra', '50000');
  const btn = page.locator('[data-btn-analysis]');
  await expect(btn).toBeEnabled();
});
```

**Key principle:** Every test should explicitly set up its own required state. Never rely on what happens to be selected when the page loads — those defaults are a UX decision that can change. Extract a helper (e.g., `selectStage()`) so the setup is clean and consistent across tests.

### 20. ❌ Simulating CSS `:hover` with JavaScript Events in Headless Browsers

CSS `:hover` is a browser-internal pseudo-class state. Dispatching `mouseenter`, `mouseover`, or `pointerover` events via JavaScript does **not** activate `:hover` styles in headless browsers (and often not in headed mode either). Tests that dispatch mouse events and then assert on `:hover` CSS properties always fail.

**Bad:**
```typescript
// ❌ dispatchEvent does not activate CSS :hover pseudo-class
await page.evaluate(() => {
  const el = document.querySelector('.photo-link');
  el?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  el?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
});

const opacity = await page.locator('.photo-link').evaluate(el =>
  window.getComputedStyle(el).opacity
);
expect(opacity).toBe('0.85');  // Fails — :hover styles never activated
```

**Good:**
```typescript
// ✅ Verify the CSS rule exists in the stylesheet instead
const hasHoverRule = await page.evaluate(() => {
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSStyleRule && rule.selectorText.includes('.photo-link:hover')) {
          return true;
        }
      }
    } catch { /* cross-origin sheets throw */ }
  }
  return false;
});
expect(hasHoverRule).toBe(true);
```

**When to use which approach:**
- **JavaScript event handlers** (e.g., `element.addEventListener('mouseenter', ...)`) — use `page.hover()` or `dispatchEvent`, these work fine
- **CSS `:hover` pseudo-class styles** — cannot be triggered programmatically; verify the rule exists in the stylesheet, or use `page.hover()` which activates the browser's native hover state (works in headed mode, unreliable in headless)

---

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/portfolio-discovery.test.ts

# Run with headed browser to see what's happening
npx playwright test --headed

# Run single test
npx playwright test portfolio-discovery.test.ts -g "should apply stage filter"

# Run with verbose output
npx playwright test --verbose

# Generate HTML report
npx playwright test && npx playwright show-report
```

## Debugging Tests

1. **Add console logs**:
   ```typescript
   const state = await page.evaluate(() => (window as any).portfolioState);
   console.log('Portfolio state:', state);
   ```

2. **Take screenshots**:
   ```typescript
   await page.screenshot({ path: 'screenshot.png' });
   ```

3. **Use headed mode**:
   ```bash
   npx playwright test --headed
   ```

4. **Pause on failure**:
   ```typescript
   await page.pause(); // Execution pauses, you can inspect
   ```

## Summary

The key principle: **Test what users experience, not implementation details.**

- ✅ Test user interactions and their results
- ✅ Verify state changes (before/after)
- ✅ Wait for actual state changes, not arbitrary timeouts
- ✅ Check both visual feedback (classes) AND actual behavior (CSS, state, data)
- ✅ Use explicit assertions with expected values
- ✗ Don't test UI presence without behavior
- ✗ Don't use meaningless assertions
- ✗ Don't use arbitrary timeouts
- ✗ Don't assume CSS classes mean functionality works
- ✗ Don't rely on implicit UI defaults — explicitly set all required state in each test
