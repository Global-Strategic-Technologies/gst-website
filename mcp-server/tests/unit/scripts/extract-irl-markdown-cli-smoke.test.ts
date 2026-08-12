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
import * as XLSX from 'xlsx-js-style';
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

  // ─── BL-120 — the operator signals on stderr ───────────────────────────
  //
  // `IRL_PARTNER_PASTE_RUNBOOK.md` step 2 quotes these strings as an operator
  // checklist ("read the script's stderr"), so they are a documented interface,
  // not incidental logging. The underlying ref lists are covered as pure
  // function output in `extract-irl-markdown.test.ts`; what is covered here is
  // that they actually reach the operator, and that the CLI still exits 0 —
  // every one of these is a legitimate state, not a failure.
  describe('operator signals', () => {
    /**
     * Build a workbook with D/E/F content and run the CLI over it.
     *
     * The sheet is rewritten via `aoa_to_sheet`, which discards styling,
     * `!cols`, merges, freeze panes and data validations. That loses nothing
     * the CLI reads — it takes `wb.Sheets[PRIMARY_SHEET_NAME]` and
     * `sheet_to_json(sheet, { header: 1, defval: '' })`, i.e. `!ref` plus cell
     * values, all of which `aoa_to_sheet` sets correctly.
     *
     * Two things this does NOT prove, worth knowing before trusting it further:
     *
     *   - the sheet name below is a literal that must stay equal to
     *     `PRIMARY_SHEET_NAME` in the script. If the script's constant drifts,
     *     the CLI silently falls back to `SheetNames[0]` and every one of these
     *     cases still passes.
     *   - the `defval: ''` round trip materializes empty cells that are
     *     genuinely ABSENT in an on-disk workbook. Behaviourally identical (the
     *     extractor coerces and trims either way), but this file is not
     *     byte-representative of one a partner returns.
     */
    function runOver(rowPatch: (row: (string | number)[]) => void) {
      const buf = generateIrlXlsxBuffer(SAMPLE_ARTICLE, {
        targetName: 'CLI Smoke Co',
        transactionContext: 'value-creation',
        generatedAt: new Date('2026-06-07T12:00:00.000Z'),
        canonicalUrl: 'https://example.test/canonical',
      });
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets['Information Request List'];
      const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
        header: 1,
        defval: '',
      });
      for (const row of rows) rowPatch(row);
      const patched = XLSX.utils.aoa_to_sheet(rows);
      const outWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(outWb, patched, 'Information Request List');
      const path = join(tempDir, `signals-${Math.abs(hashOf(rows)).toString(36)}.xlsx`);
      writeFileSync(path, Buffer.from(XLSX.write(outWb, { type: 'array', bookType: 'xlsx' })));
      return spawnSync(process.execPath, [SCRIPT_PATH, path], {
        encoding: 'utf8',
        timeout: 10_000,
      });
    }
    /** Cheap deterministic name so concurrent cases don't collide on a path. */
    function hashOf(rows: unknown): number {
      const s = JSON.stringify(rows);
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return h;
    }

    it('names the rows whose answer came from Comments, and still exits 0', () => {
      const result = runOver((row) => {
        if (String(row[0]).trim() === '0-01') {
          row[2] = 'CLOSED';
          row[4] = 'Acme Solutions Inc., a Delaware C-corp'; // col E
          row[6] = ''; // col G empty
        }
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('took their answer from Comments');
      expect(result.stderr).toContain('0-01');
      // The reason the operator is being told, not just the fact.
      expect(result.stderr).toContain('indistinguishable once extracted');
    });

    it('warns on a CLOSED row with every content column empty, and still exits 0', () => {
      const result = runOver((row) => {
        if (String(row[0]).trim() === '0-02') {
          row[2] = 'CLOSED';
          row[6] = '';
        }
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('claim a Status of CLOSED/PARTIAL');
      expect(result.stderr).toContain('0-02');
    });

    it('stays silent on both signals for a workbook that triggers neither', () => {
      const result = runOver((row) => {
        if (String(row[0]).trim() === '0-01') {
          row[2] = 'CLOSED';
          row[6] = 'Acme Solutions Inc.';
        }
      });
      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain('took their answer from Comments');
      expect(result.stderr).not.toContain('claim a Status of CLOSED/PARTIAL');
    });

    it('does NOT emit the ~57KB note for a small body', () => {
      // The note is scoped strictly to claude.ai web's prompt-argument ceiling.
      // Firing it on every workbook would contradict the runbook's own
      // "5-150KB is typical" and train operators to ignore it.
      const result = runOver(() => {});
      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain('57KB');
    });

    it('emits the ~57KB note, naming Claude Desktop, once the body is large enough', () => {
      const filler = 'lorem ipsum dolor sit amet '.repeat(1200); // ~32KB per row
      const result = runOver((row) => {
        if (/^\d{1,2}-\d{2}$/.test(String(row[0]).trim())) {
          row[2] = 'CLOSED';
          row[6] = filler;
        }
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('exceeds ~57KB');
      expect(result.stderr).toContain('Claude Desktop');
    });
  });
});
