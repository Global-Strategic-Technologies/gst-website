/**
 * Direct Sentry envelope POSTs — bypasses `@sentry/cloudflare` for paths
 * where the SDK's auto-instrumentation introduces unhandled-promise
 * rejections into `ctx.waitUntil`.
 *
 * Why this exists (BL-032.76, 2026-05-26 incident): the SDK's
 * `wrapScheduledHandler` queues its own `ctx.waitUntil(flushAndDispose
 * (client))` outside any try/catch we control. Something in that queued
 * promise rejects under Workers-runtime conditions, producing Cloudflare
 * `Exception Thrown` on every cron firing while the underlying work
 * succeeds. Three in-tree fix attempts (Phase B Day-3 flush, withMonitor
 * layering, outer try/catch around the IIFE) did not resolve the
 * symptom. Upstream check (getsentry/sentry-javascript) surfaced no
 * documented workaround and no config flag to disable the scheduled-
 * handler wrap.
 *
 * The fix is structural: stop wrapping `scheduled` with `withSentry`
 * (`worker.ts` default export splits to `{ fetch: withSentry(...).fetch,
 * scheduled: handler.scheduled }`), and inside the cron path use these
 * direct envelope POSTs instead of the SDK's `captureMessage` /
 * `withMonitor` / `flushSentry`.
 *
 * Modeled on the PowerShell envelope test that proved transport health
 * on 2026-05-26 (Sentry event_id `7a22ca8212983f1d0b58a54e4f283841`
 * landed in the mcp-server project within ~1 min of the POST).
 *
 * Pure `fetch()` — no SDK import, no auto-queued `ctx.waitUntil`, no
 * isolation-scope wrapping. Used by cron paths and any future background
 * surface where SDK lifecycle conflicts with Workers semantics.
 *
 * **Best-effort contract**: every export here is wrapped to never throw.
 * A 2000ms `AbortController` timeout bounds each POST so a slow Sentry
 * ingest cannot extend `ctx.waitUntil` past its budget.
 */

import { safeLog } from '../auth/safe-logger';
import type { Env } from '../worker';

interface ParsedDsn {
  readonly host: string;
  readonly projectId: string;
  readonly publicKey: string;
}

const SENTRY_CLIENT = 'mcp-server-manual/0.1.0';
const ENVELOPE_TIMEOUT_MS = 2000;

export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null;
  const m = dsn.match(/^https:\/\/([a-f0-9]+)@([^/]+)\/(\d+)$/);
  return m ? { publicKey: m[1], host: m[2], projectId: m[3] } : null;
}

function envelopeAuthHeader(publicKey: string): string {
  return `Sentry sentry_version=7,sentry_key=${publicKey},sentry_client=${SENTRY_CLIENT}`;
}

/**
 * 32-char lowercase hex event id. Workers runtime exposes
 * `crypto.randomUUID()` natively; strip dashes to match Sentry's
 * documented event_id shape.
 */
function randomEventId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

async function postEnvelope(dsn: ParsedDsn, body: string): Promise<void> {
  // BL-032.77 — diagnose Sentry-side envelope failures (missing-check-in
  // alerts that don't match Cloudflare-side success). Three failure modes
  // get distinct `safeLog` lines so a `wrangler tail` filter can attribute
  // each missed check-in or noise burst to its root cause:
  //
  //   1. `sentry.envelope.post.non-2xx` — Sentry rejected the envelope (429
  //      project rate limit, 503 transient, etc). Until this instrumentation
  //      shipped, these were silent — the success path returned cleanly even
  //      though Sentry never accepted the event. Suspected dominant cause
  //      of the "timeout check-in" false-positive alerts.
  //   2. `sentry.envelope.post.aborted` — local 2s timeout tripped before
  //      response arrived. Network/DNS hiccup or Sentry-side slow ingest.
  //   3. `sentry.envelope.post.network-error` — fetch itself threw (TLS,
  //      DNS NXDOMAIN, etc). Rarest path; included for completeness.
  //
  // All three paths still resolve the promise cleanly — best-effort
  // contract preserved; the caller's `ctx.waitUntil` is unaffected.
  const url = `https://${dsn.host}/api/${dsn.projectId}/envelope/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENVELOPE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': envelopeAuthHeader(dsn.publicKey),
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      safeLog({
        event: 'sentry.envelope.post.non-2xx',
        status: response.status,
        success: false,
        errorCode: 'sentry-envelope-non-2xx',
        reason: `host=${dsn.host} project=${dsn.projectId}`,
      });
    }
  } catch (err) {
    // AbortError when the controller fires; everything else is a genuine
    // network / TLS / DNS failure. Distinguish so the operator can tell
    // "Sentry is slow" from "we can't reach Sentry."
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    safeLog({
      event: isAbort ? 'sentry.envelope.post.aborted' : 'sentry.envelope.post.network-error',
      success: false,
      errorCode: isAbort ? 'sentry-envelope-abort' : 'sentry-envelope-network',
      reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send an event envelope. Best-effort — never throws.
 */
export async function postSentryEvent(
  env: Env,
  event: {
    level: 'info' | 'warning' | 'error';
    message: string;
    tags?: Record<string, string | number | boolean>;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  const dsn = parseDsn(env.SENTRY_DSN);
  if (!dsn) return;

  const eventId = randomEventId();
  const sentAt = new Date().toISOString();
  const eventBody: Record<string, unknown> = {
    event_id: eventId,
    timestamp: sentAt,
    platform: 'javascript',
    level: event.level,
    message: event.message,
  };
  if (event.tags && Object.keys(event.tags).length > 0) eventBody.tags = event.tags;
  if (event.extra && Object.keys(event.extra).length > 0) eventBody.extra = event.extra;
  if (env.SENTRY_RELEASE) eventBody.release = env.SENTRY_RELEASE;

  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: sentAt }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(eventBody),
  ].join('\n');

  await postEnvelope(dsn, envelope);
}

/**
 * Compatibility shim mirroring `observability/sentry.ts`'s `captureMessage`
 * signature, so cron-reachable shared modules (inoreader-oauth.ts,
 * inoreader-failure-handler.ts) can swap imports with a minimal diff and
 * preserve their existing tag / extra construction.
 *
 * Differences vs the SDK version:
 *   - Requires `env` (envelope POST needs `SENTRY_DSN`)
 *   - Async (caller should await so `ctx.waitUntil` keeps the isolate
 *     alive until the POST completes — same reason the scheduled
 *     handler awaits its check-ins)
 */
export async function captureMessageEnvelope(
  env: Env,
  message: string,
  level: 'info' | 'warning' | 'error' = 'warning',
  context?: Record<string, unknown>,
  eventTag?: string,
  extraTags?: Record<string, string | number | boolean | undefined>
): Promise<void> {
  const tags: Record<string, string | number | boolean> = {};
  if (extraTags) {
    for (const [k, v] of Object.entries(extraTags)) {
      if (v !== undefined) tags[k] = v;
    }
  }
  if (eventTag) tags.event = eventTag;

  await postSentryEvent(env, {
    level,
    message,
    ...(context ? { extra: context } : {}),
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
  });
}

/**
 * Send a Sentry Crons check-in. Status: 'in_progress' | 'ok' | 'error'.
 *
 * Pair an `in_progress` with a matching `ok`/`error` using the returned
 * `check_in_id` so Sentry's Crons UI shows the duration + outcome.
 *
 * `monitor_config` (schedule + timezone) is included ONLY on
 * `in_progress` per Sentry Crons spec — closing check-ins are matched
 * by `check_in_id` and including a config on them is wasted bytes and
 * has been observed to confuse the monitor-upsert path.
 *
 * Returns the `check_in_id` (generated UUID without dashes) for the
 * caller to thread through to the closing check-in. Returns `undefined`
 * when `SENTRY_DSN` is unbound.
 */
export async function postSentryCheckIn(
  env: Env,
  monitorSlug: string,
  status: 'in_progress' | 'ok' | 'error',
  schedule: string,
  checkInId?: string
): Promise<string | undefined> {
  const dsn = parseDsn(env.SENTRY_DSN);
  if (!dsn) return undefined;

  const id = checkInId ?? randomEventId();
  const sentAt = new Date().toISOString();
  const checkInBody: Record<string, unknown> = {
    check_in_id: id,
    monitor_slug: monitorSlug,
    status,
  };
  if (status === 'in_progress') {
    checkInBody.monitor_config = {
      schedule: { type: 'crontab', value: schedule },
      timezone: 'UTC',
    };
  }

  const envelope = [
    JSON.stringify({ event_id: id, sent_at: sentAt }),
    JSON.stringify({ type: 'check_in' }),
    JSON.stringify(checkInBody),
  ].join('\n');

  await postEnvelope(dsn, envelope);
  return id;
}
