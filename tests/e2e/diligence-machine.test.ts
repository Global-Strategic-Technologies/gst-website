import { test, expect } from '@playwright/test';
import type { UserInputs } from '../../src/utils/diligence-engine';
import {
  completeWizardToStep,
  completeWizardAndGenerate,
  getLocalStorageState,
  clearLocalStorageState,
  verifyStepSelection,
  verifyCompoundSelection,
  verifyOutputHasQuestions,
  waitForWizardReady,
  getQuestionCount,
  getAttentionAreaCount,
  expectWizardOnStep,
  expectProgressSegmentState,
  clickElement,
} from './helpers/diligence-machine';

test.describe('Diligence Machine E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hub/tools/diligence-machine', { waitUntil: 'domcontentloaded' });
    await waitForWizardReady(page);
  });

  test.describe('1. Wizard Initialization and Navigation', () => {
    test('should load wizard at step 1 with correct initial state', async ({ page }) => {
      // Verify wizard container is visible
      await expect(page.locator('[data-testid="wizard-container"]')).toBeVisible();

      // Verify step 1 is active
      await expectWizardOnStep(page, 1);
      const activeStep = page.locator('.wizard-step.active');
      expect(await activeStep.getAttribute('data-step-id')).toBe('transaction-type');

      // Verify progress bar shows step 1 active
      await expectProgressSegmentState(page, 1, 'active');

      // Verify Back button is disabled
      const btnBack = page.locator('[data-testid="btn-back"]');
      await expect(btnBack).toBeDisabled();

      // Verify Next button is disabled (no selection yet)
      const btnNext = page.locator('[data-testid="btn-next"]');
      await expect(btnNext).toBeDisabled();

      // Verify Generate button is hidden
      const btnGenerate = page.locator('[data-testid="btn-generate"]');
      expect(await btnGenerate.isVisible()).toBe(false);

      // Verify localStorage is empty or has correct version
      const storageState = await getLocalStorageState(page);
      expect(storageState === null || storageState.version === 2).toBe(true);
    });

    test('should advance through wizard using auto-advance', async ({ page }) => {
      // Select option in step 1 (use clickElement for WebKit stability)
      await clickElement(page, '[data-testid="option-transaction-type-full-acquisition"]');

      // Wait for auto-advance (300ms delay)
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '2';
      }, { timeout: 5000 });

      // Verify we're now on step 2
      await expectWizardOnStep(page, 2);
      const activeStep = page.locator('.wizard-step.active');
      expect(await activeStep.getAttribute('data-step-id')).toBe('product-type');

      // Verify progress bar updated
      await expectProgressSegmentState(page, 2, 'active');
      await expectProgressSegmentState(page, 1, 'completed');

      // Verify Back button is now enabled
      await expect(page.locator('[data-testid="btn-back"]')).toBeEnabled();

      // Verify localStorage was updated
      const state = await getLocalStorageState(page);
      expect(state.currentStep).toBe(2);
      expect(state.highestStepReached).toBe(2);
      expect(state.inputs.transactionType).toBe('full-acquisition');
    });

    test('should navigate backwards and maintain highestStepReached', async ({ page }) => {
      // Advance to step 3 (use clickElement for WebKit stability)
      await clickElement(page, '[data-testid="option-transaction-type-full-acquisition"]');
      await page.waitForTimeout(400);
      await clickElement(page, '[data-testid="option-product-type-b2b-saas"]');
      await page.waitForTimeout(400);

      // Verify we're on step 3
      await expectWizardOnStep(page, 3);

      // Click Back button
      await clickElement(page, '[data-testid="btn-back"]');

      // Verify we're now on step 2
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '2';
      });
      await expectWizardOnStep(page, 2);

      // Verify highestStepReached is still 3
      const state = await getLocalStorageState(page);
      expect(state.currentStep).toBe(2);
      expect(state.highestStepReached).toBe(3);

      // Verify step 3 has 'reachable' class
      await expectProgressSegmentState(page, 3, 'reachable');

      // Verify previous selection is still visible
      await verifyStepSelection(page, 'product-type', 'b2b-saas');
    });

    test('should show Generate button on final step', async ({ page }) => {
      // Use helper to complete steps 1-9
      await completeWizardToStep(page, 10, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
      });

      // Verify we're on step 10
      await expectWizardOnStep(page, 10);

      // Next button should be hidden
      const btnNext = page.locator('[data-testid="btn-next"]');
      expect(await btnNext.isVisible()).toBe(false);

      // Generate button should be visible and disabled (no selection yet)
      const btnGenerate = page.locator('[data-testid="btn-generate"]');
      await expect(btnGenerate).toBeVisible();
      await expect(btnGenerate).toBeDisabled();

      // Select final option (use clickElement for WebKit stability)
      await clickElement(page, '[data-testid="option-operating-model-centralized-eng"]');
      await page.waitForTimeout(100);

      // Generate button should now be enabled
      await expect(btnGenerate).toBeEnabled();
    });
  });

  test.describe('2. State Persistence and Recovery', () => {
    test('should restore wizard state after page reload', async ({ page }) => {
      // Complete first 3 steps (use clickElement for WebKit stability)
      await clickElement(page, '[data-testid="option-transaction-type-carve-out"]');
      await page.waitForTimeout(400);
      await clickElement(page, '[data-testid="option-product-type-on-premise-enterprise"]');
      await page.waitForTimeout(400);
      await clickElement(page, '[data-testid="option-tech-archetype-hybrid-legacy"]');
      await page.waitForTimeout(400);

      // Verify we're on step 4
      await expectWizardOnStep(page, 4);

      // Reload page (use domcontentloaded for WebKit compatibility)
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForWizardReady(page);

      // Verify we're still on step 4
      await expectWizardOnStep(page, 4);

      // Verify highestStepReached is 4
      const state = await getLocalStorageState(page);
      expect(state.currentStep).toBe(4);
      expect(state.highestStepReached).toBe(4);

      // Go back to step 1 and verify selection persisted
      await page.locator('[data-testid="btn-back"]').click();
      await page.locator('[data-testid="btn-back"]').click();
      await page.locator('[data-testid="btn-back"]').click();

      await expectWizardOnStep(page, 1);
      await verifyStepSelection(page, 'transaction-type', 'carve-out');
    });

    test('should clear state when version mismatch detected', async ({ page }) => {
      // Set old version in localStorage
      await page.evaluate(() => {
        const oldState = {
          version: 1,
          currentStep: 5,
          highestStepReached: 5,
          inputs: { transactionType: 'full-acquisition' }
        };
        localStorage.setItem('diligence-machine-state', JSON.stringify(oldState));
      });

      // Reload page (use domcontentloaded for WebKit compatibility)
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForWizardReady(page);

      // Should be back at step 1 (state was cleared)
      await expectWizardOnStep(page, 1);

      // No selections should be present
      const selectedCards = page.locator('.option-card.selected');
      expect(await selectedCards.count()).toBe(0);
    });
  });

  test.describe('3. Progress Bar Click Navigation', () => {
    test('should navigate to a completed step via progress bar click', async ({ page }) => {
      // Advance to step 5
      await completeWizardToStep(page, 5, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
      });

      // Wait for step 5 to be active
      await expectWizardOnStep(page, 5);

      // Click progress segment 2 to navigate back
      await clickElement(page, '[data-testid="progress-segment-2"]');

      // Wait for navigation to complete
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '2';
      }, { timeout: 2000 });

      // Verify wizard is now on step 2
      await expectWizardOnStep(page, 2);

      // Verify step 2 selection is preserved
      await verifyStepSelection(page, 'product-type', 'b2b-saas');

      // Verify progress segment states updated correctly
      await expectProgressSegmentState(page, 1, 'completed');
      await expectProgressSegmentState(page, 2, 'active');
      await expectProgressSegmentState(page, 3, 'reachable');
      await expectProgressSegmentState(page, 4, 'reachable');
    });

    test('should navigate to a reachable future step via progress bar click', async ({ page }) => {
      // Advance to step 5
      await completeWizardToStep(page, 5, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
      });
      await expectWizardOnStep(page, 5);

      // Navigate back to step 2 via Back button
      await clickElement(page, '[data-testid="btn-back"]');
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '4';
      }, { timeout: 2000 });
      await clickElement(page, '[data-testid="btn-back"]');
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '3';
      }, { timeout: 2000 });
      await clickElement(page, '[data-testid="btn-back"]');
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '2';
      }, { timeout: 2000 });
      await expectWizardOnStep(page, 2);

      // Click progress segment 4 (reachable, forward)
      await clickElement(page, '[data-testid="progress-segment-4"]');

      // Wait for navigation
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '4';
      }, { timeout: 2000 });

      // Verify wizard navigated to step 4
      await expectWizardOnStep(page, 4);

      // Verify compound selections are preserved
      await verifyCompoundSelection(page, 'headcount', '51-200');
      await verifyCompoundSelection(page, 'revenue-range', '5-25m');
      await verifyCompoundSelection(page, 'growth-stage', 'scaling');
      await verifyCompoundSelection(page, 'company-age', '2-5yr');
    });

    test('should not navigate to unreached steps', async ({ page }) => {
      // Advance to step 3
      await completeWizardToStep(page, 3, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
      });
      await expectWizardOnStep(page, 3);

      // Attempt to click unreached segment 7
      await clickElement(page, '[data-testid="progress-segment-7"]');

      // Wait briefly and verify we did NOT navigate
      await page.waitForTimeout(300);
      await expectWizardOnStep(page, 3);

      // Verify unreached segment does not have pointer cursor
      const cursor = await page.locator('[data-testid="progress-segment-7"]').evaluate(
        (el) => window.getComputedStyle(el).cursor
      );
      expect(cursor).not.toBe('pointer');
    });

    test('should not navigate when clicking the active step', async ({ page }) => {
      // Advance to step 3
      await completeWizardToStep(page, 3, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
      });
      await expectWizardOnStep(page, 3);

      // Click the active segment (step 3)
      await clickElement(page, '[data-testid="progress-segment-3"]');

      // Wait briefly and verify no navigation occurred
      await page.waitForTimeout(300);
      await expectWizardOnStep(page, 3);

      // Verify state unchanged in localStorage
      const state = await getLocalStorageState(page);
      expect(state.currentStep).toBe(3);
    });

    test('should update progress segment states correctly after navigation', async ({ page }) => {
      // Advance to step 6
      await completeWizardToStep(page, 6, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
      });
      await expectWizardOnStep(page, 6);

      // Navigate back to step 3 via progress bar
      await clickElement(page, '[data-testid="progress-segment-3"]');
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '3';
      }, { timeout: 2000 });

      // Verify all 10 segments have correct states
      // Segments 1-2: completed (before current)
      await expectProgressSegmentState(page, 1, 'completed');
      await expectProgressSegmentState(page, 2, 'completed');

      // Segment 3: active (current)
      await expectProgressSegmentState(page, 3, 'active');

      // Segments 4-6: reachable (between current and highestStepReached)
      await expectProgressSegmentState(page, 4, 'reachable');
      await expectProgressSegmentState(page, 5, 'reachable');
      await expectProgressSegmentState(page, 6, 'reachable');

      // Segments 7-10: unreached (beyond highestStepReached)
      await expectProgressSegmentState(page, 7, 'unreached');
      await expectProgressSegmentState(page, 8, 'unreached');
      await expectProgressSegmentState(page, 9, 'unreached');
      await expectProgressSegmentState(page, 10, 'unreached');
    });

    test('should update aria-valuenow on progress bar after click navigation', async ({ page }) => {
      // Advance to step 5
      await completeWizardToStep(page, 5, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
      });
      await expectWizardOnStep(page, 5);

      // Verify initial aria-valuenow
      const progressBar = page.locator('[data-testid="wizard-progress"]');
      await expect(progressBar).toHaveAttribute('aria-valuenow', '5');

      // Click progress segment 2
      await clickElement(page, '[data-testid="progress-segment-2"]');
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '2';
      }, { timeout: 2000 });

      // Verify aria-valuenow updated
      await expect(progressBar).toHaveAttribute('aria-valuenow', '2');
    });

    test('should show pointer cursor on completed and reachable segments only', async ({ page }) => {
      // Advance to step 4
      await completeWizardToStep(page, 4, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
      });
      await expectWizardOnStep(page, 4);

      // Verify completed segments (1-3) have pointer cursor
      for (const seg of [1, 2, 3]) {
        const cursor = await page.locator(`[data-testid="progress-segment-${seg}"]`).evaluate(
          (el) => window.getComputedStyle(el).cursor
        );
        expect(cursor).toBe('pointer');
      }

      // Verify active segment (4) does NOT have pointer cursor
      const activeCursor = await page.locator('[data-testid="progress-segment-4"]').evaluate(
        (el) => window.getComputedStyle(el).cursor
      );
      expect(activeCursor).not.toBe('pointer');

      // Verify unreached segments (5-10) do NOT have pointer cursor
      for (const seg of [5, 6, 7, 8, 9, 10]) {
        const cursor = await page.locator(`[data-testid="progress-segment-${seg}"]`).evaluate(
          (el) => window.getComputedStyle(el).cursor
        );
        expect(cursor).not.toBe('pointer');
      }
    });
  });

  test.describe('7. Output Generation and Validation', () => {
    test('should generate output immediately after clicking Generate', async ({ page }) => {
      // Complete all 10 steps
      await completeWizardToStep(page, 10, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
      });

      // Select final option (use clickElement for WebKit stability)
      await clickElement(page, '[data-testid="option-operating-model-centralized-eng"]');
      await page.waitForTimeout(400);

      // Click Generate (use clickElement for WebKit stability)
      await clickElement(page, '[data-testid="btn-generate"]');

      // Wizard should disappear immediately
      await page.waitForFunction(() => {
        const wizard = document.querySelector('[data-testid="wizard-container"]');
        return wizard && window.getComputedStyle(wizard).display === 'none';
      }, { timeout: 500 });

      // Output should appear immediately (no fake loading delay)
      await page.waitForFunction(() => {
        const output = document.querySelector('[data-testid="output-container"]');
        return output && window.getComputedStyle(output).display !== 'none';
      }, { timeout: 5000 });

      // Output should be visible
      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Wizard should be hidden
      await expect(page.locator('[data-testid="wizard-container"]')).not.toBeVisible();
    });

    test('should render all required output sections', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'carve-out',
        productType: 'on-premise-enterprise',
        techArchetype: 'hybrid-legacy',
        headcount: '201-500',
        revenueRange: '25-100m',
        growthStage: 'mature',
        companyAge: '10-20yr',
        geographies: ['us', 'eu'],
        businessModel: 'customized-deployments',
        scaleIntensity: 'high',
        transformationState: 'mid-migration',
        dataSensitivity: 'high',
        operatingModel: 'product-aligned-teams',
      });

      // Wait for output
      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Verify document header
      await expect(page.locator('[data-testid="doc-header"]')).toBeVisible();
      await expect(page.locator('.doc-title')).toHaveText('Overview and Agenda');
      await expect(page.locator('.doc-brand-name')).toHaveText('GST');

      // Verify generation date is present
      const docDate = page.locator('#docDate');
      const dateText = await docDate.textContent();
      expect(dateText).toBeTruthy();
      expect(dateText!.length).toBeGreaterThan(10);

      // Verify metadata section
      await expect(page.locator('[data-testid="doc-meta"]')).toBeVisible();

      // Verify table of contents
      await expect(page.locator('[data-testid="doc-toc"]')).toBeVisible();

      // Verify topics section
      await expect(page.locator('[data-testid="doc-topics"]')).toBeVisible();
      const topics = page.locator('.doc-topic');
      const topicCount = await topics.count();
      expect(topicCount).toBeGreaterThan(0);
      expect(topicCount).toBeLessThanOrEqual(4); // Max 4 topics

      // Verify footer
      await expect(page.locator('.doc-footer')).toBeVisible();
      await expect(page.locator('.doc-footer-disclaimer')).toContainText('These perspectives are presented from recurrent technology patterns');
    });
  });

  test.describe('8. Output Content Verification', () => {
    test('should generate 15-20 questions', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Count all questions
      const count = await getQuestionCount(page);
      expect(count).toBeGreaterThanOrEqual(15);
      expect(count).toBeLessThanOrEqual(20);
    });

    test('should render complete question structure with all fields', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Get first question
      const firstQuestion = page.locator('.doc-question').first();

      // Verify question number
      const qNumber = firstQuestion.locator('.doc-q-number');
      await expect(qNumber).toBeVisible();
      const numberText = await qNumber.textContent();
      expect(numberText).toMatch(/^\d+\.\d+$/); // Format: 1.1, 2.3, etc.

      // Verify priority badge
      const priorityBadge = firstQuestion.locator('.doc-q-priority');
      await expect(priorityBadge).toBeVisible();
      const priority = await priorityBadge.textContent();
      expect(['high', 'medium', 'standard']).toContain(priority);

      // Verify question text
      const qText = firstQuestion.locator('.doc-q-text');
      await expect(qText).toBeVisible();
      const text = await qText.textContent();
      expect(text!.length).toBeGreaterThan(10);

      // Verify rationale
      const rationale = firstQuestion.locator('.doc-q-rationale');
      await expect(rationale).toBeVisible();
      const rationaleText = await rationale.textContent();
      expect(rationaleText!.length).toBeGreaterThan(10);
    });

    test('should display exit impact badges on applicable questions', async ({ page }) => {
      // Use inputs that will trigger v2 questions with exit impact
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '201-500',
        revenueRange: '25-100m',
        growthStage: 'mature',
        companyAge: '5-10yr',
        geographies: ['us', 'eu'],
        businessModel: 'usage-based',
        scaleIntensity: 'high',
        transformationState: 'actively-modernizing',
        dataSensitivity: 'high',
        operatingModel: 'product-aligned-teams',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Look for exit impact badges (may not be present on all questions)
      const exitImpactBadges = page.locator('.doc-q-exit-impact');
      const badgeCount = await exitImpactBadges.count();

      // If badges are present, verify their format
      if (badgeCount > 0) {
        for (let i = 0; i < badgeCount; i++) {
          const badge = exitImpactBadges.nth(i);
          const text = await badge.textContent();
          expect(['Multiple Expander', 'Valuation Drag', 'Operational Risk']).toContain(text);

          // Verify badge has appropriate CSS class (may have space or hyphen separator)
          const className = await badge.getAttribute('class');
          expect(className).toMatch(/exit-impact-(multiple-expander|multiple expander|valuation-drag|valuation drag|operational-risk|operational risk)/);
        }
      }
    });

    test('should display attention areas based on input conditions', async ({ page }) => {
      // Use inputs that trigger multiple attention areas
      await completeWizardAndGenerate(page, {
        transactionType: 'carve-out',
        productType: 'on-premise-enterprise',
        techArchetype: 'hybrid-legacy',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'mature',
        companyAge: '10-20yr',
        geographies: ['eu', 'uk', 'apac'],
        businessModel: 'customized-deployments',
        scaleIntensity: 'moderate',
        transformationState: 'mid-migration',
        dataSensitivity: 'high',
        operatingModel: 'outsourced-heavy',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Attention Areas section should be visible
      await expect(page.locator('[data-testid="attention-areas-section"]')).toBeVisible();

      // Should have attention areas
      const anchorCount = await getAttentionAreaCount(page);
      expect(anchorCount).toBeGreaterThan(0);

      // Verify first anchor structure
      const firstAnchor = page.locator('.doc-attention-card').first();

      // Has title
      const title = firstAnchor.locator('.doc-attention-title');
      await expect(title).toBeVisible();
      const titleText = await title.textContent();
      expect(titleText!.length).toBeGreaterThan(5);

      // Has description
      const desc = firstAnchor.locator('.doc-attention-desc');
      await expect(desc).toBeVisible();
      const descText = await desc.textContent();
      expect(descText!.length).toBeGreaterThan(20);

      // Verify anchor has CSS class matching relevance
      const anchorClass = await firstAnchor.getAttribute('class');
      expect(anchorClass).toMatch(/relevance-(high|medium|low)/);
    });

    test('should display all input parameters in metadata section', async ({ page }) => {
      const testInputs: Required<UserInputs> = {
        transactionType: 'venture-series',
        productType: 'deep-tech-ip',
        techArchetype: 'self-managed-infra',
        headcount: '1-50',
        revenueRange: '0-5m',
        growthStage: 'early',
        companyAge: 'under-2yr',
        geographies: ['africa'],
        businessModel: 'ip-licensing',
        scaleIntensity: 'low',
        transformationState: 'stable',
        dataSensitivity: 'low',
        operatingModel: 'centralized-eng',
      };

      await completeWizardAndGenerate(page, testInputs);

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Verify metadata section has content
      const metaCards = page.locator('.doc-meta-card');
      const cardCount = await metaCards.count();
      expect(cardCount).toBeGreaterThanOrEqual(13); // 13 input fields

      // Verify specific values are present in metadata
      const metaText = await page.locator('[data-testid="doc-meta"]').textContent();
      expect(metaText).toBeTruthy();
      // Note: We can't check exact label formatting without knowing the implementation,
      // but we can verify the metadata section has substantial content
      expect(metaText!.length).toBeGreaterThan(100);
    });

    test('should display questions balanced across topics', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '201-500',
        revenueRange: '25-100m',
        growthStage: 'scaling',
        companyAge: '5-10yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'high',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'product-aligned-teams',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Get all topics
      const topics = page.locator('.doc-topic');
      const topicCount = await topics.count();

      // Should have 2-4 topics
      expect(topicCount).toBeGreaterThanOrEqual(2);
      expect(topicCount).toBeLessThanOrEqual(4);

      // Each topic should have at least some questions
      for (let i = 0; i < topicCount; i++) {
        const topic = topics.nth(i);
        const questionsInTopic = topic.locator('.doc-question');
        const qCount = await questionsInTopic.count();
        expect(qCount).toBeGreaterThan(0);
      }
    });
  });

  test.describe('9. Action Bar Functionality', () => {
    test('should copy output to clipboard', async ({ page, context, browserName }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Grant clipboard permissions (skip for WebKit/Firefox which don't support it)
      if (browserName === 'chromium') {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      }

      // Click copy button
      await page.locator('[data-testid="btn-copy"]').click();

      // Verify button label changed
      await expect(page.locator('#btnCopyLabel')).toHaveText('Copied!');

      // Wait for label to revert (source uses setTimeout 2000ms)
      await page.waitForFunction(() => {
        const label = document.getElementById('btnCopyLabel');
        return label && label.textContent === 'Copy';
      }, { timeout: 5000 });

      // Verify clipboard content (skip for Firefox/WebKit which may not support clipboard API)
      if (browserName === 'chromium') {
        const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

        expect(clipboardContent).toContain('OVERVIEW AND AGENDA');
        expect(clipboardContent).toContain('GST');
        expect(clipboardContent).toContain('TARGET PARAMETERS');
        expect(clipboardContent).toContain('Full Acquisition');
        expect(clipboardContent).toContain('B2B SaaS');
      }
    });

    test('should trigger print dialog when print button clicked', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Override window.print to detect call
      await page.evaluate(() => {
        (window as any).printWasCalled = false;
        window.print = () => {
          (window as any).printWasCalled = true;
        };
      });

      // Click print button
      await page.locator('[data-testid="btn-print"]').click();

      // Verify print was called
      const wasCalled = await page.evaluate(() => (window as any).printWasCalled);
      expect(wasCalled).toBe(true);
    });

    test('should restart wizard and clear all state', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Click Restart — use evaluate for WebKit
      await page.evaluate(() => {
        (document.querySelector('[data-testid="btn-restart"]') as HTMLElement)?.click();
      });

      // Wait for wizard to appear (increased timeout for slower browsers under contention)
      await page.waitForFunction(() => {
        const wizard = document.querySelector('[data-testid="wizard-container"]');
        const output = document.querySelector('[data-testid="output-container"]');
        return wizard && output &&
               window.getComputedStyle(wizard).display !== 'none' &&
               window.getComputedStyle(output).display === 'none';
      }, { timeout: 10000 });

      // Wizard should be visible
      await expect(page.locator('[data-testid="wizard-container"]')).toBeVisible();

      // Output should be hidden
      await expect(page.locator('[data-testid="output-container"]')).not.toBeVisible();

      // Should be on step 1
      await expectWizardOnStep(page, 1);

      // No selections should be present
      const selectedCards = page.locator('.option-card.selected');
      expect(await selectedCards.count()).toBe(0);

      // localStorage should be reset to initial state (not null, but step 1)
      const state = await getLocalStorageState(page);
      if (state) {
        expect(state.currentStep).toBe(1);
        expect(state.highestStepReached).toBeGreaterThanOrEqual(1); // Could be 1 or 10 depending on timing
      }
    });

    test('should return to step 10 when clicking Go Back from output', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Click Go Back button — use evaluate for WebKit
      await page.evaluate(() => {
        (document.querySelector('[data-testid="btn-go-back"]') as HTMLElement)?.click();
      });

      // Wait for wizard to appear
      await page.waitForFunction(() => {
        const wizard = document.querySelector('[data-testid="wizard-container"]');
        return wizard && window.getComputedStyle(wizard).display !== 'none';
      }, { timeout: 5000 });

      // Wizard should be visible
      await expect(page.locator('[data-testid="wizard-container"]')).toBeVisible();

      // Output should be hidden
      await expect(page.locator('[data-testid="output-container"]')).not.toBeVisible();

      // Should be on step 10
      await expectWizardOnStep(page, 10);

      // Previous selections should still be present
      await verifyStepSelection(page, 'operating-model', 'centralized-eng');

      // Can navigate back and selections are preserved
      await page.locator('[data-testid="btn-back"]').click();
      await expectWizardOnStep(page, 9);
    });
  });

  test.describe('10. Target Parameters Back-Navigation', () => {
    test('should navigate to wizard step when clicking parameter label', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      // Verify output is visible
      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Click on "Transaction Type" label in Target Parameters
      // Click on "Transaction Type" label — use evaluate for WebKit stability
      await expect(page.locator('.doc-meta-label--clickable[data-step-id="transaction-type"]')).toBeVisible();
      await page.evaluate(() => {
        (document.querySelector('.doc-meta-label--clickable[data-step-id="transaction-type"]') as HTMLElement)?.click();
      });

      // Wait for wizard to appear
      await page.waitForFunction(() => {
        const wizard = document.querySelector('[data-testid="wizard-container"]');
        return wizard && window.getComputedStyle(wizard).display !== 'none';
      }, { timeout: 5000 });

      // Wizard should be visible
      await expect(page.locator('[data-testid="wizard-container"]')).toBeVisible();

      // Output should be hidden
      await expect(page.locator('[data-testid="output-container"]')).not.toBeVisible();

      // Should be on step 1 (Transaction Type)
      await expectWizardOnStep(page, 1);

      // Previous selection should be preserved
      await verifyStepSelection(page, 'transaction-type', 'full-acquisition');
    });

    test('should navigate to compound step when clicking company size parameter', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'carve-out',
        productType: 'on-premise-enterprise',
        techArchetype: 'hybrid-legacy',
        headcount: '201-500',
        revenueRange: '25-100m',
        growthStage: 'mature',
        companyAge: '10-20yr',
        geographies: ['eu'],
        businessModel: 'customized-deployments',
        scaleIntensity: 'high',
        transformationState: 'mid-migration',
        dataSensitivity: 'high',
        operatingModel: 'product-aligned-teams',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Click on "Company Size" label (maps to company-profile step) — use evaluate for WebKit stability
      await expect(page.locator('.doc-meta-label--clickable[data-step-id="company-profile"]').first()).toBeVisible();
      await page.evaluate(() => {
        (document.querySelector('.doc-meta-label--clickable[data-step-id="company-profile"]') as HTMLElement)?.click();
      });

      // Wait for wizard
      await page.waitForFunction(() => {
        const wizard = document.querySelector('[data-testid="wizard-container"]');
        return wizard && window.getComputedStyle(wizard).display !== 'none';
      });

      // Should be on step 4 (Company Profile - compound step)
      await expectWizardOnStep(page, 4);

      // Verify compound selections are preserved
      await verifyCompoundSelection(page, 'headcount', '201-500');
      await verifyCompoundSelection(page, 'revenue-range', '25-100m');
      await verifyCompoundSelection(page, 'growth-stage', 'mature');
      await verifyCompoundSelection(page, 'company-age', '10-20yr');
    });

    test('should navigate to multi-select geography step when clicking geography parameter', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us', 'eu', 'uk'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Click on "Geography" label — use evaluate for WebKit stability
      await expect(page.locator('.doc-meta-label--clickable[data-step-id="geography"]')).toBeVisible();
      await page.evaluate(() => {
        (document.querySelector('.doc-meta-label--clickable[data-step-id="geography"]') as HTMLElement)?.click();
      });

      await page.waitForFunction(() => {
        const wizard = document.querySelector('[data-testid="wizard-container"]');
        return wizard && window.getComputedStyle(wizard).display !== 'none';
      });

      // Should be on step 5 (Geography)
      await expectWizardOnStep(page, 5);

      // Verify geography selections are preserved
      await verifyStepSelection(page, 'geography', 'us');
      await verifyStepSelection(page, 'geography', 'eu');
      await verifyStepSelection(page, 'geography', 'uk');
    });

    test('should show hover effect on clickable parameter labels', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      const transactionTypeLabel = page.locator('.doc-meta-label--clickable[data-step-id="transaction-type"]');

      // Get initial state
      const before = await transactionTypeLabel.evaluate((el) => ({
        cursor: window.getComputedStyle(el).cursor,
        textDecoration: window.getComputedStyle(el).textDecoration,
      }));

      // Verify cursor is pointer
      expect(before.cursor).toBe('pointer');

      // Hover over label
      await transactionTypeLabel.hover();

      // Wait for CSS transition
      await page.waitForTimeout(100);

      // Get hover state
      const after = await transactionTypeLabel.evaluate((el) => ({
        textDecoration: window.getComputedStyle(el).textDecoration,
      }));

      // Verify text decoration changes on hover (underline)
      expect(after.textDecoration).toContain('underline');
    });

    test('should preserve wizard state when navigating back from parameter label', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Click on "Product Type" label to navigate back — use evaluate for WebKit stability
      await page.evaluate(() => {
        (document.querySelector('.doc-meta-label--clickable[data-step-id="product-type"]') as HTMLElement)?.click();
      });

      await page.waitForFunction(() => {
        const wizard = document.querySelector('[data-testid="wizard-container"]');
        return wizard && window.getComputedStyle(wizard).display !== 'none';
      });

      // Should be on step 2
      await expectWizardOnStep(page, 2);

      // Verify previous selection is preserved
      await verifyStepSelection(page, 'product-type', 'b2b-saas');

      // Verify we can navigate to other steps and selections remain
      await clickElement(page, '[data-testid="btn-back"]');
      await expectWizardOnStep(page, 1);
      await verifyStepSelection(page, 'transaction-type', 'full-acquisition');

      // Verify we can navigate forward
      await clickElement(page, '[data-testid="btn-next"]');
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '2';
      }, { timeout: 2000 });
      await expectWizardOnStep(page, 2);

      // Verify highestStepReached is maintained (should be 10)
      const state = await getLocalStorageState(page);
      expect(state.highestStepReached).toBe(10);
    });

    test('should navigate back to wizard from output using different parameter labels', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Test navigating to step 6 via Business Model label — use evaluate for WebKit
      await page.evaluate(() => {
        (document.querySelector('.doc-meta-label--clickable[data-step-id="business-model"]') as HTMLElement)?.click();
      });
      await page.waitForFunction(() => {
        const wizard = document.querySelector('[data-testid="wizard-container"]');
        return wizard && window.getComputedStyle(wizard).display !== 'none';
      }, { timeout: 5000 });
      await expectWizardOnStep(page, 6);
      await verifyStepSelection(page, 'business-model', 'productized-platform');

      // Verify we can still use progress bar navigation
      await clickElement(page, '[data-testid="progress-segment-10"]');
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '10';
      }, { timeout: 5000 });
      await expectWizardOnStep(page, 10);
      await verifyStepSelection(page, 'operating-model', 'centralized-eng');
    });

    test('should have correct data-step-id attributes on all clickable labels', async ({ page }) => {
      await completeWizardAndGenerate(page, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
        geographies: ['us', 'eu'],
        businessModel: 'productized-platform',
        scaleIntensity: 'moderate',
        transformationState: 'stable',
        dataSensitivity: 'moderate',
        operatingModel: 'centralized-eng',
      });

      await expect(page.locator('[data-testid="output-container"]')).toBeVisible();

      // Verify all expected clickable labels exist with correct data-step-id
      const expectedStepIds = [
        'transaction-type',
        'product-type',
        'tech-archetype',
        'company-profile', // Headcount, Revenue, Growth Stage, Company Age all map here
        'geography',
        'business-model',
        'scale-intensity',
        'transformation-state',
        'data-sensitivity',
        'operating-model',
      ];

      for (const stepId of expectedStepIds) {
        const labels = page.locator(`.doc-meta-label--clickable[data-step-id="${stepId}"]`);
        const count = await labels.count();

        // company-profile step has 4 labels (headcount, revenue, growth, age)
        if (stepId === 'company-profile') {
          expect(count).toBe(4);
        } else {
          expect(count).toBeGreaterThanOrEqual(1);
        }

        // Verify all labels have clickable class
        for (let i = 0; i < count; i++) {
          const label = labels.nth(i);
          await expect(label).toHaveClass(/doc-meta-label--clickable/);
        }
      }
    });
  });

  test.describe('11. Edge Cases and Error Scenarios', () => {
    test('should prevent advancing without making selection', async ({ page }) => {
      // Next button should be disabled initially
      await expect(page.locator('[data-testid="btn-next"]')).toBeDisabled();

      // Try clicking it anyway (force)
      await page.locator('[data-testid="btn-next"]').click({ force: true });

      // Wait a moment
      await page.waitForTimeout(200);

      // Should still be on step 1
      await expectWizardOnStep(page, 1);
    });

    test('should require at least one geography selection', async ({ page }) => {
      // Manually navigate to step 5 (use clickElement for WebKit stability)
      await clickElement(page, '[data-testid="option-transaction-type-full-acquisition"]');
      await page.waitForTimeout(400);
      await clickElement(page, '[data-testid="option-product-type-b2b-saas"]');
      await page.waitForTimeout(400);
      await clickElement(page, '[data-testid="option-tech-archetype-modern-cloud-native"]');
      await page.waitForTimeout(400);

      // Complete compound step 4
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '4';
      });

      // Use clickElement for WebKit stability
      await clickElement(page, '[data-testid="compound-headcount-51-200"]');
      await clickElement(page, '[data-testid="compound-revenue-range-5-25m"]');
      await clickElement(page, '[data-testid="compound-growth-stage-scaling"]');
      await clickElement(page, '[data-testid="compound-company-age-2-5yr"]');
      await clickElement(page, '[data-testid="btn-next"]');

      // Now on step 5
      await expectWizardOnStep(page, 5);

      // Next button should be disabled (no geographies selected)
      await expect(page.locator('[data-testid="btn-next"]')).toBeDisabled();

      // Select and deselect a geography (use clickElement for WebKit)
      await clickElement(page, '[data-testid="option-geography-us"]');
      await expect(page.locator('[data-testid="btn-next"]')).toBeEnabled();

      await clickElement(page, '[data-testid="option-geography-us"]');
      await expect(page.locator('[data-testid="btn-next"]')).toBeDisabled();
    });

    test('should prevent advancing with incomplete compound step', async ({ page }) => {
      await completeWizardToStep(page, 4, {
        transactionType: 'full-acquisition',
        productType: 'b2b-saas',
        techArchetype: 'modern-cloud-native',
        headcount: '51-200',
        revenueRange: '5-25m',
        growthStage: 'scaling',
        companyAge: '2-5yr',
      });

      // Wait for step 4 to be active
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '4';
      });

      // Verify we're on step 4 initially but let's start fresh by going back to step 1
      // and manually selecting only to step 3 so step 4 is untouched (use clickElement for WebKit)
      await clickElement(page, '[data-testid="btn-back"]');
      await clickElement(page, '[data-testid="btn-back"]');
      await clickElement(page, '[data-testid="btn-back"]');

      // Now advance to step 4 with fresh state
      await clickElement(page, '[data-testid="option-transaction-type-full-acquisition"]');
      await page.waitForTimeout(400);
      await clickElement(page, '[data-testid="option-product-type-b2b-saas"]');
      await page.waitForTimeout(400);
      await clickElement(page, '[data-testid="option-tech-archetype-modern-cloud-native"]');
      await page.waitForTimeout(400);

      await expectWizardOnStep(page, 4);

      // Select only 2 of 4 fields (use clickElement for WebKit)
      await clickElement(page, '[data-testid="compound-headcount-51-200"]');
      await clickElement(page, '[data-testid="compound-revenue-range-5-25m"]');

      // Next should still be disabled
      await expect(page.locator('[data-testid="btn-next"]')).toBeDisabled();

      // Try forcing click
      await page.locator('[data-testid="btn-next"]').click({ force: true });
      await page.waitForTimeout(200);

      // Should still be on step 4
      await expectWizardOnStep(page, 4);
    });
  });
});
