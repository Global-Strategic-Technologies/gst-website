/**
 * Pure, per-engagement customization of the parsed {@link IRLArticle} AST.
 * Runs unchanged in every environment the rest of `src/utils/irl/` targets —
 * the Cloudflare Workers runtime (the MCP tools), the browser (the Hub
 * generator page), and Node (vitest) — so it uses no Node APIs and never
 * mutates its input.
 *
 * Five customization stages, composed in ONE place ({@link customizeIrlArticle})
 * so the order can never drift between surfaces (the BL-044.5 governing rule:
 * no surface authors its own filter logic):
 *
 *   1. {@link applyDirectives}  — authored `skip-if` tags fire against the
 *      supplied engagement dimensions (BL-044.5 directive engine).
 *   2. {@link filterIrlArticle} — manual section pick-list.
 *   3. {@link excludeBullets}   — manual per-question removal by `NN-II` key.
 *   4. {@link addCustomRequests} — engagement-local additive requests.
 *   5. Drop zero-bullet sections LAST — so a user's custom request on an
 *      otherwise-emptied section SURVIVES (the section keeps the custom),
 *      and no orphan section header ever reaches the generator.
 *
 * Order rationale: directives fire before manual controls (auto before
 * manual); exclusion runs before customs so an `NN-II` key can never hit a
 * custom's ordinal; the empty-drop runs last for the survival guarantee
 * above. All pinned by tests.
 *
 * **Reference-ID stability**: every removal mechanism preserves surviving
 * bullets' parser-assigned `ordinal`s, so the generator renders gaps
 * (`2-01, 2-02, 2-04…`) instead of renumbering — recipient-quoted refs and
 * the filled-IRL ingestion round-trip stay stable. Custom requests continue
 * numbering from the section's `canonicalBulletCount`, so a custom's ID can
 * never collide with a removed canonical question's.
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
   * Engagement dimensions for the directive engine. Today: `context`
   * (sell-side | buy-side | value-creation). A supplied value removes every
   * bullet/section whose authored `skipIf` lists it; `undefined` (and the
   * `'unknown'` sentinel, which no authored tag lists) fires nothing.
   */
  readonly context?: string;
  /**
   * Two-character section numbers to KEEP. Undefined → all sections (the
   * universal artifact, byte-identical to today). Unknown numbers are
   * ignored; an include set matching zero sections yields a zero-section
   * article — callers guard against generating from that.
   */
  readonly includeSections?: readonly string[];
  /**
   * `"NN-II"` keys of canonical questions to REMOVE — two-digit section
   * number + two-digit 1-based canonical ordinal (e.g. `"02-03"` = question
   * 3 of section 02, rendered in the workbook as Reference `2-03`).
   * Malformed / unknown keys are silently ignored.
   */
  readonly excludeRequests?: readonly string[];
  /** Ad-hoc requests to append, keyed by section number. Requests for absent sections are dropped. */
  readonly customRequests?: readonly IRLCustomRequest[];
}

/** The `NN-II` exclusion key for a bullet (dense fallback for hand-built articles). */
function bulletKey(sectionNumber: string, bullet: IRLBullet, denseIndex: number): string {
  return `${sectionNumber}-${String(bullet.ordinal ?? denseIndex).padStart(2, '0')}`;
}

/**
 * BL-044.5 directive engine: return a copy of `article` with every bullet
 * and section whose authored `skipIf` matches a supplied dimension removed.
 * No dimensions supplied (or nothing matches) → the article is returned
 * unchanged (same reference). Sections emptied here are NOT dropped — the
 * final stage of {@link customizeIrlArticle} handles that, so custom
 * requests can still land on them.
 */
export function applyDirectives(
  article: IRLArticle,
  dims?: { readonly context?: string }
): IRLArticle {
  const context = dims?.context;
  if (!context) return article;

  const matches = (skipIf?: IRLBullet['skipIf']): boolean =>
    skipIf?.context?.includes(context) ?? false;

  const anyTagFires = article.sections.some(
    (s) => matches(s.skipIf) || s.bullets.some((b) => matches(b.skipIf))
  );
  if (!anyTagFires) return article;

  return {
    ...article,
    sections: article.sections
      .filter((s) => !matches(s.skipIf))
      .map((s): IRLSection => {
        const kept = s.bullets.filter((b) => !matches(b.skipIf));
        return kept.length === s.bullets.length ? s : { ...s, bullets: kept };
      }),
  };
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
 * Manual per-question removal: return a copy of `article` with every bullet
 * whose `NN-II` key is in `excludeRequests` removed. Surviving bullets keep
 * their `ordinal`s, so the generator renders Reference-ID gaps rather than
 * renumbering. Malformed / unknown keys are silently ignored. Sections
 * emptied here are NOT dropped (see {@link customizeIrlArticle} stage 5).
 *
 * Dense-fallback note: on hand-built articles without `ordinal`s, keys match
 * live positions (`i + 1`) and the generator renumbers densely — only
 * synthetic ASTs hit this; parser-produced articles always carry ordinals.
 */
export function excludeBullets(
  article: IRLArticle,
  excludeRequests?: readonly string[]
): IRLArticle {
  if (!excludeRequests || excludeRequests.length === 0) return article;
  const keys = new Set(excludeRequests);

  let anyRemoved = false;
  const sections = article.sections.map((section): IRLSection => {
    const kept = section.bullets.filter(
      (bullet, i) => !keys.has(bulletKey(section.number, bullet, i + 1))
    );
    if (kept.length === section.bullets.length) return section;
    anyRemoved = true;
    return { ...section, bullets: kept };
  });

  return anyRemoved ? { ...article, sections } : article;
}

/**
 * Return a copy of `article` with each custom request appended as a bullet
 * to its matching section. Appended bullets are assigned ordinals continuing
 * from the section's ORIGINAL (canonical) bullet count, so their Reference
 * IDs can never collide with a removed canonical question's — a custom on an
 * 8-bullet section is `-09` even if canonical bullet 8 was removed. Requests
 * targeting a section not present in `article` are dropped — this is
 * section-scoped and cannot mint a new ad-hoc section.
 */
export function addCustomRequests(
  article: IRLArticle,
  requests?: readonly IRLCustomRequest[]
): IRLArticle {
  if (!requests || requests.length === 0) return article;

  // Group requests by section number once, so a section with several custom
  // requests appends them in the order supplied.
  const bySection = new Map<string, string[]>();
  for (const req of requests) {
    const list = bySection.get(req.section) ?? [];
    list.push(req.text);
    bySection.set(req.section, list);
  }

  return {
    ...article,
    sections: article.sections.map((section): IRLSection => {
      const extraTexts = bySection.get(section.number);
      if (!extraTexts) return section;
      // Ordinal base: the authored bullet count when known; otherwise the
      // best reconstruction (max surviving ordinal, floored at live length)
      // — equal to the dense position on hand-built articles, so old
      // callers stay byte-identical.
      const base =
        section.canonicalBulletCount ??
        section.bullets.reduce(
          (max, b, i) => Math.max(max, b.ordinal ?? i + 1),
          section.bullets.length
        );
      const extras: IRLBullet[] = extraTexts.map((text, k) => ({
        text,
        ordinal: base + 1 + k,
      }));
      return { ...section, bullets: [...section.bullets, ...extras] };
    }),
  };
}

/**
 * Single composed entry point every surface calls. Stage order (see file
 * header for rationale): directives → section filter → question exclusion →
 * custom requests → drop still-empty sections. With no effective options the
 * article is returned unchanged (same reference).
 */
export function customizeIrlArticle(article: IRLArticle, opts?: IRLCustomizeOptions): IRLArticle {
  if (!opts) return article;

  let result = applyDirectives(article, { context: opts.context });
  result = filterIrlArticle(result, opts.includeSections);
  result = excludeBullets(result, opts.excludeRequests);
  result = addCustomRequests(result, opts.customRequests);

  if (result === article) return article;

  // Stage 5: drop sections left with zero bullets by removal (directive or
  // manual). Runs AFTER customs so a custom request keeps its section alive.
  const nonEmpty = result.sections.filter((s) => s.bullets.length > 0);
  return nonEmpty.length === result.sections.length ? result : { ...result, sections: nonEmpty };
}
