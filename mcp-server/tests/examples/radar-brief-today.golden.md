---
promptName: gst_radar_brief_today
version: 0.0.4
recordedAt: 2026-05-03
model: claude-opus-4-7
---

# Worked example output for `gst_radar_brief_today`

V7 sign-off recording (v0.0.1) carried forward to v0.0.4 — three layered changes since V7:

- **v0.0.2 (BL-031.95 Phase 3.A capability-mirror refactor)**: removed the `sinceHours` argument because the underlying cache has a 24h TTL and the website (`/hub/radar`) surfaces no time filter. The prompt now mirrors the website's filter UI exactly: a single optional `category` field. Engine output (digest by category, GST Take voice, "what to watch" closings, cross-category synthesis) is unchanged from v0.0.1; the body's "filter by recency" instruction was retired.
- **v0.0.3 (BL-031.95 Phase 5)**: closing "Open in Hub" footer added — `https://globalstrategic.tech/hub/radar?category=<args.category>` (or the bare `/hub/radar` URL when no category was supplied). The footer URL is constructed deterministically by the prompt body from the input `category` since this prompt orchestrates the `gst://radar/fyi/latest` Resource directly (not the Tool); the same shape the Tool wrapper would emit via `src/utils/radar-url.ts` (BL-031.95 Phase 3.B).
- **v0.0.4 (Worker-rendering fix, this commit)**: Step 2's degraded-path discriminator changed from a phrase-match on `'Radar snapshot not found'` to a structural check ("is the second message a TEXT block?"), and the stdio-only `npm run radar:seed` remediation was dropped from the body. Both because the prompt did not render at all over HTTP — `prompts/get` returned `-32603` from the node:fs-backed reader — and the wording that phrase matched was the stdio one, so the stop-and-surface instruction would have failed silently on the Worker even after the render was fixed. Trials (a) and (b) are unaffected (they exercise the items-present path); trial (c)'s recorded output is updated below.

**Senior-consultant sign-off, v0.0.4 (2026-08-07)**: the three degraded-path literals and the revised Step 2 were reviewed and approved in-session; `lastReviewedAt` is set to that date. This closes the deferred-verification stanza that stood here from v0.0.3 ("a fresh V-trial lands naturally on the next mcp-server restart") — that was the deferred-work pattern Directive 6 exists to prevent, and the v0.0.3 footer change it covered is now several months old.

`recordedAt` / `model` in the frontmatter are unchanged on purpose: they date the **model-in-the-loop recording**, and v0.0.4 did not re-run one. Trial (c)'s prose below was rewritten today from the code, not from a fresh invocation, and is marked as such.

What the sign-off did and did not cover: the reviewed surface is the **degraded path** — the wording a user sees when there is nothing to embed, and the instruction that makes the model surface it verbatim instead of fabricating. Trials (a) and (b) exercise the items-present path and are unchanged by v0.0.4; their v0.0.1 recordings carry forward. A full model-in-the-loop re-trial of (a)/(b) against a live Worker is worth doing on the next real radar curation cycle, but nothing in v0.0.4 alters what the model receives on that path.

## Input — Trial (a) category filter

```json
{
  "category": "enterprise-tech"
}
```

## Input — Trial (b) all-categories digest

```json
{
  "category": ""
}
```

`category` blank in the form; resolved to `undefined` via the wire-shape preprocess; means "all four categories."

## Input — Trial (c) snapshot-missing

```json
{}
```

`.cache/inoreader/` deliberately deleted before invocation.

## Expanded prompt body

Two messages: (1) the rendered text body instructing the model to read the embedded snapshot, group by category (3–5 items per category band, sorted by `publishedAt` newest-first to match the website's natural feed order), apply the GST Take voice with "what to watch" closings, and finish with a "GST Take across the brief" cross-category synthesis; (2) **either** the embedded `gst://radar/fyi/latest` Resource carrying the FYI snapshot **or** a plain TEXT block carrying the degraded-state message.

That second message's **block type** is the distinction, not its contents — items present give a `resource` block, no items give a `text` block. It is what Step 2 keys on as of v0.0.4. The pre-v0.0.4 wording of this section described both cases as the Resource, which is precisely the misreading that let a phrase-match discriminator look adequate.

## Model output — Trial (a)

Single Enterprise Tech category, 2 items (every available item in the fixture for that category — model didn't pad to hit the 3-5 band). Items: "Enterprise SaaS Consolidation Wave Accelerates" + "Cloud Cost Optimization Becomes Board-Level Priority". Closing 3-sentence "GST Take across the brief" synthesizes both items: _"the easy growth era for enterprise software is over, and value now accrues to operators who control either the platform or the cost structure."_

## Model output — Trial (b)

All four categories represented (PE/M&A, Enterprise Tech, AI/Automation, Security), 1–2 items per category (fixture-bounded). Closing "discipline arbitrage" framing as the cross-category through-line: _"the easy money — easy exits, easy growth, easy security postures — is gone, and value now accrues to operators who control either the platform, the cost structure, or the risk surface."_

## Model output — Trial (c)

The degraded path is **transport-specific as of v0.0.4**. On the local stdio path the text is unchanged from the v0.0.1 recording:

```
Radar snapshot not found. Run `npm run radar:seed` from the gst-website
repo root to populate the local cache.
```

On the Worker the same trial surfaces `SNAPSHOT_UNAVAILABLE_REMOTE` (cold Upstash cache) or `NO_FRESH_CURATED_ITEMS` (tier read fine, nothing inside the 30-day freshness window) instead — a remote user has no repo in which to run a seed script. All three live in `mcp-server/src/content/radar-messages.ts`; the block is selected by `_registry.ts`, which is the only layer that knows the transport, and wrapped by `embedFyiRadarSnapshot()`.

Surfaced verbatim in the recorded stdio trial — no fabricated items, no stack trace. The two Worker literals take the same code path by construction (same `text` block, same Step 2 instruction) but have **not** been model-trialed; the sign-off above covers their wording, not observed model behaviour against them.

Note that v0.0.4 changed **how the model recognizes this state**: Step 2 keys on the second message being a TEXT block rather than on any phrase inside it, because the v0.0.3 phrase-match (`'Radar snapshot not found'`) matched only the stdio wording and would have failed silently on the Worker.

## Verification notes

V0.0.1 (V7 sign-off, three findings closed):

1. **Wire-shape empty-string handling** (commit `326a739`) — `arrayFromWire` / `numberFromWire` / `enumFromWire` normalize empty / whitespace-only strings to `undefined` so unfilled form fields are treated as "not supplied" rather than "invalid value." Required for trial (b) to attach in Claude Desktop.
2. **Fixture timestamp refresh** (commit `69dc767`) — `tests/e2e/fixtures/radar-mock-data.ts` had a hardcoded epoch of `1708000000` (Feb 2024). Items were ~15 months stale relative to `lastSeededAt` (which uses `Date.now()`), so trial (a)'s recency-window filter found zero in-scope items. Replaced with a module-level `BASE_TIMESTAMP = Math.floor(Date.now() / 1000)` so seed-time is always recent. All 17 chromium E2E tests pass post-fix.
3. **Double-optional pattern for optional wire-shape args** (commits `5b00da9` + `b8b5c67`) — Zod-to-JSON-Schema introspection only looks at the outermost schema's `typeName`. `ZodEffects` (the preprocess wrapper) doesn't unwrap to find the inner `ZodOptional`, so optional wire-shape fields rendered with the required `*` marker in Claude Desktop's form. Fix: `.optional()` at BOTH levels (inner for empty-string handling, outer for form rendering).

V0.0.2 (BL-031.95 Phase 3.A capability-mirror refactor):

4. **`sinceHours` argument removed** — the website's `/hub/radar` page exposes a single filter (category). The cache has a 24h TTL (`src/lib/inoreader/cache.ts:18`), so a time-window filter would be redundant: items older than 24h aren't in the snapshot regardless. The prompt's earlier `sinceHours` argument (max 168 = 7 days) had no website counterpart and could "filter to nothing" against a 24h-bounded cache. v0.0.2 removes it and the body's "filter by recency" instruction.
5. **`numberFromWire` import removed** — no longer needed once `sinceHours` is gone.

The trial-(b) path was inadvertently exercised as trial (c) during the v0.0.1 re-run cycle when the cache was empty — that's how the structured-error path got recorded cleanly.
