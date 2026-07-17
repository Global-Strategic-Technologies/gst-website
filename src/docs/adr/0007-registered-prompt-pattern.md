# ADR-0007: Registered prompts as the consultant-workflow surface

- **Status**: Accepted (2026-05-01)
- **Source initiative**: BL-031.75 (design doc archived at [`../development/_archive/MCP_SERVER_PROMPTS_BL-031_75.md`](../development/_archive/MCP_SERVER_PROMPTS_BL-031_75.md)); maintained pattern reference: [`mcp-server/src/docs/prompts/README.md`](../../../mcp-server/src/docs/prompts/README.md)

## Context

GST's repeatable consulting motions — diligence kickoffs, target quick-looks, comparable-engagement memos, regulatory briefs — lived nowhere durable. BL-031/031.5 had shipped the Tools and Resources those motions use, but the workflow knowledge itself ("call these tools in this order, frame the output this way") existed only in senior consultants' heads and per-analyst chat habits. Each motion needed a named, versioned, reviewable home that an analyst can invoke without reading documentation, and whose body changes are diffable and sign-off-gated, because a prompt's body IS firm IP: tweaking it changes outputs for everyone.

The candidate homes were: ad-hoc system-prompt/CLAUDE.md instructions per teammate, a shared snippets document to copy-paste from, or MCP's third primitive — registered Prompts served by the same server that already hosts the Tools and Resources.

## Decision

Consultant workflows ship as **registered MCP Prompts**: one small TS module per prompt under [`mcp-server/src/prompts/`](../../../mcp-server/src/prompts/), each satisfying the uniform `GstPrompt` shape ([`types.ts`](../../../mcp-server/src/prompts/types.ts)) and registered from the frozen `ALL_PROMPTS` array in [`_registry.ts`](../../../mcp-server/src/prompts/_registry.ts). Mechanics — the seven-field module shape, wire flow (`prompts/list` / `prompts/get`), test harness, authoring checklist — live in the pattern reference above and are not repeated here. The load-bearing choices:

- **User-initiated, not ambient.** Prompts appear in the client's `/` picker as `/gst_*`; the user explicitly opts into a workflow at a known starting point. The model never self-invokes one. This maps "which motion am I starting?" to an explicit UI action instead of instructions that fire on every conversation.
- **Typed args, composed schemas.** `argsSchema` is Zod, composed from the same source-of-truth schemas the orchestrated Tools use (`mcp-server/src/schemas.ts`) — the slash-menu form validates before the model sees anything, and tool-schema evolution propagates to prompts automatically.
- **Versions are public contract.** Each prompt carries a semver `version`; `tests/integration/manifest-stability.test.ts` folds every `name@version` tuple into the manifest hash checked against `mcp-server/BREAKING_CHANGES.md`, so a rename or unrecorded bump fails CI (semver-as-contract, same regime as Resource URIs).
- **`orchestrates` as drift detection.** Every prompt declares the Tool names + Resource URI schemes it coaches the model to use; the registry test asserts each entry resolves to a real registered surface, and per-prompt tests assert the body literally mentions each entry. Renaming a Tool without updating its orchestrating prompts breaks the build, naming the offender.

### The maturity bar

A prompt is not "done" when it renders — it is done when it consistently produces client-grade output. That bar is enforced, not aspirational: a golden-output snapshot per prompt in [`mcp-server/tests/examples/`](../../../mcp-server/tests/examples/) (`<slug>.golden.md`, frontmatter `promptName` / `version` / `recordedAt` / `model`), re-recorded and accept-or-reject diffed on each Claude model upgrade; **senior-consultant sign-off as the binding acceptance criterion** (the 2026-05-01 verification exercised all then-shipped prompts end-to-end in Claude Desktop, each output signed off as "reads as if I wrote it" — recorded in [`mcp-server/README.md`](../../../mcp-server/README.md) § "Last verified (BL-031.75 surface)"); and a `lastReviewedAt` freshness gate that fails Vitest (and server boot) when any prompt goes 12 months unreviewed. Prompt bodies are code: versioned, PR-reviewed, blameable in git.

### Why not the alternatives

- **Not ad-hoc per-teammate instructions** — every analyst's variant drifts independently; there is no version to compare, no test to fail on tool renames, no review cadence, and no way to say two analysts ran "the same prompt."
- **Not a shared snippets doc** — not machine-invocable: no typed argument form, no slash-menu discoverability, and copy-paste reintroduces the drift the pattern exists to kill. (The pattern doc also records why inline-in-`server.ts` and a DB/CMS lose: no test isolation at scale, and losing git as the audit trail.)
- **Not system-prompt injection** — ambient instructions fire without user intent on every conversation, tax every context window, and cannot represent "the user is starting motion X now with arguments Y." The Prompt primitive is user-driven by design; that is the fit.

## Consequences

- The library is now **9 prompts** (`ALL_PROMPTS`), inventoried with args/orchestrates in `mcp-server/README.md` § Prompts. Adding one is a closed-form operation (new module + array entry + copied unit test + golden file); registry, tests, and SDK glue stay constant-cost.
- Docs/tests that carry this decision: the pattern reference (`mcp-server/src/docs/prompts/README.md`, maintained mechanics), the golden files under `mcp-server/tests/examples/`, `tests/integration/prompts-registry.test.ts` (invariants), and `tests/integration/manifest-stability.test.ts` (version-in-hash discipline).
- The pattern absorbed heavy evolution without structural change: `gst_irl_ingestion` (renamed from `gst_diligence_sweep`, BL-045) has iterated to v0.21.x and gained build-seam instrumentation plus BL-079 cache pre-population as registry-level wrappers — its own companion doc lands in BL-088 PR 4. One prompt (`gst_vdr_audit`) was retired outright (BL-036), handled as the contract change it is.
- Accepted trade-offs: prompt quality is verified by human sign-off + snapshot diffing, not asserted by automated output scoring; golden files require a manual re-record pass per model upgrade; and the 12-month review gate can fail CI on an otherwise-untouched prompt — that forcing function is the point.
- ADR-0001's canonical stage taxonomy exists partly because these prompts orchestrate multiple tools — the prompt surface is the consumer that makes cross-tool vocabulary coherence matter.
