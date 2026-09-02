/**
 * Announcement under-band anchors — each under-band FIELD may carry a fragment
 * href (`/hub/mcp/#tiers`), and nothing else binds that fragment to the target
 * page: a renamed or deleted `id` would leave the live banner deep-linking to
 * the top of the page with no error anywhere. This guard runs in the required
 * Unit & Integration check, so the drift fails CI before the slow E2E suite
 * ever loads a browser.
 *
 * Property-scoped, not value-scoped: every fragment-carrying field href across
 * every entry is resolved generically (`/<path>/#<id>` → whichever of
 * `src/pages/<path>/index.astro` or `src/pages/<path>.astro` exists — both
 * route spellings are live in this repo) rather than hardcoding today's
 * entry, so the guard survives the next announcement unchanged. Fields without
 * a fragment (or without an href) are out of scope — a plain page target is
 * already covered by the route existing at build time.
 *
 * Vacuity-guarded per the repo rule: every fragment-carrying field must have
 * been probed. Note the count is over FIELDS, not entries — one entry
 * contributes as many targets as it has linked fields, which is exactly what
 * the two-destination under-band does.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANNOUNCEMENTS } from '@/data/announcements';
import { extractAstroMarkup } from './helpers/astro-markup';

/** Every field href across every entry that carries a `#fragment`. */
const fragmentHrefs = ANNOUNCEMENTS.flatMap((entry) =>
  (entry.subtext ?? [])
    .map((field) => field.href)
    .filter((href): href is string => href !== undefined && href.includes('#'))
    .map((href) => ({ id: entry.id, href }))
);

const fragmentTargets = fragmentHrefs.map(({ id, href }) => {
  const hashAt = href.indexOf('#');
  return {
    id,
    path: href.slice(0, hashAt).replace(/\/+$/, ''),
    fragment: href.slice(hashAt + 1),
  };
});

describe('announcement under-band field fragments resolve to real anchors', () => {
  it.each(fragmentTargets)('$id: #$fragment exists on $path', ({ id, path, fragment }) => {
    // Both route spellings Astro accepts: `<path>/index.astro` (nested) and
    // `<path>.astro` (flat — how /services/ and /about/ are authored). Trying
    // only the first would fail a perfectly valid flat-route destination.
    const candidates = [
      join(process.cwd(), 'src/pages', path, 'index.astro'),
      join(process.cwd(), 'src/pages', `${path}.astro`),
    ];
    const pageFile = candidates.find((candidate) => existsSync(candidate));
    expect(
      pageFile,
      `${id}: no page for the field href's path — tried ${candidates.join(', ')}`
    ).toBeDefined();
    const markup = extractAstroMarkup(readFileSync(pageFile!, 'utf-8'));
    expect(markup, `${id}: id="${fragment}" not found in ${pageFile}`).toMatch(
      new RegExp(`id="${fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
    );
  });

  it('probed every fragment-carrying field (vacuity guard)', () => {
    // Counted over FIELDS, not entries: one entry contributes a target per
    // linked field, so an entry↔target identity would break the moment an
    // under-band carries two destinations — which is the shipped shape.
    const carrying = ANNOUNCEMENTS.flatMap((entry) =>
      (entry.subtext ?? []).filter((field) => field.href?.includes('#'))
    );
    expect(fragmentTargets.length).toBe(carrying.length);
    if (carrying.length > 0) {
      expect(fragmentTargets.length).toBeGreaterThan(0);
    }
  });
});
