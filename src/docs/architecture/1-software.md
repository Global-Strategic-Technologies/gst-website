# Layer 1 — Software architecture (the foundation)

> Per the article: the engineering principles and patterns governing how code is organized, how components communicate, and how the system behaves under real conditions. It determines whether the higher layers' choices are achievable or aspirational, and it is the common source of hidden cost in acquisitions. Business meaning: developer productivity, defect rates, cost of change, security exposure.

The detail for the server half of this layer lives in [ARCHITECTURE.md](../../../mcp-server/src/docs/ARCHITECTURE.md). This file draws three views that span both halves.

## The estate map

One repository, two npm workspaces, two platforms, one shared core.

```mermaid
flowchart LR
  subgraph repo["gst-website (one repo, npm workspaces)"]
    direction TB
    subgraph site["Website workspace — Astro"]
      pages["src/pages + src/page-templates<br/>static routes, one template per route"]
      comps["src/components"]
      i18n["src/i18n<br/>catalogs, locale registry"]
    end
    subgraph core["Shared core (website workspace, consumed by both)"]
      schemas["src/schemas<br/>Zod input schemas"]
      engines["src/utils<br/>TechPar · ICG · Tech Debt · IRL engines"]
      data["src/data<br/>portfolio · regulatory map · library"]
    end
    subgraph server["MCP server workspace — @gst/mcp-server"]
      tools["src/tools · prompts · resources"]
      auth["src/oauth · auth"]
      gen["src/content/*.generated.ts<br/>bundles built from src/data"]
    end
  end
  pages --> comps
  pages --> i18n
  pages --> engines
  tools --> schemas
  tools --> engines
  gen -. "generated from, freshness-guarded" .-> data
  site ==> vercel["Vercel<br/>static output"]
  server ==> worker["Cloudflare Worker<br/>mcp.globalstrategic.tech"]
```

What the map is saying:

- **The engines are written once.** A Hub tool page in the browser and the same tool over MCP run the same `src/utils` module against the same `src/schemas` contract ([ADR-0025](../adr/0025-irl-extraction-in-the-browser.md) is the canonical instance: the IRL extractor's pure core moved _into_ the website workspace so both could import it).
- **Structured data crosses the boundary by generation, not import.** The Worker cannot read `src/data` at runtime, so the regulation corpus and library articles are compiled into `*.generated.ts` bundles; `test:docs` fails when a bundle is stale.
- **The server's own layout** — register-once/transport-twice, the request pipeline, the SDK choice — is [ARCHITECTURE.md § System shape](../../../mcp-server/src/docs/ARCHITECTURE.md#system-shape) and [§ Remote transport](../../../mcp-server/src/docs/ARCHITECTURE.md#remote-transport--request-flow); it is not redrawn here.

## Request paths across the estate

Two kinds of caller, two platforms, and one place they touch.

```mermaid
flowchart LR
  browser["Browser"]
  llm["MCP client<br/>(claude.ai, Claude Desktop, code)"]

  subgraph vercel["Vercel"]
    static["Static pages<br/>(+ headers from vercel.json)"]
    ssr["SSR routes<br/>(Radar; middleware mirrors the headers)"]
  end

  subgraph cf["Cloudflare Worker"]
    fetch["fetch handler<br/>hostname split · public routes · OAuth surface · authenticate · rate-limit · MCP"]
    stores[("KV · Upstash · Analytics Engine")]
  end

  browser --> static
  browser --> ssr
  browser -- "trial signup, connector consent" --> fetch
  llm -- "streamable HTTP, one POST per call" --> fetch
  fetch --> stores
  ssr -- "narrow-scope radar key" --> fetch
```

- The website is static except for the Radar routes, which render server-side and call the Worker with a narrow-scope bearer — the only server-to-server path in the estate.
- Browsers reach the Worker directly only for the self-serve trial and the OAuth consent page, which is why the Worker owns its own CORS policy ([ADR-0013](../adr/0013-mcp-2026-07-28-modern-only-worker.md)) and the website's CSP allows the Worker origins.
- Everything after the Worker's `fetch` is [ARCHITECTURE.md § Request pipeline](../../../mcp-server/src/docs/ARCHITECTURE.md#remote-transport--request-flow).

## The three auth paths, as a routing decision

[ARCHITECTURE.md § Auth](../../../mcp-server/src/docs/ARCHITECTURE.md#auth-cors--deploy-topology) explains each path; this is only how a request is routed to one of them.

```mermaid
flowchart TD
  req["Request to the Worker"] --> pub{"Public route?<br/>/health · /server.json · metadata"}
  pub -- yes --> serve["Serve, no auth"]
  pub -- no --> oauth{"OAuth surface?<br/>/authorize · /token · /admin/oauth"}
  oauth -- "POST /token, client_credentials" --> m2m["M2M path<br/>client record in KV → self-contained JWT"]
  oauth -- "other grants" --> lib["Embedded OAuth 2.1 server<br/>PKCE, consent, KV-backed"]
  oauth -- no --> bearer{"Authorization: Bearer"}
  bearer -- "MCP_KEY_* static key" --> k1["Static bearer<br/>keyOwner = key suffix"]
  bearer -- "mcp_m2m_* token" --> k2["M2M JWT<br/>verified with no I/O; tier in the claim"]
  bearer -- "OAuth access token" --> k3["OAuth token<br/>looked up in KV"]
  k1 --> scopes["Same scope strings, same denial code, on all three"]
  k2 --> scopes
  k3 --> scopes
  scopes --> rl["Rate limit by keyOwner and tier"] --> mcp["MCP server built per request"]
```

The one structural fact worth keeping at this altitude: the M2M token carries its tier and is verified without a store read, because KV's cross-location visibility is on the order of a minute and a per-request lookup would have made that window part of every call ([ADR-0008](../adr/0008-mcp-oauth-embedded-authorization-server.md), [ADR-0010](../adr/0010-per-client-rate-limit-tiers.md), [ADR-0036](../adr/0036-client-records-stay-in-kv.md)).

## Where this layer is bound

| Concern                                  | Authoritative                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server system shape, transport, pipeline | [ARCHITECTURE.md](../../../mcp-server/src/docs/ARCHITECTURE.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Tool input contracts                     | [mcp-server/src/docs/tools/README.md](../../../mcp-server/src/docs/tools/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Website tooling and validation sequence  | [DEVELOPER_TOOLING.md](../development/DEVELOPER_TOOLING.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Locale model                             | [LOCALIZATION.md](../development/LOCALIZATION.md), [ADR-0030](../adr/0030-website-locale-model.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ADRs                                     | [0001](../adr/0001-stage-taxonomy-adapter.md) · [0004](../adr/0004-hub-surface-resources-import-restriction.md) · [0005](../adr/0005-hub-url-state-deeplink-contract.md) · [0011](../adr/0011-tool-response-channel-policy.md) · [0013](../adr/0013-mcp-2026-07-28-modern-only-worker.md) · [0019](../adr/0019-irl-extract-record-subject-indexing.md) · [0020](../adr/0020-workers-types-global-shadowing-immunity.md) · [0021](../adr/0021-irl-fill-d-cell-sourcing-grammar.md) · [0025](../adr/0025-irl-extraction-in-the-browser.md) · [0030](../adr/0030-website-locale-model.md) |
