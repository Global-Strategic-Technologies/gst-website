import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyWithFeedback } from '@/utils/copy-feedback';

// Minimal DOM mocks for the button element
function makeButton(text: string): HTMLElement {
  return {
    textContent: text,
    offsetWidth: 120,
    style: { width: '' } as CSSStyleDeclaration,
    classList: {
      _classes: new Set<string>(),
      add(cls: string) {
        this._classes.add(cls);
      },
      remove(cls: string) {
        this._classes.delete(cls);
      },
      contains(cls: string) {
        return this._classes.has(cls);
      },
    },
    getAttribute: vi.fn().mockReturnValue(null),
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
  } as unknown as HTMLElement;
}

describe('copyWithFeedback', () => {
  let originalClipboard: Clipboard;

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
    vi.useFakeTimers();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it('should write text to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const button = makeButton('Copy');
    await copyWithFeedback('hello world', button);

    expect(writeText).toHaveBeenCalledWith('hello world');
  });

  it('should show default feedback text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const button = makeButton('Copy Link');
    await copyWithFeedback('text', button);

    expect(button.textContent).toBe('Copied!');
  });

  it('should show custom feedback label', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const button = makeButton('Copy');
    await copyWithFeedback('text', button, { label: 'Done!' });

    expect(button.textContent).toBe('Done!');
  });

  it('should handle missing clipboard API gracefully', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const button = makeButton('Copy');
    // Should not throw
    await copyWithFeedback('text', button);

    expect(button.textContent).toBe('Copied!');
  });

  it('should handle clipboard write failure gracefully', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const button = makeButton('Copy');
    // Should not throw
    await copyWithFeedback('text', button);

    // Still shows success feedback (per the implementation's design choice)
    expect(button.textContent).toBe('Copied!');
  });

  it('should add and remove copiedClass during feedback period', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const button = makeButton('Copy');
    await copyWithFeedback('text', button, {
      copiedClass: 'is-copied',
      duration: 1000,
    });

    expect(
      (button.classList as unknown as { _classes: Set<string> })._classes.has('is-copied')
    ).toBe(true);

    vi.advanceTimersByTime(1000);

    expect(
      (button.classList as unknown as { _classes: Set<string> })._classes.has('is-copied')
    ).toBe(false);
  });
});
