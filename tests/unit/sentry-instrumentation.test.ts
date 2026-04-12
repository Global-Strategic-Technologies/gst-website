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

describe('Server-side Sentry instrumentation', () => {
  describe('Inoreader client', () => {
    const src = readSrc('src/lib/inoreader/client.ts');

    it('should import Sentry', () => {
      expect(src).toContain("import * as Sentry from '@sentry/node'");
    });

    it('should have ≥6 captureException or captureMessage calls', () => {
      const captures = countMatches(src, /Sentry\.(captureException|captureMessage)/g);
      expect(captures).toBeGreaterThanOrEqual(6);
    });

    it('should tag redis-connection errors', () => {
      expect(src).toContain("area: 'redis-connection'");
    });

    it('should tag inoreader-api errors', () => {
      expect(src).toContain("area: 'inoreader-api'");
    });
  });

  describe('Inoreader cache', () => {
    const src = readSrc('src/lib/inoreader/cache.ts');

    it('should import Sentry', () => {
      expect(src).toContain("import * as Sentry from '@sentry/node'");
    });

    it('should have ≥2 captureException calls', () => {
      const captures = countMatches(src, /Sentry\.captureException/g);
      expect(captures).toBeGreaterThanOrEqual(2);
    });

    it('should tag file-cache errors', () => {
      expect(src).toContain("area: 'file-cache'");
    });
  });
});

describe('Client-side Sentry instrumentation', () => {
  describe('palette-manager', () => {
    const src = readSrc('src/scripts/palette-manager.ts');

    it('should import Sentry', () => {
      expect(src).toContain("import * as Sentry from '@sentry/browser'");
    });

    it('should have ≥3 captureException calls for localStorage', () => {
      const captures = countMatches(src, /Sentry\.captureException/g);
      expect(captures).toBeGreaterThanOrEqual(3);
    });

    it('should tag palette-manager errors', () => {
      expect(src).toContain("area: 'palette-manager'");
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
