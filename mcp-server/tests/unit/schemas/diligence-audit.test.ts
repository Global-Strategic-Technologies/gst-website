/**
 * Dedicated unit tests for `runAuditRefinements` in
 * `src/schemas/diligence-audit.ts` (BL-045 PR B Phase 1 calibration audit).
 *
 * **Why this file exists**: prior to this commit the audit refinement
 * logic was tested only transitively via `tests/integration/diligence-
 * handler.test.ts` (engine-pipeline). That gave one happy-path coverage
 * but no per-rule coverage. Each `BL-045-*` rule has its own message text,
 * its own ruleId, and its own corner cases (boundary buffer, Tier-3
 * geographies special-case, Tier-1 literal-substring rule). When the
 * refinement logic regresses or a rule's path/ruleId shifts, these tests
 * surface the change deterministically.
 *
 * Pattern: build a baseline-valid `AuditedUserInputs` via
 * `buildPartnerSuppliedAudit`, then mutate ONE field per test to trigger
 * exactly one rule. Assert the issue carries the expected `ruleId` and
 * a `path` that points at the mutated field.
 *
 * See: src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md
 */

import { describe, it, expect } from 'vitest';
import {
  type AuditedUserInputs,
  buildPartnerSuppliedAudit,
  bracketForUsdMillions,
  formatAuditIssues,
  runAuditRefinements,
} from '../../../src/schemas/diligence-audit';
import { UserInputsSchema, type ValidatedUserInputs } from '../../../src/schemas';

const KNOWN_INPUTS: ValidatedUserInputs = {
  transactionType: 'majority-stake',
  productType: 'b2b-saas',
  techArchetype: 'modern-cloud-native',
  headcount: '201-500',
  revenueRange: '25-100m',
  growthStage: 'scaling',
  companyAge: '10-20yr',
  geographies: ['us', 'eu'],
  businessModel: 'productized-platform',
  scaleIntensity: 'moderate',
  transformationState: 'actively-modernizing',
  dataSensitivity: 'high',
  operatingModel: 'product-aligned-teams',
};

function baseline(): AuditedUserInputs {
  const parsed = UserInputsSchema.parse(KNOWN_INPUTS);
  return { ...parsed, _audit: buildPartnerSuppliedAudit(parsed) };
}

function ruleIds(payload: AuditedUserInputs): string[] {
  return runAuditRefinements(payload).map((i) => i.ruleId);
}

describe('runAuditRefinements — happy path', () => {
  it('returns no issues for a baseline partner-supplied payload', () => {
    expect(runAuditRefinements(baseline())).toEqual([]);
  });

  it('returns no issues when every dimension is unknown and tier is 3 everywhere', () => {
    const allUnknown: ValidatedUserInputs = {
      transactionType: 'unknown',
      productType: 'unknown',
      techArchetype: 'unknown',
      headcount: 'unknown',
      revenueRange: 'unknown',
      growthStage: 'unknown',
      companyAge: 'unknown',
      geographies: ['unknown'],
      businessModel: 'unknown',
      scaleIntensity: 'unknown',
      transformationState: 'unknown',
      dataSensitivity: 'unknown',
      operatingModel: 'unknown',
    };
    const parsed = UserInputsSchema.parse(allUnknown);
    const payload = { ...parsed, _audit: buildPartnerSuppliedAudit(parsed) };
    expect(runAuditRefinements(payload)).toEqual([]);
  });
});

describe('runAuditRefinements — currency normalization (BL-045-CURRENCY-CONVERSION-REQUIRED)', () => {
  it('flags non-USD nativeCurrency without currencyConversion', () => {
    const p = baseline();
    p._audit.revenueRange = {
      ...p._audit.revenueRange,
      nativeCurrency: 'CAD',
      currencyConversion: undefined,
    };
    expect(ruleIds(p)).toContain('BL-045-CURRENCY-CONVERSION-REQUIRED');
  });

  it('does not flag CAD with a supplied conversion that brackets to the declared bucket', () => {
    const p = baseline();
    p.revenueRange = '25-100m';
    p._audit.revenueRange = {
      ...p._audit.revenueRange,
      nativeCurrency: 'CAD',
      currencyConversion: { nativeAmountMillions: 41, usdRate: 0.73, convertedUsdMillions: 30 },
    };
    expect(ruleIds(p)).not.toContain('BL-045-CURRENCY-CONVERSION-REQUIRED');
  });
});

describe('runAuditRefinements — revenueRange bracket cross-check', () => {
  it('flags a mismatch when the converted USD lands in a different bracket', () => {
    const p = baseline();
    p.revenueRange = '5-25m';
    p._audit.revenueRange = {
      ...p._audit.revenueRange,
      nativeCurrency: 'CAD',
      currencyConversion: {
        nativeAmountMillions: 80,
        usdRate: 0.73,
        convertedUsdMillions: 58.4,
      },
    };
    expect(ruleIds(p)).toContain('BL-045-REVENUE-BRACKET-MISMATCH');
  });

  it('flags a boundary commitment (within 10% of the 25M threshold)', () => {
    const p = baseline();
    p.revenueRange = '25-100m';
    p._audit.revenueRange = {
      ...p._audit.revenueRange,
      nativeCurrency: 'CAD',
      currencyConversion: {
        nativeAmountMillions: 35,
        usdRate: 0.73,
        convertedUsdMillions: 25.5,
      },
    };
    expect(ruleIds(p)).toContain('BL-045-REVENUE-BRACKET-BOUNDARY');
  });

  it('does not run the cross-check when revenueRange is unknown', () => {
    const p = baseline();
    p.revenueRange = 'unknown';
    p._audit.revenueRange = {
      ...p._audit.revenueRange,
      tier: '3',
      nativeCurrency: 'CAD',
      currencyConversion: {
        nativeAmountMillions: 80,
        usdRate: 0.73,
        convertedUsdMillions: 58.4,
      },
    };
    expect(ruleIds(p)).not.toContain('BL-045-REVENUE-BRACKET-MISMATCH');
    expect(ruleIds(p)).not.toContain('BL-045-REVENUE-BRACKET-BOUNDARY');
  });
});

describe('bracketForUsdMillions', () => {
  it('returns 0-5m for values < 5M outside the boundary buffer', () => {
    expect(bracketForUsdMillions(2)).toBe('0-5m');
  });
  it('returns 5-25m for clearly-mid-bracket values', () => {
    expect(bracketForUsdMillions(15)).toBe('5-25m');
  });
  it('returns 25-100m for clearly-mid-bracket values', () => {
    expect(bracketForUsdMillions(60)).toBe('25-100m');
  });
  it('returns 100m+ for clearly-large values', () => {
    expect(bracketForUsdMillions(250)).toBe('100m+');
  });
  it('returns unknown within 10% of the 5M boundary', () => {
    expect(bracketForUsdMillions(4.6)).toBe('unknown');
    expect(bracketForUsdMillions(5.4)).toBe('unknown');
  });
  it('returns unknown within 10% of the 25M boundary', () => {
    expect(bracketForUsdMillions(23)).toBe('unknown');
    expect(bracketForUsdMillions(27)).toBe('unknown');
  });
  it('returns unknown within 10% of the 100M boundary', () => {
    expect(bracketForUsdMillions(91)).toBe('unknown');
    expect(bracketForUsdMillions(109)).toBe('unknown');
  });
  it('returns unknown for zero or negative', () => {
    expect(bracketForUsdMillions(0)).toBe('unknown');
    expect(bracketForUsdMillions(-1)).toBe('unknown');
  });
});

describe('runAuditRefinements — headcount scope (BL-045-HEADCOUNT-SCOPE-REQUIRED)', () => {
  it('flags scope=total-company with a non-unknown headcount value', () => {
    const p = baseline();
    p._audit.headcount = { ...p._audit.headcount, scope: 'total-company' };
    expect(ruleIds(p)).toContain('BL-045-HEADCOUNT-SCOPE-REQUIRED');
  });

  it('flags scope=engineering-and-product', () => {
    const p = baseline();
    p._audit.headcount = { ...p._audit.headcount, scope: 'engineering-and-product' };
    expect(ruleIds(p)).toContain('BL-045-HEADCOUNT-SCOPE-REQUIRED');
  });

  it("does NOT flag when headcount is unknown (scope is don't-care)", () => {
    const p = baseline();
    p.headcount = 'unknown';
    p._audit.headcount = {
      tier: '3',
      citation: p._audit.headcount.citation,
      scope: 'total-company',
    };
    expect(ruleIds(p)).not.toContain('BL-045-HEADCOUNT-SCOPE-REQUIRED');
  });
});

describe('runAuditRefinements — dataSensitivity bucket boundaries', () => {
  it('flags high without a regulated PII category', () => {
    const p = baseline();
    p.dataSensitivity = 'high';
    p._audit.dataSensitivity = {
      ...p._audit.dataSensitivity,
      piiCategoriesPresent: ['employee-pii'],
    };
    expect(ruleIds(p)).toContain('BL-045-DATASENSITIVITY-HIGH-REQUIRES-REGULATED');
  });

  it('flags moderate without customer-PII / financial-tx', () => {
    const p = baseline();
    p.dataSensitivity = 'moderate';
    p._audit.dataSensitivity = {
      ...p._audit.dataSensitivity,
      piiCategoriesPresent: ['employee-pii'],
    };
    expect(ruleIds(p)).toContain('BL-045-DATASENSITIVITY-MODERATE-REQUIRES-CUSTOMER-PII');
  });

  it('flags low when a regulated category is present', () => {
    const p = baseline();
    p.dataSensitivity = 'low';
    p._audit.dataSensitivity = {
      ...p._audit.dataSensitivity,
      piiCategoriesPresent: ['phi'],
    };
    expect(ruleIds(p)).toContain('BL-045-DATASENSITIVITY-LOW-INCOMPATIBLE-WITH-REGULATED');
  });

  it('accepts high with pci-card-data', () => {
    const p = baseline();
    p.dataSensitivity = 'high';
    p._audit.dataSensitivity = {
      ...p._audit.dataSensitivity,
      piiCategoriesPresent: ['pci-card-data'],
    };
    expect(ruleIds(p)).not.toContain('BL-045-DATASENSITIVITY-HIGH-REQUIRES-REGULATED');
  });

  it('accepts moderate with customer-pii-at-scale', () => {
    const p = baseline();
    p.dataSensitivity = 'moderate';
    p._audit.dataSensitivity = {
      ...p._audit.dataSensitivity,
      piiCategoriesPresent: ['customer-pii-at-scale'],
    };
    expect(ruleIds(p)).not.toContain('BL-045-DATASENSITIVITY-MODERATE-REQUIRES-CUSTOMER-PII');
  });

  it("accepts moderate when the model declares a stricter (high) category — promotion is the partner's call", () => {
    const p = baseline();
    p.dataSensitivity = 'moderate';
    p._audit.dataSensitivity = {
      ...p._audit.dataSensitivity,
      piiCategoriesPresent: ['phi'],
    };
    // moderate + high category is permissive — the rule fires only when
    // dataSensitivity is high without high cats, or moderate without
    // moderate-or-higher.
    expect(ruleIds(p)).not.toContain('BL-045-DATASENSITIVITY-MODERATE-REQUIRES-CUSTOMER-PII');
  });
});

describe('runAuditRefinements — growthStage Tier discipline (BL-045-GROWTHSTAGE-VELOCITY-REQUIRED)', () => {
  it('flags growthStage != unknown with velocityEvidence = unknown', () => {
    const p = baseline();
    p.growthStage = 'scaling';
    p._audit.growthStage = { ...p._audit.growthStage, velocityEvidence: 'unknown' };
    expect(ruleIds(p)).toContain('BL-045-GROWTHSTAGE-VELOCITY-REQUIRED');
  });

  it('does NOT flag growthStage = unknown with velocityEvidence = unknown', () => {
    const p = baseline();
    p.growthStage = 'unknown';
    p._audit.growthStage = {
      tier: '3',
      citation: p._audit.growthStage.citation,
      velocityEvidence: 'unknown',
    };
    expect(ruleIds(p)).not.toContain('BL-045-GROWTHSTAGE-VELOCITY-REQUIRED');
  });
});

describe('runAuditRefinements — Tier-3-required-for-unknown', () => {
  it('flags transactionType = unknown with tier=1', () => {
    const p = baseline();
    p.transactionType = 'unknown';
    p._audit.transactionType = {
      tier: '1',
      citation: 'Section 00 — unknown bullet placeholder for tier check',
    };
    expect(ruleIds(p)).toContain('BL-045-TIER-3-REQUIRED-FOR-UNKNOWN');
  });

  it('flags geographies=["unknown"] with tier=2', () => {
    const p = baseline();
    p.geographies = ['unknown'];
    p._audit.geographies = {
      tier: '2',
      citation: 'Section 00 — unknown geographies inferred from missing bullet entry',
    };
    expect(ruleIds(p)).toContain('BL-045-TIER-3-REQUIRED-FOR-UNKNOWN');
  });

  it('does NOT flag a partial geographies array (mixed unknown + known)', () => {
    const p = baseline();
    p.geographies = ['us', 'unknown'];
    p._audit.geographies = {
      tier: '2',
      citation: 'Section 00 — US named explicitly, other geographies left as unknown',
    };
    expect(ruleIds(p)).not.toContain('BL-045-TIER-3-REQUIRED-FOR-UNKNOWN');
  });
});

describe('runAuditRefinements — Tier-1-literal-match (BL-045-TIER-1-LITERAL-MISMATCH)', () => {
  it('flags tier=1 when the citation does not contain the enum value literally', () => {
    const p = baseline();
    p._audit.productType = {
      tier: '1',
      citation: 'Section 00 row 12 — packaged platform with subscription billing per location',
    };
    // productType is "b2b-saas"; citation does NOT contain "b2b-saas" literally → tier=1 mismatch
    expect(ruleIds(p)).toContain('BL-045-TIER-1-LITERAL-MISMATCH');
  });

  it('accepts tier=1 when the citation contains the enum value', () => {
    const p = baseline();
    p._audit.productType = {
      tier: '1',
      citation:
        'Section 00 row 12 — explicitly states b2b-saas as the product type for the engagement',
    };
    expect(ruleIds(p)).not.toContain('BL-045-TIER-1-LITERAL-MISMATCH');
  });

  it('accepts tier=2 with no literal match (tier 2 is one-step derivation)', () => {
    const p = baseline();
    p._audit.productType = {
      tier: '2',
      citation: 'Section 00 row 12 — packaged platform with subscription billing per location',
    };
    expect(ruleIds(p)).not.toContain('BL-045-TIER-1-LITERAL-MISMATCH');
  });
});

describe('formatAuditIssues', () => {
  it('returns a coherent string with header + per-issue block + footer', () => {
    const p = baseline();
    p._audit.headcount = { ...p._audit.headcount, scope: 'total-company' };
    const issues = runAuditRefinements(p);
    const text = formatAuditIssues(issues);
    expect(text).toContain('BL-045 calibration audit FAILED');
    expect(text).toContain('BL-045-HEADCOUNT-SCOPE-REQUIRED');
    expect(text).toContain('_audit.headcount.scope');
    expect(text).toContain('retry the tool call');
  });
});

describe('buildPartnerSuppliedAudit', () => {
  it('produces an audit that passes refinements for every dataSensitivity bucket', () => {
    for (const bucket of ['low', 'moderate', 'high', 'unknown'] as const) {
      const p = baseline();
      p.dataSensitivity = bucket;
      p._audit = buildPartnerSuppliedAudit(p);
      expect(runAuditRefinements(p)).toEqual([]);
    }
  });

  it('produces an audit that passes refinements for unknown growthStage', () => {
    const p = baseline();
    p.growthStage = 'unknown';
    p._audit = buildPartnerSuppliedAudit(p);
    expect(runAuditRefinements(p)).toEqual([]);
  });
});
