/**
 * Guards for the claude.ai/design sync (`.design-sync/`, BL-135).
 *
 * The published design system names classes and tokens that the design agent
 * trusts verbatim — a name that has no rule behind it produces silently
 * unstyled output, and nothing breaks loudly. `CLAUDE_DESIGN_SYNC.md` and
 * `.design-sync/NOTES.md` list this as the standing re-sync risk; before this
 * file the only check lived in the gitignored `.ds-sync/` skill, so a CSS
 * refactor could rot the docs between syncs with no CI signal. Four guards:
 *
 *   1. NAME PARITY — every `.class`, BEM `__sub` / `--modifier`, and `--token`
 *      named in `conventions.md`, `specimen-docs/*.md` and `specimens/*.tsx`
 *      exists in `src/styles/**\/*.css`. Fenced code blocks ARE scanned (they
 *      are the copyable snippets). Two intentional negatives ("there is no
 *      generic `.brutal-card`") sit in an allowlist that fails when stale.
 *   2. ROOTS COVERAGE — the hand-maintained `ROOTS` list in `build-css.mjs`
 *      reaches every sheet under `src/styles/` via transitive `@import`. Set
 *      equality: a new sheet that ships nowhere fails here, not in production.
 *   3. TYPECHECK — `tsc -p .design-sync` (the root tsconfig's `**\/*` never
 *      descends into dot-directories, so `astro check` cannot see the specimens).
 *   4. CHROME SLICES — every `(page, selector)` in `extract-chrome.mjs`'s `SLICES`
 *      resolves to a route under `src/pages/` and a tag+hook in `.astro` source, so a
 *      rename fails here before anyone re-syncs and hits the extractor's exit-1.
 *
 * Hand-rolled parsers, proven against fixtures first — same posture as
 * `docs-variables-sync.test.ts` (no markdown/CSS parser dependency by design).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const STYLES_DIR = resolve(REPO_ROOT, 'src/styles');
const SYNC_DIR = resolve(REPO_ROOT, '.design-sync');
const BUILD_CSS = resolve(SYNC_DIR, 'build-css.mjs');
const TSC_BIN = resolve(REPO_ROOT, 'node_modules/typescript/bin/tsc');

/**
 * Names the docs deliberately mention as NOT existing ("there is no bare
 * `.brutal-hero`"). Each entry must (a) still be absent from the CSS and
 * (b) still be mentioned in the docs — otherwise the entry is stale and fails.
 */
const INTENTIONAL_NEGATIVES = new Set(['.brutal-card', '.brutal-hero']);

/** Backticked spans that look like classes but are file extensions in prose. */
const FILE_EXTENSIONS = new Set(['.astro', '.css', '.tsx', '.jsx', '.md', '.mjs', '.json', '.ts']);
/** Illustrative placeholders in prose ("every value is a `var(--token)`"), not names. */
const PLACEHOLDERS = new Set(['--token']);

// --- File helpers -----------------------------------------------------------

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, ext, out);
    else if (entry.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(REPO_ROOT, p).replace(/\\/g, '/');

// --- CSS side ---------------------------------------------------------------

export interface CssVocabulary {
  classes: Set<string>; // e.g. "brutal-btn", "brutal-btn--primary"
  tokens: Set<string>; // e.g. "--color-primary"
}

/**
 * Collect every class selector and every custom-property DEFINITION from a
 * stylesheet. Classes are read only from selector/prelude text (the run of
 * text before each `{`), so `.5rem` in a value or `.svg` in a url() never
 * counts. Tokens are `--name:` definitions anywhere.
 */
export function parseCssVocabulary(css: string, into?: CssVocabulary): CssVocabulary {
  const vocab = into ?? { classes: new Set<string>(), tokens: new Set<string>() };
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // Selector text = everything since the last `{`, `}` or `;` up to a `{`.
  const preludeRe = /([^{};]*)\{/g;
  for (const m of noComments.matchAll(preludeRe)) {
    for (const cls of m[1].matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) vocab.classes.add(cls[1]);
  }
  for (const t of noComments.matchAll(/(?<![\w-])(--[A-Za-z][\w-]*)\s*:/g)) vocab.tokens.add(t[1]);
  return vocab;
}

/** All `@import '...'` targets of a sheet, resolved to absolute paths. */
export function parseImports(css: string, fromFile: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const m of noComments.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g)) {
    out.push(resolve(dirname(fromFile), m[1]));
  }
  return out;
}

// --- Docs side --------------------------------------------------------------

export interface DocRef {
  /**
   * What the doc asserts:
   *   class            → `.block`, `.block__sub`, `.block--mod` (fully qualified)
   *   sub              → bare `__sub` — must exist as `<block>__sub` for some block
   *   dashes           → bare `--x` — a token, or `<block>[__*]--x` for some block
   *   token            → `--token` from `var(--token)`
   *   token-glob       → `--surface-*-bg`
   */
  kind: 'class' | 'sub' | 'dashes' | 'token' | 'token-glob';
  name: string;
  file: string;
  line: number;
  /**
   * For `sub` / `dashes`: candidate blocks, most specific first — the nearest
   * `.block` named earlier on the same line, then every block the file names.
   * A bare part is fine if ANY candidate makes it resolve; the failure names
   * the line, so a mis-scoped mention is a one-line doc fix.
   */
  blocks?: string[];
}

/**
 * Expand the slash shorthand the conventions header uses inside one code span:
 *   `.brutal-heading-xl/-lg/-md/-sm` → xl, lg, md, sm
 *   `--border-dark-subtle/-default/-prominent` → subtle, default, prominent
 * Each `/-suffix` replaces the LAST hyphen segment of the head.
 */
export function expandSlashShorthand(span: string): string[] {
  if (!span.includes('/-')) return [span];
  const [head, ...tails] = span.split('/');
  const stem = head.replace(/-[^-]+$/, '');
  return [head, ...tails.map((t) => `${stem}${t}`)];
}

const stemOf = (cls: string) => cls.replace(/(__|--).*$/, '');

/**
 * Pull every name a doc file asserts. Handles:
 *   - backticked `.class`, `.block__sub`, `--token`, bare `__sub`, bare `--mod`
 *   - `className="a b c"` (JSX in .tsx and in fenced .md snippets)
 *   - `var(--token)` inside inline styles
 */
export function extractDocRefs(text: string, file: string): DocRef[] {
  const refs: DocRef[] = [];
  const lines = text.split(/\r?\n/);
  const fileBlocks = new Set<string>();
  const bare: { ref: DocRef; lineBlock: string | null }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    let lineBlock: string | null = null;

    // 1. Backticked spans, in order (a `.block` qualifies later parts on its line).
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      for (const span of expandSlashShorthand(m[1].trim())) {
        if (/^\.-?[A-Za-z_][\w-]*$/.test(span)) {
          if (FILE_EXTENSIONS.has(span)) continue; // `.astro`, `.css` — prose, not a class
          refs.push({ kind: 'class', name: span, file, line: lineNo });
          lineBlock = stemOf(span);
          fileBlocks.add(lineBlock);
        } else if (/^--[A-Za-z][\w-]*$/.test(span)) {
          if (PLACEHOLDERS.has(span)) continue;
          bare.push({ ref: { kind: 'dashes', name: span, file, line: lineNo }, lineBlock });
        } else if (/^--[A-Za-z][\w*-]*\*[\w*-]*$/.test(span)) {
          refs.push({ kind: 'token-glob', name: span, file, line: lineNo });
        } else if (/^__[\w-]+$/.test(span)) {
          bare.push({ ref: { kind: 'sub', name: span, file, line: lineNo }, lineBlock });
        }
        // Anything else (`-dark`, `styles.css`, `<h2>`, prose) is not a name claim.
      }
    }
    // 2. JSX className string literals.
    for (const m of line.matchAll(/className="([^"]*)"/g)) {
      for (const cls of m[1].split(/\s+/).filter(Boolean)) {
        refs.push({ kind: 'class', name: `.${cls}`, file, line: lineNo });
        fileBlocks.add(stemOf(`.${cls}`));
      }
    }
    // 3. var(--token) anywhere (inline styles, prose).
    for (const m of line.matchAll(/var\((--[A-Za-z][\w-]*)\)/g)) {
      if (PLACEHOLDERS.has(m[1])) continue;
      refs.push({ kind: 'token', name: m[1], file, line: lineNo });
    }
  }

  for (const { ref, lineBlock } of bare) {
    const blocks = [
      ...(lineBlock ? [lineBlock] : []),
      ...[...fileBlocks].filter((b) => b !== lineBlock),
    ];
    refs.push({ ...ref, blocks });
  }
  return refs;
}

/**
 * Resolve one doc reference against the CSS vocabulary. Returns null when it
 * exists, or a human-readable reason when it does not.
 */
export function resolveRef(ref: DocRef, vocab: CssVocabulary): string | null {
  switch (ref.kind) {
    case 'token':
      return vocab.tokens.has(ref.name) ? null : `token ${ref.name} is not defined`;
    case 'token-glob': {
      const re = new RegExp(
        `^${ref.name.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '[\\w-]+' : `\\${c}`))}$`
      );
      return [...vocab.tokens].some((t) => re.test(t))
        ? null
        : `token glob ${ref.name} matches nothing`;
    }
    case 'class':
      return vocab.classes.has(ref.name.slice(1))
        ? null
        : `class ${ref.name} has no rule in src/styles`;
    case 'sub': {
      const blocks = ref.blocks ?? [];
      if (blocks.some((b) => vocab.classes.has(`${b.slice(1)}${ref.name}`))) return null;
      return blocks.length
        ? `sub-element ${ref.name} exists on none of the ${blocks.length} block(s) this doc names (nearest: ${blocks[0]})`
        : `unqualified sub-element ${ref.name} (no .block named in this doc)`;
    }
    case 'dashes': {
      if (vocab.tokens.has(ref.name)) return null;
      const blocks = ref.blocks ?? [];
      const asModifier = (b: string) =>
        [...vocab.classes].some((c) => c.startsWith(b.slice(1)) && c.endsWith(ref.name));
      if (blocks.some(asModifier)) return null;
      return blocks.length
        ? `neither token ${ref.name} nor a ${ref.name} modifier on any of the ${blocks.length} block(s) this doc names (nearest: ${blocks[0]})`
        : `token ${ref.name} is not defined`;
    }
  }
}

// --- Fixtures (red/green) ---------------------------------------------------

describe('css vocabulary parser', () => {
  it('reads classes only from selector text and tokens only from definitions', () => {
    const css = [
      '/* .comment-class { --comment-token: 1 } */',
      ':root { --real-token: 0.5rem; --other: var(--real-token); }',
      '.a, .b__sub--mod:hover > .c { margin: .5rem; mask: url(/x.svg); color: var(--not-a-def); }',
      '@media (max-width: 768px) { .inside-media { padding: 1.5rem; } }',
    ].join('\n');
    const v = parseCssVocabulary(css);
    expect([...v.classes].sort()).toEqual(['a', 'b__sub--mod', 'c', 'inside-media']);
    expect([...v.tokens].sort()).toEqual(['--other', '--real-token']);
  });

  it('resolves @import targets relative to the importing file', () => {
    const from = resolve('/root/global.css');
    const imports = parseImports('@import \'./a.css\';\n@import url("components/b.css");', from);
    expect(imports).toEqual([resolve('/root/a.css'), resolve('/root/components/b.css')]);
  });
});

describe('doc reference extractor', () => {
  it('expands slash shorthand on the last hyphen segment', () => {
    expect(expandSlashShorthand('.brutal-heading-xl/-lg/-md')).toEqual([
      '.brutal-heading-xl',
      '.brutal-heading-lg',
      '.brutal-heading-md',
    ]);
    expect(expandSlashShorthand('--border-dark-subtle/-default')).toEqual([
      '--border-dark-subtle',
      '--border-dark-default',
    ]);
    expect(expandSlashShorthand('.plain')).toEqual(['.plain']);
  });

  it('collects classes, bare parts with their candidate blocks (line block first), tokens and globs; skips prose', () => {
    const md = [
      '| `.brutal-stat-tile` | `__value`, `__label` |',
      '`.brutal-btn` + `--primary`; also `--spacing-xs` and `--surface-*-bg`; files are `.astro`',
      '<div className="brutal-callout brutal-callout--warning" style={{ gap: "var(--gap-normal)" }} />',
      'Then `__title` (no block on this line) and `-dark` and `styles.css` and `var(--token)`',
    ].join('\n');
    const refs = extractDocRefs(md, 'fixture.md');
    const byName = (n: string) => refs.find((r) => r.name === n);
    expect(byName('.brutal-stat-tile')?.kind).toBe('class');
    expect(byName('__value')?.blocks?.[0], 'line block comes first').toBe('.brutal-stat-tile');
    expect(byName('--primary')?.kind).toBe('dashes');
    expect(byName('--primary')?.blocks?.[0]).toBe('.brutal-btn');
    expect(
      byName('--spacing-xs')?.kind,
      'a real token also arrives as dashes; resolver checks tokens first'
    ).toBe('dashes');
    expect(byName('--surface-*-bg')?.kind).toBe('token-glob');
    expect(byName('.brutal-callout--warning')?.kind).toBe('class');
    expect(byName('--gap-normal')?.kind).toBe('token');
    expect(byName('__title')?.blocks, 'no line block → every block the file names').toEqual([
      '.brutal-stat-tile',
      '.brutal-btn',
      '.brutal-callout',
    ]);
    const names = refs.map((r) => r.name);
    expect(names).not.toContain('.astro');
    expect(names).not.toContain('--token');
    expect(names).not.toContain('-dark');
    expect(names).not.toContain('styles.css');
  });

  it('resolveRef: modifiers via any candidate block, tokens via definition, globs need one match, misses name the reason', () => {
    const vocab: CssVocabulary = {
      classes: new Set([
        'brutal-btn',
        'brutal-btn--primary',
        'brutal-rec-card',
        'brutal-rec-card__badge--high',
        'brutal-progress-bar__fill',
      ]),
      tokens: new Set(['--spacing-xs', '--surface-faint-bg']),
    };
    const ok = (partial: Omit<DocRef, 'file' | 'line'>) =>
      resolveRef({ file: 'f', line: 1, ...partial }, vocab);
    expect(ok({ kind: 'dashes', name: '--primary', blocks: ['.brutal-btn'] })).toBeNull();
    expect(
      ok({ kind: 'dashes', name: '--high', blocks: ['.brutal-rec-card'] }),
      'via __badge--high'
    ).toBeNull();
    expect(
      ok({ kind: 'dashes', name: '--spacing-xs', blocks: ['.brutal-btn'] }),
      'token wins'
    ).toBeNull();
    expect(ok({ kind: 'dashes', name: '--ghost', blocks: ['.brutal-btn'] })).toMatch(
      /neither token/
    );
    expect(ok({ kind: 'dashes', name: '--ghost', blocks: [] })).toMatch(/not defined/);
    expect(
      ok({ kind: 'sub', name: '__fill', blocks: ['.brutal-btn', '.brutal-progress-bar'] })
    ).toBeNull();
    expect(ok({ kind: 'sub', name: '__fill', blocks: ['.brutal-btn'] })).toMatch(/exists on none/);
    expect(ok({ kind: 'sub', name: '__fill', blocks: [] })).toMatch(/unqualified/);
    expect(ok({ kind: 'token-glob', name: '--surface-*-bg' })).toBeNull();
    expect(ok({ kind: 'token-glob', name: '--nope-*-bg' })).toMatch(/matches nothing/);
    expect(ok({ kind: 'class', name: '.brutal-card' })).toMatch(/has no rule/);
  });
});

// --- Guard 1: name parity ---------------------------------------------------

describe('design-sync docs ↔ src/styles name parity', () => {
  const cssFiles = walk(STYLES_DIR, '.css');
  const vocab: CssVocabulary = { classes: new Set(), tokens: new Set() };
  for (const f of cssFiles) parseCssVocabulary(readFileSync(f, 'utf-8'), vocab);

  const docFiles = [
    resolve(SYNC_DIR, 'conventions.md'),
    ...walk(resolve(SYNC_DIR, 'specimen-docs'), '.md'),
    ...walk(resolve(SYNC_DIR, 'specimens'), '.tsx'),
  ];
  const refs = docFiles.flatMap((f) => extractDocRefs(readFileSync(f, 'utf-8'), rel(f)));

  it('parsers found a populated vocabulary on both sides (sanity — the guard probes something)', () => {
    expect(vocab.classes.size, 'CSS classes').toBeGreaterThan(200);
    expect(vocab.tokens.size, 'CSS tokens').toBeGreaterThan(150);
    expect(refs.length, 'doc references').toBeGreaterThan(150);
  });

  it('every class, sub-element, modifier and token the docs name exists in src/styles', () => {
    const misses = refs
      .filter((r) => !INTENTIONAL_NEGATIVES.has(r.name))
      .map((r) => ({ r, why: resolveRef(r, vocab) }))
      .filter((x) => x.why !== null);
    if (misses.length > 0) {
      const report = misses.map(({ r, why }) => `  ${r.file}:${r.line}  ${why}`).join('\n');
      throw new Error(
        `${misses.length} name(s) the design-sync docs assert do not exist in src/styles — ` +
          `the design agent will emit unstyled markup for each. Fix the doc or the CSS:\n${report}`
      );
    }
  });

  it('every intentional negative is still absent from the CSS and still mentioned in the docs (allowlist not stale)', () => {
    for (const neg of INTENTIONAL_NEGATIVES) {
      expect(
        vocab.classes.has(neg.slice(1)),
        `${neg} now EXISTS — remove it from INTENTIONAL_NEGATIVES`
      ).toBe(false);
      expect(
        refs.some((r) => r.name === neg),
        `${neg} is no longer mentioned in the docs — remove it from INTENTIONAL_NEGATIVES`
      ).toBe(true);
    }
  });
});

// --- Guard 2: ROOTS coverage ------------------------------------------------

describe('build-css.mjs ROOTS reaches every sheet under src/styles', () => {
  const src = readFileSync(BUILD_CSS, 'utf-8');
  const rootsBlock = src.match(/const ROOTS\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
  const roots = [...rootsBlock.matchAll(/['"]([^'"]+\.css)['"]/g)].map((m) =>
    resolve(REPO_ROOT, m[1])
  );

  it('parsed a non-empty ROOTS list from build-css.mjs', () => {
    expect(roots.length).toBeGreaterThan(0);
    for (const r of roots)
      expect(existsSync(r), `ROOTS entry missing on disk: ${rel(r)}`).toBe(true);
  });

  it('the transitive @import closure of ROOTS equals the set of sheets in src/styles (no sheet ships nowhere)', () => {
    const reached = new Set<string>();
    const queue = [...roots];
    while (queue.length) {
      const f = queue.pop()!;
      if (reached.has(f)) continue;
      reached.add(f);
      if (existsSync(f)) queue.push(...parseImports(readFileSync(f, 'utf-8'), f));
    }
    const all = new Set(walk(STYLES_DIR, '.css'));
    const unreached = [...all].filter((f) => !reached.has(f)).map(rel);
    const outside = [...reached].filter((f) => !all.has(f)).map(rel);
    expect(
      unreached,
      'sheets under src/styles that build-css.mjs never bundles — add to ROOTS (or to global.css)'
    ).toEqual([]);
    expect(outside, 'ROOTS reaches files outside src/styles').toEqual([]);
  });
});

// --- Guard 3: the specimen sources type-check ---------------------------------

describe('.design-sync specimen sources type-check', () => {
  it('tsc -p .design-sync passes (the root tsconfig never sees dot-directories, so astro check cannot cover them)', () => {
    // ~2s; the specimens are ten small files. Failures print tsc's own diagnostics.
    const result = spawnSync(process.execPath, [TSC_BIN, '-p', SYNC_DIR, '--noEmit'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    expect(result.status, `tsc exited ${result.status}:\n${result.stdout}${result.stderr}`).toBe(0);
  }, 60_000);
});

// --- Guard 4: chrome extraction slices still resolve to source ----------------

describe('extract-chrome.mjs SLICES resolve to source', () => {
  // The extractor slices the PRODUCTION BUILD, which is not available in CI. This
  // guard checks the cheaper invariant: every configured (page, selector) still
  // has a source behind it — the route exists under src/pages/ and the selector's
  // tag + class/id appears in .astro source — so a rename fails `test:docs`
  // before anyone re-syncs and hits the extractor's exit-1.
  const src = readFileSync(resolve(SYNC_DIR, 'extract-chrome.mjs'), 'utf-8');
  const slicesBlock = src.match(/export const SLICES = \[([\s\S]*?)\n\];/)?.[1] ?? '';
  // One object literal per entry: split on the entry boundary, then read the
  // fields per entry so a malformed entry cannot be swallowed into its neighbour.
  const entries = slicesBlock.split(/\n\s*\},?\s*\n/).filter((e) => /\bname:\s*'/.test(e));
  const field = (e: string, k: string) => e.match(new RegExp(`\\b${k}:\\s*'([^']+)'`))?.[1];
  const slices = entries.map((e) => ({
    name: field(e, 'name') ?? '?',
    page: field(e, 'page') ?? '',
    selector: field(e, 'selector') ?? '',
    source: field(e, 'source') ?? '',
  }));
  const nameCount = (slicesBlock.match(/\bname:\s*'/g) ?? []).length;
  const astroFiles = [
    ...walk(resolve(REPO_ROOT, 'src/pages'), '.astro'),
    ...walk(resolve(REPO_ROOT, 'src/components'), '.astro'),
    ...walk(resolve(REPO_ROOT, 'src/layouts'), '.astro'),
  ];
  const astroSource = astroFiles.map((f) => readFileSync(f, 'utf-8')).join('\n');

  it('parsed a populated SLICES list (sanity — the guard probes something)', () => {
    expect(slices.length).toBeGreaterThanOrEqual(10);
    expect(slices.length, 'every name: became an entry — none swallowed').toBe(nameCount);
    for (const s of slices) {
      expect(s.page, `${s.name}: page`).not.toBe('');
      expect(s.selector, `${s.name}: selector`).not.toBe('');
      expect(
        existsSync(resolve(REPO_ROOT, s.source)),
        `${s.name}: source "${s.source}" exists`
      ).toBe(true);
    }
  });

  it('every slice page is a route under src/pages and its selector names a tag+hook present in .astro source', () => {
    const misses: string[] = [];
    for (const s of slices) {
      const route = s.page.replace(/index\.html$/, '');
      const candidates = [
        resolve(REPO_ROOT, 'src/pages', route, 'index.astro'),
        resolve(REPO_ROOT, 'src/pages', `${route.replace(/\/$/, '') || 'index'}.astro`),
      ];
      if (!candidates.some((c) => existsSync(c)))
        misses.push(`${s.name}: no src/pages route for "${s.page}"`);
      // selector shapes used: tag.class, tag#id, tag[attr="v"]
      const m = s.selector.match(/^([a-z0-9]+)(?:\.([\w-]+)|#([\w-]+)|\[([\w-]+)="([^"]+)"\])$/);
      if (!m) {
        misses.push(`${s.name}: selector shape not understood: ${s.selector}`);
        continue;
      }
      const [, tag, cls, id, attr, val] = m;
      const found = cls
        ? tagHasClassToken(astroSource, tag, cls)
        : id
          ? new RegExp(`<${tag}\\b[^>]*\\bid="${id}"`).test(astroSource)
          : new RegExp(`<${tag}\\b[^>]*\\b${attr}="${val}"`).test(astroSource);
      if (!found)
        misses.push(
          `${s.name}: no <${tag}> carrying ${cls ? `class ${cls}` : id ? `id ${id}` : `${attr}="${val}"`} in .astro source`
        );
    }
    expect(misses, misses.join('\n')).toEqual([]);
  });

  it('class hook is an exact token — a suffix rename or a lookalike elsewhere in the tag does not satisfy it (mutation proof)', () => {
    expect(tagHasClassToken('<section class="hero">', 'section', 'hero')).toBe(true);
    expect(tagHasClassToken('<section class="band hero wide">', 'section', 'hero')).toBe(true);
    expect(
      tagHasClassToken(
        '<header class={`site-header${x ? " site-header--static" : ""}`}>',
        'header',
        'site-header'
      )
    ).toBe(true);
    expect(tagHasClassToken('<section class="hero-band">', 'section', 'hero')).toBe(false);
    expect(
      tagHasClassToken('<section class="who-we-support-v2">', 'section', 'who-we-support')
    ).toBe(false);
    expect(tagHasClassToken('<section class="band" data-kind="hero">', 'section', 'hero')).toBe(
      false
    );
    expect(tagHasClassToken('<div class="hero">', 'section', 'hero')).toBe(false);
  });
});

/**
 * True when some `<tag …>` opener in `source` carries `cls` as an EXACT token of
 * its class attribute — `class="a b"` or an Astro expression `class={`a ${…}`}`.
 * Tokens are split on whitespace, quotes, backticks and template braces, so
 * `hero-band` never satisfies `hero`, and a lookalike in another attribute
 * (`data-kind="hero"`) is never consulted.
 */
function tagHasClassToken(source: string, tag: string, cls: string): boolean {
  const opener = new RegExp(`<${tag}\\b[^>]*>`, 'g');
  for (const m of source.matchAll(opener)) {
    // class="…", class={`…`} or Astro's class:list={['a', …]}
    const attrVal = m[0].match(
      /\bclass(?::list)?=(?:"([^"]*)"|'([^']*)'|\{((?:[^{}]|\{[^{}]*\})*)\})/
    );
    if (!attrVal) continue;
    const raw = attrVal[1] ?? attrVal[2] ?? attrVal[3] ?? '';
    const tokens = raw.split(/[\s"'`${}?:,[\]]+/).filter(Boolean);
    if (tokens.includes(cls)) return true;
  }
  return false;
}
