/**
 * Prompt: gst_irl_create (BL-140; renamed from gst_irl_fill in server 0.62.0)
 *
 * Walks the model through POPULATING an Information Request List from
 * evidence it already holds in context — a virtual-data-room export,
 * documents remitted piecemeal, public filings, statements made in chat,
 * prior-session extractions — and hands the authored per-row fills to the
 * `fill_information_request_list_xlsx` tool, which builds the populated
 * `.xlsx` server-side (sourcing → File Location D, answer → Comments E).
 *
 * Third member of the IRL prompt family, between the other two:
 * `gst_information_request_list` emits the blank ask; THIS prompt answers
 * it from evidence; `gst_irl_ingestion` sweeps a populated body into the
 * dossier. This prompt STOPS AT THE ARTIFACT — a human review
 * checkpoint sits between fill and ingest by operator ruling, so this
 * body never instructs an ingestion or sweep call.
 *
 * Deliberately NOT `consumesTargetEvidence`: that flag's clause carries a
 * mandatory upgrade path (`prepare_irl_body` → `validate_irl_provenance`)
 * that would contradict stop-at-artifact. The exclusion and its reason
 * are recorded in `irl-evidence-precedence-clause.test.ts`'s rationale
 * block and `src/docs/prompts/README.md`.
 *
 * Sourcing discipline (ADR-0021, binding): every fill carries BOTH the
 * answer and what it rests on; a reference must name something actually
 * present in context; bare unattributable inference stays unwritten. The
 * D-cell grammar (no em-dash, no parens, no control characters,
 * '; '-joined segments, bracketed non-document origins) is enforced by
 * the tool's schema — this body teaches it with examples so the first
 * call succeeds.
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import {
  authorialIntentLine,
  deliveredAsDocumentClause,
  embeddedTaxonomyFramingForFill,
  embedIrlGeneratorSource,
  IRL_SOURCE_EMBED_URI,
} from './embed';
import { arrayFromWire, booleanFromWire, enumFromWire, stringFromWire } from './wire-shape';
import { irlSectionCatalog } from '../content/irl-section-catalog';
import { loadIrlSourceBody } from '../content/irl-source-loader';
import { parseIrlArticle } from '../../../src/utils/irl/parse-article';
import { customizeIrlArticle } from '../../../src/utils/irl/customize-article';
import { enumerateWorkbookRefs } from '../../../src/utils/irl/generate-xlsx';

const FILL_TOOL_NAME = 'fill_information_request_list_xlsx';

const SECTION_CATALOG = irlSectionCatalog();

const transactionContextValues = ['sell-side', 'buy-side', 'value-creation', 'unknown'] as const;

const argsSchema = z.object({
  targetName: stringFromWire(z.string().min(1).optional())
    .optional()
    .describe(
      "The target or client the evidence describes — personalizes the 'Target' row and the download filename (e.g., 'MedSig Health')."
    ),
  companyName: stringFromWire(z.string().min(1).optional())
    .optional()
    .describe(
      "Requesting company name. Composed into the workbook title as '{Company} {Project} Information Request List' (title only — distinct from targetName)."
    ),
  projectName: stringFromWire(z.string().min(1).optional())
    .optional()
    .describe('Project / engagement name. Composed into the title alongside companyName.'),
  transactionContext: enumFromWire(z.enum(transactionContextValues).optional())
    .optional()
    .describe(
      'Engagement context. Must be one of: sell-side · buy-side · value-creation · unknown. Also fires the authored skip-if directives — questions tagged for the supplied context are removed from the workbook.'
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
  customRequests: stringFromWire(z.string().optional())
    .optional()
    .describe(
      `Extra engagement-specific requests to append, one per line as 'NN: request text' (NN = two-digit section number). Custom rows are fillable too — their Reference ids continue past the section's canonical count. Sections: ${SECTION_CATALOG}.`
    ),
  excludeRequests: arrayFromWire(
    z
      .array(z.string().regex(/^\d{2}-\d{2}$/))
      .min(1)
      .optional()
  )
    .optional()
    .describe(
      "Comma-separated 'NN-II' keys of individual canonical questions to REMOVE, e.g. '02-03,05-01'. Surviving questions keep their Reference IDs — gaps are intentional. Use the list_irl_requests tool to map question text to keys."
    ),
  showCanonicalReference: booleanFromWire(z.boolean().optional())
    .optional()
    .describe(
      "Set 'true' to include the canonical reference-link row in the workbook header (default: omitted)."
    ),
});

/**
 * Parse the freeform `customRequests` prompt string ("NN: text" per line)
 * into the structured `{ section, text }[]` shape the fill tool expects.
 * Same line grammar as the sibling generator prompt.
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

/**
 * Server-computed Reference set for THIS configuration — the same shared
 * pipeline the tool runs (`customizeIrlArticle` → `enumerateWorkbookRefs`),
 * so the refs the body hands the model are exactly the refs the tool will
 * accept. No prompt-side filter logic (BL-044.5 single-filter-engine rule).
 */
function computeValidRefs(args: z.infer<typeof argsSchema>): string[] {
  try {
    const article = parseIrlArticle(loadIrlSourceBody());
    const built = customizeIrlArticle(article, {
      context: args.transactionContext,
      includeSections: args.includeSections,
      excludeRequests: args.excludeRequests,
      customRequests: parseCustomRequests(args.customRequests),
    });
    return enumerateWorkbookRefs(built);
  } catch {
    // Source unavailable at build time (prebuild not run) — the embed itself
    // surfaces the error; degrade to an empty list and let the body's
    // fallback sentence direct the model to list_irl_requests.
    return [];
  }
}

const PROMPT_NAME = 'gst_irl_create';

const SOURCING_RULES = [
  'Author one `fills` entry per row the evidence can answer — `{ ref, fileLocation, comments }`:',
  '',
  '- **`comments` is the answer**, drawn from the evidence, single-line plain prose. Under the frozen extraction rules it joins the row\'s answer span and counts as substantive — so never write a placeholder, a caveat, or a "see document" pointer there: an entry in `comments` IS an answer.',
  '- **`fileLocation` is what the answer rests on** — a succinct reference, not an excerpt. Before writing one, confirm the reference names something ACTUALLY PRESENT in this context. One or more segments joined by `; `:',
  '  - a document reference with an optional comma-separated locator — `TechDebtRegistryAndRoadmap.pdf, page 4, paragraph 2` · `VDR/06/soc2-2025.pdf, section 3.2`',
  '  - a bracketed non-document origin — `[User stated this Jan 4 2026 2pm in session chat]`',
  '  - a bracketed named-inputs inference — `[inferred from FileA.pdf + FileB.xlsx]`',
  '- **Forbidden in `fileLocation`** (the tool rejects them; each traces to a frozen-path mechanism): em-dashes — write `TechDebt.pdf, page 4`, never `TechDebt.pdf — page 4`; parentheses — `SOC 2 report (2025)` fails, write `SOC 2 report 2025`; newlines; `;` inside a segment; nested brackets.',
  '- **Bare unattributable inference stays unwritten.** An answer you cannot pin to a document, a named statement, or named inputs: OMIT the row. Rows you omit stay blank in the workbook, and those blanks are precisely the follow-up ask to put to the target — never pad them.',
  '- Every entry needs BOTH fields — an answer without sourcing and sourcing without an answer are both rejected by the tool schema.',
].join('\n');

const RERUN_RULE = [
  'If you populated this IRL earlier — in this session or a prior one — pass the FULL UNION: every previously authored fill unchanged, new sources appended to an existing row as additional `; `-joined `fileLocation` segments, extended answers appended to the existing `comments` prose rather than rewriting it. Never drop or rewrite a previously authored fill; the tool drops exact-duplicate source segments itself, so a re-sent union is safe.',
].join('\n');

function buildOneShotBody(args: z.infer<typeof argsSchema>): string {
  const customRequests = parseCustomRequests(args.customRequests);
  const validRefs = computeValidRefs(args);

  // Compute the EXACT scoping payload here so the model copies it verbatim
  // into the tool call — the workbook then matches this configuration with no
  // model-side translation drift. The model adds ONLY the `fills` array.
  const toolArgs: Record<string, unknown> = {};
  if (args.targetName) toolArgs.targetName = args.targetName;
  if (args.transactionContext) toolArgs.transactionContext = args.transactionContext;
  if (args.companyName) toolArgs.companyName = args.companyName;
  if (args.projectName) toolArgs.projectName = args.projectName;
  if (args.includeSections && args.includeSections.length > 0) {
    toolArgs.includeSections = args.includeSections;
  }
  if (args.excludeRequests && args.excludeRequests.length > 0) {
    toolArgs.excludeRequests = args.excludeRequests;
  }
  if (customRequests.length > 0) toolArgs.customRequests = customRequests;
  if (args.showCanonicalReference === true) toolArgs.showCanonicalReference = true;

  const targetClause = args.targetName
    ? `The evidence describes **${args.targetName}**.`
    : 'The evidence describes the target named in the conversation.';
  const refsClause =
    validRefs.length > 0
      ? `The workbook this configuration produces contains exactly these Reference ids (fill only these — rows removed by section filters, exclusions, or skip-if directives are not addressable): ${validRefs.join(', ')}.`
      : 'Derive the fillable Reference ids from the embedded taxonomy (unpadded section digit + two-digit ordinal, e.g. `0-03`); the tool rejects unknown refs with an actionable list.';

  return [
    authorialIntentLine(PROMPT_NAME),
    '',
    `Populate the GST Information Request List from the evidence already in this context, so the engagement can proceed without waiting for the target to return a filled workbook. The canonical question set is embedded inline as the next message (\`${IRL_SOURCE_EMBED_URI}\`).`,
    '',
    embeddedTaxonomyFramingForFill(),
    '',
    deliveredAsDocumentClause({ citesRunParameters: false }),
    '',
    `Context: ${targetClause}`,
    '',
    'Step 1. **Inventory the evidence.** List, by name, every source in this context you can answer from: attached or pasted documents, data-room exports, public filings, prior-session extractions, and specific statements the user has made in chat. This list is what your `fileLocation` references must come from — if a source is not in front of you, nothing may rest on it.',
    '',
    `Step 2. **Walk every request row of the embedded taxonomy and author the fills.** ${refsClause}`,
    '',
    SOURCING_RULES,
    '',
    `Step 3. **Re-runs extend, never overwrite.** ${RERUN_RULE}`,
    '',
    `Step 4. Call the **\`${FILL_TOOL_NAME}\`** tool with EXACTLY these scoping arguments plus your authored \`fills\` array (pass the scoping unchanged so the workbook matches this configuration):`,
    '',
    '```json',
    JSON.stringify(toolArgs, null, 2),
    '```',
    '',
    `Step 5. **Stop at the artifact.** The tool returns \`{ filename, base64, mimeType, filledRowCount, blankRowCount, filledRefs, … }\` in \`structuredContent\`. Report the counts and \`filledRefs\`, and say plainly that the blank rows are the outstanding ask to put to the target. The operator reviews the populated workbook and then runs \`gst_irl_ingestion\` themselves, exactly as for a target-returned IRL — **do NOT invoke \`gst_irl_ingestion\`, \`prepare_irl_body\`, or any other tool after the fill call**; a human review checkpoint sits between fill and ingest by design. Delivery note: the base64 payload is the artifact — there is no Hub download page for populated workbooks, and Claude Desktop cannot render arbitrary-mimeType attachments, so write the file client-side where the client supports it.`,
  ].join('\n');
}

const INTERACTIVE_BODY = [
  authorialIntentLine(PROMPT_NAME),
  '',
  `Help the user populate GST's Information Request List from evidence already in this context. The canonical question set is embedded inline as the next message (\`${IRL_SOURCE_EMBED_URI}\`).`,
  '',
  embeddedTaxonomyFramingForFill(),
  '',
  deliveredAsDocumentClause({ citesRunParameters: false }),
  '',
  'Step 1. Ask the user:',
  '',
  '> Which target is this for, and what evidence should I draw from — attached documents, a data-room export, public filings, prior sessions, or things you tell me here? Is the engagement sell-side, buy-side, or value-creation?',
  '',
  'Step 2. Once the user answers, inventory the evidence by name — attached or pasted documents, filings, prior-session extractions, specific statements from chat. Only what is actually in front of you may be sourced from.',
  '',
  'Step 3. Walk every request row of the embedded taxonomy and author the fills:',
  '',
  SOURCING_RULES,
  '',
  RERUN_RULE,
  '',
  `Step 4. Call the **\`${FILL_TOOL_NAME}\`** tool with the scoping arguments the user gave you (targetName, transactionContext, and any section configuration) plus your authored \`fills\` array.`,
  '',
  'Step 5. **Stop at the artifact.** Report `filledRowCount`, `blankRowCount`, and `filledRefs`; say plainly that the blank rows are the outstanding ask to put to the target. The operator reviews the populated workbook and then runs `gst_irl_ingestion` themselves — do NOT invoke `gst_irl_ingestion`, `prepare_irl_body`, or any other tool after the fill call; a human review checkpoint sits between fill and ingest by design.',
].join('\n');

export const irlCreatePrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Populate the Information Request List from evidence already in context — a data-room export, remitted documents, public filings, prior sessions, statements in chat — instead of waiting for the target to return a filled workbook. The model inventories its evidence, authors per-row fills (answer + a sourcing reference under the D-cell grammar; unattributable rows stay blank), and calls fill_information_request_list_xlsx to build the populated .xlsx. Blank rows ARE the follow-up ask. Stops at the artifact: the operator reviews, then runs gst_irl_ingestion exactly as for a target-returned IRL.',
  version: '0.2.0',
  lastReviewedAt: '2026-08-26',
  orchestrates: [IRL_SOURCE_EMBED_URI, FILL_TOOL_NAME] as const,
  argsSchema,
  build: (args) => {
    const hasAnyArg =
      args.targetName !== undefined ||
      args.companyName !== undefined ||
      args.projectName !== undefined ||
      args.transactionContext !== undefined ||
      (args.includeSections !== undefined && args.includeSections.length > 0) ||
      (args.excludeRequests !== undefined && args.excludeRequests.length > 0) ||
      args.customRequests !== undefined ||
      args.showCanonicalReference !== undefined;
    const bodyText = hasAnyArg ? buildOneShotBody(args) : INTERACTIVE_BODY;
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: bodyText },
        },
        {
          role: 'user',
          content: embedIrlGeneratorSource(),
        },
      ],
    };
  },
};
