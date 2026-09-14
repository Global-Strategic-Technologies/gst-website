/**
 * GA4 engagement events for the `/hub/mcp/*` family (BL-152 Slice 0).
 *
 * One module, one prefix (`mcp_`), `category: 'tool'`, and a `page` param on
 * every event — the hub-tool convention in GOOGLE_ANALYTICS.md § 9. Every call
 * below spells its event name and category out as single-quoted literals so
 * the static scanner in `tests/unit/tool-analytics.test.ts` can see them; do
 * not build event names dynamically here, and do not write an example call
 * in a comment (the scanner reads comments too).
 *
 * Funnel mapping: `mcp_guide_view` is the start milestone, `mcp_guide_complete`
 * the complete milestone, `mcp_endpoint_copied` the export milestone. The two
 * conversions (`mcp_request_access`, `mcp_trial_signup`) are the actions that
 * produce a lead; they are declared as GA4 key events by the operator.
 */
import { trackEvent } from './analytics';

/** `/hub/mcp/` marker inside a pathname, locale prefix or not. */
const FAMILY_SEGMENT = '/hub/mcp/';

/**
 * The page slug after `/hub/mcp/`: `landing` for the family root, else the
 * first path segment (`get-started`, `using`, `advanced-operations`, `docs`,
 * `trial`). Locale-prefixed URLs (`/xx/hub/mcp/…`) resolve the same way, which
 * is why this looks for the family segment rather than anchoring at `/`.
 */
export function mcpPageSlug(pathname: string = location.pathname): string {
  const at = pathname.indexOf(FAMILY_SEGMENT);
  if (at === -1) return 'unknown';
  const rest = pathname.slice(at + FAMILY_SEGMENT.length);
  const first = rest.split('/').filter(Boolean)[0];
  return first ?? 'landing';
}

export type CopyTarget = 'endpoint' | 'connector-name' | 'credential' | 'snippet';

/**
 * Reads the `data-copy-kind` attribute a copy control may carry. Anything not
 * in the enum reports as `snippet` so a typo in markup degrades to the default
 * rather than inventing a new dimension value.
 */
export function copyTargetOf(el: Element | null): CopyTarget {
  const kind = el?.getAttribute('data-copy-kind');
  return kind === 'endpoint' || kind === 'connector-name' || kind === 'credential'
    ? kind
    : 'snippet';
}

export function trackMcpGuideView(page: string = mcpPageSlug()): void {
  trackEvent({ event: 'mcp_guide_view', category: 'tool', page });
}

export function trackMcpGuideComplete(page: string = mcpPageSlug()): void {
  trackEvent({ event: 'mcp_guide_complete', category: 'tool', page });
}

export function trackMcpEndpointCopied(target: CopyTarget, page: string = mcpPageSlug()): void {
  trackEvent({ event: 'mcp_endpoint_copied', category: 'tool', page, target });
}

export function trackMcpClipPlay(clip: string, page: string = mcpPageSlug()): void {
  trackEvent({ event: 'mcp_clip_play', category: 'tool', page, clip });
}

export function trackMcpRequestAccess(location: string, page: string = mcpPageSlug()): void {
  trackEvent({ event: 'mcp_request_access', category: 'tool', page, location });
}

export function trackMcpTrialSignup(outcome: string, page: string = mcpPageSlug()): void {
  trackEvent({ event: 'mcp_trial_signup', category: 'tool', page, outcome });
}

/**
 * Fires `mcp_guide_complete` once when the element marked `[data-guide-end]`
 * (the gateway-CTA block at the foot of a guide) enters the viewport. Pages
 * without the marker never fire it; browsers without IntersectionObserver
 * never fire it either (a reader who cannot be observed is not counted as
 * finishing).
 */
export function observeGuideEnd(root: ParentNode = document): void {
  const end = root.querySelector<HTMLElement>('[data-guide-end]');
  if (!end || !window.IntersectionObserver) return;
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      io.disconnect();
      trackMcpGuideComplete();
    },
    { threshold: 0.25 }
  );
  io.observe(end);
}

/**
 * Fires `mcp_clip_play` the first time a clip actually renders frames
 * (`playing`, not `play`, so an autoplay attempt that the browser refuses is
 * not counted). The clip name is the encode's file stem without its `-web`
 * suffix, which is how MCP_ONBOARDING.md names them.
 */
export function observeClipPlay(vid: HTMLVideoElement): void {
  const src = vid.getAttribute('data-mp4') ?? '';
  const stem =
    src
      .split('/')
      .pop()
      ?.replace(/-web\.mp4$/, '') || 'unknown';
  vid.addEventListener('playing', () => trackMcpClipPlay(stem), { once: true });
}
