/**
 * Routing-correctness tests for the Path 2 Upstash client factories.
 *
 * `createInoreaderClient(env)` MUST construct its Redis instance from the
 * `UPSTASH_INOREADER_REST_*` secrets; `createMcpClient(env)` MUST use the
 * `UPSTASH_MCP_REST_*` secrets. Swapping them silently would defeat both
 * Q4 storage-layer enforcement (Worker would write through Read-Only token,
 * fail at storage layer) AND rotation isolation (rotating one would affect
 * the other).
 *
 * These tests are the regression guardrail for that boundary. They spy on
 * the Redis ctor opts via a `vi.fn()` recorder inside MockRedis, then
 * assert the recorded constructor args match the expected DB's URL+token.
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

import { createInoreaderClient, createMcpClient } from '../../src/lib/upstash-clients';
import type { Env } from '../../src/worker';

const fullEnv: Env = {
  UPSTASH_INOREADER_REST_URL: 'https://inoreader-db.upstash.io',
  UPSTASH_INOREADER_REST_TOKEN: 'inoreader-readonly-token',
  UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'mcp-standard-token',
};

beforeEach(() => {
  redisCtor.mockReset();
});

describe('createInoreaderClient', () => {
  it('passes the Inoreader-DB url+token to the Redis constructor', () => {
    const client = createInoreaderClient(fullEnv);
    expect(client).not.toBeNull();
    expect(redisCtor).toHaveBeenCalledTimes(1);
    expect(redisCtor).toHaveBeenCalledWith({
      url: 'https://inoreader-db.upstash.io',
      token: 'inoreader-readonly-token',
    });
  });

  it('returns null when the URL is missing', () => {
    const client = createInoreaderClient({
      ...fullEnv,
      UPSTASH_INOREADER_REST_URL: undefined,
    });
    expect(client).toBeNull();
    expect(redisCtor).not.toHaveBeenCalled();
  });

  it('returns null when the token is missing', () => {
    const client = createInoreaderClient({
      ...fullEnv,
      UPSTASH_INOREADER_REST_TOKEN: undefined,
    });
    expect(client).toBeNull();
    expect(redisCtor).not.toHaveBeenCalled();
  });

  it('returns null on a fully empty env (no secrets bound — stdio path)', () => {
    const client = createInoreaderClient({});
    expect(client).toBeNull();
    expect(redisCtor).not.toHaveBeenCalled();
  });

  it('does NOT confuse Inoreader-DB creds with MCP-DB creds', () => {
    // If the helper accidentally read UPSTASH_MCP_REST_* it would still
    // succeed — fullEnv has both sets bound. The assertion is on the
    // ctor opts: they must reference the Inoreader-DB values, not MCP-DB.
    createInoreaderClient(fullEnv);
    const opts = redisCtor.mock.calls[0]![0];
    expect(opts.url).not.toBe(fullEnv.UPSTASH_MCP_REST_URL);
    expect(opts.token).not.toBe(fullEnv.UPSTASH_MCP_REST_TOKEN);
  });
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

  it('does NOT confuse MCP-DB creds with Inoreader-DB creds', () => {
    createMcpClient(fullEnv);
    const opts = redisCtor.mock.calls[0]![0];
    expect(opts.url).not.toBe(fullEnv.UPSTASH_INOREADER_REST_URL);
    expect(opts.token).not.toBe(fullEnv.UPSTASH_INOREADER_REST_TOKEN);
  });
});

describe('helper independence', () => {
  it('two helpers called from the same env produce DIFFERENT clients', () => {
    createInoreaderClient(fullEnv);
    createMcpClient(fullEnv);

    expect(redisCtor).toHaveBeenCalledTimes(2);
    const [firstOpts, secondOpts] = redisCtor.mock.calls.map((c) => c[0]);
    expect(firstOpts.url).toBe('https://inoreader-db.upstash.io');
    expect(secondOpts.url).toBe('https://mcp-db.upstash.io');
    expect(firstOpts.token).not.toBe(secondOpts.token);
  });

  it('one helper failing creds does not affect the other', () => {
    const halfEnv: Env = {
      ...fullEnv,
      UPSTASH_INOREADER_REST_URL: undefined,
      UPSTASH_INOREADER_REST_TOKEN: undefined,
    };

    expect(createInoreaderClient(halfEnv)).toBeNull();
    expect(createMcpClient(halfEnv)).not.toBeNull();
    expect(redisCtor).toHaveBeenCalledTimes(1); // only the MCP one constructed
  });
});
