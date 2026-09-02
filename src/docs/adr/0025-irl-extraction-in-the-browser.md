# ADR-0025: IRL workbook extraction runs in the browser, not on the server

- **Status**: Accepted (2026-08-30)
- **Source initiative**: none — implemented directly. The gap was recorded in [ADR-0003](0003-irl-xlsx-canonicalization-hash-bind.md)'s closing note ("no backlog entry exists") and in `mcp-server/src/docs/testing/uat/UAT-11-irl-fill.md` § 11.3, which is titled "(repo access required)".

## Context

`/hub/mcp/advanced-operations/` publishes a five-step IRL round trip. Step 03 turns a filled workbook into the markdown `gst_irl_sweep` consumes, and it offered two ways to do it:

1. `npm -w @gst/mcp-server run irl:extract` — deterministic, reproducible from the same bytes, every row present.
2. Attach the workbook and let the model read it — the page said this "also works".

Path 1 required a checkout of a private repo. The page's own hero note assumes a working connector, not a repo, so its stated audience was routed onto path 2 by default. That path is a reconstruction: it varies run to run from identical bytes, and it degrades exactly where a real engagement's workbook is large. [ADR-0003](0003-irl-xlsx-canonicalization-hash-bind.md) § Context records the mechanism — bodies in the 60-80KB range exceed the model's emission ceiling and truncate.

So the defect was never "users are blocked". It was that **the reproducible half of the capability was gated behind a repo checkout**.

The obvious-looking fix — a server-side tool — is the one ADR-0003 already tried and reverted at 0.13.1. Its three re-engage triggers all depend on infrastructure nobody in this repo controls: an MCP binary-resource primitive, a Desktop attachment-to-host bridge, or a topology pivot. None have fired.

## Decision

**Run the conversion in the browser**, at `/hub/tools/information-request-list-extractor/`.

ADR-0003's blocking constraint is about workbook bytes reaching a _tool handler_. It does not reach a browser, which already holds the file the user picked. Consequently this needs no Worker route, no CSP allowlist entry, no upload path, no account, and none of ADR-0003's triggers. **This does not revive the deferred server-side design, and ADR-0003 stands unmodified** — it continues to govern the server-side question, which remains deferred on the same terms.

**The pure core moved workspaces.** `extractIrlMarkdownFromRows` had no runtime dependency on Node, but lived in a module that did (top-level `node:fs`/`node:path`, a `process.argv` read at module scope), so any non-Node importer died on the builtin or on `process is not defined`. It now lives at `src/utils/irl/extract-markdown.mjs`, imports nothing at all, and is consumed by both the browser page and the operator CLI. Reading the bytes stays with the caller because that is the genuinely runtime-specific step.

**Rejected: `.ts` for the shared core.** It would match its three siblings (`parse-article.ts`, `generate-xlsx.ts`, `customize-article.ts`), but the operator CLI is `node scripts/...` with no build step, and raw Node cannot import TypeScript without `--experimental-strip-types` — an experimental flag on a script the runbooks tell operators to run, gated on a Node minor (22.6+) that `engines: node >=22` does not guarantee. `.mjs` with a sibling `.d.mts` keeps every consumer working and reuses the pattern already in `mcp-server/tests/fixtures/radar-mock-data.mjs`. Cost: it is the first `.mjs` under `src/`, and `src/utils/**` is inside the vitest coverage include — both verified to behave before committing.

**Rejected: duplicating the conversion in the page.** The bullet grammar is a downstream contract (the server substring-matches the `# Information Request List — … (filled)` head shape, and the answer-span join has to stay byte-agreeing with `WORKBOOK_COLUMN_CONTRACT`). Two implementations would drift.

**Rejected: deleting the CLI.** It still serves operators with a checkout, the runbooks reference it, and it is the reference implementation the parity test measures the browser against.

## Consequences

- **The parity property is testable, and is tested.** `tests/unit/irl/extract-markdown-parity.test.ts` builds one filled workbook and reads the same bytes both ways — Node's `{type:'buffer'}` and the browser's `{type:'array'}` — asserting byte-identical markdown. Comparing the shared function to itself would be tautological; the two SheetJS read modes are what could actually drift.
- **Citing code**: `mcp-server/scripts/extract-irl-markdown.mjs` (module docstring) and `src/utils/irl/extract-markdown.mjs` (module docstring) both point here.
- **The blank-template and non-IRL cases are indistinguishable by row count**, because the reader falls back to the first sheet when `Information Request List` is absent. Both land on the zero-bullet path. The page names the sheet it read rather than inventing a distinction the extractor does not make.
- **The 57KB signal stays advisory** in both paths. Nothing fails server-side; only claude.ai web refuses a prompt argument that large. Do not turn it into an error, and do not add an output byte cap near this path.
- **The page's 15MB INPUT ceiling is a different axis, and does not contradict the line above.** That rule governs the markdown the extractor EMITS — capping it would silently truncate a deliverable. The page additionally refuses a source workbook larger than 15MB before handing it to SheetJS, because parsing is synchronous on the main thread and a very large file locks the tab with no way back. Input refusal is loud, reversible and loses nothing; output truncation is silent and lossy. Stated here because a later reader meeting only the sentence above would reasonably read the ceiling as a violation of it.
- **Accepted trade-off**: the page bundles `xlsx-js-style`, which was already a root dependency for the IRL generator page, so no new dependency and no new CSP surface.
- **Revisit trigger**: if any of ADR-0003's three triggers fires, the server-side path becomes reachable again and the two would need reconciling — this ADR does not pre-judge that, and the browser path would likely remain the better answer for anyone without a client that can deliver bytes.
