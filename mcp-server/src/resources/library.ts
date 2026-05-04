/**
 * MCP Resources: gst://library/<slug>
 *
 * Exposes the GST Library articles as readable Resources. The body is
 * inlined into the binary at build time (see content/library-loader.ts).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LIBRARY_ENTRIES, loadLibraryByUri } from '../content/library-loader';

export function registerLibraryResources(server: McpServer): void {
  for (const entry of LIBRARY_ENTRIES) {
    server.registerResource(
      entry.name,
      entry.uri,
      {
        title: entry.name,
        description: entry.description,
        mimeType: entry.mimeType,
      },
      async (uri: URL) => {
        const found = loadLibraryByUri(uri.href);
        if (!found) {
          throw new Error(`Unknown library URI: ${uri.href}`);
        }
        return {
          contents: [
            {
              uri: found.uri,
              mimeType: found.mimeType,
              text: found.body,
            },
          ],
        };
      }
    );
  }
}
