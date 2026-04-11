# Development Opportunities

This document outlines strategic opportunities for improving the GST website through automation, testing, and monitoring initiatives. Each opportunity is evaluated for ROI and implementation cost.

---

## Initiative #1: Lighthouse CI for Performance Monitoring

**Status:** Proposed
**Priority:** High
**Estimated Effort:** 2-3 hours (one-time setup)
**Expected ROI:** Very High

### Overview

Automate performance regression detection by integrating Lighthouse CI into the GitHub Actions pipeline. This catches performance regressions before they reach production and validates that performance optimizations (LCP, network dependency tree) deliver measurable impact.

### What Problem Does It Solve?

Current state:

- Performance improvements are validated manually via Lighthouse reports
- No automated CI checks prevent regressions
- Team relies on Vercel Speed Insights for post-deployment monitoring
- Performance budgets are not enforced

With Lighthouse CI:

- Performance budgets are checked on every PR
- Build fails if LCP degrades beyond threshold
- Historical trend tracking
- Automated validation of optimization efforts

### Recommended Configuration

```json
{
  "ci": {
    "uploadArtifacts": true,
    "temporaryPublicStorage": true,
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 1800 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 200 }]
      }
    }
  }
}
```

### Success Metrics

- LCP consistently < 2.5s
- All Lighthouse scores > 90
- Zero performance regressions on main branch
- Developers notified immediately of performance impact in PRs

### Implementation Checklist

- [ ] Install `@lhci/cli` and `@lhci/github-app`
- [ ] Create `.github/workflows/lighthouse.yml`
- [ ] Configure `lighthouserc.json` with budgets above
- [ ] Run first baseline report
- [ ] Document in team guidelines
- [ ] Set up Slack notifications for failures

### References

- [Lighthouse CI Documentation](https://github.com/GoogleChrome/lighthouse-ci)
- [Performance Budget Best Practices](https://web.dev/performance-budgets-101/)

---

## Initiative #2: E2E Test for Image Loading Regression

**Status:** Proposed
**Priority:** Medium-High
**Estimated Effort:** 30 minutes
**Expected ROI:** High

### Overview

Add a targeted E2E test to verify that the LCP optimization on the About page (removing lazy loading, adding `fetchpriority="high"`) doesn't regress in future refactoring.

### What Problem Does It Solve?

Current state:

- About page has founder images optimized with `fetchpriority="high"`
- No automated regression detection if attributes are accidentally removed
- Visual regressions caught manually or via Speed Insights delays

With E2E test:

- Instant feedback on image loading regressions
- Prevents accidental removal of performance attributes
- Validates image visibility on page load

### Test Implementation

Add to `tests/e2e/about-page.test.ts`:

```typescript
test('founder image should use high fetch priority for LCP optimization', async ({ page }) => {
  await page.goto('/about');

  const founderImage = page.locator('.founder-image').first();

  // Verify image is not lazy-loaded
  const loading = await founderImage.getAttribute('loading');
  expect(loading).not.toBe('lazy');

  // Verify high fetch priority is set
  const fetchpriority = await founderImage.getAttribute('fetchpriority');
  expect(fetchpriority).toBe('high');

  // Verify image is immediately visible (not deferred)
  await expect(founderImage).toBeVisible();

  // Verify dimensions are set (helps prevent CLS)
  const width = await founderImage.getAttribute('width');
  const height = await founderImage.getAttribute('height');
  expect(width).toBe('600');
  expect(height).toBe('450');
});
```

### Success Metrics

- Test passes on every commit
- No false positives/flakes
- Catches any accidental removal of `fetchpriority="high"`

### Implementation Checklist

- [ ] Add test code above to about-page.test.ts
- [ ] Run test: `npm run test:e2e`
- [ ] Verify it passes
- [ ] Add to PR check requirements

---

## Initiative #3: Unit Tests for Error Handling

**Status:** Proposed
**Priority:** Medium
**Estimated Effort:** 1-2 hours
**Expected ROI:** Medium-High

### Overview

Add targeted unit tests for the error handling improvements made to DOM access, JSON parsing, and localStorage operations. Ensures robustness across edge cases (missing elements, corrupted data, private browsing mode).

### What Problem Does It Solve?

Current state:

- Error handling added to prevent console errors (null checks, try-catch blocks)
- No automated tests validate this error handling works
- Silent failures could go unnoticed in production

With unit tests:

- Error handling code is validated
- Fallback behavior is verified
- Developers can refactor safely

### Tests to Implement

#### A. localStorage Error Handling (ThemeToggle.astro)

```typescript
describe('ThemeToggle localStorage handling', () => {
  test('should use default theme when localStorage is unavailable', () => {
    const mockStorage = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new SecurityError('localStorage unavailable');
    });

    // Component initialization should not throw
    // Verify default 'light' theme is applied
    expect(() => initializeTheme()).not.toThrow();
    expect(document.body.classList.contains('dark-theme')).toBe(false);

    mockStorage.mockRestore();
  });

  test('should gracefully handle localStorage.setItem failure', () => {
    const mockSetItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new SecurityError('Private browsing mode');
    });

    // Should not throw when saving theme preference
    expect(() => toggleTheme()).not.toThrow();

    mockSetItem.mockRestore();
  });
});
```

#### B. JSON Parsing Error Handling

```typescript
describe('Portfolio data parsing', () => {
  test('should handle malformed JSON gracefully', () => {
    const malformedData = '{invalid json}';

    const result = safeParseProjects(malformedData);

    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('Failed to parse projects data:', expect.any(Error));
  });

  test('should initialize with empty array on parse failure', () => {
    const state = initializePortfolioState('{broken}');

    expect(state.allProjects).toEqual([]);
    expect(state.filteredProjects).toEqual([]);
  });
});
```

#### C. DOM Element Access Error Handling

```typescript
describe('ProjectModal DOM safety', () => {
  test('should handle missing modal elements gracefully', () => {
    // Remove a required modal element
    document.getElementById('modal-title-2')?.remove();

    const project = { codeName: 'Test' /* ... */ };

    // Should not throw
    expect(() => window.projectModal.open(1, [project])).not.toThrow();
  });

  test('should only update elements that exist', () => {
    const mockElement = { textContent: '' };
    document.getElementById = jest.fn((id) => (id === 'modal-title-2' ? mockElement : null));

    window.projectModal.open(1, [{ codeName: 'Test' }]);

    expect(mockElement.textContent).toBe('Test');
  });
});
```

### Success Metrics

- 100% coverage of error paths
- All tests pass on every commit
- Zero console errors in production

### Implementation Checklist

- [ ] Create `tests/unit/error-handling.test.ts`
- [ ] Implement tests above
- [ ] Run: `npm run test:unit`
- [ ] Add to CI pipeline
- [ ] Document test patterns in TESTING.md

---

## Initiative #4: Performance Monitoring Dashboard

**Status:** Proposed
**Priority:** Low-Medium
**Estimated Effort:** 1-2 hours (future)
**Expected ROI:** Medium

### Overview

Create a simple dashboard or documentation that consolidates performance metrics from Vercel Speed Insights, Lighthouse CI, and Core Web Vitals. Helps the team track performance trends over time.

### What Problem Does It Solve?

Current state:

- Performance data scattered across multiple tools
- No historical trend tracking
- Hard to correlate code changes with performance impact

With dashboard:

- Single source of truth for performance metrics
- Historical trend visibility
- Easy to showcase improvements to stakeholders

### Potential Implementations

**Option A: Lightweight (No cost)**

- Create monthly performance report in Markdown
- Track: LCP, FCP, CLS, TBT over time
- Attach screenshots from Lighthouse/Speed Insights
- Store in `/docs/performance/reports/`

**Option B: Automated (Low cost)**

- Set up GitHub Pages with Lighthouse CI reports
- Auto-generates weekly summaries
- Tracks regression history

**Option C: Premium (Paid)**

- Calibre (paid, $50-300/mo)
- SpeedCurve (paid, $99+/mo)
- Provides trend analysis, team collaboration

### Recommendation

Start with **Option A** (lightweight manual reports) while Lighthouse CI is new. Graduate to Option B if team needs historical data visualization.

### Success Metrics

- Monthly performance reports
- Year-over-year trend visibility
- Stakeholder communication of performance improvements

---

## Initiative #5: Full `light-dark()` Sweep of Dark-Theme Override Block

**Status:** Blocked (pending Phase 9 pilot success signal)
**Priority:** Low-Medium
**Estimated Effort:** 2-4 hours (plus visual regression verification across 6 palettes)
**Expected ROI:** Medium — maintainability improvement; not business-critical
**Dependencies:** Phase 3 commit 0d (LightningCSS active) AND Phase 9 item #6 (bounded pilot) must be complete with all success signals green

### Overview

Migrate the remaining declarations in the `html.dark-theme` override block in [src/styles/global.css](../../styles/global.css) from paired base-rule + override-rule to single-declaration `light-dark()` calls, collapsing ~211 lines of duplicated theme logic into co-located single declarations.

This is the broader-sweep follow-on to the bounded pilot queued as Phase 9 item #6 of [PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md). The pilot migrates one small themed surface (likely button declarations or a single card variant); this initiative extends that pattern to every remaining themeable rule in the dark-theme override block.

### What Problem Does It Solve?

**Current state:**

- Every themeable declaration requires two rules: a base rule plus an `html.dark-theme` override selector
- The two rules live in different blocks (component styles vs. the centralized override block at `global.css` lines ~900-1110)
- Editing a themed surface requires touching two disjoint locations; forgetting the override causes silent theme breakage
- ~211 lines of the override block are pure value-swapping that could be expressed in half the lines, co-located with the base declaration
- Onboarding cost: new contributors have to learn the override-block pattern before they can safely modify themed components

**With a full `light-dark()` sweep:**

- One rule per themeable declaration, base + dark values co-located
- Editing a themed surface is a single-location change
- The override block shrinks from ~211 lines to whatever residual global-cascade rules remain (likely <50 lines)
- Pattern is self-documenting — `light-dark(light-value, dark-value)` is obvious at a glance
- LightningCSS compiles the source to a `@media (prefers-color-scheme)` + CSS custom property trick that works in every browser with custom-property support, so no compatibility cost

### What Problem Does It NOT Solve?

- Does not affect the 6-palette alternative system ([src/styles/palettes.css](../../styles/palettes.css)) — palettes use a different cascade mechanism (`html.palette-N` class overrides) that is orthogonal to light/dark theming
- Does not change any visual output — this is a refactor, not a redesign
- Does not eliminate all global-cascade theming — some selectors legitimately need global reach (e.g., `html.dark-theme body { background: ... }`) and should stay in the override block

### Dependencies & Gating

This initiative is **blocked until both of the following are true**:

1. **LightningCSS is active** as the Vite CSS transformer (Phase 3 commit 0d of PLATFORM_HARDENING_V1). Without it, `light-dark()` would only work in browsers that natively support it (partial support in 2026) and would degrade on older browsers.
2. **The Phase 9 pilot (item #6) has landed and met its success signals**:
   - Pilot commit passes all unit, integration, and E2E tests
   - Visual regression check shows zero diff across both themes (light and dark) and all 6 alternative palettes (palette-1 through palette-6)
   - LightningCSS compiled output is confirmed stable across multiple rebuilds
   - `color-scheme: light` / `color-scheme: dark` declarations are wired up on `html` / `html.dark-theme` so `light-dark()` resolves against the class-driven theme rather than OS preference

If the pilot surfaces unexpected complications (palette interaction bugs, LightningCSS compilation quirks, visual regressions), this initiative remains indefinitely blocked and is revisited only if the blocking issue is resolved upstream.

### Implementation Checklist

- [ ] Confirm Phase 9 pilot success signals are all green (tests, visual diff, palette sweep)
- [ ] Inventory every declaration in `global.css` lines ~900-1110 — classify each as "collapsible to `light-dark()`" or "must remain global-cascade"
- [ ] For each collapsible rule: identify the base-rule location (component scoped style or remaining global section), merge the light/dark values into a `light-dark()` call, delete the override-block entry
- [ ] Verify visually after each batch of ~20 declarations (don't do it all in one commit — 4-6 commits grouped by component area)
- [ ] Run full E2E suite once after each batch (`npm run test:e2e`)
- [ ] Spot-check all 6 alternative palettes at light and dark theme combinations (12 screenshots per commit)
- [ ] Verify LightningCSS output diff is deterministic by running `npm run build` twice and comparing
- [ ] Update [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) to document `light-dark()` as the preferred pattern for new themed declarations
- [ ] Remove or shrink the override-block section of `global.css` to reflect the new reality

### Success Metrics

- `html.dark-theme` override block in `global.css` reduced from ~211 lines to <50 lines
- Zero visual regressions across 12 theme/palette combinations
- New contributor onboarding doc for theming updated; new themed components written in the new pattern
- No increase in build output size (LightningCSS compiled output should be ≤ current bytes)
- E2E suite passes at every intermediate commit (refactor invariant)

### Commit Structure

```
refactor(css): migrate button theme declarations to light-dark()
refactor(css): migrate card theme declarations to light-dark()
refactor(css): migrate form/input theme declarations to light-dark()
refactor(css): migrate surface + container theme declarations to light-dark()
refactor(css): migrate remaining themed declarations and shrink override block
docs(styles): document light-dark() as preferred theming pattern
```

### References

- [MDN: `light-dark()` CSS function](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark)
- [Lightning CSS transpilation docs — `light-dark()`](https://lightningcss.dev/transpilation.html)
- [PLATFORM_HARDENING_V1.md Phase 9 item #6](./PLATFORM_HARDENING_V1.md#phase-9-miscellaneous-cleanup-bucket) — gating pilot
- [CLAUDE.md CSS Styling Standards](../../../.claude/CLAUDE.md) — existing dark-theme rules

---

## Summary Table

| Initiative                | Priority   | Effort | ROI         | Status                          | Start Date     |
| ------------------------- | ---------- | ------ | ----------- | ------------------------------- | -------------- |
| Lighthouse CI             | High       | 2-3h   | Very High   | Proposed                        | Sprint 1       |
| E2E Image Test            | High       | 30m    | High        | Proposed                        | Sprint 1       |
| Unit Error Tests          | Medium     | 1-2h   | Medium-High | Proposed                        | Sprint 2       |
| Perf Dashboard            | Low-Medium | 1-2h   | Medium      | Proposed                        | Sprint 3+      |
| `light-dark()` Full Sweep | Low-Medium | 2-4h   | Medium      | Blocked (pending Phase 9 pilot) | Post-hardening |

---

## Recent Performance Improvements (Reference)

These initiatives build upon recent optimizations:

### ✅ Completed (Feb 2026)

1. **LCP Optimization** (about.astro)
   - Removed `loading="lazy"` from founder images
   - Added `fetchpriority="high"` for early discovery
   - Expected improvement: 300-500ms LCP reduction

2. **Network Dependency Tree** (BaseLayout.astro)
   - Added `preconnect` to www.googletagmanager.com
   - Added `dns-prefetch` to www.google-analytics.com
   - Expected improvement: 100-200ms connection setup savings

3. **Console Error Elimination**
   - Added null checks to DOM access (ProjectModal, PortfolioHeader, StickyControls)
   - Wrapped JSON.parse in try-catch (3 components)
   - Wrapped localStorage in try-catch (ThemeToggle)
   - Result: Zero console errors in production

### Commits

- `9d4c0a6` - fix: Eliminate all console errors
- `6d977e6` - perf: Add preconnect hints to reduce critical path latency

---

## Next Steps

1. **This Sprint:** Implement Lighthouse CI (#1) and E2E test (#2)
2. **Next Sprint:** Add unit tests for error handling (#3)
3. **Future:** Set up performance dashboard (#4) as team needs evolve
4. **Post-hardening (conditional):** Execute `light-dark()` full sweep (#5) — only if the Phase 9 pilot in PLATFORM_HARDENING_V1.md hits all its success signals

For questions or to propose modifications, contact the development team.
