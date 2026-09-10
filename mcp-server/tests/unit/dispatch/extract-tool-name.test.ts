/**
 * BL-038 — Worker-boundary tool-name extraction unit tests.
 *
 * Covers the JSON-RPC parse + the `toolClassFor` resolution. Pure-function;
 * no Worker boot, no fetch, no env.
 */
import { describe, expect, it } from 'vitest';

import {
  RADAR_TOOLS,
  extractToolCall,
  extractToolName,
  toolClassFor,
} from '../../../src/dispatch/extract-tool-name';

const post = (body: string | undefined) =>
  new Request('https://example.test/mcp', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });

describe('extractToolName', () => {
  it('returns the tool name for a tools/call request (search_radar)', async () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'search_radar', arguments: { query: 'AI' } },
    });
    expect(await extractToolName(post(body))).toBe('search_radar');
  });

  it('returns the tool name for a tools/call request (list_portfolio_facets)', async () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_portfolio_facets', arguments: {} },
    });
    expect(await extractToolName(post(body))).toBe('list_portfolio_facets');
  });

  it('returns null for tools/list (no name in params)', async () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    expect(await extractToolName(post(body))).toBeNull();
  });

  it('returns null for a non-JSON body (fail-safe)', async () => {
    expect(await extractToolName(post('not-json{'))).toBeNull();
  });

  it('returns null when params is missing on a tools/call (malformed)', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call' });
    expect(await extractToolName(post(body))).toBeNull();
  });

  it('returns null for an empty body (e.g., GET /health)', async () => {
    expect(await extractToolName(post(undefined))).toBeNull();
    expect(await extractToolName(post(''))).toBeNull();
  });

  it('does not consume the request body — original remains readable downstream', async () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'search_radar' },
    });
    const req = post(body);
    const extracted = await extractToolName(req);
    expect(extracted).toBe('search_radar');
    // The original request body must still be readable by the MCP handler.
    expect(await req.text()).toBe(body);
  });
});

describe('extractToolCall (BL-155 — name + JSON-RPC id)', () => {
  const call = (id: unknown, extra: Record<string, unknown> = {}) =>
    post(
      JSON.stringify({
        jsonrpc: '2.0',
        ...(id === undefined ? {} : { id }),
        method: 'tools/call',
        params: { name: 'search_radar' },
        ...extra,
      })
    );

  it('keeps a numeric or string id', async () => {
    expect(await extractToolCall(call(42))).toEqual({ name: 'search_radar', id: 42 });
    expect(await extractToolCall(call('abc'))).toEqual({ name: 'search_radar', id: 'abc' });
  });

  it('normalises a missing or non-scalar id to null', async () => {
    expect(await extractToolCall(call(undefined))).toEqual({ name: 'search_radar', id: null });
    expect(await extractToolCall(call({ nested: true }))).toEqual({
      name: 'search_radar',
      id: null,
    });
  });

  it('returns null for anything that is not a tools/call', async () => {
    expect(
      await extractToolCall(post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })))
    ).toBeNull();
    expect(await extractToolCall(post('nope{'))).toBeNull();
  });
});

describe('toolClassFor', () => {
  it('maps radar tools to "radar"', () => {
    expect(toolClassFor('search_radar')).toBe('radar');
    expect(toolClassFor('get_latest_insights')).toBe('radar');
  });

  it('maps every other tool name to "general"', () => {
    expect(toolClassFor('list_portfolio_facets')).toBe('general');
    expect(toolClassFor('search_portfolio')).toBe('general');
    expect(toolClassFor('generate_diligence_agenda')).toBe('general');
  });

  it('maps null (no tool name extractable) to "general" (fail-safe)', () => {
    expect(toolClassFor(null)).toBe('general');
  });

  it('exposes the RADAR_TOOLS set for assertion in other tests', () => {
    expect(RADAR_TOOLS.has('search_radar')).toBe(true);
    expect(RADAR_TOOLS.has('get_latest_insights')).toBe(true);
    expect(RADAR_TOOLS.size).toBe(2);
  });
});
