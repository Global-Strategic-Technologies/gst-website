/**
 * Browser behavior for `/hub/mcp/docs/`.
 *
 * WHAT THIS MODULE DOES NOT DO: show and hide the lenses and contract panes.
 * That is CSS, driven by `:target` plus two attributes the page's inline
 * bootstrap writes on `<html>` before the panes are parsed, so a deep link
 * paints its contract directly and a reader without JS gets the whole document
 * as one linear reference. See the page's `<style>` block and ADR-0023.
 *
 * What is left needs a script, and only that:
 *   1. Keeping `data-lens` / `data-cap` in step with the hash after navigation.
 *   2. The sidebar's selected marker (CSS cannot match a link against `:target`).
 *   3. The capability search dropdown.
 *   4. The count row's jump, which scrolls the nav container rather than the page.
 *
 * DOM-only, so excluded from coverage (`vitest.config.ts`) and exercised by
 * `tests/e2e/hub-mcp-docs.test.ts`. The matcher and slug logic it shares with
 * the build live in `mcp-capability-search.ts`, which IS unit-tested.
 */
import { initCopyButtons } from './copy-feedback';
import { searchCapabilities, type SearchableCapability } from './mcp-capability-search';

/** Mirrors the inline bootstrap. Both must agree on what a hash means. */
function applyHash(): void {
  const root = document.documentElement;
  const hash = location.hash.slice(1);
  if (hash.startsWith('cap-')) {
    root.dataset.lens = 'reference';
    // A hash naming no pane (a stale or mistyped link) must not leave Reference
    // blank: dropping the attribute re-shows the default contract, which is the
    // CSS's no-capability state. The inline bootstrap cannot make this check —
    // it runs before the panes exist, which is exactly why it runs early.
    if (document.getElementById(hash)) root.dataset.cap = hash;
    else delete root.dataset.cap;
  } else if (hash === 'reference') {
    root.dataset.lens = 'reference';
    delete root.dataset.cap;
  } else {
    root.dataset.lens = 'jobs';
    delete root.dataset.cap;
  }
  markSelected();
  markLens();
  flushGroupJump();
}

/** Sidebar selection marker. `aria-current` carries it; the class styles it. */
function markSelected(): void {
  const active = document.documentElement.dataset.cap ?? '';
  document.querySelectorAll<HTMLAnchorElement>('[data-cap-link]').forEach((link) => {
    const isActive = link.getAttribute('href') === `#${active}`;
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}

/** Lens switch state. Same reasoning: `aria-current` is the signal. */
function markLens(): void {
  const lens = document.documentElement.dataset.lens ?? 'jobs';
  document.querySelectorAll<HTMLAnchorElement>('[data-lens-link]').forEach((link) => {
    const isActive = link.dataset.lensLink === lens;
    link.classList.toggle('brutal-segmented__btn--active', isActive);
    if (isActive) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}

/**
 * The search index, read from the sidebar rather than serialized separately.
 * The sidebar already IS the full capability list; a second copy in a JSON
 * island would be one more thing to keep in step.
 */
function readIndex(): (SearchableCapability & { href: string })[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('[data-cap-link]')].map((link) => ({
    id: link.dataset.capId ?? '',
    type: link.dataset.capType ?? '',
    gloss: link.dataset.capGloss ?? '',
    href: link.getAttribute('href') ?? '',
  }));
}

/**
 * Capability lookup.
 *
 * Markup and keyboard contract lifted from the Regulatory Map's search
 * (`src/pages/hub/tools/regulatory-map/index.astro`): a `.brutal-search` field
 * with a sibling `role="listbox"`, arrow keys moving `aria-activedescendant`,
 * Enter committing, Escape closing. That page's script is not extracted because
 * it filters an in-page list and owns filter-chip state; this one navigates.
 */
function initSearch(): void {
  const field = document.querySelector<HTMLElement>('[data-cap-search]');
  const input = document.querySelector<HTMLInputElement>('[data-cap-search-input]');
  const results = document.querySelector<HTMLElement>('[data-cap-search-results]');
  if (!field || !input || !results) return;

  // Hidden in the markup so a reader without JS never meets a dead field.
  field.hidden = false;

  const index = readIndex();
  let active = -1;

  const close = () => {
    results.hidden = true;
    results.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const options = () => [...results.querySelectorAll<HTMLElement>('[role="option"]')];

  const highlight = (next: number) => {
    const opts = options();
    if (!opts.length) return;
    active = (next + opts.length) % opts.length;
    opts.forEach((opt, i) => {
      opt.classList.toggle('brutal-search__result--active', i === active);
      opt.setAttribute('aria-selected', i === active ? 'true' : 'false');
    });
    input.setAttribute('aria-activedescendant', opts[active].id);
  };

  const render = () => {
    const matches = searchCapabilities(index, input.value);
    results.innerHTML = '';
    active = -1;

    if (!input.value.trim()) {
      close();
      return;
    }

    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'brutal-search__no-results';
      // textContent, not innerHTML: the query is user input.
      empty.textContent = `No capability matches "${input.value.trim()}"`;
      results.appendChild(empty);
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    matches.forEach((match, i) => {
      const option = document.createElement('a');
      option.id = `mdoc-search-option-${i}`;
      // Design-system classes throughout, not bespoke ones: these elements are
      // built at runtime, so Astro's scoped styles would never reach them.
      option.className = 'brutal-search__result';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.href = match.href;

      const name = document.createElement('span');
      name.className = 'brutal-search__result-name';
      name.textContent = match.id;

      const type = document.createElement('span');
      type.className = 'brutal-search__result-meta';
      type.textContent = match.type;

      option.append(name, type);
      option.addEventListener('click', () => {
        input.value = '';
        close();
      });
      results.appendChild(option);
    });

    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  input.addEventListener('input', render);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      input.value = '';
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlight(active + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlight(active - 1);
      return;
    }
    if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      options()[active]?.click();
      // The anchor's own navigation updates the hash; clear the field after it.
      input.value = '';
      close();
    }
  });

  document.addEventListener('click', (event) => {
    if (!field.contains(event.target as Node)) close();
  });
}

/**
 * A group jump requested by the counts row, pending the lens actually being
 * rendered. A click handler fires BEFORE the browser follows the fragment, so
 * measuring the sidebar there reads a `display: none` element: zero height,
 * zero scrollHeight, and a scroll that silently does nothing.
 */
let pendingGroup: string | null = null;

/**
 * Scroll the sidebar to a group, once it is on screen to be scrolled.
 *
 * Moves the nav's own scroll position rather than calling `scrollIntoView`,
 * which would drag the whole page when the sidebar is a sticky side column.
 * When the sidebar is short enough not to scroll at all, the page moves
 * instead, still without `scrollIntoView` so the sticky header is accounted for.
 */
function flushGroupJump(): void {
  if (!pendingGroup) return;
  const group = pendingGroup;
  pendingGroup = null;
  requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(`[data-ref-group="${group}"]`);
    const nav = target?.closest<HTMLElement>('[data-cap-nav]');
    if (!target || !nav) return;
    if (nav.scrollHeight > nav.clientHeight) {
      nav.scrollTop = target.offsetTop - nav.offsetTop;
    } else {
      window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - 80);
    }
  });
}

function initGroupJumps(): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-group-jump]').forEach((link) => {
    link.addEventListener('click', () => {
      pendingGroup = link.dataset.groupJump ?? null;
      // Already on Reference: no hash change is coming, so nothing else will
      // flush this.
      if (location.hash === '#reference') flushGroupJump();
    });
  });
}

export function initMcpDocs(): void {
  applyHash();
  window.addEventListener('hashchange', applyHash);
  initSearch();
  initGroupJumps();
  // Every contract's Example box carries a Copy button.
  initCopyButtons();
}

initMcpDocs();
