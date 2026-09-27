/**
 * BL-155 Slice 2b — the OAuth api-handler adapter.
 *
 * Pins the props → AuthSuccess threading (tier, rateLimitSubject) and the
 * hard stop: a validated token whose grant props are past `expiresAt` is
 * refused before the pipeline runs. The pipeline module is mocked so the
 * `agents/mcp` / Upstash graph never loads in the node pool.
 */

import type { ExecutionContext } from '@cloudflare/workers-types';

vi.mock('../../../src/pipeline/handle-authenticated', () => ({
  handleAuthenticated: vi.fn(async () => new Response('pipeline', { status: 200 })),
}));

import { oauthApiHandler } from '../../../src/oauth/api-handler';
import { SCOPE_MODEL } from '../../../src/auth/scopes';
import { handleAuthenticated } from '../../../src/pipeline/handle-authenticated';
import type { Env } from '../../../src/env';

const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const req = () => new Request('https://mcp.test/mcp', { method: 'POST', body: '{}' });
const env = {} as Env;
const ctxWith = (props: unknown) =>
  ({ props, waitUntil() {}, passThroughOnException() {} }) as unknown as ExecutionContext;
const pipeline = vi.mocked(handleAuthenticated);

describe('oauthApiHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pipeline.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('refuses malformed props with the fail-closed 401', async () => {
    const res = await oauthApiHandler.fetch(req(), env, ctxWith({ scopes: 'nope' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: 'unauthorized',
      message: 'Malformed grant properties',
    });
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('a marked roster grant reaches the pipeline with its stored scopes, no tier and no subject', async () => {
    const props = {
      keyOwner: 'OAUTH:RP',
      userId: 'RP',
      scopes: ['tool:*'],
      authKind: 'oauth',
      scopeModel: SCOPE_MODEL,
    };
    await oauthApiHandler.fetch(req(), env, ctxWith(props));
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.mock.calls[0]![3]).toEqual({
      ok: true,
      keyOwner: 'OAUTH:RP',
      scopes: ['tool:*'],
    });
  });

  it('a legacy (unmarked, four-field) roster grant keeps radar: tool:radar:* is added (BL-166)', async () => {
    const props = { keyOwner: 'OAUTH:RP', userId: 'RP', scopes: ['tool:*'], authKind: 'oauth' };
    await oauthApiHandler.fetch(req(), env, ctxWith(props));
    expect(pipeline.mock.calls[0]![3]).toEqual({
      ok: true,
      keyOwner: 'OAUTH:RP',
      scopes: ['tool:*', 'tool:radar:*'],
    });
  });

  it('a legacy converted (non-trial KV) grant keeps radar too', async () => {
    const props = {
      keyOwner: 'OAUTH:M2M:PAID',
      userId: 'm2m_y',
      scopes: ['tool:*'],
      authKind: 'oauth',
      tier: 'paid',
      rateLimitSubject: 'OAUTH:m2m_y',
    };
    await oauthApiHandler.fetch(req(), env, ctxWith(props));
    expect(pipeline.mock.calls[0]![3]!.scopes).toEqual(['tool:*', 'tool:radar:*']);
  });

  it('a KV-backed grant threads tier and rateLimitSubject onto AuthSuccess (a legacy trial gains no radar)', async () => {
    const props = {
      keyOwner: 'OAUTH:M2M:TRIAL',
      userId: 'm2m_x',
      scopes: ['tool:*'],
      authKind: 'oauth',
      tier: 'trial',
      expiresAt: new Date(NOW + 3600_000).toISOString(),
      rateLimitSubject: 'OAUTH:m2m_x',
    };
    await oauthApiHandler.fetch(req(), env, ctxWith(props));
    expect(pipeline.mock.calls[0]![3]).toEqual({
      ok: true,
      keyOwner: 'OAUTH:M2M:TRIAL',
      scopes: ['tool:*'],
      tier: 'trial',
      rateLimitSubject: 'OAUTH:m2m_x',
    });
  });

  it('refuses a token whose grant is past expiresAt without running the pipeline (hard stop)', async () => {
    const props = {
      keyOwner: 'OAUTH:M2M:TRIAL',
      userId: 'm2m_x',
      scopes: ['tool:*'],
      authKind: 'oauth',
      tier: 'trial',
      expiresAt: new Date(NOW - 1000).toISOString(),
    };
    const res = await oauthApiHandler.fetch(req(), env, ctxWith(props));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized', message: 'Grant has expired' });
    expect(pipeline).not.toHaveBeenCalled();
  });
});
