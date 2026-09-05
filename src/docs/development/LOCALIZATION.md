# Localization

How the website speaks more than one language: the locale model, where copy lives, how to add a string, a page or a locale, how translations are reviewed and kept current, and how a locale goes from draft to live. Decisions and their rationale are in [ADR-0030](../adr/0030-website-locale-model.md); this is the operating manual. The UX it implements is the Claude Design hand-off, [LOCALIZATION_HANDOFF_BL-153.md](LOCALIZATION_HANDOFF_BL-153.md).

## The model in one paragraph

A locale is `language[-REGION]` — `en`, `es`, `pt-BR` today — and lives as one row in [`src/i18n/locales.ts`](../../i18n/locales.ts). Everything that varies by language reads that registry: `astro.config.mjs` (routing and sitemap alternates), `BaseLayout` (`<html lang>`, chrome copy), `SEO.astro` (canonical, hreflang, `og:locale`, BreadcrumbList), the switcher and the first-visit band. English is unprefixed (`/about/`); every other locale is prefixed by its `path` (`/es/about/`, `/pt-br/about/`). A visitor's language is resolved **exact → language → default**, so `pt-PT` lands on `pt-BR` until a `pt-PT` row exists. Region (currency, units) is a separate preference axis and never selects a catalog.

## Files

| Path                                            | What it is                                                                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/i18n/locales.ts`                           | The registry + `resolveLocale`, `localeFromPath`, `liveLocales`, config adapters. Pure TS — imported by `astro.config.mjs` in Node.                                  |
| `src/i18n/routes.ts`                            | `TIER_A_ROUTES` (the routes every locale carries), `localizedHref`, `alternatesFor`, `localeHome`.                                                                   |
| `src/i18n/t.ts`                                 | `useTranslations(locale, ns)` → `t()` / `tHtml()`, typed from the English catalogs.                                                                                  |
| `src/i18n/formatters.ts`                        | `formatDate` / `formatNumber` / `formatCurrency` over `Intl`, by registry locale or bare tag.                                                                        |
| `src/i18n/<locale>/<ns>.json`                   | Catalogs: flat dot-keys → strings. `en/` is the schema.                                                                                                              |
| `src/i18n/<locale>/<ns>.source.json`            | Sidecars: key → hash of the English string the translation was made from. Written by `npm run i18n:stamp`, checked by `test:docs`.                                   |
| `src/page-templates/<Name>Page.astro`           | One body per route, taking `locale`. Rendered by the English route file and by the catch-all.                                                                        |
| `src/page-templates/registry.ts`                | Route id → template, for the catch-all.                                                                                                                              |
| `src/pages/[locale]/[...route].astro`           | Every non-English page. `getStaticPaths` = non-default locales × Tier A routes with a template.                                                                      |
| `scripts/i18n-stamp-sources.mjs`                | The stamping script (`npm run i18n:stamp [locale] [ns]`, `npm run i18n:check`).                                                                                      |
| `tests/unit/i18n-locale.test.ts`                | Resolver, path parsing, `localizedHref` rule, alternates/draft behaviour, config adapters, template↔route alignment.                                                 |
| `tests/integration/i18n-catalog-parity.test.ts` | Key parity, staleness, markup allowlist, no empty strings. Runs in `npm run test:docs`.                                                                              |
| `tests/unit/i18n-no-stray-literals.test.ts`     | No `'pt-BR'`, `'/es/'`, `'es_ES'`… quoted outside `src/i18n/`.                                                                                                       |
| `tests/e2e/localization.test.ts`                | Rendered-page contract: `<html lang>`, canonical, `og:locale`, hreflang per status, switcher and band behaviour (against the forced-live dev server, see § Testing). |

## Content tiers

| Tier | Pages                                                                                     | Localized?                                                                               |
| ---- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A    | `/`, `/services/`, `/about/`, `/hub/`, `/hub/tools/`, `/hub/mcp/`, `/privacy/`, `/terms/` | Yes — a locale launches with all of them or not at all (`TIER_A_ROUTES`)                 |
| B    | Hub tool UIs (`/hub/tools/<tool>/`)                                                       | Not yet; `formatters.ts` is ready for them. Currency control is BL-153's follow-up       |
| C    | MCP guides, portfolio, library, radar, brand                                              | English only. Linked from localized pages with the `common.notice.contentInEnglish` line |
| —    | `/404`, `/500`                                                                            | English chrome + trilingual hint (Vercel serves one static error page)                   |

`localizedHref(path, locale)` encodes the tiers: it prefixes Tier A paths and returns everything else unchanged.

## How to…

### Add or change a string

1. Add the key to `src/i18n/en/<ns>.json` (flat, dot-separated: `founder.p1`). Use `{name}` for interpolation.
2. Use it: `const { t } = useTranslations(locale, '<ns>')` then `{t('founder.p1')}`. For inline markup (`<a>`, `<strong>`, `<em>`, `<br>`, `<code>`, plus `<p>` for a multi-paragraph answer — nothing else) use `set:html={tHtml('key')}`.
3. Add the same key to every other locale's `<ns>.json`. English changed but the translation didn't? Leave it — the staleness guard will say so.
4. When each translation has been reviewed against the current English, stamp it: `npm run i18n:stamp <locale> <ns>`. Stamping is a reviewer's act, not a build step; never run it to silence the guard.
5. `npm run test:docs` (parity + staleness) and, per CLAUDE.md Directive 11, grep `tests/` for any English string you changed.

### Add a namespace

New page copy gets its own namespace named after the route id (`about`, `hub-tools`). Create `en/<ns>.json`, add it to the `EN` map in `src/i18n/t.ts` (one line — that is what types the keys), create the other locales' files, stamp.

### Add a page to every locale

1. Move the body into `src/page-templates/<Name>Page.astro` with `interface Props { locale: Locale }`; it renders `BaseLayout` itself.
2. Make the root route file a wrapper: `<XPage locale={DEFAULT_LOCALE} />` (keep the file where it is — tests scan by path).
3. Add `{ id, path }` to `TIER_A_ROUTES` and `id: XPage` to `TEMPLATES` in `registry.ts`.
4. Pass `locale` to any chrome component that takes it (`Hero`, `CTASection`, `PrintReportHeader`, …).
5. `npm run build`; confirm `dist/client/<path>/index.html` exists for each non-default locale.

### Add a locale

1. Add a row to `LOCALES` in `src/i18n/locales.ts` with `status: 'draft'`. A dialect (`pt-PT`) sets `language: 'pt'`; the resolver's language step is ordered "the locale whose code IS the language, then registry order", so check which row wins for a bare `pt`.
2. Create `src/i18n/<code>/` with every namespace English has; translate; stamp.
3. Build and review on a preview deploy — draft URLs are reachable but `noindex`.
4. Go live (below).

### Draft → live checklist

> `es` and `pt-BR` were set live on 2026-09-05 by operator decision before this checklist was run, so the switcher and band ship at once. The first two items below are still owed for both; treat the catalogs as first-pass translations until they are done.

- [ ] Native-speaker review of every namespace recorded (who, when) in the PR
- [ ] `npm run i18n:check` clean (no stale sidecars)
- [ ] Longest strings checked at desktop / 768px / 480px in light and dark (`/es/services/` is the widest page)
- [ ] `PUBLIC_I18N_LIVE_LOCALES=<code> npm run build`: hreflang + `x-default` appear on English pages, `dist/client/sitemap-0.xml` lists the locale's URLs with `xhtml:link` alternates
- [ ] Flip `status: 'live'` in the registry; commit; Search Console verifies the locale indexes with no hreflang errors before it is announced (BL-152)

## Search Console and Google after go-live

What multilingual SEO requires of Google is mostly patience; the signals it reads are already on every page (own URL per language, `<html lang>`, a full `hreflang` cluster with `x-default` → English, a self-canonical, translated titles/descriptions/Open Graph, `inLanguage`, sitemap alternates, and no language-based redirect). Operator steps:

1. **No new property, no country target.** The domain property covers `/es/` and `/pt-br/`. Language is not country: do not set geotargeting.
2. **Sitemap.** `sitemap-index.xml` is already submitted; re-submit the same URL after the first deploy to prompt a fetch. Never submit `/sitemap.xml` (see SEO_IMPLEMENTATION.md).
3. **URL Inspection** on `/es/` and `/pt-br/` once deployed: confirm Google has crawled them and that the canonical it chose is the page's own URL. A Google-selected English canonical on a translated page is the failure to chase.
4. **Expect a lag** of days to weeks before the URLs appear in Performance; then filter by page (`/es/`, `/pt-br/`) and by country. The International Targeting report no longer exists (removed 2022); `hreflang` correctness is proven by `tests/e2e/localization.test.ts` and URL Inspection.
5. **Translation quality is the SEO lever.** Google treats unreviewed machine translation offered to users as low-value; complete the native-speaker review in the checklist above.
6. **GA4**: register the `locale` event parameter as a custom dimension once, or engagement cannot be segmented by language.
7. **Do not**: add a language subdomain or domain, auto-redirect by browser language or IP, or translate URL slugs.

## Translation workflow

English is authored first, in the `gst-page-content` register. First-pass translations are generated in-session and marked for review; the sidecar hash pins which English each was made from. A translation is _current_ when its sidecar hash equals the hash of today's English string — that is the whole staleness model, and it is why the guard fails the moment English is edited without the translation being revisited. Register notes for translators: formal address (`usted` / `você`), no flags or locale clichés, product and tool names stay in English (`TechPar`, `Diligence Machine`, `MCP`), the CTA button string `BOOK_CALENDAR_SLOT()` is code-styled and untranslated.

## Testing

- `npm run test:run` covers the unit guards; `npm run test:docs` runs catalog parity + staleness.
- The switcher and band render only when ≥2 locales are **live**, which in production is not yet the case. `PUBLIC_I18N_LIVE_LOCALES=es,pt-BR` forces liveness for a build or dev server. The Playwright config boots a **second** dev server on port **4326** with that variable set, and `tests/e2e/localization.test.ts` pins its `baseURL` to it — the operator's own server on 4321 is neither reused for that spec nor touched (see [DEVELOPER_TOOLING.md § Playwright](DEVELOPER_TOOLING.md)). The spec asserts up front that the served page reports ≥2 live locales, so a mis-wired server fails loudly instead of passing vacuously.
- Astro auto-increments a busy port: if 4326 is taken the second server comes up on 4327 and the spec's pinned `baseURL` misses it. Free the port rather than moving the pin.

## Persistence and suggestion

`localStorage.gstLang` holds the locale code. It is written when a visitor picks a language in the switcher or interacts with the first-visit band, and read only to decide whether to show the band. It never redirects. The suggestion comes from `navigator.languages` through `resolveLocale`; there is no cookie and no geolocation.

## Announcement sash

The sash registry (`src/data/announcements.ts`) stays English and is matched on the locale-free route path. Other locales' copy lives in `src/i18n/<locale>/announcements.json` under `<id>.badge`, `<id>.label`, `<id>.subtext.<n>`, `<id>.subtext.<n>.ariaLabel`, `<id>.ariaLabel` and `<id>.cardBadge`; `localizeAnnouncement` (`src/data/announcements-i18n.ts`, a separate module because Playwright specs import the registry under plain Node) overlays it and prefixes Tier A hrefs (fragments kept). The English catalog mirrors the registry and a unit test holds them equal. A translation must fit the sash's copy budget (~34 characters across the under-band fields, badge ≤ 5); `tests/e2e/localization.test.ts` measures the ink against the corner box on `/es/` and `/pt-br/` the way the English spec does.

## Switcher and band — where they live

| Path                                        | What it is                                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/LanguageSwitcher.astro`     | The last `<li>` of the nav (composed by `HeaderNavLinks.astro`, both branches): one `.brutal-segmented--sm` trigger + `.lang-menu`. Renders nothing under two live locales |
| `src/scripts/lang-switch.ts`                | Disclosure + `role="menu"` keyboard contract, `gstLang` write and `locale_switch` event on pick. Loaded by the component's `<script>`                                      |
| `src/components/LanguageBand.astro`         | One hidden band per live locale other than the current one, inside an `aria-live` host; rendered by `BaseLayout` right after `<Header>`                                    |
| `src/components/LanguageBandScript.astro`   | The band's inline reveal script (`is:inline`, no imports), in its own file so it can be rendered conditionally with the band                                               |
| `src/styles/components/lang-switch.css`     | Menu, open-state border, header density (36px / 32px at ≤480), 44px rows (52px at ≤480). Imported by `global.css`                                                          |
| `src/styles/components/lang-band.css`       | The hand-off's band CSS via tokens; the 1px/6px chip padding is an accepted spacing residual                                                                               |
| `src/components/DeltaIcon.astro` (`filled`) | Additive prop: solid `currentColor` delta, the current-row marker in the menu                                                                                              |

Copy for both lives in `common.json` (`switcher.*`, `band.*`); the band's decline label is the CURRENT page locale's `band.continue`, everything else in the band is the suggested locale's.
