/**
 * Consent-page identity resolution (BL-155 Slice 2b).
 *
 * The consent form has ONE field. What is pasted into it is either an
 * operator-issued `MCP_KEY_*` value (the roster — a Worker env var,
 * matched by `matchToken`) or, since BL-155, a `<clientId>:<secret>` string
 * for an M2M client record in OAUTH_KV (a self-serve trial, or a pilot
 * client converted in place via PATCH). Same door, two identity sources.
 *
 * Rules that keep the two sources from leaking into each other:
 *   - Roster first. No existing operator flow changes shape.
 *   - A roster key that MATCHED but has a malformed `_SCOPES` companion is a
 *     configuration error, not "try KV next" — it fails here, as before.
 *   - KV path: fetch → verify secret → THEN check expiry. Mirrors
 *     `m2m-token.ts`: checking expiry before verification would let the
 *     form probe which client ids exist and when they lapse.
 *   - Every failure is the same `null`. The caller renders one message for
 *     all of them, so a submitted value never reveals which namespace it
 *     was looked up in.
 *
 * Attribution: `keyOwner` for a KV-backed identity is `OAUTH:` +
 * `keyOwnerFor(record)` — `OAUTH:M2M:TRIAL` for every trial (they are all
 * NAMED `trial`), `OAUTH:M2M:<NAME>` for a converted pilot — so the AE
 * index stays roster-sized (`key-owner.ts`). `userId` is the clientId,
 * because the library keys grants per user+client and a shared userId
 * would make each new trial supersede the previous one's grant; it never
 * reaches a log line. `rateLimitSubject` is per client so trials do not
 * share one global bucket (sliding-window keys self-reap).
 *
 * Deliberately imports nothing from the OAuth provider package, so it is
 * loadable in the node vitest pool.
 */

import type { KVNamespace } from '@cloudflare/workers-types';
import { matchToken } from '../auth/bearer';
import { oauthKeyOwner } from './key-owner';
import {
  getM2mClient,
  keyOwnerFor,
  splitClientCredential,
  verifyM2mSecret,
  M2M_CLIENT_ID_PREFIX,
} from './m2m-clients';

export interface ConsentIdentity {
  /** Grant owner as the library sees it. Roster: the key owner (`RP`); KV: the clientId. */
  userId: string;
  /** Bounded-cardinality attribution string carried on the grant props. */
  keyOwner: string;
  /** Delegation ceiling — the key's scopes or the record's `allowedScopes`. */
  scopes: readonly string[];
  /** Set only for KV-backed identities (`trial`, `free-pilot`, …). */
  tier?: string;
  /** Set only for time-boxed KV records; drives the grant's refresh TTL. */
  expiresAt?: string;
  /** Per-client limiter identifier; unset when `keyOwner` should be used. */
  rateLimitSubject?: string;
}

export async function resolveConsentIdentity(
  submitted: string,
  env: Record<string, unknown>,
  kv: KVNamespace | undefined
): Promise<ConsentIdentity | null> {
  const roster = matchToken(submitted, env);
  if (roster.ok) {
    return {
      userId: roster.keyOwner,
      keyOwner: oauthKeyOwner(roster.keyOwner),
      scopes: roster.scopes,
    };
  }
  // A roster key matched but its `_SCOPES` companion is malformed: operator
  // config error. Do not fall through — the value IS a roster key.
  if (roster.reason === 'malformed-scopes') return null;

  if (!kv) return null;
  const parts = splitClientCredential(submitted);
  if (!parts || !parts.clientId.startsWith(M2M_CLIENT_ID_PREFIX)) return null;

  const record = await getM2mClient(kv, parts.clientId);
  if (!record) return null;
  if (!(await verifyM2mSecret(record, parts.secret))) return null;
  // Expiry AFTER verification — never before (see module header).
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return null;

  return {
    userId: record.clientId,
    keyOwner: `OAUTH:${keyOwnerFor(record)}`,
    scopes: record.allowedScopes,
    tier: record.tier,
    ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    rateLimitSubject: `OAUTH:${record.clientId}`,
  };
}
