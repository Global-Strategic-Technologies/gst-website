/**
 * Shared copy-to-clipboard utility with visual button feedback.
 *
 * Handles: clipboard write, text swap on button (or optional target element),
 * optional CSS class toggle, and configurable reset duration.
 *
 * `initCopyButtons` at the bottom is the delegated wiring the MCP pages share.
 * It is exported separately so the five other importers of this module pull
 * only `copyWithFeedback`.
 */
export async function copyWithFeedback(
  text: string,
  button: HTMLElement,
  options?: {
    /** Feedback text shown on success (default: 'Copied!') */
    label?: string;
    /** Reset delay in ms (default: 2000) */
    duration?: number;
    /** CSS class added during feedback period */
    copiedClass?: string;
    /** Element to show feedback text on instead of button (e.g. a child <span>) */
    feedbackTarget?: HTMLElement;
  }
): Promise<void> {
  const target = options?.feedbackTarget ?? button;
  const duration = options?.duration ?? 2000;
  const successLabel = options?.label ?? 'Copied!';

  // Use stored original to survive rapid re-clicks while feedback is showing
  const DATA_KEY = 'data-copy-original';
  const WIDTH_KEY = 'data-copy-width';
  const original = button.getAttribute(DATA_KEY) ?? target.textContent;
  button.setAttribute(DATA_KEY, original ?? '');

  // Lock the button min-width so text changes don't shrink it
  if (!button.getAttribute(WIDTH_KEY)) {
    const w = button.offsetWidth;
    button.style.minWidth = `${w}px`;
    button.setAttribute(WIDTH_KEY, `${w}`);
  }

  const reset = () => {
    target.textContent = original;
    if (options?.copiedClass) button.classList.remove(options.copiedClass);
    button.removeAttribute(DATA_KEY);
    button.style.minWidth = '';
    button.removeAttribute(WIDTH_KEY);
  };

  if (options?.copiedClass) button.classList.add(options.copiedClass);

  if (!navigator.clipboard) {
    target.textContent = successLabel;
    setTimeout(reset, duration);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard write can fail (permissions, insecure context, etc.)
    // Show success feedback regardless — the URL is already in the address bar
  }
  target.textContent = successLabel;
  setTimeout(reset, duration);
}

/**
 * Document-level copy delegation for the MCP pages.
 *
 * `[data-copy]` copies its own attribute value. `[data-copy-prev]` walks up to
 * the nearest ancestor holding a `[data-snippet]` and copies that element's
 * text, which is how a multi-line snippet stays authored in the markup rather
 * than duplicated into an attribute.
 *
 * Delegated from `document`, so panes and rows that were not in the DOM at wiring
 * time still work. Lived inline in `mcp-onboarding.ts` until `/hub/mcp/docs/`
 * needed the same behavior; one definition, both pages.
 */
export function initCopyButtons(): void {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-copy],[data-copy-prev]'
    );
    if (!btn) return;
    let text = btn.getAttribute('data-copy');
    if (text === null) {
      // Walk up until a snippet is actually in scope — the nearest wrapper is
      // usually the button's own footer row, which holds no snippet.
      let box: HTMLElement | null = btn.parentElement;
      let snip: HTMLElement | null = null;
      while (box && !(snip = box.querySelector('[data-snippet]'))) box = box.parentElement;
      text = snip?.textContent?.trim() ?? '';
    }
    if (!text) return;
    void copyWithFeedback(text, btn, {
      label: 'Copied',
      duration: 1600,
      copiedClass: 'brutal-btn--copied',
    });
  });
}
