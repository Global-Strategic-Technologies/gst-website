// @vitest-environment jsdom

/**
 * Regression: TechPar exit-multiple must not silently persist across a stage
 * change below PE/Enterprise (BL-034 accumulated bullet — decision option (a)).
 *
 * The exit-multiple field is only shown for `pe` / `enterprise` stages. A user
 * who sets e.g. 15× on Enterprise and then switches to a lower stage used to
 * silently carry 15× into results AND URL state (both flow from `buildInputs`,
 * which `syncUrlState` serializes) with no visible field to inspect or change.
 *
 * The fix guards `buildInputs()` so a non-PE stage always reports the default
 * exit multiple regardless of the (hidden) DOM value.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildInputs } from '../../src/utils/techpar/dom';
import { tp } from '../../src/utils/techpar/state';

function setupDom(exitMultValue: string): void {
  document.body.innerHTML = `
    <input data-input="arr" value="10000000" />
    <input data-input="exitMult" value="${exitMultValue}" />
  `;
}

describe('buildInputs — exit-multiple stage guard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the entered exit multiple on PE and Enterprise stages', () => {
    setupDom('15');

    tp.stageKey = 'enterprise';
    expect(buildInputs()?.exitMultiple).toBe(15);

    tp.stageKey = 'pe';
    expect(buildInputs()?.exitMultiple).toBe(15);
  });

  it('forces the default (12) on stages that do not expose the field', () => {
    // 15 is present in the (hidden) DOM input, carried over from an earlier
    // PE/Enterprise selection — it must NOT leak into results or URL state.
    setupDom('15');

    for (const stage of ['seed', 'series_a', 'series_bc'] as const) {
      tp.stageKey = stage;
      expect(buildInputs()?.exitMultiple, `stage=${stage}`).toBe(12);
    }
  });

  it('still defaults to 12 on PE when the input is empty', () => {
    setupDom('');
    tp.stageKey = 'pe';
    expect(buildInputs()?.exitMultiple).toBe(12);
  });
});
