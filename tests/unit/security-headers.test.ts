import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECURITY_HEADERS, onRequest } from '@/middleware';
import {
  RESPONSIVE_DEMO_GROUPS,
  responsiveFramePath,
  responsiveFrameRoute,
} from '@/utils/responsive-demo-groups';

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
   * The `/brand/responsive-frame/<group>` partials exist only to be embedded in
   * the brand page's Responsive Behavior section, so they need a narrowly-scoped
   * relaxation to `'self'` — without it the frames are blocked with
   * ERR_BLOCKED_BY_RESPONSE and render empty, with no build error to explain it.
   *
   * The routes are prerendered, so production headers come from vercel.json (CDN)
   * while dev and any SSR path come from the middleware — both must carry the
   * exception, and neither may relax anything beyond `frame-ancestors`.
   *
   * BL-097 moved these from one query-param route to four path routes. The
   * exception is ENUMERATED rather than prefix-matched, so an unknown group
   * under the same prefix stays strict.
   */
  describe('same-origin framing exception for /brand/responsive-frame/<group>', () => {
    const FRAME_ROUTE = '/brand/responsive-frame/:group(cards|tabs|form|shell)(/?)';

    /**
     * vercel.json cannot import RESPONSIVE_DEMO_GROUPS, so it is the one surface
     * that could silently disagree with the other three. Compose the expected
     * source from the constant rather than parsing the alternation out of it: an
     * added group that nobody added to the CDN rule fails here.
     */
    it('the vercel.json rule enumerates exactly the demo groups', () => {
      expect(FRAME_ROUTE).toBe(
        `/brand/responsive-frame/:group(${RESPONSIVE_DEMO_GROUPS.join('|')})(/?)`
      );
      const raw = readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8');
      const sources = JSON.parse(raw).headers.map((h: { source: string }) => h.source);
      expect(sources).toContain(FRAME_ROUTE);
    });

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

    /**
     * Ordering is load-bearing: Vercel applies every matching header rule in
     * array order, last write winning per key. Move this rule above the
     * catch-all and production silently reverts to DENY while dev still works.
     */
    it('the frame rule is ordered AFTER the catch-all (last match wins)', () => {
      const raw = readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8');
      const config = JSON.parse(raw);
      const sources = config.headers.map((h: { source: string }) => h.source);
      expect(sources.indexOf(FRAME_ROUTE)).toBeGreaterThan(sources.indexOf('/(.*)'));
    });

    // Behavior, not source text: invoking the real middleware is what proves the
    // exception works. A shape-only assertion stays green if the logic is deleted.
    const runMiddleware = async (pathname: string) => {
      const url = new URL(`http://localhost:4321${pathname}`);
      const res = await onRequest(
        { url, request: new Request(url) } as never,
        () => new Response('ok') as never
      );
      return res as Response;
    };

    it('middleware relaxes framing for every group route, both slash forms', async () => {
      // Built from BOTH builders on purpose: it covers the two slash forms and
      // exercises `responsiveFramePath`, whose only production caller is an
      // .astro component that vitest never instruments.
      const paths = RESPONSIVE_DEMO_GROUPS.flatMap((g) => [
        responsiveFrameRoute(g),
        responsiveFramePath(g),
      ]);
      expect(paths).toHaveLength(8);
      for (const path of paths) {
        const res = await runMiddleware(path);
        expect(res.headers.get('X-Frame-Options'), path).toBe('SAMEORIGIN');
        expect(res.headers.get('Content-Security-Policy'), path).toContain(
          "frame-ancestors 'self'"
        );
      }
    });

    it('middleware keeps every other path strict', async () => {
      for (const path of [
        '/',
        '/brand/',
        // The pre-BL-097 route: no longer a page, and must not stay frameable.
        '/brand/responsive-frame',
        '/brand/responsive-frame/',
        // Unknown group under the same prefix — proves enumeration, not prefixing.
        '/brand/responsive-frame/bogus',
        '/brand/responsive-frame/sub',
        '/hub/radar/',
      ]) {
        const res = await runMiddleware(path);
        expect(res.headers.get('X-Frame-Options'), path).toBe('DENY');
        expect(res.headers.get('Content-Security-Policy'), path).toContain(
          "frame-ancestors 'none'"
        );
      }
    });
  });
});
