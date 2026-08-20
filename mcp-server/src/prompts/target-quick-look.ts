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
 * The output also includes "Open in Hub" deep-links for all four tools
 * via the `deeplink` field each Tool result carries (BL-031.95 closes
 * the four-tool deep-link surface — TechPar URL state shipped under
 * Phase 1, ICG / Tech Debt / Regulatory Map shipped under Commit 0.5).
 */

import { z } from 'zod';
import { CanonicalStageSchema } from '../schemas';
import { buildPartnerSuppliedTechParAudit } from '../schemas/techpar-audit';
import type { GstPrompt } from './types';
import { enumFromWire, numberFromWire } from './wire-shape';
import { authorialIntentLine, irlEvidencePrecedence } from './embed';
import { TECHPAR_MODE_RULE, MTTR_P1_RULE } from './extraction-rules';

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
  version: '0.1.0',
  lastReviewedAt: '2026-08-20',
  orchestrates: [
    'assess_infrastructure_cost_governance',
    'compute_techpar',
    'estimate_tech_debt_cost',
    // Named in the body's Step 4 since that step was written, but absent from
    // this list until now: the registry invariant checks orchestrates→body, not
    // the reverse, so a body-only mention is silent.
    'list_regulation_facets',
    'search_regulations',
  ] as const,
  consumesTargetEvidence: true,
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
            irlEvidencePrecedence(),
            '',
            '**Two branches run through every step below.** The *evidence* branch applies when canonical GST target evidence is in context — most often an IRL extract record, whose facts carry the IRL request text, a verbatim excerpt and a reference like `2-04`. The *no-evidence* branch applies when the five form arguments above are all you have. Each step states both. Say in the brief which branch each number came from; a form-derived figure and a stage-norm guess must not read alike, and neither must be mistaken for a partner-stated one.',
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
            "    a. Deriving each answer from the supplied inputs + any canonical target evidence in context (an extract record's Section 02 / 03 / 07 facts are the strongest signal available here) + anything else the user has shared earlier in the conversation (e.g., productType + stage gives strong signal on FinOps maturity, observability posture, multi-cloud likelihood).",
            '    b. For any answer that is NOT knowable from available data, use the schema\'s explicit unknown value `-1` ("Not sure"). NEVER skip a question — `-1` is the contractually correct value for "I don\'t know," and the engine treats it as a real signal that surfaces investigation recommendations.',
            `    c. Pass \`companyStage: '${args.stage}'\` directly — the ICG MCP wrapper accepts the canonical funding-stage taxonomy (seed | series-a | series-b | series-c | pe | enterprise) and translates to ICG's native cohort labels locally. No manual mapping needed.`,
            '',
            `Step 2 — Unit-economics benchmark (\`compute_techpar\`). Pass \`stage: '${args.stage}'\` (the same canonical value); TechPar's MCP wrapper translates locally. Use the supplied arr; choose reasonable defaults for capexView and growthRate where not derivable. **The tool REQUIRES both a \`mode\` and an \`_audit\` sibling, and \`mode\` has no default** — an unstated mode produced a 1.9× \`rdOpEx\` divergence and an inverted zone verdict across two runs of one target elsewhere in this workspace. Which mode you run depends on the branch:`,
            '',
            '  **2a — No evidence in context → `mode: "quick"`.** Nothing supplies the Section 02 component figures (`engCost` / `prodCost` / `toolingCost`), so `deepdive` would synthesize R&D OpEx by summing three zeros. Pass `rdOpEx` derived from the form inputs and stage norms, and disclose that derivation in the brief. Supply the audit sibling in exactly this shape — it is the canonical partner-supplied form of `_audit`, produced by `buildPartnerSuppliedTechParAudit(\'quick\')` in `schemas/techpar-audit.ts`, so this block and the helper cannot disagree:',
            '',
            '  ```json',
            ...JSON.stringify({ _audit: buildPartnerSuppliedTechParAudit('quick') }, null, 2)
              .split('\n')
              .map((line) => `  ${line}`),
            '  ```',
            '',
            '  The `Section --` sentinel is what makes this honest: under the derived-tier discipline it grades as `partner-supplied` rather than as a verified IRL citation. If you choose a non-USD currency for any reason, supply `_audit.monetaryBasis.conversionRate` (USD rate) so the response payload carries it.',
            '',
            `  **2b — Evidence in context → \`mode: "deepdive"\`.** The Section 02 components exist in the record, so the rule that governs every other TechPar caller applies here too: ${TECHPAR_MODE_RULE}`,
            '',
            '  **Adaptation note for 2b (this prompt is not the ingestion sweep).** The rule above is written in IRL-sweep terms and directs surfacing blanks "in (J)" and marking a dossier section — this prompt emits neither a (J) gap list nor a dossier. Map both directives onto this prompt\'s own output: a zeroed or absent component goes under the brief\'s "Assumptions / unknowns" heading, named with the Section 02 reference that would have answered it and the consequence (a zeroed component understates total technology cost and moves the zone verdict in the flattering direction). The Section-02 / reference language in the rule is meaningful here precisely because the record carries those references. Build each `_audit` entry from the covering fact — `Section NN — <the fact\'s excerpt>` — rather than from the `Section --` sentinel; a real figure and a norm-derived guess must not arrive at the same provenance grade.',
            '',
            '  **Both branches: every field below is REQUIRED in BOTH modes, and this step used to name none of them.** Beyond `arr`, `stage`, `mode`, `capexView` and `growthRate`, the schema demands `exitMultiple`, `engFTE`, `engCost`, `prodCost`, `toolingCost`, `infraHostingAnnual`, `infraPersonnel`, `rdOpEx` and `rdCapEx` — omitting any one is a validation rejection, not a default. `deepdive` DISCARDS the `rdOpEx` value (it synthesizes R&D OpEx from `engCost + prodCost + toolingCost`) but still requires the field; `quick` discards the three components and reads `rdOpEx` directly. Whatever you supplied from stage norms rather than from evidence is listed under "Assumptions / unknowns".',
            '',
            'Step 3 — Tech-debt range (`estimate_tech_debt_cost`). Raw inputs: teamSize, salary, maintenanceBurdenPct, deployFrequency, incidents, mttrHours, remediationBudget, arr=`' +
              String(args.arr) +
              '`, remediationPct, contextSwitchOn.',
            '',
            '  **3a — The `_audit` sibling is REQUIRED and the call is rejected without it.** It carries `mttrSource` and `incidentsSource`, each one of `irl-stated` | `irl-open` | `irl-absent` | `irl-scope-mismatch`. The enum has no value meaning "synthesized from stage norms", and that is deliberate: any source other than `irl-stated` forces the paired value to `null`, and the tool REJECTS a non-null value under those sources (it returns a retry directive; nothing coerces).',
            '',
            `  **3b — No evidence in context.** Pass \`mttrSource: "irl-absent"\` with \`mttrHours: null\`, and \`incidentsSource: "irl-absent"\` with \`incidents: null\`. The tool then elides both line items and returns \`extractionOnly: ["mttrHours", "incidents"]\`; Step 5(4) renders the tech-debt read as extraction-only for those fields rather than quoting a fabricated carrying cost. **Never emit a synthesized zero under \`irl-stated\`** — the tool rejects \`irl-stated\` paired with \`mttrHours: 0\` as suspicious, and a fabricated MTTR passes through a linear multiplier and produces an unrecoverable false carrying-cost number. The other eight inputs may still come from productType + stage norms, biased toward conservative midpoints, and every one of them is disclosed under "Assumptions / unknowns".`,
            '',
            `  **3c — Evidence in context.** Resolve MTTR and the incident count from the record's Section 04 facts and pass \`irl-stated\` with the real numbers, citing the covering reference. ${MTTR_P1_RULE}`,
            '',
            '  **Adaptation note for 3c**: as in Step 2b, the rule above names a dossier Tech Debt section and a (J) gap list. Neither exists here — mark the field extraction-only inside the brief\'s tech-debt section and put the follow-up under "Assumptions / unknowns". A Section 04 fact the record does not cover stays on the 3b branch: `irl-open` or `irl-absent` plus `null`, never a norm.',
            '',
            `Step 4 — Regulatory exposure (\`search_regulations\`). Filter by jurisdiction matching ${args.hqJurisdiction} (look up the canonical jurisdiction id via list_regulation_facets if uncertain) and call the tool once per relevant data category likely to apply to a ${args.productType} business (data-privacy is almost always applicable; ai-governance if AI features; cybersecurity for critical infra; industry-compliance for regulated verticals).`,
            '',
            'Step 5 — Frame the output as one digestible page with these sections:',
            `  (1) Header — ${args.targetName} | ${args.productType} | ARR ${args.arr} | ${args.stage} | HQ ${args.hqJurisdiction}.`,
            '  (2) Cost-governance read — overallScore + maturityLevel + the top 2-3 recommendations from the tool result. List EVERY ICG question answered as `-1` (\'Not sure\') under an "Assumptions / unknowns" sub-heading; if ≥10 of 20 answers were `-1`, lead the brief with a one-line note that the ICG portion is a low-confidence baseline and suggest the user run the full wizard for a confident read.',
            '  (3) Unit-economics — TechPar zone + 1-line interpretation, plus the `mode` you ran and one line on why (evidence present → `deepdive`; form inputs only → `quick`).',
            '  (4) Tech-debt range — annualCost, debtPctArr, paybackMonths, plus DORA tier. **If the tool returned `extractionOnly: [...]`, render those fields as extraction-only and say what is missing** — do NOT quote a carrying cost as though MTTR and incident counts were known when they were passed as null.',
            '  (4a) Assumptions / unknowns — a single consolidated list for the whole brief: every ICG answer left at `-1`, every TechPar field supplied from stage norms rather than evidence (with the Section reference that would have answered it and the effect of leaving it zeroed), and every tech-debt field returned as extraction-only with the concrete follow-up. When target evidence WAS in context, state for each resolved figure whether its citation is verified this session or carried asserted-not-verified from the record.',
            '  (5) Regulatory exposure — list of applicable frameworks (name + jurisdiction + 1-line summary) for the supplied hqJurisdiction.',
            '  (6) Open in Hub — embed the `deeplink` field from each Tool result as a clickable link, labeled "Open ICG", "Open TechPar", "Open Tech Debt", "Open Regulatory Map". All four Tool wrappers now emit a `deeplink` URL that opens the corresponding /hub/ page populated with the same inputs/results (TechPar shipped under BL-031.95 Phase 1, the others under Commit 0.5). If a tool response is missing `deeplink` (older server build), omit that link silently — never invent a URL.',
            '',
            'Voice: declarative, terse, deal-team-ready. Output should read as if a senior consultant wrote it after a 20-minute review.',
          ].join('\n'),
        },
      },
    ],
  }),
};
