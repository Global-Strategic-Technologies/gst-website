/**
 * Integration tests for the search_portfolio + list_portfolio_facets MCP
 * tool handlers — exercises the full wrapper pipeline introduced under
 * BL-031.95 Phase 4.B (deeplink emission + capability-mirror schema).
 *
 * Unlike Radar, the portfolio dataset is bundled into the server binary
 * at module init (`projectsRaw` from `src/data/ma-portfolio/projects.json`
 * → `ProjectsArraySchema.parse`), so there is no filesystem-coupling
 * concern. The unit file (`tests/unit/portfolio.test.ts`) exercises the
 * pure helpers (`filterProjects`, `getUnique*`); this file's job is the
 * wrapper pipeline (input parsing → handler → deeplink + payload shape).
 *
 * This is also the engineering substitute for the BL-031.95 Phase 4
 * "live MCP exercise" — the running mcp-server subprocess in any given
 * Claude session is started from `dist/index.js` at session start and
 * cannot be reloaded with newly-built code mid-session, so this test
 * asserts the same guarantees the live exercise would by walking the
 * actual handler code path with parsed inputs.
 */

import { describe, it, expect } from 'vitest';

import {
  handleSearchPortfolioTool,
  handleListPortfolioFacetsTool,
} from '../../src/tools/portfolio';
import { ProjectsArraySchema, SearchPortfolioInputSchema } from '../../src/schemas';
import { HUB_BASE } from '../../src/config';
import {
  serializeToParams as serializePortfolioUrl,
  deserializeFromParams as deserializePortfolioUrl,
} from '../../../src/utils/portfolio-url';
import projectsRaw from '../../../src/data/ma-portfolio/projects.json';

// Source of truth for the bundled dataset size at test-run time. Derived
// here (rather than hardcoded) so the empty-input contract assertion
// — "the triplet matches.length === totalMatched === returned equals
// the full dataset, no truncation" — stays self-consistent as the
// portfolio grows. See TEST_BEST_PRACTICES.md § 6.
const PROJECTS_COUNT = ProjectsArraySchema.parse(projectsRaw).length;

describe('handleSearchPortfolioTool — BL-031.95 Phase 4.B integration', () => {
  it('empty input returns every project; deeplink omits the query string', async () => {
    const parsed = SearchPortfolioInputSchema.parse({});
    const response = await handleSearchPortfolioTool(parsed);
    // The handler's TS return type asserts success-only (no `isError`),
    // but the assertion is kept as a defensive guard against a future
    // refactor that widens the return type to a success/error union.
    expect((response as { isError?: unknown }).isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    const matches = payload.matches as unknown[];

    // Triplet equals the full dataset — the substantive contract is
    // "no truncation, no pagination drift," which is preserved by
    // deriving the expected count from PROJECTS_COUNT rather than
    // hardcoding it (the hardcoded version was failing CI on every
    // portfolio-add PR).
    expect(matches.length).toBe(PROJECTS_COUNT);
    expect(payload.totalMatched).toBe(PROJECTS_COUNT);
    expect(payload.returned).toBe(PROJECTS_COUNT);
    expect(payload.deeplink).toBe(`${HUB_BASE}/ma-portfolio`);
  });

  it('engagement filter scopes results and is reflected in the deeplink', async () => {
    const parsed = SearchPortfolioInputSchema.parse({ engagement: 'Buy-Side' });
    const response = await handleSearchPortfolioTool(parsed);
    // The handler's TS return type asserts success-only (no `isError`),
    // but the assertion is kept as a defensive guard against a future
    // refactor that widens the return type to a success/error union.
    expect((response as { isError?: unknown }).isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    const matches = payload.matches as Array<{ engagementCategory?: string }>;

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.engagementCategory === 'Buy-Side')).toBe(true);
    expect(payload.deeplink).toBe(`${HUB_BASE}/ma-portfolio?eng=Buy-Side`);
  });

  it('theme filter scopes results and is reflected in the deeplink (URL-encoded)', async () => {
    // Pick the first available theme from the dataset deterministically.
    const facets = (await handleListPortfolioFacetsTool()).structuredContent as Record<
      string,
      unknown
    >;
    const themes = facets.themes as string[];
    expect(themes.length).toBeGreaterThan(0);
    const sampleTheme = themes[0];

    const parsed = SearchPortfolioInputSchema.parse({ theme: sampleTheme });
    const response = await handleSearchPortfolioTool(parsed);
    // The handler's TS return type asserts success-only (no `isError`),
    // but the assertion is kept as a defensive guard against a future
    // refactor that widens the return type to a success/error union.
    expect((response as { isError?: unknown }).isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    const matches = payload.matches as Array<{ theme: string }>;

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.theme === sampleTheme)).toBe(true);

    // Deeplink encodes the theme correctly — round-trip via the shared
    // encoder so this test stays resilient to URL-encoding edge cases
    // (spaces, ampersands, etc. in theme values).
    const expectedParams = serializePortfolioUrl({ theme: sampleTheme });
    expect(payload.deeplink).toBe(`${HUB_BASE}/ma-portfolio?${expectedParams.toString()}`);
  });

  it('search filter applies substring match against searchable text', async () => {
    const parsed = SearchPortfolioInputSchema.parse({ search: 'cloud' });
    const response = await handleSearchPortfolioTool(parsed);
    // The handler's TS return type asserts success-only (no `isError`),
    // but the assertion is kept as a defensive guard against a future
    // refactor that widens the return type to a success/error union.
    expect((response as { isError?: unknown }).isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    const matches = payload.matches as Array<Record<string, unknown>>;
    // Dataset known to contain "cloud" in at least one project.
    expect(matches.length).toBeGreaterThan(0);
    expect(payload.deeplink).toBe(`${HUB_BASE}/ma-portfolio?search=cloud`);
  });

  it('combined filters compose AND-style; deeplink contains all three params', async () => {
    const parsed = SearchPortfolioInputSchema.parse({
      search: 'platform',
      engagement: 'Buy-Side',
      theme: 'all', // explicit pass-through
    });
    const response = await handleSearchPortfolioTool(parsed);
    // The handler's TS return type asserts success-only (no `isError`),
    // but the assertion is kept as a defensive guard against a future
    // refactor that widens the return type to a success/error union.
    expect((response as { isError?: unknown }).isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;
    const matches = payload.matches as Array<{ engagementCategory?: string }>;

    expect(matches.every((m) => m.engagementCategory === 'Buy-Side')).toBe(true);
    // theme=all is dropped from the deeplink (cleaner URL).
    expect(payload.deeplink).toContain('search=platform');
    expect(payload.deeplink).toContain('eng=Buy-Side');
    expect(payload.deeplink).not.toContain('theme=');
  });

  it('deeplink uses the same encoder the website page uses (round-trip parity)', async () => {
    const parsed = SearchPortfolioInputSchema.parse({
      search: 'cloud',
      engagement: 'Buy-Side',
    });
    const response = await handleSearchPortfolioTool(parsed);
    const payload = response.structuredContent as Record<string, unknown>;

    // Extract the query string from the emitted deeplink and round-trip
    // it through the website's deserialiser. The values must match the
    // original input — this is the round-trip parity guarantee that the
    // capability-mirror invariant rests on.
    const url = new URL(payload.deeplink as string);
    const decoded = deserializePortfolioUrl(url.searchParams);
    expect(decoded.search).toBe('cloud');
    expect(decoded.engagement).toBe('Buy-Side');
  });

  describe('capability-mirror invariant (Phase 4.A enforcement at the handler boundary)', () => {
    it('Zod strips a pre-Phase-4 `limit` field on parse; handler returns full result', async () => {
      // The schema's parse step drops unknown keys; the handler never
      // sees them. A caller still passing `limit: 5` will get every
      // matching project back, identical to a call without it.
      const parsedWithExtras = SearchPortfolioInputSchema.parse({
        engagement: 'Buy-Side',
        limit: 5,
      });
      const parsedClean = SearchPortfolioInputSchema.parse({ engagement: 'Buy-Side' });
      const responseExtras = await handleSearchPortfolioTool(parsedWithExtras);
      const responseClean = await handleSearchPortfolioTool(parsedClean);
      const payloadExtras = responseExtras.structuredContent as Record<string, unknown>;
      const payloadClean = responseClean.structuredContent as Record<string, unknown>;

      expect((payloadExtras.matches as unknown[]).length).toBe(
        (payloadClean.matches as unknown[]).length
      );
      expect(payloadExtras.deeplink).toBe(payloadClean.deeplink);
    });
  });
});

describe('handleListPortfolioFacetsTool — BL-031.95 Phase 4.B integration', () => {
  it('returns the four facet dimensions with non-empty values', async () => {
    const response = await handleListPortfolioFacetsTool();
    // The handler's TS return type asserts success-only (no `isError`),
    // but the assertion is kept as a defensive guard against a future
    // refactor that widens the return type to a success/error union.
    expect((response as { isError?: unknown }).isError).toBeUndefined();
    const payload = response.structuredContent as Record<string, unknown>;

    const themes = payload.themes as string[];
    const engagementCategories = payload.engagementCategories as string[];
    const growthStages = payload.growthStages as string[];
    const years = payload.years as number[];

    expect(Array.isArray(themes)).toBe(true);
    expect(themes.length).toBeGreaterThan(0);
    expect(Array.isArray(engagementCategories)).toBe(true);
    expect(engagementCategories.length).toBeGreaterThan(0);
    expect(Array.isArray(growthStages)).toBe(true);
    expect(growthStages.length).toBeGreaterThan(0);
    expect(Array.isArray(years)).toBe(true);
    expect(years.length).toBeGreaterThan(0);
  });

  it('themes are sorted ascending (deterministic ordering)', async () => {
    const response = await handleListPortfolioFacetsTool();
    const payload = response.structuredContent as Record<string, unknown>;
    const themes = payload.themes as string[];
    const sorted = [...themes].sort();
    expect(themes).toEqual(sorted);
  });

  it('years are sorted descending (newest-first)', async () => {
    const response = await handleListPortfolioFacetsTool();
    const payload = response.structuredContent as Record<string, unknown>;
    const years = payload.years as number[];
    for (let i = 1; i < years.length; i++) {
      expect(years[i - 1]).toBeGreaterThanOrEqual(years[i]);
    }
  });
});
