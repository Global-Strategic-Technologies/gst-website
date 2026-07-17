# ADR-0005: Hub URL-state deep-link contract

- **Status**: Accepted (2026-05-03)
- **Source initiative**: BL-031.95 (design doc archived at [`../development/_archive/MCP_SERVER_HUB_URL_STATE_BL-031_95.md`](../development/_archive/MCP_SERVER_HUB_URL_STATE_BL-031_95.md))

## Context

MCP tool output is ephemeral chat text; the Hub tools are stateful wizards and filter grids whose full input state is URL-encodable. The bridge between the two surfaces is the deep link: every URL-stateful tool's MCP response carries a `deeplink` field — a `globalstrategic.tech/hub/...` URL that re-hydrates the wizard or filter grid with the same inputs — turning a chat answer into a durable, shareable, hand-editable artifact (PDF / export / share live on the website, not in the conversation).

BL-031.5 shipped this for three tools (Tech Debt, ICG, Regulatory Map). BL-031.75's prompt library then made the gap visible: five of eight prompts carried "deep-link will be added when the page supports URL state" disclaimers because `compute_techpar`, `generate_diligence_agenda`, the cached Radar tool, and `search_portfolio` could not emit working links. BL-031.95 closed that gap across all four (five phases, 2026-05-02 → 2026-05-03), making the deep-link surface uniform across every prompt-driven Hub tool.

## Decision

The URL-state contract has four load-bearing parts:

1. **One encoder module per tool, shared by both surfaces.** The website page and the MCP wrapper import the _same_ serializer — e.g. [`src/utils/radar-url.ts`](../../utils/radar-url.ts) is imported by both [`CategoryFilter.astro`](../../components/radar/CategoryFilter.astro) (hydrate on load, `history.replaceState` on change) and [`mcp-server/src/tools/radar-offline.ts`](../../../mcp-server/src/tools/radar-offline.ts) (`deeplink` emission). Single source of truth; round-trip parity tests per encoder.

2. **Two coexisting encoding archetypes, chosen per tool.** Compact base64 `?s=<base64 JSON>` for the BL-031.5 form wizards — `encodeState` / `decodeState` in [`src/utils/tech-debt-engine.ts`](../../utils/tech-debt-engine.ts) and [`icg-engine.ts`](../../utils/icg-engine.ts). Readable `?key=value` params for everything else — Regulatory Map ([`regulatory-map-url.ts`](../../utils/regulatory-map-url.ts)), TechPar (`serializeToParams` in [`techpar-engine.ts`](../../utils/techpar-engine.ts), pre-existing), and BL-031.95's three new encoders [`diligence-url.ts`](../../utils/diligence-url.ts), [`radar-url.ts`](../../utils/radar-url.ts), [`portfolio-url.ts`](../../utils/portfolio-url.ts). Decoders validate each value and silently drop unknowns; empty / `"all"` values are omitted so a clean view yields a clean URL.
   - **Rejected: base64 for the new four.** Readable params let analysts hand-edit a single param to test variants, are self-describing in a pasted link, and survive share/unfurl mutations; TechPar's pre-existing readable convention was treated as the de facto pattern.
   - **Rejected: migrating Tech Debt / ICG to readable params.** Their base64 encoders work and URLs in the wild rely on them — migration is churn without a problem. Flagged to BL-034 only if the two-archetype split becomes real friction.

3. **The capability-mirror invariant.** Each tool's MCP input schema mirrors the website's filter surface exactly — so any MCP call is expressible as a link, and every deeplink lands on a view the user could have built by hand. Enforcing it meant _stripping_ inputs with no website counterpart: Radar's `query` / `tier` / `since` / `limit` (Phase 3.A) and Portfolio's `limit` (Phase 4.A). If a future website filter ships, schema and encoder grow in lockstep — never unilaterally on either side. The invariant is documented in [`radar/CONTRACT.md`](../../../mcp-server/src/docs/tools/radar/CONTRACT.md) and locked by handler-level invariant tests; the live `search_radar` keeps the same mirrored shape as `search_radar_offline`.

4. **Stage values ride ADR-0001's adapter path; URLs encode native.** Wrappers accept canonical-or-native funding stages ([ADR-0001](0001-stage-taxonomy-adapter.md)), resolve to native, and the deeplink encodes the _native_ value — URL state is the engine's input shape. Canonical-aware URL payloads (a URL portable across tools) were explicitly declared out of scope.

**URL backward-compat is explicitly NOT a business requirement** — operator decision 2026-05-06, recorded in BL-032.25 § 1 ([archived](../development/_archive/MCP_SERVER_REMOTE_BL-032_25.md)). Breaking URL-state changes (e.g. the TechPar `infraHosting` → `infraHostingAnnual` rename, or a hypothetical stage-enum normalization) are acceptable one-time breakage: previously shared URLs go dead, no shim or deprecation window is owed. This is what kept BL-031.95's ergonomics fixes cheap and collapsed BL-032.25's normalization cost estimate.

## Consequences

- **What cites this contract**: the golden fixtures assert the deeplink surface per prompt version ([`target-quick-look.golden.md`](../../../mcp-server/tests/examples/target-quick-look.golden.md) header records the Phase 5 deeplink completion); prompt bodies close with "Open in Hub" sections that surface tool-emitted deeplinks; [`radar/CONTRACT.md`](../../../mcp-server/src/docs/tools/radar/CONTRACT.md) + `USAGE.md` and [`portfolio/CONTRACT.md`](../../../mcp-server/src/docs/tools/portfolio/CONTRACT.md) + `USAGE.md`; the encoder module JSDoc; and `mcp-server/README.md` § "Last verified (BL-031.95 surface)".
- The contract is exercised on every model upgrade: prompt goldens are regenerated and diffed, and per-tool handler integration tests (`mcp-server/tests/integration/*-handler.test.ts`) assert deeplink-encoder parity without the MCP transport.
- Error paths emit no deeplink (`isError` responses have no data to land on); Diligence URL state takes precedence over its localStorage on page-load init, with localStorage as the return-tomorrow fallback.
- Post-decision renames composed cleanly: `search_radar_cache` → `search_radar_offline` (BL-032 Phase 4b) kept the same encoder and mirrored shape.
- **Revisit trigger**: if BL-033 external clients (or any consumer outside operator control) come to depend on stable shared URLs, the 2026-05-06 backward-compat decision flips — breaking URL changes would then need shims or versioned params, and this ADR gets a dated append recording the reversal.
