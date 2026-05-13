/**
 * Integration test for radar Resources on the Worker code path
 * (BL-032.5 Phase 3). Uses paired-transport with a mocked
 * SnapshotReader so we exercise the transport-portable
 * `registerRadarResources` end-to-end without spinning up
 * `unstable_dev` or hitting Upstash.
 *
 * Covers:
 *   - the FYI / Wire / Wire-by-category handlers all invoke the right
 *     reader method and return the expected body shape
 *   - scope-gate accepts when `resource:radar:read` is present
 *   - scope-gate rejects when the scope is missing (error response, not
 *     a populated body)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LATEST_PROTOCOL_VERSION,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCErrorResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRadarResources } from '../../src/resources/radar';
import type { SnapshotReader } from '../../src/content/radar-snapshot-reader';
import type { SnapshotItem } from '../../src/content/radar-transform';
import { DEFAULT_SCOPES, SCOPES } from '../../src/auth/scopes';
import { createPairedTransports, type PairedHalf } from '../helpers/paired-transport';

interface ResourceReadResult {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}

interface RadarBody {
  uri: string;
  tier: 'fyi' | 'wire';
  lastSeededAt: string;
  itemCount: number;
  items: SnapshotItem[];
}

function makeItem(id: string, category: SnapshotItem['category']): SnapshotItem {
  return {
    id,
    title: `Item ${id}`,
    url: `https://example.test/${id}`,
    source: 'Test source',
    category,
    publishedAt: '2026-05-13T00:00:00.000Z',
  };
}

const sampleFyiItems: SnapshotItem[] = [makeItem('fyi-1', 'pe-ma'), makeItem('fyi-2', 'security')];
const sampleWireItems: SnapshotItem[] = [
  makeItem('wire-1', 'pe-ma'),
  makeItem('wire-2', 'enterprise-tech'),
  makeItem('wire-3', 'pe-ma'),
];

function mockReader(): {
  reader: SnapshotReader;
  calls: { readFyi: number; readWire: number; readWireByCategory: string[] };
} {
  const calls = { readFyi: 0, readWire: 0, readWireByCategory: [] as string[] };
  const reader: SnapshotReader = {
    async readFyi() {
      calls.readFyi += 1;
      return { tier: 'fyi', items: sampleFyiItems, lastSeededAt: '2026-05-13T10:00:00.000Z' };
    },
    async readWire() {
      calls.readWire += 1;
      return { tier: 'wire', items: sampleWireItems, lastSeededAt: '2026-05-13T11:00:00.000Z' };
    },
    async readWireByCategory(category) {
      calls.readWireByCategory.push(category);
      return {
        tier: 'wire',
        items: sampleWireItems.filter((i) => i.category === category),
        lastSeededAt: '2026-05-13T11:00:00.000Z',
      };
    },
  };
  return { reader, calls };
}

async function setupServer(
  reader: SnapshotReader,
  scopes: readonly string[]
): Promise<{
  client: PairedHalf;
  rpc: (method: string, params: unknown) => Promise<JSONRPCResponse | JSONRPCErrorResponse>;
}> {
  let nextId = 1;
  const server = new McpServer({ name: 'gst-mcp-test', version: '0.1.0' });
  registerRadarResources(server, reader, {}, scopes);
  const pair = createPairedTransports();
  await server.connect(pair.server);

  const rpc = (
    method: string,
    params: unknown
  ): Promise<JSONRPCResponse | JSONRPCErrorResponse> => {
    const id = nextId++;
    return new Promise<JSONRPCResponse | JSONRPCErrorResponse>((resolve) => {
      pair.client.onmessage = (msg: JSONRPCMessage) => {
        if ('id' in msg && msg.id === id) {
          resolve(msg as JSONRPCResponse | JSONRPCErrorResponse);
        }
      };
      void pair.client.send({ jsonrpc: '2.0', id, method, params } as JSONRPCRequest);
    });
  };

  await rpc('initialize', {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'radar-worker-test', version: '0.0.0' },
  });
  await pair.client.send({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  } as JSONRPCMessage);

  return { client: pair.client, rpc };
}

describe('radar Resources on Worker — happy path (full scopes)', () => {
  let setup: Awaited<ReturnType<typeof setupServer>>;
  let calls: ReturnType<typeof mockReader>['calls'];

  beforeEach(async () => {
    const m = mockReader();
    calls = m.calls;
    setup = await setupServer(m.reader, DEFAULT_SCOPES);
  });

  it('gst://radar/fyi/latest invokes readFyi and returns the FYI snapshot', async () => {
    const res = await setup.rpc('resources/read', { uri: 'gst://radar/fyi/latest' });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    const payload = res.result as unknown as ResourceReadResult;
    const body = JSON.parse(payload.contents[0]!.text) as RadarBody;
    expect(calls.readFyi).toBe(1);
    expect(body.uri).toBe('gst://radar/fyi/latest');
    expect(body.tier).toBe('fyi');
    expect(body.itemCount).toBe(2);
    expect(body.items.map((i) => i.id)).toEqual(['fyi-1', 'fyi-2']);
    expect(body.lastSeededAt).toBe('2026-05-13T10:00:00.000Z');
  });

  it('gst://radar/wire/latest invokes readWire and returns the merged Wire snapshot', async () => {
    const res = await setup.rpc('resources/read', { uri: 'gst://radar/wire/latest' });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    const payload = res.result as unknown as ResourceReadResult;
    const body = JSON.parse(payload.contents[0]!.text) as RadarBody;
    expect(calls.readWire).toBe(1);
    expect(body.tier).toBe('wire');
    expect(body.itemCount).toBe(3);
  });

  it('gst://radar/wire/pe-ma invokes readWireByCategory and filters to pe-ma items', async () => {
    const res = await setup.rpc('resources/read', { uri: 'gst://radar/wire/pe-ma' });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    const payload = res.result as unknown as ResourceReadResult;
    const body = JSON.parse(payload.contents[0]!.text) as RadarBody;
    expect(calls.readWireByCategory).toEqual(['pe-ma']);
    expect(body.itemCount).toBe(2);
    expect(body.items.every((i) => i.category === 'pe-ma')).toBe(true);
  });

  it('returns the snapshot-missing error body when the reader returns null', async () => {
    const calls = { readFyi: 0, readWire: 0, readWireByCategory: [] as string[] };
    const nullReader: SnapshotReader = {
      async readFyi() {
        calls.readFyi += 1;
        return null;
      },
      async readWire() {
        return null;
      },
      async readWireByCategory() {
        return null;
      },
    };
    const local = await setupServer(nullReader, DEFAULT_SCOPES);

    const res = await local.rpc('resources/read', { uri: 'gst://radar/fyi/latest' });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    const payload = res.result as unknown as ResourceReadResult;
    const body = JSON.parse(payload.contents[0]!.text) as { error: string; uri: string };
    expect(body.error).toMatch(/snapshot/i);
    expect(body.uri).toBe('gst://radar/fyi/latest');
  });
});

describe('radar Resources on Worker — scope-gate', () => {
  it('rejects the read when resource:radar:read is missing from the scope set', async () => {
    const m = mockReader();
    // Scope set explicitly excludes the radar scope (and the tool:* / prompt:*
    // wildcards that would otherwise cover it via the BL-033 forward-compat path).
    const reducedScopes = [SCOPES.RESOURCE_LIBRARY_READ, SCOPES.RESOURCE_REGULATIONS_READ];
    const setup = await setupServer(m.reader, reducedScopes);

    const res = await setup.rpc('resources/read', { uri: 'gst://radar/fyi/latest' });
    // The handler threw MissingScopeError before invoking the reader.
    expect(m.calls.readFyi).toBe(0);
    // The MCP SDK wraps thrown errors into a JSON-RPC error response; the
    // exact shape (code, data) depends on the SDK version. We assert the
    // request was rejected — that's the contract that matters here.
    expect('error' in res).toBe(true);
    if ('error' in res) {
      // The default SDK conversion produces a string `message`; ensure the
      // missing-scope detail is present somewhere we can grep.
      const combined = JSON.stringify(res.error);
      expect(combined.toLowerCase()).toMatch(/scope/);
    }
  });

  it('accepts the read when resource:radar:read is present', async () => {
    const m = mockReader();
    const setup = await setupServer(m.reader, [SCOPES.RESOURCE_RADAR_READ]);

    const res = await setup.rpc('resources/read', { uri: 'gst://radar/fyi/latest' });
    expect('error' in res).toBe(false);
    expect(m.calls.readFyi).toBe(1);
  });

  it('accepts the read under DEFAULT_SCOPES (every internal key today)', async () => {
    const m = mockReader();
    const setup = await setupServer(m.reader, DEFAULT_SCOPES);
    const res = await setup.rpc('resources/read', { uri: 'gst://radar/fyi/latest' });
    expect('error' in res).toBe(false);
    expect(m.calls.readFyi).toBe(1);
  });
});
