/**
 * Dedicated unit tests for `runTechParAuditRefinements` in
 * `src/schemas/techpar-audit.ts` (BL-045 PR B Phase 2 + Phase 2A
 * calibration audit for compute_techpar).
 *
 * Pattern: build a baseline-valid `AuditedTechParInputs` via
 * `buildPartnerSuppliedTechParAudit`, mutate one field per test.
 *
 * Phase 2A YTD arithmetic-consistency rule
 * (BL-045-TECHPAR-YTD-ARITHMETIC-INCONSISTENT) is the highest-value
 * regression target since it caught the v6 StoreForce ytdMonths=4 vs
 * math-correct ytdMonths=3 inversion. Cover both the monthlyAnchor ×
 * ytdMonths balance case and the 10%-tolerance edges.
 *
 * See: src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md
 */

import { describe, it, expect } from 'vitest';
import {
  type AuditedTechParInputs,
  buildPartnerSuppliedTechParAudit,
  formatTechParAuditIssues,
  runTechParAuditRefinements,
} from '../../../src/schemas/techpar-audit';

function baselineQuick(): AuditedTechParInputs {
  return {
    arr: 22600000,
    stage: 'pe',
    mode: 'quick',
    capexView: 'gaap',
    growthRate: 10,
    exitMultiple: 12,
    infraHostingAnnual: 2970000,
    infraPersonnel: 663000,
    rdOpEx: 9680000,
    rdCapEx: 0,
    engFTE: 42,
    engCost: 0,
    prodCost: 0,
    toolingCost: 0,
    _audit: buildPartnerSuppliedTechParAudit('quick'),
  } as AuditedTechParInputs;
}

function baselineDeepdive(): AuditedTechParInputs {
  return {
    ...baselineQuick(),
    mode: 'deepdive',
    engCost: 6000000,
    prodCost: 2000000,
    toolingCost: 1680000,
    _audit: buildPartnerSuppliedTechParAudit('deepdive'),
  } as AuditedTechParInputs;
}

function ruleIds(p: AuditedTechParInputs): string[] {
  return runTechParAuditRefinements(p).map((i) => i.ruleId);
}

describe('runTechParAuditRefinements — happy path', () => {
  it('partner-supplied quick-mode baseline produces no issues', () => {
    expect(runTechParAuditRefinements(baselineQuick())).toEqual([]);
  });

  it('partner-supplied deepdive baseline produces no issues', () => {
    expect(runTechParAuditRefinements(baselineDeepdive())).toEqual([]);
  });
});

describe('runTechParAuditRefinements — currency conversion (BL-045-TECHPAR-CURRENCY-CONVERSION-REQUIRED)', () => {
  it('flags non-USD currency without conversionRate', () => {
    const p = baselineQuick();
    p._audit.monetaryBasis = { ...p._audit.monetaryBasis, currency: 'CAD' };
    expect(ruleIds(p)).toContain('BL-045-TECHPAR-CURRENCY-CONVERSION-REQUIRED');
  });

  it('does not flag non-USD currency with conversionRate supplied', () => {
    const p = baselineQuick();
    p._audit.monetaryBasis = {
      ...p._audit.monetaryBasis,
      currency: 'CAD',
      conversionRate: 0.73,
    };
    expect(ruleIds(p)).not.toContain('BL-045-TECHPAR-CURRENCY-CONVERSION-REQUIRED');
  });
});

describe('runTechParAuditRefinements — YTD months required (BL-045-TECHPAR-YTD-MONTHS-REQUIRED)', () => {
  it('flags ytd-annualized-with-period without ytdMonths', () => {
    const p = baselineQuick();
    p._audit.arr = {
      annualizationSource: 'ytd-annualized-with-period',
      citation: 'Section 00 row 10 — Recurring $2.64M/mo Apr-2026; YTD figures elsewhere',
    };
    expect(ruleIds(p)).toContain('BL-045-TECHPAR-YTD-MONTHS-REQUIRED');
  });

  it('does not flag monthly-x12 without ytdMonths', () => {
    const p = baselineQuick();
    p._audit.arr = {
      annualizationSource: 'monthly-x12',
      citation: 'Section 00 row 10 — Recurring revenue $1.88M/mo × 12 = $22.6M USD annualized',
    };
    expect(ruleIds(p)).not.toContain('BL-045-TECHPAR-YTD-MONTHS-REQUIRED');
  });
});

describe('runTechParAuditRefinements — YTD math check required (BL-045-TECHPAR-YTD-MATH-CHECK-REQUIRED)', () => {
  it('flags ytd-annualized-with-period + ytdMonths but no ytdMathCheck', () => {
    const p = baselineQuick();
    p._audit.arr = {
      annualizationSource: 'ytd-annualized-with-period',
      ytdMonths: 3,
      citation: 'Section 00 row 10 — Recurring $2.64M/mo; YTD $7.86M → ytdMonths 3',
    };
    expect(ruleIds(p)).toContain('BL-045-TECHPAR-YTD-MATH-CHECK-REQUIRED');
  });
});

describe('runTechParAuditRefinements — YTD arithmetic consistency (BL-045-TECHPAR-YTD-ARITHMETIC-INCONSISTENT)', () => {
  it('flags ytdMonths=4 when monthly×3 matches reported YTD (StoreForce v6 regression)', () => {
    const p = baselineQuick();
    p._audit.arr = {
      annualizationSource: 'ytd-annualized-with-period',
      ytdMonths: 4,
      ytdMathCheck: {
        monthlyAnchorAmount: 2640000,
        monthlyAnchorCitation:
          'Section 00 row 10 — Recurring $2.64M CAD/mo Apr-2026 (board view monthly anchor)',
        ytdActualReportedAmount: 7860000,
        ytdActualReportedCitation:
          'Section 00 row 10 — $7.86M YTD FY27 recurring (board view YTD line)',
      },
      citation: 'Section 00 row 10 — Recurring $2.64M/mo; YTD $7.86M; declared ytdMonths=4',
    };
    expect(ruleIds(p)).toContain('BL-045-TECHPAR-YTD-ARITHMETIC-INCONSISTENT');
  });

  it('accepts ytdMonths=3 when monthly×3 matches reported YTD (StoreForce math-correct)', () => {
    const p = baselineQuick();
    p._audit.arr = {
      annualizationSource: 'ytd-annualized-with-period',
      ytdMonths: 3,
      ytdMathCheck: {
        monthlyAnchorAmount: 2640000,
        monthlyAnchorCitation:
          'Section 00 row 10 — Recurring $2.64M CAD/mo Apr-2026 (board view monthly anchor)',
        ytdActualReportedAmount: 7860000,
        ytdActualReportedCitation:
          'Section 00 row 10 — $7.86M YTD FY27 recurring (board view YTD line)',
      },
      citation: 'Section 00 row 10 — Recurring $2.64M/mo × 3 = $7.92M ≈ $7.86M YTD; ytdMonths=3',
    };
    expect(ruleIds(p)).not.toContain('BL-045-TECHPAR-YTD-ARITHMETIC-INCONSISTENT');
  });

  it('accepts a match within the 10% tolerance (9% off)', () => {
    const p = baselineQuick();
    p._audit.arr = {
      annualizationSource: 'ytd-annualized-with-period',
      ytdMonths: 3,
      ytdMathCheck: {
        monthlyAnchorAmount: 1000000,
        monthlyAnchorCitation:
          'Section 00 row 10 — Recurring $1M/mo (representative anchor for tolerance test)',
        ytdActualReportedAmount: 3300000, // 3 × 1M = 3M; reported 3.3M → 9% off, within tolerance
        ytdActualReportedCitation: 'Section 00 row 10 — $3.3M YTD reported (tolerance edge case)',
      },
      citation: 'Section 00 row 10 — Tolerance edge case: 9% off within the 10% buffer',
    };
    expect(ruleIds(p)).not.toContain('BL-045-TECHPAR-YTD-ARITHMETIC-INCONSISTENT');
  });

  it('flags a discrepancy outside the 10% tolerance (12% off)', () => {
    const p = baselineQuick();
    p._audit.arr = {
      annualizationSource: 'ytd-annualized-with-period',
      ytdMonths: 3,
      ytdMathCheck: {
        monthlyAnchorAmount: 1000000,
        monthlyAnchorCitation:
          'Section 00 row 10 — Recurring $1M/mo (representative anchor for tolerance test)',
        ytdActualReportedAmount: 3400000, // 3 × 1M = 3M; reported 3.4M → 11.8% off, outside tolerance
        ytdActualReportedCitation: 'Section 00 row 10 — $3.4M YTD reported (outside tolerance)',
      },
      citation: 'Section 00 row 10 — Tolerance edge case: 12% off, outside the 10% buffer',
    };
    expect(ruleIds(p)).toContain('BL-045-TECHPAR-YTD-ARITHMETIC-INCONSISTENT');
  });
});

describe('runTechParAuditRefinements — mode consistency', () => {
  it('flags deepdive mode without engCost audit', () => {
    const p = baselineDeepdive();
    delete p._audit.engCost;
    expect(ruleIds(p)).toContain('BL-045-TECHPAR-DEEPDIVE-AUDIT-REQUIRED');
  });

  it('flags deepdive missing prodCost and toolingCost', () => {
    const p = baselineDeepdive();
    delete p._audit.prodCost;
    delete p._audit.toolingCost;
    const ids = ruleIds(p);
    expect(ids.filter((id) => id === 'BL-045-TECHPAR-DEEPDIVE-AUDIT-REQUIRED').length).toBe(2);
  });

  it('flags quick mode when sub-field audits are over-supplied', () => {
    const p = baselineQuick();
    p._audit.engCost = {
      annualizationSource: 'irl-annualized-stated',
      citation: 'Section -- — partner-supplied form input — engCost over-supplied in quick mode',
    };
    expect(ruleIds(p)).toContain('BL-045-TECHPAR-QUICK-MODE-AUDIT-OVERSPECIFIED');
  });
});

describe('formatTechParAuditIssues', () => {
  it('produces a coherent diagnostic with the math hint surfaced', () => {
    const p = baselineQuick();
    p._audit.arr = {
      annualizationSource: 'ytd-annualized-with-period',
      ytdMonths: 4,
      ytdMathCheck: {
        monthlyAnchorAmount: 2640000,
        monthlyAnchorCitation: 'Section 00 row 10 — Recurring $2.64M CAD/mo Apr-2026 (anchor)',
        ytdActualReportedAmount: 7860000,
        ytdActualReportedCitation: 'Section 00 row 10 — $7.86M YTD FY27 recurring',
      },
      citation: 'Section 00 row 10 — Recurring $2.64M/mo; YTD $7.86M; declared ytdMonths=4 (WRONG)',
    };
    const issues = runTechParAuditRefinements(p);
    const text = formatTechParAuditIssues(issues);
    expect(text).toContain('TechPar calibration audit FAILED');
    expect(text).toContain('BL-045-TECHPAR-YTD-ARITHMETIC-INCONSISTENT');
    expect(text).toMatch(/Hint: ytdMonths = 3/);
  });
});

describe('buildPartnerSuppliedTechParAudit', () => {
  it('produces a quick-mode audit that passes refinements', () => {
    const p: AuditedTechParInputs = {
      ...baselineQuick(),
      _audit: buildPartnerSuppliedTechParAudit('quick'),
    };
    expect(runTechParAuditRefinements(p)).toEqual([]);
  });

  it('produces a deepdive audit with engCost/prodCost/toolingCost populated', () => {
    const audit = buildPartnerSuppliedTechParAudit('deepdive');
    expect(audit.engCost).toBeDefined();
    expect(audit.prodCost).toBeDefined();
    expect(audit.toolingCost).toBeDefined();
  });

  it('produces a quick-mode audit with engCost/prodCost/toolingCost UNDEFINED', () => {
    const audit = buildPartnerSuppliedTechParAudit('quick');
    expect(audit.engCost).toBeUndefined();
    expect(audit.prodCost).toBeUndefined();
    expect(audit.toolingCost).toBeUndefined();
  });
});
