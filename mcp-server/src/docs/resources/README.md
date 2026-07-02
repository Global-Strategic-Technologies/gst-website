# MCP Resources — URI Taxonomy Reference

> **Audience**: anyone authoring or modifying a Resource under `mcp-server/src/resources/`, or an agent/operator deciding which Resource URI to read.
>
> **Companion docs**:
>
> - [`mcp-server/README.md`](../../../README.md) § "Resources" — user-facing inventory.
> - [`../tools/README.md`](../tools/README.md) — the sibling registry for tool **input contracts** (Resources expose read-only content; Tools take structured input).
> - [`../prompts/README.md`](../prompts/README.md) — the registered-prompt pattern that composes Tools + Resources into workflows.
>
> This doc is the durable conceptual reference for the Resource **URI taxonomy** — it explains the naming scheme and what each family exposes.

---

## The pattern in one sentence

An MCP **Resource** is a read-only, addressable document the model fetches by a stable `gst://` URI — the server owns the content, the URI is the contract, and once a URI is published it must not move.

Resources are the "here is the reference material" half of the surface; [Tools](../tools/README.md) are the "here is a computation you can run" half. An agent reads a Resource to ground itself, then calls a Tool to act.

---

## The URI families

All Resources are registered via `server.registerResource(name, uri, { title, description, mimeType }, handler)` in `mcp-server/src/resources/`. Three families exist today:

| Family          | URI pattern                                                                        | Registration                                                       | Content                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Library**     | `gst://library/<slug>`                                                             | [`../../resources/library.ts`](../../resources/library.ts)         | GST library articles (e.g. `business-architectures`, `vdr-structure`, `information-request-list`), one Resource per `LIBRARY_ENTRIES` slug. `text/markdown`. |
| **Regulations** | `gst://regulations/<jurisdiction>/<framework-id>`                                  | [`../../resources/regulations.ts`](../../resources/regulations.ts) | One Resource per regulatory framework (120+), JSON-serialized full `Regulation` schema. `application/json`.                                                  |
| **Radar**       | `gst://radar/fyi/latest`, `gst://radar/wire/latest`, `gst://radar/wire/<category>` | [`../../resources/radar.ts`](../../resources/radar.ts)             | Curated FYI highlights + aggregated Wire feed. `<category>` ∈ `pe-ma` / `enterprise-tech` / `ai-automation` / `security`. `application/json`.                |

### Not a Resource: per-item radar URIs

`gst://radar/item/<id>` is **intentionally not** a registered Resource — cached item IDs churn on every `npm run radar:seed` and the count would explode. The [`search_radar_offline`](../tools/radar/CONTRACT.md) tool returns items directly; callers don't chain to a per-item Resource. (This closes the BL-031.5 "radar per-item URIs" deferral — formally dropped, see [`../../resources/radar.ts`](../../resources/radar.ts).)

---

## Mechanics worth knowing

- **URI stability is the contract.** Once a URI is published it must not move — external agents pin to it. Adding a family is additive; renaming is a breaking change (record it in [`mcp-server/BREAKING_CHANGES.md`](../../../BREAKING_CHANGES.md)).
- **Read-through cache.** Radar (and the cacheable content families) resolve through `readThroughCache` so repeated reads don't re-hit upstream; the radar snapshot cache TTL is documented alongside the reader in [`../../content/radar-snapshot.ts`](../../content/radar-snapshot.ts).
- **Missing content returns an envelope, not a 404.** A radar Resource with no seeded snapshot returns a structured "snapshot missing" message (`npm run radar:seed` populates it locally) rather than throwing.
- **Stability is pinned by a test.** [`../../../tests/integration/resource-uri-stability.test.ts`](../../../tests/integration/resource-uri-stability.test.ts) asserts the published URI set doesn't drift silently.

---

## Adding a new Resource family

1. Add a registration module (or entry) under `mcp-server/src/resources/`, calling `registerResource(name, uri, { title, description, mimeType }, handler)`.
2. Pick a `gst://<family>/<addressable-key>` URI — hierarchical, lowercase, stable.
3. If the content is expensive to produce, wrap the handler in `readThroughCache`.
4. Add the URI to `resource-uri-stability.test.ts` so drift is caught.
5. Document the family in the table above and in `mcp-server/README.md` § "Resources".

---

_Last updated: 2026-07-02 (BL-034 doc-structure pass — resources/ taxonomy formalized)._
