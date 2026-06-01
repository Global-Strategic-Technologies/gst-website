// @vitest-environment jsdom

/**
 * Locks the chip-paint contract shared by:
 *   - `paintCostChips()` in `src/utils/techpar/dom.ts` (called from
 *     `hydrateFromUrl`'s `setInput()` on URL state restoration)
 *   - `<PresetInput>`'s hoisted `syncAll()` in
 *     `src/components/techpar/PresetInput.astro` (called on every input
 *     event from user typing or chip click)
 *
 * The two paths intentionally implement the same chip-active selection
 * rule. If you change one, change the other.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { paintCostChips } from '../../src/utils/techpar/dom';

function buildControlMarkup(inputName: string, presetValues: number[], inputValue: string): void {
  document.body.innerHTML = `
    <div class="preset-input">
      <div class="tp-arr-quick">
        ${presetValues
          .map(
            (v) =>
              `<button class="tp-arr-chip" aria-pressed="false" data-preset-for="${inputName}" data-preset-val="${v}" type="button">${v}</button>`
          )
          .join('')}
      </div>
      <input type="number" data-input="${inputName}" value="${inputValue}" />
    </div>
  `;
}

function chipState(inputName: string, presetVal: number): { active: boolean; aria: string | null } {
  const chip = document.querySelector<HTMLButtonElement>(
    `[data-preset-for="${inputName}"][data-preset-val="${presetVal}"]`
  );
  if (!chip) throw new Error(`chip ${inputName}=${presetVal} not found`);
  return {
    active: chip.classList.contains('tp-arr-chip--active'),
    aria: chip.getAttribute('aria-pressed'),
  };
}

describe('paintCostChips — chip-active contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('activates the chip whose preset value matches the input', () => {
    buildControlMarkup('infra', [5000, 15000, 50000], '15000');
    paintCostChips('infra');

    expect(chipState('infra', 5000)).toEqual({ active: false, aria: 'false' });
    expect(chipState('infra', 15000)).toEqual({ active: true, aria: 'true' });
    expect(chipState('infra', 50000)).toEqual({ active: false, aria: 'false' });
  });

  it('deactivates all chips when no preset value matches', () => {
    buildControlMarkup('infra', [5000, 15000, 50000], '17777');
    paintCostChips('infra');

    for (const v of [5000, 15000, 50000]) {
      expect(chipState('infra', v)).toEqual({ active: false, aria: 'false' });
    }
  });

  it('deactivates all chips when the input is empty (current = 0)', () => {
    buildControlMarkup('infra', [5000, 15000], '');
    paintCostChips('infra');

    expect(chipState('infra', 5000)).toEqual({ active: false, aria: 'false' });
    expect(chipState('infra', 15000)).toEqual({ active: false, aria: 'false' });
  });

  it('treats a zero input as no-match (does not activate a 0-valued chip)', () => {
    // Guard against a regression where current=0 paints a hypothetical 0 chip.
    // The contract: `current > 0` is required before any chip can be active.
    buildControlMarkup('infra', [0, 5000], '0');
    paintCostChips('infra');

    expect(chipState('infra', 0)).toEqual({ active: false, aria: 'false' });
    expect(chipState('infra', 5000)).toEqual({ active: false, aria: 'false' });
  });

  it('strips commas when comparing (matches the en-US-formatted ARR write path)', () => {
    // jsdom's type=number input strips non-numeric attribute values, so we
    // assign via the property after construction to simulate the ARR path's
    // `state.arr.toLocaleString('en-US')` write into a text-like control.
    buildControlMarkup('infra', [5000, 15000], '');
    const input = document.querySelector<HTMLInputElement>('[data-input="infra"]')!;
    input.type = 'text';
    input.value = '15,000';
    paintCostChips('infra');

    expect(chipState('infra', 15000)).toEqual({ active: true, aria: 'true' });
    expect(chipState('infra', 5000)).toEqual({ active: false, aria: 'false' });
  });

  it('clears a previously-active chip when called after the value changes', () => {
    buildControlMarkup('infra', [5000, 15000], '5000');
    paintCostChips('infra');
    expect(chipState('infra', 5000).active).toBe(true);

    // Simulate user override
    const input = document.querySelector<HTMLInputElement>('[data-input="infra"]')!;
    input.value = '7777';
    paintCostChips('infra');

    expect(chipState('infra', 5000)).toEqual({ active: false, aria: 'false' });
    expect(chipState('infra', 15000)).toEqual({ active: false, aria: 'false' });
  });

  it('paints chips for the targeted inputName only, leaving siblings untouched', () => {
    document.body.innerHTML = `
      <div>
        <button class="tp-arr-chip tp-arr-chip--active" aria-pressed="true" data-preset-for="infra" data-preset-val="5000"></button>
        <input data-input="infra" value="5000" />
      </div>
      <div>
        <button class="tp-arr-chip tp-arr-chip--active" aria-pressed="true" data-preset-for="rdOpEx" data-preset-val="1000000"></button>
        <input data-input="rdOpEx" value="9999999" />
      </div>
    `;
    paintCostChips('rdOpEx');

    // rdOpEx chip should deactivate (input doesn't match)
    expect(chipState('rdOpEx', 1000000)).toEqual({ active: false, aria: 'false' });
    // infra chip should retain its pre-existing state (untouched by this call)
    expect(chipState('infra', 5000).active).toBe(true);
  });

  it('paints across multiple chip groups for the same inputName (infra monthly + annual)', () => {
    // Mirrors the BL-042 infra layout: two chip groups (monthly + annual)
    // both with data-preset-for="infra" share one input.
    document.body.innerHTML = `
      <div class="tp-arr-quick" data-infra-chips-annual style="display:none">
        <button class="tp-arr-chip" data-preset-for="infra" data-preset-val="50000"></button>
        <button class="tp-arr-chip" data-preset-for="infra" data-preset-val="200000"></button>
      </div>
      <div class="tp-arr-quick" data-infra-chips-monthly>
        <button class="tp-arr-chip" data-preset-for="infra" data-preset-val="5000"></button>
        <button class="tp-arr-chip" data-preset-for="infra" data-preset-val="50000"></button>
      </div>
      <input data-input="infra" value="50000" />
    `;
    paintCostChips('infra');

    // BOTH 50000 chips (in annual and monthly groups) should be active.
    const matches = document.querySelectorAll(
      '[data-preset-for="infra"][data-preset-val="50000"].tp-arr-chip--active'
    );
    expect(matches.length).toBe(2);
  });
});
