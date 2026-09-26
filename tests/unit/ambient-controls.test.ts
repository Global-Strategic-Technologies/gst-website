// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { EFFECT_IDS, SCOPES } from '../../src/scripts/ambient-motion';
import { mountAmbientControls } from '../../src/scripts/ambient/controls';

/**
 * The panel's Motion controls are built on the panel's first open (BL-035,
 * ADR-0039). The E2E suite drives them; this pins what mounting produces.
 */
describe('ambient motion controls (BL-035)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '';
    document.documentElement.removeAttribute('data-ambient');
    document.body.innerHTML =
      '<span id="ambient-scope-hint">Homepage hero</span><div id="ambient-controls-mount"></div>';
  });

  it('builds every control, disabled until an effect is on, then signals ready', () => {
    // A browser that switched motion off: nothing pressed, nothing adjustable.
    localStorage.setItem('ambient-motion', '{"on":[]}');
    mountAmbientControls();
    const root = document.getElementById('ambient-controls')!;
    expect(root.dataset.ready).toBe('true');
    expect(root.dataset.testid).toBe('ambient-controls');
    for (const id of EFFECT_IDS) {
      const chip = document.querySelector(`[data-testid="ambient-chip-${id}"]`)!;
      expect(chip.getAttribute('aria-pressed')).toBe('false');
      expect(
        document.querySelector<HTMLInputElement>(`[data-testid="ambient-strength-${id}"]`)!.disabled
      ).toBe(true);
    }
    for (const scope of SCOPES)
      expect(
        document.querySelector<HTMLButtonElement>(`[data-testid="ambient-scope-${scope}"]`)!
          .disabled
      ).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#ambient-pace')!.disabled).toBe(true);
    expect(document.getElementById('ambient-controls-css')).not.toBeNull();
  });

  it('hydrates from storage and drives <html>', () => {
    localStorage.setItem('ambient-motion', JSON.stringify({ on: ['glow'], scope: 'site' }));
    mountAmbientControls();
    expect(
      document.querySelector('[data-testid="ambient-chip-glow"]')!.getAttribute('aria-pressed')
    ).toBe('true');
    expect(document.getElementById('ambient-scope-hint')!.textContent).toBe('Every page');
    document.querySelector<HTMLButtonElement>('[data-testid="ambient-chip-rails"]')!.click();
    expect(document.documentElement.getAttribute('data-ambient')).toBe('glow rails');
    expect(document.getElementById('ambient-state')!.textContent).toMatch(/^2 of 6 on/);
  });

  it('with nothing stored, comes up on the shipped default', () => {
    mountAmbientControls();
    for (const id of EFFECT_IDS)
      expect(
        document.querySelector(`[data-testid="ambient-chip-${id}"]`)!.getAttribute('aria-pressed')
      ).toBe('true');
    expect(
      document.querySelector('[data-testid="ambient-scope-site"]')!.getAttribute('aria-pressed')
    ).toBe('true');
    expect(document.getElementById('ambient-scope-hint')!.textContent).toBe('Every page');
  });

  it('mounts once', () => {
    mountAmbientControls();
    mountAmbientControls();
    expect(document.querySelectorAll('#ambient-controls')).toHaveLength(1);
    expect(document.querySelectorAll('#ambient-controls-css')).toHaveLength(1);
  });
});
