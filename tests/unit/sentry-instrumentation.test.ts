/**
 * Sentry Instrumentation Tests
 *
 * Static analysis tests that verify Sentry error capture is properly
 * wired up across the codebase, and that the client config follows
 * the privacy-first policy established in Phase 7.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(filePath), 'utf-8');
}

function countMatches(src: string, pattern: RegExp): number {
  return (src.match(pattern) || []).length;
}

describe('Sentry Client Config (privacy-first policy)', () => {
  const config = readSrc('sentry.client.config.ts');

  it('should disable Sentry in development', () => {
    expect(config).toContain('enabled: import.meta.env.PROD');
  });

  it('should not send PII', () => {
    expect(config).toContain('sendDefaultPii: false');
  });

  it('should disable performance tracing', () => {
    expect(config).toContain('tracesSampleRate: 0');
  });

  it('should disable general session replay', () => {
    expect(config).toContain('replaysSessionSampleRate: 0');
  });

  it('should enable error-only session replay', () => {
    expect(config).toContain('replaysOnErrorSampleRate: 1.0');
  });

  it('should include beforeSend noise filter', () => {
    expect(config).toContain('beforeSend');
    expect(config).toContain('ResizeObserver loop');
    expect(config).toContain('SecurityError');
  });

  it('should include replay integration', () => {
    expect(config).toContain('replayIntegration');
  });
});

// Server-side Sentry instrumentation describe block removed in
// BL-032.8 Phase B (2026-05-17): the Inoreader client (`src/lib/inoreader/
// client.ts`) and its dev-mode cache (`src/lib/inoreader/cache.ts`) were
// deleted as part of the website's retirement from being a parallel
// Inoreader caller. Server-side Sentry instrumentation now lives in the
// MCP Worker repo (mcp-server/src/observability/sentry.ts + the radar /
// OAuth modules), which has its own test suite under mcp-server/tests/.

describe('Client-side Sentry instrumentation', () => {
  describe('palette-manager', () => {
    const src = readSrc('src/scripts/palette-manager.ts');

    it('should import Sentry', () => {
      expect(src).toContain("import * as Sentry from '@sentry/browser'");
    });

    it('should have ≥3 addBreadcrumb calls for localStorage failures', () => {
      const captures = countMatches(src, /Sentry\.addBreadcrumb/g);
      expect(captures).toBeGreaterThanOrEqual(3);
    });

    it('should tag palette-manager breadcrumbs', () => {
      expect(src).toContain("category: 'palette-manager'");
    });
  });

  describe('techpar chart', () => {
    const src = readSrc('src/utils/techpar/chart.ts');

    it('should import Sentry', () => {
      expect(src).toContain("import * as Sentry from '@sentry/browser'");
    });

    it('should have ≥2 captureException calls for chart rendering', () => {
      const captures = countMatches(src, /Sentry\.captureException/g);
      expect(captures).toBeGreaterThanOrEqual(2);
    });

    it('should tag techpar-calculation errors', () => {
      expect(src).toContain("area: 'techpar-calculation'");
    });
  });
});
