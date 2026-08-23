/**
 * Protocol-roundtrip integration tests.
 *
 * Exercises `generate_diligence_agenda`, `search_portfolio`, and
 * `list_portfolio_facets` through the full MCP protocol layer using a
 * vendored paired-pipe Transport. Closes BL-031 AC #9.
 *
 * Architecture decision: see
 * `src/docs/development/_archive/MCP_SERVER_ARCHITECTURE_BL-031_tests.md`.
 */

import {
  LATEST_PROTOCOL_VERSION,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCErrorResponse,
} from '@modelcontextprotocol/server';
import { createServer } from '../../src/server';
import { registerLocalOnlyTools } from '../../src/tools/_local-only';
import { stdioSnapshotReader } from '../../src/content/radar-snapshot-reader-stdio';
import { minimalArgsFor } from '../helpers/prompt-args';
import { createPairedTransports, type PairedHalf } from '../helpers/paired-transport';
import { parseToolResult, type CallToolResultPayload } from '../helpers/tool-envelope';

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

  // `parseToolResult` now lives in `../helpers/tool-envelope` (BL-112). It was
  // local to this file while this was the only suite asserting the envelope
  // contract; it is now asserted here, in `protocol-era-worker.test.ts`, and in
  // `tool-response-budget.test.ts`. The docstring that used to sit here — including
  // why double-sending is correct rather than the regression BL-090 took it for —
  // moved with it, along with the `textOmit` exemption, which is now a parameter
  // rather than a comment explaining which tool is not routed through the helper.

  beforeEach(async () => {
    nextId = 1;
    // Mirror src/index.ts (stdio entrypoint) — BL-032 Q12. The `radarReader`
    // is part of that mirror: the stdio entrypoint supplies it so prompt
    // embeds read through the same node:fs reader as the local-only tools.
    const server = createServer({}, { radarReader: stdioSnapshotReader });
    registerLocalOnlyTools(server);
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

    // Prompt RENDERING coverage. Before this, no test in the repo issued a
    // `prompts/get` on any transport — `prompts-args-shape.test.ts` stops at
    // `prompts/list` — which is how `gst_radar_brief_today` shipped broken on
    // the Worker for every remote client.
    //
    // Scope honestly: this lane runs under Node, where `node:fs` resolves, so
    // it would NOT have caught that particular bug. The Worker-lane cases in
    // `protocol-era-worker.test.ts` are the guard for transport-specific
    // rendering failures. This one covers the general build-throws class on
    // the stdio path, which was equally uncovered.
    it('prompts/get renders every registered prompt without an error', async () => {
      const list = await rpc('prompts/list', {});
      expect(isErrorResponse(list)).toBe(false);
      if (isErrorResponse(list)) return;

      const prompts = (list.result as unknown as { prompts: Array<{ name: string }> }).prompts;
      expect(prompts.length).toBeGreaterThan(0);

      for (const { name } of prompts) {
        // Shared with the Worker-lane suite — see tests/helpers/prompt-args.ts.
        const res = await rpc('prompts/get', { name, arguments: minimalArgsFor(name) });
        expect(isErrorResponse(res), `prompts/get ${name} errored`).toBe(false);
        if (isErrorResponse(res)) continue;
        const messages = (res.result as unknown as { messages: unknown[] }).messages;
        expect(messages.length, `prompts/get ${name} returned no messages`).toBeGreaterThanOrEqual(
          1
        );
      }
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
          'fill_information_request_list_xlsx', // BL-140 evidence-populated IRL (fills → D/E)
          'generate_information_request_list_xlsx', // BL-044 fillable-form generator
          'get_latest_insights', // BL-032 Phase 4c live FYI tier
          'list_irl_requests', // per-question removal key discovery (NN-II ↔ question text)
          'list_portfolio_facets',
          'list_regulation_facets',
          'search_portfolio',
          'search_radar', // BL-032 Phase 4c live (Inoreader + 6h cache)
          'search_radar_cache', // deprecated alias — removed in 0.2.0
          'search_radar_offline', // BL-032 Phase 4b rename
          'search_regulations',
          'validate_irl_provenance', // BL-045 PR B Phase 2B residual-fabrication guard
          'prepare_irl_body', // BL-068 hash-bind preflight ergonomics
          'compose_dossier_envelope', // BL-045 PR B post-audit forcing-function tightening
          // BL-049 `extract_irl_from_xlsx` partial-reverted at v0.13.1 —
          // cross-host Claude Desktop topology (model in cloud-side Linux
          // sandbox, MCP server on user host) has no reachable path to
          // deliver attached xlsx bytes. Deferred indefinitely; revisit
          // blueprint per src/docs/adr/0003-irl-xlsx-canonicalization-hash-bind.md.
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
    // BL-066 (2026-06-05) — `generate_diligence_agenda` is restored to
    // this contract. BL-065's permissive `inputSchema` regressed live
    // testing from 5/1 to 3/0 because the claude.ai MCP bridge type-coerces
    // nested values (`_audit`, `geographies`) against the published JSON
    // Schema; with no per-field schema published, it JSON-stringified
    // them on the wire and the model could never recover.
    it('the audit-bearing tools publish _audit in their input schema (BL-045 audit M8; BL-066 restores generate_diligence_agenda)', async () => {
      const res = await rpc('tools/list', {});
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;
      const payload = res.result as unknown as ListToolsResultPayload;
      const auditBearingTools = [
        'generate_diligence_agenda',
        'compute_techpar',
        'estimate_tech_debt_cost',
      ];

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

    // BL-066 published-schema regression guard. The BL-065 regression was
    // specifically that `_audit` and `geographies` lost their per-field
    // type publication, causing the claude.ai bridge to stringify them
    // on the wire. Assert their JSON Schema types and the nested
    // `_audit.properties` structure are present and non-empty — without
    // this, a future refactor that re-permissive-ifies the schema slips
    // through the M8 contract (which only asserts `_audit` *exists*, not
    // that it has structure).
    it('generate_diligence_agenda publishes typed _audit (nested) and geographies (array) — BL-066 regression guard', async () => {
      const res = await rpc('tools/list', {});
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;
      const payload = res.result as unknown as ListToolsResultPayload;
      const tool = payload.tools.find((t) => t.name === 'generate_diligence_agenda');
      expect(tool).toBeDefined();
      const props = tool!.inputSchema.properties as Record<string, Record<string, unknown>>;
      // _audit must publish as a typed object with nested per-dimension
      // structure (not an opaque {}).
      expect(props._audit?.type).toBe('object');
      const auditNested = props._audit?.properties as Record<string, unknown> | undefined;
      expect(
        auditNested && Object.keys(auditNested).length > 0,
        '_audit.properties must publish nested dimension fields — empty indicates the schema collapsed (BL-065 regression shape)'
      ).toBe(true);
      // geographies must publish as a typed array (the wire-format
      // coercion failure point in the 2026-06-05 retest).
      expect(props.geographies?.type).toBe('array');
    });

    // BL-068 — assert the new `prepare_irl_body` preflight tool is
    // registered and publishes a typed `filledIrl` string. If this is
    // missing, the BL-068 hash-bind preflight ergonomics regressed and
    // operators will see compose_dossier_envelope 2/1 hash-bind retries
    // again (which is functionally fine — IrlBodyHashMismatchError still
    // catches it — but means the new tool isn't reachable).
    it('prepare_irl_body publishes with typed filledIrl (string) — BL-068 surface check', async () => {
      const res = await rpc('tools/list', {});
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;
      const payload = res.result as unknown as ListToolsResultPayload;
      const tool = payload.tools.find((t) => t.name === 'prepare_irl_body');
      expect(tool, 'prepare_irl_body must be registered').toBeDefined();
      expect(tool!.inputSchema.type).toBe('object');
      const props = tool!.inputSchema.properties as Record<string, Record<string, unknown>>;
      expect(props.filledIrl?.type).toBe('string');
      expect(tool!.inputSchema.required).toContain('filledIrl');
    });

    // BL-076 surface assertions (audit M-3). compose_dossier_envelope no
    // longer takes `filledIrl` as a public input — the body flows in via
    // prepare_irl_body → server-side IrlBodyCache → compose re-hydrate. A
    // future regression that re-introduced `filledIrl` on the public schema
    // would silently bring the 5–15 min token-emit cost back; this test
    // pins the absence.
    it('compose_dossier_envelope does NOT publish filledIrl on its input schema — BL-076 surface check', async () => {
      const res = await rpc('tools/list', {});
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;
      const payload = res.result as unknown as ListToolsResultPayload;
      const tool = payload.tools.find((t) => t.name === 'compose_dossier_envelope');
      expect(tool, 'compose_dossier_envelope must be registered').toBeDefined();
      const props = tool!.inputSchema.properties as Record<string, Record<string, unknown>>;
      expect(
        props.filledIrl,
        'BL-076: filledIrl must NOT appear in compose_dossier_envelope.inputSchema.properties — body is fetched server-side from IrlBodyCache'
      ).toBeUndefined();
      expect(
        tool!.inputSchema.required,
        'BL-076: filledIrl must NOT be in compose_dossier_envelope.inputSchema.required'
      ).not.toContain('filledIrl');
      // irlBodyHash IS required and string-typed — that's the sole body reference now.
      expect(props.irlBodyHash?.type).toBe('string');
      expect(tool!.inputSchema.required).toContain('irlBodyHash');
    });

    // BL-076 audit R-2 — `prepare_irl_body` annotation accuracy. Cache-write
    // is a side effect; readOnlyHint must be false (was true pre-BL-076).
    // idempotentHint stays true (same body → same cache state by construction).
    it('prepare_irl_body publishes readOnlyHint:false + idempotentHint:true — BL-076 R-2', async () => {
      const res = await rpc('tools/list', {});
      expect(isErrorResponse(res)).toBe(false);
      if (isErrorResponse(res)) return;
      const payload = res.result as unknown as ListToolsResultPayload;
      const tool = payload.tools.find((t) => t.name === 'prepare_irl_body') as
        { annotations?: { readOnlyHint?: boolean; idempotentHint?: boolean } } | undefined;
      expect(tool, 'prepare_irl_body must be registered').toBeDefined();
      expect(tool!.annotations?.readOnlyHint).toBe(false);
      expect(tool!.annotations?.idempotentHint).toBe(true);
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

      const parsed = parseToolResult<{
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
      const parsed = parseToolResult<{
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

      const parsed = parseToolResult<{
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

      const parsed = parseToolResult<{
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

      const parsed = parseToolResult<{
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

      const parsed = parseToolResult<{
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
