/**
 * TechPar - Industry context notes
 *
 * 5 industry types with contextual guidance for the Analysis tab.
 * Benchmarks remain SaaS-derived; these notes explain how other
 * industries typically differ so users can apply professional judgment.
 */

export type Industry = 'saas' | 'fintech' | 'marketplace' | 'infra_hw' | 'other';

export interface IndustryNote {
  label: string;
  note: string;
  disclaimer: string;
}

export const INDUSTRY_NOTES: Record<Industry, IndustryNote> = {
  saas: {
    label: 'SaaS',
    note: '',
    disclaimer: 'These benchmarks are derived from SaaS company data and are directly applicable to your business model.',
  },
  fintech: {
    label: 'Fintech',
    note: 'Fintech companies typically carry 10-20% higher infrastructure costs than pure SaaS due to compliance infrastructure, payment processing, and data security requirements. R&D ratios are comparable, but regulatory engineering and audit readiness can drive personnel costs above benchmark. Consider adjusting the healthy range upward by 5-10 percentage points when interpreting results.',
    disclaimer: 'These benchmarks are derived primarily from SaaS company data. Fintech companies typically carry higher infrastructure and compliance costs. Apply professional judgment when interpreting zone classifications.',
  },
  marketplace: {
    label: 'Marketplace',
    note: 'Marketplace businesses often show lower technology-to-revenue ratios than SaaS because revenue recognition differs. Technology cost as a percentage of GMV is often a more relevant metric than technology cost as a percentage of net revenue. If you entered net revenue, your ratios may appear healthier than the underlying economics suggest. If you entered GMV, ratios will appear elevated relative to SaaS benchmarks.',
    disclaimer: 'These benchmarks are derived primarily from SaaS company data. Marketplace revenue recognition differs materially. Consider whether net revenue or GMV is the appropriate denominator for your analysis.',
  },
  infra_hw: {
    label: 'Infra / Hardware',
    note: 'Infrastructure and hardware-intensive companies carry cost structures that differ fundamentally from SaaS. Hardware COGS, manufacturing R&D, and embedded software development are not captured in these benchmarks. Software-only technology spend as a percentage of revenue is typically 5-15 percentage points lower than SaaS norms at the same stage. Use these results as a directional reference for the software layer only.',
    disclaimer: 'These benchmarks are derived primarily from SaaS company data. Infrastructure and hardware-intensive models have fundamentally different cost structures. Results reflect the software technology layer only.',
  },
  other: {
    label: 'Other',
    note: 'Your industry may have cost structures that differ from SaaS benchmarks. Use these results as a directional reference and validate against industry-specific data where available. The zone classifications and trajectory projections remain useful for identifying trends, even if the absolute thresholds require adjustment.',
    disclaimer: 'These benchmarks are derived primarily from SaaS company data. Companies in non-SaaS verticals may observe materially different cost structures. Apply professional judgment when interpreting results.',
  },
};

export const INDUSTRY_KEYS: Industry[] = ['saas', 'fintech', 'marketplace', 'infra_hw', 'other'];
