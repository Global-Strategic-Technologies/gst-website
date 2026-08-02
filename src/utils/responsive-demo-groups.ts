/**
 * The component groups demoed in `/brand`'s Responsive Behavior section.
 *
 * Three surfaces must agree on this list, and they used to agree only by hand:
 *   1. `src/pages/brand/responsive-frame/[group].astro` — which pages get built
 *   2. `src/components/brand/BrandAccessibility.astro`  — the 12 iframe `src`s
 *   3. `src/middleware.ts` (`SAME_ORIGIN_FRAMEABLE`)    — which paths may be framed
 *
 * A fourth, `vercel.json`'s framing header rule, cannot import this module; a
 * drift guard in `tests/unit/security-headers.test.ts` asserts its `source`
 * against `RESPONSIVE_DEMO_GROUPS` instead.
 *
 * BL-097: the frame page previously read `?group=` from the query string, which
 * a static build never supplies — so every frame rendered the `cards` default
 * while its label claimed otherwise.
 */

export const RESPONSIVE_DEMO_GROUPS = ['cards', 'tabs', 'form', 'shell'] as const;

export type ResponsiveDemoGroup = (typeof RESPONSIVE_DEMO_GROUPS)[number];

/**
 * Route WITHOUT a trailing slash — the shape `SAME_ORIGIN_FRAMEABLE` stores.
 *
 * The two builders are deliberately separate. `src/middleware.ts` strips one
 * trailing slash before its set lookup and documents that paths are stored
 * slashless, so a set built from `responsiveFramePath` below could never match:
 * the dev/SSR half of the framing exception would die silently while production
 * kept working from `vercel.json`'s CDN rule. A dev/prod divergence on a
 * clickjacking control is the worst failure mode this file can cause — hence
 * two names rather than one builder and a `.replace()` at each call site.
 */
export const responsiveFrameRoute = (group: ResponsiveDemoGroup) =>
  `/brand/responsive-frame/${group}`;

/**
 * URL WITH a trailing slash — the shape the iframes request. The site sets
 * `trailingSlash: true` in `vercel.json`, so the slashless form would cost a
 * redirect hop on every frame load.
 */
export const responsiveFramePath = (group: ResponsiveDemoGroup) =>
  `${responsiveFrameRoute(group)}/`;
