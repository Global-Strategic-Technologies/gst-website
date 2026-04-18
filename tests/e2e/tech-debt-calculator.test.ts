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

    // Known-valid encoded state: {a:0,ts:80,sp:70,mp:60,di:2,in:3,mttr:4,bp:50,ap:50}
    const ENCODED_STATE = btoa(
      JSON.stringify({ a: 0, ts: 80, sp: 70, mp: 60, di: 2, in: 3, mttr: 4, bp: 50, ap: 50 })
    );

    test('URL ?s= param restores slider positions and produces different results', async ({
      page,
    }) => {
      // Get default result first
      await gotoCalc(page);
      const defaultCost = await getMetric(page, 'annual-cost');

      // Load with custom state
      await gotoCalcWithParams(page, ENCODED_STATE);

      // Team size slider at position 80
      const sliderVal = await page.locator('#input-team-size').inputValue();
      expect(Number(sliderVal)).toBe(80);

      // maintPct=60 → display shows "60%"
      const display = await page.locator('[data-display="maint-pct"]').textContent();
      expect(display).toContain('60');

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
});
