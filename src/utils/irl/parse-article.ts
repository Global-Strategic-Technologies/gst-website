/**
 * Parses the canonical IRL article markdown into the structured
 * {@link IRLArticle} AST consumed by every downstream surface (XLSX
 * generator, MCP tool, future DOCX/PDF emitters, post-v1 filter engine).
 *
 * Deliberately uses no markdown library — the article shape is small,
 * stable, and authored by GST. A hand-written line-mode parser keeps
 * the dependency surface minimal (the same Workers runtime constraint
 * that drove the `@e965/xlsx` choice) and yields precise error messages.
 *
 * **Grammar accepted** (mirrors `src/data/library/information-request-list/article.md`):
 *
 *   article    := h1 blank+ intro blank+ section+ (blank* rule blank* footer)?
 *   h1         := `# ` text
 *   intro      := paragraph (one or more non-blank lines)
 *   section    := h2 blank+ (intro blank+)? bullet+
 *   h2         := `## ` two-digit-number ` ` em-dash ` ` text
 *   bullet     := `- ` text
 *   rule       := `---` (three or more hyphens, nothing else)
 *   footer     := remaining lines verbatim, trimmed
 *
 * Lines with only whitespace are treated as blank. Trailing whitespace on
 * any line is stripped. UTF-8 BOM at file start is stripped.
 */

import type { IRLArticle, IRLBullet, IRLSection } from './types';

const H1_PATTERN = /^# (.+)$/;
// Em-dash (U+2014) with single spaces around. Section numbers are exactly two ASCII digits.
const H2_PATTERN = /^## (\d{2}) — (.+)$/;
const BULLET_PATTERN = /^- (.+)$/;
const RULE_PATTERN = /^---+$/;

interface SectionAcc {
  readonly number: string;
  readonly title: string;
  introLines: string[];
  bullets: IRLBullet[];
}

function finalizeSection(acc: SectionAcc): IRLSection {
  const intro = collapseBlock(acc.introLines);
  const section: IRLSection = {
    number: acc.number,
    title: acc.title,
    bullets: acc.bullets,
    ...(intro ? { intro } : {}),
  };
  if (acc.bullets.length === 0) {
    throw new Error(
      `IRL parse error: section ${acc.number} (${acc.title}) has zero bullets — every section must contain at least one bullet.`
    );
  }
  return section;
}

function collapseBlock(lines: readonly string[]): string {
  // Trim leading/trailing blank lines, preserve interior blanks (paragraph breaks).
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end).join('\n');
}

export function parseIrlArticle(body: string): IRLArticle {
  // Strip a leading UTF-8 BOM. Constructing the codepoint via
  // `String.fromCharCode(0xfeff)` keeps the literal char out of the source
  // file (ESLint's no-irregular-whitespace rule flags it in regex literals).
  const BOM = String.fromCharCode(0xfeff);
  const stripped = body.startsWith(BOM) ? body.slice(1) : body;
  const lines = stripped.split(/\r?\n/).map((line) => line.replace(/\s+$/, ''));

  let title: string | null = null;
  const introLines: string[] = [];
  const sections: IRLSection[] = [];
  let current: SectionAcc | null = null;
  let seenRule = false;
  const footerLines: string[] = [];

  for (const line of lines) {
    if (seenRule) {
      footerLines.push(line);
      continue;
    }

    const h1Match = H1_PATTERN.exec(line);
    if (h1Match) {
      if (title !== null) {
        throw new Error(
          `IRL parse error: multiple H1 headings found ("${title}" and "${h1Match[1]}"). The article must have exactly one H1.`
        );
      }
      title = h1Match[1];
      continue;
    }

    const h2Match = H2_PATTERN.exec(line);
    if (h2Match) {
      if (title === null) {
        throw new Error(`IRL parse error: section heading "${line}" appeared before the H1 title.`);
      }
      if (current) {
        sections.push(finalizeSection(current));
      }
      current = {
        number: h2Match[1],
        title: h2Match[2],
        introLines: [],
        bullets: [],
      };
      continue;
    }

    if (RULE_PATTERN.test(line)) {
      if (current) {
        sections.push(finalizeSection(current));
        current = null;
      }
      seenRule = true;
      continue;
    }

    const bulletMatch = BULLET_PATTERN.exec(line);
    if (bulletMatch) {
      if (!current) {
        throw new Error(
          `IRL parse error: bullet "- ${bulletMatch[1]}" appeared outside any section.`
        );
      }
      current.bullets.push({ text: bulletMatch[1] });
      continue;
    }

    // Non-empty, non-heading, non-bullet, non-rule line — prose.
    if (!current) {
      introLines.push(line);
    } else if (current.bullets.length === 0) {
      current.introLines.push(line);
    } else if (line.trim() !== '') {
      // Prose AFTER bullets in a section is not part of the v1 grammar.
      // Reject explicitly so a future authoring mistake surfaces loudly
      // rather than silently dropping content.
      throw new Error(
        `IRL parse error: prose line "${line}" appeared after bullets in section ${current.number}. Per-section prose must precede the first bullet.`
      );
    }
  }

  if (current) {
    sections.push(finalizeSection(current));
  }

  if (title === null) {
    throw new Error('IRL parse error: no H1 title found.');
  }
  if (sections.length === 0) {
    throw new Error('IRL parse error: no sections found.');
  }

  const intro = collapseBlock(introLines);
  if (intro === '') {
    throw new Error(
      'IRL parse error: no top-of-file intro paragraph found between the H1 and the first section.'
    );
  }

  const footer = collapseBlock(footerLines);

  return {
    title,
    intro,
    sections,
    ...(footer ? { footer } : {}),
  };
}
