/**
 * MCP page JSON-LD — the helper's contract, and the guarantee that every
 * `/hub/mcp/` page renders its structured data from it.
 *
 * The helper is IMPORTED, not string-matched: `src/utils/` is inside
 * vitest.config.ts's coverage include, so scanning it as text would add an
 * uncovered file while proving less. The five page sources ARE read as text,
 * because .astro components can't be evaluated under vitest's node environment;
 * the element-splitting idiom is `tests/unit/hub-tool-schema.test.ts`'s.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CAPABILITIES } from '../../src/data/mcp/capabilities';
import { capabilityAnchor, capabilityCounts } from '../../src/utils/mcp-capability-search';
import {
  MCP_DOCS_URL,
  MCP_LANDING_URL,
  MCP_SERVER_ID,
  mcpCapabilityListSchema,
  mcpGuideSchema,
  mcpServerSchema,
} from '../../src/utils/mcp-schema';
import { EXPECTED_REMOTE_TOOL_COUNT } from '../integration/helpers/mcp-registry';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MCP_DIR = join(REPO_ROOT, 'src', 'pages', 'hub', 'mcp');

const read = (...seg: string[]) => readFileSync(join(...seg), 'utf-8');

/** The `<script …/>` elements in an .astro source, each as one string. */
function scriptElements(src: string): string[] {
  return src
    .split(/<script\b/)
    .slice(1)
    .map((chunk) => {
      const ends = [chunk.indexOf('/>'), chunk.indexOf('</script>')].filter((i) => i >= 0);
      return chunk.slice(0, ends.length ? Math.min(...ends) : chunk.length);
    });
}

const ldJsonElements = (src: string) =>
  scriptElements(src).filter((el) => el.includes('type="application/ld+json"'));

/**
 * Every string value in a JSON-LD object, for the copy-rule checks. The
 * registry's own strings are walked by the docs parity suite; this covers the
 * literals the helper ADDS.
 */
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}

describe('mcpServerSchema — derived from the registry', () => {
  const schema = mcpServerSchema();
  const counts = capabilityCounts(CAPABILITIES);

  it('is a schema.org SoftwareApplication with a stable @id', () => {
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('SoftwareApplication');
    expect(schema['@id']).toBe(MCP_SERVER_ID);
    expect(schema.url).toBe(MCP_LANDING_URL);
    expect(schema.softwareHelp.url).toBe(MCP_DOCS_URL);
  });

  it('lists exactly the remote tool surface as featureList', () => {
    // Bound to the server registrar through the integration helper, not to
    // the registry alone: a tool registered on the Worker but missing from the
    // registry already fails the docs parity suite, and this closes the other
    // direction for the schema specifically.
    expect(schema.featureList).toHaveLength(EXPECTED_REMOTE_TOOL_COUNT);
    expect(schema.featureList).toEqual(
      CAPABILITIES.filter((c) => c.group === 'Tools').map((c) => c.id)
    );
  });

  it('writes the counts into the description rather than a literal', () => {
    expect(schema.description).toContain(`${counts.tools} technology diligence`);
    expect(schema.description).toContain(`${counts.prompts} prompts`);
    expect(schema.description).toContain(`${counts.resources} reference resources`);
  });

  it('makes no pricing or free-access claim', () => {
    // Access is operator-provisioned and tiered, and the terms are not
    // published. See the module header.
    expect(schema).not.toHaveProperty('offers');
    expect(schema).not.toHaveProperty('isAccessibleForFree');
  });

  it('carries the shared author and publisher nodes', () => {
    expect(schema.publisher).toEqual({
      '@type': 'Organization',
      name: 'Global Strategic Technologies',
    });
    expect(schema.author).toMatchObject({ '@type': 'Person', name: 'Reid Peryam' });
    expect(schema.author.knowsAbout).toContain('Model Context Protocol');
  });
});

describe('mcpCapabilityListSchema — one item per capability', () => {
  const list = mcpCapabilityListSchema();

  it('counts every capability, in registry order', () => {
    expect(list['@type']).toBe('ItemList');
    expect(list.numberOfItems).toBe(CAPABILITIES.length);
    expect(list.itemListElement.map((i) => i.name)).toEqual(CAPABILITIES.map((c) => c.id));
    expect(list.itemListElement.map((i) => i.position)).toEqual(
      CAPABILITIES.map((_, index) => index + 1)
    );
  });

  it('deep-links each item to its contract pane on the reference', () => {
    for (const item of list.itemListElement) {
      expect(item.url).toBe(`${MCP_DOCS_URL}#${capabilityAnchor(item.name)}`);
    }
  });
});

describe('mcpGuideSchema — TechArticle about the server node', () => {
  const guide = mcpGuideSchema({
    headline: 'Test guide',
    description: 'A guide for testing',
    url: 'https://globalstrategic.tech/hub/mcp/test/',
    datePublished: '2026-08-27',
    dateModified: '2026-09-02',
  });

  it('points its about at the SoftwareApplication @id', () => {
    expect(guide['@type']).toBe('TechArticle');
    expect(guide.about).toEqual({ '@id': MCP_SERVER_ID });
    expect(guide.mainEntityOfPage).toBe(guide.url);
  });

  it('passes the per-guide fields through untouched', () => {
    expect(guide.headline).toBe('Test guide');
    expect(guide.description).toBe('A guide for testing');
    expect(guide.datePublished).toBe('2026-08-27');
    expect(guide.dateModified).toBe('2026-09-02');
  });
});

describe('copy rules over the literals the helpers add', () => {
  const strings = [
    ...stringsOf(mcpServerSchema()),
    ...stringsOf(mcpCapabilityListSchema()),
    ...stringsOf(
      mcpGuideSchema({
        headline: 'x',
        description: 'x',
        url: 'https://globalstrategic.tech/hub/mcp/',
        datePublished: '2026-08-27',
        dateModified: '2026-08-27',
      })
    ),
  ];

  it('never names the docs subdomain (ADR-0023: one published address)', () => {
    expect(strings.filter((s) => s.includes('docs.mcp.'))).toEqual([]);
  });

  it('uses no em dashes', () => {
    expect(strings.filter((s) => s.includes('—'))).toEqual([]);
  });

  it('emits only trailing-slash page URLs (vercel.json canonicalization)', () => {
    const pageUrls = strings.filter(
      (s) => s.startsWith('https://globalstrategic.tech/') && !s.includes('#')
    );
    expect(pageUrls.length).toBeGreaterThan(0);
    expect(pageUrls.filter((u) => !u.endsWith('/'))).toEqual([]);
  });
});

describe('every /hub/mcp/ page renders its JSON-LD from the helpers', () => {
  const pages: Array<[string, RegExp[]]> = [
    // The landing page's body is the shared locale template since BL-153
    // (src/pages/hub/mcp/index.astro is a one-line wrapper), so its JSON-LD is
    // read from the template. The guides below are English-only and unmoved.
    [
      join('..', '..', '..', 'page-templates', 'HubMcpPage.astro'),
      [/set:html=\{JSON\.stringify\(\s*mcpServerSchema\(/],
    ],
    [
      join('docs', 'index.astro'),
      [
        /set:html=\{JSON\.stringify\(\s*mcpServerSchema\(/,
        /set:html=\{JSON\.stringify\(\s*mcpCapabilityListSchema\(/,
      ],
    ],
    [join('get-started', 'index.astro'), [/set:html=\{JSON\.stringify\(\s*mcpGuideSchema\(/]],
    [join('using', 'index.astro'), [/set:html=\{JSON\.stringify\(\s*mcpGuideSchema\(/]],
    [
      join('advanced-operations', 'index.astro'),
      [/set:html=\{JSON\.stringify\(\s*mcpGuideSchema\(/],
    ],
  ];

  it.each(pages)('%s has one ld+json element per expected helper call', (file, patterns) => {
    // Deliberately NOT an identifier-presence check over the file: the call
    // must appear inside an ld+json element's `set:html`, one element per call.
    const elements = ldJsonElements(read(MCP_DIR, file));
    expect(elements).toHaveLength(patterns.length);
    for (const pattern of patterns) {
      expect(
        elements.some((el) => pattern.test(el)),
        String(pattern)
      ).toBe(true);
    }
  });

  it.each(['get-started', 'using', 'advanced-operations'])(
    '%s declares og:type article and dates its guide',
    (guide) => {
      const src = read(MCP_DIR, guide, 'index.astro');
      expect(src).toMatch(/ogType="article"/);
      expect(src).toMatch(/datePublished: '\d{4}-\d{2}-\d{2}'/);
      expect(src).toMatch(/dateModified: '\d{4}-\d{2}-\d{2}'/);
      // The URL and description are hoisted to frontmatter consts so the meta
      // tags and the JSON-LD cannot drift apart; assert the const, and that the
      // schema call and the layout both consume it.
      expect(src).toContain(`const PAGE_URL = 'https://globalstrategic.tech/hub/mcp/${guide}/'`);
      expect(src).toMatch(/url: PAGE_URL/);
      expect(src).toMatch(/ogUrl=\{PAGE_URL\}/);
      expect(src).toMatch(/description: DESCRIPTION/);
      expect(src).toMatch(/description=\{DESCRIPTION\}/);
    }
  );
});
