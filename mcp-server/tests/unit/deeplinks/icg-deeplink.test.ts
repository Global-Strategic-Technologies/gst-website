/**
 * ICG deep-link round-trip parity test.
 *
 * Proves the encoder is shared between the website page and the MCP
 * wrapper: build the deep-link from a populated ICGState, then simulate
 * the website's `decodeState` on the URL's `?s=` param. The decoded
 * partial state must contain every field we encoded.
 */

import { describe, it, expect } from 'vitest';
import { buildIcgDeeplink, buildResultsState } from '../../../src/tools/icg';
import { decodeState, type ICGState } from '../../../../src/utils/icg-engine';

const SAMPLE_STATE: ICGState = {
  answers: {
    'fin-1': 2,
    'fin-2': 1,
    'gov-1': 3,
    'gov-2': -1,
    'eng-1': 0,
    'eng-2': 2,
  },
  currentStep: 0,
  dismissed: [],
  companyStage: 'series-bc',
};

describe('ICG deep-link', () => {
  it('produces a URL on the configured HUB_BASE with a populated ?s= param', () => {
    const url = buildIcgDeeplink(SAMPLE_STATE);
    expect(url).toMatch(/^https?:\/\/[^/]+\/hub\/tools\/infrastructure-cost-governance\/\?s=.+$/);
  });

  it('round-trips through the website decoder byte-identically', () => {
    const url = buildIcgDeeplink(SAMPLE_STATE);
    const encoded = new URL(url).searchParams.get('s');
    expect(encoded).toBeTruthy();

    const decoded = decodeState(encoded!);
    expect(decoded).not.toBeNull();
    expect(decoded!.answers).toEqual(SAMPLE_STATE.answers);
    expect(decoded!.companyStage).toBe(SAMPLE_STATE.companyStage);
    expect(decoded!.currentStep).toBe(SAMPLE_STATE.currentStep);
  });

  it('omits optional fields when they are empty', () => {
    const minimal: ICGState = {
      answers: { 'fin-1': 2 },
      currentStep: 0,
      dismissed: [],
    };
    const url = buildIcgDeeplink(minimal);
    const encoded = new URL(url).searchParams.get('s')!;
    const decoded = decodeState(encoded);
    expect(decoded!.companyStage).toBeUndefined();
  });

  it('buildResultsState lands the wizard on the results view (currentStep===7)', () => {
    // Contract: a deep-link emitted by the MCP tool must skip the wizard
    // intro and the 6 domain steps, dropping the user directly on the
    // populated results view. Regression guard for the bug where
    // currentStep was 0 (landing) — see verification doc V2 finding #1.
    const state = buildResultsState({ answers: { q1_1: 2 }, companyStage: 'series-bc' });
    expect(state.currentStep).toBe(7);

    const url = buildIcgDeeplink(state);
    const encoded = new URL(url).searchParams.get('s')!;
    const decoded = decodeState(encoded);
    expect(decoded!.currentStep).toBe(7);
  });
});
