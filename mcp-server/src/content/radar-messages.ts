/**
 * Radar degraded-state messages — node-free, dependency-free.
 *
 * These are the strings a consumer surfaces VERBATIM to the user when a radar
 * read cannot return items. They live here, apart from `radar-snapshot.ts`,
 * for one structural reason: that module imports `node:fs` / `node:path` /
 * `node:url` and therefore cannot be reached from Worker code. Prompt modules
 * need the text without the filesystem reader, so the text has to live in a
 * module with no imports at all.
 *
 * This file having zero imports is load-bearing, not incidental — it is what
 * lets `prompts/embed.ts` consume these constants while the ESLint rule on
 * `mcp-server/src/prompts/**` bans `content/radar-snapshot`.
 *
 * ## Why three constants and not one
 *
 * The remediation genuinely differs by transport and by failure mode, and a
 * single message got one of them wrong on every surface it reached:
 *
 *   - stdio, no seeded cache   → the operator runs `npm run radar:seed`
 *   - Worker, cold cache       → the 6-hourly Cron refills Upstash; nothing
 *                                for the user to run
 *   - either, tier present but → curation has simply gone quiet; the 30-day
 *     zero fresh items           freshness gate emptied the tier. Not an error.
 *
 * Telling a remote client to run a local seed script is the specific defect
 * this split exists to prevent (a `prompts/get` response carrying that advice
 * is a documented failure signature).
 *
 * The differently-worded copy in `resources/radar.ts` is deliberately NOT
 * folded in here: it is embedded in a published Resource body, so rewording it
 * would change a client-facing surface. See the comment at its declaration.
 */

/**
 * stdio, no seeded cache. Unchanged byte-for-byte from its original
 * definition in `radar-snapshot.ts`, which re-exports it under its historical
 * name `SNAPSHOT_MISSING_MESSAGE` so existing callers and their assertions
 * (`tools/radar-offline.ts`, `tests/unit/radar-offline.test.ts`) are untouched.
 */
export const SNAPSHOT_MISSING_STDIO =
  'Radar snapshot not found. Run `npm run radar:seed` from the gst-website repo root to populate the local cache.';

/**
 * Worker, cold cache — the snapshot reader returned null. Deliberately carries
 * NO `radar:seed` instruction: the remote user has no repo and no shell, and
 * the cache is refilled by the Cron, not by them.
 */
export const SNAPSHOT_UNAVAILABLE_REMOTE =
  'Radar snapshot unavailable — the shared cache is currently empty. It is refreshed by a scheduled job every 6 hours. While the Inoreader budget circuit breaker is open, no read refreshes the cache (that is deliberate — it protects the shared upstream budget), so this state can persist until the breaker closes. No items are available to report right now.';

/**
 * The tier was read successfully but holds no items. Distinct from
 * "unavailable" — nothing is broken, the curated tier is simply empty.
 *
 * Worker-only in practice: the 30-day freshness gate (`filterFreshFyi`) runs
 * on the live read path, and `radar-snapshot.ts` documents that it is
 * deliberately NOT applied to the seeded offline snapshot. So the mechanism
 * sentence is scoped to the live surface rather than stated flatly — on stdio
 * an empty tier means the seed contained no annotated items, which is a
 * different cause and would make a flat "aged out" claim wrong.
 */
export const NO_FRESH_CURATED_ITEMS =
  'No curated radar items to report — the feed was read successfully and is empty. On the live surface, curated (FYI) items age out 30 days after they are annotated, so an empty tier there means curation has paused rather than that anything is broken. On a local seeded snapshot it means the seed carried no annotated items.';
