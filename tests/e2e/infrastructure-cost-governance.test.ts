import { test, expect, type Page } from '@playwright/test';

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

/** Wait for a specific wizard step to render — verifies label AND question buttons exist.
 *  The extra rAF wait ensures event handlers are wired after innerHTML replacement. */
async function waitForStep(page: Page, step: number): Promise<void> {
  await page.waitForFunction((s) => {
    const label = document.querySelector('[data-domain-label]');
    if (!label || !label.textContent?.includes(`Domain ${s}`)) return false;
    // Ensure question buttons have been rendered via innerHTML
    return document.querySelectorAll('[data-answer]').length > 0;
  }, step, { timeout: 5000 });
  // Wait one animation frame so addEventListener loop after innerHTML completes
  await page.waitForFunction(() =>
    new Promise(resolve => requestAnimationFrame(() => resolve(true)))
  );
}

/** Answer all questions in the current step with a given score.
 *
 *  Each click triggers render() which replaces innerHTML and re-wires listeners.
 *  Clicking sequentially via Playwright locators breaks because render() replaces
 *  the DOM between clicks, leaving stale references. Instead, we click each button
 *  via evaluate (which always hits the live DOM) and let the synchronous render()
 *  complete before the next iteration. */
async function answerAllInStep(page: Page, score: number): Promise<void> {
  await page.waitForSelector(`[data-score="${score}"]`, { timeout: 3000 });

  // Click each unselected button one at a time via evaluate.
  // render() is synchronous — after each click the DOM is immediately rebuilt,
  // so the next querySelectorAll call sees the fresh DOM.
  const totalClicked = await page.evaluate((s) => {
    let clicked = 0;
    // Keep clicking unselected buttons until none remain
    for (let safety = 0; safety < 20; safety++) {
      const btns = Array.from(document.querySelectorAll(`[data-score="${s}"]`));
      const target = btns.find(b => !b.classList.contains('brutal-choice-btn--selected')) as HTMLElement | undefined;
      if (!target) break;
      target.click(); // triggers synchronous render() which rebuilds innerHTML
      clicked++;
    }
    return clicked;
  }, score);

  // Verify all questions were answered (next button should be enabled)
  if (totalClicked > 0) {
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-action="next"]') as HTMLButtonElement | null;
      return btn && !btn.disabled;
    }, { timeout: 3000 });
  }
}

/** Navigate through all 6 wizard steps answering all questions */
async function completeWizard(page: Page, score: number = 2): Promise<void> {
  // Start the assessment
  await jsClick(page, '[data-action="start"]');
  await waitForStep(page, 1);

  // Steps 1-5: answer and advance to next domain
  for (let step = 1; step <= 5; step++) {
    await answerAllInStep(page, score);
    await jsClick(page, '[data-action="next"]');
    await waitForStep(page, step + 1);
  }

  // Step 6: answer and advance to results
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

  test('renders stats row with 6 domains, 20 questions, 5-7 min', async ({ page }) => {
    await gotoTool(page);
    const stats = await page.$$('.brutal-stat-tile');
    expect(stats).toHaveLength(3);

    const values = await Promise.all(stats.map(s => s.textContent()));
    const text = values.join(' ');
    expect(text).toContain('6');
    expect(text).toContain('20');
    expect(text).toContain('5-7 min');
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
    await waitForStep(page, 1);

    // Answer all Domain 1 questions (3 questions)
    await answerAllInStep(page, 2);

    const nextBtn = page.locator('[data-action="next"]');
    await expect(nextBtn).toBeEnabled();
  });

  test('completing all 6 steps reaches results view', async ({ page }) => {
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
    await waitForStep(page, 1);

    // Step 1: answer all with 0 (Not in place)
    await answerAllInStep(page, 0);
    await jsClick(page, '[data-action="next"]');
    await waitForStep(page, 2);

    // Steps 2-5: answer with 2 to get through
    for (let step = 2; step <= 5; step++) {
      await answerAllInStep(page, 2);
      await jsClick(page, '[data-action="next"]');
      await waitForStep(page, step + 1);
    }

    // Step 6: answer and advance to results
    await answerAllInStep(page, 2);
    await jsClick(page, '[data-action="next"]');
    await page.waitForSelector('[data-view="results"]:not(.is-hidden)', { timeout: 5000 });

    const warning = page.locator('[data-foundational-warning]');
    await expect(warning).not.toHaveClass(/is-hidden/);
  });

  test('foundational flag does not render when foundational domains are "Optimized"', async ({ page }) => {
    await gotoTool(page);
    await jsClick(page, '[data-action="start"]');
    await waitForStep(page, 1);

    // Step 1 (D1): answer all with 3 (Optimized)
    await answerAllInStep(page, 3);
    await jsClick(page, '[data-action="next"]');
    await waitForStep(page, 2);

    // Step 2 (D2): answer all with 3 (Optimized)
    await answerAllInStep(page, 3);
    await jsClick(page, '[data-action="next"]');
    await waitForStep(page, 3);

    // Steps 3-5
    for (let step = 3; step <= 5; step++) {
      await answerAllInStep(page, 2);
      await jsClick(page, '[data-action="next"]');
      await waitForStep(page, step + 1);
    }

    // Step 6: answer and advance to results
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

    // Assert on observable UI feedback
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-action="copy"]');
      return btn && btn.textContent === 'Link copied';
    }, { timeout: 3000 });

    const btnText = await page.textContent('[data-action="copy"]');
    expect(btnText).toBe('Link copied');
  });
});

// ─── Authority & Methodology ─────────────────────────────────────────────────

test.describe('ICG - Authority & Methodology', () => {
  test('authority line is visible on landing', async ({ page }) => {
    await gotoTool(page);
    const subtitle = page.locator('.hub-header__subtitle');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText('PE portfolio companies');
  });

  test('methodology section is collapsed by default', async ({ page }) => {
    await gotoTool(page);
    const details = page.locator('.tool-methodology');
    await expect(details).toBeVisible();
    // The body should not be visible when collapsed
    const body = page.locator('.tool-methodology__body');
    await expect(body).not.toBeVisible();
  });

  test('methodology section expands on click', async ({ page }) => {
    await gotoTool(page);
    await page.click('.tool-methodology__trigger');
    const body = page.locator('.tool-methodology__body');
    await expect(body).toBeVisible();
    await expect(body).toContainText('Scoring model');
  });
});

// ─── Copy Summary ────────────────────────────────────────────────────────────

test.describe('ICG - Copy Summary', () => {
  test('copy summary button exists in results', async ({ page }) => {
    await gotoTool(page);
    await completeWizard(page, 2);
    const btn = page.locator('[data-action="copy-summary"]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Copy summary');
  });

  test('copy summary shows feedback text', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await gotoTool(page);
    await completeWizard(page, 2);

    await jsClick(page, '[data-action="copy-summary"]');

    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-action="copy-summary"]');
      return btn && btn.textContent === 'Copied!';
    }, { timeout: 3000 });

    const btnText = await page.textContent('[data-action="copy-summary"]');
    expect(btnText).toBe('Copied!');
  });
});

// ─── Shareable URL ──────────────────────────────────────────────────────────

test.describe('ICG - Shareable URL', () => {
  test('restores state correctly from URL on page load', async ({ page }) => {
    await gotoTool(page);
    await completeWizard(page, 3); // All optimized
    await page.waitForSelector('[data-view="results"]:not(.is-hidden)', { timeout: 5000 });

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
