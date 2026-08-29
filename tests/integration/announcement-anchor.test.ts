/**
 * Announcement under-band anchors — `Announcement.subtextHref` may carry a
 * fragment (`/hub/mcp/#tiers`), and nothing else binds that fragment to the
 * target page: a renamed or deleted `id` would leave the live banner
 * deep-linking to the top of the page with no error anywhere. This guard runs
 * in the required Unit & Integration check, so the drift fails CI before the
 * slow E2E suite ever loads a browser.
 *
 * Field-scoped, not value-scoped: every entry's fragment-carrying
 * `subtextHref` is resolved generically (`/<path>/#<id>` → whichever of
 * `src/pages/<path>/index.astro` or `src/pages/<path>.astro` exists — both
 * route spellings are live in this repo) rather than hardcoding today's
 * entry, so the guard survives the next announcement unchanged. Registry entries
 * without a fragment (or without a subtextHref) are out of scope — a plain
 * page target is already covered by the route existing at build time.
 *
 * Vacuity-guarded per the repo rule: if any entry carries a fragment, the
 * suite must have probed at least one — an unresolvable page path is a
 * FAILURE, never a skip.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANNOUNCEMENTS } from '@/data/announcements';
import { extractAstroMarkup } from './helpers/astro-markup';

const fragmentTargets = ANNOUNCEMENTS.flatMap((entry) => {
  const raw = entry.subtextHref;
  if (raw === undefined) return [];
  const hashAt = raw.indexOf('#');
  if (hashAt === -1) return [];
  return [
    {
      id: entry.id,
      path: raw.slice(0, hashAt).replace(/\/+$/, ''),
      fragment: raw.slice(hashAt + 1),
    },
  ];
});

describe('announcement subtextHref fragments resolve to real anchors', () => {
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
      `${id}: no page for subtextHref path — tried ${candidates.join(', ')}`
    ).toBeDefined();
    const markup = extractAstroMarkup(readFileSync(pageFile!, 'utf-8'));
    expect(markup, `${id}: id="${fragment}" not found in ${pageFile}`).toMatch(
      new RegExp(`id="${fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
    );
  });

  it('probed at least one fragment while any entry carries one (vacuity guard)', () => {
    const carrying = ANNOUNCEMENTS.filter((e) => e.subtextHref?.includes('#'));
    expect(fragmentTargets.length).toBe(carrying.length);
    if (carrying.length > 0) {
      expect(fragmentTargets.length).toBeGreaterThan(0);
    }
  });
});
