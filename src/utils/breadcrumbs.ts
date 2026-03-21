/**
 * Shared slug-to-display-name mapping for breadcrumb navigation.
 * Used by both the visual Breadcrumb component and the JSON-LD
 * BreadcrumbList schema in SEO.astro.
 */

/** Canonical slug-to-display-name mapping for all site routes. */
export const BREADCRUMB_NAMES: Record<string, string> = {
  'services': 'Services',
  'about': 'About',
  'ma-portfolio': 'M&A Portfolio',
  'privacy': 'Privacy Policy',
  'terms': 'Terms of Service',
  'hub': 'The GST Hub',
  'tools': 'The Workbench',
  'diligence-machine': 'Diligence Machine',
  'library': 'The Library',
  'business-architectures': 'Business Architectures',
  'vdr-structure': 'VDR Structure',
  'radar': 'The Radar',
  'techpar': 'TechPar',
  'regulatory-map': 'Regulatory Map',
  'tech-debt-calculator': 'Tech Debt Calculator',
  'infrastructure-cost-governance': 'Infrastructure Cost Governance',
};

/**
 * Convert a URL slug to a display name using the canonical mapping,
 * with a title-case fallback for unmapped slugs.
 */
export function slugToName(slug: string): string {
  return BREADCRUMB_NAMES[slug]
    || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
