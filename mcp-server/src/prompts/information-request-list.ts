/**
 * Prompt: gst_information_request_list
 *
 * Emits GST's universal one-page intake checklist, organized by VDR taxonomy
 * (00 Basics + sections 01-09 mirroring the VDR-9 folders). The
 * canonical body lives at `gst://library/information-request-list` and is
 * embedded as the second message of every expansion.
 *
 * Input modes (any combination of args triggers the one-shot variant):
 *
 *   1. Bare invocation (no args) — interactive mode. The model first asks
 *      the user for target context, then emits the universal IRL.
 *   2. `targetName` — the company being diligenced; personalizes framing.
 *   3. `companyName` / `projectName` — compose the artifact title.
 *   4. `transactionContext` — light voice tuning per engagement type.
 *   5. `includeSections` — section pick-list (comma-separated numbers).
 *   6. `customRequests` — extra per-section requests ("NN: text" lines).
 *   7. `showCanonicalReference` — canonical-row toggle.
 *   8. `productSummary` — the model may compress answerable questions.
 *
 * Pair with `gst_diligence_kickoff` once the IRL has been filled.
 *
 * **v0.0.2 (BL-044) — file-attachment behavior**: when ANY arg is supplied,
 * the one-shot body instructs the model to also call the
 * `generate_information_request_list_xlsx` tool so the partner receives a
 * downloadable fillable `.xlsx` workbook alongside the paste-ready text.
 * Bare invocation (interactive mode) is unchanged behaviorally.
 *
 * **v0.0.5 (2026-07 configurability) — full option parity with the Hub
 * generator**: the prompt gained `companyName` / `projectName` (title),
 * `includeSections` (pick-list), `customRequests`, and
 * `showCanonicalReference`. The one-shot body computes the EXACT
 * `generate_information_request_list_xlsx` payload and instructs the model to
 * pass it verbatim, and reproduces the in-chat artifact honoring the same
 * config (filtered sections, appended custom requests, composed title) so the
 * paste-ready text and the downloadable file match. Prompt args arrive as
 * strings over the wire (`arrayFromWire` / `booleanFromWire` coerce them).
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { authorialIntentLine, embedLibraryArticle } from './embed';
import { arrayFromWire, booleanFromWire } from './wire-shape';
import { irlSectionCatalog } from '../content/irl-section-catalog';

const RESOURCE_URI = 'gst://library/information-request-list';
const XLSX_TOOL_NAME = 'generate_information_request_list_xlsx';

// "00 Basics · 01 Product · …" — enumerated in the section-number arg describes
// so the model AND the human filling the Claude Desktop prompt form know which
// numbers exist and what each covers, without reading the whole article first.
const SECTION_CATALOG = irlSectionCatalog();

const transactionContextValues = ['sell-side', 'buy-side', 'value-creation', 'unknown'] as const;

const argsSchema = z.object({
  targetName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The target or client name being diligenced — personalizes the 'Target' row and the download filename (e.g., 'MedSig Health'). Distinct from companyName. Omit to emit the universal template."
    ),
  companyName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Requesting company name. Composed into the workbook title as '{Company} {Project} Information Request List' (title only — distinct from targetName)."
    ),
  projectName: z
    .string()
    .min(1)
    .optional()
    .describe('Project / engagement name. Composed into the title alongside companyName.'),
  transactionContext: z
    .enum(transactionContextValues)
    .optional()
    .describe(
      'Engagement context. Must be one of: sell-side · buy-side · value-creation · unknown.'
    ),
  includeSections: arrayFromWire(
    z
      .array(z.string().regex(/^\d{2}$/))
      .min(1)
      .optional()
  )
    .optional()
    .describe(
      `Comma-separated two-digit section numbers to include, e.g. '00,01,03'. Omit for all sections. Available sections: ${SECTION_CATALOG}.`
    ),
  customRequests: z
    .string()
    .optional()
    .describe(
      `Extra engagement-specific requests to append, one per line as 'NN: request text' (NN = two-digit section number), e.g. '01: Describe your top 3 competitors by ARR'. Sections: ${SECTION_CATALOG}.`
    ),
  showCanonicalReference: booleanFromWire(z.boolean().optional())
    .optional()
    .describe(
      "Set 'true' to include the canonical reference-link row in the workbook header (default: omitted)."
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

/**
 * Parse the freeform `customRequests` prompt string ("NN: text" per line) into
 * the structured `{ section, text }[]` shape the XLSX tool expects. Lines that
 * don't start with a two-digit section number are dropped (the describe tells
 * the user the required shape).
 */
function parseCustomRequests(raw: string | undefined): { section: string; text: string }[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d{2})\s*[:\-—]\s*(.+)$/.exec(line);
      return match ? { section: match[1], text: match[2].trim() } : null;
    })
    .filter((entry): entry is { section: string; text: string } => entry !== null);
}

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

function buildOneShotBody(args: z.infer<typeof argsSchema>): string {
  const sections = args.includeSections ?? [];
  const customRequests = parseCustomRequests(args.customRequests);
  const showCanonical = args.showCanonicalReference === true;

  // Compute the EXACT tool payload here so the model copies it verbatim into
  // the tool call — the generated .xlsx (and its Hub download link) then
  // matches the requested configuration with no model-side translation drift.
  const toolArgs: Record<string, unknown> = {};
  if (args.targetName) toolArgs.targetName = args.targetName;
  if (args.transactionContext) toolArgs.transactionContext = args.transactionContext;
  if (args.companyName) toolArgs.companyName = args.companyName;
  if (args.projectName) toolArgs.projectName = args.projectName;
  if (args.productSummary) toolArgs.productSummary = args.productSummary;
  if (sections.length > 0) toolArgs.includeSections = sections;
  if (customRequests.length > 0) toolArgs.customRequests = customRequests;
  if (showCanonical) toolArgs.showCanonicalReference = true;

  const titleParts = [args.companyName, args.projectName].filter(Boolean);
  const titleClause = titleParts.length
    ? `Title the artifact "${titleParts.join(' ')} Information Request List".`
    : 'Title the artifact "Information Request List".';
  const targetClause = args.targetName
    ? `The recipient is **${args.targetName}**.`
    : 'The recipient is the target/client named at the top of the artifact.';
  const voiceClause = args.transactionContext
    ? `Voice: ${VOICE_CUES[args.transactionContext]}`
    : 'Voice: universal. No engagement-specific framing.';
  const productClause = args.productSummary
    ? `The model already knows this about the product: "${args.productSummary}". Where a question is unambiguously answered by that summary, compress or annotate the bullet — do not drop sections wholesale.`
    : 'No product summary provided. Emit the full IRL verbatim.';

  const sectionsClause =
    sections.length > 0
      ? `Reproduce ONLY these sections from the embedded article, in ascending order: ${sections.join(', ')}. Omit every other section.`
      : 'Reproduce every section (`00` → `09`).';
  const customClause =
    customRequests.length > 0
      ? `Then append these engagement-specific requests as additional bullets under their section (they are additive — keep the canonical bullets too):\n${customRequests
          .map((entry) => `  - Section ${entry.section}: ${entry.text}`)
          .join('\n')}`
      : 'Do not add engagement-specific requests beyond the canonical bullets.';
  const canonicalClause = showCanonical
    ? 'Include a "Canonical reference" line in the artifact header pointing at the live article.'
    : 'Do not include a canonical reference line (the workbook omits it by default).';

  return [
    authorialIntentLine(PROMPT_NAME),
    '',
    `Deliver the GST Information Request List as a paste-ready artifact the partner can email or attach to a kickoff meeting. The canonical text is embedded as the next message (Resource \`${RESOURCE_URI}\`) — use it verbatim, preserving the section structure and bullet ordering.`,
    '',
    `Context for the personalization:`,
    `- ${targetClause}`,
    `- ${titleClause}`,
    `- ${voiceClause}`,
    `- ${productClause}`,
    '',
    'Step 1. Add a one-line greeting addressed to the recipient (use their name if supplied). Mention the engagement context (transaction, kickoff, value-creation cadence) in the same line. The article body that follows already opens with the universal recipient instructions ("respond per bullet, mark n/a rather than skip…") — do not duplicate them.',
    '',
    `Step 2. Reproduce the IRL from the next message as the deliverable — do not summarize, restructure, or annotate the canonical bullets inline. ${sectionsClause} Keep the bullet ordering within each section. ${customClause} ${canonicalClause}`,
    '',
    'Step 3. Close with a single-line ask covering turnaround, point of contact, and preferred return format (filled markdown, attached PDFs, or VDR upload). Match the voice cue above.',
    '',
    'Do not invent additional sections beyond the ones requested. Do not add a tools-attribution appendix (the artifact is intentionally clean for client consumption). If a question is materially answered by `productSummary`, you may add a single inline annotation like "_(already noted: …)_" next to the bullet — but never delete it.',
    '',
    `Step 4. Call the **\`${XLSX_TOOL_NAME}\`** tool with EXACTLY these arguments (they encode the configuration above — pass them unchanged so the workbook matches this artifact):`,
    '',
    '```json',
    JSON.stringify(toolArgs, null, 2),
    '```',
    '',
    `The tool returns \`{ filename, base64, mimeType, sectionCount, bulletCount }\` in \`structuredContent\` plus a Hub download link in its text summary — use the filename and counts in your reply so the partner knows what's available. **DO NOT promise an attachment in this chat**: Claude Desktop's MCP tool-result renderer cannot surface arbitrary-mimeType file payloads today. Instead, relay the tool's Hub-page download link (https://globalstrategic.tech/hub/tools/information-request-list-generator/ — it comes back with this exact configuration pre-filled) so the partner gets a one-click download of the identical file. (The base64 in \`structuredContent\` remains available for programmatic API consumers that aren't Claude Desktop.)`,
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
    'Assemble the input-gathering ask GST hands to a target/client before running diligence tools. Configurable per engagement — company/project title, section pick-list, custom per-section requests, canonical-row toggle — with the same options as the Hub generator. When called with args, also calls generate_information_request_list_xlsx (forwarding the full configuration) and directs the partner to the Hub page for a one-click .xlsx download. Pair with gst_diligence_kickoff once the IRL is filled.',
  version: '0.0.5',
  lastReviewedAt: '2026-07-02',
  orchestrates: [RESOURCE_URI, XLSX_TOOL_NAME] as const,
  argsSchema,
  build: (args) => {
    const hasAnyArg =
      args.targetName !== undefined ||
      args.companyName !== undefined ||
      args.projectName !== undefined ||
      args.transactionContext !== undefined ||
      (args.includeSections !== undefined && args.includeSections.length > 0) ||
      args.customRequests !== undefined ||
      args.showCanonicalReference !== undefined ||
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
