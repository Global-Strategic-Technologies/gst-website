/**
 * Pure, per-engagement customization of the parsed {@link IRLArticle} AST:
 * section filtering + additive custom requests. Runs unchanged in every
 * environment the rest of `src/utils/irl/` targets — the Cloudflare Workers
 * runtime (the MCP tool), the browser (the Hub generator page), and Node
 * (vitest) — so it uses no Node APIs and never mutates its input.
 *
 * The two surfaces (Hub page + MCP tool) both call the single composed
 * entry point {@link customizeIrlArticle} rather than sequencing the two
 * primitives themselves, so the "filter then augment" order lives in exactly
 * one place and can't drift between surfaces.
 *
 * **Relationship to the canonical article**: the source of truth remains
 * `src/data/library/information-request-list/article.md`. These functions
 * never author canonical content — filtering only *removes* whole sections,
 * and custom requests are user-supplied at generation time (an engagement's
 * ad-hoc asks), NOT additions to the canonical bullet set. This is distinct
 * from the future directive-based subtractive filter (BACKLOG BL-044.5),
 * which would tag bullets in the article itself.
 */

import type { IRLArticle, IRLBullet, IRLSection } from './types';

export interface IRLCustomRequest {
  /** Two-character, zero-padded section number the request attaches to (e.g. `"03"`). */
  readonly section: string;
  /** The request text — becomes an appended {@link IRLBullet} on that section. */
  readonly text: string;
}

export interface IRLCustomizeOptions {
  /**
   * Two-character section numbers to KEEP. Undefined → all sections (the
   * universal artifact, byte-identical to today). Unknown numbers are
   * ignored; an include set matching zero sections yields a zero-section
   * article — callers guard against generating from that.
   */
  readonly includeSections?: readonly string[];
  /** Ad-hoc requests to append, keyed by section number. Requests for absent sections are dropped. */
  readonly customRequests?: readonly IRLCustomRequest[];
}

/**
 * Return a copy of `article` keeping only the sections whose `number` is in
 * `includeSections`, preserving the original order. Undefined → the article
 * is returned unchanged (same reference) so the universal path stays
 * byte-identical. Unknown numbers are silently ignored (defensive against
 * stale deeplinks / hand-edited query params).
 *
 * Zero-match returns an article with an empty `sections` array rather than
 * throwing — a pure filter shouldn't decide policy. Callers guard before
 * handing the result to the generator.
 */
export function filterIrlArticle(
  article: IRLArticle,
  includeSections?: readonly string[]
): IRLArticle {
  if (includeSections === undefined) return article;
  const wanted = new Set(includeSections);
  return {
    ...article,
    sections: article.sections.filter((s) => wanted.has(s.number)),
  };
}

/**
 * Return a copy of `article` with each custom request appended as a bullet
 * to its matching section. Section `number` identity is preserved, so the
 * generator's Reference IDs continue the section's existing numbering (a
 * custom bullet on section `"03"` with five existing bullets becomes
 * `3-06`). Requests targeting a section not present in `article` are
 * dropped — this is section-scoped and cannot mint a new ad-hoc section.
 */
export function addCustomRequests(
  article: IRLArticle,
  requests?: readonly IRLCustomRequest[]
): IRLArticle {
  if (!requests || requests.length === 0) return article;

  // Group requests by section number once, so a section with several custom
  // requests appends them in the order supplied.
  const bySection = new Map<string, IRLBullet[]>();
  for (const req of requests) {
    const list = bySection.get(req.section) ?? [];
    list.push({ text: req.text });
    bySection.set(req.section, list);
  }

  return {
    ...article,
    sections: article.sections.map((section): IRLSection => {
      const extra = bySection.get(section.number);
      if (!extra) return section;
      return { ...section, bullets: [...section.bullets, ...extra] };
    }),
  };
}

/**
 * Single composed entry point both surfaces call. Applies section filtering
 * FIRST, then appends custom requests — so a custom request whose section was
 * filtered out is dropped along with the section (its inputs on the excluded
 * section shouldn't resurrect it). With no options set, returns the article
 * unchanged.
 */
export function customizeIrlArticle(article: IRLArticle, opts?: IRLCustomizeOptions): IRLArticle {
  if (!opts) return article;
  const filtered = filterIrlArticle(article, opts.includeSections);
  return addCustomRequests(filtered, opts.customRequests);
}
