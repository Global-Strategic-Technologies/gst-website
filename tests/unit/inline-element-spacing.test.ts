import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { globSync } from 'fs';
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
 * The fix at each site is a literal `&#32;` ending the prose line: a character
 * reference is not source whitespace, so the compressor leaves it alone, and it
 * collapses harmlessly against real whitespace if compression is ever disabled.
 * `{' '}` does NOT work (it emits a whitespace text node the compressor treats
 * like any other), and `&nbsp;` would wrongly suppress wrapping at that point.
 *
 * Disabling `compressHTML` fixes the whole class, but was measured at +305 KB
 * raw / +29 KB gzipped across the site's HTML — rejected on those grounds.
 *
 * This reads source rather than rendering, so it stays a cheap unit test; the
 * rendered result was verified in headless Chromium when the fix landed. The
 * detector is validated below against a fixture carrying the known-present
 * shape, so a green run means "no hits", never "the scan silently matched
 * nothing".
 */

/** Inline elements whose leading space compressHTML eats. */
const INLINE = 'a|code|strong|em|abbr|b|i';
const OPENS_INLINE = new RegExp(`^<(${INLINE})([\\s>]|$)`);
/** Prose end: a word or closing punctuation, never a tag boundary (`>`). */
const ENDS_IN_PROSE = /[\w,.:;'’")]$/;

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
    if (!ENDS_IN_PROSE.test(prev)) continue;
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

  it('the detector accepts the fixed shape', () => {
    const fixed = [
      '<p>',
      '  Server-side health (per-tool latency) is published at&#32;',
      '  <a href="https://status.mcp.globalstrategic.tech/">status</a>.',
      '</p>',
    ].join('\n');
    expect(findUnspacedBreaks(fixed)).toEqual([]);
  });

  it('the detector ignores a tag boundary, where no space is owed', () => {
    const fine = ['<p class="lead">', '  <a href="/privacy/">Privacy Policy</a>', '</p>'].join(
      '\n'
    );
    expect(findUnspacedBreaks(fine)).toEqual([]);
  });

  it('no .astro source drops a space before an inline element', () => {
    const offenders: string[] = [];
    for (const file of globSync('src/**/*.astro')) {
      const lines = findUnspacedBreaks(readFileSync(join(process.cwd(), file), 'utf-8'));
      for (const line of lines) offenders.push(`${file.split('\\').join('/')}:${line}`);
    }
    expect(
      offenders,
      `compressHTML will delete the space before these inline elements — end the previous line with &#32;:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});
