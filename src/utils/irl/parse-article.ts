/**
 * Parses the IRL generator-source markdown into the structured
 * {@link IRLArticle} AST consumed by every downstream surface (XLSX
 * generator, MCP tools, Hub generator page, directive filter engine).
 *
 * Deliberately uses no markdown library — the article shape is small,
 * stable, and authored by GST. A hand-written line-mode parser keeps
 * the dependency surface minimal (the same Workers runtime constraint
 * that drove the `xlsx-js-style` choice) and yields precise error messages.
 *
 * **Grammar accepted** (mirrors `src/data/irl/information-request-list.md`):
 *
 *   article    := h1 blank+ intro blank+ section+ (blank* rule blank* footer)?
 *   h1         := `# ` text
 *   intro      := paragraph (one or more non-blank lines)
 *   section    := h2 blank+ (intro blank+)? (directive* bullet)+
 *   h2         := (directive blank*)? `## ` two-digit-number ` ` em-dash ` ` text
 *   bullet     := `- ` text
 *   directive  := `<!-- skip-if: <dim>=<v1>[,<v2>…] -->`   (own line, fully closed)
 *   rule       := `---` (three or more hyphens, nothing else)
 *   footer     := remaining lines verbatim, trimmed
 *
 * **Directive rules** (BL-044.5):
 *   - A directive applies to the NEXT non-blank line, which MUST be a `- `
 *     bullet or a `## ` section heading. Blank lines between the directive
 *     and its target are transparent (so `directive / blank / ## NN` — the
 *     natural section-skip authoring position — is legal). Any other next
 *     line (prose, `---`, H1, EOF) is a parse error.
 *   - Dimension names and values are validated against
 *     {@link IRL_DIRECTIVE_DIMENSIONS}; unknown ones are parse errors.
 *   - Consecutive directive lines merge onto the same target; repeating a
 *     dimension before one target is a parse error.
 *   - ANY line starting with `<!--` that is not a fully-closed, valid
 *     single-line skip-if directive is a parse error — including in the
 *     footer. The source is machine-parsed; typos (`skipif:`), unterminated
 *     comments, and freeform annotations must fail loudly rather than be
 *     silently absorbed as prose.
 *
 * Each bullet is stamped with its 1-based `ordinal` (position as authored)
 * and each section with its `canonicalBulletCount` — the substrate for
 * gap-preserving Reference IDs under per-question removal.
 *
 * Lines with only whitespace are treated as blank. Trailing whitespace on
 * any line is stripped. UTF-8 BOM at file start is stripped.
 */

import type { IRLArticle, IRLBullet, IRLSection, IRLSkipIf } from './types';

const H1_PATTERN = /^# (.+)$/;
// Em-dash (U+2014) with single spaces around. Section numbers are exactly two ASCII digits.
const H2_PATTERN = /^## (\d{2}) — (.+)$/;
const BULLET_PATTERN = /^- (.+)$/;
const RULE_PATTERN = /^---+$/;
// A fully-closed, single-line skip-if directive. Anything else starting with
// `<!--` is rejected (see COMMENT_GATE below).
const DIRECTIVE_PATTERN = /^<!--\s*skip-if:\s*([A-Za-z][\w-]*)\s*=\s*(.+?)\s*-->$/;
const COMMENT_GATE = /^<!--/;

/**
 * Directive dimension registry — the single source of truth for which
 * `skip-if` dimensions exist and which values each accepts. The parser
 * rejects anything not listed here, keeping the tag taxonomy disciplined
 * (BL-044.5 authoring rule).
 *
 * Extending: add the dimension + values here, then follow the extension
 * checklist in `src/data/irl/README.md` — a new dimension also needs a
 * structured arg on the MCP tool + prompt, a Hub form control + deeplink
 * param, and test coverage.
 */
export const IRL_DIRECTIVE_DIMENSIONS: Readonly<Record<string, readonly string[]>> = {
  context: ['sell-side', 'buy-side', 'value-creation'],
};

interface SectionAcc {
  readonly number: string;
  readonly title: string;
  readonly skipIf?: IRLSkipIf;
  introLines: string[];
  bullets: IRLBullet[];
}

function finalizeSection(acc: SectionAcc): IRLSection {
  const intro = collapseBlock(acc.introLines);
  const section: IRLSection = {
    number: acc.number,
    title: acc.title,
    bullets: acc.bullets,
    canonicalBulletCount: acc.bullets.length,
    ...(intro ? { intro } : {}),
    ...(acc.skipIf ? { skipIf: acc.skipIf } : {}),
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

/** Parse + registry-validate one directive line; returns `{ dim, values }`. */
function parseDirectiveLine(line: string): { dim: string; values: readonly string[] } {
  const match = DIRECTIVE_PATTERN.exec(line);
  if (!match) {
    throw new Error(
      `IRL parse error: malformed or unknown directive comment "${line}". The only supported form is a fully-closed single-line \`<!-- skip-if: <dimension>=<value>[,<value>…] -->\`.`
    );
  }
  const dim = match[1];
  const allowed = IRL_DIRECTIVE_DIMENSIONS[dim];
  if (!allowed) {
    throw new Error(
      `IRL parse error: unknown directive dimension "${dim}" in "${line}". Registered dimensions: ${Object.keys(IRL_DIRECTIVE_DIMENSIONS).join(', ')}.`
    );
  }
  const values = match[2]
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error(`IRL parse error: directive "${line}" has no values.`);
  }
  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new Error(
        `IRL parse error: unknown value "${value}" for directive dimension "${dim}" in "${line}". Allowed values: ${allowed.join(', ')}.`
      );
    }
  }
  return { dim, values };
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
  // Directive(s) awaiting their target (the next non-blank bullet or H2).
  let pendingSkipIf: Record<string, readonly string[]> | null = null;

  /** Error helper for a pending directive meeting an illegal target. */
  function rejectPendingTarget(what: string): never {
    throw new Error(
      `IRL parse error: a skip-if directive must immediately precede a bullet or a section heading (blank lines allowed), but was followed by ${what}.`
    );
  }

  for (const line of lines) {
    // Comment gate — runs before every other branch (including the footer)
    // so comment discipline is uniform across the whole document.
    if (COMMENT_GATE.test(line)) {
      const { dim, values } = parseDirectiveLine(line);
      if (pendingSkipIf && dim in pendingSkipIf) {
        throw new Error(
          `IRL parse error: dimension "${dim}" appears twice in consecutive directives before one target. Merge the values into a single skip-if.`
        );
      }
      pendingSkipIf = { ...(pendingSkipIf ?? {}), [dim]: values };
      continue;
    }

    if (seenRule) {
      footerLines.push(line);
      continue;
    }

    // Blank lines are transparent to a pending directive.
    if (line.trim() === '' && pendingSkipIf) {
      continue;
    }

    const h1Match = H1_PATTERN.exec(line);
    if (h1Match) {
      if (pendingSkipIf) rejectPendingTarget(`the H1 heading "${line}"`);
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
        ...(pendingSkipIf ? { skipIf: pendingSkipIf } : {}),
      };
      pendingSkipIf = null;
      continue;
    }

    if (RULE_PATTERN.test(line)) {
      if (pendingSkipIf) rejectPendingTarget('the horizontal rule');
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
      current.bullets.push({
        text: bulletMatch[1],
        ordinal: current.bullets.length + 1,
        ...(pendingSkipIf ? { skipIf: pendingSkipIf } : {}),
      });
      pendingSkipIf = null;
      continue;
    }

    // Non-empty, non-heading, non-bullet, non-rule line — prose.
    if (pendingSkipIf && line.trim() !== '') {
      rejectPendingTarget(`the prose line "${line}"`);
    }
    if (!current) {
      introLines.push(line);
    } else if (current.bullets.length === 0) {
      current.introLines.push(line);
    } else if (line.trim() !== '') {
      // Prose AFTER bullets in a section is not part of the grammar.
      // Reject explicitly so a future authoring mistake surfaces loudly
      // rather than silently dropping content.
      throw new Error(
        `IRL parse error: prose line "${line}" appeared after bullets in section ${current.number}. Per-section prose must precede the first bullet.`
      );
    }
  }

  if (pendingSkipIf) rejectPendingTarget('the end of the document');

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
