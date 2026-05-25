/**
 * Regression guard for the IRL article parser AND the canonical
 * `src/data/library/information-request-list/article.md` structure.
 *
 * A failure here means one of two things changed:
 *   1. The parser shape, OR
 *   2. The shipped article's section/bullet counts or grammar.
 *
 * Either is intentional sometimes — when so, update the expected counts
 * below and re-capture the BL-044 XLSX golden snapshot.
 */

import { describe, it, expect } from 'vitest';
import { parseIrlArticle } from '../../../../src/utils/irl/parse-article';
import { loadLibraryByUri } from '../../../src/content/library-loader';

const IRL_URI = 'gst://library/information-request-list';

/** Lock the current article shape — every entry is a hard regression assertion. */
const EXPECTED_SECTIONS: ReadonlyArray<{
  number: string;
  titlePrefix: string;
  bulletCount: number;
}> = [
  { number: '00', titlePrefix: 'Basics', bulletCount: 10 },
  { number: '01', titlePrefix: 'Product', bulletCount: 7 },
  { number: '02', titlePrefix: 'Software Architecture', bulletCount: 8 },
  { number: '03', titlePrefix: 'Infrastructure', bulletCount: 8 },
  { number: '04', titlePrefix: 'SDLC', bulletCount: 9 },
  { number: '05', titlePrefix: 'Data', bulletCount: 5 },
  { number: '06', titlePrefix: 'Security', bulletCount: 5 },
  { number: '07', titlePrefix: 'People', bulletCount: 7 },
  { number: '08', titlePrefix: 'Corporate IT', bulletCount: 3 },
  { number: '09', titlePrefix: 'Governance', bulletCount: 5 },
];

const EXPECTED_TOTAL_BULLETS = EXPECTED_SECTIONS.reduce((sum, s) => sum + s.bulletCount, 0);

describe('parseIrlArticle — canonical article regression', () => {
  const entry = loadLibraryByUri(IRL_URI);
  if (!entry) throw new Error(`Library entry not found for ${IRL_URI}`);
  const article = parseIrlArticle(entry.body);

  it('parses the canonical article without throwing', () => {
    expect(article).toBeDefined();
  });

  it('extracts the H1 title', () => {
    expect(article.title).toBe('Information Request List');
  });

  it('captures a non-empty top-of-file intro paragraph', () => {
    expect(article.intro.length).toBeGreaterThan(20);
    expect(article.intro).toMatch(/answer/i);
  });

  it(`returns exactly ${EXPECTED_SECTIONS.length} sections`, () => {
    expect(article.sections).toHaveLength(EXPECTED_SECTIONS.length);
  });

  it('section numbers are zero-padded 00..09 in order', () => {
    expect(article.sections.map((s) => s.number)).toEqual(EXPECTED_SECTIONS.map((s) => s.number));
  });

  it('every section title starts with the expected prefix', () => {
    article.sections.forEach((section, i) => {
      const expected = EXPECTED_SECTIONS[i];
      expect(section.title).toMatch(new RegExp(`^${expected.titlePrefix}`, 'i'));
    });
  });

  it('every section has the expected bullet count', () => {
    article.sections.forEach((section, i) => {
      const expected = EXPECTED_SECTIONS[i];
      expect(section.bullets.length, `section ${section.number} (${section.title})`).toBe(
        expected.bulletCount
      );
    });
  });

  it(`total bullet count across all sections is ${EXPECTED_TOTAL_BULLETS}`, () => {
    const total = article.sections.reduce((sum, s) => sum + s.bullets.length, 0);
    expect(total).toBe(EXPECTED_TOTAL_BULLETS);
  });

  it('captures the trailing footer line', () => {
    expect(article.footer).toBeDefined();
    expect(article.footer).toMatch(/Last updated/);
  });

  it('no section has an undefined intro today (none uses per-section prose in v1)', () => {
    article.sections.forEach((section) => {
      expect(section.intro).toBeUndefined();
    });
  });

  it('every bullet text is non-empty and trimmed', () => {
    for (const section of article.sections) {
      for (const bullet of section.bullets) {
        expect(bullet.text.length).toBeGreaterThan(0);
        expect(bullet.text).toBe(bullet.text.trim());
      }
    }
  });
});

describe('parseIrlArticle — grammar acceptance', () => {
  const VALID = [
    '# Test Article',
    '',
    'Intro paragraph one.',
    '',
    '## 00 — Alpha',
    '',
    '- First',
    '- Second',
    '',
    '## 01 — Beta',
    '',
    '- Only',
    '',
    '---',
    '',
    '_Trailing._',
  ].join('\n');

  it('parses a minimal valid article', () => {
    const a = parseIrlArticle(VALID);
    expect(a.title).toBe('Test Article');
    expect(a.intro).toBe('Intro paragraph one.');
    expect(a.sections).toHaveLength(2);
    expect(a.sections[0]).toMatchObject({ number: '00', title: 'Alpha' });
    expect(a.sections[0].bullets).toEqual([{ text: 'First' }, { text: 'Second' }]);
    expect(a.sections[1]).toMatchObject({ number: '01', title: 'Beta' });
    expect(a.footer).toBe('_Trailing._');
  });

  it('accepts CRLF line endings', () => {
    const a = parseIrlArticle(VALID.replace(/\n/g, '\r\n'));
    expect(a.sections).toHaveLength(2);
  });

  it('strips a leading UTF-8 BOM', () => {
    const a = parseIrlArticle('﻿' + VALID);
    expect(a.title).toBe('Test Article');
  });

  it('strips trailing whitespace on each line', () => {
    const padded = VALID.split('\n')
      .map((line) => line + '   ')
      .join('\n');
    const a = parseIrlArticle(padded);
    expect(a.sections[0].bullets[0].text).toBe('First');
  });

  it('preserves bullet text verbatim including punctuation, brackets, and inline markdown', () => {
    const a = parseIrlArticle(
      [
        '# X',
        '',
        'I',
        '',
        '## 00 — S',
        '',
        '- Foo (bar): baz; **bold** + _ital_ + `code`',
        '- Another one — with em-dash',
      ].join('\n')
    );
    expect(a.sections[0].bullets[0].text).toBe('Foo (bar): baz; **bold** + _ital_ + `code`');
    expect(a.sections[0].bullets[1].text).toBe('Another one — with em-dash');
  });

  it('captures per-section intro prose when present (forward-compat path)', () => {
    const a = parseIrlArticle(
      [
        '# X',
        '',
        'I',
        '',
        '## 00 — S',
        '',
        'Per-section intro prose line one.',
        'Line two of same intro.',
        '',
        '- Bullet',
      ].join('\n')
    );
    expect(a.sections[0].intro).toBe('Per-section intro prose line one.\nLine two of same intro.');
  });

  it('makes footer optional', () => {
    const noFooter = VALID.split('\n').slice(0, -3).join('\n');
    const a = parseIrlArticle(noFooter);
    expect(a.footer).toBeUndefined();
  });
});

describe('parseIrlArticle — error reporting', () => {
  it('throws when there is no H1', () => {
    // Validation order: section heading hit before "no H1" check, so the
    // operator sees the "before the H1" message — clearer for that case.
    expect(() => parseIrlArticle(['Intro.', '', '## 00 — S', '', '- B'].join('\n'))).toThrow(
      /before the H1/i
    );
  });

  it('throws when the article ends with intro only (truly H1-less is impossible)', () => {
    expect(() => parseIrlArticle(['Intro only, no H1 ever.'].join('\n'))).toThrow(/no H1 title/i);
  });

  it('throws when there are no sections', () => {
    expect(() => parseIrlArticle(['# T', '', 'Intro only.'].join('\n'))).toThrow(
      /no sections found/i
    );
  });

  it('throws when there is no intro paragraph', () => {
    expect(() => parseIrlArticle(['# T', '', '## 00 — S', '', '- B'].join('\n'))).toThrow(
      /no top-of-file intro/i
    );
  });

  it('throws on a bullet appearing before the first section', () => {
    expect(() =>
      parseIrlArticle(['# T', '', 'Intro.', '', '- Stray', '', '## 00 — S', '', '- B'].join('\n'))
    ).toThrow(/outside any section/i);
  });

  it('throws when a section has zero bullets', () => {
    expect(() =>
      parseIrlArticle(
        ['# T', '', 'I', '', '## 00 — Empty', '', '## 01 — Other', '', '- B'].join('\n')
      )
    ).toThrow(/zero bullets/i);
  });

  it('throws on a second H1', () => {
    expect(() =>
      parseIrlArticle(['# A', '', 'I', '', '# B', '', '## 00 — S', '', '- B'].join('\n'))
    ).toThrow(/multiple H1/i);
  });

  it('throws on a section heading before the H1', () => {
    expect(() => parseIrlArticle(['## 00 — S', '', '- B', '', '# T', '', 'I'].join('\n'))).toThrow(
      /appeared before the H1/i
    );
  });

  it('throws on prose appearing AFTER bullets within a section', () => {
    expect(() =>
      parseIrlArticle(['# T', '', 'I', '', '## 00 — S', '', '- B', '', 'Rogue prose.'].join('\n'))
    ).toThrow(/after bullets/i);
  });

  it('rejects a section heading with a non-em-dash separator', () => {
    // Hyphen-minus (U+002D) instead of em-dash (U+2014) is NOT accepted —
    // the malformed heading is treated as prose and the following bullet
    // surfaces as outside-any-section.
    expect(() => parseIrlArticle(['# T', '', 'I', '', '## 00 - S', '', '- B'].join('\n'))).toThrow(
      /outside any section/i
    );
  });

  it('rejects a section heading with a non-two-digit number', () => {
    expect(() => parseIrlArticle(['# T', '', 'I', '', '## 1 — S', '', '- B'].join('\n'))).toThrow(
      /outside any section/i
    );
  });
});
