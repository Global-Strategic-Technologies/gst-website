/**
 * BL-123 / BL-124 — `assessIrlBodyStructure`.
 *
 * BL-123 used this to REFUSE a body whose line breaks the client had collapsed.
 * BL-124 withdrew the refusal — verification normalises whitespace away, nothing
 * reads line structure, and the halt cost operators every working path. What
 * survives is the measurement, surfaced as `serverCachedBodyNewlines` so an
 * operator can see why a body will not hash-match the file on their disk.
 *
 * The tests that asserted the `flattened` verdict went with it. The production
 * signature below did NOT: it is the executable record of the failure that
 * started all of this, and it is what the diagnostic exists to explain.
 */

import { describe, it, expect } from 'vitest';
import { assessIrlBodyStructure } from '../../../src/lib/irl-body-structure';

/** The exact transformation Claude Desktop's single-line input performs. */
const flatten = (body: string): string => body.replace(/\n/g, ' ').trim();

const realisticIrl = [
  '# Information Request List — Sample (filled)',
  '',
  '> Engagement context: Strategic Discovery',
  '',
  ...Array.from(
    { length: 60 },
    (_, i) =>
      `- ${String(i).padStart(2, '0')}-01 A request row whose answer is a long single-line prose paragraph, because that is what real filled IRLs contain and it is why a bytes-per-line ratio would have been the wrong instrument.`
  ),
].join('\n');

/**
 * The same body as a file on disk holds it — with a trailing newline. That
 * trailing byte is where the production artifact's −1 length delta came from:
 * every other newline became a space at no length cost, and the last one was
 * removed by the client's trim.
 */
const realisticIrlAsFile = `${realisticIrl}\n`;

describe('assessIrlBodyStructure', () => {
  it('counts newlines in an intact multi-line body', () => {
    const result = assessIrlBodyStructure(realisticIrl);
    expect(result.newlineCount).toBeGreaterThan(50);
  });

  it('reports zero newlines once the client has flattened it', () => {
    expect(assessIrlBodyStructure(flatten(realisticIrl)).newlineCount).toBe(0);
  });

  it('reproduces the production signature: a −1 byte delta hiding a break at every line', () => {
    // The shape that made this look like an off-by-one and misdirected the
    // first diagnosis. On the real artifact it was 141 newlines lost for a
    // one-byte change in size — which is precisely why a byte count alone is
    // not enough, and why the newline count is now surfaced beside it.
    const intact = assessIrlBodyStructure(realisticIrlAsFile);
    const flat = assessIrlBodyStructure(flatten(realisticIrlAsFile));

    expect(flat.byteLength).toBe(intact.byteLength - 1);
    expect(flat.newlineCount).toBe(0);
    expect(intact.newlineCount).toBeGreaterThan(50);
  });

  it('counts newline characters, not lines', () => {
    // `split('\n').length` returns 1 for a newline-free string, which would
    // make any `=== 0` comparison downstream permanently false. Pinned because
    // it is a one-character mistake.
    expect(assessIrlBodyStructure('no breaks here').newlineCount).toBe(0);
    expect(assessIrlBodyStructure('a\nb\nc').newlineCount).toBe(2);
  });

  it('measures UTF-8 bytes, not code units', () => {
    const emDashes = '—'.repeat(1000); // 3 bytes each
    expect(assessIrlBodyStructure(emDashes).byteLength).toBe(3000);
  });
});
