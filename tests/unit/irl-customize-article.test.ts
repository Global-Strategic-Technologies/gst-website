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
  excludeBullets,
  applyDirectives,
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

/**
 * Parser-shaped fixture: ordinals + canonicalBulletCount + one skip-if tag,
 * mirroring what `parseIrlArticle` emits. Used by the exclusion / directive /
 * compose tests below (the plain `fixture()` above stays ordinal-less to pin
 * the dense-fallback behavior).
 */
function parsedFixture(): IRLArticle {
  return {
    title: 'Information Request List',
    intro: 'Intro paragraph.',
    sections: [
      {
        number: '00',
        title: 'Basics',
        canonicalBulletCount: 3,
        bullets: [
          { text: 'A1', ordinal: 1 },
          { text: 'A2', ordinal: 2, skipIf: { context: ['value-creation'] } },
          { text: 'A3', ordinal: 3 },
        ],
      },
      {
        number: '02',
        title: 'Architecture',
        canonicalBulletCount: 2,
        bullets: [
          { text: 'B1', ordinal: 1 },
          { text: 'B2', ordinal: 2 },
        ],
      },
      {
        number: '08',
        title: 'Corporate IT',
        canonicalBulletCount: 1,
        skipIf: { context: ['sell-side'] },
        bullets: [{ text: 'C1', ordinal: 1 }],
      },
    ],
  };
}

describe('applyDirectives', () => {
  it('returns the same reference when no dims are supplied', () => {
    const article = parsedFixture();
    expect(applyDirectives(article)).toBe(article);
    expect(applyDirectives(article, {})).toBe(article);
  });

  it('returns the same reference when no tag matches the supplied context', () => {
    const article = parsedFixture();
    expect(applyDirectives(article, { context: 'buy-side' })).toBe(article);
  });

  it("the 'unknown' sentinel matches nothing", () => {
    const article = parsedFixture();
    expect(applyDirectives(article, { context: 'unknown' })).toBe(article);
  });

  it('removes a tagged bullet when its context fires', () => {
    const result = applyDirectives(parsedFixture(), { context: 'value-creation' });
    const basics = result.sections.find((s) => s.number === '00');
    expect(basics?.bullets.map((b) => b.text)).toEqual(['A1', 'A3']);
    expect(basics?.bullets.map((b) => b.ordinal)).toEqual([1, 3]); // gap preserved
  });

  it('removes a tagged section when its context fires', () => {
    const result = applyDirectives(parsedFixture(), { context: 'sell-side' });
    expect(result.sections.map((s) => s.number)).toEqual(['00', '02']);
  });

  it('does not mutate the input', () => {
    const article = parsedFixture();
    applyDirectives(article, { context: 'value-creation' });
    expect(article.sections[0].bullets).toHaveLength(3);
  });
});

describe('excludeBullets', () => {
  it('returns the same reference on undefined / empty keys', () => {
    const article = parsedFixture();
    expect(excludeBullets(article, undefined)).toBe(article);
    expect(excludeBullets(article, [])).toBe(article);
  });

  it('removes by NN-II key, preserving other bullets and their ordinals', () => {
    const result = excludeBullets(parsedFixture(), ['00-02']);
    const basics = result.sections.find((s) => s.number === '00');
    expect(basics?.bullets.map((b) => b.text)).toEqual(['A1', 'A3']);
    expect(basics?.bullets.map((b) => b.ordinal)).toEqual([1, 3]);
  });

  it('ignores unknown and malformed keys', () => {
    const article = parsedFixture();
    const result = excludeBullets(article, ['77-01', 'banana', '00-99']);
    expect(result).toBe(article);
  });

  it('does NOT drop a section emptied by exclusion (drop happens in compose stage 5)', () => {
    const result = excludeBullets(parsedFixture(), ['08-01']);
    const corpIt = result.sections.find((s) => s.number === '08');
    expect(corpIt).toBeDefined();
    expect(corpIt?.bullets).toHaveLength(0);
  });

  it('does not mutate the input', () => {
    const article = parsedFixture();
    excludeBullets(article, ['00-01']);
    expect(article.sections[0].bullets).toHaveLength(3);
  });

  it('dense fallback: ordinal-less articles match keys by live position', () => {
    // Synthetic ASTs without ordinals remove-and-renumber (keys match i+1;
    // render falls back to the dense counter). Documented as intended —
    // parser-produced articles always carry ordinals.
    const result = excludeBullets(fixture(), ['00-01']);
    const basics = result.sections.find((s) => s.number === '00');
    expect(basics?.bullets.map((b) => b.text)).toEqual(['A1']);
  });
});

describe('customizeIrlArticle — five-stage compose', () => {
  it('directive removal fires before manual controls', () => {
    const result = customizeIrlArticle(parsedFixture(), {
      context: 'value-creation',
      excludeRequests: ['00-01'],
    });
    const basics = result.sections.find((s) => s.number === '00');
    // A2 removed by directive, A1 removed by key → only A3 (ordinal 3) survives.
    expect(basics?.bullets.map((b) => b.text)).toEqual(['A3']);
    expect(basics?.bullets.map((b) => b.ordinal)).toEqual([3]);
  });

  it('an exclusion key can never hit a custom request (customs added after exclusion)', () => {
    const result = customizeIrlArticle(parsedFixture(), {
      // Section 02 has canonicalBulletCount 2 → the custom becomes ordinal 3
      // (key 02-03). Excluding 02-03 must NOT delete the custom.
      excludeRequests: ['02-03'],
      customRequests: [{ section: '02', text: 'Bespoke ask' }],
    });
    const arch = result.sections.find((s) => s.number === '02');
    expect(arch?.bullets.map((b) => b.text)).toEqual(['B1', 'B2', 'Bespoke ask']);
    expect(arch?.bullets.at(-1)?.ordinal).toBe(3);
  });

  it('a custom request keeps an exclusion-emptied section alive (drop-last)', () => {
    const result = customizeIrlArticle(parsedFixture(), {
      excludeRequests: ['08-01'],
      customRequests: [{ section: '08', text: 'Custom on emptied section' }],
    });
    const corpIt = result.sections.find((s) => s.number === '08');
    expect(corpIt?.bullets.map((b) => b.text)).toEqual(['Custom on emptied section']);
    // Ordinal continues from the CANONICAL count, not the surviving count.
    expect(corpIt?.bullets[0].ordinal).toBe(2);
  });

  it('a section emptied by removal WITHOUT a custom is dropped', () => {
    const result = customizeIrlArticle(parsedFixture(), {
      excludeRequests: ['08-01'],
    });
    expect(result.sections.map((s) => s.number)).toEqual(['00', '02']);
  });

  it('custom ordinals continue from canonicalBulletCount despite exclusions', () => {
    const result = customizeIrlArticle(parsedFixture(), {
      // Exclude the LAST canonical bullet of 00 (ordinal 3); the custom must
      // still be ordinal 4, not reuse 3.
      excludeRequests: ['00-03'],
      customRequests: [{ section: '00', text: 'Next up' }],
    });
    const basics = result.sections.find((s) => s.number === '00');
    expect(basics?.bullets.map((b) => b.ordinal)).toEqual([1, 2, 4]);
  });

  it('an exclusion key under a filtered-out section is ignored', () => {
    const result = customizeIrlArticle(parsedFixture(), {
      includeSections: ['00'],
      excludeRequests: ['02-01'],
    });
    expect(result.sections.map((s) => s.number)).toEqual(['00']);
    expect(result.sections[0].bullets).toHaveLength(3);
  });
});
