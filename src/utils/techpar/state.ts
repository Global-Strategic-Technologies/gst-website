/**
 * TechPar UI — shared mutable state and state operations.
 *
 * All module-level state lives here as a single exported object so that
 * dom.ts and chart.ts can read/write without circular imports.
 */
import { Chart } from 'chart.js';
import type { TechParInputs, TechParResult, HistoricalPoint } from '../techpar-engine';
import type { Industry } from '../../data/techpar/industry-notes';

// ─── Shared mutable state ─────────────────────────────────
export interface SavedScenario {
  name: string;
  inputs: TechParInputs;
  result: TechParResult;
}

export const MAX_HISTORICAL = 2;
export const MAX_SCENARIOS = 3;
export const LS_KEY = 'techpar-state';
export const VISITED_KEY = 'techpar-visited';

/**
 * Centralised mutable state object. Every field that was formerly a
 * module-level `let` in techpar-ui.ts now lives here.
 */
export const tp = {
  stageKey: null as string | null,
  growthRate: null as number | null,
  mode: 'quick' as 'quick' | 'deepdive',
  trajChart: null as Chart | null,
  baselineResult: null as TechParResult | null,
  baselineInputs: null as TechParInputs | null,
  currencySymbol: '$',
  infraPeriod: 'monthly' as 'monthly' | 'annual',
  industry: 'saas' as Industry,
  historicalPoints: [] as HistoricalPoint[],
  resetTimeout: null as ReturnType<typeof setTimeout> | null,
  saveTimeout: null as ReturnType<typeof setTimeout> | null,
  scenarios: [] as SavedScenario[],
};
