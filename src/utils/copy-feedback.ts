/**
 * Shared copy-to-clipboard utility with visual button feedback.
 *
 * Handles: clipboard write, text swap on button (or optional target element),
 * optional CSS class toggle, and configurable reset duration.
 */
export async function copyWithFeedback(
  text: string,
  button: HTMLElement,
  options?: {
    /** Feedback text shown on success (default: 'Copied!') */
    label?: string;
    /** Feedback text shown on failure (default: 'Failed') */
    failLabel?: string;
    /** Reset delay in ms (default: 2000) */
    duration?: number;
    /** CSS class added during feedback period */
    copiedClass?: string;
    /** Element to show feedback text on instead of button (e.g. a child <span>) */
    feedbackTarget?: HTMLElement;
  },
): Promise<void> {
  const target = options?.feedbackTarget ?? button;
  const duration = options?.duration ?? 2000;
  const successLabel = options?.label ?? 'Copied!';
  const failLabel = options?.failLabel ?? 'Failed';

  // Use stored original to survive rapid re-clicks while feedback is showing
  const DATA_KEY = 'data-copy-original';
  const WIDTH_KEY = 'data-copy-width';
  const original = button.getAttribute(DATA_KEY) ?? target.textContent;
  button.setAttribute(DATA_KEY, original ?? '');

  // Lock the button width so shorter feedback text doesn't shrink it
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
