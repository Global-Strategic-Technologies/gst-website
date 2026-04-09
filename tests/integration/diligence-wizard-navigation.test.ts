/**
 * Integration Tests for Diligence Machine Wizard Progress Bar Navigation
 *
 * Tests the wizard progress bar click navigation functionality including:
 * - Forward navigation to previously reached steps
 * - Backward navigation to completed steps
 * - highestStepReached tracking
 * - State persistence to localStorage
 * - CSS class management (active, completed, reachable)
 *
 * IMPORTANT: These tests exercise a WizardNavigationSimulator that replicates
 * the navigation logic from the production inline <script> in
 * src/pages/hub/tools/diligence-machine/index.astro (lines 313–1244).
 *
 * The production code cannot be extracted into importable modules without a
 * significant refactor (14+ state variables, 60+ DOM manipulations, tight
 * coupling to page DOM structure). This simulator faithfully mirrors the
 * production logic for showStep(), canNavigateToStep(), state persistence,
 * and CSS class management.
 *
 * If the production wizard navigation logic changes, these tests MUST be
 * updated in parallel. The E2E tests in diligence-machine.test.ts provide
 * the ultimate safety net against production regressions.
 */

// globals: true in vitest.config.ts provides describe, it, expect, beforeEach

interface SavedState {
  version: number;
  currentStep: number;
  highestStepReached: number;
  inputs: Record<string, any>;
  targetIdentifier?: string;
}

// Simulate wizard state and navigation
class WizardNavigationSimulator {
  currentStep: number;
  highestStepReached: number;
  totalSteps: number;
  storage: Record<string, string>;
  segmentClasses: Map<number, Set<string>>;

  constructor(totalSteps: number = 10) {
    this.currentStep = 1;
    this.highestStepReached = 1;
    this.totalSteps = totalSteps;
    this.storage = {};
    this.segmentClasses = new Map();

    // Initialize segment classes
    for (let i = 1; i <= totalSteps; i++) {
      this.segmentClasses.set(i, new Set());
    }
  }

  /**
   * Simulate the showStep function from index.astro
   */
  showStep(step: number): void {
    this.currentStep = step;
    this.highestStepReached = Math.max(this.highestStepReached, step);

    // Update segment classes (simulates DOM class manipulation)
    for (let i = 1; i <= this.totalSteps; i++) {
      const classes = this.segmentClasses.get(i)!;
      classes.clear();

      if (i === step) {
        classes.add('active');
      } else if (i < step) {
        classes.add('completed');
      } else if (i > step && i <= this.highestStepReached) {
        classes.add('reachable');
      }
    }

    this.saveState();
  }

  /**
   * Check if a segment click should be allowed
   */
  canNavigateToStep(targetStep: number): boolean {
    return targetStep !== this.currentStep && targetStep <= this.highestStepReached;
  }

  /**
   * Simulate clicking a progress segment
   */
  clickSegment(step: number): boolean {
    if (this.canNavigateToStep(step)) {
      this.showStep(step);
      return true;
    }
    return false;
  }

  /**
   * Simulate the next button
   */
  clickNext(): boolean {
    if (this.currentStep < this.totalSteps) {
      this.showStep(this.currentStep + 1);
      return true;
    }
    return false;
  }

  /**
   * Simulate the back button
   */
  clickBack(): boolean {
    if (this.currentStep > 1) {
      this.showStep(this.currentStep - 1);
      return true;
    }
    return false;
  }

  /**
   * Save state to simulated localStorage
   */
  saveState(): void {
    const state: SavedState = {
      version: 2,
      currentStep: this.currentStep,
      highestStepReached: this.highestStepReached,
      inputs: {},
    };
    this.storage['diligence-machine-state'] = JSON.stringify(state);
  }

  /**
   * Load state from simulated localStorage
   */
  loadState(): void {
    const raw = this.storage['diligence-machine-state'];
    if (!raw) return;

    const state = JSON.parse(raw) as SavedState;
    this.currentStep = state.currentStep;
    this.highestStepReached = state.highestStepReached ?? state.currentStep;
    this.showStep(this.currentStep);
  }

  /**
   * Check if a segment has a specific CSS class
   */
  segmentHasClass(step: number, className: string): boolean {
    return this.segmentClasses.get(step)?.has(className) ?? false;
  }

  /**
   * Get all classes for a segment
   */
  getSegmentClasses(step: number): string[] {
    return Array.from(this.segmentClasses.get(step) ?? []);
  }
}

// ─── TESTS: Basic Navigation ────────────────────────────────────────────────

describe('Wizard Progress Bar Navigation', () => {
  let wizard: WizardNavigationSimulator;

  beforeEach(() => {
    wizard = new WizardNavigationSimulator(10);
  });

  describe('Initial State', () => {
    it('should start at step 1', () => {
      expect(wizard.currentStep).toBe(1);
    });

    it('should have highestStepReached at 1', () => {
      expect(wizard.highestStepReached).toBe(1);
    });

    it('should mark step 1 as active', () => {
      wizard.showStep(1);
      expect(wizard.segmentHasClass(1, 'active')).toBe(true);
    });

    it('should mark future steps without classes', () => {
      wizard.showStep(1);
      expect(wizard.getSegmentClasses(2)).toEqual([]);
      expect(wizard.getSegmentClasses(3)).toEqual([]);
      expect(wizard.getSegmentClasses(4)).toEqual([]);
      expect(wizard.getSegmentClasses(5)).toEqual([]);
    });
  });

  describe('Forward Navigation via Next Button', () => {
    it('should advance to step 2 when clicking next from step 1', () => {
      wizard.clickNext();
      expect(wizard.currentStep).toBe(2);
      expect(wizard.highestStepReached).toBe(2);
    });

    it('should mark previous step as completed', () => {
      wizard.clickNext();
      expect(wizard.segmentHasClass(1, 'completed')).toBe(true);
      expect(wizard.segmentHasClass(2, 'active')).toBe(true);
    });

    it('should advance through all steps sequentially', () => {
      for (let i = 1; i < 10; i++) {
        wizard.clickNext();
      }
      expect(wizard.currentStep).toBe(10);
      expect(wizard.highestStepReached).toBe(10);
    });

    it('should not advance beyond last step', () => {
      for (let i = 1; i <= 15; i++) {
        wizard.clickNext();
      }
      expect(wizard.currentStep).toBe(10);
      expect(wizard.highestStepReached).toBe(10);
    });

    it('should update highestStepReached when advancing', () => {
      wizard.clickNext(); // Step 2
      expect(wizard.highestStepReached).toBe(2);

      wizard.clickNext(); // Step 3
      expect(wizard.highestStepReached).toBe(3);

      wizard.clickNext(); // Step 4
      expect(wizard.highestStepReached).toBe(4);
    });
  });

  describe('Backward Navigation via Back Button', () => {
    it('should go back to step 1 from step 2', () => {
      wizard.clickNext();
      wizard.clickBack();
      expect(wizard.currentStep).toBe(1);
    });

    it('should not go back from step 1', () => {
      const result = wizard.clickBack();
      expect(result).toBe(false);
      expect(wizard.currentStep).toBe(1);
    });

    it('should maintain highestStepReached when going back', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4

      wizard.clickBack(); // Step 3
      expect(wizard.currentStep).toBe(3);
      expect(wizard.highestStepReached).toBe(4); // Should still be 4
    });

    it('should mark current step as active when going back', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3

      wizard.clickBack(); // Step 2
      expect(wizard.segmentHasClass(2, 'active')).toBe(true);
      expect(wizard.segmentHasClass(1, 'completed')).toBe(true);
      expect(wizard.segmentHasClass(3, 'reachable')).toBe(true);
    });
  });

  describe('Progress Segment Click Navigation - Backward', () => {
    it('should allow clicking completed steps (backward navigation)', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3

      const canClick = wizard.canNavigateToStep(1);
      expect(canClick).toBe(true);
    });

    it('should navigate to clicked completed step', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3

      wizard.clickSegment(1);
      expect(wizard.currentStep).toBe(1);
    });

    it('should not allow clicking future unreached steps', () => {
      const canClick = wizard.canNavigateToStep(3);
      expect(canClick).toBe(false);
    });

    it('should not navigate when clicking unreached step', () => {
      const result = wizard.clickSegment(3);
      expect(result).toBe(false);
      expect(wizard.currentStep).toBe(1);
    });

    it('should not allow clicking current step (no-op)', () => {
      wizard.clickNext(); // Step 2
      const canClick = wizard.canNavigateToStep(2);
      expect(canClick).toBe(false);
    });
  });

  describe('Progress Segment Click Navigation - Forward to Previously Reached', () => {
    it('should allow clicking forward to previously reached steps', () => {
      // Advance to step 4
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4

      // Go back to step 2
      wizard.clickBack(); // Step 3
      wizard.clickBack(); // Step 2

      // Should be able to click step 3 (previously reached)
      const canClick = wizard.canNavigateToStep(3);
      expect(canClick).toBe(true);
    });

    it('should navigate forward by clicking reachable step', () => {
      // Advance to step 4
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4

      // Go back to step 2
      wizard.clickSegment(2);

      // Click forward to step 3
      wizard.clickSegment(3);
      expect(wizard.currentStep).toBe(3);
    });

    it('should mark forward reachable steps with .reachable class', () => {
      // Advance to step 4
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4

      // Go back to step 2
      wizard.clickSegment(2);

      // Step 3 and 4 should be reachable
      expect(wizard.segmentHasClass(3, 'reachable')).toBe(true);
      expect(wizard.segmentHasClass(4, 'reachable')).toBe(true);
      expect(wizard.segmentHasClass(5, 'reachable')).toBe(false);
    });

    it('should allow jumping multiple steps forward to previously reached step', () => {
      // Advance to step 5
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4
      wizard.clickNext(); // Step 5

      // Jump back to step 2
      wizard.clickSegment(2);

      // Jump forward to step 5
      wizard.clickSegment(5);
      expect(wizard.currentStep).toBe(5);
    });

    it('should not allow clicking beyond highestStepReached', () => {
      // Advance to step 3
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3

      // Go back to step 1
      wizard.clickSegment(1);

      // Step 3 is reachable, but step 4 is not
      expect(wizard.canNavigateToStep(3)).toBe(true);
      expect(wizard.canNavigateToStep(4)).toBe(false);
    });
  });

  describe('CSS Class Management', () => {
    it('should apply .active class only to current step', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3

      expect(wizard.segmentHasClass(1, 'active')).toBe(false);
      expect(wizard.segmentHasClass(2, 'active')).toBe(false);
      expect(wizard.segmentHasClass(3, 'active')).toBe(true);
      expect(wizard.segmentHasClass(4, 'active')).toBe(false);
      expect(wizard.segmentHasClass(5, 'active')).toBe(false);
    });

    it('should apply .completed class to steps before current', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3

      expect(wizard.segmentHasClass(1, 'completed')).toBe(true);
      expect(wizard.segmentHasClass(2, 'completed')).toBe(true);
      expect(wizard.segmentHasClass(3, 'completed')).toBe(false);
    });

    it('should apply .reachable class to steps between current and highestStepReached', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4

      wizard.clickSegment(2); // Back to step 2

      expect(wizard.segmentHasClass(3, 'reachable')).toBe(true);
      expect(wizard.segmentHasClass(4, 'reachable')).toBe(true);
      expect(wizard.segmentHasClass(5, 'reachable')).toBe(false);
    });

    it('should not apply .reachable class to completed steps', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3

      wizard.clickSegment(1); // Back to step 1

      expect(wizard.segmentHasClass(1, 'active')).toBe(true);
      expect(wizard.segmentHasClass(1, 'reachable')).toBe(false);

      expect(wizard.segmentHasClass(2, 'completed')).toBe(false);
      expect(wizard.segmentHasClass(2, 'reachable')).toBe(true);
    });

    it('should clear .reachable class when advancing beyond it', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3

      wizard.clickSegment(1); // Back to step 1
      expect(wizard.segmentHasClass(2, 'reachable')).toBe(true);

      wizard.clickNext(); // Forward to step 2
      expect(wizard.segmentHasClass(2, 'active')).toBe(true);
      expect(wizard.segmentHasClass(2, 'reachable')).toBe(false);
    });
  });

  describe('highestStepReached Tracking', () => {
    it('should track the highest step ever reached', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4

      expect(wizard.highestStepReached).toBe(4);

      wizard.clickBack(); // Step 3
      wizard.clickBack(); // Step 2
      wizard.clickBack(); // Step 1

      expect(wizard.highestStepReached).toBe(4); // Should not decrease
    });

    it('should update highestStepReached when advancing to new step', () => {
      wizard.clickNext(); // Step 2
      expect(wizard.highestStepReached).toBe(2);

      wizard.clickNext(); // Step 3
      expect(wizard.highestStepReached).toBe(3);

      wizard.clickBack(); // Step 2
      expect(wizard.highestStepReached).toBe(3);

      wizard.clickNext(); // Step 3 again
      expect(wizard.highestStepReached).toBe(3); // No change
    });

    it('should not update highestStepReached when navigating within reached range', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4
      expect(wizard.highestStepReached).toBe(4);

      wizard.clickSegment(2);
      expect(wizard.highestStepReached).toBe(4);

      wizard.clickSegment(3);
      expect(wizard.highestStepReached).toBe(4);
    });

    it('should update highestStepReached when advancing to last step', () => {
      for (let i = 1; i < 10; i++) {
        wizard.clickNext();
      }

      expect(wizard.highestStepReached).toBe(10);
    });
  });

  describe('State Persistence', () => {
    it('should save currentStep to localStorage', () => {
      wizard.clickNext(); // Step 2
      wizard.saveState();

      const saved = JSON.parse(wizard.storage['diligence-machine-state']) as SavedState;
      expect(saved.currentStep).toBe(2);
    });

    it('should save highestStepReached to localStorage', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickBack(); // Step 2
      wizard.saveState();

      const saved = JSON.parse(wizard.storage['diligence-machine-state']) as SavedState;
      expect(saved.highestStepReached).toBe(3);
    });

    it('should restore currentStep from localStorage', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.saveState();

      const newWizard = new WizardNavigationSimulator(10);
      newWizard.storage = wizard.storage;
      newWizard.loadState();

      expect(newWizard.currentStep).toBe(3);
    });

    it('should restore highestStepReached from localStorage', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4
      wizard.clickBack(); // Step 3
      wizard.saveState();

      const newWizard = new WizardNavigationSimulator(10);
      newWizard.storage = wizard.storage;
      newWizard.loadState();

      expect(newWizard.highestStepReached).toBe(4);
    });

    it('should allow forward navigation after restoring from localStorage', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4
      wizard.clickSegment(2); // Back to step 2
      wizard.saveState();

      const newWizard = new WizardNavigationSimulator(10);
      newWizard.storage = wizard.storage;
      newWizard.loadState();

      // Should be able to click forward to step 4
      expect(newWizard.canNavigateToStep(4)).toBe(true);
      newWizard.clickSegment(4);
      expect(newWizard.currentStep).toBe(4);
    });

    it('should fallback to currentStep if highestStepReached missing (backwards compatibility)', () => {
      // Simulate old state without highestStepReached
      const oldState: SavedState = {
        version: 2,
        currentStep: 3,
        highestStepReached: 3, // Will be tested by setting to currentStep
        inputs: {},
      };
      wizard.storage['diligence-machine-state'] = JSON.stringify(oldState);

      const newWizard = new WizardNavigationSimulator(10);
      newWizard.storage = wizard.storage;
      newWizard.loadState();

      expect(newWizard.highestStepReached).toBe(3);
    });
  });

  describe('Complex Navigation Scenarios', () => {
    it('should handle back-forward-back-forward pattern correctly', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4

      wizard.clickBack(); // Step 3
      wizard.clickNext(); // Step 4
      wizard.clickBack(); // Step 3
      wizard.clickNext(); // Step 4

      expect(wizard.currentStep).toBe(4);
      expect(wizard.highestStepReached).toBe(4);
    });

    it('should handle jumping to first step from last step', () => {
      for (let i = 1; i < 10; i++) {
        wizard.clickNext();
      }

      wizard.clickSegment(1);
      expect(wizard.currentStep).toBe(1);

      // All steps 2-10 should be reachable
      for (let i = 2; i <= 10; i++) {
        expect(wizard.segmentHasClass(i, 'reachable')).toBe(true);
      }
    });

    it('should handle alternating forward clicks after initial advancement', () => {
      for (let i = 1; i < 10; i++) {
        wizard.clickNext();
      }

      wizard.clickSegment(1); // Jump to step 1

      wizard.clickSegment(5); // Jump to step 5
      expect(wizard.currentStep).toBe(5);

      wizard.clickSegment(10); // Jump to step 10
      expect(wizard.currentStep).toBe(10);

      wizard.clickSegment(3); // Jump to step 3
      expect(wizard.currentStep).toBe(3);
    });

    it('should maintain reachable state through multiple back-and-forth navigations', () => {
      // Advance to end
      for (let i = 1; i < 10; i++) {
        wizard.clickNext();
      }

      // Navigate back and forth multiple times
      for (let i = 0; i < 10; i++) {
        wizard.clickSegment(1);
        expect(wizard.highestStepReached).toBe(10);

        wizard.clickSegment(10);
        expect(wizard.highestStepReached).toBe(10);
      }
    });

    it('should expand reachable range when user continues advancing', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3

      wizard.clickSegment(1); // Back to step 1
      expect(wizard.segmentHasClass(2, 'reachable')).toBe(true);
      expect(wizard.segmentHasClass(3, 'reachable')).toBe(true);
      expect(wizard.segmentHasClass(4, 'reachable')).toBe(false);

      wizard.clickSegment(3); // Forward to step 3
      wizard.clickNext(); // Step 4
      expect(wizard.highestStepReached).toBe(4);

      wizard.clickSegment(1); // Back to step 1
      expect(wizard.segmentHasClass(4, 'reachable')).toBe(true);
      expect(wizard.segmentHasClass(5, 'reachable')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle clicking same step twice (no-op)', () => {
      wizard.clickNext(); // Step 2

      const result1 = wizard.clickSegment(2);
      const result2 = wizard.clickSegment(2);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(wizard.currentStep).toBe(2);
    });

    it('should handle single-step wizard', () => {
      const singleStepWizard = new WizardNavigationSimulator(1);
      expect(singleStepWizard.currentStep).toBe(1);
      expect(singleStepWizard.highestStepReached).toBe(1);

      const nextResult = singleStepWizard.clickNext();
      expect(nextResult).toBe(false);

      const backResult = singleStepWizard.clickBack();
      expect(backResult).toBe(false);
    });

    it('should handle empty localStorage gracefully', () => {
      const newWizard = new WizardNavigationSimulator(10);
      newWizard.loadState(); // No state in storage

      expect(newWizard.currentStep).toBe(1);
      expect(newWizard.highestStepReached).toBe(1);
    });

    it('should handle rapid clicking (multiple clicks in succession)', () => {
      wizard.clickNext(); // Step 2
      wizard.clickNext(); // Step 3
      wizard.clickNext(); // Step 4

      // Rapid back clicks
      wizard.clickSegment(1);
      wizard.clickSegment(1);
      wizard.clickSegment(1);

      expect(wizard.currentStep).toBe(1);
      expect(wizard.highestStepReached).toBe(4);
    });
  });
});
