/**
 * Diligence Machine wizard — progress-bar navigation and saved-state rules.
 *
 * Exercises the real rules the page script applies
 * (`src/scripts/diligence-machine/logic.ts`, ADR-0042): which step a
 * navigation lands on and how far the high-water mark rises, how each progress
 * indicator renders (active / completed / reachable), which indicators can be
 * clicked, and how saved state is read back.
 *
 * This file used to drive a hand-written `WizardNavigationSimulator` that
 * copied the page's inline script, because nothing in an `.astro` script could
 * be imported. The copy had drifted: it saved and restored version-2 state,
 * which the page has rejected since STORAGE_VERSION became 3. Testing the
 * module the page imports closes that gap for good. The DOM wiring (buttons,
 * class toggles, localStorage calls) stays covered by
 * `tests/e2e/diligence-machine.test.ts`.
 */
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  canNavigateTo,
  navigate,
  parseSavedState,
  stepState,
  type SavedState,
  type WizardPosition,
} from '../../src/scripts/diligence-machine/logic';

const TOTAL_STEPS = 10;
const START: WizardPosition = { currentStep: 1, highestStepReached: 1 };

/** The page's Next and Back buttons: bounded moves through `navigate`. */
const next = (p: WizardPosition) =>
  p.currentStep < TOTAL_STEPS ? navigate(p, p.currentStep + 1) : p;
const back = (p: WizardPosition) => (p.currentStep > 1 ? navigate(p, p.currentStep - 1) : p);
/** A click on a progress segment or mobile dot. */
const click = (p: WizardPosition, step: number) => (canNavigateTo(step, p) ? navigate(p, step) : p);

const walk = (steps: number, from: WizardPosition = START) => {
  let p = from;
  for (let i = 0; i < steps; i++) p = next(p);
  return p;
};

const states = (p: WizardPosition) =>
  Array.from({ length: TOTAL_STEPS }, (_, i) => stepState(i + 1, p));

describe('Diligence Machine wizard navigation', () => {
  describe('initial state', () => {
    it('starts on step 1 with nothing ahead reachable', () => {
      expect(states(START)).toEqual(['active', ...Array(TOTAL_STEPS - 1).fill(null)]);
    });
  });

  describe('Next and Back', () => {
    it('Next advances one step and raises the high-water mark', () => {
      expect(next(START)).toEqual({ currentStep: 2, highestStepReached: 2 });
    });

    it('walks every step and stops at the last', () => {
      const end = walk(TOTAL_STEPS + 3);
      expect(end).toEqual({ currentStep: TOTAL_STEPS, highestStepReached: TOTAL_STEPS });
    });

    it('Back keeps the high-water mark and does nothing on step 1', () => {
      const p = back(walk(4)); // at 5, back to 4
      expect(p).toEqual({ currentStep: 4, highestStepReached: 5 });
      expect(back(START)).toEqual(START);
    });
  });

  describe('progress indicator states', () => {
    it('marks steps behind as completed, the current as active, reached steps ahead as reachable', () => {
      const p = { currentStep: 3, highestStepReached: 6 };
      expect(states(p)).toEqual([
        'completed',
        'completed',
        'active',
        'reachable',
        'reachable',
        'reachable',
        null,
        null,
        null,
        null,
      ]);
    });

    it('never marks a completed step as reachable', () => {
      const p = { currentStep: 5, highestStepReached: 8 };
      for (let s = 1; s < 5; s++) expect(stepState(s, p)).toBe('completed');
    });

    it('clears reachable once the wizard advances past it', () => {
      const p = next(next(next({ currentStep: 3, highestStepReached: 6 }))); // to 6
      expect(stepState(4, p)).toBe('completed');
      expect(stepState(5, p)).toBe('completed');
      expect(stepState(7, p)).toBeNull();
    });
  });

  describe('segment and dot clicks', () => {
    const p = { currentStep: 4, highestStepReached: 7 };

    it('can jump back to any completed step', () => {
      for (let s = 1; s < 4; s++) expect(canNavigateTo(s, p)).toBe(true);
      expect(click(p, 2)).toEqual({ currentStep: 2, highestStepReached: 7 });
    });

    it('can jump forward to any previously reached step, several at once', () => {
      expect(canNavigateTo(7, p)).toBe(true);
      expect(click(p, 7)).toEqual({ currentStep: 7, highestStepReached: 7 });
    });

    it('ignores the current step and anything beyond the high-water mark', () => {
      expect(canNavigateTo(4, p)).toBe(false);
      expect(canNavigateTo(8, p)).toBe(false);
      expect(click(p, 8)).toEqual(p);
    });

    it('a jump inside the reached range does not move the high-water mark', () => {
      expect(click(click(p, 1), 6).highestStepReached).toBe(7);
    });
  });

  describe('saved state', () => {
    const saved: SavedState = {
      version: STORAGE_VERSION,
      currentStep: 3,
      highestStepReached: 6,
      inputs: {},
      targetIdentifier: 'Target',
    };

    it('reads back a state saved under the current version', () => {
      expect(parseSavedState(JSON.stringify(saved))).toEqual(saved);
    });

    it('a restored position can jump forward to its high-water mark', () => {
      const restored = parseSavedState(JSON.stringify(saved))!;
      expect(click(restored, 6).currentStep).toBe(6);
      expect(canNavigateTo(7, restored)).toBe(false);
    });

    it('restores a missing high-water mark as the saved step', () => {
      const { highestStepReached: _omitted, ...withoutMark } = saved;
      const restored = parseSavedState(JSON.stringify(withoutMark))!;
      expect(restored.highestStepReached).toBe(3);
      expect(canNavigateTo(4, restored)).toBe(false);
      expect(canNavigateTo(2, restored)).toBe(true);
    });

    it('starts fresh on another version, malformed JSON, or nothing saved', () => {
      expect(parseSavedState(JSON.stringify({ ...saved, version: 2 }))).toBeNull();
      expect(parseSavedState('{not json')).toBeNull();
      expect(parseSavedState('null')).toBeNull();
      expect(parseSavedState(null)).toBeNull();
    });

    it('keeps the storage key the page has always used', () => {
      // A renamed key silently orphans every visitor's saved wizard.
      expect(STORAGE_KEY).toBe('diligence-machine-state');
    });
  });
});
