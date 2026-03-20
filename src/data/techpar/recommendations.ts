/**
 * TechPar - Actionable recommendations
 *
 * 5 stages x 6 zones = 30 combinations, each with 2-3 specific
 * actions the user can take based on their zone classification.
 */

import type { Stage, Zone } from '../../utils/techpar-engine';

export const RECOMMENDATIONS: Record<Stage, Record<Zone, string[]>> = {
  seed: {
    underinvest: [
      'Ensure core infrastructure (CI/CD, monitoring, incident response) is resourced before optimising for cost efficiency.',
      'Validate that engineering velocity is not being constrained by tooling or platform limitations.',
    ],
    ahead: [
      'Monitor platform reliability metrics to confirm this efficiency is genuine, not deferred investment.',
      'Document current architecture decisions so the next engineering hire can onboard quickly.',
    ],
    healthy: [
      'Maintain current discipline as the team grows. Set cost alerts on cloud accounts to catch drift early.',
      'Invest in automated testing and deployment pipelines now to avoid velocity bottlenecks at Series A.',
    ],
    above: [
      'Review cloud resource utilisation: identify idle instances, oversized databases, and unused storage.',
      'Evaluate whether current tooling subscriptions are still justified at current team size.',
      'Consider reserved instances or committed use discounts for predictable workloads.',
    ],
    elevated: [
      'Audit cloud architecture for over-provisioned resources and consolidate redundant services.',
      'Review vendor contracts for renegotiation or consolidation opportunities.',
      'Assess whether any R&D spend is compensating for architectural shortcuts that should be addressed directly.',
    ],
    critical: [
      'Commission a technology cost audit focused on the three largest spend categories.',
      'Evaluate build-vs-buy decisions for non-core platform services.',
      'Review team structure for role overlap or misaligned resourcing between infrastructure and product engineering.',
    ],
  },
  series_a: {
    underinvest: [
      'Assess whether engineering capacity is sufficient to execute on the product roadmap at scale.',
      'Validate that infrastructure can handle projected user growth without emergency spend.',
    ],
    ahead: [
      'Ensure platform reliability SLAs are being met. Low spend should not come at the cost of uptime.',
      'Confirm that engineering tooling is not creating velocity bottlenecks masked by low headcount costs.',
    ],
    healthy: [
      'Establish cost-per-customer or cost-per-transaction metrics to track efficiency as you scale.',
      'Set quarterly review cadence for cloud costs to catch drift before it becomes structural.',
    ],
    above: [
      'Implement cloud cost tagging by team and service to identify the largest contributors.',
      'Review engineering tooling subscriptions for overlapping capabilities.',
      'Evaluate whether contractor or outsourced engineering is cost-effective relative to full-time hires.',
    ],
    elevated: [
      'Prioritise cloud cost optimisation: reserved instances, right-sizing, and storage tiering.',
      'Audit R&D tooling for consolidation: CI/CD, monitoring, project management, and communication platforms.',
      'Review engineering team structure for alignment between headcount and roadmap priorities.',
    ],
    critical: [
      'Engage a cloud cost optimisation partner or conduct a formal technology spend audit.',
      'Evaluate architectural decisions that may be driving disproportionate infrastructure costs.',
      'Assess whether current engineering headcount is matched to the right projects.',
    ],
  },
  series_bc: {
    underinvest: [
      'Validate that infrastructure reliability and engineering velocity support your growth targets.',
      'Assess whether deferred technology investment is creating hidden technical debt.',
    ],
    ahead: [
      'Document the practices driving this efficiency so they can be preserved as the organisation scales.',
      'Monitor for early signs of reliability or scalability constraints that low spend may be masking.',
    ],
    healthy: [
      'Establish unit economics for technology cost (cost per customer, cost per transaction).',
      'Set up automated alerting for cloud cost anomalies and budget overruns.',
    ],
    above: [
      'Implement granular cloud cost allocation by team, product, and environment.',
      'Review reserved instance and committed use discount coverage across all cloud providers.',
      'Audit engineering tooling: consolidate overlapping SaaS subscriptions and renegotiate enterprise agreements.',
    ],
    elevated: [
      'Commission a cloud architecture review focused on cost-driven refactoring opportunities.',
      'Evaluate multi-cloud strategy: consolidation to a primary provider often reduces management overhead and unlocks volume discounts.',
      'Review engineering team productivity metrics to ensure headcount is translating to output.',
    ],
    critical: [
      'Engage a technology cost optimisation firm to identify structural inefficiencies.',
      'Prioritise architectural refactoring for the highest-cost services.',
      'Evaluate vendor contracts for renegotiation, consolidation, or replacement with open-source alternatives.',
    ],
  },
  pe: {
    underinvest: [
      'Assess reliability and incident frequency. Low spend may be creating execution risk at exit.',
      'Validate that engineering capacity supports the value creation plan and roadmap commitments.',
    ],
    ahead: [
      'Document the technology cost story for sell-side materials. This efficiency is a value driver.',
      'Confirm that this position is sustainable and not dependent on deferred maintenance or technical debt.',
    ],
    healthy: [
      'Maintain cost discipline through the hold period. Establish quarterly cost reviews with portfolio operations.',
      'Benchmark individual cost categories to identify optimisation opportunities within the healthy range.',
    ],
    above: [
      'Review cloud contracts: reserved instances, committed use discounts, and vendor consolidation opportunities.',
      'Audit engineering tooling subscriptions for unused seats, overlapping capabilities, and renegotiation leverage.',
      'Evaluate build-vs-buy decisions for non-core platform services.',
    ],
    elevated: [
      'Prioritise cloud cost optimisation as a near-term value creation initiative with measurable EBITDA impact.',
      'Assess engineering team structure: ratio of infrastructure to product engineering headcount.',
      'Review vendor agreements for multi-year commitments that can be restructured or consolidated.',
    ],
    critical: [
      'Engage a technology cost optimisation firm to scope a 90-day cost reduction plan.',
      'Evaluate architectural modernisation opportunities that reduce ongoing run-rate costs.',
      'Assess whether current engineering leadership has the operational focus to drive cost discipline.',
    ],
  },
  enterprise: {
    underinvest: [
      'Review infrastructure modernisation backlog. Legacy system maintenance costs tend to accelerate.',
      'Validate that engineering capacity supports both maintenance obligations and strategic initiatives.',
    ],
    ahead: [
      'Ensure this efficiency is not masking deferred modernisation or accumulated technical debt.',
      'Document cost management practices as institutional knowledge for the technology leadership team.',
    ],
    healthy: [
      'Establish annual benchmarking cadence against peers to track relative position.',
      'Focus optimisation efforts on specific cost categories rather than across-the-board reductions.',
    ],
    above: [
      'Conduct a cloud and vendor contract rationalisation review across all business units.',
      'Evaluate legacy system maintenance costs and assess modernisation ROI.',
      'Review engineering headcount allocation between maintenance, support, and strategic projects.',
    ],
    elevated: [
      'Engage procurement to renegotiate top-10 vendor contracts with a target of 15-20% reduction.',
      'Prioritise infrastructure modernisation for services with the highest run-rate costs.',
      'Evaluate shared services consolidation across business units or product lines.',
    ],
    critical: [
      'Commission a comprehensive technology rationalisation programme with executive sponsorship.',
      'Evaluate cloud migration or consolidation strategy for on-premise workloads.',
      'Assess organisational structure for redundant technology teams across business units.',
    ],
  },
};
