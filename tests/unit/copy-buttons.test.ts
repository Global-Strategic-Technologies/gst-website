// @vitest-environment jsdom
/**
 * `initCopyButtons` — the delegated wiring, and specifically the quiet path.
 *
 * SEPARATE FILE, not folded into `copy-feedback.test.ts`, because of the
 * pragma above: this needs a real document to delegate from, while that suite
 * runs under the project's `environment: 'node'` against hand-built element
 * mocks. Switching the environment for the whole file would silently change
 * what those five tests exercise. `jsdom` is already a devDependency, so this
 * costs no config change.
 *
 * The quiet path exists because `/hub/mcp/docs/` copies argument values from
 * controls whose visible text IS the payload. The default path swaps that text
 * to "Copied", which would delete the literal, the screen-reader name qualifier
 * and both glyphs in one write. What is asserted here is the property that
 * matters — the button's own subtree is untouched — plus the two failure modes
 * that would silently disable the confirmation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initCopyButtons } from '@/utils/copy-feedback';

/** Wired once per document; each test gets a fresh one. */
function mount(html: string): void {
  document.body.innerHTML = html;
  initCopyButtons();
}

const QUIET_BUTTON = `
  <button type="button" class="mdoc-args__value" data-copy="18400000" data-copy-quiet>
    <span class="sr-only">copy example value for arr: </span><span class="lit">18400000</span>
  </button>
  <button type="button" id="b2" class="mdoc-args__value" data-copy="84" data-copy-quiet>
    <span class="lit">84</span>
  </button>
`;

const REGION = '<p role="status" data-copy-status></p>';

const btn = () => document.querySelector<HTMLElement>('[data-copy-quiet]')!;
const region = () => document.querySelector<HTMLElement>('[data-copy-status]');

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('initCopyButtons — quiet controls', () => {
  it('leaves the button subtree untouched and announces in the page region', async () => {
    mount(REGION + QUIET_BUTTON);
    const before = btn().innerHTML;

    btn().click();
    await vi.advanceTimersByTimeAsync(0);

    expect(btn().innerHTML).toBe(before);
    expect(region()!.textContent).toBe('Copied');
  });

  it('still leaves the button untouched when the page has no status region', async () => {
    // The degradation has to be "no confirmation", never "corrupted value": a
    // page that forgets the region must not fall back to swapping the literal.
    mount(QUIET_BUTTON);
    const before = btn().innerHTML;

    btn().click();
    await vi.advanceTimersByTimeAsync(0);

    expect(btn().innerHTML).toBe(before);
  });

  it('can announce again after a second copy inside the feedback window', async () => {
    // The defect this exists for: `copyWithFeedback` stores its target's prior
    // text ON THE BUTTON, which is per-button bookkeeping for a per-page
    // element. Routed through it, the second button would capture "Copied" as
    // the region's original and restore it on reset, leaving the region stuck
    // on that word for the rest of the page's life and every later copy a
    // no-op write. So the region is written directly instead, and this asserts
    // the second click is still a real transition.
    mount(REGION + QUIET_BUTTON);

    btn().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(region()!.textContent).toBe('Copied');

    // Well inside the 1600ms window the first click opened.
    await vi.advanceTimersByTimeAsync(400);
    document.querySelector<HTMLElement>('#b2')!.click();
    expect(region()!.textContent).toBe('');
    await vi.advanceTimersByTimeAsync(0);
    expect(region()!.textContent).toBe('Copied');

    // And once both feedback windows have closed, the region is not stuck.
    await vi.advanceTimersByTimeAsync(2000);
    document.querySelector<HTMLElement>('#b2')!.click();
    expect(region()!.textContent).toBe('');
  });

  it('leaves an ordinary copy button on the default path', async () => {
    // The quiet branch is opt-in: everything already using this delegation
    // keeps its label swap and its `.brutal-btn--copied` state.
    mount(`${REGION}<button type="button" class="brutal-btn" data-copy="hello">Copy</button>`);
    const plain = document.querySelector<HTMLElement>('[data-copy]')!;

    plain.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(plain.textContent).toBe('Copied');
    expect(plain.classList.contains('brutal-btn--copied')).toBe(true);
    expect(region()!.textContent).toBe('');
  });
});
