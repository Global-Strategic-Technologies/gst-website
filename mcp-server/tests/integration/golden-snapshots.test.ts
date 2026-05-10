/**
 * Golden-snapshot file existence + frontmatter integrity test.
 *
 * Asserts that every prompt in ALL_PROMPTS has a corresponding
 * `tests/examples/<slug>.golden.md` file with valid frontmatter.
 *
 * The golden files themselves capture worked V1-V8 invocation outputs
 * (recorded during senior-consultant review). On Claude model upgrades,
 * re-run the V1-V8 motions, diff the recorded outputs, and accept-or-
 * reject deliberate changes (bumping the prompt's `version` when the
 * new behavior is preferable).
 *
 * This test catches "added a prompt, forgot a golden" drift.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ALL_PROMPTS } from '../../src/prompts/_registry';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = resolve(HERE, '..', 'examples');

/** Convert a prompt name to its golden-file slug. */
function promptToSlug(name: string): string {
  return name.replace(/^gst_/, '').replace(/_/g, '-');
}

const REQUIRED_FRONTMATTER_KEYS = ['promptName', 'version', 'recordedAt', 'model'] as const;

function parseFrontmatter(body: string): Record<string, string> | null {
  // Normalize CRLF → LF so this works on Windows checkouts where git's
  // `core.autocrlf=true` (the default) rewrites text files to CRLF on
  // disk. Without this, every assertion fails on Windows even though
  // the goldens are correctly formatted.
  const normalized = body.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return null;
  const out: Record<string, string> = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

describe('golden-output snapshots', () => {
  it('every prompt has a golden file at tests/examples/<slug>.golden.md', () => {
    for (const prompt of ALL_PROMPTS) {
      const slug = promptToSlug(prompt.name);
      const path = resolve(EXAMPLES_DIR, `${slug}.golden.md`);
      expect(existsSync(path), `missing golden file: ${path}`).toBe(true);
    }
  });

  it('every golden file has valid frontmatter (promptName, version, recordedAt, model)', () => {
    for (const prompt of ALL_PROMPTS) {
      const slug = promptToSlug(prompt.name);
      const path = resolve(EXAMPLES_DIR, `${slug}.golden.md`);
      const body = readFileSync(path, 'utf-8');
      const fm = parseFrontmatter(body);
      expect(fm, `${path} has no frontmatter block`).not.toBeNull();
      for (const key of REQUIRED_FRONTMATTER_KEYS) {
        expect(fm![key], `${path} missing frontmatter key: ${key}`).toBeTruthy();
      }
      expect(fm!.promptName).toBe(prompt.name);
    }
  });
});
