/**
 * Decides whether this browser loads ambient motion at all (BL-035, ADR-0039).
 *
 * Bundled into palette-manager.ts, which every page already loads, so it adds
 * no request of its own. A browser that never opted in stops here: it fetches
 * neither the effect (runtime.ts) nor its CSS.
 *
 * BaseLayout's inline head script still writes the settings onto <html>
 * before first paint; this reads them.
 *  - Opted in at page start: wait for `load`, then an idle moment, then
 *    import the runtime, so motion never competes with the page's own first
 *    render. It fades in when it arrives.
 *  - Switched on live from the panel: import straight away.
 *  - Reduced motion, or nothing on this page that the chosen scope would draw
 *    (Hero scope on a page without a hero layer): load nothing.
 *
 * The decision is published as <html data-ambient-loader>, the readiness
 * signal the E2E suite waits on. `off` and `skipped` are final until <html>'s
 * settings change, so a test gated on them proves the absence it asserts.
 */
import * as Sentry from '@sentry/browser';

type LoaderState = 'off' | 'deferred' | 'loading' | 'loaded' | 'skipped';

const root = document.documentElement;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
let requested = false;

const setState = (state: LoaderState) => root.setAttribute('data-ambient-loader', state);

/** Is there anything on this page that the chosen scope would draw? */
function hasSomewhereToDraw(): boolean {
  if (document.querySelector('[data-ambient-mount]')) return true;
  const scope = root.getAttribute('data-ambient-scope');
  if (scope === 'site') return true;
  return scope === 'page' && !!document.querySelector('#ambient-page[data-home]');
}

function load(): void {
  if (requested) return;
  requested = true;
  setState('loading');
  import('./runtime')
    .then(({ start }) => {
      start();
      setState('loaded');
    })
    .catch((error: unknown) => {
      // Nothing was built: the runtime inserts its CSS and layers only once
      // the import has resolved.
      Sentry.captureException(error, { tags: { feature: 'ambient-motion' } });
      setState('skipped');
    });
}

function afterLoadAndIdle(fn: () => void): void {
  // Safari before 18 has no requestIdleCallback (palette-manager.ts's pattern).
  const whenIdle =
    window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(cb, 1));
  const idle = () => whenIdle(fn, { timeout: 1500 });
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

function evaluate(live: boolean): void {
  if (requested) return; // once loaded, the runtime follows every change itself
  if (!root.hasAttribute('data-ambient')) return setState('off');
  if (reduce.matches || !hasSomewhereToDraw()) return setState('skipped');
  if (live) return load();
  setState('deferred');
  afterLoadAndIdle(load);
}

export function initAmbientLoader(): void {
  evaluate(false);
  new MutationObserver(() => evaluate(true)).observe(root, {
    attributes: true,
    attributeFilter: ['data-ambient', 'data-ambient-scope'],
  });
  reduce.addEventListener('change', () => evaluate(true));
}
