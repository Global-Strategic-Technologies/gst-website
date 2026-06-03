/**
 * SOP dual-source drift guard (BL-045 PR B audit M6).
 *
 * The IRL → Hub Tool Input Mapping SOP exists in two locations:
 *
 *   - `src/data/library/irl-tool-input-mapping/article.md` — the canonical
 *     Library article codegenned into `library-data.generated.ts` and
 *     served at `gst://library/irl-tool-input-mapping`. Visible to every
 *     authenticated MCP client.
 *   - `mcp-server/src/docs/library/irl-tool-input-mapping.md` — the
 *     engineering-narrative copy that preceded the SOP-as-Resource
 *     promotion. Referenced from the BL-045 design doc and the
 *     library-loader's metadata description.
 *
 * The two files were created byte-identical under the v0.9.0 promotion.
 * If they drift, the Library client sees a different SOP than the
 * engineering doc claims is canonical — silently shipping a different
 * SOP to every model invocation while the engineering team is reading
 * the stale one (or vice-versa).
 *
 * This test enforces byte-identity. To intentionally diverge them
 * (e.g., the engineering doc gains an "internal commentary" section),
 * delete this test in the same commit and document the new
 * canonicality contract in both files' frontmatter.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY_ARTICLE = resolve(
  __dirname,
  '../../../src/data/library/irl-tool-input-mapping/article.md'
);
const ENGINEERING_DOC = resolve(__dirname, '../../src/docs/library/irl-tool-input-mapping.md');

describe('IRL → tool-input mapping SOP — dual-source drift guard', () => {
  it('the Library article and the engineering doc are byte-identical', () => {
    const libraryBody = readFileSync(LIBRARY_ARTICLE, 'utf-8');
    const engineeringBody = readFileSync(ENGINEERING_DOC, 'utf-8');
    if (libraryBody !== engineeringBody) {
      throw new Error(
        [
          'SOP dual-source drift detected. The Library article and the',
          'engineering doc must be byte-identical, OR the canonicality',
          "contract documented in both files' frontmatter must be",
          'updated AND this test deleted in the same commit.',
          '',
          `  library article: ${LIBRARY_ARTICLE}`,
          `  engineering doc: ${ENGINEERING_DOC}`,
          '',
          `  library size: ${libraryBody.length} chars`,
          `  engineering size: ${engineeringBody.length} chars`,
        ].join('\n')
      );
    }
    expect(libraryBody).toBe(engineeringBody);
  });
});
