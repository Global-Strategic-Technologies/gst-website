# MCP for GST: Benefits, Considerations & Value Proposition

**Status:** Proposed
**Priority:** Medium
**Estimated Effort:** 1-2 days (internal prototype); 1-2 weeks (production-grade external)
**Expected ROI:** High (competitive differentiator for agentic workflows)

---

## What GST Has That's MCP-Worthy

GST already has structured, high-value data and tools that AI agents could consume:

| Asset | Current Form | MCP Potential |
|---|---|---|
| **Portfolio data** | 51 projects in `ma-portfolio/projects.json` with rich schema | `search_portfolio`, `filter_by_industry`, `get_engagement_stats` tools |
| **Diligence Machine** | Client-side wizard generating M&A diligence agendas | `generate_diligence_agenda` tool — the crown jewel |
| **Radar feed** | Inoreader-powered curated intelligence | `search_radar`, `get_latest_insights` tools |
| **Domain expertise** | Embedded in question banks, project summaries | Structured knowledge accessible to agents |

---

## High-Value Use Cases

### Internal (Team Productivity)

1. **AI-Assisted Diligence Prep** — Claude/Copilot connects to an MCP server exposing the diligence engine. Reid describes a deal ("$40M healthcare SaaS, buy-side, HIPAA concerns") and gets a tailored diligence agenda without opening the website. Saves time, works from any AI tool.

2. **Portfolio Pattern Matching** — "Show me all engagements similar to this deal" queries against the portfolio data. An agent could surface relevant past projects during deal evaluation.

3. **Radar Intelligence in Context** — Instead of checking the Radar page manually, an AI assistant pulls relevant articles while working on a deal memo or client presentation.

### External (Client/Market-Facing)

4. **MCP-as-Differentiator** — GST could offer PE firms an MCP endpoint: their AI tools connect to GST's diligence engine directly. This is a genuine competitive moat — most boutique advisory firms have nothing like this.

5. **Agent-Ready Due Diligence** — As PE firms adopt AI agents for deal screening, a GST MCP server could be the "plug-in" that adds technical diligence intelligence to their workflow. Think: an AI agent evaluating a deal autonomously queries GST's tools for red flags.

6. **MCP Marketplace Presence** — Listing in MCP directories (MCPMarket.com, etc.) creates visibility among technically sophisticated buyers — exactly GST's target market.

---

## Architecture Options

### Recommended: Cloudflare Worker (separate service)

The Astro static site stays untouched. The MCP server runs independently:

```
gst-website (Astro/Vercel)     gst-mcp-server (Cloudflare Worker)
├── Static pages                ├── tools/
├── Radar (ISR)                 │   ├── generate_diligence_agenda
└── Portfolio page              │   ├── search_portfolio
                                │   ├── get_radar_insights
                                │   └── get_engagement_stats
                                └── resources/
                                    ├── portfolio_schema
                                    └── industry_taxonomy
```

- No changes to existing site infrastructure
- Cloudflare Workers free tier handles prototype volume easily
- Global edge deployment = low latency worldwide
- OAuth 2.1 for external clients, API keys for internal use

### Alternative: Vercel with Next.js adapter

More tightly coupled, requires adding Next.js, but keeps everything on one platform. Vercel's `@vercel/mcp-adapter` package handles transport negotiation. Requires Upstash Redis for stateful SSE connections.

---

## Key Considerations

### Security (Critical)

- The diligence engine and portfolio data are proprietary IP — OAuth 2.1 with PKCE is mandatory for any external exposure
- Tool outputs must be sanitized against prompt injection (72.8% attack success rate on leading models per recent research)
- Rate limiting essential — don't let agents hammer the Inoreader API through the Radar tools
- Audit logging every tool invocation for compliance-sensitive PE clients

### Effort & Complexity

- Internal-only MCP server: **1-2 days** with TypeScript SDK — just wrapping existing functions
- External/public MCP server: **1-2 weeks** — adds OAuth, rate limiting, multi-tenancy, monitoring
- The diligence engine (`src/utils/diligence-engine.ts`) and filter logic (`src/utils/filterLogic.ts`) are already pure functions — they port to MCP tools with minimal refactoring

### What's NOT Worth MCP-ifying

- Static page content (About, Services) — no structured query value
- Calendly scheduling — already has its own integration path
- Analytics data — internal only, better accessed via GA4 directly

---

## Technology Requirements

### Official TypeScript SDK

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({ name: "gst-server", version: "1.0.0" });

server.registerTool("generate_diligence_agenda", {
  description: "Generate a custom M&A technical diligence agenda",
  inputSchema: {
    industry: z.string(),
    dealSize: z.string(),
    engagementType: z.string(),
    concerns: z.array(z.string()).optional(),
  },
  handler: async ({ industry, dealSize, engagementType, concerns }) => {
    // Wraps existing diligence-engine.ts logic
    const agenda = await generateAgenda({ industry, dealSize, engagementType, concerns });
    return { content: [{ type: "text", text: JSON.stringify(agenda) }] };
  }
});
```

### Transport Mechanisms

| Transport | Use Case | Auth |
|---|---|---|
| **Stdio** | Local/internal — Claude Desktop, VS Code | Environment variables |
| **Streamable HTTP** | Remote/external — client AI agents over internet | OAuth 2.1 with PKCE |

### Hosting Comparison

| Platform | Pros | Cons |
|---|---|---|
| **Cloudflare Workers** | Free tier, global edge, fast cold starts, OAuth support | Separate infrastructure from Vercel |
| **Vercel + Next.js** | Same platform as site, official adapter | Requires Next.js, adds complexity |
| **AWS Lambda** | Enterprise-grade, existing AWS infra | Higher setup cost, cold starts |

---

## Strategic Assessment

| Factor | Verdict |
|---|---|
| **Technical feasibility** | High — existing code is well-structured for wrapping as tools |
| **Internal value** | Moderate — useful but small team, marginal time savings |
| **External value** | **High** — differentiator in a market where PE firms are adopting AI agents rapidly |
| **Competitive moat** | Strong — boutique advisory + AI-native tooling is rare |
| **Risk** | Low if internal-only; moderate if public (security surface) |
| **Effort** | Low for prototype; moderate for production-grade |

---

## Recommendation

**Start internal, graduate to external.** Build a lightweight MCP server exposing the diligence engine and portfolio search as a Cloudflare Worker. Use it internally with Claude Code/Desktop for a few weeks. Once validated, add OAuth and offer it to select PE clients as a pilot. The diligence engine as an MCP tool is the strongest value proposition — it turns GST's methodology into an agent-consumable service, which is a genuinely novel offering in the M&A advisory space.

### Phased Rollout

1. **Phase 1 — Internal Prototype (1-2 days)**
   - Stdio transport, local only
   - Expose `generate_diligence_agenda` and `search_portfolio` tools
   - Test with Claude Desktop and Claude Code

2. **Phase 2 — Internal Remote (1 week)**
   - Deploy to Cloudflare Worker
   - API key auth for team use
   - Add Radar intelligence tools

3. **Phase 3 — External Pilot (2 weeks)**
   - OAuth 2.1 with PKCE
   - Rate limiting, audit logging
   - Offer to select PE clients
   - List in MCP directories

---

## References

- [Model Context Protocol — Architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Vercel MCP Adapter](https://github.com/vercel/mcp-handler)
- [Cloudflare Workers MCP Guide](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)
- [MCP Security Best Practices — Docker](https://www.docker.com/blog/mcp-security-explained/)
- [OAuth 2.1 for MCP — Stack Overflow Blog](https://stackoverflow.blog/2026/01/21/is-that-allowed-authentication-and-authorization-in-model-context-protocol)
