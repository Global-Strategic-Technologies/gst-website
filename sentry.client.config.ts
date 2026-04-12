import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: import.meta.env.PUBLIC_SENTRY_DSN,
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
