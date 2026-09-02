# Security Headers

HTTP security headers applied to all GST website responses. Static routes receive headers from `vercel.json`; the SSR Radar route receives identical headers from Astro middleware (`src/middleware.ts`). A sync test in `tests/unit/security-headers.test.ts` ensures the two sources stay identical.

One family of routes carries a documented, narrowly-scoped relaxation — see [Route Exceptions](#route-exceptions).

## Header Inventory

| Header                    | Value                                        | Purpose                                                                               |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| X-Frame-Options           | DENY (demo frames: SAMEORIGIN)               | Prevent clickjacking via iframe embedding — see [Route Exceptions](#route-exceptions) |
| X-Content-Type-Options    | nosniff                                      | Prevent MIME-type sniffing attacks                                                    |
| Referrer-Policy           | strict-origin-when-cross-origin              | Limit referrer leakage to external sites                                              |
| Permissions-Policy        | camera=(), microphone=(), geolocation=()     | Disable unused browser APIs                                                           |
| X-DNS-Prefetch-Control    | on                                           | Allow DNS prefetching for performance                                                 |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | Force HTTPS for 2 years, including subdomains                                         |
| Content-Security-Policy   | (see below)                                  | Restrict which sources can load scripts, styles, etc.                                 |

## Content-Security-Policy Breakdown

| Directive                 | Value                                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| default-src               | 'none'                                                                                                                                                     | Deny everything not explicitly allowed                                                                                                                                                                                                                                                                                                                |
| script-src                | 'self' 'unsafe-inline' googletagmanager.com va.vercel-scripts.com                                                                                          | GA4, Vercel Speed Insights; inline needed for theme/palette init                                                                                                                                                                                                                                                                                      |
| connect-src               | 'self' googletagmanager.com google-analytics.com analytics.google.com www.google.com \*.ingest.sentry.io \*.ingest.us.sentry.io vitals.vercel-insights.com | GA4 beacons (primary + alternate), Sentry error reports (US region), Vercel vitals. **Google Signals is disabled at the GA4 property level (2026-05-30)** — do NOT add `stats.g.doubleclick.net` to this list. Re-enabling Signals in GA4 admin would require adding it, but the B2B/GDPR posture is to keep Signals off; the omission is intentional |
| worker-src                | 'self' blob:                                                                                                                                               | Sentry replay integration Web Worker                                                                                                                                                                                                                                                                                                                  |
| style-src                 | 'self' 'unsafe-inline'                                                                                                                                     | Inline styles for theme/palette initialization                                                                                                                                                                                                                                                                                                        |
| img-src                   | 'self' https: data:                                                                                                                                        | OG images, external link thumbnails, data URIs                                                                                                                                                                                                                                                                                                        |
| media-src                 | 'self'                                                                                                                                                     | MCP onboarding screen-capture clips (`/images/hub/mcp/*.mp4`) — added for `/hub/mcp/get-started/` and siblings; see [ADR-0022](../adr/0022-mcp-onboarding-media-in-git.md)                                                                                                                                                                            |
| font-src                  | 'self'                                                                                                                                                     | Self-hosted fonts only                                                                                                                                                                                                                                                                                                                                |
| frame-src                 | 'self'                                                                                                                                                     | Brand responsive demo iframe only. NOTE: this permits the _parent_ to load a frame; the framed page must also permit being framed via its own `frame-ancestors` — see [Route Exceptions](#route-exceptions)                                                                                                                                           |
| frame-ancestors           | 'none'                                                                                                                                                     | Nobody can embed this site — including this site itself (CSP-level framing protection). One route relaxes this to `'self'`; see [Route Exceptions](#route-exceptions)                                                                                                                                                                                 |
| manifest-src              | 'self'                                                                                                                                                     | PWA manifest                                                                                                                                                                                                                                                                                                                                          |
| form-action               | 'self'                                                                                                                                                     | Forms can only submit to same origin                                                                                                                                                                                                                                                                                                                  |
| base-uri                  | 'self'                                                                                                                                                     | Prevent base tag injection                                                                                                                                                                                                                                                                                                                            |
| upgrade-insecure-requests | (present)                                                                                                                                                  | Auto-upgrade HTTP to HTTPS                                                                                                                                                                                                                                                                                                                            |

## How Headers Are Applied

```
Static routes (every page)        vercel.json → Vercel CDN adds headers
                                    ↓
SSR routes (Radar only)           src/middleware.ts → Astro injects headers server-side
                                    ↓
Sync enforcement                  tests/unit/security-headers.test.ts
                                  Reads both sources, fails CI if they diverge
```

## Route Exceptions

### `/brand/responsive-frame/<group>` — same-origin framing

| Header                | Site default | These routes |
| --------------------- | ------------ | ------------ |
| `X-Frame-Options`     | `DENY`       | `SAMEORIGIN` |
| CSP `frame-ancestors` | `'none'`     | `'self'`     |

**Which routes**: exactly four — `/brand/responsive-frame/{cards,tabs,form,shell}/`, one per component group. They are **enumerated, not prefix-matched**: an unknown path under the same prefix keeps the strict default. Before BL-097 (2026-08) this was a single route reading `?group=` from the query string, which a static build never supplies — all 12 frames rendered the `cards` default.

**Why**: the site default forbids framing by _every_ origin — including this one. The brand page's Responsive Behavior section renders each component group at three viewport widths using same-origin `<iframe>`s. Under the default those frames are blocked with `net::ERR_BLOCKED_BY_RESPONSE` and render empty, with no build error and no console warning to explain it (this shipped broken and went unnoticed until a visual review in July 2026).

**Why it's safe**: each route is a `noindex` partial with no user data, no authenticated state and **no submission target** — the `form` group renders a bare input and two buttons with no `<form>` element, no handlers, and `form-action 'self'` unchanged. (Before BL-097 this said "no actionable form"; the `form` group never actually rendered then, so the phrasing is now stated as what is load-bearing rather than as an absence of markup.) `'self'` permits framing only by our own pages, so an attacker's origin still cannot embed it — the clickjacking protection that matters is unchanged. Nothing else in the policy is relaxed.

**Where it lives**: both `vercel.json` (the routes are prerendered, so production headers come from the CDN) and `src/middleware.ts` (`SAME_ORIGIN_FRAMEABLE`, covering dev and any SSR path). The middleware derives its set from `src/utils/responsive-demo-groups.ts`; `vercel.json` cannot import, so a drift guard in `tests/unit/security-headers.test.ts` asserts its `source` against the same constant. That test also pins the exception to those paths and asserts the frame-route CSP differs from the site default _only_ in `frame-ancestors`.

> The middleware stores paths **without** a trailing slash and normalizes on lookup, which is why `responsive-demo-groups.ts` exports two builders. Using the slash-terminated one there would make the set never match — the exception would die in dev while production kept working from the CDN rule.

**Adding another demo group** — six edits. Every one of them is enforced by a failing test or a type error, so the list is a shortcut rather than a thing you must remember:

1. `RESPONSIVE_DEMO_GROUPS` in `src/utils/responsive-demo-groups.ts` — the middleware and the route follow automatically
2. A specimen block on `src/pages/brand/responsive-frame/[group].astro`, and a row in `RESPONSIVE_ROWS` (`src/components/brand/BrandAccessibility.astro`) — otherwise the page builds but nothing embeds it
3. The `vercel.json` alternation
4. `tests/unit/security-headers.test.ts` — **both** `FRAME_ROUTE` (a literal, deliberately, so the expected pattern is stated rather than computed from the thing it checks) **and** the `toHaveLength` count in the positive middleware case
5. `tests/e2e/brand-page.test.ts` — `GROUP_MARKER` (a `Record<ResponsiveDemoGroup, …>`, so omitting it is a compile error), `LABEL_TO_GROUP`, `HEADING_TO_GROUP`, and the frame count
6. This document's route table, if the group changes what the exception covers

**Adding an unrelated frameable route** — do all three: add the path to `SAME_ORIGIN_FRAMEABLE`, add a `vercel.json` header rule, and update the test's expected path list. If you only do the first, it will work in dev and silently fail in production.

## Adding a New External Service

When you add a third-party script, API, or embed:

1. Identify which CSP directive it needs (script-src for JS, connect-src for API calls, frame-src for iframes, etc.)
2. Add the domain to **both** `vercel.json` and `src/middleware.ts` `SECURITY_HEADERS`
3. Run `npm run test:run` — the sync test confirms they match
4. Update the CSP Breakdown table above
5. Document why the service was added (commit message is sufficient)

## Intentional Omissions

These third-party domains are deliberately NOT in the CSP allowlist. Re-adding them requires re-evaluating the underlying policy decision, not just unblocking a CSP violation.

| Domain                    | Why omitted                                                                                                                                                                                                                                                                                                                                                                                                                       | Decision date | Recovery if needed                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `stats.g.doubleclick.net` | GA4 Google Signals (cross-device tracking, demographics, remarketing audiences) is **disabled at the GA4 property level** (Admin → Data collection and modification → Data collection → "Google signals data collection" toggle OFF). For B2B M&A advisory the data has no business value; for GDPR/ePrivacy the call fires before the consent banner can gate it; for CSP cleanliness the ad-tracking domain is a security smell | 2026-05-30    | Re-enable Signals at GA4 admin, then add to `connect-src` in both `vercel.json` + `middleware.ts` |

## Known Limitations

- **`unsafe-inline` for scripts**: Required for theme initialization, GA4 setup, and palette manager inline scripts in `BaseLayout.astro`. Replacing with nonces would require Astro middleware to inject a unique nonce per request into both the CSP header and every inline `<script>` tag — significant complexity for marginal security gain on a site with no user-generated content.
- **`unsafe-inline` for styles**: Required for theme/palette CSS variable initialization. Same nonce tradeoff as scripts.
- **No `report-uri` / `report-to`**: CSP violations are not reported to an endpoint. Could be added via Sentry's CSP reporting feature if violation monitoring is desired.

## Future Considerations

- **Cookie consent banner** (Business Enablement V1): may add a new inline script or external CSS — update CSP when it ships
- **Email capture** (Business Enablement V1): if using an external email service API, add to connect-src
- **Nonce-based CSP**: evaluate if the site adds user-generated content or auth — currently not worth the complexity

---

## MCP Worker subdomain (BL-032)

The MCP server runs on a separate Cloudflare Workers deployment. Production carries three hosts — `mcp.globalstrategic.tech` (the JSON-RPC surface), `status.mcp.globalstrategic.tech` (the public status page at its root), and `docs.mcp.globalstrategic.tech` (ADR-0023: a 308 alias to `/hub/mcp/docs/` on the website, no body of its own) — and staging carries `mcp-staging.globalstrategic.tech` alone. See [`mcp-server/src/docs/ARCHITECTURE.md` § Security boundary](../../../mcp-server/src/docs/ARCHITECTURE.md#security-boundary-vs-the-website). It does NOT inherit the website's CSP, since:

- Different threat model — auth is bearer-token (Phase 2), not session-based
- Different runtime — Cloudflare Workers, not Vercel; managed via `wrangler.toml` rather than `vercel.json`

**The Worker is mostly, but no longer only, a JSON-RPC API.** This section previously reasoned from "not HTML pages with scripts/styles", which the status page falsified: `worker.ts` returns `buildStatusHtml()` as `text/html`, and a later change gave Worker-served pages a favicon. What that HTML surface actually sets is `Content-Type` and `Cache-Control` and nothing else — **no CSP, no `X-Frame-Options`, no `X-Content-Type-Options`**. Whether to add them is an open operator decision that predates and outlives ADR-0023; it is recorded here rather than left implied by a premise that stopped being true. The docs alias needs none of them: a 308 carries no body.

**What it DOES enforce** (configured in [`mcp-server/src/auth/cors.ts`](../../../mcp-server/src/auth/cors.ts)):

- **CORS allowlist** — explicit origin list (`https://claude.ai`, `https://chatgpt.com`, `https://cursor.sh`); never `*`
- **Bearer-token auth** on every non-health endpoint — see [`mcp-server/src/docs/operations/AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md)
- **WWW-Authenticate** header on 401 responses (RFC 6750-compliant)
- **Header-stripping logger** — Authorization / Cookie / X-API-Key never reach `wrangler tail` or Sentry

**What it explicitly does NOT have**:

- HSTS — Cloudflare's edge enforces HTTPS at the platform level; the Worker doesn't add its own header (would be redundant)
- X-Frame-Options / frame-ancestors — absent, including on the status page, which IS framable HTML. See the note above: an open decision, not a reasoned exclusion
- CSP — absent for the same reason

OAuth 2.1 shipped for external clients (ADR-0008, `isOAuthSurfacePath` in `worker.ts`). It added no response headers beyond the RFC 6750 `WWW-Authenticate` challenge already listed above, so there is nothing further to document here; this paragraph previously predicted that work as pending.

---

← Back to [Security Documentation](README.md)
