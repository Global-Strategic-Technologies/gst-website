# ADR-0033: Registry metadata is served by the Worker and parity-bound to the website JSON-LD

- **Status**: Accepted (2026-09-14, `@gst/mcp-server@0.63.0`)
- **Source initiative**: BL-152 (marketing blitz) Slice 2, executing the `/.well-known/mcp` + `server.json` candidate that BL-093's directory-listing sub-block had carried since 2026-07-27

## Context

Listing the GST MCP server in the Claude connector directory and the MCP registries needs a public `server.json` document, a complete `annotations` block on every tool, and a privacy policy that covers the server. Three facts shaped how the first of those was built:

1. **The description already existed, and the stanza said it must not be written twice.** The website's `SoftwareApplication` JSON-LD (`src/utils/mcp-schema.ts`) computes its description from the capability registry (`src/data/mcp/capabilities.ts`): tool, prompt and resource counts in one sentence. BL-152's AC reads "the description is the JSON-LD's description, not a fresh one, so the two cannot drift". The Worker cannot import the website's registry (the dependency runs the other way: website tests import Worker source), so a literal shared module was not available.
2. **The version had drifted three ways.** `server.ts` reported `0.1.0` in `initialize`'s `serverInfo` since scaffolding; the `/health` fallback constant said `0.58.0`; `package.json` said `0.63.0`. `scripts/deploy.mjs` already injected the real value as `--var VERSION:<v>` and `/health` already read `env.VERSION ?? <fallback>` (BL-033 Slice 4), so the deployed `/health` was right and everything else was stale.
3. **`/.well-known/` was owned wholesale by the OAuth provider.** `isOAuthSurfacePath()` matches the prefix, which is correct for the two RFC documents the provider implements and wrong for any other well-known path: `/.well-known/mcp` would have reached the provider and 404'd.

## Decision

**The website JSON-LD owns the description sentence. The Worker serves a mirror, and two tests bind the two so neither can drift alone.**

- `mcp-server/src/registry-metadata.ts` holds `REGISTRY_DESCRIPTION` as a static string and `buildServerJson(env)` returns the registry document (official schema `2025-12-11`, reverse-DNS name `tech.globalstrategic/gst-mcp`, one `streamable-http` remote at `https://mcp.globalstrategic.tech/mcp`, version from `resolveVersion(env)`).
- Binding (a), Worker side: `protocol-roundtrip.test.ts` extracts the three integers from the sentence by regex and asserts them against the live `tools/list` (minus the stdio-only pair), `prompts/list` and `resources/list`. Binding (b), website side: `tests/integration/mcp-registry-metadata-parity.test.ts` asserts string equality with `mcpServerSchema().description` and the name. A count change anywhere fails one of the two until the sentence is updated on both sides. No new count constant is introduced (the repo already had three count bases and a guard that exists because they drifted).
- **Version**: one module, `mcp-server/src/version.ts`, exports `FALLBACK_VERSION` and `resolveVersion(env)`. `initialize`, `/health`, `/status` and `server.json` all read it. The fallback is load-bearing on stdio, `wrangler dev` and every test, so `tests/unit/version.test.ts` pins it to `package.json` by reading the file: a release bump now touches two files and CI says so if it touched one.
- **Routing**: `GET /server.json` and the alias `GET /.well-known/mcp` are dispatched in `worker.ts` **before** the OAuth branch, modelled on `/health` (public, pre-auth, CORS-wrapped, `Cache-Control: public, max-age=300`). The `/.well-known/` prefix in `isOAuthSurfacePath()` is left broad; the order of dispatch is the fix, and the predicate's doc-comment says so.
- **The unprovisioned visitor**: a directory listing sends strangers to the consent page with no key. They are routed to the existing self-serve three-day trial (BL-155) by a link on the consent form, on every render. Nothing new is built for them, and the "one failure shape" rule on the form is preserved.
- **The directory channel's attribution**: the directory passes no UTM, so "new OAuth consents per week" is its lift signal. The consent page's approve branch now emits an `oauth_consent` Analytics Engine event (approve only: the deny branch has no resolved identity and a denial is not a lift signal), read from a Grafana panel that the dashboard guard test binds to the schema.

**Rejected: a shared package for the sentence.** A third workspace to hold one string, or making the Worker import the website's capability registry, would invert the dependency direction for the sake of removing a mirror that two tests already police.

**Rejected: a JSON import of `package.json` for the version.** The deploy pipeline already injects the value; the only gap was the fallback, and a pinned constant with a file-reading test is smaller than teaching esbuild, tsc and tsx a JSON module each.

**Rejected: carving `/.well-known/mcp` out of `isOAuthSurfacePath()`.** Narrowing the predicate to the two OAuth documents would work, but the provider's own routing may add documents; dispatching the registry path first leaves the provider's contract alone.

## Consequences

- Directory and registry submissions can start from one artefact: `curl https://mcp.globalstrategic.tech/server.json`. The domain namespace (`tech.globalstrategic`) is verified for the official registry by the publisher CLI's HTTP method (a well-known key file the operator hosts), which is an operator step outside this ADR.
- `initialize` now reports the real version. Informational only; recorded in `mcp-server/BREAKING_CHANGES.md` as a non-breaking addendum to 0.63.0 because a client can see the bytes change.
- Every tool carries all four annotation hints as explicit booleans (policy in `mcp-server/src/docs/tools/README.md`, enforced by the roundtrip loop). The two stdio-only radar tools are covered by the same loop, since the roundtrip lane registers them.
- The zone-level AI-bot block on `mcp.globalstrategic.tech` (`SEO_IMPLEMENTATION.md` § Crawler access) may 403 the new paths for crawler user agents; the BL-152 stanza carries the post-deploy probe and the WAF-skip step, and this ADR does not claim the paths are reachable to those agents until the probe says so.
- **Revisit trigger**: the registry schema URL moving (a new `$schema` date), or a second remote (a versioned `/mcp/v2` URL), both of which change `buildServerJson()` and its unit test in one place.
