/**
 * The two things the font-size lint rule cannot see (ADR-0043).
 *
 * The allow-list rule admits `var()`, `pt` and `em`. That leaves two holes, both
 * closed here rather than in stylelint because they are about CONTEXT and
 * REFERENCE, which an allow-list of values cannot express:
 *
 *   (a) `pt` is admitted so print sheets can use paper units. Nothing stops an
 *       on-screen `font-size: 10pt`, which the rule would then pass forever. So a
 *       `pt` font-size must sit inside `@media print`.
 *   (b) Size tokens and colour tokens share the `--text-` prefix (`--text-sm`
 *       beside `--text-muted`). Every rule accepts any `var()`, so
 *       `font-size: var(--text-primary)` and `color: var(--text-size-title)` both
 *       lint clean. So a `font-size` may only name size tokens, and a colour
 *       property may never name one.
 *
 * Scans `<style>` blocks, plain `.css` files AND inline `style="…"` attributes
 * (via `extractInlineStyles`): `/brand` sets both properties inline, and the
 * `<style>`-only helpers were blind to it (ADR-0029's recorded gap).
 */

import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractAstroStyles,
  extractInlineStyles,
  parseRootTokens,
  stripComments,
  walkStyleSources,
} from './helpers/css-parse';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_DIR = join(REPO_ROOT, 'src');

interface Decl {
  file: string;
  prop: string;
  value: string;
  print: boolean;
}

/**
 * Every declaration in a sheet, with whether an enclosing `@media` names print.
 * A brace walker, not a regex: a regex cannot know which block a declaration is
 * in, and "is it inside print" is the whole question for (a).
 */
export function scanSheet(sheet: string, file: string, inline = false): Decl[] {
  const css = stripComments(sheet);
  const out: Decl[] = [];
  const stack: string[] = [];
  let buf = '';
  const flush = () => {
    const m = /^\s*([-a-zA-Z]+)\s*:\s*([\s\S]+?)\s*$/.exec(buf);
    if (m && !m[1].startsWith('--')) {
      out.push({
        file,
        prop: m[1].toLowerCase(),
        value: m[2],
        print:
          !inline &&
          stack.some((p) => /^@media\b[^{]*\bprint\b/i.test(p) && !/\bnot\s+print\b/i.test(p)),
      });
    }
    buf = '';
  };
  for (const ch of css) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      flush();
      stack.pop();
    } else if (ch === ';') flush();
    else buf += ch;
  }
  flush();
  return out;
}

function collect(): Decl[] {
  const files: string[] = [];
  walkStyleSources(SRC_DIR, files);
  const decls: Decl[] = [];
  for (const abs of files) {
    const rel = relative(REPO_ROOT, abs).split(sep).join('/');
    const src = readFileSync(abs, 'utf-8');
    if (abs.endsWith('.css')) decls.push(...scanSheet(src, rel));
    else {
      for (const block of extractAstroStyles(src)) decls.push(...scanSheet(block, rel));
      for (const attr of extractInlineStyles(src))
        decls.push(...scanSheet(attr, `${rel} (inline)`, true));
    }
  }
  return decls;
}

const TOKENS = parseRootTokens(readFileSync(join(SRC_DIR, 'styles/variables.css'), 'utf-8'));
/** A `--text-*` token is a SIZE token when its value is a length; otherwise it is a colour. */
const TEXT_TOKENS = Object.keys(TOKENS).filter((t) => t.startsWith('--text-'));
const SIZE_TOKENS = new Set(TEXT_TOKENS.filter((t) => /^[0-9.]+(rem|px|em)$/.test(TOKENS[t])));
const COLOUR_TOKENS = new Set(TEXT_TOKENS.filter((t) => !SIZE_TOKENS.has(t)));
const COLOUR_PROP = /(^|-)color$|^fill$|^stroke$/;
const textRefs = (value: string) =>
  [...value.matchAll(/var\(\s*(--text-[A-Za-z0-9_-]+)/g)].map((m) => m[1]);

/** (a): a pt font-size outside print. */
export function ptOutsidePrint(decls: Decl[]): Decl[] {
  return decls.filter((d) => d.prop === 'font-size' && /[0-9.]pt\b/.test(d.value) && !d.print);
}
/** (b): a font-size naming a colour token, or a colour property naming a size token. */
export function crossedTextTokens(decls: Decl[]): string[] {
  const bad: string[] = [];
  for (const d of decls) {
    for (const ref of textRefs(d.value)) {
      if (d.prop === 'font-size' && COLOUR_TOKENS.has(ref))
        bad.push(`${d.file}: font-size names colour token ${ref}`);
      if (COLOUR_PROP.test(d.prop) && SIZE_TOKENS.has(ref))
        bad.push(`${d.file}: ${d.prop} names size token ${ref}`);
    }
  }
  return bad;
}

describe('font-size token floor (ADR-0043)', () => {
  const decls = collect();

  describe('the instrument sees what it must (known-present cases)', () => {
    it('classifies the token families from variables.css', () => {
      expect(SIZE_TOKENS.has('--text-sm')).toBe(true);
      expect(SIZE_TOKENS.has('--text-size-compact')).toBe(true);
      expect(COLOUR_TOKENS.has('--text-primary')).toBe(true);
      expect(COLOUR_TOKENS.has('--text-muted')).toBe(true);
      expect(SIZE_TOKENS.size).toBeGreaterThan(15);
    });

    it('finds the print sheets and marks them print', () => {
      const printPt = decls.filter(
        (d) => d.prop === 'font-size' && d.print && /pt\b/.test(d.value)
      );
      // Diligence Machine, Tech Debt Calculator, TechPar, ICG and the regulatory map print in pt.
      expect(printPt.length).toBeGreaterThanOrEqual(30);
      expect(new Set(printPt.map((d) => d.file)).size).toBeGreaterThanOrEqual(4);
    });

    it('reads inline style attributes', () => {
      const inline = decls.filter((d) => d.file.endsWith('(inline)'));
      expect(inline.some((d) => d.prop === 'font-size' && textRefs(d.value).length > 0)).toBe(true);
      expect(inline.some((d) => COLOUR_PROP.test(d.prop) && textRefs(d.value).length > 0)).toBe(
        true
      );
    });
  });

  describe('each check fires on a planted violation', () => {
    it.each([
      ['on-screen pt', '.x { font-size: 10pt; }', 1],
      ['pt inside a screen media query', '@media (max-width: 480px) { .x { font-size: 9pt; } }', 1],
      ['pt inside not-print', '@media not print { .x { font-size: 9pt; } }', 1],
      ['pt inside print', '@media print { .x { font-size: 9pt; } }', 0],
      ['pt inside print nested in a rule', '@media print { .a { .b { font-size: 9pt; } } }', 0],
      ['a rem size', '.x { font-size: var(--text-sm); }', 0],
    ])('%s', (_label, css, expected) => {
      expect(ptOutsidePrint(scanSheet(css, 'fixture.css'))).toHaveLength(expected);
    });

    it('treats an inline pt as on-screen, always', () => {
      expect(ptOutsidePrint(scanSheet('font-size:9pt', 'x.astro (inline)', true))).toHaveLength(1);
    });

    it.each([
      ['font-size naming a colour token', '.x { font-size: var(--text-primary); }', 1],
      ['color naming a size token', '.x { color: var(--text-size-title); }', 1],
      ['border-color naming a size token', '.x { border-color: var(--text-sm); }', 1],
      ['a size token as a size', '.x { font-size: var(--text-size-title); }', 0],
      ['a colour token as a colour', '.x { color: var(--text-muted); }', 0],
      [
        'a size token inside clamp()',
        '.x { font-size: clamp(var(--text-3xl), 6vw, var(--text-5xl)); }',
        0,
      ],
    ])('%s', (_label, css, expected) => {
      expect(crossedTextTokens(scanSheet(css, 'fixture.css'))).toHaveLength(expected);
    });
  });

  it('no pt font-size outside @media print', () => {
    const bad = ptOutsidePrint(decls).map((d) => `${d.file}: font-size: ${d.value}`);
    expect(bad, 'pt is for paper only (ADR-0043 § 4)').toEqual([]);
  });

  it('no font-size names a colour token, and no colour names a size token', () => {
    expect(crossedTextTokens(decls), 'the --text- prefix is shared (ADR-0043 § 3)').toEqual([]);
  });
});
