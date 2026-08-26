/**
 * MCP tool: `fill_information_request_list_xlsx` (BL-140)
 *
 * Produces a POPULATED `.xlsx` of the canonical GST Information Request
 * List — answers drawn from evidence the model holds in context, written
 * at build time through the same machinery the frozen generator uses:
 *
 *   1. Load + parse the IRL generator source (identical to the sibling
 *      `generate_information_request_list_xlsx`).
 *   2. Customize per engagement (`customizeIrlArticle`, shared path).
 *   3. Validate the model-authored `fills` against the built workbook's
 *      actual Reference set and the D-cell sourcing grammar (ADR-0021).
 *   4. Render via `generateIrlXlsxBuffer` with its BL-140 prefill
 *      parameter — sourcing into File Location (D), the answer into
 *      Comments (E). Rows the evidence cannot answer stay blank: the
 *      partially populated workbook IS the follow-up ask.
 *
 * Placement is the design (ADR-0021): under the frozen extraction rules
 * the answer in E joins the answer span (signal — counts toward
 * fillRatio and opens inclusion gates), while the D reference renders
 * inside `(Source: …)` (non-signal), so the emitted artifact behaves
 * correctly under the frozen downstream path with zero edits to it.
 *
 * The tool STOPS AT THE ARTIFACT. It never invokes the ingestion sweep —
 * a human review checkpoint sits between fill and `gst_irl_ingestion` by
 * operator ruling. The server never retains the workbook: it returns
 * `{ filename, base64, mimeType, … }` and the client writes the file.
 *
 * Workers-runtime safe for the same reasons as the sibling: pure JS
 * xlsx-js-style, `btoa` via `lib/base64`, no `Buffer`, no I/O at handler
 * time.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import { loadIrlSourceBody } from '../content/irl-source-loader';
import { parseIrlArticle } from '../../../src/utils/irl/parse-article';
import {
  generateIrlXlsxBuffer,
  buildIrlFilename,
  enumerateWorkbookRefs,
  IRL_XLSX_MIME_TYPE,
  type IRLRowPrefill,
  type IRLTransactionContext,
} from '../../../src/utils/irl/generate-xlsx';
import { customizeIrlArticle } from '../../../src/utils/irl/customize-article';
import { irlSectionCatalog } from '../content/irl-section-catalog';
import { IRL_REF_PATTERN } from '../schemas/irl-extract-record';
import { HUB_BASE } from '../config';
import { uint8ToBase64 } from '../lib/base64';
import { toolOk, toolFail } from './_result';

const IRL_CANONICAL_URL = `${HUB_BASE}/hub/library/information-request-list/`;

const SECTION_CATALOG = irlSectionCatalog();

const transactionContextValues = ['sell-side', 'buy-side', 'value-creation', 'unknown'] as const;

/**
 * The D-cell sourcing grammar (ADR-0021, BL-140 open question 1 as ruled).
 *
 * One cell = one or more SEGMENTS joined by `"; "`. A segment is either a
 * bracketed non-document origin (`[User stated this Jan 4 2026 2pm in
 * session chat]`, `[inferred from FileA.pdf + FileB.xlsx]`) or a document
 * reference with an optional comma-separated locator
 * (`TechDebtRegistryAndRoadmap.pdf, page 4, paragraph 2`).
 *
 * Forbidden characters, each traceable to a frozen-path mechanism:
 *   - em-dash U+2014: `validate_irl_provenance`'s `extractExcerpt` anchors
 *     on the LAST em-dash in a citation — one copied from D would collapse
 *     the checked excerpt to the tail. En-dash and hyphen stay legal.
 *   - `(` `)`: the frozen extractor renders D inside `(Source: ${d})`
 *     paren-naively; a `)` would visually close the group early.
 *   - `;` inside a segment: reserved as the multi-segment separator so a
 *     re-run can append further sources and each stays parseable.
 *   - control characters (incl. CR/LF): in-cell newlines survive into the
 *     flattened markdown and detach `(Source: …)` from its bullet (the
 *     extractor's own docstring records this).
 *   - nested/stray brackets: keeps bracketed origin tokens unambiguous.
 *
 * The UAT-07 manual token `[pre-populated, not recipient-confirmed]`
 * parses as a valid bracketed segment — the grammar is a superset of it.
 */
const SEG = String.raw`[^\][()\u2014;\u0000-\u001F\u007F]{1,200}`;
export const IRL_FILE_LOCATION_PATTERN = new RegExp(
  `^(?:\\[${SEG}\\]|${SEG})(?:; (?:\\[${SEG}\\]|${SEG}))*$`
);

/** Segment separator for multi-source D cells; also the dedup split token. */
const D_SEGMENT_SEPARATOR = '; ';

export const FillIrlXlsxInputSchema = z.object({
  // ── Scoping args: verbatim from the frozen sibling (productSummary
  //    deliberately omitted — its purpose is removing questions the model
  //    can answer, the inverse of this tool). ──────────────────────────────
  targetName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Target or client name. When supplied, appears in the workbook header AND the download filename slug (e.g. 'MedSig Health' → `GST-IRL-MedSig-Health-2026-05-23.xlsx`)."
    ),
  transactionContext: z
    .enum(transactionContextValues)
    .optional()
    .describe(
      "Engagement context. One of: sell-side · buy-side · value-creation · unknown. Labels the engagement in the workbook header AND fires the source's authored skip-if directives (BL-044.5) — questions tagged for the supplied context are auto-removed, leaving Reference-ID gaps. 'unknown' fires nothing. Call `list_irl_requests` to see which questions carry directives."
    ),
  companyName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Requesting company name. Composed into the workbook title cell as `{companyName} {projectName} Information Request List` (title only — distinct from `targetName`, which is the company being diligenced). E.g. companyName 'Praxis Capital' → title starts 'Praxis Capital …'."
    ),
  projectName: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Engagement / project name. Composed into the title cell alongside `companyName`. Either, both, or neither may be supplied.'
    ),
  includeSections: z
    .array(z.string().regex(/^\d{2}$/))
    .min(1)
    .optional()
    .describe(
      `Two-digit section numbers to INCLUDE (e.g. ['00','03','09']). Omit for all sections. Available sections: ${SECTION_CATALOG}. Unknown numbers are ignored; Reference IDs of the kept sections are unchanged.`
    ),
  customRequests: z
    .array(
      z.object({
        section: z
          .string()
          .regex(/^\d{2}$/)
          .describe(
            `Two-digit section number to append this request to. One of: ${SECTION_CATALOG}.`
          ),
        text: z.string().min(1).max(500).describe('The custom request text.'),
      })
    )
    .max(50)
    .optional()
    .describe(
      `Ad-hoc engagement-specific requests appended to individual sections. Each becomes a new row under its section with the next Reference ID. Each 'section' is one of: ${SECTION_CATALOG}. Requests for a section not included/present are dropped.`
    ),
  excludeRequests: z
    .array(z.string().regex(/^\d{2}-\d{2}$/))
    .min(1)
    .max(100)
    .optional()
    .describe(
      `Canonical questions to REMOVE, as 'NN-II' keys — two-digit section number + two-digit 1-based position in the canonical source (e.g. '02-03' = question 3 of section 02, shown in the workbook Reference column as '2-03'; the key keeps the leading zero, the Reference drops it). Surviving questions KEEP their Reference IDs, leaving intentional gaps that signal deliberate omission. Unknown/malformed keys are ignored; a section whose every question is removed is dropped. Call \`list_irl_requests\` first to map question text to keys. Sections: ${SECTION_CATALOG}.`
    ),
  showCanonicalReference: z
    .boolean()
    .optional()
    .describe(
      'Show the "Canonical reference" URL row in the workbook header. Defaults to false (hidden).'
    ),

  // ── The population surface (BL-140). ─────────────────────────────────────
  fills: z
    .array(
      z.object({
        ref: z
          .string()
          .regex(IRL_REF_PATTERN)
          .describe(
            "Workbook Reference of the row to populate, EXACTLY as the Reference column renders it: unpadded section digit(s) + '-' + two-digit ordinal, e.g. '0-03', '4-01', '10-02'. This is NOT the 'NN-II' exclusion key ('00-03') used by excludeRequests — the Reference drops the section's leading zero. Custom-request rows are addressable too: their refs continue past the section's canonical count (e.g. a customRequests entry appended to section 00 with 11 canonical questions gets '0-12')."
          ),
        fileLocation: z
          .string()
          .trim()
          .min(1)
          .max(300)
          .regex(IRL_FILE_LOCATION_PATTERN)
          .describe(
            "What the answer rests on — written to File Location (D). One or more segments joined by '; '. A segment is EITHER a document reference with an optional comma-separated locator ('TechDebtRegistryAndRoadmap.pdf, page 4, paragraph 2') OR a bracketed non-document origin ('[User stated this Jan 4 2026 2pm in session chat]', '[inferred from FileA.pdf + FileB.xlsx]'). Forbidden anywhere: em-dash (U+2014), '(' , ')', newlines/control characters, ';' inside a segment, nested brackets. A reference, not an excerpt — no quotes, no confidence grades. Only author a fill whose reference names something actually present in your context."
          ),
        comments: z
          .string()
          .trim()
          .min(1)
          .max(2000)
          // Deliberate control-character rejection: an in-cell newline
          // detaches the rendered "(Source: …)" from its bullet in the
          // flattened markdown.
          // eslint-disable-next-line no-control-regex
          .regex(/^[^\u0000-\u001F\u007F]+$/)
          .describe(
            'The answer drawn from the evidence — written to Comments (E), which the frozen extraction path joins into the row\'s answer span. Single-line plain prose (no newlines/control characters — in-cell newlines detach the rendered "(Source: …)" from its bullet). Never invent content the fileLocation evidence does not support.'
          ),
      })
    )
    .min(1)
    .max(200)
    .describe(
      "Per-row population. Both fields are required on every entry — an answer without sourcing and sourcing without an answer are both rejected by construction (the fill never writes D without E). Rows you cannot answer attributably: OMIT them — blank rows are self-evidently unanswered and the partially populated workbook is itself the follow-up ask. Refs must be unique and must exist in the workbook this call's scoping args produce."
    ),
});

export type FillIrlXlsxInput = z.infer<typeof FillIrlXlsxInputSchema>;

const TOOL_DESCRIPTION = `Produce a POPULATED GST **Information Request List** \`.xlsx\` — answers drawn from evidence already in context (a data-room export, remitted documents, public filings, prior sessions), so the dossier pipeline can start without waiting for the target to return a filled workbook.

Returns \`{ filename, base64, mimeType, filledRowCount, blankRowCount, filledRefs, … }\`. Each \`fills\` entry writes its sourcing reference into File Location (column D) and its answer into Comments (column E) of the addressed row; every other row stays blank. Under the frozen extraction rules the E answer joins the row's answer span (it counts as substantive) while the D reference renders inside \`(Source: …)\` — so the emitted workbook behaves downstream exactly like a target-returned one, and the blank rows ARE the follow-up ask to send out.

**When to call this tool**: a partner holds evidence but no filled IRL — pre-LOI screening, a data room opened before the IRL went out, sell-side prep, or topping up coverage from filings. Pair with the \`gst_irl_create\` prompt, which walks the model through authoring \`fills\` under the sourcing grammar.

**Sourcing discipline (enforced at fill time, shape only)**: every answered row carries a well-shaped D entry — a document reference with optional locator (\`VDR/06/soc2-2025.pdf, section 3.2\`), a bracketed non-document origin (\`[User stated this Jan 4 2026 2pm in session chat]\`), or a bracketed named-inputs inference (\`[inferred from FileA.pdf + FileB.xlsx]\`). Bare unattributable inference stays unwritten — omit the row. The referenced file's existence is deliberately NOT checked (the Worker cannot see it); the reference is for the human reviewer to follow.

**Idempotency**: identical (scoping args, fills) → identical workbook content; only the generation timestamp (filename slug + Generated header row) varies. Re-running over an already-populated IRL is compositional: pass the full union — every previously authored fill unchanged, new D sources appended as \`'; '\` segments (exact-duplicate segments are dropped server-side), answer prose extended rather than rewritten.

**This tool stops at the artifact.** It never invokes \`gst_irl_ingestion\` or any sweep tool — the operator reviews the populated workbook first, then runs ingestion exactly as they would for a target-returned IRL. There is no Hub download surface for populated workbooks (the Hub generator produces blank ones); the base64 payload is the artifact.

**Scoping inputs** are the frozen generator's, minus \`productSummary\`: \`targetName\`, \`companyName\`/\`projectName\`, \`transactionContext\` (fires skip-if directives), \`includeSections\`, \`excludeRequests\` (\`'NN-II'\` keys), \`customRequests\`, \`showCanonicalReference\`.

**Sections** (valid \`includeSections\` / \`customRequests[].section\` values): ${SECTION_CATALOG}.`;

export async function handleFillIrlXlsxTool(input: FillIrlXlsxInput) {
  const article = parseIrlArticle(loadIrlSourceBody());

  const built = customizeIrlArticle(article, {
    context: input.transactionContext,
    includeSections: input.includeSections,
    excludeRequests: input.excludeRequests,
    customRequests: input.customRequests,
  });

  // Zero-section guard — same condition as the frozen sibling, but emitted
  // as a toolFail (new file, house error-code set preferred for new code).
  if (built.sections.length === 0 && (input.includeSections || input.excludeRequests)) {
    if (input.includeSections) {
      const valid = article.sections.map((s) => s.number).join(', ');
      return toolFail(
        'invalid-input',
        `No sections matched includeSections=[${input.includeSections.join(', ')}]. Valid section numbers: ${valid}.`
      );
    }
    return toolFail(
      'invalid-input',
      `Every request was excluded — the configuration (excludeRequests${input.transactionContext ? ' + directive-fired transactionContext' : ''}) removed all questions. Remove some excludeRequests keys (see list_irl_requests) so at least one question remains.`
    );
  }

  // The built workbook's actual Reference set — the same walk
  // buildPrimarySheet consumes, so agreement is structural (BL-140).
  const validRefs = new Set(enumerateWorkbookRefs(built));

  // Duplicate refs: explicit error, not merge. Merging would silently
  // reorder/concatenate answers; the union operation stays model-side
  // where the evidence lives.
  const seen = new Set<string>();
  const duplicateRefs = [
    ...new Set(input.fills.map((f) => f.ref).filter((ref) => seen.size === seen.add(ref).size)),
  ];
  if (duplicateRefs.length > 0) {
    return toolFail(
      'invalid-input',
      `Duplicate refs in fills: ${duplicateRefs.join(', ')}. Each row may appear once — to combine sources for one row, join them in a single fileLocation with '; ' and merge the answer prose into one comments value.`,
      { duplicateRefs }
    );
  }

  const unknownRefs = input.fills.map((f) => f.ref).filter((ref) => !validRefs.has(ref));
  if (unknownRefs.length > 0) {
    return toolFail(
      'invalid-input',
      `Unknown refs in fills: ${unknownRefs.join(', ')}. Refs must match the workbook Reference column this call's scoping args produce ('0-03' — unpadded section digit; NOT the 'NN-II' exclusion key '00-03'). Rows removed by includeSections/excludeRequests or by transactionContext skip-if directives are not in this workbook. Call list_irl_requests to see the canonical questions and their keys.`,
      { unknownRefs }
    );
  }

  // D-segment dedup: drop exact-duplicate segments (first-seen order) so a
  // re-sent union can never double-write a source. Comments get NO dedup —
  // the idempotency unit for E is the whole value.
  const prefill = new Map<string, IRLRowPrefill>(
    input.fills.map((f) => [
      f.ref,
      {
        fileLocation: [...new Set(f.fileLocation.split(D_SEGMENT_SEPARATOR))].join(
          D_SEGMENT_SEPARATOR
        ),
        comments: f.comments,
      },
    ])
  );

  const generatedAt = new Date();
  const buffer = generateIrlXlsxBuffer(
    built,
    {
      targetName: input.targetName,
      transactionContext: input.transactionContext as IRLTransactionContext | undefined,
      companyName: input.companyName,
      projectName: input.projectName,
      showCanonicalReference: input.showCanonicalReference ?? false,
      generatedAt,
      canonicalUrl: IRL_CANONICAL_URL,
    },
    prefill
  );

  const filename = buildIrlFilename(input.targetName, generatedAt);
  const base64 = uint8ToBase64(buffer);
  const totalBullets = built.sections.reduce((sum, s) => sum + s.bullets.length, 0);
  const filledRefs = [...prefill.keys()].sort();
  const filledRowCount = filledRefs.length;
  const blankRowCount = totalBullets - filledRowCount;

  const forWhom = input.targetName ? ` for ${input.targetName}` : '';
  const summary = `Populated IRL workbook${forWhom}: ${filledRowCount} of ${totalBullets} rows answered from evidence, ${blankRowCount} left blank — the blank rows are the remaining ask to put to the target. Filename: ${filename}. Review the workbook, then run gst_irl_ingestion yourself exactly as for a target-returned IRL — this tool never invokes the sweep. The base64 payload is the artifact (no Hub download surface exists for populated workbooks; Claude Desktop cannot render arbitrary-mimeType attachments, so write the file client-side).`;

  const payload = {
    filename,
    base64,
    mimeType: IRL_XLSX_MIME_TYPE,
    byteLength: buffer.byteLength,
    sectionCount: built.sections.length,
    bulletCount: totalBullets,
    filledRowCount,
    blankRowCount,
    filledRefs,
    canonicalUrl: IRL_CANONICAL_URL,
  };

  // Same two-channel shape as the frozen sibling, for the same reason: the
  // base64 blob belongs in structuredContent for programmatic consumers and
  // is omitted from the serialized text mirror (tokens, not bytes — see
  // ToolOkOptions.textOmit). This is deliberately the SECOND textOmit call
  // site; the budget test asserts the channels' relationship explicitly.
  return toolOk(payload, summary, { textOmit: ['base64'] });
}

export function registerFillIrlXlsxTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'fill_information_request_list_xlsx',
    {
      title: 'Fill Information Request List from evidence (.xlsx)',
      description: TOOL_DESCRIPTION,
      inputSchema: FillIrlXlsxInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: false, // each call uses `new Date()` → new filename
      },
    },
    withToolMetrics('fill_information_request_list_xlsx', metrics, handleFillIrlXlsxTool)
  );
}
