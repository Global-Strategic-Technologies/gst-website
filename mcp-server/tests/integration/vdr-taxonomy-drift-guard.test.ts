/**
 * VDR folder taxonomy dual-source drift guard (BL-123).
 *
 * The nine-row VDR folder taxonomy now exists in two places:
 *
 *   - `src/data/library/vdr-structure/article.md` — the canonical Library
 *     article, codegenned into `library-data.generated.ts` and served at
 *     `gst://library/vdr-structure`.
 *   - `mcp-server/src/prompts/irl-ingestion.ts` — inlined into the rendered
 *     prompt body as `VDR_FOLDER_TAXONOMY`.
 *
 * BL-123 inlined the table so the prompt could stop embedding the whole 16.3KB
 * article as a third message on every render. That trade is only safe while the
 * copies agree. If they drift, section (I) instructs the model to quote folder
 * labels "verbatim" from a taxonomy the Library no longer serves — and because
 * the prompt caption still cites the canonical URI, the dossier would carry a
 * provenance claim pointing at content that does not match.
 *
 * The failure is silent by construction: nothing else reads both copies.
 *
 * To intentionally diverge them, delete this test in the same commit and record
 * the new canonicality contract in the `VDR_FOLDER_TAXONOMY` docstring — the
 * same retirement discipline as `sop-dual-source-drift-guard.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { irlIngestionPrompt } from '../../src/prompts/irl-ingestion';

/**
 * Any body long enough to clear the `.min(200)` schema floor and carry real
 * newlines. Content is irrelevant here — this guard reads the VDR block, which
 * is emitted regardless of what the IRL says.
 */
const SAMPLE_FILLED_IRL = [
  '# Information Request List — Sample (returned)',
  '',
  '## 00 — Basics',
  '- Company name: Sample Co',
  '- Engagement context: buy-side review',
  '- Annual recurring revenue: $10M',
  '- Business model: B2B SaaS',
  '- Geographies of operation: US',
  '- HQ jurisdiction: Delaware',
  '- Total headcount: 100',
  '- YoY growth rate: 40%',
].join('\n');

function bodyText(args: Parameters<typeof irlIngestionPrompt.build>[0]): string {
  return irlIngestionPrompt
    .build(args)
    .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY_ARTICLE = resolve(__dirname, '../../../src/data/library/vdr-structure/article.md');

/** Every markdown table row in the article whose first cell is a two-digit folder number. */
function taxonomyRows(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\|\s*\d{2}\s*\|/.test(line));
}

describe('VDR folder taxonomy — dual-source drift guard', () => {
  it('every canonical folder row appears verbatim in the rendered prompt body', () => {
    const article = readFileSync(LIBRARY_ARTICLE, 'utf-8');
    const rows = taxonomyRows(article);

    // Guard the guard: if the article's table shape changes so the extractor
    // matches nothing, an empty loop below would pass vacuously.
    expect(rows.length, 'no folder rows extracted from the Library article').toBe(9);

    const body = bodyText({ filledIrl: SAMPLE_FILLED_IRL });
    const missing = rows.filter((row) => !body.includes(row));

    if (missing.length > 0) {
      throw new Error(
        [
          'VDR taxonomy drift detected. These rows exist in the canonical Library',
          'article but not in the inlined `VDR_FOLDER_TAXONOMY` in',
          '`mcp-server/src/prompts/irl-ingestion.ts`:',
          '',
          ...missing.map((row) => `  ${row}`),
          '',
          'Copy the article rows into VDR_FOLDER_TAXONOMY verbatim, or — if the',
          'divergence is intentional — delete this test and record the new',
          'canonicality contract in the VDR_FOLDER_TAXONOMY docstring.',
        ].join('\n')
      );
    }
  });

  it('the canonical URI still appears in the body as a provenance caption', () => {
    // Two things depend on this beyond readability: the orchestrates→body
    // invariant requires every `orchestrates` entry to appear literally, and a
    // reader of the dossier needs to know which taxonomy was quoted.
    const body = bodyText({ filledIrl: SAMPLE_FILLED_IRL });
    expect(body).toContain('gst://library/vdr-structure');
  });
});
