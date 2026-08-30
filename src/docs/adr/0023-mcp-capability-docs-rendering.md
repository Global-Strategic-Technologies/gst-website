# ADR-0023: The public MCP capability reference is an authored registry rendered server-side, and it takes the docs subdomain

- **Status**: Accepted (2026-08-28, website)
- **Source initiative**: [BL-093 § Public developer documentation](../development/BACKLOG.md#bl-093-mcp-server--commercialization-phase-4)

## Context

`/hub/mcp/get-started/`, `/hub/mcp/using/` and `/hub/mcp/advanced-operations/` shipped 2026-08-27 linking `/hub/mcp/docs/`, which did not exist; `tests/e2e/hub-mcp-onboarding.test.ts` carried a comment recording the target as knowingly unbuilt. A claude.ai/design handoff specified that page: two lenses over the same estate, Workflows (four task cards) and Reference (a sidebar of every capability with a contract per entry).

Three forces shaped the build.

**The corpus already exists, and is not publishable.** `mcp-server/src/docs/tools/*/CONTRACT.md` is 1,666 lines across nine families, drift-guarded by the server's own `contract-parity.test.ts`. BL-093 AC 2 specified the public reference derive from it: "a publication pipeline over that corpus, NOT a parallel hand-written or separately-generated reference (avoids a third description of every tool)". But that corpus documents cache semantics, Upstash bindings, operator runbooks and wire detail, and the same AC block separately requires the published set be reviewed so operator-only material stays private. Both routes need curation; the question is only where the curated text lives.

**A static host cannot vary output by query string.** The prototype kept lens and capability in memory and suggested `?view=…&cap=…` for linkability. Astro emits static HTML to Vercel.

**Astro's scoped styles raise specificity.** `scopedStyleStrategy` defaults to `'attribute'`, so a scoped rule gains a `+1` over its authored specificity. Any progressive-enhancement scheme relying on an unscoped override losing to a scoped rule fails silently.

## Decision

**1. The registry is hand-authored at `src/data/mcp/capabilities.ts`, and BL-093 AC 2 is retired.** Every contract is written for a prospect, from the corpus rather than out of it. The drift the AC feared is answered by `tests/integration/mcp-docs-parity.test.ts`, which imports the module and binds the load-bearing half to server source: the Tools group must equal the registered tool set in both directions, Prompts likewise, orchestration lists must equal `SWEEP_ORCHESTRATED_TOOLS` and the quick-look prompt's own literal, resource counts must equal the loaders' inventory, and every published example must call the capability it documents. That last property now holds two ways rather than one: most tools declare an ordered `exampleCall` and the call is GENERATED from their own arguments' example values, so it cannot name another capability or drift from the table above it; the three tools whose documented arguments are not flat wire keys keep a hand-authored `example`, and the original assertion still governs those. Example values are themselves traceable to the UAT corpus or the tool's schema, and the "complete and valid as written" claim is derived from the data rather than declared beside it — see `src/docs/hub/MCP_CAPABILITY_DOCS.md` § Example values. Accepted trade-off, stated plainly: **authored prose can drift where the guard does not reach** (glosses, callouts, argument descriptions). That is the price of a public surface written for its audience, and it is why the copy rules are also machine-checked (no em dashes, no uptime figure or SLA claim, no operator-only material, ceilings always framed as tunable and non-contractual).

Rejected: a build-time publication pipeline over `CONTRACT.md`. It couples the website build to the other workspace's docs tree, and it publishes engineering prose to a commercial surface.

**2. End state: one public reference.** `/hub/mcp/docs/` is it. The `CONTRACT.md` corpus remains the internal source of truth it already was, and `docs.mcp.globalstrategic.tech` becomes an alias for the page rather than a second surface (below). So the "third description of every tool" the AC warned against does not come into being: there is one internal description and one public one.

**3. Rendering is server-side and complete, collapsed by one class.** All 34 contract panes and both lenses render into the HTML, visible by default. An `is:inline` bootstrap placed before the panes adds `js` to `<html>` and records the hash's meaning in `data-lens` / `data-cap`; page CSS keyed on those attributes then shows one lens, and `:target` shows one contract. Consequences worth naming:

- **No JS produces a complete linear reference document**, crawlable and deep-linkable, with no `<noscript>` block and no second rendering path.
- **Contract selection needs no script at all.** Sidebar items and workflow steps are anchors, so the browser reveals the right pane from the URL. The module only keeps `data-cap` in step, marks the selected item, and runs the search.
- Rejected: rendering visible and re-hiding via a `<noscript>` override. Under `scopedStyleStrategy: 'attribute'` the override loses the cascade and leaves a no-JS reader a near-empty page; a `<style>` in a body-level `<noscript>` is also non-conforming, and `postcss-html` lints it regardless.
- Rejected: `?view=…&cap=…`. Hash anchors work on a static host, survive with no JS, and give back/forward for free.

**4. The docs subdomain is served by the MCP Worker, not Vercel.** `mcp-server/wrangler.toml` gains `docs.mcp.globalstrategic.tech` as a `custom_domain` production route, and `worker.ts` 308s every path on that host to `https://globalstrategic.tech/hub/mcp/docs/`.

Rejected: a host-conditioned redirect in `vercel.json`. It would need someone to attach the domain to the Vercel project and point DNS by hand, so the rule would ship inert behind a manual step, and it would split ownership of the `*.mcp.globalstrategic.tech` namespace across two platforms. The Worker already provisions `status.mcp.globalstrategic.tech` the same way, with DNS and certificate created on deploy.

**308, not 301**: it matches the repo's only other permanent redirect (`vercel.json`'s sitemap rule, which Vercel emits as a 308) and carries none of 301's spec-versus-practice ambiguity about method rewriting. Search engines treat them as equivalent, so this is consistency, not SEO.

## Consequences

- **Adding or renaming a tool or prompt breaks the build until the registry is updated.** That is the point. Procedure in [`../hub/MCP_CAPABILITY_DOCS.md`](../hub/MCP_CAPABILITY_DOCS.md).
- **The alias's dispatch placement is load-bearing.** `/health`, the `/status` arm and `isOAuthSurfacePath` all dispatch on path alone with no hostname test, so the host branch must run before all of them or the alias serves the health payload, the status page and the OAuth surface on a documentation hostname. `resolveHostRoute` lives in `mcp-server/src/dispatch/host-route.ts` and `tests/unit/dispatch/host-route.test.ts` asserts both the behavior and the call-site ordering against `worker.ts` source, because a pure function returns the same answer wherever it is called from.
- **The alias has no staging coverage.** Staging carries a single route, matching the status-subdomain precedent, so the redirect is first exercised in production after the gated `mcp-production` deploy. BL-093 stays open on exactly that one criterion.
- **The alias must never be linked.** Both parity suites assert `docs.mcp.` appears in no published copy: one surface carries one published address, and a second name in copy is how two addresses drift apart. A 308 returns no document, so there is no duplicate-canonical risk to appeal to; the reason is editorial, not SEO.
- **Permanent redirects are cached hard and durably**, so the target stays a bare page URL. Never point it at a hash or query.
- **Every alias path is a soft 404**, collapsing onto the one page. Deliberate: nothing links deeper paths and the Worker has no documentation paths to preserve.
- **This change extends the Worker's public surface by one host**, recorded in [`../security/SECURITY_HEADERS.md`](../security/SECURITY_HEADERS.md) § MCP Worker subdomain and in [`ARCHITECTURE.md`](../../../mcp-server/src/docs/ARCHITECTURE.md)'s deploy topology.
- **Audit-log guarantees are deliberately not published**, though BL-093 AC 1 lists them: the audit pipeline is not live (ADR-0014), and the marketing guard requires built-and-tested phrasing.
- **Revisit trigger**: if a second public documentation surface is ever proposed, this ADR is what has to be reopened first, because the "one public reference" premise is what retires AC 2.
