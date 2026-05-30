/**
 * BL-041 — end-to-end @upstash/ratelimit verification against a scoped ACL token.
 *
 * Why this exists as a Node sibling of Test-UpstashAcl.ps1:
 *   The PS1 issues raw Redis commands via the Upstash REST POST shape. That
 *   surface CANNOT exercise the real @upstash/ratelimit `slidingWindow` flow,
 *   which orchestrates EVALSHA → (on NOSCRIPT) SCRIPT LOAD → EVAL with a
 *   specific script body + key naming. A manual approximation would be
 *   fragile — pin a SHA, get a false positive when the real SDK changes the
 *   script body. So we import the actual SDK at the version pinned in
 *   mcp-server/package.json and let it do the round-trip.
 *
 * Inputs (env vars set by the parent PS1):
 *   UPSTASH_TEST_URL        — https://<db>.upstash.io
 *   UPSTASH_TEST_TOKEN      — REST token (must be the scoped one being verified)
 *   UPSTASH_TEST_PROBE_KEY  — probe identifier, e.g. mcp:test:acl:abc12345:ratelimit
 *
 * Exit code 0 = ratelimit completed end-to-end (limiter accepted the call
 * and returned a `success`/`remaining` envelope). Non-zero = NOPERM somewhere
 * in the script-load / EVAL / ZADD chain.
 */
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const url = process.env.UPSTASH_TEST_URL;
const token = process.env.UPSTASH_TEST_TOKEN;
const probeKey = process.env.UPSTASH_TEST_PROBE_KEY ?? `mcp:test:acl:${Date.now()}:ratelimit`;

if (!url || !token) {
  console.error('verify-ratelimit-acl: missing UPSTASH_TEST_URL or UPSTASH_TEST_TOKEN');
  process.exit(2);
}

const redis = new Redis({ url, token });

// Sliding-window: 5 ops per 60s. Numbers chosen to be obviously inside the
// budget so any failure is an ACL/NOPERM signal, not a real rate-limit hit.
const limiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: probeKey,
  analytics: false,
});

try {
  const result = await limiter.limit(probeKey);
  // Successful end-to-end roundtrip — SCRIPT LOAD + EVAL both worked under
  // the scoped ACL. The actual success/remaining values aren't material;
  // we only care that no command threw.
  console.log(
    `verify-ratelimit-acl: OK (success=${result.success} remaining=${result.remaining} limit=${result.limit})`
  );
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`verify-ratelimit-acl: FAILED — ${msg}`);
  // Surface the NOPERM string explicitly in the output so the parent PS1
  // log makes the failure mode obvious.
  if (msg.includes('NOPERM') || msg.toLowerCase().includes('no permission')) {
    console.error(
      'verify-ratelimit-acl: NOPERM detected — ACL is rejecting a command or key the SDK uses internally.'
    );
    console.error(`  - prefix configured:    ${probeKey}`);
    console.error(`  - identifier passed:    ${probeKey}`);
    console.error('  - expected SDK key:     <prefix>:<identifier>:<bucket>');
  }
  // Diagnostic: include the cause chain + first few stack lines so we can
  // see which Redis command/key actually triggered the NOPERM.
  if (err instanceof Error) {
    if (err.cause) console.error('  - error.cause:', err.cause);
    if (err.stack) {
      console.error('  - stack (first 4 lines):');
      for (const line of err.stack.split('\n').slice(0, 4)) {
        console.error('      ' + line);
      }
    }
  }
  process.exit(1);
}
