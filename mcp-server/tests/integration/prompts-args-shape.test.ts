/**
 * Regression: every registered prompt's `prompts/list` arguments match
 * its argsSchema shape (and never leak ZodObject prototype methods).
 *
 * Background — the bug this guards against:
 *   SDK **v1**'s `registerPrompt` accepted only a `ZodRawShape` (the raw
 *   `{ key: ZodType }` map). Passing a wrapped `z.object({...})` made it
 *   enumerate ZodObject's prototype methods (keyof / catchall / passthrough
 *   / loose / strict / strip) and surface them as bogus argument fields in
 *   Claude Desktop's prompt UI. Found during BL-032 soak T.A.11 verification
 *   (2026-05-10) on `gst_diligence_kickoff`.
 *
 *   **BL-106 inverted the rule.** SDK v2 takes a StandardSchema and derives
 *   arguments via Zod 4's `~standard.jsonSchema`, so `_registry.ts` now passes
 *   the WRAPPED object and the `.shape` workaround is gone. This guard stays
 *   valuable either way: it pins the argument NAMES, so whichever mechanism
 *   the SDK uses, a regression that leaks prototype methods still fails here.
 *
 * Coverage: this test boots the live server through the same paired-
 * transport rig as protocol-roundtrip.test.ts, sends a real `prompts/list`
 * request, and verifies the returned `arguments` for every prompt are the
 * actual schema fields. The Zod-method-name sentinel check below is the
 * load-bearing regression guard.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LATEST_PROTOCOL_VERSION,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCErrorResponse,
} from '@modelcontextprotocol/server';
import { createServer } from '../../src/server';
import { ALL_PROMPTS } from '../../src/prompts/_registry';
import { createPairedTransports, type PairedHalf } from '../helpers/paired-transport';

interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

interface PromptDescriptor {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

interface ListPromptsResultPayload {
  prompts: PromptDescriptor[];
}

// These names are method sentinels — if any of them appears as a prompt
// argument, the SDK is enumerating a ZodObject's prototype instead of its
// raw shape. Lowercased before comparison so any-casing match catches the
// bug regardless of how the SDK happens to render the names today.
const ZOD_METHOD_SENTINELS = new Set([
  'keyof',
  'catchall',
  'passthrough',
  'loose',
  'strict',
  'strip',
  'extend',
  'merge',
  'pick',
  'omit',
  'partial',
  'required',
]);

describe('prompts/list returns real argsSchema fields (regression — no Zod prototype leak)', () => {
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

  beforeEach(async () => {
    nextId = 1;
    const server = createServer();
    const pair = createPairedTransports();
    client = pair.client;
    await server.connect(pair.server);

    const init = await rpc('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'prompts-args-shape-test', version: '0.0.0' },
    });
    if (isErrorResponse(init)) {
      throw new Error(`initialize failed: ${init.error.message}`);
    }
    await notify('notifications/initialized', {});
  });

  it('every registered prompt is returned by prompts/list', async () => {
    const resp = await rpc('prompts/list', {});
    if (isErrorResponse(resp)) {
      throw new Error(`prompts/list failed: ${resp.error.message}`);
    }
    const result = resp.result as unknown as ListPromptsResultPayload;
    const returnedNames = result.prompts.map((p) => p.name).sort();
    const expectedNames = ALL_PROMPTS.map((p) => p.name).sort();
    expect(returnedNames).toEqual(expectedNames);
  });

  it("no prompt's arguments leak ZodObject prototype method names", async () => {
    const resp = await rpc('prompts/list', {});
    if (isErrorResponse(resp)) {
      throw new Error(`prompts/list failed: ${resp.error.message}`);
    }
    const result = resp.result as unknown as ListPromptsResultPayload;
    for (const prompt of result.prompts) {
      const argNames = (prompt.arguments ?? []).map((a) => a.name.toLowerCase());
      const leaked = argNames.filter((n) => ZOD_METHOD_SENTINELS.has(n));
      expect(
        leaked,
        `prompt "${prompt.name}" exposed ZodObject method name(s) as arguments: ${leaked.join(', ')}. Likely cause: registry passed a wrapped ZodObject instead of its .shape — see _registry.ts.`
      ).toEqual([]);
    }
  });

  it("each prompt's arguments match its argsSchema.shape keys exactly", async () => {
    const resp = await rpc('prompts/list', {});
    if (isErrorResponse(resp)) {
      throw new Error(`prompts/list failed: ${resp.error.message}`);
    }
    const result = resp.result as unknown as ListPromptsResultPayload;
    const byName = new Map(result.prompts.map((p) => [p.name, p]));

    for (const prompt of ALL_PROMPTS) {
      const returned = byName.get(prompt.name);
      expect(returned, `prompts/list missing entry for "${prompt.name}"`).toBeDefined();
      if (!returned) continue;

      const expectedKeys = Object.keys(prompt.argsSchema.shape).sort();
      const returnedKeys = (returned.arguments ?? []).map((a) => a.name).sort();
      expect(returnedKeys).toEqual(expectedKeys);
    }
  });

  it('gst_diligence_kickoff exposes targetName + the 13 BL-031.95 wizard fields (spot-check)', async () => {
    const resp = await rpc('prompts/list', {});
    if (isErrorResponse(resp)) {
      throw new Error(`prompts/list failed: ${resp.error.message}`);
    }
    const result = resp.result as unknown as ListPromptsResultPayload;
    const kickoff = result.prompts.find((p) => p.name === 'gst_diligence_kickoff');
    expect(kickoff).toBeDefined();
    if (!kickoff) return;

    const argNames = (kickoff.arguments ?? []).map((a) => a.name);
    // targetName surfaces first per the form-order contract enforced by
    // diligence-kickoff.test.ts; the other 13 are the BL-031.95 wizard fields.
    expect(argNames).toContain('targetName');
    expect(argNames).toContain('transactionType');
    expect(argNames).toContain('productType');
    expect(argNames).toContain('techArchetype');
    expect(argNames).toContain('headcount');
    expect(argNames).toContain('revenueRange');
    expect(argNames).toContain('growthStage');
    expect(argNames).toContain('companyAge');
    expect(argNames).toContain('geographies');
    expect(argNames).toContain('businessModel');
    expect(argNames).toContain('scaleIntensity');
    expect(argNames).toContain('transformationState');
    expect(argNames).toContain('dataSensitivity');
    expect(argNames).toContain('operatingModel');
    expect(argNames.length).toBe(14);
  });
});
