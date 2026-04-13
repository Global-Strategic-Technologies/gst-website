/**
 * Attention Areas for The Diligence Machine
 *
 * Attention areas are considerations injected into the output based on
 * combinations of tech archetype, company age, and other inputs.
 * Validated at build time against `AttentionAreasArraySchema`.
 */

import { AttentionAreasArraySchema, type AttentionArea } from '../../schemas/diligence';
import { validateDataSource } from '../../utils/validateData';

export type { AttentionArea };

const attentionAreasData: AttentionArea[] = [
  {
    id: 'attention-hw-eol',
    title: 'Hardware End-of-Life Exposure',
    description:
      "On-premise infrastructure can provide predictable cost and data-sovereignty control that cloud models often lack. However, in companies over 10 years old, it can also mask a 'silent' CapEx cycle as hardware approaches end-of-life. Validate the asset inventory, vendor support status, and refresh/migration plan, then quantify capex, downtime risk, and integration impact.",
    relevance: 'high',
    conditions: {
      techArchetypes: ['self-managed-infra'],
      companyAgeMin: '10-20yr',
    },
  },
  {
    id: 'attention-colo-hw',
    title: 'Colocation Hardware Lifecycle',
    description:
      'Datacenter colocation deployments in mature companies often rely on aging hardware with limited vendor support. Assess the remaining useful life of physical assets and the existence of a documented migration plan.',
    relevance: 'high',
    conditions: {
      techArchetypes: ['datacenter-vendor'],
      companyAgeMin: '10-20yr',
    },
  },
  {
    id: 'attention-tech-debt',
    title: 'Technical Debt Accumulation',
    description:
      'Technical debt is a strategic tool; it allows teams to ship fast. In mature targets, the question is whether that debt is managed (serviced regularly) or delinquent (stalling the roadmap). Delinquent debt forces Day 100 capital to shift from growth to foundational repairs; validate by reviewing roadmap slippage drivers, rework rates, and recurring reliability issues tied to legacy constraints.',
    relevance: 'medium',
    conditions: {
      techArchetypes: ['hybrid-legacy'],
      companyAgeMin: '5-10yr',
    },
  },
  {
    id: 'attention-key-person',
    title: 'Key-Person Technical Dependencies',
    description:
      'Small engineering teams (under 50) in on-premise or self-managed environments often concentrate critical knowledge in 1-2 individuals. Assess key person dependencies, risks and knowledge gaps before close.',
    relevance: 'high',
    conditions: {
      techArchetypes: ['on-premise-enterprise', 'self-managed-infra'],
      headcountMin: '1-50',
    },
  },
  {
    id: 'attention-ip-docs',
    title: 'IP Documentation Gaps',
    description:
      'Early-stage deep-tech companies frequently have undocumented IP, informal patent strategies, and research code that lacks production-grade engineering. Verify IP ownership chain and documentation completeness.',
    relevance: 'medium',
    conditions: {
      productTypes: ['deep-tech-ip'],
      growthStages: ['early'],
    },
  },
  {
    id: 'attention-manual-ops',
    title: 'Manual Operations Dependency',
    description:
      'Tech-enabled service companies with mature operations often mask manual processes behind a technology facade. Validate the actual automation ratio before projecting margin improvement.',
    relevance: 'medium',
    conditions: {
      productTypes: ['tech-enabled-service'],
      growthStages: ['scaling', 'mature'],
    },
  },
  {
    id: 'attention-labor-specialist',
    title: 'Specialized Labor Dependencies',
    description:
      'Self-managed infrastructure and datacenter colocations require specialized operations staff or datacenter vendors (network engineers, hardware technicians) that are increasingly scarce and expensive in the labor market.',
    relevance: 'medium',
    conditions: {
      techArchetypes: ['self-managed-infra', 'datacenter-vendor'],
    },
  },
  {
    id: 'attention-carveout-entangle',
    title: 'Carve-out Technology Entanglement',
    description:
      'Carve-outs from parent companies in hybrid legacy environments carry elevated separation complexity. Shared databases, identity systems, and network infrastructure create interdependencies that extend transition timelines.',
    relevance: 'high',
    conditions: {
      transactionTypes: ['carve-out'],
      techArchetypes: ['hybrid-legacy'],
    },
  },
  {
    id: 'attention-gdpr-multi',
    title: 'Cross-Border Data Compliance',
    description:
      'Multi-region operations require careful navigation of GDPR (EU/UK), LGPD (LATAM), POPIA (Africa), APAC data residency laws, and cross-border data transfer mechanisms. Non-compliance creates material regulatory exposure and can block market access.',
    relevance: 'high',
    conditions: {
      geographies: ['eu', 'uk', 'apac', 'latam', 'africa'],
    },
  },
  {
    id: 'attention-legacy-vendor',
    title: 'Legacy Vendor Lock-in',
    description:
      'On-premise enterprise products in companies over 10 years old frequently have deep vendor dependencies (Oracle, IBM, SAP) with multi-year contracts and high switching costs that constrain modernization options.',
    relevance: 'medium',
    conditions: {
      productTypes: ['on-premise-enterprise'],
      companyAgeMin: '10-20yr',
    },
  },
  {
    id: 'attention-brexit-data',
    title: 'Post-Brexit Data Transfer Complexity',
    description:
      'UK operations require separate GDPR compliance (UK GDPR + DPA 2018) and Standard Contractual Clauses for EU data transfers. Regulatory divergence between UK and EU creates ongoing compliance overhead.',
    relevance: 'medium',
    conditions: {
      geographies: ['uk'],
    },
  },
  {
    id: 'attention-latam-infra',
    title: 'LATAM Infrastructure Maturity',
    description:
      'Latin American markets often face infrastructure challenges including inconsistent cloud service availability, connectivity issues, and varying levels of cybersecurity framework maturity. Budget for potential infrastructure upgrades.',
    relevance: 'medium',
    conditions: {
      geographies: ['latam'],
      techArchetypes: ['modern-cloud-native', 'hybrid-legacy'],
    },
  },
  {
    id: 'attention-africa-regulatory',
    title: 'African Regulatory Fragmentation',
    description:
      'African markets have fragmented data protection and technology regulations across countries (POPIA, Nigeria DPA, Kenya DPA, etc.). Multi-country operations require jurisdiction-specific compliance strategies and local data residency planning.',
    relevance: 'high',
    conditions: {
      geographies: ['africa'],
    },
  },
  {
    id: 'attention-canada-privacy',
    title: 'Canadian Privacy Law Complexity',
    description:
      "Canadian operations face a layered privacy landscape with PIPEDA at the federal level and substantially similar provincial legislation in Quebec (Law 25), Alberta, and British Columbia. Quebec's Law 25 introduces GDPR-like requirements including privacy impact assessments, consent reforms, and data portability rights.",
    relevance: 'medium',
    conditions: {
      geographies: ['canada'],
    },
  },
  {
    id: 'attention-multi-data-transfer',
    title: 'Cross-Border Data Transfer Complexity',
    description:
      'Operating across multiple jurisdictions creates overlapping data transfer obligations (SCCs, adequacy decisions, bilateral agreements). Compliance overhead can scale non-linearly with each additional region, and transfer mechanisms may be invalidated by regulatory or court decisions.',
    relevance: 'high',
    conditions: {
      geographies: ['multi-region'],
    },
  },
  {
    id: 'attention-multi-infra-cost',
    title: 'Multi-Region Infrastructure Cost Multiplier',
    description:
      'Maintaining compliant infrastructure across regions often requires data residency architectures, regional failover, and localized deployments that can multiply infrastructure costs beyond simple scaling. Cloud region selection, latency optimization, and regional redundancy add layers of complexity.',
    relevance: 'medium',
    conditions: {
      geographies: ['multi-region'],
    },
  },
  {
    id: 'attention-multi-vendor-fragmentation',
    title: 'Fragmented Vendor and Contract Landscape',
    description:
      'Multi-region operations often accumulate region-specific vendors, contracts, and licensing terms. Post-acquisition rationalization of these overlapping vendor relationships can be time-consuming and may surface non-transferable or conflicting agreements.',
    relevance: 'medium',
    conditions: {
      geographies: ['multi-region'],
    },
  },
  {
    id: 'attention-multi-regulatory-velocity',
    title: 'Regulatory Change Velocity',
    description:
      'Operating across multiple regulatory environments increases exposure to legislative changes. A new privacy law, data localization requirement, or cybersecurity mandate in any one region can force architecture or process changes that ripple across the entire operation.',
    relevance: 'medium',
    conditions: {
      geographies: ['multi-region'],
    },
  },

  // ─── V2 ATTENTION AREAS ────────────────────────────────────────────────

  {
    id: 'attention-talent-calcification',
    title: 'Talent Calcification',
    description:
      'Companies aged 10+ years in mature growth stages often exhibit talent calcification: long-tenured teams with deep institutional knowledge but limited exposure to modern practices. Post-acquisition modernization may require significant retraining or supplemental hiring.',
    relevance: 'high',
    conditions: {
      companyAgeMin: '10-20yr',
      growthStages: ['mature'],
    },
  },
  {
    id: 'attention-moat-erosion',
    title: 'AI Commodity Risk (Moat Erosion)',
    description:
      "Being an 'AI wrapper' can be a valid GTM strategy for speed. The strategic risk is whether value is derived from proprietary data, workflow integration, and distribution, or whether the company is effectively renting a moat from a larger model provider that could be diminished by pricing, policy, or API changes. Validate what is truly proprietary, how easily competitors can replicate the experience, and whether pricing power has changed over time.",
    relevance: 'high',
    conditions: {
      productTypes: ['b2b-saas'],
    },
  },
  {
    id: 'attention-shadow-it-sprawl',
    title: 'Shadow IT Sprawl',
    description:
      'Large tech-enabled service companies (500+ employees) frequently develop shadow IT: unmanaged tools, scripts, and integrations that bypass centralized governance. This creates security, compliance, and integration risks during diligence.',
    relevance: 'medium',
    conditions: {
      productTypes: ['tech-enabled-service'],
      headcountMin: '500+',
    },
  },
  {
    id: 'attention-manual-ops-masking',
    title: 'Manual Operations Masking',
    description:
      "High revenue with low headcount can signal elite efficiency, or a fragile operating model dependent on concentrated tribal knowledge and manual intervention. If the latter, scaling breaks because the process isn't encoded in systems. Validate by tracing core workflows end-to-end, reviewing exception handling and staffing coverage, and confirming whether runbooks/telemetry exist to reduce person-dependency.",
    relevance: 'high',
    conditions: {
      revenueMin: '25-100m',
      growthStages: ['mature'],
    },
  },

  // ─── V2 DIMENSION-DRIVEN ATTENTION AREAS ───────────────────────────────

  {
    id: 'attention-mid-migration-instability',
    title: 'Mid-Migration Instability',
    description:
      'Companies actively migrating between technology stacks or infrastructure models face elevated operational risk. Dual-run architectures, incomplete data migrations, and split team expertise create performance degradation and incident surface area. Budget 20-30% contingency for migration delays and stabilization costs.',
    relevance: 'high',
    conditions: {
      transformationStates: ['mid-migration'],
    },
  },
  {
    id: 'attention-services-margin-pressure',
    title: 'Services-Led Margin Pressure',
    description:
      'Services-led business models in the $5-25M revenue range face structural margin challenges. High customer acquisition costs, project-based revenue volatility, and labor-intensive delivery limit EBITDA expansion. Assess pathway to productization or SaaS transition before assuming software-like multiples.',
    relevance: 'high',
    conditions: {
      businessModels: ['services-led'],
      revenueMin: '5-25m',
    },
  },
  {
    id: 'attention-sensitive-data-breach',
    title: 'Sensitive Data Breach Liability',
    description:
      'Companies processing high-sensitivity data (PII, PHI, financial records) in the $5-25M revenue range often lack enterprise-grade breach preparedness. Cyber insurance coverage may be inadequate, incident response plans untested, and regulatory fines material relative to EBITDA. Validate security posture through penetration testing and breach simulation before close.',
    relevance: 'high',
    conditions: {
      dataSensitivity: ['high'],
      revenueMin: '5-25m',
    },
  },
  {
    id: 'attention-high-scale-architecture',
    title: 'High-Scale Operational Complexity',
    description:
      'Modern cloud-native architectures under high scale intensity (high transaction volumes, large data pipelines, global user bases) introduce operational complexity that can outpace team maturity. Auto-scaling misconfigurations, cost overruns, and cascading failures become material risks. Verify observability tooling, runbook completeness, and on-call escalation processes.',
    relevance: 'high',
    conditions: {
      scaleIntensity: ['high'],
      techArchetypes: ['modern-cloud-native'],
    },
  },
  {
    id: 'attention-customization-debt',
    title: 'Customization Debt Accumulation',
    description:
      'Customized deployment business models in mid-sized companies (51-200 employees) accumulate customer-specific code branches, configuration sprawl, and non-standard integrations. This technical debt limits velocity, complicates upgrades, and increases support costs. Assess the feasibility of platform consolidation or multi-tenant migration post-acquisition.',
    relevance: 'medium',
    conditions: {
      businessModels: ['customized-deployments'],
      headcountMin: '51-200',
    },
  },
  {
    id: 'attention-data-classification-gap',
    title: 'Data Classification Maturity Gap',
    description:
      'Scaling-stage companies handling high-sensitivity data often have informal data classification and access control practices. Rapid headcount growth outpaces governance maturity, creating insider risk and compliance exposure. Validate data inventory completeness, access audit trails, and employee offboarding procedures.',
    relevance: 'medium',
    conditions: {
      dataSensitivity: ['high'],
      growthStages: ['scaling'],
    },
  },
];

export const ATTENTION_AREAS = validateDataSource(
  AttentionAreasArraySchema,
  attentionAreasData,
  'diligence-machine/attention-areas.ts'
);
