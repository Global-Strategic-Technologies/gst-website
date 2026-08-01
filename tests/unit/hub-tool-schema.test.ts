/**
 * Hub tool `WebApplication` JSON-LD — the helper's contract, and the guarantee
 * that every tool page actually emits it.
 *
 * BL-099: the six tool pages each inlined their own near-identical copy of this
 * schema, and the copies drifted — the IRL generator shipped with no
 * `knowsAbout` array and a `datePublished` five weeks off. Nothing caught it,
 * because no test in the repo asserted on JSON-LD at all.
 *
 * The helper is IMPORTED, not string-matched: `src/utils/` is inside
 * vitest.config.ts's coverage include, so scanning it as text would add an
 * uncovered file while proving less.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { hubToolSchema } from '../../src/utils/hub-tool-schema';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS_DIR = join(REPO_ROOT, 'src', 'pages', 'hub', 'tools');

const read = (...seg: string[]) => readFileSync(join(...seg), 'utf-8');

/**
 * The `<script …/>` elements in an .astro source, each as one string.
 *
 * Splitting into elements is what makes the JSON-LD assertions load-bearing.
 * Asserting "the page has an ld+json script" and "the page has a set:html
 * calling hubToolSchema" as two independent facts about the whole FILE is
 * satisfiable by two different elements — verified by mutation: moving the
 * helper call to a second, non-ld+json script left both file-level assertions
 * green while the schema element rendered an unrelated variable. Binding both
 * facts to the same element string closes that.
 */
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
 * Tool pages are `hub/tools/<tool>/index.astro`. The bare `hub/tools/index.astro`
 * is the LISTING page and is deliberately excluded — it correctly emits
 * `ItemList`, so a scan scoped to `tools/` rather than to its subdirectories
 * would either fail here or invite "fixing" that page's schema to the wrong type.
 */
const TOOL_PAGES = readdirSync(TOOLS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

describe('hubToolSchema — emitted shape', () => {
  const schema = hubToolSchema({
    name: 'Test Tool',
    description: 'A tool for testing',
    featureList: ['Feature A', 'Feature B'],
    knowsAbout: ['Technical Due Diligence', 'M&A Tech Strategy'],
    datePublished: '2026-01-15',
    dateModified: '2026-07-31',
  });

  it('is a schema.org WebApplication', () => {
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('WebApplication');
  });

  it('declares the browser-based, free-of-charge shared block', () => {
    expect(schema.applicationCategory).toBe('BusinessApplication');
    expect(schema.operatingSystem).toBe('Web');
    expect(schema.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
    expect(schema.publisher).toEqual({
      '@type': 'Organization',
      name: 'Global Strategic Technologies',
    });
  });

  it('carries the shared author identity', () => {
    expect(schema.author).toMatchObject({
      '@type': 'Person',
      name: 'Reid Peryam',
      jobTitle: 'Strategic Technology Advisor',
      sameAs: ['https://www.linkedin.com/in/reidperyam/'],
    });
    expect(schema.author.description).toContain('100+ PE technology diligence engagements');
  });

  it('passes the per-tool fields through untouched', () => {
    expect(schema.name).toBe('Test Tool');
    expect(schema.description).toBe('A tool for testing');
    expect(schema.featureList).toEqual(['Feature A', 'Feature B']);
    expect(schema.datePublished).toBe('2026-01-15');
    expect(schema.dateModified).toBe('2026-07-31');
  });

  it('keeps knowsAbout per-tool rather than collapsing it to a shared array', () => {
    // The distinction BL-099's acceptance criteria got wrong: all six pages
    // carry DIFFERENT expertise arrays, so hoisting this into the shared author
    // constant would delete real signal from five of them.
    const other = hubToolSchema({
      name: 'Other',
      description: 'Other',
      featureList: [],
      knowsAbout: ['FinOps'],
      datePublished: '2026-01-01',
      dateModified: '2026-01-01',
    });
    expect(schema.author.knowsAbout).toEqual(['Technical Due Diligence', 'M&A Tech Strategy']);
    expect(other.author.knowsAbout).toEqual(['FinOps']);
  });
});

describe('every hub tool page emits WebApplication JSON-LD', () => {
  it('discovers the tool pages rather than trusting a hardcoded list', () => {
    // Sorted equality, not a count: an empty or over-broad walk fails HERE with
    // a useful message, instead of silently making every case below vacuous.
    // It also forces JSON_LD_SCHEMA.md's tool table to be updated when a
    // seventh tool lands.
    expect(TOOL_PAGES).toEqual([
      'diligence-machine',
      'information-request-list-generator',
      'infrastructure-cost-governance',
      'regulatory-map',
      'tech-debt-calculator',
      'techpar',
    ]);
  });

  it.each(TOOL_PAGES)('%s has exactly one ld+json script', (tool) => {
    // Reported separately from the assertion below so "no schema element at
    // all" and "the schema element renders the wrong thing" are distinct
    // failures rather than one opaque miss.
    expect(ldJsonElements(read(TOOLS_DIR, tool, 'index.astro'))).toHaveLength(1);
  });

  it.each(TOOL_PAGES)('%s renders that script from the shared helper', (tool) => {
    // Deliberately NOT an identifier-presence check over the file. A page
    // could import hubToolSchema, assign it to a const and never render it —
    // passing a naive `toContain('hubToolSchema')` while emitting no schema,
    // which is precisely the failure this test exists to catch. The call must
    // appear inside THIS element's `set:html`. Attribute order is not assumed.
    const [element] = ldJsonElements(read(TOOLS_DIR, tool, 'index.astro'));
    expect(element).toMatch(/set:html=\{JSON\.stringify\(\s*hubToolSchema\(/);
  });
});

describe('the tools listing page is not a tool page', () => {
  const listing = () => read(TOOLS_DIR, 'index.astro');

  it('emits ItemList', () => {
    expect(listing()).toMatch(/'@type':\s*'ItemList'/);
  });

  it('does not emit WebApplication', () => {
    // Guards against someone "fixing" the listing page to satisfy a
    // mis-scoped version of the check above.
    expect(listing()).not.toContain('WebApplication');
    expect(listing()).not.toContain('hubToolSchema');
  });
});
