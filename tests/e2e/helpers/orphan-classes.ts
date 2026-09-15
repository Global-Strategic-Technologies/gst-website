/**
 * Orphan-class scan — every class in the rendered DOM must have a CSS rule (BL-116).
 *
 * Ported from the /brand-only check in brand-page.test.ts, which caught 28
 * phantom classes there; the same defect was hand-fixed twice more on other
 * routes (BL-105, BL-114) before it became a guard. Run from
 * accessibility.test.ts over every `PAGES` entry, so it inherits that list's
 * `waitFor`/`setup` and costs no extra navigation.
 *
 * COVERAGE. Every route in `PAGES`, in the settled state axe scans — at rest,
 * plus whatever each entry's `setup` opens. NOT covered: `/500` and dynamic
 * routes (neither is in `PAGES`), and state classes a script adds only after an
 * interaction no `setup` performs.
 *
 * PRECISION LIMIT, inherited from the original. A class counts as "defined" if
 * its name appears anywhere in any selector — another component's scoped rule,
 * or a descendant qualifier (`.a .b` marks both). So this catches a class with
 * no rule at all, not a class whose rule can never apply in this context. The
 * inverse — a rule whose element is rendered by a different component, so its
 * `data-astro-cid-*` never matches — is also invisible here; see
 * STYLES_GUIDE § Scoped vs. Global Styles for what does and does not guard it.
 */
import type { Page } from '@playwright/test';

/**
 * Framework output, not authored markup: Astro adds `class="astro-<cid>"` beside
 * `data-astro-cid-<cid>` on an element that receives spread attributes (e.g.
 * CTABox.astro's `<a {...emailAttrs}>`), so scoping survives the spread. Nobody
 * writes it and no rule targets it by name — styling goes through the attribute.
 * Filtered here rather than allowlisted per route because its cid hash is
 * build-derived and would churn every allowlist on any component rename.
 */
const FRAMEWORK_GENERATED = /^astro-[a-z0-9]+$/;

/** Classes on rendered elements with no matching `.name` in any readable stylesheet. */
export async function collectOrphanClasses(page: Page): Promise<string[]> {
  const orphans = await page.evaluate(() => {
    const defined = new Set<string>();
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        const sel = (rule as CSSStyleRule).selectorText;
        if (sel) {
          for (const m of sel.matchAll(/\.([A-Za-z0-9_-]+)/g)) defined.add(m[1]);
        }
        const nested = (rule as CSSGroupingRule).cssRules;
        if (nested) walk(nested);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
        /* cross-origin stylesheet — not readable, skip */
      }
    }
    const used = new Set<string>();
    for (const el of Array.from(document.querySelectorAll('[class]'))) {
      for (const c of Array.from(el.classList)) used.add(c);
    }
    return [...used].filter((c) => !defined.has(c)).sort();
  });
  return orphans.filter((c) => !FRAMEWORK_GENERATED.test(c));
}

/**
 * Compare a route's orphans against its allowlist.
 *
 * `unexpected` — orphans nobody declared. `stale` — declared entries that are no
 * longer orphans on this route (the class got a rule, or left the markup), which
 * fail rather than rot: the FLOOR_EXCEPTIONS posture from touch-target-floor.test.ts.
 */
export function diffAgainstAllowlist(
  orphans: readonly string[],
  allowlist: Readonly<Record<string, string>>
): { unexpected: string[]; stale: string[] } {
  const found = new Set(orphans);
  return {
    unexpected: orphans.filter((c) => !(c in allowlist)),
    stale: Object.keys(allowlist)
      .filter((c) => !found.has(c))
      .sort(),
  };
}
