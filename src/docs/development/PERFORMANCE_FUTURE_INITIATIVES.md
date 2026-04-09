# Performance Optimization — Future Initiatives

This document captures performance improvement opportunities that were identified during the April 2026 Vercel Speed Insights analysis but deferred due to scope, risk, or cost/benefit considerations. Each is a candidate for future work when the surrounding conditions change.

**Context:** In April 2026, three pages were flagged as "Needs Improvement" by Vercel Speed Insights (scores 75-78). Six targeted optimizations were implemented (geodata externalization, dynamic imports, GA deferral, blur reduction, TopoJSON simplification). The initiatives below were evaluated and intentionally deferred.

---

## Initiative #1: Global CSS Refactoring

**Status:** Deferred
**Priority:** Medium
**Risk:** High (regression potential across every page)
**Estimated Effort:** 8-16 hours

### Problem

`src/styles/global.css` is 5,511 lines and is loaded on every page via `BaseLayout.astro`. It contains component-specific styles that are only relevant to a subset of pages. This CSS is render-blocking — the browser must parse all of it before first paint, regardless of how much the current page actually uses.

### Why It Was Deferred

- **High regression risk**: Global CSS changes affect every page on the site. A single mis-scoped selector could break layouts across unrelated pages.
- **Large scope**: 5,511 lines requires systematic audit to determine which styles belong in components vs. global scope.
- **Astro mitigates the impact**: Astro's build pipeline handles CSS extraction and optimization. The practical perf impact of the file size is smaller than the raw line count suggests.

### Recommended Approach (When Revisited)

1. **Audit phase**: Catalog every selector in global.css and map it to the pages/components that use it
2. **Extract tool-specific styles**: Move styles only used by hub tool pages (regulatory-map, diligence-machine, etc.) into component-scoped `<style>` blocks
3. **Extract component-specific styles**: Move styles for `.brutal-reg-card`, `.brutal-timeline-*`, `.wizard-*`, etc. into their respective component files
4. **Retain truly global styles**: Keep resets, layout, utilities, and the brutalist design system primitives in global.css
5. **Regression testing**: Run full E2E suite after each extraction batch; visual regression testing recommended

### Files

- `src/styles/global.css` (5,511 lines)
- `src/styles/variables.css`, `typography.css`, `interactions.css`, `palettes.css` (imported by global.css)

---

## Initiative #2: CSS Code Splitting via @layer

**Status:** Deferred
**Priority:** Low
**Risk:** Medium (browser support, architectural complexity)
**Estimated Effort:** 4-8 hours

### Problem

Even after extracting component-specific styles from global.css (Initiative #1), the remaining global styles are delivered as a single render-blocking bundle. CSS `@layer` could allow non-critical layers to be loaded with lower priority.

### Why It Was Deferred

- **Marginal gain**: On these specific pages, the CSS overhead is not the primary bottleneck (geodata and JS bundle were far larger contributors).
- **Architectural complexity**: Introducing `@layer` requires rethinking cascade priorities across the entire stylesheet. Existing styles rely on source-order specificity, which `@layer` overrides.
- **Browser support**: While modern browsers support `@layer`, it adds a concept that every future contributor must understand.

### Recommended Approach (When Revisited)

- Only consider after Initiative #1 is complete (global.css is already simplified)
- Evaluate whether the remaining global CSS size justifies the architectural investment
- Prototype with a single non-critical layer (e.g., print styles) before committing

---

## Initiative #3: Diligence Machine Wizard Step Lazy-Rendering

**Status:** Deferred
**Priority:** Low
**Risk:** Medium (SEO impact, architectural change)
**Estimated Effort:** 4-6 hours

### Problem

All 10 wizard steps (~50+ interactive buttons) are server-rendered into the HTML upfront and hidden with CSS. The browser must parse, style, and lay out all steps even though only one is visible at a time. This adds to initial DOM complexity and parse time.

### Why It Was Deferred

- **SSR benefits**: Server-rendering all steps means the full page structure is available to crawlers and assistive technology. Switching to client-side rendering would degrade SEO and accessibility.
- **Acceptable cost**: Hidden DOM elements have minimal paint cost — the browser doesn't composite elements with `display: none`. The overhead is in parsing and style calculation, which is measurable but small relative to other bottlenecks.
- **Complexity**: Dynamic step injection would require a templating system or innerHTML generation, adding code complexity to the already-large wizard script.

### Recommended Approach (When Revisited)

- Consider only if Vercel Speed Insights score for diligence-machine remains below 80 after the current optimizations
- A middle-ground approach: keep all steps server-rendered but use `content-visibility: auto` CSS property on non-active steps to skip their layout/paint cost
- Test `content-visibility` impact with Lighthouse before committing

### Files

- `src/pages/hub/tools/diligence-machine/index.astro` (3,000+ lines)

---

## Initiative #4: Transition Rule Consolidation

**Status:** Deferred
**Priority:** Low
**Risk:** Medium (visual regressions)
**Estimated Effort:** 3-5 hours

### Problem

There are 82 `transition:` declarations across the CSS files (73 in global.css alone). Many use similar patterns (`transition: all var(--transition-normal)`) but are declared independently per component. This adds parse overhead and makes transition behavior harder to audit.

### Why It Was Deferred

- **Each serves a specific component**: While the patterns are similar, many components have intentionally different transition properties (e.g., `border-color` only vs. `all`). Consolidating without understanding each context risks breaking hover/focus animations.
- **Visual regression risk**: Transition changes are subtle and hard to catch in automated tests. E2E tests verify functionality, not animation smoothness.
- **Low impact**: Transition declarations are small (bytes, not kilobytes). The parse-time cost of 82 rules is negligible compared to the other bottlenecks addressed.

### Recommended Approach (When Revisited)

1. Audit all 82 declarations and group by actual transition property (`all` vs. specific properties)
2. Create utility classes (e.g., `.transition-border`, `.transition-all`) for the most common patterns
3. Replace inline declarations with utility classes where the transition behavior is identical
4. Visual review in both light and dark themes at all breakpoints

### Files

- `src/styles/global.css` (73 declarations)
- `src/styles/interactions.css` (5 declarations)
- `src/styles/typography.css` (1 declaration)
- `src/styles/variables.css` (1 declaration)

---

## Cross-Reference

- **Completed optimizations (April 2026)**: See git log for commits `3ce20dc` through `b60d255` on the `dev` branch
- **Performance monitoring**: See [DEVELOPMENT_OPPORTUNITIES.md](DEVELOPMENT_OPPORTUNITIES.md) Initiative #1 (Lighthouse CI)
- **Design system docs**: See [../styles/STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) for CSS conventions
- **Regulatory map architecture**: See [../hub/REGULATORY_MAP.md](../hub/REGULATORY_MAP.md) for the externalized geodata approach
