/**
 * `extractAstroMarkup` — the reader every page parity guard sees a page through.
 *
 * It had no test of its own until 2026-09-02, when a self-closing
 * `<script … set:html={…} />` (the JSON-LD idiom) met a regex that only knew
 * the paired form: the match ran from that `<script` to the next `</script>`,
 * which did not exist, so it swallowed the rest of the page and 59 downstream
 * assertions ran over an empty region. A guard that can be emptied by an
 * unrelated edit is the failure the repo's "prove the guard probes something"
 * lesson is about, so both script forms are pinned here with fixtures.
 */
import { describe, it, expect } from 'vitest';

import { extractAstroMarkup } from '../integration/helpers/astro-markup';

const FRONTMATTER = `---\nconst x = 1;\n---\n`;

describe('extractAstroMarkup', () => {
  it('strips frontmatter, styles, comments and paired scripts, keeping markup', () => {
    const src = `${FRONTMATTER}<p>kept</p>\n<style>p { color: red }</style>\n<script>const y = 2;</script>\n<!-- gone -->\n<p>also kept</p>`;
    expect(extractAstroMarkup(src)).toBe(' <p>kept</p> <p>also kept</p>');
  });

  it('strips a self-closing script without swallowing what follows it', () => {
    // The 2026-09-02 shape: JSON-LD rendered as a self-closing element, with
    // the page's real markup after it.
    const src = `${FRONTMATTER}<script is:inline type="application/ld+json" set:html={JSON.stringify(schema({ a: 1 }))} />\n<p>after</p>`;
    expect(extractAstroMarkup(src)).toBe(' <p>after</p>');
  });

  it('handles both forms in one page, in either order', () => {
    const src = `${FRONTMATTER}<script>a()</script>\n<p>one</p>\n<script set:html={x} />\n<p>two</p>\n<script>b()</script>`;
    expect(extractAstroMarkup(src)).toBe(' <p>one</p> <p>two</p> ');
  });

  it('is not emptied by a page that ends in a self-closing script', () => {
    // The assertion that would have caught the original defect: a non-empty
    // region after the script, whatever came before it.
    const src = `${FRONTMATTER}<p>body</p>\n<script set:html={x} />`;
    expect(extractAstroMarkup(src).trim()).not.toBe('');
  });

  it('documents the inverse edge: a paired script whose body contains "/>"', () => {
    // The alternation stops at the first terminator, so a paired script with
    // a `/>` inside its JS is cut there and leaks its tail into the region. No
    // consumer page has one today; this pins the behaviour so a future
    // failure reads as this known edge rather than a mystery.
    const src = `${FRONTMATTER}<script>el.innerHTML = '<br/>'; tail();</script>\n<p>after</p>`;
    expect(extractAstroMarkup(src)).toContain('tail();');
  });
});
