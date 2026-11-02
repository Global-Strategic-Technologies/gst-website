// Namespace import, matching `src/utils/irl/generate-xlsx.ts` — this is the
// form proven to work through Vite in the browser. The operator CLI needs
// the DEFAULT import instead (raw Node's CJS interop); the two differ on
// purpose and are commented at both sites.
import * as XLSX from 'xlsx-js-style';
import {
  PRIMARY_SHEET_NAME,
  extractIrlMarkdownFromRows,
} from '../../utils/irl/extract-markdown.mjs';
import { copyWithFeedback } from '../../utils/copy-feedback';
import { formatFixed, formatPlain } from '../../i18n/formatters';
import { pageLang } from '../tool-strings';
import { summarizeExtraction } from './logic';
import { s } from './strings';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const fileInput = el<HTMLInputElement>('irl-ext-file');
const drop = el<HTMLLabelElement>('irl-ext-drop');
const statusEl = el<HTMLSpanElement>('irl-ext-status');
const idleEl = el<HTMLDivElement>('irl-ext-idle');
const errorEl = el<HTMLDivElement>('irl-ext-error');
const errorBody = el<HTMLParagraphElement>('irl-ext-error-body');
const errorHint = el<HTMLParagraphElement>('irl-ext-error-hint');
const mdEl = el<HTMLPreElement>('irl-ext-md');
const actions = el<HTMLDivElement>('irl-ext-actions');
const copyBtn = el<HTMLButtonElement>('irl-ext-copy');
const downloadBtn = el<HTMLButtonElement>('irl-ext-download');
const diag = el<HTMLDivElement>('irl-ext-diag');
const advisory = el<HTMLParagraphElement>('irl-ext-advisory');

/** Last successful extraction, held for the copy/download actions. */
let current: { markdown: string; filename: string } | null = null;

const DOT = '·';

function setDiag(values: {
  bullets: string;
  sections: string;
  bytes: string;
  comments: string;
  contradictions: string;
}) {
  const set = (id: string, v: string) => {
    const node = el<HTMLElement>(id);
    if (node) node.textContent = v;
  };
  set('diag-bullets', values.bullets);
  set('diag-sections', values.sections);
  set('diag-bytes', values.bytes);
  set('diag-comments', values.comments);
  set('diag-contradictions', values.contradictions);
}

function resetDiag() {
  setDiag({
    bullets: DOT,
    sections: DOT,
    bytes: DOT,
    comments: DOT,
    contradictions: DOT,
  });
  diag?.setAttribute('data-empty', 'true');
  if (advisory) advisory.hidden = true;
}

/** Show exactly one of the three body states. */
function showState(state: 'idle' | 'error' | 'ok') {
  if (idleEl) idleEl.hidden = state !== 'idle';
  if (errorEl) errorEl.hidden = state !== 'error';
  if (mdEl) mdEl.hidden = state !== 'ok';
  actions?.setAttribute('data-enabled', String(state === 'ok'));
  if (copyBtn) copyBtn.disabled = state !== 'ok';
  if (downloadBtn) downloadBtn.disabled = state !== 'ok';
}

/**
 * The zero-row path. Reached only when the sheet holds no request rows at
 * all — i.e. the file is not an IRL. An unfilled TEMPLATE does not land
 * here: its rows are present, so it converts successfully into a body of
 * `<NO RESPONSE>` lines, exactly as the CLI does. That case is surfaced by
 * `noteUnanswered()` instead of being mislabelled as a failure.
 */
function fail(sheetName: string) {
  current = null;
  if (statusEl) statusEl.textContent = s('js.status.zero', { sheet: sheetName });
  if (errorBody) {
    errorBody.textContent = s('js.error.noRows.body', { sheet: sheetName });
  }
  if (errorHint) {
    errorHint.textContent = s('js.error.noRows.hint', { sheet: sheetName });
  }
  setDiag({
    bullets: formatPlain(0, pageLang()),
    sections: s('js.diag.none'),
    bytes: DOT,
    comments: DOT,
    contradictions: DOT,
  });
  diag?.setAttribute('data-empty', 'false');
  if (advisory) advisory.hidden = true;
  showState('error');
}

// Parsing is synchronous and on the main thread, so a very large workbook
// locks the tab with the status stuck on “Reading…”. There is no server and
// no upload here, so this is a responsiveness ceiling, not a security one:
// an IRL workbook is a question list and runs orders of magnitude under it.
const MAX_FILE_MB = 15;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

async function handleFile(file: File) {
  if (file.size > MAX_FILE_BYTES) {
    current = null;
    const lang = pageLang();
    if (statusEl) statusEl.textContent = s('js.status.tooLarge');
    if (errorBody) {
      // Built from the constant, never typed twice: a literal here would go
      // stale the first time the ceiling moves, and the copy is the only
      // place a visitor learns what the limit is.
      errorBody.textContent = s('js.error.tooLarge.body', {
        file: file.name,
        size: formatFixed(file.size / (1024 * 1024), lang, 1),
        max: formatPlain(MAX_FILE_MB, lang),
      });
    }
    if (errorHint) {
      errorHint.textContent = s('js.error.tooLarge.hint');
    }
    resetDiag();
    showState('error');
    return;
  }

  if (statusEl) statusEl.textContent = s('js.status.reading', { file: file.name });

  let workbook: XLSX.WorkBook;
  try {
    // The browser half of the read. The operator CLI does the same thing
    // with `readFileSync` + `{ type: 'buffer' }`; from the rows onward the
    // two paths run identical shared code.
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(new Uint8Array(buf), { type: 'array' });
  } catch {
    current = null;
    if (statusEl) statusEl.textContent = s('js.status.unreadable');
    if (errorBody) {
      errorBody.textContent = s('js.error.unreadable.body', { file: file.name });
    }
    if (errorHint) {
      errorHint.textContent = s('js.error.unreadable.hint');
    }
    resetDiag();
    showState('error');
    return;
  }

  // Fall back to the first sheet, exactly as the CLI does, so a workbook
  // that is not an IRL lands on the legible zero-row path rather than an
  // error about sheet names.
  const sheetName = workbook.SheetNames.includes(PRIMARY_SHEET_NAME)
    ? PRIMARY_SHEET_NAME
    : workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet || !sheetName) {
    fail(s('js.status.noSheet'));
    return;
  }

  const rows = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, {
    header: 1,
    defval: '',
  });
  const result = extractIrlMarkdownFromRows(rows);

  if (result.bulletCount === 0) {
    fail(sheetName);
    return;
  }

  const summary = summarizeExtraction(result, sheetName, file.name);
  current = { markdown: result.markdown, filename: summary.filename };

  if (mdEl) mdEl.textContent = result.markdown;
  if (statusEl) statusEl.textContent = summary.status;
  setDiag(summary.diag);
  diag?.setAttribute('data-empty', 'false');

  if (advisory) {
    advisory.textContent = summary.advisory ?? '';
    advisory.hidden = summary.advisory === null;
  }

  showState('ok');
}

if (fileInput) {
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void handleFile(file);
  });
}

if (drop) {
  for (const evt of ['dragenter', 'dragover'] as const) {
    drop.addEventListener(evt, (e) => {
      e.preventDefault();
      drop.setAttribute('data-dragging', 'true');
    });
  }
  for (const evt of ['dragleave', 'dragend'] as const) {
    drop.addEventListener(evt, () => drop.removeAttribute('data-dragging'));
  }
  drop.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    drop.removeAttribute('data-dragging');
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  });
}

if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    if (!current) return;
    // Shared helper rather than a hand-rolled swap: it locks the button's
    // min-width for the duration, which matters on a page whose whole
    // premise is that nothing moves when you interact with it.
    void copyWithFeedback(current.markdown, copyBtn, {
      label: s('js.copied'),
      copiedClass: 'brutal-btn--copied',
    });
  });
}

if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    if (!current) return;
    const blob = new Blob([current.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = current.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  });
}

showState('idle');
resetDiag();
