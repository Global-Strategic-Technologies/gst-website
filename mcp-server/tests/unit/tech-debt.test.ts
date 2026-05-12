/**
 * Tests for the estimate_tech_debt_cost tool wrapper.
 *
 * Validates the raw-input contract, asserts byte-for-byte parity between
 * `calculate(state)` and `calculateFromRawInputs(raw)` (the refactor must
 * not change website behavior), and checks the schema-vs-engine drift on
 * the deployment-frequency labels.
 */

import {
  calculate,
  calculateFromRawInputs,
  posToTeamSize,
  posToSalary,
  posTobudget,
  posToArr,
  DEFAULT_STATE,
  DEPLOY_OPTIONS,
} from '../../../src/utils/tech-debt-engine';
import {
  TechDebtInputsSchema,
  DEPLOY_FREQUENCY_VALUES,
  type TechDebtInputs,
} from '../../src/schemas';

const validInputs: TechDebtInputs = {
  teamSize: 8,
  salary: 150_000,
  maintenanceBurdenPct: 25,
  deployFrequency: 'Bi-weekly',
  incidents: 3,
  mttrHours: 4,
  remediationBudget: 500_000,
  arr: 10_000_000,
  remediationPct: 70,
  contextSwitchOn: false,
};

describe('TechDebtInputsSchema (tool input contract)', () => {
  it('parses a valid raw payload', () => {
    const result = TechDebtInputsSchema.safeParse(validInputs);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown deployFrequency label', () => {
    const bad = { ...validInputs, deployFrequency: 'Continuous' };
    const result = TechDebtInputsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a maintenanceBurdenPct over 100', () => {
    const bad = { ...validInputs, maintenanceBurdenPct: 120 };
    const result = TechDebtInputsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive teamSize', () => {
    const bad = { ...validInputs, teamSize: 0 };
    const result = TechDebtInputsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe('DEPLOY_FREQUENCY_VALUES schema/engine parity', () => {
  it('lists the exact same labels as DEPLOY_OPTIONS in the engine', () => {
    const engineLabels = DEPLOY_OPTIONS.map((o) => o.label);
    expect([...DEPLOY_FREQUENCY_VALUES]).toEqual(engineLabels);
  });
});

describe('estimate_tech_debt_cost (engine parity)', () => {
  it('returns matching output for raw values vs the slider state', () => {
    const direct = calculate(DEFAULT_STATE);
    const raw = calculateFromRawInputs({
      teamSize: posToTeamSize(DEFAULT_STATE.teamSizePos),
      salary: posToSalary(DEFAULT_STATE.salaryPos),
      maintenanceBurdenPct: DEFAULT_STATE.maintPct,
      deployFrequency: DEPLOY_OPTIONS[DEFAULT_STATE.deployIdx].label,
      incidents: DEFAULT_STATE.incidents,
      mttrHours: DEFAULT_STATE.mttr,
      remediationBudget: posTobudget(DEFAULT_STATE.budgetPos),
      arr: posToArr(DEFAULT_STATE.arrPos),
      remediationPct: DEFAULT_STATE.remediationPct,
      contextSwitchOn: DEFAULT_STATE.contextSwitchOn,
    });
    expect(raw).toEqual(direct);
  });

  it('throws on an unknown deployFrequency', () => {
    expect(() =>
      calculateFromRawInputs({
        ...validInputs,
        deployFrequency: 'Hourly' as TechDebtInputs['deployFrequency'],
      })
    ).toThrow(/Unknown deployFrequency/);
  });

  it('produces a higher annual cost when context-switch overhead is enabled', () => {
    const without = calculateFromRawInputs(validInputs);
    const withCS = calculateFromRawInputs({ ...validInputs, contextSwitchOn: true });
    expect(withCS.annualCost).toBeGreaterThan(without.annualCost);
  });

  it('serializes cleanly to JSON', () => {
    const result = calculateFromRawInputs(validInputs);
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
