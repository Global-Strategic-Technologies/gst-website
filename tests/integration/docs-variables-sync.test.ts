/**
 * VARIABLES_REFERENCE.md ↔ variables.css parity guard.
 *
 * `src/docs/styles/VARIABLES_REFERENCE.md` bills itself as the "complete
 * catalog" of the design-system tokens in `src/styles/variables.css`, and
 * styling work is steered to it before touching any CSS. Nothing enforced that
 * claim — three successive audits found stale rows (tokens that no longer
 * exist), missing rows (tokens never documented), a duplicated row, and
 * literal values that survived a refactor to `var(...)` derivations. This
 * guard makes the parity claim mechanical:
 *
 *   1. every token documented in the reference exists in `:root`,
 *   2. every `:root` token is documented in the reference,
 *   3. no token is documented twice, and
 *   4. documented pure-literal values (no `var(`/`light-dark(`) match the CSS.
 *
 * Intentional scope decisions:
 *   - Only FIRST-column `` `--token` `` table cells count as documentation —
 *     prose mentions, second-column cross-references (e.g. the Quick Lookup
 *     table) and fenced code blocks are ignored.
 *   - The "Alternative Palette Variables" section documents `palettes.css`
 *     PATTERNS (`--altN-*`), not `variables.css` tokens — it is excluded by
 *     its heading text, never by line numbers.
 *   - The `html.dark-theme` block is NOT parsed: it only carries
 *     `color-scheme` plus RGB-triplet re-declarations of tokens already in
 *     `:root` (triplets are not `<color>` values, so `light-dark()` cannot
 *     express them).
 *   - Value comparison (4) is deliberately pragmatic: it only fires for
 *     single-value `Value` columns; Light/Dark two-column shapes are skipped
 *     rather than served by a brittle normalizer.
 *
 * No markdown/CSS parsing library is a dependency of this repo (by design —
 * see `docs-link-integrity.test.ts`), so both parsers are hand-rolled below
 * and proven against red/green fixtures first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const DOC_PATH = resolve(REPO_ROOT, 'src/docs/styles/VARIABLES_REFERENCE.md');
const CSS_PATH = resolve(REPO_ROOT, 'src/styles/variables.css');

/** Heading text marking the section that documents palettes.css patterns, not tokens. */
const EXCLUDED_SECTION_RE = /alternative palette/i;

// --- Markdown token-table parser -------------------------------------------

interface DocTokenEntry {
  /** Token name from the row's first cell, e.g. `--color-primary`. */
  token: string;
  /** Remaining raw cells of the row (index 0 = second column). */
  cells: string[];
  /** Header cells of the table this row belongs to (raw, same order). */
  headers: string[];
  /** 1-indexed line number in the markdown source. */
  line: number;
}

/** Split a `| a | b |` row into trimmed cell strings. */
function splitCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** True for a `| --- | :--- |`-style table separator row. */
function isSeparatorRow(line: string): boolean {
  return /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

/**
 * Collect every token documented as a table row: a row whose FIRST cell starts
 * with a backticked `--token`. Skips fenced code blocks and the excluded
 * alternative-palette section (detected by heading text, not line numbers).
 * Returns an array (not a set) so duplicate rows are detectable.
 */
function parseDocTokens(markdown: string): DocTokenEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: DocTokenEntry[] = [];
  let inFence = false;
  let skipHeadingLevel = 0; // >0 while inside the excluded section
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      if (skipHeadingLevel > 0 && level <= skipHeadingLevel) skipHeadingLevel = 0;
      if (skipHeadingLevel === 0 && EXCLUDED_SECTION_RE.test(heading[2])) {
        skipHeadingLevel = level;
      }
      continue;
    }
    if (skipHeadingLevel > 0) continue;

    if (!line.trimStart().startsWith('|')) continue;
    if (isSeparatorRow(line)) continue;

    // A row directly above a separator is the table's header row.
    if (isSeparatorRow(lines[i + 1] ?? '')) {
      headers = splitCells(line);
      continue;
    }

    const cells = splitCells(line);
    const tokenMatch = cells[0]?.match(/^`(--[a-z0-9_-]+)`/i);
    if (!tokenMatch) continue;
    entries.push({ token: tokenMatch[1], cells: cells.slice(1), headers, line: i + 1 });
  }
  return entries;
}

// --- variables.css parser ---------------------------------------------------

/**
 * Extract every custom-property declaration from the `:root { ... }` block as
 * a Map name → whitespace-normalized value. Comments are stripped first;
 * multi-line values (e.g. wrapped `light-dark(...)`) are accumulated until the
 * terminating `;`. Everything after `:root`'s closing brace — including
 * `html.dark-theme` and the utility classes — is ignored.
 */
function parseCssTokens(css: string): Map<string, string> {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rootStart = noComments.indexOf(':root');
  const braceOpen = noComments.indexOf('{', rootStart);
  const braceClose = noComments.indexOf('}', braceOpen);
  const block = noComments.slice(braceOpen + 1, braceClose);

  const tokens = new Map<string, string>();
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const decl = lines[i].match(/^\s*(--[a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!decl) continue;
    let rest = decl[2];
    while (!rest.includes(';') && i + 1 < lines.length) {
      i++;
      rest += ` ${lines[i]}`;
    }
    const semi = rest.indexOf(';');
    const raw = semi === -1 ? rest : rest.slice(0, semi);
    tokens.set(decl[1], raw.replace(/\s+/g, ' ').trim());
  }
  return tokens;
}

/** Normalize a CSS value or doc value cell for literal comparison. */
function normalizeValue(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

// --- Parser fixtures (red/green) --------------------------------------------

describe('markdown token-table parser', () => {
  it('collects first-column tokens with their value cells and table headers', () => {
    const md = [
      '# Fixture',
      '',
      '| Variable | Value | Usage |',
      '| -------- | ----- | ----- |',
      '| `--alpha` | `#fff` | Something |',
      '| `--beta-2_5` | `0.5rem` (8px) | Other |',
    ].join('\n');

    const entries = parseDocTokens(md);
    expect(entries.map((e) => e.token)).toEqual(['--alpha', '--beta-2_5']);
    expect(entries[0].cells[0], 'value cell of the first row').toBe('`#fff`');
    expect(entries[0].headers[1], 'second header cell of the table').toBe('Value');
    expect(entries[1].cells[0], 'suffix prose stays in the raw cell').toBe('`0.5rem` (8px)');
  });

  it('ignores fenced code blocks, non-table prose, second-column tokens, and the alternative-palette section', () => {
    const md = [
      '# Fixture',
      '',
      'Prose mentioning `--not-a-row` is not documentation.',
      '',
      '```md',
      '| `--fenced-token` | `#000` |',
      '```',
      '',
      '| Variable | Value |',
      '| -------- | ----- |',
      '| `--real` | `1rem` |',
      '',
      '| I need... | Use |',
      '| --------- | --- |',
      '| A color   | `--second-column-token` |',
      '',
      '## Alternative Palette Variables (`palettes.css`)',
      '',
      '| Variable Pattern | Description |',
      '| ---------------- | ----------- |',
      '| `--alt1-color-primary` | ignored pattern row |',
      '',
      '### Subsection still inside the excluded section',
      '',
      '| Variable | Value |',
      '| -------- | ----- |',
      '| `--alt2-color-primary` | `#123456` |',
      '',
      '## Next Section',
      '',
      '| Variable | Value |',
      '| -------- | ----- |',
      '| `--after-excluded-section` | `2rem` |',
    ].join('\n');

    const tokens = parseDocTokens(md).map((e) => e.token);
    expect(tokens).toEqual(['--real', '--after-excluded-section']);
  });

  it('reports duplicate rows as separate entries (duplicates are detectable)', () => {
    const md = [
      '| Variable | Value |',
      '| -------- | ----- |',
      '| `--dup` | `1px` |',
      '| `--dup` | `2px` |',
    ].join('\n');
    expect(parseDocTokens(md).map((e) => e.token)).toEqual(['--dup', '--dup']);
  });
});

describe('variables.css parser', () => {
  it('parses :root declarations (incl. multi-line light-dark values), excluding comments and dark-theme overrides', () => {
    const css = [
      '/* header comment mentioning --decoy: nope; */',
      ':root {',
      '  color-scheme: light;',
      '  --simple: #fff;',
      '  --multi: light-dark(',
      '    rgba(1, 2, 3, 0.5),',
      '    rgba(4, 5, 6, 0.6)',
      '  );',
      '  --with-comment: -1; /* trailing note */',
      '}',
      '',
      'html.dark-theme {',
      '  --override-only: #000;',
      '}',
    ].join('\n');

    const tokens = parseCssTokens(css);
    expect(tokens.get('--simple')).toBe('#fff');
    expect(tokens.get('--multi'), 'multi-line value is accumulated to the `;`').toBe(
      'light-dark( rgba(1, 2, 3, 0.5), rgba(4, 5, 6, 0.6) )'
    );
    expect(tokens.get('--with-comment'), 'value stops at the `;`').toBe('-1');
    expect(tokens.has('--override-only'), 'dark-theme block is not parsed').toBe(false);
    expect(tokens.has('--decoy'), 'comments are stripped before parsing').toBe(false);
    expect(tokens.size).toBe(3);
  });
});

// --- Parity -----------------------------------------------------------------

describe('VARIABLES_REFERENCE.md ↔ variables.css parity', () => {
  const docEntries = parseDocTokens(readFileSync(DOC_PATH, 'utf-8'));
  const cssTokens = parseCssTokens(readFileSync(CSS_PATH, 'utf-8'));

  it('parsers found a populated token set on both sides (sanity)', () => {
    expect(docEntries.length, 'documented token rows').toBeGreaterThan(150);
    expect(cssTokens.size, ':root declarations').toBeGreaterThan(150);
  });

  it('every documented token is declared in variables.css :root', () => {
    const stale = docEntries.filter((e) => !cssTokens.has(e.token));
    if (stale.length > 0) {
      const report = stale.map((e) => `  ${e.token} (VARIABLES_REFERENCE.md:${e.line})`).join('\n');
      throw new Error(
        `${stale.length} documented token(s) do not exist in variables.css :root — ` +
          `remove or correct the row(s):\n${report}`
      );
    }
  });

  it('every :root token is documented in VARIABLES_REFERENCE.md', () => {
    const documented = new Set(docEntries.map((e) => e.token));
    const missing = [...cssTokens.keys()].filter((token) => !documented.has(token));
    if (missing.length > 0) {
      throw new Error(
        `${missing.length} variables.css :root token(s) are missing from ` +
          `VARIABLES_REFERENCE.md — add a table row for each:\n  ${missing.join('\n  ')}`
      );
    }
  });

  it('no token is documented twice', () => {
    const seen = new Map<string, number>();
    for (const { token } of docEntries) seen.set(token, (seen.get(token) ?? 0) + 1);
    const duplicated = [...seen.entries()].filter(([, count]) => count > 1);
    if (duplicated.length > 0) {
      const report = duplicated.map(([token, count]) => `  ${token} (${count} rows)`).join('\n');
      throw new Error(
        `${duplicated.length} token(s) documented more than once — merge the rows:\n${report}`
      );
    }
  });

  it('pure-literal documented values match the CSS', () => {
    const byToken = new Map(docEntries.map((e) => [e.token, e]));
    const mismatches: string[] = [];

    for (const [token, cssValue] of cssTokens) {
      // Only pure literals — derived values (var()/light-dark()) have no
      // single doc-comparable form.
      if (cssValue.includes('var(') || cssValue.includes('light-dark(')) continue;

      const entry = byToken.get(token);
      if (!entry) continue; // parity is asserted by its own test above

      // Only single-value `Value` columns are comparable; Light/Dark
      // two-column shapes (and pattern tables) are deliberately skipped.
      if (entry.headers[1]?.toLowerCase() !== 'value') continue;

      const codeSpan = entry.cells[0]?.match(/`([^`]+)`/);
      if (!codeSpan) continue; // no backticked value in the cell — not comparable

      if (normalizeValue(codeSpan[1]) !== normalizeValue(cssValue)) {
        mismatches.push(
          `  ${token} (VARIABLES_REFERENCE.md:${entry.line}): ` +
            `doc says \`${codeSpan[1]}\`, variables.css says \`${cssValue}\``
        );
      }
    }

    if (mismatches.length > 0) {
      throw new Error(
        `${mismatches.length} documented literal value(s) drifted from variables.css:\n` +
          mismatches.join('\n')
      );
    }
  });
});
