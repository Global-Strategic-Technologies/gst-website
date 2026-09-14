/**
 * Public registry metadata for the GST MCP server (BL-152 Slice 2; the
 * `/.well-known/mcp` + `server.json` AC that BL-093's directory-listing
 * sub-block carried).
 *
 * The document follows the official MCP registry's `server.json` schema
 * (`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`):
 * a reverse-DNS `name`, a `remotes[]` entry with the `streamable-http`
 * transport, and the version the running Worker reports. It is served by the
 * Worker at `GET /server.json` and the alias `GET /.well-known/mcp`, both
 * public and pre-auth, so the same bytes can be submitted to the official
 * registry, MCPMarket, Cursor's catalog, and the Claude connector directory.
 *
 * `REGISTRY_DESCRIPTION` is a MIRROR, not an owner. The website's
 * `SoftwareApplication` JSON-LD (`src/utils/mcp-schema.ts`) owns the sentence
 * and computes its counts from the capability registry; the Worker cannot
 * import that, so the sentence is repeated here and bound in both directions:
 * `tests/integration/protocol-roundtrip.test.ts` checks the three integers
 * against the live `tools/list` / `prompts/list` / `resources/list`, and the
 * website's `tests/integration/mcp-registry-metadata-parity.test.ts` checks
 * the string against the JSON-LD. A count change on either side fails a test
 * until this line is updated. Copy rules: no em dashes, no SLA or uptime
 * figure, no prices or ceilings (ADR-0010, ADR-0023).
 */
import { resolveVersion } from './version';

export const REGISTRY_SCHEMA_URL =
  'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';

/** Reverse-DNS namespace: the domain the operator can verify ownership of. */
export const REGISTRY_SERVER_NAME = 'tech.globalstrategic/gst-mcp';

export const REGISTRY_TITLE = 'GST MCP Server';

export const REGISTRY_DESCRIPTION =
  '16 technology diligence, portfolio and regulatory tools, 12 prompts and 133 reference resources, exposed to AI agents over the Model Context Protocol.';

export const REGISTRY_REMOTE_URL = 'https://mcp.globalstrategic.tech/mcp';
export const REGISTRY_WEBSITE_URL = 'https://globalstrategic.tech/hub/mcp/';
export const REGISTRY_REPOSITORY_URL =
  'https://github.com/Global-Strategic-Technologies/gst-website';

export interface ServerJson {
  $schema: string;
  name: string;
  title: string;
  description: string;
  version: string;
  websiteUrl: string;
  repository: { url: string; source: 'github' };
  remotes: ReadonlyArray<{ type: 'streamable-http'; url: string }>;
}

export function buildServerJson(env: { VERSION?: string } = {}): ServerJson {
  return {
    $schema: REGISTRY_SCHEMA_URL,
    name: REGISTRY_SERVER_NAME,
    title: REGISTRY_TITLE,
    description: REGISTRY_DESCRIPTION,
    version: resolveVersion(env),
    websiteUrl: REGISTRY_WEBSITE_URL,
    repository: { url: REGISTRY_REPOSITORY_URL, source: 'github' },
    remotes: [{ type: 'streamable-http', url: REGISTRY_REMOTE_URL }],
  };
}

/** The two paths that serve the document. Exported so the router and its test agree. */
export const REGISTRY_METADATA_PATHS: readonly string[] = ['/server.json', '/.well-known/mcp'];

export function isRegistryMetadataPath(pathname: string): boolean {
  return REGISTRY_METADATA_PATHS.includes(pathname);
}
