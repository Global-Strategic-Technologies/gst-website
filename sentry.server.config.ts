import * as Sentry from '@sentry/node';
import { PUBLIC_SENTRY_DSN } from 'astro:env/client';

Sentry.init({
  dsn: PUBLIC_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  tracesSampleRate: 0,
});
