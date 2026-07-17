/**
 * CORS — Phase 2 integration tests.
 *
 * Resolves Q5 (origin-allowlist precision). The seed allowlist is:
 *   - https://claude.ai
 *   - https://chatgpt.com
 *   - https://cursor.sh
 *
 * Covers:
 *   - OPTIONS preflight from allowed origin → 204 with Allow-* headers
 *   - OPTIONS preflight from disallowed origin → 204 without Allow-Origin
 *   - GET /health from allowed origin → 200 with Access-Control-Allow-Origin
 *   - GET /health from disallowed origin → 200 (response is fine; browser
 *     CORS is what blocks the cross-origin read, not the server)
 *   - GET /health with no Origin header → 200, no CORS headers (native client)
 *   - Wildcard `*` is NEVER emitted (BACKLOG-mandated)
 *
 * Architecture: mcp-server/src/docs/ARCHITECTURE.md § CORS (Q5)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

const ALLOWED_ORIGIN = 'https://claude.ai';
const DISALLOWED_ORIGIN = 'https://evil.example';

let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    env: 'staging',
    local: true,
    experimental: { disableExperimentalWarning: true },
  });
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

describe('CORS — Phase 2', () => {
  it('OPTIONS preflight from allowed origin returns 204 with Allow-* headers', async () => {
    const res = await worker.fetch('/mcp', {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(res.headers.get('vary')).toContain('Origin');
  });

  it('OPTIONS preflight from disallowed origin returns 204 with no Allow-Origin', async () => {
    const res = await worker.fetch('/mcp', {
      method: 'OPTIONS',
      headers: {
        Origin: DISALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
      },
    });
    // Preflight still returns 204 (the request itself is valid HTTP); the
    // browser blocks the actual cross-origin call because Allow-Origin is absent.
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('GET /health from allowed origin includes Access-Control-Allow-Origin', async () => {
    const res = await worker.fetch('/health', {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
  });

  it('GET /health from disallowed origin returns 200 but no Allow-Origin', async () => {
    const res = await worker.fetch('/health', {
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('GET /health with no Origin emits no CORS headers (native client)', async () => {
    const res = await worker.fetch('/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('wildcard Allow-Origin is never emitted', async () => {
    // Probe two endpoints and a few origins; assert no response carries `*`.
    const probes = [
      worker.fetch('/health'),
      worker.fetch('/health', { headers: { Origin: ALLOWED_ORIGIN } }),
      worker.fetch('/health', { headers: { Origin: DISALLOWED_ORIGIN } }),
      worker.fetch('/mcp', {
        method: 'OPTIONS',
        headers: { Origin: ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'POST' },
      }),
    ];
    const responses = await Promise.all(probes);
    for (const res of responses) {
      expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
    }
  });
});
