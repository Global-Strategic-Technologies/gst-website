/**
 * Google Analytics 4 Unit Tests
 * Tests the analytics utility functions
 */

import { trackEvent, trackNavigation, trackCTA, trackThemeToggle } from '@/utils/analytics';

describe('Analytics Utility Functions', () => {
  let gtagMock: any;

  beforeEach(() => {
    // Create mock gtag function
    gtagMock = vi.fn();
    (global as any).window = {
      gtag: gtagMock,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('trackEvent', () => {
    it('should call gtag with event command', () => {
      trackEvent({ event: 'test_event', category: 'navigation' });

      expect(gtagMock).toHaveBeenCalledWith('event', 'test_event', {
        event_category: 'navigation',
      });
    });

    it('should include all event data in gtag call', () => {
      trackEvent({
        event: 'test_event',
        category: 'navigation',
        label: 'Test Label',
        value: 42,
      });

      expect(gtagMock).toHaveBeenCalledWith('event', 'test_event', {
        event_category: 'navigation',
        label: 'Test Label',
        value: 42,
      });
    });

    it('should support tool category for hub tool events', () => {
      trackEvent({ event: 'tp_start', category: 'tool', page: 'techpar' });

      expect(gtagMock).toHaveBeenCalledWith('event', 'tp_start', {
        event_category: 'tool',
        page: 'techpar',
      });
    });

    it('should not call gtag if window.gtag is not available', () => {
      (global as any).window = {};

      trackEvent({ event: 'test', category: 'navigation' });

      expect(gtagMock).not.toHaveBeenCalled();
    });
  });

  describe('trackNavigation', () => {
    it('should track navigation_click event', () => {
      trackNavigation('/services', 'Services Link');

      expect(gtagMock).toHaveBeenCalledWith('event', 'navigation_click', {
        event_category: 'navigation',
        label: 'Services Link',
        destination: '/services',
      });
    });

    it('should include destination URL in event data', () => {
      trackNavigation('/portfolio', 'Portfolio');

      const callArgs = gtagMock.mock.calls[0];
      expect(callArgs[2].destination).toBe('/portfolio');
    });
  });

  describe('trackCTA', () => {
    it('should track cta_click event with type and location', () => {
      trackCTA('calendly', 'hero');

      expect(gtagMock).toHaveBeenCalledWith('event', 'cta_click', {
        event_category: 'engagement',
        cta_type: 'calendly',
        location: 'hero',
      });
    });

    it('should include CTA type in event data', () => {
      trackCTA('email', 'footer');

      const callArgs = gtagMock.mock.calls[0];
      expect(callArgs[2].cta_type).toBe('email');
      expect(callArgs[2].location).toBe('footer');
    });

    it('should track hero secondary CTA (services type)', () => {
      trackCTA('services', 'hero');

      expect(gtagMock).toHaveBeenCalledWith('event', 'cta_click', {
        event_category: 'engagement',
        cta_type: 'services',
        location: 'hero',
      });
    });

    it('should use engagement category for all CTA clicks', () => {
      trackCTA('calendly', 'hero');
      trackCTA('services', 'hero');
      trackCTA('calendly', 'cta-section');

      expect(gtagMock.mock.calls[0][2].event_category).toBe('engagement');
      expect(gtagMock.mock.calls[1][2].event_category).toBe('engagement');
      expect(gtagMock.mock.calls[2][2].event_category).toBe('engagement');
    });
  });

  describe('trackThemeToggle', () => {
    it('should track theme_toggle event with theme value', () => {
      trackThemeToggle('dark');

      expect(gtagMock).toHaveBeenCalledWith('event', 'theme_toggle', {
        event_category: 'ui',
        theme: 'dark',
      });
    });

    it('should track light theme toggle', () => {
      trackThemeToggle('light');

      expect(gtagMock).toHaveBeenCalledWith('event', 'theme_toggle', {
        event_category: 'ui',
        theme: 'light',
      });
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle gtag not being available', () => {
      (global as any).window = undefined;

      expect(() => {
        trackEvent({ event: 'test', category: 'navigation' });
      }).not.toThrow();
    });

    it('should not break if window is undefined', () => {
      (global as any).window = undefined;

      expect(() => {
        trackNavigation('/test', 'Test');
      }).not.toThrow();
    });
  });
});
