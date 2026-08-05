/**
 * BL-109 — `stripHtml` / `truncate`, moved out of `src/lib/inoreader/transform.ts` so
 * the MCP radar handlers can share the stripper without taking a runtime import on
 * website display code.
 *
 * They had no direct tests: coverage was indirect, through `snapshotToFyiItem`. The move
 * also relocates them from `src/lib/**` (outside `vitest.config.ts`'s `coverage.include`)
 * into `src/utils/**`, which is inside it under a 70% line threshold — so they need
 * coverage in their own right now, not by side effect.
 */
import { describe, it, expect } from 'vitest';
import { stripHtml, truncate } from '../../src/utils/html-text';

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello   <em>there</em></p>\n<p>world</p>')).toBe('Hello there world');
  });

  it('decodes the entity set Inoreader actually emits', () => {
    expect(stripHtml('AT&amp;T &mdash; &ldquo;quoted&rdquo; &hellip;')).toBe('AT&T — “quoted” …');
    expect(stripHtml('&lt;not a tag&gt; &nbsp;&#39;s &quot;x&quot;')).toBe('<not a tag> \'s "x"');
  });

  it('decodes numeric and hex character references', () => {
    expect(stripHtml('&#65;&#66; &#x43;&#x44;')).toBe('AB CD');
  });

  it('drops img and tracking markup entirely — where the byte saving comes from', () => {
    const withTracking =
      'Real prose. <img src="https://track.example/pixel.gif?a=1&amp;b=2" width="1" height="1" />';
    expect(stripHtml(withTracking)).toBe('Real prose.');
  });

  it('keeps script/style INNER text — it strips tags, it does not sanitise', () => {
    // Recorded so the byte saving is not generalised into a safety guarantee. This is a
    // text-extraction helper for feed prose, not a sanitiser.
    expect(stripHtml('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('returns an empty string for markup-only input', () => {
    expect(stripHtml('<div><br/></div>')).toBe('');
  });
});

describe('truncate', () => {
  it('returns short text unchanged, with no ellipsis', () => {
    expect(truncate('short', 250)).toBe('short');
  });

  it('returns text of exactly maxLength unchanged', () => {
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('cuts at a word boundary and appends an ellipsis', () => {
    expect(truncate('alpha beta gamma delta', 14)).toBe('alpha beta...');
  });
});
