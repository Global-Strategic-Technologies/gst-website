# Usage — `search_portfolio`: A Comparable-Engagement Memo Walkthrough

A complete, reproducible end-to-end example of using the [`@gst/mcp-server`](../../../../README.md) `search_portfolio` tool for a real-shaped task: pulling matched past engagements and synthesising them into a one-page comparable-engagements memo for an analyst preparing for a partner meeting.

This document is a **stakeholder orientation aid** — it answers "what does it actually look like to use this" without requiring the reader to install the server first. Every input and output below is reproducible by anyone with the MCP server registered in their Claude client; the dataset is bundled into the server binary at build time and contains 61 anonymized engagements.

> Companion docs: [`CONTRACT.md`](./CONTRACT.md) (per-field input reference) | [`../contracts/README.md`](../README.md) (registry of all per-tool contracts).

> **The memo in this document is illustrative.** Codenames and ARRs are real-shaped (they come from `src/data/ma-portfolio/projects.json`) but no specific deal is being briefed.

---

## The scenario

An analyst is supporting a partner meeting in 60 minutes on a healthcare-tech buy-side opportunity. The partner wants two outputs before the meeting:

1. A list of GST's prior healthcare-tech buy-side engagements with codename + ARR.
2. A one-paragraph synthesis of recurring patterns across those engagements (technology themes, value-creation levers, common pitfalls).

In the pre-MCP workflow, the analyst would:

1. Open `globalstrategic.tech/ma-portfolio` in a browser.
2. Click "Buy-Side" in the Engagement chip row, then "Healthcare Tech" in the Theme chip row.
3. Scan the resulting cards, click each to expand the modal, copy summary / challenge / solution text into a doc.
4. Re-read the captured text, find the throughline, write the synthesis paragraph manually.
5. Re-open the page if the partner asks for a sibling theme.

In the MCP workflow, the analyst asks Claude in the same chat thread that's already drafting the meeting prep deck.

---

## What you actually type

Inside any Claude client where the GST MCP server is registered (Claude Desktop, Claude Code, Cursor — see the [MCP server README](../../../../README.md) for setup), describe the request in prose:

> _"Pull our past healthcare-tech buy-side engagements. List them as codename + ARR. Then synthesise a one-paragraph 'pattern across deals' read in the GST Take voice — what value-creation levers came up most, what tech themes recurred, what to watch for."_

Claude identifies that the `mcp__gst__search_portfolio` tool fits the request and calls it once. For orientation, here is what Claude derives — the full per-field reference is in [`CONTRACT.md`](./CONTRACT.md):

| Schema field | Resolved value    | Source phrase                         |
| ------------ | ----------------- | ------------------------------------- |
| `search`     | _(omitted)_       | (no free-text qualifier in the prose) |
| `theme`      | `Healthcare Tech` | "healthcare-tech"                     |
| `engagement` | `Buy-Side`        | "buy-side engagements"                |

That's the entire input surface. The MCP tool's schema mirrors the website's three filter controls exactly — `search`, `theme`, `engagement` — so prompt engineering is trivial.

Alternative path (free-text against technologies):

> _"Search the portfolio for any engagement involving Kubernetes."_

Claude calls `mcp__gst__search_portfolio` once with `{ search: "Kubernetes" }` and gets every project whose `codeName` / `industry` / `summary` / `technologies` contains the substring (case-insensitive). The matched cards on `/ma-portfolio` would render the same set.

If the analyst doesn't know what the valid theme values are, Claude calls `mcp__gst__list_portfolio_facets` first (zero-arg) and reads the `themes` / `engagementCategories` arrays out of the response.

---

## The response the tool returns

```typescript
{
  matches: Project[],          // every project passing the three filters
  totalMatched: number,        // === matches.length
  returned: number,            // === matches.length (no `limit`; mirrors the website)
  deeplink: string,            // e.g. "https://globalstrategic.tech/ma-portfolio?theme=Healthcare%20Tech&eng=Buy-Side"
}
```

For the analyst's healthcare + Buy-Side call, the response in this scenario contains 4 matched engagements: codenames `Aurora`, `Helios`, `Kestrel`, `Triton` (illustrative — exact codenames come from the bundled dataset), each with `summary`, `challenge`, `solution`, `technologies`, `arr`, `growthStage`, `year`.

The `deeplink` is `https://globalstrategic.tech/ma-portfolio?theme=Healthcare+Tech&eng=Buy-Side`. The analyst pastes this into the meeting prep deck; clicking it later opens the `/ma-portfolio` page with both filter chips already active and the same 4 cards rendered.

---

## Building the memo from the response

With the matches in conversation context, Claude composes the memo in the GST Take voice:

> **Comparable engagements (Healthcare Tech, Buy-Side).** Four prior engagements anchor the read:
>
> - **Aurora** — $180M ARR, Established Market Leader. Cloud migration + EHR consolidation.
> - **Helios** — $95M ARR, Scaling Growth. Patient-access platform, post-merger integration.
> - **Kestrel** — $40M ARR, Expansion Stage. Care-coordination workflow, telehealth bolt-on.
> - **Triton** — $220M ARR, Mature Enterprise. Revenue-cycle modernization, claims-engine cloud move.
>
> **Pattern across the deals.** The recurring lever is **claims-and-coding workflow modernization** — three of four engagements converged on the same value driver, regardless of the headline thesis. Tech-stack throughline: Snowflake / dbt for the data warehouse, FHIR-aligned interop layers for clinical data, and a Kubernetes-on-AWS posture in 3 of 4. **What to watch**: in every healthcare buy-side that didn't hit synergy targets, the gap was always integration-team headcount, not technology. The platform was usually fine; the operators couldn't move fast enough to consolidate.
>
> _Open in Hub_: [Healthcare Tech / Buy-Side](https://globalstrategic.tech/ma-portfolio?theme=Healthcare+Tech&eng=Buy-Side)

The `deeplink` URL at the bottom lets the analyst forward the memo to a colleague who can click through to the same filtered portfolio view.

---

## The iteration pattern

Once the memo is in hand, follow-ups become single sentences. Each is a single tool call with a sub-second response.

| Pivot                               | Prompt                                                    | What changes                                               |
| ----------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Pivot to a different theme          | _"Same shape but for fintech buy-side."_                  | Single-call response with `theme: 'Financial Services'`    |
| Add a free-text qualifier           | _"Now narrow to ones involving Snowflake."_               | Single call with `search: 'Snowflake'` plus the same chips |
| Drop the engagement filter          | _"Open it up to sell-side too — combined buy/sell view."_ | Single call with `engagement: 'all'`                       |
| Re-shape (already-in-context items) | _"Compress to 3 bullets — codename, lever, watch-out."_   | No tool call; pure rewriting in-conversation               |
| Move to a different tool            | _"For the largest engagement, run a TechPar lookup."_     | Composes with `compute_techpar`; same-thread, no tab swap  |

---

## Anchoring in current radar coverage

Items in the matched portfolio set are historical engagements. To check whether the same patterns are showing up in this week's deal-flow signals, Claude composes with `search_radar_offline`:

> _"Cross-reference the healthcare buy-side pattern with this week's enterprise-tech radar items."_

Returns matched annotated radar items in the same conversation, letting the analyst close the loop in a single thread.

---

## Why this matters (the value summary for stakeholders)

| Concern                                       | Pre-MCP workflow                                           | MCP workflow                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Time to a comparable-engagements memo         | 20–30 min (browse, click each card, copy text, synthesize) | < 60 seconds (single prose prompt)                                                                    |
| Time to re-shape the memo for a new audience  | Same as initial draft                                      | Sub-second (already in context)                                                                       |
| Cross-referencing with current radar coverage | Manual recall + open second tab                            | Inline tool call in the same thread (`search_radar_offline` composes with `search_portfolio` results) |
| Sharing the filtered view                     | Copy URL; recipient sees the unfiltered grid               | `deeplink` URL opens the same filter-active view byte-for-byte (BL-031.95 Phase 4.B contract)         |
| Engine drift risk                             | Two surfaces (web + MCP) → divergence possible             | Both surfaces share the same encoder + filter logic — by construction, capability-mirror invariant    |

The dataset is not new. The filter chips are not new. **What is new is putting both inside the conversation that's writing the meeting prep deck, the deal memo, the analyst briefing** — without any context-switch to a browser tab.

---

## Reproducing this walkthrough

To run the exact scenario in this document:

1. Set up the MCP server per [`mcp-server/README.md`](../../../../README.md) → "Install & build" and "Configure clients" sections.
2. In a fresh Claude conversation with the `gst` server enabled, paste the prose prompt under [What you actually type](#what-you-actually-type).
3. Compare the memo structure against the model output above.

The dataset is bundled into the server binary; updates to `src/data/ma-portfolio/projects.json` require `npm run build` from `mcp-server/` to take effect. Engineering correctness of the wrapper pipeline (input parsing → filter → deeplink emission) is verified by [`mcp-server/tests/integration/portfolio-handler.test.ts`](../../../../tests/integration/portfolio-handler.test.ts).

For other use cases (live agenda drafting, capex pattern review, regulatory exposure check), see [`mcp-server/README.md` → Why this exists (use cases)](../../../../README.md#why-this-exists-use-cases).

---

## Related documentation

- [`mcp-server/README.md`](../../../../README.md) — install, configure, tool inventory, troubleshooting
- [`CONTRACT.md`](./CONTRACT.md) — per-field input reference + capability-mirror invariant rationale
- [`../contracts/README.md`](../README.md) — registry of all per-tool contracts
- [ADR-0005 — Hub URL-state deep-link contract](../../../../../src/docs/adr/0005-hub-url-state-deeplink-contract.md) (Phase 4 closure history: [archived design doc](../../../../../src/docs/development/_archive/MCP_SERVER_HUB_URL_STATE_BL-031_95.md))

---

_Last Updated: 2026-05-03_
