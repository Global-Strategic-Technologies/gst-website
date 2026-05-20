# BL-032.6 Demo Script — Live Runbook

> **Purpose**: top-to-bottom script for running the BL-032.6 stakeholder demo. Designed to be read inline during the demo — open this doc beside Claude Desktop + the OpenClaw Telegram bot, scroll as you go.
>
> **Companion design doc**: [`MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md`](./MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md) — _why_ each scenario is shaped this way, architectural deep-dives, iteration history. Read that for context **before** demo day; don't open it during the demo.
>
> **Audience**: Managing Director (internal) — calibrate framing accordingly.
>
> **Wall-clock budget**: 30-35 min total.
>
> **Convention**: 🎤 = speak this verbatim · 📋 = paste this verbatim · 👁 = point at this in the UI · ⚠️ = fallback if things break.

---

## Demo flow at a glance

| #   | Scenario                                                                                  | Where           | Time    | Magic moment                                           |
| --- | ----------------------------------------------------------------------------------------- | --------------- | ------- | ------------------------------------------------------ |
| —   | [Opening](#opening-3-min)                                                                 | (you, speaking) | 3 min   | Frame the substrate                                    |
| 1   | [Sales call → Diligence agenda ⭐](#scenario-1--sales-call--diligence-agenda-5-min--lead) | Claude Desktop  | 5 min   | Prose → structured tool call → 1-page kickoff memo     |
| 2   | [Cross-jurisdictional deal review](#scenario-2--cross-jurisdictional-deal-review-7-min)   | Claude Desktop  | 7 min   | Pin 3 regulations; citation-grounded compliance matrix |
| 3   | [OpenClaw radar pull (teaser)](#scenario-3--openclaw-radar-pull-on-command-5-min)         | Telegram bot    | 5 min   | One agent, one command, GST-voice briefing             |
| 4   | ["What else?" open-ended](#scenario-4--what-else-open-ended-interactive-5-7-min)          | Claude Desktop  | 5-7 min | Hand stakeholder the keyboard; emergent use cases      |
| 5   | [OpenClaw multi-agent cherry 🍒](#scenario-5)                                             | Telegram bot    | 5-7 min | 3 agents fan out in parallel; partner-decision verdict |
| —   | [Closing + Q&A](#closing-3-min)                                                           | (you, speaking) | 3 min   | What's next; receive feedback                          |

---

## Pre-flight checklist — run T-15 min before the demo

### Connections + auth

- [ ] Open Claude Desktop. Confirm `gst-mcp` connector is loaded (the GST icon shows in the connectors panel).
- [ ] In Claude Desktop, verify the system-prompt addendum from [REMOTE_CLIENT_SETUP.md § 4](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) is enabled in your profile.
- [ ] Open the OpenClaw Telegram bot chat. Send `/status` (or whatever your bot's health command is) and confirm the bot responds with `gst-mcp` connector live. Server-side: `mcporter list gst-mcp` returns all 12 Tools.
- [ ] Confirm the bot has the pre-defined agents wired: `radar-analyst` (Scenario 3), plus `market-signal` / `comparable-engagements` / `regulatory-exposure` / `synthesis` (Scenario 5). Each Scenario 5 specialist is scoped to one decision domain with the minimum tool set required — `market-signal` → `search_radar`, `comparable-engagements` → `list_portfolio_facets` + `search_portfolio`, `regulatory-exposure` → `list_regulation_facets` + `search_regulations` (each `*_facets` call enumerates available filter values before the corresponding `search_*` retrieves matching entries). Send `/agents` or your bot's agent-list command to verify.
- [ ] **Screen-share setup**: the audience needs to see the Telegram chat live. If demoing from phone → mirror to laptop via the Telegram Desktop client (signed into the same account) and share the laptop screen. If demoing from desktop → just share the Telegram Desktop window. Confirm the chat scrollback is readable at audience-viewable font size.

### Substrate health

- [ ] `curl -s https://mcp.globalstrategic.tech/health | jq` returns `ok: true`. Note `radarSnapshotAgeSeconds` < 3600 (Cron-pre-warmed, not stale).
- [ ] Keep one PowerShell window visible with this loop (optional, for the receipts-loving MD). Ctrl+C to stop.
  ```powershell
  while ($true) {
    $h = Invoke-RestMethod https://mcp.globalstrategic.tech/health
    Write-Host "$(Get-Date -Format 'HH:mm:ss')  snapshotAge=$($h.radarSnapshotAgeSeconds)s  uptime=$($h.uptimeSeconds)s"
    Start-Sleep -Seconds 5
  }
  ```

### Clipboard prep

- [ ] **Call notes for Scenario 1 + 5** copied to clipboard (or sticky note). See Appendix A.
- [ ] Scenario 2 regulation URIs handy: `gst://regulations/eu/gdpr`, `gst://regulations/us-ca/ccpa`, `gst://regulations/gb/dpa`.
- [ ] Scenario 4 provocative prompts handy. See Appendix B.

### Fallback assets

- [ ] Pre-recorded screencap of Scenario 1 ready to swap in if live run cold-fails.
- [ ] Pre-recorded screencap of Scenarios 3 + 5 (Telegram-bot OpenClaw segments) ready — these are the highest-risk live segments.
- [ ] Source-code link sheet (per design doc § 5.A) loaded in a browser tab in case a curious MD asks _"can I see the actual code?"_

---

## Opening (3 min)

🎤 **SAY** (frame the demo):

> "Over the last few months we've shipped a substrate called the GST MCP server — Model Context Protocol — which exposes our consulting toolkit as a set of structured tools that AI clients like Claude can call directly. Today I'm going to show you five scenarios that demonstrate what this enables. Scenarios one, two, and four run in Claude Desktop. Scenarios three and five run through a Telegram bot powered by an agent framework called OpenClaw — same substrate underneath, just a different consumption surface. The Telegram piece shows what autonomous orchestration on top of our MCP looks like when you put it in a place people actually message during their workday.
>
> The point isn't to wow you with the AI — it's to show you that this is real, named, versioned engineering that's already in production. Every tool call you see is hitting a function in our codebase. Every regulation Claude cites comes from a corpus we shipped. Nothing here is the model making things up.
>
> Let's start with the most common partner workflow: turning a sales call into a 1-page diligence agenda."

👁 **SHOW**: Switch to Claude Desktop. Confirm the connectors panel is visible so stakeholders see the `gst-mcp` icon.

---

## Scenario 1 — Sales call → Diligence agenda (5 min) ⭐ LEAD

**Window**: Claude Desktop, fresh conversation, `gst-mcp` connector active.

### Open

🎤 **SAY** (~15 sec):

> "Imagine you just got off a 30-minute intro call with a target company called MedSig Health. Partner is asking for a 1-page diligence agenda before tomorrow's 9am pipeline review. Watch what happens when I hand Claude the call notes with one instruction."

### Paste call notes

📋 **PASTE** as the first message into Claude Desktop (full block from Appendix A.1):

```
Sales-call notes — MedSig Health intro (2026-05-13, 30 min Zoom)

- COO: Christina Reyes (ex-Cerner). She drove the call agenda.
- Product: revenue cycle management platform for hospital networks
  and large physician groups — insurance follow-up, denial appeals,
  payment posting, AR recovery in one workflow
- Stage: Series-B (closed late 2024, lead investor Atomico)
- Revenue: ~$45M ARR; growing "north of 60%" YoY
- Geography: primary base US (East Coast + Texas + California);
  EU expansion launched 2025 — Germany, France, Netherlands, Iberia.
  "We're talking to two NHS trusts but nothing signed"
- Customers: hospital networks + large physician groups; B2B contracts,
  multi-year, ~120 customers ranging from 200-bed regional hospitals
  to multi-site groups with 5k+ providers
- Stack: "fully modern, cloud-native" (her words) — couldn't pin down
  specifics; said something about AWS Virginia for US + AWS Frankfurt
  for EU but wouldn't go deeper
- Data: handles claims with PHI for every patient touched; explicitly
  mentioned HIPAA (US side) and GDPR + Germany's BDSG and France's
  CNIL guidance (EU side)
- Engagement ask: technical due diligence advisory for an "upcoming
  round" — wouldn't disclose if Series-C raise, sale, or strategic
  investor; said "we're talking to two other advisory firms"
- Asked us to send a 1-page diligence agenda before tomorrow's 9am
  pipeline review
- Vibes: COO confident but evasive on infra specifics. PE-pattern flag:
  companies that won't talk infra in an intro call usually have
  something they're sandbagging on
```

### Type the invocation prompt

📋 **PASTE** as the next message:

```
I just had an intro call with MedSig Health (notes above). Partner needs a 1-page diligence agenda before tomorrow's 9am pipeline review. Use the `gst_diligence_kickoff` prompt with the target name 'MedSig Health' and whatever dimensions you can confidently derive from the notes. Leave the rest as `'unknown'` — don't guess.
```

### Narrate as Claude streams the response

👁 **WATCH** for these renders in Claude's chat — narrate as each one fires:

1. **`prompts/get` render appears**

   🎤 **SAY**: _"That's not Claude calling a tool yet — that's Claude asking our server "what does the `gst_diligence_kickoff` workflow want me to do?" The server is returning a templated set of instructions PLUS our canonical VDR-folder taxonomy embedded inline. Claude didn't need to fetch it separately — we ship it bundled with the prompt response."_

2. **`tools/call generate_diligence_agenda` render appears**

   🎤 **SAY**: _"Now Claude is calling our diligence engine — the same code module that powers our website's Diligence Machine wizard. It's returning structured JSON: the agenda, the attention areas, an unknown-dimensions count, and a deeplink URL."_

3. **Final memo composes**

   🎤 **SAY**: _"And there's the kickoff memo, in our house voice. Notice the 'Low-confidence baseline' callout at the top — that's because most of the 13 input dimensions weren't in the call notes, and we taught the system to flag that instead of guessing. That's the honesty pattern. The 'Open Diligence Wizard' deeplink at the bottom opens our hub UI pre-populated with these same inputs — partner can keep editing in the website."_

### Close + bridge

🎤 **SAY** (~20 sec):

> "That's the most common partner workflow — sales call to junior-associate handoff — compressed from 30 minutes of manual structuring into about 60 seconds. The agenda is byte-for-byte identical to what you'd get if you typed these dimensions into the hub wizard yourself, because both surfaces share one engine. Now let me show you a different angle: pinning regulatory text directly into Claude's context."

### ⚠️ FALLBACKS

- **Zod error on input** (most likely on `geographies`): paste the invocation with explicit `geographies: ['eu']`.
- **Network blip**: open the `/health` terminal, show `ok: true`, rerun the invocation. BL-039 covers transient token-stale; you won't see it fail.
- **Cold failure**: skip to pre-recorded screencap. Don't fight it — move on.

---

## Scenario 2 — Cross-jurisdictional deal review (7 min)

**Window**: Claude Desktop, **start a fresh conversation** to avoid prior context pollution.

### Open

🎤 **SAY** (~20 sec):

> "Different scenario. We have a hypothetical target operating across the EU, California, and the UK. Partner wants a cross-jurisdictional compliance-risk matrix. The interesting question is — how do we make sure Claude is citing the actual regulatory text and not making things up? Watch how we ground this."

### Pin 3 regulations via the + menu

👁 **DO** this live, narrating as you go:

1. Click the `+` button next to the chat input
2. Select `gst-mcp` → Resources tab
3. Pick **`gst://regulations/eu/gdpr`**

   🎤 **SAY**: _"When I pin that, Claude Desktop makes one HTTP call to our server — `resources/read` — to fetch the canonical text. Goes through our auth gate, scope check, 24-hour cache. The text Claude now has pinned is verbatim what's in our regulatory corpus."_

4. Pick **`gst://regulations/us-ca/ccpa`**, then **`gst://regulations/gb/dpa`**

👁 **SHOW** the three pinned-resource pills now sitting above the chat input.

### Type the query

📋 **PASTE** as the message:

```
Using only the pinned regulations above, generate a compliance-risk matrix for this target: a B2B healthcare SaaS company handling PHI for hospital networks across the EU, US-California, and UK markets. Cover data-protection obligations, breach-notification timelines, and cross-border-transfer constraints. Cite the specific article numbers from the pinned text — do NOT cite anything that isn't in the pinned content.
```

### Narrate as the response composes

🎤 **SAY** (~30 sec, while the matrix renders):

> "Notice — no new MCP calls are firing. Claude is reasoning over the text we already handed it in step one. The matrix it's producing is grounded in our pinned content, not in training data. Every article number it cites should map to a line in those three pinned pills. If it cites something that's NOT in there, that's hallucination — and you can spot-check that yourself."

### Spot-check moment

👁 **PICK** an article number from Claude's output (e.g., GDPR Article 32 or CCPA §1798.150). Click the corresponding pinned resource pill to expand it.

🎤 **SAY**: _"There's the verbatim text. Same words Claude cited. We didn't ask Claude to remember the law — we handed it the law and asked it to reason."_

### Close + bridge

🎤 **SAY** (~15 sec):

> "That's citation grounding. The same pinning pattern works for any of the 130-ish Resources our server publishes — our Library articles, our regulatory corpus, our radar snapshots. Now I want to switch surfaces — let me show you what happens when an autonomous agent is doing the calling instead of me."

### ⚠️ FALLBACKS

- **Resource pin fails** (rare; auth or scope): try a different jurisdiction. Don't get stuck on one URI.
- **Claude cites without inline article numbers**: ask it explicitly _"List the exact GDPR articles you cited above — I want to verify."_
- **Cold failure**: pre-recorded screencap.

---

## Scenario 3 — OpenClaw radar pull on command (5 min)

**Window**: Telegram bot chat (`@gst_openclaw_bot` or your team's bot handle), `radar-analyst` agent active.

### Open

🎤 **SAY** (~20 sec):

> "Switching surfaces — I'm now in Telegram, messaging a bot that's powered by an agent framework called OpenClaw. Same GST MCP server underneath, but the bot is calling us with a different bearer key, `MCP_KEY_OC`. So every call this agent makes is going to show up in our logs separately from my Claude Desktop traffic. The point of running this through Telegram is: this is where partners message during their workday. Watch what happens when I drop a one-line request to the bot."

### Send the command

📋 **SEND** as a Telegram message to the bot:

```
Pull today's radar items relevant to AI infrastructure deals and give me a 3-bullet briefing in the GST Take voice.
```

### Narrate as the bot responds

👁 **WATCH** the chat scrollback — the bot will post one or more intermediate messages indicating the tool call (e.g., a "🔧 calling `search_radar`..." message or a structured step update), then the final briefing.

🎤 **SAY** (as the tool-call message appears):

> "There — that message from the bot is the agent calling our `search_radar` tool with category `ai-automation`. That request went through our auth gate on `MCP_KEY_OC`'s separate budget (5 calls per minute on the radar tier), through a circuit-breaker check, and then read from our 6-hour Upstash cache that's pre-warmed every hour by a Worker Cron. So the agent isn't waiting on Inoreader; it's getting a sub-100ms response from our cache."

👁 **WAIT** for the briefing message. Should be ~3 bullets in the GST Take voice.

🎤 **SAY** (after the briefing message lands):

> "Same kind of briefing Claude produced for me earlier — but here it arrived as a Telegram message, on one command, with no human writing a prompt template. Now imagine this bot scheduled to message you every morning at 8:30 with the overnight radar digest — or messaged on demand from a team channel. This is the seed for what's coming next: take this pattern, scale it to multiple agents, and you have an autonomous diligence triage."

### Close + bridge

🎤 **SAY** (~10 sec):

> "Before we get to the multi-agent finale, I want to give you the keyboard. Let me switch back to Claude Desktop and hand it over so you can probe the system with whatever you want to know."

### ⚠️ FALLBACKS

- **Bot doesn't respond / hangs**: pre-recorded screencap of a successful run. Don't fight a hung agent on stage.
- **Bot replies but no tool-call message renders**: still narrate from the final briefing content — the GST-Take voice + the specific item citations prove the MCP was called. Mention that intermediate-step visibility is a bot-config detail, not a substrate detail.
- **Cache cold** (very unlikely given hourly Cron): show `/health` in the side terminal, wait ~3 sec, resend the message. Or skip to scenario 4 and circle back.
- **Output not in GST Take voice**: minor — narrate that this is a system-prompt addendum issue on the bot side, not an MCP issue. Don't dwell.

---

## Scenario 4 — "What else?" open-ended interactive (5-7 min)

**Window**: Claude Desktop, **fresh conversation** (or continue from scenario 2 if you want pinned context to carry).

### Open

🎤 **SAY** (~20 sec):

> "I want to spend a few minutes letting you probe the system live. Whatever you want to know — about our portfolio, our frameworks, our regulatory corpus — type it in. The point I want to make as you do this is: every interaction you'll see, whatever you ask, flows through the same auth + scope + rate-limit pipeline. Verifiability is structural here, not bolt-on."

### Seed prompts if stakeholder is quiet

If the MD doesn't immediately start typing, offer one of these (copy-paste from Appendix B). Options are grouped by **MCP mechanism**: A–D exercise the **Tools** primitive (`tools/call`); E–G exercise the **Prompts** primitive (`prompts/get` → templated workflow that internally orchestrates tools). Within each group, options progress from lower-complexity to higher-complexity. Pick based on (a) what the MD seems engaged with, (b) whether you want to show breadth (Tool calls — fast, single-shot) or depth (Prompt workflows — multi-step, GST-voice-templated).

### Tool-only seeds — `tools/call` (narration: _"Claude just called our tool with these args"_)

- 📋 **OPTION A** — _Portfolio search • single tool, simplest_

  ```
  Find me three PE firms in our portfolio that have done healthcare-interoperability deals adjacent to the Tempo project.
  ```

- 📋 **OPTION C** — _Concrete-target ICG walkthrough • single tool, rich inputs (surfaces mid-tier maturity nuance)_

  ```
  A target has ~$25M annual cloud spend, a 2-person FinOps function inside the platform team, about 70% resource-tag coverage, quarterly cost reviews at the engineering-leadership level, and some reserved-instance usage but no automated rightsizing. Walk me through what an ICG diligence finds and what we'd recommend if we engaged.
  ```

- 📋 **OPTION D** — _Cross-framework regulatory comparison • single tool, comparative reasoning_

  ```
  Compare GDPR exposure for SaaS vs marketplace business models using our regulations corpus.
  ```

- 📋 **OPTION B** — _ICG + portfolio precedent • 2-tool chain (Claude orchestrates the chain — highest complexity in Tool-only group)_

  ```
  What ICG red flags should I expect in a target that looks like our Tempo project? Use the ICG framework, and pull comparable engagements from our portfolio to ground the assessment.
  ```

### Prompt-orchestrated seeds — `prompts/get` (narration: _"Claude just asked our server for a workflow template, which is now composing multiple tools"_)

- 📋 **OPTION E** — _Comparable-engagements memo • light prompt, single tool internally_

  ```
  Generate a comparable-engagements memo for healthcare interoperability.
  ```

- 📋 **OPTION F** — _Diligence handoff memo, Project "Magic" • full prompt invocation with named lead + concrete target_

  ```
  Use the gst_diligence_handoff_memo prompt to draft a buy-side diligence handoff memo for project "Magic". Lead: Scott Thomas. The target is a fast-growing healthcare SaaS with ~$50M ARR USD, ~25 employees, operating across the US and UK. Infrastructure and operations maturity appears low based on the intro call. Fill in the dimensions you can confidently derive; leave the rest as 'unknown'.
  ```

- 📋 **OPTION G** — _Target quick-look, Mythos • full prompt invocation with detailed profile (cloud-native, partial-maturity signals)_

  ```
  Do a gst_target_quick_look on a target called Mythos. B2B SaaS, ~$27M ARR USD, growth stage, headquartered in California, USA. They spend ~$14M/year on AWS. Cloud-native with serverless compute. Engineering leads directly manage cloud costs; cloud resources are only partially tagged. Software-architecture and infrastructure-cost-governance maturity both appear low, but most other dimensions we're not yet sure about. Fill in what you can confidently derive; leave the rest as 'unknown'.
  ```

- 📋 **OPTION H** — _All-MCP-primitives synergy • Pin 2 Resources + invoke a Prompt that uses them alongside its own embedded content (the highest-complexity single-user scenario — exercises Tools + Prompts + Resources in one chat thread)_

  **Step 1**: Pin these regulations via Claude Desktop's `+ → Resources` menu:
  - `gst://regulations/eu/gdpr`
  - `gst://regulations/us-ca/ccpa`

  **Step 2**: Paste this as the chat message:

  ```
  Run gst_diligence_handoff_memo for project "Cygnet". Lead: Reid Peryam. Target: B2B healthcare SaaS, ~$80M ARR USD, ~120 employees, operating across US and EU with cross-border patient data flows. Engineering maturity is medium; regulatory exposure is high. Use the pinned regulations DIRECTLY when sizing the Regulatory Exposure section — cite specific article numbers from the pinned content (no inferred citations). Leave dimensions you can't confidently derive as 'unknown'.
  ```

  **Narration beat**: _"What you're about to see is the prompt from Scenario 1, plus the regulation-pinning from Scenario 2, in one chat thread. Claude is going to call our `gst_diligence_handoff_memo` prompt, which internally orchestrates tool calls and embeds our VDR Library article. At the same time, it's going to use the two regulations I just pinned. The Regulatory Exposure section of the memo should cite article numbers from the pinned content — not made-up ones. That's all three MCP primitives — Tools, Prompts, Resources — composing in one workflow."_

  **Watch-fors**: Regulatory Exposure section cites article numbers verifiable in the pinned pills (e.g., GDPR Art. 32, CCPA §1798.150); no hallucinated articles; VDR-folder labels still verbatim from the embedded Library article; low-confidence callout fires if dimensions are mostly 'unknown'.

### Narration pattern (per stakeholder question)

Every time something fires, do this 3-step:

1. 👁 **POINT** at the tool-call render in Claude's UI:

   🎤 **SAY**: _"See how Claude just called `<tool_name>` with these args?"_

2. 👁 **POINT** at the response payload:

   🎤 **SAY**: _"That came back from our `<engine>` — anonymized at source, scoped to my key."_

3. 👁 **POINT** at Claude's reply text + call out a GST-specific detail:

   🎤 **SAY**: _"Notice it's citing `<specific engagement code name / framework dimension / regulation>` — that's GST data showing through. ChatGPT couldn't surface that."_

### "Is this just ChatGPT?" answer (when asked)

If a skeptical MD asks _"how do I know this isn't training data?"_, three layers:

1. 👁 **POINT** at the tool-call render: _"No render, no MCP hit. You can see it firing."_
2. 🎤 **SAY**: _"Claude's opening sentence names the tool — that's our system-prompt addendum forcing the self-declaration."_
3. 👁 **POINT** at the `/health` terminal: _"That snapshot age decremented in real time when the radar call fired. Receipts, not story."_

### Close + bridge

🎤 **SAY** (~15 sec):

> "Good — every interaction you fired was attributed to my key, scope-checked, counted against per-key budgets, and logged. Same pipeline for every tool, every prompt, every resource. Now I want to close with the most ambitious piece — same kind of workflow as the lead demo, but orchestrated autonomously by multiple agents."

### ⚠️ FALLBACKS

- **Stakeholder quiet for too long**: pivot to option A or B yourself, narrate as if it's the seeded path.
- **Claude answers from training (no tool call renders)**: re-prompt with _"Use our portfolio data specifically — call `search_portfolio` with these args..."_
- **Run long**: cut to scenario 5 at 5 min budget; "what else" can extend in Q&A.

---

<a id="scenario-5"></a>

## Scenario 5 — OpenClaw multi-agent autonomous diligence (5-7 min) 🍒

**Window**: Telegram bot chat (same bot as Scenario 3), multi-agent mode — the bot routes the kickoff to the 4 pre-defined agents (`market-signal`, `comparable-engagements`, `regulatory-exposure`, `synthesis`). Each specialist agent is scoped to one decision domain with the minimum tool set that domain requires (Tools-only deployment, per the OpenClaw client constraint): `market-signal` → `search_radar`, `comparable-engagements` → `list_portfolio_facets` + `search_portfolio` (facets enumerates available industries/themes/stages, then search retrieves matching engagements), `regulatory-exposure` → `list_regulation_facets` + `search_regulations` (facets enumerates available jurisdictions, then search retrieves the framework body per jurisdiction). Synthesis makes no MCP calls.

### Open

🎤 **SAY** (~30 sec):

> "Final scenario — the cherry on top. Same workflow as the lead demo: take the MedSig Health call notes, produce a partner-decision recommendation. But this time, instead of me in chat with Claude, I'm going to drop the call notes into the same Telegram bot and three specialist agents will fan out in parallel — Market-signal, Comparable-engagements, and Regulatory-exposure — each one wired to exactly one MCP tool from our server. A synthesis agent will combine their outputs back into the chat. The MCP server sees this as three concurrent clients sharing one team key — same auth, same scope, same rate limits as any other call. Watch the chat scrollback."

### Send the call notes + kickoff command

📋 **SEND** as a Telegram message to the bot:

```
Sales-call notes — MedSig Health intro (2026-05-13, 30 min Zoom)

- COO: Christina Reyes (ex-Cerner). She drove the call agenda.
- Product: revenue cycle management platform for hospital networks
  and large physician groups — insurance follow-up, denial appeals,
  payment posting, AR recovery in one workflow
- Stage: Series-B (closed late 2024, lead investor Atomico)
- Revenue: ~$45M ARR; growing "north of 60%" YoY
- Geography: primary base US (East Coast + Texas + California);
  EU expansion launched 2025 — Germany, France, Netherlands, Iberia.
  "We're talking to two NHS trusts but nothing signed"
- Customers: hospital networks + large physician groups; B2B contracts,
  multi-year, ~120 customers ranging from 200-bed regional hospitals
  to multi-site groups with 5k+ providers
- Stack: "fully modern, cloud-native" (her words) — couldn't pin down
  specifics; said something about AWS Virginia for US + AWS Frankfurt
  for EU but wouldn't go deeper
- Data: handles claims with PHI for every patient touched; explicitly
  mentioned HIPAA (US side) and GDPR + Germany's BDSG and France's
  CNIL guidance (EU side)
- Engagement ask: technical due diligence advisory for an "upcoming
  round" — wouldn't disclose if Series-C raise, sale, or strategic
  investor; said "we're talking to two other advisory firms"
- Asked us to send a 1-page diligence agenda before tomorrow's 9am
  pipeline review
- Vibes: COO confident but evasive on infra specifics. PE-pattern flag:
  companies that won't talk infra in an intro call usually have
  something they're sandbagging on

---

Commission three specialists in parallel with the following exact commands. Do not do their work yourself.

- Neuromancer: use gst-mcp search_radar to search for a market signal. European healthcare IT and RCM. Return me one paragraph.
- Molly: use the GST MCP's list_portfolio_facets, search_portfolio to find comparable-engagements. Healthcare/RCM/EU precedents. Respond to me with one paragraph.
- 3Jane: use gst-mcp's list_regulation_facets, search_regulations for Germany BDSG, France CNIL, EU GDPR. One paragraph response.

Synthesize: go / no-go / conditional, then one bullet per specialist, then one line for what to send the COO before 9am.
```

### Narrate as the fan-out fires

👁 **WATCH** the chat scrollback. The bot will start posting messages from each of the three agents (typically prefixed with the agent name — e.g. `[Market-signal] Calling search_radar...`), all interleaved as they fire in parallel.

🎤 **SAY** (~30 sec, while the messages stream in):

> "Three agents just started in parallel — Market-signal, Comparable-engagements, and Regulatory-exposure. You'll see their messages interleaving in this chat as each one fires its tool calls. Each agent has been given a narrow tool slice — one or two tools — covering exactly the decision domain it owns. That's a deliberate scope-of-authority design, not a substrate limitation. The MCP server itself ships twelve tools; we've given these specialists just the slice each one needs. From our MCP server's perspective, these look like three concurrent bearer-authenticated clients all carrying the same `MCP_KEY_OC` bearer. Every call is rate-limited against that key's budget. Every call is attributed in our logs.
>
> All requests are `tools/call` — no Resource reads, no Prompts. That's because OpenClaw's MCP client doesn't support Resources or Prompts yet; it only consumes Tools. That's actually a feature for this demo: Tools is the lowest-common-denominator MCP primitive that every client supports today. So this exact architecture would port to any other agent framework, any other chat surface — Claude Code, Cursor, CrewAI, Slack bots, future agents — without modification."

### As each specialist completes

👁 **POINT** at each agent's completion message in the Telegram scrollback:

- **Market-signal** completes (1-2 `search_radar` calls):

  🎤 **SAY**: _"Market-signal just answered 'what's the market saying about this space?' — it queried our radar feed for items relevant to European healthcare IT and RCM. That feeds the partner's read on the deal's timing."_

- **Comparable-engagements** completes (1-2 `search_portfolio` calls):

  🎤 **SAY**: _"Comparable-engagements answered 'have we done this before?' — precedent memo from our 57-engagement portfolio."_

- **Regulatory-exposure** completes (2-5 `search_regulations` calls, one per jurisdiction):

  🎤 **SAY**: _"Regulatory-exposure called search_regulations once per EU jurisdiction MedSig operates in — Germany, France, Netherlands. Cross-jurisdictional risk matrix."_

### Synthesis renders

👁 **WATCH** for the final synthesis message in the Telegram chat — it should be visually distinct from the per-agent messages (clean summary, no agent prefix).

🎤 **SAY** (~20 sec, while synthesis composes):

> "Synthesis is now combining all three signals into a single partner-decision recommendation. Notice the architectural layering — top level is the agent fan-out orchestrated by OpenClaw and surfaced through Telegram; middle level is each agent's workflow composition (each one is replicating the equivalent server-side Prompt template from our repo); bottom level is the underlying tool invocations on our MCP. Three named, versioned, source-controlled layers — and the partner gets the answer in the chat tool they were already using."

### Close

🎤 **SAY** (~20 sec):

> "Same workflow as the lead demo. Same engine doing the work. But run autonomously by three cooperating agents instead of me at a keyboard, delivered into Telegram instead of a desktop app. That's the 'what does autonomy on top look like' picture, in the place where partners already message. The substrate underneath behaved the same whether one client connected or three — that's what makes this safe to point at pilot clients next quarter."

### ⚠️ FALLBACKS

- **One agent hangs (no completion message for that agent after ~60 sec)**: don't wait — narrate _"You'd see synthesis gracefully handle a missing input — but in the interest of time, let me cut to the Claude version of this workflow, which you saw in Scenario 1. Same output, single-threaded."_
- **Bot stops responding entirely**: graceful pivot — _"The Claude version of this is Scenario 1. You already saw it work. The OpenClaw + Telegram surface is still maturing on the orchestration side; our MCP is production-ready today regardless."_
- **Tool-call messages don't render in Telegram (only final output)**: still narrate from the final synthesis content — the GST-specific framework citations + engagement code names prove the MCP was called. Note that intermediate-step visibility is a bot-config knob, not an MCP issue. Optionally pull up `wrangler tail` on a side terminal to show the live `keyOwner=OC` log lines as receipts.
- **Output not coherent**: don't dwell on quality; emphasize architectural layering.

---

## Closing (3 min)

🎤 **SAY** (~90 sec, optimized for MD-decision framing):

> "Five scenarios. Two truths to take away.
>
> First — what you saw in Claude Desktop is production-ready today. Sales-call-to-agenda, regulatory pinning, open-ended portfolio queries. Anyone in the firm with a Claude Desktop license and our MCP connector can do all of this right now. That capability is shipped.
>
> Second — what you saw in Telegram, powered by OpenClaw, is substrate-ready and productization-pending. The MCP server doesn't care whether the caller is a human in Claude Desktop, an autonomous agent reachable through a Telegram bot, or anything else — same auth, same logs, same rate-limited tool calls. That means our path to productized agent workflows — pre-meeting prep overnight delivered as a Telegram message, on-demand briefings from a chat command, ambient market intelligence pushed when something interesting fires — those are engineering work on the agent layer, not redesign work on the substrate.
>
> What I want from you today is your gut reaction. Which of these five scenarios feels most worth productizing for an external pilot client? Which felt thin? What did you want to ask that I didn't show? Your feedback shapes which scenario becomes a BL-033 pilot offering."

🎤 **SAY** (open Q&A):

> "Open floor — anything you want to probe."

---

## Q&A pivots — common stakeholder questions

| If MD asks…                                                  | Pivot to…                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _"How do I know it's not just ChatGPT?"_                     | Scenario 4 verification layers — point at tool-call renders, system-prompt addendum self-declaration, `/health` snapshot deltas. Offer to pull up source files.                                                                                                                                 |
| _"Security? Who can call this?"_                             | Every call is bearer-authenticated to a specific person/team via `MCP_KEY_<INITIALS>`. Scopes per-key. Rate-limited per-key. Logged with `keyOwner`. Revocation = one wrangler command.                                                                                                         |
| _"What does this cost?"_                                     | ~0 today. The Inoreader feed has a 200/day budget, we use ~40/day. MCP rate limits prevent runaway. BL-040 (debounce) lined up if multi-agent fan-out scales.                                                                                                                                   |
| _"Can a pilot client get their own version?"_                | BL-033 (next major initiative) — issue them their own bearer key, scope it to whatever subset of tools we want, they get separate `keyOwner` attribution in our logs. Zero substrate change.                                                                                                    |
| _"What's the failure mode if Inoreader goes down?"_          | Cron-pre-warmed 6h cache absorbs the outage. Circuit breaker stops cascading failures. BL-039 auto-refreshes OAuth tokens. We've seen the substrate self-heal in production already.                                                                                                            |
| _"What's NOT in here that you'd want to add?"_               | Persistent agent memory across sessions; Slack/Teams ambient notifications; raw API direct integration for partner SaaS products. All BL-033+ territory.                                                                                                                                        |
| _"Why OpenClaw not [other framework]?"_                      | Native streamable-HTTP MCP, native bearer auth, per-agent server assignment, lowest-friction productization path. AutoGen / CrewAI / LangGraph were considered; OpenClaw won on integration cost.                                                                                               |
| _"Why Telegram specifically?"_                               | Partners message during their workday. Telegram bots are zero-install for the recipient, support push notifications natively, and the OpenClaw framework has a first-class Telegram-bot adapter. We could swap to Slack / Teams with the same agent code — the chat surface is the cheap layer. |
| _"Could a partner just message the bot during a deal call?"_ | Yes — that's the productization vision. BL-033 work on a per-pilot-client bot would issue them their own `MCP_KEY_<TEAM>` and scope it to whatever subset of tools makes sense for their engagement.                                                                                            |
| _"Can I see the actual code?"_                               | Pull up [`mcp-server/src/tools/`](../../../mcp-server/src/tools/) in a browser tab. Open `diligence.ts` — point at the `generateScript()` import line. Same file the hub wizard uses.                                                                                                           |

---

## Emergency fallbacks — if everything goes sideways

**Order of escalation** (try each, then move down):

1. **Claude Desktop scenario fails live**: rerun once. If still failing, swap to pre-recorded screencap and keep narrating.
2. **Telegram-bot scenario fails live**: don't retry; immediately invoke _"the Claude version of this is Scenario 1 — you already saw it work"_ and move on. Don't lose stage time fighting a hung bot or unresponsive Telegram session.
3. **MCP server returns 5xx**: open `/health` terminal, show status, mention BL-039 / circuit breaker. If `/health` itself fails, switch entirely to pre-recorded mode.
4. **Internet drops**: pre-recorded screencaps cover Scenarios 1, 3, 5. Scenarios 2 + 4 need live interactivity — cut them, finish on the pre-recorded scenarios.
5. **Demonstrator loses the thread**: 5-second narration scripts in the design doc § X.X — last resort, recover with a tight one-liner.

---

## Post-demo capture (within 24h)

- [ ] Log "what resonated / what fell flat / what surfaced a gap" per scenario into a follow-up doc at `src/docs/demos/BL-032_6/feedback-<date>.md`
- [ ] Capture any "what else?" prompts the stakeholder tried — these are candidate BL-04X initiatives
- [ ] If Scenario 5 surfaced parallel-refresh load on the BL-040 boundary, capture the Sentry breadcrumbs for the BL-040 implementation kickoff
- [ ] If anything broke on stage, file as a soak finding in [`BL-032_5_TESTING_FINDINGS.md`](./BL-032_5_TESTING_FINDINGS.md)-style entry

---

## Appendix A — Paste-ready content

### A.1 MedSig Health call notes (used in Scenarios 1 + 5)

```
Sales-call notes — MedSig Health intro (2026-05-13, 30 min Zoom)

- COO: Christina Reyes (ex-Cerner). She drove the call agenda.
- Product: revenue cycle management platform for hospital networks
  and large physician groups — insurance follow-up, denial appeals,
  payment posting, AR recovery in one workflow
- Stage: Series-B (closed late 2024, lead investor Atomico)
- Revenue: ~$45M ARR; growing "north of 60%" YoY
- Geography: primary base US (East Coast + Texas + California);
  EU expansion launched 2025 — Germany, France, Netherlands, Iberia.
  "We're talking to two NHS trusts but nothing signed"
- Customers: hospital networks + large physician groups; B2B contracts,
  multi-year, ~120 customers ranging from 200-bed regional hospitals
  to multi-site groups with 5k+ providers
- Stack: "fully modern, cloud-native" (her words) — couldn't pin down
  specifics; said something about AWS Virginia for US + AWS Frankfurt
  for EU but wouldn't go deeper
- Data: handles claims with PHI for every patient touched; explicitly
  mentioned HIPAA (US side) and GDPR + Germany's BDSG and France's
  CNIL guidance (EU side)
- Engagement ask: technical due diligence advisory for an "upcoming
  round" — wouldn't disclose if Series-C raise, sale, or strategic
  investor; said "we're talking to two other advisory firms"
- Asked us to send a 1-page diligence agenda before tomorrow's 9am
  pipeline review
- Vibes: COO confident but evasive on infra specifics. PE-pattern flag:
  companies that won't talk infra in an intro call usually have
  something they're sandbagging on
```

### A.2 Scenario 1 invocation prompt

```
I just had an intro call with MedSig Health (notes above). Partner needs a 1-page diligence agenda before tomorrow's 9am pipeline review. Use the `gst_diligence_kickoff` prompt with the target name 'MedSig Health' and whatever dimensions you can confidently derive from the notes. Leave the rest as `'unknown'` — don't guess.
```

### A.3 Scenario 2 pinned regulation URIs

```
gst://regulations/eu/gdpr
gst://regulations/us-ca/ccpa
gst://regulations/gb/dpa
```

### A.4 Scenario 2 compliance-matrix prompt

```
Using only the pinned regulations above, generate a compliance-risk matrix for this target: a B2B healthcare SaaS company handling PHI for hospital networks across the EU, US-California, and UK markets. Cover data-protection obligations, breach-notification timelines, and cross-border-transfer constraints. Cite the specific article numbers from the pinned text — do NOT cite anything that isn't in the pinned content.
```

### A.5 Scenario 3 — Telegram-bot radar command

```
Pull today's radar items relevant to AI infrastructure deals and give me a 3-bullet briefing in the GST Take voice.
```

### A.6 Scenario 5 — Telegram-bot multi-agent kickoff command

```
Sales-call notes — MedSig Health intro (2026-05-13, 30 min Zoom)

- COO: Christina Reyes (ex-Cerner). She drove the call agenda.
- Product: revenue cycle management platform for hospital networks
  and large physician groups — insurance follow-up, denial appeals,
  payment posting, AR recovery in one workflow
- Stage: Series-B (closed late 2024, lead investor Atomico)
- Revenue: ~$45M ARR; growing "north of 60%" YoY
- Geography: primary base US (East Coast + Texas + California);
  EU expansion launched 2025 — Germany, France, Netherlands, Iberia.
  "We're talking to two NHS trusts but nothing signed"
- Customers: hospital networks + large physician groups; B2B contracts,
  multi-year, ~120 customers ranging from 200-bed regional hospitals
  to multi-site groups with 5k+ providers
- Stack: "fully modern, cloud-native" (her words) — couldn't pin down
  specifics; said something about AWS Virginia for US + AWS Frankfurt
  for EU but wouldn't go deeper
- Data: handles claims with PHI for every patient touched; explicitly
  mentioned HIPAA (US side) and GDPR + Germany's BDSG and France's
  CNIL guidance (EU side)
- Engagement ask: technical due diligence advisory for an "upcoming
  round" — wouldn't disclose if Series-C raise, sale, or strategic
  investor; said "we're talking to two other advisory firms"
- Asked us to send a 1-page diligence agenda before tomorrow's 9am
  pipeline review
- Vibes: COO confident but evasive on infra specifics. PE-pattern flag:
  companies that won't talk infra in an intro call usually have
  something they're sandbagging on

---

Commission three specialists in parallel with the following exact commands. Do not do their work yourself.

- Neuromancer: use gst-mcp search_radar to search for a market signal. European healthcare IT and RCM. Return me one paragraph.
- Molly: use the GST MCP's list_portfolio_facets, search_portfolio to find comparable-engagements. Healthcare/RCM/EU precedents. Respond to me with one paragraph.
- 3Jane: use gst-mcp's list_regulation_facets, search_regulations for Germany BDSG, France CNIL, EU GDPR. One paragraph response.

Synthesize: go / no-go / conditional, then one bullet per specialist, then one line for what to send the COO before 9am.
```

---

## Appendix B — Scenario 4 seed prompts

Use these if the stakeholder isn't probing on their own. Each one is engineered to require GST-specific data, so a generic ChatGPT could not produce a credible answer. **Options mirror the inline Scenario 4 layout** — A–D are Tool-only seeds (`tools/call`); E–G are Prompt-orchestrated seeds (`prompts/get`). Within each group, complexity increases roughly with the letter.

### Tool-only seeds — `tools/call`

#### Option A — Portfolio search (single tool, simplest)

```
Find me three PE firms in our portfolio that have done healthcare-interoperability deals adjacent to the Tempo project.
```

#### Option C — Concrete-target ICG walkthrough (single tool, rich inputs)

```
A target has ~$25M annual cloud spend, a 2-person FinOps function inside the platform team, about 70% resource-tag coverage, quarterly cost reviews at the engineering-leadership level, and some reserved-instance usage but no automated rightsizing. Walk me through what an ICG diligence finds and what we'd recommend if we engaged.
```

#### Option D — Cross-framework regulatory comparison (single tool, comparative reasoning)

```
Compare GDPR exposure for SaaS vs marketplace business models using our regulations corpus.
```

#### Option B — ICG + portfolio precedent (2-tool chain, highest Tool-only complexity)

```
What ICG red flags should I expect in a target that looks like our Tempo project? Use the ICG framework, and pull comparable engagements from our portfolio to ground the assessment.
```

### Prompt-orchestrated seeds — `prompts/get`

#### Option E — Comparable-engagements memo (light prompt, single tool internally)

```
Generate a comparable-engagements memo for healthcare interoperability.
```

#### Option F — Diligence handoff memo, Project "Magic" (full prompt invocation, concrete buy-side target with named lead)

```
Use the gst_diligence_handoff_memo prompt to draft a buy-side diligence handoff memo for project "Magic". Lead: Scott Thomas. The target is a fast-growing healthcare SaaS with ~$50M ARR USD, ~25 employees, operating across the US and UK. Infrastructure and operations maturity appears low based on the intro call. Fill in the dimensions you can confidently derive; leave the rest as 'unknown'.
```

#### Option G — Target quick-look, Mythos (full prompt invocation, cloud-native US target with partial-maturity signals)

```
Do a gst_target_quick_look on a target called Mythos. B2B SaaS, ~$27M ARR USD, growth stage, headquartered in California, USA. They spend ~$14M/year on AWS. Cloud-native with serverless compute. Engineering leads directly manage cloud costs; cloud resources are only partially tagged. Software-architecture and infrastructure-cost-governance maturity both appear low, but most other dimensions we're not yet sure about. Fill in what you can confidently derive; leave the rest as 'unknown'.
```

#### Option H — All-MCP-primitives synergy (pin 2 Resources + invoke a Prompt that uses them — highest-complexity single-user scenario)

**Step 1**: Pin these regulations via Claude Desktop's `+ → Resources` menu:

- `gst://regulations/eu/gdpr`
- `gst://regulations/us-ca/ccpa`

**Step 2**: Paste this as the chat message:

```
Run gst_diligence_handoff_memo for project "Cygnet". Lead: Reid Peryam. Target: B2B healthcare SaaS, ~$80M ARR USD, ~120 employees, operating across US and EU with cross-border patient data flows. Engineering maturity is medium; regulatory exposure is high. Use the pinned regulations DIRECTLY when sizing the Regulatory Exposure section — cite specific article numbers from the pinned content (no inferred citations). Leave dimensions you can't confidently derive as 'unknown'.
```

---

## Appendix C — Tool / Prompt / Resource quick-reference

If a stakeholder asks _"what other tools does this have?"_, point them here OR pull up the design doc § 5.A. Common Tools the demo invokes:

| Tool                                    | What it does                                                | Source                                                                                |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `generate_diligence_agenda`             | Topic-grouped diligence agenda from 13 typed dimensions     | [`mcp-server/src/tools/diligence.ts`](../../../mcp-server/src/tools/diligence.ts)     |
| `search_portfolio` + `list_*_facets`    | 57-engagement portfolio search by industry/theme/stage      | [`mcp-server/src/tools/portfolio.ts`](../../../mcp-server/src/tools/portfolio.ts)     |
| `search_radar` + `get_latest_insights`  | Live + curated radar feed (Cron-pre-warmed cache)           | [`mcp-server/src/tools/radar-live.ts`](../../../mcp-server/src/tools/radar-live.ts)   |
| `search_regulations`                    | 120-framework regulatory corpus by jurisdiction/sector      | [`mcp-server/src/tools/regulations.ts`](../../../mcp-server/src/tools/regulations.ts) |
| `assess_infrastructure_cost_governance` | ICG framework assessment, recommendations across 20 domains | [`mcp-server/src/tools/icg.ts`](../../../mcp-server/src/tools/icg.ts)                 |
| `compute_techpar`                       | Tech-paradigm assessment for a target stack                 | [`mcp-server/src/tools/techpar.ts`](../../../mcp-server/src/tools/techpar.ts)         |
| `estimate_tech_debt_cost`               | Tech-debt cost estimation given architecture inputs         | [`mcp-server/src/tools/tech-debt.ts`](../../../mcp-server/src/tools/tech-debt.ts)     |

Server endpoint: `https://mcp.globalstrategic.tech/mcp` · transport: Streamable HTTP · auth: `Authorization: Bearer MCP_KEY_<INITIALS>`.

Full inventory + architectural deep-dive: [`MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md`](./MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md) and [`MCP_SERVER_OPENCLAW_HANDOVER_BL-032_6.md`](./MCP_SERVER_OPENCLAW_HANDOVER_BL-032_6.md).
