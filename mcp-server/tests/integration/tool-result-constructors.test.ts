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
 *
 * **Known limitation, stated rather than hidden**: it does not model regex
 * literals, so `/it's/` opens a phantom string and can blind the scan to code
 * after it. No tool module contains such a regex today, and the raw-vs-stripped
 * count assertion catches the case where one precedes a constructor call — but
 * it would not catch a regex placed after every call, or in a module with none.
 * Modelling regex literals properly needs full expression-position tracking
 * (`/` is ambiguous between divide and regex-start), which is more machinery
 * than this guard's job warrants. Revisit if a tool module ever needs one.
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

  it('src/tools/ is flat — a nested tool module would escape this scan', () => {
    // `toolSources()` uses a non-recursive readdir. Rather than silently missing
    // a module under `src/tools/<subdir>/`, fail loudly and make whoever adds one
    // decide: flatten it, or make the scan recursive.
    const dirs = readdirSync(TOOLS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(dirs, 'nested tool directory — make toolSources() recursive').toEqual([]);
  });

  it('the scanner preserves code across the big TOOL_DESCRIPTION templates', () => {
    // Sanity check on stripNonCode itself. Every module that calls a constructor
    // must still show that call AFTER stripping — if a template-literal mispair
    // eats the code, every assertion below silently passes on nothing.
    //
    // The baseline counts calls in a COMMENT-stripped copy, not the raw source:
    // counting raw would make the first docstring that mentions `toolOk(` fail
    // this test with "scanner lost calls", which is the opposite of the truth.
    for (const { file, source } of toolSources()) {
      const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/[^\n]*/gm, '');
      const baseline = (withoutComments.match(/\btool(Ok|Fail)\s*\(/g) ?? []).length;
      const stripped = (stripNonCode(source).match(/\btool(Ok|Fail)\s*\(/g) ?? []).length;
      expect(stripped, `${file}: scanner lost constructor calls while stripping`).toBe(baseline);
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
    return captionArgsFrom(stripNonCode(source));
  }

  function captionArgsFrom(code: string): string[] {
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
      // Split ALL top-level arguments and take the second — the caption.
      //
      // This used to `slice(j + 1)` from the first top-level comma, i.e. take
      // "everything after the payload". That was equivalent while `toolOk` had
      // exactly two parameters. BL-108 added a third (`options`), so the old form
      // swallowed it into the caption: `toolOk(payload, summary, { textOmit: [...] })`
      // yielded the caption `summary, { textOmit: ['base64'] }`. Nothing failed —
      // the assertions below simply started checking a string that is not a caption,
      // which is the quiet way a guard stops guarding.
      const topLevel: string[] = [];
      let d = 0;
      let argStart = 0;
      for (let j = 0; j < args.length; j++) {
        const ch = args[j];
        if (ch === '(' || ch === '[' || ch === '{') d++;
        else if (ch === ')' || ch === ']' || ch === '}') d--;
        else if (ch === ',' && d === 0) {
          topLevel.push(args.slice(argStart, j));
          argStart = j + 1;
        }
      }
      topLevel.push(args.slice(argStart));
      if (topLevel.length >= 2) captions.push(topLevel[1].trim());
    }
    return captions;
  }

  /** Same extraction, but over the raw source so string contents survive. */
  function rawCaptionArgs(source: string): string[] {
    return captionArgsFrom(source);
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

  it('no caption contains an embedded newline', () => {
    // Read from the RAW source, not the stripped one: `stripNonCode` blanks quoted
    // string contents, so a `'a\nb'` caption arrives here as `''` and a check
    // against the stripped text could never fail. Template captions are the only
    // kind whose newlines survive stripping, and the earlier version of this test
    // excluded exactly those — so it asserted nothing at all.
    for (const { file, source } of toolSources()) {
      for (const caption of rawCaptionArgs(source)) {
        expect(caption, `${file}: captions are one line (literal newline)`).not.toContain('\n');
        expect(caption, `${file}: captions are one line (escaped newline)`).not.toMatch(/\\n/);
      }
    }
  });

  it('the newline check is not vacuous — it catches both spellings', () => {
    // Guards the guard: the previous version of the assertion above could not
    // fail. These two shapes must be visible to `rawCaptionArgs`.
    expect(rawCaptionArgs("toolOk(p, 'a\\nb');")[0]).toMatch(/\\n/);
    expect(rawCaptionArgs('toolOk(p, `a\nb`);')[0]).toContain('\n');
  });
});
