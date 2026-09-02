import { describe, it, expect } from 'vitest';
import { globSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Astro's `compressHTML` (on by default, and not set in astro.config.mjs) does
 * not COLLAPSE the newline+indent between a line of prose and an inline element
 * opening the next line — it DELETES it. So this source:
 *
 *     …request volume) is published at
 *     <a href="https://status.mcp.globalstrategic.tech/">…</a>
 *
 * shipped as "published atstatus.mcp.globalstrategic.tech". Fourteen of these
 * were live across six files before this guard; the defect only appeared where
 * Prettier happened to wrap, which is what made it look arbitrary rather than
 * systematic. Same-line spacing is unaffected, and so is text→text across a
 * break — only the text→inline-open-tag boundary loses its space.
 *
 * Two fixes work, because both put the space where a compile-time compressor
 * cannot see it: a literal `&#32;` ending the prose line (a character reference
 * is not source whitespace), or `{' '}` (compiles to an expression). `&#32;` is
 * the default in plain template regions; `{' '}` is already load-bearing in
 * diligence-machine/index.astro and CTABox.astro, so the scan skips lines ending
 * in `}`. `&nbsp;` would work too but wrongly suppresses wrapping at that point.
 *
 * Disabling `compressHTML` fixes the whole class, but was measured at +305 KB
 * raw / +29 KB gzipped across the site's HTML — rejected on those grounds.
 *
 * KNOWN LIMIT: this covers the text→inline-open-tag boundary only. The same
 * deletion happens at a tag→tag boundary (`</a>` ending a line before an inline
 * open tag on the next), which the `>` exclusion below deliberately skips — the
 * exclusion cannot tell a container's own `<p …>` from a closing `</a>`. Those
 * sites currently sit in flex containers whose `gap` supplies the space, so the
 * narrower rule is the one worth enforcing mechanically.
 *
 * This reads source rather than rendering, so it stays a cheap unit test,
 * matching delta-chevron-collapsed-parity.test.ts; the rendered result was
 * verified in headless Chromium when the fix landed. The detector is validated
 * below against fixtures carrying the known-broken shape, and was separately run
 * against `master`'s sources, where it finds all 14 known instances — so a green
 * run means "no hits", never "the scan silently matched nothing".
 */

/** Inline elements whose leading space compressHTML eats. */
const INLINE = 'a|code|strong|em|abbr|b|i|span|small|sup|sub|time|kbd|mark|cite|q|label';
const OPENS_INLINE = new RegExp(`^<(${INLINE})([\\s>]|$)`);
/** Prose end: a word or closing punctuation, never a tag boundary (`>`). */
const ENDS_IN_PROSE = /[\w,.:;?!'’")]$/;

/** Lines whose space against the next line's inline element would be deleted. */
export const findUnspacedBreaks = (src: string): number[] => {
  const out: number[] = [];
  const lines = src.split('\n');
  let inStyle = false;
  let fences = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '---') fences++;
    if (fences === 1) continue; // component frontmatter
    if (/<style/.test(line)) inStyle = true;
    if (/<\/style>/.test(line)) inStyle = false;
    if (inStyle || i === 0) continue;
    if (!OPENS_INLINE.test(line)) continue;

    const prev = lines[i - 1].trim();
    if (!prev || prev.startsWith('*') || prev.startsWith('//') || prev.startsWith('/*')) continue;
    if (!ENDS_IN_PROSE.test(prev)) continue; // `}` lands here — the `{' '}` fix
    if (prev.endsWith('&#32;') || prev.endsWith('&nbsp;')) continue;
    out.push(i + 1);
  }
  return out;
};

describe('inline elements keep their leading space through compressHTML', () => {
  it('the detector fires on the shape that shipped broken', () => {
    const broken = [
      '<p>',
      '  Server-side health (per-tool latency) is published at',
      '  <a href="https://status.mcp.globalstrategic.tech/">status</a>.',
      '</p>',
    ].join('\n');
    expect(findUnspacedBreaks(broken)).toEqual([3]);
  });

  it.each([
    ['&#32;', '  Server-side health is published at&#32;'],
    ['{\u0027 \u0027}', "  Server-side health is published at{' '}"],
  ])('the detector accepts the %s fix', (_label, prose) => {
    const fixed = ['<p>', prose, '  <a href="/status/">status</a>.', '</p>'].join('\n');
    expect(findUnspacedBreaks(fixed)).toEqual([]);
  });

  it('the detector ignores a tag boundary, where no space is owed', () => {
    const fine = ['<p class="lead">', '  <a href="/privacy/">Privacy Policy</a>', '</p>'].join(
      '\n'
    );
    expect(findUnspacedBreaks(fine)).toEqual([]);
  });

  it('no .astro source drops a space before an inline element', () => {
    const files = globSync('src/**/*.astro');
    // Guard the guard: an empty walk would make the assertion below vacuous.
    expect(files.length, 'no .astro files scanned — the glob is broken').toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const file of files) {
      const lines = findUnspacedBreaks(readFileSync(join(process.cwd(), file), 'utf-8'));
      for (const line of lines) offenders.push(`${file.split('\\').join('/')}:${line}`);
    }
    expect(
      offenders,
      `compressHTML will delete the space before these inline elements — end the previous line with &#32; (or {' '}):\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});
