# Security Documentation

Security architecture, headers, privacy configuration, and compliance posture for the GST website.

## Documents

| Doc                                        | Purpose                                                         | Audience       |
| ------------------------------------------ | --------------------------------------------------------------- | -------------- |
| [SECURITY_HEADERS.md](SECURITY_HEADERS.md) | HTTP security headers, CSP allowlist, middleware implementation | All developers |

## Key Facts

- **CSP enforced**: All routes (static via `vercel.json`, SSR via `src/middleware.ts`)
- **Sentry privacy**: Error-only, no PII, legitimate-interest basis ([SENTRY_MANUAL_SETUP.md](../development/SENTRY_MANUAL_SETUP.md))
- **No user auth**: No login, sessions, or stored credentials
- **No user data**: No forms submit to server (CalendarBridge is external navigation)
- **Cookie consent**: Not yet implemented — tracked in [BACKLOG.md](../development/BACKLOG.md) BL-001

## When to Update These Docs

- Adding an external service (new CSP domain needed)
- Adding user input surfaces (forms, auth, file uploads)
- Shipping the cookie consent banner
- Changing Sentry configuration
- Adding or modifying security headers

---

← Back to [Master Documentation Index](../README.md)
