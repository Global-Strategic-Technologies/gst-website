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
  AuditedUserInputsSchema,
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

  // BL-045 PR B audit B1 — false-positive on section-header prefix.
  // The pre-audit substring check matched ANY occurrence of the enum
  // value in the full citation (including the "Section NN row M" header)
  // — letting fabricated tier-1 claims pass when the IRL section header
  // happened to contain a numeric value matching the dimension.
  it('rejects tier=1 when the literal match is in the section-header prefix only', () => {
    const p = baseline();
    p.revenueRange = '5-25m';
    p._audit.revenueRange = {
      ...p._audit.revenueRange,
      tier: '1',
      // "5-25m" appears in the header prefix ("row 5-25m") but the
      // post-em-dash excerpt does NOT mention it. Pre-audit would pass;
      // fixed check rejects.
      citation: 'Section 00 row 5-25m — ARR and growth-rate context per board pack',
    };
    expect(ruleIds(p)).toContain('BL-045-TIER-1-LITERAL-MISMATCH');
  });

  // BL-045 PR B audit B1 — false-positive on short tokens that match
  // as a substring of a different word. The pre-audit `.includes("us")`
  // matched "explicitly", "businessmodel", etc.
  it('rejects tier=1 when a short enum value matches only as a substring of an unrelated word', () => {
    const p = baseline();
    p.geographies = ['us'];
    p._audit.geographies = {
      tier: '1',
      // The literal token "us" does NOT appear; "explicitly" contains
      // "us" as a substring but is not a token. Pre-audit would pass.
      citation:
        'Section 00 row 13 — Revenue presence stated explicitly across multiple regions worldwide',
    };
    expect(ruleIds(p)).toContain('BL-045-TIER-1-LITERAL-MISMATCH');
  });

  // BL-045 PR B audit m2 — hyphen-in-enum normalization pin. Values
  // like "b2b-saas" and "modern-cloud-native" must still match as tokens
  // even though the regex word-boundary treats internal hyphens as part
  // of the token, not separators.
  it('accepts tier=1 for hyphen-bearing enum values that appear as a token', () => {
    const p = baseline();
    p._audit.techArchetype = {
      tier: '1',
      citation:
        'Section 02 row 43 — Stack: modern-cloud-native AWS-only deployment for all services',
    };
    expect(ruleIds(p)).not.toContain('BL-045-TIER-1-LITERAL-MISMATCH');
  });
});

// BL-045 PR B audit M2 — Tier-1 literal-match extended to geographies.
// The scalar Tier-1 rule never ran over array dimensions; a model could
// claim tier=1 for `geographies: ["us","eu","uk"]` while citing only "US".
describe('runAuditRefinements — Tier-1 literal-match for geographies array', () => {
  it('rejects tier=1 when only one of the supplied geographies appears in the citation', () => {
    const p = baseline();
    p.geographies = ['us', 'eu', 'uk'];
    p._audit.geographies = {
      tier: '1',
      citation: 'Section 00 row 13 — US revenue presence only, no other regions stated verbatim',
    };
    expect(ruleIds(p)).toContain('BL-045-TIER-1-LITERAL-MISMATCH');
  });

  it('accepts tier=1 when every supplied geography appears as a token in the citation', () => {
    const p = baseline();
    p.geographies = ['us', 'eu', 'uk'];
    p._audit.geographies = {
      tier: '1',
      citation:
        'Section 00 row 13 — US, EU, UK named explicitly as the three primary revenue regions',
    };
    expect(ruleIds(p)).not.toContain('BL-045-TIER-1-LITERAL-MISMATCH');
  });

  it('does NOT fire the array tier-1 rule when geographies=["unknown"] (delegated to tier-3 rule)', () => {
    const p = baseline();
    p.geographies = ['unknown'];
    p._audit.geographies = {
      tier: '3',
      citation: 'Section 00 row 13 — geography signal absent; defaulted to unknown sentinel',
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

describe('BL-065 — forcing-function framing', () => {
  it('preamble contains RETRY DISCIPLINE block', () => {
    const p = baseline();
    p._audit.headcount = { ...p._audit.headcount, scope: 'total-company' };
    const text = formatAuditIssues(runAuditRefinements(p));
    expect(text).toContain('RETRY DISCIPLINE');
    expect(text).toContain('You MUST fix EVERY issue');
  });

  it('preamble reports accurate issue count', () => {
    const p = baseline();
    // Trigger one issue (headcount scope).
    p._audit.headcount = { ...p._audit.headcount, scope: 'total-company' };
    const issues = runAuditRefinements(p);
    const text = formatAuditIssues(issues);
    expect(text).toContain(`Issues to fix (count: ${issues.length}):`);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('preamble reports accurate count for multiple-issue payloads', () => {
    const p = baseline();
    // Trigger two issues: headcount scope + dataSensitivity high without regulated PII.
    p._audit.headcount = { ...p._audit.headcount, scope: 'total-company' };
    p.dataSensitivity = 'high';
    p._audit.dataSensitivity = {
      ...p._audit.dataSensitivity,
      piiCategoriesPresent: ['employee-pii'],
    };
    const issues = runAuditRefinements(p);
    const text = formatAuditIssues(issues);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain(`Issues to fix (count: ${issues.length}):`);
  });

  it('footer preserves "retry the tool call" phrase for existing test compat', () => {
    const p = baseline();
    p._audit.headcount = { ...p._audit.headcount, scope: 'total-company' };
    const text = formatAuditIssues(runAuditRefinements(p));
    expect(text).toContain('retry the tool call');
  });

  describe('Fix: line presence on each rule', () => {
    function textFor(p: ReturnType<typeof baseline>): string {
      return formatAuditIssues(runAuditRefinements(p));
    }

    it('CURRENCY-CONVERSION-REQUIRED ends with a Fix: line', () => {
      const p = baseline();
      p._audit.revenueRange = {
        ...p._audit.revenueRange,
        nativeCurrency: 'CAD',
        currencyConversion: undefined,
      };
      const text = textFor(p);
      expect(text).toContain('BL-045-CURRENCY-CONVERSION-REQUIRED');
      expect(text).toMatch(/Fix: supply _audit\.revenueRange\.currencyConversion/);
    });

    it('HEADCOUNT-SCOPE-REQUIRED ends with a Fix: line', () => {
      const p = baseline();
      p._audit.headcount = { ...p._audit.headcount, scope: 'total-company' };
      const text = textFor(p);
      expect(text).toContain('BL-045-HEADCOUNT-SCOPE-REQUIRED');
      expect(text).toMatch(/Fix: set _audit\.headcount\.scope = "engineering-only"/);
    });

    it('DATASENSITIVITY-HIGH-REQUIRES-REGULATED ends with a Fix: line', () => {
      const p = baseline();
      p.dataSensitivity = 'high';
      p._audit.dataSensitivity = {
        ...p._audit.dataSensitivity,
        piiCategoriesPresent: ['employee-pii'],
      };
      const text = textFor(p);
      expect(text).toContain('BL-045-DATASENSITIVITY-HIGH-REQUIRES-REGULATED');
      expect(text).toMatch(/Fix: add a regulated category/);
    });

    it('DATASENSITIVITY-MODERATE-REQUIRES-CUSTOMER-PII ends with a Fix: line', () => {
      const p = baseline();
      p.dataSensitivity = 'moderate';
      p._audit.dataSensitivity = {
        ...p._audit.dataSensitivity,
        piiCategoriesPresent: ['employee-pii'],
      };
      const text = textFor(p);
      expect(text).toContain('BL-045-DATASENSITIVITY-MODERATE-REQUIRES-CUSTOMER-PII');
      expect(text).toMatch(/Fix: add a customer-PII category/);
    });

    it('DATASENSITIVITY-LOW-INCOMPATIBLE-WITH-REGULATED ends with a Fix: line', () => {
      const p = baseline();
      p.dataSensitivity = 'low';
      p._audit.dataSensitivity = {
        ...p._audit.dataSensitivity,
        piiCategoriesPresent: ['phi'],
      };
      const text = textFor(p);
      expect(text).toContain('BL-045-DATASENSITIVITY-LOW-INCOMPATIBLE-WITH-REGULATED');
      expect(text).toMatch(/Fix: promote dataSensitivity to "high"/);
    });

    it('GROWTHSTAGE-VELOCITY-REQUIRED ends with a Fix: line', () => {
      const p = baseline();
      // baseline().growthStage may be unknown; force a non-unknown value
      // with velocityEvidence='unknown' to trigger the rule.
      p.growthStage = 'scaling';
      p._audit.growthStage = {
        ...p._audit.growthStage,
        tier: '1',
        velocityEvidence: 'unknown',
      };
      const text = textFor(p);
      expect(text).toContain('BL-045-GROWTHSTAGE-VELOCITY-REQUIRED');
      expect(text).toMatch(/Fix: set growthStage = "unknown"/);
    });
  });

  describe('Rule 0 explicit naming in tier-3 messages', () => {
    it('TIER-3-REQUIRED-FOR-UNKNOWN message names "Rule 0" and "bidirectionally"', () => {
      const p = baseline();
      // Force a dimension to unknown with tier != 3 to trigger Rule 0.
      p.revenueRange = 'unknown';
      p._audit.revenueRange = { ...p._audit.revenueRange, tier: '2' };
      const text = formatAuditIssues(runAuditRefinements(p));
      expect(text).toContain('BL-045-TIER-3-REQUIRED-FOR-UNKNOWN');
      expect(text).toContain('[Rule 0 — tier/value coupling]');
      expect(text).toContain('Rule 0 applies bidirectionally');
      expect(text).toMatch(/Fix: set _audit\.revenueRange\.tier = "3"/);
    });

    it('TIER-3 message for geographies also names Rule 0', () => {
      const p = baseline();
      p.geographies = ['unknown'];
      p._audit.geographies = { ...p._audit.geographies, tier: '2' };
      const text = formatAuditIssues(runAuditRefinements(p));
      expect(text).toContain('BL-045-TIER-3-REQUIRED-FOR-UNKNOWN');
      expect(text).toContain('[Rule 0 — tier/value coupling]');
      expect(text).toMatch(/Fix: set _audit\.geographies\.tier = "3"/);
    });
  });
});

describe('BL-066 — Rule-0 consolidated batch summary', () => {
  it('emits "Rule 0 batch (N dimensions)" summary when ≥2 Rule-0 issues fire', () => {
    const p = baseline();
    p.productType = 'unknown';
    p._audit.productType = { ...p._audit.productType, tier: '1' };
    p.techArchetype = 'unknown';
    p._audit.techArchetype = { ...p._audit.techArchetype, tier: '1' };
    const text = formatAuditIssues(runAuditRefinements(p));
    expect(text).toContain('Rule 0 batch (2 dimensions)');
    expect(text).toContain('productType');
    expect(text).toContain('techArchetype');
    expect(text).toContain('value="unknown" ⇔ tier="3"');
  });

  it('does NOT emit the batch summary when only ONE Rule-0 issue fires', () => {
    const p = baseline();
    p.productType = 'unknown';
    p._audit.productType = { ...p._audit.productType, tier: '1' };
    const text = formatAuditIssues(runAuditRefinements(p));
    expect(text).toContain('BL-045-TIER-3-REQUIRED-FOR-UNKNOWN');
    expect(text).not.toContain('Rule 0 batch');
  });

  it('summary scales to 4 dimensions and lists all four paths', () => {
    const p = baseline();
    p.productType = 'unknown';
    p._audit.productType = { ...p._audit.productType, tier: '1' };
    p.techArchetype = 'unknown';
    p._audit.techArchetype = { ...p._audit.techArchetype, tier: '1' };
    p.businessModel = 'unknown';
    p._audit.businessModel = { ...p._audit.businessModel, tier: '1' };
    p.scaleIntensity = 'unknown';
    p._audit.scaleIntensity = { ...p._audit.scaleIntensity, tier: '1' };
    const text = formatAuditIssues(runAuditRefinements(p));
    expect(text).toContain('Rule 0 batch (4 dimensions)');
    expect(text).toContain('productType');
    expect(text).toContain('techArchetype');
    expect(text).toContain('businessModel');
    expect(text).toContain('scaleIntensity');
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

describe('BL-067 — citation regex custom message', () => {
  // The citation regex error fires at SDK parse time (before
  // runAuditRefinements). We exercise it via AuditedUserInputsSchema.safeParse
  // by mutating one citation in the baseline to a malformed value.
  function baselineWithCitation(badCitation: string): unknown {
    const p = baseline();
    p._audit.productType = { ...p._audit.productType, citation: badCitation };
    return p;
  }

  function citationIssue(raw: unknown): { message: string; path: readonly PropertyKey[] } | null {
    const parsed = AuditedUserInputsSchema.safeParse(raw);
    if (parsed.success) return null;
    const cit = parsed.error.issues.find((i) => i.path.includes('citation'));
    return cit ? { message: cit.message, path: cit.path } : null;
  }

  it('hyphen-instead-of-em-dash rejection surfaces the EM-DASH guidance', () => {
    // Hyphen with surrounding spaces, plus a substantive excerpt so the only
    // failure cause is the dash character (not excerpt length).
    const issue = citationIssue(
      baselineWithCitation('Section 00 - hyphen separator with a substantive excerpt here')
    );
    expect(issue).not.toBeNull();
    expect(issue!.message).toContain('EM-DASH');
    expect(issue!.message).toContain('Fix:');
    expect(issue!.message).toContain('U+2014');
  });

  it('under-20-char excerpt rejection surfaces the length guidance', () => {
    const issue = citationIssue(baselineWithCitation('Section 00 — too short'));
    expect(issue).not.toBeNull();
    expect(issue!.message).toContain('≥20 characters');
    expect(issue!.message).toContain('Fix:');
  });

  it('valid citation passes parse', () => {
    const issue = citationIssue(
      baselineWithCitation(
        'Section 01 — b2b-saas product with substantive verbatim IRL excerpt content'
      )
    );
    expect(issue).toBeNull();
  });
});
