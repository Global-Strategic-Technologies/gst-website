/**
 * Dedicated unit tests for `runTechDebtAuditRefinements` in
 * `src/schemas/tech-debt-audit.ts` (BL-045 PR B MTTR/incidents
 * fabrication guard).
 *
 * Pattern: build a baseline-valid `AuditedTechDebtInputs`, then mutate one
 * field per test to trigger exactly one rule. The four enum source values
 * partition the truth table: irl-stated allows any non-null; the other
 * three require null. The MTTR=0 + irl-stated rule is a separate spot
 * check.
 *
 * See: mcp-server/src/docs/prompts/irl-ingestion.md § Server-side enforcement
 */

import { describe, it, expect } from 'vitest';
import {
  // Aliased to the audit-carrying variant: every fixture here supplies and
  // mutates `_audit`, which became optional on the payload type in 0.60.0.
  type AuditCarryingTechDebtInputs as AuditedTechDebtInputs,
  formatTechDebtAuditIssues,
  runTechDebtAuditRefinements,
} from '../../../src/schemas/tech-debt-audit';

function baseline(overrides: Partial<AuditedTechDebtInputs> = {}): AuditedTechDebtInputs {
  return {
    teamSize: 50,
    salary: 185000,
    maintenanceBurdenPct: 22,
    deployFrequency: 'Daily',
    incidents: 4,
    mttrHours: 7.8,
    remediationBudget: 1800000,
    remediationPct: 20,
    arr: 45200000,
    contextSwitchOn: false,
    _audit: { mttrSource: 'irl-stated', incidentsSource: 'irl-stated' },
    ...overrides,
  } as AuditedTechDebtInputs;
}

function ruleIds(p: AuditedTechDebtInputs): string[] {
  return runTechDebtAuditRefinements(p).map((i) => i.ruleId);
}

describe('runTechDebtAuditRefinements — happy path', () => {
  it('returns no issues for irl-stated + non-null values', () => {
    expect(runTechDebtAuditRefinements(baseline())).toEqual([]);
  });

  it('returns no issues for irl-open + both null', () => {
    expect(
      runTechDebtAuditRefinements(
        baseline({
          mttrHours: null,
          incidents: null,
          _audit: { mttrSource: 'irl-open', incidentsSource: 'irl-open' },
        })
      )
    ).toEqual([]);
  });

  it('returns no issues for mixed: MTTR irl-open (null) + incidents irl-stated (number)', () => {
    expect(
      runTechDebtAuditRefinements(
        baseline({
          mttrHours: null,
          incidents: 4,
          _audit: { mttrSource: 'irl-open', incidentsSource: 'irl-stated' },
        })
      )
    ).toEqual([]);
  });
});

describe('runTechDebtAuditRefinements — MTTR null-required rules', () => {
  for (const source of ['irl-open', 'irl-absent', 'irl-scope-mismatch'] as const) {
    it(`flags non-null mttrHours when mttrSource = "${source}"`, () => {
      const p = baseline({
        mttrHours: 24,
        _audit: { mttrSource: source, incidentsSource: 'irl-stated' },
      });
      expect(ruleIds(p)).toContain('BL-045-MTTR-NULL-REQUIRED-FOR-OPEN-SOURCE');
    });
  }

  it('does not flag mttrHours = null when mttrSource = irl-open', () => {
    const p = baseline({
      mttrHours: null,
      _audit: { mttrSource: 'irl-open', incidentsSource: 'irl-stated' },
    });
    expect(ruleIds(p)).not.toContain('BL-045-MTTR-NULL-REQUIRED-FOR-OPEN-SOURCE');
  });
});

describe('runTechDebtAuditRefinements — MTTR=0 + irl-stated suspicion (BL-045-MTTR-ZERO-SUSPICIOUS)', () => {
  it('flags mttrHours = 0 with mttrSource = irl-stated', () => {
    const p = baseline({ mttrHours: 0 });
    expect(ruleIds(p)).toContain('BL-045-MTTR-ZERO-SUSPICIOUS');
  });

  it('does NOT flag mttrHours = 0 with mttrSource = irl-open + value=null (no mismatch)', () => {
    const p = baseline({
      mttrHours: null,
      _audit: { mttrSource: 'irl-open', incidentsSource: 'irl-stated' },
    });
    expect(ruleIds(p)).not.toContain('BL-045-MTTR-ZERO-SUSPICIOUS');
  });
});

describe('runTechDebtAuditRefinements — incidents null-required rules', () => {
  for (const source of ['irl-open', 'irl-absent', 'irl-scope-mismatch'] as const) {
    it(`flags non-null incidents when incidentsSource = "${source}"`, () => {
      const p = baseline({
        incidents: 12,
        _audit: { mttrSource: 'irl-stated', incidentsSource: source },
      });
      expect(ruleIds(p)).toContain('BL-045-INCIDENTS-NULL-REQUIRED-FOR-OPEN-SOURCE');
    });
  }

  it('does not flag incidents = null when incidentsSource = irl-scope-mismatch', () => {
    const p = baseline({
      incidents: null,
      _audit: { mttrSource: 'irl-stated', incidentsSource: 'irl-scope-mismatch' },
    });
    expect(ruleIds(p)).not.toContain('BL-045-INCIDENTS-NULL-REQUIRED-FOR-OPEN-SOURCE');
  });
});

describe('runTechDebtAuditRefinements — both fields independent', () => {
  it('flags BOTH rules when both sources are irl-open but values non-null', () => {
    const p = baseline({
      mttrHours: 24,
      incidents: 8,
      _audit: { mttrSource: 'irl-open', incidentsSource: 'irl-open' },
    });
    const ids = ruleIds(p);
    expect(ids).toContain('BL-045-MTTR-NULL-REQUIRED-FOR-OPEN-SOURCE');
    expect(ids).toContain('BL-045-INCIDENTS-NULL-REQUIRED-FOR-OPEN-SOURCE');
  });
});

describe('formatTechDebtAuditIssues', () => {
  it('returns a coherent error string', () => {
    const p = baseline({
      mttrHours: 24,
      _audit: { mttrSource: 'irl-open', incidentsSource: 'irl-stated' },
    });
    const issues = runTechDebtAuditRefinements(p);
    const text = formatTechDebtAuditIssues(issues);
    expect(text).toContain('Tech Debt calibration audit FAILED');
    expect(text).toContain('BL-045-MTTR-NULL-REQUIRED-FOR-OPEN-SOURCE');
    expect(text).toContain('extraction-only');
  });
});
