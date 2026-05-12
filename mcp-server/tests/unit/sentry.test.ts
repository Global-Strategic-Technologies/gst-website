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
