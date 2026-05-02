/**
 * Integration tests for the compute_techpar MCP tool handler —
 * exercises the full wrapper pipeline introduced under BL-031.95
 * Phase 1 (`infraHosting` → `infraHostingAnnual` rename, drop `× 12`
 * annualization, MCP wrapper deeplink emission, .describe() pass) on
 * top of the BL-031.87 canonical funding-stage adapter.
 *
 * The unit tests for the renamed schema, engine math, URL serializer,
 * and canonical-stage resolver live in the corresponding *.test.ts
 * files; this integration test is the engineering substitute for the
 * BL-031.95 Phase 1 "live MCP exercise" — the running mcp-server
 * subprocess in any given Claude session is started from
 * `dist/index.js` at session start and cannot be reloaded with
 * newly-built code mid-session, so this test asserts the same
 * guarantees the live exercise would, by walking the actual handler
 * code path with parsed inputs.
 */

import { describe, it, expect } from 'vitest';

import { handleTechparTool } from '../../src/tools/techpar';
import { TechParMcpInputsSchema } from '../../src/schemas';

const validInputs = {
  arr: 25_000_000,
  stage: 'series-b' as const, // canonical (BL-031.87)
  mode: 'quick' as const,
  capexView: 'cash' as const,
  growthRate: 30,
  exitMultiple: 12,
  infraHostingAnnual: 960_000, // BL-031.95: schema is annual
  infraPersonnel: 600_000,
  rdOpEx: 4_000_000,
  rdCapEx: 500_000,
  engFTE: 25,
  engCost: 0,
  prodCost: 0,
  toolingCost: 0,
};

describe('handleTechparTool — BL-031.95 Phase 1 integration (renamed field + canonical stage + deeplink)', () => {
  it('canonical stage `series-b` resolves to native `series_bc`; engine produces non-null result; deeplink + stageContext attached', async () => {
    const parsed = TechParMcpInputsSchema.parse(validInputs);
    const response = await handleTechparTool(parsed);
    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;

    // Engine produced a real result.
    expect(typeof payload.totalTechPct).toBe('number');
    expect(payload.totalTechPct).toBeGreaterThan(0);
    expect(['underinvest', 'ahead', 'healthy', 'above', 'elevated', 'critical']).toContain(
      payload.zone
    );

    // stageContext: native is the resolved TechPar enum, canonical is
    // the array exposing the collapse.
    const stageContext = payload.stageContext as { native: string; canonical: readonly string[] };
    expect(stageContext.native).toBe('series_bc');
    expect(stageContext.canonical).toEqual(['series-b', 'series-c']);

    // Deeplink: well-formed URL pointing at the techpar page.
    expect(typeof payload.deeplink).toBe('string');
    const deeplink = payload.deeplink as string;
    expect(deeplink).toMatch(/\/hub\/tools\/techpar\/\?/);
    // The renamed `infraHostingAnnual` field serializes to URL key `h`
    // with the annual value (no internal × 12 anymore).
    expect(deeplink).toMatch(/h=960000/);
    // Native stage is what the URL carries (the page hydrates to the
    // engine's enum).
    expect(deeplink).toMatch(/s=series_bc/);
  });

  it('native stage `series_bc` produces identical engine output to canonical `series-b` (canonical layer is purely additive)', async () => {
    const canonicalParsed = TechParMcpInputsSchema.parse(validInputs);
    const nativeParsed = TechParMcpInputsSchema.parse({ ...validInputs, stage: 'series_bc' });
    const canonicalResponse = await handleTechparTool(canonicalParsed);
    const nativeResponse = await handleTechparTool(nativeParsed);
    const canonicalPayload = canonicalResponse.structuredContent as Record<string, unknown>;
    const nativePayload = nativeResponse.structuredContent as Record<string, unknown>;
    expect(canonicalPayload.total).toBe(nativePayload.total);
    expect(canonicalPayload.totalTechPct).toBe(nativePayload.totalTechPct);
    expect(canonicalPayload.zone).toBe(nativePayload.zone);
    // Both deeplinks are identical (URL state is engine-shape).
    expect(canonicalPayload.deeplink).toBe(nativePayload.deeplink);
  });

  it('infraHostingAnnual = 0 produces an isError response with the explicit error message', async () => {
    const parsed = TechParMcpInputsSchema.parse({ ...validInputs, infraHostingAnnual: 0 });
    const response = await handleTechparTool(parsed);
    expect(response.isError).toBe(true);
    const text = (response.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('infraHostingAnnual');
    expect(text).toContain('greater than zero');
  });

  it('arr = 0 produces the same isError shape as zero hosting', async () => {
    const parsed = TechParMcpInputsSchema.parse({ ...validInputs, arr: 0 });
    const response = await handleTechparTool(parsed);
    expect(response.isError).toBe(true);
    const text = (response.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('arr');
    expect(text).toContain('greater than zero');
  });

  it('engine no longer multiplies infraHostingAnnual by 12 — 24% total tech ratio at known inputs (BL-031.95)', async () => {
    // Pre-BL-031.95: passing `infraHosting: 960_000` would have multiplied
    // by 12 internally to $11.52M annual hosting → 46% of $25M ARR alone.
    // Post-BL-031.95: the same value is treated as annual directly.
    // Per the canonical sample: total = $6.06M, totalTechPct = 24.24%.
    const parsed = TechParMcpInputsSchema.parse(validInputs);
    const response = await handleTechparTool(parsed);
    const payload = response.structuredContent as Record<string, unknown>;
    expect(payload.totalTechPct).toBeCloseTo(24.24, 1);
    expect(payload.total).toBe(6_060_000);
  });
});
