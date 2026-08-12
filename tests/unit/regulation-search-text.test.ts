import { describe, it, expect } from 'vitest';
import { buildRegulationSearchText } from '../../src/utils/regulation-search-text';

/**
 * BL-119 cycle 4 (2026-08-12). The regulatory-map page filters by splitting the
 * query on whitespace and requiring every term to be a substring of this text
 * (`index.astro`, `performSearch`). Before the fix the text was the canonical
 * name alone, and no alias in the corpus is a substring of its own record's
 * name — so every common short form returned zero results.
 */
describe('buildRegulationSearchText', () => {
  const colorado = {
    name: 'Colorado Artificial Intelligence Act (SB 24-205)',
    aliases: ['Colorado AI Act', 'CAIA', 'SB 24-205'],
  };

  /** The page's own matcher, mirrored so these assertions test real behaviour. */
  const matches = (text: string, query: string): boolean =>
    query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((term) => text.includes(term));

  it('includes the canonical name', () => {
    expect(buildRegulationSearchText(colorado)).toContain('colorado artificial intelligence act');
  });

  it('makes the common short form reachable', () => {
    // This is the exact query UAT cycle 4 found returning nothing on the page.
    const text = buildRegulationSearchText(colorado);
    expect(matches(text, 'Colorado AI Act')).toBe(true);
    expect(matches(text, 'CAIA')).toBe(true);
    expect(matches(text, 'SB 24-205')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(matches(buildRegulationSearchText(colorado), 'GDPR')).toBe(false);
  });

  it('handles a record with no aliases', () => {
    expect(buildRegulationSearchText({ name: 'UK Data Protection Act 2018' })).toBe(
      'uk data protection act 2018'
    );
  });

  it('lowercases everything, since the matcher lowercases the query', () => {
    const text = buildRegulationSearchText(colorado);
    expect(text).toBe(text.toLowerCase());
  });
});
