/**
 * Infrastructure Cost Governance — domain and question definitions
 *
 * All question text, domain metadata, and answer options are defined here.
 * Validated at build time against `DomainsArraySchema` and
 * `AnswerOptionsArraySchema` in `src/schemas/icg.ts`.
 */

import {
  AnswerOptionsArraySchema,
  DomainsArraySchema,
  type AnswerOption,
  type Domain,
  type ICGQuestion as Question,
} from '../../schemas/icg';
import { validateDataSource } from '../../utils/validateData';

// Re-exports keep `import { Domain } from 'data/.../domains'` working.
export type { AnswerOption, Domain, Question };

// ─── Answer options ──────────────────────────────────────────────────────────

const answerOptionsData: AnswerOption[] = [
  { score: 0, label: 'Not in place' },
  { score: 1, label: 'Ad hoc' },
  { score: 2, label: 'Established' },
  { score: 3, label: 'Optimized' },
];

export const ANSWER_OPTIONS = validateDataSource(
  AnswerOptionsArraySchema,
  answerOptionsData,
  'icg/domains.ts (ANSWER_OPTIONS)'
);

// ─── Domain definitions ─────────────────────────────────────────────────────

const domainsData: Domain[] = [
  {
    id: 'd1',
    name: 'Visibility and Tagging',
    description: 'Can you see where the money goes?',
    weight: 1.5,
    foundational: true,
    questions: [
      {
        id: 'q1_1',
        domain: 'd1',
        text: 'Are cloud resources tagged by team, service, and environment?',
        rationale:
          'Tagging is the single most important enabler of cost visibility. Without it, optimization efforts operate blind and cost attribution requires manual spreadsheet work.',
      },
      {
        id: 'q1_2',
        domain: 'd1',
        text: 'Do engineering leads have direct access to a cloud cost dashboard?',
        rationale:
          'When cost data is gated behind finance or a ticket queue, engineering decisions are made without cost context. Direct dashboard access closes the feedback loop between architecture choices and their cost impact.',
      },
      {
        id: 'q1_3',
        domain: 'd1',
        text: 'Is there a named owner who reviews cloud spend at least weekly and has authority to act?',
        rationale:
          'Cost optimization without ownership stalls. A named owner with review authority ensures spend anomalies are caught early and that optimization is a continuous practice, not a one-time project.',
      },
    ],
  },
  {
    id: 'd2',
    name: 'Account Structure and Attribution',
    description: 'Is spend structurally isolated so attribution is automatic?',
    weight: 1.5,
    foundational: true,
    questions: [
      {
        id: 'q2_1',
        domain: 'd2',
        text: 'Are cloud billing accounts or projects segregated by environment (production, staging, development)?',
        rationale:
          'Environment segregation is the foundational first step in cost structure. Without it, non-production spend obscures production unit economics and makes cost anomaly detection unreliable.',
      },
      {
        id: 'q2_2',
        domain: 'd2',
        text: 'Are cloud billing accounts or projects segregated by service, application, or product?',
        rationale:
          'Service-level segregation enables clean unit economics per product, a key diligence requirement. It makes margin analysis possible without manual allocation.',
      },
      {
        id: 'q2_3',
        domain: 'd2',
        text: 'Are cloud billing accounts or projects segregated by team or business unit?',
        rationale:
          'Team-level segregation enables chargeback and showback models, creating natural accountability boundaries. Without it, cost ownership is ambiguous during scaling.',
      },
      {
        id: 'q2_4',
        domain: 'd2',
        text: 'Can finance or leadership pull per-product cloud cost reports without engineering involvement?',
        rationale:
          'Self-service cost reporting is a sign of structural maturity. If leadership needs to file a ticket to see spend by product, cost governance is bottlenecked on engineering bandwidth.',
      },
    ],
  },
  {
    id: 'd3',
    name: 'Right-Sizing and Utilization',
    description: 'Are you paying for what you use?',
    weight: 1.0,
    foundational: false,
    questions: [
      {
        id: 'q3_1',
        domain: 'd3',
        text: 'Is compute utilization monitored with automated right-sizing recommendations surfaced to engineering?',
        rationale:
          'Without utilization monitoring, over-provisioning goes undetected. Automated recommendations turn data into action by flagging specific instances that are wasting spend.',
      },
      {
        id: 'q3_2',
        domain: 'd3',
        text: 'Have instances been right-sized using utilization data in the last 6 months?',
        rationale:
          'Right-sizing is not a one-time event. Workload patterns shift, and instances drift from optimal sizing. A recent right-sizing pass is a signal that cost optimization is an active discipline.',
      },
      {
        id: 'q3_3',
        domain: 'd3',
        text: 'What share of compute runs on reserved or committed pricing vs. on-demand?',
        rationale:
          'On-demand pricing carries a 30 to 60 percent premium over committed pricing for stable workloads. High on-demand ratios for predictable workloads indicate immediate savings opportunities.',
      },
    ],
  },
  {
    id: 'd4',
    name: 'Lifecycle and Waste',
    description: 'Do orphaned resources get cleaned up?',
    weight: 1.0,
    foundational: false,
    questions: [
      {
        id: 'q4_1',
        domain: 'd4',
        text: 'Are automated policies in place to decommission unused or idle resources?',
        rationale:
          'Without automated cleanup, infrastructure accumulates over time. Stopped instances, unattached volumes, and idle load balancers silently drain budget.',
      },
      {
        id: 'q4_2',
        domain: 'd4',
        text: 'Do non-production environments scale down automatically outside business hours?',
        rationale:
          'Non-production environments that run 24/7 cost 60 to 70 percent more than necessary. Automated scheduling is one of the highest-ROI cost optimizations available.',
      },
      {
        id: 'q4_3',
        domain: 'd4',
        text: 'Are orphaned storage assets (volumes, snapshots, unattached IPs) identified and removed through automated policy?',
        rationale:
          'Orphaned storage is a common source of hidden waste. Volumes and snapshots from deleted instances persist indefinitely unless actively cleaned up.',
      },
    ],
  },
  {
    id: 'd5',
    name: 'Architectural Efficiency',
    description: 'Is the architecture cost-aware?',
    weight: 1.0,
    foundational: false,
    questions: [
      {
        id: 'q5_1',
        domain: 'd5',
        text: 'Is cost projection a required field in architecture decision records or infrastructure change requests?',
        rationale:
          'Embedding cost projection into ADRs normalizes cost as an architectural constraint. Without it, cost impact is discovered after deployment, when changing course is expensive.',
      },
      {
        id: 'q5_2',
        domain: 'd5',
        text: 'Has the team adopted serverless, spot, or preemptible compute for appropriate workloads?',
        rationale:
          'Spot instances can reduce compute cost by 60 to 90 percent for fault-tolerant workloads. Serverless eliminates idle capacity entirely. Not adopting these for suitable workloads leaves significant savings on the table.',
      },
      {
        id: 'q5_3',
        domain: 'd5',
        text: 'Is there a designated FinOps practice or cost champion within engineering?',
        rationale:
          'Organizations with a named FinOps champion consistently outperform peers on optimization outcomes. Without one, cost management defaults to ad hoc efforts that lose momentum.',
      },
    ],
  },
  {
    id: 'd6',
    name: 'Governance and Alerting',
    description: 'Are there guardrails, and do they fire?',
    weight: 1.0,
    foundational: false,
    questions: [
      {
        id: 'q6_1',
        domain: 'd6',
        text: 'Do teams have defined cloud spend budgets with automated threshold alerts?',
        rationale:
          'Budgets without alerts are aspirational. Automated alerts at 80 and 100 percent of budget ensure cost overruns are caught before they compound.',
      },
      {
        id: 'q6_2',
        domain: 'd6',
        text: 'Is there an approval workflow for provisioning high-cost resources?',
        rationale:
          'Without approval gates, a single engineer can provision infrastructure that doubles monthly spend. A lightweight approval workflow for high-cost resources prevents accidental overruns.',
      },
      {
        id: 'q6_3',
        domain: 'd6',
        text: 'Are cloud costs reviewed as part of sprint or release planning cycles?',
        rationale:
          'Including cost in sprint reviews normalizes it as an engineering concern. It surfaces cost impact alongside velocity and quality, making cost-aware decisions part of the development rhythm.',
      },
      {
        id: 'q6_4',
        domain: 'd6',
        text: 'Does the team receive real-time alerts for anomalous cost spikes (e.g., greater than 20% week-over-week)?',
        rationale:
          'An undetected cost spike is an exposure event. Anomaly detection catches misconfigured services, runaway scaling, and unexpected data transfer before they become material budget events.',
      },
    ],
  },
];

export const DOMAINS = validateDataSource(
  DomainsArraySchema,
  domainsData,
  'icg/domains.ts (DOMAINS)'
);

// ─── Derived constants ──────────────────────────────────────────────────────

export const TOTAL_QUESTIONS = DOMAINS.reduce((sum, d) => sum + d.questions.length, 0);
