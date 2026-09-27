/**
 * Playwright global setup.
 *
 * Post-BL-032.8 Phase B (2026-05-17): the previous filesystem-cache seed
 * mechanism (`seedRadarCache` writing to `.cache/inoreader/`) was retired
 * along with the website's direct Inoreader client. The Radar page now
 * fetches from the MCP Worker's `/radar/snapshot` endpoint at SSR time.
 *
 * For E2E to render `/hub/radar` with real items, `MCP_KEY_WEBSITE_RADAR`
 * must be bound on the dev server's env. CI's E2E jobs start
 * `scripts/radar-stub.mjs` and point MCP_RADAR_SNAPSHOT_URL at it with a
 * stub bearer. Locally, use `npm run radar:stub` plus the RADAR.md § Working
 * Offline values. Without it the page renders the empty state: under CI the
 * content tests then FAIL (requireRadarContent), and locally they skip.
 *
 * Kept as a no-op placeholder so Playwright config (which references this
 * file) doesn't need to be updated. Future global-setup needs can land here.
 */

export default function globalSetup() {
  // No-op. Reserved for future global-setup needs.
}
