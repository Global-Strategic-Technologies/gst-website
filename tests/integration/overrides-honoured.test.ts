/**
 * Every `overrides` entry in package.json is actually honoured by the lockfile.
 *
 * An override is a claim, not a guarantee. DEVELOPER_TOOLING.md § npm audit
 * records the way the claim goes quiet: a path-scoped key stops resolving the
 * moment its parent moves in the tree (`@modelcontextprotocol/sdk → hono` went
 * dead when the SDK stopped being a direct dependency, and npm kept installing
 * the vulnerable version while `npm ls` said `invalid`). Nothing failed. The
 * audit job that would have noticed is not a required check.
 *
 * So this reads the two files and checks them against each other. It runs in
 * the ordinary unit/integration suite, which IS required, so a dead override
 * fails a PR instead of a dashboard nobody reads.
 *
 * WHAT "HONOURED" MEANS HERE, and why it is not exact equality. Every override
 * in this repo is a security floor: the patched release, held so no consumer
 * can resolve below it. So the property is that every governed copy is AT OR
 * ABOVE the pinned version. Exact equality was the first draft, and it failed
 * on the day it was written for the wrong reason: `path-to-regexp` is pinned at
 * 6.3.0 for the `@vercel/routing-utils` subtree, while `router` (under
 * `express@5`) carries its own 8.4.2, which npm leaves alone. That copy is not
 * a failure; it is above the floor. The same first draft also flagged three
 * overrides (`hono`, `@hono/node-server`, the SDK-scoped `express-rate-limit`)
 * whose natural resolution had climbed past their pins, so they governed
 * nothing — those were deleted rather than accommodated, per their own exit
 * conditions in the doc. A copy BELOW the floor is the security failure and
 * fails here; a missing package is a dead entry and fails here too.
 *
 * Scope: flat string overrides (`"qs": "6.16.0"`) govern every copy of that
 * name anywhere in the tree. Scoped overrides (`"@lhci/cli": { "tmp": … }`)
 * govern copies nested under any copy of the parent, falling back to the
 * hoisted copy the parent resolves when none is nested; the `"."` key names
 * the parent itself. Pins must be exact versions, which is what every override
 * here uses; a range would need `semver`, and the assertion says so rather
 * than passing vacuously.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (rel: string) => JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf-8'));

type Overrides = Record<string, string | Record<string, string>>;
const overrides: Overrides = readJson('package.json').overrides ?? {};
const packages: Record<string, { version?: string }> = readJson('package-lock.json').packages;

const EXACT = /^\d+\.\d+\.\d+$/;

/** `a` compared to `b` as x.y.z triples: negative, zero or positive. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** Package name of a lockfile path: the part after the last `node_modules/`. */
const nameOf = (path: string) =>
  path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);

/** Lockfile copies (path, version) of package `name`, optionally only those nested under `under`. */
function copiesOf(name: string, under?: string) {
  return Object.entries(packages)
    .filter(([path]) => path.includes('node_modules/') && nameOf(path) === name)
    .filter(([path]) => under === undefined || path.includes(`node_modules/${under}/`))
    .map(([path, entry]) => ({ path, version: entry.version ?? '' }));
}

function expectAtOrAboveFloor(copies: { path: string; version: string }[], floor: string) {
  for (const { path, version } of copies) {
    // Pre-release suffixes are stripped for the comparison; none of the
    // governed packages ship them, and a `-rc` below the floor still fails.
    const bare = version.replace(/-.*$/, '');
    expect(EXACT.test(bare), `${path}: unparseable version ${version}`).toBe(true);
    expect(
      compareVersions(bare, floor) >= 0,
      `${path} resolves ${version}, below the ${floor} override`
    ).toBe(true);
  }
}

describe('package.json overrides are honoured by package-lock.json', () => {
  it('has overrides to check (the guard is not vacuous)', () => {
    expect(Object.keys(overrides).length).toBeGreaterThan(0);
  });

  const flat = Object.entries(overrides).filter(
    (e): e is [string, string] => typeof e[1] === 'string'
  );
  const scoped = Object.entries(overrides).filter(
    (e): e is [string, Record<string, string>] => typeof e[1] !== 'string'
  );

  it.each(flat)('flat override %s = %s floors every copy in the tree', (name, floor) => {
    expect(floor, 'this guard compares exact versions; a range needs semver').toMatch(EXACT);
    const copies = copiesOf(name);
    // An override for a package the tree no longer contains is dead weight,
    // and the doc's exit conditions say to delete it — surface that here
    // rather than letting it linger as a claim about nothing.
    expect(copies.length, `${name} is overridden but not in the lockfile`).toBeGreaterThan(0);
    expectAtOrAboveFloor(copies, floor);
  });

  it.each(scoped)('scoped override under %s floors its subtree', (parent, children) => {
    const parents = copiesOf(parent);
    expect(parents.length, `${parent} is overridden but not in the lockfile`).toBeGreaterThan(0);
    for (const [child, floor] of Object.entries(children)) {
      expect(floor, 'exact versions only').toMatch(EXACT);
      if (child === '.') {
        expectAtOrAboveFloor(parents, floor);
        continue;
      }
      const nested = copiesOf(child, parent);
      const governed = nested.length > 0 ? nested : copiesOf(child);
      expect(governed.length, `${child} under ${parent}: not in the lockfile`).toBeGreaterThan(0);
      expectAtOrAboveFloor(governed, floor);
    }
  });
});

describe('compareVersions', () => {
  it('orders x.y.z triples numerically, not lexically', () => {
    expect(compareVersions('6.16.0', '6.15.3')).toBeGreaterThan(0);
    expect(compareVersions('6.3.0', '6.16.0')).toBeLessThan(0);
    expect(compareVersions('10.3.1', '9.9.9')).toBeGreaterThan(0);
    expect(compareVersions('3.1.7', '3.1.7')).toBe(0);
  });
});
