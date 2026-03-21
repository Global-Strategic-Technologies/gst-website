# Learning Log: GST Website Project

This file captures patterns, mistakes, and learnings to improve future work on this project.

## Lessons Learned

### Lesson: PR scope must match actual new commits, not full branch divergence
**Date Identified**: 2026-02-18
**Severity**: Critical

#### Pattern
When creating a PR from `dev` to `master`, used `git log master..HEAD` and `git diff master...HEAD` which showed ALL 245 diverged commits instead of just the 1 new commit since the last merge PR.

#### Root Cause
`master` is far behind `dev` (many prior PRs already merged). Using `master..HEAD` shows the entire divergence history, not just what's new since the last PR. Did not check which commits were already covered by previous merged PRs.

#### Rule for Future
Before creating a PR, identify the last merge point (e.g., the most recent merge PR). Only include commits after that point. Use `git show <commit> --stat` on the specific new commit(s) to confirm scope. When the user says "create a PR," check if the branch has been incrementally merged before and scope accordingly.

#### Example
PR #34 was created with 245 commits and 89 files when only 1 commit (`fb6653a`) touching 1 file was new. Had to close #34 and create #35 with the correct scope.

---

### Lesson: Content changes must include E2E test updates for hardcoded strings
**Date Identified**: 2026-02-28
**Severity**: Critical

#### Pattern
Changed brand name from "Global Strategic Technologies" to "GST" across 10 source files but missed 2 E2E test assertions that expected the old string. Tests failed in CI across all 3 browsers.

#### Root Cause
Did not grep the test directory for old strings being replaced. Treated the change as "content only" and skipped checking test assertions that match on rendered text.

#### Rule for Future
After ANY content/copy change, immediately grep `tests/` for the old strings before committing. Run: `grep -r "OLD_STRING" tests/` for every string changed. This applies to brand names, headings, CTA text, meta descriptions — anything that might appear in a test assertion. Added as directive #8 in CLAUDE.md.

#### Example
Changed `Global Strategic Technologies` → `GST` in diligence machine source but missed `diligence-machine.test.ts:516` (`.doc-brand-name` assertion) and `:812` (clipboard content assertion). All 3 browser E2E tests failed.

---

### Lesson: Config-level changes must be checked for externalities across all test files
**Date Identified**: 2026-03-20
**Severity**: Critical

#### Pattern
Added `permissions: ['clipboard-read', 'clipboard-write']` to the Chromium project config in `playwright.config.ts`. This fixed clipboard tests for desktop but broke all 32 mobile E2E tests that use `test.use({ ...devices['iPhone 12'] })`, because mobile device contexts don't support desktop-only permissions.

#### Root Cause
The fix was validated only against the tests it was meant to fix (desktop clipboard tests). No check was done for other test files that run under the same Chromium project but override the device — the permissions leaked into those contexts and caused `"Unknown permission"` crashes.

#### Rule for Future
1. **Never add `permissions` to project-level Playwright config** — grant them per-test with `context.grantPermissions()` guarded by `browserName`.
2. **Before committing any shared config change**, grep for `test.use` calls that might interact: `grep -r "test.use" tests/e2e/`.
3. **General principle**: any change to a shared config file (playwright.config, vitest.config, astro.config) must consider all consumers, not just the immediate fix target.

#### Example
Commit `7b05bad` added clipboard permissions to the Chromium project in `playwright.config.ts`. This broke 19 tests in `mobile-navigation.test.ts` and 13 in `regulatory-map-mobile.test.ts` — both use `test.use({ ...devices['iPhone 12'] })`. Fix: removed project-level permissions; clipboard grants already existed per-test in `diligence-machine.test.ts`.

---

## How to Add a Lesson

When a correction is made or improvement identified:

1. **Pattern**: What was the mistake or gap?
2. **Root Cause**: Why did it happen?
3. **Rule**: What rule prevents this in the future?
4. **Example**: Specific case that triggered this lesson

### Template

```
## Lesson: [Title]
**Date Identified**: [Date]
**Severity**: Critical / Important / Nice-to-Have

### Pattern
_What went wrong or could be improved?_

### Root Cause
_Why did this happen?_

### Rule for Future
_How to prevent this?_

### Example
_Specific case that triggered this lesson._
```

---

## Self-Improvement Goals

- Reduce planning oversights
- Improve code review standards
- Strengthen verification practices
- Enhance architectural decision-making

---

## Usage at Session Start

When starting work:
1. Review relevant sections of this file
2. Recall patterns from previous sessions
3. Apply learned rules proactively
4. Add new lessons as discovered
