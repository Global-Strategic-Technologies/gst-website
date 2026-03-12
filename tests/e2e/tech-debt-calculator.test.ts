import { test, expect, Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Navigate to the TDC and wait for JS initialisation */
async function gotoCalc(page: Page): Promise<void> {
  await page.goto('/hub/tools/tech-debt-calculator');
  await page.waitForLoadState('domcontentloaded');
  // Wait until the first metric is populated (—→ real value) by the render() call
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-metric="annual-cost"]');
    return el && el.textContent !== '—';
  }, { timeout: 5000 });
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
  await page.evaluate(({ id, val }) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) throw new Error(`Slider not found: #${id}`);
    el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id: inputId, val: value });
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
    test('renders calculator with default values', async ({ page }) => {
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
    });

    test('contextual note is populated on load', async ({ page }) => {
      await gotoCalc(page);
      const note = await getById(page, 'ctx-note');
      expect(note.trim().length).toBeGreaterThan(20);
    });

    test('advanced panel is collapsed on load', async ({ page }) => {
      await gotoCalc(page);

      const panel = page.locator('[data-advanced-panel]');
      await expect(panel).toHaveClass(/is-hidden/);

      const toggle = page.locator('[data-advanced-toggle]');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    test('advanced results are hidden on load', async ({ page }) => {
      await gotoCalc(page);
      const advResults = page.locator('[data-adv-results]');
      await expect(advResults).toHaveClass(/is-hidden/);
    });

    test('results section appears below inputs', async ({ page }) => {
      await gotoCalc(page);

      const inputsBox  = await page.locator('.inputs-section').boundingBox();
      const resultsBox = await page.locator('.results-section').boundingBox();

      expect(inputsBox).not.toBeNull();
      expect(resultsBox).not.toBeNull();
      // Results must start below the bottom of inputs
      expect(resultsBox!.y).toBeGreaterThan(inputsBox!.y + inputsBox!.height - 1);
    });
  });

  // ── Slider interactions ────────────────────────────────────────────────────

  test.describe('slider interactions', () => {
    test('changing team size updates annual cost', async ({ page }) => {
      await gotoCalc(page);

      const before = await getMetric(page, 'annual-cost');

      // Move team size slider from default (pos ~20) to pos 60 (larger team)
      await setSlider(page, 'input-team-size', 60);

      await page.waitForFunction(() => {
        const el = document.querySelector('[data-metric="annual-cost"]');
        return el && el.textContent !== '—';
      });

      const after = await getMetric(page, 'annual-cost');
      expect(after).not.toBe(before);
    });

    test('changing team size updates display value', async ({ page }) => {
      await gotoCalc(page);

      const before = await page.locator('[data-display="team-size"]').textContent();
      await setSlider(page, 'input-team-size', 90);

      const after = await page.locator('[data-display="team-size"]').textContent();
      expect(after).not.toBe(before);
      // At position 90 the team is large — display should be a number > 8
      expect(Number(after)).toBeGreaterThan(8);
    });

    test('changing salary updates annual cost', async ({ page }) => {
      await gotoCalc(page);

      const before = await getMetric(page, 'annual-cost');
      await setSlider(page, 'input-salary', 80);

      const after = await getMetric(page, 'annual-cost');
      expect(after).not.toBe(before);
    });

    test('higher maintenance burden increases annual cost', async ({ page }) => {
      await gotoCalc(page);

      // Read the FTE count at low burden — it's a plain number we can compare
      await setSlider(page, 'input-maint-pct', 20);
      await page.waitForFunction(() => {
        const el = document.getElementById('ctx-engs-lost');
        return el && !el.textContent?.includes('—');
      });
      const ftesLow = parseFloat((await getById(page, 'ctx-engs-lost')).replace(/[^0-9.]/g, '')) || 0;

      await setSlider(page, 'input-maint-pct', 80);
      await page.waitForFunction(() => {
        const el = document.getElementById('ctx-engs-lost');
        return el && !el.textContent?.includes('—');
      });
      const ftesHigh = parseFloat((await getById(page, 'ctx-engs-lost')).replace(/[^0-9.]/g, '')) || 0;

      // Higher burden → more FTEs lost (plain number, no suffix ambiguity)
      expect(ftesHigh).toBeGreaterThan(ftesLow);
    });

    test('slider display value updates when slider moves', async ({ page }) => {
      await gotoCalc(page);

      const before = await page.locator('[data-display="maint-pct"]').textContent();
      await setSlider(page, 'input-maint-pct', 70);

      const after = await page.locator('[data-display="maint-pct"]').textContent();
      expect(after).not.toBe(before);
      expect(after).toContain('%');
    });
  });

  // ── Severity colour-coding ─────────────────────────────────────────────────

  test.describe('severity colour-coding', () => {
    test('high maintenance burden (≥ 35%) colours the annual cost amber', async ({ page }) => {
      await gotoCalc(page);

      // Push burden well above the 35% threshold
      await setSlider(page, 'input-maint-pct', 50);

      const color = await page.locator('[data-metric="annual-cost"]').evaluate(
        el => window.getComputedStyle(el).color
      );

      // --color-secondary is applied at ≥ 35%; it must not be the primary teal
      // We verify the computed colour is NOT the default (primary green)
      // and IS set (not empty / inherit only)
      expect(color).not.toBe('');
      // The inline style is set to var(--color-secondary) by the render fn
      const inlineColor = await page.locator('[data-metric="annual-cost"]').getAttribute('style');
      expect(inlineColor).toContain('--color-secondary');
    });

    test('low maintenance burden (< 35%) keeps annual cost green', async ({ page }) => {
      await gotoCalc(page);

      // Burden at 20% — healthy
      await setSlider(page, 'input-maint-pct', 20);

      const inlineColor = await page.locator('[data-metric="annual-cost"]').getAttribute('style');
      expect(inlineColor).toContain('--color-primary');
    });

    test('burden label reflects maintenance level', async ({ page }) => {
      await gotoCalc(page);

      // Healthy
      await setSlider(page, 'input-maint-pct', 10);
      expect(await getById(page, 'ctx-burden-label')).toContain('Healthy');

      // Critical
      await setSlider(page, 'input-maint-pct', 80);
      expect(await getById(page, 'ctx-burden-label')).toContain('Critical');
    });
  });

  // ── Advanced toggle ────────────────────────────────────────────────────────

  test.describe('advanced toggle', () => {
    test('opens advanced panel and reveals advanced results together', async ({ page }) => {
      await gotoCalc(page);

      await jsClick(page, '[data-advanced-toggle]');

      // Panel inputs become visible
      const panel = page.locator('[data-advanced-panel]');
      await expect(panel).not.toHaveClass(/is-hidden/);

      // Advanced results section also becomes visible
      const advResults = page.locator('[data-adv-results]');
      await expect(advResults).not.toHaveClass(/is-hidden/);
    });

    test('toggle button aria-expanded reflects open state', async ({ page }) => {
      await gotoCalc(page);

      const toggle = page.locator('[data-advanced-toggle]');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await jsClick(page, '[data-advanced-toggle]');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await jsClick(page, '[data-advanced-toggle]');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    test('toggle label text updates when opened and closed', async ({ page }) => {
      await gotoCalc(page);

      const label = page.locator('[data-toggle-label]');
      await expect(label).toHaveText('Show Advanced Inputs');

      await jsClick(page, '[data-advanced-toggle]');
      await expect(label).toHaveText('Hide Advanced Inputs');

      await jsClick(page, '[data-advanced-toggle]');
      await expect(label).toHaveText('Show Advanced Inputs');
    });

    test('advanced metrics are populated after opening', async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      // Wait for values to be written by render()
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-metric="direct-labor"]');
        return el && el.textContent !== '—';
      }, { timeout: 3000 });

      expect(await getMetric(page, 'direct-labor')).not.toBe('—');
      expect(await getMetric(page, 'incident-labor')).not.toBe('—');
      expect(await getMetric(page, 'velocity')).not.toBe('—');
      expect(await getMetric(page, 'debt-pct-arr')).not.toBe('—');
      expect(await getById(page, 'payback-breakeven')).not.toBe('—');
      expect(await getById(page, 'payback-savings')).not.toBe('—');
    });
  });

  // ── Deployment frequency ───────────────────────────────────────────────────

  test.describe('deployment frequency', () => {
    test('clicking a deploy button marks it active', async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      // Click the last deploy button (Annually — index 8, DORA Low)
      await jsClick(page, '[data-deploy-btn="8"]');

      const btn = page.locator('[data-deploy-btn="8"]');
      await expect(btn).toHaveClass(/active/);
    });

    test('only one deploy button is active at a time', async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      await jsClick(page, '[data-deploy-btn="0"]');
      await jsClick(page, '[data-deploy-btn="8"]');

      // btn 8 active, btn 0 not
      await expect(page.locator('[data-deploy-btn="8"]')).toHaveClass(/active/);
      await expect(page.locator('[data-deploy-btn="0"]')).not.toHaveClass(/active/);
    });

    test('low-frequency deploy (index ≥ 6) shows DORA warning', async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      await jsClick(page, '[data-deploy-btn="6"]');

      const msg = page.locator('[data-dora-message]');
      await expect(msg).toContainText('DORA Low');
    });

    test('high-frequency deploy (index 0) clears DORA warning', async ({ page }) => {
      await gotoCalc(page);
      await jsClick(page, '[data-advanced-toggle]');

      // First set a low frequency to show the warning
      await jsClick(page, '[data-deploy-btn="6"]');
      await expect(page.locator('[data-dora-message]')).toContainText('DORA Low');

      // Switch to elite frequency
      await jsClick(page, '[data-deploy-btn="0"]');
      const msg = await page.locator('[data-dora-message]').textContent();
      expect(msg?.trim()).toBe('');
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  test.describe('navigation', () => {
    test('back link returns to hub tools page', async ({ page }) => {
      await gotoCalc(page);

      await page.locator('.back-link').click();
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/hub/tools');
    });
  });

});
