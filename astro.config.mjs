// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import sentry from '@sentry/astro';
import sitemap from '@astrojs/sitemap';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';

// Load-bearing: Vite does NOT forward browserslist to LightningCSS automatically.
// Without this, LightningCSS strips -webkit-backdrop-filter, breaking frosted glass in Firefox.
const lightningcssTargets = browserslistToTargets(browserslist());

export default defineConfig({
  site: 'https://globalstrategic.tech',
  env: {
    schema: {
      // Inoreader API — server secrets (never inlined, resolved at runtime)
      // Optional: Radar page degrades gracefully when absent (shows fallback message).
      // Required only for local dev with live feed and on Vercel production.
      INOREADER_APP_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      INOREADER_APP_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      INOREADER_ACCESS_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
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
    // Sentry: source maps, error tracking. Only active when SENTRY_AUTH_TOKEN is set
    // (Vercel production). @sentry/astro auto-enables sourcemap:'hidden', auto-detects
    // Vercel output dirs, and auto-deletes .map files after upload.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentry({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            telemetry: false,
            // `silent: true` suppresses the Sentry Vite plugin's build log
            // output, including "no sourcemap found" warnings for Astro's
            // inline script chunks. These chunks don't go through Vite's
            // bundler so no .map files exist — the warnings are expected
            // and not actionable. Errors are still reported to Sentry.
            silent: true,
          }),
        ]
      : []),
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
    optimizeDeps: {
      // Pre-bundle D3 and TopoJSON so Vite's dependency optimizer doesn't
      // discover them lazily during page load. Without this, the optimizer
      // may re-run mid-session and serve 504 "Outdated Optimize Dep" errors.
      include: ['d3-geo', 'd3-selection', 'd3-zoom', 'd3-transition', 'topojson-client'],
    },
    build: {
      // Sentry source maps. 'hidden' generates .map files without adding
      // sourceMappingURL to output JS (browsers don't request them).
      // @sentry/astro auto-enables this for the server build, but Astro's
      // client build ignores integration updateConfig — explicit config here
      // ensures both builds generate maps. Sentry auto-deletes after upload.
      sourcemap: 'hidden',
    },
    css: {
      // LightningCSS replaces esbuild for CSS: autoprefixing, minification,
      // and modern-CSS down-leveling (nesting, oklch, color-mix, light-dark).
      transformer: 'lightningcss',
      lightningcss: {
        targets: lightningcssTargets,
      },
    },
  },
});
