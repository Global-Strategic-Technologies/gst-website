/**
 * Guard for the SQL embedded in `src/observability/alert-rules.ts` (BL-159).
 *
 * The dashboard guard next door pins panel SQL. This exists because scoping
 * that guard to `grafana-dashboard.json` missed the most expensive instance of
 * the same defect: `scope-mismatch-403-rate`, severity **page**, queried
 * `blob1 = 'tool_invocation' AND blob6 = '403'` — and nothing writes
 * `status_code` on `tool_invocation`. It reported a healthy `0 scope-mismatch
 * 403s` on `/status` for its entire life, which is the worst shape a
 * monitoring defect can take: the alert that cannot fire looks exactly like
 * the alert with nothing to report.
 *
 * An alert rule is a stronger case for this check than a panel, not a weaker
 * one — nobody looks at a rule that never fires.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EVENT_TYPES } from '../../../src/metrics/_schema';
import { GUARDED_COLUMNS, assertFieldEventTypeAgreement } from '../../helpers/ae-sql-guards';

const source = readFileSync(
  resolve(__dirname, '../../../src/observability/alert-rules.ts'),
  'utf-8'
);

/**
 * Every SQL string handed to `queryAe(`. These are template literals with an
 * interpolated dataset and window, so the extractor takes the backtick body
 * and leaves `${...}` in place — the checks below never look at those spans.
 */
// `(?:\/\/[^\n]*\n\s*)*` skips any full-line comments between the call and its
// template literal. Not incidental: the first version of this regex missed the
// `scope-mismatch-403-rate` query — the one rule this file exists for —
// because BL-159 added an explanatory comment there, and that comment contains
// backticks, so a laxer pattern would have captured comment prose as SQL.
// Caught by the count assertion below, which is the argument for having it.
const queries: string[] = [...source.matchAll(/queryAe\(\s*(?:\/\/[^\n]*\n\s*)*`([\s\S]*?)`/g)].map(
  (m) => m[1]
);

/**
 * Call-site count, asserted rather than assumed. Every rule below iterates
 * `queries`, so a regex that silently matched nothing would leave the whole
 * file green while checking not one thing — the same vacuity trap the
 * dashboard guard keeps a floor for. Bump this deliberately when a rule is
 * added or removed.
 */
// Four. `alert-rules.ts:117` also matches a `grep` for `queryAe(` but is the
// interface DECLARATION, not a call — which is how an earlier draft of this
// constant came to say 5.
const EXPECTED_QUERY_SITES = 4;

describe('alert-rules.ts — embedded AE SQL', () => {
  it('extracts every queryAe call site', () => {
    expect(queries.length, 'the queryAe extractor matched an unexpected number of sites').toBe(
      EXPECTED_QUERY_SITES
    );
    for (const sql of queries) expect(sql.trim()).not.toBe('');
  });

  it('filters on event types the schema declares', () => {
    const declared = new Set<string>(EVENT_TYPES);
    for (const sql of queries) {
      for (const [, literal] of sql.matchAll(/blob1\s*=\s*'([^']+)'/gi)) {
        expect(declared.has(literal), `alert SQL filters on unknown event type "${literal}"`).toBe(
          true
        );
      }
    }
  });

  it('never reads a field the queried event types do not write', () => {
    // THE BL-159 rule, and the reason this file exists. Shared with the
    // dashboard guard rather than reimplemented: this file's original copy
    // did not parse `blob1 IN (...)`, so an alert written in that shape would
    // have skipped the check without a word.
    expect(Object.keys(GUARDED_COLUMNS).length, 'no guarded columns resolved').toBeGreaterThan(0);
    for (const [i, sql] of queries.entries()) {
      assertFieldEventTypeAgreement(`alert query #${i + 1}`, sql);
    }
  });

  it('weights every aggregate by the sample interval', () => {
    // Same reasoning as the dashboard guard: AE samples, and an unweighted
    // count under-reports while looking perfectly reasonable — which on an
    // alert means a threshold that is quietly harder to cross than it reads.
    for (const sql of queries) {
      const countCalls = [...sql.matchAll(/\bcount\s*\(\s*(\w*)/gi)];
      for (const [, firstToken] of countCalls) {
        expect(
          firstToken.toUpperCase(),
          'alert SQL uses bare count() — use sum(_sample_interval)'
        ).toBe('DISTINCT');
      }
    }
  });
});
