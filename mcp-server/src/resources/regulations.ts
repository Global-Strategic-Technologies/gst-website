/**
 * MCP Resources: gst://regulations/<jurisdiction>/<framework-id>
 *
 * One Resource per regulatory framework (120 total). Bodies are emitted as
 * pretty-printed JSON; agents that want a structured object should JSON.parse
 * the text content. The full Regulation schema (id, name, regions,
 * effectiveDate, summary, category, keyRequirements, penalties) is preserved.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { REGULATION_ENTRIES, loadRegulationByUri } from '../content/regulation-loader';

export function registerRegulationResources(server: McpServer): void {
  for (const entry of REGULATION_ENTRIES) {
    server.registerResource(
      entry.data.name,
      entry.uri,
      {
        title: entry.data.name,
        description: entry.data.summary,
        mimeType: 'application/json',
      },
      async (uri: URL) => {
        const found = loadRegulationByUri(uri.href);
        if (!found) {
          throw new Error(`Unknown regulation URI: ${uri.href}`);
        }
        return {
          contents: [
            {
              uri: found.uri,
              mimeType: 'application/json',
              text: JSON.stringify(found.data, null, 2),
            },
          ],
        };
      }
    );
  }
}
