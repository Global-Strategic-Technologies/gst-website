/**
 * Unit tests for the IRL XLSX generator (BL-044 Phase 2).
 *
 * The generator is a pure function that converts an `IRLArticle` AST +
 * engagement metadata into an `.xlsx` workbook buffer. It runs in three
 * environments (Cloudflare Workers, browser, Node-vitest); tests cover
 * the user-observable workbook shape — sheets, key cells, conditional
 * formatting/data-validation OOXML, filename composition — rather than
 * the internal step-by-step XLSX construction.
 *
 * Behavior over implementation per TEST_BEST_PRACTICES § 1: tests load
 * the produced buffer with the same `fflate.unzipSync` + `xlsx-js-style`
 * tooling a real consumer would, and assert on the resulting cells,
 * sheet visibility, and OOXML XML fragments. Internal helpers
 * (`buildPrimarySheet`, `patchStatusValidationAndColoring` private
 * mechanics) are exercised only through the public surface.
 */

import { createHash } from 'node:crypto';

import * as XLSX from 'xlsx-js-style';
import { unzipSync, strFromU8 } from 'fflate';

import {
  buildIrlFilename,
  generateIrlXlsxBuffer,
  IRL_XLSX_MIME_TYPE,
  type IRLXlsxMetadata,
  type IRLTransactionContext,
} from '../../src/utils/irl/generate-xlsx';
import type { IRLArticle } from '../../src/utils/irl/types';

const FIXED_DATE = new Date('2026-05-27T12:00:00.000Z');

const FIXTURE_ARTICLE: IRLArticle = {
  title: 'Information Request List',
  intro: 'Intro paragraph describing the IRL.',
  sections: [
    {
      number: '00',
      title: 'Basics',
      bullets: [{ text: 'Company entity name and structure.' }, { text: 'Founding year.' }],
    },
    {
      number: '01',
      title: 'Product',
      intro: 'Per-section context for product diligence.',
      bullets: [{ text: 'Primary product surface.' }],
    },
    {
      number: '09',
      title: 'Governance',
      bullets: [
        { text: 'Board composition.' },
        { text: 'Officer roster.' },
        { text: 'Cap table.' },
      ],
    },
  ],
};

const FIXTURE_METADATA: IRLXlsxMetadata = {
  targetName: 'Acme Corp',
  transactionContext: 'buy-side',
  generatedAt: FIXED_DATE,
  canonicalUrl: 'https://globalstrategic.tech/hub/library/information-request-list',
};

// ─── buildIrlFilename ────────────────────────────────────────────────────────

describe('buildIrlFilename', () => {
  it('emits GST-IRL-<slug>-<date>.xlsx when target is provided', () => {
    expect(buildIrlFilename('Acme Corp', FIXED_DATE)).toBe('GST-IRL-Acme-Corp-2026-05-27.xlsx');
  });

  it('emits GST-IRL-<date>.xlsx when target is undefined', () => {
    expect(buildIrlFilename(undefined, FIXED_DATE)).toBe('GST-IRL-2026-05-27.xlsx');
  });

  it('strips diacritics from the target slug (NFKD normalization)', () => {
    // Naïve Café → Naive-Cafe via NFKD + combining-mark strip
    expect(buildIrlFilename('Naïve Café', FIXED_DATE)).toBe('GST-IRL-Naive-Cafe-2026-05-27.xlsx');
  });

  it('collapses non-alphanumeric runs into single hyphens', () => {
    expect(buildIrlFilename('A&B / C  D', FIXED_DATE)).toBe('GST-IRL-A-B-C-D-2026-05-27.xlsx');
  });

  it('trims leading and trailing hyphens from the slug', () => {
    expect(buildIrlFilename('  -- Acme -- ', FIXED_DATE)).toBe('GST-IRL-Acme-2026-05-27.xlsx');
  });

  it('falls back to the no-target form when the slug collapses to empty (pure-emoji input)', () => {
    // Pure emoji slugifies to '' → drop the slug segment entirely so the
    // filename stays valid for downstream save dialogs.
    expect(buildIrlFilename('🚀🔥', FIXED_DATE)).toBe('GST-IRL-2026-05-27.xlsx');
  });

  it('falls back to the no-target form for an all-whitespace target', () => {
    expect(buildIrlFilename('   ', FIXED_DATE)).toBe('GST-IRL-2026-05-27.xlsx');
  });

  it('uses ISO-8601 date slug (YYYY-MM-DD) in UTC', () => {
    // Cross-midnight UTC vs local: ensure the date is UTC-derived.
    const dec31Late = new Date('2026-12-31T23:30:00.000Z');
    expect(buildIrlFilename('X', dec31Late)).toBe('GST-IRL-X-2026-12-31.xlsx');
  });
});

// ─── IRL_XLSX_MIME_TYPE ──────────────────────────────────────────────────────

describe('IRL_XLSX_MIME_TYPE', () => {
  it('is the canonical Excel-2007+ MIME type', () => {
    // Hardcoded to lock the constant — every browser-side download surface
    // expects exactly this type for SheetJS XLSX, so a typo here would
    // produce a "save as binary" dialog instead of "open in Excel."
    expect(IRL_XLSX_MIME_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  });
});

// ─── generateIrlXlsxBuffer — workbook shape ─────────────────────────────────

describe('generateIrlXlsxBuffer — workbook shape', () => {
  it('returns a Uint8Array', () => {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, FIXTURE_METADATA);
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('produces a buffer that round-trips through xlsx-js-style read()', () => {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, FIXTURE_METADATA);
    // SheetJS validates the workbook structure on read — if the OOXML is
    // malformed the read throws. Behavioral assertion: a recipient can
    // open the file in any spreadsheet tool that uses SheetJS internally.
    const wb = XLSX.read(buf, { type: 'array' });
    expect(wb).toBeDefined();
    expect(wb.SheetNames).toEqual(['Information Request List', 'Instructions']);
  });

  it('marks the Instructions sheet as Hidden=1 and the IRL sheet as Hidden=0', () => {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, FIXTURE_METADATA);
    const wb = XLSX.read(buf, { type: 'array' });
    const workbookSheets = wb.Workbook?.Sheets;
    expect(workbookSheets).toBeDefined();
    const irlSheet = workbookSheets!.find((s) => s.name === 'Information Request List');
    const instructions = workbookSheets!.find((s) => s.name === 'Instructions');
    expect(irlSheet?.Hidden).toBe(0);
    expect(instructions?.Hidden).toBe(1);
  });
});

// ─── generateIrlXlsxBuffer — header + cell content ───────────────────────────

describe('generateIrlXlsxBuffer — header + cell content', () => {
  function loadPrimarySheet(meta: IRLXlsxMetadata = FIXTURE_METADATA): XLSX.WorkSheet {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, meta);
    const wb = XLSX.read(buf, { type: 'array' });
    return wb.Sheets['Information Request List'];
  }

  it('renders the article title in cell A1', () => {
    const sheet = loadPrimarySheet();
    expect(sheet.A1?.v).toBe('Information Request List');
  });

  it('composes the A1 title from company + project + article title when both are set', () => {
    const sheet = loadPrimarySheet({
      ...FIXTURE_METADATA,
      companyName: 'Praxis Capital',
      projectName: 'Project Titan',
    });
    expect(sheet.A1?.v).toBe('Praxis Capital Project Titan Information Request List');
  });

  it('composes the A1 title with company only', () => {
    const sheet = loadPrimarySheet({ ...FIXTURE_METADATA, companyName: 'Praxis Capital' });
    expect(sheet.A1?.v).toBe('Praxis Capital Information Request List');
  });

  it('composes the A1 title with project only', () => {
    const sheet = loadPrimarySheet({ ...FIXTURE_METADATA, projectName: 'Project Titan' });
    expect(sheet.A1?.v).toBe('Project Titan Information Request List');
  });

  it('trims company/project so untrimmed input does not double-space the title', () => {
    const sheet = loadPrimarySheet({
      ...FIXTURE_METADATA,
      companyName: '  Praxis Capital  ',
      projectName: ' Project Titan ',
    });
    expect(sheet.A1?.v).toBe('Praxis Capital Project Titan Information Request List');
  });

  it('emits the target name in the metadata header when provided', () => {
    const sheet = loadPrimarySheet();
    // Search for any cell whose value equals 'Acme Corp' — the metadata
    // header section has a Target label adjacent to the value cell.
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const hasTarget = cells.some(([, cell]) => (cell as XLSX.CellObject).v === 'Acme Corp');
    expect(hasTarget).toBe(true);
  });

  it('omits the target row when targetName is undefined', () => {
    const sheet = loadPrimarySheet({ ...FIXTURE_METADATA, targetName: undefined });
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const hasTargetLabel = cells.some(([, cell]) => (cell as XLSX.CellObject).v === 'Target');
    expect(hasTargetLabel).toBe(false);
  });

  it('emits the engagement-context label in human-readable form', () => {
    const cases: Array<[IRLTransactionContext, string]> = [
      ['sell-side', 'Sell-side'],
      ['buy-side', 'Buy-side'],
      ['value-creation', 'Value Creation'],
      ['unknown', 'Unspecified'],
    ];
    for (const [ctx, expectedLabel] of cases) {
      const sheet = loadPrimarySheet({ ...FIXTURE_METADATA, transactionContext: ctx });
      const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
      const hasLabel = cells.some(([, cell]) => (cell as XLSX.CellObject).v === expectedLabel);
      expect(hasLabel, `context=${ctx}`).toBe(true);
    }
  });

  it('omits the engagement-context row when transactionContext is undefined', () => {
    const sheet = loadPrimarySheet({ ...FIXTURE_METADATA, transactionContext: undefined });
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const hasContextLabel = cells.some(
      ([, cell]) => (cell as XLSX.CellObject).v === 'Engagement context'
    );
    expect(hasContextLabel).toBe(false);
  });

  it('emits the generated date in ISO-8601 YYYY-MM-DD form', () => {
    const sheet = loadPrimarySheet();
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const hasDate = cells.some(([, cell]) => (cell as XLSX.CellObject).v === '2026-05-27');
    expect(hasDate).toBe(true);
  });

  it('emits the canonical URL row only when showCanonicalReference is true', () => {
    const sheet = loadPrimarySheet({ ...FIXTURE_METADATA, showCanonicalReference: true });
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const hasUrl = cells.some(
      ([, cell]) => (cell as XLSX.CellObject).v === FIXTURE_METADATA.canonicalUrl
    );
    expect(hasUrl).toBe(true);
  });

  it('hides the canonical reference row by default (showCanonicalReference unset)', () => {
    // Default flip (per the configurable-generator work): the canonical row
    // is opt-in. FIXTURE_METADATA does not set the flag, so neither the label
    // nor the URL should appear.
    const sheet = loadPrimarySheet();
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const hasLabel = cells.some(
      ([, cell]) => (cell as XLSX.CellObject).v === 'Canonical reference'
    );
    const hasUrl = cells.some(
      ([, cell]) => (cell as XLSX.CellObject).v === FIXTURE_METADATA.canonicalUrl
    );
    expect(hasLabel).toBe(false);
    expect(hasUrl).toBe(false);
  });

  it('emits the article intro in the body', () => {
    const sheet = loadPrimarySheet();
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const hasIntro = cells.some(
      ([, cell]) => (cell as XLSX.CellObject).v === FIXTURE_ARTICLE.intro
    );
    expect(hasIntro).toBe(true);
  });

  it('emits section header rows in `NN — TITLE` uppercased form', () => {
    const sheet = loadPrimarySheet();
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const headerValues = cells.map(([, cell]) => (cell as XLSX.CellObject).v);
    expect(headerValues).toContain('00 — BASICS');
    expect(headerValues).toContain('01 — PRODUCT');
    expect(headerValues).toContain('09 — GOVERNANCE');
  });

  it('emits the optional per-section intro when present', () => {
    const sheet = loadPrimarySheet();
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const hasSectionIntro = cells.some(
      ([, cell]) => (cell as XLSX.CellObject).v === 'Per-section context for product diligence.'
    );
    expect(hasSectionIntro).toBe(true);
  });

  it('emits every bullet from every section', () => {
    const sheet = loadPrimarySheet();
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const values = new Set(cells.map(([, cell]) => (cell as XLSX.CellObject).v));
    expect(values.has('Company entity name and structure.')).toBe(true);
    expect(values.has('Founding year.')).toBe(true);
    expect(values.has('Primary product surface.')).toBe(true);
    expect(values.has('Board composition.')).toBe(true);
    expect(values.has('Officer roster.')).toBe(true);
    expect(values.has('Cap table.')).toBe(true);
  });

  it("pre-fills Status column with 'OPEN' on every bullet row", () => {
    const sheet = loadPrimarySheet();
    // Total bullets in FIXTURE_ARTICLE: 2 + 1 + 3 = 6.
    const openCells = Object.entries(sheet).filter(
      ([k, cell]) => /^C\d+$/.test(k) && (cell as XLSX.CellObject).v === 'OPEN'
    );
    expect(openCells).toHaveLength(6);
  });

  it('emits Reference IDs in `{section-digit}-{bullet-index}` form', () => {
    const sheet = loadPrimarySheet();
    const cells = Object.entries(sheet).filter(([k]) => /^A\d+$/.test(k));
    const values = cells.map(([, cell]) => (cell as XLSX.CellObject).v).filter(Boolean);
    // Section 00 → digit 0, sections 01 / 09 → digits 1 / 9. Bullet
    // indices are 1-based + zero-padded to two digits. (FIXTURE_ARTICLE has
    // no ordinals — this also pins the dense-counter fallback.)
    expect(values).toContain('0-01');
    expect(values).toContain('0-02');
    expect(values).toContain('1-01');
    expect(values).toContain('9-01');
    expect(values).toContain('9-02');
    expect(values).toContain('9-03');
  });

  it('renders bullet ordinals (not live positions) so removals leave Reference-ID gaps', () => {
    const gapped: IRLArticle = {
      title: 'Information Request List',
      intro: 'Intro.',
      sections: [
        {
          number: '00',
          title: 'Basics',
          canonicalBulletCount: 5,
          bullets: [
            { text: 'First', ordinal: 1 },
            { text: 'Second', ordinal: 2 },
            { text: 'Fourth', ordinal: 4 },
            { text: 'Fifth', ordinal: 5 },
          ],
        },
      ],
    };
    const buf = generateIrlXlsxBuffer(gapped, FIXTURE_METADATA);
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];
    const cells = Object.entries(sheet).filter(([k]) => /^A\d+$/.test(k));
    const values = cells.map(([, cell]) => (cell as XLSX.CellObject).v).filter(Boolean);
    expect(values).toContain('0-01');
    expect(values).toContain('0-02');
    expect(values).toContain('0-04');
    expect(values).toContain('0-05');
    expect(values).not.toContain('0-03'); // the gap signals deliberate omission
  });
});

// ─── BL-140 — byte-identity golden for the frozen generation path ────────────
//
// BL-140 adds an additive optional prefill parameter to generateIrlXlsxBuffer
// (a new tool populates D/E at build time). The operator ruling freezes the
// existing path: the no-prefill output must stay byte-identical. This golden
// was captured from the PRE-CHANGE builder (commit 1 of the BL-140 branch,
// before the parameter existed) so the identity is machine-checked inside the
// PR's own history.
//
// The golden is ENTRY-level — sha256 over the unzipped entries (sorted names +
// content bytes) — not a whole-buffer hash, deliberately: fflate's zipSync
// stamps the current wall-clock into every zip entry's DOS mtime using
// LOCAL-time getters, so whole-buffer bytes vary with both clock and timezone
// (CI is UTC; dev machines are not). No entry CONTENT depends on the clock —
// xlsx-js-style writes docProps/core.xml without dcterms timestamps, and the
// only date in the workbook comes from metadata.generatedAt, fixed here via
// FIXED_DATE. "Byte-identical output" for the BL-140 AC means exactly this:
// every byte the builder writes, minus the container's wall-clock mtime stamp.
describe('BL-140 — frozen-path byte-identity golden', () => {
  /** sha256 over the workbook's unzipped entries: sorted names + content bytes. */
  function entryLevelSha256(buf: Uint8Array): string {
    const entries = unzipSync(buf);
    const hash = createHash('sha256');
    for (const name of Object.keys(entries).sort()) {
      hash.update(name);
      hash.update(Uint8Array.of(0));
      hash.update(entries[name]);
      hash.update(Uint8Array.of(0));
    }
    return hash.digest('hex');
  }

  // Captured 2026-08-23 from the pre-change builder with FIXTURE_ARTICLE +
  // FIXTURE_METADATA (FIXED_DATE). If this test fails after a builder change,
  // the frozen generation path's output moved — that is a BL-140 freeze
  // violation unless the change is a deliberate, reviewed regeneration.
  const FROZEN_PATH_GOLDEN = '4f22683207993a02eda724195f4bbd553311b668661b228e21cf6b3c690f924a';

  it('reproduces the pre-change entry-level golden for the no-prefill call', () => {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, FIXTURE_METADATA);
    expect(entryLevelSha256(buf)).toBe(FROZEN_PATH_GOLDEN);
  });
});

// ─── generateIrlXlsxBuffer — OOXML post-patch (DV + CF) ──────────────────────

describe('generateIrlXlsxBuffer — OOXML post-patch (data validation + conditional formatting)', () => {
  function unzipBuffer(buf: Uint8Array): Record<string, string> {
    const entries = unzipSync(buf);
    const out: Record<string, string> = {};
    for (const [name, bytes] of Object.entries(entries)) {
      out[name] = strFromU8(bytes);
    }
    return out;
  }

  it('splices a <dataValidations> block with the OPEN/PARTIAL/CLOSED formula1 into sheet1.xml', () => {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, FIXTURE_METADATA);
    const sheet1 = unzipBuffer(buf)['xl/worksheets/sheet1.xml'];
    expect(sheet1).toBeDefined();
    expect(sheet1).toContain('<dataValidations');
    expect(sheet1).toContain('<formula1>"OPEN,PARTIAL,CLOSED"</formula1>');
    // errorStyle="stop" hard-rejects pasted/typed values outside the list.
    expect(sheet1).toContain('errorStyle="stop"');
  });

  it('splices a <conditionalFormatting> block referencing PARTIAL and CLOSED', () => {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, FIXTURE_METADATA);
    const sheet1 = unzipBuffer(buf)['xl/worksheets/sheet1.xml'];
    expect(sheet1).toContain('<conditionalFormatting');
    expect(sheet1).toContain('"PARTIAL"');
    expect(sheet1).toContain('"CLOSED"');
    // OPEN is the default white fill from STATUS_STYLE — no CF rule for it.
    expect(sheet1).not.toContain('<formula>"OPEN"</formula>');
  });

  it('places <conditionalFormatting> BEFORE <dataValidations> per OOXML CT_Worksheet sibling order', () => {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, FIXTURE_METADATA);
    const sheet1 = unzipBuffer(buf)['xl/worksheets/sheet1.xml'];
    const cfIdx = sheet1.indexOf('<conditionalFormatting');
    const dvIdx = sheet1.indexOf('<dataValidations');
    expect(cfIdx).toBeGreaterThanOrEqual(0);
    expect(dvIdx).toBeGreaterThan(cfIdx);
  });

  it('populates the styles.xml <dxfs> block with the cream + light-green ARGB fills', () => {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, FIXTURE_METADATA);
    const styles = unzipBuffer(buf)['xl/styles.xml'];
    expect(styles).toBeDefined();
    expect(styles).toContain('<dxfs count="2">');
    // Eight-hex form (alpha-prefixed) is required by Excel for opaque
    // solid fills; six-hex renders transparent in some Excel versions.
    expect(styles).toContain('FFFFF8DC'); // PARTIAL → cream
    expect(styles).toContain('FFC6EFCE'); // CLOSED  → light green
  });

  it('does not splice DV/CF when the article has no bullets in any section (no Status cells)', () => {
    // Edge case: an article with empty-bullets sections would normally be
    // rejected by the parser, but the generator is called with arbitrary
    // ASTs. Guarantee no malformed sheet when there's nothing to validate.
    const empty: IRLArticle = {
      title: 'Empty',
      intro: 'No actionable bullets.',
      sections: [{ number: '00', title: 'Stub', bullets: [] }],
    };
    const buf = generateIrlXlsxBuffer(empty, FIXTURE_METADATA);
    const sheet1 = unzipBuffer(buf)['xl/worksheets/sheet1.xml'];
    expect(sheet1).not.toContain('<dataValidations');
    expect(sheet1).not.toContain('<conditionalFormatting');
  });
});

// ─── generateIrlXlsxBuffer — Instructions sheet content ─────────────────────

describe('generateIrlXlsxBuffer — Instructions sheet', () => {
  it('emits the engagement-lead handback line when targetName is provided', () => {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, FIXTURE_METADATA);
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Instructions'];
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const hasEngagementLead = cells.some(
      ([, cell]) =>
        typeof (cell as XLSX.CellObject).v === 'string' &&
        ((cell as XLSX.CellObject).v as string).includes('engagement lead')
    );
    expect(hasEngagementLead).toBe(true);
  });

  it('emits the generic point-of-contact handback line when targetName is undefined', () => {
    const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, {
      ...FIXTURE_METADATA,
      targetName: undefined,
    });
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['Instructions'];
    const cells = Object.entries(sheet).filter(([k]) => /^[A-Z]+\d+$/.test(k));
    const hasPointOfContact = cells.some(
      ([, cell]) =>
        typeof (cell as XLSX.CellObject).v === 'string' &&
        ((cell as XLSX.CellObject).v as string).includes('point of contact')
    );
    expect(hasPointOfContact).toBe(true);
  });

  // ─── BL-120 — the Instructions sheet must describe what is actually read ──
  //
  // The extractor now reads File Location, Comments and Notes into the
  // deliverable. Recipients were previously told Comments was for "caveats,
  // follow-ups" and Notes was "free-form scratch space" — publishing either
  // without saying so is a change they are entitled to see. And because item 4
  // invited NON-answers into Comments ("scheduled for Q3 refresh",
  // "confidential, discuss in call"), leaving it there would land those
  // strings unlabelled in the answer slot, count them as substantive, and open
  // the inclusion gates on them.
  describe('BL-120 — column guidance matches what the extractor reads', () => {
    /** Whole Instructions sheet as one searchable string. */
    function instructionsText(): string {
      const buf = generateIrlXlsxBuffer(FIXTURE_ARTICLE, FIXTURE_METADATA);
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets['Instructions'];
      return Object.entries(sheet)
        .filter(([k]) => /^[A-Z]+\d+$/.test(k))
        .map(([, cell]) => (cell as XLSX.CellObject).v)
        .filter((v): v is string => typeof v === 'string')
        .join('\n');
    }

    it('tells the recipient that D, E, F and G are all read into the deliverable', () => {
      const text = instructionsText();
      expect(text).toContain('All four of D, E, F and G are read into the deliverable');
      expect(text).toContain('Response and Comments are combined into the');
    });

    it('no longer calls Notes "scratch space"', () => {
      expect(instructionsText()).not.toContain('scratch space');
    });

    it('describes Comments as part of the answer, not as remarks about it', () => {
      const text = instructionsText();
      expect(text).toContain('Read as part of your answer');
      expect(text).toContain('answers there — not remarks about the answer');
    });

    it('routes the non-answer examples to Notes, not Comments', () => {
      const text = instructionsText();
      const lines = text.split('\n');
      const exampleIdx = lines.findIndex((l) => l.includes('confidential, discuss in call'));
      expect(exampleIdx).toBeGreaterThan(-1);
      // The example sits under the Notes instruction, one line above it.
      expect(lines[exampleIdx - 1]).toContain(
        'column F (Notes) for anything that is NOT an answer'
      );
    });

    it('keeps the "n/a rather than blank" instruction (the substantive-cell rule depends on it)', () => {
      expect(instructionsText()).toContain('"n/a" or "not yet tracked"');
    });
  });
});
