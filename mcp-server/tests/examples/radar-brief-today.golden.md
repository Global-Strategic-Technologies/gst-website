---
promptName: gst_radar_brief_today
version: 0.0.1
recordedAt: 2026-05-01
model: claude-opus-4-7
---

# Worked example output for `gst_radar_brief_today`

V7 sign-off recording. Three trials including the cache-missing structured-error path. V7 was the most architecturally demanding verification — three distinct fixes layered through it before sign-off (wire-shape empty-string handling, fixture timestamp refresh, double-optional pattern for form-render correctness).

## Input — Trial (a) category filter

```json
{
  "category": "enterprise-tech",
  "sinceHours": ""
}
```

`sinceHours` left blank in the form; resolved to default 24 in `build()`.

## Input — Trial (b) all-categories digest

```json
{
  "category": "",
  "sinceHours": ""
}
```

Both fields blank; both resolve to `undefined` via the wire-shape preprocess; `sinceHours` defaults to 24 in `build()`; `category` undefined means "all four categories."

## Input — Trial (c) snapshot-missing

```json
{}
```

`.cache/inoreader/` deliberately deleted before invocation.

## Expanded prompt body

Two messages: (1) the rendered text body instructing the model to read the embedded snapshot, filter by recency window (default 24 hours of `lastSeededAt`), group by category (3–5 items per category band), apply the GST Take voice with "what to watch" closings, and finish with a "GST Take across the brief" cross-category synthesis; (2) the embedded `gst://radar/fyi/latest` Resource carrying either the FYI snapshot or the structured snapshot-missing error text.

## Model output — Trial (a)

Single Enterprise Tech category, 2 items (every available item in the fixture for that category — model didn't pad to hit the 3-5 band). Items: "Enterprise SaaS Consolidation Wave Accelerates" + "Cloud Cost Optimization Becomes Board-Level Priority". Closing 3-sentence "GST Take across the brief" synthesizes both items: _"the easy growth era for enterprise software is over, and value now accrues to operators who control either the platform or the cost structure."_

## Model output — Trial (b)

All four categories represented (PE/M&A, Enterprise Tech, AI/Automation, Security), 1–2 items per category (fixture-bounded). Closing "discipline arbitrage" framing as the cross-category through-line: _"the easy money — easy exits, easy growth, easy security postures — is gone, and value now accrues to operators who control either the platform, the cost structure, or the risk surface."_

## Model output — Trial (c)

```
Radar snapshot not found. Run `npm run radar:seed` from the gst-website
repo root to populate the local cache.
```

Surfaced verbatim. No fabricated items. No stack trace. The BL-031.5 structured-error wiring (`SNAPSHOT_MISSING_MESSAGE` in `mcp-server/src/content/radar-snapshot.ts`) propagates correctly into the prompt expansion via `embedFyiRadarSnapshot()`.

## Verification notes

Three findings closed in-branch:

1. **Wire-shape empty-string handling** (commit `326a739`) — `arrayFromWire` / `numberFromWire` / `enumFromWire` normalize empty / whitespace-only strings to `undefined` so unfilled form fields are treated as "not supplied" rather than "invalid value." Required for trial (b) to attach in Claude Desktop.
2. **Fixture timestamp refresh** (commit `69dc767`) — `tests/e2e/fixtures/radar-mock-data.ts` had a hardcoded epoch of `1708000000` (Feb 2024). Items were ~15 months stale relative to `lastSeededAt` (which uses `Date.now()`), so trial (a)'s recency-window filter found zero in-scope items. Replaced with a module-level `BASE_TIMESTAMP = Math.floor(Date.now() / 1000)` so seed-time is always recent. All 17 chromium E2E tests pass post-fix.
3. **Double-optional pattern for optional wire-shape args** (commits `5b00da9` + `b8b5c67`) — Zod-to-JSON-Schema introspection only looks at the outermost schema's `typeName`. `ZodEffects` (the preprocess wrapper) doesn't unwrap to find the inner `ZodOptional`, so optional wire-shape fields rendered with the required `*` marker in Claude Desktop's form. Fix: `.optional()` at BOTH levels (inner for empty-string handling, outer for form rendering). `.default()` is intentionally not used (it fires only when input is undefined, but the preprocess turns `''` into undefined too late); defaults are applied at use time in `build()`.

The trial-(b) path was inadvertently exercised as trial (c) during the re-run cycle when the cache was empty — that's how the structured-error path got recorded cleanly.
