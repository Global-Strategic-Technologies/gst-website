/**
 * `POST /trial/signup` — self-serve 3-day trial mint (BL-155 Slice 2).
 *
 * The first endpoint on this Worker that mints a credential for a STRANGER
 * with no operator and no payment in the loop. Three properties follow, and
 * this module exists to hold them rather than discover them:
 *
 * 1. FAIL CLOSED, EVERYWHERE. Every neighbouring Upstash primitive in this
 *    Worker fails open (`single-flight-lock.acquire`, `createLimiter`, the
 *    alert cooldown) because for them Upstash is a throttle, not a gate.
 *    Here Upstash IS the anti-farming gate, so an unbound client, a throw,
 *    an unbound KV, a missing secret, or a Turnstile call that errors or
 *    hangs is a 503 with NOTHING minted. Copied from the one prior precedent
 *    (`admin/inoreader-reauth.ts`), not from the helpers.
 *
 * 2. ONE TRIAL PER IDENTITY. Identity = HMAC-SHA256(secret, full client IP)
 *    (`trialIdentityKey`; never logged, never truncated — a /24 bucket would
 *    let one office exhaust every visitor behind it). A two-phase lease on
 *    `mcp:trial:ident:<hmac>` (BL-133's idiom): SET NX a SHORT lease → mint
 *    only if won → overwrite with `minted:<clientId>` at the 30-day identity
 *    TTL → on failure DEL and 503. Branch on the VALUE when the SET loses:
 *    a live `lease` is a concurrent signup (409); `minted:<id>` is a repeat
 *    signup, which ROTATES the existing record's secret rather than refusing
 *    (§ Lost-credential recovery) while leaving `expiresAt` and the key's
 *    TTL alone, so re-issue can never extend a trial; an expired record is
 *    refused until the identity key lapses.
 *    Honest framing: an IP is a speed bump, not an identity control. The real
 *    containment is the trial tier's ceilings and the 72h expiry.
 *
 * 3. NOTHING WRITTEN BEFORE THE VISITOR IS PROVEN HUMAN. Order is
 *    limiter → Turnstile → lease → mint: the cheap local check first, the
 *    outbound call second, and the first write after both pass.
 *
 * Wire contract (Slice 3 builds to it):
 *   200 { credential: "<clientId>:<secret>", clientId, expiresAt, reissued,
 *         issuedAt? }            (issuedAt only on a re-issue: the prior mint)
 *   400 bad-request | 400 challenge-failed { retryable }
 *   403 trial-expired { issuedAt? }   (absent once the record has reaped)
 *   409 in-progress { retryAfterSeconds } | 429 rate-limited { retryAfterSeconds } (+ Retry-After)
 *   503 unavailable. All `{ error, message, ... }`, all `no-store`.
 * The credential string is exactly what the consent page accepts (Slice 2b).
 */

import type { KVNamespace } from '@cloudflare/workers-types';
import { Ratelimit } from '@upstash/ratelimit';
import { safeLog } from '../auth/safe-logger';
import { TRIAL_SCOPES } from '../auth/scopes';
import { hmacHex } from '../lib/hmac';
import { createMcpClient } from '../lib/upstash-clients';
import { AnalyticsEngineSink, emit } from '../metrics/_index';
import { createM2mClient, getM2mClient, rotateM2mSecret } from '../oauth/m2m-clients';
import { m2mKeyOwner, oauthKeyOwner } from '../oauth/key-owner';
import { TRIAL_IDENTITY_TTL_SECONDS, TRIAL_TTL_SECONDS } from '../ratelimit/tiers';
import { parseHostnames, verifyTurnstile } from './turnstile';
import type { Env } from '../env';

export const TRIAL_IDENTITY_KEY_PREFIX = 'mcp:trial:ident:';
/** Every trial record is named this — it is what makes `keyOwner` constant (`OAUTH:M2M:TRIAL`). */
export const TRIAL_CLIENT_NAME = 'trial';

/**
 * `OAUTH:M2M:TRIAL` — DERIVED, not written out. This file previously carried
 * the string as a literal in two places; a third copy for the metrics events
 * would have been the one that eventually drifted from what the auth path
 * actually computes for a trial record. Composed from the same two functions
 * `consent-identity.ts` composes (`oauthKeyOwner(keyOwnerFor(record))`, and
 * `keyOwnerFor` is `m2mKeyOwner(record.name)`), so the constant and the
 * per-request derivation cannot disagree — `signup.test.ts` asserts they don't.
 */
export const TRIAL_KEY_OWNER = oauthKeyOwner(m2mKeyOwner(TRIAL_CLIENT_NAME));

/** The canonical per-client analytics identity — see `MetricEvent.client_ref`. */
const clientRefFor = (clientId: string) => `OAUTH:${clientId}`;

/** Outcomes this handler can emit — the set is pinned in `OUTCOME_VALUES`. */
type SignupOutcome =
  | 'minted'
  | 'reissued'
  | 'challenge-failed'
  | 'rate-limited'
  | 'expired'
  | 'in-progress'
  | 'bad-request'
  | 'unavailable';

/**
 * One AE data point per signup outcome (BL-155). Before this, signup was
 * observable only through `safeLog` — i.e. only while a `wrangler tail` was
 * attached — so mint volume, failure rate and re-issue ratio had no answer
 * after the fact, and a signup path broken by an unbound secret was invisible.
 *
 * Best-effort by construction: `emit` validates through `guardEvent` and
 * `AnalyticsEngineSink.write` swallows substrate throws, so a metrics failure
 * can never turn a successful signup into an error. `env.METRICS` is unbound
 * in tests and on the stdio path, hence the guard.
 *
 * `keyOwner` is set on EVERY outcome including the failures, so signup volume
 * and failure rate are one indexed query rather than a scan. `client_ref` is
 * set only where a client actually exists (mint and re-issue) — that is what
 * lets a mint be joined to the usage it later produces.
 */
function emitSignup(
  env: Env,
  outcome: SignupOutcome,
  statusCode: number,
  startedAt: number,
  clientId?: string
): void {
  if (!env.METRICS) return;
  emit(new AnalyticsEngineSink(env.METRICS), {
    event_type: 'trial_signup',
    name: 'trial-signup',
    keyOwner: TRIAL_KEY_OWNER,
    outcome,
    status_code: String(statusCode),
    duration_ms: Date.now() - startedAt,
    ...(clientId ? { client_ref: clientRefFor(clientId) } : {}),
  });
}
/** Short: bounds the lockout a lost DEL can cause to minutes (BL-133 reasoning). */
const LEASE_TTL_SECONDS = 300;
const LEASE_VALUE = 'lease';
const MINTED_PREFIX = 'minted:';
const IP_LIMIT_PER_HOUR = 10;

/**
 * The identity derivation, named so it can be strengthened (e.g. fold in a
 * coarse UA class) without touching the handler.
 */
export async function trialIdentityKey(ip: string, secret: string): Promise<string> {
  return `${TRIAL_IDENTITY_KEY_PREFIX}${await hmacHex(secret, ip)}`;
}

function json(
  status: number,
  body: Record<string, unknown>,
  extra?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

/**
 * The single exit for eight distinct failure reasons. Takes `env` and the
 * handler-entry timestamp so the metrics event carries a real status and
 * duration — the alternative, a module-level mutable, would be wrong the
 * moment two requests overlap in one isolate.
 */
function unavailable(env: Env, startedAt: number, reason: string): Response {
  safeLog({ event: 'trial.signup.unavailable', reason, success: false, errorCode: 'unavailable' });
  emitSignup(env, 'unavailable', 503, startedAt);
  return json(503, { error: 'unavailable', message: 'Trial signup is temporarily unavailable.' });
}

export async function handleTrialSignup(request: Request, env: Env): Promise<Response> {
  const startedAt = Date.now();
  const fail = (reason: string) => unavailable(env, startedAt, reason);

  // --- Fail-closed guards: every dependency present, or nothing happens ----
  if (!env.OAUTH_KV) return fail('oauth-kv-unbound');
  if (!env.TURNSTILE_SECRET_KEY) return fail('turnstile-secret-unbound');
  if (!env.TRIAL_IP_HMAC_SECRET) return fail('ip-hmac-secret-unbound');
  const expectedHostnames = parseHostnames(env.TURNSTILE_EXPECTED_HOSTNAMES);
  if (expectedHostnames.length === 0) return fail('turnstile-hostnames-unbound');
  const redis = createMcpClient(env, { retry: false });
  if (!redis) return fail('upstash-unbound');
  const kv = env.OAUTH_KV;

  // --- Request shape -------------------------------------------------------
  let token: string | undefined;
  try {
    const body = (await request.json()) as { turnstileToken?: unknown };
    if (typeof body.turnstileToken === 'string' && body.turnstileToken.length <= 2048) {
      token = body.turnstileToken;
    }
  } catch {
    /* fall through to the 400 */
  }
  if (!token) {
    // Both 400s were silent in BOTH channels before BL-155's observability
    // pass — no log line and no metric, so a page sending a malformed body
    // looked identical to no traffic at all.
    safeLog({ event: 'trial.signup.bad-request', reason: 'token', success: false });
    emitSignup(env, 'bad-request', 400, startedAt);
    return json(400, {
      error: 'bad-request',
      message: 'Expected JSON { "turnstileToken": string }.',
    });
  }
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (!ip) {
    safeLog({ event: 'trial.signup.bad-request', reason: 'no-client-ip', success: false });
    emitSignup(env, 'bad-request', 400, startedAt);
    return json(400, { error: 'bad-request', message: 'Client address unavailable.' });
  }
  const identityKey = await trialIdentityKey(ip, env.TRIAL_IP_HMAC_SECRET);

  // --- 1. IP limiter (cheap, local) — null/throw are 503, never a skip -----
  try {
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(IP_LIMIT_PER_HOUR, '1 h'),
      prefix: 'mcp:ratelimit:trial:ip',
      analytics: false,
    });
    // Identifier is the bare HMAC; the limiter adds its own prefix.
    const rl = await limiter.limit(identityKey.slice(TRIAL_IDENTITY_KEY_PREFIX.length));
    if (!rl.success) {
      const retryAfter = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000));
      safeLog({ event: 'trial.signup.rate-limited', success: false, errorCode: 'rate-limit' });
      emitSignup(env, 'rate-limited', 429, startedAt);
      return json(
        429,
        {
          error: 'rate-limited',
          message: 'Too many signup attempts from this network. Try again later.',
          // Mirrors the header: `Retry-After` is not a CORS-exposed response
          // header, so the browser page can only read the wait from the body.
          retryAfterSeconds: retryAfter,
        },
        { 'Retry-After': String(retryAfter) }
      );
    }
  } catch (e) {
    return fail(`limiter: ${(e as Error).message}`);
  }

  // --- 2. Turnstile (the outbound call) ------------------------------------
  const verdict = await verifyTurnstile({
    secret: env.TURNSTILE_SECRET_KEY,
    token,
    remoteIp: ip,
    expectedHostnames,
  });
  if (!verdict.ok) {
    if (verdict.kind === 'unavailable') return fail(verdict.reason);
    safeLog({
      event: 'trial.signup.challenge-failed',
      reason: verdict.reason,
      success: false,
      errorCode: 'challenge-failed',
    });
    emitSignup(env, 'challenge-failed', 400, startedAt);
    return json(400, {
      error: 'challenge-failed',
      message: verdict.retryable
        ? 'The bot check did not complete. Please try again.'
        : 'The bot check was rejected.',
      retryable: verdict.retryable,
    });
  }

  // --- 3. Lease: SET NX a short lease, branch on the value if it loses -----
  let won: boolean;
  let existingClientId: string | undefined;
  try {
    won = (await redis.set(identityKey, LEASE_VALUE, { nx: true, ex: LEASE_TTL_SECONDS })) === 'OK';
    if (!won) {
      const current = await redis.get<string>(identityKey);
      if (current === null) {
        // Expired between the SET and the GET — one more try, then give up.
        won =
          (await redis.set(identityKey, LEASE_VALUE, { nx: true, ex: LEASE_TTL_SECONDS })) === 'OK';
      } else if (typeof current === 'string' && current.startsWith(MINTED_PREFIX)) {
        existingClientId = current.slice(MINTED_PREFIX.length);
      }
      if (!won && existingClientId === undefined) {
        safeLog({ event: 'trial.signup.in-progress', success: false, errorCode: 'in-progress' });
        emitSignup(env, 'in-progress', 409, startedAt);
        return json(
          409,
          {
            error: 'in-progress',
            message: 'A signup from this network is already in progress.',
            retryAfterSeconds: 5,
          },
          { 'Retry-After': '5' }
        );
      }
    }
  } catch (e) {
    return fail(`lease: ${(e as Error).message}`);
  }
  // Outside the lease block so a KV failure here is attributed to re-issue,
  // not to the lease, in `wrangler tail`.
  if (existingClientId !== undefined) {
    try {
      return await reissue(kv, existingClientId, env, startedAt);
    } catch (e) {
      return fail(`reissue: ${(e as Error).message}`);
    }
  }

  // --- 4. Mint — the lease is held; release it on any failure --------------
  try {
    const expiresAt = new Date(Date.now() + TRIAL_TTL_SECONDS * 1000).toISOString();
    const { record, clientSecret } = await createM2mClient(kv, {
      name: TRIAL_CLIENT_NAME,
      allowedScopes: [...TRIAL_SCOPES],
      tier: 'trial',
      expiresAt,
    });
    // Both fields are constructed explicitly above; assert them anyway — a
    // dropped field on this path degrades LOOSER and silently.
    if (record.tier !== 'trial' || record.expiresAt !== expiresAt) {
      throw new Error('minted record is not a bounded trial');
    }
    await redis.set(identityKey, `${MINTED_PREFIX}${record.clientId}`, {
      ex: TRIAL_IDENTITY_TTL_SECONDS,
    });
    safeLog({
      event: 'trial.signup.minted',
      keyOwner: TRIAL_KEY_OWNER,
      rateLimitSubject: clientRefFor(record.clientId),
      success: true,
    });
    emitSignup(env, 'minted', 200, startedAt, record.clientId);
    return json(200, {
      credential: `${record.clientId}:${clientSecret}`,
      clientId: record.clientId,
      expiresAt,
      reissued: false,
    });
  } catch (e) {
    try {
      await redis.del(identityKey);
    } catch {
      /* the short lease TTL is the safety net */
    }
    return fail(`mint: ${(e as Error).message}`);
  }
}

/**
 * Repeat signup inside the identity window: rotate the existing record's
 * secret. Reads the identity key, never writes it — its TTL stays where the
 * original mint put it, and `rotateM2mSecret` leaves `expiresAt` alone, so
 * a re-issue cannot slide the trial. An expired record is a refusal.
 */
async function reissue(
  kv: KVNamespace,
  clientId: string,
  env: Env,
  startedAt: number
): Promise<Response> {
  const rotated = await rotateM2mSecret(kv, clientId);
  if (!rotated) {
    safeLog({ event: 'trial.signup.expired', success: false, errorCode: 'trial-expired' });
    // The page tells the visitor WHEN their trial was issued. The record
    // outlives the identity key by ~3 days (reap = expiresAt + grace), so it is
    // usually still there; when it has been reaped the field is simply absent
    // and the page renders the dateless variant. A second read on a cold error
    // path is cheaper than widening `rotateM2mSecret`'s return shape.
    //
    // Its own try/catch, and the metric emitted only AFTER it: a throw here
    // used to propagate to the caller's `catch`, which turns it into `fail()` —
    // so one expired signup emitted TWO data points (`expired` AND
    // `unavailable`), inflating the failure count that the signup-health query
    // keys on. The refusal is already decided at this point; a failed lookup
    // only costs the visitor the issue date, so it must not change the outcome.
    let expired: Awaited<ReturnType<typeof getM2mClient>> = null;
    try {
      expired = await getM2mClient(kv, clientId);
    } catch {
      /* the dateless variant is the graceful degradation the page already renders */
    }
    // `client_ref` IS set here, unlike the other failures: the client exists,
    // it is simply past its expiry, and attributing the refusal to it is what
    // distinguishes "this trial came back" from "a stranger was refused".
    emitSignup(env, 'expired', 403, startedAt, clientId);
    return json(403, {
      error: 'trial-expired',
      message: 'A trial from this network has already ended. Contact GST to keep going.',
      ...(expired ? { issuedAt: expired.createdAt } : {}),
    });
  }
  safeLog({
    event: 'trial.signup.reissued',
    keyOwner: TRIAL_KEY_OWNER,
    rateLimitSubject: clientRefFor(rotated.record.clientId),
    success: true,
  });
  emitSignup(env, 'reissued', 200, startedAt, rotated.record.clientId);
  return json(200, {
    credential: `${rotated.record.clientId}:${rotated.clientSecret}`,
    clientId: rotated.record.clientId,
    expiresAt: rotated.record.expiresAt,
    reissued: true,
    // When the PREVIOUS secret was issued — the page names it in the
    // "your previous secret has stopped working" notice.
    issuedAt: rotated.record.createdAt,
  });
}
