/**
 * Analytics utility for tracking user interactions
 * Provides a type-safe interface for Google Analytics 4 events
 */

export type EventCategory = 'navigation' | 'portfolio' | 'engagement' | 'ui' | 'tool';

export interface AnalyticsEvent {
  event: string;
  category: EventCategory;
  label?: string;
  value?: number | string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Track a custom event in Google Analytics
 * @param eventData - The event data to track
 */
export function trackEvent(eventData: AnalyticsEvent): void {
  if (typeof window !== 'undefined' && window.gtag) {
    const { event, category, ...params } = eventData;
    window.gtag('event', event, {
      event_category: category,
      ...params,
    });
  }
}

/**
 * Track navigation link clicks
 * @param destination - The href of the clicked link
 * @param label - Human-readable label for the link
 */
export function trackNavigation(destination: string, label: string): void {
  trackEvent({
    event: 'navigation_click',
    category: 'navigation',
    label,
    destination,
  });
}

/**
 * Track CTA (Call-to-Action) button clicks
 * @param ctaType - Type of CTA (calendly, email, etc.)
 * @param location - Where the CTA is located on the page
 */
export function trackCTA(ctaType: string, location: string): void {
  trackEvent({
    event: 'cta_click',
    category: 'engagement',
    cta_type: ctaType,
    location,
  });
}

/**
 * Track theme toggle (dark mode)
 * @param theme - The theme that was switched to
 */
export function trackThemeToggle(theme: 'light' | 'dark'): void {
  trackEvent({
    event: 'theme_toggle',
    category: 'ui',
    theme,
  });
}

/**
 * Track page views
 * @param pageName - The name of the page being viewed
 * @param pageTitle - The full title of the page
 */
export function trackPageView(pageName: string, pageTitle: string): void {
  trackEvent({
    event: 'page_view',
    category: 'navigation',
    page_name: pageName,
    page_title: pageTitle,
  });
}

// Declare gtag on window for TypeScript
declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}
