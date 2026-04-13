# Branch Protection Rules Configuration

## What This Does

Prevents merging PRs to `master` unless:

- ✅ All tests pass
- ✅ Branch is up to date with master
- ✅ At least one approval (optional)

## Setup Steps

### 1. Go to Branch Settings

**URL:** `https://github.com/YOUR_ORG/gst-website/settings/branches`

Or navigate manually:

1. Go to your GitHub repo
2. Click **Settings** (top right)
3. Click **Branches** (left sidebar)
4. Click **Add rule** or edit existing master rule

### 2. Configure Basic Settings

**Branch name pattern:** `master`

Check these boxes:

- ✅ **Require a pull request before merging**
  - ✅ Require approvals: `1` (optional)
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from code owners (if using CODEOWNERS file)

- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging

### 3. Select Required Status Checks

Under "Require status checks to pass before merging", search for and select:

```
✅ Unit & Integration Tests (18.x)
✅ Unit & Integration Tests (20.x)
✅ Build Verification
⚠️ E2E Tests (Playwright) [optional - takes longer]
```

The "E2E Tests" check is optional because:

- Takes 5-8 minutes longer
- Sometimes flaky (will improve after initial setup)
- Can skip for emergency hotfixes with admin override

### 4. Additional Recommended Settings

Check these for extra safety:

- ✅ **Require code reviews before merging**
  - Required number of approvals: `1`
  - Dismiss stale pull request approvals: ✅

- ✅ **Require status checks to pass before merging**
  - Require branches to be up to date: ✅

- ✅ **Require conversation resolution before merging**
  - If you want to resolve comments before merge

- ✅ **Allow force pushes**
  - Set to "Allow force pushes from": `Administrators` (optional)

- ✅ **Allow deletions**
  - Keep unchecked (prevents accidental branch deletion)

### 5. Save

Click **Create** (new rule) or **Save changes** (existing rule)

---

## The Result

### For Authors Creating PRs

When you create a PR to master:

```
┌─ PR Created
│  ├─ GitHub Actions starts tests
│  ├─ Vercel creates preview
│  └─ Shows: "Some checks haven't completed yet"
│
├─ Tests run (5-10 minutes)
│  ├─ Unit & Integration (3-4 min)
│  ├─ E2E (5-7 min) [optional]
│  └─ Build verification (2-3 min)
│
├─ Status updates
│  ├─ ✅ All checks pass → "All required checks passed"
│  └─ ❌ Tests fail → "Some checks failed"
│
└─ Merge button
   ├─ If all pass → Green, mergeable ✅
   ├─ If tests fail → Disabled 🔒
   └─ You need approval → Shows approval status
```

### For Reviewers

When reviewing a PR:

1. **Check tests first**
   - Look for green checkmarks ✅
   - If ❌ tests failed, ask author to fix

2. **Review code changes**
   - Review the file changes
   - Add comments/suggestions

3. **Approve the PR**
   - Click "Approve" (shows your name)
   - Comment if needed

4. **Merge when ready**
   - Click "Merge pull request"
   - Tests already passed, so it's safe

### Emergency: Bypassing Checks

If you NEED to bypass (rare!):

1. **Admin override:**
   - If you're admin: "Dismiss review" or "Merge without checks"
   - Only in true emergencies

2. **Better option: Hotfix**
   - Create PR with urgent fix
   - Ask someone to approve quickly
   - Merge normally (tests still pass)

---

## Rule Details Explained

### "Require a pull request before merging"

Forces all changes through PR review (not direct pushes).

**Effect:** Can't `git push` directly to master - must PR first.

**Why:** Catch issues before production.

### "Require approvals"

Someone must review and approve before merging.

**Effect:** PR won't merge until someone clicks Approve.

**Why:** Prevents mistakes, catches edge cases.

### "Dismiss stale pull request approvals when new commits are pushed"

If author pushes new commits after approval, approval is removed.

**Effect:** New code must be approved again.

**Why:** Prevents approving old code, then changing it without re-review.

### "Require status checks to pass before merging"

All CI tests must pass (green ✅) before merging.

**Effect:** Can't merge if tests fail, even with approvals.

**Why:** Ensures code quality - broken tests = broken master.

### "Require branches to be up to date before merging"

PR must be rebased on latest master before merging.

**Effect:** Before merge button appears, must click "Update branch".

**Why:** Prevents conflicts, ensures tests pass on latest code.

---

## Typical PR Workflow

```
1. Create PR (from feature branch)
   ↓
2. GitHub Actions tests start
   ↓
3. While tests run:
   - Assign reviewers
   - Review code changes
   - Ask for changes if needed
   ↓
4. Tests complete (5-10 min)
   ├─ Pass? → Shows ✅
   └─ Fail? → Shows ❌ (must fix)
   ↓
5. Tests pass, reviewer approves
   ↓
6. Click "Merge pull request"
   ├─ Checks if up to date
   └─ Merges to master automatically
   ↓
7. Vercel deploys master automatically
   ↓
8. Deleted PR branch (optional)
```

---

## Checking the Rules Are Working

### Test it by creating a test PR:

1. Create a branch: `git checkout -b test-rules`
2. Make a simple change: Add a comment to a file
3. Push: `git push origin test-rules`
4. Create PR to master
5. Check that tests are required (should see "Some checks haven't completed yet")
6. Wait for tests to pass
7. Try to merge - should work if tests pass
8. Delete the branch: `git branch -D test-rules`

### Verify in settings:

Go to `Settings → Branches → master` and you should see:

```
✅ Require a pull request before merging
   - Require approvals: 1
   - Dismiss stale approvals: ✅

✅ Require status checks to pass before merging
   - Unit & Integration Tests (18.x)
   - Unit & Integration Tests (20.x)
   - Build Verification
   - E2E Tests (optional)
   - Require up to date: ✅

✅ Require conversation resolution before merging
```

---

## Troubleshooting

### "Some checks haven't completed yet"

- Tests are still running (usually 5-10 minutes)
- Wait for them to finish
- Refresh the page to see update

### "X check failed"

- Tests failed
- Click on the failed check to see error
- Author needs to fix and push again

### "This branch can't be merged due to conflicts"

- Branch is out of date with master
- Click "Update branch" button to rebase
- Tests may run again after rebase

### "This branch has no commit history"

- Brand new branch with no changes
- Make a real change first

### "Protection rule mismatch"

- Status check name doesn't match
- Go to Actions tab and get exact check name
- Update the branch protection rule

---

## FAQ

### Q: Does this block Vercel deployments?

**A:** No! Tests run during PR review. Once merged, Vercel deploys master automatically (tests already passed).

### Q: Can I skip tests for emergencies?

**A:** Yes, if you're an admin. But better: tests usually pass in 10 minutes. Rare to need skip.

### Q: What if tests are flaky?

**A:** Flaky tests usually happen before first implementation. Once tests are solid, they'll be reliable. Rerun is an option in Actions.

### Q: Does this work with squash merging?

**A:** Yes! GitHub allows any merge strategy. Tests still must pass.

### Q: Can I merge without approval?

**A:** Not with these rules. Tests must pass AND someone must approve (unless you're admin).

### Q: What about direct commits to master?

**A:** This rule prevents them. All commits must go through PR (which requires tests to pass).

---

## Next Steps

1. **Set up the rule** - Follow steps 1-5 above
2. **Test the rule** - Create a test PR to verify it works
3. **Train team** - Everyone should know tests must pass
4. **Document** - Share this with your team
5. **Monitor** - Check that PRs follow the workflow

---

**Last Updated:** 2026-01-28
**Applies To:** GitHub branch protection rules
**Status:** Ready to implement
