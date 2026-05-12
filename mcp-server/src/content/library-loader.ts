/**
 * Library loader — exposes the GST Library articles as MCP Resources.
 *
 * Articles live at `src/data/library/<slug>/article.md` (parallel canonical
 * texts; see the article frontmatter for context vs. the live website
 * `.astro` pages). Bodies are codegened into `library-data.generated.ts` at
 * prebuild / pretest time so both esbuild and Vitest see plain TS imports.
 */

import { LIBRARY_BODIES } from './library-data.generated';

export interface LibraryEntry {
  readonly slug: string;
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: string;
  readonly body: string;
}

const LIBRARY_METADATA: ReadonlyArray<Omit<LibraryEntry, 'body'>> = [
  {
    slug: 'business-architectures',
    uri: 'gst://library/business-architectures',
    name: 'Business & Technology Architectures',
    description:
      'GST guide to the five architectural layers (software, operations, product, organization, industry/regulatory) and how they cascade into business outcomes.',
    mimeType: 'text/markdown',
  },
  {
    slug: 'vdr-structure',
    uri: 'gst://library/vdr-structure',
    name: 'Virtual Data Room Structure Guide',
    description:
      'GST reference for organizing a technology-focused Virtual Data Room across nine folder categories, with common pitfalls and best practices.',
    mimeType: 'text/markdown',
  },
];

export const LIBRARY_ENTRIES: readonly LibraryEntry[] = LIBRARY_METADATA.map((meta) => {
  const body = LIBRARY_BODIES[meta.slug];
  if (!body) {
    throw new Error(
      `Library body missing for slug "${meta.slug}". Re-run \`npm -w @gst/mcp-server run prebuild\`.`
    );
  }
  return { ...meta, body };
});

const URI_INDEX: ReadonlyMap<string, LibraryEntry> = new Map(
  LIBRARY_ENTRIES.map((entry) => [entry.uri, entry])
);

/** Resolve a `gst://library/<slug>` URI to a record, or null if unknown. */
export function loadLibraryByUri(uri: string): LibraryEntry | null {
  return URI_INDEX.get(uri) ?? null;
}
