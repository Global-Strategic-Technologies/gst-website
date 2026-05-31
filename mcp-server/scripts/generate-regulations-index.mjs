// Pre-build codegen — scans the website data directories and emits TS modules
// with every dataset inlined as TS constants. Both vitest (which uses Vite,
// no `.md` text-loader by default) and esbuild's runtime bundle then consume
// plain TS imports — the same source-of-truth, no env-specific loader plumbing.
//
// Why codegen vs. runtime fs reads: Claude Desktop spawns the binary with
// `cwd = $HOME`, so cwd-relative reads break. Why codegen vs. 120 explicit
// imports: maintenance — adding/removing a regulation or article should not
// require editing the loader.
//
// `prebuild`, `pretypecheck`, and `pretest` all regenerate the outputs.
//
// The emitted output is piped through prettier (using the project's
// `.prettierrc.json`) before write, so post-regeneration `git status` is
// clean — the script's output round-trips byte-identically with the
// `lint-staged` hook's prettier pass. Without this, tracked-vs-regen
// whitespace drift made the generated files perpetually appear "modified."

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { format, resolveConfig } from 'prettier';

const here = dirname(fileURLToPath(import.meta.url));

// ─── Content-hash skip cache ─────────────────────────────────────────────────
//
// The script is invoked by `prebuild`, `pretypecheck`, AND `pretest` — so on
// a typical CI workflow it runs at least 3× per job, plus once per local
// `npm test` invocation. The work is deterministic (same inputs → identical
// outputs after prettier), so each rerun after the first is wasted I/O.
//
// Skip cache: compute a SHA-256 over (regulation JSONs + library MDs + this
// script + prettier config), compare against `.regen-cache.json` stored
// alongside the outputs. If matched and both outputs exist, exit early. If
// any input file is touched, the hash changes and we regenerate from
// scratch. Cache invalidation is automatic; no manual `clean` step needed.
//
// The cache file lives inside `mcp-server/src/content/` so it travels with
// the generated artifacts under a single output directory.

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function hashFile(path) {
  return sha256(readFileSync(path));
}

function listDirRecursive(dir) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const out = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listDirRecursive(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function computeInputHash() {
  const regulationsDir = resolve(here, '../../src/data/regulatory-map');
  const libraryDir = resolve(here, '../../src/data/library');
  const scriptPath = fileURLToPath(import.meta.url);
  const prettierConfigPath = resolve(here, '../../.prettierrc.json');

  const inputFiles = [
    ...listDirRecursive(regulationsDir),
    ...listDirRecursive(libraryDir),
    scriptPath,
  ];
  if (existsSync(prettierConfigPath)) inputFiles.push(prettierConfigPath);

  // Hash each input file independently then combine — order-insensitive
  // because we sort inside listDirRecursive.
  const combined = inputFiles.map((p) => `${p}:${hashFile(p)}`).join('\n');
  return sha256(Buffer.from(combined, 'utf8'));
}

const CACHE_FILE = resolve(here, '../src/content/.regen-cache.json');
const REGULATIONS_OUT = resolve(here, '../src/content/regulations-data.generated.ts');
const LIBRARY_OUT = resolve(here, '../src/content/library-data.generated.ts');

function tryReadCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function outputsExist() {
  return existsSync(REGULATIONS_OUT) && existsSync(LIBRARY_OUT);
}

{
  const inputHash = computeInputHash();
  const cached = tryReadCache();
  if (cached && cached.inputHash === inputHash && outputsExist()) {
    // Belt-and-braces: also verify outputs haven't been touched since the
    // cache was last written. If a contributor edited a generated file by
    // hand, the mtime will be newer than the cache file — force regen.
    const cacheStat = statSync(CACHE_FILE);
    const regulationsStat = statSync(REGULATIONS_OUT);
    const libraryStat = statSync(LIBRARY_OUT);
    if (
      regulationsStat.mtimeMs <= cacheStat.mtimeMs + 1000 &&
      libraryStat.mtimeMs <= cacheStat.mtimeMs + 1000
    ) {
      console.log(`[gst-mcp] regen skipped — inputs unchanged (hash ${inputHash.slice(0, 12)})`);
      process.exit(0);
    }
  }
  // No cache hit — full regen below. Cache is rewritten at the end.
  globalThis.__GST_REGEN_INPUT_HASH__ = inputHash;
}

/**
 * Format a string of TypeScript source with the project's prettier config
 * and write to disk. Identical input → identical output across machines as
 * long as `.prettierrc.json` is unchanged.
 */
async function writeFormatted(filePath, content) {
  const prettierConfig = await resolveConfig(filePath);
  const formatted = await format(content, {
    ...prettierConfig,
    parser: 'typescript',
    filepath: filePath,
  });
  writeFileSync(filePath, formatted, 'utf8');
}

// ─── Regulations ─────────────────────────────────────────────────────────────
{
  const sourceDir = resolve(here, '../../src/data/regulatory-map');
  const outFile = resolve(here, '../src/content/regulations-data.generated.ts');

  const files = readdirSync(sourceDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const records = files.map((file) => {
    const raw = readFileSync(resolve(sourceDir, file), 'utf8');
    return { file, parsed: JSON.parse(raw) };
  });

  mkdirSync(dirname(outFile), { recursive: true });

  const banner = [
    '// AUTO-GENERATED by scripts/generate-regulations-index.mjs.',
    '// Source: src/data/regulatory-map/*.json (regenerated on prebuild + pretest).',
    '// DO NOT EDIT BY HAND — your changes will be overwritten.',
    '',
    "import type { Regulation } from '../../../src/schemas/regulatory-map';",
    '',
    '/** Frozen list of all known regulatory frameworks, sorted by source filename. */',
    'export const REGULATIONS: ReadonlyArray<{ readonly file: string; readonly data: Regulation }> = [',
  ];

  const body = records.map(({ file, parsed }) => {
    const dataJson = JSON.stringify(parsed, null, 2)
      .split('\n')
      .map((line, idx) => (idx === 0 ? line : '    ' + line))
      .join('\n');
    return `  { file: ${JSON.stringify(file)}, data: ${dataJson} },`;
  });

  const content = [...banner, ...body, '];', ''].join('\n');
  await writeFormatted(outFile, content);
  console.log(`[gst-mcp] generated regulations-data.generated.ts (${records.length} frameworks)`);
}

// ─── Library articles ────────────────────────────────────────────────────────
{
  const sourceDir = resolve(here, '../../src/data/library');
  const outFile = resolve(here, '../src/content/library-data.generated.ts');

  // Each subdirectory of src/data/library/<slug>/ holds an article.md.
  const slugs = readdirSync(sourceDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const records = slugs
    .map((slug) => {
      const path = resolve(sourceDir, slug, 'article.md');
      try {
        // Normalize CRLF→LF so the generated TS string literals round-trip
        // identically across platforms. `core.autocrlf=true` on Windows
        // checks markdown out as CRLF; prettier's TS formatter doesn't
        // touch escape sequences inside string literals, so without this
        // the regenerator embeds `\r\n` on Windows and `\n` on CI, and
        // git-status churns between machines.
        const body = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
        return { slug, body };
      } catch {
        return null;
      }
    })
    .filter((r) => r !== null);

  mkdirSync(dirname(outFile), { recursive: true });

  const banner = [
    '// AUTO-GENERATED by scripts/generate-regulations-index.mjs (library section).',
    '// Source: src/data/library/<slug>/article.md (regenerated on prebuild + pretest).',
    '// DO NOT EDIT BY HAND — your changes will be overwritten.',
    '',
    '/** Library article bodies keyed by slug. */',
    'export const LIBRARY_BODIES: Readonly<Record<string, string>> = {',
  ];

  const body = records.map(({ slug, body }) => {
    // Use a JSON-encoded string to escape backticks, dollar signs, embedded quotes.
    return `  ${JSON.stringify(slug)}: ${JSON.stringify(body)},`;
  });

  const content = [...banner, ...body, '};', ''].join('\n');
  await writeFormatted(outFile, content);
  console.log(`[gst-mcp] generated library-data.generated.ts (${records.length} articles)`);
}

// Persist the input hash so the next invocation can short-circuit if nothing
// changed. Written LAST so a mid-script failure leaves the cache stale (next
// run regenerates fresh rather than skipping with a half-written output).
writeFileSync(
  CACHE_FILE,
  JSON.stringify(
    {
      inputHash: globalThis.__GST_REGEN_INPUT_HASH__,
      generatedAt: new Date().toISOString(),
    },
    null,
    2
  ) + '\n',
  'utf8'
);
console.log(
  `[gst-mcp] regen-cache updated (hash ${globalThis.__GST_REGEN_INPUT_HASH__.slice(0, 12)})`
);
