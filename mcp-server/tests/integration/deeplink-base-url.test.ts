/**
 * Asserts the HUB_BASE configuration default points at the production
 * origin and is overridable via the `GST_HUB_BASE` environment variable.
 * Catches dev-vs-prod URL leak in deploy builds.
 *
 * Uses `vi.resetModules()` between cases so each `import(...)` re-evaluates
 * the module against the current `process.env` rather than reusing the
 * cached module-load-time value.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import process from 'node:process';

const ORIGINAL_ENV = process.env.GST_HUB_BASE;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.GST_HUB_BASE;
  } else {
    process.env.GST_HUB_BASE = ORIGINAL_ENV;
  }
  vi.resetModules();
});

describe('HUB_BASE configuration', () => {
  it('defaults to the production origin when GST_HUB_BASE is unset', async () => {
    vi.resetModules();
    delete process.env.GST_HUB_BASE;
    const { HUB_BASE } = await import('../../src/config');
    expect(HUB_BASE).toBe('https://globalstrategic.tech');
  });

  it('honours the GST_HUB_BASE override when set', async () => {
    vi.resetModules();
    process.env.GST_HUB_BASE = 'http://localhost:4321';
    const { HUB_BASE } = await import('../../src/config');
    expect(HUB_BASE).toBe('http://localhost:4321');
  });
});
