/**
 * Unit tests for the `list_irl_requests` MCP tool — the key-discovery
 * companion to `generate_information_request_list_xlsx`'s `excludeRequests`.
 * Exercises the handler against the real bundled generator source, so the
 * assertions double as regression guards on the key grammar and the shipped
 * skip-if tag.
 */

import { describe, it, expect } from 'vitest';
import { handleListIrlRequestsTool } from '../../../src/tools/list-irl-requests';

interface IrlRequestEntry {
  key: string;
  section: string;
  sectionTitle: string;
  text: string;
  skipIf?: Record<string, string[]>;
}

async function getPayload() {
  const result = await handleListIrlRequestsTool();
  return result.structuredContent as unknown as {
    requests: IrlRequestEntry[];
    sectionCount: number;
    bulletCount: number;
  };
}

describe('list_irl_requests', () => {
  it('returns every canonical question (counts match the source regression numbers)', async () => {
    const payload = await getPayload();
    expect(payload.sectionCount).toBe(10);
    expect(payload.bulletCount).toBe(67);
    expect(payload.requests).toHaveLength(67);
  });

  it('every key matches the NN-II grammar', async () => {
    const payload = await getPayload();
    for (const entry of payload.requests) {
      expect(entry.key, `bad key on "${entry.text}"`).toMatch(/^\d{2}-\d{2}$/);
      expect(entry.key.startsWith(entry.section)).toBe(true);
    }
  });

  it('entries are ordered by section then ordinal, with 1-based per-section numbering', async () => {
    const payload = await getPayload();
    const keys = payload.requests.map((r) => r.key);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    // First entry of the first section is -01.
    expect(keys[0]).toBe('00-01');
  });

  it('the shipped skip-if tag surfaces on the Engagement-context question', async () => {
    const payload = await getPayload();
    const tagged = payload.requests.filter((r) => r.skipIf);
    expect(tagged.length).toBeGreaterThanOrEqual(1);
    const engagementContext = tagged.find((r) => r.text.startsWith('Engagement context'));
    expect(engagementContext).toBeDefined();
    expect(engagementContext?.skipIf).toEqual({
      context: ['sell-side', 'buy-side', 'value-creation'],
    });
  });

  it('untagged questions carry no skipIf property', async () => {
    const payload = await getPayload();
    const companyName = payload.requests.find((r) => r.key === '00-01');
    expect(companyName).toBeDefined();
    expect(companyName).not.toHaveProperty('skipIf');
  });

  it('text summary names the count and cross-references the generate tool', async () => {
    const result = await handleListIrlRequestsTool();
    expect(result.content).toHaveLength(1);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('67');
    expect(text).toContain('excludeRequests');
  });
});
