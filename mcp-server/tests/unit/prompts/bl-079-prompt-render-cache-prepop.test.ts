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
import type { McpServer } from '@modelcontextprotocol/server';
import { registerPrompts } from '../../../src/prompts/_registry';
import { InMemoryIrlBodyCache } from '../../../src/cache/irl-body-cache';
import { InMemoryIrlBodyProvenanceStore } from '../../../src/cache/irl-body-provenance';
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
  it('one-shot mode body carries the prepop skip-prepare directive (unconditional, partner-paste path)', async () => {
    const { server, registeredPrompts } = makeMockServer();
    registerPrompts(server);
    const irlIngestion = registeredPrompts.find((p) => p.name === 'gst_irl_ingestion');
    const result = await irlIngestion!.build({ filledIrl: SAMPLE_FILLED_IRL });
    const text = (result as { messages: Array<{ content: { text: string } }> }).messages
      .map((m) => m.content.text)
      .join('\n');
    expect(text).toContain('partner-paste-verbatim-prepop');
    expect(text).toContain('SKIP `prepare_irl_body`');
    // L1: no mode-conditional prose — the body describes ONE coherent path.
    expect(text).not.toContain('if you see');
    expect(text).not.toContain('Interactive / xlsx-reconstruction mode');
  });

  it('interactive mode body describes the legacy prepare_irl_body path unconditionally (no prepop directive)', async () => {
    const { server, registeredPrompts } = makeMockServer();
    registerPrompts(server);
    const irlIngestion = registeredPrompts.find((p) => p.name === 'gst_irl_ingestion');
    const result = await irlIngestion!.build({});
    const text = (result as { messages: Array<{ content: { text: string } }> }).messages
      .map((m) => m.content.text)
      .join('\n');
    // Interactive path: directive is NEVER present; model is told to call
    // prepare_irl_body to seed the cache. No prepop SKIP-prepare directive.
    // (The VERIFY-block enum still LISTS partner-paste-verbatim-prepop as a
    // valid filledIrl.source value — that's a schema surface, not a workflow
    // directive — so we assert on the prose directive instead.)
    expect(text).toContain('prepare_irl_body');
    expect(text).not.toContain('SKIP `prepare_irl_body`');
    // L1: no mode-conditional prose either.
    expect(text).not.toContain('if a `**Body-binding hash:**`');
  });
});

/**
 * BL-123 — the registry's own two obligations, exercised THROUGH `registerPrompts`.
 *
 * The BL-123 suite calls `handlePrepareIrlBodyTool` directly, which cannot see
 * either of these: whether the registry passes `'prompt-render'` at all, and
 * whether it declines to cache a body the render has just refused. This is also
 * the one enforcement point that swallows its failures into a non-fatal
 * `safeLog` by design, so nothing else would surface a regression here.
 */
describe('BL-123 — the registry seam', () => {
  const flatten = (body: string): string => body.replace(/\n/g, ' ').trim();

  /**
   * `SAMPLE_FILLED_IRL` above is ~1.1KB — deliberately below the detector's
   * 2KB floor, so flattening it is NOT a refusal case. A realistic IRL is tens
   * of kilobytes; this one is sized like one so the halt path is reachable.
   */
  const LARGE_FILLED_IRL = SAMPLE_FILLED_IRL.repeat(3);

  function build() {
    const cache = new InMemoryIrlBodyCache();
    const provenance = new InMemoryIrlBodyProvenanceStore();
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      irlBodyCache: cache,
      irlBodyProvenance: provenance,
    };
    const { server, registeredPrompts } = makeMockServer();
    registerPrompts(server, metrics);
    const prompt = registeredPrompts.find((p) => p.name === 'gst_irl_ingestion');
    if (!prompt) throw new Error('gst_irl_ingestion not registered');
    return { prompt, cache, provenance };
  }

  it('mints provenance as `prompt-render`, not the handler default', async () => {
    // The strong provenance form exists only if the RENDER wrote the body. If
    // the registry stopped passing the argument, the handler's `prepare-tool`
    // default would take over and every honest prepop run would silently cap
    // itself down — a regression with no other visible symptom.
    const { prompt, provenance } = build();
    await prompt.build({ filledIrl: SAMPLE_FILLED_IRL });

    const record = await provenance.read(computeIrlBodyHash(SAMPLE_FILLED_IRL));
    expect(record?.mintedBy).toBe('prompt-render');
  });

  it('prepops a flattened body like any other (BL-124 — the skip was withdrawn)', async () => {
    // BL-123 skipped the prepop for these and rendered a halt. Both are gone:
    // the body is cached, minted `prompt-render`, and keeps the strongest
    // provenance grade — which is what makes the paste path work again.
    const { prompt, cache, provenance } = build();
    const flattened = flatten(LARGE_FILLED_IRL);
    await prompt.build({ filledIrl: flattened });

    expect(await cache.get(computeIrlBodyHash(flattened))).toBe(flattened);
    expect(cache.size()).toBe(1);
    const record = await provenance.read(computeIrlBodyHash(flattened));
    expect(record?.mintedBy).toBe('prompt-render');
    expect(record?.newlineCount).toBe(0);
  });

  it('renders the normal sweep for a flattened body, not a halt', async () => {
    const { prompt } = build();
    const result = (await prompt.build({ filledIrl: flatten(LARGE_FILLED_IRL) })) as {
      messages: Array<{ content: { type: string; text?: string } }>;
    };
    expect(result.messages.length).toBe(2);
    expect(result.messages[0].content.text).toContain('Sweep plan');
    expect(result.messages[0].content.text).not.toContain('halted before extraction');
  });
});
