/**
 * BL-152 — the version fallback is load-bearing (stdio, wrangler dev, every
 * test, and `initialize`'s `serverInfo`), so it is pinned to `package.json`
 * here: a release bump that touches one file and not the other fails CI.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FALLBACK_VERSION, resolveVersion } from '../../src/version';

describe('version', () => {
  it('FALLBACK_VERSION equals package.json version', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')) as {
      version: string;
    };
    expect(FALLBACK_VERSION).toBe(pkg.version);
  });

  it('resolveVersion prefers the deploy-injected env var', () => {
    expect(resolveVersion({ VERSION: '9.9.9' })).toBe('9.9.9');
    expect(resolveVersion({})).toBe(FALLBACK_VERSION);
    expect(resolveVersion()).toBe(FALLBACK_VERSION);
  });
});
