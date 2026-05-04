import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[gst-mcp] connected on stdio');
}

main().catch((err) => {
  console.error('[gst-mcp] fatal:', err);
  process.exit(1);
});
