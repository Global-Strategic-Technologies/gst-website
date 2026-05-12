# MCP Prompts — Architecture Reference

> **Audience**: anyone authoring or modifying a prompt under `mcp-server/src/prompts/`.
>
> **Companion docs**:
>
> - [`mcp-server/README.md`](../../../README.md) § "Prompts" — user-facing inventory (slash menu, args, examples).
> - [`src/docs/development/MCP_SERVER_PROMPTS_BL-031_75.md`](../../../../src/docs/development/MCP_SERVER_PROMPTS_BL-031_75.md) — the planning artifact (commit phasing, file lists, AC).
>
> This doc is the durable conceptual reference — it explains the registered-prompt pattern itself.

---

## The pattern in one sentence

A "registered prompt" is a **typed, versioned macro** that the user invokes from Claude Desktop's slash menu — it expands into one or more pre-written messages that get spliced into the conversation, and those messages are designed to coach the model into calling specific Tools and reading specific Resources in a specific order.

Think of each prompt as a recipe card the model reads at the start of a workflow: "When the user invokes me, here are the steps you should take, and here are the exact Tool names and Resource URIs to reach for."

---

## How it works mechanically — four moving parts

### Part 1: Each prompt is a small self-contained module

A file like [`mcp-server/src/prompts/diligence-kickoff.ts`](../../prompts/diligence-kickoff.ts) exports a single object with a uniform shape:

```ts
{
  name: 'gst_diligence_kickoff',
  description: 'Generate a starter diligence agenda...',
  version: '0.1.0',
  lastReviewedAt: '2026-04-29',
  orchestrates: ['generate_diligence_agenda', 'gst://library/vdr-structure'],
  argsSchema: UserInputsSchema.extend({ targetName: z.string().min(1) }),
  build: (args) => ({ messages: [...] })
}
```

Every prompt module has the same seven fields, defined by the `GstPrompt<TArgs>` interface in [`types.ts`](../../prompts/types.ts). That uniformity is the foundation — it lets the rest of the system treat prompts generically.

What each field does:

| Field            | Purpose                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | What the user types (`/gst_diligence_kickoff`). Must match `/^gst_[a-z][a-z_]*$/`.                                                                             |
| `description`    | Renders next to the name in the slash-menu picker.                                                                                                             |
| `version`        | Bumped on non-trivial body changes so two analysts running "the same prompt" at different times can compare.                                                   |
| `lastReviewedAt` | When a senior consultant last signed off on the body. Vitest fails when older than 12 months.                                                                  |
| `orchestrates`   | Manifest of every Tool name + Resource URI scheme this prompt expects the model to use. Two purposes: docs at a glance, and drift detection.                   |
| `argsSchema`     | Zod schema describing the slash-menu form fields. Composes from existing `mcp-server/src/schemas.ts` source-of-truth schemas — no per-prompt schema authoring. |
| `build(args)`    | Pure function: parsed args → messages spliced into the conversation.                                                                                           |

### Part 2: A central registry imports them all

[`_registry.ts`](../../prompts/_registry.ts) imports every prompt module and puts them in a frozen array:

```ts
export const ALL_PROMPTS = [
  diligenceKickoffPrompt,
  targetQuickLookPrompt,
  // ...
];

export function registerPrompts(server: McpServer) {
  for (const prompt of ALL_PROMPTS) {
    assertPromptInvariants(prompt);
    server.registerPrompt(
      prompt.name,
      { description: prompt.description, argsSchema: prompt.argsSchema },
      prompt.build
    );
  }
}
```

`registerPrompts(server)` is called once at server boot from [`server.ts`](../../server.ts), alongside `registerDiligenceTool(server)`, `registerLibraryResources(server)`, etc. It's a peer concern, not a special primitive.

`assertPromptInvariants` runs at module-load time — fail-fast on naming / version / freshness / orchestrates violations rather than silently degrading at runtime.

### Part 3: The MCP SDK + transport handle the wire-protocol plumbing

You don't write any networking code. The SDK's `server.registerPrompt(...)` hooks into two MCP wire calls:

- **`prompts/list`** — when Claude Desktop connects, it asks "what prompts do you have?" The SDK responds with `name`, `description`, `argsSchema` for every registered prompt. Desktop renders them in the slash-menu picker.
- **`prompts/get`** — when the user invokes one (types `/gst_diligence_kickoff`, fills the form, hits enter), Desktop sends the args. The SDK validates against the prompt's `argsSchema`, runs your `build(args)` function, and ships the resulting `{ messages: [...] }` back over stdio.

Desktop then splices those messages into the active conversation, and the model proceeds.

### Part 4: A small set of tests holds the whole thing together

The tests are **generic** — they don't grow when prompts are added:

1. **Per-prompt unit test** ([`tests/unit/prompts/<slug>.test.ts`](../../../tests/unit/prompts/) — one per prompt, copy-paste shape) — asserts `argsSchema` parses representative payloads + rejects malformed ones, `build()` returns ≥ 1 message, and the message text contains every entry from the `orchestrates` field as a literal string.

2. **Registry invariant test** ([`tests/integration/prompts-registry.test.ts`](../../../tests/integration/prompts-registry.test.ts) — one file, never changes) — for every entry in `ALL_PROMPTS`: name uniqueness, name/version/freshness invariants pass, every `orchestrates` entry resolves to either a registered Tool name or a known Resource URI scheme prefix.

3. **Golden-output snapshot test** ([`tests/integration/golden-snapshots.test.ts`](../../../tests/integration/golden-snapshots.test.ts) — one per prompt) — captures a worked example invocation in `tests/examples/<slug>.golden.md` with frontmatter (`promptName`, `version`, `recordedAt`, `model`). On Claude model upgrades, re-run, diff, accept-or-reject changes.

The registry test is the most important: **it makes drift impossible**. If someone renames a Tool in BL-032 but forgets to update the prompt that orchestrates it, the registry test fails on the next CI run, naming the offender.

---

## Why this beats the obvious alternatives

| Alternative                                | Why it fails                                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Markdown files + manual copy-paste**     | What consulting firms have today. No slash-menu integration, no typed arguments, no version tracking, no review cadence, every analyst's variant drifts.                                                    |
| **Hardcode prompts inline in `server.ts`** | Works for two prompts. Painful at eight. Every change requires editing one giant file. No place to attach metadata. No test isolation.                                                                      |
| **Database / CMS**                         | Looks fancier. You've added an external dependency and lost git as the audit trail. The body of a prompt IS the firm's IP — keeping it in source control means it's reviewable in PRs, diffable, blameable. |

The registry pattern threads the needle: each prompt is a small file (clean isolation), the shape is uniform (no per-prompt special-cases), git is the audit trail, the SDK does the protocol work, and the tests catch drift mechanically.

---

## Why it scales

Three reasons, in order of importance:

1. **Adding a prompt is a closed-form operation.** Write one new TS file in `prompts/` + add one entry to `ALL_PROMPTS`. You don't touch the registry logic, the server, the SDK, or any other prompt. The cost of the 9th prompt is the same as the cost of the 2nd.

2. **The invariants don't get heavier as the system grows.** The registry test runs the same 4 checks against 8 prompts that it runs against 80. Adding a prompt doesn't add a test case anywhere except its own per-prompt unit test.

3. **Schemas compose from existing source-of-truth.** A prompt's `argsSchema` is built from the same Zod schemas the underlying Tools already use — `UserInputsSchema` for diligence, `TechParInputsSchema` for TechPar, etc. When a Tool's input schema evolves, every prompt that composes from it picks up the change automatically.

The combination is what makes this approach durable: **the only thing that grows linearly with prompts is the prompts themselves.** Everything else — registry, tests, schema layer, SDK glue — is constant-cost.

---

## End-to-end trace: `/gst_diligence_kickoff`

The system from your keystroke to the model's first response:

1. **You type `/`** in Claude Desktop. Desktop has already called `prompts/list` on every connected MCP server at session start, so it has the GST server's eight prompt names + descriptions + argsSchemas cached. It renders the picker.

2. **You select `gst_diligence_kickoff`.** Desktop renders a form: `targetName` (required text), `transactionType` (dropdown of valid enum values from the argsSchema), all 13 other fields. You fill it in.

3. **You hit enter.** Desktop ships a `prompts/get` request over stdio: `{ name: 'gst_diligence_kickoff', arguments: { targetName: 'Acme', ... } }`.

4. **The SDK on the GST server side** receives the request, validates the arguments against the prompt's `argsSchema` (rejects with a clean error if anything's malformed), and calls your registered `build(args)` function.

5. **`build(args)` returns** `{ messages: [{ role: 'user', content: { type: 'text', text: '...' } }] }`. The text is constructed from the args.

6. **The SDK ships the messages back** over stdio. Desktop splices them into your active conversation. From the model's perspective, it just received a user message saying "do these things."

7. **The model now executes the workflow.** It sees `generate_diligence_agenda` mentioned by name — it's also a registered Tool on this same server, so the model calls it. It sees `gst://library/vdr-structure` — it's a Resource URI on this server, so the model reads it. It assembles the brief, frames it per the prompt's instructions, and replies.

The prompt itself is **passive infrastructure** — a templated message body. All the actual work is the model doing what the message body told it to do. The pattern's elegance is that it's not adding new model capabilities; it's just packaging and naming workflow knowledge so the model gets it on demand instead of relying on the analyst remembering the recipe.

---

## Authoring a new prompt — checklist

1. **Pick a name** matching `gst_<verb>_<object>` (e.g. `gst_audit_security_posture`).
2. **Pick the `orchestrates` set** — which Tools / Resources will the model use?
3. **Pick the argsSchema** — compose from existing schemas in [`mcp-server/src/schemas.ts`](../../schemas.ts) where possible. Add Zod's `.describe(...)` strings for any optional / interactive arguments.
4. **Author the body** — instruction-style. Number the steps. Mention every `orchestrates` entry as a literal string in the body (the regex test asserts this).
5. **Set `version: '0.1.0'`** (initial) and `lastReviewedAt: '<today's date>'`.
6. **Register it** — add the import + array entry in [`_registry.ts`](../../prompts/_registry.ts).
7. **Write the unit test** — copy [`tests/unit/prompts/diligence-kickoff.test.ts`](../../../tests/unit/prompts/diligence-kickoff.test.ts) and adapt.
8. **Write the golden file** — `tests/examples/<slug>.golden.md` with frontmatter (`promptName`, `version`, `recordedAt`, `model`).
9. **Run `npm test`** — registry-invariant + per-prompt + golden-existence checks all pass.
10. **Live-exercise it** — restart Claude Desktop, invoke from the slash menu, capture the recorded output for the README's "Last verified" stanza.

---

_Last updated: 2026-04-30_
