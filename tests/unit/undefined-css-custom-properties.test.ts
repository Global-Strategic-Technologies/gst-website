import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments, walkStyleSources } from '../integration/helpers/css-parse';

/**
 * Every `var(--name)` in `src` must name a custom property that is defined
 * somewhere in `src` (BL-147).
 *
 * An undefined custom property does not error. The declaration becomes invalid
 * at computed-value time and the property falls back to its inherited value.
 * Thirteen `font-size: var(--text-small | --text-tiny)` declarations shipped that
 * way across four homepage and services components. The responsive type
 * step-down they declared never applied at any width, and one base rule was dead
 * at desktop too. `astro check`, `lint`, `lint:css` and the full suite were all
 * green over them: stylelint's strict-value rule whitelists anything matching
 * `var(`, and nothing else reads token names. The first run of this guard also
 * found three more (`--text-light-tertiary`, `--text-md`, `--bg-muted`).
 *
 * A reference WITH a fallback (`var(--x, 1rem)`) is still checked. A dead token
 * hiding behind a fallback is the same bug, and it only looks intentional.
 *
 * What counts as DEFINED, all read as text, not resolved through the cascade:
 *  - `--name:` declarations in any `.css` / `.astro` / `.ts` source under `src`
 *    (`<style>` blocks, inline `style` attributes, quoted `'--name':` keys)
 *  - `setProperty('--name', …)` with a literal name
 *  - the object keys of `<style define:vars={obj}>`. Astro emits `--key` for each
 *    key, case preserved, and the object is usually a frontmatter `const`
 *    (`ClipFigure.astro`, `CopyRow.astro`), so the identifier is followed back to
 *    its literal
 *
 * KNOWN GAPS (uncaught, not guessed at):
 *  - references inside `.ts` sources are not scanned, only definitions are
 *  - a dynamic `setProperty(name, …)` cannot be resolved. `palette-manager.ts`
 *    does this today, but every name it sets is also declared in `palettes.css`,
 *    so it produces no false positive
 *  - a name assembled by interpolation (`var(--alt${n}-primary)`) is skipped
 *    rather than half-read
 */

export interface SourceFile {
  path: string;
  text: string;
}

const NAME = '--[A-Za-z0-9_-]+';

/** `--name:` declarations, including a quoted object key (`'--name':`). */
const DECL = new RegExp(`(${NAME})['"\`]?\\s*:`, 'g');
const SET_PROPERTY = new RegExp(`setProperty\\(\\s*['"\`](${NAME})['"\`]`, 'g');
const VAR_REF = new RegExp(`var\\(\\s*(${NAME})`, 'g');
const DEFINE_VARS = /<style[^>]*\bdefine:vars=\{\s*(\{[\s\S]*?\}|[A-Za-z_$][\w$]*)\s*\}/g;

/** Top-level identifier keys of an object literal's source text. */
const objectKeys = (literal: string): string[] =>
  [...literal.matchAll(/[{,]\s*['"]?([A-Za-z_$][\w$-]*)['"]?\s*:/g)].map((m) => m[1]);

/** Keys of every `define:vars` object in an Astro file, following a `const` identifier back to its literal. */
export const defineVarsNames = (source: string): string[] => {
  const out: string[] = [];
  for (const m of source.matchAll(DEFINE_VARS)) {
    let literal = m[1];
    if (!literal.startsWith('{')) {
      const decl = new RegExp(
        `(?:const|let|var)\\s+${literal}\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*;?\\n`
      ).exec(source);
      if (!decl) continue;
      literal = decl[1];
    }
    for (const key of objectKeys(literal)) out.push(`--${key}`);
  }
  return out;
};

/** A capture is interpolated when the name runs straight into a template expression. */
const interpolated = (text: string, end: number): boolean => /^(\$\{|\{)/.test(text.slice(end));

export const collectDefined = (files: SourceFile[]): Set<string> => {
  const defined = new Set<string>();
  for (const { path, text } of files) {
    const body = stripComments(text);
    for (const m of body.matchAll(DECL)) defined.add(m[1]);
    for (const m of body.matchAll(SET_PROPERTY)) defined.add(m[1]);
    if (path.endsWith('.astro')) for (const name of defineVarsNames(text)) defined.add(name);
  }
  return defined;
};

/** `file → --name` for every reference in a `.css` / `.astro` source that nothing defines. */
export const findUndefinedCustomProperties = (files: SourceFile[]): string[] => {
  const defined = collectDefined(files);
  const offenders = new Set<string>();
  for (const { path, text } of files) {
    if (path.endsWith('.ts')) continue;
    const body = stripComments(text).replace(/<!--[\s\S]*?-->/g, '');
    for (const m of body.matchAll(VAR_REF)) {
      if (interpolated(body, m.index + m[0].length)) continue;
      if (!defined.has(m[1])) offenders.add(`${path} → ${m[1]}`);
    }
  }
  return [...offenders].sort();
};

const REPO = process.cwd();

const loadSources = (): SourceFile[] => {
  const abs: string[] = [];
  walkStyleSources(join(REPO, 'src'), abs);
  const walkTs = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && p !== join(REPO, 'src', 'docs')) walkTs(p);
      } else if (entry.name.endsWith('.ts')) abs.push(p);
    }
  };
  walkTs(join(REPO, 'src'));
  return abs.map((p) => ({
    path: relative(REPO, p).split('\\').join('/'),
    text: readFileSync(p, 'utf-8'),
  }));
};

describe('every var(--name) in src resolves to a defined custom property', () => {
  it('flags a reference to a token that is defined nowhere', () => {
    const files = [
      { path: 'a.css', text: ':root { --text-sm: 0.875rem; }' },
      { path: 'b.astro', text: '<style>.x { font-size: var(--text-small); }</style>' },
    ];
    expect(findUndefinedCustomProperties(files)).toEqual(['b.astro → --text-small']);
  });

  it('still flags an undefined token that has a fallback', () => {
    const files = [{ path: 'b.astro', text: '<style>.x { padding: var(--x, 1rem); }</style>' }];
    expect(findUndefinedCustomProperties(files)).toEqual(['b.astro → --x']);
  });

  it('accepts define:vars keys, inline and through a frontmatter const', () => {
    const viaConst = [
      '---',
      'const vars = { clipAspect: `${w} / ${h}`, clipMaxWidth: maxWidth };',
      '---',
      '<style define:vars={vars}>.c { max-width: var(--clipMaxWidth); aspect-ratio: var(--clipAspect); }</style>',
    ].join('\n');
    const inline =
      '<style define:vars={{ keyWidth: "150px" }}>.k { flex: 0 0 var(--keyWidth); }</style>';
    expect(
      findUndefinedCustomProperties([
        { path: 'Clip.astro', text: viaConst },
        { path: 'Copy.astro', text: inline },
      ])
    ).toEqual([]);
  });

  it('accepts inline style declarations, quoted keys and literal setProperty', () => {
    const files = [
      {
        path: 'a.astro',
        text: '<div style="--accent: red"></div><style>.a { color: var(--accent); }</style>',
      },
      { path: 'b.ts', text: "el.style.setProperty('--live', '1'); const s = { '--keyed': 2 };" },
      { path: 'c.css', text: '.c { opacity: var(--live); width: var(--keyed); }' },
    ];
    expect(findUndefinedCustomProperties(files)).toEqual([]);
  });

  it('ignores references inside comments and interpolated names', () => {
    const files = [
      {
        path: 'a.astro',
        text: '<!-- var(--gone) --><style>/* var(--old) */ .a { color: var(--alt${n}-primary); }</style>',
      },
    ];
    expect(findUndefinedCustomProperties(files)).toEqual([]);
  });

  it('no source in src references an undefined custom property', () => {
    const files = loadSources();
    const defined = collectDefined(files);
    // Guard the guard: an empty walk, or a definition regex that matches
    // nothing, would make the assertion below pass over nothing.
    expect(files.length, 'no sources scanned — the walk is broken').toBeGreaterThan(100);
    expect(defined.size, 'almost no definitions found — DECL is broken').toBeGreaterThan(200);
    const referenced = files
      .filter((f) => !f.path.endsWith('.ts'))
      .reduce((n, f) => n + [...f.text.matchAll(VAR_REF)].length, 0);
    expect(referenced, 'almost no var() references found — VAR_REF is broken').toBeGreaterThan(
      1000
    );

    const offenders = findUndefinedCustomProperties(files);
    expect(
      offenders,
      `these var() references name a custom property defined nowhere in src, so the declaration silently falls back to inherit:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});
