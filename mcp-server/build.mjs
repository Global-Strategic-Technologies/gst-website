// esbuild driver for the GST MCP server.
//
// Why esbuild and not plain tsc?
//   The website source we re-use (src/schemas/*, src/utils/*, src/data/*) uses
//   bundler-style extensionless imports — fine for Astro, fatal under raw
//   Node ESM. esbuild bundles the whole import graph into a single JS file so
//   the runtime never has to resolve extensions itself.
//
// Type-checking still runs via `tsc --noEmit` — see package.json scripts.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8'));

const externals = [
  // Keep MCP SDK + native deps external — they ship as installed npm packages.
  //
  // BOTH the bare specifier and the subpath wildcard are listed on purpose.
  // esbuild matches externals by exact specifier unless a `*` is present, so a
  // bare entry alone would externalize `@modelcontextprotocol/server` while
  // BUNDLING `@modelcontextprotocol/server/stdio` — leaving two copies of the
  // SDK in one process, with `instanceof` checks failing across the boundary.
  // (The pre-BL-106 list carried only the bare `@modelcontextprotocol/sdk` and
  // therefore externalized nothing at all: every import of it was a subpath.)
  '@modelcontextprotocol/server',
  '@modelcontextprotocol/server/*',
  '@cfworker/json-schema',
  'zod',
];

await build({
  entryPoints: [resolve(here, 'src/index.ts')],
  outfile: resolve(here, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: externals,
  sourcemap: true,
  minify: false,
  banner: {
    // Shim a CJS-style `require` into the ESM bundle. Some CJS deps that
    // get inlined (e.g. `xlsx-js-style`) do dynamic `require('stream')`
    // at module-load time; without this shim, esbuild's default ESM
    // emit replaces those calls with a stub that throws
    // "Dynamic require of 'X' is not supported" at runtime. Surfaced by
    // the "Smoke test compiled binary" CI step (2026-05-25) when
    // `xlsx-js-style` was added for cell-style write support. The Worker
    // build (wrangler) bundles independently and isn't affected.
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __gstCreateRequire } from 'node:module';",
      'const require = __gstCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'info',
});

// Make the bundle executable so `npx gst-mcp` / direct `node` calls both work.
chmodSync(resolve(here, 'dist/index.js'), 0o755);

// Drop a tiny package.json into dist so Node treats it as ESM regardless of
// any future package.json field changes.
writeFileSync(
  resolve(here, 'dist/package.json'),
  JSON.stringify({ type: 'module', name: pkg.name, version: pkg.version }, null, 2)
);

console.log(`[gst-mcp] built dist/index.js (v${pkg.version})`);
