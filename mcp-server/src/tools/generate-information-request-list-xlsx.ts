/**
 * MCP tool: `generate_information_request_list_xlsx`
 *
 * Produces a fillable `.xlsx` workbook of the canonical GST Information
 * Request List, ready for Claude Desktop to attach to a message.
 *
 * Pipeline:
 *
 *   1. Load `gst://library/information-request-list` via the shared
 *      library loader (BL-043's single source of truth).
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
 *   - Pure, deterministic, no I/O at handler time (the article body is
 *     bundled into the Worker binary by the prebuild codegen).
 *   - Workers-runtime safe: `xlsx-js-style` is pure JS, `btoa` is
 *     universally available, no `Buffer` or `nodejs_compat` needed.
 *   - The library URI lookup uses `loadLibraryByUri` — same code path
 *     as the MCP Resource handler — so the tool never drifts from the
 *     prompt's embedded Resource.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import { loadLibraryByUri } from '../content/library-loader';
import { parseIrlArticle } from '../../../src/utils/irl/parse-article';
import {
  generateIrlXlsxBuffer,
  buildIrlFilename,
  IRL_XLSX_MIME_TYPE,
  type IRLTransactionContext,
} from '../../../src/utils/irl/generate-xlsx';
import { customizeIrlArticle } from '../../../src/utils/irl/customize-article';
import { HUB_BASE } from '../config';

const IRL_RESOURCE_URI = 'gst://library/information-request-list';
const IRL_CANONICAL_URL = `${HUB_BASE}/hub/library/information-request-list/`;

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
      'Engagement context label. One of: sell-side · buy-side · value-creation · unknown. Cosmetic only at this layer — the artifact body is universal; the label appears in the header to remind the recipient how to frame their answers.'
    ),
  productSummary: z
    .string()
    .min(10)
    .max(500)
    .optional()
    .describe(
      'One-paragraph product description if known. Currently informational — accepted for shape parity with `gst_information_request_list` prompt args and to seed the future BL-044.5 subtractive-filter directives. Has no effect on the generated XLSX in v1.'
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
      "Two-digit section numbers to INCLUDE (e.g. ['00','03','09']). Omit for all sections. Numbers mirror the canonical article's section headers (00 Basics … 09 Governance); unknown numbers are ignored. Reference IDs of the kept sections are unchanged."
    ),
  customRequests: z
    .array(
      z.object({
        section: z
          .string()
          .regex(/^\d{2}$/)
          .describe('Two-digit section number to append this request to.'),
        text: z.string().min(1).max(500).describe('The custom request text.'),
      })
    )
    .max(50)
    .optional()
    .describe(
      'Ad-hoc engagement-specific requests appended to individual sections. Each becomes a new row under its section with the next Reference ID. Requests for a section not included/present are dropped.'
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

Returns \`{ filename, base64, mimeType }\` — Claude Desktop and other MCP clients can write the file or attach it to a message. The workbook mirrors the canonical IRL article (by default all sections, one per VDR folder) with each request in column A and an empty answer cell in column B for the recipient to fill in.

**When to call this tool**: any time a partner needs to send the IRL to a target/client/portco for intake. Pair with the \`gst_information_request_list\` prompt — the prompt emits the in-chat preview + recipient framing; this tool emits the attachable file. (Prompt v0.0.2+ orchestrates this tool automatically when invoked with args.)

**Optional inputs** all degrade gracefully:
  - \`targetName\` → the company being diligenced; personalizes the "Target" header row + filename slug.
  - \`companyName\` / \`projectName\` → composed into the title cell as \`{companyName} {projectName} Information Request List\` (title only; distinct from \`targetName\`).
  - \`transactionContext\` → labels the engagement (sell-side / buy-side / value-creation) in the header.
  - \`includeSections\` → two-digit section numbers to keep (e.g. \`["00","03","09"]\`); omit for all.
  - \`customRequests\` → ad-hoc \`{ section, text }\` rows appended to individual sections.
  - \`showCanonicalReference\` → show the canonical-URL header row (default hidden).
  - \`productSummary\` → informational only; reserved for the future subtractive-filter directives (BL-044.5).

The request content is read from the same canonical source as the MCP Resource \`${IRL_RESOURCE_URI}\`. With no configuration args the workbook is byte-identical to what a partner would print from \`/hub/library/information-request-list/\`; configuration args (section filter, custom requests, title/canonical options) scope that universal artifact per engagement. Single source of truth.`;

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
  const entry = loadLibraryByUri(IRL_RESOURCE_URI);
  if (!entry) {
    throw new Error(
      `Library entry missing for ${IRL_RESOURCE_URI}. Re-run \`npm -w @gst/mcp-server run prebuild\`.`
    );
  }

  const article = parseIrlArticle(entry.body);

  // Apply per-engagement customization (section filter + custom requests)
  // through the single shared entry point — same code path the Hub page
  // uses, so both surfaces produce identical output for identical inputs.
  const built = customizeIrlArticle(article, {
    includeSections: input.includeSections,
    customRequests: input.customRequests,
  });

  // Guard: an includeSections set that matches no real section would yield a
  // zero-section (empty) workbook. Fail loudly with the valid numbers instead.
  if (input.includeSections && built.sections.length === 0) {
    const valid = article.sections.map((s) => s.number).join(', ');
    throw new Error(
      `No sections matched includeSections=[${input.includeSections.join(', ')}]. Valid section numbers: ${valid}.`
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
