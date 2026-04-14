// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import sentry from '@sentry/astro';
import sitemap from '@astrojs/sitemap';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';

// Phase 3 Commit 0e: read browser targets from the project's browserslist
// config (package.json "browserslist" field) and feed them to LightningCSS
// via its native browserslistToTargets helper. Without this wiring, Vite
// does NOT automatically forward browserslist to LightningCSS, and
// LightningCSS falls back to an internal default that strips unprefixed
// backdrop-filter for Firefox users. See Phase 3 commit 0e commit message
// and src/docs/development/DEVELOPER_TOOLING.md "Browser support" section.
const lightningcssTargets = browserslistToTargets(browserslist());

export default defineConfig({
  site: 'https://globalstrategic.tech',
  env: {
    schema: {
      // Inoreader API — server secrets (never inlined, resolved at runtime)
      INOREADER_APP_ID: envField.string({ context: 'server', access: 'secret' }),
      INOREADER_APP_KEY: envField.string({ context: 'server', access: 'secret' }),
      INOREADER_ACCESS_TOKEN: envField.string({ context: 'server', access: 'secret' }),
      INOREADER_REFRESH_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      INOREADER_FOLDER_PREFIX: envField.string({
        context: 'server',
        access: 'public',
        default: 'GST-',
      }),

      // Upstash Redis — optional, graceful degradation when absent
      KV_REST_API_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      KV_REST_API_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      UPSTASH_REDIS_REST_URL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      UPSTASH_REDIS_REST_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),

      // Sentry — public DSN for client init (auth token stays in process.env for build-time config)
      PUBLIC_SENTRY_DSN: envField.string({ context: 'client', access: 'public', optional: true }),

      // Google Analytics — client public
      PUBLIC_GA_MEASUREMENT_ID: envField.string({
        context: 'client',
        access: 'public',
        default: 'G-WTGM9Y1YB0',
      }),
      PUBLIC_ENABLE_ANALYTICS: envField.string({
        context: 'client',
        access: 'public',
        default: 'true',
      }),
    },
  },
  integrations: [
    sentry({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourceMapsUploadOptions: {
        enabled: !!process.env.SENTRY_AUTH_TOKEN,
        filesToDeleteAfterUpload: ['dist/**/*.map', '.vercel/output/**/*.map'],
      },
      telemetry: false,
    }),
    sitemap({
      filter: (page) => !page.includes('/brand') && !page.includes('/colors'),
    }),
  ],
  adapter: vercel({
    webAnalytics: { enabled: true },
    isr: {
      expiration: 60 * 60 * 6, // 6 hours — revalidation interval for SSR pages (Radar)
    },
  }),
  devToolbar: {
    enabled: false, // Disable dev toolbar to prevent interference with E2E tests
  },
  vite: {
    css: {
      // Phase 3 Commit 0d: replace Vite's default esbuild CSS pipeline with
      // LightningCSS — a single Rust-based parser/transformer/minifier that
      // handles autoprefixing, minification, modern-CSS down-leveling (CSS
      // nesting, oklch(), color-mix(), light-dark()), vendor-prefix cleanup,
      // and stricter syntax validation. Reversible by removing this block.
      // See src/docs/development/DEVELOPER_TOOLING.md for details.
      transformer: 'lightningcss',
      lightningcss: {
        targets: lightningcssTargets,
      },
    },
  },
});
