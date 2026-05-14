# MCP Server — Claude Desktop Demo + OpenClaw Cherry (BL-032.6)

> **Status**: 🚧 **WORKING DOCUMENT — UNDER ITERATION**
>
> **Purpose**: design + scope the BL-032.6 initiative before it lands in [BACKLOG.md](./BACKLOG.md). This file is the iteration surface; once requirements stabilize, the canonical entry moves to BACKLOG.md and this doc becomes the design companion (analogous to [`MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md`](./MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) for BL-032.5).
>
> **Authored**: 2026-05-13 alongside session that closed BL-032.5 + BL-039 (PR #134, PR #135).
>
> **Owner**: RP (operator + stakeholder)
>
> **Companion docs**:
>
> - [BACKLOG.md](./BACKLOG.md) — where the finalized entry will land (between BL-032.5 and BL-032.75)
> - [BL-032_5_TESTING_FINDINGS.md](./BL-032_5_TESTING_FINDINGS.md) — soak evidence showing what BL-032.6 will be demoing
> - [REMOTE_CLIENT_SETUP.md](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) — system-prompt addendum + per-client setup patterns (the OpenClaw agent prompts will be derivatives of this)
> - [MCP_SERVER_REMOTE_BL-032.md](./MCP_SERVER_REMOTE_BL-032.md) — substrate architecture (what we're demoing)

---

## 1. Why this initiative now

BL-032.5 + BL-039 closed the substrate's last functional gap. The GST MCP surface (12+ Tools, 6+ Resources, 8 Prompts) is now production-deployed at `mcp.globalstrategic.tech` with autonomous OAuth refresh. **What's missing is a stakeholder-grade demonstration of what this capability actually enables.**

### Two demo targets, in order of priority

**Primary — Claude Desktop direct integration.** This is the load-bearing piece of the demo because:

1. **Already T.K-verified end-to-end against production** (T.K.1 + T.K.2 in [BL-032_5_TESTING_FINDINGS.md](./BL-032_5_TESTING_FINDINGS.md) — Library Resource pinning + Radar Resource pinning both PASS with GST-Take voice)
2. **Familiar UI** — stakeholders already know Claude. No new mental model to absorb.
3. **Live-demoable in real time** — open Claude Desktop, type a prompt, watch tool calls happen visibly. No build step, no orchestration framework to explain first.
4. **Zero additional configuration** — the `gst-mcp` connector is already wired in production. The demo runs against the same endpoint pilot clients would use post-BL-033.

**Cherry on top — OpenClaw autonomous agent loop.** Closes the demo with "and look what you can build on top of this":

1. **Native streamable-HTTP MCP support** — matches BL-032's transport exactly, no adapter shim needed
2. **Native bearer-token auth** — matches our `MCP_KEY_*` model
3. **Per-agent MCP-server assignment** — multi-agent autonomous orchestration without engineering work
4. **Mature ecosystem** — 100K+ GitHub stars, 44k+ ClawHub skills, production deployments in autonomous trading. (Sources: [OpenClaw 2026 framework overview](https://www.clawbot.blog/blog/openclaw-the-ai-agent-framework-explained-april-2026-update/), [OpenClaw MCP integration docs](https://docs.openclaw.ai/cli/mcp))

The OpenClaw segment is the "what does autonomy on top look like" punctuation, not the main meal. If a live OpenClaw run fails on stage, the demo's core value (Claude-driven scenarios) is unaffected.

---

## 2. Draft initiative spec

> This is the **first-cut** that will land in BACKLOG.md once refined. Tracked questions below.

### Source / Status / Effort / Depends on

- **Source**: BL-032.6 — natural "showcase the substrate" milestone after BL-032.5 + BL-039 delivered the full Tools/Resources/Prompts surface on production
- **Effort**: 2-4 days target — Claude-driven scenarios (the load-bearing demos) take ~1 day to script + dry-run since the connector is already wired; OpenClaw "cherry" segment adds ~1 day setup + scenario scripting; stakeholder prep (slides, FAQ, dry-run) is ~1 day; ~1 day buffer for unexpected polish. **The OpenClaw segment is optional-but-recommended — if it slips, demo still ships**
- **Status**: Open · Demo + evangelism · 🚧 requirements iterating
- **Depends on**: BL-031.5, BL-031.75, BL-032, BL-032.5, BL-039 (all delivered)

### User story

**As a** GST partner / business stakeholder, **I want** to see the GST MCP capabilities demonstrated live in Claude Desktop on common consultant workflows (sales-call-to-diligence-agenda, cross-jurisdictional regulatory review, market briefing) — and then witness an autonomous OpenClaw agent loop on top as a glimpse of where this can go — **so that** I can:

1. Understand the operational reach of what's already been built and shipped to production
2. Form a concrete opinion on which scenarios are worth productizing as customer-facing workflows
3. Probe "what else could this be used for?" by interacting with the system live
4. Distinguish "what works in Claude today" from "what's possible with agent orchestration on top" — two different value propositions

### What we're showcasing

The full GST MCP surface delivered through BL-031.5 → BL-031.75 → BL-032 → BL-032.5 → BL-039:

- **12+ Tools**: portfolio search, radar (FYI + Wire tiers), regulations, ICG, TechPar, tech-debt estimation, diligence agenda
- **6 Resource URIs**: Library articles (`gst://library/*`), Regulations (`gst://regulations/*`, 120+ files), Radar snapshots (6 URIs across FYI + Wire tiers)
- **8 GST consultant Prompts** (`gst_*`): VDR audit, target quick-look, diligence kickoff/handoff, architecture review, radar brief, regulatory brief, comparable engagements
- **Production-grade substrate**: bearer auth, per-key rate limits, OAuth self-heal (BL-039), Cron-pre-warmed radar cache, Sentry observability

### Proposed demo scenarios

The demo is structured as **5 scenarios** arranged to escalate complexity while keeping operator friction low — calibrated for a Managing Director audience (Q2 locked):

| #   | Mechanism                          | Title                            | Time          |
| --- | ---------------------------------- | -------------------------------- | ------------- |
| 1   | Claude Desktop (organic)           | Sales call → Diligence agenda    | 5 min ⭐ LEAD |
| 2   | Claude Desktop (Resources pinning) | Cross-jurisdictional deal review | 7 min         |
| 3   | OpenClaw single-agent (teaser)     | Radar pull on command            | 5 min         |
| 4   | Claude Desktop (open-ended)        | "What else?" interactive         | open          |
| 5   | OpenClaw multi-agent (cherry)      | Autonomous diligence triage      | 5-7 min 🍒    |

The shape is intentional: scenario 1 sells the LLM understanding (prose → tool call); scenario 2 sells the Resource pinning + citation grounding; **scenario 3 plants the seed that "agents can do this on command"** ahead of scenario 5's full multi-agent payoff; scenario 4 keeps stakeholders interacting; scenario 5 closes the loop.

**Dropped from earlier revisions** (per Rev 5 feedback): the "Full diligence walkthrough via 5 prompt invocations" scenario was too form-fill-heavy for an MD audience — the manual data entry across 5 stages doesn't feel effortless on stage. Scenario 1's single-invocation arc already proves the prompt-with-args path; scenario 5's autonomous fan-out shows the same workflow taken to the next level. The middle ground (human-driven multi-stage) is the worst of both worlds for this audience.

#### Scenario 1 — Sales call → Diligence agenda (Claude Desktop, 5 min) ⭐ LEAD DEMO

The most realistic, immediately-grokkable workflow we can show. Takes captured sales-call notes and produces a structured initial diligence agenda — the exact thing a partner does manually in their head between an intro call and tasking a junior associate.

- **Setup**: Demonstrator has Claude Desktop open with the `gst-mcp` connector. The pre-staged MedSig Health intro-call notes (below) live in a clipboard / sticky note for fast paste-in.
- **Pre-staged call notes** (synthetic but realistic — engineered to map cleanly to the 14-dimension `gst_diligence_kickoff` input shape; see § 1.A below for the input-mapping table):

  ```
  Sales-call notes — MedSig Health intro (2026-05-13, 30 min Zoom)

  - COO: Christina Reyes (ex-Cerner). She drove the call agenda.
  - Product: unified RCM platform for European hospital networks —
    claims management, denial appeals, payment posting all in one workflow
  - Stage: Series-B (closed late 2024, lead investor Atomico)
  - Revenue: ~€22M ARR (€20-23M she said); growing "north of 60%" YoY
  - Geography: EU only today — Germany, France, Netherlands, Iberia.
    "We're talking to two NHS trusts but nothing signed"
  - Customers: hospital networks + large physician groups; B2B contracts,
    multi-year, ~70-80 customers ranging from 200-bed regional hospitals
    to multi-site groups with 5k+ providers
  - Stack: "fully modern, cloud-native" (her words) — couldn't pin down
    specifics; said something about AWS Frankfurt but wouldn't go deeper
  - Data: handles claims with PHI for every European patient touched;
    explicitly mentioned GDPR + Germany's BDSG and France's CNIL guidance
  - Engagement ask: technical due diligence advisory for an "upcoming
    round" — wouldn't disclose if Series-C raise, sale, or strategic
    investor; said "we're talking to two other advisory firms"
  - Asked us to send a 1-page diligence agenda before tomorrow's 9am
    pipeline review
  - Vibes: COO confident but evasive on infra specifics. PE-pattern flag:
    companies that won't talk infra in an intro call usually have
    something they're sandbagging on
  ```

- **Input prompt** (typed live into Claude Desktop after pasting the notes):

  > _"I just had an intro call with MedSig Health (notes above). Partner needs a 1-page diligence agenda before tomorrow's 9am pipeline review. Use the `gst_diligence_kickoff` prompt with the target name 'MedSig Health' and whatever dimensions you can confidently derive from the notes. Leave the rest as `'unknown'` — don't guess."_

- **Invocation mechanism**: **organic / natural-language** — the demonstrator does NOT click through Claude Desktop's `+` → Prompts menu. Instead, the input prompt above references `gst_diligence_kickoff` by name in prose; Claude infers the prompt + args from chat context and calls `prompts/get` under the hood with the args derived per § 1.A. The magic moment is Claude **translating prose into a structured tool call** — that's what makes this the lead demo. (Claude Desktop also supports clicking through `+` → Prompts → form-fill, but that path adds friction; we use it only when needed — see scenario 4 verification mechanisms for the failure-case fallback.)
- **What Claude does** (live, visible in the UI):
  1. Reads the call notes + the natural-language invocation in the input prompt
  2. Calls `prompts/get` for `gst_diligence_kickoff` with inferred args (`targetName='MedSig Health'`, plus the 13 dimensions per § 1.A — Claude reasons over the notes to derive populated fields and leaves the rest as `'unknown'`)
  3. The Prompt orchestrates `generate_diligence_agenda` (Tool call rendered in chat with input args visible to stakeholders)
  4. The Prompt also auto-embeds the `gst://library/vdr-structure` Library article for VDR-folder grounding (per the Prompt's `orchestrates: [...]` field)
  5. Output: structured 1-page kickoff memo in GST house style, with:
     - "Low-confidence baseline" callout firing because 7-of-13 dimensions were `'unknown'` (the Prompt's `unknownDimensions >= 7` branch — [diligence-kickoff.ts:79-81](../../../mcp-server/src/prompts/diligence-kickoff.ts#L79))
     - Target context paragraph anchoring the engagement
     - Prioritized agenda by topic
     - Surfaced attention areas
     - VDR-folder requests using verbatim labels from the embedded Library article
     - **"Open Diligence Wizard" deeplink** — clickable URL to the hub's Diligence Machine, pre-populated with the same dimensions (BL-031.95 Phase 2 deeplink-with-`'unknown'` support)

- **Showcase**:
  - **The most common partner workflow** — sales call to junior-associate handoff — compressed from ~30 min of manual structuring into ~60 seconds
  - **Honest about gaps** — the "Low-confidence baseline" callout shows the agenda is built from sparse intro-call signal (6-of-13 dimensions populated, 7 deferred to `'unknown'`). That's exactly correct behavior; calling it out builds stakeholder trust in the tooling.
  - **Tool/prompt invocation visible** — stakeholders see Claude actually _using_ the GST tooling (Prompt form fields, Tool call, embedded Library article)
  - **Hub deep-link continuity** — stakeholder clicks "Open Diligence Wizard" → lands on the live website, pre-populated → continues editing in the hub UI. Proves MCP ↔ hub round-trip (the BL-031.95 deliverable).

- **Live-demo failure modes & fallbacks**:
  - If `gst_diligence_kickoff` returns a Zod error on input — restart with simpler note text or explicitly cast suspect fields (e.g., `geographies: ['eu']`); Claude's framing will adjust
  - If the network blips — production `/health` is shown as the recovery proof; rerun the prompt (BL-039 covers transient token-stale)
  - Backup: pre-recorded screencap of a successful run, queued for cold-failure scenarios

##### § 1.A — Input-mapping table (which dimensions the call notes populate vs defer)

The MedSig Health notes are engineered to populate **6 of 13** typed dimensions and defer **7 to `'unknown'`** — landing exactly at the threshold (`>= 7`) that triggers the prompt's "Low-confidence baseline" callout. This makes the demo show both halves of the system's honesty pattern: confident propagation where signal exists, conservative widening where it doesn't.

| Dimension             | Value from notes       | Confidence | Source line in notes                                                                                                                      |
| --------------------- | ---------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `targetName`          | `MedSig Health`        | high       | explicit                                                                                                                                  |
| `productType`         | `b2b-saas`             | high       | "unified RCM platform for European hospital networks", "B2B contracts"                                                                    |
| `revenueRange`        | `5-25m`                | high       | "~€22M ARR" (€22M ≈ $24M, lands in the 5-25m band)                                                                                        |
| `growthStage`         | `scaling`              | high       | "Series-B (closed late 2024)" + "growing north of 60% YoY"                                                                                |
| `geographies`         | `["eu"]`               | high       | "EU only today — Germany, France, Netherlands, Iberia"                                                                                    |
| `businessModel`       | `productized-platform` | high       | "unified RCM platform" + "B2B contracts, multi-year" + ~70-80 customers on the same product                                               |
| `dataSensitivity`     | `high`                 | high       | "PHI for every European patient touched" + GDPR/BDSG/CNIL explicit                                                                        |
| `transactionType`     | `'unknown'`            | —          | "wouldn't disclose if Series-C raise, sale, or strategic investor" — explicitly evasive                                                   |
| `techArchetype`       | `'unknown'`            | —          | "claims modern, cloud-native — couldn't pin down specifics" — claim unverified                                                            |
| `headcount`           | `'unknown'`            | —          | not mentioned                                                                                                                             |
| `companyAge`          | `'unknown'`            | —          | Series-B closed late 2024 implies ~3-6 yrs but the agent should defer rather than guess                                                   |
| `scaleIntensity`      | `'unknown'`            | —          | not directly stated; could be inferred but agent should defer                                                                             |
| `transformationState` | `'unknown'`            | —          | she claimed "modern" but unverified; deferring is the correct call (per Prompt body Step 1: "only known values should narrow the agenda") |
| `operatingModel`      | `'unknown'`            | —          | not mentioned (engineering org structure wasn't discussed)                                                                                |

**Unknown count: 7 of 13** → the Prompt's `unknownDimensions >= 7` branch fires the "Low-confidence baseline" callout — the demo gets the most authentic version of the agenda for an intro-call context.

If during the demo Claude opts to derive `companyAge` ('5-10yr' is a defensible read from "Series-B closed late 2024" → typically ~4-7 years founded), the count drops to 6 and the callout suppresses. Both paths are legitimate outcomes; both make for a credible demo. **The point of the engineered scenario is showing the threshold mechanism working, not pinning it to a specific count.**

##### § 1.B — Architecture under the hood (demonstrator narration reference)

This section is the **narration cheat-sheet** for when stakeholders ask _"so what's actually happening when Claude does that?"_ Read top-to-bottom; each block is a phrase you can speak verbatim while pointing at the relevant moment in the Claude Desktop UI.

###### Wire-level call sequence — Claude Desktop ↔ GST MCP Worker

Three round-trips happen over the Streamable HTTP transport (single TCP-connection-per-request; bearer-authenticated):

```
       Claude Desktop                              GST MCP Worker
            │                                  (mcp.globalstrategic.tech/mcp)
            │                                            │
   ① At connector load (once per session):               │
            ├─── POST initialize ─────────────────────►  │  auth: MCP_KEY_RP bearer
            │                                            │  registers: 12 Tools + 8 Prompts + ~130 Resources
            │ ◄──── capabilities ────────────────────────┤
            │                                            │
   ② User submits the input prompt:                      │
       (Claude infers "use gst_diligence_kickoff")       │
            ├─── POST prompts/get ─────────────────────► │  prompt name + 14 inferred args
            │     name: gst_diligence_kickoff            │  → diligenceKickoffPrompt.build(args)
            │     args: {targetName, 13 dimensions}      │  → returns 2 messages:
            │                                            │      msg-1: instruction text w/ args inlined
            │ ◄──── { messages: [msg-1, msg-2] } ────────┤      msg-2: EmbeddedResource (VDR Library article)
            │                                            │
   ③ Claude reads the messages, then issues:             │
            ├─── POST tools/call ──────────────────────► │  tool name + structured args
            │     name: generate_diligence_agenda        │  → handleDiligenceTool(inputs)
            │     args: {13 typed dimensions}            │  → calls generateScript() — the shared engine
            │                                            │  → countUnknownDimensions()
            │                                            │  → buildDiligenceDeeplink()
            │ ◄──── { agenda, unknown count, deeplink } ─┤
            │                                            │
   ④ Claude composes the 1-page memo using:              │
      msg-1's section template +                         │
      msg-2's VDR taxonomy +                             │
      tools/call response                                │
            │                                            │
```

**Talking points keyed to each round-trip**:

- **① initialize** — _"When Claude Desktop opened, it shook hands with our MCP server once. From that moment, Claude knows the names + input shapes of all 12 GST tools, all 8 GST prompt workflows, and all 130-odd Resources. The bearer key over there is what attributes everything you're about to see to me — every call shows up in our logs tagged `keyOwner=RP`."_
- **② prompts/get** — _"That's not Claude calling a tool yet — that's Claude asking our server "what does the `gst_diligence_kickoff` workflow want me to do?" The server returns a templated set of instructions PLUS our canonical VDR-folder taxonomy embedded inline. Claude didn't have to make a separate call to fetch the taxonomy — we ship it bundled with the prompt response so it can't accidentally substitute a generic one from its training data."_
- **③ tools/call** — _"Now Claude calls our actual diligence engine — same code path that powers the website's [Diligence Machine](https://globalstrategic.tech/hub/tools/diligence-machine) wizard. It returns a structured JSON payload: the topic-grouped agenda, the attention areas, an unknown-dimensions count, and a deeplink URL that opens the wizard pre-populated with the same inputs."_
- **④ memo composition** — _"Claude then assembles the final 1-page memo using the prompt template from step 2, the VDR taxonomy from step 2, and the engine output from step 3. That's why it reads in our house voice — the prompt instruction layer enforces that, not Claude's general training."_

###### Worker-internal pipeline (steps ② + ③ in detail)

When the Worker receives `prompts/get` or `tools/call`, the request flows through the same auth + scope + rate-limit pipeline before it reaches the prompt or tool handler:

```
HTTP request
   ↓
auth gate (compare bearer against MCP_KEY_* secrets) ── [mcp-server/src/auth/bearer.ts]
   ↓ keyOwner attribution attached
scope check (assert resource:* / tool:* / prompt:* scope) ── [mcp-server/src/auth/scopes.ts]
   ↓
rate-limit decrement (per-key 5/min radar; default tier for diligence) ── [mcp-server/src/ratelimit/limiter.ts]
   ↓
circuit-breaker check (Inoreader breaker; not load-bearing for diligence) ── [mcp-server/src/ratelimit/circuit-breaker.ts]
   ↓
SDK dispatch → MCP method handler
   ├─ prompts/get → diligenceKickoffPrompt.build(args) ── [mcp-server/src/prompts/diligence-kickoff.ts]
   │                  ↓
   │              embedLibraryArticle('gst://library/vdr-structure')  ── [mcp-server/src/prompts/embed.ts]
   │                  ↓
   │              loadLibraryByUri()  ── [mcp-server/src/content/library-loader.ts] (codegen index, built at npm run prebuild)
   │                  ↓
   │              returns { messages: [instruction-text, EmbeddedResource] }
   │
   └─ tools/call(generate_diligence_agenda) → handleDiligenceTool(inputs) ── [mcp-server/src/tools/diligence.ts]
                  ↓
              generateScript(inputs) ── [src/utils/diligence-engine.ts:417]  ◄── SAME ENGINE AS THE HUB UI
                  ↓
              countUnknownDimensions(inputs) ── [mcp-server/src/tools/diligence.ts:61]
                  ↓
              buildDiligenceDeeplink(inputs)
                  ↓
              serializeToParams(inputs) ── [src/utils/diligence-url.ts:67]  ◄── SAME URL ENCODER AS THE HUB UI
                  ↓
              returns { ...agenda, unknownDimensionCount, deeplink }
```

###### The shared-engine architecture — the key story for the demo

This is the line that lands hardest with a stakeholder who's seen too many "AI-wrapper" demos. **The MCP server doesn't reimplement the diligence logic — it imports the exact same `generateScript()` function the hub wizard imports**:

| Surface                | What it does                                                      | Code path                                                                                |
| ---------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Hub wizard** (web)   | User fills 13-dim wizard → JS calls `generateScript()` in-browser | [`src/utils/diligence-engine.ts:417`](../../../src/utils/diligence-engine.ts#L417)       |
| **MCP tool** (Claude)  | Claude calls `tools/call` → handler calls the **same** function   | [`mcp-server/src/tools/diligence.ts:98`](../../../mcp-server/src/tools/diligence.ts#L98) |
| **Deeplink URL state** | Hub wizard restores from URL; MCP builds the same URL on response | [`src/utils/diligence-url.ts:67`](../../../src/utils/diligence-url.ts#L67) (encoder)     |

**Demonstrator phrasing**: _"This isn't a chatbot that learned how to do diligence. This is the same code module that powers the website wizard — `src/utils/diligence-engine.ts`. Claude is calling a function. The function returns a structured agenda. Claude composes a memo around it. Two different surfaces — the hub wizard and the MCP — share one engine. That's why the agenda Claude just generated is byte-for-byte identical to what you'd get if you typed these same dimensions into the wizard yourself."_

This is also why the **deeplink round-trip works**: the same `serializeToParams()` encoder builds the URL state on the MCP side and parses it on the hub side. Click the deeplink at the end of the memo, land in the hub wizard with all 13 dimensions (including the 7 `'unknown'` sentinels) pre-populated.

###### Reading order for the demonstrator

If you have 30 seconds to articulate the architecture mid-demo, use this:

> _"Three things happened. One — Claude asked our server for the prompt template, and got back a templated workflow plus our canonical VDR taxonomy embedded inline. Two — Claude called our diligence tool, which runs the same engine that powers the hub wizard you can see on the website. Three — Claude composed the memo using the template plus the tool output. The deeplink at the bottom opens the hub wizard with these same inputs pre-populated, because both surfaces share one URL encoder. The MCP isn't a parallel implementation; it's the conversational surface of the same engines you already use."_

If you have 5 seconds: _"Same engine as the hub wizard, Claude on top, with our prompt template enforcing the GST voice."_

#### Scenario 2 — Cross-jurisdictional deal review (Claude Desktop, 7 min)

- **Input**: hypothetical target operating in EU + US-CA + UK
- **Operator manually pins** `gst://regulations/eu/gdpr`, `gst://regulations/us-ca/ccpa`, `gst://regulations/uk/dpa-2018` as Resources in Claude Desktop (the UI shows them as pinned-resource pills — visible signal)
- **Prompt** (typed live): _"Using only the pinned regulations, generate a compliance-risk matrix for this target..."_
- **Output**: cross-jurisdictional risk matrix with verbatim citations to pinned Resource content
- **Showcase**: BL-032.5 Resources-over-HTTP, cross-jurisdictional pinning (a core BL-032.5 deliverable), citation grounding to prevent hallucinated regulatory text

##### § 2.A — Architecture under the hood (Resources path)

The story arc for Scenario 2 is **citation grounding**: the model never has to "remember" GDPR text — we hand it verbatim regulation content via the Resources primitive and tell it to reason over what we handed it. Here's what happens at the wire level.

###### Wire-level call sequence — Resource pin → query

Two distinct phases. Pin-time fetches happen once per session per Resource; the prompt-time call has no `resources/read` activity because the content is already in Claude's conversation context.

```
       Claude Desktop                              GST MCP Worker
            │                                  (mcp.globalstrategic.tech/mcp)
            │                                            │
   ① initialize (once per session, same as Scenario 1)   │
            ├─── POST initialize ─────────────────────►  │
            │ ◄──── capabilities (incl. ~130 Resources) ─┤
            │                                            │
   ② Operator clicks the + → Resources → picks 3 URIs:   │
      gst://regulations/eu/gdpr                          │
      gst://regulations/us-ca/ccpa                       │
      gst://regulations/uk/dpa-2018                      │
            │                                            │
            ├─── POST resources/read (uri 1) ──────────► │  assertScope(RESOURCE_REGULATION_READ)
            │ ◄──── { contents: [...GDPR text...] } ─────┤  readThroughCache(env, uri, 24h TTL)
            │                                            │  → loadRegulationByUri(...) (codegen)
            ├─── POST resources/read (uri 2) ──────────► │
            │ ◄──── { contents: [...CCPA text...] } ─────┤
            ├─── POST resources/read (uri 3) ──────────► │
            │ ◄──── { contents: [...DPA-2018 text...] } ─┤
            │                                            │
            │  Claude renders each URI as a pinned "pill"
            │  above the chat input — verbatim content
            │  now lives in Claude's conversation context
            │                                            │
   ③ User types the query — NO new MCP calls fire:       │
      "Using only the pinned regulations, generate
       a compliance-risk matrix..."                      │
            │                                            │
      Claude reasons over the pinned content (already    │
      cached client-side) + composes the risk matrix.    │
            │                                            │
```

**Talking points keyed to each step**:

- **② resources/read** (three times) — _"When I click the + menu and pin a regulation, Claude Desktop makes one HTTP call per pin to fetch the canonical text. Each call goes through our auth gate — `keyOwner=RP` in our logs — and through a scope check for `resource:regulation:read`. The Worker reads the regulation through a 24-hour cache, so this is sub-100ms on a warm cache. The text Claude pins is **verbatim** what's in our regulatory corpus on the server — not whatever GDPR Claude remembers from training."_
- **③ query** — _"Now I type the prompt. Notice — no new MCP calls fire. Claude is reasoning over the regulation text it already received in step 2. The risk matrix it produces is therefore grounded in our text, not in training data. If the model tried to cite an article that doesn't appear in the pinned content, that would be hallucination — and we built the demo this way precisely so you can spot-check that. Look at the citations: every article number maps to a line in the pinned content above."_

###### Worker-internal pipeline — resources/read

```
HTTP POST /mcp (method=resources/read, uri=gst://regulations/<jurisdiction>/<framework>)
   ↓
auth gate (compare bearer against MCP_KEY_* secrets) ── [mcp-server/src/auth/bearer.ts]
   ↓ keyOwner attribution attached
scope check: assertScope(scopes, RESOURCE_REGULATION_READ) ── [mcp-server/src/auth/scopes.ts]
   ↓
SDK dispatch → resource handler registered in [mcp-server/src/resources/regulations.ts]
   ↓
readThroughCache(env, uri.href, REGULATION_TTL_SECONDS, fetcher) ── [mcp-server/src/cache/resource-cache.ts]
   ├── cache HIT  → return cached body (~50ms p95)
   └── cache MISS → invoke fetcher:
                       loadRegulationByUri(uri)  ── [mcp-server/src/content/regulation-loader.ts]
                          ↓ codegen index built at `npm run prebuild`
                       returns { uri, mimeType: 'application/json', text: <regulation body> }
                       ↓
                    cache writes through with 24h TTL
                       ↓
                    return body to handler
   ↓
{ contents: [{ uri, mimeType, text }] } back to Claude Desktop
```

###### The pinning architecture — the key story for the demo

Three things distinguish this from "have Claude look up GDPR":

| Layer                  | What it guarantees                                                                                                                                  | Code path                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canonical source**   | Regulation text is codegened at server build time from our regulatory corpus — single source of truth, deployed atomically with each Worker release | [`mcp-server/src/content/regulation-loader.ts`](../../../mcp-server/src/content/regulation-loader.ts)                                                |
| **24h cache**          | The same regulation pinned by 10 users in a session hits Inoreader-bandwidth-free reads after the first fetch                                       | [`mcp-server/src/cache/resource-cache.ts`](../../../mcp-server/src/cache/resource-cache.ts)                                                          |
| **Scoped attribution** | Every read goes through bearer auth + `resource:regulation:read` scope check; logged with `keyOwner`; counted against rate limits                   | [`mcp-server/src/auth/bearer.ts`](../../../mcp-server/src/auth/bearer.ts), [`mcp-server/src/auth/scopes.ts`](../../../mcp-server/src/auth/scopes.ts) |

**Demonstrator phrasing**: _"This isn't Claude looking up GDPR on the internet. We've shipped a verbatim copy of our regulatory corpus inside the MCP server itself. When I pin a regulation, the server reads the canonical text from that bundled corpus and hands it to Claude over the wire. The model reasons over the text we gave it, and if it cites Article 32 of GDPR, it's citing the exact words we shipped — not whatever it absorbed during training. That's why this demo can actually be trusted for compliance work."_

###### Reading order for the demonstrator

30-second version:

> _"Two phases. One — at pin time, Claude Desktop calls our server's `resources/read` endpoint once per pin and pulls the canonical regulation text into its conversation context. Two — when I type the query, no new MCP calls fire; Claude is reasoning over text we handed it, not text it trained on. That's why every citation in the output traces back to a verbatim line in the pinned content above. We didn't ask Claude to remember the law; we handed it the law and asked it to reason."_

5-second version: _"Verbatim regulatory text pinned into Claude's context — no training-data citations, no hallucinated articles. Pure citation grounding."_

#### Scenario 3 — OpenClaw radar pull on command (5 min, hints at the cherry)

The **first taste of agentic autonomy** in the demo. A single OpenClaw agent, on a one-line command, pulls live radar from the GST MCP and produces a thematic briefing. Establishes "agents can do this — autonomously" without the multi-agent complexity of scenario 5. Plants the seed.

- **Setup**: Pre-configured OpenClaw with the `gst-mcp` connector registered (same `MCP_KEY_OC` used in scenario 5). One pre-defined agent — `radar-analyst` — with access to just the radar tools (`search_radar`, `get_latest_insights`).
- **Input** (typed live in the OpenClaw UI, single command): _"Pull today's radar items relevant to AI infrastructure deals and give me a 3-bullet briefing in the GST Take voice."_
- **What stakeholders see**:
  1. OpenClaw routes the command to the `radar-analyst` agent
  2. Agent invokes `search_radar` (Tool call visible in OpenClaw's UI with input args)
  3. Agent receives Inoreader-sourced radar items via the MCP response
  4. Agent synthesizes a 3-bullet briefing in GST Take voice (system-prompt addendum applied)
  5. Output renders in OpenClaw — same kind of briefing scenario 1 produces from Claude, but **autonomously, on one command**
- **Showcase**:
  - **Agentic autonomy without complexity** — one agent, one command, one structured output. Easier to grok than scenario 5's 5-agent fan-out.
  - **BL-032.5 + BL-039 silently working** — radar Resources/Tools served from the Cron-pre-warmed Upstash cache; if the token were stale, BL-039 would self-heal (operator can show `/health` `inoreaderObservedAt` to prove the snapshot is fresh)
  - **Sets up scenario 5** — narrator cue at the close: _"Notice this is one agent doing one thing. In a few minutes I'll show you the same kind of agent loop, but scaled to a 4-agent fan-out doing the full diligence triage from scenario 1's call notes."_
- **Why OpenClaw instead of Claude Desktop here**: nobody reads the news by manually prompting their chatbot. Radar consumption in real use is either a scheduled brief (daily / hourly) or an on-demand pull from another tool. The OpenClaw agent reflects the **real consumption pattern** for this kind of data — push or pull on command from a workflow, not type-in-chat. This is the demo's first hint at "what production agent workflows could look like."
- **Live-demo failure modes & fallbacks**:
  - If OpenClaw's agent runtime hangs or errors — gracefully fall back to a pre-recorded screencast of a successful run
  - If radar cache is cold (unlikely given BL-032.5 Phase 4 hourly Cron) — show `/health` and either wait ~3s for repopulate or move to scenario 4 first and circle back
  - Backup: pre-recorded screencap of a successful radar pull, queued at hand

##### § 3.A — Architecture under the hood (OpenClaw → Tools path, cache, OAuth self-heal)

The story arc for Scenario 3 is **operational substrate**: an agent issues one command, and three pieces of substrate quietly collaborate — bearer auth + per-key rate limit + Cron-pre-warmed Upstash cache + autonomous OAuth refresh — to make the response feel instant. Below the fold there are 4 systems working in concert.

###### Wire-level call sequence — OpenClaw agent → radar tool

```
       OpenClaw agent runtime (cloud-hosted)             GST MCP Worker
            │                                  (mcp.globalstrategic.tech/mcp)
            │                                            │
   ① initialize (once per agent boot)                    │
            ├─── POST initialize ─────────────────────►  │  auth: MCP_KEY_OC bearer
            │ ◄──── capabilities (Tools + Resources) ────┤  (Prompts ignored — OpenClaw doesn't consume them)
            │                                            │
   ② Demonstrator types in OpenClaw:                     │
      "Pull today's radar items relevant to AI infra
       deals and give me a 3-bullet briefing in the
       GST Take voice."                                  │
            │                                            │
      OpenClaw routes to `radar-analyst` agent.          │
      Agent's system prompt instructs: "call search_radar  │
       with category=ai-automation; compose 3 bullets."  │
            │                                            │
            ├─── POST tools/call ──────────────────────► │  tool: search_radar
            │     name: search_radar                     │     args: { category: 'ai-automation' }
            │     args: { category: 'ai-automation' }    │
            │                                            │
            │                                            │  → checkCircuitBreaker(env)  [closed]
            │                                            │  → readWireLive(env)  ── cache HIT
            │                                            │  → readFyiLive(env, 30)  ── cache HIT
            │                                            │  → merge + dedupe + filter + sort
            │                                            │  → buildRadarDeeplink(category)
            │ ◄──── { matches: [...], deeplink, ... } ───┤
            │                                            │
   ③ Agent composes 3-bullet briefing in GST Take voice  │
      using the returned items + system-prompt addendum. │
      Output renders in OpenClaw's UI.                   │
            │                                            │
```

**Talking points keyed to each step**:

- **① initialize** — _"OpenClaw doesn't run on my laptop — it's a cloud agent. When it boots, it shakes hands with our MCP server using a separate bearer key, `MCP_KEY_OC`, that I issued specifically for this integration. Every call this agent makes will show up in our logs tagged `keyOwner=OC`, distinct from `keyOwner=RP` for the Claude Desktop scenarios. That gives us clean per-integration attribution."_
- **② tools/call** — _"The agent's system prompt tells it: when asked for a radar briefing, call our `search_radar` tool with the appropriate category. So that's exactly what happens — one structured tool call, with structured args. You see the tool call render in OpenClaw's UI; that's our MCP being hit. Inside the Worker, the request goes through auth, scope check, rate-limit accounting (this counts against the radar tier's 5-per-minute budget on `MCP_KEY_OC`), and then a circuit-breaker check before we touch the data."_
- **③ data return path** — _"The interesting bit: 99% of the time we don't actually call Inoreader here. Our radar cache is pre-warmed every hour by a Worker Cron — so when the agent asks, we serve a sub-100ms response from Upstash, not a 2-second Inoreader fetch. If the cache happens to be cold or the underlying OAuth token is stale, BL-039 self-heals: the Worker calls our website's refresh endpoint, gets a fresh token, and retries — all without operator intervention. You won't see this happen on stage because the substrate is healthy, but I can show the `/health` endpoint after the demo if you want the receipts."_

###### Worker-internal pipeline — tools/call(search_radar)

```
HTTP POST /mcp (method=tools/call, name=search_radar, args={category})
   ↓
auth gate ── [mcp-server/src/auth/bearer.ts]                    keyOwner=OC
   ↓
scope check ── [mcp-server/src/auth/scopes.ts]                  TOOL_RADAR_READ
   ↓
rate-limit decrement (radar tier: 5/min, 50/day per key)        [mcp-server/src/ratelimit/limiter.ts]
   ↓
SDK dispatch → handleSearchRadar(env, input) ── [mcp-server/src/tools/radar-live.ts:183]
   ↓
checkCircuitBreaker(env)
   ├── breaker OPEN  → return 503 envelope with retryAfterSeconds (no Inoreader call)
   └── breaker CLOSED → continue
   ↓
Promise.all([readWireLive(env), readFyiLive(env, 30)]) ── [mcp-server/src/content/radar-live-store.ts:75]
   │
   ├── readWireLive:
   │      cache HIT (mcp:radar:cache:wire, 6h TTL)
   │         → return { items, fetchedAt, cacheHit: true }    ← typical path (Cron pre-warmed)
   │      cache MISS
   │         → fetchAllStreams() — calls Inoreader 5 times    [mcp-server/src/lib/inoreader-worker.ts]
   │           ├── 401 from Inoreader
   │           │      → triggerWebsiteRefresh() — BL-039 self-heal
   │           │         → POST https://gst-website/api/inoreader/refresh
   │           │            (shared-secret bearer)
   │           │         → retry once with fresh token
   │           └── 429 from Inoreader
   │                  → openCircuit(env, 'inoreader-429')  → return 503 envelope
   │
   └── readFyiLive: same shape, separate cache key (mcp:radar:cache:fyi)
   ↓
merge + dedupe (by url || id) + filter by category + sort by publishedAt
   ↓
buildRadarDeeplink(category) ── serializeToParams from [src/utils/radar-url.ts]   ◄── SAME ENCODER AS HUB PAGE
   ↓
{ matches, totalMatched, liveInfo: { wireCacheHit, fyiCacheHit, fetchedAt × 2 }, deeplink }
   ↓
return to OpenClaw agent
```

###### The substrate stack — the key story for the demo

Four cooperating systems, none of which the agent has to know about:

| Layer                        | What it does                                                                                                               | Code path                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-key rate limit**       | 5/min, 50/day radar tier on `MCP_KEY_OC` — separate from other key budgets                                                 | [`mcp-server/src/ratelimit/limiter.ts`](../../../mcp-server/src/ratelimit/limiter.ts)                                                                                                     |
| **Cron-pre-warmed cache**    | Worker Cron every hour calls `readWireLive(forceRefresh:true)` + `readFyiLive`; cache stays ≤60min stale                   | [`mcp-server/src/cron/radar-refresh.ts`](../../../mcp-server/src/cron/radar-refresh.ts) (BL-032.5 Phase 4)                                                                                |
| **OAuth self-heal (BL-039)** | On 401 from Inoreader: Worker calls the website's refresh endpoint with a shared secret, retries once with the fresh token | [`mcp-server/src/lib/inoreader-worker.ts`](../../../mcp-server/src/lib/inoreader-worker.ts) (BL-039), [`src/pages/api/inoreader/refresh.ts`](../../../src/pages/api/inoreader/refresh.ts) |
| **Circuit breaker**          | On 429 from Inoreader: 6h breaker stops all radar tool calls + Cron refreshes; protects the 200/day Inoreader budget       | [`mcp-server/src/ratelimit/circuit-breaker.ts`](../../../mcp-server/src/ratelimit/circuit-breaker.ts)                                                                                     |

**Demonstrator phrasing**: _"What you just saw was one tool call. Underneath it, four systems collaborated to make that call feel instant and safe — rate limiting that protects this OpenClaw key separately from my own Claude Desktop key, a cache that gets pre-warmed by a Cron so the agent never waits on Inoreader, an autonomous OAuth refresh that healed our token last week without me noticing, and a circuit breaker that protects the upstream Inoreader budget from cascading failures. None of that is in the agent. It's all in the substrate. The agent just asked for radar, and got radar."_

###### Reading order for the demonstrator

30-second version:

> _"Three pieces. One — the agent calls our `search_radar` tool, identified to us by the `MCP_KEY_OC` bearer key. Two — the Worker rate-limits the call against this key's separate budget, then reads from a 6-hour Upstash cache that's pre-warmed every hour by a Cron. Three — the agent gets structured items back and composes the briefing in the GST Take voice from its system prompt. If the underlying OAuth token had been stale, BL-039 would have refreshed it autonomously between the request and the response, and you wouldn't have known. That's the substrate — operationally honest by construction."_

5-second version: _"Tool call from the agent, served from a Cron-pre-warmed cache, separately rate-limited, with autonomous OAuth refresh if needed."_

#### Scenario 4 — "What else?" open-ended interactive session (Claude Desktop, open-ended length)

- **Stakeholders type prompts in real time** in Claude Desktop with the full `gst-mcp` connector available
- **Pre-staged provocative prompts** to seed if stakeholders are quiet:
  - _"Find me three PE firms in our portfolio that have done healthcare-interoperability deals adjacent to our last engagement"_
  - _"What would the diligence look like for a target with bad infrastructure cost-governance? Use our ICG framework."_
  - _"Compare GDPR exposure for SaaS vs marketplace business models using our regulations corpus"_
  - _"Generate a comparable-engagements memo for healthcare interoperability"_
- **Showcase**: capability surface as a substrate for arbitrary inquiry; emergent use cases
- **Length**: ends when stakeholder curiosity is exhausted; capture transcripts for follow-up analysis

##### § 4.A — Verification: ensuring prompts hit GST MCP (not training knowledge)

The credible MD challenge to this scenario is: _"how do I know this isn't just ChatGPT answering from training? How do you prove the GST MCP was actually called?"_ Four layered verification mechanisms — all live-visible, all stakeholder-readable:

1. **Visible tool-call rendering in the Claude UI** — Claude Desktop renders every MCP tool invocation inline in the chat: tool name, input args, response. Stakeholders **see** `search_portfolio` called with specific args (e.g., `industry: 'healthcare', theme: 'interoperability'`) before Claude composes its response. If no tool call renders, no MCP hit happened. **This is the strongest signal — make it the demonstrator's first verification cue ("look at the tool call right there").**

2. **System-prompt addendum biases Claude toward MCP-first** ([REMOTE_CLIENT_SETUP.md § 4](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) addendum already documented + validated): the addendum's rule 1 forces the opening sentence to name the MCP tool ("I'll query `search_portfolio`..."). The MD can read Claude's first sentence as a self-declaration of intent. **If the opening sentence says "Based on what I know about..." instead, the addendum didn't land — that's the failure signal.**

3. **GST-specific pre-seeded prompts whose answers are only verifiable from MCP data** — the 4 pre-staged prompts above are engineered to require GST-specific data (our portfolio, our ICG framework, our regulations corpus). Generic ChatGPT can't answer them with specific portfolio items or our ICG taxonomy. **Demonstrator's narration**: _"The radar item Claude just cited — 'Main Capital invests in insurtech firm Agenium' — is from our Inoreader feed, not Claude's training. ChatGPT couldn't have surfaced this with our voice and our framing."_

4. **`/health` snapshot showing rate-limit + Inoreader-call deltas** (optional, for the most-skeptical stakeholder): a small terminal window kept visible with `watch -n 5 'curl -s https://mcp.globalstrategic.tech/health | jq .radarSnapshotAgeSeconds'` shows the snapshot age. When a radar prompt fires in scenario 4, the next Cron tick or auto-refresh causes a visible change. This is the technical-proof fallback for an MD who wants the receipt.

**Demonstrator narration pattern**: every time a stakeholder asks something, the demonstrator's response sequence is:

1. Point at the tool call render: _"See how Claude just called `search_portfolio` with these args?"_
2. Point at the response: _"That came back from our M&A portfolio data, anonymized at source"_
3. Read Claude's reply and call out the specifics: _"Notice it's citing engagement code names, not generic case studies — that's the GST data showing through."_

If stakeholders push harder (rare but possible): pull up the actual tool source file in a side window — see scenario 5 § 5.A for the canonical tool→source mappings.

##### § 4.B — Architecture under the hood (general routing for any tool / prompt / resource)

Scenario 4 is the open-ended one — any stakeholder question could trigger any combination of Tools, Prompts, or Resources. The architectural story here is therefore the **shared pipeline** that every MCP method routes through. Three primitives, three call patterns, **one auth + scope + rate-limit gauntlet** they all share.

###### The three MCP call patterns Claude Desktop can fire

| Method           | Triggered when                                                     | Example                                                     |
| ---------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `tools/call`     | Claude decides it needs to query a structured engine               | `search_portfolio`, `compute_techpar`, `search_regulations` |
| `prompts/get`    | Stakeholder (or Claude) names a `gst_*` workflow                   | `gst_target_quick_look`, `gst_comparable_engagements_memo`  |
| `resources/read` | Stakeholder pins a Resource, OR Claude is asked to "look at" a URI | `gst://library/vdr-structure`, `gst://regulations/<*>`      |

All three flow through the same Worker pipeline before reaching their respective handlers — that's why a stakeholder asking _"can you guarantee every interaction is logged + budgeted + authorized?"_ has a single, clean answer.

###### Worker-internal pipeline — shared across all three methods

```
HTTP POST /mcp (method=tools/call | prompts/get | resources/read)
   ↓
auth gate ── [mcp-server/src/auth/bearer.ts]
   ├── 401 if no bearer / unknown bearer (request never reaches a handler)
   └── keyOwner attribution attached  (e.g. keyOwner=RP)
   ↓
scope check ── [mcp-server/src/auth/scopes.ts]
   ├── method-specific scope required:
   │     tools/call         → TOOL_<family>_INVOKE
   │     prompts/get        → PROMPT_<workflow>_RENDER
   │     resources/read     → RESOURCE_<family>_READ
   └── MissingScopeError if not granted (request never reaches the handler)
   ↓
rate-limit decrement ── [mcp-server/src/ratelimit/limiter.ts]
   ├── per-key bucket; radar tools on their own 5/min·50/day tier
   └── 429 with RFC 9331 Retry-After if budget exhausted
   ↓
SDK dispatch → handler:
   ├── tools/call(<name>)        → register-time handler in mcp-server/src/tools/<family>.ts
   ├── prompts/get(<name>)       → diligence-kickoff.ts / target-quick-look.ts / etc.
   └── resources/read(<uri>)     → mcp-server/src/resources/<family>.ts
   ↓
observability ── [mcp-server/src/observability/sentry.ts] + safeLog (structured log line)
   ↓
response back to Claude Desktop
```

**Two important properties** that follow from this shared pipeline:

1. **Verifiability is structural, not bolt-on**. Every request is authenticated, scoped, rate-limited, and logged before any business logic runs. The `keyOwner` field on every log line lets us trace exactly which key invoked what.
2. **Tool calls, prompt renders, and resource reads all show up in Claude Desktop's UI**. Whatever the stakeholder asks, you'll see the JSON-RPC method + payload render inline in the chat. **No render = no MCP hit** (the verification cue § 4.A rule 1 relies on).

###### Anatomy of three example questions (and the methods they trigger)

When a stakeholder fires the open-ended prompts in this scenario, here's the pattern-match between question shape and MCP method:

| Stakeholder asks                                                                                | Claude likely fires                                                                                                                                                          | What you point at in the UI                                                                                              |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| _"Find me three PE firms in our portfolio that have done healthcare-interoperability deals..."_ | `tools/call` → `search_portfolio({ industry: 'healthcare', theme: 'interoperability' })` ([`mcp-server/src/tools/portfolio.ts`](../../../mcp-server/src/tools/portfolio.ts)) | The tool-call render shows the structured args — proving Claude translated prose into a query against our portfolio data |
| _"What would diligence look like for a target with bad infrastructure cost-governance?"_        | `tools/call` → `assess_infrastructure_cost_governance(...)` ([`mcp-server/src/tools/icg.ts`](../../../mcp-server/src/tools/icg.ts))                                          | Multi-domain ICG output with our framework's taxonomy showing through (verification cue § 4.A rule 3)                    |
| _"Generate a comparable-engagements memo for healthcare interoperability"_                      | `prompts/get` → `gst_comparable_engagements_memo` → which then auto-fires `tools/call` → `search_portfolio` + `list_portfolio_facets`                                        | Two structured calls render — the prompt invocation followed by the tool sub-calls it orchestrates                       |
| _"Pull GDPR text and explain Article 32 to me"_                                                 | If user pre-pinned `gst://regulations/eu/gdpr`: NO new MCP call (text already in context, Scenario 2 pattern). Otherwise: `resources/read` if user types the URI             | Either zero new calls (if pinned) or one resource-read render                                                            |

###### The substrate-as-substrate story — the key story for the demo

Scenario 4 is where you make the load-bearing claim about the architecture itself:

**Demonstrator phrasing**: _"Whatever the stakeholder just asked, three things happened. One — the request went through bearer authentication and was attributed to my specific key. Two — the request was scope-checked: did `MCP_KEY_RP` have permission to call this tool, render this prompt, or read this resource? Three — the request was counted against per-key rate budgets. Then, and only then, the actual handler ran. This pipeline is the same for every Tool, every Prompt, every Resource — there's no privileged path. That's what makes this safe to expose to pilot clients in BL-033 — verifiability isn't a feature we added, it's how the substrate is built."_

###### Reading order for the demonstrator

30-second version:

> _"This is the open-ended segment. The architectural point is that everything you'll see Claude do — whether it's a tool call, a prompt invocation, or a resource read — flows through the same auth + scope + rate-limit pipeline. Every request is attributed to my key, scope-checked against what that key is allowed to do, and counted against a per-key budget. Then the handler runs. That's why I can hand you the keyboard and let you ask anything — every interaction will leave a trail in our logs, and nothing gets through that pipeline by accident."_

5-second version: _"Three primitives, one shared pipeline — auth, scope, rate-limit, then handler. Every interaction is logged + budgeted + authorized."_

#### Scenario 5 — 🍒 OpenClaw autonomous agentic loop (5-7 min, cherry on top)

The closing flourish. Takes scenario 1's workflow (sales-call → diligence agenda) and runs it autonomously through a small OpenClaw fan-out — showing what the same workflow looks like under multi-agent orchestration rather than human-driven chat. Pays off the seed planted in scenario 3.

**Cloud-models design (Rev 8)**: with demo agents upgraded to **cloud models** rather than locally-hosted runtimes, the RAM constraint that motivated Rev 6's safe/stretch split is gone. Scenario 5 now ships as **a single 3-specialist + Synthesis configuration** — all three partner-decision dimensions (fit, precedent, risk) cover every run, no hardware-check gate, no day-of variant decision.

**Tools + Resources only — no MCP Prompt invocation (Rev 8)**: research into OpenClaw's MCP client capability surface confirmed that `mcporter` (OpenClaw's MCP tooling, 0.10.0+) consumes Tools and Resources only — **Prompts are not consumable from OpenClaw**. Both upstream feature requests ([openclaw#8188](https://github.com/openclaw/openclaw/issues/8188), [openclaw#29053](https://github.com/openclaw/openclaw/issues/29053)) closed stale. Each scenario-5 specialist agent therefore composes its Tool sequence via **system-prompt composition**, using the `gst_*` Prompt source files as the design specification for which Tools to call in what order. The architectural payoff is unchanged — 3-agent fan-out → each agent driving a 1-4 tool sub-sequence → 6-8 underlying Tool calls total — but the layer where the workflow is _named_ moves from server-side (Prompts) to client-side (agent system prompts). Claude Desktop scenarios (1, 2, 4) still use server-side Prompts because Claude Desktop's MCP client supports all three primitives.

- **Setup**: Pre-configured `openclaw mcp set gst-mcp '{"transport":"streamable-http","url":"https://mcp.globalstrategic.tech/mcp","headers":{"Authorization":"Bearer <MCP_KEY_OC>"}}'`; 3 OpenClaw specialist agents pre-defined plus a Synthesis agent. Each specialist's system prompt is hand-authored to reproduce the equivalent `gst_*` Prompt's Tool sequence (per § 5.A).
- **Input** (same MedSig Health call notes from scenario 1, fed once at the kickoff): kicks off the fan-out

##### § 5.A — Agent / Tool-sequence / Source-code map

Each specialist agent's system prompt composes a sequence of Tool calls matching what the equivalent `gst_*` Prompt would have orchestrated server-side. The `gst_*` Prompt source files remain the **canonical specification** for what each workflow does — they're consulted at agent-design time rather than invoked at run-time. This is the workaround for OpenClaw's Tools+Resources-only client (per the HANDOVER doc § 2.0).

**The MD-facing demo slide for scenario 5 lists each agent with the Prompt source it replicates, the underlying Tools it calls, and hyperlinks to BOTH the Prompt spec AND each tool source** — so a curious stakeholder can verify "yes, this is real, named, versioned code we built, here it is in the repo." All paths are relative to repo root.

| Agent                            | Workflow spec (Prompt source — the design reference)                                                | Tool sequence invoked by agent system prompt                                                                                                                                                                                                           | What the agent contributes                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **Target-fit agent**             | [`gst_target_quick_look`](../../../mcp-server/src/prompts/target-quick-look.ts)                     | 4 tools: [`icg.ts`](../../../mcp-server/src/tools/icg.ts) · [`techpar.ts`](../../../mcp-server/src/tools/techpar.ts) · [`tech-debt.ts`](../../../mcp-server/src/tools/tech-debt.ts) · [`regulations.ts`](../../../mcp-server/src/tools/regulations.ts) | Pursue / pass / dig-more verdict — the "is this worth our time?" check        |
| **Comparable-engagements agent** | [`gst_comparable_engagements_memo`](../../../mcp-server/src/prompts/comparable-engagements-memo.ts) | 2 tools: [`portfolio.ts`](../../../mcp-server/src/tools/portfolio.ts) (`search_portfolio`, `list_portfolio_facets`)                                                                                                                                    | "Have we done this before?" — precedent memo from our 57-engagement portfolio |
| **Regulatory-exposure agent**    | [`gst_regulatory_exposure_brief`](../../../mcp-server/src/prompts/regulatory-exposure-brief.ts)     | 1 tool + Resources: [`regulations.ts`](../../../mcp-server/src/tools/regulations.ts) + `gst://regulations/*` (120+ files)                                                                                                                              | Jurisdictional regulatory-risk dimension covering target's geographies        |
| **Synthesis agent**              | _(no Prompt analog — pure synthesis)_                                                               | _none — receives upstream outputs only_                                                                                                                                                                                                                | Combines fit + precedent + risk into a single partner-decision recommendation |

**Why these three specialists**: they map to the three questions a partner asks first when triaging a deal — _"does this fit our pattern?"_ (outward look), _"have we done similar work before?"_ (inward look), _"what's the risk?"_ (compliance look). Synthesis is the partner-decision moment that combines them.

**Why this isn't just hand-coding the workflow into the agent**: the Prompt source files are still authoritative — they capture the GST consultant voice, the ordering reasoning, the response-shape rules, the verifiability guidance. Lifting that specification into the agent's system prompt preserves the architectural layering (workflow definition vs runtime invocation are still separated) and gives the OpenClaw integration a path back to native Prompt invocation if/when [openclaw#8188](https://github.com/openclaw/openclaw/issues/8188) ships.

###### Bonus tools available (for "what else?" Q&A grounding)

| Tool                                  | Source file (linked)                                                                      | Use case                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `search_radar`, `get_latest_insights` | [`mcp-server/src/tools/radar-live.ts`](../../../mcp-server/src/tools/radar-live.ts)       | Live market intelligence — what scenario 3's OpenClaw teaser used |
| `generate_diligence_agenda`           | [`mcp-server/src/tools/diligence.ts`](../../../mcp-server/src/tools/diligence.ts)         | What scenario 1 invokes via the kickoff Prompt                    |
| Underlying offline radar              | [`mcp-server/src/tools/radar-offline.ts`](../../../mcp-server/src/tools/radar-offline.ts) | Stdio-only fallback path; not used in remote demo                 |

**Demonstrator narration cue**: when each agent fires in the OpenClaw UI, name the prompt + its tools out loud AND mention the source links are in the slide deck. _"The Target-fit agent just invoked our `gst_target_quick_look` prompt — that workflow lives at `mcp-server/src/prompts/target-quick-look.ts` and internally calls our ICG, TechPar, tech-debt, and regulations tools. All links are in your handout."_ Makes the demo feel grounded in real engineering, not magic — three layers of "real code we built" become visible.

##### § 5.B — End-to-end flow

**What stakeholders see**:

1. **Demonstrator kicks off** by feeding the MedSig Health call notes (same input as scenario 1) into OpenClaw's orchestrator
2. **All three specialists fan out in parallel** (cloud-models — no RAM contention):
   - **Target-fit agent** — system-prompt-driven 4-tool sequence (ICG + TechPar + tech-debt + regulations) renders in the OpenClaw UI → produces fit-verdict
   - **Comparable-engagements agent** — system-prompt-driven 2-tool sequence (`search_portfolio` + `list_portfolio_facets`) → produces precedent memo with anonymized engagement code names
   - **Regulatory-exposure agent** — system-prompt-driven 1-tool + Resources sequence (`search_regulations` + `gst://regulations/*` pins) → produces cross-jurisdictional risk matrix
3. **All three agents complete** → outputs arrive at the Synthesis agent
4. **Synthesis agent** produces final partner-decision recommendation citing all three upstream agents' outputs

**Wall-clock**: ~3-4 minutes for all three specialist agents to complete (parallel, cloud-hosted — no local-runtime bottleneck) + ~30s synthesis + ~1-2 min narration = ~5-7 min total.

- **Showcase**:
  - **What autonomy on top looks like** — same workflow as scenario 1, but executed by 3 cooperating agents — each composing the same multi-tool sequence the equivalent server-side Prompt would have orchestrated — instead of a human in chat
  - **Architectural payoff** — the demo shows three layers of orchestration: top-level agent fan-out (OpenClaw) → mid-level workflow composition (each agent's system prompt encodes a GST consultant workflow) → leaf-level Tool invocations (single-purpose code on the GST MCP). Each layer is independently named, versioned, and inspectable. The fact that the workflow specification lives in source-controlled Prompt files (consulted by agent designers, even though OpenClaw can't invoke them at run-time) keeps the architectural separation clean.
  - **Where this could go** — productized agent workflows running pre-meeting prep overnight, on-demand briefings, ambient market intelligence
- **Honest framing**: this is the "what if" lens. The Claude scenarios (1, 2, 4) are _production-ready today_. The OpenClaw scenario is _substrate-ready, productization-pending_ — and intentionally exercises the Tools+Resources surface that ALL MCP clients support today, not the Prompt surface that some clients (e.g., OpenClaw) don't yet.
- **Failure tolerance**: if any agent hangs or errors mid-run, gracefully fall back to "the Claude version of this is scenario 1 — you already saw it work." The OpenClaw segment failing on stage doesn't undermine the demo's core value.

##### § 5.C — Architecture under the hood (multi-agent fan-out, attribution, rate-limit shape)

The story arc for Scenario 5 is **the substrate behaves the same whether one client connects or one hundred**. Three OpenClaw agents firing concurrent tool calls against the MCP look architecturally identical to three users — same auth gate, same scope check, same rate-limit accounting — they just happen to share one bearer key. Below is the wire-level shape of the fan-out + a sober look at the rate-limit math.

###### Wire-level shape — three parallel agents, one shared MCP

```
                  OpenClaw orchestrator (cloud)
                              │
              ┌───────────────┼───────────────────────────────┐
              │               │                               │
       ┌──────▼──────┐ ┌──────▼─────────────┐ ┌───────────────▼────────┐
       │ Target-fit  │ │  Comparable-       │ │  Regulatory-exposure   │
       │  agent      │ │  engagements agent │ │   agent                │
       └──────┬──────┘ └──────┬─────────────┘ └───────────────┬────────┘
              │               │                               │
              │ (4 tools/call)│ (2 tools/call)                │ (1 tools/call + N resources/read)
              │ sequentially  │ sequentially                  │ sequentially
              │ from agent's  │ from agent's                  │ from agent's
              │ system prompt │ system prompt                 │ system prompt
              │               │                               │
              ▼               ▼                               ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │                          GST MCP Worker (mcp.globalstrategic.tech)           │
   │                                                                              │
   │  All three concurrent HTTP streams hit the same Worker isolate(s).           │
   │  Every request carries Authorization: Bearer <MCP_KEY_OC>.                   │
   │  Worker can't tell which OpenClaw agent issued which call — it just sees     │
   │  3 concurrent bearer-authenticated clients with the same keyOwner=OC.        │
   │                                                                              │
   │  Each call goes through the standard pipeline (§ 4.B):                       │
   │    auth → scope → rate-limit decrement → handler → response                  │
   │                                                                              │
   │  Rate-limit accounting is per-KEY, not per-client-connection.                │
   │  → All 3 agents share ONE 5/min·50/day radar budget                          │
   │  → All 3 agents share ONE default-tier budget for non-radar tools            │
   │                                                                              │
   └──────────────────────────────────────────────────────────────────────────────┘
              │               │                               │
              │ structured    │ structured                    │ structured
              │ JSON results  │ JSON results                  │ JSON results
              │               │                               │
              ▼               ▼                               ▼
       ┌──────────────────────────────────────────────────────────────┐
       │       Synthesis agent (cloud, no MCP calls of its own)        │
       │  Receives all 3 upstream outputs → produces partner verdict  │
       └──────────────────────────────────────────────────────────────┘
```

###### Tool-call accounting — how many MCP requests does Scenario 5 actually fire?

This is the question that comes up in BL-033 pilot-client discussions: _"if you scaled this to 10 prospects a day, what does that cost us?"_ Below is the per-run call inventory so you can extrapolate.

| Agent                  | MCP tool calls per run                                                                                         | Resource reads per run                                                           | Tier                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Target-fit             | 4: `assess_infrastructure_cost_governance`, `compute_techpar`, `estimate_tech_debt_cost`, `search_regulations` | 0                                                                                | default tier                                         |
| Comparable-engagements | 2: `search_portfolio`, `list_portfolio_facets`                                                                 | 0                                                                                | default tier                                         |
| Regulatory-exposure    | 1: `search_regulations`                                                                                        | 2-5: `gst://regulations/<jurisdiction>/<framework>` (varies by target geography) | default tier × tool + RESOURCE_REGULATION_READ × pin |
| Synthesis              | 0                                                                                                              | 0                                                                                | —                                                    |
| **TOTAL per run**      | **7 tools/call**                                                                                               | **2-5 resources/read**                                                           | all default tier                                     |

Notes for the demonstrator:

- **None of these are radar-tier**. The 5/min·50/day radar budget is untouched by Scenario 5 — Scenario 3's `MCP_KEY_OC` consumption is independent.
- **9-12 MCP requests per run** total. At 10 runs/day, that's ~100-120 requests against the default tier — comfortably under the per-key budget (default tier is ~60/min·1000/day per key per `mcp-server/src/docs/operations/RATE_LIMITS.md`).
- **Concurrent burst window**: all 3 agents start at roughly the same time, so the Worker sees a 7-call burst within ~3-4 seconds. Default-tier per-minute budget absorbs this without trouble; if BL-033 scales beyond ~5 simultaneous fan-out runs, BL-040 (debounce parallel refreshes) becomes load-bearing rather than nice-to-have.

###### Attribution — what shows up in `wrangler tail` during the demo

When Scenario 5 runs, this is the live log you'd see streaming from `wrangler tail --env production --format=json | jq -c '.event.request | {method, url}'`:

```
{ "method": "POST", "url": ".../mcp" }   ← tools/call(assess_infrastructure_cost_governance) keyOwner=OC
{ "method": "POST", "url": ".../mcp" }   ← tools/call(search_portfolio)                       keyOwner=OC
{ "method": "POST", "url": ".../mcp" }   ← tools/call(search_regulations)                     keyOwner=OC
{ "method": "POST", "url": ".../mcp" }   ← tools/call(compute_techpar)                        keyOwner=OC
{ "method": "POST", "url": ".../mcp" }   ← tools/call(list_portfolio_facets)                  keyOwner=OC
{ "method": "POST", "url": ".../mcp" }   ← resources/read(gst://regulations/eu/gdpr)          keyOwner=OC
{ "method": "POST", "url": ".../mcp" }   ← tools/call(estimate_tech_debt_cost)                keyOwner=OC
{ "method": "POST", "url": ".../mcp" }   ← resources/read(gst://regulations/us-ca/ccpa)       keyOwner=OC
...
```

Every line carries `keyOwner=OC`. **If we wanted to spin up a second OpenClaw integration for a different team, they'd get their own `MCP_KEY_<TEAM>` key and their log lines would carry their own `keyOwner` field** — full multi-tenant attribution with zero change to the substrate. This is the architecture story for "what would BL-033 pilot-client onboarding look like?"

###### The substrate is just substrate — the key story for the demo

Three orchestration layers stack cleanly, and each layer is independently inspectable:

| Layer                        | Lives in                                                      | Inspectable via                                                  |
| ---------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Top: agent fan-out**       | OpenClaw orchestrator (cloud)                                 | OpenClaw UI — see each agent fire + its outputs                  |
| **Middle: workflow specs**   | `mcp-server/src/prompts/*.ts` (versioned, code-reviewed)      | Source files in repo — what the agent's system prompt replicates |
| **Bottom: tool invocations** | `mcp-server/src/tools/*.ts` + `mcp-server/src/resources/*.ts` | `wrangler tail` + Claude/OpenClaw UI's tool-call renders         |

**Demonstrator phrasing**: _"What you're watching is three agents fanning out in parallel, each one issuing a short sequence of tool calls against the same MCP server I demoed earlier with Claude Desktop. From the MCP's perspective there's nothing special about agents — they're just three concurrent bearer-authenticated clients sharing one team key. Every call is attributed to `MCP_KEY_OC`, every call is scope-checked, every call is rate-limited. If we wanted to give a pilot client their own agent, we'd issue them their own key — and our logs would show their traffic separately. Productized AI workflows aren't a different system; they're the same MCP, with agents on top instead of humans in chat."_

###### Reading order for the demonstrator

30-second version:

> _"Three agents firing seven tool calls and a handful of resource reads, all in parallel, all bearing the same `MCP_KEY_OC` key. The MCP server treats them like three concurrent clients — same auth gate, same scope check, same rate-limit accounting we'd give a human typing in Claude Desktop. The architectural payoff isn't the agent fan-out itself — it's that the substrate behaved the same whether one client or twenty connect. That's what makes it safe to point pilot clients at next quarter."_

5-second version: _"Three concurrent agents, one shared bearer key, same auth + scope + rate-limit pipeline as every other call. Substrate scales without rearchitecture."_

### Business value

- **Internal alignment**: partners + ops team see what's built; concrete opinions replace abstract claims about "the MCP" being valuable
- **Investment direction**: scenario 5 surfaces what stakeholders actually care about — that data shapes BL-033 pilot-client selection + downstream initiative prioritization
- **External marketing material seed**: recorded scenarios become assets for sales/BD with potential pilot clients (anonymized, with consent). Scenario 1 in particular ("sales-call-to-agenda in 60 seconds") is the kind of artifact that lands directly with PE/M&A buyers
- **Stress-test before BL-033**: real Claude Desktop traffic exercises rate limits, OAuth-refresh, Cron-pre-warm; the OpenClaw segment additionally exercises BL-040 fan-out gap if it bites in practice
- **Cost**: ~0 — Claude Desktop demos use the operator's existing `MCP_KEY_RP`; OpenClaw uses the fresh `MCP_KEY_OC` issued 2026-05-14; runs against production; tiny slice of the 200/day Inoreader budget

### Acceptance Criteria

**Claude Desktop setup (load-bearing for scenarios 1, 2, 4)**

- [ ] Demonstrator's Claude Desktop `gst-mcp` connector verified live against production immediately before the demo (`/health` check + 1 dry-run scenario)
- [ ] System-prompt addendum from `REMOTE_CLIENT_SETUP.md` § 4 enabled in the demonstrator's profile (so opening sentences route via MCP, not training knowledge — verified via the addendum's validation prompt). **This is also the load-bearing verification layer for scenario 4 — see § 4.A.**
- [ ] Scenarios 1, 2, 4 scripted with verbatim prompt text + expected tool/prompt invocation + sample output, saved to `src/docs/demos/BL-032_6/claude-scenario-<N>-<title>.md`
- [ ] Each Claude scenario has a captured PASS transcript from a same-day dry-run (input → tool calls → final output)
- [ ] Each Claude scenario has a documented failure-mode + fallback (per the existing per-scenario "Live-demo failure modes" bullets)

**OpenClaw setup (load-bearing for scenarios 3 + 5)**

- [ ] Fresh `MCP_KEY_OC` issued via `wrangler secret put MCP_KEY_OC --env production`; key value recorded in operator password manager (NOT in this repo). Same key powers both scenarios 3 and 5.
- [ ] OpenClaw server registration tested: `openclaw mcp set gst-mcp '{"transport":"streamable-http","url":"https://mcp.globalstrategic.tech/mcp","headers":{"Authorization":"Bearer <MCP_KEY_OC>"}}'`
- [ ] **Tools + Resources discovery verified**: `mcporter list gst-mcp` returns all 12 Tools; `mcporter resource gst-mcp` enumerates all ~130 Resources. **Prompts are not consumable by OpenClaw** (see HANDOVER doc § 2.0) — `prompts/list` is not implemented in `mcporter` 0.10.0; this is by design and routed-around via system-prompt composition per § 5.A.
- [ ] **Scenario 3** (teaser): single-agent `radar-analyst` definition with `search_radar` + `get_latest_insights` access; verified dry-run completing in ~3-5 min
- [ ] **Scenario 5** (cloud-models, Rev 8): 3-specialist (Target-fit + Comparable-engagements + Regulatory-exposure) + Synthesis-agent definition per § 5.A; each specialist's system prompt hand-authored against the equivalent `gst_*` Prompt source as the design spec; verified dry-run completing in ~5-7 min running cloud-hosted agents (no local-RAM dependency)
- [ ] Both OpenClaw scenarios have a documented "graceful skip" runbook — scenario 3 falls back to a pre-recorded screencast; scenario 5 falls back to "the Claude version of this is scenario 1"
- [ ] Same-day dry-run checklist: verify the 3 specialist agents each invoke their full Tool sequence (visible in OpenClaw UI); verify Synthesis agent receives all 3 upstream outputs before composing the final recommendation

**Stakeholder presentation deliverables**

- [ ] One-page brief summarizing each scenario's "what it proves" and "what to ask the system live"
- [ ] **Source-code link sheet** (per § 5.A) listing each MCP tool with its source file path — included in the MD's handout / slide deck so a curious stakeholder can verify "this is real, named, named-and-versioned code"
- [ ] Cost / budget accounting per scenario: Inoreader calls, MCP rate-limit consumption (verified against `/health` + Sentry breadcrumbs)
- [ ] FAQ document anticipating stakeholder questions: security, hallucinations, what it does NOT do, how it compares to ChatGPT + web search, how the GST surface differs from generic AI
- [ ] **30-minute presentation outline**: ~3 min intro + scenario 1 (5 min) + scenario 2 (7 min) + scenario 3 (5 min OpenClaw teaser) + scenario 4 (open-ended, budget 5-7 min) + scenario 5 (7 min OpenClaw cherry) + ~3 min closing. Total wall-clock budget ~30-35 min including stakeholder Q&A weaved in.

**Post-demo capture**

- [ ] Stakeholder feedback synthesized into a follow-up doc; one section per scenario noting "this resonated" / "this fell flat" / "this surfaced a gap"
- [ ] "What else?" prompts from scenario 4 logged verbatim; the ones that surfaced unexpected use cases become candidate BL-items (potentially shaping BL-033 pilot scope or new BL-04X initiatives)
- [ ] Any runtime issues observed (rate-limit hits, OAuth fails, Tool errors, OpenClaw quirks) filed as BACKLOG items or BL-032.25-style soak findings
- [ ] If scenario 5 surfaced the BL-040 fan-out pattern, evidence captured for the BL-040 implementation work

### Technical Context

**Why Claude Desktop is the primary demo target**

Claude Desktop already passed end-to-end production verification during the BL-032.5 soak (T.K.1 + T.K.2 PASS, 2026-05-13). The demo doesn't need to prove the substrate works — it needs to _demonstrate what the working substrate enables_. Claude Desktop is:

1. **Already proven**: production-deployed connector, T.K-verified
2. **Familiar UX**: stakeholders know it
3. **Live-demoable**: type a prompt, watch the tool call happen visibly in real time
4. **The likely pilot-client surface for BL-033**: external pilots will most often consume the GST MCP via Claude Desktop or Claude Code; the demo reflects the real consumption pattern

**Why OpenClaw is the secondary demo target**

OpenClaw is the lowest-friction agent-framework integration target if/when we want to layer autonomous orchestration on top:

1. **Native streamable-HTTP MCP support** — matches BL-032's transport choice exactly
2. **Native bearer-token auth** — matches our `MCP_KEY_*` model
3. **Per-agent MCP server assignment** — allows the specialized-agent pattern (each agent gets only the tools it needs)
4. **Skill registry pattern** — model for productizing scenarios as reusable "GST skills" if the demo lands

Alternatives considered for the agent-framework slot:

- **AutoGen** — Python-native, less native MCP support, more code to wire up
- **CrewAI** — multi-agent strong, MCP support less mature
- **LangGraph** — most flexible but most engineering work to demo

**Out of scope** (defer)

- **Productized agent deployment** — demo agents are stateless throwaways; BL-033 covers external pilot clients (which may or may not use OpenClaw as their orchestrator)
- **Persistent agent memory / cross-session learning** — agents stateless per scenario
- **Slack / Teams integration** — OpenClaw supports it; not load-bearing for stakeholder demo
- **Cost optimization for production agent traffic** — BL-040 fan-out debounce belongs there if/when the demo reveals it as a real problem
- **Anthropic Console / API direct integration** — Claude Desktop is the demo surface; raw API integration is a future evangelism vehicle if the demo lands

---

## 3. Open questions — iteration checklist

Each of these is something to lock down before this gets transcribed into BACKLOG.md. Tracked here so the iteration history is visible.

| #   | Question                                                                                                                                                                                                                                             | Default proposal                                                                                                                                                                                                                                                                                                                                                            | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Effort calibration** — is 2-4 days realistic (post-pivot to Claude-first)? Cut to 1.5 days (Claude only, defer OpenClaw)? Extend to 1 week (polished, video assets)?                                                                               | 2-4 days as-drafted post-pivot                                                                                                                                                                                                                                                                                                                                              | ✅ **Locked 2026-05-13: 2-4 days**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Q2  | **Stakeholder audience** — internal partners only? External would-be pilot clients? Both?                                                                                                                                                            | Internal first; external assets seeded but not the primary objective                                                                                                                                                                                                                                                                                                        | ✅ **Locked 2026-05-13: Managing Director** (internal). Framing throughout the doc calibrated for this audience — less time per scenario, more decision-relevant framing, less tolerance for clicking-through-forms UX.                                                                                                                                                                                                                                                                                                                                       |
| Q3  | **Scenario priorities** — which of the 5 Claude scenarios + 1 OpenClaw lands best for the stakeholder mix? All 6? Cut to top 3? Add anything?                                                                                                        | All 6; flexible to drop live if running long; scenario 1 is mandatory (lead demo)                                                                                                                                                                                                                                                                                           | ✅ **Locked 2026-05-13: 5 scenarios** — original "Full diligence walkthrough" (5-stage Claude form-fill) dropped per RP feedback as too form-heavy for MD audience. Original "Market pulse" Claude scenario replaced with OpenClaw radar-on-command (single-agent teaser ahead of the multi-agent cherry). Final scenario list: (1) sales call → diligence agenda, (2) cross-jurisdictional regs, (3) OpenClaw radar teaser, (4) Claude open-ended, (5) OpenClaw multi-agent cherry.                                                                          |
| Q4  | **Recording / capture format** — text transcripts (cheap, replayable as text) or video screencast (higher-fidelity, harder to update)?                                                                                                               | Text transcripts as canonical; video for scenario 1 specifically (it's the marketing asset)                                                                                                                                                                                                                                                                                 | ✅ **Locked 2026-05-13: Default accepted** — text transcripts as canonical record; video for scenario 1 only (marketing asset value). Scenarios 2-5 ship with text transcripts saved to `src/docs/demos/BL-032_6/scenario-<N>-<title>.md` per the Acceptance Criteria.                                                                                                                                                                                                                                                                                        |
| Q5  | **Privacy / data caveats** — real portfolio data, anonymized, or synthetic?                                                                                                                                                                          | Real portfolio data for scenarios 2-5 (already anonymized at source per BL-031.x); synthetic-target sales call for scenario 1                                                                                                                                                                                                                                               | ✅ **Locked 2026-05-13: Default accepted** — anonymized-real portfolio data for scenarios 2-5 (BL-031.x anonymizes engagement code names at the data layer, so the MD audience sees real engagement signal without exposing client identities); synthetic MedSig Health profile for scenario 1 per § 1.A.                                                                                                                                                                                                                                                     |
| Q6  | **OpenClaw deployment (scenarios 3 + 5)** — hosted OpenClaw cloud OR self-hosted swarmclaw runtime?                                                                                                                                                  | Hosted cloud for demo speed; self-hosted is overkill for a one-off demo                                                                                                                                                                                                                                                                                                     | ✅ **Locked 2026-05-13: Default accepted** — hosted OpenClaw cloud for both scenarios 3 (single-agent teaser) and 5 (multi-agent cherry). Self-hosted would add infra burden with no demo benefit. Cloud also sidesteps the hardware-constraint concern that motivated the Rev 6 safe/stretch design — though we keep the safe/stretch split as a runtime-cost hedge regardless.                                                                                                                                                                              |
| Q7  | **Live failure handling** — what if a Tool 500s mid-demo? Demo "magic" disrupted by reality?                                                                                                                                                         | Pre-test all scenarios same-day; backup recorded video for scenario 1 minimum; gracefully skip the OpenClaw cherry if it fails on stage                                                                                                                                                                                                                                     | ✅ **Locked 2026-05-13: Default accepted** — pre-test all scenarios same-day; backup recorded video for scenario 1 minimum; gracefully skip scenario 5 (cherry) if it fails on stage. Per-scenario failure-mode bullets already shipped throughout § 2 (each scenario's "Live-demo failure modes & fallbacks"). Pre-show runbook combines these into a single fallback decision tree as part of the demo-day checklist.                                                                                                                                       |
| Q8  | **Scope re: BL-040 fan-out** — if scenario 5 (cherry) triggers the parallel-refresh fan-out we documented, fix it pre-demo or let it surface?                                                                                                        | Defer; let it surface; lets us close BL-040 with the post-demo evidence                                                                                                                                                                                                                                                                                                     | ✅ **Locked 2026-05-13: Default accepted** — defer BL-040 fix; let the fan-out surface during scenario 5 if it triggers (real production traffic is the best way to close the optimization decision). Post-demo evidence becomes the BL-040 implementation kickoff signal.                                                                                                                                                                                                                                                                                    |
| Q9  | **Anything missing from the scenarios** — is there a use case I haven't surfaced that you actually care about?                                                                                                                                       | _none surfaced yet_                                                                                                                                                                                                                                                                                                                                                         | ✅ **Locked 2026-05-13: None surfaced** — scenario 4's open-ended interactive segment will surface emergent use cases live; those become candidate BL-04X initiatives per the post-demo capture acceptance criteria.                                                                                                                                                                                                                                                                                                                                          |
| Q10 | **Workflow** — commit this WORKING_DOC + the eventual BACKLOG entry to `dev` directly, or feature-branch + PR?                                                                                                                                       | Direct to dev for the working doc (low-risk); PR for the eventual BACKLOG entry (so it's a discoverable transition)                                                                                                                                                                                                                                                         | ✅ **Locked 2026-05-13: Default accepted** — working doc committed direct to `dev`; eventual BACKLOG transcription (when iteration questions are all sufficiently resolved + transition plan in § 5 fires) goes through a PR for discoverable visibility. Working doc commit executed at end of Rev 7.                                                                                                                                                                                                                                                        |
| Q11 | **Scenario 1: Tool or Prompt?** — does Claude invoke the `generate_diligence_agenda` Tool directly, OR the `gst_diligence_kickoff` Prompt that orchestrates it?                                                                                      | Prompt (`gst_diligence_kickoff`). It's the more compelling demo because (a) stakeholders see the pinnable-prompt UI in Claude Desktop, (b) it demonstrates orchestration not just a function call, (c) it represents the "consultant workflow" framing that maps cleanly to partner mental models. The direct Tool call stays available as a fallback if the Prompt errors. | ✅ **Locked 2026-05-13: Prompt (`gst_diligence_kickoff`)**. The Prompt orchestrates the underlying Tool + auto-embeds the VDR Library article via its `orchestrates: [...]` field. Direct-Tool fallback preserved in scenario 1's failure-mode runbook.                                                                                                                                                                                                                                                                                                       |
| Q12 | **Scenario 1: Sales-call data origin** — synthetic transcript, anonymized real call, or live role-play during the demo?                                                                                                                              | Synthetic but realistic ("MedSig Health" example in the spec); pre-staged in clipboard for paste-in speed. Live role-play optional if the demonstrator + a teammate are comfortable. Real anonymized calls would need legal/consent review before show.                                                                                                                     | ✅ **Locked 2026-05-13: Synthetic but realistic** — MedSig Health notes engineered to map 6/13 dimensions cleanly + defer 7 to `'unknown'`. Pre-staged in clipboard. Avoids any consent / legal review burden.                                                                                                                                                                                                                                                                                                                                                |
| Q13 | **MedSig Health example tone** — is the synthetic profile (European Series-B healthcare SaaS, ~$22M ARR) realistic enough for stakeholders to engage with? Fill out as much data reflecting the tool's inputs as possible, deferring some if needed. | The current draft target is plausible but generic. Refine to populate maximum tool-input dimensions from the call notes; let the unknown-sentinel pattern carry the remainder.                                                                                                                                                                                              | ✅ **Locked 2026-05-13: Yes, with refined call notes**. Notes engineered to populate 6 of 13 dimensions (productType, revenueRange, growthStage, geographies, businessModel, dataSensitivity, plus targetName) and defer 7 to `'unknown'` (transactionType, techArchetype, headcount, companyAge, scaleIntensity, transformationState, operatingModel). The 7-unknown count triggers the Prompt's "Low-confidence baseline" callout — most authentic intro-call output, and a key honesty-of-system demo moment. See § 1.A input-mapping table in scenario 1. |

---

## 4. Iteration log

Track what changes between revisions of this doc + why. Append as we go.

### 2026-05-13 — Initial draft

- First-cut spec drafted from synthesis of:
  - Current MCP surface (BL-031.5 + BL-031.75 + BL-032 + BL-032.5)
  - OpenClaw 2026 framework overview ([clawbot.blog](https://www.clawbot.blog/blog/openclaw-the-ai-agent-framework-explained-april-2026-update/))
  - OpenClaw MCP integration specifics ([docs.openclaw.ai](https://docs.openclaw.ai/cli/mcp))
- 5 demo scenarios proposed, escalating in orchestration complexity, OpenClaw as primary integration target
- 10 open questions queued for iteration
- Owner: RP — awaiting first-pass feedback on Q1–Q10

### 2026-05-13 — Revision 2: Claude-first pivot

**Trigger**: RP feedback: _"we need to feature Claude direct integration more than OpenClaw, since it is more ready to showcase and will be easier to demo in a live scenario. The OpenClaw integration to show the agentic loop is the cherry on top. Refactor scenario one to use Claude to use the diligence machine tool (or a prompt linked to it) to take information from a Sales call to populate an initial diligence agenda."_

**Changes**:

- **Title** updated: "OpenClaw Integration & Stakeholder Demo" → "Claude Desktop Demo + OpenClaw Cherry". Reflects the actual demo priority.
- **Section 1** rewritten to frame Claude Desktop as the primary demo target (already T.K-verified, familiar UX, live-demoable) and OpenClaw as the closing flourish ("what autonomy on top looks like"). Both still have technical-fit blocks; the priority is the explicit framing change.
- **Effort estimate** revised: 3-5 days → 2-4 days. Claude scenarios drop the OpenClaw setup overhead; OpenClaw becomes optional-but-recommended.
- **User story** updated to lead with Claude Desktop workflows; added explicit goal #4 ("distinguish what works in Claude today from what's possible with agent orchestration on top").
- **Scenarios completely restructured**:
  - **Scenario 1** (lead demo): refactored from "OpenClaw fan-out for founder-pitch triage" to **"Sales call → Diligence agenda" via Claude Desktop**. Concrete sales-call notes (synthetic MedSig Health example) → `gst_diligence_kickoff` Prompt → structured diligence agenda. The most realistic, stakeholder-grokkable workflow we can show; live-demoable in ~60 seconds. Includes BL-031.95 hub-deeplink continuity as a "you can keep editing in the website UI" callout.
  - **Scenarios 2-5**: all reframed as Claude Desktop scenarios (no longer OpenClaw-driven). Operator pins Resources manually in Claude Desktop UI (visible signal for stakeholders). Scenario 4 ("Full diligence pipeline") became "Full diligence walkthrough" — human-driven prompt sequencing rather than autonomous chaining.
  - **Scenario 6 (NEW)**: 🍒 OpenClaw autonomous agentic loop — takes scenario 1's workflow and runs it autonomously via 4-agent fan-out + synthesis agent. Explicitly framed as "production-ready today" (scenarios 1-5) vs "substrate-ready, productization-pending" (scenario 6). Designed to gracefully skip if it fails on stage.
- **Acceptance Criteria** restructured into Claude (load-bearing) + OpenClaw (optional-but-recommended) tracks. Demo ships even if OpenClaw segment slips.
- **Technical Context** reframed: leads with "why Claude Desktop is primary"; OpenClaw rationale demoted to secondary section.
- **Open questions**: Q1 (effort) recalibrated; **3 new questions added**:
  - Q11: Tool (`generate_diligence_agenda`) vs Prompt (`gst_diligence_kickoff`) for scenario 1 — preferred: Prompt
  - Q12: Sales-call data origin — preferred: synthetic-but-realistic (MedSig Health)
  - Q13: Whether the MedSig Health profile is realistic enough for the target stakeholder audience

**What didn't change**: Q2-Q10 substantively (audience, capture format, privacy, OpenClaw deployment, failure handling, BL-040 scope, missing scenarios, workflow).

**Owner**: RP — awaiting second-pass feedback on the pivot + Q11/Q12/Q13.

### 2026-05-13 — Revision 3: Scenario 1 input-shape engineering (Q11+Q12+Q13 locked)

**Trigger**: RP feedback on Q11/Q12/Q13: _"Q11 - ok yes the prompt; Q12: agreed; Q13: yes. but fill out as much data reflected the tools inputs as possible, deferring some if needed."_

**Investigation**: read [diligence-kickoff.ts](../../../mcp-server/src/prompts/diligence-kickoff.ts) + [diligence-shape.ts](../../../mcp-server/src/prompts/diligence-shape.ts) + [wizard-config.ts](../../data/diligence-machine/wizard-config.ts) to extract the exact `argsSchema` of the `gst_diligence_kickoff` Prompt: 14 fields (targetName + 13 typed enums), each enum defaulting to `'unknown'` via `userInputsShapeFromWire()`. Found the **`unknownDimensions >= 7` threshold** in the Prompt body that gates the "Low-confidence baseline" callout.

**Changes**:

- **Scenario 1 expanded** with three new pieces:
  - **Verbatim pre-staged call-notes block** — engineered with PE-realistic prose (COO ex-Cerner; revenue in €; "Atomico" Series-B; GDPR/BDSG/CNIL specifics; "PE-pattern flag" line on infra evasiveness). Reads as if a partner actually took the notes.
  - **Refined input prompt text** — explicitly invokes `gst_diligence_kickoff` Prompt and instructs "leave the rest as `'unknown'` — don't guess" (matches the system-prompt addendum rule 4)
  - **New § 1.A — Input-mapping table** — exhaustively maps each of the 14 dimensions to its derivation status (populated vs `'unknown'`) with source-line citations into the call notes. Confirms 6 populated / 7 unknown, which is the threshold that fires the "Low-confidence baseline" callout
- **"What Claude does" expanded** to 5 explicit steps: Prompt-form rendering → Tool call → Library article embed → kickoff memo with the specific 6 sections from the Prompt body (target context, prioritized agenda, attention areas, VDR requests, deeplink) → low-confidence callout in section (0)
- **Showcase bullets** tightened: now explicitly cites the threshold mechanism as the honesty-of-system demo moment
- **Failure modes** updated: noted Zod errors most likely on `geographies` (it's the only array field with stricter wire parsing — `arrayFromWire`); explicit casting `geographies: ['eu']` is the typed-recovery path

- **Q11, Q12, Q13 all locked** in the open-questions table with ✅ Locked 2026-05-13 stanzas

**What's still open**: Q1-Q10 (effort calibration, audience, scenarios 2-6 priorities, capture format, privacy, OpenClaw deployment, failure handling, BL-040 scope, missing scenarios, workflow).

**Owner**: RP — Q1-Q10 still open for next-round feedback. Scenario 1 is now production-ready as a demo script.

### 2026-05-13 — Revision 4: Scenario 4 invocation-mechanism clarification

**Trigger**: RP question: _"for scenario 4 - are these prompts pinned or are they organically used by claude through normal conversation within claude?"_

**Resolution (factual)**: Claude Desktop pins **Resources** (persistent pills above chat input — T.K.1 + T.K.2 use this pattern). **Prompts are not pinnable** — they're invocations that produce one-shot content into the conversation. Prompts can be triggered two ways:

1. **Explicit `+` menu**: user clicks `+` → connector → Prompts tab → picks a prompt → argsSchema renders as form → user fills/defaults → submits
2. **Organic / natural-language**: user mentions the prompt name in prose; Claude infers args from context and calls `prompts/get` directly

**Design decision**: scenarios 1 and 4 use DIFFERENT mechanisms by design — the contrast is the demo signal.

- **Scenario 1** uses **organic invocation** because the magic moment is Claude translating prose ("partner needs a 1-page agenda from these notes") into a structured tool call. Hiding that under a menu click would dampen the impact.
- **Scenario 4** uses **explicit menu invocation** because the load-bearing claim of the scenario is showing the **prompts surface as a discoverable menu of named consultant workflows**. The visible UI action IS the demo signal.

**Changes**:

- **Scenario 1** annotated with a new `Invocation mechanism` bullet making the organic path explicit; clarified that `prompts/get` is the under-the-hood mechanism (Claude doesn't render a form when invoked this way — it just calls the prompt directly with inferred args)
- **Scenario 4** restructured with three new pieces:
  - New `Invocation mechanism` bullet stating the explicit `+` menu mechanism + why (vs scenario 1's contrast)
  - New `Note on pinning vs invocation` bullet calling out the Resources-pinned-as-pills (scenarios 2+3) vs Prompts-invoked-as-actions (scenario 4) distinction — worth narrating live during the demo transitions
  - New **§ 4.A — Invocation mechanism walkthrough** detailing exactly what stakeholders see at each of the 5 stages (click, navigate, select, form-fill, submit, narrate, repeat). Includes the wall-clock budget math (90s × 5 stages + 2.5min narrative bookends = ~10 min total).
  - Added `Live-demo failure modes & fallbacks` bullet (parallels scenario 1's same section)
- **Scenario 4 stages table** rewritten with richer "what happens at this stage" column — now tells the narrator what to highlight at each stage, not just what each prompt does
- **Iteration log** (this entry) records the design rationale + the factual clarification on Claude Desktop's pinning vs invocation semantics, so future readers don't re-litigate the same question

**Additional fix**: stray "V" character on line 29 ("absorb.V") from a prior linter run — corrected.

**What's still open**: Q1-Q10 (effort calibration, audience, scenarios 2-3-5-6 polish, capture format, privacy, OpenClaw deployment, failure handling, BL-040 scope, missing scenarios, workflow). Scenarios 1 and 4 are now demo-script-ready; scenarios 2-3-5 still need similar input-shape engineering if we want them to be paste-and-go.

**Owner**: RP — Q1-Q10 still open. Suggest next-round focus: Q3 (do scenarios 2-3-5-6 need the same depth of scripting as 1+4, or are they less critical?) + Q1 (does the now-deeper scenario detail change the effort estimate?).

### 2026-05-13 — Revision 5: Audience locked (MD) + scenario restructure + verification + tool URLs

**Trigger**: RP feedback on Q1/Q2/scenarios 3/4/5/6:

> _"Q1. ok. Q2. Managing Director; Scenario 4 is not useful, no body reads the news by prompting claude. Instead replace with OpenClaw AI agent pulling radar news from GST on command (and as a hint to the cherry coming later). Scenario 4 seems too bulky with all that manual data entry into claude, field by field. not good for a demo. replace or remove to something more effortless seeming. Scenario 5 - these need to verifyably hit GST's MCP resources. how should we ensure that? Scenario 6. - should include the URL of each tool to link to."_

**Interpretation**: RP's two "scenario 4" references combined feedback on the prior scenarios 3 (Claude radar pulse — replace with OpenClaw teaser) and 4 (full diligence walkthrough — too form-heavy, drop). Plus verification (scenario 5 → now 4) and tool-URL linkage (scenario 6 → now 5).

**Changes**:

- **Q1 locked**: 2-4 days effort estimate confirmed
- **Q2 locked**: Managing Director audience. Framing throughout the doc calibrated to this — less time per scenario, more decision-relevant framing, less tolerance for form-fill UX
- **Q3 locked**: Final scenario count reduced from 6 to **5 total**, with structure pivoted:

| #   | Mechanism                          | Title                            | Time          | Rev-5 disposition                                       |
| --- | ---------------------------------- | -------------------------------- | ------------- | ------------------------------------------------------- |
| 1   | Claude Desktop (organic)           | Sales call → Diligence agenda    | 5 min ⭐ LEAD | unchanged                                               |
| 2   | Claude Desktop (Resources pinning) | Cross-jurisdictional deal review | 7 min         | unchanged                                               |
| 3   | OpenClaw single-agent (teaser)     | Radar pull on command            | 5 min         | **NEW** — replaces prior "Market pulse" Claude scenario |
| 4   | Claude Desktop (open-ended)        | "What else?" interactive         | open          | **renumbered from 5**, added § 4.A verification         |
| 5   | OpenClaw multi-agent (cherry)      | Autonomous diligence triage      | 5-7 min 🍒    | **renumbered from 6**, added § 5.A tool-URL map         |

**Dropped**: original scenario 4 (Full diligence walkthrough — 5-stage human-driven prompt sequencing). RP feedback: too bulky, manual data entry field-by-field across 5 stages isn't a good demo for an MD. The middle ground (human-driven multi-stage) was the worst of both worlds vs scenario 1 (single invocation, magic moment) and scenario 5 (full autonomous fan-out).

- **Scenario 3 (NEW)** — OpenClaw single-agent radar pull on command:
  - Single `radar-analyst` agent, single command, structured 3-bullet briefing in GST Take voice
  - Establishes "agents can do this autonomously" without scenario 5's multi-agent complexity
  - Plants the seed for scenario 5 — narrator cue at close: _"Notice this is one agent doing one thing. Hold this in mind — in a few minutes we'll see the same kind of agent loop scaled to a 4-agent fan-out doing the full diligence triage."_
  - RP's reasoning verbatim: "nobody reads the news by manually prompting their chatbot" — radar consumption in real use is push/pull from a workflow, not chat
- **Scenario 4 (was 5)** — open-ended interactive, with new **§ 4.A Verification mechanism** (4-layer answer to RP's "how do we ensure prompts hit GST MCP, not training knowledge?"):
  1. **Visible tool-call rendering in Claude UI** — strongest signal; demonstrator's first verification cue ("look at the tool call right there")
  2. **System-prompt addendum biases first sentence to name the MCP tool** — readable self-declaration of intent
  3. **GST-specific pre-seeded prompts** whose answers are only derivable from MCP data (4 pre-staged provocations updated to require portfolio/ICG/regulations specifics)
  4. **`/health` snapshot sidebar** showing rate-limit + Inoreader-call deltas — technical-receipt fallback for the most-skeptical MD
  - Plus an explicit demonstrator narration pattern (3 steps: point at call, point at response, call out the GST-specifics)
- **Scenario 5 (was 6)** — OpenClaw multi-agent cherry, with new **§ 5.A Agent / Tool / Source-code map** answering RP's "include the URL of each tool":
  - Table with 5 rows (Portfolio / Radar / Regulatory / TechPar agents + Synthesis), each linking to its actual source file path in the repo
  - Plus a "bonus tools" table covering 3 not-in-this-scenario tools (`generate_diligence_agenda`, `assess_infrastructure_cost_governance`, `estimate_tech_debt_cost`) for "what else?" Q&A grounding
  - Demonstrator narration cue: name each tool out loud + reference the source link in the slide deck
  - Source paths verified by `grep` against `mcp-server/src/tools/*.ts` before linking
  - New § 5.B "End-to-end flow" preserves the original step-by-step description below the map
- **Scenarios intro paragraph** rewritten as a 5-row table showing the new shape, with rationale for the dropped scenario explicitly captured
- **Scenario 1's invocation-mechanism bullet** updated — removed contrast reference to the dropped scenario 4, replaced with standalone explanation of organic invocation
- **Acceptance Criteria** restructured into "Claude Desktop setup (scenarios 1, 2, 4)" + "OpenClaw setup (scenarios 3 + 5)" tracks. New acceptance line: source-code link sheet for the MD's handout. 30-min presentation outline recalibrated: 3 + 5 + 7 + 5 + 5-7 + 7 + 3 ≈ 30-35 min.

**What's still open**: Q4 (capture format), Q5 (privacy/data), Q6 (OpenClaw deployment — hosted vs self-hosted), Q7 (live failure handling — partially addressed via per-scenario fallbacks but the global fallback strategy isn't locked), Q8 (BL-040 scope during demo), Q9 (anything missing), Q10 (commit workflow).

**Owner**: RP — Q4-Q10 still open. Suggest next-round focus: Q10 (commit this working doc to `dev` as a checkpoint? It's at ~600 lines and a full structural revision; persisting it across sessions is now valuable) + Q7 (overall failure-handling strategy across the 5-scenario arc).

### 2026-05-13 — Revision 6: Scenario 5 hardware-constrained re-scope (2 safe / 3 stretch)

**Trigger**: RP feedback on scenario 5 (referenced as "scenario 6" — pre-Rev-5 numbering):

> _"scenario 6 is unlikely to work due to hardware limitations; change the scenario to one that only fans out to 2 (safe) and then 3 (stretch goal) - choose different prompts to use with multi-agents workflow (both fan out to 2 and fan out to 3 scenarios)"_

**Constraint diagnosis**: local OpenClaw agent runtimes consume RAM per parallel context. The original 4-specialist-agent design (Portfolio, Radar, Regulatory, TechPar) + Synthesis = 5 simultaneous contexts, likely above the demo-laptop's hardware ceiling.

**Design pivot**: replace tool-per-agent (single MCP call per agent) with **prompt-per-agent** (each agent invokes one of the named consultant Prompts, which itself orchestrates 1-4 tools internally). This compresses the agent count without losing substrate-exercise depth — actually INCREASES depth because each prompt is a richer workflow than a single tool call.

**Investigation**: grepped `mcp-server/src/prompts/*.ts` for `orchestrates:` declarations to get the per-prompt tool fan-out profile:

- `gst_target_quick_look` → 4 tools (ICG + TechPar + tech-debt + regulations)
- `gst_comparable_engagements_memo` → 2 tools (portfolio search + facets)
- `gst_regulatory_exposure_brief` → 1 tool + Resources (regs search + regs corpus)
- Other prompts considered but not used: `gst_diligence_kickoff` (already scenario 1's load-bearing prompt — re-use would feel redundant), `gst_radar_brief_today` (already scenario 3's substrate), `gst_architecture_layer_review` / `gst_vdr_audit` / `gst_diligence_handoff_memo` (Resource-leaning rather than tool-fan-out-y; less interesting for showing tool orchestration)

**Final choice for the agent pair**:

- **Safe variant (2 specialists + Synthesis = 3 OpenClaw contexts)**:
  - Target-fit agent → `gst_target_quick_look` → 4-tool sub-fan-out → "is this worth our time?"
  - Comparable-engagements agent → `gst_comparable_engagements_memo` → 2-tool sub-fan-out → "have we done this before?"
  - Synthesis → partner-decision verdict combining both
- **Stretch variant (3 specialists + Synthesis = 4 OpenClaw contexts)** — adds:
  - Regulatory-exposure agent → `gst_regulatory_exposure_brief` → 1-tool + Resources sub-fan-out → "what's the regulatory risk?"

**Why this pair / triple choice for the MD audience**:

- The two questions a partner asks first when triaging a deal are "does this fit our model?" (outward) and "have we done similar before?" (inward). Safe variant nails both.
- The stretch adds the third partner-question ("what's the regulatory risk?") — a regulatory-exposure brief is the natural escalation for international deals like MedSig's (EU jurisdictions, healthcare data).
- The three prompts produce structured outputs that synthesize cleanly into a partner-decision recommendation.

**Changes**:

- **Scenario 5 fully rewritten**:
  - New intro identifies safe vs stretch variants with a comparison table (2 vs 3 specialist agents)
  - Hardware-constraint rationale + pre-show hardware-check process documented
  - § 5.A restructured into three sub-sections: Safe variant table / Stretch variant table / Bonus tools table
  - § 5.A now maps each agent to a **Prompt** (not a Tool), with prompt source path + internal tool sub-fan-out paths — three layers of links for the MD's handout
  - § 5.B (end-to-end flow) updated for the safe variant; stretch variant flow noted as additive
  - "Architectural payoff" bullet added to Showcase: three orchestration layers (OpenClaw agents → consultant Prompts → leaf Tools) all named, versioned, inspectable
- **Acceptance criteria** updated:
  - Split the scenario-5 line into safe-variant (load-bearing) + stretch-variant (conditional)
  - Added "pre-show hardware-check checklist" as a new deliverable
- **Demonstrator narration cue** rewritten to reference the three layers (agent → prompt → tools) so the demo lands the architectural depth, not just the magic

**What's still open**: Q4-Q10 unchanged. Q7 (failure-handling) is now even more important — the scenario 5 fallback chain has gotten richer (stretch → safe → pre-recorded screencast → "the Claude version is scenario 1").

**Owner**: RP — suggest next-round focus on Q10 (commit checkpoint to `dev`) + Q5 (data caveats — what's the actual MD-audience policy on whether real portfolio data shows up in scenarios 1, 5, with their possible attendees?).

### 2026-05-13 — Revision 7: Q4-Q10 all locked (defaults accepted), working doc committed to dev

**Trigger**: RP feedback: _"the default proposals are accepted proceed with them"_

**Resolution**: all 7 remaining open questions resolved by accepting the default proposals as drafted. Specific lockdowns:

- **Q4 — Capture format**: text transcripts canonical; video for scenario 1 (marketing asset)
- **Q5 — Privacy / data**: anonymized-real portfolio data for scenarios 2-5; synthetic MedSig Health for scenario 1
- **Q6 — OpenClaw deployment**: hosted cloud for scenarios 3 + 5 (sidesteps local-RAM concern; safe/stretch split kept anyway as cost hedge)
- **Q7 — Live failure handling**: per-scenario fallbacks already in § 2; pre-show runbook consolidates them into one decision tree
- **Q8 — BL-040 fan-out scope**: defer fix; let it surface during scenario 5; post-demo evidence kicks off BL-040 implementation
- **Q9 — Missing scenarios**: none surfaced; scenario 4's open-ended segment will harvest emergent use cases live
- **Q10 — Workflow**: working doc → direct to dev (executing at end of this Rev); BACKLOG transcription → through a PR when transition plan fires

**Also fixed in this rev**: stale references to "scenario 6" in the Q6 + Q8 column text — updated to reflect post-Rev-5 numbering (scenario 5 = OpenClaw cherry; scenarios 3 + 5 are the two OpenClaw segments).

**All 13 iteration questions now locked**:

| Range                                                                        | Status                                              | Resolved in        |
| ---------------------------------------------------------------------------- | --------------------------------------------------- | ------------------ |
| Q1 (effort)                                                                  | ✅ 2-4 days                                         | Rev 5              |
| Q2 (audience)                                                                | ✅ Managing Director                                | Rev 5              |
| Q3 (scenario priorities)                                                     | ✅ 5 scenarios, dropped diligence walkthrough       | Rev 5              |
| Q4-Q10 (capture / data / deployment / failure / BL-040 / missing / workflow) | ✅ All defaults accepted                            | Rev 7 (this entry) |
| Q11 (scenario 1: Tool vs Prompt)                                             | ✅ Prompt (`gst_diligence_kickoff`)                 | Rev 3              |
| Q12 (scenario 1: data origin)                                                | ✅ Synthetic                                        | Rev 3              |
| Q13 (MedSig Health archetype)                                                | ✅ Engineered to 6 populated / 7 unknown dimensions | Rev 3              |

**Spec is now requirements-complete.** The doc is ready to graduate from "working draft" status to "design companion + BACKLOG.md entry" per the Transition plan in § 5 — but that transition is its own commit / PR cycle. This Rev 7 commit locks the requirements-complete state.

**Next action (executed alongside this Rev 7 commit)**: Q10 acceptance fires — commit + push working doc to `dev`. After this commit lands, future work splits into:

1. **Implementation** (the demo itself): scripting + dry-runs + stakeholder prep against the locked spec
2. **BACKLOG.md transcription** (the canonical entry): goes through a PR per Q10's PR-track decision

**Owner**: RP — spec locked, demo implementation work unblocked.

### 2026-05-14 — Revision 8: OpenClaw client-compat research + cloud-models upgrade

**Trigger**: two parallel discoveries during scenario-5 implementation prep:

1. RP observation while wiring the OpenClaw agent: _"it doesn't seem that openclaw is capable of consuming prompts or resources from the MCP."_ Triggered a research pass on OpenClaw's MCP client capability surface.
2. RP infrastructure change: _"I have upgraded the demo agent models to use cloud (instead of local) that will help to unblock the concurrent demo we have slated."_ Removes the RAM constraint that motivated Rev 6's safe/stretch split.

**Research findings (OpenClaw client compatibility)**:

- OpenClaw's MCP client tooling (`mcporter`, 0.10.0+) implements `tools/list`+`tools/call` and `resources/list`+`resources/read` — Tools and Resources fully supported.
- **Prompts are NOT consumable** — no `prompts/list` or `prompts/get` in `mcporter`. Both feature requests asking for full primitive parity ([openclaw#8188](https://github.com/openclaw/openclaw/issues/8188), [openclaw#29053](https://github.com/openclaw/openclaw/issues/29053)) filed and closed stale.
- The 8 `gst_*` Prompts are unreachable from any OpenClaw-orchestrated agent. The hub-side Tools (`generate_diligence_agenda`, `search_radar`, `compute_techpar`, etc.) and all ~130 Resources (`gst://library/*`, `gst://regulations/*`, `gst://radar/*`) are fully reachable.

**Workaround applied (already implemented on the OpenClaw side, per RP)**: each scenario-5 specialist agent's system prompt is hand-authored to reproduce the equivalent `gst_*` Prompt's Tool sequence. The Prompt source files become the **design specification** for each agent (consulted at agent-design time) rather than runtime artifacts. Claude Desktop scenarios (1, 2, 4) keep using server-side Prompts — Claude Desktop's MCP client implements all three primitives, so the surface-mismatch only affects OpenClaw paths.

**Changes**:

- **Scenario 5 § 5.A fully rewritten**: collapsed safe/stretch variants into a single 3-specialist + Synthesis configuration; renamed the table from "Agent / Prompt / Tool / Source-code map" to "Agent / Tool-sequence / Source-code map"; reworded "agent invokes `gst_*` Prompt" → "agent's system prompt composes the Tool sequence the equivalent Prompt would have orchestrated"; added paragraph clarifying that Prompt source files remain authoritative as workflow specifications even though OpenClaw can't invoke them
- **Scenario 5 § 5.B rewritten**: dropped the safe-variant flow + stretch-variant addendum + pre-show hardware-check; replaced with a single 3-specialist parallel-fan-out flow; "Architectural payoff" bullet revised to reflect workflow-spec-as-source-of-truth (vs Prompt-at-runtime) layering
- **Acceptance criteria § OpenClaw setup rewritten**: removed the safe-variant load-bearing + stretch-variant conditional + pre-show hardware-check items; replaced with single 3-specialist verification + Tools/Resources discovery (with explicit "Prompts not consumable — this is by design" callout); updated `MCP_KEY_OPENCLAW_DEMO` to canonical `MCP_KEY_OC` token name issued 2026-05-14
- **HANDOVER doc** updated in lockstep (`MCP_SERVER_OPENCLAW_HANDOVER_BL-032_6.md`): added § 2.0 "Known consumer compatibility" callout at the top of the capability inventory, added warning banner to § 2.2 Prompts header, rewrote § 2.2 BL-032.6 scenario-5 mapping bullets to reflect Tools+Resources-only composition

**Honest framing addition**: scenario 5's "what if" pitch now intentionally exercises the surface that ALL MCP clients support today (Tools + Resources), not the surface some clients haven't shipped yet (Prompts). That's a more accurate story for "what production agent integration looks like in 2026" — the lowest common denominator is Tools+Resources, and a healthy agent design uses the Prompt source files as workflow specs even when the client can invoke them, because system-prompt composition gives the agent more control over the conversation arc anyway.

**What didn't change**: scenarios 1, 2, 3, 4 unchanged. Scenario 1 keeps `gst_diligence_kickoff` Prompt invocation (Claude Desktop client). Scenario 3 keeps single-agent radar pull via Tools (already Tools-only). Demo total wall-clock unchanged (~30-35 min).

**What's still open**: implementation work — same set as Rev 7. The spec remains requirements-complete; Rev 8 is a correctness pass, not a scope change.

**Owner**: RP — design unblocked for cloud-models + OpenClaw Tools+Resources-only implementation.

### 2026-05-14 — Revision 9: Demonstrator architecture sections added to all 5 scenarios

**Trigger**: RP feedback: _"update Scenario 1 to show the underlying architecture of how the scenario is routed through MCP to invoke the various GST Hub tools - it isn't immediately clear to me what's happening under the hood and I want to be able to articulate it during the demo"_ — followed by _"now do the same technical documentation for the other scenarios also"_ once § 1.B landed.

**Resolution**: each scenario now has a dedicated **"Architecture under the hood"** sub-section optimized for spoken articulation during the demo. Each section follows the same template established in § 1.B:

1. Wire-level call sequence (ASCII diagram showing the JSON-RPC round-trips Claude Desktop or OpenClaw makes)
2. Talking points keyed to each step (verbatim phrasing the demonstrator speaks while pointing at the UI)
3. Worker-internal pipeline (the auth + scope + rate-limit + handler shape)
4. The scenario-specific key story (different teaching moment for each)
5. Reading-order summaries (30-second + 5-second articulation scripts)

**Per-scenario architectural story**:

| Scenario | Section | Key teaching                                                                                                                                                                                                                                                                                                            |
| -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | § 1.B   | **Shared engine** — MCP calls the same `generateScript()` function that powers the hub wizard; same `serializeToParams()` URL encoder on both surfaces enables the deeplink round-trip.                                                                                                                                 |
| 2        | § 2.A   | **Citation grounding** — Resources pinning fetches verbatim regulation text via `resources/read` once; subsequent prompts reason over pinned content, not training data. No hallucinated articles.                                                                                                                      |
| 3        | § 3.A   | **Operational substrate** — Cron-pre-warmed Upstash cache + per-key rate limit + BL-039 OAuth self-heal + circuit breaker all cooperate so one agent tool call feels instant + safe + budgeted.                                                                                                                         |
| 4        | § 4.B   | **Shared pipeline** — Tools, Prompts, Resources all flow through the same auth + scope + rate-limit gauntlet before reaching their handlers. Verifiability is structural, not bolt-on.                                                                                                                                  |
| 5        | § 5.C   | **Substrate scales without rearchitecture** — 3 concurrent agents look identical to 3 humans at the MCP layer; same auth gate, same per-key rate-limit accounting, with full multi-tenant attribution via `keyOwner` log fields. Includes tool-call inventory + `wrangler tail` log shape for BL-033 capacity planning. |

**Changes**:

- **Scenario 2** gains § 2.A (Resources path) — pin-time `resources/read` × 3 phase, then prompt-time zero-MCP-call phase; codegen index + 24h cache + scoped attribution table; demonstrator phrasing
- **Scenario 3** gains § 3.A (OpenClaw → Tools, cache, BL-039) — wire-level diagram showing the cache-hit path and the BL-039 self-heal fallback path; substrate-stack table; demonstrator phrasing
- **Scenario 4** gains § 4.B (general routing pipeline) — three-primitive method table, shared Worker pipeline diagram, anatomy table mapping example questions to MCP methods; complements § 4.A (verification mechanisms) by explaining WHY verifiability is structural
- **Scenario 5** gains § 5.C (multi-agent fan-out, attribution, rate-limit shape) — three-agent parallel-fan-out diagram, per-run tool-call inventory (7 tools/call + 2-5 resources/read across the 3 specialists; all default-tier; radar tier untouched), simulated `wrangler tail` output showing `keyOwner=OC` attribution for every call

**Format/length discipline**: every architecture section is ~100-130 lines, balanced between diagram + narration. They live inside the per-scenario subtree (`#### Scenario N`, then `##### § N.X`, then `######` for sub-headers) so the document hierarchy stays clean. None of the existing content was rewritten — these sections are pure additions adjacent to each scenario's main bullet list.

**What didn't change**: scenario specifications themselves (inputs, prompts, expected outputs, failure modes, acceptance criteria, demo wall-clock budgets). Iteration questions remain locked at Rev 8 status. Rev 9 is a documentation-completeness pass for the demo runbook, not a scope change.

**Owner**: RP — demo implementation work continues; demonstrator now has narration cheat-sheets for every scenario.

---

## 5. Transition plan — when this doc graduates to BACKLOG.md

Once the iteration questions in section 3 are resolved (or explicitly deferred), the canonical entry moves to `BACKLOG.md` between BL-032.5 and BL-032.75. At that point:

1. This doc becomes the **design companion** (analogous to `MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md`)
2. The 🚧 WORKING DOCUMENT banner at the top gets removed; replaced with a delivery-history block
3. Iteration log in section 4 is preserved as the rationale audit trail
4. BACKLOG.md entry references this doc via `**Architecture & plan**: [MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md](./MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md)` (matching the BL-032.5 pattern)
