/**
 * Subset-invariant tests for the Diligence Machine input schema.
 *
 * `UserInputsSchema` (in `src/schemas/diligence.ts`) and `WIZARD_STEPS` (in
 * `src/data/diligence-machine/wizard-config.ts`) must agree on the canonical
 * option IDs for every step. Drift in either direction is caught here:
 *
 * 1. Every wizard option that the UI renders must validate against the schema.
 * 2. The schema's enums must be a superset of the wizard's option IDs.
 *
 * Adding an option to the wizard without updating the schema (or vice versa)
 * fails this test in CI.
 */

import { z } from 'zod';
import {
  WIZARD_STEPS,
  TRANSACTION_TYPE_IDS,
  PRODUCT_TYPE_IDS,
  TECH_ARCHETYPE_IDS,
  HEADCOUNT_IDS,
  REVENUE_RANGE_IDS,
  GROWTH_STAGE_IDS,
  COMPANY_AGE_IDS,
  GEOGRAPHY_IDS,
  BUSINESS_MODEL_IDS,
  SCALE_INTENSITY_IDS,
  TRANSFORMATION_STATE_IDS,
  DATA_SENSITIVITY_IDS,
  OPERATING_MODEL_IDS,
} from '../../src/data/diligence-machine/wizard-config';
import { UserInputsSchema } from '../../src/schemas/diligence';

function getStepOptionIds(stepId: string): string[] {
  const step = WIZARD_STEPS.find((s) => s.id === stepId);
  if (!step) throw new Error(`Wizard step "${stepId}" not found`);
  if (step.options) return step.options.map((o) => o.id);
  if (step.fields) return step.fields.flatMap((f) => f.options.map((o) => o.id));
  throw new Error(`Step "${stepId}" has neither options nor fields`);
}

function getCompoundFieldOptionIds(stepId: string, fieldId: string): string[] {
  const step = WIZARD_STEPS.find((s) => s.id === stepId);
  if (!step?.fields) throw new Error(`Step "${stepId}" has no compound fields`);
  const field = step.fields.find((f) => f.id === fieldId);
  if (!field) throw new Error(`Field "${fieldId}" not found in step "${stepId}"`);
  return field.options.map((o) => o.id);
}

describe('UserInputsSchema ↔ WIZARD_STEPS subset invariant', () => {
  const cases: Array<{
    name: string;
    wizardIds: string[];
    schemaIds: readonly string[];
  }> = [
    {
      name: 'transactionType',
      wizardIds: getStepOptionIds('transaction-type'),
      schemaIds: TRANSACTION_TYPE_IDS,
    },
    {
      name: 'productType',
      wizardIds: getStepOptionIds('product-type'),
      schemaIds: PRODUCT_TYPE_IDS,
    },
    {
      name: 'techArchetype',
      wizardIds: getStepOptionIds('tech-archetype'),
      schemaIds: TECH_ARCHETYPE_IDS,
    },
    {
      name: 'headcount',
      wizardIds: getCompoundFieldOptionIds('company-profile', 'headcount'),
      schemaIds: HEADCOUNT_IDS,
    },
    {
      name: 'revenueRange',
      wizardIds: getCompoundFieldOptionIds('company-profile', 'revenue-range'),
      schemaIds: REVENUE_RANGE_IDS,
    },
    {
      name: 'growthStage',
      wizardIds: getCompoundFieldOptionIds('company-profile', 'growth-stage'),
      schemaIds: GROWTH_STAGE_IDS,
    },
    {
      name: 'companyAge',
      wizardIds: getCompoundFieldOptionIds('company-profile', 'company-age'),
      schemaIds: COMPANY_AGE_IDS,
    },
    {
      name: 'geographies',
      wizardIds: getStepOptionIds('geography'),
      schemaIds: GEOGRAPHY_IDS,
    },
    {
      name: 'businessModel',
      wizardIds: getStepOptionIds('business-model'),
      schemaIds: BUSINESS_MODEL_IDS,
    },
    {
      name: 'scaleIntensity',
      wizardIds: getStepOptionIds('scale-intensity'),
      schemaIds: SCALE_INTENSITY_IDS,
    },
    {
      name: 'transformationState',
      wizardIds: getStepOptionIds('transformation-state'),
      schemaIds: TRANSFORMATION_STATE_IDS,
    },
    {
      name: 'dataSensitivity',
      wizardIds: getStepOptionIds('data-sensitivity'),
      schemaIds: DATA_SENSITIVITY_IDS,
    },
    {
      name: 'operatingModel',
      wizardIds: getStepOptionIds('operating-model'),
      schemaIds: OPERATING_MODEL_IDS,
    },
  ];

  it.each(cases)(
    'every wizard option for $name is a member of the schema enum',
    ({ wizardIds, schemaIds }) => {
      const schemaSet = new Set<string>(schemaIds);
      const orphaned = wizardIds.filter((id) => !schemaSet.has(id));
      expect(orphaned).toEqual([]);
    }
  );

  it.each(cases)(
    'no schema enum value for $name is missing from the wizard options',
    ({ wizardIds, schemaIds }) => {
      const wizardSet = new Set<string>(wizardIds);
      const orphaned = schemaIds.filter((id) => !wizardSet.has(id));
      expect(orphaned).toEqual([]);
    }
  );

  it('a fully-populated wizard payload validates cleanly', () => {
    const sample = {
      transactionType: 'majority-stake' as const,
      productType: 'b2b-saas' as const,
      techArchetype: 'modern-cloud-native' as const,
      headcount: '51-200' as const,
      revenueRange: '5-25m' as const,
      growthStage: 'scaling' as const,
      companyAge: '5-10yr' as const,
      geographies: ['us', 'eu'] as const,
      businessModel: 'productized-platform' as const,
      scaleIntensity: 'moderate' as const,
      transformationState: 'actively-modernizing' as const,
      dataSensitivity: 'high' as const,
      operatingModel: 'product-aligned-teams' as const,
    };
    expect(() => UserInputsSchema.parse(sample)).not.toThrow();
  });

  it('rejects a payload with an invalid enum value', () => {
    const bad = {
      transactionType: 'not-a-real-type',
      productType: 'b2b-saas',
      techArchetype: 'modern-cloud-native',
      headcount: '51-200',
      revenueRange: '5-25m',
      growthStage: 'scaling',
      companyAge: '5-10yr',
      geographies: ['us'],
      businessModel: 'productized-platform',
      scaleIntensity: 'moderate',
      transformationState: 'stable',
      dataSensitivity: 'low',
      operatingModel: 'hybrid',
    };
    const result = UserInputsSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = z.flattenError(result.error);
      expect(flat.fieldErrors.transactionType).toBeDefined();
    }
  });

  it('rejects an empty geographies array', () => {
    const bad = {
      transactionType: 'majority-stake',
      productType: 'b2b-saas',
      techArchetype: 'modern-cloud-native',
      headcount: '51-200',
      revenueRange: '5-25m',
      growthStage: 'scaling',
      companyAge: '5-10yr',
      geographies: [] as string[],
      businessModel: 'productized-platform',
      scaleIntensity: 'moderate',
      transformationState: 'stable',
      dataSensitivity: 'low',
      operatingModel: 'hybrid',
    };
    const result = UserInputsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
