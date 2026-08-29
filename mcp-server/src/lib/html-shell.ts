/**
 * Shared minimal HTML shell for Worker-served browser pages (admin
 * re-auth flow, OAuth consent page).
 *
 * Self-contained by design: no external resources — defends against
 * Referer leak of OAuth `code`/`state` params to third parties; inline
 * CSS only. Extracted from `admin/inoreader-reauth.ts` (BL-033 Slice 2)
 * when the OAuth consent page became the second consumer.
 *
 * The favicon is the GST delta mark (`public/favicon.svg`, minified) as
 * a `data:` URI — no network fetch, so the no-external-resources
 * discipline holds. Shared with the /status page, which builds its own
 * head; without it browsers 404 `/favicon.ico` and render the default
 * globe on every Worker-served page.
 *
 * NOTE: callers own their page-level security headers — the OAuth
 * consent surface additionally sends `X-Frame-Options: DENY` +
 * `frame-ancestors 'none'` (clickjacking defense); this module only
 * produces markup.
 *
 * Dark mode: `color-scheme: light dark` lets the UA flip the canvas and
 * default text, so every non-default color needs a dark counterpart or
 * the page half-inverts — this shipped with light-only values and the
 * consent page rendered white-on-white scope chips for dark-preference
 * browsers (the first page every OAuth onboarder sees). Overrides live
 * in a `prefers-color-scheme` media block, NOT `light-dark()`: this CSS
 * is a template literal in TS source, no build step down-levels it, so
 * `light-dark()` would silently drop the declaration on pre-2024
 * browsers while the media query degrades to the (fine) light page.
 */

/**
 * The GST delta favicon as an inline `data:` URI `<link>` tag — the same
 * mark as the website's `public/favicon.svg` (teal delta, stroke 6).
 */
export const FAVICON_LINK = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M32 12 L52 52 L12 52 Z' fill='none' stroke='%2300D9B5' stroke-width='6' stroke-linejoin='miter'/%3E%3C/svg%3E">`;

/**
 * The website's metric-matched mono fallbacks (BL-144), inlined.
 *
 * The site pins `--font-family-mono` to a self-hosted `GST Mono`, but a Worker
 * page cannot reference that file: it is served from a different origin, so it
 * would need a CORS grant and a network round-trip on a page whose whole
 * discipline is "no external resources" (see the module header). The other half
 * of the site's stack travels fine, though — both fallback faces are `local()`
 * with `size-adjust`, so they resolve entirely on the visitor's machine and
 * render at the pinned face's metrics. That satisfies BL-144's rule for
 * server-rendered HTML: resolve the pinned face or its metric-matched fallback,
 * never a bare generic.
 *
 * Keep the numbers identical to `src/styles/fonts.css`. Nothing enforces that
 * across the workspace boundary — `tests/integration/font-token-pin.test.ts`
 * checks this file has the faces, not that the percentages agree.
 */
export const MONO_FALLBACK_FACES = `
@font-face { font-family: 'GST Mono Fallback'; src: local('Menlo'), local('DejaVu Sans Mono'); size-adjust: 99.7%; ascent-override: 100.8%; descent-override: 29.59%; line-gap-override: 0%; }
@font-face { font-family: 'GST Mono Fallback WD'; src: local('Consolas'); size-adjust: 109.1%; ascent-override: 92.12%; descent-override: 27.04%; line-gap-override: 0%; }`;

/** The mono stack those faces back, for a Worker page's `font-family`. */
export const MONO_STACK = `'GST Mono Fallback', 'GST Mono Fallback WD', ui-monospace, monospace`;

export function htmlShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
${FAVICON_LINK}
<title>${title}</title>
<style>
:root { color-scheme: light dark; }${MONO_FALLBACK_FACES}
body { font: 16px/1.4 ${MONO_STACK}; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }
h1 { font-size: 1.25rem; margin-bottom: 1rem; }
form { display: flex; flex-direction: column; gap: 0.75rem; }
input[type=password] { padding: 0.6rem; font: inherit; border: 1px solid #999; border-radius: 0.25rem; }
button { padding: 0.6rem; font: inherit; background: #1a1a1a; color: #fff; border: 0; border-radius: 0.25rem; cursor: pointer; }
button:hover { background: #000; }
.error { color: #b00020; margin-bottom: 1rem; }
.success { color: #006400; }
code { font-family: ${MONO_STACK}; background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 0.2rem; }
p { margin: 0.75rem 0; }
ul { margin: 0.5rem 0; padding-left: 1.25rem; }
li { margin: 0.25rem 0; }
.scope-desc { color: #555; font-size: 0.9rem; }
.deny { background: #f4f4f4; color: #1a1a1a; border: 1px solid #999; }
.deny:hover { background: #e2e2e2; }
@media (prefers-color-scheme: dark) {
  button { background: #f4f4f4; color: #1a1a1a; }
  button:hover { background: #fff; }
  .error { color: #ff8189; }
  .success { color: #4caf50; }
  code { background: #2a2a2a; }
  .scope-desc { color: #a5a5a5; }
  .deny { background: #1a1a1a; color: #f4f4f4; }
  .deny:hover { background: #2a2a2a; }
}
</style>
</head>
<body>${body}</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
