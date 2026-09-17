/**
 * The running server's version, in one place.
 *
 * Deployed Workers get the real value injected at deploy time: `scripts/deploy.mjs`
 * reads `package.json` and passes `--var VERSION:<v>` (BL-033 Slice 4), so
 * `env.VERSION` is what `/health`, `/status`, `initialize`'s `serverInfo` and the
 * registry document (`/server.json`) all report. This constant is the fallback for
 * the contexts where nothing injects it — `wrangler dev`, the stdio transport, and
 * every test — and it IS load-bearing there: `initialize` publishes it to the
 * client, and the unit test in `tests/unit/version.test.ts` pins it to
 * `package.json`, so a release bump that forgets this line fails CI rather than
 * shipping a stale number (BL-152: three copies had drifted to 0.1.0 / 0.58.0 /
 * 0.63.0 before this module existed).
 *
 * Bumping a release therefore touches TWO files: `package.json` and this one.
 */
export const FALLBACK_VERSION = '0.64.0';

/** `env.VERSION` when deployed, the pinned fallback otherwise. */
export function resolveVersion(env: { VERSION?: string } = {}): string {
  return env.VERSION ?? FALLBACK_VERSION;
}
