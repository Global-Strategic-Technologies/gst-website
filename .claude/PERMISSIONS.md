# Claude Permissions & Configuration

This document outlines the permissions and configurations for Claude Code when working on the GST Website project.

## Granted Permissions

### 📝 Task File Editing (Unrestricted)

**Path**: `.claude/tasks/**/*`

Claude has **unrestricted edit permissions** for all files in the `.claude/tasks/` directory, including:

- `todo.md` - Task planning and progress tracking
- Any future task management files

> **Note**: `lessons.md` (the former learning log) was **retired 2026-07-19**. Self-improvement patterns are now captured in the persistent **memory system** (`feedback` memories + the auto-loaded `MEMORY.md` index), per CLAUDE.md Directive 4 — not in `.claude/tasks/`.
>
> `.claude/tasks/` also holds the **review-gate runtime markers** — `plan-review.json` (written by the plan-reviewer agent) and `impl-review.json` (written by the code-reviewer agent). Both are gitignored; the PreToolUse gate hooks read them. See DEVELOPER_TOOLING.md § Claude Code review gates.

**Purpose**: Enable autonomous task management, progress tracking, and learning capture without requiring user approval for edits.

**Scope**:

- ✅ Create new task files
- ✅ Update progress on existing tasks
- ✅ Mark tasks as complete
- ✅ Document implementation notes
- ✅ Capture lessons learned
- ✅ Organize and reorganize task structure

## Configuration Details

Permissions live in the gitignored, per-developer settings files (see CLAUDE.md Directive 15):

- **`.claude/settings.local.json`** — the permission `allow` list, plus the review-gate `hooks` registration installed by `npm run setup:claude-hooks` (from the tracked source `.claude/hooks/hooks.config.json`)
- **`.claude/settings.json`** — additional per-developer permission state written by the harness; also gitignored, never tracked

(An earlier version of this doc cited a `.claude/config.json` file — that file never shipped; this section now reflects the real mechanism.)

## Why This Matters

This configuration follows the Claude Workflow Directives in `claude.md`:

1. **Task Management** - Claude needs to autonomously track work without permission delays
2. **Self-Improvement Loop** - Lessons learned must be documented immediately after corrections
3. **Progress Visibility** - Task files provide transparent tracking of ongoing work
4. **No Context Switching** - Eliminates need to ask user permission for task documentation updates

## Files Included

### `todo.md`

- Current and completed tasks
- Implementation plans and progress
- Verification results
- Task status and timelines

## Usage

Claude will automatically:

1. Create task entries when starting work
2. Update progress as work proceeds
3. Mark items complete with verification results
4. Move tasks to completed section when done

Corrections and self-improvement patterns are captured in the **memory system** (see CLAUDE.md Directive 4), not in `.claude/tasks/`.

## No Restrictions

These are the only files Claude has unrestricted edit access to. All other files in the project follow standard code review and verification practices:

- **Project Source Code**: Requires verification through tests
- **Configuration Files**: Requires careful review before changes
- **Documentation**: Reviewed for accuracy and completeness
- **Test Files**: Verified to ensure they pass

This balanced approach enables efficient task management while maintaining code quality and safety for the main project.

---

**Last Updated**: February 2, 2026
**Status**: Active ✅
