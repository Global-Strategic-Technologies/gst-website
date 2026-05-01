/**
 * Wire-shape regression test for gst_diligence_kickoff.
 *
 * Asserts the prompt's argsSchema accepts the string-typed argument shape
 * Claude Desktop sends (per MCP wire spec, `arguments: Record<string, string>`)
 * AND the typed-array shape future clients will send. Both paths must
 * succeed; this is the guarantee `arrayFromWire` makes structural.
 *
 * History: this file was authored 2026-05-01 as a diagnostic to identify
 * why "Failed to attach prompt" was firing on V1. It now serves as the
 * regression test that the wire-shape fix is applied.
 */

import { describe, it, expect } from 'vitest';
import { diligenceKickoffPrompt } from '../../../src/prompts/diligence-kickoff';

const BASE_TYPED_ARGS = {
  targetName: 'Helios Health',
  transactionType: 'majority-stake',
  productType: 'b2b-saas',
  techArchetype: 'modern-cloud-native',
  headcount: '51-200',
  revenueRange: '25-100m',
  growthStage: 'scaling',
  companyAge: '5-10yr',
  geographies: ['us', 'eu'],
  businessModel: 'productized-platform',
  scaleIntensity: 'moderate',
  transformationState: 'mid-migration',
  dataSensitivity: 'high',
  operatingModel: 'product-aligned-teams',
};

describe('gst_diligence_kickoff — wire-shape', () => {
  it('accepts geographies as an actual array (forward-compat)', () => {
    expect(diligenceKickoffPrompt.argsSchema.safeParse(BASE_TYPED_ARGS).success).toBe(true);
  });

  it('accepts geographies as a JSON-encoded string (current Desktop wire shape)', () => {
    const r = diligenceKickoffPrompt.argsSchema.safeParse({
      ...BASE_TYPED_ARGS,
      geographies: '["us", "eu"]',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.geographies).toEqual(['us', 'eu']);
  });

  it('accepts geographies as a comma-separated string (graceful fallback)', () => {
    const r = diligenceKickoffPrompt.argsSchema.safeParse({
      ...BASE_TYPED_ARGS,
      geographies: 'us,eu',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.geographies).toEqual(['us', 'eu']);
  });

  it('still rejects unknown geography ids regardless of wire shape', () => {
    expect(
      diligenceKickoffPrompt.argsSchema.safeParse({ ...BASE_TYPED_ARGS, geographies: ['xx'] })
        .success
    ).toBe(false);
    expect(
      diligenceKickoffPrompt.argsSchema.safeParse({ ...BASE_TYPED_ARGS, geographies: '["xx"]' })
        .success
    ).toBe(false);
  });

  it('normalizes case variants on every UserInputs enum (case-tolerance contract)', () => {
    // Sample two enums + the geographies array's inner enum. Per-field
    // exhaustive coverage lives in wire-shape.test.ts; this asserts the
    // contract is wired through to the prompt's argsSchema.
    const r = diligenceKickoffPrompt.argsSchema.safeParse({
      ...BASE_TYPED_ARGS,
      transactionType: 'MAJORITY-STAKE', // canonical: 'majority-stake'
      productType: 'B2B-SaaS', // canonical: 'b2b-saas'
      geographies: ['US', 'EU'], // canonical: 'us', 'eu'
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.transactionType).toBe('majority-stake');
      expect(r.data.productType).toBe('b2b-saas');
      expect(r.data.geographies).toEqual(['us', 'eu']);
    }
  });
});
