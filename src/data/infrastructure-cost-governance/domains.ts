/**
 * Infrastructure Cost Governance — domain and question definitions
 *
 * All question text, domain metadata, and answer options are defined here.
 * The engine imports this data but never modifies it.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnswerOption {
  score: number;
  label: string;
}

export interface Question {
  id: string;
  domain: string;
  text: string;
}

export interface Domain {
  id: string;
  name: string;
  description: string;
  questions: Question[];
  weight: number;
  foundational: boolean;
}

// ─── Answer options ──────────────────────────────────────────────────────────

export const ANSWER_OPTIONS: readonly AnswerOption[] = [
  { score: 0, label: 'Not in place' },
  { score: 1, label: 'Ad hoc' },
  { score: 2, label: 'Established' },
  { score: 3, label: 'Optimized' },
] as const;

// ─── Domain definitions ─────────────────────────────────────────────────────

export const DOMAINS: readonly Domain[] = [
  {
    id: 'd1',
    name: 'Visibility and Tagging',
    description: 'Can you see where the money goes?',
    weight: 1.5,
    foundational: true,
    questions: [
      { id: 'q1_1', domain: 'd1', text: 'Are cloud resources tagged by team, service, and environment?' },
      { id: 'q1_2', domain: 'd1', text: 'Do engineering leads have direct access to a cloud cost dashboard?' },
      { id: 'q1_3', domain: 'd1', text: 'How often is the cloud bill reviewed by someone empowered to act on it?' },
    ],
  },
  {
    id: 'd2',
    name: 'Right-Sizing and Utilization',
    description: 'Are you paying for what you use?',
    weight: 1.0,
    foundational: false,
    questions: [
      { id: 'q2_1', domain: 'd2', text: 'Do you monitor CPU and memory utilization across running instances?' },
      { id: 'q2_2', domain: 'd2', text: 'Have instances been right-sized using utilization data in the last 6 months?' },
      { id: 'q2_3', domain: 'd2', text: 'What share of compute runs on reserved or committed pricing vs. on-demand?' },
    ],
  },
  {
    id: 'd3',
    name: 'Lifecycle and Waste',
    description: 'Do orphaned resources get cleaned up?',
    weight: 1.0,
    foundational: false,
    questions: [
      { id: 'q3_1', domain: 'd3', text: 'Are automated policies in place to decommission unused or idle resources?' },
      { id: 'q3_2', domain: 'd3', text: 'Do non-production environments scale down automatically outside business hours?' },
      { id: 'q3_3', domain: 'd3', text: 'How are orphaned volumes, snapshots, and unattached IPs identified and removed?' },
    ],
  },
  {
    id: 'd4',
    name: 'Architectural Efficiency',
    description: 'Is the architecture cost-aware?',
    weight: 1.0,
    foundational: false,
    questions: [
      { id: 'q4_1', domain: 'd4', text: 'Do engineering teams factor cost into decisions about instance types and managed services?' },
      { id: 'q4_2', domain: 'd4', text: 'Has the team adopted serverless, spot, or preemptible compute for appropriate workloads?' },
      { id: 'q4_3', domain: 'd4', text: 'Is there a designated FinOps practice or cost champion within engineering?' },
    ],
  },
  {
    id: 'd5',
    name: 'Governance and Alerting',
    description: 'Are there guardrails, and do they fire?',
    weight: 1.0,
    foundational: false,
    questions: [
      { id: 'q5_1', domain: 'd5', text: 'Do teams have defined cloud spend budgets with automated threshold alerts?' },
      { id: 'q5_2', domain: 'd5', text: 'Is there an approval workflow for provisioning high-cost resources?' },
      { id: 'q5_3', domain: 'd5', text: 'Are cloud costs reviewed as part of sprint or release planning cycles?' },
      { id: 'q5_4', domain: 'd5', text: 'Does the team receive real-time alerts for anomalous cost spikes (e.g., greater than 20% week-over-week)?' },
    ],
  },
] as const;

// ─── Derived constants ──────────────────────────────────────────────────────

export const TOTAL_QUESTIONS = DOMAINS.reduce((sum, d) => sum + d.questions.length, 0);
