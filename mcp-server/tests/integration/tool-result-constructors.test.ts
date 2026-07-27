/**
 * BL-090 — structural guard: tool results are built by the constructors, never
 * hand-rolled, and success captions are never a JSON dump.
 *
 * **Why this test exists.** Before BL-090 there were 34 result literals across 13
 * files in three different spellings, with `as unknown as Record<string, unknown>`
 * copy-pasted 16 times. That divergence is what let the two channels drift into
 * incoherence — success paths sent the payload twice while error paths had no
 * structured channel at all. Collapsing them into `toolOk` / `toolFail` fixes the
 * instances; this guard fixes the *class*, so the 35th literal cannot be added
 * silently. Same technique and rationale as
 * `radar-store-callers-breaker-gated.test.ts` (BL-091), which exists because that
 * defect class had already recurred twice.
 *
 * **What it proves and what it doesn't.** It is a source scan, so it proves shape
 * at the call site, not runtime behavior — `_result.test.ts` covers the
 * constructors themselves and the per-tool suites cover the payloads. It also
 * cannot see inside a caption that is assembled several lines above the call
 * (`generate-information-request-list-xlsx.ts` and `list-irl-requests.ts` both
 * pass a `summary` identifier); those two are covered by assertions in their own
 * test files. Don't over-trust the scan.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOOLS_DIR = join(__dirname, '..', '..', 'src', 'tools');

/** `_result.ts` necessarily contains the literal it exists to centralize. */
const EXEMPT = new Set(['_result.ts']);

function toolSources(): { file: string; source: string }[] {
  return readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !EXEMPT.has(f))
    .map((file) => ({ file, source: readFileSync(join(TOOLS_DIR, file), 'utf8') }));
}

/**
 * Blank out comments and string/template *contents*, keeping delimiters and all
 * code structure (including expressions inside `${…}`) intact.
 *
 * This has to be a state machine, not a set of regexes. The obvious regex
 * approach — strip `` /`[^`]*`/ `` — is actively dangerous here: every tool
 * module opens with a multi-KB `` const TOOL_DESCRIPTION = `…` `` template, and
 * a non-nesting regex mispairs its backticks against later ones and swallows the
 * real code in between. When this guard was first written that way it silently
 * saw ZERO `toolOk(` calls in five of thirteen modules, i.e. it would have passed
 * while checking nothing. Nested templates (`` `a${`b`}c` ``) break the naive
 * version too. The sanity-check assertions below exist to catch exactly this.
 */
function stripNonCode(source: string): string {
  const out: string[] = [];
  let i = 0;
  // Stack of template-literal nesting depths; `${}` inside a template returns to
  // code mode, and a nested template inside that pushes again.
  const templateStack: number[] = [];
  let braceDepth = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out.push(source.slice(i, stop).replace(/[^\n]/g, ' '));
      i = stop;
      continue;
    }
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out.push(' '.repeat(stop - i));
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out.push(quote);
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i++;
        i++;
      }
      out.push(quote);
      i++;
      continue;
    }
    if (ch === '`') {
      out.push('`');
      i++;
      templateStack.push(braceDepth);
      // Consume template chars until the closing backtick or a `${`.
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '`') {
          out.push('`');
          i++;
          templateStack.pop();
          break;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          out.push('${');
          i += 2;
          braceDepth++;
          break; // back to code mode — the expression is real code
        }
        if (source[i] === '\n') out.push('\n');
        i++;
      }
      continue;
    }
    if (ch === '{') braceDepth++;
    if (ch === '}') {
      braceDepth--;
      // Closing a `${…}` returns us to the enclosing template literal.
      if (templateStack.length > 0 && templateStack[templateStack.length - 1] === braceDepth) {
        out.push('}');
        i++;
        while (i < source.length) {
          if (source[i] === '\\') {
            i += 2;
            continue;
          }
          if (source[i] === '`') {
            out.push('`');
            i++;
            templateStack.pop();
            break;
          }
          if (source[i] === '$' && source[i + 1] === '{') {
            out.push('${');
            i += 2;
            braceDepth++;
            break;
          }
          if (source[i] === '\n') out.push('\n');
          i++;
        }
        continue;
      }
    }
    out.push(ch);
    i++;
  }
  return out.join('');
}

describe('BL-090 — no hand-rolled tool-result literals', () => {
  it('scans a non-trivial number of tool modules (guards against a broken glob)', () => {
    expect(toolSources().length).toBeGreaterThanOrEqual(10);
  });

  it('the scanner preserves code across the big TOOL_DESCRIPTION templates', () => {
    // Sanity check on stripNonCode itself. Every module that calls a constructor
    // must still show that call AFTER stripping — if a template-literal mispair
    // eats the code, every assertion below silently passes on nothing.
    for (const { file, source } of toolSources()) {
      const rawCalls = (source.match(/\btool(Ok|Fail)\s*\(/g) ?? []).length;
      const strippedCalls = (stripNonCode(source).match(/\btool(Ok|Fail)\s*\(/g) ?? []).length;
      expect(strippedCalls, `${file}: scanner lost constructor calls while stripping`).toBe(
        rawCalls
      );
    }
  });

  it('the scanner still blanks out prose that merely mentions the shapes', () => {
    const sample = [
      'const D = `docs mention content: [ and structuredContent: and isError: true`;',
      '// comment with content: [',
      'const real = { a: 1 };',
    ].join('\n');
    const stripped = stripNonCode(sample);
    expect(stripped).not.toMatch(/structuredContent\s*:/);
    expect(stripped).not.toMatch(/\bcontent\s*:\s*\[/);
    expect(stripped).toContain('const real =');
  });

  it('no tool module constructs a raw `content: [...]` result literal', () => {
    const offenders = toolSources()
      .filter(({ source }) => /\bcontent\s*:\s*\[/.test(stripNonCode(source)))
      .map(({ file }) => file);

    expect(
      offenders,
      `hand-rolled result literal — use toolOk()/toolFail() from ./_result`
    ).toEqual([]);
  });

  it('no tool module sets `structuredContent` directly', () => {
    const offenders = toolSources()
      .filter(({ source }) => /\bstructuredContent\s*:/.test(stripNonCode(source)))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('the `as unknown as Record<string, unknown>` cast survives in exactly one place', () => {
    const offenders = toolSources()
      .filter(({ source }) => /as unknown as Record<string,\s*unknown>/.test(stripNonCode(source)))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('no tool module sets `isError` outside the constructors', () => {
    const offenders = toolSources()
      .filter(({ source }) => /\bisError\s*:/.test(stripNonCode(source)))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});

describe('BL-090 — success captions are captions, not payloads', () => {
  /**
   * Match each `toolOk(` call and capture its second argument. Deliberately a
   * NEGATIVE assertion: requiring a string *literal* would be unsatisfiable,
   * because two tools legitimately pass a `summary` identifier built above the
   * call. What we can prove mechanically is that nobody re-introduces the JSON
   * dump.
   */
  function captionArgs(source: string): string[] {
    const code = stripNonCode(source);
    const captions: string[] = [];
    const re = /\btoolOk\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      // Walk from the open paren to the matching close, tracking depth, and split
      // the top-level arguments.
      let depth = 0;
      let i = match.index + match[0].length - 1;
      const start = i + 1;
      for (; i < code.length; i++) {
        const ch = code[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      const args = code.slice(start, i);
      // Split on the first top-level comma.
      let d = 0;
      for (let j = 0; j < args.length; j++) {
        const ch = args[j];
        if (ch === '(' || ch === '[' || ch === '{') d++;
        else if (ch === ')' || ch === ']' || ch === '}') d--;
        else if (ch === ',' && d === 0) {
          captions.push(args.slice(j + 1).trim());
          break;
        }
      }
    }
    return captions;
  }

  it('finds every toolOk call site', () => {
    const total = toolSources().reduce((n, { source }) => n + captionArgs(source).length, 0);
    // 16 success sites at the time of writing. A lower number means the parser
    // silently stopped finding them — which would make the assertions below vacuous.
    expect(total).toBeGreaterThanOrEqual(16);
  });

  it('no caption is a JSON.stringify of the payload', () => {
    for (const { file, source } of toolSources()) {
      for (const caption of captionArgs(source)) {
        expect(caption, `${file}: caption must not serialize the payload`).not.toMatch(
          /JSON\.stringify/
        );
      }
    }
  });

  it('no caption is the payload identifier itself', () => {
    for (const { file, source } of toolSources()) {
      for (const caption of captionArgs(source)) {
        expect(caption, `${file}: caption must not be the payload object`).not.toMatch(
          /^(payload|result|responsePayload|facets)$/
        );
      }
    }
  });

  it('no inline caption literal contains an embedded newline', () => {
    for (const { file, source } of toolSources()) {
      for (const caption of captionArgs(source)) {
        if (caption.startsWith("'") || caption.startsWith('"')) {
          expect(caption, `${file}: captions are one line`).not.toMatch(/\\n/);
        }
      }
    }
  });
});
