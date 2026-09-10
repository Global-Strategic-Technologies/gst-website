/**
 * BL-155 Slice 2b — the provider's `tokenExchangeCallback`.
 *
 * The first test is the regression guard for the whole slice: the callback
 * runs for EVERY grant the provider issues, and a grant with no `expiresAt`
 * (every roster consent, every pre-existing pilot grant) must return
 * `undefined` — "no change" — on both grant types.
 */

import { describe, it, expect } from 'vitest';
import { trialTokenExchange } from '../../../src/oauth/token-exchange';

const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const at = (s: number) => new Date(NOW + s * 1000).toISOString();
const roster = { keyOwner: 'OAUTH:RP', userId: 'RP', scopes: ['tool:*'], authKind: 'oauth' };

describe('trialTokenExchange', () => {
  it('returns undefined for grants without expiresAt on both grant types (regression guard)', () => {
    expect(
      trialTokenExchange({ grantType: 'authorization_code', props: roster }, NOW)
    ).toBeUndefined();
    expect(trialTokenExchange({ grantType: 'refresh_token', props: roster }, NOW)).toBeUndefined();
    expect(
      trialTokenExchange({ grantType: 'refresh_token', props: undefined }, NOW)
    ).toBeUndefined();
    expect(
      trialTokenExchange({ grantType: 'refresh_token', props: { expiresAt: 'garbage' } }, NOW)
    ).toBeUndefined();
  });

  it('authorization_code: refresh TTL = seconds remaining, access TTL capped at 3600', () => {
    const props = { ...roster, expiresAt: at(72 * 3600) };
    expect(trialTokenExchange({ grantType: 'authorization_code', props }, NOW)).toEqual({
      accessTokenTTL: 3600,
      refreshTokenTTL: 72 * 3600,
    });
  });

  it('authorization_code near expiry: both TTLs shrink to the remaining seconds', () => {
    const props = { ...roster, expiresAt: at(90) };
    expect(trialTokenExchange({ grantType: 'authorization_code', props }, NOW)).toEqual({
      accessTokenTTL: 90,
      refreshTokenTTL: 90,
    });
  });

  it('floors at 60s (the library minimum) even when already past expiry', () => {
    const props = { ...roster, expiresAt: at(-5) };
    expect(trialTokenExchange({ grantType: 'authorization_code', props }, NOW)).toEqual({
      accessTokenTTL: 60,
      refreshTokenTTL: 60,
    });
  });

  it('refresh_token: clamps the access TTL and NEVER returns refreshTokenTTL (400 in 0.10.3)', () => {
    const props = { ...roster, expiresAt: at(1800) };
    const out = trialTokenExchange({ grantType: 'refresh_token', props }, NOW);
    expect(out).toEqual({ accessTokenTTL: 1800 });
    expect(out).not.toHaveProperty('refreshTokenTTL');
  });

  it('unknown grant types are left alone', () => {
    const props = { ...roster, expiresAt: at(1800) };
    expect(
      trialTokenExchange({ grantType: 'urn:ietf:params:oauth:grant-type:jwt-bearer', props }, NOW)
    ).toBeUndefined();
  });
});
