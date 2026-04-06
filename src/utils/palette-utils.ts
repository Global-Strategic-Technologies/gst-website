/**
 * Pure color conversion utilities for the palette system.
 * No DOM dependencies — safe for unit testing.
 */

export function rgbToHex(rgb: string): string {
  if (rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return 'transparent';
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return rgb;
  const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  return a < 1 ? `${hex} (${Math.round(a * 100)}%)` : hex;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
