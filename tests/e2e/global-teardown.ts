/**
 * Playwright global teardown.
 *
 * Post-BL-032.8 Phase B (2026-05-17): the previous `clearRadarCache` step
 * (cleaning the `.cache/inoreader/` filesystem cache) was retired along
 * with the website's direct Inoreader client. No teardown needed since
 * global-setup is now a no-op.
 *
 * Kept as a no-op placeholder so Playwright config (which references this
 * file) doesn't need to be updated. Future teardown needs can land here.
 */

export default function globalTeardown() {
  // No-op. Reserved for future teardown needs.
}
