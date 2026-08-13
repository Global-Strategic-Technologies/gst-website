/**
 * BL-123 — `assessIrlBodyStructure`.
 *
 * The production failure: Claude Desktop renders every prompt-argument field as
 * a single-line input, so a pasted multi-line IRL arrives with every newline
 * collapsed to a space. The server hashed it, cached it, reported the hash
 * honestly, and the run completed looking clean.
 */

import { describe, it, expect } from 'vitest';
import {
  assessIrlBodyStructure,
  flattenedBodyExplanation,
  FLATTENED_BODY_BYTE_FLOOR,
} from '../../../src/lib/irl-body-structure';

/** The exact transformation the client performs. */
const flatten = (body: string): string => body.replace(/\n/g, ' ').trim();

const realisticIrl = [
  '# Information Request List — Sample (filled)',
  '',
  '> Engagement context: Strategic Discovery',
  '',
  ...Array.from(
    { length: 60 },
    (_, i) =>
      `- ${String(i).padStart(2, '0')}-01 A request row whose answer is a long single-line prose paragraph, because that is what real filled IRLs contain and it is why a bytes-per-line ratio test would be the wrong instrument here.`
  ),
].join('\n');

/**
 * The same body as a file on disk would hold it — with a trailing newline.
 * That trailing byte is where the production artifact's −1 length delta came
 * from: every other newline became a space (no length change), and the last one
 * was removed by the client's trim.
 */
const realisticIrlAsFile = `${realisticIrl}\n`;

describe('assessIrlBodyStructure', () => {
  it('passes an intact multi-line body', () => {
    const result = assessIrlBodyStructure(realisticIrl);
    expect(result.flattened).toBe(false);
    expect(result.newlineCount).toBeGreaterThan(0);
  });

  it('catches the same body after the client flattens it', () => {
    const result = assessIrlBodyStructure(flatten(realisticIrl));
    expect(result.flattened).toBe(true);
    expect(result.newlineCount).toBe(0);
  });

  it('reproduces the production signature: a −1 byte delta hiding a break at every line', () => {
    // The shape that made this look like an off-by-one and misdirected the
    // first diagnosis. Every newline but the trailing one became a space (no
    // length change each); the trailing one was trimmed (−1). On the real
    // artifact that was 141 newlines lost for a one-byte delta.
    const intact = assessIrlBodyStructure(realisticIrlAsFile);
    const flat = assessIrlBodyStructure(flatten(realisticIrlAsFile));
    expect(flat.byteLength).toBe(intact.byteLength - 1);
    expect(flat.newlineCount).toBe(0);
    expect(intact.newlineCount).toBeGreaterThan(50);
    // A one-byte length delta concealing a structural change at every break.
    expect(flat.flattened).toBe(true);
  });

  it('does NOT catch a short newline-free body below the byte floor', () => {
    // `filledIrl` carries `.min(200)`, so a terse-but-legitimate body must
    // survive. The floor is an order of magnitude above that minimum.
    const short = 'x'.repeat(FLATTENED_BODY_BYTE_FLOOR - 1);
    expect(assessIrlBodyStructure(short).flattened).toBe(false);
  });

  it('is exclusive at the byte floor', () => {
    expect(assessIrlBodyStructure('x'.repeat(FLATTENED_BODY_BYTE_FLOOR)).flattened).toBe(false);
    expect(assessIrlBodyStructure('x'.repeat(FLATTENED_BODY_BYTE_FLOOR + 1)).flattened).toBe(true);
  });

  it('a single newline in a large body is enough to pass', () => {
    // Deliberately narrow: the check tests for TOTAL collapse, which is
    // unambiguous. Partial mangling is not detectable without a heuristic that
    // would false-positive on real long-lined IRLs and block operator work.
    const oneBreak = `${'x'.repeat(FLATTENED_BODY_BYTE_FLOOR * 2)}\n${'y'.repeat(100)}`;
    expect(assessIrlBodyStructure(oneBreak).flattened).toBe(false);
  });

  it('counts newline characters, not lines', () => {
    // `split('\n').length` returns 1 for a newline-free string and would make
    // the `=== 0` test dead. Pinned because that is a one-character mistake.
    expect(assessIrlBodyStructure('no breaks here').newlineCount).toBe(0);
    expect(assessIrlBodyStructure('a\nb\nc').newlineCount).toBe(2);
  });

  it('measures UTF-8 bytes, not code units', () => {
    const emDashes = '—'.repeat(1000); // 3 bytes each
    expect(assessIrlBodyStructure(emDashes).byteLength).toBe(3000);
    expect(assessIrlBodyStructure(emDashes).flattened).toBe(true);
  });
});

describe('flattenedBodyExplanation', () => {
  it('tells the operator it is a client limitation rather than their mistake', () => {
    const text = flattenedBodyExplanation(assessIrlBodyStructure(flatten(realisticIrl)));
    expect(text).toContain('client limitation, not an error on your part');
  });

  it('states that reconstruction is impossible, and gives a path that works', () => {
    const text = flattenedBodyExplanation(assessIrlBodyStructure(flatten(realisticIrl)));
    expect(text).toContain('cannot be reconstructed');
    expect(text).toContain('To proceed');
  });
});
