/**
 * Published tool-count parity guard (origin: `ece6e738`, 2026-08-28 — no BL id).
 *
 * Four documents publish how many tools the MCP server has, on THREE different
 * bases, and until this guard existed only one of the three figures was under
 * test:
 *
 *   18  stdio registrations, deprecated alias included   ARCHITECTURE.md
 *   17  distinct stdio tools, alias excluded             BREAKING_CHANGES.md
 *   16  the remote Worker surface                        EXPECTED_REMOTE_TOOL_COUNT
 *
 * All three are correct. The Worker omits `search_radar_offline` and its
 * deprecated `search_radar_cache` alias because both reach `node:fs` at module
 * load (`mcp-server/src/tools/_local-only.ts`); that is the entire delta.
 *
 * WHY THIS EXISTS: resolving an apparent contradiction between those numbers
 * took reading `protocol-roundtrip.test.ts`'s asserted roster, `server.ts`'s
 * registrar list, `_local-only.ts`, and `git log -L` on a ledger line —
 * because no sentence said which surface it counted. `ece6e738` fixed the
 * prose. Nothing stopped the next edit from desynchronising them again.
 *
 * That is not hypothetical. `mcp-server/src/docs/testing/README.md:14` records
 * that its own count had drifted for many releases before BL-112 corrected it:
 * documented prior rot of precisely this kind, in a file this guard now binds.
 *
 * WHAT IT DOES NOT COVER, so the next audit does not re-derive it:
 * `mcp-server/README.md` also publishes `### Resources (~129)` and
 * `### Prompts (12)`. Both are counts of the same character, and the helper
 * already exposes `resourceInventory()` and `EXPECTED_PROMPT_COUNT` for them.
 * Out of scope for a TOOL-count guard; a deliberate gap, not an oversight.
 *
 * To intentionally stop publishing one of these figures, delete its row and say
 * in the commit which surface stopped being described.
 */
import { describe, expect, it } from 'vitest';
import {
  read,
  registeredToolNames,
  SERVER_PATH,
  LOCAL_ONLY_PATH,
  EXPECTED_REMOTE_TOOL_COUNT,
} from './helpers/mcp-registry';

const remote = registeredToolNames(SERVER_PATH);
const stdioOnly = registeredToolNames(LOCAL_ONLY_PATH);
const stdio = [...new Set([...remote, ...stdioOnly])];

/**
 * Written out with its reason rather than derived.
 *
 * Deriving it (matching a `register*Alias` call, say) would make the ledger
 * assertion a tautology: the code would be checked against itself. This states
 * the intent — "one name in the stdio set is an alias of another tool, and the
 * ledger's basis excludes it" — and the guard checks the code against THAT.
 * Same idiom, and the same reason, as `EXPECTED_EXCLUDED` in
 * `mcp-server/tests/integration/irl-evidence-precedence-clause.test.ts`.
 */
const DEPRECATED_ALIASES = ['search_radar_cache'];

const ledgerCount = stdio.filter((name) => !DEPRECATED_ALIASES.includes(name)).length;

/**
 * One row per published figure.
 *
 * Every pattern was copied FROM THE FILE and verified at `=== 1`, never
 * transcribed from a plan or a review — five of the ten carry markdown emphasis
 * that prettier normalises, and one was mis-transcribed during design review
 * (`_registrations_`, not `*registrations*`, because the pre-commit hook
 * rewrote the emphasis after it was authored). The review is not a trusted
 * source for these strings either; the file is.
 *
 * Each captures the digits so a failure reports "expected 18, found 19" rather
 * than only "pattern absent".
 */
const PUBLISHED: { file: string; label: string; pattern: RegExp; expected: number }[] = [
  {
    file: 'mcp-server/src/docs/ARCHITECTURE.md',
    label: 'ARCHITECTURE — "N registered tools" (stdio)',
    pattern: /(\d+) registered tools/g,
    expected: stdio.length,
  },
  {
    file: 'mcp-server/src/docs/ARCHITECTURE.md',
    label: 'ARCHITECTURE — "That N is the stdio surface"',
    pattern: /That (\d+) is the \*\*stdio\*\* surface/g,
    expected: stdio.length,
  },
  {
    file: 'mcp-server/src/docs/ARCHITECTURE.md',
    label: 'ARCHITECTURE — "remote Worker publishes N"',
    pattern: /remote Worker publishes (\d+)/g,
    expected: remote.length,
  },
  {
    file: 'mcp-server/BREAKING_CHANGES.md',
    // If this row goes red, the same sentence carries the ledger series
    // "has held to its own basis since 15 → 16 → 17" — history, deliberately
    // unguarded, but it must be extended in the same edit.
    label: 'BREAKING_CHANGES — "**N** tool names" (stdio minus the deprecated alias)',
    pattern: /\*\*(\d+)\*\* tool names/g,
    expected: ledgerCount,
  },
  {
    file: 'mcp-server/BREAKING_CHANGES.md',
    label: 'BREAKING_CHANGES — "**N** stdio registrations"',
    pattern: /\*\*(\d+)\*\* stdio _registrations_/g,
    expected: stdio.length,
  },
  {
    file: 'mcp-server/BREAKING_CHANGES.md',
    label: 'BREAKING_CHANGES — "**N** on the remote Worker"',
    pattern: /\*\*(\d+)\*\* on the \*\*remote Worker\*\*/g,
    expected: remote.length,
  },
  {
    file: 'mcp-server/README.md',
    label: 'server README — Tools heading "(N total;"',
    pattern: /\((\d+) total;/g,
    expected: stdio.length,
  },
  {
    file: 'mcp-server/README.md',
    label: 'server README — Tools heading "N on the Worker"',
    pattern: /(\d+) on the Worker/g,
    expected: remote.length,
  },
  {
    file: 'mcp-server/src/docs/testing/README.md',
    label: 'testing README — "**N tools**"',
    pattern: /\*\*(\d+) tools\*\*/g,
    expected: stdio.length,
  },
  {
    file: 'mcp-server/src/docs/testing/README.md',
    label: 'testing README — "N on the Worker"',
    pattern: /(\d+) on the Worker/g,
    expected: remote.length,
  },
];

describe('published tool counts — extraction sanity', () => {
  // Vacuity guards run FIRST. Every assertion below would pass over an empty
  // set, and this repo has shipped that failure twice (BL-124 bypassed Zod
  // entirely; BL-125's enum walk threw on all 60 fields into a swallowing
  // catch). A guard is not trusted until it has been seen to fail.
  it('reads the remote tool set from server source', () => {
    expect(remote).toHaveLength(EXPECTED_REMOTE_TOOL_COUNT);
  });

  it('reads a non-empty stdio-only tool set', () => {
    expect(stdioOnly.length).toBeGreaterThan(0);
  });

  it('registers every name listed as a deprecated alias', () => {
    // Without this, emptying or misspelling DEPRECATED_ALIASES would silently
    // turn the ledger row into a copy of the stdio row.
    expect(DEPRECATED_ALIASES.length).toBeGreaterThan(0);
    for (const alias of DEPRECATED_ALIASES) {
      expect(stdioOnly, `${alias} is not registered — is the alias gone?`).toContain(alias);
    }
  });

  it('derives three distinct figures', () => {
    // The whole point is that these differ. If they ever collapse, the rows
    // below stop discriminating and the guard silently weakens.
    expect(new Set([remote.length, ledgerCount, stdio.length]).size).toBe(3);
  });
});

describe('published tool counts — doc parity', () => {
  it.each(PUBLISHED.map((row) => [row.label, row] as const))('%s', (_label, row) => {
    const matches = [...read(row.file).matchAll(row.pattern)];

    // Exactly once, asserted BEFORE the value. A pattern that matched nothing
    // would otherwise pass over an empty array. A reworded sentence therefore
    // fails loudly, which is correct: a reworded count claim needs re-checking,
    // not silent skipping.
    expect(
      matches.length,
      `${row.file}: expected exactly one match for ${row.pattern}, found ${matches.length}. ` +
        `If the sentence was reworded, update this row's pattern and re-confirm the count it states.`
    ).toBe(1);

    expect(
      Number(matches[0][1]),
      `${row.file} publishes a tool count that no longer matches the registry.`
    ).toBe(row.expected);
  });
});
