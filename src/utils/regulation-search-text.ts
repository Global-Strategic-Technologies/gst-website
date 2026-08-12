/**
 * Search-text builder for the regulatory map — the one definition shared by the
 * website page and its unit tests.
 *
 * BL-119 cycle 4 (2026-08-12). The Hub page searched `reg.name` alone, so a
 * visitor typing a framework's common short form — "Colorado AI Act",
 * "EU AI Act", "UK GDPR", "NIST AI RMF" — got zero results, because no alias in
 * the corpus is a substring of its own record's canonical name. The MCP tool
 * `search_regulations` had the same defect against the same data; both are
 * fixed together, because the page is the capability mirror the tool's contract
 * is written against.
 *
 * Lives in its own module and **imports nothing**, following
 * `radar-feed-bounds.ts` — the page consumes it from a client `<script>`, and
 * `fetchRegulations.ts` (the other natural home) reaches `astro:content` via a
 * dynamic import. Keeping this dependency-free means the browser bundle cannot
 * take a path to a server-only virtual module. The parameter is typed
 * structurally for the same reason: a value import of `RegulationIndexEntry`
 * would reintroduce exactly that edge.
 *
 * Match semantics deliberately differ from the MCP tool: this returns raw
 * lowercase text for the page's term-wise substring filter, while
 * `search_regulations` compares aliases on their normalized form (see
 * `mcp-server/src/docs/tools/regulatory-map/CONTRACT.md`). So "SB24205"
 * resolves through the tool and not here. Unifying would mean hoisting
 * `normalizeFrameworkName` out of the mcp-server workspace — a larger change
 * than this fix warrants, and recorded rather than left to be discovered.
 */
export function buildRegulationSearchText(reg: {
  name: string;
  aliases?: readonly string[];
}): string {
  return [reg.name, ...(reg.aliases ?? [])].join(' ').toLowerCase();
}
