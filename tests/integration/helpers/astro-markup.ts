/**
 * Shared markup-region extractor for Astro-page parity guards.
 *
 * Moved out of `mcp-marketing-parity.test.ts` when the MCP onboarding guard
 * arrived — two suites reading pages the same way must share one reader (the
 * same reasoning that produced `mcp-registry.ts`).
 *
 * Reduce an Astro file to what it actually renders: no frontmatter, no
 * `<style>`/`<script>` blocks, no comments.
 *
 * Whitespace is collapsed last, and that part is load-bearing. Prettier rewraps
 * page prose on every commit (lint-staged runs it), so a phrase can straddle a
 * source line break at any time. Matching against raw source made assertions
 * fail on reformatting alone, which is a false alarm that teaches the next
 * person to weaken the guard.
 */
export function extractAstroMarkup(source: string): string {
  return (
    source
      .replace(/^---[\s\S]*?\n---/, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      // `\s*` inside the braces is required, not defensive: prettier reformats
      // `{/* … */}` to `{ /* … */ }` on commit.
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
  );
}
