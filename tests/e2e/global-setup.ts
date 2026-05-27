/**
 * Playwright global setup.
 *
 * Post-BL-032.8 Phase B (2026-05-17): the previous filesystem-cache seed
 * mechanism (`seedRadarCache` writing to `.cache/inoreader/`) was retired
 * along with the website's direct Inoreader client. The Radar page now
 * fetches from the MCP Worker's `/radar/snapshot` endpoint at SSR time.
 *
 * For E2E to render `/hub/radar` with real items, `MCP_KEY_WEBSITE_RADAR`
 * must be bound on the dev server's env (.env locally; secrets injected
 * in CI). Without it the page renders the "Intelligence feed is currently
 * being refreshed" empty-state and feed-asserting tests will fail — that
 * failure is the correct signal that the bearer isn't bound.
 *
 * Kept as a no-op placeholder so Playwright config (which references this
 * file) doesn't need to be updated. Future global-setup needs can land here.
 */

export default function globalSetup() {
  // No-op. Reserved for future global-setup needs.
}
