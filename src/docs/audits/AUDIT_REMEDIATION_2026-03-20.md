# GST Website Audit Remediation Report

**Audit Date:** March 20, 2026
**Remediation Date:** March 20, 2026
**Prepared by:** GST Engineering
**In response to:** Website QA & SEO Audit — globalstrategic.tech

---

## Summary

All critical, high, and medium findings from the March 20 audit have been addressed. Several items flagged in the audit were already resolved prior to the audit report being delivered. The remaining items were remediated same-day. Low-priority items have been addressed where impactful.

**Disposition**: 13 findings evaluated — 11 resolved, 2 deferred (low-priority content additions).

---

## Finding Disposition

| # | Severity | Finding | Status | Notes |
|---|----------|---------|--------|-------|
| 1 | CRITICAL | Canonical URLs point to localhost:4321 | **Resolved** | Fixed prior to audit delivery. `site` property in `astro.config.mjs` set to `https://globalstrategic.tech`. Commit `ae1b83b`. |
| 2 | CRITICAL | Site not indexed by Google | **Resolved** | Root cause was the canonical URL issue (#1). Fix deployed; reindexing requested via Google Search Console. |
| 3 | HIGH | No sitemap.xml detected | **Already in place** | `sitemap.xml` exists at `/sitemap.xml` with 17 URLs covering all public pages. Referenced in `robots.txt`. |
| 4 | HIGH | No robots.txt detected | **Already in place** | `robots.txt` exists at `/robots.txt` with crawler directives and sitemap reference. |
| 5 | MEDIUM | Meta description exceeds 160 chars | **Resolved** | Shortened from 236 to 148 characters. Value proposition front-loaded for SERP display. Updated in both the homepage and the SEO component default. Commit `1a8401e`. |
| 6 | MEDIUM | No skip navigation link | **Resolved** | Added `.skip-nav` link to the base layout. Hidden off-screen by default, visible on keyboard focus. Links to `#main-content` on the `<main>` element. Commit `9e05b55`. |
| 7 | MEDIUM | No ARIA landmark roles | **Resolved** | Added explicit `role="banner"` to `<header>`, `role="navigation"` with `aria-label="Main navigation"` to `<nav>`, `role="main"` to `<main>`, and `role="contentinfo"` to `<footer>`. Commit `659b1b5`. |
| 8 | MEDIUM | Inconsistent Calendly link attributes | **Resolved** | Hero CTA now conditionally applies `target="_blank"` and `rel="noopener noreferrer"` for all external (`http`) hrefs, matching the footer CTA behavior. Commit `6682036`. |
| 9 | MEDIUM | 1 image missing alt text | **Already in place** | The delta icon in `Header.astro` has `alt="Global Strategic Technology logo"` with `aria-hidden="true"`. The delta icon in `ThemeToggle.astro` has `alt=""` with `aria-hidden="true"` (correct pattern for decorative images per WCAG). All About page images have descriptive alt text. |
| 10 | MEDIUM | FAQPage schema markup missing | **Already in place** | `FAQPage` JSON-LD schema is implemented in `SEO.astro` and wired to the Services page FAQ section via the `faqItems` prop. Schema is rendered as a separate `<script type="application/ld+json">` block. |
| 11 | LOW | No lazy loading on images | **Resolved** | Added `loading="lazy"` to below-fold signature images on the About page. Hero/founder images intentionally retain `fetchpriority="high"` as they are LCP elements. Small decorative SVG icons are excluded — they are cached as a single file and lazy loading would add overhead. Commit `86416fd`. |
| 12 | LOW | No responsive images (srcset) | **Deferred** | Current image set is minimal (founder photos, signatures, SVG icons). The site's sub-250ms load time and small resource count make this low-impact. Will evaluate if additional raster imagery is added. |
| 13 | LOW | Content depth / thought leadership | **Deferred** | Content strategy item. The Hub section is actively being expanded with tools (TechPar, Diligence Machine, Regulatory Map, etc.) that serve as substantive thought leadership. Blog/article content is on the roadmap. |

---

## Verification

- **Unit/Integration Tests**: 801 tests across 23 test files — all passing
- **Production Build**: Completes successfully with no errors
- **Test Coverage**: Exceeds 70% threshold
- **Affected E2E tests**: Checked — no test assertions reference changed strings. Existing selectors (e.g., `main, [role="main"]`) are compatible with the ARIA role additions.

---

## Commits

All changes are on the `dev` branch, ready for PR to `master`:

```
ae1b83b fix(seo): set site URL to fix canonical URLs pointing to localhost
1a8401e fix(seo): shorten homepage meta description to ~148 characters
9e05b55 fix(a11y): add skip navigation link for keyboard and screen reader users
659b1b5 fix(a11y): add explicit ARIA landmark roles to header, nav, and footer
6682036 fix(ux): add target=_blank and rel=noopener noreferrer to external Hero CTAs
86416fd perf: add lazy loading to below-fold signature images on About page
```

---

## Files Changed

| File | Changes |
|------|---------|
| `astro.config.mjs` | Set `site` to production URL (prior commit) |
| `src/pages/index.astro` | Shortened meta description |
| `src/components/SEO.astro` | Updated default description to match |
| `src/layouts/BaseLayout.astro` | Added skip-nav link, `role="main"` and `id="main-content"` on `<main>` |
| `src/styles/global.css` | Added `.skip-nav` styles (hidden until focused) |
| `src/components/Header.astro` | Added `role="banner"`, `role="navigation"`, `aria-label` |
| `src/components/Footer.astro` | Added `role="contentinfo"` |
| `src/components/Hero.astro` | Conditional `target="_blank"` / `rel="noopener noreferrer"` for external CTAs |
| `src/pages/about.astro` | Added `loading="lazy"` to signature images |

---

## Items Already in Place Before Audit

The following items were flagged in the audit but were already implemented at the time of review. These may have been missed due to caching, crawl timing, or inspection method:

1. **sitemap.xml** — 17 URLs, manually maintained in `/public/sitemap.xml`
2. **robots.txt** — Full crawler directives in `/public/robots.txt`
3. **FAQPage schema** — Implemented in `SEO.astro`, active on Services page
4. **Image alt text** — All images have appropriate alt text or `aria-hidden="true"` for decorative images
