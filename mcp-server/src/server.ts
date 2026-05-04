import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDiligenceTool } from './tools/diligence';
import { registerPortfolioTools } from './tools/portfolio';
import { registerIcgTool } from './tools/icg';
import { registerTechparTool } from './tools/techpar';
import { registerTechDebtTool } from './tools/tech-debt';
import { registerRegulationsTool } from './tools/regulations';
import { registerRadarCacheTool } from './tools/radar-cache';
import { registerLibraryResources } from './resources/library';
import { registerRegulationResources } from './resources/regulations';
import { registerRadarResources } from './resources/radar';
import { registerPrompts } from './prompts/_registry';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'gst-mcp',
    version: '0.0.1',
  });

  // Tools
  registerDiligenceTool(server);
  registerPortfolioTools(server);
  registerIcgTool(server);
  registerTechparTool(server);
  registerTechDebtTool(server);
  registerRegulationsTool(server);
  registerRadarCacheTool(server);

  // Resources
  registerLibraryResources(server);
  registerRegulationResources(server);
  registerRadarResources(server);

  // Prompts
  registerPrompts(server);

  return server;
}
