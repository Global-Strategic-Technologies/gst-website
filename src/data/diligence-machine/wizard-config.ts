/**
 * Wizard Step Configuration for The Diligence Machine
 *
 * Each step is a typed config object. Adding, removing, or reordering steps
 * requires only changes to this file — the UI renders from this data.
 * Validated at build time against `WizardStepsArraySchema`.
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
    title: 'Transaction Type',
    navLabel: 'Transaction',
    subtitle: 'What type of deal is being evaluated?',
    inputType: 'single-select',
    options: [
      {
        id: 'full-acquisition',
        label: 'Full Acquisition',
        description: 'Complete purchase of the target entity',
      },
      {
        id: 'majority-stake',
        label: 'Majority Stake',
        description: 'Controlling interest with existing ownership retained',
      },
      {
        id: 'business-integration',
        label: 'Portfolio Integration',
        description: 'Merging operations of two existing entities',
      },
      {
        id: 'carve-out',
        label: 'Carve-out',
        description: 'Separation of a business unit from a parent company',
      },
      {
        id: 'venture-series',
        label: 'Venture Series A/B',
        description: 'Growth-stage equity investment round',
      },
    ],
  },
  {
    id: 'product-type',
    title: 'Product Type',
    navLabel: 'Product',
    subtitle: 'What does the target company build or deliver?',
    inputType: 'single-select',
    options: [
      {
        id: 'b2b-saas',
        label: 'B2B SaaS',
        description: 'Cloud-hosted software sold to businesses',
      },
      {
        id: 'b2c-marketplace',
        label: 'B2C Marketplace',
        description: 'Consumer-facing platform connecting buyers and sellers',
      },
      {
        id: 'on-premise-enterprise',
        label: 'On-Premise Enterprise',
        description: 'Software deployed within customer infrastructure',
      },
      {
        id: 'deep-tech-ip',
        label: 'Deep-Tech / IP',
        description: 'Technology driven by proprietary research or patents',
      },
      {
        id: 'tech-enabled-service',
        label: 'Tech-Enabled Business / Service Company',
        description: 'Service delivery augmented by proprietary technology',
      },
    ],
  },
  {
    id: 'tech-archetype',
    title: 'Tech Stack Archetype',
    navLabel: 'Tech Stack',
    subtitle: 'How is the technology infrastructure provisioned?',
    inputType: 'single-select',
    options: [
      {
        id: 'modern-cloud-native',
        label: 'Modern Cloud Native',
        description: 'Built on public cloud with containerization and IaC',
      },
      {
        id: 'hybrid-legacy',
        label: 'Hybrid Legacy',
        description: 'Mix of cloud services and legacy on-premise systems',
      },
      {
        id: 'self-managed-infra',
        label: 'Self-Managed Infrastructure',
        description: 'On-premises servers owned and operated by the company',
      },
      {
        id: 'datacenter-vendor',
        label: 'Datacenter Vendor',
        description: 'Hardware housed in third-party data centers',
      },
    ],
  },
  {
    id: 'company-profile',
    title: 'Company Profile',
    navLabel: 'Company',
    subtitle: "Describe the target company's scale and maturity.",
    inputType: 'compound',
    fields: [
      {
        id: 'headcount',
        label: 'Target Size (Headcount)',
        inputType: 'select',
        options: [
          { id: '1-50', label: '1 \u2013 50' },
          { id: '51-200', label: '51 \u2013 200' },
          { id: '201-500', label: '201 \u2013 500' },
          { id: '500+', label: '500+' },
        ],
      },
      {
        id: 'revenue-range',
        label: 'Revenue Range',
        inputType: 'select',
        options: [
          { id: '0-5m', label: '$0 \u2013 $5M' },
          { id: '5-25m', label: '$5M \u2013 $25M' },
          { id: '25-100m', label: '$25M \u2013 $100M' },
          { id: '100m+', label: '$100M+' },
        ],
      },
      {
        id: 'growth-stage',
        label: 'Growth Stage',
        inputType: 'select',
        options: [
          { id: 'early', label: 'Early' },
          { id: 'scaling', label: 'Scaling' },
          { id: 'mature', label: 'Mature' },
        ],
      },
      {
        id: 'company-age',
        label: 'Company Age',
        inputType: 'select',
        options: [
          { id: 'under-2yr', label: 'Under 2 years' },
          { id: '2-5yr', label: '2 \u2013 5 years' },
          { id: '5-10yr', label: '5 \u2013 10 years' },
          { id: '10-20yr', label: '10 \u2013 20 years' },
          { id: '20yr+', label: '20+ years' },
        ],
      },
    ],
  },
  {
    id: 'geography',
    title: 'Geography',
    navLabel: 'Geography',
    subtitle: 'Where does the target operate? Select all that apply.',
    inputType: 'multi-select',
    options: [
      {
        id: 'us',
        label: 'United States',
        description: 'North American operations',
      },
      {
        id: 'canada',
        label: 'Canada',
        description: 'Canadian operations',
      },
      {
        id: 'eu',
        label: 'European Union',
        description: 'EU member state operations',
      },
      {
        id: 'uk',
        label: 'United Kingdom',
        description: 'UK operations (post-Brexit)',
      },
      {
        id: 'latam',
        label: 'Latin America',
        description: 'LATAM regional operations',
      },
      {
        id: 'africa',
        label: 'Africa',
        description: 'African continent operations',
      },
      {
        id: 'apac',
        label: 'Asia-Pacific',
        description: 'APAC regional operations',
      },
      {
        id: 'multi-region',
        label: 'Multi-Region',
        description: 'Operations spanning geographies',
      },
    ],
  },
  {
    id: 'business-model',
    title: 'Business Model',
    navLabel: 'Business',
    subtitle: 'What is the primary delivery and monetization model?',
    inputType: 'single-select',
    options: [
      {
        id: 'productized-platform',
        label: 'Productized Platform',
        description: 'Self-serve product with platform economics',
      },
      {
        id: 'customized-deployments',
        label: 'Customized Deployments',
        description: 'Tailored implementations for each customer',
      },
      {
        id: 'services-led',
        label: 'Services-Led',
        description: 'Professional services as primary revenue driver',
      },
      {
        id: 'usage-based',
        label: 'Usage-Based',
        description: 'Consumption-based pricing model',
      },
      {
        id: 'ip-licensing',
        label: 'IP Licensing',
        description: 'Revenue from intellectual property licensing',
      },
    ],
  },
  {
    id: 'scale-intensity',
    title: 'Scale Intensity',
    navLabel: 'Scale',
    subtitle: 'What is the operational scale and user volume pressure?',
    inputType: 'single-select',
    options: [
      {
        id: 'low',
        label: 'Low',
        description: 'Internal tools or small user base',
      },
      {
        id: 'moderate',
        label: 'Moderate',
        description: 'Thousands of users with steady growth',
      },
      {
        id: 'high',
        label: 'High',
        description: 'Millions of users or high transaction volume',
      },
    ],
  },
  {
    id: 'transformation-state',
    title: 'Transformation State',
    navLabel: 'Change',
    subtitle: 'What is the current state of technology modernization?',
    inputType: 'single-select',
    options: [
      {
        id: 'stable',
        label: 'Stable',
        description: 'No active modernization; current stack is maintained',
      },
      {
        id: 'mid-migration',
        label: 'Mid-Migration',
        description: 'Actively transitioning between technology stacks',
      },
      {
        id: 'actively-modernizing',
        label: 'Actively Modernizing',
        description: 'Systematic upgrade of architecture and tooling',
      },
      {
        id: 'recently-modernized',
        label: 'Recently Modernized',
        description: 'Major modernization completed within past 12\u201318 months',
      },
    ],
  },
  {
    id: 'data-sensitivity',
    title: 'Data Sensitivity',
    navLabel: 'Data',
    subtitle: 'What is the sensitivity level of the data the target handles?',
    inputType: 'single-select',
    options: [
      {
        id: 'low',
        label: 'Low',
        description: 'Non-sensitive operational data',
      },
      {
        id: 'moderate',
        label: 'Moderate',
        description: 'Business-sensitive data with standard protection requirements',
      },
      {
        id: 'high',
        label: 'High',
        description: 'PII, PHI, financial data, or regulated data categories',
      },
    ],
  },
  {
    id: 'operating-model',
    title: 'Operating Model',
    navLabel: 'Model',
    subtitle: 'How is the engineering organization structured?',
    inputType: 'single-select',
    options: [
      {
        id: 'centralized-eng',
        label: 'Centralized Engineering',
        description: 'Single engineering org with unified leadership',
      },
      {
        id: 'product-aligned-teams',
        label: 'Product-Aligned Teams',
        description: 'Autonomous squads aligned to product areas',
      },
      {
        id: 'outsourced-heavy',
        label: 'Outsourced-Heavy',
        description: 'Significant reliance on external development partners',
      },
      {
        id: 'hybrid',
        label: 'Hybrid',
        description: 'Mix of internal teams and outsourced capabilities',
      },
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

/** Human-readable labels for input summary display */
export function getOptionLabel(stepId: string, optionId: string): string {
  const step = WIZARD_STEPS.find((s) => s.id === stepId);
  if (!step) return optionId;

  if (step.options) {
    const opt = step.options.find((o) => o.id === optionId);
    return opt?.label ?? optionId;
  }

  if (step.fields) {
    for (const field of step.fields) {
      const opt = field.options.find((o) => o.id === optionId);
      if (opt) return opt.label;
    }
  }

  return optionId;
}
