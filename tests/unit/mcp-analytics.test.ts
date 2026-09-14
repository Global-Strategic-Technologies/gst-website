/**
 * BL-152 Slice 0 — `mcp_` event module.
 *
 * Runs in vitest's node environment: `window` is stubbed with a gtag mock the
 * way `analytics.test.ts` does it, and the DOM-observing helpers
 * (`observeGuideEnd`, `observeClipPlay`) are exercised only through the pure
 * pieces they are built from. The E2E case in `tests/e2e/analytics.test.ts`
 * covers the wired page.
 */
import {
  copyTargetOf,
  mcpPageSlug,
  trackMcpClipPlay,
  trackMcpEndpointCopied,
  trackMcpGuideComplete,
  trackMcpGuideView,
  trackMcpRequestAccess,
  trackMcpTrialSignup,
} from '@/utils/mcp-analytics';

describe('mcpPageSlug', () => {
  it('names the family root "landing"', () => {
    expect(mcpPageSlug('/hub/mcp/')).toBe('landing');
  });

  it('takes the first segment after /hub/mcp/', () => {
    expect(mcpPageSlug('/hub/mcp/get-started/')).toBe('get-started');
    expect(mcpPageSlug('/hub/mcp/docs/')).toBe('docs');
    expect(mcpPageSlug('/hub/mcp/trial')).toBe('trial');
    expect(mcpPageSlug('/hub/mcp/from-code/')).toBe('from-code');
  });

  it('ignores a locale prefix without naming any locale', () => {
    // The prefix here is deliberately fictional: the point is that ANY leading
    // segment is skipped, so the module never has to know the locale list.
    expect(mcpPageSlug('/xx-YY/hub/mcp/using/')).toBe('using');
    expect(mcpPageSlug('/xx/hub/mcp/')).toBe('landing');
  });

  it('reports "unknown" off the family', () => {
    expect(mcpPageSlug('/hub/tools/techpar/')).toBe('unknown');
  });
});

describe('copyTargetOf', () => {
  const el = (kind: string | null) => ({ getAttribute: () => kind }) as unknown as Element;

  it('passes through the three named kinds', () => {
    expect(copyTargetOf(el('endpoint'))).toBe('endpoint');
    expect(copyTargetOf(el('connector-name'))).toBe('connector-name');
    expect(copyTargetOf(el('credential'))).toBe('credential');
  });

  it('degrades anything else to "snippet"', () => {
    expect(copyTargetOf(el(null))).toBe('snippet');
    expect(copyTargetOf(el('typo'))).toBe('snippet');
    expect(copyTargetOf(null)).toBe('snippet');
  });
});

describe('mcp_ trackers', () => {
  let gtagMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    gtagMock = vi.fn();
    (global as any).window = { gtag: gtagMock };
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (global as any).window;
  });

  const params = () => gtagMock.mock.calls[0][2];

  it('every event carries category "tool" and the page', () => {
    trackMcpGuideView('get-started');
    expect(gtagMock).toHaveBeenCalledWith('event', 'mcp_guide_view', expect.anything());
    expect(params()).toMatchObject({ event_category: 'tool', page: 'get-started' });
  });

  it('mcp_guide_complete', () => {
    trackMcpGuideComplete('using');
    expect(gtagMock).toHaveBeenCalledWith(
      'event',
      'mcp_guide_complete',
      expect.objectContaining({ page: 'using' })
    );
  });

  it('mcp_endpoint_copied carries the target', () => {
    trackMcpEndpointCopied('endpoint', 'landing');
    expect(params()).toMatchObject({ page: 'landing', target: 'endpoint' });
  });

  it('mcp_clip_play carries the clip stem', () => {
    trackMcpClipPlay('connector-enabled', 'get-started');
    expect(gtagMock).toHaveBeenCalledWith(
      'event',
      'mcp_clip_play',
      expect.objectContaining({ clip: 'connector-enabled' })
    );
  });

  it('mcp_request_access carries the location', () => {
    trackMcpRequestAccess('hub-mcp', 'landing');
    expect(gtagMock).toHaveBeenCalledWith(
      'event',
      'mcp_request_access',
      expect.objectContaining({ location: 'hub-mcp' })
    );
  });

  it('mcp_trial_signup carries the outcome', () => {
    trackMcpTrialSignup('issued', 'trial');
    expect(gtagMock).toHaveBeenCalledWith(
      'event',
      'mcp_trial_signup',
      expect.objectContaining({ outcome: 'issued' })
    );
  });
});
