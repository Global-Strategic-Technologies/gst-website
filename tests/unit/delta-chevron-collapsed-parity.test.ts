import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `.delta-chevron` has TWO collapsed branches — a JS-toggled one keyed on a
 * parent's `.is-collapsed`, and a native-disclosure one keyed on
 * `details:not([open])`. They describe the same visual state, so they have to
 * declare the same resting appearance.
 *
 * They did not. The `<details>` branch shipped with the rotation but without
 * the muted colour, so every native disclosure on the site (Hub landing, the
 * MCP pages, services, regulatory map, ClipFigure, FyiItem) sat brand-teal
 * while closed. Nothing caught it: the utility is documented in STYLES_GUIDE,
 * but all five `/brand` specimens demonstrate the JS-toggled branch, so the
 * in-repo control examples showed only the half that was correct.
 *
 * This binds the two branches. It reads declarations rather than rendering, so
 * it is a cheap unit test rather than an E2E — the rendered behaviour was
 * verified separately across 25 chevrons on 9 routes when the fix landed.
 */
describe('.delta-chevron collapsed-state parity', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles/interactions.css'), 'utf-8');

  /** Body of the first rule whose selector list contains `needle`. */
  const ruleBody = (needle: string): string => {
    const at = css.indexOf(needle);
    expect(at, `no rule in interactions.css selects on "${needle}"`).toBeGreaterThan(-1);
    const open = css.indexOf('{', at);
    const close = css.indexOf('}', open);
    expect(close, `unterminated rule for "${needle}"`).toBeGreaterThan(open);
    return css.slice(open + 1, close);
  };

  const BRANCHES = [
    ['JS-toggled', '.is-collapsed .delta-chevron'],
    ['<details>', 'details:not([open]) > summary .delta-chevron'],
  ] as const;

  it.each(BRANCHES)('the %s collapsed branch un-rotates the delta', (_label, selector) => {
    expect(ruleBody(selector)).toMatch(/transform:\s*rotate\(0deg\)/);
  });

  it.each(BRANCHES)('the %s collapsed branch mutes the delta', (_label, selector) => {
    // The specific token matters: --text-muted is light-dark(), so the collapsed
    // colour switches with the theme without a dark-theme override. A literal or
    // a non-light-dark token would silently reintroduce one.
    expect(ruleBody(selector)).toMatch(/color:\s*var\(--text-muted\)/);
  });

  it('both branches declare the same collapsed colour', () => {
    const colours = BRANCHES.map(
      ([, selector]) => ruleBody(selector).match(/color:\s*([^;]+);/)?.[1]
    );
    expect(colours.filter(Boolean)).toHaveLength(BRANCHES.length);
    expect(new Set(colours).size, `collapsed colours diverged: ${colours.join(' vs ')}`).toBe(1);
  });

  it('the base rule is what supplies the expanded teal', () => {
    // `details[open]` deliberately sets no colour — it relies on `:not([open])`
    // ceasing to match. That only works while the base rule carries the teal.
    expect(ruleBody('.delta-chevron {')).toMatch(/color:\s*var\(--color-primary\)/);
    expect(ruleBody('details[open] > summary .delta-chevron')).not.toMatch(/color:/);
  });
});
