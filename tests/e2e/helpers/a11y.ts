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
  /**
   * Rules axe could not decide, all severities. Not asserted by callers; read by
   * the instrument proof in accessibility.test.ts and by triage (BL-162).
   */
  incomplete: AxeViolation[];
}

export interface AxeViolation {
  id: string;
  impact: string;
  description: string;
  helpUrl: string;
  nodes: number;
}

/**
 * Purely decorative background images hidden during a scan. Each entry needs a
 * reason: only backgrounds that carry no information and sit under text belong.
 */
export const DECORATIVE_BACKGROUNDS = [
  // Site-wide checkerboard, global.css. 3.2%-alpha lines under every route's text.
  'body',
];

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
    /** Limit the scan to these selectors. Default: the whole page. */
    include?: string[];
    /** Wait for fonts and finite animations before scanning. Default true. */
    settle?: boolean;
    /**
     * Hide decorative background images for the duration of the scan so axe can
     * judge text contrast. Default true. See DECORATIVE_BACKGROUNDS.
     */
    hideDecorativeBackground?: boolean;
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

  if (options?.include) {
    for (const selector of options.include) {
      builder = builder.include(selector);
    }
  }

  if (options?.exclude) {
    for (const selector of options.exclude) {
      builder = builder.exclude(selector);
    }
  }

  // SETTLE BEFORE MEASURING. axe reads computed colour at the instant it runs,
  // so a scan taken mid-transition measures a composite that never persists.
  // Measured: the trial page's `.state-block { animation: gst-fade }`
  // (HubMcpTrialPage.astro) made muted text read 4.17:1 while it faded in and
  // 5.40:1 once settled — a "serious" colour-contrast violation that does not
  // exist. Fonts are awaited for the same class of reason: a swap changes the
  // computed size, which is what picks the 4.5:1 vs 3:1 bar.
  //
  // `iterations` lives on the EFFECT's timing, not on the Animation. Reading
  // `anim.iterations` yields undefined, which compares unequal to Infinity, so
  // the naive filter silently awaits the infinite animations instead of
  // skipping them — every route would then pay the full cap. Seven infinite
  // declarations ship in src/ (skeleton.css ×4, HeaderLogo.astro,
  // MapVisualizer.astro, ThemeToggleButton.astro); they never finish, so they
  // must be filtered out, never awaited. The timeout is a backstop for an
  // animation paused mid-flight — not a substitute for the filter, and not a
  // timeout band-aid on a slow test.
  if (options?.settle !== false) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      const finite = document.getAnimations().filter((a) => {
        const iterations = a.effect?.getTiming().iterations;
        return iterations !== Infinity && a.playState === 'running';
      });
      await Promise.race([
        Promise.allSettled(finite.map((a) => a.finished)),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    });
  }

  // HIDE THE CHECKERBOARD WHILE MEASURING (BL-162, ADR-0035). axe cannot compute
  // contrast over a background IMAGE, so it reports such text INCOMPLETE rather
  // than failing it — and the site-wide body checkerboard is two gradients, which
  // left most text on every route unjudged in both themes. Its lines are 3.2%
  // alpha (--checkerboard-line), too faint to move a contrast ratio materially, so
  // scanning without them measures what a reader actually sees. The tag is
  // removed afterwards: assertions after a scan must see the real page.
  const hideTag =
    options?.hideDecorativeBackground === false
      ? null
      : await page.addStyleTag({
          content: `${DECORATIVE_BACKGROUNDS.join(', ')} { background-image: none !important; }`,
        });

  let results: Awaited<ReturnType<AxeBuilder['analyze']>>;
  try {
    results = await builder.analyze();
  } finally {
    await hideTag?.evaluate((el) => (el as Element).remove());
  }

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
    incomplete: results.incomplete.map(mapViolations),
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
