import * as Sentry from '@sentry/astro';
import { PUBLIC_SENTRY_DSN } from 'astro:env/client';

// Consent gating evaluation (Phase 9 item #16):
// Sentry runs under legitimate-interest basis — error monitoring with no PII,
// no session replay of non-error sessions, no performance tracing. This is
// generally accepted under GDPR without explicit consent. When the cookie
// consent banner ships (BUSINESS_ENABLEMENT_V1 Initiative 1), evaluate whether
// to additionally gate Sentry on consent. If so, check localStorage for
// cookie-consent preference here before calling Sentry.init().
Sentry.init({
  dsn: PUBLIC_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  beforeSend(event) {
    const msg = event.exception?.values?.[0]?.value ?? '';
    if (msg.includes('ResizeObserver loop')) return null;
    if (msg.includes('SecurityError') && msg.includes('localStorage')) return null;
    return event;
  },
});
