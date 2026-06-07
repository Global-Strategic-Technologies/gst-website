#!/usr/bin/env node
/**
 * Extract canonical IRL markdown from a populated GST IRL `.xlsx`.
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
 * `src/docs/development/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md`).
 * This script is the **local-operator equivalent**: same conceptual
 * conversion, runs on the operator host where the xlsx already lives.
 *
 * **Output shape**: matches the structure the `gst_irl_ingestion` prompt's
 * body-rendering code expects when `filledIrl` is supplied, and the shape
 * the model emits today in `model-reconstruction-from-xlsx` mode:
 *
 *   # Information Request List — <Target> (filled)
 *
 *   - 0-01 <Request> [<Status>] — <Response>
 *   - 0-02 <Request> [<Status>] — <Response>
 *   ...
 *   - 10-NN <Request> [<Status>] — <Response>
 *
 * Status values are passed through verbatim (`OPEN` / `PARTIAL` / `CLOSED`).
 * Rows whose Response cell is empty emit `— <NO RESPONSE>` so the model
 * (and gap-list emitter) can distinguish "asked but unanswered" from
 * "not asked." Section header rows and section intros are intentionally
 * omitted from the bullet stream — they're rendered as comments at the
 * top so the operator can sanity-check the workbook's section coverage
 * without affecting the canonical body bytes.
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
import * as XLSX from 'xlsx-js-style';

const PRIMARY_SHEET_NAME = 'Information Request List';

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
 * @returns {{ markdown: string, bulletCount: number, sectionsSeen: string[] }}
 */
export function extractIrlMarkdownFromRows(rows, opts = {}) {
  // Metadata captured from header rows (col A = label, col B = value).
  const metadata = {
    target: opts.targetName,
    engagementContext: undefined,
    generated: undefined,
    canonicalReference: undefined,
  };
  // Track the previous bullet's `Notes` column (col F) so we can append it
  // to the prior bullet's Response cleanly when the partner left a Notes
  // annotation. (Generator-generated workbooks don't pre-fill Notes; the
  // recipient fills them. The model's model-reconstruction output today
  // ignores Notes, so we match that — Notes stays out of the canonical
  // body. Keeping this hook documented so a future revision can add a
  // `--include-notes` flag without restructuring.)

  const bullets = [];
  const sectionsSeen = [];

  // Column layout (generated by `buildPrimarySheet` in
  // `src/utils/irl/generate-xlsx.ts`):
  //   A Reference | B Request | C Status | D File Location |
  //   E Comments | F Notes    | G Response
  // We need A (for the reference + section detection), B (request text),
  // C (status), and G (response). D/E/F are partner-supplied side channels
  // the canonical body omits — same shape the model uses in reconstruction.
  for (const row of rows) {
    const cells = row.map((c) => String(c ?? '').trim());
    const [a, b, c, , , , g] = cells;

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
      // Empty response → explicit sentinel so the model's gap-extractor
      // can flag the row instead of silently dropping it. The model in
      // reconstruction mode does the same thing.
      const responseFragment = g ? ` — ${g}` : ' — <NO RESPONSE>';
      bullets.push(`- ${a} ${b} [${status}]${responseFragment}`);
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
  if (opts.out) {
    writeFileSync(opts.out, result.markdown, 'utf8');
    process.stderr.write(
      `Wrote ${Buffer.byteLength(result.markdown, 'utf8')} bytes ` +
        `(${result.bulletCount} bullets across sections [${result.sectionsSeen.join(', ')}]) ` +
        `to ${opts.out}\n`
    );
  } else {
    process.stdout.write(result.markdown);
    process.stderr.write(
      `Extracted ${result.bulletCount} bullets across sections [${result.sectionsSeen.join(', ')}]\n`
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
