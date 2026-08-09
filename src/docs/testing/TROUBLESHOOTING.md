# Testing & CI/CD Troubleshooting Guide

Solutions to common problems when running tests locally and in CI/CD.

## Local Testing Issues

### "Tests work locally but fail in GitHub Actions"

**Possible causes:**

1. **Node version mismatch** - CI runs Node 18 and 20, you might have a different version
2. **Missing environment variables** - Check `.env` file is not committed
3. **Flaky timing in E2E tests** - Your machine is faster than CI
4. **Platform differences** - You're on Windows, CI runs on Linux

**Solution:**

```bash
# Check your Node version
node --version

# Run tests with CI-like conditions
npm run test:all  # Simulates CI test run

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

**Symptom:** A vitest command that passed moments ago returns `Test Files N failed (N)` / `Tests no tests`, with a `TypeError: Cannot read properties of undefined (reading 'config')` at the top-level `describe`. **Files your change never touched fail identically.**

**Likely cause:** A second vitest process running concurrently — an agent, an IDE test runner, or another terminal starting a run while one is already going. Read this together with the measured negative below: concurrency correlates with most sightings but has never been made to reproduce it on demand, so it is the first thing to rule out, not the established cause.

**The mechanism is not established.** Candidates include Vite's dep-optimizer rewriting `node_modules/.vite/deps` mid-run, and two vitest instances leaving the runner's worker state undefined (which is what a `reading 'config'` TypeError at `describe` usually smells like). Note the two workspaces have **separate** caches — `node_modules/.vite` and `mcp-server/node_modules/.vite` — so a root `npm run test:run` concurrent with `npm run test:mcp` shares no cache at all, and a shared-cache story cannot explain that pairing. Treat everything in this paragraph as explanation, not evidence — and see § What was measured below before treating concurrency itself as settled, because it is not.

**Phase first:** the failure is at _collection_ — zero tests gathered, so no assertion ever executed. A broken import or a bad config does the same, so the phase narrows it without settling it. These three do the discriminating:

1. **Blast radius.** Files unrelated to your change fail too. Content defects are selective; this is not.
2. **Reproducibility.** Content fails deterministically. Re-run with nothing else running — contention clears, content does not.
3. **No test name exists to capture.** A consequence of the phase, and the reason the usual "capture the failing test name" rule needs a substitute here.

**Solution:** Ensure only one vitest process is running, then re-run. If it persists across serial runs, it is not this — treat it as a real failure and debug the import graph.

#### What was measured on 2026-08-09

**The signature, finally captured.** Every prior sighting was lost to a re-run. This one was redirected to a file first:

```
RUN  v4.1.10 c:/Code/gst-website
 ❯ tests/integration/docs-variables-sync.test.ts (0 test)
 ❯ tests/integration/docs-link-integrity.test.ts (0 test)
 FAIL  tests/integration/docs-link-integrity.test.ts
TypeError: Cannot read properties of undefined (reading 'config')
 ❯ tests/integration/docs-link-integrity.test.ts:359:1
 Test Files  2 failed (2)   Tests  no tests
 Duration  265ms (transform 58ms, setup 0ms, import 0ms, tests 0ms)
```

`import 0ms` and `tests 0ms` are the tell: nothing was ever imported. The line number is the file's final `describe`, not a real fault site.

**A discriminator worth running — it costs one command.** Within the same failing run, files that `import { describe, it, expect } from 'vitest'` fail at their first `describe`; files relying on `globals: true` collect normally. Run one of each: if the split follows import shape rather than file content, it is this failure and not a broken test.

**Concurrency does not reproduce it on demand.** Three shapes, each capturing full output rather than re-running:

| Shape                                                              | Attempts           | Reproduced |
| ------------------------------------------------------------------ | ------------------ | ---------- |
| Concurrent with `npm run test:mcp` (different vitest project)      | 40                 | 0          |
| Two concurrent `npm run test:docs` (**same** project + dep cache)  | 12 pairs           | 0          |
| Concurrent with `npx astro check` (content sync + type generation) | 6 rounds, ≤15 each | 0          |

Between 58 and 154 executed runs — the third row is bounded, not exact, and in an entry about evidentiary precision that distinction is the point. The same-project pairing is the sharpest of the three, being the only one that genuinely shares the root `node_modules/.vite`; the cross-workspace pairing shares no cache at all, per the caches note above.

**Ruled out by experiment**: drive-letter case of the cwd (`c:` vs `C:` in the RUN header differs between failing and passing runs, but 3/3 pass from a lowercase cwd with a warm cache); pool choice (`forks` and `threads` both fail); `--no-file-parallelism` (fails _more_ files, not fewer); the tool sandbox; duplicate vitest installs (single 4.1.10, no nested copies).

**Leading candidate, unproven: a cold or mid-rewrite `node_modules/.vite`.** The captured failure came on the first run after that directory was deleted, and the next run passed. That is consistent with the dep-optimizer story and would explain both the self-healing re-run and why concurrency correlates — a second process can invalidate the cache. It is **not** established: the decisive experiment is to delete `node_modules/.vite` and run immediately, which was not run here (`rm -rf` is a denied command shape in this repo's agent policy — ask a human to run it). Note `npx vitest run --force` is **not** a substitute; `--force` is not a vitest 4 flag and exits 1 on the CLI parse, which is easily misread as a reproduction.

**On the correlation.** Of three sightings that day, **two** coincided with a subagent running vitest in the same directory and **one did not** — the process list held nothing newer than the previous day. Concurrency is present in most sightings, absent in at least one, and insufficient in every controlled attempt. Treat it as the first thing to rule out, not the cause.

**Related:** ["npm run test:all hangs or times out"](#npm-run-testall-hangs-or-times-out) covers resource exhaustion _within_ one run; this entry is contention _between_ runs.

**Record it even though it's benign.** [CLAUDE.md](../../../.claude/CLAUDE.md) requires capturing evidence before a re-run, because a green re-run destroys it (this is why BL-106's unreproduced flake stayed open). When collection fails there is no test name, so capture the **signature** instead: the phase, the full set of failing files, and what else was running. Observed 2026-08-06, where it was first misdiagnosed as a permanently broken local vitest install — the misdiagnosis was corrected only when the same command later passed in the same shell.

**Capture means redirect, not scrollback.** The 2026-08-09 sightings were lost three times over precisely because the command was run bare and then re-run. `npm run test:docs > /tmp/td.txt 2>&1; echo "exit=$?"; cat /tmp/td.txt` costs nothing and survives the re-run. Do not pipe through `tail` on the first attempt either — that is how the `Test Files N failed` line, the one that distinguishes this failure from a fast pass, got truncated away twice.

**Two diagnoses of this failure have now been wrong, both asserting a cause without running the check that would prove it** — "permanently broken vitest install" (2026-08-06) and "concurrent `astro check`" (2026-08-09, offered for a sighting that had nothing running in parallel). Given the table above, the honest position is that the trigger is unidentified. State that rather than reaching for the nearest plausible mechanism.

---

### "Single test fails randomly (flaky test)"

**Likely cause:** Race condition or timing-dependent assertion

**Solution:**

1. **Use proper waits, not arbitrary timeouts**

   ```typescript
   // ❌ Bad - arbitrary wait
   await page.waitForTimeout(1000);

   // ✅ Good - wait for state change
   await page.waitForFunction(() => {
     return document.body.classList.contains('dark-theme');
   });
   ```

2. **Reference:** [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md) - Red flags section

3. **Run test multiple times to confirm:**
   ```bash
   npx playwright test -g "test name" --repeat-each=5
   ```

### "A UI region renders empty and the test fails locally, but CI is green"

**Likely cause:** a long-lived dev server whose Vite module graph has gone stale after many HMR cycles — **not** your change.

Playwright's `webServer` uses `reuseExistingServer: !process.env.CI`, so locally it attaches to whatever server is already on :4321. After an editing session with dozens of hot reloads, Vite can start serving `504 (Outdated Optimize Dep)` for a chunk in a client script — lazily imported or static. The page still loads and the element still exists — it is just **empty**, because the code that fills it never ran.

This is easy to misread as a real regression, because the symptom is silent. TechPar's trajectory legend is the known example: `renderTrajectory` (`src/utils/techpar/chart.ts`) awaits a dynamic `import('chart.js')` and only then fills `[data-traj-legend]`, all inside a `try/catch` whose handler calls `Sentry.captureException` and nothing else — so a failed import yields an empty legend with **no console error and no test-visible exception**. The same shape emptied the ICG wizard, where the whole client module failed and `[data-view="wizard"]` never initialised.

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

**Two adjacent traps when starting the server yourself.** On Windows (observed; the wrapper's behaviour differs by platform, and a Linux launcher will typically block), `npm run dev` returns while a server keeps listening — verified by watching a background job report `Completed` while `:4321` still answered 200. Playwright races process-exit against URL-availability and reports that as `Error: Process from config.webServer exited early`, even though a server is up. Separately, if nothing is bound to 4321 yet when Playwright starts its own, Astro auto-increments to **4322**, leaving two servers up while the suite talks to neither the one you were watching nor the one you expected. Wait for the port to answer before invoking the suite.

**One known intermittent, already audited — do not re-derive it.** The three "Not sure" tests in `diligence-machine.test.ts` (§12) fail occasionally in a large multi-file run and pass on the immediate repeat, in isolation, and on master. It is **not** the readiness-signal defect described under ["Test passes in isolation but fails in the full suite"](#test-passes-in-isolation-but-fails-in-the-full-suite-parallel-load-flake): that entry's own gate comes back clean here, because `data-restored="true"` is emitted at `index.astro:1788` while every `addEventListener` sits between `:1146` and `:1775` — the signal tells the truth. What remains is first-run contention. Seen four times across two sessions as of 2026-07-30; re-run before investigating.

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

1. **Workflow not triggered on your branch** - Only runs on master/dev
2. **Branch protection requires different branch** - Check repository settings
3. **Workflow file has syntax error** - YAML parsing failed

**Solution:**

```bash
# Check workflow file
cat .github/workflows/test.yml

# Trigger manually in GitHub UI:
# 1. Go to repository → Actions tab
# 2. Select "Test" workflow
# 3. Click "Run workflow" → select your branch
```

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

**Possible causes:**

1. **Browser-specific CSS behavior** - margin/padding calculations differ
2. **JavaScript timing differences** - Animation frame ordering varies
3. **CSS vendor prefixes missing** - Autoprefixer not running

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
# 3. Verify GA_MEASUREMENT_ID and other required vars are set

# Check Node version
cat .nvmrc  # Expected version
node --version  # Your version
```

---

## Branch Protection & PR Workflow

### "I can't merge my PR even though all checks pass"

**Possible causes:**

1. **Branch not up to date with master** - Need to rebase/merge
2. **Code review required but not completed** - Waiting for approval
3. **Branch protection rule not satisfied** - Outdated protection settings

**Solution:**

```bash
# Update your branch with latest master
git fetch origin
git rebase origin/master
git push -f origin your-branch

# Or merge master into your branch
git pull origin master
git push origin your-branch
```

Then refresh GitHub PR page to re-run tests.

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

### "CI tests timing out (20 minute limit)"

**Solution:**

1. **Optimize slow E2E tests**

   ```bash
   # Run just E2E tests
   npm run test:e2e

   # Check which are slowest
   npx playwright test --reporter=list
   ```

2. **Split test runs** - Consider splitting into multiple jobs in workflow

3. **Reference:** [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) - E2E timeout configuration

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
