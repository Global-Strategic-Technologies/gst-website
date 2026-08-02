/**
 * BL-033 Slice 3a — GDPR IP-truncation unit tests.
 */
import { describe, expect, it } from 'vitest';
import { newEntryId, newRequestId, truncateIp } from '../../../src/audit/redaction';

describe('truncateIp', () => {
  it('zeroes the last octet of an IPv4 address', () => {
    expect(truncateIp('203.0.113.7')).toBe('203.0.113.0');
    expect(truncateIp('10.20.30.40')).toBe('10.20.30.0');
  });

  it('keeps the /48 prefix of an IPv6 address', () => {
    expect(truncateIp('2001:db8:abcd:0012:0000:0000:0000:0001')).toBe('2001:db8:abcd::');
    // Compressed form.
    expect(truncateIp('2001:db8:abcd::1')).toBe('2001:db8:abcd::');
  });

  it('returns undefined for null / empty / whitespace', () => {
    expect(truncateIp(null)).toBeUndefined();
    expect(truncateIp(undefined)).toBeUndefined();
    expect(truncateIp('')).toBeUndefined();
    expect(truncateIp('   ')).toBeUndefined();
  });

  it('returns undefined for malformed input', () => {
    expect(truncateIp('not-an-ip')).toBeUndefined();
    expect(truncateIp('1.2.3')).toBeUndefined(); // too few octets
    expect(truncateIp('1.2.3.4.5')).toBeUndefined(); // too many
    expect(truncateIp('999.1.1.1')).toBeUndefined(); // octet out of range
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(truncateIp('  203.0.113.7  ')).toBe('203.0.113.0');
  });
});

describe('id minting', () => {
  it('mints distinct UUID-shaped request + entry ids', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(newRequestId()).toMatch(uuid);
    expect(newEntryId()).toMatch(uuid);
    expect(newEntryId()).not.toBe(newEntryId());
  });
});
