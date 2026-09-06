/**
 * BL-155 Slice 2b — the tier gate that refuses radar tools to `trial`.
 *
 * Pure function; the wiring (before the limiter, CORS-wrapped) is proved by
 * `tests/integration/oauth-trial-consent.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { trialRadarDenial } from '../../../src/pipeline/tier-gate';
import type { AuthSuccess } from '../../../src/auth/bearer';

const trial: AuthSuccess = {
  ok: true,
  keyOwner: 'OAUTH:M2M:TRIAL',
  scopes: ['tool:*'],
  tier: 'trial',
  rateLimitSubject: 'OAUTH:m2m_x',
};

describe('trialRadarDenial', () => {
  it.each([
    ['search_radar', 7],
    ['get_latest_insights', 'req-9'],
  ])('refuses %s for a trial with a JSON-RPC -32002 echoing id %s', async (name, id) => {
    const res = trialRadarDenial(trial, { name, id });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get('Content-Type')).toBe('application/json');
    const body = await res!.json();
    expect(body).toEqual({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32002,
        message: 'Missing required scope: tool:radar:*',
        data: { missingScope: 'tool:radar:*', ownedScopes: ['tool:*'] },
      },
    });
  });

  it('lets a non-radar tool, a non-tools/call request, and non-trial tiers through', () => {
    expect(trialRadarDenial(trial, { name: 'search_portfolio', id: 1 })).toBeNull();
    expect(trialRadarDenial(trial, null)).toBeNull();
    expect(
      trialRadarDenial({ ...trial, tier: 'free-pilot' }, { name: 'search_radar', id: 1 })
    ).toBeNull();
    const { tier: _tier, ...untiered } = trial;
    expect(trialRadarDenial(untiered, { name: 'search_radar', id: 1 })).toBeNull();
  });
});
