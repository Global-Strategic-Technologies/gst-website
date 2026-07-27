/**
 * MCP tool: `list_irl_requests`
 *
 * Key-discovery companion to `generate_information_request_list_xlsx`:
 * enumerates every canonical IRL question with its stable `NN-II` removal
 * key (two-digit section number + two-digit 1-based canonical ordinal), so a
 * model can map natural language ("drop the competitive-landscape question")
 * to the exact `excludeRequests` key without fetching and hand-counting the
 * source — the bullet-level analog of the section catalog embedded in the
 * generate-tool's schema (67 bullet entries are too large for a describe).
 *
 * Entries also carry each question's `skipIf` directive map (BL-044.5) when
 * tagged, so a model can predict which questions a given `transactionContext`
 * auto-removes before generating.
 *
 * Pure + read-only: parses the bundled generator source
 * (`src/data/irl/information-request-list.md` via `loadIrlSourceBody()`) —
 * the SAME source the generate tool renders, so keys can never drift from
 * the workbook they address.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import { loadIrlSourceBody } from '../content/irl-source-loader';
import { parseIrlArticle } from '../../../src/utils/irl/parse-article';
import { toolOk } from './_result';

const TOOL_DESCRIPTION = `List every canonical GST **Information Request List** question with its stable \`NN-II\` key.

Returns \`{ requests, sectionCount, bulletCount }\` where each request is \`{ key, section, sectionTitle, text, skipIf? }\`:
  - \`key\` — the two-digit-section + two-digit-ordinal identifier (e.g. \`"02-03"\` = question 3 of section 02, rendered in the workbook Reference column as \`2-03\`). Pass these keys to \`generate_information_request_list_xlsx\`'s \`excludeRequests\` to remove specific questions.
  - \`skipIf\` — present when the question carries an authored skip-if directive (BL-044.5): the engagement contexts that auto-remove it (e.g. \`{ "context": ["sell-side","buy-side","value-creation"] }\`).

**When to call this tool**: before excluding specific questions — to map a natural-language request ("drop the competitive-landscape question") to its exact key — or to predict which questions a given \`transactionContext\` will auto-skip.`;

export async function handleListIrlRequestsTool() {
  const article = parseIrlArticle(loadIrlSourceBody());

  const requests = article.sections.flatMap((section) =>
    section.bullets.map((bullet, i) => ({
      key: `${section.number}-${String(bullet.ordinal ?? i + 1).padStart(2, '0')}`,
      section: section.number,
      sectionTitle: section.title,
      text: bullet.text,
      ...(bullet.skipIf ? { skipIf: bullet.skipIf } : {}),
    }))
  );

  const payload = {
    requests,
    sectionCount: article.sections.length,
    bulletCount: requests.length,
  };

  const summary = `Listed ${requests.length} canonical IRL requests across ${article.sections.length} sections. Each carries its NN-II key for generate_information_request_list_xlsx's excludeRequests; entries with skipIf are auto-removed when the matching transactionContext is supplied.`;

  return toolOk(payload, summary);
}

export function registerListIrlRequestsTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'list_irl_requests',
    {
      title: 'List Information Request List questions (keys + directives)',
      description: TOOL_DESCRIPTION,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    withToolMetrics('list_irl_requests', metrics, handleListIrlRequestsTool)
  );
}
