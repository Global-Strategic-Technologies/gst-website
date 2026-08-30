/**
 * Convert a parsed GST IRL worksheet into the canonical IRL markdown body.
 *
 * **This module is deliberately dependency-free and runtime-agnostic.** It
 * imports nothing — no `node:` builtins, no spreadsheet library, no
 * `process` — because it has three consumers on two different runtimes:
 *
 *   1. the browser, via `/hub/tools/irl-extractor/` (Vite bundles this file
 *      into the page's client script);
 *   2. raw Node, via `mcp-server/scripts/extract-irl-markdown.mjs`, the
 *      operator CLI behind `npm -w @gst/mcp-server run irl:extract`;
 *   3. vitest, via the round-trip tests in both workspaces.
 *
 * Reading the workbook BYTES is the caller's job precisely because that step
 * is the runtime-specific one (`readFileSync` + `{type:'buffer'}` in Node,
 * `File.arrayBuffer()` + `{type:'array'}` in a browser). Everything from the
 * row-major array onward is identical, which is what makes the two paths
 * byte-identical rather than merely similar — asserted by
 * `tests/unit/irl/extract-markdown-parity.test.ts`.
 *
 * **Why `.mjs` and not `.ts`** (the rest of `src/utils/irl/` is TypeScript):
 * the operator CLI is `node scripts/extract-irl-markdown.mjs` with no build
 * step, and raw Node cannot import a `.ts` file without an experimental flag
 * this repo does not require. A `.mjs` runtime with a sibling `.d.mts` is the
 * portable answer, and is the pattern already used by
 * `mcp-server/tests/fixtures/radar-mock-data.mjs`.
 *
 * **No shebang**: Vite's parser (which powers vitest's import path for this
 * file) rejects `#!` and bails with `SyntaxError: Invalid or unexpected
 * token`, even though raw Node special-cases shebangs in `.mjs`.
 *
 * **Output shape** — the canonical body:
 *
 *   # Information Request List — <Target> (filled)
 *
 *   > Engagement context: <ctx>
 *   > Generated: <date>
 *   > Canonical reference: <url>
 *
 *   - <ref> <request> [<STATUS>] — <answer> (Source: <D>) (Note: <F>)
 *
 * `<answer>` is column G and column E joined into ONE contiguous span, G
 * first — see {@link joinAnswerSpan}. Keep that rule in step with the shared
 * `WORKBOOK_COLUMN_CONTRACT` in
 * `mcp-server/src/prompts/extraction-rules.ts`, which states the same rule to
 * the model; the two paths agreeing on these bytes is the acceptance property
 * of BL-120, and no test asserts that prose — a review caught it drifting once.
 *
 * Source/Note stay OUTSIDE the answer slot: a row whose only content is a VDR
 * filename must not read as answered, so it renders
 * `— <NO RESPONSE> (Source: …)`. See
 * `src/docs/adr/0015-irl-canonical-body-reads-full-workbook.md`.
 *
 * Status values pass through verbatim (`OPEN` / `PARTIAL` / `CLOSED`).
 * `<NO RESPONSE>` is a human-readable marker for "asked but unanswered" — no
 * server code parses it. Section header rows and section intros are omitted
 * from the bullet stream entirely.
 */

/**
 * The sheet the generator writes the request table to. Callers should fall
 * back to the workbook's first sheet when this one is absent — a workbook
 * that is not an IRL still parses, and lands on the zero-bullet path rather
 * than throwing.
 */
export const PRIMARY_SHEET_NAME = 'Information Request List';

/**
 * Join the Response and Comments cells into one contiguous answer span.
 *
 * Both are answers (BL-120): GST pre-populates research into Comments and the
 * recipient confirms via Status, so neither is labelled — a label between them
 * would inject a token into the middle of every cross-boundary citation and
 * push a downstream fuzzy matcher below its 8-word floor.
 *
 * The separator is always a single space. A period is added unless the Response
 * ALREADY ends in punctuation that terminates or continues the clause —
 * `. ? ! : ; , …` or a dash — after any closing brackets and quotes have been
 * peeled off. Two rules fall out of that one test: a Response already ending in
 * terminal punctuation gets no second terminator, and one ending in a comma
 * yields `foo, bar` rather than `foo,. bar`.
 *
 * The ellipsis and the trailing dash are in that set because a real workbook
 * put them there: an author who ends a cell `ADRs, BDRs, Designs, APIs, AC, …`
 * or on a trailing em-dash has left the clause deliberately open, and `….` is
 * not an improvement.
 *
 * Stated as "unless already terminated" rather than the inverse ("when it ends
 * in a letter, digit or closing bracket"), because the inverse silently omits
 * the period after everything else a real cell ends in — `14%`, `$4.15M +`,
 * a trailing unit or symbol — and it cannot see through a closing quote, so
 * `"we ship weekly,"` produced exactly the `,".` artifact the comma rule exists
 * to prevent. Curly quotes matter here specifically: Excel autocorrects `"` to
 * `“ ”` by default, so quoted Responses arrive curly far more often than
 * straight, and an ASCII-only quote class would miss the common case.
 *
 * Known cosmetic edge, accepted rather than special-cased: peeling the closing
 * quote means `…this."` is correctly read as already terminated, but
 * `…the rating engine”` — quoted content that does NOT terminate — gains its
 * period AFTER the closing quote rather than inside it. Placing it inside needs
 * a parser this does not want, and the normalizer flattens quotes and periods
 * alike, so nothing downstream sees either.
 *
 * @param {string} response Column G, already trimmed.
 * @param {string} comments Column E, already trimmed.
 * @returns {string} The answer span; empty when both inputs are empty.
 */
export function joinAnswerSpan(response, comments) {
  if (!response) return comments;
  if (!comments) return response;
  // Peel trailing closers so the test sees the character that actually ends the
  // clause. `”`/`’` are the curly double/single closers.
  const core = response.replace(/[)\]}"'”’]+$/u, '');
  const needsPeriod = core.length > 0 && !/[.?!:;,…—–-]$/u.test(core);
  return `${response}${needsPeriod ? '.' : ''} ${comments}`;
}

/**
 * Convert a parsed worksheet (row-major array-of-arrays) into the canonical
 * IRL markdown body shape.
 *
 * @param {Array<Array<string | number>>} rows Row-major sheet contents.
 *   Pulled via `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })`.
 * @param {{ targetName?: string }} [opts]
 * @returns {{ markdown: string, bulletCount: number, sectionsSeen: string[],
 *   statusContradictions: string[], commentsSourcedAnswers: string[] }}
 */
export function extractIrlMarkdownFromRows(rows, opts = {}) {
  // Metadata captured from header rows (col A = label, col B = value).
  const metadata = {
    target: opts.targetName,
    engagementContext: undefined,
    generated: undefined,
    canonicalReference: undefined,
  };

  const bullets = [];
  const sectionsSeen = [];
  /** Refs whose Status claims an answer but every content column is empty. */
  const statusContradictions = [];
  /** Refs whose answer came from Comments alone (G empty, E populated). */
  const commentsSourcedAnswers = [];

  // Column layout (generated by `buildPrimarySheet` in
  // `src/utils/irl/generate-xlsx.ts`):
  //   A Reference | B Request | C Status | D File Location |
  //   E Comments  | F Notes   | G Response
  //
  // BL-120: all seven are read. D/E/F were previously discarded as "partner-
  // supplied side channels", which cost 45.2% of the authored content on the
  // first real workbook measured — 17 rows whose Status said CLOSED/PARTIAL
  // had their answer sitting in Comments while the body said <NO RESPONSE>.
  for (const row of rows) {
    const cells = row.map((c) => String(c ?? '').trim());
    const [a, b, c, d, e, f, g] = cells;

    if (!a && !b) continue; // blank separator row

    // Engagement metadata rows: col A holds a label, col B holds a value.
    // The generator emits exactly these four labels (see `pushMetadataRow`
    // in generate-xlsx.ts), so an exact-match list catches all of them
    // without false positives on bullet-row "Reference" values like "0-01".
    if (a === 'Target') {
      metadata.target = b || metadata.target;
      continue;
    }
    if (a === 'Engagement context') {
      metadata.engagementContext = b;
      continue;
    }
    if (a === 'Generated') {
      metadata.generated = b;
      continue;
    }
    if (a === 'Canonical reference') {
      metadata.canonicalReference = b;
      continue;
    }

    // Column header row — exactly the 7 labels the generator writes.
    if (a === 'Reference' && b === 'Request' && c === 'Status') continue;

    // Section header rows: col A empty, col B starts with "<num> — <TITLE>".
    // The number is two digits per the canonical article (00, 01, …, 09).
    // The match anchors at line start so partial overlaps with bullet
    // content (e.g. a Response that begins with "01 —") can't false-positive.
    if (!a && /^\d{2} — /.test(b)) {
      const sectionNum = b.slice(0, 2);
      if (!sectionsSeen.includes(sectionNum)) sectionsSeen.push(sectionNum);
      continue;
    }

    // Bullet row: col A is the reference (e.g. "0-01", "10-12"). The
    // generator uses a single-digit section prefix + 2-digit bullet
    // index. Match exactly so section intros (col A still empty) and
    // accidental free-text in col A get skipped.
    if (/^\d{1,2}-\d{2}$/.test(a) && b) {
      // Normalize the status to OPEN if empty. Generator pre-fills OPEN,
      // but a defensively-emitted bullet row should still ship a valid
      // tag so the canonical body's `[<status>]` shape stays consistent.
      const status = c || 'OPEN';

      // The answer slot: Response and Comments as ONE contiguous span, so a
      // citation reading across the boundary still normalizes to a substring
      // of the body. See {@link joinAnswerSpan} for why a labelled separator
      // cannot be used here.
      const answer = joinAnswerSpan(g, e);

      // Source/Note deliberately sit OUTSIDE the answer slot: a row carrying
      // only a filename must not read as answered, or it inflates the
      // fill ratio and satisfies the bare-non-emptiness inclusion gates.
      const suffix = `${d ? ` (Source: ${d})` : ''}${f ? ` (Note: ${f})` : ''}`;

      bullets.push(`- ${a} ${b} [${status}] — ${answer || '<NO RESPONSE>'}${suffix}`);

      // Two operator-facing signals, returned rather than printed so they are
      // testable without spying on stderr.
      if (!answer && !d && !f && (status === 'CLOSED' || status === 'PARTIAL')) {
        statusContradictions.push(a);
      }
      if (!g && e) commentsSourcedAnswers.push(a);
    }
    // Anything else (section intros, stray free-text rows) is intentionally
    // ignored. The canonical body the model produces in reconstruction mode
    // also drops them.
  }

  // Compose the final markdown. Mirror the head shape the model emits in
  // model-reconstruction mode (single H1 title with "(filled)" tag), so the
  // server's `# Information Request List — ...` substring match in the
  // RUN-AUDIT fingerprint capture lines up cleanly across both paths.
  const titleTarget = metadata.target || 'IRL';
  const title = `# Information Request List — ${titleTarget} (filled)`;

  // Engagement metadata block — emitted as a YAML-ish key/value list so an
  // operator eyeballing the file can verify they grabbed the right xlsx
  // before pasting. This is a strict superset of what the model emits in
  // reconstruction mode and does NOT affect downstream verification
  // (metadata lines are non-citation content).
  const metaLines = [];
  if (metadata.engagementContext)
    metaLines.push(`> Engagement context: ${metadata.engagementContext}`);
  if (metadata.generated) metaLines.push(`> Generated: ${metadata.generated}`);
  if (metadata.canonicalReference)
    metaLines.push(`> Canonical reference: ${metadata.canonicalReference}`);

  const parts = [title];
  if (metaLines.length) parts.push('', ...metaLines);
  parts.push('', ...bullets, '');

  return {
    markdown: parts.join('\n'),
    bulletCount: bullets.length,
    sectionsSeen,
    statusContradictions,
    commentsSourcedAnswers,
  };
}
