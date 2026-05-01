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
import { GrowthStageSchema } from '../schemas';
import type { GstPrompt } from './types';
import { numberFromWire } from './wire-shape';

const argsSchema = z.object({
  targetName: z.string().min(1),
  productType: z.string().min(2),
  arr: numberFromWire(z.number().positive()),
  stage: GrowthStageSchema,
  hqJurisdiction: z.string().min(2),
});

export const targetQuickLookPrompt: GstPrompt<typeof argsSchema> = {
  name: 'gst_target_quick_look',
  description:
    'First-look brief for an unfamiliar target. Combines ICG, TechPar, Tech Debt, and regulatory exposure into one digestible page.',
  version: '0.1.0',
  lastReviewedAt: '2026-04-29',
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
            `Produce a first-look brief for ${args.targetName} (productType=${args.productType}, arr=${args.arr}, stage=${args.stage}, hqJurisdiction=${args.hqJurisdiction}).`,
            '',
            'Step 1 — Cost-governance maturity (`assess_infrastructure_cost_governance`).',
            '  The full ICG tool requires answers to ALL 20 questions across 6 domains (the website wizard does not allow skipping). Build a complete answers map by:',
            '    a. Deriving each answer from the supplied inputs + anything the user has shared earlier in the conversation (e.g., productType + stage gives strong signal on FinOps maturity, observability posture, multi-cloud likelihood).',
            '    b. For any answer that is NOT knowable from available data, use the schema\'s explicit unknown value `-1` ("Not sure"). NEVER skip a question — `-1` is the contractually correct value for "I don\'t know," and the engine treats it as a real signal that surfaces investigation recommendations.',
            '    c. Pass companyStage by mapping the supplied stage to one of: pre-series-b | series-bc | pe-backed | enterprise.',
            '',
            'Step 2 — Unit-economics benchmark (`compute_techpar`). Use the supplied arr and stage; choose reasonable defaults for capexView and growthRate where not derivable.',
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
