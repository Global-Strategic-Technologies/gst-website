import { rgbToHex, hexToRgb, parseAlpha } from '@/utils/palette-utils';

describe('rgbToHex', () => {
  describe('standard RGB strings', () => {
    it('should convert rgb(255, 0, 0) to #ff0000', () => {
      expect(rgbToHex('rgb(255, 0, 0)')).toBe('#ff0000');
    });

    it('should convert rgb(0, 0, 0) to #000000', () => {
      expect(rgbToHex('rgb(0, 0, 0)')).toBe('#000000');
    });

    it('should convert rgb(255, 255, 255) to #ffffff', () => {
      expect(rgbToHex('rgb(255, 255, 255)')).toBe('#ffffff');
    });

    it('should convert rgb(5, 205, 153) to #05cd99 (brand primary)', () => {
      expect(rgbToHex('rgb(5, 205, 153)')).toBe('#05cd99');
    });
  });

  describe('RGBA strings', () => {
    it('should convert fully opaque rgba to hex without alpha annotation', () => {
      expect(rgbToHex('rgba(255, 0, 0, 1)')).toBe('#ff0000');
    });

    it('should return hex only for partial alpha (alpha tracked separately via parseAlpha)', () => {
      expect(rgbToHex('rgba(255, 0, 0, 0.5)')).toBe('#ff0000');
    });

    it('should return hex only for zero alpha', () => {
      expect(rgbToHex('rgba(255, 0, 0, 0)')).toBe('#ff0000');
    });

    it('should return hex for semi-transparent text colors', () => {
      expect(rgbToHex('rgba(26, 26, 26, 0.95)')).toBe('#1a1a1a');
    });
  });

  describe('special values', () => {
    it('should return "transparent" for transparent string', () => {
      expect(rgbToHex('transparent')).toBe('transparent');
    });

    it('should return "transparent" for rgba(0, 0, 0, 0)', () => {
      expect(rgbToHex('rgba(0, 0, 0, 0)')).toBe('transparent');
    });

    it('should return input as-is for non-matching strings', () => {
      expect(rgbToHex('not-a-color')).toBe('not-a-color');
      expect(rgbToHex('')).toBe('');
      expect(rgbToHex('#ff0000')).toBe('#ff0000');
    });
  });
});

describe('hexToRgb', () => {
  describe('valid 6-digit hex strings', () => {
    it('should parse #ff0000 to [255, 0, 0]', () => {
      expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
    });

    it('should parse #000000 to [0, 0, 0]', () => {
      expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    });

    it('should parse #ffffff to [255, 255, 255]', () => {
      expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
    });

    it('should parse #05cd99 to [5, 205, 153] (brand primary)', () => {
      expect(hexToRgb('#05cd99')).toEqual([5, 205, 153]);
    });
  });

  describe('case insensitivity', () => {
    it('should parse uppercase hex', () => {
      expect(hexToRgb('#FF0000')).toEqual([255, 0, 0]);
    });

    it('should parse mixed case hex', () => {
      expect(hexToRgb('#fF00aB')).toEqual([255, 0, 171]);
    });
  });

  describe('hash-optional input', () => {
    it('should parse hex without leading #', () => {
      expect(hexToRgb('ff0000')).toEqual([255, 0, 0]);
    });
  });

  describe('invalid inputs', () => {
    it('should return null for 3-digit shorthand hex', () => {
      expect(hexToRgb('#fff')).toBeNull();
    });

    it('should return null for 8-digit hex (with alpha)', () => {
      expect(hexToRgb('#ff000080')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(hexToRgb('')).toBeNull();
    });

    it('should return null for non-hex characters', () => {
      expect(hexToRgb('#gggggg')).toBeNull();
    });

    it('should return null for partial hex', () => {
      expect(hexToRgb('#ff00')).toBeNull();
    });
  });
});

describe('parseAlpha', () => {
  describe('opaque colors', () => {
    it('should return 1 for rgb() without alpha', () => {
      expect(parseAlpha('rgb(255, 0, 0)')).toBe(1);
    });

    it('should return 1 for rgba() with alpha 1', () => {
      expect(parseAlpha('rgba(255, 0, 0, 1)')).toBe(1);
    });
  });

  describe('semi-transparent colors', () => {
    it('should return 0.5 for 50% alpha', () => {
      expect(parseAlpha('rgba(255, 0, 0, 0.5)')).toBe(0.5);
    });

    it('should return 0.95 for text-primary style alpha', () => {
      expect(parseAlpha('rgba(26, 26, 26, 0.95)')).toBe(0.95);
    });

    it('should return 0.1 for border-light style alpha', () => {
      expect(parseAlpha('rgba(26, 26, 26, 0.1)')).toBe(0.1);
    });

    it('should return 0.08 for accent-light-bg style alpha', () => {
      expect(parseAlpha('rgba(5, 205, 153, 0.08)')).toBe(0.08);
    });
  });

  describe('special values', () => {
    it('should return 0 for transparent', () => {
      expect(parseAlpha('transparent')).toBe(0);
    });

    it('should return 0 for rgba(0, 0, 0, 0)', () => {
      expect(parseAlpha('rgba(0, 0, 0, 0)')).toBe(0);
    });

    it('should return 1 for non-matching strings', () => {
      expect(parseAlpha('not-a-color')).toBe(1);
      expect(parseAlpha('')).toBe(1);
      expect(parseAlpha('#ff0000')).toBe(1);
    });
  });
});
