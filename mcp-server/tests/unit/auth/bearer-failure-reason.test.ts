/**
 * Tests for the bearer-auth → Sentry-capture decision.
 *
 * Behavior under test: for each shape of bearer-auth failure, decide
 * whether the Worker should capture a Sentry event. The decision is
 * driven by an internal `reason` taxonomy on `AuthFailure`; the visible
 * contract is "probe-class failures stay silent; actionable failures
 * fire Sentry." Tests compose `authenticate()` with the
 * `shouldCaptureAuthFailure()` predicate so a future renaming of the
 * internal reason strings won't break the suite — only a change to the
 * gating decision itself would.
 *
 * The full bearer-auth behavior (header parsing, 401 envelope shape,
 * key matching) is covered by `tests/integration/auth.test.ts`; this
 * file scopes strictly to the gating decision.
 */

import { describe, it, expect } from 'vitest';
import {
  authenticate,
  shouldCaptureAuthFailure,
  type AuthFailureReason,
} from '../../../src/auth/bearer';

function makeRequest(authHeader: string | null): Request {
  const headers = new Headers();
  if (authHeader !== null) headers.set('Authorization', authHeader);
  return new Request('https://example.test/mcp', { method: 'POST', headers });
}

/**
 * Drive `authenticate()` against the given headers + env, then ask the
 * gating predicate whether the resulting failure should fire Sentry.
 * Throws if the auth succeeds — every test in this file expects a 401.
 */
function captureDecisionForAuth(authHeader: string | null, env: Record<string, unknown>): boolean {
  const result = authenticate(makeRequest(authHeader), env);
  if (result.ok) throw new Error('test setup expected an AuthFailure but got AuthSuccess');
  return shouldCaptureAuthFailure(result.reason);
}

describe('auth-failure → Sentry capture decision', () => {
  const env = { MCP_KEY_RP: 'good-token' };

  // Probe-class failures: bot probes don't send Authorization headers,
  // or send them malformed. These shouldn't burn Sentry quota — they
  // get logged via `safeLog` for forensics but stay off Sentry.

  it('requests with no Authorization header stay off Sentry', () => {
    expect(captureDecisionForAuth(null, env)).toBe(false);
  });

  it('requests with bare "Bearer " (no token) stay off Sentry', () => {
    expect(captureDecisionForAuth('Bearer ', env)).toBe(false);
  });

  it('requests with whitespace-only token after Bearer stay off Sentry', () => {
    expect(captureDecisionForAuth('Bearer    ', env)).toBe(false);
  });

  it('requests with a non-Bearer scheme stay off Sentry', () => {
    expect(captureDecisionForAuth('Basic abc123', env)).toBe(false);
  });

  // Actionable failures: a well-formed bearer that doesn't match any key
  // is almost always a real client with stale config — exactly the case
  // we want operators to see. A malformed `_SCOPES` companion env var is
  // an operator-side error that should fail loud.

  it('requests with a well-formed but unrecognized bearer fire Sentry', () => {
    expect(captureDecisionForAuth('Bearer wrong-token', env)).toBe(true);
  });

  it('requests matching a key whose _SCOPES JSON is malformed fire Sentry', () => {
    const envWithBadScopes = {
      MCP_KEY_RP: 'good-token',
      MCP_KEY_RP_SCOPES: 'not-valid-json',
    };
    expect(captureDecisionForAuth('Bearer good-token', envWithBadScopes)).toBe(true);
  });
});

describe('AuthFailureReason — exhaustiveness guard', () => {
  // The `Record<AuthFailureReason, boolean>` shape below is a
  // compile-time guard: if a new reason is added to the union without
  // an explicit Sentry-capture decision here, this file fails to
  // typecheck (the Record literal becomes incomplete). That's the real
  // regression net — the runtime expect() below is a belt-and-suspenders
  // cross-check that the predicate's source-of-truth agrees with the
  // explicit map.
  it('every reason has an explicit capture decision', () => {
    const captureDecisions: Record<AuthFailureReason, boolean> = {
      'missing-header': false,
      'empty-token': false,
      'bad-scheme': false,
      'invalid-token': true,
      'malformed-scopes': true,
    };
    for (const [reason, expected] of Object.entries(captureDecisions) as Array<
      [AuthFailureReason, boolean]
    >) {
      expect(shouldCaptureAuthFailure(reason)).toBe(expected);
    }
  });
});
