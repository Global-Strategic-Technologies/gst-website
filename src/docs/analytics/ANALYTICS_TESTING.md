# Google Analytics 4 Testing Guide

This document provides comprehensive guidance on testing the Google Analytics 4 implementation across unit, integration, and end-to-end tests.

## Overview

The GA4 testing suite consists of three levels:

1. **Unit Tests** - Test analytics utility functions in isolation
2. **Integration Tests** - Pin the wiring contract of the inline GA4 init script
3. **E2E Tests** - Test real user journeys and event firing in live pages

## Unit Tests

**Location:** `tests/unit/analytics.test.ts`

### Running Unit Tests

```bash
# Run all unit and integration tests
npm run test:run

# Run the analytics unit tests only
npx vitest run tests/unit/analytics.test.ts tests/unit/tool-analytics.test.ts

# Run with coverage
npm run test:coverage
```

### Test Coverage

Unit tests cover:

- ✅ `trackEvent()` - Verifies gtag is called with correct event structure
- ✅ `trackNavigation()` - Verifies navigation_click event with parameters
- ✅ `trackCTA()` - Verifies cta_click event with type and location
- ✅ `trackThemeToggle()` - Verifies theme_toggle event with theme value
- ✅ Error handling - Graceful handling when gtag unavailable
- ✅ Event categories - Proper category assignment for each event type
- ✅ Parameter mapping - Correct transformation of event data to gtag format

`tests/unit/tool-analytics.test.ts` separately pins the Hub tool event names to the `<prefix>_<action>` convention.

### Unit Test Examples

```typescript
// Test that trackEvent calls gtag with correct format
it('should call gtag with event command and parameters', () => {
  const mockGtag = vi.fn();
  (global as any).window = { gtag: mockGtag };

  trackEvent({ event: 'test_event', category: 'navigation', label: 'Test' });

  expect(mockGtag).toHaveBeenCalledWith('event', 'test_event', {
    event_category: 'navigation',
    label: 'Test',
  });
});

// Test navigation tracking with destination
it('should track navigation click with destination URL', () => {
  const mockGtag = vi.fn();
  (global as any).window = { gtag: mockGtag };

  trackNavigation('/ma-portfolio', 'M&A Portfolio');

  expect(mockGtag).toHaveBeenCalledWith('event', 'navigation_click', {
    event_category: 'navigation',
    label: 'M&A Portfolio',
    destination: '/ma-portfolio',
  });
});

// Test error handling when gtag unavailable
it('should not throw if gtag is not available', () => {
  (global as any).window = {}; // No gtag

  expect(() => {
    trackEvent({ event: 'test', category: 'navigation' });
  }).not.toThrow();
});
```

## Integration Tests

**Location:** `tests/integration/google-analytics-wiring.test.ts`

The unit tests mock `window.gtag` and the E2E helper replaces it with a recorder, so neither ever runs the production `gtag` function. This test closes that gap: it asserts on the source of the inline init script in `src/components/GoogleAnalytics.astro`, which must push the `arguments` object to `dataLayer` (Google's canonical pattern). A rest-spread variant passed every other test and silently stopped all GA beacons for about a month in 2026 — the test header has the history.

```bash
npx vitest run tests/integration/google-analytics-wiring.test.ts
```

## End-to-End Tests

**Location:**

- `tests/e2e/analytics.test.ts` - GA4 event tracking
- `tests/e2e/mobile-navigation.test.ts` - Mobile interactions
- `tests/e2e/project-details.test.ts` - Project card interactions
- `tests/e2e/theme-toggle.test.ts` - Theme toggle functionality

### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run analytics E2E tests only
npm run test:e2e -- analytics.test.ts

# Run with UI (visual debugging)
npm run test:e2e -- --ui

# Debug mode (runs one browser, opens inspector)
npm run test:e2e:debug
```

### Test Coverage

**Analytics Tests:**

- ✅ Pages still render when GA requests are blocked
- ✅ Portfolio card clicks fire `portfolio_view_details` event
- ✅ Modal close fires `portfolio_close_modal` event
- ✅ Theme toggle fires `theme_toggle` event with correct value
- ✅ CTA clicks fire `cta_click` event with type and location
- ✅ Header nav clicks fire `navigation_click` with destination and label
- ✅ Theme chip clicks fire `filter_applied` with `filter_type: 'theme'` and the chip's value
- ✅ MCP guide pages fire `mcp_guide_view` and the endpoint-copy events (BL-152)
- ✅ Runs in chromium in the required CI job; firefox and webkit only on a local `npm run test:e2e` or the manual `test-cross-browser.yml` run

**User Interaction Tests:**

- ✅ Mobile navigation (tap targets, modal scrolling, responsive layout)
- ✅ Project details (modal opening, closing, keyboard navigation)
- ✅ Theme toggle (button functionality, persistence)
- ✅ All interactive elements properly visible and enabled

### E2E Test Examples

```typescript
// Test portfolio_view_details event tracking
test('should track project card clicks', async ({ page }) => {
  await page.goto('/ma-portfolio');

  // Click first project card
  const firstCard = page.locator('[data-testid="project-card"]').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();

  // Wait for modal
  const modal = page.locator('[data-testid="project-modal"]');
  await expect(modal).toBeVisible({ timeout: 5000 });

  // Verify portfolio_view_details event was tracked
  const events = await page.evaluate(() => (window as any).gtagEvents || []);
  const viewDetailsEvent = events.find((e: any) => e.eventName === 'portfolio_view_details');
  expect(viewDetailsEvent).toBeDefined();
  expect(viewDetailsEvent?.eventData).toBeDefined();
});

// Test theme_toggle event tracking
test('should track theme toggle clicks', async ({ page }) => {
  await page.goto('/');

  // Every spec starts light (storage-baseline.ts); one click is one step of
  // the four-state cycle (ADR-0038). Read both classes, never dark-theme alone.
  expect(await currentTheme(page)).toBe('light');

  const themeToggle = page.locator('[data-testid="theme-toggle"]');
  await expect(themeToggle).toBeVisible();
  await clickThemeToggle(page); // helpers/theme.ts
  await waitForTheme(page, 'dim-light');

  // Verify theme_toggle event was tracked
  const events = await page.evaluate(() => (window as any).gtagEvents || []);
  const toggleEvent = events.find((e: any) => e.eventName === 'theme_toggle');
  expect(toggleEvent).toBeDefined();
  expect(toggleEvent?.eventData.theme).toBe('dim-light');
});
```

## Testing Best Practices

### 1. Mock gtag in Unit Tests

Always mock `window.gtag` to verify correct function calls:

```typescript
const mockGtag = vi.fn();
(global as any).window = { gtag: mockGtag };

trackEvent(eventData);

expect(mockGtag).toHaveBeenCalledWith('event', eventName, eventParams);
```

### 2. Verify Specific Events in E2E Tests

Use the helper functions to verify actual events were tracked:

```typescript
const events = await page.evaluate(() => (window as any).gtagEvents || []);
const viewEvent = events.find((e: any) => e.eventName === 'portfolio_view_details');
expect(viewEvent).toBeDefined();
expect(viewEvent?.eventData.project_name).toBeTruthy();
```

### 3. Use Proper Async Assertions

Don't use `.catch(() => false)` to hide failures - use proper assertions:

```typescript
// ❌ BAD - hides failures
const isVisible = await button.isVisible().catch(() => false);
if (isVisible) { ... }

// ✅ GOOD - fails if button not visible
await expect(button).toBeVisible();
await button.click();
```

### 4. Test Error Handling

Verify graceful handling when gtag is unavailable:

```typescript
it('should not throw if gtag is not available', () => {
  (global as any).window = {}; // No gtag

  expect(() => {
    trackEvent({ event: 'test', category: 'navigation' });
  }).not.toThrow();
});
```

### 5. Test Complete User Journeys

Combine multiple interactions to test realistic user flows:

```typescript
test('should track full journey', async ({ page }) => {
  // 1. Navigate
  await page.locator('a:has-text("M&A")').click();
  await page.waitForURL('/ma-portfolio');

  // 2. View project
  const card = page.locator('[data-testid="project-card"]').first();
  await card.click();
  await expect(page.locator('[data-testid="project-modal"]')).toBeVisible();

  // 3. Verify events
  const events = await page.evaluate(() => (window as any).gtagEvents || []);
  expect(events.find((e) => e.eventName === 'navigation_click')).toBeDefined();
  expect(events.find((e) => e.eventName === 'portfolio_view_details')).toBeDefined();
});
```

### 6. Use data-testid for Stable Selectors

Reference components by data-testid in E2E tests - don't use fragile selectors:

```typescript
// ✅ GOOD - stable selector
const card = page.locator('[data-testid="project-card"]').first();
const modal = page.locator('[data-testid="project-modal"]');
const toggle = page.locator('[data-testid="theme-toggle"]');

// ❌ AVOID - fragile selectors
const card = page.locator('.project-card, [role="button"]'); // Guessing at selectors
const modal = page.locator('dialog, .modal'); // Multiple variations
```

### 7. Wait for Conditions, Not Time

Always wait for specific conditions instead of arbitrary timeouts:

```typescript
// ❌ BAD - arbitrary wait
await page.waitForTimeout(1000);

// ✅ GOOD - wait for condition
await expect(modal).toBeVisible({ timeout: 5000 });
await page.waitForURL('/ma-portfolio');
```

## Debugging GA Events

### DebugView checklist for the MCP pages (BL-152)

Before a campaign starts, each key event in [GOOGLE_ANALYTICS.md § Key events](./GOOGLE_ANALYTICS.md#key-events-the-conversion-set) must be seen in GA4 DebugView from a real click on the production site (enable the Google Analytics Debugger extension — the site does not read a `?debug_mode=1` URL parameter; confirm hits carry `_dbg=1`). Walk the `mcp_` family in this order and tick each off: `mcp_guide_view` on landing at `/hub/mcp/get-started/`; `mcp_clip_play` when the first clip renders; `mcp_endpoint_copied` (with `target: endpoint`) on the endpoint Copy button; `mcp_guide_complete` on scrolling to the gateway cards; `mcp_request_access` on the mailto at `/hub/mcp/`; `mcp_trial_signup` on a trial issue. **Read this before repeating a signup from a network that already has a trial — it is not a refusal.** While that trial is still inside its window, the handler **rotates the secret on the same client** and returns `outcome: reissued`, which **revokes the previous credential the moment the new one is created**. A repeat verification therefore costs you any saved key from that network, silently, and `mcp_trial_refused` does **not** fire. The `expired` refusal only happens once the trial has actually ended (`mcp-server/src/trial/signup.ts` — the 403 branch is reached only past expiry). So: verify from a network with no live trial, accept `outcome: reissued` as proof the event fires, or reset the lease deliberately per [AUTH.md § Self-serve trial mint](../../../mcp-server/src/docs/operations/AUTH.md) (`npm -w @gst/mcp-server run trial:reset`, from the repo root). **`mcp_trial_refused` has no observed production evidence yet** — it is unverifiable on demand for exactly this reason, and a zero there is not evidence the path works. An event that does not appear is not a conversion, whatever the code says.

### View Recorded Events in Tests

The analytics helper automatically records events to `window.gtagEvents`:

```typescript
// Events are automatically recorded by setupAnalyticsMocking
const events = await page.evaluate(() => (window as any).gtagEvents || []);

// Each event has: eventName, eventData, timestamp
events.forEach((event) => {
  console.log('Event:', event.eventName);
  console.log('Data:', event.eventData);
  console.log('Time:', event.timestamp);
});
```

### Find Specific Events

```typescript
const portfolioViewEvent = events.find((e: any) => e.eventName === 'portfolio_view_details');

if (portfolioViewEvent) {
  console.log('Project ID:', portfolioViewEvent.eventData.project_id);
  console.log('Project Name:', portfolioViewEvent.eventData.project_name);
}
```

### Wait for an Event

`tests/e2e/helpers/analytics.ts` exports one helper, `setupAnalyticsMocking`. It blocks GA network requests and wraps `window.gtag` so every event lands in `window.gtagEvents`. The wrapper lives in the page context, so call it after every `page.goto()`. Then wait on the array rather than reading it once, because events can land a frame after the click:

```typescript
import { setupAnalyticsMocking } from './helpers/analytics';

await page.goto('/ma-portfolio/');
await setupAnalyticsMocking(page);

await chip.click();
await page.waitForFunction(() =>
  ((window as any).gtagEvents || []).some(
    (e: any) => e.eventName === 'filter_applied' && e.eventData.filter_type === 'theme'
  )
);
```

## CI/CD Integration

There is no analytics-specific workflow: these tests run inside the ordinary suites — the unit and integration files in **Unit & Integration Tests**, and `tests/e2e/analytics.test.ts` in **E2E Tests (Playwright)** (chromium). See [GITHUB_ACTIONS_SETUP.md](../testing/GITHUB_ACTIONS_SETUP.md).

## Troubleshooting

### Events not being tracked in E2E

**Cause:** Element not visible or selector incorrect
**Solution:** Use `data-testid` attributes and proper assertions

```typescript
// ✅ GOOD - wait for visibility, then verify event
const element = page.locator('[data-testid="my-element"]');
await expect(element).toBeVisible();
await element.click();

// Verify event was tracked
const events = await page.evaluate(() => (window as any).gtagEvents || []);
const event = events.find((e) => e.eventName === 'expected_event');
expect(event).toBeDefined();
```

### Flaky E2E tests

**Cause:** Timing issues or defensive coding hiding failures
**Solution:** Use proper wait conditions and remove defensive code

```typescript
// ❌ BAD - defensive code
const isVisible = await element.isVisible().catch(() => false);
if (isVisible) { ... }

// ✅ GOOD - proper waits
await expect(element).toBeVisible({ timeout: 5000 });
await element.click();

// Wait for specific condition
await page.waitForFunction(() => {
  return (window as any).gtagEvents?.length > 0;
});
```

### Test passes when it shouldn't

**Cause:** `|| true` or `.catch(() => false)` patterns
**Solution:** Remove defensive code and use proper assertions

```typescript
// ❌ BAD - always passes
expect(isVisible || true).toBeTruthy();

// ✅ GOOD - actual assertion
await expect(element).toBeVisible();
```

## Resources

- [Google Analytics 4 Documentation](https://support.google.com/analytics/topic/12154439)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [GA4 Event Reference](https://support.google.com/analytics/answer/9322688)

## Further Reading

- See [GOOGLE_ANALYTICS.md](./GOOGLE_ANALYTICS.md) for GA4 implementation details
- See [TEST_STRATEGY.md](../testing/TEST_STRATEGY.md) for overall testing strategy
