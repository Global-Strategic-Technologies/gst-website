/**
 * Wizard Step Configuration for The Diligence Machine
 *
 * The wizard's structure: its steps, their input types, and the option ids
 * the engine and the MCP tool's schema accept. Adding, removing, or
 * reordering steps starts here; the page renders from this data.
 *
 * The words live in the `diligence-machine` catalog
 * (`src/i18n/<locale>/diligence-machine.json`), keyed by these ids —
 * `step.<stepId>.title|navLabel|subtitle`, `field.<fieldId>.label` and
 * `option.<stepOrFieldId>.<optionId>.label|description` — because only the
 * page shows them (BL-153 Tier B). Validated at build time against
 * `WizardStepsArraySchema`.
 */

import type { WizardOption, WizardField, WizardStep } from '../../schemas/diligence';

export type { WizardOption, WizardField, WizardStep };

/**
 * Canonical option ID tuples — the source of truth for valid input values
 * consumed by `UserInputsSchema` in `src/schemas/diligence.ts`.
 *
 * Adding an option here without mirroring it in `WIZARD_STEPS` (or vice versa)
 * fails the subset-invariant test in `tests/unit/diligence-wizard-schema.test.ts`.
 */
export const TRANSACTION_TYPE_IDS = [
  'full-acquisition',
  'majority-stake',
  'business-integration',
  'carve-out',
  'venture-series',
] as const;

export const PRODUCT_TYPE_IDS = [
  'b2b-saas',
  'b2c-marketplace',
  'on-premise-enterprise',
  'deep-tech-ip',
  'tech-enabled-service',
] as const;

export const TECH_ARCHETYPE_IDS = [
  'modern-cloud-native',
  'hybrid-legacy',
  'self-managed-infra',
  'datacenter-vendor',
] as const;

export const HEADCOUNT_IDS = ['1-50', '51-200', '201-500', '500+'] as const;
export const REVENUE_RANGE_IDS = ['0-5m', '5-25m', '25-100m', '100m+'] as const;
export const GROWTH_STAGE_IDS = ['early', 'scaling', 'mature'] as const;
export const COMPANY_AGE_IDS = ['under-2yr', '2-5yr', '5-10yr', '10-20yr', '20yr+'] as const;

export const GEOGRAPHY_IDS = [
  'us',
  'canada',
  'eu',
  'uk',
  'latam',
  'africa',
  'apac',
  'multi-region',
] as const;

export const BUSINESS_MODEL_IDS = [
  'productized-platform',
  'customized-deployments',
  'services-led',
  'usage-based',
  'ip-licensing',
] as const;

export const SCALE_INTENSITY_IDS = ['low', 'moderate', 'high'] as const;

export const TRANSFORMATION_STATE_IDS = [
  'stable',
  'mid-migration',
  'actively-modernizing',
  'recently-modernized',
] as const;

export const DATA_SENSITIVITY_IDS = ['low', 'moderate', 'high'] as const;

export const OPERATING_MODEL_IDS = [
  'centralized-eng',
  'product-aligned-teams',
  'outsourced-heavy',
  'hybrid',
] as const;

const wizardStepsData: WizardStep[] = [
  {
    id: 'transaction-type',
    inputType: 'single-select',
    options: [
      { id: 'full-acquisition' },
      { id: 'majority-stake' },
      { id: 'business-integration' },
      { id: 'carve-out' },
      { id: 'venture-series' },
    ],
  },
  {
    id: 'product-type',
    inputType: 'single-select',
    options: [
      { id: 'b2b-saas' },
      { id: 'b2c-marketplace' },
      { id: 'on-premise-enterprise' },
      { id: 'deep-tech-ip' },
      { id: 'tech-enabled-service' },
    ],
  },
  {
    id: 'tech-archetype',
    inputType: 'single-select',
    options: [
      { id: 'modern-cloud-native' },
      { id: 'hybrid-legacy' },
      { id: 'self-managed-infra' },
      { id: 'datacenter-vendor' },
    ],
  },
  {
    id: 'company-profile',
    inputType: 'compound',
    fields: [
      {
        id: 'headcount',
        inputType: 'select',
        options: [{ id: '1-50' }, { id: '51-200' }, { id: '201-500' }, { id: '500+' }],
      },
      {
        id: 'revenue-range',
        inputType: 'select',
        options: [{ id: '0-5m' }, { id: '5-25m' }, { id: '25-100m' }, { id: '100m+' }],
      },
      {
        id: 'growth-stage',
        inputType: 'select',
        options: [{ id: 'early' }, { id: 'scaling' }, { id: 'mature' }],
      },
      {
        id: 'company-age',
        inputType: 'select',
        options: [
          { id: 'under-2yr' },
          { id: '2-5yr' },
          { id: '5-10yr' },
          { id: '10-20yr' },
          { id: '20yr+' },
        ],
      },
    ],
  },
  {
    id: 'geography',
    inputType: 'multi-select',
    options: [
      { id: 'us' },
      { id: 'canada' },
      { id: 'eu' },
      { id: 'uk' },
      { id: 'latam' },
      { id: 'africa' },
      { id: 'apac' },
      { id: 'multi-region' },
    ],
  },
  {
    id: 'business-model',
    inputType: 'single-select',
    options: [
      { id: 'productized-platform' },
      { id: 'customized-deployments' },
      { id: 'services-led' },
      { id: 'usage-based' },
      { id: 'ip-licensing' },
    ],
  },
  {
    id: 'scale-intensity',
    inputType: 'single-select',
    options: [{ id: 'low' }, { id: 'moderate' }, { id: 'high' }],
  },
  {
    id: 'transformation-state',
    inputType: 'single-select',
    options: [
      { id: 'stable' },
      { id: 'mid-migration' },
      { id: 'actively-modernizing' },
      { id: 'recently-modernized' },
    ],
  },
  {
    id: 'data-sensitivity',
    inputType: 'single-select',
    options: [{ id: 'low' }, { id: 'moderate' }, { id: 'high' }],
  },
  {
    id: 'operating-model',
    inputType: 'single-select',
    options: [
      { id: 'centralized-eng' },
      { id: 'product-aligned-teams' },
      { id: 'outsourced-heavy' },
      { id: 'hybrid' },
    ],
  },
];

// Validated at build time via unit tests. Type assertion avoids shipping Zod to client bundles.
export const WIZARD_STEPS = wizardStepsData as WizardStep[];

/** Ordinal bracket ordering for comparative conditions */
export const BRACKET_ORDER = {
  headcount: ['1-50', '51-200', '201-500', '500+'],
  'revenue-range': ['0-5m', '5-25m', '25-100m', '100m+'],
  'company-age': ['under-2yr', '2-5yr', '5-10yr', '10-20yr', '20yr+'],
} as const;
