# Breaking changes — `@gst/mcp-server`

> **Discipline introduced under [BL-032](../src/docs/development/MCP_SERVER_REMOTE_BL-032.md) Phase 4b**.
>
> Tool names, prompt names, and Resource URIs are part of the package's public contract — pinned client conversations, agent code, and external clients (BL-033) all reference them by name. A rename or removal here is a breaking change for every consumer.
>
> **Every entry in this file ships with a corresponding `version` bump in [`package.json`](./package.json) and is mirrored in the [BL-032 architecture doc](../src/docs/development/MCP_SERVER_REMOTE_BL-032.md) Q-section that triggered it.** BL-032.5 Phase 4 formalizes the discipline with the **manifest-hash test** at [`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts) — the hash is computed over the registered Library/Regulation/Radar URIs + prompt `name@version` tuples; any drift fails the test and surfaces the new hash in the error message.

---

## Current manifest hash

```
9d5738f414bafc65e8b9340a277c3d0ad551f26fdedd6fa6411ec5af98a2245c
```

Computed over (sorted):

- 3 Library URIs (`gst://library/business-architectures`, `gst://library/vdr-structure`, `gst://library/information-request-list`)
- 120 Regulation URIs (`gst://regulations/<jurisdiction>/<framework-id>`)
- 6 Radar URIs (FYI latest + Wire latest + 4 Wire categories)
- 9 prompt `name@version` tuples (`gst_*`)

If this hash differs from the value in
[`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts) → `EXPECTED_MANIFEST_HASH`,
the test will fail with a remediation message. Update **both** values
in lockstep when the registry shape changes.

---

## 0.2.0 — 2026-05-22 — BL-043 Information Request List

**Theme**: ship the Information Request List as a Library article + MCP Resource + MCP Prompt.

### Added

- **Library article + Resource**: `gst://library/information-request-list` — universal one-page intake checklist organized by VDR taxonomy (00 Engagement Basics + sections 01-09 mirroring VDR-9). Codegen auto-picked up via `mcp-server/scripts/generate-regulations-index.mjs`.
- **MCP Prompt**: `gst_information_request_list` (v0.0.1) — assembles the input-gathering ask GST hands to a target/client before running diligence tools. Embeds the canonical Resource as the second message; supports optional `targetName`, `transactionContext`, and `productSummary` args for light personalization.

**Operator semantics**: this is an **additive** change — no URIs or prompt names were renamed or removed. Per the discipline above (URI / prompt-name addition → minor bump), `mcp-server/package.json` bumps `0.1.0 → 0.2.0`.

**Pinned conversation impact**: none. Existing pinned URIs and prompt names continue to resolve.

**Architecture context**: [BL-043 design doc](../src/docs/development/MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md).

---

## 0.1.0 — 2026-05-13 — BL-032.5 Phase 4 manifest-hash discipline

**Theme**: formalize the URI / prompt-name stability discipline that
BL-032 Phase 4b introduced informally.

**What changed**:

- New CI test at [`tests/integration/manifest-stability.test.ts`](./tests/integration/manifest-stability.test.ts)
  computes a sha256 over the sorted Library / Regulation / Radar URIs +
  prompt `name@version` tuples. Fails when the registry shape drifts
  from the value committed here.
- `BREAKING_CHANGES.md` gains a `## Current manifest hash` section
  (above) that operators update in lockstep with the test constant
  when a manifest-affecting change ships.

**Operator semantics**:

- URI / prompt-name **rename** or **removal** → major bump (breaks pinned conversations)
- URI / prompt-name **addition** → minor bump
- prompt **`version` field** bump (same name, behavior change) → patch bump

**Architecture context**: [BL-032.5 design doc § Repo placement and lifecycle](../src/docs/development/MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md#repo-placement-and-lifecycle).

This is not a breaking change in itself (no Tool / prompt / Resource was renamed); it's documented here so the discipline's introduction is auditable.

---

## 0.1.0 — 2026-05-04

**Theme**: BL-032 Phase 4b — `search_radar_cache` rename.

### Tool: `search_radar_cache` → `search_radar_offline`

The Phase 1 / BL-031.5 name `search_radar_cache` predicted a future split between a snapshot tool and a live tool (the live tool ships under BL-032 Phase 4c as `search_radar`). Reviewed during BL-032 Q2 — `_offline` more accurately describes what the tool does (offline-from-Inoreader; reads a frozen snapshot). The `_cache` framing also confused the relationship with the upcoming Worker-side ISR cache (`mcp:radar:cache:*` Upstash keys), which is a different cache layer entirely.

**What changed**:

- `mcp-server/src/tools/radar-cache.ts` → `mcp-server/src/tools/radar-offline.ts`
- Tool name registered in MCP: `search_radar_cache` → `search_radar_offline`
- Exported function names: `handleRadarCacheTool` → `handleRadarOfflineTool`; `registerRadarCacheTool` → `registerRadarOfflineTool`; `SearchRadarCacheInputSchema` → `SearchRadarOfflineInputSchema`
- Test files renamed: `radar-cache.test.ts` → `radar-offline.test.ts`, `radar-cache-handler.test.ts` → `radar-offline-handler.test.ts`

**Migration**: deprecated alias `search_radar_cache` registered alongside `search_radar_offline` for one release. Calling the alias:

- Tail-calls the same handler (no functional difference)
- Emits `[gst-mcp] DEPRECATION: search_radar_cache renamed to search_radar_offline ...` to stderr on each invocation
- Will be **removed in `mcp-server@0.2.0`** — update your client config / agent code before then

**Affected surfaces**: pinned conversations referencing `search_radar_cache`, agent code calling the tool by name, prompts orchestrating it (none currently — verified during the rename).

**Architecture context**: [BL-032 Q2](../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited) records the three options considered (rename + alias / coexist / drop offline) and the decision to rename + alias.

---

## How to use this file

When making a contract-breaking change to a tool / prompt / Resource:

1. Add an entry above the previous entries (newest at the top)
2. Bump `version` in `package.json` per semver:
   - **Rename or alias-only deprecation** (no functional change to callers honoring the deprecation): minor bump (`0.X.0`)
   - **Remove a deprecated alias**: major bump (`X.0.0`)
   - **Schema-incompatible change to an existing tool/prompt** (e.g. removing a field that callers depend on): major bump
3. Cross-reference the BL- doc / Q-section in the entry body so future readers can trace the reasoning
4. If the change ships with an alias for a deprecation window, name the version that retires the alias in the entry

The file goes BACKWARD chronologically (newest at top) so a reader scanning for "what's the most recent breaking change" sees it first.
