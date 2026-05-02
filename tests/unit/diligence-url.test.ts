/**
 * Unit tests for the Diligence Machine URL state encoder/decoder
 * (BL-031.95 Phase 2). The encoder is the single source of truth for
 * diligence URL state — used by both the website page (page-load
 * hydration via `restoreState`, sync on input change via `syncUrlState`)
 * and the MCP tool wrapper (`buildDiligenceDeeplink`).
 *
 * Tests cover:
 *  - round-trip parity (serialize → deserialize === original)
 *  - empty / partial inputs (mid-flow wizard state)
 *  - geographies array (comma-joined; round-trip preserves order)
 *  - the 'unknown' sentinel passes through unchanged (no special casing)
 *  - URL stays under typical browser limits with all 13 fields populated
 */

import { describe, it, expect } from 'vitest';

import { serializeToParams, deserializeFromParams } from '../../src/utils/diligence-url';
import type { UserInputs } from '../../src/utils/diligence-engine';

const fullInputs: UserInputs = {
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

describe('diligence-url — round-trip parity', () => {
  it('full 13-field inputs round-trip cleanly', () => {
    const params = serializeToParams(fullInputs);
    const restored = deserializeFromParams(params);
    expect(restored).toEqual(fullInputs);
  });

  it('preserves geographies array order', () => {
    const inputs: UserInputs = { ...fullInputs, geographies: ['eu', 'us', 'apac'] };
    const params = serializeToParams(inputs);
    const restored = deserializeFromParams(params);
    expect(restored.geographies).toEqual(['eu', 'us', 'apac']);
  });

  it('partial inputs (mid-flow wizard state) round-trip without invented defaults', () => {
    const partial: Partial<UserInputs> = {
      transactionType: 'carve-out',
      productType: 'deep-tech-ip',
      geographies: ['us'],
    };
    const params = serializeToParams(partial);
    const restored = deserializeFromParams(params);
    expect(restored).toEqual(partial);
    // Other 10 fields are NOT present (no invented defaults).
    expect(restored.headcount).toBeUndefined();
    expect(restored.businessModel).toBeUndefined();
  });

  it('empty inputs produce empty params', () => {
    const params = serializeToParams({});
    expect(params.toString()).toBe('');
  });

  it('empty geographies array is dropped (not encoded as ge=)', () => {
    const params = serializeToParams({ geographies: [] });
    expect(params.has('ge')).toBe(false);
  });

  it("'unknown' sentinel (BL-031.95) passes through encoding unchanged", () => {
    const allUnknown: UserInputs = {
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
    const params = serializeToParams(allUnknown);
    const restored = deserializeFromParams(params);
    expect(restored).toEqual(allUnknown);
  });
});

describe('diligence-url — encoding details', () => {
  it('uses compact single-letter URL keys', () => {
    const params = serializeToParams(fullInputs);
    expect(params.get('tt')).toBe('majority-stake');
    expect(params.get('pt')).toBe('b2b-saas');
    expect(params.get('ge')).toBe('us,eu');
    expect(params.get('om')).toBe('product-aligned-teams');
  });

  it('full-payload URL stays under the 2000-char browser limit', () => {
    const params = serializeToParams(fullInputs);
    const url = `/hub/tools/diligence-machine/?${params.toString()}`;
    expect(url.length).toBeLessThan(2000);
  });
});

describe('diligence-url — deserialization edge cases', () => {
  it('invalid URL keys are silently ignored (forward-compat)', () => {
    const params = new URLSearchParams('tt=full-acquisition&zz=bogus&xx=value');
    const restored = deserializeFromParams(params);
    expect(restored.transactionType).toBe('full-acquisition');
    // zz / xx aren't in the encoder's vocabulary; nothing else surfaces.
    expect(Object.keys(restored)).toEqual(['transactionType']);
  });

  it('comma-separated geographies parse to array, trimming and filtering empties', () => {
    const params = new URLSearchParams('ge=us, eu , ,apac');
    const restored = deserializeFromParams(params);
    expect(restored.geographies).toEqual(['us', 'eu', 'apac']);
  });

  it('empty parameter values are dropped (treated as not supplied)', () => {
    const params = new URLSearchParams('tt=&pt=b2b-saas&ge=');
    const restored = deserializeFromParams(params);
    expect(restored.transactionType).toBeUndefined();
    expect(restored.productType).toBe('b2b-saas');
    expect(restored.geographies).toBeUndefined();
  });
});
