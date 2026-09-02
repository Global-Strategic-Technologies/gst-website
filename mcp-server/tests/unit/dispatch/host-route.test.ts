/**
 * ADR-0023 — the documentation host alias.
 *
 * TWO tests, because one cannot do both jobs. The behavioural half proves the
 * function maps hosts to redirects correctly. It says NOTHING about where the
 * function is called: `resolveHostRoute` returns the same answer for
 * `docs.mcp…/health` whether it runs before the health handler or after it, so
 * moving the call site below `/health` would leave every assertion here green
 * while production served the health payload on a documentation hostname.
 *
 * The source-order half is the one with teeth on that. It mirrors the idiom in
 * the website's `tests/unit/security-headers.test.ts`, which asserts an index
 * comparison over `vercel.json` under a docblock saying the ordering is
 * load-bearing and a move "silently reverts production while dev still works".
 * Same shape, same reason.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import {
  DOCS_ALIAS_HOST,
  DOCS_CANONICAL_URL,
  DOCS_REDIRECT_STATUS,
  resolveHostRoute,
} from '../../../src/dispatch/host-route';

const route = (url: string) => resolveHostRoute(new URL(url));

describe('resolveHostRoute — the docs alias', () => {
  it('redirects the alias root to the canonical page', () => {
    expect(route(`https://${DOCS_ALIAS_HOST}/`)).toEqual({
      location: DOCS_CANONICAL_URL,
      status: DOCS_REDIRECT_STATUS,
    });
  });

  it('collapses every other alias path onto the same page', () => {
    // Deliberate: the Worker has no documentation paths of its own to preserve,
    // so a deep link on the alias is a soft 404 that lands somewhere useful.
    for (const path of ['/tools', '/anything/at/all', '/index.html?q=1']) {
      expect(route(`https://${DOCS_ALIAS_HOST}${path}`)?.location).toBe(DOCS_CANONICAL_URL);
    }
  });

  it.each([
    ['/health', 'the health payload'],
    ['/status', 'the public status page'],
    ['/token', 'the OAuth token endpoint'],
    ['/authorize', 'the OAuth authorization endpoint'],
    ['/.well-known/oauth-authorization-server', 'the OAuth metadata'],
  ])('redirects %s on the alias rather than serving %s', (path) => {
    // These four paths dispatch on PATH ALONE in worker.ts. Without the alias
    // branch running first, each would answer on the documentation hostname.
    expect(route(`https://${DOCS_ALIAS_HOST}${path}`)?.location).toBe(DOCS_CANONICAL_URL);
  });

  it('redirects permanently, not temporarily', () => {
    // 308 matches the repo's only other permanent redirect and avoids 301's
    // method-rewriting ambiguity. Changing it is a decision, not a tidy-up.
    expect(DOCS_REDIRECT_STATUS).toBe(308);
  });

  it('points at a bare page URL, with no hash or query', () => {
    // Permanent redirects are cached hard and durably; whatever ships here is
    // what every visitor keeps.
    expect(DOCS_CANONICAL_URL).toBe('https://globalstrategic.tech/hub/mcp/docs/');
    expect(DOCS_CANONICAL_URL).not.toMatch(/[?#]/);
  });

  it('matches the alias host exactly, not by a `docs.` prefix', () => {
    // The arm is an equality test on purpose (see the docblock): one alias host
    // is all wrangler.toml, ADR-0023 and ARCHITECTURE.md describe. These hosts
    // do not exist today — every route is a `custom_domain` binding — so this
    // pins the narrow reading against the deployment fact that currently makes
    // a prefix arm look harmless. Widening the match should fail here first.
    for (const host of [
      'docs.example.com',
      'docs.globalstrategic.tech',
      'docs.mcp-staging.globalstrategic.tech',
      'docs.mcp.globalstrategic.tech.evil.test',
    ]) {
      expect(route(`https://${host}/`)).toBeNull();
    }
  });

  it('leaves the JSON-RPC and status hosts alone', () => {
    for (const host of [
      'mcp.globalstrategic.tech',
      'mcp-staging.globalstrategic.tech',
      'status.mcp.globalstrategic.tech',
    ]) {
      expect(route(`https://${host}/health`)).toBeNull();
      expect(route(`https://${host}/mcp`)).toBeNull();
    }
  });
});

describe('resolveHostRoute — call-site ordering in worker.ts', () => {
  const source = readFileSync(resolve(__dirname, '../../../src/worker.ts'), 'utf-8');

  /**
   * Every marker below is an EXPRESSION, never a bare name, and that is the
   * whole technique. `isOAuthSurfacePath` appears first as its own function
   * declaration and again inside the comment above the call site, so a
   * bare-name search compares the wrong positions and fails against correct
   * code — it did, on this test's first run.
   *
   * Stripping comments first was the other obvious fix and is a trap: a naive
   * block-comment regex treats the `/*` inside a path string like
   * `'/admin/oauth/*'` as a comment opener and swallows three quarters of the
   * file. Expression markers need no stripping.
   */
  const callSite = source.indexOf('resolveHostRoute(url)');

  it('finds the call site at all', () => {
    // Vacuity guard. Rename the call and this suite fails loudly rather than
    // silently comparing -1 against everything below it.
    expect(callSite).toBeGreaterThan(-1);
  });

  it.each([
    ["url.pathname === '/health'", 'the health endpoint'],
    ["url.pathname === '/status'", 'the status page'],
    ['isOAuthSurfacePath(url.pathname)', 'the OAuth surface'],
  ])('runs before %s (%s)', (marker) => {
    const branch = source.indexOf(marker);
    expect(branch).toBeGreaterThan(-1);
    expect(callSite).toBeLessThan(branch);
  });
});
