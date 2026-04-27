# Performance Observability

> Authoritative reference for the GST website's performance observability stack: Lighthouse CI on every pull request, a weekly historical-trend dashboard at **<https://performance.globalstrategic.tech>**, and the GitHub Actions workflows that automate both. **This is the single source of truth for performance tooling — [DEVELOPER_TOOLING.md](DEVELOPER_TOOLING.md) defers here.**

---

## TL;DR

| Question                                          | Answer                                                                                                                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where do I see live scores?                       | <https://performance.globalstrategic.tech> (gh-pages, GitHub Pages)                                                                                                                                                                    |
| Where do I see PR-time scores?                    | The "Lighthouse CI" check on every PR to `master` — opens a step summary with side-by-side desktop/mobile tables                                                                                                                       |
| What runs them?                                   | Two workflows in [`.github/workflows/`](../../../.github/workflows/) — [`lighthouse.yml`](../../../.github/workflows/lighthouse.yml) (PR-time) and [`perf-dashboard.yml`](../../../.github/workflows/perf-dashboard.yml) (weekly cron) |
| What gets measured?                               | Five Lighthouse metrics × 12 pages × 2 form factors (desktop + mobile)                                                                                                                                                                 |
| What's the only blocking failure?                 | **Cumulative Layout Shift > 0.1** — every other metric warns but doesn't fail the check                                                                                                                                                |
| How do I trigger a manual run?                    | GitHub Actions tab → "Performance Dashboard" → Run workflow (or click "Run Now" on the dashboard)                                                                                                                                      |
| Why are local / CI / production scores different? | All three measure different things — see [Why scores diverge](#why-scores-diverge)                                                                                                                                                     |

---

## What's measured

Both workflows audit the same 12 pages with the same five Lighthouse metrics, but at two different form factors. The metric thresholds are the only thing that differs between them.

### Pages audited (12)

```
/                                       /hub/tools/tech-debt-calculator
/about                                  /hub/tools/diligence-machine
/services                               /hub/tools/regulatory-map
/ma-portfolio                           /hub/tools/techpar
/brand                                  /hub/radar
/hub                                    /hub/library
```

Configured in:

- [`lighthouserc.cjs`](../../../lighthouserc.cjs) — desktop preset
- [`lighthouserc.mobile.cjs`](../../../lighthouserc.mobile.cjs) — mobile preset (Lighthouse default: Moto G Power, 4× CPU slowdown, simulated slow 4G)

### Performance budgets

| Metric                            | Desktop   | Mobile    | Level     |
| --------------------------------- | --------- | --------- | --------- |
| First Contentful Paint (FCP)      | < 1800ms  | < 3000ms  | warn      |
| Largest Contentful Paint (LCP)    | < 2500ms  | < 4000ms  | warn      |
| **Cumulative Layout Shift (CLS)** | **< 0.1** | **< 0.1** | **error** |
| Total Blocking Time (TBT)         | < 200ms   | < 400ms   | warn      |
| Time to Interactive (TTI)         | < 3500ms  | < 5000ms  | warn      |

**Why CLS is the only blocking error**: layout shifts are the most user-visible perception of a broken page and the cheapest to fix at source (image dimensions, reserved skeleton heights, font swap strategies). The other metrics warn while baselines stabilize so a flaky 50ms TBT regression doesn't block urgent shipping.

To adjust budgets, edit `ci.assert.assertions` in the relevant `lighthouserc.cjs` file. Use `'error'` to block PRs, `'warn'` for informational.

---

## The four GitHub Actions workflows

Two are performance-specific; two are listed for context (you'll see them on every PR).

| Workflow                  | File                                                                          | Trigger                               | Purpose                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lighthouse CI**         | [`lighthouse.yml`](../../../.github/workflows/lighthouse.yml)                 | PR to `master`, manual                | Audits every PR with desktop + mobile Lighthouse; posts a step summary; **does not block merge except on CLS regression**                                                        |
| **Performance Dashboard** | [`perf-dashboard.yml`](../../../.github/workflows/perf-dashboard.yml)         | Weekly cron (Sundays 2am UTC), manual | Runs the same audits, extracts metrics, merges them into the historical JSON on the `gh-pages` branch, and pushes — which republishes <https://performance.globalstrategic.tech> |
| Test Suite                | [`test.yml`](../../../.github/workflows/test.yml)                             | Push, PR to `master`                  | Lint + typecheck + unit/integration + E2E. Not performance-specific but on every PR.                                                                                             |
| Cross-Browser E2E         | [`test-cross-browser.yml`](../../../.github/workflows/test-cross-browser.yml) | Manual only                           | Playwright across chromium / firefox / webkit. Not performance-specific.                                                                                                         |

### `lighthouse.yml` — PR-time CI

- **Triggers**: pull request to `master`, or manual via Actions tab
- **What it does**: runs `npx lhci autorun` twice — once with `lighthouserc.cjs` (desktop), once with `lighthouserc.mobile.cjs` (mobile)
- **Output**: a `## Lighthouse CI Scores` block in the workflow's step summary, side-by-side desktop and mobile tables with Performance score / FCP / LCP / TBT / CLS / report link per page
- **Report links**: each row has a `[View](...)` link that opens the full Lighthouse HTML report on `temporary-public-storage` — these expire after roughly 7 days
- **Status**: the job uses `continue-on-error: true` on the audits so the workflow always reports a pass even if assertions fire. Whether a PR is blocked depends on the **assertion summary** (CLS errors visibly fail in the rendered table even though the workflow exits zero) and on whatever branch protection is configured to require this check
- **Why CLS regressions are visible without blocking**: the workflow always exits zero, but the step summary surfaces every assertion failure in a readable block. Reviewers are expected to read the summary as part of PR review

### `perf-dashboard.yml` — weekly historical capture + dashboard deploy

- **Triggers**: cron `0 2 * * 0` (Sundays at 2am UTC), or manual via Actions tab → "Performance Dashboard" → "Run workflow"
- **What it does**:
  1. Runs the same dual audit (desktop + mobile)
  2. Extracts a metrics snapshot via [`scripts/extract-lighthouse-metrics.mjs`](../../../scripts/extract-lighthouse-metrics.mjs) (one JSON per form factor — `pages × {performance, fcp, lcp, tbt, cls}`)
  3. Checks out the `gh-pages` branch in a worktree (creates an orphan branch if it doesn't exist)
  4. Copies the dashboard's static files (`scripts/dashboard/{index.html, dashboard.css, favicon.svg, .nojekyll}`) into the worktree
  5. Runs [`scripts/merge-lighthouse-history.mjs`](../../../scripts/merge-lighthouse-history.mjs) to append the new snapshot to `data/lighthouse-history.json` and `data/lighthouse-history-mobile.json`
  6. Commits and pushes — which triggers GitHub Pages to rebuild and republish <https://performance.globalstrategic.tech>
- **Concurrency**: `cancel-in-progress: false` so back-to-back manual runs queue rather than cancel each other (the worktree push is the slow step; cancelling mid-push would corrupt history)

---

## The performance dashboard at https://performance.globalstrategic.tech

A static HTML page served from the `gh-pages` branch via GitHub Pages, mapped to the custom domain via DNS CNAME. Built with Chart.js for the trend charts and vanilla JS for everything else — zero build step, deploys directly from the branch.

### What it shows

- **Latest scores** — most recent snapshot per page, color-coded (🟢 ≥90, 🟠 ≥50, 🔴 <50)
- **Historical trends** — line charts per metric per page, with date-range selectors (24h / 7d / 28d / 90d / 180d / 365d / all-time)
- **Device toggle** — desktop ⇄ mobile, switches both the latest scores table and the trend charts
- **Page filters** — narrow the trends to specific pages
- **Run Now button** — links directly to the GitHub Actions trigger UI for `perf-dashboard.yml` so anyone with repo access can capture an out-of-cycle snapshot

### How it's served

- **Branch**: `gh-pages` — orphan branch managed entirely by `perf-dashboard.yml`. Never edit it directly.
- **Source files**: [`scripts/dashboard/`](../../../scripts/dashboard/) on `master` is the canonical template; the workflow copies these onto `gh-pages` on every run, so any change to those files in `master` propagates within a week (or sooner if you trigger the workflow manually)
- **Custom domain**: configured via the GitHub repo settings → Pages → custom domain. A CNAME file on the `gh-pages` branch + a DNS CNAME record (`performance.globalstrategic.tech` → `Global-Strategic-Technologies.github.io`) wire it together
- **Vercel skip**: [`vercel.json`](../../../vercel.json) line 2 carries `ignoreCommand` that aborts the Vercel build whenever the branch is `gh-pages` — Vercel doesn't try to deploy the dashboard branch as a website preview

### Updating the dashboard

| What changed                   | What to do                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard HTML / CSS / favicon | Edit [`scripts/dashboard/`](../../../scripts/dashboard/) on `master`. Trigger `perf-dashboard.yml` manually to publish before the next Sunday                  |
| Metric extraction logic        | Edit [`scripts/extract-lighthouse-metrics.mjs`](../../../scripts/extract-lighthouse-metrics.mjs); the next Sunday run uses the new logic                       |
| History merge logic            | Edit [`scripts/merge-lighthouse-history.mjs`](../../../scripts/merge-lighthouse-history.mjs) — be careful, this writes to a JSON file that the dashboard reads |
| Custom domain                  | GitHub repo Settings → Pages; the CNAME and DNS record both need updating                                                                                      |

---

## Running locally

The same configs that CI uses work from your machine:

```bash
# Desktop audit
npx lhci autorun --config=lighthouserc.cjs

# Mobile audit
npx lhci autorun --config=lighthouserc.mobile.cjs
```

Both start the dev server (`npm run dev`), audit all 12 URLs, run the assertions, and upload the reports to `temporary-public-storage`. The report URL is printed at the end. Local runs are great for:

- **Reproducing a CI failure** — same configs, same thresholds
- **Iterating on a fix** — tighten the loop versus committing-and-waiting for CI
- **Custom auditing** — pass `--collect.url=http://localhost:4321/some-page` to override the URL list

Local runs do **not** publish to the dashboard. They only upload to the LHCI temporary storage.

---

## How developers should leverage this

### Reviewing a PR

1. Open the PR's "Lighthouse CI" check → "Details"
2. Scroll to the "Lighthouse CI Scores" section in the run summary
3. **Look at CLS first** — that's the only column that fails the check. A red CLS row means a real regression
4. **Check report links** for any row with a meaningfully worse score than baseline. The full Lighthouse HTML report shows which audits triggered the regression
5. If a regression is real but expected (e.g. you're shipping a heavier component intentionally), call it out in the PR description with the trade-off

### Adding a page to the audit list

Both Lighthouse configs need updating:

```diff
 // lighthouserc.cjs AND lighthouserc.mobile.cjs
 url: [
   'http://localhost:4321/',
   ...
+  'http://localhost:4321/your-new-page',
 ],
```

The dashboard auto-discovers new pages from the merged JSON history.

### Adjusting performance budgets

Edit `ci.assert.assertions` in the relevant `lighthouserc.*.cjs`. Use `'error'` to block PRs (currently only CLS), `'warn'` for informational. Document the why in the commit message — performance budgets are easy to ratchet down accidentally.

### Triggering an out-of-cycle audit

Go to GitHub → Actions → "Performance Dashboard" → "Run workflow". Useful when:

- You shipped a perf-relevant change and want it reflected on the dashboard before next Sunday
- You're investigating a suspected regression and want a fresh datapoint to compare against
- You're demoing the tooling and want a clean recent run

The dashboard's "Run Now" button links straight to this UI.

### Investigating a regression

1. Open the dashboard, switch to the affected device (desktop / mobile)
2. Filter to the affected page
3. Look at the trend chart — when did the regression start? Was it gradual or a step change?
4. `git log --since="<date>" -- src/` for the suspect window. Step changes usually map to a single commit
5. For deeper investigation, run Lighthouse locally against the suspect commit with the dev server (`git checkout <sha> && npx lhci autorun --config=lighthouserc.cjs`)

---

## How non-developers (stakeholders, leadership) should use this

Just visit <https://performance.globalstrategic.tech>. The dashboard is intentionally self-explanatory:

- The latest-scores table is the current state
- The trend charts show whether the site is getting faster or slower over time
- The device toggle matters — most real users hit the site from mobile
- "Run Now" requires a GitHub login with repo access; engineering can trigger it on request

The dashboard is the artifact to point at when discussing performance. It's not a real-time monitor — production user experience is captured by Vercel Speed Insights (see [Related observability](#related-observability)). Lighthouse-CI scores are synthetic; they catch regressions early but may diverge from what real users see.

---

## Why scores diverge

Three different measurement contexts produce three different scores:

| Context                                                    | What it measures                             | Why scores can differ                                                        |
| ---------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| **Local Lighthouse**                                       | Your dev server, your hardware, your network | Dev server is unminified, no Vercel CDN, your CPU is faster than a CI runner |
| **CI Lighthouse** (`lighthouse.yml`, `perf-dashboard.yml`) | Dev server on a GitHub Actions runner        | Standardized hardware, but still dev-server (not the production build)       |
| **Production** (Vercel Speed Insights)                     | Real users hitting `globalstrategic.tech`    | Production build, CDN cache, real-world devices and networks                 |

**Use Lighthouse CI for regression detection**, not absolute benchmarking. The trend over time is what matters. Use Vercel Speed Insights for absolute production performance.

---

## Helper scripts

| Script                                                                                      | Purpose                                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`scripts/extract-lighthouse-metrics.mjs`](../../../scripts/extract-lighthouse-metrics.mjs) | Reads `.lighthouseci/lhr-*.json` after an audit run; outputs a single JSON snapshot to stdout. Used by `perf-dashboard.yml` to capture the weekly metrics |
| [`scripts/merge-lighthouse-history.mjs`](../../../scripts/merge-lighthouse-history.mjs)     | Appends a new snapshot to a history JSON file (idempotent — safe to re-run on the same snapshot)                                                          |
| [`scripts/dashboard/`](../../../scripts/dashboard/)                                         | Static dashboard files (HTML, CSS, favicon, `.nojekyll`). Copied to `gh-pages` by the workflow                                                            |

---

## Troubleshooting

### LHCI report links return 404

The `temporary-public-storage` upload target keeps reports for ~7 days. After that, the `[View]` links in the PR step summary 404. The metric numbers in the table are still trustworthy — they were captured at run time.

### Dashboard shows stale data

The dashboard updates only when `perf-dashboard.yml` runs. The cron is weekly. Trigger a manual run via Actions → "Performance Dashboard" → "Run workflow" if you need fresher data.

### Dashboard 404 / SSL errors

Custom-domain issues:

- GitHub repo Settings → Pages should show `performance.globalstrategic.tech` as the custom domain with a green ✓ on "DNS check"
- DNS: `dig performance.globalstrategic.tech CNAME` should return `Global-Strategic-Technologies.github.io.`
- The `gh-pages` branch must contain a `CNAME` file with the bare hostname

### CI Lighthouse passes but production looks slow

Expected — see [Why scores diverge](#why-scores-diverge). For production performance, check Vercel Speed Insights in the Vercel dashboard. CI Lighthouse is for regression detection; production telemetry is for absolute performance.

### Vercel deployed the gh-pages branch (it shouldn't)

[`vercel.json`](../../../vercel.json) carries `"ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" = \"gh-pages\" ] && exit 0 || exit 1"` to skip Vercel builds on `gh-pages`. If this is failing, check the Vercel deployment logs for the gh-pages branch and confirm the `ignoreCommand` is being honored.

---

## Related observability (not in scope here)

| Surface                          | Tool                           | Where it's documented                                                                                       |
| -------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Production user experience (RUM) | Vercel Speed Insights          | Vercel dashboard; no in-repo doc — the package `@vercel/speed-insights` is wired up in `BaseLayout.astro`   |
| Errors / runtime exceptions      | Sentry                         | [SENTRY_MANUAL_SETUP.md](SENTRY_MANUAL_SETUP.md)                                                            |
| Test reliability / coverage      | Vitest + Playwright            | [../testing/README.md](../testing/README.md)                                                                |
| Future: MCP server SLOs          | Cloudflare Analytics + Grafana | [MCP_SERVER_OBSERVABILITY_BL-032_75.md](MCP_SERVER_OBSERVABILITY_BL-032_75.md) (initiative not yet shipped) |

---

_Last updated: 2026-04-27_
