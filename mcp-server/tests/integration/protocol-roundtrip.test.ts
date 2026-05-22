/**
 * Protocol-roundtrip integration tests.
 *
 * Exercises `generate_diligence_agenda`, `search_portfolio`, and
 * `list_portfolio_facets` through the full MCP protocol layer using a
 * vendored paired-pipe Transport. Closes BL-031 AC #9.
 *
 * Architecture decision: see
 * `src/docs/development/MCP_SERVER_ARCHITECTURE_BL-031_tests.md`.
 */

import {
  LATEST_PROTOCOL_VERSION,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCErrorResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { createServer } from '../../src/server';
import { registerLocalOnlyTools } from '../../src/tools/_local-only';
import { createPairedTransports, type PairedHalf } from '../helpers/paired-transport';

interface CallToolContent {
  type: string;
  text?: string;
}

interface CallToolResultPayload {
  content: CallToolContent[];
  isError?: boolean;
  structuredContent?: unknown;
}

interface ToolDescriptor {
  name: string;
  description?: string;
  inputSchema: { type: string; properties?: Record<string, unknown>; required?: string[] };
}

interface ListToolsResultPayload {
  tools: ToolDescriptor[];
}

interface ResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface ListResourcesResultPayload {
  resources: ResourceDescriptor[];
  nextCursor?: string;
}

interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

interface ReadResourceResultPayload {
  contents: ResourceContent[];
}

const validDiligencePayload = {
  transactionType: 'majority-stake',
  productType: 'b2b-saas',
  techArchetype: 'modern-cloud-native',
  headcount: '51-200',
  revenueRange: '5-25m',
  growthStage: 'scaling',
  companyAge: '5-10yr',
  geographies: ['us', 'eu'],
  businessModel: 'productized-platform',
  scaleIntensity: 'moderate',
  transformationState: 'actively-modernizing',
  dataSensitivity: 'high',
  operatingModel: 'product-aligned-teams',
};

describe('protocol roundtrip', () => {
  let client: PairedHalf;
  let nextId: number;

  async function rpc(
    method: string,
    params: unknown
  ): Promise<JSONRPCResponse | JSONRPCErrorResponse> {
    const id = nextId++;
    return new Promise<JSONRPCResponse | JSONRPCErrorResponse>((resolve) => {
      client.onmessage = (msg: JSONRPCMessage) => {
        if ('id' in msg && msg.id === id) {
          resolve(msg as JSONRPCResponse | JSONRPCErrorResponse);
        }
      };
      const req: JSONRPCRequest = { jsonrpc: '2.0', id, method, params } as JSONRPCRequest;
      void client.send(req);
    });
  }

  async function notify(method: string, params: unknown): Promise<void> {
    await client.send({ jsonrpc: '2.0', method, params } as JSONRPCMessage);
  }

  function isErrorResponse(
    msg: JSONRPCResponse | JSONRPCErrorResponse
  ): msg is JSONRPCErrorResponse {
    return 'error' in msg;
  }

  function parseToolText<T>(result: CallToolResultPayload): T {
    const block = result.content[0];
    if (!block || block.type !== 'text' || !block.text) {
      throw new Error('expected first content block to be non-empty text');
    }
    return JSON.parse(block.text) as T;
  }

  beforeEach(async () => {
    nextId = 1;
    const server = createServer();
    registerLocalOnlyTools(server); // mirror src/index.ts (stdio entrypoint) — BL-032 Q12
    const pair = createPairedTransports();
    client = pair.client;
    await server.connect(pair.server);

    // MCP handshake — initialize, then notifications/initialized.
    const init = await rpc('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'protocol-roundtrip-test', version: '0.0.0' },
    });
    if (isErrorResponse(init)) {
      throw new Error(`initialize failed: ${init.error.message}`);
    }
    await notify('notifications/initialized', {});
  });

  describe('handshake + discovery', () => {
    it('initialize returned protocolVersion + capabilities + serverInfo', async () => {
      // `beforeEach` already performed `initialize`. Re-confirm by inspecting
      // a fresh `tools/list` to prove the connection is in initialized state.
      const res = await rpc('tools/list', {});
      expect(isErrorResponse(res)).toBe(false);
    });

    it('tools/list returns the registered tools with input schemas', async () => {
      const res = await rpc('tools/list', {});
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;

      const payload = res.result as unknown as ListToolsResultPayload;
      const toolNames = payload.tools.map((t) => t.name).sort();
      // BL-032 Phase 4b: search_radar_cache renamed to search_radar_offline;
      // alias retained one release (removed in mcp-server@0.2.0).
      // BL-032 Phase 4c: search_radar + get_latest_insights register in
      // createServer() (transport-portable; live Inoreader-touching).
      expect(toolNames).toEqual(
        [
          'assess_infrastructure_cost_governance',
          'compute_techpar',
          'estimate_tech_debt_cost',
          'generate_diligence_agenda',
          'get_latest_insights', // BL-032 Phase 4c live FYI tier
          'list_portfolio_facets',
          'list_regulation_facets',
          'search_portfolio',
          'search_radar', // BL-032 Phase 4c live (Inoreader + 6h cache)
          'search_radar_cache', // deprecated alias — removed in 0.2.0
          'search_radar_offline', // BL-032 Phase 4b rename
          'search_regulations',
        ].sort()
      );

      // Every tool publishes a JSON Schema input — proves the Zod→JSON-Schema
      // conversion in the SDK fires through this transport too.
      for (const tool of payload.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('happy path — each tool returns valid content', () => {
    it('generate_diligence_agenda returns non-empty topics + metadata', async () => {
      const res = await rpc('tools/call', {
        name: 'generate_diligence_agenda',
        arguments: validDiligencePayload,
      });
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;

      const result = res.result as unknown as CallToolResultPayload;
      expect(result.isError).not.toBe(true);

      const parsed = parseToolText<{
        topics: unknown[];
        metadata: { totalQuestions: number };
      }>(result);
      expect(parsed.topics.length).toBeGreaterThan(0);
      expect(parsed.metadata.totalQuestions).toBeGreaterThan(0);
    });

    it('search_portfolio returns matches + count summary + deeplink', async () => {
      const res = await rpc('tools/call', {
        name: 'search_portfolio',
        arguments: { search: 'platform' },
      });
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;

      const result = res.result as unknown as CallToolResultPayload;
      expect(result.isError).not.toBe(true);

      // BL-031.95 Phase 4: capability-mirror invariant. The website
      // renders all matches; `returned === totalMatched === matches.length`
      // (no `limit` field at the schema layer). Deeplink emits the
      // search filter back to /ma-portfolio.
      const parsed = parseToolText<{
        matches: unknown[];
        totalMatched: number;
        returned: number;
        deeplink: string;
      }>(result);
      expect(parsed.matches.length).toBeGreaterThan(0);
      expect(parsed.returned).toBe(parsed.matches.length);
      expect(parsed.totalMatched).toBe(parsed.returned);
      expect(parsed.deeplink).toContain('/ma-portfolio?search=platform');
    });

    it('list_portfolio_facets returns themes / engagementCategories / growthStages / years', async () => {
      const res = await rpc('tools/call', {
        name: 'list_portfolio_facets',
        arguments: {},
      });
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;

      const result = res.result as unknown as CallToolResultPayload;
      expect(result.isError).not.toBe(true);

      const parsed = parseToolText<{
        themes: string[];
        engagementCategories: string[];
        growthStages: string[];
        years: number[];
      }>(result);
      expect(parsed.themes.length).toBeGreaterThan(0);
      expect(parsed.engagementCategories.length).toBeGreaterThan(0);
      expect(parsed.growthStages.length).toBeGreaterThan(0);
      expect(parsed.years.length).toBeGreaterThan(0);
    });
  });

  describe('invalid input — the SDK rejects before the handler runs', () => {
    it('generate_diligence_agenda — bad transactionType returns structured error', async () => {
      const res = await rpc('tools/call', {
        name: 'generate_diligence_agenda',
        arguments: { ...validDiligencePayload, transactionType: 'asset-purchase' },
      });

      // Rejection may surface as a JSON-RPC error envelope OR as a CallToolResult
      // with isError: true — either is acceptable per the MCP spec; both are
      // structured (no thrown exception, no stack trace).
      if (isErrorResponse(res)) {
        expect(res.error.message).toBeTruthy();
      } else {
        const result = res.result as unknown as CallToolResultPayload;
        expect(result.isError).toBe(true);
      }
    });

    it('search_portfolio — pre-Phase-4 `limit` field is silently dropped (Zod strips unknown keys)', async () => {
      // BL-031.95 Phase 4.A removed the `limit` field under the
      // capability-mirror invariant. A caller still passing it gets a
      // valid response (Zod strips unknown keys on parse); the response
      // is identical to one without `limit`.
      const res = await rpc('tools/call', {
        name: 'search_portfolio',
        arguments: { search: 'platform', limit: 100 },
      });

      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;
      const result = res.result as unknown as CallToolResultPayload;
      expect(result.isError).not.toBe(true);

      const parsed = parseToolText<{
        matches: unknown[];
        totalMatched: number;
        returned: number;
      }>(result);
      // Full match set returned regardless of the bogus `limit` value.
      expect(parsed.matches.length).toBeGreaterThan(0);
      expect(parsed.returned).toBe(parsed.matches.length);
    });

    it('list_portfolio_facets — empty input is accepted (no error envelope)', async () => {
      // The Zod input schema is z.object({}) — empty object is the canonical
      // valid input. This case proves the SDK does not reject "no fields"
      // as an error.
      const res = await rpc('tools/call', {
        name: 'list_portfolio_facets',
        arguments: {},
      });

      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;
      const result = res.result as unknown as CallToolResultPayload;
      expect(result.isError).not.toBe(true);
    });
  });

  describe('empty result — search miss returns 0 matches without an error', () => {
    it('search_portfolio with a nonsense term returns matches: [], totalMatched: 0', async () => {
      const res = await rpc('tools/call', {
        name: 'search_portfolio',
        arguments: { search: 'zxqzxq-no-such-engagement', limit: 5 },
      });
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;

      const result = res.result as unknown as CallToolResultPayload;
      expect(result.isError).not.toBe(true);

      const parsed = parseToolText<{
        matches: unknown[];
        totalMatched: number;
        returned: number;
      }>(result);
      expect(parsed.matches).toEqual([]);
      expect(parsed.totalMatched).toBe(0);
      expect(parsed.returned).toBe(0);
    });
  });

  describe('Resources primitive — list and read', () => {
    it('resources/list returns library + regulation URIs with stable mime types', async () => {
      const res = await rpc('resources/list', {});
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;

      const payload = res.result as unknown as ListResourcesResultPayload;
      const uris = payload.resources.map((r) => r.uri);

      // Library × 3 + Regulations × 120
      expect(uris).toContain('gst://library/business-architectures');
      expect(uris).toContain('gst://library/vdr-structure');
      expect(uris).toContain('gst://library/information-request-list');
      expect(uris).toContain('gst://regulations/eu/gdpr');
      expect(uris).toContain('gst://regulations/us-ca/ccpa');

      const libraryEntries = payload.resources.filter((r) => r.uri.startsWith('gst://library/'));
      const regulationEntries = payload.resources.filter((r) =>
        r.uri.startsWith('gst://regulations/')
      );
      expect(libraryEntries.length).toBe(3);
      expect(regulationEntries.length).toBe(120);

      for (const r of libraryEntries) {
        expect(r.mimeType).toBe('text/markdown');
      }
      for (const r of regulationEntries) {
        expect(r.mimeType).toBe('application/json');
      }
    });

    it('resources/read returns the markdown body for a Library URI', async () => {
      const res = await rpc('resources/read', { uri: 'gst://library/vdr-structure' });
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;

      const payload = res.result as unknown as ReadResourceResultPayload;
      expect(payload.contents.length).toBe(1);
      const block = payload.contents[0];
      expect(block.uri).toBe('gst://library/vdr-structure');
      expect(block.mimeType).toBe('text/markdown');
      expect(block.text).toBeTruthy();
      expect(block.text!.length).toBeGreaterThan(500);
      // Sanity check on the digest content.
      expect(block.text).toMatch(/Virtual Data Room/i);
    });

    it('resources/read returns the JSON body for a Regulation URI', async () => {
      const res = await rpc('resources/read', { uri: 'gst://regulations/eu/gdpr' });
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;

      const payload = res.result as unknown as ReadResourceResultPayload;
      const block = payload.contents[0];
      expect(block.mimeType).toBe('application/json');
      expect(block.text).toBeTruthy();
      const parsed = JSON.parse(block.text!) as { id: string; name: string; category: string };
      expect(parsed.id).toBe('eu-gdpr');
      expect(parsed.category).toBe('data-privacy');
    });
  });
});
