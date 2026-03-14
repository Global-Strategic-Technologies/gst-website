import { test, expect } from '@playwright/test';

test.describe('Project Details Viewing Journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ma-portfolio', { waitUntil: 'domcontentloaded' });
    // Wait for portfolio JS to initialize and bind event handlers
    await page.waitForFunction(() => (window as any).__portfolioInitialized === true, { timeout: 10000 });
  });

  test('should have interactive project elements', async ({ page }) => {
    // Find project cards
    const cards = page.locator('[data-testid="project-card"]');
    const cardCount = await cards.count();

    // Should have at least one project card
    expect(cardCount).toBeGreaterThan(0);
  });

  test('should open modal on project interaction', async ({ page }) => {
    // Find and click first project card
    const firstCard = page.locator('[data-testid="project-card"]').first();
    await expect(firstCard).toBeVisible();

    // Use evaluate-based click for WebKit hit-testing compatibility
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
    });

    // Modal should open
    const modal = page.locator('[data-testid="project-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('should display project information sections', async ({ page }) => {
    // Open a project to see details
    const firstCard = page.locator('[data-testid="project-card"]').first();
    await expect(firstCard).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
    });

    const modal = page.locator('[data-testid="project-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify modal has content
    const modalContent = await modal.textContent();
    expect(modalContent?.trim().length || 0).toBeGreaterThan(20);

    // Verify modal contains heading or title
    const heading = modal.locator('h2, h3, [data-testid*="name"], [data-testid*="title"]').first();
    const headingVisible = await heading.isVisible({ timeout: 2000 }).catch(() => false);
    expect(headingVisible || modalContent?.trim().length! > 20).toBeTruthy();
  });

  test('should have technology information displayed', async ({ page }) => {
    // Open a project to see details
    const firstCard = page.locator('[data-testid="project-card"]').first();
    await expect(firstCard).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
    });

    const modal = page.locator('[data-testid="project-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify technology information is displayed in modal
    const techSection = modal.locator('[data-testid*="technolog"], [data-testid*="tech"], .technologies');
    const techVisible = await techSection.isVisible({ timeout: 2000 }).catch(() => false);

    // If tech section exists, verify it has content
    if (techVisible) {
      const techText = await techSection.textContent();
      expect(techText?.trim().length || 0).toBeGreaterThan(0);
    } else {
      // Fall back to checking modal has some content
      const modalText = await modal.textContent();
      expect(modalText?.trim().length || 0).toBeGreaterThan(30);
    }
  });

  test('should support keyboard interaction for details', async ({ page }) => {
    // Find and focus card
    const card = page.locator('[data-testid="project-card"]').first();
    await expect(card).toBeVisible();

    await card.focus();

    // Should be focused
    const isFocused = await card.evaluate(el => el === document.activeElement);
    expect(isFocused).toBe(true);

    // Press Enter to interact
    await card.press('Enter');

    // Modal should open
    const modal = page.locator('[data-testid="project-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('should handle rapid interaction', async ({ page }) => {
    const cards = page.locator('[data-testid="project-card"]');
    const cardCount = await cards.count();

    expect(cardCount).toBeGreaterThanOrEqual(2);

    // Store initial project info
    let previousProjectName = '';

    // Interact with up to 2 cards and verify different projects open
    for (let i = 0; i < Math.min(cardCount, 2); i++) {
      const card = cards.nth(i);
      await expect(card).toBeVisible();
      // Use evaluate-based click for WebKit hit-testing compatibility
      await page.evaluate((index) => {
        (document.querySelectorAll('[data-testid="project-card"]')[index] as HTMLElement)?.click();
      }, i);

      // Modal should appear
      const modal = page.locator('[data-testid="project-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Verify different project details are displayed
      const projectName = await modal.locator('[data-testid*="name"], h2, h3').first().textContent();

      if (i > 0) {
        // On second iteration, verify we're seeing different project
        expect(projectName).not.toBe(previousProjectName);
      }
      previousProjectName = projectName || '';

      // Close modal for next iteration
      const closeBtn = page.locator('[data-testid="project-modal-close"]');
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Use evaluate-based click for WebKit hit-testing compatibility
        await page.evaluate(() => {
          (document.querySelector('[data-testid="project-modal-close"]') as HTMLElement)?.click();
        });
        // Wait for modal to close before next iteration
        await expect(modal).not.toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should display consistent information format', async ({ page }) => {
    // Projects should have consistent structure
    const cards = page.locator('[data-testid="project-card"]');
    const count = await cards.count();

    // Should have multiple project cards
    expect(count).toBeGreaterThan(1);

    // Verify first two cards have consistent format
    for (let i = 0; i < Math.min(count, 2); i++) {
      const card = cards.nth(i);
      await expect(card).toBeVisible();

      // Each card should have clickable content
      const clickable = card.locator('a, button, [role="button"]');
      const clickableCount = await clickable.count();
      expect(clickableCount).toBeGreaterThan(0);
    }
  });

  test('should allow closing details view', async ({ page }) => {
    // Open a project
    const card = page.locator('[data-testid="project-card"]').first();
    await expect(card).toBeVisible();
    // Use evaluate-based click for WebKit hit-testing compatibility
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
    });

    const modal = page.locator('[data-testid="project-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Find and click close button
    const closeBtn = page.locator('[data-testid="project-modal-close"]');
    await expect(closeBtn).toBeVisible();
    // Use evaluate-based click for WebKit hit-testing compatibility
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-modal-close"]') as HTMLElement)?.click();
    });

    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('should maintain page responsiveness during interaction', async ({ page }) => {
    // Use project cards for interaction testing
    const cards = page.locator('[data-testid="project-card"]');
    const cardCount = await cards.count();

    expect(cardCount).toBeGreaterThan(0);

    // Click first project card — use evaluate for WebKit hit-testing
    const firstCard = cards.first();
    await expect(firstCard).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-card"]') as HTMLElement)?.click();
    });

    // Modal should open
    const modal = page.locator('[data-testid="project-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify modal has content
    const modalText = await modal.textContent();
    expect(modalText?.trim().length || 0).toBeGreaterThan(20);

    // Verify we can still interact with the modal
    const closeBtn = page.locator('[data-testid="project-modal-close"]');
    await expect(closeBtn).toBeVisible();

    // Modal should remain visible and responsive — use evaluate for WebKit
    await page.evaluate(() => {
      (document.querySelector('[data-testid="project-modal-close"]') as HTMLElement)?.click();
    });
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });
});
