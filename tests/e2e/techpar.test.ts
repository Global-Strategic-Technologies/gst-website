import { test, expect, type Page } from '@playwright/test';

const TOOL_URL = '/hub/tools/techpar';

async function gotoTool(page: Page): Promise<void> {
  await page.goto(TOOL_URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-panel="profile"]', { timeout: 10000 });
  // Wait for the profile panel to be fully active (scripts hydrated)
  await page.waitForFunction(
    () => document.querySelector('[data-panel="profile"]')?.classList.contains('tp-panel--active'),
    { timeout: 10000 }
  );
}

async function fillInput(page: Page, attr: string, value: string): Promise<void> {
  const input = page.locator(`[data-input="${attr}"]`);
  await input.fill(value);
  await input.dispatchEvent('input');
}

async function clickTab(page: Page, tab: string): Promise<void> {
  await page.click(`.tool-tab[data-tab="${tab}"]`);
  // Wait for the target panel to become active before proceeding
  await page.waitForFunction(
    (t) => document.querySelector(`[data-panel="${t}"]`)?.classList.contains('tp-panel--active'),
    tab,
    { timeout: 10000 }
  );
}

async function selectStage(page: Page, stage: string = 'series_bc'): Promise<void> {
  await page.click(`[data-stage="${stage}"]`);
}

/** Common setup: navigate to analysis tab with required inputs filled */
async function setupToAnalysis(page: Page): Promise<void> {
  await gotoTool(page);
  await selectStage(page);
  await fillInput(page, 'arr', '10000000');
  await clickTab(page, 'costs');
  await fillInput(page, 'infra', '50000');
  await clickTab(page, 'analysis');
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

test.describe('TechPar - Profile tab', () => {
  test('page loads on Profile tab and stage selection updates visual state', async ({ page }) => {
    await gotoTool(page);
    await expect(page.locator('[data-panel="profile"]')).toHaveClass(/tp-panel--active/);
    await expect(page.locator('[data-stage-grid]')).toBeVisible();

    // Selecting a stage updates its visual state
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

  test('exit multiple field visibility depends on stage type', async ({ page }) => {
    await gotoTool(page);
    // Hidden on Seed, Series A, Series B-C stages
    await expect(page.locator('[data-exit-field]')).not.toHaveClass(/tp-exit-field--vis/);
    await selectStage(page, 'series_bc');
    await expect(page.locator('[data-exit-field]')).not.toHaveClass(/tp-exit-field--vis/);
    await selectStage(page, 'seed');
    await expect(page.locator('[data-exit-field]')).not.toHaveClass(/tp-exit-field--vis/);
    await selectStage(page, 'series_a');
    await expect(page.locator('[data-exit-field]')).not.toHaveClass(/tp-exit-field--vis/);

    // Visible on PE-backed and Enterprise stages
    await page.click('[data-stage="pe"]');
    await expect(page.locator('[data-exit-field]')).toHaveClass(/tp-exit-field--vis/);
    await page.click('[data-stage="enterprise"]');
    await expect(page.locator('[data-exit-field]')).toHaveClass(/tp-exit-field--vis/);
  });
});

// ─── Costs tab ───────────────────────────────────────────────────────────────

test.describe('TechPar - Costs tab', () => {
  test('"View analysis" button is disabled when infra is 0 and enabled when filled', async ({
    page,
  }) => {
    await gotoTool(page);
    await selectStage(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');

    // Disabled when infra is 0
    const btn = page.locator('[data-btn-analysis]');
    await expect(btn).toBeDisabled();

    // Enabled after filling infra
    await fillInput(page, 'infra', '50000');
    await expect(btn).toBeEnabled();
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

  test('CapEx toggle visibility depends on rdCapEx value and changes KPI basis', async ({
    page,
  }) => {
    await gotoTool(page);
    await selectStage(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');

    // Hidden when rdCapEx is 0
    await expect(page.locator('[data-capex-row]')).not.toHaveClass(/tp-capex-row--vis/);

    // Visible when rdCapEx > 0
    await fillInput(page, 'rdCapEx', '500000');
    await expect(page.locator('[data-capex-row]')).toHaveClass(/tp-capex-row--vis/);

    // Fill other required inputs and check KPI basis
    await fillInput(page, 'infra', '50000');
    await fillInput(page, 'rdOpEx', '3000000');
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
  test('Analysis tab empty state shows when navigating before costs are entered', async ({
    page,
  }) => {
    await gotoTool(page);
    await clickTab(page, 'analysis');
    await expect(page.locator('[data-analysis-empty]')).toBeVisible();
    await expect(page.locator('[data-analysis-content]')).not.toHaveClass(
      /tp-analysis-content--on/
    );
  });

  test('Analysis tab renders primary KPI and zone pill when inputs are present', async ({
    page,
  }) => {
    await gotoTool(page);
    await selectStage(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    await fillInput(page, 'rdOpEx', '3000000');
    await clickTab(page, 'analysis');

    await expect(page.locator('[data-analysis-content]')).toHaveClass(/tp-analysis-content--on/);
    const heroNum = page.locator('[data-hero-num]');
    await expect(heroNum).not.toHaveText('\u2014');

    // 36% for series_bc (healthy range 35-55%) should be "At par"
    const pill = page.locator('[data-hero-zone-pill]');
    await expect(pill).toContainText('At par');
  });

  test('benchmark table highlights the active stage row', async ({ page }) => {
    await setupToAnalysis(page);
    const activeRow = page.locator('[data-bench-row="series_bc"]');
    await expect(activeRow).toHaveClass(/bench-row--active/);
  });
});

// ─── Trajectory tab ──────────────────────────────────────────────────────────

test.describe('TechPar - Trajectory tab', () => {
  test('Trajectory tab empty state shows when costs are not entered', async ({ page }) => {
    await gotoTool(page);
    await clickTab(page, 'trajectory');
    await expect(page.locator('[data-traj-empty]')).toBeVisible();
  });

  test('Trajectory tab renders chart with convergence line for growth stages', async ({ page }) => {
    await setupToAnalysis(page);
    await clickTab(page, 'trajectory');
    await expect(page.locator('[data-traj-content]')).toHaveClass(/tp-traj-content--on/);
    await expect(page.locator('[data-traj-canvas]')).toBeVisible();
    // Series B-C legend should mention "Monthly revenue"
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
    await selectStage(page);
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
    await selectStage(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    await fillInput(page, 'rdOpEx', '3000000');

    await clickTab(page, 'analysis');
    const sigBody = await page.locator('[data-sig-body]').textContent();
    expect(sigBody).not.toContain('\u2014');
    const sigHead = await page.locator('[data-sig-head]').textContent();
    expect(sigHead).not.toContain('\u2014');
  });
});

// ─── Audit fixes ────────────────────────────────────────────────────────────

test.describe('TechPar - Audit fixes', () => {
  test('infra hosting shows annual equivalent annotation', async ({ page }) => {
    await gotoTool(page);
    await selectStage(page);
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');
    const anno = page.locator('[data-infra-annual]');
    await expect(anno).toBeVisible();
    await expect(anno).toContainText('/yr');
  });

  test('switching from Deep Dive to Quick populates rdOpEx with sum', async ({ page }) => {
    await gotoTool(page);
    await selectStage(page);
    await clickTab(page, 'costs');
    await page.click('[data-mode="deepdive"]');
    await fillInput(page, 'rdEng', '1000000');
    await fillInput(page, 'rdProd', '500000');
    await fillInput(page, 'rdTool', '100000');
    await page.click('[data-mode="quick"]');
    const rdInput = page.locator('[data-input="rdOpEx"]');
    await expect(rdInput).toHaveValue('1600000');
  });

  test('ARR chips update currency symbol when currency changes', async ({ page }) => {
    await gotoTool(page);
    await page.click('[data-currency="€"]');
    const chip = page.locator('[data-arr-val="10000000"]');
    await expect(chip).toContainText('€');
  });

  test('baseline bar shows the percentage value', async ({ page }) => {
    await setupToAnalysis(page);
    await page.click('[data-action="set-baseline"]');
    const barLabel = page.locator('.tp-baseline-bar__label');
    await expect(barLabel).toContainText('Baseline:');
    await expect(barLabel).toContainText('%');
  });
});

// ─── EEAT enhancements ─────────────────────────────────────────────────────

test.describe('TechPar - EEAT enhancements', () => {
  test('industry disclaimer and methodology section on analysis tab', async ({ page }) => {
    await setupToAnalysis(page);

    // Industry context disclaimer visible
    const disc = page.locator('[data-industry-disc]');
    await expect(disc).toBeVisible();
    await expect(disc).toContainText('SaaS');

    // Methodology section collapsed by default
    const details = page.locator('[data-methodology]');
    await expect(details).toBeVisible();
    await expect(details).not.toHaveAttribute('open', '');

    // Opens on click with correct content
    await page.click('.tool-methodology__trigger');
    const body = page.locator('.tool-methodology__body');
    await expect(body).toBeVisible();
    await expect(body).toContainText('KeyBanc');
    await expect(body).toContainText('36-month');
  });

  test('Engineering FTE field is visible in Quick mode on Costs tab', async ({ page }) => {
    await gotoTool(page);
    await clickTab(page, 'costs');
    await expect(page.locator('[data-fte-field]')).toBeVisible();
    await expect(page.locator('[data-mode="quick"]')).toHaveClass(/tp-seg__btn--active/);
  });

  test('Export PDF and save scenario buttons exist on analysis tab', async ({ page }) => {
    await setupToAnalysis(page);
    const pdfBtn = page.locator('[data-action="export-pdf"]').first();
    await expect(pdfBtn).toBeVisible();
    await expect(pdfBtn).toContainText('Export PDF');
    const saveBtn = page.locator('[data-action="save-scenario"]');
    await expect(saveBtn).toBeVisible();
  });

  test('saving, removing, and max 3 scenario enforcement', async ({ page }) => {
    await setupToAnalysis(page);

    // Save first scenario
    await page.click('[data-action="save-scenario"]');
    const list = page.locator('[data-scenario-list]');
    await expect(list).toBeVisible();
    await expect(list).toContainText('Scenario 1');
    const table = page.locator('[data-scenario-compare]');
    await expect(table).toBeVisible();
    await expect(table).toContainText('Current');
    await expect(table).toContainText('Scenario 1');

    // Save two more
    await page.click('[data-action="save-scenario"]');
    await expect(list).toContainText('Scenario 2');
    await page.click('[data-action="save-scenario"]');
    await expect(list).toContainText('Scenario 3');

    // Max 3 enforced
    const saveBtn = page.locator('[data-action="save-scenario"]');
    await expect(saveBtn).toBeDisabled();

    // Remove a scenario — after removing one, save button should re-enable
    await page.click('[data-remove-scenario="0"]');
    await expect(saveBtn).toBeEnabled();
  });
});

// ─── Regression tests ───────────────────────────────────────────────────────

test.describe('TechPar - Regression', () => {
  test('infrastructure value is stable across annual-mode page reload', async ({ page }) => {
    await gotoTool(page);
    await selectStage(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await page.click('[data-infra-period="annual"]');
    await fillInput(page, 'infra', '1200000');

    await page.waitForFunction(() => new URL(window.location.href).searchParams.has('h'), {
      timeout: 10000,
    });
    const hBefore = new URL(page.url()).searchParams.get('h');
    expect(hBefore).toBeTruthy();

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-panel="profile"]')?.classList.contains('tp-panel--active'),
      { timeout: 15000 }
    );

    const hAfter = new URL(page.url()).searchParams.get('h');
    expect(hAfter).toBe(hBefore);

    await clickTab(page, 'costs');
    await expect(page.locator('[data-input="infra"]')).toHaveValue('1200000');
  });

  test('reset button clears all inputs after two-click confirmation', async ({ page }) => {
    await gotoTool(page);
    await selectStage(page);
    await fillInput(page, 'arr', '10000000');
    await clickTab(page, 'costs');
    await fillInput(page, 'infra', '50000');

    await page.waitForFunction(() => new URL(window.location.href).searchParams.has('a'), {
      timeout: 10000,
    });

    // First click — confirmation prompt (no state change)
    const resetBtn = page.locator('[data-action="reset"]');
    await resetBtn.click();
    await expect(resetBtn).toContainText('Click again to reset');
    expect(new URL(page.url()).searchParams.has('a')).toBe(true);

    // Second click — actual reset
    await resetBtn.click();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('a'), {
      timeout: 15000,
    });

    await expect(page.locator('[data-panel="profile"]')).toHaveClass(/tp-panel--active/);
    expect(new URL(page.url()).searchParams.has('h')).toBe(false);
    await expect(page.locator('.tp-stage-card--active')).toHaveCount(0);
    await expect(page.locator('#tp-arr')).toHaveValue('');
  });
});
