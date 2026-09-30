/**
 * The font-size lint rule fires as an ERROR, in both config blocks, and admits
 * exactly what ADR-0043 rules it may.
 *
 * WHY THIS EXISTS AS A TEST. The rule ran at `warning` for two months (BL-094)
 * while the type scale waited on a ruling, and a warning-severity rule is green
 * in CI however many findings it has. Flipping it to `error` is only worth
 * something if the flip is proven — by mutation, not by a green run — and stays
 * proven: a later edit that drops the severity, or widens the allow-list, must
 * fail here rather than quietly re-open the scale.
 *
 * WHY ALL THREE SOURCES. The rule is declared in the base block and again in the
 * `**\/*.astro` override (the same shape as the spacing rule, ADR-0029), and
 * stylelint parses inline `style=` attributes under `postcss-html` — the one
 * place the source-scanning floor test needs its own extractor to see.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = join(REPO_ROOT, '.stylelintrc.json');
const RULE = 'declaration-property-value-allowed-list';

async function lint(code: string, filename: string): Promise<{ text: string; severity: string }[]> {
  const { results } = await stylelint.lint({ code, codeFilename: filename, configFile: CONFIG });
  return results[0].warnings
    .filter((w) => w.rule === RULE)
    .map((w) => ({ text: w.text, severity: w.severity }));
}

describe('font-size lint rule (ADR-0043)', () => {
  describe('it fires as an error — proven by mutation, in every source', () => {
    it.each([
      ['css', 'x.css', '.x { font-size: 13px; }'],
      ['astro <style>', 'x.astro', '<style>.x { font-size: 13px; }</style>'],
      ['astro inline style attribute', 'x.astro', '<div style="font-size:13px"></div>'],
    ])('flags a literal in %s', async (_label, file, code) => {
      const found = await lint(code, file);
      expect(found.length, `expected ${RULE} to fire on: ${code}`).toBeGreaterThan(0);
      expect(found.every((f) => f.severity === 'error')).toBe(true);
    });

    it.each([
      ['a rem literal', '0.9rem'],
      ['a px literal', '13px'],
      ['a rem literal that ends in "em"', '0.75rem'],
      ['a literal inside clamp()', 'clamp(1rem, 2vw, 2rem)'],
      ['a percentage', '90%'],
      ['a viewport unit', '4vw'],
    ])('flags %s', async (_label, value) => {
      expect(await lint(`.x { font-size: ${value}; }`, 'x.css')).not.toEqual([]);
    });
  });

  describe('it admits what the ruling admits', () => {
    it.each([
      ['a token', 'var(--text-sm)'],
      ['a clamp of tokens', 'clamp(var(--text-3xl), 6vw, var(--text-5xl))'],
      ['a print size in pt', '9pt'],
      ['a fractional pt', '9.75pt'],
      ['an em size that follows its parent', '0.9em'],
      ['a CSS-wide keyword', 'inherit'],
    ])('leaves %s alone', async (_label, value) => {
      expect(await lint(`.x { font-size: ${value}; }`, 'x.css')).toEqual([]);
    });

    it('leaves a pt size marked !important alone', async () => {
      // postcss keeps the flag outside `decl.value`, so the allow-list sees `36pt`.
      expect(await lint('.x { font-size: 36pt !important; }', 'x.css')).toEqual([]);
    });
  });

  it('declares the same allow-list at error severity in both config blocks', () => {
    const config = JSON.parse(readFileSync(CONFIG, 'utf-8'));
    const blocks = [config.rules[RULE], config.overrides[0].rules[RULE]];
    for (const block of blocks) {
      expect(block[1]).toEqual({ severity: 'error' });
    }
    expect(blocks[1][0]).toEqual(blocks[0][0]);
    expect(blocks[0][0]['font-size']).toEqual(
      expect.arrayContaining(['/var[(]/', '/^[0-9.]+pt$/', '/^[0-9.]+em$/'])
    );
  });
});
