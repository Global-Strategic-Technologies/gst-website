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

const validDiligenceDimensions = {
  transactionType: 'majority-stake' as const,
  productType: 'b2b-saas' as const,
  techArchetype: 'modern-cloud-native' as const,
  headcount: '51-200' as const,
  revenueRange: '5-25m' as const,
  growthStage: 'scaling' as const,
  companyAge: '5-10yr' as const,
  geographies: ['us', 'eu'] as const,
  businessModel: 'productized-platform' as const,
  scaleIntensity: 'moderate' as const,
  transformationState: 'actively-modernizing' as const,
  dataSensitivity: 'high' as const,
  operatingModel: 'product-aligned-teams' as const,
};

// BL-045 PR B — generate_diligence_agenda now requires the `_audit` sibling.
// Protocol-roundtrip exercises the tool-call wire shape; supply the audit
// metadata via the partner-supplied Tier-3 helper. The audit refinement
// layer has dedicated coverage in tests/unit/schemas/diligence-audit.test.ts.
import { buildPartnerSuppliedAudit } from '../../src/schemas/diligence-audit';
const validDiligencePayload = {
  ...validDiligenceDimensions,
  geographies: [...validDiligenceDimensions.geographies] as ('us' | 'eu')[],
  _audit: buildPartnerSuppliedAudit({
    ...validDiligenceDimensions,
    geographies: [...validDiligenceDimensions.geographies] as ('us' | 'eu')[],
  }),
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
          'generate_information_request_list_xlsx', // BL-044 fillable-form generator
          'get_latest_insights', // BL-032 Phase 4c live FYI tier
          'list_portfolio_facets',
          'list_regulation_facets',
          'search_portfolio',
          'search_radar', // BL-032 Phase 4c live (Inoreader + 6h cache)
          'search_radar_cache', // deprecated alias — removed in 0.2.0
          'search_radar_offline', // BL-032 Phase 4b rename
          'search_regulations',
          'validate_irl_provenance', // BL-045 PR B Phase 2B residual-fabrication guard
          'compose_dossier_envelope', // BL-045 PR B post-audit forcing-function tightening
          // BL-049 `extract_irl_from_xlsx` partial-reverted at v0.13.1 —
          // cross-host Claude Desktop topology (model in cloud-side Linux
          // sandbox, MCP server on user host) has no reachable path to
          // deliver attached xlsx bytes. Deferred indefinitely; revisit
          // blueprint at src/docs/development/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md.
        ].sort()
      );

      // Every tool publishes a JSON Schema input — proves the Zod→JSON-Schema
      // conversion in the SDK fires through this transport too.
      for (const tool of payload.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    // BL-045 PR B audit M8 — the architectural justification for landing
    // calibration refinements in handler bodies (rather than `.superRefine`)
    // is that the SDK's `normalizeObjectSchema` only recognizes plain
    // `ZodObject`. A `.superRefine` wrapper would publish EMPTY input
    // schema to clients. This test asserts the `_audit` sibling actually
    // appears in the published JSON Schema for the audit-bearing tools —
    // if any future schema refactor accidentally wraps the schema in
    // `ZodEffects`, the model would see no `_audit` field and the entire
    // audit architecture would silently degrade.
    //
    // BL-065 exclusion (2026-06-06): `generate_diligence_agenda` was
    // moved off the M8 contract intentionally. Its registered
    // `inputSchema` is now `z.object({}).passthrough()` so the SDK does
    // NOT reject malformed payloads before the handler runs. The handler
    // performs full Zod validation via `AuditedUserInputsSchema.safeParse`
    // and routes structural failures through the same `formatAuditIssues`
    // forcing-function framing (preamble + Fix: lines + Rule 0 naming)
    // as the BL-045 cross-field refinements. Trade-off: this tool loses
    // client-side JSON Schema introspection. Justification: the
    // 2026-06-06 post-deploy retest showed `generate_diligence_agenda`
    // 5/1 — 4 retries with cascading structural rejections that BL-059's
    // prompt-prose Rule 0 directive failed to prevent. Forcing-function
    // rejection enrichment is the audit-prescribed Option 1 from the
    // BL-064 plan audit. The prompt body + TOOL_DESCRIPTION carry the
    // canonical agent-facing guidance; JSON Schema introspection on this
    // tool was documentation-quality, not load-bearing.
    it('the audit-bearing tools publish _audit in their input schema (BL-045 audit M8; BL-065 excludes generate_diligence_agenda)', async () => {
      const res = await rpc('tools/list', {});
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;
      const payload = res.result as unknown as ListToolsResultPayload;
      // BL-065: generate_diligence_agenda intentionally removed; see
      // header comment above. Its input schema is now permissive
      // (passthrough); validation happens in the handler with rule-coded
      // rejection framing matching BL-045 cross-field refinements.
      const auditBearingTools = ['compute_techpar', 'estimate_tech_debt_cost'];

      // Companion BL-065 contract: generate_diligence_agenda publishes a
      // permissive object schema AND its handler returns a BL-045-coded
      // rejection on malformed input (forcing-function framing applies
      // uniformly to structural + cross-field failures).
      const dilTool = payload.tools.find((t) => t.name === 'generate_diligence_agenda');
      expect(dilTool, 'generate_diligence_agenda must be registered').toBeDefined();
      expect(dilTool!.inputSchema.type).toBe('object');
      // Permissive schema — properties may be empty {} (BL-065 trade-off).
      // What matters is the handler rejection behavior, exercised below.
      const malformedRes = await rpc('tools/call', {
        name: 'generate_diligence_agenda',
        arguments: { not_a_real_field: 'garbage' },
      });
      expect(isErrorResponse(malformedRes)).toBe(false);
      if (isErrorResponse(malformedRes)) return;
      const callResult = malformedRes.result as unknown as CallToolResultPayload;
      // Handler returns isError: true with a BL-045-coded text body.
      expect(callResult.isError).toBe(true);
      const errorText = (callResult.content[0] as { text: string }).text;
      expect(errorText).toContain('BL-045');
      expect(errorText).toContain('RETRY DISCIPLINE');
      expect(errorText).toContain('Fix:');
      for (const toolName of auditBearingTools) {
        const tool = payload.tools.find((t) => t.name === toolName);
        expect(tool, `tool ${toolName} must be registered`).toBeDefined();
        expect(tool!.inputSchema.type).toBe('object');
        expect(
          tool!.inputSchema.properties,
          `tool ${toolName} must publish .properties (Zod→JSON-Schema must not collapse to empty)`
        ).toBeDefined();
        expect(
          tool!.inputSchema.properties!._audit,
          `tool ${toolName} must publish _audit in its input schema — empty properties indicates the schema was wrapped in ZodEffects (e.g. .superRefine), which normalizeObjectSchema cannot lift through`
        ).toBeDefined();
        expect(
          tool!.inputSchema.required,
          `tool ${toolName} must publish a required[] array`
        ).toBeDefined();
        expect(
          tool!.inputSchema.required,
          `tool ${toolName} must declare _audit as required (model would otherwise default to omitting it)`
        ).toContain('_audit');
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

    // BL-053 follow-up: integration coverage for the citation array form.
    // The 16 BL-053 unit tests exercise the engine directly. Zod
    // `z.union([string, array(string)])` is a known MCP-client
    // serialization edge case — some clients flatten union types to
    // `any` and lose the array shape in transit. This test confirms the
    // array form round-trips through the SDK + protocol layer, not just
    // the engine.
    it('validate_irl_provenance accepts array-form citations through the MCP transport (BL-053 round-trip guard)', async () => {
      const filledIrl = [
        '# Information Request List — Acme (returned)',
        '',
        '## 00 — Basics',
        '',
        '- Annual recurring revenue: $45.2M Q1-FY26 annualized',
        '',
        '## 02 — Software Architecture',
        '',
        '- Engineering FTE count: 58 total',
        '- Stack: TypeScript Node 22, Python 3.12, Aurora Postgres 15',
      ].join('\n');

      const res = await rpc('tools/call', {
        name: 'validate_irl_provenance',
        arguments: {
          filledIrl,
          citations: [
            // Single-string form (legacy) — must continue to work.
            {
              path: 'single-string-claim',
              citation: 'Section 02 — Engineering FTE count: 58 total',
            },
            // BL-053 array form: ALL elements verbatim → verified.
            {
              path: 'multi-bullet-all-verified',
              citation: [
                'Section 00 — Annual recurring revenue: $45.2M Q1-FY26 annualized',
                'Section 02 — Engineering FTE count: 58 total',
              ],
            },
            // BL-053 array form: ONE element fabricated → unverified (weakest wins).
            {
              path: 'multi-bullet-one-unverified',
              citation: [
                'Section 02 — Engineering FTE count: 58 total',
                'Section 99 — Fabricated row that does not exist anywhere in the IRL',
              ],
            },
          ],
        },
      });
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;

      const result = res.result as unknown as CallToolResultPayload;
      expect(result.isError).not.toBe(true);

      const parsed = parseToolText<{
        total: number;
        verified: number;
        unverified: number;
        verdicts: Array<{
          path: string;
          citation: string | string[];
          status: string;
        }>;
      }>(result);
      expect(parsed.total).toBe(3);
      expect(parsed.verified).toBe(2);
      expect(parsed.unverified).toBe(1);

      // Critical for the MCP-transport round-trip claim: the verdict
      // echoes back the original citation shape. The single-string entry
      // remains a string; the array entries remain arrays. If the SDK
      // flattened the union to `any`, one of these would be a string
      // (e.g., JSON-stringified) and the assertion would fail.
      expect(typeof parsed.verdicts[0].citation).toBe('string');
      expect(Array.isArray(parsed.verdicts[1].citation)).toBe(true);
      expect(Array.isArray(parsed.verdicts[2].citation)).toBe(true);
      expect((parsed.verdicts[1].citation as string[]).length).toBe(2);

      // The aggregation rule kicked in: any-unverified-wins → unverified.
      expect(parsed.verdicts[2].status).toBe('unverified');
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

      // Library × 4 + Regulations × 123 (BL-057: +3 — NIST AI RMF, UK AI framework, Chile Ley 21.719)
      expect(uris).toContain('gst://library/business-architectures');
      expect(uris).toContain('gst://library/vdr-structure');
      expect(uris).toContain('gst://library/information-request-list');
      expect(uris).toContain('gst://regulations/eu/gdpr');
      expect(uris).toContain('gst://regulations/us-ca/ccpa');

      const libraryEntries = payload.resources.filter((r) => r.uri.startsWith('gst://library/'));
      const regulationEntries = payload.resources.filter((r) =>
        r.uri.startsWith('gst://regulations/')
      );
      expect(libraryEntries.length).toBe(4);
      expect(regulationEntries.length).toBe(123);

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
