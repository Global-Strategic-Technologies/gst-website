# Testing & CI/CD Troubleshooting Guide

Solutions to common problems when running tests locally and in CI/CD.

## Local Testing Issues

### "Tests work locally but fail in GitHub Actions"

**Possible causes:**

1. **Node version mismatch** - CI runs Node 22.x (`.nvmrc` pins 22); you might have a different version
2. **Missing environment variables** - Check `.env` file is not committed
3. **Flaky timing in E2E tests** - Your machine is faster than CI, which runs 2 workers with 1 retry
4. **Platform differences** - You're on Windows, CI runs on Linux

**Solution:**

```bash
# Check your Node version
node --version

# Run what CI's required jobs run (the full sequence: DEVELOPER_TOOLING.md § Quick reference)
npx astro check && npm run lint && npm run lint:css && npm run test:run
npm run build && npx playwright test --project=chromium   # the required E2E job is chromium-only

# Check what CI actually runs
cat .github/workflows/test.yml
```

### "npm run test:all hangs or times out"

**Possible causes:**

1. **E2E tests waiting too long** - Playwright timeouts too aggressive
2. **Resource exhaustion** - Too many tests running at once
3. **Stale Playwright cache** - Outdated browser binaries

**Solution:**

```bash
# Clear Playwright cache
rm -rf ~/.cache/ms-playwright
npx playwright install

# Run E2E tests with longer timeout
npx playwright test --timeout=60000

# Run tests sequentially (slower, but helps debug)
npx playwright test --workers=1
```

### "Test passes in isolation but fails in the full suite (parallel-load flake)"

**Symptom:** A specific test fails when running `npm run test:e2e` (or `npm run test:all`), but passes when run alone:

```bash
# This passes (1 worker, no contention)
npx playwright test myfile.test.ts -g "name" --project=chromium

# This passes too (3 browsers in isolation)
npx playwright test myfile.test.ts -g "name"

# This fails intermittently
npm run test:e2e
```

**Likely cause:** A source-side **readiness signal that lies**. The page sets a `data-*-ready` attribute (or `window.__*Initialized` flag) for tests to consume, but emits it **before** all `addEventListener` / D3 `.on()` calls have run. On fast isolated runs the trailing handler attachments finish in the same frame, so it works by luck. Under parallel contention the gap widens and the test clicks before its handler binds.

See [TEST_BEST_PRACTICES.md #26](./TEST_BEST_PRACTICES.md#26--source-side-readiness-signals-emitted-before-all-handlers-are-bound) for the full pattern, examples, and the audit grep.

**Triage steps:**

1. **Confirm it's parallel-load, not browser-specific:**

   ```bash
   # If this passes consistently, it's parallel-load
   npx playwright test myfile.test.ts -g "name" --repeat-each=10
   ```

2. **Check the failure mode.** Does `waitForFunction` time out waiting for a DOM change that should follow a click? That's the classic signature.

3. **Audit the page's readiness signal:**

   ```bash
   # Find readiness signals
   grep -rn 'setAttribute.*data-.*-ready\|window\.__\w*Initialized' src/

   # For each match, check whether ANY addEventListener runs after it in the same script
   ```

   If yes, the signal is the bug. Move its emit-point to be the last meaningful statement in the script.

4. **Fix at the source, not the test.** Don't add `waitForTimeout` or extra RAF waits in the test as a workaround — that papers over the lie. Move the readiness signal so it tells the truth.

**Other parallel-load patterns to consider** if the readiness-signal audit comes up clean:

- `waitUntil: 'networkidle'` in `page.goto()` — see [TEST_BEST_PRACTICES.md #12](./TEST_BEST_PRACTICES.md#12--using-waituntil-networkidle-under-parallel-worker-load).
- A `beforeEach` waiting for a parent element when the test asserts on children — see [TEST_BEST_PRACTICES.md #25](./TEST_BEST_PRACTICES.md#25--shallow-readiness-gates-in-beforeeach-that-dont-match-test-dependencies).

---

### "Every vitest suite fails at once, at `describe`, with zero tests collected"

**Symptom:** a vitest run returns `Test Files N failed`, and each failing file shows `TypeError: Cannot read properties of undefined (reading 'config')` at its top-level `describe`. Sometimes it's `Vitest failed to find the current suite` instead. `import 0ms` and `tests 0ms` show nothing was collected. Files your change never touched fail identically.

**Cause (established 2026-09-26): two copies of vitest are loaded, one per drive-letter spelling.** On Windows, `npm run` resolves `node_modules/.bin` through its working directory. When that cwd is spelled with a lowercase drive (`c:\Code\gst-website`, which is what VS Code and the agent tooling often hand out), the runner loads as `c:/…/node_modules/vitest/…`. Test files then resolve their `import … from 'vitest'` through Vite's root, `C:/…/node_modules/vitest/…`. Node treats the two spellings as two modules, so a test that imported `describe` gets the copy with no runner state, and fails at `describe`.

Controlled A/B, 2026-09-26, same files, same shell:

| How vitest was launched                                        | File importing `describe` from `vitest` | File using globals |
| -------------------------------------------------------------- | --------------------------------------- | ------------------ |
| `node 'c:\…\node_modules\vitest\vitest.mjs' run …` (cwd `C:\`) | **fails**                               | passes             |
| `node 'C:\…\node_modules\vitest\vitest.mjs' run …` (cwd `C:\`) | passes                                  | passes             |
| `npm run test:run` with process cwd `c:\…` (lowercase)         | **fails**                               | passes             |
| `npm run test:run` from PowerShell `Set-Location 'c:\…'`       | passes: PowerShell normalizes the drive | passes             |

The same held for `npm run test:mcp` (183 of 196 files failed, all of them the importers). Two things about the cause:

- It is the **entry path's** drive case that matters, not the cwd. Changing the drive case inside `vitest.config.ts` (`process.chdir`) does not help, because the runner has already loaded by then.
- It explains the long-standing clues: the failure splits by import shape inside one run, it shows up without any concurrency, and the `RUN` header reads `c:/…` in some captures.

**Fix (in the code, not a workaround):** test files never value-import from `vitest`, and that includes `vi`. `globals: true` in both workspaces' configs supplies every runtime name. The tsconfig `types: ["vitest/globals"]` entry and the ESLint globals block declare them. Type-only imports (`import type { Mock } from 'vitest'`) are erased at compile time and are fine. ESLint enforces this with `@typescript-eslint/no-restricted-imports` on `tests/**` and `mcp-server/tests/**`. With the imports gone, every file uses the runner's own copy, and both suites pass from a lowercase-drive cwd. Before the fix they failed 63/101 and 183/196 files. See [TEST_BEST_PRACTICES.md pitfall 9](./TEST_BEST_PRACTICES.md#9--explicit-vitest-imports-when-globals-true-is-enabled).

**One residual effect under a lowercase-drive launch:** config-level mock clearing between tests didn't reach one mcp-server test's spy. It inherited a call from the previous test and counted 201 against a cap of 200 (`tests/unit/trial/signup.test.ts`, 2026-09-26). If a test asserts a call **count**, call `mockClear()` on that spy itself rather than relying on config defaults.

**If you still see the signature:**

1. Check for a reintroduced value import: `npm run lint` flags it.
2. Check for install drift. 2026-09-11 had a deterministic variant caused by `node_modules` no longer matching the lockfile after installs across Vitest majors. A plain `npm ci` fixed it. If you find 4.x `vitest` or `@vitest/*` packages on disk, that is drift: since BL-160 the lockfile has none.
3. Capture before re-running. Redirect the first attempt to a file outside the repo, e.g. `npm run test:docs > "$TEMP/td.txt" 2>&1`. A green re-run destroys the evidence, and there's no test name to capture at the collection phase.

**History, kept because the pattern is the lesson.** Between 2026-08-06 and 2026-09-22 this failure was diagnosed five ways, all wrong or unproven:

- a broken install;
- a concurrent `astro check`;
- a cold `node_modules/.vite`, refuted by its own timeline;
- "two vitest instances" asserted by elimination, with no mechanism;
- "the shell", which was really a green re-run credited to the shell that re-ran it.

The drive-letter lead was noticed on 2026-08-09 and set aside, because three runs "from a lowercase cwd" passed. Those runs went through PowerShell, which silently normalizes the drive. So the instrument never produced the condition it was meant to test. The fix came from launching the entry script by an explicitly spelled path and watching both outcomes. Validate the probe against a known-failing case before trusting its negative.

**Related:** ["npm run test:all hangs or times out"](#npm-run-testall-hangs-or-times-out) covers resource exhaustion within one run.

---

### "Single test fails randomly (flaky test)"

**Likely cause:** Race condition or timing-dependent assertion

**Solution:**

1. **Use proper waits, not arbitrary timeouts**

   ```typescript
   // ❌ Bad - arbitrary wait
   await page.waitForTimeout(1000);

   // ✅ Good - wait for the state change (theme classes live on <html>;
   // four states — use the helper in tests/e2e/helpers/theme.ts)
   await waitForTheme(page, 'dark');
   ```

2. **Reference:** [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md) - Red flags section

3. **Run test multiple times to confirm:**
   ```bash
   npx playwright test -g "test name" --repeat-each=5
   ```

### "A UI region renders empty and the test fails locally, but CI is green"

**Likely cause:** a long-lived dev server whose Vite module graph has gone stale after many HMR cycles — **not** your change.

Playwright's `webServer` uses `reuseExistingServer: !process.env.CI`, so locally it attaches to whatever server is already on :4321. After an editing session with dozens of hot reloads, Vite can start serving `504 (Outdated Optimize Dep)` for a chunk in a client script — lazily imported or static. The page still loads and the element still exists — it is just **empty**, because the code that fills it never ran.

This is easy to misread as a real regression, because the symptom is silent. TechPar's trajectory legend is the known example: `renderTrajectory` (`src/scripts/techpar/chart.ts`) awaits a dynamic `import('chart.js')` and only then fills `[data-traj-legend]`, all inside a `try/catch` whose handler calls `Sentry.captureException` and nothing else — so a failed import yields an empty legend with **no console error and no test-visible exception**. The same shape emptied the ICG wizard, where the whole client module failed and `[data-view="wizard"]` never initialised.

**Confirm it is environmental, in this order — cheapest first:**

1. Check CI on the same commit. If `Test Suite` is green there, stop suspecting your diff.
2. Run the same test against an unmodified tree — `git stash` if your work is uncommitted, `git checkout master` if it is already committed. (`git stash` is a no-op on committed work, so skipping this distinction gives you a confident-looking result from the tree you were trying to rule out.)
3. Restart clean and re-run:
   ```bash
   # stop whatever is on :4321, then
   rm -rf node_modules/.vite .astro
   npm run dev
   ```
   Clear the caches only for **this** failure mode — a stale graph. For an ordinary
   first-run-of-the-day timeout, deleting `.vite` forces a full re-optimization and
   makes the next run slower for no benefit; just re-run instead.

Only after all three still fail is it worth debugging the feature.

**The same 504 can be produced in CI, deterministically, by a second dev server.** On 2026-09-05 a Playwright config with **two** `webServer` entries (4321 and a forced-live 4326 for the localization spec) turned the TechPar trajectory test red in two consecutive CI runs while it stayed green locally: both servers boot cold in CI and share `node_modules/.vite`, so one server's dependency re-optimization invalidated the `?v=` hashes the other had already served — the trace showed 4321 answering `/node_modules/.vite/deps/chart__js.js` with `504 Outdated Optimize Dep`. Locally the reused, warm 4321 server never re-optimized, which is why step 1 above ("check CI") pointed the right way and step 2 did not reproduce. The fix was to remove the second server; if two Vite dev servers must ever share a checkout, give each its own Vite `cacheDir`.

**Two adjacent traps when starting the server yourself.** On Windows (observed; the wrapper's behaviour differs by platform, and a Linux launcher will typically block), `npm run dev` returns while a server keeps listening — verified by watching a background job report `Completed` while `:4321` still answered 200. Playwright races process-exit against URL-availability and reports that as `Error: Process from config.webServer exited early`, even though a server is up. Separately, if nothing is bound to 4321 yet when Playwright starts its own, Astro auto-increments to **4322**, leaving two servers up while the suite talks to neither the one you were watching nor the one you expected. Wait for the port to answer before invoking the suite.

**One known intermittent, already audited — do not re-derive it.** The three "Not sure" tests in `diligence-machine.test.ts` (§12) fail occasionally in a large multi-file run and pass on the immediate repeat, in isolation, and on master. It is **not** the readiness-signal defect described under ["Test passes in isolation but fails in the full suite"](#test-passes-in-isolation-but-fails-in-the-full-suite-parallel-load-flake): that entry's own gate comes back clean here, because `data-restored="true"` is set by the last statement of `src/scripts/diligence-machine/index.ts`, after every top-level `addEventListener` in its event-binding section — the signal tells the truth (re-checked 2026-09-28 when the script left the page, ADR-0042). What remains is first-run contention. Seen four times across two sessions as of 2026-07-30; re-run before investigating.

### "Coverage report is missing"

**Solution:**

```bash
# Coverage is only generated with Vitest (unit/integration)
npm run test:coverage

# View report
open coverage/index.html
```

---

## GitHub Actions / CI/CD Issues

### "Workflow shows red X but tests passed locally"

**Possible causes:**

1. **Branch protection rules blocking merge** - Even though tests passed
2. **Other status checks failing** - Not just tests
3. **Tests didn't actually run** - Check workflow logs

**Solution:**

```bash
# Check GitHub Actions logs
# 1. Go to repository → Actions tab
# 2. Find the failing workflow run
# 3. Click it to see logs
# 4. Expand "test" step to see test output

# Or verify locally
npm run test:all
```

### "GitHub Actions test.yml not running on my branch"

**Possible causes:**

1. **Branch prefix not in the push list** - `test.yml` runs on pushes to `master`, `feat/**`, `fix/**`, `feature/**`, `dependabot/**`, `docs/**` and `chore/**`, and on a PR to `master` only when it is opened or reopened. A branch named outside those families gets no runs on its pushes. See [DEVELOPER_TOOLING.md § What runs automatically](../development/DEVELOPER_TOOLING.md#what-runs-automatically)
2. **The run skipped its steps** - A docs-only or duplicate push still runs, but every job reports a skipped-steps success; check the Detect Code Changes job's "Log gate decision" step
3. **Workflow file has syntax error** - YAML parsing failed

**Solution:**

```bash
# Check workflow file
cat .github/workflows/test.yml
```

`test.yml` has no `workflow_dispatch`, so there is no "Run workflow" button for it. Rename the branch into a covered family, or close and reopen the PR (which fires `reopened`).

### "A check is stuck — running for minutes with no logs, or queued with no job at all"

**Symptom:** A job that normally takes seconds sits `in_progress` for many minutes and its log page is empty; or a run stays `queued` while `gh run view` shows no jobs. Downstream jobs report `skipped` because the job they gate on never produced its outputs.

Distinct from ["Workflow shows red X but tests passed locally"](#workflow-shows-red-x-but-tests-passed-locally), which is about a _red result_. This entry is about _no result_.

**First: is it your repo or GitHub?** Check the incident feed before investigating anything local — during an Actions incident this is not a repo problem and no config change will help:

```bash
curl -s https://www.githubstatus.com/api/v2/status.json          # overall indicator
curl -s https://www.githubstatus.com/api/v2/incidents/unresolved.json  # open incidents
```

**Read the job's step names and runner — together they separate "slow" from "never started":**

```bash
gh api repos/<owner>/<repo>/actions/runs/<run-id>/jobs \
  --jq '.jobs[] | "\(.status)/\(.conclusion // "-") runner_id=\(.runner_id) \(.name) [\(.steps|map(.name)|join(", "))]"'
```

Add `/attempts/<n>` before `/jobs` to inspect an earlier attempt — a re-run overwrites the top-level view, so the original evidence is only reachable that way.

**Read the step _names_, not the count.** A non-zero step count does not mean the job did any of your work: `Set up job` is the runner's own provisioning step, and whenever the step list is non-empty it is the **first** entry — including on successful jobs, where it sits alongside the real steps. The 2m42s attempt below had exactly one step, and it was `Set up job` — checkout and everything after it never appeared. A count alone cannot tell that apart from an ordinary cancelled job, which is why the command prints names.

Three shapes, all observed on run `31117388132` during the 2026-08-06 outage. Bracketed lists are what the command above prints:

| shape                            | meaning                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `[]`, `runner_id` non-zero       | a runner was allocated but handed no work — no logs because no step ran |
| `[]`, `runner_id=0`              | no runner was ever assigned                                             |
| `[Set up job]` and nothing after | a runner picked it up but never got past provisioning                   |

`runner_id=null` with `[]` is a fourth, benign case — the downstream jobs that report `skipped` because their gate never produced outputs. The command lists every job, so expect these in the same output.

**Do not read the durations as a timeout constant.** The same job's three attempts were cancelled after **2m42s, 7m48s and 15m04s**. Expect minutes rather than seconds, expect `cancelled`, and expect downstream jobs `skipped` — but do not wait on a specific number.

**A `queued` run with no jobs at all is a separate failure** from a push that produced no run at all:

- **Run exists, no job records** — job creation failed inside the Actions backend. Runs `31117340328` and `31117389676` sat this way for the better part of a day (still `queued`, zero jobs, 23h later).
- **No run at all** — the triggering webhook was dropped. GitHub's 2026-08-06T20:34Z `investigating` update reported "processing approximately 15% of webhooks, so many events such as pushes and pull requests are not triggering workflow runs". The 2026-08-07T02:03Z `monitoring` update states such triggers are not replayed automatically: "Customers may need to repeat the triggering action by pushing a new commit, updating the pull request, or manually re-running the workflow where applicable."

**Do not keep re-running during an incident.** Attempts cost minutes and end the same way; while webhooks are throttled a re-run may also be dropped before it starts. Wait for the incident to reach `monitoring`/`resolved`, then re-run once.

**Runs wedged by an incident may be unrecoverable.** After the 2026-08-06 outage one run reported three contradictory states — `gh run list` said `queued`, `gh run cancel` said "Cannot cancel a workflow run that is completed", and `gh run rerun` said "cannot be rerun; This workflow is already running". No retry fixes that.

**Remedy: close and reopen the PR.** This does _not_ cancel the wedged runs — they stay `queued` indefinitely — but `reopened` triggers **fresh** `pull_request` runs with new IDs, which is what unblocks the checks. It is the same fix documented for a PR stuck BLOCKED after "Update branch" (see [DEVELOPER_TOOLING.md](../development/DEVELOPER_TOOLING.md)). It works only for workflows whose `pull_request:` trigger lists `reopened` — the repo's CI workflows do. Prefer it over pushing an empty commit, which moves HEAD and invalidates the implementation-review marker the push gate requires.

**Useful control:** a green Vercel check on the same commit confirms the site still **builds** on independent infrastructure. It does not run the test suite, lint, or type-check (`vercel.json` sets no `buildCommand`, so the Astro preset runs `astro build` only), so on a docs-only diff it proves little beyond "not a build break".

---

### "Tests pass locally but fail in CI on specific browser (Firefox or Safari)"

Only the manual `test-cross-browser.yml` run exercises firefox and webkit in CI; the required E2E job is chromium-only.

**Possible causes:**

1. **Browser-specific CSS behavior** - margin/padding calculations differ
2. **JavaScript timing differences** - Animation frame ordering varies
3. **CSS vendor prefixes missing** - LightningCSS adds prefixes from `browserslist`; a hand-written prefix can make it drop one (see DEVELOPER_TOOLING § Vendor prefix policy)

**Solution:**

```bash
# Run E2E tests on specific browser locally
npx playwright test --project=firefox
npx playwright test --project=webkit

# Generate debugging info
npx playwright test --debug  # Step through in Playwright Inspector

# View headed browser
npx playwright test --headed --project=firefox
```

### "Vercel deployment fails after tests pass"

**Possible causes:**

1. **Build command failing** - `npm run build` works locally but not in CI
2. **Environment variables not set in Vercel** - Check Vercel dashboard
3. **Node version mismatch** - Vercel using different Node than GitHub Actions

**Solution:**

```bash
# Simulate Vercel build locally
npm run build

# Check Vercel environment variables:
# 1. Go to Vercel project settings
# 2. Check "Environment Variables" section
# 3. Verify PUBLIC_GA_MEASUREMENT_ID and the other vars in astro.config.mjs env.schema are set

# Check Node version
cat .nvmrc  # Expected version
node --version  # Your version
```

---

## Branch Protection & PR Workflow

### "I can't merge my PR even though all checks pass"

**Possible causes:**

1. **Branch not up to date with master** - The ruleset's strict policy requires it
2. **A required check is missing, not failing** - The checks passed on an older head, or never reported on this one
3. **A required check is still expected** - e.g. `lighthouse`, which is required and runs only on pull requests, so a head that no PR run has seen has no result for it

**Solution:**

```bash
# Merge master into your branch (the repo merges, never squashes or force-pushes)
git fetch origin
git merge origin/master
git push origin your-branch
```

The push triggers a fresh `test.yml` run on the new head. If you used GitHub's **"Update branch"** button instead and the PR stays BLOCKED with checks stuck "expected", close and reopen the PR — see [DEVELOPER_TOOLING.md § What runs automatically](../development/DEVELOPER_TOOLING.md#on-every-push-to-master-feat-fix-feature-dependabot-docs-chore-and-prs-to-master). The required checks are listed in [GITHUB_ACTIONS_SETUP.md § Branch Protection Rules](./GITHUB_ACTIONS_SETUP.md#branch-protection-rules).

---

## Test Output & Debugging

### "Test failure shows cryptic error message"

**Solution:**

1. **Read full error context**

   ```bash
   # Run with verbose output
   npx playwright test -g "test name" --verbose
   ```

2. **Save debug output**

   ```bash
   # Generate video and trace files
   npx playwright test --trace on --video on

   # View trace in Playwright Inspector
   npx playwright show-trace trace.zip
   ```

3. **Check screenshot** - GitHub Actions automatically saves on failure
   ```
   # In GitHub Actions UI:
   # 1. Click failing job
   # 2. Scroll to "Artifacts" section
   # 3. Download test-results folder
   ```

### "How do I debug a specific E2E test?"

**Solution:**

```bash
# Method 1: Interactive debugger
npx playwright test --debug -g "test name"
# Then use Playwright Inspector to step through

# Method 2: Headed browser (watch it run)
npx playwright test --headed --project=chromium -g "test name"

# Method 3: Add debug statements
// In test file
await page.pause();  // Pauses execution, opens inspector

// Run test
npx playwright test -g "test name"
```

---

## Performance & Resource Issues

### "Tests running slowly locally"

**Solutions:**

```bash
# Run in parallel (faster, default)
npm run test:all

# Check which tests are slowest
npm run test:all --reporter=verbose

# Profile test execution
npx playwright test --trace on --timeout=60000
```

### "CI tests timing out (30 minute limit)"

**Solution:**

1. **Optimize slow E2E tests**

   ```bash
   # Run just E2E tests
   npm run test:e2e

   # Check which are slowest
   npx playwright test --reporter=list
   ```

2. **Split test runs** - Consider splitting into multiple jobs in workflow

3. **Reference:** [GITHUB_ACTIONS_SETUP.md § What the E2E job does](./GITHUB_ACTIONS_SETUP.md#what-the-e2e-job-does) - the job's steps, workers, retries and timeout. Do not raise the timeout to make a slow run fit; find what got slower

---

## Analytics Testing Issues

### "Google Analytics events not tracking in tests"

**Causes:**

1. **GA requests blocked by test setup** - Playwright blocks external requests
2. **gtag not initialized yet** - Tests running before GA loads
3. **Events not properly tracked** - Check event name/parameters

**Solution:**

```bash
# Run analytics tests specifically
npx playwright test analytics.test.ts

# Debug event tracking
// In test
await page.on('console', msg => {
  if (msg.text().includes('gtag')) {
    console.log('GA Event:', msg.text());
  }
});

// Reference
cat src/docs/analytics/ANALYTICS_TESTING.md
```

---

## Configuration Issues

### "vitest.config.ts errors when running tests"

**Possible causes:**

1. **TypeScript compilation error** - Check for type errors in config
2. **Missing @vitest/ui** - If using `npm run test:ui`
3. **Coverage provider not installed** - Using undefined coverage option

**Solution:**

```bash
# Install missing dependencies
npm install @vitest/ui

# Validate config syntax
npx vitest --inspect --help  # Shows validation errors

# Check config file
cat vitest.config.ts
```

### "A Worker integration test times out at 5000ms in its first `it`"

**Symptom:** a test in one of the `unstable_dev` Worker-booting files under `mcp-server/tests/integration/` times out at exactly ~5000ms. Usually the file's first test, or the first one to touch a given subsystem. Green on some re-runs, and CI is fine.

**Cause (BL-149, six weeks and 26 instances):** `unstable_dev` resolves when the workerd process is **spawned**, but the first `worker.fetch()` still pays module-graph JIT and instantiation — measured at 7451ms p50, over 5000ms in 48 of 50 runs. `beforeAll` has an explicit 60s budget; an `it` has vitest's 5000ms default. A file that does not spend that cost in `beforeAll` bills it to a test.

**Fix:** warm the worker at the end of `beforeAll`:

```ts
import { warmWorker } from '../helpers/warm-worker';
// ...at the end of beforeAll, inside its 60_000 budget:
await warmWorker(worker);
// touches KV? pass the credential, or the warm-up 401s and warms nothing:
await warmWorker(worker, ['module', 'kv'], { adminKey: ADMIN_KEY });
```

All 11 booting files do this. **Do not raise the timeout and do not add a retry** — the cost is real and correctly budgeted in setup; the 5000ms default is what tells you a _warm_ fetch has regressed.

**If a warmed file still times out locally:** purge `mcp-server/.wrangler`. Accumulated local dev state (223 MB here, mostly a miniflare observability trace store) took first-KV-touch from 73ms to 1216ms and a KV list to 3.7s. It regenerates on the next run. This is why the flake was always machine-dependent, worsened over weeks, and never appeared in CI, which starts clean. Full evidence: [WORKER_BOOT_LATENCY_BL-149.md](../development/_archive/WORKER_BOOT_LATENCY_BL-149.md).

#### The website-suite lookalike: `spacing-lint-rule.test.ts` (BL-161, closed unfixed)

The same symptom has been seen twice in the website suite: `tests/integration/spacing-lint-rule.test.ts > flags a hardcoded on-scale literal in css`, at 5000ms and 9786ms (2026-09-09 and 2026-09-11). Both times it passed in isolation, and neither diff touched CSS. **Do not transplant the warm-up fix.** Stylelint's first-use cost was measured in isolation (five child-process runs against the repo `.stylelintrc.json`):

| phase                                                      | samples (ms)                |
| ---------------------------------------------------------- | --------------------------- |
| `import stylelint`, paid at **collection** (static import) | 346 / 216 / 217 / 206 / 210 |
| first `.css` lint (cold config cascade)                    | 362 / 256 / 251 / 240 / 249 |
| first `.astro` lint (`postcss-html` override)              | 52 / 35 / 37 / 36 / 36      |
| every later lint                                           | 4                           |

A `beforeAll` could relocate only about 250ms, which is 20–30× too small to explain either sighting. The first-vs-later asymmetry is real but harmless, and it makes the wrong fix look right. The item was closed by operator decision (2026-09-14) without full-suite runs under load, so **no cause is established**; contention is the leading hypothesis only because the alternatives were ruled out. **If it recurs:** check whether that first case's duration is inflated relative to its near-identical siblings _in the same run_, and whether the file's wall-clock materially exceeds the sum of its own test durations (descheduling).

**Third sighting (2026-09-17, `feat/audit-provenance`, a diff with no CSS):** the same case, 5000ms, in a `test:run` started right after a full `test:mcp` run (127s) on the same machine. The file took 6797ms for 47 tests, so the other 46 shared about 1.8s — the time went to that one case, with no sign of whole-file descheduling. It passed 47/47 on three isolated re-runs.

**Fourth sighting (2026-09-24, `feat/opus-5-bl-035`, a diff that changed only numbers in a TS data table):** the same case, 5000ms (reported 5555ms). The `test:run` ran straight after `astro check` and `lint`, with two Astro dev servers up on the same machine. The file took 6932ms for 47 tests, so the other 46 shared about 1.4s. The time again went to that one case, matching the third sighting. In isolation the case takes 560ms (the cold first `.css` lint), against 7–85ms for its siblings. It passed 47/47 on three isolated re-runs.

### "I bumped vitest, but the old major is still in the lockfile"

**Symptom:** `package.json` declares the new range, and `npm install` says "up to date". But `package-lock.json` still has the old version, for example a nested `mcp-server/node_modules/vitest@4.1.11` under a `^5.0.0` declaration. `npm prune` and wiping `node_modules` don't remove it either, because `npm install` rebuilds it from the lockfile.

**Cause (BL-160, 2026-09-11):** `vitest` and `@vitest/coverage-v8` peer-depend on each other at the **exact** same version. Once nothing depends on the old pair any more, each one still counts as needed by the other. npm keeps the pair as a self-supporting orphan cycle in the lockfile.

**Diagnose:** run `npm explain vitest@<old>`. If the only thing requiring it is its own `@vitest/*` sibling, and that sibling's only requirer is `vitest@<old>`, it's this orphan cycle.

**Fix:**

1. Bump `vitest` and every `@vitest/*` package in the workspace together. A `vitest` bump on its own leaves `@vitest/coverage-v8` peering the old version.
2. If the orphan cycle is still in the lockfile, delete those `packages` entries from `package-lock.json`, including the old `@vitest/*` packages hoisted to the root.
3. Run `npm install` so npm re-adds anything that's genuinely needed. It should add nothing.
4. Run `npm ci`, then check that `npm ls vitest --all` shows a single version and exits 0.

### "Playwright browsers not installed"

**Solution:**

```bash
# Install Playwright browsers
npx playwright install

# Reinstall all browsers (if corrupted)
npx playwright install --with-deps
```

---

## Still Stuck?

1. **Check test logs** - GitHub Actions shows full output
2. **Review [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md)** - Common patterns and anti-patterns
3. **Search closed GitHub issues** - Likely someone has seen this before
4. **Run with --debug flag** - Most test runners have debugging mode
5. **Ask for help** - Document what you tried and what happened

---

## Quick Reference

| Problem           | Command                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Run all tests     | `npm run test:all`                                                                                           |
| Run specific test | `npx playwright test -g "test name"`                                                                         |
| Debug test        | `npx playwright test --debug`                                                                                |
| View headed       | `npx playwright test --headed`                                                                               |
| Check coverage    | `npm run test:coverage`                                                                                      |
| Clear Playwright  | `rm -rf ~/.cache/ms-playwright`                                                                              |
| Run on Firefox    | `npx playwright test --project=firefox`                                                                      |
| Is GitHub down?   | `curl -s https://www.githubstatus.com/api/v2/status.json`                                                    |
| Stuck CI job?     | [Diagnosing a stuck check](#a-check-is-stuck--running-for-minutes-with-no-logs-or-queued-with-no-job-at-all) |

See [README.md](./README.md) for more commands.
