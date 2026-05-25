/**
 * Unit tests for the `generate_information_request_list_xlsx` MCP tool.
 *
 * Exercises the full handler pipeline (library load → parse → generate
 * → base64) without going through the MCP transport. The integration
 * test in `tests/integration/prompts-registry.test.ts` confirms the
 * tool's name appears in the prompt's `orchestrates` list.
 */

import { describe, it, expect, vi } from 'vitest';
import * as XLSX from '@e965/xlsx';
import {
  handleGenerateIrlXlsxTool,
  GenerateIrlXlsxInputSchema,
} from '../../../src/tools/generate-information-request-list-xlsx';
import { IRL_XLSX_MIME_TYPE } from '../../../../src/utils/irl/generate-xlsx';
import * as libraryLoader from '../../../src/content/library-loader';

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
});

describe('generate_information_request_list_xlsx — handler', () => {
  it('returns a content envelope with a text summary', async () => {
    const result = await handleGenerateIrlXlsxTool({});
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toMatch(/Generated.*workbook/i);
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

describe('generate_information_request_list_xlsx — error paths', () => {
  it('throws with the prebuild remediation message when the library entry is missing', async () => {
    // Stub the library loader to simulate a stale / un-regenerated
    // library-data.generated.ts (the operator-facing failure mode the
    // handler's specific error message is calibrated for).
    const spy = vi.spyOn(libraryLoader, 'loadLibraryByUri').mockReturnValue(null);
    try {
      await expect(handleGenerateIrlXlsxTool({})).rejects.toThrow(/Library entry missing/);
      await expect(handleGenerateIrlXlsxTool({})).rejects.toThrow(/prebuild/);
      await expect(handleGenerateIrlXlsxTool({})).rejects.toThrow(
        /gst:\/\/library\/information-request-list/
      );
    } finally {
      spy.mockRestore();
    }
  });
});
