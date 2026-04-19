# Security Headers

HTTP security headers applied to all GST website responses. Static routes receive headers from `vercel.json`; the SSR Radar route receives identical headers from Astro middleware (`src/middleware.ts`). A sync test in `tests/unit/security-headers.test.ts` ensures the two sources stay identical.

## Header Inventory

| Header                    | Value                                        | Purpose                                               |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| X-Frame-Options           | DENY                                         | Prevent clickjacking via iframe embedding             |
| X-Content-Type-Options    | nosniff                                      | Prevent MIME-type sniffing attacks                    |
| Referrer-Policy           | strict-origin-when-cross-origin              | Limit referrer leakage to external sites              |
| Permissions-Policy        | camera=(), microphone=(), geolocation=()     | Disable unused browser APIs                           |
| X-DNS-Prefetch-Control    | on                                           | Allow DNS prefetching for performance                 |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | Force HTTPS for 2 years, including subdomains         |
| Content-Security-Policy   | (see below)                                  | Restrict which sources can load scripts, styles, etc. |

## Content-Security-Policy Breakdown

| Directive                 | Value                                                                                                                  | Rationale                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| default-src               | 'none'                                                                                                                 | Deny everything not explicitly allowed                           |
| script-src                | 'self' 'unsafe-inline' googletagmanager.com va.vercel-scripts.com                                                      | GA4, Vercel Speed Insights; inline needed for theme/palette init |
| connect-src               | 'self' googletagmanager.com google-analytics.com \*.ingest.sentry.io \*.ingest.us.sentry.io vitals.vercel-insights.com | GA4 beacons, Sentry error reports (US region), Vercel vitals     |
| worker-src                | 'self' blob:                                                                                                           | Sentry replay integration Web Worker                             |
| style-src                 | 'self' 'unsafe-inline'                                                                                                 | Inline styles for theme/palette initialization                   |
| img-src                   | 'self' https: data:                                                                                                    | OG images, external link thumbnails, data URIs                   |
| font-src                  | 'self'                                                                                                                 | Self-hosted fonts only                                           |
| frame-src                 | 'self'                                                                                                                 | Brand responsive demo iframe only                                |
| frame-ancestors           | 'none'                                                                                                                 | Nobody can embed this site (CSP-level framing protection)        |
| manifest-src              | 'self'                                                                                                                 | PWA manifest                                                     |
| form-action               | 'self'                                                                                                                 | Forms can only submit to same origin                             |
| base-uri                  | 'self'                                                                                                                 | Prevent base tag injection                                       |
| upgrade-insecure-requests | (present)                                                                                                              | Auto-upgrade HTTP to HTTPS                                       |

## How Headers Are Applied

```
Static routes (15 pages)          vercel.json → Vercel CDN adds headers
                                    ↓
SSR routes (Radar only)           src/middleware.ts → Astro injects headers server-side
                                    ↓
Sync enforcement                  tests/unit/security-headers.test.ts
                                  Reads both sources, fails CI if they diverge
```

## Adding a New External Service

When you add a third-party script, API, or embed:

1. Identify which CSP directive it needs (script-src for JS, connect-src for API calls, frame-src for iframes, etc.)
2. Add the domain to **both** `vercel.json` and `src/middleware.ts` `SECURITY_HEADERS`
3. Run `npm run test:run` — the sync test confirms they match
4. Update the CSP Breakdown table above
5. Document why the service was added (commit message is sufficient)

## Known Limitations

- **`unsafe-inline` for scripts**: Required for theme initialization, GA4 setup, and palette manager inline scripts in `BaseLayout.astro`. Replacing with nonces would require Astro middleware to inject a unique nonce per request into both the CSP header and every inline `<script>` tag — significant complexity for marginal security gain on a site with no user-generated content.
- **`unsafe-inline` for styles**: Required for theme/palette CSS variable initialization. Same nonce tradeoff as scripts.
- **No `report-uri` / `report-to`**: CSP violations are not reported to an endpoint. Could be added via Sentry's CSP reporting feature if violation monitoring is desired.

## Future Considerations

- **Cookie consent banner** (Business Enablement V1): may add a new inline script or external CSS — update CSP when it ships
- **Email capture** (Business Enablement V1): if using an external email service API, add to connect-src
- **Nonce-based CSP**: evaluate if the site adds user-generated content or auth — currently not worth the complexity

---

← Back to [Security Documentation](README.md)
