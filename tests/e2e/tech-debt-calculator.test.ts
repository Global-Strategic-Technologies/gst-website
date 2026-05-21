import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Navigate to the TDC and wait for JS initialisation */
async function gotoCalc(page: Page): Promise<void> {
  await page.goto('/hub/tools/tech-debt-calculator');
  await page.waitForLoadState('domcontentloaded');
  // Wait until the first metric is populated (—→ real value) by the render() call
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-metric="annual-cost"]');
      return el && el.textContent !== '—';
    },
    { timeout: 5000 }
  );
}

/** Read the text content of a data-metric element */
async function getMetric(page: Page, key: string): Promise<string> {
  return (await page.locator(`[data-metric="${key}"]`).textContent()) ?? '';
}

/** Read the text content of an element by id */
async function getById(page: Page, id: string): Promise<string> {
  return (await page.locator(`#${id}`).textContent()) ?? '';
}

/**
 * Set a range slider to a specific raw value via JS.
 * Dispatches an 'input' event so the page script picks up the change.
 */
async function setSlider(page: Page, inputId: string, value: number): Promise<void> {
  await page.evaluate(
    ({ id, val }) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) throw new Error(`Slider not found: #${id}`);
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { id: inputId, val: value }
  );
}

/**
 * WebKit-safe click via JS evaluate.
 * Avoids "element not stable" failures on WebKit.
 */
async function jsClick(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`Element not found: ${sel}`);
    el.click();
  }, selector);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Tech Debt Calculator', () => {
  // ── Page load ──────────────────────────────────────────────────────────────

  test.describe('page load', () => {
    test('renders calculator with default values and correct layout', async ({ page }) => {
      await gotoCalc(page);

      // Primary result is populated (not em-dash placeholder)
      const annualCost = await getMetric(page, 'annual-cost');
      expect(annualCost).not.toBe('—');
      expect(annualCost.length).toBeGreaterThan(0);

      // Supporting metrics are populated
      expect(await getMetric(page, 'hrs-lost')).not.toBe('—');
      expect(await getMetric(page, 'cost-per-eng')).not.toBe('—');
      expect(await getById(page, 'ctx-engs-lost')).not.toBe('—');
      expect(await getById(page, 'ctx-burden-label')).not.toBe('—');

      // Contextual note is populated
      const note = await getById(page, 'ctx-note');
      expect(note.trim().length).toBeGreaterThan(20);

      // Advanced panel starts collapsed
      const panel = page.locator('[data-advanced-panel]');
      await expect(panel).toHaveClass(/is-hidden/);
      await expect(page.locator('[data-advanced-toggle]')).toHaveAttribute(
        'aria-expanded',
        'false'
      );
      await expect(page.locator('[data-adv-results]')).toHaveClass(/is-hidden/);

      // Results section appears below inputs
      const inputsBox = await page.locator('.inputs-section').boundingBox();
      const resultsBox = await page.locator('.results-section').boundingBox();
      expect(inputsBox).not.toBeNull();
      expect(resultsBox).not.toBeNull();
      expect(resultsBox!.y).toBeGreaterThan(inputsBox!.y + inputsBox!.height - 1);
    });
  });

  // ── Slider interactions ────────────────────────────────────────────────────

  test.describe('slider interactions', () => {
    test('changing team size updates annual cost and display value', async ({ page }) => {
      await gotoCalc(page);

      const costBefore = await getMetric(page, 'annual-cost');
      const displayBefore = await page.locator('[data-display="team-size"]').textContent();

      await setSlider(page, 'input-team-size', 90);
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-metric="annual-cost"]');
        return el && el.textContent !== '—';
      });

      const costAfter = await getMetric(page, 'annual-cost');
      expect(costAfter).not.toBe(costBefore);

      const displayAfter = await page.locator('[data-display="team-size"]').textContent();
      expect(displayAfter).not.toBe(displayBefore);
      expect(Number(displayAfter)).toBeGreaterThan(8);
    });

    test('changing salary updates annual cost', async ({ page }) => {
      await gotoCalc(page);

      const before = await getMetric(page, 'annual-cost');
      await setSlider(page, 'input-salary', 80);

      const after = await getMetric(page, 'annual-cost');
      expect(after).not.toBe(before);
    });

    test('higher maintenance burden increases FTEs lost and updates display', async ({ page }) => {
      await gotoCalc(page);

      // Low burden
      await setSlider(page, 'input-maint-pct', 20);
      await page.waitForFunction(() => {
        const el = document.getElementById('ctx-engs-lost');
        return el && !el.textContent?.includes('—');
      });
      const ftesLow =
        parseFloat((await getById(page, 'ctx-engs-lost')).replace(/[^0-9.]/g, '')) || 0;

      // High burden
      await setSlider(page, 'input-maint-pct', 80);
      await page.waitForFunction(() => {
        const el = document.getElementById('ctx-engs-lost');
        return el && !el.textContent?.includes('—');
      });
      const ftesHigh =
        parseFloat((await getById(page, 'ctx-engs-lost')).replace(/[^0-9.]/g, '')) || 0;

      expect(ftesHigh).toBeGreaterThan(ftesLow);

      // Display shows percentage
      const display = await page.locator('[data-display="maint-pct"]').textContent();
      expect(display).toContain('%');
    });
  });

  // ── Severity colour-coding ─────────────────────────────────────────────────

  test.describe('severity colour-coding', () => {
    test('colour-codes annual cost and burden label by maintenance level', async ({ page }) => {
      await gotoCalc(page);

      // Well-managed (< 10%)
      await setSlider(page, 'input-maint-pct', 5);
      expect(await getById(page, 'ctx-burden-label')).toContain('Well-managed');
      const lowStyle = await page.locator('[data-metric="annual-cost"]').getAttribute('style');
      expect(lowStyle).toContain('--color-primary');

      // High burden (≥ 35%) — amber
      await setSlider(page, 'input-maint-pct', 50);
      const highStyle = await page.locator('[data-metric="annual-cost"]').getAttribute('style');
      expect(highStyle).toContain('--color-secondary');

      // Deal risk (40%+)
      await setSlider(page, 'input-maint-pct', 80);
      expect(await getById(page, 'ctx-burden-label')).toContain('Deal risk');
    });
  });

  // ── Advanced toggle ────────────────────────────────────────────────────────

  test.describe('advanced toggle', () => {
    test('opens panel, updates aria/label, and populates advanced metrics', async ({ page }) => {
      await gotoCalc(page);

      const toggle = page.locator('[data-advanced-toggle]');
      const label = page.locator('[data-toggle-label]');
      await expect(label).toHaveText('Show Advanced Inputs');

      // Open
      await jsClick(page, '[data-advanced-toggle]');
      await expect(page.locator('[data-advanced-panel]')).not.toHaveClass(/is-hidden/);
      await expect(page.locator('[data-adv-results]')).not.toHaveClass(/is-hidden/);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(label).toHaveText('Hide Advanced Inputs');

      // Advanced metrics populated
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-metric="direct-labor"]');
          return el && el.textContent !== '—';
        },
        { timeout: 3000 }
      );
      expect(await getMetric(page, 'direct-labor')).not.toBe('—');
      expect(await getMetric(page, 'incident-labor')).not.toBe('—');
      expect(await getMetric(page, 'velocity')).not.toBe('—');
      expect(await getMetric(page, 'debt-pct-arr')).not.toBe('—');
      expect(await getById(page, 'payback-breakeven')).not.toBe('—');
      expect(await getById(page, 'payback-savings')).not.toBe('—');

      // Close and verify reset
      await jsClick(page, '[data-advanced-toggle]');
      await page.waitForFunction(
        () =>
          document.querySelector('[data-advanced-toggle]')?.getAttribute('aria-expanded') ===
          'false'
      );
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(label).toHaveText('Show Advanced Inputs');
    });
  });

  // ── Deployment frequency ───────────────────────────────────────────────────

  test.describe('deployment frequency', () => {
    test('clicking deploy buttons toggles active state and shows DORA warnings', async ({
      page,
    }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      // Click low-frequency deploy — shows DORA warning
      await jsClick(page, '[data-deploy-btn="6"]');
      await expect(page.locator('[data-deploy-btn="6"]')).toHaveClass(/active/);
      await expect(page.locator('[data-dora-message]')).toContainText('DORA Low');

      // Switch to high-frequency — clears warning, only new button active
      await jsClick(page, '[data-deploy-btn="0"]');
      await expect(page.locator('[data-deploy-btn="0"]')).toHaveClass(/active/);
      await expect(page.locator('[data-deploy-btn="6"]')).not.toHaveClass(/active/);
      const msg = await page.locator('[data-dora-message]').textContent();
      expect(msg?.trim()).toBe('');
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  test.describe('navigation', () => {
    test('back link returns to hub tools page', async ({ page }) => {
      await gotoCalc(page);

      await page.evaluate(() => {
        const link = document.querySelector('.back-link') as HTMLAnchorElement;
        if (link) window.location.href = link.href;
      });
      await page.waitForURL('**/hub/tools', { timeout: 10000 });

      expect(page.url()).toContain('/hub/tools');
    });
  });

  // ── URL state persistence ──────────────────────────────────────────────────

  test.describe('URL state persistence', () => {
    async function gotoCalcWithParams(page: Page, params: string): Promise<void> {
      await page.goto(`/hub/tools/tech-debt-calculator?s=${params}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-metric="annual-cost"]');
          return el && el.textContent !== '—';
        },
        { timeout: 5000 }
      );
    }

    // Post-2026-05-21 URL format encodes raw business values (not slider positions).
    // Pre-refactor format used keys {ts:teamSizePos, sp:salaryPos, bp:budgetPos, ap:arrPos}
    // bounded to 0-100. New keys: {ts:teamSize, sa:salary, bg:remediationBudget, ar:arr}.
    const ENCODED_STATE = btoa(
      JSON.stringify({
        a: 0,
        ts: 80, // teamSize: 80 engineers
        sa: 200_000, // salary: $200K
        mp: 60,
        di: 2,
        in: 3,
        mttr: 4,
        bg: 1_000_000, // remediationBudget: $1M
        ar: 50_000_000, // arr: $50M
      })
    );

    test('URL ?s= param restores raw values and produces different results', async ({ page }) => {
      // Get default result first
      await gotoCalc(page);
      const defaultCost = await getMetric(page, 'annual-cost');

      // Load with custom state
      await gotoCalcWithParams(page, ENCODED_STATE);

      // teamSize=80 → display label shows "80"
      const teamDisplay = await page.locator('[data-display="team-size"]').textContent();
      expect(teamDisplay).toBe('80');

      // maintPct=60 → display shows "60%"
      const maintDisplay = await page.locator('[data-display="maint-pct"]').textContent();
      expect(maintDisplay).toContain('60');

      // Results differ from defaults
      const paramCost = await getMetric(page, 'annual-cost');
      expect(paramCost).not.toBe(defaultCost);
    });

    test('slider changes update the URL ?s= param', async ({ page }) => {
      await gotoCalc(page);

      await setSlider(page, 'input-team-size', 30);
      const url30 = page.url();
      expect(url30).toContain('?s=');

      await setSlider(page, 'input-team-size', 70);
      const url70 = page.url();
      expect(url70).not.toBe(url30);
    });

    test('invalid ?s= param falls back to defaults gracefully', async ({ page }) => {
      await page.goto('/hub/tools/tech-debt-calculator?s=not-valid-base64!!!');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-metric="annual-cost"]');
          return el && el.textContent !== '—';
        },
        { timeout: 5000 }
      );

      const annualCost = await getMetric(page, 'annual-cost');
      expect(annualCost).not.toBe('—');
      expect(annualCost.length).toBeGreaterThan(0);
    });

    test('Copy Link button is visible and works', async ({ page }) => {
      await gotoCalc(page);

      const btn = page.locator('#copy-link-btn');
      await expect(btn).toBeVisible();
      await expect(btn).toContainText('Copy Link');
    });

    test.describe('clipboard', () => {
      test('Copy Link button changes text to Copied! on click', async ({
        page,
        context,
        browserName,
      }) => {
        await gotoCalc(page);

        if (browserName === 'chromium') {
          await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        }

        await jsClick(page, '#copy-link-btn');

        const btn = page.locator('#copy-link-btn');
        await expect(btn).toContainText('Copied!');
        await expect(btn).toContainText('Copy Link', { timeout: 5000 });
      });

      test('Copy Link URL contains the ?s= state param', async ({ page }) => {
        await gotoCalc(page);

        await setSlider(page, 'input-team-size', 60);
        await page.waitForFunction(() => window.location.search.includes('?s='));
        const url = page.url();
        expect(url).toContain('?s=');
        expect(url).toContain('tech-debt-calculator');
      });
    });
  });

  // ── Currency selector ──────────────────────────────────────────────────────

  test.describe('currency selector', () => {
    test('switching currencies updates symbols across all displays', async ({ page }) => {
      await gotoCalc(page);

      // Default is USD
      await expect(page.locator('#currency-select')).toHaveValue('USD');

      // EUR — cost and salary show €
      await page.locator('#currency-select').selectOption('EUR');
      let cost = await getMetric(page, 'annual-cost');
      expect(cost).toContain('€');
      expect(cost).not.toContain('$');
      let salary = await page.locator('[data-display="salary"]').textContent();
      expect(salary).toContain('€');
      const arr = await page.locator('[data-display="arr"]').textContent();
      expect(arr).toContain('€');

      // GBP — cost and salary show £
      await page.locator('#currency-select').selectOption('GBP');
      cost = await getMetric(page, 'annual-cost');
      expect(cost).toContain('£');
      salary = await page.locator('[data-display="salary"]').textContent();
      expect(salary).toContain('£');

      // Back to USD — $ restored
      await page.locator('#currency-select').selectOption('USD');
      cost = await getMetric(page, 'annual-cost');
      expect(cost).toContain('$');
      expect(cost).not.toContain('€');
    });

    test('EUR annual cost is less than USD annual cost (multiplier < 1)', async ({ page }) => {
      await gotoCalc(page);

      const usdText = await getMetric(page, 'annual-cost');
      const usdVal = parseFloat(usdText.replace(/[^0-9.]/g, ''));

      await page.locator('#currency-select').selectOption('EUR');

      const eurText = await getMetric(page, 'annual-cost');
      const eurVal = parseFloat(eurText.replace(/[^0-9.]/g, ''));

      expect(eurVal).toBeLessThan(usdVal);
    });

    test('currency does not affect the ?s= URL param', async ({ page }) => {
      await gotoCalc(page);

      await setSlider(page, 'input-team-size', 50);
      const urlBefore = page.url();

      await page.locator('#currency-select').selectOption('GBP');
      const urlAfter = page.url();

      expect(urlAfter).toBe(urlBefore);
    });
  });

  // ── Context-switch overhead toggle ────────────────────────────────────────

  test.describe('context-switch overhead', () => {
    test('enabling toggle shows context-switch cost line item and increases annual cost', async ({
      page,
    }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      // Capture baseline
      const baseAnnual = await getMetric(page, 'annual-cost');
      const baseDirectLabor = await getMetric(page, 'direct-labor');

      // Context-switch stat should be hidden initially
      const ctxStat = page.locator('#ctx-switch-stat');
      await expect(ctxStat).toBeHidden();

      // Enable context-switch
      await page.locator('#input-context-switch').check();

      // Context-switch stat should now be visible with a value
      await expect(ctxStat).toBeVisible();
      const ctxCost = await getMetric(page, 'context-switch');
      expect(ctxCost).not.toBe('—');
      expect(ctxCost).toContain('/mo');

      // Annual cost should have increased
      const newAnnual = await getMetric(page, 'annual-cost');
      const baseVal = parseFloat(baseAnnual.replace(/[^0-9.]/g, ''));
      const newVal = parseFloat(newAnnual.replace(/[^0-9.]/g, ''));
      expect(newVal).toBeGreaterThan(baseVal);

      // Direct labor should be unchanged (context-switch is separate)
      expect(await getMetric(page, 'direct-labor')).toBe(baseDirectLabor);
    });

    test('disabling toggle hides context-switch cost and restores annual cost', async ({
      page,
    }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      const baseAnnual = await getMetric(page, 'annual-cost');

      // Enable then disable
      await page.locator('#input-context-switch').check();
      const elevatedAnnual = await getMetric(page, 'annual-cost');
      expect(elevatedAnnual).not.toBe(baseAnnual);

      await page.locator('#input-context-switch').uncheck();

      // Line item hidden again
      await expect(page.locator('#ctx-switch-stat')).toBeHidden();

      // Annual cost restored
      expect(await getMetric(page, 'annual-cost')).toBe(baseAnnual);
    });
  });

  // ── Remediation efficiency slider ─────────────────────────────────────────

  test.describe('remediation efficiency', () => {
    test('default remediation is 70% and displayed correctly', async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      const display = await page.locator('[data-display="remediation"]').textContent();
      expect(display).toBe('70%');
    });

    test('setting remediation to 0% shows zero savings and > 5 yrs break-even', async ({
      page,
    }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      await setSlider(page, 'input-remediation', 0);

      const savings = await getById(page, 'payback-savings');
      expect(savings).toBe('$0');

      const breakeven = await getById(page, 'payback-breakeven');
      expect(breakeven).toBe('> 5 yrs');
    });

    test('setting remediation to 100% yields higher savings than 70%', async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      // Default 70%
      const savings70 = await getById(page, 'payback-savings');
      const val70 = parseFloat(savings70.replace(/[^0-9.]/g, ''));

      // Set to 100%
      await setSlider(page, 'input-remediation', 100);
      const savings100 = await getById(page, 'payback-savings');
      const val100 = parseFloat(savings100.replace(/[^0-9.]/g, ''));

      expect(val100).toBeGreaterThan(val70);
    });

    test('disclaimer reflects remediation efficiency percentage', async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      const disclaimer = await getById(page, 'payback-disclaimer');
      expect(disclaimer).toContain('Remediation efficiency: 70%');
      expect(disclaimer).not.toContain('Assumes full resolution');
    });
  });

  // ── Combined features ─────────────────────────────────────────────────────

  test.describe('combined model improvements', () => {
    test('both features compose: context-switch raises cost, remediation adjusts savings', async ({
      page,
    }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      // Baseline: 70% remediation, no context-switch
      const baseSavings = await getById(page, 'payback-savings');
      const baseVal = parseFloat(baseSavings.replace(/[^0-9.]/g, ''));

      // Enable context-switch → total cost goes up, so savings go up too (at same %)
      await page.locator('#input-context-switch').check();
      const ctxSavings = await getById(page, 'payback-savings');
      const ctxVal = parseFloat(ctxSavings.replace(/[^0-9.]/g, ''));
      expect(ctxVal).toBeGreaterThan(baseVal);

      // Drop remediation to 50% → savings should decrease from ctxVal
      await setSlider(page, 'input-remediation', 50);
      const reducedSavings = await getById(page, 'payback-savings');
      const reducedVal = parseFloat(reducedSavings.replace(/[^0-9.]/g, ''));
      expect(reducedVal).toBeLessThan(ctxVal);
    });

    test('URL state round-trips both new fields', async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      // Set both features to non-default values
      await page.locator('#input-context-switch').check();
      await setSlider(page, 'input-remediation', 50);

      // Capture current values
      const annualBefore = await getMetric(page, 'annual-cost');
      const savingsBefore = await getById(page, 'payback-savings');

      // Navigate away and back via URL
      const url = page.url();
      await page.goto('about:blank');
      await page.goto(url);
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-metric="annual-cost"]');
          return el && el.textContent !== '—';
        },
        { timeout: 5000 }
      );

      // Open advanced panel to see controls
      await jsClick(page, '[data-advanced-toggle]');

      // Verify state restored
      const checkbox = page.locator('#input-context-switch');
      await expect(checkbox).toBeChecked();

      const remDisplay = await page.locator('[data-display="remediation"]').textContent();
      expect(remDisplay).toBe('50%');

      expect(await getMetric(page, 'annual-cost')).toBe(annualBefore);
      expect(await getById(page, 'payback-savings')).toBe(savingsBefore);
    });

    test('currency applies to context-switch cost', async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');
      await page.locator('#input-context-switch').check();

      // USD symbol
      const usdCost = await getMetric(page, 'context-switch');
      expect(usdCost).toMatch(/^\$/);

      // Switch to EUR
      await page.locator('#currency-select').selectOption('EUR');
      const eurCost = await getMetric(page, 'context-switch');
      expect(eurCost).toMatch(/^€/);
    });
  });

  // ── Direct-input precision (no slider-position thrashing) ──────────────────
  //
  // Per TEST_BEST_PRACTICES.md § 27 (Dual-Control UI Where Only One Direction
  // of Sync Is Tested), every slider+direct-input pair must reconcile in BOTH
  // directions and the typed value must be preserved exactly. Pre-2026-05-21
  // the change-handler routed the typed value through the slider's 0-100
  // position, quantizing $237,500 to "$300K" on blur — a state-lying UX bug.

  test.describe('Direct-input typed-value precision', () => {
    // ARR, budget, incidents, mttr live in the collapsed advanced panel.
    // Open it once before each test in this block so their direct inputs
    // become actionable.
    test.beforeEach(async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');
      await page.waitForFunction(
        () => !document.querySelector('[data-advanced-panel]')?.classList.contains('is-hidden'),
        { timeout: 5000 }
      );
    });

    /** Type a value into a [data-direct] input and fire change. */
    async function typeDirect(page: Page, key: string, value: string): Promise<void> {
      const input = page.locator(`[data-direct="${key}"]`);
      await input.fill(value);
      await input.dispatchEvent('change');
    }

    /** Read the rendered display label for a slider. */
    async function getDisplay(page: Page, key: string): Promise<string> {
      return (await page.locator(`[data-display="${key}"]`).textContent()) ?? '';
    }

    test('ARR: typing $237,500 preserves precision (no quantization to $200K/$300K)', async ({
      page,
    }) => {
      await typeDirect(page, 'arr', '237500');

      // The user's exact value is shown back in the direct input (formatted)
      // and the display label reflects it — no thrashing to a nearby slider bucket.
      const directValue = await page.locator('[data-direct="arr"]').inputValue();
      expect(directValue).toBe('$238K'); // fmtShortC rounds the *display* to 1dp on K
      // The display label uses the same fmtShortC formatter
      const display = await getDisplay(page, 'arr');
      expect(display).toBe('$238K');
    });

    test('ARR: typing "12.5M" honors M suffix → $12,500,000 exact', async ({ page }) => {
      await typeDirect(page, 'arr', '12.5M');

      const directValue = await page.locator('[data-direct="arr"]').inputValue();
      expect(directValue).toBe('$12.5M');
      const display = await getDisplay(page, 'arr');
      expect(display).toBe('$12.5M');
    });

    test('ARR: typing "$1.5M" honors mirrored display format', async ({ page }) => {
      await typeDirect(page, 'arr', '$1.5M');

      const directValue = await page.locator('[data-direct="arr"]').inputValue();
      expect(directValue).toBe('$1.5M');
    });

    test('ARR: clamps to $100K floor on out-of-range input', async ({ page }) => {
      await typeDirect(page, 'arr', '50'); // $50 — below the $100K floor

      const directValue = await page.locator('[data-direct="arr"]').inputValue();
      expect(directValue).toBe('$100K');
    });

    test('ARR: clamps to $1B ceiling on out-of-range input', async ({ page }) => {
      await typeDirect(page, 'arr', '5B'); // B suffix unsupported → NaN → falls back to current value
      // 5B unparseable → state unchanged; verify default remained
      const directAfter = await page.locator('[data-direct="arr"]').inputValue();
      expect(directAfter).toBe('$10.0M'); // DEFAULT_STATE.arr

      // Now try a valid but huge value
      await typeDirect(page, 'arr', '2000000000'); // $2B
      const clamped = await page.locator('[data-direct="arr"]').inputValue();
      expect(clamped).toBe('$1000.0M'); // clamped to ceiling
    });

    test('Salary: typing "$187,500" preserves precision (no $5K snap)', async ({ page }) => {
      await typeDirect(page, 'salary', '187500');

      const display = await getDisplay(page, 'salary');
      expect(display).toBe('$188K'); // fmtShortC display rounding only
    });

    test('Budget: typing "$1.75M" honors M suffix and preserves precision', async ({ page }) => {
      await typeDirect(page, 'budget', '1.75M');

      const directValue = await page.locator('[data-direct="budget"]').inputValue();
      expect(directValue).toBe('$1.8M'); // fmtShortC rounds *display* to 1dp on M
    });

    // Dual-control sync (§ 27): both directions of the contract are tested.

    test('slider drag updates the direct input (slider→input direction)', async ({ page }) => {
      // Drag ARR slider to position 50 (mid-curve)
      await setSlider(page, 'input-arr', 50);
      const directValue = await page.locator('[data-direct="arr"]').inputValue();
      // Display should reflect a value near pos-50 (~$177M) — value depends on
      // the power curve. Assert it CHANGED from default and is non-empty.
      expect(directValue).not.toBe('$10.0M');
      expect(directValue.length).toBeGreaterThan(0);
    });

    test('direct input updates the slider thumb (input→slider direction)', async ({ page }) => {
      await typeDirect(page, 'arr', '500M');

      // Slider thumb position should reflect the new value via arrToPos()
      const sliderValue = await page.locator('#input-arr').inputValue();
      expect(Number(sliderValue)).toBeGreaterThan(0);
      expect(Number(sliderValue)).toBeLessThanOrEqual(100);
    });

    test('garbled input (non-numeric) falls back to current state, no NaN/zero corruption', async ({
      page,
    }) => {
      // Default ARR is $10M
      const beforeAnnual = await getMetric(page, 'annual-cost');
      await typeDirect(page, 'arr', 'lol not a number');

      // State unchanged; the typed garbage is replaced with the current value
      const directAfter = await page.locator('[data-direct="arr"]').inputValue();
      expect(directAfter).toBe('$10.0M');
      const annualAfter = await getMetric(page, 'annual-cost');
      expect(annualAfter).toBe(beforeAnnual);
    });

    // ── Clamp feedback (C3) ──────────────────────────────────────────────────
    //
    // When a typed value is clamped to a range bound or rejected as
    // unparseable, the UI shows a visible message under the input. Without
    // this, the user sees "$100K" appear after typing "$50" with no clue
    // why their value changed — the same state-lying anti-pattern this work
    // set out to fix.

    async function getClampMsg(page: Page, key: string): Promise<string> {
      return (await page.locator(`[data-clamp-msg="${key}"]`).textContent()) ?? '';
    }

    async function isClampMsgVisible(page: Page, key: string): Promise<boolean> {
      return await page.locator(`[data-clamp-msg="${key}"]`).isVisible();
    }

    test('ARR below floor shows "Minimum ARR is $100K" message', async ({ page }) => {
      await typeDirect(page, 'arr', '50');
      expect(await isClampMsgVisible(page, 'arr')).toBe(true);
      const msg = await getClampMsg(page, 'arr');
      expect(msg).toMatch(/Minimum ARR/);
      expect(msg).toMatch(/100K/);
    });

    test('ARR above ceiling shows "Maximum ARR is $1000.0M" message', async ({ page }) => {
      await typeDirect(page, 'arr', '2000000000');
      expect(await isClampMsgVisible(page, 'arr')).toBe(true);
      const msg = await getClampMsg(page, 'arr');
      expect(msg).toMatch(/Maximum ARR/);
    });

    test('ARR garbled input shows "Couldn\'t read" fallback message', async ({ page }) => {
      await typeDirect(page, 'arr', 'lol');
      expect(await isClampMsgVisible(page, 'arr')).toBe(true);
      const msg = await getClampMsg(page, 'arr');
      expect(msg).toMatch(/Couldn't read/);
      expect(msg).toMatch(/lol/);
    });

    test('valid in-range input shows no clamp message', async ({ page }) => {
      await typeDirect(page, 'arr', '50000000');
      expect(await isClampMsgVisible(page, 'arr')).toBe(false);
    });

    test('clamp message clears as soon as the user starts editing again', async ({ page }) => {
      // Trigger a clamp first
      await typeDirect(page, 'arr', '50');
      expect(await isClampMsgVisible(page, 'arr')).toBe(true);

      // Now type one character (input event) — should clear the message
      // before the user even blurs
      const input = page.locator('[data-direct="arr"]');
      await input.click();
      await input.press('End');
      await input.press('0'); // fires input event
      expect(await isClampMsgVisible(page, 'arr')).toBe(false);
    });

    test('Budget below floor surfaces feedback (covers second currency control)', async ({
      page,
    }) => {
      await typeDirect(page, 'budget', '500');
      expect(await isClampMsgVisible(page, 'budget')).toBe(true);
      const msg = await getClampMsg(page, 'budget');
      expect(msg).toMatch(/Minimum remediation budget/);
    });

    test('Maint-pct above 100 surfaces feedback (covers percent control)', async ({ page }) => {
      await typeDirect(page, 'maint-pct', '150');
      expect(await isClampMsgVisible(page, 'maint-pct')).toBe(true);
      const msg = await getClampMsg(page, 'maint-pct');
      expect(msg).toMatch(/Maximum maintenance burden is 100%/);
    });
  });
});
