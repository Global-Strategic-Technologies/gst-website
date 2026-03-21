/**
 * Infrastructure Cost Governance — recommendation bank
 *
 * Each recommendation is surfaced when the answer to its trigger question
 * scores at or below the trigger threshold. Sorted by impact tier at runtime.
 */

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'quick-win' | 'project' | 'initiative';
  domain: string;
  triggerQuestionId: string;
  triggerThreshold: number;
}

export const RECOMMENDATIONS: readonly Recommendation[] = [
  // ── Domain 1: Visibility and Tagging ──────────────────────────────────────

  {
    id: 'r01',
    triggerQuestionId: 'q1_1',
    threshold: 1,
    impact: 'high',
    effort: 'project',
    domain: 'd1',
    title: 'Implement a mandatory resource tagging standard',
    description: 'Define and enforce a taxonomy covering team, service, environment, and cost-center via IaC policy gates. Prevent untagged resources from reaching production.',
  },
  {
    id: 'r02',
    triggerQuestionId: 'q1_1',
    threshold: 0,
    impact: 'high',
    effort: 'project',
    domain: 'd1',
    title: 'Retroactively tag existing infrastructure',
    description: 'Audit current resources for missing or inconsistent tags. Prioritize production compute and storage, which typically represent 70 to 80 percent of total spend.',
  },
  {
    id: 'r03',
    triggerQuestionId: 'q1_2',
    threshold: 1,
    impact: 'high',
    effort: 'quick-win',
    domain: 'd1',
    title: 'Deploy a cloud cost visibility dashboard',
    description: 'Implement AWS Cost Explorer, GCP Billing dashboards, or a FinOps platform. Engineering leads need direct access with no approval gate and no ticket required.',
  },
  {
    id: 'r04',
    triggerQuestionId: 'q1_3',
    threshold: 1,
    impact: 'medium',
    effort: 'quick-win',
    domain: 'd1',
    title: 'Establish a weekly cloud cost review cadence',
    description: 'Assign a named owner with authority to act. VP Engineering, FinOps lead, or CTO. Weekly review with a standing action item is the minimum effective frequency.',
  },

  // ── Domain 2: Account Structure and Attribution ───────────────────────────

  {
    id: 'r23',
    triggerQuestionId: 'q2_1',
    threshold: 1,
    impact: 'high',
    effort: 'initiative',
    domain: 'd2',
    title: 'Segregate cloud accounts by environment',
    description: 'Separate production, staging, and development into distinct billing accounts or projects. This is the foundational first step: it enforces hard cost boundaries, prevents non-production spend from obscuring unit economics, and limits blast radius for cost anomalies.',
  },
  {
    id: 'r24',
    triggerQuestionId: 'q2_2',
    threshold: 1,
    impact: 'high',
    effort: 'initiative',
    domain: 'd2',
    title: 'Segregate cloud accounts by service or product',
    description: 'Create dedicated billing accounts per service or product line. This enables clean unit economics per product — a key diligence requirement — and makes it possible to identify which products are margin-positive without manual allocation.',
  },
  {
    id: 'r25',
    triggerQuestionId: 'q2_3',
    threshold: 1,
    impact: 'medium',
    effort: 'initiative',
    domain: 'd2',
    title: 'Segregate cloud accounts by team or business unit',
    description: 'Assign distinct billing accounts or projects per team. This enables chargeback and showback models, creates natural accountability boundaries, and makes cost ownership unambiguous during organizational scaling.',
  },
  {
    id: 'r26',
    triggerQuestionId: 'q2_4',
    threshold: 1,
    impact: 'high',
    effort: 'project',
    domain: 'd2',
    title: 'Establish automated cost attribution by business unit',
    description: 'Implement account-level or tag-based cost allocation that maps spend to products and teams without manual reconciliation. PE buyers expect clean unit economics; manual spreadsheet attribution is a diligence red flag.',
  },
  {
    id: 'r27',
    triggerQuestionId: 'q2_1',
    threshold: 0,
    impact: 'medium',
    effort: 'project',
    domain: 'd2',
    title: 'Audit commingled accounts for environment isolation',
    description: 'When all workloads share a single billing account, start by separating production from non-production. This is the highest-leverage first move: it immediately clarifies production cost baseline and enables non-prod scheduling savings.',
  },

  // ── Domain 3: Right-Sizing and Utilization ────────────────────────────────

  {
    id: 'r05',
    triggerQuestionId: 'q3_1',
    threshold: 1,
    impact: 'high',
    effort: 'quick-win',
    domain: 'd3',
    title: 'Enable continuous utilization monitoring',
    description: 'Configure CPU and memory tracking across production instances. Flag right-sizing candidates automatically at under 30% average utilization over 14 days.',
  },
  {
    id: 'r06',
    triggerQuestionId: 'q3_2',
    threshold: 1,
    impact: 'high',
    effort: 'project',
    domain: 'd3',
    title: 'Execute a right-sizing pass on production compute',
    description: 'Downsize over-provisioned instances based on utilization data. A first pass typically surfaces 15 to 30 percent compute cost reduction with low performance risk.',
  },
  {
    id: 'r07',
    triggerQuestionId: 'q3_3',
    threshold: 1,
    impact: 'high',
    effort: 'project',
    domain: 'd3',
    title: 'Shift stable workloads to reserved or committed pricing',
    description: 'Identify predictable workloads and migrate to 1-year reserved instances or compute savings plans. Typical discount: 30 to 40 percent vs. on-demand.',
  },
  {
    id: 'r08',
    triggerQuestionId: 'q3_3',
    threshold: 0,
    impact: 'medium',
    effort: 'project',
    domain: 'd3',
    title: 'Evaluate 3-year pricing for core stable infrastructure',
    description: 'For long-term stable workloads such as databases and core API tiers, 3-year reserved pricing can reach 60 to 70 percent discount vs. on-demand across major providers.',
  },

  // ── Domain 4: Lifecycle and Waste ─────────────────────────────────────────

  {
    id: 'r09',
    triggerQuestionId: 'q4_1',
    threshold: 1,
    impact: 'high',
    effort: 'project',
    domain: 'd4',
    title: 'Implement automated resource lifecycle policies',
    description: 'Use cloud-native automation to identify and terminate stopped instances, unattached volumes, and idle resources on a scheduled basis.',
  },
  {
    id: 'r10',
    triggerQuestionId: 'q4_2',
    threshold: 1,
    impact: 'medium',
    effort: 'quick-win',
    domain: 'd4',
    title: 'Automate non-production environment scheduling',
    description: 'Configure dev, staging, and QA to power down outside business hours. Savings typically range from 60 to 70 percent of non-production compute cost.',
  },
  {
    id: 'r11',
    triggerQuestionId: 'q4_3',
    threshold: 1,
    impact: 'medium',
    effort: 'quick-win',
    domain: 'd4',
    title: 'Audit and eliminate orphaned storage assets',
    description: 'A structured audit of unattached volumes, obsolete snapshots, and unused IPs commonly surfaces $5K to $50K in annual waste at mid-scale.',
  },
  {
    id: 'r12',
    triggerQuestionId: 'q4_1',
    threshold: 0,
    impact: 'low',
    effort: 'project',
    domain: 'd4',
    title: 'Enforce resource TTLs for ephemeral environments',
    description: 'Tag environments provisioned for feature branches with time-to-live values. Automate teardown at TTL expiry to prevent infrastructure accumulation.',
  },

  // ── Domain 5: Architectural Efficiency ────────────────────────────────────

  {
    id: 'r13',
    triggerQuestionId: 'q5_1',
    threshold: 1,
    impact: 'high',
    effort: 'quick-win',
    domain: 'd5',
    title: 'Embed cost review into architecture decision records',
    description: 'Require cost projection as a mandatory ADR field for infrastructure changes above a defined spend threshold. Normalizes cost consideration without adding process overhead.',
  },
  {
    id: 'r14',
    triggerQuestionId: 'q5_2',
    threshold: 1,
    impact: 'medium',
    effort: 'project',
    domain: 'd5',
    title: 'Evaluate spot/preemptible for fault-tolerant workloads',
    description: 'Batch processing, CI/CD pipelines, and stateless services that tolerate interruption can reduce compute cost by 60 to 90 percent on spot instances.',
  },
  {
    id: 'r15',
    triggerQuestionId: 'q5_2',
    threshold: 0,
    impact: 'medium',
    effort: 'project',
    domain: 'd5',
    title: 'Migrate event-driven workloads to serverless',
    description: 'Audit always-on instances running intermittent workloads. Scheduled jobs, webhook processors, and low-traffic APIs are prime serverless candidates.',
  },
  {
    id: 'r16',
    triggerQuestionId: 'q5_3',
    threshold: 1,
    impact: 'high',
    effort: 'quick-win',
    domain: 'd5',
    title: 'Designate a FinOps champion in engineering',
    description: 'Assign cost ownership to a named individual, even part-time. Organizations with a named FinOps champion consistently outperform peers on optimization outcomes.',
  },

  // ── Domain 6: Governance and Alerting ─────────────────────────────────────

  {
    id: 'r17',
    triggerQuestionId: 'q6_1',
    threshold: 1,
    impact: 'high',
    effort: 'quick-win',
    domain: 'd6',
    title: 'Create per-team budgets with automated alerts',
    description: 'Establish monthly spend budgets at team or service level. Configure alerts at 80% and 100% of budget to trigger owner notification before overruns.',
  },
  {
    id: 'r18',
    triggerQuestionId: 'q6_1',
    threshold: 0,
    impact: 'high',
    effort: 'quick-win',
    domain: 'd6',
    title: 'Add forecasted spend alerts',
    description: 'Configure alerts on projected month-end spend in addition to actual spend. These fire while intervention is still possible, before the overrun materializes.',
  },
  {
    id: 'r19',
    triggerQuestionId: 'q6_2',
    threshold: 1,
    impact: 'medium',
    effort: 'project',
    domain: 'd6',
    title: 'Introduce approval gates for high-cost provisioning',
    description: 'Define a threshold (e.g., $500/month estimated) above which resource provisioning requires engineering lead or FinOps owner approval.',
  },
  {
    id: 'r20',
    triggerQuestionId: 'q6_3',
    threshold: 1,
    impact: 'medium',
    effort: 'quick-win',
    domain: 'd6',
    title: 'Add cloud cost delta to sprint and release reviews',
    description: 'Include a cloud cost line in retrospectives and release reviews. Normalizes cost awareness without requiring a separate meeting.',
  },
  {
    id: 'r21',
    triggerQuestionId: 'q6_4',
    threshold: 1,
    impact: 'high',
    effort: 'quick-win',
    domain: 'd6',
    title: 'Configure anomaly detection and cost spike alerts',
    description: 'Enable native anomaly detection or monitors for week-over-week spend increases above 20%. An undetected cost spike is an exposure event, not just a waste problem.',
  },
  {
    id: 'r22',
    triggerQuestionId: 'q6_4',
    threshold: 0,
    impact: 'medium',
    effort: 'project',
    domain: 'd6',
    title: 'Establish a cost incident response playbook',
    description: 'Document the response procedure when an anomaly fires: who owns it, the investigation process, and available rollback or throttling options.',
  },
].map(r => ({
  id: r.id,
  title: r.title,
  description: r.description,
  impact: r.impact,
  effort: r.effort,
  domain: r.domain,
  triggerQuestionId: r.triggerQuestionId,
  triggerThreshold: r.threshold,
})) as Recommendation[];
