/**
 * Installs the review-gate hooks (hooks.config.json) into this developer's
 * .claude/settings.local.json — run via `npm run setup:claude-hooks`.
 *
 * Why an installer instead of a tracked settings file: the Claude Code harness
 * actively writes personal permission approvals into .claude/settings.json, so
 * tracking that file would leak per-developer allowlists into the repo and
 * churn on every approval. settings.local.json is gitignored by design; this
 * script idempotently merges ONLY the `hooks` key into it, preserving every
 * other key (permissions, defaultMode, ...). Re-run safe. Hooks hot-reload —
 * no Claude Code restart needed.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG = resolve(SCRIPT_DIR, 'hooks.config.json');
// Target overridable for tests.
const TARGET =
  process.env.GST_HOOK_INSTALL_TARGET || resolve(SCRIPT_DIR, '..', 'settings.local.json');

const { hooks } = JSON.parse(readFileSync(CONFIG, 'utf-8'));
if (!hooks || typeof hooks !== 'object') {
  console.error('hooks.config.json has no "hooks" key — nothing to install.');
  process.exit(1);
}

let settings = {};
if (existsSync(TARGET)) {
  try {
    settings = JSON.parse(readFileSync(TARGET, 'utf-8'));
  } catch (err) {
    console.error(
      `Refusing to overwrite ${TARGET}: existing file is not valid JSON (${err.message}). ` +
        'Fix or remove it, then re-run.'
    );
    process.exit(1);
  }
}

const before = JSON.stringify(settings.hooks ?? null);
// Per-event append-and-dedupe: existing personal hooks are preserved; our
// entries are added only if an identical entry isn't already present.
settings.hooks = settings.hooks ?? {};
for (const [event, entries] of Object.entries(hooks)) {
  const existing = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
  const have = new Set(existing.map((e) => JSON.stringify(e)));
  settings.hooks[event] = [...existing, ...entries.filter((e) => !have.has(JSON.stringify(e)))];
}
const after = JSON.stringify(settings.hooks);

writeFileSync(TARGET, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');

if (before === after) {
  console.log(`Review-gate hooks already installed in ${TARGET} — no changes.`);
} else {
  console.log(
    `Review-gate hooks installed into ${TARGET} (hooks key updated; all other keys preserved).`
  );
  console.log(
    'Hooks hot-reload — the gates are armed for this and future sessions on this machine.'
  );
}
