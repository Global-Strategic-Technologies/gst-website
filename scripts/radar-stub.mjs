/**
 * Local stand-in for the MCP Worker's `GET /radar/snapshot`.
 *
 * ## Why this exists
 *
 * `/hub/radar` renders its feed from the Worker over HTTP. With no
 * `MCP_KEY_WEBSITE_RADAR` bound, `RadarFeed.astro` short-circuits before the
 * fetch and renders the empty state — which is the situation both in CI and in
 * a fresh local checkout. Every E2E assertion that needs actual feed items
 * therefore calls `test.skip()`, including the one that proves `?category=`
 * genuinely FILTERS the feed rather than just activating a pill.
 *
 * That is not a hypothetical gap. The deep-link was broken exactly that way
 * from whenever the island first shipped until 2026-07-31, and nothing caught
 * it — the MCP tools (`search_radar`, `get_latest_insights`) hand clients
 * `…/hub/radar?category=<x>` links, so a silent break there is client-facing.
 *
 * This serves fixed, offline, deterministic data so those tests can run.
 *
 * NOT a substitute for `npm run radar:seed` — that populates the local *stdio*
 * MCP snapshot at `.cache/inoreader/`, which the website never reads. Different
 * consumer, different mechanism. See RADAR.md § Working Offline.
 *
 * ## Usage
 *
 *   npm run radar:stub                 # terminal 1
 *
 * then point the site at it (any non-empty bearer will do — the value is never
 * checked here, it only has to be non-empty so RadarFeed reaches the fetch):
 *
 *   MCP_RADAR_SNAPSHOT_URL=http://127.0.0.1:8787/radar/snapshot
 *   MCP_KEY_WEBSITE_RADAR=stub-bearer-not-a-real-secret
 *
 * in `.env` (gitignored), then `npm run dev` or the Playwright suite.
 *
 * Override the port with `STUB_PORT`. NOTE 8787 is also `wrangler dev`'s
 * default — if the Worker is running locally you will hit the REAL Worker
 * rather than this fixture, silently. Change `STUB_PORT` if both are up.
 *
 * Item shape mirrors `RadarSnapshotItem` in `src/lib/inoreader/transform.ts`,
 * which is the source of truth; this is a third hand-rolled copy and has no
 * mechanical guard, so change it in lockstep.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.STUB_PORT ?? 8787);

/**
 * TWO categories, deliberately. With one, "hide everything that doesn't match"
 * and "hide nothing" produce an identical DOM, so the filter assertions would
 * pass against a completely broken filter.
 */
const CATEGORIES = ['security', 'ai-automation'];

const wireItem = (n, category) => ({
  id: `wire-${category}-${n}`,
  title: `Wire item ${n} (${category})`,
  url: `https://example.invalid/${category}/${n}`,
  source: 'Stub Source',
  category,
  // Fixed dates: the fixture must not drift with wall-clock, or item ORDER
  // becomes machine-dependent and the merge/ordering assertions get flaky.
  publishedAt: new Date(Date.UTC(2026, 6, 20 - n)).toISOString(),
  summary: `Synthetic wire summary ${n} for ${category}.`,
});

const fyiItem = (n, category) => ({
  ...wireItem(n, category),
  id: `fyi-${category}-${n}`,
  // Distinct URL, not just a distinct id. RadarFeed dedupes wire items against
  // FYI URLs, so sharing one silently drops a wire item and the advertised
  // counts stop matching what renders.
  url: `https://example.invalid/${category}/fyi/${n}`,
  title: `FYI item ${n} (${category})`,
  annotatedAt: new Date(Date.UTC(2026, 6, 20 - n)).toISOString(),
  annotation: {
    highlightedText: `Highlighted passage ${n}.`,
    gstTake: `GST Take ${n} on a ${category} development.`,
  },
});

const snapshot = {
  wire: {
    ok: true,
    items: CATEGORIES.flatMap((c) => [1, 2, 3].map((n) => wireItem(n, c))),
  },
  fyi: {
    ok: true,
    items: CATEGORIES.map((c) => fyiItem(1, c)),
  },
  fetchedAt: new Date(Date.UTC(2026, 6, 20)).toISOString(),
};

const server = createServer((req, res) => {
  // Routed on path, but NOT on the bearer: this is an offline fixture, not an
  // auth simulator, and validating a token would only add a way to
  // misconfigure the fixture itself.
  //
  // The path check exists so a mistyped MCP_RADAR_SNAPSHOT_URL fails loudly
  // here instead of appearing to work against any path.
  if (!(req.url ?? '').startsWith('/radar/snapshot')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found', expected: '/radar/snapshot' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(snapshot));
});

server.listen(PORT, '127.0.0.1', () => {
  const wire = snapshot.wire.items.length;
  const fyi = snapshot.fyi.items.length;
  console.log(`[radar-stub] http://127.0.0.1:${PORT}/radar/snapshot`);
  console.log(
    `[radar-stub] serving ${wire} wire + ${fyi} FYI items across: ${CATEGORIES.join(', ')}`
  );
  console.log(
    '[radar-stub] set MCP_RADAR_SNAPSHOT_URL + a non-empty MCP_KEY_WEBSITE_RADAR, then run the site'
  );
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[radar-stub] port ${PORT} is already in use — set STUB_PORT to pick another.`);
    process.exit(1);
  }
  throw err;
});
