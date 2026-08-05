/**
 * Radar wire-tier display bound — shared by `/hub/radar` and the MCP radar tools (BL-109).
 *
 * ## Why this is shared rather than duplicated
 *
 * This logic was inline in `src/components/radar/RadarFeed.astro`, and the MCP
 * `search_radar` tool applied **no wire bound at all** — so the tool returned ~46 wire
 * items where the page renders 30. A client acceptance probe surfaced it the hard way:
 * `search_radar` returned 143,027 characters and exceeded the client's tool-result
 * ceiling, which under BL-108's two-channel response shape makes the tool unusable
 * rather than merely large.
 *
 * The tool is a documented capability mirror of the page (ADR-0005), so this is not a
 * new restriction — it is the mirror being enforced on output for the first time. One
 * implementation, two callers, no drift.
 *
 * Lives in `src/utils/` (the established home for dual-surface runtime modules —
 * `radar-url.ts`, `portfolio-url.ts`) and imports nothing, so the Worker bundle takes no
 * dependency on website display code.
 *
 * ## FYI is deliberately not bounded here
 *
 * The FYI (curated) tier is already capped at `FYI_MAX_COUNT = 15` by the freshness gate
 * in `mcp-server/src/content/radar-transform.ts`, on both surfaces. Only wire needs
 * bounding, and keeping FYI whole is what preserves every GST Take — the analytical
 * value — under the cut.
 */

/** Minimum wire items guaranteed per category before chronological fill. */
export const MIN_PER_CATEGORY = 3;

/** Maximum wire items in the bounded set. */
export const MAX_WIRE = 30;

/** The minimum shape this operates on — satisfied by the website's `RadarWireItem` and the server's `SnapshotItem`. */
export interface BoundableWireItem {
  readonly id: string;
  readonly category: string | null;
  readonly publishedAt: string;
}

/**
 * Bound the wire tier to `MAX_WIRE`, guaranteeing up to `MIN_PER_CATEGORY` items per
 * category first so a category with older items is not pushed past the cap entirely.
 *
 * **Callers must dedupe against the FYI tier BEFORE calling this.** The page filters
 * wire items whose URL already appears in FYI and only then bounds, so its 30 are 30
 * *non-duplicates*. Bounding first would let duplicates consume slots and then be
 * dropped downstream, yielding fewer than 30.
 *
 * **Callers must also bound BEFORE applying any category filter.** The page's category
 * pills filter client-side over the already-bounded set — which is the entire reason
 * `MIN_PER_CATEGORY` exists. Filtering first and bounding after would return up to
 * `MAX_WIRE` items of a single category where the page shows a handful.
 *
 * Sorts by `publishedAt` descending on entry. That is a **no-op for the live path**,
 * whose producer already sorts globally before caching — but the offline snapshot path
 * carries no such guarantee, and the two-pass pick is order-sensitive, so the sort makes
 * the precondition explicit instead of inherited.
 *
 * @param items      wire items, already deduped against FYI
 * @param categories the category vocabulary to guarantee representation for
 */
export function boundWireItems<T extends BoundableWireItem>(
  items: readonly T[],
  categories: readonly string[]
): T[] {
  const sorted = [...items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const picked = new Set<string>();
  const result: T[] = [];

  // Pass 1: up to MIN_PER_CATEGORY per category, newest first.
  //
  // The cap is checked here as well as in pass 2. With the four radar categories the
  // quota can only reach 12, so this guard is unreachable today — but the inline block
  // this was lifted from lived in one component with one caller, and it is now an
  // exported util whose contract says "bound to MAX_WIRE". A `categories` list longer
  // than MAX_WIRE / MIN_PER_CATEGORY would otherwise return more than the cap, from a
  // function that promises not to. This whole change exists because an unenforced bound
  // crossed a client's ceiling; a bound that holds only for the current call site is the
  // same defect waiting on a config change.
  for (const category of categories) {
    if (result.length >= MAX_WIRE) break;
    let count = 0;
    for (const item of sorted) {
      // `result.length < MAX_WIRE` is checked HERE, not only in the outer loop. The outer
      // break alone caps exactly only while MIN_PER_CATEGORY divides MAX_WIRE — at 3 and
      // 30 the count climbs 3, 6, … 30 and stops on the nose, but a quota of 4 with a long
      // enough vocabulary would overshoot to 32. Same argument as the outer guard, one
      // level down: a cap that holds only for the current constants is not a cap.
      if (item.category === category && count < MIN_PER_CATEGORY && result.length < MAX_WIRE) {
        picked.add(item.id);
        result.push(item);
        count++;
      }
    }
  }

  // Pass 2: fill the remaining slots chronologically from whatever pass 1 skipped.
  for (const item of sorted) {
    if (result.length >= MAX_WIRE) break;
    if (!picked.has(item.id)) result.push(item);
  }

  // Re-sort: pass 1 emits in category order, so the final set needs chronological order.
  return result.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}
