/**
 * Shared accessibility testing helper using axe-core.
 *
 * Usage in E2E tests:
 *   import { checkA11y } from './helpers/a11y';
 *   const violations = await checkA11y(page);
 *   expect(violations.critical).toHaveLength(0);
 *   expect(violations.serious).toHaveLength(0);
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export interface A11yResult {
  /** Critical violations — must be zero */
  critical: AxeViolation[];
  /** Serious violations — must be zero */
  serious: AxeViolation[];
  /** Moderate violations — tracked, ratchet down over time */
  moderate: AxeViolation[];
  /** Minor violations — informational */
  minor: AxeViolation[];
  /** Total violation count across all severities */
  totalCount: number;
}

export interface AxeViolation {
  id: string;
  impact: string;
  description: string;
  helpUrl: string;
  nodes: number;
}

/**
 * Run an axe-core accessibility scan on the current page.
 *
 * @param page - Playwright page object (must already be navigated)
 * @param options.tags - WCAG tags to check (default: WCAG 2.1 AA + 2.2 AA)
 * @param options.exclude - CSS selectors to exclude from scanning
 */
export async function checkA11y(
  page: Page,
  options?: {
    tags?: string[];
    exclude?: string[];
  }
): Promise<A11yResult> {
  // `wcag22aa` added 2026-08-03 (BL-096 § Still owed). In axe-core **4.12.1** it
  // selects exactly ONE rule, `target-size` — verified, not assumed, because the
  // tag is the only thing standing between this suite and the AA half of the
  // touch-target ruling: `touch-target-floor.test.ts` enforces 44px on the guarded
  // families from source, and this enforces 24x24 on everything else, rendered.
  //
  // Pin that version claim deliberately. A future axe bump can add rules to the
  // tag, and a silently widened guard is how a "free" check turns into a surprise
  // failure nobody budgeted for. If an unfamiliar rule appears here after an
  // upgrade, that is why — triage it, do not reflexively baseline it.
  let builder = new AxeBuilder({ page }).withTags(
    options?.tags ?? ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
  );

  if (options?.exclude) {
    for (const selector of options.exclude) {
      builder = builder.exclude(selector);
    }
  }

  const results = await builder.analyze();

  const mapViolations = (v: (typeof results.violations)[0]): AxeViolation => ({
    id: v.id,
    impact: v.impact ?? 'unknown',
    description: v.description,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
  });

  const critical = results.violations.filter((v) => v.impact === 'critical').map(mapViolations);
  const serious = results.violations.filter((v) => v.impact === 'serious').map(mapViolations);
  const moderate = results.violations.filter((v) => v.impact === 'moderate').map(mapViolations);
  const minor = results.violations.filter((v) => v.impact === 'minor').map(mapViolations);

  return {
    critical,
    serious,
    moderate,
    minor,
    totalCount: critical.length + serious.length + moderate.length + minor.length,
  };
}

/**
 * Format violations for readable test output.
 */
export function formatViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) return '(none)';
  return violations
    .map((v) => `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes} nodes)\n    ${v.helpUrl}`)
    .join('\n');
}
