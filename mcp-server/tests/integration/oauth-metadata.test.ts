/**
 * BL-033 Slice 2 — OAuth discovery-metadata integration tests.
 *
 * Boots the real Worker (unstable_dev, miniflare-local KV) and asserts
 * the two spec-mandated discovery documents the embedded AS serves:
 *   - RFC 8414 authorization-server metadata: S256-only PKCE advertised,
 *     NO registration_endpoint (DCR deliberately disabled — BL-033
 *     AC:243), CIMD advertised, scopes catalog present.
 *   - RFC 9728 protected-resource metadata: resource + authorization
 *     server identity.
 * Plus the 401-challenge discovery pointer (resource_metadata) that
 * makes the flow self-describing for OAuth-capable clients.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    env: 'staging',
    local: true,
    experimental: { disableExperimentalWarning: true },
    vars: {
      MCP_KEY_RP: 'test-token-rp',
    },
  });
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

describe('RFC 8414 authorization-server metadata', () => {
  it('advertises S256-only PKCE, no DCR, CIMD, and the scope catalog', async () => {
    const res = await worker.fetch('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const meta = (await res.json()) as Record<string, unknown>;

    expect(meta.authorization_endpoint).toContain('/authorize');
    expect(meta.token_endpoint).toContain('/token');
    expect(meta.code_challenge_methods_supported).toEqual(['S256']);
    // DCR is disabled by design — the endpoint must not be advertised.
    expect(meta.registration_endpoint).toBeUndefined();
    expect(meta.client_id_metadata_document_supported).toBe(true);
    expect(meta.grant_types_supported).toContain('authorization_code');
    expect(meta.grant_types_supported).toContain('refresh_token');
    expect(meta.scopes_supported).toContain('tool:*');
    expect(meta.scopes_supported).toContain('resource:radar:read');
    expect(meta.scopes_supported).toContain('tool:radar:*');
  });
});

describe('RFC 9728 protected-resource metadata', () => {
  it('names the resource and its authorization server', async () => {
    const res = await worker.fetch('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    const meta = (await res.json()) as Record<string, unknown>;
    expect(typeof meta.resource).toBe('string');
    expect(Array.isArray(meta.authorization_servers)).toBe(true);
    expect((meta.authorization_servers as string[]).length).toBeGreaterThan(0);
  });
});

describe('401 challenge discovery pointer', () => {
  it('a presented-but-unknown bearer gets resource_metadata on the challenge', async () => {
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer definitely-not-a-valid-token' },
    });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('www-authenticate') ?? '';
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain('/.well-known/oauth-protected-resource');
    // Legacy JSON body contract unchanged.
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('a missing bearer keeps the bare challenge (no discovery bytes for probes)', async () => {
    const res = await worker.fetch('/mcp', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('www-authenticate') ?? '';
    expect(challenge).not.toContain('resource_metadata');
  });
});
