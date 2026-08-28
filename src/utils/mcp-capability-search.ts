/**
 * Pure helpers over the MCP capability registry (`src/data/mcp/capabilities.ts`).
 *
 * Deliberately free of DOM: the docs page uses these at BUILD time to render the
 * sidebar, the group counts and every contract anchor, and the browser module
 * uses `searchCapabilities` at RUNTIME over the same shapes read from the
 * sidebar's data attributes. One definition of "what matches" and "what is this
 * capability's anchor", so a build-time anchor and a runtime jump cannot drift.
 *
 * Unit-tested (`tests/unit/mcp-capability-search.test.ts`) and therefore NOT in
 * the coverage exclude list, unlike the page's DOM module.
 */
import type { Capability, CapabilityGroup } from '../data/mcp/capabilities';

/** The Reference sidebar's group order. */
export const GROUP_ORDER: readonly CapabilityGroup[] = [
  'Tools',
  'Prompts',
  'Resources',
  'Operations',
];

/** Maximum search results shown at once. */
export const MAX_SEARCH_RESULTS = 8;

/**
 * URL-safe anchor for a capability id.
 *
 * Underscores survive (`compute_techpar` stays itself: the wire identifier is
 * contractual and a reader should recognise the anchor). Everything else that
 * is not a lowercase alphanumeric collapses to a hyphen, which is what makes the
 * six non-identifier ids addressable at all: `gst://regulations/…` becomes
 * `gst-regulations`, `Rate limits` becomes `rate-limits`.
 *
 * Uniqueness across the registry is asserted in the parity suite, not assumed
 * here: this function cannot know what else exists.
 */
export function capabilitySlug(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The DOM id of a capability's contract pane, and the hash that opens it. */
export function capabilityAnchor(id: string): string {
  return `cap-${capabilitySlug(id)}`;
}

/** Anything with an identifier and a one-line description is searchable. */
export interface SearchableCapability {
  id: string;
  type: string;
  gloss: string;
}

/**
 * Case-insensitive substring match over identifier AND gloss, capped.
 *
 * Gloss matching is what makes the field useful to a reader who knows what they
 * want but not what it is called ("regulatory" finds `search_regulations`).
 * An empty or whitespace-only query matches nothing rather than everything: the
 * dropdown is a lookup, not a browse surface, and the sidebar already lists all.
 */
export function searchCapabilities<T extends SearchableCapability>(
  capabilities: readonly T[],
  query: string,
  max: number = MAX_SEARCH_RESULTS
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return capabilities
    .filter((c) => c.id.toLowerCase().includes(q) || c.gloss.toLowerCase().includes(q))
    .slice(0, max);
}

export interface CapabilityCounts {
  tools: number;
  prompts: number;
  /** Summed family sizes, not family count: 4 + 123 + 6, not 3. */
  resources: number;
  operations: number;
}

/**
 * Group counts, derived rather than published.
 *
 * Resources count DOCUMENTS because that is the number a reader is asking for;
 * the three families are the navigation, not the inventory.
 */
export function capabilityCounts(capabilities: readonly Capability[]): CapabilityCounts {
  const inGroup = (group: CapabilityGroup) => capabilities.filter((c) => c.group === group);
  return {
    tools: inGroup('Tools').length,
    prompts: inGroup('Prompts').length,
    resources: inGroup('Resources').reduce((sum, c) => sum + (c.count ?? 1), 0),
    operations: inGroup('Operations').length,
  };
}

/** Capabilities in a group, registry order preserved. */
export function capabilitiesInGroup(
  capabilities: readonly Capability[],
  group: CapabilityGroup
): Capability[] {
  return capabilities.filter((c) => c.group === group);
}
