/**
 * JSON-LD for the `/hub/mcp/` pages.
 *
 * The MCP server is the one product on the site whose crawler-facing
 * description could be derived rather than written: the capability registry
 * (`src/data/mcp/capabilities.ts`) already carries every tool, prompt and
 * resource family with its gloss, and the parity suite binds that registry to
 * server source. So every count and identifier below is READ from the
 * registry. Nothing here hardcodes a tool name or a number; the sixteen-tool
 * figure the marketing page writes out as literal markup (deliberately, so its
 * parity guard has something to compare) is reached here by counting.
 *
 * Three shapes, one per page kind:
 *
 *   - `mcpServerSchema()`      SoftwareApplication, on the landing page and the
 *                              reference. Carries a stable `@id` so the guides
 *                              can point their `about` at the same node.
 *   - `mcpCapabilityListSchema()`  ItemList over every capability, each item
 *                              deep-linked to its contract pane on the reference.
 *   - `mcpGuideSchema()`       TechArticle for the three onboarding guides.
 *
 * `SoftwareApplication` rather than the hub tools' `WebApplication`: the server
 * is not a browser application. A visitor connects a client to it; nothing runs
 * on the page. `operatingSystem` is `Any` for the same reason.
 *
 * No `offers` block and no `isAccessibleForFree`: access is operator-provisioned
 * and tiered, and the terms are not published, so neither claim would be true
 * to state. The absence is deliberate, not an omission to backfill.
 *
 * COPY RULES: strings emitted here are drawn from the registry, which
 * `tests/integration/mcp-docs-parity.test.ts` walks for the em-dash ban, the
 * no-SLA rule and the no-docs-subdomain rule. The few literals this module adds
 * are held to the same rules by `tests/unit/mcp-schema.test.ts`.
 *
 * Doc: src/docs/seo/JSON_LD_SCHEMA.md § MCP Server schemas.
 */
import { CAPABILITIES, type Capability } from '../data/mcp/capabilities';
import { AUTHOR, PUBLISHER } from './hub-tool-schema';
import { capabilityAnchor, capabilityCounts } from './mcp-capability-search';

const SITE = 'https://globalstrategic.tech';

/** Published addresses. Trailing slashes match `vercel.json`'s canonicalization. */
export const MCP_LANDING_URL = `${SITE}/hub/mcp/`;
export const MCP_DOCS_URL = `${SITE}/hub/mcp/docs/`;
export const MCP_GET_STARTED_URL = `${SITE}/hub/mcp/get-started/`;

/** The node the guides' `about` resolves to. One id, shared by every page. */
export const MCP_SERVER_ID = `${MCP_LANDING_URL}#software`;

/** Build the `SoftwareApplication` node for the server. */
export function mcpServerSchema(capabilities: readonly Capability[] = CAPABILITIES) {
  const counts = capabilityCounts(capabilities);
  const tools = capabilities.filter((c) => c.group === 'Tools');
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': MCP_SERVER_ID,
    name: 'GST MCP Server',
    alternateName: 'Global Strategic Technologies MCP Server',
    url: MCP_LANDING_URL,
    description: `${counts.tools} technology diligence, portfolio and regulatory tools, ${counts.prompts} prompts and ${counts.resources} reference resources, exposed to AI agents over the Model Context Protocol.`,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Model Context Protocol server',
    operatingSystem: 'Any',
    installUrl: MCP_GET_STARTED_URL,
    softwareHelp: { '@type': 'CreativeWork', url: MCP_DOCS_URL },
    featureList: tools.map((t) => t.id),
    keywords: [
      'Model Context Protocol',
      'MCP server',
      'Technical Due Diligence',
      'M&A Tech Strategy',
      'AI agents',
    ],
    publisher: PUBLISHER,
    author: {
      ...AUTHOR,
      knowsAbout: [
        'Technical Due Diligence',
        'M&A Tech Strategy',
        'Model Context Protocol',
        'AI Strategy',
      ],
    },
  };
}

/** Build the `ItemList` of every capability, deep-linked into the reference. */
export function mcpCapabilityListSchema(capabilities: readonly Capability[] = CAPABILITIES) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'GST MCP Server capabilities',
    description:
      'Every tool, prompt, resource family and operations topic the GST MCP Server exposes, with a contract for each.',
    numberOfItems: capabilities.length,
    itemListElement: capabilities.map((cap, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: cap.id,
      description: cap.gloss,
      url: `${MCP_DOCS_URL}#${capabilityAnchor(cap.id)}`,
    })),
  };
}

export interface McpGuideSchemaInput {
  /** The page's H1, as a search result headline. */
  headline: string;
  /** One or two sentences; the page's meta description is the usual value. */
  description: string;
  /** Canonical page URL, trailing slash included. */
  url: string;
  /** First publication, `YYYY-MM-DD`. */
  datePublished: string;
  /** Last substantive copy change, `YYYY-MM-DD`. */
  dateModified: string;
}

/** Build the `TechArticle` node for one onboarding guide. */
export function mcpGuideSchema(guide: McpGuideSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: guide.headline,
    description: guide.description,
    url: guide.url,
    mainEntityOfPage: guide.url,
    datePublished: guide.datePublished,
    dateModified: guide.dateModified,
    inLanguage: 'en',
    about: { '@id': MCP_SERVER_ID },
    isPartOf: { '@type': 'WebSite', name: 'GST', url: `${SITE}/` },
    publisher: PUBLISHER,
    author: AUTHOR,
  };
}
