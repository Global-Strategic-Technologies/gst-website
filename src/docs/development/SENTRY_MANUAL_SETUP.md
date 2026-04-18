# Sentry Manual Setup Guide

Two Platform Hardening V1 items require manual configuration in external dashboards. The code is fully wired — these steps activate it.

---

## 1. Enable Source Map Upload (Phase 9 Item #15)

Source maps give Sentry readable stack traces instead of minified code. The upload is wired in `astro.config.mjs` but disabled until environment variables are set.

### Steps

1. **Create an Organization Auth Token** (recommended by Sentry for source map uploads)
   - Go to [sentry.io](https://sentry.io) → **Settings → Developer Settings → Organization Tokens**
   - Click **Create New Token**
   - Give it a name like `GST Website Source Maps`
   - Organization tokens have preset permissions — no manual scope selection needed
   - Copy the token immediately (it is only shown once and cannot be retrieved later)

   > **Why Organization Token, not Personal Token?** Organization tokens are scoped to the org (not your personal account), have the right permissions for source map upload out of the box, and are the Sentry-recommended approach. If you must use a Personal Token instead (Settings → Auth Tokens → Personal Tokens), set **Project: Read & Write** and **Release: Admin**.

2. **Find your org and project slugs**
   - Org slug: visible in the URL when logged in — `https://sentry.io/organizations/{ORG_SLUG}/`
   - Project slug: Settings → Projects → click your project — the slug is in the URL

3. **Add environment variables to Vercel**
   - Go to [vercel.com](https://vercel.com) → your project → Settings → Environment Variables
   - Add these three variables for **Production** environment only:

   | Variable            | Value                                          |
   | ------------------- | ---------------------------------------------- |
   | `SENTRY_AUTH_TOKEN` | The token from step 1                          |
   | `SENTRY_ORG`        | Your Sentry organization slug                  |
   | `SENTRY_PROJECT`    | Your Sentry project slug (e.g., `gst-website`) |

4. **Trigger a production deploy** to verify
   - Push to `master` or trigger a manual deploy
   - Check the Vercel build logs for: `Uploading source maps...`
   - If it says `Source maps upload is disabled` the env vars aren't being read

5. **Verify in Sentry**
   - Go to Sentry → Releases → click the latest release
   - Under "Artifacts" you should see `.js.map` files
   - Trigger a test error — the stack trace should show original TypeScript, not minified JS

### Troubleshooting

- **"Didn't find any matching sources for debug ID upload"**: This is almost always a symptom of an auth failure (401), not a missing config. The Sentry Vite plugin injects debug IDs during the build and writes source maps to a temp directory — if auth fails, the upload step can't run, and the plugin reports "no matching sources" as a secondary warning. Fix the auth token and this warning resolves.
- **"Authentication required" or 401 error in build**: The auth token is invalid, expired, or missing. Generate a new Organization Token at sentry.io → Settings → Developer Settings → Organization Tokens.
- **"Organization not found"**: Check the `SENTRY_ORG` slug matches exactly (case-sensitive, visible in your Sentry URL).
- **"Sending telemetry data" warning**: Should not appear — `telemetry: false` is set in `astro.config.mjs`. If it appears, verify the config wasn't reverted.
- **Source maps uploaded but traces still minified**: Verify the release version in Sentry matches what the client reports. Check that `sentry.client.config.ts` and the build output use the same release identifier.
- **Don't add Sentry env vars to `.env` locally**: The upload should only run on Vercel production builds. Locally it slows builds and fails since there's no deployment context.

---

## 2. Configure Sentry Alert Rules (Phase 9 Item #14)

Alert rules notify you when errors occur. The error tags (`area:inoreader-api`, `area:redis-connection`, etc.) are already set in the codebase — these rules trigger notifications based on them.

### Steps

1. **Navigate to alert rules**
   - Go to [sentry.io](https://sentry.io) → your project (`gst-website`) → Alerts → Create Alert Rule

2. **Create the following 4 rules**:

   #### Rule 1: New Issue Alert
   - **When**: A new issue is created
   - **Filter**: None (all issues)
   - **Then**: Send notification to your email
   - **Action interval**: 1 hour (prevents spam)
   - **Name**: `New issue — all`

   #### Rule 2: High-Volume Error Spike
   - **When**: Number of events in an issue exceeds **10** in **1 hour**
   - **Filter**: None
   - **Then**: Send notification to your email
   - **Action interval**: 1 hour
   - **Name**: `High-volume error spike`

   #### Rule 3: Inoreader API Failures
   - **When**: A new issue is created
   - **Filter**: Issue tag `area` matches `inoreader-api`
   - **Then**: Send notification to your email
   - **Action interval**: 30 minutes
   - **Name**: `Inoreader API failure`

   #### Rule 4: Redis Connection Failures
   - **When**: A new issue is created
   - **Filter**: Issue tag `area` matches `redis-connection`
   - **Then**: Send notification to your email
   - **Action interval**: 30 minutes
   - **Name**: `Redis connection failure`

3. **Test the alerts**
   - After creating the rules, you can verify by triggering a test error:
     - Open the deployed site
     - Open browser DevTools console
     - Run: `Sentry.captureException(new Error('Test alert rule'))`
     - Check your email within a few minutes for the alert

4. **Optional: Add Slack/PagerDuty integration**
   - Go to Settings → Integrations
   - Connect Slack or PagerDuty
   - Update the alert rules to send to a Slack channel instead of (or in addition to) email

### Tag Reference

These are the `area` tags already instrumented in the codebase:

| Tag                        | Source                           | Fires When                                           |
| -------------------------- | -------------------------------- | ---------------------------------------------------- |
| `area:inoreader-api`       | `src/lib/inoreader/client.ts`    | Inoreader API calls fail (auth, fetch, refresh)      |
| `area:redis-connection`    | `src/lib/inoreader/client.ts`    | Redis/KV connection or read/write fails              |
| `area:file-cache`          | `src/lib/inoreader/cache.ts`     | Local file cache read/write fails                    |
| `area:techpar-calculation` | `src/utils/techpar/chart.ts`     | TechPar chart rendering or calculation errors        |
| `area:palette-manager`     | `src/scripts/palette-manager.ts` | Palette operations fail (breadcrumb only, not alert) |

---

## Verification Checklist

- [ ] Sentry auth token generated and stored in Vercel
- [ ] `SENTRY_ORG` and `SENTRY_PROJECT` set in Vercel
- [ ] Production deploy shows "Uploading source maps..." in build logs
- [ ] Sentry Releases page shows source map artifacts
- [ ] "New issue" alert rule created
- [ ] "High-volume error spike" alert rule created
- [ ] "Inoreader API failure" alert rule created
- [ ] "Redis connection failure" alert rule created
- [ ] Test error triggers email notification

---

## 3. Consent Gating Evaluation (Phase 9 Item #16)

### Decision: Keep Sentry under Legitimate Interest

Sentry's current configuration runs under **legitimate interest** basis (GDPR Article 6(1)(f)) and does **not** require explicit consent gating. Rationale:

| Config Property            | Value  | Privacy Impact                             |
| -------------------------- | ------ | ------------------------------------------ |
| `sendDefaultPii`           | false  | No IP addresses, usernames, or emails      |
| `tracesSampleRate`         | 0      | No performance/transaction tracking        |
| `replaysSessionSampleRate` | 0      | No session replay of normal browsing       |
| `replaysOnErrorSampleRate` | 1.0    | Replay captured ONLY when an error occurs  |
| `beforeSend` filter        | active | Drops browser noise (ResizeObserver, etc.) |

Error monitoring is a recognized legitimate interest for website operators. The data collected is:

- Stack traces (minified code, no user data)
- Browser/OS metadata (for debugging, not profiling)
- Error-triggered session replay (only the moments around the error)

### When to Re-evaluate

If the cookie consent banner (BUSINESS_ENABLEMENT_V1 Initiative 1) introduces a **"functional cookies"** or **"analytics"** consent tier, consider whether error-triggered replay crosses into the "analytics" category in your jurisdiction. Pure error capture (without replay) is unambiguously legitimate interest.

A code comment in `sentry.client.config.ts` marks the integration point for future consent gating if needed.

### If You Decide to Gate Sentry on Consent

Add this check before `Sentry.init()` in `sentry.client.config.ts`:

```typescript
const consent = localStorage.getItem('cookie-consent');
if (consent !== 'accepted') {
  // Don't initialize Sentry — user hasn't consented
  // Sentry.init() is never called, so no data is sent
}
```

Note: this means errors occurring before or without consent will be invisible. Weigh this tradeoff against the privacy benefit.

---

_Created: April 13, 2026 — Platform Hardening V1 Phase 9_
_Updated: April 17, 2026 — Added consent gating evaluation (Phase 9 item #16)_
