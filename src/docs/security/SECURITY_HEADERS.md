# Security Headers

HTTP security headers applied to all GST website responses. Static routes receive headers from `vercel.json`; the SSR Radar route receives identical headers from Astro middleware (`src/middleware.ts`). A sync test in `tests/unit/security-headers.test.ts` ensures the two sources stay identical.

One route carries a documented, narrowly-scoped relaxation — see [Route Exceptions](#route-exceptions).

## Header Inventory

| Header                    | Value                                        | Purpose                                                                               |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| X-Frame-Options           | DENY (one route: SAMEORIGIN)                 | Prevent clickjacking via iframe embedding — see [Route Exceptions](#route-exceptions) |
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
| font-src                  | 'self'                                                                                                                                                     | Self-hosted fonts only                                                                                                                                                                                                                                                                                                                                |
| frame-src                 | 'self'                                                                                                                                                     | Brand responsive demo iframe only. NOTE: this permits the _parent_ to load a frame; the framed page must also permit being framed via its own `frame-ancestors` — see [Route Exceptions](#route-exceptions)                                                                                                                                           |
| frame-ancestors           | 'none'                                                                                                                                                     | Nobody can embed this site — including this site itself (CSP-level framing protection). One route relaxes this to `'self'`; see [Route Exceptions](#route-exceptions)                                                                                                                                                                                 |
| manifest-src              | 'self'                                                                                                                                                     | PWA manifest                                                                                                                                                                                                                                                                                                                                          |
| form-action               | 'self'                                                                                                                                                     | Forms can only submit to same origin                                                                                                                                                                                                                                                                                                                  |
| base-uri                  | 'self'                                                                                                                                                     | Prevent base tag injection                                                                                                                                                                                                                                                                                                                            |
| upgrade-insecure-requests | (present)                                                                                                                                                  | Auto-upgrade HTTP to HTTPS                                                                                                                                                                                                                                                                                                                            |

## How Headers Are Applied

```
Static routes (15 pages)          vercel.json → Vercel CDN adds headers
                                    ↓
SSR routes (Radar only)           src/middleware.ts → Astro injects headers server-side
                                    ↓
Sync enforcement                  tests/unit/security-headers.test.ts
                                  Reads both sources, fails CI if they diverge
```

## Route Exceptions

### `/brand/responsive-frame` — same-origin framing

| Header                | Site default | This route   |
| --------------------- | ------------ | ------------ |
| `X-Frame-Options`     | `DENY`       | `SAMEORIGIN` |
| CSP `frame-ancestors` | `'none'`     | `'self'`     |

**Why**: the site default forbids framing by _every_ origin — including this one. The brand page's Responsive Behavior section renders the same components at three viewport widths using same-origin `<iframe>`s pointed at `/brand/responsive-frame`. Under the default those frames are blocked with `net::ERR_BLOCKED_BY_RESPONSE` and render empty, with no build error and no console warning to explain it (this shipped broken and went unnoticed until a visual review in July 2026).

**Why it's safe**: the route is a `noindex` partial with no user data, no authenticated state and no actionable form. `'self'` permits framing only by our own pages, so an attacker's origin still cannot embed it — the clickjacking protection that matters is unchanged. Nothing else in the policy is relaxed.

**Where it lives**: both `vercel.json` (the route is prerendered, so production headers come from the CDN) and `src/middleware.ts` (`SAME_ORIGIN_FRAMEABLE`, covering dev and any SSR path). `tests/unit/security-headers.test.ts` pins the exception to that single path and asserts the frame-route CSP differs from the site default _only_ in `frame-ancestors`.

**Adding another frameable route** — do all three: add the path to `SAME_ORIGIN_FRAMEABLE`, add a `vercel.json` header rule, and update the test's expected path list. If you only do the first, it will work in dev and silently fail in production.

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

The MCP server runs on a separate Cloudflare Workers deployment at `mcp.globalstrategic.tech` (production) and `mcp-staging.globalstrategic.tech` (staging) — see [`mcp-server/src/docs/ARCHITECTURE.md` § Security boundary](../../../mcp-server/src/docs/ARCHITECTURE.md#security-boundary-vs-the-website). It does NOT inherit the website's CSP, since:

- The Worker serves a JSON-RPC API to MCP clients, not HTML pages with scripts/styles. CSP doesn't meaningfully apply
- Different threat model — auth is bearer-token (Phase 2), not session-based
- Different runtime — Cloudflare Workers, not Vercel; managed via `wrangler.toml` rather than `vercel.json`

**What it DOES enforce** (configured in [`mcp-server/src/auth/cors.ts`](../../../mcp-server/src/auth/cors.ts)):

- **CORS allowlist** — explicit origin list (`https://claude.ai`, `https://chatgpt.com`, `https://cursor.sh`); never `*`
- **Bearer-token auth** on every non-health endpoint — see [`mcp-server/src/docs/operations/AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md)
- **WWW-Authenticate** header on 401 responses (RFC 6750-compliant)
- **Header-stripping logger** — Authorization / Cookie / X-API-Key never reach `wrangler tail` or Sentry

**What it explicitly does NOT have**:

- HSTS — Cloudflare's edge enforces HTTPS at the platform level; the Worker doesn't add its own header (would be redundant)
- X-Frame-Options / frame-ancestors — the Worker's responses are not HTML; framing is a non-concern
- CSP — see above

When BL-033 ships OAuth 2.1 for external clients, the Worker gains additional headers (token-introspection responses, audit-log envelopes); they get documented here at that time.

---

← Back to [Security Documentation](README.md)
