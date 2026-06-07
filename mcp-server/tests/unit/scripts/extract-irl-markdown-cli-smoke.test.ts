/**
 * Real-Node CLI smoke test for `extract-irl-markdown.mjs`.
 *
 * Pre-existing round-trip tests in `extract-irl-markdown.test.ts` import the
 * library function directly under vitest. That harness uses Vite's module
 * resolver, which normalizes CommonJS interop differently than raw Node 22's
 * ESM resolver. A subtle bug surfaced in production (2026-06-07):
 *
 *   import * as XLSX from 'xlsx-js-style';
 *   // ...
 *   XLSX.read(buf)  // ← undefined under raw Node, works under vitest
 *
 * The library-level tests passed; the actual CLI invocation (`npm run
 * irl:extract`) blew up with `XLSX.read is not a function`. This test
 * closes that gap: it spawns the SAME node executable that operators run,
 * against the SAME .mjs script file, against a real .xlsx buffer, and
 * asserts the canonical markdown shape comes out. Catches any future
 * CJS/ESM interop drift OR any node-builtin path that Vite's resolver
 * silently shims.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateIrlXlsxBuffer } from '../../../../src/utils/irl/generate-xlsx';
import type { IRLArticle } from '../../../../src/utils/irl/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '../../../scripts/extract-irl-markdown.mjs');

const SAMPLE_ARTICLE: IRLArticle = {
  title: 'Information Request List',
  intro: 'Below is information useful to size and execute a client engagement.',
  sections: [
    {
      number: '00',
      title: 'Basics',
      bullets: [{ text: 'Company name' }, { text: 'Annual recurring revenue' }],
    },
  ],
  footer: '_Last updated: 2026-06-07._',
};

let tempDir: string;
let xlsxPath: string;

beforeAll(() => {
  // Generate a real workbook buffer, write to a temp .xlsx file the CLI
  // can open. Using the actual generator keeps the test honest — if a future
  // generator change breaks the workbook shape, this smoke test catches it.
  tempDir = mkdtempSync(join(tmpdir(), 'extract-irl-cli-smoke-'));
  xlsxPath = join(tempDir, 'sample.xlsx');
  const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
    targetName: 'CLI Smoke Co',
    transactionContext: 'value-creation',
    generatedAt: new Date('2026-06-07T12:00:00.000Z'),
    canonicalUrl: 'https://example.test/canonical',
  });
  writeFileSync(xlsxPath, Buffer.from(buf));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('extract-irl-markdown.mjs — real-Node CLI smoke', () => {
  it('runs end-to-end via raw node, emits canonical markdown to stdout', () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, xlsxPath], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (result.status !== 0) {
      // Echo stdout AND stderr so the assertion message reveals the actual
      // failure (CJS/ESM interop bugs surface with `XLSX.read is not a
      // function` in stderr; library-level tests can't see this).
      throw new Error(
        `CLI exited with status ${result.status}\n` +
          `stdout:\n${result.stdout}\n` +
          `stderr:\n${result.stderr}`
      );
    }
    expect(result.stdout).toContain('# Information Request List — CLI Smoke Co (filled)');
    expect(result.stdout).toContain('- 0-01 Company name');
    expect(result.stdout).toContain('- 0-02 Annual recurring revenue');
    // stderr should carry the summary line.
    expect(result.stderr).toMatch(/Extracted \d+ bullets/);
  });

  it('writes to --out path when supplied', () => {
    const outPath = join(tempDir, 'out.md');
    const result = spawnSync(process.execPath, [SCRIPT_PATH, xlsxPath, '--out', outPath], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.status).toBe(0);
    const written = readFileSync(outPath, 'utf8');
    expect(written).toContain('# Information Request List — CLI Smoke Co (filled)');
  });

  it('exits non-zero with usage on --help', () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, '--help'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('extract-irl-markdown');
    expect(result.stderr).toContain('--out');
  });

  it('exits non-zero with a usage-style stderr when no path is supplied', () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Usage:');
  });
});
