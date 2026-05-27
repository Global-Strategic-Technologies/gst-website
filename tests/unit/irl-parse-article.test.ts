/**
 * Unit tests for the IRL article parser (BL-044 Phase 1).
 *
 * The parser is the single ingest point for the canonical
 * `src/data/library/information-request-list/article.md` markdown. Every
 * downstream surface (XLSX generator, MCP tool, future DOCX/PDF emitters)
 * consumes the `IRLArticle` AST it produces — so a regression here
 * silently corrupts every downstream artifact. The grammar is small and
 * stable; tests pin every error branch + the happy path.
 *
 * Behavior over implementation per TEST_BEST_PRACTICES § 1: tests assert
 * on the user-visible AST shape and the operator-facing error messages,
 * not on the parser's intermediate state.
 */

import { parseIrlArticle } from '../../src/utils/irl/parse-article';

const MINIMAL_ARTICLE = `# Information Request List

Intro paragraph describing the IRL.

## 00 — Basics

- First bullet.
- Second bullet.
`;

describe('parseIrlArticle — happy path', () => {
  it('parses the minimal valid article into the AST shape', () => {
    const article = parseIrlArticle(MINIMAL_ARTICLE);
    expect(article.title).toBe('Information Request List');
    expect(article.intro).toBe('Intro paragraph describing the IRL.');
    expect(article.sections).toHaveLength(1);
    expect(article.sections[0]).toMatchObject({
      number: '00',
      title: 'Basics',
      bullets: [{ text: 'First bullet.' }, { text: 'Second bullet.' }],
    });
    expect(article.footer).toBeUndefined();
  });

  it('parses multiple sections in order', () => {
    const body = `# IRL

Intro.

## 00 — Basics

- A.

## 01 — Product

- B.
- C.

## 09 — Governance

- D.
`;
    const article = parseIrlArticle(body);
    expect(article.sections.map((s) => s.number)).toEqual(['00', '01', '09']);
    expect(article.sections.map((s) => s.bullets.length)).toEqual([1, 2, 1]);
  });

  it('captures a section intro that appears before the first bullet', () => {
    const body = `# IRL

Intro.

## 00 — Basics

Per-section context paragraph.

- First bullet.
`;
    const article = parseIrlArticle(body);
    expect(article.sections[0].intro).toBe('Per-section context paragraph.');
    expect(article.sections[0].bullets).toEqual([{ text: 'First bullet.' }]);
  });

  it('omits the section intro field when no per-section prose exists', () => {
    const article = parseIrlArticle(MINIMAL_ARTICLE);
    expect(article.sections[0]).not.toHaveProperty('intro');
  });

  it('captures a footer that follows a horizontal rule', () => {
    const body = `# IRL

Intro.

## 00 — Basics

- A.

---

_Last updated: 2026-05-22._
`;
    const article = parseIrlArticle(body);
    expect(article.footer).toBe('_Last updated: 2026-05-22._');
  });

  it('omits the footer field when there is no rule', () => {
    const article = parseIrlArticle(MINIMAL_ARTICLE);
    expect(article.footer).toBeUndefined();
  });

  it('strips a leading UTF-8 BOM', () => {
    const BOM = String.fromCharCode(0xfeff);
    const article = parseIrlArticle(BOM + MINIMAL_ARTICLE);
    expect(article.title).toBe('Information Request List');
  });

  it('handles CRLF line endings', () => {
    const article = parseIrlArticle(MINIMAL_ARTICLE.replace(/\n/g, '\r\n'));
    expect(article.title).toBe('Information Request List');
    expect(article.sections[0].bullets).toHaveLength(2);
  });

  it('strips trailing whitespace from each line', () => {
    const body = `# IRL

Intro.

## 00 — Basics

- Trailing tabs and spaces.\t\t
`;
    const article = parseIrlArticle(body);
    expect(article.title).toBe('IRL');
    expect(article.sections[0].bullets[0].text).toBe('Trailing tabs and spaces.');
  });

  it('preserves a multi-paragraph intro by collapsing the surrounding blanks only', () => {
    const body = `# IRL

First paragraph.

Second paragraph.

## 00 — Basics

- A.
`;
    const article = parseIrlArticle(body);
    expect(article.intro).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('produces a parsed footer that omits trailing blank lines from the source', () => {
    const body = `# IRL

Intro.

## 00 — Basics

- A.

---

Footer line.


`;
    const article = parseIrlArticle(body);
    expect(article.footer).toBe('Footer line.');
  });
});

describe('parseIrlArticle — error paths (every throw branch)', () => {
  it('throws "no H1 title found" when input has no H1, no H2, no bullets, no rule (pure prose)', () => {
    // Pure-prose input has nothing for the in-loop branches to throw on,
    // so the end-of-parse `title === null` check fires. This is the only
    // reachable shape for the "no H1" throw — H2-before-H1 throws earlier
    // via the section-before-title check; the "no H1" throw guards
    // against silently-empty inputs reaching the section-count check.
    expect(() => parseIrlArticle('some prose with no heading\n')).toThrow(/no H1 title found/);
  });

  it('throws "section heading before H1" when H2 precedes any H1', () => {
    expect(() => parseIrlArticle('## 00 — Basics\n\n- A.\n')).toThrow(
      /section heading .* appeared before the H1 title/
    );
  });

  it('throws when a second H1 appears', () => {
    const body = `# First

Intro.

## 00 — Basics

- A.

# Second
`;
    expect(() => parseIrlArticle(body)).toThrow(/multiple H1 headings/);
  });

  it('throws when no sections exist', () => {
    expect(() => parseIrlArticle('# IRL\n\nIntro paragraph only.\n')).toThrow(/no sections found/);
  });

  it('throws when the top-of-file intro is missing', () => {
    const body = `# IRL

## 00 — Basics

- A.
`;
    expect(() => parseIrlArticle(body)).toThrow(/no top-of-file intro paragraph found/);
  });

  it('throws when a section heading appears before the H1', () => {
    const body = `## 00 — Basics

# IRL

Intro.

- A.
`;
    expect(() => parseIrlArticle(body)).toThrow(/appeared before the H1 title/);
  });

  it('throws when a section has zero bullets', () => {
    const body = `# IRL

Intro.

## 00 — Basics

## 01 — Product

- A.
`;
    expect(() => parseIrlArticle(body)).toThrow(/section 00 \(Basics\) has zero bullets/);
  });

  it('throws when a bullet appears outside any section', () => {
    const body = `# IRL

Intro.

- Loose bullet with no section.

## 00 — Basics

- A.
`;
    // The loose bullet is parsed as intro prose, but if it parses as a
    // bullet (matches "- " prefix), it should fail since there's no current
    // section. The parser treats "- text" before any H2 as a bullet.
    expect(() => parseIrlArticle(body)).toThrow(/appeared outside any section/);
  });

  it('throws when prose appears after bullets within a section', () => {
    const body = `# IRL

Intro.

## 00 — Basics

- A.

This prose comes AFTER bullets and should reject.

- B.
`;
    expect(() => parseIrlArticle(body)).toThrow(/appeared after bullets in section 00/);
  });
});

describe('parseIrlArticle — grammar edge cases', () => {
  it('treats `---` (three hyphens) as the rule delimiter', () => {
    const body = `# IRL\n\nIntro.\n\n## 00 — Basics\n\n- A.\n\n---\n\nFooter.\n`;
    const article = parseIrlArticle(body);
    expect(article.footer).toBe('Footer.');
  });

  it('treats `------` (more than three hyphens) as the rule delimiter', () => {
    const body = `# IRL\n\nIntro.\n\n## 00 — Basics\n\n- A.\n\n------\n\nFooter.\n`;
    const article = parseIrlArticle(body);
    expect(article.footer).toBe('Footer.');
  });

  it('does NOT treat `-- ` (two-hyphen-space) as a rule', () => {
    // Lines matching neither H1/H2/bullet/rule that appear after bullets
    // throw. This pins that the rule regex is `^---+$`, not `^-+$`.
    const body = `# IRL\n\nIntro.\n\n## 00 — Basics\n\n- A.\n\n--\n\nFooter.\n`;
    expect(() => parseIrlArticle(body)).toThrow(/appeared after bullets/);
  });

  it('requires the H2 em-dash separator (U+2014) — rejects an ASCII hyphen', () => {
    // Em-dash is part of the canonical grammar so the article and its
    // generators stay aligned on the literal character. An ASCII hyphen
    // fails the H2 pattern; the `## 00 - Basics` line is then treated as
    // top-of-file prose, and the subsequent `- A.` bullet has no section
    // to attach to → "bullet appeared outside any section." Pinning that
    // behavior catches a future regression that might silently accept the
    // ASCII variant.
    const body = `# IRL\n\nIntro.\n\n## 00 - Basics\n\n- A.\n`;
    expect(() => parseIrlArticle(body)).toThrow(/appeared outside any section/);
  });

  it('requires exactly two-digit section numbers', () => {
    // Single-digit heading fails the `\d{2}` constraint → treated as
    // prose → subsequent bullet has no section → "outside any section."
    const body = `# IRL\n\nIntro.\n\n## 0 — Basics\n\n- A.\n`;
    expect(() => parseIrlArticle(body)).toThrow(/appeared outside any section/);
  });

  it('treats a whitespace-only line as blank (no section-prose rejection)', () => {
    const body = `# IRL\n\nIntro.\n\n## 00 — Basics\n\nSection intro.\n   \n- A.\n`;
    const article = parseIrlArticle(body);
    expect(article.sections[0].intro).toBe('Section intro.');
    expect(article.sections[0].bullets).toEqual([{ text: 'A.' }]);
  });
});
