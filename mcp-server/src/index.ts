import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';
import { registerLocalOnlyTools } from './tools/_local-only';

async function main(): Promise<void> {
  const server = createServer();
  registerLocalOnlyTools(server); // stdio-only: offline radar tool + radar Resources (BL-032 Q12)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[gst-mcp] connected on stdio');
}

main().catch((err) => {
  console.error('[gst-mcp] fatal:', err);
  process.exit(1);
});
