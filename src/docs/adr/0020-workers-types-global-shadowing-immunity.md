# ADR-0020: mcp-server is immune to workers-types global shadowing, so the toolchain floats

- **Status**: Accepted 2026-08-22 (BL-137, server 0.58.0)
- **Source initiative**: BL-137 (no separate design doc — the initiative was scoped and executed in one pass; the BACKLOG stanza it replaces is recoverable via `git log -- src/docs/development/BACKLOG.md`)

## Context

`mcp-server/src/worker.ts:1` carries `/// <reference types="@cloudflare/workers-types" />`. That directive loads the package's `index.d.ts`, which is a **global script**: every top-level `declare` in it lands in the global scope of the entire TypeScript program and beats `@types/node`.

From `@cloudflare/workers-types@5.20260807.2` that file added:

```ts
declare const Buffer: any;
declare const process: any;
declare const global: ServiceWorkerGlobalScope;
```

Six `Buffer.byteLength` calls and two `process.env` reads sit on the **Worker request path** (`cache/irl-body-cache.ts`, `lib/upstash-cache-store.ts`, `lib/irl-body-structure.ts`, `config.ts`). All of them silently became `any`. Nothing failed, because `any` never fails.

Two things made this worse than a local annoyance:

1. **It escaped the workspace.** The website's root program reaches mcp-server through `tests/integration/techpar-mcp-wizard-roundtrip.test.ts` → `tools/techpar.ts` → … → `import type { Env } from '../worker'`. Reference directives are program-wide, so that one edge dragged the global script into the **Astro** program too — 119 `mcp-server/src` files plus `index.d.ts`. `astro check` stayed green throughout.
2. **The directive cannot simply be deleted.** It is what makes `@types/node` stand down: `@types/node/web-globals/fetch.d.ts` gates every fetch global on `typeof globalThis extends { onmessage: any }`, and workers-types' `index.d.ts:17` is `declare var onmessage: never`, which satisfies that gate. Remove the directive and `ExportedHandler` is TS2304 while `Request`/`Response` revert to undici shapes. Separately, the `cloudflare:*` ambient modules are declared **only** in `index.d.ts`, and `@cloudflare/workers-oauth-provider`'s d.ts imports `WorkerEntrypoint` from `"cloudflare:workers"`.

The interim fix was exact version pins — `workers-types 5.20260804.1`, `wrangler 4.121.0` (coupled by wrangler's peer floor) — plus `ignore` entries in `.github/dependabot.yml`. They worked, and froze the repo out of the Cloudflare deploy toolchain indefinitely.

## Decision

**Remove the dependence rather than hold the versions.** Four parts, each mechanically enforced.

### 1. `Env` lives in `mcp-server/src/env.ts`, not `worker.ts`

`index.d.ts` has exactly one inbound edge — the directive in `worker.ts` — so evicting `worker.ts` from a program evicts the poison from it. The only thing the website needed from `worker.ts` was the `Env` type. Moving it severs the edge: the root program went from **119 `mcp-server/src` files + `index.d.ts`** to **26 files + no global script**.

`worker.ts` re-exports the type, so the ~40 mcp-server tests that import `Env` from `../../src/worker` are untouched (`mcp-server/tests` is not in the root program). `env.ts` takes `AuditEntry` from `./audit/entry` directly rather than the `./audit/_index` barrel, which re-exports the queue consumer and would pull the graph back in.

**Rejected: removing the directive**, for the two reasons in Context. **Rejected: splitting into project-referenced tsconfigs** (the pre-BL-137 candidate fix) — it was never shown to be impossible, but it makes `typecheck` a composite build and requires the build/test configs to agree with the split, which is far more machinery than one moved interface.

Eviction also strips ambient globals from mcp-server files that _remain_ in the root program, so five files carrying bare `Queue` / `ExecutionContext` / `MessageBatch` / `KVNamespace` were converted to scoped imports first — otherwise eviction would have traded silent `any` for loud TS2304.

### 2. Nothing in `mcp-server/src` uses `Buffer` or `process` as a global

- `src/lib/utf8-bytes.ts` provides `utf8ByteLength()`, a module-singleton `TextEncoder`. This **hoists an existing convention** rather than inventing one: `metrics/guard.ts` had already written a private copy with the comment "Workers-runtime + Node both expose `TextEncoder`; cheaper than `Buffer`". Byte-identity with `Buffer.byteLength(s, 'utf8')` is asserted against `node:buffer` as an independent oracle.
- The three `process` sites import from `node:process` **and annotate** — see Consequences, this is not optional.

### 3. Two ESLint rules, because one is not enough

`no-restricted-globals` **skips type positions by design**. Run alone over `tests/integration/oauth-flow.test.ts` — whose `function b64url(buf: Buffer)` was one of the originally-broken sites — it reports nothing. A `no-restricted-syntax` `TSTypeReference` selector covers those. Both are scoped to `mcp-server/src/**` and `mcp-server/tests/**`, and both were mutation-probed separately.

Consequently the three type-position sites were **retyped to `Uint8Array`** (Buffer's supertype, so callers are unaffected) rather than given imports: an import silences the value rule and leaves the type rule firing, which is the intended behaviour.

### 4. The allowlist test is what actually replaces the pin

`mcp-server/tests/integration/workers-types-globals.test.ts` parses the installed `index.d.ts` and keys on **the top-level declaration-name set, not the `any`-typed subset**. The harm class is _shadowing a `@types/node` global_, not the `any`: the pinned 5.20260804.1 already shipped `declare const console: Console`, `declare var Request`, `declare var Response` — all typed, all shadowing — and contained **zero** `declare const X: any` lines. A future `declare const process: { env: … }` would re-break `process.exit` while matching no `any`-keyed regex.

**This test is designed to fail on version bumps, and must be curated rather than regenerated or deleted.** Each added name is a question — does `@types/node` declare this globally too? — with three possible answers: add to the snapshot, add to `ACCEPTED_SHADOWS` with a written reason, or hold the bump.

Two scans, deliberately different in scope. The churny **snapshot** covers `declare …` statements only. The sharp **collision check** against `NODE_GLOBALS_AT_RISK` also scans the ~800 top-level `interface` / `type` declarations the file writes _without_ the keyword — equally global, and excluded from the snapshot only because an 800-name baseline gets regenerated rather than read. That split matters for one name in particular: the `NodeJS.Process` annotations below depend on the `NodeJS` namespace, so a future bare `namespace NodeJS { … }` has to be caught, and the snapshot alone would miss it.

It resolves the package subpath explicitly and asserts the installed version satisfies mcp-server's declared spec, because two copies exist (nested 5.x; root-hoisted 4.x via `agents → partyserver`) and the package ships no `main`/`types`/`exports` for `require.resolve` to work with. Without that, a hoist change would let it validate the v4 tree and pass vacuously.

## Consequences

**The pins are gone.** `^5.20260822.1` / `^4.125.0`, carets, and no `ignore` block in `.github/dependabot.yml`. The undici chain that DEVELOPER_TOOLING credited to the 4.121.0 pin is clear without it — measured on the **full tree**, which is the only measurement that can say anything about wrangler: it is a devDependency, so the enforced `--omit=dev` gate never evaluates it. The full tree carries 6 dev-only advisories, all `@lhci/cli → extract-zip`, with no `wrangler`/`miniflare`/`undici` entry. (The production gate is separately 0, as always.)

**Importing from `node:process` / `node:buffer` does NOT by itself restore `@types/node` typing.** This was measured during implementation and contradicts the obvious assumption:

- `@types/node/process.d.ts:139` declares `var process` inside `global { }` and then `export = process`. The module export **is** the global binding, which workers-types has redeclared as `any`. `import process from 'node:process'` therefore resolves to `any`, and `process.exit(1)` does not narrow to `never`.
- The same collision costs the global `interface Buffer` its **instance-method overloads**. `.toString('utf8')` is a TS2554 on anything carrying a real Buffer type — `inflateRawSync`'s return, for instance. A `BufferConstructor` annotation recovers the statics but not the instance side.

What survives is the **type-side** names: a global `const` cannot shadow a namespaced type. So `NodeJS.Process`, `BufferConstructor` and `BufferEncoding` all resolve correctly, and the fix is an explicit annotation:

```ts
import nodeProcess from 'node:process';
const process: NodeJS.Process = nodeProcess;
```

All three `process` sites (`config.ts`, `index.ts`, `tools/diligence.ts`) carry it. **Removing the annotation silently reverts them to `any`** — it is load-bearing, not decoration.

**Accepted limitation:** `Buffer` value imports inside mcp-server **tests** are still `any` under the current workers-types. This is not fully fixable while the upstream declaration collides — `BufferConstructor` annotations recover the statics, but the damaged instance interface then rejects `.toString('base64url')` in the OAuth test helpers. It is confined to test assertions, whose runtime behaviour the tests themselves verify. `mcp-server/src` reaches for neither global at all, which is the property the ESLint pair keeps true. **Revisit trigger:** if Cloudflare narrows those declarations, or `@types/node` stops exporting the global binding, re-measure with the probe described above and drop the annotations.

**Recorded holes** (no usage of either today): ESLint's type-node skip list also covers `TSTypeQuery` and `TSQualifiedName`, so `typeof process.env` escapes both rules; and `globalThis.process` / `globalThis.Buffer` escape them as well, being neither a restricted name nor a `TSTypeReference`. The second is the obvious workaround for anyone who hits the rule without reading its message.

**The ban and the allowlist are not mechanically coupled.** `ACCEPTED_SHADOWS` says each entry is inert because nothing uses the name bare — a claim the ESLint pair enforces — but deleting the ESLint block would leave `workers-types-globals.test.ts` passing green with all five shadows still accepted. The seam is defensible (the rules fail `npm run lint` while they exist, so the ban cannot rot silently) but it is a seam: **treat removing the ESLint block as invalidating every `ACCEPTED_SHADOWS` entry.**

**Code and docs that cite this decision** (keep current):

- `mcp-server/src/env.ts` — the module header is the long-form explanation
- `mcp-server/src/worker.ts:1` — the DO-NOT-REMOVE block on the reference directive
- `mcp-server/src/lib/utf8-bytes.ts`, `mcp-server/src/config.ts`, `mcp-server/src/index.ts`, `mcp-server/src/tools/diligence.ts`
- `eslint.config.mjs` — the BL-137 rule block
- `tests/integration/mcp-root-program-boundary.test.ts` (root workspace) — keeps `worker.ts` out of the website program
- `mcp-server/tests/integration/workers-types-globals.test.ts` — the allowlist
- [`DEVELOPER_TOOLING.md`](../development/DEVELOPER_TOOLING.md) — ESLint guard inventory
