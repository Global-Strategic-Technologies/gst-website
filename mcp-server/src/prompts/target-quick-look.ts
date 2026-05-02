/**
 * Prompt: gst_target_quick_look
 *
 * First-look brief for an unfamiliar target — combines cost-governance
 * maturity (ICG), unit-economics benchmark (TechPar), tech-debt range,
 * and regulatory exposure into one digestible page.
 *
 * Body design contract: instruct the model to invoke all four tools and
 * use the 'not sure' value (never skip) for any ICG question that isn't
 * derivable from the supplied inputs + conversation context. The brief
 * must surface every assumption-driven 'not sure' answer so the analyst
 * sees where output utility was degraded by missing inputs.
 *
 * The output also includes "Open in Hub" deep-links for ICG, Tech Debt,
 * and Regulatory Map (Tool output already populates these via Commit 0.5).
 * TechPar deep-link is deferred — Diligence Machine and TechPar URL state
 * are owned by BL-031.95.
 */

import { z } from 'zod';
import { CanonicalStageSchema } from '../schemas';
import type { GstPrompt } from './types';
import { enumFromWire, numberFromWire } from './wire-shape';
import { authorialIntentLine } from './embed';

const argsSchema = z.object({
  targetName: z.string().min(1),
  productType: z.string().min(2),
  arr: numberFromWire(z.number().positive()),
  // Canonical funding stage (BL-031.87). Each downstream tool's MCP
  // wrapper translates this canonical value to its native enum locally;
  // the prompt body passes the canonical value verbatim to ICG and
  // TechPar.
  stage: enumFromWire(CanonicalStageSchema),
  hqJurisdiction: z.string().min(2),
});

const PROMPT_NAME = 'gst_target_quick_look';

export const targetQuickLookPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'First-look brief for an unfamiliar target. Combines ICG, TechPar, Tech Debt, and regulatory exposure into one digestible page.',
  version: '0.0.2',
  lastReviewedAt: '2026-05-02',
  orchestrates: [
    'assess_infrastructure_cost_governance',
    'compute_techpar',
    'estimate_tech_debt_cost',
    'search_regulations',
  ] as const,
  argsSchema,
  build: (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            authorialIntentLine(PROMPT_NAME),
            '',
            `Produce a first-look brief for ${args.targetName} (productType=${args.productType}, arr=${args.arr}, stage=${args.stage}, hqJurisdiction=${args.hqJurisdiction}).`,
            '',
            'Step 1 — Cost-governance maturity (`assess_infrastructure_cost_governance`).',
            '  The ICG tool keys answers by question ID — the schema has 20 questions across 6 domains. Use these IDs verbatim (the engine silently ignores unknown keys, so inventing flat IDs like `q1`, `q2`, ... causes the engine to register zero answers and produce a misleading penalised baseline):',
            '    Domain 1 — Visibility and Tagging: `q1_1`, `q1_2`, `q1_3`',
            '    Domain 2 — Account Structure and Attribution: `q2_1`, `q2_2`, `q2_3`, `q2_4`',
            '    Domain 3 — Right-Sizing and Utilization: `q3_1`, `q3_2`, `q3_3`',
            '    Domain 4 — Lifecycle and Waste: `q4_1`, `q4_2`, `q4_3`',
            '    Domain 5 — Architectural Efficiency: `q5_1`, `q5_2`, `q5_3`',
            '    Domain 6 — Governance and Alerting: `q6_1`, `q6_2`, `q6_3`, `q6_4`',
            '  Build a complete answers map (all 20 keys) by:',
            '    a. Deriving each answer from the supplied inputs + anything the user has shared earlier in the conversation (e.g., productType + stage gives strong signal on FinOps maturity, observability posture, multi-cloud likelihood).',
            '    b. For any answer that is NOT knowable from available data, use the schema\'s explicit unknown value `-1` ("Not sure"). NEVER skip a question — `-1` is the contractually correct value for "I don\'t know," and the engine treats it as a real signal that surfaces investigation recommendations.',
            `    c. Pass \`companyStage: '${args.stage}'\` directly — the ICG MCP wrapper accepts the canonical funding-stage taxonomy (seed | series-a | series-b | series-c | pe | enterprise) and translates to ICG's native cohort labels locally. No manual mapping needed.`,
            '',
            `Step 2 — Unit-economics benchmark (\`compute_techpar\`). Pass \`stage: '${args.stage}'\` (the same canonical value); TechPar's MCP wrapper translates locally. Use the supplied arr; choose reasonable defaults for capexView and growthRate where not derivable.`,
            '',
            'Step 3 — Tech-debt range (`estimate_tech_debt_cost`). Synthesize raw inputs (teamSize, salary, maintenanceBurdenPct, deployFrequency, incidents, mttrHours, remediationBudget, arr=`' +
              String(args.arr) +
              '`, remediationPct, contextSwitchOn) from productType + stage norms; bias toward conservative midpoints when uncertain.',
            '',
            `Step 4 — Regulatory exposure (\`search_regulations\`). Filter by jurisdiction matching ${args.hqJurisdiction} (look up the canonical jurisdiction id via list_regulation_facets if uncertain) and call the tool once per relevant data category likely to apply to a ${args.productType} business (data-privacy is almost always applicable; ai-governance if AI features; cybersecurity for critical infra; industry-compliance for regulated verticals).`,
            '',
            'Step 5 — Frame the output as one digestible page with these sections:',
            `  (1) Header — ${args.targetName} | ${args.productType} | ARR ${args.arr} | ${args.stage} | HQ ${args.hqJurisdiction}.`,
            '  (2) Cost-governance read — overallScore + maturityLevel + the top 2-3 recommendations from the tool result. List EVERY ICG question answered as `-1` (\'Not sure\') under an "Assumptions / unknowns" sub-heading; if ≥10 of 20 answers were `-1`, lead the brief with a one-line note that the ICG portion is a low-confidence baseline and suggest the user run the full wizard for a confident read.',
            '  (3) Unit-economics — TechPar zone + 1-line interpretation.',
            '  (4) Tech-debt range — annualCost, debtPctArr, paybackMonths, plus DORA tier.',
            '  (5) Regulatory exposure — list of applicable frameworks (name + jurisdiction + 1-line summary) for the supplied hqJurisdiction.',
            '  (6) Open in Hub — embed the `deeplink` field from each Tool result as a clickable link, labeled "Open ICG", "Open Tech Debt", "Open Regulatory Map". Note that TechPar deep-link will be added when the page supports URL state (tracked under BL-031.95).',
            '',
            'Voice: declarative, terse, deal-team-ready. Output should read as if a senior consultant wrote it after a 20-minute review.',
          ].join('\n'),
        },
      },
    ],
  }),
};
