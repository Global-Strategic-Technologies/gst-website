/**
 * The workflow hand parsers, driven over synthetic fixtures — including YAML shapes this repo
 * does not currently contain.
 *
 * **This file exists because two other verification methods both passed over a real fail-open.**
 * `helpers/workflow-parse.ts` was validated by (a) a differential against the real `yaml` parser
 * across all 12 workflows and (b) a nine-case mutation matrix against the live tree. Both came
 * back clean while `parseTriggerBranches` would still adopt the NEXT trigger's list if a
 * `branches:` value were written in block-sequence form — because neither method can see a shape
 * the repo does not happen to use today. Code review found it by writing the shape.
 *
 * So the discipline here is the complement of the differential, not a duplicate of it: **drive
 * the throw paths, with inputs chosen for what the parser must REFUSE** rather than for what the
 * repo currently contains. `workflow-secret-scope.test.ts` catalogues ten fail-open defects in
 * this same problem domain; every one of them was a parser quietly returning a partial answer
 * where it should have refused. A parser that returns `[]` cannot be told from one that found
 * nothing to return, and every assertion built on it is then green by construction.
 *
 * Add a case here for any parsing rule added to the helper. "The differential passes" is not
 * evidence about shapes the differential never saw.
 */
import { describe, it, expect } from 'vitest';
import {
  parsePathBlocks,
  parsePathBlocksIfAny,
  parseWorkflowName,
  parseTriggerBranches,
  parseWorkflowRunWorkflows,
} from './helpers/workflow-parse';

const lines = (s: string): string[] => s.split('\n');

describe('workflow parsers refuse what they cannot read', () => {
  describe('parseTriggerBranches', () => {
    // The exact fixture that reproduces the shipped-and-caught fail-open. `push` has NO master
    // and is written as a block sequence; `pull_request` below it has `[master]`. An unbounded
    // reader walks past the push trigger, finds the pull_request `]`, and reports ['master'] —
    // the assertion guarding "push still reaches master" then passes over a broken invariant.
    const blockSeqThenFlowSeq = `
on:
  push:
    branches:
      - dev
      - 'feat/**'
    paths:
      - 'src/**'
  pull_request:
    branches: [master]
`;

    it('THROWS on a block-sequence value rather than borrowing the next trigger list', () => {
      expect(() => parseTriggerBranches(lines(blockSeqThenFlowSeq), 'push', 'fixture')).toThrow(
        /not a flow sequence/
      );
    });

    it('the borrowed value would have been `master` — the fail-open this refuses', () => {
      // Positive control: the neighbour really does carry the value that made the bug silent.
      // Without this, the throw above could be passing for an unrelated reason.
      expect(parseTriggerBranches(lines(blockSeqThenFlowSeq), 'pull_request', 'fixture')).toEqual([
        'master',
      ]);
    });

    it('reads an inline flow sequence', () => {
      const src = `
on:
  push:
    branches: [master, 'feat/**']
`;
      expect(parseTriggerBranches(lines(src), 'push', 'fixture')).toEqual(['master', 'feat/**']);
    });

    it('reads a flow sequence that Prettier has reflowed across lines', () => {
      // `.github/**` is not in `.prettierignore` and `printWidth` is 100, so this happens on a
      // routine branch-family addition. Single-line anchoring would silently match nothing.
      const src = `
on:
  push:
    branches:
      [master, dev, 'feat/**', 'fix/**', 'feature/**', 'dependabot/**', 'docs/**',
        'chore/**']
`;
      expect(parseTriggerBranches(lines(src), 'push', 'fixture')).toEqual([
        'master',
        'dev',
        'feat/**',
        'fix/**',
        'feature/**',
        'dependabot/**',
        'docs/**',
        'chore/**',
      ]);
    });

    it('scopes to the requested trigger when several carry `branches:`', () => {
      const src = `
on:
  push:
    branches: [dev]
  pull_request:
    branches: [master]
`;
      expect(parseTriggerBranches(lines(src), 'push', 'fixture')).toEqual(['dev']);
      expect(parseTriggerBranches(lines(src), 'pull_request', 'fixture')).toEqual(['master']);
    });

    it('THROWS when the trigger has no `branches:` at all', () => {
      const src = `
on:
  push:
    paths:
      - 'src/**'
`;
      expect(() => parseTriggerBranches(lines(src), 'push', 'fixture')).toThrow(/found 0/);
    });

    it('THROWS on an unterminated flow sequence', () => {
      const src = `
on:
  push:
    branches: [master, 'feat/**'
`;
      expect(() => parseTriggerBranches(lines(src), 'push', 'fixture')).toThrow(/unterminated/);
    });

    it('THROWS rather than borrowing a neighbour `]` to close an open FLOW sequence', () => {
      // The flow-form sibling of the block-form bug. The `]` that would close this list lives
      // in the next trigger; only the trigger bound stops the reader reaching it. Nothing else
      // pinned that bound, so it is pinned here.
      const src = `
on:
  push:
    branches: [master, 'feat/**'
  pull_request:
    branches: [dev]
`;
      expect(() => parseTriggerBranches(lines(src), 'push', 'fixture')).toThrow(/unterminated/);
    });

    it('THROWS on a duplicated trigger rather than picking one list', () => {
      const src = `
on:
  push:
    branches: [master]
  push:
    branches: [dev]
`;
      expect(() => parseTriggerBranches(lines(src), 'push', 'fixture')).toThrow(/found 2/);
    });

    it('tolerates trailing comments and treats quoted and bare scalars alike', () => {
      const src = `
on:
  # a comment line
  push:
    branches: ['master', dev]
`;
      expect(parseTriggerBranches(lines(src), 'push', 'fixture')).toEqual(['master', 'dev']);
    });
  });

  describe('parseWorkflowName', () => {
    it('reads the column-0 name, not a job or step name', () => {
      const src = `
name: MCP Server Test Suite
jobs:
  test:
    name: Typecheck, Build & Test
    steps:
      - name: Checkout code
`;
      expect(parseWorkflowName(lines(src), 'fixture')).toBe('MCP Server Test Suite');
    });

    it('tolerates a trailing comment', () => {
      expect(parseWorkflowName(lines('name: Foo # note'), 'fixture')).toBe('Foo');
    });

    it('THROWS when there is no column-0 name', () => {
      expect(() =>
        parseWorkflowName(lines('jobs:\n  test:\n    name: Only A Job'), 'fixture')
      ).toThrow(/found 0/);
    });

    it('THROWS on two column-0 names rather than picking one', () => {
      expect(() => parseWorkflowName(lines('name: A\nname: B'), 'fixture')).toThrow(/found 2/);
    });
  });

  describe('parseWorkflowRunWorkflows', () => {
    it('reads the chained workflow names', () => {
      const src = `
on:
  workflow_run:
    workflows: ['MCP Server Test Suite']
`;
      expect(parseWorkflowRunWorkflows(lines(src), 'fixture')).toEqual(['MCP Server Test Suite']);
    });

    it('ignores the same literal inside a comment', () => {
      // `deploy-mcp-production.yml` quotes this exact line in prose. Matching it would assert
      // the deploy chain against a comment.
      const src = `
#   5. \`workflows: ['MCP Server Test Suite']\` is a literal string match
on:
  workflow_run:
    workflows: ['Real Name']
`;
      expect(parseWorkflowRunWorkflows(lines(src), 'fixture')).toEqual(['Real Name']);
    });

    it('THROWS when absent', () => {
      expect(() => parseWorkflowRunWorkflows(lines('on:\n  push:\n'), 'fixture')).toThrow(
        /found 0/
      );
    });

    it('THROWS on two lists rather than picking one', () => {
      const src = `
on:
  workflow_run:
    workflows: ['A']
    workflows: ['B']
`;
      expect(() => parseWorkflowRunWorkflows(lines(src), 'fixture')).toThrow(/found 2/);
    });
  });

  describe('parsePathBlocksIfAny', () => {
    // This is the rule the fail-open-fixing commit ADDED, and it was the one rule with no
    // synthetic-fixture coverage — verified only by a live-tree mutation, the method that
    // commit argues is insufficient. Closing that is the point of this block.
    it('THROWS on an inline `paths:` rather than reporting "no paths filter"', () => {
      // The fail-open shape: classified as unfiltered, so its entries — including a stale
      // workflow filename — never reach the caller's existence check.
      const src = `
on:
  push:
    paths: ['mcp-server/**', '.github/workflows/DOES-NOT-EXIST.yml']
`;
      expect(() => parsePathBlocksIfAny(lines(src), 'fixture')).toThrow(/inline `paths:` value/);
    });

    it('THROWS when block and inline forms are mixed across triggers', () => {
      const src = `
on:
  push:
    paths:
      - 'a/**'
  pull_request:
    paths: ['b/**']
`;
      expect(() => parsePathBlocksIfAny(lines(src), 'fixture')).toThrow(/inline `paths:` value/);
    });

    it('returns [] for a workflow that genuinely has no `paths:` filter', () => {
      // The tolerance this function exists for — 9 of the 12 real workflows are this shape.
      expect(
        parsePathBlocksIfAny(lines('on:\n  push:\n    branches: [master]\n'), 'fixture')
      ).toEqual([]);
    });

    it('ignores `paths-ignore:`, which is a different key', () => {
      const src = `
on:
  push:
    paths-ignore:
      - 'docs/**'
`;
      expect(parsePathBlocksIfAny(lines(src), 'fixture')).toEqual([]);
    });

    it('reads block form normally when present', () => {
      const src = `
on:
  push:
    paths:
      - 'a/**'
`;
      expect(parsePathBlocksIfAny(lines(src), 'fixture')).toEqual([['a/**']]);
    });
  });

  describe('parsePathBlocks', () => {
    it('returns every block, in order', () => {
      const src = `
on:
  push:
    paths:
      - 'a/**'
      - 'b/**'
  pull_request:
    paths:
      - 'a/**'
`;
      expect(parsePathBlocks(lines(src), 'fixture')).toEqual([['a/**', 'b/**'], ['a/**']]);
    });

    it('THROWS on an unparseable list item rather than truncating the block', () => {
      // Truncation is the dangerous outcome: a subset assertion then passes on the entries the
      // parser silently dropped.
      const src = `
on:
  push:
    paths:
      - 'a/**'
      - "b/**"
`;
      expect(() => parsePathBlocks(lines(src), 'fixture')).toThrow(/unparseable list item/);
    });

    it('THROWS when there is no block at all', () => {
      expect(() => parsePathBlocks(lines('on:\n  push:\n'), 'fixture')).toThrow(/no 4-space/);
    });

    it('skips comments and blank lines inside a block', () => {
      const src = `
on:
  push:
    paths:
      - 'a/**'
      # a note

      - 'b/**'
`;
      expect(parsePathBlocks(lines(src), 'fixture')).toEqual([['a/**', 'b/**']]);
    });
  });
});
