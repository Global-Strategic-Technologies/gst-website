/**
 * BL-079 Part B — prompt-render-time cache pre-population tests.
 *
 * The `_registry.ts` wrapper around `gst_irl_ingestion`'s `build` calls
 * `handlePrepareIrlBodyTool` (Alt-D pattern) BEFORE returning the rendered
 * prompt body when `args.filledIrl` is present. Asserts:
 *
 * 1. Cache is populated post-build when `filledIrl` is supplied
 * 2. Cache is NOT touched when `filledIrl` is omitted (interactive mode)
 * 3. The hash the cache is keyed by matches the prompt body's
 *    `**Body-binding hash:**` directive (so the model can copy the
 *    directive value and the server re-hydrates the same bytes)
 * 4. Build still returns the prompt body when no cache is wired
 *    (legacy / unit-test path)
 */

import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from '../../../src/prompts/_registry';
import { InMemoryIrlBodyCache } from '../../../src/cache/irl-body-cache';
import { computeIrlBodyHash } from '../../../src/schemas/compose-dossier-envelope';
import type { MetricsContext } from '../../../src/metrics/_index';

const SAMPLE_FILLED_IRL = `# Information Request List — Acme

## 00 — Basics
- Annual recurring revenue: $45.2M Q1-FY26 annualized
- Geographies: US, EU
- Total headcount: 187 today; 121 twelve months ago
- Engineering FTE count: 58 total
- Stack: TypeScript Node 22, Python 3.12, Aurora Postgres 15
- Hosting: AWS multi-region (us-east-1 primary, eu-west-1 secondary)
- This body is intentionally over 200 characters so the schema accepts it.
`.repeat(3);

// Minimal McpServer mock — only the methods registerPrompts calls.
function makeMockServer(): {
  server: McpServer;
  registeredPrompts: Array<{ name: string; build: (args: unknown) => unknown }>;
} {
  const registered: Array<{ name: string; build: (args: unknown) => unknown }> = [];
  const server = {
    registerPrompt(name: string, _config: unknown, build: (args: unknown) => unknown) {
      registered.push({ name, build });
    },
  } as unknown as McpServer;
  return { server, registeredPrompts: registered };
}

describe('BL-079 Part B — prompt-render-time cache pre-population', () => {
  it('populates the cache when gst_irl_ingestion is built with filledIrl arg', async () => {
    const cache = new InMemoryIrlBodyCache();
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      irlBodyCache: cache,
    };
    const { server, registeredPrompts } = makeMockServer();
    registerPrompts(server, metrics);

    const irlIngestion = registeredPrompts.find((p) => p.name === 'gst_irl_ingestion');
    expect(irlIngestion).toBeDefined();

    expect(cache.size()).toBe(0);
    await irlIngestion!.build({ filledIrl: SAMPLE_FILLED_IRL });
    expect(cache.size()).toBe(1);

    const expectedHash = computeIrlBodyHash(SAMPLE_FILLED_IRL);
    const cached = await cache.get(expectedHash);
    expect(cached).toBe(SAMPLE_FILLED_IRL);
  });

  it('does NOT populate the cache when filledIrl is omitted (interactive mode)', async () => {
    const cache = new InMemoryIrlBodyCache();
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      irlBodyCache: cache,
    };
    const { server, registeredPrompts } = makeMockServer();
    registerPrompts(server, metrics);

    const irlIngestion = registeredPrompts.find((p) => p.name === 'gst_irl_ingestion');
    await irlIngestion!.build({});
    expect(cache.size()).toBe(0);
  });

  it('build still returns a result when no cache is wired (NOOP metrics path)', async () => {
    const { server, registeredPrompts } = makeMockServer();
    registerPrompts(server); // no metrics — default NOOP

    const irlIngestion = registeredPrompts.find((p) => p.name === 'gst_irl_ingestion');
    const result = await irlIngestion!.build({ filledIrl: SAMPLE_FILLED_IRL });
    expect(result).toBeDefined();
    // GetPromptResult shape from the SDK — has `messages` array.
    expect((result as { messages: unknown[] }).messages).toBeDefined();
  });

  it('the cache key matches the prompt body Body-binding hash directive', async () => {
    const cache = new InMemoryIrlBodyCache();
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      irlBodyCache: cache,
    };
    const { server, registeredPrompts } = makeMockServer();
    registerPrompts(server, metrics);

    const irlIngestion = registeredPrompts.find((p) => p.name === 'gst_irl_ingestion');
    const result = await irlIngestion!.build({ filledIrl: SAMPLE_FILLED_IRL });

    // Extract the rendered prompt body text from the GetPromptResult.
    const text = (result as { messages: Array<{ content: { text: string } }> }).messages
      .map((m) => m.content.text)
      .join('\n');

    const expectedHash = computeIrlBodyHash(SAMPLE_FILLED_IRL);
    expect(text).toContain(`**Body-binding hash:** \`${expectedHash}\``);
    // And the cache is keyed by that exact hash.
    const cached = await cache.get(expectedHash);
    expect(cached).toBe(SAMPLE_FILLED_IRL);
  });
});

describe('BL-079 Part B — prompt body substring assertions', () => {
  it('one-shot mode body carries the skip-prepare BL-079 Part B directive', async () => {
    const { server, registeredPrompts } = makeMockServer();
    registerPrompts(server);
    const irlIngestion = registeredPrompts.find((p) => p.name === 'gst_irl_ingestion');
    const result = await irlIngestion!.build({ filledIrl: SAMPLE_FILLED_IRL });
    const text = (result as { messages: Array<{ content: { text: string } }> }).messages
      .map((m) => m.content.text)
      .join('\n');
    expect(text).toContain('BL-079 Part B');
    expect(text).toContain('partner-paste-verbatim-prepop');
    expect(text).toContain('SKIP `prepare_irl_body`');
  });

  it('interactive mode body carries the skip-prepare BL-079 Part B directive', async () => {
    const { server, registeredPrompts } = makeMockServer();
    registerPrompts(server);
    const irlIngestion = registeredPrompts.find((p) => p.name === 'gst_irl_ingestion');
    const result = await irlIngestion!.build({});
    const text = (result as { messages: Array<{ content: { text: string } }> }).messages
      .map((m) => m.content.text)
      .join('\n');
    expect(text).toContain('BL-079 Part B');
    expect(text).toContain('partner-paste-verbatim-prepop');
    expect(text).toContain('SKIP `prepare_irl_body`');
  });
});
