# Usage — `search_regulations` + `gst://regulations/...`: A Cross-Border Compliance Walkthrough

A complete, reproducible end-to-end example of using the [`@gst/mcp-server`](../../../README.md) `search_regulations` / `list_regulation_facets` tools and the companion `gst://regulations/<jurisdiction>/<framework-id>` Resources for a real-shaped task: mapping the regulatory exposure of a target operating across multiple jurisdictions and pinning the relevant framework bodies as agent context for a deal review.

This document is a **stakeholder orientation aid** — it answers "what does it actually look like to use this" without requiring the reader to install the server first. Every input and output below is reproducible by anyone with the MCP server registered in their Claude client.

> Companion docs: [`CONTRACT.md`](./CONTRACT.md) (per-field input + URI taxonomy reference) | [`../contracts/README.md`](../contracts/README.md) (registry of all per-tool contracts).

> **The deal in this document is hypothetical.** No real client, target, or codename. Framework names, IDs, and effective dates are real — they come from the 120 JSON files in `src/data/regulatory-map/` — but the example deal context is illustrative.

---

## The scenario

A buy-side deal team is preparing a kick-off call for a target that operates a B2B SaaS platform handling customer PII in **EU (German subsidiary), UK, US (California + New York), and Canada (federal + Quebec)**. The deal partner asks: _"Give me the regulatory floor — every framework that applies, the penalty exposure, and the obligations the target must demonstrate compliance with. I want this in the kickoff brief."_

In the pre-MCP workflow, the answer meant:

1. Open `globalstrategic.tech/hub/tools/regulatory-map` in a browser.
2. Click through region filters (EU, UK, US-CA, US-NY, CA, CA-QC) one at a time.
3. Read each framework's summary panel; copy the relevant text into the brief.
4. Switch tabs to a separate compliance reference for any framework that needs deeper context.
5. Re-do the navigation if the deal partner asks _"what about Australia?"_ mid-conversation.

In the MCP workflow, the entire mapping happens in the Claude conversation that's already drafting the kickoff brief. Per-framework full text is **pinnable as referenceable Resource context** — the model can cite specific obligations directly without paraphrasing.

---

## What you actually type

Inside any Claude client where the GST MCP server is registered (Claude Desktop, Claude Code, Cursor — see the [MCP server README](../../../README.md) for setup), describe the target's footprint in prose:

> _"Map the regulatory floor for this target. They handle customer PII and run a B2B SaaS platform across: EU (German entity), UK, US California, US New York, Canada federal, and Quebec province. Pull the data-privacy frameworks first, then the AI-governance ones since they have ML scoring features. I'll want the EU GDPR full text pinned for the next conversation."_

Claude reads the prose, identifies that `mcp__gst__search_regulations` and the regulation Resources are the right tools, and orchestrates a small sequence of calls. For orientation, here is how the request decomposes:

| Step | Tool / Resource                                                                    | Purpose                                                                         |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1    | `mcp__gst__list_regulation_facets`                                                 | Discover valid jurisdiction codes (`eu`, `gb`, `us-ca`, `us-ny`, `ca`, `ca-qc`) |
| 2    | `mcp__gst__search_regulations { jurisdiction: "eu", category: "data-privacy" }`    | EU data-privacy frameworks                                                      |
| 3    | `mcp__gst__search_regulations { jurisdiction: "gb", category: "data-privacy" }`    | UK data-privacy frameworks                                                      |
| 4    | `mcp__gst__search_regulations { jurisdiction: "us-ca", category: "data-privacy" }` | California                                                                      |
| 5    | `mcp__gst__search_regulations { jurisdiction: "us-ny", category: "data-privacy" }` | New York                                                                        |
| 6    | `mcp__gst__search_regulations { jurisdiction: "ca", category: "data-privacy" }`    | Canada federal                                                                  |
| 7    | `mcp__gst__search_regulations { jurisdiction: "ca-qc", category: "data-privacy" }` | Quebec                                                                          |
| 8    | Repeat steps 2–7 with `category: "ai-governance"`                                  | AI-governance overlay                                                           |
| 9    | `resources/read gst://regulations/eu/gdpr`                                         | Pin the full GDPR JSON body for the next conversation                           |

If a phrase is ambiguous, Claude asks a follow-up before running searches — e.g., _"You said US California and New York — want me to also include US-federal frameworks like CCPA's federal counterparts (HIPAA, GLBA) since they handle PII? Those'd add ~3-4 more frameworks."_

The full per-tool input contract (filter semantics, jurisdiction code conventions, URI taxonomy, sub-region detection rules) lives in [`CONTRACT.md`](./CONTRACT.md).

---

## The map the engine returns

After the multi-call sequence, Claude has assembled a regulatory matrix.

### Headline numbers

- **9 data-privacy frameworks apply** across the listed jurisdictions
- **2 AI-governance frameworks** (EU AI Act + a US-CA AI transparency statute)
- **0 cybersecurity** frameworks selected (none requested in this scenario)
- **All 9 framework bodies** are pinnable as `gst://regulations/...` Resources for direct agent reference

### The matrix

| Jurisdiction | Framework                                 | URI                                       | Effective  | Penalty exposure                       |
| ------------ | ----------------------------------------- | ----------------------------------------- | ---------- | -------------------------------------- |
| EU           | General Data Protection Regulation (GDPR) | `gst://regulations/eu/gdpr`               | 2018-05-25 | Up to 4% of global turnover or €20M    |
| EU           | EU AI Act                                 | `gst://regulations/eu/ai-act`             | 2024-08-01 | Up to 7% of global turnover            |
| GB           | Data Protection Act 2018                  | `gst://regulations/gb/dpa`                | 2018-05-25 | Up to 4% of global turnover or £17.5M  |
| US-CA        | California Consumer Privacy Act (CCPA)    | `gst://regulations/us-ca/ccpa`            | 2020-01-01 | Up to $7,500 per intentional violation |
| US-CA        | California AI Transparency Act            | `gst://regulations/us-ca/ai-transparency` | 2026-01-01 | Civil penalties per violation          |
| US-NY        | NY SHIELD Act / NYDFS Cybersecurity Reg   | (per facet results)                       | varied     | varied                                 |
| CA           | PIPEDA (Personal Information Protection)  | `gst://regulations/ca/pipeda`             | 2001-01-01 | Up to CA$100K per violation            |
| CA-QC        | Quebec Law 25                             | `gst://regulations/ca-qc/law25`           | 2023-09-22 | Up to CA$25M or 4% of revenue          |

### Per-framework body retrieval

The Resources URIs return full JSON content via `resources/read`. Example for GDPR (`gst://regulations/eu/gdpr`):

```json
{
  "id": "eu-gdpr",
  "name": "General Data Protection Regulation (GDPR)",
  "regions": ["AUT", "BEL", "BGR", "HRV", "..." /* 27 EU member-state ISO codes */],
  "effectiveDate": "2018-05-25",
  "summary": "...",
  "category": "data-privacy",
  "keyRequirements": [
    "Lawful basis required for all personal data processing",
    "Explicit consent with clear opt-in mechanisms",
    "Right to access, rectification, erasure, and data portability",
    "Data Protection Officer (DPO) appointment for qualifying organizations",
    "72-hour breach notification to supervisory authorities",
    "Data Protection Impact Assessments (DPIA) for high-risk processing",
    "Cross-border data transfer safeguards (SCCs, BCRs, adequacy decisions)"
  ],
  "penalties": "Up to 4% of annual global turnover or EUR 20 million, whichever is greater."
}
```

The `keyRequirements[]` array is what makes Resources qualitatively different from search results — every obligation is discrete, citeable, and stable across sessions (URI-stability test enforces this).

---

## Anchoring in the deal review

Three uses for this regulatory map:

1. **Diligence prioritization.** GDPR + EU AI Act + Quebec Law 25 are the highest-penalty frameworks. The deal team's compliance interviews should focus on these three before working through the lower-stakes ones. The kickoff brief leads with: _"Three frameworks with > 4% global-revenue penalty exposure. Demonstrating compliance with these is non-negotiable for closing."_
2. **Pinning Resources for follow-up conversations.** The deal partner says _"I'll want to dig into the AI Act in tomorrow's session."_ The model pins `gst://regulations/eu/ai-act` into a saved context. Tomorrow's session opens with the full framework body already available — no need to re-search, no risk of paraphrase drift.
3. **Cross-tool overlay.** The compliance map intersects with the [`techpar/USAGE.md`](../techpar/USAGE.md) walkthrough: GDPR's data-residency requirements may constrain the cost-out moves a TechPar `above`-zone target could otherwise consider. Inline:

   > _"Given the GDPR requirements, what tech-cost optimization moves would be foreclosed for this target? Specifically the multi-region replication and cross-border data flows."_

   → Claude reasons across the pinned GDPR body and the TechPar zone classification — single thread, no context-switch.

---

## The iteration pattern

The website wizard's value proposition is the visual map (geographic overlay, color-coded per-region density). The MCP server's value proposition is **fast multi-jurisdiction queries with pinnable framework bodies**. The iteration patterns below are sub-second.

| Pivot                          | Prompt                                                                     | What changes                                                                            |
| ------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Add a jurisdiction             | _"They're expanding to Australia next year — add AU."_                     | New search call: `{ jurisdiction: "au" }` returns Privacy Act + AML/CTF + SOCI          |
| Drop AI-governance focus       | _"Actually they don't have ML features, drop AI."_                         | Just removes the AI-governance frameworks from the matrix                               |
| Free-text cross-cutting search | _"Any framework anywhere that mentions 'breach notification' explicitly?"_ | `{ query: "breach notification" }` returns matches across jurisdictions and categories  |
| Full-text retrieval            | _"Pin the full body of CCPA, GDPR, and Quebec Law 25 for tomorrow."_       | 3× `resources/read` calls; bodies become pinned context                                 |
| Stage-shift sensitivity        | _"What if their Canadian footprint is just Ontario, not federal-wide?"_    | Drops `ca-pipeda` from the matrix; adds Ontario PHIPA if applicable                     |
| Penalty sensitivity            | _"Filter to frameworks with > 2% revenue penalty exposure only."_          | Post-filter prompt operation on the matrix already in context (no new tool call needed) |

Each pivot is one to a few tool calls. Compare to the website-wizard equivalent: navigate the geographic map, click each region, read each framework, transcribe.

---

## Reshape the same output without re-running searches

Once you have the matrix, Claude can reshape it without re-querying:

| Reshape goal                              | Prompt                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compliance-officer brief                  | _"Draft a one-page compliance brief listing each framework, key obligations, and the 'demonstrate compliance' artifact required (DPA, audit, etc.)"_ |
| Diligence interview question set          | _"For each framework, draft 2-3 questions to probe in the management interview — focus on operational evidence, not policy assertions."_             |
| Penalty exposure roll-up                  | _"Compute the maximum aggregate penalty exposure across all frameworks if the target had a single major incident affecting all jurisdictions."_      |
| Per-framework remediation effort estimate | _"For each framework, qualitative-rate the remediation effort (low / medium / high / structural) if the target's controls are 70% mature today."_    |
| Investment-thesis paragraph               | _"Convert the regulatory map into a one-paragraph IC-memo finding on compliance risk, leading with the highest-penalty frameworks."_                 |
| Cross-jurisdiction conflict map           | _"Identify any obligations across these frameworks that conflict — e.g., data localization vs portability — and flag them as deal-risk items."_      |

These are operations that previously required manual compilation across the wizard's regional panels.

---

## Why this matters (the value summary for stakeholders)

| Concern                    | Pre-MCP workflow                                                   | MCP workflow                                                                                           |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Time to first map          | 15-25 min (browser, 6 region clicks, read each framework panel)    | < 60 seconds (one prose prompt with the geographic footprint)                                          |
| Pinnable framework bodies  | Not possible — text is in browser DOM                              | `gst://regulations/...` Resources are referenceable across sessions                                    |
| Cross-jurisdiction queries | Sequential clicking                                                | One free-text query (e.g., "breach notification across all") returns all matches                       |
| Cross-tool integration     | Manual context-switch                                              | Inline: TechPar zones, ICG remediation timelines, library Resources all in one thread                  |
| Sub-region detection       | Manual lookup (is Quebec under CA-QC or CA-PQ? UK under GB or UK?) | `list_regulation_facets` answers it once; jurisdiction codes are then exact                            |
| Engine drift risk          | Two surfaces (web + MCP) → divergence possible                     | Both surfaces read from the same `src/data/regulatory-map/*.json` — by construction, identical content |

The 120-framework dataset is not new. The category taxonomy is not new. **What is new is putting both inside the conversation that's drafting the kickoff brief, prepping the compliance interview, or pinning frameworks for tomorrow's session** — without any context-switch, with stable URIs the model can cite by reference.

---

## Reproducing this walkthrough

To run the exact scenario in this document:

1. Set up the MCP server per [`mcp-server/README.md`](../../../README.md) → "Install & build" and "Configure clients" sections.
2. In a fresh Claude conversation with the `gst` server enabled, paste the prose prompt under [What you actually type](#what-you-actually-type).
3. Compare the matrix against the structure under [The map the engine returns](#the-map-the-engine-returns). Outputs will be byte-identical for the same jurisdiction × category filter set.
4. Pin one of the framework Resources (`gst://regulations/eu/gdpr` is the canonical demo URI) and confirm the `keyRequirements[]` array is in the model's context.

The dataset is deterministic; matches and Resource bodies are direct functions of the source JSON files in `src/data/regulatory-map/`.

---

## Related documentation

- [`mcp-server/README.md`](../../../README.md) — install, configure, tool inventory, troubleshooting
- [`CONTRACT.md`](./CONTRACT.md) — the canonical input contract (per-field reference, URI taxonomy, sub-region detection, hidden semantics)
- [`../contracts/README.md`](../contracts/README.md) — registry of all per-tool input contracts; what a contract is; the IRL forward-look
- [`src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md`](../../../../src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md) — architecture and design rationale for BL-031.5

---

_Last Updated: 2026-04-28_
