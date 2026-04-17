import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECURITY_HEADERS } from '@/middleware';

/**
 * Parses vercel.json and extracts the header key-value pairs
 * from the catch-all source pattern.
 */
function getVercelHeaders(): Record<string, string> {
  const raw = readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8');
  const config = JSON.parse(raw);
  const catchAll = config.headers.find((h: { source: string }) => h.source === '/(.*)');
  const map: Record<string, string> = {};
  for (const { key, value } of catchAll.headers) {
    map[key] = value;
  }
  return map;
}

describe('Security Headers', () => {
  describe('middleware SECURITY_HEADERS', () => {
    it('should include all required security headers', () => {
      const required = [
        'X-Frame-Options',
        'X-Content-Type-Options',
        'Referrer-Policy',
        'Permissions-Policy',
        'Strict-Transport-Security',
        'Content-Security-Policy',
      ];

      for (const header of required) {
        expect(SECURITY_HEADERS).toHaveProperty(header);
      }
    });

    it('should deny framing', () => {
      expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    });

    it('should prevent MIME sniffing', () => {
      expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    });

    it('CSP should include required directives', () => {
      const csp = SECURITY_HEADERS['Content-Security-Policy'];
      const directives = [
        "default-src 'none'",
        'script-src',
        'connect-src',
        'style-src',
        'img-src',
        'font-src',
        'frame-ancestors',
        'upgrade-insecure-requests',
      ];

      for (const directive of directives) {
        expect(csp).toContain(directive);
      }
    });

    it('CSP should allow Google Analytics', () => {
      const csp = SECURITY_HEADERS['Content-Security-Policy'];
      expect(csp).toContain('https://www.googletagmanager.com');
      expect(csp).toContain('https://www.google-analytics.com');
    });

    it('CSP should allow Sentry error reporting', () => {
      const csp = SECURITY_HEADERS['Content-Security-Policy'];
      expect(csp).toContain('https://*.ingest.sentry.io');
    });

    it('CSP should allow Vercel analytics', () => {
      const csp = SECURITY_HEADERS['Content-Security-Policy'];
      expect(csp).toContain('https://va.vercel-scripts.com');
      expect(csp).toContain('https://vitals.vercel-insights.com');
    });
  });

  describe('vercel.json and middleware stay in sync', () => {
    it('should have the same header keys', () => {
      const vercelHeaders = getVercelHeaders();
      const middlewareKeys = Object.keys(SECURITY_HEADERS).sort();
      const vercelKeys = Object.keys(vercelHeaders).sort();

      expect(middlewareKeys).toEqual(vercelKeys);
    });

    it('should have identical header values', () => {
      const vercelHeaders = getVercelHeaders();

      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        expect(vercelHeaders[key]).toBe(value);
      }
    });
  });
});
