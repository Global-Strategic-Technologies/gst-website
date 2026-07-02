# Usage — `search_radar_offline`: A Radar Brief Walkthrough

A complete, reproducible end-to-end example of using the [`@gst/mcp-server`](../../../../README.md) `search_radar_offline` tool (renamed from `search_radar_cache` in [BL-032 Phase 4b](../../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited); the deprecated `search_radar_cache` alias still works for one release) for a real-shaped task: pulling the most recent items from the GST Radar to draft a one-page pre-meeting brief on a specific category.

> **Sister tool**: [`search_radar`](../../../../README.md) (live, Inoreader-touching, remote-MCP-only — ships under [BL-032 Phase 4c](../../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md)) — same shape, different source. Use `search_radar` when you want today's items; use `search_radar_offline` (this tool) when you want a deterministic snapshot for dev/CI/budget-exhausted contexts.

This document is a **stakeholder orientation aid** — it answers "what does it actually look like to use this" without requiring the reader to install the server first. Every input and output below is reproducible by anyone with the MCP server registered in their Claude client and the local cache seeded via `npm run radar:seed`.

> Companion docs: [`CONTRACT.md`](./CONTRACT.md) (per-field input reference) | [`../contracts/README.md`](../README.md) (registry of all per-tool contracts).

> **The brief in this document is illustrative.** Item titles, sources, and GST Take excerpts are real-shaped (they come from the seeded mock fixture used for tests) but no specific deal or counterparty is being briefed.

---

## The scenario

A partner is walking into a 30-minute call with a portfolio company's CTO in 90 minutes. The conversation will touch enterprise SaaS consolidation pressure, cloud cost discipline, and the AI infrastructure capex wave. The partner doesn't have time to read the full Radar feed — they need the headline pattern across the recent items in two relevant categories so they can sound informed without re-reading three weeks of headlines.

In the pre-MCP workflow, prepping this meant:

1. Open `globalstrategic.tech/hub/radar` in a browser.
2. Click each category pill in turn, scan headlines, copy the most relevant 3–5 into a doc.
3. Open each item to read the GST Take annotation; transcribe the highlights.
4. Synthesize a "what's the through-line" paragraph manually.
5. Re-open if a follow-up category becomes relevant.

In the MCP workflow, the partner asks Claude in the same chat thread that's already drafting their meeting agenda.

---

## What you actually type

Inside any Claude client where the GST MCP server is registered (Claude Desktop, Claude Code, Cursor — see the [MCP server README](../../../../README.md) for setup), describe the request in prose:

> _"Pull the latest annotated radar items in enterprise-tech and ai-automation. I want a 90-second brief on what's happening in those two spaces — give me the GST Take voice, group by category, and end with a one-paragraph through-line across both."_

Claude identifies that the `mcp__gst__search_radar_offline` tool fits the request and calls it twice — once per category. For orientation, here is what Claude derives — the full per-field reference is in [`CONTRACT.md`](./CONTRACT.md):

| Schema field | Resolved value                                            | Source phrase                       |
| ------------ | --------------------------------------------------------- | ----------------------------------- |
| `category`   | `enterprise-tech` (call 1), then `ai-automation` (call 2) | "enterprise-tech and ai-automation" |

That's the entire input surface. The MCP tool's schema mirrors the website's `/hub/radar` filter pills exactly — a single optional `category` field — so prompt engineering is trivial.

Alternative path (single call, all categories):

> _"Pull the latest radar items across all four categories — give me a quick read on whatever's hot."_

Claude calls `mcp__gst__search_radar_offline` once with `{}` (no filter) and gets the full unified FYI + Wire feed sorted by `publishedAt` newest-first.

---

## The response the tool returns

```typescript
{
  matches: [
    { id, title, url, source, category, publishedAt, summary?, annotation?, tier },
    // ...
  ],
  totalMatched: number,
  returned: number,        // === totalMatched (no `limit`; mirrors website)
  snapshotInfo: { fyiLastSeededAt, wireLastSeededAt },
  deeplink: string,        // e.g. "https://globalstrategic.tech/hub/radar?category=enterprise-tech"
}
```

For the partner's `enterprise-tech` call, the response in this scenario contains 2 items: an FYI piece on "Enterprise SaaS Consolidation Wave Accelerates" with a GST Take noting "the easy growth era is over," and a Wire piece on "Cloud Cost Optimization Becomes Board-Level Priority." For `ai-automation`, 1 FYI item on "AI Infrastructure Capex Surge."

The `deeplink` for the enterprise-tech call is `https://globalstrategic.tech/hub/radar?category=enterprise-tech`. The partner pastes this into their meeting notes; clicking it later opens the `/hub/radar` page with the enterprise-tech pill pre-active and the same items rendered.

---

## Building the brief from the responses

With both responses in conversation context, Claude composes the brief in the GST Take voice:

> **Enterprise Tech.** Two items reinforce the same pattern: SaaS market consolidation is accelerating (Vista's portfolio rollups + Constellation's vertical-SaaS strategy), and CFOs are moving cloud cost from "engineering metric" to "board metric." The through-line: easy growth is over, and value now accrues to operators who control either the platform or the cost structure. _What to watch_: which Series-B portfolio companies still have headroom on cost discipline before the next funding round.
>
> **AI / Automation.** Capex on AI infrastructure is now the dominant line item for hyperscaler datacenter buildout. The implication for software companies isn't whether to use AI — it's whether the AI features are proprietary moats or thin wrappers around third-party APIs. _What to watch_: gross-margin compression in any company whose AI roadmap is "build it on top of GPT-4."
>
> **GST Take across the brief.** The through-line across both categories is **discipline arbitrage**: the easy money — easy exits, easy growth, easy AI features — is gone, and the operators who win this cycle are the ones who control the platform, the cost structure, or the moat. Both spaces reward operators who know what to OWN versus what to RENT.
>
> _Open in Hub_: [enterprise-tech](https://globalstrategic.tech/hub/radar?category=enterprise-tech) · [ai-automation](https://globalstrategic.tech/hub/radar?category=ai-automation)

The two `deeplink` URLs at the bottom let the partner forward the brief to a colleague who can click through to the same filtered Radar view on the website.

---

## The iteration pattern

Once the partner is in the call, follow-ups become single sentences. Each is a single tool call with a sub-second response.

| Pivot                               | Prompt                                                       | What changes                                              |
| ----------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| Pull a third category               | _"Now pull `pe-ma` too."_                                    | Single-call response with PE/M&A items                    |
| Get the all-categories digest       | _"Give me everything in the cache, sorted newest-first."_    | Single-call response with `{}` (no filter)                |
| Re-shape (already-in-context items) | _"Compress the brief to 3 bullets — call, signal, action."_  | No tool call; pure rewriting in-conversation              |
| Move to a different tool            | _"For each item, run a TechPar lookup on the named target."_ | Composes with `compute_techpar`; same-thread, no tab swap |

---

## Anchoring in past coverage

Items in the snapshot are live Inoreader content (or seed-mock content if the cache hasn't been refreshed). To ground a Radar pattern in actual GST engagement history, Claude composes with `search_portfolio`:

> _"For the cloud-cost theme — pull our past engagements where cost discipline was the value-creation lever."_

Returns matched portfolio engagements with codenames and ARRs. The partner closes the loop in the same thread without re-typing the pattern.

---

## Why this matters (the value summary for stakeholders)

| Concern                                       | Pre-MCP workflow                                          | MCP workflow                                                                                          |
| --------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Time to a pre-meeting brief                   | 15–25 min (browse, copy-paste, synthesize manually)       | < 60 seconds (single prose prompt)                                                                    |
| Time to re-shape the brief for a new audience | Same as initial draft                                     | Sub-second (already in context)                                                                       |
| Anchoring in past engagements                 | Manual recall or open `/ma-portfolio` and search visually | Inline tool call in the same thread (`search_portfolio` composes with `search_radar_offline` results) |
| Sharing the filtered view                     | Copy URL; recipient sees the unfiltered feed              | `deeplink` URL opens the same category-filtered view byte-for-byte (BL-031.95 Phase 3.B contract)     |
| Engine drift risk                             | Two surfaces (web + MCP) → divergence possible            | Both surfaces share the same encoder + filter logic — by construction, capability-mirror invariant    |

The cache itself is not new. The category filter is not new. **What is new is putting both inside the conversation that's writing the meeting agenda, the deal memo, the analyst briefing** — without any context-switch to a browser tab.

---

## Reproducing this walkthrough

To run the exact scenario in this document:

1. Set up the MCP server per [`mcp-server/README.md`](../../../../README.md) → "Install & build" and "Configure clients" sections.
2. Seed the local Radar cache: `npm run radar:seed` from the gst-website repo root.
3. In a fresh Claude conversation with the `gst` server enabled, paste the prose prompt under [What you actually type](#what-you-actually-type).
4. Compare the brief structure against the model output above.

The cache TTL is 24 hours ([`src/lib/inoreader/cache.ts:18`](../../../../../src/lib/inoreader/cache.ts#L18)) — re-run `npm run radar:seed` if the snapshot has aged out. The seed fixtures are deterministic; outputs are stable across runs against the same cache.

For other use cases (live agenda drafting, comparable-deal recall), see [`mcp-server/README.md` → Why this exists (use cases)](../../../../README.md#why-this-exists-use-cases).

---

## Related documentation

- [`mcp-server/README.md`](../../../../README.md) — install, configure, tool inventory, troubleshooting
- [`CONTRACT.md`](./CONTRACT.md) — per-field input reference + capability-mirror invariant rationale
- [`../contracts/README.md`](../README.md) — registry of all per-tool contracts
- [`src/docs/development/MCP_SERVER_HUB_URL_STATE_BL-031_95.md`](../../../../../src/docs/development/MCP_SERVER_HUB_URL_STATE_BL-031_95.md) § Phase 3 — closure stanza for the URL state restoration + capability-mirror refactor

---

_Last Updated: 2026-05-02_
