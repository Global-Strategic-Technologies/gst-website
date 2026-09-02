/**
 * The Worker-served HTML shell's typeface (BL-144).
 *
 * The website pins `--font-family-mono` to a self-hosted `GST Mono`, but these
 * pages cannot use it: they are served from a different origin, so the font
 * would need a CORS grant and a network round-trip on surfaces whose whole
 * discipline is "no external resources" (the OAuth consent page defends against
 * Referer leak of `code`/`state`). What travels instead is the other half of the
 * site's stack — both fallback faces are `local()` with `size-adjust`, so they
 * resolve on the visitor's own machine and render at the pinned face's metrics.
 *
 * `tests/integration/font-token-pin.test.ts` in the website workspace reads
 * THIS module's source to check the same rule. That is a static read of a string
 * constant; this file asserts the constant actually reaches the served markup,
 * which is the part a refactor can break without touching either declaration.
 */

import { describe, it, expect } from 'vitest';
import { htmlShell, MONO_STACK, MONO_FALLBACK_FACES } from '../../../src/lib/html-shell.js';

const html = htmlShell('Test', '<p>body</p>');
const styleBlock = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

/** Families that name nothing in particular — the defect BL-144 removed. */
const GENERICS = new Set([
  'monospace',
  'sans-serif',
  'serif',
  'system-ui',
  'ui-monospace',
  'ui-sans-serif',
  'ui-serif',
]);

const familiesOf = (value: string) =>
  value
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);

describe('htmlShell typeface', () => {
  it('declares both metric-matched fallback faces in the served markup', () => {
    // Not "the constant is non-empty" — the rendered page must carry them, since
    // an @font-face that never reaches the document styles nothing.
    expect(styleBlock).toContain("font-family: 'GST Mono Fallback'");
    expect(styleBlock).toContain("font-family: 'GST Mono Fallback WD'");
    expect(styleBlock, 'the faces normalise the fallback to the pinned metrics').toContain(
      'size-adjust:'
    );
    expect(MONO_FALLBACK_FACES.length).toBeGreaterThan(0);
  });

  it('never leads a font stack with a bare generic', () => {
    // Covers `font-family:` and the `font:` shorthand — the body used the
    // shorthand and was the one stack that stayed on `system-ui` after the
    // first pass at this.
    const stacks: string[] = [];
    for (const [, value] of styleBlock.matchAll(/font-family:\s*([^;}\n]+)[;}]/g)) {
      stacks.push(value);
    }
    for (const [, value] of styleBlock.matchAll(
      /(?<!-)\bfont:\s*[^;}\n]*?((?:["'][^"']+["']|[A-Za-z][\w-]*)(?:\s*,\s*(?:["'][^"']+["']|[A-Za-z][\w-]*))*)\s*[;}]/g
    )) {
      stacks.push(value);
    }

    // Vacuity guard: the shell declares faces, a body stack and a code stack.
    expect(stacks.length, 'font stacks found in the served markup').toBeGreaterThanOrEqual(3);

    for (const stack of stacks) {
      const first = familiesOf(stack)[0] ?? '';
      // The @font-face blocks name the fallback faces themselves; those are the
      // real families, not stacks, and are covered by the test above.
      if (first.startsWith('GST Mono')) continue;
      expect(GENERICS.has(first.toLowerCase()), `"${stack.trim()}" leads with a generic`).toBe(
        false
      );
    }
  });

  it('puts the body and code on the same shared stack', () => {
    expect(MONO_STACK).toContain('GST Mono Fallback');
    expect(GENERICS.has(familiesOf(MONO_STACK)[0].toLowerCase())).toBe(false);
    // Both consumers, so a future edit cannot quietly leave one behind.
    const uses = [
      ...styleBlock.matchAll(new RegExp(MONO_STACK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')),
    ];
    expect(uses.length, 'body and code both resolve the shared stack').toBeGreaterThanOrEqual(2);
  });
});
