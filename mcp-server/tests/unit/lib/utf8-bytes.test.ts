/**
 * `utf8ByteLength` must be byte-identical to `Buffer.byteLength(s, 'utf8')`.
 *
 * BL-137 replaced six `Buffer.byteLength` call sites with a `TextEncoder`-based
 * helper. Two of them feed values that are more than diagnostics:
 * `IRL_BODY_CACHE_MAX_BYTES` admission in `cache/irl-body-cache.ts`, and the
 * `byteLength` provenance field the model copies into its VERIFY block. A
 * one-byte divergence on some class of input would change what gets cached and
 * what gets reported, silently.
 *
 * The oracle is `node:buffer`'s `Buffer.byteLength` — imported explicitly, NOT
 * the global (which is banned in this workspace, and which `worker.ts`'s
 * reference directive would type as `any` anyway). Testing the helper against
 * its own `TextEncoder` would be circular and prove nothing.
 *
 * The interesting inputs are the ones where the two implementations could
 * plausibly disagree: UTF-8 length-boundary code points, and surrogates. A LONE
 * surrogate is not a valid scalar value; both implementations substitute
 * U+FFFD (3 bytes), but that is a convention rather than something either API
 * documents as shared, so it is pinned here.
 */
import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { utf8ByteLength } from '../../../src/lib/utf8-bytes';

/** `Buffer.byteLength(s, 'utf8')` — the independent oracle. */
const oracle = (s: string): number => Buffer.byteLength(s, 'utf8');

/**
 * Every code point is written as an ESCAPE, never as a literal character.
 * Half of these (DEL, BOM, U+FFFF, lone surrogates) render as nothing or as a
 * replacement glyph, so a literal would be indistinguishable from an empty
 * string if an editor, a formatter, or a copy-paste ever mangled the file —
 * leaving the case vacuous while it kept passing. The third element pins the
 * expected byte count independently of the oracle, so a mangled input fails
 * loudly instead of agreeing with a mangled oracle.
 */
const CASES: ReadonlyArray<readonly [label: string, input: string, bytes: number]> = [
  ['empty string', '', 0],
  ['ascii', 'hello world', 11],

  // UTF-8 encoded-length boundaries: 1→2 bytes at U+0080, 2→3 at U+0800,
  // 3→4 at U+10000. Each boundary is probed on both sides.
  ['U+007F — last 1-byte', '\u{7f}', 1],
  ['U+0080 — first 2-byte', '\u{80}', 2],
  ['U+07FF — last 2-byte', '\u{7ff}', 2],
  ['U+0800 — first 3-byte', '\u{800}', 3],
  ['U+FFFF — last 3-byte (BMP end)', '\u{ffff}', 3],
  ['U+10000 — first 4-byte (surrogate pair)', '\u{10000}', 4],
  ['U+10FFFF — last code point', '\u{10ffff}', 4],

  ['BOM alone', '\u{feff}', 3],
  ['BOM followed by ascii', '\u{feff}abc', 6],
  ['U+FFFD replacement char, literal', '\u{fffd}', 3],

  // Surrogates. A well-formed pair is one 4-byte scalar; a lone half is not a
  // scalar value at all and both encoders emit U+FFFD (3 bytes) for it.
  ['well-formed surrogate pair (emoji)', '\u{1f600}', 4],
  ['lone high surrogate', '\ud83d', 3],
  ['lone low surrogate', '\ude00', 3],
  ['reversed pair (low then high)', '\ude00\ud83d', 6],
  ['lone high surrogate between ascii', 'a\ud83db', 5],
  ['pair split by an ascii char', '\ud83da\ude00', 7],
  ['trailing lone high surrogate', 'abc\ud83d', 6],
  ['leading lone low surrogate', '\ude00abc', 6],

  ['mixed scripts', 'a\u{e9}\u{6f22}\u{5b57}\u{1f3af}', 13],
  ['newlines and tabs', 'a\r\nb\tc', 6],
  ['NUL byte', 'a\u{0}b', 3],
];

describe('utf8ByteLength', () => {
  it.each(CASES)('matches Buffer.byteLength for %s', (_label, input) => {
    expect(utf8ByteLength(input)).toBe(oracle(input));
  });

  it.each(CASES)('encodes %s to the byte count this file declares', (_label, input, bytes) => {
    // Guards the guard: if an input above ever collapses to '' the oracle
    // agrees with the helper (0 === 0) and the assertion above passes while
    // testing nothing. This one does not.
    expect(utf8ByteLength(input)).toBe(bytes);
  });

  it('matches Buffer.byteLength across surrogate-biased random strings', () => {
    // Deterministic LCG — a fixed seed keeps a failure reproducible, which
    // Math.random() would not. Numbers are the glibc/ANSI-C constants.
    let seed = 0x137_0000;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };

    // Code units drawn so ~40% land in the surrogate range D800–DFFF, which is
    // where lone/mismatched halves get generated in bulk. Uniform sampling over
    // the BMP would produce them far too rarely to be worth running.
    const codeUnit = (): number => {
      const r = next() % 100;
      if (r < 40) return 0xd800 + (next() % 0x800);
      if (r < 60) return next() % 0x80;
      if (r < 80) return 0x80 + (next() % 0x780);
      return 0x800 + (next() % 0xd800);
    };

    let checked = 0;
    let sawLoneSurrogate = false;
    for (let i = 0; i < 20_000; i += 1) {
      const len = next() % 24;
      let s = '';
      for (let j = 0; j < len; j += 1) s += String.fromCharCode(codeUnit());
      if (!sawLoneSurrogate && /[\ud800-\udbff](?![\udc00-\udfff])/.test(s))
        sawLoneSurrogate = true;
      expect(utf8ByteLength(s)).toBe(oracle(s));
      checked += 1;
    }

    // The loop above is the assertion; these pin that it actually ran, and that
    // it exercised the case it exists for. A future edit to the bounds or the
    // distribution cannot quietly turn this into a no-op that still passes.
    expect(checked).toBe(20_000);
    expect(sawLoneSurrogate, 'no lone surrogate was generated — the bias is broken').toBe(true);
  });
});
