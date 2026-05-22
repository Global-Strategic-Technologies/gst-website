/**
 * Resource URI stability — frozen manifest invariant.
 *
 * URIs are part of the public Resource contract. Once a client (or an
 * agent in a long-running conversation) has pinned `gst://library/...`
 * or `gst://regulations/eu/gdpr` into its context, that URI must not
 * move. This test fails on any drift between the registered Resources
 * and the expected manifest. Deliberate URI changes require updating
 * the manifest below in the same commit and bumping
 * `mcp-server/package.json` version (semver-as-contract).
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
import { LIBRARY_ENTRIES } from '../../src/content/library-loader';
import { REGULATION_ENTRIES } from '../../src/content/regulation-loader';
import { RADAR_URIS } from '../../src/resources/radar';
import { createPairedTransports, type PairedHalf } from '../helpers/paired-transport';

interface ResourceDescriptor {
  uri: string;
  name: string;
  mimeType?: string;
}
interface ListResourcesResultPayload {
  resources: ResourceDescriptor[];
}

const EXPECTED_LIBRARY_URIS: ReadonlyArray<string> = [
  'gst://library/business-architectures',
  'gst://library/vdr-structure',
  'gst://library/information-request-list',
];

const EXPECTED_RADAR_URIS: ReadonlyArray<string> = [
  'gst://radar/fyi/latest',
  'gst://radar/wire/latest',
  'gst://radar/wire/pe-ma',
  'gst://radar/wire/enterprise-tech',
  'gst://radar/wire/ai-automation',
  'gst://radar/wire/security',
];

/**
 * Regulation URIs are derived from the source data — there are 120 today;
 * the test asserts both the count and that two specific high-profile URIs
 * are present (canaries that catch ID-format changes).
 */
const EXPECTED_REGULATION_URI_COUNT = 120;
const REGULATION_URI_CANARIES: ReadonlyArray<string> = [
  'gst://regulations/eu/gdpr',
  'gst://regulations/us-ca/ccpa',
  'gst://regulations/ca-qc/law25',
  'gst://regulations/gb/dpa',
];

describe('resource URI stability', () => {
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
      void client.send({ jsonrpc: '2.0', id, method, params } as JSONRPCRequest);
    });
  }

  async function notify(method: string, params: unknown): Promise<void> {
    await client.send({ jsonrpc: '2.0', method, params } as JSONRPCMessage);
  }

  beforeEach(async () => {
    nextId = 1;
    const server = createServer();
    registerLocalOnlyTools(server); // mirror src/index.ts (stdio entrypoint) — BL-032 Q12
    const pair = createPairedTransports();
    client = pair.client;
    await server.connect(pair.server);
    await rpc('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'uri-stability-test', version: '0.0.0' },
    });
    await notify('notifications/initialized', {});
  });

  it('exposes exactly the expected Library URIs', () => {
    const uris = LIBRARY_ENTRIES.map((e) => e.uri).sort();
    expect(uris).toEqual([...EXPECTED_LIBRARY_URIS].sort());
  });

  it('exposes exactly the expected Radar URIs', () => {
    const uris = [...RADAR_URIS].sort();
    expect(uris).toEqual([...EXPECTED_RADAR_URIS].sort());
  });

  it(`exposes ${EXPECTED_REGULATION_URI_COUNT} Regulation URIs`, () => {
    expect(REGULATION_ENTRIES.length).toBe(EXPECTED_REGULATION_URI_COUNT);
  });

  it('preserves canary Regulation URIs (drift signal)', () => {
    const uris = new Set(REGULATION_ENTRIES.map((e) => e.uri));
    for (const canary of REGULATION_URI_CANARIES) {
      expect(uris.has(canary)).toBe(true);
    }
  });

  it('all Regulation URIs are unique', () => {
    const uris = REGULATION_ENTRIES.map((e) => e.uri);
    expect(new Set(uris).size).toBe(uris.length);
  });

  it('resources/list over MCP returns the full manifest (Library + Regulations + Radar)', async () => {
    const res = await rpc('resources/list', {});
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    const payload = res.result as unknown as ListResourcesResultPayload;
    const uriSet = new Set(payload.resources.map((r) => r.uri));

    for (const uri of EXPECTED_LIBRARY_URIS) {
      expect(uriSet.has(uri)).toBe(true);
    }
    for (const uri of EXPECTED_RADAR_URIS) {
      expect(uriSet.has(uri)).toBe(true);
    }
    for (const uri of REGULATION_URI_CANARIES) {
      expect(uriSet.has(uri)).toBe(true);
    }
    expect(payload.resources.length).toBe(
      EXPECTED_LIBRARY_URIS.length + EXPECTED_RADAR_URIS.length + EXPECTED_REGULATION_URI_COUNT
    );
  });
});
