import { Page, expect } from '@playwright/test';
import type { UserInputs } from '../../../src/utils/diligence-engine';

/**
 * WebKit-safe click helper
 * Uses page.evaluate() to bypass WebKit's strict element stability requirements
 */
export async function clickElement(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) {
      throw new Error(`Element not found: ${sel}`);
    }
    (element as HTMLElement).click();
  }, selector);
}

/**
 * Wait for the Diligence Machine wizard to be fully initialized and ready
 */
export async function waitForWizardReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('[data-testid="wizard-container"]')).toBeVisible();
}

/**
 * Get the current state from localStorage
 */
export async function getLocalStorageState(page: Page): Promise<any> {
  return await page.evaluate(() => {
    const raw = localStorage.getItem('diligence-machine-state');
    return raw ? JSON.parse(raw) : null;
  });
}

/**
 * Clear localStorage state
 */
export async function clearLocalStorageState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('diligence-machine-state');
  });
}

/**
 * Verify that a specific option is selected with proper DOM state
 */
export async function verifyStepSelection(
  page: Page,
  stepId: string,
  optionId: string
): Promise<void> {
  const card = page.locator(`[data-testid="option-${stepId}-${optionId}"]`);
  await expect(card).toHaveClass(/selected/);
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Verify that a compound field option is selected
 */
export async function verifyCompoundSelection(
  page: Page,
  fieldId: string,
  optionId: string
): Promise<void> {
  const card = page.locator(`[data-testid="compound-${fieldId}-${optionId}"]`);
  await expect(card).toHaveClass(/selected/);
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Verify that output contains at least minCount questions
 */
export async function verifyOutputHasQuestions(
  page: Page,
  minCount: number
): Promise<void> {
  const questions = page.locator('.doc-question');
  const count = await questions.count();
  expect(count).toBeGreaterThanOrEqual(minCount);
}

/**
 * Complete wizard to a specific step with given inputs
 * Handles auto-advance for single-select steps and manual navigation for compound/multi-select
 */
export async function completeWizardToStep(
  page: Page,
  targetStep: number,
  inputs: Partial<UserInputs>
): Promise<void> {
  // Step mapping for single-select steps
  const stepMap: Record<number, { stepId: string; key: keyof UserInputs }> = {
    1: { stepId: 'transaction-type', key: 'transactionType' },
    2: { stepId: 'product-type', key: 'productType' },
    3: { stepId: 'tech-archetype', key: 'techArchetype' },
    6: { stepId: 'business-model', key: 'businessModel' },
    7: { stepId: 'scale-intensity', key: 'scaleIntensity' },
    8: { stepId: 'transformation-state', key: 'transformationState' },
    9: { stepId: 'data-sensitivity', key: 'dataSensitivity' },
    10: { stepId: 'operating-model', key: 'operatingModel' },
  };

  for (let step = 1; step < targetStep; step++) {
    // Single-select steps (auto-advance)
    if (stepMap[step]) {
      const { stepId, key } = stepMap[step];
      const value = inputs[key] as string;

      if (!value) {
        throw new Error(`Missing input for step ${step}: ${key}`);
      }

      // Use evaluate() for WebKit stability (avoids "not stable" issues)
      await page.evaluate(([stepId, value]) => {
        const element = document.querySelector(`[data-testid="option-${stepId}-${value}"]`);
        if (element) (element as HTMLElement).click();
      }, [stepId, value]);

      // Wait for auto-advance to complete (300ms setTimeout in source)
      await page.waitForFunction((expectedStep) => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === String(expectedStep);
      }, step + 1, { timeout: 5000 });
    }

    // Compound step (step 4)
    else if (step === 4) {
      // Wait for step 4 to be active (after auto-advance from step 3)
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '4';
      }, { timeout: 2000 });

      if (!inputs.headcount || !inputs.revenueRange || !inputs.growthStage || !inputs.companyAge) {
        throw new Error('Missing compound step inputs: need headcount, revenueRange, growthStage, companyAge');
      }

      // Select all 4 fields (use evaluate for WebKit stability)
      await page.evaluate((inputs) => {
        const headcount = document.querySelector(`[data-testid="compound-headcount-${inputs.headcount}"]`);
        const revenue = document.querySelector(`[data-testid="compound-revenue-range-${inputs.revenueRange}"]`);
        const growth = document.querySelector(`[data-testid="compound-growth-stage-${inputs.growthStage}"]`);
        const age = document.querySelector(`[data-testid="compound-company-age-${inputs.companyAge}"]`);
        if (headcount) (headcount as HTMLElement).click();
        if (revenue) (revenue as HTMLElement).click();
        if (growth) (growth as HTMLElement).click();
        if (age) (age as HTMLElement).click();
      }, {
        headcount: inputs.headcount,
        revenueRange: inputs.revenueRange,
        growthStage: inputs.growthStage,
        companyAge: inputs.companyAge
      } as any);
      // Wait for state updates — btn-next becomes enabled
      await expect(page.locator('[data-testid="btn-next"]')).toBeEnabled({ timeout: 3000 });
      await page.locator('[data-testid="btn-next"]').click();

      // Wait for step 5
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '5';
      }, { timeout: 2000 });
    }

    // Multi-select geography (step 5)
    else if (step === 5) {
      // Wait for step 5 to be active
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '5';
      }, { timeout: 2000 });

      if (!inputs.geographies || inputs.geographies.length === 0) {
        throw new Error('Missing geographies input for step 5');
      }

      // Select each geography (skip multi-region if it will be auto-added)
      // Use evaluate() for WebKit stability
      const geosToSelect = inputs.geographies.filter(geo => {
        // Skip multi-region if we have 2+ other regions (it will be auto-added)
        return !(geo === 'multi-region' && inputs.geographies.length > 2);
      });

      await page.evaluate((geos) => {
        geos.forEach(geo => {
          const element = document.querySelector(`[data-testid="option-geography-${geo}"]`);
          if (element) (element as HTMLElement).click();
        });
      }, geosToSelect);
      // Wait for all clicks to process — btn-next becomes enabled
      await expect(page.locator('[data-testid="btn-next"]')).toBeEnabled({ timeout: 3000 });
      await page.evaluate(() => {
        const element = document.querySelector('[data-testid="btn-next"]');
        if (element) (element as HTMLElement).click();
      });

      // Wait for next step
      await page.waitForFunction(() => {
        const activeStep = document.querySelector('.wizard-step.active');
        return activeStep?.getAttribute('data-step') === '6';
      }, { timeout: 2000 });
    }
  }
}

/**
 * Complete entire wizard and generate output
 * This is a convenience wrapper around completeWizardToStep + final step + generate
 */
export async function completeWizardAndGenerate(
  page: Page,
  inputs: Required<UserInputs>
): Promise<void> {
  // Complete steps 1-9
  await completeWizardToStep(page, 10, inputs);

  // Verify we're on step 10
  await page.waitForFunction(() => {
    const activeStep = document.querySelector('.wizard-step.active');
    return activeStep?.getAttribute('data-step') === '10';
  }, { timeout: 2000 });

  // Select final step option (operating-model) - use evaluate for WebKit
  await page.evaluate((operatingModel) => {
    const element = document.querySelector(`[data-testid="option-operating-model-${operatingModel}"]`);
    if (element) (element as HTMLElement).click();
  }, inputs.operatingModel);

  // Wait for auto-advance — generate button becomes enabled
  await expect(page.locator('[data-testid="btn-generate"]')).toBeEnabled({ timeout: 5000 });

  // Click Generate — retry if first click doesn't trigger transition
  // (Chromium can occasionally miss evaluate-based clicks under load)
  await page.evaluate(() => {
    const element = document.querySelector('[data-testid="btn-generate"]');
    if (element) (element as HTMLElement).click();
  });

  // If wizard is still visible after 1s, click again
  const wizardStillVisible = await page.waitForFunction(() => {
    const wizard = document.querySelector('[data-testid="wizard-container"]');
    return wizard && window.getComputedStyle(wizard).display === 'none';
  }, { timeout: 1500 }).then(() => false).catch(() => true);

  if (wizardStillVisible) {
    await page.evaluate(() => {
      const element = document.querySelector('[data-testid="btn-generate"]');
      if (element) (element as HTMLElement).click();
    });
  }

  // Wait for wizard to hide
  await page.waitForFunction(() => {
    const wizard = document.querySelector('[data-testid="wizard-container"]');
    return wizard && window.getComputedStyle(wizard).display === 'none';
  }, { timeout: 5000 });

  // Wait for output to appear
  await page.waitForFunction(() => {
    const output = document.querySelector('[data-testid="output-container"]');
    return output && window.getComputedStyle(output).display !== 'none';
  }, { timeout: 5000 });
}

/**
 * Get the number of questions in the output
 */
export async function getQuestionCount(page: Page): Promise<number> {
  const questions = page.locator('.doc-question');
  return await questions.count();
}

/**
 * Get the number of attention areas in the output
 */
export async function getAttentionAreaCount(page: Page): Promise<number> {
  const anchors = page.locator('.doc-attention-card');
  return await anchors.count();
}

/**
 * Verify the wizard is on a specific step
 */
export async function expectWizardOnStep(page: Page, stepNumber: number): Promise<void> {
  const activeStep = page.locator('.wizard-step.active');
  await expect(activeStep).toBeVisible();
  expect(await activeStep.getAttribute('data-step')).toBe(String(stepNumber));
}

/**
 * Verify a progress segment has a specific state
 */
export async function expectProgressSegmentState(
  page: Page,
  segmentNumber: number,
  state: 'active' | 'completed' | 'reachable' | 'unreached'
): Promise<void> {
  const segment = page.locator(`[data-testid="progress-segment-${segmentNumber}"]`);
  await expect(segment).toBeVisible();

  switch (state) {
    case 'active':
      await expect(segment).toHaveClass(/active/);
      break;
    case 'completed':
      await expect(segment).toHaveClass(/completed/);
      break;
    case 'reachable':
      await expect(segment).toHaveClass(/reachable/);
      break;
    case 'unreached':
      await expect(segment).not.toHaveClass(/active|completed|reachable/);
      break;
  }
}
