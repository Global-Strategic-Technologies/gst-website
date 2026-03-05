# Google Analytics 4 Implementation Guide

This document describes the Google Analytics 4 (GA4) implementation for the GST website, including architecture, integration points, and tracked events.

## Overview

Google Analytics 4 is integrated into the website to capture user engagement metrics, track portfolio interactions, and understand user behavior across the platform. The implementation uses the GA4 measurement ID `G-WTGM9Y1YB0`.

## Architecture

### GA4 Initialization Component

**File:** `src/components/GoogleAnalytics.astro`

The Google Analytics script is loaded via a dedicated Astro component that:
- Loads the GA4 gtag script from Google's CDN
- Initializes the dataLayer for event tracking
- Exposes the `gtag` function globally for event dispatch
- Enables page view tracking automatically

```astro
<script define:vars={{ measurementId }} is:inline>
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag('js', new Date());
  gtag('config', measurementId, {
    send_page_view: true,
  });
  window.gtag = gtag;
</script>
```

### Integration Points

The GA4 component is integrated in the root layout (`src/layouts/BaseLayout.astro`), ensuring it loads on every page:

```astro
<head>
    ...
    <GoogleAnalytics />
</head>
```

### Analytics Utility Module

**File:** `src/utils/analytics.ts`

TypeScript utility module providing type-safe event tracking functions:

- `trackEvent(eventData)` - Low-level event tracking with custom parameters (use directly for one-off event types)
- `trackNavigation(destination, label)` - Track navigation link clicks
- `trackCTA(ctaType, location)` - Track call-to-action button clicks
- `trackThemeToggle(theme)` - Track light/dark mode switches
- `trackPageView(pageName, pageTitle)` - Track page views

## Tracked Events

### 1. Navigation Events

**Event Name:** `navigation_click`
**Category:** `navigation`
**Parameters:**
- `label` - Human-readable name of the link (e.g., "Services", "M&A Portfolio")
- `destination` - The href of the clicked link

**Triggered By:** Header navigation links

**Use Cases:**
- Understand which sections users navigate to most
- Identify user journeys through the site
- Analyze link effectiveness

---

### 2. Portfolio Project View Events

**Event Name:** `portfolio_view_details`
**Category:** `portfolio`
**Parameters:**
- `project_id` - Unique identifier for the project
- `project_name` - Code name of the project
- `industry` - Industry segment (e.g., "AI", "Healthcare")

**Triggered By:** Clicking "View Project Details" on a project card or clicking the card itself

**Use Cases:**
- Identify most viewed/engaging projects
- Understand which industries attract the most interest
- Analyze project engagement patterns
- Create conversion funnels (filter → view → CTA click)

---

### 3. Portfolio Modal Close Events

**Event Name:** `portfolio_close_modal`
**Category:** `portfolio`
**Parameters:** None (session context is captured by GA4)

**Triggered By:** Closing the project details modal (X button, backdrop click, or Escape key)

**Use Cases:**
- Measure modal engagement duration
- Analyze how long users spend viewing project details
- Identify drop-off points

---

### 4. Portfolio Filter Events

**Event Name:** `filter_applied`
**Category:** `portfolio`
**Parameters:**
- `filter_type` - Type of filter applied (e.g., "stage", "theme", "year")
- `filter_value` - The specific value selected (e.g., "Series A", "AI", "2024")

**Triggered By:** Applying any filter on the M&A portfolio page (Growth Stage, Theme, Year filters)

**Use Cases:**
- Understand which project attributes users search for
- Identify most popular themes/stages
- Analyze discovery patterns
- Understand market interest areas

---

### 5. Call-to-Action Click Events

**Event Name:** `cta_click`
**Category:** `engagement`
**Parameters:**
- `cta_type` - Type of CTA (e.g., "calendly")
- `location` - Where the CTA is located (e.g., "cta-section", "hero")

**Triggered By:** Clicking the Calendly booking link in CTA sections

**Use Cases:**
- Track conversion interest (booking intent)
- Identify which CTAs drive the most engagement
- Measure call-to-action effectiveness
- Analyze user intent

---

### 6. FAQ Interaction Events

**Event Name:** `faq_interaction`
**Category:** `engagement`
**Parameters:**
- `question` - The text of the FAQ question that was toggled
- `action` - Whether the FAQ was opened or closed ("open" or "close")
- `page` - The page where the FAQ is located (e.g., "services", "hub")

**Triggered By:** Opening or closing a FAQ accordion (`<details>` element) on the Services or Hub pages

**Use Cases:**
- Identify which questions visitors ask most
- Understand user information needs by page
- Optimize FAQ content and ordering
- Inform content strategy for services and hub pages

---

### 7. Theme Toggle Events

**Event Name:** `theme_toggle`
**Category:** `ui`
**Parameters:**
- `theme` - The theme switched to ("light" or "dark")

**Triggered By:** Clicking the theme toggle button in the header

**Use Cases:**
- Understand user UI preferences
- Track dark mode adoption
- Analyze user behavior patterns by theme preference
- Optimize design for preferred theme

---

## Component Integration Points

### Header Component
**File:** `src/components/Header.astro`

Tracks navigation clicks on:
- Logo (destination: "/")
- Services link (destination: "/#services")
- M&A Portfolio link (destination: "/ma-portfolio")
- About link (destination: "/#about")
- Contact link (destination: "/#contact")

### CTA Section Component
**File:** `src/components/CTASection.astro`

Tracks Calendly booking button clicks with location metadata.

### Project Modal Component
**File:** `src/components/portfolio/ProjectModal.astro`

Tracks:
- Project details view (when modal opens)
- Modal close actions

### Portfolio Grid Component
**File:** `src/components/portfolio/PortfolioGrid.astro`

Tracks:
- Filter applications (listens to `portfolioFiltered` custom events)
- Passes filter_type and filter_value to analytics

### Services Page
**File:** `src/pages/services.astro`

Tracks FAQ accordion open/close interactions via `trackEvent` directly.

### Hub Page
**File:** `src/pages/hub/index.astro`

Tracks FAQ accordion open/close interactions via `trackEvent` directly.

### Theme Toggle Component
**File:** `src/components/ThemeToggle.astro`

Tracks theme toggle actions with the selected theme.

## Event Flow Diagram

```
User Action
    ↓
Component Event Handler
    ↓
Analytics Utility Function (trackEvent)
    ↓
window.gtag('event', ...)
    ↓
GA4 dataLayer
    ↓
Google Analytics Servers
```

## Setting Up GA4 Dashboard

### Create Custom Reports

1. **Most Viewed Projects Report**
   - Event: `portfolio_view_details`
   - Dimension: `project_name`
   - Metric: Event Count
   - Order by: Event Count (descending)

2. **Filter Usage Report**
   - Event: `filter_applied`
   - Dimensions: `filter_type`, `filter_value`
   - Metric: Event Count

3. **Navigation Flow Report**
   - Event: `navigation_click`
   - Dimension: `label`
   - Metric: Event Count

4. **CTA Conversion Report**
   - Events: `filter_applied` → `portfolio_view_details` → `cta_click`
   - Create a funnel to see conversion rates at each stage

### Create Conversion Goals

1. Navigate to Admin → Conversions → New Conversion Event
2. Create event for "cta_click" to track booking intent
3. Set up funnel: Portfolio Filter → Project View → CTA Click

## Testing GA4 Integration

### Real-Time Verification

1. Open your website in a browser
2. Go to GA4 Dashboard → Real-Time
3. Perform user actions (navigate, view projects, click filters, toggle theme)
4. Verify events appear in the Real-Time report within seconds

### GA4 DebugView

1. Install [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcicnstojefkohklgf) Chrome extension
2. Open your website
3. Open Chrome DevTools → GA4 Debugger tab
4. Perform actions and see events logged in real-time

### Event Validation Checklist

- [ ] Navigation clicks show correct `label` and `destination`
- [ ] Project views include `project_id`, `project_name`, and `industry`
- [ ] Filter applications include `filter_type` and `filter_value`
- [ ] CTA clicks include `cta_type` and `location`
- [ ] FAQ interactions include `question`, `action` ("open"/"close"), and `page`
- [ ] Theme toggles include correct `theme` value ("light" or "dark")

## Privacy Considerations

### Data Collection

- GA4 is configured to respect user privacy
- No personally identifiable information (PII) is collected
- IP addresses are anonymized by GA4
- Session and user IDs are assigned by GA4 automatically

### GDPR/Privacy Compliance

If your website serves users in the EU or other regions with privacy regulations:

1. Add a privacy/consent banner (recommended)
2. Allow users to opt-out of analytics
3. Update Privacy Policy to disclose GA4 usage
4. Consider implementing [Consent Mode](https://support.google.com/analytics/answer/9976101)

### Best Practices

- Don't track sensitive information (passwords, payment data, etc.)
- Regularly review collected data in GA4 Dashboard
- Set retention policies for user data in GA4 Admin settings
- Respect user privacy and data minimization principles

## Measurement ID

**Current Measurement ID:** `G-WTGM9Y1YB0`

This ID should not be changed without updating the GA4 component. If you need to use different measurement IDs for different environments (dev/staging/production), you can use environment variables:

```astro
const measurementId = import.meta.env.PUBLIC_GA_MEASUREMENT_ID || 'G-WTGM9Y1YB0';
```

## Troubleshooting

### Events Not Appearing in GA4

1. **Check Real-Time Report** - Events should appear within seconds
2. **Verify gtag Script Loading** - Check browser console for errors
3. **Check GA4 Configuration** - Ensure Measurement ID is correct
4. **Verify Event Names** - GA4 requires exact event name matching
5. **Check Browser Console** - Look for JavaScript errors preventing gtag calls

### Missing Event Parameters

- Verify function calls pass all required parameters
- Check event parameter names match GA4 configuration
- Use GA4 DebugView to inspect event payload

### High Event Volume or Duplicates

- Check for event firing multiple times in event listeners
- Verify debouncing logic on rapid user actions
- Review event configuration for duplicate tracking

## Future Enhancements

- [ ] Custom user properties for segmentation
- [ ] E-commerce tracking for future monetization
- [ ] Enhanced conversion tracking with multiple conversion goals
- [ ] Custom dashboard creation for key metrics
- [ ] Integration with Google Ads for retargeting
- [ ] Attribution modeling for multi-touch attribution

## References

- [Google Analytics 4 Documentation](https://support.google.com/analytics/topic/12154439)
- [GA4 Event Reference](https://support.google.com/analytics/answer/9322688)
- [GA4 Best Practices](https://support.google.com/analytics/answer/9303323)
- [Astro Component Documentation](https://docs.astro.build/en/basics/astro-components/)
