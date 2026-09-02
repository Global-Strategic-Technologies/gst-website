/**
 * Extract canonical IRL markdown from a populated GST IRL `.xlsx`.
 *
 * **Where the logic lives**: the conversion itself is
 * `src/utils/irl/extract-markdown.mjs` in the WEBSITE workspace — a
 * dependency-free module shared with `/hub/tools/information-request-list-extractor/`, the browser
 * page that performs the same conversion for anyone without a checkout. This
 * file is the Node half: read the bytes, hand the rows over, run the CLI.
 * Splitting it that way is what makes the two paths byte-identical rather than
 * merely similar (`tests/unit/irl/extract-markdown-parity.test.ts`), and it
 * matches the direction every other shared IRL module already travels —
 * `parse-article.ts`, `generate-xlsx.ts` and `customize-article.ts` all live in
 * the website workspace and are imported up by this one.
 *
 * **No shebang**: this script is invoked via `node scripts/...` or
 * `npm run irl:extract`, NOT as a self-executable. Vite's parser (which
 * powers vitest's import path for this `.mjs` file in the round-trip
 * tests) does not accept a `#!` shebang line and bails with
 * `SyntaxError: Invalid or unexpected token` — even though raw Node 22
 * special-cases shebangs in `.mjs` files.
 *
 * **What this is**: the structural inverse of
 * `mcp-server/src/tools/generate-information-request-list-xlsx.ts`. The
 * generator takes the canonical IRL article AST + engagement metadata and
 * writes an `.xlsx` workbook the partner fills in. This script reads that
 * filled workbook back and emits the markdown body `gst_irl_sweep`'s
 * `filledIrl` arg expects — deterministically, rather than stochastically by
 * the model reading an attachment.
 *
 * **What this is NOT**: a server tool. BL-049 explored a server-side
 * `extract_irl_from_xlsx` tool and reverted it (bytes cannot reach a Worker
 * tool handler; see `src/docs/adr/0003-irl-xlsx-canonicalization-hash-bind.md`
 * and, for why the browser is not subject to that constraint,
 * `src/docs/adr/0025-irl-extraction-in-the-browser.md`).
 *
 * **Output shape** and the answer-span join rule are documented on the shared
 * module. Keep them in step with `WORKBOOK_COLUMN_CONTRACT` in
 * `src/prompts/extraction-rules.ts`.
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
 *   - workbook with no readable sheet at all
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

import {
  PRIMARY_SHEET_NAME,
  extractIrlMarkdownFromRows,
} from '../../src/utils/irl/extract-markdown.mjs';

// `xlsx-js-style` is a CommonJS package. Raw Node 22's ESM resolver exposes
// its `module.exports` shape under the `default` import — so the simple
// default-import form gives us `XLSX.read(...)` + `XLSX.utils.sheet_to_json`
// in both raw Node and vitest. Pre-fix the script used
// `import * as XLSX from 'xlsx-js-style'`, which worked under vitest's Vite
// resolver (which collapses the CJS default into the namespace) but blew
// up in raw Node production with `XLSX.read is not a function`. Default
// import is the portable form.

// Re-exported so existing importers (the round-trip tests, the fill-tool
// conformance test) keep their import path. The implementation is the shared
// module's.
export { extractIrlMarkdownFromRows };

/**
 * Read the workbook, dispatch to `extractIrlMarkdownFromRows`, write output
 * (stdout or file). Returns the same result object so a programmatic caller
 * can inspect `bulletCount` / `sectionsSeen` for ergonomics logging.
 *
 * Falls back to the first sheet when the primary one is absent, so a workbook
 * that is not an IRL lands on the zero-bullet path (a legible "is this the
 * right file?" warning) rather than throwing. The throw is reserved for a
 * workbook with no readable sheet at all.
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
      "The output is ready to paste into the `gst_irl_sweep` prompt's `filledIrl`",
      'argument. See src/docs/development/IRL_PARTNER_PASTE_RUNBOOK.md for the full',
      'operator playbook. Without a checkout, /hub/tools/information-request-list-extractor/ performs the',
      'same conversion in the browser.',
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
  // Desktop → prompt-arg path never emits the body, so a general "large body"
  // warning would fire on essentially every real workbook and contradict the
  // runbook's own "5-150KB is typical".
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
