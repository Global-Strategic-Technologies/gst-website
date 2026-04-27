# MCP Server — Consultant Prompt Library (BL-031.75)

> **Backlog initiative**: [BL-031.75: MCP Server — Consultant Prompt Library](BACKLOG.md#bl-03175-mcp-server--consultant-prompt-library)
>
> **Predecessors**:
>
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture, repo placement, lifecycle. Read first.
> - [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) — extends the surface to all Hub engines + Library + Radar Resources. Required predecessor: this initiative composes those Tools and Resources into named workflows.
>
> **Sequel**: [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) — ports the Prompts surface delivered here to the remote HTTP transport, where prompt fan-out interacts with per-key rate limits and URI-stability becomes a remote contract.
>
> **Scope**: this document covers [BL-031.75](BACKLOG.md#bl-03175-mcp-server--consultant-prompt-library) — adding the MCP **Prompts** primitive to the local stdio MCP server, packaging GST's repeatable consultant workflows as named slash-command templates that orchestrate the Tools and Resources delivered in BL-031 and BL-031.5.
>
> **Status**: Open. Depends on BL-031 and BL-031.5.

---

## Context

BL-031 exposes two engines as MCP **Tools**. BL-031.5 broadens the surface — four more engines as Tools, two Library articles + 120+ regulatory frameworks + the radar snapshot as **Resources**. Together they make every piece of GST's intellectual surface area reachable from any Claude conversation.

What's missing is **how to use them well**. A new analyst in their first month does not know:

- Which Tool combination produces a defensible target screen
- That `gst://library/vdr-structure` is the canonical reference for VDR audit work
- How to weave a portfolio comparable into a diligence handoff memo
- Which radar categories matter for which deal type
- The order in which a regulatory exposure brief should be assembled

That tacit workflow knowledge today lives in the senior consultants' heads, in scattered Notion pages, and in the muscle memory of repeated client engagements. Tools and Resources alone do not transmit it. **MCP Prompts do** — they let us codify the workflow as a named, parameterized template that any team member (or a client agent in BL-033) can invoke as a slash-command.

A `/gst_target_quick_look { targetName, productType, arr, hqJurisdiction }` prompt, for example, expands into a templated multi-step conversation that calls the relevant Tools, reads the relevant Resources, and produces a consistent first-look brief. The first time a new analyst runs it, they see how a senior consultant would frame the work. By the third time, the workflow is internalized.

This is the third and final piece of the local-stdio MCP surface: Tools to compute, Resources to read, **Prompts to orchestrate**.

---

## What MCP "Prompts" are — and why they earn their own initiative

[MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) introduced the three MCP primitives. BL-031 used Tools. BL-031.5 added Resources. BL-031.75 adds the third:

| Primitive    | What it is                                                           | Who triggers it                     | Example                                      |
| ------------ | -------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------- |
| **Tool**     | Callable function with structured input → output                     | Model decides when to call          | `compute_techpar({ arr, stage, ... })`       |
| **Resource** | URI-addressable read-only content                                    | User pins, or model auto-fetches    | `gst://library/vdr-structure`                |
| **Prompt**   | Pre-written templated message(s) the user invokes as a slash-command | User-driven (slash menu, picker UI) | `/gst_diligence_kickoff { targetName, ... }` |

A Prompt has: a `name`, a human-readable `description`, an optional list of typed `arguments` (each with name / description / required flag), and — when invoked — returns one or more messages (user/assistant) that the MCP client splices into the conversation. Some prompts are static templates ("draft a one-pager about X"); the more useful kind dynamically incorporates the values of the arguments and references the server's Tools and Resources by name in the message body, coaching the model to call them in a specific order.

### Why Prompts deserve a dedicated initiative

1. **They are workflow assets, not engineering plumbing.** Each prompt encodes a consulting playbook. The work is largely **content design** — what does a senior consultant actually do step-by-step on a comparable engagement? — which is a different competency from the schema/wrapper engineering of BL-031/031.5. Treating it as its own ticket lets the work be reviewed by people who understand the consulting motions, not just the code.

2. **Different ergonomics from Tools and Resources.** Tools and Resources are continuously available; the model decides when to use them. Prompts appear in the slash-command picker (Claude Desktop renders them as `/gst_*`) — the user explicitly opts into a workflow at a known starting point. Designing the menu (which prompts exist, how they are named, what arguments they take) is a UX decision that benefits from explicit treatment.

3. **They make the Tool+Resource surface legible.** Without Prompts, an analyst handed access to the MCP server has to read documentation to know what to do. With Prompts, the slash-menu IS the documentation: each entry is named after a recognizable consultant motion ("/gst_diligence_kickoff", "/gst_vdr_audit", "/gst_radar_brief_today"). The ramp-up from "I have access" to "I know what to do" collapses.

4. **They are a high-leverage proving ground for the consultant-as-prompt-engineer skill.** The hardest skill in agent-native consulting is not "writing prompts that work once" — it's "writing prompts that consistently produce client-grade output." BL-031.75 is where GST's senior consultants codify their judgment in reusable form. The prompts shipped here become the firm's training material, the basis for new-hire onboarding, and the seed for whatever paid-prompt-pack offering BL-033 might eventually monetize.

5. **Versioning matters more than for Tools or Resources.** A Tool's behavior is determined by its underlying engine. A Resource is a snapshot. A Prompt's behavior depends on its message body — and tweaking that body changes outputs for everyone using it. Prompt versioning, change-review discipline, and an "examples / golden outputs" testing pattern need explicit treatment, not retrofit.

### How clients surface and invoke Prompts

Prompts ride the same stdio transport as Tools and Resources (see [MCP_SERVER_ARCHITECTURE_BL-031.md § Discovery, connection, build, and deployment](MCP_SERVER_ARCHITECTURE_BL-031.md#discovery-connection-build-and-deployment)). What changes is who initiates the invocation and how the UI surfaces them:

| Client         | How Prompts appear                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Desktop | Slash-command picker in the chat input — typing `/` shows every prompt across every connected MCP server. The `gst_*` prefix groups GST's prompts visibly and avoids collisions with other servers' prompts                     |
| Claude Code    | Same slash-command picker; prompts appear alongside Claude Code's built-ins. The `gst_` prefix prevents collision with any future Claude Code slash command                                                                     |
| Cursor         | Command palette entries (Cmd+Shift+P or equivalent); prompts are user-invoked actions                                                                                                                                           |
| ChatGPT        | No prompts UI in the local stdio phase; Prompts become reachable via HTTP in [BL-032.5](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md), where ChatGPT's connector UI surfaces them as suggested actions on the connector card |

The wire calls are:

- `prompts/list` — returns each prompt's `name`, `description`, `arguments` schema, and `version`. Called once at session start
- `prompts/get { name, arguments }` — returns `{ messages: [...] }` — one or more user/assistant message bodies that the client splices into the active conversation. The model then sees those messages and continues from there

This is the fundamental difference from Tools and Resources: **Prompts are user-driven, not model-driven**. The model never decides to invoke a prompt; the user does, by selecting it from the slash-command picker. That is precisely why Prompts are the right primitive for "named consultant workflows" — they map cleanly to "this is the motion I want to start" rather than "this is a function the model might want to call mid-thought."

Required arguments appear in the picker as form fields the user fills before the prompt expands. Optional arguments can be omitted; the prompt body itself drives the conversation forward (the "interactive mode" pattern documented under [The prompt library — proposed surface](#the-prompt-library--proposed-surface)).

---

## The prompt library — proposed surface

The first cut of the prompt library covers GST's most repeated consulting motions. Each prompt orchestrates one or more Tools and Resources from BL-031 / BL-031.5. Names follow the convention `gst_<verb>_<object>` (snake*case, `gst*` prefix to avoid collision with other MCP servers' prompts in the slash menu).

| Prompt                            | Arguments                                                                                                          | Orchestrates                                                                                                                       | Purpose                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gst_diligence_kickoff`           | `{ targetName, transactionType, productType, techArchetype, headcount, revenueRange, growthStage, geographies[] }` | Tool: `generate_diligence_agenda` → Resource: `gst://library/vdr-structure` (referenced)                                           | Starter agenda for a new diligence engagement, framed in GST's house style with the VDR Structure Guide referenced for follow-up                    |
| `gst_target_quick_look`           | `{ targetName, productType, arr, stage, hqJurisdiction }`                                                          | Tools: `assess_infrastructure_cost_governance` (light variant), `compute_techpar`, `estimate_tech_debt_cost`, `search_regulations` | First-look brief — combines cost-governance maturity, TechPar benchmark, tech-debt range, and regulatory exposure into one digestible page          |
| `gst_comparable_engagements_memo` | `{ targetDescription, theme?, engagementCategory? }`                                                               | Tools: `search_portfolio` + `list_portfolio_facets` (for refinement)                                                               | Identifies 3–5 comparable past engagements, summarizes the relevant lesson from each, frames analogically for the current deal                      |
| `gst_regulatory_exposure_brief`   | `{ targetJurisdictions[], dataCategories[], productType }`                                                         | Tool: `search_regulations` → Resources: per-framework `gst://regulations/...`                                                      | Compiles applicable regulatory frameworks for a target's jurisdictional and data footprint, with summaries pulled directly from the resource bodies |
| `gst_vdr_audit`                   | `{ vdrInventory: string }` (free-text current folder list, or absent — see "interactive mode" below)               | Resource: `gst://library/vdr-structure`                                                                                            | Compares a target's actual VDR contents against the canonical 10-folder taxonomy; flags gaps and surfaces follow-up requests                        |
| `gst_architecture_layer_review`   | `{ targetSummary }`                                                                                                | Resource: `gst://library/business-architectures`                                                                                   | Walks the target through the 5-layer architecture framework (Software → Infrastructure → Data → Org → Industry) and surfaces architectural risks    |
| `gst_radar_brief_today`           | `{ category?, sinceHours? (default 24) }`                                                                          | Resource: `gst://radar/fyi/latest` (filtered)                                                                                      | Daily / pre-meeting digest of the most recent annotated radar items, summarized in the GST Take voice                                               |
| `gst_diligence_handoff_memo`      | `{ targetName, agendaJson? (else regenerate), comparablesJson? (else search) }`                                    | Tools: `generate_diligence_agenda`, `search_portfolio` → Resource: `gst://library/vdr-structure`                                   | Combines the agenda + comparable engagements + VDR follow-ups into a draft handoff memo for the deal team                                           |

**Interactive vs one-shot prompts.** Some prompts (e.g. `gst_vdr_audit`) are most valuable when the user can omit arguments and the prompt itself drives the conversation ("Paste your current VDR folder list, or tell me what's there"). MCP supports both modes — required vs optional arguments. The convention applied here:

- **Required arguments** = data the prompt cannot proceed without (e.g. `targetName`)
- **Optional arguments** = inputs the prompt can either accept directly OR ask for in-flow if absent

That distinction is documented per-prompt in the prompt's `description` so the slash-menu render is clear about expectations.

---

## Repo placement and lifecycle

Same answers as the predecessor docs: monorepo, same `mcp-server/` workspace. No repo split.

The new lifecycle wrinkle introduced by Prompts is **content drift**: each prompt's message body is a piece of authored content, not generated code. It has the same drift risk as any documentation — a senior consultant's framing evolves, but the prompt still references the old framing. Mitigations:

| Risk                                                                                                     | Mitigation                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt body falls out of sync with how senior consultants actually work                                  | Annual review cadence (calendar reminder); each prompt has a `lastReviewedAt` field in its source TS module; a Vitest test fails when any prompt's last review is over 12 months old        |
| Tweaking a prompt body silently changes outputs for all users                                            | Each prompt has a `version` field; non-trivial changes bump the version; a test asserts that the slash-menu lists every prompt's version                                                    |
| New analyst onboarding still requires senior-consultant pairing because prompts don't exist or are wrong | The prompts ARE the onboarding artifact; new-hire feedback ("the `target_quick_look` prompt was confusing on step 3") feeds directly into the next review cycle                             |
| Schema drift from arguments referencing Tool inputs that have moved on                                   | Argument schemas re-use the same Zod schemas as the underlying Tools (declared once in `mcp-server/src/schemas.ts`); CI fails if a prompt's argument Zod doesn't match the Tool's input Zod |

---

## Implementation Plan

### File layout (extends BL-031.5's `mcp-server/`)

```
mcp-server/
├── src/
│   ├── index.ts                    # +registerPrompts(server)
│   ├── tools/                      # (BL-031, BL-031.5 — unchanged)
│   ├── resources/                  # (BL-031.5 — unchanged)
│   ├── prompts/                    # NEW — one TS module per prompt
│   │   ├── _registry.ts            # central registration; iterates all prompts
│   │   ├── diligence-kickoff.ts
│   │   ├── target-quick-look.ts
│   │   ├── comparable-engagements-memo.ts
│   │   ├── regulatory-exposure-brief.ts
│   │   ├── vdr-audit.ts
│   │   ├── architecture-layer-review.ts
│   │   ├── radar-brief-today.ts
│   │   └── diligence-handoff-memo.ts
│   └── schemas.ts                  # +PromptArgument schemas (re-using Tool input shapes)
└── tests/
    ├── prompts/                    # NEW — one test file per prompt
    │   ├── diligence-kickoff.test.ts
    │   ├── ... (one per prompt)
    │   └── prompt-registry.test.ts # asserts version, lastReviewedAt invariants
    └── examples/                   # NEW — golden expected-output snapshots
        └── *.golden.md             # one per prompt, used in regression tests
```

### Per-prompt module shape

Every prompt module exports a standard interface:

```ts
// mcp-server/src/prompts/diligence-kickoff.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { DiligenceUserInputsSchema } from '../schemas.js';

export const diligenceKickoffPrompt = {
  name: 'gst_diligence_kickoff',
  description:
    'Generate a starter diligence agenda for a new engagement. Use at the kickoff of a buy-side or sell-side review.',
  version: '0.1.0',
  lastReviewedAt: '2026-04-25',
  argsSchema: DiligenceUserInputsSchema.extend({
    targetName: z.string().describe('Name of the target company (used in the memo header).'),
  }),
  build: (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            `You are advising on the diligence kickoff for ${args.targetName}. ` +
            `Use the \`generate_diligence_agenda\` tool with the parameters supplied. ` +
            `Then reference \`gst://library/vdr-structure\` to suggest VDR-folder follow-ups for each topic. ` +
            `Frame the result as a one-page memo in GST's house style: ` +
            `(1) target context paragraph, (2) prioritized agenda by topic, ` +
            `(3) attention areas, (4) suggested VDR requests.`,
        },
      },
    ],
  }),
};

export function registerDiligenceKickoffPrompt(server: McpServer) {
  server.registerPrompt(
    diligenceKickoffPrompt.name,
    {
      description: diligenceKickoffPrompt.description,
      argsSchema: diligenceKickoffPrompt.argsSchema,
    },
    diligenceKickoffPrompt.build
  );
}
```

This shape gives every prompt a uniform place to live — version, review date, schema, and message-builder — and lets `_registry.ts` iterate them generically.

### Critical files referenced (no modifications expected)

| File                                                                                                                                                                                                                     | Why                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [src/data/diligence-machine/wizard-config.ts](../../data/diligence-machine/wizard-config.ts)                                                                                                                             | Source enum lists for prompt argument schemas (re-imports through BL-031's schema layer) |
| [src/utils/diligence-engine.ts](../../utils/diligence-engine.ts), [techpar-engine.ts](../../utils/techpar-engine.ts), [icg-engine.ts](../../utils/icg-engine.ts), [tech-debt-engine.ts](../../utils/tech-debt-engine.ts) | Tools the prompts orchestrate (registered in BL-031 / BL-031.5)                          |
| [src/data/regulatory-map/](../../data/regulatory-map/)                                                                                                                                                                   | Regulation Resources the regulatory-exposure prompt references                           |
| Library articles                                                                                                                                                                                                         | Library Resources the VDR / architecture prompts reference                               |

### Verification (run before marking complete)

1. `cd mcp-server && npm run build && npm test` — green; includes prompt-registry invariant tests and per-prompt golden-output snapshot tests.
2. From repo root: `npx astro check && npm run lint && npm run lint:css && npm run test:run` — still green.
3. Restart the local MCP server, confirm Claude Desktop's slash-command picker lists every `gst_*` prompt with the expected description.
4. Invoke `/gst_diligence_kickoff` with a worked example, confirm: (a) the diligence-agenda Tool is called, (b) the VDR Structure Guide is referenced, (c) the resulting memo is one page, in GST's house style.
5. Same shape verification for `/gst_target_quick_look` (must call ICG + TechPar + Tech Debt + regulations search), `/gst_radar_brief_today` (must read FYI snapshot Resource), `/gst_vdr_audit` (must reference the Library Resource).
6. **Senior-consultant review.** A senior team member reads the output of each prompt against a representative example and signs off that the framing matches how they would brief the work themselves. This review is a **gating step**, not optional — the prompts exist to encode tacit consulting judgment, and that judgment is verified by the people who hold it.
7. Run a "fresh analyst" exercise: a team member who has never used the MCP server picks one prompt cold and produces a deliverable. Capture friction points; feed into the next review cycle.

### Risks & mitigations

| Risk                                                                     | Mitigation                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prompt outputs are unreliable across model versions                      | Maintain golden-output snapshots per prompt; on each Claude model upgrade, re-run the snapshot suite, review diffs, update if the new output is qualitatively better (and bump prompt `version`).                              |
| Slash-command name collisions with other MCP servers in a user's setup   | All prompts use the `gst_` prefix. Document this convention in the README and lint with a regex check in `prompts/_registry.ts`.                                                                                               |
| Argument schemas drift from the Tools they orchestrate                   | Every prompt's `argsSchema` re-uses (via Zod composition) the same source-of-truth schemas as the Tools. CI test asserts the shapes are still compatible.                                                                      |
| Prompts encode a single consultant's style; another consultant disagrees | Annual review cycle; explicit ownership per prompt (a `owner` field in the source module); disagreements get resolved at review, not by silent edit.                                                                           |
| Senior-consultant review is the bottleneck                               | Frame the review as 30 minutes per prompt at most. The prompts are short; the work is "would I send this to a client" judgment, not deep editing.                                                                              |
| Prompts that reference Resources / Tools become broken when those move   | Static analysis test: each prompt module declares what Tools and Resources it invokes (e.g. an `orchestrates: ['compute_techpar', 'gst://library/vdr-structure']` field); CI asserts each named Tool / Resource is registered. |

### Out of scope (deferred to BL-032 or later)

- Prompts that mutate state — all BL-031.75 prompts are read/derive only
- Per-client prompt customization (a client's white-labeled copy of `gst_diligence_kickoff` with their house style) — defer to BL-033 if a paying client asks
- A "prompt builder" UI on the website — not needed; authoring is text-editor work in `mcp-server/src/prompts/`
- Telemetry on which prompts get used most — would require BL-032's logging surface; the local-stdio context has no useful place to send this
- Localization — English only; revisit when GST signs a non-English-language client engagement

---

_Last updated: 2026-04-25_
