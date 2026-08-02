/**
 * BL-093 slice 1 — helper unit tests for `scripts/provision-client.mjs`.
 *
 * Every exported helper is pure, so this file exercises them directly; the
 * side-effectful CLI path is covered by `provision-client-cli-smoke.test.ts`
 * under real Node. Nothing here touches the network or the admin API.
 */

import { describe, it, expect } from 'vitest';

import {
  ASSIGNABLE_TIERS,
  BASE_URLS,
  MINIMUM_SCOPES,
  RADAR_SCOPES,
  SUPPORTED_SCOPES,
  assertScopesValid,
  buildCreateBody,
  parseArgs,
  renderOnboardingEmail,
} from '../../../scripts/provision-client.mjs';

import { ASSIGNABLE_TIERS as SERVER_TIERS } from '../../../src/ratelimit/tiers';
import { DEFAULT_SCOPES } from '../../../src/auth/scopes';

const baseArgs = ['--name', 'Acme Capital', '--tier', 'free-pilot'];

describe('provision-client — constant parity with the server', () => {
  // The .mjs cannot import these TypeScript modules at runtime, so it carries
  // hand-written mirrors. These two assertions are the only thing stopping
  // them drifting — same role as `contract-parity.test.ts` for tool docs.
  it('mirrors ASSIGNABLE_TIERS from src/ratelimit/tiers.ts', () => {
    expect([...ASSIGNABLE_TIERS]).toEqual([...SERVER_TIERS]);
  });

  it('mirrors SCOPES_SUPPORTED from src/oauth/provider.ts', () => {
    // Composed from the leaf module rather than imported from provider.ts:
    // that module runs `new OAuthProvider({...})` at import time and pulls in
    // both request handlers. `SCOPES_SUPPORTED` is defined there as exactly
    // `[...DEFAULT_SCOPES, 'tool:radar:*']`, which is what we rebuild here.
    expect([...SUPPORTED_SCOPES]).toEqual([...DEFAULT_SCOPES, 'tool:radar:*']);
  });

  it('keeps the omit-scopes default free of every radar scope', () => {
    for (const scope of MINIMUM_SCOPES) {
      expect(RADAR_SCOPES).not.toContain(scope);
    }
    // …and the default must itself survive validation.
    expect(() => assertScopesValid([...MINIMUM_SCOPES])).not.toThrow();
  });
});

describe('provision-client — parseArgs', () => {
  it('parses the happy path and defaults env + scopes', () => {
    const args = parseArgs(baseArgs);
    expect(args.name).toBe('Acme Capital');
    expect(args.tier).toBe('free-pilot');
    expect(args.env).toBe('production');
    expect(args.scopes).toEqual([...MINIMUM_SCOPES]);
    expect(args.allowRadar).toBe(false);
    expect(args.dryRun).toBe(false);
  });

  it('requires --name', () => {
    expect(() => parseArgs(['--tier', 'paid'])).toThrow(/--name is required/);
  });

  it('requires --tier rather than inheriting the server default', () => {
    // The server would silently fall back to free-pilot; that is the whole
    // reason this flag is mandatory here.
    expect(() => parseArgs(['--name', 'Acme'])).toThrow(/--tier is required/);
  });

  it('rejects an unassignable tier', () => {
    expect(() => parseArgs(['--name', 'Acme', '--tier', 'internal'])).toThrow(
      /--tier must be one of/
    );
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs([...baseArgs, '--bogus'])).toThrow('Unknown argument: --bogus');
  });

  it('rejects an unknown --env', () => {
    expect(() => parseArgs([...baseArgs, '--env', 'dev'])).toThrow(/--env must be one of/);
  });

  it('accepts both real environments', () => {
    for (const env of Object.keys(BASE_URLS)) {
      expect(parseArgs([...baseArgs, '--env', env]).env).toBe(env);
    }
  });

  it('splits and trims a comma-separated --scopes list', () => {
    const args = parseArgs([...baseArgs, '--scopes', 'tool:*, resource:library:read ,']);
    expect(args.scopes).toEqual(['tool:*', 'resource:library:read']);
  });

  it('throws when --scopes parses to nothing', () => {
    expect(() => parseArgs([...baseArgs, '--scopes', ' , '])).toThrow(/empty after parsing/);
  });

  it('collects repeated --unsafe-scope values and rejects a missing value', () => {
    const args = parseArgs([
      ...baseArgs,
      '--unsafe-scope',
      'tool:a:*',
      '--unsafe-scope',
      'tool:b:*',
    ]);
    expect(args.unsafeScopes).toEqual(['tool:a:*', 'tool:b:*']);
    expect(() => parseArgs([...baseArgs, '--unsafe-scope', '--dry-run'])).toThrow(
      /--unsafe-scope requires a scope string value/
    );
  });

  it('sets the boolean flags', () => {
    const args = parseArgs([...baseArgs, '--allow-radar', '--dry-run']);
    expect(args.allowRadar).toBe(true);
    expect(args.dryRun).toBe(true);
  });
});

describe('provision-client — assertScopesValid', () => {
  it('accepts every advertised scope', () => {
    for (const scope of SUPPORTED_SCOPES) {
      expect(() => assertScopesValid([scope], { allowRadar: true })).not.toThrow();
    }
  });

  it('rejects a typo the admin API would have accepted silently', () => {
    expect(() => assertScopesValid(['tool:portfolo:*'])).toThrow(
      /Unknown scope\(s\): tool:portfolo:\*/
    );
  });

  it('accepts a deliberate narrowing via --unsafe-scope', () => {
    expect(() =>
      assertScopesValid(['tool:search_portfolio'], { unsafeScopes: ['tool:search_portfolio'] })
    ).not.toThrow();
  });

  it.each([...RADAR_SCOPES])('blocks %s without --allow-radar', (scope) => {
    expect(() => assertScopesValid([scope])).toThrow(/without --allow-radar/);
  });

  it.each([...RADAR_SCOPES])('permits %s with --allow-radar', (scope) => {
    expect(() => assertScopesValid([scope], { allowRadar: true })).not.toThrow();
  });

  it('checks the catalog before the radar flag, so a radar typo reads as a typo', () => {
    expect(() => assertScopesValid(['tool:radar:'], { allowRadar: true })).toThrow(/Unknown scope/);
  });
});

describe('provision-client — buildCreateBody', () => {
  it('produces the admin API body shape', () => {
    const body = buildCreateBody({
      name: 'Acme Capital',
      scopes: ['tool:*', 'resource:regulations:read'],
      tier: 'paid',
    });
    expect(body).toEqual({
      name: 'Acme Capital',
      allowedScopes: ['tool:*', 'resource:regulations:read'],
      tier: 'paid',
    });
    // `tier` must be present explicitly — an absent tier is exactly what the
    // server would resolve to free-pilot.
    expect(Object.keys(body)).toContain('tier');
  });

  it('copies the scope array rather than aliasing the caller list', () => {
    const scopes = ['tool:*'];
    const body = buildCreateBody({ name: 'Acme', scopes, tier: 'paid' });
    body.allowedScopes.push('mutated');
    expect(scopes).toEqual(['tool:*']);
  });
});

describe('provision-client — renderOnboardingEmail', () => {
  const email = renderOnboardingEmail({
    clientId: 'm2m_abc123',
    name: 'Acme Capital',
    tier: 'free-pilot',
    scopes: ['tool:*', 'resource:regulations:read'],
  });

  it('carries the client identity and endpoint', () => {
    expect(email).toContain('m2m_abc123');
    expect(email).toContain('Acme Capital');
    expect(email).toContain('free-pilot');
    expect(email).toContain(`${BASE_URLS.production}/mcp`);
  });

  it('carries the PILOT_ONBOARDING § 3 guarantees', () => {
    expect(email).toMatch(/hash-chained/i);
    expect(email).toMatch(/7-year retention/i);
    expect(email).toContain('status.mcp.globalstrategic.tech');
    expect(email).toMatch(/sandbox is not yet available/i);
  });

  it('frames limits as operational ceilings, never as a contracted SLA', () => {
    expect(email).toMatch(/not contracted quotas/i);
    expect(email).toMatch(/not a contracted service level/i);
    expect(email).not.toMatch(/\bSLA\b/);
  });

  it('cannot leak the client secret even when one is forced into the input', () => {
    // Design decision, not an accident: the secret exists only in the
    // creation response (`admin/oauth-clients.ts` stores just its hash), and
    // a mail-client draft would undo that. The CLI prints it separately,
    // once. This asserts the renderer ignores a secret rather than merely
    // that the caller happens not to pass one.
    const secret = 'sUpErSeCrEt-never-in-an-email';
    const rendered = renderOnboardingEmail({
      clientId: 'm2m_abc123',
      name: 'Acme',
      tier: 'paid',
      scopes: ['tool:*'],
      // @ts-expect-error — deliberately not part of the input contract.
      clientSecret: secret,
    });
    expect(rendered).not.toContain(secret);
    // The email may *mention* that a secret is coming; it must not carry one.
    expect(rendered).toMatch(/arrives separately over the secure channel/i);
  });

  it('honours the staging environment', () => {
    const staging = renderOnboardingEmail({
      clientId: 'm2m_abc123',
      name: 'Acme',
      tier: 'paid',
      scopes: ['tool:*'],
      env: 'staging',
    });
    expect(staging).toContain(`${BASE_URLS.staging}/mcp`);
  });
});
