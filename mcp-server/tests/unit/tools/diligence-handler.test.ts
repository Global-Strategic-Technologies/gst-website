/**
 * BL-066 — `handleDiligenceTool` cross-field rejection framing.
 *
 * Under BL-066, structural validation is performed by the MCP SDK against
 * the published `AuditedUserInputsSchema.shape`. The handler runs only
 * after structural parse succeeds, so it receives a fully-typed
 * `AuditedUserInputs` — no raw-unknown payloads, no Zod safeParse.
 *
 * This file exercises the cross-field BL-045 refinement rejection path:
 * structurally-valid payloads that trip currency or Rule-0 refinements
 * must come back as `isError: true` with the BL-065 forcing-function
 * framing (preamble + per-rule `Fix:` lines + Rule 0 naming) and, when
 * ≥2 Rule-0 offenders fire, the BL-066 consolidated batch summary.
 */

import { describe, it, expect } from 'vitest';

import { handleDiligenceTool } from '../../../src/tools/diligence';
import {
  type AuditedUserInputs,
  buildPartnerSuppliedAudit,
} from '../../../src/schemas/diligence-audit';
import { UserInputsSchema, type ValidatedUserInputs } from '../../../src/schemas';

interface ErrorResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

function getErrorText(result: ErrorResult): string {
  expect(result.isError).toBe(true);
  expect(result.content.length).toBeGreaterThan(0);
  expect(result.content[0].type).toBe('text');
  return result.content[0].text;
}

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

describe('handleDiligenceTool — BL-066 cross-field rejection framing', () => {
  it('non-USD nativeCurrency without currencyConversion trips BL-045-CURRENCY-CONVERSION-REQUIRED with Fix line', async () => {
    const p = baseline();
    p._audit.revenueRange = {
      ...p._audit.revenueRange,
      nativeCurrency: 'CAD',
      currencyConversion: undefined,
    };
    const result = (await handleDiligenceTool(p)) as ErrorResult;
    const text = getErrorText(result);
    expect(text).toContain('BL-045 calibration audit FAILED');
    expect(text).toContain('RETRY DISCIPLINE');
    expect(text).toContain('BL-045-CURRENCY-CONVERSION-REQUIRED');
    expect(text).toContain('Fix:');
  });

  it('multiple Rule-0 offenders surface the BL-066 batch summary line', async () => {
    // Set 3 dimensions to value="unknown" but keep their tiers at "1" — each
    // trips BL-045-TIER-3-REQUIRED-FOR-UNKNOWN, and BL-066 should consolidate
    // them into a single "Rule 0 batch (3 dimensions)" summary line.
    const p = baseline();
    p.productType = 'unknown';
    p._audit.productType = { ...p._audit.productType, tier: '1' };
    p.techArchetype = 'unknown';
    p._audit.techArchetype = { ...p._audit.techArchetype, tier: '1' };
    p.businessModel = 'unknown';
    p._audit.businessModel = { ...p._audit.businessModel, tier: '1' };
    const result = (await handleDiligenceTool(p)) as ErrorResult;
    const text = getErrorText(result);
    expect(text).toContain('Rule 0 batch (3 dimensions)');
    expect(text).toContain('productType');
    expect(text).toContain('techArchetype');
    expect(text).toContain('businessModel');
    expect(text).toContain('value="unknown" ⇔ tier="3"');
  });

  it('single Rule-0 offender does NOT emit the batch summary (no spurious line for one offender)', async () => {
    const p = baseline();
    p.productType = 'unknown';
    p._audit.productType = { ...p._audit.productType, tier: '1' };
    const result = (await handleDiligenceTool(p)) as ErrorResult;
    const text = getErrorText(result);
    expect(text).toContain('BL-045-TIER-3-REQUIRED-FOR-UNKNOWN');
    expect(text).not.toContain('Rule 0 batch');
  });
});
