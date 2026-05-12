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
  '@modelcontextprotocol/sdk',
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
    js: '#!/usr/bin/env node',
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
