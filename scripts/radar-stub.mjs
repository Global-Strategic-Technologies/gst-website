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
 *   MCP_RADAR_SNAPSHOT_URL=http://localhost:8787
 *   MCP_KEY_WEBSITE_RADAR=stub-bearer-not-a-real-secret
 *
 * in `.env` (gitignored), then `npm run dev` or the Playwright suite.
 *
 * Override the port with `STUB_PORT`.
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

// `_req` is unused on purpose: every path returns the same fixture, so there is
// nothing to route on. Underscore-prefixed so the unused-parameter check passes.
const server = createServer((_req, res) => {
  // The bearer is deliberately NOT validated. This is an offline fixture, not
  // an auth simulator; checking it would only add a way to misconfigure the
  // fixture itself.
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(snapshot));
});

server.listen(PORT, () => {
  const wire = snapshot.wire.items.length;
  const fyi = snapshot.fyi.items.length;
  console.log(`[radar-stub] http://localhost:${PORT}`);
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
