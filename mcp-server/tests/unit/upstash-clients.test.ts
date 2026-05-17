/**
 * Routing-correctness tests for the MCP-DB Upstash client factory
 * (post-BL-032.8 Phase B — single-DB).
 *
 * `createMcpClient(env)` MUST construct its Redis instance from the
 * `UPSTASH_MCP_REST_*` secrets. Returns null when either secret isn't
 * bound (graceful-skip fail-open pattern shared by the other helpers).
 *
 * **History**: Phase 4 of BL-032 introduced a sibling `createInoreaderClient`
 * factory plus `UPSTASH_INOREADER_REST_*` bindings for the website-shared
 * Inoreader DB (Q13 / Path 2). Phase B retired that DB alongside the
 * website's direct Inoreader client; this test file mirrors that
 * simplification.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { redisCtor, MockRedis } = vi.hoisted(() => {
  const redisCtor = vi.fn();
  class MockRedis {
    constructor(opts: { url: string; token: string }) {
      redisCtor(opts);
    }
  }
  return { redisCtor, MockRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { createMcpClient } from '../../src/lib/upstash-clients';
import type { Env } from '../../src/worker';

const fullEnv: Env = {
  UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'mcp-standard-token',
};

beforeEach(() => {
  redisCtor.mockReset();
});

describe('createMcpClient', () => {
  it('passes the MCP-DB url+token to the Redis constructor', () => {
    const client = createMcpClient(fullEnv);
    expect(client).not.toBeNull();
    expect(redisCtor).toHaveBeenCalledTimes(1);
    expect(redisCtor).toHaveBeenCalledWith({
      url: 'https://mcp-db.upstash.io',
      token: 'mcp-standard-token',
    });
  });

  it('returns null when the URL is missing', () => {
    const client = createMcpClient({
      ...fullEnv,
      UPSTASH_MCP_REST_URL: undefined,
    });
    expect(client).toBeNull();
    expect(redisCtor).not.toHaveBeenCalled();
  });

  it('returns null when the token is missing', () => {
    const client = createMcpClient({
      ...fullEnv,
      UPSTASH_MCP_REST_TOKEN: undefined,
    });
    expect(client).toBeNull();
    expect(redisCtor).not.toHaveBeenCalled();
  });

  it('returns null on a fully empty env (no secrets bound — stdio path)', () => {
    const client = createMcpClient({});
    expect(client).toBeNull();
    expect(redisCtor).not.toHaveBeenCalled();
  });
});
