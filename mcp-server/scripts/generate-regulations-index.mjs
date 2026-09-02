// Pre-build codegen — scans the website data directories and emits TS modules
// with every dataset inlined as TS constants. Both vitest (which uses Vite,
// no `.md` text-loader by default) and esbuild's runtime bundle then consume
// plain TS imports — the same source-of-truth, no env-specific loader plumbing.
//
// Why codegen vs. runtime fs reads: Claude Desktop spawns the binary with
// `cwd = $HOME`, so cwd-relative reads break. Why codegen vs. 123 explicit
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
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { format, resolveConfig } from 'prettier';

const here = dirname(fileURLToPath(import.meta.url));

// ─── --check mode ────────────────────────────────────────────────────────────
//
// Renders every output in memory and diffs it against what is on disk, instead
// of writing. Exits non-zero if any generated file does not match what its
// sources would produce right now.
//
// WHY: a generated bundle can be committed stale, and nothing announced it.
// Commit d4ceada6 shipped `library-data.generated.ts` whose embedded copy of
// `src/data/library/irl-tool-input-mapping/article.md` no longer matched the
// article — the pre-commit prettier hook reflowed a markdown table AFTER the
// codegen had run. The skip cache below then had no reason to regenerate.
// `tests/integration/mcp-generated-bundle-freshness.test.ts` (website
// workspace) spawns this mode.
//
// Running the REAL emitter rather than re-comparing embedded content is what
// makes this catch banner drift, prettier-config drift, and hand-edits of a
// generated file — none of which a content comparison can see.
const CHECK_MODE = process.argv.includes('--check');
/** Paths whose on-disk bytes differ from a fresh render (or are missing). */
const drifted = [];

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
  const irlDir = resolve(here, '../../src/data/irl');
  const scriptPath = fileURLToPath(import.meta.url);
  const prettierConfigPath = resolve(here, '../../.prettierrc.json');

  const inputFiles = [
    ...listDirRecursive(regulationsDir),
    ...listDirRecursive(libraryDir),
    ...(existsSync(irlDir) ? listDirRecursive(irlDir) : []),
    scriptPath,
  ];
  if (existsSync(prettierConfigPath)) inputFiles.push(prettierConfigPath);

  // Prettier's VERSION is an input too: the emitter renders through it, so an
  // upgrade can change output bytes while every file above is untouched.
  // Without this, `--check` would go red on all three bundles after a prettier
  // bump, on a REQUIRED check, reporting "drift" for a formatter upgrade — and
  // the obvious fixes would not work, because `pretest` / `pretypecheck` /
  // `build` would all hit the unchanged-hash early exit below and never
  // regenerate. The developer would have to know to delete a gitignored cache.
  //
  // The resolve() goes INSIDE the try, not beside an existsSync: a package
  // whose `exports` map does not expose the subpath throws
  // ERR_PACKAGE_PATH_NOT_EXPORTED at RESOLVE time, before any existsSync could
  // run. Prettier permits it today only via an `exports["./*"]` wildcard, which
  // is prettier's to revoke — and surviving a version bump is the whole point.
  // This function runs at the head of every prebuild/pretest/pretypecheck, so a
  // throw here would break every mcp-server build and test.
  try {
    const prettierManifest = createRequire(import.meta.url).resolve('prettier/package.json');
    if (existsSync(prettierManifest)) inputFiles.push(prettierManifest);
  } catch (err) {
    // Never silent: dropping this input restores exactly the trap it closes, on
    // the very event it exists to survive, and a silent skip would leave that
    // to be inferred later from a mystery drift failure.
    console.warn(
      `[gst-mcp] WARNING: prettier version excluded from the regen input hash ` +
        `(${err.code ?? err.message}). A prettier upgrade will no longer invalidate ` +
        `the cache; delete mcp-server/src/content/.regen-cache.json after bumping it.`
    );
  }

  // Hash each input file independently then combine — order-insensitive
  // because we sort inside listDirRecursive.
  const combined = inputFiles.map((p) => `${p}:${hashFile(p)}`).join('\n');
  return sha256(Buffer.from(combined, 'utf8'));
}

const CACHE_FILE = resolve(here, '../src/content/.regen-cache.json');
const REGULATIONS_OUT = resolve(here, '../src/content/regulations-data.generated.ts');
const LIBRARY_OUT = resolve(here, '../src/content/library-data.generated.ts');
const IRL_SOURCE_OUT = resolve(here, '../src/content/irl-source-data.generated.ts');

function tryReadCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function outputsExist() {
  return existsSync(REGULATIONS_OUT) && existsSync(LIBRARY_OUT) && existsSync(IRL_SOURCE_OUT);
}

{
  const inputHash = computeInputHash();
  const cached = tryReadCache();
  // `--check` must ALWAYS render: a cache hit is precisely the state in which a
  // stale bundle survives unnoticed, so short-circuiting here would make the
  // check pass on the one case it exists to catch.
  if (!CHECK_MODE && cached && cached.inputHash === inputHash && outputsExist()) {
    // Belt-and-braces: also verify outputs haven't been touched since the
    // cache was last written. If a contributor edited a generated file by
    // hand, the mtime will be newer than the cache file — force regen.
    const cacheStat = statSync(CACHE_FILE);
    const regulationsStat = statSync(REGULATIONS_OUT);
    const libraryStat = statSync(LIBRARY_OUT);
    const irlSourceStat = statSync(IRL_SOURCE_OUT);
    if (
      regulationsStat.mtimeMs <= cacheStat.mtimeMs + 1000 &&
      libraryStat.mtimeMs <= cacheStat.mtimeMs + 1000 &&
      irlSourceStat.mtimeMs <= cacheStat.mtimeMs + 1000
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
  if (CHECK_MODE) {
    // A missing output is drift with its own message, not an ENOENT stack
    // trace — the script already treats absent outputs as a real state
    // (`outputsExist()` above).
    if (!existsSync(filePath)) {
      drifted.push({ path: filePath, reason: 'generated file is missing' });
    } else if (readFileSync(filePath, 'utf8') !== formatted) {
      drifted.push({ path: filePath, reason: 'on-disk bytes differ from a fresh render' });
    }
    return;
  }
  writeFileSync(filePath, formatted, 'utf8');
}

/** `mkdirSync` is a disk write; under --check the output dir must not be created. */
function ensureDir(dir) {
  // If the directory is genuinely absent, --check should report "outputs
  // missing" via writeFormatted, not create it and then report three drifts.
  if (!CHECK_MODE) mkdirSync(dir, { recursive: true });
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

  // BL-073 — detect duplicate normalized aliases across entries.
  // `findMatchedHubFramework` in compose-dossier-envelope.ts returns the
  // FIRST canonical-name match, so a duplicate alias would silently mask
  // the second entry. Fail loudly at codegen time before the runtime
  // matcher can mis-attribute a match.
  const aliasOwner = new Map(); // normalizedAlias → file that owns it
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const { file, parsed } of records) {
    for (const a of parsed.aliases ?? []) {
      const k = normalize(a);
      if (aliasOwner.has(k)) {
        throw new Error(
          `BL-073 alias collision: normalized alias "${k}" appears in both ` +
            `${aliasOwner.get(k)} and ${file}. Aliases must be unique across entries.`
        );
      }
      aliasOwner.set(k, file);
    }
  }

  ensureDir(dirname(outFile));

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
  if (!CHECK_MODE)
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
        // identically across platforms. Belt-and-braces since `.gitattributes`
        // began forcing `eol=lf` repo-wide — it still protects a stale clone
        // checked out before that rule. Historically `core.autocrlf=true` on
        // Windows checked markdown out as CRLF; prettier's TS formatter doesn't
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

  ensureDir(dirname(outFile));

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
  if (!CHECK_MODE)
    console.log(`[gst-mcp] generated library-data.generated.ts (${records.length} articles)`);
}

// ─── IRL generator source ────────────────────────────────────────────────────
//
// The machine-parsed source for the IRL .xlsx generators, DELIBERATELY decoupled
// from the library article: the IRL tool + prompt read this snapshot; the
// `gst://library/information-request-list` Resource reads the library article
// (src/data/library/information-request-list/article.md). The two may diverge.
{
  const sourcePath = resolve(here, '../../src/data/irl/information-request-list.md');
  const outFile = IRL_SOURCE_OUT;

  // CRLF→LF normalize so the emitted TS string literal round-trips identically
  // across platforms (same rationale as the library block above).
  const body = readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');

  ensureDir(dirname(outFile));

  const content = [
    '// AUTO-GENERATED by scripts/generate-regulations-index.mjs (IRL source section).',
    '// Source: src/data/irl/information-request-list.md (regenerated on prebuild + pretest).',
    '// DO NOT EDIT BY HAND — your changes will be overwritten.',
    '',
    '/** Canonical IRL generator source markdown (parsed by parseIrlArticle). */',
    `export const IRL_SOURCE_BODY: string = ${JSON.stringify(body)};`,
    '',
  ].join('\n');
  await writeFormatted(outFile, content);
  if (!CHECK_MODE) console.log('[gst-mcp] generated irl-source-data.generated.ts');
}

if (CHECK_MODE) {
  // No cache write: --check must leave the tree exactly as it found it, and
  // stamping the cache would additionally let a LATER run skip a regen it owes.
  if (drifted.length > 0) {
    console.error('[gst-mcp] generated files are STALE — they do not match their sources:\n');
    for (const { path, reason } of drifted) console.error(`  ${path}\n    ${reason}`);
    console.error(
      '\nRegenerate with:  node mcp-server/scripts/generate-regulations-index.mjs' +
        '\n(or any mcp-server build/test, whose pre-hooks run it), then commit the result.\n' +
        'If you just bumped prettier and every file above is listed, that is a formatter\n' +
        'upgrade rather than content drift — regenerate and commit the reformatted bytes.'
    );
    process.exitCode = 1;
  } else {
    console.log('[gst-mcp] --check: all 3 generated files match their sources');
  }
} else {
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
}
