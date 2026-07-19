/**
 * Documentation link & anchor integrity guard (BL-089).
 *
 * BL-088 deliberately made documentation cross-references load-bearing: code
 * comments and cross-doc links point at specific doc headings by `#anchor`, on
 * the assumption those anchors would be maintained. Nothing enforced that
 * assumption — a rename or a reworded heading could silently break a pointer and
 * no test would notice. This guard closes that gap.
 *
 * It verifies, across both documentation trees (`src/docs/**` and
 * `mcp-server/src/docs/**`, plus the root/mcp-server READMEs, `.claude/CLAUDE.md`
 * and the load-bearing `observability/slo-baselines.md`):
 *   1. every relative markdown link target resolves to a file/dir on disk, and
 *   2. every `#anchor` on a link to a `.md` file resolves to a real heading in
 *      that file (GitHub slug rules), and
 *   3. the load-bearing code-comment → doc `#anchor` citations still resolve.
 *
 * Intentional scope decisions:
 *   - `_archive/` docs are excluded as SCAN SOURCES (they are frozen point-in-time
 *     records whose own internal links may not resolve from their archived
 *     location — see `_archive/README.md`). They remain valid link TARGETS, so
 *     links *into* the archive (and their anchors) are still verified.
 *   - External URLs (`http(s)://`, `mailto:`) are skipped.
 *   - Links inside fenced code blocks are ignored (they are examples, not links).
 *
 * No markdown/slug library is a dependency of this repo (by design — see the
 * frontmatter parser in `contract-parity.test.ts`), so the GitHub slugifier is
 * hand-rolled below and unit-tested against real headings this repo depends on.
 *
 * To intentionally break one of these invariants (e.g. deliberately archive a
 * doc that is still linked), fix or remove the offending link in the same commit
 * — do not weaken this guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

/**
 * Git-tracked file set. Link targets are resolved against what the repo actually
 * contains — i.e. what CI and GitHub check out — NOT the local working tree,
 * which also holds gitignored files (e.g. `.claude/settings.local.json`). This
 * keeps local runs byte-identical to CI and makes target lookups case-sensitive
 * (matching Linux), so a link that only resolves on a case-insensitive dev FS is
 * still caught. Directories are "tracked" if they contain any tracked file.
 */
const TRACKED_FILES = new Set<string>();
const TRACKED_DIRS = new Set<string>();
for (const relPath of execSync('git ls-files', {
  cwd: REPO_ROOT,
  encoding: 'utf-8',
  maxBuffer: 64 * 1024 * 1024,
})
  .split('\n')
  .filter(Boolean)) {
  const abs = resolve(REPO_ROOT, relPath);
  TRACKED_FILES.add(abs);
  let dir = dirname(abs);
  while (dir.startsWith(REPO_ROOT) && !TRACKED_DIRS.has(dir)) {
    TRACKED_DIRS.add(dir);
    if (dir === REPO_ROOT) break;
    dir = dirname(dir);
  }
}
const isTrackedTarget = (abs: string): boolean => TRACKED_FILES.has(abs) || TRACKED_DIRS.has(abs);

// --- Scan set -------------------------------------------------------------

/** Directory trees whose `.md` files are scanned as link SOURCES. */
const DOC_ROOTS = ['src/docs', 'mcp-server/src/docs'];
/** Individual files scanned as link sources (outside the doc trees). */
const STANDALONE_DOCS = [
  'README.md',
  'mcp-server/README.md',
  '.claude/CLAUDE.md',
  'mcp-server/observability/slo-baselines.md',
];
/** Any path segment matching this is excluded as a scan source (still a valid target). */
const ARCHIVE_SEGMENT = /[\\/]_archive[\\/]/;

/**
 * Docs whose relative links are resolved from the REPO ROOT rather than the
 * file's own directory. `.claude/CLAUDE.md` is an agent-context file consumed by
 * the IDE, which resolves links workspace-root-relative (not GitHub-style
 * file-relative); the whole file follows that convention.
 */
const ROOT_RELATIVE_DOCS = new Set(['.claude/CLAUDE.md']);

/**
 * Link targets that are intentionally NOT tracked in git (gitignored,
 * per-developer files) but are still valid pointers for a local reader — the IDE
 * resolves them to the on-disk file. Repo-relative, forward slashes. Keep tiny;
 * only add a target you have confirmed is deliberately gitignored.
 */
const ALLOWED_UNTRACKED_TARGETS = new Set(['.claude/settings.local.json']);

/**
 * Load-bearing code-comment → doc citations that point at a doc by PATH ONLY
 * (no `#anchor`, so the auto-scan below cannot find them). Extend this list when
 * you point code at a doc by bare path. `#anchor` citations are discovered
 * automatically and do not belong here.
 */
const EXPLICIT_CODE_CITATIONS: ReadonlyArray<{ file: string; target: string }> = [
  // eslint.config.mjs's no-restricted-imports message points reviewers at ADR-0004.
  {
    file: 'eslint.config.mjs',
    target: 'src/docs/adr/0004-hub-surface-resources-import-restriction.md',
  },
];

/** Source globs scanned for `*.md#anchor` code→doc citations. */
const CODE_CITATION_DIRS = [
  'src',
  'mcp-server/src',
  'mcp-server/scripts',
  'mcp-server/observability',
];
const CODE_CITATION_EXTS = new Set(['.ts', '.tsx', '.mjs', '.cjs', '.js', '.astro']);

// --- GitHub heading slugifier --------------------------------------------

/**
 * Slugify a heading the way GitHub does for anchor ids: trim, lowercase, drop
 * every character that is not a letter, digit, space, underscore or hyphen
 * (this removes punctuation, `&`, backticks, parentheses and emoji — leaving the
 * spaces that surrounded them, which is why `&` yields a double hyphen), then
 * replace spaces with hyphens. Consecutive hyphens are preserved (not collapsed).
 */
function slugify(headingText: string): string {
  return headingText
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, '')
    .replace(/ /g, '-');
}

// --- Markdown parsing helpers --------------------------------------------

/** Split into lines, EOL-agnostic (repo docs are CRLF). */
function toLines(content: string): string[] {
  return content.split(/\r?\n/);
}

/** True for a fence-delimiter line (``` or ~~~, possibly indented / with info string). */
function fenceMarker(line: string): string | null {
  const m = line.trimStart().match(/^(```+|~~~+)/);
  return m ? m[1][0].repeat(3) : null;
}

/**
 * Collect the set of anchor slugs a markdown file exposes (its headings),
 * skipping YAML frontmatter and fenced code blocks. Duplicate headings get the
 * GitHub `-1`, `-2`… disambiguation suffix.
 */
function extractHeadingSlugs(content: string): Set<string> {
  const lines = toLines(content);
  const result = new Set<string>();
  const counts = new Map<string, number>();
  let i = 0;

  // Skip leading YAML frontmatter (`---` … `---`).
  if (lines[0] === '---') {
    i = 1;
    while (i < lines.length && lines[i] !== '---') i++;
    i++;
  }

  let inFence = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (fenceMarker(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (!m) continue;
    const base = slugify(m[2]);
    if (!base) continue;
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    result.add(n === 0 ? base : `${base}-${n}`);
  }
  return result;
}

interface Link {
  line: number; // 1-indexed
  target: string; // raw href (path and/or #fragment)
}

const LINK_RE = /(!?)\[[^\]]*\]\(\s*([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

/** Extract inline markdown links, skipping images and fenced code blocks. */
function extractLinks(content: string): Link[] {
  const links: Link[] = [];
  const lines = toLines(content);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fenceMarker(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // Strip inline code spans first — a `[View](...)` shown inside backticks is
    // illustrative prose, not a real link.
    const scanned = line.replace(/`[^`\n]*`/g, '');
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(scanned)) !== null) {
      if (m[1] === '!') continue; // image
      links.push({ line: i + 1, target: m[2] });
    }
  }
  return links;
}

// --- Resolver -------------------------------------------------------------

const EXTERNAL_RE = /^(https?:|mailto:|tel:|#!|\/\/)/i;

/** Cache of file → heading-slug set (target files are read on demand). */
const headingCache = new Map<string, Set<string>>();
function headingSlugsFor(absPath: string): Set<string> {
  let slugs = headingCache.get(absPath);
  if (!slugs) {
    slugs = extractHeadingSlugs(readFileSync(absPath, 'utf-8'));
    headingCache.set(absPath, slugs);
  }
  return slugs;
}

interface Failure {
  file: string; // repo-relative source
  line: number;
  target: string;
  reason: string;
}

/**
 * Resolve every link in `content` (which lives at `absFile`) and return the
 * failures. `ownSlugs` is injected so same-file `#fragment` links resolve
 * against this file's own headings without re-reading it.
 */
function checkLinks(
  absFile: string,
  content: string,
  relFile: string,
  // Whether a resolved target "exists". Real docs check the git-tracked set (so
  // local == CI); the fixture test injects `existsSync` for its temp files.
  targetExists: (abs: string) => boolean = isTrackedTarget
): Failure[] {
  const failures: Failure[] = [];
  const ownSlugs = extractHeadingSlugs(content);
  const baseDir = ROOT_RELATIVE_DOCS.has(relFile) ? REPO_ROOT : dirname(absFile);

  for (const { line, target } of extractLinks(content)) {
    if (EXTERNAL_RE.test(target)) continue;

    const hashIdx = target.indexOf('#');
    const pathPart = hashIdx === -1 ? target : target.slice(0, hashIdx);
    const fragment = hashIdx === -1 ? '' : target.slice(hashIdx + 1);

    // Same-file anchor.
    if (pathPart === '') {
      if (fragment && !ownSlugs.has(fragment)) {
        failures.push({
          file: relFile,
          line,
          target,
          reason: `no heading "#${fragment}" in this file`,
        });
      }
      continue;
    }

    const abs = resolve(baseDir, decodeURIComponent(pathPart));
    if (!targetExists(abs)) {
      if (!ALLOWED_UNTRACKED_TARGETS.has(rel(abs))) {
        failures.push({
          file: relFile,
          line,
          target,
          reason: `missing (untracked) target: ${pathPart}`,
        });
      }
      continue;
    }
    // Anchors only resolve into markdown files (present per the check above).
    if (fragment && extname(abs) === '.md') {
      if (!headingSlugsFor(abs).has(fragment)) {
        failures.push({
          file: relFile,
          line,
          target,
          reason: `no heading "#${fragment}" in ${pathPart}`,
        });
      }
    }
  }
  return failures;
}

// --- File walking ---------------------------------------------------------

function walkMarkdown(absDir: string, acc: string[]): void {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '_archive') continue;
      walkMarkdown(abs, acc);
    } else if (entry.isFile() && entry.name.endsWith('.md') && !ARCHIVE_SEGMENT.test(abs)) {
      acc.push(abs);
    }
  }
}

function scanSourceFiles(absDir: string, acc: string[]): void {
  if (!existsSync(absDir)) return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      scanSourceFiles(abs, acc);
    } else if (entry.isFile() && CODE_CITATION_EXTS.has(extname(entry.name))) {
      acc.push(abs);
    }
  }
}

function listScanSources(): string[] {
  const files: string[] = [];
  for (const root of DOC_ROOTS) walkMarkdown(resolve(REPO_ROOT, root), files);
  for (const rel of STANDALONE_DOCS) files.push(resolve(REPO_ROOT, rel));
  // Only tracked docs — an untracked local `.md` isn't part of the repo CI sees.
  return files.filter((f) => TRACKED_FILES.has(f));
}

function rel(abs: string): string {
  return abs.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
}

// --- Tests ----------------------------------------------------------------

describe('slugify (GitHub heading anchor rules)', () => {
  // Every case below is a real heading in this repo cited by an in-scope link.
  it.each([
    ['SLO baselines & targets', 'slo-baselines--targets'],
    ['Inoreader spend accounting', 'inoreader-spend-accounting'],
    ['Transport binding per tool (Q12)', 'transport-binding-per-tool-q12'],
    ['BL-031.85: MCP Server — Tool Input Contracts', 'bl-03185-mcp-server--tool-input-contracts'],
    ['Why this exists (use cases)', 'why-this-exists-use-cases'],
    [
      "12. ❌ Using `waitUntil: 'networkidle'` Under Parallel Worker Load",
      '12--using-waituntil-networkidle-under-parallel-worker-load',
    ],
  ])('slugifies %j → %j', (heading, expected) => {
    expect(slugify(heading)).toBe(expected);
  });

  it('disambiguates duplicate headings with -1, -2 …', () => {
    const slugs = extractHeadingSlugs('# Overview\n\n# Overview\n\n# Overview\n');
    expect(slugs.has('overview')).toBe(true);
    expect(slugs.has('overview-1')).toBe(true);
    expect(slugs.has('overview-2')).toBe(true);
  });
});

describe('resolver (fixture — red then green)', () => {
  it('passes valid links and flags broken file / broken anchor, ignoring code fences & external URLs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'doclink-'));
    try {
      writeFileSync(join(dir, 'target.md'), '# Real Heading\n\nbody\n', 'utf-8');
      const doc = [
        '# Doc',
        '',
        '[valid file+anchor](./target.md#real-heading)',
        '[valid same-file anchor](#doc)',
        '[external skipped](https://example.com/#nope)',
        '[broken file](./does-not-exist.md)',
        '[broken anchor](./target.md#missing-heading)',
        '',
        '```md',
        '[fenced example](./also-missing.md)',
        '```',
      ].join('\n');
      const docPath = join(dir, 'doc.md');
      writeFileSync(docPath, doc, 'utf-8');

      // Inject `existsSync` — the fixture's temp files aren't git-tracked.
      const failures = checkLinks(docPath, doc, 'doc.md', existsSync);
      const targets = failures.map((f) => f.target);

      expect(targets).toContain('./does-not-exist.md');
      expect(targets).toContain('./target.md#missing-heading');
      // valid links, external URL, and the fenced example must NOT be flagged.
      expect(targets).not.toContain('./target.md#real-heading');
      expect(targets).not.toContain('#doc');
      expect(targets).not.toContain('https://example.com/#nope');
      expect(targets).not.toContain('./also-missing.md');
      expect(failures).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('documentation link & anchor integrity (BL-089)', () => {
  it('every relative link and #anchor in the maintained docs resolves', () => {
    const sources = listScanSources();
    expect(sources.length).toBeGreaterThan(50); // sanity: scan set is populated

    const failures: Failure[] = [];
    for (const abs of sources) {
      failures.push(...checkLinks(abs, readFileSync(abs, 'utf-8'), rel(abs)));
    }

    if (failures.length > 0) {
      const report = failures
        .map((f) => `  ${f.file}:${f.line} → ${f.target}\n    ${f.reason}`)
        .join('\n');
      throw new Error(`${failures.length} broken documentation link(s)/anchor(s):\n${report}`);
    }
  });
});

describe('load-bearing code → doc citations (BL-089)', () => {
  it('every `*.md#anchor` cited from source code resolves to a real heading', () => {
    const sources: string[] = [];
    for (const dir of CODE_CITATION_DIRS) scanSourceFiles(resolve(REPO_ROOT, dir), sources);

    const CITE_RE = /([\w./\\-]+\.md)#([a-z0-9-]+)/g;
    const failures: string[] = [];

    for (const abs of sources.filter((a) => TRACKED_FILES.has(a))) {
      const content = readFileSync(abs, 'utf-8');
      CITE_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CITE_RE.exec(content)) !== null) {
        const [, pathPart, fragment] = m;
        // A citation may be written relative to the citing file OR to the repo root.
        const candidates = [
          resolve(dirname(abs), pathPart),
          resolve(REPO_ROOT, pathPart.replace(/\\/g, '/')),
        ];
        const targetAbs = candidates.find((c) => extname(c) === '.md' && TRACKED_FILES.has(c));
        if (!targetAbs) {
          failures.push(`${rel(abs)} → ${pathPart}#${fragment} (target file not found)`);
          continue;
        }
        if (!headingSlugsFor(targetAbs).has(fragment)) {
          failures.push(
            `${rel(abs)} → ${pathPart}#${fragment} (no such heading in ${rel(targetAbs)})`
          );
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} broken code→doc anchor citation(s):\n  ${failures.join('\n  ')}`
      );
    }
  });

  it('every load-bearing path-only code→doc citation points at an existing doc', () => {
    const failures = EXPLICIT_CODE_CITATIONS.filter(
      ({ target }) => !TRACKED_FILES.has(resolve(REPO_ROOT, target))
    ).map(({ file, target }) => `${file} → ${target} (missing)`);
    expect(failures, failures.join('\n')).toHaveLength(0);
  });
});
