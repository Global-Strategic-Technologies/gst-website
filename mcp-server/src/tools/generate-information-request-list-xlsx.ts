/**
 * MCP tool: `generate_information_request_list_xlsx`
 *
 * Produces a fillable `.xlsx` workbook of the canonical GST Information
 * Request List, ready for Claude Desktop to attach to a message.
 *
 * Pipeline:
 *
 *   1. Load the IRL generator source (`src/data/irl/information-request-list.md`,
 *      bundled into the Worker by the prebuild codegen). This is DECOUPLED from
 *      the `gst://library/information-request-list` Resource — the library
 *      article is free-form prose and may differ from this list.
 *   2. Parse the markdown into the {@link IRLArticle} AST.
 *   3. Render the AST + optional engagement metadata to a workbook
 *      buffer via {@link generateIrlXlsxBuffer}.
 *   4. Base64-encode and return `{ filename, base64, mimeType }` so
 *      the MCP client can write the file or surface it as an artifact.
 *
 * The tool is **additive** (BL-044): it adds a new output to the
 * existing IRL surface (Library article + Hub page + Resource +
 * prompt), without altering any existing URIs. The companion prompt
 * `gst_information_request_list` evolves to v0.0.2 in lockstep so
 * model-led invocations can call this tool in the same turn.
 *
 * Implementation notes:
 *
 *   - Pure, deterministic, no I/O at handler time (the source body is
 *     bundled into the Worker binary by the prebuild codegen).
 *   - Workers-runtime safe: `xlsx-js-style` is pure JS, `btoa` is
 *     universally available, no `Buffer` or `nodejs_compat` needed.
 *   - The source load uses `loadIrlSourceBody()` — the SAME source the
 *     `gst_information_request_list` prompt embeds and the section catalog
 *     reads — so these generator surfaces never drift from each other. They
 *     are collectively decoupled from the library Resource.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import { loadIrlSourceBody } from '../content/irl-source-loader';
import { parseIrlArticle } from '../../../src/utils/irl/parse-article';
import {
  generateIrlXlsxBuffer,
  buildIrlFilename,
  IRL_XLSX_MIME_TYPE,
  type IRLTransactionContext,
} from '../../../src/utils/irl/generate-xlsx';
import { customizeIrlArticle } from '../../../src/utils/irl/customize-article';
import { irlSectionCatalog } from '../content/irl-section-catalog';
import { HUB_BASE } from '../config';

// The library page remains the human "canonical reference" printed into the
// workbook's optional header row (see showCanonicalReference). The generated
// list content, however, comes from the decoupled IRL generator source — not
// this page — so the two may differ.
const IRL_CANONICAL_URL = `${HUB_BASE}/hub/library/information-request-list/`;

// Section catalog ("00 Basics · 01 Product · …") built once at module load from
// the canonical article, so the section-number args below are self-documenting
// — a model calling this tool cold (without having read the Resource) sees the
// full list of valid section numbers and their titles right in the schema.
const SECTION_CATALOG = irlSectionCatalog();

const transactionContextValues = ['sell-side', 'buy-side', 'value-creation', 'unknown'] as const;

export const GenerateIrlXlsxInputSchema = z.object({
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
  productSummary: z
    .string()
    .min(10)
    .max(500)
    .optional()
    .describe(
      'One-paragraph product description if known. Informational only — accepted for shape parity with `gst_information_request_list` prompt args. Has no effect on the generated XLSX. (Content-conditioned filtering is driven by `transactionContext` via authored skip-if directives, not by this field.)'
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
});

export type GenerateIrlXlsxInput = z.infer<typeof GenerateIrlXlsxInputSchema>;

const TOOL_DESCRIPTION = `Generate the GST **Information Request List** as a downloadable, fillable \`.xlsx\` workbook.

Returns \`{ filename, base64, mimeType }\` — Claude Desktop and other MCP clients can write the file or attach it to a message. The workbook mirrors the canonical GST IRL (by default all sections, one per VDR folder) with each request in column A and an empty answer cell in column B for the recipient to fill in.

**When to call this tool**: any time a partner needs to send the IRL to a target/client/portco for intake. Pair with the \`gst_information_request_list\` prompt — the prompt emits the in-chat preview + recipient framing; this tool emits the attachable file. (Prompt v0.0.2+ orchestrates this tool automatically when invoked with args.)

**Optional inputs** all degrade gracefully:
  - \`targetName\` → the company being diligenced; personalizes the "Target" header row + filename slug.
  - \`companyName\` / \`projectName\` → composed into the title cell as \`{companyName} {projectName} Information Request List\` (title only; distinct from \`targetName\`).
  - \`transactionContext\` → labels the engagement in the header AND fires the source's authored skip-if directives (BL-044.5): questions tagged for the supplied context are auto-removed with Reference-ID gaps.
  - \`includeSections\` → two-digit section numbers to keep (e.g. \`["00","03","09"]\`); omit for all.
  - \`excludeRequests\` → \`'NN-II'\` keys of individual questions to remove (e.g. \`["02-03"]\`); surviving Reference IDs keep intentional gaps. Discover keys via \`list_irl_requests\`.
  - \`customRequests\` → ad-hoc \`{ section, text }\` rows appended to individual sections.
  - \`showCanonicalReference\` → show the canonical-URL header row (default hidden).
  - \`productSummary\` → informational only.

**Sections** (valid \`includeSections\` / \`customRequests[].section\` values): ${SECTION_CATALOG}.

The request content is the canonical GST Information Request List — the same list the Hub generator at \`/hub/tools/information-request-list-generator/\` produces, so this tool and that page yield identical workbooks for identical inputs. It is maintained independently of the \`/hub/library/information-request-list/\` reference article (which may differ). With no configuration args the workbook is the universal template; configuration args (section filter, custom requests, title/canonical options) scope it per engagement.`;

function uint8ToBase64(buf: Uint8Array): string {
  // Chunked conversion: avoids the "too many arguments to apply" failure
  // on very large buffers in some runtimes. The IRL workbook is small
  // (~3-6 KB) so a single pass would also work; the chunked form is
  // defensive against future bullet-count growth.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < buf.byteLength; i += CHUNK) {
    const slice = buf.subarray(i, Math.min(i + CHUNK, buf.byteLength));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export async function handleGenerateIrlXlsxTool(input: GenerateIrlXlsxInput) {
  const article = parseIrlArticle(loadIrlSourceBody());

  // Apply per-engagement customization (directives + section filter +
  // question exclusion + custom requests) through the single shared entry
  // point — same code path the Hub page uses, so both surfaces produce
  // identical output for identical inputs.
  const built = customizeIrlArticle(article, {
    context: input.transactionContext,
    includeSections: input.includeSections,
    excludeRequests: input.excludeRequests,
    customRequests: input.customRequests,
  });

  // Guard: a configuration that removes everything would yield a zero-section
  // (empty) workbook. Fail loudly with an actionable message. Branched so the
  // exclusion-only path never touches includeSections (which may be
  // undefined).
  if (built.sections.length === 0 && (input.includeSections || input.excludeRequests)) {
    if (input.includeSections) {
      const valid = article.sections.map((s) => s.number).join(', ');
      throw new Error(
        `No sections matched includeSections=[${input.includeSections.join(', ')}]. Valid section numbers: ${valid}.`
      );
    }
    throw new Error(
      `Every request was excluded — the configuration (excludeRequests${input.transactionContext ? ' + directive-fired transactionContext' : ''}) removed all questions. Remove some excludeRequests keys (see list_irl_requests) so at least one question remains.`
    );
  }

  const generatedAt = new Date();
  const buffer = generateIrlXlsxBuffer(built, {
    targetName: input.targetName,
    transactionContext: input.transactionContext as IRLTransactionContext | undefined,
    companyName: input.companyName,
    projectName: input.projectName,
    showCanonicalReference: input.showCanonicalReference ?? false,
    generatedAt,
    canonicalUrl: IRL_CANONICAL_URL,
  });

  const filename = buildIrlFilename(input.targetName, generatedAt);
  const base64 = uint8ToBase64(buffer);
  const totalBullets = built.sections.reduce((sum, s) => sum + s.bullets.length, 0);

  // Build a deeplink to the Hub generator page with the args encoded as
  // query params. The Hub page's submit handler hydrates the form from
  // these params, so a one-click landing reproduces exactly the same file
  // the MCP path would have produced — no re-entry. Without this
  // arg-passing the link was no better than a bookmark; with it the MCP
  // path delivers real value over visiting the Hub page directly.
  const hubUrl = new URL(
    IRL_CANONICAL_URL.replace(
      '/library/information-request-list/',
      '/tools/information-request-list-generator/'
    )
  );
  if (input.targetName) hubUrl.searchParams.set('target', input.targetName);
  if (input.transactionContext) hubUrl.searchParams.set('context', input.transactionContext);
  // Configuration args ride along so the Hub landing reproduces the exact same
  // file. `URLSearchParams` percent-encodes values (comma → %2C, the JSON
  // custom-requests blob → escaped); the Hub page decodes them symmetrically.
  if (input.companyName) hubUrl.searchParams.set('company', input.companyName);
  if (input.projectName) hubUrl.searchParams.set('project', input.projectName);
  if (input.includeSections) hubUrl.searchParams.set('sections', input.includeSections.join(','));
  if (input.excludeRequests) hubUrl.searchParams.set('exclude', input.excludeRequests.join(','));
  if (input.showCanonicalReference) hubUrl.searchParams.set('canonical', '1');
  if (input.customRequests && input.customRequests.length > 0) {
    hubUrl.searchParams.set('custom', JSON.stringify(input.customRequests));
  }
  const downloadHref = hubUrl.toString();

  const sectionCount = built.sections.length;
  const summary = input.targetName
    ? `Generated IRL workbook for ${input.targetName} (${sectionCount} sections, ${totalBullets} requests). Filename: ${filename}. Download the same file (same inputs already filled in) at ${downloadHref} — Claude Desktop cannot render arbitrary-mimeType MCP resource attachments today, so the Hub page is the canonical download surface.`
    : `Generated IRL workbook (${sectionCount} sections, ${totalBullets} requests). Filename: ${filename}. Download the same file from ${downloadHref} — Claude Desktop cannot render arbitrary-mimeType MCP resource attachments today, so the Hub page is the canonical download surface.`;

  const payload = {
    filename,
    base64,
    mimeType: IRL_XLSX_MIME_TYPE,
    byteLength: buffer.byteLength,
    sectionCount,
    bulletCount: totalBullets,
    canonicalUrl: IRL_CANONICAL_URL,
  };

  // Claude Desktop's MCP tool-result renderer routes `resource` content
  // blocks BY mimeType prefix — `image/*` → image renderer, anything else
  // → "unsupported format" error. Returning the .xlsx as a `resource`
  // with blob + `application/vnd.openxmlformats-...` therefore surfaces
  // in Claude Desktop as a red error block, not a downloadable file.
  // Confirmed via staging round-trip 2026-05-25.
  //
  // Until Claude Desktop's renderer supports arbitrary-mimeType resource
  // blobs (BL-046 candidate — or until we ship the resource_link +
  // ephemeral Worker-hosted file path), the canonical download surface
  // for the IRL workbook is the Hub page at
  //   https://globalstrategic.tech/hub/tools/information-request-list-generator/
  // The tool below returns text summary + structuredContent only:
  //   - Text content: human + model-readable summary mentioning the
  //     filename, section/bullet counts, and Hub-page URL for download.
  //   - structuredContent: full payload including base64 blob, retained
  //     for programmatic API callers (non-Claude-Desktop clients) and
  //     for the model's reasoning about what was generated.
  return {
    content: [
      {
        type: 'text' as const,
        text: summary,
      },
    ],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
}

export function registerGenerateIrlXlsxTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'generate_information_request_list_xlsx',
    {
      title: 'Generate Information Request List (.xlsx)',
      description: TOOL_DESCRIPTION,
      inputSchema: GenerateIrlXlsxInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: false, // each call uses `new Date()` → new filename
      },
    },
    withToolMetrics('generate_information_request_list_xlsx', metrics, handleGenerateIrlXlsxTool)
  );
}
