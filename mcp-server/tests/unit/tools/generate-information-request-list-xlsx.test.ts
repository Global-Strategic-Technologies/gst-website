/**
 * Unit tests for the `generate_information_request_list_xlsx` MCP tool.
 *
 * Exercises the full handler pipeline (IRL source load → parse → generate
 * → base64) without going through the MCP transport. The integration
 * test in `tests/integration/prompts-registry.test.ts` confirms the
 * tool's name appears in the prompt's `orchestrates` list.
 */

import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import {
  handleGenerateIrlXlsxTool,
  GenerateIrlXlsxInputSchema,
} from '../../../src/tools/generate-information-request-list-xlsx';
import { IRL_XLSX_MIME_TYPE } from '../../../../src/utils/irl/generate-xlsx';
import * as irlSourceLoader from '../../../src/content/irl-source-loader';

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

describe('generate_information_request_list_xlsx — schema', () => {
  it('accepts an empty input', () => {
    expect(GenerateIrlXlsxInputSchema.safeParse({}).success).toBe(true);
  });

  it('accepts targetName + transactionContext + productSummary', () => {
    const r = GenerateIrlXlsxInputSchema.safeParse({
      targetName: 'MedSig Health',
      transactionContext: 'buy-side',
      productSummary: 'A B2B SaaS platform for medical signal analytics.',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown transactionContext value', () => {
    const r = GenerateIrlXlsxInputSchema.safeParse({ transactionContext: 'weird-thing' });
    expect(r.success).toBe(false);
  });

  it('rejects a productSummary below the min length', () => {
    const r = GenerateIrlXlsxInputSchema.safeParse({ productSummary: 'too short' });
    expect(r.success).toBe(false);
  });

  it('rejects a productSummary above the max length', () => {
    const r = GenerateIrlXlsxInputSchema.safeParse({ productSummary: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('accepts companyName, projectName, includeSections, customRequests, showCanonicalReference', () => {
    const r = GenerateIrlXlsxInputSchema.safeParse({
      companyName: 'Praxis Capital',
      projectName: 'Project Titan',
      includeSections: ['00', '03'],
      customRequests: [{ section: '00', text: 'A bespoke ask.' }],
      showCanonicalReference: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty includeSections array (min 1)', () => {
    const r = GenerateIrlXlsxInputSchema.safeParse({ includeSections: [] });
    expect(r.success).toBe(false);
  });

  it('rejects a non-two-digit section number in includeSections', () => {
    const r = GenerateIrlXlsxInputSchema.safeParse({ includeSections: ['0', 'basics'] });
    expect(r.success).toBe(false);
  });

  it('rejects a customRequests entry with an empty text', () => {
    const r = GenerateIrlXlsxInputSchema.safeParse({
      customRequests: [{ section: '00', text: '' }],
    });
    expect(r.success).toBe(false);
  });

  it('documents the full section catalog in the includeSections describe (not just the endpoints)', () => {
    // Discoverability guard: a model calling this tool cold must be able to see
    // which section numbers exist and what each covers, straight from the
    // schema — so a mid-list title must appear in the arg description.
    const description = GenerateIrlXlsxInputSchema.shape.includeSections.description ?? '';
    expect(description).toContain('02 Software Architecture');
    expect(description).toContain('09 Governance & Compliance');
  });
});

describe('generate_information_request_list_xlsx — handler', () => {
  it('returns a single text content block summarizing what was generated', async () => {
    // 2026-05-25 update: a resource content block carrying the .xlsx as a
    // blob was REMOVED because Claude Desktop's tool-result renderer routes
    // by mimeType prefix (image/* only) and surfaces a red "unsupported
    // format" error for arbitrary binary mimeTypes. Until BL-046 ships a
    // proper file-delivery surface, the tool returns text + structuredContent
    // only; the canonical download path is the Hub page.
    //
    // BL-108: `content` is now two text blocks — caption + serialized payload —
    // and this tool is the sole `textOmit` site, so block 1 carries the marker in
    // place of the base64 rather than ~17 KB (≈4,500-6,000 tokens) of blob the
    // model cannot use.
    const result = await handleGenerateIrlXlsxTool({});
    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    expect((result.content[0] as { text: string }).text).toMatch(/Generated.*workbook/i);

    const mirrored = JSON.parse((result.content[1] as { text: string }).text) as Record<
      string,
      unknown
    >;
    expect(mirrored.base64).toMatch(
      /^\[omitted from text channel: \d+ B; read structuredContent\./
    );
    expect(mirrored.filename).toBe((result.structuredContent as { filename: string }).filename);
    // The real blob still reaches programmatic consumers.
    expect(typeof (result.structuredContent as { base64: unknown }).base64).toBe('string');
  });

  it('text summary directs the recipient to the Hub page download surface', async () => {
    // Regression guard: the model needs to be told explicitly where the
    // file is actually retrievable. Without this directive in the summary,
    // the model writes "here's the file" with no clickable target and the
    // user has nowhere to click.
    const result = await handleGenerateIrlXlsxTool({ targetName: 'Acme' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/hub\/tools\/information-request-list-generator/);
  });

  it('Hub deeplink encodes args as query params (target + context) so the form pre-fills on landing', async () => {
    // Without arg-passing the deeplink is no better than a bookmark —
    // user would re-type everything on the Hub page. This test locks the
    // MCP value-add: the args that flowed through Claude Desktop land
    // on the Hub form via query params and produce a one-click download
    // with no re-entry.
    const result = await handleGenerateIrlXlsxTool({
      targetName: 'MedSig Health',
      transactionContext: 'buy-side',
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/[?&]target=MedSig\+Health(&|\s|$)/);
    expect(text).toMatch(/[?&]context=buy-side(&|\s|$)/);
  });

  it('Hub deeplink omits query params when no args are supplied (universal landing)', async () => {
    // Bare invocation should land the user on the un-personalized Hub
    // page; encoding empty params would look like a broken URL.
    const result = await handleGenerateIrlXlsxTool({});
    const text = (result.content[0] as { text: string }).text;
    // Match the Hub URL but capture whether it has a ? after the path.
    const match = text.match(
      /https?:\/\/[^\s]*\/hub\/tools\/information-request-list-generator\/(\?[^\s]*)?/
    );
    expect(match).toBeTruthy();
    if (match) {
      // No query string OR an empty one — but no target/context params.
      const query = match[1] ?? '';
      expect(query).not.toMatch(/target=/);
      expect(query).not.toMatch(/context=/);
    }
  });

  it('structuredContent has filename, base64, mimeType, and counts', async () => {
    const result = await handleGenerateIrlXlsxTool({});
    const payload = result.structuredContent;
    expect(payload).toMatchObject({
      mimeType: IRL_XLSX_MIME_TYPE,
    });
    expect(typeof payload.filename).toBe('string');
    expect(typeof payload.base64).toBe('string');
    expect(typeof payload.byteLength).toBe('number');
    expect(payload.byteLength).toBeGreaterThan(500);
    expect(typeof payload.sectionCount).toBe('number');
    expect(typeof payload.bulletCount).toBe('number');
    expect(typeof payload.canonicalUrl).toBe('string');
  });

  it('filename slugifies targetName when supplied', async () => {
    const result = await handleGenerateIrlXlsxTool({ targetName: 'MedSig Health' });
    const payload = result.structuredContent as { filename: string };
    expect(payload.filename).toMatch(/^GST-IRL-MedSig-Health-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('filename omits target slug when no targetName supplied', async () => {
    const result = await handleGenerateIrlXlsxTool({});
    const payload = result.structuredContent as { filename: string };
    expect(payload.filename).toMatch(/^GST-IRL-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('base64 decodes to a workbook readable by SheetJS (round-trip integrity)', async () => {
    const result = await handleGenerateIrlXlsxTool({
      targetName: 'Acme',
      transactionContext: 'sell-side',
    });
    const { base64 } = result.structuredContent as { base64: string };
    const buf = decodeBase64(base64);
    const wb = XLSX.read(buf, { type: 'array' });
    expect(wb.SheetNames).toContain('Information Request List');
    expect(wb.SheetNames).toContain('Instructions');
  });

  it('reads the canonical IRL article — sectionCount + bulletCount match the parser regression test', async () => {
    const result = await handleGenerateIrlXlsxTool({});
    const payload = result.structuredContent as { sectionCount: number; bulletCount: number };
    // These MUST stay in lockstep with parse-irl-article.test.ts's
    // EXPECTED_SECTIONS. Hard-lock the count (not >60) so the asymmetry
    // between the two assertions can't hide a drift on one side. Article
    // edits that change bullet counts intentionally need to update BOTH.
    expect(payload.sectionCount).toBe(10);
    expect(payload.bulletCount).toBe(67);
  });

  it('targetName is embedded in the workbook header cell, not just the filename', async () => {
    const result = await handleGenerateIrlXlsxTool({ targetName: 'Acme Corporation' });
    const { base64 } = result.structuredContent as { base64: string };
    const wb = XLSX.read(decodeBase64(base64), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Information Request List'], {
      header: 1,
      defval: '',
    });
    const flat = rows.flat().join('\n');
    expect(flat).toContain('Acme Corporation');
  });

  it('canonical URL in structuredContent matches the live Hub library URL', async () => {
    const result = await handleGenerateIrlXlsxTool({});
    const payload = result.structuredContent as { canonicalUrl: string };
    expect(payload.canonicalUrl).toMatch(/\/hub\/library\/information-request-list\/?$/);
  });

  it('includeSections filters the workbook — sectionCount and summary count reflect the subset', async () => {
    const result = await handleGenerateIrlXlsxTool({ includeSections: ['00', '01'] });
    const payload = result.structuredContent as { sectionCount: number };
    expect(payload.sectionCount).toBe(2);
    const text = (result.content[0] as { text: string }).text;
    // Human-readable summary count must match the structured count.
    expect(text).toMatch(/\b2 sections\b/);
  });

  it('customRequests lift the bulletCount above the canonical total', async () => {
    const base = await handleGenerateIrlXlsxTool({});
    const withCustom = await handleGenerateIrlXlsxTool({
      customRequests: [
        { section: '00', text: 'Bespoke ask one.' },
        { section: '00', text: 'Bespoke ask two.' },
      ],
    });
    const baseCount = (base.structuredContent as { bulletCount: number }).bulletCount;
    const customCount = (withCustom.structuredContent as { bulletCount: number }).bulletCount;
    expect(customCount).toBe(baseCount + 2);
  });

  it('composes company + project into the workbook title cell', async () => {
    const result = await handleGenerateIrlXlsxTool({
      companyName: 'Praxis Capital',
      projectName: 'Project Titan',
    });
    const { base64 } = result.structuredContent as { base64: string };
    const wb = XLSX.read(decodeBase64(base64), { type: 'array' });
    const a1 = wb.Sheets['Information Request List'].A1 as { v: string } | undefined;
    expect(a1?.v).toBe('Praxis Capital Project Titan Information Request List');
  });

  it('hides the canonical reference row by default; shows it when requested', async () => {
    const flatten = (base64: string): string => {
      const wb = XLSX.read(decodeBase64(base64), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Information Request List'], {
        header: 1,
        defval: '',
      });
      return rows.flat().join('\n');
    };
    const hidden = await handleGenerateIrlXlsxTool({});
    expect(flatten((hidden.structuredContent as { base64: string }).base64)).not.toContain(
      'Canonical reference'
    );
    const shown = await handleGenerateIrlXlsxTool({ showCanonicalReference: true });
    expect(flatten((shown.structuredContent as { base64: string }).base64)).toContain(
      'Canonical reference'
    );
  });

  it('deeplink encodes company/project/sections/canonical/custom query params', async () => {
    const result = await handleGenerateIrlXlsxTool({
      companyName: 'Praxis Capital',
      projectName: 'Project Titan',
      includeSections: ['00', '01'],
      showCanonicalReference: true,
      customRequests: [{ section: '00', text: 'Ask' }],
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/[?&]company=Praxis\+Capital(&|\s|$)/);
    expect(text).toMatch(/[?&]project=Project\+Titan(&|\s|$)/);
    // URLSearchParams percent-encodes the comma → %2C (not a literal comma).
    expect(text).toMatch(/[?&]sections=00%2C01(&|\s|$)/);
    expect(text).toMatch(/[?&]canonical=1(&|\s|$)/);
    expect(text).toMatch(/[?&]custom=/);
  });

  it('throws a descriptive error when includeSections matches no real section', async () => {
    await expect(handleGenerateIrlXlsxTool({ includeSections: ['77'] })).rejects.toThrow(
      /No sections matched/
    );
    await expect(handleGenerateIrlXlsxTool({ includeSections: ['77'] })).rejects.toThrow(
      /Valid section numbers/
    );
  });

  it('productSummary is accepted but does not change the generated bytes in v1', async () => {
    const a = await handleGenerateIrlXlsxTool({});
    const b = await handleGenerateIrlXlsxTool({
      productSummary: 'A platform for synthetic-aperture radar processing in the cloud.',
    });
    const aPayload = a.structuredContent as { sectionCount: number; bulletCount: number };
    const bPayload = b.structuredContent as { sectionCount: number; bulletCount: number };
    expect(aPayload.sectionCount).toBe(bPayload.sectionCount);
    expect(aPayload.bulletCount).toBe(bPayload.bulletCount);
  });
});

describe('generate_information_request_list_xlsx — per-question removal + directives', () => {
  it('schema accepts NN-II excludeRequests keys and rejects malformed forms', () => {
    expect(
      GenerateIrlXlsxInputSchema.safeParse({ excludeRequests: ['02-03', '05-01'] }).success
    ).toBe(true);
    expect(GenerateIrlXlsxInputSchema.safeParse({ excludeRequests: [] }).success).toBe(false);
    expect(GenerateIrlXlsxInputSchema.safeParse({ excludeRequests: ['2-3'] }).success).toBe(false);
    expect(GenerateIrlXlsxInputSchema.safeParse({ excludeRequests: ['02:03'] }).success).toBe(
      false
    );
  });

  it('excludeRequests drops the question and leaves a Reference-ID gap in the sheet', async () => {
    const base = await handleGenerateIrlXlsxTool({});
    const result = await handleGenerateIrlXlsxTool({ excludeRequests: ['02-03'] });
    const basePayload = base.structuredContent as { bulletCount: number };
    const payload = result.structuredContent as { bulletCount: number; base64: string };
    expect(payload.bulletCount).toBe(basePayload.bulletCount - 1);

    const wb = XLSX.read(decodeBase64(payload.base64), { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];
    const refIds = Object.entries(sheet)
      .filter(([k]) => /^A\d+$/.test(k))
      .map(([, cell]) => (cell as XLSX.CellObject).v);
    expect(refIds).toContain('2-02');
    expect(refIds).not.toContain('2-03'); // the gap
    expect(refIds).toContain('2-04');
  });

  it('transactionContext fires the shipped skip-if directive (bulletCount 67 → 66)', async () => {
    const result = await handleGenerateIrlXlsxTool({ transactionContext: 'buy-side' });
    const payload = result.structuredContent as { bulletCount: number; base64: string };
    expect(payload.bulletCount).toBe(66);

    const wb = XLSX.read(decodeBase64(payload.base64), { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    const flat = rows.flat().join('\n');
    expect(flat).not.toContain('Engagement context: sell-side preparation');
    // The directive-removed question's Reference ID is a gap, not renumbered.
    const refIds = Object.entries(sheet)
      .filter(([k]) => /^A\d+$/.test(k))
      .map(([, cell]) => (cell as XLSX.CellObject).v);
    expect(refIds).toContain('0-01');
    expect(refIds).not.toContain('0-02');
    expect(refIds).toContain('0-03');
  });

  it("the 'unknown' context fires no directives (stays 67)", async () => {
    const result = await handleGenerateIrlXlsxTool({ transactionContext: 'unknown' });
    const payload = result.structuredContent as { bulletCount: number };
    expect(payload.bulletCount).toBe(67);
  });

  it('deeplink encodes excludeRequests as a percent-encoded comma list', async () => {
    const result = await handleGenerateIrlXlsxTool({ excludeRequests: ['00-01', '02-03'] });
    const text = (result.content[0] as { text: string }).text;
    // URLSearchParams percent-encodes the comma → %2C (mirror the sections= assertion).
    expect(text).toMatch(/[?&]exclude=00-01%2C02-03(&|\s|$)/);
  });

  it('throws the exclusion-specific guard (no TypeError) when excludeRequests removes everything', async () => {
    // Exclude every question of every section: harvest keys from the article
    // via a full run first.
    const base = await handleGenerateIrlXlsxTool({});
    const { bulletCount } = base.structuredContent as { bulletCount: number };
    expect(bulletCount).toBe(67);
    // Build the complete key list from the known per-section counts by asking
    // the sheet for its Reference IDs and converting back to NN-II keys.
    const { base64 } = base.structuredContent as { base64: string };
    const wb = XLSX.read(decodeBase64(base64), { type: 'array' });
    const sheet = wb.Sheets['Information Request List'];
    const allKeys = Object.entries(sheet)
      .filter(
        ([k, cell]) =>
          /^A\d+$/.test(k) && /^\d{1,2}-\d{2}$/.test(String((cell as XLSX.CellObject).v))
      )
      .map(([, cell]) => {
        const [sec, ord] = String((cell as XLSX.CellObject).v).split('-');
        return `${sec.padStart(2, '0')}-${ord}`;
      });
    expect(allKeys).toHaveLength(67);

    await expect(handleGenerateIrlXlsxTool({ excludeRequests: allKeys })).rejects.toThrow(
      /Every request was excluded/
    );
    await expect(handleGenerateIrlXlsxTool({ excludeRequests: allKeys })).rejects.toThrow(
      /list_irl_requests/
    );
  });

  it('a section fully excluded by keys is dropped from the workbook (sectionCount shrinks)', async () => {
    // Section 08 (Corporate IT) has exactly 3 questions.
    const result = await handleGenerateIrlXlsxTool({
      excludeRequests: ['08-01', '08-02', '08-03'],
    });
    const payload = result.structuredContent as { sectionCount: number; base64: string };
    expect(payload.sectionCount).toBe(9);
    const wb = XLSX.read(decodeBase64(payload.base64), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Information Request List'], {
      header: 1,
      defval: '',
    });
    expect(rows.flat().join('\n')).not.toContain('08 — CORPORATE IT');
  });
});

describe('generate_information_request_list_xlsx — error paths', () => {
  it('propagates the prebuild remediation message when the IRL source is missing', async () => {
    // Simulate a stale / un-regenerated irl-source-data.generated.ts (the
    // operator-facing failure mode loadIrlSourceBody's error is calibrated for).
    const spy = vi.spyOn(irlSourceLoader, 'loadIrlSourceBody').mockImplementation(() => {
      throw new Error(
        'IRL source body is empty. Re-run `npm -w @gst/mcp-server run prebuild` to regenerate irl-source-data.generated.ts.'
      );
    });
    try {
      await expect(handleGenerateIrlXlsxTool({})).rejects.toThrow(/IRL source body is empty/);
      await expect(handleGenerateIrlXlsxTool({})).rejects.toThrow(/prebuild/);
    } finally {
      spy.mockRestore();
    }
  });
});
