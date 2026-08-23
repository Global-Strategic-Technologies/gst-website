/**
 * Runtime configuration for the GST MCP server.
 *
 * `HUB_BASE` is the absolute origin where the website is reachable. Used
 * by Tool wrappers to build deep-links back to populated Hub-tool pages
 * (Tech Debt, ICG, Regulatory Map). Defaults to the production origin;
 * override with `GST_HUB_BASE=http://localhost:4321` (or similar) when
 * exercising deep-links against a dev server.
 */

// Default import, not `import { env }`: `@types/node/process.d.ts` ends in
// `export = process`, so the named form does not exist. Value import, not
// `import type` — `nodejs_compat` in wrangler.toml and `platform: 'node'` in
// build.mjs mean this resolves at runtime in both transports, exactly as
// `node:crypto` already does in `schemas/compose-dossier-envelope.ts`.
//
// The `NodeJS.Process` annotation is load-bearing. `export = process` exports
// the GLOBAL `var process`, and workers-types' global script (loaded
// program-wide by `worker.ts`'s reference directive) redeclares that name as
// `declare const process: any` — so the bare import is `any` and `process.env`
// below would be unchecked. Annotating with the namespaced TYPE, which no
// global `const` can shadow, restores it. See ADR-0020.
import nodeProcess from 'node:process';
const process: NodeJS.Process = nodeProcess;

export const HUB_BASE: string = process.env.GST_HUB_BASE ?? 'https://globalstrategic.tech';
