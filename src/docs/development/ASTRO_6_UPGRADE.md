# Astro 6 Upgrade Initiative

**Status:** Planned
**Priority:** Medium
**Estimated Effort:** 1-2 hours (infrastructure + upgrade + verification)
**Blocked By:** None — Node 22 LTS is supported by Vercel and GitHub Actions

---

## Overview

Upgrade the framework from Astro 5.16+ to Astro 6.x. This is a major version bump that requires Node 22+ and includes breaking changes, though most do not affect this project. The upgrade must be sequenced: Node infrastructure first, then framework upgrade.

---

## Why Upgrade

- **Node 22 LTS**: Current LTS track. Node 18 reaches EOL April 2025, Node 20 reaches EOL October 2026. Moving to 22 ensures long-term support.
- **Framework currency**: Astro 6 is the current major version. Staying on 5.x means missing security patches, performance improvements, and ecosystem compatibility as integrations target v6.
- **Zod 4**: Astro 6 ships with Zod 4. If the project adopts content collections in the future, it will need Zod 4 schemas.
- **Deprecation cleanup**: Several APIs deprecated in v5 are removed in v6. Upgrading now avoids accumulating tech debt.

---

## Breaking Changes Assessment

| Astro 6 Breaking Change | Affects This Project? | Action Required |
|---|---|---|
| **Node 22+ required** | Yes — currently Node 20.12.2 | Upgrade Node, update CI + Vercel |
| **`@astrojs/vercel` adapter** | Yes — currently `^9.0.4` | Upgrade to v6-compatible version |
| **`import.meta.env` values inlined** | Possible — used in 11 files | Test that `DEV`, `PROD`, and server-side env vars work correctly in `server:defer` context |
| **`Astro.glob()` removed** | No — not used | None |
| **`<ViewTransitions />` removed** | No — not used | None |
| **`emitESMImage()` removed** | No — not used | None |
| **Zod 4 upgrade** | No — no content collections | None |
| **`getImage()` throws on client** | No — not used | None |
| **Markdown heading ID changes** | No — no markdown collections | None |
| **Endpoint trailing slash changes** | No — no custom endpoints | None |
| **Image service defaults (cropping, no upscale)** | No — project uses raw `<img>` tags | None |
| **Transition API deprecations** | No — not used | None |

**Summary**: Only 3 of 12 breaking changes require attention: Node version, Vercel adapter, and `import.meta.env` behavior verification.

---

## Implementation Steps

### Step 1: Upgrade Node to 22 LTS

**Local development:**
```bash
# Using nvm (recommended)
nvm install 22
nvm use 22

# Or using fnm, volta, or direct installer
```

**Pin the version:**
- Create `.nvmrc` in project root: `22`
- Add `engines` field to `package.json`:
  ```json
  "engines": {
    "node": ">=22.0.0"
  }
  ```

### Step 2: Update GitHub Actions CI

**File:** `.github/workflows/test.yml`

Current configuration tests on Node 18.x and 20.x:
```yaml
matrix:
  node-version: [18.x, 20.x]
```

Update to:
```yaml
matrix:
  node-version: [22.x]
```

Also update the hardcoded `node-version: '20.x'` references in the E2E and coverage jobs (lines 63, 98) to `'22.x'`.

### Step 3: Configure Vercel for Node 22

Vercel reads the Node version from:
1. `engines.node` in `package.json` (preferred — already added in Step 1)
2. Project settings dashboard (Settings → General → Node.js Version)

Verify after deployment that the Vercel build log shows Node 22.

### Step 4: Upgrade Astro + Adapter

```bash
npm install astro@6 @astrojs/vercel@latest
```

Review `package-lock.json` changes. Check for any peer dependency warnings.

### Step 5: Verify `import.meta.env` Behavior

Astro 6 inlines all `import.meta.env` values. Test:

1. **Build-time env vars** (`PROD`, `DEV`, `PUBLIC_*`): Should work identically — these are already resolved at build time in SSG.
2. **Server-side env vars** (Inoreader API keys, KV tokens): These are used in `server:defer` components (`RadarFeed.astro`) which run on the server. Verify they're still accessible at runtime, not inlined as `undefined` during build.
3. **Test**: `npm run build && npm run preview` — verify the Radar page loads data.

**Files using `import.meta.env`:**
- `src/components/GoogleAnalytics.astro` — `PROD`, `PUBLIC_ENABLE_ANALYTICS`, `PUBLIC_GA_MEASUREMENT_ID`
- `src/layouts/BaseLayout.astro` — `PROD`
- `src/components/radar/RadarFeed.astro` — `INOREADER_FOLDER_PREFIX`
- `src/lib/inoreader/client.ts` — `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `INOREADER_APP_ID`, `INOREADER_APP_KEY`, `INOREADER_ACCESS_TOKEN`, `INOREADER_REFRESH_TOKEN`, `DEV`
- `src/lib/inoreader/cache.ts` — `DEV`
- `src/pages/hub/library/index.astro` — `DEV`
- `src/pages/hub/tools/index.astro` — `DEV`

### Step 6: Run Full Test Suite

```bash
npm run test:run        # Unit + integration (852 tests)
npm run build           # Verify production build succeeds
npm run preview         # Smoke test locally
```

E2E tests optional but recommended if time allows.

---

## Risk Mitigation

- **Dedicated branch**: Perform on a `feature/astro-6-upgrade` branch
- **Rollback**: If the build fails or `server:defer` breaks, revert the Astro + adapter packages. Node 22 is backwards-compatible with existing code.
- **Vercel preview deployment**: Verify the preview deployment works before merging to master
- **No code changes expected**: This upgrade should be purely infrastructure (Node version, package versions). If code changes are needed, they indicate an unexpected breaking change — investigate before proceeding.

---

## Future Benefits

Once on Astro 6:
- **Zod 4** available if content collections are adopted
- **View Transitions** stable API (if app-like navigation is desired)
- **Continued security and performance patches** from the current major version
- **Ecosystem compatibility** with integrations targeting Astro 6

---

## Related Documentation

- [Astro v6 Upgrade Guide](https://docs.astro.build/en/guides/upgrade-to/v6/)
- [Node.js Release Schedule](https://nodejs.org/en/about/releases/)
- [Vercel Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [GitHub Actions setup-node](https://github.com/actions/setup-node)

---

**Created**: March 24, 2026
