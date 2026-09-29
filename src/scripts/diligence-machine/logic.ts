/**
 * Diligence Machine — the wizard's DOM-free navigation and persistence rules
 * (ADR-0042).
 *
 * The script generation itself lives in `src/utils/diligence-engine.ts`; this
 * file holds the rules the page script applies to steps and saved state, so
 * the progress bar's behaviour is testable without a DOM. Tested by
 * `tests/integration/diligence-wizard-navigation.test.ts`.
 */
import type { UserInputs } from '../../utils/diligence-engine';

export const STORAGE_KEY = 'diligence-machine-state';
export const STORAGE_VERSION = 3;

export interface SavedState {
  version: number;
  currentStep: number;
  highestStepReached: number;
  inputs: Partial<UserInputs>;
  targetIdentifier?: string;
  dismissedAttention?: string[];
  dismissedQuestions?: string[];
  collapsedAttention?: string[];
  collapsedQuestions?: string[];
}

export interface WizardPosition {
  currentStep: number;
  highestStepReached: number;
}

/** Moving to a step makes it current and raises the high-water mark. */
export function navigate(position: WizardPosition, step: number): WizardPosition {
  return {
    currentStep: step,
    highestStepReached: Math.max(position.highestStepReached, step),
  };
}

/**
 * How a progress indicator (desktop segment or mobile dot) for `step` renders:
 * the current step, a completed one behind it, or a step ahead of it that was
 * already reached and can be jumped back to.
 */
export type StepState = 'active' | 'completed' | 'reachable' | null;

export function stepState(step: number, position: WizardPosition): StepState {
  if (step === position.currentStep) return 'active';
  if (step < position.currentStep) return 'completed';
  if (step <= position.highestStepReached) return 'reachable';
  return null;
}

/** A progress indicator navigates to any reached step other than the current one. */
export function canNavigateTo(step: number, position: WizardPosition): boolean {
  return step !== position.currentStep && step <= position.highestStepReached;
}

/**
 * Read a saved wizard from storage. Anything unparseable, or written under a
 * different `STORAGE_VERSION`, reads as "nothing saved" so the wizard starts
 * fresh rather than restoring a shape it no longer understands. A state with
 * no high-water mark restores it as the saved step, so the wizard never
 * reopens with its current step beyond its reachable range.
 */
export function parseSavedState(raw: string | null): SavedState | null {
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as SavedState;
    if (state?.version !== STORAGE_VERSION) return null;
    return { ...state, highestStepReached: state.highestStepReached ?? state.currentStep };
  } catch {
    return null;
  }
}
