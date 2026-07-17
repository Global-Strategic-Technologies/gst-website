# ADR-0004: Resources surface & the live-Inoreader import restriction

- **Status**: Accepted (2026-04-28) — enforced by an active ESLint rule
- **Source initiative**: BL-031.5 (design doc archived at [`../development/_archive/MCP_SERVER_HUB_SURFACE_BL-031_5.md`](../development/_archive/MCP_SERVER_HUB_SURFACE_BL-031_5.md))

## Context

BL-031.5 extended the BL-031 local stdio MCP server with the **Resources surface**: URI-addressable content a client can pin into conversation context, in three `gst://` families — `gst://library/<slug>` (2 articles at ship; 4 today, [`mcp-server/src/content/library-loader.ts`](../../../mcp-server/src/content/library-loader.ts)), `gst://regulations/<jurisdiction>/<framework-id>` (120 at ship; 123 today), and 6 static radar URIs (`gst://radar/fyi/latest`, `gst://radar/wire/latest`, `gst://radar/wire/<category>` × 4 — [`mcp-server/src/resources/radar.ts`](../../../mcp-server/src/resources/radar.ts)).

Radar is the dangerous family. A resource read is **model-initiated and unmetered** — once pinned, a client can re-read it passively, with no human deciding to spend anything. The live Inoreader client draws on a shared API budget (the frozen doc's framing: 200 req/day shared with the production website's ISR at ~28 calls/day; the operative ceiling today is the Zone-1 **100/day hard cap** — `ZONE1_DAILY_HARD_CAP`, [`src/lib/inoreader-egress.ts`](../../../mcp-server/src/lib/inoreader-egress.ts)). An always-on local MCP server making a live call per resource read would burn that budget within hours, starving the website's own feed. So the invariant: **the live Inoreader client must never be importable from a resource-read path.**

## Decision

**Snapshot-only radar reads on the Resources surface.** The stdio server reads exclusively from the seed snapshot produced by `npm run radar:seed` (`.cache/inoreader/`), via [`mcp-server/src/content/radar-snapshot.ts`](../../../mcp-server/src/content/radar-snapshot.ts). A missing snapshot returns an instructive error body — never a live fetch. Snapshot-search shipped as a deliberately distinct tool name (`search_radar_cache`, later `search_radar_offline`) so the live `search_radar` could land in BL-032 without collision.

**Machine enforcement, not convention.** An ESLint `no-restricted-imports` rule ([`eslint.config.mjs`](../../../eslint.config.mjs), "Inoreader budget protection (BL-031.5)" block) applies to `files: ['mcp-server/src/**/*.{ts,mts}']` and bans the group `'**/lib/inoreader/client'`, `'**/lib/inoreader/client.ts'`, `'../../src/lib/inoreader/client*'`, `'../../../src/lib/inoreader/client*'` — i.e. the website's live client — with the message: _"mcp-server/src/\*\* must not import the live Inoreader client. Read from the cached snapshot via mcp-server/src/content/radar-snapshot.ts instead."_ (The message's doc citation now points at this ADR, repointed from the frozen design doc when it was archived.) Belt-and-suspenders on top of the rule: the resource modules import **no** snapshot backend at all — `registerRadarResources` accepts an injected `SnapshotReader` (BL-032.5 Phase 3 transport-portability refactor), so `mcp-server/src/resources/` cannot transitively pull in a client even by accident.

**Rejected: per-item radar URIs** (`gst://radar/item/<id>`). Cached item IDs regenerate on every re-seed, so a per-item manifest would mutate between snapshots — incompatible with URI stability. Items are reached through the snapshot-search tool instead.

**URI-stability discipline starts here.** Resource URIs are stable slugs resolved independently of file paths, and a Vitest test asserts a frozen URI list ([`mcp-server/tests/integration/resource-uri-stability.test.ts`](../../../mcp-server/tests/integration/resource-uri-stability.test.ts)). BL-032.5 later formalized the same invariant as the manifest hash — see [`mcp-server/src/docs/ARCHITECTURE.md`](../../../mcp-server/src/docs/ARCHITECTURE.md) § URI stability and the manifest hash, and `mcp-server/BREAKING_CHANGES.md`.

## Consequences

- **Live radar access is Tools-only**: `search_radar` / `get_latest_insights` on the Worker, gated by the per-key radar rate tier (5 req/min, 50 req/day — BL-032 Phase 3), where a caller's identity and budget are accountable per call.
- **The restriction survives BL-032.8's single-caller unification unchanged.** The Worker's radar resources read the Upstash snapshot (`mcp:radar:cache:wire` / `:fyi`) via [`radar-snapshot-reader-worker.ts`](../../../mcp-server/src/content/radar-snapshot-reader-worker.ts) wrapping the `radar-live-store.ts` read-through store; a cache miss falls through to the Worker's **own metered client** (`mcp-server/src/lib/inoreader-client.ts`, every call egress-counted against the Zone-1 cap, cache kept warm by cron) — never the website's unmetered client, which remains banned across all of `mcp-server/src/**`. The stdio path stays purely snapshot-only.
- **What cites this decision**: the ESLint rule message (above); eight tool docs reference BL-031.5 — `mcp-server/src/docs/tools/{icg,techpar,tech-debt,regulatory-map}/CONTRACT.md` + `USAGE.md` — plus `mcp-server/src/docs/resources/README.md`, `tools/README.md`, and `testing/README.md`.
- Accepted trade-off: stdio radar data is only as fresh as the last `npm run radar:seed`; resource bodies carry `lastSeededAt` so staleness is visible rather than hidden.
- **Revisit trigger**: if the website's `src/lib/inoreader/` client is relocated or the mcp-server workspace layout changes, the rule's path-glob group must move with it — the rule is path-matched, not semantic.
