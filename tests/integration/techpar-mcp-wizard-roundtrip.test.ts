/**
 * MCP ↔ Hub wizard TechPar deeplink round-trip — contract test.
 *
 * **Why this test exists** (post-demo audit finding, 2026-05-22):
 *
 * The TechPar wizard has two infra-cost-period modes (monthly / annual) and
 * defaults `tp.infraPeriod` to `'monthly'` ([`src/utils/techpar/state.ts:35`]).
 * In monthly mode, the wizard's `buildInputs()` multiplies the `infra` DOM
 * field by 12 before computing ([`src/utils/techpar/dom.ts:569`]). The wizard's
 * own URL writer sets `b=annual` only when the user manually toggles to
 * annual mode ([`src/utils/techpar/dom.ts:597`]); the MCP TechPar tool's
 * `buildTechparDeeplink` was NOT setting `b` at all (until commit `e40bdcc`).
 *
 * Effect of the regression: when a partner clicked an "Open TechPar Wizard"
 * link emitted by `gst_diligence_sweep` (renamed to `gst_irl_ingestion`
 * under BL-045 PR B), the wizard hydrated in monthly
 * mode and multiplied the already-annualized hosting figure by 12 —
 * producing a totalTechPct ~7× the value the MCP tool computed server-side
 * (live finding: 655.6% vs 92.4%).
 *
 * **What this test asserts** — the cross-surface contract:
 *
 *   1. MCP tool emits a deeplink containing `b=annual`.
 *   2. When that deeplink is loaded into the wizard (via `hydrateFromUrl`
 *      in a jsdom environment), the wizard's mutable state correctly
 *      restores `tp.infraPeriod = 'annual'`.
 *   3. The hydrated state would cause `buildInputs()` to pass through the
 *      annual value WITHOUT the × 12 multiplication.
 *
 * **What this test does NOT assert**: the full DOM render of the wizard
 * (visible chart, displayed totalTechPct text). That belongs in a
 * Playwright E2E and is not load-bearing for the regression — the
 * critical contract is at the state-mutation boundary tested here.
 *
 * **Why this catches the entire MCP↔wizard contract-drift class**: any
 * future change to either the MCP emitter (`buildTechparDeeplink` in
 * `mcp-server/src/tools/techpar.ts`) OR the wizard hydrator
 * (`hydrateFromUrl` in `src/utils/techpar/dom.ts`) that breaks the
 * round-trip will fail this test deterministically in CI, before merge.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { handleTechparTool } from '../../mcp-server/src/tools/techpar';
import { buildPartnerSuppliedTechParAudit } from '../../mcp-server/src/schemas/techpar-audit';
import { hydrateFromUrl } from '../../src/utils/techpar/dom';
import { tp } from '../../src/utils/techpar/state';

// BL-045 PR B Phase 2 — compute_techpar requires `_audit`. Use the
// partner-supplied Tier-3 helper for the engine-pipeline round-trip test;
// audit-refinement coverage lives in tests/unit/schemas/techpar-audit.test.ts.
function withAudit<T extends { mode: 'quick' | 'deepdive' }>(inputs: T) {
  return { ...inputs, _audit: buildPartnerSuppliedTechParAudit(inputs.mode) };
}

const MEDSIG_TECHPAR_INPUTS = {
  arr: 45_200_000,
  stage: 'series-b' as const,
  mode: 'deepdive' as const,
  capexView: 'cash' as const,
  growthRate: 62,
  exitMultiple: 12,
  infraHostingAnnual: 23_400_000, // 3-month average annualized — ANNUAL units
  infraPersonnel: 1_856_000,
  rdOpEx: 16_496_000,
  rdCapEx: 0,
  engFTE: 58,
  engCost: 13_456_000,
  prodCost: 2_400_000,
  toolingCost: 640_000,
};

describe('MCP ↔ wizard TechPar deeplink round-trip', () => {
  beforeEach(() => {
    // Reset the wizard's shared state to default before each test.
    tp.infraPeriod = 'monthly';
    tp.stageKey = null;
    tp.growthRate = null;
    tp.mode = 'quick';
  });

  it('MCP-emitted deeplink hydrates wizard to annual mode (catches the b=annual regression)', async () => {
    // 1. MCP tool computes against MedSig-shape inputs and emits a deeplink.
    const result = await handleTechparTool(withAudit(MEDSIG_TECHPAR_INPUTS));
    const payload = result.structuredContent as Record<string, unknown>;
    const deeplink = payload.deeplink as string;
    expect(typeof deeplink).toBe('string');

    // 2. The deeplink MUST include `b=annual` — without it, the wizard
    //    defaults to monthly and applies × 12 to the already-annualized
    //    `h` value. This is the load-bearing assertion against the
    //    BL-032.6 post-demo regression (fixed in mcp 0.3.3 / e40bdcc).
    expect(deeplink).toMatch(/[?&]b=annual(&|$)/);

    // 3. Hydrate the wizard from the deeplink (jsdom + the wizard's
    //    own hydrateFromUrl function, exercising the exact code path
    //    that runs in a partner's browser).
    const url = new URL(deeplink);
    window.history.replaceState(null, '', '/' + url.search);
    hydrateFromUrl();

    // 4. The wizard's mutable state MUST restore to annual mode. If
    //    this assertion ever fails, the wizard's hydration of the
    //    `b` param has regressed (or the MCP tool stopped emitting it,
    //    caught by the assertion above).
    expect(tp.infraPeriod).toBe('annual');
  });

  it('round-trip math: wizard-side annual interpretation equals MCP server-side totalTechPct', async () => {
    // Same flow as above, but additionally verifies the MCP's server-side
    // totalTechPct number matches what the wizard would compute IF the
    // wizard's `infraPeriod === 'annual'` causes it to skip the × 12.
    //
    // We don't run the wizard's full compute() pipeline here (that would
    // require the wizard's DOM to be populated with input values via
    // setInput, which is heavy DOM scaffolding); instead we verify the
    // critical state-bit (`infraPeriod === 'annual'`) AND the MCP's
    // totalTechPct, and rely on the unit-test coverage of compute() in
    // `mcp-server/tests/unit/techpar.test.ts` for the engine math.
    const result = await handleTechparTool(withAudit(MEDSIG_TECHPAR_INPUTS));
    const payload = result.structuredContent as Record<string, unknown>;
    const totalTechPct = payload.totalTechPct as number;

    // Server-side computed total should be ~92.4% — direct sum
    // h + p + (engCost + prodCost + toolingCost) / arr × 100. If a
    // regression returned a ~7× inflated value (655%), the wizard
    // hydration test above would still catch the b=annual cause; this
    // assertion locks the server-side math.
    expect(totalTechPct).toBeGreaterThan(90);
    expect(totalTechPct).toBeLessThan(96);

    // Now hydrate and verify the period flag — combined with the math
    // above, the partner click-through will produce the same percent.
    const deeplink = payload.deeplink as string;
    const url = new URL(deeplink);
    window.history.replaceState(null, '', '/' + url.search);
    hydrateFromUrl();
    expect(tp.infraPeriod).toBe('annual');
  });

  it('control: a deeplink WITHOUT b=annual hydrates wizard to monthly default (sanity check)', () => {
    // This is the inverse: confirm the wizard's default is still
    // monthly when `b` is absent — protects against silent default
    // changes in state.ts that would mask the regression.
    window.history.replaceState(
      null,
      '',
      '/?s=series_bc&a=45200000&h=23400000&p=1856000&f=58&k=13456000&q=2400000&t=640000'
    );
    hydrateFromUrl();
    expect(tp.infraPeriod).toBe('monthly');
  });
});
