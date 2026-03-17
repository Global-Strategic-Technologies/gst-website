import { test, expect, Page } from '@playwright/test';

const TOOL_URL = '/hub/tools/techpar';

async function gotoTool(page: Page): Promise<void> {
  await page.goto(TOOL_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-panel="profile"]', { timeout: 5000 });
}

async function fillInput(page: Page, attr: string, value: string): Promise<void> {
  const input = page.locator(`[data-input="${attr}"]`);
  await input.fill(value);
  await input.dispatchEvent('input');
}

async function clickTab(page: Page, tab: string): Promise<void> {
  await page.click(`.tp-tab[data-tab="${tab}"]`);
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

test.describe('TechPar - Profile tab', () => {
  test('page loads on Profile tab with stage selector visible', async ({ page }) => {
    await gotoTool(page);
    await expect(page.locator('[data-panel="profile"]')).toHaveClass(/tp-panel--active/);
    await expect(page.locator('[data-stage-grid]')).toBeVisible();
  });

  test('selecting a stage updates its visual state', async ({ page }) => {
    await gotoTool(page);
    const seedCard = page.locator('[data-stage="seed"]');
    await seedCard.click();
    await expect(seedCard).toHaveClass(/tp-stage-card--active/);
    const bcCard = page.locator('[data-stage="series_bc"]');
    await expect(bcCard).not.toHaveClass(/tp-stage-card--active/);
  });

  test('"Enter technology costs" button navigates to Costs tab', async ({ page }) => {
    await gotoTool(page);
    await page.click('[data-action="go-costs"]');
    await expect(page.locator('[data-panel="costs"]')).toHaveClass(/tp-panel--active/);
  });

  test('Profile tab shows checkmark when ARR > 0', async ({ page }) => {
    await gotoTool(page);
    const tab = page.locator('[data-tab="profile"]');
    await expect(tab).not.toHaveClass(/tp-tab--done/);
    await fillInput(page, 'arr', '10000000');
    await expect(tab).toHaveClass(/tp-tab--done/);
  });

  test('exit multiple field is hidden on Seed, Series A, Series B-C stages', async ({ page }) => {
    await gotoTool(page);
    // Default is series_bc
    await expect(page.locator('[data-exit-field]')).not.toHaveClass(/tp-exit-field--vis/);
    // Switch to seed
    await page.click('[data-stage="seed"]');
    await expect(page.locator('[data-exit-field]')).not.toHaveClass(/tp-exit-field--vis/);
    // Switch to series_a
    await page.click('[data-stage="series_a"]');
    await expect(page.locator('[data-exit-field]')).not.toHaveClass(/tp-exit-field--vis/);
  });

  test('exit multiple field is visible on PE-backed and Enterprise stages', async ({ page }) => {
    await gotoTool(page);
    await page.click('[data-stage="pe"]');
    await expect(page.locator('[data-exit-field]')).toHaveClass(/tp-exit-field--vis/);
    await page.click('[data-stage="enterprise"]');
    await expect(page.locator('[data-exit-field]')).toHaveClass(/tp-exit-field--vis/);
  });
});

// ─── Costs tab ───────────────────────────────────────────────────────────────

test.describe('TechPar - Costs tab', () => {
  test('"View analysis" button is disabled when infraHosting is 0', async ({ page }) => {
    await gotoTool(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    const btn = page.locator('[data-btn-analysis]');
    await expect(btn).toBeDisabled();
  });

  test('"View analysis" button is enabled when ARR > 0 and infraHosting > 0', async ({ page }) => {
    await gotoTool(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    const btn = page.locator('[data-btn-analysis]');
    await expect(btn).toBeEnabled();
  });

  test('Costs tab shows checkmark when both required fields have values', async ({ page }) => {
    await gotoTool(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    const tab = page.locator('[data-tab="costs"]');
    await expect(tab).toHaveClass(/tp-tab--done/);
  });

  test('mode toggle switches between Quick and Deep Dive input sets', async ({ page }) => {
    await gotoTool(page);
    await clickTab(page, 'costs');
    // Quick mode by default, deep dive hidden
    await expect(page.locator('[data-rd-quick]')).toBeVisible();
    await expect(page.locator('[data-rd-deep]')).not.toHaveClass(/tp-deep-wrap--on/);
    // Switch to deep dive
    await page.click('[data-mode="deepdive"]');
    await expect(page.locator('[data-rd-deep]')).toHaveClass(/tp-deep-wrap--on/);
  });

  test('Deep Dive sub-inputs sum correctly in the total display', async ({ page }) => {
    await gotoTool(page);
    await clickTab(page, 'costs');
    await page.click('[data-mode="deepdive"]');
    await fillInput(page, 'rdEng', '1000000');
    await fillInput(page, 'rdProd', '500000');
    await fillInput(page, 'rdTool', '100000');
    const total = page.locator('[data-deep-total]');
    await expect(total).toContainText('$1.6M');
  });

  test('CapEx toggle is hidden when rdCapEx is 0', async ({ page }) => {
    await gotoTool(page);
    await clickTab(page, 'costs');
    await expect(page.locator('[data-capex-row]')).not.toHaveClass(/tp-capex-row--vis/);
  });

  test('CapEx toggle is visible when rdCapEx > 0', async ({ page }) => {
    await gotoTool(page);
    await clickTab(page, 'costs');
    await fillInput(page, 'rdCapEx', '500000');
    await expect(page.locator('[data-capex-row]')).toHaveClass(/tp-capex-row--vis/);
  });

  test('CapEx toggle changes the primary KPI value and basis label', async ({ page }) => {
    await gotoTool(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    await fillInput(page, 'rdOpEx', '3000000');
    await fillInput(page, 'rdCapEx', '500000');

    // Navigate to analysis to see KPI
    await clickTab(page, 'analysis');
    const heroNum = page.locator('[data-hero-num]');
    const heroBasis = page.locator('[data-hero-basis]');
    const cashValue = await heroNum.textContent();
    await expect(heroBasis).toContainText('Cash basis');

    // Toggle GAAP
    await clickTab(page, 'costs');
    await page.locator('[data-input="gaapChk"]').check();
    await clickTab(page, 'analysis');
    const gaapValue = await heroNum.textContent();
    await expect(heroBasis).toContainText('GAAP basis');
    expect(gaapValue).not.toBe(cashValue);
  });
});

// ─── Analysis tab ────────────────────────────────────────────────────────────

test.describe('TechPar - Analysis tab', () => {
  test('Analysis tab empty state shows when navigating before costs are entered', async ({ page }) => {
    await gotoTool(page);
    await clickTab(page, 'analysis');
    await expect(page.locator('[data-analysis-empty]')).toBeVisible();
    await expect(page.locator('[data-analysis-content]')).not.toHaveClass(/tp-analysis-content--on/);
  });

  test('Analysis tab renders primary KPI when required inputs are present', async ({ page }) => {
    await gotoTool(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    await clickTab(page, 'analysis');
    await expect(page.locator('[data-analysis-content]')).toHaveClass(/tp-analysis-content--on/);
    const heroNum = page.locator('[data-hero-num]');
    await expect(heroNum).not.toHaveText('\u2014');
  });

  test('zone pill label matches the computed zone', async ({ page }) => {
    await gotoTool(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    await fillInput(page, 'rdOpEx', '3000000');
    await clickTab(page, 'analysis');
    // 36% for series_bc (healthy range 35-55%) should be "At par"
    const pill = page.locator('[data-hero-zone-pill]');
    await expect(pill).toContainText('At par');
  });

  test('benchmark table highlights the active stage row', async ({ page }) => {
    await gotoTool(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    await clickTab(page, 'analysis');
    const activeRow = page.locator('[data-bench-row="series_bc"]');
    await expect(activeRow).toHaveClass(/tp-btbl--active/);
  });
});

// ─── Trajectory tab ──────────────────────────────────────────────────────────

test.describe('TechPar - Trajectory tab', () => {
  test('Trajectory tab empty state shows when costs are not entered', async ({ page }) => {
    await gotoTool(page);
    await clickTab(page, 'trajectory');
    await expect(page.locator('[data-traj-empty]')).toBeVisible();
  });

  test('Trajectory tab renders chart when costs are entered', async ({ page }) => {
    await gotoTool(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    await clickTab(page, 'trajectory');
    await expect(page.locator('[data-traj-content]')).toHaveClass(/tp-traj-content--on/);
    await expect(page.locator('[data-traj-canvas]')).toBeVisible();
  });

  test('Trajectory chart has convergence revenue line on Series B-C stage', async ({ page }) => {
    await gotoTool(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    await clickTab(page, 'trajectory');
    // Legend should mention "Monthly revenue"
    const legend = page.locator('[data-traj-legend]');
    await expect(legend).toContainText('Monthly revenue');
  });

  test('Trajectory chart does not have revenue line on PE-backed stage', async ({ page }) => {
    await gotoTool(page);
    await page.click('[data-stage="pe"]');
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    await clickTab(page, 'trajectory');
    const legend = page.locator('[data-traj-legend]');
    await expect(legend).not.toContainText('Monthly revenue');
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────

test.describe('TechPar - Navigation', () => {
  test('back navigation works on all tabs', async ({ page }) => {
    await gotoTool(page);
    // Go to costs, then back to profile
    await clickTab(page, 'costs');
    await page.click('[data-action="go-profile"]');
    await expect(page.locator('[data-panel="profile"]')).toHaveClass(/tp-panel--active/);

    // Fill required fields so analysis content (with go-costs back button) is shown
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');

    // Go to analysis, then back to costs via the back button in analysis content
    await clickTab(page, 'analysis');
    await page.locator('[data-analysis-content] [data-action="go-costs"]').click();
    await expect(page.locator('[data-panel="costs"]')).toHaveClass(/tp-panel--active/);
  });
});

// ─── Integrity checks ───────────────────────────────────────────────────────

test.describe('TechPar - Integrity', () => {
  test('no generate button or external API call present anywhere on the page', async ({ page }) => {
    await gotoTool(page);
    // No button with "generate" text should exist
    await expect(page.locator('button', { hasText: /generate/i })).toHaveCount(0);
    // No fetch() calls in inline scripts (would indicate an external API call)
    const scripts = await page.locator('script:not([src])').allTextContents();
    const inlineScript = scripts.join('');
    expect(inlineScript).not.toMatch(/fetch\s*\(/);
  });

  test('no em dashes present in any rendered signal copy', async ({ page }) => {
    await gotoTool(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    await fillInput(page, 'rdOpEx', '3000000');

    // Check signal card and panel header copy for em dashes
    await clickTab(page, 'analysis');
    const sigBody = await page.locator('[data-sig-body]').textContent();
    expect(sigBody).not.toContain('\u2014');
    const sigHead = await page.locator('[data-sig-head]').textContent();
    expect(sigHead).not.toContain('\u2014');

    // Trajectory tab has no signal cards — em dash check is scoped to analysis tab only
  });
});
