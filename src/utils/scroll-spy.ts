/**
 * Shared scroll-spy for in-page navigation.
 *
 * Extracted from TableOfContents.astro so the MCP onboarding pages' sticky
 * section nav (OnboardingToc.astro) reuses the same algorithm instead of
 * carrying a second copy: the LAST section whose top edge has passed the
 * threshold is the active one, and its link gets `.is-active` — styling is
 * owned entirely by the consumer's CSS.
 *
 * Each link's href fragment names its section id. Runs once on wire-up so the
 * initial state is correct before the first scroll.
 */
export function initScrollSpy(
  links: ArrayLike<HTMLAnchorElement>,
  options?: {
    /** Viewport-top offset (px) a section must cross to become active (default 80). */
    threshold?: number;
  }
): void {
  const tocLinks = Array.from(links);
  const sectionIds = tocLinks
    .map((a) => a.getAttribute('href') ?? '')
    .filter((href) => href.startsWith('#'))
    .map((href) => href.slice(1));
  if (sectionIds.length === 0) return;

  const threshold = options?.threshold ?? 80;

  const onScroll = () => {
    let activeId = sectionIds[0];
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= threshold) activeId = id;
    }
    tocLinks.forEach((a) => {
      a.classList.toggle('is-active', a.getAttribute('href') === `#${activeId}`);
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
