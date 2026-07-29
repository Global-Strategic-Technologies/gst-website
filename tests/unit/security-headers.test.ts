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

  /**
   * The site-wide default forbids framing by EVERY origin, including this one.
   * `/brand/responsive-frame` exists only to be embedded in the brand page's
   * Responsive Behavior section, so it needs a narrowly-scoped relaxation to
   * `'self'` — without it the frames are blocked with ERR_BLOCKED_BY_RESPONSE
   * and render empty, with no build error to explain it.
   *
   * The route is prerendered, so production headers come from vercel.json (CDN)
   * while dev and any SSR path come from the middleware — both must carry the
   * exception, and neither may relax anything beyond `frame-ancestors`.
   */
  describe('same-origin framing exception for /brand/responsive-frame', () => {
    const FRAME_ROUTE = '/brand/responsive-frame(/?)';

    function getFrameRouteHeaders(): Record<string, string> {
      const raw = readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8');
      const config = JSON.parse(raw);
      const rule = config.headers.find((h: { source: string }) => h.source === FRAME_ROUTE);
      expect(rule, `vercel.json must carry a header rule for ${FRAME_ROUTE}`).toBeDefined();
      const map: Record<string, string> = {};
      for (const { key, value } of rule.headers) map[key] = value;
      return map;
    }

    it('vercel.json relaxes framing for the frame route only', () => {
      const frame = getFrameRouteHeaders();
      expect(frame['X-Frame-Options']).toBe('SAMEORIGIN');
      expect(frame['Content-Security-Policy']).toContain("frame-ancestors 'self'");
      expect(frame['Content-Security-Policy']).not.toContain("frame-ancestors 'none'");
    });

    it('the frame-route CSP differs from the site default ONLY in frame-ancestors', () => {
      const frame = getFrameRouteHeaders();
      const normalize = (csp: string) =>
        csp.replace(/frame-ancestors '(none|self)'/, 'frame-ancestors <X>');
      expect(normalize(frame['Content-Security-Policy'])).toBe(
        normalize(getVercelHeaders()['Content-Security-Policy'])
      );
    });

    it('the site-wide default still denies framing everywhere else', () => {
      expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
      expect(SECURITY_HEADERS['Content-Security-Policy']).toContain("frame-ancestors 'none'");
      expect(getVercelHeaders()['X-Frame-Options']).toBe('DENY');
    });

    it('middleware scopes the exception to exactly that one path', async () => {
      const src = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf-8');
      const listed = src.match(/SAME_ORIGIN_FRAMEABLE = new Set\(\[([^\]]*)\]\)/);
      expect(listed, 'middleware must declare SAME_ORIGIN_FRAMEABLE').not.toBeNull();
      const paths = [...listed![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      expect(paths).toEqual(['/brand/responsive-frame']);
    });
  });
});
