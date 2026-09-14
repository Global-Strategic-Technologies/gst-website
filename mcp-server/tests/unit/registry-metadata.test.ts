/**
 * BL-152 Slice 2 — the `server.json` registry document.
 *
 * Shape follows the official registry schema (2025-12-11): reverse-DNS name,
 * `remotes[]` with the streamable-http transport, version from the running
 * Worker. The description's COUNTS are bound to the live lists in
 * `protocol-roundtrip.test.ts`; its TEXT is bound to the website JSON-LD in
 * the website's `mcp-registry-metadata-parity.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  buildServerJson,
  isRegistryMetadataPath,
  REGISTRY_DESCRIPTION,
  REGISTRY_METADATA_PATHS,
  REGISTRY_TITLE,
} from '../../src/registry-metadata';
import { FALLBACK_VERSION } from '../../src/version';

describe('buildServerJson', () => {
  it('produces a schema-shaped remote server document', () => {
    const doc = buildServerJson();
    expect(doc.$schema).toBe(
      'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json'
    );
    expect(doc.name).toMatch(/^[a-z0-9.-]+\/[a-z0-9-]+$/);
    expect(doc.name).toBe('tech.globalstrategic/gst-mcp');
    expect(doc.title).toBe('GST MCP Server');
    expect(doc.description).toBe(REGISTRY_DESCRIPTION);
    expect(doc.version).toBe(FALLBACK_VERSION);
    expect(doc.remotes).toEqual([
      { type: 'streamable-http', url: 'https://mcp.globalstrategic.tech/mcp' },
    ]);
    expect(doc.websiteUrl).toBe('https://globalstrategic.tech/hub/mcp/');
    expect(doc.repository.source).toBe('github');
  });

  it('reports the deploy-injected version when bound', () => {
    expect(buildServerJson({ VERSION: '1.2.3' }).version).toBe('1.2.3');
  });

  it('is JSON-serialisable with no undefined fields', () => {
    const doc = buildServerJson();
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});

describe('registry schema length caps (server.schema.json 2025-12-11)', () => {
  it('description and title are at most 100 characters', () => {
    expect(REGISTRY_DESCRIPTION.length).toBeLessThanOrEqual(100);
    expect(REGISTRY_TITLE.length).toBeLessThanOrEqual(100);
  });
});

describe('REGISTRY_DESCRIPTION copy rules (ADR-0010 / ADR-0023)', () => {
  it('carries no em dash, SLA, uptime, or price language', () => {
    expect(REGISTRY_DESCRIPTION).not.toMatch(/—/);
    expect(REGISTRY_DESCRIPTION).not.toMatch(/\b(SLA|uptime|\$|per month|pricing)\b/i);
  });
});

describe('registry metadata paths', () => {
  it('serves the document at /server.json and its well-known alias only', () => {
    expect(REGISTRY_METADATA_PATHS).toEqual(['/server.json', '/.well-known/mcp']);
    expect(isRegistryMetadataPath('/server.json')).toBe(true);
    expect(isRegistryMetadataPath('/.well-known/mcp')).toBe(true);
    expect(isRegistryMetadataPath('/.well-known/mcp/')).toBe(false);
    expect(isRegistryMetadataPath('/.well-known/oauth-authorization-server')).toBe(false);
  });
});
