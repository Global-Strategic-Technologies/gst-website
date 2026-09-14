/**
 * BL-152 Slice 2 — the registry document's description is the JSON-LD's
 * description, not a fresh one (the stanza's own AC), so the two cannot drift.
 *
 * The website's `SoftwareApplication` node (`src/utils/mcp-schema.ts`) OWNS
 * the sentence and computes its counts from the capability registry. The
 * Worker cannot import that, so `mcp-server/src/registry-metadata.ts` carries
 * a mirror. This test binds the text; the Worker's `protocol-roundtrip.test.ts`
 * binds the mirror's integers to the live `tools/list` / `prompts/list` /
 * `resources/list`. Change a count on either side and one of the two goes red
 * until the sentence is updated.
 */
import { describe, expect, it } from 'vitest';
import {
  REGISTRY_DESCRIPTION,
  REGISTRY_REMOTE_URL,
  REGISTRY_TITLE,
  REGISTRY_WEBSITE_URL,
} from '../../mcp-server/src/registry-metadata';
import { MCP_LANDING_URL, mcpServerSchema } from '@/utils/mcp-schema';

describe('registry metadata ↔ website JSON-LD parity', () => {
  const schema = mcpServerSchema();

  it('the registry description IS the SoftwareApplication description', () => {
    expect(REGISTRY_DESCRIPTION).toBe(schema.description);
  });

  it('the registry title is the SoftwareApplication name', () => {
    expect(REGISTRY_TITLE).toBe(schema.name);
  });

  it('the registry website URL is the landing page the JSON-LD points at', () => {
    expect(REGISTRY_WEBSITE_URL).toBe(MCP_LANDING_URL);
    expect(REGISTRY_WEBSITE_URL).toBe(schema.url);
  });

  it('the remote URL is the endpoint the get-started guide teaches', () => {
    expect(REGISTRY_REMOTE_URL).toBe('https://mcp.globalstrategic.tech/mcp');
  });
});
