// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import sentry from '@sentry/astro';
import sitemap from '@astrojs/sitemap';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
// Extensionless specifier: `moduleResolution: "Bundler"` resolves it, and Astro
// loads this config through a TS-aware loader. Kept out of the config file so it
// can be unit-tested directly — see src/utils/sitemap-filter.ts for the
// absolute-URL contract this depends on.
import { sitemapFilter } from './src/utils/sitemap-filter';

// Load-bearing: Vite does NOT forward browserslist to LightningCSS automatically.
// Without this, LightningCSS strips -webkit-backdrop-filter, breaking frosted glass in Firefox.
const lightningcssTargets = browserslistToTargets(browserslist());

export default defineConfig({
  site: 'https://globalstrategic.tech',
  env: {
    schema: {
      // BL-032.8 Phase 4 — MCP Worker /radar/snapshot consumer credentials.
      //
      // Post-Phase-B (2026-05-17): all `INOREADER_*` env vars were retired
      // along with `src/lib/inoreader/client.ts`, `src/lib/inoreader/cache.ts`,
      // and `src/pages/api/inoreader/refresh.ts`. The website is no longer
      // an Inoreader API caller — it consumes radar via the MCP Worker.
      // OAuth state lives entirely on the Worker (Upstash MCP DB).
      // MCP_KEY_WEBSITE_RADAR is REQUIRED in production; optional in schema so
      // local dev + Vercel preview deploys without the secret bound render
      // /hub/radar empty (with a console.error in logs) rather than crashing
      // the build. See src/docs/hub/RADAR.md § Environment Variables.
      MCP_KEY_WEBSITE_RADAR: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      // Optional override of the MCP endpoint URL. Defaults to production
      // (`https://mcp.globalstrategic.tech/radar/snapshot`) when unset. Used
      // on preview deploys to target the staging Worker.
      MCP_RADAR_SNAPSHOT_URL: envField.string({
        context: 'server',
        access: 'public',
        default: 'https://mcp.globalstrategic.tech/radar/snapshot',
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
      filter: sitemapFilter,
    }),
  ],
  adapter: vercel({
    webAnalytics: { enabled: true },
    isr: {
      expiration: 60 * 60 * 6, // 6 hours — revalidation interval for SSR pages (Radar)
      // Exclude /api/* routes from ISR routing. Without this, POST requests
      // to API endpoints get misrouted through Vercel's /_isr pipeline,
      // which doesn't support POST and returns 403 FUNCTION_INVOCATION_FAILED.
      // Discovered while wiring BL-039's /api/inoreader/refresh (POST-only).
      // Regex support requires @astrojs/vercel >= 8.1.0 (current: 10.x).
      exclude: [/^\/api\/.+/],
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
