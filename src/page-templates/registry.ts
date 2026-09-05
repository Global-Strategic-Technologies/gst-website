/**
 * Template map for the non-default-locale catch-all
 * (`src/pages/[locale]/[...route].astro`): Tier A route id → page template.
 *
 * Lives in its own module because Astro's `getStaticPaths` runs in isolation
 * and can see imports but not frontmatter locals. Every entry here must be a
 * `TIER_A_ROUTES` id (`src/i18n/routes.ts`); `tests/unit/i18n-locale.test.ts`
 * checks the two stay aligned.
 *
 * The English route files (`src/pages/about.astro`, …) render these same
 * templates with `DEFAULT_LOCALE`, so a page has exactly one body.
 */
import AboutPage from './AboutPage.astro';
import HomePage from './HomePage.astro';
import PrivacyPage from './PrivacyPage.astro';
import ServicesPage from './ServicesPage.astro';
import TermsPage from './TermsPage.astro';

export const TEMPLATES = {
  home: HomePage,
  services: ServicesPage,
  about: AboutPage,
  privacy: PrivacyPage,
  terms: TermsPage,
} as const;

export type TemplateId = keyof typeof TEMPLATES;
