/**
 * Unit tests for the direct Sentry envelope POST helpers (BL-032.76).
 *
 * These exercise the helpers in isolation — no `@sentry/cloudflare` SDK
 * is loaded, no Workers runtime; just `fetch` mocked at the global level
 * to inspect the envelope shape.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseDsn,
  postSentryEvent,
  postSentryCheckIn,
  captureMessageEnvelope,
} from '../../../src/observability/sentry-envelope';
import type { Env } from '../../../src/worker';

const FAKE_DSN =
  'https://18b0d78cb4cbff2cbee5da2ae86c3e5e@o4511195716386816.ingest.us.sentry.io/4511343962357760';
const env = {
  SENTRY_DSN: FAKE_DSN,
  UPSTASH_MCP_REST_URL: 'https://mcp.upstash.io',
  UPSTASH_MCP_REST_TOKEN: 'token',
} as unknown as Env;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('parseDsn', () => {
  it('parses a valid DSN into host / projectId / publicKey', () => {
    expect(parseDsn(FAKE_DSN)).toEqual({
      publicKey: '18b0d78cb4cbff2cbee5da2ae86c3e5e',
      host: 'o4511195716386816.ingest.us.sentry.io',
      projectId: '4511343962357760',
    });
  });

  it('returns null for undefined', () => {
    expect(parseDsn(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    // Distinct from undefined — wrangler can bind a secret to '' and we
    // must short-circuit identically rather than pass the empty key
    // through to fetch.
    expect(parseDsn('')).toBeNull();
  });

  it('returns null for malformed input (missing scheme)', () => {
    expect(parseDsn('foo@example.com/123')).toBeNull();
  });

  it('returns null when project id is non-numeric', () => {
    expect(parseDsn('https://abc@host/notanumber')).toBeNull();
  });

  it('returns null when a path suffix follows the project id', () => {
    expect(parseDsn('https://abc@host/123/extra')).toBeNull();
  });
});

describe('postSentryEvent', () => {
  it('POSTs an envelope to /api/<projectId>/envelope/ with correct headers + body shape', async () => {
    await postSentryEvent(env, {
      level: 'error',
      message: 'cron.radar-refresh.error: boom',
      tags: { event: 'cron.scheduled', cron: '0 */6 * * *' },
      extra: { source: 'cron.scheduled' },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(
      'https://o4511195716386816.ingest.us.sentry.io/api/4511343962357760/envelope/'
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': expect.stringContaining(
        'Sentry sentry_version=7,sentry_key=18b0d78cb4cbff2cbee5da2ae86c3e5e,sentry_client='
      ),
    });

    const parts = (init.body as string).split('\n');
    expect(parts).toHaveLength(3);
    const [headerRaw, itemHeaderRaw, payloadRaw] = parts;
    const header = JSON.parse(headerRaw);
    const itemHeader = JSON.parse(itemHeaderRaw);
    const payload = JSON.parse(payloadRaw);
    expect(header).toMatchObject({
      event_id: expect.stringMatching(/^[a-f0-9]{32}$/),
      sent_at: expect.any(String),
    });
    expect(itemHeader).toEqual({ type: 'event' });
    expect(payload).toMatchObject({
      event_id: header.event_id,
      platform: 'javascript',
      level: 'error',
      message: 'cron.radar-refresh.error: boom',
      tags: { event: 'cron.scheduled', cron: '0 */6 * * *' },
      extra: { source: 'cron.scheduled' },
    });
    // Default env has no SENTRY_RELEASE — must not surface a stray
    // `release: undefined` field that would be sent to Sentry as the
    // literal string "undefined".
    expect(payload).not.toHaveProperty('release');
  });

  it('includes release when SENTRY_RELEASE is bound', async () => {
    const envWithRelease = { ...env, SENTRY_RELEASE: 'abc1234' } as unknown as Env;
    await postSentryEvent(envWithRelease, { level: 'info', message: 'hi' });

    const payload = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(payload.release).toBe('abc1234');
  });

  it('does NOT POST when SENTRY_DSN is unbound', async () => {
    await postSentryEvent({} as Env, { level: 'info', message: 'hi' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows fetch rejections without throwing', async () => {
    fetchSpy.mockRejectedValue(new Error('network unreachable'));
    await expect(
      postSentryEvent(env, { level: 'error', message: 'should not throw' })
    ).resolves.toBeUndefined();
  });

  it('aborts after the 2000ms timeout when Sentry hangs', async () => {
    // Construct a fetch that never resolves naturally — it must be
    // aborted by the helper's AbortController.
    let abortedSignal: AbortSignal | undefined;
    fetchSpy.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          abortedSignal = init.signal!;
          init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    vi.useFakeTimers();
    const pending = postSentryEvent(env, { level: 'error', message: 'slow ingest' });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBeUndefined();
    expect(abortedSignal!.aborted).toBe(true);
  });
});

describe('postSentryCheckIn', () => {
  it('in_progress check-in includes monitor_config and returns a fresh id', async () => {
    const id = await postSentryCheckIn(env, 'radar-refresh', 'in_progress', '0 */6 * * *');

    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const parts = (fetchSpy.mock.calls[0]![1].body as string).split('\n');
    expect(JSON.parse(parts[1])).toEqual({ type: 'check_in' });
    const checkIn = JSON.parse(parts[2]);
    expect(checkIn).toMatchObject({
      check_in_id: id,
      monitor_slug: 'radar-refresh',
      status: 'in_progress',
      monitor_config: {
        schedule: { type: 'crontab', value: '0 */6 * * *' },
        timezone: 'UTC',
      },
    });
  });

  it('ok check-in REUSES the passed checkInId and OMITS monitor_config', async () => {
    const id = 'a'.repeat(32);
    const returned = await postSentryCheckIn(env, 'radar-refresh', 'ok', '0 */6 * * *', id);

    expect(returned).toBe(id);
    const checkIn = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(checkIn).toMatchObject({
      check_in_id: id,
      monitor_slug: 'radar-refresh',
      status: 'ok',
    });
    expect(checkIn).not.toHaveProperty('monitor_config');
  });

  it('error check-in REUSES the passed checkInId and OMITS monitor_config', async () => {
    const id = 'b'.repeat(32);
    await postSentryCheckIn(env, 'radar-refresh', 'error', '0 */6 * * *', id);

    const checkIn = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(checkIn).toMatchObject({ check_in_id: id, status: 'error' });
    expect(checkIn).not.toHaveProperty('monitor_config');
  });

  it('returns undefined and does NOT POST when SENTRY_DSN is unbound', async () => {
    const returned = await postSentryCheckIn(
      {} as Env,
      'radar-refresh',
      'in_progress',
      '0 */6 * * *'
    );
    expect(returned).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows fetch rejections without throwing', async () => {
    fetchSpy.mockRejectedValue(new Error('network'));
    await expect(
      postSentryCheckIn(env, 'radar-refresh', 'ok', '0 */6 * * *', 'c'.repeat(32))
    ).resolves.toBe('c'.repeat(32));
  });
});

describe('captureMessageEnvelope (shim for shared-module callers)', () => {
  it('forwards tags + extras to postSentryEvent envelope shape', async () => {
    await captureMessageEnvelope(
      env,
      'inoreader-rate-limit',
      'error',
      { status: 429, source: 'cron-wire' },
      'inoreader-rate-limit',
      { 'inoreader.source': 'cron-wire', 'inoreader.zone1.usage': 100 }
    );

    const payload = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(payload).toMatchObject({
      level: 'error',
      message: 'inoreader-rate-limit',
      extra: { status: 429, source: 'cron-wire' },
      tags: {
        event: 'inoreader-rate-limit',
        'inoreader.source': 'cron-wire',
        'inoreader.zone1.usage': 100,
      },
    });
  });

  it('drops undefined-valued extraTags so they do not surface as the literal string "undefined"', async () => {
    await captureMessageEnvelope(env, 'm', 'warning', undefined, 'tag', {
      keep: 'yes',
      drop: undefined,
    });

    const payload = JSON.parse((fetchSpy.mock.calls[0]![1].body as string).split('\n')[2]);
    expect(payload.tags).toEqual({ event: 'tag', keep: 'yes' });
    expect(payload.tags).not.toHaveProperty('drop');
  });

  it('does NOT POST when SENTRY_DSN is unbound', async () => {
    await captureMessageEnvelope({} as Env, 'm', 'info');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
