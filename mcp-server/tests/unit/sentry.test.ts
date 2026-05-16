/**
 * Unit tests for the Sentry observability wrapper (BL-032 T.E.11 / T.E.12).
 *
 * Mocks `@sentry/cloudflare` so we can verify the wrapper functions
 * forward to the SDK with the expected shape. No real Sentry calls;
 * no DSN required.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sentryCaptureException, sentryCaptureMessage, sentrySetTag } = vi.hoisted(() => ({
  sentryCaptureException: vi.fn(),
  sentryCaptureMessage: vi.fn(),
  sentrySetTag: vi.fn(),
}));

vi.mock('@sentry/cloudflare', () => ({
  captureException: sentryCaptureException,
  captureMessage: sentryCaptureMessage,
  setTag: sentrySetTag,
  withSentry: vi.fn(),
}));

import { captureException, captureMessage, tagRequest } from '../../src/observability/sentry';

beforeEach(() => {
  sentryCaptureException.mockReset();
  sentryCaptureMessage.mockReset();
  sentrySetTag.mockReset();
});

describe('captureMessage', () => {
  it('forwards a bare message at the default warning level', () => {
    captureMessage('auth.failed bearer-rejected');
    expect(sentryCaptureMessage).toHaveBeenCalledTimes(1);
    expect(sentryCaptureMessage).toHaveBeenCalledWith('auth.failed bearer-rejected', {
      level: 'warning',
    });
  });

  it('forwards level and extras when supplied', () => {
    captureMessage('inoreader-rate-limit', 'error', { status: 429, message: 'quota' });
    expect(sentryCaptureMessage).toHaveBeenCalledTimes(1);
    expect(sentryCaptureMessage).toHaveBeenCalledWith('inoreader-rate-limit', {
      level: 'error',
      extra: { status: 429, message: 'quota' },
    });
  });

  it('omits the extra field entirely when no context is passed', () => {
    captureMessage('plain', 'info');
    expect(sentryCaptureMessage).toHaveBeenCalledWith('plain', { level: 'info' });
    const callArgs = sentryCaptureMessage.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('extra');
  });

  it('sets event tag when eventTag argument is supplied (alert-rule filter parity)', () => {
    captureMessage(
      'auth.failed bearer-rejected',
      'warning',
      { path: '/mcp', status: 401 },
      'auth.failed'
    );
    expect(sentryCaptureMessage).toHaveBeenCalledWith('auth.failed bearer-rejected', {
      level: 'warning',
      extra: { path: '/mcp', status: 401 },
      tags: { event: 'auth.failed' },
    });
  });

  it('omits the tags field entirely when eventTag is not supplied', () => {
    captureMessage('plain', 'info', { foo: 'bar' });
    const callArgs = sentryCaptureMessage.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('tags');
  });

  it('supports eventTag together with no extras (tag only, no payload)', () => {
    captureMessage('inoreader-rate-limit', 'error', undefined, 'inoreader-rate-limit');
    expect(sentryCaptureMessage).toHaveBeenCalledWith('inoreader-rate-limit', {
      level: 'error',
      tags: { event: 'inoreader-rate-limit' },
    });
  });

  // T.Z.3 (BL-032.7) — extraTags surface structured diagnostic data
  // (e.g. Inoreader zone usage) as searchable Sentry facets.
  it('merges extraTags with eventTag; eventTag wins on the `event` key', () => {
    captureMessage('inoreader-rate-limit', 'error', undefined, 'inoreader-rate-limit', {
      'inoreader.zone1.usage': 100,
      'inoreader.zone1.limit': 100,
      'inoreader.reset_after_seconds': 14823,
      event: 'should-be-overridden-by-eventTag-arg',
    });
    expect(sentryCaptureMessage).toHaveBeenCalledWith('inoreader-rate-limit', {
      level: 'error',
      tags: {
        'inoreader.zone1.usage': 100,
        'inoreader.zone1.limit': 100,
        'inoreader.reset_after_seconds': 14823,
        event: 'inoreader-rate-limit',
      },
    });
  });

  it('drops undefined values from extraTags (so they do not become "undefined" strings)', () => {
    captureMessage('inoreader-rate-limit', 'error', undefined, 'inoreader-rate-limit', {
      'inoreader.zone1.usage': 100,
      'inoreader.zone2.usage': undefined,
      'inoreader.reset_after_seconds': undefined,
    });
    const callArgs = sentryCaptureMessage.mock.calls.at(-1)?.[1] as {
      tags: Record<string, unknown>;
    };
    expect(callArgs.tags).toEqual({
      'inoreader.zone1.usage': 100,
      event: 'inoreader-rate-limit',
    });
    expect(callArgs.tags).not.toHaveProperty('inoreader.zone2.usage');
    expect(callArgs.tags).not.toHaveProperty('inoreader.reset_after_seconds');
  });
});

describe('captureException', () => {
  it('forwards an error without extras', () => {
    const err = new Error('boom');
    captureException(err);
    expect(sentryCaptureException).toHaveBeenCalledWith(err, undefined);
  });

  it('forwards extras when supplied', () => {
    const err = new Error('boom');
    captureException(err, { keyOwner: 'RP' });
    expect(sentryCaptureException).toHaveBeenCalledWith(err, { extra: { keyOwner: 'RP' } });
  });
});

describe('tagRequest', () => {
  it('sets keyOwner and path tags', () => {
    tagRequest('RP', '/mcp');
    expect(sentrySetTag).toHaveBeenCalledWith('keyOwner', 'RP');
    expect(sentrySetTag).toHaveBeenCalledWith('path', '/mcp');
  });

  it('falls back to unauthenticated when keyOwner is missing', () => {
    tagRequest(undefined, '/sitemap.xml');
    expect(sentrySetTag).toHaveBeenCalledWith('keyOwner', 'unauthenticated');
    expect(sentrySetTag).toHaveBeenCalledWith('path', '/sitemap.xml');
  });
});
