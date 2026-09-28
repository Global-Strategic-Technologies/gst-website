import articleBody from '../../data/irl/information-request-list.md?raw';
import { parseIrlArticle } from '../../utils/irl/parse-article';
import {
  generateIrlXlsxBuffer,
  buildIrlFilename,
  IRL_XLSX_MIME_TYPE,
  type IRLTransactionContext,
} from '../../utils/irl/generate-xlsx';
import { customizeIrlArticle, type IRLCustomRequest } from '../../utils/irl/customize-article';

const TRANSACTION_CONTEXT_VALUES = new Set<IRLTransactionContext>([
  'sell-side',
  'buy-side',
  'value-creation',
  'unknown',
]);

const MAX_CUSTOM_PER_SECTION = 10;

// Parse once at module init — the article body is bundled by Vite at build
// time, so this is a cheap one-time cost rather than a per-click parse. The
// section CHECKBOXES are rendered server-side (see the Astro template) so the
// scoped styles apply; this parse feeds the client-side XLSX generation on
// submit (and must produce the same section order as the SSR render — it
// does, both parse the same deterministic article).
const article = parseIrlArticle(articleBody);

const form = document.getElementById('irl-gen-form') as HTMLFormElement | null;
const status = document.getElementById('irl-gen-status') as HTMLParagraphElement | null;
const sectionsList = document.getElementById('irl-gen-sections-list') as HTMLDivElement | null;

/** Read a trimmed text-input value by id, or undefined when blank. */
function textValue(id: string): string | undefined {
  const el = document.getElementById(id) as HTMLInputElement | null;
  const v = el?.value.trim();
  return v ? v : undefined;
}

/** Append one custom-request input row to a section's custom-list. */
function addCustomRow(sectionNumber: string, presetText = ''): void {
  const list = sectionsList?.querySelector<HTMLDivElement>(
    `.irl-gen__custom-list[data-section="${CSS.escape(sectionNumber)}"]`
  );
  if (!list) return;
  if (list.querySelectorAll('.irl-gen__custom-input').length >= MAX_CUSTOM_PER_SECTION) return;

  const row = document.createElement('div');
  row.className = 'irl-gen__custom-row';

  // `brutal-input` is a GLOBAL brand class (src/styles/components/form.css),
  // so it styles this client-created input even though the page's scoped
  // `<style>` rules would not reach dynamically-created DOM.
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'brutal-input irl-gen__custom-input';
  input.maxLength = 500;
  input.placeholder = 'Custom request…';
  input.setAttribute('aria-label', `Custom request for section ${sectionNumber}`);
  input.value = presetText;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'irl-gen__custom-remove';
  remove.setAttribute('aria-label', 'Remove custom request');
  remove.textContent = '×';
  remove.addEventListener('click', () => row.remove());

  row.appendChild(input);
  row.appendChild(remove);
  list.appendChild(row);
}

// Section rows are rendered server-side (Astro template) so the scoped
// styles apply; the client only wires their behavior. Each section's
// "Add custom request" button appends an input row on click.
sectionsList?.querySelectorAll<HTMLButtonElement>('.irl-gen__add-custom').forEach((btn) => {
  const section = btn.dataset.section;
  if (section) btn.addEventListener('click', () => addCustomRow(section));
});

// ── Context panes: click-to-pin + per-question removal ──────────────────
//
// Hover remains a passive preview (CSS-only, pointer-events: none).
// Clicking the ⓘ PINS the pane open and interactive; click-away, the ×
// button, or Escape unpins. Keyboard path: Enter/Space on the ⓘ (a native
// button) pins — there is deliberately no focus-triggered preview, so no
// ghost-panel states.

const infoWrappers = Array.from(
  document.querySelectorAll<HTMLSpanElement>('.irl-gen__section-info')
);

function unpin(wrapper: HTMLSpanElement): void {
  wrapper.classList.remove('is-pinned');
  wrapper
    .querySelector<HTMLButtonElement>('.irl-gen__section-info-btn')
    ?.setAttribute('aria-expanded', 'false');
}

infoWrappers.forEach((wrapper) => {
  const infoBtn = wrapper.querySelector<HTMLButtonElement>('.irl-gen__section-info-btn');
  infoBtn?.addEventListener('click', () => {
    const pinned = wrapper.classList.toggle('is-pinned');
    infoBtn.setAttribute('aria-expanded', String(pinned));
    // Single-open: pinning one pane unpins any other.
    if (pinned) infoWrappers.forEach((other) => other !== wrapper && unpin(other));
  });
  wrapper
    .querySelector<HTMLButtonElement>('.irl-gen__section-panel-close')
    ?.addEventListener('click', () => {
      unpin(wrapper);
      infoBtn?.focus();
    });
});

// Click-away: containment check rather than stopPropagation, so a click on
// (say) a section checkbox both unpins the pane AND toggles the checkbox.
document.addEventListener('click', (event) => {
  const target = event.target as Node;
  infoWrappers.forEach((wrapper) => {
    if (wrapper.classList.contains('is-pinned') && !wrapper.contains(target)) unpin(wrapper);
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const pinned = infoWrappers.find((w) => w.classList.contains('is-pinned'));
  if (pinned) {
    unpin(pinned);
    pinned.querySelector<HTMLButtonElement>('.irl-gen__section-info-btn')?.focus();
  }
});

// Per-question removal toggles. Manual state = `.is-collapsed` on the row
// (the global delta-chevron rule flips the icon for free). Rows auto-skipped
// by a directive are inert (aria-disabled) until the context is deselected.
document.querySelectorAll<HTMLButtonElement>('.irl-gen__q-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const row = btn.closest('.irl-gen__q');
    if (!row || row.classList.contains('is-auto-skipped')) return;
    const removed = row.classList.toggle('is-collapsed');
    btn.setAttribute('aria-pressed', String(removed));
  });
});

/** The currently selected engagement context, or undefined for Unspecified. */
function selectedContext(): IRLTransactionContext | undefined {
  const raw = (form?.elements.namedItem('transactionContext') as RadioNodeList | null)?.value;
  return raw && TRANSACTION_CONTEXT_VALUES.has(raw as IRLTransactionContext)
    ? (raw as IRLTransactionContext)
    : undefined;
}

/**
 * Mark/unmark rows auto-skipped by the selected context's skip-if
 * directives (BL-044.5). Auto-skip is visually distinct from manual removal
 * (labeled, inert toggle) and is NOT sent at submit — the shared layer
 * derives it from `context`, keeping one source of truth. A pre-existing
 * manual `.is-collapsed` persists underneath and re-emerges on deselect.
 */
function renderAutoSkips(): void {
  const context = selectedContext();
  document.querySelectorAll<HTMLLIElement>('.irl-gen__q[data-skip-context]').forEach((row) => {
    const contexts = (row.dataset.skipContext ?? '').split(' ').filter(Boolean);
    const auto = context !== undefined && contexts.includes(context);
    row.classList.toggle('is-auto-skipped', auto);
    const toggle = row.querySelector<HTMLButtonElement>('.irl-gen__q-toggle');
    const label = row.querySelector<HTMLSpanElement>('.irl-gen__q-auto-label');
    if (toggle) {
      toggle.setAttribute('aria-disabled', String(auto));
      // Fold the auto reason into the accessible name so non-visual users
      // learn why the row is inert.
      if (!toggle.dataset.baseLabel) {
        toggle.dataset.baseLabel = toggle.getAttribute('aria-label') ?? '';
      }
      toggle.setAttribute(
        'aria-label',
        auto
          ? `${toggle.dataset.baseLabel} — auto-skipped for ${context}`
          : toggle.dataset.baseLabel
      );
    }
    if (label) label.textContent = auto ? `auto · ${context}` : '';
  });
}

form
  ?.querySelectorAll<HTMLInputElement>('input[name="transactionContext"]')
  .forEach((radio) => radio.addEventListener('change', renderAutoSkips));

// Select all / Clear all.
document.getElementById('irl-gen-select-all')?.addEventListener('click', () => {
  sectionsList
    ?.querySelectorAll<HTMLInputElement>('input[name="sections"]')
    .forEach((cb) => (cb.checked = true));
});
document.getElementById('irl-gen-clear-all')?.addEventListener('click', () => {
  sectionsList
    ?.querySelectorAll<HTMLInputElement>('input[name="sections"]')
    .forEach((cb) => (cb.checked = false));
});

// Hydrate form inputs from URL query params so the MCP tool's deeplink lands
// the user on a page already filled with the values that emerged through
// their Claude Desktop conversation — a one-click reproduce of the file.
if (form) {
  const params = new URL(window.location.href).searchParams;

  const setText = (id: string, value: string | null) => {
    if (!value) return;
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = value;
  };
  setText('targetName', params.get('target'));
  setText('companyName', params.get('company'));
  setText('projectName', params.get('project'));

  const contextFromUrl = params.get('context');
  if (contextFromUrl && TRANSACTION_CONTEXT_VALUES.has(contextFromUrl as IRLTransactionContext)) {
    const radio = form.querySelector<HTMLInputElement>(
      `input[name="transactionContext"][value="${CSS.escape(contextFromUrl)}"]`
    );
    if (radio) radio.checked = true;
  }

  if (params.get('canonical') === '1') {
    const cb = document.getElementById('showCanonicalReference') as HTMLInputElement | null;
    if (cb) cb.checked = true;
  }

  // `sections` = comma-separated numbers → check only those. Ignore unknown
  // numbers; if nothing matches a real section, leave all checked (the
  // default) rather than an empty, un-submittable form.
  const sectionsParam = params.get('sections');
  if (sectionsParam && sectionsList) {
    const wanted = new Set(sectionsParam.split(',').map((s) => s.trim()));
    const boxes = sectionsList.querySelectorAll<HTMLInputElement>('input[name="sections"]');
    const anyMatch = Array.from(boxes).some((cb) => wanted.has(cb.value));
    if (anyMatch) boxes.forEach((cb) => (cb.checked = wanted.has(cb.value)));
  }

  // `custom` = JSON array of { section, text }. Recreate the input rows
  // pre-filled. Defensive: bad JSON or unknown sections are skipped.
  const customParam = params.get('custom');
  if (customParam) {
    try {
      const parsed = JSON.parse(customParam) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const section = (item as IRLCustomRequest)?.section;
          const text = (item as IRLCustomRequest)?.text;
          if (typeof section === 'string' && typeof text === 'string' && text.trim()) {
            addCustomRow(section, text);
          }
        }
      }
    } catch {
      /* malformed custom param — ignore, form still usable */
    }
  }

  // `exclude` = comma-separated NN-II keys → pre-mark those question rows
  // as manually removed. Unknown keys are skipped (stale deeplinks must not
  // break the form).
  const excludeParam = params.get('exclude');
  if (excludeParam) {
    for (const key of excludeParam
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)) {
      const row = document.querySelector<HTMLLIElement>(
        `.irl-gen__q[data-question="${CSS.escape(key)}"]`
      );
      if (row) {
        row.classList.add('is-collapsed');
        row.querySelector('.irl-gen__q-toggle')?.setAttribute('aria-pressed', 'true');
      }
    }
  }
}

// Initial auto-skip render — covers both the `context` deeplink hydration
// above and the default (Unspecified) state.
renderAutoSkips();

if (form && status) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const companyName = textValue('companyName');
    const projectName = textValue('projectName');
    const targetName = textValue('targetName');

    const transactionContext = selectedContext();

    const showCanonicalReference =
      (document.getElementById('showCanonicalReference') as HTMLInputElement | null)?.checked ??
      false;

    // Collect included sections + per-section custom requests.
    const allBoxes = Array.from(
      sectionsList?.querySelectorAll<HTMLInputElement>('input[name="sections"]') ?? []
    );
    const includeSections = allBoxes.filter((cb) => cb.checked).map((cb) => cb.value);

    if (includeSections.length === 0) {
      status.textContent = 'Select at least one section to include.';
      return;
    }

    const customRequests: IRLCustomRequest[] = [];
    sectionsList?.querySelectorAll<HTMLDivElement>('.irl-gen__custom-list').forEach((list) => {
      const section = list.dataset.section;
      if (!section) return;
      list.querySelectorAll<HTMLInputElement>('.irl-gen__custom-input').forEach((input) => {
        const text = input.value.trim();
        if (text) customRequests.push({ section, text });
      });
    });

    // Manually removed questions (delta toggled in a pinned pane). Auto-skips
    // are NOT collected — the shared layer derives them from `context`, so
    // the deeplink + MCP payload stay one-source-of-truth.
    const excludeRequests = Array.from(
      document.querySelectorAll<HTMLLIElement>('.irl-gen__q.is-collapsed[data-question]')
    ).map((row) => row.dataset.question as string);

    // Single composed customization — same shared entry point the MCP tool
    // calls. Self-short-circuits (and stays value-identical to the universal
    // artifact) when nothing effective was configured.
    const built = customizeIrlArticle(article, {
      context: transactionContext,
      includeSections,
      customRequests,
      excludeRequests,
    });

    if (built.sections.length === 0) {
      status.textContent = 'Every remaining request is excluded — restore at least one request.';
      return;
    }

    const generatedAt = new Date();
    const buffer = generateIrlXlsxBuffer(built, {
      targetName,
      transactionContext,
      companyName,
      projectName,
      showCanonicalReference,
      generatedAt,
      canonicalUrl: `${window.location.origin}/hub/library/information-request-list/`,
    });
    const filename = buildIrlFilename(targetName, generatedAt);

    // Wrap in a fresh Uint8Array so the typed-array's underlying buffer
    // narrows from `ArrayBufferLike` to `ArrayBuffer` for the Blob ctor.
    // Small (~3-6 KB) buffer, so the copy is negligible.
    const blob = new Blob([new Uint8Array(buffer)], { type: IRL_XLSX_MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    const sizeKB = Math.round((buffer.byteLength / 1024) * 10) / 10;
    status.textContent = `Downloaded ${filename} (${sizeKB} KB).`;
  });
}
