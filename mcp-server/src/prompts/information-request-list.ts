/**
 * Prompt: gst_information_request_list
 *
 * Emits GST's universal one-page intake checklist, organized by VDR taxonomy
 * (00 Basics + sections 01-09 mirroring the VDR-9 folders). The
 * canonical body lives at `gst://library/information-request-list` and is
 * embedded as the second message of every expansion (same pattern as
 * `gst_vdr_audit`).
 *
 * Three input modes (any combination of args triggers the one-shot variant):
 *
 *   1. Bare invocation (no args) — interactive mode. The model first asks
 *      the user for target context, then emits the universal IRL.
 *   2. `targetName` supplied — personalize the artifact's framing.
 *   3. `transactionContext` supplied — light voice tuning per engagement
 *      type (sell-side / buy-side / value-creation).
 *   4. `productSummary` supplied — the model may compress questions it can
 *      already answer from context.
 *
 * Pair with `gst_diligence_kickoff` once the IRL has been filled.
 *
 * **v0.0.2 (BL-044) — file-attachment behavior**: when ANY arg is supplied,
 * the one-shot body now instructs the model to also call the
 * `generate_information_request_list_xlsx` tool so the partner receives a
 * downloadable fillable `.xlsx` workbook alongside the paste-ready text.
 * Bare invocation (interactive mode) is unchanged behaviorally — still
 * emits text only. The XLSX uses the same canonical article body the
 * model is reproducing, so partner-facing text and partner-facing file
 * stay byte-identical (single source of truth at `article.md`).
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { authorialIntentLine, embedLibraryArticle } from './embed';

const RESOURCE_URI = 'gst://library/information-request-list';
const XLSX_TOOL_NAME = 'generate_information_request_list_xlsx';

const transactionContextValues = ['sell-side', 'buy-side', 'value-creation', 'unknown'] as const;

const argsSchema = z.object({
  targetName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The target or client name — used to personalize the request artifact (e.g., 'MedSig Health'). Omit to emit the universal template."
    ),
  transactionContext: z
    .enum(transactionContextValues)
    .optional()
    .describe(
      'Engagement context. Must be one of: sell-side · buy-side · value-creation · unknown.'
    ),
  productSummary: z
    .string()
    .min(10)
    .max(500)
    .optional()
    .describe(
      "One-paragraph product description if known. Lets the model compress questions it can answer from context (e.g., if productSummary clearly says 'pure SaaS, no hardware', Section 01 deployment questions can be tightened)."
    ),
});

const PROMPT_NAME = 'gst_information_request_list';

const VOICE_CUES: Record<(typeof transactionContextValues)[number], string> = {
  'sell-side':
    'Sell-side framing: this is your story to tell. The IRL helps GST help you put the strongest, most defensible version of your business in front of buyers.',
  'buy-side':
    'Buy-side framing: GST is supporting your evaluation of the target. The IRL is the structured information we need to size technical, regulatory, and organizational risk for this engagement (whether pre-LOI or LOI-stage).',
  'value-creation':
    'Value-creation framing: GST is partnering with you on platform investments. The IRL is the baseline we need to prioritize the 100-day roadmap and the first 12 months of work.',
  unknown:
    'Engagement context unspecified — frame the IRL as universal. The recipient can self-select which framing applies.',
};

function buildOneShotBody(args: {
  targetName?: string;
  transactionContext?: (typeof transactionContextValues)[number];
  productSummary?: string;
}): string {
  const targetClause = args.targetName
    ? `The recipient is **${args.targetName}**.`
    : 'The recipient is the target/client named at the top of the artifact.';
  const voiceClause = args.transactionContext
    ? `Voice: ${VOICE_CUES[args.transactionContext]}`
    : 'Voice: universal. No engagement-specific framing.';
  const productClause = args.productSummary
    ? `The model already knows this about the product: "${args.productSummary}". Where a question is unambiguously answered by that summary, compress or annotate the bullet — do not drop sections wholesale.`
    : 'No product summary provided. Emit the full IRL verbatim.';

  return [
    authorialIntentLine(PROMPT_NAME),
    '',
    `Deliver the GST Information Request List as a paste-ready artifact the partner can email or attach to a kickoff meeting. The canonical text is embedded as the next message (Resource \`${RESOURCE_URI}\`) — use it verbatim, preserving the section structure and bullet ordering.`,
    '',
    `Context for the personalization:`,
    `- ${targetClause}`,
    `- ${voiceClause}`,
    `- ${productClause}`,
    '',
    'Step 1. Add a one-line greeting addressed to the recipient (use their name if supplied). Mention the engagement context (transaction, kickoff, value-creation cadence) in the same line. The article body that follows already opens with the universal recipient instructions ("respond per bullet, mark n/a rather than skip…") — do not duplicate them.',
    '',
    'Step 2. Reproduce the embedded IRL verbatim from the next message. Keep the section ordering (`00` → `09`). Keep every bullet. The artifact is the deliverable — do not summarize, restructure, or annotate the bullets inline.',
    '',
    'Step 3. Close with a single-line ask covering turnaround, point of contact, and preferred return format (filled markdown, attached PDFs, or VDR upload). Match the voice cue above.',
    '',
    'Do not invent additional sections. Do not add a tools-attribution appendix (the artifact is intentionally clean for client consumption). If a question is materially answered by `productSummary`, you may add a single inline annotation like "_(already noted: …)_" next to the bullet — but never delete it.',
    '',
    `Step 4. Call the **\`${XLSX_TOOL_NAME}\`** tool with the same args (\`targetName\`, \`transactionContext\`) so the partner gets a downloadable fillable \`.xlsx\` workbook alongside the paste-ready text. The tool returns \`{ filename, base64, mimeType }\` — attach the file to your reply. The XLSX mirrors the same canonical article body the model is reproducing above, so partner-facing text and partner-facing file stay byte-identical.`,
  ].join('\n');
}

const INTERACTIVE_BODY = [
  authorialIntentLine(PROMPT_NAME),
  '',
  `Help the user assemble GST's Information Request List for an engagement. The canonical text is embedded as the next message (Resource \`${RESOURCE_URI}\`).`,
  '',
  'Step 1. Ask the user:',
  '',
  '> What target or client is this for, and is the engagement sell-side, buy-side, or value-creation? If you can share a one-paragraph product summary, I can lightly tune the artifact; otherwise I will emit the universal template.',
  '',
  'Step 2. Once the user answers, deliver the IRL as a paste-ready artifact:',
  '  - Add a one-line greeting addressed to the recipient (use their name if supplied) that mentions the engagement context. The article body already opens with universal recipient instructions — do not duplicate them.',
  '  - Reproduce the embedded IRL verbatim from the next message (sections `00` through `09`, every bullet preserved).',
  '  - Close with a one-line ask covering turnaround, point of contact, and preferred return format.',
  '',
  'Step 3. If the user only supplies partial context (e.g., target name but no transaction type), proceed with universal framing and note in the close-out line that the recipient can self-select the relevant context.',
  '',
  'Do not invent additional sections. Do not add a tools-attribution appendix — the artifact is intentionally clean for client consumption.',
].join('\n');

export const informationRequestListPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Assemble the input-gathering ask GST hands to a target/client before running diligence tools. When called with args, also emits a downloadable fillable .xlsx via generate_information_request_list_xlsx so the recipient has a structured response surface. Pair with gst_diligence_kickoff once the IRL is filled.',
  version: '0.0.3',
  lastReviewedAt: '2026-05-24',
  orchestrates: [RESOURCE_URI, XLSX_TOOL_NAME] as const,
  argsSchema,
  build: (args) => {
    const hasAnyArg =
      args.targetName !== undefined ||
      args.transactionContext !== undefined ||
      args.productSummary !== undefined;
    const bodyText = hasAnyArg ? buildOneShotBody(args) : INTERACTIVE_BODY;
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: bodyText },
        },
        {
          role: 'user',
          content: embedLibraryArticle(RESOURCE_URI),
        },
      ],
    };
  },
};
