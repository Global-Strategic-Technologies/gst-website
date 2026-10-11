/**
 * ADR-0044 — `PUBLIC_ORIGIN` in wrangler.toml is matched EXACTLY against
 * each request's origin, so a trailing slash, a path or a typo would 404
 * the whole OAuth surface in that environment with nothing failing first.
 * The `unstable_dev` suites prove the staging value by running on it;
 * nothing runs on production's. This pins both against the file.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const toml = readFileSync(
  fileURLToPath(new URL('../../../wrangler.toml', import.meta.url)),
  'utf8'
);

/** The text of one `[env.<name>…]` section family, up to the next environment. */
function envBlock(name: string): string {
  // Anchored to a line start: the file's header comment mentions both names.
  const header = new RegExp(`^\\[env\\.${name}\\]$`, 'm').exec(toml);
  if (!header) throw new Error(`wrangler.toml has no [env.${name}] block`);
  const rest = toml.slice(header.index + 1);
  // `[[env.<name>.…]]` array tables belong to the block; the next
  // environment's header ends it.
  const end = new RegExp(`^\\[+env\\.(?!${name}[.\\]])`, 'm').exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

describe.each(['staging', 'production'])('wrangler.toml [env.%s] PUBLIC_ORIGIN', (name) => {
  const block = envBlock(name);
  const value = /^PUBLIC_ORIGIN = "([^"]*)"$/m.exec(block)?.[1];

  it('is set', () => {
    expect(value).toBeDefined();
  });

  it('is a bare https origin (no path, slash, port or uppercase)', () => {
    expect(value).toBe(new URL(value!).origin);
    expect(value).toMatch(/^https:\/\/[a-z0-9.-]+$/);
  });

  it("is the environment's first route — the canonical hostname", () => {
    const firstRoute = /pattern = "([^"]+)"/.exec(block)?.[1];
    expect(value).toBe(`https://${firstRoute}`);
  });
});

it('there is no top-level PUBLIC_ORIGIN (plain `wrangler dev` has the OAuth surface off)', () => {
  const topLevel = toml.slice(0, /^\[env\.staging\]$/m.exec(toml)!.index);
  expect(topLevel).not.toMatch(/^PUBLIC_ORIGIN\s*=/m);
});
