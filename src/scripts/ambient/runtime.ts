/**
 * Ambient motion's runtime (BL-035, ADR-0039). Imported only by loader.ts, and
 * only in a browser that opted in, so no visitor who never did downloads it.
 *
 * start():
 *  1. inserts the effect CSS (a string, via ?inline: see ambient.css),
 *  2. builds the effect into each placeholder `[data-ambient-mount]`
 *     (AmbientEffect.astro: the homepage hero, the /brand preview stage),
 *  3. runs the page / site background (AmbientPage.astro's placeholder),
 *  4. marks the layers ready, which fades them in.
 *
 * The page background: `#ambient-page` is the first child of <main>. `main`
 * is a stacking context, so the layer's z-index -1 sits above the body's
 * checkerboard and below every section. It starts below the page's `.hero`,
 * and is a stack of empty one-screen spacers; a spacer holds a tile only while
 * it is on screen (an IntersectionObserver adds it and removes it). At most
 * two spacers can be on screen at once (they are 100lvh): the "≤16 in view,
 * ≤32 running" budget recorded in ADR-0039.
 */
import css from './ambient.css?inline';
import { buildLayers, buildTile } from './build';

const STYLE_ID = 'ambient-css';

function insertStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.append(style);
}

function mountLayers(): HTMLElement[] {
  const mounts = [...document.querySelectorAll<HTMLElement>('[data-ambient-mount]')];
  for (const mount of mounts) if (!mount.firstElementChild) mount.append(...buildLayers());
  return mounts;
}

function startPageBackground(layer: HTMLElement, ownLayers: HTMLElement[]): void {
  const main = layer.parentElement;
  if (!main) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tile = buildTile();
  let armed = false;
  let frame = 0;

  // Only an on-screen spacer holds the effect. -1px: a spacer that merely
  // touches the viewport edge does not count, so at most two are ever live.
  const live = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const spacer = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          if (!spacer.firstChild) spacer.append(tile.cloneNode(true));
        } else {
          spacer.replaceChildren();
        }
      }
    },
    { rootMargin: '-1px' }
  );

  // The page's own layers (the homepage hero's, /brand's preview stage) keep
  // running in every scope. While this background is active, each stops when
  // it scrolls away, so everything together still holds "≤32 running".
  const ownLive = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        entry.target.toggleAttribute('data-offscreen', !entry.isIntersecting);
    },
    { rootMargin: '-1px' }
  );

  const schedule = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  };

  // main: content reflow. The first spacer: a height-only window resize
  // changes 100lvh without changing main, which would leave the foot bare.
  const resize = new ResizeObserver(schedule);

  function arm(on: boolean): void {
    if (on === armed) return;
    armed = on;
    if (on) {
      resize.observe(main!);
      reduce.addEventListener('change', schedule);
      for (const el of ownLayers) ownLive.observe(el);
    } else {
      resize.disconnect();
      reduce.removeEventListener('change', schedule);
      ownLive.disconnect();
      for (const el of ownLayers) el.removeAttribute('data-offscreen');
    }
  }

  function spacer(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ambient-page__tile';
    live.observe(el);
    return el;
  }

  function sync(): void {
    const shown = getComputedStyle(layer).display !== 'none';
    arm(shown);
    if (!shown || reduce.matches) {
      live.disconnect();
      layer.replaceChildren();
      layer.removeAttribute('data-placed');
      return;
    }

    const hero = main!.querySelector('.hero');
    const top = hero ? hero.getBoundingClientRect().bottom - main!.getBoundingClientRect().top : 0;
    layer.style.setProperty('--ambient-page-top', `${Math.max(0, Math.round(top))}px`);
    layer.setAttribute('data-placed', '');

    // First pass: one spacer has to exist before its height can be measured.
    if (!layer.firstElementChild) layer.append(spacer());
    const first = layer.firstElementChild as HTMLElement;
    resize.observe(first);

    const need = Math.max(1, Math.ceil(layer.clientHeight / first.offsetHeight));
    while (layer.children.length < need) layer.append(spacer());
    while (layer.children.length > need) {
      const last = layer.lastElementChild as HTMLElement;
      live.unobserve(last);
      last.remove();
    }
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-ambient', 'data-ambient-scope'],
  });
  sync();
}

let started = false;

export function start(): void {
  if (started) return;
  started = true;
  insertStyles();
  const mounts = mountLayers();
  const page = document.getElementById('ambient-page');
  // Collected after mounting, so the page's own layers are all in the list.
  if (page) startPageBackground(page, mounts);
  // Resolve the layers' opacity-0 style first, so the fade has a start to run
  // from; flipping the attribute in the same style pass would skip it.
  for (const mount of mounts) void getComputedStyle(mount).opacity;
  for (const mount of mounts) mount.setAttribute('data-ambient-ready', '');
}
