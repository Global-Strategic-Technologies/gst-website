/**
 * Shared CSS-source parsers for the source-scanning guards.
 *
 * Extracted from `touch-target-floor.test.ts` (ADR-0028) so a second guard could
 * use them without importing a test file. That distinction is load-bearing:
 * importing a `*.test.ts` runs its `describe` blocks during collection, so the
 * borrowed suite would register twice and its cases would be double-counted.
 * No test in this repo imports another test; shared parsers live here.
 *
 * These read CSS as TEXT. They do not resolve the cascade, and a guard built on
 * them asserts what the SOURCE says, not what a browser computes.
 */

/** Strip `/* … *\/` comments so commented-out CSS can't trip a scan. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Extract the contents of every `<style>` block in an Astro file. */
export function extractAstroStyles(source: string): string[] {
  const blocks: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

/**
 * A single length to px, or null when it cannot be judged.
 *
 * ANCHORED to one bare length on purpose — `calc()`, percentages, viewport units
 * and multi-value shorthands all return null rather than a guess. `em` is
 * excluded deliberately: it resolves against the element's own font-size, so a
 * 16px-based conversion can invent a plausible wrong answer. Callers that need
 * to judge a shorthand must split it themselves (see `splitShorthand`).
 */
export function lengthToPx(value: string): number | null {
  const bare = value.replace(/!\s*important\s*$/i, '').trim();
  if (/^0$/.test(bare)) return 0;
  const m = /^(-?[0-9]*\.?[0-9]+)(px|rem)$/.exec(bare);
  if (!m) return null;
  return m[2] === 'px' ? parseFloat(m[1]) : parseFloat(m[1]) * 16;
}

/**
 * Split a shorthand value into its top-level components, keeping `var(…)` and
 * `calc(…)` groups intact.
 *
 * Required by any guard that judges VALUES rather than declarations: most real
 * spacing declarations are shorthands (`margin: 1.5rem 2rem 1.5rem auto`), and
 * feeding one to `lengthToPx` returns null — which reads as "nothing to judge"
 * and passes silently. That is the BL-124/BL-125 vacuous-guard failure mode.
 */
export function splitShorthand(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Parse `:root` custom properties from variables.css into a name -> value map. */
export function parseRootTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const root = /:root\s*\{([\s\S]*?)\}/.exec(stripComments(css));
  if (!root) return out;
  for (const m of root[1].matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}
