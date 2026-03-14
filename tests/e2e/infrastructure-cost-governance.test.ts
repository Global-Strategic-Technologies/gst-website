import { test, expect, Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TOOL_URL = '/hub/tools/infrastructure-cost-governance';

/** Navigate to the ICG tool and wait for JS initialisation */
async function gotoTool(page: Page): Promise<void> {
  await page.goto(TOOL_URL);
  await page.waitForLoadState('domcontentloaded');
  // Wait for the landing view to be visible
  await page.waitForSelector('[data-view="landing"]:not(.is-hidden)', { timeout: 5000 });
}

/** Click an element via JS to avoid WebKit stability issues */
async function jsClick(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`Element not found: ${sel}`);
    el.click();
  }, selector);
}

/** Answer all questions in the current step with a given score */
async function answerAllInStep(page: Page, score: number): Promise<void> {
  const buttons = await page.$$(`[data-score="${score}"]`);
  for (const btn of buttons) {
    await btn.click();
  }
}

/** Wait for a specific wizard step to render by checking the domain label */
async function waitForStep(page: Page, step: number): Promise<void> {
  await page.waitForFunction((s) => {
    const label = document.querySelector('[data-domain-label]');
    return label && label.textContent?.includes(`Domain ${s}`);
  }, step, { timeout: 5000 });
}

/** Navigate through all 5 wizard steps answering all questions */
async function completeWizard(page: Page, score: number = 2): Promise<void> {
  // Start the assessment
  await jsClick(page, '[data-action="start"]');
  await page.waitForSelector('[data-view="wizard"]:not(.is-hidden)', { timeout: 3000 });

  // Steps 1-4: answer and advance to next domain
  for (let step = 1; step <= 4; step++) {
    await answerAllInStep(page, score);
    await jsClick(page, '[data-action="next"]');
    await waitForStep(page, step + 1);
  }

  // Step 5: answer and advance to results
  await answerAllInStep(page, score);
  await jsClick(page, '[data-action="next"]');
  await page.waitForSelector('[data-view="results"]:not(.is-hidden)', { timeout: 5000 });
}

// ─── Landing page ───────────────────────────────────────────────────────────

test.describe('ICG - Landing page', () => {
  test('renders with correct heading', async ({ page }) => {
    await gotoTool(page);
    const heading = await page.textContent('.hub-header__title');
    expect(heading).toContain('Infrastructure Cost Governance');
  });

  test('renders description text', async ({ page }) => {
    await gotoTool(page);
    const subtitle = await page.textContent('.hub-header__subtitle');
    expect(subtitle).toContain('maturity assessment');
  });

  test('renders stats row with 5 domains, 16 questions, 4-6 min', async ({ page }) => {
    await gotoTool(page);
    const stats = await page.$$('.stat-tile');
    expect(stats).toHaveLength(3);

    const values = await Promise.all(stats.map(s => s.textContent()));
    const text = values.join(' ');
    expect(text).toContain('5');
    expect(text).toContain('16');
    expect(text).toContain('4-6 min');
  });

  test('"Begin assessment" button is visible', async ({ page }) => {
    await gotoTool(page);
    const btn = page.locator('[data-action="start"]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Begin assessment');
  });
});

// ─── Wizard navigation ─────────────────────────────────────────────────────

test.describe('ICG - Wizard navigation', () => {
  test('"Begin assessment" navigates to step 1', async ({ page }) => {
    await gotoTool(page);
    await jsClick(page, '[data-action="start"]');
    await page.waitForSelector('[data-view="wizard"]:not(.is-hidden)', { timeout: 3000 });
    const label = await page.textContent('[data-domain-label]');
    expect(label).toContain('Domain 1');
  });

  test('back from step 1 returns to landing', async ({ page }) => {
    await gotoTool(page);
    await jsClick(page, '[data-action="start"]');
    await page.waitForSelector('[data-view="wizard"]:not(.is-hidden)', { timeout: 3000 });
    await jsClick(page, '[data-action="back"]');
    await page.waitForSelector('[data-view="landing"]:not(.is-hidden)', { timeout: 3000 });
  });

  test('next button is disabled when not all questions answered', async ({ page }) => {
    await gotoTool(page);
    await jsClick(page, '[data-action="start"]');
    await page.waitForSelector('[data-view="wizard"]:not(.is-hidden)', { timeout: 3000 });
    const nextBtn = page.locator('[data-action="next"]');
    await expect(nextBtn).toBeDisabled();
  });

  test('answering all questions enables next', async ({ page }) => {
    await gotoTool(page);
    await jsClick(page, '[data-action="start"]');
    await page.waitForSelector('[data-view="wizard"]:not(.is-hidden)', { timeout: 3000 });

    // Answer all Domain 1 questions (3 questions)
    await answerAllInStep(page, 2);

    const nextBtn = page.locator('[data-action="next"]');
    await expect(nextBtn).toBeEnabled();
  });

  test('completing all 5 steps reaches results view', async ({ page }) => {
    await gotoTool(page);
    await completeWizard(page, 2);
    await page.waitForSelector('[data-view="results"]:not(.is-hidden)', { timeout: 3000 });
  });
});

// ─── Results view ───────────────────────────────────────────────────────────

test.describe('ICG - Results view', () => {
  test('foundational flag renders when D1 answers are all "Not in place"', async ({ page }) => {
    await gotoTool(page);
    await jsClick(page, '[data-action="start"]');
    await page.waitForSelector('[data-view="wizard"]:not(.is-hidden)', { timeout: 3000 });

    // Step 1: answer all with 0 (Not in place)
    await answerAllInStep(page, 0);
    await jsClick(page, '[data-action="next"]');
    await waitForStep(page, 2);

    // Steps 2-4: answer with 2 to get through
    for (let step = 2; step <= 4; step++) {
      await answerAllInStep(page, 2);
      await jsClick(page, '[data-action="next"]');
      await waitForStep(page, step + 1);
    }

    // Step 5: answer and advance to results
    await answerAllInStep(page, 2);
    await jsClick(page, '[data-action="next"]');
    await page.waitForSelector('[data-view="results"]:not(.is-hidden)', { timeout: 5000 });

    const warning = page.locator('[data-foundational-warning]');
    await expect(warning).not.toHaveClass(/is-hidden/);
  });

  test('foundational flag does not render when D1 answers are all "Optimized"', async ({ page }) => {
    await gotoTool(page);
    await jsClick(page, '[data-action="start"]');
    await page.waitForSelector('[data-view="wizard"]:not(.is-hidden)', { timeout: 3000 });

    // Step 1: answer all with 3 (Optimized)
    await answerAllInStep(page, 3);
    await jsClick(page, '[data-action="next"]');
    await waitForStep(page, 2);

    // Steps 2-4
    for (let step = 2; step <= 4; step++) {
      await answerAllInStep(page, 2);
      await jsClick(page, '[data-action="next"]');
      await waitForStep(page, step + 1);
    }

    // Step 5: answer and advance to results
    await answerAllInStep(page, 2);
    await jsClick(page, '[data-action="next"]');
    await page.waitForSelector('[data-view="results"]:not(.is-hidden)', { timeout: 5000 });

    const warning = page.locator('[data-foundational-warning]');
    await expect(warning).toHaveClass(/is-hidden/);
  });

  test('"Start over" resets to landing view', async ({ page }) => {
    await gotoTool(page);
    await completeWizard(page, 2);
    await page.waitForSelector('[data-view="results"]:not(.is-hidden)', { timeout: 3000 });

    await jsClick(page, '[data-action="reset"]');
    await page.waitForSelector('[data-view="landing"]:not(.is-hidden)', { timeout: 3000 });
  });

  test('copy link shows feedback and URL contains state parameter', async ({ page }) => {
    await gotoTool(page);
    await completeWizard(page, 2);
    await page.waitForSelector('[data-view="results"]:not(.is-hidden)', { timeout: 3000 });

    // Verify the URL already has ?s= from the render cycle
    const urlBefore = page.url();
    expect(urlBefore).toContain('?s=');

    await jsClick(page, '[data-action="copy"]');

    // Assert on observable UI feedback (cross-browser safe, no grantPermissions needed)
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-action="copy"]');
      return btn && btn.textContent === 'Link copied';
    }, { timeout: 3000 });

    const btnText = await page.textContent('[data-action="copy"]');
    expect(btnText).toBe('Link copied');
  });
});

// ─── Shareable URL ──────────────────────────────────────────────────────────

test.describe('ICG - Shareable URL', () => {
  test('restores state correctly from URL on page load', async ({ page }) => {
    await gotoTool(page);
    await completeWizard(page, 3); // All optimized
    await page.waitForSelector('[data-view="results"]:not(.is-hidden)', { timeout: 3000 });

    // Get the current URL with encoded state
    const url = page.url();
    expect(url).toContain('?s=');

    // Navigate to the same URL in a fresh load
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');

    // Should restore directly to results view
    await page.waitForSelector('[data-view="results"]:not(.is-hidden)', { timeout: 5000 });

    // Verify the score is Strategic (all 3s = 100)
    const levelText = await page.textContent('[data-score-level]');
    expect(levelText).toBe('Strategic');
  });
});
