/**
 * Primary pairs with dark only through --color-primary-bright (ADR-0040).
 *
 * WHY THIS EXISTS. A palette may split its primary in two: a text-safe
 * --color-primary that reads on light surfaces, and a --color-primary-bright
 * that dark colours read on (palette 6, whose neon is 1.94:1 on white while a
 * text-safe green is 3.63:1 under #0a0a0a). In the default palette the two are
 * equal, so a site that pairs the wrong one with a dark colour looks fine
 * everywhere except in that palette — which axe never scans by default.
 *
 * WHAT IT FLAGS, per rule (and per inline style attribute):
 *  1. a primary background under a dark ink — `color` is --bg-dark,
 *     --text-light-primary, --sash-ink, or light-dark() led by --bg-dark;
 *  2. primary text on a constant-dark surface (`background: var(--bg-dark)`);
 *  3. a bright fill framed by a primary border — the frame follows the fill.
 * "Primary" is exactly `var(--color-primary)` or `var(--color-primary-dark)`,
 * including as a var() fallback; -bright, -15, -rgb and friends never match.
 *
 * WHAT IT CANNOT SEE. It reads one rule at a time, as source text. A fill whose
 * ink is set by a different rule — StatsBar.astro paints `.stats-bar` and inks
 * `.stat-value` — is covered by reading each site when it changes, not here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAstroStyles, stripComments, walkStyleSources } from './helpers/css-parse';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_DIR = join(REPO_ROOT, 'src');

const PRIMARY = /var\(--color-primary(?:-dark)?\)/;
const BRIGHT = /var\(--color-primary-bright(?:-dark)?\)/;
const DARK_INK =
  /^(?:var\(--(?:bg-dark|text-light-primary|sash-ink)\)|light-dark\(\s*var\(--bg-dark\))/;
const DARK_SURFACE = /^var\(--bg-dark\)$/;

interface Rule {
  file: string;
  selector: string;
  decls: Map<string, string>;
}

/**
 * Pairings kept on purpose, keyed by file and selector. An entry that stops
 * matching a real rule fails, so the list cannot rot into a blanket pass.
 */
const ACCEPTED = [
  {
    file: 'src/styles/interactions.css',
    selector: '.brutal-interactive:focus-visible',
    // The border IS the focus ring: it must contrast with the page, not with
    // the fill, so it keeps the text-safe primary.
    pattern: 3,
  },
];

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = part
      .slice(i + 1)
      .replace(/\s+/g, ' ')
      .replace(/!\s*important/i, '')
      .trim();
    if (/^[a-z-]+$/.test(prop)) out.set(prop, value);
  }
  return out;
}

function rulesIn(css: string, file: string): Rule[] {
  const rules: Rule[] = [];
  // Innermost blocks only: an at-rule's own brace pair holds no declarations.
  for (const m of stripComments(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    rules.push({ file, selector: m[1].replace(/\s+/g, ' ').trim(), decls: declarations(m[2]) });
  }
  return rules;
}

function inlineStyles(source: string, file: string): Rule[] {
  return [...source.matchAll(/\sstyle="([^"]*)"/g)].map((m) => ({
    file,
    selector: `style="${m[1].slice(0, 40)}…"`,
    decls: declarations(m[1]),
  }));
}

const backgrounds = (r: Rule) =>
  ['background', 'background-color', 'background-image']
    .map((p) => r.decls.get(p))
    .filter((v): v is string => !!v);
const borders = (r: Rule) =>
  [...r.decls].filter(([p]) => /^border(?:-(?:top|right|bottom|left))?(?:-color)?$/.test(p));

function violations(rule: Rule): number[] {
  const found: number[] = [];
  const bgs = backgrounds(rule);
  const color = rule.decls.get('color') ?? '';
  if (bgs.some((v) => PRIMARY.test(v)) && DARK_INK.test(color)) found.push(1);
  if (bgs.some((v) => DARK_SURFACE.test(v)) && PRIMARY.test(color)) found.push(2);
  if (bgs.some((v) => BRIGHT.test(v)) && borders(rule).some(([, v]) => PRIMARY.test(v)))
    found.push(3);
  return found;
}

function collectRules(): Rule[] {
  const files: string[] = [];
  walkStyleSources(SRC_DIR, files);
  const rules: Rule[] = [];
  for (const abs of files) {
    const file = relative(REPO_ROOT, abs).split(sep).join('/');
    const source = readFileSync(abs, 'utf-8');
    if (file.endsWith('.astro')) {
      for (const css of extractAstroStyles(source)) rules.push(...rulesIn(css, file));
      rules.push(...inlineStyles(source, file));
    } else {
      rules.push(...rulesIn(source, file));
    }
  }
  return rules;
}

const RULES = collectRules();
const isAccepted = (r: Rule, pattern: number) =>
  ACCEPTED.some((a) => a.file === r.file && a.selector === r.selector && a.pattern === pattern);

describe('primary pairs with dark only through --color-primary-bright (ADR-0040)', () => {
  it('the detector finds each defect pattern in planted rules', () => {
    const planted = rulesIn(
      `.a { background: var(--color-primary); color: var(--bg-dark); }
       .b { background: var(--bg-dark); color: var(--color-primary); }
       .c { background: var(--color-primary-bright); border: 2px solid var(--color-primary); }
       .d { background: var(--x, var(--color-primary)); color: light-dark(var(--bg-dark), var(--bg-light)); }
       .ok { background: var(--color-primary-bright); color: var(--bg-dark); border-color: var(--color-primary-bright); }
       .ok2 { background: var(--color-primary); color: var(--bg-light); }`,
      'planted.css'
    );
    expect(planted.map(violations)).toEqual([[1], [2], [3], [1], [], []]);
  });

  it('scans real sources (non-vacuity)', () => {
    // The CTA button, skip link and language band are known bright fills; if
    // the walk or the parser broke, this count would collapse.
    const brightFills = RULES.filter((r) => backgrounds(r).some((v) => BRIGHT.test(v)));
    expect(brightFills.length).toBeGreaterThanOrEqual(10);
    expect(brightFills.some((r) => r.selector === '.cta-button')).toBe(true);
  });

  it('no source pairs the text-safe primary with a dark colour', () => {
    const offenders = RULES.flatMap((r) =>
      violations(r)
        .filter((p) => !isAccepted(r, p))
        .map((p) => `pattern ${p}: ${r.file} ${r.selector}`)
    );
    expect(offenders).toEqual([]);
  });

  it('every accepted pairing still matches a real rule', () => {
    for (const a of ACCEPTED) {
      const live = RULES.some(
        (r) => r.file === a.file && r.selector === a.selector && violations(r).includes(a.pattern)
      );
      expect(live, `${a.file} ${a.selector} no longer pairs as accepted — drop the entry`).toBe(
        true
      );
    }
  });
});
