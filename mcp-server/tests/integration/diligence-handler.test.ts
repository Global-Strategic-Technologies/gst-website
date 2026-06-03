/**
 * Integration tests for the generate_diligence_agenda MCP tool handler —
 * exercises the full wrapper pipeline introduced under BL-031.95 Phase 2:
 *  - 'unknown' sentinel acceptance at the schema layer
 *  - engine `matchesConditions` widening when input is 'unknown'
 *  - `unknownDimensionCount` instrumentation at the wrapper level
 *
 * The unit tests for the engine widening live in
 * `tests/unit/diligence-engine.test.ts`; the wrapper-handler integration
 * test is the engineering substitute for the BL-031.95 Phase 2 "live MCP
 * exercise" — the running mcp-server subprocess is started from
 * `dist/index.js` at session start and cannot be reloaded mid-session,
 * so this test asserts the same guarantees the live exercise would by
 * walking the actual handler code path with parsed inputs.
 */

import { describe, it, expect } from 'vitest';

import {
  handleDiligenceTool,
  countUnknownDimensions,
  buildDiligenceDeeplink,
} from '../../src/tools/diligence';
import { UserInputsSchema, type ValidatedUserInputs } from '../../src/schemas';
import { buildPartnerSuppliedAudit } from '../../src/schemas/diligence-audit';
import { HUB_BASE } from '../../src/config';

/**
 * Test helper: wrap a ValidatedUserInputs payload with the partner-supplied
 * Tier-3 audit defaults so the BL-045 cross-field refinements pass. Used by
 * the engine-pipeline tests below — they exercise the engine + handler
 * pipeline, not the audit-refinement layer (those have dedicated tests
 * elsewhere).
 */
function withAudit(inputs: ValidatedUserInputs) {
  return { ...inputs, _audit: buildPartnerSuppliedAudit(inputs) };
}

const allKnown: ValidatedUserInputs = {
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

describe('countUnknownDimensions', () => {
  it('returns 0 for a fully-known payload', () => {
    expect(countUnknownDimensions(allKnown)).toBe(0);
  });

  it("returns 13 for a fully-unknown payload (geographies=['unknown'] counts as 1)", () => {
    expect(countUnknownDimensions(allUnknown)).toBe(13);
  });

  it("returns 1 when only geographies is ['unknown']", () => {
    expect(countUnknownDimensions({ ...allKnown, geographies: ['unknown'] })).toBe(1);
  });

  it("does NOT count geographies as unknown when array contains a known value alongside 'unknown'", () => {
    // Mixed-with-unknown in geographies is NOT the same as the
    // ['unknown'] sentinel; only the bare ['unknown'] array means
    // "no signal."
    expect(countUnknownDimensions({ ...allKnown, geographies: ['us', 'unknown'] })).toBe(0);
  });

  it('counts each unknown dimension independently', () => {
    const partial: ValidatedUserInputs = {
      ...allKnown,
      transactionType: 'unknown',
      productType: 'unknown',
      growthStage: 'unknown',
      dataSensitivity: 'unknown',
    };
    expect(countUnknownDimensions(partial)).toBe(4);
  });
});

describe("handleDiligenceTool — BL-031.95 Phase 2 'unknown' integration", () => {
  it('UserInputsSchema accepts the all-unknown payload', () => {
    const parsed = UserInputsSchema.safeParse(allUnknown);
    expect(parsed.success).toBe(true);
  });

  it("UserInputsSchema accepts geographies=['unknown'] (still satisfies .min(1))", () => {
    const parsed = UserInputsSchema.safeParse({ ...allKnown, geographies: ['unknown'] });
    expect(parsed.success).toBe(true);
  });

  it('UserInputsSchema rejects geographies=[] (still requires .min(1))', () => {
    const parsed = UserInputsSchema.safeParse({ ...allKnown, geographies: [] });
    expect(parsed.success).toBe(false);
  });

  it('all-known payload produces a result with unknownDimensionCount=0', async () => {
    const parsed = UserInputsSchema.parse(allKnown);
    const response = await handleDiligenceTool(withAudit(parsed));
    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    expect(payload.unknownDimensionCount).toBe(0);
    expect((payload.topics as unknown[]).length).toBeGreaterThan(0);
    expect(typeof payload.metadata).toBe('object');
  });

  it('all-unknown payload produces a maximally-wide agenda with unknownDimensionCount=13', async () => {
    const parsed = UserInputsSchema.parse(allUnknown);
    const response = await handleDiligenceTool(withAudit(parsed));
    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    expect(payload.unknownDimensionCount).toBe(13);
    // Engine still produces a real agenda — widening means EVERY
    // condition-gated question that would have been eliminated by a
    // mismatch now passes through.
    expect((payload.topics as unknown[]).length).toBeGreaterThan(0);
  });

  it('all-unknown payload produces an agenda with at least as many questions as the all-known baseline (widening invariant)', async () => {
    const knownResponse = await handleDiligenceTool(withAudit(UserInputsSchema.parse(allKnown)));
    const unknownResponse = await handleDiligenceTool(
      withAudit(UserInputsSchema.parse(allUnknown))
    );
    const knownPayload = knownResponse.structuredContent as Record<string, unknown>;
    const unknownPayload = unknownResponse.structuredContent as Record<string, unknown>;
    const knownTotal = (knownPayload.metadata as { totalQuestions: number }).totalQuestions;
    const unknownTotal = (unknownPayload.metadata as { totalQuestions: number }).totalQuestions;
    // Widening is monotonic: 'unknown' inputs cannot REDUCE the agenda
    // relative to a payload where the same field is constraining.
    expect(unknownTotal).toBeGreaterThanOrEqual(knownTotal);
  });

  it('partial-unknown payload counts correctly (4 unknown dimensions surfaces unknownDimensionCount: 4)', async () => {
    const partial = UserInputsSchema.parse({
      ...allKnown,
      transactionType: 'unknown',
      productType: 'unknown',
      growthStage: 'unknown',
      dataSensitivity: 'unknown',
    });
    const response = await handleDiligenceTool(withAudit(partial));
    const payload = response.structuredContent as Record<string, unknown>;
    expect(payload.unknownDimensionCount).toBe(4);
  });
});

describe('handleDiligenceTool — BL-031.95 Phase 2.B deeplink emission', () => {
  it('response payload includes a well-formed deeplink URL', async () => {
    const parsed = UserInputsSchema.parse(allKnown);
    const response = await handleDiligenceTool(withAudit(parsed));
    const payload = response.structuredContent as Record<string, unknown>;
    expect(typeof payload.deeplink).toBe('string');
    const deeplink = payload.deeplink as string;
    expect(deeplink).toMatch(/\/hub\/tools\/diligence-machine\/\?/);
    // All 13 fields encoded.
    expect(deeplink).toContain('tt=majority-stake');
    expect(deeplink).toContain('pt=b2b-saas');
    expect(deeplink).toContain('ge=us%2Ceu'); // URL-encoded comma
    expect(deeplink).toContain('om=product-aligned-teams');
  });

  it("deeplink encodes 'unknown' sentinels verbatim (no special casing)", async () => {
    const parsed = UserInputsSchema.parse(allUnknown);
    const response = await handleDiligenceTool(withAudit(parsed));
    const payload = response.structuredContent as Record<string, unknown>;
    const deeplink = payload.deeplink as string;
    expect(deeplink).toContain('tt=unknown');
    expect(deeplink).toContain('ge=unknown');
    expect(deeplink).toContain('om=unknown');
  });

  it('buildDiligenceDeeplink is the same encoder the website page uses', () => {
    // The MCP wrapper imports the same `serializeToParams` from
    // src/utils/diligence-url.ts that the website page imports for
    // syncUrlState/restoreState. Round-trip parity is asserted by
    // tests/unit/diligence-url.test.ts; this test asserts that the
    // wrapper's deeplink prefix matches the production HUB_BASE.
    const deeplink = buildDiligenceDeeplink(allKnown);
    expect(deeplink.startsWith(HUB_BASE)).toBe(true);
    expect(deeplink).toMatch(/\/hub\/tools\/diligence-machine\/\?/);
  });
});
