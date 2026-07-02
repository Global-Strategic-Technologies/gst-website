/**
 * Unit tests for the pure IRL customization primitives
 * (`src/utils/irl/customize-article.ts`): section filtering + additive
 * custom requests, and the composed `customizeIrlArticle` entry point both
 * surfaces (Hub page + MCP tool) call.
 *
 * Behavior over implementation per TEST_BEST_PRACTICES § 1 — assert on the
 * returned AST shape, and lock the two invariants that matter downstream:
 * order preservation (Reference IDs stay stable) and input immutability
 * (the functions are pure and safe to call in any runtime).
 */

import {
  customizeIrlArticle,
  filterIrlArticle,
  addCustomRequests,
} from '../../src/utils/irl/customize-article';
import type { IRLArticle } from '../../src/utils/irl/types';

function fixture(): IRLArticle {
  return {
    title: 'Information Request List',
    intro: 'Intro paragraph.',
    sections: [
      { number: '00', title: 'Basics', bullets: [{ text: 'A0' }, { text: 'A1' }] },
      { number: '01', title: 'Product', bullets: [{ text: 'B0' }] },
      { number: '09', title: 'Governance', bullets: [{ text: 'C0' }, { text: 'C1' }] },
    ],
  };
}

describe('filterIrlArticle', () => {
  it('returns the same reference unchanged when includeSections is undefined', () => {
    const article = fixture();
    expect(filterIrlArticle(article, undefined)).toBe(article);
  });

  it('keeps only requested sections, preserving original order', () => {
    const result = filterIrlArticle(fixture(), ['09', '00']);
    expect(result.sections.map((s) => s.number)).toEqual(['00', '09']);
  });

  it('ignores unknown section numbers', () => {
    const result = filterIrlArticle(fixture(), ['00', '77']);
    expect(result.sections.map((s) => s.number)).toEqual(['00']);
  });

  it('returns a zero-section article when nothing matches (caller guards)', () => {
    const result = filterIrlArticle(fixture(), ['77']);
    expect(result.sections).toHaveLength(0);
  });

  it('does not mutate the input article', () => {
    const article = fixture();
    filterIrlArticle(article, ['00']);
    expect(article.sections).toHaveLength(3);
  });
});

describe('addCustomRequests', () => {
  it('returns the article unchanged when there are no requests', () => {
    const article = fixture();
    expect(addCustomRequests(article, [])).toBe(article);
    expect(addCustomRequests(article, undefined)).toBe(article);
  });

  it('appends a request as a new bullet on the matching section', () => {
    const result = addCustomRequests(fixture(), [{ section: '01', text: 'Custom B' }]);
    const product = result.sections.find((s) => s.number === '01');
    expect(product?.bullets.map((b) => b.text)).toEqual(['B0', 'Custom B']);
  });

  it('appends multiple requests to the same section in supplied order', () => {
    const result = addCustomRequests(fixture(), [
      { section: '00', text: 'X' },
      { section: '00', text: 'Y' },
    ]);
    const basics = result.sections.find((s) => s.number === '00');
    expect(basics?.bullets.map((b) => b.text)).toEqual(['A0', 'A1', 'X', 'Y']);
  });

  it('drops requests targeting a section not present in the article', () => {
    const result = addCustomRequests(fixture(), [{ section: '77', text: 'nowhere' }]);
    const total = result.sections.reduce((n, s) => n + s.bullets.length, 0);
    expect(total).toBe(5); // unchanged bullet count
  });

  it('does not mutate the input article or its sections', () => {
    const article = fixture();
    addCustomRequests(article, [{ section: '01', text: 'Custom B' }]);
    expect(article.sections.find((s) => s.number === '01')?.bullets).toHaveLength(1);
  });
});

describe('customizeIrlArticle', () => {
  it('returns the article unchanged with no options', () => {
    const article = fixture();
    expect(customizeIrlArticle(article)).toBe(article);
  });

  it('applies filter THEN custom requests (custom on an excluded section is dropped)', () => {
    const result = customizeIrlArticle(fixture(), {
      includeSections: ['00'],
      customRequests: [
        { section: '00', text: 'Kept' },
        { section: '01', text: 'Dropped with its section' },
      ],
    });
    expect(result.sections.map((s) => s.number)).toEqual(['00']);
    const basics = result.sections[0];
    expect(basics.bullets.map((b) => b.text)).toEqual(['A0', 'A1', 'Kept']);
  });

  it('custom requests on an included section survive filtering', () => {
    const result = customizeIrlArticle(fixture(), {
      includeSections: ['00', '01'],
      customRequests: [{ section: '01', text: 'Kept B' }],
    });
    const product = result.sections.find((s) => s.number === '01');
    expect(product?.bullets.map((b) => b.text)).toEqual(['B0', 'Kept B']);
  });
});
