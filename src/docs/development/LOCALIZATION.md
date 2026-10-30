# Localization

How the website speaks more than one language: the locale model, where copy lives, how to add a string, a page or a locale, how translations are reviewed and kept current, and how a locale goes from draft to live. Decisions and their rationale are in [ADR-0030](../adr/0030-website-locale-model.md); this is the operating manual. The UX it implements is the Claude Design hand-off, [LOCALIZATION_HANDOFF_BL-153.md](LOCALIZATION_HANDOFF_BL-153.md).

## The model in one paragraph

A locale is `language[-REGION]` — `en`, `es`, `pt-BR` today — and lives as one row in [`src/i18n/locales.ts`](../../i18n/locales.ts). Everything that varies by language reads that registry: `astro.config.mjs` (routing and sitemap alternates), `BaseLayout` (`<html lang>`, chrome copy), `SEO.astro` (canonical, hreflang, `og:locale`, BreadcrumbList), the switcher and the first-visit band. English is unprefixed (`/about/`); every other locale is prefixed by its `path` (`/es/about/`, `/pt/about/`). A visitor's language is resolved **exact → language → default**, so `pt-PT` lands on `pt-BR` until a `pt-PT` row exists. Region (currency, units) is a separate preference axis and never selects a catalog.

## Files

| Path                                            | What it is                                                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/i18n/locales.ts`                           | The registry + `resolveLocale`, `localeFromPath`, `liveLocales`, config adapters. Pure TS — imported by `astro.config.mjs` in Node.                 |
| `src/i18n/routes.ts`                            | `TIER_A_ROUTES` (the launch set), `TIER_B_ROUTES` (localized hub tools), `LOCALIZED_ROUTES` (both), `localizedHref`, `alternatesFor`, `localeHome`. |
| `src/i18n/t.ts`                                 | `useTranslations(locale, ns)` → `t()` / `tHtml()`, typed from the English catalogs.                                                                 |
| `src/i18n/formatters.ts`                        | `formatDate` / `formatNumber` / `formatCurrency` over `Intl`, by registry locale or bare tag.                                                       |
| `src/i18n/currency.ts`                          | Hub-tool display currencies: the code allowlist, symbols, legacy-symbol map, `formatMoneyShort` (see § Display currency).                           |
| `src/i18n/interpolate.ts`                       | `{name}` filling, shared by `t()` and the tool scripts without pulling the catalogs into the browser.                                               |
| `src/i18n/<locale>/<ns>.json`                   | Catalogs: flat dot-keys → strings. `en/` is the schema.                                                                                             |
| `src/i18n/<locale>/<ns>.source.json`            | Sidecars: key → hash of the English string the translation was made from. Written by `npm run i18n:stamp`, checked by `test:docs`.                  |
| `src/page-templates/<Name>Page.astro`           | One body per route, taking `locale`. Rendered by the English route file and by the catch-all.                                                       |
| `src/page-templates/registry.ts`                | Route id → template, for the catch-all.                                                                                                             |
| `src/pages/[locale]/[...route].astro`           | Every non-English page. `getStaticPaths` = non-default locales × `LOCALIZED_ROUTES` with a template.                                                |
| `scripts/i18n-stamp-sources.mjs`                | The stamping script (`npm run i18n:stamp [locale] [ns]`, `npm run i18n:check`).                                                                     |
| `tests/unit/i18n-locale.test.ts`                | Resolver, path parsing, `localizedHref` rule, alternates/draft behaviour, config adapters, template↔route alignment.                                |
| `tests/integration/i18n-catalog-parity.test.ts` | Key parity, staleness, markup allowlist, no empty strings. Runs in `npm run test:docs`.                                                             |
| `tests/unit/i18n-no-stray-literals.test.ts`     | No `'pt-BR'`, `'/es/'`, `'es_CO'`… quoted outside `src/i18n/`.                                                                                      |
| `tests/e2e/localization.test.ts`                | Rendered-page contract: `<html lang>`, canonical, `og:locale`, hreflang per status, switcher and band behaviour (see § Testing).                    |

## Content tiers

| Tier | Pages                                                                                                                                                                                                                                                                                                          | Localized?                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A    | `/`, `/services/`, `/about/`, `/hub/`, `/hub/tools/`, `/hub/mcp/`, `/hub/mcp/trial/`, `/hub/mcp/from-code/`, `/privacy/`, `/terms/`                                                                                                                                                                            | Yes — a locale launches with all of them or not at all (`TIER_A_ROUTES`)                 |
| B    | Hub tool UIs (`/hub/tools/<tool>/`) — **TechPar** (2026-10-24), the **Tech Debt Calculator**, **ICG** (2026-10-26), the **Diligence Machine** (2026-10-27) the **Regulatory Map** with its regulation texts (2026-10-28) and the **IRL Generator** with its workbook (2026-10-29) live; the IRL Extractor next | Per tool, as it is listed in `TIER_B_ROUTES`; English-only until then                    |
| C    | MCP media guides (`get-started`, `using`, `advanced-operations`, `docs`), portfolio entries and library articles (their chrome is Tier B), radar, brand                                                                                                                                                        | English only. Linked from localized pages with the `common.notice.contentInEnglish` line |
| —    | `/404`, `/500`                                                                                                                                                                                                                                                                                                 | English chrome + trilingual hint (Vercel serves one static error page)                   |

**The `/hub/mcp/` asymmetry is deliberate.** The two self-serve surfaces, the trial signup (BL-155) and the from-code guide it links to (BL-156), are Tier A because strangers arrive at them from any locale with nobody to talk to. The four guides beside them stay English-only because a roster pilot is onboarded by a human who speaks to them, and because three of the four carry recorded media that would need re-recording per locale. It reads as an oversight from either side; do not "fix" it in either direction without an operator decision.

`localizedHref(path, locale)` encodes the tiers: it prefixes `LOCALIZED_ROUTES` paths (Tier A and the registered Tier B tools) and returns everything else unchanged.

**A new locale carries Tier B too.** The catch-all builds every locale × `LOCALIZED_ROUTES`, and the parity guard requires every namespace in every locale, so adding a locale means translating the registered Tier B tools' namespaces as well as Tier A ([ADR-0030 § Amendment 2026-10-24](../adr/0030-website-locale-model.md#amendment--2026-10-24-bl-153-slice-3-tier-b-routes-and-the-display-currency)).

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
3. Add `{ id, path }` to `TIER_A_ROUTES` (a launch page) or `TIER_B_ROUTES` (a hub tool), and `id: XPage` to `TEMPLATES` in `registry.ts`.
4. Pass `locale` to any chrome component that takes it (`Hero`, `CTASection`, `PrintReportHeader`, …).
5. `npm run build`; confirm `dist/client/<path>/index.html` exists for each non-default locale.
6. A tool page with a client script: see § Tool scripts.

### Add a locale

1. Add a row to `LOCALES` in `src/i18n/locales.ts` with `status: 'draft'`. A dialect (`pt-PT`) sets `language: 'pt'`; the resolver's language step is ordered "the locale whose code IS the language, then registry order", so check which row wins for a bare `pt`.
2. Create `src/i18n/<code>/` with every namespace English has; translate; stamp.
3. Build and review on a preview deploy — draft URLs are reachable but `noindex`.
4. Go live (below).

### Draft → live checklist

> `es` and `pt-BR` were set live on 2026-09-05 by operator decision before this checklist was run, so the switcher and band ship at once. The first two items below are still owed for both; treat the catalogs as first-pass translations until they are done.

- [ ] Native-speaker review of every namespace recorded (who, when) in the PR. **Owed**: every Tier A namespace (since 2026-09-05) and the Tier B namespaces `techpar` (2026-10-24), `tech-debt-calculator` and `infrastructure-cost-governance` (2026-10-26), `diligence-machine` and `diligence-machine-data` (2026-10-27), `regulatory-map`, `regulatory-map-geo` and `regulatory-map-data` (2026-10-28), `information-request-list-generator` and `information-request-list-generator-data` (2026-10-29), published machine-translated by operator decision; their es and pt-BR sidecars are stamped against the English they were translated from, not against a review
- [ ] `npm run i18n:check` clean (no stale sidecars)
- [ ] Longest strings checked at desktop / 768px / 480px / 360px in light and dark (`/es/services/` is the widest page), per [STYLES_GUIDE § Text expansion](../styles/STYLES_GUIDE.md#text-expansion-localized-copy) — including any state a page hides until a visitor acts
- [ ] `PUBLIC_I18N_LIVE_LOCALES=<code> npm run build`: hreflang + `x-default` appear on English pages, `dist/client/sitemap-0.xml` lists the locale's URLs with `xhtml:link` alternates
- [ ] Flip `status: 'live'` in the registry; commit; Search Console verifies the locale indexes with no hreflang errors before it is announced (BL-152)

## Tool scripts

A hub tool renders much of its text from a client script. The page hands that script its strings in one JSON island, and the script never imports `t.ts` (its eager glob would put every catalog of every locale in the browser bundle). TechPar, the Tech Debt Calculator, ICG, the Diligence Machine, the Regulatory Map and the IRL Generator are the references:

- The template builds the island from the catalog: `<script type="application/json" data-techpar-strings set:html={…}>`, escaping `<` exactly as `HubMcpTrialPage.astro` does.
- `src/scripts/<tool>/strings.ts` binds the shared reader, `createToolStrings({ en, prefixes, selector })` in `src/scripts/tool-strings.ts`, to the tool's English catalog, the key prefixes its script reads (the island carries only those) and its island selector. The reader parses the island lazily and exposes `s(key, params)` / `sHtml(key, params)` (params escaped), filling `{name}` with `src/i18n/interpolate.ts`. When no island exists — a unit test importing the script under jsdom — it falls back to the English catalog, so tests and the English page render the same text.
- Content only the script reads moves into the catalog. Content the engine or the MCP server also emits stays English in code and is translated at render **by key** (TechPar's stage labels, zone names and category names; the MCP's output is English by contract). A unit test pins the English catalog to the code for those keys.
- A sentence built by splicing a translated fragment into prose (`'Your ratio is ' + zone.toLowerCase()`) does not survive translation: key the whole sentence per case instead.
- Numbers use the page's `<html lang>` on both sides: the template formats its first paint with `locale.htmlLang`, the script reads it with `pageLang()` from `tool-strings.ts` (`formatFixed`, `formatPlain` and `formatNumber` in `formatters.ts`).
- Counts pick a `one` / `other` key with `pluralKey` (`Intl.PluralRules`, with every category English lacks folded into `other`), and name lists join with `formatList`, which keeps a page's own English joiner. A sentence that names one or two things is better keyed per case (ICG's `js.foundational.one|two`) than joined.
- Content the MCP server also emits that lives in TypeScript data the Worker imports (ICG's domains, questions and recommendations) cannot be moved into `src/i18n/`, which the MCP workflows' path filters do not cover: the English catalog mirrors it by id and a unit test pins the two.
- When that mirror is large, give it its own namespace whose English the script never imports (the Diligence Machine's `diligence-machine-data`): the template puts its keys in the island on es and pt pages, and the script's lookups fall back to the TypeScript data it already bundles (`hasString(key) ? s(key) : data`), so the English page ships the prose once.
- When the mirror is too large for an island (the Regulatory Map's 128 regulation texts, about 150,000 characters per locale), serve it instead: `regulatory-map-data` is translated into prerendered per-locale endpoints (`/data/reg-index/<locale>.json`, `/data/regulations/<locale>/<id>.json`, built by `src/lib/regulation-i18n.ts`), and the template writes their URLs, with a content-hash `?v=`, on the page for the script to fetch. Its English mirror is generated from the regulation files by `npm run i18n:sync-regulatory-map` (requirements are numbered, so an inserted one renumbers its siblings) and pinned by `tests/unit/regulatory-map-catalog.test.ts`. **Editing a regulation**: edit the file → `npm run i18n:sync-regulatory-map` → retranslate the stale es and pt-BR keys → `npm run i18n:stamp`. A new regulation carries its es and pt-BR text in the same PR, or the parity guard fails.
- Page-only copy that sits in a data file the Worker imports for other reasons (the Diligence Machine's wizard labels in `wizard-config.ts`, whose `*_IDS` the MCP schema uses) moves into the catalog outright and the data file keeps only ids: there is nothing for the MCP to keep in English, so a mirror would be a second copy.
- A file the tool hands out (the IRL Generator's `.xlsx`) is translated where a person reads it and stays English wherever code reads it back ([ADR-0030 § Amendment, 2026-10-29 note](../adr/0030-website-locale-model.md#amendment--2026-10-24-bl-153-slice-3-tier-b-routes-and-the-display-currency)). A builder shared with the MCP server takes the translated text as an optional parameter whose default is the English (`IRL_XLSX_LABELS_EN`), so the MCP output does not move; the page fills it from the `-data` namespace in the island. **Editing an IRL request**: edit `src/data/irl/information-request-list.md` → update the key `tests/unit/irl-generator-catalog.test.ts` names in `information-request-list-generator-data.json` → retranslate the stale es and pt-BR keys → `npm run i18n:stamp` ([`src/data/irl/README.md` § Editing a request — translations](../../data/irl/README.md#editing-a-request--translations)).
- A text field that shows a formatted amount must read it back in the same language: the Tech Debt Calculator runs typed amounts through `normalizeLocaleAmount` (`1,5M` is 1.5M on `/pt/` and `/es/`).
- Analytics payloads stay English and dot-decimal.

## Display currency

Hub-tool currency is a **display unit, never a conversion**, and defaults to **USD in every locale** — the visitor states the currency their numbers are in ([ADR-0030 § 10 and the 2026-10-24 amendment](../adr/0030-website-locale-model.md)). `src/i18n/currency.ts` holds the code list (`USD EUR GBP BRL CAD AUD`) and is the only way a currency is read from a URL or storage: `parseCurrencyParam` accepts a code or a pre-codes legacy symbol and returns USD for anything else, because the value is painted into the page. A tool persists the choice per tool and always writes it as a code (TechPar: `u` in its URL and saved state; Tech Debt: `cur` beside `s`, URL only). Money prints with `formatMoneyShort` — TechPar's `$1.6M` shape, the page language's decimal separator (`R$1,6M`); other numbers with `formatters.ts`.

## Search Console and Google after go-live

What multilingual SEO requires of Google is mostly patience; the signals it reads are already on every page (own URL per language, `<html lang>`, a full `hreflang` cluster with `x-default` → English, a self-canonical, translated titles/descriptions/Open Graph, `inLanguage`, sitemap alternates, and no language-based redirect). The page tags are the source of truth: `@astrojs/sitemap` writes the three language alternates per URL but not `x-default`, which only the pages carry — Google accepts hreflang from either source, so this is complete, not a gap to fix. Operator steps:

1. **No new property, no country target.** The domain property covers `/es/` and `/pt/`. Language is not country: do not set geotargeting.
2. **Sitemap.** `sitemap-index.xml` is already submitted; re-submit the same URL after the first deploy to prompt a fetch. Never submit `/sitemap.xml` (see SEO_IMPLEMENTATION.md).
3. **URL Inspection** on `/es/` and `/pt/` once deployed: confirm Google has crawled them and that the canonical it chose is the page's own URL. A Google-selected English canonical on a translated page is the failure to chase.
4. **Expect a lag** of days to weeks before the URLs appear in Performance; then filter by page (`/es/`, `/pt/`) and by country. The International Targeting report no longer exists (removed 2022); `hreflang` correctness is proven by `tests/e2e/localization.test.ts` and URL Inspection.
5. **Translation quality is the SEO lever.** Google treats unreviewed machine translation offered to users as low-value; complete the native-speaker review in the checklist above.
6. **GA4**: the `locale` event parameter is **already registered** as an event-scope custom dimension ("Locale", created 2026-09-06, verified in the property 2026-09-17), which is what makes engagement segmentable by language. Do not create a second definition on the same parameter — it only burns the property's quota.
7. **Do not**: add a language subdomain or domain, auto-redirect by browser language or IP, or translate URL slugs.

## Translation workflow

English is authored first, in the `gst-page-content` register. First-pass translations are generated in-session and marked for review; the sidecar hash pins which English each was made from. A translation is _current_ when its sidecar hash equals the hash of today's English string — that is the whole staleness model, and it is why the guard fails the moment English is edited without the translation being revisited. Register notes for translators: formal address (`usted` / `você`), no flags or locale clichés, product and tool names stay in English (`TechPar`, `Diligence Machine`, `MCP`), the CTA button string `BOOK_CALENDAR_SLOT()` is code-styled and untranslated.

**Spanish is Colombian Spanish** (operator decision 2026-09-05). The locale stays `es` — one URL prefix, `Español` in the switcher — but the registry's `intl` / `ogLocale` are `es-CO` / `es_CO` and the catalogs use the Colombian business register: _inversionistas_ (not _inversores_), _junta directiva_ (not _consejo_), _gerencia_ / _alta gerencia_ (not _la dirección_), _transacción_ for a deal (not _operación_), _participación de mercado_ (not _cuota_), _utilidades_ for profits (not _beneficios_), _diligenciar_ a form (not _rellenar_), _cancelar la suscripción_ (not _darse de baja_), _arrendar_ (not _alquilar_), _ingrese_ / _digite_ (not _introduzca_ / _teclee_), _en la nube_ (not _cloud_), _de forma predeterminada_ (not _por defecto_), _escalamiento_, _desempeño_, _calificar_ a score. Portuguese is Brazilian: the menu shows the bare `Português` because there is one Portuguese on the site, not a dialect pair.

## Testing

- `npm run test:run` covers the unit guards; `npm run test:docs` runs catalog parity + staleness.
- The switcher and band render only when ≥2 locales are **live**. `es` and `pt-BR` are live, so `tests/e2e/localization.test.ts` runs against the ordinary Playwright server like every other spec, and its first test fails by name if fewer than two locales are live — so parking a locale as `draft` is a visible spec change, not a silent pass. `PUBLIC_I18N_LIVE_LOCALES=<codes>` still forces liveness for a one-off build or dev server (previewing a draft as live).
- **Do not add a second dev server to `playwright.config.ts`** for a forced-live run. It was tried: in CI both servers boot cold and share `node_modules/.vite`, and one's dependency re-optimization served the other's page a `504 Outdated Optimize Dep` on a dynamic import (TechPar's `chart.js`), emptying a UI region with no console error (2026-09-05, trace-confirmed, two consecutive red runs). See [TROUBLESHOOTING.md](../testing/TROUBLESHOOTING.md#a-ui-region-renders-empty-and-the-test-fails-locally-but-ci-is-green).

## Persistence and suggestion

`localStorage.gstLang` holds the locale code. It is written when a visitor picks a language in the switcher or interacts with the first-visit band, and read only to decide whether to show the band. It never redirects. The suggestion comes from `navigator.languages` through `resolveLocale`; there is no cookie and no geolocation.

## Announcement sash

The sash registry (`src/data/announcements.ts`) stays English and is matched on the locale-free route path. Other locales' copy lives in `src/i18n/<locale>/announcements.json` under `<id>.badge`, `<id>.label`, `<id>.subtext.<n>`, `<id>.subtext.<n>.ariaLabel`, `<id>.ariaLabel` and `<id>.cardBadge`; `localizeAnnouncement` (`src/data/announcements-i18n.ts`, a separate module because Playwright specs import the registry under plain Node) overlays it and prefixes Tier A hrefs (fragments kept). The English catalog mirrors the registry and a unit test holds them equal. A translation must fit the sash's copy budget (~34 characters across the under-band fields, badge ≤ 5); `tests/e2e/localization.test.ts` measures the ink against the corner box on `/es/` and `/pt/` the way the English spec does.

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
