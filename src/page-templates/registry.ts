/**
 * Template map for the non-default-locale catch-all
 * (`src/pages/[locale]/[...route].astro`): localized route id → page template.
 *
 * Lives in its own module because Astro's `getStaticPaths` runs in isolation
 * and can see imports but not frontmatter locals. Every entry here must be a
 * `LOCALIZED_ROUTES` id (`src/i18n/routes.ts`); `tests/unit/i18n-locale.test.ts`
 * checks the two stay aligned.
 *
 * The English route files (`src/pages/about.astro`, …) render these same
 * templates with `DEFAULT_LOCALE`, so a page has exactly one body.
 */
import AboutPage from './AboutPage.astro';
import HomePage from './HomePage.astro';
import HubIcgPage from './HubIcgPage.astro';
import HubDiligenceMachinePage from './HubDiligenceMachinePage.astro';
import HubRegulatoryMapPage from './HubRegulatoryMapPage.astro';
import HubMcpFromCodePage from './HubMcpFromCodePage.astro';
import HubMcpPage from './HubMcpPage.astro';
import HubMcpTrialPage from './HubMcpTrialPage.astro';
import HubPage from './HubPage.astro';
import HubTechDebtPage from './HubTechDebtPage.astro';
import HubTechParPage from './HubTechParPage.astro';
import HubToolsPage from './HubToolsPage.astro';
import PrivacyPage from './PrivacyPage.astro';
import ServicesPage from './ServicesPage.astro';
import TermsPage from './TermsPage.astro';

export const TEMPLATES = {
  home: HomePage,
  services: ServicesPage,
  about: AboutPage,
  hub: HubPage,
  'hub-tools': HubToolsPage,
  'hub-mcp': HubMcpPage,
  'hub-mcp-trial': HubMcpTrialPage,
  'hub-mcp-from-code': HubMcpFromCodePage,
  privacy: PrivacyPage,
  terms: TermsPage,
  techpar: HubTechParPage,
  'tech-debt-calculator': HubTechDebtPage,
  'infrastructure-cost-governance': HubIcgPage,
  'diligence-machine': HubDiligenceMachinePage,
  'regulatory-map': HubRegulatoryMapPage,
} as const;

export type TemplateId = keyof typeof TEMPLATES;
