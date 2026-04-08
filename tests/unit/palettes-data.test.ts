import { palettes, PALETTE_NAMES, PALETTE_CONCEPTS, TOKEN_TIPS } from '@/data/palettes';

describe('Palette data integrity', () => {
  it('should export exactly 6 palettes (ids 0-5)', () => {
    expect(palettes).toHaveLength(6);
    expect(palettes.map(p => p.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('each palette should have non-empty name and concept', () => {
    for (const p of palettes) {
      expect(p.name).toBeTruthy();
      expect(p.concept).toBeTruthy();
      expect(typeof p.name).toBe('string');
      expect(typeof p.concept).toBe('string');
    }
  });

  it('PALETTE_NAMES should have entries for ids 0-5', () => {
    expect(Object.keys(PALETTE_NAMES)).toHaveLength(6);
    for (let i = 0; i <= 5; i++) {
      expect(PALETTE_NAMES[i]).toBeTruthy();
      expect(typeof PALETTE_NAMES[i]).toBe('string');
    }
  });

  it('PALETTE_CONCEPTS should match palettes array concepts', () => {
    for (const p of palettes) {
      expect(PALETTE_CONCEPTS[p.id]).toBe(p.concept);
    }
  });

  it('TOKEN_TIPS should have entries for core semantic tokens', () => {
    const coreTokens = [
      '--color-primary', '--color-primary-dark', '--color-secondary',
      '--color-success', '--color-warning', '--color-error',
      '--color-authority', '--color-distinguish', '--color-subdued',
    ];
    for (const token of coreTokens) {
      expect(TOKEN_TIPS[token]).toBeTruthy();
      expect(typeof TOKEN_TIPS[token]).toBe('string');
    }
  });

  it('TOKEN_TIPS values should all be non-empty strings', () => {
    for (const [key, value] of Object.entries(TOKEN_TIPS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('palette id=0 should be named Current (the production baseline)', () => {
    expect(palettes[0].name).toBe('Current');
    expect(PALETTE_NAMES[0]).toBe('0. Current');
  });
});
