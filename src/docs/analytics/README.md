# Google Analytics 4 Implementation

Complete documentation for GA4 integration on the GST website.

## 📖 Documentation

- **[GOOGLE_ANALYTICS.md](./GOOGLE_ANALYTICS.md)** - Implementation reference guide
- **[ANALYTICS_TESTING.md](./ANALYTICS_TESTING.md)** - Testing patterns and examples

## Quick Facts

- **Measurement ID**: `G-WTGM9Y1YB0` (production)
- **Component**: `src/components/GoogleAnalytics.astro` (auto-loaded via BaseLayout)
- **Utils**: `src/utils/analytics.ts` - Type-safe tracking functions
- **Tests**: 75+ tests across unit, integration, and E2E

## Key Events Tracked

| Event | Trigger | Where |
|-------|---------|-------|
| `navigation_click` | User clicks nav link | Header, navigation |
| `portfolio_view_details` | User opens project modal | Portfolio page |
| `portfolio_close_modal` | User closes project modal | Portfolio page |
| `filter_applied` | User applies portfolio filter | Portfolio page |
| `theme_toggle` | User switches light/dark theme | Theme toggle |
| `cta_click` | User clicks call-to-action | Various CTAs |
| `faq_interaction` | User opens/closes FAQ item | Services, Hub |

For complete event documentation, see [GOOGLE_ANALYTICS.md](./GOOGLE_ANALYTICS.md#tracked-events).

## Running Tests

**All analytics tests (unit + integration + E2E):**
```bash
npm run test:all
```

**Just analytics tests:**
```bash
npm run test:run -- analytics
npx playwright test analytics.test.ts
```

**With coverage:**
```bash
npm run test:coverage
```

## Implementation

GA4 loads automatically on all pages via `BaseLayout.astro`. Components use type-safe tracking:

```typescript
import { trackNavigation, trackCTA, trackThemeToggle, trackEvent } from '../utils/analytics';

// Navigation events (helper)
trackNavigation('/ma-portfolio', 'M&A Portfolio');

// CTA events (helper)
trackCTA('calendly', 'hero');

// Theme events (helper)
trackThemeToggle('dark');

// One-off events (use trackEvent directly)
trackEvent({ event: 'faq_interaction', category: 'engagement', question: '...', action: 'open', page: 'services' });
```

See [ANALYTICS_TESTING.md](./ANALYTICS_TESTING.md) for test examples and patterns.

## Status

✅ **Fully implemented and tested**
- GA4 script loading
- Type-safe event tracking
- Event analytics
- Test coverage (75+ tests)
- Cross-browser E2E validation
