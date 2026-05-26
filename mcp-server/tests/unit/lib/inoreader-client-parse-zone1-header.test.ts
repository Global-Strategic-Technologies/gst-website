/**
 * Unit tests for `parseZone1UsageHeader` (BL-032.75 Phase 0 audit fix C3).
 *
 * The helper is the chokepoint that protects drift detection from being
 * poisoned by empty / non-numeric / negative `X-Reader-Zone1-Usage`
 * headers. Removing any of these guards from production passes the wider
 * egress unit tests silently — so each branch needs its own assertion.
 */

import { describe, it, expect } from 'vitest';
import { parseZone1UsageHeader } from '../../../src/lib/inoreader-client';

function makeRes(headerValue: string | null): Response {
  const headers: Record<string, string> = {};
  if (headerValue !== null) headers['X-Reader-Zone1-Usage'] = headerValue;
  return new Response('', { status: 200, headers });
}

describe('parseZone1UsageHeader', () => {
  it.each<[string, number]>([
    ['0', 0],
    ['1', 1],
    ['42', 42],
    ['99', 99],
    ['1138', 1138], // Inoreader's documented example value
  ])('parses %s → %s', (header, expected) => {
    expect(parseZone1UsageHeader(makeRes(header))).toBe(expected);
  });

  it('trims surrounding whitespace', () => {
    expect(parseZone1UsageHeader(makeRes('  42  '))).toBe(42);
  });

  it('returns undefined when the header is absent (proxy stripped)', () => {
    expect(parseZone1UsageHeader(makeRes(null))).toBeUndefined();
  });

  // The poisoning case the audit flagged: Number('') === 0, isFinite(0) ===
  // true. A naive parser would treat an empty header as a real zero reading.
  it.each<[string, string]>([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['tab', '\t'],
  ])('returns undefined for %s (audit fix C3)', (_label, header) => {
    expect(parseZone1UsageHeader(makeRes(header))).toBeUndefined();
  });

  it.each<[string, string]>([
    ['letters', 'abc'],
    ['mixed', '12abc'],
    ['floating malformed', '1.2.3'],
    ['NaN literal', 'NaN'],
    ['Infinity literal', 'Infinity'],
  ])('returns undefined for non-numeric %s', (_label, header) => {
    expect(parseZone1UsageHeader(makeRes(header))).toBeUndefined();
  });

  it.each<[string, string]>([
    ['negative integer', '-1'],
    ['negative float', '-0.5'],
  ])('returns undefined for %s (Inoreader counter cannot be negative)', (_label, header) => {
    expect(parseZone1UsageHeader(makeRes(header))).toBeUndefined();
  });
});
