/**
 * Shared client-side behavior for the MCP onboarding pages
 * (/hub/mcp/get-started/, /hub/mcp/using/, /hub/mcp/advanced-operations/).
 *
 * Ported from the design handoff's prototype script. Three concerns:
 *
 * 1. Copy buttons — `[data-copy]` copies its attribute value; `[data-copy-prev]`
 *    walks up to the nearest ancestor holding a `[data-snippet]` and copies its
 *    text. Feedback runs through the shared `copyWithFeedback`.
 * 2. Screen-capture clips — `[data-clip]` videos lazy-attach their sources near
 *    the viewport (or when their wrapping `<details data-clip-details>` opens),
 *    autoplay muted in a loop, pause off-view and on hidden tabs, expose a
 *    Pause/Play overlay, fall back to native controls on error, and honor
 *    `prefers-reduced-motion` by not autoplaying at all (the poster is the
 *    reduced-motion state — see src/docs/hub/MCP_ONBOARDING.md).
 * 3. Scroll-spy for the sticky section nav lives in OnboardingToc.astro via
 *    the shared `initScrollSpy` util.
 */
import { copyWithFeedback } from './copy-feedback';

function initCopyButtons(): void {
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

function initClip(vid: HTMLVideoElement, reduce: boolean): void {
  const frame = vid.parentElement;
  const toggle = frame?.querySelector<HTMLButtonElement>('[data-clip-toggle]') ?? null;
  const placeholder = frame?.querySelector<HTMLElement>('[data-clip-placeholder]') ?? null;
  const badge = frame?.querySelector<HTMLElement>('[data-clip-badge]') ?? null;
  const details = vid.closest<HTMLDetailsElement>('[data-clip-details]');
  if (toggle) toggle.hidden = true;
  if (badge) badge.hidden = true;
  vid.muted = true;
  vid.playsInline = true;

  let attached = false;
  const attach = () => {
    if (attached) return;
    attached = true;
    const poster = vid.getAttribute('data-poster');
    if (poster) vid.poster = poster;
    placeholder?.remove();
    if (badge) badge.hidden = false;
    for (const [attr, type] of [
      ['data-webm', 'video/webm'],
      ['data-mp4', 'video/mp4'],
    ] as const) {
      const url = vid.getAttribute(attr);
      if (!url) continue;
      const s = document.createElement('source');
      s.src = url;
      s.type = type;
      vid.appendChild(s);
    }
    vid.preload = 'metadata';
    vid.load();
  };
  const whenNear = (fn: () => void) => {
    if (!window.IntersectionObserver) {
      fn();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          io.disconnect();
          fn();
        }
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(details ?? vid);
  };

  if (reduce) {
    // Reduced motion: no autoplay, no loop, native controls; the poster is the
    // static state until the reader chooses to play.
    vid.loop = false;
    vid.removeAttribute('autoplay');
    vid.pause();
    vid.controls = true;
    if (details) {
      details.addEventListener('toggle', () => {
        if (details.open) attach();
      });
    } else {
      whenNear(attach);
    }
    return;
  }

  vid.loop = true;
  vid.autoplay = true;

  // The overlay toggle carries one state signal: its accessible name (the
  // Pause/Play label). `aria-pressed` would double-signal the same state.
  const sync = () => {
    if (!toggle || vid.controls) return;
    toggle.hidden = false;
    toggle.textContent = vid.paused ? 'Play' : 'Pause';
  };

  const fallback = () => {
    if (toggle) toggle.hidden = true;
    vid.controls = true;
  };
  const broken = () => !!vid.error;

  let userPaused = false;
  if (toggle) {
    toggle.addEventListener('click', () => {
      userPaused = !vid.paused;
      if (userPaused) vid.pause();
      else void vid.play();
    });
    vid.addEventListener('play', sync);
    vid.addEventListener('pause', sync);
  }
  vid.addEventListener('error', fallback);

  let inView = true;
  const attempt = () => {
    if (userPaused || !inView || document.visibilityState !== 'visible') return;
    if (details && !details.open) return;
    if (broken()) {
      fallback();
      return;
    }
    attach();
    const p = vid.play();
    if (p?.catch) {
      p.catch(() => {
        if (broken()) fallback();
        else sync();
      });
    }
    sync();
  };
  // Hidden tab: pause outright (browsers do not reliably do this for muted
  // loops); on return, `attempt()` resumes unless the reader paused it.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      if (!vid.paused) vid.pause();
    } else {
      attempt();
    }
  });
  vid.addEventListener('canplay', attempt);
  if (details) {
    details.addEventListener('toggle', () => {
      if (details.open) {
        userPaused = false;
        attach();
        attempt();
      } else {
        vid.pause();
      }
    });
  } else {
    whenNear(attach);
  }

  if (window.IntersectionObserver) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          inView = en.isIntersecting;
          if (inView) attempt();
          else if (!vid.paused) vid.pause();
        });
      },
      { threshold: 0.35 }
    );
    io.observe(vid);
  }
  attempt();
}

function initClips(): void {
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll<HTMLVideoElement>('[data-clip]').forEach((vid) => {
    initClip(vid, reduce);
  });
}

initCopyButtons();
initClips();
