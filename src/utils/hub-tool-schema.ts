/**
 * `WebApplication` JSON-LD for the hub tool pages.
 *
 * Every page under `src/pages/hub/tools/<tool>/` describes itself to crawlers
 * with the same schema shape, differing only in the per-tool fields below.
 * Those literals used to be copy-pasted into all six pages, and they drifted:
 * the IRL generator shipped without the `knowsAbout` array its five siblings
 * carried, plus a guessed `datePublished` that post-dated the page by five
 * weeks (BL-099). This module is the single definition, so the shared blocks
 * cannot fall out of sync again.
 *
 * The emitted key order is deliberate — it reproduces the inline literals this
 * replaced, so the refactor is provably byte-identical in `dist/`. Reordering
 * is semantically harmless to JSON-LD but destroys that proof; don't.
 *
 * Doc: src/docs/seo/JSON_LD_SCHEMA.md § Hub Tools: WebApplication Schema.
 */

/** Every tool is free and browser-based, published by GST. */
const OFFERS = { '@type': 'Offer', price: '0', priceCurrency: 'USD' } as const;
/** Exported for `mcp-schema.ts`, which describes the MCP server with the same publisher. */
export const PUBLISHER = {
  '@type': 'Organization',
  name: 'Global Strategic Technologies',
} as const;
const APPLICATION_CATEGORY = 'BusinessApplication';
const OPERATING_SYSTEM = 'Web';

/**
 * The author identity shared by every tool. `knowsAbout` is deliberately NOT
 * here: it is per-tool expertise signalling and all six arrays differ, so
 * hoisting it would delete real signal from five pages. BL-099's acceptance
 * criteria described it as shared — that was wrong about the code, and this
 * comment is the durable record of why the helper takes it as a parameter.
 *
 * Exported for `mcp-schema.ts`, so the MCP pages carry the same author node.
 */
export const AUTHOR = {
  '@type': 'Person',
  name: 'Reid Peryam',
  jobTitle: 'Strategic Technology Advisor',
  sameAs: ['https://www.linkedin.com/in/reidperyam/'],
  description: 'Technology advisor with experience across 100+ PE technology diligence engagements',
} as const;

export interface HubToolSchemaInput {
  /** Tool display name, e.g. `'TechPar'`. */
  name: string;
  /** One-sentence description for search results. */
  description: string;
  /** Key capabilities — 4-5 short phrases. */
  featureList: string[];
  /**
   * Tool-specific expertise areas. Keep 4-5 items and always include
   * 'Technical Due Diligence' and 'M&A Tech Strategy'.
   */
  knowsAbout: string[];
  /** Launch date, `YYYY-MM-DD`. */
  datePublished: string;
  /** Last significant update, `YYYY-MM-DD`. See the doc for what counts. */
  dateModified: string;
}

/** Build the `WebApplication` JSON-LD object for one hub tool page. */
export function hubToolSchema(tool: HubToolSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.name,
    description: tool.description,
    applicationCategory: APPLICATION_CATEGORY,
    operatingSystem: OPERATING_SYSTEM,
    offers: OFFERS,
    publisher: PUBLISHER,
    datePublished: tool.datePublished,
    dateModified: tool.dateModified,
    featureList: tool.featureList,
    author: { ...AUTHOR, knowsAbout: tool.knowsAbout },
  };
}
