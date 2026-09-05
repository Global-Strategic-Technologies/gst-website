/**
 * Language switcher behaviour (BL-153, hand-off §1).
 *
 * The markup is a `<button aria-haspopup="menu" aria-expanded>` trigger and a
 * `.lang-menu[role=menu]` of real `<a role=menuitem>` links, so navigation works
 * with no script at all; this file adds the disclosure contract:
 *   - click / Enter / Space on the trigger toggles the menu;
 *   - Escape, an outside click, or focus leaving the menu closes it and returns
 *     focus to the trigger;
 *   - ArrowDown / ArrowUp move between items, Home / End jump;
 *   - picking an item writes `localStorage.gstLang` and reports a `locale_switch`
 *     event before the link navigates.
 *
 * Follows the repo's existing disclosure shape (PortfolioHeader.astro's filter
 * drawer: aria-expanded toggle, document-level outside-click and Escape
 * handlers attached while open) and adds only what a `role="menu"` needs beyond
 * it: roving focus over the items and focus return to the trigger.
 *
 * Without JS the `<button>` is replaced by the `<a>` fallback the component
 * renders inside `<noscript>`; see LanguageSwitcher.astro.
 */
import { trackEvent } from '../utils/analytics';

export const GST_LANG_KEY = 'gstLang';

export function rememberLocale(code: string): void {
  try {
    localStorage.setItem(GST_LANG_KEY, code);
  } catch {
    // localStorage unavailable (private mode, blocked storage): the pick still
    // navigates; only the band suppression is lost.
  }
}

export function initLanguageSwitcher(root: HTMLElement): void {
  const triggerEl = root.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  const menuEl = root.querySelector<HTMLElement>('.lang-menu');
  if (!triggerEl || !menuEl) return;
  // Re-bound as non-null consts: the closures below outlive the guard above,
  // and TypeScript does not carry the narrowing into them.
  const trigger: HTMLButtonElement = triggerEl;
  const menu: HTMLElement = menuEl;

  const segment = trigger.closest<HTMLElement>('.brutal-segmented');
  const items = () => Array.from(menu.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]'));

  let onDocClick: ((e: MouseEvent) => void) | null = null;
  let onDocKey: ((e: KeyboardEvent) => void) | null = null;
  let onFocusOut: ((e: FocusEvent) => void) | null = null;

  const isOpen = () => trigger.getAttribute('aria-expanded') === 'true';

  function close(returnFocus = true): void {
    if (!isOpen()) return;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('brutal-segmented__btn--active');
    segment?.classList.remove('lang-switch__segment--open');
    menu.hidden = true;
    if (onDocClick) document.removeEventListener('click', onDocClick);
    if (onDocKey) document.removeEventListener('keydown', onDocKey);
    if (onFocusOut) root.removeEventListener('focusout', onFocusOut);
    onDocClick = onDocKey = onFocusOut = null;
    if (returnFocus) trigger.focus();
  }

  function open(): void {
    if (isOpen()) return;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('brutal-segmented__btn--active');
    segment?.classList.add('lang-switch__segment--open');
    menu.hidden = false;

    // Deferred one tick so the click that opened the menu is not the click
    // that closes it (same reason PortfolioHeader defers its drawer handler).
    setTimeout(() => {
      if (!isOpen()) return;
      onDocClick = (e: MouseEvent) => {
        if (e.target instanceof Node && !root.contains(e.target)) close(false);
      };
      document.addEventListener('click', onDocClick);
    }, 0);

    onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onDocKey);

    onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      // Focus left the switcher (tab past the last item, or a click elsewhere
      // that moved focus): close without stealing focus back.
      if (next instanceof Node) close(false);
    };
    root.addEventListener('focusout', onFocusOut);

    const [first] = items();
    first?.focus();
  }

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    if (isOpen()) close();
    else open();
  });

  trigger.addEventListener('keydown', (e) => {
    // Enter and Space are the button's native activation, handled by `click`.
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open();
    }
  });

  menu.addEventListener('keydown', (e) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLAnchorElement);
    if (list.length === 0) return;
    const focusAt = (i: number) => list[(i + list.length) % list.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(list.length - 1);
        break;
      case 'Tab':
        // Leaving the menu by Tab closes it; the browser moves focus onward.
        close(false);
        break;
    }
  });

  for (const item of items()) {
    item.addEventListener('click', () => {
      const to = item.getAttribute('lang') ?? '';
      const from = document.documentElement.lang;
      rememberLocale(to);
      trackEvent({ event: 'locale_switch', category: 'ui', from, to });
      // The link navigates on its own; nothing to prevent.
    });
  }
}

for (const root of document.querySelectorAll<HTMLElement>('.lang-switch')) {
  initLanguageSwitcher(root);
}
