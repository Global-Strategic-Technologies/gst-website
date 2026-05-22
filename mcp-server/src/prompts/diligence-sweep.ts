/**
 * Prompt: gst_diligence_sweep
 *
 * Bookend to `gst_information_request_list`. Where the IRL prompt emits the
 * *request* artifact (universal intake checklist), this prompt ingests a
 * *populated* IRL — the structured response a target returns — and uses the
 * full content to drive every Hub tool surface and downstream prompt
 * artifact GST exposes. The output is a unified diligence dossier with no
 * `'unknown'` defensive widening: high-fidelity intake produces high-
 * fidelity sweep.
 *
 * Input modes:
 *   1. `filledIrl` supplied — one-shot mode; runs the full sweep.
 *   2. `filledIrl` omitted — interactive mode; the model asks the user to
 *      paste the populated IRL before sweeping.
 *
 * Resource embedding: the canonical `gst://library/information-request-list`
 * article is embedded so the model can reconcile the user's filled bullets
 * back to the IRL section taxonomy (especially when the user pastes a
 * minimally-formatted reply rather than the verbatim IRL skeleton);
 * `gst://library/vdr-structure` is embedded so the synthesis section can
 * use the canonical VDR-folder labels for follow-up requests verbatim.
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { authorialIntentLine, embedLibraryArticle } from './embed';

const IRL_RESOURCE_URI = 'gst://library/information-request-list';
const VDR_RESOURCE_URI = 'gst://library/vdr-structure';

const transactionContextValues = ['sell-side', 'buy-side', 'value-creation', 'unknown'] as const;

const argsSchema = z.object({
  targetName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The target / client name as referenced in the filled IRL (e.g., 'MedSig Health'). Omit to let the model infer it from the IRL header."
    ),
  filledIrl: z
    .string()
    .min(200)
    .optional()
    .describe(
      'The populated Information Request List returned by the target — the entire markdown body of the response, including all 10 sections. Omit to enter interactive mode (the model will ask you to paste it).'
    ),
  transactionContext: z
    .enum(transactionContextValues)
    .optional()
    .describe(
      'Engagement context. Must be one of: sell-side · buy-side · value-creation · unknown.'
    ),
  partnerLead: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Name of the GST partner leading the engagement — used to attribute the synthesis handoff memo (e.g., 'Reid Peryam'). Omit to leave the attribution generic."
    ),
  projectCodeName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Engagement code name for the synthesis handoff section (e.g., 'Cygnet'). Omit to use the target name."
    ),
});

const PROMPT_NAME = 'gst_diligence_sweep';

const VOICE_CUES: Record<(typeof transactionContextValues)[number], string> = {
  'sell-side':
    "Sell-side: framing emphasizes the target's defensible story and where GST can sharpen positioning before buyers see the data room.",
  'buy-side':
    'Buy-side: framing emphasizes underwriting — what risks the data confirms, denies, or fails to address before the LOI.',
  'value-creation':
    'Value-creation: framing emphasizes the post-close 100-day plan and the highest-leverage platform investments the dossier reveals.',
  unknown:
    'Engagement context unspecified — write the dossier in universal voice; the partner can sharpen framing on read.',
};

function buildOneShotBody(args: {
  targetName?: string;
  filledIrl: string;
  transactionContext?: (typeof transactionContextValues)[number];
  partnerLead?: string;
  projectCodeName?: string;
}): string {
  const targetClause = args.targetName
    ? `The target is **${args.targetName}**.`
    : 'Infer the target name from the IRL header (Section 00 — Basics, first bullet) and use it consistently throughout the dossier.';
  const voiceClause = args.transactionContext
    ? `Voice cue: ${VOICE_CUES[args.transactionContext]}`
    : 'Voice cue: universal. No engagement-specific framing.';
  const leadClause = args.partnerLead
    ? `Partner lead: **${args.partnerLead}** — attribute the synthesis handoff memo to this name.`
    : 'Partner lead: not supplied — attribute the synthesis handoff memo generically ("the GST team").';
  const codeNameClause = args.projectCodeName
    ? `Engagement code name: **${args.projectCodeName}** — use it as the project label in the synthesis section.`
    : 'Engagement code name: not supplied — use the target name as the project label.';

  return [
    authorialIntentLine(PROMPT_NAME),
    '',
    `Run the GST diligence sweep against the populated Information Request List below. This is the bookend to \`gst_information_request_list\` — the request the partner sent (\`${IRL_RESOURCE_URI}\`, embedded as the next message for taxonomy reference) has come back filled. Your job is to translate the filled answers into a coordinated invocation of every relevant GST Hub tool and downstream artifact, then synthesize the outputs into a single dossier.`,
    '',
    'Engagement context:',
    `- ${targetClause}`,
    `- ${voiceClause}`,
    `- ${leadClause}`,
    `- ${codeNameClause}`,
    '',
    '## Filled IRL (paste from the target — read carefully, all 10 sections)',
    '',
    '```markdown',
    args.filledIrl,
    '```',
    '',
    '## Sweep plan — execute the steps in order, do not skip any',
    '',
    `Step 1 — Extract the 13 diligence dimensions from the IRL and invoke \`generate_diligence_agenda\`. Because the IRL is filled, you should be able to derive concrete values for every dimension — do NOT default to \`'unknown'\`. Map IRL sections to dimensions: Section 00 → transactionType (from engagement-context bullet), revenueRange (from ARR bullet), growthStage (from growth-rate bullet), companyAge (from founding year), headcount (from total-headcount bullet), geographies (from geographies bullet); Section 01 → productType, businessModel, scaleIntensity; Section 02 → techArchetype; Section 04 → operatingModel, transformationState; Section 05/09 → dataSensitivity. Surface the resulting agenda topics + attention areas + the \`deeplink\` URL.`,
    '',
    `Step 2 — Pull comparable engagements. Call \`list_portfolio_facets\` first to see the filterable dimensions of GST's 57-engagement portfolio, then call \`search_portfolio\` with filters that match the target's profile (productType, industry-equivalent from Section 01, growthStage, geographies). **Use the literal theme / industry names returned by \`list_portfolio_facets\` verbatim** — do NOT guess at intuitive labels (e.g., the canonical theme is "Healthcare", not "Healthcare Tech"; a guess will return zero matches and force a retry). Pull 3-5 comparables. Surface the resulting code-named matches + the \`deeplink\` URL.`,
    '',
    `Step 3 — Pull the regulatory framework bodies the target is exposed to. Call \`list_regulation_facets\` first to enumerate available jurisdictions, then call \`search_regulations\` once per framework named in IRL Section 09 (e.g., HIPAA, GDPR, BDSG, CNIL, CCPA — whichever the filled IRL surfaces). **Cross-check Section 05 for ML/AI in production**: if Section 05 names any production ML/AI capability AND Section 00 geographies include the EU, add an EU AI Act search to this step (healthcare-domain decision-support ML typically classifies as Annex III high-risk; the IRL is often silent on this exposure). **Capture the \`deeplink\` URL from each \`search_regulations\` response** — each one opens the Regulatory Map filtered to that framework's region + category. Cite article numbers verbatim when summarizing obligations; do NOT invent citations beyond what the framework bodies return.`,
    '',
    `Step 4 — Invoke \`compute_techpar\` using the architecture and engineering-cost data from IRL Section 02 + Section 03 + Section 07. Key inputs: engineering FTE count (Section 02), product personnel cost (Section 02), annual build/tooling cost (Section 02), monthly hosting + infra spend (Section 03 — annualize the 3-month average), infrastructure headcount (Section 03), material capex (Section 03), average fully-loaded engineering salary (Section 07). Toggle the capex view per the capex bullet in Section 03. **Capture the \`deeplink\` URL from the tool response** — it opens the TechPar wizard with these same inputs pre-populated, so the partner can refine in-browser or share the URL. Surface the resulting paradigm assessment + total R&D OpEx + deeplink.`,
    '',
    `Step 5 — Invoke \`assess_infrastructure_cost_governance\` using IRL Section 03 (hosting model + spend trajectory) + Section 02 (tooling + technical-debt-assessment) + Section 07 (FinOps-adjacent headcount, if any). **Capture the \`deeplink\` URL** — it opens the ICG wizard with these same answers pre-populated. Capture the ICG maturity scoring across domains, surface 3-5 prioritized recommendations, and the deeplink.`,
    '',
    `Step 6 — Invoke \`estimate_tech_debt_cost\` using IRL Section 04. Key inputs: maintenance burden percentage (Section 04 active-maintenance bullet), deployment frequency (Section 04), incidents quarterly trend + MTTR (Section 04), planned remediation budget (Section 04), team size (Section 07 engineering headcount), average salary (Section 07). **Capture the \`deeplink\` URL** — it opens the Tech Debt Calculator with sliders pre-positioned. Surface the resulting annualized debt-carry cost + payback projection + deeplink.`,
    '',
    `Step 7 — Invoke \`search_radar\` for the target's product segment + geographies (derive search terms from IRL Section 01 product description and Section 00 geographies). **Capture the \`deeplink\` URL** — it opens the Radar feed filtered to that category. Surface the 3-5 most relevant radar items as market-signal context + the deeplink.`,
    '',
    `Step 8 — Compose the unified dossier. Cross-reference the \`gst://library/vdr-structure\` Library article (embedded later) for VDR-folder labels when surfacing follow-up document requests. Output structure:`,
    '',
    '  **(A) Target snapshot** — one-paragraph profile pulled from IRL Section 00 + 01. Quick-look voice — partner-readable, three-sentence orientation. Include any open-question flags where the IRL gave non-definitive answers.',
    '',
    '  **(B) Diligence agenda** — surface the agenda topics + attention areas from Step 1. One bullet per topic with the "what we look for" framing. Include the wizard `deeplink` from Step 1 as a single "Open Diligence Wizard" link.',
    '',
    '  **(C) Architecture + paradigm assessment** — pull from Step 4 (`compute_techpar`). Frame as a 2-3 paragraph read on the target\'s technical paradigm, R&D OpEx posture, and biggest architectural-cost drivers visible from the IRL. **Close with the `compute_techpar` `deeplink` as a single "Open TechPar Wizard" link** so the partner can refine inputs in-browser.',
    '',
    '  **(D) Infrastructure cost governance assessment** — pull from Step 5 (`assess_infrastructure_cost_governance`). Maturity scores + 3-5 prioritized recommendations, ranked by leverage. **Close with the `assess_infrastructure_cost_governance` `deeplink` as a single "Open ICG Wizard" link** so the partner can refine answers in-browser.',
    '',
    '  **(E) Technical debt assessment** — pull from Step 6 (`estimate_tech_debt_cost`). Annualized carry cost, headline payback projection, and the 1-2 most expensive debt categories the IRL surfaced (e.g., legacy services flagged for rewrite). **Close with the `estimate_tech_debt_cost` `deeplink` as a single "Open Tech Debt Calculator" link** with sliders pre-positioned to the IRL-derived inputs.',
    '',
    '  **(F) Regulatory exposure** — pull from Step 3. One subsection per jurisdiction/framework, citing verbatim article numbers. Cross-jurisdictional transfer mechanism review if the IRL Section 09 flags cross-border data flows. **Each framework subsection closes with the `search_regulations` `deeplink` for that framework** as an "Open in Regulatory Map" link (one deeplink per framework — they filter the map to different region+category combinations).',
    '',
    '  **(G) Comparable engagements** — pull from Step 2. For each of the 3-5 matched code-named engagements, write a 1-line "why this one is relevant" + 1-line lesson. Close with the `search_portfolio` `deeplink` as a single "Open Hub: Comparable engagement view" link.',
    '',
    '  **(H) Market signal** — pull from Step 7. 2-3 bullet summary of what the radar items reveal about the target\'s market timing. **Close with the `search_radar` `deeplink` as a single "Open Radar Feed" link** filtered to the relevant category.',
    '',
    '  **(I) Synthesis + recommendation** — handoff-memo voice (mirror `gst_diligence_handoff_memo`). 3-5 sentences integrating the above: what does the dossier collectively recommend? Where are the biggest unanswered questions even after the high-fidelity intake? What 5-7 VDR follow-up documents (using verbatim labels from `' +
      VDR_RESOURCE_URI +
      '`) should be requested before the next milestone?',
    '',
    '## Voice + format directives',
    '',
    '- Dossier-quality. The output should read as a single coherent partner-level document, not a stitched-together set of tool outputs. Every tool result is a means to a sentence.',
    `- Attribute the synthesis section (I) to ${args.partnerLead ? '`' + args.partnerLead + '`' : 'the GST team'}.`,
    `- Use ${args.projectCodeName ? '`' + args.projectCodeName + '`' : args.targetName ? '`' + args.targetName + '`' : 'the target name'} as the project label.`,
    '- Surface concrete numbers (ARR, headcount, cloud spend, MTTR) from the IRL verbatim — they are the evidence behind every claim.',
    '- Do NOT fabricate data the IRL did not supply. If the filled IRL is sparse on a dimension, flag the gap honestly in the relevant section.',
    "- Honor every tool's `deeplink` field when surfaced — pass it through as a clickable Hub link, do not invent URLs. **Every section (C / D / E / F / G / H) that pulled from a tool MUST close with the corresponding Open-in-Hub link** — this is the bridge between the Claude Desktop dossier and the partner-refinable Hub surface; without it the dossier is read-only.",
    '- Do NOT pad the dossier with section-divider commentary or `gst_diligence_sweep`-meta commentary; the partner reads the artifact, not the process.',
  ].join('\n');
}

const INTERACTIVE_BODY = [
  authorialIntentLine(PROMPT_NAME),
  '',
  `Help the user run the GST diligence sweep — the bookend to \`gst_information_request_list\`. The IRL article (\`${IRL_RESOURCE_URI}\`) is embedded as the next message for taxonomy reference; \`${VDR_RESOURCE_URI}\` follows for VDR-folder labels in synthesis.`,
  '',
  'Step 1. Ask the user:',
  '',
  "> Paste the populated Information Request List your target returned (all 10 sections, in markdown). If you can also share the target name, the engagement context (sell-side / buy-side / value-creation), the partner lead, and an engagement code name, I'll tailor the dossier — but only the filled IRL is required to run the sweep.",
  '',
  'Step 2. Once the user pastes the filled IRL, run the full sweep:',
  `  - Step 2a — Extract the 13 diligence dimensions from the IRL and call \`generate_diligence_agenda\`. The IRL is filled, so derive concrete values; do NOT default to \`'unknown'\`.`,
  `  - Step 2b — Call \`list_portfolio_facets\` then \`search_portfolio\` to pull 3-5 comparable past engagements.`,
  `  - Step 2c — Call \`list_regulation_facets\` then \`search_regulations\` once per framework the IRL Section 09 names.`,
  `  - Step 2d — Call \`compute_techpar\` using IRL Section 02 + 03 + 07 inputs.`,
  `  - Step 2e — Call \`assess_infrastructure_cost_governance\` using IRL Section 03 + 02 + 07.`,
  `  - Step 2f — Call \`estimate_tech_debt_cost\` using IRL Section 04 + 07.`,
  `  - Step 2g — Call \`search_radar\` for the target's product segment + geographies.`,
  '',
  `Step 3. Compose the unified dossier — nine sections (A–I) following the gst_diligence_sweep one-shot layout (target snapshot · diligence agenda · architecture · ICG · tech debt · regulatory · comparables · market signal · synthesis). **Every section that pulls from a tool MUST close with that tool's \`deeplink\` URL as an "Open in Hub" link** — TechPar wizard for (C), ICG wizard for (D), Tech Debt Calculator for (E), Regulatory Map for (F, one per framework), portfolio view for (G), Radar feed for (H). The deeplinks open the corresponding Hub surface with state pre-populated; this is the bridge between the read-only dossier and the partner-refinable interactive tool. Reference the canonical VDR taxonomy (\`${VDR_RESOURCE_URI}\`) verbatim for follow-up document requests in the synthesis section.`,
  '',
  "Voice: dossier-quality. The output reads as a single coherent partner-level document. Surface concrete numbers from the IRL verbatim. Honor every tool's `deeplink` field as a clickable Hub link (do NOT invent URLs). Do NOT fabricate data the IRL did not supply.",
].join('\n');

export const diligenceSweepPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Bookend to gst_information_request_list — ingest a populated IRL and sweep every Hub tool + downstream artifact to produce a unified diligence dossier. The "high-fidelity intake → full platform sweep" workflow.',
  version: '0.0.2',
  lastReviewedAt: '2026-05-22',
  orchestrates: [
    'generate_diligence_agenda',
    'list_portfolio_facets',
    'search_portfolio',
    'list_regulation_facets',
    'search_regulations',
    'compute_techpar',
    'assess_infrastructure_cost_governance',
    'estimate_tech_debt_cost',
    'search_radar',
    IRL_RESOURCE_URI,
    VDR_RESOURCE_URI,
  ] as const,
  argsSchema,
  build: (args) => {
    const bodyText = args.filledIrl
      ? buildOneShotBody({ ...args, filledIrl: args.filledIrl })
      : INTERACTIVE_BODY;
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: bodyText },
        },
        {
          role: 'user',
          content: embedLibraryArticle(IRL_RESOURCE_URI),
        },
        {
          role: 'user',
          content: embedLibraryArticle(VDR_RESOURCE_URI),
        },
      ],
    };
  },
};
