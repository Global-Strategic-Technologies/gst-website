/**
 * Integration tests for the assess_infrastructure_cost_governance MCP
 * tool handler — exercises the full wrapper pipeline introduced under
 * BL-031.87 (canonical funding-stage adapter at the MCP-wrapper boundary).
 *
 * The unit tests for the canonical layer + adapters live in
 * `tests/unit/funding-stages.test.ts`; the wrapper-handler integration
 * test is the engineering substitute for the BL-031.87 "live MCP
 * exercise" — the running mcp-server subprocess in any given Claude
 * session is started from `dist/index.js` at session start and cannot
 * be reloaded with newly-built code mid-session, so this test asserts
 * the same guarantees the live exercise would, by walking the actual
 * handler code path with parsed inputs.
 */

import { describe, it, expect } from 'vitest';

import { handleIcgTool } from '../../src/tools/icg';
import { ICGMcpInputsSchema } from '../../src/schemas';

const baseAnswers: Record<string, number> = {
  q1_1: 2,
  q1_2: 1,
  q1_3: 0,
  q2_1: 3,
  q2_2: 2,
  q2_3: -1,
  q2_4: 1,
  q3_1: 2,
  q3_2: 1,
  q3_3: 1,
  q4_1: 2,
  q4_2: 0,
  q4_3: 1,
  q5_1: 1,
  q5_2: 0,
  q5_3: 1,
  q6_1: 2,
  q6_2: 1,
  q6_3: 0,
  q6_4: 1,
};

describe('handleIcgTool — BL-031.87 canonical-stage integration', () => {
  it('canonical companyStage `series-a` resolves to native `pre-series-b` and surfaces both via stageContext', async () => {
    const parsed = ICGMcpInputsSchema.parse({
      answers: baseAnswers,
      companyStage: 'series-a',
    });
    const response = await handleIcgTool(parsed);
    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    expect(payload.stageContext).toBeDefined();
    const stageContext = payload.stageContext as { native: string; canonical: readonly string[] };
    expect(stageContext.native).toBe('pre-series-b');
    expect(stageContext.canonical).toEqual(['seed', 'series-a']);
    // Engine actually ran: overall score is a number 0–100.
    expect(typeof payload.overallScore).toBe('number');
    expect(payload.overallScore).toBeGreaterThanOrEqual(0);
    expect(payload.overallScore).toBeLessThanOrEqual(100);
    // Deeplink is well-formed.
    expect(typeof payload.deeplink).toBe('string');
    expect(payload.deeplink).toMatch(/\/hub\/tools\/infrastructure-cost-governance\/\?s=/);
  });

  it('native companyStage `pre-series-b` produces identical engine output to canonical `series-a`', async () => {
    const canonicalParsed = ICGMcpInputsSchema.parse({
      answers: baseAnswers,
      companyStage: 'series-a',
    });
    const nativeParsed = ICGMcpInputsSchema.parse({
      answers: baseAnswers,
      companyStage: 'pre-series-b',
    });
    const canonicalResponse = await handleIcgTool(canonicalParsed);
    const nativeResponse = await handleIcgTool(nativeParsed);
    const canonicalPayload = canonicalResponse.structuredContent as Record<string, unknown>;
    const nativePayload = nativeResponse.structuredContent as Record<string, unknown>;
    // Same engine output (overallScore, maturityLevel, recommendations
    // count) — the canonical layer is purely additive at the input
    // boundary.
    expect(canonicalPayload.overallScore).toBe(nativePayload.overallScore);
    expect(canonicalPayload.maturityLevel).toBe(nativePayload.maturityLevel);
    expect((canonicalPayload.recommendations as unknown[]).length).toBe(
      (nativePayload.recommendations as unknown[]).length
    );
    // Both stageContext.native values must be `pre-series-b`.
    const canonicalStageContext = canonicalPayload.stageContext as { native: string };
    const nativeStageContext = nativePayload.stageContext as { native: string };
    expect(canonicalStageContext.native).toBe('pre-series-b');
    expect(nativeStageContext.native).toBe('pre-series-b');
  });

  it('omitted companyStage produces a payload with no stageContext field (engine still runs)', async () => {
    const parsed = ICGMcpInputsSchema.parse({
      answers: baseAnswers,
    });
    const response = await handleIcgTool(parsed);
    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    expect(payload.stageContext).toBeUndefined();
    // Engine still ran.
    expect(typeof payload.overallScore).toBe('number');
    // Deeplink is still emitted.
    expect(typeof payload.deeplink).toBe('string');
  });

  it('canonical `series-c` and `series-b` both resolve to `series-bc` (lossy collapse documented honestly)', async () => {
    const seriesB = await handleIcgTool(
      ICGMcpInputsSchema.parse({ answers: baseAnswers, companyStage: 'series-b' })
    );
    const seriesC = await handleIcgTool(
      ICGMcpInputsSchema.parse({ answers: baseAnswers, companyStage: 'series-c' })
    );
    const bPayload = seriesB.structuredContent as Record<string, unknown>;
    const cPayload = seriesC.structuredContent as Record<string, unknown>;
    const bStageContext = bPayload.stageContext as { native: string; canonical: readonly string[] };
    const cStageContext = cPayload.stageContext as { native: string; canonical: readonly string[] };
    expect(bStageContext.native).toBe('series-bc');
    expect(cStageContext.native).toBe('series-bc');
    // The canonical array exposes the collapse honestly: both inputs
    // see `['series-b', 'series-c']` because that's what the native
    // value covers.
    expect(bStageContext.canonical).toEqual(['series-b', 'series-c']);
    expect(cStageContext.canonical).toEqual(['series-b', 'series-c']);
  });
});
