/**
 * Worker-boundary host routing.
 *
 * The Worker owns the whole `*.mcp.globalstrategic.tech` namespace. Most of it
 * is the JSON-RPC surface on the apex host; `status.` serves the public status
 * page at its root; and `docs.` is an ALIAS for the capability reference on the
 * website, which is the single published address for that documentation
 * (ADR-0023 — the alias exists so a typed or pasted `docs.mcp…` still lands).
 *
 * WHY A PURE FUNCTION, AND WHY IT IS CALLED FIRST. The alias is host-wide, not
 * path-scoped: `/health`, `/status` and the whole OAuth surface dispatch on
 * PATH alone with no hostname test, so a docs branch placed alongside them would
 * answer the health JSON, the full status page, and `/token` + `/authorize` on a
 * documentation hostname. The call therefore sits ahead of all of them in
 * `worker.ts`, and `tests/unit/dispatch/host-route.test.ts` asserts that
 * ordering against the source — a behavioural test alone cannot, since this
 * function returns the same answer wherever it is called from.
 *
 * Keeping it out of `worker.ts` also keeps its unit test off the Worker graph,
 * and off the `unstable_dev` harness, where `url.hostname` is localhost and the
 * host distinction under test would not exist.
 */

/** The docs alias host, and the canonical page it stands in for. */
export const DOCS_ALIAS_HOST = 'docs.mcp.globalstrategic.tech';
export const DOCS_CANONICAL_URL = 'https://globalstrategic.tech/hub/mcp/docs/';

/**
 * 308 rather than 301: it matches the repo's only other permanent redirect
 * (`vercel.json`'s sitemap rule, which Vercel emits as a 308) and carries none
 * of 301's spec-versus-practice ambiguity about method rewriting. Search
 * engines treat the two as equivalent permanent signals, so this is a
 * consistency choice, not an SEO one.
 */
export const DOCS_REDIRECT_STATUS = 308;

/**
 * A redirect target for this request, or `null` to continue normal dispatch.
 *
 * Every path on the alias collapses onto the canonical page: the Worker has no
 * documentation paths of its own to preserve, and nothing links deeper ones.
 * The target must stay a bare page URL with no hash or query — permanent
 * redirects are cached hard and durably by browsers, so whatever ships here is
 * what a visitor keeps.
 */
export function resolveHostRoute(url: URL): { location: string; status: number } | null {
  if (url.hostname === DOCS_ALIAS_HOST || url.hostname.startsWith('docs.')) {
    return { location: DOCS_CANONICAL_URL, status: DOCS_REDIRECT_STATUS };
  }
  return null;
}
