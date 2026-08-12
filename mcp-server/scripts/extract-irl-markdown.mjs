/**
 * Extract canonical IRL markdown from a populated GST IRL `.xlsx`.
 *
 * **No shebang**: this script is invoked via `node scripts/...` or
 * `npm run irl:extract`, NOT as a self-executable. Vite's parser (which
 * powers vitest's import path for this `.mjs` file in the round-trip
 * tests) does not accept a `#!` shebang line and bails with
 * `SyntaxError: Invalid or unexpected token` — even though raw Node 22
 * special-cases shebangs in `.mjs` files. Default-importing the script
 * via `import { extractIrlMarkdownFromRows } from '...mjs'` MUST work
 * under both raw Node (CLI) and vitest (round-trip tests) — keeping
 * the file shebang-free is the simplest portable answer.
 *
 * **What this is**: the structural inverse of
 * `mcp-server/src/tools/generate-information-request-list-xlsx.ts`. The
 * generator takes the canonical IRL article AST + engagement metadata and
 * writes an `.xlsx` workbook the partner fills in. This script reads that
 * filled workbook back and emits the markdown body the `gst_irl_ingestion`
 * prompt's `filledIrl` arg expects — i.e. the bytes shape the model would
 * produce if it ran in `model-reconstruction-from-xlsx` mode, but rendered
 * deterministically by the operator instead of stochastically by the model.
 *
 * **Why this exists**: BL-076's body-by-hash mechanism requires the IRL
 * body to flow through `prepare_irl_body` once. For large IRLs (~60-80KB),
 * the model's tool-call args emission truncates somewhere below the full
 * body size, producing a partially-cached body and a hash mismatch the
 * model itself catches and refuses. The operator-side workaround is to
 * paste the IRL markdown into the `filledIrl` prompt arg directly
 * (`irlSource: 'partner-paste-verbatim'`). This script produces that paste
 * from the partner's filled xlsx — making the partner-paste-verbatim path
 * operationally available without hand-transcription.
 *
 * **What this is NOT**: a server tool. BL-049 explored a server-side
 * `extract_irl_from_xlsx` tool and reverted it (cross-host Claude Desktop
 * topology blocks bytes delivery; design doc preserved at
 * `src/docs/adr/0003-irl-xlsx-canonicalization-hash-bind.md`).
 * This script is the **local-operator equivalent**: same conceptual
 * conversion, runs on the operator host where the xlsx already lives.
 *
 * **Output shape** — the canonical body. The `gst_irl_ingestion` prompt
 * instructs the model to produce this same shape when reconstructing from
 * an attached xlsx, so the two paths agree by instruction rather than by
 * coincidence (BL-120; before that the prompt said nothing about columns
 * at all):
 *
 *   # Information Request List — <Target> (filled)
 *
 *   - <ref> <request> [<STATUS>] — <answer> (Source: <D>) (Note: <F>)
 *
 * `<answer>` is column G and column E joined into ONE contiguous span, G
 * first. The join is always a single space, plus a period unless G already
 * ends in `.` `?` `!` `:` `;` `,` `…` or a dash once closing brackets and
 * quotes are peeled off — see {@link joinAnswerSpan} for why the rule is
 * phrased that way round, and keep it in step with the prompt's
 * `WORKBOOK_COLUMN_CONTRACT`, which states the same rule to the model.
 *
 * Why one unlabelled span and not a labelled separator: `validate_irl_provenance`
 * matches citation excerpts against this body by normalized substring, falling
 * back to an 8-word contiguous run. A label between the two halves injects a
 * token into the middle of every cross-boundary citation, splitting it into two
 * runs that are each shorter than the floor — 5 and 3 in the counterfactual
 * pinned at `tests/unit/schemas/validate-irl-provenance.test.ts` — i.e.
 * UNVERIFIED, which auto-appends `provenance-gap:` to a partner-facing dossier
 * over a citation that was perfectly faithful. Cross-boundary citations are the
 * expected shape once answers live partly in each column, so the separator has
 * to vanish under normalization. A period does; a label does not.
 *
 * Source/Note stay OUTSIDE the answer slot for a different reason: the
 * prompt's pre-flight HALTs a run below 15% substantively-answered rows, and
 * several inclusion gates test the same predicate. A row whose only content
 * is a VDR filename must not read as answered, so it renders
 * `— <NO RESPONSE> (Source: …)`. See `src/docs/adr/0015-irl-canonical-body-reads-full-workbook.md`.
 *
 * Status values pass through verbatim (`OPEN` / `PARTIAL` / `CLOSED`).
 * `<NO RESPONSE>` is a human-readable marker for "asked but unanswered" —
 * no server code parses it, and it does NOT become a (J) gap entry (see
 * `mcp-server/src/docs/testing/uat/UAT-07-irl-pipeline.md`). The fill ratio
 * is what accounts for unanswered rows. Section header rows and section
 * intros are omitted from the bullet stream entirely.
 *
 * Cells are trimmed, so there is no trailing-newline join artifact — but
 * newlines INSIDE a cell survive, so a multi-line Comments value can push
 * `(Source: …)` onto its own visual line, detached from its bullet. That was
 * always true of column G; it is now reachable from three more columns.
 *
 * **Usage**:
 *
 *   node mcp-server/scripts/extract-irl-markdown.mjs <path-to.xlsx> [--out <path-to.md>]
 *
 * Default behaviour writes to stdout so it composes with redirection:
 *
 *   node mcp-server/scripts/extract-irl-markdown.mjs IRL.xlsx > irl-body.md
 *
 * Exits non-zero on:
 *   - missing/invalid xlsx path
 *   - workbook missing the primary "Information Request List" sheet
 *   - zero bullet rows extracted (likely wrong file)
 *
 * **Round-trip guarantee**: `tests/unit/scripts/extract-irl-markdown.test.ts`
 * exercises `generate_information_request_list_xlsx` → this script and asserts
 * the bullet rows + status pass-through preserve the partner's content. The
 * generator is the single source of truth; this script is its inverse.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import XLSX from 'xlsx-js-style';

// `xlsx-js-style` is a CommonJS package. Raw Node 22's ESM resolver exposes
// its `module.exports` shape under the `default` import — so the simple
// default-import form gives us `XLSX.read(...)` + `XLSX.utils.sheet_to_json`
// in both raw Node and vitest. Pre-fix the script used
// `import * as XLSX from 'xlsx-js-style'`, which worked under vitest's Vite
// resolver (which collapses the CJS default into the namespace) but blew
// up in raw Node production with `XLSX.read is not a function`. Default
// import is the portable form.

const PRIMARY_SHEET_NAME = 'Information Request List';

/**
 * Join the Response and Comments cells into one contiguous answer span.
 *
 * Both are answers (BL-120): GST pre-populates research into Comments and the
 * recipient confirms via Status, so neither is labelled — a label between them
 * would inject a token into the middle of every cross-boundary citation and
 * push the fuzzy matcher below its 8-word floor.
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
 * not an improvement. Both were handled correctly by accident under the earlier
 * inverse phrasing, which is precisely why the replacement had to name them.
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
 * Whatever this rule becomes, it must be swept into `WORKBOOK_COLUMN_CONTRACT`
 * in `src/prompts/irl-ingestion.ts` in the same commit. The two paths agreeing
 * on these bytes is the acceptance property of BL-120, and no test asserts that
 * prose — a code review caught it drifting once already.
 *
 * @param {string} response Column G, already trimmed.
 * @param {string} comments Column E, already trimmed.
 * @returns {string} The answer span; empty when both inputs are empty.
 */
function joinAnswerSpan(response, comments) {
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
 * Exported as a named function so unit tests can drive it directly from
 * an in-memory workbook (`generate_information_request_list_xlsx` →
 * `XLSX.read` → this fn) without writing temp files.
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
  //   E Comments | F Notes    | G Response
  //
  // BL-120: all seven are read. D/E/F were previously discarded as "partner-
  // supplied side channels", which cost 45.2% of the authored content on the
  // first real workbook measured — 17 rows whose Status said CLOSED/PARTIAL
  // had their answer sitting in Comments while the body said <NO RESPONSE>.
  // GST pre-populates research into E, sources into D and caveats into F; the
  // recipient confirms by setting Status. The old comment here claimed the
  // omission matched "the shape the model uses in reconstruction" — that was
  // never verified and is false: the observed reconstruction captured Comments.
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
      // tag so the canonical body's `[<status>]` shape stays consistent
      // for the model's downstream parsing.
      const status = c || 'OPEN';

      // The answer slot: Response and Comments as ONE contiguous span, so a
      // citation reading across the boundary still normalizes to a substring
      // of the body. See the module docstring for why a labelled separator
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
  // BL-045-VERIFY fingerprint capture lines up cleanly across both paths.
  const titleTarget = metadata.target || 'IRL';
  const title = `# Information Request List — ${titleTarget} (filled)`;

  // Engagement metadata block — emitted as a YAML-ish key/value list so an
  // operator eyeballing the file can verify they grabbed the right xlsx
  // before pasting 60KB into a slash-command form. The model in
  // reconstruction mode doesn't emit this block; including it here is a
  // strict superset that does NOT affect downstream verification (the
  // `validate_irl_provenance` engine substring-matches citations against
  // the body; metadata lines are non-citation content).
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

/**
 * Read the workbook, dispatch to {@link extractIrlMarkdownFromRows}, write
 * output (stdout or file). Returns the same result object so a programmatic
 * caller can inspect `bulletCount` / `sectionsSeen` for ergonomics logging.
 */
export function extractIrlMarkdownFromFile(xlsxPath, opts = {}) {
  const buf = readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[PRIMARY_SHEET_NAME] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    throw new Error(
      `Workbook "${xlsxPath}" has no readable primary sheet (expected "${PRIMARY_SHEET_NAME}" ` +
        `or any sheet; got: [${wb.SheetNames.join(', ')}])`
    );
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return extractIrlMarkdownFromRows(rows, opts);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseCliArgs(argv) {
  const positional = [];
  let out;
  let targetName;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '-o') {
      out = argv[++i];
    } else if (a === '--target' || a === '-t') {
      targetName = argv[++i];
    } else if (a === '--help' || a === '-h') {
      return { help: true };
    } else if (a.startsWith('--')) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      positional.push(a);
    }
  }
  return { xlsxPath: positional[0], out, targetName };
}

function printHelp() {
  process.stderr.write(
    [
      'extract-irl-markdown — convert a populated GST IRL .xlsx to canonical IRL markdown.',
      '',
      'Usage:',
      '  node mcp-server/scripts/extract-irl-markdown.mjs <path-to.xlsx> [options]',
      '',
      'Options:',
      '  --out <path>       Write to file instead of stdout',
      '  --target <name>    Override the target name (otherwise derived from workbook metadata)',
      '  --help             Show this help',
      '',
      'Example:',
      '  node mcp-server/scripts/extract-irl-markdown.mjs ~/IRL-Acme.xlsx > irl-acme.md',
      '',
      "The output is ready to paste into the `gst_irl_ingestion` prompt's `filledIrl`",
      'argument (partner-paste-verbatim mode). See',
      'src/docs/development/IRL_PARTNER_PASTE_RUNBOOK.md for the full operator playbook.',
      '',
    ].join('\n')
  );
}

function runCli() {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n\n`);
    printHelp();
    process.exit(2);
  }
  if (opts.help || !opts.xlsxPath) {
    printHelp();
    process.exit(opts.help ? 0 : 2);
  }
  let result;
  try {
    result = extractIrlMarkdownFromFile(resolve(opts.xlsxPath), {
      targetName: opts.targetName,
    });
  } catch (err) {
    process.stderr.write(`Failed to extract IRL markdown: ${err.message}\n`);
    process.exit(1);
  }
  if (result.bulletCount === 0) {
    process.stderr.write(
      `Warning: extracted 0 bullet rows from "${opts.xlsxPath}". Is this a populated IRL xlsx?\n`
    );
    process.exit(1);
  }
  const byteLength = Buffer.byteLength(result.markdown, 'utf8');

  if (opts.out) {
    writeFileSync(opts.out, result.markdown, 'utf8');
    process.stderr.write(
      `Wrote ${byteLength} bytes ` +
        `(${result.bulletCount} bullets across sections [${result.sectionsSeen.join(', ')}]) ` +
        `to ${opts.out}\n`
    );
  } else {
    process.stdout.write(result.markdown);
    process.stderr.write(
      `Extracted ${result.bulletCount} bullets across sections [${result.sectionsSeen.join(', ')}]\n`
    );
  }

  // Operator signals. Deliberately NOT failures — every one of these is a
  // legitimate state that the operator, and only the operator, can resolve
  // by opening the workbook.
  if (result.commentsSourcedAnswers.length) {
    process.stderr.write(
      `\nNote: ${result.commentsSourcedAnswers.length} row(s) took their answer from Comments ` +
        `because Response was empty: ${result.commentsSourcedAnswers.join(', ')}\n` +
        `  Comments is read as an answer. In workbooks filled before BL-120 the Instructions\n` +
        `  invited caveats there too, so skim these rows in the xlsx before the body is used\n` +
        `  for a client-facing deliverable — the two are indistinguishable once extracted.\n`
    );
  }
  if (result.statusContradictions.length) {
    process.stderr.write(
      `\nWarning: ${result.statusContradictions.length} row(s) claim a Status of CLOSED/PARTIAL ` +
        `but every content column is empty: ${result.statusContradictions.join(', ')}\n` +
        `  These render as <NO RESPONSE>. Either the answer never landed, or it is somewhere\n` +
        `  this script does not read.\n`
    );
  }
  // Scoped strictly to the one thing that actually breaks. Nothing fails
  // server-side here (the body cache accepts 200KB) and the supported
  // Desktop → prompt-arg → prepop path never emits the body, so a general
  // "large body" warning would fire on essentially every real workbook and
  // contradict the runbook's own "5-150KB is typical".
  if (byteLength > 57_000) {
    process.stderr.write(
      `\nNote: ${byteLength} bytes exceeds ~57KB. claude.ai web refuses a prompt argument this\n` +
        `  size outright — use Claude Desktop for the paste. Nothing else is affected.\n`
    );
  }
}

// Run the CLI only when invoked directly. Importing this module (e.g. from
// the round-trip tests) does not trigger the CLI side effects.
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('extract-irl-markdown.mjs');
if (isMain) {
  runCli();
}
