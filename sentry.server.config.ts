import * as Sentry from '@sentry/astro';
import { PUBLIC_SENTRY_DSN } from 'astro:env/client';
import { dataCollection } from './sentry.data-collection';

Sentry.init({
  dsn: PUBLIC_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  dataCollection,
  tracesSampleRate: 0,
});
